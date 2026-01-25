# BTP Connect v9.0 - Intégration des Services

**Date**: 17 janvier 2026

## Résumé

Intégration des services DPGF (import Excel), PDF (génération documents) et Email (envoi automatisé) dans les routes API backend.

---

## 🔧 Services intégrés

### 1. Service DPGF Import (`services/dpgf-import.ts`)
Parsing de fichiers Excel DPGF avec détection automatique des colonnes.

**Fonctionnalités :**
- `parseDPGFFile(buffer, mapping?)` — Parse un fichier Excel et retourne les lignes structurées
- `previewDPGFFile(buffer)` — Génère un aperçu avec détection automatique du mapping
- `validateMapping(mapping)` — Valide un mapping utilisateur
- Détection automatique des colonnes (numéro, désignation, unité, quantité, prix unitaire, montant)
- Support des formats français (virgule décimale, symbole €)

### 2. Service PDF Generator (`services/pdf-generator.ts`)
Génération de documents PDF professionnels.

**Fonctionnalités :**
- `generateSituationPDF(data)` — Génère un PDF de situation de travaux
- `generateCRPDF(data)` — Génère un PDF de compte rendu de chantier
- Format A4, mise en page professionnelle
- Tableaux de données, récapitulatifs financiers
- Signatures et métadonnées PDF

### 3. Service Email (`services/email.ts`)
Envoi d'emails via Nodemailer.

**Fonctionnalités :**
- `sendEmail(options)` — Envoi générique d'email
- `sendCREmail(params)` — Envoi de compte rendu avec PDF joint
- `sendConsultationEmail(params)` — Envoi d'appel d'offres
- `sendRelanceEmail(params)` — Relance pour consultation
- `testEmailConfig()` — Test de configuration SMTP
- Mode développement avec Ethereal (preview URL)

---

## 📡 Nouvelles Routes API

### Routes Marchés (`routes/marches.ts`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/marches/:id/preview-dpgf` | Preview DPGF avec détection colonnes |
| POST | `/marches/:id/upload-dpgf` | Upload et import DPGF complet |
| GET | `/situations/:id/pdf` | Télécharger PDF situation |

### Routes Comptes Rendus (`routes/comptes-rendus.ts`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| GET | `/cr/:id/pdf` | Télécharger PDF du CR |
| POST | `/cr/:id/envoyer` | Envoyer CR par email |
| POST | `/cr/:id/envoyer-participants` | Envoyer à tous les participants |

### Routes Appels d'Offres (`routes/appels-offres.ts`)

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/consultations/:id/envoyer` | Envoyer consultation (avec emails) |
| POST | `/consultations/:id/relancer` | Relancer non-répondants |

---

## 📦 Dépendances

```json
{
  "xlsx": "^0.18.x",      // Import DPGF
  "pdfkit": "^0.13.x",    // Génération PDF
  "nodemailer": "^6.x"    // Envoi emails
}
```

---

## ⚙️ Configuration

### Variables d'environnement Email

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@domain.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@btpconnect.fr
```

En développement, si les variables SMTP ne sont pas configurées, le service utilise automatiquement Ethereal (emails de test avec URL de preview).

---

## 🗄️ Modifications Schema Prisma

### Modèle CompteRendu (ajouts)
```prisma
objetReunion          String?
effectifChantier      Int?
prochainCR            DateTime?
diffuse               Boolean   @default(false)
dateDiffusion         DateTime?
```

### Migration
```
prisma/migrations/20260117160500_add_services_fields/migration.sql
```

---

## 📝 Exemples d'utilisation

### Import DPGF

```javascript
// 1. Preview pour voir les colonnes détectées
const preview = await fetch('/marches/123/preview-dpgf', {
  method: 'POST',
  body: formDataWithFile
});
// Réponse: { headers, sampleRows, suggestedMapping }

// 2. Import avec mapping personnalisé (optionnel)
const result = await fetch('/marches/123/upload-dpgf', {
  method: 'POST',
  body: formDataWithFileAndMapping
});
// Réponse: { success, lignesImportees, montantTotalHT, warnings }
```

### Génération PDF Situation

```javascript
// Télécharger le PDF
const response = await fetch('/situations/456/pdf');
const blob = await response.blob();
// Fichier: Situation-3-MARCHE-2024-001.pdf
```

### Envoi Email CR

```javascript
const result = await fetch('/cr/789/envoyer', {
  method: 'POST',
  body: JSON.stringify({
    destinataires: ['client@example.com', 'archi@example.com'],
    inclurePDF: true
  })
});
// Réponse: { success, messageId, previewUrl, destinataires }
```

### Envoi Consultation

```javascript
const result = await fetch('/consultations/101/envoyer', {
  method: 'POST'
});
// Réponse: { success, envoyesA, stats, message }
```

---

## 🔄 Prochaines étapes

1. **Tests unitaires** — Ajouter tests pour les services
2. **Upload documents consultation** — Joindre CCTP/DPGF aux emails
3. **Historique envois** — Tracer tous les envois emails
4. **Templates personnalisables** — Permettre customisation des emails
5. **Export PDF avancé** — Multi-pages, graphiques avancement
