# Begrenzter End500-Kapazitätstrace

Reine Diagnosevorbereitung für `end500-full-capacity-diagnostic`, Scope
`ISOLATED_GITHUB_END500_CAPACITY_DIAGNOSTIC_ONLY`, Profil
`helmut-w15-end500-capacity-diagnostic/1`. Dieses Modul führt keinen Lauf aus
und verändert keinen bestehenden Abnahmevertrag.

`Collector()` erhält über
`observe(sample, phase="UNKNOWN", progress=None, components=None)` ausschließlich
bereits erfasste Rootguard-Proben. Es liest weder Kerneldateien noch Prozesse,
startet keinen Monitor und verändert keinen Grenzwert. `summary()` liefert
ein JSON-fähiges SAFE-Dict; `closed(value)` akzeptiert ausschließlich das feste
Schema oder liefert `None`. Der Aufrufer bindet den Collector an seinen
bestehenden Parent und seine vorhandenen Fehler-/IPC-Anschlüsse, damit der Trace
auch beim Ausfall des Workers erhalten bleibt.

Die bestehende `restore_capacity`-Kette `capture`/`snapshot`/`merge` erzeugt die
übernommene `capacityMeasurement.last` mit sechs Kernelkategorien, Pressure,
Hostreserve und monotoniem Beobachtungszeitpunkt. Der Collector verwendet den
vorhandenen `assess`- und `closed`-Vertrag. Ein übernommener Sicherheitsbefund
verlangt das feste Hartlimit4999999488Bytes, Hostreserve mindestens2147483648,
Swap0 und sämtliche vorhandenen OOM-/Maxereignisse0. Fehler oder fehlende Werte
bleiben sichtbar; die Aggregation ersetzt niemals den tatsächlichen Wächter.

Die alte Peakgrenze2048000000 wird nur als gemessene Überschreitung ausgewiesen.
`legacyPeakScope=COMMON_PARENT_LIFETIME_ALL_PHASES` umfasst den gesamten Parent,
einschließlich einer späteren Sicherung. Daraus entsteht kein Processing-PASS.
Ein gesonderter, bestätigter Processingstopp muss vom bestehenden Ablauf gebunden
werden. `legacyContractAccepted`, `end500Acceptance`, `productionAcceptance` und
`executionAuthority` bleiben immer false. Der echte Kernelpeak wird niemals
zurückgesetzt; seine tatsächliche Eintrittszeit und Zusammensetzung bleiben
UNKNOWN. Die Zeit einer Probe ist ausschließlich deren Beobachtungszeit.

Das Summary bleibt höchstens20480Bytes groß. Erste/letzte Probe, zuerst gemeldeter
Kernelpeak, größter beobachteter Current-Wert, erste unsichere Probe und sechs
Kategorie-Maxima verweisen mit SampleNummern auf deduplizierte `snapshots`.
Diese vollständigen Proben bewahren die gleichzeitig beobachteten anderen
Kategorien. Unterschiedliche Kategorie-Maxima dürfen weder addiert noch als
Zusammensetzung des Kernelpeaks ausgegeben werden. `file` enthält unter anderem
`shmem`; Prozess-PSS wird niemals hinzuaddiert.

Bis128 geschlossene Phaseneintritte werden intern zusammengefasst. Ihre `first`
und `last` folgen `phasePointColumns`; die sechs Maximalpaare folgen
`categoryOrder` und bedeuten jeweils `[beobachteteBytes, beobachteteMonotonicNS]`.
Die kurze History folgt `seriesColumns` und enthält höchstens150 verdichtete
Proben. Bei Platzmangel wird zuerst die History verkürzt. Falls nötig werden
mittlere Phasendetails ausgelassen; `phaseCoverage` benennt vollständig oder
unvollständig erfasste Details samt beobachteter und enthaltener Anzahl.
Erste/letzte Phase, globale Maximalproben, bestätigter Fortschritt und erste
Fehlerprobe werden erhalten. Es gibt keine behauptete vollständige Zeitserie.

Fortschritt wird pro Zähler als `{"value": n, "kind": "EXACT"}` oder ausdrücklich
`CONFIRMED_LOWER_BOUND` übernommen: AuthCAS0..500, UsageRows0..6000,
nativePostimages0..3501. Fehlende/ungültige Angaben bleiben UNKNOWN. Auch die
History bewahrt je Zähler den Unterschied zwischen exaktem Wert und bestätigter
Untergrenze. Das globale `progress` nennt jeweils die zuletzt bestätigte Probe
und deren Zeit; es behauptet keinen neuen Messwert nach einer unbekannten Probe.
`confirm_progress(progress, observed_monotonic_ns)` kann nach mindestens einer
RAM-Probe separat empfangene bestätigte IPC-Zähler sichern. Es akzeptiert nur
monotone Werte und Beobachtungszeiten; es erzeugt keine RAM-Probe und keinen
unbekannten Sicherheitsbefund. `timeBasis=CONFIRMED_PROGRESS_RECEIVED` benennt
die gesonderte Empfangszeit. Die SampleNummer verweist lediglich auf die letzte
vorhandene RAM-Probe und behauptet keine Gleichzeitigkeit.

Optionale Komponenten entsprechen dem vorhandenen `memory_components`-Ergebnis.
Nur stabile Inventur und bestätigte Parentidentität erlauben Rollenwerte.
Vollständige Bindungen liefern `[PSSBytes, "COMPLETE"]`; belegte Teilmengen
liefern `[PSSBytes, "CONFIRMED_LOWER_BOUND"]`. Unbekannte Rollen bleiben UNKNOWN.
Es gibt keine Namensvermutungen, keinen neuen PID-Zugriff und keine geschätzte
Helmut-/Vercel-Zuordnung. Komponentenmaxima enthalten ihre eigene Messzeit und
Phasenbindung. Sämtliche Proben bleiben ausdrücklich nichtatomar.

Gezielte synthetische Prüfung:
`node scripts/lokal.js -- python3 -I -B scripts/w15-github/test_end500_capacity_trace.py`.
Die Fälle verwenden ausschließlich fiktive vorhandene Messwerte: keine echten
Kernelmessungen, Prozesse, Datenbanken, Originaldateien, GPG- oder Netzwerkaufrufe.
Integration, Pflicht-CI und unabhängige Prüfung auf dem tatsächlichen Endstand
sowie ein separates exaktes Commit-GO vor jedem Originallauf bleiben erforderlich.
