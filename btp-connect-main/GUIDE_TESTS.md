# 🧪 Guide de Test - BTP Connect v9.2.1

## 📋 Table des matières
1. [Prérequis](#prérequis)
2. [Option A: Tests Locaux avec Docker](#option-a-tests-locaux-avec-docker)
3. [Option B: Tests avec MySQL existant](#option-b-tests-avec-mysql-existant)
4. [Option C: GitHub Actions (CI/CD)](#option-c-github-actions-cicd)
5. [Scripts de Test](#scripts-de-test)
6. [Dépannage](#dépannage)

---

## Prérequis

### Logiciels requis
- **Node.js** 18+ (recommandé: 20)
- **npm** 9+
- **Docker** (optionnel, pour MySQL)
- **MySQL** 8.0 ou **MariaDB** 10.5+ (si pas de Docker)
- **Git**

### Vérification
```bash
node --version   # v18+ requis
npm --version    # v9+ requis
docker --version # optionnel
mysql --version  # optionnel
```

---

## Option A: Tests Locaux avec Docker

### Étape 1: Démarrer MySQL
```bash
# À la racine du projet
docker-compose up -d mysql

# Vérifier que MySQL est prêt
docker-compose logs mysql
# Attendre "ready for connections"
```

### Étape 2: Configurer l'environnement
```bash
cd backend

# Le fichier .env est déjà configuré pour Docker
cat .env
# DATABASE_URL="mysql://btpuser:btpconnect2025@localhost:3306/btp_connect"
```

### Étape 3: Initialiser la base de données
```bash
# Générer le client Prisma
npx prisma generate

# Appliquer les migrations
npx prisma migrate dev --name init

# (Optionnel) Charger des données de test
npx prisma db seed
```

### Étape 4: Démarrer le serveur
```bash
npm run dev
# Serveur démarré sur http://localhost:8001
```

### Étape 5: Lancer les tests API
```bash
# Dans un autre terminal
chmod +x scripts/test-api.sh
./scripts/test-api.sh
```

### Étape 6: (Optionnel) Interface phpMyAdmin
```bash
docker-compose up -d phpmyadmin
# Accès: http://localhost:8080
# User: btpuser / Password: btpconnect2025
```

---

## Option B: Tests avec MySQL existant

### Étape 1: Créer la base de données
```sql
-- Connexion en tant que root
mysql -u root -p

-- Créer la base et l'utilisateur
CREATE DATABASE IF NOT EXISTS btp_connect;
CREATE USER IF NOT EXISTS 'btpuser'@'localhost' IDENTIFIED BY 'btpconnect2025';
GRANT ALL PRIVILEGES ON btp_connect.* TO 'btpuser'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Étape 2: Configurer .env
```bash
cd backend

# Modifier .env si nécessaire
nano .env
# DATABASE_URL="mysql://btpuser:btpconnect2025@localhost:3306/btp_connect"
```

### Étape 3: Tester la connexion
```bash
chmod +x scripts/test-db.sh
./scripts/test-db.sh
```

### Étape 4: Initialiser et démarrer
```bash
npx prisma generate
npx prisma migrate dev
npm run dev
```

---

## Option C: GitHub Actions (CI/CD)

### Étape 1: Créer le repository GitHub
```bash
# Initialiser git (si pas déjà fait)
git init
git add .
git commit -m "Initial commit - BTP Connect v9.2.1"

# Créer le repo sur GitHub, puis:
git remote add origin https://github.com/VOTRE_USERNAME/btp-connect.git
git push -u origin main
```

### Étape 2: Activer GitHub Actions
1. Aller sur GitHub → Votre repo → **Settings**
2. **Actions** → **General**
3. Sélectionner "Allow all actions"
4. **Save**

### Étape 3: Vérifier les workflows
Le fichier `.github/workflows/ci.yml` contient:
- ✅ Tests TypeScript
- ✅ Tests API avec MySQL (service Docker)
- ✅ Audit de sécurité NPM
- ✅ Validation du schéma Prisma

### Étape 4: Lancer manuellement
1. Aller sur **Actions** tab
2. Sélectionner "🧪 CI/CD Tests"
3. Cliquer "Run workflow"

### Badges de statut
Ajoutez ce badge dans votre README.md:
```markdown
![CI/CD](https://github.com/VOTRE_USERNAME/btp-connect/actions/workflows/ci.yml/badge.svg)
```

---

## Scripts de Test

### test-api.sh - Tests des endpoints
```bash
cd backend
chmod +x scripts/test-api.sh
./scripts/test-api.sh

# Avec une URL personnalisée
API_URL=http://192.168.1.100:8001/api ./scripts/test-api.sh
```

**Tests inclus:**
- Health check
- Authentification
- Liste sous-traitants
- Liste chantiers
- Liste contrats
- Liste documents
- Liste factures
- Liste marchés
- Liste comptes-rendus
- Liste consultations
- Feature flags
- Configuration email
- Export CSV

### test-db.sh - Test connexion BDD
```bash
cd backend
chmod +x scripts/test-db.sh
./scripts/test-db.sh
```

**Vérifications:**
1. Ping du host
2. Port MySQL ouvert
3. Connexion Prisma
4. État des migrations

---

## Dépannage

### Erreur: "Can't reach database server"
```bash
# Vérifier si MySQL est démarré
sudo systemctl status mysql
# ou avec Docker
docker ps | grep mysql

# Démarrer MySQL
sudo systemctl start mysql
# ou
docker-compose up -d mysql
```

### Erreur: "Access denied for user"
```bash
# Vérifier les credentials
mysql -u btpuser -pbtpconnect2025 -e "SELECT 1"

# Si erreur, recréer l'utilisateur
mysql -u root -p
# Puis exécuter les commandes SQL de l'Option B
```

### Erreur: "Port 3306 already in use"
```bash
# Trouver le processus
sudo lsof -i :3306

# Arrêter MySQL local si Docker est utilisé
sudo systemctl stop mysql
```

### Erreur: "Prisma migrate dev"
```bash
# Forcer la réinitialisation
npx prisma migrate reset --force
npx prisma db push
```

### Tests API échouent avec 401
```bash
# Activer le mode bypass pour les tests
echo "AUTH_BYPASS=1" >> .env

# Redémarrer le serveur
npm run dev
```

---

## 📊 Résumé des commandes

| Action | Commande |
|--------|----------|
| Démarrer MySQL (Docker) | `docker-compose up -d mysql` |
| Générer Prisma | `npx prisma generate` |
| Migrations | `npx prisma migrate dev` |
| Démarrer serveur | `npm run dev` |
| Tests API | `./scripts/test-api.sh` |
| Test BDD | `./scripts/test-db.sh` |
| Audit sécurité | `npm run security:audit` |
| phpMyAdmin | `docker-compose up -d phpmyadmin` |
| Tout arrêter | `docker-compose down` |

---

*Guide créé le 18/01/2026 pour BTP Connect v9.2.1*
