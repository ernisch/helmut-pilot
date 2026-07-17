# Landtag-Megasprint — Phase 1: Verifikation des Istzustands

**Stand:** 2026-07-17 · **Branch:** `claude/helmut-landtag-architecture-tqu3qt` · **Basis:** `dab04a9` (= `origin/main`)
**Verbindliche Grundlage:** `docs/helmut_datenmotor_audit.md` (§12 Landtagsfähigkeit, Fassung 2026-07-16, neueste Version in `main`) + `docs/helmut_datenmotor_umsetzungsplan.md` (P2-Maßnahmen).

Production wurde ausschließlich **lesend (SELECT)** geprüft. Keine Writes, keine Migrationen, keine Flag-, Cron-, Lock- oder Telemetrie-Änderungen.

---

## 1. Auditstand vs. Repository (Code)

Das Audit bezog sich auf Commit `427295c`; HEAD ist `dab04a9` (Merge #95 Thread-2-Härtung + Merge #96 Sprint 1 liegen dazwischen). Alle §12-Befunde wurden gegen den aktuellen Stand nachverifiziert:

| Audit-Befund | Audit-Stelle (alt) | Aktuelle Stelle | Status |
|---|---|---|---|
| Hartes Landesmodul-Gate | `source-mode.js:46-52, 112-116` | `source-mode.js:47-53, 113-117` (Konstanten 36-37) | ✅ bestätigt |
| PARDOK ohne Live-Modus (`items:[]` in jedem Modus) | `pardok-dispatch.js:19, 72, 113` | unverändert `19, 72, 113` (`dispatchMode` 39-42 mappt `on`/`live`→`off`) | ✅ bestätigt |
| Ebenen-Default auto-`Bund` | `scheduler.js:1404-1441`; `server.js:4490-4534, 4621` | `scheduler.js:1546-1583` (Nutzung 1591); `server.js:4596-4626` (blankProfile), `4727` (Save-Fallback), `4704` (function-Fallback) | ✅ bestätigt |
| DIP für jedes Mandat | `scheduler.js:220` | `scheduler.js:247` (nur `DIP_API_KEY`-gated, kein Ebenen-Check) | ✅ bestätigt |
| Bund-Begriffs-Gewichte | `scheduler.js:427, 975, 1145` | `lageCheckSourceWeight` 557-571, `hasGovernmentWork` 1117, `itemPoliticalWeight` 1280-1293, `buildRelevantTerms` 1637 | ✅ bestätigt |
| Matching nur BT-Ausschüsse/Bundesparteien | `matching.js:53-74, 118-126` | `COMMITTEE_SYNONYMS` 55-74, `PARTY_SYNONYMS` 118-126, `POLICY_FIELD_LABELS` 146-155 | ✅ bestätigt |
| Ausschuss-Erwähnung ⇒ Bund-Signal | `classification.js:163-174` | `classification.js:162-178` (`hasBundInst = … || hasCommittee`, 164-165) | ✅ bestätigt |
| `LEVEL_IMPORTANCE` Bund-Vorrang | `scoring.js:97-99` | unverändert 97-99 (bund 0.85 / land 0.55; nur wirksam bei `HELMUT_SCORING_MODE=on`, Default aus) | ✅ bestätigt |
| Lage-/Briefing-Persona Bundestag | — (Audit §12.3 „CODE") | `ai.js:1052, 1060` (Lage), `1152` (KO-Tags), `73, 210, 309, 958-974` (Briefing/Kommunikation), `templates/office/rede.j2:1,15` | ✅ bestätigt, präzisiert |

### Zusätzlich verifizierte Bundestag-Annahmen (über das Audit hinaus)

- `source-mode.js:118-121`: **jeder** `method='api'`-Weg wird pauschal als „DIP-Pfad" ausgeschlossen — eine künftige Landtags-API wäre per Daten nicht aktivierbar.
- `flags.js:31-35`: `FILE_FLAG_ALLOWLIST` enthält nur 3 Schlüssel — ein Landesmodul-Flag über `helmut-flags.json` erfordert eine Allowlist-Erweiterung (Code).
- `crawler.js:884` (`confidenceForSource`): kennt `parliament`/`government`/`parliamentary_group` nicht → amtliche Landtagsquellen bekämen Konfidenz `low`.
- `radarState.js:73-80, 449-467`: Publisher-/Offiziell-Erkennung endet bei `bundestag.de`/`bundesrat.de` — AGH/Landtag-BB würden nie als „Offizielle Quelle" erkannt.
- `lage.js:69`: `prettySourceType` kennt nur `bundestag` als Parlaments-Label.
- `office.js:49-68`: `buildOfficeContext` übergibt den Templates keinerlei Profil-/Parlamentskontext (Rede = immer „Bundestagsrede").
- `dip.js:11, 22, 91`: DIP-Host, Wahlperiode (Default 21) und modul-globaler Cache sind strukturell Bundestag-gebunden.
- `server.js:1157`: Admin-Schnellstart-Felder ohne `politische_ebene`/`bundesland` → neu angelegte Landtagsmandate würden beim ersten Save als Bund persistiert.
- `client.js` (UI-Texte): u. a. 3358/8931 („MdB"-Fallback), 4667 („… · Bundestag"), 6450 („Vorhaben der Bundesregierung"), 336-360 (nur Bundestagswahlkreise) — Anzeige-Schicht, kein Pipeline-Blocker.

## 2. Abweichungen zwischen Audit und verifiziertem Istzustand

> Gemäß Sprint-Auftrag gilt der tatsächlich verifizierte Istzustand. Abweichungen:

1. **„Dreifach-Sperre" ist wirksam eine Zweifach-Sperre plus Konvention.** Das Audit (§12.2-3) führt den Datenzustand `needs_review` + `manual` der 18 BE/BB-Wege als dritte Sperre. Verifiziert: `buildRelationalCrawlPlan` filtert nur `paused`/`archived`/`broken`/`dev_only`; `model.isPathActive` behandelt `manual` wie `auto`. Ein `needs_review`+`manual`-Weg **würde crawlen**, sobald sein Paket `active` ist und das Code-Gate fällt. Technisch sperrend sind heute nur: (1) hartes Code-Gate, (2) Paketstatus `prepared`. Konsequenz für diesen Sprint: Die Gate-Parametrisierung behält den Vollausschluss als Default und verlangt eine **ausdrückliche Freigabe je Bundesland**; der Pfad-Status wird zusätzlich als echte Sperre respektiert (Aktivierungscheckliste).
2. **Zeilennummern verschoben** (Audit @`427295c` → HEAD `dab04a9`): Mapping siehe Tabelle oben; inhaltlich keine Abweichung.
3. **`main-p-james-brown`** existiert als zweiter Mandant (Sprint-1-Provisionierung); das Audit kannte nur cem-ince. Beide Mandate sind `politische_ebene='bundestag'` — keine Auswirkung auf die Landtag-Befunde.
4. **KO-Bestand gewachsen:** 337 `knowledge_objects` (Audit: 314), 6.008 `raw_documents`. Keine BE/BB-Inhalte im Nutzerpfad (Quellen `needs_review`, Gate zu, PARDOK shadow-only).

## 3. Production-Verifikation (nur SELECT, Projekt `ddckuvvpcytqbyfmbvie`)

| Prüfpunkt | Ergebnis | Deckung mit Audit |
|---|---|---|
| `source_packages` | `berlin-basis`/`brandenburg-basis` = **prepared** (is_base, political_level `land`); 5 Bund-Pakete active | ✅ |
| `retrieval_paths` rp-be-*/rp-bb-*/rbb24/MAZ | alle **needs_review + manual**; Parser `pardok-xml` für BE-Plenum (PARDOK) und BB-Plenum (parldok) vorhanden | ✅ |
| `mandate_profiles` | 2 Zeilen, beide `politische_ebene='bundestag'` (cem-ince/Niedersachsen aktiv, james-brown aktiv); **kein** BE/BB-Profil | ✅ |
| `political_entities` BE/BB | 8 Entitäten (2 Parlamente, 2 Regierungen, 2 Landesparteien, 1 Fraktion, 1 Statistikamt); **keine** Landes-Ausschüsse, Senatsverwaltungen/Ministerien einzeln, weitere Fraktionen, Behörden | ✅ |
| `electoral_districts` | **0 Zeilen** (kein einziger Wahlkreis, weder Bund noch Land) | ✅ |
| `geographies` | 50 (1 bund, 16 land inkl. Berlin/Brandenburg, 15 kreis, 12 bezirk, 6 kommune) | ✅ |
| `helmut_store` | `main` = 1,24 MB (Blob-Risiko R1 unverändert), `main-auth`, `main-p-cem-ince`, `main-p-james-brown` | ✅ |
| PARDOK-Ertrag im Nutzerpfad | `raw_documents.source_type`: kein `landesparlament`-Typ; keine PARDOK-Dokumente in Prod-Tabellen | ✅ (Shadow isoliert) |

## 4. Testbaseline (vor jeder Änderung)

`npm run test:offline` → **120/120 Suiten grün** (26 s). Hinweis des Runners: `pardok-shadow-test.js` läuft offline als Egress-gesperrter No-Op (echte Prüfung nur über den manuellen Workflow `pardok-parser.yml`).

## 5. Konsequenz für die Umsetzung (P2-Maßnahmen des Audits)

| P2-Maßnahme | Umsetzung in diesem Sprint |
|---|---|
| P2-1 Landesmodul-Gate parametrisieren | ✅ Code: Gate bleibt Default-zu; Freigabe je Bundesland über neues Flag (Allowlist-Erweiterung), keine Aktivierung |
| P2-2 PARDOK-Live-Modus bauen | ✅ Code: Live-Pfad implementiert, doppelt gegated (Flag + Landesfreigabe), Default aus; Shadow abgeschlossen |
| P2-3 Ebenen-Default entkoppeln | ✅ Code: Defaults leiten sich aus `politische_ebene`/`bundesland` ab; Bundestag-Verhalten unverändert |
| P2-4 BE/BB-Daten aktivieren | ⚠️ NUR vorbereitet: Entitäten/Wahlkreise/Profile als Seeds/Fixtures; **kein** Prod-Write, Status-Flips bleiben Gründer-Freigabe |
| P2-5 Landes-Relevanz-Kataloge | ✅ Code: konfigurierbare Kataloge je Parlament; Bundestag-Gewichte unverändert |
| P2-6 Landtags-Primärquelle | ✅ Code: DIP nur noch für Bundestagsmandate; PARDOK-Wege als Landes-Pendant (inaktiv) |
| P2-7 Scoring scharfschalten | ❌ NICHT in diesem Sprint (Gründer-Freigabe E5); nur `LEVEL_IMPORTANCE` konfigurierbar gemacht |

**Nicht angefasst (Sprint-Verbote):** Merge, Deployment, Migration in Production, Production-Writes, laufende Crawler, Cron-Jobs (`vercel.json`), Locks, Telemetrie, laufender Bundestag-Beobachtungssprint, `helmut-flags.json` (Live-Schaltung), Aktivierung Berlin/Brandenburg.
