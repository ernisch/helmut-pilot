# Bereitschaft nach der Reparaturkette

Stand 19.09.2026 Tuerkei. **Status: blockiert. Noch nicht bereit.**
Nachtrag19.09.: Reparaturen, notwendige Betriebsbuchungen und gepruefte Merges
samt Deployment freigegeben; heute insgesamt hoechstens10 USD. Bestehender
4 USD Motorriegel bleibt vorerst enger. Tarif belegt, erster Fachstart vor
Modell und Quittung am vollen Telemetriering gesperrt. Ausfuehrerkorrektur
wird geprueft. Der500er Test wird noch nicht gestartet.
Aktueller [Ausfuehrungsstand](prosa-fachnachweis-2026-09-19.md#freigegebene-fortsetzung-und-nachgewiesener-speicherblocker).
Nachfolgende Betriebs und Kettenaufnahmen bleiben historische Vorflugbelege.
Die aktuelle Rollenreparatur steht im [Reparaturbeleg](akteursrollen-erhalten-2026-09-19.md).

## Aktuell bestaetigter Betrieb

Rein lesender Vercel Abgleich: Hauptalias `helmut-pilot.vercel.app` auf
`dpl_At93X1HMzB5fsAJ2wZQ8FuvW3Dfy`, READY, Production,
Main `2d1eb705e00ea5f5ff8f351997e429cc16d195c1`. Keine Deploymentaufnahme seit
17.09.00:00 UTC. Kein neuer Rollout durch diesen Auftrag.

SQL Aufnahme 19.09.01:37:28 Tuerkei /00:37:28 Berlin /18.09.22:37:28 UTC:
504 Profile, null aktiv, null lebende Pipelinesperren, null lebende Jobleases,
null unbeendete Fachlaeufe juenger als 20 Minuten. Das ist keine transaktionale
Gesamtaufnahme mit Vercel und keine neue Pruefung aller Laufzeitflags.

Kostenaufnahme 01:38:15 Tuerkei /00:38:15 Berlin /22:38:15 UTC:
0,444753 USD konservativ gebucht am UTC Tag 18.09., 66 Tickets,
keine offene Reservierung; unveraendertes Tageslimit 4 USD.
Das ist kein Anbieterrechnungsbeleg und keine Garantie fuer einen spaeteren Tag.
Der alte Gipfelversuch bleibt einmalig und abgeschlossen: 0,006921 USD.

## Voraussetzungen A bis O

| Punkt | Stand und verbindliches Kriterium |
| --- | --- |
| A Fachblocker | Technische Fixes sind vorhanden; vier Prosakategorien aus PR443 bleiben Ergebnis B. Rollenaufwertung, Ausschussidentitaet und Sachgebietsableitung offline repariert. Historische Modellursachen nicht bewiesen. |
| B Allgemeine Klassen | Keine bekannte verbleibende deterministische Aufwertung der hier explizit gelieferten Rollen und Unsicherheit gefunden. Allgemeine falsche Prosabeziehungen bleiben technisch moeglich und fachlich offen; kein bestandener Gesamtmotorbeleg. |
| C Artikelkontext | PR426 bis PR431 implementieren gebundenen Kontext, Abrufschutz und Anschluss. Standard aus; keine Aktivierung hier. Ein Absatz bis 600 Zeichen garantiert keine sachliche Abdeckung. Vor Aktivierung gesonderte Betreiberentscheidung zu Reichweite, Ablehnung fehlenden Kontexts, Latenz und Quellenzugriff. |
| D PR Kette | PR419 bis PR443 linear, jede Basis exakt Vorgaengerhead; aktueller Folgebranch auf PR443. Reihenfolge und Risiken unten. Keine fremden lokalen Vorarbeiten uebernommen. |
| E Production | Weiterhin Main `2d1eb705e00ea5f5ff8f351997e429cc16d195c1`; Reparaturkette ungemergt. |
| F Deployment | Merge nach main loest Production Deployment aus. Auch ein Dokumentationsmerge ist keine risikolose Ausnahme. Folgebranchdeployment explizit aus. |
| G Profile und Kommunikation | Alle 504 inaktiv. Zielvorschlag: die bisherigen fuenf Bestandsprofile plus die 495 bestehenden synthetischen Kennungen, vier andere ausgeschlossen. Konten und Identitaeten bleiben unveraendert. Kommunikationssperre vor Start frisch im echten Prozess nachweisen. |
| H Kostenriegel | Regel 2, atomare Vollreservierung, 4 USD pro UTC Tag; ungeklaerter Ausgang bleibt voll gebunden. Kein Budgetwechsel und kein Retry zur Umgehung. Ein Tageslimit ist kein mehrtaegiges Gesamtkostenlimit. |
| I Vollstaendigkeit | Feste eindeutige Liste mit genau 500 Kennungen vor Aktivierung hashen. Fuer jede Kennung Teilnahme, Beginn, Ergebnis, gespeichertes Paket, Morgenquittung, Lage, unabhaengige Gegenlesung, Appabruf und Fachurteil getrennt nachweisen. Alle 500 im Nenner; fehlend oder abgelehnt ist nicht bestanden. |
| J Qualitaet | Fachlich korrekte Quellenbindung, Thema, Rollen, Modalitaet und Ereigniszeit in saemtlichen sichtbaren Feldern; keine unbelegten Namen oder Fristen. Mandatsbezug, Quelle, Titel, Dubletten, Frische und Chronologie pro Paket pruefen. Attrappen und alte Tagesergebnisse ersetzen keine neue fachliche Abnahme. |
| K Stopps | Sofort keine weitere Facharbeit bei unerlaubter Zustellung, fremder Profilmutation, unklarer Schreibwirkung, Budget oder Zeitende, fehlender Kostenreserve, falscher Zielmenge, konkurrierendem Schreiber oder kritischem Inhaltsfehler. Unklarer Modellaufruf wird nicht wiederholt. Endkontrolle bleibt erforderlich. |
| L Laufzeit und Kosten | Vorschlag erst fuer spaetere Startentscheidung: ein UTC Tag, hoechstens 24 Stunden, Gesamtkosten hoechstens 4 USD einschliesslich aller Hintergrundaufrufe und offenen Reserven dieses Tages. Start nur mit belegter ausreichender Restreserve und Ausfuehrungsplanung. Dass 500 vollstaendige Pakete in diesem Rahmen erreichbar sind, ist nicht belegt; deshalb derzeit kein Startpaket. |
| M Testende | Heutigen Zustand wiederherstellen: alle 504 Profile inaktiv. Ergebnisse und Konten erhalten, nichts loeschen. Der alte 495er Abschluss laesst fuenf aktiv und ist fuer diesen Rueckweg nicht ausreichend. Aktivierung und Deaktivierung der fuenf Bestandsprofile brauchen ausdrueckliche Freigabe. |
| N Notwendige Production Schritte | Nach Fachnachweis: kumulativen Integrationsstand deployen und lesen; Artikelkontextentscheidung; festes Testfenster samt kapazitaetsgerechten Fortsetzungen und wirksamem Ende; genau 500 autorisiert aktivieren; erst danach gesondert Fachlauf starten. Keine notwendige Migration aus dieser Kette festgestellt. |
| O Betreiberfreigaben | Merge samt automatischem Deployment, jede Flag oder Cronaenderung, Profilaktivierung und Rueckweg sowie bezahlter Teststart sind getrennte kritische Aktionen. Diese Vorbereitung erteilt keine davon. |

## Belegte Betriebsgrenzen des naechsten Tests

### Quellenalter und Zeitwahrheit bei der fachlichen Abnahme

Das24 Stunden Kriterium beschreibt den aktuellen Datenstand und ist keine
pauschale Altersgrenze fuer jeden Artikel. Aeltere Quellen bleiben zulaessig,
wenn sie innerhalb des bestehenden Relevanzfensters noch sachlich relevant
sind. Sie duerfen nicht als neue Entwicklung des heutigen Tages erscheinen.

Fuer jedes der genau500 Profile die verwendeten Quellen erfassen: echtes
`published_at` und dessen Herkunft, Alter zum Bezugszeitpunkt, bestehende
Altersklassifizierung, Relevanzfenster und behauptete Ereigniszeit.
Unbekanntes oder widerspruechliches Publikationsdatum als solches ausweisen;
Abrufzeit niemals als Publikationszeit einsetzen. Rueckblick, aktuelle
Entwicklung und Zukunftstermin muessen in den sichtbaren Aussagen stimmen.
Ueberschreitungen, fehlende Belege und unbrauchbare Ergebnisse vollstaendig
ausweisen. Eine Stichprobe bleibt eine Stichprobe und besteht keine
vollstaendige Textpruefung aller500 Profile. Keine Aenderung des Motors oder
Relevanzfensters durch diesen Abnahmezusatz.

### Historische Ausfuehrer und neues Testfenster

`scripts/github-testfenster-500.js` gilt nur fuer 15.09.10:00 bis
16.09.11:00 UTC und gibt spaeter ohne Wirkung zurueck. Die zugehoerigen
Crontermine sichern keinen neuen Test. Sie wurden nicht geaendert.
`testkohorte-direkt500.js` und `testkohorte-testende.js` setzen bei ihren
bestehenden 495er Wegen fuenf aktive geschuetzte Profile voraus. Dieser Vertrag
passt nicht zum heutigen Ausgang und gewuenschten Rueckweg mit null aktiven.
Keine Schutzbedingung wurde gelockert, kein historischer Auftrag verlaengert.

PR420 repariert Auswahl und Fortsetzung, PR421 Paketspeicherung. Serielle
Verarbeitung mit 240 Sekunden je Aufruf und unveraenderte Ausloeser beweisen
keine Morgenversorgung fuer alle 500. Im abgeschlossenen Test gab es 497 Pakete,
131 Morgenquittungen und fuenf Lagen; diese unterschiedlichen Nenner sind keine
Gesamtabnahme. Ein neuer Zeitplan und ein sicherer Endweg muessen vor Start
offline vorbereitet, mit dem heutigen Bestand geprueft und separat freigegeben
werden. Das ist eine benannte Production Planungsgrenze, kein neuer Cronauftrag.

## Integration und Rueckweg

**Aktueller Integrationsauftrag19.09.:** Alle28 offenen Draft PRs geprueft.
PR419 bis445 bilden die lineare Reparaturkette; alle27 exakten Koepfe sind
Vorfahren des gemeinsamen Endstands. Fuer jeden Kopf beide Pflichtjobs und
alle24 Schritte erfolgreich nachgelesen, keine alte CI neu gestartet.
Keine offenen Reviewkommentare. PR445 richtet sich nun gegen main und soll
die ganze Kette mit einem geprueften Merge uebernehmen. Noch nicht gemergt.

PR345 ist ein alter, inzwischen konfliktbehafteter Dokumentationsstand.
Seine zwei erhaltenswerten historischen Nachtraege werden hier uebernommen;
sein ueberholter CURRENT_STATE Kopf wird nicht ueber den heutigen gelegt.
Erst nach bestaetigter Integration wird PR345 als ersetzt geschlossen.
Die anderen PRs werden nach nachgewiesener Commitabstammung abgeschlossen.

Konkreter kompatibler Code Rueckweg bei notwendiger Ruecknahme des Gesamtpakets:
PR420 Head `eb687a5c849cb0602a08035c2c4893c944a1d4ce` enthaelt bereits
Fairnessversion3 und500 Laufplaetze und besitzt vollstaendig erfolgreiche CI.
Ein Rueckweg erfolgt ueber geprueften Revert PR auf diesen kompatiblen Baum,
ohne gespeicherte Version3 oder Kostenquittungen zu loeschen. Kein blindes
Instant Rollback auf den bisherigen Version2 Code nach erster Version3 Ablage.
Alle Profile bleiben waehrend dieser Integration inaktiv.

Die nachfolgenden Integrationsformulierungen beschreiben die fruehere Planung.

Abhaengigkeitsreihenfolge: **419, 420, 421, 422, 423, 424, 425, 426, 427,
428, 429, 430, 431, 432, 433, 434, 435, 436, 437, 438, 439, 440, 441,
442, 443, aktueller Folgebranch.** Keine Umordnung, kein einzelner Spitzen PR
ohne seine Vorfahren. Die vollstaendigen Headbindungen stehen im PR Verlauf.

Bevorzugter spaeterer Integrationsvorschlag: ein gesondert gepruefter kumulativer
Stand auf main, damit Production die zusammenhaengende Korrektur in einem
Deployment erhaelt. Ein solcher Integrations PR ist noch nicht erstellt oder
freigegeben. Einzelne gestapelte Merges koennten mehrere teilweise reparierte
Production Staende deployen und duerfen nicht als reine Git Aufraeumaktion
behandelt werden. Nach Integration Vorfahren anhand des tatsaechlichen Baums
und der Commits abgleichen; nicht blind umbasieren oder fremde Arbeit ersetzen.

Gezielte Ueberlappungspruefung: Quellenzeitvertrag419/440, Titel und
Artikelidentitaet422/423/432, Kontext426 bis431 und Quellenlisten434/437/441/442
erganzen sich. Ebenenvertrag438 und Speicherablehnung439 bleiben erhalten.
Der neue Klassifikationsfix erhaelt nun unbekannte Rollenangaben aus diesem
Vertrag; er umgeht weder Quellenlistenpruefung noch Speicherablehnung.
Neue Pflicht CI prueft den gesamten kumulativen Stand. Kein separater
Integrationscode ist aus dem bisherigen Abgleich erforderlich.

Risiken: neue Auswahl und Zurueckhaltung koennen die Versorgungsmenge senken;
Kontext kann Latenz und Ablehnungen erhoehen; alte Ergebnisbestaende bleiben
fachlich ungeprueft. PR419 aendert den Quellenvertrag, PR420 den gespeicherten
Fairnesszustand auf Version3. Ein spaeterer Rueckweg muss Version3 weiterhin
lesen und erhalten. Kein blindes Rollback auf alten Code mit Zustandversion2
und keine Datenloeschung. Vor Merge ist dafuer ein kompatibler Rueckweg als
konkreter Stand zu benennen, danach Production Commit, Alias, Flags, aktive
Zielmenge, Sperren, Kosten und Kommunikation rein lesend gegenpruefen.

## Naechste Beleggrenze

Die vier Prosaarten koennen ohne Semantikpruefung nicht allgemeingueltig aus
Wortlisten entschieden werden. Ein zusaetzliches Modell wuerde Kosten,
Fehlerarten und Laufzeit einfuehren; ein universeller Faktenvalidator ist
deshalb nicht implementiert. Die bestehenden Promptvertraege werden nicht
nochmals gleichlautend ergaenzt. Eine Loeschregel wuerde korrekte Aussagen
verlieren. Der kleinere naechste Schritt ist ein neuer, exakt archivierter
isolierter Verhaltensnachweis mit neutralen positiven und negativen Eingaben.

Der [vorbereitete Pruefauftrag](prosa-fachnachweis-2026-09-19.md) umfasst acht
einmalige Aufrufe und hoechstens 1,696 USD konservative Vollreserve. Er ist
kein 500er Test, kein historischer Replay und keine Wiederholung des Gipfels.
Ohne ausdrueckliche Kostenfreigabe sowie Freigabe ausschliesslich der
zugehoerigen Kosten und Versuchsquittungen darf er nicht ausgefuehrt werden.
Bis dahin bleiben Prosaabnahme, Integration und 500er Bereitschaft blockiert.

## Gepruefte Commitkette vor dem Folgecommit

Jede Zeile ist Nachfolger der vorherigen; PR419 basiert auf dem oben genannten Main.

| PR | Gepruefter Head |
| --- | --- |
| 419 | `eea7c24f4d9f3ed8bb2cd74d7eaab87043c34d8e` |
| 420 | `eb687a5c849cb0602a08035c2c4893c944a1d4ce` |
| 421 | `1129d9ad8b163ce1ccf16adc0a02d35fbcb96126` |
| 422 | `6528ecabb028fcfbdc97e1ed55c84f2bbc8dfc83` |
| 423 | `500c78f1a8b32fe369bc05c88359ca693a0f5a03` |
| 424 | `70f19f3a1abc4afb6c9ee6f006b65c1a4b4b79e9` |
| 425 | `f06a9c760b31eb8361d28720cb86d6c3c92b5b52` |
| 426 | `17fbde75b91396d83acc7c262e7e28a90a024cfb` |
| 427 | `04f08f9edc679442713f976cbda683a4ea7e7325` |
| 428 | `89166393c7cd26be6165db9ea3dc37ad6d683f00` |
| 429 | `1a5981e856584cef760f74ffa3a81ce2845309df` |
| 430 | `1aa10e05f91f256eb6787dfc6a6046900495d582` |
| 431 | `540eb4dd2f0950f404ed6ee86240c8bf2438dd8c` |
| 432 | `e63b49e82259e62f40cdb574ed228e9edf1cc06b` |
| 433 | `a37855af379c223c268be13c20bf7f10b7215bc4` |
| 434 | `3002b9f4559ab3a7e1496933cedc39fa60feed40` |
| 435 | `6f122bbc41d27d64ad20a8b33ed8bcdec091ecfb` |
| 436 | `1abe01a2a02226246e365ae0cafd5e2da0bdbca3` |
| 437 | `3fba735354f4de13c27e3f72c65bec44e565c5b4` |
| 438 | `04836543a696efe9ab908c0dfea04fbee8331207` |
| 439 | `1686a5086f648bc611f4033160fa068156653674` |
| 440 | `f166db871ec82deb81a309ee76b6b7a321ff0f94` |
| 441 | `5b8879b7cb7f8ac6aec46aac01acc35c6ea49afa` |
| 442 | `c78203bf1337a6ed08191990b886872aa28b5fdd` |
| 443 | `00e1d7642ecbd11eee10e1a044e909be65feb03e` |
