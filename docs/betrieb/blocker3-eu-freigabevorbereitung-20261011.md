# Blocker 3: EU-Vorbereitung bis zur einzigen externen Beweisgrenze

Stand11.10.2026. **Keine Ausführungsfreigabe, kein wirksamer neuer Budgetvertrag.**
Der [EU-Belegvertrag](blocker3-eu-kostenvertrag-20261011.json) ist die Quelle für
Route, Oktoberpreis, finale B2-Eingaben und unveränderte Qualität.
Die [maschinenlesbare Freigabevorbereitung](blocker3-eu-freigabevorbereitung-20261011.json)
enthält sämtliche Verbraucher, späteren Freigabefelder, Stoppbedingungen und
Endbelegfelder. Ihr Vorbereitungshash ist kein Runtimevertrag oder GO.
`preparationSHA256` wird über den kanonischen JSON-Inhalt **ohne dieses eigene
Hashfeld** gebildet. Der gezielte Test prüft ihn mit dem Repository-Hasher
und gleicht Aufruf-/Kosten-/Freigabewerte beider JSONs ab.

## Abgeschlossene unabhängige Vorbereitung

Natives Ziel: ausschließlich`gpt-5-mini-eu`, AzureDataZoneStandard,
SwedenCentral, Modell2025-08-07, NoAutoUpgrade, Responsesv1.
Kontospezifischer Oktoberpreis01.–31.10.2026:
**0,275USD Input/2,20USD Output je Million Tokens**.
Öffentlicher Tarif und MCA-Meter stimmen überein. Keine erneute Preis-/B2-Aufnahme.

Final übernommen:500 angenommene D-Kontexte,468 regulär/32 historisch,
**500D+500R+0U=1000 Modellaufrufe**, ein Versuch, Modellparallelität1.
3000 Outputtokens einschließlich Reasoning, reasoning`low`, vollständige
Prüftexte, Quellen-/Paarurteile und1500 Abnahmepositionen bleiben erhalten.
Eventuelle Anbieter-Zählrequests sind noch nicht autorisiert; Anzahl, Gebühren
und Quoten hängen vom fehlenden Microsoft-Beleg ab. Kein weiterer U-Pfad.

Die [Offline-Vorbereitung](../../scripts/blocker3-eu-vorbereitung.js)
rechnet in ganzzahligen MikroUSD, prüft unveränderte Vertragswerte und bindet
vollständige Sendebytes samt Schemahash. Sie ist **nicht in den Production-Sender
importiert**. Der Inputguard gibt für D und R immer
`canReserve:false, canSend:false` zurück. Behauptete lokale Tokenwerte oder
lange zukünftige R öffnen ihn nicht. Er kürzt nichts. Diese vorbereitete
Schnittstelle ersetzt keine Anbieterobergrenze und belegt keine bereits
wirksame Production-Inputabsicherung.

Gezielte Tests prüfen Geldrundung, serielle Reservespitze, unbekannten
ersten/letzten Call, Überlauf, doppelte Privatbindung, falsche Route,
unzulässige Freigabeflags, veränderte Qualität, Body-/Schemadrift und
unveränderte lange zukünftige R-Texte:

    node --require ./scripts/run-offline-tests.js scripts/blocker3-eu-vorbereitung-test.js
    node scripts/blocker3-eu-vorbereitung.js --contract docs/betrieb/blocker3-eu-kostenvertrag-20261011.json

Acht Prüfgruppen bestanden; unabhängige Flash-High-Leseprüfung der Vorbereitung positiv.\nSol ergänzte strengere Ablehnungsassertions und den automatisierten kanonischen\nHashabgleich; erneut gezielt bestanden. Der [gebundene Prüfbeleg](blocker3-eu-vorbereitungspruefung-20261011.json)\ntrennt Review, lokale Tests und fehlende Runtimeabnahme. Keine Production-/Budget-/Reserve-/Profilwirkung.

## Kostenloser Microsoft-Belegcheck

Offizielle Quellen einschließlich aufgelöster INCLUDE-Inhalte gelesen;
Originalhashes im EU-JSON. Quellen und Geld-/Zeitverbraucher wurden durch
getrennte Flash-High-Helfer geprüft.

| Microsoft-Quelle | Beleg | Vollständige Inputobergrenze? |
|---|---|---|
| [APIM Tokenlimit](https://learn.microsoft.com/en-us/azure/api-management/llm-token-limit-policy) | Responses; vorher Promptschätzung, nachher Usage; mögliche Überschreitung | Nein. Quota/Schätzung ist kein vollständiger Abrechnungsdeckel. |
| [Structured Outputs](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/structured-outputs) | GPT-5-mini, strict JSONschema | Keine vollständige Schema-/Framingzählregel. |
| [Chat-Tokenbeispiel](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/chatgpt) | Lokale modellabhängige Abschätzung | Kein Vollzählbeleg für diese Azure-Responsesroute. |
| Bereits gebundene Responses-/Modellreferenzen | API-Felder und große Servicelimits | Kein dokumentierter kleiner Vollinputdeckel. Eine Dokumentationslücke beweist keine native Nichtunterstützung. |

Communityfrage laut Betreiber gestellt; hier keine externe Nachricht,
kein29USD-Supportfall, kein Testcall auf eine undocumented API.

**Microsoft muss genau einen autoritativen Beleg liefern:** entweder
unterstützte Vorabzählung mit sicherer Obergrenze der späteren
`usage.input_tokens` für denselben unveränderten Body, oder vollständige
nachprüfbare Tokenisierungs-/Framingobergrenze für`/openai/v1/responses`,
`gpt-5-mini-eu`, DataZoneStandard/SwedenCentral, Modell2025-08-07.
Er muss Stringinput, vollständiges`text.format`-Schema einschließlich
Name/strict und sämtliche intern abgerechneten Framingtokens umfassen.
Bei Vorabzählrequests müssen Unterstützung, Gebühren und Quoten geklärt sein.
Eine Communityantwort genügt nur mit belegbarer Microsoft-Autorität und dieser
Zusicherung.

Daraus folgen lokal alle500 unveränderten D und die gesamte bereits zulässige
zukünftige D→R-Hülle. Kein256-Token-Aufschlag, kein empirischer R-Maximalwert,
kein engerer Antwortfilter. Überschreitungsabbruch schützt Geld, beweist aber
nicht die Finanzierung aller fachlich zulässigen500 Ergebnisse.

## Vorbereitete kleinste Finanzierungsrechnung

**Bedingte Kandidaten, noch kein abschließender Entscheid:**
D12288/R16384 vollständige Anbietereingabetokens, je3000 Outputtokens.

| Wert | USD |
|---|---:|
| D je Call | 0,009980 |
| R je Call | 0,011106 |
| Genau1000 vollständige Calls | 10,543000 |
| Serielle Finanzierungsspitze H mit unveränderter0,212-Reserve | 10,743894 |
| Tagesbindung bei frisch bewiesenem Altverbrauch0, inklusive Privatreserve | 11,379894 |
| Kumulative Bindung inklusive erhaltener7,445364 Altbindung | 18,189258 |

`H=max(volle Kosten,max(abgerechneter Prefix vor Call+0,212))`.
1000 gleichzeitige Reserven von zusammen212USD sind bei serieller Ausführung
mit bestätigter Abrechnung vor dem nächsten Call nicht nötig. Unbekannte Calls
behalten ihre volle Reserve und stoppen.

Kumulativ7,445364 enthält **1,614061 nativ+5,195303 bereits extern
eingebunden+0,636 privat**. Privat nicht nochmals addieren. Historische Belege,
sämtliche bestehenden Reserven und alte Tarife erhalten; keine rückwirkende
Umwertung. Datiertes Basiszeugnis ist kein frischer Startnachweis.
Fehlende Tagesbücher sind unbekannt, nicht Null; Rekonstruktion nur aus
vollständig frisch belegten nativen Vorgängen mit Originalbindungen.

Unter diesen Kandidaten wäre12USD der kleinste ganze Tagesdollarrahmen;
20USD bestehender Auftrag genügte. Tagesrest für tatsächlichen Altverbrauch
**und etwaige Zählgebühren/-reservespitzen**:0,620106USD; Auftragsrest1,810742USD.
Kostenpflichtige Vorabzählung verändert Gebühren/H. Keine Nullannahme.
Finale Anbieterhüllen können die Rechnung ändern. Deshalb **12/20 noch nicht
sicher freigeben**, auch nicht als mathematisch kleinsten Rahmen behaupten.
20-täglich/27-Gesamt wird nicht empfohlen.
Unvermessene Kostenszenarien2,326449/3,495264/8,170264USD bleiben Prognosen.

## Gemeinsamer Vertrag vom Start bis zum Endvalidator

Aktuell akzeptiert Sender-/Auftragsversion20USD, Adapter zusätzlich7USD,
Tagesriegel6USD; Kostenplan/Endvalidator weiterhin7 kumulativ/6 täglich.
Schon7,445364 Altbindung übersteigt7. Ein unveränderter direkter Lauf hätte
keine konsistente Endkostenabnahme; der Tagesriegel kann vorher stoppen.

Kleinste saubere Änderung: **eine neue ausdrücklich laufgebundene EU-Version**,
mit Route/Modell, Oktober-Metern, kompletter Inputmethode/-hülle samt Gebühren,
Output/Qualität,1000 Calls, Geld/Zeit und kanonischem Gesamthash.
Alle Verbraucher der JSON-Matrix verwenden denselben Hash: Intents, Plan,
Admission, Command, CAS, Sender, Startschutz, Executor, Endvalidator und beide
nativen Zeitverbraucher. Alte7/6/4h- und historische20er Verträge erhalten.

Erst nach Microsoft-Beleg diese Version finalisieren/implementieren. Der
bestehende20er Auftrag bleibt; keine neue27er Bindung. Private Reserve muss in
den atomaren Geldcheck. Aktuell ist die neue Runtimeversion **nicht implementiert**.

## Aufrufdeckel und Zeit

Codefallback50 ist kein Productionbeleg. Historische Productionwerte:
global2416, U-Reserve702, Realpriorität200, Failclosed1.
2416 lässt1714 synthetische D/R;1000 passen bei **frischem Used≤714**.
Die200 nicht nochmals vom synthetischen D/R-Rahmen abziehen.
Mindestdeckel bei Used0 und erhaltener702er Reserve:1702.
Keine Grenze ändern; native ENV/atomarer Usedstand später frisch binden.

Unvermessene Gesamtprognose etwa5h. Vorschlag: **9h aktiv+30min Endbeleg**.
500×60s Einheit+20min Setup+20min Puffer=9h.
Je Einheit20s D+20s R+höchstens20s für alle sonstige Arbeit einschließlich
Vorabzähler/DB/CAS/Verarbeitung.501 Exportlesungen mit8 Workern,20s vollständige
Requestfrist:21min;1min Endlesung+5min Offlineabschluss=27min.

Das ist ein **harter Tätigkeitsrahmen, keine500-Erfolgsgarantie**.
Fristen bis DB/CAS/HTTP/Counter durchreichen; äußeres Promiseabbrechen reicht
nicht. Unklarer Effekt stoppt und erhält Reserven. Keine Wiederholungen.
Gültige20s Anbieterfrist/30s Endwächterbelege wiederverwenden.
Bestehende4h decken1000×20s schon rechnerisch nicht.
Spätere gezielte SQL-Migration: neue hashgebundene9h-Version; alte
4h-Prüfzweige/CHECKs für historische Versionen erhalten. Keine globale Lockerung,
keine jetzt ausgeführte Migration.

Aktuelles Quellen-/Berlin-Tagesbinding11.10.:9h-Start **streng vor13UTC**,
aktives Ende streng vor22UTC. Verpasstes Fenster nicht automatisch auf anderen
Tag schieben. Diese Vorbereitung autorisiert keinen anderen Quellenstand/Tag.
Kalender ist ein frisches Startbinding, keine zusätzliche Anbieter-Beweisfrage.

## Spätere Freigabefelder vollständig vorbereitet

Jetzt kein GO erbeten. JSON enthält zwei Vorlagen mit Änderung, Umgebung,
Grenze, maximalen Kosten, Wirkung, Risiko, rein lesender Nachkontrolle,
Rückweg und allen späteren frischen Bindungen:

1. **EU-Vertrag/Route/Rollout:** Nach Inputbeleg gemeinsame Version umsetzen,
   gezielt testen/unabhängig prüfen, grüne Pflichtchecks; exakt freigegebene
   laufgebundene Tagesgrenze, bestehender20-Auftrag, gezielte SQL-Zeitmigration.
   Production`AZURE_OPENAI_DEPLOYMENT=gpt-5-mini-eu`, kontrollierter Redeploy,
   eng erneuerte gültige readonly Runtimeautorisierung. Sensitive aktive Route
   noch nicht im Klartext belegt. Nachkontrolle: native READY/Commit/EU-SKU/
   Vertragshash, Bücher/Reserven/Counter und neue SQL-Zeitversion. Rückweg:
   native Vorherbilder, letzter READY/frühere isolierte Politik; alle
   Buchungen erhalten, kein Globaltest. **Command/Profile/Journal/bezahlte
   Calls ausgeschlossen.**

2. **Genau ein geschützter500er Lauf:** Separates Test-GO für hashgebundene
   Commandinstallation samt vollständigem Transport-/CPU-/Speicherbeleg,
   genau500 gleichzeitig aktive Synthetikprofile330/120/50, Journalwirkung,
   exakt500D/500R/U0, nur ausdrücklich finanzierte Vorabzählung.
   Frische Geld-/Counter-/Route-/Kalendergates. Nachkontrolle: nativ0 aktiv,
   1000 Tickets/Usage,1500 Abnahmepositionen, Endwächter und Kostenabgleich.
   Rückweg: geschützter nativer End-/Stopppfad; unbekannte Reserven/Belege
   erhalten, kein zweiter Lauf.

Original-GO, Run-/Command-/Vertragshashes, native Startwerte und Fenster
sind Pflichtfelder vor Wirkung. Zukünftige Integrationstests sind in der JSON
benannt, nicht als jetzt bestanden ausgegeben.

## Endbeleg und verbleibende Grenze

Endbeleg: gemeinsamer EU-Vertrag/Microsoft-Methode/Tarifmeter,1000 genaue
Bodies/Schemas/Intent-/Attemptbindungen, native Tages-/Auftragsanfangsstände,
Usage/MikroUSD je Call samt etwaigen Zählgebühren, Settlements/ungeklärte
erhaltene Reserven und Privatprovenienz genau einmal, Counterdelta, Fristen,
1500 Abnahmepositionen und nativ0 aktiv. Prognosen ersetzen keine native Usage.

Unabhängige Vorbereitung ausgeführt. **Blocker3 bleibt offen.**
Extern fehlt ausschließlich der vollständige Microsoft-Inputbeleg.
Danach lokal Methode/unveränderte universelle D→R-Hülle/kleinsten Rahmen
finalisieren und an den vorbereiteten konkreten GO-Grenzen anhalten.
