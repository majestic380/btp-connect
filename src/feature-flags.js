// ============================================
// 🚩 BTP CONNECT v9.0 - SERVICE FEATURE FLAGS CLIENT
// Gestion côté frontend des fonctionnalités
// Date : 17/01/2026
// ============================================

(function (global) {
  'use strict';

  const API_BASE = global.API_URL || 'http://127.0.0.1:3000';
  
  // Cache des features - ACTIVER TOUS LES MODULES PAR DÉFAUT
  let featuresCache = {
    // Modules Visiobat
    'MODULE_MARCHES': true,
    'MODULE_CR': true,
    'MODULE_VISIONNEUSE': true,
    'MODULE_APPELS_OFFRES': true,
    // Fonctionnalités générales
    'ANALYSE_IA': true,
    'EXPORT_EXCEL': true,
    'IMPORT_EXCEL': true,
    'EMAIL_RELANCE': true,
    'PORTAIL_ST': true
  };
  let cacheTimestamp = Date.now();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Détection de la plateforme
  function detectPlatform() {
    if (typeof window !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase();
      
      // Electron
      if (ua.includes('electron')) return 'desktop';
      
      // Mobile
      if (ua.includes('mobile') || ua.includes('android') || 
          ua.includes('iphone') || ua.includes('ipad')) {
        return 'mobile';
      }
    }
    return 'web';
  }

  // API Helper
  async function apiCall(endpoint, options = {}) {
    const token = localStorage.getItem('btpconnect_token');
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-Platform': detectPlatform(),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    try {
      const response = await fetch(url, { ...options, headers });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `HTTP ${response.status}`);
      }
      return response.json();
    } catch (e) {
      console.error(`[FeatureFlags] API Error [${endpoint}]:`, e);
      throw e;
    }
  }

  // ============================================
  // SERVICE PRINCIPAL
  // ============================================

  const FeatureFlags = {
    platform: detectPlatform(),

    /**
     * Charge la configuration des features depuis l'API
     * @param {boolean} force - Force le rechargement même si en cache
     */
    async load(force = false) {
      const now = Date.now();
      
      if (!force && featuresCache && (now - cacheTimestamp) < CACHE_TTL) {
        return featuresCache;
      }

      try {
        const data = await apiCall(`/features/config?platform=${this.platform}`);
        featuresCache = data.features || {};
        cacheTimestamp = now;
        console.log('[FeatureFlags] Loaded', Object.keys(featuresCache).length, 'features');
        return featuresCache;
      } catch (e) {
        console.warn('[FeatureFlags] Failed to load, using defaults');
        return featuresCache || {};
      }
    },

    /**
     * Vérifie si une feature est activée
     * @param {string} code - Code de la feature
     * @returns {boolean}
     */
    isEnabled(code) {
      if (!featuresCache) {
        console.warn('[FeatureFlags] Cache not loaded, call load() first');
        return false;
      }
      return featuresCache[code] === true;
    },

    /**
     * Vérifie plusieurs features (toutes doivent être activées)
     * @param {string[]} codes - Codes des features
     * @returns {boolean}
     */
    allEnabled(codes) {
      return codes.every(code => this.isEnabled(code));
    },

    /**
     * Vérifie si au moins une feature est activée
     * @param {string[]} codes - Codes des features
     * @returns {boolean}
     */
    anyEnabled(codes) {
      return codes.some(code => this.isEnabled(code));
    },

    /**
     * Récupère la liste des features activées
     * @returns {string[]}
     */
    getEnabled() {
      if (!featuresCache) return [];
      return Object.entries(featuresCache)
        .filter(([_, enabled]) => enabled)
        .map(([code]) => code);
    },

    /**
     * Récupère toutes les features avec leur statut
     * @returns {Object}
     */
    getAll() {
      return { ...featuresCache };
    },

    /**
     * Vide le cache
     */
    clearCache() {
      featuresCache = null;
      cacheTimestamp = 0;
    },

    /**
     * Vérifie et cache de façon asynchrone
     * @param {string} code
     * @returns {Promise<boolean>}
     */
    async check(code) {
      if (!featuresCache) {
        await this.load();
      }
      return this.isEnabled(code);
    },

    // ============================================
    // HELPERS UI
    // ============================================

    /**
     * Affiche/masque un élément selon une feature
     * @param {string} selector - Sélecteur CSS
     * @param {string} featureCode - Code de la feature
     */
    toggleElement(selector, featureCode) {
      const el = document.querySelector(selector);
      if (el) {
        el.style.display = this.isEnabled(featureCode) ? '' : 'none';
      }
    },

    /**
     * Applique le toggle sur plusieurs éléments
     * @param {Object} mapping - { selector: featureCode }
     */
    applyToElements(mapping) {
      for (const [selector, code] of Object.entries(mapping)) {
        this.toggleElement(selector, code);
      }
    },

    /**
     * Désactive un élément si la feature est désactivée
     * @param {string} selector
     * @param {string} featureCode
     */
    disableElement(selector, featureCode) {
      const el = document.querySelector(selector);
      if (el) {
        if (!this.isEnabled(featureCode)) {
          el.setAttribute('disabled', 'true');
          el.classList.add('feature-disabled');
          el.title = 'Fonctionnalité non disponible';
        } else {
          el.removeAttribute('disabled');
          el.classList.remove('feature-disabled');
        }
      }
    },

    /**
     * Wrapper pour exécuter du code seulement si feature activée
     * @param {string} code
     * @param {Function} callback
     */
    ifEnabled(code, callback) {
      if (this.isEnabled(code)) {
        callback();
      }
    },

    /**
     * Crée un guard pour les fonctions
     * @param {string} code
     * @returns {Function} - Decorator
     */
    guard(code) {
      const self = this;
      return function(fn) {
        return function(...args) {
          if (self.isEnabled(code)) {
            return fn.apply(this, args);
          } else {
            console.warn(`[FeatureFlags] Feature "${code}" is disabled`);
            return null;
          }
        };
      };
    }
  };

  // ============================================
  // ADMIN PANEL
  // ============================================

  const FeatureFlagsAdmin = {
    /**
     * Récupère tous les flags pour l'admin
     */
    async getAll() {
      return apiCall('/admin/features');
    },

    /**
     * Récupère les flags groupés par catégorie
     */
    async getByCategory() {
      return apiCall('/admin/features/by-category');
    },

    /**
     * Récupère la matrice complète
     */
    async getMatrix() {
      return apiCall('/admin/features/matrix');
    },

    /**
     * Met à jour un flag
     * @param {string} code
     * @param {Object} updates
     */
    async update(code, updates) {
      return apiCall(`/admin/features/${code}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
    },

    /**
     * Toggle une feature
     * @param {string} code
     * @param {boolean} [enabled]
     */
    async toggle(code, enabled) {
      return apiCall(`/admin/features/${code}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ enabled })
      });
    },

    /**
     * Toggle toutes les features d'une plateforme
     * @param {string} platform
     * @param {boolean} enabled
     * @param {string} [category]
     */
    async togglePlatform(platform, enabled, category) {
      return apiCall(`/admin/features/platform/${platform}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ enabled, category })
      });
    },

    /**
     * Réinitialise aux valeurs par défaut
     */
    async reset() {
      return apiCall('/admin/features/reset', {
        method: 'POST',
        body: JSON.stringify({ confirm: true })
      });
    },

    /**
     * Rend le panneau d'administration
     * @param {string} containerId
     */
    async renderPanel(containerId) {
      const container = document.getElementById(containerId);
      if (!container) return;

      container.innerHTML = '<div class="flex items-center justify-center py-8"><div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div></div>';

      try {
        const { matrix, stats } = await this.getMatrix();
        
        const categoryLabels = {
          MODULE: '📦 Modules',
          FEATURE: '⚙️ Fonctionnalités',
          UI: '🎨 Interface',
          BETA: '🧪 Beta',
          ADMIN: '🔒 Administration'
        };

        const categoryOrder = ['MODULE', 'FEATURE', 'UI', 'BETA', 'ADMIN'];
        const grouped = {};
        for (const item of matrix) {
          if (!grouped[item.category]) grouped[item.category] = [];
          grouped[item.category].push(item);
        }

        container.innerHTML = `
          <div class="space-y-6">
            <!-- Header -->
            <div class="flex justify-between items-center">
              <div>
                <h2 class="text-2xl font-bold text-white">🚩 Gestion des Fonctionnalités</h2>
                <p class="text-gray-400 text-sm mt-1">
                  ${stats.enabled}/${stats.total} activées • 
                  Desktop: ${stats.desktop} • Mobile: ${stats.mobile} • Web: ${stats.web}
                </p>
              </div>
              <div class="flex gap-2">
                <button onclick="FeatureFlagsAdmin.reset().then(() => FeatureFlagsAdmin.renderPanel('${containerId}'))" 
                        class="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">
                  🔄 Réinitialiser
                </button>
              </div>
            </div>

            <!-- Quick Actions -->
            <div class="grid grid-cols-3 gap-4">
              <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                <h3 class="text-white font-semibold mb-3">🖥️ Desktop</h3>
                <div class="flex gap-2">
                  <button onclick="FeatureFlagsAdmin.togglePlatform('desktop', true).then(() => FeatureFlagsAdmin.renderPanel('${containerId}'))"
                          class="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm">Tout activer</button>
                  <button onclick="FeatureFlagsAdmin.togglePlatform('desktop', false).then(() => FeatureFlagsAdmin.renderPanel('${containerId}'))"
                          class="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm">Tout désactiver</button>
                </div>
              </div>
              <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                <h3 class="text-white font-semibold mb-3">📱 Mobile</h3>
                <div class="flex gap-2">
                  <button onclick="FeatureFlagsAdmin.togglePlatform('mobile', true).then(() => FeatureFlagsAdmin.renderPanel('${containerId}'))"
                          class="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm">Tout activer</button>
                  <button onclick="FeatureFlagsAdmin.togglePlatform('mobile', false).then(() => FeatureFlagsAdmin.renderPanel('${containerId}'))"
                          class="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm">Tout désactiver</button>
                </div>
              </div>
              <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
                <h3 class="text-white font-semibold mb-3">🌐 Web</h3>
                <div class="flex gap-2">
                  <button onclick="FeatureFlagsAdmin.togglePlatform('web', true).then(() => FeatureFlagsAdmin.renderPanel('${containerId}'))"
                          class="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-sm">Tout activer</button>
                  <button onclick="FeatureFlagsAdmin.togglePlatform('web', false).then(() => FeatureFlagsAdmin.renderPanel('${containerId}'))"
                          class="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm">Tout désactiver</button>
                </div>
              </div>
            </div>

            <!-- Features Table -->
            <div class="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
              <table class="w-full">
                <thead class="bg-slate-900/50">
                  <tr class="text-left text-gray-400 text-sm">
                    <th class="px-4 py-3 font-medium">Fonctionnalité</th>
                    <th class="px-4 py-3 font-medium text-center">Global</th>
                    <th class="px-4 py-3 font-medium text-center">🖥️ Desktop</th>
                    <th class="px-4 py-3 font-medium text-center">📱 Mobile</th>
                    <th class="px-4 py-3 font-medium text-center">🌐 Web</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-700">
                  ${categoryOrder.map(cat => {
                    const items = grouped[cat] || [];
                    if (items.length === 0) return '';
                    return `
                      <tr class="bg-slate-800/30">
                        <td colspan="5" class="px-4 py-2 text-white font-semibold">${categoryLabels[cat] || cat}</td>
                      </tr>
                      ${items.map(f => `
                        <tr class="hover:bg-slate-700/30 ${f.deprecated ? 'opacity-50' : ''}">
                          <td class="px-4 py-3">
                            <div class="flex items-center gap-2">
                              <span class="text-lg">${f.icone || '📌'}</span>
                              <div>
                                <p class="text-white font-medium">${f.nom}</p>
                                <p class="text-gray-500 text-xs">${f.code}</p>
                              </div>
                              ${f.deprecated ? '<span class="px-1.5 py-0.5 text-xs bg-red-500/20 text-red-400 rounded">Obsolète</span>' : ''}
                              ${f.dependsOn?.length ? `<span class="px-1.5 py-0.5 text-xs bg-slate-600 text-gray-300 rounded" title="Dépend de: ${f.dependsOn.join(', ')}">🔗</span>` : ''}
                            </div>
                          </td>
                          <td class="px-4 py-3 text-center">
                            <button onclick="FeatureFlagsAdmin.toggle('${f.code}').then(() => FeatureFlagsAdmin.renderPanel('${containerId}'))"
                                    class="w-12 h-6 rounded-full relative ${f.global ? 'bg-green-500' : 'bg-slate-600'}">
                              <span class="absolute w-5 h-5 bg-white rounded-full top-0.5 transition-all ${f.global ? 'left-6' : 'left-0.5'}"></span>
                            </button>
                          </td>
                          <td class="px-4 py-3 text-center">
                            <button onclick="FeatureFlagsAdmin.update('${f.code}', { enabledDesktop: ${!f.desktop} }).then(() => FeatureFlagsAdmin.renderPanel('${containerId}'))"
                                    class="w-10 h-6 rounded-full ${f.desktop ? 'bg-green-500' : 'bg-slate-600'} ${!f.global ? 'opacity-30 cursor-not-allowed' : ''}">
                            </button>
                          </td>
                          <td class="px-4 py-3 text-center">
                            <button onclick="FeatureFlagsAdmin.update('${f.code}', { enabledMobile: ${!f.mobile} }).then(() => FeatureFlagsAdmin.renderPanel('${containerId}'))"
                                    class="w-10 h-6 rounded-full ${f.mobile ? 'bg-green-500' : 'bg-slate-600'} ${!f.global ? 'opacity-30 cursor-not-allowed' : ''}">
                            </button>
                          </td>
                          <td class="px-4 py-3 text-center">
                            <button onclick="FeatureFlagsAdmin.update('${f.code}', { enabledWeb: ${!f.web} }).then(() => FeatureFlagsAdmin.renderPanel('${containerId}'))"
                                    class="w-10 h-6 rounded-full ${f.web ? 'bg-green-500' : 'bg-slate-600'} ${!f.global ? 'opacity-30 cursor-not-allowed' : ''}">
                            </button>
                          </td>
                        </tr>
                      `).join('')}
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <!-- Legend -->
            <div class="flex gap-6 text-sm text-gray-400">
              <div class="flex items-center gap-2">
                <div class="w-4 h-4 rounded bg-green-500"></div>
                <span>Activé</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-4 h-4 rounded bg-slate-600"></div>
                <span>Désactivé</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-lg">🔗</span>
                <span>Dépendances</span>
              </div>
            </div>
          </div>
        `;
      } catch (e) {
        container.innerHTML = `
          <div class="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
            <p class="text-red-400 mb-2">Erreur de chargement des fonctionnalités</p>
            <p class="text-gray-400 text-sm">${e.message}</p>
            <button onclick="FeatureFlagsAdmin.renderPanel('${containerId}')" 
                    class="mt-4 px-4 py-2 bg-slate-700 text-white rounded-lg">Réessayer</button>
          </div>
        `;
      }
    }
  };

  // ============================================
  // INITIALISATION
  // ============================================

  async function initFeatureFlags() {
    console.log('[FeatureFlags] Initializing...');
    console.log('[FeatureFlags] Platform:', FeatureFlags.platform);
    
    try {
      await FeatureFlags.load();
      console.log('[FeatureFlags] Ready');
    } catch (e) {
      console.warn('[FeatureFlags] Init failed, features may be unavailable');
    }
  }

  // Auto-init au chargement
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initFeatureFlags);
    } else {
      initFeatureFlags();
    }
  }

  // Export global
  global.FeatureFlags = FeatureFlags;
  global.FeatureFlagsAdmin = FeatureFlagsAdmin;

})(typeof window !== 'undefined' ? window : global);
