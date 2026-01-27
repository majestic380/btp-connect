# Contrat API – BTP Connect v9.4 (MVP)

Ce document décrit les endpoints implémentés dans le code.

## Journal
- GET `/api/journal`
- POST `/api/journal`
- GET `/api/journal/:id`
- POST `/api/journal/:id/decision`

## Planning
- GET `/api/planning?chantierId=...`
- POST `/api/planning/init`
- GET `/api/planning/ecarts?chantierId=...&date=YYYY-MM-DD`

## Alertes / Risques
- GET `/api/alerts`
- POST `/api/alerts/:id/ack`
- GET `/api/risks/score?chantierId=...`

## Achats
- POST `/api/achats/da`
- GET `/api/achats/da`
- POST `/api/achats/consultations` (envoi mails immédiat via service email)
- POST `/api/achats/offres`
- POST `/api/achats/commandes`
- POST `/api/achats/livraisons`
- GET `/api/achats/retards?chantierId=...`
