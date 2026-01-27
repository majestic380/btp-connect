// preload.js
// Minimal, safe bridge between renderer and Electron main.
// A2: expose configuration read/write + controlled relaunch.

const { contextBridge, ipcRenderer } = require('electron');

function safeInvoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload);
}

contextBridge.exposeInMainWorld('btpconnect', {
  ping: () => 'pong',
  /** Returns the resolved backend URL used by the app (computed in main). */
  backendUrl: () => safeInvoke('btp:backendUrl:get'),
  /** Read/write app configuration (non-secret). */
  config: {
    get: () => safeInvoke('btp:config:get'),
    set: (partial) => safeInvoke('btp:config:set', partial),
  },
  /** Request a controlled restart (A2 applies changes on next boot). */
  relaunch: () => safeInvoke('btp:app:relaunch'),
});
