# BTP Connect API (Fastify + Prisma) – Admin intégré + Refresh Token

Date: 2026-01-06

## Objectif
- Backend réel pour BTP Connect
- Auth JWT + **refresh token** (sessions en base)
- RBAC (ADMIN / CONDUCTEUR / COMPTABLE)
- Multi-entreprise (tenant isolé via entrepriseId)
- CRUD: Sous-traitants + Chantiers
- **Admin UI intégrée** (dans le backend, sans outil tiers)
- Import/Export CSV depuis l’Admin UI

## Prérequis
- Node.js 20+
- Docker (pour PostgreSQL)

## Démarrage rapide
```bash
cp .env.example .env
docker compose up -d
npm install
npm run prisma:migrate -- --name init
npm run dev
```

## Liens utiles
- API: http://localhost:3000/health
- Swagger: http://localhost:3000/docs
- Admin UI (dans ton navigateur): http://localhost:3000/admin-ui

## Seed (crée 1 entreprise + 1 admin)
```bash
curl -X POST http://localhost:3000/auth/seed
```
Identifiants:
- email: admin@btpconnect.local
- password: Admin123!

## Auth (pour comprendre simplement)
- login -> renvoie accessToken + refreshToken
- accessToken -> pour appeler l’API
- refreshToken -> pour régénérer un accessToken sans se reconnecter
- logout -> invalide le refresh token
