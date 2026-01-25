# 🏗️ BTP Connect v9.3.0

Application de gestion BTP complète avec modules Visiobat et système de Feature Flags.

## ✨ Fonctionnalités

### 🚩 Système de Feature Flags (v9.0)
- Gestion par plateforme : Desktop, Mobile, Web
- Catégories : Modules, Fonctionnalités, UI, Beta, Admin
- Dépendances entre features
- Restriction par rôle utilisateur

### 📊 Modules Visiobat

| Module | Description |
|--------|-------------|
| 💰 **Suivi Financier** | Marchés, DPGF, Situations, Avenants, Chorus Pro |
| 📝 **Comptes Rendus** | CR de chantier, participants, actions, PDF |
| 🗺️ **Visionneuse BIM** | Plans 2D/3D, annotations BCF, IFC/RVT |
| 📨 **Appels d'Offres** | Consultations, comparatifs, attribution |

### 🔒 Sécurité (v9.3.0)
- ✅ AUTH_BYPASS bloqué en production
- ✅ CORS restrictif en production
- ✅ Helmet avec CSP activé
- ✅ Rate limiting (100 req/min prod)
- ✅ Gestion d'erreurs centralisée
- ✅ Health checks complets

## 📦 Prérequis

- **Node.js** 20+ 
- **npm** 10+
- **MySQL** 8.0+ (ou Docker)

## 🚀 Installation rapide

```bash
# 1. Installer les dépendances
npm install
cd backend && npm install

# 2. Configurer l'environnement
cp ../.env.example .env
# Éditer .env avec vos valeurs

# 3. Base de données (Docker)
cd .. && docker-compose up -d mysql

# 4. Initialiser Prisma
cd backend
npx prisma generate
npx prisma migrate dev
npx prisma db seed
npm run build

# 5. Lancer l'application
cd .. && npm run dev
```

## ⚙️ Configuration

| Variable | Description | Requis |
|----------|-------------|--------|
| `DATABASE_URL` | URL MySQL | ✅ |
| `JWT_ACCESS_SECRET` | Secret JWT (32+ chars) | ✅ |
| `JWT_REFRESH_SECRET` | Secret refresh (32+ chars) | ✅ |
| `NODE_ENV` | `development` ou `production` | ✅ |
| `CORS_ORIGIN` | Origines autorisées | Prod |

## 🖥️ Modes d'exécution

- **Local** : Backend sur `127.0.0.1` (défaut)
- **LAN** : Backend accessible sur le réseau
- **Cloud** : Connexion à un serveur distant

## 📡 API Endpoints

```
GET  /health           # Status complet
GET  /health/ready     # Readiness probe
GET  /health/live      # Liveness probe
POST /api/auth/login   # Connexion
GET  /api/marches      # Liste des marchés
```

## 🐳 Déploiement Docker

```bash
# Production
docker-compose -f docker-compose.prod.yml up -d

# Migrations
docker-compose exec api npx prisma migrate deploy
```

## 🔒 Sécurité Production

- [ ] `NODE_ENV=production`
- [ ] `AUTH_BYPASS=0` ou non défini
- [ ] Mots de passe forts (32+ chars)
- [ ] `CORS_ORIGIN` configuré
- [ ] HTTPS activé

## 🆕 Nouveautés v9.3.0

- 🔒 AUTH_BYPASS bloqué en production
- 🛡️ CORS/Helmet conditionnels
- 📊 Health checks complets
- ⚠️ Error handler centralisé
- 🐳 Dockerfile multi-stage
- 🔄 GitHub Actions CI/CD

## 📚 Documentation

- [Feature Flags](./docs/FEATURE_FLAGS.md)
- [Déploiement Cloud](./docs/DEPLOY_CLOUD.md)
- [Build](./BUILD.md)

---

© 2026 BTP Connect
