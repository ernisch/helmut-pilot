# Helmut: Production Ressourcenbasis und einheitliche Messlogik

**Stand:** 30.10.2026. Dokumentierter Istzustand und vorgeschlagener Weg, **kein geaenderter oder freigegebener End500/Mock500 Pruefvertrag**. Grundlage fuer den kuerzesten sicheren Weg zum 500er Nachweis. Alle Werte haben eine Quelle bzw. eine markierte Aussagegrenze.

## Aktuell bestaetigte Kapazitaeten

| Komponente | Konfiguration | RAM | CPU | Beleg / Gueltigkeit |
| --- | --- | --- | --- | --- |
| Vercel `helmut-pilot` | Standard, Pro | **2 GB je Funktionsinstanz**, laut Betreiber aktuell | **1 vCPU pro Standardinstanz** gemaess Vercel Produktdokumentation | Betreiber bestaetigt 2 GB am 30.10.; offizielle Funktionsgroessen: https://vercel.com/docs/functions/configuring-functions/memory. Kein gemessener Verbrauch |
| Supabase `ernisch's Project`, `eu-west-1` | **Micro**, Pro | **1 GB Compute Instanz**, einschliesslich Systemanteilen | **Shared CPU**, keine garantierten exklusiven Kerne | Betreiber Dashboard Screenshot 30.10. und verbundene Projektdaten; https://supabase.com/docs/guides/platform/compute-and-disk |
| Supabase spaeter optional | **Small**, aktuell NICHT gebucht | **2 GB Compute Instanz** | Shared CPU | Supabase Produktdokumentation; kein Upgrade beschlossen oder freigegeben |

Weitere Produktionsbelege: Vercel Funktionsregion `fra1` (Frankfurt), Node.js 24 und damalige konfigurierte maximale Dauer 300 Sekunden sind aus der frueheren Betreiberpruefung vom 15.10.2026 uebernommen, **nicht am 30.10. unabhaengig neu ausgelesen**. Region ist fuer Netzlatenz zur Supabase Datenbank in `eu-west-1` (Irland) relevant.

Am 30.10.2026 rein lesend direkt in der Supabase Datenbank nachgewiesen: `max_connections=60`, `shared_buffers=32768 * 8kB = 256 MiB`, `work_mem=3500 kB`, `max_parallel_workers=2`. Dies sind PostgreSQL Konfigurationsparameter, **keine Messungen der aktuellen Last oder frei verfuegbaren Serverkapazitaet**.

Keine CPU Modellierung aus `shared` als feste Zahl dedizierter CPUs ableiten. Vercel und Supabase sind getrennte Laufzeitumgebungen. Ein Funktionslimit ist **pro Instanz**, nicht pro 500 Profile; die tatsaechliche Anzahl paralleler Instanzen und DB Verbindungen ist separat nachzuweisen. Fuer exakte Grenzvergleiche vor Implementierung Klaerung der Anbieter Einheiten GB/MB versus GiB/MiB und des realen Kernel Limits; keine lautlose Umdeutung der Zahlen in Bytes.

## Derzeit im W15 Code verwendete gemeinsame RAM Pruefung

| Stufe | Harte Grenze | Maximaler Peak | Geforderte Reserve |
| --- | ---: | ---: | ---: |
| End500 / Full Restore | 2.560.000.000 Bytes | 2.048.000.000 Bytes | 512.000.000 Bytes |
| Mock500 v2 | 2.048.000.000 Bytes | 1.638.400.000 Bytes | 409.600.000 Bytes |

Die Werte messen in GitHub gemeinsame Prozesse inklusive Orchestrator, Datenbank und Sicherungen; sie sind **weder** das reale Vercel Limit **noch** das reale Supabase Limit. Der volle Restore [Run 41073062264](https://github.com/ernisch/helmut-pilot/actions/runs/41073062264) bleibt FAIL: beobachteter gemeinsamer Peak 2.048.073.728 Bytes; 73.728 Bytes ueber der End500 Grenze. Keine nachtraegliche PASS Umschreibung.

PR [#990](https://github.com/ernisch/helmut-pilot/pull/990) enthaelt optionale Kernelkategorien nach Fehlern; PR [#991](https://github.com/ernisch/helmut-pilot/pull/991) bereitet eine optionale Prozessrollenaufteilung vor. Beide sind kein in echte Produktion isolierter Ressourcenlasttest; Prozess PSS und Kernel Dateicache duerfen nicht addiert werden. Bereits bestandene Tests nicht wiederholen.

## Empfohlene einheitliche, realitaetsnahe Messarchitektur

1. **Ein kanonischer Ressourcenvertrag** als Version/Quelle fuer beide Teststufen. Je Komponente identische Einheiten, Methode, Reservepolitik, Fehlerschema und Quelle. End500 und Mock500 pruefen dieselben Komponenten gleich; ihr Funktionsumfang und ihr gesondertes GO bleiben verschieden. Bei fehlender Komponentenisolation UNKNOWN statt falschem PASS.
2. **Datenbank Micro isolieren:** PostgreSQL und nachweislich zur Micro Compute Instanz gehoerende Dienste innerhalb eines eigenen geeigneten Budget/CPU Bereichs modellieren. Das 1 GB Budget umfasst Betriebssystem und Dienstantteile, es sind nicht 1 GB nur fuer den Datenbankprozess. Supabase geteilte CPU, I/O Grenzen, reale 60 Connections und Regionslatenz separat betrachten. Keine Behauptung einer hardwaregleichen Simulation.
3. **Helmut Anwendung isolieren:** denselben Production relevanten Node/Runtime Code mit eigenem Budget fuer **2 GB pro modellierter Vercel Instanz** und entsprechendem 1 vCPU Ziel ausfuehren. Anzahl und tatsaechliche Gleichzeitigkeit der Instanzen explizit messen, ebenso Laufzeit pro Aufruf. Eine gemeinsame 2 GB Obergrenze ueber alle Instanzen waere falsch.
4. **Testtechnik separat:** Orchestrator, GitHub Runner, Backup, GPG, Archiv, Cache und Kontrollwerkzeuge getrennt bilanzieren. Der Host braucht ausreichend RAM auch dafuer, aber Testwerkzeuge zaehlen nicht zur Vercel Funktion oder Supabase DB. Ein eigener Sicherheitswaechter fuer den Host bleibt aktiv.
5. **Pruefnachweis:** getrennte Limits tatsaechlich erzwingen, aktuelle Werte und Peaks einschliesslich CPU, Verbindungen, Zeit, Swap und OOM pro Kategorie belegen. Echte 500 gleichzeitig aktive synthetische Profile und alle 1500 vorgesehenen Ergebnisse/8000 Sicherheitskontrollen nur dort als PASS ausweisen, wo sie tatsaechlich abgenommen wurden. Ein lokal simulierter PASS ist **keine** erfolgreiche Production Abnahme.

**Wichtig fuer die Umsetzung:** Nicht blind `--cpus 2` fuer Supabase festschreiben, denn Shared CPU und GitHub CPU sind nicht identisch. Kein reiner PSS Bericht als beweisender eigener RAM Cap. Jede Zuordnung von Diensten zur Anbieter Grenze pruefen, insbesondere PostgREST, Supabase Auth und Vercel Hintergrundarbeiten. Die Simulation muss die reale Datenbanklast, Speicherbelegung, Verbindungslast und Vorgangsparallelitaet abbilden.

## Freigabe und naechste Schritte

Erst rein lesend vorhandene Belege, W15 Ressourcenwaechter, PR #990/#991 und moegliche weitere Production Daten vergleichen. Danach den kleinsten sicheren, lokal entwickelbaren geteilten Ressourcenvertrag mit exakten Einheiten, begrenztem Aenderungsumfang, gezielten synthetischen Tests und nachvollziehbaren PASS/FAIL/UNKNOWN Regeln vorlegen. **Noch keine aktive Aenderung der freigegebenen Speichergrenzen**, kein echtes Original oder 500er GO, kein Production Upgrade, kein Merge/Deployment. Bestehende Sicherheitsreserven und historische Fehlschlaege bleiben gueltig, bis ein neuer Vertragsentwurf konkret genehmigt und erfolgreich geprueft ist. Der Weg darf die kurzfristige Restore und 500er Vorbereitung nicht grundlos aufhalten.
