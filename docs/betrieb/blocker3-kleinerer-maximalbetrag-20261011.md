# Blocker 3: Prüfung eines kleineren Maximalbetrags

## Aktuelle Entscheidung nach Prüfung der beiden Voraussetzungen

Lesungen11.10.2026,10:34–10:39UTC. **Kein endgültiger freigabefähiger
Kostenvertrag bewiesen.12USD/UTC-Tag und20USD kumulativ bleiben ein bedingtes
Rechenziel. Auch20/27 ist keine nachgewiesene Finanzierung aller zulässigen
vollständigen Läufe und wird derzeit nicht zur Freigabe empfohlen.**
Der folgende frühere Rechenstand bleibt als Beleg erhalten; seine Aussage
„Deployment-SKU fehlt“ ist durch die aktuelle native Lesung ersetzt.

Der [maschinenlesbare aktuelle Beleg](blocker3-voraussetzungen-kleinerer-vertrag-20261011.json)
bindet die privaten Originale und öffentlichen Quellen per SHA256. Keine
Budget-/Tarif-/Reserve-/Aufrufgrenze, Production-Konfiguration oder Daten geändert;
keine kostenpflichtige Production-Modellanfrage. Die finale B2-Abnahme und ihre
500/500-Kontexte werden unverändert wiederverwendet, nicht erneut geprüft.

### Offizieller Tarif und verbleibende Abrechnungsbindung

Die native Azure-Management-Lesung bestätigt `helmut-resource`, `helmut-rg`,
Sweden Central, Deployment `gpt-5-mini`, Modellversion `2025-08-07`,
SKU **GlobalStandard**, Kapazität250, ZustandSucceeded. Der OpenAI-Endpunkt im
Account ist `https://helmut-resource.openai.azure.com/`. Die Subscription-Policy
lautet `PayAsYouGo_2014-09-01`. Der öffentliche Vercel-Alias zeigt READY auf
`1ad00cd464f88f37a1adc3417b2758ab1eb24e80`; der abgebrochene neuere
Dokumentationsbuild ersetzt diesen Alias nicht.

Die [offizielle Azure-Preisabfrage](https://prices.azure.com/api/retail/prices?%24filter=contains%28meterName%2C+%27GPT+5+Mini%27%29+and+armRegionName+eq+%27swedencentral%27&currencyCode=%27USD%27)
passt zu dieser SKU und Region: **0,25USD je Million nicht gecachter Inputtokens,
2,00USD je Million Outputtokens**, synchron, ohne Batchrabatt. Inputmeter
`45f4acef-7483-5b10-8986-cea7d10ba581`, Outputmeter
`22dd2fde-fadb-570f-a541-ca915805441c`, Einheit jeweils`1M`, Consumption,
gültig ab01.08.2025. Data Zone ist für diese frisch gelesene SKU nicht der
zutreffende öffentliche Tarif. Die
[Microsoft-FAQ](https://learn.microsoft.com/en-us/azure/foundry-classic/openai/faq)
bestätigt die Zuordnung öffentlicher Retailmeter nach SKU/Region.

**Damit sind Deployment-SKU und öffentlicher Deployment-Tarif belegt,
noch nicht der kontospezifische Abrechnungspreis.** Azure verweigert dem vorhandenen
Reader `Microsoft.Billing/billingProperty/read` mit403/AuthorizationFailed.
Der alte Subscription-Consumption-Pricesheet-Weg lieferte406 mit leerem Body;
das ist kein Preisbeleg und keine belegte Aussage über den Agreementtyp.
Die [Microsoft-Dokumentation](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/migrate-cost-management-api)
unterscheidet Subscription-/EA- und Billing-Profile-/MCA-Preiswege. Keine Rolle
oder Berechtigung wurde geändert. Vercel gibt die ausgewählten als`sensitive`
gespeicherten Endpoint-/Modellwerte nicht zurück; ihr aktueller API-Lesebeleg
enthält`null`, keinen frisch aufgelösten Senderwert. Die akzeptierten B1-Belege
bleiben gültige Grundlage; sie werden nicht durch erfundene aktuelle Werte ersetzt.

Für die günstigere Buchungsversion fehlt deshalb ein aktueller originaler
Konto-/Subscription-Preisbeleg für genau diesen Tarif mit Bindung an die
zugelassene Senderroute. Ein entsprechender Betreiberexport genügt; alternativ
ist ausschließlich lesender Zugriff auf den zutreffenden Billing-Preisscope nötig.
Keine Modellprobe ist dafür erforderlich.

### Anbieter-Eingabeobergrenze vor Sendung

Der vorhandene Sender setzt3000 Outputtokens einschließlich Reasoning, low,
JSON-Schema und vollständigen Prompt. Er setzt **keine kleinere harte
Anbieter-Inputcap vor Inferenz**. Die
[Azure-Responses-Referenz](https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/azureopenai/responses)
belegt `max_output_tokens` und Usage nach der Antwort. Sie dokumentiert weder
`max_input_tokens` noch den vollständigen Vorabzähler`/responses/input_tokens`.
Der [dokumentierte OpenAI-Vorabzähler](https://developers.openai.com/api/reference/resources/responses/subresources/input_tokens/methods/count)
ist kein Nachweis seiner Unterstützung oder Kostenfreiheit am verwendeten
Azure-v1-Endpunkt. Es wurde kein solcher unbewiesener Endpoint aufgerufen.

Die wiederverwendeten500 D-Blätter haben lokal höchstens10755 vollständige
JSON-Tokens. Das beweist nicht D≤12288 Anbieter-Inputtokens einschließlich
Schema/Framing. Für R kommen die künftig erzeugten, normalisierten und neu
serialisierten D-Texte hinzu.3000 Outputtokens,250 Wörter und höchstens vier
ausgewählte Quellen belegen zusammen keine R≤16384 Anbieter-Inputtokens.
DeepSeek Pro High hat die gezielte Prüfung des Senders, der Admission, des
R-Receipts und der Textprüfung lesend mit diesem offenen Ergebnis abgeschlossen.

Die derzeit vorgeschlagenen lokalen Caps plus Usageprüfung nach der Antwort
decken einen finanzierten Abbruch, aber keine vorab durchgesetzte Anbietergrenze
für alle1000 zulässigen Eingaben. Ein unbelegter Framingaufschlag, ein frei
gesetzter Byte-/Tokenriegel oder ein zusätzlicher Abnahmefehler wegen großer
zulässiger Prüftexte würde die angefragte unveränderte Vollständigkeit nicht
beweisen. Deshalb wurde kein solcher Riegel als technisch abgenommen eingebaut.

Hier fehlt genau **eine autoritative Azure-Grundlage**: entweder ein für die
gleiche Route unterstützter vollständiger Vorabzähler/Riegel einschließlich
Schema/Framing, mit geklärter Abrechnung, oder eine vollständige belegte
Tokenisierungs-/Framingobergrenze. Daraus muss der unveränderte D→R-Übergang
aller zulässigen Texte begrenzt werden. Ein Zähler müsste an den tatsächlich
gesendeten vollständigen Body und die Route gebunden sein; ein überschrittenes
Budget dürfte keine Kürzung, keinen Ersatztext und keinen weiteren Versuch auslösen.
Lokale Testdoubles wären kein Production-Anbieterbeleg.

### Konsequenz für die Freigabe

Die erhaltene Global-Rechnung bleibt korrekt **unter ihren unbewiesenen Caps**:
9,584000USD vollständiger capkonformer neuer Lauf;9,785904USD inklusive einer
vollen unveränderten0,212USD-Einzelreserve bei anschließendem Gesamtabbruch;
10,421904USD Tagesbindung inklusive privater Reserve bei frisch belegtem
Altverbrauch0;17,231268USD kumulativ inklusive unveränderter7,445364USD Altbindung.
Diese Werte beweisen noch nicht, dass12/20 den geforderten vollständigen Lauf
sicher finanzieren. Alte Kosten werden nicht zum günstigeren Tarif nachgerechnet.

**Jetzt keine Budget-/Umsetzungs-/Rollout-Freigabe anfordern.** Erst fehlen die
beiden oben exakt bezeichneten externen Anbieter-/Abrechnungsbelege. Danach
sind der kleinste belegte Geldrahmen und dessen gemeinsame technische Umsetzung
als konkreter Änderungssatz freizugeben. Die frühere20/27-GO-Frage ist damit
bis zur belastbaren neuen Entscheidung zurückgestellt, kein Auftrag zur Umsetzung.
Blocker3 bleibt offen. Keine neue Abhängigkeit von B1/B2-Facharbeit.

## Erhaltener früherer Rechenstand

Stand 11.10.2026, Basis main `fe00adf537d005a56cc6d6bc28604c433cdb810d`.
**Noch kein kleinerer Maximalbetrag für jeden zulässigen vollständigen Lauf
bewiesen. Keine Betreiberfreigabe erhalten.** Der bestehende
[Finanzierungsvorschlag](blocker3-finanzierung-freigabe-20261011.md) bleibt
inert; die Nachfrage nach einem kleineren Betrag ist kein GO.

## Unveränderter Auftrag und Bedeutung der Grenze

Die final übernommenen500 Kontexte,500 D/500 R/U0, genau ein Versuch,
je3000 Outputtokens einschließlich Reasoning bei low, vollständige Quellen,
2–4 Absätze, bis zu6 R-Paarprüfungen und alle1500 Abnahmepositionen bleiben
unverändert. Keine Textkürzung, keine abgesenkte Qualität, keine Cache-/Batch-
Rabatte und keine Freigabe bestehender Reserven. Kein weiterer B1-/B2-Test.

19,359808USD war der Finanzierungsrahmen für die **vorgeschlagenen** Caps,
einschließlich einer vollen Einzelreserve bei Abweichung und anschließendem
Runstopp.19,168000USD ist die Obergrenze eines vollständigen **capkonformen**
Laufs. Beide Aussagen beweisen nicht, dass jeder fachlich zulässige zukünftige
D-Entwurf unter die R-Inputcap passt. Ein kleinerer frei gewählter Deckel mit
früherem Stopp wäre ebenfalls technisch durchsetzbar, beantwortet aber nicht
die Frage nach einer bewiesenen kleineren Finanzierung des vollständigen Laufs.

## Geprüfter Tokenansatz

Die bisherige Rechnung verwendet die jeweilige höchste billed Inputcap bei
allen500 Profilen. Tatsächlich gemessen: D-Request-JSON2027471 lokale Tokens
insgesamt,3548–10755 je Profil; D-Prompt plus Schema1955057 insgesamt.
Die Werte und ursprünglichen Hashbelege werden weiterverwendet, nicht neu erfasst.

DeepSeek Flash High hat gezielt Generator, Paragraphnormalisierung,
Review-Receipt, `Q.pruefQuellen`, `Q.prompt` und Responses-Body lesend geprüft:

- R erhält höchstens vier ausgewählte Quelldokumente, nicht alle27 Dokumente
  des größten Eingabekontexts. Gruppierungs-/historische Metadaten bleiben dabei
  erhalten; vier Dokumente sind keine feste Byte-/Tokenobergrenze.
- D-Output3000 begrenzt das gesamte vom Anbieter abgerechnete Outputbudget.
  Daraus ist keine Gleichheit der Tokens des normalisierten, erneut
  JSON-serialisierten R-Eingabetexts bewiesen. Die private Auswahlbegründung
  entfällt, Text wird normalisiert; Retokenisierung und Schema/Framing müssen
  trotzdem korrekt begrenzt werden.250 Wörter begrenzen keine Wortlänge.
- Lokale `o200k_base`-Tokens des kompletten HTTP-JSON sind keine bestätigten
  Anbieter-Inputtokens. Ein pauschaler Framingaufschlag, per-Profil-Billingcap
  oder weniger erwartete Outputtokens ist ohne weiteren Beleg keine strenge
  Obergrenze für alle zulässigen Antworten.

Die fehlenden Obergrenzen gehören zu B3, nicht zu einer erneut offenen
fachlichen B2-Abnahme. Eine synthetische Extremantwort oder einige bezahlte
Stichproben würden die universelle Obergrenze ebenfalls nicht beweisen.

## Größerer Hebel: tatsächlicher Tarif statt konservativer Doppelpreis

Der aktuelle technische Vertrag verlangt weiterhin0,50/4,00USD pro Million
Input/Output (`synthetik-500-kosten-admission.js`, `testkosten-budget.js`).
Alte Bücher/Tickets/Baseline bleiben exakt nach diesem Vertrag erhalten.

Die offizielle Azure Retail API wurde rein lesend am
`2026-10-11T10:19:15.862342+00:00` für GPT5 Mini/Sweden Central/USD gelesen.
Keine Modellanfrage, keine Anmeldung oder Production-Veränderung.
[Offizielle aktuelle Abfrage](https://prices.azure.com/api/retail/prices?%24filter=contains%28meterName%2C+%27GPT+5+Mini%27%29+and+armRegionName+eq+%27swedencentral%27&currencyCode=%27USD%27):

| Nicht gecachter synchroner Tarif, USD/Million | Input | Output |
|---|---:|---:|
| GPT5 Mini Global |0,25|2,00|
| GPT5 Mini Data Zone |0,275|2,20|

Die Abfrage hat keine nächste Seite. Öffentliches Original7563 Bytes,
SHA256 `9e2b05864e10d9c9376704cfe8ac1154cdec4ff837ce6070d62b98617e013d1f`,
privat unter `/workspace/private/blocker3-smaller-bound-20261011` erhalten.
Das ist ein aktueller öffentlicher Preisbeleg, **kein Nachweis der tatsächlichen
Deployment-SKU/Region oder des konto-/routengültigen Abrechnungspreises**.
Das finale B1-Dossier wird weiterverwendet; es liefert im verfügbaren Handoff
keine solche günstigere Preisbindung. Der aktuelle Admission-Vertrag setzt
weiterhin ausdrücklich den konservativen Tarif voraus.

Unter unveränderten vorgeschlagenen D12288/R16384 billed Inputcaps,
3000 Output je Call und unveränderter voller0,212USD-Einzelreserve ergibt sich:

| Rechnung in USD | Aktueller technischer Tarif | Global, bedingt | Data Zone, bedingt |
|---|---:|---:|---:|
| Vollständiger capkonformer Lauf |19,168000|9,584000|10,543000|
| Neuer Finanzierungsrahmen H inklusive Einzelabweichungsreserve |19,359808|9,785904|10,743894|
| Tagesbedarf inklusive unveränderter privater0,636 bei belegtem Altverbrauch0 |19,995808|10,421904|11,379894|
| Kumulativ inklusive unveränderter7,445364 Altbindung |26,805172|17,231268|18,189258|

Je Call auf ganze Mikro-USD aufrunden, dann summieren. Data Zone:
D9980µUSD, R11106µUSD;500×(9980+11106)=10543000.
`H=max(sum(c_i), max_i(prefix(c_1..c_(i-1))+212000))` ergibt10743894.
Alle1000 möglichen Einzelabweichungspositionen sind in der Rechnung erfasst.
Rechenbeleg SHA256
`964304518a07d6fd5db4c33271e614ca1f9e27e50a4f5e182fdc0694f46c4e85`;
lesende DeepSeek-Prüfungsmessdaten/Sourcenpins SHA256
`d6a33c544661e300e5bcd32c4aad384fd098a752e157030a597f6eb389351961`.

**Wenn** der tatsächliche nicht gecachte Tarif höchstens dem Data-Zone-Tarif
entspricht und frisch an die zugelassene Route gebunden ist, könnte derselbe
capgebundene Finanzierungsvertrag mit **12USD/UTC-Tag und dem unveränderten
20USD kumulativen Auftrag** auskommen. Antwortumfang/Qualität/Inputcaps und
Reserven würden für diese Einsparung nicht geändert. Das wäre eine neue
geschlossene Tarif-/Buchungs-/Nachweisversion für neue Calls; alte Kosten und
Originaltickets werden nicht zum günstigeren Tarif nachgerechnet.

Es genügt nicht, nur die Dokumentationsrechnung zu halbieren: Native
Abrechnung, atomarer Budgetcheck und Endvalidator rechnen heute0,50/4.
Auch im günstigeren Szenario bleibt die7USD-Nachweisgrenze schon wegen der
Altbindung widersprüchlich.6USD täglich reicht ebenfalls nicht: Allein die
unveränderten Outputobergrenzen kosten im Data-Zone-Szenario6,6USD, zuzüglich
Input und privater Zusatzreserve. Der Aufrufdeckel2416 und Zeitvertrag ändern
sich durch einen günstigeren Tarif nicht.

## Exakt verbleibende Belege vor einem kleineren freizugebenden Vertrag

1. Vorhandenes originales Management-/Preis-Handoff an die tatsächliche Route
   binden: Deployment-SKU, Region, Modell und für Konto/Route gültiger nicht
   gecachter Preis. Kein neues Modell/anderer Provider und keine bezahlte Probe.
2. Falls ein Maximalbetrag für **alle fachlich zulässigen vollständigen Läufe**
   verlangt wird: Anbieter-Input-/Schema-/Framingobergrenze und Worst-Case-
   Übergang aller zulässigen D-Outputs zu R-Inputs nachweisen. Ohne diesen Beleg
   bleibt auch die günstigere Rechnung ein capgebundener Vertrag mit Stopp.
3. Erst danach konkrete Betreiberfreigabe für eine gemeinsame neue Tarif-/
   Geld-/Nachweisversion und den erforderlichen Tagesrahmen. Keine geschützte
   Änderung aus dieser Analyse ableiten. Separates Test-GO bleibt Pflicht.

**Ergebnis:** Ein deutlich günstigerer Ansatz ist rechnerisch belegt und
erhält alle Antwort- und Qualitätsanforderungen. Der kleinere endgültige Betrag
ist noch nicht an Production bewiesen. Blocker3 bleibt offen; keine neue
Budget-/Tarif-/Production-Freigabe wurde erteilt oder umgesetzt.
