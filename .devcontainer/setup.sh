#!/usr/bin/env bash
# Einmalige Einrichtung (postCreateCommand): Tools installieren, Wrapper anlegen,
# dann Autostart. Laeuft bei Erstellung/Neuaufbau, nicht bei jedem Stop/Start.
set -uo pipefail

if ! command -v tailscale >/dev/null 2>&1; then
  echo "[setup] installiere tailscale"
  curl -fsSL https://tailscale.com/install.sh | sudo sh
fi

if ! command -v opencode >/dev/null 2>&1; then
  echo "[setup] installiere opencode-ai"
  npm install -g opencode-ai
fi

# Manuellen Notfallweg "helmut-mobile" wiederherstellen (falls Home neu aufgebaut)
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/helmut-mobile" <<'WRAPPER'
#!/usr/bin/env bash
SCRIPT="/workspaces/helmut-pilot/scripts/helmut-mobile-autostart.sh"
if [ ! -f "$SCRIPT" ]; then
  echo "FEHLER: Startlogik nicht gefunden: $SCRIPT" >&2
  exit 1
fi
exec bash "$SCRIPT" "$@"
WRAPPER
chmod +x "$HOME/.local/bin/helmut-mobile"

bash /workspaces/helmut-pilot/scripts/helmut-mobile-autostart.sh
