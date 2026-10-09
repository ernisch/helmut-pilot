# Blocker 3: Kosten und Zeit aus der tatsächlichen 500er Aufnahme

Stand 09.10.2026; Basis `main` `eebb2c51`. **Blocker 3 bleibt offen.**
Alle unabhängigen Rechnungen sind vorbereitet. Blocker 2 ist fachlich noch
nicht abgenommen; keine Budget-, Aufrufgrenzen-, Konfigurations- oder
Reservierungsänderung und kein bezahlter Modellaufruf in dieser Fortsetzung.

## 1. Übernommene Belege und Verbindlichkeit

Verwendet wird ausschließlich die aktuelle tatsächliche Aufnahme
[37923233626](https://github.com/ernisch/helmut-pilot/actions/runs/37923233626):
Workflow `e5a3a3e93cd24c8c81596aea6fee31ab586b3bbd`, Production
`81a70cbe2ffec2499565b68649b97408d80ead69`, READY-Deployment
`dpl_AnfQEy7AGrd2jy6VDDg6fUc4v4gF`. Alle 500 inaktiven synthetischen Profile
(330 BT / 120 BE / 50 BB) sind erfasst. Kein historischer Gesamtlauf wurde
beigemischt. Fachabnahme weiterhin **0/500**.

Aus dem [Serverindex](https://drive.google.com/file/d/14NSnqUdVHUJa6yCmmzGhr68GDryrgtvs/view)
wurden alle 28 vorhandenen Original-ZIPs mit insgesamt 473.607.219 Bytes
wiederhergestellt. Index-SHA256
`103dd5defdcb48217909803f14566e8b254ebd8c10ae667b4d4a9b9189eecb37`;
alle ZIP-Größen/Hashes, authentisierten Kontexte, 500 vollständigen HTTP-200-
Antworten und Körperhashes geprüft. Schlüssel und Originalkörper bleiben privat.
Kein erneuter Production-Eingabeabruf, keine erneute Quellen- oder Fachprüfung.
Die B2-Ergebnisse stammen aus dem
[aktuellen Dossier](blocker2-originalquellen-komponentenpruefung-20261009.md)
und dem [Capture-Dossier](blocker2-tankrabatt-source-commit-vollaufnahme-20261009.md).

**Fest für diesen Snapshot:** Größe, Inhalt und lokale Texttokenzählung der
500 Originale; 20.525 sichtbare Karten; B2 nennt 398 sichtbare KO-Versionen,
91 Ereignisgruppen, 500 globale KO-Zeilen und 875 eindeutige Quellenzeilen.
Diese Mengen sind keine U-Aufrufliste. Die später lokal wiedergewonnenen
Quellentexte waren nicht Teil dieser damaligen Modelleingaben.

**Fest für einen vollständig erfolgreichen direkten Lauf:** 500 D und 500 R,
also 1.000 Modellaufrufe; 1.500 gespeicherte Ergebnispositionen erzeugen keine
weiteren Modellaufrufe. Der geschlossene direkte Pfad hat keine zusätzlichen
Office-, Embedding-, Backfill- oder Reparaturaufrufe. Seine Briefing-/Morgen-
Materialisierung ist modellfrei. Fremde Aufrufe bleiben ein Ruhe-/Stopptor.

**Veränderlich bis zur B2-Abnahme:** zugelassene Quellen-/KO-Versionen,
Briefingurteile und tatsächliche D-Kontexte; notwendige neue U-Vorstufen samt
Intents. Die erfassten Profile sind keine automatisch zugelassenen D-Eingaben.
R enthält zusätzlich den künftigen D-Text und dessen gewählte 2–4 Quellen:
keine tatsächlichen R-Eingaben oder Anbieter-Usage-Tokens liegen vor.

## 2. Eingabegrößen und lokale Tokenzählung

Bytes sind UTF-8. Aussagen-DTO und Request-JSON werden mit `JSON.stringify`
serialisiert; die HTTP-Körper sind Originalbytes. Keine dieser Textzählungen
ist eine Anbieterrechnung oder ein Nachweis bereits abgerechneter Inputtokens.

| Gemessene Menge, 500 Positionen | Minimum | Median | Maximum | Summe |
|---|---:|---:|---:|---:|
| Vollständiger HTTP-Prüfkörper, Bytes | 4.485.540 | 4.558.905,5 | 4.636.524 | 2.279.874.802 |
| Aussagen-DTO `result.eingabe`, Bytes | 487.455 | 516.084 | 537.555 | 257.886.997 |
| DTO als JSON-Text, Tokens | 168.579 | 176.210 | 181.868 | 88.057.204 |
| Vorläufiger D-Prompt, Bytes | 12.136 | 15.360 | 18.464 | 7.706.689 |
| Vorläufiger D-Prompt, Tokens | 2.927 | 3.959,5 | 4.957 | 1.992.560 |
| D-Prompt plus Azure-JSON-Schema, Tokens | 3.231 | 4.263,5 | 5.261 | 2.144.560 |
| D-Request-JSON, Bytes | 13.702 | 17.103 | 20.388 | 8.583.277 |
| D-Request-JSON als Text, Tokens | 3.360 | 4.421,5 | 5.452 | 2.225.161 |

Die D-Zeilen sind **unzugelassene Offline-Größenprojektionen**, keine abgefangenen
Production-Requests: sichtbare KO-Reihenfolge und unveränderte native Source19-
Zeilen des Snapshots, bestehende Sicherheitsfilter, `lage-quellenbeleg.baueEingabe`
mit dem Code-Default 14 Tage und dem jeweiligen Erfassungszeitpunkt, dann
`ai.buildLageBriefingPrompt`. Keine Quellen repariert, kein positives Urteil
erfunden, `briefing-lagebindung.pruefe` nicht umgangen oder als bestanden gemeldet.
Der spätere zugelassene Pfad verwendet die geprüften URL-/Quellenbindungen und
den freigegebenen Lauftag; deshalb sind diese Zahlen keine endgültigen D-Tokens.

Die Quellenprojektion ist im Code auf 16.000 Zeichen und sechs Belege je KO
begrenzt. Vorläufig ergeben sich 0–9 Quellen-KOs und 0–10 Quelldokumente je
Position, insgesamt 2.476 bzw. 2.644 Sichtbarkeiten. Position 342 liefert in
dieser Projektion keine Quellen; ihr gemessener Prompt ist nur das leere
Template und würde nicht gesendet. Dies ist ausschließlich ein Kosten-
Abhängigkeitshinweis an B2, keine neue fachliche Einzelfallprüfung.

Gezählt wurde mit `tiktoken 0.12.0`/`o200k_base`. Der über `js-tiktoken 1.0.21`
bezogene Wortschatz wurde als kanonische Rank-Datei rekonstruiert und stimmt
mit dem von tiktoken gepinnten SHA256
`446a9538cb6c348e3516120d7c08b09f57c36495e2acfffe59a5bf8b0cfb1a2d`
überein. 48 vollständige Positionen stimmen zusätzlich mit der unabhängigen
JS-Tokenzählung überein. Schema-Text hat jeweils 304 Tokens. Modell-/Transport-
Framing und serverseitige Schemaaufbereitung sind dadurch nicht als billable
Usage gemessen. Insbesondere werden die **88 Mio. DTO-Tokens nicht als
geplante D-Kosten** verrechnet.

## 3. Aufrufe, Reserven und Kostenformel

| Menge | Belegbarer Wert |
|---|---|
| D / R bei vollständigem Lauf | 500 / 500; Teilstopps erzeugen weniger, bestehen den Gesamtnachweis aber nicht |
| Neue notwendige U | noch unbekannt; weder 398, 500, 91 noch Quellenlücken sind U-Aufrufzahlen |
| Weitere Modellaufrufe im geschlossenen direkten Pfad | 0; keine automatische bezahlte Wiederholung |
| Bezahlte Helmut-Aufrufe des übernommenen Capture | 0; kein Beweis, dass künftig U=0 genügt |
| Reserve je D / U / Standard-R | 0,212 USD; erweitertes R 0,224 USD |
| Gleichzeitig gehaltene neue Reserve bei bestätigter sequenzieller Abrechnung | höchstens nächste 0,212 / 0,224 USD; Altreserven kommen hinzu |

Tarifobergrenze des bestehenden technischen Vertrags: 0,50 USD je Mio.
Inputtokens, 4,00 USD je Mio. Outputtokens **einschließlich Reasoning**.
Pro Aufruf wird in Mikro-USD `ceil(Input/2 + 4*Output)` gerechnet, erst danach
summiert. Keine Cache-/Batchrabatte und keine ungeprüften niedrigeren Preise.
Die tatsächlich vorhandene Reserve benutzt 400.000 Inputtokens, nicht die
gezählte Promptlänge. Standard D/U/R haben 3.000 Outputtokens; das ausdrücklich
gesonderte R-Szenario hat 6.000. Die Route nennt 272.000 maximale Inputtokens
als zu belegenden Servicewert; `pruefeRoutePayload` implementiert dafür keinen
lokalen Tokenzähler. Das ersetzt weder 400.000 Reservebasis noch frische
Management-/Tarifpins.

Für eine fest zugelassene Aufrufreihenfolge mit Kostenobergrenzen `c_j` und
unveränderten Reserven `r_j` ist der benötigte zusätzliche Spielraum:

`H = max(Summe aller c_j, max_j(Summe der c_i vor j + r_j))`.

Diese Rechnung gilt für Auftrag und jeden UTC-Tag mit dessen zugeordneten
Altbindungen. Nur Endkosten zu vergleichen wäre unzureichend: auch die
vorletzte Abrechnung plus letzte volle Reserve muss noch hineinpassen.
Das vorhandene [Offline-Kostenblatt](blocker3-kostenblatt-vorlage-20261007.json)
und `scripts/synthetik-500-kosten-zeit.js --sheet ...` rechnen diesen Spitzenwert.
Ein erwarteter Verlauf ist keine technische Kostenobergrenze.

## 4. Erwartungsrechnung und konservative Obergrenze

Eine empirisch belegte Erwartung für Ausgabe-/Reasoningtokens und R-Eingaben
existiert nicht. Folgende **Planannahmen** verwenden die gemessene vorläufige
D-Projektion, zusätzlich 256 Framingtokens je D, insgesamt 5.000 Inputtokens
je R, U=0 und keinen weiteren Modellaufruf. Der leere D-Templateplatz bleibt
als Platzhalter enthalten; er ist keine vollständige ausführbare Kohorte.

| Angenommene Outputtokens je D und R | Neue D/R-Kosten | Größter Spielraum für nächste Reserve | Auftrag inkl. Altbestand am Ende | Tagesbedarf inkl. privater Reserve und Spitzenwert |
|---|---:|---:|---:|---:|
| 500 | 4,386404 USD | 4,593904 USD | 11,831768 USD | 5,229904 USD |
| 1.000 | 6,386404 USD | 6,591904 USD | 13,831768 USD | 7,227904 USD |
| 3.000, volle Standardcaps | 14,386404 USD | 14,583904 USD | 21,831768 USD | 15,219904 USD |

256 und 5.000 sind **Annahmen**, keine gemessenen Anbieterwerte. Im ersten
Fall passen 6/20 rechnerisch bei bestätigtem sonst leerem Tag und unverändertem
Bestand; 0,770096 USD Tagesrest bleibt nach der Reserve-Spitze. Schon die
zweite Zeile scheitert an 6 USD. Neue U, andere tatsächliche Tokens und alte
Tagesbindungen sind zusätzlich anzusetzen. Ein kleiner erwarteter Output
begrenzt den technisch möglichen Output nicht.

**Konservative Vollgarantie unter den heutigen zugelassenen Caps: 6 USD reichen
nicht.** Allein 500×(3.000+3.000) Outputtokens kosten maximal 12 USD; mit
erweitertem R 18 USD, jeweils vor Input und U. Das sind obere Ausgabebeträge,
keine Mindestkosten jeder Antwort. Ein Tageswechsel hilft dem direkten DR-
Fenster nicht: sein Kostenplan bleibt innerhalb desselben UTC-Tags.

**20 USD sind keine belegte Vollfinanzierung.** Vom konservativen Auftrag
bleiben 12,554636 USD; volle Standardoutputs lassen davon nur 0,554636 USD für
alle Inputs/U und gegebenenfalls zusätzliche Reserve-Spitzen. Schon die
499 nichtleeren vorläufigen D-Prompts plus Schema ergeben beim oberen Tarif
1,070788 USD Inputkosten; zusammen mit den vollen geplanten 1.000 Outputcaps
und Altbestand 20,516152 USD, noch ohne R-Inputs. Das ist eine begründete
Warnschwelle der heutigen Projektion, kein endgültiger Anbieterpreis und
kein unveränderlicher B2-Endwert.

Ohne engere, technisch gebundene Inputobergrenzen liefert die bestehende
400.000-Input-Reservebasis für die hypothetisch vollständigen 1.000 Aufrufe
eine grobe technische Kostenhülle von **212 USD**; mit erweitertem R **218 USD**.
Neue U ergänzen jeweils bis zu 0,212 USD. Einschließlich heutigen konservativen
Auftragsbestands sind das `219,445364 + 0,212*U` bzw.
`225,445364 + 0,212*U` USD. Diese Hülle setzt eingehaltenen Route-/Tarifvertrag
voraus, ist keine Rechnung, keine gleichzeitig gehaltene Reserve und keine
empfohlene Budgeterhöhung. Die aktuellen Geldriegel stoppen vorher; unter ihnen
ist dieser vollständige Worst-Case-Lauf gerade nicht ausführbar.

## 5. Frischer Bestand und weiterhin widersprüchlicher Vertrag

Rein lesende native Finanzprojektion **09.10.17:14:18 UTC**: Version-4-Auftrag
`autonom-bis500-20260926`, `abTag=2026-09-25`, 20.000.000 Mikro-USD;
1.614.061 Mikro-USD in zwölf Auftragsbüchern plus bereits enthaltene externe
5.195.303 ergeben unverändert 6,809364 USD. Native offene Auftragsreserve 0.
Private ungeklärte 0,636 USD bleiben zusätzlich gebunden:
**7,445364 USD**, Rest zu 20 USD **12,554636 USD**.
Globale Historie unverändert: 28 Bücher, 13,542966 USD Verbrauch und 15 alte
offene Reserven mit 3,176 USD. Kein Doppelzählen externer Kosten, keine Löschung.
Auth-xmin `476643`, finanzielle JSON-MD5
`a9297ea47babf3c9903257df726c547f` stimmen mit dem erhaltenen 07.10.-Beleg überein.

**17:14:58 UTC:** Tagesbuch fehlt; Auftragstage 07./08./09.10. fehlen.
Heutige globale Zählerzeile fehlt (Reader interpretiert 0), heutige Auth-Usage-
Zeilen 0, Reservierungs-RPC vorhanden, Definitions-MD5
`030139181c5160d3a647636b52613f9e`. Diese Projektion ist keine bestandene
`auftragsStand`-Prüfung: die Funktion verlangt lückenlose Tagesbücher.
Der Adapter liest sie vor der Initialisierung. Die fehlenden Tage müssen im
integrierten Vorflug über den freigegebenen historischen Abgleich geklärt
werden; hier werden keine Bücher angelegt und keine Nullkosten erfunden.

Die [vollständig erhaltene Pfadprüfung](blocker3-kostenvertrag-pruefung-20261007.md)
gilt weiter: synthetischer Manifest-/Production-Adapter akzeptiert 7 oder 20;
der Witness verlangt 20 und ist abgelaufen. Kostenintents/-plan nennen weiter
7 als Metadatum. Der echte Geldsender prüft den gespeicherten Auftrag 20 und
Tagesbuch 6. Der Endvalidator verlangt fest 7/6. Diese Budget-/Senderquellen
sind gegenüber PR852 unverändert; die neue Storage-Änderung betrifft nur die
Lese-Timeout-Diagnose. Unter ehrlicher unveränderter Anrechnung von 7,445364 USD
würde der Endvalidator **zwangsläufig bereits ohne neue Kosten scheitern**.

Zusätzlich bindet die private 0,636-USD-Reserve derzeit nicht denselben nativen
CAS-Scope. Native 20/6 sind deshalb keine Garantie für 20/6 inklusive dieser
Reserve: die ehrliche Projektion könnte 20,636 USD Auftrag bzw. bei ungeklärtem
Tag 6,636 USD erreichen. Der gemeinsame spätere Vertrag muss sie im CAS und
im Endbeleg zusätzlich berücksichtigen; ein bloßer Außen-Lesecheck genügt nicht.

## 6. Globaler Aufrufdeckel: drei Evidenzklassen

| Klasse | Wert und Grenze der Aussage |
|---|---|
| Code-Fallback | 50; unverändert. Nicht der aktuelle gelesene Projektwert. |
| Historischer Production-Beleg | 19./20.09.: 2.416, U-Reserve 702, Vorrang 200; Originalberichte bleiben erhalten. |
| Frischer Vercel-Projektkonfigurationsleser 09.10. | Production-Targets: `HELMUT_MAX_LLM_CALLS_PER_DAY=2416`, `HELMUT_LLM_RESERVE_UNDERSTANDING=702`, `HELMUT_TESTLAUF_VORRANG_REAL=200`, `HELMUT_LLM_BUDGET_FAIL_CLOSED=1`; Metadaten und genau diese vier nichtgeheimen Werte gelesen, nichts verändert. |
| Noch fehlender konkreter Lauftagsnachweis | Unveränderlicher Deployment-Env-/Runtimebezug, aktuelle atomare Wirkung und Zähler unmittelbar vor dem autorisierten Lauf. Projektkonfiguration allein belegt diese Wirkung nicht. Der heute fehlende Zähler ist keine Zusage für einen späteren Tag. |

D/R haben `callType=lageBriefing` und zählen jeweils global; für bekannte
synthetische Mandats-IDs gibt es keinen zusätzlichen 200er Abzug. Bei Rohdeckel
`L`, U-Reserve `R_U`, Vorrang `V` und bereits belegtem Zähler `C` gelten:

`DRmax=max(0,L-R_U)`; `Umax=max(min(L,R_U),L-V)` bei V>0, sonst L.
Für neue U **vor D/R am selben UTC-Tag**: `C+U+1000 <= DRmax` und, falls U>0,
`C+U <= Umax`. Bereits reservierte Fehl-/Nichtsendungen können Plätze belegen;
kein Reset, keine erneute automatische Reservierung.

Mit 2.416/702/200 sind DRmax=1.714 und Umax=2.216. Bei C=0 passen bis zu
714 neue U vor den 1.000 D/R. Für nur D/R braucht der aktuelle Reservevertrag
mindestens **1.702 Rohplätze**, nicht bloß 1.000. Allgemein mindestens
`C+U+1702`, zusätzlich die Umax-Bedingung. U an einem früheren UTC-Tag zählt
weiter im Auftrag, aber nicht erneut im DR-Tageszähler. Kein Aufrufdeckel wurde
erhöht; eine Erhöhung ist heute weder nötig belegt noch freigegeben.

## 7. Laufzeit und Testfenster

Die Capture-Workflowdauer war **19 min 53 s** (11:21:36–11:41:29 UTC); die
500 Erfassungszeitpunkte reichen von 11:22:01.780 bis 11:41:21.343 UTC.
Dies sind Lese-/Transportzeiten, keine Modelllatenzen. Das verbrauchte
55-Minuten-Capture-GO ist kein Modelltestfenster.

Der direkte DR-Vertrag hat höchstens **4 Stunden innerhalb eines UTC-Tags**.
Es gibt noch kein aktuelles datiertes, freigegebenes Testfenster. 500 Einheiten
werden sequenziell über `start` und `next` bearbeitet; kein zusätzlicher Motor
und kein automatischer bezahlter Wiederanlauf.

| Szenario für die 1.000 D/R | Reine Modellzeit | Aussage zu 4 Stunden |
|---|---:|---|
| 5 s je Aufruf | 1 h 23 min 20 s | rechnerisch viel Rest; kein Messbeleg |
| 10 s je Aufruf, Arbeitsannahme | 2 h 46 min 40 s | 1 h 13 min 20 s für Guards/CAS/Operator/Materialisierung/Endprüfung |
| 15 s je Aufruf | 4 h 10 min | reicht schon ohne Verarbeitung nicht |
| 20 s je Aufruf, Anbieterfrist samt Body | 5 h 33 min 20 s | konservativer Modellzeitrahmen passt nicht |

Gesamtarbeitszeit als Annahme: `10*(1000+U) Sekunden + gemessener sonstiger
Aufwand`; konservativer Anbieterzeitrahmen `20*(1000+U) Sekunden + sonstiger
Aufwand`. U-Vorstufen liegen vor der endgültigen D-Zulassung und können eigene
früher gebundene Fenster haben; dann belasten sie nicht das aktive DR-Fenster.
Sie bleiben in Gesamtkosten/-arbeitszeit enthalten. Ein aktueller gemessener
Gesamtzeit-Erwartungswert und eine vollständige konservative Abschlussgarantie
sind nicht belegt. Inputgrößen allein bestimmen keine Modelllatenz.

Für 4 Stunden braucht D/R ohne Zusatzarbeit im Mittel höchstens 14,4 s pro
Aufruf beziehungsweise 28,8 s je Profileinheit. Bei einem **Planpuffer von
10 Minuten** für Abschluss bleiben 13,8 s je Aufruf inklusive aller restlichen
Einheitenarbeit; im 10-s-Modellszenario höchstens 7,6 s Zusatzarbeit je Profil.
Dieser Puffer ist keine Konfigurationsänderung. Die CLI-Frist von 180 s gilt
je HTTP-Auftrag, nicht für das ganze Fenster; allein 500 Einheitenfristen
ergeben 25 h. Sie beweist keine 4-h-Fertigstellung. Der Endwächter beendet bei
Fensterende; ein rechtzeitiger Stopp ist kein vollständiger 500er Nachweis.

## 8. Budgetentscheidung und konkrete Freigabevorlage

Bereits belastbar: **keine vollständige Lauf-Freigabe im heutigen Zustand**.
7/20 widersprechen sich, 6 USD finanzieren nicht die vollen Outputcaps und
20 USD sind keine konservativ belegte Vollfinanzierung. Es genügt nicht,
nur die Validatorzahl auszutauschen. Die kleinste Vertragsbereinigung bleibt
der in PR852 vorbereitete **versionierte, geschlossene Direktlauf-Vertrag**
20 kumulativ/6 täglich am bestehenden Auftrag, identisch in Dokumentation,
Intents-/Kostenplan, Admission/Command, Reservierungs-CAS und Endvalidator,
einschließlich privater Reserve. Historische 7-USD-Verträge bleiben erhalten.
Sie darf hier nicht umgesetzt werden und **bewilligt noch keinen ganzen Lauf**.

> **Teilfreigabe Kostenvertrag, noch nicht erteilt:** Ich genehmige ausschließlich
> den konkret geprüften Änderungssatz für einen versionierten direkten
> synthetischen 500er Kostenvertrag (330 BT / 120 BE / 50 BB, 1.500 Ergebnisse)
> am bestehenden Version-4-Auftrag `autonom-bis500-20260926`, `abTag=2026-09-25`:
> 20 USD kumulativ einschließlich aller alten Kosten und offenen Bindungen,
> 6 USD je UTC-Tag. Die ungeklärte private Reserve 0,636 USD zählt zusätzlich
> in jeder CAS-Reservierung und im Endbeleg. Plan-/Command-/Endnachweishash,
> Freigabeoriginal, geprüfter Commit und Deployment binden denselben Vertrag.
> Keine Reserven löschen, keine Historie oder Budgetkonten zurücksetzen,
> keinen Tages- oder Aufrufdeckel erhöhen. Keine Aktivierung und kein Modelltest.

Für einen **finanzierten vollständigen** Lauf ist darüber hinaus genau eine
Entscheidung zu treffen: innerhalb 6/20 einen fachlich akzeptablen, technisch
gebundenen kleineren Token-/Kostenrahmen nachweisen **oder** anhand endgültiger
Inputs eine konkrete höhere Tages-/Auftragsgrenze freigeben. Ein kleiner
erwarteter Tokenwert genügt nicht; niedrigere Caps dürfen nicht ohne B2-
Fachverträglichkeit angenommen werden. Heute ist keine kleinste sichere neue
Dollargrenze belegbar. Die grobe 212-USD-Hülle ist keine Empfehlung.

Die abschließende Vorlage ist bereits strukturiert, Zahlenfelder bleiben offen:

> **Spätere vollständige Kostenfreigabe:** Genau ein direkter 500er Lauf am
> erhaltenen Auftrag, keine zusätzliche Budgetgutschrift. Gebundene B2-
> Eingabe-/Versionshashes und Kostenblatt `[SHA256]`, `500 D + 500 R + [U] U`,
> neue Kostenobergrenze `[C]`, größter zusätzlicher Reservierungsspielraum `[H]`,
> kumulative Grenze `[B]` einschließlich bestätigter Altbindungen, je UTC-Tag
> `[Tag/Betrag]`, globale konfigurierte/effektive Grenze `[L/DRmax/Umax]`
> und frischer Zähler `[C0]`, verbindliche Input-/Outputcaps, Route-/Tarifpins,
> Zeitrahmen `[Start/Ende UTC]`, Abschlussreserve `[Zeit]`, geprüfter Commit/
> Deployment und Freigabeoriginal. Jede dadurch nötige Budget- oder
> Aufrufgrenzenänderung wird als konkreter Änderungssatz ausdrücklich genehmigt.
> Unbekannte Ausgänge bleiben gebunden; keine automatische bezahlte Wiederholung.
> Aktivierung und Modellstart benötigen anschließend ihr separates Test-GO.

Die fehlenden historischen Tagesbücher sind gesondert über den zulässigen
vollständigen Usage-/Zählerabgleich zu behandeln. Aus dieser Dokumentation
folgt keine Berechtigung, fehlende Bücher kostenlos anzulegen.

## 9. Exakt verbleibende Abhängigkeiten und Endkostenbeleg

**Von Blocker 2 benötigt:** (1) endgültige fachlich zugelassene 500 D-Kontexte
samt Quellen-/KO-/Profil-/Briefingversionsbindung und allen Einzelurteilen;
auch der derzeit leere Projektionsplatz muss eine zulässige Eingabe erhalten;
(2) vollständige Liste notwendiger neuer U-Vorstufen, tatsächliche U-Intents/
Inputversionen und deren Abrechnungsscope, oder ein belegtes U=0;
(3) die endgültigen Größen/Tokenobergrenzen der dadurch korrigierten Eingaben
und der fachlich zulässige Standard-/erweiterte R-Prüfaufwand. Vorhandene
Snapshotwerte bleiben unverändert historisch gesichert. Keine Quellenprobleme
werden in Blocker 3 gelöst. Tatsächliche künftige D/R-Usage ist **kein vorab
von B2 verlangter bezahlter Modelltest**.

**Unabhängig davon verbleiben:** konkrete Betreiberentscheidung zum gemeinsamen
finanzierten Vertrag, anschließend technische Umsetzung/Prüfung desselben
Vertrags und der integrierte frische Lauftags-Vorflug (Bücher, Zähler, wirksame
Runtime, Tarif-/Managementpins, Ruhe und datiertes Testfenster). Blocker 1
wird dafür nicht erneut implementiert. Diese Tatsachen sind keine fehlenden
Quellenbelege aus B2.

Nach B2 werden nur die finalen U-/Kontext-/Token-/Caps-Werte in das vorhandene
Kostenblatt eingesetzt und die Formeln neu ausgewertet. Stops bleiben:
fehlende Zulassung oder Vertragsdrift; fehlendes/unlesbares Buch; zu wenig
Spielraum für die nächste volle Reserve; Aufruf-/Anbietergrenze; Quellen-/
Profil-/Fensterdrift; nicht abgeschlossene Anbieterantwort; fehlende Usage;
unbekannter Schreib-/Sendestatus; zu wenig Restzeit. Kein Kosten- oder
Quellen-Fallback und kein automatischer bezahlter Retry.

Für die Endprüfung: derselbe freigegebene Vertrag/Hash in Plan und Validator;
vollständige unveränderte Auftrags-/UTC-Tagesbücher vor/nach dem Lauf;
per-Aufruf Original-Usage mit Modell, Input-/Output-/Reasoningtokens,
Requesthash, D→R-/U-Intentbindung, reservierten und abgerechneten Mikro-USD;
alle ungeklärten Tickets und externe/private Bindungen positionsgenau und
ohne Doppelzählung; native CAS-/Zählerbelege, höchste gehaltene Reserve,
Laufzeit und automatisches Ende. Ledgerbeleg und Anbieterrechnung bleiben
unterschiedliche Belegarten. Keine ehrliche 20-USD-Endabnahme mit dem heutigen
7-USD-Validator behaupten.

Maschinenlesbare Werte: [Kostenblatt 09.10.](blocker3-kostenblatt-20261009.json).
Private Messungen/Prüfer/Originale: `/workspace/private/blocker3-20261009/`;
Messbericht-SHA256 `0f760689c6b17d1bd5d589ec5877d9c6c17a6979784729daf2da0da66e8f29a3`.
Die erhaltenen [Kostenhistorie und Stoppregeln](blocker3-kosten-zeitplan-20261007.md)
werden durch diesen aktuellen Nachtrag nicht umgeschrieben.
