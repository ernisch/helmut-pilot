# W15: isolierter Mock500-Simulationskalender

Vertrag `helmut-w15-mock-simulation-calendar/1`, Auftragsversion7.
Entwicklungsfreigabe03.11.2026, Basis PR1029/ec5b3149. Kein Originallauf,
keine Aktivierung, kein Merge/Deployment oder Production-Eingriff freigegeben.
Der historische Quellenvertrag aus PR1029 bleibt vollständig erhalten.

## Nachgewiesene zusammenhängende Novemberriegel

Die einmalige Pfadprüfung umfasst äußeren Starter/Go/StartGuard, Materialien,
NativeBootstrap/CAS, tatsächliche App-/Kostenadmission, Inhaltsworker,
Ergebnisprüfung, Abschluss und Sicherungs-/Rücksicherungsanschlüsse.

| Aktiver Riegel | Begrenzte Lösung |
|---|---|
| EU-Preiszeitraum endet31.10. | Gesondertes November-Simulationsfenster; Oktoberpreise ausdrücklich historische Referenz |
| Erneuerter Auftrag endet31.10. | Eigene v7 und eigener Hash; v5/v6 unverändert |
| Höchstens37 Auftragstage seit25.09. | Für1.–7.11. ergeben sich38–44 Tage; Maximum44 |
| Alte Buchkapazität53 | Höchstens53 vorhandene Bücher plus7 Novembertage =60; keine Geldsteigerung |
| Lokales SQL akzeptiert nurv5/v6 | Bootstrap UND CAS erlauben zusätzlich exaktev7/Hash nur im festen isolierten Mock-DB-Namespace |
| Worker rekonstruiert unabhängig | Parent überträgt ausschließlich echten internen Scope, überschreibt Request-Metadaten; Child bindet Operation/Hash/Commit/500×v1 |
| Starter vergleicht geschlossenes GO | Beide Vertragskennungen werden konstant geprüft und durch den unveränderten ganzen Requesthash an das GO gebunden |

Nicht aktive Oktobergrenzen bleiben erhalten: Legacy-Dispatcher/-Controller und
altes Full500-Fenster, historischer Tagesbuch-Initializer/Rollforward sowie B2.
Der tatsächliche gebundene Host-Funktionspfad benutzt bereits1.–7.11. und
UTC-/Berliner Tagesbindung. Die native Runtime prüft höchstens9h, keine9h-Mindestdauer;
3h Mock-Verarbeitung erfüllt diese Obergrenze. Wiederhergestellte Command-RPCs,
Sicherungs-/Restorecode enthalten keinen weiteren aktiven Oktober-Preisriegel.
Production-Migrationen, native Manifest-ABI und vorhandene Command-RPC-Pins bleiben
unverändert. Feste Namespace-Suffixe20261028 sind Kennungen, keine Laufdaten.

## Ausschließlich interne Berechtigung

Das vorhandene private GO muss `sourceContract` UND `simulationCalendar` exakt
benennen. Der StartGuard bindet beide an denselben Branch, Commit, Run, Attempt,
Nonce, Freigabehash und Codequalifikation. Das neue Scope-Objekt wird nur nach
Prüfung des privaten OWNER_GO, des isolierten Deskriptors und der privaten festen
Mock-Konfiguration erzeugt. JSON/API-Parameter/ENV können diesen opaken Scope
nicht erzeugen. Ein passiver Datenvalidator erteilt keine Berechtigung.

Die vorhandene AsyncLocalStorage-Technik begrenzt den Scope auf diese Mockarbeit.
Widerruf und Fristen werden weiter geprüft. Ohne Scope gelten unverändert die
alten Production-Verträge; auch ein frei gesetzter Renewal-Hash genügt nicht.
Nach außen gehende echte Modellaufrufe bleiben gesperrt. Die bestehende Netzsperre
und der vorhandene lokale Provider-Mock bleiben erforderlich.

Der tatsächliche Inhaltsworker erhält den Scope nur aus seinem geprüften Parent;
sein Eingabefeld wird immer überschrieben. Der isolierte Child prüft danach die
Selektoren und gewöhnlichev1-Eingaben, verwendet dieselben Original-C-Validatoren
und denselben geschlossenen Byte-/Modulgraph. Seine IO-Sperren bleiben erhalten.
B2-v2 wird im neuen Worker-Scope zurückgewiesen. Die alte B2-Datumsfunktion bekommt
weiterhin ihren alten Oktobervertrag, niemals die neue Budgetperiode.

## Keine Änderungen an Geld, Originalen oder realer Zeit

Der ursprüngliche EU-Servicehash und Renewal-v6-Hash bleiben identisch. Reserven,
Tarifformel, Modell/Region, Token-/Aufrufgrenzen sowie Tages-/Auftrags-/Laufbeträge
bleiben unverändert. Diese Beträge sind im Mock eine historische Simulations-
referenz, keine bestätigten November-Anbieterpreise und keine Production-Finanzierung.
Route/Ergebnisquittungen kennzeichnen `HISTORICAL_OCTOBER_SIMULATION_ONLY` und
`currentProviderPricesAccepted:false` ausdrücklich. Alle bisherigen Bücher werden
vor/nach der Ergänzung vollständig verglichen; keine Kosten oder Belege entfernt.

Originalquellen und deren historische AsOf-Zeit werden nicht verändert.
Ausführung, Speicherung, Kostenbuchtag, Fristen und Tagesbindung bleiben aktuell.
Es gibt keine Datumsmanipulation, Cachebereinigung, Peakreset oder RAM-Änderung.

## Vor Aktivierung und danach

Die bestehende Prüfung aller500 vollständigen Eingabe-/D-/Provider-/Review-
Bindungen aus PR1029 bleibt zwingend vor jeder tatsächlichen Mockaktivierung.
Der endgültige Code, Originalpins, Quellenvertrag, Simulationsvertrag, Freigabe
und neue Nonce müssen denselben tatsächlichen Lauf binden. Keine zusätzliche
Originaldiagnose nötig; die echten500 Bindungen werden im freigegebenen Job geprüft.

180min Verarbeitung/210min insgesamt liegen im selben UTC- und Berliner Tag.
Die Kalenderberechtigung darf für reine Abschlussprüfungen bis zur vorhandenen
Abschlussfrist leben; die unabhängigen Verarbeitungssperren bei180min bleiben.
Die reine Ergebnisprüfung darf daher nach Verarbeitungsschluss beginnen. Sie
benutzt ihren unveränderten zugangsdatenfreien Netzschutz und liest nur SQL.
Sicherung, entfernte authentifizierte Rücklesung und zweite frische Rücksicherung
bleiben Pflicht. Der vorhandene Leseweg enthält keinen v7-Datums-/Namespace-Schreibriegel;
erfolgreiche Rücksicherung bleibt reale Abnahme. v7-Schreiben außerhalb des festen
Mock-DB-Namespace wird durch das lokale SQL nicht zugelassen.

## Gezielte Prüfungen und Nachweisgrenze

-37 reine Kalender-/Schemafälle: alle sieben Novembertage, Oktober31/November8,
  falsche Bindungen/Flags/Versionen und Fristen. Keine Uhr manipuliert.
-Echte private Scope-Gegenprobe mit erfundenen lokalen GO-/Buchdaten: ENV-/JSON-
  Fälschung, falsches Deployment/Commit/Fenster, Geld- und Buchmanipulation,
  vollständige Historienerhaltung, asynchrones Scopeende und Widerruf.
-Echter geschlossener Worker: Scopeübergabe und Schutz vor eingeschleusten
  Metadaten/Selektoren mit absichtlich ungültigem Datenkörper. Dies ist KEIN
  positiver vollständiger v7-Originalcommand oder vollständiger Mock500.
-Bestehende betroffene EU-Vertragsgruppen und Starter-Regression wiederverwendet
  beziehungsweise nur wegen geänderter Funktionen gezielt geprüft.
-Native SQL-Gegenprobe im bestehenden CI-PostgreSQL17: exakt passendev7,
  unverändertev5/v6, CAS/History/Stalewrite, falscher Hash/Version und anderer
  DB-Namespace. Nur eigene frische kleine Datenbanken, keine Profile/Modelle.
-Pflicht-CI und unabhängige Abnahme werden am veröffentlichten Endkopf belegt.
  Historische End500-/Empfangs-/Quellen-/Atomic12ACK-Belege bleiben übernommen.

## Einmalfreigabe als nächster Schritt

Nach grüner Endkopf-CI und unabhängiger Abnahme genau eine konkrete Freigabe für
exakt den geprüften Commit in `helmut-ci-originals` einholen. Sicherer Fast Forward
vom frisch bestätigten Ausführungsbranch, kein Force-Push. Alle Vorbereitungen
vor genau einer frischen privaten16er-Linkrunde abschließen; vor dem einzigen
POST tatsächliche Restgültigkeit>90s und gesamte Parametergröße≤65535Zeichen.
Keine echte Ausführung durch diese Entwicklungsfreigabe.

Abnahme unverändert:500 gleichzeitig aktive synthetische Profile,500Units,
1000Mockphasen,1500 gespeicherte einzeln geprüfte Ergebnisse,8000 echte
Sicherheitskontrollen und17000 Auditprüfungen. Alle fünf Fehlerklassen getrennt.
Verschlüsselte Vollsicherung, authentifizierte Rücklesung, zweite Wiederherstellung,
Integrität, finale0aktive Profile und tatsächlicher Prozessstillstand bestätigen.

Dynamisches tatsächliches Hostlimit mit mindestens2147483648B Hostreserve,
Swap/OOM/Grenzkontakte0, mindestens536870912B Plattenreserve; Auth<30s,
Unit<60s, Providerphase<20s. Höchstens0,05USD zusätzliche Speicherung,
ein verschlüsseltes Artefakt für1Tag und0echte Helmut-Modellaufrufe.
BeiFAIL/UNKNOWN sofort sicher stoppen, erste Ursache und bestätigten Fortschritt
sichern, alle acht Bereinigungen prüfen. Kein Retry, keine zweite Linkrunde,
keine automatische Löschung/Branchrücksetzung. Originale, Secrets und Drive erhalten.
Production500, Merge, Deployment und Production-Änderungen bleiben ausgeschlossen.
