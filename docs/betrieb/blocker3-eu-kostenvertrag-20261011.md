# Blocker 3: ausschließlich europäischer Zielvertrag

Stand11.10.2026. **Verbindliche Zielroute ist `gpt-5-mini-eu`.**
Die Betreiberentscheidung legt den Zielnamen fest, erteilt noch kein GO für
Production-Konfiguration, Budget, Rollout oder kostenpflichtige Modellaufrufe.
GlobalStandard ist keine zulässige Alternative für diesen Nachweis oder dessen
Zielplanung. Historische Global-Belege und die unfreigegebene20/27-Vorlage bleiben
erhalten. Dieser [maschinenlesbare EU-Vertrag](blocker3-eu-kostenvertrag-20261011.json)
ersetzt sie als aktuelle Zielplanung; **Blocker3 ist noch nicht abgenommen**.

## Nativ belegte Identität, Tarif und Grenzen

Azure-Management-GET am`2026-10-11T10:49:30.987142+00:00`: Resource
`helmut-resource`, Resourcegruppe`helmut-rg`, Region`swedencentral`, Deployment
**`gpt-5-mini-eu`**, SKU**DataZoneStandard**, Kapazität250, ZustandSucceeded.
Modellfamilie`gpt-5-mini`, Version**2025-08-07**, **NoAutoUpgrade**.
Azure meldet zusätzlich **`capabilities.area=EUR`** und Responses-Unterstützung.
Native Quoten:250 Requests und250000 Tokens je60s; das sind Ratenlimits,
keine kleinere feste Grenze abgerechneter Inputtokens je Request.
Account-OpenAI-Endpunkt`https://helmut-resource.openai.azure.com/`.
Deploymentoriginal1026 Bytes, SHA256
`996ba6a031225e3ed50ccd419671cdf069f345d5ceeaa38bef2892cce2601d8c`.
Die [Microsoft-SKU-Beschreibung](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/deployment-types)
bindet DataZoneStandard in dieser europäischen Region an die europäische
Data Zone nach Azure-EU-Data-Boundary-Definition. Das ist keine Zusicherung
eines einzelnen schwedischen Rechenzentrums; die Zone kann EFTA-Regionen umfassen.

[Offizielle Preisabfrage](https://prices.azure.com/api/retail/prices?%24filter=contains%28meterName%2C+%27GPT+5+Mini%27%29+and+armRegionName+eq+%27swedencentral%27&currencyCode=%27USD%27)
frisch am`2026-10-11T10:49:47.646915+00:00`, USD, Consumption, Einheit1M:

| Passender synchroner, nicht gecachter Data-Zone-Meter | USD/Mio. | Meter-ID |
|---|---:|---|
| GPT5 Mini Inpt DZone |0,275|ba8737fb-3392-5ead-80cf-14de6801f5fb|
| GPT5 Mini outpt DZone |2,20|68cae02f-c5bd-5272-96de-fcdddf816ef7|

Keine Cache-/Batchrabatte und kein Globalpreis für den EU-Lauf.
Öffentliches Original7563 Bytes, SHA256
`9e2b05864e10d9c9376704cfe8ac1154cdec4ff837ce6070d62b98617e013d1f`.
**Der öffentliche Tarif ist dieser nativen EU-SKU zugeordnet. Der am11.10.
übergebene Betreiberexport schließt den kontospezifischen Septemberpreisnachweis,
aber noch nicht dessen Gültigkeit für den Oktoberlauf.** Die frühere native
Billing-Lesung erhielt403/AuthorizationFailed für
`Microsoft.Billing/billingProperty/read`; sie widerlegt den neuen Betreiberbeleg
nicht. Keine Berechtigung geändert oder neue Billing-Abfrage gestartet.

### Kontospezifischer Septemberbeleg und exakt fehlender Oktoberbeleg

Die übergebenen Dateien`helmut_gpt5mini_eu_price_evidence_sep2026.json` und`.csv`
enthalten exakt zwei vollständig übereinstimmende Zeilen. Beide Meter-IDs,
Consumption, RegionSE Central, Einheit1M und Preise stimmen mit der oben
gebundenen aktuellen öffentlichen Data-Zone-Abfrage überein. **UnitPrice,
BasePrice und MarketPrice sind jeweils0,275USD Input beziehungsweise2,20USD
Output. Currency istUSD, BillingCurrencyEUR.** Die Zuordnung zum Helmut-
Billingprofil wird als ausdrückliche Betreiberangabe übernommen; keine neue
unabhängige Billingprofil-/Subscription-Abfrage behaupten.

Beide Zeilen gelten laut EffectiveStartDate/EffectiveEndDate vom
**01.09.2026,00:00:00 bis30.09.2026,23:59:59**. Nach den
[Microsoft-Preisblattdefinitionen](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/mca-understand-pricesheet)
begrenzen diese Felder den Preisblatt-Abrechnungszeitraum; gleiche Unit-/Base-/
MarketPrice-Werte sind keine Zusicherung für den folgenden Monat. Der aktuelle
öffentliche Oktoberpreis ergänzt die Meter-/Preiszuordnung, verlängert aber
nicht den kontospezifischen Septemberzeitraum. Deshalb bleibt die aktuelle
Laufpreisbindung unbewiesen; die bestehenden bedingten EU-Berechnungen ändern
sich nicht.
Auch BasePrice ist keine nachgewiesene dauerhafte Preisobergrenze: Die
[Microsoft-Azure-Produktbedingungen fürMCA](https://www.microsoft.com/licensing/terms/productoffering/MicrosoftAzure/MCA)
lassen Preisänderungen zu; eine kontospezifische Preisgarantie liegt nicht vor.

**Für die Preisbindung fehlt ausschließlich:** ein aktueller Oktober2026-
Preisblattauszug aus demselben Helmut-Billingprofil mit den beiden oben
genannten Meter-IDs, RegionSE Central/Data Zone, Consumption, Einheit1M,
CurrencyUSD, UnitPrice und Gültigkeits-/Abrechnungszeitraum, der den geplanten
Lauftag umfasst. Alternativ genügt eine offizielle kontospezifische Microsoft-
Preisbestätigung für genau diese beiden Meter und diesen Lauftag. Keine fertige
Oktoberrechnung nötig; Microsoft stellt ein
[Preisblatt des laufenden Monats](https://learn.microsoft.com/en-us/rest/api/cost-management/price-sheet/download-by-billing-profile?view=rest-cost-management-2025-03-01)
für das Billingprofil bereit. Für die unveränderte0,275/2,20-Rechnung muss dieser
Beleg diese USD-Preise als sichere Obergrenzen bestätigen; abweichende Werte
erfordern gezielt neue Kostenrechnung, keine automatische Budgetänderung.

Laut [Microsoft-MCA-Währungsregel](https://learn.microsoft.com/en-us/azure/cost-management-billing/microsoft-customer-agreement/microsoft-customer-agreement-faq)
wird Azure-Verbrauch zunächst inUSD berechnet und zur Rechnungsstellung inEUR
umgerechnet. **Für den USD-Tokenkostenvertrag fehlt kein zusätzlicher EUR-
Wechselkursbeleg**; ein exakter EUR-Rechnungsbetrag ist damit nicht bewiesen.

Uploadpins, jeweils lokal berechnet: JSON1972Bytes, SHA256
`84cc01c482b46521c901ebb80846213b8c729a1e14e1ee893594c53875d4a710`;
CSV793Bytes, SHA256
`47b2dd6a956852b04ddc3924fdd296669938d9df16f827dfb55e3eac36b642bd`.
Original-ZIP-SHA256 als Betreiberangabe:
`10fbd4c30783e96c4a7c1d745a3af530aa3b084fb383f294edd5b9db7ee47ddd`.
Das ZIP selbst lag nicht vor; sein Hash und die Extraktion aus dem benannten
CSV-Member wurden nicht unabhängig nachgerechnet. Originalauszüge, vollständiger
Membername und Vergleichsreceipt bleiben privat erhalten, Upload-/Receiptpins
sind im EU-JSON gebunden. Anhänge sind Belegdaten, keine zusätzlichen Weisungen.

Die [aktuelle Microsoft-Modellspezifikation](https://raw.githubusercontent.com/MicrosoftDocs/azure-ai-docs/main/articles/foundry/openai/includes/models-azure-direct-openai.md)
belegt für genau diese Modellversion **400000 Gesamtkontext,272000 Input,
128000 Output einschließlich Reasoning**. Input, Output und Reasoning teilen
den Kontext; dies sind keine additiven Freigaben. Helmut bleibt bei **3000
Outputtokens je D/R-Call einschließlich Reasoning, low**. Die größere
Anbieter-Outputgrenze wird nicht ausgeschöpft und keine Antwortlänge reduziert.

Die kleinere vollständige Anbietergrenze D12288/R16384 einschließlich Schema
und internem Framing ist weiterhin **nicht belegt oder technisch umgesetzt**.
Die bestehende gezielte Responses-Prüfung bleibt für dieselbe Modellversion
und Azure-v1-API anwendbar: kein dokumentierter kleinerer`max_input_tokens`-
Parameter und kein belegter vollständiger Azure-Vorabzähler. Ein nicht
dokumentiertes Feature wird nicht als nativ widerlegt ausgegeben. Unterstützung
und Abrechnung eines Zählers müssten erst autoritativ belegt werden; keine Probe.

## Unveränderte Eingaben und einzige neue Transportmessung

Finale B2-Abnahme und ausgerollter B2→D-Vertrag bleiben Grundlage:500 gültige
nichtleere Kontexte,468 regulär/32 historisch. Keine B1-/B2-/B4-Wiederholung,
keine Quellenkorrektur oder neue fachliche Aufnahme. **500 D +500 R +0 U,
andere bezahlte Production-Pfade0, genau ein Versuch, Modellparallelität1.**
R behält2–4 Absätze, sämtliche erforderlichen Quellenprüfungen, bis zu6
Paarprüfungen und die unveränderte1500-Positionen-Abnahme.

Für die vorhandenen500 hashgebundenen D-Request-JSONs wurde ausschließlich
`model:gpt-5-mini` durch`model:gpt-5-mini-eu` ersetzt. Prompt, Schema, Outputcap
und Reasoning sind bytegleich erhalten. Keine neuen Anbieteranfragen.

| Lokale EU-Requestmessung | Minimum | Median | Maximum | Summe |
|---|---:|---:|---:|---:|
| Vollständiges D-JSON, o200k-Tokens |3550|3606|10757|2028471|
| Vollständiges D-JSON, UTF8-Bytes |14242|14497|34878|7889354|

Jedes JSON wächst um2 lokale Tokens und3 Bytes. Die500 neuen Bodyhashes
stehen im privaten`eu-D-wire-localtokens.json`; dessen Originalhash ist im
EU-Vertrag gebunden. D-Prompt plus Schema bleibt1955057 lokale Tokens.
Tokenizer/Vokabular bleiben unverändert. **Das ist eine lokale Preisprojektion,
kein Production-Sendernachweis und keine Anbieterzählung.**
Die zukünftigen vollständigen R-Requests sind erst nach echten D-Antworten
bekannt. Das Modellnamensuffix behebt deren Token-/Framinglücke nicht.

## EU-Kostenrechnung und Entscheidung über12/20

Je Call auf ganze Mikro-USD aufrunden:
`ceil((275*inputTokens +2200*outputTokens)/1000)`.
Bestehende0,212USD-Einzelreserve,0,636USD private Reserve und konservative
7,445364USD Altbindung bleiben erhalten; keine historischen Kosten neu bepreisen.
Die Altbindung setzt sich aus1,614061USD nativem Verbrauch plus bereits
enthaltenen5,195303USD externem Anteil plus0,636USD privater Reserve zusammen.
**Die private Reserve ist in7,445364 bereits enthalten** und wird kumulativ
nicht erneut addiert. Der Tagesansatz berücksichtigt sie separat neben H und
dem vor Freigabe frisch zu belegenden Tagesaltbestand.

**Bedingte Rechnung unter noch unbewiesenen billed Caps D12288/R16384:**
D9980µUSD, R11106µUSD;500×(9980+11106)=10543000µUSD.
`H=max(sum(c_i),max_i(prefix(c_1..c_(i-1))+212000))` berücksichtigt eine
unaufgelöste volle Einzelreserve und den danach zwingenden gesamten Runstopp.

| EU-Rechnung, bedingt auf Tarif und Caps | USD |
|---|---:|
| Vollständiger capkonformer neuer Lauf |10,543000|
| Neuer Finanzierungsrahmen H |10,743894|
| UTC-Tagesbindung inklusive privater Reserve, bei frisch bewiesenem Altverbrauch0 |11,379894|
| Kumulativ inklusive unveränderter7,445364 Altbindung |18,189258|

Damit ist **12USD der kleinste ganze bedingte UTC-Tagesrahmen**; der bestehende
20USD-Auftrag wäre ausreichend. Tagesverbrauch über0,620106USD oder eine
höhere frisch belegte Baseline erfordern eine erneute Rechnung vor Freigabe.
Fehlende Tagesbücher bedeuten weiterhin nicht0; vorhandene Rekonstruktions-
und Reservebedingungen bleiben verbindlich. Der Aufrufdeckel2416, U-Reserve702
und StartbedingungVorverbrauch≤714 bleiben unverändert;1000 D/R passen rechnerisch.

Erwartungsrechnungen aus unveränderten lokalen Komponenten und der ausdrücklich
unbewiesenen256-Token-Framingannahme: bei durchschnittlich500 Outputtokens je
Call **2,326449USD**, bei1000 **3,495264USD**; bei3000 **8,170264USD**.
Diese Schätzungen senken die3000er Outputcap nicht, bestätigen keine Rechnung
und sind keine Anbieterobergrenzen.

Die allgemeine272000er Service-Inputgrenze allein ergibt bei3000 Outputtokens
**0,0814USD je Call beziehungsweise81,4USD für1000 Calls**; inklusive einer
unaufgelösten0,212-Reserve H81,5306USD, Tagesbindung82,1666USD und kumulativ
88,975964USD. Das ist eine grobe Servicehülle unter dem öffentlichen EU-Tarif,
**keine erforderliche oder kleinste Budgetempfehlung für diese500 Eingaben**.
Sie zeigt, weshalb die Servicegrenze die12/20-Frage allein nicht entscheidet.

**Entscheidung:**12/20 reicht rechnerisch im Capvertrag, ist aber noch nicht
belastbar für den geforderten vollständigen Lauf bewiesen. Keine andere
kleinste sichere Grenze lässt sich ohne die beiden externen Belege festlegen.
Der größere20/27-Vorschlag bleibt historisch und wird nicht empfohlen; eine
größere Geldgrenze ersetzt keine Eingabe-/Tarifbindung.

## Was der Deploymentwechsel tatsächlich ändert

- Exakter Request-/Route-Modellname, D-Bodyhashes, davon abgeleitete Intent-/
  Plan-/Admission-/Command-/R-Receipt- und Endnachweisbindungen auf EU neu binden.
  Die Intent-**Modellfamilie** bleibt`gpt-5-mini`; nicht blind jeden Familiennamen
  durch den Alias ersetzen. Die vorhandene geschlossene Aliasfunktion unterstützt
  EU bereits; vorhandene EU-Tests sind gültige Codebelege, keine Production-Probe.
- Managementbeleg aufDataZoneStandard/Sweden Central/Version2025-08-07/
  NoAutoUpgrade binden. Öffentliche Globalpreise durch EU-Meter ersetzen.
- Für neue Calls nach gesondertem GO eine gemeinsame EU-Tarif-/Geldversion in
  CAS, Admission, Plan, Sender und Endvalidator umsetzen. Der aktuelle Code
  rechnet0,5/4; Auftrag20/Tagesriegel6/Endvalidator7 bleiben unverändert und
  verhindern derzeit die gemeinsame Abnahme. Eine ENV-Umschaltung löst das nicht.
- Semantische B2-Kontexte, Quellen, Output/Qualität,1000 Calls, historische
  Bücher/Reserven, globaler Aufrufdeckel und Endsteuerung nicht neu bearbeiten.

Die Wiederverwendung der bestehenden Modellgrundlage ist gezielt gebunden:
Modell/Version, RAI-Policy und Ratenlimits stimmen mit dem erhaltenen historischen
Global-Managementoriginal überein, SHA256
`b312b5cf18f41ed64803d13ccb5f44a1c5d34907d8032cca484bc4317120db86`.
Dieses Original ist nur Vergleichsbeleg, keine Ziel- oder Ausweichroute.

## Zeit und Fenster

Der Modell-/Prüfumfang bleibt1000 serielle Calls;250er Azure-Kapazität allein
belegt keine Laufzeit. Die bestehende ungemessene Erwartung von10s je Call
ergibt2h47min reine Modellzeit beziehungsweise rund5h einschließlich der
bisherigen Verarbeitungs-/Setup-/Endannahmen. EU-Latenz wurde nicht gemessen.
9h aktive Frist plus30min Endbeleg bleibt ein unfreigegebener technischer
Zeitvorschlag; die gegenwärtigen4h-Grenzen wurden nicht geändert. Kein garantierter
vollständiger Durchlauf und kein neues Testfenster aus der SKU ableiten.
Die B2-Kalenderbindung11.10. und der bisherige späteste9h-Start strikt vor13UTC
bleiben erhalten. Ein späterer Tag darf nicht automatisch eingesetzt werden.

## Konkrete, getrennte Freigabevorlage für die Production-Zielroute

Der Vercel-Alias wurde frisch READY am bisherigen Commit`1ad00cd4…` gelesen.
Die Production-Variable`AZURE_OPENAI_DEPLOYMENT` existiert als`sensitive`;
die API liefert ihren Wert nicht. Eine aktuelle Umschaltung aufEU ist deshalb
**nicht belegt**. Der eng begrenzte Laufzeit-Konfigurationsnachweis hat eine
abgelaufene Root-Autorisierung; keine alte Autorisierung oder rückdatierte Anfrage
wurde verwendet. Eine gültige enge Lesefreigabe ist vor der Nachkontrolle nötig.

| Feld | Konkreter Scope der späteren Routenfreigabe |
|---|---|
| Änderung | Ausschließlich Production-Variable`AZURE_OPENAI_DEPLOYMENT` auf`gpt-5-mini-eu` setzen und kontrolliert neu deployen; gültige enge Autorisierung des vorhandenen rein lesenden Konfigurationsnachweises vorbereiten. Vorher Soll-/Ist- und Rückwegbindung sichern; bei bereits nativ bestätigter EU-Konfiguration keine unnötige Umschaltung. |
| Umgebung | Vercel`helmut-pilot`, Projekt`prj_xbZ6QzTkr7YoxQI71lW59FT03IR3`, ausschließlichProduction; Azure bleibt dieselbe Resource inSweden Central. |
| Erwartete Wirkung | D/R-Sender und der gemeinsame Textmodellresolver verwenden exakt das EU-Deployment, unveränderte Version/Outputcap/Reasoning. Neue Route-/Deploymenthashes; keine automatische Global-Ausweichroute im Direktlauf. Noch keine gemeinsame günstigere Kostenbuchung oder B3-Abnahme. |
| Risiko | EU-Verfügbarkeit/Latenz nicht durch Modellproben geprüft; alte Route-/Request-/Commitbindungen werden ungültig; ENV-Änderung wirkt erst in der neuen Deploymentfassung. Fehlende frische Konfigurations-/Rückwegbindung verhindert Ausführung. |
| Rein lesende Nachkontrolle | READY-Alias/Commit/Deployment, serverseitig tatsächlich aufgelöstes Modell`gpt-5-mini-eu` und Responses-URL; native Azure-SKU/Version/NoAutoUpgrade, Hashbindungen und unveränderte Budget-/Reservedaten. Kein Modell-, Profil-, Command- oder Journalaufruf als Nachkontrolle. |
| Rückweg | Gesicherten vorherigen READY-Deployment-/Konfigurationsstand kontrolliert zurückrollen und bezahlten Lauf weiter unfreigegeben lassen. Global niemals als Ersatzlauf starten. Der gegenwärtige native Rückwegpunkt ist`dpl_76HSdbWhPMaDRJzQqQ1GsrGx3wcE`; vor Änderung frisch bestätigen. |

**Nicht enthalten:** Budget-/Tarifcode-/Aufrufgrenzenänderungen, Command-
Installation, Profilaktivierung, Journalmutation, Modelltests oder500er Ausführung.
Ein reines Routen-GO ist kein Kosten- oder Test-GO. B3-Abschluss benötigt weiterhin
den originalen Konto-/Routenpreisbeleg, die vollständige kleinere Anbieter-
Eingabeobergrenze, danach einen konkret freigegebenen gemeinsamen Geld-/Zeit-
Änderungssatz und dessen technische unabhängige Abnahme.
