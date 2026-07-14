# MASTER-STATUS — Helmut Quellenarchitektur-Migration

**Dies ist die EINZIGE aktuelle Statuswahrheit.** Alle älteren Status-/Abschlussberichte —
insbesondere Doku 20–27 (u. a. „27-abschluss-und-production-freigabe.md") und frühere
Master-Status-Fassungen — sind **ÜBERHOLT** und dürfen nicht mehr als aktueller Stand zitiert
werden; sie bleiben nur als historische Detailnachweise ihrer jeweiligen Phase gültig.
Konsolidiert am **2026-07-14 (nach Reiter-Deployment)** aus Repository, Production-DB (read-only),
Vercel-Deployments und Thread-Verlauf. Keine Migration wurde erneut angewendet.

## 1) Deployments & Commits (verifiziert via Vercel-API + git)
| Was | Wert |
|---|---|
| Production-Commit (main) | **`6539fbf`** — Merge PR #76 (Reiter „Helmut"→„Briefing") |
| Production-Deployment | `dpl_FSy61yLoLCXhPmEYLoyHToUVMFFV`, READY, `helmut-pilot.vercel.app` |
| Vorheriges Prod-Deployment (Rollback-Kette) | `9685a0b` (PR #75, Quellenarchitektur-Code, Guards off) → davor `74ae2a6` (Alt-Stand) |
| Feature-Branch | `claude/helmut-source-architecture-ruhyvb` @ `32b1721` (= main + diese Statusdatei) |
| Crons (vercel.json, unverändert seit Alt-Stand) | crawl 04:00+20:00 · morning-briefing 05:00 · understanding 05:30+21:30 · health 06:00 · lage-check 10:00 · pipeline 16:00 · lage-briefing 05:45 (UTC) |

**Bereits deployt und live:** neue Quellenarchitektur-Codebasis (Guards off), korrigierte
Radar-Beleglogik (Partei/Wahlkreis/Ausschuss evidenzbasiert), domain-basierte „Offizielle
Quellen", ai.js-Steuerzeichen-Parserfix, sichtbarer Reiter **„Briefing"** (Marke/Persona
Helmut, interne View-IDs und API-Verträge unverändert).

## 2) Datenbank-Ist (Production Supabase, read-only 2026-07-14 ~16:30 UTC)
- Mengen: raw_documents **5242** · knowledge_objects **247** · briefings **7** · decisions **86**
  · mandate_profiles **1** · ko_document_links **1147**
- **document_findings: 0 Zeilen** (Tabelle existiert, Dedup/Fundstellen noch nicht befüllt —
  Schreibpfad ist Teil des späteren Shadow-/Cutover-Betriebs)
- **gate_shadow_events: 0 Zeilen** (Tabelle existiert, Gate-Shadow NIE gelaufen)
- **llm_usage (SQL-Attributionstabelle): 0 Zeilen** (existiert; der echte Kostenlog lebt im
  Blob `helmut_store['main-auth'].llmUsage`)
- KO-Klassifikationsspalten (decision_level …): **vorhanden, unbefüllt** (Backfill = spätere Stufe)
- Quellenarchitektur-Tabellen: publishers **64** · retrieval_paths **163** · source_packages **7**
  · package_paths **164**; **keine** Profil→Paket-Zuordnungstabelle (Aktivierung läuft über
  source_packages.status; Resolver-Logik liegt im Code)
- retrieval_paths: Status-Vokabular healthy(4)/broken(6)/needs_review(153); Aktivierung über
  activation_mode always_on(5)/auto(140)/manual(18)
- **Berlin/Brandenburg: 19 Wege, ALLE needs_review+manual; Pakete berlin-basis/brandenburg-basis
  ALLE `prepared`. Keine Landesquelle sichtbar aktiv.**
- Migration-Registry (`supabase_migrations.schema_migrations`, 12 Einträge): tenant_rls,
  mandate_profile_fields/completeness, source_architecture (+4 Seeds), llm_usage_attribution,
  gate_shadow_telemetry (registriert als 20260714105547), ko_classification (20260714111259).
  Abweichung Dateiname↔Registry ist dokumentiert und ungefährlich (alle 9 Migrationsdateien
  idempotent, jede mit `*_rollback.sql`; Preflight 51 PASS). **Keine Migration offen.**

## 3) Aktiver Quellenpfad (Code-verifiziert)
Der Crawl nutzt **weiterhin ausschließlich den alten hartcodierten Katalog** (`lib/helmut/
sources.js` → storage.mergeSources, „Code ist die Wahrheit"). Die relationale Bibliothek ist
Shadow-Struktur + read-only Admin-Report. **Es existiert noch KEIN Quellenmodus-Schalter
(off/shadow/on) für den relationalen Pfad** — dessen Bau ist Phase 7/8 (nach Shadow-Start).

## 4) Feature-Guards (Code-Defaults, alle fail-closed; Live-Beweis 16:00-UTC-Pipeline: 0 Gate-Events, 0 PARDOK)
| Variable | Default ohne/bei unbekanntem Wert | wirksam bei |
|---|---|---|
| HELMUT_UNDERSTANDING_GATE | **off** (Gate nie aufgerufen; „on" nicht scharf) | `shadow` |
| HELMUT_PARDOK_DISPATCH | **off** (items:[]-Invariante; „on" nicht verdrahtet) | `shadow` |
| HELMUT_SCORING_MODE | **off** (Alt-Ranking byte-identisch) | on/active/live |
| HELMUT_V3_SHADOW_COMPARE | aus (Modul live nicht verdrahtet) | — |
| HELMUT_PROFILE_DB_MODE | aus (Blob-only; DB wäre ohnehin feldgleich) | 1/true/on/yes |
| HELMUT_V3_STORE | aus lt. Code-Default — in Production **faktisch gesetzt/AN** (KOs werden gelesen); wird durch Deployments nicht berührt | 1/true/on/yes |
| HELMUT_MAX_LLM_CALLS_PER_DAY | Infinity lt. Code — in Production **faktisch endlich gesetzt** (täglich 26–252 geblockte Calls) | Zahl > 0 |

## 5) Environment-Zugriff (Phase 2 — endgültig geklärt, 2026-07-14)
**Kein verfügbarer Lese- oder Schreibweg aus dieser Umgebung:** Vercel-MCP hat kein
Env-Tool (erschöpfend geprüft); Vercel-CLI nicht installiert und ohne Login-/Token-Weg;
keine `VERCEL_*`-Variablen, kein `~/.vercel`, kein `.vercel/`-Projekt-Link, keine `.env`
im Repo; Vercel-REST-API ohne Token nicht nutzbar. **Exakter Tageslimit-Wert daher nicht
direkt lesbar** — und aus Verhalten NICHT sicher ableitbar (Tages-Billables an gesättigten
Tagen schwanken 17–185, u. a. wegen Backfill-Workflows mit eigenem Limit im selben Log).

**Vorbereiteter Zugriffsweg (kleinste Berechtigung):** Ein Vercel-**Access-Token** (Scope:
Team „Nohut", reicht als „Member") als Umgebungsvariable `VERCEL_TOKEN` dieser Session.
Dann (ohne Secrets auszugeben):
- Lesen: `npx vercel env ls production --token $VERCEL_TOKEN --scope nohut --cwd .` (nach `npx vercel link --yes …`)
  oder API `GET /v9/projects/prj_xbZ6QzTkr7YoxQI71lW59FT03IR3/env?teamId=team_bTAfzDHwD3mT03r1z7rh1TC3`
- Setzen: `printf 'shadow' | npx vercel env add HELMUT_UNDERSTANDING_GATE production --token …`
- Rollback: `npx vercel env rm <NAME> production` bzw. alten Wert erneut setzen
- Wirksam machen: Redeploy des aktuellen Production-Commits (Dashboard „Redeploy" oder
  `npx vercel redeploy helmut-pilot.vercel.app --token …`)
Alternative ohne Token: Gründer im Dashboard `vercel.com/nohut/helmut-pilot/settings/environment-variables`.

## 6) Tageslimit & Kosten (Phase 3 — Realdaten aus dem Blob-Kostenlog, 14 Tage)
- Deckel zählt **alle** billable KI-Aufrufe (canSpendLlm global, nicht nur Understanding)
- Understanding ausgeführt: Ø ~15/Tag · geblockt: **26–252/Tag** (Nachfrage ≫ Deckel)
- Sonstige billable Aufrufe: Ø ~27/Tag · Kosten/Understanding-Call: **$0,002** (gpt-5-mini)
- Hochrechnung Understanding/Monat: 50/Tag≈$3 · 100/Tag≈$6 · 150/Tag≈$9
- **Übergangsziel: Gesamtdeckel 150/Tag** → ~100 Understanding + ~50 Spielraum ≈ **~$8/Monat
  gesamt**; ausdrücklich NICHT unbegrenzt. Langfristig: Relevanzpriorisierung
  (`understanding-priority.js`, fertig als Shadow-Logik) + echtes tägliches Kostenlimit.

## 7) Shadow-Start — GETEILT in Phase 4A und 4B (Gründer-Entscheid 2026-07-14; NICHTS verändert)
Inertheit frisch nachgewiesen: Gate off=byte-identisch & shadow blockiert nichts
(Integrationstest: off/shadow/on identische Call-Zahlen), Gate schreibt nur Telemetrie;
PARDOK shadow liefert 0 sichtbare Items, kein Write in raw_documents/KOs, kein BE/BB-Leck;
Cem-E2E 93/93 + Gate-E2E grün. Vorbedingung beider Phasen: die 7 lokal vom Gründer
ausgelesenen Production-Werte (GATE, PARDOK, MAX_LLM, V3_STORE, SCORING, SHADOW_COMPARE,
PROFILE_DB_MODE) liegen vor. **Es wartet: die 7 Werte.**

### Phase 4A — Gate-Shadow + PARDOK-Shadow (eigene Freigabe)
- **Änderung:** `HELMUT_UNDERSTANDING_GATE=shadow` und `HELMUT_PARDOK_DISPATCH=shadow`
  (Production), danach EIN Redeploy des aktuellen Production-Commits.
- **Kosten:** $0 (Shadow rechnet nur mit; kein zusätzlicher LLM-Call).
- **Smoke (nach Redeploy, dann nach dem nächsten Crawl-/Understanding-Cron):**
  App-Start/Lage/Radar/Briefing/Büro/Admin unverändert · 0 neue Runtime-Fehler ·
  Understanding-Call-Zahl NICHT gesunken (Gate blockiert nichts) · `gate_shadow_events`
  beginnt NACH dem nächsten Understanding-Cron (05:30/21:30 UTC) zu wachsen ·
  raw_documents/KOs bekommen KEINE PARDOK-/BE-/BB-Einträge · Cem-Ausgaben unverändert.
- **Stop-Bedingungen:** Understanding-Zahl sinkt · sichtbare PARDOK-/Landesinhalte ·
  neue Fehlerrate · leere Briefings · Nutzeroberfläche verändert.
- **Rollback:** beide Variablen löschen (Default off) + Redeploy; `gate_shadow_events`
  bleibt als harmlose Telemetrie stehen (kein Nutzerpfad liest sie).

### Phase 4B — Tageslimit (eigene Freigabe, NUR nach direktem Lesen des Ist-Werts)
- **Vorbedingung (hart):** aktueller Production-Wert von `HELMUT_MAX_LLM_CALLS_PER_DAY`
  DIREKT gelesen (lokale Vercel-Session des Gründers) und hier als Rollback-Wert
  dokumentiert. Ohne dokumentierten Ist-Wert keine Änderung.
- **Änderung:** `HELMUT_MAX_LLM_CALLS_PER_DAY=150` + Redeploy.
- **Kosten:** ~100 Understanding + ~50 übrige Calls/Tag ≈ ~$8/Monat (statt heute ~$1).
- **Smoke (nach dem nächsten Understanding-Cron):** ausgeführte Understanding-Calls
  steigen Richtung Nachfrage (~80-100/Tag), geblockte sinken deutlich · Gesamt-Billable
  ≤150/Tag · Tageskosten ≤ $0,50 · keine neue LLM-Fehlerrate · Briefings gefüllt ·
  Cem-Qualität unverändert oder besser (mehr verstandene Vorgänge).
- **Stop-Bedingungen:** >150 Calls/Tag (Deckel greift nicht) · Tageskosten > $1 ·
  LLM-Fehlerrate steigt · leere/degradierte Briefings.
- **Rollback:** dokumentierten Alt-Wert zurücksetzen + Redeploy.

## 8) Verbindlich AUS (bis je eigene Freigabe)
Gate **on** · Cheap-Triage · Scoring **on** · Berlin-/Brandenburg-Aktivierung · relationaler
Quellen-Cutover (Modus-Schalter existiert noch nicht) · Datenlöschungen · Cron-Änderungen ·
KO-Klassifikations-Backfill.

## 9) Nächstes Gate
**„Go Shadow und Tageslimit?"** — danach Phase 5 (setzen+verifizieren, sofern Env-Zugriff
gemäß §5 hergestellt ist), Phase 6 (Shadow-Messung), Phase 7/8 (relationaler Quellenvergleich
+ Cutover-Vorbereitung, eigenes Gate „Go Quellen Cutover?").
