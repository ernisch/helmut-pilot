# Kontrollleser im lokalen Vollressourcenpfad: Versuch vom 19.10.2026 fehlgeschlagen

Der einzige neu freigegebene lokale Mock-Versuch `68f480265d50` endete am 19.10.2026 um 23:47:24 UTC mit Gesamt-PASS=false. **499 native FinalACKs; Index 499 ohne FinalACK, HTTP 409. Gemeinsamer Kernelpeak 2.300.071.936 Byte.** Die harte RAM-Bedingung, der gewünschte 500-MB-Puffer und der vollständige 500er-Abschluss sind verfehlt. Die V9-Freigabe und beide exklusiven Marker sind verbraucht und bleiben erhalten; kein Retry oder neuer Volltest ist daraus erlaubt.

## Tatsächlich geprüfter Motor und Start

Laufcode `80273b866594081a68777eeb318abf291b397beb`, Branch `codex/control-integration-restored-20261019`; Zielcommit `c8624f7c875a4f6f849d83951898c5e205833a6e` erhalten. Der neue Kontrollleser `96bec54e` mit Vollpfadbindung `85f40830/c8624f7c` war im lokalen Descriptor ausdrücklich aktiviert: `verified-control-view-v1`, Merkle und History-Reuse. Default bleibt AUS. Die neun akzeptierten Core-/SQL-Pins waren unverändert; während des Versuchs keine Code-, Schutz-, Uhr- oder Limitänderung. Historische W49/W50-Untersuchungen nicht wiederholt. Kein Vergleich unverträglicher historischer Peakdefinitionen als Einsparungsnachweis.

Zwei ausdrücklich zusätzlich genehmigte ProHigh-Leseprüfungen schlossen Kalender und begrenzte vollständige Start-/Verbraucherabdeckung mit echten completed/ok-Quittungen. Der vorherige unvollständige Prüfaufruf blieb ein Fehlerbeleg. Eine kombinierte echte Prüfung wurde für ihre beiden angenommenen Umfänge referenziert; keine zwei unabhängigen Modellaufrufe erfunden. Danach alle 32 frischen Startgruppen PASS, einschließlich echter Containersicht und Originalprüfung; genau eine neue Freigabe atomar beansprucht. Die 17 früheren verbrauchten Markerpins sind unverändert, dazu kommen die zwei nun verbrauchten V9-Marker. Die alte Cloud wurde nicht als wieder angebunden dargestellt.

Startquittung 20:49:15,335 UTC; Controllerabschluss 23:47:24,050 UTC, innerhalb des angenommenen realen UTC-Fensters am 19.10. Runner-Lebensdauer 10.685,884867 s (2 h 58 min 5,885 s). Vorbereitungsphase 19,074016 s, Assembly 22,206114 s, Sequenz 10.643,197423 s. Die Quellensicht und der UTC-Abrechnungstag wurden nicht verschoben.

## Ergebnis und Grenzen

| Kriterium | Tatsächlicher Beleg |
| --- | --- |
| Profilabschlüsse | Indices0..498:499HTTP200 und499 zugeordnete native FinalACKs; Index499:HTTP409, kein FinalACK |
| Frische Kontrollen | Für499 ACK-gebundene Einheiten jeweils10Load+6Admission:7.984. Beim letzten Profil weitere16 beobachtet, jedoch ohne Abschluss-ACK; kein vollständiger500er-/8000-Abnahmebeleg |
|1500 Positionen | Originale abschließende Positionsprüfung nicht erreicht; endgültiger gespeicherter Bestand nicht frisch abgefragt oder fachlich abgenommen |
| Offline90 |7,859940s, PASS |
| Original-U-Installation |3,519999s; originale U-Bytes/Journal und Fristprüfungen erhalten |
| Vorbereitung60 | Maximum der500 beobachteten Öffnungen2,402350s |
| Unit60 | Maximum der499 erfolgreichen nativen ACK-Intervalle52,883333s; letztes Profil ohne FinalACK, terminales Scope-Ende62,965026s nach nativem Beginn; Gesamtbedingung FAIL |
| Auth30 |4.000 beobachtete Mutationen erfolgreich; Maximum1,431865s; kein Ersatz für den fehlenden letzten FinalACK |
| Gemeinsamer RAM |2.300.071.936B, harte exklusive Grenze2.048.000.000B um252.071.936B überschritten:FAIL |
|500MB-Puffer | Zielpeak≤1.548.000.000B um752.071.936B überschritten; zusätzlich unvollständiger Lauf. `reserveBytes=null`, kein vollständiger Reservebeleg |
| CPU | Gemeinsame Gruppe11.791,944866CPU-Sekunden; keine Summe separater Peaks |
| Prozessende | AppExit1 wegen Sequenzfehler, DBExit0; Anwendung/DB/Storage/gemeinsame Gruppe leer, letzter Exit erfasst, OOM/OOM-Kill0 |

Letztes Profil: nativer Beginn23:46:19,020UTC, Frist23:47:19,020UTC; HTTP-Dauer64,562297s. HTTP-Wall und natives Unitintervall haben verschiedene Grenzen. Für native Zeitdifferenzen ausschließlich `units.beginMS` und `scopes.endMS` derselben monotonen Uhr verwenden; `events.elapsedMS` hat einen anderen Nullpunkt. Die erste nachträgliche Aggregation mit vermischtem Nullpunkt bleibt erhalten und wird durch die ausdrücklich korrigierte V2 ersetzt; die Fehlurteile ändern sich nicht.

Der innere409-Ablehnungsgrund bleibt **UNKNOWN**. Der vorhandene Adapter gibt nur `synthetik500-production-stopped-or-unknown` weiter und verwirft den ursprünglichen Fehler. Die Fristverfehlung ist separat belegt; ein bestimmtes inneres Deadline-Gate ist damit nicht als alleinige Fehlerursache bewiesen. Kein nachträglicher DB-Read, keine erneute Ausführung, kein Weitergehen nach dem Fehler und keine Limitverlängerung.

## Infrastruktur und Originale

Gemeinsamer Peak zählt die dedizierte Gruppe einschließlich Anwendung, Datenbank, Broker, Storage-Halter, Threads und Dateicache bis zum letzten Exit. Kein Peak des gesamten Cloudhosts. Der App-Gruppenpeak allein1.272.356.864B reicht für die Gesamtabnahme nicht aus. Sämtliche Eigencontainer, Datenbank, Storageabbild, Loop2-Mapping, Rohbelege, frühere Marker und Originale bleiben erhalten; temporärer eigener Device-Knoten nach dem Ende retired. Loop0/1 und ursprüngliche Quellenbank unverändert.

Eigenes ext4-Gastgerät:8.000.000.000B Kapazitätsobergrenze einschließlich PGDATA/WAL und Gastmetadaten; **keine gemessene tatsächliche Plattenspitze**. WAL konservativ höchstens469.762.048B über die gesamte Lebensdauer einschließlich Initdb/Shutdown, seit App-Baseline höchstens447.852.608B. Gast-Loop-IO45.867.008B gelesen/1.447.997.440B geschrieben; Backing-Device-Zähler nicht hinzuaddieren.154.026.758B Logpayload. Die192 Hostsamples zeigen mindestens15.100.243.968B frei, oberhalb8GiB; Stichproben ersetzen keine lückenlose Reservegarantie oder vollständige Host-Schreibobergrenze. Die Plattenreserve bleibt in diesem strengeren Umfang offen.

9267 Datenbanksamples,0 Observerfehler;12 vollständige HTTP-Abschlussreceipts, passive HTTP-Validierung PASS.511 ausschließlich als idle klassifizierte Resets; keine unvollständigen HTTP-Antworten oder Parserfehler. Finale Netzwerk-Tails ohne aktive TCP-Sockets/Fehler/Drops. Lokale Docker-/SQL-/HTTP-Richtungsbytes sind kein abrechenbarer externer Modellverkehr und werden nicht doppelt summiert.

Originalvergleich vor/nach:8Pins,6nativeKOs,7RAW-Dokumentzeilen/7Links identisch,0Quellschreibzugriffe; Finanzprojektion unverändert gültig. Die restaurierten Originale wurden tatsächlich genutzt; kein Ersatzoriginal erzeugt. Direkter Zugriff auf die alte Cloud bleibt nicht vorhanden.1.000 beobachtete lokale Mock-Providerphasen,0Production-/0bezahlte HELMUT-Provideraufrufe. Separate genehmigte DeepSeek-Reviewgebühren sind damit nicht als0 erklärt. Betreiberwerte unverändert:82,036000USD/UTC-Tag,88,845364USD kumulativ,0,081400USD Reserve,81,400000USD Sicherheitsmaximum500D+500R/U0.

## Gesicherte Belege und Fortsetzung

Messfall: `/workspace/helmut-parallel-20261015/wave20-resource-integration/attempt-68f480265d50`.

- `CONTROLLER_COMPLETE.SAFE.json`: Gesamtfalse und Originalvergleich; gepinnter Gesamtressourcenbericht89.351B/SHA256`54128a466f23d2f3de1e228c7e20ad4d004d14156b4a2966d1596eb48801c10c`.
- [Korrigierte sichere Ergebnisaggregation](/workspace/helmut-ram-preparation-20261019/FINAL_SINGLE_ATTEMPT_OUTCOME_V2.SAFE.json):9.106B/SHA256`9331f4fe8356f00267717c4c9af803b419bd87e234e3e8a6c3c3b704351bdf87`, einschließlich Byte-/SHA-Pins aller gelesenen Originalberichte.
- [Unabhängiger vorhandener Ressourcenbeleg-Abgleich](/workspace/helmut-ram-preparation-20261019/FINAL_RESOURCE_RECEIPT_AUDIT.SAFE.json) und [terminaler Einheitenabgleich](/workspace/helmut-ram-preparation-20261019/FINAL_TERMINAL_UNIT_AUDIT.SAFE.json): reine Quellenprüfung, keine neue Modell-/Production-Endabnahme.
- [RAM-Kurve aus vorhandenen Zwischenständen](/workspace/helmut-ram-preparation-20261019/FINAL_ACTUAL_RAM_CURVE_V2.png), SVG gleichen Namens. Keine nachträglich erfundenen Messpunkte.

Im selben Chat gezielt fortsetzen: Originalfehler und nativen Endzustand am tatsächlichen Fehlerpfad verlustfrei sichern; danach die nun belegte gemeinsame RAM-Überschreitung und letzte Unit60-Verfehlung am vorhandenen Verlauf bearbeiten. Keine allgemeine neue Optimierungsrunde, kein W49/W50-Replay. Funktions-/Zeit-/RAM-Gesamtabnahme und500MB-Puffer bleiben offen. Jede spätere Vollausführung braucht neue konkrete Fall-/Tages-/Code-/Zeit-/Original-/Storagebindung, unabhängige Annahme soweit geändert, alle32 frischen Bedingungen und ein neues ausdrückliches vollständiges500er-GO. V9 und alle früheren Freigaben bleiben verbraucht. Keine Production-/Lösch-/Merge-/Deployment-/Migrationsaktion.
