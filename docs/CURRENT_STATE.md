# CURRENT STATE — Helmut

## W15: End500-Funktion unabhängig PASS (01.11.2026)

[Run41325430429](https://github.com/ernisch/helmut-pilot/actions/runs/41325430429), [PR1013](https://github.com/ernisch/helmut-pilot/pull/1013), Code `f157d97ff3990a71623e7037437556dfcc8b48e6`: vollständige Same-Run-v4-Abnahme unter [HC1](betrieb/w15-end500-host-functional-20261101.md) **PASS**. Job1.356s/gemeinsamer Lauf1.333,674s. 15Cipherteile/12Originale(242.570.240B), Restore500/0,500Auth/6.000Usage/3.501Postimages, Export, finale0, Stopp und vollständiger verschlüsselter Sicherungsrundlauf einschließlich authentifizierter Rücklesung/zweiterRecoveryintegrität bestätigt.

Peak5,103GB bei frisch berechnetem13,320GB-Limit, Hostreserve2,147GB geschützt, Swap/OOM/Max0. Peak zuerst bei backup-recovery beobachtet; file-Max4,582GB/anon1,309GB/kernel148MB, getrennte Maxima. Exakte Peakkomposition/CPU/AnbietereignungUNKNOWN; Prozess-PSS nur Untergrenzen. Keine reguläre5GB-/Production-/Mockabnahme oder Optimierung. Ein verschlüsseltes532,7MB-Artefakt/<1Tag;0aktive geschützte Läufe. AusführungsbranchF157 unverändert; CI41312283046/41315935455PASS.

NeueNonceb3710fb5-378d-4d9c-88a6-83702cbdb0ea, eine Linkrunde/einPOST,284s Restgültigkeit/50.644Bytes. Frühere519-Linkrunde bleibtBLOCKED ohneJob; Run41300846909 bleibtFAIL. Belege: `/workspace/helmut-w15-private-evidence-20261101/HOST_FUNCTIONAL_OUTER_02/`. Mock-Funktionstor erkennt diese v4-Abnahme an; eigene aktuelle Kopf-/Eingabebrücke und eigenesGO bleiben Pflicht. Keine automatische Mock-/Production-Ausführung.

## Ressourcen500-Messung und geprüfter Diagnoseanschluss (31.10.2026)

[Run 41239213884](https://github.com/ernisch/helmut-pilot/actions/runs/41239213884), d56e97b3: **FAIL**, 383,989 s; Diagnose-GO verbraucht. 500 gleichzeitig aktiv vor 96 lokalen KI-Antworten belegt; vollständiger Ergebnisabschluss/finale Profilflags 0 UNKNOWN, Prozesse gestoppt. Kein formaler Mock500-1.500-/8.000-Nachweis.

| Gruppe | Kernel-Peak B | CPU-s | Befund bis Abbruch |
| --- | ---: | ---: | --- |
| App einschließlich Treiber | 408.981.504 | 166,158 | unter Laborlimit im Teilabschnitt |
| PostgreSQL + PostgREST + SQL-Messclients | 948.191.232 | 217,695 | Laborlimit erreicht, max 38 |
| Testwerkzeuge / Simulatoren | 450.027.520 | 61,225 | separat im Parent |
| Gemeinsamer Parent | 1.756.499.968 | 445,078 | kein belegter 5-GB-Engpass |

Swap/OOM 0; Verbindungssample 6/60; letzter gültiger Hostreservewert 14.578.847.744 B. DB-file-Maximum 597.323.776 B einschließlich Shared Memory, anon 331.218.944 B; Maxima nicht addieren. Alte innere Operation/Peakzusammensetzung/Prozessanteile UNKNOWN. 948.191.232 B ist historisches Micro-OS-MemTotal, kein bewiesenes Hartlimit; gehostetes PostgreSQL-/PostgREST-Gemeinschaftsbudget UNKNOWN.

**PR1004/b4b3afea qualifiziert:** erster Speicherfehlersnapshot unveränderlich; atomarer SAFE-Fortschritt erhält Phase/Operation und bestätigte Zähler ohne Workerabschluss. Fehler-/SIGKILL-Proben, [Pflicht-CI41241981900](https://github.com/ernisch/helmut-pilot/actions/runs/41241981900) und unabhängiger Code-/Dreierreview PASS; 3 Profile/12 Quellen/finale0. [Messbilanz](betrieb/w15-db-memory-diagnosis-20261031.md).

Diagnosegrenzen unverändert: App1.999.998.976 B, DB948.191.232 B/60Verbindungen, Parent4.999.999.488 B, Hostreserve2.147.483.648 B, Swap/OOM/Max0,1.800s,512MiB freie Platte. Offizieller Mock-v2-Vertrag separat:2.048.000.000 B hart/Peak1.638.400.000 B/Reserve409.600.000 B. [Vorheriger Stand bytegleich](archive/project_state/2026_10_31_b4b3afea_CURRENT_STATE_vor_Mockstarttorpruefung.md); keine historischen FAILs umgewertet.

## Getrennte Ressourcenmessung vorbereitet, Vertrag noch inaktiv (31.10.2026)

Der [Referenzvertrag](betrieb/w15-separated-resource-metering-20261031.md) aus PR992/993/1003 bleibt **inaktiv** (helmut-w15-separated-resources/1). Komponentenmessung und numerische Verbindungsbilanz sind vorbereitet; Anbieterparität, echte Reserven und vollständige500erLastfähigkeit UNKNOWN. Laborannahmen aktivieren keinen offiziellen Vertrag. Bestehende Wächter, historische FAILs und getrennte Startfreigaben bleiben verbindlich.

## Aktueller Entscheidungsstand: Anbieter-RAM und End500 (31.10.2026)

**Oberstes Ziel:** Belastbarer Production-Nachweis für exakt 500 gleichzeitig aktive synthetische Profile, 1.500 vollständige Ergebnisse und 8.000 Sicherheitskontrollen. End500, Mock500 und Production sind getrennte Abnahmen; keine aktuelle Production-500-Abnahme.

**Aktueller End500-Diagnosebefund:** [GitHub Run 41208876552](https://github.com/ernisch/helmut-pilot/actions/runs/41208876552) auf `123bbd06850f0687ada26265d6e0e1b7d1fad787` ist **Gesamtlauf FAIL**, jedoch **Verarbeitung nachgewiesen**: 500 Auth-CAS, 6.000 Usagezeilen, 3.501 native Postimages, 0 aktive Profile, Export und bestätigter Stopp. Sicherung, authentifizierte entfernte Rücklesung und zweite Rücksicherung sind nicht bestätigt. Kernel-Lebenszeitpeak **3.132.653.568 B** bei **4.999.999.488 B hartem End500-Diagnoselimit**; Swap/OOM/Max **0/0/0**, Bereinigung **8/8 PASS**. **Kein RAM-Limit-Fail dieses Diagnoselaufs.** Die ursprüngliche Sicherungsfehlerursache bleibt UNKNOWN; der separat reproduzierte private Gateway-Dateirechtefehler (0644 statt 0600) ist auf [PR #1002](https://github.com/ernisch/helmut-pilot/pull/1002), Kopf `56ae2a68f2b3e3de6ae5fff878c3e9e7f50e0549`, synthetisch korrigiert, unabhängig geprüft; [Pflicht-CI 41211894017](https://github.com/ernisch/helmut-pilot/actions/runs/41211894017) PASS. Noch kein neuer Originalnachweis mit diesem Fix.

**Die fünf GB wurden bereits umgesetzt**, und zwar in dem ausdrücklich getrennten Diagnosemodus `end500-full-capacity-diagnostic` über den **gesamten** isolierten Ablauf. Die früheren 2.048.000.000 B sind dabei nur historisches Vergleichskriterium und keine Abbruchgrenze. Das reguläre **phasengetrennte** End500-Verarbeitungskriterium bleibt bis zu einer ausdrücklich genehmigten, geprüften Vertragsänderung bei einem zulässigen Peak von 2.048.000.000 B, der reguläre Mock500-Verarbeitungspeak bei 1.638.400.000 B. Nach nachweislich bestandenem Verarbeitungsabschluss sind für die Sicherung bis 4.999.999.488 B hart vorgesehen. Keine frühere RAM-Abnahme rückwirkend bestanden; Mock500 (historischer Abbruch nach 69 Units) weiter BLOCKED.

**Anbietergetrennte Production-Basis und ihre Beleggrenzen:**

| Bereich | Bisher belegte Basis | Was ist noch NICHT bewiesen? |
| --- | --- | --- |
| Vercel Anwendung | 2 GB Standard **je Funktionsinstanz**, 1 vCPU, laut Betreiberbefund 30.10.2026 und [PR #992](https://github.com/ernisch/helmut-pilot/pull/992). Das verbundene Projekt `helmut-pilot` ist lesbar. | Aktuell effektive Byte-Hartgrenze und peak RAM **je echter Funktionsinstanz bei Last von 500 Profilen**, Instanzparallelität, CPU und Laufzeit sind nicht als Lastnachweis belegt. |
| Supabase Datenbank | Micro 1 GB inklusive System-/Dienstanteilen laut früherem Dashboardbeleg und Supabase-Dokumentation; verbundene Datenbank am 31.10.2026 erreichbar. Rein lesend aktuell: `max_connections=60`, `shared_buffers=256 MiB`, `work_mem=3500 kB`. | Aktuelle vollständige RAM/CPU-Last bei 500 Profilen, Poolbelegung, freie Verbindungen und tatsächliches Byte-Limit der Micro-Instanz sind nicht als 500er Nachweis belegt. |
| Isoliertes GitHub W15 | Gemeinsamer Kernel-Parent umfasst zusätzlich Orchestrator, Empfang, Datenbankkopien, Dateicache, Archivierung, Verschlüsselung, Rücklesung und Rücksicherung. | **3,13 GB gemeinsamer Peak ist nicht der Vercel-Peak und nicht der Supabase-Peak.** Daraus folgt weder ein Überschreiten von 2 GB je Vercel-Funktion noch, dass diese zwei GB ausreichen. |

**Entscheidung zu 2 GB:** Angemessenheit für 500 Profile ist **UNKNOWN**, nicht PASS und nicht automatisch FAIL. Keine unbelegte Erhöhung auf 4 GB und keine Gleichsetzung der getrennten Anbieterressourcen mit einer gemeinsamen 2- oder 3-GB-Grenze. Messung ist grundsätzlich möglich: Vercel stellt `vercel.function_invocation.peak_memory_mb` für Funktionen bereit; Supabase bietet Datenbank-Ressourcenberichte und eine authentifizierte Metrics API. Aktuelle Produktionsmetriken ohne entsprechenden 500er Lastlauf beweisen jedoch **keine** 500er Kapazität. Die Vercel-Metrikabfrage lieferte in dieser Prüfung keinen verwertbaren Messwert (API 400), die Supabase-SQL-Konfigurationswerte sind keine RAM-Verbrauchsmessung. Keine neue Infrastruktur-/Monitoringaktivierung oder Production-Last allein dafür.

**Kürzester sicherer Weg:** Den vorhandenen Entwurf zur **getrennten Ressourcenabnahme** aus [PR #993](https://github.com/ernisch/helmut-pilot/pull/993) und die belegte Basis aus PR #992 als Ausgangspunkt verwenden. Vor Änderung des Prüfvertrags genaue Komponenten-/Prozesszuordnung, reale Anbieter-Hartlimits und Einheiten, begründete Reserven, CPU- und DB-Verbindungslimits klären. Danach minimal die Anbieterbudgets je Instanz bzw. Datenbank in der isolierten Mock500-Umgebung gesondert erzwingen und messen; Testwerkzeuge/Backup getrennt erfassen und einen gemeinsamen Hostschutz behalten. Nur nach ausdrücklicher Freigabe des neuen Vertrags umstellen; bestehende historische FAILs bleiben. Keine unerforderlichen erneuten Original-Restores. Der gezielte Backupfix in PR1002 bleibt unabhängig vom noch offenen regulären RAM- und Mock500-Nachweis. Ein echter Production-Test benötigt eigene Kosten- und Aktivierungsfreigaben.

**Historie:** Die früheren W15- und Kalenderberichte sind [bytegleich archiviert](archive/project_state/2026_10_31_b289fe5e_CURRENT_STATE_vor_groessenkorrektur.md). Datierte Altbefunde überschreiben nicht den neueren Entscheidungsstand; historische FAILs und alle Originalbelege bleiben erhalten.

---


## Übernommene W15-Belege und offene Abnahme

Elf Mock-Zusatzoriginale sind mit Run41037459441 auf13b858b1 vollständig bestätigt:
217.563.454Bytes, Größen/Hashes/Manifest/GPG/Rücklesung PASS, Replacements-Pin geschlossen.
Keine neue Inventur, Beschaffung oder Qualifikation. Der spätere Mockjob empfängt
sein erhaltenes Cipherarchiv mit passendem eigenem GO.
[Empfangsbeleg](betrieb/w15-mock-original-reception-20261030.md).
Der erfolgreiche Empfang der zwölf End500-Originale40876458074 und die native
Minimalprobe40982718647 bleiben übernommen; keine Wiederholung.

Mock500-Controller/Atomic12ACK/Tages-/Namespacebindung, Auswertung und Sicherungsanschlüsse
sind vorbereitet und gesperrt. Positive End500-Gesamtabnahme, Kopfbindung und konkretes
Mock-GO fehlen; der historische RAM-v2-Fehler nach69Units bleibt FAIL/UNKNOWN.
Historische Restore-FAILs, damalige Fehlerphasen, Ressourcen und frühere Dateiblocker
bleiben im bytegleichen Archiv erhalten; daraus entsteht keine neue Laufberechtigung.
[Historische W15-Berichte](archive/project_state/2026_10_31_b289fe5e_CURRENT_STATE_vor_groessenkorrektur.md).

## Vollständiges Root-Paket und Caller-Vorbereitung (13.10.2026)

Branch `codex/starttor-full-packet-optin-20261013` auf ungemergtem PR907: Die vollständige500er-Fixture hat1.529.110Paketbytes und überschritt den1-MiB-Transportdeckel. Nur der exakte v3-Paketversionsheader wählt jetzt2MiB; Versionsabweichung/Übergröße schließen vor Originaldaten. Default1MiB, Original4MiB, Gesamt8MiB, vierGETs,20s/8KiB sowie alle Fach-/Betriebstore bleiben erhalten. SQL weiterhin inert mit sechs NULLs/noGrant. Lokal5 physische Transport-/Verbrauchergruppen,8 echte netzlose PG17.6-,11 Verbraucher-,16 vorhandene Transport- und38 Auswahlprüfungen bestanden. Der neue physische Fall ergänzt die bisherigen Komponentenbelege; keine echte Runtime- oder500er-Abnahme. [Dossier](betrieb/starttor-full-packet-optin-20261013.md).

Aktueller offizieller Cloud-Beleg73/73, sieben konfigurierte Secrets/fünf Variablen ready, Netzwerk enforced; CRON_SECRET fehlt. Neue reine Rollenmetadaten bestätigen Authenticator8s und keinen Service-Role-Override; nominal passender dokumentierter REST-Default, keine globale Änderung empfohlen. Tatsächlicher Caller-/Cache-/vorStatement-Beleg bleibt offen. Source-/Metadatenabnahme und neue Head-CI noch erforderlich. Keine neue Operator-Anfrage, Installation, Staging, Merge, Aktivierung oder bezahlter500er-Lauf.

## Erhaltener freigegebener Abschluss

UTC13-Tagesbuch einmal angelegt:35 Bücher/Kapazität35, EU-Limit82,036000USD, damalige Kosten/Baseline/Zähler0. Historische34 Bücher/5000Usage und übrige Bestände erhalten;46 unabhängige tatsächliche Delta-Prüfungen PASS. Auftragsbindung7,445364USD inklusive0,636000USD privater Reserve; runDayUTC null, kein500er-Funding. [Voriger Umfang](betrieb/starttor-native-reader-source-20261013.md).

[Draft-PR907](https://github.com/ernisch/helmut-pilot/pull/907), Headc0d0bd48, unabhängig akzeptiert; Pflicht-CI38334575016 mit175+330Suiten, nativen Schritten undZ22 grün. [PR906](https://github.com/ernisch/helmut-pilot/pull/906), Head2b6fbfe7, ebenfalls unabhängig geprüft/Pflicht-CI38317468800 grün. Beide ungemergt. Statischer tatsächlicher Composite-Dictionary und unverändertes unfreigegebenes Kandidatenfenster erhalten; finaler Commandhash/Fit erst mit echten frischen Laufbelegen. Kein neuer Initializer-Aufruf oder neue Finanzierung.

Historische Deployment- und Read-only-Beobachtungen vom12.10. sind [wortgleich archiviert](archive/project_state/2026_10_28_historischer_Deployment_und_RO_Beleg_20261012.md); sie sind keine aktuellen Production-Belege.

## Kalenderfix im Entwicklungsbranch (historische Vorbereitung 12.10.2026)

Die strukturelle Datumsbindung trennt B2-Aufnahmetag und tatsächliches EU-Fenster;
Original-/Merkle-/Profil-/Quellenbindungen und alle Schutzprüfungen bleiben erhalten.
Codekopf556ba54d wurde mit Pflicht-CI38218238617 und unabhängigen Prüfungen qualifiziert.
Dies ist kein frischer Production-/500er-Nachweis und keine Merge-/Rolloutfreigabe.
Vollständige ursprüngliche Kalender-, Original- und Runtime-Befunde vom12.10. sind
[bytegleich archiviert](archive/project_state/2026_10_31_b289fe5e_CURRENT_STATE_vor_groessenkorrektur.md).
[Kalender-/Originalvertrag](betrieb/blocker2-d-integration-historische-uebergabe-20261011.md).

## Blocker-Kurzstand

- **Blocker 3 (EU-Servicekostenvertrag) geschlossen, PR901 gemergt:** laut Übergabe und Rollout/Git bestätigt. Gültiger Vertrag: exakt 82,036000 USD/UTC-Tag; 88,845364 USD kumulativ desselben Auftrags; 0,081400 USD Reserve nur für künftige EU-Tickets; 81,400000 USD absolutes Sicherheitsmaximum für genau 500 D + 500 R/U0. Modellbereitstellung `gpt-5-mini-eu`, DataZoneStandard, Sweden Central, 9 h aktiv + 30 min Endbeleg. Der EU-GO vom 11.10. und die damaligen Teilschritte (Umsetzung lokal, Rollout bis Abnahme gesperrt, gemeinsamer Hash, lokal 6 EU / 26 Geld / 64 End / 12 Runtime / Routen) bleiben **historisch** und sind nicht der aktuelle Vertragsstand. Die früheren 6-/7-USD-Grenzen sind **nicht** der aktuelle EU-Vertrag. [Vertrag/Prüfung](betrieb/blocker3-eu-servicekostenvertrag-umsetzung-20261011.md).
- **Blocker 2 (geschlossen, Abschluss 11.10.2026):** [Run 38102593796](https://github.com/ernisch/helmut-pilot/actions/runs/38102593796), Workflow/Runtime `6cdaa1cd3cdf16b9e5d18cb9add267583a730292`: 500/500 fachlich angenommen, alle 180397 aktuellen Claimpositionen und 4000 individuellen Kriterienurteile positiv, alle 42 Pflichtbindungen erhalten; frische unabhängige Endprüfung und Root-Abnahme positiv; verschlüsselte Serverbank vollständig frisch rückgelesen/verifiziert (2026-10-11T04:18:30.484466+00:00). KZW-Original erhalten und gesperrt, alte Relation UNKNOWN archiviert, eigene NWZ-Alternative gebunden. Kein Aktivierungs- oder bezahlter 500er-Funktionstestnachweis. [Vollbelege und Grenzen](betrieb/blocker2-abschluss-20261011.md). Zahlen sind der übergebene Abschluss, keine neue DB-Messung dieser Sitzung.
- **Blocker 4 (geschlossen, Endsteuerung abgenommen 07.10., 11:19:02 UTC):** Persistenter 30s-Cron lebt; Authentifizierung, Frist und Notstopp produktiv mit 0→0, Rückführung 500/499→0 nur isoliert belegt. Profil-/Auth-/Hauptdaten unverändert; Pro High akzeptiert. Ersetzt historische Hinweise „lebender Wächter offen“. Konkretes Testfenster vorbereitet, ungebunden. Keine Aktivierung/500er-Test. [Dossier](betrieb/blocker4-endsteuerung-20261007.md).
- **Blocker 1 (geschlossen; technisch abgenommen 07.10.):** PR846 gemergt und ausgerollt; unabhängige Prüfung und Pflicht-CI grün. Authentifizierter GET auf das gebundene READY-Deployment `53e1e369` ergab HTTP405/`Allow: POST` vor Datenbank- und Motorzugriff; direkter Motorweg für exakt 500 synthetische Profile technisch abgenommen, kein 500er-Test, keine Aktivierung oder Modellaufrufe. **Der frühere Satz „Quellen-, Kosten- und Test-GO-Tore bleiben offen“ beschreibt den alten Stand vom 07.10.**; aktuell bleiben für einen Lauf eine frische Laufbindung und ein Test-GO erforderlich. [Abnahme](betrieb/blocker1-direkter-500er-motor-20261007.md).
- **Begrenzter B2→D-Integrationssprint (11.10., abgeschlossen laut Übergabe):** Gemeinsame Ursache der 32 leeren Kontexte belegt (vorhandene Quellen außerhalb der 14 Tage). Übergabevertrag als PR899 gemergt, Runtime `1ad00cd4` auf Production READY `dpl_76HSdbWhPMaDRJzQqQ1GsrGx3wcE`; Pflicht-CI 168+330 Suiten grün, identischer Git-Tree; lokal exakt 500/500 gültige, nichtleere Kontexte am tatsächlichen Sendercode (468 normal, 32 historisch); verlustfreier 500er Drafttransport und feste Original-/Merklebindung belegt. Keine neue B2-Fachabnahme, Installation, Aktivierung, Productiondaten-/Konfigurations-/Budgetänderung oder Modellaufrufe. Der vollständige Production-Senderabnahmeweg bleibt an der Command-/Installations-/Aktivierungsgrenze offen. [Vertrag und Abnahmegrenze](betrieb/blocker2-d-integration-historische-uebergabe-20261011.md).
- **Blocker-2-Vorlauf (historisch, 10./11.10.):** Data13, 499er-Fachabnahme, Brake-Ereignisvergleich, leere Publikationsauswahl und Freigabegrenze: [Data13-Dossier](betrieb/blocker2-data13-und-aktuelle-500er-fachabnahme-20261010.md), [Stern-/499er-Dossier](betrieb/blocker2-stern-originalminimum-und-499er-fachabnahme-20261010.md), [Publikationsauswahl](betrieb/blocker2-publikationsauswahl-und-freigabegrenze-20261011.md). Originale, alte Eingaben und Einzelurteile bleiben erhalten.
- **Blocker-2-Historie vor V8 (historisch):** [wortgleich archiviert](archive/project_state/2026_10_10_CURRENT_STATE_vor_blocker2_v8_ausfuehrung.md); von Run 38036221630 getrennt.
- **Betreiberentscheidung Native-D (07.10., historisch):** zurückgestellt bis Helmut funktional fertig UND 500er-Nachweis erfolgreich; aktuell keine Voraussetzung für Production, Motor oder 500er-Test. Ersetzt alte Starttorhinweise. [Wortlaut](archive/project_state/2026_10_07_CURRENT_STATE_vor_blocker1_komprimierung.md).
- **Native-D-Diagnose (07.10., historisch, zurückgestellt):** 500 synthetisch/0 aktiv (330/120/50), Journal 58; nicht installiert. Pooler 5432 am TCP-Proxy abgewiesen; HTTPS RO. [Zugang](betrieb/pre500-native-zugangswege-20261007.md).
- **Guard-Capture behoben (07.10., 06:10 UTC; historisch):** V3-Guard, 52 Relationen / 372067 Zeilen, Native-D nicht installiert, mehrere Installations-/Schutzpunkte offen. [Belege und nächster Schritt](betrieb/pre500-guard-capture-20261007.md).
- **U-Vorbereitung (06.10., historisch):** [Originale/Rückweg](betrieb/gebundene-u-vorbereitung-cron-ruhe-20261006.md), [Kostenplan](betrieb/blocker3-kosten-zeitplan-20261007.md).
- **W-Zusatzquellen (06.10., Codeentwurf, historisch):** Runtime-DTO, Quellvollständigkeit und Zulassungstore erhalten; vollständige Native-W-/Caller-/Root-Abnahme und 500er-Start offen.
- **Native Katalogbindung (06.10.; historisch):** genau ein freigegebener RO-Abruf, semantische Gleichheit zum privaten Original, fünf physische Wartungsfelder ausgenommen; keine Installation, 0 Daten-/Schemaänderungen.
- **Supabase-Plattformgrenze und Audit-Diagnose (05.10.; historisch):** [Umfang und Beleggrenzen](betrieb/supabase-plattformgrenze-audit-20261005.md).
- **500 Synthetikprofile inaktiv importiert (05.10.; historisch):** 501 Identitäten / 500 Mandate / 0 aktiv; [Beleggrenzen](betrieb/synthetik-500-inaktiver-import-20261005.md).
- **Historische inerte Synthetikruntime (01.10.):** [Erhaltener Vollstand](archive/project_state/2026_10_06_CURRENT_STATE_inerte_runtime.md).
- **Prozessaltlasttor erledigt (historisch):** drei alte `process_runs` nativ auf failed/operatorcleanupabandoned; Rückweg vor Anwendung neu binden. [Details](betrieb/synthetischer-500er-auftrag-20261001.md).
- **Kostentage (05.10., historisch):** zwei Nullbücher; vollständige Statuszeile im [Kostenplan](betrieb/blocker3-kosten-zeitplan-20261007.md).
- **Synthetikpaket und 20s-Transport (PR #762, historisch):** [Generator](../lib/helmut/synthetik-500-profile.js); kein 500er-Nachweis.
- **Synthetikbrücken (PR #763, historisch):** Import 43/43, Runtime 11/11 offline + 11/11 PostgreSQL, Realregression 36/36, Nachweis 64/64 grün; kleine SQL-Fixtures beweisen keine Vollbestandsperformance.
- **Historischer V7-/Decoderstand (02.10.):** [Unveränderte Einzelbefunde](archive/project_state/2026_10_05_CURRENT_STATE_historische_transporte.md).
- **Historische Betreibersteuerung (01.10.2026):** [Synthetikauftrag](betrieb/synthetischer-500er-auftrag-20261001.md) — Verteilung 330/120/50, keine Realpersonen umbenennen; der alte Azure-`GlobalStandard`-Befund ist überholt (aktuell `gpt-5-mini-eu`, DataZoneStandard).
- **Historischer Production-Befund (01.10.):** [Einzelbefunde](archive/project_state/2026_10_05_CURRENT_STATE_historische_transporte.md).
- **Merge-/CI-Stand (02.10., historisch):** [PR #769](https://github.com/ernisch/helmut-pilot/pull/769), Merge `484a74ee`; datierter Befund, keine 500er-Freigabe.
- **Begrenzte Cutover-Korrektur (01.10.2026, historisch):** Code-/Offline-Absicherung, kein ausgeführter Production-Cutover.
- **Historische Deployments:** PR #725/#724/#722/#723/#699 (28.–30.09.); kein Beleg für die synthetische Zielkohorte.
- **Wiederaufnahme 04.10.2026 (historisch, rein lesend):** [Belegzusammenfassung](betrieb/source23-closed-tuples-20261004.md).
- **Vorbereitung 06.10.2026 (historisch):** `noPaidModel:true` nach PR #828; keine Wiederholung des Pakets.
- **Aktuelle Berliner Artikel (06.10., lokal, historisch):** sechs amtliche Artikel im kanonischen Offline-Weg; kein Quellenimport oder 500er-Nachweis.
- **Historische Import-/Realkohortenvorbereitung (29./30.09.):** [unverändert archiviert](archive/project_state/2026_10_06_CURRENT_STATE_vor_pr829_komprimierung.md).
- **Zulassung:** AfD-zugehörige Abgeordnete ausgeschlossen; Partei und Fraktion vor jedem Import amtlich prüfen. [Testvertrag](betrieb/bundestag-landtage-testvertrag-20260927.md), [Zulassungscode](../lib/helmut/profil-zulassung.js).
- **Landesversorgung:** Berlin-/Brandenburg-Pfade offline geprüft. [PARDOK-Vertrag](quellenarchitektur/17-pardok-parser.md), [Brandenburg](betrieb/landesversorgung-brandenburg-20260928.md), [Berlin](betrieb/landesversorgung-berlin-20260928.md), [Quellenzeile](betrieb/berlin-senat-quellenzeile-vorbereitung-20260928.md).
- **Berlin/Brandenburg-Teilnachweis (30.09.2026, historisch):** nur Teilnachweis, kein 500er-Test.
- **Radar-Ursprungsbindung (29.09.2026, historisch):** fünf Suiten lokal grün; kein produktiver Funktionsnachweis.
- **Historische Nachrichtenqualität / lokale Bereichsabnahme:** [archiviert](archive/project_state/2026_10_10_CURRENT_STATE_vor_blocker2_v8_ausfuehrung.md).

## Starttor und Schutzgrenzen

**Realkohorten-Endweg (historisch, 01.10.):** [Vollständige Vorarbeit](archive/project_state/2026_10_07_realkohorten_endweg_historisch.md). Aktueller Wächter siehe Blocker 4.

**Runtime (01.10.2026, inert installiert, historisch):** End-RPCs vorhanden, Endwächter vorbereitet; Manifest, Nullbestandsbelege, lebender Wächter und Aktivierungs-GO bleiben Pflicht. Bei unbekanntem Schreibausgang: Stop, lesende Klärung, kein Retry. [CLI-/Journalzuordnung](betrieb/synthetischer-500er-auftrag-20261001.md).

Aktueller technischer 500er-Nachweis: **synthetische Profile für Bundestag, Berlin und Brandenburg**; die weiteren 14 Landesparlamente folgen danach. Alle 500 fiktiven Profile brauchen vorab festgelegte Szenarioparameter, die richtige Mandatsebene und Erwartungen; keine amtlichen Personenbelege für fiktive Profile erfinden. [Synthetikauftrag](betrieb/synthetischer-500er-auftrag-20261001.md), [Roadmap](ROADMAP_BIS_500.md).

Vor Aktivierung müssen Paketbindung, aktuelle Ebenen-/Landesversorgung bis in die sichtbare Ausgabe, Kosten-/Zeitplan, Testfenster und Endwächter belegt sein. **Aktivierung und eigentlicher 500er-Test brauchen danach ein gesondertes Betreiber-GO; kein Test ist freigegeben oder durchgeführt.** Der Test bilanziert bei exakt 500 gleichzeitig aktiven Profilen 1500 Positionen (500 Mandatsbriefings, 500 Morgenbriefings, 500 Lage-Ergebnisse), weist fehlende, leere, doppelte, unbrauchbare und technisch fehlerhafte Positionen getrennt aus und belegt Qualität, Gesamtzeit, Gesamtkosten, automatisches Ende und Rückweg auf 0 aktive Profile. Frühere kleinere oder unvollständige Läufe ersetzen das nicht. [Sicherheitsrahmen](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md), [Betriebsplan](betrieb/500-betriebsplan-2026-09-20.md).

Für die aktuelle Vorbereitung erlaubt der Betreiber gezielte Entwicklung, lokale Tests, eigenen Branch, Commit, Push und PR. **Merge und Production-Änderungen sind ausdrücklich nicht freigegeben.** Migrationen, Production-Daten-/Profil-/Konfigurations-/Budgetänderungen und bezahlte Modellaufrufe brauchen ausdrückliches GO; Aktivierung und 500er-Test sind nicht freigegeben. **Maßgeblich für die EU-Route ist der Blocker3-Vertrag** (82,036000 USD/UTC-Tag; 88,845364 USD kumulativ desselben Auftrags; 0,081400 USD Reserve; 81,400000 USD Sicherheitsmaximum für 500 D + 500 R/U0); die alten 6/7-USD-Grenzen sind ausdrücklich kein EU-Vertrag. **Codex Cloud:** Modell und Denkstufe wählt der Betreiber; Sol führt, DeepSeek übernimmt klar abgegrenzte Arbeit nach AGENTS.md; diese Nutzung ist vom Production-Anbieterbudget getrennt. Production-Konfiguration, Migrationen, Cron- und Profilschutz vor Wirkung frisch lesen; historische Flags oder alte Profilzahlen sind keine Freigabe. [Autonomer Auftrag](betrieb/autonom-bis-500-starttor-20260926.md), [Production-Beweisprotokoll](betrieb/production_beweisprotokoll.md).

## Arbeitssteuerung

Codex Cloud ist der direkte Arbeitsweg zum 500er-Starttor; Modell und Denkstufe wählt der Betreiber, das Repository setzt keinen Standard. Der geprüfte Cloud Router ist aktiv: Sol führt, DeepSeek übernimmt abgegrenzte Arbeit nach AGENTS.md. Es gibt keine zeitabhängige Peak-Sperre; Entwicklungsarbeit darf jederzeit starten. Production-Schutzgrenzen, das gesonderte GO vor Aktivierung/500er-Test und die Production-Kostenlimits bleiben unverändert. Parallele Schreibarbeit nur in klar getrennten Bereichen; bei Überschneidung nacheinander.

## Nächster notwendiger Schritt

**Erlaubten Merge/Rollout des Datumsfixes abwarten; danach endgültige Lauf-/Commandbindung und frische Startprüfung, anschließend genau ein separates Test-GO.** Originalübergabe und zeitpunktgebundener Runtime-Nachweis sind übernommen. Kein Test ist freigegeben oder durchgeführt. Profilaktivierung, Commandinstallation, Journalmutation und bezahlte Calls bleiben gesperrt. Der geschlossene B2→D-Abschluss wird nicht erneut fachlich gemessen.

Die Production-Vorbereitung bleibt rein lesend: Nach READY auf dem erlaubten Datumsfix müssen Startschutz, aktuelle Kostenbücher, EU-Route,0aktive Profile, ruhende Facharbeit und lebender Endwächter frisch belegt werden. Finale Operation,Command,Sollplan,Kalender und Deployment müssen dieselben Originaleingaben binden. **Vorher kein empfohlenes Test-GO.** Keine automatische Datumsverschiebung. Es folgt genau **eine GO-Vorlage**, noch keine Freigabe; darin werden erst die erlaubten Schutzbindungen/Installation/Aktivierung konkret.

Die500 Zielkennungen stimmen mit dem kanonischen Paket überein (IDs-SHA256 `4d6d7b169831128cc69f0f3beb04c2fe05b57b7b4f528934b52e5c155f54e258`); Pakethash `aa79ae64ab76bb96b3190eea1352366cffe2d448d4c28d5407da480096d52cc5` entspricht der nativen Importquittung. Alle1500 Sollpositionen sind originaleingabe-/quellengebunden, finale Lauf-/Commandbindung noch offen. Alter U-Marker vom06.10. bleibt `unknown` mit `inFlight`; kein aktueller Lauf/Entlastungsbeleg,private Reserve erhalten,kein Retry. Aktuelle Operationsspitze ist separat eine abgelaufene unbeanspruchte U-Installation ohne Versuch; ein neuer DR-Command muss ihren Originalvorgänger nach dem bestehenden Vertrag exakt binden, keine Journalbereinigung.

Im 500er-Test sind alle 500 Profile vollständig zu prüfen: 1500 Sollpositionen (500 Mandatsbriefings, 500 Morgenbriefings, 500 Lage-Ergebnisse); fehlende, leere, doppelte, unbrauchbare und technisch fehlerhafte Positionen getrennt ausweisen; Qualität, Kosten, Laufzeit, automatisches Ende und Rückweg auf 0 aktive Profile belegen; die vorab definierten Erwartungen gelten; die Endabnahme erfolgt unabhängig vom ausführenden Lauf. Blocker1–4 sind laut Übergabe geschlossen; erledigte Nachweise nicht wiederholen — auch kein B1/B2/B3/B4-Re-Test.

Die Dokumentationskorrektur ist in den notwendigen Kalenderfix-Branch integriert; kein separater Dokumentations-PR. Merge und Production-Rollout bleiben gesperrt. Archive und historischer Belegwert bleiben erhalten; keine frischen DB-Zahlen oder Kosten erfinden, die jetzt nicht gelesen wurden. [Integrationsvertrag](betrieb/blocker2-d-integration-historische-uebergabe-20261011.md), [Blocker2-Abschluss](betrieb/blocker2-abschluss-20261011.md), [EU-Kostenvertrag/Blocker3](betrieb/blocker3-eu-servicekostenvertrag-umsetzung-20261011.md).

Historische Läufe, frühere Kostenstände und erledigte Zwischenentscheidungen: [Archivfassung vom 28.09.](archive/project_state/2026_09_28_CURRENT_STATE_vor_komprimierung.md). Andere Aufgaben nach dem 500er-Nachweis: [Datenmotor-Restliste](datenmotor-restliste.md).
