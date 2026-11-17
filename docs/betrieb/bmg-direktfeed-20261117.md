# BMG: amtlicher RSS-Ersatz und Datumsvertrag, 17.11.2026

## Bestaetigter Iststand

Der derzeitige BMG-Suchweg haengt am gemeinsamen Google-News-Anbieter.
Primarbeleg17Nov: echterHTTP429 am Google-Artikelaufloesungsweg; zentraler
Schutzschalter fehler_folge5, offen bis04:47:05UTC. Der amtliche BMG-Host
selbst hat einen geschlossenen Schutzschalter mit null Folgefehlern. Das ist
kein Anlass, die Google-Sperre oder Anbietergrenzen zu umgehen.

Der alte BMG-Analyseauftrag betrifft eine Veroeffentlichung vom5Nov. Sein
11Nov-Fenster ist kein Publikationsdatum. Revision2-Originalbeleg vorhanden,
faellig, Versuch2/max3; Tagesarbeitsvorrang und historische Wartemenge erklaeren
seinen Nachrang. Keine technische Sperre oder sichere Prioritaetsreparatur
belegt; kein Reset, keine Fensteraenderung und kein bezahlter Replay.

## Primär belegter alternativer Zugang

Das gespeicherte hashgepruefte BMG-Original verlinkt die offizielle
[RSS-Serviceseite](https://www.bundesgesundheitsministerium.de/service/rss-feed).
Diese wurde einmal rein lesend geprueft und verlinkt selbst die folgenden Feeds:

- [Meldungen](https://www.bundesgesundheitsministerium.de/meldungen.xml): HTTP200,
  application/rss+xml,630528Bytes,691Eintraege; neuester Eintrag16Nov2026,
  weiterer Pflegeeintrag12Nov. SHA256
  `47c63f47dd3c079e4d9634e3a765c2b9fa2b7502c55b3792abcf5f9e2d3e7324`.
- [Pressemitteilungen](https://www.bundesgesundheitsministerium.de/pressemitteilungen.xml):
  HTTP200,492261Bytes,416Eintraege; neuester Eintrag9Nov. Kein Ersatznachweis
  fuer Nachrichten vom16Nov; nicht zusaetzlich aktivieren.
- Der verlinkte Kurzweg /rss leitet auf die Serviceseite um und ist kein XML-Feed.

Keine Artikel-HTML-Originale, Modelle, Production-Ingestion oder Massentests
fuer diese technische/Primaerrechte-Pruefung. Geladene Feeds werden lokal
geprueft, nicht kuenstlich als regulaere Betriebsquittungen eingespielt.

## Bestaetigte zentrale Datumsluecke

Der vorhandene strenge RSS-Zeitparser akzeptiert GMT/UT/UTC und numerische
Offsets, aber nicht die im amtlichen Feed vorhandenen expliziten Zonen CET/CEST.
Beispiel: Mon,16Nov2026 00:00:00 CET wird bislang unbekannt. Kleinste Korrektur:
CET exakt+01:00 und CEST exakt+02:00 abbilden, weiterhin Kalenderdatum,
Wochentag, vierstelliges Jahr und Offsetgrenzen pruefen. Keine Systemzeitzone,
Sommerzeitvermutung oder heutiges Ersatzdatum.

## Nutzungsgrenze

Primaerbeleg ist das [BMG-Impressum](https://www.bundesgesundheitsministerium.de/impressum),
Abschnitte Verlinkungsregeln und Veroeffentlichungsregeln. Es erlaubt Links und
kostenlose unveraenderte Zitate im Sachzusammenhang mit korrekter Quellenangabe;
Drittrechte sind ausdruecklich ausgenommen. Bilder und Logo sind nicht umfasst.
Dies ist keine pauschale Inhalts-/Volltext-/Trainingslizenz. Enger technisch und
rechtlich sicherer Einbindungsscope und unabhaengiger Review werden vor jeder
Aktivierung festgelegt. Bis dahin keine neue Katalogaktivierung.

## Morgenabschluss aus gespeichertem Bestand

Nach konkret vorbereitetem Umfang und Betreiberfortsetzung am17Nov einmal
bestehenden Morgenabschluss ausgefuehrt: maximal240s, keine Modelle oder
Originalabrufe. Paket07:57:29UTC und echte Morgenquittung07:57:30UTC gespeichert;
Quittungshash passt exakt zum Paket. Zustand fresh, echter Tagesanlass
neue-quelle, zwei gespeicherte gepruefte Lageabsaetze erhalten. Einziger
struktureller Restfehler: quellenversorgung-unvollstaendig. Keine Duplikattexte.
Damit ist die Morgenfenster-Reparatur aus PR1241 nun im echten Lauf bestaetigt;
Quellenabnahme bleibt partial. Kosten und gespeicherte Alt-Erfolge erhalten.
