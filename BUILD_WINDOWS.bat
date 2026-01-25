@echo off
REM ══════════════════════════════════════════════════════════════════════════════
REM BTP Connect v9.3.0 - Script de Build Windows (avec logs)
REM ══════════════════════════════════════════════════════════════════════════════

echo.
echo ══════════════════════════════════════════════════════════════
echo    BTP Connect v9.3.0 - Build Windows
echo ══════════════════════════════════════════════════════════════
echo.

REM Vérifier Node.js
echo [1/6] Verification de Node.js...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERREUR] Node.js n'est pas installe!
    echo Telechargez-le sur: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo Node.js: OK
node -v
echo.

REM Vérifier npm
echo Verification de npm...
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERREUR] npm n'est pas installe!
    echo.
    pause
    exit /b 1
)
echo npm: OK
npm -v
echo.

echo ══════════════════════════════════════════════════════════════
echo [2/6] Installation des dependances Electron...
echo ══════════════════════════════════════════════════════════════
echo.
call npm install
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERREUR] Echec npm install (Electron)
    echo.
    pause
    exit /b 1
)
echo.
echo Dependances Electron: OK
echo.

echo ══════════════════════════════════════════════════════════════
echo [3/6] Installation des dependances Backend...
echo ══════════════════════════════════════════════════════════════
echo.
cd backend
call npm install
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERREUR] Echec npm install (Backend)
    echo.
    cd ..
    pause
    exit /b 1
)
echo.
echo Dependances Backend: OK
echo.

echo ══════════════════════════════════════════════════════════════
echo [4/6] Generation Prisma Client...
echo ══════════════════════════════════════════════════════════════
echo.
call npx prisma generate
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERREUR] Echec Prisma generate
    echo.
    cd ..
    pause
    exit /b 1
)
echo.
echo Prisma Client: OK
echo.

echo ══════════════════════════════════════════════════════════════
echo [5/6] Compilation du Backend TypeScript...
echo ══════════════════════════════════════════════════════════════
echo.
call npm run build
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERREUR] Echec compilation TypeScript
    echo.
    cd ..
    pause
    exit /b 1
)
echo.
echo Compilation Backend: OK
echo.

cd ..

echo ══════════════════════════════════════════════════════════════
echo [6/6] Creation de l'executable Windows...
echo ══════════════════════════════════════════════════════════════
echo.
call npm run build:portable
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERREUR] Echec du build Electron
    echo.
    pause
    exit /b 1
)

echo.
echo ══════════════════════════════════════════════════════════════
echo    BUILD TERMINE AVEC SUCCES!
echo ══════════════════════════════════════════════════════════════
echo.
echo L'executable se trouve dans: dist\
echo Fichier: BTP Connect 9.3.0.exe
echo.
echo Ouverture du dossier dist...
explorer dist
echo.
pause
