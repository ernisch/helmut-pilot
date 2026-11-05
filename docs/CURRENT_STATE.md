# CURRENT STATE — Helmut

**Stand: 05.11.2026.** Aktuelle Projektsteuerung nach ausdruecklicher
Betreiberentscheidung. Historische Berichte sind keine aktuellen
Production Nachweise. Frische Produktionsbelege gehen vor GitHub,
Tests und diesem Statusdokument.

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
| Produktintegration und Livegang | **RELEASE-PR #1053 IN PFLICHT-CI.** Produktcode des privaten Kandidaten814c8b63 einschliesslich UI, Backend und main76b75e37 unveraendert uebernommen. Vercel-Git-Sperre fuer den neuen Releasebranch ergaenzt. Erster Browsercheck an alten Lage-Testselektoren gescheitert; diese und die alte Querformat-Texterwartung werden ohne Produkt-/Designaenderung korrigiert. Pflicht-CI wird auf dem konkreten PR-Kopf abgenommen; main-Merge und Production bleiben gesperrt. [Uebernahme](betrieb/release-ci-20261105.md), [lokale Abnahme](betrieb/release-prep-20261105.md). |

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

**Die beiden Pflichtchecks der Release-PR auf genau deren aktuellem Kopf abschliessen
und danach auf konkrete Mergefreigabe warten.** Die Uebernahme ist freigegeben;
der neue Branch `release/helmut-product-20261105` ist gegen automatische
Vercel-Git-Deployments gesperrt. Keine weiteren
synthetischen Vollversuche und keine bezahlten Lasttests. Ein spaeterer
Merge/Production-Deploy benoetigt konkrete Releasefreigabe,
Rueckweg und nachgewiesene Betriebsreife.

Historische alte Anweisungen, darunter
[`ROADMAP_BIS_500.md`](ROADMAP_BIS_500.md), sind
keine aktuellen Testauftraege. Alle alten Laufbelege,
STOPs, UNKNOWNs, Grants und Journale bleiben erhalten.
Vor konkreten Production Aktionen Wirkung, Risiko,
Kosten, Nachkontrolle und Rueckweg benennen.
