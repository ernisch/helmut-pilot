# P2-5 Quellenabdeckung — warum der Readiness-Check „zu dünn" meldete

**Stand:** 2026-07-15 · **Modus der Analyse:** lesend gegen Production
(`ddckuvvpcytqbyfmbvie`) + Code · **Branch:** `claude/source-coverage-p2-readiness-cqh0za`
**Umfang:** Bundestag + Cem-Pilot. **Büro bewusst ausgelassen** (wird separat überarbeitet).

> **Kernbefund in einem Satz:** Es fehlen **keine** Quellen für den Piloten — der
> Readiness-Check stellte einen **gesunden ~145-Quellen-Crawl** gegen Schwellen von
> **495/450/405**, die seit ihrer Einführung (2026-07-11) **nie erfüllbar** waren und
> ~3× zu hoch lagen. Zusätzlich zählte die „Quellenbasis"-Prüfung die **falsche Zahl**
> (eingefrorener `store.sources`-Blob statt der relationalen Quellenwahrheit).

---

## Die fünf geforderten Klärungen

### 1. Welche Schwelle verlangt der Check?

Drei Schwellen bewerten die Quellenmenge (alle `server.js`, ENV-überschreibbar; Defaults
vor dieser Behebung):

| Konstante | alt (Default) | Wo geprüft | Effekt bei Unterschreitung |
|---|---|---|---|
| `HELMUT_MIN_CONFIGURED_SOURCES` | **495** | Backend-Health „Quellenbasis" | Check rot |
| `HELMUT_MIN_CHECKED_SOURCES` | **450** | Crawl-Qualität · pilotReadiness · isFullCrawlHealthy · Release · Live-Flow · Watchdog-INGEST | „zu wenige Quellen geprüft" → **nicht pilotbereit** |
| `HELMUT_MIN_SUCCESSFUL_SOURCES` | **405** | isFullCrawlHealthy · pilotReadiness (Warnung) | „erfolgreiche Quellenbasis ist noch dünn" |

Dieselben Werte (450/405) standen dupliziert in `lib/helmut/watchdog-state.js`
(`DEFAULT_THRESHOLDS`) und in `scripts/smoke-test.js`.

### 2. Warum werden aktuell nur 145 Quellen gezählt?

Der profil-gebundene Crawl liefert **145 Quellen** (145 geprüft / 145 erfolgreich /
**0 Fehler**, jüngster Lauf 2026-07-15 20:03). Das ist der **gesunde Normalzustand**,
nicht ein Ausfall:

- Seit dem **QUELLEN-CUTOVER** (`HELMUT_SOURCE_MODE=on`, 2026-07-15 06:45) ist die
  relationale DB die Quellenwahrheit. `buildRelationalCrawlPlan` erzeugt einen
  **global deduplizierten** Plan: jeder Abrufweg genau einmal, nur aktive Pakete,
  Berlin/Brandenburg hart gesperrt, defekte Wege ausgeschlossen.
- **Entscheidend:** Auch **vor** dem Cutover war der Crawl schon ~**149** Quellen groß
  (20 crawlRuns durchgehend 145–149). Der Profilfilter + die Kuratierung des alten
  Katalogs (`slice(0,560)`) ergaben **nie** die ~450–495 der Schwelle. Der Cutover senkte
  149→145 (global-URL-Dedup entfernt ~4 doppelte Wege) — die Diskrepanz existierte schon
  **davor**.

Die aktive relationale Struktur (Production):

| Ebene | Zahl |
|---|---|
| retrieval_paths gesamt | 163 |
| davon aktiv im Plan (Cem-Profil) | ~138 (+ Profilquellen → 145 geprüft) |
| davon **broken** (ausgeschlossen) | 6 |
| davon Landesmodul BE/BB (hart gesperrt) | 18 |
| aktive Pakete | 5 (bund-basis, arbeit-und-soziales, die-linke-bund, regional-niedersachsen, profil-cem-ince) |

### 3. Fehlen wirklich Quellen — oder zählt der Check falsch?

**Der Check zählt falsch / ist fehlkalibriert.** Zwei unabhängige Fehler:

1. **Fehlkalibrierte Schwellen (Hauptursache).** 495/450/405 wurden am **2026-07-11**
   gesetzt — vermutlich am rohen Katalogumfang (~566) orientiert statt am tatsächlichen
   profil-gefilterten, kuratierten, deduplizierten Ist-Crawl (~145–149). Sie waren **nie**
   erfüllbar und meldeten die Basis seit vier Tagen dauerhaft als „zu dünn".

2. **Falsche Zählgröße bei „Quellenbasis" (Nebenfehler).** Die Prüfung zählte
   `storeSummary.sources.active` = der **eingefrorene `store.sources`-Blob** (144). Nach dem
   Cutover ist dieser Blob nur noch **Fallback-Katalog** — eine tote Zahl, die sich nicht
   mit Paketen/Wegen ändert. Die echte aktive Quellenbasis ist der relationale Plan.

**Belastbarkeit der 145 (kein Grün-Trimmen):** raw_documents tagesfrisch — **915 Dok./24h**,
2.983/7d, 105 distinct Quellen/7d, jüngstes 2026-07-15 20:00. Abgedeckt: alle Ausschüsse
(committee-*), alle Fraktionen (fraction-*), Leitmedien (Deutschlandfunk/Tagesschau),
Ministerien, Bundestag (general-hib, general-bundestag-plenum) + **DIP** (amtliche
Drucksachen, direkt). Die 145 sind eine **ausreichende, belastbare** Basis für den Piloten.

### 4. Welche Quellen/Abrufwege/Pakete fehlen konkret?

**Für die Breite des Piloten: keine.** Die 5 aktiven Pakete decken das Cem-Mandat exakt ab
(Bundestag + Die Linke + Arbeit&Soziales + Niedersachsen + persönliche Beobachtung). Die
Audit-Empfehlung war ausdrücklich **B (gezielte Pakete), keine Massenerweiterung**.

**Ein realer Qualitäts-Gap (sekundär, nicht die Ursache des „zu dünn"):** 6 **direkte
Primärquellen** stehen auf `status='broken'` und sind daher aus dem Crawl ausgeschlossen:

| Weg | kritisch | ersetzt heute durch (Google-News-Proxy) |
|---|---|---|
| `rp-bundestag` (Bundestag RSS) | ja | general-hib, general-bundestag-plenum + DIP |
| `rp-bundesregierung` (Bundesregierung RSS) | ja | general-bundesregierung-vorhaben |
| `rp-die-linke` (Die Linke Presse) | ja | fraction-linke |
| `rp-linksfraktion` (Linksfraktion Presse) | ja | fraction-linke |
| `rp-ausschuss-arbeit-soziales` (HTML-Scrape) | nein | committee-Radare |
| `rp-dgb` (DGB HTML) | nein | association-Quellen |

Die **Breite** dieser Themen ist also über Proxys + DIP bereits abgedeckt; was fehlt, ist
die **direkte Primär-Beleg-Qualität** (official_primary statt Aggregator). Das senkt die
Readiness **nicht** (die 6 sind bereits ausgeschlossen; die 145 enthalten sie nicht).

**Warum sie nicht einfach „repariert" wurden:** Sprint 9B (`bundeswege-reparaturen.js`,
2026-07-14) hat für **alle 6** funktionierende Ersatz-/Reparatur-URLs auf einem
GitHub-Runner **real verifiziert** (HTTP 200, u. a. echte Direktfeeds für Bundestag
`…/pressemitteilungen.rss` und Linksfraktion `…/feed.rss`) — **aber nichts angewendet**
(`angewendet: 0`). Die Reparatur ist **zweiteilig und freigabepflichtig**:
- **Production-DB-Write** auf `retrieval_paths` (url/method/status/error_streak) **und**
- eine koordinierte **Code/Katalog-Anpassung**: `toCrawlerSource` bevorzugt das
  Legacy-Objekt (`lib/helmut/sources.js`) vor der Pfad-URL — dort stehen noch die **alten
  defekten** URLs. Ein reiner `UPDATE` auf `retrieval_paths` allein würde durch das
  Legacy-Mapping wieder auf die alte URL zurückfallen.

→ **Founder-gated** (Production-Write + abgestimmter Code-Change). Nicht Teil dieser
Behebung. Siehe „Nächste Schritte".

### 5. Was ist für Bundestag + Cem-Pilot tatsächlich notwendig?

- **Notwendig & jetzt behoben:** Schwellen, die den relationalen Ist-Stand (~145)
  abbilden, und eine **ehrliche Zählung** der aktiven Quellenbasis. Damit meldet der Check
  Wahrheit statt Dauer-Rot.
- **Wünschenswert, founder-gated:** die 6 verifizierten Direktfeed-Reparaturen für bessere
  Primär-Beleg-Qualität (v. a. `rp-bundestag`, `rp-linksfraktion` als echte Direktfeeds).
- **Nicht notwendig:** eine Massenerweiterung der Quellenzahl. Sie würde nur das
  Google-News-Klumpenrisiko erhöhen, ohne echte Lücken zu schließen.

---

## Behebung (dieser Branch, rein Code — kein Prod-Write, keine Migration, kein Flag)

1. **Neues Modul `lib/helmut/source-coverage.js`** — zentrale, reine Schwellen-/Zähllogik
   mit dokumentierter Kalibrierung (Defaults **120/120/110**, ENV-überschreibbar).
   Begründung: gesunder Ist-Crawl ~145; Floors bei ~80 % → bestehen den Normalbetrieb,
   schlagen aber bei echtem Einbruch an (Neutralbasis ~54, Plan-Ladefehler → Fallback,
   Massenausfall). Nicht auf Grün getrimmt — 145 hat >20 % Luft nach unten.
2. **`server.js`** — Schwellen aus dem Modul; „Quellenbasis" zählt via
   `effectiveActiveSourceCount` die **relationale** aktive Basis (`crawl.checkedSources`)
   statt des toten Blobs.
3. **`lib/helmut/watchdog-state.js`** — `DEFAULT_THRESHOLDS` 450/405 → 120/110 (Server
   übersteuert ohnehin mit denselben Werten; Konsistenz für Modul-/Test-Nutzung).
4. **`scripts/smoke-test.js`** — Default 450 → 120.
5. **Tests:** neues `scripts/source-coverage-test.js` (21 Assertions: Kalibrierung,
   Einbruch-Erkennung, Zähl-Bug-Fix, ENV-Override) + zwei neue Watchdog-Fälle
   (145/145 → fresh; 40 → warn). Volle Offline-Suite grün (die 2 verbleibenden Fails —
   `helmut-tab-ui`, `stoerungswahrheit` — sind **datum-abhängig und pre-existing**,
   unabhängig von dieser Änderung; auf dem sauberen Baum identisch).

**Wirkung:** Der gesunde 145-Quellen-Crawl besteht jetzt Backend-Health („Quellenbasis"),
Crawl-Qualität, pilotReadiness, Release-Check und Watchdog-INGEST — ohne eine einzige
zusätzliche Quelle. Ein echter Einbruch (Paket-Deaktivierung, Massenausfall) schlägt weiter
an.

## Nächste Schritte (founder-gated, NICHT in diesem Branch)

- **Direktfeed-Reparaturen anwenden** (6 Wege): Prod-Write auf `retrieval_paths` **plus**
  Legacy-Katalog/`toCrawlerSource`-Abstimmung, damit die verifizierten URLs (9B) real
  greifen. Verifizierte Daten liegen in `lib/helmut/quellenarchitektur/seeds/bundeswege-reparaturen.js`.
  Erwarteter Effekt: +6 direkte Primärquellen, bessere Direktlink-Belegqualität; Menge
  bleibt ~belanglos für die Readiness (jetzt korrekt kalibriert).
- Optional: die Schwellen per Vercel-ENV feiner justieren (nicht nötig — Default greift).
