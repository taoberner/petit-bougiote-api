const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id            VARCHAR(100) PRIMARY KEY,
      status        VARCHAR(50)  NOT NULL DEFAULT 'pending',
      customer      VARCHAR(200) NOT NULL,
      phone         VARCHAR(50)  NOT NULL,
      address       TEXT         NOT NULL,
      items         TEXT         NOT NULL,
      note          TEXT         NOT NULL DEFAULT '',
      total         INTEGER      NOT NULL,
      stripe_session_id       VARCHAR(255),
      stripe_payment_intent   VARCHAR(255),
      created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMP    NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS restaurant_status (
      id   INTEGER PRIMARY KEY DEFAULT 1,
      open BOOLEAN NOT NULL DEFAULT TRUE
    );

    INSERT INTO restaurant_status (id, open)
    VALUES (1, TRUE)
    ON CONFLICT (id) DO NOTHING;
  `);
}

const db = {
  async insert(order) {
    const { id, status, customer, phone, address, items, note, total, stripe_session_id, stripe_payment_intent } = order;
    await pool.query(
      `INSERT INTO orders
         (id, status, customer, phone, address, items, note, total, stripe_session_id, stripe_payment_intent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        status || 'pending',
        customer,
        phone,
        address,
        typeof items === 'string' ? items : JSON.stringify(items),
        note || '',
        total,
        stripe_session_id || null,
        stripe_payment_intent || null,
      ]
    );
  },

  async update(id, fields) {
    const keys   = Object.keys(fields);
    const values = Object.values(fields);
    const set    = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const result = await pool.query(
      `UPDATE orders SET ${set}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return result.rows[0] || null;
  },

  async get(id) {
    const result = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async list() {
    const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    return result.rows;
  },

  async listByStatus(status) {
    const result = await pool.query(
      'SELECT * FROM orders WHERE status = $1 ORDER BY created_at DESC',
      [status]
    );
    return result.rows;
  },
};

const status = {
  async get() {
    const result = await pool.query('SELECT open FROM restaurant_status WHERE id = 1');
    return result.rows[0] || { open: true };
  },

  async set(open) {
    await pool.query('UPDATE restaurant_status SET open = $1 WHERE id = 1', [open]);
  },
};

module.exports = { ...db, status, init };
