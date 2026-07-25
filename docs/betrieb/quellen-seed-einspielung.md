# Quellen-Seeds einspielen — Freigabevorlage

**Stand:** 2026-07-25 · **Code-Grundlage:** `main` `61767a9` (Merge #118) · **Deployment:** `READY`

> **Status: BLOCKIERT.** Diese Vorlage ist vollständig vorbereitet, aber die Ausführung ist
> **nicht freigegeben** — es fehlt eine belastbare Sicherung (§5). Nichts hiervon wurde ausgeführt.
> Die Vorschau in §4 ist rein lokal simuliert, ohne jeden Production-Zugriff.
>
> **Nachtrag 2026-07-25 — fachliche Prüfung jeder Einzeländerung: [§8](#8--fachprüfung-jeder-einzelnen-seed-änderung-2026-07-25).**
> Ergebnis: fachlich vertretbar, eine Empfehlung (A-1), keine zwingende Änderung. Der Vorbehalt
> „vier Umstellungen auf Google, darunter zwei funktionierende Direkt-RSS-Wege" hält der Prüfung
> **nicht** stand (§8.1). Der Blocker aus §5 bleibt unverändert bestehen.

---

## 1 · Was ausgeführt werden müsste

Zwei SQL-Seeds, **strikt in dieser Reihenfolge**, jeweils als **eigene** Freigabeentscheidung:

| # | Datei | Inhalt |
|---|---|---|
| **Seed 1** | `supabase/seeds/20260713_source_architecture_seed.sql` | Bund-Quellenarchitektur — enthält u. a. die zwei **neuen** Landes-Partei-Pakete und die 6 reparierten Bundeswege |
| **Seed 2** | `supabase/seeds/20260717_landesmodul_be_bb_seed.sql` | Landesmodul Berlin/Brandenburg — verschiebt die Partei-/Personenwege aus dem Pflicht-Basispaket |

**Die Reihenfolge ist zwingend:** Seed 2 ordnet Abrufwege den Paketen `pkg-die-linke-berlin` /
`pkg-die-linke-brandenburg` zu. Diese Pakete werden erst von **Seed 1** angelegt. Umgekehrte
Reihenfolge → Fremdschlüsselverletzung.

**Betroffene Tabellen:** `geographies`, `political_entities`, `publishers`, `source_packages`,
`retrieval_paths`, `package_paths`, `path_expected_levels`, `path_expected_geographies`.

**Notwendiger Zugriff:** `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (Schreibrechte, umgeht RLS).
**Kein** Repository-Automatismus spielt Seeds ein — verifiziert: kein Workflow, kein Cron, kein
Server-Pfad führt die Dateien aus; sie werden ausschließlich von Test-/Preflight-Skripten gelesen.

---

## 2 · Idempotenz

**Ja, beide Seeds sind idempotent** — lokal simuliert (§4, Schritt 4): ein zweiter Lauf beider
Seeds erzeugt **0 Einfügungen, 0 Aktualisierungen, 0 Löschungen**, Zustand byte-gleich.

- Alle Inserts tragen `on conflict … do nothing` bzw. `do update set` mit deterministischen Werten.
- Das neue Aufräum-`delete` in Seed 2 ist selbstbegrenzend: es entfernt nur Paketzuordnungen der
  18 Seed-eigenen Wege, die **nicht** im Seed vorgesehen sind. Nach dem ersten Lauf sind alle
  verbliebenen Zuordnungen die vorgesehenen → zweiter Lauf löscht 0 Zeilen.
- Beide Seeds laufen vollständig in einer Transaktion (`begin;` … `commit;`).

**Wichtige Feinheit — `on conflict do update` aktualisiert nur ausgewählte Spalten:**

| Tabelle | aktualisierte Spalten bei bestehender Zeile |
|---|---|
| `retrieval_paths` | `publisher_id`, `method`, `status`, `priority` — **nicht** `url`, `query`, `parser`, `max_items`, `activation_mode` |
| `source_packages` | `name`, `purpose`, `status`, `required_classes` |
| `publishers` | `name`, `evidence_role`, `trust`, `entity_id` |
| `package_paths` | — (`do nothing`) |

Das ist **kein Defekt**: Für die 6 reparierten Wege liefert `toCrawlerSource` das Legacy-Objekt aus
`lib/helmut/sources.js` (Code, mit dem Deployment bereits live) — die neue URL und `maxItems`
kommen also aus dem Code, nicht aus der DB-Spalte. Die DB-Spalte `url` bliebe kosmetisch veraltet.

---

## 3 · Was fachlich passiert

**Seed 1 (Bund):**
1. Legt **2 neue Pakete** an: `die-linke-berlin`, `die-linke-brandenburg` — beide `prepared`,
   `is_base = false`, also **nicht** verpflichtend und **nie** automatisch aktiv.
2. Reduziert `required_classes` von `berlin-basis` / `brandenburg-basis` von **15 auf 12**
   (die 3 Partei-/Personen-Pilotklassen wandern in die neuen Pakete) — das ist P0-2 auf Paketebene.
3. Setzt bei **6 Bundeswegen** `status` von `broken` auf `needs_review` und korrigiert `method`
   (2× `html` → `rss`): `bundestag`, `bundesregierung`, `die-linke`, `linksfraktion`,
   `ausschuss-arbeit-soziales`, `dgb`.
4. Ergänzt **1 Paketzuordnung**: `pkg-die-linke-bund` → `rp-fraction-linke` (Folge des P0-1-Fixes;
   das Partei-Paket wurde bisher mit 0 funktionierenden Wegen ausgeliefert).

**Seed 2 (Landesmodul):**
5. Entfernt **4 alte** Paketzuordnungen aus den **Pflicht**-Basispaketen und legt sie in den neuen
   Partei-Paketen neu an — das ist P0-2 in der Datenbank:

| Abrufweg | vorher (Pflichtpaket) | nachher (optionales Paket) |
|---|---|---|
| `rp-be-partei_pilot` | `pkg-berlin-basis` | `pkg-die-linke-berlin` |
| `rp-be-fraktion_pilot` | `pkg-berlin-basis` | `pkg-die-linke-berlin` |
| `rp-be-person_pilot` | `pkg-berlin-basis` | `pkg-die-linke-berlin` |
| `rp-bb-partei_pilot` | `pkg-brandenburg-basis` | `pkg-die-linke-brandenburg` |

`rp-be-person_pilot` ist die Personenquelle eines realen Landespolitikers — sie hängt heute am
Paket, das **jedes** Berliner Landtagsprofil verpflichtend erhält. Genau das behebt Seed 2.

### Nur vorbereitet vs. tatsächlich wirksam

| Wirkt sofort nach dem Einspielen | Bleibt nur vorbereitet |
|---|---|
| 6 Bundeswege werden ausführbar (§4, Punkt 11) | Berlin/Brandenburg bleiben gesperrt |
| `required_classes` der Landes-Basispakete: 15 → 12 | Die 2 neuen Partei-Pakete bleiben `prepared` |
| Paketzuordnungen der 4 Landeswege verschoben | Alle 18 BE/BB-Wege bleiben `needs_review` + `manual` |

---

## 4 · Soll-Ist-Vorschau (lokal simuliert, ohne Production-Zugriff)

**Methode:** Der erwartete Production-Ausgangszustand ist der Inhalt der **vor** #118 committeten
Seeds — beide sind laut `quellenarchitektur/18-production-freigabeanfrage.md` bereits angewendet.
Simuliert wurde gegen `main` `54fe370` (vorher) → `61767a9` (nachher) mit den echten
`on conflict`-Semantiken.

| Tabelle | Ausgangszustand | nach Seed 1 | nach Seed 2 |
|---|---|---|---|
| `geographies` | 50 | 50 | 50 |
| `political_entities` | 73 | 73 | 73 |
| `publishers` | 64 | 64 | 64 |
| `source_packages` | 6 | **8** (+2) | 8 |
| `retrieval_paths` | 162 | 162 (6 aktualisiert) | 162 |
| `package_paths` | 163 | **164** (+1) | 164 (−4 / +4) |
| `path_expected_levels` | 18 | 18 | 18 |
| `path_expected_geographies` | 18 | 18 | 18 |

**Exakte Soll-Zahlen:**

| Nr. | Kennzahl | Soll |
|---|---|---|
| 4 | betroffene **Publisher** | **0** (keine neuen, keine geänderten) |
| 5 | betroffene **Retrieval Paths** | **6** (aktualisiert; 0 neu, 0 entfernt) |
| 6 | betroffene **Source Packages** | **4** (2 neu + 2 mit reduzierten `required_classes`) |
| 7 | **entfernte** alte Paketzuordnungen | **4** |
| 8 | **neu eingefügte** Paketzuordnungen | **5** (1 aus Seed 1 + 4 aus Seed 2) |
| — | Gesamtzahl Einfügungen | Seed 1: **3** · Seed 2: **4** |
| — | Gesamtzahl Aktualisierungen | Seed 1: **8** · Seed 2: **0** |
| — | Gesamtzahl Löschungen | Seed 1: **0** · Seed 2: **4** |

**9 · Partei-/Personenquellen aus Pflichtpaketen entfernt:** die 4 oben genannten Wege
(`rp-be-partei_pilot`, `rp-be-fraktion_pilot`, `rp-be-person_pilot`, `rp-bb-partei_pilot`).

**10 · Neue nicht-verpflichtende Pakete:** `die-linke-berlin` (3 Wege), `die-linke-brandenburg`
(1 Weg). Beide `prepared`, `is_base = false`.

**11 · Wird eine Quelle automatisch aktiviert?** — **Ja, und zwar beabsichtigt.** Das ist der
wichtigste operative Punkt dieser Vorlage und darf nicht übersehen werden:

Die 6 reparierten Wege stehen in Production heute auf `status = 'broken'` und werden vom Crawl-Plan
in `defekt` einsortiert, also **nicht ausgeführt**. Seed 1 setzt sie auf `needs_review` — damit sind
sie wieder ausführbar. Am Crawl-Plan verifiziert (Vorher/Nachher mit echtem `buildRelationalCrawlPlan`):

- **+2 garantiert und sofort:** `rp-bundestag` und `rp-bundesregierung` sind `activation_mode = always_on`
  und laufen unabhängig von jeder Paketaktivierung. Vorher `defekt`, nachher `aktiv`.
- **bis zu +4 weitere:** `die-linke`, `linksfraktion`, `ausschuss-arbeit-soziales`, `dgb` sind
  `auto` und laufen, sobald ihr Paket für mindestens ein Profil aktiv ist (in Production der
  Regelfall für `bund-basis` / `arbeit-und-soziales`). Die exakte Zahl hängt vom Live-Profilbestand
  ab und ist ohne Production-Read nicht bestimmbar.

**Kosten-/Crawl-Wirkung:** 4 der 6 Wege sind Google-News-Suchen. Sie sind mandantenunabhängig und
werden von der Shared-Path-Deduplizierung aus PR #120 erfasst (Mandant 2+ → `skipped-shared`), es
entsteht also **keine** Mandanten-Amplifikation. Zusatzlast ≈ 4 Abrufe pro Cron-Lauf. **Keine**
zusätzlichen KI-Kosten (Crawl ≠ Understanding). Der Google-News-Anteil steigt von 134 auf 138 von
143 Wegen — bei offenem Circuit Breaker liefern dann nur noch 5 statt 9 Direktfeeds (bekannter
SPOF, im Audit als eigener P1 geführt).

**12 · Bleiben Berlin/Brandenburg vorbereitet, aber inaktiv?** — **Ja, verifiziert.** Ausführung
von `buildRelationalCrawlPlan` mit einem Berlin-/Linke-Landtagsprofil: **alle 18 BE/BB-Wege
ausgeschlossen, jeder mit Grund `landesmodul-gesperrt`, 0 im aktiven Plan.** Das Gate greift über
die Pfad-IDs (`rp-be-` / `rp-bb-`), **nicht** über Paketschlüssel — die Umsortierung in andere
Pakete kann es daher nicht umgehen. Zweite, unabhängige Barriere: beide neuen Pakete sind
`prepared` und werden nie `active`.

**13 · Bestehende aktive Bundestagsquellen:** unbeschädigt. `retrieval_paths` bleibt bei 162 Zeilen,
es wird keine Zeile entfernt; die einzigen Änderungen an bestehenden Wegen sind die 6 Reparaturen
(die vorher **nicht** liefen). `publishers` unverändert.

**14 · Wiederholte Ausführung:** erzeugt **keinen** zusätzlichen Diff (§2).

---

## 5 · Backup und Rollback — hier liegt der Blocker

| Frage | Antwort |
|---|---|
| Aktuelles Backup? | **Nein** — Supabase **Free-Plan**, keine automatischen Backups (`CURRENT_STATE.md` §9) |
| PITR verfügbar? | **Nein** — Teil des offenen, **blockierten** OP-01 |
| Restore-Prozess dokumentiert? | Ja — `betrieb/backup-restore-runbook.md`; PITR-Abschnitt §3 gilt aber ausdrücklich erst **nach** dem Pro-Upgrade |
| Restore getestet? | Werkzeug `scripts/restore-drill.js` existiert und ist gefahrlos ausführbar (§3b), eine Übung ist aber **nicht** protokolliert |
| Manuelles Backup möglich? | **Ja, heute** — `node scripts/backup-export.js` exportiert alle 38 Tabellen als JSON (read-only). Ehrliche Grenze: kein konsistenter Snapshot, nur tabellenweise |
| Technischer Rollback Seed 2? | **Ja, fein** — `20260717_landesmodul_be_bb_seed_rollback.sql` löscht gezielt per `retrieval_path_id` |
| Technischer Rollback Seed 1? | **Nein, nur destruktiv** — `20260713_source_architecture_rollback.sql` macht `drop table … cascade` über die gesamte Quellenarchitektur. Für einen gezielten Rückbau **unbrauchbar** |

**Entfernt der Rollback alle neu erzeugten Zuordnungen?** Für die BE/BB-Wege ja (Löschung per
`retrieval_path_id` trifft beide Paketvarianten). Die zusätzliche Bund-Zuordnung
`pkg-die-linke-bund → rp-fraction-linke` deckt er **nicht** ab.

**Stellt der Rollback die alten Zuordnungen wieder her?** **Nein.** Er löscht nur. Die vorherige
Zuordnung der 4 Wege zu den Pflicht-Basispaketen müsste manuell aus dem Alt-Seed
(`main` `54fe370`) wiederhergestellt werden.

**Bleiben leere Pakete zurück?** Ja — `die-linke-berlin` / `die-linke-brandenburg` bleiben nach
einem Rollback als leere `prepared`-Pakete stehen. **Nur kosmetisch:** `prepared` wird nie aktiv,
0 zugeordnete Wege, keine Fremdschlüsselverletzung, keine Auswirkung auf den Crawl-Plan.

**Teilerfolg zwischen Seed 1 und Seed 2:** unkritisch. Beide Seeds sind je für sich transaktional.
Läuft nur Seed 1, entstehen die 2 neuen Pakete leer und die 4 Landeswege bleiben an den
Pflichtpaketen — also exakt der heutige Zustand plus zwei ungenutzte Pakete. Kein inkonsistenter
Zwischenzustand, kein Datenverlust. Seed 2 kann jederzeit nachgezogen werden.

**Timeout oder Verbindungsabbruch:** Wegen `begin;`/`commit;` gilt alles-oder-nichts. Bei
unklarem Ausgang **nicht blind wiederholen**, sondern zuerst read-only prüfen:
`select count(*) from source_packages` (Soll 8 nach Seed 1) und
`select package_id from package_paths where retrieval_path_id = 'rp-be-partei_pilot'`
(Soll `pkg-die-linke-berlin` nach Seed 2). Da beide Seeds idempotent sind, ist eine Wiederholung
nach dieser Prüfung gefahrlos.

---

## 6 · Abnahmekriterien

**Go — alle müssen erfüllt sein:**

| # | Kriterium | Stand |
|---|---|---|
| 1 | PR #118 gemergt und deployt | ✅ `61767a9`, CI grün, Vercel `READY` |
| 2 | Backup oder PITR bestätigt | ❌ **offen** — siehe §5 |
| 3 | Vorschau ohne unerwarteten Diff | ✅ §4 |
| 4 | Exakte Soll-Zahlen dokumentiert | ✅ §4 |
| 5 | Rollback geprüft | ⚠️ **teilweise** — fein nur für Seed 2 |
| 6 | Keine laufende Migration / kritische Verarbeitung | ⚠️ vor Ausführung prüfen (Crawl-Cron 04:00/20:00 UTC, Understanding 05:30/21:30) |
| 7 | Kein Konflikt mit neuen `main`-Änderungen | ✅ zum Zeitpunkt dieser Vorlage |
| 8 | Betreiberfreigabe | ❌ **offen** |
| 9 | Seeds einzeln ausführen | Vorgabe für die Ausführung |
| 10 | Nach jedem Seed Soll-Ist-Vergleich | Vorgabe (Prüfabfragen in §5) |
| 11 | Keine automatische Quellenaktivierung | ⚠️ **bewusst nicht erfüllt** — §4 Punkt 11: 6 Wege werden absichtlich wieder ausführbar. Muss ausdrücklich mitfreigegeben werden |
| 12 | Keine Crawl-Amplifikation | ✅ durch #120 abgedeckt |
| 13 | Keine mandantenübergreifende Fehlzuordnung | ✅ §4 Punkt 12 |

**Stop — jedes einzelne Kriterium bricht ab:** zusätzliche unerwartete Datensätze · Abweichung bei
Paketzuordnungen von den Soll-Zahlen in §4 · BE/BB-Wege erscheinen im aktiven Plan · bestehende
aktive Pfade verschwinden · zweiter Lauf erzeugt einen Diff · Backup-Status unklar · Fehler
zwischen den beiden Seeds · neue `main`-Commits berühren die Seeds oder `sources.js` ·
Production-Health verschlechtert sich · Rollback nicht eindeutig möglich.

---

## 7 · Betreiberentscheidung

### Option A — jetzt kontrolliert ausführen

**Wird nicht empfohlen.** Go-Kriterium 2 (Backup/PITR) und 8 (Freigabe) sind nicht erfüllt.

### Option B — Ausführung blockieren ← **empfohlen**

**Es fehlt genau eine belastbare Sicherung.** Zwei Wege, sie herzustellen:

1. **Klein und sofort, ohne Kostenentscheidung:** vor der Ausführung
   `node scripts/backup-export.js` laufen lassen (read-only) und den Export sichern. Für diese
   Seeds ist das eine **angemessene** Sicherung: geändert werden ausschließlich
   Konfigurationstabellen, deren Sollzustand deterministisch aus dem Code erzeugt wird — der
   Alt-Zustand ist zusätzlich über `main` `54fe370` jederzeit rekonstruierbar.
2. **Grundsätzlich und dauerhaft:** OP-01 freigeben (Supabase Pro + PITR, ca. 25 $/Monat) und die
   Restore-Übung nach `backup-restore-runbook.md` §3b protokollieren. Das ist ohnehin der
   dokumentierte höchste Einzelrisiko-Punkt des Projekts — **die Kostenentscheidung liegt
   ausschließlich beim Betreiber.**

Zusätzlich vor einer Freigabe zu bestätigen: dass die **absichtliche Reaktivierung der 6
Bundeswege** (§4 Punkt 11) gewollt ist.

---

## 8 · Fachprüfung jeder einzelnen Seed-Änderung (2026-07-25)

**Anlass:** Der Preflight hat die Einspielung korrekt gestoppt und dabei den Verdacht notiert,
der Seed stelle vier Abrufwege auf `googlenews_search` um — darunter zwei bisher funktionierende
Direkt-RSS-Wege. Nach dem Google-News-Incident vom selben Tag soll diese Änderung nicht
ungeprüft übernommen werden. Dieser Abschnitt prüft **jede** Änderung fachlich.

**Abgrenzung dieses Sprints:** rein lesend. Ausgeführt wurden ausschließlich `SELECT`s gegen
`ddckuvvpcytqbyfmbvie`. **Keine** Einspielung, **keine** Migration, **keine** Aktivierung,
**kein** Backup, **kein** Deployment, **keine** Codeänderung.

**Grenze, die benannt gehört:** Eine erneute Live-Prüfung der Feed-URLs war in dieser Umgebung
**nicht möglich** — der Egress ist gesperrt (`CONNECT … 403` für `bundestag.de`,
`bundesregierung.de`, `die-linke.de`, `dielinkebt.de`). Der jüngste echte Abruf-Beleg bleibt
Sprint 9B vom 2026-07-14 (Run 29297142235). Alles, was unten „live geprüft" heißt, stammt aus
der Production-Datenbank, nicht aus einem neuen Feed-Abruf.

### 8.1 · Zwei Feststellungen, die die gesamte Bewertung tragen

**F-A · Die Spalten `method` und `url` steuern den Abruf dieser sechs Wege nicht.**
Die Belegkette ist geschlossen:

| Schritt | Datei | Verhalten |
|---|---|---|
| Plan → Quelle | `lib/helmut/quellenarchitektur/source-mode.js:58-60` | `toCrawlerSource` gibt bei vorhandener `legacy_source_id` **das Legacy-Objekt zurück** und ignoriert `method`/`url`/`max_items` der DB-Zeile |
| Legacy-Katalog | `lib/helmut/scheduler.js:761` → `storage.js:3024` | `getSources()` liest `store.sources` |
| Code schlägt Store | `lib/helmut/storage.js:2890-2902` | `mergeSources` überschreibt `url`, `rssUrl`, `rssUrls`, `crawlMethod`, `priority`, `maxItems` **hart aus `lib/helmut/sources.js`** |
| Item-Deckel | `lib/helmut/crawler.js:298-301` | `maxItems` wird aus der **Abruf-URL** abgeleitet, nicht aus `retrieval_paths.max_items` |

Folge: Die Umstellung auf Google ist für diese vier Wege **im Code bereits vollzogen und seit
dem Merge von #118 deployt** (`sources.js`, Diff `54fe370…61767a9`). Der Seed kann sie weder
herbeiführen noch verhindern. Sein einziger operativer Effekt auf diese sechs Zeilen ist
`status: broken → needs_review` — **das ist der Aktivierungsschalter**, sonst nichts.

Daraus folgt auch, was **nicht** hilft: die `method`-Spalte im Seed auf `rss` zurückzudrehen,
würde keinen Direktfeed wiederherstellen. Es würde die Datenbank nur etwas behaupten lassen,
was der Code nicht tut. Der einzige Hebel innerhalb dieses Seeds ist die `status`-Spalte —
sie entscheidet je Weg **einzeln**, ob er läuft.

**F-B · Keiner der vier umgestellten Wege liefert heute etwas.** Die Prämisse „zwei bisher
funktionierende Direkt-RSS-Wege" trifft **nicht** zu:

- Alle sechs Wege stehen in Production auf `status='broken'` (gemessen 2026-07-25) und werden
  vom Crawl-Plan in `defekt` einsortiert, also nicht abgerufen (`source-mode.js:139`).
- `source_crawl_telemetry` enthält für `bundestag`, `bundesregierung`, `die-linke`,
  `linksfraktion`, `ausschuss-arbeit-soziales`, `dgb` in den letzten **7 Tagen 0 Zeilen**.
- `retrieval_paths.status` wird zur Laufzeit **nie** zurückgeschrieben: alle 163 Zeilen tragen
  unverändert `updated_at = 2026-07-13 18:59:51`, `last_success_at = null`, `error_streak = 0`
  — auch die gesunden. `status` ist ein deklaratives Seed-Feld, kein Gesundheitssignal.
- Zwei der vier waren vor der Reparatur `html`-Scrapes (`rp-ausschuss-arbeit-soziales`,
  `rp-dgb`), nie RSS. Die anderen zwei (`rp-bundesregierung`, `rp-die-linke`) waren als RSS
  **modelliert**, ihre Direkt-URLs sind aber in Sprint 9B real widerlegt worden (404 bzw. 429).

**Es geht also kein einziger funktionierender Direktweg verloren.** Der Seed nimmt nichts weg;
er schaltet sechs seit Wochen dunkle Wege wieder ein — zwei davon als echte Direktfeeds.

### 8.2 · Messwerte aus Production (read-only, 2026-07-25)

| Kennzahl | Wert |
|---|---|
| Abrufwege gesamt | 163 (146 `googlenews_search` · 12 `rss` · 2 `html` · 2 `structured_download` · 1 `api`) |
| davon heute real abgerufen | **88** — 85 Google + **3 Direkt-RSS** (`bmas`, `tagesschau-politik`, `deutschlandfunk-politik`) + 2 profilgenerierte |
| Erfolgsquote 7 Tage, Google | 4 342 ok / 4 020 Fehler / 35 leer → **51,9 % ok** |
| Erfolgsquote 7 Tage, Direkt-RSS | 222 ok / **0 Fehler** → **100 % ok** |
| Letzte 6 Läufe (Lage-Cron 10:00 UTC) | Lauf 1: 84/84 Google ok · Läufe 2–6: **0/85 Google ok** · Direkt-RSS in **allen sechs** Läufen 3/3 ok |
| LLM-Tagesbudget (8 Tage) | 31 · 65 · 53 · 55 · 59 · **100** · 88 · 60 von 100 (+30 Reserve) |
| Neue Rohdokumente/Tag | 199–384 |

Die fünf Fehlläufe stammen aus der Mandanten-Amplifikation
(`incident_2026-07-25_crawl_mandantenamplifikation.md`); der Fix #120 ist seit `9f95d87`
(10:27 UTC) auf `main` und deployt, ein Crawl-Cron danach lief noch nicht (nächster 20:00 UTC).
Der Statuskopf des Incident-Dokuments („NICHT deployt", Basis `035898b`) ist damit überholt.
Die Zahlen belegen trotzdem die Form des Klumpenrisikos: **fällt Google aus, bleiben heute drei
Quellen übrig — keine davon parlamentarisch.**

### 8.3 · Bewertung jeder einzelnen Änderung

Vollständige Liste aus `git diff 54fe370 HEAD` über beide Seed-Dateien.

| Änderung | Beibehalten | Verwerfen | Begründung | Risiko |
|---|:--:|:--:|---|---|
| **Ä-1** Seed 1: Publisher-Zeile `aggregator-google-news` umsortiert | ✅ | – | Reine Reihenfolge aus dem Generator (P0-1-Reproduzierbarkeit). Kein Semantikunterschied, `on conflict do update` setzt dieselben Werte | keins |
| **Ä-2** Seed 1: Kommentarblock zur Mandantenneutralisierung entfernt | ✅ | – | Generatorseitig entfallen; die Aussage steht kanonisch in `02-zielarchitektur.md`. SQL-Semantik unverändert | keins |
| **Ä-3** `berlin-basis`: `required_classes` 15 → 12 | ✅ | – | Kern von P0-2. Partei-/Fraktions-/Personenklassen gehören nicht in ein Paket, das **jedes** Berliner Landtagsprofil verpflichtend erhält | keins — Paket ist `prepared`, Berlin ist hart gesperrt |
| **Ä-4** `brandenburg-basis`: `required_classes` 15 → 12 | ✅ | – | wie Ä-3 | keins |
| **Ä-5** neues Paket `die-linke-berlin` (`prepared`, `is_base=false`) | ✅ | – | Nimmt die drei Parteiklassen auf. Zwei unabhängige Barrieren: `prepared` wird nie `active`, und das Landesmodul-Gate greift über Pfad-IDs | keins |
| **Ä-6** neues Paket `die-linke-brandenburg` (`prepared`, `is_base=false`) | ⚠️ ja, mit Auflage | – | Strukturell richtig, **inhaltlich falsch parametriert**: `required_classes` verlangt `partei_pilot`, `fraktion_pilot`, `person_pilot`, das Paket enthält aber genau **einen** Weg — und der eigene `purpose`-Text sagt „8. WP **ohne Landtagsfraktion**". Zwei Pflichtklassen sind dauerhaft unerfüllbar | gering: erzeugt dauerhaft „falsches Rot" im Admin-Rollup (`admin-report.js:89`), nie falsches Grün |
| **Ä-7** `rp-bundestag`: URL-Fix + `broken → needs_review` (Methode bleibt `rss`) | ✅ | – | **Der wertvollste Teil des Seeds.** Ein echter Direktfeed (9B: HTTP 200, 15 Items), `always_on`, `is_critical`, höchste Priorität. Hebt die Zahl der Direktwege von 3 auf 4 und gibt Helmut erstmals wieder eine **parlamentarische** Quelle, die einen Google-Ausfall überlebt. Die URL-Spalte selbst wird durch `on conflict` nicht geschrieben — irrelevant, der Abruf kommt aus dem Code (F-A) | gering: URL zuletzt 2026-07-14 verifiziert; ein erneuter Umzug führt zu **sichtbarem** Fehler in der Telemetrie, nicht zu stillem Ausfall |
| **Ä-8** `rp-bundesregierung`: `rss → googlenews_search` + `broken → needs_review` | ⚠️ ja, mit Auflage | – | Liefert heute **nichts** (F-B); der Direktpfad war real 404. Etwas ist besser als nichts für eine `always_on`+`is_critical`-Regierungsquelle. **Aber:** ein kritischer Kernweg an Google zu hängen ist die schlechteste Stelle dafür — und `bundeswege-reparaturen.js:36` nennt den Direktweg ausdrücklich als offen („Feed-URL über `/breg-de/service/newsletter-und-abos/rss-newsfeed` manuell entnehmen"). Diese Recherche wurde nie zu Ende geführt | mittel: der Weg liefert genau dann nichts, wenn Google drosselt — also gerade im Störfall |
| **Ä-9** `rp-ausschuss-arbeit-soziales`: `html → googlenews_search` + `broken → needs_review` | – | ✅ **verwerfen** | Die schwächste der vier. Der Suchweg ist `site:bundestag.de "Ausschuss für Arbeit und Soziales"` — er holt über Google genau die Domain, die Helmut nach Ä-7 wieder **direkt** abruft (`pressemitteilungen.rss` **und** `presse/hib/rss`, beide in `sources.js` hinterlegt). Googles Index von `bundestag.de` ist gegenüber den Feeds langsamer und unvollständiger. Zusätzlich decken bereits **6** `rp-bundle-ausschuss-*`-Suchen dasselbe Themenfeld ab | gering im Betrieb, aber reiner Zugewinn an Google-Abhängigkeit ohne belegten Eigenertrag |
| **Ä-10** `rp-die-linke`: `rss → googlenews_search` + `broken → needs_review` | ✅ | – | Hier ist Google **legitim**: der Direktfeed ist aktiv bot-gesperrt (429), und Bot-Sperren werden bewusst nicht umgangen. Ein sauber abgegrenzter `site:`-Ersatz ist die ehrliche Lösung. Die Partei ist zusätzlich über Ä-11 (Direktfeed) und `rp-fraction-linke` abgedeckt | gering |
| **Ä-11** `rp-linksfraktion`: URL-Fix + `broken → needs_review` (Methode bleibt `rss`) | ✅ | – | Zweiter echter Direktfeed-Gewinn (9B: HTTP 200, 15 Items, 0 Tage alt). Direkte Fraktionsquelle statt Aggregator — genau die Richtung, die `google_news_haertung.md` §4 als wirksamste Minderung benennt | gering, wie Ä-7 |
| **Ä-12** `rp-dgb`: `html → googlenews_search` + `broken → needs_review` | ⚠️ ja, mit Auflage | – | Wie Ä-8, aber unkritisch (`auto`, `is_critical=false`, Priorität 75). Auch hier nennt `bundeswege-reparaturen.js:68` den offenen Direktweg („RSS-Übersicht `dgb.de/unsere-rss-feeds/` + OPML → exakte Presse-XML-URL entnehmen") — nur der Start-OPML wurde getestet, nicht die darin verlinkten Feeds | gering |
| **Ä-13** Seed 1: `package_paths` += (`pkg-die-linke-bund`, `rp-fraction-linke`) | ✅ | – | Folge des P0-1-Fixes: das Partei-Paket wurde bisher mit 0 funktionierenden Wegen ausgeliefert. Fügt **keinen** neuen Abrufweg hinzu — `rp-fraction-linke` läuft bereits über `pkg-bund-basis` und ist im Plan URL-dedupliziert | keins |
| **Ä-14** Seed 2: neues Aufräum-`delete` über 18 BE/BB-Wege | ✅ | – | Ohne dieses `delete` bliebe P0-2 in der Datenbank **wirkungslos** (die alten Zuordnungen am Pflichtpaket überlebten das `insert … on conflict do nothing`). Gegen Production geprüft: die 18 Wege hängen heute an genau den erwarteten Paketen, `rp-rbb24-politik` an `berlin-basis` **und** `brandenburg-basis` — beide stehen in der Ausnahmeliste. Es werden **exakt 4** Zeilen gelöscht, keine Kollateraltreffer | keins |
| **Ä-15** `rp-be-partei_pilot`: `berlin-basis → die-linke-berlin` | ✅ | – | P0-2 in der Datenbank | keins |
| **Ä-16** `rp-be-fraktion_pilot`: `berlin-basis → die-linke-berlin` | ✅ | – | P0-2 in der Datenbank | keins |
| **Ä-17** `rp-be-person_pilot`: `berlin-basis → die-linke-berlin` | ✅ | – | Der wichtigste Einzelfall: die Personenquelle eines realen Landespolitikers hängt heute am Paket, das **jedes** Berliner Landtagsprofil verpflichtend bekäme. Der Seed behebt das | keins — behebt ein Neutralitätsproblem, schafft keins |
| **Ä-18** `rp-bb-partei_pilot`: `brandenburg-basis → die-linke-brandenburg` | ✅ | – | wie Ä-15 | keins |

### 8.4 · Was das für die Robustheit bedeutet

Die naheliegende Sorge — „der Seed erhöht die Google-Abhängigkeit" — stimmt in absoluten
Zahlen und **kippt** in der Wirkung:

| | heute | nach dem Seed | nach dem Seed ohne Ä-9 |
|---|---|---|---|
| real abgerufene Google-Wege | 85 | 89 (+4,7 %) | 88 |
| real abgerufene Direkt-Wege | **3** | **5 (+67 %)** | **5** |
| Direktanteil | 3,4 % | 5,3 % | 5,4 % |
| bei Google-Totalausfall verfügbar | Tagesschau, Deutschlandfunk, BMAS | **+ Bundestag-Pressemitteilungen + hib, + Die Linke im Bundestag** | identisch |

Der Seed **senkt** also das Klumpenrisiko, statt es zu erhöhen — weil die beiden Direktwege
proportional weit mehr wiegen als die vier Google-Wege. Entscheidend für das Produkt: Helmut
hat heute bei einem Google-Ausfall **keine einzige parlamentarische Quelle**. Nach Ä-7/Ä-11
hat er die Pressemitteilungen des Bundestages und die der eigenen Fraktion — also genau das
Material, aus dem eine belastbare Morgenlage entsteht.

Die vier Google-Umstellungen erhöhen die Abhängigkeit **nominell**, aber nicht **strukturell**:
alle vier ersetzen Wege, die heute 0 liefern. Kein bestehender Direktfeed wird geopfert.

**Belegpflicht:** Google-Items durchlaufen eine zusätzliche URL-Auflösung
(`crawler.js:319-330`). Sie funktioniert heute: von 4 066 Rohdokumenten der letzten 14 Tage
trägt **keines** eine `news.google.`-URL; 2 sind als `google_proxy` markiert. Im
Cooldown-Modus entfällt die Auflösung jedoch bewusst — dann können Links auf den
Google-Umweg zeigen. Für eine Regierungsquelle (Ä-8) ist das der eigentliche fachliche
Nachteil gegenüber einem Direktfeed, der sich selbst belegt.

### 8.5 · Empfohlene Seed-Anpassungen — beschrieben, **nicht implementiert**

Zwingend ist keine dieser Anpassungen. Empfohlen ist genau eine (A-1); die übrigen sind
optional.

**A-1 (empfohlen) · `rp-ausschuss-arbeit-soziales` nicht mit aktivieren.**
Datei `supabase/seeds/20260713_source_architecture_seed.sql`, **Zeile 209**: `status` von
`'needs_review'` auf `'broken'` belassen. Die `method`-Spalte kann unverändert bleiben — sie
ist ohnehin nur beschreibend (F-A).
*Wirkung:* ein Google-Weg weniger im Plan; Ausschussinhalte kommen weiter über
`rp-bundestag` (Pressemitteilungen + hib, direkt) und die 6 vorhandenen
`rp-bundle-ausschuss-*`-Suchen. *Kosten:* keine. *Umkehrbar:* jederzeit durch erneutes
Einspielen mit `'needs_review'`.

**A-2 (optional) · Gestaffelt einspielen statt in einem Zug.**
Erst Zeile 208 (`rp-bundestag`) und 211 (`rp-linksfraktion`) auf `'needs_review'`, die vier
Google-Zeilen (207, 209, 210, 214) zunächst auf `'broken'`. Nach einem vollständigen
Crawl-Cron prüfen, dann die Google-Wege nachziehen.
*Grund:* die beiden Direktwege sind unstrittig, die vier Google-Wege nicht. Die Staffelung
trennt eine sichere Verbesserung von einer diskutablen und macht die Wirkung jedes Schritts
in der Telemetrie einzeln sichtbar.

**A-3 (optional) · `required_classes` von `die-linke-brandenburg` korrigieren.**
Zeile 200: `array['partei_pilot','fraktion_pilot','person_pilot']` → `array['partei_pilot']`.
*Grund:* Brandenburg hat in der 8. WP keine Landtagsfraktion der Linken; es existiert weder
ein `fraktion_pilot`- noch ein `person_pilot`-Weg. *Wirkung:* der Brandenburg-Rollup meldet
13 statt 15 Pflichtklassen und hört auf, zwei unerfüllbare Klassen als fehlend zu führen.
*Achtung:* das ist eine **fachliche Paketentscheidung**, keine technische — sie gehört dem
Betreiber.

**A-4 (optional, kein Seed) · Zwei offene Direktwege zu Ende recherchieren.**
Für `bundesregierung` (`/breg-de/service/newsletter-und-abos/rss-newsfeed`) und `dgb`
(`dgb.de/unsere-rss-feeds/` + OPML) ist der Direktweg in `bundeswege-reparaturen.js`
dokumentiert, aber nie ausgelesen worden. Das braucht **einen Lauf mit offenem Egress** (wie
Sprint 9B) und danach eine Änderung in `lib/helmut/sources.js` — also einen eigenen Sprint mit
Codeänderung. Bis dahin bleibt der Google-Ersatz die ehrlichere Lösung als ein toter Weg.
Empfehlung: als OP-Punkt aufnehmen, damit `rp-bundesregierung` nicht dauerhaft ein
Google-abhängiger Kernweg bleibt.

**Nicht empfohlen:** die `method`-Spalten im Seed auf `rss` zurückdrehen. Das stellt keinen
Direktfeed her (F-A) und macht die Datenbank unehrlich gegenüber dem Code.

### 8.6 · Zwei Risiken, die §4 und §5 bisher nicht nennen

**R-1 · „Keine zusätzlichen KI-Kosten" gilt nur für den Crawl-Schritt.** Sechs zusätzliche
Wege liefern zusätzliche Rohdokumente, und die laufen in Understanding. Das Tagesbudget lag in
den letzten acht Tagen zwischen 31 und **100** von 100 — an einem Tag (2026-07-20) war der
Deckel erreicht. Bei 199–384 neuen Dokumenten pro Tag sind grob +40 bis +100 zu erwarten
(+15–30 %). Das Budget ist fail-closed, es entstehen also keine unkontrollierten Kosten — aber
an vollen Tagen **verdrängt** neues Material anderes. Die Staffelung aus A-2 macht diesen
Effekt messbar, bevor er auf sechs Wege gleichzeitig wirkt.

**R-2 · Nach dem Seed beschreiben sechs DB-Zeilen etwas anderes, als der Code tut.** Weil
`on conflict do update` nur `publisher_id`, `method`, `status`, `priority` schreibt (Zeile 350),
behalten die sechs Zeilen ihre alten `url`-, `query`-, `parser`- und `max_items`-Werte. Konkret
stünde danach z. B. `rp-dgb` mit `method='googlenews_search'`, `url='https://www.dgb.de'`,
`parser='html-scrape'`, `max_items=1` in der Tabelle, während real ein Google-News-Feed mit
20 Items abgerufen wird. §2 nennt das „kosmetisch"; das ist zu milde. Es ist kein Crawl-Defekt
(F-A), aber es widerspricht dem Grundsatz „Quellenwahrheit ist relational" und dem Prinzip
„kein falsches Grün": Admin-Ansichten und jede spätere Auswertung lesen dann eine Zeile, die
nicht stimmt. Sauber wäre, die `on-conflict`-Klausel um `url`, `query`, `parser` und
`max_items` zu erweitern — das ist eine **Codeänderung am Generator**
(`scripts/generate-source-architecture-seed.js`) und gehört in einen eigenen Sprint.

### 8.7 · Abschlussurteil

1. **Kann der Seed in seiner jetzigen Form verantwortet werden?**
   **Fachlich ja** — mit einer Empfehlung (A-1) und unter der unveränderten Bedingung aus §5:
   Es fehlt weiterhin die Sicherung. Der fachliche Vorbehalt aus dem Preflight
   („vier Umstellungen auf Google, darunter zwei funktionierende Direkt-RSS-Wege") **hält der
   Prüfung nicht stand**: keiner der sechs Wege liefert heute etwas, kein funktionierender
   Direktfeed wird abgeschaltet, und die Umstellung auf Google ist im Code seit #118 ohnehin
   vollzogen. Der Seed verschiebt das Verhältnis sogar **zugunsten** der Direktwege (3 → 5).

2. **Zwingend erforderliche Änderungen: keine.** Es gibt keine Änderung am Seed, ohne die eine
   Einspielung fachlich unvertretbar wäre. Der einzige harte Blocker bleibt die fehlende
   Sicherung (§5) — unverändert.

3. **Optional / empfohlen:**
   - **A-1 (empfohlen):** `rp-ausschuss-arbeit-soziales` (Zeile 209) auf `'broken'` belassen —
     einziger Google-Weg ohne belegten Eigenertrag.
   - **A-2:** gestaffelt einspielen (erst die zwei Direktwege, dann die Google-Wege).
   - **A-3:** `required_classes` von `die-linke-brandenburg` auf `['partei_pilot']` reduzieren
     (fachliche Entscheidung des Betreibers).
   - **A-4:** eigener Sprint mit Egress, um die Direktfeeds für `bundesregierung` und `dgb`
     auszulesen — damit ein `always_on`+`is_critical`-Kernweg nicht dauerhaft an Google hängt.
   - **R-2:** `on-conflict`-Klausel des Generators erweitern (eigener Sprint, Codeänderung).

4. **Nächster Schritt:** Über die Production-Einspielung wird **erst in einem späteren Sprint**
   entschieden — und erst, wenn die Sicherung nach §7 hergestellt ist. Diese Fachprüfung ändert
   an Go-Kriterium 2 und 8 nichts; sie schließt lediglich Go-Kriterium 11 (bewusste
   Reaktivierung) fachlich ab: die Reaktivierung ist gewollt und begründet, mit der Einschränkung
   aus A-1.
