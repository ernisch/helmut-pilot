# Fehlbindung Wadephul (26.09.2026) — Regelkorrektur in der Vorgangsidentitaet

## Zweck und Grenze

Eng begrenzte lokale Fehlerkorrektur in `lib/helmut/vorgang-identity.js` plus
zielgerichtete Tests. **Keine Production Aktion, keine Production Daten, keine
Umgebungsvariable, kein Commit/Push/PR/Merge.** Die falsche Production
Verknuepfung selbst sichert der Root getrennt ab.

## Befund

Zwei oeffentliche DLF-Originale wurden als **ein** Vorgang behandelt:

| | A (Bestand) | B (neu) |
|---|---|---|
| Titel | Deutsche Bewerbung - Wadephul bekraeftigt Ambitionen auf Sitz im UNO-Menschenrechtsrat | UNO-Vollversammlung - Bundesaussenminister Wadephul fordert mehr gemeinsame Verantwortung fuer KI |
| Zeit | 2026-09-16 03:37 UTC | 2026-09-26 21:50 UTC |
| Sache | Deutschlands Bewerbung um den UNO-Menschenrechtsrat | KI-Verantwortung in der UNO-Vollversammlung |

Sachlich zwei verschiedene Ereignisse. Gemeinsam war nur der **Redner**:
„Bundesaussenminister Wadephul“. Genau diese zwei Nennungen (Amt + Personenname)
waren der gesamte Beleg: Amt 18 Zeichen -> Gewicht 2, Name Gewicht 1 = 3 und
damit exakt die hoehere Beweislast ausserhalb des Nachrichtenzyklus (24 h -> 3).
Der neue Quellenlink wurde gesetzt (22:57 UTC), die Antwort danach als
`decision_level-antwortkonflikt` abgelehnt; das alte Knowledge Object blieb
inhaltlich unberuehrt.

## Regelkorrektur

Der Identitaetsvertrag dieses Moduls sagt seit Hotfix B4-3 ausdruecklich:
**„Amt + Personenname sind keine zwei Sachbelege.“** Das war bisher nicht
umgesetzt. Neu erkennt `vorgang-identity.js` die Nachrichtensprache-Nennung
*Amtsbezeichnung + Eigenname* ("Amtskopf": minister…, praesident…, kanzler…,
vorsitzende…, buergermeister… — auch als Kompositum) und zaehlt in
`docsShareEvent` den gemeinsamen Namen nicht mehr als eigenen Beweisanker, wenn
**beide** Quellen dieselbe Amtsbezeichnung als Attribut **desselben** Namens
fuehren. Das **Amt selbst bleibt unveraendert ein Anker** (das Ressort kann der
Gegenstand des Vorgangs sein). Uebrig bleibt damit genau EIN Beweisanker mit
Gewicht 2 — unter der hoeheren Beweislast 3 ausserhalb des Nachrichtenzyklus.

Ausdruecklich **nicht** geaendert: keine Fall- oder Personenliste, keine
erfundenen Akteure, keine Datumsaenderung, keine abgesenkte Schwelle
(`MIN_BEWEISGEWICHT` 2 / `FERN_MIN_BEWEISGEWICHT` 3 unveraendert), keine
Abschwaechung von Schema, Quellenbindung, CAS/Fencing oder Goldset. Die
Kennungserzeugung und die Suchpraefixe bleiben unberuehrt: `deriveVorgangId()`
liefert fuer A weiterhin exakt `vg-bundesaußenminister-20260916-ddcd4d`, die
Suche findet den Altvorgang also weiter.

## Reproduktion vorher/nachher (gleiche Titel, Kurzfassungen, Zeiten)

| Weg | vorher | nachher |
|---|---|---|
| `docsShareEvent(A,B)` und `(B,A)` | `gleich: true` (`beweisgewicht-fern`) | `gleich: false` (`zu-wenig-beweisgewicht`, Ueberdeckung 2 < 3) |
| `clusterRawDocuments([A,B])` und `([B,A])` | 1 Vorgang | 2 Vorgaenge |
| `sameVorgang(Bestand A, neu B)` und umgekehrt | `gleich: true` | `gleich: false` (`kern-ohne-ereignisbeleg`) |

## Positive Gegenfaelle (muessen gebunden bleiben — geprueft)

* Dieselbe Sache mit demselben Amtstraeger, 10 Tage spaeter (Bewerbung
  Menschenrechtsrat): `gleich: true`, Gewicht 7 >= 3, `sameVorgang` true.
* Zweite Meldung zum KI-Ereignis im selben Zyklus: `gleich: true`, ein Cluster.
* Amt als **Gegenstand** (Kabinettsumbildung, „Verkehrsminister“): bleibt
  verbunden, `sameVorgang` der Folgemeldung bleibt true.
* Gipfel-/Reiseberichte desselben Tages: unveraendert, weil dort die Grundform
  des Amts („Praesident“) schon kein Identitaetsanker ist und der gemeinsame
  Name der Beleg bleibt.

## Eigenpruefung und Grenze

Root hat zusaetzlich denselben Themenkonflikt mit synthetisch zeitnahen Daten
geprueft. Der erste Entwurf verband ihn noch. Jetzt kann ein gemeinsamer
Rednername im Titel nur mit zusaetzlichem Sachbeleg aus dem Text tragen; die
Amtsbezeichnung allein reicht dafuer nicht. Der zeitnahe Fall bleibt in beiden
Richtungen, im Erstcluster und am Bestandsvorgang getrennt. Originaldaten werden
nicht veraendert. Die positiven KI-Fortsetzungen und Kabinettsumbildung bleiben
gruen. Dies ist eine enge Heuristik, kein allgemeiner semantischer Ereignisbeweis.

Production23:02:57UTC: genau die falsche neue Quellenverknuepfung und die dadurch
entstandene Wiederholungsvormerkung sind gesichert entfernt. Archiv
`quarantaene-wadephul-ki-20260926-a`, SHA256
`72212ee5264065b947e48a8c325f30aad828e38dffa2eb77bafc471d8f69df54`.
Der alte Vorgang, seine alte Quelle und CAS-Zeile bleiben unveraendert; kein
Zuruecksetzen des unbekannten Ergebnisses. Alle500 Profile inaktiv/hashgleich,
501 Identitaeten hashgleich, keine Jobs/Leases/Sperren/offenen Modellreserven.

## Pruefungen (lokal, offline)

Gruen: `vorgangsidentitaet-test` 90/90, `vorgangs-ereignisketten-test` 21/21,
`vorgangs-beweisfamilien-test` 108/108, `vorgangs-personengruppen-test` 11/11,
`vorgang-gesetzesgenitiv-test`, `vorgangs-frische30-test` 4/4,
`vorgangsbildung-verlust-test`, `understanding-einzelvorgang-test` 49/49,
`understanding-ebenen-ereignis-test` 5/5, `ereignisbindung-heute-test` 8/8,
`herausgeber-identitaet-test` 109/109, `vorgangs-resolver-test` 54/54,
`vorgangs-resolver-exakt-test` 12/12, `vorgangs-uebernahme-analyse-test` 35/35,
`briefing-themenanker-test` 7/7, `briefing-vollstaendigkeit-test` 23/23,
`verstehen-einmalig-test`, `verstehen-169-neuversuch-test` 19/19,
`embedding-backfill-test` 40/40, `vorgangskontext-test`; `node --check` fuer
alle geaenderten Dateien.

Nicht Teil dieses Nachweises: `z3-realistiklauf-vertrag-test` bricht lokal
fail closed ab (verlangt `HELMUT_SOURCE_MODE=off` ueber `scripts/lokal.js`),
`vorgangskontext-mutationsprobe` meldet 17/18 Proben rot und ein „Loch“ M5
(Mutationsmuster fehlt in `server.js`). Beide Ergebnisse sind mit dem
unveraenderten HEAD-Stand identisch — sie gehoeren nicht zu dieser Aenderung.
