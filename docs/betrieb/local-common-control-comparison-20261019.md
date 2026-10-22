# Frische Kontrollsicht: gemeinsamer kleiner Ressourcenvergleich, 19.10.2026

**Ein frisches Vergleichspaar bestanden; gemeinsame Spitze beobachtet um
91.832.320B niedriger. Kein vollständiger500er-,500MB-Reserve- oder
Unit60/Auth30-Nachweis. Kandidat bleibt Standard AUS und im Vollrun gesperrt.**

## Freigegebene Bereinigung

Das neue tatsächliche Betreiber-GO galt ausschließlich den vier im W49-Plan
gebundenen beendeten W46-Containerhüllen. Vor der ersten Entfernung wurden
Plan/SHA, vier vollständige IDs, tatsächliche Freigabe,17 vollständig gelesene
Archivmitglieder/16 interne Prüfsummen, aktuelle Konfigurationen/Mounts/Diffs,
beide Logströme, abhängige Container, acht exklusive Layer und Originalpins
geprüft. Ein unabhängiger Codex-Prüfer hat den Executor abgenommen.

Nur viermal `docker rm FULL_CID`, ohne Force oder Volume-Löschung. Nachher alle
übrigen Container, Images, Volumes, Binddateien, Originale und Belege erhalten;
ursprüngliche Datenbank weiterhin PID2083. Archiv bleibt lokal erhalten.

- Frei unmittelbar vorher8.505.057.280B, nachher12.152.221.696B.
- Tatsächlicher Nettofreigewinn **3.647.164.416B**, einschließlich freigewordener
  Docker-Metadaten; zuvor exklusiv geprüfte Layer3.646.087.168B.
- Voll500-Plattenreserve16.589.934.592B wurde dadurch nicht erreicht.
- Keine weitere historische Löschung und kein Ressourcen-GO verbraucht.

## Genau ein kleines Vergleichspaar

Bestehende Messinfrastruktur, PG17.6, Node24.19.0, gleicher unveränderter
Core96bec54e, native Funktionen und Einstellungen. `fsync`,
`full_page_writes` und `synchronous_commit` bleiben an; WAL-Kompression aus.
Jeder Fall erhält neue isolierte Datenbank, eigenen Kernel-Elternknoten und
eigene begrenzte Loop-Datenablage. Datenbank, Node, Helfer und zugeordnete
Dateicaches bleiben bis zum letzten Prozessende in der gemeinsamen Messung.
Der bestehende äußere Beobachter bleibt auf beiden Seiten außerhalb.

Baseline `read-path-7706938305`, Kandidat `read-path-a6935a3abf`.
Gleiche Eingangsdatei mit5000 historischen Verbrauchszeilen,500 lokal behaltenen
Diagnoseeinheiten und1000 Intents. Bestehendes künstliches4MiB-Padding nur in
der neuen Kopie ergänzen und wieder entfernen. Keine aktiven Profile.

Pro Seite38 gemessene Operationen: zweimal16 Kontrollleser, vier vollständige
Native-/Usage-Leser und zwei No-op-Schreiber; insgesamt einschließlich frischer
Voll-/Wiederherstellungsleser **52 vollständige HTTP200 und vier CAS**.
Beide Vergleichsleser prüfen dieselben vier Verbraucherfelder identisch.
Vollständige andere Felder, Historie und Root bleiben zusätzlich über bisherige
Voll-/Native-Leser geprüft. Das sind **keine8000 ausgeführten Adapterkontrollen**.

Zwölf negative Startkonfigurationen wurden ohne Ressourcenanlage abgefangen.
Unabhängige Quellenprüfung des Harness/Paarplans bestanden. Vor jeder Seite
Quellen-/Originalpins und9.663.676.416B freie Plattenreserve frisch bestätigt.
Keine Wiederholung, kein Profiler und keine erzwungene GC.

| Messgröße | Vollständiger Leser | Kontrollsicht |
|---|---:|---:|
| Gemeinsamer Kernelpeak bis zum letzten Prozessende |845.004.800B|753.172.480B|
| Gemeinsame CPU |29,381561s|28,461674s|
| Gesamte eigene Lebensdauer |36,485770s|35,347780s|
| Summe38 gemessener Aufrufe |8533,028ms|6630,737ms|
| Median16 Original-Leser |167,412ms|119,076ms|
| Median16 gepaddeter Leser |246,525ms|140,616ms|
| Alle52 HTTP-Antwortbytes |209.625.764B|68.774.260B|
| Datenbank-Tempbytes |47.191.289B|47.191.289B|
| WAL im Arbeitsfenster |624.348B|624.348B|
| WAL-Vollseitenkopien im Arbeitsfenster |0|0|
| Original-No-op-Schreiber |212,469ms|244,841ms|
| Gepaddeter No-op-Schreiber |293,341ms|288,602ms|
| Langsamster gemessener Aufruf |498,556ms|978,637ms|
| Größte pro Aufruf erfasste Node-RSS-Hochwassermarke |472.014.848B|509.423.616B|

Beobachtet:10,87% weniger gemeinsamer Peak,0,919887s weniger gemeinsame CPU
und1,137991s kürzere eigene Lebensdauer. Das ist ein einzelnes frisches serielles
Paar. Schon die Peaks vor der Arbeitsphase unterschieden sich mit683.094.016B
und579.362.816B; der Gesamtdifferenz wird keine ausschließlich durch die32
Kontrollreads bewiesene Ursache oder Wiederholbarkeit zugeschrieben. Nicht
zeitgleiche Stichproben von Anonym-/Dateicachewerten sind keine Peakzerlegung.

Der langsamste Aufruf war auf beiden Seiten der **unveränderte vollständige
native Leser mit Padding**. Seine Node-CPU stieg294.993→697.567µs; der größere
Teil der Mehrzeit liegt nach Abschluss der HTTP-Antwort im Clientpfad für
Parsing/Vollvergleich/Rootbildung. Keine einzelne Teilursache oder GC-Pause
wurde gemessen. Der Originalschreiber war32,371ms langsamer, der gepaddete
Schreiber4,738ms schneller. Kein neuer Unit60-/Auth30-Beleg aus diesen Zahlen.

Die höhere beobachtete Node-Hochwassermarke von37.408.768B wird ausdrücklich
nicht verschwiegen. Sie ist eine Aufrufbeobachtung und kein terminaler separater
Prozesspeak; der gemeinsame Kernelpeak umfasst weiterhin alle eigenen Prozesse
und Caches. Temp-/WAL-Volumen unverändert, keine Behauptung einer gelösten
großen Schreibvolumenursache. Lokaler Loopbackverkehr ist kein abrechenbarer
Production-Egress; RX/TX nicht zu einer künstlichen Kostenzahl addieren.

## Integrität, Entscheidung und Grenzen

Alle vollständigen logischen Felder außer der absichtlich frischen CAS-Revision
wiederhergestellt;5000 historische Zeilen unverändert. Native Statebindung und
Historyproof innerhalb jedes Falls vor/nach gleich; gleicher logischer Merkle-
Root zwischen Fällen. Neue Bootstrap-Generationen und deren Originalhashes/
Historyheads dürfen sich zwischen isolierten Fällen unterscheiden. Ein kompletter
`logicalDataSHA256` einschließlich frischer CAS-Revision muss deshalb weder
zwischen Fällen noch vor/nach Schreibvorgängen identisch sein.

Originaldateien und Fixturepins unverändert, eigene Kernelgruppen leer, eigene
Speicherhelfer beendet, keine OOM-/Limitereignisse. Neue kleine Datenbanken,
Loopabbilder, Hüllen und Belege bleiben erhalten; deren Entfernung ist nicht
von der Freigabe für die vier historischen Hüllen umfasst.

**Kontrollsicht als lokalen Kandidaten behalten. Noch keinen neuen500er Lauf
empfehlen:**500MB Reserve, vollständige Offline90/Unit60/Auth30, alle500
Abschlüsse/1500 Positionen/8000 tatsächlichen Kontrollpunkte und dauerhafte
Ressourcenobergrenzen bleiben offen. Die Testmenge mit nur zwei Zustandswechseln
belegt nicht den gesamten Verlauf des wachsenden500er Journals. Die2MiB-Grenze
des privaten Kontrolltexts bleibt unverändert und fällt bei Überschreitung
sicher auf vollständige Inhaltsprüfung zurück; dessen500er Laufzeit ist offen.

Nach dem Paar rund8,281GB frei: unter dem kleinen9,664GB-Floor und dem
Voll500-Floor16,590GB. Keine zusätzlichen Löschungen ohne neue konkrete Freigabe.
Nach dem kleinen Paar ausdrücklich neu freigegeben und genau einmal ausgeführt:
**DeepSeek V4 Pro High, read, HTTP200/completed, Summarystatus `ok`** für
Code `c6620c83` (Motorbytes96bec54e unverändert). Zwölf ausdrücklich ausgewählte
Dateien,15 Quellen einschließlich kanonischem Kontext, SHA-gebundenes Paket
`0b0ca828…`. Tatsächlich236,535s,79.337 Eingabe-/21.981 Ausgabetokens,
101.318 Tokens insgesamt; genauer APIpreis unbekannt. Kein Retry, keine
Schreibänderung, kein500er-/Production-GO. Die freigegebene Einzelberechtigung
ist verbraucht. Vollständige strukturierte Schlussantwort vor Verdichtung lokal
erhalten; keine internen Modellgedanken gespeichert oder veröffentlicht.

Kein konkreter Sicherheitsblocker in `CONTROL_READ`/`rememberControl`/
`readControl`, vier vollständigen Verbraucherfeldern, privater Inhaltsbindung
oder Schreibschutz gefunden. Unveränderte Kosten-, CAS- und
Unbekannter-Ausgang-Semantik im geprüften Umfang bestätigt. **Begrenzte
Quellenabnahme**, kein Testlauf durch DeepSeek und keine500er Abnahme.

DeepSeek erhielt von der zu großen `storage.js` ausschließlich genaue Auszüge.
Die offen gelassene Prüfung des zugehörigen Transport-/Aufruferpfads hat Sol
anschließend am vollständigen lokalen Quellfile und sämtlichen benannten
Aufrufern geschlossen: genau ein produktiver Aufrufer `adapter.controlGuard`,
zwei lokale Diagnoseaufrufer. Interner, pro Request aktueller URL-/Rollenpfad,
feste Auth-Zeilen-ID, kein fremdes Request-/Headerargument, lokale/private
Modusgrenze und bestehende Antwortfrist; alle Writer bleiben Vollreader/CAS.
Das ist keine nachträglich behauptete DeepSeek-Vollabnahme der545kB-Datei und
kein allgemeines Storage-Audit.

Präzisierung zur ersten Formulierung der Modellantwort: Ungültige Antworten
werfen tatsächlich einen Fehler und löschen den eingefangenen Nachweis, ohne
Retry. Gültige kalte/geänderte/fremde/zu große Inhalte werden vollständig
verifiziert. Diese Fälle nicht als Fehler-Fallback verwechseln; Code und
bereits ausgeführte Negativprüfungen sind unverändert, kein Fix erforderlich.

Nächster notwendiger Schritt: den begrenzt angenommenen Leser im tatsächlichen
lokalen Vollpfad mit expliziter neuer Fall-/Code-/Tagesbindung vorbereiten;
der bisherige Descriptor sperrt ihn weiterhin. Fehlende Ressourcen und sämtliche
32 Startbedingungen schließen. Ein vollständiger500er Ressourcenlauf benötigt
danach ein separates GO. Keine neue bezahlte Wiederholung aus dieser Abnahme
ableiten und keine fehlende500MB-/Zeitqualifikation als bereits erfüllt ausgeben.

Primärbelege: `PAID_CONTROL_REVIEW_FULL_FINAL_SUMMARY.SAFE.json`,
`ACTUAL_DEEPSEEK_CONTROL_SOURCE_ACCEPTANCE.SAFE.json` und getrennte
`SOL_STORAGE_TRANSPORT_AND_CALLERS_CLOSURE.SAFE.json` unter W50.

Belege lokal unter `wave50-common-control-comparison/`, Primärfälle unter
`wave35-auth-state-parts/meter/`. Genau ein oben abgegrenzter bezahlter
Quellenlesecheck; kein Upload, Merge, Deployment oder Production-Eingriff.
