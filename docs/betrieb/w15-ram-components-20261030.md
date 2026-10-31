# W15: optionale RAM-Aufschlüsselung für einen späteren freigegebenen Lauf

Stand: 30.10.2026. Die erste einfache Fassung liegt getrennt vom ausgeführten
Restorekopf und von den Ressourcenwächtern. Sie ist keine neue Startvoraussetzung.
Die Bibliothek `memory_components.py` wird durch keinen bestehenden Ablauf
aufgerufen. Der direkte Programmstart zeigt ausschließlich einen inerten Plan.
Einbindung und tatsächlich gemessener Aufwand bleiben für einen späteren
passend freigegebenen Lauf zurückgestellt. Kein aktueller Test wurde verändert,
unterbrochen oder wiederholt; keine RAM-Grenze wurde geändert.

## Tatsächlich vorliegende Messung

Der unabhängig geprüfte Originalrun
[41073062264](https://github.com/ernisch/helmut-pilot/actions/runs/41073062264)
brach korrekt an der gemeinsamen Peakgrenze ab. Seine öffentliche Quittung
enthält keine Prozess-PSS und keine damalige `memory.stat`-Aufteilung.

| Bereich | Tatsächlich gemessen | Bedeutung |
| --- | ---: | --- |
| PostgreSQL | UNKNOWN | Kein separater Prozesswert im Originallauf |
| Node.js / Helmut | UNKNOWN | Anwendung und Testtreiber nicht getrennt gemessen |
| PostgREST | UNKNOWN | Kein separater Prozesswert im Originallauf |
| Teststeuerung und Hilfsprozesse | UNKNOWN | Kein separater Prozesswert im Originallauf |
| Sicherungsprozesse | UNKNOWN | Innere Arbeitsphase beim Abbruch unbekannt |
| Dateicache | UNKNOWN | Kernelkategorie beim Originalabbruch nicht erfasst |
| Gemeinsamer aktueller RAM | 2.047.098.880 Bytes | Abgelehnter Readback **vor** dem Prozessstopp |
| Gemeinsamer Lebenszeitpeak | 2.048.073.728 Bytes | Maximum des unveränderten gemeinsamen Parents |
| Reserve am Lebenszeitpeak | 511.926.272 Bytes | 73.728 Bytes unter den verlangten 512.000.000 |
| Swap | 0 Bytes | Vorhandener gemeinsamer Kernelbeleg |

Die Peakgrenze 2.048.000.000 Bytes wurde um 73.728 Bytes überschritten;
das harte Limit blieb 2.560.000.000 Bytes. Alle acht ursprünglichen
Bereinigungsprüfungen sind PASS. Die vorhandene synthetische 32-MiB-Probe ist
laut CI-Schrittmetadaten erfolgreich; ihre numerische SAFE-Quittung wurde nicht
angenommen. Daraus werden hier keine zusätzlichen Messwerte erfunden.
Vollrestore, End500 und Mock500 bleiben ohne positive vorherige Stufenabnahme.

## Kleine vorbereitete Messschnittstelle

Der spätere Eigentümer eines bereits vorhandenen W15-Parents kann ausdrücklich
`observe(parent, expected_identity, role_bindings)` aufrufen. Es werden weder
Cgroups noch Prozesse gestartet. Die Rolle ist ausschließlich ein vom Eigentümer
gebundenes Tupel aus PID, Prozessstartzeit und einer der sechs festen Kategorien.
`node` allein ist keine Helmut-Zuordnung. Wenn Anwendung und Testtreiber im selben
Node-PID laufen, kann das Betriebssystem sie nicht trennen: widersprüchliche
Rollenzuordnungen desselben PID bleiben UNKNOWN. Es gibt keinen Blick in
`cmdline`, `environ`, SQL, private Dateien oder Logs.

Der Beobachter prüft dieselbe Parentidentität sowie PID-Bestand, Startzeit und
Mitgliedschaft vor und nach dem Prozess-Readback. Reads sind auf 64 KiB,
128 eindeutige PIDs und 64 Cgroups begrenzt. PID-Wiederverwendung, fehlende
deklarierte Prozesse, fehlende Rechte und unvollständige Bestände bleiben
UNKNOWN. Ein bestätigter leerer Parent ohne offene Prozessclaims darf 0 ergeben.
Für PostgreSQL unter einem anderen Benutzer kann `smaps_rollup` unlesbar sein;
dafür werden weder sudo noch zusätzliche Fähigkeiten oder Rechte eingerichtet.
Gewöhnliche Diagnosefehler liefern UNKNOWN, vorhandene Prozesssignale bleiben
unverändert. Die Bibliothek entscheidet niemals über Ressourcenabnahme oder GO.

## Zwei getrennte Sichten ohne doppelte Speicherzählung

* **Prozesssicht:** `/proc/<pid>/smaps_rollup` liefert PSS, den proportionalen
  Anteil geteilter Speicherseiten. Jede eindeutige Prozess-PID wird höchstens
  einmal gezählt. RSS sowie `Shared_*` werden nicht hinzuaddiert.
  `observedPSSBytes` ist gegebenenfalls nur die bekannte Teilmenge einer Rolle;
  `completeComponentPSSBytes` bleibt bei unvollständiger Bindung UNKNOWN.
* **Gemeinsame Kernelsicht:** `memory.current`, `memory.peak`, die bestehenden
  Limit-/Swapwerte und sechs `memory.stat`-Kategorien werden separat ausgegeben.
  `file` enthält auch tmpfs-/Shared-Memory-Anteile; `shmem`, Dirty und Writeback
  sind keine zusätzlichen addierbaren Blöcke. Dateicache überlappt mit den in
  Prozess-PSS enthaltenen Dateimappings. Deshalb gibt es keine Rechnung
  „PSS plus Dateicache“ und keinen erfundenen Rest zur Gesamtsumme.

PSS ist keine Cgroup-Abrechnung: geteilte Mappings außerhalb des Parents,
Kernelverbrauch und mögliche explizite Hugetlb-Seiten verhindern eine exakte
Gleichsetzung. Hugetlb-Anteile werden nicht zusätzlich aus unbekannten
Zählregeln aufsummiert. Die Beobachtungen sind nicht atomar und keine Aufteilung
des historischen Gesamtpeaks. Kurzlebige Prozesse können zwischen Snapshots
entstehen und enden. Der tatsächliche Messaufwand und sein Einfluss auf einen
späteren Test sind noch nicht gemessen; es gibt keine Hintergrundschleife.

## Vorsichtige Einordnung für Vercel

Derzeit ist auch der Helmut-Anteil UNKNOWN. Ein später eindeutig gebundener
Helmut-Node-PSS wäre eine vorsichtige Prozessaufnahme der Anwendung in genau
dieser GitHub-Last und Laufzeitumgebung. Er ist weder ein Vercel-Messwert noch
eine garantierte Obergrenze für einen anderen Betrieb.

Die isolierte PostgreSQL, PostgREST, Teststeuerung und Sicherung sind gesonderte
Testdienste. Ihr gemeinsamer GitHub-Peak darf nicht als Helmut-Function-RAM bei
Vercel ausgegeben werden. Vercel-Runtime, kalter oder warmer Prozess,
gleichzeitige Anfragen und gemeinsame Instanznutzung können die Werte verändern.
Auch ein bekannter PSS erlaubt keine belastbare Rechnung „RAM je Profil“ durch
Division des gemeinsamen Peaks durch 500. Eine passende Vercel-Instanzgröße,
Kostenobergrenze oder Production-Kapazität wird hieraus nicht abgeleitet.
Es gibt keine Konfigurationsänderung, neue Ressource oder Deploymentempfehlung.

[Vercel: Function-Speicher konfigurieren](https://vercel.com/docs/functions/configuring-functions/memory)
beschreibt Plattformkonfiguration, nicht den tatsächlichen Verbrauch dieses Projekts.

## Gezielte Entwicklungsprüfung

Nur kleine erfundene Proc-/Cgroup-Dateien: PSS geteilter Seiten und eindeutiger
PIDs, Rollenkollision, PID-Wiederverwendung, fehlende Rechte, fehlende deklarierte
Prozesse, instabiler Bestand, unbekannte oder übergroße Zähler, Symlinks und rein
lesende Dateizugriffe. Keine echte Hostmessung wird als GitHub-Beleg verwendet.
Keine Originaldateien, Datenbank, GPG, Netzwerk-, Modell- oder 500er-Ausführung.
