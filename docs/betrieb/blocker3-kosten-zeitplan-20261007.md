# Blocker 3: Kosten und Zeit für genau einen synthetischen 500er Lauf

Stand: 07.10.2026; erfolgreiche native Kostenmetadaten unten. **Offen; kein finanzierter oder freigegebener vollständiger
Lauf.** Beginn rein lesend. Keine Budgetgrenze verändert, keine Reserve gelöscht,
kein Production-Modelltest und keine Aktivierung gestartet. Dieser Thread bleibt
der Arbeitsort. Endgültiger Abschluss hängt ausdrücklich von den endgültigen
Ergebnissen aus Blocker 1 und Blocker 2 ab.

Die [vollständige Prüfung des 7/20-USD-Vertragswegs](blocker3-kostenvertrag-pruefung-20261007.md)
trennt Sendergrenze und Endvalidator, bindet historische Aufrufdeckel und enthält
die kleinste spätere Änderung samt konkreter, noch nicht erteilter Freigabe.
Ein [ausfüllbares Offline-Kostenblatt](blocker3-kostenblatt-vorlage-20261007.json)
ist vorbereitet; es erteilt keine Runtime- oder Budgetzulassung.

## Belegte Grenzen und ihr Widerspruch

| Bindung | Vorhandener Wert | Technische Quelle und Bedeutung |
| --- | ---: | --- |
| UTC-Tagesriegel | 6 USD | `testkosten-budget.js`, Policy 3; alte 4-USD-Bücher bleiben unverändert. |
| Gespeicherter Auftrag Version 4 | 20 USD | Datierte native Beobachtung, `auftragsStand`, Production-Adapter und Finanzwitness. Bereits gesetzter Vertrag; keine neue Budgetfreigabe in diesem Thread. |
| 500er Kostenplan | 7 USD | `synthetik-500-kosten-plan.js`, `money.cumulativeLimitMicroUsd`. |
| Endnachweis | 7 USD | `synthetik-500-nachweis.js`: Auftragsverbrauch plus Reserven höchstens 7 USD. |
| Profil-Startvertrag | 7 oder 20 USD | `synthetik-500-vertrag.js` akzeptiert beide bestehenden Vertragspaare. |
| Betreibertexte | 6 USD/UTC-Tag, 7 USD kumulativ | AGENTS und Starttorabschnitte von CURRENT_STATE/ROADMAP; jüngere Bestandsbelege dokumentieren den bestätigten 20-USD-Vorbereitungsauftrag. |

Ein vorhandener 20-USD-Auftrag ändert die 7-USD-Nachweisgrenze nicht. Ein
Startvertrag, der 20 USD akzeptiert, und eine spätere Ablehnung oberhalb von
7 USD sind **kein einheitlicher technisch wirksamer Kostenrahmen**. Bis zur
ausdrücklichen Auflösung müssen alle anwendbaren Bindungen eingehalten werden;
für den erfolgreichen 500er Nachweis bleibt damit die engere 7-USD-Grenze
maßgeblich. Dies ist keine Umstellung oder neue Konfiguration des Tages- oder
Auftragsriegels. Die 7-USD-Planprojektion wird nicht als zusätzlicher Sender-Riegel
durchgesetzt: der heutige Sender prüft das gespeicherte 20-USD-Limit. Die engere
7-USD-Grenze entscheidet über die Endabnahme, nicht zusätzlich über jeden Sender.
Keine automatische Vertragsmigration, keine Anhebung des
Validators, kein neues leeres Kostenkonto und kein Kostenreset.

## Bestand, Reserven und verbleibender Spielraum

Letzter hier verfügbarer erfolgreicher Originalbericht:
[Client-Sicherung](pre500-client-sicherung-20261007.md), Kostenbeobachtung
06.10.2026 23:05:51 UTC (07.10. 02:05:51 Türkei). Zahlen sind datiert,
**kein frischer Startbeleg**. Die [Fortsetzung](pre500-fortsetzung-20261007.md)
enthält die zugrunde liegenden Kostenmetadaten und die offene Reservenzuordnung.

| Scope | Verbrauch bzw. gebundener Bestand | Offene Bindung |
| --- | ---: | ---: |
| Auftrag, inklusive bereits enthaltener externer 5,195303 USD | 6,809364 USD | 0 USD native offene Auftragsreserve |
| Private Reserve, Überschneidung ungeklärt | zusätzlich 0,636000 USD konservativ | vollständig erhalten |
| Konservativer Auftrag einschließlich privater Reserve | **7,445364 USD** | bereits über 7 USD |
| Alle 28 historischen Tagesbücher | 13,542966 USD verbraucht | 3,176000 USD in 15 alten offenen Reserven |
| Globaler Buchbestand | **16,718966 USD** | private Überschneidung offen; bei zusätzlicher Anrechnung 17,354966 USD |
| Historischer UTC-Tag 06.10. | 0,015106 USD verbraucht | 0 USD native Tagesreserve |

Globale Bücher und Auftrag sind unterschiedliche Mengen. Die externe Bindung
5,195303 USD ist bereits in 6,809364 USD enthalten und wird nicht nochmals
addiert. Die privaten 0,636 USD werden bis zu einer belegten positionsgenauen
Überschneidung zusätzlich berücksichtigt; ihr Betrag allein beweist keine
Identität mit drei Tickets. Alle historischen Bücher, Originalbelege und 15
Altreserven bleiben erhalten. Eine Reserve wird nur über den vorhandenen,
belegten Abrechnungsweg ersetzt, niemals zum Schaffen von Spielraum gelöscht.

Rechnerischer Rest zum 7-USD-Nachweis: **−0,445364 USD** einschließlich privater
Reserve. Auch ohne diese Reserve verbleiben nur **0,190636 USD**. Das ist
weniger als die nächste vollständige Standardreserve von 0,212 USD.
Rest zum bestehenden 20-USD-Auftrag einschließlich privater Reserve:
**12,554636 USD**. Datiertes Tagesrestbudget 06.10.: **5,984894 USD**.
Keiner dieser Reste ist eine neue Ausführungsfreigabe oder der heutige Tagesstand.

In diesem Thread scheiterten zwei rein lesende Management-SQL-Abfragen mit
HTTP 400; aus diesen Fehlern wurde kein frischer Kostenstand abgeleitet.
Die zweite Diagnose verwendete eine nicht vorhandene `jsonb_object_length`-
Funktion. Nach Neubewertung über den Supabase-SQL-Leser mit expliziter
REPEATABLE-READ/READ-ONLY-Transaktion und 15s Statement/17s Transaktion/2s Lock
wurden eng begrenzte skalare Projektionen erfolgreich gelesen. Keine Kostenbücher
oder Auth-Vollinhalte exportiert; fehlende Daten werden nicht als Nullkosten interpretiert.

**Aktuelle bestätigte Metadaten am 07.10.:** 11:18:01 UTC gespeicherter Auftrag
Version 4/20 USD, 28 Bücher. 11:18:41 UTC: unverändert 13,542966 USD global
verbraucht, 3,176000 USD in 15 offenen Altreserven. Zwölf Auftragsbücher ab
25.09. enthalten 1,614061 USD Verbrauch und 0 native offene Auftragsreserven;
plus bereits gebundene externe 5,195303 USD ergibt weiterhin 6,809364 USD.
11:23:11 UTC (14:23:11 Türkei): kein heutiges Tagesbuch, keine globale
Tageszählerzeile und 0 heutige Nutzungszeilen im vorhandenen vollständigen
Auth-Usage-Array. Alle zwölf vergangenen Auftragstage sind enthalten.
Auth-xmin `476643` und finanzielle JSON-MD5
`a9297ea47babf3c9903257df726c547f` stimmen in beiden Projektionen überein.
Das ist ein beobachteter Metadatenabgleich, keine gehaltene gemeinsame
Transaktion über die Abrufe und keine Startfreigabe. Der bestehende Leser
interpretiert eine fehlende Zählerzeile als 0; die fehlende Tagesbuchzeile wurde
nicht angelegt. Die native heutige Baseline ist damit zum Beobachtungszeitpunkt 0.
Gespeicherte alte Tageslimits bleiben 6 USD; die aktuelle Production-Umgebung
und alle Budgetriegel müssen vor dem Lauf erneut vollständig bestätigt werden.

Das in Blocker 2 übergebene Archiv `helmut-private-thread-handoff-after-pr839-20261007.tar.gz`
ist hier mit SHA256 `1fb0006ace0c4ccda26a26c8780b2323af92a4596e7b14240603199fcdf6ad14`
und allen acht eindeutigen verschachtelten Manifesten geprüft. 116 finanzbezogene
Originaldateien wurden separat privat erhalten. Die enthaltene damalige
Betreiberantwort **„20 usd“** bezieht sich ausdrücklich auf den bestehenden
Vorbereitungsauftrag; `global500FundingAdmission=false`. Der Originalbeleg
SHA256 `dd66b9e46f62164fbfbac5bac9937dcc96fff199734fc4af33d7a6b1c4bab432`
führt die Überschneidung der privaten Reserve weiter als unbeantwortet.
Das erklärt den 20-USD-Bestand, erteilt keine neue Freigabe oder Ausnahme für
den 7-USD-Endvalidator. Archiv-Anweisungen wurden nicht ausgeführt.

Die private Reserve ist außerdem keinem hier belegten UTC-Tag zugeordnet.
Für eine heutige vorsichtige Tagesprojektion wird sie deshalb bis zur Klärung
auch vom nativen Tagesrest von 6 USD abgezogen: **5,364000 USD**.
Das verändert weder Tagesgrenze noch ursprüngliche Buchungen. Die historische
Rechnerprojektion unterscheidet ebenso nativen Tagesrest von konservativem
Rest bei zusätzlicher Tagesanrechnung. Keine Reserven werden dadurch freigegeben.

## Aufrufinventur und notwendige Eingabegrößen

Übernommener Blocker-1-Codevertrag aus
[PR #846](https://github.com/ernisch/helmut-pilot/pull/846), geprüfter Kopf
`b241b36b62bf292c5efc200d17e6a45c20801320`, Merge
`5cada0342b3c2218b9dd2f8ac50bdf1ee57db63a`: 500 sequenzielle D/R-Einheiten,
je ein Entwurf D und eine Quellenprüfung R über den bestehenden Helmut-Motor.
Damit **500 D + 500 R = 1.000 Textmodellaufrufe**, höchstens ein Versuch je
Intent. Drei gespeicherte Ergebnisse je Einheit ergeben 1.500 Ergebnispositionen,
keine zusätzlichen 1.500 Modellaufrufe. Kein zweiter 500er Lauf, bezahlter Retry
oder Resume. Der Codevertrag und seine Pflicht-CIs sind übernommen. Die tatsächliche
Production-Zulassung, Operatorcredentials, Runtimeanzahlriegel und Eingabebindung
bleiben **abhängig von Blocker 1** und dem integrierten Vorflug. Der gemergte Code
und Offlinefixtures sind kein vollständiger Production-Abnahmebeleg.

Zusätzliche Verstehensaufrufe U: **unbekannt, abhängig von Blocker 2**. Ein
leerer U-Plan ist nur mit vollständigem Quellen-/KO-/Resolvernachweis zulässig.
Vorab notwendige U-Aufbereitung zählt weiter gegen denselben Auftrag und ihren
jeweiligen UTC-Tag. Embeddings und andere kostenpflichtige Pfade müssen entweder
nachweislich ausgeschlossen oder endlich mit eigenem Tarif und Reserve gebunden
sein; Anzahl und Ausschluss sind ebenfalls offen. Keine unbekannte Menge als
Null behandeln.

**Neue belegte Blocker-2-Teilergebnisse:** [PR #845](https://github.com/ernisch/helmut-pilot/pull/845)
ist als `a85834c600a10f4fd324ae21488ed22dc44da39f` übernommen; die weitere
[Runtime-/Eingabevorbereitung](blocker2-runtime-bindungen-20261007.md) liegt mit
[PR #850](https://github.com/ernisch/helmut-pilot/pull/850) auf `main` vor
(hier gelesener Stand `a0b3e817`). Ihr datiertes Planfenster vom 07.10.,
16:01 Uhr Europe/Istanbul (13:01 UTC) umfasst 58 strukturell zugelassene
Quellenversionen und 48 vorbereitete Cluster. Die neue Resolverbindung enthält
97 KO60-Versionen, 193 SOURCE23-Versionen und 232 Links. Alle 48 Entscheidungen
sind vorbereitet als `neu`; Exaktobjekt, Reservierung und Vormerkung sind jeweils
als Abwesenheit belegt. Diese Bestandsabwesenheit ist keine Auswahl- oder
Modellfreigabe. Die frühere 47er Vorbereitung bleibt ein datierter Vorzustand.

Alle 500 Profile sind an die Kandidaten und Originalhashes gebunden, aber
angenommene notwendige KO-/Briefingeingaben bleiben **0/500**. Die 43 vorbereiteten
DIP-V2-Versionen wurden laut diesem Beleg nicht in Production geschrieben.
Zwei vollständige Brandenburger Originalabsätze liefern zusätzliche gebundene
Verstehensprompt-Kandidaten; Themenbezug von 25 Profilen ist keine angenommene
Versorgung. Weder 48 Cluster noch 25 Profile ergeben die Zahl notwendiger U-Calls.
Die U-Liste und die tatsächlichen 500 D-Eingaben bleiben offen. Diese neuen
Quellen-/Resolveraufnahmen aktualisieren den oben datierten Kostenbestand nicht.

Erwartete Eingabegrößen: **noch nicht belegbar, abhängig von Blocker 2**.
Benötigt werden je tatsächlichem D- und U-Payload vollständige Bytes/Hash,
Modell/Route, belastbare Tokenzahl oder konservativ belegte Tokenobergrenze,
Min/Median/Maximum und Summe für alle Positionen. R enthält den erst erzeugten
D-Text und braucht dessen echte Completion/Usage sowie den daraus gebundenen
Reviewpayload; ein Kontextversionshash ersetzt keinen R-Payloadhash. Die
400.000 Eingabetokens der bestehenden Reserve sind eine konservative
Kontextobergrenze, **keine erwartete Eingabegröße**. Die 17,6 MB des
Blocker-1-Offlinecommands sind keine gemessenen Production-Promptgrößen.

## Reservierung und maximale Kosten

Bestehende konservative Tarifobergrenze: 0,50 USD pro Million Eingabetokens und
4,00 USD pro Million Ausgabetokens. Rechnung in ganzzahligen Mikro-USD:
`ceil(inputTokens / 2 + outputTokens * 4)`. Kein Anbieterrechnungsbeleg.

| Position | Ausgabelimit | Volle Einzelreserve | Summe für 500 Positionen |
| --- | ---: | ---: | ---: |
| D | 3.000 Tokens | 0,212 USD | 106 USD |
| R, regulär | 3.000 Tokens | 0,212 USD | 106 USD |
| R, bestehender ausdrücklicher Reviewmodus | 6.000 Tokens | 0,224 USD | 112 USD |
| U, falls nötig | 3.000 Tokens | 0,212 USD | 0,212 USD × endgültige Anzahl |

212 USD für D/R regulär bzw. 218 USD im Reviewmodus sind die **Summe der
Einzelreservierungen**, keine erwartete Rechnung und keine gleichzeitig offene
Bindung. Bei Parallelität 1 und bestätigter Abrechnung vor dem nächsten Sender
beträgt die größte neue offene Einzelreserve 0,212 bzw. 0,224 USD. Eine verlorene
Antwort bleibt vollständig reserviert; der konkrete Lauf stoppt, kein Retry.
Der alte Reservenbestand kommt zusätzlich hinzu.

Für jeden Sender muss gelten:
`historischer Verbrauch + alte offene Bindungen + neue tatsächliche Kosten
  + nächste volle Reserve <= jeweilige Tages-/Auftrags-/Nachweisgrenze`.
Am Ende zählen nur belegte Kosten und noch offene volle Reserven. Die Summe
der maximalen D/R-Ausgabetokens allein kostet höchstens 12 USD regulär bzw.
18 USD im Reviewmodus **bei Ausschöpfung dieser Ausgabelimits**, jeweils vor
Eingabekosten. Das sind keine tatsächlichen Mindestkosten. Ohne vollständige
Eingaben und andere Pfade existiert noch keine belastbare Gesamtprognose.

Ein auf den 7-USD-Endnachweis ausgerichteter Reserveguard würde schon die erste
neue D-Reserve verweigern; dieser zusätzliche 7-USD-Guard ist im gespeicherten
20-USD-Senderweg nicht vorhanden. Der konservative Endbeleg verletzt bereits
ohne neue Kosten die 7-USD-Grenze.
Es kann daher unter diesem Stand **kein finanzierter vollständiger 500er Lauf**
zugesichert werden. Auch 20 USD kumulativ heben den 6-USD-Tagesriegel innerhalb
des höchstens vierstündigen, eintägigen Fensters nicht auf. Das maximale neu
ausgebbare Tagesgeld ist erst nach frischem Tages-/Auftrags-/Privatreservenabgleich
bestimmbar. Ein Budgetstopp belegt Kostenkontrolle, aber keinen vollständigen Lauf.

## Weitere technische Budgetriegel

Die Dollarreserve ist nur einer der vorhandenen Riegel. `ai.requestOpenAI`
prüft außerdem vor HTTP die atomare Anzahlreservierung über `reserveLlmCall`
sowie die Anbietersteuerung. `HELMUT_MAX_LLM_CALLS_PER_DAY` wird in
`storage.js` bei fehlendem oder ungültigem Wert auf **50 Calls/UTC-Tag**
begrenzt. Für 1.000 D/R-Aufrufe müssen im tatsächlich wirksamen Tageszähler
mindestens 1.000 freie passende Positionen bestehen, zusätzlich zu nötigen
U-/anderen Aufrufen. Ein 20-USD-Auftrag ersetzt diesen Anzahlriegel nicht.
Sein aktueller Production-Wert ist hier **nicht belegt** und muss aus dem
endgültigen Runtimebeleg von Blocker 1 übernommen werden; keine Variable geändert.
Historische Production-Leser vom 19./20.09. dokumentieren 2.416, U-Reserve702
und Vorrang200; sie belegen keinen heutigen Wert. Unter diesen Szenariowerten
stehen D/R höchstens1.714 und U2.216 im gemeinsamen Zähler zur Verfügung.
Die genaue Herleitung, der Fehlerpfad und benötigte frische Beleg sind in der
oben verlinkten Vertragsprüfung festgehalten.

Wenn `HELMUT_TENANT_LLM_CAP` aktiv ist, gelten außerdem bestehende individuelle
Overrides bzw. `HELMUT_MAX_LLM_CALLS_PER_TENANT_PER_DAY`; sicherer Fallback
40. Für jedes Zielprofil sind die zwei D/R-Positionen gegen seinen tatsächlichen
Rest abzugleichen. Geteilte Understanding-Calltypen besitzen keinen eigenen
Profilverbrauch, verbrauchen aber globale Positionen und Geld. Falls die
skalierbare Fairness aktiv ist, muss auch die globale/mandatsbezogene Aufteilung
ausreichend freie passende Positionen zulassen. Eine pauschale hohe Zahl ist
kein Nachweis dieser Freiplätze. Globale/per-Profil-Zähler, Fairness-,
Anbieter- und Geldtickets werden nicht zurückgesetzt oder umgangen.

Der konkrete endliche Admissionplan bindet Konto/Route, Modell, Commit, Fenster,
Payloadhash und genau einen Versuch je Position. Geld und Intentverbrauch werden
im selben bestätigten Auth-CAS gebucht. Technisch wirksame Budgetkontrolle
benötigt damit zugleich bestätigte Dollar-, Anzahl-, Anbieter- und Intentriegel
an jedem tatsächlich bezahlten Pfad. Die lokale Rechnung ist kein solcher Riegel.

## Grober Zeitplan und Stoppbedingungen

Der übernommene Blocker-1-Codevertrag arbeitet explizit sequenziell: `start` bearbeitet die erste
Einheit, 499 separate `next`-Aktionen die übrigen. Steuerung, Quell-/Profilguards,
Geld-CAS, Speicherung, Rücklesen und Belegexports benötigen zusätzliche Zeit.
Aktivierungs- und Testfenster bleiben höchstens vier Stunden in einem UTC-Tag.

| Angenommene Zeit je D/R-Modellaufruf | Nur 1.000 Provideraufrufe, ohne Zusatzarbeit |
| --- | ---: |
| 5 Sekunden | 1 h 23 min 20 s |
| 10 Sekunden | 2 h 46 min 40 s |
| 15 Sekunden | 4 h 10 min |
| 20 Sekunden | 5 h 33 min 20 s |

Das sind Szenarien, keine Messungen oder Laufzeitgarantien. Die harte
20-Sekunden-Senderfrist umfasst die HTTP-Antwort einschließlich Body, nicht den
gesamten Ablauf von Guards, Reservierung, Persistenz und Operatoraktionen.
Für vier Stunden sind im Mittel höchstens **28,8 Sekunden je Profileinheit**
inklusive aller Arbeit verfügbar, entsprechend 14,4 Sekunden je D/R-Aufruf
ohne zusätzliche U-Aufbereitung und sonstigen Aufwand. Der endgültige Zeitplan
bleibt **abhängig von Blocker 1** und den Eingabegrößen aus **Blocker 2**.
Zeit für frischen Vorflug, Abschlussaufnahme, Endwächter und Rückweg muss im
konkreten Fenster ausdrücklich reserviert werden, bevor Startfähigkeit behauptet wird.

Der tatsächliche Operatorvertrag begrenzt einen HTTPS-Steuerrequest einschließlich
Antwort auf 180 Sekunden und 16 MiB, ohne Redirect oder Retry. Das umfasst eine
Profileinheit samt D/R und Nebenarbeit; die Frist wird nicht zusätzlich zu den
beiden enthaltenen Modellfristen addiert. 500 ausgeschöpfte Steuerrequestfristen
wären allein 25 Stunden und passen nicht in das Vierstundenfenster. Der Vertrag
belegt deshalb einen begrenzten Einzelrequest, keine garantierte Gesamtlaufzeit.
Für die vollständige Zeitfreigabe fehlen weiterhin gemessene oder konservativ
belegte Einheitzeiten und ein endlicher Ablauf aller 500 expliziten Aktionen.
Status-/Export-/Stopaktionen und die Endbelegsicherung benötigen einen eigenen
Zeitanteil; sie sind keine zusätzlichen Modellaufrufe.

Der übernommene [Blocker-4-Endweg](blocker4-endsteuerung-20261007.md) besitzt
einen 30-Sekunden-Schedulertick. Das ist keine Verlängerung des Testfensters oder
des UTC-Tagesbudgets. Nach Fensterende ist kein neuer bezahlter Dispatch zulässig;
bereits begonnene oder unbekannt gebliebene Arbeit wird belegt abgerechnet bzw.
voll reserviert erhalten. Der echte Lauf muss ausreichend Zeit für Abschluss und
Rückweg freihalten; frühere 0→0-Proben ersetzen keinen vollständigen 500er Lauf.

Stopp vor dem nächsten bezahlten Sender bei fehlender Deckung der ganzen
Reserve; unbekannten Kosten/Schreibausgängen; unvollständigen oder abweichenden
Input-, Versions-, Modell-, Konto-, Deployment- oder Intentbindungen;
fehlender D-/R-Kostenquittung; Profilzahl ungleich exakt 500 aktiv; Ablauf des
Fensters/UTC-Tageswechsel; Stoppsignal oder fehlendem lebenden Endwächter.
Unbekannte Kosten bleiben voll gebunden. Keine Wiederaufnahme verbrauchter
Intents, kein Löschen von Reserven und kein weiterer vollständiger Lauf.

## Kostenbeleg für die Endprüfung und Abschlusskriterien

Ein späteres Kostenpaket bindet unveränderliche Lauf-/Operations-/Plan-/Commit-
und Deploymentkennung, Start- und Endzeit, die Originalkostenbücher vor/nach dem
Lauf, atomare Tickets, Verbrauchsmarker, tatsächliche Tokenusage, D-Completions
und R-Payloadbindungen. Jede notwendige U-/D-/R-/sonstige Position erscheint
genau einmal als abgerechnet, nachweislich nicht gesendet oder vollständig
reserviert unbekannt; fehlende Positionen sind keine Nullkosten. Die
Nutzungsoriginale bleiben außerhalb des begrenzten globalen Usage-Rings erhalten.
Private Reserven brauchen originale positionsgenaue Zuordnung ohne Doppelabzug.

Endprojektion für `synthetik-500-nachweis.js`: `gelesenAm` nach Laufende,
sämtliche berührten `utcTage` mit Verbrauch und Reserve, kumulativer
Auftragsverbrauch und Auftragsreserve sowie `primaerbeleg`. Alle technischen
und privaten offenen Bindungen müssen darin zutreffend enthalten sein. Der
Vergleich bezieht sich auf den gesamten freigegebenen Auftrag, nicht nur auf
die Differenz des neuen Laufs. Anbieterrechnung bleibt separat offen.

Der [Offline-Rechner](../../scripts/synthetik-500-kosten-zeit.js) macht die
Bestandsarithmetik, Reservensummen und Zeitszenarien reproduzierbar. Er liest
keine Production-Daten, installiert keine Zulassung und meldet niemals
Ausführungsreife. Eine grüne Offlineprüfung schließt diesen Blocker nicht.

Finaler Abschluss erst bei **allen** folgenden Belegen:

1. Endgültiger Blocker-1-Motorvertrag einschließlich Aufrufanzahl, sequenziellem
   Ablauf und wirksamen Fristen übernommen und unabhängig geprüft.
2. Endgültige Blocker-2-Eingaben aller 500 Profile, vollständige U-Liste,
   R-Abhängigkeiten und Ausschluss/Aufnahme aller anderen bezahlten Pfade übernommen.
3. Frischer vollständiger Kostenstand und Privatreservenzuordnung; Deckung genau
   eines vollständigen Laufs einschließlich Ausgabekosten und Reservehöhe nachgewiesen.
4. Derselbe ausdrücklich freigegebene Kostenrahmen in Betreiber-/Betriebsdokumentation,
   konkretem Plan, technischen Sender-/Start-/Auftragsriegeln und Endvalidator.
   Keine Budgetgrenze wird in diesem Auftrag geändert; eine notwendige Änderung
   bleibt ein gesonderter konkreter Freigabepunkt.
5. Konkretes Fenster mit Zeit für Abschluss/Rückweg, wirksame Stopps und lebender
   Endwächter; unabhängige Abnahme des integrierten Kostenvertrags.

**Diese Kriterien sind derzeit nicht erfüllt. Blocker 3 bleibt offen.**

Abhängigkeitsstand nach Übernahme von PR845/846/850: Blocker-1-Codevertrag und
Aufrufstruktur sind integriert, die tatsächlichen Runtime-/Zulassungswerte fehlen.
Blocker 2 meldet ausdrücklich keine vollständige Eingabeabnahme. Gesamtkosten
und Zeitgarantie bleiben offen; Plan, Senderzulassung und Endvalidator verwenden
weiterhin keinen gemeinsam freigegebenen vollständigen 500er Kostenrahmen.
Keine Budgetgrenze wurde geändert, keine bestehende Bindung freigegeben und kein
Production-Modelltest gestartet. Dieser Teilstand schließt Blocker 3 nicht ab.

## Erhaltene historische Kostenstatuszeilen

Die folgenden bisherigen CURRENT_STATE-Zeilen sind vollständig erhalten.
Der aktuelle Status verweist auf diese datierten Belege; die Beobachtungen vom
05./06.10. ersetzen keine aktuellen Start-/Kostenoriginale.

- **Gebundene U-Vorbereitung (06.10.,17:32:57 UTC):** Zwei echte Einzel-U geschlossen und konservativ abgerechnet; Original-U2 bleibt `unknown`. Phase15.232 Mikro-USD plus unveraenderte private636.000-Reserve, keine offenen Anbieteraufrufe. Der zweite Modellbeleg wurde fachlich abgelehnt; genau16 unbelegte/mischende Felder des eigenen Wissensobjekts wurden unabhaengig geprueft korrigiert, KO-Version2 und separater Operatorbeleg nativ nachkontrolliert. Originalmodellbeleg/Verbrauchshistorie bleiben unveraendert; Journal57/56 alte Vollzeilen+xmin erhalten,500/0 aktiv. Fehlversuche rollten nachweislich zurueck; volle Zeilen-/xmin-Fingerprints jetzt vor Aggregation verdichtet, dieselben15s/17s/2s-Grenzen erhalten. Cron-Ruhe produktiv bestaetigt; vollstaendige aktuelle Quellen-/Briefing-Eingaben beider Ebenen, Native-D, Finanzierung und Endwaechter bleiben offen. [Umfang und Rueckweg](gebundene-u-vorbereitung-cron-ruhe-20261006.md).
- **Kostentage ergänzt (05.10.,04:40 UTC):** Native Nachkontrolle bestätigt26 Bücher:03./04.10. jeweils14 reine Skip-Belege,0 Anbieter-/Zählerereignisse; exakt2 Nullbücher ergänzt. Vollständiger Auth-Deltaguard erhielt alle alten Bücher/Kosten/Reserven/Grenzen; Journal47, vorherige46 Vollzeilen/xmin erhalten. Kostenstand6,794132USD erhalten. PR#807 Ready: Zwei16-Token-Proben06:05/06:36 UTC enden502;128-Token-Probe07:43 UTC endet200/vollständig,30 Tokens. Zusammen126 Mikro-USD konservativ abgerechnet,0 offene Reserve im Auftragsfenster. Global:15 historische Reserven/3,176USD vor25.09. unverändert; alle Production-Bücher16,703860USD gebunden. Anbieter-/Kostenbeleg unabhängig schmal abgenommen. [Aktuelle Grenzen](synthetik-500-inaktiver-import-20261005.md), [frühere Kostenkorrektur](kosten-nullbuecher-nachbeleg-20261002.md).
