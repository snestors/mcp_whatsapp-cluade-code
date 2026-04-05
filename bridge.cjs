#!/usr/bin/env node

/**
 * WhatsApp Bridge Service
 * - Runs whatsapp-web.js + Chromium permanently as a systemd service
 * - Exposes HTTP API for sending/receiving messages
 * - Stores all messages in SQLite
 * - Only processes messages from authorized numbers
 * - QR code web page for initial pairing
 */

const { Client, LocalAuth } = require("whatsapp-web.js");
const express = require("express");
const Database = require("better-sqlite3");
const { readFileSync } = require("fs");
const { resolve } = require("path");

// --- Config ---
const CONFIG_PATH = process.env.WA_CONFIG || resolve(__dirname, "config.json");
const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));

const AUTHORIZED = new Set(config.authorized_numbers || []);
const QR_PORT = config.qr_port || 3456;
const API_PORT = config.api_port || 3457;
const CHROMIUM_PATH = config.chromium_path || "/usr/bin/chromium";
const AUTH_PATH = config.auth_path || "/home/nestor/.wwebjs_auth";
const DB_PATH = config.db_path || "/media/usb/mcp-whatsapp/messages.db";

// --- Database ---
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    jid TEXT NOT NULL,
    phone TEXT,
    name TEXT,
    body TEXT,
    timestamp TEXT NOT NULL,
    from_me INTEGER DEFAULT 0,
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(is_read);
  CREATE INDEX IF NOT EXISTS idx_messages_jid ON messages(jid);
`);

const stmtInsert = db.prepare(
  "INSERT INTO messages (jid, phone, name, body, timestamp, from_me, is_read) VALUES (?, ?, ?, ?, ?, ?, ?)"
);
const stmtUnread = db.prepare(
  "SELECT * FROM messages WHERE is_read = 0 AND from_me = 0 ORDER BY id ASC"
);
const stmtMarkRead = db.prepare("UPDATE messages SET is_read = 1 WHERE id = ?");
const stmtMarkAllRead = db.prepare("UPDATE messages SET is_read = 1 WHERE is_read = 0");
const stmtRecent = db.prepare(
  "SELECT * FROM messages ORDER BY id DESC LIMIT ?"
);

function extractPhone(jid) {
  if (!jid) return null;
  // Handle both @c.us and @lid formats
  return jid.split("@")[0];
}

function isAuthorized(jid) {
  if (AUTHORIZED.size === 0) return true; // no whitelist = allow all
  const phone = extractPhone(jid);
  for (const num of AUTHORIZED) {
    if (jid.includes(num) || (phone && phone.includes(num))) return true;
  }
  return false;
}

// --- WhatsApp Client ---
let waClient = null;
let isReady = false;
let currentQR = null;
let jidMap = {}; // maps phone numbers to JIDs for sending

console.log("[bridge] Starting WhatsApp client...");

waClient = new Client({
  authStrategy: new LocalAuth({ dataPath: AUTH_PATH }),
  puppeteer: {
    headless: true,
    executablePath: CHROMIUM_PATH,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
      "--no-zygote",
    ],
  },
});

waClient.on("qr", (qr) => {
  currentQR = qr;
  console.log("[bridge] QR code received - scan at http://<ip>:" + QR_PORT);
});

waClient.on("ready", () => {
  isReady = true;
  currentQR = null;
  console.log("[bridge] WhatsApp connected!");
});

waClient.on("authenticated", () => {
  console.log("[bridge] Authenticated.");
});

waClient.on("auth_failure", (msg) => {
  console.error("[bridge] Auth failure:", msg);
});

waClient.on("disconnected", (reason) => {
  isReady = false;
  console.log("[bridge] Disconnected:", reason);
  // Auto-reconnect
  setTimeout(() => {
    console.log("[bridge] Reconnecting...");
    waClient.initialize().catch((e) => console.error("[bridge] Reconnect error:", e.message));
  }, 5000);
});

waClient.on("message", (msg) => {
  const jid = msg.from;
  const phone = extractPhone(jid);
  const name = msg._data.notifyName || phone || jid;
  const body = msg.body || "";
  const timestamp = new Date(msg.timestamp * 1000).toISOString();
  const authorized = isAuthorized(jid);

  // Store JID mapping
  if (phone) jidMap[phone] = jid;

  // Always store in DB
  stmtInsert.run(jid, phone, name, body, timestamp, 0, authorized ? 0 : 1);

  if (authorized) {
    console.log(`[bridge] Message from ${name}: ${body.substring(0, 80)}`);
  } else {
    console.log(`[bridge] Ignored message from unauthorized ${phone}`);
  }
});

// --- QR Web Server ---
const qrApp = express();

qrApp.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (isReady) {
    res.send(`<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#25D366">
      <h1 style="color:white">WhatsApp Conectado</h1></body></html>`);
  } else if (currentQR) {
    res.send(`<html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta http-equiv="refresh" content="15">
      <title>WhatsApp QR</title></head>
      <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#111;color:#eee;margin:0">
      <h2>Escanea con WhatsApp</h2>
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}" style="border-radius:12px"/>
      <p style="color:#888;margin-top:16px">Se actualiza cada 15s</p>
      </body></html>`);
  } else {
    res.send(`<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#111;color:#eee">
      <div style="text-align:center"><h2>Esperando QR...</h2><p>Chromium cargando...</p>
      <meta http-equiv="refresh" content="10"></div></body></html>`);
  }
});

qrApp.listen(QR_PORT, "0.0.0.0", () => {
  console.log(`[bridge] QR web server on http://0.0.0.0:${QR_PORT}`);
});

// --- API Server ---
const api = express();
api.use(express.json());

api.get("/status", (req, res) => {
  res.json({ connected: isReady, qr_available: !!currentQR });
});

api.get("/messages/unread", (req, res) => {
  const msgs = stmtUnread.all();
  res.json(msgs);
});

api.get("/messages/recent", (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const msgs = stmtRecent.all(Math.min(limit, 100));
  res.json(msgs.reverse());
});

api.post("/messages/:id/read", (req, res) => {
  stmtMarkRead.run(req.params.id);
  res.json({ ok: true });
});

api.post("/messages/read-all", (req, res) => {
  const result = stmtMarkAllRead.run();
  res.json({ ok: true, marked: result.changes });
});

api.post("/send", async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: "phone and message required" });
  }
  if (!isReady) {
    return res.status(503).json({ error: "WhatsApp not connected" });
  }
  try {
    // Try to find the JID from the map, or construct it
    let chatId = jidMap[phone] || `${phone}@c.us`;
    await waClient.sendMessage(chatId, message);

    // Store sent message in DB
    stmtInsert.run(chatId, phone, "me", message, new Date().toISOString(), 1, 1);

    res.json({ ok: true, sent_to: phone });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

api.listen(API_PORT, "127.0.0.1", () => {
  console.log(`[bridge] API server on http://127.0.0.1:${API_PORT}`);
});

// --- Start WhatsApp with retry ---
async function startWhatsApp(attempt = 1) {
  try {
    console.log(`[bridge] Initializing WhatsApp (attempt ${attempt})...`);
    await waClient.initialize();
  } catch (e) {
    console.error(`[bridge] Init error (attempt ${attempt}):`, e.message);
    if (attempt < 5) {
      const delay = attempt * 10;
      console.log(`[bridge] Retrying in ${delay}s...`);
      setTimeout(() => startWhatsApp(attempt + 1), delay * 1000);
    } else {
      console.error("[bridge] Failed after 5 attempts. Service will restart via systemd.");
      process.exit(1);
    }
  }
}
startWhatsApp();

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("[bridge] Shutting down...");
  try {
    await waClient.destroy();
  } catch (e) {}
  db.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[bridge] Interrupted.");
  try {
    await waClient.destroy();
  } catch (e) {}
  db.close();
  process.exit(0);
});
