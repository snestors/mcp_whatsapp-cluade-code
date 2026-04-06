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

## Notas Raspberry Pi

- Primera carga tarda ~90 segundos (normal)
- Usa ~300MB RAM estabilizado
- Si da "Requesting main frame too early", el retry automatico lo maneja
- Minimo 2GB RAM libre recomendado

## Estructura

```
bridge.cjs              # Servicio principal (systemd)
index.js                # MCP para Claude Code (liviano)
config.json             # Tu configuracion
system-prompt.md        # Contexto para el bot
notify.sh               # Enviar mensajes desde bash
examples/
  cron-download-check.sh  # Ejemplo de cron
```

## Licencia

MIT
