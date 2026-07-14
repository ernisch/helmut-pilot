# Sprint 9D — PARDOK-Parser Berlin/Brandenburg

**Status: gebaut, gegen echte XML getestet, NICHT in den Production-Crawl verdrahtet.**
be-plenum/bb-plenum bleiben `needs_review` / `manual` / inaktiv. Keine Production-Datenänderung,
keine Quellenaktivierung, keine Flags, kein Cron, kein Deployment.

Ziel: die beiden amtlichen Open-Data-Quellen erzeugen **echte, einzelne** politische Dokumente
statt über Platzhaltertitel zusammenzufallen (Problem aus dem Shadow-Pilot).

## Reale XML-Strukturen (durch Struktur-Sonde ermittelt)

Berlin und Brandenburg haben **unterschiedliche** Formate — es wird **keine** gemeinsame
Feldannahme erzwungen (getrennte Adapter).

| | Berlin `pardok-wp19.xml` | Brandenburg `exportWP8.xml` |
|---|---|---|
| Root | `<Export aktualisiert=...>` | `<Export aktualisiert=...>` |
| Namespaces | keine | keine |
| Record-Element | **flaches** `<Dokument>` | `<Vorgang>` (verschachteltes `<Dokument>`) |
| Externe ID | `<DBID>` (z. B. `D-351040`, 100%) | **kein DBID** → `VNr` + Dokument-`ReihNr` |
| Besonderheit | Titel nur bei ~38% (viele Typen formatbedingt titellos) | ~47% `<VFunktion>delete</VFunktion>`-Stubs (Tombstones); Vorgang hat oft **mehrere** `<Dokument>` |
| Größe | >48 MB (~47k Dokumente) | ~12 MB (~9k Vorgänge) |

Gemeinsame Felder je Dokument: `Titel`, `DokDat` (DD.MM.YYYY), `DokArt/DokArtL`, `DokTyp/DokTypL`,
`DokNr`, `NrInTyp`, `Wp`, `Urheber` (mehrfach), `LokURL` (pdf/docx), `Desk` (Stichwörter).

## Parser-Architektur

`lib/helmut/quellenarchitektur/pardok-parser.js` — rein, deterministisch, namespace-tolerant,
kein Netz/DB/LLM. Extrahierte 12 Felder (fehlend → `null`, **nichts erfunden**):

1. `titel` 2. `veroeffentlichungsdatum` (ISO) 3. `dokumentart` (+`dokumenttyp`)
4. `drucksachennummer` / `vorgangsnummer` 5. `wahlperiode` 6. `ausschuss` 7. `urheber` (Array)
8. `originaladresse` (LokURL, pdf bevorzugt) 9. `politische_ebene` = `land`
10. `geografie` = `geo-land-berlin` / `geo-land-brandenburg` 11. `externe_id` (stabil, eindeutig)
12. `inhaltsfingerabdruck` (stabil, **titel-unabhängig**).

**Getrennte Adapter:**
- **Berlin** (`parseBerlinDokument`): iteriert flache `<Dokument>`; `externe_id = DBID`.
- **Brandenburg** (`parseBrandenburgVorgang`): überspringt `VFunktion=delete`-Stubs und
  dokumentlose Vorgänge; erzeugt je verschachteltem `<Dokument>` ein Dokument;
  `externe_id = VNr#ReihNr` (eindeutig pro Dokument-Position).

**Identität ohne Titel:** Jedes Dokument hat eine stabile `externe_id` (Berlin: DBID; Brandenburg:
VNr#ReihNr). Der `inhaltsfingerabdruck` = `sha256(land|externe_id|wp|dokNr|datum|dokArt)` ist
titel-unabhängig → titellose Dokumente fallen **nicht** zu einem Sammelcluster zusammen. Fällt
jede Kennung aus (Extremfall), greift ein struktureller Hash des Rohblocks (nie kollektiv).

**Wahlperiode** (nicht fest codiert): `<Wp>`-Feld → sonst DokNr-Präfix (`19/0019`→19) → sonst
Quell-URL-Hinweis (`wp19`/`WP8`) → sonst `null`.

**Speicherschonend:** `scripts/pardok-shadow-test.js` streamt die XML, extrahiert vollständige
Record-Blöcke inkrementell und **trimmt den Puffer** — liest nur bis `maxRecords` (nicht die
48 MB). Puffer-Spitze im Lauf ≤ 14 KB.

## Tests

- `scripts/pardok-parser-test.js`: **42 Offline-Tests** gegen Gold-Fixtures
  (`test/fixtures/pardok/berlin-gold.xml`, `brandenburg-gold.xml` — mehrere Dokumentarten +
  fehlende Felder) + **alle 8 adversarialen Fälle**: gleiche Titel/andere Vorgänge, fehlende
  Titel, fehlende Daten, gleiche DokNr aus anderer Wahlperiode, Namespace-Änderung, HTML-
  Fehlerseite statt XML, sehr große XML (Record-Cap), Dedup+Fundstellen. Alle grün.

## Echte Ergebnisse (DB-freier Shadow-Test, Run 29317721530, 800 Records/Quelle)

| Metrik | be-plenum (Berlin) | bb-plenum (Brandenburg) |
|---|---|---|
| Rohdatensätze | 800 | 800 (380 delete-Stubs übersprungen) |
| geparst | 800 | 816 |
| Titel-Quote (aller Dok.) | 37,8% | 46,8% |
| **Format-Titel erkannt** | **100% (302/302)** | **100% (382/382)** |
| Datum / externe ID | 100% / 100% | 100% / 100% |
| Dokumente nach Dedup | 800 (mehrfach 0) | 816 (mehrfach 0) |
| Platzhalter / kein Sammelcluster | 0 / **ja** | 0 / **ja** |
| Fehler | 0 | 0 |
| Laufzeit / Puffer-Spitze | 1,6 s / 2 KB | 1,7 s / 14 KB |

**Akzeptanzkriterien (beide Quellen 5/5):** kein Sammelcluster · jedes Dokument stabile Identität ·
≥95% der bereitgestellten Titel erkannt (100%) · keine erfundenen Werte · needs_review/manual/
inaktiv · keine Production-Änderung/Aktivierung/Flags/Cron/Deployment.

## Adversarialer Befund + Korrektur

Der erste Shadow-Lauf zeigte für Brandenburg `kein_Sammelcluster=false`: der ursprüngliche
`VNr:DokNr`-Schlüssel kollidierte, wenn ein Vorgang zwei `<Dokument>` mit derselben DokNr trug →
5 (auch titellose) Dokumente fälschlich zusammengeführt (816→811). Fix: `externe_id = VNr#ReihNr`
→ eindeutig pro Dokument-Position. Re-Lauf: 816→816, mehrfach 0, kein Sammelcluster **true**.

## Offene Risiken

1. **Berlin-Datei >48 MB:** ein späterer echter Ingest muss streamen (wie der Shadow-Test), nicht
   die ganze Datei laden.
2. **Titellose Dokumente** (Berlin ~62%, Brandenburg ~53%) sind formatbedingt korrekt titel=null;
   für die Anzeige braucht es eine abgeleitete Bezeichnung (DokArt + DokNr + Datum) — bewusst
   NICHT als „Titel" erfunden.
3. **Wahlperiode fix im Quell-URL** (wp19/WP8): bei Legislaturwechsel muss die Seed-URL angepasst
   werden; der Parser liest die WP aber primär aus dem Inhalt.
4. **Ausschuss** wird nur gesetzt, wenn ein Feld ihn klar benennt (Berlin Urheber „Ausschuss …");
   Brandenburg exponiert ihn nicht sauber pro Dokument → meist `null` (kein Rateschluss).
5. Parser ist **noch nicht** in den Production-Crawl verdrahtet (bewusst) — dieser Schritt ist
   eigen und freigabepflichtig.

## Empfehlung

Beide Plenumswege sind **bereit für einen längeren Shadow-Betrieb**: alle Akzeptanzkriterien
erfüllt, 0 Fehler, stabile Identitäten, kein Sammelcluster, tagesaktuell (100% Datum),
speicherschonend. Empfohlen als nächster Schritt: die beiden Wege in den bestehenden BE/BB-Shadow-
Pilot aufnehmen (weiterhin isoliert, DB-frei, Artefakt-only) und über mehrere Läufe die Stabilität
der externen IDs beobachten — bevor eine echte Ingest-Verdrahtung (eigener, freigabepflichtiger
Schritt) erwogen wird.
