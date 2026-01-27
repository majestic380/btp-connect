#!/usr/bin/env python3
"""
BTP Connect v9.4 - Backend API Testing Suite
Tests all backend APIs for the construction management system
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, Any, Optional

class BTPConnectAPITester:
    def __init__(self, base_url: str = "https://analyse-corrige.preview.emergentagent.com"):
        self.base_url = base_url.rstrip('/')
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.failed_tests = []
        self.session = requests.Session()
        self.session.headers.update({'Content-Type': 'application/json'})
        
        print(f"🏗️ BTP Connect API Tester")
        print(f"📡 Base URL: {self.base_url}")
        print(f"⏰ Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 60)

    def run_test(self, name: str, method: str, endpoint: str, expected_status: int, 
                 data: Optional[Dict] = None, headers: Optional[Dict] = None) -> tuple[bool, Dict]:
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        test_headers = self.session.headers.copy()
        if headers:
            test_headers.update(headers)
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'

        self.tests_run += 1
        print(f"\n🔍 Test {self.tests_run}: {name}")
        print(f"   {method} {url}")
        
        try:
            if method == 'GET':
                response = self.session.get(url, headers=test_headers)
            elif method == 'POST':
                response = self.session.post(url, json=data, headers=test_headers)
            elif method == 'PATCH':
                response = self.session.patch(url, json=data, headers=test_headers)
            elif method == 'DELETE':
                response = self.session.delete(url, headers=test_headers)
            else:
                raise ValueError(f"Unsupported method: {method}")

            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                print(f"   ✅ PASSED - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    if isinstance(response_data, dict) and len(str(response_data)) < 200:
                        print(f"   📄 Response: {response_data}")
                except:
                    print(f"   📄 Response: {response.text[:100]}...")
            else:
                print(f"   ❌ FAILED - Expected {expected_status}, got {response.status_code}")
                print(f"   📄 Response: {response.text[:200]}...")
                self.failed_tests.append({
                    'name': name,
                    'method': method,
                    'endpoint': endpoint,
                    'expected': expected_status,
                    'actual': response.status_code,
                    'response': response.text[:500]
                })

            try:
                return success, response.json()
            except:
                return success, {'raw_response': response.text}

        except Exception as e:
            print(f"   ❌ FAILED - Error: {str(e)}")
            self.failed_tests.append({
                'name': name,
                'method': method,
                'endpoint': endpoint,
                'error': str(e)
            })
            return False, {}

    def test_health_endpoints(self):
        """Test health check endpoints"""
        print("\n🏥 === HEALTH ENDPOINTS ===")
        
        # Test main health endpoint
        self.run_test("Health Check", "GET", "/api/health", 200)
        
        # Test root health endpoints
        self.run_test("Root Health", "GET", "/health", 200)
        self.run_test("Health Ready", "GET", "/health/ready", 200)
        self.run_test("Health Live", "GET", "/health/live", 200)

    def test_authentication(self):
        """Test authentication endpoints"""
        print("\n🔐 === AUTHENTICATION ===")
        
        # Test login with demo credentials
        success, response = self.run_test(
            "Login with Demo Credentials",
            "POST",
            "/api/auth/login",
            200,
            data={"email": "admin@btpconnect.local", "password": "admin123"}
        )
        
        if success and 'accessToken' in response:
            self.token = response['accessToken']
            print(f"   🎫 Token obtained: {self.token[:20]}...")
        
        # Test login with any credentials (demo mode)
        success, response = self.run_test(
            "Login with Any Credentials (Demo Mode)",
            "POST",
            "/api/auth/login",
            200,
            data={"email": "test@example.com", "password": "test123"}
        )
        
        # Test get current user
        if self.token:
            self.run_test("Get Current User", "GET", "/api/auth/me", 200)

    def test_sous_traitants_crud(self):
        """Test sous-traitants (subcontractors) CRUD operations"""
        print("\n👷 === SOUS-TRAITANTS CRUD ===")
        
        # Test GET all sous-traitants
        success, response = self.run_test("Get All Sous-Traitants", "GET", "/api/st", 200)
        
        # Test POST create sous-traitant
        st_data = {
            "nom": "Test Électricité SARL",
            "metier": "Électricité",
            "email": "test@electricite.fr",
            "tel": "01 23 45 67 89",
            "ville": "Paris",
            "siret": "12345678901234",
            "adresse": "123 rue de Test",
            "cp": "75001",
            "note": 4.5
        }
        
        success, response = self.run_test(
            "Create Sous-Traitant",
            "POST",
            "/api/st",
            200,
            data=st_data
        )
        
        created_st_id = None
        if success and 'item' in response and 'id' in response['item']:
            created_st_id = response['item']['id']
            print(f"   🆔 Created ST ID: {created_st_id}")
        
        # Test GET specific sous-traitant
        if created_st_id:
            self.run_test(
                "Get Specific Sous-Traitant",
                "GET",
                f"/api/st/{created_st_id}",
                200
            )
            
            # Test PATCH update sous-traitant
            update_data = {
                "note": 5.0,
                "email": "updated@electricite.fr"
            }
            self.run_test(
                "Update Sous-Traitant",
                "PATCH",
                f"/api/st/{created_st_id}",
                200,
                data=update_data
            )
            
            # Test DELETE sous-traitant
            self.run_test(
                "Delete Sous-Traitant",
                "DELETE",
                f"/api/st/{created_st_id}",
                200
            )

    def test_chantiers_crud(self):
        """Test chantiers (construction sites) CRUD operations"""
        print("\n🏗️ === CHANTIERS CRUD ===")
        
        # Test GET all chantiers
        self.run_test("Get All Chantiers", "GET", "/api/chantiers", 200)
        
        # Test POST create chantier
        chantier_data = {
            "nom": "Test Construction Site",
            "client": "Test Client SAS",
            "adresse": "456 avenue de Test",
            "montant": 500000.0,
            "statut": "en_cours",
            "avancement": 25,
            "dateDebut": "2024-01-15",
            "dateFinPrevue": "2024-12-31"
        }
        
        success, response = self.run_test(
            "Create Chantier",
            "POST",
            "/api/chantiers",
            200,
            data=chantier_data
        )
        
        created_chantier_id = None
        if success and 'item' in response and 'id' in response['item']:
            created_chantier_id = response['item']['id']
            print(f"   🆔 Created Chantier ID: {created_chantier_id}")
        
        # Test GET specific chantier
        if created_chantier_id:
            self.run_test(
                "Get Specific Chantier",
                "GET",
                f"/api/chantiers/{created_chantier_id}",
                200
            )
            
            # Test PATCH update chantier
            update_data = {
                "avancement": 50,
                "statut": "en_cours"
            }
            self.run_test(
                "Update Chantier",
                "PATCH",
                f"/api/chantiers/{created_chantier_id}",
                200,
                data=update_data
            )
            
            # Test DELETE chantier
            self.run_test(
                "Delete Chantier",
                "DELETE",
                f"/api/chantiers/{created_chantier_id}",
                200
            )

    def test_situations_api(self):
        """Test situations API endpoints"""
        print("\n📄 === SITUATIONS API ===")
        
        # Test GET all situations
        self.run_test("Get All Situations", "GET", "/api/situations", 200)
        
        # Test GET situations with chantier filter
        self.run_test("Get Situations with Filter", "GET", "/api/situations?chantierId=test-id", 200)

    def test_factures_api(self):
        """Test factures (invoices) API endpoints"""
        print("\n💶 === FACTURES API ===")
        
        # Test GET all factures
        self.run_test("Get All Factures", "GET", "/api/factures", 200)
        
        # Test GET factures with chantier filter
        self.run_test("Get Factures with Filter", "GET", "/api/factures?chantierId=test-id", 200)

    def test_documents_api(self):
        """Test documents API endpoints"""
        print("\n📁 === DOCUMENTS API ===")
        
        # Test GET all documents
        self.run_test("Get All Documents", "GET", "/api/documents", 200)
        
        # Test GET document types
        self.run_test("Get Document Types", "GET", "/api/documents/types", 200)
        
        # Test GET documents with filter
        self.run_test("Get Documents with Filter", "GET", "/api/documents?sousTraitantId=test-id", 200)

    def test_seed_data(self):
        """Test seed data initialization"""
        print("\n🌱 === SEED DATA ===")
        
        # Test POST seed data
        self.run_test("Initialize Demo Data", "POST", "/api/seed", 200)

    def test_frontend_serving(self):
        """Test frontend HTML serving"""
        print("\n🌐 === FRONTEND SERVING ===")
        
        # Test root endpoint serves HTML
        success, _ = self.run_test("Frontend HTML Serving", "GET", "/", 200)
        
        if success:
            try:
                response = self.session.get(f"{self.base_url}/")
                has_branding = 'BTP Connect' in response.text
                print(f"   📄 Contains BTP Connect branding: {has_branding}")
            except Exception as e:
                print(f"   ⚠️ Could not check branding: {str(e)}")

    def run_all_tests(self):
        """Run all test suites"""
        print("🚀 Starting BTP Connect Backend API Tests...")
        
        # Run test suites in order
        self.test_health_endpoints()
        self.test_authentication()
        self.test_seed_data()  # Initialize demo data first
        self.test_sous_traitants_crud()
        self.test_chantiers_crud()
        self.test_situations_api()
        self.test_factures_api()
        self.test_documents_api()
        self.test_frontend_serving()
        
        # Print final results
        self.print_results()

    def print_results(self):
        """Print test results summary"""
        print("\n" + "=" * 60)
        print("📊 TEST RESULTS SUMMARY")
        print("=" * 60)
        print(f"✅ Tests Passed: {self.tests_passed}/{self.tests_run}")
        print(f"❌ Tests Failed: {len(self.failed_tests)}")
        print(f"📈 Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        if self.failed_tests:
            print(f"\n❌ FAILED TESTS:")
            for i, test in enumerate(self.failed_tests, 1):
                print(f"   {i}. {test['name']}")
                if 'error' in test:
                    print(f"      Error: {test['error']}")
                elif 'actual' in test:
                    print(f"      Expected: {test['expected']}, Got: {test['actual']}")
        
        print(f"\n⏰ Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        return self.tests_passed == self.tests_run

def main():
    """Main test execution"""
    # Use the public endpoint from frontend/.env
    base_url = "https://analyse-corrige.preview.emergentagent.com"
    
    tester = BTPConnectAPITester(base_url)
    success = tester.run_all_tests()
    
    # Return appropriate exit code
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())