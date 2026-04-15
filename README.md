# MCP WhatsApp para Claude Code

Bot de WhatsApp que responde con Claude. Funciona como servicio 24/7 — no necesitas tener Claude Code abierto.

## Como funciona

Le escribes por WhatsApp y Claude te responde. Mantiene contexto entre mensajes, puede ejecutar comandos en tu servidor, enviar archivos, y recibir fotos.

```
Tu (WhatsApp) → Bridge (servicio) → Claude CLI → respuesta por WhatsApp
```

## Instalacion

Pega esto en Claude Code:

```
Instala el MCP de WhatsApp para Claude Code:

1. Clona https://github.com/snestors/mcp_whatsapp-cluade-code en una carpeta permanente
2. Instala deps: PUPPETEER_SKIP_DOWNLOAD=true npm install
3. Crea config.json desde config.example.json. Preguntame:
   - Mi numero de WhatsApp (con codigo de pais, sin +)
   - Donde tengo Chromium (busca con "which chromium" o "which google-chrome")
4. Crea system-prompt.md desde system-prompt.example.md. Preguntame que contexto quiero darle al bot.
5. Crea el servicio systemd whatsapp-bridge apuntando a bridge.cjs
6. Habilita e inicia el servicio
7. Agrega el MCP whatsapp a mi ~/.claude.json apuntando a index.js
8. Dime que abra http://<mi-ip>:<qr_port> para escanear el QR con WhatsApp
```

Eso es todo. Claude Code hace el resto.

## Requisitos

- Node.js 18+
- Chromium o Chrome
- Claude Code CLI instalado y autenticado

## Que puede hacer

**Desde WhatsApp:**
- Escribirle y recibe respuesta (con "escribiendo..." mientras piensa)
- Enviar fotos y archivos
- Responder a mensajes (incluye el contexto)
- `/reset` para nueva conversacion

**Desde Claude Code (tools MCP):**
- `send_message` — enviar mensaje
- `check_new_messages` — ver mensajes nuevos
- `get_messages` — historial
- `get_status` — estado de conexion
- `mark_read` / `mark_all_read` — marcar como leidos

**Desde scripts/cron:**
```bash
./notify.sh 584121234567 "La descarga termino!"
```

## Configuracion

`config.json`:

| Campo | Default | Que es |
|---|---|---|
| `authorized_numbers` | `[]` | Numeros que pueden hablarle (vacio = todos) |
| `auto_respond` | `true` | Responder automaticamente con Claude |
| `typing_timeout` | `120` | Segundos maximo mostrando "escribiendo..." |
| `qr_port` | `3456` | Puerto web para escanear QR |
| `api_port` | `3457` | Puerto API interno |
| `chromium_path` | `/usr/bin/chromium` | Ruta a Chromium/Chrome |

`system-prompt.md`: El contexto que Claude tiene sobre tu sistema. Ponle lo que quieras — que servicios corres, rutas importantes, como quieres que responda.

## Arquitectura

```
                              +-----------------------+
                              |     Claude Code       |
                              |  (usa tools MCP)      |
                              +----------+------------+
                                         |
                                    stdio (MCP)
                                         |
                              +----------v------------+
                              |   index.js (MCP)      |
                              |   Liviano, sin estado  |
                              +----------+------------+
                                         |
                                   HTTP :3457
                                         |
+-------------+           +--------------v--------------+          +-------------+
|  WhatsApp   | <-------> |     bridge.cjs (systemd)    | -------> | Claude CLI  |
|  (telefono) |  wwebjs   |  Chromium + SQLite + Express|  spawn   | --resume    |
+-------------+           |  QR server :3456            |          +------+------+
                          +-----------------------------+                 |
                                         |                          Responde por
                                         |                          send_message
                                    +----v----+                     (via MCP)
                                    | SQLite  |
                                    | messages|
                                    +---------+
```

**Flujo de auto-respuesta:**
1. Llega mensaje de WhatsApp al Bridge
2. Bridge muestra "escribiendo..." y llama a `claude -p --resume <session>`
3. Claude procesa con el system prompt y herramientas MCP disponibles
4. La respuesta se envia de vuelta por WhatsApp
5. La sesion persiste entre mensajes (contexto continuo)

## WA Watchdog (auto-reconexion)

El sistema tiene 3 capas de proteccion para mantener WhatsApp conectado 24/7:

### Capa 1: Auto-reconnect en el bridge

Cuando WhatsApp se desconecta, el bridge (`bridge.cjs`) intenta reconectar automaticamente despues de 5 segundos:

```
waClient.on("disconnected") → espera 5s → waClient.initialize()
```

### Capa 2: Retry en el arranque

Si la inicializacion falla (comun en Raspberry Pi cuando Chromium tarda en cargar), reintenta hasta 5 veces con delays incrementales (10s, 20s, 30s...):

```
startWhatsApp(attempt) → falla → espera attempt*10s → reintenta
```

Si falla 5 veces, el proceso termina con `exit(1)` para que systemd lo reinicie.

### Capa 3: Health monitor en el MCP server

El MCP server (`index.js`) ejecuta un health check cada 60 segundos contra la API del bridge. Si detecta que el bridge no responde o reporta desconexion, ejecuta:

```bash
sudo systemctl restart whatsapp-bridge.service
```

### Configuracion

El bridge corre como servicio systemd. Ejemplo de unit file:

```ini
[Unit]
Description=WhatsApp Bridge
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node /ruta/a/bridge.cjs
Restart=always
RestartSec=10
User=tu-usuario

[Install]
WantedBy=multi-user.target
```

Con `Restart=always`, systemd reinicia el servicio si crashea, complementando las 3 capas internas.

## Daily Summary System

El bot mantiene contexto entre sesiones usando un sistema de resumenes diarios embebido en el system prompt.

### Como funciona

El archivo `system-prompt.md` contiene marcadores especiales:

```markdown
<!-- DAILY_SUMMARY_START -->
## Resumen del dia (auto-generado)

- Tareas completadas hoy
- Decisiones importantes tomadas
- Contexto relevante para la proxima sesion
<!-- DAILY_SUMMARY_END -->
```

El agente actualiza automaticamente el contenido entre estos marcadores al final del dia (o cuando acumula contexto relevante). Esto permite que:

1. **Cada nueva sesion de Claude arranca con contexto** — el system prompt incluye el resumen, asi Claude sabe que paso ayer sin necesidad de leer todo el historial
2. **No gasta tokens extra** — es parte del system prompt que ya se envia, no una consulta adicional
3. **Se auto-limpia** — cada dia el resumen se reemplaza con lo nuevo, no crece indefinidamente

### Daily orchestrator (cron)

El script `daily-cleanup.sh` corre a las 4am via cron y complementa este sistema:

```
0 4 * * * /ruta/a/daily-cleanup.sh
```

Lanza sub-agentes en paralelo para:

| Agente | Funcion |
|---|---|
| Memory cleanup | Deduplica y limpia memorias de Engram |
| System health | Verifica servicios, disco, RAM, errores I/O |
| Activity analysis | Analiza mensajes del dia, errores recurrentes, patrones |

Los hallazgos se usan para auto-corregir problemas y alimentar el resumen del dia siguiente.

### Agregar los marcadores a tu system prompt

Si copias `system-prompt.example.md`, agrega al final:

```markdown
<!-- DAILY_SUMMARY_START -->
<!-- DAILY_SUMMARY_END -->
```

El bot llenara esta seccion automaticamente.

## Notas Raspberry Pi

- Primera carga tarda ~90 segundos (normal)
- Usa ~300MB RAM estabilizado
- Si da "Requesting main frame too early", el retry automatico lo maneja
- Minimo 2GB RAM libre recomendado

## Estructura

```
bridge.cjs              # Servicio principal (systemd) — WhatsApp + Claude CLI
index.js                # MCP server para Claude Code (liviano, HTTP al bridge)
index.cjs               # MCP server legacy (Baileys, referencia)
config.json             # Tu configuracion (no commitear)
system-prompt.md        # Contexto para el bot (no commitear)
daily-cleanup.sh        # Orquestador diario (cron 4am)
cron-f1-check.sh        # Ejemplo: notificar cuando descarga F1 termina
emby-guard.sh           # Pausa torrents cuando Emby transmite
calendar-notify.py      # Notificaciones de Google Calendar por WhatsApp
notify.sh               # Enviar mensajes desde bash
examples/
  cron-download-check.sh  # Ejemplo de cron generico
  transcribe.sh           # Ejemplo de transcripcion con whisper
```

## Licencia

MIT
