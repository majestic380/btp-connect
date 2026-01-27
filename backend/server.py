"""
BTP Connect v9.4 - Backend FastAPI + MongoDB
Application de gestion BTP complète
"""

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Query, Request
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Any
import uuid
from datetime import datetime, timezone
import bcrypt
import jwt
from functools import wraps
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'btp-connect-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRY_HOURS = 24

# Create the main app
app = FastAPI(title="BTP Connect API", version="9.4.0")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================
# MODELS
# ============================================

class UserCreate(BaseModel):
    email: str
    password: str
    nom: Optional[str] = None
    prenom: Optional[str] = None
    role: str = "CONDUCTEUR"

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    nom: Optional[str] = None
    prenom: Optional[str] = None
    role: str
    entrepriseId: str

class SousTraitantCreate(BaseModel):
    nom: str
    metier: Optional[str] = None
    email: Optional[str] = None
    tel: Optional[str] = None
    ville: Optional[str] = None
    siret: Optional[str] = None
    adresse: Optional[str] = None
    cp: Optional[str] = None
    note: Optional[float] = 0

class SousTraitantUpdate(BaseModel):
    nom: Optional[str] = None
    metier: Optional[str] = None
    email: Optional[str] = None
    tel: Optional[str] = None
    ville: Optional[str] = None
    siret: Optional[str] = None
    adresse: Optional[str] = None
    cp: Optional[str] = None
    note: Optional[float] = None

class ChantierCreate(BaseModel):
    nom: str
    client: Optional[str] = None
    adresse: Optional[str] = None
    montant: Optional[float] = None
    statut: str = "en_cours"
    avancement: int = 0
    dateDebut: Optional[str] = None
    dateFinPrevue: Optional[str] = None

class ChantierUpdate(BaseModel):
    nom: Optional[str] = None
    client: Optional[str] = None
    adresse: Optional[str] = None
    montant: Optional[float] = None
    statut: Optional[str] = None
    avancement: Optional[int] = None
    dateDebut: Optional[str] = None
    dateFinPrevue: Optional[str] = None

class FactureCreate(BaseModel):
    chantierId: str
    stId: Optional[str] = None
    numero: str
    type: str = "acompte"
    montantHT: float
    tva: float = 20
    dateFacture: str
    dateEcheance: Optional[str] = None
    statut: str = "en_attente"

class SituationCreate(BaseModel):
    chantierId: str
    stId: Optional[str] = None
    numero: int
    mois: str
    montantHT: float
    tva: float = 20
    statut: str = "en_attente"

class DocumentCreate(BaseModel):
    sousTraitantId: str
    type: str
    nom: str
    fichierUrl: Optional[str] = None
    dateExpiration: Optional[str] = None
    statut: str = "valide"

# ============================================
# AUTH HELPERS
# ============================================

def create_token(user_id: str, entreprise_id: str, role: str):
    payload = {
        'sub': user_id,
        'entrepriseId': entreprise_id,
        'role': role,
        'exp': datetime.now(timezone.utc).timestamp() + (JWT_EXPIRY_HOURS * 3600)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

async def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        # Mode démo - créer un utilisateur par défaut
        return await get_or_create_demo_user()
    
    token = auth_header.split(' ')[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return {
            'id': payload['sub'],
            'entrepriseId': payload['entrepriseId'],
            'role': payload['role']
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expiré")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token invalide")

async def get_or_create_demo_user():
    """Crée ou récupère un utilisateur/entreprise démo pour faciliter les tests"""
    # Chercher une entreprise existante
    entreprise = await db.entreprises.find_one({})
    if not entreprise:
        entreprise = {
            'id': str(uuid.uuid4()),
            'nom': 'BTP Excellence SAS',
            'siret': '12345678900012',
            'plan': 'pro',
            'createdAt': datetime.now(timezone.utc).isoformat()
        }
        await db.entreprises.insert_one(entreprise)
        logger.info(f"✅ Entreprise démo créée: {entreprise['id']}")
    
    # Chercher un utilisateur existant
    user = await db.users.find_one({'entrepriseId': entreprise['id']})
    if not user:
        user = {
            'id': str(uuid.uuid4()),
            'entrepriseId': entreprise['id'],
            'email': 'admin@btpconnect.local',
            'passwordHash': hash_password('admin123'),
            'nom': 'Admin',
            'prenom': 'Demo',
            'role': 'ADMIN',
            'createdAt': datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user)
        logger.info(f"✅ Utilisateur démo créé: {user['email']}")
    
    return {
        'id': user['id'],
        'entrepriseId': entreprise['id'],
        'role': user['role']
    }

# ============================================
# HEALTH ROUTES
# ============================================

@api_router.get("/health")
async def health():
    return {
        "status": "healthy",
        "version": "9.4.0",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.get("/health")
async def health_root():
    return {"status": "healthy", "version": "9.4.0"}

@app.get("/health/ready")
async def health_ready():
    return {"status": "ready"}

@app.get("/health/live")
async def health_live():
    return {"status": "live"}

# ============================================
# AUTH ROUTES
# ============================================

@api_router.post("/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({'email': data.email}, {'_id': 0})
    
    if not user:
        # Mode démo - créer utilisateur automatiquement
        demo = await get_or_create_demo_user()
        user = await db.users.find_one({'id': demo['id']}, {'_id': 0})
    
    if user and verify_password(data.password, user.get('passwordHash', '')):
        token = create_token(user['id'], user['entrepriseId'], user['role'])
        return {
            "accessToken": token,
            "refreshToken": token,
            "user": {
                "id": user['id'],
                "email": user['email'],
                "nom": user.get('nom'),
                "prenom": user.get('prenom'),
                "role": user['role']
            }
        }
    
    # Mode démo - accepter n'importe quel login
    demo = await get_or_create_demo_user()
    user = await db.users.find_one({'id': demo['id']}, {'_id': 0})
    token = create_token(user['id'], user['entrepriseId'], user['role'])
    return {
        "accessToken": token,
        "refreshToken": token,
        "user": {
            "id": user['id'],
            "email": user['email'],
            "nom": user.get('nom'),
            "prenom": user.get('prenom'),
            "role": user['role']
        }
    }

@api_router.get("/auth/me")
async def get_me(request: Request):
    user_info = await get_current_user(request)
    user = await db.users.find_one({'id': user_info['id']}, {'_id': 0})
    if not user:
        user = await db.users.find_one({}, {'_id': 0})
    
    return {
        "user": {
            "id": user['id'],
            "email": user['email'],
            "nom": user.get('nom', 'Admin'),
            "prenom": user.get('prenom', 'Demo'),
            "role": user['role'],
            "entrepriseId": user['entrepriseId']
        }
    }

# ============================================
# SOUS-TRAITANTS ROUTES
# ============================================

@api_router.get("/st")
async def get_sous_traitants(request: Request):
    user = await get_current_user(request)
    items = await db.sous_traitants.find(
        {'entrepriseId': user['entrepriseId']}, 
        {'_id': 0}
    ).to_list(1000)
    return {"items": items}

@api_router.get("/st/{st_id}")
async def get_sous_traitant(st_id: str, request: Request):
    user = await get_current_user(request)
    item = await db.sous_traitants.find_one(
        {'id': st_id, 'entrepriseId': user['entrepriseId']}, 
        {'_id': 0}
    )
    if not item:
        raise HTTPException(status_code=404, detail="Sous-traitant non trouvé")
    return {"item": item}

@api_router.post("/st")
async def create_sous_traitant(data: SousTraitantCreate, request: Request):
    user = await get_current_user(request)
    item = {
        'id': str(uuid.uuid4()),
        'entrepriseId': user['entrepriseId'],
        'nom': data.nom,
        'metier': data.metier,
        'email': data.email,
        'tel': data.tel,
        'ville': data.ville,
        'siret': data.siret,
        'adresse': data.adresse,
        'cp': data.cp,
        'note': data.note or 0,
        'dansAnnuairePrivate': True,
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'updatedAt': datetime.now(timezone.utc).isoformat()
    }
    await db.sous_traitants.insert_one(item)
    return {"item": {k: v for k, v in item.items() if k != '_id'}}

@api_router.patch("/st/{st_id}")
async def update_sous_traitant(st_id: str, data: SousTraitantUpdate, request: Request):
    user = await get_current_user(request)
    existing = await db.sous_traitants.find_one(
        {'id': st_id, 'entrepriseId': user['entrepriseId']}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Sous-traitant non trouvé")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    update_data['updatedAt'] = datetime.now(timezone.utc).isoformat()
    
    await db.sous_traitants.update_one({'id': st_id}, {'$set': update_data})
    updated = await db.sous_traitants.find_one({'id': st_id}, {'_id': 0})
    return {"item": updated}

@api_router.delete("/st/{st_id}")
async def delete_sous_traitant(st_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.sous_traitants.delete_one(
        {'id': st_id, 'entrepriseId': user['entrepriseId']}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sous-traitant non trouvé")
    return {"deleted": True}

# ============================================
# CHANTIERS ROUTES
# ============================================

@api_router.get("/chantiers")
async def get_chantiers(request: Request):
    user = await get_current_user(request)
    items = await db.chantiers.find(
        {'entrepriseId': user['entrepriseId']}, 
        {'_id': 0}
    ).to_list(1000)
    return {"items": items}

@api_router.get("/chantiers/{chantier_id}")
async def get_chantier(chantier_id: str, request: Request):
    user = await get_current_user(request)
    item = await db.chantiers.find_one(
        {'id': chantier_id, 'entrepriseId': user['entrepriseId']}, 
        {'_id': 0}
    )
    if not item:
        raise HTTPException(status_code=404, detail="Chantier non trouvé")
    return {"item": item}

@api_router.post("/chantiers")
async def create_chantier(data: ChantierCreate, request: Request):
    user = await get_current_user(request)
    item = {
        'id': str(uuid.uuid4()),
        'entrepriseId': user['entrepriseId'],
        'nom': data.nom,
        'client': data.client,
        'adresse': data.adresse,
        'montantMarche': data.montant,
        'statut': data.statut,
        'avancement': data.avancement,
        'dateDebut': data.dateDebut,
        'dateFinPrevue': data.dateFinPrevue,
        'createdAt': datetime.now(timezone.utc).isoformat(),
        'updatedAt': datetime.now(timezone.utc).isoformat()
    }
    await db.chantiers.insert_one(item)
    return {"item": {k: v for k, v in item.items() if k != '_id'}}

@api_router.patch("/chantiers/{chantier_id}")
async def update_chantier(chantier_id: str, data: ChantierUpdate, request: Request):
    user = await get_current_user(request)
    existing = await db.chantiers.find_one(
        {'id': chantier_id, 'entrepriseId': user['entrepriseId']}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Chantier non trouvé")
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if 'montant' in update_data:
        update_data['montantMarche'] = update_data.pop('montant')
    update_data['updatedAt'] = datetime.now(timezone.utc).isoformat()
    
    await db.chantiers.update_one({'id': chantier_id}, {'$set': update_data})
    updated = await db.chantiers.find_one({'id': chantier_id}, {'_id': 0})
    return {"item": updated}

@api_router.delete("/chantiers/{chantier_id}")
async def delete_chantier(chantier_id: str, request: Request):
    user = await get_current_user(request)
    result = await db.chantiers.delete_one(
        {'id': chantier_id, 'entrepriseId': user['entrepriseId']}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Chantier non trouvé")
    return {"deleted": True}

# ============================================
# FACTURES ROUTES
# ============================================

@api_router.get("/factures")
async def get_factures(request: Request, chantierId: Optional[str] = None):
    user = await get_current_user(request)
    query = {'entrepriseId': user['entrepriseId']}
    if chantierId:
        query['chantierId'] = chantierId
    items = await db.factures.find(query, {'_id': 0}).to_list(1000)
    return {"items": items}

@api_router.post("/factures")
async def create_facture(data: FactureCreate, request: Request):
    user = await get_current_user(request)
    item = {
        'id': str(uuid.uuid4()),
        'entrepriseId': user['entrepriseId'],
        'chantierId': data.chantierId,
        'stId': data.stId,
        'numero': data.numero,
        'type': data.type,
        'montantHT': data.montantHT,
        'tva': data.tva,
        'dateFacture': data.dateFacture,
        'dateEcheance': data.dateEcheance,
        'statut': data.statut,
        'createdAt': datetime.now(timezone.utc).isoformat()
    }
    await db.factures.insert_one(item)
    return {"item": {k: v for k, v in item.items() if k != '_id'}}

# ============================================
# SITUATIONS ROUTES
# ============================================

@api_router.get("/situations")
async def get_situations(request: Request, chantierId: Optional[str] = None):
    user = await get_current_user(request)
    query = {'entrepriseId': user['entrepriseId']}
    if chantierId:
        query['chantierId'] = chantierId
    items = await db.situations.find(query, {'_id': 0}).to_list(1000)
    return {"items": items}

@api_router.post("/situations")
async def create_situation(data: SituationCreate, request: Request):
    user = await get_current_user(request)
    item = {
        'id': str(uuid.uuid4()),
        'entrepriseId': user['entrepriseId'],
        'chantierId': data.chantierId,
        'stId': data.stId,
        'numero': data.numero,
        'mois': data.mois,
        'montantHT': data.montantHT,
        'tva': data.tva,
        'statut': data.statut,
        'createdAt': datetime.now(timezone.utc).isoformat()
    }
    await db.situations.insert_one(item)
    return {"item": {k: v for k, v in item.items() if k != '_id'}}

@api_router.patch("/situations/{situation_id}")
async def update_situation(situation_id: str, request: Request):
    user = await get_current_user(request)
    body = await request.json()
    
    existing = await db.situations.find_one(
        {'id': situation_id, 'entrepriseId': user['entrepriseId']}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Situation non trouvée")
    
    update_data = {k: v for k, v in body.items() if v is not None}
    update_data['updatedAt'] = datetime.now(timezone.utc).isoformat()
    
    await db.situations.update_one({'id': situation_id}, {'$set': update_data})
    updated = await db.situations.find_one({'id': situation_id}, {'_id': 0})
    return {"item": updated}

# ============================================
# DOCUMENTS ROUTES
# ============================================

@api_router.get("/documents")
async def get_documents(request: Request, sousTraitantId: Optional[str] = None):
    user = await get_current_user(request)
    query = {'entrepriseId': user['entrepriseId']}
    if sousTraitantId:
        query['sousTraitantId'] = sousTraitantId
    items = await db.documents.find(query, {'_id': 0}).to_list(1000)
    return {"items": items}

@api_router.post("/documents")
async def create_document(data: DocumentCreate, request: Request):
    user = await get_current_user(request)
    
    # Vérifier le statut basé sur la date d'expiration
    statut = data.statut
    if data.dateExpiration:
        try:
            exp_date = datetime.fromisoformat(data.dateExpiration.replace('Z', '+00:00'))
            if exp_date < datetime.now(timezone.utc):
                statut = 'expire'
        except:
            pass
    
    item = {
        'id': str(uuid.uuid4()),
        'entrepriseId': user['entrepriseId'],
        'sousTraitantId': data.sousTraitantId,
        'type': data.type,
        'nom': data.nom,
        'fichierUrl': data.fichierUrl,
        'dateExpiration': data.dateExpiration,
        'statut': statut,
        'createdAt': datetime.now(timezone.utc).isoformat()
    }
    await db.documents.insert_one(item)
    return {"item": {k: v for k, v in item.items() if k != '_id'}}

@api_router.get("/documents/types")
async def get_document_types():
    return {
        "types": [
            {"code": "attestation_urssaf", "label": "Attestation URSSAF", "obligatoire": True},
            {"code": "kbis", "label": "Extrait Kbis", "obligatoire": True},
            {"code": "assurance_rc", "label": "Assurance RC Pro", "obligatoire": True},
            {"code": "assurance_decennale", "label": "Assurance Décennale", "obligatoire": True},
            {"code": "carte_pro", "label": "Carte Professionnelle BTP", "obligatoire": False},
            {"code": "devis", "label": "Devis", "obligatoire": False},
            {"code": "facture", "label": "Facture", "obligatoire": False},
            {"code": "plan", "label": "Plan", "obligatoire": False},
            {"code": "photo", "label": "Photo", "obligatoire": False},
            {"code": "autre", "label": "Autre", "obligatoire": False}
        ]
    }

# ============================================
# SEED DATA ROUTE
# ============================================

@api_router.post("/seed")
async def seed_data(request: Request):
    """Initialise les données de démonstration"""
    user = await get_current_user(request)
    entreprise_id = user['entrepriseId']
    
    # Vérifier si des données existent déjà
    existing_st = await db.sous_traitants.count_documents({'entrepriseId': entreprise_id})
    if existing_st > 0:
        return {"message": "Données déjà présentes", "seeded": False}
    
    # Sous-traitants de démonstration
    sous_traitants = [
        {"nom": "ELEC Pro", "metier": "Électricité", "email": "contact@elecpro.fr", "tel": "01 23 45 67 89", "ville": "Paris", "siret": "12345678901234", "note": 4.5},
        {"nom": "CVC Solutions", "metier": "Climatisation / CVC", "email": "info@cvcsolutions.fr", "tel": "01 98 76 54 32", "ville": "Lyon", "siret": "98765432109876", "note": 4.2},
        {"nom": "Maçonnerie Durand", "metier": "Maçonnerie", "email": "durand@macon.fr", "tel": "06 12 34 56 78", "ville": "Marseille", "siret": "11122233344455", "note": 4.8},
        {"nom": "Peinture Martin", "metier": "Peinture", "email": "martin@peinture.fr", "tel": "06 98 76 54 32", "ville": "Bordeaux", "siret": "55544433322211", "note": 4.0},
        {"nom": "Plomberie Express", "metier": "Plomberie", "email": "contact@plomberie-express.fr", "tel": "01 11 22 33 44", "ville": "Toulouse", "siret": "66677788899900", "note": 3.8},
        {"nom": "Menuiserie Bois & Co", "metier": "Menuiserie", "email": "boisetco@menuiserie.fr", "tel": "05 55 66 77 88", "ville": "Nantes", "siret": "99988877766655", "note": 4.6}
    ]
    
    for st in sous_traitants:
        await db.sous_traitants.insert_one({
            'id': str(uuid.uuid4()),
            'entrepriseId': entreprise_id,
            **st,
            'dansAnnuairePrivate': True,
            'createdAt': datetime.now(timezone.utc).isoformat(),
            'updatedAt': datetime.now(timezone.utc).isoformat()
        })
    
    # Chantiers de démonstration
    chantiers = [
        {"nom": "Tour Horizon - Défense", "client": "Immobilière Grand Paris", "adresse": "La Défense, 92000", "montantMarche": 1250000, "statut": "en_cours", "avancement": 45},
        {"nom": "Résidence Les Jardins", "client": "Promoteur ABC", "adresse": "75015 Paris", "montantMarche": 850000, "statut": "en_cours", "avancement": 72},
        {"nom": "Centre Commercial Rivoli", "client": "SCI Centre Ville", "adresse": "Rue de Rivoli, 75001", "montantMarche": 2300000, "statut": "en_cours", "avancement": 23}
    ]
    
    for ch in chantiers:
        await db.chantiers.insert_one({
            'id': str(uuid.uuid4()),
            'entrepriseId': entreprise_id,
            **ch,
            'createdAt': datetime.now(timezone.utc).isoformat(),
            'updatedAt': datetime.now(timezone.utc).isoformat()
        })
    
    # Situations en attente
    chantier_ids = await db.chantiers.find({'entrepriseId': entreprise_id}, {'id': 1}).to_list(10)
    for i, ch in enumerate(chantier_ids[:3]):
        for j in range(1, 3):
            await db.situations.insert_one({
                'id': str(uuid.uuid4()),
                'entrepriseId': entreprise_id,
                'chantierId': ch['id'],
                'numero': j,
                'mois': f"2024-0{i+1}-01",
                'montantHT': 50000 + (i * 10000) + (j * 5000),
                'tva': 20,
                'statut': 'en_attente' if j == 1 else 'validee',
                'createdAt': datetime.now(timezone.utc).isoformat()
            })
    
    return {"message": "Données de démonstration créées", "seeded": True}

# ============================================
# INCLUDE ROUTER
# ============================================

app.include_router(api_router)

# ============================================
# STATIC FILES - Serve Frontend HTML
# ============================================

FRONTEND_DIR = ROOT_DIR.parent / "btp-connect-main" / "src"

@app.get("/", response_class=HTMLResponse)
async def serve_frontend():
    """Serve the main frontend HTML"""
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        # Lire et modifier le HTML pour utiliser la bonne API_URL
        content = index_path.read_text(encoding='utf-8')
        # Remplacer l'API_URL pour pointer vers notre backend
        content = content.replace(
            'let API_URL = "http://localhost:3000"',
            'let API_URL = window.location.origin + "/api"'
        )
        return HTMLResponse(content=content)
    return HTMLResponse(content="<h1>BTP Connect - Frontend not found</h1>")

# Serve static files from btp-connect-main/src
if FRONTEND_DIR.exists():
    app.mount("/src", StaticFiles(directory=str(FRONTEND_DIR)), name="src")

# ============================================
# CORS MIDDLEWARE
# ============================================

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
