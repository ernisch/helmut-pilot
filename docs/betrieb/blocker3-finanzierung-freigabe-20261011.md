# Blocker 3: bezifferter Kosten- und Zeitvertrag zur Freigabe

Stand 11.10.2026, Repositorybasis `fe00adf537d005a56cc6d6bc28604c433cdb810d`.
**Erhaltener früherer20/27-Entwurf; keine aktuelle Freigabeempfehlung.**
Seit der Betreiberentscheidung gilt ausschließlich der
[EU-Zielvertrag für`gpt-5-mini-eu`](blocker3-eu-kostenvertrag-20261011.md).
Nachfolgende Global-/0,5-4-Rechnungen sind erhaltene historische Vorschläge,
keine aktuelle Zielplanung. Ursprüngliche JSON-Vorlage/Proposalhash bleiben erhalten.
Die hier vorgeschlagenen Grenzen sind nicht aktiviert. Blocker3 ist erst abgenommen,
wenn Dokumentation, Plan, atomare Budgetriegel und Endvalidator denselben
freigegebenen Vertrag tatsächlich verwenden.

Die [aktuelle Prüfung der zwei Voraussetzungen](blocker3-kleinerer-maximalbetrag-20261011.md)
belegt jetzt nativ GlobalStandard und den öffentlichen0,25/2-Tarif. Konto-/
Routenpreisbindung und eine kleinere vollständige Anbieter-Inputobergrenze
bleiben extern offen. Weder12/20 noch20/27 ist als Finanzierung aller zulässigen
vollständigen Läufe bewiesen. Die20/27-GO-Frage ist zurückgestellt; die
ursprüngliche maschinenlesbare Vorlage und ihr Hash bleiben unverändert als
unfreigegebener historischer Entwurf erhalten. Keine Umsetzung daraus ableiten.

## Übernommene Grundlage

[B2 ist fachlich abgeschlossen](blocker2-abschluss-20261011.md).
[PR899 / ausgerollter Kontextvertrag](blocker2-d-integration-historische-uebergabe-20261011.md)
schließt die technische Übergabe mit **500/500 nichtleeren gültigen Kontexten**:
468 regulär,32 begrenzt historisch. Production ist READY auf
`1ad00cd464f88f37a1adc3417b2758ab1eb24e80`, Deployment
`dpl_76HSdbWhPMaDRJzQqQ1GsrGx3wcE`; hier nochmals rein lesend bestätigt.
Die übernommene Nachkontrolle belegt Drift0. Installation, Aktivierung,
Journalwirkung und vollständige Production-Senderabnahme bleiben spätere
geschützte Testwirkungen; sie werden hier nicht als zusätzliche Eingabeabhängigkeit verlangt.

Für die Preisrechnung wurden die vorhandenen Originale verwendet, keine neue
Aufnahme oder Quellenfachprüfung. Alle500 Originalblätter ergeben exakt den
angenommenen Merkle-Root;500 Membership-Proofs stimmen. Für die32 historischen
Preisinputs erzeugt die native unveränderte `H.verify` echte Fähigkeiten;
die damit erzeugten Quellen und Prompts sind bytegleich zur Preisprojektion.
Die468 normalen Projektionen bleiben unverändert. Damit benötigt B3 keine
zusätzliche Kopie des upstream Senderbelegs. Native Preisbindungsreceipt:
`da2804ff489c610aa152ceac350b17275e9e6ce05ec802aea103c41937173f1d`.
Privater abschließender Handoff:
`149a37f74ac41313e45aae0df23ff6c95809f915bb576640ab4a613c5ce270c1`.
Originale und Programme liegen außerhalb von Git unter
`/workspace/private/blocker3-boundary-inputs-20261011`.

## Endgültiger Aufrufbestand und Eingaben

**500 D +500 R +0 U =1000 Production-Modellaufrufe**, seriell, ein Versuch
je Intent. R prüft2–4 Absätze und bis zu6 Paare in einem einzigen Request.
U0 gilt für den unverändert eingefrorenen vollständig verstandenen KO-Bestand.
Die drei Ergebnisbereiche je Profil ergeben1500 Sollpositionen; Ansichten,
Bilanz, Retention und Exporte benötigen keine weiteren Modellaufrufe.
Retries, Reparaturen, Backfill, Embeddings und Büro sind nicht zugelassen.
Die unabhängige Schlussprüfung wird als getrennte Entwicklungs-/Prüfarbeit
vorbereitet und wiederholt keine Production-Generierung. Ein zusätzlich
beauftragtes Production-Prüfmodell wäre ein neuer freizugebender Kostenpfad.

| Gemessene lokale Größe, alle500 Kontexte | Summe | Minimum / Median / Maximum |
|---|---:|---|
| D-Prompt, UTF8-Bytes |7045583|12638 /12893 /32030|
| D-Prompt plus Schema, o200k-Texttokens |1955057|3413 /3468 /10486|
| Vollständiger D-Request-JSON, UTF8-Bytes |7887854|14239 /14494 /34875|
| D-Request-JSON, lokale Texttokens |2027471|3548 /3604 /10755|
| Quellenkontext, UTF16-Zeichen |812333|414 /665 /15317|
| Gesamte verfügbare R-Quellen, lokale JSON-Tokens |271229|151 /201 /5573|

Tokenizer `o200k_base`, gebundenes Vokabular
`446a9538cb6c348e3516120d7c08b09f57c36495e2acfffe59a5bf8b0cfb1a2d`.
**Lokale JSON-/Texttokens sind keine Anbieterabrechnungstokens.** R bekommt
erst den zukünftigen D-Entwurf und dessen ausgewählte Quellen.250 Wörter
begrenzen nicht die Länge eines einzelnen Worts; ein kleiner R-Input darf
deshalb nicht als schon belegte natürliche Obergrenze ausgegeben werden.

## Konkrete vorgeschlagene Verbrauchs- und Geldgrenzen

Unverändert D/R je **3000 Outputtokens einschließlich Reasoning, low**;
kein Qualitätsschwellenabbau und keine Textkürzung zur Einhaltung des Budgets.
Neue technische Grenzen, erst nach GO:

- Vor HTTP vollständigen serialisierten Anbieterrequest lokal zählen:
  D≤11000, R≤14000 o200k-Tokens. Alle500 gegenwärtigen D-Requests passen.
  Ein zu großer R-Request wird vor Sendung verworfen, nicht verkürzt.
- Bestätigte Anbieterusage zusätzlich begrenzen: D≤12288, R≤16384 Eingabetokens.
  Lokale Zählung garantiert diese Anbieterwerte nicht. Die Quittungsprüfung
  schließt unerwartetes Framing ausdrücklich ein.
- Bei Quittung über der Phasecap oder fehlender/unklarer Usage sofort den
  ganzen Lauf stoppen, keinen nächsten Call und keinen Retry zulassen.
  Tatsächliche Mehrkosten verbuchen; bei Unklarheit volle Reserve behalten.
- **Jede bestehende Standardreserve bleibt0,212USD** für400000 Input/3000 Output.
  Keine proportional kleinere Reservierung und keine Freigabe alter Reserven.
  Tarif-/Modell-/Kontextbindung muss weiterhin die volle Einzelreserve tragen.

Tarif unverändert0,50USD/Mio. Input und4USD/Mio. Output;
je Call `ceil(input/2 +4*output)` Mikro-USD, erst anschließend summieren.
D kostet innerhalb der Caps höchstens18144µUSD, R20192µUSD.
Für einen vollständigen Lauf innerhalb aller Caps sind das **19,168000USD**.
Der zusätzliche Finanzierungsrahmen ist
`H=max(sum(c_i), max_i(prefix(c_1..c_(i-1))+r_i))`:
**19,359808USD**. Dieser Rahmen deckt auch einen unerwartet bis zur vollen
Einzelreserve abweichenden Call, wenn danach zwingend Schluss ist. Er ist
keine Behauptung, dass jede zukünftige D-Antwort unter die R-Cap passt.

Frische Finanzlesung `2026-10-11T09:57:02.541Z`: native Auftragskosten1,614061USD
+ bereits enthaltener externer Anteil5,195303USD =6,809364USD; offene native
Auftragsreserve0. Private ungeklärte0,636USD zusätzlich erhalten:
**7,445364USD**. MD5 `a9297ea47babf3c9903257df726c547f`, Revision476643.
15 historische offene Reserven/3,176USD bleiben vollständig erhalten und
werden nicht noch einmal als ganzer Auftrag addiert.

| Finanzrahmen für diese gewählten Caps | Exakt notwendig | Runde GO-Grenze |
|---|---:|---:|
| Neuer Lauf einschließlich Einzelabweichungsreserve |19,359808USD|dieser zusätzliche Laufrahmen bleibt hart gebunden|
| UTC-Tag bei belegtem Tagesaltbestand0, inklusive privater0,636 |19,995808USD|**20USD**|
| Kumulativer Auftrag inklusive7,445364 Altbindung |26,805172USD|**27USD**|

Das ist der kleinste aus den **gewählten** Caps und unveränderten Reserven
ableitbare Rahmen, kein global optimaler Preis und keine Erfolgsgarantie.
Der kleine Rundungsrest ist keine Freigabe weiterer Calls. Steigt die frisch
zu bindende Baseline, wird die Rechnung erneut geprüft; Grenzen nicht heimlich erhöhen.

Erwartungswert als ausdrücklich ungemessene Planung: bei je500 Outputtokens,
Framingannahme256 und R aus tatsächlichen Quellenkomponenten plus geschätztem
D-Text **4,229324USD** neu. Bei je1000 Outputtokens **6,354324USD**.
Keine der beiden Zahlen ist eine harte Obergrenze oder bestätigte Rechnung.
6USD/Tag reicht bereits im zweiten Szenario nicht;20USD kumulativ reicht
nicht für den vorgeschlagenen robusten Vertrag. Die frühere pauschale
R-Annahme5000 ist bei den beiden großen Ereigniskontexten nicht konservativ.

## Ein wirksamer Vertrag statt20/7/6

Aktuell akzeptieren `testkosten-budget`, Profilvertrag und Produktionsadapter
20 kumulativ /6 täglich. Kostenplan und Intents enthalten7/6 als Metadaten;
Admission trägt keinen gemeinsamen Finanzvertrag weiter. Der Endvalidator
`synthetik-500-nachweis` verlangt strikt7/6 und scheitert mit7,445364 bereits
ohne neuen Call. Diese technischen Grenzen wurden hier nicht geändert.

Kleinster sauberer Änderungssatz: **eine geschlossene neue Direktlauf-Version**
mit identischem Finanz-/Zeitvertraghash in Dokumentation, Kostenplan/Intents,
Admission-Slot, Command, atomarem Geldcheck, Sender und Endvalidator. Sie bindet
Auftrag/abTag, alte Bindungen/private Zusatzreserve, genau500/1500/1000,
Preis/Modell/Input-/Outputcaps, Kontext-/Quellen-/Policyhashes, Fenster,
Run/Operation/Commit/Deployment und Betreiberfreigabeoriginal.
Die private0,636USD zählt im selben CAS kumulativ und konservativ gegen den
Testtag. Native alte Ausgaben nicht doppelt als Baseline addieren.
Alle zentralen Sender während des Runs müssen dieselbe gebundene Rechnung
beachten; nicht zugelassene Konkurrenz oder neuer Scope stoppt. Alte7/6- und
20/6-Verträge und ihre Originale bleiben erhalten. Nur7→20 im Validator ist
kein vollständiger Fix.

Frische Lesung `2026-10-11T10:01:08.223224+00:00`: Tage7.–11.10. weiterhin ohne
Kostenbuch; keine globalen Counterzeilen und keine Blobusage in diesen Tagen.
Fehlendes Buch wird nicht automatisch als0 behandelt. Unter gesondert
freigegebener, idempotenter Rekonstruktion dürfen nur frisch belegte Leertage
ergänzt werden; bei Abweichung/unklarer Rechnung kein Nullbuch und kein Start.
Historische Kostenbelege, native offene Positionen und private Bindung erhalten.

Globaler Codefallback50; historisch dokumentierte Werte bleiben historische
Belege. Heute nochmals rein lesend bestätigte Production-Projektwerte:
2416 Gesamtdeckel,702 U-Reserve,200 Vorrangreserve, Fail-closed1.
Native Tageszeile fehlt, der maßgebliche Leser setzt VorverbrauchC=0.
Für die geschlossenen synthetischen IDs D/R **2416−702=1714**;
1000 passen bei **C≤714**. Kleinster Rohdeckel beiC0 und erhaltener U-Reserve
1702. **2416 bleibt unverändert.** Projektwerte und RPC-Existenz sind kein
bezahlter atomarer Reservierungstest; immutable Laufbindung frisch prüfen,
ohne eine Reservierung zum bloßen Nachweis auszuführen.

## Zeitvertrag und Kalendergrenze

1000×10s Modellzeit: **2h46m40s**;1000×20s erlaubte vollständige HTTP-Antwortzeit:
**5h33m20s**, jeweils ohne DB/CAS/Verarbeitung/Retention/Endbeleg.
Das bestehende4h-Fenster garantiert keinen vollständigen Lauf.
Planungswert **etwa5h insgesamt**, ausschließlich unter den Annahmen10s/Call,
10s weitere Verarbeitung/Unit,20min Vorbereitung und30min Endbeleg.
Es gibt keine gemessene vollständige Production-Latenz.

Konkreter Vorschlag: **9h aktives/bezahlt zulässiges Fenster +30min Endbeleg**.
500 Units mit neuem serverseitigem Gesamtbudget60s ergeben8h20m;
20min Vorbereitung und20min aktive Reserve ergeben9h. Der60s-Deckel umfasst
beide20s-Modellpfade und höchstens20s gesamte weitere Unitverarbeitung.
Nicht nur einen Clienttimer setzen: Deadlines durch HTTP/DB/CAS/Retention
führen, laufende Wirkungen abrechnen/beruhigen; keine nächste Unit, wenn
Wirkung unbekannt ist.60s ist ein vorgeschlagener Riegel, keine bewiesene
Machbarkeit jeder Unit.

Endphase:501 lesende Exporte mit8 Arbeitern und jeweils20s Vollrequestcap
→ höchstens21min;60s Endkontrolle +5min lokale Finalisierung →27min,
innerhalb30min. Das sind ebenfalls neu zu implementierende endliche Caps.
Bei Frist-/DB-Ausfall lautet das Ergebnis Fehler/UNKNOWN, nicht500er Erfolg.
Die1500 Positionen, bestätigte Verbrauchsquittungen und0 aktiv bleiben Pflicht.

4h ist auch in SQL-Wächter-CHECK/Arm-Funktion und Endruntime hart verdrahtet.
9h verlangt deshalb eine gezielte neue Zeitvertragsversion **und Migration-GO**,
neben JS-Intents/Admission/Route/Executor/Endvalidator/Profil-/Startschutz.
30s-Wächterprinzip und unabhängige Endsteuerung erhalten. Die geänderte
Fristbindung gezielt prüfen; die unveränderten B4-Belege weiterverwenden.
Der vollständige spätere Command braucht einmal seinen eigenen Transport-/CPU-/
Speichernachweis; der bereits belegte3,107GB-Draft/2,805MB-Envelope ist dafür
kein vollständiger Finalcommandbeleg. Dies gehört zur Ausführungsvorbereitung.

Aktueller Kontextvertrag bindet den Berliner Aufnahmetag **11.10.2026** und
gleichen UTC-Ausführungstag. Beispiel, **kein Test-GO**:12:00–21:00UTC aktiv,
Endbeleg bis21:30UTC.9h müssen strikt vor22:00UTC/Berliner Tageswechsel enden;
Start deshalb strikt vor13:00UTC. Datum nicht automatisch verschieben.
Nach Ablauf darf dieser Vertrag keinen Test starten; eine andere Kalenderbindung
braucht einen ausdrücklich geprüften und freigegebenen Anschlussvertrag.

## Exakte Betreiberfreigabevorlage

| Feld | Konkreter freizugebender Umfang |
|---|---|
| **Änderung** | Einen geschlossenen Direktlauf-Kosten-/Zeitvertrag mit den obigen Caps implementieren, gezielt testen, unabhängig prüfen, nach grüner CI ausrollen; Tages20/ Auftrag27 ausschließlich an diesen Run binden; private0,636 im CAS, belegte fehlende Tagesbücher rekonstruieren; gemeinsame9h-Zeitversion einschließlich gezielter SQL-Wächter-/Endruntime-Migration. Keine automatische Installation/Aktivierung/Testwirkung. |
| **Umgebung** | Helmut Production, Vercel helmut-pilot/nohut; Supabase ddckuvvpcytqbyfmbvie. Ausgangsdeployment1ad00cd4, finalen geprüften Änderungskopf, READY-Deployment, Migration und Vertrags-/Run-/Operationshash vor jeder Wirkung binden. |
| **Benötigte Grenze** |20USD/UTC-Tag,27USD kumulativ inklusive Altbindungen; zusätzlicher Runrahmen19,359808USD. Billed Input D12288/R16384, lokale Requests11000/14000; Output jeweils3000/low.1000 Calls, vorhandener Gesamtdeckel2416 und Reserven unverändert.9h aktive Frist +30min Endbeleg. |
| **Erwartete maximale Gesamtkosten** | Planung4,229324USD neu, ungemessen; maximal19,168000USD für vollständigen capkonformen Lauf; mit Einzelabweichungsreserve19,359808USD neu, einschließlich Altbindung maximal26,805172USD gebunden. Fehlende/abweichende Quittung stoppt statt weiterer Generierung. |
| **Risiko** | Anbieterframing/R-Text kann Cap überschreiten;60s-Unit kann zeitlich scheitern; große Command-/DB-/Speicherpfade, unbekannte Abrechnung, Konkurrenz oder Tagesdrift können den Lauf stoppen. Keine Garantie fachlichen500er Erfolgs. Kein Textkürzen und keine Reservefreigabe zur Umgehung. |
| **Rein lesende Nachkontrolle** | Frischer Auftrag/alle Tagesbücher/alle offenen Bindungen/Privatreserve, VorverbrauchC, unveränderliche Route-/Code-/Deployment-/Vertragshashes, Caps und500 Kontextbindungen. Nach Umsetzung dieselbe Version in Plan/CAS/Sender/Endvalidator/SQL-Wächter;0 neue Profile/Commands/Journalwirkungen/Modellcalls aus diesem GO. Nach separat freigegebenem Test alle1000 Tickets/Quittungen,1500 Positionen, Endzeit und0 aktiv unabhängig prüfen. |
| **Rückweg** | Neue rungebundene Freigabe sperren/auslaufen lassen, vorigen Runtime-/Konfigurationssnapshot gezielt wiederherstellen; SQL nur mit kompatiblem gebundenem Rückweg. Angefallene Kosten, Reserven und Originale erhalten; keine alte Grenze unter bereits gebundenen Bestand zurücksetzen. Profil-/Command-/Test-Rückweg erst im separaten Test-GO. |

Der [maschinenlesbare Vorschlag](blocker3-freigabevertrag-20261011.json) ist
ausdrücklich inert und unfreigegeben. Dieser Vorschlag ist die konkrete
Freigabegrenze; die fachlichen B1/B2/B4-Abnahmen werden nicht wiederholt.
**Blocker3 bleibt offen bis zur Umsetzung, Nachkontrolle und unabhängigen Abnahme.**
