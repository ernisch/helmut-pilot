# CURRENT STATE — Helmut

**Stand: 06.11.2026.** Aktuelle Projektsteuerung nach ausdruecklicher
Betreiberentscheidung. Historische Berichte sind keine aktuellen
Production Nachweise. Frische Produktionsbelege gehen vor GitHub,
Tests und diesem Statusdokument.

## Aktueller Auftrag: taegliche Versorgung nur fuer Cem Ince

Der Betreiber hat die Wiederaufnahme ausschliesslich fuer Cem Ince und die
Deaktivierung aller anderen Profile beauftragt. Zusaetzlich ausdruecklich
freigegeben: **1 USD je Tag, maximal 30 USD insgesamt** fuer diesen neuen Betrieb.
Entwicklung und Review nur mit GPT-6.1 Sol/Astra, kein DeepSeek.

Production6507b11e ist nach PR1060 und vollstaendig gruener Pflicht-CI
42131866123 live. Nur Cem ist aktiv,500 andere bleiben inaktiv. Drei
Tagesjobs sind registriert:04:00 Quellen,05:00 Lage,05:15 Morgenpaket UTC.
Der JSONB-Fehler im Kostenabschluss ist behoben; die vier alten Reserven
von insgesamt0,848 USD bleiben unveraendert erhalten.

Live-Crawl am06.11.2026:147/147 Quellen,8 korrekt abgerechnete neue
Modellaufrufe (0,053672 USD),6 neue vollstaendige Wissensobjekte.
Das Morgenbriefing ist fuer den06.11. gespeichert und als **aktuell**
gelesen; derzeit ehrliche Ruhelage ohne neue Tagesprioritaet.
Das vollstaendige Paket bleibt partial, weil zwei Lage-Entwuerfe wegen
`ai-text-profile-reference` verworfen wurden. Eine gezielte Bindung des
Generator-Antwortschemas an vorhandene Profilwerte wird umgesetzt;
Quellen- und Textpruefung bleiben unveraendert. Kein dritter Blindversuch.
Die nachfolgenden offenen Release1053-Aussagen sind historisch.
[Umsetzung, Nachweise und Rueckweg](betrieb/cem-einprofilbetrieb-20261105.md).

## Navigation und Verwaltung live (06.11.2026)

[PR #1057](https://github.com/ernisch/helmut-pilot/pull/1057) nach ausdrücklichem
„merge wenn grün“ auf `7d115a41fb84598fcc3849ed556ad0ede31d65b5` gemergt.
Tagesinput ist in der UI pausiert, einschließlich gespeicherter Ansicht und Formular.
Der doppelte Admin-Eintrag entfällt; Profil & Einstellungen führt für Admins zur
Verwaltung, dort erhält **Erweiterte Werkzeuge** alle bisherigen Admin-Bereiche
mit Rücklink. Funktionen und Daten bleiben erhalten.
Die verbindliche Wiedervorlage und schrittweise Zielzuordnung stehen in
[OP-32 und OP-33](datenmotor-restliste.md#op-32--tagesinput-bewusst-pausiert-06112026-p3).
Gezielt geprüft: Syntax, Schnellkern 14/14, Verwaltungsnavigation 8/8,
Browser-Smoke 78/78. Übergangsweg im echten Browser bei 1280 und 390 Pixeln
bestanden, alle sieben Werkzeugbereiche erhalten; Referenten und Abgeordnete
erhalten keinen Verwaltungszugang (HTTP403, kein Link/URL-Einstieg).
Beide Pflichtchecks auf Kopf `abeecebb` erfolgreich:
[CI 42119327817](https://github.com/ernisch/helmut-pilot/actions/runs/42119327817),
176/176 Standard- und 332/332 Bereichssuiten, Browsercheck und isolierte
Datenbankprüfungen grün. Production-Deployment
`dpl_CJoBeMTV6V7MHeH86MuhM3iA1Qbj` READY auf Merge `7d115a41`, Alias
`helmut-pilot.vercel.app`. Lesende Nachkontrolle: Startseite HTTP200,
`client.js?v=7d115a41` bytegleich zur geprüften Datei, Tagesinput aus,
Verwaltung ohne Sitzung HTTP401. Kein authentifizierter Production-Klicktest;
dieser Übergangsweg wurde lokal mit echten Sessions geprüft.
Der umfassendere historische Verwaltungstest
stoppt im unveränderten Kontoclient an einer alten Null-IO-Erwartung beim Freigeben
eines Kontos; die gezielte Navigationsauswahl führt keine Schreibaktion aus.
Dieser Auftrag ist abgeschlossen. Nächster fachlicher Schritt bei weiterer
Verwaltungsarbeit: fehlende Funktionen nach OP-33 einzeln zuordnen.

## Oberstes Ziel: Mock100 PASS, dann Helmut sicher live

1. **Mock100 PASS**: exakt **100 gleichzeitig aktive synthetische
   Mandatsprofile** wurden vollstaendig und nachvollziehbar verarbeitet,
   ohne kostenpflichtige Helmut KI Modellaufrufe. Beleg: Run 42053461090.
2. **Danach Helmut sicher live bringen**: die vorbereitete UI und
   Backend Integration fertigstellen, notwendige Sicherheits-,
   Datenschutz-, Mandantentrennungs-, Funktions- und
   Kostenkontrollanforderungen fuer den ersten kleinen
   Kundenkreis erfuellen; geeigneten Produktstand auf `main`
   zusammenfuehren und Vercel Production ausrollen.
3. **Kein Production100 oder Production500 Lasttest.** Der
   Betreiber hat diese kostenpflichtigen Vollnachweise
   ausdruecklich verworfen. Kein Mock500 mehr und keine
   neuen mehrstuendigen Blindtests.

Die Absicht fuer den spaeteren Livegang ist noch **keine**
Freigabe fuer einen nicht festgelegten Production Commit,
ein konkretes Deployment, eine Datenmutation oder einen
zahlungswirksamen Aufruf. Bestehende Sicherheitsregeln und
konkrete Freigaben bleiben gueltig.

## Nachweisstand

| Meilenstein | Aktueller Stand |
| --- | --- |
| End500, historisch | **PASS**: [GitHub Run 41325430429](https://github.com/ernisch/helmut-pilot/actions/runs/41325430429), Commit f157d97f. Bereits bestandene Backup-, Restore- und Authnachweise nicht unnoetig wiederholen. |
| Mock500, historisch | **ABGEBROCHEN ALS PROJEKTZIEL, KEIN PASS**. [Run 41939166457](https://github.com/ernisch/helmut-pilot/actions/runs/41939166457) cancelled/UNKNOWN; [Run 41996804804](https://github.com/ernisch/helmut-pilot/actions/runs/41996804804) nach 176min02s FAIL im Controller. Innere Ursache und Profilfortschritt UNKNOWN, nicht null. Acht aeussere Bereinigungen PASS, native Datenbanknullaktivitaet nicht belegt. [Beleg PR1049](https://github.com/ernisch/helmut-pilot/pull/1049). |
| Mock100, neues Ziel | **PASS**: [Run 42053461090](https://github.com/ernisch/helmut-pilot/actions/runs/42053461090), exakt Commit `be0c6d1630f5987e755eb4030cc23a4f7d7247d7` nach [Pflicht-CI 42047654519](https://github.com/ernisch/helmut-pilot/actions/runs/42047654519). 100/100 Profile und 300/300 Ergebnisse nativ geprueft, 400 Tenant-/Quellenschutzkontrollen, alle fuenf Fehlerkategorien null; 296 simulierte Modellaufrufe, keine bezahlten Anbieteraufrufe. Nach 242,633 s einschliesslich Abschluss null aktive Profile, Bereinigung PASS. [Quittung und Fortschritt in PR #1052](https://github.com/ernisch/helmut-pilot/pull/1052) und [vollstaendiger Laufbericht](betrieb/mock100-20261105.md). Historischer erster [FAIL 42042488458](https://github.com/ernisch/helmut-pilot/actions/runs/42042488458) bleibt unveraendert. |
| Production100 / Production500 | **ABBESTELLT.** Keine neue Vollastpruefung mit echten KI Aufrufen, keine Kostenfreigabe. |
| Produktintegration und Livegang | **RELEASE-PR #1053 IN PFLICHT-CI.** Privater Kandidat814c8b63 einschliesslich UI, Backend und main76b75e37 uebernommen; Vercel-Git-Sperre fuer den Releasebranch ergaenzt. Alte Browser-Testselektoren und verlorene Lage-Quellenfrische/Fallback korrigiert; Assetversion erneuert. Browser78+19 und Standard-Offlinesuite auf9feb9969 PASS; Bereich330/332. Zwei alte Profil-/Splash-Testannahmen gezielt korrigiert (5/5 HTTP,33/33 VM), ohne weiteren Produktfix. Pflicht-CI wird auf dem neuesten PR-Kopf abgenommen; main-Merge und Production bleiben gesperrt. [Uebernahme](betrieb/release-ci-20261105.md), [lokale Abnahme](betrieb/release-prep-20261105.md). |

## Neuer Testumfang und Arbeitsweise

Verbindlich ist **Mock100** mit genau 100 gleichzeitig
aktiven, vollstaendig fiktiven Profilen aus Bundestag,
Berlin und Brandenburg. Die fruehere 330/120/50
Verteilung ergibt 66/24/10; diese konkrete synthetische Auswahl
ist im neuen Diagnosepfad reproduzierbar hashgebunden.
Keine realen personenbezogenen Testprofile.

Der bestandene Vollversuch umfasst 100 Profile, 200 simulierte
Entwurfs-/Pruefphasen und 96 separat ausgewiesene Understanding-
Simulationen (insgesamt 296). Alle 300 Ergebnispositionen wurden
nativ geprueft.
Weitere vorbestehende Schutz- und Kontrollanforderungen
sind technisch korrekt auf 100 abzubilden, nicht
blind aus alten 500er Artefakten als PASS uebernehmen.
Bestehende gueltige Sicherungs- und Restorebelege
wiederverwenden, soweit sachlich zulaessig.
Ein wirklicher Mock100 PASS erfordert einen
tatsaechlichen vollstaendigen 100er Lauf und
belastbare Profil-, Ergebnis- und Abschlussbelege.

**Neue Effizienzregel:** Erstfehler und letzten bestaetigten
Fortschritt aus dem schon bestehenden Controllerkanal
zuverlaessig erhalten, danach zielgerichtete Unit und
Integrationstests, dann genau der noetige synthetische
Mock100 Gesamtversuch. Keine weiteren Blindtests,
zusaetzlichen Teststufen, neuen Runner oder
Infrastrukturprojekte ohne konkrete Notwendigkeit.

## Noch relevant

- Der letzte 500er Controllerfehler ist **nicht aufgeklart**.
  Der Verlust seiner ersten inneren Fehler- und
  Fortschrittsdetails ist nachgewiesen. [PR1049](https://github.com/ernisch/helmut-pilot/pull/1049)
  ist nur Dokumentation; keine Runtimekorrektur oder
  Mock100 Freigabe.
- Mock100 PASS wurde auf dem unveraenderten, vollstaendig geprueften
  Runtimecommit `be0c6d1630f5987e755eb4030cc23a4f7d7247d7` belegt.
  Der originale freie Diagnosepfad aus PR1050 wurde auf main 8901385d
  angepasst. Die native Drei-Profil-Probe, Pflicht-CI und unabhaengige
  Abschlusspruefung waren erfolgreich. Historische W15-Originale,
  Runtimepins, Claims und STOP-/UNKNOWN-Belege bleiben unveraendert.
  Aeltere FAIL-/GO-offen-Aussagen in ueberlieferten Commits sind
  ausdruecklich historische Zwischenstaende, keine aktuellen Blocker.
- UI und Backend Integration sowie die fuer den
  ersten zahlenden Kunden erforderliche Produktsicherheit
  sind getrennt nachzuweisen. Ein simulierter
  Mock100 PASS ist kein Production Funktionsnachweis.
- Vorhandenes Vercel Production Deployment war
  bei letzter lesender Pruefung READY, aber das
  beweist keinen aktuellen Stand der neuen
  Produktintegration. Es wurde nichts neu deployed.

## Private Produktintegration (05.11.2026, lokal geprueft)

PR #1052 ist auf `76b75e371c7db69d7c9381071e23443182fc3607` gemergt.
Der bestandene Mock100-Meilenstein bleibt abgeschlossen und wird nicht wiederholt.
Der private Branch `integration/release-prep-20261105` verbindet diesen main-Stand
mit Backend/UI `3c5765c577b35641ba107a4d6b863ab1e5ab7456`.
Kontosicherheit, beide Designs und historische Belege bleiben erhalten.
Die [vorige lokale Integration](betrieb/backend-ui-integration-20261105.md)
und [UI-Abnahme](ui-backend.md) bleiben historische, quellengebundene Belege.
Vier gezielte Gruppen mit202 echten lokalen HTTP-Antworten bestanden. Zwei
inhaltsgebundene Assetversionen beseitigen den belegten Altcache-Erststartfehler.
Motor, beide Designs und historische Nachweise unveraendert; drei lesende
Reviews positiv. Main-CI42069590393 gruen, Kandidaten-Pflicht-CI noch offen.
[Abnahme und konkrete Mergevoraussetzungen](betrieb/release-prep-20261105.md).
Keine Productionfreigabe.

## Genau ein naechster Schritt

**Die Pflichtchecks der Einprofil-Aenderung abschliessen, den freigegebenen
1/30-USD-Vertrag aktivieren und Cems aktuelle Tagesversorgung gegenlesen.**
Keine weiteren synthetischen Vollversuche oder bezahlten Lasttests.

Historische alte Anweisungen, darunter
[`ROADMAP_BIS_500.md`](ROADMAP_BIS_500.md), sind
keine aktuellen Testauftraege. Alle alten Laufbelege,
STOPs, UNKNOWNs, Grants und Journale bleiben erhalten.
Vor konkreten Production Aktionen Wirkung, Risiko,
Kosten, Nachkontrolle und Rueckweg benennen.
