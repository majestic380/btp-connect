# Audit final – BTP Connect (standalone Desktop + PWA iOS)

## Périmètre
- **LOT C** : Console Admin BDD (RBAC, lecture, CRUD contrôlé, import/export, backup/restore, audit UI, QA/CI)
- **LOT A** : Desktop standalone multi-modes (local/LAN/cloud) + packaging + QA/CI
- **LOT B** : PWA iOS installable + API selector + offline contrôlé + bannière réseau

## Preuves (où regarder)
- `btp-connect-latest/CHANGELOG_AUDIT.txt` : journal chronologique
- `btp-connect-latest/.github/workflows/qa.yml` : quality gate CI
- `btp-connect-latest/qa/` : scripts et E2E
- Backend : logs `AUDIT_*`, `DB_*`, `ADMIN_*` (selon routes)

## Checklist conformité (résumé)
### RBAC / visibilité
- Admin/BDD **invisible** pour non-admin (UI) + **403** côté serveur.

### Données / BDD
- Pas de SQL libre
- CRUD **contrôlé** + audit avant/après
- Import **dry-run** obligatoire avant apply
- Export **XLSX** réel
- Backup/Restore guidés + rollback auto

### Standalone
- Double-clic Windows/macOS
- Backend local embarqué en `local` / `lan`, **pas** en `cloud`
- Bascule de mode : prise en compte **après redémarrage contrôlé**

### PWA iOS
- Installable (manifest + meta iOS)
- Offline : cache statique uniquement, API network-only
- Sélecteur API + healthcheck

## Limitations connues (assumées)
- Signature/notarisation **non réalisée** sans certificats (scripts fournis dans `docs/SIGNING.md`).
- Cloud : fourni sous forme de modèles (Docker + Nginx) à adapter à votre domaine et infra.
