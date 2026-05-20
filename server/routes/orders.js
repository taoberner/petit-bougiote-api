const express = require('express');
const router  = express.Router();
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db      = require('../db');
const { notifyDriver } = require('../notifications');
const crypto  = require('crypto');

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
    const restaurantOpen = await db.status.get();
    if (!restaurantOpen.open) {
      return res.status(503).json({ error: 'Le restaurant est actuellement fermé. Les commandes ne sont pas acceptées.' });
    }

    const { customer, phone, address, items, note } = req.body;

    if (!customer || !phone || !address || !items?.length) {
      return res.status(400).json({ error: 'Champs manquants' });
    }

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

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
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
  console.log('\n🔔 VALIDATION demandée pour', req.params.id);
  const order = await db.get(req.params.id);
  if (!order) { console.log('❌ Commande introuvable'); return res.status(404).json({ error: 'Commande introuvable' }); }
  console.log('   Status actuel:', order.status);
  if (order.status !== 'paid') return res.status(400).json({ error: 'Commande non payée — statut actuel : ' + order.status });

  const updated = await db.update(order.id, { status: 'validated' });

  broadcastOrder(updated);
  res.json({ ok: true });

  notifyDriver(updated)
    .then(() => console.log('✅ WhatsApp envoyé !'))
    .catch(e => console.error('❌ WhatsApp error:', e.message, e.code || ''));
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
      console.error('Refund error:', e.message);
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
