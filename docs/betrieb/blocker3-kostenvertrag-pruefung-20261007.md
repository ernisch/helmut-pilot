# Blocker 3: Kostenvertrag des direkten 500er Nachweises

Stand: 07.10.2026. Geprüfte Runtimequellen aus `main` `369e07d7`.
Nur Bestandsanalyse, Dokumentation und isolierte Offline-Gegenproben. Keine
Budget-, Reserve- oder Production-Konfigurationsänderung, kein kostenpflichtiger
Modellaufruf, auch kein DeepSeek. Blocker 1/2 werden nicht erneut umgesetzt.
Dieser Beleg schließt die unabhängige Vertragsanalyse ab, nicht Blocker 3.

## 1. Vom Start bis zur Endprüfung

| Stelle | Vertrag | Wirkung |
|---|---|---|
| `synthetik-500-vertrag.js`, `pruefeKosten` | 6 USD/Tag, Auftrag 7 **oder 20** USD | Profil-/Runtime-Manifest prüft das gebundene bekannte Limit und Restreserve. Der darunterliegende historische Realkohortenvertrag hat standardmäßig 7 USD; der synthetische Wrapper gibt ausdrücklich beide Grenzen frei. |
| `synthetik-500-kosten-intents.js:94` | 7 USD kumulativ | Inerte lokale Inventur; kein zusätzlicher Sender-Riegel. |
| `synthetik-500-kosten-plan.js:338`, auch `/4` | 7 USD kumulativ | Inerte `money`-Projektion. Der daraus abgeleitete `admissionCandidate.plan` enthält Intents, Fenster und Route, aber dieses `money`-Objekt nicht. |
| `synthetik-500-production-command.js`, `validate`/`admission` | 1.000 D/R-Intents und Originalgate `currentFinancing` | Bindet Planhash, Originale und Freigaben. Leitet keine zusätzliche 7-USD-Geldgrenze aus der inerten Projektion ab. |
| `synthetik-500-financing-witness.js:56` | **nur Version 4 / 20 USD**, Tag 6 USD | Rein lesender numerischer Witness. Seine besondere Berechtigung ist seit 06.10.20:00 UTC abgelaufen; er ist kein heutiger positiver Finanzbeleg und wird hier nicht aufgerufen. |
| `synthetik-500-production-adapter.js:20` | Auftrag 7 **oder 20** USD; Tagesbuch 6 USD | `financial` läuft bei Installation, `start`, `next`, Kontrollguard und unmittelbar vor Sendung. Kein Abgleich des gespeicherten Limits mit den 7 USD der späteren Endprüfung. |
| `testkosten-budget.js:289` | **tatsächlich gespeichertes** Auftragslimit | `pruefeAuftrag` prüft historischen Auftragsbestand plus nächste volle Reserve innerhalb desselben Auth-CAS. Bei Version 4 sind dies 20 USD einschließlich externer Bindungen. Keine automatische Hochstufung. |
| `testkosten-budget.js:301` | tatsächliches Tagesbuch, aktuell 6 USD | Verbrauch plus offene Bindungen plus nächste volle Reserve; alter Buchbestand bleibt erhalten. Unbekannte Ausgänge bleiben reserviert. |
| `ai.js:717`, `storage.js:2760` | separater globaler Aufrufdeckel | Eine globale Anzahlreservierung vor jedem D/R-Sender; zusätzlich Geld-, Anbieter- und ggf. Tenant-Gates. |
| `synthetik-500-nachweis.js:173–181` | **6 USD/UTC-Tag und fest 7 USD Auftrag** | Offline-Endvalidator liest Verbrauch plus Reserven aus dem Endbeleg. Er übernimmt das 20-USD-Limit weder aus Command noch Auftragsbuch oder Finanzwitness. |

Quellen liegen in [lib/helmut](../../lib/helmut/). Aufrufanzahl, Inhaltsprüfung,
Originalkostenquittungen und Operatorweg stammen aus dem bereits übernommenen
[Blocker-1-Vertrag](blocker1-direkter-500er-motor-20261007.md).

**Wirksame Grenze:** Wenn alle anderen Zulassungen vorhanden sind, prüft der
Sender bei dem belegten Version-4-Auftrag **20 USD kumulativ und 6 USD/Tag**.
Die Planangabe 7 USD ist keine technisch zusätzliche Sendesperre. Für einen
positiven Endnachweis gelten dennoch fest 7 USD. Der Lauf besitzt damit zwei
verschiedene Geldverträge. Ein Root-Gate oder der Endvalidator ersetzt keine
einheitliche Prüfung vor jeder bezahlten Sendung.

Dies behauptet keinen aktuellen Start: Runtime, Operatorzugang, aktive Kohorte,
Test-GO und Eingaben sind eigenständige Zulassungen. Am datierten Finanzabruf
11:23 UTC war außerdem noch kein heutiges Tagesbuch vorhanden. Der Adapter
liest `auftragsStand` vor `pruefeStart`; fehlende Tagesbücher werden dort nicht
initialisiert. Ein funktionierender aktueller Startzustand ist daher eine
Abhängigkeit des integrierten Vorflugs, kein Ergebnis dieser Analyse.

## 2. Scheitert der Endnachweis zwangsläufig?

Unter dem unveränderten konservativen Bestand **ja**: 6,809364 USD einschließlich
der bereits enthaltenen externen 5,195303 USD plus zusätzliche private
0,636000 USD ergeben **7,445364 USD**. Ein ehrlicher Endbeleg liegt damit schon
ohne neue Kosten über 7 USD. Jede weitere nichtnegative Kostensumme kann dies
nicht reparieren. Der Validator meldet `kostenbeleg-fehlt-oder-grenze-verletzt`.
Ein ausgelassener privater Betrag oder ein neues leeres Konto wäre kein gültiger
Kostenbeleg. Alle alten Bücher, 15 Altreserven und Originale bleiben erhalten.

**Abgrenzung:** Der 20-USD-Auftrag allein erzwingt nicht bei jedem denkbaren
Bestand eine Überschreitung von 7 USD. Würde die private Überlappung künftig
positionsgenau bewiesen, läge die bekannte native Baseline bei 6,809364 USD.
Dann blieben 0,190636 USD bis 7 USD, weniger als die volle nächste D-Reserve
0,212 USD. Ein zusätzlicher technischer 7-USD-Reserveguard würde schon diesen
Sender verweigern. Heute existiert dieser zusätzliche Guard im beschriebenen
Senderweg nicht. Aus Baseline und Reserve allein folgt ohne die zusätzliche
private Bindung keine mathematische Mindesthöhe der tatsächlich abgerechneten
1.000 Antworten. Hier wird keine Überlappung angenommen oder Reserve freigegeben.

Die gezielte Offline-Gegenprobe verwendet den wirklichen `K.pruefeStart` mit
einem fiktiven 20-USD-Auftrag sowie den wirklichen Kostencheck von
`N.belegePruefen`: der Startleser akzeptiert den nativen Bestand, der Endcheck
verwirft die konservative Endprojektion. Dies ist keine komplette 500er Probe.

## 3. Kleinste saubere Vertragsänderung — noch nicht angewendet

Für den bestehenden Auftrag ist die kleinste sachlich passende Richtung:
**20 USD kumulativ einschließlich Altbestand und Reserven, weiterhin 6 USD je
UTC-Tag**, ausdrücklich für genau einen direkten synthetischen 500er Nachweis.
Ein Zurücksetzen auf 7 USD macht den vorhandenen Bestand nicht finanzierbar.
Nur die Endvalidator-Zahl zu ersetzen lässt Scope, Planhash und Senderbindung
weiter auseinanderlaufen; ein frei wählbares Operatorlimit wäre ebenfalls kein
geschlossener Vertrag.

Der begrenzte spätere Änderungssatz lautet:

1. Ein versionierter, unveränderlicher Direktlauf-Kostenvertrag bindet bestehenden
   Auftrag/Version/`abTag`, Operation und Run, 500 Profile/1.500 Ergebnisse,
   Tageslimit 6 USD, genehmigtes kumulatives Limit 20 USD, Zeitfenster, Commit,
   Deployment und Originalfreigabe. Keine neuen Budgetkonten oder alten Resets.
2. Die Direktlauf-Projektion im Kostenplan leitet ihre Grenze aus diesem Vertrag
   ab. Derselbe Vertrag samt Hash wird an Admissionplan/Slot, Command und
   End-Sollplan gebunden. Start und jeder Sender prüfen die Übereinstimmung mit
   dem gespeicherten Auftrag; Drift oder fehlende Bindung sperrt.
3. Im Reservierungs-CAS wird derselbe gesamte Auftragsscope geprüft. Die
   ungeklärt zusätzlich anzurechnende private Reserve zählt vor jeder Sendung
   und im Endbeleg mit; bei ungeklärtem Tag konservativ auch gegen Tagesrest.
   Ein bloßer Lesecheck außerhalb des CAS ist kein Ersatz. Die externe bereits
   enthaltene Bindung wird genau einmal gezählt.
4. Nur ein ausdrücklich gebundener neuer Direktlauf-Endvertrag verwendet
   dieselben 20 USD. Historische 7-USD-Versionen und andere Aufträge behalten
   ihren bisherigen Vertrag. Fehlt die neue Originalfreigabe, kein 20-USD-Nachweis.

`testkosten-budget.js` kennt Version 4/20 USD bereits; dessen bestehendes
Auftragslimit und der 6-USD-Tagesriegel müssen dafür nicht erhöht werden.
Zu ändern wäre jedoch die bisherige 7-USD-Nachweis-/Planbindung für diesen
Direktlauf. Das ist eine geschützte Budgetvertragsänderung und wird hier weder
implementiert noch deployed. Die heutige Betreiberantwort zum bestehenden
Vorbereitungsauftrag belegt ausdrücklich `global500FundingAdmission=false`.

**Konkrete spätere Freigabevorlage, noch nicht erteilt:**

> Ich genehmige die geprüfte Umstellung der Kostenplan-, Admission-/Sender- und
> Endnachweisbindung für genau einen direkten synthetischen 500er Lauf
> (330 BT / 120 BE / 50 BB, 1.500 Ergebnisse) auf denselben bestehenden
> Version-4-Auftrag `autonom-bis500-20260926`: höchstens 20 USD kumulativ
> einschließlich sämtlicher bisheriger Kosten und offener Bindungen dieses
> Auftrags; unverändert höchstens 6 USD je UTC-Tag. Private 0,636 USD bleiben
> bis zum positionsgenauen Überlappungsbeleg zusätzlich gebunden. Keine Reserve
> löschen, keine Historie umschreiben, kein neues Konto oder Budgetreset.
> Die Freigabe bindet die anschließend konkret geprüfte Vertragsversion,
> Planhash, Commit und Deployment. Sie umfasst kein Aktivierungs- oder Test-GO.

Ein späterer konkreter Aktivierungs-/Testauftrag muss zusätzlich U-Anzahl,
maximale Kosten, zulässige Callzahl, Fenster und Endbedingungen binden. Ein
eventuell notwendiger höherer Aufrufdeckel braucht eine eigene konkrete
Konfigurationsfreigabe für den berechneten Wert. Eine Erhöhung des 6-USD-Tages-
oder 20-USD-Auftragsbudgets ist nicht Bestandteil dieser Vorlage.

## 4. Globaler Modellaufrufdeckel

| Evidenzklasse | Beleg | Was daraus folgt |
|---|---|---|
| Code-Fallback | `storage.js:2017–2027`: 50 | Fehlt der Env-Wert oder ist er unbrauchbar, gilt 50. Kein Beleg, dass Production heute 50 verwendet. |
| Alte Betreiberangabe | Sicherheitsrahmen §41.4, 05.09.: 2.416 / U-Reserve 702 | Damals ausdrücklich Rohwert und Wirkung über 100 noch unbelegt. Keine heutige Laufzeitmessung. |
| Dokumentierter späterer Production-Leser | [19.09.-Beleg](testfenster-null500-2026-09-19.md), Workflow35454254225, 16:13:29 UTC: 2.416 / 702 / Vorrang200 | Späterer dokumentierter Runtimewert; nicht mit der früheren bloßen Angabe gleichsetzen. Historische Originalberichte bleiben erhalten. |
| Dokumentierte weitere Production-Leser | [20.09.-Betriebsplan](500-betriebsplan-2026-09-20.md), Workflows35484985244 und35499889132 | Ebenfalls 2.416 / 702 / 200, jeweils an damaligen Commit/Deployment gebunden. |
| Aktueller direkter Lauf | noch fehlend | Kein frischer positiver Wertnachweis für aktuellen Commit/Deployment und geplanten UTC-Tag; keine Konfiguration geändert. Abhängigkeit des Blocker-1-/integrierten Runtimebelegs. |

Beide D/R-Phasen verwenden `callType: lageBriefing` und werden einzeln gezählt.
Es gibt hier keinen Backfill-`budgetExempt` und kein Freistellen der R-Aufrufe.
Die Plan-/Intentformatgrenze 5.000 ist kein Tagesdeckel.

Im aktuellen Code ist nur `understanding` priorisiert. Für vollständige
mandatsgebundene D/R-Kennungen gilt `effectiveMaxDR = max(0, L − R_U)`.
Die historische Umgebungskennung `HELMUT_TESTLAUF_VORRANG_REAL` schützt inzwischen
alle bekannten Mandate; sie zieht bei ihnen keine zusätzlichen 200 Slots ab.
Für geteiltes U gilt bei positiver Vorrangreserve
`effectiveMaxU = max(min(L, R_U), L − V)`. Bei V=0 ist U-Maximum L.
Beide Phasen nutzen denselben globalen monotonen Tageszähler.

Für das konservative Szenario **alle neuen U vor D/R am selben UTC-Tag** müssen
bei bisher verbrauchtem Zähler C gelten:
`C + U + 1.000 <= effectiveMaxDR` und `C + U <= effectiveMaxU`.
Beim historischen Szenario L=2.416, R_U=702, V=200 sind dies **1.714 für D/R**
und **2.216 für U**. Mit C=0 passen höchstens 714 zusätzliche U vor den 1.000
D/R-Reservierungen. Das ist eine Szenariorechnung, keine aktuelle Callzuteilung;
48 vorbereitete Cluster werden weiterhin nicht als U=48 eingesetzt.

Zähler C umfasst Reservierungen, nicht nur erfolgreich protokollierte Antworten.
Anbieterablehnungen nach der Anzahlbuchung können zusätzliche Slots verbraucht
haben. Bei künftiger anderer U-Tageszuordnung ist jeder berührte Tag separat
zu bilanzieren, der Auftrag bleibt kumulativ. Tenantcap, sonstiger Tagesverkehr
und tatsächlich verwendete weitere Scope-Gates bleiben zusätzliche Riegel.

Ein sicherer heutiger Nachweis benötigt außerdem RPC/atomare Wirkung,
`HELMUT_LLM_BUDGET_FAIL_CLOSED`, Tageszähler, Reservewerte und gegebenenfalls
Tenantrests. **Der fehlende-Wert-Fallback ist fail-closed; der Infrastruktur-
Fehlerpfad ist es nicht automatisch:** `llmBudgetFailResult` erlaubt bei
ausgeschaltetem Fail-Closed-Flag. Fehlende RPC kann einen nicht atomaren
Altpfad verwenden. Die Wirksamkeit darf daher nicht allein aus „2.416 gesetzt“
oder aus einer erfolgreichen Deploymentliste abgeleitet werden.

## 5. Ausfüllbarer Kosten- und Zeitplan

[Vorlage](blocker3-kostenblatt-vorlage-20261007.json) und
[Offline-Rechner](../../scripts/synthetik-500-kosten-zeit.js) sind vorbereitet.
Die Vorlage enthält ausdrücklich einen historischen Finanzstand, keine frische
Zulassung. U, Zusatzpfade, Tokenpositionen und aktueller Zähler bleiben `null`.

Nach Eingang von Blocker 2 werden dessen geprüfte Angaben **übernommen**, nicht
hier neu erhoben: `understandingCalls`, nachgewiesene `otherPaidCalls: 0` oder
eine gesonderte Preisliste, die 500 D-/500 R-Eingabengrößen, erwartete Tokenwerte
und konservativ belegte Eingabetokenobergrenzen. R-Größen bleiben vor D konditional;
die echten R-Payloads und Usage müssen im späteren Lauf nachgebunden werden.

`tokenRows` enthält zuerst alle neuen U, danach 500 D/R-Paare. Je Position:

```json
{"phase":"D","positionKey":"aus-dem-geprueften-plan","inputBytes":null,
 "expectedInputTokens":1234,"expectedOutputTokens":300,"upperInputTokens":2345}
```

Diese Zahlen sind ausschließlich ein Schema-Beispiel. `inputBytes:null` erhält
eine fehlende Größenmessung. Alle Kostenrechnungen erfolgen je Aufruf in ganzen
Mikro-USD mit `ceil(input/2 + output*4)`, erst anschließend wird summiert.
Die vollständigen Ausgabecaps bleiben D/U=3.000, R=3.000 oder der bestehende
ausdrückliche 6.000-Modus. Obergrenzen berücksichtigen diese vollen Caps,
Erwartungswerte sind keine Kostenquittungen. Andere bezahlte Pfade werden nicht
stillschweigend mit Texttarifen verrechnet.

Der Rechner liefert Min/Median/Maximum/Summe, Phasenpreise, erwartete Kosten,
konditionale Kostenobergrenze und den nötigen Rest für **jeden** nächsten
Reservezeitpunkt: `max(bisherige neue Kostenobergrenze + nächste volle Reserve)`.
Nur der Endbetrag oder die Einzelspitzenreserve reichen nicht zum Deckungsnachweis.
Optional übernimmt `callCounter` die unbestätigten Zahlen
`dailyLimit`, `used`, `understandingReserve`, `sharedReserve` für Szenarien;
sie werden ausdrücklich nicht als Production-Beweis ausgegeben.

```sh
node scripts/lokal.js -- node scripts/synthetik-500-kosten-zeit.js --sheet docs/betrieb/blocker3-kostenblatt-vorlage-20261007.json
```

**Unabhängig von Blocker 2 bereits feststehende Grenze:** Die vollen erlaubten
D/R-Ausgabecaps kosten allein bis zu12 USD regulär bzw.18 USD im Reviewmodus,
noch ohne Input/U. Somit genügt auch die Harmonisierung auf20 USD nicht, um
unter dem unveränderten Tagesriegel6 USD die vollständige Ausführung im
schlechtesten zulässigen Fall zu finanzieren. Das ist keine Mindestkosten-
oder erwartete Rechnung. Der Riegel garantiert einen Kostenstopp, keine fertigen
500 Einheiten. Falls die übernommenen konservativen Obergrenzen nicht passen,
bleibt die Ausführung gesperrt; kein stilles Kürzen, Senken von Qualitätsgrenzen,
Retry oder Erhöhen eines Budgets.

Zeitformeln und Stopps stehen im [Kosten-/Zeitplan](blocker3-kosten-zeitplan-20261007.md).
1.000 Providerfristen à20s ergeben bereits5h33m20s; das Vierstundenfenster ist
keine Vollständigkeitsgarantie. Neue U sind eine Vorstufe; ihr Zeit-/Tagesanteil
muss im konkreten Plan explizit zugeordnet werden. Die Worksheet-Szenarien
5/10/15/20s berücksichtigen nach Einsetzen der U-Anzahl alle neuen Providercalls,
ohne gemessene Operator-/Speicher-/Abschlusszeiten zu behaupten.

## 6. Übergabestand und verbleibende externe Punkte

Unabhängig fertig: technische 7/20-Vertragskette, zwingende konservative
Endablehnung, minimale scoped Vertragsänderung samt Freigabevorlage,
historischer/Fallback/fehlender aktueller Calldeckel, ausfüllbare Rechnung und
gezielte Offline-Gegenproben. Keine harte Grenze verändert.

Offen bleiben nur die übernommenen endgültigen Blocker-2-Mengen/Eingaben,
der tatsächliche aktuelle Runtime-/Finanzvorflug einschließlich Privatreservenscope,
die konkrete Betreiberfreigabe und anschließend deren begrenzte technische
Umsetzung/Abnahme. Der laufende Kostenbestand muss vor einer Wirkung frisch
gelesen werden; der spätere frische Vorflug ist keine noch fehlende Rechenformel.
Der volle Blocker 3 bleibt bis zum einheitlichen genehmigten und technisch
geprüften Vertrag offen. Aktivierung und bezahlter500er Test sind nicht freigegeben.
