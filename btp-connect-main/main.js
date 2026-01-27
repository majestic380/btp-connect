const path = require("path");
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require('os');
const http = require('http');

// A5: deterministic userData (optional)
if (process.env.BTP_USERDATA_DIR && process.env.BTP_USERDATA_DIR.trim()) {
  try {
    app.setPath('userData', process.env.BTP_USERDATA_DIR.trim());
  } catch (e) {
    console.error('[BTP Connect] Failed to override userData dir:', e);
  }
}

// Flags
const isSilent = process.argv.includes("--silent");
const isMinimized = process.argv.includes("--minimized");

// ========== A2: App config (non-secret) ==========
const DEFAULT_CONFIG = {
  mode: "local", // local | lan | cloud
  apiUrl: "http://127.0.0.1:8001",
  backendPort: 8001,
  lanExpose: false,
  cloudUrl: "", // URL du serveur cloud si mode cloud
};

let currentConfig = { ...DEFAULT_CONFIG };
let resolvedBackendUrl = DEFAULT_CONFIG.apiUrl;

let mainWindow;
let backendProc = null;

// Obtenir l'IP locale pour le mode LAN
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function getConfigPath() {
  return path.join(app.getPath("userData"), "app.config.json");
}

function readConfig() {
  const cfgPath = getConfigPath();
  try {
    if (!fs.existsSync(cfgPath)) {
      fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
      fs.writeFileSync(cfgPath, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
      return { ...DEFAULT_CONFIG };
    }
    const raw = fs.readFileSync(cfgPath, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (e) {
    console.error("[BTP Connect] Failed to read config, using defaults:", e);
    return { ...DEFAULT_CONFIG };
  }
}

function validateAndMergeConfig(partial) {
  const next = { ...currentConfig };
  if (partial && typeof partial === "object") {
    if (typeof partial.mode === "string") {
      const m = partial.mode.toLowerCase();
      if (!["local", "lan", "cloud"].includes(m)) {
        throw new Error("Invalid mode. Expected local|lan|cloud");
      }
      next.mode = m;
    }
    if (partial.apiUrl !== undefined) {
      if (typeof partial.apiUrl !== "string" || !partial.apiUrl.trim()) {
        throw new Error("Invalid apiUrl");
      }
      next.apiUrl = partial.apiUrl.trim();
    }
    if (partial.backendPort !== undefined) {
      const p = Number(partial.backendPort);
      if (!Number.isInteger(p) || p < 1 || p > 65535) {
        throw new Error("Invalid backendPort");
      }
      next.backendPort = p;
    }
    if (partial.lanExpose !== undefined) {
      next.lanExpose = !!partial.lanExpose;
    }
    if (partial.cloudUrl !== undefined) {
      next.cloudUrl = String(partial.cloudUrl).trim();
    }
  }
  return next;
}

function writeConfig(nextCfg) {
  const cfgPath = getConfigPath();
  fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
  fs.writeFileSync(cfgPath, JSON.stringify(nextCfg, null, 2) + os.EOL, "utf-8");
}

function startBackendBestEffort() {
  // Only start backend automatically for local/lan modes.
  if (currentConfig.mode === "cloud") {
    console.log("[BTP Connect] Cloud mode: backend auto-start disabled.");
    console.log("[BTP Connect] Using cloud URL:", currentConfig.cloudUrl || currentConfig.apiUrl);
    return;
  }

  // We only auto-start if we can find a built backend entrypoint.
  const backendDir = path.join(__dirname, "backend");
  const builtEntry = path.join(backendDir, "dist", "server.js");

  // Chercher aussi dans les ressources extraites (pour l'EXE packagé)
  const resourcesBackendDir = path.join(process.resourcesPath || __dirname, "backend");
  const resourcesEntry = path.join(resourcesBackendDir, "dist", "server.js");

  let actualEntry = null;
  let actualDir = null;

  if (fs.existsSync(builtEntry)) {
    actualEntry = builtEntry;
    actualDir = backendDir;
  } else if (fs.existsSync(resourcesEntry)) {
    actualEntry = resourcesEntry;
    actualDir = resourcesBackendDir;
  }

  if (!actualEntry) {
    console.log("[BTP Connect] Backend not started automatically (missing backend/dist/server.js).");
    console.log("[BTP Connect] To enable auto-start, run: cd backend && npm install && npm run prisma:generate && npm run prisma:migrate && npm run build");
    return;
  }

  if (backendProc) return;

  const bindHost = (currentConfig.mode === "lan" && currentConfig.lanExpose) ? "0.0.0.0" : "127.0.0.1";
  const localIP = getLocalIP();
  
  if (currentConfig.mode === "lan") {
    console.log(`[BTP Connect] LAN mode: lanExpose=${currentConfig.lanExpose} (HOST=${bindHost})`);
    console.log(`[BTP Connect] LAN IP: ${localIP}:${currentConfig.backendPort}`);
  }

  console.log(`[BTP Connect] Starting backend from: ${actualEntry}`);

  // Générer des secrets JWT par défaut si non définis
  const crypto = require('crypto');
  const defaultJwtAccess = crypto.randomBytes(32).toString('hex');
  const defaultJwtRefresh = crypto.randomBytes(32).toString('hex');

  backendProc = spawn(process.execPath, [actualEntry], {
    cwd: actualDir,
    env: {
      ...process.env,
      PORT: String(currentConfig.backendPort),
      HOST: bindHost,
      BTP_MODE: currentConfig.mode,
      NODE_ENV: process.env.NODE_ENV || 'development',
      // JWT Secrets (générés automatiquement si non définis)
      JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || defaultJwtAccess,
      JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || defaultJwtRefresh,
      JWT_ACCESS_TTL: process.env.JWT_ACCESS_TTL || '15m',
      JWT_REFRESH_TTL: process.env.JWT_REFRESH_TTL || '7d',
      // Database
      DATABASE_URL: process.env.DATABASE_URL || `file:${path.join(actualDir, 'prisma', 'dev.db')}`,
      // CORS
      CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
    },
    stdio: "inherit"
  });

  backendProc.on("exit", (code, signal) => {
    console.log(`[BTP Connect] Backend exited (code=${code}, signal=${signal}).`);
    backendProc = null;
  });

  backendProc.on("error", (err) => {
    console.error(`[BTP Connect] Backend error:`, err);
  });
}

function computeBackendUrl() {
  if (currentConfig.mode === "cloud") {
    resolvedBackendUrl = currentConfig.cloudUrl || currentConfig.apiUrl;
    return;
  }
  if (currentConfig.mode === "lan" && currentConfig.lanExpose) {
    const localIP = getLocalIP();
    resolvedBackendUrl = `http://${localIP}:${currentConfig.backendPort}`;
    return;
  }
  // local: renderer targets local backend.
  resolvedBackendUrl = `http://127.0.0.1:${currentConfig.backendPort}`;
}

function stopBackend() {
  if (!backendProc) return;
  try {
    backendProc.kill();
  } catch (e) {
    // ignore
  }
  backendProc = null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: !isSilent && !isMinimized,
    autoHideMenuBar: true,
    title: "BTP Connect",
    icon: path.join(__dirname, "src", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Afficher les infos de connexion au démarrage
  const localIP = getLocalIP();
  console.log("╔════════════════════════════════════════════════════════╗");
  console.log("║           BTP Connect - Application Standalone         ║");
  console.log("╠════════════════════════════════════════════════════════╣");
  console.log(`║ Mode actuel: ${currentConfig.mode.toUpperCase().padEnd(43)}║`);
  console.log(`║ Port: ${String(currentConfig.backendPort).padEnd(50)}║`);
  if (currentConfig.mode === "lan") {
    console.log(`║ Accès LAN: http://${localIP}:${currentConfig.backendPort}`.padEnd(59) + "║");
  }
  if (currentConfig.mode === "cloud") {
    console.log(`║ Cloud URL: ${(currentConfig.cloudUrl || 'Non configuré').substring(0, 45).padEnd(46)}║`);
  }
  console.log("╚════════════════════════════════════════════════════════╝");

  // Load local UI
  const uiPath = path.join(__dirname, "src", "index.html");
  const staticPath = path.join(__dirname, "backend", "src", "static", "pwa", "index.html");
  
  if (fs.existsSync(uiPath)) {
    mainWindow.loadFile(uiPath);
  } else if (fs.existsSync(staticPath)) {
    mainWindow.loadFile(staticPath);
  } else {
    // Fallback: load from backend URL
    mainWindow.loadURL(resolvedBackendUrl);
  }

  if (isMinimized) mainWindow.minimize();
}

// ========== IPC (A2) ==========
ipcMain.handle('btp:config:get', async () => {
  return { 
    ...currentConfig,
    localIP: getLocalIP(),
    lanUrl: `http://${getLocalIP()}:${currentConfig.backendPort}`
  };
});

ipcMain.handle('btp:config:set', async (_evt, partial) => {
  const next = validateAndMergeConfig(partial);
  writeConfig(next);
  currentConfig = next;
  computeBackendUrl();
  return { ok: true, config: { ...currentConfig } };
});

ipcMain.handle('btp:backendUrl:get', async () => {
  return resolvedBackendUrl;
});

ipcMain.handle('btp:app:relaunch', async () => {
  app.relaunch();
  app.exit(0);
  return { ok: true };
});

ipcMain.handle('btp:network:info', async () => {
  return {
    localIP: getLocalIP(),
    hostname: os.hostname(),
    platform: os.platform(),
    lanUrl: `http://${getLocalIP()}:${currentConfig.backendPort}`
  };
});

app.whenReady().then(() => {
  currentConfig = readConfig();
  computeBackendUrl();
  startBackendBestEffort();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  stopBackend();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
