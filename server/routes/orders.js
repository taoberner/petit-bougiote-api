const express    = require('express');
const router     = express.Router();
const stripe     = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db         = require('../db');
const { notifyDriver } = require('../notifications');
const crypto     = require('crypto');
const logger     = require('../logger');
const validators = require('../validators');

// SSE clients (dashboard iPad)
const sseClients = new Set();

function broadcastOrder(order) {
  const data = `data: ${JSON.stringify(formatOrder(order))}\n\n`;
  sseClients.forEach(res => res.write(data));
}

// SSE — dashboard iPad s'abonne ici
router.get('/events', async (req, res) => {
  res.set({
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(': connected\n\n');
  sseClients.add(res);

  // Envoyer les commandes "paid" existantes dès la connexion
  const paid = await db.listByStatus('paid');
  paid.forEach(o => {
    res.write(`data: ${JSON.stringify(formatOrder(o))}\n\n`);
  });

  // Heartbeat toutes les 25s pour garder la connexion vivante
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  req.on('close', () => {
    sseClients.delete(res);
    clearInterval(heartbeat);
  });
});

// Créer une commande + session Stripe Checkout
router.post('/', async (req, res) => {
  try {
    // Validation Joi
    const { error: joiError, value: body } = validators.createOrder.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (joiError) {
      const details = joiError.details.map(d => d.message).join(', ');
      logger.info('Commande rejetée — validation échouée', { details, ip: req.ip });
      return res.status(400).json({ error: details });
    }

    const restaurantOpen = await db.status.get();
    if (!restaurantOpen.open) {
      logger.info('Commande rejetée — restaurant fermé', { customer: body.customer });
      return res.status(503).json({ error: 'Le restaurant est actuellement fermé. Les commandes ne sont pas acceptées.' });
    }

    const { customer, phone, address, items, note } = body;

    const total   = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const orderId = crypto.randomUUID();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: items.map(item => ({
        price_data: {
          currency: 'eur',
          product_data: { name: item.name },
          unit_amount: item.price,
        },
        quantity: item.qty,
      })),
      metadata: { order_id: orderId },
      success_url: `${process.env.BASE_URL}/commander-merci.html?order=${orderId}`,
      cancel_url:  `${process.env.BASE_URL}/le-petit-bougiote/commander.html`,
    });

    await db.insert({
      id: orderId,
      status: 'pending',
      customer, phone, address,
      items: JSON.stringify(items),
      total,
      note: note || '',
      stripe_session_id: session.id,
      stripe_payment_intent: null,
    });

    logger.info('Commande créée', { orderId: orderId.slice(0, 8).toUpperCase(), customer, total });
    res.json({ url: session.url });
  } catch (err) {
    logger.error('Erreur création commande', { message: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

// Lister toutes les commandes (dashboard)
router.get('/', async (req, res) => {
  const orders = await db.list();
  res.json(orders.map(formatOrder));
});

// Valider → WhatsApp livreur
router.post('/:id/validate', async (req, res) => {
  logger.info('Validation demandée', { orderId: req.params.id });
  const order = await db.get(req.params.id);
  if (!order) {
    logger.info('Commande introuvable', { orderId: req.params.id });
    return res.status(404).json({ error: 'Commande introuvable' });
  }
  logger.info('Statut actuel de la commande', { orderId: req.params.id, status: order.status });
  if (order.status !== 'paid') return res.status(400).json({ error: 'Commande non payée — statut actuel : ' + order.status });

  const updated = await db.update(order.id, { status: 'validated' });

  broadcastOrder(updated);
  res.json({ ok: true });

  notifyDriver(updated)
    .then(() => logger.info('WhatsApp envoyé au livreur', { orderId: order.id.slice(0, 8).toUpperCase() }))
    .catch(e => logger.error('Erreur envoi WhatsApp', { message: e.message, code: e.code || '' }));
});

// Refuser → remboursement Stripe automatique
router.post('/:id/reject', async (req, res) => {
  const order = await db.get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  if (order.status !== 'paid') return res.status(400).json({ error: 'Commande non payée' });

  if (order.stripe_payment_intent) {
    try {
      await stripe.refunds.create({ payment_intent: order.stripe_payment_intent });
    } catch (e) {
      logger.error('Erreur remboursement Stripe', { message: e.message, orderId: req.params.id });
    }
  }

  const updated = await db.update(order.id, { status: 'rejected' });
  broadcastOrder(updated);
  res.json({ ok: true });
});

function formatOrder(o) {
  const items = typeof o.items === 'string' ? JSON.parse(o.items) : (o.items || []);
  return {
    ...o,
    items,
    total_eur: ((o.total || 0) / 100).toFixed(2).replace('.', ','),
  };
}

module.exports = { router, broadcastOrder };
