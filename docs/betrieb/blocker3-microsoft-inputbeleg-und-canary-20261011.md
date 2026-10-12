# Blocker 3: Microsoft-Teilbeleg und kleinster EU-Diagnosecanary

**Historische Vorbereitung, abgelöst am12.10.:** [Aktueller EU-Servicekostenvertrag](blocker3-eu-servicekostenvertrag-20261012.md).
Die externe Microsoft-Antwort ist für dessen vollständigen finanziellen
Servicedeckel kein Blocker mehr. Der Canary ist vom Betreiber verworfen und
wird nicht ausgeführt; frühere Rechnungen/Belege bleiben historisch erhalten.


Stand 11.10.2026. **Nur geprüft und geplant; kein GO, kein Modellaufruf,
keine Production-, Budget-, Reserve- oder Aufrufgrenzenänderung.**
Der [maschinenlesbare Plan](blocker3-microsoft-inputbeleg-und-canary-20261011.json)
bindet Quellenoriginale, Rechnung, Schutzgrenzen und spätere Freigabefelder.
Der kontospezifische Oktoberpreis und die endgültigen B2-Ergebnisse bleiben
unverändert übernommen. Kein kostenpflichtiger Microsoft-Supportfall.

## Was die beiden Quellen tatsächlich schließen

Die [Microsoft-Q&A-Antwort](https://learn.microsoft.com/en-us/answers/questions/5889782/404-response-when-executing-getinputtokencountasyn)
von Karnam Venkata Rajeswari, **Microsoft External Staff / Moderator**,
vom 19.05.2026 bestätigt die fehlende Unterstützung der
`/v1/responses/input_tokens`-Hilfsroute am Azure-v1-Kompatibilitätsendpunkt.
Das ist nun ein externer Beleg, kein Schluss allein aus Dokumentationslücken.
Die Antwort ist keine frische native Probe des Helmut-Deployments.

**Attribution korrigiert:** Der ausdrückliche Vorschlag clientseitiger
Tokenisierung steht in der separat als **AI answer** gekennzeichneten Antwort.
Er darf weder dem Moderator zugeschrieben noch als Microsoft-Zusicherung einer
vollständigen Anbieterzählung verwendet werden.

Die offizielle [Azure Responses REST-Referenz, API v1](https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/azureopenai/responses#openairesponseusage)
dokumentiert `usage.input_tokens`, Output-/Gesamttokens, Cachetokens und
Reasoningtokens. `usage` ist auf Response-Ebene optional; innerhalb eines
vorhandenen Usageobjekts sind die Tokenfelder erforderlich. Fehlende Usage wird
deshalb nicht als Nullverbrauch gewertet. Die Referenz beschreibt keine kleine
Vorabobergrenze für Schema oder internes Framing.

**Ergebnis: teilweise geschlossen.** Unterstützungsfrage und nachgelagerter
Messpunkt sind belegt. Die vollständige kleine Eingabeobergrenze bleibt offen.
Die nicht unterstützte Zählroute wird weder ausprobiert noch als zusätzlicher
bezahlter Pfad eingeplant. Keine Aussage über andere zukünftige Azure-APIs.

## Was lokal bereits vollständig bekannt ist

Alle 500 vollständigen EU-D-Requesttexte wurden bereits lokal einschließlich
Schema und JSON-Hülle tokenisiert und hashgebunden: **2.028.471 Tokens insgesamt,
10.757 maximal**. Die gültigen Belege werden übernommen, nicht neu aufgenommen.
Das gemeinsame Tokenvokabular ist gebunden. Die volle JSON-Tokenzahl enthält
auch Transportfelder; sie ist keine zugesicherte Anbieter-Inputtokenzahl.

Das R-Schema ist fest: 2.957 UTF-8-Bytes beziehungsweise 720 lokale Tokens.
Instruktionen, Quellen und Profile sind bekannt. Die vollständigen 500 R-Bodies
existieren erst nach den jeweiligen D-Antworten. Die bereits geprüfte
D→R-Transformation bleibt unverändert: vollständige 2–4 Absätze, notwendige
Quelldokumente und bis zu sechs Paarurteile. Je 3.000 Outputtokens einschließlich
Reasoning, `low`, bestehende Wortgrenze und sämtliche Abnahmekriterien bleiben.
Outputtoken- oder Wortgrenze allein belegt keine gleich große R-Inputgrenze.

Sobald ein R-Body entsteht, kann er vollständig lokal tokenisiert, versiegelt
und nach dem Aufruf mit seiner Usage verglichen werden. Das ist ein korrekter
Messablauf; ohne Anbieterzählregel ist es keine Garantie vor dem Senden.

## Kleinster sinnvoller Canary: höchstens zwei Modellaufrufe

Ein Aufruf je unverändertem D-/R-Schema ist das Minimum für Messungen beider
Formen. Dies ist eine **Diagnose an der bekannten D-Eingabegrenze**, kein
universeller R-Grenznachweis und keine Production-Senderabnahme.

1. **D:** Position 468, der eindeutige größte bereits gebundene vollständige
   EU-D-Request: 10.757 lokale Tokens, 34.878 Bytes, Bodyhash
   `538cb3f66684c657fda379538074d71afb31004fef8d60b5bd901d68a8f3c880`.
2. **R:** Derselbe synthetische Kontext; vollständige tatsächlich erhaltene,
   nach bestehenden Regeln gültige D-Antwort lokal übernehmen und mit der
   bestehenden reinen Transformation den vollständigen R-Request erstellen.
   Originalquellen, Schema und Prüfumfang erhalten. Seinen Body erst danach
   vor Reserve/Senden versiegeln. Keine unbekannten Prüftexte vorab als bekannt
   darstellen. Das GO müsste genau diese deterministische Ableitung umfassen.

Nur `gpt-5-mini-eu`, Modell 2025-08-07, DataZoneStandard/SwedenCentral, explizite
Azure-v1-Route. Serielle Ausführung, je ein Versuch, **keine Wiederholung oder
Ersatzaufrufe**, U=0, keine Tools/History. Je 3.000 Outputtokens und `low` bleiben.
Kein Aufruf des normalen Helmut-Senders, keine ENV-Umschaltung, Installation,
Profilaktivierung, Speicherung im Production-Journal oder Datenbankmigration.
R wird nur nach vollständig bekanntem D-Ausgang und bestätigter Abrechnung
gesendet. Timeout, fehlende Usage oder unbekannte Kosten stoppen vorher.

Vor einem späteren GO müssen Runner und atomare Kostenbelegführung genau für
diesen isolierten Pfad prüfbar vorbereitet sein. Der jetzige Plan ist kein
installierter Runner und keine bereits wirksame neue Kostenabsicherung.

## Maximale Kosten und unveränderte Reserven

Der kleinste lokale/schemaabhängige Inputdeckel ist gerade nicht bewiesen.
Für die **zwei Diagnoseaufrufe** wird deshalb ausschließlich das große offizielle
[Modell-Servicelimit](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure)
von **272.000 gesamten Inputtokens** und der unveränderte Outputdeckel 3.000
verwendet. Kein angenommener Framingaufschlag und kein Cacheabschlag.
Diese Ableitung nutzt den allgemeinen Anbieter-Inputdeckel; sie beweist keinen
kleineren, lokal durchgesetzten Deckel. Wird diese Servicelimitbasis nicht
anerkannt, wird auch kein numerisches Canary-GO als belastbar ausgegeben.

`ceil((275 × Inputtokens + 2200 × Outputtokens) / 1000)` MikroUSD je Aufruf.

| Wert | USD |
|---|---:|
| Höchstens je Modellaufruf, aus Servicelimit und Oktober-Tokentarif | 0,081400 |
| Höchstens zwei Modellaufrufe insgesamt | **0,162800** |
| Unveränderte Standardreserve je Aufruf | 0,212000 |
| Benötigte serielle Finanzierungsspitze | **0,293400** |
| Bruttosumme zweier Reserven, kein gleichzeitiger Bedarf | 0,424000 |

Die Spitze ist `max(0,212; 0,0814 + 0,212; 0,1628)`.
Bei unbekanntem ersten Ausgang entfällt R und die volle erste Reserve bleibt.
Bei unbekanntem zweiten Ausgang bleiben abgerechnetes D und volle R-Reserve.
Keine Reserve wird wegen geschätzter geringer Tokens verkleinert oder gelöscht.
Die Reserve ist kein zusätzlicher Preis und kein Anbieter-Abrechnungslimit.

Vorher frisch vollständige Kostenbücher, private Reserve und Aufrufstand binden.
Vorhandene numerische Grenzen werden nicht verändert. Der 20-USD-Sendervertrag
für500 ist **keine Freigabe der zusätzlichen Diagnosecalls**. Das spätere GO
müsste deren Kosten ausdrücklich in einen freigegebenen20-USD-Auftrag einbinden
und die Anwendbarkeit der alten7-USD-Gesamtbindung klären. Gilt diese weiter für
den Diagnosepfad, sperrt bereits7,445364USD Altbindung jeden Start. Weder ein
isolierter Runner noch ein neues lokales Kostenbuch darf diesen Riegel umgehen.
Die tatsächliche Tagesrestprüfung bleibt bei6USD, nicht beim12-USD-Kandidaten. Bei unveränderter
belegter Altbindung wäre die Canary-Auftragsspitze 7,738764 USD; das ist ein
**Szenario, kein frischer Startnachweis**. Tagesbindung bei belegtem Altverbrauch
Null einschließlich Privatreserve: 0,929400 USD. Unbekannte Bücher sind nicht Null.

Die Canaryergebnisse zählen nicht zur späteren 500er Abnahme: dafür fehlen exakt
500 aktive Profile und die native Journal-/Senderwirkung. Insgesamt also
höchstens **1.002** bezahlte Modellaufrufe einschließlich eines später separat
freigegebenen 500er Laufs, davon weiterhin exakt 1.000 im vollständigen Lauf.
Bei gemeinsamem Globalzähler vor dem Canary `Used≤712`, nach ihm vor dem
500er Lauf frisch `Used≤714`; 702 U-Reserve bleibt unangetastet. Kein Deckelwechsel.

Falls beide Canarykosten im selben kumulativen Auftrag enthalten sind, erhöht
sich die **weiterhin bedingte** 12/20-Rechnung von 18,189258 auf 18,352058 USD
kumulativ. Im selben UTC-Tag wären 11,542694 USD gebunden; Tagesrest für frischen
Altverbrauch 0,457306 USD. Anbietereingabecaps 12.288/16.384 bleiben unbewiesen.
Der Canary macht diese bedingte Rechnung nicht zu einer Freigabe.

## Was erfolgreich gemessen würde und was offen bleibt

Zwei erfolgreiche Calls belegen Annahme der beiden exakten Bodies/Schemas,
ihre tatsächliche Usage und Tokenkosten. Rohresponse/Response-ID/APIM-Request-ID,
Route, Modell, Zeit, vollständige Usage und Body-/Schemahash müssen verbunden
gesichert werden. Lokale Hashes sind keine Anbietersignaturen und kein nativer
Ledgerbeleg. Vergleich mit lokalen Prompt-, Schema- und Wiretokenzahlen liefert
**beobachtete Differenzen**, nicht ausschließlich reine Framingtokens.

Eine Überschreitung kann den kleinen Kandidaten widerlegen. Zwei passende Werte
beweisen weder einen konstanten Framingaufschlag noch dessen obere Grenze bei
anderen Requests. Ein Schemafix verhindert Drift, beweist aber keine bestimmte
interne Anbieterrepräsentation. Auch ein sehr großer künstlicher R-Prüftext
beweist ohne Monotonie-/Tokenisierungsregel nicht alle fachlich zulässigen R.
Deshalb ist kein zusätzlicher künstlicher R-Aufruf vorgesehen.

Ein späterer Stopp bei zu hoher Usage schützt Geld erst nach diesem Call; die
unveränderte 0,212-Reserve deckt den allgemeinen Servicekostendeckel ab. Der Stopp
garantiert jedoch nicht, dass alle 500 fachlich zulässigen Ergebnisse innerhalb
des kleineren Gesamtvertrags fertig werden. Das Abnahmekriterium wird nicht in
eine bloße Aussicht auf 500 Ergebnisse umgedeutet.

**Empfehlung:** Keinen bezahlten Canary als versprochenen Ersatz für den
Vollnachweis freigeben. Er ist nur sinnvoll, wenn zwei native Messungen als
eigenständige Diagnose gewünscht werden. Kostenpflichtiger Support ist dafür
ebenso wenig nötig wie eine Budget- oder Production-Routenänderung.

Für die unveränderte vollständige Abnahme fehlt weiterhin genau die
autoritative Microsoft-Beziehung
`usage.input_tokens ≤ F(vollständiger unveränderter Request, festes Schema)`
für diese Route/Modellversion einschließlich sämtlicher abgerechneter
Framingtokens. Danach muss lokal die ganze bereits zulässige D→R-Hülle unter
dem finanzierten Deckel bewiesen werden. Keine zusätzliche B2-Quellenabnahme.
Eine kostenlose belastbare Microsoft-Antwort könnte dies schließen; die jetzt
vorliegenden zwei Quellen und endliche Canarymessungen leisten es nicht.

## Konkrete spätere Freigabefelder

| Feld | Ausschließlich für den optionalen Diagnosecanary |
|---|---|
| Änderung | Höchstens zwei isolierte Azure-Responses-Modellaufrufe D/R, atomare Kostenreservierung und vollständige Kostenbelege. |
| Umgebung | Bestehendes `gpt-5-mini-eu` im Azure-Ressourcenkonto, isolierter Workspace-Runner; Helmut Production ENV bleibt. |
| Benötigte Grenze | Keine numerische Grenzänderung; ausdrückliche Diagnosebindung im freigegebenen20-Auftrag, Anwendbarkeit der7-Gesamtbindung klären; frisch bewiesener Rest deckt0,293400USD serielle Spitze. Kein Umgehen der6/7-Riegel. |
| Maximale Tokenkosten | 0,162800 USD bei den dokumentierten Servicelimits und unverändertem Oktoberpreis. |
| Erwartete Wirkung | Zwei native Usage-/Kompatibilitätsmessungen; keine Zusicherung des vollständigen kleineren 500er Vertrags. |
| Risiko | Kosten trotz fachlichem Fehler/Timeout; unbekannter Ausgang erhält Reserve und stoppt. Positive Stichprobe bleibt Stichprobe. |
| Rein lesende Nachkontrolle | Request-/Responsehashes, native Usage/IDs/Modell, vollständige Kostenbücher/Zähler und unveränderte ENV/Profile/Commands/Journal abgleichen. |
| Rückweg | Runner stoppen, keine Wiederholung; Belege, Kosten und unbekannte Reserven erhalten. Keine Production-Konfiguration zurückzustellen. |

Ausführungstag innerhalb des Oktoberpreiszeitraums, Planhash, D-Bodyhash,
beide Schemahashes, genaue R-Ableitung, Kostenbelegautorität und frische native
Restmittel müssen im GO gebunden sein. Der aktuelle Plan fordert kein GO an.
Die getrennten späteren EU-Rollout- und 500er-Test-GOs werden dadurch nicht erteilt.

Die unabhängige Flash-High-Prüfung bestätigt die Teilbeleg-/Stichprobengrenze.
Die frühere achtteilige Offline-Vorbereitung bleibt historisch erhalten;
die [aktuelle Prüfung](blocker3-microsoft-inputbeleg-und-canary-pruefung-20261011.json)
bindet die jetzigen Quellen-/Vertragsstände.
**Blocker 3 bleibt offen; Runtime und Endvalidator sind unverändert.**
