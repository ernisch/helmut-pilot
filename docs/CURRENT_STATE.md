# CURRENT STATE — Helmut

**Stand: 05.11.2026.** Aktuelle Projektsteuerung nach ausdruecklicher
Betreiberentscheidung. Historische Berichte sind keine aktuellen
Production Nachweise. Frische Produktionsbelege gehen vor GitHub,
Tests und diesem Statusdokument.

## Oberstes Ziel: Mock100 und dann sicher live

1. **Mock100**: exakt **100 gleichzeitig aktive synthetische
   Mandatsprofile** vollstaendig und nachvollziehbar verarbeiten,
   ohne kostenpflichtige Helmut KI Modellaufrufe.
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
| Mock100, neues Ziel | **VORBEREITET, ABNAHME OFFEN.** Auf Branch `codex/mock100-local-20261105` ist der bestehende originalfreie Diagnosepfad auf 100 Profile (66/24/10), echte App-Verarbeitung und 300 native Ergebnispositionen erweitert. Gezielte JavaScript-Pruefungen 36/36 PASS; native Anschlussprobe, Pflicht-CI und vollstaendiger Mock100 noch offen. Kein Gesamtversuch gestartet. [Vertrag und Belege](betrieb/mock100-20261105.md). |
| Production100 / Production500 | **ABBESTELLT.** Keine neue Vollastpruefung mit echten KI Aufrufen, keine Kostenfreigabe. |
| Produktintegration und Livegang | **NOCH NICHT ABGENOMMEN.** UI, Backend und Adminarbeit sind getrennt beziehungsweise in privaten Integrationsstaenden vorhanden; gepruefte komplette Produktfreigabe und neuer Livegang sind noch offen. Keine Production Bereitschaft aus gruenen Teiltests ableiten. |

## Neuer Testumfang und Arbeitsweise

Verbindlich ist **Mock100** mit genau 100 gleichzeitig
aktiven, vollstaendig fiktiven Profilen aus Bundestag,
Berlin und Brandenburg. Die fruehere 330/120/50
Verteilung ergibt proportional als **Vorschlag** 66/24/10;
die konkrete sichere Auswahl muss Codex erst binden.
Keine realen personenbezogenen Testprofile.

Als fachliche Orientierung aus dem bisherigen
Verarbeitungsschema gelten 100 Einheiten, 200 simulierte
Modellphasen und 300 zu pruefende Ergebnispositionen.
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
- Der vorhandene originalfreie Ressourcendiagnosepfad wird gezielt aus
  PR1050 auf aktuellem `main` uebernommen. Er verwendet die regulaeren
  App-Pfade, echte isolierte PostgreSQL/PostgREST-Zugriffe und lokale
  Modellantworten. Historische W15-Originale, Runtimepins und Claims
  werden nicht umgewidmet. Native und unabhaengige Schlussabnahme offen.
- UI und Backend Integration sowie die fuer den
  ersten zahlenden Kunden erforderliche Produktsicherheit
  sind getrennt nachzuweisen. Ein simulierter
  Mock100 PASS ist kein Production Funktionsnachweis.
- Vorhandenes Vercel Production Deployment war
  bei letzter lesender Pruefung READY, aber das
  beweist keinen aktuellen Stand der neuen
  Produktintegration. Es wurde nichts neu deployed.

## Genau ein naechster Schritt

**Den vorbereiteten Kandidaten ueber die vorhandene GitHub-CI mit
der kleinen nativen Anschlussprobe abnehmen.** Danach ist im aktuellen
Betreiberauftrag genau ein vollstaendiger Mock100 auf dem geprueften
Stand erlaubt, sofern alle Voraussetzungen bestanden sind. Kein
automatischer Gesamt-Retry, kein Mock500, Merge oder Deployment.

Historische alte Anweisungen, darunter
[`ROADMAP_BIS_500.md`](ROADMAP_BIS_500.md), sind
keine aktuellen Testauftraege. Alle alten Laufbelege,
STOPs, UNKNOWNs, Grants und Journale bleiben erhalten.
Vor konkreten Production Aktionen Wirkung, Risiko,
Kosten, Nachkontrolle und Rueckweg benennen.
