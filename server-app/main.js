const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const { execFileSync } = require('child_process');

const ICON_PATH = path.join(__dirname, 'build', 'icon.ico');

let mainWindow = null;
let tray = null;
let quitting = false;

function getLanAddresses(port) {
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) addresses.push(`http://${iface.address}:${port}/`);
    }
  }
  return addresses;
}

// Without this, Windows' own interactive firewall prompt (on first inbound
// connection attempt) defaults to only checking "Public networks" — most
// office/home LANs are the "Private" profile, so the box people actually
// need checked is the one left unchecked. Pre-creating the rule for both
// profiles up front means other computers on the LAN can reach the server
// without anyone having to notice and fix that checkbox. Mirrors the same
// New-NetFirewallRule + elevate-if-needed approach install-server.ps1 uses
// for the manual/non-packaged setup path.
function ensureFirewallRule(port) {
  const ruleName = `SektorLink Server (${port})`;
  const script = `
$ruleName = '${ruleName}'
if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) { exit 0 }
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if ($isAdmin) {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort ${port} -Action Allow | Out-Null
} else {
  Start-Process powershell -Verb RunAs -WindowStyle Hidden -Wait -ArgumentList @('-NoProfile','-Command',"New-NetFirewallRule -DisplayName '$ruleName' -Direction Inbound -Protocol TCP -LocalPort ${port} -Action Allow")
}
`;
  const scriptPath = path.join(app.getPath('temp'), 'sektorlink-firewall.ps1');
  try {
    fs.writeFileSync(scriptPath, script);
    execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      windowsHide: true,
      timeout: 30000
    });
  } catch (e) {
    // Non-fatal: declined UAC prompt, restricted policy, etc. Worst case,
    // the interactive Windows Firewall prompt still shows up as a fallback
    // the first time another computer connects.
  } finally {
    try { fs.unlinkSync(scriptPath); } catch (e) {}
  }
}

// First run on this computer: give the server a default config instead of
// requiring someone to hand-copy config.example.json — zero-input setup.
function ensureConfig(configPath) {
  if (fs.existsSync(configPath)) return;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ port: 3131 }, null, 2));
}

// Checked up front (instead of relying on the async 'error' event a failed
// server.listen() would raise deep inside server.js / the ws library) so a
// port conflict produces one clear dialog instead of a confusing silent
// non-start.
function checkPortAvailable(port) {
  return new Promise(resolve => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => tester.close(() => resolve(true)));
    // No explicit host: must match server.js's own server.listen(PORT, cb)
    // exactly. Binding an explicit "0.0.0.0" here instead of leaving the
    // host unspecified (dual-stack "::") gave a false "available" result on
    // Windows even with another process already listening on the real port.
    tester.listen(port);
  });
}

// Runs the existing server.js in-process (Electron's main process is a full
// Node.js environment), pointed at a writable per-user data folder instead of
// its own install directory — packaged app.asar is read-only, and this also
// keeps patient data untouched by future reinstalls/updates of the app.
async function startServer() {
  const baseDir = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
  const serverJs = path.join(baseDir, 'server.js');
  const publicDir = path.join(baseDir, 'public');
  const configPath = path.join(app.getPath('userData'), 'config.json');
  const dataDir = path.join(app.getPath('userData'), 'data');

  ensureConfig(configPath);
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const port = config.port || 3131;

  if (!(await checkPortAvailable(port))) {
    throw new Error(
      `Port ${port} je već zauzet na ovom računaru — zatvori drugi program koji ga koristi, ` +
      `ili promeni "port" u ${configPath}.`
    );
  }

  process.env.SEKTORLINK_CONFIG_PATH = configPath;
  process.env.SEKTORLINK_DATA_DIR = dataDir;
  process.env.SEKTORLINK_PUBLIC_DIR = publicDir;

  require(serverJs);

  return port;
}

function enableAutoStart() {
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

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 460,
    resizable: false,
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('status.html');

  // Closing the window (X) should not stop the server — just hide it to
  // tray. Only the tray's "Izađi" really quits (see before-quit below).
  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  ipcMain.handle('get-status', () => ({ port, addresses: getLanAddresses(port) }));
}

function createTray(port) {
  tray = new Tray(ICON_PATH);
  tray.setToolTip(`SektorLink Server — radi na portu ${port}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Prikaži prozor', click: () => mainWindow && mainWindow.show() },
    { type: 'separator' },
    { label: 'Izađi (zaustavi server)', click: () => app.quit() }
  ]));
  tray.on('click', () => mainWindow && mainWindow.show());
}

app.on('before-quit', () => { quitting = true; });

app.whenReady().then(async () => {
  let port;
  try {
    port = await startServer();
  } catch (err) {
    // showErrorBox() returns immediately without waiting for the user to
    // dismiss it — calling app.quit() right after it used to close the
    // whole app (and the dialog with it) before anyone could read the
    // message. showMessageBoxSync() actually blocks until "OK" is clicked.
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'SektorLink Server — greška pri pokretanju',
      message: String((err && err.message) || err)
    });
    app.quit();
    return;
  }
  enableAutoStart();
  ensureFirewallRule(port);
  createWindow(port);
  createTray(port);
});

process.on('uncaughtException', (err) => {
  dialog.showErrorBox('SektorLink Server — greška', String((err && err.stack) || err));
});
