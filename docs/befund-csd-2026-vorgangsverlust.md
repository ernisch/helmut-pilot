# Befund — warum der Anschlag auf den Berliner CSD 2026 in keiner Lage erschien

**Stand:** 2026-07-26 (Diagnose) · **2026-07-26, Reparatursprint: §9–§13 ergänzt**
**Sprintzustand: Reparatur umgesetzt und lokal belegt · Production-Nachweis blockiert
(Merge/Deployment nicht freigegeben)** · **Production ausschließlich lesend berührt**

> Kanonische Stelle für diesen Befund **und für seine Reparatur**. `CURRENT_STATE.md` §3
> verweist hierher und wird nicht zweitverwertet.
>
> **Lesehinweis:** §1–§8 beschreiben den **Ist-Zustand vor der Reparatur** und bleiben
> unverändert als Beweiskette erhalten. Was tatsächlich gebaut, gemessen und offen
> geblieben ist, steht in **§9 (Reparatur)**, **§10 (verifizierter Verlustumfang)**,
> **§11 (Kosten)**, **§12 (Production-Nachweisplan)** und **§13 (Freigabeanfrage)**.

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

## 8 · Was der Diagnosesprint bewusst nicht getan hat

- **Keine** Reparatur der Vorgangsbildung — die Ursache ist bewiesen, die Reparatur ist
  eine Produkt- und Kostenentscheidung.
- **Keine** Production-Mutation, kein Crawl, kein KI-Lauf, kein Flag verändert.
- **Kein** Nachverstehen des verlorenen Ereignisses (das wäre ein KI-Lauf gegen Production).
- **Keine** Berührung von Punkt 14.

---

# Reparatursprint (2026-07-26)

## 9 · Was gebaut wurde

**Leitentscheidung:** `vorgang_id` hat zwei unvereinbare Aufgaben zugleich getragen —
**fachliche Identität** („worum geht es?") und **technische Eindeutigkeit** („gab es das
schon?"). Genau diese Vermischung ist die Ursache. Die Reparatur trennt beides:

- Die **Kennung ist ein Vorschlag**, kein Urteil.
- Ob ein Cluster zu einem bestehenden Vorgang gehört, entscheidet ein **Belegvergleich**
  gegen echte Kandidaten — nicht ein Zeichenkettenvergleich.

Bewusst **nicht** gebaut: keine neue Tabelle, kein Event Sourcing, keine Queue, keine
neue Relevanzmaschine, **keine Migration**. Alles nutzt bestehende Tabellen und Läufe.

### 9.1 Die drei Verluststellen — was jeweils an ihre Stelle tritt

| | Vorher | Jetzt |
|---|---|---|
| **V1** Ankerschwelle ≥ 8 Zeichen | *CSD*, *Berlin*, *Angriff*, *Merz*, *Wegner*, *Polizei* konnten **strukturell** keinen Vorgang bilden | Schwelle **5**; zusätzlich **Abkürzungen** über Großschreibung erkannt (*CSD*, *AfD*, *EuGH*) und **Jahreszahlen** als eigener Ankertyp |
| **V2** Teilstring-Abgleich `a.includes(b)` | „menschen" traf „menschenmenge" → Anschlag + Taifun in einem Vorgang | **Beweisgewicht** statt Teilstring: Flexion = 1 (*berlin ~ berliner*), Kompositum-Wurzel und sehr langer exakter Anker = 2 (*Tariftreue* in *Tariftreuegesetz*). Zusammenführung ab **Gewicht 2 und mindestens einem nicht generischen Treffer**. Komposit-Enthalten erst ab 10 Zeichen — damit kann „menschen" nicht mehr hineingreifen |
| **V3** Kennung = ein Wort, Treffer = Verwerfen | `vg-menschen` traf einen Altvorgang → `skipped-exists`, kein KI-Aufruf, keine Spur | Kennung **`vg-<themenwurzel>-<ereignistag>-<prüfsumme>`**; ein Treffer löst eine **Prüfung** aus, nie ein Verwerfen |

Zusätzlich behoben, obwohl im Befund nur als Nebenbemerkung geführt: die Clusterbildung
war **reihenfolgeabhängig** („erster Treffer gewinnt"). Sie läuft jetzt über
Zusammenhangskomponenten und liefert bei gleicher Dokumentmenge immer dieselben Vorgänge.

### 9.2 Vorgangsauflösung statt Zeichenkettenvergleich

`resolveVorgang()` in `understanding.js`:

1. Kennungsvorschlag + bis zu **drei Kandidatenpräfixe** aus den Themenwurzeln.
2. Bestehende Vorgänge unter diesen Präfixen laden. **Altkennungen der Form `vg-<wurzel>`
   fallen exakt auf ein solches Präfix** — sie werden dadurch fortgeschrieben statt
   dupliziert. Deshalb ist **keine Migration nötig** und alte Daten bleiben lesbar.
3. Je Kandidat die bereits verknüpften Rohdokumente laden und prüfen: **dieselbe Sache
   oder nur dasselbe Wort?**
4. Passt keiner und ist die Kennung trotzdem belegt → **technischer Konflikt**: eigene
   Kennung bilden. Der Cluster wird **nie** verworfen.

### 9.3 `skipped-exists` ist ersatzlos entfallen

Es hat zwei völlig verschiedene Fälle in denselben Topf geworfen: „dasselbe Dokument
nochmal" und „zufällig dasselbe Wort". Jeder Ausgang ist jetzt klassifiziert:

| Ergebnis | Bedeutung | KI-Aufruf |
|---|---|---|
| `saved` | neuer Vorgang entstanden | ja |
| `updated` | bestehender Vorgang mit **belegten neuen Fakten** fortgeschrieben, `ko_version` +1 | ja |
| `merged` | Dokumente einem bestehenden Vorgang zugeordnet, keine neuen Fakten | nein |
| `duplicate` | echtes vollständiges Duplikat (alle Dokumente bereits verknüpft) | nein |
| `skipped-terminal` | bewusst und dauerhaft aussortiert (OP-06) | nein |
| `skipped-failed` | nach KI-Fehlschlag geparkt, gezielt nachholbar | nein |
| `skipped-budget` | Tagesbudget erschöpft → **erneut einplanen** | nein |
| `skipped-error` / `skipped-invalid` / `skipped-store` | Fehler, geparkt und gemeldet | teilweise |

**„Neue Fakten" ist belegt, nicht geraten:** mindestens ein Kernanker, den der Bestand
nicht kennt. Eine wiederveröffentlichte Agenturmeldung erfüllt das nicht und kostet
deshalb nichts.

### 9.4 Verknüpfungsinvariante — der Endzustand ohne neue Tabelle

> **Jeder Ausgang, der einen Vorgang gefunden oder gebildet hat, schreibt
> `ko_document_links` für seine Dokumente.**

Damit ist der Endzustand jedes Rohdokuments **aus Bestandsdaten ableitbar**
(`vorgangs-lebenszyklus.js`) — verknüpft = verarbeitet, unverknüpft = offen. Genau
deshalb braucht die Reparatur keine neue Tabelle und keine Migration.

Sechs unterscheidbare Zustände, **genau einer davon unzulässig**:

| Zustand | Bedeutung | gültig |
|---|---|---|
| `verstanden` | hängt an einem verstandenen Vorgang (`ko_version` und „später ergänzt" zeigen Erst- vs. Fortschreibung) | ja |
| `ausgeschlossen` | hängt an einem terminal aussortierten Vorgang | ja |
| `fehlgeschlagen` | hängt an einem nach KI-Fehlschlag geparkten Vorgang | ja |
| `wiedervorlage` | hängt an einem vorgemerkten Vorgang | ja |
| `offen` | noch nicht verarbeitet, innerhalb der Karenzzeit (24 h) | ja |
| **`ohne-endzustand`** | keine Spur, Karenzzeit überschritten | **nein** |

**Ehrliche Grenze, nicht kaschiert:** die feinere Unterscheidung zwischen `duplicate`,
`merged` und `updated` liegt in der **Lauftelemetrie**, nicht am einzelnen Dokument. Sie
wird dort nicht erfunden.

### 9.5 Nachholpfad repariert

Die Diagnose hielt fest: „zurückgestellte Cluster kehren nie wieder" (3 Läufe, 0
verarbeitet). Zwei Ursachen, beide behoben:

1. Zurückgestellte Cluster wurden **gar nicht vermerkt**. Jetzt bekommen sie eine
   Vormerkung **und** ihre Dokumentverknüpfungen.
2. Der Nachhollauf suchte den Cluster über eine **frische Neuclusterung der letzten 30
   Tage** — die sieht eine völlig andere Dokumentmenge als der vormerkende Lauf, die
   Kennungen trafen sich praktisch nie. Jetzt ist die **Verknüpfung** maßgeblich; die
   Kennungssuche bleibt nur noch Rückfallebene für Alt-Vormerkungen.

Dazu ein Werkzeug: `scripts/vorgangsbildung-nachholen.js` — **Vorschau ist der
Standard**, Ausführung verlangt zusätzlich `HELMUT_NACHHOLEN_BESTAETIGT=ja`, harte
Mengengrenze (`--max`, Standard 200, darüber **Abbruch statt Massenlauf**), idempotent,
mandantenneutral, dupliziert strukturell nichts (verstandene und ausgeschlossene
Dokumente sind keine Kandidaten).

### 9.6 Großereignis-Vorfahrt

Ein Cluster gilt als mögliches Großereignis, wenn **Sicherheits-/Opferbezug oder eine
offizielle Reaktion** zusammentreffen mit **mehreren unabhängigen Quellen oder zeitlicher
Verdichtung**. Solche Cluster werden **unabhängig vom Flag `HELMUT_UNDERSTANDING_PRIORITY`
vorgezogen**. Begründung: die vollständige Relevanzsortierung ist eine freigabepflichtige
Produktentscheidung — das Nicht-Verlieren eines tödlichen Anschlags ist keine. Ohne
erkanntes Großereignis bleibt die Reihenfolge unverändert.

### 9.7 Nebenbefund, der dabei auffiel

`listRawDocuments`/`listRecentRawDocuments` wurden von PostgREST **still auf 1 000 Zeilen
gekappt**. Aufrufe mit `limit=2000` — darunter der Recovery-Pfad und das
Understanding-Nachladen — sahen die Hälfte nicht und hielten das Ergebnis für
vollständig. Dieselbe Fehlerart wie B4 (stille Kappung sieht aus wie Vollständigkeit),
deshalb im selben Sprint behoben: beide lesen jetzt seitenweise.

## 10 · Verifizierter Verlustumfang

Read-only gegen Production, 7 Tage (2026-07-20 bis 2026-07-26), **1 970 Rohdokumente**,
35 rekonstruierte Crawl-Stapel, 722 bestehende Vorgänge.
Werkzeug: `scripts/vorgangsbildung-vergleich.js` (rechnet **beide** Verfahren gegen
dieselben Daten; die historische Fassung liegt zu Messzwecken im Skript).

### 10.1 Die 47 % sind bestätigt

| | Cluster | Kollisionen | betroffene Rohdokumente |
|---|---|---|---|
| **Altverfahren** | 1 062 | **254 = 23,9 %** | **932 = 47,3 %** |
| **Neues Verfahren** | 1 365 | **0** | **0** |

Die Diagnose nannte 21,7 % der Cluster / 47,0 % der Rohdokumente. Die
**Dokumentenquote ist praktisch exakt bestätigt** (47,3 % statt 47,0 %); die Clusterquote
liegt mit 23,9 % etwas höher als die geschätzten 21,7 % — die Abweichung stammt aus der
Stapelrekonstruktion (35 Stapel über 20-Minuten-Lücken statt 15 geschätzter Stapel), nicht
aus einer anderen Fehlermechanik.

Beim neuen Verfahren schreiben **252 Cluster mit 511 Rohdokumenten einen bestehenden
Vorgang fort**, statt ihn zu duplizieren. Diese Zahl ist eine **Untergrenze**: die Messung
konnte je Kandidat nur die Überschrift als Beleg heranziehen, im Betrieb stehen die
verknüpften Rohdokumente zur Verfügung.

### 10.2 Endzustand je Rohdokument — der eigentliche Schock

Dieselben 7 Tage, gemessen am Ist-Bestand (`scripts/vorgangsbildung-nachholen.js`):

| Kategorie | Anzahl | Anteil |
|---|---|---|
| erfolgreich in einen Vorgang überführt | 274 | 13,9 % |
| bewusst als Duplikat zusammengeführt | 0 | 0,0 % |
| fachlich nachvollziehbar ausgeschlossen | 0 | 0,0 % |
| nach KI-Fehlschlag geparkt | 0 | 0,0 % |
| zur erneuten Verarbeitung vorgemerkt | 0 | 0,0 % |
| noch ausstehend (Karenzzeit 24 h) | 192 | 9,7 % |
| **ohne nachvollziehbaren Endzustand** | **1 504** | **76,3 %** |

- Ältestes Dokument ohne Endzustand: **161 h alt** (2026-07-20 04:01 UTC).
- Verarbeitungsdauer Rohdokument → Vorgang: **Median 2 min**, Mittel 428 min, **Max 112 h**
  (274 Fälle gemessen). Der große Abstand zwischen Median und Mittel zeigt: entweder ein
  Dokument wird sofort verstanden — oder tagelang nicht.
- Quellen: 97 liefernde Abrufwege; Mandant: **keiner** — `raw_documents`,
  `knowledge_objects` und `ko_document_links` tragen kein `tenant_id`, der Verlust liegt
  oberhalb jeder Mandantenauswahl und trifft alle 6 aktiven Mandate gleich.

**Die 47 % waren also die Untergrenze, nicht die Gesamtzahl.** 47,3 % gehen auf die
Kennungskollision zurück; der Rest auf zurückgestellte Cluster ohne Vormerkung und auf
Cluster, die kein Lauf je erreicht hat. Beide Wege sind mit dieser Reparatur geschlossen.

## 11 · Kosten — ehrlich gerechnet

KI-Aufrufe entstehen nur für **neue** Vorgänge und für Aktualisierungen mit belegten
neuen Fakten. Fortgeschriebene und doppelte Cluster kosten nichts.

| | Obergrenze KI-Aufrufe / Tag |
|---|---|
| Altverfahren | **115** |
| Neues Verfahren | **159** (+38 %) |
| Tagesbudget | **100** (Reserve 30) |

**Der Engpass bestand schon vorher** — der Bedarf lag mit 115 bereits über dem Budget.
Die Reparatur erzeugt ihn nicht, sie macht ihn **sichtbar**: was nicht in den Tag passt,
endet als `skipped-budget` — protokolliert, gezählt und gezielt nachholbar, statt lautlos
zu verschwinden. Damit entscheidet die **Reihenfolge** über Qualität. Deshalb die
Großereignis-Vorfahrt (§9.6); die vollständige Relevanzsortierung (OP-14,
`HELMUT_UNDERSTANDING_PRIORITY`) bleibt freigabepflichtig und ist die naheliegende
nächste Entscheidung.

Real gemessen wurden zuletzt **64 Aufrufe/Tag im Mittel** (Spitze 100 am 20.07.) — das
tatsächliche Nadelöhr ist heute das **Zeitbudget je Lauf**, nicht das Tagesbudget.

## 12 · Production-Nachweisplan (vorbereitet, **nicht** ausgeführt)

Alle bisherigen Messungen sind **ausschließlich lesend** erfolgt. Der eigentliche
Nachweis verlangt einen Deploy und ist damit freigabepflichtig.

**Reihenfolge:**

| # | Schritt | Art | Abbruchkriterium |
|---|---|---|---|
| 1 | PR mergen → automatisches Deployment | Freigabe | CI nicht grün |
| 2 | `vorgangsbildung-nachholen.js --tage=2` (Messung) | read-only | — |
| 3 | Nächsten regulären Crawl-Cron abwarten (kein manueller Anstoß) | passiv | — |
| 4 | `vorgangsbildung-nachholen.js --tage=1` erneut | read-only | Anteil „ohne Endzustand" **nicht** gesunken |
| 5 | `vorgangsbildung-vergleich.js --tage=1` | read-only | Kollisionen > 0 |
| 6 | CSD-Fenster gezielt prüfen (SQL, siehe unten) | read-only | — |
| 7 | Erst danach, separat freizugeben: `--vorschau --ausfuehren` für den Altbestand | **Write + Kosten** | > 200 Kandidaten oder LLM-Verbrauch > 80/100 |

**Was der Nachweis zeigen muss** (jede Zeile prüfbar, keine Behauptung):

1. Die vier CSD-Rohdokumente bilden **einen** Vorgang mit Kennung `vg-csd-2026072…`.
2. Zu diesem Vorgang existiert ein Knowledge Object (`status='neu'`,
   `understanding_status='complete'`).
3. Alle beteiligten Rohdokumente tragen einen `ko_document_links`-Eintrag auf dieses KO.
4. Die Relevanzbewertung läuft (`decisions`/`matching_results` für die 6 aktiven Mandate).
5. Die Lage des Folgetags enthält den Vorgang (`briefings.payload` → `vorgang_ids`).
6. Das Briefing enthält ihn ebenfalls.
7. **Kein** Rohdokument des Fensters steht auf `ohne-endzustand`.
8. Es entsteht **kein** zweiter Vorgang zum selben Ereignis (Duplikatprüfung über das
   Themenwurzel-Präfix).
9. Bestehende Vorgänge und Mandate sind unverändert (Zeilenzahlen `profiles`,
   `mandate_profiles`, `knowledge_objects` vor/nach).
10. Die Telemetrie zeigt den vollständigen Weg (`processRuns.ergebnisse`,
    `.aufloesungen`, `.gruppen`, `.dokumenteOhneEndzustand`).
11. Die stille Verlustquote im kontrollierten Zeitraum ist **null** — jeder Ausgang trägt
    eine Klasse.

**Messbefehle** (alle read-only, in dieser Reihenfolge):

```
HELMUT_V3_STORE=1 node scripts/vorgangsbildung-nachholen.js --tage=2
HELMUT_V3_STORE=1 node scripts/vorgangsbildung-vergleich.js --tage=2
```

```sql
-- CSD-Fenster: entstand ein Vorgang, und hängen die Rohdokumente daran?
select k.vorgang_id, k.status, k.understanding_status, k.ko_version,
       count(l.raw_document_id) as verknuepfte_dokumente
from knowledge_objects k
left join ko_document_links l on l.knowledge_object_id = k.id
where k.vorgang_id like 'vg-csd%'
group by 1,2,3,4;
```

**Automatischer Abbruch:** Der reguläre Lauf ist durch das bestehende Zeitbudget
(90 s im Crawl, 240 s im Cron) und das fail-closed Tagesbudget begrenzt; ein Nachholauf
bricht bei mehr als `--max` Kandidaten von selbst ab. Es ist **kein** zusätzlicher
Not-Aus nötig — und es wird **kein** Cron verändert.

## 13 · Offene Freigabe

Der Sprint endet hier, weil der nächste Schritt eine Production-Änderung ist.

| Frage | Antwort |
|---|---|
| **Welche Production-Änderung ist nötig?** | Merge des PR nach `main` → automatisches Vercel-Deployment. **Keine** Migration, **keine** Datenänderung, **kein** Flag, **kein** Cron |
| **Welche Daten sind betroffen?** | Ab dem Deploy schreiben die regulären Läufe zusätzliche `ko_document_links` und legen für zurückgestellte Cluster `knowledge_objects` mit `status='pending'` an. Bestehende Vorgänge werden **nicht** verändert; ein bestehender Vorgang kann fortgeschrieben werden (`ko_version` +1), wenn belegt neue Fakten eintreffen |
| **Welche Rückfallmöglichkeit gibt es?** | Rollback über `betrieb/deploy-rollback.md` (Vercel-Redeploy des Vorgängers). Die geschriebenen Verknüpfungen bleiben — sie sind **additiv und harmlos**: das Altverfahren liest `ko_document_links` nicht für seine Entscheidung. Vorgemerkte `pending`-Vorgänge sind für Nutzer unsichtbar (`status='pending'` ist vom Matching ausgeschlossen) |
| **Welche Prüfungen liegen vor?** | Offline-Suite **160/160**, Browser-Smoke **32/32**, drei neue Suiten (Identität 52, Lebenszyklus 55, CSD-Regression 38 Assertions); **CI grün** auf PR **#143** (beide Pflicht-Checks, Run `30221808173`); Production-Messung read-only nach §10/§11 |
| **Welches Testfenster?** | Die 24 h nach dem Deploy — ein regulärer Crawl-Zyklus, ohne manuellen Anstoß |
| **Wie wird Erfolg gemessen?** | Anteil „ohne Endzustand" im 24-h-Fenster **< 5 %** (heute 76,3 %); Kollisionen **0**; der CSD-Vorgang existiert mit allen verknüpften Rohdokumenten |
| **Wann wird abgebrochen?** | Wenn nach dem ersten vollständigen Zyklus der Anteil „ohne Endzustand" **nicht** gesunken ist, oder der LLM-Tagesverbrauch **100/100** erreicht und `skipped-budget` über 30 % der Cluster liegt → Rollback und Entscheidung über OP-14 (Relevanzsortierung) bzw. Budgeterhöhung **vor** einem zweiten Anlauf |

**Getrennt freizugeben** (nicht Teil dieser Anfrage): das Nachholen des **Altbestands**
(1 504 Rohdokumente ohne Endzustand). Das kostet KI-Aufrufe in erheblichem Umfang und ist
eine eigene Kostenentscheidung. Das Werkzeug bricht bei mehr als 200 Kandidaten
absichtlich ab.
