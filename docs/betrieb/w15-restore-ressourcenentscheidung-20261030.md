# Einheitlicher Ressourcenvertrag für End500 und Mock500 — Entwurf

Stand: 30.10.2026. **DRAFT, numerische Freigabe BLOCKED.** Ein gemeinsamer
Vertragsentwurf für beide Stufen, keine aktivierte Konfiguration. Keine
Productionänderung, kein neuer Originallauf und kein geänderter Altvertrag.
Die zuvor vorgeschlagenen pauschalen Testwerte 2.000.000.000/1.000.000.000 Bytes
und daraus berechnete Komponentenreserven werden nicht übernommen.

## Verbindliche Ressourcenbasis und Einheiten

Quelle: PR [#992](https://github.com/ernisch/helmut-pilot/pull/992), Commit
`7c2a9edd33d410b03da29f67710a8f9ebe380010`,
[`helmut-production-speicherbasis-20261030.md`](https://github.com/ernisch/helmut-pilot/blob/7c2a9edd33d410b03da29f67710a8f9ebe380010/docs/betrieb/helmut-production-speicherbasis-20261030.md).

| Bereich | Verbindliche Basis | Exaktes Hartlimit in Bytes |
| --- | --- | --- |
| Anwendung | Vercel Standard: 2 GB RAM und 1 vCPU **je Funktionsinstanz** | UNKNOWN: konkrete Standardgrößen-Einheit nicht bis auf Bytes belegt |
| Datenbank | Supabase Micro: 1 GB RAM einschließlich System-/Dienstanteilen, Shared CPU | UNKNOWN: GB/GiB der konkreten Microgröße nicht belegt |
| Verbindungen | Tatsächlich nachgewiesenes `max_connections=60` | 60 insgesamt, keine Zusage von 60 freien Appverbindungen |
| Testwerkzeuge | Orchestrator, Testtreiber, GPG, Sicherung, Kontrollen | Separat messen; bestehender gemeinsamer Hostschutz bleibt |

Supabase Small/2 GB ist ausschließlich eine spätere Option, kein Bestandteil
dieses Vertrags. Keine pauschale Addition zu einem gemeinsamen „3-GB-Budget“.

Gezielt gelesene offizielle Quellen:

- [Vercel Memory](https://vercel.com/docs/functions/configuring-functions/memory.md):
  „By default, on Pro and Enterprise, functions execute with 2 GB (1 vCPU)
  of memory.“ Keine exakte Byteumrechnung der Standardgröße.
- [Vercel Build Output API](https://vercel.com/docs/build-output-api/primitives.md):
  „Amount of memory (RAM in MB) that will be allocated to the Vercel Function.“
  Das Konfigurationsfeld allein belegt weder Standard=2048 noch MB=MiB.
  Die MiB-Definition eines anderen Elastic-Zuweisungsfeldes wird nicht auf
  diesen Standardinstanztyp übertragen.
- [Supabase Compute](https://supabase.com/docs/guides/platform/compute-and-disk.md):
  Micro = Shared/1 GB, DB-Verbindungen 60; Pooler-Clients und Poolgröße sind
  andere Größen und ersetzen das DB-Maximum nicht. Keine GB/GiB-Definition
  für Micro. Eine gezielte zusätzliche Dokumentensuche ergab keinen Bytebeleg.

Die vorhandene rein lesende Vercel-Projektkonfiguration bestätigt zusätzlich
`fluid=true` und `functionDefaultMemoryType=standard`, liefert aber kein
numerisches Bytefeld. Keine Umdeutung von GB in 10⁹ oder 2³⁰ Bytes. Die
Einheitensuche wird ohne neuen konkreten Hinweis nicht wiederholt.

Ein bereits vorhandener, authentifizierter und ausschließlich lesender
[Supabase-Metrics-Anschluss](https://supabase.com/docs/guides/platform/metrics.md)
lieferte am30.10.2026 um17:59:47UTC:

| OS-Kapazitätsmetrik | Tatsächlicher Wert | Aussagegrenze |
| --- | ---: | --- |
| `node_memory_MemTotal_bytes` | 948.191.232 B | Vom OS nutzbarer physischer RAM, kein `memory.max`-Beleg |
| `node_memory_SwapTotal_bytes` | 1.073.737.728 B | Konfigurierte Swapkapazität, kein Nachweis von Swapnutzung |

Damit ist ein exakter aktueller Micro-OS-Kapazitätswert vorhanden. Er wird
weder als nominelle GB/GiB-Definition noch als freier oder tatsächlich
verbrauchter Speicher ausgegeben. `CommitLimit` und virtueller Adressraum
sind keine zusätzlichen physischen RAM-Budgets. Keine neue Ressource,
Konfiguration, Testausführung oder periodische Abfrage eingerichtet.

## Ein einziger vorgeschlagener Vertrag

Vorgeschlagene Versionskennung `helmut-w15-separated-resources/1`, noch nicht
im ausführbaren Code angelegt. End500 und Mock500 verwenden dieselben
Komponentendefinitionen, Einheiten, Reserveberechnung und Fehlersignale.

1. **Anwendung je modellierter Instanz:** belegtes Anbieter-Hartlimit `L_app`
   in Bytes und 1-vCPU-Quota tatsächlich erzwingen. Kernel-Lebenszeitpeak,
   aktueller Verbrauch, Swap, OOM, CPU-Zeit und Drosselung je Instanz erfassen.
   Tatsächliche Instanzzahl und gleichzeitig laufende Aufrufe dokumentieren.
   500 aktive Profile bedeuten weder 500 Funktionen noch 500 DB-Verbindungen.
2. **DB-Bereich:** belegtes Micro-Hartlimit `L_db` in Bytes für PostgreSQL
   einschließlich der korrekt zugeordneten System-/Dienstanteile erzwingen.
   Reine PostgreSQL-PSS ist kein Beleg für die ganze Microinstanz. Shared CPU
   bleibt Shared CPU; keine erfundene exklusive Kernzahl oder hardwaregleiche
   Simulation. Fehlende Dienst-/Systemanteile ergeben UNKNOWN.
3. **Verbindungen und Parallelität:** Grenze 60 für den gesamten DB-Server
   einschließlich Admin-/Dienst-/reservierter Verbindungen berücksichtigen.
   Spitzen aller tatsächlichen Sessions, Poolbelegung, wartende Anfragen und
   Testparallelität erfassen. Bestehenden PostgREST-Pool 3 nicht automatisch
   erhöhen. Pro Function/Instanz gebildete Pools gemeinsam bilanzieren.
4. **DB-Konfiguration:** bestätigte `shared_buffers=256 MiB`, `work_mem=3500 kB`
   und `max_parallel_workers=2` aus PR992 binden oder Abweichung ausdrücklich
   ausweisen. `work_mem` ist pro Sort-/Hashoperation und kann je Verbindung
   und Parallelworker mehrfach anfallen; nicht als gesamtes DB-Budget behandeln.
   Der alte lokale Restore setzt 32MB: keine Micro-Äquivalenz behaupten.
5. **Testwerkzeuge:** bestehende Orchestrator-, Empfangs-, GPG-, Sicherungs-
   und Kontrollprozesse separat messen. PID/Startzeit-/Parentbindung aus PR991
   wiederverwenden. Läuft Appcode und Testtreiber im selben PID, ist der reine
   Appanteil UNKNOWN; kein nachträgliches Herausrechnen geschätzter Bytes.
6. **Gemeinsamer Host:** alle Kinder einschließlich Empfang, Exporte, Sicherung,
   entferntem Readback und Rücksicherung bleiben im vorhandenen gemeinsamen
   Lebenszeitnachweis. Keine neuen Hostkapazitäten, kein Cacheabzug, kein
   Peakreset, kein Ausblenden von Hilfsprozessen. Ein gemeinsamer neuer
   Hostschutz ist anhand der tatsächlich vorhandenen Runnerkapazität und
   begründeter Hostreserve festzulegen, nicht durch Addition von Anbieterlimits.
   Seine numerische Bindung ist derzeit ebenfalls UNKNOWN.

**Notwendige ausdrückliche Vertragsänderung:** Nach Genehmigung und Umsetzung
soll dieser eine Komponentenvertrag die unterschiedlichen bisherigen v2-/v3-
Gesamt-RAM-Kriterien als Productionvergleich ersetzen. Der gemeinsame
Kernel-Lebenszeitnachweis bleibt als eigener Hostschutz erhalten. Historische
FAILs werden nicht neu bewertet. Vor Genehmigung bleiben sämtliche bisherigen
Parentlimits und Reserven unverändert aktiv. Die neue Hostgrenze darf nicht
automatisch aus „2+1 GB“ entstehen oder zur Fortsetzung eines Fehlers erhöht
werden. Ohne ihre konkret belegte und genehmigte numerische Bindung ist der
neue Vertrag nicht ausführbar.

Dienstzuordnung, insbesondere PostgREST und Auth, muss anhand tatsächlicher
Productionzuständigkeit erfolgen. Ein nicht nachgebauter Supabasedienst gilt
nicht als kostenlos oder als null Bytes. Ein einzelner GitHub-Container mit
allen Rollen und einer gemeinsamen RAM-Grenze erfüllt die neue getrennte
Komponentenbegrenzung nicht.

## Sicherheitsreserven begründet bestimmen

Für jede Komponente gilt `zulässigerPeak_i = L_i - R_i`; `L_i`, `R_i` und
alle Vergleiche müssen vor Aktivierung ganzzahlig und eindeutig in Bytes
gebunden sein. Swap0 und OOM=0 bleiben Pflicht.

**Numerische Komponentenreserven sind derzeit UNKNOWN.** Die früheren
20 Prozent sind ein vereinbarter gemeinsamer Testpuffer, kein gemessener
Nachweis von 20 Prozent erforderlichem oder ausreichendem Puffer je Vercel-
und Microinstanz. Sie werden nicht automatisch als neue Komponentenreserven
eingesetzt. Aus 73.728 Bytes Überschreitung folgt ebenfalls keine Reserve.

Kleinste belastbare Herleitung verwendet vorhandene Messwerkzeuge:

- Vollständige, eindeutig zugeordnete Komponentenmessung einschließlich der
  tatsächlichen System-/Dienstanteile zuerst herstellen. PSS ist nur ergänzende
  Diagnose; dieselben Seiten nicht zusätzlich zur Cgroupabrechnung summieren.
- Den notwendigen Puffer als obere Schranke für zusätzlichen Speicher zwischen
  letzter akzeptierter Messung und bestätigtem Stillstand bestimmen. Dazu
  gehören begrenzte gleichzeitig mögliche Allokationen während Messintervall
  und Abbruch sowie belegte, im Modell fehlende Anbieter-/Dienstanteile.
- Ein kleiner synthetischer Signal-/Abbruchfall darf den vorhandenen
  Mess-/Stopanschluss qualifizieren. Ein beobachtetes Maximum daraus ist keine
  garantierte obere Schranke für einen vollständigen 500er Lauf. Notwendige
  Schranken müssen aus vorhandenen Puffer-/Parallelitätsbindungen oder
  passenden Lastbelegen folgen. Unbekannte/überlappende Anteile nicht frei
  schätzen, verdoppeln oder mit einem beliebigen Prozentaufschlag verdecken.

Damit bleiben `R_app`, `R_db`, die Hostreserve und die zulässigen Peaks offen, bis
sie nachvollziehbar hergeleitet und ausdrücklich genehmigt sind. Keine
Pseudopräzision aus einem historischen Gesamtspeicherwert.

## Übernommene Entwicklung und notwendige technische Änderungen

PR [#990](https://github.com/ernisch/helmut-pilot/pull/990), Kopf
`3e61ebf3b1e0b4958251dd316050b173be3c5f1d`, Pflicht-CI 41076869470 PASS:
begrenzte Kernelkategorien nach Fehlern und Erhalt des ersten Fehlers.
PR [#991](https://github.com/ernisch/helmut-pilot/pull/991), Kopf
`12edede7b694041206c8a98882c040cf4185c526`, Pflicht-CI 41085493346 PASS:
optionale noch nicht angeschlossene Rollen-/PSS-Messung. Erfolgreiche Tests
werden nicht wiederholt; aus der nicht abgenommenen numerischen SAFE-Quittung
der vorhandenen 32-MiB-Probe werden keine Werte erfunden.

Notwendiger begrenzter Änderungsumfang; vor numerischer Freigabe ausschließlich
Vorbereitung und erforderliche kleine synthetische Qualifikation unter den
unveränderten Altgrenzen, keine Aktivierung neuer Limits:

1. Eine kanonische Vertragsdatei; bestehende Kontext-/Quellen-/Approvalbindungen
   und beide Controller lesen dieselbe Version. Kein paralleler neuer Controller.
2. Tatsächliche getrennte Begrenzung/Identitätsprüfung im vorhandenen Runner
   und seinen vorhandenen Container-/Prozessanschlüssen. Eine reine PSS-Tabelle
   ersetzt keine erzwungenen Limits. Vorhandene Watch-/Stop-/Backupkette erhalten.
3. Begrenzte Rollen-/Kernelbeobachtung aus PR990/991 anschließen; CPU-, Instanz-
   und gesamte DB-Verbindungsbelege ergänzen. Keine private Ausgabe/Artefakte.
4. Nur geänderte Bindungen, Zuordnung, Grenzfälle und Erstfehler/Stop synthetisch
   prüfen; erforderliche CI und unabhängige Abnahme auf dem tatsächlichen Kopf.

Die Umsetzung ist umfangreicher als ein kleiner belegter Restorefix. Sie
erlaubt weder eine Grenzlockerung noch eine Wiederholung erfolgreicher
Original-/Quellenprüfungen. Bestehende fachliche End500-/Mock500-Anforderungen,
Auth30/Unit60/Provider20, Sicherung, Rückweg und getrennte GO bleiben erhalten.

## Restorebefund, Vorrang und Freigabegrenze

[Vollrestore 41073062264](https://github.com/ernisch/helmut-pilot/actions/runs/41073062264)
auf `537adaa323337518e5ba294e2647bfe084f520c1` bleibt FAIL. Am ersten abgelehnten
Readback: Peak 2.048.073.728 B, aktuell 2.047.098.880 B, Reserve 511.926.272 B,
Swap0; Überschreitung 73.728 B. Alle acht Bereinigungen PASS; endgültiger
Post-Cleanup-Peak UNKNOWN. PostgreSQL, Hilfsprozesse, Sicherung und Dateicache
bleiben als Verursacher UNKNOWN. Laut exakt gebundenem Restorecode laufen
kein Helmut-Appserver und kein PostgREST-Dienst; das beweist keine gemessenen
Nullbytes für Appdateien, Node-Wrapper oder Cache. Kein speichersenkender Fix
bewiesen; keine Optimierung auf Verdacht durchgeführt.

| Weiterhin aktiver Altvertrag | Hart | Peak höchstens | Reserve mindestens |
| --- | ---: | ---: | ---: |
| Restore / End500 v3 | 2.560.000.000 B | 2.048.000.000 B | 512.000.000 B |
| Mock500 v2 | 2.048.000.000 B | 1.638.400.000 B | 409.600.000 B |

Die bestehende Restorearbeit hat Vorrang. Diese neue Productionvergleichs-
abnahme ist **keine neue Startvoraussetzung des alten Vertrags** und darf
unabhängige Restorearbeiten nicht blockieren. Sie erklärt oder repariert die
historische Überschreitung nicht. Vorhandene erfolgreiche Restore-/Export-
diagnose 41049571965 und Elf-Dateien-Annahme 41037459441 bleiben übernommen.

**Für einen vollständig numerischen, freigabefähigen neuen Vertrag fehlen
genau:** die konkreten Anbieter-Hartlimits samt Einheit für Standard/Micro,
begründete Komponentenreserven einschließlich System-/Dienstzuordnung und
die gemeinsame neue Hostschutzbindung anhand vorhandener Runnerressourcen.
Der kleinste Einheitenbeleg ist ein bereits vorhandener rein lesender
Konfigurations-/Runtimebeleg je Anbieter mit Kapazitätswert UND zugehöriger
Einheit. Ohne diesen Beleg werden keine Zahlen erfunden und keine neuen
Ressourcen oder Originalläufe zur Klärung gestartet.

Diese Fassung ist zur Prüfung der Methode und des Änderungsumfangs vorgelegt,
**noch kein GO für neue numerische Limits oder einen vollständigen Lauf**.
Erst fehlende Werte belegen, Vertrag ausdrücklich genehmigen, technisch
umsetzen und unabhängig prüfen. Danach getrennte konkrete Ausführungsfreigabe.
Keine Productionänderung, neuer Originallauf, Merge, Deployment, Modellkosten
oder zusätzliche Infrastruktur durch diese Vorlage.
