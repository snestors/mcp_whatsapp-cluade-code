# mcp-whatsapp

Servidor MCP (Model Context Protocol) para WhatsApp, construido con [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) y Chromium. Permite a Claude (u otro cliente MCP) enviar y recibir mensajes de WhatsApp.

## Funcionalidades

- **`send_message`** - Enviar mensajes de WhatsApp a cualquier numero
- **`get_messages`** - Obtener los mensajes recientes (ultimos 50 en memoria)
- **`get_status`** - Verificar si WhatsApp esta conectado
- **`check_new_messages`** - Consultar mensajes nuevos no procesados (solo entrantes)
- **Servidor web QR** - Pagina web local para escanear el codigo QR de autenticacion desde el navegador

## Requisitos

- Node.js 18+
- Chromium o Google Chrome instalado
- Una cuenta de WhatsApp activa

## Instalacion

```bash
# Clonar el repositorio
git clone https://github.com/snestors/mcp-whatsapp.git
cd mcp-whatsapp

# Instalar dependencias
npm install
```

## Variables de entorno

| Variable | Descripcion | Default |
|---|---|---|
| `WHATSAPP_AUTH_PATH` | Directorio para datos de sesion | `~/.wwebjs_auth` |
| `WHATSAPP_LOG_FILE` | Archivo de log | `/tmp/whatsapp-mcp.log` |
| `WHATSAPP_QR_PORT` | Puerto del servidor web QR | `3456` |
| `CHROMIUM_PATH` | Ruta al ejecutable de Chromium/Chrome | `/usr/bin/chromium` |

## Configuracion en Claude Code

Agregar al archivo `.claude.json` del proyecto o a `~/.claude.json` global:

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": ["/ruta/a/mcp-whatsapp/index.js"],
      "env": {
        "WHATSAPP_AUTH_PATH": "/home/tu-usuario/.wwebjs_auth",
        "WHATSAPP_QR_PORT": "3456"
      }
    }
  }
}
```

En macOS o si Chrome esta en otra ruta, ajustar `CHROMIUM_PATH`:

```json
{
  "env": {
    "CHROMIUM_PATH": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  }
}
```

## Primer uso

1. Iniciar el servidor (o dejar que Claude Code lo inicie al usar una herramienta MCP)
2. Abrir `http://localhost:3456` (o la IP de tu maquina) en un navegador
3. Escanear el codigo QR con WhatsApp (WhatsApp > Dispositivos vinculados > Vincular dispositivo)
4. Una vez conectado, la pagina mostrara "WhatsApp Conectado"
5. La sesion se guarda en `WHATSAPP_AUTH_PATH`, no es necesario re-escanear en futuros inicios

## Ejemplos de uso con Claude

Una vez configurado como servidor MCP, puedes pedirle a Claude cosas como:

- "Enviale un mensaje a 584121234567 diciendo que llego tarde"
- "Revisa si tengo mensajes nuevos de WhatsApp"
- "Esta conectado WhatsApp?"
- "Muestrame los ultimos 5 mensajes"

El formato de telefono es con codigo de pais sin el `+` (ejemplo: `584121234567` para Venezuela).

## Notas para Raspberry Pi

- La carga inicial de Chromium y whatsapp-web.js puede tardar **~2 minutos** en una RPi 4. Es normal.
- Los argumentos de Chromium (`--no-sandbox`, `--single-process`, `--no-zygote`, etc.) ya estan incluidos y son necesarios para que funcione en ARM/bajo recursos.
- Se recomienda tener al menos 2 GB de RAM libre.
- El log en `/tmp/whatsapp-mcp.log` es util para diagnosticar problemas de inicio.

## Licencia

MIT
