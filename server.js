/*
  Servidor Juego de Memoria con Arduino
  --------------------
  1. Abre el puerto serial del Arduino y escucha eventos "BTN:n"
  2. Reenvía esos eventos a todos los navegadores conectados vía WebSocket
  3. Permite enviar comandos LED:n:ON/OFF de vuelta al Arduino
  4. Expone API REST para guardar y consultar el leaderboard (SQLite)

  Uso:
    npm install
    node server.js
    (abrir http://localhost:3000)

  IMPORTANTE: ajusta SERIAL_PORT_PATH abajo con el puerto real de tu Arduino
  (en Windows algo como "COM3", en Linux/Mac algo como "/dev/ttyUSB0" o
  "/dev/ttyACM0"). Si lo dejas en "AUTO" el server intentará detectarlo.
*/

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const fs = require('fs');
const path = require('path');

const SERIAL_PORT_PATH = 'AUTO'; // <-- cambia esto si la autodetección falla
const SERIAL_BAUD_RATE = 9600;
const HTTP_PORT = 3000;

// ---------- "Base de datos" (archivo JSON plano, sin dependencias nativas) ----------
const LEADERBOARD_PATH = path.join(__dirname, 'leaderboard.json');

function loadScores() {
  let scores;
  try {
    const raw = fs.readFileSync(LEADERBOARD_PATH, 'utf-8');
    scores = JSON.parse(raw);
  } catch (e) {
    return []; // el archivo aún no existe o está vacío/corrupto
  }

  // Migración: registros guardados antes de tener "id" (versión anterior)
  // no se pueden borrar individualmente. Les asignamos uno y lo persistimos.
  let needsMigration = false;
  scores = scores.map(s => {
    if (!s.id) {
      needsMigration = true;
      return { ...s, id: generateId() };
    }
    return s;
  });
  if (needsMigration) saveScores(scores);

  return scores;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function saveScores(scores) {
  try {
    fs.writeFileSync(LEADERBOARD_PATH, JSON.stringify(scores, null, 2));
    return true;
  } catch (e) {
    console.error('⚠️  No se pudo guardar leaderboard.json:', e.message);
    return false;
  }
}

// ---------- Express ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/leaderboard', (req, res) => {
  const top = loadScores()
    .slice()
    .sort((a, b) => b.level - a.level || new Date(a.created_at) - new Date(b.created_at))
    .slice(0, 20);
  res.json(top);
});

app.post('/api/score', (req, res) => {
  const { name, level } = req.body;
  if (!name || typeof level !== 'number') {
    return res.status(400).json({ error: 'name (string) y level (number) son requeridos' });
  }
  const cleanName = String(name).trim().slice(0, 20) || 'Anónimo';
  const scores = loadScores();
  const entry = { id: generateId(), name: cleanName, level, created_at: new Date().toISOString() };
  scores.push(entry);
  const saved = saveScores(scores);
  if (!saved) return res.status(500).json({ error: 'no se pudo guardar el puntaje' });
  res.json({ ok: true, score: entry });
});

app.delete('/api/score/:id', (req, res) => {
  const { id } = req.params;
  const scores = loadScores();
  const filtered = scores.filter(s => s.id !== id);
  if (filtered.length === scores.length) {
    return res.status(404).json({ error: 'no se encontró ese puntaje' });
  }
  const saved = saveScores(filtered);
  if (!saved) return res.status(500).json({ error: 'no se pudo actualizar el leaderboard' });
  res.json({ ok: true });
});

const server = http.createServer(app);

// ---------- WebSocket (navegador <-> server) ----------
const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'status', connected: serialConnected }));

  ws.on('message', (raw) => {
    // El navegador puede pedir que se prenda un LED físico como feedback
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'led' && serialConnected && serialPort) {
        try {
          serialPort.write(`LED:${msg.index}:${msg.on ? 'ON' : 'OFF'}\n`);
        } catch (e) {
          // el Arduino se pudo haber desconectado justo en este instante; no bloquea el juego
        }
      }
    } catch (e) {
      // ignorar mensajes mal formados
    }
  });

  ws.on('close', () => clients.delete(ws));
});

function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

// ---------- Serial (Arduino <-> server) ----------
let serialPort = null;
let serialConnected = false;

async function setupSerial() {
  let portPath = SERIAL_PORT_PATH;

  if (portPath === 'AUTO') {
    const ports = await SerialPort.list();
    const candidate = ports.find(p =>
      /arduino/i.test(p.manufacturer || '') || /usb|acm/i.test(p.path || '')
    );
    if (!candidate) {
      console.warn('⚠️  No se detectó Arduino automáticamente. Puertos disponibles:');
      ports.forEach(p => console.warn('   -', p.path, p.manufacturer || ''));
      console.warn('Edita SERIAL_PORT_PATH en server.js con el puerto correcto.');
      return;
    }
    portPath = candidate.path;
  }

  try {
    serialPort = new SerialPort({ path: portPath, baudRate: SERIAL_BAUD_RATE });
    const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

    serialPort.on('open', () => {
      serialConnected = true;
      console.log(`✅ Conectado al Arduino en ${portPath}`);
      broadcast({ type: 'status', connected: true });
    });

    serialPort.on('error', (err) => {
      console.error('Error de serial:', err.message);
      serialConnected = false;
    });

    serialPort.on('close', () => {
      serialConnected = false;
      broadcast({ type: 'status', connected: false });
    });

    parser.on('data', (line) => {
      line = line.trim();
      if (line.startsWith('BTN:')) {
        const index = parseInt(line.split(':')[1], 10);
        if (!Number.isNaN(index)) {
          broadcast({ type: 'button', index });
        }
      }
    });
  } catch (err) {
    console.error('No se pudo abrir el puerto serial:', err.message);
  }
}

setupSerial();

server.listen(HTTP_PORT, () => {
  console.log(`🎮 Servidor corriendo en http://localhost:${HTTP_PORT}`);
});
