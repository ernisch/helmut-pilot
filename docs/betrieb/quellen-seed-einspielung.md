# Quellen-Seeds einspielen — Freigabevorlage

**Stand:** 2026-07-25 · **Code-Grundlage:** `main` `61767a9` (Merge #118) · **Deployment:** `READY`
· **Preflight gegen Production verifiziert:** 2026-07-25 (§4a)

> **Status: WEITERHIN BLOCKIERT.** Diese Vorlage ist vollständig vorbereitet, die Soll-Zahlen sind
> inzwischen **gegen die echte Production-Datenbank verifiziert und korrigiert** (§4a) — die
> Ausführung bleibt aber **nicht freigegeben**, weil weiterhin eine belastbare Sicherung fehlt (§5).
> **Es wurde kein einziger Schreibvorgang gegen Production ausgeführt.**

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
3. Setzt bei **6 Bundeswegen** `status` von `broken` auf `needs_review` und korrigiert bei **4**
   davon die `method`. Gegen Production verifiziert (§4a), exakte Werte:

   | Abrufweg | `method` vorher → nachher | `status` |
   |---|---|---|
   | `rp-bundestag` | `rss` → `rss` (unverändert) | `broken` → `needs_review` |
   | `rp-linksfraktion` | `rss` → `rss` (unverändert) | `broken` → `needs_review` |
   | `rp-bundesregierung` | `rss` → **`googlenews_search`** | `broken` → `needs_review` |
   | `rp-die-linke` | `rss` → **`googlenews_search`** | `broken` → `needs_review` |
   | `rp-ausschuss-arbeit-soziales` | `html` → **`googlenews_search`** | `broken` → `needs_review` |
   | `rp-dgb` | `html` → **`googlenews_search`** | `broken` → `needs_review` |

   `publisher_id` und `priority` bleiben bei allen sechs unverändert. **Korrektur gegenüber
   früheren Fassungen dieser Vorlage:** die Beschreibung „2× `html` → `rss`" war falsch — es
   werden 4 Wege auf `googlenews_search` umgestellt, zwei davon (`rp-bundesregierung`,
   `rp-die-linke`) von einem **Direkt-RSS-Feed** aus. Das ist genau die Bewegung, die den
   Google-News-Anteil von 134 auf 138 Wege hebt (§4).
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

> **Überholt in den absoluten Zahlen.** Der hier angenommene Ausgangszustand stimmt nicht mit
> Production überein. Verbindlich sind die gemessenen Werte in **§4a**. Die fachliche Bewertung
> (Punkte 11–14) bleibt gültig und ist durch §4a bestätigt.

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

## 4a · Verifizierter Production-Preflight (2026-07-25, ausschließlich lesend)

**Methode:** rein lesende `select`-Abfragen gegen das Production-Projekt (Supabase MCP,
`ddckuvvpcytqbyfmbvie`). **Kein `insert`, kein `update`, kein `delete`, keine Migration.** Der
Abgleich erfolgte nicht über Zählungen allein, sondern über **md5-Prüfsummen der vollständigen,
sortierten Schlüsselmengen** je Tabelle — eine gleiche Zeilenzahl bei vertauschtem Inhalt kann
damit nicht durchrutschen.

### Ausgangswerte (Ist) gegen die Annahme aus §4

| Tabelle | Annahme §4 | **Production Ist** | Bewertung |
|---|---|---|---|
| `geographies` | 50 | **50** | ✅ identisch (md5 gleich) |
| `political_entities` | 73 | **73** | ✅ identisch (md5 gleich) |
| `publishers` | 64 | **64** | ✅ identisch (md5 gleich) |
| `source_packages` | 6 | **7** | ⚠️ Abweichung |
| `retrieval_paths` | 162 | **163** | ⚠️ Abweichung |
| `package_paths` | 163 | **165** | ⚠️ Abweichung |
| `path_expected_levels` | 18 | **18** | ✅ |
| `path_expected_geographies` | 18 | **18** | ✅ |

### Die drei Abweichungen sind vollständig aufgeklärt — keine unbekannten Daten

Die Prüfsummen gehen exakt auf, sobald man genau drei Ursachen einrechnet:

1. **Profil-Resolver-Zeilen zur Laufzeit (2 + 1):** Production führt zusätzlich das Paket
   `pkg-profil-cem-ince`, den Abrufweg `rp-cem-ince-news` und deren Zuordnung. Diese Zeilen
   entstehen aus dem Profil (`scheduler.personNewsSource`) und stehen **bewusst nicht** im Seed.
   **Beide Seeds fassen sie nicht an** — verifiziert: keine der Seed-Anweisungen nennt diese IDs,
   und das Aufräum-`delete` in Seed 2 ist auf 18 fest benannte `rp-be-`/`rp-bb-`-Wege begrenzt.
2. **`pkg-die-linke-bund → rp-fraction-linke` existiert bereits** in Production. Die in §4 als
   „+1 Paketzuordnung" geführte Einfügung aus Seed 1 ist damit ein **No-Op**.
3. Der Rest der Mengen ist deckungsgleich mit dem Code-Seed.

### Korrigierte Soll-Zahlen (verbindlich für die Ausführung)

| Tabelle | vorher | nach Seed 1 | nach Seed 2 |
|---|---|---|---|
| `geographies` | 50 | 50 | 50 |
| `political_entities` | 73 | 73 | 73 |
| `publishers` | 64 | 64 | 64 |
| `source_packages` | 7 | **9** (+2) | 9 |
| `retrieval_paths` | 163 | 163 (6 aktualisiert) | 163 |
| `package_paths` | 165 | 165 (**±0**, s. Punkt 2) | 165 (−4 / +4) |
| `path_expected_levels` | 18 | 18 | 18 |
| `path_expected_geographies` | 18 | 18 | 18 |

| Nr. | Kennzahl | §4 sagte | **verifiziertes Soll** |
|---|---|---|---|
| 4 | betroffene Publisher | 0 | **0** ✅ bestätigt |
| 5 | betroffene Retrieval Paths | 6 | **6** ✅ exakt bestätigt (s. u.) |
| 6 | betroffene Source Packages | 4 | **4** ✅ (2 neu + 2 mit `required_classes` 15 → 12) |
| 7 | entfernte Paketzuordnungen | 4 | **4** ✅ bestätigt |
| 8 | neu eingefügte Paketzuordnungen | 5 | **4** ❗ korrigiert (die 5. existiert bereits) |

### Kein verstecktes Überschreiben durch `on conflict do update`

Der größte ungeprüfte Rest war, ob Seed 1 über `on conflict (id) do update set publisher_id,
method, status, priority` **mehr** als die 6 gemeldeten Abrufwege verändert — etwa weil der
Quality-Watchdog zur Laufzeit Status gesetzt hat. **Gegenprobe: nein.**

Die md5-Prüfsumme über alle 162 Katalogwege in der Form
`id|publisher_id|method|priority|status` (ohne den profilgenerierten `rp-cem-ince-news`) stimmt
**byte-genau** mit dem lokal aus den Seeds berechneten Erwartungswert überein, wenn man exakt die
6 bekannten Reparaturen als einzige Differenz ansetzt
(`b96271cd6c0b9178be4d0d6883c131d3`). Für die übrigen **156 Abrufwege ändert Seed 1 in diesen
vier Spalten nachweislich nichts.**

### Bestätigte Ausgangslage der 4 Landeswege

`rp-be-partei_pilot`, `rp-be-fraktion_pilot`, `rp-be-person_pilot` hängen in Production heute an
`pkg-berlin-basis`, `rp-bb-partei_pilot` an `pkg-brandenburg-basis` — also genau der in §3
beschriebene, durch P0-2 zu behebende Zustand. `pkg-berlin-basis` und `pkg-brandenburg-basis`
führen heute **15** `required_classes`. Die beiden `rp-rbb24-politik`-Zuordnungen stehen
ausdrücklich in der Ausnahmeliste des Aufräum-`delete` und werden **nicht** gelöscht.

### Was der Preflight **nicht** ersetzt

Er ersetzt **keine Sicherung**. Er zeigt nur, dass der Ausgangszustand vollständig verstanden ist.

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

### Backup-Versuch 2026-07-25 — **fehlgeschlagen, Ursache dokumentiert**

Vor der Einspielung wurde der dokumentierte Backup-Weg (`backup-restore-runbook.md` §1) geprüft
und **konnte nicht ausgeführt werden**. Zwei unabhängige Gründe:

1. **Keine Zugangsdaten.** `scripts/backup-export.js` verlangt `SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY`. Beide sind in einer Claude-Code-Sitzung **nicht gesetzt**
   (geprüft: auch `SUPABASE_ANON_KEY`, `SUPABASE_ACCESS_TOKEN`, `DATABASE_URL` fehlen; es gibt
   keine `.env.local`). Der einzige verfügbare DB-Zugang ist der Supabase-MCP-Server, der
   SQL-Ergebnisse in den Modellkontext zurückgibt — bei ~40 MB Nutzdaten (u. a.
   `gate_shadow_events` 11 MB, `raw_documents` 11 MB, `helmut_store` 7,9 MB) ist ein Vollexport
   über diesen Weg technisch nicht möglich.
2. **Kein haltbarer Ablageort.** Selbst mit Zugangsdaten wäre der Export in einer
   Remote-Sitzung wertlos: der Container ist flüchtig, und `backups/` ist gitignored und darf
   **nie** committet werden (Art.-9-relevante Daten, Runbook §1b). Ein Backup, das mit der
   Sitzung verschwindet, ist keine Sicherung.

**Konsequenz:** Das Backup muss der **Betreiber lokal** ausführen — mit der `.env.local` und
Ablage auf einem verschlüsselten Gerät. Erst danach ist Go-Kriterium 2 erfüllt. Zusätzlich
bestätigt (Supabase-Organisation, gelesen 2026-07-25): Plan = **`free`**, also weiterhin **keine
automatischen Backups und kein PITR** — OP-01 ist unverändert offen.

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
| 2 | Backup oder PITR bestätigt | ❌ **offen und in der Agenten-Sitzung nicht herstellbar** — §5, „Backup-Versuch 2026-07-25" |
| 3 | Vorschau ohne unerwarteten Diff | ✅ **gegen Production verifiziert** — §4a, alle Abweichungen aufgeklärt, keine unbekannten Zeilen |
| 4 | Exakte Soll-Zahlen dokumentiert | ✅ §4a (korrigiert gegenüber §4) |
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

**Wird nicht empfohlen.** Go-Kriterium 2 (Backup/PITR) ist nicht erfüllt.

### Option B — Ausführung blockieren ← **empfohlen, Stand 2026-07-25 weiterhin gültig**

**Es fehlt nur noch genau eine belastbare Sicherung.** Der fachliche Teil ist inzwischen
abgeschlossen: die Soll-Zahlen sind gegen Production gemessen, alle Abweichungen aufgeklärt und
das versteckte Überschreiben durch `on conflict do update` ist ausgeschlossen (§4a). Zwei Wege,
die Sicherung herzustellen:

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

## 8 · Ausführungsablauf, sobald das Backup vorliegt

Nur ausführen, wenn Go-Kriterium 2 **und** 8 erfüllt sind. Fenster außerhalb der Crons wählen
(Crawl 04:00/20:00 UTC, Understanding 05:30/21:30 UTC).

1. **Backup lokal** erzeugen und ablegen:
   `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/backup-export.js`
   Prüfen: `manifest.json` vorhanden, Zeilenzahlen plausibel, Löschtermin im Betriebs-Log
   notieren (Runbook §1b).
2. **Ist-Stand festhalten** (die Prüfsummen aus §4a erneut ziehen — sie müssen unverändert sein;
   andernfalls **abbrechen**, weil sich Production seit diesem Preflight verändert hat):

   ```sql
   select
     md5((select string_agg(id,'|' order by id collate "C") from source_packages))  as source_packages,
     md5((select string_agg(id,'|' order by id collate "C") from retrieval_paths))  as retrieval_paths,
     md5((select string_agg(k,'|'  order by k  collate "C")
          from (select package_id||'>'||retrieval_path_id as k from package_paths) x)) as package_paths;
   ```

   Soll (gemessen 2026-07-25): `source_packages = 4aa7d38d3f8fff9584d4373e8bfdfe72` ·
   `retrieval_paths = 4c5bbe3f8d5f95b57ac6ac4a25b345e6` ·
   `package_paths = c792989853c8e44fbfbf3147033b1491`.
3. **Seed 1** ausführen (`20260713_source_architecture_seed.sql`), danach prüfen:
   `select count(*) from source_packages` → **9** ·
   `select count(*) from package_paths` → **165** (unverändert) ·
   `select id, status, method from retrieval_paths where status = 'needs_review' and id in (…)`
   → die 6 Wege aus §3.
4. **Seed 2** ausführen (`20260717_landesmodul_be_bb_seed.sql`), danach prüfen:
   `select package_id from package_paths where retrieval_path_id = 'rp-be-partei_pilot'`
   → **`pkg-die-linke-berlin`** · `select count(*) from package_paths` → **165**.
5. **Abschlussprüfsummen** — nach beiden Seeds müssen gelten:
   `source_packages = 86834ef85257ad1affdd52829c73c9e1` ·
   `package_paths = 1d5364f91d5be34c4bc3231e1e80c5d2` ·
   `retrieval_paths` (IDs) unverändert `4c5bbe3f8d5f95b57ac6ac4a25b345e6`.
   Jede Abweichung ist ein **Stop** nach §6.
6. **Neutralität gegenprüfen:** `select required_classes from source_packages where id in
   ('pkg-berlin-basis','pkg-brandenburg-basis')` → je **12** Klassen, keine `*_pilot`-Klasse.
   Beide neuen Pakete `status = 'prepared'`, `is_base = false`.
7. Ergebnis in `CURRENT_STATE.md` §9 und in
   `quellenarchitektur/30-paket-inventur-production.md` nachziehen.
