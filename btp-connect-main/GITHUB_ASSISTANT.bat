@echo off
chcp 65001 >nul
echo.
echo ============================================
echo 🚀 BTP CONNECT - ASSISTANT GITHUB
echo ============================================
echo.

:MENU
echo Que veux-tu faire ?
echo.
echo   1. Première fois : Envoyer le code sur GitHub
echo   2. Mettre à jour le code sur GitHub
echo   3. Vérifier le statut
echo   4. Quitter
echo.
set /p choix="Tape ton choix (1, 2, 3 ou 4) : "

if "%choix%"=="1" goto PREMIER_ENVOI
if "%choix%"=="2" goto MISE_A_JOUR
if "%choix%"=="3" goto STATUT
if "%choix%"=="4" goto FIN
echo Choix invalide, réessaie.
goto MENU

:PREMIER_ENVOI
echo.
echo ============================================
echo 📤 PREMIER ENVOI SUR GITHUB
echo ============================================
echo.
set /p username="Entre ton nom d'utilisateur GitHub : "
set /p repo="Entre le nom du repository (ex: btp-connect) : "
echo.
echo Initialisation de Git...
git init
echo.
echo Ajout des fichiers...
git add .
echo.
echo Création du commit...
git commit -m "Initial commit - BTP Connect v9.2.1"
echo.
echo Configuration de la branche...
git branch -M main
echo.
echo Connexion à GitHub...
git remote add origin https://github.com/%username%/%repo%.git
echo.
echo Envoi du code (tu vas peut-être devoir te connecter)...
git push -u origin main
echo.
echo ============================================
echo ✅ TERMINÉ !
echo.
echo Va sur https://github.com/%username%/%repo%
echo Clique sur l'onglet "Actions" pour voir les tests
echo ============================================
pause
goto MENU

:MISE_A_JOUR
echo.
echo ============================================
echo 🔄 MISE À JOUR DU CODE
echo ============================================
echo.
set /p message="Décris ta modification (ex: Correction bug factures) : "
echo.
echo Ajout des fichiers modifiés...
git add .
echo.
echo Création du commit...
git commit -m "%message%"
echo.
echo Envoi sur GitHub...
git push
echo.
echo ============================================
echo ✅ MISE À JOUR TERMINÉE !
echo Les tests vont se lancer automatiquement.
echo ============================================
pause
goto MENU

:STATUT
echo.
echo ============================================
echo 📊 STATUT GIT
echo ============================================
echo.
git status
echo.
echo ============================================
pause
goto MENU

:FIN
echo.
echo À bientôt ! 👋
echo.
pause
