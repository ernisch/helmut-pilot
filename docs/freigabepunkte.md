# Helmut — Gebündelte Freigabepunkte (Stand Sprint-Serie Audit 2026-07-15)

> ## ⚠️ HISTORISCH (Stand 2026-07-17)
> Dieses Dokument ist **keine aktuelle Restliste mehr.** Die einzige verbindliche
> Liste offener Punkte ist **`docs/datenmotor-restliste.md`**. Zur Auflösung der
> Nummernkollision mit den Thread-2-Freigaben („F1–F8" vom 2026-07-16) heißen die
> Freigabepunkte dieses Dokuments jetzt eindeutig **FA-1…FA-13** (Alt-Freigabepunkte);
> die Überschriften unten sind entsprechend umbenannt, die alten F-Nummern stehen
> in Klammern. Mapping und Reststand je Punkt: Restliste §1.

Dieses Dokument sammelt ALLE Aktionen, die vorbereitet, aber bewusst NICHT
ausgeführt wurden, weil sie eine ausdrückliche Betreiber-/Gründer-Freigabe
brauchen (Production-Env, Production-Daten, Cron, Kosten, Recht). Jeder Punkt:
exakter Schritt, Wirkung, Risiko, Rückweg. Nichts hiervon blockiert die übrigen
Audit-Fixes; alles Übrige ist bereits im Code umgesetzt und getestet.

---

## FA-1 (früher F1) — PILOT_SECRET rotieren ✅ AUSGEFÜHRT (2026-07-15)

**AUSGEFÜHRT (2026-07-15):** Neuer, langer PILOT_SECRET in Vercel (Project
`helmut-pilot`, Production) gesetzt + Redeploy. Zugang anschließend verifiziert:
`POST /api/pilot/unlock` → **HTTP 200**, Body `{"ok":true}`. Der alte Code ist
damit sofort ungültig; **F1 ist technisch abgeschlossen.** Der neue Wert wurde
ausschließlich über einen sicheren Kanal an den Pilotmandanten übergeben — nie im Repo, kein
Wert/Fragment in dieser oder einer anderen Datei. Offen bleibt nur die optionale
Git-Historien-Bereinigung (siehe F2).

**Warum (Historie, war der Auslöser):** Der geteilte Pilot-Zugangscode stand bis
Sprint 1 im Klartext in der Pilot-Übergabedatei unter `docs/` und steht weiterhin in der
Git-Historie (2 Commits). Jeder mit (auch historischem) Repo-Zugriff kannte ihn —
nach der Rotation ist dieser Alt-Code wertlos.

**Durchgeführte Schritte (Vercel-Dashboard):** Project `helmut-pilot` → Settings →
Environment Variables → `PILOT_SECRET` → neuen, langen Zufallswert gesetzt →
Redeploy (Deployments → aktuelles → Redeploy). Neuer Wert NUR über sicheren Kanal
(Signal/persönlich) an den Pilotmandanten gegeben.

**Wirkung (eingetreten):** Alter Code sofort ungültig; laufende Pilot-Cookies
(helmut_pilot) verfallen — der Pilotmandant gibt den neuen Code einmal ein. Account-Logins
(helmut_session) sind NICHT betroffen.

**Rückweg (nicht nötig):** alten Wert wieder setzen (nicht empfohlen).

## FA-2 (früher F2) — Git-Historie bereinigen (optional, vor Repo-Weitergabe)

**Warum:** Der alte Pilot-Code bleibt in der Historie lesbar, bis diese
umgeschrieben wird. F1 ist ausgeführt (2026-07-15), der alte Code ist damit bereits
wertlos — die Bereinigung ist nur noch nötig, bevor das Repo an Dritte
(Dienstleister, Due Diligence) geht.

**Schritt:** `git filter-repo --replace-text <(echo 'ALTER_CODE==>ENTFERNT')`
auf einem frischen Klon, dann Force-Push von `main` (koordinieren: alle offenen
Branches müssen neu aufgesetzt werden; Vercel-Deploy-Historie bleibt).

**Risiko:** Force-Push bricht offene Branches/Checkouts. **Rückweg:** Backup-
Klon vor dem Rewrite behalten.

## FA-3 (früher F3) — Cron-Reihenfolge Morgenablauf (Produktqualität)

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
50 statt 0 Minuten nach 5 UTC (7:50 Berlin Sommerzeit — prüfen, ob das für den
Pilotmandanten passt; alternativ understanding auf 04:30 UND morning-briefing auf 05:00
belassen). **Rückweg:** Zeile zurückstellen + Deploy.

## FA-4 (früher F4) — Morgen-Push für alle Profile ~~(erledigt/entfällt)~~

**Erledigt durch die Mandantenneutralisierung
(`docs/multitenancy-pilot-neutralisierung.md`):** Der 05:00-Cron
`morning-briefing` bedient jetzt IMMER alle aktiven DB-Mandate isoliert
(deaktivierte übersprungen, per-Mandat try/catch, 240s-Budget, 0 KI) — ohne
Flag, ohne bevorzugtes Mandat. Es gibt kein `HELMUT_MORNING_PUSH_ALL_PROFILES`
und kein Fallback-Mandat mehr. Kein Freigabeschritt nötig.

## FA-5 (früher F5) — LLM-Tageslimit ✅ VOLLSTÄNDIG AUSGEFÜHRT (2026-07-15)

**AUSGEFÜHRT mit Gründer-Freigabe „Go kontrollierter LLM Budget Rollout"
(Merge `170d310` + Vercel-Env):** `HELMUT_MAX_LLM_CALLS_PER_DAY=100` und
`HELMUT_LLM_BUDGET_FAIL_CLOSED=1` sind in Production gesetzt und wirksam
(live verifiziert: 33 echte Calls am 15.07. > altes Limit 20; Understanding
lief 23×). Rollback-Referenz: alter Ist-Wert war `20`.

**✅ ERLEDIGT (Nachtrag 2026-07-17):** Auch dieser Rest ist ausgeführt —
`HELMUT_LLM_RESERVE_UNDERSTANDING=30` + `HELMUT_UNDERSTANDING_LOCK=1` sind seit
2026-07-15 gesetzt und live verifiziert (Master-Status, Nachtrag „FA-12 FINAL").
FA-5 ist damit vollständig abgeschlossen. Der folgende Absatz ist historisch:

**NOCH OFFEN (historisch, inzwischen erledigt) — Migration FA-12 ist seit 2026-07-15
eingespielt, es fehlen NUR noch diese zwei Vercel-Env-Werte + ein Redeploy
(Gründer-Dashboard-Schritt):**
- `HELMUT_LLM_RESERVE_UNDERSTANDING=30` — Understanding kann nie unter
  30 Calls/Tag gedrückt werden; Büro/Lage/App-Start teilen sich max. 70
  (behebt das belegte Aushungern strukturell; der Code dafür liegt im
  Budget-Race-PR und ist mit Default 0 verhaltensneutral).
- `HELMUT_UNDERSTANDING_LOCK=1` — verhindert Doppel-Calls pro Vorgang bei
  überlappenden Cron-Läufen (Exists-Check ist sonst Read-then-Decide).
**Rückweg:** Variablen entfernen + Redeploy.

## FA-6 (früher F6) — Fail-closed ✅ AUSGEFÜHRT (2026-07-15)

`HELMUT_LLM_BUDGET_FAIL_CLOSED=1` ist in Vercel gesetzt und seit Deployment
`170d310` wirksam. **Rückweg:** Variable entfernen + Redeploy.

## FA-7 (früher F7) — Supabase Pro + PITR (Betriebsrisiko, DRINGEND)

**Warum:** Free-Plan = keine Backups; der zentrale Blob (`helmut_store.main`,
~1,2 MB) ist Last-Write-Wins — ein fehlerhafter Write ist irreversibler
Totalverlust. **Schritt:** Supabase-Dashboard → Projekt → Billing → Pro
(~25 $/Monat) → Point-in-Time-Recovery aktivieren. Danach einmal Restore-Übung
nach `docs/betrieb/backup-restore-runbook.md` (Sprint 7). **Rückweg:** Downgrade
möglich, Backups gehen dann wieder verloren.

## FA-8 (früher F8) — Rotation weiterer Secrets NUR falls Verdacht

Der Secret-Scan (Sprint 1) fand außer dem Pilot-Code KEINE echten Secrets in
Arbeitsstand oder Historie (nur Test-Fixtures; nie eine .env committet). Keine
Aktion nötig, solange kein Verdacht auf Leak besteht.

## FA-9 (früher F9) — Rechtliche Festlegungen (Anwalt/DSB)

Entwürfe liegen ab Sprint 7 unter `docs/recht/` (Datenfluss, Dienstleister,
TOMs, Löschkonzept, VVT, AVV-Liste, Pilotvereinbarung als ARBEITSENTWURF,
Fragenkatalog). JEDE verbindliche Festlegung (Art.-9-Grundlage, DSFA,
AVV-Abschluss, Pilotvereinbarung unterschreiben) braucht Anwalt/DSB — keine
Rechtsbewertung durch dieses Audit.

## FA-12 (früher F12) — Migration: atomare LLM-Budget-Reservierung ✅ AUSGEFÜHRT (2026-07-15)

**AUSGEFÜHRT mit Gründer-Freigabe „Go für Migration F12"
(Registry-Version `20260715123216`, genau einmal):**
`supabase/migrations/20260717_llm_budget_reservation.sql` ist in Production
eingespielt. Nachprüfung grün — Tabelle `llm_budget_counters` (PK day,scope),
Funktion `helmut_reserve_llm_call` INVOKER, EXECUTE für public/anon/authenticated
entzogen, RLS an, 0 Policies. **Atomik live belegt:** realer Production-Call
12:37:14 UTC → `used=1`; Burst-Test 10 parallel bei Deckel 5 → exakt 5. Kein
Fehler, 0 neue Systemfehler. **Rückweg:**
`20260717_llm_budget_reservation_rollback.sql` (App fällt automatisch aufs
Altverhalten zurück, kein Deploy nötig).

**NOCH OFFEN im selben Schritt (Gründer-Dashboard, Vercel — siehe F5-Rest):**
`HELMUT_LLM_RESERVE_UNDERSTANDING=30` + `HELMUT_UNDERSTANDING_LOCK=1` + Redeploy.

---

**Ursprüngliche Begründung (historisch):** Der belegte Budget-Race (Read-then-Decide; Limit 20, real bis 185
Calls/Tag) ist im Code behoben — die Atomik über mehrere Server-Instanzen
braucht aber die SQL-Funktion `helmut_reserve_llm_call` in Supabase. Bis zur
Migration läuft das Gate erkennbar+geloggt im Altverhalten weiter (deploybar,
aber nicht atomar).

**Schritt:** `supabase/migrations/20260717_llm_budget_reservation.sql` im
Supabase-SQL-Editor ausführen (idempotent, < 1 s, keine Sperren auf
App-Tabellen, keine Nutzerwirkung). Vorprüfung/Nachprüfung/Rollback exakt in
`docs/betrieb/llm-budget-reservierung.md`.

**Reihenfolge (aktualisiert 2026-07-15, nach Merge von PR 82/`170d310`):**
Merge der PR-Kette 85 → 86 → 88(Rest-Fixes) → diese Migration →
F5-Rest (`HELMUT_LLM_RESERVE_UNDERSTANDING=30` + `HELMUT_UNDERSTANDING_LOCK=1`)
→ Redeploy. Die Env-Werte 100/fail-closed sind bereits live (F5/F6 ✅).
**Rückweg:** `20260717_llm_budget_reservation_rollback.sql` (App fällt
automatisch auf Altverhalten zurück, kein Deploy nötig).

## FA-13 (früher F13) — Mandantenneutraler Stand: KEINE Mandanten-Env nötig (nur Daten-Hygiene)

**Warum:** Die Mandantenneutralisierung
(`docs/multitenancy-pilot-neutralisierung.md`) entfernt jeden bevorzugten
Mandanten — es gibt **keine** `HELMUT_PILOT_TENANT_ID` und **kein**
`HELMUT_CRON_MULTI_TENANT` mehr. Nutzeranfragen und Crons beziehen ihr Mandat
ausschließlich aus den **aktiven DB-Mandaten**. Der bestehende Mandant
funktioniert nach dem Merge **ohne jede zusätzliche Env-Variable** als normaler
aktiver DB-Mandant; Crons laufen mit ≥1 aktivem Mandat nie leer, die App
antwortet nie mit 503.

**Empfohlener (separater) Daten-Hygiene-Schritt:** Die beiden Demo-Mandate
(`james-brown`, `angela-merkel`, Audit-Befund „vor Vertrieb löschen") über das
Provisionierungs-/Admin-Werkzeug deaktivieren/entfernen. Danach existiert genau
ein aktives Mandat und der Bare-Root-Aufruf serviert es ohne Mandatsauswahl.
Das ist eine **Daten-Aktion, kein Deploy und kein Code-Schritt** — und für den
Betrieb nicht zwingend (mit mehreren aktiven Mandaten erscheint lediglich eine
einmalige Mandatsauswahl).

**Rückweg:** Vorheriges Deployment re-deployen. Keine Migration, keine
Datenänderung nötig.

## FA-11 (früher F11) — Branch Protection aktivieren (einmalig, 2 Minuten)

Das neue CI-Gate (.github/workflows/ci.yml) läuft bei jedem PR, blockiert den
Merge aber erst mit Branch Protection: GitHub → Settings → Branches → Add rule
→ Branch `main` → „Require status checks to pass before merging" → Checks
„Syntax + Offline-Suiten" und „Browser-/Mobile-Smoke (Chromium)" auswählen.
**Rückweg:** Regel deaktivieren.

## FA-10 (früher F10) — Merge dieses Branches nach main (= Production-Deployment)

Der Branch `claude/helmut-audit-readiness-boirkf` enthält ausschließlich
verhaltenssichere Fixes (alle Suiten grün, keine Flag-/Cron-/Datenänderung,
Cutover unberührt) — der Merge selbst löst aber das Vercel-Production-Deployment
aus und ist damit freigabepflichtig. Empfohlene Reihenfolge: Preview-Deployment
des Branches ansehen → Smoke (Login, 4 Tabs, Admin) → Merge → Prod-Smoke.
**Rückweg:** Vercel Instant Rollback auf das letzte grüne Deployment.
