#!/bin/bash
# ============================================
# 🧪 BTP CONNECT v9.2.1 - TEST CONNEXION BDD
# Vérifie la connexion à MySQL/MariaDB
# ============================================

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo "============================================"
echo "🔌 TEST CONNEXION BASE DE DONNÉES"
echo "============================================"
echo ""

# Charger les variables d'environnement
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
  echo -e "${GREEN}✓${NC} Fichier .env chargé"
else
  echo -e "${RED}✗${NC} Fichier .env non trouvé"
  exit 1
fi

# Parser DATABASE_URL
# Format: mysql://user:password@host:port/database
DB_URL="$DATABASE_URL"
DB_USER=$(echo "$DB_URL" | sed -n 's|mysql://\([^:]*\):.*|\1|p')
DB_PASS=$(echo "$DB_URL" | sed -n 's|mysql://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST=$(echo "$DB_URL" | sed -n 's|mysql://[^@]*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "$DB_URL" | sed -n 's|mysql://[^@]*@[^:]*:\([^/]*\)/.*|\1|p')
DB_NAME=$(echo "$DB_URL" | sed -n 's|mysql://[^/]*/\(.*\)|\1|p')

echo ""
echo "Configuration détectée:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  User: $DB_USER"
echo "  Database: $DB_NAME"
echo ""

# Test 1: Ping du host
echo -e "${BLUE}[1/4]${NC} Test ping du host..."
if ping -c 1 -W 2 "$DB_HOST" > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} Host $DB_HOST accessible"
else
  if [ "$DB_HOST" = "localhost" ] || [ "$DB_HOST" = "127.0.0.1" ]; then
    echo -e "${GREEN}✓${NC} Host localhost (pas besoin de ping)"
  else
    echo -e "${RED}✗${NC} Host $DB_HOST non accessible"
  fi
fi

# Test 2: Port ouvert
echo -e "${BLUE}[2/4]${NC} Test port $DB_PORT..."
if nc -z -w 2 "$DB_HOST" "$DB_PORT" 2>/dev/null; then
  echo -e "${GREEN}✓${NC} Port $DB_PORT ouvert"
else
  echo -e "${RED}✗${NC} Port $DB_PORT fermé ou non accessible"
  echo ""
  echo "Solutions possibles:"
  echo "  1. Démarrer MySQL: sudo systemctl start mysql"
  echo "  2. Avec Docker: docker-compose up -d mysql"
  echo "  3. Vérifier le firewall"
  exit 1
fi

# Test 3: Connexion MySQL avec Prisma
echo -e "${BLUE}[3/4]${NC} Test connexion Prisma..."
if npx prisma db execute --stdin <<< "SELECT 1" > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} Connexion Prisma réussie"
else
  echo -e "${RED}✗${NC} Connexion Prisma échouée"
  echo ""
  echo "Vérifiez les credentials dans .env"
fi

# Test 4: État des migrations
echo -e "${BLUE}[4/4]${NC} État des migrations..."
MIGRATION_STATUS=$(npx prisma migrate status 2>&1 || true)
if echo "$MIGRATION_STATUS" | grep -q "Database schema is up to date"; then
  echo -e "${GREEN}✓${NC} Migrations à jour"
elif echo "$MIGRATION_STATUS" | grep -q "Following migration"; then
  echo -e "${YELLOW}!${NC} Migrations en attente"
  echo "  Exécutez: npx prisma migrate dev"
else
  echo -e "${YELLOW}!${NC} État migrations inconnu"
fi

echo ""
echo "============================================"
echo -e "${GREEN}✓ TEST CONNEXION BDD TERMINÉ${NC}"
echo "============================================"
