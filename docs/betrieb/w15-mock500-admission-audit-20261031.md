# Gesamtsprint: formaler Mock500-Start bleibt gesperrt

Stand: 31.10.2026 UTC. Geprüfte Codebasis
`b4b3afeae5b128c85b40854cebcea6a01a844918`, PR #1004.
Dieser Bericht und die Statuskorrektur enthalten keine Ausführungsautorität.

## Ergebnis und unverbrauchte Freigabe

Der Betreiber erteilt genau einen vollständigen isolierten Mock500 nur bei
nachweislich erfüllten Startbedingungen. Zusätzliche End500-Originalversuche,
Ressourcen500-Diagnosen, Vertragsänderungen und Production sind ausdrücklich
nicht davon umfasst. **Kein Workflowdispatch, keine neuen Links, keine neue
Laufnonce und kein verbrauchter Mockversuch.** Das bedingte Mock-GO bleibt
ungenutzt. Fehlende Voraussetzungen werden nicht durch erfundene PASS-Felder,
geänderte Grenzwerte oder einen anderen Testmodus ersetzt.

## Gesamtbewertung anhand bestehender Belege

PASS gilt jeweils nur für den ausdrücklich benannten Umfang. UNKNOWN ist kein
bestandener Lastnachweis und FAIL wird durch spätere Codequalifikation nicht
rückwirkend umgewertet.

| Bereich | Status | Tatsächlicher Beleg und Grenze |
| --- | --- | --- |
| 1. Helmut-App: RAM, CPU, Laufzeiten, Fehler | **UNKNOWN** für vollständige 500er Last | Ressourcenlauf 41239213884: App einschließlich Treiber 408.981.504 B, 166,158 CPU-s im abgebrochenen Abschnitt. Reine App-/Vercel-Instanzlast, vollständige Laufzeiten und Fehlerbilanz aller 500 bleiben UNKNOWN. Native Dreierprobe auf B4 PASS. |
| 2. PostgreSQL/PostgREST | **FAIL gegen Laborwächter**, Anbieterlast UNKNOWN | 948.191.232 B erreicht, 38 max-Ereignisse, OOM/Swap 0; CPU 217,695 s, höchster Verbindungssample 6/60. PG-/PGR-Einzelanteile und exakter Verbindungspeak UNKNOWN. |
| 3. Werkzeuge/gemeinsamer Runner | **PASS im gemessenen Teilumfang**, vollständiger Mock UNKNOWN | Werkzeuge 450.027.520 B/61,225 CPU-s; gemeinsamer Peak 1.756.499.968 B bei 4.999.999.488 B hart. Kein belegter Hostengpass; endgültige Ressourcenbilanz eines vollständigen Mocklaufs fehlt. |
| 4. Tatsächliche Anbieterbudgets und Prüfvertrag | **PASS für bestätigte Konfiguration**, vollständiger Vertrag/Parität UNKNOWN | Vercel Standard 2 GB/1 vCPU je Funktionsinstanz, Supabase Micro 1 GB/shared CPU/maximal 60 Verbindungen. Byte-Hartlimits, echte Reserven und gemeinsame Hosted-PG/PGR-RAM-Bindung sind nicht belegt. Getrennter Referenzvertrag bleibt inaktiv. |
| 5. Exakt 500 gleichzeitig aktive synthetische Profile | **PASS für übernommenen Aktivitätsbeleg** | Im historischen Mock69 sowie im lokalen KI-Abschnitt des Ressourcenlaufs nativ belegt. Aktivierung allein ist keine vollständige 500er Ergebnisabnahme. |
| 6. Vollständige 1.500 Ergebnisse und 8.000 Kontrollen | **FAIL im historischen Teilversuch**, neue Vollabnahme UNKNOWN | Mock69: 69/500 Units, 138 vollständige Mockantworten, 207/1.500 Ergebnisse und 1.104/8.000 Kontrollen. 1.293 Soll-Ergebnispositionen wurden nicht vollständig abgearbeitet. Vollständige aktuelle Fehler-/Leer-/Doppel-/Unbrauchbarbilanz fehlt; keine Nullfehlerbehauptung. |
| 7. End500-Verarbeitung und vollständige Sicherung | **FAIL als Gesamtabnahme** | Run 41208876552: 500 Auth-CAS, 6.000 Usage, 3.501 Postimages, 0 aktiv, Export und Stopp funktional bestätigt. Vollständige End500-Sicherung/Rücklesung/zweite Rücksicherung nicht bestätigt; reguläre RAM-Abnahme ebenfalls nicht bestanden. |
| 8. Automatischer Stopp und finale Nullaktivität | **PASS für vorhandene Teilbelege**, neuer voller Mock UNKNOWN | Historischer Mock69 unabhängig 500→0; native Dreierprobe 3→0 PASS. Ressourcenlauf: eigene Prozesse gestoppt, finale Profilflags 0 UNKNOWN. Diese unterschiedlichen Belege nicht gleichsetzen. |
| 9. Historischer RAM-Abbruch nach 69 Units | **FAIL erhalten**, konkrete Speicherursache UNKNOWN | 1.640.103.936 B gegenüber 1.638.400.000 B zulässigem Peak; Reserve um 1.703.936 B unterschritten, ohne Hartcap-/OOM-/Swapereignis. Kein nachgewiesener kleiner RAM-Fix. |
| 10. Weitere formale Mock-Startbedingungen | **FAIL/offen** | Positive unabhängige End500-Gesamtabnahme, gültiges Mock-Tagesfenster, End→Mock-Kompatibilitätsbrücke und aktuelle finale Ausführungsbindung fehlen. Atomic12ACK, elf Dateien und 500/500 Quellenqualifikation sind übernommen PASS. |

Messquellen: [DB-Diagnose mit vollständigen Kategorien und Zeitbelegen](w15-db-memory-diagnosis-20261031.md),
[historischer Mock69-Lauf](w15-mock-quellenbindungen-20261028.md),
[unabhängiger RAM-/Nullreview](belege/w15-processing-20261027/FULL500_20261028C_MEMORY_ZERO_REVIEW.SAFE.json),
[bestehende RAM-Gegenproben](belege/w15-processing-20261027/RAM_DIAGNOSIS_20261028_SUMMARY.SAFE.json).
Der gültige Controller fordert zusätzlich 17.000 Auditchecks; diese ersetzen
nicht die 8.000 echten Sicherheitskontrollen.

## Was der 948-MB-Abbruch wirklich aussagt

`separated_resources_contract.json` hält 948.191.232 B als historisch gemessenes
Micro-OS-`MemTotal` vom 30.10.2026 fest, ausdrücklich kein bekanntes Anbieter-
`memory.max`. Der inaktive Laborentwurf wählte daraus einen technischen
gemeinsamen Laborwert für PostgreSQL, PostgREST und dort gestartete SQL-Messclients.
Die tatsächliche Hosted-Zuordnung ist UNKNOWN. Anwendungseigene SQL-Hilfen
belasten die App-/Treibergruppe; Python-Steuerung und Simulatoren liegen separat.

Im nahen DB-Snapshot: `file` 588.124.160 B, darin SHMEM 198.709.248 B,
`anon` 273.461.248 B und `kernel` 25.358.336 B. Das ist nicht die atomare
Zusammensetzung der Lebenszeitspitze. Die Grenze wurde erstmals rund
335,936 s nach Beginn der 500er Phase beobachtet; die alte innere Operation
ist UNKNOWN. Dateibasierter Speicher einschließlich SHMEM ist erheblich,
sein genauer Produzent bleibt unbekannt. Verschiedene Kategorienmaxima und
Prozess-RSS werden nicht addiert.

`memory.events.max=38` beschreibt Belastungen an der Grenze und kann Reclaim
begleiten; es sind keine 38 OOMs. Der Parent sieht diese Ereignisse hierarchisch.
Damit ist der Laborwächter-Abbruch belegt, **nicht** ein irreduzibler
PostgreSQL-Arbeitssatz oberhalb des Micro-Budgets oder die Untauglichkeit von
Supabase Micro. Der genaue Anteil einer nicht passenden Gruppierungs-/Grenzannahme
gegenüber echtem Arbeitsbedarf bleibt UNKNOWN. Keine begründete pauschale
RAM-Erhöhung, Cachemanipulation oder `work_mem`-Änderung ableiten.

Die Anbieterbelege sind bereits gezielt geprüft und werden nicht erneut breit
recherchiert: [Billing](https://supabase.com/docs/guides/platform/billing-on-supabase),
[Architektur](https://supabase.com/docs/guides/getting-started/architecture) und
[Reports](https://supabase.com/docs/guides/observability/reports) belegen keinen
exakten gemeinsamen Hosted-Micro-RAM-Hartdeckel für PostgreSQL und PostgREST.
Vercel wird je Funktionsinstanz bewertet; Anbietergrenzen werden nicht addiert.

## Übernommene Reparaturen, Prüfungen und unveränderte Verträge

- PR #1002, Kopf `56ae2a68f2b3e3de6ae5fff878c3e9e7f50e0549`:
  Gateway-Log wird vor Erstellung mit umask 077 geschützt. Die konkrete
  Shell-/Collector-Inkompatibilität ist synthetisch reproduziert und korrigiert;
  erste feste Backupfehlerphase bleibt erhalten. Pflicht-CI
  [41211894017](https://github.com/ernisch/helmut-pilot/actions/runs/41211894017)
  und unabhängiger Review PASS. Die primitive Ursache des früheren Original-
  Backuplauffehlers und sein damaliger Dateimodus bleiben UNKNOWN.
- PR #1004/B4: erster Speicherfehlersnapshot wird nicht mehr bei der Bereinigung
  ersetzt. Atomarer begrenzter SAFE-Fortschritt erhält innere Phase/Operation
  und bestätigte Zähler; Fehler/Signal friert den Arbeitsstand ein. Gezielte
  SIGKILL-Gegenprobe und native Dreierqualifikation PASS, ebenso vollständige
  [Pflicht-CI 41241981900](https://github.com/ernisch/helmut-pilot/actions/runs/41241981900).
  Unabhängiger Review bestätigt denselben tatsächlichen Codebaum.
- Elf Mockoriginale mit Empfang 41037459441, Atomic12ACK und 500/500 Quellen-
  qualifikation bleiben übernommen. Keine erneute Beschaffung, Inventur,
  Qualifikation oder Entschlüsselung.
- Die frühere Zwei-CAS-Probe bestätigt nur TEMP-Spill bei 4 MB `work_mem`
  und dessen Wegfall bei 16 MB. Ein gemeinsamer RAM-Gewinn, maximale Auth-
  Datenstände und natürliche GC-/WAL-Verläufe sind damit nicht qualifiziert.
  Ihr Startbefund bleibt `UNKNOWN_NOT_CLEARED`; kein blindes Portieren von 16 MB.

In diesem Gesamtsprint kein neuer Laufzeitfix ohne Beleg, keine Optimierung,
keine Code-/Grenzänderung und keine Wiederholung erfolgreicher Tests.

Verbindlich bleiben die regulären phasengetrennten Grenzen:

| Vertrag | Verarbeitung | Sicherung erst nach angenommenem Verarbeitungsabschluss |
| --- | --- | --- |
| End500 | 2.560.000.000 B hart, Peak höchstens 2.048.000.000 B, Reserve mindestens 512.000.000 B | 4.999.999.488 B hart, Hostreserve mindestens 2.147.483.648 B |
| Mock500 v2/v3 | 2.048.000.000 B hart, Peak höchstens 1.638.400.000 B, Reserve mindestens 409.600.000 B | derselbe freigegebene Sicherungsdeckel mit eigener Hostreserve |

Keine Peakresets, kein Rückwechsel zur Verarbeitung, Swap/OOM/Max 0.
Die 5-GB-Kapazitätsdiagnose und der getrennte inaktive Laborvertrag ersetzen
keine dieser regulären Abnahmen. Ein erfolgreicher Restore-Sicherungsrundlauf
41132913871 darf nicht mit einem anderen End500-Lauf zu einer fiktiven positiven
End500-Sicherung kombiniert werden.

## Warum das einmalige Mock-GO noch nicht ausführbar ist

1. `mock500_start.py:92–119` verlangt positive unabhängige End500-Abnahme samt
   `processingMemoryAccepted`, `backupSafetyAccepted`, `completeBackupAccepted`,
   500 Profilen und 0 aktiv. `mock500_full_dispatch.py:159–192` verlangt außerdem
   den tatsächlich erfolgreichen gebundenen End500-GitHub-Lauf.
2. `mock500_start.py:181–184` und `mock500_full_dispatch.py:59–66` erlauben nur
   28.–31.10.2026, 10.800 s Verarbeitung/12.600 s Gesamtlauf im selben UTC-
   **und** Berlin-Tag. Am 31.10. muss der Start strikt vor 19:30 UTC liegen.
   Bei der Prüfung nach 21:56 UTC ist das nicht mehr möglich; 1.11. ist nicht
   freigegeben. Uhrzeit, Tagesgrenze oder Datum nicht auf dem Papier verschieben.
3. End→Mock-Brücke, Source-/Inputqualifikation, Ziel-/Launcherhash, endgültiger
   Commit, Umgebung, Nonce, Kosten und Freigabe müssen zum selben späteren Lauf
   passen. Fehlende positive End500-Belege dürfen nicht für die Brücke erfunden
   werden. Exakte technische Hashbindung allein erzwingt keine erneute Frage;
   eine ausdrücklich benannte Mockkopf-/Branchfreigabe bleibt vor Schutzstart
   nach den geltenden Startunterlagen zu erfüllen.
4. Der öffentliche PR1004-Ressourcenmodus setzt End500-/Mock500-/1.500-Abnahmen
   ausdrücklich false. Er darf nicht als Ersatzlauf mit dem neuen Mock-GO
   gestartet werden. Das wäre ein zusätzliches, hier nicht freigegebenes Experiment.

## Kleinster Weg und konkrete Freigabegrenze

Vor Mock muss die fehlende vollständige End500-Abnahme geschlossen werden.
Eine bereits qualifizierte **Option zur Klärung von Funktion/Sicherung** ist
der PR1002-Fixkopf; sie ist kein allein ausreichender Weg zur Mockfreigabe.
Der frühere Runner ist beendet und hat kein fertiges End500-Sicherungsartefakt
hinterlassen; dort kann keine Sicherung fortgesetzt werden. Ein neuer gemeinsamer
Originallauf braucht das ausdrücklich ausgenommene separate GO.
Die [vollständige vorbereitete Vorlage](w15-end500-next-capacity-go-20261031.md)
nennt Commit, geschützte Umgebung, Umfang, Grenzen, öffentliche Qualifikation,
Abbruch und Rückweg. **Sie ist nicht erteilt und wird nicht ausgeführt.**

Der vorgeschlagene Kapazitätslauf ist kein regulärer RAM-PASS. Der Code setzt
bei Kapazitätsdiagnose `actual_memory_accepted=false` und
`legacyEnd500Accepted=false`. Danach sind vor Mock weiterhin eine reguläre
End500-RAM-Abnahme oder ein ausdrücklich genehmigter, technisch qualifizierter
neuer Vertrag erforderlich. Für Mock selbst sind der frische Ressourcenpreflight
und anschließend die vollständige Laufabnahme verbindlich; ein Mock-Vollpass
wird nicht bereits vor dem ersten Mockversuch vorausgesetzt. Die vollständige
historische Ursachenklärung des 69er Abbruchs ist kein zusätzlich erfundenes
Starttor. Der historische FAIL bleibt als Risiko erhalten. Der Bedarf einer konkreten Speicheroptimierung
oder Vertragsänderung lässt sich aus den bisherigen Teilbelegen nicht sicher
entscheiden. Keine ungeprüfte neue Grenze zur Freigabe vorlegen.

Unabhängig davon muss vor einem späteren Mockstart ein konkreter neuer
UTC-/Berlin-Tagesvertrag genehmigt und technisch qualifiziert werden; dabei
10.800/12.600 s, Auth30/Unit60/Provider20 und RAM-/Kosten-/Sicherheitsgrenzen
unverändert lassen. Erst danach den finalen Mockkopf und die Laufbindung
erstellen. Kein GO auf einen noch gesperrten Mockkopf anfordern.

Der vollständige Mock muss anschließend 500 Units, 1.000 lokale Phasen,
1.500 gespeicherte einzeln geprüfte Ergebnisse, 8.000 Kontrollen, sichere Null-
rückführung sowie verschlüsselte Sicherung/Rücklesung/zweite Rücksicherung
unabhängig bestehen. Erst danach kostenpflichtigen Production500 mit eigener
Kosten-, Aktivierungs- und Startfreigabe erwägen.

## Dokumentationsnachweis dieses Sprints

PR1004/B4 und alle Code-/Testdateien bleiben unverändert. Ein eigener
Dokumentationsbranch baut direkt auf B4 auf; keine konkurrierenden Schreib-
zugriffe auf Motor/UI/Backend. CURRENT_STATE bleibt unter 30.000 Zeichen und
350 Zeilen. Sein vorheriger B4-Stand ist bytegleich archiviert (SHA256
`4f2be60f04364a20182f0f4c868382e2925016e7a64780a99ffd574f9abb87ac`).
Nur notwendige Statusgrößen-/Diffprüfung, unabhängiger Beleg-/Starttorreview
und erforderliche Dokumentations-CI; keine neue Last-/Original-/500er-Ausführung.
