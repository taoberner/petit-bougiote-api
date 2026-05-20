const express = require('express');
const router  = express.Router();
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db      = require('../db');
const { broadcastOrder } = require('./orders');
const logger  = require('../logger');

// Stripe envoie le corps brut — express.raw() appliqué ici
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error('Webhook signature error', { message: err.message });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata?.order_id;

    if (orderId) {
      const updated = await db.update(orderId, {
        status: 'paid',
        stripe_payment_intent: session.payment_intent,
      });

      if (updated) {
        broadcastOrder(updated);
        logger.info('Commande payée — dashboard notifié', { orderId: orderId.slice(0, 8).toUpperCase() });
      }
    }
  }

  res.json({ received: true });
});

module.exports = router;
