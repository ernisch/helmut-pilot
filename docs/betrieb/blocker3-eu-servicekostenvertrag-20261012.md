# Blocker 3: vollständiger EU-Finanzierungsvertrag über das Servicelimit

Stand 12.10.2026, Betreiberzeit Europe/Istanbul. **Finanzieller Beweis geschlossen;
Vertragsvorschlag vorbereitet, nicht freigegeben oder produktiv umgesetzt.**
Kein Canary, kein Supportfall, kein Production-Modellaufruf, Merge, Rollout,
Budget-, Reserve-, Profil-, Command- oder Journaländerung durchgeführt.
Der [maschinenlesbare Vorschlag](blocker3-eu-servicekostenvertrag-20261012.json)
bindet sämtliche Beträge, Originalquellen, Verbraucher und GO-Felder.

## Autoritativer Beweis der maximalen Haftung

Die [Microsoft-Modellreferenz](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure#gpt-5)
definiert das Kontextfenster als gesamte Tokenmenge, die das Modell pro Request
verarbeitet. Separat angegebene Input-/Outputwerte sind individuelle Grenzen.
Für `gpt-5-mini` **2025-08-07**: 400.000 Kontexttokens, **272.000 gesamte
Inputtokens**, 128.000 maximaler Output. Responses und Structured Outputs sind
für genau diese Modellversion aufgeführt.

Die [Responses-REST-Referenz](https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/azureopenai/responses#openairesponseusage)
beschreibt die tatsächliche Input-/Output-/Gesamtusage. Die
[Microsoft-Reasoning-Anleitung](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning#control-costs)
bestätigt: `max_output_tokens` umfasst sichtbaren Output, Reasoning und
Formatierung; Reasoning wird zum Outputtarif berechnet.

**Schluss für die finanzielle Haftung:** Soweit Schema und internes Framing als
Inputtokens abgerechnet werden, gehören sie zum gesamten Modellinputbudget;
sie sind kein zusätzliches Tokenkontingent außerhalb der 272.000. Nicht als
Modellinput abgerechnete Verarbeitung erzeugt keinen zusätzlichen Inputtoken-
Posten. Für den festgelegten reinen Text-Responsespfad sind nur die belegten
Input-/Outputmeter relevant; keine Tools, zusätzliche Modellpfade, Historie,
Conversation, Zählrequests, Cacheannahmen oder Batchrabatte.

Die genaue interne Schemarepräsentation und die Abweichung zur lokalen
Tokenisierung können unbekannt bleiben, ohne den gesamten finanziellen Deckel
zu vergrößern. Es wird weder ein kleiner lokaler Inputcap behauptet noch ein
nicht existierender `max_input_tokens`-Parameter eingerichtet. Der Provider
setzt sein dokumentiertes gesamtes Modellinputlimit durch.

Die frühere externe Microsoft-Antwort ist **für diese Finanzierungsstrategie
kein Blocker mehr**. Sie wäre nur für eine kleinere schemaabhängige Hülle nötig.
Canary und kostenpflichtiger Support entfallen vollständig. Oversize- oder
unvollständige Requests sind keine erfolgreiche fachliche Abnahme. Der Vertrag
finanziert alle 1.000 einmaligen Versuche bis zur dokumentierten maximalen
Haftung; Erfolg, Qualität und Laufzeit werden weiterhin tatsächlich geprüft.

## Unveränderter Umfang und exakte Höchstkosten

Übernommen, nicht erneut geprüft: finale B2-Abnahme mit 500 angenommenen
Kontexten, davon 468 regulär/32 historisch, ausgerollter B2→D-Vertrag auf
`1ad00cd4…`, bestehende B1-/B4-Belege. Ziel ausschließlich `gpt-5-mini-eu`,
DataZoneStandard, SwedenCentral/EUR, Modell 2025-08-07, NoAutoUpgrade.
Kontospezifischer Oktoberpreis: 0,275 USD Input/2,20 USD Output je Million Tokens.
Originale, Meter-/Oktoberbindung und native EU-Identität bleiben unverändert.

**500 D + 500 R + 0 U = 1.000 Calls**, Modellparallelität 1, höchstens ein
Versuch je Intent, keine Retries oder Ersatzcalls. Je maximal 3.000 Outputtokens
einschließlich Reasoning; `low`, vollständige Texte, Schemas und alle
Abnahmekriterien einschließlich 1.500 Prüfpositionen bleiben unverändert.

| Pro Request | Rechnung | USD |
|---|---|---:|
| Vollständiger Input, einschließlich abgerechneter Schema-/Framingtokens | 272.000 × 0,275 / 1.000.000 | 0,074800 |
| Gesamter Output einschließlich Reasoning und Formatierung | 3.000 × 2,20 / 1.000.000 | 0,006600 |
| Gesamthaftung je Request | Summe | **0,081400** |
| Genau 1.000 Requests | 1.000 × 0,081400 | **81,400000** |

Ganzzahlige MikroUSD, inklusive Grenzen:
`ceil((275 × Inputtokens + 2200 × Outputtokens) / 1000)` je Call.
`usage.output_tokens_details.reasoning_tokens` nicht zusätzlich zum bereits
enthaltenen Output berechnen. Jeder erfolglose bezahlte Versuch zählt mit.

**81,40 USD sind das absolute neue Token-Sicherheitsmaximum, keine Zielausgabe.**
Ein exakter erwarteter Verbrauch ist nicht gemessen. Die früheren
2,326449/3,495264/8,170264-USD-Szenarien beruhen auf lokalen D-Tokenzahlen,
angenommenem Framing/R-Input und 500/1.000/3.000 Outputtokens; sie bleiben
unvermessene Beispiele, weder Mindest-/Maximalwerte noch eine zugesicherte
Erwartungsspanne. Der Service-Maximalinput wird nicht künstlich ausgefüllt.

## Kleinster vollständig finanzierter Geldvertrag

Bestehende 0,212-USD-Tickets, 15 alte Globalreserven mit 3,176 USD, alle alten
Tarife und Originalkostenbücher bleiben unverändert. **Ausschließlich die
1.000 zukünftigen EU-Tickets** der neu freizugebenden Version reservieren jeweils
die vollständige belegte Haftung **0,081400 USD**. Das ist eine neue
Reservierungspolitik und benötigt GO; es verkleinert kein bestehendes Ticket.

Bei serieller Ausführung wird vor jedem Call atomar reserviert und vor dem
nächsten Call bestätigter tatsächlicher Verbrauch anstelle dieser Reserve
gebucht. Unbekannter Ausgang behält die volle 0,0814-Reserve und stoppt.
Ein abgeschlossener Call wird nicht gleichzeitig als Verbrauch und Reserve
gezählt. Damit ist die Finanzierungsspitze:

`H = max(volle Kosten, Prefix vor dem nächsten Call + 0,0814) = 81,400000 USD`.

| Enthaltene Bindung | USD |
|---|---:|
| Neue 1.000 Calls / serielle Spitze H | 81,400000 |
| Erhaltene private ungeklärte Reserve | 0,636000 |
| **Kleinste Tagesgrenze bei frisch belegtem sonstigem Tagesverbrauch 0** | **82,036000** |
| Native alte Auftragskosten | 1,614061 |
| Bereits im Auftrag enthaltene externe Kosten | 5,195303 |
| Private Reserve einmal im kumulativen Altbestand | 0,636000 |
| Erhaltener kumulativer Altbestand | 7,445364 |
| **Kleinste kumulative Grenze desselben Auftrags** | **88,845364** |

Der private Betrag erscheint in beiden unabhängigen Riegeln, wird aber **nicht
zweimal innerhalb eines Riegels** addiert. Der kumulative Altbestand enthält
ihn bereits. Tages- und kumulative Grenze sind keine additiven Budgets.
Die alte externe Bindung wird ebenfalls nicht nochmals addiert.

Auftrag bleibt `autonom-bis500-20260926`, `abTag=2026-09-25`. Die 15 alten
Globalreserven liegen davor, außerhalb dieser bestehenden Auftragssumme. Ihre
eigenen Bindungen bleiben erhalten; sie werden nicht in den Auftrag verschoben.
Globaler historischer Verbrauch und aktueller Auftrag sind verschiedene Scopes.
Kein neues leeres Konto, kein Reset, keine Löschung oder Umwertung.

Die Codeverträge können exakt inklusive MikroUSD-Limits verwenden. 83 USD Tag /
89 USD Gesamt wären gerundete Alternativen, **nicht das kleinste nötige Paar**.
Würden auch zukünftige Calls weiter 0,212 reservieren, wären 82,166600 Tag /
88,975964 Gesamt erforderlich. Die neue belegte Vollreserve spart genau
0,130600 USD Finanzierungsspitze, ohne weniger Haftung zu decken.

**Frische Startbedingungen, keine Nullannahme:** Für diese exakt minimalen
Grenzen darf die frisch vollständig belegte kumulative Eröffnungsbindung
einschließlich Privatreserve höchstens 7,445364 USD sein, und sonstiger
Tagesverbrauch/offene Tagesbindungen müssen null sein. Jeder höhere Bestand
stoppt; kein automatisches Anheben. Allgemein:
`Tag = H + frischer sonstiger Tagesbestand + Privatreserve`,
`Gesamt = H + frische kumulative Altbindung einschließlich Privatreserve`.
Fehlende Tagesbücher sind unbekannt. Sämtliche historischen Quellen für die
Eröffnung müssen frisch vollständig belegt werden, bevor Rekonstruktion oder
Start erlaubt sind. Ein datierter Altbeleg ersetzt diesen Vorflug nicht.

## Technisch notwendige gemeinsame Änderung

Der aktuelle Zustand bleibt unverändert: Senderauftrag 20 USD, Tagesriegel
6 USD, Endvalidator 7 kumulativ/6 täglich. Das finanziert und akzeptiert den
Service-Worst-Case nicht. Kleinste saubere Umsetzung: **eine neue geschlossene,
laufgebundene EU-Version**, kein isolierter Austausch einer Validatorzahl.

Auftrag, UTC-Tagespolitik, Tarif, Intents/Plan, Admission, Command, atomarer CAS,
vollständiger Senderbody/Schema/Route, Executor, Endvalidator und native
Zeitverbraucher verwenden denselben freigegebenen kanonischen Vertragshash.
Private 0,636 im atomaren Geldcheck; neue Ticketreserve 81.400 MikroUSD;
historische Tickets behalten eigene Version/Tarife/Beträge. Die neue Tagesgrenze
gilt nur für den genau gebundenen Lauf-/UTC-Tag, nicht dauerhaft für jeden Tag.
Auch der Usage-Belegschreiber in `storage.js` muss die neue servergebundene
EU-Tarifklasse übernehmen: Seine bisherige allgemeine Modellschätzung ist kein
Oktober-Abrechnungsbeleg. Alte Logpreise werden nicht rückwirkend korrigiert.

**Zusätzlicher vorhandener Buchungsriegel:** 28 Globalbücher versus derzeit
31 zulässige Bücher. Alle fehlenden Auftragstage müssen erhalten ergänzt werden.
Bei einem Lauf am12.10. wären bei unverändertem Altbestand 34 Bücher nötig.
16 Vorauftragsbücher plus maximal31 Tage im unveränderten Auftragsfenster
ergeben maximal47. Nur die neue EU-Version darf die exakt frisch gebundene
nötige Kapazität bis47 nutzen; ältere Versionen behalten31. Nichts löschen.
Das alte31-Tage-Auftragsfenster endet am25.10.; sein Verlängern ist nicht
mitfreigegeben. Der Oktoberpreis allein verlängert keine technische Laufzulassung.

Globaler Modellfallback50 bleibt ein Codefallback. Historisch belegt2416,
U-Reserve702/Realpriorität200/Failclosed1; kein Grenzwechsel nötig.
Frischer nativer `Used≤714` vor genau1.000 Calls; 200 nicht nochmals vom
synthetischen D/R-Rahmen abziehen. Kein Canary, daher keine zwei Zusatzcalls.

Zeitplanung übernommen: unvermessene Gesamtprognose etwa5h; vorgeschlagen
9h aktive Frist plus30min Endbeleg, providerweit20s Vollantwortfrist,
500×60s Einheiten plus20min Setup/20min Puffer. Das ist eine Tätigkeitsfrist,
keine Erfolgsgarantie. Bei den belegten250.000 Tokens/min wären272 Millionen
Inputtokens allein rechnerisch über18h; das Geldmaximum ist daher ausdrücklich
kein geplanter Token-/Zeitverbrauch. Fristen und Quoten bleiben echte Start-/
Stoppbedingungen; keine Retries zur Erzwingung eines Erfolgs.

Gezielte hash-/versionsgebundene SQL-Zeitmigration erst nach GO; alte4h-Zweige
und B4-Wächterbelege bleiben erhalten. Das alte11.10.-Ausführungsfenster ist
vergangen. Keine automatische Tages-/Quellenverschiebung oder neue B2-Aufnahme;
separates Test-GO bindet Kalender, eingefrorenen Snapshot und gültige Starttore.

## Konkretes GO für Umsetzung und kontrollierten Rollout

Dieses GO autorisiert **noch keinen 500er Test**.

| Feld | Exakt beantragter Umfang |
|---|---|
| Änderung | Neue gemeinsame EU-Version; exakt82,036000 Tages-/88,845364 Auftragslimit, nur zukünftige81.400-µUSD-Tickets; private Reserve atomar; versionsgebundene Buchkapazität/Rekonstruktion;9h aktive Frist+30min Endbeleg; EU-Zielroute. |
| Umgebung | Helmut Production, bestehender Auftrag/Coststore und gezielte native Zeitmigration; Azure`gpt-5-mini-eu` im europäischen DataZoneStandard. |
| Erwartete Wirkung | Vollständige maximale Finanzierung der1.000einmaligen D/R und übereinstimmender Vertrag in Geldriegeln/Endvalidator. Kein kleiner Vorabzähler nötig. |
| Maximale neue Tokenkosten | **81,400000 USD**; erwarteter Verbrauch ungemessen und voraussichtlich deutlich kleiner, keine zugesicherte Spanne. |
| Risiko | Höhere freigegebene Haftung; unbekannte/höhere Eröffnung verhindert Start. Tarif-/Versionsmischung muss korrekt bleiben. Providerfehler, Quoten und Zeitablauf können Abnahme verhindern. |
| Rein lesende Nachkontrolle | Vertragshashes, exakte native Limits/Order-ID/abTag, erhaltene alte Bücher/Tickets/Privatreserve, tatsächlicheEU-Route/Modell/SKU, unveränderter Aufrufdeckel, SQL-Fristen und0aktive Profile. Kein Inferenztest. |
| Rückweg | Bezahlten Pfad sperren; neue Runtime/ENV auf gebundene Vorfassung zurücknehmen; sämtliche Kosten/Reserven erhalten. Budgetgrenzen nur zurücknehmen, wenn sie alle frisch belegten Verpflichtungen weiter decken. |

Umfang des erbetenen GO: lokale Implementierung, gezielte Tests, unabhängige
Prüfung, grüne Pflichtchecks und **danach ausdrücklich freigegebener Merge/
kontrollierter Rollout** einschließlich genannter Budget-/ENV-/SQL-Schritte.
Vorher Konfigurationsvorbilder und gültiges enges Lesefenster binden.
Keine Commandinstallation, Profilaktivierung, Journalmutation, kostenpflichtigen
Production-Modellaufrufe, Canary, Supportkosten oder zweite Ausführung.
Dafür bleibt später ein separates konkretes500er-Test-GO erforderlich.

Der Endkostenbeleg muss native vollständige Eröffnungs-/Endbücher, alle1.000
Usage-/Tarif-/Intent-/Body-/Schema-/Modellbindungen, erhaltene Reserven/Privatbindung,
Aufruf-/Zeitgrenzen und unveränderte1.500Abnahmepositionen zusammenführen.
Prognosen oder lokale Tokenzahlen ersetzen keine tatsächliche Providerusage.

Unabhängige Quellen-, Geldscope- und Abschlussprüfungen sind im JSON gebunden.
Der [gezielte Prüfbeleg](blocker3-eu-servicekostenvertrag-pruefung-20261012.json)
bindet Rechnungen, Quellenhashes und die unveränderten historischen Originale.
`proposalSHA256` wird kanonisch über das JSON ohne dieses eigene Hashfeld
gebildet; er ist noch kein Runtime-Vertragshash oder GO.
**Die externe Finanzierungsfrage ist geschlossen. Blocker3 selbst bleibt bis GO,
Umsetzung und belegter Gleichheit von Dokumentation, technischen Riegeln und
Endvalidator offen.**
