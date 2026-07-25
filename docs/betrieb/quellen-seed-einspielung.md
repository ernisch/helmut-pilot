# Quellen-Seeds einspielen — Freigabevorlage

**Stand:** 2026-07-25 · **Code-Grundlage:** `main` `61767a9` (Merge #118) · **Deployment:** `READY`

> **Status: BLOCKIERT.** Diese Vorlage ist vollständig vorbereitet, aber die Ausführung ist
> **nicht freigegeben** — es fehlt eine belastbare Sicherung (§5). Nichts hiervon wurde ausgeführt.
> Die Vorschau in §4 ist rein lokal simuliert, ohne jeden Production-Zugriff.

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
