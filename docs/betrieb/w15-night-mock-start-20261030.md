# W15 Mock500: verbleibende Startlücken am 30.10.2026

Der Mock500 bleibt **BLOCKED**. Dieser Nachtschritt ergänzt den vorhandenen
Starter; kein Originalempfang, Restore, Controllerlauf, Profilaktivierung,
Modellaufruf, Upload, neue Ressource, Push oder Deployment wurde ausgeführt.
Der Arbeitsstand baut auf `deb812f9` auf. Der bereits geprüfte Zweizeilenadapter
aus PR977/`8de90cbe` wurde als `63fac078` übernommen: `225e76d7` ist damit nur ein
zulässiger **später separat positiv abzunehmender** End500-Baselinekandidat.
Auf Rootvorgabe wird auch der unveränderte Diagnose-/Fixturekopf
`deb812f9e7e3a2d58e5b4e593a1eec00ef1e22d8` als eingefrorener Kandidat zugelassen;
der native synthetische Minibeleg ersetzt seine fehlende Original-/End500-Abnahme
nicht. Keine aktuelle End500-Abnahme wird daraus abgeleitet. Der neue Mockkopf
wird nicht als seine eigene vorausgehende End500-Baseline zugelassen.

## Konkrete ergänzte Anschlussprüfung

Der vorhandene Mock-Abschluss prüfte vollständige Unit-/Kontrolllisten, ließ
aber bei unverändert positiven Zusammenfassungen unvollständige Provider-,
native Auth- und einzelne Ergebnisbeobachtungen durch. Drei kleine rein
synthetische Gegenbeispiele wurden unmittelbar gegen den tatsächlichen
Abschlusscode aus `deb812f9` bestätigt: eine mittlere Providerphase mit exakt
20 Sekunden, ein fehlender nativer Auth-ACK und eine fehlende individuelle
Ergebnisposition. Der alte Abschluss akzeptierte diese Metadaten; der ergänzte
Abschluss weist alle drei vor einem nativen Export zurück.

`mock500_backup.py` verlangt jetzt zusätzlich:

- genau 1000 gespeicherte D/R-Phasen in ihrer ursprünglichen Reihenfolge, jede
  mit nativer Send-/Kostenbindung, konsistenten Anfangs-/End-/Dauerwerten und
  strikt weniger als 20 Sekunden; die 19,9-Sekunden-Randfälle bleiben erhalten;
- jede native Auth-Hülle und jeden zugeordneten CAS-Schreibbeleg, bestätigte
  Speicherung, denselben Unitindex, `main-auth`, `relational-atomic-v1`, echte
  ACK-Zeitordnung und strikt weniger als 30 Sekunden; genau zwei Usage-Hüllen
  je Unit und 500 eindeutige tatsächliche Schluss-ACKs;
- alle 500 Unitzeiten bis zum jeweiligen nativen Schluss-ACK unter 60 Sekunden,
  8000 vorhandene Kontrollbeobachtungen sowie den letzten tatsächlichen
  Aktivbestand 500 und ein geschlossenes Journal;
- alle 500 unabhängigen Auswertungszeilen und 1500 individuellen gespeicherten
  Ergebnisbelege, eindeutige IDs, kanonische Hashes gleich den erhaltenen
  Runtime-Ausgaben, dieselben Besitzer/Bereiche und keine Fehlerkategorie.

Die vorhandene Sicherung, Verschlüsselung, Fernrücklesung, zweite unabhängige
Rücksicherung und kontrollierte Beendigung bleiben erhalten. Die neue Prüfung
erteilt keine eigene Mock-, Production- oder Quellenabnahme.

**Integrationsabhängigkeit beim Root:** Der gemeinsame Runtimecode muss jede
Providerphase bereits vor der nächsten Unit abweisen und das neue Pflichtfeld
`checks.all1000ProviderPhasesUnder20` aus den tatsächlichen Beobachtungen setzen.
Die bisherige Runtime prüft die Dauer ausdrücklich nur bei Unit0 und Unit499.
Root hat die kleine zentrale Korrektur und ihren gesonderten Test als
`2ec8b99a` vorbereitet; dieser
Arbeitszweig ändert die gemeinsam genutzte Runtime nicht. Ohne diese Integration
bleibt auch ein ansonsten vollständiger späterer Abschluss geschlossen.

## Gezielte lokale Nachweise

Alle Befehle liefen ausschließlich über `node scripts/lokal.js -- python3 -I -B`.

| Prüfung | Tatsächliches Ergebnis |
| --- | --- |
| `test_mock500_backup.py` | 13 Tests PASS; drei neue Gruppen mit 42 negativen Beobachtungsfällen |
| `test_mock500_workflow.py` | 6 Tests PASS, einschließlich des übernommenen Baselineadapters |
| `test_mock500_start.py` | 9 Tests PASS; einschließlich Ablehnung des nativen Fixturekandidaten ohne echte positive End500-Abnahme |
| Direkter Vergleich des alten und ergänzten Abschlusses | 3/3 synthetische Lücken reproduziert und geschlossen; kein Export/DB/Provider/500-Lauf |
| `git diff --check` | PASS |

Die 500-/1000-/1500-Listen in den Tests sind ausschließlich fiktive
Beobachtungsmetadaten. Sie führen keine Unit, Sicherheitskontrolle, Datenbank
oder Profilaktion aus. Die gezielten Tests beweisen die Ablehnung lückenhafter
Belege, keine echte 500er-Leistung oder RAM-Abnahme. Ein erster Vergleichsharness
wurde wegen Wiederverwendung derselben synthetischen Exportablage verworfen;
der erfolgreiche direkte Vergleich ruft ausschließlich die Abschlussprüfung
auf. Kein historischer Lauf erhält dadurch eine neue Klassifikation.

Maschinenlesbarer lokaler Umfang:
[MOCK_CLOSURE_SYNTHETIC_CHECKS.SAFE.json](belege/w15-night-mock-start-20261030/MOCK_CLOSURE_SYNTHETIC_CHECKS.SAFE.json).

## Unveränderte echte Blocker und konkrete spätere GO-Bedingungen

Der übernommene Dateibefund bleibt unverändert; es gab keine erneute Suche,
Inventur, Übertragung oder Quellenqualifikation. Zehn Zusatzoriginale und ein
Replacements-Pin fehlen. Nur das Builder-ZIP ist per vorhandenen Metadaten
lokalisiert. Insbesondere ist der ursprüngliche Qualifikationsbericht
`ALL500_MOCK_BINDINGS_CHECK.SAFE.json`, 13706128 Bytes,
SHA256 `d2603d926508a1655b415b18734fe37bc1a660dccb6f139ae43b1859a11bed3d`,
nicht erreichbar. Seine erfolgreiche 500/500-Quellenqualifikation wird später
unverändert übernommen, nicht rekonstruiert oder neu durchgeführt.

Vor einem konkreten einmaligen Mock-GO sind weiterhin erforderlich:

1. Zugängliche ursprüngliche zwölf End500-Dateien und alle elf Zusatzdateien
   mit ihren vollständigen ursprünglichen Pins, darunter der fehlende
   Replacements-Pin; gegebenenfalls gesondert erlaubter gezielter Transfer.
2. Tatsächlich positive unabhängige vollständige End500-Abnahme einschließlich
   Sicherung, Fernrücklesung, unabhängiger Rücksicherung und gemeinsamer
   Ressourcen-/Stopabnahme. Eine akzeptierte Baseline liegt derzeit **nicht vor**;
   der eingefrorene Kandidat `deb812f9` braucht diese spätere echte Abnahme.
   Sein nativer synthetischer Fixturebeleg wird dafür nicht eingesetzt.
3. Geprüfte gemeinsame Integration samt grüner Pflicht-CI und neuer unabhängiger
   **SourceQualification für genau den endgültigen Mock-Commit**. Die vorhandene
   Zulassung prüft dessen tatsächliche Codebytes. Eine neue genaue Bridge muss
   den später wirklich akzeptierten End500-Commit, diese SourceQualification,
   den Mock-Commit und die SHA256 der unveränderten End500-Abnahme verbinden.
   Eine finale SourceQualification oder Bridge liegt für diesen Nachtschritt
   nicht vor und wird nicht vorweggenommen.
4. Ein frisches ausdrückliches GO für genau diesen einmaligen Mocklauf im
   vorhandenen freigegebenen Branch/Environment mit frischem Nonce/Attempt1,
   vollständiger Eingabebindung, passendem UTC-/Berliner Tag und unverändertem
   Quellenfenster; tatsächlicher vollständiger verschlüsselter Dispatch
   höchstens 65535 Zeichen.

Unveränderte Kriterien: exakt 500 gleichzeitig aktive synthetische Profile,
500 Units, 1000 lokale Mockphasen, 1500 unabhängig geprüfte persistierte
Ergebnisse, 8000 echte Sicherheitskontrollen; Auth <30s, Unit <60s,
Providerphase <20s. Verarbeitung 10800s, gesamter gemeinsamer Parent 12600s ab
ursprünglichem Start. RAM-v2 hart 2048000000 Bytes, Lebenszeitpeak höchstens
1638400000, Reserve mindestens 409600000, Swap0. Keine RAM-Optimierung oder
Grenzänderung. Höchstens 0,05 USD bereits vereinbarte verschlüsselte Speicherung,
keine bezahlten Modelle oder externen Provideraufrufe. Bei FAIL/UNKNOWN stoppen,
kein Retry, nur eigene Prozesse schließen und 0 aktive Profile sowie leeren
gemeinsamen Parent belegen. Ohne tatsächlichen vollständigen Lauf entsteht
**kein Start-PASS und keine Mock500-Abnahme**.
