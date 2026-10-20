# Kalter Authleser: belegter Temp-I/O-Umbau, keine gemeinsame RAM-Ersparnis

SOL-only, lokale isolierte Kopien des unveränderten authentischen späten V11-Zustands.
PR926→925→924 bleibt die Basis; kein Merge, Productionzugriff oder neuer Voll500.

Der kalte Vierfeldleser materialisierte vollständige Knoten erneut über
`jsonb_array_elements`, obwohl der Digest nur ihre Hashes benötigt. Der lokale
Umbau projiziert zunächst die geprüften Hashtexte mit strengem JSON-Pfad und
expandiert nur diese. Reihenfolge, Digest, vollständige frische Prüfungen,
Payloads, Rollen, Nonces, History, Originalhashes, CAS-/ACK-Regeln und Grenzen
bleiben erhalten. Die native gemeinsame Grenze allein gilt nicht als Verbesserung.

Eigenständige19 native Differentialpaare PASS:8 vollständige JSONB-Antworten
exakt gleich,11 Fehler mit identischem SQLSTATE und vollständiger Fehlermeldung.
Je Paar Rollback, vollständiger Katalog/ABI/ACL und Originalzustand unverändert.
Alle eigenen Prozesse beendet, Quellmanifeste identisch, Speicherereignisse0.
Die unabhängige SOL-Prüfung hat tatsächliche Rohbelege und Quellen bestätigt.
Öffentliche Quellenabnahme und SOL-Review stehen unter
`scripts/helmut-resource-meter/cold-digest-{native-qualification,sol-review}-20261020.SAFE.json`.
Der Adapter prüft beide tatsächlichen Dateien, Bytezahl/Hash, SQL/prosrc/Adapter
und die Reviewbindung; `localSourceOnly` bleibt ausdrücklich ohne Zulassungsautorität.
Historische Abnahmen bleiben ausschließlich ihren historischen Bytes zugeordnet.

Vier neue eigene Lebenszeitmessungen mit identischer Originalkopie,
GUCs, Observer-SQL und symmetrischem Setup, Reihenfolge ALT/NEU/NEU/ALT:

| Fall | Gemeinsamer Lebenszeitpeak B | Zielintervall ms | Temp B / Dateien |
|---|---:|---:|---:|
| ALT1 | 780918784 | 237,547 | 6212035 / 1 |
| NEU1 | 781803520 | 254,824 | 0 / 0 |
| NEU2 | 781750272 | 260,734 | 0 / 0 |
| ALT2 | 781455360 | 276,238 | 6212035 / 1 |

Alle vier Fälle PASS als gültige Einzelmessungen; Komponentenhashes,
Semantikdigest und Ergebnisgrößen stimmen überein. Beide NEU-Peaks liegen
884736B bzw.294912B über ihrem Gegenfall: **keine belegte gemeinsame RAM-Ersparnis**.
Die Tempdatei entfällt kausal reproduziert, dieser I/O-Erfolg löst das RAM-Ziel nicht.
Zeiten schwanken und belegen hier keine klare Laufzeitverbesserung.

Die gesamte eigene Gruppe umfasst Kopie, Runtime-/JIT-Aufbau, PostgreSQL,
Beobachter und Abschluss bis letztem Exit. Node/PostgREST/500Profile sind nicht
enthalten. Kein erzwungener GC, Cacheleeren oder Peakreset; kein kalter OS-Cache
behauptet. Ein einzelner Lesevorgang belegt kein Plateau über Mutationen.
[Exakte Fälle, Messwerte und Belegpins](cold-digest-abba-comparison-20261020.SAFE.json).

Der Motorquellenpfad ist lokal übernommen und über den echten Descriptor mit
allen aktuellen Proofdateien gebunden. 22/22 Integrationsprüfungen und18/18 gezielte Quellen-Gate-Fälle PASS; echter
Descriptor enthält28 Quellenpins einschließlich aller drei neuen Proofdateien.
Die vollständige kritische179-Regression folgt einmal nach Abschluss des
geänderten Umfangs. Das Voll500-Starttor bleibt unverändert gesperrt.

Nächste eng begrenzte Frage: Die private Kontrollsicht verwirft Inhalte über
2MiB. Ob genau der späte Zustand diese Grenze überschreitet und dadurch
vollständige Graphantworten für Kontrolllesevorgänge erzwingt, ist noch nicht
gemessen. Vor einer weiteren Motoränderung genau diese tatsächlichen Bytes und
zwei echte Kontrollaufrufe auf isolierter Kopie nachweisen. Keine allgemeine
Optimierungsanalyse und kein vollständiger500er-Hypothesentest.

Die fünf neuen Diagnosekopien kosten erneut persistenten Platz; die Bereinigung
von vier früheren Kopien bleibt unverändert belegt. Weitere gezielte Entfernung
erst nach vollständigem Verlustlosigkeitsnachweis, unabhängiger Prüfung und
frischer Root-Adoption. Originale, Belege, alte Archive und fremde Ressourcen
bleiben geschützt. Das500MB-Reserveziel ist offen; kein Erfolgsversprechen.
