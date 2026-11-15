# Sofortprüfung15.11.2026: tatsächliche Quellenwirkung und Quittungsreparatur

Betreiberziel: **heute fertig werden, jetzt prüfen**. Die Prüfung wurde vorgezogen;
der nächste reguläre Lauf ist kein Ersatz für bereits mögliche Sofortnachweise.

## Gemessene Wirkung

Frische Originalantworten12:43UTC:DestatisHTTP200/SHA256
`e0f35adf8cc2132277aee2162ef3fe69d73a342947bd99108f30fa20ca464e7a`,
iRightsHTTP200/SHA256
`a31b73b0774e06e837caeba632fb5b5142965148f4bbb79264c92bca008bc157`.
Diese Bytes durch die echte lokale CrawlSource-Kette, mit gesperrten Ersatz-/
Artikel-/Bildrequests und entfernten Production-Kennungen:Destatis10datierte
brauchbareAuszüge,iRights15Items mit3CC-BY-Auszügen und12Titel/Link-Einträgen.
Keine Datenbank-/Modellaufrufe durch diese isolierte Parserprüfung.

Der heutige native Plan war bereits fertig156/156,Manifest
`d84e18b1feff76de410d100eb678990968ebc23c7c655ac3fce187141e7f8b12`,
mit0neuenFeedaufträgen. Auf den ausdrücklichen Sofortauftrag wurden atomar über
die vorhandene `helmut_enqueue_job` genau zwei globale Jobs ergänzt;der Plan,
alte Jobs und bestehende Ergebnisse blieben unverändert. Native Compilerkeys,
Fenster2026-11-15T00Z,tenantnull,Priorität100/max5,keine Profilkennung im Payload.
SQLSHA256`0a1ea1912781ade323c0a123919843db45419f0b7faa7937f319f28100740446`.
Unabhängiges Review dieses Nachtrags ohne P1/P2;kein Umgehen der Adminsession.

Der Betreiber startete genau einmal in seiner echten Adminsitzung:
`admin-quellen-2026-11-15-1671232c-ed18-49ed-a9ff-b08fc9f9a193`.
Start12:54:50.138,Ende12:58:35.900UTC,Statussuccess;
13erledigt/65vertagt/0endgültigeFehler. Beide neuen Sourcejobs je einmal erledigt:
`7e17cdc7-3da5-46b5-8474-e428e9e97905`(iRights12:54:57),
`8f94986c-4c19-4ffe-acfd-c7c8089a8552`(Destatis12:55:02).

Getrennte lesende Datenbankkontrolle bestätigt25gespeicherte Dokumente:
Destatis10datierteTextauszüge,max443Zeichen;
iRights15datierteEinträge,genau3lizenzierteTextauszüge,max399Zeichen,
12ohneArtikeltext. Drei tatsächlich gespeicherte Lizenz-/Herkunftsbelege wurden
gegen den echten Validator sowie Lage- und Briefing-Quellen-DTOs geprüft:
Autor/Titel/Original/OERinfo/Datum/Lizenzlink/Bearbeitungshinweis erhalten.
Dabei keine Profilabfrage,kein Modell und kein Production-Schreiben.

Native Abdeckungsquittung desselben Laufs12:58:36:
**4→0Fehler,95→88Warnungen,2unbekannteWege,13Konfigurationsdrift**,
9Bedarfspakete,keine Zuordnungslücke. Status bleibt `partial/eingeschraenkt`.
Weder Warnungen noch unbekannte Zustände werden für ein PASS umgedeutet.

## Genau freigegebene Paketaktualisierung

Die automatische Freigabeprüfung lehnte zunächst zwei weitere Verarbeitungsposts
wegen fehlender aktueller Kostenvorprüfung und uneindeutiger weiterer Laufrechte ab.
Sie wurden nicht ausgeführt. Danach Kostenbuch erneut geprüft und ausdrückliches
Betreiber-GO erhalten:genau einmal Lage und Morgen,ein bestehender Pilot,
jehöchstens240Sekunden,max0,377571USDzusätzlich innerhalb1USDjeUTC-Tag/30USDgesamt,
gültige Caches erhalten,keine Resets,nur bestehende Briefingmeldung bei neuem Inhalt.

Tatsächliche Abschlüsse:

- Lage`briefing-lage-20261115131056-g07mq`,13:10:56–13:11:28UTC:
  frisch erzeugt,`fromCache:false`,6Vorgänge,Quittunggespeichert,
  aber weiter`quellenversorgung-offen/partial`.
- Morgen`briefing-morning-20261115131130-iqj8k`,13:11:30–13:11:43UTC:
  Ergebnis verfügbar,Quittunggespeichert,`morgenversorgung-unvollstaendig/partial`.

Tageskosten danach0,636184USD,Gesamtbindung4,019218USD,8Altreservenunverändert.
Sofort-Quellenlauf0,086140USDzusätzlich,Lage0,013755USDzusätzlich;
Morgentransformation ohne weitere Modellkosten. Keine weitere Wiederholung.

## Konkret nachgewiesene verbleibende Codeursache

Beide Sourcejobs sind erfolgreich und alle25Dokumente gespeichert. Trotzdem
existiert für diese beiden Quellen keine Zeile in `source_crawl_telemetry`.
Die einzelne relevante Production-Konfiguration wurde rein lesend geprüft:
`HELMUT_SOURCE_TELEMETRY=on`. Der vorhandene ältere Scheduler verwendet bereits
`buildSourceTelemetryRows`/`persistSourceCrawlTelemetry`/Storagewriter.
Der moderne Queuehandler und seine workerDeps banden diese Verbindung nicht an.
Dadurch fehlen dem vorhandenen Abdeckungsprüfer technische Abrufbelege.

Kleinster Patch:vorhandene Messungen und bestätigte neue Dokumentkennungen durch
den vorhandenen Writer quittieren,mit unverändertem Flag und existierender Tabelle.
Keine neue Architektur,keine Migration/Env-/Quoten-/Budgetänderung,keine Rohtexte
oder Profilfelder. Fehler/Timeout/fehlende Restzeit im Diagnosewriter dürfen
erfolgreiche Facharbeit nicht wiederholen oder verwerfen. Unbestätigte Persistenz
wird nicht als gesunder Abruf ausgegeben. Es werden **keine historischen fehlenden
Zeitmessungen rekonstruiert oder nachträglich als ursprüngliche Quittung erfunden**.

Codebeleg`b7ae05262a80caa08e8ba839bc021fe1fac1b73f`,unverändert integriert
als`9c0c593976b4bc5efc4b99b43bab148e82058019`:
8/8neueHandlergruppen und37/37bestehendeTelemetrieassertions lokal über `lokal.js`
grün. Unabhängiges Code-/Timeout-/Writerreview ohne P1/P2.

## Enger Prüfvertrag

PR1217 bindet den zentralen Hook und den neuen Regressionstest an exakt geprüfte
Blobs,Mainbasis9ff4416b,den lokalen Belegbaum und den vollständigen übrigen Baum.
Beide Pflichtjobs bleiben. Neue CI-Auswahlgegenfälle47/47 lokal grün;
die CI führt14bestehendeKernsuiten,8neueQuittungsgruppen,37bestehendeTelemetrie-
assertions und die beiden betroffenen bestehenden Queue-/Versionsverträge aus.
Keine Datenbank-/500er-/Massentests oder bezahlten Tests. Browser nicht betroffen.
Unerwartete Dateien/Blobs stoppen,kein Rückfall auf Mengenläufe. Auf Main zusätzlich
tatsächlichen gemergten PR,beide Eltern und identischen PR-/Mergebaum prüfen.
Auch ein falscher Mergetitel erreicht den Guard und wird dort abgelehnt.

Ein Merge/Deployment ersetzt weder den nächsten tatsächlich gemessenen Abruf
noch die vollständige Kunden-/Rechtsabnahme. Das heutige Ziel bleibt gespeichert;
ein unbekannter Zustand wird unter Zeitdruck nicht in einen Erfolg umgewertet.

Erster PR-Kopf`bff6a4dd`,CI43719247865:Browserpflichtjob erfolgreich;
Syntaxjob stoppte an der bereits auf unverändertem Main9ff4416b reproduzierten
veralteten Erwartung in`artikel-versionskonflikt-test.js:102`. Der native
Versorgungsstand bleibt absichtlich`offen`, kennzeichnet die terminal beendete
Verarbeitung aber bereits mit`verarbeitungBeendet:true`. Nur diese Erwartung
angepasst;keine Produktionslogik geändert. Bestehende9/9Gruppen danach grün.
Neuer Belegbaum`2c1b765d4577bb84ee8d27de25ae223528ebbc13`bindet zusätzlich
diesen einen Testblob;beide ursprünglichen Runtime-/Regressionstestblobs unverändert.
