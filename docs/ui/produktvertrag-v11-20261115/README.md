# UI-Abgleich mit Produktvertrag v1.1

Stand: 15.11.2026. Branch `codex/ui-produktvertrag-v11-20261115`, Basis `c16ce6bc`.
**Erfolgreich für die UI-Änderung abgeschlossen.** [PR1208](https://github.com/ernisch/helmut-pilot/pull/1208)
am15.11.2026,10:43:05UTC auf `3ae386b8` gemergt. Beide Pflichtchecks auf
`1d26362c` erfolgreich; reguläres Production-Deployment READY und Hauptdomain
lesend geprüft. [Live-Nachweis](live-verification.json).

## Verhalten und Abgrenzung

- Kundenansprache in Einstieg, Onboarding, Profil, Rückmeldungen, Offlinehinweis,
  Datenschutzseite, Offline-Ersatzseite, PWA-Installationsbeschreibung, Push-Hinweisen und vorhandenen UI-Hilfstexten auf Sie vereinheitlicht.
  Der bestehende Anzeigeadapter behandelt zusätzlich invertierte Modalverben.
  Originaltitel, gespeicherte Profilwerte und für Dritte bestimmte Bürotexte
  werden nicht pauschal umgeschrieben.
- Lage zeigt zunächst fünf vorhandene Vorgänge. Alle übrigen sind ausdrücklich
  aufklappbar; Auswahl, Detail, Rückweg und Tastaturfokus bleiben bedienbar.
  Verweise auf einen weiteren Vorgang öffnen dessen Detail und erweitern die Liste.
- Radar teilt die drei Erstplätze über die sichtbaren Bereiche statt pro Bereich
  zu begrenzen. Bestehende Bereichsreihenfolge und die gelieferten Listen bleiben
  erhalten; keine neue fachliche Rangberechnung. Im Umfeld bleibt das gewählte
  Segment maßgeblich. Alle weiteren Einträge sind gemeinsam aufklappbar,
  andere Segmente bleiben zugänglich. Ein ausgeblendeter vorhandener Hinweis
  wird nicht als fehlender Beleg bezeichnet. Zählung und Status nutzen den ganzen
  gelieferten Stand, keine Veränderung von Daten oder Quellen.
- Briefing zeigt den Hauptvorgang und höchstens zwei weitere Prioritäten insgesamt,
  auch bei mehreren Frischegruppen. Kein Auffüllen und kein doppelter Hauptvorgang.
- Die verpflichtende Büroformatwahl war bereits durch PR1135 live. Die Auswahl
  wird auf die sechs in Beschluss18 genannten Formate begrenzt: Statement, X,
  LinkedIn, Instagram, Bürgerbrief und bei passender Zuständigkeit Ausschussfragen.
  Der zusätzliche Büroauftrag wird nicht mehr angeboten. Definitionen, alte Caches
  und Serverkanäle bleiben erhalten. Kein automatischer Erstellauftrag.

Keine Datenmotor-, Auswahl-, Quellen-, Prompt-, Kosten-, Authentifizierungs-,
Migrations-, Cron- oder Konfigurationsänderung. `server.js` ändert ausschließlich
fünf Benutzertexte. Die offenen älteren UI-PRs1156/1141/771 wurden nicht übernommen;
PR1207 betrifft andere Runtime-Dateien. Der gemeinsame Betriebsstatus bleibt im
laufenden Datenmotor-Thread; dieser UI-Nachweis wird separat geführt.

## Nachweise

[Maschinenlesbarer Nachweis](verification.json) bindet die Runtime-Dateien per SHA256.

- Briefing:130/130, Radar:54/54, Büro-Ehrlichkeit:76/76,
  Büro-Antwortzeit:13/13 Gruppen, UI-Ehrlichkeit:37/37; PWA-Icons70/70 und Service-Worker-Start10/10 Gruppen.
- Chromium:87 neue Vertragsprüfungen sowie300 Büro-Bindungsprüfungen;
  Desktop1440, Mobil390/360, echter Client und CSS mit synthetischen Eingaben.
  Formatwahl/Navigation ohne Erstellrequest, explizite Erstellung genau einmal,
  Cache-/Quellen-/Mandatsbindung sowie unveränderte Zielgruppenansprache geprüft.
  Eigener Netzwerk-Namensraum, ausschließlich simulierte APIs, keine extern
  erfüllten Anfragen und keine unbehandelten Browserfehler.
- Syntax und `git diff --check` bestanden. Kein bezahlter Modelltest.

Reproduzierbare Browserbefehle, immer mit lokalem Schutzstarter:

```
node scripts/lokal.js -- python scripts/ui-preview-isolated.py --only ui-preview-browser-check.js --produktvertrag
node scripts/lokal.js -- python scripts/ui-preview-isolated.py --only ui-office-binding-browser-test.js
```

## Erhaltene Grenzen und Erstfehler

Der allgemeine ältere UI-Runner ist kein grüner Gesamtnachweis: Er stoppt an
`desktop: error office is explicit`, weil seine Wortliste den bestehenden Hinweis
`Quellentext fehlt` nicht erkennt. Mit unveränderten main-Assets `c16ce6bc` wurde
der identische Fehler nach59 erfolgreichen Assertions reproduziert. Die neuen
Vertragsfälle laufen gezielt über `--produktvertrag`; keine Fehlerunterdrückung
im allgemeinen Runner. Der erste Erweiterungsversuch enthielt einen doppelt
angefügten Testblock; dieser wurde entfernt. Ein neuer Unitfall referenzierte
zunächst eine falsche Fixturevariable; korrigiert und130/130 bestätigt.

Ein versehentlich mitlaufender lokaler Standardlauf wurde beendet und zählt nicht
als Nachweis; mehrere HTTP-Tests meldeten dort gesperrte Loopbackports. Der danach
auf zusätzliche UI-Bereichssuiten begrenzte Lauf bestand11/12: ausschließlich
`kalender-ics-test.js` scheiterte an der hier nicht installierten Dependency
`ical.js`; keine Kalenderdatei geändert. Die erforderliche CI installiert regulär
Dependencies und muss vollständig grün sein. Keine neue Vollsuite lokal.

## Erster Pflicht-CI-Befund

CI43696525538 auf `2df50b6d`: Browsercheck stoppt am alten direkten Zugriff auf
`desktop-scroll-8` (neunter Lagevorgang), der nach der neuen Fünfergrenze korrekt
noch nicht angezeigt wird. Der Test klickt nun zuerst den sichtbaren Aufklapper
und prüft zusätzlich fünf vor / zwölf nach dem Aufklappen; alle ursprünglichen
Scroll-/Detail-/Historyprüfungen bleiben erhalten. Seine spätere Du-Erwartung
für die Orientierungsmeldung ist ebenfalls auf den neuen Sie-Text aktualisiert.
Kein Runtimefix, keine Lockerung einer Sicherheitsprüfung. Neuer Kopf braucht
neue vollständige Pflicht-CI.

CI43696831366 auf `bfe54c46`: Lage-/Scroll-/Historyfälle auf Desktop und Mobil
bestanden. Der nächste Erstfehler ist ausschließlich die alte exakte Du-Erwartung
im Profil-Speichertest (`profil-kompakt-browser.js:157`); auf den sichtbaren
Sie-Wortlaut korrigiert. Speichern, Fehlererhalt und manuelle Wiederholung bleiben
unverändert geprüft. Keine weitere alte Erwartung dieser geänderten Benutzertexte
in den Browserhilfen gefunden. Auch danach ist neue Pflicht-CI erforderlich.

## Ergänzender Sprachabgleich

Der Browsercheck43697101424 auf `9876a1f9` ist grün. Zusätzlich beim finalen
Abgleich gefundene Kundenhinweise in `sw.js`, `site.webmanifest` und `push.js`
auf Sie korrigiert. Ausschließlich Textänderungen; keine Änderung an Push-Auswahl,
Versand, Cacheverhalten oder Modellprompts. Modellanweisungen wie „Du bist Helmut“
sind keine Kundenansprache und bleiben unverändert. Drei reine Push-Textfälle
prüfen die Sie-Anrede und unveränderte Originaltitel mit Du; kein Push wurde versandt.
Der vorhandene echte Service-Worker-Browserfall prüft nun zusätzlich die Sie-Anrede
seiner Offlineantwort. Neuer Kopf benötigt wiederum beide Pflichtchecks.

Die zunächst verwendete historische `stoerungswahrheit`-Suite meldete28/29:
alle drei neuen Textfälle grün, ein alter Sourcetextcheck verlangt `in deiner Lage`,
das bereits im unveränderten main fehlt. Suite unverändert erhalten; die neuen
Textfälle gehören jetzt zur bestehenden UI-Ehrlichkeitssuite37/37. Kein behauptetes
Gesamt-PASS dieser historischen Probe.

## Quellenpflicht und aktueller main-Abgleich

CI43697716311 auf `41bd3b92`: Browser grün;188/189 Standardsuiten bestanden.
Einziger Fehler: `quellenpflicht-vertrag-test.js` erwartet vier gültige Radarsignale
bereits in der Erstansicht. Der Test prüft nun erst drei und den sichtbaren
Aufklapper, danach alle vier; sämtliche Negativfälle und Linkprüfungen bleiben
unverändert. Gezielt59/59 bestanden. Keine Quellensperre gelockert.

Während CI wurde main auf `236ced65` (PR1209, grüne Pflichtchecks) aktualisiert.
Die neue iRights-Attribution liegt in getrennten Clienthilfen. Konfliktfreier
kombinierter Baum `cbc038244fc209728f2aa171b104e34633035cdf` separat geprüft:
130Briefing-,54Radar-Assertions,11Quellenhinweisgruppen sowie87netzlose
Browserprüfungen bestanden. Danach main regulär in den eigenen Branch integriert;
Quellenänderungen bleiben erhalten. Neue Pflicht-CI für diesen Kopf erforderlich.

## Bereichs-CI auf dem integrierten Stand

CI43700280257 auf `b047031a`: Browser und Standard-Offlinesuite grün.
Bereichssuiten389/390; allein `briefing-vollstaendigkeit-test.js` bricht im
isoliert geladenen Radar-Renderer mit `RADAR_SEGMENTS is not defined` ab.
Der Testkontext erhält die benötigten Anzeigezustände und den Array-Filter;
alle fachlichen Assertions und Rohbelegprüfungen bleiben unverändert.
Gezielt24/24 Vollständigkeitsprüfungen bestanden. Kein Runtimefix. Jüngster main `3734927f` enthält nur Dokumentation (PR1210),
wurde vor der neuen CI regulär integriert; keine geänderten Runtimebytes.

## Risiko und Rückweg

Nur Darstellung und Formatangebot ändern sich; die Datenmotor-Fachabnahme bleibt
getrennt. Ein regulärer Revert dieses UI-Commits stellt die vorherige Darstellung
wieder her; keine Datenbereinigung oder Migration nötig. Bereits vorhandene
Sicherheitsprüfungen, Kostenfreigaben und ausdrückliche Erstellpflicht bleiben aktiv.

## Endstand nach Merge und regulärem Deployment

CI43702615304:189/189 Standardsuiten,390/390 Bereichssuiten und echter
Desktop-/Mobil-Browsercheck erfolgreich. Tatsächlicher Mergebaum
`a42023a35a3066930b6e9bd2118e86e6a9362e84` ist exakt der vorab geprüfte Baum.
Aktueller main vor Merge `3734927f`, alle sechs Runtime-Hashbindungen bestätigt;
keine aktive Überschneidung mit Quellen-PR1207, keine fremden PRs übernommen.

Production `dpl_5eYyFUnZr7A64NoGWSVghuxfM1Zu`, Commit `3ae386b8`, READY;
`helmut-pilot.vercel.app` zugewiesen. Lesende Kontrolle10:44UTC: Hauptseite,
Client,CSS,Service Worker,Manifest,Datenschutz und öffentlicher Release-Leser
HTTP200. Alle vier ausgelieferten Dateien bytegleich zum geprüften Stand,
Assetversion `3ae386b8`. Neue Sie-Texte in Startseite/Datenschutz bestätigt.
Error-/Fatal-Abfrage dieses Deployments seit10:43:05UTC ohne Treffer.

Öffentlicher Release-Leser: `ok=true`, `storage=true`, `ready=false`.
Das ist kein Gesamt-PASS und keine Verkaufs- oder Datenschutzfreigabe.
Die offenen Betriebsfragen bleiben beim Datenmotorauftrag. Kein authentifizierter
Kundendurchlauf oder zusätzlicher bezahlter Modelltest behauptet.
Dieser abschließende reine Nachweis-PR ändert keine Runtime und erfordert keinen
rekursiven Dokumentations-Folge-PR. Sein Merge und Deployment/Skip werden über
Git-/Vercel-Historie bestätigt.
