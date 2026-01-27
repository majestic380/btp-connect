// ============================================
// 🌱 BTP CONNECT v9.0 - SEED DATABASE (MySQL)
// ============================================

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Démarrage du seed BTP Connect (MySQL)...');

  // 1. Créer l'entreprise principale
  let entreprise = await prisma.entreprise.findFirst();
  
  if (!entreprise) {
    entreprise = await prisma.entreprise.create({
      data: {
        nom: 'BTP Excellence SAS',
        siret: '123 456 789 00012',
        adresse: '15 rue de la Construction',
        cp: '75001',
        ville: 'Paris',
        tel: '01 23 45 67 89',
        email: 'contact@btp-excellence.fr',
        plan: 'pro'
      }
    });
    console.log(`✅ Entreprise créée: ${entreprise.nom}`);
  } else {
    console.log(`⏭️ Entreprise existante: ${entreprise.nom}`);
  }

  // 2. Créer les utilisateurs
  const users = [
    { email: 'admin@btpconnect.local', password: 'BtpConnect2026!', nom: 'Jérémie', prenom: 'Durand', role: 'ADMIN' as const },
    { email: 'conducteur@btpconnect.local', password: 'Conducteur123!', nom: 'Marie', prenom: 'Martin', role: 'CONDUCTEUR' as const },
    { email: 'comptable@btpconnect.local', password: 'Comptable123!', nom: 'Pierre', prenom: 'Lefebvre', role: 'COMPTABLE' as const }
  ];

  for (const user of users) {
    const existing = await prisma.user.findUnique({ where: { email: user.email } });
    if (!existing) {
      const passwordHash = await bcrypt.hash(user.password, 10);
      await prisma.user.create({
        data: {
          entrepriseId: entreprise.id,
          email: user.email,
          passwordHash,
          nom: user.nom,
          prenom: user.prenom,
          role: user.role
        }
      });
      console.log(`✅ Utilisateur créé: ${user.email} (${user.role})`);
    } else {
      console.log(`⏭️ Utilisateur existant: ${user.email}`);
    }
  }

  // 3. Créer les sous-traitants
  const sousTraitants = [
    { nom: 'Électricité Durand', siret: '412 345 678 00012', metier: 'Électricité', ville: 'Paris', tel: '01 23 45 67 90', email: 'contact@durand-elec.fr', note: 4.8 },
    { nom: 'CVC Martin & Fils', siret: '523 456 789 00034', metier: 'CVC / Climatisation', ville: 'Lyon', tel: '04 78 12 34 56', email: 'contact@cvc-martin.fr', note: 4.5 },
    { nom: 'Plomberie Sanchez', siret: '634 567 890 00056', metier: 'Plomberie', ville: 'Marseille', tel: '04 91 23 45 67', email: 'contact@plomberie-sanchez.fr', note: 4.2 },
    { nom: 'Maçonnerie Lefebvre', siret: '745 678 901 00078', metier: 'Maçonnerie', ville: 'Bordeaux', tel: '05 56 12 34 56', email: 'contact@lefebvre-maco.fr', note: 4.9 },
    { nom: 'Peinture Bernard', siret: '856 789 012 00090', metier: 'Peinture / Finitions', ville: 'Toulouse', tel: '05 61 23 45 67', email: 'contact@peinture-bernard.fr', note: 4.6 },
    { nom: 'Menuiserie Petit', siret: '967 890 123 00012', metier: 'Menuiserie', ville: 'Nantes', tel: '02 40 12 34 56', email: 'contact@menuiserie-petit.fr', note: 4.7 }
  ];

  for (const st of sousTraitants) {
    const existing = await prisma.sousTraitant.findFirst({
      where: { entrepriseId: entreprise.id, nom: st.nom }
    });
    
    if (!existing) {
      await prisma.sousTraitant.create({
        data: {
          entrepriseId: entreprise.id,
          ...st,
          dansAnnuairePrivate: true,
          ajouteManuellement: false
        }
      });
      console.log(`✅ Sous-traitant créé: ${st.nom}`);
    } else {
      console.log(`⏭️ Sous-traitant existant: ${st.nom}`);
    }
  }

  // 4. Créer les chantiers
  const chantiers = [
    { nom: 'Résidence Les Tilleuls', client: 'SCI Les Tilleuls', adresse: '12 rue des Fleurs', cp: '75016', ville: 'Paris', montantMarche: 450000, statut: 'en_cours', avancement: 45 },
    { nom: 'Immeuble Green Park', client: 'Nexity Immobilier', adresse: '45 avenue de la République', cp: '92100', ville: 'Boulogne', montantMarche: 680000, statut: 'en_cours', avancement: 72 },
    { nom: 'Centre Commercial Étoile', client: 'Unibail-Rodamco', adresse: 'Place de l\'Étoile', cp: '93200', ville: 'Saint-Denis', montantMarche: 1200000, statut: 'en_cours', avancement: 28 }
  ];

  for (const chantier of chantiers) {
    const existing = await prisma.chantier.findFirst({
      where: { entrepriseId: entreprise.id, nom: chantier.nom }
    });
    
    if (!existing) {
      await prisma.chantier.create({
        data: {
          entrepriseId: entreprise.id,
          ...chantier
        }
      });
      console.log(`✅ Chantier créé: ${chantier.nom}`);
    } else {
      console.log(`⏭️ Chantier existant: ${chantier.nom}`);
    }
  }

  // 5. Créer des contrats (ContratST)
  const chantiersDB = await prisma.chantier.findMany({ where: { entrepriseId: entreprise.id } });
  const sousTraitantsDB = await prisma.sousTraitant.findMany({ where: { entrepriseId: entreprise.id } });

  if (chantiersDB.length > 0 && sousTraitantsDB.length > 0) {
    const contratsData = [
      { chantierIdx: 0, stIdx: 0, objet: 'Électricité CFO/CFA', montantHT: 85000 },
      { chantierIdx: 0, stIdx: 1, objet: 'CVC Climatisation', montantHT: 120000 },
      { chantierIdx: 0, stIdx: 2, objet: 'Plomberie sanitaire', montantHT: 45000 },
      { chantierIdx: 1, stIdx: 0, objet: 'Électricité CFO/CFA', montantHT: 95000 },
      { chantierIdx: 1, stIdx: 3, objet: 'Maçonnerie gros œuvre', montantHT: 180000 },
      { chantierIdx: 2, stIdx: 4, objet: 'Peinture et finitions', montantHT: 65000 }
    ];

    for (const c of contratsData) {
      if (chantiersDB[c.chantierIdx] && sousTraitantsDB[c.stIdx]) {
        const existing = await prisma.contratST.findFirst({
          where: { 
            chantierId: chantiersDB[c.chantierIdx].id,
            sousTraitantId: sousTraitantsDB[c.stIdx].id
          }
        });
        
        if (!existing) {
          await prisma.contratST.create({
            data: {
              chantierId: chantiersDB[c.chantierIdx].id,
              sousTraitantId: sousTraitantsDB[c.stIdx].id,
              objet: c.objet,
              montantHT: c.montantHT,
              dateDebut: new Date()
            }
          });
          console.log(`✅ Contrat créé: ${c.objet} sur ${chantiersDB[c.chantierIdx].nom}`);
        }
      }
    }
  }

  // 6. Créer des Feature Flags par défaut
  const featureFlags = [
    { code: 'MODULE_MARCHES', nom: 'Suivi Financier Marchés', category: 'MODULE' as const, icone: '💰' },
    { code: 'MODULE_CR', nom: 'Comptes Rendus Chantier', category: 'MODULE' as const, icone: '📋' },
    { code: 'MODULE_GED', nom: 'GED & Visionneuse', category: 'MODULE' as const, icone: '📁' },
    { code: 'MODULE_AO', nom: 'Appels d\'Offres', category: 'MODULE' as const, icone: '📨' },
    { code: 'FEATURE_IA_ANALYSE', nom: 'Analyse IA des documents', category: 'FEATURE' as const, icone: '🤖' },
    { code: 'FEATURE_PDF_EXPORT', nom: 'Export PDF', category: 'FEATURE' as const, icone: '📄' }
  ];

  for (const ff of featureFlags) {
    const existing = await prisma.featureFlag.findFirst({
      where: { code: ff.code, entrepriseId: null }
    });
    
    if (!existing) {
      await prisma.featureFlag.create({
        data: {
          ...ff,
          enabled: true,
          enabledDesktop: true,
          enabledMobile: true,
          enabledWeb: true,
          platform: 'ALL'
        }
      });
      console.log(`✅ Feature Flag créé: ${ff.nom}`);
    }
  }

  console.log('\n🎉 Seed terminé avec succès !');
  console.log('📧 Connexion: admin@btpconnect.local / BtpConnect2026!');
}

main()
  .catch((e) => {
    console.error('❌ Erreur lors du seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
