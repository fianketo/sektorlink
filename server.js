const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');

const CONFIG_PATH = path.join(__dirname, 'config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  console.error('Nedostaje config.json. Kopiraj config.example.json u config.json i upiši svoj pristupni kod.');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const PORT = config.port || 3131;

const DATA_DIR = path.join(__dirname, 'data');
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
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function broadcast(msg) {
  const raw = JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(raw);
  });
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const code = url.searchParams.get('code');
  if (code !== config.accessCode) {
    ws.close(4001, 'bad_code');
    return;
  }

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
