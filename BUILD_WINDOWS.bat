@echo off
REM ══════════════════════════════════════════════════════════════════════════════
REM BTP Connect v9.3.0 - Script de Build Windows
REM Exécuter ce script sur Windows pour créer l'exécutable .exe
REM ══════════════════════════════════════════════════════════════════════════════

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║   BTP Connect v9.3.0 - Build Windows                        ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

REM Vérifier Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERREUR] Node.js n'est pas installe!
    echo Telechargez-le sur: https://nodejs.org/
    pause
    exit /b 1
)

echo [1/6] Verification des prerequis...
node -v
npm -v

echo.
echo [2/6] Installation des dependances Electron...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERREUR] Echec de l'installation des dependances
    pause
    exit /b 1
)

echo.
echo [3/6] Installation des dependances Backend...
cd backend
call npm install
if %ERRORLEVEL% neq 0 (
    echo [ERREUR] Echec de l'installation du backend
    pause
    exit /b 1
)

echo.
echo [4/6] Generation Prisma Client...
call npx prisma generate
if %ERRORLEVEL% neq 0 (
    echo [ERREUR] Echec de Prisma generate
    pause
    exit /b 1
)

echo.
echo [5/6] Compilation du Backend TypeScript...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERREUR] Echec de la compilation
    pause
    exit /b 1
)

cd ..

echo.
echo [6/6] Creation de l'executable Windows...
call npm run build:portable
if %ERRORLEVEL% neq 0 (
    echo [ERREUR] Echec du build Electron
    pause
    exit /b 1
)

echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║   BUILD TERMINE AVEC SUCCES!                                ║
echo ╠══════════════════════════════════════════════════════════════╣
echo ║   L'executable se trouve dans: dist\                        ║
echo ║   Fichier: BTP Connect 9.3.0.exe                            ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

explorer dist

pause
