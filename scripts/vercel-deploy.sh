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
echo "==> Starte Production-Deployment..."
vercel --prod
echo ""
echo "==> Fertig. Pruefe jetzt:"
echo "    https://helmut-pilot.vercel.app/api/debug/public/status"
