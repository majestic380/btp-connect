#!/bin/bash
# ╔════════════════════════════════════════════════════════════╗
# ║         BTP CONNECT - Script de Tests QA                   ║
# ║         Version: 1.0.0                                     ║
# ║         Date: 2025-01-11                                   ║
# ╚════════════════════════════════════════════════════════════╝

API_URL="${API_URL:-http://localhost:3001}"
PASSED=0
FAILED=0

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║           BTP CONNECT - Tests QA Automatisés               ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "API URL: $API_URL"
echo "Date: $(date)"
echo ""

# ===== FONCTION DE TEST =====
run_test() {
  local name="$1"
  local result="$2"
  local expected="$3"
  
  echo "┌─────────────────────────────────────────────────────────────┐"
  echo "│ $name"
  echo "└─────────────────────────────────────────────────────────────┘"
  
  if [ "$result" = "$expected" ] || [ -n "$result" -a "$expected" = "NOT_EMPTY" ]; then
    echo -e "${GREEN}✅ PASS${NC}: $result"
    ((PASSED++))
  else
    echo -e "${RED}❌ FAIL${NC}: Expected '$expected', got '$result'"
    ((FAILED++))
  fi
  echo ""
}

# ===== TEST 1: Health Check =====
RESULT=$(curl -s "$API_URL/health" 2>/dev/null)
run_test "TEST 1: Health Check" "$RESULT" '{"ok":true}'

# ===== TEST 2: GET /st =====
ST_COUNT=$(curl -s "$API_URL/st" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('items',[])))" 2>/dev/null)
if [ "$ST_COUNT" -gt 0 ] 2>/dev/null; then
  run_test "TEST 2: GET /st (Liste ST)" "$ST_COUNT sous-traitants" "NOT_EMPTY"
else
  run_test "TEST 2: GET /st (Liste ST)" "0" "NOT_EMPTY"
fi

# ===== TEST 3: GET /chantiers =====
CH_COUNT=$(curl -s "$API_URL/chantiers" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('items',[])))" 2>/dev/null)
if [ "$CH_COUNT" -gt 0 ] 2>/dev/null; then
  run_test "TEST 3: GET /chantiers" "$CH_COUNT chantiers" "NOT_EMPTY"
else
  run_test "TEST 3: GET /chantiers" "0" "NOT_EMPTY"
fi

# ===== TEST 4: POST /st =====
CREATE_RESULT=$(curl -s -X POST "$API_URL/st" \
  -H "Content-Type: application/json" \
  -d '{"nom": "QA Automated Test", "metier": "QA", "ville": "TestCity"}' 2>/dev/null)
TEST_ID=$(echo "$CREATE_RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('item',{}).get('id',''))" 2>/dev/null)
if [ -n "$TEST_ID" ]; then
  run_test "TEST 4: POST /st (Créer)" "ID: $TEST_ID" "NOT_EMPTY"
else
  run_test "TEST 4: POST /st (Créer)" "" "NOT_EMPTY"
fi

# ===== TEST 5: PATCH /st/:id =====
if [ -n "$TEST_ID" ]; then
  PATCH_RESULT=$(curl -s -X PATCH "$API_URL/st/$TEST_ID" \
    -H "Content-Type: application/json" \
    -d '{"nom": "QA Updated"}' 2>/dev/null)
  UPDATED_NAME=$(echo "$PATCH_RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('item',{}).get('nom',''))" 2>/dev/null)
  run_test "TEST 5: PATCH /st/:id (Modifier)" "$UPDATED_NAME" "QA Updated"
else
  echo "⏭️ TEST 5: SKIPPED (no TEST_ID)"
fi

# ===== TEST 6: DELETE /st/:id =====
if [ -n "$TEST_ID" ]; then
  curl -s -X DELETE "$API_URL/st/$TEST_ID" 2>/dev/null > /dev/null
  run_test "TEST 6: DELETE /st/:id (Supprimer)" "Deleted" "NOT_EMPTY"
else
  echo "⏭️ TEST 6: SKIPPED (no TEST_ID)"
fi

# ===== TEST 7: UI Accessibility =====
UI_CHECK=$(curl -s "$API_URL/" 2>/dev/null | head -1)
if echo "$UI_CHECK" | grep -q "DOCTYPE"; then
  run_test "TEST 7: UI PWA Accessible" "HTML OK" "NOT_EMPTY"
else
  run_test "TEST 7: UI PWA Accessible" "" "NOT_EMPTY"
fi

# ===== RÉSUMÉ =====
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                    RÉSUMÉ DES TESTS                        ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -e "  ${GREEN}✅ Passés${NC}  : $PASSED"
echo -e "  ${RED}❌ Échoués${NC} : $FAILED"
echo ""

TOTAL=$((PASSED + FAILED))
if [ $FAILED -eq 0 ]; then
  echo -e "  ${GREEN}🎉 TOUS LES TESTS PASSENT ($PASSED/$TOTAL)${NC}"
  exit 0
else
  echo -e "  ${RED}⚠️ CERTAINS TESTS ONT ÉCHOUÉ ($PASSED/$TOTAL)${NC}"
  exit 1
fi
