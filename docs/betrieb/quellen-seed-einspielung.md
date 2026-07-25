# Quellen-Seeds einspielen — Freigabevorlage

**Stand:** 2026-07-25 · **Code-Grundlage der Seeds:** `main` `61767a9` (Merge #118) ·
**`main`-HEAD:** `4089b5d` (Merge #126) · **Deployment:** `READY`

> **Status: BLOCKIERT.** Diese Vorlage ist vollständig vorbereitet, aber die Ausführung ist
> **nicht freigegeben**. Nichts hiervon wurde ausgeführt.
>
> **Offen sind genau drei Go-Kriterien (§6), alle drei Betreiberhandlungen:**
> **2** die Pre-Seed-Sicherung muss gegen Production **gelaufen** sein ·
> **8** die Einspielung muss freigegeben sein ·
> **11** die **absichtliche Reaktivierung der 6 Bundeswege** (§4 Punkt 11, §6b) muss
> ausdrücklich mitfreigegeben werden.
>
> Werkzeug und Rückweg sind gebaut und isoliert getestet (§5b, 43/43 grün).
>
> **Korrigiert 2026-07-25 nach dem Review von PR #125:** Die ursprüngliche Fassung dieser Vorlage
> rechnete mit einem simulierten Ausgangszustand (6 Pakete / 162 Wege / 163 Zuordnungen). Die
> read-only erhobene [Paket-Inventur](../quellenarchitektur/30-paket-inventur-production.md) misst
> in Production **7 / 163 / 165**. Alle Soll-Zahlen und Prüfschritte sind daraufhin korrigiert
> worden; die Prüfungen arbeiten jetzt mit **gemessenen Deltas und benannten Zeilen** statt mit
> absoluten Zahlen aus einer Doku.

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
3. Setzt bei **6 Bundeswegen** `status` von `broken` auf `needs_review`. Bei **4** davon ändert
   sich zusätzlich die `method` — **alle vier nach `googlenews_search`** (korrigiert 2026-07-25;
   die frühere Angabe „2× `html` → `rss`" war in Anzahl und Richtung falsch):

   | Weg | `method` vorher → nachher |
   |---|---|
   | `rp-bundesregierung` | `rss` → `googlenews_search` |
   | `rp-die-linke` | `rss` → `googlenews_search` |
   | `rp-ausschuss-arbeit-soziales` | `html` → `googlenews_search` |
   | `rp-dgb` | `html` → `googlenews_search` |
   | `rp-bundestag` | `rss` (unverändert, nur neue URL) |
   | `rp-linksfraktion` | `rss` (unverändert, nur neue URL) |

4. Enthält **1 Paketzuordnung** `pkg-die-linke-bund` → `rp-fraction-linke`. **In Production ist
   sie bereits vorhanden**, der Insert läuft also ins Leere (§4). Wirksam wird dieser Teil des
   Seeds nur gegen eine Datenbank, die ihn noch nicht hat.

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

## 4 · Soll-Ist-Vorschau

> **Korrigiert 2026-07-25 (Review PR #125).** Diese Vorschau beruhte zunächst allein auf einer
> lokalen Simulation der committeten Seeds. Die read-only erhobene
> [Paket-Inventur](../quellenarchitektur/30-paket-inventur-production.md) (§2, gleiches Datum)
> widerlegt drei der angenommenen Ausgangszahlen. Maßgeblich ist ab hier die **gemessene**
> Spalte; die Simulation bleibt als Nachweis der Seed-Wirkung stehen.

**Zwei Quellen, die man auseinanderhalten muss:**

1. **Simulation** der committeten Seeds (Grundlage von `scripts/seed-restore-test.js`): sagt exakt,
   **was die Seeds tun**.
2. **Production-Inventur** vom 2026-07-25 (read-only gemessen): sagt, **worauf sie treffen**.

Sie unterscheiden sich, und zwar erklärbar:

| Abweichung Simulation → Production | Betrag | Ursache |
|---|---|---|
| `source_packages` | +1 | `profil-<mandats-id>` — entsteht bei der Provisionierung, steht bewusst **nicht** im Code-Seed |
| `retrieval_paths` | +1 | `rp-<mandats-id>-news` — dito |
| `package_paths` | +1 | die Zuordnung der beiden obigen |
| `package_paths` | +1 | **`pkg-die-linke-bund` führt bereits 3 statt 2 Zuordnungen** — die von Seed 1 vorgesehene Zuordnung `→ rp-fraction-linke` **existiert in Production schon** |

**Erwarteter Verlauf (Ist gemessen, Soll daraus abgeleitet):**

| Tabelle | Ist (gemessen 2026-07-25) | nach Seed 1 | nach Seed 2 |
|---|---|---|---|
| `geographies` | 50 | 50 | 50 |
| `political_entities` | 73 | 73 | 73 |
| `publishers` | 64 | 64 | 64 |
| `source_packages` | **7** | **9** (+2) | 9 |
| `retrieval_paths` | **163** | 163 (6 aktualisiert) | 163 |
| `package_paths` | **165** | **165** (+0, siehe unten) | 165 (−4 / +4) |
| `path_expected_levels` | 18 | 18 | 18 |
| `path_expected_geographies` | 18 | 18 | 18 |

**Exakte Soll-Zahlen (bezogen auf den gemessenen Ist-Stand):**

| Nr. | Kennzahl | Soll |
|---|---|---|
| 4 | betroffene **Publisher** | **0** (keine neuen, keine geänderten) |
| 5 | betroffene **Retrieval Paths** | **6** (aktualisiert; 0 neu, 0 entfernt) |
| 6 | betroffene **Source Packages** | **4** (2 neu + 2 mit reduzierten `required_classes`) |
| 7 | **entfernte** alte Paketzuordnungen | **4** (alle aus Seed 2) |
| 8 | **neu eingefügte** Paketzuordnungen | **4** (alle aus Seed 2) |
| — | Gesamtzahl Einfügungen | Seed 1: **2** (die 2 Pakete) · Seed 2: **4** |
| — | Gesamtzahl Aktualisierungen | Seed 1: **8** (6 Wege + 2 Pakete) · Seed 2: **0** |
| — | Gesamtzahl Löschungen | Seed 1: **0** · Seed 2: **4** |

> **Warum Seed 1 in Production 0 statt 1 Zuordnung einfügt:** Seed 1 enthält
> `('pkg-die-linke-bund', 'rp-fraction-linke')`. Die Inventur weist für dieses Paket bereits
> **3** Zuordnungen aus, der Seed-Stand vor #118 erzeugt nur 2 — die dritte ist genau diese.
> Der Insert läuft in `on conflict … do nothing` und ist damit wirkungslos. **Gegen eine leere
> Datenbank** (also in der Simulation und im Offline-Test) fügt Seed 1 sehr wohl +1 ein; deshalb
> weichen Test und Production hier bewusst voneinander ab.
>
> Damit entfällt auch die frühere Begründung, das Partei-Paket werde „mit 0 funktionierenden Wegen
> ausgeliefert": die Inventur (§3) weist `die-linke-bund` mit einem funktionierenden Weg und
> Lieferung am 2026-07-25 aus.

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

**Kosten-/Crawl-Wirkung (korrigiert 2026-07-25):** 4 der 6 Wege sind Google-News-Suchen. Sie sind
mandantenunabhängig und werden von der Shared-Path-Deduplizierung aus PR #120 erfasst (Mandant 2+ →
`skipped-shared`) — dort entsteht **keine** Mandanten-Amplifikation. Die **2 Direktfeeds**
(`rp-bundestag`, `rp-linksfraktion`) werden **nicht** dedupliziert: `sharedFetchKey` greift nur bei
`news.google.`-URLs. Sie laufen einmal **je aktivem Profil**.

| Anteil | Abrufe pro Cron-Lauf |
|---|---|
| 4 Google-News-Wege (dedupliziert) | 4 |
| 2 Direktfeeds × 6 aktive Profile (Inventur §5) | 12 |
| **Summe** | **≈ 16** |

**Keine** zusätzlichen KI-Kosten (Crawl ≠ Understanding).

**Zum Google-News-Klumpenrisiko:** im Katalog steigt der Google-Anteil von 134 auf 138 von 143
Wegen, die Zahl der Nicht-Google-Wege sinkt von 9 auf 5. **Laufzeitseitig verbessert sich der
SPOF trotzdem:** alle 6 heute defekten Wege liegen in diesen 9, es laufen also heute real nur
**3** Direktfeeds; nach der Einspielung sind es **5**. Die frühere Formulierung „durch diese
Einspielung leicht verschärft" war falsch.

**12 · Bleiben Berlin/Brandenburg vorbereitet, aber inaktiv?** — **Ja, verifiziert.** Ausführung
von `buildRelationalCrawlPlan` mit einem Berlin-/Linke-Landtagsprofil: **alle 18 BE/BB-Wege
ausgeschlossen, jeder mit Grund `landesmodul-gesperrt`, 0 im aktiven Plan.**

**Wie das Gate wirklich greift (korrigiert 2026-07-25):** `isLandesmodulPath`
(`lib/helmut/quellenarchitektur/source-mode.js`) prüft **drei** Kriterien, die per ODER
verknüpft sind — Pfad-ID-Präfix (`rp-be-`/`rp-bb-`), `legacy_source_id`-Präfix (`be-`/`bb-`)
**und den Paketschlüssel** (`berlin-basis`/`brandenburg-basis`).

Die frühere Aussage „das Gate greift über Pfad-IDs, **nicht** über Paketschlüssel" war falsch —
und sie war in die gefährliche Richtung falsch. Für `rp-rbb24-politik` (ID passt nicht,
`legacy_source_id` passt nicht) ist der **Paketschlüssel die einzige Barriere**. Dieser Weg
bleibt durch Seed 2 in beiden Landes-Basispaketen, das Gate hält also — aber es hält **wegen**
des Paketschlüssels, nicht unabhängig davon. Wer künftig einen BE/BB-Weg in ein Paket außerhalb
der beiden Basispakete umsortiert und dessen ID kein `rp-be-`/`rp-bb-`-Präfix trägt, öffnet das
Gate. Das gilt es bei jeder weiteren Umsortierung zu prüfen.

Zweite, unabhängige Barriere: beide neuen Pakete sind `prepared` und werden nie `active`.

**13 · Bestehende aktive Bundestagsquellen:** unbeschädigt. `retrieval_paths` bleibt bei **163**
Zeilen, es wird keine Zeile entfernt; die einzigen Änderungen an bestehenden Wegen sind die 6
Reparaturen (die vorher **nicht** liefen). `publishers` unverändert.

**14 · Wiederholte Ausführung:** erzeugt **keinen** zusätzlichen Diff (§2).

---

## 5 · Backup und Rollback — hier liegt der Blocker

> **Aktualisiert 2026-07-25:** Der zuvor fehlende gezielte Rückbau **existiert jetzt** —
> `scripts/seed-restore-sql.js` erzeugt aus einer Pre-Seed-Sicherung ein zielgenaues
> Restore-SQL, isoliert getestet mit 43/43 grün (§5b). Damit bleibt als offener Punkt nur noch
> die **Sicherung selbst**.

| Frage | Antwort |
|---|---|
| Aktuelles Backup? | **Nein** — Supabase **Free-Plan**, keine automatischen Backups (`../CURRENT_STATE.md` §9) |
| PITR verfügbar? | **Nein** — Teil des offenen, **blockierten** OP-01 |
| Restore-Prozess dokumentiert? | Ja — `backup-restore-runbook.md`; PITR-Abschnitt §3 gilt aber ausdrücklich erst **nach** dem Pro-Upgrade |
| Restore getestet? | **Ja, isoliert** — `scripts/seed-restore-test.js`, 43/43 grün, inkl. Bytegleichheit, Idempotenz, Teilerfolg und Manipulationserkennung |
| Manuelles Backup möglich? | **Ja, heute** — `node scripts/backup-export.js --scope=seed` sichert gezielt die 8 betroffenen Tabellen (read-only), mit Prüfsummen, `main`-Commit und Pre-Seed-Kennzeichnung. Ehrliche Grenze: kein transaktionaler Snapshot, nur tabellenweise |
| Technischer Rollback Seed 2? | **Ja, fein** — `supabase/seeds/20260717_landesmodul_be_bb_seed_rollback.sql` löscht gezielt per `retrieval_path_id` |
| Technischer Rollback Seed 1? | **Neu: ja** — `scripts/seed-restore-sql.js` (gezielt, ohne `drop table`). Der alte `supabase/migrations/20260713_source_architecture_rollback.sql` bleibt ein `drop table … cascade` und ist für gezielten Rückbau weiterhin **unbrauchbar** — er darf hierfür **nicht** verwendet werden |

> **Wichtig: zwei verschiedene Rückwege, nicht verwechseln.** Die folgenden drei Antworten
> beschrieben ursprünglich die **alte** Datei `20260717_landesmodul_be_bb_seed_rollback.sql`,
> standen aber unqualifiziert da und widersprachen damit §5b (Review PR #125, Befund 7).
> Freigegeben und getestet ist der **Generator** `scripts/seed-restore-sql.js`.

| Frage | alte Rollback-SQL | **`seed-restore-sql.js`** (der freigegebene Weg) |
|---|---|---|
| Entfernt er alle neu erzeugten Zuordnungen? | nur die BE/BB-Wege; die Bund-Zuordnung `pkg-die-linke-bund → rp-fraction-linke` **nicht** | **ja** — er stellt `package_paths` innerhalb der 8 Seed-Pakete exakt auf den gesicherten Stand |
| Stellt er die alten Zuordnungen wieder her? | **nein**, er löscht nur | **ja** — er fügt genau die gesicherten Zuordnungen wieder ein |
| Bleiben leere Pakete zurück? | ja (`die-linke-berlin`/`-brandenburg` bleiben als leere `prepared`-Pakete stehen) | **nein** — beide werden entfernt, sofern sie nicht schon im Backup standen |
| Fasst er Zeilen außerhalb des Seed-Bereichs an? | — | **nein** — Pakete aus der Provisionierung (`profil-<mandats-id>`) bleiben unberührt, auch wenn sie erst nach dem Backup entstanden sind |

**Teilerfolg zwischen Seed 1 und Seed 2:** unkritisch. Beide Seeds sind je für sich transaktional.
Läuft nur Seed 1, entstehen die 2 neuen Pakete leer und die 4 Landeswege bleiben an den
Pflichtpaketen — also exakt der heutige Zustand plus zwei ungenutzte Pakete. Kein inkonsistenter
Zwischenzustand, kein Datenverlust. Seed 2 kann jederzeit nachgezogen werden.

**Timeout oder Verbindungsabbruch:** Wegen `begin;`/`commit;` gilt alles-oder-nichts. Bei
unklarem Ausgang **nicht blind wiederholen**, sondern zuerst read-only prüfen — und zwar
zeilenbezogen statt über Gesamtzahlen:

```sql
-- Lief Seed 1 durch?  Soll nach Seed 1: 2 Zeilen
select id from public.source_packages
 where id in ('pkg-die-linke-berlin', 'pkg-die-linke-brandenburg');

-- Lief Seed 2 durch?  Soll nach Seed 2: pkg-die-linke-berlin
select package_id from public.package_paths where retrieval_path_id = 'rp-be-partei_pilot';
```

Da beide Seeds idempotent sind, ist eine Wiederholung nach dieser Prüfung gefahrlos.

---

## 5b · Isolierter Restore-Test (Nachweis)

`node scripts/seed-restore-test.js` → **43 PASS, 0 FAIL** (Teil der Offline-Suite, 147/147).
`node scripts/backup-export-test.js` → **38 PASS, 0 FAIL**.

In CI sind es **41 PASS, 0 FAIL**: zwei Prüfungen belegen, dass die Fixture noch dem Stand vor
#118 (`54fe370`) entspricht, und brauchen dafür die volle Git-Historie. `actions/checkout` klont
flach, deshalb melden sie dort ausdrücklich „Herkunft nicht prüfbar" statt still durchzulaufen.
Der inhaltliche Nachweis ist in beiden Fällen vollständig — nachgestellt und verifiziert in einem
echten `--depth 1`-Klon.

Der Test führt den vollständigen Zyklus offline und ohne jede Datenbank aus, gegen das **echte
SQL der Repo-Dateien** (Ausgangszustand = die vor #118 committeten Seeds als Fixture unter
`scripts/fixtures/seeds-vor-pr118/`, also der erwartete Production-Stand; keine echten
Production-Daten):

Ausgangszustand → Pre-Seed-Backup → Seed 1 → Prüfung → Seed 2 → Prüfung → Seeds erneut
(Idempotenz) → **Restore** → Vergleich mit dem Ausgangszustand.

Belegt:

- **Bytegleichheit:** der Endzustand nach Restore ist über alle 8 Tabellen byte-identisch zum Ausgangszustand.
- **Idempotenz:** zweiter Lauf der Seeds = 0 Änderungen; zweiter Restore = 0 Änderungen.
- **Teilerfolg:** ein Zustand, in dem nur Seed 1 lief, wird vom Restore vollständig geheilt.
- **Abbruch:** eine nicht committete Transaktion lässt den Ausgangszustand unberührt.
- **Manipulationsschutz:** ein nachträglich verändertes Backup wird per Prüfsumme abgewiesen; ein als `vollstaendig: false` markiertes Backup ebenfalls.
- **Sicherheitszusicherungen am erzeugten SQL:** kein `drop`/`truncate`, eine Transaktion, Vorher- **und** Nachher-Check mit hartem Abbruch (beide werden im Test tatsächlich ausgeführt, nicht nur gezählt), keine Elterntabellen angefasst, keine Zeile in `retrieval_paths` entfernt.

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
| 3 | Vorschau ohne unerwarteten Diff | ⚠️ **eingeschränkt** — die Simulation zeigt keinen unerwarteten Diff, aber sie trifft in Production auf einen **anderen Ausgangszustand** als angenommen (§4). Der Ist-Stand wird deshalb in Schritt 6 **gemessen**, nicht vorausgesetzt |
| 4 | Exakte Soll-Zahlen dokumentiert | ✅ §4 — seit dem Review gegen die gemessene Inventur abgeglichen und korrigiert |
| 5 | Rollback geprüft | ✅ **erledigt** — gezielter Restore-Generator, isoliert getestet 43/43 (§5b) |
| 6 | Keine laufende Migration / kritische Verarbeitung | ⚠️ vor Ausführung prüfen (Crawl-Cron 04:00/20:00 UTC, Understanding 05:30/21:30) |
| 7 | Kein Konflikt mit neuen `main`-Änderungen | ✅ Stand `118e90c` (Merge #124) — #124 änderte keine Seeds, sondern lieferte die Inventur, die §4 korrigiert hat |
| 8 | Betreiberfreigabe | ❌ **offen** |
| 9 | Seeds einzeln ausführen | Vorgabe für die Ausführung |
| 10 | Nach jedem Seed Soll-Ist-Vergleich | Vorgabe (Prüfabfragen in §5) |
| 11 | Keine automatische Quellenaktivierung | ⚠️ **bewusst nicht erfüllt** — §4 Punkt 11: 6 Wege werden absichtlich wieder ausführbar. Muss ausdrücklich mitfreigegeben werden |
| 12 | Keine Crawl-Amplifikation | ✅ durch #120 abgedeckt |
| 13 | Keine mandantenübergreifende Fehlzuordnung | ✅ §4 Punkt 12 |

**Stop — jedes einzelne Kriterium bricht ab:** eine der zeilenbezogenen Prüfungen aus §6c
Schritt 8/11/13/14 schlägt fehl · BE/BB-Wege erscheinen im aktiven Plan · bestehende aktive Pfade
verschwinden · zweiter Lauf erzeugt einen Diff · Backup-Status unklar oder `vollstaendig: false` ·
Fehler zwischen den beiden Seeds · neue `main`-Commits berühren die Seeds oder `sources.js` ·
Production-Health verschlechtert sich · Rollback nicht eindeutig möglich.

> **Nicht** als Stop-Kriterium: eine Abweichung der **absoluten Gesamtzahlen** von §4. Diese Zahlen
> driften legitim (jede Provisionierung erhöht sie). Deshalb misst Schritt 6 den Ist-Stand und die
> Folgeprüfungen arbeiten mit **Deltas und benannten Zeilen**. Genau diese Verwechslung hätte eine
> korrekte Datenbank fälschlich gestoppt.

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
3. **Crawl-Amplifikation ausgeschlossen?** Für die 4 Google-Wege **ja** — mandantenunabhängige URLs, von der Shared-Path-Dedup aus PR #120 erfasst. Die **2 Direktfeeds** sind bewusst **nicht** dedupliziert (`sharedFetchKey` greift nur bei `news.google.`-URLs) und laufen einmal **je aktivem Profil**, heute also 6× pro Cron-Lauf — bei offiziellen Feeds unkritisch, aber ehrlich zu benennen.
4. **Google-News-Konzentration:** im Katalog steigt sie 134 → 138 von 143 Wegen, die Nicht-Google-Wege sinken 9 → 5. **Laufzeitseitig verbessert sich der SPOF trotzdem:** alle 6 defekten Wege liegen in diesen 9, real laufen heute nur **3** Direktfeeds, danach **5**. Die frühere Angabe „durch diese Einspielung leicht verschärft" war falsch.
5. **Kosten:** ≈ 4 Google-Abrufe + 2 × 6 Profile = 12 Direktabrufe, zusammen **≈ 16 zusätzliche Abrufe pro Cron-Lauf**. Kein LLM-Aufwand.
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
| 6 | **Ist-Stand messen und notieren** | Die drei Zahlen **aufschreiben**, nicht gegen eine Doku-Zahl abgleichen — sie driften (siehe §4). `select (select count(*) from retrieval_paths) as wege, (select count(*) from source_packages) as pakete, (select count(*) from package_paths) as zuordnungen;` · Erwartung laut Inventur: **163 / 7 / 165**. Weicht es ab: **kein automatischer Stop**, aber die Abweichung erklären (neue Provisionierung?) und die notierten Werte als Basis für Schritt 8/11/12 verwenden |
| 7 | **Seed 1 einzeln** | `20260713_source_architecture_seed.sql` einspielen |
| 8 | Seed 1 prüfen (zeilenbezogen) | `select id from source_packages where id in ('pkg-die-linke-berlin','pkg-die-linke-brandenburg');` → **2 Zeilen** · `select id, status from retrieval_paths where id in (…die 6…);` → alle `needs_review` · `select cardinality(required_classes) from source_packages where id='pkg-berlin-basis';` → **12** · Pakete = Basis aus Schritt 6 **+2**, Zuordnungen = Basis **+0** |
| 9 | Bei Abweichung | **Stop** → Restore erzeugen (`node scripts/seed-restore-sql.js <backup>`), Ausgabe **lesen**, dann einspielen |
| 10 | **Seed 2 einzeln** | `20260717_landesmodul_be_bb_seed.sql` einspielen |
| 11 | Seed 2 prüfen (zeilenbezogen) | `select package_id from package_paths where retrieval_path_id='rp-be-partei_pilot';` → `pkg-die-linke-berlin` · dasselbe für `rp-be-fraktion_pilot`, `rp-be-person_pilot` (→ `pkg-die-linke-berlin`) und `rp-bb-partei_pilot` (→ `pkg-die-linke-brandenburg`) · Zuordnungen unverändert gegenüber Schritt 8 (4 raus / 4 rein) |
| 12 | Bei Abweichung | **Stop** → wie Schritt 9 |
| 13 | **BE/BB-Sperre** (wirksame Prüfung) | `select count(*) from retrieval_paths rp join package_paths pp on pp.retrieval_path_id = rp.id join source_packages sp on sp.id = pp.package_id where sp.key in ('berlin-basis','brandenburg-basis') and rp.activation_mode <> 'manual';` → **0**. **Nicht** gegen `status='healthy'` prüfen: alle 18 Landesmodul-Wege stehen auf `needs_review`, diese Abfrage liefert immer 0 und beweist nichts. Zusätzlich der belastbare Nachweis: Crawl-Plan mit einem BE-Profil erzeugen → 0 BE/BB-Wege aktiv, alle mit Grund `landesmodul-gesperrt` |
| 14 | Bundestagsquellen | `select count(*) from retrieval_paths;` → **unverändert gegenüber Schritt 6** (keine Zeile verloren, keine hinzugekommen) |
| 15 | Idempotenz | Beide Seeds ein zweites Mal einspielen → **0 Änderungen**. **Vor** Schritt 16 ausführen, nicht danach |
| 16 | Die 6 Wege überwachen | Nach dem ersten Crawl: Telemetrie je Weg (Items > 0, kein Dauerfehler) — Stopbedingung §6b. **Wichtig:** Wird hier ein Weg bewusst auf `broken` zurückgesetzt, darf Seed 1 **nicht erneut** eingespielt werden — sein `on conflict do update set status = excluded.status` würde die Entscheidung stillschweigend rückgängig machen. Genau deshalb steht die Idempotenzprobe davor |
| 17 | Dokumentation | `CURRENT_STATE.md` + diese Vorlage nachziehen |

---

## 7 · Betreiberentscheidung

### Option A — jetzt kontrolliert ausführen

**Wird nicht empfohlen.** Drei Go-Kriterien sind offen: 2 (Backup), 8 (Betreiberfreigabe) und
11 (Reaktivierung der 6 Wege muss ausdrücklich mitfreigegeben werden).

### Option B — Ausführung blockieren ← **empfohlen**

**Es fehlen genau die drei Go-Kriterien 2, 8 und 11 — alle drei sind Betreiberhandlungen, keine
Bauarbeit.** Werkzeug und Rückweg stehen bereit und sind getestet.

Konkret zu tun, in dieser Reihenfolge:

1. **Pre-Seed-Backup gegen Production laufen lassen** (read-only, keine Kostenentscheidung nötig):
   `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/backup-export.js --scope=seed`
   Danach prüfen: `manifest.json` trägt `art: "pre-seed"`, `vollstaendig: true`, eine
   `pruefsummeGesamt` und den `mainCommit`. Nur ein so markiertes Backup akzeptiert der
   Restore-Generator.
2. **Reaktivierung der 6 Bundeswege freigeben** (§6b, Go-Kriterium 11) — das ist eine bewusste
   Verhaltensänderung in Production, keine Nebenwirkung.
3. **Die Einspielung selbst freigeben** (Go-Kriterium 8).
4. Danach Runbook §6c Schritt für Schritt.

**Dauerhaft empfohlen, aber für diese Einspielung nicht zwingend:** OP-01 freigeben
(Supabase Pro + PITR). Das bleibt das größte Einzelrisiko des Projekts insgesamt —
**die Kostenentscheidung liegt ausschließlich beim Betreiber.**
