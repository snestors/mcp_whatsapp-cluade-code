#!/usr/bin/env python3
"""Rappi MCP Server — search restaurants, view menus, and check orders via Claude Code."""

import json
import logging
import httpx
from pathlib import Path
from mcp.server.fastmcp import FastMCP

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rappi-mcp")

TOKEN_PATH = Path("/home/nestor/.rappi_token.json")
BASE_URL = "https://services.rappi.pe/api"

# Default coordinates (Lima, Peru)
DEFAULT_LAT = -12.0464
DEFAULT_LNG = -77.0428

mcp = FastMCP("rappi", instructions="Rappi delivery tools for searching restaurants, viewing menus, and checking orders in Peru.")


def _load_token() -> str:
    """Load the bearer token from disk."""
    try:
        data = json.loads(TOKEN_PATH.read_text())
        return data["bearer_token"]
    except (FileNotFoundError, KeyError, json.JSONDecodeError) as e:
        raise RuntimeError(f"Cannot read token from {TOKEN_PATH}: {e}")


def _headers() -> dict:
    return {
        "Authorization": f"Bearer {_load_token()}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def _handle_401(resp: httpx.Response) -> str:
    """Return error message if 401, otherwise None."""
    if resp.status_code == 401:
        logger.warning("TOKEN_EXPIRED")
        return (
            "Token expirado. Re-autentica ejecutando: python3 /home/nestor/rappi-login.py"
        )
    return None


@mcp.tool()
def rappi_check_token() -> str:
    """Check if the Rappi token is valid by calling the is-prime endpoint."""
    try:
        resp = httpx.get(f"{BASE_URL}/ms/rappi-prime/is-prime", headers=_headers(), timeout=10)
        err = _handle_401(resp)
        if err:
            return err
        data = resp.json()
        is_prime = data.get("is_prime", False)
        return json.dumps({"valid": True, "is_prime": is_prime})
    except Exception as e:
        return f"Error checking token: {e}"


@mcp.tool()
def rappi_search(query: str, lat: float = DEFAULT_LAT, lng: float = DEFAULT_LNG) -> str:
    """Search for restaurants and products on Rappi.

    Args:
        query: What to search for (e.g. "pizza", "Papa Johns", "sushi")
        lat: Latitude (default: Lima center)
        lng: Longitude (default: Lima center)
    """
    try:
        resp = httpx.post(
            f"{BASE_URL}/pns-global-search-api/v1/unified-search",
            headers=_headers(),
            json={"query": query, "lat": lat, "lng": lng},
            timeout=15,
        )
        err = _handle_401(resp)
        if err:
            return err
        if resp.status_code != 200:
            return f"Error {resp.status_code}: {resp.text[:500]}"

        data = resp.json()
        stores = data.get("stores", [])
        results = []
        for s in stores[:10]:
            entry = {
                "store_id": s.get("store_id"),
                "store_name": s.get("store_name"),
                "eta": s.get("eta"),
                "shipping_cost": s.get("shipping_cost"),
            }
            products = s.get("products", [])
            if products:
                entry["sample_products"] = [
                    {
                        "name": p.get("name"),
                        "price": p.get("price"),
                        "description": p.get("description", ""),
                    }
                    for p in products[:5]
                ]
            results.append(entry)
        return json.dumps({"count": len(stores), "stores": results}, ensure_ascii=False)
    except Exception as e:
        return f"Error searching: {e}"


@mcp.tool()
def rappi_get_menu(store_id: int, lat: float = DEFAULT_LAT, lng: float = DEFAULT_LNG) -> str:
    """Get the full menu for a specific Rappi restaurant.

    Args:
        store_id: The restaurant's store ID (from rappi_search results)
        lat: Latitude (default: Lima center)
        lng: Longitude (default: Lima center)
    """
    # Try multiple known endpoint patterns
    endpoints = [
        f"/restaurants/menu/store/{store_id}",
        f"/restaurant-bus/stores/{store_id}/menu",
        f"/restaurants/{store_id}/menu",
    ]
    params = {"lat": lat, "lng": lng}

    for endpoint in endpoints:
        try:
            resp = httpx.get(
                f"{BASE_URL}{endpoint}",
                headers=_headers(),
                params=params,
                timeout=15,
            )
            err = _handle_401(resp)
            if err:
                return err
            if resp.status_code == 200:
                data = resp.json()
                # Try to extract categories/corridors
                categories = []
                for key in ["categories", "corridors", "data", "menu"]:
                    if key in data:
                        raw = data[key]
                        if isinstance(raw, list):
                            for cat in raw[:15]:
                                cat_entry = {
                                    "name": cat.get("name", cat.get("corridor_name", "")),
                                }
                                items = cat.get("products", cat.get("items", []))
                                cat_entry["products"] = [
                                    {
                                        "id": p.get("id", p.get("product_id")),
                                        "name": p.get("name"),
                                        "price": p.get("price", p.get("real_price")),
                                        "description": p.get("description", ""),
                                    }
                                    for p in (items[:20] if isinstance(items, list) else [])
                                ]
                                categories.append(cat_entry)
                            break
                if categories:
                    return json.dumps(
                        {"store_id": store_id, "categories": categories},
                        ensure_ascii=False,
                    )
                # Return raw if no known structure
                text = json.dumps(data, ensure_ascii=False)
                if len(text) > 5000:
                    text = text[:5000] + "...(truncated)"
                return text
        except Exception:
            continue

    return f"Could not fetch menu for store {store_id}. The menu endpoint may not be available for this store."


@mcp.tool()
def rappi_get_orders() -> str:
    """Get recent order history from Rappi."""
    endpoints = [
        "/order/last-orders",
        "/ms/order-history/v2/orders",
        "/order/orders",
    ]

    for endpoint in endpoints:
        try:
            resp = httpx.get(
                f"{BASE_URL}{endpoint}",
                headers=_headers(),
                timeout=15,
            )
            err = _handle_401(resp)
            if err:
                return err
            if resp.status_code == 200:
                data = resp.json()
                orders = data if isinstance(data, list) else data.get("orders", data.get("data", []))
                if not isinstance(orders, list):
                    text = json.dumps(data, ensure_ascii=False)
                    if len(text) > 3000:
                        text = text[:3000] + "...(truncated)"
                    return text
                results = []
                for o in orders[:10]:
                    results.append({
                        "order_id": o.get("order_id", o.get("id")),
                        "store_name": o.get("store_name", o.get("store", {}).get("name", "")),
                        "status": o.get("status", o.get("state")),
                        "total": o.get("total", o.get("total_value")),
                        "created_at": o.get("created_at", o.get("date")),
                    })
                return json.dumps({"orders": results}, ensure_ascii=False)
        except Exception:
            continue

    return "Could not fetch order history. The endpoint may require a different API version."


if __name__ == "__main__":
    mcp.run(transport="stdio")
