# Befund — warum der Anschlag auf den Berliner CSD 2026 in keiner Lage erschien

**Stand:** 2026-07-27 · **Diagnose: §1–§8** · **Reparatursprint: §9–§13** ·
**Qualitätssprint: §12a** · **B4-2: §12b/§12c** · **gescheiterter Nachweislauf: §14/§15** ·
**Hotfix B4-3: §16**
**Sprintzustand (2026-07-27, Hotfix B4-3): teilweise abgeschlossen.** B4, B4-2 und B4-3
sind im Code behoben und offline belegt; der **Production-Nachweis** steht für B4-3 aus
und ist freigabepflichtig (Merge = Deployment). Der Nachweislauf vom 2026-07-27 ist
**gescheitert und vollständig zurückgenommen** (§15).
**In diesem Hotfix-Sprint wurde Production ausschließlich lesend berührt.**

> Kanonische Stelle für diesen Befund **und für seine Reparatur**. `CURRENT_STATE.md` §3
> verweist hierher und wird nicht zweitverwertet.
>
> **Lesehinweis:** §1–§8 beschreiben den **Ist-Zustand vor der Reparatur** und bleiben
> unverändert als Beweiskette erhalten. Was tatsächlich gebaut, gemessen und offen
> geblieben ist, steht in **§9 (Reparatur)**, **§10 (verifizierter Verlustumfang)**,
> **§11 (Kosten)**, **§12 (Production-Nachweisplan)**, **§12a (drei Korrekturen aus dem
> lesenden Nachweis)** und **§13 (Freigabeanfrage)**.

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

## 12a · Drei Korrekturen aus dem lesenden Production-Nachweis (2026-07-26)

Der lesende Nachweis nach dem Merge von #143 hat drei Mängel sichtbar gemacht, die
**vor** dem CSD-Nachholen behoben wurden. Kein Architektursprint, keine neue Funktion.

### K-1 · Karenzzeit konfigurierbar (`--karenz=<stunden>`)

Die feste 24-Stunden-Karenz beantwortet die Frage „ist dieses Rohdokument schon zu
lange unverarbeitet?". Für den laufenden Betrieb ist sie richtig. Für das **gezielte**
Nachholen eines bekannten Verlustfalls ist sie falsch: dort ist bereits belegt, dass
die Pipeline an den Dokumenten vorbeigelaufen ist und **nicht mehr auf sie
zurückkommt** — der reguläre Lauf verarbeitet ausschließlich Dokumente seines
**eigenen** Crawls. Am CSD-Fall blockierte die Karenz 16 von 20 Dokumenten.

Standard bleibt **24 h**. Die Option wirkt **ausschließlich** im Nachhol-Werkzeug;
Watchdog und normale Verarbeitung bleiben unberührt. Eine abweichende Karenz wird in
der Ausgabe benannt, nicht stillschweigend angewandt.

### K-2 · Dokumentauswahl für den KI-Prompt

Der Prompt fasst 12 Dokumente. **Welche** zwölf, entschied bisher die
Cluster-Reihenfolge — und die ist nach Dokumentkennung sortiert, also nach einem
Inhalts-Hash. Am echten CSD-Stapel (16 Meldungen) fiel dadurch ausgerechnet die
**Terror-Einordnung** heraus.

Geprüft wurden vier Strategien am echten Production-Stapel:

| Strategie | Schlüsselfakten im Prompt | abgedeckte Anker |
|---|---|---|
| alt (Dokumentkennung) | 5 / 6 — ohne Terror-Einordnung | 59 |
| neueste zuerst | 5 / 6 — ohne Landesreaktion | 58 |
| älteste zuerst | 5 / 6 — ohne „Täter erschossen" | 66 |
| **neu: Faktenabdeckung + feste Endpunkte** | **6 / 6** | **69** |

**„Neueste zuerst" ist also nicht optimal** — die neuesten Meldungen eines laufenden
Ereignisses sind überwiegend Reaktionen; Tathergang und Opferzahl stehen in den frühen.
Gewählt wurde: ältestes und neuestes Dokument gesetzt, der Rest gierig nach **neuen
Fakten** (unbekannte Anker **und** unbekannte Zahlen), Ausgabe chronologisch. Zahlen
zählen dabei **nur** für diese Auswahl, nie für die Vorgangsidentität — dort würden sie
über Prozentwerte und Beträge fachfremde Dokumente verbinden.

**Verworfen, weil messbar schlechter:** zusätzlich eine zeitliche Streuung über gleich
breite Abschnitte zu erzwingen. Sie zog Dokumente aus dünnen Frühabschnitten herein und
verdrängte aus der dichten Nachmittagsstunde die Terror-Einordnung — 5/6 statt 6/6.

### K-3 · Telemetrie-Aggregation und zwei gleichartige Fehler

`aggregateVorgangsbildung` filterte auf `understanding-lagecheck`; geschrieben wird
`understanding-lage`. `understanding-nachhol` fehlte ganz. **Beide Lauftypen fielen
still aus den Tageskennzahlen.**

Bei der gezielten Suche nach derselben Fehlerklasse — ein Wert wird geschrieben, aber
woanders unter anderem Namen erwartet — fanden sich **zwei weitere**:

| | Fehler | Wirkung |
|---|---|---|
| K-3a | `aggregateVorgangsbildung` filterte auf eine Namensliste | Lage- und Nachhol-Läufe unsichtbar |
| K-3b | `ERGEBNISGRUPPEN` kannte `skipped-no-cluster` / `skipped-no-vorgang` nicht | zwei Ergebnisklassen des Nachholpfads fielen in „unbekannt" — genau der stille Sammelzustand, gegen den B4 antrat |
| K-3c | `server.js` zählte `verarbeitet = counts.saved` | ein Lauf, der nur bestehende Vorgänge fortschrieb (`updated`/`merged`), meldete „nichts verarbeitet" und löste dazu die teure Diagnose über 6 000 Rohdokumente aus |

Alle drei behoben. Die Namensliste ist durch ein **Präfix** ersetzt (`understanding-`),
das bei einem neuen Lauftyp nicht erneut auseinanderlaufen kann.

**Weitere Inkonsistenzen dieser Art wurden gesucht und nicht gefunden.** Geprüft
wurden: alle `process:`-Namen gegen alle Filterstellen, alle im Code vergebenen
Ergebnisklassen gegen `ERGEBNISGRUPPEN`, alle Konsumenten von `counts.*` und
`.status ===` in `server.js`, `scheduler.js` und `client.js`.

Gegen ein Wiederauftreten wirken jetzt **zwei Strukturtests**, die den Quelltext
gegen die Zuordnungstabellen prüfen statt Beispiele durchzuspielen: jede im Code
vergebene Ergebnisklasse muss in `ERGEBNISGRUPPEN` stehen, und jeder geschriebene
`understanding-*`-Lauftyp muss von der Aggregation erfasst werden.

## 12b · NEUER BEFUND B4-2 — der Vorgang wächst unbegrenzt („Magnet-Vorgang")

**Eine Aussage aus §9 war falsch und wird hiermit widerrufen.** Dort steht, die
Clusterbildung sei „gegen Digest-Cluster abgesichert". Das Sicherheitsventil
(`MAX_CLUSTER_DOKUMENTE = 60`) begrenzt einen Cluster **innerhalb eines Laufs** —
es begrenzt aber **nicht**, wie viele Dokumente ein bestehender Vorgang über die
Vorgangsauflösung **über Läufe hinweg** einsammelt. Genau das passiert in Production.

### Beleg

`vg-zeitung-20260428-f362cc`, entstanden im ersten Lauf nach dem #143-Deployment:

| Lauf | neue Verknüpfungen | Dokumente ohne Veröffentlichungszeit |
|---|---|---|
| 2026-07-26 22:14 UTC | 13 | 0 |
| 2026-07-27 04:05 UTC | **52** | 0 |
| **Summe** | **65** | — |

Inhalt dieses **einen** Vorgangs: Armutsgefährdung in Anhalt-Bitterfeld ·
Sportfördergesetz · Emissionshandel · Pflegereform · Rücktritt des
Bundesverkehrsministers · Bürgergeld-Sanktionen · eine vietnamesische
Gewerkschaftswahl · **und der Anschlag auf den Berliner CSD**.

### Mechanismus (isoliert, nicht vermutet)

Dieselben 65 Dokumente durch die aktuelle Clusterfunktion gegeben ergeben
**16 getrennte Cluster** (größter: 30 Dokumente) mit 16 verschiedenen Kennungen.
**Die Clusterregel ist also gesund.** Der Fehler sitzt in der Vorgangsauflösung:

> `sameVorgang()` gilt als erfüllt, sobald **ein einziges** Dokumentpaar dasselbe
> Ereignis beschreibt. Ein Vorgang mit bereits 13 thematisch gemischten Dokumenten
> findet für fast jeden neuen Cluster irgendein passendes Paar — und **jede
> Aufnahme macht ihn anziehender**. Der Effekt ist selbstverstärkend: 13 → 65 in
> einem einzigen Lauf.

Der Ereignistag `20260428` und die Themenwurzel `zeitung` (aus Herausgeber-Zusätzen
wie „ZFK – Zeitung für kommunale Wirtschaft") zeigen zusätzlich, dass ein einzelnes
Dokument mit alter Veröffentlichungszeit und ein Herausgebername als Themenwurzel
den Startpunkt eines solchen Vorgangs bilden können.

### Einordnung

- **Nicht neu durch #143:** Digest-Vorgänge gab es vorher schon, teils größer
  (`vg-regierung` 676 Dokumente vom 07.07., `vg-ausschuss` 223, `vg-fraktion` 181).
- **Aber von #143 nicht behoben, und die gegenteilige Aussage in §9 war falsch.**
  Nach dem Deployment entstanden `vg-bundestagsfraktion-…` (120), 
  `vg-bundesregierung-…` (93), `vg-bundestag-…` (78), `vg-zeitung-…` (65),
  `vg-fraktion-…` (60).
- **Kein stiller Verlust:** die Dokumente sind verknüpft und haben einen
  Endzustand. Der Schaden ist **Qualität**, nicht Verlust — ein Knowledge Object
  aus 65 fachfremden Dokumenten ist als politische Lage wertlos, und sein Prompt
  sieht ohnehin nur 12 davon.

### Erforderliche Korrektur (bewusst NICHT in diesem Sprint)

Sie berührt die Kernregel der Zusammenführung und verändert die Kostenstruktur
(mehr Vorgänge → mehr KI-Aufrufe). Sie braucht dieselbe Messung wie §11 und ist
damit ein eigener Sprint. Zwei naheliegende Ansätze:

1. **Beleg gegen den Kern statt gegen ein Einzeldokument:** ein Cluster gehört nur
   dann zu einem Vorgang, wenn er dessen **Kernanker** trifft — nicht irgendein
   Dokument darin.
2. **Harte Obergrenze auch in der Auflösung:** ein Vorgang, der
   `MAX_CLUSTER_DOKUMENTE` erreicht hat, nimmt nichts mehr auf; neue Cluster bilden
   einen eigenen Vorgang.

**Empfohlene Reihenfolge:** B4-2 vor dem Nachholen des Altbestands. Der CSD-Nachweis
selbst ist davon **nicht** blockiert — die Kandidatenpräfixe des CSD-Clusters
(`vg-csd`, `vg-berlin`, `vg-angriff`) erreichen keinen der Magnet-Vorgänge; das wurde
geprüft. Drei CSD-Dokumente hängen allerdings bereits an `vg-zeitung-…` und stehen
dem Nachweis deshalb nicht zur Verfügung (§13a).

## 12c · B4-2 behoben — Resolver gegen Magnet-Vorgänge gehärtet (2026-07-27)

### Ursache, eindeutig nachgewiesen

Die Altfassung von `sameVorgang()` fragte: *„gibt es **irgendein** Dokumentpaar,
das dasselbe Ereignis beschreibt?"* — ein **Existenzquantor**. Damit wächst die
Trefferwahrscheinlichkeit **linear mit der Größe des Bestands**: ein Vorgang mit
13 gemischten Dokumenten passt zu fast jedem neuen Cluster, und **jede Aufnahme
macht ihn anziehender**. Das ist keine Vermutung — es ist die einzige Erklärung,
die zu allen Messwerten passt:

| Prüfung | Ergebnis |
|---|---|
| Zerfallen die Dokumente eines Magneten bei Neuclusterung? | ja, `vg-zeitung-…`: 65 Dokumente → **16 Cluster** |
| Ist die Clusterregel also schuld? | **nein** — sie trennt korrekt |
| Wuchs der Magnet über Läufe? | ja: 13 Verknüpfungen (26.07. 22:14) → 65 (27.07. 04:05) |
| Fehlten Veröffentlichungszeiten? | nein, 0 von 65 |

Die **transitive Kette** über Läufe ist damit der Wachstumspfad, und der
Einzeltreffer ist die Tür, durch die sie läuft.

### Magnet-Analyse (36 Production-Vorgänge mit ≥ 6 Dokumenten, read-only)

Werkzeug: `scripts/vorgangs-magnet-analyse.js`. **Objektive Definition statt Bauchgefühl:**
man gibt die Dokumente eines Vorgangs erneut in die (nachweislich gesunde)
Clusterfunktion. Ein echtes Ereignis bleibt **ein** Cluster; ein Magnet zerfällt.

> **Kohärenz** = größtes Cluster / alle Dokumente · **Magnet** = ≥ 10 Dokumente **und** Kohärenz < 0,6

| | Magnete (12) | gesunde Vorgänge (24) |
|---|---|---|
| Kohärenz | **0,07 – 0,55** | **0,67 – 1,00** |
| Kernanker | **0 – 2, ganz überwiegend 0** | **2 – 8** |
| Dokumente (Mittel) | 71,3 | 17,6 |
| Themenvielfalt (Mittel) | 31,2 Cluster | 2,8 Cluster |
| größter | **400** (`vg-regierung`) | — |
| kleinster Magnet | 10 | — |

Zwischen 0,55 und 0,67 liegt **kein einziger** Vorgang — die Schwelle 0,6 trennt in
einer echten Lücke der Verteilung, nicht an einem geratenen Punkt.

**Der entscheidende Befund:** *jeder* Magnet hat **keinen Kern** — seine Dokumente
teilen keinen Anker. Genau daran ist er erkennbar, und genau das macht ihn
unschädlich.

### Umgesetzte Lösung

> **Verglichen wird KERN gegen KERN, nicht Dokument gegen Dokument.**
> Ein Vorgang, dessen Dokumente nichts gemeinsam haben, **hat keinen Kern** — und
> kann deshalb strukturell nichts mehr anziehen. **Der Magnet wird durch seine
> eigene Heterogenität unschädlich.**

Fünf Prüfungen in dieser Reihenfolge, jede mit eigener Begründung in der Spur:

| # | Riegel | Ablehnungsgrund |
|---|---|---|
| 1 | Größe: ein Vorgang mit ≥ 60 Dokumenten nimmt nichts mehr auf | `vorgang-voll` |
| 2 | Der Bestand muss einen Kern haben | `bestand-ohne-kern` |
| 3 | Der neue Cluster muss einen Kern haben | `cluster-ohne-kern` |
| 4 | Fortschreibungsfenster 14 Tage · kein Jahreskonflikt | `vorgang-zu-alt` · `jahreskonflikt` |
| 5 | Kernüberdeckung ≥ `min(2, ⌈Kern/2⌉)`, mindestens ein nicht generischer Treffer | `kernueberdeckung-zu-schwach` |

Die Anforderung in Schritt 5 **skaliert mit der Kerngröße**. Ein fester Wert wäre
in beide Richtungen falsch: bei zwei Kernankern würde jede echte Fortschreibung
abgelehnt, bei sechs würde ein einziger Treffer („berlin") jedes Berliner Thema
anziehen — der Magnet in klein.

**Verworfene Alternativen** (im Code dokumentiert, damit sie nicht erneut probiert
werden): Mehrheitsentscheidung über Dokumentpaare (zu streng für laufende
Ereignisse — späte Reaktionen passen sprachlich nicht zu frühen Tatmeldungen) ·
reine Größenobergrenze (begrenzt den Schaden, behebt die Ursache nicht) ·
semantische Ähnlichkeit über Embeddings (teuer, nicht deterministisch, nicht
offline testbar — und für diesen Fehler nicht nötig).

### Nachvollziehbarkeit

Jede Entscheidung liefert eine **vollständige Spur**: verglichene Dokumente,
beide Kerne, Überdeckung mit Gewicht und geforderter Schwelle, erfüllte und
fehlende Kriterien. Auch **Ablehnungen** werden protokolliert — `resolveVorgang()`
sammelt sie je geprüftem Kandidaten und legt sie ans Ergebnis.

### Production-Validierung (read-only, 2026-07-27)

Der echte CSD-Cluster (16 Dokumente) gegen die 25 größten Vorgänge:

| | Ergebnis |
|---|---|
| Magnete geprüft | **12** |
| davon vom neuen Resolver blockiert | **12 von 12** |
| Vorgänge, die den CSD-Cluster aufnehmen würden | **keiner** |
| unter dem ALTEN Resolver hätten ihn gezogen | **3** (`vg-regierung`, `vg-zeitung-…`, `vg-verkehrsminister`) |

Beide Riegel greifen unabhängig: alle 12 Magnete haben **Kernanker = 0**, elf von
ihnen zusätzlich ≥ 60 Dokumente. Die 13 gesunden Vorgänge lehnen den CSD-Cluster
mit `kein-spezifischer-kerntreffer` ab — inhaltlich korrekt, sie handeln von
etwas anderem.

### Was bewusst NICHT getan wurde

**Keine Bereinigung bestehender Magnete.** Das Werkzeug diagnostiziert
ausschließlich. Die 12 bestehenden Magnete bleiben, wie sie sind — sie können nur
nichts mehr anziehen. Eine Bereinigung (Auftrennen in echte Vorgänge) wäre ein
Production-Schreibzugriff mit KI-Kosten und ist eine eigene Freigabeentscheidung.

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

## 14 · Production-Nachweis Anlauf 1 — abgebrochen vor jeder Mutation (2026-07-27, 07:17 UTC)

Dokumentiert auf dem **nicht gemergten** Branch `claude/berlin-csd-production-proof-h3cz7l`
(Commit `6a36b86`). Kurzfassung: Startprüfung erfüllt, Ausgangszustand gemessen, alle
read-only Schritte des §12-Plans ausgeführt, **vor dem ersten Schreibzugriff angehalten** —
Blocker 1 war ein fehlender KI-Schlüssel in der Cloud-Sitzung. Die dortigen Zahlen sind
Ausgangswerte für Anlauf 2 und werden hier nicht wiederholt.

## 15 · Production-Nachweis Anlauf 2 — **ausgeführt und gescheitert** (2026-07-27, 08:41 UTC)

**Sprintzustand: gescheitert.** Der genehmigte Schritt wurde ausgeführt. Er hat den
CSD-Vorgang **nicht** gebildet, sondern **19 CSD-Rohdokumente einem fachfremden
Bestandsvorgang zugeschlagen** und einen zweiten, unbeteiligten Vorgang inhaltlich
überschrieben. Damit sind die Abnahmekriterien „kein Magnet-Vorgang / keine falsche
Zusammenführung" und „keine unbeteiligten Datensätze verändert" **verletzt**.
Der Lauf hat einen **neuen, vorher unbekannten Resolver-Defekt** freigelegt: **B4-3**.

### 15.1 Preflight (alle 10 Punkte vor dem Schreibzugriff geprüft)

| # | Prüfung | Ergebnis |
|---|---|---|
| 1 | Deployter Production-Commit | `a05f273` (Merge #146), Deployment `dpl_9yhd4xbnnWm6oA3WVzbPXC5BpAL9`, `READY`, 07:51 UTC — **enthält #145** (`d33f540` ist Vorfahr) |
| 2 | CSD-Datenlage | 26 Rohdokumente 25.–27.07., davon **21 ohne gültigen Endzustand**, 5 bereits verknüpft |
| 3 | Warum unsichtbar | `vorgang_id like 'vg-csd%'` = **0**; kein KO, kein Vorgang, keine Lage |
| 4 | Vorgesehener Befehl | `vorgangsbildung-nachholen.js --ausfuehren` mit expliziter ID-Liste |
| 5 | Erwarteter Schreibumfang | `knowledge_objects` (1–2 Zeilen), `ko_document_links` (≤21) |
| 6 | Zielumfang eingrenzbar | ja — 21 namentlich genannte Kennungen |
| 7 | LLM-Budget | 38/100 verbraucht (05:46 UTC), Reserve 30 frei |
| 8 | Azure erreichbar | ja, über `ai.js`/Responses API auf `gpt-5-mini` verifiziert |
| 9 | Locks/Crons | beide `pipeline_locks`-Zeilen **abgelaufen** (22:24 und 04:16 UTC), nächster Cron 10:00 UTC |
| 10 | Rückweg | gezieltes Löschen genau der geschriebenen Zeilen (§15.7) |

**Arbeitsstand = Production-Stand:** lokaler Checkout `a05f273`, Arbeitsbaum sauber,
Flag-Datei identisch (`HELMUT_UNDERSTANDING_GATE=shadow`) — es lief kein anderer Code
als der deployte.

**Werkzeugbefund am Rande (nicht ursächlich):** `--max` kappt den Kandidatenpool
**vor** dem `--ids`-Filter. Mit dem Standard 200 fielen 3 der 21 CSD-Dokumente heraus,
weil 310 Dokumente im 3-Tage-Fenster ohne Endzustand sind. Deshalb `--max=400`; die
verarbeitete Menge blieb exakt die 21 genannten Kennungen.

### 15.2 Vorher-Zustand (T0 = 2026-07-27 08:40:27 UTC)

`knowledge_objects` **982** · `ko_document_links` **3 217** · `raw_documents` **8 837** ·
`profiles` **9** · `mandate_profiles` **9** · `briefings` **64** · `status='pending'` **277** ·
`understanding_status='failed'` **7** · `vorgang_id like 'vg-csd%'` **0** ·
LLM-Tagesbudget **38/100** · Magnete **15** von 31 Vorgängen mit ≥ 10 Dokumenten.

Fenster 3 Tage: 660 Rohdokumente, davon **310 (47,0 %) ohne gültigen Endzustand**,
178 verstanden, 52 vorgemerkt, 120 in Karenz. Watchdog **ALARM**.

### 15.3 Ausgeführter Schritt (genau einer)

```
HELMUT_V3_STORE=1 HELMUT_NACHHOLEN_BESTAETIGT=ja \
node scripts/vorgangsbildung-nachholen.js \
  --tage=3 --karenz=0 --max=400 --vorschau --ausfuehren --ids=<21 CSD-Kennungen>
```

Lauf `nachhol-20260727084121`, 08:41:23 – 08:42:08 UTC (45 s), 21 Rohdokumente durch
`runUnderstandingShadow()` — dieselbe Funktion, die auch der Crawl-Cron ruft.

Ergebnis: **3 Cluster** · `saved` 2 · `skipped-error` 1 · Auflösungen **Bestand 2, neu 1** ·
vorgemerkt 0 · zurückgestellt 0. Ein Cluster brach mit
`[understanding] update-error: vg-angriffen OpenAI request timeout` ab (20 s Zeitgrenze).

### 15.4 Nachher-Zustand — was tatsächlich geschrieben wurde

`knowledge_objects` 982 → **983** · `ko_document_links` 3 217 → **3 238 (+21)** ·
`status='pending'` 277 → **276** · `raw_documents`, `profiles`, `mandate_profiles`,
`briefings`, `understanding_status='failed'` **unverändert**.

| Vorgang | Was er ist | Was der Lauf tat | Bewertung |
|---|---|---|---|
| `vg-angriffen` (`ko-vg-angriffen`) | Bestandsvorgang vom 23.07., **1** Dokument: *„Iran-Krieg — Trump droht Iran wegen Huthi-Angriffen auf saudische Schiffe"* | **+19 CSD-Rohdokumente** verknüpft (08:41:23), Inhalt **nicht** aktualisiert (KI-Timeout) → 20 Dokumente, `ko_version` 1, `source_document_count` 1, Überschrift weiterhin Iran | **falsche Zusammenführung.** Die 19 CSD-Dokumente gelten dadurch als „verstanden" und werden vom regulären Lauf **nie wieder** angefasst |
| `vg-tagesspiegel-20260519-f29ebd` | am 27.07. 04:06 **vorgemerkter** Vorgang, 2 fachfremde Dokumente (Bielefeld, Pflegebedürftige) | **+1 Dokument** (*„Kai Wegner zu queeren Rechten im Grundgesetz"*), `status` **pending → neu**, `was_ist_passiert` mit **Wegner-Inhalt überschrieben**, `understanding_status` → `complete` | **falsche Zusammenführung** und Veränderung eines unbeteiligten Datensatzes; der Vorgang ist jetzt für Mandanten **sichtbar** |
| `vg-islamisten-20260726-0ab9e8` | **neu angelegt** 08:42:08 | 1 Dokument (*„Reaktionen auf Anschlag — Härtere Gangart gegen Islamisten gefordert"*), `neu`/`complete` | fachlich korrekt, aber **nicht** der CSD-Vorgang |

**`vorgang_id like 'vg-csd%'` ist weiterhin 0.** Der Anschlag hat nach dem Lauf
**keinen** eigenen Vorgang.

**Audit-Blindstelle, dabei aufgefallen:** die Inhaltsaktualisierung setzt `updated_at`
**nicht** neu (`ko-vg-tagesspiegel-…` trägt weiter 04:06:06). Eine Abfrage
„geänderte Zeilen seit T0" findet solche Änderungen deshalb **nicht** — sie war nur
über den Zählerabgleich `pending` 277 → 276 auffindbar.

### 15.5 Ursache — Befund B4-3 (isoliert, nicht vermutet)

Gegen die echten Production-Daten nachgerechnet (read-only, `sameVorgang()`):

```
Kernanker Bestand vg-angriffen : ["angriffen","droht","huthi","krieg","saudische","schiffe","trump","wegen"]
Kernanker CSD-Cluster (24 Dok) : ["angriff","angriffen","berlin","berliner","berlins","csd"]
Überdeckung: 2 Treffer ("angriff", "angriffen"), beide als SPEZIFISCH gewertet, Gewicht 2
Nötig: min(MIN_BEWEISGEWICHT=2, ceil(8/2)=4) = 2   →   2 ≥ 2   →   „gleicher Vorgang"
```

Zwei Fehler wirken zusammen:

1. **`angriff`/`angriffen` steht nicht in `GENERISCHE_ANKER`.** Ein alltägliches
   Ereignissubstantiv trägt damit eine fachliche Identität — dieselbe Klasse Fehler wie
   `menschen` in B4, nur ein anderes Wort.
2. **Zwei Flexionsformen desselben Wortstamms zählen als zwei unabhängige Belege.**
   `MIN_BEWEISGEWICHT=2` ist damit von **einem einzigen** Wort erfüllbar. Die
   Gewichtung sollte je Wortstamm einmal zählen.

**Warum #145 das nicht abgefangen hat:** die Härtung wurde gegen die **Magnete**
validiert (12 von 12 blockiert). Magnet = ≥ 10 Dokumente und Kohärenz < 0,6. `vg-angriffen`
hatte **ein** Dokument und war in keiner Analyse. Ein Ein-Dokument-Vorgang hat einen
kleinen, vollständig spezifischen Kern — und ist damit **leichter** zu treffen als ein
Magnet, nicht schwerer. Der Riegel „Magnet hat Kernanker = 0" greift hier prinzipiell nicht.

**Zweiter Befund: die Magnet-Analyse ist gegen diesen Fall blind.** Nach dem Lauf steht
`vg-angriffen` mit **20 Dokumenten, Kohärenz 0,95, Risiko „—"** in der Auswertung, also
als **unauffällig**. 19 von 20 Dokumenten bilden ja einen sauberen Cluster; das eine
fachfremde Dokument ist die Minderheit. Eine frische Fehlzuordnung in einen **kleinen**
Vorgang ist über die Kohärenz **nicht** erkennbar. Zahl der Magnete unverändert 15.

### 15.6 Telemetrie und Kosten — und warum sie nicht in Production stehen

| | Wert |
|---|---|
| KI-Aufrufe | **3** über `gpt-5-mini` (Azure, Responses API): 2 erfolgreich, 1 Timeout nach 20 146 ms |
| Tokens | 5 327 + 5 428 (erfolgreiche Aufrufe), fehlgeschlagener Aufruf unbekannt |
| Kosten | **0,006272 USD** belegt, plus ein unbekannter Betrag für den Timeout |
| Lauftelemetrie | vollständig: `processed` 3, `cluster` 3, `gruppen.fehlgeschlagen` 1, `aufloesungen {bestand:2, neu:1}`, `dokumenteOhneEndzustand` 0, `grossereignisse` 1 |

**Diese Zahlen liegen NICHT in Production.** `useSupabase()` verlangt
`HELMUT_STORAGE_BACKEND=supabase`; in der Cloud-Sitzung ist die Variable nicht gesetzt.
Folge: die **fachlichen** Tabellen (`raw_documents`, `knowledge_objects`,
`ko_document_links`) wurden über das eigene `HELMUT_V3_STORE`-Gate **in Production**
geschrieben, das **Kosten- und Telemetrieprotokoll** (`llmUsage`, `processRuns`, der
Budgetzähler) dagegen in **lokale Dateien**. Belegt: `llm_usage` **0** neue Zeilen,
`llm_budget_counters` unverändert **38/100** (`updated_at` 05:46 UTC), `helmut_store`
seit 06:00:52 UTC nicht angefasst.

**Das ist ein eigener Betriebsbefund:** ein Nachhollauf aus einer Cloud-Sitzung
verändert Production-Daten, erscheint aber in **keiner** Kostenauswertung und in **keiner**
Lauftelemetrie des Betreibers. Das Budget-Gate rechnete gegen einen **lokalen** Zähler
(Schutzlimit 50/Tag, weil `HELMUT_MAX_LLM_CALLS_PER_DAY` nicht gesetzt ist) — der
Production-Deckel war an diesem Lauf nicht beteiligt.

### 15.7 Rückweg (vorbereitet, **nicht** ausgeführt — freigabepflichtig)

Rücknahme genau der 22 Änderungen dieses Laufs, nichts sonst:

```sql
-- 1. die 21 in diesem Lauf geschriebenen Verknüpfungen
delete from ko_document_links where created_at >= '2026-07-27T08:41:21Z';
-- 2. den neu angelegten Vorgang
delete from knowledge_objects where id = 'ko-vg-islamisten-20260726-0ab9e8';
-- 3. den überschriebenen Bestandsvorgang zurück auf "vorgemerkt"
update knowledge_objects
   set status = 'pending', understanding_status = 'pending',
       was_ist_passiert = null, understanding_model = null
 where id = 'ko-vg-tagesspiegel-20260519-f29ebd';
```

Sollwerte danach: `knowledge_objects` **982**, `ko_document_links` **3 217**,
`status='pending'` **277**. Die 21 CSD-Rohdokumente stehen dann wieder auf
`ohne-endzustand` — exakt der Ausgangszustand.

**Ehrliche Einschränkung zu Schritt 3:** die Feldwerte des vorgemerkten Vorgangs
**vor** dem Lauf sind nicht rekonstruierbar (`updated_at` wurde nicht fortgeschrieben,
§15.4). Vergleichbare vorgemerkte Vorgänge tragen `status='pending'`,
`understanding_status='pending'`, leeres `was_ist_passiert` und `understanding_model=null`;
die Überschrift ist bei diesem Datensatz schon jetzt leer. Schritt 3 stellt den
**Zustand**, nicht bitgenau den Datensatz wieder her.

### 15.8 Abnahmekriterien

| # | Kriterium | Status |
|---|---|---|
| 1 | CSD-Fall eindeutig identifiziert | **erfüllt** — 26 Dokumente, 21 im Zielumfang |
| 2 | Reparierter Code in Production aktiv | **erfüllt** — `a05f273` ⊇ #145, Deployment `READY` |
| 3 | Azure über `gpt-5-mini` | **erfüllt** — 2 von 3 Aufrufen erfolgreich, 1 Timeout |
| 4 | Minimaler gezielter Schritt | **erfüllt** — genau ein Lauf, exakt 21 Kennungen |
| 5 | Fachlich korrekter Vorgang entsteht | **verletzt** — kein `vg-csd…`; ein korrekter Nebenvorgang mit 1 Dokument |
| 6 | Kein Magnet, keine falsche Zusammenführung | **verletzt** — 19 Dokumente an `vg-angriffen`, 1 an `vg-tagesspiegel-…` |
| 7 | Kein Duplikat | **erfüllt** — kein zweiter Vorgang zum selben Ereignis |
| 8 | Über Production-Lesewege sichtbar | **verletzt** — kein CSD-Vorgang vorhanden |
| 9 | Telemetrie/Status/Kosten plausibel | **teilweise** — vollständig, aber lokal statt in Production (§15.6) |
| 10 | Keine unbeteiligten Datensätze verändert | **verletzt** — zwei fachfremde Bestandsvorgänge verändert |

### 15.9 Rückweg ausgeführt und verifiziert (2026-07-27, 08:56 UTC)

Der Betreiber hat die vollständige Rücknahme freigegeben; sie ist ausgeführt. Umfang
exakt wie in §15.7, zusätzlich auf das Laufzeitfenster **08:41:21 – 08:42:10 UTC** und
die **drei** betroffenen Vorgangskennungen eingegrenzt — es konnte damit keine Zeile
eines anderen Laufs erfasst werden.

| Kennzahl | vorher (T0) | nach dem Lauf | nach der Rücknahme |
|---|---|---|---|
| `knowledge_objects` | 982 | 983 | **982** |
| `ko_document_links` | 3 217 | 3 238 | **3 217** |
| `status='pending'` | 277 | 276 | **277** |
| `understanding_status='failed'` | 7 | 7 | **7** |
| `profiles` / `mandate_profiles` | 9 / 9 | 9 / 9 | **9 / 9** |
| Dokumente an `vg-angriffen` | 1 | 20 | **1** |
| `vorgang_id like 'vg-csd%'` | 0 | 0 | **0** |

`vg-angriffen` trägt wieder ausschließlich sein Iran-Dokument, Überschrift und Inhalt
waren nie verändert. `vg-tagesspiegel-20260519-f29ebd` steht wieder auf
`pending`/`pending` mit leerem Inhalt und seinen ursprünglichen 2 Dokumenten, ist also
für Mandanten wieder unsichtbar. Der neu angelegte Vorgang ist entfernt. Die 21
CSD-Rohdokumente stehen wieder auf `ohne-endzustand` und bleiben für einen korrigierten
Anlauf verfügbar. **Netto-Bilanz des Sprints in Production: 0 veränderte Zeilen.**

**Nicht bitgenau wiederhergestellt** (bewusst und dokumentiert): die Feldwerte des
vorgemerkten Vorgangs vor dem Lauf sind nicht rekonstruierbar (§15.7). Wiederhergestellt
ist der **Zustand** anhand des Musters vergleichbarer vorgemerkter Vorgänge.

**Beobachtung, nicht von diesem Sprint verursacht:** um **08:52:46 UTC** hat ein
**regulärer** Crawl begonnen (Lock `crawl-annika-klose`), um **08:55:02 UTC** ein
`global-understanding`-Lauf; bis 08:54:04 sind **53** neue Rohdokumente eingegangen.
Beide Läufe begannen **nach** dem Nachhollauf und **vor** der Rücknahme, haben zum
Zeitpunkt der Kontrollmessung aber **keine** Verknüpfung geschrieben (jüngste
`ko_document_links`-Zeile 05:31:26 UTC). Die Rücknahme war auf Fenster und Kennungen
eingegrenzt und konnte diese Läufe nicht berühren. **Offenes Risiko:** B4-3 ist in
Production weiterhin aktiv — trifft ein neues CSD-Dokument aus dem laufenden Crawl auf
`vg-angriffen`, entsteht dieselbe Fehlzuordnung im Regelbetrieb erneut.
`source_crawl_telemetry` hat heute weiterhin **0** Zeilen.

**Abgrenzung der Messzeitpunkte (wichtig für die Nachprüfbarkeit):** die Kontrollmessung
der Rücknahme (Tabelle oben) stammt von **08:56:0x UTC**; zu diesem Zeitpunkt hatte der
reguläre Lauf noch nichts geschrieben. Bereits **08:56:44 UTC** hat er seine erste
Verknüpfung geschrieben, und um **08:57:04 UTC** stand Production bei
`knowledge_objects` **986**, `ko_document_links` **3 493** (+276), LLM-Budget **43/100**,
1 aktiver Lock. **Diese Änderungen stammen sämtlich aus dem regulären Betrieb, nicht aus
diesem Sprint** — die Aussage „netto 0 veränderte Zeilen" bezieht sich ausschließlich auf
die von diesem Sprint verursachten Zeilen, die vollständig zurückgenommen sind.
`vg-angriffen` trägt auch nach diesem Lauf weiterhin **1** Dokument, und
`vorgang_id like 'vg-csd%'` ist weiterhin **0**.

**Beobachtung mit Handlungsbedarf, unabhängig von diesem Sprint:** im selben regulären
Lauf ist die Zahl der Vorgänge mit ≥ 10 Dokumenten von **31 auf 35** und die Zahl der
**Magnete von 15 auf 19** gestiegen. Der Magnet-Riegel aus #145 verhindert also nicht,
dass im Regelbetrieb neue inkohärente Sammelvorgänge entstehen. Das ist mit den Zahlen
dieses Sprints belegt, aber **nicht** weiter untersucht — eigener Befund für den
nächsten Sprint.

### 15.10 Nächste Schritte in dieser Reihenfolge

1. **B4-3 beheben**, bevor irgendein weiterer Nachhollauf startet: Wortstamm-Gewichtung
   (Flexionsformen zählen einmal) und `angriff*` in `GENERISCHE_ANKER`. Regressionstest
   mit genau diesem Fall — CSD-Cluster gegen einen Ein-Dokument-Bestandsvorgang mit
   generischem Ereignissubstantiv.
2. **Magnet-Analyse ergänzen** um eine Prüfung „frisch hinzugekommene Dokumente teilen
   den Kern des Bestands", die auch bei hoher Kohärenz greift.
3. **`HELMUT_STORAGE_BACKEND=supabase`** in den Environment-Einstellungen setzen, bevor
   ein Werkzeug aus einer Cloud-Sitzung erneut Production schreibt — sonst bleibt jeder
   Lauf kosten- und telemetrieblind.
4. **`--max` im Nachhol-Werkzeug korrigieren:** der `--ids`-Filter muss **vor** der
   Mengenkappung greifen, sonst ist eine namentlich genannte Menge unvollständig.
5. Erst danach den CSD-Nachweis erneut ansetzen.

---

## 16 · B4-3 behoben — Beweisfamilien statt Rohwortzahl (Hotfix 2026-07-27)

**Sprintzustand: teilweise abgeschlossen.** Der Defekt aus §15.5 ist geschlossen,
offline vollständig belegt und read-only gegen Production gegengerechnet. Offen bleibt
der **Production-Nachweis** — er verlangt Merge + Deployment und ist freigabepflichtig.
**Production wurde in diesem Sprint ausschließlich lesend berührt.** Kein Merge, kein
Deployment, keine Migration, kein Flag, kein erneuter CSD-Nachhollauf.

### 16.1 Die Entscheidung vor der Implementierung

Vier Fragen mussten beantwortet sein, bevor eine Zeile Code entstand.

| Frage | Antwort |
|---|---|
| **Was ist eine unabhängige Beweisfamilie?** | Eine Menge von Ankern, die **dieselbe Sache** benennen — entweder weil sie einander direkt matchen (Flexion, Kompositum) oder weil sie in einer **ausdrücklich aufgezählten** Tabelle stehen. Zwei Schreibweisen sind **ein** Beleg, nie zwei |
| **Was zählt als generisch?** | Die 15 im Auftrag genannten Ereignisfamilien (Angriff, Anschlag, Treffen, Gespräch, Debatte, Streit, Kritik, Forderung, Entscheidung, Protest, Demonstration, Wahl, Abstimmung, Konflikt, Krise) plus Vorwurf/Warnung, dazu Funktionswörter ab 5 Zeichen („wegen", „gegen", „während" …). **Nicht** erweitert wurde die Liste um Sachbegriffe |
| **Welche Kombination beweist eine Zusammenführung?** | Mindestens **eine** spezifische Familie **und** ein Familiengewicht der spezifischen Familien ≥ `min(2, ⌈spezifischer Kern / 2⌉)`. Ein sehr starker Einzelbeleg (Kompositumwurzel, ≥ 12 Zeichen exakt, exakte Abkürzung) wiegt 2 und genügt allein |
| **Welche Kombination muss abgelehnt werden?** | Evidenz aus **nur einer** Familie · **nur** generischen Familien · Flexionsformen **derselben** Familie · ein Ein-Dokument-Vorgang mit weniger als **zwei** spezifischen Familien |

**Die verbindliche Produktentscheidung wurde eingehalten:** es gibt **keine allgemeine
deutsche Stammwortlogik**. Ein Stemmer zöge „Wahlkampf", „Wahlrecht" und „Auswahl"
zusammen und erzeugte eine neue, schwerer auffindbare Fehlerklasse. Stattdessen steht
jede Zuordnung einzeln in `FAMILIEN_DEFINITION` und ist damit prüfbar. Was nicht in der
Tabelle steht, bleibt getrennt — **im Zweifel getrennt, nie zusammengezogen**.

**Bewusst offen gelassen:** „treffen" und „getroffen" bleiben **zwei** Familien. Die
Normalisierung kann „ein Treffen" und „getroffen werden" nicht sicher unterscheiden.
Beide sind generisch und können deshalb ohnehin keine Zusammenführung allein tragen.

### 16.2 Warum eine Abkürzungsregel dazugehört

`STRONG_ANCHOR_LEN` ist 12 Zeichen. Damit wäre **„CSD" ein schwächerer Beleg als ein
beliebiges zwölfbuchstabiges Wort** — und der CSD-Vorgang zerfiele, sobald „Angriff"
als generisch nicht mehr trägt (gemessen: das Dokument „Wegner nach CSD-Vorfall …"
verlöre seine einzige Kante). Ein Anker mit 3–4 Zeichen kann **strukturell** nur eine
Abkürzung sein: normale Wörter brauchen 5 Zeichen, Jahreszahlen werden vorher abgefangen.
Eine exakt gleiche Abkürzung zählt deshalb als starker Beleg — **außer** bei
Allerweltskürzeln (Parteien, Fraktionen, Sender, Agenturen, Staatenblöcke). „Beide
Meldungen nennen die SPD" darf nie allein eine Vorgangsidentität beweisen.

### 16.3 Ein-Dokument-Vorgänge — die eigentliche Angriffsfläche

`coreAnchors()` nimmt bei **einem** Dokument alles auf, was in ihm vorkommt: die
Hälfte-Schwelle ist bei n = 1 immer erfüllt. Der „Kern" eines Ein-Dokument-Vorgangs ist
also nicht das gemeinsame Thema mehrerer Meldungen, sondern das **vollständige Vokabular
eines einzelnen Textes**, inklusive Füllwörtern. Genau daran wurde `vg-angriffen` zum
Sammelbecken.

**Read-only in Production gemessen (2026-07-27):** von **986** Knowledge Objects haben
**735 genau ein Dokument** — **74,6 %**. Die Fehlerklasse betraf also nicht einen
Einzelfall, sondern drei Viertel des Bestands. Allein auf der Familie „angriff" liegen
**sechs** solcher Ein-Dokument-Vorgänge:

```
vg-angriffen            Iran-Krieg — Trump droht Iran wegen Huthi-Angriffen auf saudische Schiffe
vg-großangriff          Ukraine-Krieg — Russischer Großangriff auf Kiew
vg-raketenangriff       Ukraine-Krieg — Russischer Raketenangriff auf Kiew
vg-vergeltungsangriffe  Nahost — USA starten Vergeltungsangriffe gegen Iran
vg-angriffe             Fünfter Tag in Folge — Weitere US-Angriffe gegen den Iran
vg-luftangriffen        Krieg — Iran meldet mehr als 30 Tote bei US-Luftangriffen
```

Für solche Vorgänge gilt jetzt **fail closed**: zwei unabhängige spezifische Familien,
Evidenz nicht überwiegend generisch, kein Datumskonflikt. Sonst **keine** Zusammenführung.

### 16.4 Was bei Ablehnung und bei Fehlern geschieht

Geprüft am Code und in `scripts/vorgangs-beweisfamilien-test.js` §8:

| Fall | Verhalten | Beleg |
|---|---|---|
| Resolver lehnt ab | Der Cluster bildet einen **eigenen** Vorgang; alle Rohdokumente werden verknüpft | 8.1 |
| Azure-Timeout | `skipped-error`, Vorgang geparkt, Dokumente verknüpft → gezielt nachholbar | 8.2 |
| Budget erschöpft | `skipped-budget`, **bewusst keine** Verknüpfung → bleibt Nachholkandidat | 8.3 |
| Fehler bei einer Aktualisierung | Bestand **unangetastet**, nicht geparkt, neues Dokument verknüpft | 8.4 |
| Erneuter Lauf | läuft durch, `ko_version` +1 statt Überschreiben | 8.5 |
| Terminal aussortiert | bleibt terminal, **kein** KI-Aufruf, Dokumente bekommen trotzdem einen Endzustand | 8.6 |

**Zu Abnahmekriterium „kein Bestandsvorgang wird vor erfolgreichem Understanding
überschrieben": geprüft und erfüllt.** `understandUpdate()` ruft `deps.save(ko)` erst
**nach** erfolgreichem KI-Lauf **und** bestandener Schemaprüfung; bei Timeout, Budgetstopp
oder ungültiger Antwort bleibt der Bestand unverändert und wird **nicht** geparkt. Ein
Stop-Gate war deshalb nicht nötig.

**Neu geschlossen — die Audit-Blindstelle aus §15.4:** `assembleKnowledgeObject` setzt
`updated_at` jetzt bei jedem Schreibvorgang. Ohne diesen Zeitstempel war eine
Inhaltsaktualisierung über „welche Zeilen hat dieser Lauf verändert?" **nicht auffindbar**
— genau daran wäre auch die Abnahme des nächsten Nachweises gescheitert. Die Spalte
existiert und steht bereits in der Schreib-Projektion: **keine Migration**.

### 16.5 Telemetrie der Ablehnungen

Bisher trug allein der `saved`-Zweig die Kandidatenspuren — ausgerechnet die Fälle, in
denen der Resolver eine Zusammenführung **verhindert** hat, waren unsichtbar. Jetzt trägt
**jeder** Ausgang `resolverGeprueft`, `resolverAbgelehnt` und `resolverAblehnungsgruende`;
die Lauftelemetrie fasst sie unter `telemetrie.resolver` zusammen. Nur Kennungen, Zahlen
und Grundklassen — kein Dokumenttext, keine KI-Ausgabe.

### 16.6 Magnet-Analyse — warum sie blind war und was sie jetzt sieht

Ihr Maß ist die **Kohärenz**: der Anteil des größten Clusters. `vg-angriffen` bestand nach
dem Fehlgriff aus 1 Huthi- und 19 CSD-Dokumenten; die 19 sind untereinander hochkohärent,
also 19/20 = **0,95** — weit über der Magnetschwelle 0,6. Beide Kennzahlen der alten
Definition zeigten **nach oben** statt nach unten.

Ein Magnet zerfällt in **viele** Cluster. Eine **Übernahme** zerfällt in genau **zwei**:
einen winzigen Ursprung und einen großen fremden Block. Gemessen wird deshalb zusätzlich
das Verhältnis zum **Ursprung** (dem Cluster mit dem ältesten Dokument): großer, in sich
kohärenter Fremdblock · winziger Ursprung · **keine** gemeinsame spezifische Beweisfamilie.
Dazu zwei unabhängige Indikatoren: `gespalten` und `evidenzUeberwiegendGenerisch`.

**An Production kalibriert, nicht geraten:** ein Fremdblock zählt nur dann als kohärent,
wenn er einen **eigenen Kern** hat. Ohne diese Bedingung bekam jeder große Magnet
zusätzlich das Etikett „Übernahme", weil das Sicherheitsventil in `clusterRawDocuments`
Scheiben ohne gemeinsamen Anker erzeugt. **Ein falsches Etikett ist so schädlich wie ein
fehlendes** — die Zahl sank dadurch von 14 auf 9.

Read-only gemessen (2026-07-27, 40 Vorgänge mit ≥ 6 Dokumenten):

| Klasse | Zahl |
|---|---|
| Magnet | 20 |
| Übernahme | 9 |
| gespalten (ohne Magnet/Übernahme) | 1 |
| unauffällig | 17 |

Der rekonstruierte CSD/Huthi-Fall wird erkannt (`uebernahme`, Risiko **hoch**,
Kohärenz 0,95), **ohne** dass echte Großvorgänge oder ein Vorgang mit legitimer
thematischer Entwicklung markiert werden — beides ist als Gegenprobe getestet.
Die Analyse bleibt **read-only**.

### 16.7 Nachholskript und Storage-Gate

**`--ids` wirkte erst nach der Mengenkappung** (§15.1 nennt das als „Werkzeugbefund am
Rande"; es war eine Fehlerquelle erster Ordnung). Der Aufruf holte 201 von über tausend
Kandidaten und filterte **danach** auf die 21 angeforderten Kennungen — welche 21 übrig
blieben, entschied die Kappung. Jetzt: **vollständige Liste → Auswahl → erst dann
Mengenbewertung**, in der reinen, einzeln testbaren Funktion `waehleNachholKandidaten`.
Dazu: `--ids=` (leer) bricht ab statt still zum Massenlauf zu werden · Dubletten werden
entfernt und benannt · unbekannte Kennungen werden benannt · die Vorschau nennt **jede**
Kennung, die geschrieben würde · ein harter Riegel bricht ab, falls je ein nicht
angefordertes Dokument im Pool läge · die Mengengrenze wird **bewertet**, nie still
angewandt.

**Gegenprobe im Test:** mit vorgezogener Kappung hätten **0 von 21** Kennungen überlebt.

**Das Storage-Gate** (`lib/helmut/production-schreibgate.js`) schließt §15.6. Zwei
unabhängige Schalter lesen dieselben Zugangsdaten: Fachtabellen hängen an
`HELMUT_V3_STORE`, Betriebsdaten (LLM-Budget, LLM-Nutzungslog, Lauftelemetrie) an
`HELMUT_STORAGE_BACKEND`. **Das ist mehr als ein Telemetrieverlust:** das LLM-Tagesbudget
wird aus dem Betriebsspeicher geseedet. Fällt der auf den lokalen Dateispeicher zurück,
startet der Zähler bei **null** — der fail-closed Kostendeckel ist wirkungslos. Der
Schreiblauf bricht jetzt **vor** dem ersten fachlichen und dem ersten KI-Schreibzugriff
ab und benennt Variable, Problem und Wirkung. Kein stiller Fallback, keine
Umgehungsoption. **Read-only-Vorschauen laufen unverändert ohne das Gate.**

### 16.8 Read-only Production-Vergleich — was die neue Regel gekostet hätte

Werkzeug: `scripts/vorgangs-resolver-vergleich.js`. Je Vorgang wird jedes Dokument
einzeln gegen die übrigen Dokumente desselben Vorgangs gestellt und mit **beiden**
Regelfassungen bewertet. Die Altfassung steht als Messkopie im Skript, damit der
Vergleich nicht gegen eine geschönte Rekonstruktion läuft.

| Ergebnis | Zahl | Anteil |
|---|---|---|
| geprüfte Vorgänge / Zuordnungen | 177 / **2 482** | — |
| beide Fassungen tragen | 425 | 17,1 % |
| beide lehnen ab | 2 021 | 81,4 % |
| **nur ALT trug → neu verhindert** | **35** | **1,4 %** |
| nur NEU trägt | 1 | 0,0 % |

Ablehnungsgründe der neuen Regel: `kernueberdeckung-zu-schwach` 19 ·
`einzelvorgang-zu-wenig-familien` 15 · `kein-spezifischer-kerntreffer` 1.

**Die 35 aufgeschlüsselt — ohne diese Aufschlüsselung wäre die Zahl wertlos:**

- **12** liegen in Vorgängen, die die Analyse **selbst als defekt** ausweist. Größter
  Einzelfall: `vg-deutsch-20250212-0c5a3a` („Ausschuss für Tourismus — DIHK"), 24
  Dokumente, verbunden ausschließlich über „bundestag"/„deutschen" — alt 14, neu 2. Das
  ist **der Zweck der Reparatur**, kein Verlust.
- **23** liegen in unauffälligen Vorgängen. Von Hand durchgesehen:
  - **Richtig abgelehnt** (verschiedene Sachverhalte, die ein Wort teilen):
    `vg-verfassung` (AfD-Debatte **vs.** Verfassungsreform im Senegal) ·
    `vg-sozialausschuss` (Kreistag Unterallgäu **vs.** Kreistag Ostallgäu) ·
    `vg-staatssekretärin` (Tschan bei G7 **vs.** Griese trifft Korea) ·
    `vg-kandidaten` (Parität in Listen **vs.** Rückzug eines SPD-Kandidaten) ·
    `vg-nussbaum`, `vg-mitreden`, `vg-arbeitsrecht`, `vg-sozialausgaben`.
  - **Plausibel richtige Zuordnungen, die verloren gingen** — etwa **10 bis 12**,
    also rund **0,4–0,5 %** aller geprüften Zuordnungen. Darunter vier
    Bürgergeld-Meldungen (gemeinsam nur „bürgergeld", 10 Zeichen → Gewicht 1),
    `vg-koalitionsausschuss` (zwei Meldungen über dieselbe Sitzung) und
    `vg-sicherheitsrat`.

**Bewertung: vertretbar.** Rund 0,4–0,5 % potenziell verlorene richtige Zuordnungen
stehen gegen eine Fehlerklasse, die 19 Dokumente in einen fachfremden Vorgang geschoben
und dadurch **null** Knowledge Objects zu einem tödlichen Anschlag erzeugt hat. Die
verlorenen Dokumente **verschwinden nicht** — sie bilden einen eigenen Vorgang und bleiben
sichtbar und nachholbar.

**Geprüfte und verworfene Abschwächung:** `STRONG_ANCHOR_LEN` von 12 auf 10 zu senken
würde die vier Bürgergeld-Fälle zurückholen — aber auch „verfassung" (10 Zeichen) allein
ausreichen lassen und damit die Zusammenführung von AfD-Debatte und Senegal-Verfassungs-
reform **wiederherstellen**. Der Tausch ist schlecht und wurde nicht gemacht.

### 16.9 Ehrliche Grenze der Production-Gegenprobe

**Die exakte Konstellation aus §15.5 ist heute nicht mehr reproduzierbar**, und das wird
hier ausdrücklich gesagt statt kaschiert. Gegen die aktuellen Daten gemessen:

- `vg-angriffen` steht wieder bei **1 Dokument** (der Rückweg aus §15.9 hat gewirkt).
- Die 33 heute vorhandenen CSD-Rohdokumente ergeben **einen** Cluster mit dem Kern
  `["berlin","berliner","csd"]` — die Familie „angriff" erreicht die Hälfte-Schwelle
  **nicht** mehr, weil die späteren Meldungen von „Anschlag" sprechen.
- Folge: **beide** Regelfassungen lehnen heute ab. Auch dokumentweise geprüft: 0 von 33.
- Über den gesamten Rohbestand (1 002 Dokumente, 4 Tage) trägt **kein einziges** Dokument
  zwei Formen derselben generischen Familie — die Bedingung entsteht erst auf
  **Cluster**ebene, und alle Kurzfassungen sind leer.

Der Nachweis „reproduzierbar rot, nach dem Fix grün" ruht deshalb auf den in §15.5
**dokumentierten echten Kernen**, die in `scripts/vorgangs-beweisfamilien-test.js` §1
nachgebaut sind. Dass diese Nachbildung scharf ist, wurde **mutationsgeprüft**: fünf
einzelne Rücknahmen des Fixes machen die Suite jeweils rot (§16.10).

Von 177 Vorgängen mit ≥ 2 Dokumenten trägt heute noch **einer** einen Kern mit zwei Formen
derselben generischen Familie (`vg-sozialabbau`: „demonstranten"/„demonstrieren").

### 16.10 Tests

| Suite | Ergebnis |
|---|---|
| `vorgangs-beweisfamilien-test.js` (neu) | **103** Assertions |
| `vorgangs-uebernahme-analyse-test.js` (neu) | **35** Assertions |
| `nachhol-schreibgate-test.js` (neu) | **52** Assertions |
| `vorgangs-resolver-test.js` (aus #145) | 54 — unverändert grün |
| `vorgangsidentitaet-test.js` | 67 — unverändert grün |
| `vorgangs-lebenszyklus-test.js` | 81 — unverändert grün |
| `vorgangsbildung-verlust-test.js` (CSD-Regression) | unverändert grün |
| **Offline-Suite gesamt** | **166/166** (Baseline 163 + 3 neue) |
| **Browser-/Mobile-Smoke** | **32/32** |

**Mutationsproben** — jede einzelne Rücknahme des Fixes macht die neue Suite rot:

| Mutation | Ergebnis |
|---|---|
| Rohgewicht statt Familiengewicht (der Originaldefekt) | **rot** |
| Familie „angriff" nicht mehr generisch | **rot** (8 Assertions) |
| Ein-Dokument-Regel abgeschaltet | **rot** (2 Assertions) |
| Familiengruppierung abgeschaltet | **rot** (13 Assertions) |
| Riegel „spezifische Familie nötig" entfernt | **rot** (4 Assertions) |

Eine sechste Probe (`o.spezifisch` statt `o.spezifischeFamilien`) blieb grün. Sie ist
**logisch äquivalent** — ein spezifischer Rohtreffer impliziert immer eine spezifische
Familie und umgekehrt; über 100 Wortpaare gegengeprüft, 0 Abweichungen. Kein Defekt,
sondern eine Mutation ohne Bedeutungsunterschied.

### 16.11 Was für den nächsten CSD-Nachweis gilt

Die Reihenfolge aus §15.10 bleibt, drei ihrer fünf Punkte sind jetzt erledigt.

| # | Schritt | Stand |
|---|---|---|
| 1 | Resolver-Defekt B4-3 beheben | **erledigt** (§16.1–§16.5) |
| 2 | `--ids` vor der Mengenkappung | **erledigt** (§16.7) |
| 3 | `HELMUT_STORAGE_BACKEND=supabase` erzwingen | **erledigt als Gate** (§16.7); der **Wert** muss weiterhin vom Betreiber in den Environment-Einstellungen gesetzt werden |
| 4 | Merge + Deployment dieses PR | **offen, freigabepflichtig** |
| 5 | CSD-Nachweis erneut ansetzen | **offen** |

**Exakte Schritte für den erneuten Nachweis** (erst nach Merge- und Deployment-Freigabe):

1. Deployten Commit prüfen: er muss diesen PR enthalten.
2. `HELMUT_STORAGE_BACKEND=supabase`, `HELMUT_V3_STORE=1`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` in den **Environment-Einstellungen** setzen (nie im Chat,
   nie im Commit). Das Gate bricht sonst **vor** dem ersten Schreibzugriff ab.
3. Ausgangszustand messen und festhalten: `knowledge_objects`, `ko_document_links`,
   `status='pending'`, LLM-Tagesbudget, `vorgang_id like 'vg-csd%'`.
4. `node scripts/vorgangs-magnet-analyse.js --alle` **vorher** laufen lassen und die
   Zahlen (Magnete · Übernahmen · gespalten) festhalten.
5. **Vorschau** mit den namentlich genannten Kennungen fahren. Die Ausgabe listet jetzt
   **jede** Kennung, die geschrieben würde — diese Liste gegen die angeforderte prüfen.
6. Erst dann `--ausfuehren` mit `HELMUT_NACHHOLEN_BESTAETIGT=ja`.
7. Nachher-Zustand messen. **Neu belastbar:** `updated_at > T0` findet jetzt jede
   inhaltlich veränderte Zeile — damit ist „keine unbeteiligten Datensätze verändert"
   erstmals direkt prüfbar statt nur über Zählerabgleich.
8. Magnet-Analyse **erneut** laufen lassen. Abbruchkriterium: eine **neue** Übernahme
   oder ein neuer Magnet.
9. `telemetrie.resolver` des Laufs auswerten: geprüfte Kandidaten, Ablehnungen, Gründe.

**Abbruchkriterien:** eine neue Übernahme oder ein neuer Magnet · ein Vorgang mit
`vorgang_id`, der nicht zum CSD gehört, wächst · `updated_at` zeigt Änderungen an Zeilen
außerhalb der erwarteten Menge · LLM-Budget erreicht 100/100.

---

## 17 · NEUER BEFUND B4-4 — der **Herausgebername** stiftet Vorgangsidentität (2026-07-27)

> **Status:** im Code behoben und offline belegt · **keine** Production-Mutation ·
> Branch `claude/b4-4-publisher-identity-hotfix-k03z30`.
> Der Befund entstand beim Abschlusslauf zu B4-3; Production ist zu diesem Zeitpunkt
> bereits vollständig zurückgerollt (Nettowirkung 0, §15.9).

### 17.1 Der Fehler in einem Satz

Das Dokument **„Kai Wegner zu queeren Rechten … - Tagesspiegel"** wurde einem fachfremden
Vorgang zugeschlagen, weil `tagesspiegel` als ganz normaler Anker galt — und mit
13 Zeichen über `STRONG_ANCHOR_LEN` sogar als **starker** Beleg (Gewicht 2). Damit war
`MIN_BEWEISGEWICHT=2` **allein durch den gemeinsamen Herausgeber** erfüllt: der
Zielvorgang enthielt bereits mehrere Tagesspiegel-Artikel.

**Zwei Texte wurden zu einem Vorgang, weil sie in derselben Zeitung standen.**

### 17.2 Wie der Name überhaupt in die Anker kommt — der vollständige Weg

| Station | Was passiert | Trägt sie den Herausgebernamen in die Identität? |
|---|---|---|
| Google-News-RSS | Titel hat die Form `<Schlagzeile> - <Herausgeber>` | **ja** — der Suffix steht im Titeltext |
| `parseRssItems` (`crawler.js`) | liest `<title>` und `<source>` getrennt | nein (Parser ist korrekt) |
| `normalizeRawItem` | speichert `title` **unverändert**, `source_name` aus `<source>` | **ja**, über `title` |
| `raw_documents.summary` | bei Google-News-Feeds fast immer leer (gemessen: 8 von 1 000 gefüllt) | praktisch nein |
| `raw_documents.url` / `canonical_url` | Anker werden **nie** aus URLs gebildet — geprüft | nein |
| `docAnchors()` | `anchorTokens(title + summary)` | **ja — hier entstand der Defekt** |
| `matchStaerke()` | exakter Treffer ≥ 12 Zeichen → Gewicht 2; exakte Abkürzung 3–4 Zeichen → Gewicht 2 | **ja, zweiter Weg** |
| `topicRoots()` / `deriveVorgangId()` | wählt den häufigsten nicht-generischen Ankerstamm | **ja, dritter Weg** — daher `vg-tagesspiegel-…`, `vg-zeitung-…` |
| `sameVorgang()` | vergleicht Kern gegen Kern | erbt den Defekt aus `docAnchors` |

**Der zweite Weg ist der unauffälligere.** `isAcronym()` erkennt 3–6 Zeichen mit ≥ 2
Großbuchstaben als Abkürzung. `DIE ZEIT`, `WELT`, `BILD`, `FAZ` erfüllen das — und eine
exakt gleiche Abkürzung galt als **starker** Beleg. Sogar der Artikel **„DIE"** wurde so
zu einem starken Identitätsanker: der Kern des Production-Vorgangs
`vg-zeit-20260311-030001` (26 Dokumente) lautet `["bundesregierung", "die", "zeit"]`.

### 17.3 Die Lösung — zwei unabhängige Riegel, neues Modul `lib/helmut/herausgeber.js`

**Leitgedanke:** *Ein Herausgebername in Herausgeberposition beschreibt die **Herkunft**,
nicht das Ereignis.* Jedes Dokument desselben Feeds trägt ihn — er kann strukturell
nichts unterscheiden und darf deshalb nie Identität stiften.

**Riegel 1 — strukturell, ohne jede Wortliste.** Der Titel wird vor der Ankerbildung um
seinen **belegten** Herausgebersuffix gekürzt. „Belegt" heißt: das letzte Segment deckt
sich mit den Herausgeberangaben **desselben Dokuments** oder ist strukturell als
Herausgeberbezeichnung erkennbar. Sechs Belegarten, jede einzeln benannt und in der
Entscheidungsspur sichtbar:

| Belegart | Beispiel | Production-Häufigkeit (1 000 Dokumente) |
|---|---|---|
| `quellenname` | `… - IG Metall` bei `source_name = "IG Metall"` | 262 |
| `host` | `… - Tagesspiegel` bei `tagesspiegel.de` | 147 |
| `domainform` | `… - SZ.de`, `… - Vietnam.vn` | 118 |
| `gattung` | `… - Frankfurter Rundschau` (≤ 3 Wörter) | 47 |
| `medienname` | `… - DER SPIEGEL` | 37 |
| `quellenname-teil` | `… - Tagesschau` bei `source_name = "Tagesschau Politik"` | 20 |
| `titel-ist-herausgeber` | `CDU/CSU-Fraktion … - CDU/CSU-Fraktion …` | 2 |

Dieser Riegel wirkt auch für Herausgeber, die in **keiner** Liste stehen — belegt gegen
`Vietnam.vn`, `Hasepost`, `Sozialverband VdK Nord e.V.`, `bundesregierung.de`.

**Riegel 2 — aufgezählt.** Bekannte Medien-, Agentur- und Plattformnamen sowie die
Gattungswörter des Verlagswesens (`Zeitung`, `Rundschau`, `Redaktion`, `Morgenpost` …)
gelten **überall** als nicht-spezifisch: auch mitten im Text, auch in einer
KI-formulierten Überschrift, auch in Abkürzungsschreibweise. Wirkung an genau einer
Stelle im Code (`istGenerisch`): 0 Beitrag zum geforderten Beweisgewicht, keine
Themenwurzel einer Kennung, keine Bezugsgröße im Kernvergleich.

**Nachtrag aus der Production-Analyse:** kurze Funktionswörter (`die`, `der`, `das`,
`und`, `für`, `mit` …) sind jetzt ebenfalls generisch. Sie kamen ausschließlich über die
Abkürzungsregel in die Ankermenge — und zwar aus Zeitungsnamen.

### 17.4 Verworfene Alternativen (damit sie nicht erneut probiert werden)

- **„Das letzte Segment nach ` - ` immer abschneiden."** **Gemessen falsch:** 613 von
  1 000 Production-Titeln haben so ein Segment, aber viele davon sind der **echte
  Schlagzeilenrumpf hinter einer Dachzeile** — etwa „Nach Angriff auf CSD in Berlin -
  Neuköllns Integrationsbeauftragte fordert entschlosseneres Vorgehen". Blindes
  Abschneiden hätte hier den gesamten Sachgehalt gelöscht.
- **„Alle Tokens des Quellennamens aus den Ankern entfernen."** Überschießend: die Quelle
  „Deutscher Bundestag" nähme jedem ihrer Dokumente den Anker `bundestag` — auch wenn er
  inhaltlich in der Schlagzeile steht. Dokumente derselben Sache hätten je nach Herkunft
  verschiedene Ankermengen, echte Zusammenführungen zerfielen. Entfernt wird deshalb
  **nur, was in Herausgeberposition steht**.
- **„Sperrliste von Domains."** Deckt nur die bekannten Häuser ab und veraltet still.
- **`if wort == "tagesspiegel"`.** Löst genau einen Fall und keine Fehlerklasse.

### 17.5 Bewusste Grenze, ehrlich benannt

Ein Artikel, der **tatsächlich von einem Medienhaus handelt** („Tagesspiegel-Redaktion
streikt"), verliert diesen Namen als Identitätsbeleg. Das ist die richtige Richtung des
Fehlers: der Vorgang entsteht dann über die übrigen Sachanker oder eben getrennt — er
entsteht nie **falsch vereinigt**.

Die Liste ist deshalb **zweigeteilt**. Immer wirksam sind nur Namen, bei denen die
Herausgeberlesart in politischer Berichterstattung eindeutig dominiert — dazu gehören
bewusst auch `Spiegel`, `Focus`, `Stern` und `Merkur`; der Preis ist, dass diese Wörter
in ihrer seltenen Sachbedeutung keine Zusammenführung mehr allein tragen können.
Mehrdeutige Titelnamen (`Blick`, `Krone`, `Standard`, `Post`, `Bote`, `Echo`, `Express`,
`Kurier`, `Heute`, `Morgen`) stehen dagegen **nicht** in der immer wirksamen Liste: sie
dürfen einen Suffix *bestätigen*, verlieren mitten im Text aber ihren Sachgehalt nicht.

`zeit`, `welt` und `bild` stehen in der immer wirksamen Liste, **kosten dort aber
nichts**: mit vier Zeichen liegen sie unter `ANCHOR_MIN_LEN` und können in
Kleinschreibung strukturell gar kein Anker werden. Sie erscheinen ausschließlich in
Großschreibung — also als Zeitungsname.

### 17.6 Read-only Production-Analyse (`scripts/herausgeber-identitaet-analyse.js`)

Ausschließlich lesend, kein KI-Aufruf, keine Kosten, keine Mutation. Gemessen am
2026-07-27 gegen den Production-Bestand.

| Frage | Messwert |
|---|---|
| **F1** Vorgangskennungen mit Herausgeber-Themenwurzel | **20 von 1 140 (1,8 %)** — u. a. `tagesschau` (5), `zeit` (2), `tagesspiegel` (2), `handelsblatt` (2), `zeitung`, `morgenpost`, `anzeiger` |
| **F2** Rohdokumente (14 Tage) mit Herausgebername unter den Ankern | **524 von 1 000 (52,4 %)** |
| **F2** Rohdokumente mit belegtem Herausgebersuffix | **615 von 1 000** |
| **F2** häufigste dadurch entfernte Anker | `deutscher` 32 · `bundestag` 31 · `die` 26 · `faz` 26 · `zeit` 25 · `zeitung` 22 · `handelsblatt` 21 · `rundschau` 20 |
| **F3** Vorgänge (≥ 2 Dokumente) geprüft | **206** |
| **F3** davon mit Herausgebername im spezifischen Kern | **130 (63 %)** |
| **F3** davon **nur** durch Herausgebernamen zusammengehalten | **8** |
| **F3** davon ohne jeden Sachkern nach der Kürzung | **7** — sie können strukturell nichts mehr anziehen |
| **F4** geprüfte Dokument-zu-Vorgang-Zuordnungen | **3 005** |
| **F4** heute nicht mehr getragen | **189 (6,3 %)** |
| **F4** davon **allein** durch den Herausgebernamen belegt | **172 (5,7 % aller Zuordnungen, 91 % der Änderungen)** |
| **F4** neu getragen (vorher abgelehnt) | **8** |

**Antwort auf die Frage „sind bestehende Vorgänge durch Mediennamen entstanden?" — ja,
belegbar.** Die zwei größten Fälle:

| Vorgang | Dokumente | spezifischer Kern (alt) | Inhalt |
|---|---|---|---|
| `vg-bundesregierung-20260128-43922a` | **52** | `["bundesregierung"]` | Krankenversicherung, Asylsystem, Haushalt 2027, Tourismusstrategie, Kindergeld, BAföG, Wohngeld, Stromversorgung — alle aus `bundesregierung.de` |
| `vg-bundesregierung-20260527-43922a` | **48** | `["bundesregierung"]` | dieselbe Bauart |
| `vg-zeit-20260311-030001` | **26** | `["bundesregierung", "die", "zeit"]` | Kern **vollständig** aus Herausgeber- und Funktionswörtern |
| `vg-bundestag-20200703-29b3ce` | **20** | `["bundestag", "deutscher"]` | Kern neu: **leer** |
| `vg-sozialverband-20260506-24e5f7` | **12** | `["sozialverband", "vdk"]` | Kern neu: **leer** |

**Einzelprüfung der 17 Zuordnungen, die *nicht* allein am Herausgebernamen hingen**
(6 von 17 im Detail nachgesehen): 5 sind **korrekte Trennungen** — darunter ein Vorgang,
dessen Bestandskern `["asteroiden", "chinesische", "raumfahrt", "sonde", "tianwen"]`
lautet und der Mutterschutzmeldungen aufnahm, sowie ein Vorgang, der den türkischen
Außenminister mit der Schuldenbremse verband. **Ein** Fall ist eine plausibel richtige,
jetzt verlorene Zuordnung: `vg-koalition-20251128-09e59e` — „Koalition ringt um
Kompromiss bei Rente" hängt nur noch an `koalition` (Gewicht 1), weil `rente` und
`rentenpaket` die Präfixgrenze reißen. Der ehrliche Preis liegt damit zwischen
**1 von 3 005 (0,03 %)** — belegt nachgeprüft — und **17 von 3 005 (0,57 %)**, wenn man
alle nicht einzeln geprüften Fälle als Verlust rechnet.

**Nicht bereinigt:** die 8 durch Herausgebernamen zusammengehaltenen Bestandsvorgänge
bleiben unverändert. Ihre Bereinigung wäre ein Production-Schreibzugriff mit KI-Kosten
und braucht eine eigene Freigabe. Die neue Regel verhindert nur, dass sie **weiter
wachsen** — sieben von ihnen haben nach der Kürzung keinen Sachkern mehr und nehmen
damit strukturell nichts mehr auf.

### 17.7 Tests

| Suite | Ergebnis |
|---|---|
| `herausgeber-identitaet-test.js` (**neu**) | **109/109** Assertions |
| `vorgangsidentitaet-test.js` | 67/67 (unverändert) |
| `vorgangs-beweisfamilien-test.js` (B4-3) | 103/103 (unverändert) |
| `vorgangs-resolver-test.js` (B4-2) | 54/54 (unverändert) |
| `vorgangs-uebernahme-analyse-test.js` | 35/35 (unverändert) |
| `vorgangsbildung-verlust-test.js` (CSD-Regression) | grün (unverändert) |
| **Offline-Suite gesamt** | **167/167** (Baseline 166 + 1 neue) |
| **Browser-/Mobile-Smoke** | **32/32** |

Die neue Suite deckt die im Auftrag geforderten Fälle einzeln ab: Tagesspiegel · Spiegel ·
ZEIT · Welt · Focus · taz · Bild · FAZ · SZ · Handelsblatt · MDR · NDR · WDR · BR · rbb ·
dpa · Reuters · AP · AFP · Euronews · Politico · Correctiv · Google-News-Suffix eines
**unbekannten** Herausgebers · mehrere Artikel desselben Mediums · mehrere Medien über
dasselbe Ereignis · gleiches Thema trotz verschiedener Medien · verschiedene Themen trotz
gleichen Mediums.

### 17.8 Mutationsprobe (`scripts/herausgeber-mutationsprobe.js`)

Wiederholbar statt einmalig: das Werkzeug legt für jede Mutation einen temporären Abzug
von `lib/` an, mutiert **nur dort** und führt die Suite aus. Die Arbeitskopie des Repos
wird nie verändert.

| Mutation | Ergebnis |
|---|---|
| M1 · Titelsuffix nicht mehr abschneiden (der Originaldefekt) | **rot** (26 Assertions) |
| M2 · Mediennamen wieder als spezifisch werten | **rot** (27) |
| M3 · Gattungswörter des Verlagswesens nicht mehr erkennen | **rot** (3) |
| M4 · Suffixbeleg über den Quellennamen abschalten | **rot** (4) |
| M5 · Domainform im Suffix nicht mehr als Beleg zählen | **rot** (2) |
| M6 · Wortgrenze des schwächsten Suffixbelegs aufheben | **rot** (2) |
| M7 · Längenschranke beim Teilnamen aufheben | **rot** (1) |

**7 von 7 erkannt.** M6 und M7 wurden **erst durch die Probe abgesichert**: M6 überlebte
im ersten Durchgang, weil die Suite keine Dachzeile mit vier bis sechs Wörtern und einem
Verlagswort kannte. Der Test wurde ergänzt, nicht die Mutation entfernt.

### 17.9 Zwei Defekte, die der Test selbst gefunden hat

1. **Zweistellige Quellenkürzel belegten jeden Suffix.** `source_name = "FR"` steckt als
   Buchstabenfolge in `frankfurterrundschau` — die Teilnamensregel hätte damit jede
   Kürzung „belegt". Behoben: **beide** Seiten brauchen ≥ 4 Zeichen (M7 sichert das ab).
2. **Titel, die nur aus dem Herausgebernamen bestehen**, behielten Anker. In Production
   real vorhanden. Behoben: bleibt nach der Kürzung genau der Quellenname stehen, ist der
   Rumpf leer — das Dokument bekommt keine Anker und kann sich an keinen fremden Vorgang
   anhängen (fail closed).

### 17.10 Was dieser Sprint bewusst **nicht** getan hat

- **Keine** Production-Mutation, **keine** Migration, **kein** Flag verändert, **kein**
  Deployment, **kein** Merge, **kein** Nachhollauf.
- **Keine** Bereinigung der 8 herausgebergetragenen Bestandsvorgänge (eigene Freigabe).
- **Keine** Änderung an gespeicherten Titeln. Die Kürzung wirkt ausschließlich in der
  Ankerbildung; Anzeige, Briefing und Beleglinks bleiben unverändert.
- **Kein** Stemmer und keine allgemeine Wortartlogik — dieselbe Entscheidung wie bei
  B4-3 (§16.1).

---

## 18 · B4-4 in Production nachgewiesen — die zwei verbliebenen CSD-Dokumente (2026-07-27, 12:15 UTC)

> **Sprintzustand: teilweise abgeschlossen.** Der **B4-4-Nachweis selbst ist erbracht** —
> der Herausgebername erzeugt in Production keine Vorgangsidentität mehr. Unvollständig
> ist die Verarbeitung: eines der beiden Dokumente lief in einen Azure-Zeitüberlauf und
> steht klassifiziert auf `fehlgeschlagen` (verknüpft, wiedervorlagefähig).
> **Kein Rückweg nötig** — kein Abbruchkriterium ist eingetreten.

### 18.1 Deployment-Nachweis (Phase 1, lesend)

| Prüfung | Beleg |
|---|---|
| PR #149 in `main` gemergt | Merge-Commit **`ad0cf999667a59661cbc7e56c62086b7ecad0844`** |
| Production läuft auf diesem Commit | Vercel `dpl_8oC6U67Kvx8UxwZrHBDR3CMASp5t`, `target: production`, `githubCommitSha: ad0cf999…`, `githubCommitRef: main` |
| Deployment-Zustand | **`READY`**, erstellt 2026-07-27 **12:03:43 UTC** |
| Pflicht-CI-Checks für diesen Commit | Run 30264349009 — `Syntax + Offline-Suiten` **success**, `Browser-/Mobile-Smoke (Chromium)` **success** |
| B4-4-Code im deployten Baum | `git ls-tree ad0cf99` führt `lib/helmut/herausgeber.js` (Blob `268aa80c`, 354 Zeilen) und `lib/helmut/vorgang-identity.js` (Blob `028e8b99`) mit den drei Wirkstellen: Zeile 49 `require("./herausgeber")`, 287 `istHerausgeberAnker(a)`, 348 `titelRumpf(doc)` |
| Arbeitskopie = deployter Stand | lokaler `HEAD` = `ad0cf99`, Arbeitsbaum sauber |

**Grenze, ehrlich benannt:** die deployte Anwendung konnte **nicht** direkt abgefragt
werden — die Egress-Regel dieser Sitzung verweigert `helmut-pilot.vercel.app`
(`403 zu CONNECT`). Der Nachweis läuft deshalb über die Vercel-Deployment-Metadaten
(Commit-SHA + `READY` + `target: production`) und den Git-Baum dieses Commits, nicht über
die ausgelieferte Asset-Version.

### 18.2 Sicherheitsgates unmittelbar vor dem Lauf (Phase 2)

| # | Prüfung | Ergebnis |
|---|---|---|
| 1 | `HELMUT_STORAGE_BACKEND` | `supabase` |
| 2 | `HELMUT_V3_STORE` | `1` |
| 3 | `pruefeSchreibgate()` | **`ok: true`** (Fachtabellen und Betriebsdaten beide auf Production, 0 Fehler) |
| 4 | Azure-Konfiguration | `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_KEY` gesetzt |
| 5 | `isAiEnabled()` | **`true`**, Modell `gpt-5-mini` |
| 6 | aktive `pipeline_locks` | **0** |
| 7 | paralleler Lauf | keiner — letztes Rohdokument 10:03:19, letzte KO-Änderung 10:48:09, nächster Cron 16:00 UTC |
| 8 | beide Ziel-IDs vorhanden | ja |
| 9 | bestehende `ko_document_links` je Ziel-ID | **0** |
| 10 | Endzustand je Ziel-ID | beide **`ohne-endzustand`** |
| 11 | `vg-csd-20260727-12aae0` | 27 Dokumente, `neu`/`complete`, „Anschlag auf CSD in Berlin mit Todesopfer und mehreren Verletzten" |
| 12 | `vg-tagesspiegel-20260519-f29ebd` | 2 Dokumente, `pending`/`pending`, Inhalt leer — der zurückgerollte Ausgangszustand |
| 13 | `vg-angriffen` | 1 Dokument, `ko_version 1`, `updated_at 2026-07-23` — unverändert |
| 14 | Tagesbudget | `llm_budget_counters` global **52** verbraucht |

**Zum Sitzungs-Schutzlimit:** `HELMUT_MAX_LLM_CALLS_PER_DAY` ist in dieser Sitzung nicht
gesetzt, `llmDailyCallLimit()` fällt deshalb auf das Schutzlimit **50** zurück. Bei 52
verbrauchten Aufrufen hätte `reserveLlmCall()` den Lauf sofort mit `skipped-budget`
abgewiesen — derselbe Riegel, an dem Anlauf 3 die zwei Dokumente liegen ließ. Er wurde
**ausschließlich als Präfix an genau diesen einen Befehl** auf `55` gesetzt
(52 + 2 = 54 ≤ 55). **Kein Export, keine Persistenz, keine Vercel-Env-Änderung, kein
Repo-Eintrag.** Das Production-Tagesbudget (100) und die Reserve blieben unangetastet.

### 18.3 Trockenlauf des Resolvers gegen die echten Daten (read-only, vor dem Lauf)

`resolveVorgang()` mit den echten Lese-Deps, ohne KI und ohne Write:

```
rd-8c977d6b13f…  "Kai Wegner zu queeren Rechten im Grundgesetz … - Tagesspiegel"
  entfernt: ["Tagesspiegel"]   Beleg: host   (source_name ist NULL, url = tagesspiegel.de)
  Anker:    ["wegner","queeren","rechten","grundgesetz","bundestag","gerade","diesen",
             "zeiten","klares","bekenntnis","abgeben"]
  Kandidatenpraefixe: ["vg-grundgesetz","vg-bekenntnis","vg-bundestag"]
  8 Kandidaten geprueft, alle abgelehnt  ->  resolution "neu"
```

**Das ist der Kern des Nachweises.** Vor B4-4 lautete die Themenwurzel dieses Dokuments
`tagesspiegel`; der Fremdvorgang `vg-tagesspiegel-20260519-f29ebd` wurde damit überhaupt
erst als Kandidat geladen und dann über `gewichtSpezifisch 2` angenommen. Jetzt taucht
das Präfix `vg-tagesspiegel` **gar nicht mehr in der Kandidatensuche auf** — der Fehler
ist eine Stufe vor dem Beweisvergleich abgeschnitten.

Bemerkenswert: `source_name` ist bei **beiden** Zieldokumenten `NULL`. Der stärkste
Suffixbeleg (`quellenname`) stand also nicht zur Verfügung; getragen hat der
**strukturelle Host-Vergleich**. Genau dafür ist die Belegart `host` da.

### 18.4 Vorschau (Phase 3)

`--ids=<zwei vollständige Kennungen> --karenz=0 --tage=7 --vorschau`

| Prüfung | Ergebnis |
|---|---|
| ausgewählte IDs | **exakt 2** |
| unbekannte IDs | 0 |
| Dubletten | 0 |
| fremde IDs | 0 |
| Mengenkappung | ohne Wirkung auf die Zielmenge (`--ids` greift vor der Kappung; 1 560 Kandidaten im Fenster, `--max=200`, ausgewählt 2) |
| KI-Aufruf | keiner |
| Schreibzugriff | keiner |

Ohne `--karenz=0` wären beide Dokumente durch die 24-Stunden-Karenz blockiert gewesen
(sie sind 16 bzw. 20 Stunden alt). Die Option wirkt ausschließlich in diesem Werkzeug.

### 18.5 Der Lauf (Phase 4)

`runId` **`nachhol-20260727121511`**, 12:15:11–12:15:52 UTC, Dauer **39 s**.

```
Schreibgate: Fachtabellen und Betriebsdaten beide auf Production (Backend supabase).
[understanding-gate:shadow] {"cluster":2,"entscheidungen":{"verstehen":1,"parken":1},"blockiert":0}
[understanding] skipped-error: vg-grundgesetz-20260725-15b616 OpenAI request timeout
Ergebnis: cluster 2 · verarbeitet 2 · zurueckgestellt 0 · vorgemerkt 0
          ergebnisse {"saved":1,"skipped-error":1} · aufloesungen {"neu":2}
```

**Beide Cluster wurden als `neu` aufgelöst** — kein einziger Bestandsvorgang wurde
angenommen.

### 18.6 Zielzustand je Dokument

| Rohdokument | Zielvorgang | Zustand | Warum fachlich passend |
|---|---|---|---|
| `rd-8c977d6b…` „Kai Wegner zu queeren Rechten im Grundgesetz …" | **`vg-grundgesetz-20260725-15b616`** (neu) | `pending`/`failed`, 1 Dokument, 1 Verknüpfung | Eigener Vorgang zur Debatte um eine **Grundgesetzergänzung** — das Thema des Textes. Der Bezug zum Berliner Anschlag ist politisch vorhanden, im Text aber nicht als Anker belegt |
| `rd-d982a68f…` „Reaktionen auf Anschlag - Härtere Gangart gegen Islamisten gefordert" | **`vg-islamisten-20260726-0ab9e8`** (neu) | `neu`/`complete`, 1 Dokument, 1 Verknüpfung | Eigener Vorgang zur **innenpolitischen Reaktion**; die KI-Fassung trifft den Text („Nach einem Anschlag fordern mehrere Stimmen eine härtere Gangart gegen islamistische Strukturen in Deutschland.") |

**Ehrliche Einordnung der Trennung:** beide Dokumente hätten thematisch an den
CSD-Vorgang angeschlossen werden können — der Auftrag lässt eine getrennte Zuordnung
ausdrücklich zu, wenn es verschiedene politische Vorgänge sind. Der Resolver konnte den
Bezug gar nicht herstellen: der Titel des Deutschlandfunk-Beitrags nennt weder „CSD" noch
„Berlin", seine Kurzfassung ist leer. Das ist die richtige Fehlerrichtung — **getrennt
statt falsch vereinigt**. Ein Duplikat des CSD-Vorgangs ist keiner der beiden: dieser
trägt 27 Dokumente zum Anschlag selbst.

### 18.7 Vorher/Nachher — vollständig gegengemessen

| Größe | vorher (12:14 UTC) | nachher (12:16 UTC) | Δ |
|---|---|---|---|
| `knowledge_objects` | 1 140 | **1 142** | +2 (genau die zwei neuen Vorgänge) |
| `ko_document_links` | 4 141 | **4 143** | +2 (genau die zwei Zieldokumente) |
| `status='pending'` | 426 | **427** | +1 (der geparkte Grundgesetz-Vorgang) |
| `status='failed-final'` | 0 | **0** | 0 |
| `raw_documents` | 8 929 | 8 929 | 0 |
| aktive `pipeline_locks` | 0 | **0** | 0 |
| LLM-Zähler (global, Tag) | 52 | **54** | **+2** |
| **`vg-csd-20260727-12aae0`** | 27 Dok., `neu`/`complete`, `updated_at 10:29:28` | **27 Dok., unverändert, `updated_at 10:29:28`** | **0** |
| **`vg-tagesspiegel-20260519-f29ebd`** | 2 Dok., `pending`/`pending`, Inhalt leer, `updated_at 10:48:09` | **2 Dok., unverändert, `updated_at 10:48:09`** | **0** |
| **`vg-angriffen`** | 1 Dok., `updated_at 2026-07-23` | **1 Dok., unverändert** | **0** |

**Veränderungen außerhalb der Zielmenge: keine.** Gegengeprüft über Zeitfenster:
seit 12:14 UTC **2** neue Knowledge Objects, **2** geänderte (dieselben zwei), **2** neue
Verknüpfungen, **0** neue Rohdokumente, **0** neue Telemetriezeilen.

**Magnet-Analyse als Gegenprobe** (read-only, nach dem Lauf): `vg-csd-20260727-12aae0`
steht bei **Kohärenz 0,96** mit 4 Kernankern und Befund `-` (unauffällig). Die beiden
neuen Vorgänge tragen je 1 Dokument und erscheinen nicht in der Auswertung (Schwelle
≥ 6 Dokumente). Die im Bestand ausgewiesenen 39 Magnete und 19 Übernahmen sind der
**bekannte Altbestand** — von diesem Lauf ist keiner gewachsen und keiner entstanden.

### 18.8 Abnahme gegen die zwölf Erfolgskriterien

| # | Kriterium | Ergebnis |
|---|---|---|
| 1 | exakt die zwei Ziel-IDs verarbeitet | **erfüllt** |
| 2 | beide erhalten einen gültigen Endzustand | **teilweise** — beide haben `ohne-endzustand` verlassen; `rd-d982a68f…` ist verstanden, `rd-8c977d6b…` steht klassifiziert auf `fehlgeschlagen` und bleibt Wiedervorlagekandidat |
| 3 | beide verknüpft | **erfüllt** (+2 `ko_document_links`) |
| 4 | keine Zuordnung allein durch Herausgeber-/Plattformnamen | **erfüllt** — beide Auflösungen `neu`, 8 bzw. 0 Kandidaten geprüft, keiner angenommen |
| 5 | Wegner-Dokument **nicht** an `vg-tagesspiegel-20260519-f29ebd` | **erfüllt** — das Präfix erscheint nicht einmal mehr in der Kandidatensuche |
| 6 | Fremdvorgang wächst nicht, wird nicht überschrieben | **erfüllt** — 2 Dokumente, `updated_at` unverändert |
| 7 | `vg-angriffen` unverändert | **erfüllt** |
| 8 | kein fachfremder Vorgang gewachsen | **erfüllt** |
| 9 | nichts außerhalb der Zielmenge verändert | **erfüllt** |
| 10 | kein Duplikat-Vorgang ohne fachliche Rechtfertigung | **erfüllt** (§18.6) |
| 11 | höchstens zwei zusätzliche LLM-Aufrufe | **erfüllt** — exakt 2 (52 → 54) |
| 12 | fachlicher Zielzustand nachvollziehbar | **erfüllt** (§18.6) |

**Abbruchkriterien: keines eingetreten. Kein Rückweg ausgeführt und keiner nötig.**

### 18.9 Was offen bleibt

Das Wegner-Dokument ist **zugeordnet und verknüpft**, sein Vorgang aber inhaltlich leer
(`understanding_status = failed`, Überschrift = Rohtitel). Ursache ist ein
**Azure-Zeitüberlauf**, kein Vorgangsbildungsfehler — die Identitätsentscheidung war
bereits gefallen und ist korrekt. Der Vorgang ist regulärer Wiedervorlagekandidat; das
Nachhol-Werkzeug führt ihn nach dem Lauf als `fehlgeschlagen -> vg-grundgesetz-20260725-15b616`.
Eine Wiedervorlage war in diesem Sprint **nicht erlaubt** (genau ein Lauf) und wurde
deshalb nicht ausgeführt.

### 18.10 Die zwei Werkzeugbefunde

**W-1 · Falsches Grün nach Lesefehler — bestätigt, unverändert vorhanden.**
Auf dem deployten Commit fängt `listRawDocuments` (`storage.js`) jeden Fehler ab, loggt
`[v3Store] listRawDocuments fehlgeschlagen: …` und liefert **`[]`**. Der Aufrufer in
`vorgangsbildung-nachholen.js` unterscheidet „leer" nicht von „Lesefehler" — ein DNS-
oder Netzfehler führt damit zu 0 Kandidaten, der Meldung „Nichts nachzuholen" und
**Exit 0**. In diesem Lauf trat der Fall **nicht** ein (1 560 Kandidaten gelesen); der
Befund ist durch Codeinspektion belegt, nicht durch Beobachtung. Nicht repariert
(auftragsgemäß).

**W-2 · Fehlende Lauftelemetrie — reproduziert und um die Ursache geschärft.**
`processRuns` liegt in der Store-Zeile **`main-auth`** (nicht `main`). Dort stehen
weiterhin **148** Einträge, der jüngste ist `nachhol-20260727102907` mit
`finishedAt 10:29:31`. Gesucht und **nicht gefunden**: `nachhol-20260727121511` (dieser
Lauf) und `nachhol-20260727104750` (der zurückgerollte Restlauf) — beide **0** Treffer,
obwohl beide nach Production geschrieben haben.

Neu und belastbar: `main-auth.updated_at` steht auf **12:15:54**, also **innerhalb**
dieses Laufs. Die Zeile **wurde** geschrieben — der `recordProcessRun`-Eintrag ist darin
nur nicht enthalten. Das ist das Muster eines **Last-Write-Wins-Verlusts** auf dem
zentralen 140-KB-Blob: ein späterer Schreibvorgang desselben Laufs (LLM-Nutzungslog)
überschreibt die Zeile mit einer Kopie, die den kurz zuvor angehängten Lauf nicht kennt.
Der Aufruf ist zusätzlich mit `.catch(() => {})` abgesichert, ein Fehler bliebe also
ohnehin unsichtbar. Damit ist es dasselbe Grundrisiko, das `CURRENT_STATE.md` §7 als
höchstes Einzelrisiko führt. Nicht repariert (auftragsgemäß).

### 18.11 Hinweis zur Dokumentnummerierung

Der offene **PR #148** trägt auf seinem Branch ebenfalls einen Abschnitt **§17** dieser
Datei (Anlauf 3 und der zurückgerollte Restlauf). Auf `main` ist §17 der **B4-4-Hotfix**
aus PR #149. Beim Merge von #148 entsteht daher ein Konflikt in dieser Datei; die beiden
Abschnitte sind inhaltlich verschieden und beide zu erhalten — der ältere gehört vor den
B4-4-Hotfix, dieser Abschnitt bleibt der letzte.
