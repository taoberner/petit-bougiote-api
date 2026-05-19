const fs   = require('fs');
const path = require('path');

const DB_PATH = process.env.DATA_PATH
  ? path.join(process.env.DATA_PATH, 'orders.json')
  : path.join(__dirname, '..', 'orders.json');

function read() {
  if (!fs.existsSync(DB_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); } catch { return {}; }
}

function write(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function now() {
  return new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
}

const db = {
  insert(order) {
    const data = read();
    data[order.id] = { ...order, created_at: now(), updated_at: now() };
    write(data);
  },
  update(id, fields) {
    const data = read();
    if (!data[id]) return null;
    data[id] = { ...data[id], ...fields, updated_at: now() };
    write(data);
    return data[id];
  },
  get(id) {
    return read()[id] || null;
  },
  list() {
    const data = read();
    return Object.values(data).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },
  listByStatus(status) {
    return db.list().filter(o => o.status === status);
  },
};

module.exports = db;
