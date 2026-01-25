# BTP Connect v9.0 - CHANGELOG COMPLET

**Date**: 17 janvier 2026

---

## 📦 Résumé des nouveautés v9.0

### Services Backend
- **Import DPGF** : Parsing de fichiers Excel avec détection automatique des colonnes
- **Génération PDF** : Documents PDF professionnels (situations, CR)
- **Envoi Email** : Nodemailer avec support Ethereal en dev

### Feature Flags
- **Système complet** de gestion des fonctionnalités par plateforme
- **Panneau Admin** pour activer/désactiver modules et options
- **Support multi-plateforme** : Desktop, Mobile, Web

---

## 🔧 Services intégrés

### 1. Service DPGF Import (`services/dpgf-import.ts`)

**Fonctionnalités :**
- `parseDPGFFile(buffer, mapping?)` — Parse un fichier Excel
- `previewDPGFFile(buffer)` — Aperçu avec détection auto du mapping
- `validateMapping(mapping)` — Valide un mapping utilisateur
- Support des formats français (virgule décimale, symbole €)

### 2. Service PDF Generator (`services/pdf-generator.ts`)

**Fonctionnalités :**
- `generateSituationPDF(data)` — PDF de situation de travaux
- `generateCRPDF(data)` — PDF de compte rendu de chantier
- Format A4, mise en page professionnelle

### 3. Service Email (`services/email.ts`)

**Fonctionnalités :**
- `sendEmail(options)` — Envoi générique
- `sendCREmail(params)` — Envoi CR avec PDF joint
- `sendConsultationEmail(params)` — Envoi appel d'offres
- `sendRelanceEmail(params)` — Relance consultation
- Mode développement avec Ethereal

---

## 🚩 Système de Feature Flags

### Architecture

```
backend/
├── prisma/schema.prisma           # Modèle FeatureFlag
├── src/services/feature-flags.ts  # Service de gestion
├── src/routes/feature-flags.ts    # API REST
└── src/guards/feature.ts          # Middleware

frontend/
└── src/feature-flags.js           # Client JS + Admin Panel
```

### Features par défaut

| Code | Nom | Desktop | Mobile | Web |
|------|-----|:-------:|:------:|:---:|
| MODULE_DASHBOARD | Tableau de Bord | ✅ | ✅ | ✅ |
| MODULE_SOUSTRAITANTS | Sous-Traitants | ✅ | ✅ | ✅ |
| MODULE_CHANTIERS | Chantiers | ✅ | ✅ | ✅ |
| MODULE_MARCHES | Suivi Financier | ✅ | ✅ | ✅ |
| MODULE_CR | Comptes Rendus | ✅ | ✅ | ✅ |
| MODULE_VISIONNEUSE | Visionneuse Plans | ✅ | ❌ | ✅ |
| MODULE_APPELS_OFFRES | Appels d'Offres | ✅ | ✅ | ✅ |
| MODULE_GED | GED | ✅ | ✅ | ✅ |
| MODULE_ADMIN | Administration | ✅ | ❌ | ✅ |
| FEATURE_DPGF_IMPORT | Import DPGF | ✅ | ❌ | ✅ |
| FEATURE_PDF_EXPORT | Export PDF | ✅ | ✅ | ✅ |
| FEATURE_EMAIL_ENVOI | Envoi Email | ✅ | ✅ | ✅ |
| FEATURE_CHORUS_PRO | Chorus Pro | ✅ | ❌ | ❌ |
| FEATURE_SIRENE_API | Recherche SIRENE | ✅ | ✅ | ✅ |
| FEATURE_BCF_EXPORT | Export BCF | ✅ | ❌ | ✅ |
| BETA_AI_ASSISTANT | Assistant IA | ❌ | ❌ | ❌ |
| BETA_MOBILE_OFFLINE | Mode Hors-Ligne | ❌ | ❌ | ❌ |

### API Routes

```
# Routes publiques
GET  /features/config           → Config client
GET  /features/enabled          → Features activées
GET  /features/check/:code      → Vérifie une feature

# Routes admin
GET  /admin/features            → Liste flags
GET  /admin/features/matrix     → Matrice complète
PATCH /admin/features/:code     → Modifie un flag
POST  /admin/features/:code/toggle → Toggle feature
POST  /admin/features/platform/:platform/toggle → Toggle plateforme
POST  /admin/features/reset     → Reset aux défauts
```

### Utilisation Frontend

```javascript
// Vérifier une feature
if (FeatureFlags.isEnabled('MODULE_MARCHES')) {
  renderMarchesModule();
}

// Appliquer aux éléments UI
FeatureFlags.toggleElement('#btn-dpgf', 'FEATURE_DPGF_IMPORT');

// Panneau admin
FeatureFlagsAdmin.renderPanel('features-container');
```

### Utilisation Backend

```typescript
import { requireFeature } from "./guards/feature.js";

app.get('/marches', {
  preHandler: [app.authenticate, requireFeature('MODULE_MARCHES')]
}, handler);
```

---

## 📡 Nouvelles Routes API

### Routes Marchés
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/marches/:id/preview-dpgf` | Preview DPGF |
| POST | `/marches/:id/upload-dpgf` | Import DPGF |
| GET | `/situations/:id/pdf` | PDF situation |

### Routes Comptes Rendus
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/cr/:id/pdf` | PDF du CR |
| POST | `/cr/:id/envoyer` | Envoyer CR email |
| POST | `/cr/:id/envoyer-participants` | Envoyer à tous |

### Routes Appels d'Offres
| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/consultations/:id/envoyer` | Envoyer consultation |
| POST | `/consultations/:id/relancer` | Relancer |

---

## 🗄️ Modifications Schema Prisma

### Nouveau modèle FeatureFlag

```prisma
model FeatureFlag {
  id              String           @id @default(uuid())
  entrepriseId    String?
  code            String
  nom             String
  description     String?
  category        FeatureCategory  @default(FEATURE)
  platform        FeaturePlatform  @default(ALL)
  enabled         Boolean          @default(true)
  enabledDesktop  Boolean          @default(true)
  enabledMobile   Boolean          @default(true)
  enabledWeb      Boolean          @default(true)
  dependsOn       String[]
  allowedRoles    Role[]
  config          Json?
  version         String?
  deprecated      Boolean          @default(false)
  ordre           Int              @default(0)
  icone           String?
  
  @@unique([entrepriseId, code])
}
```

### Nouveaux Enums

```prisma
enum FeaturePlatform {
  ALL
  DESKTOP
  MOBILE
  WEB
}

enum FeatureCategory {
  MODULE
  FEATURE
  UI
  BETA
  ADMIN
}
```

---

## ⚙️ Configuration

### Variables d'environnement

```env
# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@domain.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@btpconnect.fr

# Base de données
DATABASE_URL=postgresql://...

# JWT
JWT_SECRET=your-secret-key
```

---

## 📦 Dépendances

```json
{
  "xlsx": "^0.18.x",
  "pdfkit": "^0.13.x",
  "nodemailer": "^6.x"
}
```

---

## 🔄 Migrations

```bash
# Appliquer les migrations
cd backend
npx prisma migrate deploy

# Générer le client
npx prisma generate
```

---

## 📝 Fichiers modifiés/créés

### Nouveaux fichiers
- `backend/src/services/feature-flags.ts`
- `backend/src/routes/feature-flags.ts`
- `backend/src/guards/feature.ts`
- `backend/prisma/migrations/20260117170000_add_feature_flags/migration.sql`
- `src/feature-flags.js`
- `docs/FEATURE_FLAGS.md`

### Fichiers modifiés
- `backend/prisma/schema.prisma` — Ajout modèle FeatureFlag
- `backend/src/server.ts` — Import routes feature flags
- `src/modules-visiobat.js` — Intégration feature flags

---

## 🚀 Prochaines étapes

1. **Tests unitaires** pour les services
2. **Historique des modifications** des feature flags
3. **Notifications** lors des changements de features
4. **Export/Import** de configuration
5. **A/B Testing** avec pourcentage d'activation
