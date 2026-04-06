#!/usr/bin/env node

/**
 * WhatsApp MCP Server (lightweight)
 * Connects to the WhatsApp Bridge Service via HTTP.
 * Starts instantly — no Puppeteer/Chromium loading.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = process.env.WA_API_URL || "http://127.0.0.1:3457";

async function api(path, options = {}) {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  return res.json();
}

const server = new McpServer({ name: "whatsapp", version: "2.1.0" });

server.tool("send_message", "Send a WhatsApp message to a phone number", {
  phone: z.string().describe("Phone with country code e.g. 51922743968"),
  message: z.string().describe("Message text"),
}, async ({ phone, message }) => {
  try {
    const result = await api("/send", {
      method: "POST",
      body: JSON.stringify({ phone, message }),
    });
    if (result.error) return { content: [{ type: "text", text: `Error: ${result.error}` }], isError: true };
    return { content: [{ type: "text", text: `Sent to ${phone}` }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Bridge error: ${err.message}` }], isError: true };
  }
});

server.tool("check_new_messages", "Check for new unread WhatsApp messages", {}, async () => {
  try {
    const msgs = await api("/messages/unread");
    if (!msgs.length) return { content: [{ type: "text", text: "No new messages." }] };
    const formatted = msgs.map(m => `[id:${m.id}] [${m.jid}] ${m.name}: ${m.body}`).join("\n");
    return { content: [{ type: "text", text: formatted }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Bridge error: ${err.message}` }], isError: true };
  }
});

server.tool("mark_read", "Mark a WhatsApp message as read", {
  id: z.number().describe("Message ID to mark as read"),
}, async ({ id }) => {
  try {
    await api(`/messages/${id}/read`, { method: "POST" });
    return { content: [{ type: "text", text: `Message ${id} marked as read.` }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

server.tool("mark_all_read", "Mark all WhatsApp messages as read", {}, async () => {
  try {
    const result = await api("/messages/read-all", { method: "POST" });
    return { content: [{ type: "text", text: `Marked ${result.marked} messages as read.` }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

server.tool("get_messages", "Get recent WhatsApp messages", {
  limit: z.number().optional().default(10).describe("Number of messages"),
}, async ({ limit }) => {
  try {
    const msgs = await api(`/messages/recent?limit=${limit}`);
    if (!msgs.length) return { content: [{ type: "text", text: "No messages." }] };
    const formatted = msgs.map(m => {
      const dir = m.from_me ? "→" : "←";
      const read = m.is_read ? "" : " [UNREAD]";
      return `[${m.timestamp}] ${dir} ${m.name}: ${m.body}${read}`;
    }).join("\n");
    return { content: [{ type: "text", text: formatted }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Bridge error: ${err.message}` }], isError: true };
  }
});

server.tool("get_status", "Check WhatsApp connection status", {}, async () => {
  try {
    const status = await api("/status");
    return { content: [{ type: "text", text: `WhatsApp: ${status.connected ? "Connected" : "Disconnected"}${status.qr_available ? " (QR available)" : ""}` }] };
  } catch (err) {
    return { content: [{ type: "text", text: "WhatsApp Bridge not running." }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
