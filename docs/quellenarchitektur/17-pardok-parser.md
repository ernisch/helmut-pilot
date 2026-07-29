# PARDOK-/parldok-Parser Berlin/Brandenburg

> **Teil A** = Sprint 9D (Parser, Struktur, Identitaet).
> **Teil B** = Roadmap-Punkt 24, 2026-07-29 (Dokumentklassen + kanonischer Rohdokument-Vertrag).
> Bei Widerspruch gilt Teil B.

# Teil A — Sprint 9D: Parser

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

- `scripts/pardok-parser-test.js`: **45 Offline-Tests** (Stand 2026-07-29, Teil B) gegen Gold-Fixtures
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

---

# Teil B — Dokumentklassen und kanonischer Rohdokument-Vertrag (Roadmap-Punkt 24, 2026-07-29)

**Status: offline belegt, weiterhin NICHT aktiviert.** `be-plenum`/`bb-plenum` stehen unverändert
auf `needs_review` + `manual`, `HELMUT_PARDOK_DISPATCH` bleibt aus. Keine Migration, kein
Schemawechsel, keine Production-Änderung.

## B.1 Was vorher fehlte

Der Parser aus Teil A liefert die **rohen** Typbezeichnungen der Quelle (`DokArt`/`DokArtL`,
`DokTyp`/`DokTypL`) — mehr nicht. Damit war die Abnahmefrage von Punkt 24 („Drucksachen, Anfragen,
Sitzungen und Vorgänge werden korrekt getrennt") **nicht beantwortbar**: es gab keine normalisierte
Dokumentklasse, keine Abbildung auf den kanonischen Rohdokument-Vertrag `public.raw_documents` und
keinen Test, der die Trennung nachweist. Die Rohwerte landeten ausschließlich in einer
Shadow-Datei mit eigener Form.

## B.2 Belegquelle

Live-Abrufe sind aus der Arbeitsumgebung **gesperrt** (Agent-Proxy antwortet mit `403` auf
`CONNECT` für beide Hosts). Belegt wurde stattdessen aus dem letzten echten Sondenlauf:
**GitHub-Actions-Lauf `30209973678` vom 26.07.2026** (Workflow `pardok-parser.yml`, nur lesende
XML-Abrufe) — je 500 Records aus `pardok-wp19.xml` (47 417 `<Dokument>`) und `exportWP8.xml`
(9 057 `<Vorgang>`), inklusive Feld-Inventar und verbatim Beispiel-Records. Daraus wurden die
Gold-Fixtures um **drei echte Records** erweitert (Berlin `D-351603`, `D-357045`; Brandenburg
`V-369325`). Es wurde **kein** Feldwert erfunden.


**Nachgemessen am 29.07.2026 (Lauf `30481670298`, je 800 Records, 5 Wiederholungen byte-identisch).**
Dieser Lauf bestätigt alle drei in die Gold-Fixtures übernommenen Records verbatim und liefert
zusätzlich die **Dokumentart-Verteilung**, die die Typtabellen tragen muss:

| | Berlin (800 Records) | Brandenburg (800 Vorgänge → 816 Dokumente) |
|---|---|---|
| Dokumentarten | **4** | **11** |
| Verteilung | Drucksache 534 · Plenarprotokoll 206 · Ausschussprotokoll 34 · GVBl 26 | Drucksache 411 · Ausschussprotokoll 221 · Plenarprotokoll 70 · Unterrichtung 34 · Präsidiumsprotokoll 28 · Information 22 · Einladung 11 · Frühwarndokument 10 · GVBl 6 · Zuschrift 2 · Gutachten 1 |

**Befund 24-3 — die Brandenburg-Tabelle war unvollständig, und die Messung hat es gezeigt.** Die
erste Fassung stützte sich allein auf die 500-Record-Struktur-Sonde und deckte für Brandenburg nur
`Drucksache` und `Plenarprotokoll` ab. Gegen die gemessene Verteilung wären **290 von 816
Dokumenten (35,5 %)** fälschlich `unbekannt` geblieben — allein `Ausschussprotokoll` sind 221.
Ergänzt wurden neun belegte Dokumentarten. **Ebenfalls korrigiert:** die zuerst notierte Ausnahme
„Brandenburg liefert keine Tagesordnung" ist **falsch** — die Dokumentart `Einladung` (11 Treffer)
trägt die Tagesordnung. Die Ausnahme gilt nur für Berlin. Das ist genau der Unterschied, den eine
gemeinsame Textmuster-Lösung eingeebnet hätte.

Benannte, aber fachlich nicht sicher einzuordnende Arten (`Information`, `Frühwarndokument`,
`Gutachten`, `Zuschrift`) werden bewusst `sonstiges` — der Wert ist belegt beobachtet, es wäre
aber geraten, ihn zur Drucksache, Anfrage oder Sitzung zu erklären.

Die Verteilung ist als Prüfung verankert (`landesparser-klassen-test.js`, Teil C2): jede gemessene
Dokumentart muss eine **länderspezifisch belegte** Zuordnung haben, sonst wird der Test rot.

## B.3 Kanonische Dokumentklassen

`lib/helmut/quellenarchitektur/pardok-dokumentklassen.js` — rein, deterministisch, ohne Uhr
(Abrufzeit wird injiziert). Acht Klassen: `drucksache` · `anfrage` · `antwort` · `sitzung` ·
`tagesordnung` · `pressemitteilung` · `sonstiges` · `unbekannt`.

**`vorgang` ist bewusst KEINE Dokumentklasse.** Ein Vorgang kann mehrere Drucksachen, Anfragen,
Antworten und Sitzungsdokumente enthalten; er wird ausschließlich als **Bezug**
(`vorgangsnummer`/`vorgangstyp`) mitgeführt. Der Pfad setzt nie `cluster_id` — die Vorgangsbildung
bleibt vollständig beim bestehenden Resolver.

**Erkennungsreihenfolge** (der Dokumenttyp ist immer spezifischer als die Dokumentart):
Land-`DokTyp` → amtliche Bezeichnung auf `DokTyp` → Land-`DokArt` → amtliche Bezeichnung auf
`DokArt` → `unbekannt`. Jeder Tabelleneintrag trägt einen registrierten Beleg; die
länderunabhängige Auffangebene wird als `klasse_quelle: "amtliche-bezeichnung"` ausgewiesen und
nie als Landesbeleg verkauft.

**Warum die Reihenfolge nicht Kosmetik ist:** der echte Berliner Record `D-351603` trägt
`DokArtL = Plenarprotokoll` **und** `DokTypL = Antwort`. Über die Dokumentart allein wäre eine
Antwort auf eine Anfrage still ein reines Sitzungsdokument geworden.

## B.4 Belegte Klassen je Land

| Klasse | Berlin (PARDOK) | Brandenburg (parldok) |
|---|---|---|
| Drucksache | ✅ `Drs`/`Verordnung`/`Antrag` | ✅ `Drs`/`Gesetzentwurf`/`Unterrichtung`, auch ohne `DokTyp` |
| Anfrage | ✅ `Schriftliche Anfrage`, `Kleine Anfrage` | ✅ `Kleine Anfrage` |
| Antwort | ✅ `DokTypL = Antwort` (`D-351603`) | ❌ **fachliche Ausnahme** — kein eigener Typwert in der Stichprobe; Antworten erscheinen als eigenständige Drucksache und bleiben ehrlich `drucksache` |
| Sitzung | ✅ Plenar- + Ausschussprotokoll, `Behandlung im Plenum`, `Ausschussberatung` | ✅ Plenarprotokoll, Ausschussprotokoll, Präsidiumsprotokoll |
| Tagesordnung/Termin | ❌ **fachliche Ausnahme** — über 800 gemessene Records führt Berlin genau vier Dokumentarten, keine davon ist eine Tagesordnung | ✅ Dokumentart **`Einladung`** (11 von 816) — die Einladung zur Sitzung trägt die Tagesordnung |
| Pressemitteilung | ❌ **fachliche Ausnahme** — kommt über die Presse-/Medienwege des Landesmoduls | ❌ dito |
| Sonstiges | ✅ Gesetz- und Verordnungsblatt | ✅ GVBl, `Information`, `Frühwarndokument`, `Gutachten`, `Zuschrift` |
| Parlamentarischer Vorgang | **als Bezug: nein** (siehe B.7) | **als Bezug: ja** — `VNr` + `VTypL` |

Alle Ausnahmen sind in `KLASSEN_AUSNAHMEN` maschinenlesbar hinterlegt (Land, Klasse, Grund,
Beleg, Ersatzweg) und werden von der Testsuite gegen den Klassenvertrag geprüft. Sie werden
**nicht simuliert** und nicht durch einen Nachbarwert ersetzt.

## B.5 Kanonischer Rohdokument-Vertrag

`zuRohdokument(doc, kontext)` bildet ein geparstes Dokument auf die **bestehenden** Spalten von
`public.raw_documents` ab — keine zweite Datenstruktur, keine Migration. Alle neun geforderten
Informationen bleiben erhalten:

| # | Information | Feld |
|---|---|---|
| 1 | Bundesland/Geografie | `raw.geografie`, `raw.politische_ebene`, `raw.herkunft` (`BLN`/`BRA`) |
| 2 | Herausgeber/Quelle | `source_id`, `source_name`, `source_type`, `publisher_id` |
| 3 | Dokumenttyp | `document_type` (amtliche Bezeichnung) + `raw.dokumentklasse` (+ `_quelle`, `_beleg`) |
| 4 | Titel | `title`; titellose Formate bekommen eine aus echten Feldern **abgeleitete, gekennzeichnete** Bezeichnung (`raw.titel_abgeleitet = true`, `raw.titel_original = null`) — kein erfundener Titel |
| 5 | Veröffentlichungsdatum | `published_at` (fehlend → `null`) |
| 6 | Externe Kennung | `raw.externe_id`; `content_hash` = Inhaltsfingerabdruck |
| 7 | Kanonische URL | `canonical_url`/`url`, `link_type` (`direct`/`missing`) |
| 8 | Vorgangsbezug | `raw.vorgangsnummer`, `raw.vorgangstyp` |
| 9 | Herkunft/Abrufweg | `raw.abrufweg`, `raw.quelle_url`, `source_id` |

`document_type` trägt bewusst die **amtliche Bezeichnung**, weil das Understanding-Gate genau
darauf prüft; die normalisierte Klasse steht daneben im bereits vorhandenen `raw`-jsonb.

## B.6 Zwei Befunde im bestehenden Bestand

**Befund 24-1 — „Schriftliche Anfrage" war dem Understanding-Gate unbekannt.**
`OFFICIAL_DOC_TYPES` kannte `kleine anfrage` und `grosse anfrage`, aber **nicht**
`schriftliche anfrage` — das wichtigste Instrument des Abgeordnetenhauses. Gemessen: ein echtes
Berliner Dokument fiel aus der amtlichen Erkennung in den Stichwort-/Alterspfad und wurde
`parken`/`zu-alt`. Ebenfalls unbekannt waren die realen Typen `Behandlung im Plenum` und
`Ausschussberatung`. Alle drei sind jetzt ergänzt — **rein additiv**: keiner der drei Werte kommt
in den aktiven Bundesquellen vor (gegen die reale Production-Stichprobe geprüft, 42/42
Gate-Entscheidungen unverändert).

**Befund 24-2 — die globale Dedup identifiziert über die URL, PARDOK darf das nicht.**
`dedup-global.mergeIntoDocuments` gruppiert zuerst nach kanonischer URL (Regel A). Für PARDOK ist
die URL **kein** Identitätsmerkmal: ein Plenarprotokoll-PDF trägt viele Einträge. Real belegt:
`D-351042` (Plenarprotokoll) und `D-351603` (Antwort) zeigen auf **dieselbe** PDF-Adresse
`p19-002-wp.pdf`. Der Test hält fest, dass die URL-erste Dedup beide zu **einem** Dokument
verschmelzen würde. Die globale Dedup-Architektur wurde bewusst **nicht** geändert; verbindlich
ist stattdessen: **PARDOK-Dokumente werden über `content_hash` (externe Kennung) identifiziert,
nie über die URL.** Für einen späteren Cutover ist das eine harte Vorbedingung — `shadow-ingest.js`
(Diagnoseskript, nie im Produktivpfad) verletzt sie heute.

## B.7 Offene, ehrlich benannte Lücke: Berliner Vorgangsbezug

Die Sonde zählt im Berliner Export **41 854 `<Vorgang>`-Elemente neben 47 417 `<Dokument>`**. Die
Sonde wählt automatisch das häufigste Element (`<Dokument>`), weshalb die **Feldstruktur des
Berliner `<Vorgang>` in keinem gespeicherten Beleg dokumentiert ist**. Der Parser liest deshalb
ausschließlich `<Dokument>` und führt für Berlin **keinen** Vorgangsbezug — geraten wird nichts.

Der Schritt, der die Lücke schließt, ist vorbereitet: `scripts/pardok-structure-probe.js`
akzeptiert jetzt `PP_RECORD_TAG=Vorgang`. Ein Lauf des Workflows `pardok-parser.yml` mit dieser
Variable (nur lesende XML-Abrufe, keine Secrets, keine DB, kein LLM) liefert das Feld-Inventar und
verbatim Beispiel-Records des Berliner `<Vorgang>`. Aus der Arbeitsumgebung ist das nicht
möglich — der Egress zu beiden Hosts ist gesperrt.

## B.8 Fixtures

| Datei | Charakter |
|---|---|
| `test/fixtures/pardok/berlin-gold.xml` · `brandenburg-gold.xml` | Records aus den **echten** Exporten (jetzt inkl. `D-351603`, `D-357045`, `V-369325`) |
| `test/fixtures/pardok/berlin-grenzfaelle.xml` · `brandenburg-grenzfaelle.xml` | **kein Quellenbeleg** — zusammengesetzte Records für Formatdrift, unbekannte/fehlende Typen, Kurzcodes ohne L-Felder, Mehrfachfundstellen, ein Vorgang mit zwei Dokumentklassen. Je Record ist ausgewiesen, welcher Feldwert belegt und was zusammengesetzt ist |

## B.9 Tests

- `scripts/landesparser-klassen-test.js` — **94/94 grün**, Berlin und Brandenburg getrennt
  nachgewiesen: Klassenvertrag · Pflichtklassen je Land · Länderspezifik (die Typtabellen sind
  nachweislich verschieden) · kanonischer Vertrag (alle neun Informationen) · fail closed bei
  unbekannten/fehlenden Typen · fehlende Felder · Identität und Dubletten · Dokument ≠ Vorgang ·
  vollständiger Offline-Weg bis ins Understanding-Gate · Rückwärtskompatibilität Bund ·
  Determinismus und Isolation · beide Plenumswege bleiben `needs_review`/`manual` · **und die real
  gemessene Dokumentart-Verteilung beider Quellen** (Teil C2).
- **Mutationsprobe: 9 von 9 Mutationen machen die Suite rot** (Dokumentart vor Dokumenttyp 9 ·
  fail closed aufgeweicht 4 · Vorgangsbildung im Parserpfad 1 · abgeleiteter Titel nicht markiert 2 ·
  unbekanntes Land geraten 2 · „Schriftliche Anfrage" wieder entfernt 1 · brandenburgischer
  Typwert entfernt 1 · Brandenburgs `Ausschussprotokoll` entfernt 1 · Brandenburgs `Einladung`
  entfernt 2).
- Regression: `pardok-parser-test.js`, `pardok-gate-test.js`, `pardok-dispatch-test.js`,
  `pardok-dispatch-smoke-test.js`, `shadow-ingest-test.js` grün; Gesamt-Offline-Suite
  **182/182** (Ausgang 181/181), Browser-/Mobile-Smoke **32/32**.

## B.10 Verbleibende Risiken

1. **Berliner Vorgangsbezug fehlt** (B.7) — Weg zur Schließung steht, braucht einen Lauf mit Netz.
2. **Stichprobe statt Vollerhebung:** die Typtabellen stützen sich auf 500 (Struktur) bzw. 800 (Verteilung) Records je Quelle — nicht auf die vollen 47 417 bzw. 9 092 Records. Neue
   Typwerte sind möglich — sie fallen fail closed als `unbekannt` auf, statt still falsch zu werden.
3. **Kein Production-Beweis** und keiner möglich, solange die Wege bewusst inaktiv sind.
4. **Befund 24-2** bleibt als Vorbedingung für den Cutover bestehen.
5. **Wahlperiode in der Quell-URL** (`wp19`/`WP8`) — unverändert aus Teil A.
