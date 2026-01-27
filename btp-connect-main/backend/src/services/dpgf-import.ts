// ============================================
// 🏗️ BTP CONNECT v9.0 - SERVICE IMPORT DPGF
// Parsing Excel avec SheetJS
// ============================================

import * as XLSX from 'xlsx';

export interface LigneDPGF {
  numero: string;
  designation: string;
  unite: string;
  quantite: number;
  prixUnitaireHT: number;
  montantHT: number;
  chapitre?: string;
  lot?: string;
}

export interface DPGFImportResult {
  success: boolean;
  lignes: LigneDPGF[];
  totalHT: number;
  errors: string[];
  warnings: string[];
}

export interface DPGFMapping {
  numero: number;      // Index colonne numéro
  designation: number; // Index colonne désignation
  unite: number;       // Index colonne unité
  quantite: number;    // Index colonne quantité
  prixUnitaire: number; // Index colonne prix unitaire
  montant?: number;    // Index colonne montant (optionnel, calculé sinon)
  chapitre?: number;   // Index colonne chapitre (optionnel)
  lot?: number;        // Index colonne lot (optionnel)
  headerRow: number;   // Ligne d'en-tête (0-indexed)
}

// Mapping par défaut (format standard BTP)
const DEFAULT_MAPPING: DPGFMapping = {
  numero: 0,
  designation: 1,
  unite: 2,
  quantite: 3,
  prixUnitaire: 4,
  montant: 5,
  headerRow: 0
};

/**
 * Parse un fichier Excel DPGF et retourne les lignes structurées
 */
export function parseDPGFFile(buffer: Buffer, mapping?: Partial<DPGFMapping>): DPGFImportResult {
  const result: DPGFImportResult = {
    success: false,
    lignes: [],
    totalHT: 0,
    errors: [],
    warnings: []
  };

  try {
    // Lire le fichier Excel
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    // Prendre la première feuille
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      result.errors.push('Aucune feuille trouvée dans le fichier Excel');
      return result;
    }
    
    const worksheet = workbook.Sheets[sheetName];
    
    // Convertir en tableau de tableaux
    const data: any[][] = XLSX.utils.sheet_to_json(worksheet, { 
      header: 1, 
      defval: '',
      blankrows: false 
    });

    if (data.length < 2) {
      result.errors.push('Le fichier ne contient pas assez de données (minimum 2 lignes)');
      return result;
    }

    // Fusionner mapping par défaut avec mapping fourni
    const finalMapping: DPGFMapping = { ...DEFAULT_MAPPING, ...mapping };
    
    // Détecter automatiquement le mapping si non fourni
    if (!mapping) {
      const detectedMapping = detectMapping(data[finalMapping.headerRow]);
      if (detectedMapping) {
        Object.assign(finalMapping, detectedMapping);
      }
    }

    // Parser les lignes (après l'en-tête)
    for (let i = finalMapping.headerRow + 1; i < data.length; i++) {
      const row = data[i];
      
      // Ignorer les lignes vides
      if (!row || row.every(cell => cell === '' || cell === null || cell === undefined)) {
        continue;
      }

      // Extraire les valeurs
      const numero = String(row[finalMapping.numero] || '').trim();
      const designation = String(row[finalMapping.designation] || '').trim();
      const unite = String(row[finalMapping.unite] || '').trim();
      const quantite = parseNumber(row[finalMapping.quantite]);
      const prixUnitaire = parseNumber(row[finalMapping.prixUnitaire]);
      
      // Ignorer les lignes sans désignation (probablement des titres/sous-titres)
      if (!designation) {
        continue;
      }

      // Calculer ou extraire le montant
      let montant: number;
      if (finalMapping.montant !== undefined && row[finalMapping.montant]) {
        montant = parseNumber(row[finalMapping.montant]);
      } else {
        montant = quantite * prixUnitaire;
      }

      // Vérification de cohérence
      const calculatedMontant = quantite * prixUnitaire;
      if (montant > 0 && Math.abs(montant - calculatedMontant) > 0.01) {
        result.warnings.push(`Ligne ${i + 1}: Montant (${montant}) ≠ Qté × PU (${calculatedMontant})`);
      }

      // Créer la ligne
      const ligne: LigneDPGF = {
        numero: numero || String(result.lignes.length + 1),
        designation,
        unite: unite || 'U',
        quantite,
        prixUnitaireHT: prixUnitaire,
        montantHT: montant || calculatedMontant
      };

      // Chapitre optionnel
      if (finalMapping.chapitre !== undefined && row[finalMapping.chapitre]) {
        ligne.chapitre = String(row[finalMapping.chapitre]).trim();
      }

      // Lot optionnel
      if (finalMapping.lot !== undefined && row[finalMapping.lot]) {
        ligne.lot = String(row[finalMapping.lot]).trim();
      }

      result.lignes.push(ligne);
      result.totalHT += ligne.montantHT;
    }

    if (result.lignes.length === 0) {
      result.errors.push('Aucune ligne valide trouvée dans le fichier');
      return result;
    }

    result.success = true;
    return result;

  } catch (error) {
    result.errors.push(`Erreur de lecture du fichier: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }
}

/**
 * Détecte automatiquement le mapping des colonnes basé sur les en-têtes
 */
function detectMapping(headerRow: any[]): Partial<DPGFMapping> | null {
  if (!headerRow || headerRow.length === 0) return null;

  const mapping: Partial<DPGFMapping> = {};
  
  const patterns = {
    numero: /n[°o]|num|ref|poste|article/i,
    designation: /d[ée]sig|libell[ée]|description|intitul[ée]/i,
    unite: /unit[ée]|u\.|u$/i,
    quantite: /qt[ée]|quantit[ée]|qte|nb|nombre/i,
    prixUnitaire: /p\.?u\.?|prix\s*(unitaire)?|pu\s*ht/i,
    montant: /montant|total|prix\s*total|mt\s*ht/i,
    chapitre: /chapitre|chap|section/i,
    lot: /lot|corps|ouvrage/i
  };

  headerRow.forEach((cell, index) => {
    const cellStr = String(cell || '').toLowerCase().trim();
    
    for (const [key, pattern] of Object.entries(patterns)) {
      if (pattern.test(cellStr) && mapping[key as keyof DPGFMapping] === undefined) {
        (mapping as any)[key] = index;
      }
    }
  });

  return mapping;
}

/**
 * Parse un nombre depuis une cellule Excel
 */
function parseNumber(value: any): number {
  if (value === null || value === undefined || value === '') return 0;
  
  if (typeof value === 'number') return value;
  
  // Nettoyer la chaîne
  let str = String(value)
    .replace(/\s/g, '')      // Espaces
    .replace(/€/g, '')       // Euro
    .replace(/\$/g, '')      // Dollar
    .replace(/,/g, '.')      // Virgule décimale française
    .replace(/[^\d.-]/g, ''); // Garder que chiffres, point, moins
  
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Génère un aperçu des colonnes détectées
 */
export function previewDPGFFile(buffer: Buffer): { 
  headers: string[];
  sampleRows: any[][];
  suggestedMapping: Partial<DPGFMapping>;
} {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const data: any[][] = XLSX.utils.sheet_to_json(worksheet, { 
    header: 1, 
    defval: '',
    blankrows: false 
  });

  const headers = data[0]?.map(h => String(h || '')) || [];
  const sampleRows = data.slice(1, 6); // 5 premières lignes de données
  const suggestedMapping = detectMapping(headers) || {};

  return { headers, sampleRows, suggestedMapping };
}

/**
 * Valide un mapping utilisateur
 */
export function validateMapping(mapping: DPGFMapping): string[] {
  const errors: string[] = [];
  
  const required = ['numero', 'designation', 'unite', 'quantite', 'prixUnitaire'];
  for (const field of required) {
    if ((mapping as any)[field] === undefined || (mapping as any)[field] < 0) {
      errors.push(`Colonne "${field}" requise mais non mappée`);
    }
  }
  
  return errors;
}
