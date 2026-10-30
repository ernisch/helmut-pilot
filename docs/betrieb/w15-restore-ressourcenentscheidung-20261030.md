# W15: Restoreursache und Entscheidung zum Ressourcenvertrag

Stand: 30.10.2026. Rein lesende Auswertung vorhandener Belege; **kein
Ursachenfix, kein neuer Prüfvertrag und keine Ausführungsfreigabe**.

## Belastbarer Befund

[Vollrestore 41073062264](https://github.com/ernisch/helmut-pilot/actions/runs/41073062264)
auf `537adaa323337518e5ba294e2647bfe084f520c1` bleibt FAIL. Beim ersten
abgelehnten Readback: gemeinsamer Peak 2.048.073.728 Bytes, aktuell
2.047.098.880 Bytes, Reserve am Peak 511.926.272 Bytes, Swap0. Überschreitung
der Peakgrenze und Unterschreitung der Reserve jeweils 73.728 Bytes. Alle acht
Bereinigungsprüfungen PASS. Der endgültige Peak nach Bereinigung wurde nicht
separat erfasst. Die innere Abbruchphase und einzelne Speicheranteile fehlen.

| Verursacher | Was tatsächlich belegt ist | Tatsächliche Bytes dieses Laufs |
| --- | --- | --- |
| Laufender Helmut-Appserver | Im exakt gebundenen Restorecodepfad nicht gestartet | UNKNOWN; keine gemessene Null behaupten |
| Laufender PostgREST-Dienst | Im Restorecodepfad nicht gestartet; Binärdatei nur vorbereitet | UNKNOWN; Datei-/Cachekosten nicht ausgeschlossen |
| PostgreSQL und native DB-Werkzeuge | Bestandteil des freigegebenen Pfads; Phase am Abbruch unbekannt | UNKNOWN |
| Python-/Node-Hilfsprozesse, GPG, Empfang und Sicherung | Bestandteil des Pfads; Node-Wrapper sind kein Helmut-Appserver | UNKNOWN |
| Dateicache / Kernelanteile | Historische Quittung enthält keine `memory.stat`-Aufteilung | UNKNOWN |

Die beiden Ausschlüsse folgen aus dem gebundenen öffentlichen Codefluss,
nicht aus einer nachträglichen Prozessmessung. `restore_workflow.run_worker`
ruft `forward.main` nur für `end500-full-gated` auf; dieser Run war
`end500-restore-gated` und verwendet `restore_only`. `prepare_same_job`,
`runtime_cache.stage_cache`, `forward.prepare` und `runtime_materialization`
kopieren und prüfen die App/Binärdateien. Primärrestore und zweite Rücksicherung
starten PostgreSQL und feste Node-Wrapper für fünf Restore- und vier
Exportaktionen. Der spätere Artefakttransport verwendet offizielle
GitHub-Action-Bundles, keinen Helmut-Server. Appdateien und Node-Binärdateien
können trotzdem Dateicache belegen.

Die bereits vorhandenen unabhängigen Reviews in
[`belege/w15-full-restore-result-20261030/`](belege/w15-full-restore-result-20261030/)
belegen begrenzte Kopier-/Hashschleifen, aber keinen unbegrenzten Heap-Read von
Original- oder Dumpdateien. Gewollte Kopien und Integritätsscans sind kein
nachgewiesener Fehler. Weder Cacheverwerfung noch eine PostgreSQL-Optimierung
ist durch den historischen Fehlerbeleg begründet. Die geringe Überschreitung
ist auch keine Prognose, wie viel Speicher ein späterer Gesamtlauf benötigt.

## Vorhandene Entwicklung übernehmen

- PR [#990](https://github.com/ernisch/helmut-pilot/pull/990),
  `3e61ebf3b1e0b4958251dd316050b173be3c5f1d`: begrenzte numerische
  Kernelkategorien nach einem Fehler, bestehender Erstfehler bleibt erhalten;
  Pflicht-CI 41076869470 erfolgreich. Synthetischer 32-MiB-Probenstep laut
  Metadaten erfolgreich; seine numerische SAFE-Quittung wurde nicht abgenommen.
  Keine erfundenen Cachewerte daraus ableiten und die Probe nicht wiederholen.
- PR [#991](https://github.com/ernisch/helmut-pilot/pull/991),
  `12edede7b694041206c8a98882c040cf4185c526`: optionale, noch nicht angeschlossene
  Rollen-/PSS-Beobachtung; Pflicht-CI 41085493346 erfolgreich. PID/Startzeitbindung,
  UNKNOWN bei unvollständigen Angaben, keine Addition von PSS und Dateicache.
  PSS ist eine Diagnose und kein erzwungenes Komponentenlimit.
- Die Originaldiagnose 41049571965 mit fünf Restoreschritten, vier Exporten,
  500/0 und Peak 1.644.433.408 Bytes bleibt übernommen. Keine Vollsicherungs-
  oder Rücksicherungsabnahme daraus ableiten. Der bestätigte Elf-Dateien-Empfang
  41037459441 bleibt ebenfalls übernommen; keine neue Beschaffung nötig.

## Production-Basis und unveränderte Abnahme

Quelle: PR [#992](https://github.com/ernisch/helmut-pilot/pull/992), exakt
`7c2a9edd33d410b03da29f67710a8f9ebe380010`,
[`helmut-production-speicherbasis-20261030.md`](https://github.com/ernisch/helmut-pilot/blob/7c2a9edd33d410b03da29f67710a8f9ebe380010/docs/betrieb/helmut-production-speicherbasis-20261030.md).
Keine neue Production-Abfrage durchgeführt.

| Bereich | Bestätigte Production-Basis | Bedeutung für einen einheitlichen Vertrag |
| --- | --- | --- |
| Helmut/Vercel | 2 GB und 1 vCPU je Funktionsinstanz | Instanzzahl und Parallelität ausdrücklich binden, kein Gesamtbudget je 500 Profile |
| Supabase Micro | 1 GB einschließlich System/Diensten, Shared CPU | DB-Prozess allein bildet die Instanz nicht ab; keine garantierte dedizierte CPU annehmen |
| DB-Verbindungen | `max_connections=60` | Gesamtes Verbindungsmaximum einschließlich Dienste und Reservierungen beachten; keine 500 Direktverbindungen ableiten |
| Testwerkzeuge | Kein Vercel-/Supabase-Prozess | Orchestrator, GPG, Sicherung und Kontrollen separat zuordnen; gemeinsamer Hostschutz bleibt |

Production-SQL-Einstellungen laut PR992: `shared_buffers=256 MiB`,
`work_mem=3500 kB`, `max_parallel_workers=2`. Der gebundene lokale
Restore setzt dagegen `work_mem=32MB`; damit ist keine Micro-äquivalente
DB-Konfiguration belegt. Diese Abweichung ist **kein Beweis der Fehlerursache**
und wird hier nicht geändert. Die genaue Anbieterumrechnung GB/MB nach Bytes
ist laut PR992 offen. Supabase Small bleibt eine nicht freigegebene Option.

| Weiterhin gültiger gemeinsamer Testvertrag | Hart | Peak höchstens | Reserve mindestens |
| --- | ---: | ---: | ---: |
| Restore / End500 v3 | 2.560.000.000 B | 2.048.000.000 B | 512.000.000 B |
| Mock500 v2 | 2.048.000.000 B | 1.638.400.000 B | 409.600.000 B |

Swap0, Zeit-/Platten-/Kostenverträge und alle fachlichen Abnahmen bleiben
unverändert. Weder 2+1 GB noch die Addition einzelner PSS-Werte ersetzt den
gemeinsamen Kernel-Lebenszeitpeak. Ein höheres Parentlimit, der Wechsel von
Mock v2 auf v3 oder das Herausrechnen von Cache wäre eine andere Abnahme.

## Entscheidung und Aufwand

**Keine spekulative Speicheroptimierung und keine Lockerung des gemeinsamen
Vertrags.** Eine konkrete kleine Fehlerbehebung wäre schneller als eine
Neufassung aller Ressourcenbindungen; bislang ist jedoch kein solcher Fehler
nachgewiesen. Daher wurde kein Code geändert und kein bestandener Test erneut
ausgeführt. Ein weiterer vollständiger Originallauf ohne neue Unterscheidung
wäre kein begründeter nächster Schritt.

Für den verlangten Vergleich mit Vercel und Micro ist eine **zusätzliche,
ausdrücklich genehmigte Komponentenabnahme notwendig**: Der heutige gemeinsame
Parent kann diese beiden getrennten Production-Grenzen logisch nicht beweisen.
Das bedeutet nicht, dass eine Grenzänderung den bisherigen Restorefehler löst.
Bei unverändertem Parent kann derselbe gemeinsame Fehler weiterhin auftreten.
Eine Umstellung wäre umfangreicher als ein kleiner Fix: Dienstzuordnung,
tatsächlich erzwungene Teilbudgets und CPU-/Verbindungsbelege müssten in die
bestehenden strikten Kontext-, Quellen-, Freigabe- und Controllerbindungen
übernommen werden. Das erfolgt nicht stillschweigend und rechtfertigt keine
neue Diagnosearchitektur oder neue Infrastruktur.

Diese zusätzliche Production-Vergleichsabnahme ist **keine neue
Startvoraussetzung** des bestehenden Restore-/End500-/Mock500-Vertrags;
ihre Vorbereitung darf dessen unabhängige Arbeiten nicht blockieren.

## Konkrete Entscheidungsvorlage — noch nicht genehmigt

Freigabe ausschließlich zur Entwicklung und gezielten synthetischen Prüfung
eines ergänzenden Komponentenvertrags auf Basis von PR990/991/992:

1. Konservativ ausdrücklich gesetzte **Testwerte**, keine behauptete
   Anbieterumrechnung: Anwendung je modellierter Instanz hart 2.000.000.000 B,
   Peak höchstens 1.600.000.000 B, Reserve mindestens 400.000.000 B, 1 vCPU.
   DB-Bereich hart 1.000.000.000 B, Peak höchstens 800.000.000 B,
   Reserve mindestens 200.000.000 B; nur mit ausgewiesenen System-/Dienstanteilen.
   Für beide 20 Prozent Reserve und Swap0. Anbieter-Bytes bleiben unbekannt,
   bis belegt; keine Gleichheitsbehauptung mit Production.
2. Identische Komponentenmethode für End500 und Mock500, tatsächliche Instanz-
   und Verbindungszahlen sowie vollständige Lebenszeitpeaks erfassen. Micro
   bleibt Shared CPU; 60 ist das gesamte konfigurierte Verbindungsmaximum,
   keine Zusage von 60 frei verfügbaren Appverbindungen. Dienst-/Betriebssystem-
   anteile und nicht abbildbare CPU-/Latenzeigenschaften ausdrücklich UNKNOWN.
3. **Beide bisherigen gemeinsamen Parentverträge samt Reserven bleiben zusätzlich
   verbindlich.** Testwerkzeuge zählen zum Host, werden keiner Vercelinstanz
   zugeschlagen und erhalten kein neues unbeschränktes Budget. Kein Cacheabzug,
   keine Peakzurücksetzung und keine frei erfundene Summe zur Production.
4. Fehlende Isolation, Zuordnung oder Messung ergibt UNKNOWN statt PASS.
   Kein Umbau, der die kurzfristige Restorearbeit unnötig verzögert; bei einem
   belegten kleinen Fix zuerst diesen umsetzen. Kein Productionkontakt, Upgrade,
   neue Ressource, Modellaufruf, Original-/End500-/Mock500-Lauf, Merge/Deployment
   durch diese Entwicklungsfreigabe. Kein zusätzlicher Speicherkauf.

Dies ist eine explizite Entscheidung über zusätzliche Prüflimits und Semantik,
**kein bereits geprüfter neuer ausführbarer Restorekandidat**. Ohne Zustimmung
bleibt der gegenwärtige Ressourcenvertrag aktiv. Nach Zustimmung erst begrenzt
implementieren, gezielt prüfen, Pflicht-CI und unabhängigen Review des tatsächlichen
Kopfs abschließen; erst dann eine passende begründete echte Ausführung vorlegen.

Offen für den vollständigen 500er Nachweis bleiben tatsächliche RAM-Zuordnung
beim Vollrestore, konsistente Vollsicherung, authentifizierte entfernte
Rücklesung und zweite Rücksicherung. End500 benötigt deren positive Abnahme und
eigenes GO. Mock500 benötigt danach die positive End500-Abnahme, eine tatsächlich
gebundene Bridge, eigenen Lauf-/Zeit-/RAM-Vertrag und separates GO. Vorhandene
Quellenqualifikation und Originalempfang werden nicht wiederholt.
