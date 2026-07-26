# Befund — warum der Anschlag auf den Berliner CSD 2026 in keiner Lage erschien

**Stand:** 2026-07-26 · **Sprintzustand: erfolgreich diagnostiziert** (Verluststelle belegt,
Reparatur bewusst nicht ausgeführt) · **Production nur lesend untersucht, nichts mutiert**

> Kanonische Stelle für diesen Befund. `CURRENT_STATE.md` §3 verweist hierher und wird
> nicht zweitverwertet. Die Reparatur ist **nicht** Teil dieses Sprints.

---

## 1 · Einfache Zusammenfassung

Am Abend des 2026-07-25 fuhr am Rand des Berliner CSD ein Fahrzeug in die Menge:
**eine Tote, 16 Verletzte**, am 26.07. vom Bundesinnenminister als islamistischer
Terroranschlag eingeordnet, mit öffentlichen Reaktionen von Bundeskanzler,
Bundespräsident, Regierendem Bürgermeister und allen Fraktionen.

Helmut hat das Ereignis **vollständig eingesammelt** — 21 Rohdokumente, davon 18 zum
Anschlag, von Tagesschau, Deutschlandfunk, Süddeutscher Zeitung, Linksfraktion und dem
CDU/CSU-Weg. Die Quellen haben funktioniert.

Verloren ging das Ereignis **eine Stufe später, bei der Vorgangsbildung.** Helmut
gruppiert Dokumente zu Vorgängen über einzelne lange Wörter aus dem Titel. Die Vokabeln
dieses Ereignisses — *CSD*, *Berlin*, *Angriff*, *Merz*, *Wegner*, *Polizei* — sind alle
kürzer als die Ankerschwelle von acht Zeichen. Das Ereignis zerfiel deshalb in mehrere
Bruchstücke, die über zufällige Nebenwörter (*menschen*, *verletzte*, *dobrindt*) an
fachfremde Altvorgänge angedockt wurden. Weil zu diesen Wörtern bereits ältere Vorgänge
existierten, wurden die Bruchstücke als „schon verstanden" abgetan — **ohne KI-Aufruf,
ohne Verknüpfung, ohne Protokolleintrag**.

Ergebnis: **null Knowledge Objects zum Anschlag.** Die einzige Spur im gesamten Wissensbestand
ist ein Nebensatz in einem Vorgang über ein Verfassungsgerichtsurteil zu Abschiebungen.
Die Lage vom 26.07. wurde für alle sechs aktiven Mandate erfolgreich erzeugt — sie
konnte das Ereignis nicht enthalten, weil es als Vorgang nicht existierte.

**Das ist keine Einzelstörung, sondern eine systemische Lücke:** dieselbe Mechanik
verwirft nach Messung über sieben Tage **47 % aller Rohdokumente** lautlos.

## 2 · Untersuchungsrahmen

| | |
|---|---|
| Production-Zeitraum | 2026-07-20 bis 2026-07-26 20:30 UTC (Ereignisfenster 25.07. 21:30 – 26.07. 20:05 UTC) |
| Untersuchte Mandate | alle 8 Profile, davon 6 aktiv — Auswertung mandatsübergreifend |
| Zugriff | ausschließlich `select` gegen Supabase + Vercel-freie Codeanalyse. **Keine** Mutation, kein Crawl, kein KI-Lauf ausgelöst |
| Suchbegriffe | `CSD`, `Christopher Street`, `Anschlag`, `Todesfahrt`, `Fahrzeug`, `Angriff` in `raw_documents.title/summary`, `knowledge_objects` (5 Textfelder), `briefings.payload`, `political_items` |

## 3 · Beweiskette

### 3.1 Quellen und Artikel — **vorhanden**

21 Rohdokumente mit `CSD`/`Christopher Street` seit dem 25.07., davon **17 nach
Ereignisbeginn** (25.07. 21:38 UTC). Herausgeber: Tagesschau (8), Deutschlandfunk (8),
Süddeutsche (1), Linksfraktion (1), CDU/CSU-Weg → RTL (1). Inhaltlich abgedeckt sind
Tathergang, Opferzahlen, Täteridentifizierung, Dobrindts Terror-Einordnung, Merz,
Steinmeier, Wegner und die Reaktionen der Fraktionen.

### 3.2 Crawl-Nachweis — **erfolgreich, keine Störung**

Gemessen über 24 h in `source_crawl_telemetry`:

| Abrufweg | Läufe | `ok` | Fehler | Breaker | Dokumente 48 h | Weg-Status |
|---|---|---|---|---|---|---|
| `deutschlandfunk-politik` | 18 | **18** | 0 | 0 | 75 | `healthy` |
| `tagesschau-politik` | 18 | **18** | 0 | 0 | 43 | `healthy` |
| `fraction-cdu-csu` | 18 | 5 | 0 | 0 | 22 | `needs_review` |
| `news-sueddeutsche` | 14 | 4 | 0 | 0 | 16 | `needs_review` |
| `linksfraktion` | 2 | 2 | 0 | 0 | 14 | `needs_review` |
| `news-faz` / `news-zeit` / `news-spiegel` | 14 | 4 | 0 | 0 | 9 / 5 / 3 | `needs_review` |
| `news-welt` / `news-taz` / `news-rnd` / `news-tagesspiegel` | 14 | 4 | 0 | 0 | **0** | `needs_review` |
| `rp-rbb24-politik` (Berlin) | 0 | 0 | — | — | **0** | `needs_review` + `manual` |

**Keine** Fehler, **keine** Rate Limits, **keine** Parserprobleme, **keine** veralteten
Abrufe im Ereignisfenster. Die Unterscheidung nach Aufgabenstellung:

- **im Katalog vorhanden:** alle oben genannten Leitmedien, zusätzlich RBB24 und Tagesspiegel
- **einem Paket zugeordnet und aktiv geplant:** die Bundeswege; die Berliner Wege
  (RBB24, Tagesspiegel-Berlin) sind `needs_review` + `manual` gesperrt (Punkt 14)
- **erfolgreich abgerufen:** Tagesschau und Deutschlandfunk lückenlos, SZ/FAZ/ZEIT/Spiegel
  regelmäßig, WELT/taz/RND/Tagesspiegel liefen fehlerfrei, lieferten aber **0** Dokumente
- **Artikel zum Ereignis geliefert:** Tagesschau, Deutschlandfunk, SZ, Linksfraktion, CDU/CSU-Weg

Die gesperrten Berliner Wege sind **nicht ursächlich**: das Ereignis war über die aktiven
nationalen Wege vollständig abgedeckt.

### 3.3 Rohdokument-Nachweis — **vorhanden, unversehrt**

17 Dokumente nach Ereignisbeginn, korrekt dedupliziert (jede Meldung genau einmal),
`document_findings` mit echtem `found_at`, Originalverweis aufgelöst. **Keine** fälschliche
Verwerfung. Nebenbefund ohne Ursachenwirkung: 34 % aller Rohdokumente tragen `url`,
`content_hash`, `retrieved_at` = `null` (zweiter Schreibpfad), das betrifft alte wie neue
Dokumente gleichermaßen und beeinflusst die Vorgangsbildung nicht.

### 3.4 Knowledge-Object-Nachweis — **Verlust**

**0 Knowledge Objects zum Anschlag.** Von 17 Rohdokumenten ist **genau eines** mit einem KO
verknüpft (`ko_document_links`): der Tagesschau-Liveblog — und zwar mit `ko-vg-dobrindt`,
einem Vorgang, dessen Überschrift und Inhalt ein **Verfassungsgerichtsurteil zu
Abschiebungen nach Afghanistan** behandeln. Der tödliche Anschlag erscheint dort als
Nebensatz, `risk_level: medium`.

Das einzige weitere CSD-KO stammt vom **Vortag** (`ko-vg-c454d110…`, „Queere Räume in Berlin
unter Druck (CSD 2026)", 25.07. 07:34 UTC, `risk_level: high`) und beschreibt die Lage **vor**
der Tat.

### 3.5 Vorgangs-/Cluster-Nachweis — **hier geht das Ereignis verloren**

Die echte Clusterfunktion, gegen den echten Production-Stapel des Laufs vom
2026-07-26 04:00 UTC ausgeführt (44 Rohdokumente → 31 Cluster), zerlegt die vier
Anschlagsmeldungen in **vier getrennte Vorgänge** auf den Plätzen 18, 19, 21 und 27:

| # | abgeleitete `vorgang_id` | Inhalt | Schicksal |
|---|---|---|---|
| 18 | `vg-verletzte` | 2 Anschlagsmeldungen (Anker: „verletzte") | kein KO |
| 19 | `vg-bürgermeister` | Wegner-Reaktion | kein KO |
| 21 | `vg-menschen` | **„Berliner Polizei: CSD abgebrochen" + „340.000 Menschen in China wegen Taifun Noul in Sicherheit gebracht"** | `skipped-exists` (KO seit 25.07., Thema: UNO-Wahl und Waldbrände) |
| 27 | `vg-gefährdung` | Liveblog Dobrindt | kein KO |

Auf den Plätzen 1 bis 17 standen unter anderem *„Christkindlmarkt öffnet an zwei Tagen
länger"*, *„Jubilarfeier der IG Metall Landshut"* und *„CDU Kevelaer fordert Einführung der
Ehrenamtskarte NRW"*. Es gibt **keine** Relevanzsortierung: `HELMUT_UNDERSTANDING_PRIORITY`
ist Default AUS, verarbeitet wird in Ankunftsreihenfolge.

### 3.6 Ranking- und Filterentscheidung — **es gab keine**

Das Ereignis wurde **nicht** wegen Schwellenwerten, Zeitfenstern, Profilfiltern oder
Mandatslogik ausgeschlossen. Es hat nie eine Bewertung erreicht: ohne Knowledge Object
entstehen keine Themen-, Orts-, Personen-, Relevanz-, Risiko- oder Dringlichkeitswerte.
Die persistierte Lauftelemetrie (`helmut_store.main-auth.processRuns`) belegt die
Stille des Verlusts:

| Lauf (UTC) | Cluster verarbeitet | zurückgestellt | KI-Aufrufe „understanding" | erzeugte KOs |
|---|---|---|---|---|
| 26.07. 04:01:50 | **89** | 0 | **6** (alle erfolgreich, 0 Fehler) | 6 |
| 26.07. 16:03:36 | 24 | **66** | — | 9 |
| 26.07. 20:02:16 | 91 | 0 | — | 10 |

Im 04:00-Lauf wurden **83 von 89 Clustern ohne einen einzigen KI-Aufruf erledigt** — das ist
der Rückgabewert `skipped-exists`. Kein Fehler, kein Budgetstopp (LLM-Verbrauch 34/100),
keine Zurückstellung. Der 16:00-Lauf — derjenige, der sieben weitere Anschlagsmeldungen
aufnahm — stellte zusätzlich **66 von 90 Clustern** am Zeitbudget zurück.

**Zurückgestellte Cluster kehren nie wieder:** der dedizierte Nachhol-Cron
(`understanding-cron`, 05:30/21:30 UTC) arbeitet ausschließlich auf `status='pending'`
vorgemerkten Vorgängen und hat seit dem 25.07. in **drei** Läufen **0** Cluster verarbeitet;
die 43 `pending`-Einträge stammen unverändert vom 02./03.07. Jeder Lauf sieht nur die
Dokumente seines eigenen Durchgangs.

### 3.7 Lage-Nachweis — **erfolgreich gelaufen, ohne Datengrundlage**

Die Lage-Generierung hat am 26.07. um **05:45–05:46 UTC für alle 6 aktiven Mandate**
erfolgreich stattgefunden (`briefings`, `slot='lage'`, Modell `gpt-5-mini`, jeweils
1 478–2 393 Zeichen Payload). Sie greift ausschließlich auf Knowledge Objects zu; jeder
Absatz trägt seine `vorgang_ids`. Genutzt wurden unter anderem `vg-kassenbeiträge`,
`vg-eigenanteil`, `vg-verkehrsminister`, `vg-kabinett`. **Kein** Briefing seit dem 25.07.
enthält die Zeichenfolge „CSD" (0 von 12).

Zeitlich war das Ereignis verfügbar: die ersten vier Anschlagsmeldungen lagen seit
**04:01 UTC** in `raw_documents`, die Lage entstand **1 Stunde 45 Minuten später**.

### 3.8 Briefing-Nachweis — **keine bewusste Verwerfung**

Das Briefing hat den Vorgang **nicht** verworfen — es gab keinen. `political_items` enthält
0 CSD-Einträge, `decisions` und `matching_results` können ohne KO nichts bewerten.

### 3.9 Sichtbarkeit im Client — **nicht die Ursache**

Kein Vorgang vorhanden, also kein Anzeigeproblem. Die Frage „vorhanden, aber unsichtbar"
ist mit Nein beantwortet.

### 3.10 Reichweite — **alle Mandate**

`raw_documents` und `knowledge_objects` tragen kein `tenant_id`; der Verlust liegt
**oberhalb** jeder Mandantenauswahl. Betroffen sind damit **alle** Mandate gleichermaßen,
nicht bestimmte Profile.

## 4 · Exakte Verluststelle

`lib/helmut/understanding.js` — die Vorgangsbildung, in drei zusammenwirkenden Zeilen:

| Kennung | Stelle | Wirkung |
|---|---|---|
| **V1** | `anchorTokens()`, Zeile 58–62: `.filter((t) => t.length >= 8)` | Wörter unter 8 Zeichen können keinen Vorgang bilden. Die Entwurfsannahme sind deutsche Komposita („Tariftreuegesetz"). Ein Ereignis, das mit kurzen Wörtern beschrieben wird — *CSD*, *Berlin*, *Angriff*, *Merz*, *Wegner*, *Polizei* — **kann strukturell keinen eigenen Vorgang bilden** |
| **V2** | `anchorsMatch()`, Zeile 64–66: `a.includes(b) \|\| b.includes(a)` | derselbe Teilstring-Abgleich, der als **F-3** bereits den Recovery-Pfad zerstört hat (`CURRENT_STATE.md` §5) — nur hier im **normalen, täglich laufenden** Pfad. Er verschmilzt fachfremde Dokumente über Allerweltswörter |
| **V3** | `deriveVorgangId()`, Zeile 96–116 + `understandOneCluster()`, Zeile 599–601 | die `vorgang_id` ist **ein einziges Wort**. Existiert dazu ein älteres, thematisch fremdes KO, liefert `understandOneCluster` sofort `skipped-exists` zurück: **kein KI-Aufruf, kein `ko_document_links`-Eintrag, kein Fehler, kein Protokolleintrag.** Die Dokumente sind endgültig weg |

Die vierte, verstärkende Stelle ist der Zeitbudget-Abbruch in `runUnderstandingShadow`
(Zeile 752–753) zusammen mit `scheduler.js` Zeile 349–350: zurückgestellte Cluster werden
von keinem Lauf je wieder aufgegriffen.

### Ausmaß der systemischen Lücke

Die echte Clusterfunktion, angewandt auf **1 000 Production-Rohdokumente** der letzten
7 Tage in 15 rekonstruierten Crawl-Stapeln (`scripts/`-freie Einmalmessung, nur lesend):

- 535 Cluster gebildet
- **116 Cluster (21,7 %)** erhalten eine `vorgang_id`, zu der bereits ein **älteres,
  thematisch fremdes** KO existiert → `skipped-exists`
- diese Cluster enthalten **470 Rohdokumente = 47,0 % aller Rohdokumente des Zeitraums**

Belegte Beispiele aus dieser Messung:

- `vg-deutschland` (KO seit 16.07.) verschluckt die **gesamte Spahn-Nachfolge-Berichterstattung**
  (6 Dokumente) zusammen mit einem Pflegekraft-Stellenangebot
- `vg-bundestag` (KO seit 02.07.) verschluckt jede Meldung mit „Bundestag" im Titel
- `vg-minister` (KO seit 12.07.) verschluckt Söder, den künftigen britischen Premier und
  einen Waldbrand in Mecklenburg-Vorpommern in einem Zug
- `vg-angriffe` (KO seit 16.07.) verschluckt neue US-Angriffe auf den Iran

Das erklärt die in `CURRENT_STATE.md` §9 gemessene Verknüpfungsquote von nur **13 %**
Rohdokument → Knowledge Object.

## 5 · Hauptursache und Mitursachen

**Hauptursache (bewiesen):** Die Vorgangsbildung identifiziert einen politischen Vorgang
über **ein einzelnes Wort ab acht Zeichen**. Das ist weder inhaltlich noch zeitlich
trennscharf. Kollidiert dieses Wort mit einem älteren Vorgang, verwirft die
Idempotenzregel den neuen Cluster **lautlos und endgültig**.

**Mitursachen (jeweils belegt, jede allein nicht hinreichend):**

1. **Keine Relevanzsortierung.** `HELMUT_UNDERSTANDING_PRIORITY` ist Default AUS;
   verarbeitet wird in Ankunftsreihenfolge. Ein Weihnachtsmarkt-Artikel wird vor einem
   tödlichen Anschlag verstanden.
2. **Zeitbudget ohne Nachholpfad.** 66 von 90 Clustern im 16:00-Lauf zurückgestellt;
   `understanding-cron` holt seit dem 25.07. nichts nach (3 Läufe, 0 verarbeitet).
3. **Verlust ist unsichtbar.** `skipped-exists` erzeugt weder `systemErrors` noch
   Telemetrie. Es gibt heute keine Kennzahl, an der ein Betreiber merken könnte, dass
   47 % der Dokumente nie bewertet wurden — ein Verstoß gegen das Prinzip „kein falsches Grün".
4. **Kein Ereignis-Sonderweg.** Es existiert keine Regel, die Tote/Verletzte/Terror/Anschlag
   unabhängig vom Clustering hochzieht.
5. **Berliner Leitmedien liefern nichts** (RBB24, Tagesspiegel: 0 Dokumente, `manual`
   gesperrt). Für dieses Ereignis **nicht** ursächlich — die nationalen Wege deckten es ab —
   aber ein struktureller Nachteil bei rein landespolitischen Lagen. Gehört zu Punkt 14.

## 6 · Produktbewertung

**Hätte Helmut Alarm schlagen müssen? Ja — unbedingt und am selben Morgen.** Ein tödlicher,
als islamistischer Terroranschlag eingeordneter Angriff auf eine Großdemonstration in der
Bundeshauptstadt, mit Stellungnahmen von Bundeskanzler, Bundespräsident und Regierendem
Bürgermeister, ist der Prototyp dessen, wofür ein politischer Stabschef existiert:
Kondolenz, Sprachregelung, Sicherheitsdebatte, Ausschussbefassung, Wahlkampfwirkung vor
der Berliner Abgeordnetenhauswahl.

**Für welche Mandate?** Für **alle sechs aktiven**, mit unterschiedlicher Dringlichkeit:
Berlin-Bezug und Innen-/Rechtsausschuss zuerst, aber kein Bundestagsmandat hätte diesen
Tag ohne den Vorgang beginnen dürfen.

**In Lage, Briefing oder beiden?** In **beiden** — als Aufmacher der Morgenlage vom 26.07.
und als Vorgang mit Handlungsempfehlung.

**Welche Unsicherheit wäre kenntlich zu machen gewesen?** Am Morgen des 26.07. waren Motiv
und Tathergang noch offen (die Terror-Einordnung folgte erst mittags). Korrekt wäre
gewesen: gesicherte Fakten (eine Tote, 16 Verletzte, CSD abgebrochen) als belegt, Motiv
ausdrücklich als **ungeklärt** — nicht das Weglassen des ganzen Ereignisses.

**Welche Versagensart?** Ein **Pipeline-Versagen in der Vorgangsbildung**, verstärkt durch
**fehlendes Ranking** und **fehlende Aktualitätslogik**. **Kein** Quellenversagen, **kein**
UI-Versagen.

**Einzelfehler oder systemische Lücke?** **Systemisch.** 47 % aller Rohdokumente sind
dauerhaft betroffen. Der CSD-Anschlag ist der Fall, an dem es auffiel — nicht der einzige.

## 7 · Reparaturplan (**nicht** in diesem Sprint ausgeführt)

Die Reparatur berührt den Kern der Vorgangsbildung für **alle** Mandate und verändert die
Kostenstruktur (mehr KI-Aufrufe). Sie ist **nicht** „klein und eindeutig sicher" im Sinne
von `CLAUDE.md` §5 und wird deshalb nicht nebenbei mitgemacht.

### P0-Sofortmaßnahme (nächster Sprint, ohne Production-Mutation)

1. **`vorgang_id` kollisionsfest machen.** Statt eines Wortes eine Kennung aus
   **Themenwurzel + Kalendertag + Kurzprüfsumme der Dokumentmenge**. Wirkung: ein neues
   Ereignis kann keinen Altvorgang mehr „treffen"; `skipped-exists` greift nur noch bei
   echter Wiedervorlage. Rein deterministisch, keine KI, kein Netz.
2. **`skipped-exists` sichtbar machen.** Zähler je Lauf in `recordProcessRun` und im
   Health-Report. Ohne diese Kennzahl bleibt jede weitere Reparatur unbelegbar.
3. **`HELMUT_UNDERSTANDING_PRIORITY` einschalten** (Code existiert, getestet, Default AUS —
   Freigabeentscheidung des Betreibers). Damit werden bei knappem Budget die
   relevantesten Vorgänge zuerst verstanden statt der zuerst eingetroffenen.

### Dauerhafter Fix

4. **Ankerbildung ereignistauglich machen:** Schwelle senken (5–6 Zeichen) **und** um
   Wortpaare/Eigennamen ergänzen, damit „CSD Berlin" oder „Angriff CSD" ein Anker sein kann.
5. **Teilstring-Ankerabgleich ersetzen** (`a.includes(b)`) — dieselbe Konstruktion, die
   als F-3 bereits einen Production-Rückrollfall verursacht hat. Ersatz: Wurzelvergleich
   mit Mindestüberdeckung, kein reines `includes`.
6. **Zeitfenster in die Vorgangsidentität aufnehmen.** Ein Vorgang vom 26.07. darf keinen
   Vorgang vom 02.07. treffen.
7. **Nachholpfad reparieren:** zurückgestellte Cluster verbindlich als `pending` vormerken,
   damit `understanding-cron` sie tatsächlich aufgreift (heute: 3 Läufe, 0 verarbeitet).

### Regressionstests

- `scripts/vorgangsbildung-verlust-test.js` — **in diesem Sprint angelegt und grün.**
  Er beschreibt absichtlich den **fehlerhaften Ist-Zustand** an echten Production-Titeln.
  Die Reparatur muss seine Erwartungen umdrehen; er wird dann durch den Soll-Test ersetzt.
- Soll-Test (nach der Reparatur): die fünf Anschlagsmeldungen bilden **einen** Vorgang;
  Anschlag und Taifun landen **nicht** im selben Vorgang; ein Ereignis vom 26.07. kollidiert
  **nicht** mit einem Vorgang vom 02.07.; die Vorgangsmenge ist **reihenfolgeunabhängig**.
- Kollisionsquote als Kennzahl: gegen einen eingefrorenen Stapel muss die
  `skipped-exists`-Quote unter eine belegte Schwelle fallen (heute 21,7 % der Cluster /
  47,0 % der Dokumente).
- Kostenschranke: die Reparatur erhöht die KI-Aufrufe. Vor der Scharfschaltung eine
  Trockenmessung gegen das Tagesbudget (heute Mittel 64/100, Spitze 100/100 am 20.07.) —
  sonst ersetzt ein Budget-Stopp den heutigen stillen Verlust.

### Production-Nachweis

Nach der Reparatur ein Lauf gegen echte Daten mit: Kollisionsquote vorher/nachher,
Rohdokument→KO-Verknüpfungsquote vorher/nachher (heute 13 %), LLM-Verbrauch,
und eine namentliche Gegenprobe an einem Ereignis mit kurzen Leitvokabeln.

### Abgrenzung zu Punkt 14 (Berlin-Aktivierung)

**Konfliktfrei.** Dieser Befund berührt **keine** der für Punkt 14 gesperrten Stellen:
keine Berlin-Aktivierung, keine Landesmodul-Flags, keine Profile oder Paketzuordnungen,
keine Crons, keine aktiven Quellen, keine Locks, keine Kostenlogik, keine Production-Daten.
Betroffen ist ausschließlich `lib/helmut/understanding.js` (Vorgangsbildung) — eine Datei,
die Punkt 14 nicht anfasst. Die Berührung ist rein inhaltlich: die gesperrten Berliner
Wege sind **Mitursache Nr. 5**, für dieses Ereignis aber nachweislich **nicht** ursächlich.
Die Reparaturen sind unabhängig voneinander durchführbar und in beliebiger Reihenfolge.

### Risiko möglicher Fehlalarme

Eine niedrigere Ankerschwelle und eine tagesgebundene Kennung erzeugen **mehr** Vorgänge
und damit mehr KI-Aufrufe. Zwei Risiken sind vorab zu begrenzen:

1. **Zersplitterung statt Verschmelzung** — dieselbe Meldung als drei Vorgänge. Gegenmittel:
   Wurzelvergleich mit Mindestüberdeckung statt bloßer Schwellensenkung.
2. **Budget-Erschöpfung** — mehr Vorgänge bei gleichem Tagesbudget führen dazu, dass das
   Budget-Gate greift und der stille Verlust nur die Form wechselt. Deshalb ist
   Sofortmaßnahme 3 (Relevanzsortierung) **vor** der Schwellensenkung einzuschalten.

## 8 · Was dieser Sprint bewusst nicht getan hat

- **Keine** Reparatur der Vorgangsbildung — die Ursache ist bewiesen, die Reparatur ist
  eine Produkt- und Kostenentscheidung.
- **Keine** Production-Mutation, kein Crawl, kein KI-Lauf, kein Flag verändert.
- **Kein** Nachverstehen des verlorenen Ereignisses (das wäre ein KI-Lauf gegen Production).
- **Keine** Berührung von Punkt 14.
