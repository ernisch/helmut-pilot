# Z3b Monitoring Ehrlichkeit vom 28.08.2026

## Sprintzustand

**Lokal teilweise abgeschlossen.** Der Branch
`codex/z3b-monitoring-honesty` steht auf dem lokalen Kopf von PR #275. Zwei
bereits vorhandene Folgekorrekturen wurden getrennt übernommen, gemeinsam
geprüft und um einen zusätzlichen Nennervertrag ergänzt. Ein Pull Request, der
vollständige lokale Offline Lauf und Pflicht CI fehlen noch.

Production, Supabase, echte Mandatsdaten, Migrationen, Umgebungswerte und
Geheimnisse wurden nicht verändert. Die Korrekturen wiederholen keinen
isolierten Lastnachweis.

## Befund N6: gedeckelte Queue Gründe waren keine Gesamtverteilung

Der Lesepfad für Zurückstellgründe liefert höchstens 1.000 ungeordnete Zeilen.
Der bisherige Betriebsstatus teilte die darin erkannten blockierenden Gründe
durch den gesamten Rückstand und nutzte das Ergebnis als globale
Ursachenentscheidung.

Bei 2.000 wartenden Aufträgen und 1.000 gelesenen Abhängigkeitsgründen entstand
so der Wert 0,5 und damit die Zustandsklasse `abhaengigkeit`, obwohl die Gründe
der anderen 1.000 Aufträge unbekannt waren. Der Wert war weder ein Anteil der
Stichprobe noch ein belegter Anteil des Gesamtbestands.

### Korrektur

1. Weniger Zeilen als das Limit belegen eine vollständige Lesung der gefilterten
   Grundmenge.
2. Genau das Limit oder mehr wird konservativ als unvollständige Stichprobe
   markiert.
3. Nur eine vollständige Lesung darf `anteilBlockierend` und die globale
   Zustandsklasse bestimmen.
4. Eine Stichprobe bleibt mit eigenem Anteil, Messumfang und Befund sichtbar.
5. Der Stichprobenanteil teilt durch alle gelesenen Zeilen. Leere, aber gelesene
   Fehlerwerte erhöhen den Anteil dadurch nicht künstlich.

Eine unvollständige Stichprobe macht einen alten Rückstand weiterhin mindestens
zur Warnung. Sie führt nicht zu einem falschen Grün und behauptet nur keine
unbewiesene globale Ursache.

## Befund N7: Blobspiegel Überlauf endete vor dem Betriebsbericht

Die kanonische relationale Ablage speichert die Rohdokumente vollständig. Der
zusätzliche Blob Lesespiegel sammelt je Slot höchstens 5.000 Items. Weitere
Items wurden bereits gezählt, aber dieser Zähler erreichte weder die relationale
Slotquittung noch den Motorbericht.

Damit konnte der optionale Lesespiegel unvollständig sein, während der Betreiber
nur `keine neuen Quellen` oder gar keinen Hinweis sah.

### Korrektur

1. Die Workerbilanz nennt gesehen, gesammelt, verworfen und vollständig.
2. Der Slot loggt die exakte Spiegelgrenze, ohne die kanonische Ablage als
   unvollständig zu bezeichnen.
3. Die bestehende technische Spalte `reason` trägt
   `blob-spiegel-ueberlauf:<anzahl>`. Eine Migration ist nicht nötig.
4. Der Motorbericht nennt die exakte Lücke und bestätigt ausdrücklich die
   vollständige relationale Ablage.
5. Der stabile Hinweis `spiegel-ueberlauf` ersetzt in diesem Fall die falsche
   Deutung `keine-neuen-quellen-im-letzten-lauf`.
6. Ein Spiegel Schreibfehler bleibt vorrangig und wird weiterhin als unbekannter
   Spiegelwert gemeldet.

Der Überlauf ist ein gesunder Hinweis, kein Ausfall des kanonischen Motors. Die
Anzahl bleibt dennoch maschinenlesbar und im Bericht sichtbar.

## Abhängigkeit und Pull Request Reihenfolge

Die Härtung wird als eigener Branch auf PR #275 aufgebaut. Die Reihenfolge ist:

1. PR #272
2. PR #273
3. PR #274
4. PR #275
5. eigener Pull Request für Monitoring Ehrlichkeit

Der Branch ist in `vercel.json` gegen automatische Vorschau Deployments
gesperrt. Ein späterer Merge bleibt ein gesondert freizugebendes Production
Deployment.

## Lokaler Beweis

Alle Läufe gingen über `scripts/lokal.js`.

| Prüfung | Ergebnis |
|---|---:|
| `warteschlangenwache-vertrag-test.js` | 73 PASS, 0 FAIL |
| `warteschlange-blob-entkopplung-test.js` | 42 PASS, 0 FAIL |
| `motor-health-test.js` | 67 PASS, 0 FAIL |
| `health-report-route-test.js` | 51 PASS, 0 FAIL |
| `planungs-zeitbudget-test.js` | grün |
| `queue-ende-zu-ende-test.js` | grün |

## Beweisgrenzen

| Ebene | Stand |
|---|---|
| lokal bewiesen | Stichprobengrenze, ehrliche Anteile, Spiegelüberlauf bis zum Motorbericht |
| isoliert gegen Supabase bewiesen | unverändert der frühere Plattformnachweis bis 500; nicht Teil dieses Fixes |
| vollständig im Fachweg bewiesen | offen |
| in Production bewiesen | offen |

Die Tests beweisen keine reale Rückstandsverteilung und keinen echten
Blobüberlauf in Production. Sie belegen den Vertrag, wie beide Fälle berichtet
werden müssen, wenn sie auftreten.

## Risiko und Rückweg

Bei genau 1.000 vorhandenen Grundzeilen wird die Lesung vorsichtshalber als
Stichprobe behandelt, obwohl sie vollständig sein könnte. Das kann eine globale
Ursachenklasse zurückhalten, aber nie einen bestehenden Warnzustand entfernen.

Der Spiegelüberlauf nutzt die vorhandene `reason` Spalte. Andere Fehlergründe
bleiben vorrangig. Es gibt keine neue Tabelle, Migration oder Datenmutation.

Der Rückweg ist das Revert der späteren Fixcommits mit anschließendem,
freigegebenem Production Deployment. Datenbereinigung, Flagänderung und
Geheimnisrotation sind nicht nötig.

## Noch offen

1. vollständigen lokalen Offline Lauf auf dem finalen Branch ausführen
2. eigenen gestapelten Pull Request ohne Vorschau Deployment anlegen
3. Pflicht CI vollständig grün belegen
4. Merge erst nach #272 bis #275 sowie eigener Betreiberfreigabe
5. Wirkung später rein lesend an natürlichen Production Befunden prüfen
