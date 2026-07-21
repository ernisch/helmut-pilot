# Sprint 4 — Dark Launch der neuen Quellenplattform · Abschlussbericht

> **Track-Hinweis:** Dieser „Sprint 4" ist der **Dark-Launch-Track** (parallele
> Nachweis-Ebene), NICHT der ältere interne Quellenarchitektur-Sprint 4
> (`sprint-4-abschlussbericht.md`). Beide Nummerierungen existieren nebeneinander.

## Ausgangslage & Sicherheitsrahmen

Sprint 1–3 sind konsolidiert, die Architektur ist verbindlich, der Integrationsbranch
stabil. Baseline vor diesem Sprint: **140/140 Offline-Suiten grün**.

Alle Sicherheitsregeln des Auftrags wurden eingehalten:

- **Keine Produktionsmigration** — keine Migration angelegt/angewandt.
- **Kein Deployment**, **keine neuen Crawls**, **keine Cron-Änderung** — `vercel.json`
  und die GitHub-Workflows sind unberührt.
- **Keine Änderung an Auth/RLS**, **keine Änderung am sichtbaren App-Verhalten** —
  `server.js`, `client.js`, `scheduler.js` sind unberührt; der Nutzer bekommt weiterhin
  ausschließlich die Legacy-Ausgabe.
- **Kein Merge nach main**, **kein Pull Request**.

Der Dark Launch ist **rein additiv**: eine neue, deterministische Bibliothek plus Tests
plus Doku. Er ist über das Flag `HELMUT_DARK_LAUNCH` (Default **off**) lesbar, aber
**bewusst NICHT scharf im Live-Pfad verdrahtet**. Sobald eine Änderung den aktiven
Produktionspfad berühren würde, wurde gestoppt — die relationale Plattform bleibt im
sichtbaren Pfad unverändert (`HELMUT_SOURCE_MODE` unberührt).

## Was gebaut wurde

Ein vollständiger Dark-Launch-Harness in
`lib/helmut/quellenarchitektur/dark-launch.js` — **reine Logik, kein Netz, keine KI, kein
Storage-Write, kein Rendering**; alle Eingaben werden injiziert. Tests:
`scripts/dark-launch-test.js` (**65 Assertions, grün**), automatisch in der Offline-Suite
(`run-offline-tests.js`) → jetzt **141/141 Suiten grün**.

| Auftrag | Umsetzung (Funktion) |
|---|---|
| **1 Shadow Mode** | `computeMandateShadow()` — je Mandat werden Legacy- und Neu-Ergebnis **unabhängig** berechnet; Legacy bleibt allein sichtbar. |
| **2 Automatischer Vergleich** | `compareMandate()` — 13 Dimensionen: gewählte Quellen, Quellenanzahl, Gewichtung, Gesundheit, Coverage, fehlende Quellen, Duplikate, Google-News-Abhängigkeit, Versorgungslücken, Themen-, Ausschuss-, Partei-, Regionalabdeckung. |
| **3 Difference Report** | `buildDifferenceReport()` — identisch / besser / schlechter / fehlende Quelle / zusätzlich gefundene Quelle + **Begründung je Unterschied** (`blackBox: false`). |
| **4 Metriken** | `computeSourceMetrics()` — Coverage, Versorgungsgrad, Anzahl Primär-/Sekundärquellen, Google-News-Anteil, Ø Quellenqualität, Gesundheitsstatus, Redundanz, kritische Versorgungslücken. |
| **5 Telemetrie** | `buildTelemetryRecord()` + `telemetryIsPiiClean()` — nur technische Kennzahlen (Zeit, Mandats-ID, Quellenzahl, Dauer, Fehler, Warnungen, Abweichungen). Allowlist-erzwungen; **keine personenbezogenen Inhalte**. |
| **6 Interner Admin-Report** | `buildDarkLaunchAdminReport()` — Legacy gegen Neu über alle Mandate; wer wäre besser/schlechter versorgt, welche Quellen fehlen, welche Discovery-/Qualitätsregeln greifen. `intern: true`. |
| **7 Belastungstest** | `runDarkLaunchBatch()` — mehrere Mandate gleichzeitig über verschiedene Parteien, Ausschüsse, Bundesländer, Themen (Test: 12 Mandate). |
| **8 Abbruchregeln** | `evaluateAbortRules()` — `autoActivateNewAllowed` **strukturell immer false**; Legacy gewinnt zwingend bei Coverage-Verschlechterung, fehlenden Pflichtquellen, Google-News-Alleinversorgung oder neuen kritischen Versorgungslücken. |

**Kern-Invariante (getestet):** In **keinem** Pfad, unabhängig vom Vergleichsergebnis,
kann die neue Plattform automatisch aktiv werden — `autoActivateNewAllowed === false` gilt
ausnahmslos.

## Methodenehrlichkeit

Die Arbeitsumgebung hat **keinen Netz-/Produktions-DB-Zugriff** (Egress-Block, siehe
Master-Status). Der Harness ist deshalb bewusst als **reine, injizierbare Logik** gebaut:
Er ist die Maschinerie, die im Betrieb den echten Legacy- gegen den echten Neu-Plan hält.
Die quantitativen Aussagen unten stützen sich auf (a) die bereits erbrachten
Production-Shadow-Messungen (Master-Status §3/§5: **100 % Ertragsabdeckung**, 91,7 %
Wege-Abdeckung, Dedup-Dry-Run) und (b) die strukturelle Logik dieses Harness. Der
Harness erzeugt keine erfundenen Zahlen — wo eine Datengrundlage fehlt, bleibt der Wert
ehrlich offen.

## Abschlussbericht — die sechs Fragen

### 1. Ist die neue Plattform heute besser als Legacy?

**Strukturell gleichwertig bis besser, mit klar benannten Ausnahmen — aber noch nicht
beweisbar überall besser.** Die Stärken der neuen Plattform sind belegt: höhere Gewichtung
amtlicher Primärquellen (Paketbündelung), globale URL-/ID-Dedup (weniger Redundanz),
sichtbar geführte defekte Wege statt stiller Tod, und Reduktion der Google-News-Abhängigkeit
durch kuratierte Herausgeber-Wege. Die Production-Shadow-Messung zeigte **100 %
Ertragsabdeckung** (alle Altquellen mit realem Ertrag sind abgedeckt, 0 fehlende Wege mit
Ertrag). Der Dark-Launch-Harness bestätigt diese Stärken dimensionsweise. **Aber:** „besser"
gilt nur, wo die relationalen Pakete tatsächlich befüllt sind — genau das ist Gegenstand von
Sprint 5.

### 2. Wo ist sie schlechter?

An genau den Stellen, die die **Abbruchregeln** erzwingen und der Difference-Report
benennt:

- **Ausschuss-/Themenabdeckung**, wo ein Fachpaket noch dünn oder ungetaggt ist —
  Legacy-Themenquellen decken einen Bedarf ab, für den es (noch) keinen relationalen Weg gibt.
- **Google-News-Alleinversorgung** einzelner Pflichtbedarfe (Partei/Ausschuss), wo der
  einzige neue Weg eine Google-News-Suche ist statt eines Herausgeber-Wegs — harter
  Legacy-Vorrang.
- **Defekte Pflichtwege** (bot-gesperrt: bundestag/bundesregierung/die-linke/
  linksfraktion/ausschuss-arbeit-soziales/dgb), die im Neu-Plan als nicht ausführbar
  geführt werden; Legacy fängt sie heute über Google-News-Ersatzwege ab.

In allen diesen Fällen **gewinnt zwingend Legacy** (`forceLegacy`).

### 3. Welche Quellen fehlen noch?

Nach den bisherigen Messungen **keine ertragreichen Altquellen** (100 % Ertragsabdeckung).
Die im Neu-Plan „fehlenden" Wege sind exakt die **6 defekten, bot-gesperrten Wege mit 0
Ertrag** — ihr Inhalt kommt über Google-News-Ersatz. Strukturell offen bleiben
**Herausgeber-Wege als Ersatz für die Google-News-Alleinversorgung** (damit Pflichtbedarfe
nicht nur am Aggregator hängen) und die **Klassen-Tagging-Lücke** (Abrufwege tragen noch
keine Ausschuss-/Themen-Klassen → Coverage-Nachweis je Fachdimension ist heute konservativ
untertrieben). Der Admin-Report (`fehlendeQuellen`, `zusaetzlicheQuellen`) liefert im
Betrieb die exakte, mandatsgezählte Liste.

### 4. Welche Parteien sind noch unterversorgt?

Parteien **ohne eigenes Partei-Paket**: Es existiert bisher nur `die-linke-bund`. Für alle
anderen Fraktionen/Parteien fällt die Partei-Abdeckung im Neu-Plan auf die neutrale
Basis + ggf. Google-News-Wege zurück. Solange kein Partei-Paket besteht, markiert der
Harness diese Mandate als partei-unterversorgt (kritischer Bedarf), sofern nicht ein
kuratierter Herausgeber-Weg die Fraktion abdeckt.

### 5. Welche Ausschüsse sind noch unterversorgt?

Alle Ausschüsse **außer „Arbeit und Soziales"** (einziges Fachthemenpaket). Es gibt keine
Fachpakete für Gesundheit, Verkehr, Inneres, Finanzen, Verteidigung, Umwelt usw. — deren
Ausschussabdeckung stützt sich heute auf die neutrale Basis/Google News. Zusätzlich ist die
Coverage-Messung bis zum Klassen-Tagging der Abrufwege konservativ (Master-Status: „alle als
fehlend ausgewiesen, ehrlich").

### 6. Kann Sprint 5 jetzt mit der echten Quellenbefüllung beginnen?

**Ja — mit klarer Priorisierung.** Der Dark Launch liefert genau das Sicherheitsnetz, das
Sprint 5 braucht: jede neue relationale Befüllung kann je Mandat gegen Legacy gemessen
werden, mit automatischem Abbruch, sobald sie etwas verschlechtert. Empfohlene Reihenfolge
für Sprint 5, direkt aus den Befunden 3–5:

1. **Herausgeber-Wege gegen Google-News-Alleinversorgung** der Pflichtbedarfe (Abbruchregel
   R3 auflösen).
2. **Fach-/Partei-Pakete** über „Arbeit und Soziales"/„Die Linke" hinaus (Fragen 4 + 5).
3. **Klassen-Tagging der Abrufwege**, damit die Coverage-Messung je Ausschuss/Thema
   belastbar wird (statt konservativ untertrieben).

Voraussetzung bleibt: **keine automatische Umschaltung** — Sprint 5 befüllt und misst im
Schatten; die Aktivierung bleibt eine separate, freigabepflichtige Entscheidung.

## Testabdeckung

- `scripts/dark-launch-test.js`: **65/65 Assertions grün** — deckt alle 8 Aufgaben ab,
  inkl. jeder der vier Abbruchregeln, der PII-Freiheit der Telemetrie (inkl. Negativfällen)
  und der Belastungstest-Invariante „nie automatisch aktiv".
- Gesamte Offline-Suite: **141/141 grün** (Baseline 140 + neue Suite). Alle bestehenden
  Tests bleiben unverändert grün.

## Rollback

Trivial: Das Feature ist rein additiv und nirgends im Live-Pfad verdrahtet. Rückbau =
`lib/helmut/quellenarchitektur/dark-launch.js` + `scripts/dark-launch-test.js` +
Inventar-Zeile entfernen. Das Flag `HELMUT_DARK_LAUNCH` ist nicht gesetzt (Default off) und
ohne Wirkung auf den Produktionspfad.
