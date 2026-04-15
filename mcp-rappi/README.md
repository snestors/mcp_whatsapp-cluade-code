# Rappi MCP Server

MCP (Model Context Protocol) server that connects Claude Code with the Rappi delivery API. Allows searching restaurants, viewing menus, and checking order history through natural language.

## Tools

| Tool | Description |
|------|-------------|
| `rappi_search(query, lat, lng)` | Search restaurants and products. Returns store IDs, names, ETAs, and sample products. |
| `rappi_get_menu(store_id, lat, lng)` | Get the full menu for a restaurant (use store_id from search results). |
| `rappi_get_orders()` | View recent order history. |
| `rappi_check_token()` | Verify if the current Rappi token is valid. |

**Coordinates default to Lima, Peru** (-12.0464, -77.0428). Pass custom `lat`/`lng` for other locations.

## Installation

```bash
cd /home/nestor/mcp-rappi
pip install -r requirements.txt
```

## Configuration

Add to `~/.claude.json` under `mcpServers`:

```json
{
  "rappi": {
    "type": "stdio",
    "command": "python3",
    "args": ["/home/nestor/mcp-rappi/rappi_mcp.py"]
  }
}
```

## Authentication

The server reads the token from `/home/nestor/.rappi_token.json` (field `bearer_token`).

When the token expires, any tool call will return an error message. Re-authenticate by running:

```bash
python3 /home/nestor/rappi-login.py
```

This opens a Playwright browser, logs in to Rappi, and saves a fresh token.

## Usage Examples

Once configured, use naturally in Claude Code:

- "Busca pizzerias cerca" → calls `rappi_search("pizza")`
- "Muéstrame el menú de Papa Johns" → calls `rappi_search("papa johns")` then `rappi_get_menu(store_id)`
- "Cuáles fueron mis últimos pedidos?" → calls `rappi_get_orders()`
- "Mi token de Rappi sigue activo?" → calls `rappi_check_token()`
