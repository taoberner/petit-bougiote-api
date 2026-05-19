const fs   = require('fs');
const path = require('path');

const DATA_DIR   = process.env.DATA_PATH || path.join(__dirname, '..');
const DB_PATH    = path.join(DATA_DIR, 'orders.json');
const STATUS_PATH = path.join(DATA_DIR, 'status.json');

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

const status = {
  get() {
    try { return JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8')); } catch { return { open: true }; }
  },
  set(open) {
    fs.writeFileSync(STATUS_PATH, JSON.stringify({ open }));
  },
};

module.exports = { ...db, status };
