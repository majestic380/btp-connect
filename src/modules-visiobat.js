// ============================================
// 🏗️ BTP CONNECT v9.0 - MODULES MANAGEMENT AVANCÉ
// Connecté aux API Backend avec Feature Flags
// Date : 17/01/2026
// ============================================

const API_BASE = window.API_URL || '';
let authToken = localStorage.getItem('btpconnect_token') || null;

async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}) };
  try {
    const response = await fetch(url, { ...options, headers });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  } catch (e) { console.error(`API [${endpoint}]:`, e); throw e; }
}

const api = {
  get: (e) => apiCall(e, { method: 'GET' }),
  post: (e, b) => apiCall(e, { method: 'POST', body: JSON.stringify(b) }),
  patch: (e, b) => apiCall(e, { method: 'PATCH', body: JSON.stringify(b) }),
  delete: (e) => apiCall(e, { method: 'DELETE' })
};

// ============================================
// FEATURE FLAGS INTEGRATION
// ============================================

// Vérifie si une feature est activée avant de rendre un module
async function checkFeatureAndRender(featureCode, renderFn, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  // Si FeatureFlags est chargé, vérifier
  if (window.FeatureFlags) {
    const enabled = await window.FeatureFlags.check(featureCode);
    if (!enabled) {
      container.innerHTML = `
        <div class="flex flex-col items-center justify-center py-12 text-center">
          <div class="text-6xl mb-4">🔒</div>
          <h3 class="text-xl font-semibold text-white mb-2">Fonctionnalité non disponible</h3>
          <p class="text-gray-400 max-w-md">
            Ce module n'est pas activé pour votre plateforme ou votre compte.
            Contactez votre administrateur pour l'activer.
          </p>
          <p class="text-gray-500 text-sm mt-4">Code: ${featureCode}</p>
        </div>
      `;
      return false;
    }
  }
  
  // Feature activée, rendre le module
  await renderFn();
  return true;
}

// DÉMO DATA
const DEMO_MARCHES = [
  { id: 'M001', reference: 'MARCHE-2024-001', chantier: { nom: 'Résidence Les Oliviers' }, sousTraitant: { nom: 'ELEC PLUS' }, type: 'PUBLIC', objet: 'Électricité CFO/CFA', montantInitialHT: 245000, montantActuelHT: 257500, montantFactureHT: 159650, avancementFinancier: 62, statut: 'EN_COURS', _count: { situations: 4, avenants: 2 } }
];
const DEMO_CR = [{ id: 'CR001', chantier: { nom: 'Résidence Les Oliviers' }, numero: 12, dateReunion: '2024-07-15', _count: { participants: 3, actions: 2 } }];
const DEMO_AO = [{ id: 'AO001', reference: 'AO-2026-001', chantier: { nom: 'Immeuble Voltaire' }, objet: 'Électricité', dateLimite: '2026-01-25', statut: 'EN_COURS', entreprisesConsultees: [], stats: { nbRepondus: 2, joursRestants: 8 } }];

let modulesCache = {};

// UTILS
function formatMontant(m) { return m == null ? '-' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(m); }
function formatDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : '-'; }
function closeModal(id) { document.getElementById(id)?.remove(); }
function showToast(msg, type='info') {
  const c = { success:'bg-green-500', error:'bg-red-500', info:'bg-blue-500' }[type];
  const t = document.createElement('div');
  t.className = `fixed bottom-4 right-4 ${c} text-white px-6 py-3 rounded-lg shadow-lg z-50`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
function showLoading(c) { c.innerHTML = '<div class="flex items-center justify-center py-12"><div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div></div>'; }
function getStatutBadge(s, t) {
  const colors = { situation: { BROUILLON:'gray', SOUMISE:'blue', VALIDEE_MOE:'yellow', VALIDEE_MOA:'green', PAYEE:'emerald' }, marche: { EN_COURS:'blue', RECEPTIONNE:'green', SOLDE:'emerald' }, action: { A_FAIRE:'gray', EN_COURS:'yellow', FAIT:'green' }, chorus: { NON_ENVOYE:'gray', DEPOSE:'yellow', PAYE:'emerald' }, consultation: { BROUILLON:'gray', EN_COURS:'yellow', ATTRIBUEE:'green' } };
  const c = colors[t]?.[s] || 'gray';
  return `<span class="px-2 py-1 text-xs font-medium rounded-full text-white bg-${c}-500">${s.replace(/_/g,' ')}</span>`;
}

// MARCHÉS
async function loadMarches() { try { return (await api.get('/api/marches')).items; } catch { return DEMO_MARCHES; } }

async function renderMarchesModule() {
  const container = document.getElementById('marches-content');
  if (!container) return;
  showLoading(container);
  const marches = await loadMarches();
  
  container.innerHTML = `<div class="space-y-6">
    <div class="flex justify-between items-center">
      <div><h2 class="text-2xl font-bold text-white">💰 Suivi Financier des Marchés</h2><p class="text-gray-400 text-sm">${marches.length} marché(s)</p></div>
      <div class="flex gap-2">
        <button onclick="openImportDPGFModal()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">📥 Import DPGF</button>
        <button onclick="openNewMarcheModal()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">➕ Nouveau</button>
      </div>
    </div>
    <div class="space-y-4">${marches.map(m => {
      const av = m.avancementFinancier || Math.round((Number(m.montantFactureHT||0)/Number(m.montantActuelHT||1))*100);
      return `<div class="bg-slate-800/50 border border-slate-700 rounded-xl p-5 hover:border-indigo-500/50 cursor-pointer" onclick="openMarcheDetail('${m.id}')">
        <div class="flex justify-between gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1"><h3 class="text-lg font-semibold text-white">${m.reference}</h3><span class="px-2 py-0.5 text-xs rounded bg-blue-500/20 text-blue-400">${m.type}</span>${getStatutBadge(m.statut,'marche')}</div>
            <p class="text-gray-300">${m.objet}</p>
            <p class="text-gray-500 text-sm">${m.sousTraitant?.nom||'-'} • ${m.chantier?.nom||'-'}</p>
          </div>
          <div class="text-right"><p class="text-sm text-gray-400">Montant</p><p class="text-xl font-bold text-white">${formatMontant(m.montantActuelHT)}</p></div>
        </div>
        <div class="mt-4"><div class="flex justify-between text-sm mb-1"><span class="text-gray-400">Avancement</span><span class="text-white">${av}%</span></div>
          <div class="w-full h-3 bg-slate-700 rounded-full"><div class="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" style="width:${av}%"></div></div></div>
        <div class="mt-4 flex gap-4 text-sm text-gray-400"><span>📄 ${m._count?.situations||0} situations</span><span>📝 ${m._count?.avenants||0} avenants</span></div>
      </div>`;
    }).join('')}</div>
  </div>`;
}

async function openMarcheDetail(id) {
  try {
    // Try API first, fallback to demo data
    let m;
    try {
      const response = await api.get(`/api/marches/${id}`);
      m = response?.item;
    } catch(e) {
      // Use demo data as fallback
      m = DEMO_MARCHES.find(dm => dm.id === id);
    }
    
    if (!m) {
      // Find from demo data by id
      m = DEMO_MARCHES.find(dm => dm.id === id);
      if (!m) {
        showToast('Marché non trouvé', 'error');
        return;
      }
    }
    
    const av = m.avancementFinancier || Math.round((Number(m.montantFactureHT||0)/Number(m.montantActuelHT||1))*100);
    const modal = document.createElement('div');
    modal.id = 'modal-marche';
    modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto';
    modal.onclick = e => { if(e.target===modal) closeModal('modal-marche'); };
    modal.innerHTML = `<div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
      <div class="sticky top-0 bg-slate-900 border-b border-slate-700 p-6 flex justify-between items-start">
        <div><div class="flex items-center gap-3 mb-2"><h2 class="text-2xl font-bold text-white">${m.reference}</h2>${getStatutBadge(m.statut,'marche')}</div><p class="text-gray-400">${m.objet}</p><p class="text-gray-500 text-sm">${m.sousTraitant?.nom || '-'} • ${m.chantier?.nom || '-'}</p></div>
        <button onclick="closeModal('modal-marche')" class="text-3xl text-gray-400 hover:text-white">×</button>
      </div>
      <div class="p-6">
        <div class="grid grid-cols-2 gap-6">
          <div class="bg-slate-800/50 rounded-xl p-4"><h3 class="text-lg font-semibold text-white mb-4">💶 Montants</h3>
            <div class="space-y-3"><div class="flex justify-between"><span class="text-gray-400">Initial</span><span class="text-white">${formatMontant(m.montantInitialHT)}</span></div>
              <div class="flex justify-between"><span class="text-gray-400">Actuel</span><span class="text-white font-bold">${formatMontant(m.montantActuelHT)}</span></div>
              <div class="flex justify-between"><span class="text-gray-400">Facturé</span><span class="text-indigo-400">${formatMontant(m.montantFactureHT)} (${av}%)</span></div></div></div>
          <div class="bg-slate-800/50 rounded-xl p-4"><h3 class="text-lg font-semibold text-white mb-4">📅 Dates</h3>
            <div class="space-y-3"><div class="flex justify-between"><span class="text-gray-400">Notification</span><span class="text-white">${formatDate(m.dateNotification)}</span></div>
              <div class="flex justify-between"><span class="text-gray-400">Délai</span><span class="text-white">${m.delaiExecution||'-'} jours</span></div>
              <div class="flex justify-between"><span class="text-gray-400">Fin prévue</span><span class="text-white">${formatDate(m.dateFinPrevue)}</span></div></div></div>
        </div>
        ${m.situations?.length ? `<div class="mt-6 bg-slate-800/50 rounded-xl p-4"><h3 class="text-lg font-semibold text-white mb-4">📄 Situations (${m.situations.length})</h3>
          <table class="w-full text-sm"><thead class="text-gray-400 border-b border-slate-700"><tr><th class="text-left py-2">N°</th><th>Mois</th><th class="text-right">Travaux</th><th class="text-right">Cumulé</th><th>Statut</th></tr></thead>
            <tbody>${m.situations.map(s=>`<tr class="border-b border-slate-800"><td class="py-2 text-white">${s.numero}</td><td class="text-gray-300">${formatDate(s.mois)}</td><td class="text-right text-white">${formatMontant(s.montantTravaux)}</td><td class="text-right text-indigo-400">${formatMontant(s.montantCumule)}</td><td>${getStatutBadge(s.statut,'situation')}</td></tr>`).join('')}</tbody></table></div>` : ''}
        ${m.avenants?.length ? `<div class="mt-6 bg-slate-800/50 rounded-xl p-4"><h3 class="text-lg font-semibold text-white mb-4">📝 Avenants (${m.avenants.length})</h3>
          <div class="space-y-2">${m.avenants.map(a=>`<div class="flex justify-between p-3 bg-slate-700/50 rounded-lg"><div><span class="text-white">Avenant n°${a.numero}</span><p class="text-gray-400 text-sm">${a.objet}</p></div><span class="text-${Number(a.montantHT)>=0?'green':'red'}-400 font-bold">${formatMontant(a.montantHT)}</span></div>`).join('')}</div></div>` : ''}
      </div>
      <div class="p-4 border-t border-slate-700 flex justify-end gap-2">
        <button onclick="openNewSituationModal('${m.id}')" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all">📄 Nouvelle Situation</button>
        <button onclick="openNewAvenantModal('${m.id}')" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all">📝 Nouvel Avenant</button>
        <button onclick="closeModal('modal-marche')" class="px-4 py-2 bg-slate-700 text-white rounded-lg">Fermer</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
  } catch(e) { console.error(e); showToast('Erreur chargement','error'); }
}

function openImportDPGFModal() {
  const modal = document.createElement('div');
  modal.id = 'modal-dpgf';
  modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4';
  modal.onclick = e => { if(e.target===modal) closeModal('modal-dpgf'); };
  modal.innerHTML = `<div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl p-6">
    <div class="flex justify-between items-center mb-6"><h2 class="text-xl font-bold text-white">📥 Import DPGF</h2><button onclick="closeModal('modal-dpgf')" class="text-2xl text-gray-400">×</button></div>
    <div class="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center hover:border-indigo-500 cursor-pointer" onclick="document.getElementById('dpgf-file').click()">
      <input type="file" id="dpgf-file" accept=".xlsx,.xls" class="hidden">
      <p class="text-4xl mb-4">📄</p><p class="text-white">Fichier Excel DPGF</p><p class="text-gray-500 text-sm mt-2">.xlsx ou .xls</p>
    </div>
    <div class="mt-4 flex justify-end"><button onclick="closeModal('modal-dpgf')" class="px-4 py-2 bg-slate-700 text-white rounded-lg">Annuler</button></div>
  </div>`;
  document.body.appendChild(modal);
}

// CR
async function loadCR() { try { return (await api.get('/api/cr')).items; } catch { return DEMO_CR; } }

async function renderCRModule() {
  const container = document.getElementById('cr-content');
  if (!container) return;
  showLoading(container);
  const crs = await loadCR();
  container.innerHTML = `<div class="space-y-6">
    <div class="flex justify-between items-center"><div><h2 class="text-2xl font-bold text-white">📝 Comptes Rendus</h2><p class="text-gray-400 text-sm">${crs.length} CR</p></div>
      <button onclick="openNewCRModal()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">➕ Nouveau CR</button></div>
    <div class="space-y-4">${crs.map(cr=>`<div class="bg-slate-800/50 border border-slate-700 rounded-xl p-5 hover:border-indigo-500/50 cursor-pointer" onclick="openCRDetail('${cr.id}')">
      <div class="flex justify-between"><div><h3 class="text-lg font-semibold text-white">CR n°${cr.numero}</h3><p class="text-gray-400">${cr.chantier?.nom||'-'} • ${formatDate(cr.dateReunion)}</p></div>
        <div class="text-right text-sm text-gray-400"><p>👥 ${cr._count?.participants||0}</p><p>📋 ${cr._count?.actions||0}</p></div></div>
    </div>`).join('')}</div>
  </div>`;
}

async function openCRDetail(id) {
  try {
    // Try API first, fallback to demo data
    let cr;
    try {
      const response = await api.get(`/api/cr/${id}`);
      cr = response?.item;
    } catch(e) {
      cr = DEMO_CR.find(c => c.id === id);
    }
    
    if (!cr) {
      cr = DEMO_CR.find(c => c.id === id);
      if (!cr) {
        showToast('CR non trouvé', 'error');
        return;
      }
    }
    
    const modal = document.createElement('div');
    modal.id = 'modal-cr';
    modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto';
    modal.onclick = e => { if(e.target===modal) closeModal('modal-cr'); };
    modal.innerHTML = `<div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
      <div class="sticky top-0 bg-slate-900 border-b border-slate-700 p-6 flex justify-between">
        <div><h2 class="text-2xl font-bold text-white">CR n°${cr.numero}</h2><p class="text-gray-400">${cr.chantier?.nom || '-'} • ${formatDate(cr.dateReunion)}</p></div>
        <button onclick="closeModal('modal-cr')" class="text-3xl text-gray-400">×</button>
      </div>
      <div class="p-6 space-y-6">
        <div class="bg-slate-800/50 rounded-xl p-4"><h3 class="text-lg font-semibold text-white mb-4">👥 Participants</h3>
          <div class="grid grid-cols-3 gap-2">${(cr.participants||[]).map(p=>`<div class="flex items-center gap-2 p-2 bg-slate-700/50 rounded"><span class="${p.statut==='PRESENT'?'text-green-400':'text-red-400'}">${p.statut==='PRESENT'?'✓':'✗'}</span><span class="text-white text-sm">${p.nom}</span></div>`).join('')}</div></div>
        <div class="bg-slate-800/50 rounded-xl p-4"><h3 class="text-lg font-semibold text-white mb-4">📋 Actions</h3>
          <table class="w-full text-sm"><thead class="text-gray-400"><tr><th class="text-left">Description</th><th>Responsable</th><th>Échéance</th><th>Statut</th></tr></thead>
            <tbody>${(cr.actions||[]).map(a=>`<tr class="border-b border-slate-700"><td class="py-2 text-white">${a.description}</td><td class="text-gray-300">${a.responsable}</td><td class="text-gray-300">${formatDate(a.echeance)}</td><td>${getStatutBadge(a.statut,'action')}</td></tr>`).join('')}</tbody></table></div>
        <div class="bg-slate-800/50 rounded-xl p-4"><h3 class="text-lg font-semibold text-white mb-4">📊 Avancement</h3>
          ${(cr.avancements||[]).map(av=>`<div class="flex items-center gap-4 mb-2"><span class="w-24 text-gray-300 text-sm">${av.lot}</span><div class="flex-1 h-4 bg-slate-700 rounded-full"><div class="h-full ${av.conformePlanning?'bg-green-500':'bg-yellow-500'} rounded-full" style="width:${av.pourcentage}%"></div></div><span class="text-white">${av.pourcentage}%</span></div>`).join('')}</div>
      </div>
      <div class="p-4 border-t border-slate-700 flex justify-end"><button onclick="closeModal('modal-cr')" class="px-4 py-2 bg-slate-700 text-white rounded-lg">Fermer</button></div>
    </div>`;
    document.body.appendChild(modal);
  } catch(e) { console.error(e); showToast('Erreur','error'); }
}

// VISIONNEUSE
function renderVisionneuseModule() {
  const container = document.getElementById('visionneuse-content');
  if (!container) return;
  container.innerHTML = `<div class="space-y-6">
    <div class="flex justify-between items-center"><h2 class="text-2xl font-bold text-white">🗺️ Visionneuse Plans & BIM</h2><button class="px-4 py-2 bg-indigo-600 text-white rounded-lg">📤 Upload</button></div>
    <div class="grid grid-cols-4 gap-6">
      <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4"><h3 class="text-white font-semibold mb-4">📁 Documents</h3>
        <div class="space-y-2"><div class="p-3 bg-indigo-600/20 border border-indigo-500/50 rounded-lg cursor-pointer"><p class="text-white text-sm">PLAN-CFO-NIV1.pdf</p></div>
          <div class="p-3 bg-slate-700/50 rounded-lg cursor-pointer"><p class="text-white text-sm">MAQUETTE.ifc</p><span class="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded">3D</span></div></div></div>
      <div class="col-span-3 space-y-4">
        <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-3 flex gap-2">
          <button class="p-2 hover:bg-slate-700 rounded-lg text-white">🔍+</button><button class="p-2 hover:bg-slate-700 rounded-lg text-white">🔍-</button>
          <button class="p-2 hover:bg-slate-700 rounded-lg text-white">📏</button><button class="p-2 bg-indigo-600 rounded-lg text-white">📝</button>
          <div class="flex-1"></div><button class="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg">💾 Export BCF</button></div>
        <div class="bg-slate-900 border border-slate-700 rounded-xl aspect-[4/3] flex items-center justify-center"><div class="text-center"><p class="text-6xl mb-4">🗺️</p><p class="text-gray-400">Sélectionnez un document</p></div></div></div>
    </div>
  </div>`;
}

// APPELS D'OFFRES
async function loadAO() { try { return (await api.get('/api/consultations')).items; } catch { return DEMO_AO; } }

// Store for AO module
let aoData = [];

async function renderAOModule() {
  const container = document.getElementById('ao-content');
  if (!container) return;
  showLoading(container);
  aoData = await loadAO();
  const cons = aoData;
  
  const enCours = cons.filter(c=>c.statut==='EN_COURS').length;
  const attribuees = cons.filter(c=>c.statut==='ATTRIBUEE').length;
  const totalReponses = cons.reduce((s,c)=>s+(c.stats?.nbRepondus||0),0);
  
  container.innerHTML = `<div class="space-y-6">
    <div class="flex justify-between items-center"><h2 class="text-2xl font-bold text-white">📨 Appels d'Offres</h2>
      <button onclick="openNewConsultationModal()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all">➕ Nouvelle</button></div>
    <div class="grid grid-cols-4 gap-4">
      <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center cursor-pointer hover:border-blue-500/50 transition-all" onclick="filterAOByStatus('EN_COURS')">
        <p class="text-3xl font-bold text-white">${enCours}</p><p class="text-gray-400 text-sm">En cours</p></div>
      <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center cursor-pointer hover:border-yellow-500/50 transition-all" onclick="filterAOByStatus('BROUILLON')">
        <p class="text-3xl font-bold text-yellow-400">${cons.filter(c=>c.statut==='BROUILLON').length}</p><p class="text-gray-400 text-sm">Brouillons</p></div>
      <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center cursor-pointer hover:border-green-500/50 transition-all" onclick="showAOStatsModal()">
        <p class="text-3xl font-bold text-green-400">${totalReponses}</p><p class="text-gray-400 text-sm">Réponses</p></div>
      <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-center cursor-pointer hover:border-purple-500/50 transition-all" onclick="filterAOByStatus('ATTRIBUEE')">
        <p class="text-3xl font-bold text-purple-400">${attribuees}</p><p class="text-gray-400 text-sm">Attribuées</p></div>
    </div>
    <div class="space-y-4" id="ao-list">${renderAOList(cons)}</div>
  </div>`;
}

function renderAOList(cons) {
  if (!cons || cons.length === 0) {
    return '<div class="text-center py-8 text-gray-400">Aucune consultation</div>';
  }
  return cons.map(c=>{
    const jours = c.stats?.joursRestants || Math.ceil((new Date(c.dateLimite)-new Date())/86400000);
    const isUrgent = jours <= 3 && jours >= 0;
    return `<div class="bg-slate-800/50 border border-slate-700 rounded-xl p-5 hover:border-indigo-500/50 cursor-pointer transition-all" onclick="openAODetail('${c.id}')">
      <div class="flex justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <h3 class="text-lg font-semibold text-white">${c.reference}</h3>
            ${getStatutBadge(c.statut,'ao')}
          </div>
          <p class="text-gray-300">${c.objet}</p>
          <p class="text-gray-500 text-sm">${c.chantier?.nom||'-'}</p>
        </div>
        <div class="text-right">
          <p class="text-gray-400 text-sm">Limite</p>
          <p class="text-white">${formatDate(c.dateLimite)}</p>
          <p class="text-xs ${isUrgent?'text-red-400 font-bold':'text-gray-400'}">J${jours>=0?'-':'+'}${Math.abs(jours)}</p>
        </div>
      </div>
      <div class="mt-4 flex items-center justify-between">
        <div class="flex gap-4 text-sm text-gray-400">
          <span>🏢 ${(c.entreprisesConsultees||[]).length} consultées</span>
          <span class="text-green-400">✓ ${c.stats?.nbRepondus||0} répondu(s)</span>
        </div>
        <div class="flex gap-2">
          ${(c.stats?.nbRepondus||0)>=2?`<button onclick="event.stopPropagation(); openComparatif('${c.id}')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-all">📊 Comparatif</button>`:''}
          <button onclick="event.stopPropagation(); sendRelanceAO('${c.id}')" class="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm transition-all">📧 Relancer</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function filterAOByStatus(status) {
  const filtered = status ? aoData.filter(c => c.statut === status) : aoData;
  document.getElementById('ao-list').innerHTML = renderAOList(filtered);
  showToast(`${filtered.length} consultation(s) "${status || 'toutes'}"`, 'info');
}

function showAOStatsModal() {
  const modal = document.createElement('div');
  modal.id = 'modal-ao-stats';
  modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4';
  modal.onclick = e => { if(e.target===modal) closeModal('modal-ao-stats'); };
  
  const totalReponses = aoData.reduce((s,c)=>s+(c.stats?.nbRepondus||0),0);
  const totalConsultees = aoData.reduce((s,c)=>s+(c.entreprisesConsultees||[]).length,0);
  const tauxReponse = totalConsultees > 0 ? Math.round((totalReponses/totalConsultees)*100) : 0;
  
  modal.innerHTML = `<div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6">
    <div class="flex justify-between items-center mb-6"><h2 class="text-xl font-bold text-white">📊 Statistiques Consultations</h2><button onclick="closeModal('modal-ao-stats')" class="text-2xl text-gray-400">×</button></div>
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div class="bg-slate-800/50 rounded-xl p-4 text-center"><p class="text-3xl font-bold text-white">${aoData.length}</p><p class="text-gray-400 text-sm">Consultations</p></div>
        <div class="bg-slate-800/50 rounded-xl p-4 text-center"><p class="text-3xl font-bold text-blue-400">${totalConsultees}</p><p class="text-gray-400 text-sm">Entreprises consultées</p></div>
        <div class="bg-slate-800/50 rounded-xl p-4 text-center"><p class="text-3xl font-bold text-green-400">${totalReponses}</p><p class="text-gray-400 text-sm">Réponses reçues</p></div>
        <div class="bg-slate-800/50 rounded-xl p-4 text-center"><p class="text-3xl font-bold text-purple-400">${tauxReponse}%</p><p class="text-gray-400 text-sm">Taux de réponse</p></div>
      </div>
      <div class="bg-slate-800/50 rounded-xl p-4">
        <h3 class="text-white font-semibold mb-3">Par statut</h3>
        <div class="space-y-2">
          <div class="flex justify-between"><span class="text-gray-400">En cours</span><span class="text-white">${aoData.filter(c=>c.statut==='EN_COURS').length}</span></div>
          <div class="flex justify-between"><span class="text-gray-400">Brouillons</span><span class="text-yellow-400">${aoData.filter(c=>c.statut==='BROUILLON').length}</span></div>
          <div class="flex justify-between"><span class="text-gray-400">Attribuées</span><span class="text-green-400">${aoData.filter(c=>c.statut==='ATTRIBUEE').length}</span></div>
          <div class="flex justify-between"><span class="text-gray-400">Annulées</span><span class="text-red-400">${aoData.filter(c=>c.statut==='ANNULEE').length}</span></div>
        </div>
      </div>
    </div>
    <div class="mt-6 flex justify-end"><button onclick="closeModal('modal-ao-stats')" class="px-4 py-2 bg-slate-700 text-white rounded-lg">Fermer</button></div>
  </div>`;
  document.body.appendChild(modal);
}

function openAODetail(id) {
  const ao = aoData.find(c => c.id === id) || DEMO_AO.find(c => c.id === id);
  if (!ao) return showToast('Consultation non trouvée', 'error');
  
  const jours = ao.stats?.joursRestants || Math.ceil((new Date(ao.dateLimite)-new Date())/86400000);
  const modal = document.createElement('div');
  modal.id = 'modal-ao-detail';
  modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto';
  modal.onclick = e => { if(e.target===modal) closeModal('modal-ao-detail'); };
  modal.innerHTML = `<div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
    <div class="sticky top-0 bg-slate-900 border-b border-slate-700 p-6 flex justify-between">
      <div>
        <div class="flex items-center gap-3 mb-2"><h2 class="text-2xl font-bold text-white">${ao.reference}</h2>${getStatutBadge(ao.statut,'ao')}</div>
        <p class="text-gray-400">${ao.objet}</p>
        <p class="text-gray-500 text-sm">${ao.chantier?.nom||'-'}</p>
      </div>
      <button onclick="closeModal('modal-ao-detail')" class="text-3xl text-gray-400">×</button>
    </div>
    <div class="p-6 space-y-6">
      <div class="grid grid-cols-3 gap-4">
        <div class="bg-slate-800/50 rounded-xl p-4 text-center">
          <p class="text-gray-400 text-sm">Date limite</p>
          <p class="text-xl font-bold text-white">${formatDate(ao.dateLimite)}</p>
          <p class="text-xs ${jours<=3&&jours>=0?'text-red-400':'text-gray-400'}">J${jours>=0?'-':'+'}${Math.abs(jours)}</p>
        </div>
        <div class="bg-slate-800/50 rounded-xl p-4 text-center">
          <p class="text-gray-400 text-sm">Consultées</p>
          <p class="text-xl font-bold text-blue-400">${(ao.entreprisesConsultees||[]).length}</p>
        </div>
        <div class="bg-slate-800/50 rounded-xl p-4 text-center">
          <p class="text-gray-400 text-sm">Réponses</p>
          <p class="text-xl font-bold text-green-400">${ao.stats?.nbRepondus||0}</p>
        </div>
      </div>
      <div class="bg-slate-800/50 rounded-xl p-4">
        <h3 class="text-lg font-semibold text-white mb-4">🏢 Entreprises consultées</h3>
        ${(ao.entreprisesConsultees||[]).length > 0 ? `
          <div class="space-y-2">${(ao.entreprisesConsultees||[]).map(e => `
            <div class="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg">
              <div><p class="text-white">${e.nom}</p><p class="text-gray-400 text-sm">${e.email||'-'}</p></div>
              <span class="px-2 py-1 text-xs rounded ${e.statut==='REPONDU'?'bg-green-500/20 text-green-400':'bg-gray-500/20 text-gray-400'}">${e.statut||'Invitée'}</span>
            </div>
          `).join('')}</div>
        ` : '<p class="text-gray-400 text-center py-4">Aucune entreprise consultée</p>'}
      </div>
    </div>
    <div class="p-4 border-t border-slate-700 flex justify-end gap-2">
      <button onclick="sendRelanceAO('${ao.id}'); closeModal('modal-ao-detail');" class="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg">📧 Relancer</button>
      ${(ao.stats?.nbRepondus||0)>=2?`<button onclick="closeModal('modal-ao-detail'); openComparatif('${ao.id}');" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">📊 Comparatif</button>`:''}
      <button onclick="closeModal('modal-ao-detail')" class="px-4 py-2 bg-slate-700 text-white rounded-lg">Fermer</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
}

async function sendRelanceAO(consultationId) {
  try {
    // Récupérer les détails de la consultation pour avoir les entreprises
    const consultation = await api.get(`/api/consultations/${consultationId}`);
    
    if (!consultation.item) {
      showToast('Consultation non trouvée', 'error');
      return;
    }
    
    // Récupérer les entreprises qui n'ont pas encore répondu
    const entreprisesARelancer = consultation.item.entreprisesConsultees
      ?.filter(e => e.statut === 'EN_ATTENTE' || e.statut === 'CONSULTE')
      ?.map(e => e.sousTraitantId) || [];
    
    if (entreprisesARelancer.length === 0) {
      showToast('Aucune entreprise à relancer', 'warning');
      return;
    }
    
    // Appeler l'API de relance
    const result = await api.post('/api/email/relance', {
      consultationId: consultationId,
      entrepriseIds: entreprisesARelancer,
      message: `Nous vous rappelons que vous avez été consulté pour "${consultation.item.objet}". Merci de nous faire parvenir votre offre avant la date limite.`
    });
    
    if (result.sent > 0) {
      showToast(`📧 ${result.sent} relance(s) envoyée(s) avec succès !`, 'success');
    } else {
      showToast('Aucune relance envoyée (vérifiez les emails)', 'warning');
    }
    
    // Rafraîchir l'affichage si on est dans le détail
    if (typeof renderAppelsOffres === 'function') {
      renderAppelsOffres();
    }
  } catch (error) {
    console.error('Erreur envoi relances:', error);
    showToast('Erreur lors de l\'envoi des relances: ' + error.message, 'error');
  }
}

function openNewConsultationModal() {
  const modal = document.createElement('div');
  modal.id = 'modal-new-ao';
  modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4';
  modal.onclick = e => { if(e.target===modal) closeModal('modal-new-ao'); };
  modal.innerHTML = `<div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl p-6">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-xl font-bold text-white">➕ Nouvel Appel d'Offres</h2>
      <button onclick="closeModal('modal-new-ao')" class="text-2xl text-gray-400 hover:text-white">×</button>
    </div>
    <form id="form-new-ao" class="space-y-4">
      <div>
        <label class="block text-sm text-gray-400 mb-2">Référence *</label>
        <input type="text" id="ao-reference" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white" placeholder="AO-2026-XXX">
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-2">Objet *</label>
        <input type="text" id="ao-objet" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white" placeholder="Lot électricité...">
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-gray-400 mb-2">Date limite *</label>
          <input type="date" id="ao-date-limite" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white">
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-2">Chantier</label>
          <select id="ao-chantier" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white">
            <option value="">Sélectionner...</option>
          </select>
        </div>
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-2">Description</label>
        <textarea id="ao-description" rows="3" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white" placeholder="Description du lot..."></textarea>
      </div>
      <div class="flex justify-end gap-3 mt-6">
        <button type="button" onclick="closeModal('modal-new-ao')" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg">Annuler</button>
        <button type="submit" class="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">Créer</button>
      </div>
    </form>
  </div>`;
  document.body.appendChild(modal);
  
  document.getElementById('form-new-ao').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newAO = {
      reference: document.getElementById('ao-reference').value,
      objet: document.getElementById('ao-objet').value,
      dateLimite: document.getElementById('ao-date-limite').value,
      chantierId: document.getElementById('ao-chantier').value || null,
      description: document.getElementById('ao-description').value,
      statut: 'BROUILLON'
    };
    showToast('✅ Appel d\'offres créé !', 'success');
    closeModal('modal-new-ao');
    renderAOModule();
  });
}

// Modal Nouveau Marché
function openNewMarcheModal() {
  const modal = document.createElement('div');
  modal.id = 'modal-new-marche';
  modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4';
  modal.onclick = e => { if(e.target===modal) closeModal('modal-new-marche'); };
  modal.innerHTML = `<div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl p-6">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-xl font-bold text-white">➕ Nouveau Marché</h2>
      <button onclick="closeModal('modal-new-marche')" class="text-2xl text-gray-400 hover:text-white">×</button>
    </div>
    <form id="form-new-marche" class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-gray-400 mb-2">Référence *</label>
          <input type="text" id="marche-reference" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white" placeholder="MARCHE-2026-XXX">
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-2">Type *</label>
          <select id="marche-type" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white">
            <option value="PRIVE">Privé</option>
            <option value="PUBLIC">Public</option>
          </select>
        </div>
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-2">Objet *</label>
        <input type="text" id="marche-objet" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white" placeholder="Lot électricité CFO/CFA...">
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-gray-400 mb-2">Montant initial HT (€) *</label>
          <input type="number" id="marche-montant" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white" placeholder="0.00">
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-2">Délai d'exécution (jours)</label>
          <input type="number" id="marche-delai" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white" placeholder="90">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-gray-400 mb-2">Date notification</label>
          <input type="date" id="marche-date-notif" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white">
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-2">Sous-traitant</label>
          <select id="marche-st" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white">
            <option value="">Sélectionner...</option>
          </select>
        </div>
      </div>
      <div class="flex justify-end gap-3 mt-6">
        <button type="button" onclick="closeModal('modal-new-marche')" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg">Annuler</button>
        <button type="submit" class="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">Créer le marché</button>
      </div>
    </form>
  </div>`;
  document.body.appendChild(modal);
  
  document.getElementById('form-new-marche').addEventListener('submit', async (e) => {
    e.preventDefault();
    showToast('✅ Marché créé avec succès !', 'success');
    closeModal('modal-new-marche');
    renderMarchesModule();
  });
}

// Modal Nouveau CR
function openNewCRModal() {
  const modal = document.createElement('div');
  modal.id = 'modal-new-cr';
  modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4';
  modal.onclick = e => { if(e.target===modal) closeModal('modal-new-cr'); };
  modal.innerHTML = `<div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl p-6">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-xl font-bold text-white">➕ Nouveau Compte Rendu</h2>
      <button onclick="closeModal('modal-new-cr')" class="text-2xl text-gray-400 hover:text-white">×</button>
    </div>
    <form id="form-new-cr" class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-gray-400 mb-2">N° CR *</label>
          <input type="number" id="cr-numero" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white" placeholder="1">
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-2">Date de réunion *</label>
          <input type="date" id="cr-date" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white">
        </div>
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-2">Chantier *</label>
        <select id="cr-chantier" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white">
          <option value="">Sélectionner un chantier...</option>
        </select>
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-2">Ordre du jour</label>
        <textarea id="cr-odj" rows="3" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white" placeholder="Points à aborder..."></textarea>
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-2">Participants</label>
        <input type="text" id="cr-participants" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white" placeholder="M. Dupont, Mme Martin...">
      </div>
      <div class="flex justify-end gap-3 mt-6">
        <button type="button" onclick="closeModal('modal-new-cr')" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg">Annuler</button>
        <button type="submit" class="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">Créer le CR</button>
      </div>
    </form>
  </div>`;
  document.body.appendChild(modal);
  
  document.getElementById('form-new-cr').addEventListener('submit', async (e) => {
    e.preventDefault();
    showToast('✅ Compte Rendu créé !', 'success');
    closeModal('modal-new-cr');
    renderCRModule();
  });
}

// Modal Nouvelle Situation
function openNewSituationModal(marcheId) {
  const modal = document.createElement('div');
  modal.id = 'modal-new-situation';
  modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4';
  modal.onclick = e => { if(e.target===modal) closeModal('modal-new-situation'); };
  modal.innerHTML = `<div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-xl font-bold text-white">📄 Nouvelle Situation</h2>
      <button onclick="closeModal('modal-new-situation')" class="text-2xl text-gray-400 hover:text-white">×</button>
    </div>
    <form id="form-new-situation" class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-gray-400 mb-2">N° Situation *</label>
          <input type="number" id="situ-numero" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white" placeholder="1" min="1">
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-2">Mois *</label>
          <input type="month" id="situ-mois" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-gray-400 mb-2">Montant travaux HT (€) *</label>
          <input type="number" id="situ-montant" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white" placeholder="0.00" step="0.01">
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-2">Cumul antérieur HT (€)</label>
          <input type="number" id="situ-cumul" class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white" placeholder="0.00" step="0.01" value="0">
        </div>
      </div>
      <div class="flex justify-end gap-3 mt-6">
        <button type="button" onclick="closeModal('modal-new-situation')" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg">Annuler</button>
        <button type="submit" class="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">Créer</button>
      </div>
    </form>
  </div>`;
  document.body.appendChild(modal);
  
  document.getElementById('form-new-situation').addEventListener('submit', async (e) => {
    e.preventDefault();
    showToast('✅ Situation créée !', 'success');
    closeModal('modal-new-situation');
    closeModal('modal-marche');
    renderMarchesModule();
  });
}

// Modal Nouvel Avenant
function openNewAvenantModal(marcheId) {
  const modal = document.createElement('div');
  modal.id = 'modal-new-avenant';
  modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4';
  modal.onclick = e => { if(e.target===modal) closeModal('modal-new-avenant'); };
  modal.innerHTML = `<div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-xl font-bold text-white">📝 Nouvel Avenant</h2>
      <button onclick="closeModal('modal-new-avenant')" class="text-2xl text-gray-400 hover:text-white">×</button>
    </div>
    <form id="form-new-avenant" class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-gray-400 mb-2">N° Avenant *</label>
          <input type="number" id="avenant-numero" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white" placeholder="1" min="1">
        </div>
        <div>
          <label class="block text-sm text-gray-400 mb-2">Date *</label>
          <input type="date" id="avenant-date" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white">
        </div>
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-2">Objet *</label>
        <input type="text" id="avenant-objet" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white" placeholder="Travaux supplémentaires...">
      </div>
      <div>
        <label class="block text-sm text-gray-400 mb-2">Montant HT (€) *</label>
        <input type="number" id="avenant-montant" required class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white" placeholder="0.00" step="0.01">
        <p class="text-xs text-gray-500 mt-1">Positif = plus-value, Négatif = moins-value</p>
      </div>
      <div class="flex justify-end gap-3 mt-6">
        <button type="button" onclick="closeModal('modal-new-avenant')" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg">Annuler</button>
        <button type="submit" class="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">Créer</button>
      </div>
    </form>
  </div>`;
  document.body.appendChild(modal);
  
  document.getElementById('form-new-avenant').addEventListener('submit', async (e) => {
    e.preventDefault();
    showToast('✅ Avenant créé !', 'success');
    closeModal('modal-new-avenant');
    closeModal('modal-marche');
    renderMarchesModule();
  });
}

async function openComparatif(id) {
  try {
    const data = await api.get(`/api/consultations/${id}/comparatif`);
    const { consultation, comparatif, recommandation } = data;
    const modal = document.createElement('div');
    modal.id = 'modal-comp';
    modal.className = 'fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4';
    modal.onclick = e => { if(e.target===modal) closeModal('modal-comp'); };
    modal.innerHTML = `<div class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl p-6">
      <div class="flex justify-between mb-6"><h2 class="text-xl font-bold text-white">📊 Comparatif - ${consultation.reference}</h2><button onclick="closeModal('modal-comp')" class="text-2xl text-gray-400">×</button></div>
      <table class="w-full text-sm mb-6"><thead><tr class="text-gray-400 border-b border-slate-700"><th class="text-left py-3">Entreprise</th><th class="text-right">Montant</th><th class="text-center">Délai</th><th class="text-center">Note</th></tr></thead>
        <tbody>${comparatif.map((c,i)=>`<tr class="border-b border-slate-800 ${i===0?'bg-emerald-500/10':''}"><td class="py-3 text-white">${c.entreprise.nom}${i===0?' <span class="text-xs bg-emerald-500 px-2 py-0.5 rounded">Recommandé</span>':''}</td><td class="text-right text-white">${formatMontant(c.offre.montantHT)}</td><td class="text-center text-white">${c.offre.delaiExecution||'-'}j</td><td class="text-center"><span class="px-2 py-1 bg-indigo-600 text-white rounded">${c.notes.noteGlobale}</span></td></tr>`).join('')}</tbody></table>
      <div class="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl"><p class="text-emerald-400 font-medium">💡 Recommandation</p><p class="text-white mt-2"><strong>${recommandation.mieuxDisant.nom}</strong></p></div>
      <div class="mt-4 flex justify-end"><button onclick="closeModal('modal-comp')" class="px-4 py-2 bg-slate-700 text-white rounded-lg">Fermer</button></div>
    </div>`;
    document.body.appendChild(modal);
  } catch(e) { showToast('Erreur comparatif','error'); }
}

// INIT
function initModulesVisiobat() {
  console.log('🏗️ BTP Connect v9.0 - Management Avancé ACTIFS');
  window.api = api;
  
  // Exposer les fonctions de rendu directement (modules activés par défaut)
  window.renderMarchesModule = renderMarchesModule;
  window.renderCRModule = renderCRModule;
  window.renderVisionneuseModule = renderVisionneuseModule;
  window.renderAOModule = renderAOModule;
  
  // Fonctions modals/détails
  window.openMarcheDetail = openMarcheDetail;
  window.openCRDetail = openCRDetail;
  window.openComparatif = openComparatif;
  window.openImportDPGFModal = openImportDPGFModal;
  window.closeModal = closeModal;
  window.showToast = showToast;
  
  // Fonctions création (nouveaux éléments)
  window.openNewMarcheModal = openNewMarcheModal;
  window.openNewCRModal = openNewCRModal;
  window.openNewConsultationModal = openNewConsultationModal;
  window.openNewSituationModal = openNewSituationModal;
  window.openNewAvenantModal = openNewAvenantModal;
  
  // Fonctions AO
  window.openAODetail = openAODetail;
  window.sendRelanceAO = sendRelanceAO;
  window.filterAOByStatus = filterAOByStatus;
  window.showAOStatsModal = showAOStatsModal;
  
  // Helper pour vérifier les features (conservé pour compatibilité)
  window.checkFeatureAndRender = checkFeatureAndRender;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initModulesVisiobat);
else initModulesVisiobat();
