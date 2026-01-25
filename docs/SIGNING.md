# Signature / Notarisation (modèles)

> La signature **ne peut pas être exécutée sans vos certificats** (Windows code signing + Apple Developer ID).

## Windows (signtool)
- Prérequis: Windows SDK + certificat `.pfx`

Exemple:
```powershell
signtool sign /f cert.pfx /p <PASSWORD> /tr http://timestamp.digicert.com /td sha256 /fd sha256 "BTP-Connect-Setup.exe"
```

## macOS (codesign + notarization)
- Prérequis: Apple Developer ID + Xcode command line tools

Exemple:
```bash
codesign --deep --force --options runtime --sign "Developer ID Application: <NAME>" "BTP-Connect.app"
# notarize
xcrun notarytool submit "BTP-Connect.dmg" --apple-id "<ID>" --team-id "<TEAM>" --password "<APP-PASSWORD>" --wait
xcrun stapler staple "BTP-Connect.app"
```
