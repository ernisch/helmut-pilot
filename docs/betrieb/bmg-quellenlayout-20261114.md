# BMG: vorgezogene Originalpruefung und begrenzte Parserkorrektur

15.11.2026,01:26UTC: Browserjob132655402623 scheitert nach dem Wechsel von
ubuntu-latest auf26.04 schon bei Installation: Playwright1.56.1 unterstuetzt
chromium auf ubuntu26.04-x64 nicht. Minimaler Infrastrukturfix: ausschliesslich
Browserjob fest an ubuntu-24.04 binden; Chromium-/Versionspin, Browserpflicht,
Pruefauswahl und alle Schutzchecks bleiben. Drei vorhandene Runner-Vertragschecks
pruefen den nun allgemeinen kompatiblen Pin. Keine App-/Production-Konfiguration.

15.11.2026,01:21UTC, aktueller CI-Nachtrag: Folgestand #1204/8956819c besteht
beide Pflichtchecks (43659496575), 14 Kern- und 87 Quellensuiten. #1203/9979f613
besteht native Kernschritte und alle 189 Standardsuiten; 13 von 391 Bereichssuiten
scheitern noch und wurden einzeln auf unveraendertem main6763dc8e reproduziert.
Korrigiert werden ausschliesslich alte Testannahmen: gespeicherter Appstart statt
Lage-Neubau, explizite Klassenfreigaben, drei Workerphasen mit gemeinsamem Budget,
gebundene Morgen-Checkpoints, heutige Leerhinweise, aktuelle Kostenfehlerklasse,
wirklich geladene Lesermodule statt unbenutzter lazy Schreibimporte und zur
synthetischen Publikation passende Uhr. Alte Quittung ohne Inhaltsbindung bleibt
UNKNOWN/fehlgeschlagen und unveraendert. Historische Prosa-Offlinefaelle laden
jetzt das originale Schema samt Validator aus Commit05feca37, gzip/sha256 gebunden;
realer Prosa-Aufrufer lehnt heutiges Paket weiterhin ab. Keine Modelle gestartet.
Die isolierte PostgreSQL-Claimsuite war faelschlich in der Offline-Sammlung. Sie
bleibt unveraendert im eigenen bereits vorhandenen netzlosen PG17-Pflichtschritt;
nur die falsche Offline-Klassifizierung entfaellt, mit Auswahl-Gegenprobe.
Alle betroffenen Einzelpruefungen lokal gruen; keine Runtime-Schutzregel entfernt.
Neue Pflicht-CI am aktualisierten Kopf steht aus. Nachfolgende datierte Angaben
sind erhaltene Zwischenstaende, keine aktuelle Merge- oder Production-Bestaetigung.

15.11.2026,00:41UTC: Die Quellen-Bereichs-CI des Folgestands #1204 besteht 79/87
Suiten. Alle acht Fehler wurden auch auf unveraendertem `main6763dc8e`
reproduziert. Ihre bestehenden Tests verwenden jetzt die bereits geltenden
Vertraege: Promptpins nach den gemergten Fachthemenregeln; bestaetigte einzelne
DIP-Versionslesung; Worker-Readiness statt altem Statusmock; vollstaendige
Phasenabschlusszaehler und leere Mandatsvorphase; heutiger Plan-/Jobbezug statt
historischem Pendingzwang; deklarierte Klassenfreigabe fuer isolierte Worker;
vollstaendiger Paket-/Quellenhash und gebundene aktuelle Lageansicht.
Keine Budget-/Planungs-/Worker-/Speicherruntime und kein CI-Plan geaendert.
Die acht Suiten bestehen lokal mit 24+8+16+9+5+15+29+14=120 Gruppen. Negative
Gates und Erhalt alter positiver Ergebnisse bleiben ausdruecklich geprueft.
Die native/standardisierte Pflicht-CI bleibt fuer den neuen Kopf voll erforderlich;
fruehere rote Laeufe und zwischenzeitlich sichtbar gewordene Folgefehler bleiben
unveraendert im CI-Verlauf und den lokalen Diagnoseprotokollen erhalten.

Zweiter CI-Lauf `43656753720`: 187/189 Standardgruppen gruen. Zwei weitere
vorbestehende Befunde: Statusdokument ueber seiner verbindlichen Groessengrenze
und ein Testanker, der noch historische Pendingauftraege im heutigen Tagesplan
erwartete. Der Status ist bytegleich archiviert und auf 27644 Zeichen/334 Zeilen
verdichtet. Der Test prueft nun die vorhandene gemeinsame Profilgruppe im Manifest
UND in der Enqueueschleife. Keine Planungs-/Budgetruntime geaendert. Gezielte
bestehende Pruefungen danach 4/4 Groessenchecks und 42/42 Gleichbehandlungschecks.
Alle roten Erstbefunde bleiben in der CI-Historie erhalten.

Fortsetzung 15.11.2026: Betreiber hat die bestehende Pflicht-CI und bis zu 20
auftragsbezogene gruene Merges ausdruecklich freigegeben. PR #1203 ist offen.
Erster CI-Lauf scheitert im Schnellkern am bereits bestehenden App-Start-Vertrag:
Im leeren Tagespaket fehlten `lageBriefing.demo` und `latestUpdatedAt`.
Die Korrektur liefert ausschliesslich `false`/`null`; kein Inhalt oder Datum wird
erfunden. Bestehender Vertragstest danach 19/19 gruen, gezielter bestehender
Leerpakettest gruen. Erster lokaler Vertragstest war durch die Loopback-Sperre der
Sandbox blockiert; mit Netzwerkberechtigung nur lokaler HTTP-Test, erfolgreich.
Die unveraenderte CI waehlt wegen der bisher nicht zugeordneten Lieferdatei nun
die konservativen vorhandenen Offline-/isolierten DB-Pruefungen. Keine neue
Lastserie, kein Modelltest, keine Production-DB-Pruefung; keine CI-Abschwaechung.
Die nachfolgenden Freigabehinweise beschreiben den historischen Vorbefund.

Stand 14.11.2026, 23:52 UTC. Teilweise abgeschlossen: lokal repariert und gezielt
geprueft, noch nicht auf `main` oder Production. Bezug: Issue #1202;
Basis `6763dc8e43a17860375f66cc83a528753499716e`.

## Ursache und kleinster Reparaturumfang

Auftrag `3b12db1a-bcf6-4bb4-bed4-f8a880f4155e`, Dokument
`rd-373e2d5f876ea3257735e0450db9fc34033f5d028ce23bdbfa45f22aa5a45b03`,
[BMG-Original](https://www.bundesgesundheitsministerium.de/ministerium/meldungen/deutscher-pflegetag-2026):
Der generische Parser verlangt einen ausreichend strukturierten Artikel. Die
amtliche Meldung verwendet TYPO3-Microdata und einen sichtbaren Datumstag, ohne
JSON-LD/articleBody. Der vorhandene Parser lehnt die lesbare Seite mit
`strukturierter-artikel-mehrdeutig-oder-fehlend` ab.

Die Korrektur ergaenzt ausschliesslich diesen geschlossenen BMG-Meldungspfad und
seinen Provenienzvertrag. Sie liest genau den ersten vollstaendigen Absatz aus
dem eindeutig gebundenen Artikelkopf. Titel, Canonical, og:url, Artikelstruktur,
Sichtbarkeit und der sichtbare Berliner Datumstag muessen zum Quellenstand passen.
Keine erfundene Publikationsuhrzeit und keine Aufwertung des Artikels vom 12.11.
zum Tagesanlass. Folgetexte/Zitate gelten nicht als mitgepruefter Volltext.

Beschaffung, Jobs, Cache-Revisionsrechte, Quoten und Abschlussregeln bleiben
unveraendert. Erfolgreiche Ergebnisse, historische Negative und UNKNOWN werden
nicht zurueckgesetzt. Der vorhandene alte BMG-Fehlauftrag wird damit nicht
automatisch wiedereroeffnet.

## Originalnachweis

Drei einzelne kostenfreie HTTP-GETs auf bereits konkret fehlgeschlagene Quellen;
kein Produktlauf. Das BMG-Original antwortete am 14.11.2026 um
23:35:29.032 UTC mit HTTP 200, 455907 Bytes und SHA256
`ff41c52750e9e7d6d491bc3ff8ccbdd4265dedc61527d2b7a3326e79a05960b1`.
Identische gespeicherte Antwort lokal: vorher obiger Fehler, nachher
`artikel-einstieg-v2`, 362 Zeichen, genau ein bestaetigter Absatz von insgesamt 27.
Dokumentmetadaten unveraendert; keine Modellaufrufe oder Production-Schreibvorgaenge.
Der neue Abruf reproduziert den aktuellen Fehler; er ersetzt keinen fehlenden
historischen Antwortbody. Rohantworten liegen nur im lokalen Diagnoseverzeichnis
`/tmp/helmut-versorgung-originalprobe-20261114/`, nicht in Git.

Die chronologisch davor gepruefte Bundestagsanhoerung scheitert ebenfalls sicher:
kein Canonical, sichtbarer Termin 25.11. ist kein Publikationsdatum. Die ZDF-Seite
hat weder articleBody noch einen gebundenen Artikelbereich. Beide Parser bleiben
unveraendert; keine Lockerung der Quellen- oder Datumssperren.

## Gezielte Pruefungen

Alle Verhaltenspruefungen ueber `scripts/lokal.js`, ohne Netz, Production oder Modelle:

- Quellenlayout: vier neue BMG-Gruppen gruen (`--bmg`), vier unveraenderte
  BReg/DLF-/Provenienzgruppen im ersten Lauf gruen, fuenf Cachegruppen gruen
  (`--cache`). Insgesamt alle 13 betroffenen Gruppen in Teilmengen belegt.
- Ein alter Cachetest scheiterte auch auf unveraendertem `main`: Er erwartete
  einen inzwischen gesperrten Zweitabruf. Nur die veralteten Fixtures wurden an
  den geltenden Schutz angepasst. Alte Negative bleiben explizit unveraendert;
  Tests fuer neue Reservierungen verwenden wirklich fehlende Basisstaende.
- Bestehender `artikelkontext-test.js`: 10 Gruppen gruen;
  `artikelkontext-gewinnung-test.js`: 11 Gruppen gruen.
- Syntax der drei geaenderten JS-Dateien und `git diff --check` gruen.

Die unveraenderte CI-Auswahl wuerde fuer einen PR 87 Quellensuiten plus Schnellkern
starten, darunter nicht betroffene Funktionen. Wegen der ausdruecklichen Vorgabe
gegen Massentests wurde kein PR und keine solche CI gestartet. Die Pflichtchecks
werden nicht umgangen oder abgeschwaecht; Merge und Rollout bleiben offen.

## Erhaltener Bestand und verbleibende Luecke

Rein lesende Nachkontrolle am 14.11.2026, 23:51 UTC: Alle fuenf zuvor erfolgreichen
Auftraege weiter `erledigt`, ihre fuenf Payload-Hashes gegen den Vorbefund gleich.
Der BMG-Auftrag bleibt `fehlgeschlagen`. Die Quellenquittung
`admin-quellen-2026-11-14-7a29cba2-be8f-4bc9-a119-5173462ca3ae` bleibt teilweise:
5 verarbeitet, 58 fehlgeschlagen, 78 zurueckgestellt. Lage- und Morgenquittung
weiter teilweise. Gespeichertes Briefing unveraendert, InhaltHash
`17fbead5dd1e177a8628a923c1c8822cf9c4fda98c5a5716bba6943cd0cdff04`.
Keine vollstaendige Tagesversorgung oder neue Tagesprioritaet bewiesen.

Naechster Schritt: ausdrueckliche Ausnahme fuer die bestehende kostenfreie
Offline-PR-CI einholen, damit die konkrete Reparatur regulaer integriert werden kann.
Regulaere Quellen-/Lage-/Morgen-Crons und der bestehende Nachtauftrag bleiben zeitlich
unveraendert; kein Zusatzfenster, Wiederanlauf alter Jobs oder bezahlter Modelltest.
