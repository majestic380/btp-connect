# Release – procédure (audit-ready)

## 1) Versioning
- Mettre à jour `btp-connect-latest/package.json` + `backend/package.json` (version)
- Mettre à jour `CHANGELOG_AUDIT.txt`

## 2) Build
- Desktop: `npm run dist`
- Backend: `npm --prefix backend run build`

## 3) Checksums
- Windows PowerShell: `scripts/generate-checksums.ps1 <folder>`
- macOS/Linux: `scripts/generate-checksums.sh <folder>`

## 4) Tag + Release notes
- Créer tag `vX.Y.Z`
- Utiliser `docs/RELEASE_NOTES_TEMPLATE.md`
