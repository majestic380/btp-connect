// ============================================
// 🏗️ BTP CONNECT v9.0 - SERVICE GÉNÉRATION PDF
// Situations de travaux & Comptes Rendus
// ============================================

import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

// Types
interface SituationPDFData {
  marche: {
    reference: string;
    objet: string;
    type: string;
    sousTraitant: { nom: string; siret?: string; adresse?: string };
    chantier: { nom: string; adresse?: string; client?: string };
    montantInitialHT: number;
    montantActuelHT: number;
    tauxRG: number;
  };
  situation: {
    numero: number;
    mois: Date;
    dateDebut: Date;
    dateFin: Date;
    montantTravaux: number;
    montantCumule: number;
    retenueGarantie: number;
    acomptePrecedent: number;
    montantNetHT: number;
    tauxTVA: number;
    montantTTC: number;
  };
  lignes: Array<{
    numero: string;
    designation: string;
    unite: string;
    quantiteMarche: number;
    prixUnitaireHT: number;
    quantiteMois: number;
    quantiteCumul: number;
    montantMois: number;
    montantCumul: number;
  }>;
  entreprise?: {
    nom: string;
    siret?: string;
    adresse?: string;
    logo?: string;
  };
}

interface CRPDFData {
  cr: {
    numero: number;
    dateReunion: Date;
    heureDebut?: string;
    heureFin?: string;
    lieu?: string;
    objetReunion?: string;
    meteo?: string;
    effectifChantier?: number;
  };
  chantier: {
    nom: string;
    adresse?: string;
    client?: string;
  };
  participants: Array<{
    nom: string;
    societe?: string;
    fonction?: string;
    statut: string;
  }>;
  actions: Array<{
    numero: number;
    description: string;
    responsable: string;
    echeance: Date;
    statut: string;
  }>;
  avancements: Array<{
    lot: string;
    entreprise?: string;
    pourcentage: number;
    conformePlanning: boolean;
    retardJours: number;
  }>;
  pointsSecurite?: Array<{
    type: string;
    description: string;
    conforme: boolean;
  }>;
  entreprise?: {
    nom: string;
    logo?: string;
  };
}

// Formatters
const formatMontant = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
const formatDate = (d: Date) => new Date(d).toLocaleDateString('fr-FR');
const formatMois = (d: Date) => new Date(d).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

/**
 * Génère un PDF de situation de travaux
 */
export function generateSituationPDF(data: SituationPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'A4', 
        margin: 40,
        info: {
          Title: `Situation n°${data.situation.numero} - ${data.marche.reference}`,
          Author: data.entreprise?.nom || 'BTP Connect',
          Subject: 'Situation de travaux'
        }
      });
      
      const chunks: Buffer[] = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // En-tête
      doc.fontSize(18).font('Helvetica-Bold')
        .text('SITUATION DE TRAVAUX', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).font('Helvetica')
        .text(`N° ${data.situation.numero} - ${formatMois(data.situation.mois)}`, { align: 'center' });
      doc.moveDown(1);

      // Infos marché
      doc.fontSize(11).font('Helvetica-Bold').text('MARCHÉ');
      doc.fontSize(10).font('Helvetica');
      doc.text(`Référence: ${data.marche.reference}`);
      doc.text(`Objet: ${data.marche.objet}`);
      doc.text(`Type: ${data.marche.type}`);
      doc.text(`Chantier: ${data.marche.chantier.nom}`);
      if (data.marche.chantier.adresse) doc.text(`Adresse: ${data.marche.chantier.adresse}`);
      doc.moveDown(0.5);

      // Titulaire
      doc.fontSize(11).font('Helvetica-Bold').text('TITULAIRE');
      doc.fontSize(10).font('Helvetica');
      doc.text(`${data.marche.sousTraitant.nom}`);
      if (data.marche.sousTraitant.siret) doc.text(`SIRET: ${data.marche.sousTraitant.siret}`);
      if (data.marche.sousTraitant.adresse) doc.text(`${data.marche.sousTraitant.adresse}`);
      doc.moveDown(1);

      // Période
      doc.fontSize(11).font('Helvetica-Bold').text('PÉRIODE');
      doc.fontSize(10).font('Helvetica');
      doc.text(`Du ${formatDate(data.situation.dateDebut)} au ${formatDate(data.situation.dateFin)}`);
      doc.moveDown(1);

      // Tableau des lignes (simplifié)
      if (data.lignes.length > 0) {
        doc.fontSize(11).font('Helvetica-Bold').text('DÉTAIL DES TRAVAUX');
        doc.moveDown(0.5);
        
        // En-têtes tableau
        const tableTop = doc.y;
        const colWidths = [40, 180, 40, 50, 60, 60, 70];
        const headers = ['N°', 'Désignation', 'U', 'Qté mois', 'Qté cum.', 'Mt mois', 'Mt cum.'];
        
        doc.fontSize(8).font('Helvetica-Bold');
        let x = 40;
        headers.forEach((h, i) => {
          doc.text(h, x, tableTop, { width: colWidths[i], align: i > 2 ? 'right' : 'left' });
          x += colWidths[i];
        });
        
        doc.moveTo(40, tableTop + 12).lineTo(555, tableTop + 12).stroke();
        
        // Lignes
        doc.font('Helvetica').fontSize(8);
        let y = tableTop + 16;
        
        for (const ligne of data.lignes.slice(0, 30)) { // Max 30 lignes par page
          if (y > 700) break; // Limite de page
          
          x = 40;
          const values = [
            ligne.numero,
            ligne.designation.substring(0, 40),
            ligne.unite,
            ligne.quantiteMois.toFixed(2),
            ligne.quantiteCumul.toFixed(2),
            formatMontant(ligne.montantMois),
            formatMontant(ligne.montantCumul)
          ];
          
          values.forEach((v, i) => {
            doc.text(String(v), x, y, { width: colWidths[i], align: i > 2 ? 'right' : 'left' });
            x += colWidths[i];
          });
          y += 12;
        }
        
        doc.moveDown(2);
      }

      // Récapitulatif
      doc.fontSize(11).font('Helvetica-Bold').text('RÉCAPITULATIF');
      doc.moveDown(0.5);
      
      const recap = [
        ['Montant marché initial HT', formatMontant(data.marche.montantInitialHT)],
        ['Montant marché actuel HT', formatMontant(data.marche.montantActuelHT)],
        ['', ''],
        ['Travaux du mois HT', formatMontant(data.situation.montantTravaux)],
        ['Cumul travaux HT', formatMontant(data.situation.montantCumule)],
        ['Retenue de garantie (' + data.marche.tauxRG + '%)', '- ' + formatMontant(data.situation.retenueGarantie)],
        ['Acompte précédent', '- ' + formatMontant(data.situation.acomptePrecedent)],
        ['', ''],
        ['MONTANT NET HT', formatMontant(data.situation.montantNetHT)],
        ['TVA (' + data.situation.tauxTVA + '%)', formatMontant(data.situation.montantTTC - data.situation.montantNetHT)],
        ['MONTANT TTC À PAYER', formatMontant(data.situation.montantTTC)]
      ];

      doc.fontSize(10).font('Helvetica');
      const recapX = 300;
      recap.forEach(([label, value]) => {
        if (label === 'MONTANT NET HT' || label === 'MONTANT TTC À PAYER') {
          doc.font('Helvetica-Bold');
        }
        doc.text(label, recapX, doc.y, { continued: true, width: 150 });
        doc.text(value, { align: 'right', width: 100 });
        doc.font('Helvetica');
      });

      // Signatures
      doc.moveDown(2);
      doc.fontSize(10);
      doc.text('Le titulaire', 80, doc.y);
      doc.text('Le maître d\'ouvrage', 380, doc.y - 12);
      doc.moveDown(3);
      doc.text('Date et signature:', 80);
      doc.text('Date et signature:', 380);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Génère un PDF de compte rendu de chantier
 */
export function generateCRPDF(data: CRPDFData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: 'A4', 
        margin: 40,
        info: {
          Title: `CR n°${data.cr.numero} - ${data.chantier.nom}`,
          Author: data.entreprise?.nom || 'BTP Connect',
          Subject: 'Compte Rendu de Chantier'
        }
      });
      
      const chunks: Buffer[] = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // En-tête
      doc.fontSize(18).font('Helvetica-Bold')
        .text('COMPTE RENDU DE CHANTIER', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).font('Helvetica')
        .text(`N° ${data.cr.numero}`, { align: 'center' });
      doc.moveDown(1);

      // Infos réunion
      doc.fontSize(11).font('Helvetica-Bold').text('RÉUNION');
      doc.fontSize(10).font('Helvetica');
      doc.text(`Date: ${formatDate(data.cr.dateReunion)}`);
      if (data.cr.heureDebut) doc.text(`Horaire: ${data.cr.heureDebut}${data.cr.heureFin ? ' - ' + data.cr.heureFin : ''}`);
      if (data.cr.lieu) doc.text(`Lieu: ${data.cr.lieu}`);
      if (data.cr.objetReunion) doc.text(`Objet: ${data.cr.objetReunion}`);
      if (data.cr.meteo) doc.text(`Météo: ${data.cr.meteo}`);
      if (data.cr.effectifChantier) doc.text(`Effectif sur chantier: ${data.cr.effectifChantier}`);
      doc.moveDown(0.5);

      // Chantier
      doc.fontSize(11).font('Helvetica-Bold').text('CHANTIER');
      doc.fontSize(10).font('Helvetica');
      doc.text(`${data.chantier.nom}`);
      if (data.chantier.adresse) doc.text(`${data.chantier.adresse}`);
      if (data.chantier.client) doc.text(`Maître d'ouvrage: ${data.chantier.client}`);
      doc.moveDown(1);

      // Participants
      if (data.participants.length > 0) {
        doc.fontSize(11).font('Helvetica-Bold').text('PARTICIPANTS');
        doc.moveDown(0.3);
        
        doc.fontSize(9);
        const presents = data.participants.filter(p => p.statut === 'PRESENT');
        const absents = data.participants.filter(p => p.statut !== 'PRESENT');
        
        if (presents.length > 0) {
          doc.font('Helvetica-Bold').text('Présents: ', { continued: true });
          doc.font('Helvetica').text(presents.map(p => `${p.nom}${p.societe ? ' (' + p.societe + ')' : ''}`).join(', '));
        }
        if (absents.length > 0) {
          doc.font('Helvetica-Bold').text('Excusés/Absents: ', { continued: true });
          doc.font('Helvetica').text(absents.map(p => `${p.nom}${p.societe ? ' (' + p.societe + ')' : ''}`).join(', '));
        }
        doc.moveDown(1);
      }

      // Avancement
      if (data.avancements.length > 0) {
        doc.fontSize(11).font('Helvetica-Bold').text('AVANCEMENT DES TRAVAUX');
        doc.moveDown(0.3);
        
        doc.fontSize(9);
        for (const av of data.avancements) {
          const status = av.conformePlanning ? '✓' : `⚠ (-${av.retardJours}j)`;
          doc.text(`• ${av.lot}${av.entreprise ? ' - ' + av.entreprise : ''}: ${av.pourcentage}% ${status}`);
        }
        doc.moveDown(1);
      }

      // Actions
      if (data.actions.length > 0) {
        doc.fontSize(11).font('Helvetica-Bold').text('ACTIONS');
        doc.moveDown(0.3);
        
        // En-têtes
        const tableTop = doc.y;
        doc.fontSize(8).font('Helvetica-Bold');
        doc.text('N°', 40, tableTop, { width: 30 });
        doc.text('Description', 70, tableTop, { width: 200 });
        doc.text('Responsable', 270, tableTop, { width: 100 });
        doc.text('Échéance', 370, tableTop, { width: 70 });
        doc.text('Statut', 440, tableTop, { width: 60 });
        
        doc.moveTo(40, tableTop + 12).lineTo(520, tableTop + 12).stroke();
        
        // Lignes
        doc.font('Helvetica').fontSize(8);
        let y = tableTop + 16;
        
        for (const action of data.actions.slice(0, 20)) {
          if (y > 720) break;
          
          doc.text(String(action.numero), 40, y, { width: 30 });
          doc.text(action.description.substring(0, 50), 70, y, { width: 200 });
          doc.text(action.responsable, 270, y, { width: 100 });
          doc.text(formatDate(action.echeance), 370, y, { width: 70 });
          doc.text(action.statut.replace('_', ' '), 440, y, { width: 60 });
          y += 14;
        }
        doc.moveDown(2);
      }

      // Points sécurité
      if (data.pointsSecurite && data.pointsSecurite.length > 0) {
        doc.fontSize(11).font('Helvetica-Bold').text('SÉCURITÉ / ENVIRONNEMENT');
        doc.moveDown(0.3);
        
        doc.fontSize(9).font('Helvetica');
        for (const pt of data.pointsSecurite) {
          const icon = pt.conforme ? '✓' : '✗';
          doc.text(`${icon} [${pt.type}] ${pt.description}`);
        }
        doc.moveDown(1);
      }

      // Pied de page
      doc.fontSize(8).fillColor('gray');
      doc.text(`Document généré le ${formatDate(new Date())} par BTP Connect`, 40, 780, { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Convertit un buffer PDF en stream lisible
 */
export function bufferToStream(buffer: Buffer): Readable {
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  return stream;
}
