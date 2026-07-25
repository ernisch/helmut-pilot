# Quellen-Seeds einspielen — Freigabevorlage

**Stand:** 2026-07-25 · **Code-Grundlage:** `main` `61767a9` (Merge #118) · **Deployment:** `READY`

> **Status: BLOCKIERT.** Diese Vorlage ist vollständig vorbereitet, aber die Ausführung ist
> **nicht freigegeben**. Nichts hiervon wurde ausgeführt. Die Vorschau in §4 ist rein lokal
> simuliert, ohne jeden Production-Zugriff.
>
> **Stand 2026-07-25 (zweiter Sicherheits-Sprint):** Von den beiden ursprünglichen Blockern ist
> einer **erledigt** — es gibt jetzt einen gezielten, isoliert getesteten Restore (§5b, 31/31 grün)
> und ein Pre-Seed-Backup mit Prüfsummen (§5). Offen bleibt **nur noch**, dass die Sicherung
> tatsächlich gegen Production **gelaufen** ist — dafür braucht es Betreiberzugriff. Zusätzlich
> muss die **absichtliche Reaktivierung der 6 Bundeswege** (§4 Punkt 11, §6b) freigegeben werden.

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

> **Aktualisiert 2026-07-25:** Der zuvor fehlende gezielte Rückbau **existiert jetzt** —
> `scripts/seed-restore-sql.js` erzeugt aus einer Pre-Seed-Sicherung ein zielgenaues
> Restore-SQL, isoliert getestet mit 31/31 grün (§5b). Damit bleibt als offener Punkt nur noch
> die **Sicherung selbst**.

| Frage | Antwort |
|---|---|
| Aktuelles Backup? | **Nein** — Supabase **Free-Plan**, keine automatischen Backups (`CURRENT_STATE.md` §9) |
| PITR verfügbar? | **Nein** — Teil des offenen, **blockierten** OP-01 |
| Restore-Prozess dokumentiert? | Ja — `betrieb/backup-restore-runbook.md`; PITR-Abschnitt §3 gilt aber ausdrücklich erst **nach** dem Pro-Upgrade |
| Restore getestet? | **Ja, isoliert** — `scripts/seed-restore-test.js`, 31/31 grün, inkl. Bytegleichheit, Idempotenz, Teilerfolg und Manipulationserkennung |
| Manuelles Backup möglich? | **Ja, heute** — `node scripts/backup-export.js --scope=seed` sichert gezielt die 8 betroffenen Tabellen (read-only), mit Prüfsummen, `main`-Commit und Pre-Seed-Kennzeichnung. Ehrliche Grenze: kein transaktionaler Snapshot, nur tabellenweise |
| Technischer Rollback Seed 2? | **Ja, fein** — `20260717_landesmodul_be_bb_seed_rollback.sql` löscht gezielt per `retrieval_path_id` |
| Technischer Rollback Seed 1? | **Neu: ja** — `scripts/seed-restore-sql.js` (gezielt, ohne `drop table`). Der alte `20260713_source_architecture_rollback.sql` bleibt ein `drop table … cascade` und ist für gezielten Rückbau weiterhin **unbrauchbar** — er darf hierfür **nicht** verwendet werden |

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

## 5b · Isolierter Restore-Test (Nachweis)

`node scripts/seed-restore-test.js` → **31 PASS, 0 FAIL** (Teil der Offline-Suite, 145/145).

Der Test führt den vollständigen Zyklus offline und ohne jede Datenbank aus, gegen das **echte
SQL der Repo-Dateien** (Ausgangszustand = die vor #118 committeten Seeds, also der erwartete
Production-Stand; keine echten Production-Daten):

Ausgangszustand → Pre-Seed-Backup → Seed 1 → Prüfung → Seed 2 → Prüfung → Seeds erneut
(Idempotenz) → **Restore** → Vergleich mit dem Ausgangszustand.

Belegt:

- **Bytegleichheit:** der Endzustand nach Restore ist über alle 8 Tabellen byte-identisch zum Ausgangszustand.
- **Idempotenz:** zweiter Lauf der Seeds = 0 Änderungen; zweiter Restore = 0 Änderungen.
- **Teilerfolg:** ein Zustand, in dem nur Seed 1 lief, wird vom Restore vollständig geheilt.
- **Abbruch:** eine nicht committete Transaktion lässt den Ausgangszustand unberührt.
- **Manipulationsschutz:** ein nachträglich verändertes Backup wird per Prüfsumme abgewiesen; ein als `vollstaendig: false` markiertes Backup ebenfalls.
- **Sicherheitszusicherungen am erzeugten SQL:** kein `drop`/`truncate`, eine Transaktion, Vorher- **und** Nachher-Check mit hartem Abbruch, keine Elterntabellen angefasst, 162 Abrufwege unverändert.

**Ehrliche Grenzen dieses Nachweises:**

- Der Test nutzt einen **minimalen SQL-Ausführer**, der genau die Statement-Formen von Seeds und
  Restore versteht — kein Postgres. Er beweist die *Datenlogik*, nicht das Verhalten einer echten
  Datenbank (Constraints, Trigger, Nebenläufigkeit).
- **`updated_at` lässt sich nicht zurücksetzen:** auf diesen Tabellen liegt ein
  `set_updated_at`-Trigger. Nach einem Restore trägt jede angefasste Zeile einen neuen
  `updated_at`-Wert. Fachlich ohne Bedeutung — die Spalte wird nirgends für Auswahl, Crawl-Plan
  oder Anzeige ausgewertet; alle fachlichen Spalten sind nachweislich byte-identisch.
- Ebenfalls bewusst **nicht** zurückgesetzt: `last_success_at`, `last_error`, `error_streak`
  (Laufzeit-Telemetrie). Die Seeds fassen sie nicht an; sie zurückzuschreiben würde echte
  Betriebsdaten überschreiben, die zwischen Backup und Restore entstanden sind.
- Bei der Absicherung des Tests gegen sich selbst zeigte sich: Mutationen, die die *Form* eines
  Statements verändern, lassen den Mini-Ausführer abbrechen statt eine Regression zu melden. Eine
  **formerhaltende** Mutation (eine zu entfernende Zuordnung in der Keep-Liste belassen) wird
  dagegen zuverlässig als 2 FAILs gefangen — die Erkennung ist also belegt, aber der Ausführer ist
  kein allgemeiner SQL-Prüfer.

---

## 6 · Abnahmekriterien

**Go — alle müssen erfüllt sein:**

| # | Kriterium | Stand |
|---|---|---|
| 1 | PR #118 gemergt und deployt | ✅ `61767a9`, CI grün, Vercel `READY` |
| 2 | Backup oder PITR bestätigt | ❌ **offen** — Werkzeug steht (`--scope=seed`), der Lauf gegen Production ist noch nicht erfolgt (Betreiberzugriff) |
| 3 | Vorschau ohne unerwarteten Diff | ✅ §4 |
| 4 | Exakte Soll-Zahlen dokumentiert | ✅ §4 |
| 5 | Rollback geprüft | ✅ **erledigt** — gezielter Restore-Generator, isoliert getestet 31/31 (§5b) |
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

## 6b · Die sechs reaktivierten Bundeswege — Kontrollkarten

Alle Werte aus dem echten Katalog erzeugt (`buildFullModel()` + `v1Sources`).
Gemeinsam für alle sechs: **Crawl-Häufigkeit** = die bestehenden Crawl-Crons (04:00/20:00 UTC),
**keine** eigene Frequenz · **keine KI-Folgekosten** (Crawl ≠ Understanding; Understanding läuft
budgetiert und fail-closed) · **Rücksetzweg** = `update public.retrieval_paths set status='broken'
where id='<id>'` (einzeln, sofort wirksam, kein Deploy nötig) · **Prüfmetrik** = die Pro-Weg-Telemetrie
(`source_crawl_telemetry`) und der Health-Report.

| # | ID | Herausgeber | Typ | Status alt → neu | Aktivierung | Zusatzumfang | Risiko | Dedup |
|---|---|---|---|---|---|---|---|---|
| 1 | `rp-bundestag` | bundestag.de | **Direktfeed** (RSS) | `broken` → `needs_review` | `always_on` — **läuft sofort** | ≤16 Items | gering (offizieller Feed) | ❌ nein (Direktfeed, pro Mandant) |
| 2 | `rp-bundesregierung` | bundesregierung.de | Google News | `broken` → `needs_review` | `always_on` — **läuft sofort** | ≤16 Items | 429/Timeout bei IP-Drosselung | ✅ ja |
| 3 | `rp-die-linke` | die-linke.de | Google News | `broken` → `needs_review` | `auto` — nur bei aktivem Paket | ≤16 Items | 429/Timeout | ✅ ja |
| 4 | `rp-linksfraktion` | dielinkebt.de | **Direktfeed** (RSS) | `broken` → `needs_review` | `auto` | ≤16 Items | gering | ❌ nein |
| 5 | `rp-ausschuss-arbeit-soziales` | bundestag.de | Google News | `broken` → `needs_review` | `auto` | ≤16 Items | 429/Timeout | ✅ ja |
| 6 | `rp-dgb` | dgb.de | Google News | `broken` → `needs_review` | `auto` | ≤16 Items | 429/Timeout | ✅ ja |

**Stopbedingung je Weg:** zwei aufeinanderfolgende Crawl-Läufe mit Fehler/Timeout **oder** ein
Weg liefert dauerhaft 0 Items → betroffenen Weg einzeln auf `broken` zurücksetzen (Zeile oben),
kein Gesamt-Rollback nötig.

**Erneut verifizierte Antworten:**

1. **Garantiert sofort:** 2 (`rp-bundestag`, `rp-bundesregierung` — `always_on`, unabhängig von jeder Paketaktivierung).
2. **Profilabhängig:** 4 (`auto` — laufen, sobald ihr Paket für mindestens ein Profil aktiv ist; in Production der Regelfall).
3. **Crawl-Amplifikation ausgeschlossen?** Für die 4 Google-Wege **ja** — mandantenunabhängige URLs, von der Shared-Path-Dedup aus PR #120 erfasst. Die **2 Direktfeeds** sind bewusst **nicht** dedupliziert und laufen einmal pro Mandant (heute 6× pro Cron-Lauf) — bei offiziellen Feeds unkritisch, aber ehrlich zu benennen.
4. **Google-News-Konzentration:** steigt 134 → 138 von 143 Wegen. Bei offenem Circuit Breaker liefern dann nur noch **5 statt 9** Direktfeeds. Bekannter SPOF, im Audit als eigener P1 geführt — durch diese Einspielung leicht verschärft.
5. **Kosten:** ≈ 4 zusätzliche Google-Abrufe + 2 Direktabrufe pro Cron-Lauf. Kein LLM-Aufwand.
6. **KI-Folgeprozesse:** nein. Mehr Rohdokumente können mittelbar mehr Understanding-Cluster erzeugen; das läuft gegen das bestehende Tagesbudget (fail-closed) und ist kein neuer Pfad.
7. **Einzeln zurücksetzbar:** ja, je Weg eine Zeile — ohne Rollback der Seeds.

---

## 6c · Production-Runbook (verbindliche Reihenfolge)

> Jeder Schritt ist eine eigene Entscheidung. Bei jedem Stop-Kriterium: **anhalten**, nicht „durchziehen".

| # | Schritt | Prüfung / Kommando |
|---|---|---|
| 1 | `main`-Stand verifizieren | `git ls-remote origin refs/heads/main` = erwarteter Commit; Seeds unverändert seit dem Test |
| 2 | Locks und laufende Prozesse | `select * from pipeline_locks;` → keine aktiven Crawl-/Understanding-Locks |
| 3 | Production-Health | Health-Report ohne Störung; **nicht** im Crawl-Fenster (04:00/20:00 UTC) starten |
| 4 | **Pre-Seed-Backup** | `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/backup-export.js --scope=seed` |
| 5 | Backup-Integrität | `manifest.json`: `art: "pre-seed"`, `vollstaendig: true`, `pruefsummeGesamt` vorhanden, `mainCommit` = Schritt 1 |
| 6 | Soll-Zahlen bestätigen | Ist-Zustand gegen §4 prüfen: 162 Abrufwege, 6 Pakete, 163 Zuordnungen |
| 7 | **Seed 1 einzeln** | `20260713_source_architecture_seed.sql` einspielen |
| 8 | Seed 1 prüfen | `source_packages` = **8**, `package_paths` = **164**, die 6 Wege auf `needs_review` |
| 9 | Bei Abweichung | **Stop** → Restore erzeugen (`node scripts/seed-restore-sql.js <backup>`), prüfen, einspielen |
| 10 | **Seed 2 einzeln** | `20260717_landesmodul_be_bb_seed.sql` einspielen |
| 11 | Seed 2 prüfen | `package_paths` = **164** (4 raus / 4 rein); `select package_id from package_paths where retrieval_path_id='rp-be-partei_pilot'` → `pkg-die-linke-berlin` |
| 12 | Gesamtzustand | Zahlen gegen §4 |
| 13 | **BE/BB-Sperre** | `select count(*) from retrieval_paths where id like 'rp-be-%' or id like 'rp-bb-%' and status='healthy'` → **0**; Crawl-Plan enthält 0 BE/BB-Wege |
| 14 | Bundestagsquellen | `select count(*) from retrieval_paths` → **162**, keine Zeile verloren |
| 15 | Die 6 Wege überwachen | Nach dem ersten Crawl: Telemetrie je Weg (Items > 0, kein Dauerfehler) — Stopbedingung §6b |
| 16 | Idempotenz | Beide Seeds ein zweites Mal einspielen → **0 Änderungen** (oder read-only-Vergleich) |
| 17 | Dokumentation | `CURRENT_STATE.md` + diese Vorlage nachziehen |

---

## 7 · Betreiberentscheidung

### Option A — jetzt kontrolliert ausführen

**Wird nicht empfohlen.** Go-Kriterium 2 (Backup/PITR) und 8 (Freigabe) sind nicht erfüllt.

### Option B — Ausführung blockieren ← **empfohlen**

**Es fehlt nur noch eine Voraussetzung: die Sicherung muss tatsächlich gelaufen sein.**
Werkzeug und Rückweg stehen bereit und sind getestet.

Konkret zu tun, in dieser Reihenfolge:

1. **Pre-Seed-Backup gegen Production laufen lassen** (read-only, keine Kostenentscheidung nötig):
   `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/backup-export.js --scope=seed`
   Danach prüfen: `manifest.json` trägt `art: "pre-seed"`, `vollstaendig: true`, eine
   `pruefsummeGesamt` und den `mainCommit`. Nur ein so markiertes Backup akzeptiert der
   Restore-Generator.
2. **Reaktivierung der 6 Bundeswege freigeben** (§6b) — das ist eine bewusste Verhaltensänderung
   in Production, keine Nebenwirkung.
3. Danach Runbook §6c Schritt für Schritt.

**Dauerhaft empfohlen, aber für diese Einspielung nicht zwingend:** OP-01 freigeben
(Supabase Pro + PITR). Das bleibt das größte Einzelrisiko des Projekts insgesamt —
**die Kostenentscheidung liegt ausschließlich beim Betreiber.**
