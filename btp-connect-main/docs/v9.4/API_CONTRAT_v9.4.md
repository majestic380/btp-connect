# Contrat API v9.4 (résumé)

Préfixe : /api

## Journal
- GET /journal
- POST /journal
- GET /journal/<id>
- POST /journal/<id>/decision

## Planning
- GET /planning?chantierId=<chantierId>
- POST /planning/init
- GET /planning/ecarts?chantierId=<chantierId>&date=<YYYY-MM-DD>

## Alertes
- GET /alerts
- POST /alerts/<id>/ack

## Risques
- GET /risks/score?chantierId=<chantierId>
