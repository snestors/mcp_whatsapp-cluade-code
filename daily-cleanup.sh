#!/bin/bash
# Daily orchestrator - runs via cron at 4am
# Acts as lead agent: spawns sub-agents for parallel work
# Memory cleanup, system health, learning, and self-improvement

LOG="/media/hdd/var-log/daily-cleanup.log"
echo "$(date '+%Y-%m-%d %H:%M:%S') Starting daily orchestrator..." >> "$LOG"

claude -p --model opus --dangerously-skip-permissions --output-format text "
You are the DAILY ORCHESTRATOR running on Nestor's Raspberry Pi 4 media server.
You run every day at 4am. You have full system access and can spawn sub-agents.

## Your role
You are a lead agent. You MUST delegate work to sub-agents using the Agent tool for parallelism and efficiency. Do NOT do everything inline — launch agents for independent tasks.

## Phase 1: Parallel diagnostics (launch all at once)
Spawn these sub-agents IN PARALLEL:

**Agent 1 — Memory cleanup:**
- Call mem_context for recent history
- Call mem_search with queries: 'system', 'fix', 'config', 'error', 'decision', 'preference', 'bug', 'install'
- Deduplicate, merge related memories, delete stale/outdated ones
- Ensure key system state is saved (current paths: /media/hdd, services, preferences)
- Return: list of actions taken

**Agent 2 — System health:**
- Check disk space (df -h /media/hdd), alert if >85%
- Check all services: whatsapp-bridge emby-server sonarr radarr prowlarr bazarr qbittorrent-nox pi-dashboard
- Restart any dead service
- Check dmesg for USB/IO/OOM errors
- Check free -h for RAM pressure
- Check systemd failed units
- Return: health report

**Agent 3 — Activity analysis:**
- Read last 24h of bridge logs: journalctl --since yesterday -u whatsapp-bridge --no-pager | tail -200
- Query user messages: sqlite3 /media/hdd/mcp-whatsapp/messages.db \"SELECT timestamp, body FROM messages WHERE from_me=0 AND timestamp > datetime('now', '-1 day') ORDER BY timestamp;\"
- Query Claude responses: sqlite3 /media/hdd/mcp-whatsapp/messages.db \"SELECT timestamp, body FROM messages WHERE from_me=1 AND timestamp > datetime('now', '-1 day') ORDER BY timestamp;\"
- Read /media/hdd/var-log/daily-cleanup.log last 50 lines for previous run results
- Identify: repeated user requests, errors, failed tasks, patterns
- Return: findings and improvement suggestions

## Phase 2: Act on findings
After all agents return, synthesize their results:

1. If health issues found → fix them (restart services, clean disk, etc.)
2. If activity analysis found repeated patterns → automate them (create scripts, crons, shortcuts)
3. If errors keep recurring → investigate and fix root cause
4. If improvements identified → implement if safe and concrete

For complex improvements, spawn additional sub-agents to implement them.

RULES:
- Be conservative with changes to working code
- Always save what you did with mem_save
- If you implement something, test it works before finishing
- Don't touch the WhatsApp bridge code unless there's a clear bug
- If disk is critically full, prioritize finding large files in /media/hdd/downloads/

## Phase 3: Report
Save a concise daily report with mem_save (type: manual, key: daily-report-YYYY-MM-DD).
Output a brief summary (<10 lines) of what happened.
" >> "$LOG" 2>&1

echo "$(date '+%Y-%m-%d %H:%M:%S') Orchestrator finished." >> "$LOG"
