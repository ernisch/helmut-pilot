# ARCHITECTURE — Systemkarte Helmut

**Letzte Aktualisierung:** 2026-07-28 (§7d ergänzt: Matching-Auditpersistenz,
Roadmap-Punkt 23; Migrationsstand nach Production-Anwendung von
`20260728_matching_audit` nachgezogen) · **verankert auf `main` @ `b1d450c`**

> **Zweck:** Orientierung, welche Datei für welche Aufgabe zuständig ist. **Keine**
> Erklärung jeder Datei. Diese Datei wird nur aktualisiert, wenn sich die Architektur
> **tatsächlich** ändert — nicht bei jedem Sprint.
>
> **Verbindlich bei Widerspruch:** Sicherheit/Mandantentrennung →
> [`quellenarchitektur/05-sicherheitsmodell-rls.md`](quellenarchitektur/05-sicherheitsmodell-rls.md) ·
> Quellenmodell → [`quellenarchitektur/02-zielarchitektur.md`](quellenarchitektur/02-zielarchitektur.md) ·
> Status → [`CURRENT_STATE.md`](CURRENT_STATE.md).

---

## 1 · Zentrale Komponenten

| Komponente | Datei | Größe | Rolle |
|---|---|---|---|
| HTTP-Server + alle Routen | `server.js` | ~6.700 Z. | Node-`http`-Server, ohne Framework; rendert auch die SPA-Shell (`indexHtml()`) und die servergerenderten Auth-Seiten |
| Vercel-Einstieg | `api/index.js` | 1 Z. | reiner `require("../server")` |
| SPA-Client | `client.js` | ~13.000 Z. | Vanilla-JS Single-Page-App, `innerHTML`-Rendering, eine `render…View()`-Funktion je Bereich |
| Styles | `styles.css` | ~12.000 Z. | CSS-Variablen-Tokens in `:root`, Light-Mode-Overrides unter `:root[data-theme="light"]` |
| Persistenz | `lib/helmut/storage.js` | ~5.000 Z. | **einziger** DB-Zugriffspfad (Supabase/PostgREST + Blob-Store) |
| Fachlogik | `lib/helmut/*.js` | ~50 Module | Crawler, Understanding, Lage, Radar, Büro, Budget, Auth, Provisionierung |
| Quellenarchitektur | `lib/helmut/quellenarchitektur/*.js` | — | relationales Quellenmodell, Seeds, Gate, PARDOK |
| Service Worker | `sw.js` | — | stale-while-revalidate für Assets |

**Wichtig:** `server.js`, `client.js` und `styles.css` sind sehr groß. Immer gezielt
suchen (`Grep`) und **abschnittsweise** lesen — nie vollständig öffnen.

## 2 · Datenfluss

```
Vercel Cron ──► /api/cron/crawl ──► scheduler.runSourceCrawl
                                      │  Quellenplan (relational, SOURCE_MODE=on)
                                      ▼
                                    crawler.js ──► raw_documents
                                      │
                                      ▼
              /api/cron/understanding ──► understanding.js (LLM, budget-gated, gelockt)
                                      │
                                      ▼
                                  knowledge_objects (+ document_findings)
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
   matching/decisions            radarState.js                  lage.js
        │                             │                             │
        └──────────► /api/app/start ──┴──► client.js (Heute · Lage · Radar · Büro)
```

Ergänzend: `/api/cron/morning-briefing` und `/api/cron/lage-briefing` erzeugen das
Briefing, `/api/cron/health-report` den Betriebsbericht (Watchdog + Alarmpfad).

## 3 · Quellenarchitektur

Drei sauber getrennte Ebenen (Details:
[`quellenarchitektur/02-zielarchitektur.md`](quellenarchitektur/02-zielarchitektur.md)):

- **Herausgeber** (`publishers`) — wer veröffentlicht; einmal je Domain; trägt eine
  Belegfunktion (`official_primary`, `direct_interest`, `journalistic`,
  `data_source`, `aggregator`).
- **Abrufweg** (`retrieval_paths`) — wie abgerufen wird (RSS, API, HTML, Google News);
  mit Status und Aktivierungsmodus.
- **Paket** (`packages`) — wofür gebündelt wird; Profile bekommen Pakete über den
  Resolver, nicht einzelne Quellen.

**Landesmodule** (Berlin, Brandenburg) sind im Crawl-Plan gesperrt, bis ihr Land in
`HELMUT_LANDESMODULE` ausdrücklich genannt ist — **je Land getrennt**, Default leer,
fail-closed (kein Sammel-Schlüsselwort). Zusätzlich gilt: ein Abrufweg mit
`activation_mode='manual'` wird nie automatisch abgerufen. Beide Regeln stehen im
ausführenden Plan (`source-mode.buildRelationalCrawlPlan`), nicht in `model.isPathActive`.
Runbook: [`betrieb/berlin-aktivierung.md`](betrieb/berlin-aktivierung.md).

`HELMUT_SOURCE_MODE=on`: die relationale DB ist die aktive Wahrheit. Der hartkodierte
Katalog `lib/helmut/sources.js` ist **nur noch Fallback** (Ladefehler/leerer Plan).
Personenbezogene Quellen stehen **nicht** im geteilten Katalog, sondern entstehen zur
Laufzeit aus dem Profil (`scheduler.personNewsSource`, id `<mandats-id>-news`).

**Betriebssicht auf dieselben Daten** (abgeleitet, ohne eigene Speicherung):
`quellenarchitektur/paket-inventur.js` führt Bestand, Crawl-Plan, Referenzzählung und die
Punkt-16-Störungserkennung zu **einer Zeile je Paket** zusammen und leitet daraus genau
einen Zustand ab (gesund · eingeschränkt · ausgefallen · inaktiv · unbekannt). Ausführbar
über `scripts/paket-inventur.js`, sichtbar im Admin unter „Quellen & Watchdog". Kanonisch:
[`quellenarchitektur/30-paket-inventur-production.md`](quellenarchitektur/30-paket-inventur-production.md).

## 4 · Mandantenmodell

- Ein Mandant = ein Mandat = `politicianId` (= `user_id` in allen Tabellen).
- **Kein Mandant ist hartkodiert**, keiner ist Default oder Fallback (PR #97). Crons
  laufen über alle aktiven DB-Mandate, je Mandant isoliert.
- Cache-Schlüssel tragen die Mandanten-ID (`bf-<userId>-…`, `office-<user>-…`).
- Profile liegen relational (`mandate_profiles`, Exklusivmodus seit PR #113);
  Konten/Sessions liegen im Blob `main-auth` (dokumentierte Restlücke, → OP-03).
- Provisionierung/Teardown: `lib/helmut/provisioning.js`,
  Runbook [`betrieb/zweitmandant-provisionierung-runbook.md`](betrieb/zweitmandant-provisionierung-runbook.md).

## 5 · Authentifizierung

- `HELMUT_AUTH_MODE=accounts` schaltet den Kontomodus (`lib/helmut/auth.js`,
  `lib/helmut/accounts.js`). Identität wird **ausschließlich serverseitig** aus dem
  Session-Cookie `helmut_session` aufgelöst; `pickPoliticianId` validiert gegen die
  Session — eine `user_id` aus dem Request wird nie übernommen.
- Rollen-Gate je Route: `requireRoleOr403(…, "admin")`.
- Globaler CSRF-Guard: HMAC-Token via `GET /api/security/csrf`, Header `X-CSRF-Token`.
- Getrennt davon: Pilot-Zugang über `POST /api/pilot/unlock` (Cookie `helmut_pilot`,
  `PILOT_SECRET`).
- Servergerenderte Seiten ohne SPA: `/passwort-setzen` (muss vor jeder Session laden).

## 6 · Datenbank

- **Supabase (Postgres + PostgREST)**, Zugriff ausschließlich über
  `storage.supabaseRequest` mit `SUPABASE_SERVICE_ROLE_KEY`.
- `service_role` hat **BYPASSRLS** → die vorhandenen 23 RLS-Policies sind angewendet,
  aber **funktional inert**. Durchsetzend sind `assertTenant`/`assertTenantRows`
  (`storage.js`) plus ein verpflichtender `user_id=eq.<tenant>`-Filter.
- Zwei Speicherformen nebeneinander: relationale Tabellen **und** ein zentraler
  JSON-Blob (`helmut_store`, Zeilen `main`, `main-auth`, `main-p-<id>`).
  Der Blob ist **Last-Write-Wins** — dort ist das Verlustrisiko (→ OP-01).
  **Belegt am 2026-07-27 (Befund W-2):** parallele Auth-Store-Writer überschreiben
  einander die Prozess-Lauftelemetrie (`processRuns`). Deshalb ist die
  **kanonische Lauftelemetrie seit 2026-07-27 relational**: `public.process_runs`,
  atomarer Upsert je `(run_id, process)` (Migration angewendet 14:03 UTC,
  `HELMUT_PROCESS_RUNS_RELATIONAL=on` seit 14:23 UTC). Der Blob wird als
  Spiegel weitergeschrieben (idempotent, Fehler sichtbar), gelesen wird **dual**
  — relational hat Vorrang, der Blob-Altbestand bleibt ohne Datenmigration
  lesbar (`betrieb/befund-werkzeug-haertung-w1-w2.md` §14/§15).
- Lebenszyklus-Lesepfade (`listRawDocuments`, `listRecentRawDocuments`,
  `listKoDocumentLinks`, `listKnowledgeObjectStates`) werfen bei technischen
  Fehlern einen typisierten `StorageReadError` (Quelle + Fehlerklasse) statt
  still `[]`/Teilmengen zu liefern (Befund W-1). `[]` heißt ausschließlich
  „erfolgreich gelesen, null Zeilen".
- Migrationen: `supabase/migrations/`. **Jede Migration hat eine
  `…_rollback.sql`-Datei.** Nicht angewandt: **nur noch `20260720`**
  (`20260727` angewendet am 2026-07-27; `20260728_embedding_shadow` angewendet am
  2026-07-28; `20260728_matching_audit` (Sprint 23B-1) angewendet am 2026-07-28,
  20:20:57 UTC, Rollout-Grenze `HELMUT_MATCHING_AUDIT` seit 2026-07-28, ~20:55 UTC
  **in Production aktiv**;
  `20260721` bereits seit 2026-07-16 — die frühere Angabe war falsch
  und ist in Production gegengeprüft).

## 7 · Crawler und Verarbeitung

| Schritt | Modul |
|---|---|
| Plan bauen (relational vs. Katalog) | `quellenarchitektur/source-mode.js` |
| Abruf, Feed-Parsing, Retry | `crawler.js`, `google-news-hardening.js` |
| Lauf-Orchestrierung, Locks, Telemetrie | `scheduler.js`, `source-telemetry.js`, `crawl-run-state.js` |
| Dedup + Fundstellen | `dedup.js`, `quellenarchitektur/dedup-global.js` |
| **Vorgangsidentität (Anker, Cluster, Kennung)** | `vorgang-identity.js` |
| **Herausgebererkennung (Herkunft ≠ Beleg)** | `herausgeber.js` |
| Verstehen (LLM) | `understanding.js`, `quellenarchitektur/understanding-gate.js`, `ai.js` |
| **Endzustand je Rohdokument + Watchdog** | `vorgangs-lebenszyklus.js` |
| Kostendeckel (fail-closed) | `llm-budget.js` |
| Amtliche Vorgänge | `dip.js`, `quellenarchitektur/pardok-parser.js`, `pardok-dispatch.js` |

Alle Läufe sind über **atomare, fail-closed Locks** (`pipeline_locks`) gegen
Doppelstart geschützt. Ein bewusster Doppelstart in Production ist **verboten**.

### 7a · Vorgangsidentität (seit 2026-07-26, Betriebsbefund B4)

**Fachliche Identität und technische Eindeutigkeit sind getrennt.** Vorher war die
`vorgang_id` beides zugleich — ein einzelnes Titelwort, das gleichzeitig das Thema
benannte *und* als Idempotenzschlüssel diente. Traf dieses Wort einen älteren,
fachfremden Vorgang, galt ein neues Ereignis als „schon verstanden" und
verschwand ohne Spur ([`befund-csd-2026-vorgangsverlust.md`](befund-csd-2026-vorgangsverlust.md)).

| Baustein | Wo | Regel |
|---|---|---|
| **Kennung** `vg-<themenwurzel>-<ereignistag>-<prüfsumme>` | `vorgang-identity.js` | Ein **Vorschlag**, kein Urteil. Drei unabhängige Bestandteile → zwei verschiedene Ereignisse treffen sich praktisch nie |
| **Zugehörigkeit** | `understanding.js` → `resolveVorgang()` | Entscheidet am **Beleg** gegen Kandidaten unter den Themenwurzel-Präfixen — nicht am Zeichenkettenvergleich |
| **Vergleichsmaßstab** (seit 2026-07-27) | `vorgang-identity.js` → `sameVorgang()` | **Kern gegen Kern**, nicht Dokument gegen Dokument. Der Kern eines Vorgangs sind die Anker, die mindestens die Hälfte seiner Dokumente teilen. **Ein Vorgang ohne Kern nimmt nichts mehr auf** — damit kann ein thematisch gemischter Vorgang nicht weiter wachsen (Betriebsbefund B4-2). Zweiter, unabhängiger Riegel: ≥ 60 Dokumente = keine Aufnahme mehr |
| **Herkunft ist kein Beleg** (seit 2026-07-27) | `herausgeber.js` → `titelRumpf()`, `istHerausgeberAnker()` | Ein **Herausgebername** darf niemals Identität stiften. Zwei unabhängige Riegel: (1) strukturell — der **belegte** Titelsuffix (`… - Tagesspiegel`) wird vor der Ankerbildung entfernt, belegt durch die Herausgeberangaben **desselben** Dokuments oder eine erkennbare Herausgeberform; (2) aufgezählt — Medien-, Agentur-, Plattform- und Verlagsgattungsnamen sind überall nicht-spezifisch. Blindes Abschneiden des letzten Titelsegments wäre falsch (Dachzeilen), deshalb die Belegpflicht (Betriebsbefund B4-4) |
| **Altkennungen** | dasselbe Präfix | `vg-<wurzel>` fällt exakt auf das Präfix und wird **fortgeschrieben**, nicht dupliziert. Deshalb keine Migration |
| **Verknüpfungsinvariante** | `ko_document_links` | Jeder Ausgang, der einen Vorgang gefunden oder gebildet hat, schreibt die Verknüpfung. Damit ist der Endzustand jedes Rohdokuments **ableitbar** — ohne neue Tabelle |

Ein Vorgang bildet **genau ein politisches Ereignis** ab. Ob er das noch tut, ist
messbar: seine Dokumente erneut clustern. Ein echter Vorgang bleibt **ein** Cluster
(Kohärenz ≥ 0,67 gemessen), ein „Magnet" zerfällt in viele (≤ 0,55). Diagnose:
`scripts/vorgangs-magnet-analyse.js` (rein lesend, bereinigt nichts).

Eine gleiche Kennung bedeutet **nie** „ignoriere das neue Rohdokument". Die
Ergebnisklassen sind `saved` · `updated` · `merged` · `duplicate` ·
`skipped-terminal` · `skipped-failed` · `skipped-budget` · `skipped-error` ·
`skipped-invalid` · `skipped-store`. Ein pauschales `skipped-exists` gibt es
nicht mehr.

### 7b · Politische Ebene: einmal ermitteln, dauerhaft wiederverwenden (seit 2026-07-27)

**Die politische Entscheidungsebene eines Vorgangs ist ein gespeicherter Zustand,
kein Rechenergebnis je Lauf.** Vorher leitete *jede* Assemblierung sie vollständig
neu ab — auch die Aktualisierung eines bereits verstandenen Vorgangs, die den
gespeicherten Wert nicht einmal las. Ein einmal belegt als `bund` erkannter Vorgang
konnte dadurch auf `unknown` zurückfallen, sobald die neue Dokumentmenge kein
Institutionssignal mehr trug.

| Baustein | Wo | Regel |
|---|---|---|
| **Gedächtnis** | `quellenarchitektur/ebenen-gedaechtnis.js` → `entscheideEbene()` | Rein und deterministisch. Ist eine Ebene ermittelt, wird sie **wiederverwendet**; neu berechnet wird nur, was noch nicht ermittelt ist |
| **Fail closed** | dieselbe Funktion | Eine ermittelte Ebene wird **nie** durch `unknown` ersetzt. `unknown` ist keine Ebene, sondern die ehrliche Aussage „nicht ermittelt" |
| **Monotonie** | Herkunftsrang `deriver` < `ki` | Nur eine **höherwertige** Herkunft darf eine ermittelte Ebene ersetzen. Damit ändert sich die Ebene höchstens **einmal** und flackert nie zwischen zwei Läufen |
| **Nachweis im Datensatz** | `classification_confidence` (jsonb) | `level_quelle` · `level_ermittelt_am` · `level_wiederverwendet`. **Keine neue Spalte, keine Migration** — Alt-Zeilen ohne diese Schlüssel gelten als Herkunft `deriver` |
| **Bestandszugang** | `storage.listKnowledgeObjectsByVorgangPrefix()` | Die Kandidatenprojektion liest `decision_level`/`political_level`/`classification_confidence` mit; ohne sie hätte der häufigste Aktualisierungspfad nichts zum Wiederverwenden |
| **Ehrliche Abdeckung** | `storage.getClassificationCoverage()` | Gezählt wird die **ermittelte** Ebene (ohne `unknown`). `decision_level` ist seit Sprint 2 nie `null`, die alte Zählung `not.is.null` meldete deshalb strukturell ~100 % — falsches Grün |

Kostenwirkung: **null zusätzliche KI-Aufrufe**. Der Deriver ist rein regelbasiert;
gespart wird nicht Rechenzeit, sondern die bereits bezahlte Ermittlung, die vorher
bei jeder Aktualisierung verworfen wurde.

### 7c · Geografie: eine eigene Frage, nicht die Kehrseite der Ebene (seit 2026-07-27)

**Die politische Ebene beantwortet, WER entscheidet. Die Geografie beantwortet, WO
es wirkt. Beides ist getrennt.** Ein Vorgang darf die Ebene `land` tragen und
geografisch unbekannt bleiben. Vorher erzeugte `classification.deriveAffected­Geographies(level, …)`
die betroffene Geografie **ausschließlich aus der Ebene**: `bund` → Deutschland,
`eu` → Europäische Union, `land` ohne erkanntes Bundesland → **ebenfalls
Deutschland**; eine bloße Ortsnennung galt als Betroffenheit, und mehr als eine
Region war strukturell ausgeschlossen.

**Drei fachliche Bedeutungen auf den vorhandenen Strukturen** — keine neue Tabelle,
keine neue Spalte, keine zweite Geografiestruktur:

| Bedeutung | Wo gespeichert | Regel |
|---|---|---|
| **betroffene** Geografie | `knowledge_objects.affected_geographies` (jsonb[]) | Nur aus Nachweisen. Mehrere Regionen sind zulässig |
| **erwähnte** Geografie | `knowledge_objects.mentioned_geographies` (jsonb[]) | Nennung im Text. Wird **nie** zur Betroffenheit befördert |
| **Quellen**geografie | bleibt kanonisch am Abrufweg (`source_packages.geography_id` / `path_expected_geographies`); am Vorgang nur als **Indiz** in `classification_confidence.geography_indizien` | Strukturell davon ausgeschlossen, eine betroffene Geografie zu werden |

| Baustein | Wo | Regel |
|---|---|---|
| **Gedächtnis** | `quellenarchitektur/geografie-gedaechtnis.js` → `entscheideGeografien()` | Rein und deterministisch. Der Resolver **kennt `decision_level` nicht** — aus der Ebene kann damit keine Geografie entstehen |
| **Herkunftsrang** | `parser` > `amtlich` > `inhalt` > `ki` > `erwaehnung` > `quelle` | Nur eine **höherwertige** Herkunft darf eine gespeicherte Region ersetzen; gleich starke Nachweise werden **vereinigt** (mehrere betroffene Regionen) |
| **Fail closed** | dieselbe Funktion | Eine ermittelte Region wird **nie** durch leer/unbekannt ersetzt |
| **Inhaltlicher Nachweis** | `classification.geografieAusInstitutionsnennung()` (strukturierte Felder) + `.geografienAusText()` (Fließtext) | Nur **subnationale** Entscheidungskörper stiften Geografie. **Bundesinstitutionen ausdrücklich nicht** — sonst wäre es wieder die Ableitung aus der Ebene |
| **Zweite Schranke** | `classification.bezeichnungNenntGeografie()` | Die gefundene **Bezeichnung** muss die Region selbst nennen: „Abgeordnetenhaus von Berlin" ✓, „Berliner Senat" ✓, „Landtag Brandenburg" ✓ — ein regionloses „Senatskanzlei" ✗. Ohne sie verschöbe ein an Berlin gebundener Alias eine Hamburger Meldung nach Berlin (erfundene Zuordnung) |
| **Nachweis im Datensatz** | `classification_confidence` (jsonb) | `geography_quelle` · `geography_ermittelt_am` · `geography_wiederverwendet` · `geography_indizien`; je Eintrag zusätzlich `herkunft`. Alt-Zeilen ohne Herkunft gelten als `bestand-alt` |
| **Bestandszugang** | `storage.listKnowledgeObjectsByVorgangPrefix()` | Liest zusätzlich `affected_geographies`/`mentioned_geographies`; ohne sie könnte der häufigste Aktualisierungspfad nichts wiederverwenden |
| **Ehrliche Abdeckung** | `storage.getClassificationCoverage()` | `affectedGeographyCoverage` zählt die **nicht-leere** Zuordnung (`neq.[]`); die Spalte hat Default `'[]'` und ist nie `null` |
| **Trennung im Matching** | `geografie-gedaechtnis.betroffeneRegionen()` / `.erwaehnteRegionen()` | Lesehilfen. Gewichtungen und Scoring bleiben **unverändert** |

Kostenwirkung: **null zusätzliche KI-Aufrufe**. `affected_geographies` steht seit
Sprint 2 im Antwortschema des ohnehin stattfindenden Understanding-Calls und wurde
bisher schlicht verworfen.

### 7d · Matching: Ergebnis und Herleitung sind getrennt (seit 2026-07-28, Roadmap-Punkt 23)

**Ein Matching-Ergebnis beantwortet „was gilt jetzt". Ein Matching-Lauf beantwortet
„wie kam es dazu". Beides steht in getrennten Tabellen.** Vorher gab es nur die
erste Frage: `matching_results` wurde bei jedem Lauf überschrieben, ohne Lauf-ID,
ohne Profil- oder Vorgangsstand, ohne Rezeptversion und ohne Berechnungszeitpunkt —
ein Ergebnis von gestern war weder erklärbar noch reproduzierbar
([`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md)).

| Baustein | Wo | Regel |
|---|---|---|
| **Operative Projektion** | `matching_results` | Unverändert der einzige Lesepfad des Produkts (`lage.js`). Bestehende Spalten, Kennung `mr-<mandant>-<vorgang>` und Schreibpfad sind **nicht** angetastet; ergänzt sind nur additive Auditspalten. Aus der Trefferliste gefallene Zeilen werden `aktuell=false` statt gelöscht |
| **Auditprotokoll** | `matching_runs` (neu) | Eine Zeile je **verändertem** Lauf, append-only. Nach `status='vollstaendig'` **fachlich unveränderlich** (Trigger `helmut_matching_run_immutable`). Von keinem Produktpfad gelesen |
| **Drei Versionsachsen** | `engine_version` · `rezept_version` · `vektor_version` | WER gerechnet hat · NACH WELCHER Regel · MIT WELCHER Vektordarstellung. Getrennt, damit ein späterer Algorithmuswechsel alte Ergebnisse nicht überschreibt und nicht mit ihnen verwechselt werden kann |
| **Datenvertrag** | `matching-contract.js` | Rein: kanonische Serialisierung, Eingabehash je Wissensobjekt, **Eingabefingerabdruck**, deterministische Rangliste. Kennt kein Matching-Verfahren |
| **Audit-Schnittstelle** | `matching-audit.js` | **Algorithmusunabhängig.** Nimmt eine fachliche Laufbeschreibung entgegen und erledigt Sperre, Idempotenz, Laufzeile, Veröffentlichung, Fehlerzustand. Eine künftige Matching-Engine benutzt dieselbe Schnittstelle |
| **Begründung** | `matching-begruendung.js` | Deterministisch, **ohne KI**, höchstens zwei Gründe, feste Priorität (Ausschuss → Thema → Wahlkreis → Partei). **Ohne Beleg kein Satz** (`null`). Wird gespeichert, aber noch nicht angezeigt |
| **Idempotenz** | Eingabefingerabdruck + Teilindex | Identischer fachlicher Eingang → **keine** neue Generation, **0** Schreibvorgänge auf der Projektion, genau **1** UPDATE am Lauf. Datenbankseitig erzwungen (`where status='vollstaendig'`) |
| **Atomizität** | `helmut_publish_matching_run` (`SECURITY INVOKER`) | Laufabschluss, Projektion und Ablösung sind **ein Aufruf und damit eine Transaktion** — entweder alles oder nichts. Eine bloße Schreibreihenfolge genügt **nicht**: `matching_results` wird in place überschrieben, ein Abbruch nach dem Upsert hätte den letzten vollständigen Stand bereits zerstört. Die Funktion validiert Mandant, Lauf und jede Zeile selbst und serialisiert je Mandant über einen Advisory-Lock |
| **Projektions-Riegel** | Trigger `matching_results_run_complete` | Eine Ergebniszeile mit `run_id` darf **nur** auf einen `vollstaendig`-Lauf verweisen — datenbankseitig erzwungen, nicht bloß im Code zugesichert. Ohne Auditpersistenz (`run_id` NULL) greift er nicht |
| **Sperre** | `pipeline_locks`, `matching-<mandant>` | Kein zweites Sperrsystem. Schließt die Lücke, dass der **Lage-Pfad** bisher ungesperrt matchte. Unterschiedliche Profile laufen weiter parallel |
| **Semantik-Trennung** | testgesichert | `knowledge_object_embeddings` wird **nicht** gelesen; `legacy_relevance_v1` ≠ `ko-kanon-1`; semantische Ähnlichkeit ist **kein** Relevanzsignal |

**Rollout-Grenze:** `HELMUT_MATCHING_AUDIT`, **Default AUS**. Ohne das Flag ist der
gesamte Auditpfad inert — keine Sperre, kein Lese- oder Schreibzugriff, keine neue
Fehlerquelle, byte-identische Ergebniszeilen. Migration `20260728_matching_audit.sql`
(+ Rollback) wurde am 2026-07-28, 20:20:57 UTC in Production angewendet und
vollständig verifiziert (287 Ergebniszeilen byte-identisch, `matching_runs` mit
0 Zeilen). **In Production steht das Flag seit 2026-07-28, ~20:55 UTC auf `on`**
(nur dort; Preview und Development bleiben aus) — die Auditpersistenz ist **aktiv**.
Erster Auditlauf 2026-07-29, 04:05 UTC; **Idempotenz in Production bewiesen** um
08:07:20 UTC (identischer Eingabefingerabdruck → keine neue Laufzeile,
`wiederholungen` 0 → 1, Projektion unverändert). Rückweg unverändert: Wert auf `off`
plus Redeploy. Details:
[`matching-nachvollziehbarkeit.md`](matching-nachvollziehbarkeit.md) §21.6 und §25.

Kostenwirkung: **null zusätzliche KI-Aufrufe.** Die Schreiblast **sinkt** — ein
identischer Zweitlauf schrieb bisher 20 wirkungslose UPDATEs, jetzt eines.

## 8 · Briefing, Lage, Radar, Büro

| Bereich | Backend | Client |
|---|---|---|
| Briefing / Heute | `briefingContract.js`, `briefingLanguage.js`, `decisions.js` | `renderBriefingView()` |
| Lage | `lage.js` | `renderLageView()`, `renderLageFocus()`, `renderLageSnapshot()` |
| Radar | `radar.js`, `radarState.js` | Radar-View + `radarDisruption()` |
| Büro | `office.js`, `templates/office/` | Büro-View |
| Profil | `profile-validation.js`, `config.js` | Profil-View, `renderOnboarding()` |

## 9 · Admin-Bereich

View `"admin"` in `client.js` (`renderAdminView()` ab ~Z. 2580), erreichbar nur im
Kontomodus für die Rolle `admin`. Daten aus `/api/admin/overview`,
`/api/admin/data-status`, `/api/admin/recovery-status` und weiteren `/api/admin/*`-
Routen (alle `requireRoleOr403`). Aufbau, bewusste Entscheidungen und Risiken:
[`admin-neuaufbau-2026-07.md`](admin-neuaufbau-2026-07.md).

## 10 · Production-Infrastruktur

- **Vercel**, Region `fra1`, Projekt `helmut-pilot`. Merge nach `main` = Deployment.
- `vercel.json`: Security-Header, immutable Asset-Caching, **9 Cron-Einträge**.
  `ASSET_VERSION` leitet sich aus `VERCEL_GIT_COMMIT_SHA` ab — deshalb bleiben
  `client.js?v=…`/`styles.css?v=…` bei einem Instant Rollback konsistent.
- **Flags:** `helmut-flags.json` (Allowlist); **Vercel-Env überstimmt die Datei immer**.
- **GitHub Actions:** `ci.yml` ist das blockierende Gate (Offline-Suite +
  Chromium-Smoke). Weitere Workflows sind pfadgefiltert oder `workflow_dispatch` und
  dürfen **nicht** als Required Check gesetzt werden.
- Env-Inventar: [`betrieb/env-inventar.md`](betrieb/env-inventar.md) ·
  Rollback: [`betrieb/deploy-rollback.md`](betrieb/deploy-rollback.md).

## 11 · Wichtige Verzeichnisse

```
server.js  client.js  styles.css  sw.js      # Anwendung (groß — nur abschnittsweise lesen)
api/index.js                                  # Vercel-Einstieg
lib/helmut/                                   # Fachlogik
lib/helmut/quellenarchitektur/                # Quellenmodell + Seeds
supabase/migrations/                          # Migration + Rollback paarweise
scripts/                                      # ~180 Test-/Werkzeugskripte
scripts/run-offline-tests.js                  # kanonischer Testlauf
test/fixtures/                                # Gold-Fixtures (PARDOK, Gate)
.github/workflows/ci.yml                      # blockierendes Merge-Gate
docs/                                         # Doku (Einstieg: START_HERE, CURRENT_STATE)
audit/                                        # historische Auditberichte (kein Status)
```

## 12 · Welche Dateien für welchen Aufgabentyp

| Aufgabentyp | Zuerst öffnen |
|---|---|
| **Backend / API** | betroffene Route in `server.js` (per `Grep` auf den Pfad), zugehöriges `lib/helmut/*.js`, `storage.js` nur für den konkreten Zugriff |
| **Datenmodell / Migration** | `supabase/migrations/` (letzte Dateien), `storage.js`, zugehöriges Rollback-SQL |
| **Quellen** | [`quellenarchitektur/02-zielarchitektur.md`](quellenarchitektur/02-zielarchitektur.md), [`quellenarchitektur/07-paketaktivierung-profil-resolver.md`](quellenarchitektur/07-paketaktivierung-profil-resolver.md), `lib/helmut/quellenarchitektur/{source-mode,catalog,profile-packages}.js`, betroffene `seeds/*.js`, `scripts/source-architecture-test.js` |
| **„Läuft die Versorgung wirklich?"** | `node scripts/paket-inventur.js` (rein lesend, Ist-Zustand je Paket), [`quellenarchitektur/30-paket-inventur-production.md`](quellenarchitektur/30-paket-inventur-production.md), `lib/helmut/quellenarchitektur/{paket-inventur,source-failure}.js` |
| **UI** | betroffene `render…View()` in `client.js`, Token-/Light-Mode-Block in `styles.css`, `scripts/*-ui-test.js`, `scripts/browser-smoke-test.js`, [`admin-neuaufbau-2026-07.md`](admin-neuaufbau-2026-07.md) für Admin-Designentscheidungen |
| **Understanding / KI** | `understanding.js`, `ai.js`, `llm-budget.js`, `quellenarchitektur/understanding-gate.js` |
| **Sicherheit / Mandanten** | [`quellenarchitektur/05-sicherheitsmodell-rls.md`](quellenarchitektur/05-sicherheitsmodell-rls.md), [`sprint1-sicherheit/01-zugriffsmatrix.md`](sprint1-sicherheit/01-zugriffsmatrix.md), `tenant-context.js`, `auth.js`, `scripts/cross-tenant-security-test.js` |
| **Betrieb / Production** | [`betrieb/deploy-rollback.md`](betrieb/deploy-rollback.md), [`betrieb/env-inventar.md`](betrieb/env-inventar.md), [`betrieb/branch-protection.md`](betrieb/branch-protection.md), `vercel.json`, `helmut-flags.json` |
| **Monitoring / Alarm** | `rolling-health.js`, `watchdog-state.js`, `monitoring-webhook.js`, `alarm-payload.js` |
