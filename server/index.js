require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express   = require('express');
const session   = require('express-session');
const cors      = require('cors');
const path      = require('path');
const helmet    = require('helmet');
const rateLimit = require('express-rate-limit');

const { router: ordersRouter } = require('./routes/orders');
const webhookRouter = require('./routes/webhook');

const app  = express();
const PORT = process.env.PORT || 3000;

// Webhook Stripe doit recevoir le corps brut AVANT express.json()
app.use('/api/webhook', webhookRouter);

// Headers de sécurité
app.use(helmet({
  contentSecurityPolicy: false,
}));

// CORS restreint au domaine de production
const allowedOrigins = [
  process.env.BASE_URL,
  'http://localhost:3000',
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));

app.use(express.json());
app.set('trust proxy', 1);

app.use(session({
  secret: process.env.SESSION_SECRET || 'changeme',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
}));

// ── Auth endpoints ────────────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 tentatives max
  message: { error: 'Trop de tentatives, réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/api/login', loginLimiter, (req, res) => {
  if (req.body.password === process.env.DASHBOARD_PASSWORD) {
    req.session.authenticated = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Mot de passe incorrect' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/auth/check', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

// ── Login page (publique) ─────────────────────────────────────────

app.get('/dashboard/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard', 'login.html'));
});

// ── Protection des routes API du dashboard ────────────────────────

app.use('/api/orders', (req, res, next) => {
  // La création de commande reste publique (appelée par les clients)
  if (req.method === 'POST' && req.path === '/') return next();
  if (!req.session || !req.session.authenticated) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  next();
});

// ── Dashboard (protégé) ───────────────────────────────────────────

app.use('/dashboard', (req, res, next) => {
  if (req.session && req.session.authenticated) return next();
  res.redirect('/dashboard/login');
}, express.static(path.join(__dirname, '..', 'dashboard')));

// ── Site client (public) ──────────────────────────────────────────

app.use(express.static(path.join(__dirname, '..', 'le-petit-bougiote')));
app.use(express.static(path.join(__dirname, '..')));

// ── API ───────────────────────────────────────────────────────────

app.use('/api/orders', ordersRouter);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ── Statut ouvert/fermé ───────────────────────────────────────────
const db = require('./db');

app.get('/api/status', async (req, res) => {
  res.json(await db.status.get());
});

app.post('/api/status', async (req, res) => {
  if (!req.session || !req.session.authenticated) return res.status(401).json({ error: 'Non authentifié' });
  const { open } = req.body;
  if (typeof open !== 'boolean') return res.status(400).json({ error: 'open doit être un booléen' });
  await db.status.set(open);
  res.json({ ok: true, open });
});

db.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 Le Petit Bougiote API démarré sur http://localhost:${PORT}`);
      console.log(`   Site client  : http://localhost:${PORT}`);
      console.log(`   Dashboard    : http://localhost:${PORT}/dashboard`);
      console.log(`   API          : http://localhost:${PORT}/api/orders\n`);
    });
  })
  .catch(err => {
    console.error('❌ Impossible de se connecter à la base de données:', err.message);
    process.exit(1);
  });
