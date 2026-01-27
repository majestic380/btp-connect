# BTP Connect v9.4 - PRD (Product Requirements Document)

## Date de mise à jour
27 janvier 2026

## Problème original
L'utilisateur a fourni le projet BTP Connect v9.4 (application Electron/Fastify/MySQL de gestion BTP) et a demandé de l'analyser, corriger et tester pour qu'il soit fonctionnel sur la plateforme Emergent.

## Architecture choisie
**Option 2**: Intégration du frontend HTML existant avec backend Python/FastAPI + MongoDB

## Stack technique
- **Backend**: Python FastAPI
- **Base de données**: MongoDB
- **Frontend**: HTML/JavaScript natif (BTP Connect original)
- **Authentification**: JWT (mode démo activé)

## Fonctionnalités implémentées ✅

### APIs Backend (100% fonctionnel)
- `/api/health` - Health check
- `/api/auth/login` - Authentification
- `/api/auth/me` - Utilisateur courant
- `/api/st` - CRUD Sous-traitants
- `/api/chantiers` - CRUD Chantiers
- `/api/situations` - Liste des situations
- `/api/factures` - Liste des factures
- `/api/documents` - Liste des documents et types
- `/api/seed` - Initialisation des données démo

### Frontend
- Interface HTML BTP Connect v9.3.0 servie
- Tableau de bord avec statistiques
- Gestion des sous-traitants (Annuaire)
- Gestion des chantiers
- Module situations
- Module facturation
- Gestion documentaire
- Thèmes multiples (sombre, clair, océan, sunset, midnight)

## Données de démonstration
- 6 sous-traitants (ELEC Pro, CVC Solutions, Maçonnerie Durand, etc.)
- 3 chantiers (Tour Horizon, Résidence Les Jardins, Centre Commercial Rivoli)
- Situations en attente

## Tests effectués
- 26/26 tests backend passés (100%)
- Toutes les APIs CRUD validées
- Frontend HTML servi correctement

## Fichiers clés
- `/app/backend/server.py` - Backend FastAPI complet
- `/app/frontend/public/index.html` - Frontend BTP Connect
- `/app/btp-connect-main/` - Projet source original

## Prochaines étapes possibles
1. Implémenter les modules Visiobat (Marchés, Comptes-rendus, Visionneuse)
2. Ajouter le module Appels d'Offres
3. Intégrer la génération PDF des comptes-rendus
4. Export Excel des données
5. Système de notifications en temps réel

## Backlog P1
- Module Planning corrélé (v9.4)
- Module Achats & Approvisionnements (v9.4)
- Système d'alertes
- Journal de chantier

## Backlog P2
- Intégration Chorus Pro (facturation publique)
- Visionneuse BIM/Plans 2D/3D
- Import DPGF Excel
- Mobile responsive optimisations
