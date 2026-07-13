# Zielarchitektur der neuen Quellenarchitektur

**Gilt ab:** Sprint 1 · Ergänzt: `00-ist-architektur-und-abweichungen.md`, `01-sprintplan.md`

Dieses Dokument erklärt das neue Modell in einfachen Worten und zeigt, was Sprint 1 davon
gebaut hat.

## Warum überhaupt?

Heute steckt der komplette Quellenkatalog **hartkodiert im Code** (`lib/helmut/sources.js`),
und jedes „Quellen-Objekt" vermischt drei Dinge, die eigentlich getrennt gehören:
*wer veröffentlicht* (Herausgeber), *wie wir es abrufen* (Abrufweg) und *wofür wir es bündeln*
(Paket). Das führt zu Doppelungen (BMAS taucht mehrfach auf), macht Google News fälschlich zu
einem „Herausgeber" und verhindert saubere Landespakete (Berlin/Brandenburg). Die neue Architektur
trennt diese Ebenen sauber.

## Die drei Kernbegriffe (einfach erklärt)

### 1. Herausgeber (`publishers`)
Die **Organisation, die Inhalte veröffentlicht** — z. B. „Bundesministerium für Arbeit und
Soziales", „Tagesschau", „ver.di". Ein Herausgeber existiert **genau einmal** (dedupliziert über
seine Domain). Jeder Herausgeber hat eine **Belegfunktion** — wie stark seine Aussage einen
Sachverhalt belegt:

| Belegfunktion | Bedeutung | Beispiel |
|---|---|---|
| `official_primary` | offizielle Primärquelle | Bundestag, Ministerium |
| `direct_interest` | direkter Interessenakteur (Primärquelle für die eigene Position, kein neutraler Beleg) | Partei, Gewerkschaft, Verband |
| `journalistic` | journalistische Quelle | Tagesschau, Spiegel |
| `data_source` | Datenquelle | Statistisches Bundesamt |
| `aggregator` | Suchweg/Aggregator, **kein** eigener Herausgeber | Google News |

### 2. Abrufweg (`retrieval_paths`)
Die **technische Methode, über die wir Inhalte finden** — RSS-Feed, API, HTML-Seite oder
Google-News-Suche. **Ein Herausgeber kann mehrere Abrufwege haben.** Beispiel: Das BMAS hat einen
direkten RSS-Feed *und* eine Google-News-Suche — zwei Abrufwege, **ein** Herausgeber.

Jeder Abrufweg hat einen **Status** (`healthy`, `degraded`, `broken`, `needs_review`, `paused`,
`archived`) und einen **Aktivierungsmodus**:
- `auto` — läuft, wenn ein aktives Paket ihn braucht (Referenzzählung).
- `always_on` — läuft dauerhaft (Bund Basis, kritische Systemquellen).
- `dev_only` — löst **nie** einen Production-Crawl aus.
- `manual` — nur manuell.

### 3. Quellenpaket (`source_packages`)
Ein **Bündel von Abrufwegen für einen klaren Produktzweck** — z. B. „Bund Basis", „Arbeit und
Soziales", „Berlin Basis". **Ein Abrufweg kann in mehreren Paketen sein**, wird aber **global nur
einmal gecrawlt** (Referenzzählung). Pflicht-Basispakete (`is_base`) sichern die Grundversorgung:
Bundestagsprofil braucht mindestens *Bund Basis*, Landtagsprofil zusätzlich sein *Landespaket*.

## Zwei weitere Fundament-Ebenen

- **Geografie** (`geographies`): Deutschland → Bundesland → Bezirk/Landkreis → Kommune. **Region
  und Wahlkreis sind KEINE politische Entscheidungsebene** — der Wahlkreis lebt separat
  (`electoral_districts`). Alle 16 Länder sind strukturell angelegt; Berlin (12 Bezirke) und
  Brandenburg (kreisfreie Städte + Landkreise) sind als erste Landesmodule vertieft.
- **Politische Entitäten** (`political_entities`): eine **einzige typisierte Schicht** für
  Parteien, Fraktionen, Ausschüsse, Ministerien, Parlamente, Regierungen, Verbände, Gewerkschaften,
  Behörden, Statistikämter und Personen — statt je eigener Sonderlogik.

## Wie Google News korrekt behandelt wird

Google News ist **ein Suchweg, kein Herausgeber**. Der Mapper unterscheidet:
- **`site:domain`-Suche** (z. B. `site:verdi.de …`) → der **echte Herausgeber** ist ver.di, der
  Abrufweg hat nur die Methode `googlenews_search`.
- **reine Themensuche** (z. B. „Bürgergeld (Reform OR Sanktionen)") → hier gibt es keinen einzelnen
  Herausgeber; der Abrufweg hängt am **Aggregator-Herausgeber „Google News"** und trägt seine
  Zielsemantik über die erwarteten Themen/Entitäten.

So wird Google News nie als Inhaltsherausgeber verkleidet (Auftrag §16).

## Was Sprint 1 konkret gebaut hat

- **Modell + reine Logik** (`lib/helmut/quellenarchitektur/model.js`): Enums, URL-Normalisierung,
  Inhaltsfingerabdruck, Methoden-/Belegfunktions-Klassifikation, Statuswechsel-Regeln,
  Referenzzählung.
- **Katalog-Mapper** (`catalog.js`): bildet die **144 kuratierten Quellen + 13 Orphans + DIP**
  verlustfrei auf 51 Herausgeber, 145 Abrufwege und 7 Pakete ab.
- **Seeds** (`seeds/`): 50 Geografien, 69 Entitäten, Herausgeber-Namensregister, Paketdefinitionen.
- **Migration + Rollback** (`supabase/migrations/20260713_source_architecture*.sql`): 11 neue,
  global geteilte Tabellen — additiv, RLS-konform, **noch nicht auf Production angewendet**.
- **86 Tests** (`scripts/source-architecture-test.js`) + Seed-Generator.

**Nichts davon ist im Live-Crawl verdrahtet** — das Modell existiert additiv neben dem bestehenden
Katalog (Kompatibilitätsschicht). Verdrahtung, KO-Klassifikation, Aktivierung und Admin folgen in
den Sprints 2–9.
