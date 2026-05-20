# Le Petit Bougiote — API de commande en ligne

Système de commande en ligne pour un restaurant de burgers. Les clients passent commande et paient via Stripe Checkout. Le dashboard iPad affiche les commandes en temps réel (SSE), le cuisinier valide ou refuse, et le livreur reçoit un WhatsApp automatique.

## Stack technique

- **Runtime** : Node.js / Express
- **Base de données** : PostgreSQL (via `pg`)
- **Paiements** : Stripe Checkout + webhooks
- **Notifications** : Twilio WhatsApp Business API
- **Temps réel** : Server-Sent Events (SSE)
- **Sécurité** : Helmet, express-rate-limit, sessions HTTP-only
- **Validation** : Joi
- **Logging** : Winston

## Installation locale

```bash
# 1. Cloner et installer les dépendances
git clone <repo>
cd petit-bougiote-api
npm install

# 2. Créer le fichier d'environnement
cp .env.example .env
# Remplir toutes les variables dans .env

# 3. Lancer en développement
npm run dev
```

Le serveur démarre sur `http://localhost:3000`.

## Variables d'environnement

| Variable | Description | Exemple |
|---|---|---|
| `NODE_ENV` | Environnement (`development` / `production`) | `production` |
| `PORT` | Port d'écoute | `3000` |
| `BASE_URL` | URL publique du site (sans slash final) | `https://mon-site.up.railway.app` |
| `DATABASE_URL` | URL de connexion PostgreSQL | `postgresql://user:pass@host/db` |
| `STRIPE_SECRET_KEY` | Clé secrète Stripe | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Secret du webhook Stripe | `whsec_...` |
| `TWILIO_ACCOUNT_SID` | SID du compte Twilio | `ACxxxxx` |
| `TWILIO_AUTH_TOKEN` | Token d'authentification Twilio | `xxxxx` |
| `TWILIO_WHATSAPP_FROM` | Numéro Twilio WhatsApp expéditeur | `whatsapp:+14155238886` |
| `TWILIO_WHATSAPP_TO` | Numéro du livreur | `whatsapp:+33xxxxxxxxx` |
| `SESSION_SECRET` | Secret de session Express (chaîne aléatoire longue) | `abc123...` |
| `DASHBOARD_PASSWORD` | Mot de passe du dashboard | `monMotDePasse` |
| `LOG_LEVEL` | Niveau de log Winston | `info` |

## Architecture des routes API

### Publiques (clients)

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/api/orders` | Créer une commande + obtenir l'URL Stripe Checkout |
| `GET` | `/api/status` | État ouvert/fermé du restaurant |
| `GET` | `/api/health` | Health check |
| `POST` | `/api/webhook` | Webhook Stripe (paiement confirmé) |

### Protégées (dashboard — session requise)

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/orders` | Lister toutes les commandes |
| `GET` | `/api/orders/events` | Flux SSE temps réel |
| `POST` | `/api/orders/:id/validate` | Valider une commande (envoie WhatsApp livreur) |
| `POST` | `/api/orders/:id/reject` | Refuser + rembourser via Stripe |
| `POST` | `/api/status` | Ouvrir/fermer le restaurant |

### Auth

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/api/login` | Connexion au dashboard |
| `POST` | `/api/logout` | Déconnexion |
| `GET` | `/api/auth/check` | Vérifier l'état de la session |

## Déploiement Railway

1. Créer un nouveau projet sur [Railway](https://railway.app)
2. Ajouter un service **PostgreSQL** — Railway fournit automatiquement `DATABASE_URL`
3. Connecter le dépôt GitHub
4. Dans **Variables**, ajouter toutes les variables du tableau ci-dessus
5. Railway détecte `npm start` automatiquement via `package.json`

Le service PostgreSQL est provisionné automatiquement et `DATABASE_URL` est injecté dans l'environnement.

## Configuration Stripe

### Webhook

1. Dans le dashboard Stripe > Développeurs > Webhooks, cliquer **Ajouter un endpoint**
2. URL : `https://votre-domaine.com/api/webhook`
3. Événement à écouter : `checkout.session.completed`
4. Copier le **Signing secret** (`whsec_...`) dans la variable `STRIPE_WEBHOOK_SECRET`

### Test en local

```bash
# Installer la CLI Stripe
stripe listen --forward-to localhost:3000/api/webhook
```

La CLI affiche le `STRIPE_WEBHOOK_SECRET` local à utiliser dans `.env`.

## Configuration Twilio WhatsApp

1. Créer un compte [Twilio](https://www.twilio.com)
2. Activer le **Sandbox WhatsApp** (ou un numéro WhatsApp Business approuvé)
3. Renseigner dans `.env` :
   - `TWILIO_ACCOUNT_SID` et `TWILIO_AUTH_TOKEN` depuis la console Twilio
   - `TWILIO_WHATSAPP_FROM` : numéro Twilio au format `whatsapp:+14155238886`
   - `TWILIO_WHATSAPP_TO` : numéro du livreur au format `whatsapp:+33xxxxxxxxx`
4. En sandbox, le livreur doit d'abord envoyer le code de jointure au numéro Twilio

## Structure du projet

```
petit-bougiote-api/
├── server/
│   ├── index.js              # Point d'entrée Express
│   ├── db.js                 # Connexion PostgreSQL + helpers
│   ├── logger.js             # Winston (JSON en prod, colorisé en dev)
│   ├── notifications.js      # Envoi WhatsApp via Twilio
│   ├── validators.js         # Schémas de validation Joi
│   ├── middleware/
│   │   └── errorHandler.js   # Gestionnaire d'erreurs global
│   └── routes/
│       ├── orders.js         # Routes commandes + SSE
│       └── webhook.js        # Webhook Stripe
├── le-petit-bougiote/        # Site client (HTML/CSS/JS)
├── dashboard/                # Dashboard iPad (HTML/CSS/JS)
├── .env.example              # Modèle de configuration
└── package.json
```
