# Nachklassifikation des Altbestands (Sprint 21, OP-24)

**Stand:** 2026-07-28 · **Zustand:** **vollständiger Production-Schreiblauf über Umfang B
ausgeführt und bewiesen** (728 Objekte, 0 Fehler, 0 Kollisionen, Idempotenz 0) —
Protokoll in §14 · Stufe-1-Probelauf in §13

Kanonisches Dokument zu OP-24. Der Sprintstatus steht in
[`CURRENT_STATE.md`](CURRENT_STATE.md) §12, der offene Punkt in
[`datenmotor-restliste.md`](datenmotor-restliste.md).

---

## 1 · Worum es geht, in vier Sätzen

Sprint 20 hat den **Schreibpfad** repariert: eine betroffene Geografie entsteht
nur noch aus Nachweisen, nie aus der politischen Ebene. Der **Altbestand** blieb
bewusst unangetastet und trägt die alten Fehler weiter. Sprint 21 baut den
Nachlauf, der diese Altfehler entfernt — **ohne** den Bestand pauschal zu
überschreiben und **ohne** einen einzigen KI-Aufruf. Der Lauf ist inzwischen
vollständig gefahren: Probelauf (§13) und freigegebener Hauptlauf über
Umfang B (§14), beide bewiesen.

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
| Offline-Suite `run-offline-tests.js` (lokal) | **158/172** gegen die Basislinie **157/171** desselben Arbeitsbaums — **identische 14 Vorbefunde**, also +1 Suite, +1 grün, **keine Verschlechterung** |
| **CI-Gate (verbindliche Abnahme)** | **beide Pflicht-Checks grün** — `Syntax + Offline-Suiten` und `Browser-/Mobile-Smoke (Chromium)`, Lauf `30317133853`, Commit `8d8ae3e` |
| Browser-Smoke lokal | **nicht gefahren** — keine UI-Änderung; im CI läuft er trotzdem und ist grün |

> **Zur Zahl 158/172:** in dieser Sitzung sind Production-Zugangsdaten gesetzt;
> 14 netz-/DB-abhängige Suiten scheitern deshalb am Netz-Guard des Runners. Die
> **Abnahmezahl ist der CI-Lauf ohne Secrets**, nicht dieser lokale Wert. Die
> Basislinie wurde im selben Arbeitsbaum durch Entfernen der neuen Dateien
> gemessen und ergab dieselben 14 Fehlschläge.
>
> **Ehrliche Einschränkung:** die *Einzelzahl* der CI-Suiten konnte aus dieser
> Sitzung nicht gelesen werden — der Log-Host von GitHub Actions ist über den
> Agent-Proxy gesperrt (`CONNECT tunnel failed, 403`). Belegt ist der
> **Ausgang** beider Pflicht-Checks (`conclusion: success`), nicht die Zahl.

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

---

## 13 · Stufe 1: kontrollierter Production-Probelauf (2026-07-28)

**Freigabeumfang:** ausschließlich ein kleiner, kontrollierter Probelauf. Der
vollständige Lauf über Umfang B (740 Vorgänge) war **nicht** freigegeben und ist
**nicht** gelaufen. Schritt 3 der Freigabeliste in §12 ist damit erledigt,
Schritt 4 (Hauptlauf) weiterhin gesperrt.

### 13.1 · Startprüfung (9 von 9 erfüllt)

| # | Prüfung | Ergebnis |
|---|---|---|
| 1 | Arbeitsbaum sauber | ✔ `git status` leer |
| 2 | Lokaler Stand = `main` | ✔ `git rev-list --left-right --count origin/main...HEAD` → `0 0` |
| 3 | PR #156 in `main` | ✔ `f59bc7c` ist `main`-HEAD |
| 4 | Production trägt den #156-Stand | ✔ Deployment `dpl_ERm1PDWzUY9xSFUnTDrVcbLmZcem`, `READY`, `target: production`, Commit `f59bc7ca…`. **Zusätzlich durch einen echten Production-Lauf belegt:** `crawl-20260728075825-6a3xv` (08:00:36–08:02:20 UTC) trägt `commit_ref f59bc7ca…` |
| 5 | Kein paralleler Sprint an Classification/Understanding/Storage/Nachklassifikation | ✔ nur zwei Branches am Remote: `main` und der Doku-Branch dieses Auftrags |
| 6 | Kein laufender regulärer Prozess auf denselben Objekten | **zunächst NICHT erfüllt** — siehe 13.2 |
| 7 | Vorschaumodus ohne Schreibzugriff | ✔ zwei Vorschauläufe, `max(updated_at)` blieb bei `08:02:08.534+00` |
| 8 | Production-Zahlen ≈ dokumentierter Ausgangszustand | ✔ mit erklärten Abweichungen, siehe 13.3 |
| 9 | Schalter und Riegel aus dem echten Code gelesen | ✔ `scripts/nachklassifikation.js` (Exit-Codes, `--ids`-Reihenfolge, Kollisionsprüfung) und `lib/helmut/production-schreibgate.js` (vier Pflichtvariablen) |

### 13.2 · Der Lauf wurde verzögert, nicht erzwungen

Zu Beginn (07:58 UTC) lief ein **realer Crawl** mit anschließendem
`understanding-eager` — belegt durch 41 neue Rohdokumente in 15 Minuten und die
Sperren `crawl-annika-klose` und `global-understanding`. Damit war Startprüfung 6
verletzt. Es wurde **nicht** geschrieben, sondern gewartet: rein lesende
Beobachtung im Minutentakt bis **drei aufeinanderfolgende ruhige Messungen**
(keine neuen Rohdokumente, keine Wissensobjekt-Änderung, **0** aktive Sperren)
vorlagen — erreicht um **08:18:50 UTC**. Der reguläre Lauf endete um 08:02:20,
die letzte Sperre lief um 08:17:26 aus. Der Probelauf fiel damit in ein freies
Fenster; der nächste Cron war erst 10:00 UTC.

### 13.3 · Phase 1 — frische Gesamtvorschau (rein lesend, 08:19 UTC)

| Kennzahl | Sprintbericht (2026-07-28, 00:21) | frische Vorschau | Bewertung |
|---|---:|---:|---|
| gelesen | 1 230 | **1 249** | +19 durch regulären Betrieb |
| unverstanden, ausgeschlossen | 490 | **482** | 8 wurden zwischenzeitlich verstanden |
| geplant | 740 | **767** | +27 |
| unverändert | 0 | **27** | **exakt die 27 neuen Objekte** |
| Schreibvorgänge | 740 | **740** | unverändert |
| Geografien entfernt | 570 | **570** | ✔ identisch |
| Geografie-Beleg gestärkt | 2 | **2** | ✔ identisch |
| Ebenen / Entitäten korrigiert | 0 / 0 | **0 / 0** | ✔ identisch |
| manuelle Prüffälle | 0 | **0** | ✔ identisch |
| erwartete KI-Aufrufe / Kosten | 0 / 0,00 USD | **0 / 0,00 USD** | ✔ identisch |
| Fehlerklassen (sicher) | 6 | **6** | ✔ identisch |

**Alle sechs sicheren Geografie-Fehlerklassen sind zahlengleich geblieben:**
471 · 30 · 37 · 32 · 2 · 738. Die Abweichungen betreffen ausschließlich neu
hinzugekommene Objekte und sind vollständig erklärt:

* Die **27** zusätzlich geplanten Objekte tragen alle ein `updated_at` **ab
  2026-07-28 04:02** — sie wurden also vom **reparierten Sprint-20-Schreibpfad**
  angelegt und sind bereits korrekt. Der Plan lässt alle 27 unverändert.
* Neu erscheint die Klasse `geo-belegt-geschuetzt` mit **8** Objekten. Das ist
  kein Fehler, sondern der Beweis, dass die Schutzregel greift: diese Einträge
  tragen eine echte Herkunft (`ki`) und werden deshalb **nie** angefasst.
* `fachgebiet-fehlt-ki` 567 → 594 (+27): dieselben neuen Objekte, die noch keine
  Fachgebiete haben. Wird nur **gemeldet**, nie geschrieben.

**Keine unerklärte Abweichung.** Die Vorschau hat nichts geschrieben —
`max(updated_at)` über `knowledge_objects` blieb vorher wie nachher
`2026-07-28 08:02:08.534+00`.

### 13.4 · Phase 2 — die Stichprobe (12 Objekte, alle 6 Klassen)

Auswahlregel, deterministisch und rein lesend: je Klasse die Objekte, an denen
die Klasse **eindeutig** ablesbar ist (bei den Geografieklassen darf die ehrliche
Konfidenz mitlaufen — sie ist die unvermeidliche Folge jeder Geografiekorrektur;
bei der Konfidenzklasse musste sie die **einzige** Änderung sein), Vorrang für
Objekte ohne gemeldeten KI-Bedarf, dann nach `id`.

| # | Objekt-ID | Fehlerklasse | Ebene | alter Geo-Wert | neuer Geo-Wert | Herkunft vorher → nachher | Konfidenz vorher → nachher | DB-Änderungen |
|---|---|---|---|---|---|---|---|---:|
| 1 | `ko-vg-0362b11ce5daab502d72b364` | `geo-ebenen-ableitung-bund` | bund | `[geo-bund]` | `[]` | `bestand-alt` → – | low → unknown | 1 |
| 2 | `ko-vg-abgeordnete` | `geo-ebenen-ableitung-bund` | bund | `[geo-bund]` | `[]` | `bestand-alt` → – | medium → unknown | 1 |
| 3 | `ko-vg-sofortprogramm` | `geo-ersatzwert-land` | land | `[geo-bund]` | `[]` | `bestand-alt` → – | medium → unknown | 1 |
| 4 | `ko-vg-1801c18ffb22a9a233b50ef6` | `geo-ersatzwert-land` | land | `[geo-bund]` | `[]` | `bestand-alt` → – | medium → unknown | 1 |
| 5 | `ko-vg-emissionshandel` | `geo-eu-nicht-kanonisch` | eu | `[Europäische Union]` | `[]` | `bestand-alt` → – | medium → unknown | 1 |
| 6 | `ko-vg-hrvatskoj` | `geo-eu-nicht-kanonisch` | eu | `[Europäische Union]` | `[]` | `bestand-alt` → – | medium → unknown | 1 |
| 7 | `ko-vg-98322cf41431d3597751f368` | `geo-erwaehnung-als-betroffenheit` | land | `[geo-land-sachsen]` | `[]` | `bestand-alt` → – | medium → unknown | 1 |
| 8 | `ko-vg-fußfesseln` | `geo-erwaehnung-als-betroffenheit` | land | `[geo-land-bremen]` | `[]` | `bestand-alt` → – | medium → unknown | 1 |
| 9 | `ko-vg-brandenburg` | `geo-beleg-ergaenzt` | land | `[geo-land-brandenburg]` | `[geo-land-brandenburg]` | `bestand-alt` → **`inhalt`** | medium → medium | 1 |
| 10 | `ko-vg-12e77972ea2b5cf97b937eb5` | `geo-beleg-ergaenzt` | land | `[geo-land-berlin]` | `[geo-land-berlin]` | `bestand-alt` → **`inhalt`** | medium → medium | 1 |
| 11 | `ko-vg-1ec5990cf61fd0115b2ca1b5` | `konfidenz-geografie-ehrlich` | unknown | `[]` | `[]` | – | low → unknown | 1 |
| 12 | `ko-vg-5d41e785c81b83bb016628c2` | `konfidenz-geografie-ehrlich` | unknown | `[]` | `[]` | – | medium → unknown | 1 |

**Mandant:** entfällt als Auswahlachse — `knowledge_objects` trägt bewusst kein
`user_id`/`tenant_id`; ein Vorgang wird global genau einmal verstanden (§10).
Es wurde **keine** Mandantenbegrenzung gesetzt, die Auswahl ist mandantenneutral.

**Warum jede Änderung deterministisch sicher ist:** Zeilen 1–8 entfernen einen
Wert, der (a) **keine** echte Herkunft trägt (nur `bestand-alt`, Rang 2) und für
den (b) die erneute Nachweissuche **keinen** Beleg findet — die beiden
Bedingungen aus §3, beide erfüllt. Zeilen 9–10 entfernen **nichts**: dort steigt
nur die Herkunft einer bereits vorhandenen Region auf `inhalt`, weil ein
subnationaler Nachweis existiert (die Region wird dadurch dauerhaft geschützt).
Zeilen 11–12 fassen ausschließlich die Kennzahl an, kein einziges Geografie-Feld.
Keine Zeile braucht einen KI-Aufruf; **0** manuelle Prüffälle in der Stichprobe.

**DSGVO:** Es sind keine Prosafelder, Dokumenttexte oder Personennamen
übernommen. Die Kennungen sind Themenwurzel-Slugs aus `vorgang_id`; das Protokoll
läuft durch `maskiereProtokoll` (§8).

### 13.5 · Phase 3 — letzte Sicherheitsprüfung (08:24 UTC)

* Alle 12 Objekte erneut gelesen: `updated_at` **unverändert** gegenüber der
  Auswahl → **0** Objekte auszuschließen.
* Vorschau **begrenzt auf genau die 12 IDs**: 12 geplant, 12 Schreibvorgänge,
  `nichtGefunden: []`, 8 Geografien entfernt, 2 Belege gestärkt, 0 Ebenen,
  0 Entitäten, 0 manuell, **0 KI-Aufrufe**.
* Kein KI-Pfad geladen: der Modulgraph des Schreibpfads (16 Module) enthält
  **kein** `ai.js`, `llm-budget.js` oder `llm-usage.js`; die beiden Sprint-21-
  Dateien enthalten **keine** statische KI-Referenz.
* Umgebung ruhig: **0** aktive Sperren, **0** neue Rohdokumente in 10 Minuten.
* Ausgangsfingerabdruck über **alle 1 237 übrigen** Wissensobjekte gebildet:
  `f277c07bf90d7cb8cda84d7e23904cfd`.

### 13.6 · Phase 4 — der Schreiblauf

```
--ids=<12 Kennungen> --max=12 --batch=12 --fehlerquote=0 --ausfuehren
+ HELMUT_NACHKLASSIFIKATION_BESTAETIGT=ja  + Production-Schreibgate (4 von 4)
```

**2026-07-28, 08:25:13–08:25:21 UTC (8 s), Exit 0.**

| Größe | Wert |
|---|---:|
| geplant | 12 |
| verarbeitet | 12 |
| **geschrieben** | **12** |
| Fehler | **0** |
| Kollisionen | **0** |
| abgebrochen | **nein** |
| KI-Aufrufe | **0** |

### 13.7 · Phase 5 — vollständiger Readback

Jedes Objekt wurde unmittelbar danach vollständig neu aus Production gelesen und
**Spalte für Spalte** gegen den Vorher-Abzug und die Vorschau verglichen.

| Beweisfrage | Ergebnis |
|---|---|
| Jede Änderung entspricht exakt der Vorschau | **12 von 12**, **0** Abweichungen |
| Belegte Geografie verloren | **0** |
| Nicht geplante Geografie ergänzt | **0** |
| Politische Ebene verändert (`decision_level`/`political_level`) | **0** |
| Fachgebiete (`tags`/`policy_field`) oder Entitäten verändert | **0** |
| Andere Felder verändert | **0** — geändert wurden ausschließlich `affected_geographies`, `mentioned_geographies`, `classification_confidence` |
| Andere Objekte verändert | **0** — Fingerabdruck der 1 237 übrigen Objekte **identisch** (`f277c07b…` vorher wie nachher) |
| Mandantentrennung verletzt | **nein** — geschrieben wurde nur in die mandantenneutrale Tabelle `knowledge_objects`; `decisions` und Profile unberührt |
| KI-Kosten entstanden | **0,00 USD** — `llm_usage` **0** Zeilen, `llm_budget_counters` Fingerabdruck **identisch** (`b1d60047…`) |

Der Nachweis der Änderung steht additiv in `classification_confidence`:
`nachklassifikation_am = 2026-07-28T08:25:17.061Z` und
`nachklassifikation_klassen` mit genau den Klassen aus der Vorschau.

### 13.8 · Phase 6 — Idempotenz

Neue Vorschau, begrenzt auf genau die 12 bearbeiteten IDs:

| Erwartung | Ergebnis |
|---|---:|
| weitere sichere Änderungen | **0** |
| geplante Schreibvorgänge | **0** (12 unverändert, 0 Batches) |
| KI-Aufrufe | **0** |
| manuelle Prüffälle | **0** |

Verbleibend werden nur noch **Meldungen** ausgewiesen: `geo-belegt-geschuetzt` 2,
`fachgebiet-fehlt-ki` 2, `ebene-unbestimmt-ki` 2. Die erste Zahl ist das
gewünschte Ergebnis: die beiden gestärkten Regionen gelten jetzt als **belegt und
geschützt**. Ein zweiter Schreibmoduslauf wurde **nicht** ausgeführt.

### 13.9 · Phase 7 — Auswirkungen (rein lesend)

| Prüfung | Ergebnis |
|---|---|
| Objekte weiterhin abrufbar | **12 von 12** über `getKnowledgeObjectById` |
| Matching unverändert plausibel | `matchProfileToKnowledgeObjects` gegen **alle 8** echten Production-Profile fehlerfrei, 80 Treffer auf der Stichprobe. **Strukturell abgesichert:** `matching.js` liest `tags`, `policy_field`, `regions`, `mentioned_locations`, `embedding` u. a. — **keines** der drei geänderten Felder |
| Briefings weiterhin abrufbar | 8 Profile geprüft, **0 Fehler**; 3 tragen ein Briefing, 5 nicht (unveränderter Bestandszustand). **71** Briefings insgesamt, letztes 08:16:31 — **0** neue seit dem Lauf |
| Fehlermeldungen / auffällige Telemetrie | **0** fehlgeschlagene Läufe in 3 h. Alle 293 Telemetriezeilen stammen aus 08:02–08:16, also **vor** dem Schreiblauf; der Lauf selbst erzeugt **keine** Telemetriezeile |
| Normaler Betrieb | läuft weiter: **0** aktive Sperren, Crons unberührt, nächster Cron 10:00 UTC |

Es wurden **keine** Briefings erzeugt und **keine** regulären Verarbeitungsläufe
für diesen Test gestartet.

### 13.10 · Befund N-1: der Lauf schreibt `updated_at` nicht fort

**Belegt an allen 12 Objekten:** `updated_at` ist vorher wie nachher identisch,
obwohl der Datensatz nachweislich geändert wurde. `saveKnowledgeObjectEnrichment`
setzt die Spalte nicht, und es gibt keinen DB-Trigger.

**Bewertung: kein Defekt, aber vor dem Hauptlauf zu wissen.**

* Es ist **kein neues Verhalten** von Sprint 21 — die Funktion wird seit dem
  `ko-enrichment`-Pfad so benutzt.
* Die **Kollisionsprüfung bleibt wirksam**: sie schützt gegen die *reguläre*
  Verarbeitung, und die setzt `updated_at` sehr wohl (belegt an den 27 heute neu
  geschriebenen Objekten). Genau dieser Fall wird weiterhin erkannt.
* Die **Nachvollziehbarkeit ist gegeben**, nur an anderer Stelle:
  `classification_confidence.nachklassifikation_am` und
  `nachklassifikation_klassen` werden geschrieben und sind auswertbar.
* Der Nebeneffekt ist eher erwünscht: eine Nachklassifikation lässt einen Vorgang
  **nicht** künstlich frisch aussehen und stört keine nach `updated_at`
  sortierende Lage- oder Briefing-Logik.
* **Konsequenz für den Hauptlauf:** nach 740 Korrekturen zeigt keine
  `updated_at`-basierte Sicht, dass etwas geändert wurde. Wer den Umfang
  gegenmessen will, muss `classification_confidence.nachklassifikation_am`
  auswerten, nicht `updated_at`.

Ein Codefehler wurde **nicht** gefunden; es war **keine** Codeänderung nötig.

### 13.11 · Was Stufe 1 beweist — und was nicht

**Bewiesen:** der reale Production-Schreibpfad entspricht der Vorschau exakt, für
**alle sechs** sicheren Fehlerklassen, ohne Streuverlust auf andere Felder oder
Objekte, ohne KI-Kosten, idempotent und ohne Betriebsstörung.

**Nicht bewiesen:** das Verhalten **unter Menge**. Der Probelauf umfasste 12 von
740 Objekten in einem Batch und 8 Sekunden. Offen bleiben damit das Verhalten
über 30 Batches, eine Kollision mit einem parallel laufenden regulären Prozess
(im Probelauf gab es **0**) und der Rückweg, der weiterhin **nie** gegen
Production gelaufen ist (OP-01, bekanntes Altrisiko).

### 13.12 · Nächste erforderliche Freigabe

> **Überholt am 2026-07-28:** die Freigabe für **Umfang B** wurde erteilt, der Hauptlauf ist
> ausgeführt und bewiesen — siehe §14. Dieser Abschnitt bleibt als historischer Stand erhalten.

Der vollständige Lauf bleibt **gesperrt**. Erbeten wird genau eine Entscheidung:

> **Umfang B** (Geografie **und** ehrliche Konfidenz, 740 Objekte, 30 Batches à
> 25, 0 KI-Aufrufe, 0,00 USD) freigeben — oder **Umfang A** (nur Geografie, 572
> Objekte), womit 166 Objekte weiterhin `geography: "medium"` behaupten, ohne
> eine belegte Region zu tragen.

Vor dem Hauptlauf unverändert nötig: frische Sicherung mit notierter Prüfsumme
(§11), ein freies Zeitfenster ohne laufenden Crawl/Understanding-Lauf (die
Wartepflicht aus 13.2 gilt weiter), danach zweiter Vorschaulauf und lesende
Gegenprobe.

### 13.13 · Branch, PR, Tests

* Branch `claude/sprint-21-production-pilot-enef9l`, **PR #157** — **reine
  Dokumentation**, kein Anwendungscode.
* **CI-Gate grün: beide Pflicht-Checks** — `Syntax + Offline-Suiten` und
  `Browser-/Mobile-Smoke (Chromium)`, Lauf `30343049294`.
* Offline-Suite in dieser Sitzung **158/172** — identische **14**
  netz-/DB-abhängige Vorbefunde wie im Sprintbericht (Zugangsdaten gesetzt, der
  Netz-Guard greift). Verbindlich ist der CI-Lauf ohne Secrets.
* Es wurde **kein** Code geändert, daher **keine** neue Testabdeckung nötig und
  **kein** Fehlerkorrektur-PR erforderlich.

---

## 14 · Stufe 2: vollständiger Production-Schreiblauf, Umfang B (2026-07-28)

**Freigabe:** ausdrücklich erteilt für den verbleibenden Umfang B (Geografie **und**
ehrliche Konfidenz). Nicht freigegeben und nicht ausgeführt: KI-Aufrufe, unverstandene/
`pending`/`failed`-Objekte, Ebenen-/Fachgebiets-/Entitätsänderungen, manuelle Prüffälle,
Migrationen, Cron-/Lock-/Budget-/Quellen-/Profil-/Matching-Änderungen, neue Briefings,
Anwendungscode.

### 14.1 · Startprüfung (12 von 12 erfüllt)

| # | Prüfung | Ergebnis |
|---|---|---|
| 1 | Arbeitsbaum sauber | ✔ `git status` leer |
| 2 | Lokaler Stand = `main` | ✔ `rev-list --count origin/main...HEAD` → `0 0` (`88582c1`) |
| 3 | PR #156 und #157 in `main` | ✔ beide `merge-base --is-ancestor` |
| 4 | Production auf `main`-Stand | ✔ Deployment `dpl_AcQywjJ4LRzbWFE28zPMiHvbJ3P1` `READY`, `target: production`, Commit `88582c1` |
| 5 | Nachklassifikationsprozess = getesteter Stand | ✔ kein Diff zu #156, kein Codeeingriff seitdem |
| 6 | Kein paralleler Sprint (Understanding/Classification/Storage/Nachklassifikation) | ✔ Remote nur `main` + dieser Doku-Branch; offene PRs (#148/#132/#117/#115/#112/#111/#88/#70/#8) berühren den Pfad nicht |
| 7 | Kein Crawl/Understanding/Schreibprozess | ✔ letztes Rohdokument 08:02:59 UTC (~55 min alt), `max(updated_at)` 08:02:08, nächster Cron 10:00 UTC |
| 8 | Keine aktiven Sperren | ✔ 0 in `pipeline_locks` (Tabelle) und 0 im Auth-Store |
| 9 | Verbindung/Sicherheitsparameter aus dem Code | ✔ `production-schreibgate.js` (4 Pflichtvariablen gesetzt), `storage.js`-Pfade |
| 10 | Vorschau schreibt nichts | ✔ `max(updated_at)` vor wie nach der Vorschau `08:02:08.534` |
| 11 | 12 Probelaufobjekte unverändert erkannt | ✔ alle 12 in der frischen Vorschau `unveraendert: true`; genau 12 Objekte trugen die Markierung |
| 12 | Keine unbekannten/manuellen Fälle im Schreibumfang | ✔ 0 manuelle Fälle; Schreiblauf zusätzlich per `--klassen`-Positivliste (6 Klassen) und `--ids` (728 Kennungen) strukturell begrenzt |

### 14.2 · Phase 1 — frische Gesamtvorschau (rein lesend, 08:59 UTC)

| Kennzahl | Wert | Bewertung |
|---|---:|---|
| gelesen | **1 249** | wie Stufe 1 |
| unverstanden, ausgeschlossen | **482** | identisch |
| geplant | **767** | identisch |
| unverändert | **39** | = 27 bereits korrekte neue Objekte + **die 12 Probelaufobjekte** |
| **Schreibvorgänge** | **728** | exakt 740 − 12, wie im Auftrag erwartet |
| erwartete Batches (à 25) | **30** | |
| Geografien entfernt | **562** | 570 − 8 (Probelauf) |
| Geografie-Beleg gestärkt | **0** | beide bereits in Stufe 1 erledigt |
| Ebenen / Fachgebiete / Entitäten | **0 / 0 / 0** | |
| manuelle Prüffälle | **0** | |
| erwartete KI-Aufrufe / Kosten | **0 / 0,00 USD** | |

Fehlerklassen (sicher): 469 · 28 · 35 · 30 · 0 · 728 — jede Differenz zur Stufe-1-Vorschau
ist exakt die Probelaufmenge (2 je Klasse; Konfidenzklasse −10, weil 2 Probelaufobjekte
`medium → medium` behielten). `geo-belegt-geschuetzt` 8 → **10** = die zwei in Stufe 1
gestärkten Belege. **Keine neue Fehlerklasse, keine unerklärte Abweichung.**

### 14.3 · Phase 2 — wiederherstellbare Sicherung (09:02 UTC)

Eigene Sicherung unmittelbar vor dem Lauf (JSONL, `backups/sprint21-hauptlauf-20260728/`,
gitignored — Backups werden nie committet): je Objekt die Klassifikationsspalten
(`affected_geographies`, `mentioned_geographies`, `classification_confidence` mit allen
Herkunfts-/Zeitangaben und Nachklassifikationsmarkierungen, Ebene, `related_levels`,
`event_type`, `tags`, `policy_field`, Entitäten, `understanding_status`,
`confidence_score`, `created_at`, `updated_at`), der geplante Patch, Mandant als
expliziter Nullwert (die Tabelle ist mandantenneutral, §10) und eine SHA-256-Prüfsumme
je Objekt. **Keine Prosafelder, keine Dokumenttexte.** Kopfzeile mit Zeitpunkt, Commit
`88582c1…`, Deployment `dpl_AcQywjJ4LRzbWFE28zPMiHvbJ3P1` und Gesamtprüfsumme.

| Prüfung | Ergebnis |
|---|---|
| Objekte gesichert | **728**, IDs eindeutig, **identisch** mit der Vorschau-Schreibmenge (0 fehlend, 0 zusätzlich) |
| Prüfsummen je Zeile | **728 von 728 gültig**, 0 Fehler |
| Gesamtprüfsumme reproduzierbar | ✔ `5b2ba8d105e0e1116804613d0ee6c3695f5d31d1baacc14258f8067a8847a5b5` |
| Rückweg | Restore = PATCH derselben drei Spalten je ID aus `zustand` — eindeutig in den vorhandenen Rückweg überführbar; **nicht ausgeführt** (Rückweg bleibt gegen Production ungetestet, OP-01) |

Zusätzlich Fingerabdruck über die **521 nicht ausgewählten** Objekte gebildet:
`64044fbf4595393596ea3cd31df7dd23` (MD5 über SHA-256 je vollständiger Zeile, sortiert).

### 14.4 · Phase 3 — letzte Kollisionsprüfung (09:02:57 UTC)

Alle 728 Objekte erneut gelesen und per Prüfsumme gegen die Sicherung verglichen:
**0 Kollisionen**. 0 aktive Sperren (Tabelle + Store), kein neues Rohdokument,
`max(updated_at)` unverändert. Modulgraph des Schreibpfads (18 Module) enthält
**kein** `ai.js`, `llm-budget.js`, `llm-usage.js`. Erst danach wurde geschrieben.

### 14.5 · Phase 4 — der Schreiblauf

```
--ids=<728 gesicherte Kennungen> --max=900 --batch=25 --fehlerquote=0
--klassen=<die 6 sicheren Klassen> --ausfuehren
+ HELMUT_NACHKLASSIFIKATION_BESTAETIGT=ja + Production-Schreibgate (4 von 4)
```

**2026-07-28, 09:03:49–09:07:09 UTC (3 min 20 s), Exit 0.**

| Größe | Wert |
|---|---:|
| geplant | 728 |
| verarbeitet | 728 |
| **geschrieben** | **728** |
| Batches | **30** |
| Fehler | **0** |
| Kollisionen | **0** |
| abgebrochen | **nein** |
| KI-Aufrufe | **0** |

### 14.6 · Phase 5 — vollständiger Readback (09:08 UTC)

Alle 728 Objekte erneut gelesen, je Objekt Sicherung / geplanter Patch / Ist verglichen:

| Beweisfrage | Ergebnis |
|---|---|
| Ist = Plan (alle Patchfelder, Konfidenz ohne den laufzeitgebundenen Zeitstempel) | **728 von 728**, 0 Abweichungen |
| `nachklassifikation_am` im Lauffenster 09:03–09:08 | **728 von 728** |
| Belegte Geografie verloren | **0** |
| Ungeplante Geografie ergänzt | **0** |
| Geografie-Einträge entfernt | **562** (exakt wie Vorschau) |
| Ebene/Fachgebiete/Entitäten/übrige Klassifikationsfelder verändert | **0** — alle geschützten Felder byte-gleich zur Sicherung |
| Klassenverteilung Ist (aus `nachklassifikation_klassen`) | 469 · 28 · 35 · 30 · 728 — **identisch zur Vorschau** |
| `updated_at` fortgeschrieben | **0 von 728** — Befund N-1 bestätigt; Erfolgsnachweis über `nachklassifikation_am`, Prüfsummen und Feldvergleich, nicht über `updated_at` |

### 14.7 · Phase 6 — tabellenweiter Unversehrtheitsnachweis

| Beweisfrage | Ergebnis |
|---|---|
| Fingerabdruck der 521 nicht ausgewählten Objekte | vorher wie nachher **`64044fbf…`** — identisch |
| Neue Objekte während des Laufs | **0** (Bestand 1 249 vorher wie nachher) |
| Objekte mit `nachklassifikation_am` | **740 = 12 (Probelauf) + 728 (Hauptlauf)** — exakt |
| Zusätzliche unerwartete Markierungen | **0** |
| KI-Kosten | **0,00 USD** — `llm_usage` heute **0** Zeilen (vor wie nach dem Lauf) |

### 14.8 · Phase 7 — Idempotenz (09:09 UTC)

Vollständige frische Production-Vorschau: **767 geplant, 767 unverändert,
0 Schreibvorgänge, 0 Batches, 0 KI-Aufrufe, 0 manuelle Prüffälle.** Verbleibend nur
Meldungen: `fachgebiet-fehlt-ki` 594, `ebene-unbestimmt-ki` 78, `geo-belegt-geschuetzt` 10.
Kein neuer Befund, kein zweiter Schreibmoduslauf.

### 14.9 · Phase 8 — Auswirkungen (rein lesend)

| Prüfung | Ergebnis |
|---|---|
| Matching | `matchProfileToKnowledgeObjects` gegen **alle 8** echten Production-Profile fehlerfrei. Strukturell: `matching.js` liest **keines** der drei geänderten Felder |
| Briefings | **71** vorher wie nachher, letztes 08:16:31 UTC (**vor** dem Lauf), je Profil abrufbar (8 von 8, HTTP 200) — **0 neue** erzeugt |
| Fehlgeschlagene Läufe (3 h) | **0** (1 regulärer Lauf, erfolgreich) |
| Telemetrie | alle 293 Zeilen aus 08:02–08:16, **vor** dem Lauf; keine neuen Fehler |
| Sperren / hängende Prozesse | **0** |
| Erreichbarkeit | Stichprobe 3 von 3 über `getKnowledgeObjectById` (zusätzlich: alle 728 im Readback vollständig gelesen) |
| Mandantentrennung | ✔ nur die mandantenneutrale Tabelle `knowledge_objects` beschrieben; `decisions`/Profile unberührt |
| Regional zugeordnete Vorgänge | **573 → 11** (562 erfundene Einträge entfernt; verbleibend die belegten/geschützten) — geplante Wirkung des Sprints |

Kein Crawl, kein Understanding-Lauf, kein Briefing für diese Prüfung gestartet.

### 14.10 · Was der Hauptlauf beweist

Der reale Production-Schreibpfad entspricht der Vorschau exakt — jetzt auch **unter
Menge** (30 Batches, 728 Objekte, 3 min 20 s), ohne Fehler, ohne Kollision, ohne
Streuverlust, ohne KI-Kosten, idempotent, ohne Betriebsstörung. **OP-24 ist damit
inhaltlich erledigt.** Weiterhin offen (bekanntes Altrisiko, **kein** neues Risiko dieses
Laufs): der Rückweg ist nie gegen Production gelaufen (OP-01).

**Kein Codefehler gefunden, keine Codeänderung nötig, keine Migration, kein Flag,
kein Cron, kein Lock, keine Quelle, kein Mandantenprofil verändert.**
