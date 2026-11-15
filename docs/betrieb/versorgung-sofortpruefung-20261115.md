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

## Nach Merge tatsächlich kontrolliert

[PR1217](https://github.com/ernisch/helmut-pilot/pull/1217),Endkopf
`9f9e4dea73583b161a37fb5eda05349d05c7d887`,beidePflichtchecks
[CI43720003288](https://github.com/ernisch/helmut-pilot/actions/runs/43720003288)
erfolgreich:14/14Kern,47/47Plan,8/8Hook,37/37Telemetrie,9/9Artikelkonflikte
sowie bestehender Queue-/Blobvertrag. Browserausführung bewusst nicht betroffen;
keine pauschale Offline-/Datenbank-/Mengenprüfung und keine Modellaufrufe.
Unabhängiges Review auch der letzten Erwartungs-/CI-Bindungsänderung ohne P1/P2.

Merge`528a9fc9f15ba22a5595e006696f49d1f2b164b2`;
[MainCI43720218065](https://github.com/ernisch/helmut-pilot/actions/runs/43720218065)
ebenfalls beide Pflichtjobs erfolgreich. Beide Mainpläne bestätigen exakt
`quellenquittung`,standard/database/browserfalse und tatsächlichen Mergebaum.
Reguläres Productiondeployment`dpl_61DGW51cAvxbHpnGSfySZxqt7CTR`READY,
Aliases einschließlich`helmut-pilot.vercel.app`gebunden;getrennte öffentliche
HTML-Kontrolle13:41:09UTC HTTP200,Assetversion`528a9fc9`. Kein Modell-/Appstart.

Erneute eng begrenzte SQL-Nachkontrolle nach Merge:nur die fünf bereits
gebundenen alten Erfolgsjob-IDs,alle weiterhin`erledigt`und exakt dieselben
Payload-MD5;beide neuen Quellenjobs weiterhin`erledigt/attempts1`.
Kostenbuch13:41:55UTC bestätigt0,636184USDheute/4,019218USDgesamtgebunden,
8offeneAltreserven. Kein zusätzlicher Verbrauch durch Tests/Merge/HTMLkontrolle.
Quellenkontingent13:43UTC:8/8Fenster,2400/2400reservierteSekunden,
16/16Originalabrufe;kein Reset und keine Erhöhung. Deshalb kein weiterer
Adminquellenlauf als künstlicher Funktionsnachweis.

Die technische Verdrahtung ist geprüft und live;eine echte neue Sourcequittung
mit dieser Runtime ist noch nicht belegt. Fehlende historische Messwerte bleiben
fehlend. Der heutige Lauf hat zwar die vier strukturellen Fehler beseitigt und
Lage/Morgen aktualisiert,aber88Warnungen/2unbekannteWege/13Drift undpartial
bleiben tatsächlicher letzter Abdeckungsstand. Rechts- und echte Kundenabnahme
bleiben separat offen. **Genau ein nächster Schritt:** die bestehende einmalige
Kontrolle16Nov05:25UTC prüft die ohnehin regulären Quellen-/Lage-/Morgenabschlüsse
gezielt auf echte neue Abrufquittungen und verbleibende Versorgungslücken.
Sie startet keine zusätzlichen Verarbeitungsläufe und plant sich nicht neu.

## Fortsetzung auf erneuten Sofortauftrag,14:04UTC

Das ausgeschöpfte Quellenkontingent sperrt neue Abrufe,keine rein lesende
Bestandsdiagnose oder gezielte lokale Reparatur eines bewiesenen Codefehlers.
Die Aussage „nur morgen weiter“ gilt nicht für den gesamten Entwicklungsauftrag.

Native Nachkontrolle:Alle elf eingereihten Inhaltsaufträge der neuen Quellen
sind erledigt(Destatis10,iRights1). Die25Quelldokumente sind damit nicht mit
25zu erstellenden Modellanalysen gleichzusetzen;Titel/Link-Einträge und nicht
neu eingereihte historische Artikel dürfen keinen künstlichen Auftrag erhalten.

Für den tatsächlichen Tagesrest ist nach bestehendem`helmut_jobs_tagesstand`
`coalesce(last_seen_window,freshness_window)` maßgeblich. Daraus folgen36offene
globale Inhaltsjobs:21heuteangelegt,15heutewiedergefunden. Keine laufenden Jobs.
Historische Bestandszähler aus anderen Ursprungsfenstern sind kein pauschaler
Nachweis heutiger Fehler;keine Wiedereröffnung oder Bereinigung des Altbestands.

Die Zuordnung der früher belegten14Metadatenkonflikte zu den heutigen21Jobs
war eine falsche Annahme und wurde im Gespräch korrigiert. Enger SQL-Vergleich
aller36aktuell offenen Bindungen:Archive vorhanden,Titel/Herausgeber/
Publikationsdatum gegenüber kanonischer Zeile jeweils0Abweichungen. Dies ist
keine Lockerung der vorhandenen Versionswache und kein neuer Volltextnachweis.

Nur das relevante Production-Hostflag lesend geprüft,keine Secrets ausgegeben.
Unter36offenen Jobs sind33Webartikel auf nicht freigegebenen exakten Hosts,
2DIP-Dokumentziele(die separat ihrem amtlichen Quellfeldvertrag unterliegen) und
1NDR-Artikel auf freigegebenem Host. „general-koalition“ oder eine Ausschuss-
Quell-ID beweist keinen amtlichen Herausgeber:Ein konkret gelesener gebundener
Metadatensatz zeigt beispielsweise ein SZ-Artikelziel. Keine pauschale Host-
oder Nutzungsfreigabe aus einer Suchquelle ableiten.
Für die sieben zunächst eingegrenzten Medien-/Verbandsartikel existiert unter
den beiden nativen Verfahrensschlüsseln kein gespeicherter Artikelkontext;
alle fünf betroffenen Hosts sind derzeit nicht freigegeben. Daraus wird keine
Lizenzbehauptung,kein Quotenreset und keine nachträgliche Artikelquittung.
NDR-Negativbeleg und unbekannter CAS-Ausgang bleiben wie zuvor gesichert.

Ein zusätzlicher konkreter Fehler ist nativ belegt:EUR-Lex-Sourcejob
`db0829c6-f0d9-4185-984d-fbf1db0f8323`,5Versuche,fehlgeschlagen mit
`Ungültige RSS-Antwort des Metadatenfeeds` an
`https://eur-lex.europa.eu/DE/display-feed.rss?rssId=222`.
Die vorhandene Parserwache weist Nicht-RSS-Antworten korrekt zurück;ohne echte
Antwort ist ein Parserfehler nicht belegt. Die automatische Freigabeprüfung
lehnte einen weiteren GET wegen ausgeschöpftem Quellenkontingent/Verbot weiterer
Abrufe ab;er wurde nicht ausgeführt. Separate konkrete Ausnahme angefragt:
genau1lesenderGET,max128KiB/20s,keineWeiterleitung/Modelle/Jobs/DBänderung,
kein Reset und keine Limiterhöhung. Vorbereiteter Ablauf verwendet Einmalmarker
und erzeugt keine native Erfolgsquittung. Freigabe steht noch aus.
Kein Code geändert,kein Test wiederholt,kein weiterer Modelllauf gestartet.

## Fortsetzung nach erneutem Betreiber-GO,15:19UTC

Die konkrete Diagnosefreigabe ist durch„Du hast jede Freigabe. Arbeite weiter“
erteilt und umgesetzt;keine weitere gleiche Frage. Insgesamt4begrenzte öffentliche
GETs,native Budgets/Quoten unverändert:zweimal ursprüngliche Feedadresse302/110Bytes,
dann das bekannte Ziel`https://eur-lex.europa.eu/TodayOJ/index.html?rssId=222`
14:58:28UTC HTTP202/text-html/2035Bytes/SHA256
`6d795213b4337db12acac0779220c1ac179ea4ff54ada9c6ddbe3079b8e24724`.
Auch die bekannte offizielle RSS-Hilfeseite15:00:10UTC liefert202/dieselbe
Art JavaScript-WAF-Challenge,SHA256
`bd5f460a59b590dbced46cbc730c8559683bf3ec214e3c91860fe6b81574ad81`.
Die erste Weiterleitung enthält lediglich den HTTPS-Standardport443;die
Diagnosefolge wurde deshalb auf die identische kanonische Domainadresse begrenzt.
Keine Challenge ausgeführt,keine Cookies oder Schutzumgehung,kein Fremdhost.
Challenge-Tokens/Rohseiten werden nicht in Git übernommen,nur Antwortmerkmale/Hashes.

Die echte native CrawlSource-Kette reproduziert mit diesen gespeicherten
Antworten offline exakt den Productionfehler`Ungültige RSS-Antwort des Metadatenfeeds`.
Der Parser weist Nicht-RSS korrekt zurück. Kein Parserpatch oder vermeintlicher
Leerabruf-Erfolg. Die Quelle bleibt wegen einer externen Botprüfung gestört.

Weitere gezielte Bestandsprüfung fand zwei alte DIP-Fundstellen ohne Pfadbindung,
bei gleichzeitig gültigen amtlichen Quellenfeldern. Vollarchivexport automatisch
als zu breit abgelehnt/nicht ausgeführt;die bereits genehmigte öffentliche
Feldprojektion reichte für den nativen Funktionsvergleich. Kein weiterer
Profilabgleich. [Ursache,konkrete2Zeilenreparatur,29gezieltePrüfungen,Review,
getrennteNachkontrolleundRückweg](dip-fundstellen-korrektur-20261115.md).
Die Zuordnung ist tatsächlich korrigiert,beide Jobs wurden nicht zurückgesetzt
oder künstlich abgeschlossen. EUR-Lex,weitere fehlende Originalbelege sowie
vollständige Kunden-/Rechtsabnahme bleiben echte Grenzen. Kein Gesamt-PASS.
