# 🏗️ BTP Connect v9.0 - Guide d'installation

## Architecture Unifiée
```
Backend: Fastify (TypeScript) + Prisma + MySQL/MariaDB
Desktop: Electron (Windows/Mac/Linux)
Mobile: Expo (iOS/Android) - se connecte au même backend
```

## Prérequis

### Windows
1. **Node.js 18+** : https://nodejs.org/
2. **MySQL 8+** ou **MariaDB 10+** : 
   - MySQL: https://dev.mysql.com/downloads/installer/
   - XAMPP (inclut MariaDB): https://www.apachefriends.org/
3. **Git** : https://git-scm.com/download/win

### macOS
```bash
brew install node mysql
brew services start mysql
```

### Linux (Ubuntu/Debian)
```bash
sudo apt install nodejs npm mariadb-server
sudo systemctl start mariadb
```

---

## Configuration de la base de données

### 1. Créer la base de données et l'utilisateur
```sql
-- Connectez-vous à MySQL en tant que root
mysql -u root -p

-- Exécutez ces commandes
CREATE DATABASE btp_connect CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'btpuser'@'localhost' IDENTIFIED BY 'btpconnect2025';
GRANT ALL PRIVILEGES ON btp_connect.* TO 'btpuser'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 2. Vérifier la connexion
```bash
mysql -u btpuser -pbtpconnect2025 btp_connect -e "SELECT 1;"
```

---

## Installation rapide

### Terminal 1 : Backend
```bash
cd backend
npm install

# Générer le client Prisma
npx prisma generate

# Créer les tables dans MySQL
npx prisma db push

# Insérer les données de démo
npx tsx prisma/seed.ts

# Lancer le serveur (port 3001)
npm run dev
```

### Terminal 2 : Application Electron (Desktop)
```bash
# À la racine du projet
npm install
npm start
```

---

## Credentials de test

| Email | Mot de passe | Rôle |
|-------|--------------|------|
| admin@btpconnect.local | BtpConnect2026! | ADMIN |
| conducteur@btpconnect.local | Conducteur123! | CONDUCTEUR |
| comptable@btpconnect.local | Comptable123! | COMPTABLE |

---

## Créer l'exécutable Windows

```bash
# À la racine du projet
npm run build:portable
```

Le fichier `.exe` sera créé dans le dossier `dist/`.

---

## Configuration

### backend/.env
```env
DATABASE_URL="mysql://btpuser:btpconnect2025@localhost:3306/btp_connect"
JWT_ACCESS_SECRET="your-secret-key"
JWT_REFRESH_SECRET="your-refresh-secret"
PORT=3001
```

---

## Structure du projet

```
btp-connect/
├── backend/                 # API Fastify + Prisma (MySQL)
│   ├── prisma/
│   │   ├── schema.prisma   # Schéma MySQL avec enums
│   │   └── seed.ts         # Données de démo
│   ├── src/
│   │   ├── server.ts       # Point d'entrée
│   │   ├── routes/         # Routes API
│   │   ├── services/       # Services (email, pdf, etc.)
│   │   └── guards/         # Auth guards
│   └── .env                # Configuration
├── src/
│   └── index.html          # Frontend Electron
├── main.js                 # Process Electron
├── package.json            # Config Electron
└── BUILD.md                # Ce fichier
```

---

## Commandes utiles

| Commande | Description |
|----------|-------------|
| `npm start` | Lancer l'app Electron |
| `npm run build:portable` | Créer l'exécutable Windows |
| `cd backend && npm run dev` | Lancer le backend |
| `cd backend && npx prisma studio` | Interface graphique BDD |
| `cd backend && npx prisma db push` | Appliquer le schéma |
| `cd backend && npx prisma migrate dev` | Créer une migration |

---

## API Endpoints

### Authentification
- `POST /auth/login` - Connexion
- `POST /auth/register` - Inscription
- `POST /auth/refresh` - Rafraîchir le token
- `GET /auth/me` - Infos utilisateur

### Données
- `GET /chantiers` - Liste des chantiers
- `GET /st` - Liste des sous-traitants
- `GET /contrats` - Liste des contrats
- `GET /marches` - Liste des marchés
- `GET /comptes-rendus` - Comptes rendus
- `GET /consultations` - Appels d'offres

---

## Support

En cas de problème de connexion MySQL :
1. Vérifiez que MySQL/MariaDB est lancé
2. Vérifiez les credentials dans `backend/.env`
3. Testez : `mysql -u btpuser -pbtpconnect2025 btp_connect`

## Version
- **Version**: 9.0.0
- **Database**: MySQL/MariaDB
- **ORM**: Prisma
- **Backend**: Fastify (TypeScript)
- **Desktop**: Electron
- **Mobile**: Expo (React Native)
