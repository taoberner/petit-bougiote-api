const twilio = require('twilio');

async function notifyDriver(order) {
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  const items = JSON.parse(order.items);
  const itemsList = items.map(i => `  • ${i.name} x${i.qty} — ${(i.price * i.qty / 100).toFixed(2).replace('.', ',')}€`).join('\n');
  const total = (order.total / 100).toFixed(2).replace('.', ',');

  const message = [
    `🛵 *Nouvelle livraison à effectuer*`,
    ``,
    `📦 Commande #${order.id.slice(0, 8).toUpperCase()}`,
    `⏰ ${order.created_at}`,
    ``,
    `👤 Client : ${order.customer}`,
    `📞 Tél : ${order.phone}`,
    `📍 Adresse : ${order.address}`,
    ``,
    `🍔 Articles :`,
    itemsList,
    ``,
    `💰 Total payé : ${total}€`,
    order.note ? `\n📝 Note : ${order.note}` : '',
  ].filter(Boolean).join('\n');

  await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_FROM,
    to:   process.env.TWILIO_WHATSAPP_TO,
    body: message,
  });
}

module.exports = { notifyDriver };
