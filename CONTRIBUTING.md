# Contributing

PRs and issues welcome! This project runs on a Raspberry Pi 4, so keep performance and resource usage in mind.

## How to contribute

1. Fork the repo
2. Create a branch: `git checkout -b my-fix`
3. Make your changes and test them
4. Commit with a descriptive message
5. Open a Pull Request

## Development setup

```bash
git clone https://github.com/snestors/mcp_whatsapp-cluade-code.git
cd mcp_whatsapp-cluade-code
PUPPETEER_SKIP_DOWNLOAD=true npm install
cp config.example.json config.json
cp system-prompt.example.md system-prompt.md
# Edit config.json with your settings
```

## Project structure

| File | Purpose |
|---|---|
| `bridge.cjs` | Main service (systemd) - WhatsApp client, HTTP API, auto-response via Claude CLI |
| `index.js` | MCP server for Claude Code - lightweight HTTP client to the bridge |
| `index.cjs` | Legacy MCP server (Baileys-based, kept for reference) |
| `daily-cleanup.sh` | Daily orchestrator (cron 4am) - health checks, memory cleanup, activity analysis |
| `cron-f1-check.sh` | Example cron script for download notifications |
| `notify.sh` | Send WhatsApp messages from the command line |
| `emby-guard.sh` | Pauses downloads when Emby is streaming |
| `calendar-notify.py` | Google Calendar event notifications via WhatsApp |

## Guidelines

- **Keep it lightweight** - this runs on a Pi 4 with 4GB RAM alongside Emby, Sonarr, Radarr, etc.
- **Don't break the bridge** - `bridge.cjs` is the critical 24/7 service. Test changes thoroughly.
- **No personal data** - never commit `config.json`, `system-prompt.md`, or credentials.
- **Spanish is fine** - the project and its users speak Spanish. Code comments and docs can be in either language.

## Reporting issues

Open an issue describing:
- The problem
- Your setup (OS, Node version, device)
- Relevant logs (`journalctl -u whatsapp-bridge --since "1 hour ago"`)
