#!/usr/bin/env bash
# Liest .env.local, setzt alle Variablen in Vercel Production, deployed dann.
# Nutzung: bash scripts/vercel-deploy.sh
# Voraussetzung: vercel CLI installiert + eingeloggt (vercel whoami)

set -euo pipefail

ENV_FILE=".env.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "FEHLER: $ENV_FILE nicht gefunden."
  echo "Lege sie an: cp .env.example .env.local  und trage deine Keys ein."
  exit 1
fi

which vercel >/dev/null 2>&1 || { echo "FEHLER: vercel CLI nicht gefunden. npm i -g vercel"; exit 1; }

echo "==> Importiere $ENV_FILE nach Vercel Production..."
echo ""

while IFS= read -r line || [[ -n "$line" ]]; do
  # Kommentare und Leerzeilen ueberspringen
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line//[[:space:]]/}" ]] && continue

  # KEY=VALUE trennen (alles nach dem ersten = ist der Wert)
  key="${line%%=*}"
  value="${line#*=}"

  # Zeilen ohne echten Key (z.B. nur Wert) ueberspringen
  [[ -z "$key" || "$key" == "$line" ]] && continue

  # Anführungszeichen aussen entfernen
  value="${value%\"}" value="${value#\"}"
  value="${value%\'}" value="${value#\'}"

  # Leere Werte ueberspringen (nicht in Vercel loeschen, nur ignorieren)
  if [[ -z "$value" ]]; then
    echo "  SKIP  $key  (kein Wert in .env.local)"
    continue
  fi

  # In Vercel setzen; falls bereits vorhanden: erst loeschen, dann neu setzen
  if echo "$value" | vercel env add "$key" production 2>/dev/null; then
    echo "  OK    $key"
  else
    vercel env rm "$key" production --yes 2>/dev/null || true
    if echo "$value" | vercel env add "$key" production 2>/dev/null; then
      echo "  UPD   $key  (ueberschrieben)"
    else
      echo "  WARN  $key  (konnte nicht gesetzt werden)"
    fi
  fi

done < "$ENV_FILE"

echo ""
# Sauberer Arbeitsbaum (Review-Fix): `vercel --prod` deployt den ARBEITSBAUM,
# die Asset-Version wird aber aus dem HEAD-SHA gebaut — mit uncommitteten
# Aenderungen wuerde die Version luegen (SHA != deployter Code) und ein
# CLI-Deploy koennte ungeprueften Stand nach Production schieben.
# Bewusster Override nur per HELMUT_DEPLOY_ALLOW_DIRTY=1.
if [[ -n "$(git status --porcelain 2>/dev/null)" && "${HELMUT_DEPLOY_ALLOW_DIRTY:-}" != "1" ]]; then
  echo "FEHLER: Arbeitsbaum ist nicht sauber (git status). Erst committen/stashen."
  echo "        Bewusster Override: HELMUT_DEPLOY_ALLOW_DIRTY=1 bash scripts/vercel-deploy.sh"
  exit 1
fi
# Asset-Versionierung für den CLI-Deploy-Weg (Audit-Folgebranch): Vercel setzt
# VERCEL_GIT_COMMIT_SHA nur bei Git-Integration-Deploys, NICHT bei `vercel --prod`.
# Ohne eine deploy-eindeutige Version blieben client.js/styles.css wegen des
# immutable-Cachings über CLI-Deploys hinweg unter derselben URL — Bestandsnutzer
# bekämen dauerhaft alte Assets. Darum eine frische Version aus Git-SHA + Zeit
# als HELMUT_ASSET_VERSION mitgeben (server.js nutzt sie als Fallback; setzt
# Vercel wider Erwarten doch einen Commit-SHA, hat der ohnehin Vorrang und die
# Version bleibt deploy-eindeutig — beide Wege sind versioniert).
ASSET_VER="$(git rev-parse --short=8 HEAD 2>/dev/null || echo cli)-$(date -u +%Y%m%d%H%M%S)"
echo "==> Starte Production-Deployment (HELMUT_ASSET_VERSION=$ASSET_VER)..."
vercel --prod -e "HELMUT_ASSET_VERSION=$ASSET_VER"
echo ""
echo "==> Fertig. Nachpruefung (Post-Deploy-Verifikation):"
echo "    1. https://helmut-pilot.vercel.app/api/debug/public/status"
echo "    2. Admin -> System: deploy.version muss '$ASSET_VER' (oder den Git-SHA) zeigen —"
echo "       bleibt die alte Version stehen, wurde der Asset-Cache NICHT rotiert."
