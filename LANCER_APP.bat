@echo off
REM ══════════════════════════════════════════════════════════════════════════════
REM BTP Connect v9.3.0 - Lancer en mode developpement
REM ══════════════════════════════════════════════════════════════════════════════

echo.
echo ══════════════════════════════════════════════════════════════
echo    BTP Connect v9.3.0 - Mode Developpement
echo ══════════════════════════════════════════════════════════════
echo.

REM Vérifier Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERREUR] Node.js n'est pas installe!
    echo Telechargez-le sur: https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js detecte: 
node -v
echo.

REM Vérifier si node_modules existe
if not exist "node_modules" (
    echo Installation des dependances...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo [ERREUR] npm install a echoue
        pause
        exit /b 1
    )
)

if not exist "backend\node_modules" (
    echo Installation des dependances backend...
    cd backend
    call npm install
    call npx prisma generate
    call npm run build
    cd ..
)

echo.
echo Lancement de BTP Connect...
echo (La fenetre restera ouverte pour voir les erreurs)
echo.

npm run dev

echo.
echo Application fermee.
pause
