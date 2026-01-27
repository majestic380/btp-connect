# Changelog

Toutes les modifications notables de ce projet sont documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [9.3.0] - 2026-01-25

### 🔒 Sécurité

- **AUTH_BYPASS bloqué en production** : Le mode sans authentification est maintenant automatiquement bloqué si `NODE_ENV=production`. Cela empêche toute exposition accidentelle de l'API sans authentification.

- **CORS conditionnel** : 
  - Production : Liste blanche d'origines autorisées
  - Développement : Toutes origines acceptées

- **Helmet CSP activé** : Content Security Policy complète en production pour protéger contre les attaques XSS.

- **Rate limiting renforcé** : 100 req/min en production, 300 en développement.

- **Secrets externalisés** : Plus aucun mot de passe en dur dans `docker-compose.yml`.

### ✨ Ajouté

- **Error Handler centralisé** (`plugins/error-handler.ts`) :
  - Gestion des erreurs Zod (validation)
  - Gestion des erreurs Prisma avec messages user-friendly
  - Gestion des erreurs JWT
  - Stack traces masquées en production

- **Health Checks complets** (`routes/health.ts`) :
  - `/health` - Status global avec vérification DB et mémoire
  - `/health/ready` - Probe de disponibilité (Kubernetes)
  - `/health/live` - Probe de vie
  - `/health/metrics` - Métriques détaillées (protégé par API key)

- **GitHub Actions CI/CD** :
  - Lint et type check
  - Audit de sécurité
  - Tests avec MySQL
  - Build Docker
  - Build Electron (Windows/macOS)

- **Dockerfile multi-stage** :
  - Image optimisée (~200MB vs ~500MB)
  - Utilisateur non-root
  - Healthcheck intégré

### 🔧 Modifié

- **server.ts** refactorisé :
  - Banner de démarrage
  - Logs structurés avec redaction
  - Graceful shutdown
  - Meilleure gestion des fichiers statiques

- **auth.ts** amélioré :
  - Protection production explicite
  - Messages d'erreur détaillés
  - Middleware `optionalAuth` ajouté
  - Middleware `requireAdmin` ajouté

### 📝 Documentation

- README.md mis à jour avec checklist sécurité
- `.env.example` complet avec commentaires
- Instructions de déploiement Docker

## [9.2.1] - 2026-01-18

### ✨ Ajouté

- Routes email (`routes/email.ts`)
- Amélioration des routes admin

### 🐛 Corrigé

- Corrections mineures dans les comptes rendus
- Amélioration de la gestion des documents

## [9.2.0] - 2026-01-17

### ✨ Ajouté

- Service d'envoi d'emails avec Nodemailer
- Export PDF amélioré pour les comptes rendus

## [9.0.0] - 2026-01-15

### 🎉 Version majeure

- **Modules Visiobat** :
  - Suivi financier des marchés
  - Import DPGF Excel
  - Situations de travaux avec workflow MOE/MOA
  - Comptes rendus de chantier
  - Visionneuse BIM/Plans
  - Appels d'offres

- **Feature Flags** :
  - Gestion par plateforme (Desktop/Mobile/Web)
  - Panneau admin
  - Dépendances entre features
  - Restriction par rôle

- **Architecture** :
  - 3 modes d'exécution (Local/LAN/Cloud)
  - Configuration via `app.config.json`
  - PWA pour mode web

---

## Types de changements

- `Ajouté` pour les nouvelles fonctionnalités
- `Modifié` pour les changements dans les fonctionnalités existantes
- `Obsolète` pour les fonctionnalités qui seront supprimées
- `Supprimé` pour les fonctionnalités supprimées
- `Corrigé` pour les corrections de bugs
- `Sécurité` pour les corrections de vulnérabilités
