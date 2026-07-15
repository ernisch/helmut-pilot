# Helmut — Gebündelte Freigabepunkte (Stand Sprint-Serie Audit 2026-07-15)

Dieses Dokument sammelt ALLE Aktionen, die vorbereitet, aber bewusst NICHT
ausgeführt wurden, weil sie eine ausdrückliche Betreiber-/Gründer-Freigabe
brauchen (Production-Env, Production-Daten, Cron, Kosten, Recht). Jeder Punkt:
exakter Schritt, Wirkung, Risiko, Rückweg. Nichts hiervon blockiert die übrigen
Audit-Fixes; alles Übrige ist bereits im Code umgesetzt und getestet.

---

## F1 — PILOT_SECRET rotieren (Sicherheit, DRINGEND)

**Warum:** Der geteilte Pilot-Zugangscode stand bis Sprint 1 im Klartext in
`docs/PILOT_UEBERGABE_CEM.md` und steht weiterhin in der Git-Historie
(2 Commits). Jeder mit (auch historischem) Repo-Zugriff kennt ihn.

**Schritt (Vercel-Dashboard):** Project `helmut-pilot` → Settings → Environment
Variables → `PILOT_SECRET` → neuen, langen Zufallswert setzen → Redeploy
(Deployments → aktuelles → Redeploy). Neuen Wert NUR über sicheren Kanal
(Signal/persönlich) an Cem geben.

**Wirkung:** Alter Code sofort ungültig; laufende Pilot-Cookies (helmut_pilot)
verfallen — Cem muss den neuen Code einmal eingeben. Account-Logins
(helmut_session) sind NICHT betroffen.

**Risiko:** Kurzer Login-Moment für Pilotnutzer. **Rückweg:** alten Wert wieder
setzen (nicht empfohlen).

## F2 — Git-Historie bereinigen (optional, vor Repo-Weitergabe)

**Warum:** Der alte Pilot-Code bleibt in der Historie lesbar, bis diese
umgeschrieben wird. Nach F1 ist er wertlos — die Bereinigung ist nur nötig,
bevor das Repo an Dritte (Dienstleister, Due Diligence) geht.

**Schritt:** `git filter-repo --replace-text <(echo 'ALTER_CODE==>ENTFERNT')`
auf einem frischen Klon, dann Force-Push von `main` (koordinieren: alle offenen
Branches müssen neu aufgesetzt werden; Vercel-Deploy-Historie bleibt).

**Risiko:** Force-Push bricht offene Branches/Checkouts. **Rückweg:** Backup-
Klon vor dem Rewrite behalten.

## F3 — Cron-Reihenfolge Morgenablauf (Produktqualität)

**Ist (verifiziert, vercel.json + Code):** crawl 04:00 → **morning-briefing
05:00** → understanding 05:30 → lage-briefing 05:45 (UTC). Der Morgen-Push
läuft damit VOR der Understanding-Analyse des Tages — er verpasst systematisch
die frischen Vorgänge (Audit P1-9). Seit Sprint 3 pusht er zwar nicht mehr bei
LEEREM Briefing (Ehrlichkeits-Gate), aber der Stand von gestern Abend bleibt
die Basis.

**Vorbereitete Zieländerung (EXAKTES Diff in vercel.json, Zeilen 64-67):**
```json
{ "path": "/api/cron/morning-briefing", "schedule": "50 5 * * *" }
```
(statt `"0 5 * * *"` — 20 Minuten nach dem 05:30-Understanding, vor dem
Arbeitsbeginn; lage-briefing 05:45 kann unverändert bleiben, da unabhängig.)

**Ausführung:** Diese eine Zeile per PR ändern → Merge → Deployment. Cron-
Änderungen sind laut Betriebsregel (Master-Status §8) freigabepflichtig.

**Wirkung:** Morgen-Push enthält die heutigen Analysen. **Risiko:** Push kommt
50 statt 0 Minuten nach 5 UTC (7:50 Berlin Sommerzeit — prüfen, ob das für Cem
passt; alternativ understanding auf 04:30 UND morning-briefing auf 05:00
belassen). **Rückweg:** Zeile zurückstellen + Deploy.

## F4 — Morgen-Push für alle Profile aktivieren (vor Mandant 2)

**Vorbereitet (Sprint 3, Code deployt inert):** `HELMUT_MORNING_PUSH_ALL_PROFILES=1`
in Vercel setzen + Redeploy → der 05:00-Cron bedient alle aktiven Profile
(deaktivierte übersprungen, per-Profil try/catch, 240s-Budget, 0 KI).
**Rückweg:** Variable entfernen/0 + Redeploy.

## F5 — LLM-Tageslimit: Ist-Wert dokumentieren, dann ggf. auf 150 erhöhen

**Schritt 1 (nur Lesen):** Admin → System & Sicherheit → Live-Diagnose: Wert
von `HELMUT_MAX_LLM_CALLS_PER_DAY` ablesen und hier als Rollback-Referenz
notieren: `Ist-Wert Production am ____: ____`.
**Schritt 2 (nach Freigabe):** Vercel-Env auf `150` + Redeploy.
Grenzen laut Master-Status: ~$8–10/Monat, Stop >$0,50/Tag, NIE unbegrenzt.
**Neu seit Sprint 2:** Ein Tippfehler im Wert fällt nicht mehr auf „unbegrenzt",
sondern auf ein Schutzlimit von 50 Calls/Tag (Log-Warnung).
**Rückweg:** dokumentierten Ist-Wert wieder setzen.

## F6 — Fail-closed für Budget-Prüffehler aktivieren (vor zahlendem Kunden)

**Schritt:** Vercel-Env `HELMUT_LLM_BUDGET_FAIL_CLOSED=1` + Redeploy.
**Wirkung:** Schlägt die Budget-ABFRAGE fehl (Storage-Störung), wird der
KI-Call verweigert statt erlaubt (lieber ein übersprungenes Briefing als eine
unkontrollierte Rechnung). **Risiko:** Bei Supabase-Störung entfallen KI-Texte
(Regel-Fallbacks greifen, seit Sprint 1 ehrlich gekennzeichnet).
**Rückweg:** Variable entfernen + Redeploy.

## F7 — Supabase Pro + PITR (Betriebsrisiko, DRINGEND)

**Warum:** Free-Plan = keine Backups; der zentrale Blob (`helmut_store.main`,
~1,2 MB) ist Last-Write-Wins — ein fehlerhafter Write ist irreversibler
Totalverlust. **Schritt:** Supabase-Dashboard → Projekt → Billing → Pro
(~25 $/Monat) → Point-in-Time-Recovery aktivieren. Danach einmal Restore-Übung
nach `docs/betrieb/backup-restore-runbook.md` (Sprint 7). **Rückweg:** Downgrade
möglich, Backups gehen dann wieder verloren.

## F8 — Rotation weiterer Secrets NUR falls Verdacht

Der Secret-Scan (Sprint 1) fand außer dem Pilot-Code KEINE echten Secrets in
Arbeitsstand oder Historie (nur Test-Fixtures; nie eine .env committet). Keine
Aktion nötig, solange kein Verdacht auf Leak besteht.

## F9 — Rechtliche Festlegungen (Anwalt/DSB)

Entwürfe liegen ab Sprint 7 unter `docs/recht/` (Datenfluss, Dienstleister,
TOMs, Löschkonzept, VVT, AVV-Liste, Pilotvereinbarung als ARBEITSENTWURF,
Fragenkatalog). JEDE verbindliche Festlegung (Art.-9-Grundlage, DSFA,
AVV-Abschluss, Pilotvereinbarung unterschreiben) braucht Anwalt/DSB — keine
Rechtsbewertung durch dieses Audit.

## F11 — Branch Protection aktivieren (einmalig, 2 Minuten)

Das neue CI-Gate (.github/workflows/ci.yml) läuft bei jedem PR, blockiert den
Merge aber erst mit Branch Protection: GitHub → Settings → Branches → Add rule
→ Branch `main` → „Require status checks to pass before merging" → Checks
„Syntax + Offline-Suiten" und „Browser-/Mobile-Smoke (Chromium)" auswählen.
**Rückweg:** Regel deaktivieren.

## F10 — Merge dieses Branches nach main (= Production-Deployment)

Der Branch `claude/helmut-audit-readiness-boirkf` enthält ausschließlich
verhaltenssichere Fixes (alle Suiten grün, keine Flag-/Cron-/Datenänderung,
Cutover unberührt) — der Merge selbst löst aber das Vercel-Production-Deployment
aus und ist damit freigabepflichtig. Empfohlene Reihenfolge: Preview-Deployment
des Branches ansehen → Smoke (Login, 4 Tabs, Admin) → Merge → Prod-Smoke.
**Rückweg:** Vercel Instant Rollback auf das letzte grüne Deployment.
