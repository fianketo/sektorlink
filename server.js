const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');

// Overridable via env vars so the Electron server-app wrapper (server-app/main.js)
// can point these at a writable per-user data folder instead of __dirname, which
// sits read-only inside app.asar once packaged. Plain "node server.js" usage is
// unaffected since these env vars are unset in that case.
const CONFIG_PATH = process.env.SEKTORLINK_CONFIG_PATH || path.join(__dirname, 'config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  console.error('Nedostaje config.json. Kopiraj config.example.json u config.json i upiši svoj pristupni kod.');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const PORT = config.port || 3131;

const DATA_DIR = process.env.SEKTORLINK_DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const COLLECTIONS = ['sectors', 'patients', 'messages'];
const UNSAFE_KEYS = ['__proto__', 'constructor', 'prototype'];

function loadDB() {
  if (fs.existsSync(DB_PATH)) {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  }
  const sectors = {};
  ['Sektor 1', 'Sektor 2', 'Sektor 3'].forEach((name, i) => {
    const id = 's' + (i + 1) + '_' + Date.now().toString(36);
    sectors[id] = { id, name, order: i };
  });
  return { sectors, patients: {}, messages: {} };
}

const db = loadDB();

function saveDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}
saveDB();

const app = express();
app.use(express.static(process.env.SEKTORLINK_PUBLIC_DIR || path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ws re-emits the underlying http server's 'error' on the WebSocket.Server
// instance (wss), not on `server` — without a listener here that re-emit
// throws with no visible message (e.g. a silent-looking crash on port
// conflicts). Listening on both covers ws's re-emit and any error the http
// server raises before ws attaches its own listener.
function handleServerError(err) {
  const msg = err.code === 'EADDRINUSE'
    ? `Port ${PORT} je već zauzet — zatvori drugi program koji ga koristi ili promeni "port" u config.json.`
    : `Greška servera: ${err.message}`;
  console.error(msg);
  process.exit(1);
}
wss.on('error', handleServerError);
server.on('error', handleServerError);

function broadcast(msg) {
  const raw = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(raw);
  });
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'init', sectors: db.sectors, patients: db.patients, messages: db.messages }));

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || !COLLECTIONS.includes(msg.collection)) return;
    if (typeof msg.id !== 'string' || !msg.id || UNSAFE_KEYS.includes(msg.id)) return;

    if (msg.type === 'mutate' && msg.data && typeof msg.data === 'object') {
      db[msg.collection][msg.id] = msg.data;
      saveDB();
      broadcast({ type: 'update', collection: msg.collection, id: msg.id, data: msg.data });
    } else if (msg.type === 'remove') {
      delete db[msg.collection][msg.id];
      saveDB();
      broadcast({ type: 'remove', collection: msg.collection, id: msg.id });
    }
  });
});

server.listen(PORT, () => {
  console.log(`SektorLink server radi na portu ${PORT}`);
  console.log(`Otvori http://localhost:${PORT}/ u browseru.`);
});
