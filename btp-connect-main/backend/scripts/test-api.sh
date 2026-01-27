#!/bin/bash
# ============================================
# 🧪 BTP CONNECT v9.2.1 - TESTS API
# Script de tests d'intégration
# ============================================

set -e

# Configuration
API_URL="${API_URL:-http://localhost:8001/api}"
TOKEN=""

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Compteurs
PASSED=0
FAILED=0
SKIPPED=0

# Fonctions utilitaires
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓ PASS]${NC} $1"; ((PASSED++)); }
log_fail() { echo -e "${RED}[✗ FAIL]${NC} $1"; ((FAILED++)); }
log_skip() { echo -e "${YELLOW}[○ SKIP]${NC} $1"; ((SKIPPED++)); }

# Test de connexion basique
test_health() {
  log_info "Test: Health Check"
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL%/api}/health" 2>/dev/null || echo "000")
  if [ "$RESPONSE" = "200" ]; then
    log_success "Health endpoint OK"
  else
    log_fail "Health endpoint failed (HTTP $RESPONSE)"
    return 1
  fi
}

# Test d'authentification
test_auth_login() {
  log_info "Test: Auth Login"
  RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@btpconnect.local","password":"admin123"}' 2>/dev/null)
  
  if echo "$RESPONSE" | grep -q "accessToken"; then
    TOKEN=$(echo "$RESPONSE" | grep -oP '"accessToken":"\K[^"]+')
    log_success "Login OK - Token obtenu"
  elif echo "$RESPONSE" | grep -q "error"; then
    ERROR=$(echo "$RESPONSE" | grep -oP '"error":"\K[^"]+')
    log_fail "Login failed: $ERROR"
  else
    log_fail "Login failed: Réponse inattendue"
  fi
}

# Test Auth Bypass Mode
test_auth_bypass() {
  log_info "Test: Auth Bypass Mode (GET /auth/me)"
  RESPONSE=$(curl -s "$API_URL/auth/me" 2>/dev/null)
  
  if echo "$RESPONSE" | grep -q "user\|email"; then
    log_success "Auth Bypass actif - User récupéré"
  elif echo "$RESPONSE" | grep -q "Unauthorized\|error"; then
    log_skip "Auth Bypass désactivé (normal en production)"
  else
    log_fail "Auth/me: Réponse inattendue"
  fi
}

# Test GET générique
test_get_endpoint() {
  local endpoint=$1
  local name=$2
  log_info "Test: GET $endpoint"
  
  local headers=""
  [ -n "$TOKEN" ] && headers="-H \"Authorization: Bearer $TOKEN\""
  
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $headers "$API_URL$endpoint" 2>/dev/null || echo "000")
  
  if [ "$RESPONSE" = "200" ]; then
    log_success "$name OK"
  elif [ "$RESPONSE" = "401" ]; then
    log_skip "$name (Authentification requise)"
  elif [ "$RESPONSE" = "000" ]; then
    log_fail "$name (Serveur non accessible)"
  else
    log_fail "$name (HTTP $RESPONSE)"
  fi
}

# Test POST générique
test_post_endpoint() {
  local endpoint=$1
  local name=$2
  local data=$3
  log_info "Test: POST $endpoint"
  
  local headers="-H \"Content-Type: application/json\""
  [ -n "$TOKEN" ] && headers="$headers -H \"Authorization: Bearer $TOKEN\""
  
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" $headers -X POST "$API_URL$endpoint" -d "$data" 2>/dev/null || echo "000")
  
  if [ "$RESPONSE" = "200" ] || [ "$RESPONSE" = "201" ]; then
    log_success "$name OK"
  elif [ "$RESPONSE" = "401" ]; then
    log_skip "$name (Authentification requise)"
  elif [ "$RESPONSE" = "400" ]; then
    log_skip "$name (Données requises)"
  else
    log_fail "$name (HTTP $RESPONSE)"
  fi
}

# ============================================
# EXÉCUTION DES TESTS
# ============================================

echo ""
echo "============================================"
echo "🧪 BTP CONNECT v9.2.1 - TESTS API"
echo "============================================"
echo "API URL: $API_URL"
echo "Date: $(date)"
echo "============================================"
echo ""

# 1. Tests de base
echo -e "\n${BLUE}=== 1. TESTS DE BASE ===${NC}\n"
test_health || true

# 2. Tests d'authentification
echo -e "\n${BLUE}=== 2. TESTS AUTHENTIFICATION ===${NC}\n"
test_auth_bypass
test_auth_login || true

# 3. Tests des endpoints principaux
echo -e "\n${BLUE}=== 3. TESTS ENDPOINTS CRUD ===${NC}\n"

# Sous-traitants
test_get_endpoint "/st" "Liste sous-traitants"

# Chantiers
test_get_endpoint "/chantiers" "Liste chantiers"

# Contrats
test_get_endpoint "/contrats" "Liste contrats"

# Documents
test_get_endpoint "/documents" "Liste documents"
test_get_endpoint "/documents/types" "Types de documents"
test_get_endpoint "/documents/expiring" "Documents expirant"

# Factures
test_get_endpoint "/factures" "Liste factures"
test_get_endpoint "/factures/stats" "Stats factures"

# Marchés (Visiobat)
test_get_endpoint "/marches" "Liste marchés"

# Comptes-rendus
test_get_endpoint "/cr" "Liste comptes-rendus"

# Consultations (Appels d'offres)
test_get_endpoint "/consultations" "Liste consultations"

# Feature Flags
test_get_endpoint "/feature-flags" "Feature flags"

# 4. Tests Email
echo -e "\n${BLUE}=== 4. TESTS EMAIL ===${NC}\n"
test_get_endpoint "/email/test" "Config email"

# 5. Tests Admin
echo -e "\n${BLUE}=== 5. TESTS ADMIN ===${NC}\n"
test_get_endpoint "/admin/export/st.csv" "Export ST CSV"
test_get_endpoint "/admin/export/chantiers.csv" "Export Chantiers CSV"

# ============================================
# RÉSUMÉ
# ============================================

echo ""
echo "============================================"
echo "📊 RÉSUMÉ DES TESTS"
echo "============================================"
echo -e "${GREEN}✓ Réussis: $PASSED${NC}"
echo -e "${RED}✗ Échoués: $FAILED${NC}"
echo -e "${YELLOW}○ Ignorés: $SKIPPED${NC}"
echo "============================================"

TOTAL=$((PASSED + FAILED))
if [ $TOTAL -gt 0 ]; then
  PERCENT=$((PASSED * 100 / TOTAL))
  echo "Taux de réussite: $PERCENT%"
fi

# Exit code basé sur les échecs
[ $FAILED -eq 0 ] && exit 0 || exit 1
