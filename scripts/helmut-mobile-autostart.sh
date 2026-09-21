#!/usr/bin/env bash
# Helmut Mobile Start (idempotent, tmux-basiert, nur Infrastruktur).
#
# Stellt sicher, dass OpenCode Mobile erreichbar ist:
#   1. tailscaled (userspace networking, persistenter State)
#   2. tailscale serve -> Proxy auf den OpenCode-Server
#   3. opencode serve (tmux Session "opencode-server") auf 127.0.0.1:4096
#
# Idempotent: mehrfacher Aufruf erzeugt keine Doppelprozesse.
# Blockiert nicht dauerhaft. Das Passwort liegt nur in der Datei
#   /workspaces/.codespaces/.persistedshare/helmut/opencode-password
# und gelangt nie in Git, Logs oder Prozessargumente.
#
# Testinstanz (beruehrt produktive Serve-Config nicht):
#   HELMUT_PORT=4097 HELMUT_SESSION=opencode-server-test HELMUT_SKIP_SERVE=1 \
#     bash scripts/helmut-mobile-autostart.sh

set -uo pipefail

PROJECT="/workspaces/helmut-pilot"
PORT="${HELMUT_PORT:-4096}"
SESSION="${HELMUT_SESSION:-opencode-server}"
SKIP_SERVE="${HELMUT_SKIP_SERVE:-0}"
PERSIST="/workspaces/.codespaces/.persistedshare/helmut"
TAILSCALE_STATEDIR="$PERSIST/tailscale"
PASSWORD_FILE="$PERSIST/opencode-password"
OPENCODE_LOG="$PERSIST/${SESSION}.log"
TAILSCALED_LOG="$PERSIST/tailscaled.log"
START_LOG="$PERSIST/autostart.log"

mkdir -p "$PERSIST" 2>/dev/null || true

log() { printf '[%s] %s\n' "$(date -Is)" "$*" >>"$START_LOG"; }
say() { printf '%s\n' "$*"; log "$*"; }

# --- Tailscale ---
tailscale_ok() { timeout 10 sudo -n tailscale status >/dev/null 2>&1; }

if ! tailscale_ok; then
  if ! pgrep -x tailscaled >/dev/null 2>&1; then
    say "tailscaled starten"
    tmux new-session -d -s tailscale \
      "sudo -n tailscaled --statedir='$TAILSCALE_STATEDIR' --tun=userspace-networking >>'$TAILSCALED_LOG' 2>&1" \
      || say "WARNUNG: tmux Session tailscale konnte nicht erstellt werden"
  fi
  for _ in $(seq 1 20); do
    tailscale_ok && break
    sleep 1
  done
fi

if ! tailscale_ok; then
  say "FEHLER: Tailscale nicht erreichbar (einmalig 'sudo tailscale up' ausfuehren)"
  exit 1
fi
say "Tailscale erreichbar"

# --- tailscale serve (idempotenter Config-Set, erzeugt keinen zweiten Proxy) ---
# Bei Testinstanzen (HELMUT_SKIP_SERVE=1) wird die produktive Serve-Config nicht angefasst.
if [ "$SKIP_SERVE" != "1" ]; then
  sudo -n tailscale serve --bg "http://127.0.0.1:$PORT" >/dev/null 2>&1 \
    || log "tailscale serve: Warnung"
fi

# --- OpenCode Server ---
opencode_running() {
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:$PORT/global/health" 2>/dev/null)"
  [ "$code" = "401" ] || [ "$code" = "200" ]
}

if ! opencode_running; then
  tmux kill-session -t "$SESSION" 2>/dev/null || true
  if [ ! -s "$PASSWORD_FILE" ]; then
    say "FEHLER: Passwort-Datei fehlt oder ist leer: $PASSWORD_FILE"
    exit 1
  fi
  say "opencode serve starten (Session $SESSION)"
  tmux new-session -d -s "$SESSION" \
    "export OPENCODE_SERVER_PASSWORD=\"\$(cat '$PASSWORD_FILE')\"; cd '$PROJECT' && opencode serve --hostname 127.0.0.1 --port '$PORT' >>'$OPENCODE_LOG' 2>&1" \
    || say "WARNUNG: tmux Session $SESSION konnte nicht erstellt werden"
  for _ in $(seq 1 20); do
    opencode_running && break
    sleep 1
  done
fi

# --- Verifikation (Punkt 6) ---
if tmux has-session -t "$SESSION" 2>/dev/null; then
  say "Session $SESSION: vorhanden"
else
  say "FEHLER: tmux Session $SESSION fehlt"
  exit 1
fi

if pgrep -f "opencode serve --hostname 127.0.0.1 --port $PORT" >/dev/null 2>&1; then
  say "OpenCode Prozess: laeuft"
else
  say "FEHLER: OpenCode Prozess laeuft nicht (Log: $OPENCODE_LOG)"
  exit 1
fi

if opencode_running; then
  say "Port $PORT: lauscht"
else
  say "FEHLER: Port $PORT antwortet nicht (Log: $OPENCODE_LOG)"
  exit 1
fi

if [ "$SKIP_SERVE" = "1" ]; then
  say "Tailscale Serve: uebersprungen (Testinstanz)"
elif sudo -n tailscale serve status 2>/dev/null | grep -q "127.0.0.1:$PORT"; then
  say "Tailscale Serve: zeigt auf $PORT"
else
  say "WARNUNG: tailscale serve zeigt nicht auf Port $PORT"
fi

URL="$(sudo -n tailscale serve status 2>/dev/null | grep -oE 'https://[a-z0-9.-]+\.ts\.net' | head -1)"

echo
echo "OpenCode Server laeuft (Port $PORT)"
echo "Tailscale erreichbar"
if [ "$SKIP_SERVE" = "1" ]; then
  echo "Testinstanz bereit (ohne Tailscale Serve)"
else
  echo "Mobile URL erreichbar: ${URL:-unbekannt}"
fi
log "bereit: Port $PORT, Session $SESSION, SkipServe=$SKIP_SERVE, URL=${URL:-unbekannt}"
