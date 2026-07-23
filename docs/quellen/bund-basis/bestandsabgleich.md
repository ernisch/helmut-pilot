# Bestandsabgleich `bund-basis` gegen die 14 fachlich freigegebenen Pflichtpfade

**Sprint:** 1 (Bestandsabgleich, siehe `START_SPRINT_1.md` im Startpaket) · **Stand:** 2026-07-23 ·
**main-HEAD zum Zeitpunkt dieser Prüfung:** `035898b` (Merge #114)

**Auftrag:** Ausschließlich den realen Bestand auf `main` ermitteln und den 14 fachlich
freigegebenen Pflichtpfaden aus dem Masterpaket zuordnen. Keine Implementierung, keine
Aktivierung, keine Datenänderung. Diese Doku und `bestandsmatrix.csv` sind die einzigen
Artefakte dieses Sprints.

## Methodik und Kostengrenze

Geprüft wurde ausschließlich Code auf `main` (keine Netzabrufe, kein Production-Read, keine
Migration, keine Aktivierung):

- `supabase/migrations/20260713_source_architecture.sql` — Schema der Quellenarchitektur
  (Publishers, Retrieval Paths, Source Packages, Package Paths, Political Entities,
  Geographies).
- `lib/helmut/quellenarchitektur/catalog.js` + `seeds/packages.js` + `seeds/publishers.js` —
  der deterministische Mapper, der den bestehenden Katalog (`lib/helmut/sources.js`,
  `v1Sources`) in das relationale Modell zerlegt.
- `lib/helmut/sources.js` (594 Zeilen, vollständig gelesen) — die tatsächliche Quelldefinition,
  aus der `bund-basis` heute besteht.
- `lib/helmut/dip.js`, `scheduler.js`, `server.js` — der reale (vom Katalog getrennte) DIP-Pfad.
- `lib/helmut/quellenarchitektur/seeds/bundeswege-reparaturen.js` — bereits real getestete
  (aber nicht angewendete) Reparaturen an 6 bestehenden Bundeswegen.
- `docs/quellenarchitektur/00-master-status.md` und `13-landesmodule-technische-pruefung-und-bundeswege.md`
  — bestehende, bereits verifizierte Status- und Prüfdokumentation.
- Ergänzend wurde `buildCatalog()` **lokal und ohne Netzzugriff** ausgeführt (reine Funktion,
  kein Schreibzugriff), um die exakten, aktuell in `bund-basis` enthaltenen Retrieval Paths
  zu zählen und aufzulisten (siehe unten). Das ist kein "breiter Repository-Scan" und kein
  Production-Zugriff, sondern ein gezielter, lokaler Aufruf des bereits vorhandenen,
  reinen Mapping-Codes.

Nicht geprüft (per Kostengrenze bewusst ausgeschlossen): reale HTTP-Abrufe der 14 Pflichtpfad-URLs,
Vercel-/Production-Env-Werte (z. B. ob `DIP_API_KEY` in Production gesetzt ist), Parserentwicklung,
Migration, Aktivierung.

## 1) Ist-Architektur auf `main` (bestätigt)

Die im Masterpaket vorausgesetzte Architektur existiert bereits **genau wie beschrieben** und ist
laut `docs/quellenarchitektur/00-master-status.md` seit 2026-07-15 die aktive Quellenwahrheit
(`HELMUT_SOURCE_MODE=on`, alter Katalog ist Fallback):

| Ebene | Tabelle/Modul | Bestätigt |
|---|---|---|
| Publishers | `public.publishers` | Ja — Dedup über `canonical_domain` |
| Retrieval Paths | `public.retrieval_paths` | Ja — `method` ∈ rss/api/html/googlenews_search/structured_download |
| Source Packages | `public.source_packages` | Ja — genau 6 Pakete: `bund-basis, arbeit-und-soziales, die-linke-bund, regional-niedersachsen, berlin-basis, brandenburg-basis` (die letzten beiden `status=prepared`, technisch inaktiv) |
| Package Paths | `public.package_paths` (m:n) | Ja |
| Political Entities | `public.political_entities` | Ja |
| Geographies | `public.geographies` | Ja |

**Keine neue Architektur nötig, keine Abweichung auf dieser Ebene.** Das bestehende Source
Package heißt exakt `bund-basis` (`pkg-bund-basis`, `key: "bund-basis"`, `status: active`,
`is_base: true`), wie vom Masterpaket gefordert.

## 2) Wie `bund-basis` heute tatsächlich zusammengesetzt ist

Wichtig für den Abgleich: `bund-basis` ist **kein statischer Seed mit 14 Einträgen**, sondern
wird laufzeit-deterministisch aus `lib/helmut/sources.js` gebaut. Jede Quelle mit dem Flag
`neutral: true` landet in `bund-basis` (`seeds/packages.js:94`, `packageKeysForSource`).

Realer Lauf von `buildCatalog()` gegen den aktuellen Katalog ergibt für `pkg-bund-basis`:

| Kennzahl | Wert |
|---|---|
| Retrieval Paths gesamt in `bund-basis` | **54** |
| davon RSS (Direktfeed) | 4 (`rp-bundestag`, `rp-bundesregierung`, `rp-tagesschau-politik`, `rp-deutschlandfunk-politik`) |
| davon API | 1 (`rp-dip`) |
| davon Google-News-Suche | **49** |

Von den 4 Direktfeeds sind laut `catalog.js:KNOWN_PATH_HEALTH` **2 als `broken` markiert**
(`rp-bundestag`, `rp-bundesregierung`) — bestätigt durch den bereits real durchgeführten
Abruftest in `bundeswege-reparaturen.js` (Sprint 9B, echter GitHub-Actions-Runner-Test).

Die übrigen 49 von 54 Wegen (91 %) sind **Google-News-Suchen** über alle 22 Bundestagsausschüsse,
alle 8 Fraktionen, allgemeine Bundespolitik-Schlagworte und 38 Leitmedien/überregionale Medien
(`bundestagCommitteeSources`, `bundestagFractionSources`, `generalPoliticsSources`, `mediaSources`,
`broadGermanMediaSources` in `sources.js:482-588`). Das ist ein bewusst gebautes, breites
"Grundrauschen" für jedes Mandat — fachlich aber ein **anderes Konzept** als die 14 spezifischen,
strukturierten Institutionspfade des neuen Pflichtkerns.

## 3) Abgleich je Pflichtpfad (Kurzfassung — Details in `bestandsmatrix.csv`)

| Nr | Pflichtpfad | Befund |
|---|---|---|
| 1 | DIP API | **Vorhanden und funktionsfähig**, aber als separater, älterer, profilgefilterter Pfad (`lib/helmut/dip.js` + `scheduler.js:176-180`) außerhalb der Package-Path-Architektur. Der Katalogeintrag `rp-dip` ist laut `catalog.js`-Kommentar ausdrücklich "nicht in Scheduler/Server verdrahtet" — ein reiner Migrations-/Doku-Eintrag. Abhängig vom optionalen `DIP_API_KEY` (Produktionsstatus ungeprüft). |
| 2 | hib | **Teilweise vorhanden, aber defekt/dubliziert.** Zwei schwache Wege statt einem dedizierten: `rp-bundestag` (RSS, aber `broken`, hib-URL nur als Nebenlink mitgeschleppt) und `rp-general-hib` (Google-News-Ersatz auf dieselbe hib-Seite). Die im Masterdokument bekannte offizielle `hib.rss`-URL ist nicht im Code. |
| 3 | Tagesordnung und Sitzungsverlauf | **Fehlt vollständig.** Kein Retrieval Path. |
| 4 | Namentliche Abstimmungen | **Fehlt vollständig.** Kein Retrieval Path. |
| 5 | Bundesrat Plenarsitzungen | **Fehlt in `bund-basis`.** Publisher `bundesrat.de` existiert zwar im Gesamtkatalog, aber nur mit zwei Google-News-Wegen im **falschen** Paket (`arbeit-und-soziales`). In `bund-basis`: 0 Bundesrat-Wege. |
| 6 | BundesratKOMPAKT | **Fehlt vollständig.** Kein RSS-Endpunkt im Code. |
| 7 | Kabinettsitzungen im Überblick | **Nur schwacher Proxy.** `rp-general-bundeskabinett` ist eine Google-News-Suche, kein struktureller Direktabruf der Kabinettssitzungsseite. |
| 8 | Kabinettsthemen | **Kein eigener Weg** — teilt sich denselben schwachen Proxy wie Zeile 7 (Dublettenrisiko bei Aktivierung). |
| 9 | Pressemitteilungen der Bundesregierung | **Vorhanden, aber defekt.** `rp-bundesregierung` nutzt eine real umgezogene, tote URL. Die im Masterdokument bekannte offizielle Feed-URL (mit GUID/Pressemitteilungsnummer) ist auch im bereits vorbereiteten Reparaturvorschlag nicht enthalten (der weicht stattdessen auf Google News aus). |
| 10 | Bundesgesetzblatt Teil I | **Fehlt vollständig.** Kein Publisher, kein Weg. |
| 11 | Bundesgesetzblatt Teil II | **Fehlt vollständig.** Kein Publisher, kein Weg. |
| 12 | BVerfG Pressemitteilungen | **Fehlt vollständig.** Offizielle RSS-URL ist im Masterdokument bereits bekannt, aber nicht umgesetzt. |
| 13 | BVerfG Entscheidungen | **Fehlt vollständig.** Ebenfalls bereits bekannte RSS-URL, nicht umgesetzt. |
| 14 | BVerfG Termine und Wochenausblick | **Fehlt vollständig.** Auch im Masterdokument noch offen ("Claude Code prüfen"). |

## 4) Kategorisierung der bestehenden, für `bund-basis` relevanten Wege

Gemäß Auftrag (Kategorien: Pflichtpfad / technischer Hochwertkandidat / begründeter Sonderweg /
mögliches Duplikat oder Altbestand):

- **Pflichtpfad (vollständig oder teilweise erfüllt):** `rp-dip` (voll, aber architektonisch
  parallel) · `rp-bundestag` + `rp-general-hib` (teilweise, defekt/dupliziert, Pflichtpfad 2) ·
  `rp-bundesregierung` (teilweise, defekt, Pflichtpfad 9) · `rp-general-bundeskabinett`
  (schwacher Proxy für Pflichtpfad 7 **und** 8 gleichzeitig).
- **Technischer Hochwertkandidat (aus dem Masterpaket):** Keiner der 3 benannten Kandidaten
  (Tagesaktuelles Plenarprotokoll, Gesetze im Internet Rechtsstandsauflösung, Geplante
  Entscheidungen des BVerfG) hat einen Code-Gegenwert auf `main` — konsistent mit dem
  Masterpaket, das sie ausdrücklich erst nach bestandener Mehrwertprüfung erlaubt.
- **Begründeter Sonderweg:** `rp-tagesschau-politik`, `rp-deutschlandfunk-politik` (gesunde
  Leitmedien-Direktfeeds, bewusst als neutrales Grundrauschen gestaltet — kein Ersatz für einen
  Pflichtpfad, aber auch keine Fehlkategorisierung).
- **Mögliches Duplikat oder Altbestand:** Die 49 Google-News-Wege (22 Ausschüsse, 8 Fraktionen,
  allgemeine Politik, 38 Medien) sind fachlich **kein Bestandteil** der 14 Pflichtpfade — sie
  stammen aus einem älteren, breiteren Produktkonzept ("jedes Mandat findet zu jedem
  Ausschuss/jeder Fraktion Rohartikel"). Sie sind nicht per se Altbestand im Sinne von
  "abzuschalten" (das wäre bereits eine Umsetzungsentscheidung, hier nicht getroffen), aber sie
  beantworten eine andere fachliche Frage als der neue Pflichtkern. `rp-news-bundesrat-soziales`
  und `rp-process-bundesrat-sozialpolitik` sind zusätzlich potenzielle Duplikate zu einem künftigen
  Bundesrat-Pflichtpfad, sofern dieser ebenfalls in `bund-basis` landet (heute liegen sie in
  `arbeit-und-soziales`, keine Namens-/Paketkollision aktuell).

## 5) Echte Architekturabweichung gefunden

**Ja — eine strukturelle, keine bloß fehlende Einzelquelle.** Das technische `bund-basis`-Paket
folgt heute einem anderen Bauprinzip als der fachlich neu freigegebene Pflichtkern:

- Fachlich freigegeben: 14 spezifische, strukturierte **Institutionspfade** (DIP, hib, Bundesrat,
  Kabinett, BGBl, BVerfG …).
- Technisch vorhanden: 54 Wege, davon 49 (91 %) **generische Google-News-Suchen** über Ausschüsse,
  Fraktionen und Medien als breites Grundrauschen; nur 1 Weg (DIP) erfüllt einen Pflichtpfad
  wirklich strukturiert — und der läuft **nicht** über die Package-Path-Architektur, sondern
  parallel dazu.

Das ist keine Verletzung der No-Go-Regeln (keine neue Architektur wurde gebaut, nichts wurde
gelöscht) — aber der fachliche Anspruch "amtliche Primär-/Direktquellen für jeden der 14 Bereiche"
und der technische Ist-Zustand von `bund-basis` klaffen strukturell auseinander. Das ist eine
Rückfrage wert, bevor Sprint 2 mit der Umsetzung einzelner Wege beginnt: Soll `bund-basis` künftig
**beides** enthalten (Pflichtkern + bestehendes Grundrauschen), oder soll das Grundrauschen in ein
eigenes Paket wandern, damit `bund-basis` klar dem neuen fachlichen Auftrag entspricht? Diese Frage
wird hier nur aufgeworfen, nicht entschieden (keine Umsetzung in diesem Sprint).

## 6) Google-News-Abhängigkeit (No-Go-Regel `4.4`)

Von den 14 Pflichtpfaden hängen aktuell **3 an einem Google-News-Ersatzweg statt einer amtlichen
Direktquelle**, obwohl im Masterdokument bereits offizielle technische Endpunkte dokumentiert sind
oder plausibel existieren:

- hib (Pflichtpfad 2) — offizielle `hib.rss`-URL bereits bekannt, aber nicht verwendet.
- Kabinettsitzungen (7) und Kabinettsthemen (8) — kein offizieller Feed dokumentiert, aktuell
  einzig über Google News abgedeckt.

Das ist exakt der von `04_no_go_regeln.md` benannte Fall ("Keine Google News Abhängigkeit, wenn
offizielle Direktquellen verfügbar sind") und sollte bei der technischen Validierung in Sprint 2
vorrangig behandelt werden.

## Abschluss

1. **Vollständig vorhanden:** 1 von 14 (DIP API — funktionsfähig, aber architektonisch parallel
   zur Package-Path-Struktur; siehe Abweichung oben).
2. **Nur teilweise vorhanden:** 4 von 14 (hib; Pressemitteilungen der Bundesregierung;
   Kabinettsitzungen im Überblick; Kabinettsthemen — je defekt, dubliziert oder nur als
   Google-News-Proxy vorhanden).
3. **Fehlen vollständig:** 9 von 14 (Tagesordnung und Sitzungsverlauf; Namentliche Abstimmungen;
   Bundesrat Plenarsitzungen, Tagesordnungen und Beschlüsse; BundesratKOMPAKT; Bundesgesetzblatt
   Teil I; Bundesgesetzblatt Teil II; BVerfG Pressemitteilungen; BVerfG Entscheidungen; BVerfG
   Termine und Wochenausblick).
4. **Die drei Pfade, die zuerst technisch validiert/ergänzt werden sollten:**
   1. **hib** — Infrastruktur (Publisher, Paket-Zuordnung) existiert bereits, offizielle URL ist
      im Masterdokument bekannt, aktueller Zustand ist aktiv defekt/dupliziert — höchster
      Aufwand-Nutzen-Vorteil.
   2. **Pressemitteilungen der Bundesregierung** — akut `broken`, offizielle Ersatz-URL mit
      GUID/Nummer bereits im Masterdokument dokumentiert, kein Neubau eines Publishers nötig.
      3. **BVerfG Pressemitteilungen** — komplett neuer, aber einfacher RSS-Weg mit bereits
      bekannter offizieller URL; deckt eine bislang gänzlich fehlende Institution ab und hat
      laut Fachentscheidung hohe Priorität ("schnelle Signalerkennung").
   *(Bundesrat und Bundesgesetzblatt sind ähnlich dringend, brauchen aber laut Masterdokument
   noch eigene technische Recherche, bevor überhaupt ein Weg vorbereitet werden kann — daher
   nicht unter den ersten drei.)*
5. **Echte Architekturabweichung gefunden:** **Ja**, siehe Abschnitt 5 — strukturelle Diskrepanz
   zwischen dem neu freigegebenen 14-Pfade-Pflichtkern und dem heutigen, zu 91 % aus
   Google-News-Grundrauschen bestehenden `bund-basis`-Paket. Keine Umsetzung erfolgt; nur
   dokumentiert und zur Rückfrage vorgelegt.
6. **Geänderte Dateien in diesem Sprint:**
   - `docs/quellen/bund-basis/bestandsabgleich.md` (neu)
   - `docs/quellen/bund-basis/bestandsmatrix.csv` (neu)

   Keine weiteren Dateien wurden angelegt, geändert oder gelöscht. Keine Migration, keine
   Aktivierung, kein Production Write, kein Deployment, keine Änderung an Crons, Locks oder
   aktiven Produktionsquellen.

**Ende Sprint 1. Sprint 2 wird hier nicht begonnen.**
