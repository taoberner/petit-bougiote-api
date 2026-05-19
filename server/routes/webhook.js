const express = require('express');
const router  = express.Router();
const stripe  = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db      = require('../db');
const { broadcastOrder } = require('./orders');

// Stripe envoie le corps brut — express.raw() appliqué ici
router.post('/', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata?.order_id;

    if (orderId) {
      const updated = db.update(orderId, {
        status: 'paid',
        stripe_payment_intent: session.payment_intent,
      });

      if (updated) {
        broadcastOrder(updated);
        console.log(`✅ Commande ${orderId.slice(0, 8).toUpperCase()} payée — dashboard notifié`);
      }
    }
  }

  res.json({ received: true });
});

module.exports = router;
