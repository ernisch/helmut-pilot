# W15: historischer Mock-Quellenvertrag und enger App-Anschluss

Vertrag: `helmut-w15-mock-historical-qualified-source-replay/1`.
Basis PR1028/4da2b653; zusätzliche Entwicklungsfreigabe für den tatsächlichen
finite-D/Lage-Apppfad am03.11.2026. Keine Ausführungsfreigabe aus dieser Umsetzung.

## Ursache und Geltungsbereich

Die vorhandene input-only Prüfung41620895888 bindet alle500 ursprünglichen
Eingaben:120 gültig,380 nur wegen Quellenalter leer; andere Fehler0.
Die qualifizierten Oktoberquellen werden im November nicht als aktuell behandelt.
End500-Funktion41325430429 und Originalempfang41037459441 bleiben übernommen.
Keine neue Qualifikation, Originalbeschaffung oder geschützte Diagnose durchgeführt.

Der ursprüngliche Qualifikationszeitpunkt wird ausschließlich aus dem zuvor
hashgeprüften Bericht gelesen. Alle500 Profile verwenden denselben Zeitpunkt.
Quellen, Veröffentlichungsdaten, Inhalte, Originalhashes und die fachlichen Filter
bleiben unverändert. Die reale Ausführungszeit, Tagesbindung, Laufzeit, Freigaben,
Kostenbücher und Speicherung bleiben aktuell. Der alte historische B2-Pfad bleibt
unverändert; dieser Vertrag akzeptiert keine B2-Erweiterung.

## Berechtigung und tatsächliche Anbindung

Der vorhandene Python-Startwächter akzeptiert `sourceContract` nur im zugelassenen
isolierten Host-Funktionsmodus. Nach vollständiger vorhandener Admittanz bindet er
Vertragsversion, Branch, exakten Commit, Run, Attempt, Nonce, Freigabehash und
Codequalifikation. Das private OWNER_GO und der private Laufdeskriptor übernehmen
dieselbe Bindung. Eine erfolgreiche Quellenvorbereitung erteilt keine Startrechte.

`scripts/w15-github/mock500_source_replay.js` authentifiziert diesen bereits
zugelassenen privaten Mock-Kontext, die lokalen technischen Isolationsbindungen
und die festen Originalpins. Der tatsächliche App-Eingang akzeptiert ausschließlich
opake, prozessinterne Berechtigungen; JSON, API-Parameter, kopierte Objekte und
Umgebungsvariablen erzeugen keine solche Berechtigung. Der Factory-Verifier wird
nur von vertrauenswürdigem lokalem Mock-Code aufgerufen; beliebige Codeausführung
im Backend wäre keine durch diese Schnittstelle gewährte Benutzerberechtigung.

PREPARATION erlaubt nur reine Kontext-/Requestkonstruktion. Der tatsächliche
App-Aufruf verlangt EXECUTION mit Operation, Commandhash und allen500 D/R-Hashes.
Neue Tokens für eine bereits verbrauchte Einheit sowie falsche oder abgelaufene
Bindungen werden abgewiesen. Ablauf und Widerruf werden auch vor dem Ergebnis-
schreiben erneut geprüft. Ohne Berechtigung bleibt der bisherige App-Zweig aktiv.

Geänderte Appmodule: `synthetik-500-lage-input.js`, `lage.js`; neue interne
Berechtigungsdatei `synthetik-500-mock-source-replay.js`. Unmittelbar angebunden
sind die vorhandenen Providerfixtures, Kalender-/Originalbuilder-Anbindung,
Materialaufbereitung, Runtime und deren bestehende Python-Start-/Inputwächter.
Keine HTTP-Route oder Production-Konfiguration wurde verändert.

Der unveränderte Original-D-Konstruktor erhält ausschließlich für seinen lokal
gebundenen Aufruf eine Require-Fassade auf den gemeinsamen tatsächlichen
App-Projektor. Kein globaler App-Export, privater Quelltext oder Originalpin wird
umgeschrieben. Die bereits vorhandenen begrenzten Kalenderanpassungen bleiben.
Historische Quellen werden im Providerprompt und gespeicherten Lage-Ergebnis
explizit als historisch markiert. Cachebindungen sind getrennt; kein aktueller
Quellenerfolg wird daraus abgeleitet.

## Vor Aktivierung zwingend

1. Alle11 Originaldateien einschließlich Manifest/GPG/Größen/Hashes prüfen.
2. Alle500 vollständigen Eingaben und ihre ursprünglichen Profile binden.
3. Für jedes Profil mit dem echten App-Projektor einen nichtleeren historischen
   Kontext sowie die echten D- und Review-Requests konstruieren; bestehende
   Qualitätsprüfung anwenden, qualifizierte Mock-Ausgaben unverändert erhalten.
4. Alle500 tatsächlichen Original-D-Requesthashes mit dem Providerkonstruktor
   vergleichen. Nur genuine D/R-Konstruktorresultate besitzen den internen
   Vorbereitungsnachweis; frei erfundene Hashfelder oder JSON-Kopien reichen nicht.
5. Erst danach EXECUTION-Bindung und vorhandene native Profilaktivierung zulassen.
   Die tatsächlichen späteren Providerrequests müssen weiterhin genau auf die
   geprüften D/R-Hashes sowie die nativen Sender-/Kostenclaims passen.

Der aktuelle Entwicklungstest verwendet vollständig erfundene kleine Eingaben
für alle500 Bindungspositionen, keine privaten Originale, DB oder Modelle.
Eine vollständige erneute Originalqualifikation wird nicht behauptet. Die noch
notwendige echte Eingabeprüfung erfolgt im später separat genehmigten Mockjob
vor jeglicher Aktivierung; kein zusätzlicher geschützter Diagnoselauf nötig.

## Sourcecode-Belege

Der alte16/2-Quellencodevergleich bleibt als historischer Beleg unverändert.
Der neue ausdrücklich optierte Zweig bindet13 dieser Quellen unverändert und
5 begrenzte aktuelle Codebindungen: die vorhandenen AI-/Storage-Segmente plus
Lage- und beide Providerdateien. Die drei neuen vollständigen Pins stehen in
`mock500_source_replay_pins.json`; unbekannte, fehlende oder abweichende Pins
scheitern. Das ist keine neue500/500-Konstruktorqualifikation. Die vollständige
aktuelle öffentliche Codequalifikation und unabhängige Abnahme bleiben Pflicht.
Der vorhandene geschlossene Worker-Modulgraph bindet außerdem die geänderte
Lage-Datei und beide finite-Input-/Berechtigungsmodule vollständig nach Bytes/SHA.
Die gezielte echte Worker-Gegenprobe vor ungültigem Inhalt besteht; keine
Graph-/Pinprüfung wurde entfernt. Bestehende Provider-Fehlerzeilen bleiben erhalten.

## Gezielte Prüfung

- App-AsOf:7 Gruppen einschließlich aller500 gleichen Quellenzeitbindungen,
  echten Lage-Aufruf/Schreibpfad, gefälschter/abgelaufener/widerrufener Bindungen,
  PREPARATION-Abweisung, unverändertem Standard und Cachetrennung:PASS.
- Alle500 erfundenen D/Provider/Review-Konstruktorbindungen, unveränderte Ausgaben,
  letzte Position manipuliert, JSON-Forgery, Widerruf:PASS.
- Admittanz und13/5-Sourcecode-Brücke:7 Pythonfälle PASS.
- Bestehende betroffene Kalenderprüfung PASS; Start11, Inputs14, Host6+3 und
  alte Datumsbindung39 Fälle PASS. Keine vollständige lokale500er-Verarbeitung.
- Pflicht-CI und unabhängiger Review werden am tatsächlichen veröffentlichten
  Endkopf nachgewiesen. Eine Codeprüfung ist keine Mock500-Funktionsabnahme.

## Verbleibender zwingender Startblocker

Der innere Native-EU-Geldvertrag endet weiterhin am31.10.2026. Eine kleine
öffentliche synthetische Gegenprobe akzeptiert dieselbe Route und die erneuerten
Bücher am31.10.; am03.11. scheitern sie mit `EU-native-route-price-period` bzw.
`test-usd-EU-auftrag-unlesbar`. Preisende und Auftragsende sind Oktober; die
37 Auftragstage enden ebenfalls dort. Die Materials-Vorbereitung prüft den echten
Novembertag schon vor Originalbuilder und Aktivierung. Das außen genehmigte
Novemberfenster hat diese inneren Regeln nicht geändert.

Dieser Auftrag erlaubt Quellen-AsOf, keine Änderung am Geld-/Preisvertrag.
Deshalb bleiben diese Regeln unangetastet. Mock500 ist noch nicht startbereit.
Kleinste nächste Betreiberentscheidung: einen ausschließlich isolierten Mock-
Simulations-Kalendervertrag für das genehmigte Novemberfenster entwickeln lassen.
Reale Uhr und Bücher bleiben November, Geldgrenzen und alte Bücher unverändert;
Oktoberpreise wären ausdrücklich nur historische Simulationsreferenz, keine
behaupteten November-Anbieterpreise. Production-Vertrag und echte Modellaufrufe
bleiben gesperrt. Erst nach dessen gezielter Prüfung, Pflicht-CI und unabhängigem
Review kann genau eine konkrete vollständige Mock500-Einmalfreigabe gebunden werden.

Alle500 Profile/500Units/1000Mockphasen/1500 einzeln geprüften Ergebnisse/
8000 Sicherheitskontrollen/17000 Auditprüfungen, komplette verschlüsselte Sicherung,
authentifizierte Rücklesung, zweite Wiederherstellung/Integritätsvergleich,
finale Nullaktivität und Prozessstillstand bleiben Pflicht. Dynamischer Hostschutz,
mindestens2147483648B Hostreserve, Swap/OOM/max0,512MiB Plattenreserve,
180Min Verarbeitung/210Min gesamt im selben UTC- und Berliner Tag,0,05USD
Speicherung/1verschlüsseltes Artefakt für1Tag und0echte Modellaufrufe bleiben.
Keine Ausführung, kein Merge/Deployment/Production. HistorischeFAILs bleiben.
