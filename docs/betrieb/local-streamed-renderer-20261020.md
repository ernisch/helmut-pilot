# Lokaler Auth-Renderer: Speicherursache und begrenzte Qualifikation

Stand 20.10.2026, eigener Branch `codex/auth-state-working-set-20261020`,
Basis `bdb2c2c3`. `c8624f7c` bleibt Vorfahr. Keine Production-Anwendung,
Migration, Aktivierung, Routeränderung, Zusammenführung oder Bereitstellung.
Alle neuen KI-Arbeiten dieses Sprints ausschließlich GPT 6.1 SOL; keine neuen
DeepSeek-/Routeraufrufe. Betreiberkostenverträge bleiben unverändert.

## Ursache und konkrete Änderung

Der bisherige vollständige PostgreSQL-Renderer materialisierte Blatttexte,
rekursive Vorkommen mit Sortierpfaden und vier Tokenmengen vor dem geordneten
`string_agg`. Das verursacht am echten späten V11-Zustand vermeidbaren privaten
Backend-Speicher und temporäre Dateien. Der folgende direkte Vergleich belegt
diesen Anteil; er erklärt nicht den gesamten historischen gemeinsamen Peak.
V11 lief mit `5fae25be`, nicht mit der späteren Budgetimplementierung.

Nur der abschließende vollständige Renderer von
`helmut_auth_state_expand_local_v1` und seine lokalen Variablen ändern sich:
expliziter Tiefenstapel bis 64, Ausgabe der logischen Vorkommen in Reihenfolge,
UTF8-sichere Fragmente mit höchstens 64 KiB logischem Pufferinhalt. Gesammelte
Ausgabestücke werden einmal verbunden und anschließend unverändert geprüft.
Die 64 KiB sind **keine Gesamtspeichergrenze**: aktueller Token, Bytekopie,
Arrayverwaltung, sämtliche Ausgabestücke, vollständiger Text, JSONB und
Grapharrays benötigen zusätzlich Speicher.

Unverändert bleiben Graphmodus, Hash-/Postorder-/Typ-/Tiefenprüfung,
20.000 Knoten, 32 MiB Nutzdaten, bestehende Text-/Native-/Arbeitsgrenzen,
`IS JSON WITH UNIQUE KEYS` vor dem Cast und tatsächliche Größenprüfungen.
ABI, STABLE, Security Invoker, Search Path, Rechte, RLS, Trigger, CAS,
History, Restore, ACK-Verhalten und 16 frische Kontrolllesungen bleiben erhalten.
Keine neue Opt-in-Variante: der lokale Merkle-Pfad verwendet den neuen Renderer.
Die Kontrollintegration bindet die neue SQL-Prüfsumme als eigenen Deltaeintrag;
historische W50-Abnahmen werden nicht erweitert. Alte installierte Renderer
werden weiterhin durch den tatsächlichen Funktionskatalog abgewiesen.

## Tatsächlicher Vergleich am späten V11-Zustand

Frische eigene RAM-Kopie des vorhandenen diagnostischen PGDATA-Ablegers,
PostgreSQL 17.6, wiederhergestellte originale LLVM/JIT-Dateien, `jit=on` und
`pg_jit_available()=true`. Ob V11 selbst JIT ausführte, bleibt unbekannt.
Alle 1.709 Quelldateien vor Kopie, in Kopie und nach Abschluss identisch.
Originaldaten und alte Prozesse wurden nicht verändert.
Der tatsächliche vollständige Ausgangskatalog wurde geprüft; nach Installation
änderte sich ausschließlich der geprüfte Renderer-Funktionskörper.

Reihenfolge OLD/NEW/NEW/OLD, jeweils neuer Backendprozess und derselbe
unveränderte Authzustand. Alle vier nativen Ergebnisse exakt gleich:
6.129.538 Textbytes, 6.397.892 native Bytes, SHA256
`6b33d86301a88b227c4a24a9facd7132397021335cc15dc20f10703cfb435750`.

| Messung | OLD 1 | NEW 1 | NEW 2 | OLD 2 |
|---|---:|---:|---:|---:|
| Wandzeit ms | 1200,659 | 356,601 | 293,895 | 621,425 |
| Backend RssAnon KiB | 186864 | 64816 | 64816 | 186644 |
| Backend VmHWM KiB | 307408 | 126524 | 126332 | 308072 |
| zusätzliche Tempbytes | 19120551 | 6397902 | 6397902 | 19120551 |
| zusätzliche Tempdateien | 3 | 1 | 1 | 3 |

Im zweiten Paar sind das 124.751.872 B weniger anonymer Backendspeicher und
186.101.760 B weniger Backend-Höchststand. Backend-CPU einschließlich seines
Setups: 59 gegenüber 27 Ticks bei 100 Hz. Zwei Messungen je Variante erlauben
keine statistische oder allgemeine Laufzeitgarantie. RSS/HWM enthalten gemeinsam
abgebildete Seiten und werden nicht zu einem Gruppenpeak addiert. Der gemeinsame
SQL-Messwrapper erzeugt auch bei NEW etwa 6,4 MB Tempdaten; kein Null-I/O-Beleg.

Die neue Implementierung bestand außerdem tatsächlich 11 bestätigte gewöhnliche
Authmutationen, 192 frische Kontrolllesungen, Revisionskonflikt und einen echten
Servercommit mit verlorener Bestätigung ohne automatischen Retry. Zwei echte
`recordLlmUsage`-Aufrufe schrieben ausdrücklich kostenfreie Kein-Aufruf-Belege;
6.000 historische Einträge blieben als Suffix erhalten, danach 6.002 Einträge.
Der logische Ausgangszustand wurde vor diesen Anhängen wiederhergestellt.
Alle gemessenen bestätigten Schreibvorgänge blieben unter Auth30.

Zwölf Runden zeigen natürliche GC-Wellen: HeapUsed 104.922.568–146.563.272 B,
RSS 277.602.304–312.070.144 B, tatsächliches Heaplimit 452.984.832 B. Das
belegt kein Plateau über 500 Profile. Frische Leser/Transport erzeugen weiterhin
beträchtliche Tempdaten. V11s kumulative 62 GB Temp-I/O sind weder Peak-RAM
noch vollständig dem Renderer zuzurechnen. Node-Vollkopien bleiben vorhanden;
sie sind damit nicht als größte Ursache oder Speicherleck bewiesen.

## Ergebnisgrenzen und weitere Prüfungen

Die gesamte Vergleichssteuerung `candidate-abba-02` bleibt **FAIL**:
Nach erfolgreichem Clientlauf wurde beim Stoppen von PostgREST ein unerwarteter
Abschlussstatus erkannt. Dessen genauer Rückgabecode wurde nicht gespeichert.
Die dort geplante Differentialphase startete nicht; entsprechende geplante
Phasenflags sind kein Ausführungsbeleg. Alle eigenen Kinder wurden anschließend
beendet; PostgreSQL endete mit 0. Die Gesamtkatalog-/Graph-/Historyqualifikation
der Steuerung bleibt ausdrücklich unbestätigt.

Der unveränderte Kernel-Lebenszeitpeak einschließlich Setup, Quellenkopie,
JIT-Wiederherstellung, OLD/NEW-Vergleich, neuer Authverarbeitung und letztem Exit
betrug 1.094.455.296 B. CPU insgesamt 122.490.388 µs; high/max/OOM/kill jeweils
0, Gruppe leer. Kein Peakreset, keine Subtraktion. Das ist **kein exklusiver
NEW-Peak**. PGDATA lag auf RAM statt auf dem vollen Ressourcenlauf-Datenträger;
bereits vorhandener Originalcache kann außerhalb der neuen Gruppe liegen.
Kein Cold-Cache-, Gesamthost-, 500er- oder 500-MB-Puffernachweis.

Die fehlende Semantikprüfung wurde separat erfolgreich abgeschlossen:
39 Fälle, 95 native OLD/NEW-Vergleiche einschließlich unabhängiger Sollwerte,
exakter negativer Phasen/SQLSTATE/Fehlermeldungen, geteilter Graphen,
Duplikate, Unicode, großer Zahlen sowie 4-MiB-Grenzfälle. Neue leere synthetische
PG17-Datenbank, JIT für beide Varianten AUS, 1-GiB-Container und Swap 0;
kein V11-PGDATA gemountet. Alle Fallmutationen zurückgerollt,
Katalog/Parameter unverändert, Prozesse beendet. Reiner Semantikbeleg.

Zusätzlich 22/22 gezielte Integrationstests einschließlich alter Rendererhash-
Ablehnung und Quellenbindung sowie 6/6 Startprüfungen bestanden. Die konservative
SQL-Regression bestand 179/179 Offline-Suiten in 698 s, Prozessende 0, im eigenen
Code-Worktree auf `/tmp` mit exakt derselben geänderten SQL-Datei. Die später
ergänzte Descriptorbindung wird durch die gezielte Integration geprüft; der
tatsächlich aufgezeichnete native Katalog wurde außerdem vom endgültigen
Integrationscode unverändert akzeptiert. Keine Wiederholung des erfolgreichen
Authkomponentenlaufs wegen des Abschlussfehlers.

## Haltepunkt vor dem nächsten vollständigen Lauf

Offen bleiben exakt 500 gleichzeitig aktive synthetische Profile, 1.500
vollständige Ergebnisse, Offline90/Unit60/Auth30 mit 16 frischen Kontrollen,
längere Speicherstabilität und der
500.000.000-B-Puffer unter der harten Grenze 2.048.000.000 B. Native Kappe
1.547.997.184 B, high 1.399.996.416 B und Swap 0 bleiben unverändert.

Plattenadmission weiterhin 15.179.779.720 B; aktuell rund 8,60 GB frei,
also rund 6,58 GB zu wenig. Der 8-GiB-Hostboden bleibt bestehen.
Keine Löschung alter Originale/Container/Volumes/Loops; RAM-tmpfs ersetzt
keinen Plattenreservennachweis. Die normale kleine Semantikfixture verändert
keine NativeBudget- oder Volltest-Admission.

Vor einem weiteren Ressourcenlauf: ausreichend Plattenkapazität bereitstellen,
frische vollständige Quellen-/Katalog-/Laufzeit-/Fensterbindung und Startprüfung,
neue unabhängige Gesamtannahme sowie neues konkretes vollständiges GO.
Verbrauchte Freigaben bleiben verbraucht. Kein vollständiger Lauf wird aus
diesen Komponentenbelegen abgeleitet. Im selben Thread fortsetzen, SOL Sehr hoch.

[Messwerte und Prüfsummen der privaten Primärbelege](local-streamed-renderer-qualification-20261020.SAFE.json).
Private Belege bleiben außerhalb von Git unter
`/workspace/helmut-ram-fix-20261020/auth-working-set-20261020`.
