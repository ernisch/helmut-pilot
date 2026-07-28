# Nachklassifikation des Altbestands (Sprint 21, OP-24)

**Stand:** 2026-07-28 · **Zustand:** technische Vorbereitung vollständig,
**Production-Schreiblauf ausstehend (freigabepflichtig)**

Kanonisches Dokument zu OP-24. Der Sprintstatus steht in
[`CURRENT_STATE.md`](CURRENT_STATE.md) §12, der offene Punkt in
[`datenmotor-restliste.md`](datenmotor-restliste.md).

---

## 1 · Worum es geht, in vier Sätzen

Sprint 20 hat den **Schreibpfad** repariert: eine betroffene Geografie entsteht
nur noch aus Nachweisen, nie aus der politischen Ebene. Der **Altbestand** blieb
bewusst unangetastet und trägt die alten Fehler weiter. Sprint 21 baut den
Nachlauf, der diese Altfehler entfernt — **ohne** den Bestand pauschal zu
überschreiben und **ohne** einen einzigen KI-Aufruf. Der Lauf selbst ist noch
nicht gefahren; er braucht eine ausdrückliche Freigabe.

## 2 · Der Ausgangsbefund

Die alte Funktion `deriveAffectedGeographies(level, mentionedGeos)` erzeugte die
betroffene Geografie **allein aus der politischen Ebene**:

```
level === 'bund'  -> [Deutschland]                   (aus der Ebene erfunden)
level === 'land'  -> erstes ERWÄHNTES Bundesland     (Erwähnung = Betroffenheit)
                     sonst [Deutschland]             (verbotener Ersatzwert)
level === 'eu'    -> [Europäische Union, id: null]   (frei erzeugt, nicht kanonisch)
sonst             -> erstes erwähntes Bundesland     (strukturell nur EINE Region)
```

**Genau diese vier Formen — und nur sie — sind maschinell wiedererkennbar.**
Alles andere bleibt unangetastet.

## 3 · Die zentrale Sicherheitsregel

Ein Altwert wird **nur** entfernt, wenn **beide** Bedingungen zugleich gelten:

1. Er trägt **keine** echte Herkunft (nur `bestand-alt`, Rang 2). Jeder Eintrag
   mit einer Herkunft ≥ `ki` ist ein Nachweis und wird **nie** angefasst.
2. Die erneute, rein deterministische Nachweissuche findet für **genau diese**
   Geografie **keinen** Beleg.

Passt ein Altwert in keine bekannte Fehlerform, bleibt er stehen und wird zur
**manuellen Prüfung** gemeldet. Fail closed: im Zweifel nichts tun.

## 4 · Warum ohne KI — und was das kostet

Vier Wege standen zur Wahl (Auftrag §„Technisches Zielmodell"). Gewählt ist
**(4) regelbasierte Bereinigung auf der bereits bezahlten Analyse**, in seiner
kostenfreien Form: die Nachweissuche läuft über
`classification.sammleGeografieKandidaten` auf den **bereits gespeicherten**
Feldern des Wissensobjekts. Das ist **derselbe Code, den der Schreibpfad seit
Sprint 20 benutzt** — es entsteht ausdrücklich **keine zweite, parallele
Klassifikationslogik** (Auftragsregel „Fachgebiete und Entitäten" Nr. 2).

| Größe | Wert |
|---|---|
| Erwartete KI-Aufrufe | **0** |
| Erwartete Kosten | **0,00 USD** |
| Einfluss auf das LLM-Tagesbudget | **keiner** — das Werkzeug bindet weder `ai.js` noch `llm-budget.js` ein |
| Einfluss auf reguläre Production-Verarbeitung | **keiner** — kein Lock, kein Cron, kein Crawl |
| Erwartete Laufzeit | Sekunden je Batch; 23–30 Batches à 25 Objekten |

**Ehrliche Grenze:** Die ursprüngliche KI-Antwort (`ai.affected_geographies`)
hat der alte Schreibpfad **verworfen**. Sie ist im Bestand nicht mehr vorhanden
und lässt sich nicht rekonstruieren. Objekte, deren Region nur die KI kennen
könnte, bleiben nach dem Lauf **ehrlich ohne** betroffene Geografie — statt mit
einer falschen. Das ist der Zweck des Sprints, nicht sein Mangel.

## 5 · Fehlerklassen, Einstufung und gemessene Anzahl

Gemessen **read-only gegen Production am 2026-07-28**, 1 230 Wissensobjekte
gelesen, davon **740 verstanden** (`understanding_status = complete`).

| Fehlerklasse | Einstufung | Anzahl | Maßnahme |
|---|---|---:|---|
| `geo-ebenen-ableitung-bund` | sicher korrigierbar | **471** | Deutschland entfernen |
| `geo-ersatzwert-land` | sicher korrigierbar | **30** | Deutschland entfernen |
| `geo-eu-nicht-kanonisch` | sicher korrigierbar | **37** | freie EU-Geografie entfernen |
| `geo-erwaehnung-als-betroffenheit` | sicher korrigierbar | **32** | nach `mentioned_geographies` verschieben |
| `geo-beleg-ergaenzt` | sicher korrigierbar | **2** | Herkunft auf den inhaltlichen Nachweis heraufstufen |
| `konfidenz-geografie-ehrlich` | sicher korrigierbar | **738** | ehrliche Kennzahl statt Erwähnungszählung |
| `ebene-unbestimmt-ki` | erfordert KI-Neuanalyse | **78** | **nicht in diesem Prozess** |
| `fachgebiet-fehlt-ki` | erfordert KI-Neuanalyse | **567** | **nicht in diesem Prozess** (`ko-enrichment`) |
| `geo-unklar-manuell` | erfordert manuelle Prüfung | **0** | unverändert lassen |
| `geo-belegt-geschuetzt` | darf nicht verändert werden | **0** | unverändert lassen |

**Nur `sicher-korrigierbar` wird automatisch geschrieben.** Die anderen
Einstufungen sind strukturell vom Schreiben ausgeschlossen.

### 5.1 · Gegenprobe gegen die Sprint-19/20-Messung

Die Zahlen reproduzieren die früheren Messungen exakt und sind damit
gegengeprüft, nicht nur behauptet:

| Größe | Sprint 19/20 (2026-07-27) | Sprint 21 (2026-07-28) |
|---|---:|---:|
| unbestimmte politische Ebene | **78** | **78** ✔ exakt |
| Deutschland als Ersatzwert bei Ebene `land` | **30** von 60 | **30** ✔ exakt |
| „Europäische Union" ohne kanonische ID | **37** | **37** ✔ exakt |
| aus bloßen Ortsnennungen entstanden | **34** | **32** + **2** heute belegt = **34** ✔ exakt |
| Deutschland aus Bundesebene | 451 von 451 | **471** (Bestand ist gewachsen) |
| verstandene Vorgänge | 719 | **740** (Bestand ist gewachsen) |

## 6 · Was der Prozess ausdrücklich **nicht** anfasst

1. **Unverstandene Vorgänge (490).** Alle Objekte ohne `decision_level` sind
   `pending` (482) oder `failed` (8) — sie tragen außer einer Schlagzeile keinen
   Inhalt. Die politische Ebene ist seit Sprint 19 **monoton**: würde dieser Lauf
   aus einer bloßen Schlagzeile eine Ebene ableiten und speichern, wäre das ab
   sofort der „ermittelte" Wert, und die spätere echte Analyse dürfte ihn nur
   noch mit einer KI-Aussage korrigieren. **Eine Vermutung würde zum
   Gedächtnis.** Deshalb harter Ausschluss.
2. **Fachgebiete** (`tags`, `policy_field`). `tags` entstehen über einen
   KI-Aufruf, `policy_field` über den bestehenden Anreicherungspfad
   `ko-enrichment.js`. Eigene Logik hier wäre die verbotene zweite
   Klassifikation. Der Befund wird nur **gemeldet** (567 Objekte).
3. **`related_levels`, `event_type`.** Nicht Gegenstand des Auftrags.
4. **Quellen, Pakete, Abrufwege, Crons, Locks, Mandantenprofile, Matching­gewichte,
   Scoring.** Der einzige Schreibpfad ist `saveKnowledgeObjectEnrichment` und
   trifft nur die Klassifikationsspalten von `knowledge_objects`.

### 6.1 · Ein Befund zur Tragweite, ehrlich benannt

`knowledge_objects.affected_geographies` und `knowledge_objects.political_level`
haben heute **keinen Laufzeitkonsumenten** — `matching.js` liest weder das eine
noch das andere (es liest `tags`/`policy_field`). Der Gewinn dieses Sprints ist
deshalb **Datenintegrität und Ehrlichkeit der Kennzahlen**, nicht eine unmittelbar
sichtbare Produktwirkung. Umgekehrt ist damit auch das Risiko klein: eine stille
Matching- oder Scoring-Änderung ist strukturell ausgeschlossen.

## 7 · Der Prozess

### 7.1 · Vorschau ist der Standard

```bash
node scripts/nachklassifikation.js                       # Vorschau, schreibt nichts
node scripts/nachklassifikation.js --max=5000 --json
node scripts/nachklassifikation.js --ids=ko-1,ko-2
node scripts/nachklassifikation.js --von=2026-07-01 --bis=2026-07-20
node scripts/nachklassifikation.js --mandant=<user-id>
node scripts/nachklassifikation.js --klassen=geo-eu-nicht-kanonisch
```

Der **Schreibmodus** verlangt **drei** unabhängige Bedingungen:

```bash
HELMUT_NACHKLASSIFIKATION_BESTAETIGT=ja \
  node scripts/nachklassifikation.js --ausfuehren --max=25
```

1. `--ausfuehren`
2. `HELMUT_NACHKLASSIFIKATION_BESTAETIGT=ja`
3. das **Production-Schreibgate** (`lib/helmut/production-schreibgate.js`) — es
   bricht **vor** dem ersten Schreibzugriff ab, wenn Fachtabellen und
   Betriebsdaten nicht beweisbar dasselbe Backend nutzen.

### 7.2 · Was die Vorschau je Objekt zeigt

Objekt-ID · Vorgang · alter Wert · vorgeschlagener neuer Wert · Änderungsgrund ·
Herkunft vorher/nachher · Vertrauensrang vorher/nachher · ob ein KI-Aufruf nötig
wäre · ob die Änderung automatisch sicher ist · ob eine manuelle Prüfung
empfohlen wird · Fehlerklasse und Einstufung.

**Vertrauensrang:** Ebene und Geografie haben **zwei verschiedene Skalen**
(Ebene: `deriver` 1 < `ki` 2 · Geografie: `quelle` 1 < `erwaehnung`/`bestand-alt` 2
< `ki` 3 < `inhalt` 4 < `amtlich` 5 < `parser` 6). Das Protokoll rechnet je Achse
auf der richtigen Skala und weist sie mit aus.

### 7.3 · Begrenzungen und Riegel

| Anforderung | Umsetzung |
|---|---|
| Objekt-IDs | `--ids=` — wirkt **vor** jeder Mengenkappung (Lehre aus B4-3); `--ids=` leer bricht ab |
| Zeitraum | `--von=` / `--bis=` |
| Mandant | `--mandant=` über `decisions` mit Pflicht-Mandantenfilter; **fail closed** bei 0 Zuordnungen |
| Fehlerklasse | `--klassen=` Positivliste; unbekannte Klasse bricht ab |
| Maximale Objektzahl | `--max=` (Standard 200) — darüber **Abbruch**, keine stille Kappung |
| Kleine Batches | `--batch=` (Standard 25) |
| Fortsetzbarkeit | über **Idempotenz**: bereits korrigierte Objekte planen nichts mehr; Reihenfolge deterministisch (älteste zuerst) |
| Abbruch bei Fehlerquote | `--fehlerquote=` (Standard 10 %) |
| Keine parallele Verarbeitung desselben Objekts | `updated_at` wird unmittelbar vor jedem Schreibvorgang erneut gelesen; Abweichung → Objekt wird ausgelassen und als Kollision gezählt |
| Fehler in einem Objekt | wird gezählt, bricht die Schleife nicht ab, verändert kein anderes Objekt |
| Lesefehler | eigener Exit-Code 8 — **nie** als „nichts zu tun" gedeutet |

### 7.4 · Warum seitenweise gelesen wird

Ein einzelner PostgREST-Aufruf liefert höchstens **1 000 Zeilen**. Bei 1 230
Objekten wäre die Vorschau eine **stille Teilmenge** gewesen — genau der
Fehlermodus, der im Repo schon einmal aufgetreten ist (Nebenbefund W-1 bei
`listRawDocuments`). Der erste Vorschaulauf hat das reproduziert (`gelesen: 1000`).
Neu deshalb `storage.listKnowledgeObjectsSeitenweise`: feste Seitengröße, `order`
auf der **stabilen** Spalte `id` (nicht `updated_at`, sonst können parallele
Schreibvorgänge Zeilen zwischen zwei Seiten verschieben), und ein echter
Lesefehler wird **geworfen** statt als Leerstand gemeldet. Der Bericht weist
zusätzlich aus, wenn die Leseobergrenze erreicht wurde.

## 8 · DSGVO

Drei Maßnahmen, alle rein und getestet:

1. Das Protokoll enthält **von vornherein keine Prosafelder** — Überschrift,
   „was ist passiert", Zusammenfassung und Dokumenttitel werden nie übernommen.
   Die Feldliste des Protokolls ist **abgeschlossen** und wird getestet.
2. Entitätsnamen vom Typ `person` werden durch `[person]` ersetzt — **datengetrieben
   am mitgeführten `type`**, nicht nur über den Katalog. Das ist wichtig, weil der
   kanonische Entitätenkatalog bewusst **keine** Person enthält
   (Mandantenneutralität, `CLAUDE.md` §4.2): ein Personenname im Bestand steht dort
   als unaufgelöster Eintrag mit `type: "person"`. Eine reine Katalogprüfung würde
   ihn **nie** erfassen. Der Katalogabgleich bleibt als zweite Schicht bestehen.
3. Jede verbleibende Zeichenkette läuft durch `redactSensitive` — dieselbe
   zentrale Redaction wie Alarme und Fehlerpfade.

## 9 · Tests

| Suite | Ergebnis |
|---|---|
| `nachklassifikation-test.js` (neu) | **101/101** — enthält die 20 im Auftrag verbindlich geforderten Fälle einzeln und benannt |
| `nachklassifikation-mutationsprobe.js` (neu) | **21 von 21 Mutationen rot** |
| Offline-Suite `run-offline-tests.js` | **158/172** gegen die Basislinie **157/171** desselben Arbeitsbaums — **identische 14 Vorbefunde**, also +1 Suite, +1 grün, **keine Verschlechterung** |
| Browser-Smoke | **nicht gefahren** — keine UI-Änderung |

> **Zur Zahl 158/172:** in dieser Sitzung sind Production-Zugangsdaten gesetzt;
> 14 netz-/DB-abhängige Suiten scheitern deshalb am Netz-Guard des Runners. Die
> **Abnahmezahl ist der CI-Lauf ohne Secrets**, nicht dieser lokale Wert. Die
> Basislinie wurde im selben Arbeitsbaum durch Entfernen der neuen Dateien
> gemessen und ergab dieselben 14 Fehlschläge.

### 9.1 · Idempotenz an echten Production-Daten

Nicht nur an Testfixtures, sondern über **alle 740 verstandenen
Production-Objekte** gerechnet (rein lesend, der Schreibvorgang wurde im
Speicher simuliert):

| Größe | Ergebnis |
|---|---|
| Lauf 1 schreibt | 740 |
| Lauf 2 schreibt danach noch | **0** |
| Lauf 3 schreibt danach noch | **0** |
| verlorene Geografien **mit echter Herkunft** | **0** |

## 10 · Die lesende Production-Vorschau

Ausgeführt am **2026-07-28**, strikt lesend, **keine** Production-Mutation.

| Kennzahl | Umfang A (nur Geografie) | Umfang B (Geografie + ehrliche Konfidenz) |
|---|---:|---:|
| gelesen | 1 230 | 1 230 |
| unverstanden, ausgeschlossen | 490 | 490 |
| geplant | 740 | 740 |
| **unverändert** | **168** | **0** |
| **Schreibvorgänge** | **572** | **740** |
| erwartete Batches (à 25) | **23** | **30** |
| Geografien entfernt | **570** | 570 |
| Geografien ergänzt | 0 | 0 |
| Geografie-Beleg gestärkt | **2** | 2 |
| politische Ebenen korrigiert | **0** | 0 |
| Fachgebiete/Entitäten verändert | **0** | 0 |
| manuelle Prüffälle | **0** | 0 |
| Objekte mit KI-Bedarf (nur gemeldet) | 630 | 630 |
| **erwartete KI-Aufrufe** | **0** | **0** |
| **erwartete Kosten** | **0,00 USD** | **0,00 USD** |

**Auswirkung je Mandant:** `knowledge_objects` trägt bewusst **kein**
`user_id`/`tenant_id` — ein Vorgang wird global genau einmal verstanden. Eine
Aufteilung „je Mandant" ist deshalb keine Eigenschaft der Tabelle. Die
Begrenzung `--mandant` löst sie relational über `decisions` auf (mit
Pflicht-Mandantenfilter) und bricht **fail closed** ab, wenn ein Mandant keine
Zuordnung hat — read-only gegen Production verifiziert.

### 10.1 · Stichproben an echten Objekten

| Objekt | Ist-Zustand | geplant | Bewertung |
|---|---|---|---|
| `ko-vg-grundsicherung` | Ebene `bund`, betroffen `[Deutschland]`, genannt: NRW + Castrop-Rauxel, Ministerium: BMAS | Deutschland **entfernen**; NRW/Castrop-Rauxel bleiben **Erwähnungen** | korrekt — BMAS ist eine **Bundes**institution und trägt keine regionale Information; die Ortsnennungen sind kein Beleg für Betroffenheit |
| `ko-vg-krankschreibung` | Ebene `land`, betroffen `[Deutschland]`, **keine** Ortsnennung | Deutschland **entfernen** | korrekt — der verbotene Ersatzwert für ein unbekanntes Bundesland |
| `ko-vg-wissenschafts` | `decision_level` **null**, Zustand **pending** | **nichts** | korrekt — unverstandene Vorgänge sind hart ausgeschlossen (§6.1) |

## 11 · Rückfall- und Abbruchstrategie

**Vor dem Lauf**
1. Sicherung erstellen (`scripts/backup-export.js`, Umfang `seed`) und
   Prüfsumme notieren.
2. Vorher-Messung festhalten: Anzahl `knowledge_objects`, Anzahl Objekte mit
   nicht-leerem `affected_geographies`, Verteilung je Fehlerklasse
   (= der Vorschaubericht als JSON, archiviert).

**Während des Laufs**
- Abbruch bei Fehlerquote > 10 % (Exit 7).
- Abbruch, wenn mehr Objekte anliegen als `--max` (Exit 4).
- Kollisionen (Objekt wurde parallel regulär verändert) werden **ausgelassen**,
  nicht überschrieben, und im Ergebnis gezählt.

**Rückweg**
- Der Lauf schreibt ausschließlich in die Klassifikationsspalten von
  `knowledge_objects`. Ein Rückweg ist der gezielte Restore genau dieser Spalten
  aus der Sicherung.
- **Ehrliche Einschränkung:** ein Restore stellt den Altbestand wieder her —
  einschließlich der falschen Werte. Das ist gewollt: der Rückweg ist ein
  Rückweg, keine zweite Korrektur.
- Der Restore ist **nie gegen Production gelaufen** (OP-01). Das ist ein
  bekanntes, offenes Risiko und **kein** neues Risiko dieses Sprints.

**Nach dem Lauf**
- Zweiter Vorschaulauf: er muss **0 Restschreibvorgänge** melden (an echten
  Production-Daten vorab bewiesen, §9.1).
- Matching und Briefings lesend prüfen.

## 12 · Freigabeschritte für den Production-Lauf

Der Schreiblauf ist **noch nicht gefahren**. Erbeten wird eine Freigabe in
dieser Reihenfolge:

1. **Umfang wählen** — A (nur Geografie, 572 Objekte) oder B (zusätzlich die
   ehrliche Geografie-Konfidenz, 740 Objekte). Empfehlung: **B**, weil sonst 166
   Objekte weiterhin `geography: "medium"` behaupten, obwohl sie **keine**
   belegte Region tragen — genau das falsche Grün, das `CLAUDE.md` §4.4 verbietet.
2. **Sicherung** erstellen und Prüfsumme festhalten.
3. **Probelauf auf kleiner Menge:** `--max=25 --ausfuehren`, anschließend
   Vorher/Nachher an diesen 25 Objekten gegenmessen.
4. **Hauptlauf** in Batches à 25, mit `--klassen=` auf den freigegebenen Umfang
   begrenzt.
5. **Zweiter Vorschaulauf** — muss 0 Restschreibvorgänge melden.
6. **Lesende Gegenprobe** von Matching und Briefings.

Ohne diese Freigabe wird der Prozess **nicht** im Schreibmodus gegen Production
ausgeführt.
