# Quellenarchitektur-Migration — Abschlussreife + Production-Freigabepaket

> **ÜBERHOLT (2026-07-14):** Dieser Bericht beschreibt den Stand VOR dem Production-
> Deployment. Das Deployment (PR #75 → `9685a0b`) und die Reiter-Umbenennung (PR #76 →
> `6539fbf`) sind inzwischen AUSGEFÜHRT. Aktuelle Wahrheit: **00-master-status.md**.

Stand: read-only aus Production verifiziert, Feature-Branch vollständig vorbereitet. **Keine**
Production-Änderung/Deployment/Migration/Flag/Cron ausgeführt. Branch:
`claude/helmut-source-architecture-ruhyvb`, Commit `c58ada2` (57 Commits vor `main`).

---

## 1. Behobene Preview-Fehler (diese Runde)
| Bereich | vorher | nachher | Ursache/Fix |
|---|---|---|---|
| Ausschuss-Reiter | 13 (falsch) | **0** (fachlich korrekt) | `ko.ausschuesse` war topic-inferiert (13/13 nannten den Ausschuss nie im Inhalt, kein Ausschussdokument). Neue Regel: voller Ausschussname **wörtlich im Inhalt**. Keine echten A&S-Ausschussvorgänge in den Daten → korrekt leer. |
| Offizielle Quellen | FAZ/Nordkurier/Verbände fälschlich amtlich | nur echte Ämter | `source_type` unzuverlässig (dieselbe Quelle 5 Typen). Amtlichkeit jetzt **domain-basiert** (Herausgeber-Register). 5 official-Artikel, alle bundesregierung/bmas/bundesrat. |
| Neue Dynamiken 7↔6 | „Bug"? | **kein Bug** | Deterministisch je `(Snapshot, now)`; 7-Tage-Fenster gleitet (Vorgang altert am Rand heraus). Als Test gepinnt, keine fixe Zahl. |
| Wahlkreis (Bovenschulte) | 1 (falsch) | **0** | Bundesland/Bund/Europa zählen nicht als Wahlkreisbeleg (bereits Dok. 25). |

Details: Dok. 23–26. Pilot-Radar nach allen Fixes (frozen Snapshot, `now`=2026‑07‑14):
Partei 0 · Wahlkreis 0 · Ausschüsse 0 · Dynamiken 7 · Erwähnungen 0 · Offizielle Quellen 5.

## 2. Phase D — Branch-Konsolidierung
- **Keine** hartcodierten Secrets im Branch-Diff (nur `process.env`-Referenzen).
- **Keine** versehentlich auf „on" gedrehten Flags (nur Doku nennt spätere „scharf"-Zustände).
- **Kein Cutover:** der aktive Crawl nutzt `getSourcesForProfile`→`getSources()` (alter Katalog);
  die neue `retrieval_paths`-Tabelle treibt **keinen** aktiven Crawl. Neue Module (dedup/gate/
  pardok/priority) sind additiv, hinter Default-off-Guards, von den sichtbaren Lesepfaden nicht
  scharf importiert.
- 34 Code-Dateien + 5 Migrationspaare geändert; alle mit Rollback-Datei.

## 3. Phase E — Migrationshistorie (Abweichung dokumentiert, sicher)
Alle 5 Quellenarchitektur-Migrationen sind **funktional angewendet** (verifiziert: Tabellen
`publishers, retrieval_paths, document_findings, gate_shadow_events, geographies,
political_entities` vorhanden; 8 KO-Klassifikationsspalten vorhanden; `raw_documents`
content_fingerprint/canonical_url vorhanden).
- **Abweichung:** `supabase_migrations.schema_migrations` führt 12 Einträge mit **14-stelligen**
  Timestamp-Versionen; die Dateien nutzen **8-stellige** Datumspräfixe (`20260714_…`). Die CLI
  könnte die Dateien daher als „nicht angewendet" ansehen und bei `db push` erneut ausführen.
- **Sicher:** **alle 9** Migrationsdateien sind idempotent (jede mit `IF NOT EXISTS` /
  `DROP … IF EXISTS` / `OR REPLACE`) — eine Doppelanwendung ist ein No-Op. Kein Datenverlust,
  kein Konflikt. Preflight-Test (`scripts/*preflight*`) prüft Idempotenz.
- **Empfehlung (nicht ausgeführt):** die Registry NICHT ohne Freigabe ändern. Vor einem künftigen
  CLI-`db push` die Dateien einmalig auf 14-stellige Versionen umbenennen ODER `supabase migration
  repair` nutzen — beides freigabepflichtig. Bis dahin schützt die Idempotenz.

## 4. Phase F — Preview-Abnahme (manuelle Restcheckliste)
Automatisiert vorab geprüft (offline gegen echte Prod-Daten reproduziert): V3-Read-Pfad, Radar-
Belegregeln, Quellen-Kennzeichnung, Determinismus, Profilauflösung (Blob==mandate_profiles),
Tenant (1 Profil), keine Runtime-Fehler in den reinen Modulen. **Vercel-SSO verhindert eine
vollständige automatisierte Browser-Prüfung** — bitte manuell im Branch-Preview (Commit `c58ada2`):
1. Login + Profil des Pilotmandanten wird erkannt.
2. **Lage / Radar / Helmut / Büro** laden Inhalte (nicht leer).
3. **Radar › Dein Umfeld:** Partei leer, Wahlkreis leer, **Ausschüsse leer** (kein BMAS-/
   Koalitions-/kommunaler Treffer mehr).
4. **Radar › Neue Dynamiken:** Vorgänge vorhanden (Zahl ~7, zeit­fensterabhängig).
5. **Radar-Filter „Offizielle Quellen":** nur Bundestag/Bundesregierung/Ministerien/Behörden —
   **keine** FAZ/Nordkurier/Berliner Zeitung/verbaende.com.
6. Admin / Watchdog / Kostenanzeige rendern ohne Browser-Fehler.
Keine Production-Freigabe, bis diese 6 Punkte grün bestätigt sind.

## 5. Phase G — Nutzerergebnisse Preview vs. Production
Production läuft `main` (alte Radar-Logik, zeigt die falschen 13 Ausschuss-/1 Wahlkreis-Treffer);
Preview läuft der Branch (korrigiert). **Erwartete, begründete** Abweichungen für den Pilotmandanten:
- Ausschüsse 13→0, Wahlkreis 1→0, „Offizielle Quellen" bereinigt = **Qualitätsgewinn** (Entfernen
  falscher Treffer), **keine** Versorgungsverschlechterung an echten Signalen.
- Partei (0), Dynamiken (7), Lage/Helmut/Büro, Briefings, Decisions, KOs, Datenfrische, Quellenzahl,
  Ranking: **unverändert** (offline verifiziert; die Fixes berühren nur die Radar-Belegregeln + die
  Quellen-Kennzeichnung, nicht Scoring/Ranking/Dynamik-Zählung).

## 6. Phase H — Understanding-Kosten + Tageslimit (Realdaten, 14 Tage)
Quelle: Blob-Kostenlog `helmut_store['main-auth'].llmUsage` (die App schreibt real dorthin; die
vorbereitete `llm_usage`-Tabelle ist noch leer).
- Understanding ausgeführt: **201/14T ≈ 14,4/Tag** · durch Deckel blockiert
  (`skipped-understanding-budget`): **1088** (~78/Tag) · Ø Kosten **$0,002/Call**.
- Übrige Billable-Calls: communicationDraft 175, koTagsBackfill 161, helmutAssessment 25,
  v2ScoreAndPrioritize 26, lageBriefing 4 → **~28/Tag**. Der globale Deckel zählt **alle** Billable.
- `HELMUT_MAX_LLM_CALLS_PER_DAY` ist über MCP nicht direkt lesbar; die 1088 Skips belegen einen
  aktiven, endlichen, sehr niedrigen Deckel. **Dashboard-Prüfanweisung:** Vercel → Project
  `helmut-pilot` → Settings → Environment Variables → Wert von `HELMUT_MAX_LLM_CALLS_PER_DAY`.
- Kosten-Hochrechnung (nur Understanding): 50/Tag ≈ **$3/Mo** · 100/Tag ≈ **$6/Mo** · 150/Tag ≈ **$9/Mo**.
- **Empfehlung (Übergangsphase):** Ziel ~100 Understanding/Tag; da der Deckel alle Billable zählt,
  globalen Wert auf **~150** (100 Understanding + ~50 Headroom). Kosten ~$8/Mo gesamt. Langfristig:
  Relevanzpriorisierung (`understanding-priority.js`) + echtes Tageskostenlimit. **Nicht geändert.**

## 7. Phase I — Understanding-Gate
`gateMode` default **off** (byte-identisch: Integrationstest off/shadow/on = 3/3/3
Understanding-Calls); shadow protokolliert nur; on bleibt bewusst nicht scharf (freigabepflichtig).
Amtliche Dokumente nie geparkt, regionale Politik nicht benachteiligt, Unsicheres zurückgestellt
(Dok. 20/21). Alle Gate-Tests grün. **Keine Flags geändert.**

## 8. Phase J — PARDOK + Landesquellen
`HELMUT_PARDOK_DISPATCH` default **off** + harte Invariante `pardokDispatch()→{items:[]}` in
JEDEM Modus (konstruktionsbedingt inert). PARDOK-Parser stabil (Tests grün). **0** aktive
Berlin/Brandenburg-Abrufwege (healthy+auto); BE/BB-Wege `needs_review`/`manual`, Pakete `prepared`.
Kein `structured_download` aktiv. **Kein Cutover.**

## 9. Phase K — Testsuite
**70 von 71** Test-Suiten grün (nach dem Fix `splash-boot`). Der einzige rote (`smoke-test`) ist
ein **Integrationstest gegen die Live-URL** `helmut-pilot.vercel.app` und im Sandbox-Netz nicht
lauffähig (kein Code-Fehler, keine Regression). Radar/Matching/Lage/Helmut/Contract/Profile/Gate/
PARDOK/Tenant/Security/Watchdog/Kosten-Suiten alle grün.

## 10. Adversarialer Abschlusscheck (Ergebnis)
| Angriff | Ergebnis |
|---|---|
| Preview leer trotz Profil | widerlegt (V3-Read füllt, `20260714`-Spalten vorhanden) |
| fehlende DB-Spalte / falsche Migrationsreihenfolge | widerlegt (alle Tabellen/Spalten vorhanden) |
| doppelte Migration | ungefährlich (alle 9 idempotent) |
| doppelte Quellen / doppelte KOs / doppelte Crawls | 0 doppelte vorgang_id; kein Cutover→kein Doppel-Crawl |
| falsche Ausschüsse / Wahlkreis / Partei | behoben + als Tests gepinnt |
| Medien als offizielle Quelle | behoben (domain-basiert) |
| Shadow-Daten im Nutzerpfad / Gate blockiert im Shadow | widerlegt (gate off; shadow nur Telemetrie) |
| PARDOK/Berlin/Brandenburg versehentlich aktiv | widerlegt (default off + inert; 0 aktive Landeswege) |
| Tagesdeckel versehentlich verändert | nicht angefasst |
| Pilotmandant verliert echte Vorgänge | nein (nur falsche Treffer entfernt; Ranking/Dynamik unverändert) |
| App-Start langsamer | neue Requires sind reine Daten/Logik (seeds/config), kein Netz/DB beim Laden |
| Tenant-Leck | widerlegt (1 Profil, RLS service_role-only) |
| Rollback scheitert | jede Migration hat `*_rollback.sql` (idempotent) |

## 11. Phase L — Production-Deployment-Paket (vorbereitet, NICHT ausgeführt)
- **Branch/Commit:** `claude/helmut-source-architecture-ruhyvb` @ `c58ada2`.
- **Änderungen ggü. main:** Radar-Belegregeln + Quellen-Kennzeichnung + zentrale Normalisierung
  (Partei/Ausschuss) + additive Quellenarchitektur-Module (inert hinter Default-off) + Doku/Tests.
- **Bereits angewendete Migrationen (nicht erneut anwenden):** alle 5 Paare (source_architecture,
  ko_classification, dedup_findings, gate_shadow_telemetry, llm_usage_source_attribution).
- **Flags, die VOR Deploy geprüft werden (müssen off/unverändert bleiben):**
  `HELMUT_UNDERSTANDING_GATE`=off · `HELMUT_PARDOK_DISPATCH`=off · `HELMUT_MAX_LLM_CALLS_PER_DAY`
  unverändert · kein neuer Cron · keine Quellen-/Paketaktivierung.
- **Smoke-Tests direkt nach Deploy:** `/api/app/start` liefert KOs; Radar zeigt Partei/Wahlkreis/
  Ausschüsse leer, Dynamiken gefüllt, „Offizielle Quellen" nur amtlich; keine Runtime-Fehler.
- **Stop-Bedingungen:** leerer Radar trotz Daten · 42703 undefined_column · Anstieg Runtime-Fehler ·
  veränderte Dynamik-/Decision-Zahlen ggü. Preview.
- **Rollback:** Vercel-Deployment auf den vorherigen `main`-Commit zurücksetzen (Code-only; die
  additiven DB-Spalten/Tabellen bleiben, sind aber von `main` nicht referenziert → inert).
- **Dauer:** ~2–3 min Build+Deploy. **Kosten:** keine (reine Lesepfad-/Radar-Änderung).
- **Verbindlich off:** Gate on · Cheap-Triage · Berlin/Brandenburg · PARDOK-Dispatch · sichtbares
  neues Scoring · sichtbarer Cutover.

## 12. Phase M — Shadow-Betrieb-Paket (spätere, getrennte Stufe, NICHT aktivieren)
- Gate `shadow` (nur Telemetrie in `gate_shadow_events`, blockiert nichts) · PARDOK `shadow` (inert,
  schreibt Shadow-Store) · 1–2 Wochen Messzeitraum → Triage-Ablehnungsrate + kritische Fehler messen.
- Danach getrennt: Understanding-Tageslimit ~150 + echtes Tageskostenlimit.
- Stop-Bedingungen: jede sichtbare Nutzerwirkung, jeder kritische Gate-Fehler. Rollback: Flag auf
  off / Telemetrie-Tabelle via `*_rollback.sql` droppen.

---

## 13. EINZIGE finale Freigabeanfrage — in einzeln freigebbare Stufen getrennt
Alle DB-Migrationen sind **bereits** angewendet; es steht **kein** neuer Migrationsschritt an. Die
folgenden Stufen sind einzeln freigebbar; **nichts** davon ist ausgeführt:

**Stufe 1 — Production-Deployment (Code, alle Guards off).** Exakte Änderung: Vercel-Deploy von
`c58ada2` nach `main`. Nutzen: die korrigierten Radar-Belegregeln + Quellen-Kennzeichnung werden für
den Pilotmandanten sichtbar (Ausschüsse/Wahlkreis/Offizielle Quellen korrekt). Risiko: gering (reine Lesepfad-
Änderung, 70/71 Tests grün, offline gegen Realdaten verifiziert). Kostenlimit: keine Zusatzkosten.
Smoke-Tests: §11. Stop: §11. Rollback: Deploy auf vorherigen main-Commit.

**Stufe 2 — Gate-Shadow-Flag.** `HELMUT_UNDERSTANDING_GATE=shadow`. Nutzen: Telemetrie zur Triage-
Ablehnungsrate ohne Nutzerwirkung. Risiko: sehr gering (blockiert nichts). Kosten: keine. Stop: jede
Nutzerwirkung. Rollback: Flag→off.

**Stufe 3 — PARDOK-Shadow-Flag.** `HELMUT_PARDOK_DISPATCH=shadow`. Nutzen: amtliche Drucksachen
probeweise verarbeiten (Shadow-Store), 0 Items in die Pipeline. Risiko: sehr gering (inert). Kosten:
keine. Stop/Rollback: Flag→off.

**Stufe 4 — Understanding-Tageslimit.** `HELMUT_MAX_LLM_CALLS_PER_DAY` → **~150**. Nutzen: ~100
Understanding/Tag statt ~15 (deckt die reale Nachfrage), keine Ankunftszeit-Verdrängung amtlicher
Vorgänge. Risiko: gering; Kostenlimit: **~$8/Monat** gesamt. Stop: Kostenanstieg über Erwartung.
Rollback: alten Wert zurücksetzen.

**Stufe 5 — Shadow-Messzeitraum (1–2 Wochen).** Nach Stufe 2/3: Telemetrie auswerten
(Triage-Ablehnungsrate, kritische Fehler, Fairness). Keine Änderung, nur Messung.

**Stufe 6 — spätere Gate-Aktivierung (`on`, scharf).** Erst nach positivem Shadow-Ergebnis, eigene
Freigabe. Cheap-Triage separat.

**Stufe 7 — spätere Landesquellen-Aktivierung (Berlin/Brandenburg).** Erst nach technischer
Quellen-Verifikation, eigene Freigabe.

Bis zur Freigabe bleibt **alles** off/unverändert; kein sichtbarer Cutover.
