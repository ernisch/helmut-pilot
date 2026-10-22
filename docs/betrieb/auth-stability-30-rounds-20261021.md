# Längere Prüfung des integrierten lokalen Authpfads

Stand21.10.2026 UTC, Branch `codex/controlled-cleanup-and-late-probe-20261020`,
Entwurfs-PR927 auf PR926/925/924. **Gezielte Funktions-/Sicherheitsprüfung PASS;
kein stabiles Speicherplateau, Sprint insgesamt teilweise abgeschlossen.**

Der Produktcode bleibt gegenüber6d528425 unverändert: begrenzter PG-Renderer,
kalte Hashprojektion und kompakter Kontrollcache sind bereits integriert.
Der frühere faire OLD–NEW–NEW–OLD-Vergleich belegt durchschnittlich
154.886.144B/13,23% weniger gemeinsamen Komponenten-RAM. Die folgende längere
NEW-Prüfung untersucht verbleibendes Wachstum; sie ist kein neuer ALT/NEU-Vergleich.
[Vergleich und Grenzen](combined-auth-memory-comparison-20261020.md).

## Tatsächlicher Ablauf

Der neue diagnostische Starter liegt unter
`scripts/helmut-resource-meter/auth-stability30-native-launcher`, eingefroren
mit PREPARED-SHA256 `fd846c435352b0280c8607995f3d55a690f72094a0bfde17949cdef04c7375ad`.
24 Produkt-/SQL-/Abschlusskörper sind bytegleich zum bisherigen kombinierten
Starter. Die Anpassungen begrenzen genau30 Runden, erfassen60 Marker-/ACK-Grenzen
und erlauben dafür explizit begrenzte längere Node-/Belegausgaben. Kein Produkt-
Timeout wurde verlängert: jeder beobachtete Authvorgang bleibt≤30.000ms;
Fetch20s, SQL30s und Lock1s unverändert. Der Node-Gesamtbatch erhält180s,
Node-Capture1MiB, SQL-Capture256KiB, Fallbelege8MiB. Kein Voll500-Modus.

Der isolierte Hostadapter `scripts/helmut-resource-meter/auth-stability30.py`
authentifiziert PREPARED und beide geladenen Pythonquellen vor Ausführung.
Er benötigt den gepinnten Python3.12 mit `-I -S -B`, ohne Optimierungsflags;
`-O`/`-OO` werden vor dem Laden abgewiesen. Ausschließlich über `scripts/lokal.js`
starten. Direkter Aufruf von `run.py` unter `-I` findet `common` nicht; der
erste solche Versuch scheiterte vor Fallanlage oder Ressourcenstart.

Zuerst frischer Null-Auth-Fall `stability-6c5de4967c25879d40ef74d5`: PASS,
**652.570.624B gemeinsamer Lebenszeitpeak/19,844s**. Seine unabhängige tatsächliche
Abnahme wurde vor der separaten Root-Adoption des Workloads gebunden.
Danach Fall `stability-9554f8879915b2483999e354`: PASS,
**1.047.896.064B gemeinsamer Lebenszeitpeak/127,134s**,
143,717s gemeinsame CPU und372.527.104B Geräteschreibmenge. CPUzeit ist keine
Wandzeit; Schreibmenge ist kein zusätzlicher RAM.

Beide Fälle verwenden eigene persistente Kopien derselben authentischen späten
V11-Quelle827a9872:1709 Dateien/369.399.611B. Die gemeinsame native Messung beginnt
vor Quellenprüfung, Kopie, originaler JIT-Restaurierung und Installation und endet
nach dem letzten eigenen Prozess. Unveränderte Node-Budgets384MiB+16MiB,
native Grenze1.547.997.184B/high1.399.996.416B/swap0. Kein Peakreset, erzwungener
GC oder Cacheverwerfen; keine zusätzliche künstliche RAM-Erleichterung.

## Integrität, Sicherheit und Zeit

30 echte Änderungen und eine bestätigte Wiederherstellung erzeugen243 RPCs:
32 vollständige Reads,31 CAS-Schreibvorgänge und180 Kontrollen.
Alle212 frischen History-/Noncebindungen,180 Graphbindungen,31 bestätigten
CAS-Revisionen und63 vollständigen logischen6000-History-Hashes unabhängig geprüft.
Originalhashes, Kontrollfelder,606B physische Referenzen sowie Katalog/ABI/ACL und
ursprünglicher logischer Root erhalten. Keine unbekannte Schreibbestätigung und
kein automatischer Retry. Alle60 Marker-/ACK-/SQL-Grenzen exakt gebunden.

Node/PG und beide äußeren Starter enden mit0, EOF und vollständigem Prozessende.
Der originale PostgREST−2-Abschluss erfüllt ausschließlich die bereits separat
qualifizierte enge Identitäts-/SIGTERM-/EOF-Policy; alte FAILs bleiben FAIL.
Beide Messgruppen leer, high/max/oom/oom_kill und vorhandenes oom_group_kill0.
Maximaler beobachteter Authvorgang1.274,325ms einschließlich Dekodierung und
logischem Hashbeobachter; innere Node-Clientphase92,239s vor finaler JSON-Ausgabe
und Prozessende. Der Capturepfad beobachtet92,759s vor Statussicherung; EOF und
Reap bleiben im180s-Budget. Das ist kein Vollmotor-Auth30-/Unit60-
oder Offline90-Nachweis und kein Ersatz für16 frische Kontrollen je Profil.

Gezielte Prüfungen einmalig:127 Auswahl-/Zahlen-/Event-/Marker-/Captureguards,
5 Python-ASTs und1 geänderte Node-Syntaxdatei PASS; Hosthilfe Exit0 und Ablehnung
optimierten Pythons Exit1. Kein Wiederholen der bereits bestandenen179 Suiten
oder95 nativen Vergleiche auf unverändertem Produktcode.

## Speicherverlauf: weiterhin steigender später Abschnitt

Vor dem Start wurden30 Endpunkte, drei Zehnerblöcke und die Auswertung der Runden
11–30 festgelegt. Die Tabelle nutzt sämtliche exakten Rundenenden; die auf220
Einträge begrenzte native Zeitleiste ist keine gleichmäßig erfasste Vollserie.

| Runden | Gemeinsamer Current Median (B) | Anonym Median (B) | File Median (B) | Node RSS Median (B) | Node heapUsed Median (B) |
|---|---:|---:|---:|---:|---:|
|1–10|950.446.080|317.083.648|605.118.464|241.858.560|70.481.028|
|11–20|964.362.240|329.431.040|605.782.016|253.995.008|89.374.484|
|21–30|973.484.032|337.870.848|606.502.912|262.014.976|82.189.296|

Block3 gegenüber2: gemeinsamer Median+9.121.792B, anonym+8.439.808B,
File+720.896B, NodeRSS+8.019.968B; gleichzeitig heapUsed−7.185.188B und
heapTotal−8.482.816B. Die vorab festgelegte lineare Auswertung11–30 beträgt
gemeinsam+1.127.930,61B je Runde. Natürliche GC findet statt, jedoch kein belastbares
Plateau. Unterschiedliche Operationsphasen zeigen unterschiedliche RSS-Verläufe.
Damit ist noch keine einzelne gehaltene Allokation oder ein unbegrenztes Leck
nachgewiesen; ein weiterer Snapshot-/Parts-Umbau ist dadurch nicht begründet.

Die nachträgliche Auswertung bereits vorhandener natürlicher GC-Belege grenzt
den Befund ein: An vergleichbaren späten Endpunkten26→30 wächst heapUsed nur
135.192B, RSS dagegen4.063.232B; tracked external/arrayBuffers unverändert.
Worker-Aufnahmen bestätigen höheren Node-RssAnon, RssFile nahezu gleich.
Major-GC findet weiter statt. Das beweist weder ein bestimmtes natives Leck noch
ein globales Heapplateau. Es fehlen V8s physische Heap-/Spacebytes an denselben
Phasen. Wenige zusätzliche Skalare können bei der nächsten sachlich notwendigen
begrenzten Diagnose diese Unterscheidung liefern; allein dafür wird kein neuer
30-Runden-Lauf und kein künstlicher GC angesetzt.

Der vorhandene Einzel-Snapshot-Kandidat bleibtOFF: Sein historischer Vergleich
hatte890.748.928→907.329.536B gemeinsamen RAM gezeigt, also keine Verbesserung.
Eine eingesparte JSON-Decodierung rechtfertigt keine erneute Qualifikation oder
Aktivierung. Diese historischen Zahlen stammen aus dem gepinnten W46-Dokument;
dessen privater Primäraudit fehlt hier, kein frisch rehashter Altbeleg behauptet.
[Unabhängige Einordnung und genaue Grenzen](auth-stability30-allocation-review-20261021.SAFE.json).

`shmem` ist bereits in `file`, `arrayBuffers` in `external` enthalten.
Getrennte Prozess-RSS und separate Lebenszeitspitzen werden nicht addiert.
Der frühere Eigentümerkanal hatte643 Host-PermissionErrors; diese neue Messung
beseitigt diese Grenze nicht. Kein Hochrechnen der30 konstanten History-Runden
auf500 Profile oder ein wachsendes Verbrauchsjournal.

## Belegerhalt und gesicherter Haltepunkt

Nach unabhängiger tatsächlicher Abnahme wurden nur die beiden vorab als nach
PASS entbehrlich eingestuften PGDATA-Kopien entfernt:3422 reguläre Dateien,
739.528.704B inventarisierte Dateiblöcke. Neue fallgebundene Quell-/Nutzungsprüfung
und zwei einzelne frische Root-Adoptionen; keine alten Freigaben wiederverwendet.
Alle483 Fallbelege wurden danach unverändert rehashgeprüft. Sechs gestoppte
Containerhüllen, Images/Volumes/Loops, Originalbank und kanonische Quelle bleiben.
Keine Archiv-/WAL-Wiederherstellungsbehauptung für diese entbehrlichen Kopien.

Die historische Fassung des ersten Root-Adoptionsschreibers wurde anhand ihres
unveränderlichen Adoptionspins bytegenau gesichert. Die spätere Fassung ergänzt
die tatsächliche Lifecycle-Abnahme. Beide realen Fälle binden denselben finalen
Hostadapter88142aed; die erste Hostfassung war ausschließlich AST-geprüft.
Kein unveränderlicher Altbeleg wurde dafür umgeschrieben.

Die [öffentliche Root-Qualifikation](auth-stability30-qualification-20261021.SAFE.json)
ist eine Zusammenfassung, keine zusätzliche unabhängige Abnahme. Sie bindet
vollständige SHA256-/Größenpins der tatsächlichen Quellen-, Host-, Lifecycle-,
Workload- und Endprüfberichte. Private Rohbelege verbleiben unter
`/workspace/helmut-ram-fix-20261020/auth-stability-20261021`; unabhängige Berichte
unter `/workspace/helmut-auth-measure-sol-20261020/diagnostics/stability30-review-20261021`.

**500MB Reserve bleibt offen.** Der maßgebliche frühere PG-Engpass ist behoben und
seine gemeinsame Einsparung belegt; der spätere aktuelle RSS-/Anonymanstieg ist
noch nicht kausal isoliert. Kein vollständiger500er Test technisch empfohlen
oder aus dieser Diagnose freigegeben.32 frische Startbedingungen, gültige
Fall-/Zeitbindungen, ausreichende Platte und neues konkretesGO bleiben notwendig.
Der unveränderte Vollstartvertrag verlangt weiter DeepSeek; der Konflikt zur
aktuellen SOL-only-Vorgabe ist vor einem späteren Vollstart zu klären.
Router, Betreiberkosten, Budget, Reserve und Production unverändert.
