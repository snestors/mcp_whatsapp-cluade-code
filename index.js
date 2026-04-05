#!/usr/bin/env node

import { createRequire } from "module";
import { appendFileSync } from "fs";
import { createServer } from "http";
import { homedir } from "os";
import { join } from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const require = createRequire(import.meta.url);
const { Client, LocalAuth } = require("whatsapp-web.js");

const AUTH_PATH = process.env.WHATSAPP_AUTH_PATH || join(homedir(), ".wwebjs_auth");
const LOG_FILE = process.env.WHATSAPP_LOG_FILE || "/tmp/whatsapp-mcp.log";
const QR_PORT = parseInt(process.env.WHATSAPP_QR_PORT || "3456", 10);
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || "/usr/bin/chromium";

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  appendFileSync(LOG_FILE, line);
}

let client = null;
let isReady = false;
let currentQR = null;
const recentMessages = [];
let lastProcessedIndex = 0;

// --- QR Web Server ---
const qrServer = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  if (isReady) {
    res.end(`<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#25D366">
      <h1 style="color:white">WhatsApp Conectado</h1></body></html>`);
  } else if (currentQR) {
    res.end(`<html><head>
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta http-equiv="refresh" content="15">
      <title>WhatsApp QR</title></head>
      <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#111;color:#eee;margin:0">
      <h2>Escanea con WhatsApp</h2>
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(currentQR)}" style="border-radius:12px"/>
      <p style="color:#888;margin-top:16px">Se actualiza cada 15s</p>
      </body></html>`);
  } else {
    res.end(`<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#111;color:#eee">
      <div style="text-align:center"><h2>Esperando QR...</h2><p>Chromium cargando...</p>
      <meta http-equiv="refresh" content="10"></div></body></html>`);
  }
});
qrServer.listen(QR_PORT, "0.0.0.0", () => {
  log(`QR web server on http://0.0.0.0:${QR_PORT}`);
});

// --- WhatsApp Client ---
log("Initializing WhatsApp client...");

client = new Client({
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

client.on("qr", (qr) => {
  currentQR = qr;
  log("QR code received - scan at http://<host>:" + QR_PORT);
});

client.on("ready", () => {
  isReady = true;
  currentQR = null;
  log("WhatsApp connected!");
});

client.on("authenticated", () => {
  log("WhatsApp authenticated.");
});

client.on("auth_failure", (msg) => {
  log(`Auth failure: ${msg}`);
});

client.on("disconnected", (reason) => {
  isReady = false;
  log(`Disconnected: ${reason}`);
});

client.on("message", (msg) => {
  recentMessages.push({
    from: msg.from,
    body: msg.body,
    timestamp: new Date(msg.timestamp * 1000).toISOString(),
    fromMe: msg.fromMe,
    name: msg._data.notifyName || msg.from,
  });
  if (recentMessages.length > 50) recentMessages.shift();
});

// --- MCP Server ---
const server = new McpServer({ name: "whatsapp", version: "1.0.0" });

server.tool("send_message", "Send a WhatsApp message", {
  phone: z.string().describe("Phone with country code e.g. 584121234567"),
  message: z.string().describe("Message text"),
}, async ({ phone, message }) => {
  if (!isReady) return { content: [{ type: "text", text: "WhatsApp not connected." }], isError: true };
  try {
    const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
    await client.sendMessage(chatId, message);
    return { content: [{ type: "text", text: `Sent to ${phone}` }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

server.tool("get_messages", "Get recent WhatsApp messages", {
  limit: z.number().optional().default(10),
}, async ({ limit }) => {
  const msgs = recentMessages.slice(-limit);
  if (!msgs.length) return { content: [{ type: "text", text: "No messages." }] };
  return { content: [{ type: "text", text: msgs.map(m => `[${m.timestamp}] ${m.name}: ${m.body}`).join("\n") }] };
});

server.tool("get_status", "Check WhatsApp status", {}, async () => {
  return { content: [{ type: "text", text: `WhatsApp: ${isReady ? "Connected" : "Disconnected"}` }] };
});

server.tool("check_new_messages", "Check for new unprocessed WhatsApp messages", {}, async () => {
  const newMsgs = recentMessages.slice(lastProcessedIndex).filter(m => !m.fromMe);
  lastProcessedIndex = recentMessages.length;
  if (!newMsgs.length) return { content: [{ type: "text", text: "No new messages." }] };
  const formatted = newMsgs.map(m => `[${m.from}] ${m.name}: ${m.body}`).join("\n");
  return { content: [{ type: "text", text: formatted }] };
});

log("Starting WhatsApp...");
client.initialize().catch(e => log(`Init error: ${e.message}`));

const transport = new StdioServerTransport();
await server.connect(transport);
log("MCP running.");
