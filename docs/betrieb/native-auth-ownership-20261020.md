# Tatsächliche Speicherzuordnung des aktuellen lokalen Authpfads

Stand20.10.2026, Branch `codex/controlled-cleanup-and-late-probe-20261020`.
**Gezielte Besitzerdiagnose bestanden; genaue Peakzuordnung und500er Ziel offen.**
Der nachfolgende [uninstrumentierte Gesamtvergleich der Authkorrekturen](combined-auth-memory-comparison-20261020.md)
belegt inzwischen gemeinsame Komponenten-RAM-Ersparnis; diese einzelne
instrumentierte Aufnahme bleibt davon getrennt.
Keine neue Produktcodeänderung gegenüber6d528425: kompakter Kontrollcache,
PR925-Renderer und kalte Hashprojektion bleiben unverändert. Der in88b618b1
eingebundene diagnostische Starter ergänzt begrenzte Speicheraufnahmen.
Drei SOL-Helfer arbeiten getrennt; Root integriert und entscheidet. Keine
Router-/DeepSeek-/Provideraufrufe, Production-Aktionen oder Voll500-Ausführung.

## Tatsächlich ausgeführt

Frischer Null-Auth-Abschlussfall `control-41fd40deb27ebb9fecd60384`: PASS,
18,647s einschließlich Setup und Abschluss, gemeinsamer Lebenszeitpeak
655.769.600B. Danach genau ein gesondert adoptierter aktueller NEW-Fall
`control-4a1b3f4904b58b1d9cb049e8`: PASS,42,543s, gemeinsamer Lebenszeitpeak
**1.032.052.736B**. Beide verwenden denselben eingefrorenen Starterb8cf3abd,
die authentische späte Quelle827a9872 mit1709 Dateien/369.399.611B und eine
eigene persistente Arbeitskopie. Quellenhash, Kopie, originale JIT-Restaurierung,
Installation und vollständiger Abschluss sind gemeinsam gemessen; kein Peakreset.

NEW führte27 echte HTTP-RPCs aus:5 vollständige Reads,4 bestätigte CAS-Schreib-
vorgänge und18 Kontrollen, einschließlich3 Probeänderungen und Wiederherstellung.
Alle6000 historischen Einträge, Originalhashes, logischen Kontrollfelder und
606B physische Authreferenzen bleiben erhalten; nur die frisch bestätigte
Revision ändert sich. Funktionskörper/ABI/ACL/Katalog und Quellen wurden geprüft.
Node/PG endeten mit0; der originale PostgREST-Abschluss ist nach der separat
geprüften engen Policy qualifiziert. Alle eigenen Gruppen sind leer, OOM/high/
max-Ereignisse0; keine automatische Wiederholung. Frühere FAILs bleiben FAIL.

81 Operationsgrenzen mit exakt gebundenen Markern/ACKs und129 Speicherframes
sind geschlossen erhalten. Die unabhängige Abnahme prüfte265 kleine Belege
mit3.573.051B einschließlich aller162 Marker-/ACK-Dateien. Getrennt bestanden
10 Python-Guardgruppen und21 Node-ACK-Fälle. Die vollständigen179 Suiten waren
auf unverändertem Produktcode6d528425 bereits bestanden; keine Wiederholung.

## Was sich tatsächlich zuordnen lässt

Der erste vollständige Read erhöht die beobachtete Node-PSS von24,2 auf233,4MB.
Die höchste Lebenszeitspitze entsteht erstmals im Intervall vonRPC10
(`round1.mutation`), dort fehlen innere PSS-Aufnahmen. **Ihr genauer Besitzer
bleibt unbekannt.** Eine spätere tatsächliche Current-Aufnahme beiRPC26 liegt
mit1.031.282.688B nur770.048B darunter. Im zugehörigen Frame werden Node-PSS
250.609.664B und beim aktiven PG-Backend PSS131.876.864B beobachtet; diese
nacheinander gelesenen Werte werden nicht zu einer Peakzerlegung addiert.

Dateispeicher liegt während dieser Phase um605–606MB und enthält bereits
etwa233,7MB Shared Memory. `file - shmem` liegt um372MB. Die originale
JIT-Restaurierung belegt178.290.688B im begrenzten tmpfs; sie zählt zur Messung.
Nach letztem Prozessende bleiben373.420.032B Dateicache, anon/shmem sind0.
Weder Cache noch JIT dürfen als zusätzlich zu `file` addiert werden.

Die sichtbaren129 Worker-Aufnahmen enthalten zehn stabile TGIDs und keine
Prozesslesefehler. Der getrennte Hostkanal liefert jedoch643 PermissionErrors
für Prozessidentitäten über145 Erhebungen. Eine vollständige Zuordnung zwischen
Host- und Worker-Namensraum ist damit nicht bewiesen. Prozess-/Gruppenwerte
werden nacheinander gelesen; `memory.stat` kann verzögert sein. Kein Beleg für
vollständige PSS-Abdeckung aller Nachkommen oder exakte Kernelpeak-Zerlegung.
Sammler und Markerpausen beeinflussen Laufzeit und natürliche GC; diese Messung
ist kein uninstrumentierter OLD/NEW-Vergleich. Drei Runden belegen kein Plateau.

## Konsequenz und gesicherter Haltepunkt

Node-Read-/Schreibarbeit und private PG-Belegung sind reale nächste Ansatzpunkte;
eine einzelne konkrete Allokationsursache ist damit noch nicht bewiesen.
Kein neuer Snapshot-/Parts-Umbau wird aus einer bloßen PSS-Spitze abgeleitet.
Der bisherige V9-Cachevergleich hatte PR925s neuen Renderer auf beiden Seiten.
Der inzwischen gesondert abgeschlossene Vergleich gegen den echten alten
V11-Authpfad belegt154.886.144B/13,23% mittlere gemeinsame Komponenten-Ersparnis
über vier vollständig beendete Arme. Gleiche Budgets/Last und authentische späte
Kopien; weiterhin kein vollständiger Motor- oder500er Nachweis.

Die beiden frischen Arbeitskopien waren vor dem Start ausdrücklich als nach
PASS und vollständiger Belegsicherung entbehrlich eingestuft. Ihre gesonderte
Entfernung wurde nach Quellen-/Abhängigkeitsprüfung und zwei frischen einzelnen
Root-Adoptionen tatsächlich abgeschlossen:3422 reguläre Dateien,
739.643.392B belegte Blöcke, alle321 Belege und Hüllen erhalten. Die
[unabhängige tatsächliche Abnahme](ownership-two-pass-copies-retired-sol-review-20261020.SAFE.json)
bestätigt beide fehlenden Arbeitswurzeln und unveränderte Quellenidentität.
Keine Archiv-/WAL-Rekonstruktionsbehauptung für diese vorab entbehrlichen
PASS-Kopien. FAIL/UNKNOWN und ältere oder notwendige DB-Stände bleiben geschützt.

500MB Reserve, vollständige Zeitverträge,500 aktive Profile und1500 brauchbare
Positionen bleiben offen. Kein vollständiger Lauf ist hier technisch empfohlen
oder freigegeben;32 frische Bedingungen, ausreichende Platte und neues konkretes
GO bleiben erforderlich. Betreiberkosten und Reserven unverändert. Im selben
Thread mit Denkstufe Sehr hoch fortsetzen.

## Unveränderte tatsächliche Belege

- [Null-Auth-Lebenszeit](ownership-zero-auth-lifecycle-actual-20261020.SAFE.json)
  und [unabhängige Abnahme](ownership-zero-auth-lifecycle-sol-review-20261020.SAFE.json).
- [NEW27-Lebenszeit](ownership-new27-actual-20261020.SAFE.json) und
  [unabhängige Abnahme](ownership-new27-actual-sol-review-20261020.SAFE.json).
- [Speichertrend mit Quellpins und Grenzen](ownership-new27-memory-trends-20261020.SAFE.json).

Private Rohdaten verbleiben in den oben genannten Fällen unter
`/workspace/helmut-ram-fix-20261020/control-cache-ownership-20261020/cases`;
es werden keine Ersatzoriginale erzeugt.
