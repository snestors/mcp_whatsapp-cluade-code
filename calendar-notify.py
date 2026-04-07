#!/usr/bin/env python3
"""
Calendar notification cron script.
Checks Google Calendar for upcoming events and sends WhatsApp alerts.
Runs every 5 minutes via cron.
"""
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

# --- Config ---
CREDS_FILE = Path.home() / ".google_workspace_mcp/credentials/snestors@gmail.com.json"
STATE_FILE = Path("/tmp/calendar-notify-state.json")
NOTIFY_SCRIPT = "/media/hdd/mcp-whatsapp/notify.sh"
WA_API = "http://127.0.0.1:3457/send"
PHONE = "51922743968"
LOOKAHEAD_MIN = 10  # notify for events starting in the next N minutes
CALENDAR_ID = "primary"
TZ_OFFSET = timezone(timedelta(hours=-5))  # America/Lima


def load_creds():
    with open(CREDS_FILE) as f:
        return json.load(f)


def refresh_token(creds):
    """Refresh the access token using the refresh token."""
    resp = requests.post(creds["token_uri"], data={
        "client_id": creds["client_id"],
        "client_secret": creds["client_secret"],
        "refresh_token": creds["refresh_token"],
        "grant_type": "refresh_token",
    })
    resp.raise_for_status()
    data = resp.json()
    creds["token"] = data["access_token"]
    if "refresh_token" in data:
        creds["refresh_token"] = data["refresh_token"]
    creds["expiry"] = (datetime.now(timezone.utc) + timedelta(seconds=data["expires_in"])).isoformat()
    with open(CREDS_FILE, "w") as f:
        json.dump(creds, f, indent=2)
    return creds


def get_access_token():
    creds = load_creds()
    expiry = datetime.fromisoformat(creds.get("expiry", "2000-01-01"))
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    if expiry < datetime.now(timezone.utc) + timedelta(minutes=5):
        creds = refresh_token(creds)
    return creds["token"]


def get_upcoming_events(token, time_min, time_max):
    url = f"https://www.googleapis.com/calendar/v3/calendars/{CALENDAR_ID}/events"
    resp = requests.get(url, headers={"Authorization": f"Bearer {token}"}, params={
        "timeMin": time_min.isoformat(),
        "timeMax": time_max.isoformat(),
        "singleEvents": "true",
        "orderBy": "startTime",
    })
    resp.raise_for_status()
    return resp.json().get("items", [])


def load_state():
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"notified": {}}


def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f)


def send_whatsapp(message):
    try:
        resp = requests.post(WA_API, json={"phone": PHONE, "message": message}, timeout=10)
        return resp.json().get("ok", False)
    except Exception as e:
        print(f"WhatsApp send failed: {e}", file=sys.stderr)
        return False


def format_time(dt_str):
    """Parse event datetime and return HH:MM in local time."""
    if "T" in dt_str:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        local = dt.astimezone(TZ_OFFSET)
        return local.strftime("%H:%M")
    return dt_str  # all-day event, return date


def main():
    now = datetime.now(TZ_OFFSET)
    time_min = now
    time_max = now + timedelta(minutes=LOOKAHEAD_MIN)

    token = get_access_token()
    events = get_upcoming_events(token, time_min, time_max)

    if not events:
        return

    state = load_state()
    today = now.strftime("%Y-%m-%d")

    # Clean old state entries (keep only today)
    state["notified"] = {k: v for k, v in state["notified"].items() if v == today}

    for event in events:
        event_id = event["id"]
        if event_id in state["notified"]:
            continue  # already notified

        summary = event.get("summary", "Sin título")
        description = event.get("description", "")
        start = event.get("start", {}).get("dateTime", event.get("start", {}).get("date", ""))
        time_str = format_time(start)

        msg = f"📅 Recordatorio ({time_str}): {summary}"
        if description:
            # Truncate description to keep WhatsApp message reasonable
            desc_clean = description.strip()[:300]
            msg += f"\n\n{desc_clean}"

        if send_whatsapp(msg):
            state["notified"][event_id] = today
            print(f"Notified: {summary} at {time_str}")

    save_state(state)


if __name__ == "__main__":
    main()
