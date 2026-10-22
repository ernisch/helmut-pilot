# Später V11-Zustand: Ursachenpriorität und gesicherte nächste Messung

Stand 20.10.2026. **Teilweise abgeschlossen; neue native Messung blockiert.**
Branch `codex/late-state-memory-diagnostics-20261020`, Basis
`f0d3b0395b638967d89095df8b0ca5731399c633` (PR925), enthält als Basis PR924
`bdb2c2c3a369ebf175f02734c696b13f00733988`; `c8624f7c` bleibt Vorfahr.
V11 lief dagegen mit `5fae25be5068a278a88daca9a7508c7b9e4001a3`.
Keine neue Motoränderung in diesem Diagnostiksprint. Die vorhandenen nativen
Budgets und der bereits integrierte Streamingrenderer bleiben erhalten.

## Was die Originaldaten tatsächlich priorisieren

Sechs explizit als GPT 6.1 SOL gestartete unabhängige Helfer untersuchten
Schreibpfad, Parts, Speicherbelege, PostgreSQL/Transport, Abschluss und Kapazität.
Höchstens drei Schreiber; getrennte Worktrees und Dateibereiche. Keine
DeepSeek-/Router- oder Helmut-Provideraufrufe; Routerkonfiguration unverändert.

207 V11-Originalpunkte zeigen zwischen den zeitlichen Abschnitten HTTP-Index
0–99 und 400–498 folgende Probenmediane (dezimal MB):

| Gruppe | Früher | Später | Zunahme |
|---|---:|---:|---:|
| Gemeinsam | 1185,74 | 1950,59 | 764,85 |
| Datenbank | 495,38 | 1073,03 | 577,65 |
| DB file | 248,27 | 592,36 | 344,08 |
| DB anon | 233,03 | 453,61 | 220,58 |
| Anwendung | 680,02 | 872,58 | 192,56 |

Das sind zeitlich verteilte Mediane, keine addierbaren Teilpeaks oder gemessenen
Bytes je Profil. Bei Index495: gemeinsam 2079178752B, anon1303851008B,
file731328512B, kernel42127360B; shmem146919424B ist bereits in file enthalten.
Die Zusammensetzung des echten Peaks2151936000B wurde nicht aufgezeichnet.
Spätere Backendkohorten starten mit höherem anonymem Speicher; innerhalb vieler
Kohorten bleibt er nahezu konstant. Das beweist keinen Leak desselben Backends.
Node-RSS steigt von298979328 auf631595008B; originale Heap-/GC-/PSS-Daten fehlen.
**DB zuerst messen; die größte verbleibende vermeidbare Ursache ist unbewiesen.**

Die neue späte Authkomponente erzeugte über zwölf Runden 190 Tempdateien mit
insgesamt1180336050B (6212295B je Datei im Mittel, keine Einzeldateiliste);
auch vier Runden ohne gewöhnliche Mutation
erzeugten sie. Das ist kumulatives Temp-I/O, kein RAM. Engster nächster Verdacht:
`graph_checked` sortiert vollständige Knotenreihen einschließlich body nach
node_seq (1848 erreichbare Knoten/6010786B Payload, work_mem4MB). Ein tatsächlicher
Ausführungsplan fehlt. Auch der äußere Messwrapper kann Tempdaten erzeugen.

U.write benötigt die Abtrennung veränderlicher Eingaben. sentHistory kopiert
Referenzen auf eingefrorene Datensätze, nicht deren gesamte Payload. Ein früherer
W46-Versuch entfernte bereits einen Parse, erhöhte aber den gemeinsamen Peak
von890748928 auf907329536B. Keine Wiederholung oder Aktivierung dieses Opt-ins.
Parts.decode könnte einzelne redundante Serialisierungen vermeiden; die finale
Abtrennung geteilter DAG-Objekte und der kanonische Neuaufbau bleiben notwendig.
Für diese Ideen fehlt ein gemeinsamer Speicherbeleg: **nicht implementiert**.

## Erhaltene Ergebnisse und unveränderte Grenzen

PR925 hat den vollständigen Renderer bereits strukturell ersetzt. Der anerkannte
OLD/NEW/NEW/OLD-Vergleich am identischen späten Zustand zeigte im zweiten Paar
124751872B weniger Backend-RssAnon und621/294ms bei exakt gleichen Ausgaben.
Das ist keine gemessene gemeinsame Einsparung. Die bestandenen179 Offline-Suiten
und95 nativen Vergleiche wurden ohne Motoränderung nicht wiederholt.
[Vorherige Qualifikation](local-streamed-renderer-20261020.md).

`candidate-abba-02` bleibt **FAIL** wegen PostgREST-Abschluss vor der geplanten,
nie gestarteten Differentialphase. Der genaue damalige Exitcode ist unbekannt.
Sein gemeinsamer Lebenszeitpeak1094455296B enthält OLD+NEW, Setup, RAM-PGDATA,
JIT und Abschluss; kein exklusiver NEW-/Voll500-Nachweis. Zwölf Runden und
natürliche GC-Wellen belegen kein längerfristiges Plateau.

Neu vorbereitet sind ausschließlich:

- Ein Inspektor, der hashgeprüfte vorhandene Guardquellen aus genau diesen Bytes
  lädt und die unveränderte Kapazitätsprüfung ohne Ressourcenstart ausführt.
- Zwei inerte SQL-Messvorlagen: exakter geordneter Knotenselect mit EXPLAIN sowie
  gegebenenfalls ein nativer warmer Kontrollaufruf. Nur neue qualifizierte Kopie,
  READ ONLY/ROLLBACK, 30s je Statement (kein Auth30-Nachweis), externe256KiB-Kappe
  innerhalb4MiB Gesamtbudget.
  Kein Socket, keine Zugangsdaten, keine Startanweisung, kein optimiertes SQL.
- Ein noch nicht eingebundener PostgREST-Abschlusshelfer mit12 bestandenen reinen
  Simulationstests. PID/argv und Pins, rohe vorzeichenbehaftete Exitcodes,
  begrenzte Wartezeiten, expliziter Logabschluss und16KiB Logende. Nur0/-15 nach
  tatsächlich lebendem gebundenem Kind akzeptiert;143, Timeout, Kill oder Fehler
  bleiben FAIL. Tatsächliche Binär-/Konfigurationsbindung prüft später der Starter.
  Nur der zurückgegebene Beleg darf in die dauerhafte Endaggregation eingehen;
  ein vorläufig geschriebenes Stopprotokoll allein kann keinen PASS begründen.
  Fehlende Endaggregation oder Persistenzfehler bedeutet FAIL.

Native SQL-/PostgREST-Qualifikation und Einbindung dieser Vorbereitung wurden
**nicht ausgeführt**. Der historische Abschlussfehler ist damit nicht behoben.
Root prüfte Python-AST, Zeitgrenzen aller acht SQL-Transaktionen rein statisch,
27 Quellen-/Belegpins und vier Regeln des kompakten Statusdokuments erfolgreich.
Die unabhängige SOL-Review ist nach Korrektur der Beobachterzeitgrenzen und
Präzisierung der Zähler-/Statementaussagen ohne verbleibenden Blocker abgeschlossen.
Quellpins, Testbeleg und exakter nächste Messvertrag:
[Manifest](late-state-memory-next-probe-20261020.SAFE.json).

## Tatsächliche Kapazität und nächster Schritt

Rein lesende Guardbeobachtung am20.10.2026 um16:11:14UTC, Exit2/BLOCKED:

| Größe | Bytes |
|---|---:|
| Verfügbar (`f_bavail`) | 8597049344 |
| Unveränderter Hostboden (8GiB) | 8589934592 |
| Spielraum | 7114752 |
| Native Komponentenadmission: Boden+16MiB | 8606711808 |
| Komponentenfehlbetrag | **9662464** |
| Volladmission mit bestehendem2GiB Storage | 15179779720 |
| Vollrunfehlbetrag | **6582730376** |

Werte sind zeitgebundene Beobachtungen; Vorbereitungsausgaben ändern sie weiter.
Der kleine Fehlbetrag allein finanziert weder Kopie noch Ergebnisreserve.
Vollformel: Storage+Hostboden+vier normale und zwei native Helperhüllen+512MiB
Ausgabenbudget. Docker teilt denselben persistenten Speicher. `/tmp`/`/dev/shm`
sind RAM; reservierte Rootblöcke zählen nicht als verfügbare Reserve. Alte Loops
sind teils sparse, logische Größen sind keine zurückgewinnbaren Bytes. Kein
unterstützter kostenloser Kapazitätsausbau in den verfügbaren Werkzeugen gefunden.
Keine Altressource gelöscht, verschoben, umgepackt oder umgebunden.

Nächster Schritt: zusätzliche tatsächlich verfügbare persistente Kapazität durch
Plattform/Betreiber, dann frische unveränderte Admission und Original-/Runtime-
Bindung. Zuerst die eine geordnete Abfrage, nur falls nötig den warmen nativen
Kontrollaufruf messen. Erst dessen Zuordnung rechtfertigt eine weitere konkrete
Motoränderung. Danach Vergleich von Basisf0d3 gegen genau diesen belegten Umbau,
auf identischen frischen Kopien und vollständigen getrennten Lebenszeitgruppen.
Der Messvertrag bewilligt keinen Start und ersetzt keine Starterintegration.

Der bestehende vollständige Startprüfer verlangt in `coverage_adopted()` weiterhin
`deepseek-v4-pro`/`high`. Das erzwingt keinen Router für SOL-Entwicklung oder eine
eigenständig autorisierte Komponentenprüfung, verhindert aber eine frische
Vollstartannahme ausschließlich mit SOL. Vorgabe unverändert; keine künstlichen
Modellbelege. Vor einem späteren Voll500 muss dieser Vertragskonflikt geklärt sein.

## Abnahmestatus

Kein neuer gemeinsamer OLD/NEW-Wert, kein Plateau, keine vollständigen
Offline90-/Unit60-/Auth30-/1500-Ergebnisnachweise und kein500MB-Pufferbeleg.
Maximal1548000000B bei500 aktiven Profilen ist weiterhin offen. Ein weiterer
vollständiger Lauf ist derzeit technisch nicht empfehlenswert und nicht bewilligt.
32 frische Startbedingungen, Fall-/Zeitbindung und neues konkretesGO bleiben
Pflicht; frühere GOs bleiben verbraucht. Betreiberkosten unverändert.

Keine Production, Migration, Aktivierung, Zusammenführung oder Bereitstellung.
Bekannte private Originale fehlen weiterhin in GitHub-CI; frühere CI bleibt FAIL,
Vercel-Preview war wegen bestehender Konfiguration rot. Keine Nebenreparatur.
Hier im selben Thread fortsetzen; **Sehr hoch**, weil native Ursachenabgrenzung
und vollständige Ressourcenbindung vor dem nächsten Umbau erforderlich sind.
