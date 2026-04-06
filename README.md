# MCP WhatsApp para Claude Code

Servidor MCP de WhatsApp para [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Permite enviar y recibir mensajes de WhatsApp desde Claude, con auto-respuesta inteligente usando Claude CLI.

## Que es

Dos componentes:

- **Bridge** (`bridge.cjs`): Servicio systemd que corre whatsapp-web.js + Chromium permanentemente. Expone una API HTTP, almacena mensajes en SQLite, y opcionalmente responde automaticamente usando Claude CLI con sesiones persistentes (`--resume`).
- **MCP** (`index.js`): Servidor MCP liviano que se conecta al Bridge via HTTP. Inicia instantaneamente (sin Chromium). Es lo que Claude Code usa como herramienta.

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
                                    +----v----+                     (via MCP o API)
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

## Caracteristicas

- Enviar y recibir mensajes de WhatsApp desde Claude Code
- Auto-respuesta con Claude CLI (`--resume` para contexto persistente entre mensajes)
- Whitelist de numeros autorizados
- SQLite para historial de mensajes (read/unread tracking)
- Servidor web QR para vincular WhatsApp (sin terminal)
- Typing indicator mientras Claude procesa la respuesta
- Recepcion de fotos, archivos y audio (guardados en disco)
- Contexto de mensajes citados (replies) incluido automaticamente
- Cola de mensajes (procesa uno a la vez, sin perder ninguno)
- Script `notify.sh` para enviar mensajes desde cron/scripts
- `/reset` desde WhatsApp para iniciar conversacion nueva
- Reconexion automatica si WhatsApp se desconecta
- Retry automatico en inicializacion (hasta 5 intentos)

## Requisitos

- **Node.js 18+**
- **Chromium** o Google Chrome instalado
- **Claude Code CLI** instalado y autenticado (para auto-respuesta)
- Un **numero de WhatsApp secundario** (se vincula como dispositivo)

## Instalacion paso a paso

### 1. Clonar el repositorio

```bash
git clone https://github.com/snestors/mcp_whatsapp-cluade-code.git
cd mcp_whatsapp-cluade-code
```

### 2. Instalar dependencias

```bash
PUPPETEER_SKIP_DOWNLOAD=true npm install
```

> `PUPPETEER_SKIP_DOWNLOAD=true` evita descargar Chromium (usamos el del sistema).

### 3. Configurar

```bash
cp config.example.json config.json
nano config.json  # Editar con tu numero y rutas
```

```bash
cp system-prompt.example.md system-prompt.md
nano system-prompt.md  # Personalizar con tu contexto
```

### 4. Crear servicio systemd

Crear el archivo `/etc/systemd/system/whatsapp-bridge.service`:

```ini
[Unit]
Description=WhatsApp Bridge for Claude Code
After=network.target

[Service]
Type=simple
User=TU_USUARIO
WorkingDirectory=/ruta/a/mcp_whatsapp-cluade-code
ExecStart=/usr/bin/node bridge.cjs
Restart=always
RestartSec=10
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

Reemplazar `TU_USUARIO` y `/ruta/a/mcp_whatsapp-cluade-code` con tus valores.

```bash
sudo systemctl daemon-reload
sudo systemctl enable whatsapp-bridge
sudo systemctl start whatsapp-bridge
```

### 5. Escanear QR

Abrir en el navegador:

```
http://<IP-DE-TU-MAQUINA>:3456
```

Escanear el codigo QR con WhatsApp (Ajustes > Dispositivos vinculados > Vincular dispositivo).

### 6. Configurar MCP en Claude Code

Agregar a `~/.claude.json` (configuracion global):

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": ["/ruta/a/mcp_whatsapp-cluade-code/index.js"]
    }
  }
}
```

Si el Bridge corre en otra IP o puerto, agregar variable de entorno:

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": ["/ruta/a/mcp_whatsapp-cluade-code/index.js"],
      "env": {
        "WA_API_URL": "http://192.168.1.100:3457"
      }
    }
  }
}
```

### 7. Reiniciar Claude Code

Cerrar y abrir Claude Code para que cargue el nuevo MCP.

## Configuracion

### config.json

| Campo | Tipo | Default | Descripcion |
|---|---|---|---|
| `authorized_numbers` | `string[]` | `[]` | Numeros autorizados (con codigo de pais, sin `+`). Si esta vacio, acepta todos. |
| `auto_respond` | `boolean` | `true` | Responder automaticamente via Claude CLI |
| `typing_timeout` | `number` | `120` | Segundos maximo mostrando "escribiendo..." |
| `qr_port` | `number` | `3456` | Puerto del servidor web QR |
| `api_port` | `number` | `3457` | Puerto de la API HTTP interna |
| `chromium_path` | `string` | `/usr/bin/chromium` | Ruta al ejecutable de Chromium/Chrome |
| `auth_path` | `string` | `~/.wwebjs_auth` | Directorio para datos de sesion de WhatsApp |
| `db_path` | `string` | `./messages.db` | Ruta a la base de datos SQLite |

### Variables de entorno

| Variable | Descripcion |
|---|---|
| `WA_CONFIG` | Ruta alternativa al archivo config.json |
| `WA_API_URL` | URL del Bridge API (para el MCP, default `http://127.0.0.1:3457`) |

## Uso

### Desde Claude Code

Una vez configurado el MCP, Claude tiene estas herramientas disponibles:

- **`send_message`** - Enviar un mensaje de WhatsApp
- **`check_new_messages`** - Ver mensajes nuevos sin leer
- **`get_messages`** - Obtener los ultimos N mensajes
- **`mark_read`** - Marcar un mensaje como leido
- **`mark_all_read`** - Marcar todos como leidos
- **`get_status`** - Estado de la conexion

Ejemplos de uso natural:
- "Enviale a 584121234567 que llego tarde"
- "Tengo mensajes nuevos de WhatsApp?"
- "Muestrame los ultimos 10 mensajes"

### Desde WhatsApp

Si `auto_respond` esta activado, cualquier mensaje de un numero autorizado recibe respuesta automatica de Claude.

- Escribir normalmente y esperar respuesta (aparece "escribiendo...")
- Enviar `/reset` para iniciar una conversacion nueva (borra el contexto de sesion)
- Enviar fotos/archivos (se guardan y Claude recibe la descripcion)
- Responder a mensajes (el contexto del mensaje citado se incluye)

### Notificaciones desde scripts/cron

Usar `notify.sh` para enviar mensajes desde cualquier script:

```bash
./notify.sh 584121234567 "La descarga termino!"
```

Ver `examples/cron-download-check.sh` para un ejemplo de cron que notifica cuando una descarga termina.

## Prompt de instalacion automatica

Puedes pegar este texto en Claude Code para que se instale solo:

```
Instala el MCP de WhatsApp para Claude Code desde https://github.com/snestors/mcp_whatsapp-cluade-code.
Clona el repo, instala dependencias con PUPPETEER_SKIP_DOWNLOAD=true, crea config.json basado en
config.example.json (preguntame mi numero de telefono y la ruta de Chromium), crea system-prompt.md
basado en el example, configura el servicio systemd whatsapp-bridge, inicialo, y configura el MCP en
mi ~/.claude.json. Al final dime que abra http://<mi-ip>:3456 para escanear el QR.
```

## Notas para Raspberry Pi

- **Carga inicial lenta**: La primera inicializacion de Chromium + whatsapp-web.js tarda **~90 segundos** en una RPi 4. Es normal.
- **Argumentos de Chromium**: Los flags `--no-sandbox`, `--single-process`, `--no-zygote`, `--disable-dev-shm-usage` ya estan configurados para funcionar en ARM/bajo recursos.
- **Error "Requesting main frame too early"**: El Bridge tiene retry automatico (hasta 5 intentos con backoff). Si persiste, systemd reinicia el servicio.
- Se recomienda tener al menos **2 GB de RAM libre**.
- El Bridge usa ~200-400MB de RAM una vez estabilizado.

## Estructura del proyecto

```
mcp_whatsapp-cluade-code/
  bridge.cjs              # Servicio Bridge (systemd) - Chromium + WhatsApp + API + auto-respuesta
  index.js                # Servidor MCP (liviano) - lo usa Claude Code
  config.example.json     # Configuracion de ejemplo
  system-prompt.example.md # System prompt de ejemplo para auto-respuesta
  notify.sh               # Script para enviar mensajes desde bash/cron
  package.json            # Dependencias Node.js
  examples/
    cron-download-check.sh # Ejemplo de cron para notificaciones
```

## Licencia

MIT
