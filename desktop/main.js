const { app, BrowserWindow, globalShortcut, screen, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Without this, launching the app a second time (e.g. it auto-started at
// login, then someone also double-clicks the desktop icon) creates a whole
// second, independent overlay window — invisible in the taskbar/alt-tab
// (skipTaskbar), sharing the same saved "Administrator" role but with its
// own separate urgent-alert state. A message sent from one window doesn't
// reach the other's alertedMessageIds, so the second window treats it as a
// brand new urgent message and starts beeping — with a window nobody can
// find to dismiss it. Only one instance is now ever allowed to run; a
// second launch just re-shows the existing window and exits.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

// Must live in a writable per-user folder, not next to main.js: in a
// packaged (asar) build __dirname points inside the read-only app.asar
// archive, so writing config.json there would silently fail.
let CONFIG_PATH = null;
let SERVER_URL = null;

function loadConfig() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  SERVER_URL = config.serverUrl.replace(/\/$/, '');
}

const OVERLAY_EXPANDED = { width: 340, height: 620 };
const OVERLAY_COLLAPSED = { width: 54, height: 54 };
const RETRY_DELAY_MS = 3000;

// Shown instead of a blank white window whenever the server isn't reachable
// yet — most commonly right after Windows boots, when this app auto-starts
// before the SektorLink server process has finished coming up.
const LOADING_HTML = 'data:text/html;charset=utf-8,' + encodeURIComponent(`
<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body { margin:0; height:100vh; display:flex; align-items:center; justify-content:center;
  background:#060a14; color:#e8eef7; font-family:-apple-system,'Segoe UI',sans-serif; flex-direction:column; gap:1rem; }
.spinner { width:32px; height:32px; border:3px solid rgba(255,255,255,.15); border-top-color:#06b6d4;
  border-radius:50%; animation:spin 1s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
</style></head><body><div class="spinner"></div><div>Povezivanje sa SektorLink serverom...</div></body></html>
`);

// Keeps retrying loadURL(url) on this window until it succeeds, showing the
// spinner screen in between attempts instead of leaving a blank page.
function attachLoadRetry(win, url) {
  win.webContents.on('did-fail-load', (event, errorCode, description, validatedURL, isMainFrame) => {
    if (!isMainFrame || win.isDestroyed() || errorCode === -3) return; // -3 = ERR_ABORTED, just us reloading
    if (validatedURL !== url) return; // ignore failures of the loading screen itself
    win.loadURL(LOADING_HTML);
    setTimeout(() => { if (!win.isDestroyed()) win.loadURL(url).catch(() => {}); }, RETRY_DELAY_MS);
  });
}

Menu.setApplicationMenu(null);

let overlayWindow;
let setupWindow;

function createOverlayWindow() {
  const { width } = screen.getPrimaryDisplay().workAreaSize;
  overlayWindow = new BrowserWindow({
    width: OVERLAY_EXPANDED.width,
    height: OVERLAY_EXPANDED.height,
    x: width - OVERLAY_EXPANDED.width - 20,
    y: 60,
    show: false,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  attachLoadRetry(overlayWindow, SERVER_URL + '/overlay.html');
  overlayWindow.loadURL(SERVER_URL + '/overlay.html').catch(() => {});
  overlayWindow.setVisibleOnAllWorkspaces(true);
  // showInactive (not show/focus): stays on top and visible, but never
  // steals keyboard focus away from whatever app the person is using.
  overlayWindow.once('ready-to-show', () => overlayWindow.showInactive());
  overlayWindow.on('closed', () => { overlayWindow = null; });
}

// Creates a "SektorLink" desktop icon on first run, so there's no manual
// "Send to > Desktop" step when setting up a new computer — just copy this
// folder and double-click the .vbs launcher once.
function ensureDesktopShortcut() {
  // Installed (NSIS) builds already get a desktop shortcut from the installer
  // itself, pointed at the real packaged .exe — skip so we don't create a
  // second, wrong shortcut pointing at a .vbs file that isn't shipped inside
  // the packaged app.
  if (process.platform !== 'win32' || app.isPackaged) return;
  try {
    const shortcutPath = path.join(app.getPath('desktop'), 'SektorLink.lnk');
    if (fs.existsSync(shortcutPath)) return;
    shell.writeShortcutLink(shortcutPath, 'create', {
      target: path.join(__dirname, 'Pokreni SektorLink.vbs'),
      cwd: __dirname,
      description: 'Pokreni SektorLink desktop aplikaciju',
      icon: process.execPath,
      iconIndex: 0
    });
  } catch (e) {}
}

function enableAutoStart() {
  // app.isPackaged is false when running via "npm start" (electron .) —
  // in that dev-style setup Windows needs the electron.exe binary PLUS
  // this folder's path as an argument to relaunch the right app on login.
  // A packaged/installed build wouldn't need the explicit path/args.
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true });
  } else {
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath,
      args: [path.resolve(__dirname)]
    });
  }
}

function startApp() {
  createOverlayWindow();
  globalShortcut.register('CommandOrControl+Shift+L', () => {
    if (!overlayWindow) return;
    if (overlayWindow.isVisible()) {
      // Hiding a window doesn't stop its page's JS — if an urgent alert's
      // beep loop was still running, it would otherwise keep beeping from
      // the hidden window with no way to silence it (same fix as the
      // in-page "Zatvori" button, just reached from the keyboard instead).
      overlayWindow.webContents.send('stop-urgent-alert');
      overlayWindow.hide();
    } else {
      overlayWindow.showInactive();
    }
  });
}

// First launch on a computer that was just copied over (no config.json yet):
// ask for the server address through a small window instead of requiring
// someone to hand-edit a JSON file.
function showSetupWindow() {
  setupWindow = new BrowserWindow({
    width: 440,
    height: 440,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'setup-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  setupWindow.loadFile('setup.html');
  setupWindow.on('closed', () => { setupWindow = null; });
}

app.on('second-instance', () => {
  if (overlayWindow) {
    if (overlayWindow.isMinimized()) overlayWindow.restore();
    overlayWindow.showInactive();
    overlayWindow.moveTop();
  } else if (setupWindow) {
    setupWindow.show();
    setupWindow.focus();
  }
});

ipcMain.once('save-server-config', (event, serverUrl) => {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ serverUrl }, null, 2));
  loadConfig();
  if (setupWindow) setupWindow.close();
  startApp();
});

app.whenReady().then(() => {
  CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
  enableAutoStart();
  ensureDesktopShortcut();
  if (fs.existsSync(CONFIG_PATH)) {
    loadConfig();
    startApp();
  } else {
    showSetupWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('will-quit', () => { globalShortcut.unregisterAll(); });

ipcMain.on('overlay-set-collapsed', (event, collapsed) => {
  if (!overlayWindow) return;
  const size = collapsed ? OVERLAY_COLLAPSED : OVERLAY_EXPANDED;
  const current = overlayWindow.getBounds();
  // Anchor to the right edge instead of the left: keeping x fixed while
  // shrinking from 340px down to 54px left the bubble sitting well to the
  // left of where the panel's right edge (and its far-right desktop
  // position) had been, instead of hugging it.
  const rightEdge = current.x + current.width;
  overlayWindow.setBounds({ x: rightEdge - size.width, y: current.y, width: size.width, height: size.height });
});
ipcMain.on('overlay-hide', () => { if (overlayWindow) overlayWindow.hide(); });

// Manual drag for the collapsed bubble — see the no-drag CSS note in
// overlay.html. dx/dy are the mouse's screen-position delta since the last
// move event, applied straight to the window's current position.
ipcMain.on('overlay-drag-bubble', (event, dx, dy) => {
  if (!overlayWindow) return;
  const current = overlayWindow.getBounds();
  overlayWindow.setBounds({ x: current.x + dx, y: current.y + dy, width: current.width, height: current.height });
});

// Hitna poruka stigla — bring the overlay to the very front of the z-order
// (even above other always-on-top windows) without stealing keyboard focus,
// and if it happens to be hidden (Ctrl+Shift+L), show it again.
ipcMain.on('overlay-flash-urgent', () => {
  if (!overlayWindow) return;
  if (!overlayWindow.isVisible()) overlayWindow.showInactive();
  overlayWindow.moveTop();
  try { overlayWindow.flashFrame(true); } catch (e) {}
});
