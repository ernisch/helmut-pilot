# W15: begrenzte Prepare-Diagnose vor Ausfuehrungsfreigabe

Stand 04.11.2026. Das spaetere ausdrueckliche Einmal-GO wurde durch den unten
belegten Diagnoselauf verbraucht. **Keine Wiederholung oder Serienfortsetzung.**

## Tatsaechlicher Lauf und kleinste Korrektur

[Run41854268479](https://github.com/ernisch/helmut-pilot/actions/runs/41854268479),
Job126658515304 auf exakt `1ccb592d165ffcde64cfcf8061eef40ce8e7e77b` ist
**FAIL**, unabhaengig bestaetigt. Jobdauer183Sekunden; die Watchermessung von
193Sekunden enthaelt etwa10Sekunden Pollnachlauf. Genau eine16er-Linkrunde/ein POST:
275,069331Sekunden Restgueltigkeit,62.057Parameterbytes,27,984Sekunden READY
bis Uebergabe. Der genehmigte Fast Forward789→1ccb ist bestaetigt; kein Reset.

Erstfehler `mock500-controller-materials-baseline` /
`MATERIALS_MAIN_CHECK_150`, Assertion im echten Materials-Ausgangsvergleich.
Der neue Controller ergaenzte `baseline` um `prepareNativeInventory` und
`prepareDiagnosticCommit` und uebergab dasselbe Objekt als `sourceBaseline`.
Materials vergleicht dieses mit seiner unveraenderten SQL-Projektion der acht
Datenbankfelder. Die beiden lokalen Diagnosefelder erzwingen diese Abweichung;
weitere moegliche Datenbankdifferenzen werden dadurch nicht ausgeschlossen.
**Node-Prepare wurde nicht erreicht; die Ursache von Run41818696152 bleibt UNKNOWN.**

Der minimale Entwicklungsfix kopiert den Materials-Ausgangsstand vor dem
Hinzufuegen dieser lokalen Diagnosefelder. Die exakten Cleanup-/Commitbindungen
bleiben lokal erhalten. Der echte Materials-Vergleich wird nicht gefiltert oder
gelockert; keine SQL-, Quellen-, Kalender-, Ressourcen- oder Production-Aenderung.
Eine kleine Python→Node-Gegenprobe verwendet den echten Controller-Deskriptor,
die echte Materials-State-Funktion und deren Ausgangsvergleich gegen eine eigene
synthetische SQL-Projektion. Geaenderte Hashes, Zaehler und zusaetzliche Felder
muessen weiterhin scheitern. Pflicht-CI und unabhaengige Abnahme werden auf dem
exakten Fixkopf am zugehoerigen Entwicklungs-PR gebunden. Kein neuer Originallauf.

Die authentifizierte geschlossene Quittung stimmt mit der erwarteten Nonce
ueberein. Bestaetigt:500Profile/aktiv0, Fachfelder unveraendert, natives Inventar
unveraendert, Units/Providerphasen0, AuthorityInstalledfalse, Container-/Watcher-
Stopp und alle acht aeusseren Bereinigungen PASS. Prozessstillstand und keine
aktiven manuellen Laeufe unabhaengig nachgelesen. Kernelpeak1,916GB bei13,375GB
Hartlimit; Swap/OOM/harte Grenzereignisse0. Andere Komponentenspitzen UNKNOWN;
die zwei Samples und Dateicachewerte erklaeren nicht die Peakzusammensetzung.

Genau eine verschluesselte Fehlerkapsel, Artifact13335454970:10.699Cipherbytes,
10.893Bytes API-Archiv,86.399Sekunden Aufbewahrung; entfernte Ruecklesung und
Authentifizierung bestaetigt. Dies ist kein vollstaendiger Ergebnisbackup- oder
Mock500-Nachweis. Maximale Speicherung0,05USD, keine echten Modellaufrufe.
Originale/Drive/Secrets und die alten Serien-STOPs unveraendert; zwei reservierte
Serienplaetze, kein Terminal, Platz3 weiterhin gesperrt. Kein `complete_child`.

Erhaltene private Primaerbelege ausschliesslich im bestehenden Bereich
`/workspace/helmut-w15-private-evidence-20261104/MOCK500_PREPARE_DIAGNOSTIC_01/`:
Operatorgrant, frische Bindungen, Vorflug, POST-/Laufzuordnung, authentifizierter
Log, geschlossene Quittung, tatsaechliche API-Metadaten und unabhaengige Abnahme.
Livecase `/tmp/w15pd1`; keine Originaldateien oder Rohmeldungen im Repository.

## Zweck und genaue Grenze

Die innere Ursache von Run41818696152 bleibt UNKNOWN. Die gepruefte
[Fehlerweitergabe aus PR1038](w15-mock500-prepare-failure-20261104.md) wird
unveraendert als sicherer Kanal verwendet. Die vorhandene Materials-Diagnose
erhaelt einen eigenen, ausdruecklich zu genehmigenden Prepare-Vertragszweig:

| Bindung | Wert |
| --- | --- |
| Bestehender Workflowmodus | `mock500-materials-diagnostic-gated` |
| Neuer Vertrag | `helmut-w15-mock500-prepare-diagnostic/1` |
| Eigener Scope | `ISOLATED_GITHUB_MOCK500_PREPARE_DIAGNOSTIC_ONLY` |
| Bestaetigung | `GO_ONE_ISOLATED_PREPARE_DIAGNOSTIC_NO_ACTIVATION_UNITS_MODELS` |
| Bezug | ausschliesslich Run41818696152 |
| Environment | `helmut-ci-originals` |
| Ausfuehrungsbranch | `codex/w15-github-end500-preparation-20261028` |

Erst ein neues Betreiber-GO darf exakten neuen Commit, Codequalifikation,
Eingabehash, vorhandene End500-Abnahme, Kalender, historischen Quellenvertrag,
Gueltigkeit und neue Nonce binden. Eine normale Umgebungsvariable, ein Flag,
altes Materials-/Full500-GO oder der gestoppte Seriengrant erzeugt diese
Berechtigung nicht. Der bestehende Scheduler- und Serienpfad bleibt unveraendert.

Nach gesondertem GO darf der bestehende Empfang 15 Cipherteile und das vorhandene
Elf-Dateien-Archiv in einer frischen isolierten Datenbank mit 500/0 vorbereiten.
Die echten 500 Eingaben, Originalbuilder, D-/Provider-/Reviewbindungen und der
vollstaendige C-Auftrag werden wie bisher geprueft. Materials erhaelt zwingend
`--atomic-prepared0`; der Cleanup-Kontext wird exklusiv vor dem nativen Schreiben
gesichert. **Keine Profilaktivierung, Einheiten oder Modellaufrufe.**

Die reale Node-Prepare-Funktion prueft Stored Command, Installation-Content-Open,
vollstaendigen C-Auftrag, Current Inputs, Auth-Lesung sowie Control-/Booksbindung.
Danach kehrt sie vor lokalem GO, direkten Starttoren und Authority-Installation
zurueck. Der vorhandene Runtime-Arbeitsordner bleibt erhalten; der Diagnosezweig
erhaelt nicht das Runtime-Atomic-Flag mit seinem abweichenden Ordner. Run und
Atomic-Check sind in diesem Zweig technisch abgewiesen.

Ein erfolgreicher Diagnoseabschluss bedeutet ausschliesslich diese begrenzte
Pruefung samt sicherem Abschluss. Liegt der alte Fehler erst im ausgeschlossenen
Admission-/Installationsabschnitt, bleibt seine Ursache UNKNOWN; kein Mock500-
oder Production-Erfolg wird daraus abgeleitet.

## Sicherheits- und Fehlerabschluss

900 Sekunden Verarbeitung, 1080 Sekunden Worker und maximal 20 Minuten Job.
Dynamisch berechnetes tatsaechliches Hostlimit, exakt 2.147.483.648 Bytes Reserve,
Swap/OOM/harte Grenzereignisse null und mindestens 536.870.912 Bytes freie Platte.
Keine geaenderten RAM-Vertraege oder Speicheroptimierung. Alte Zeit-/Tages- und
Quellenbindungen bleiben Pflicht; keine Datumsverlangerung durch diesen Vertrag.

Alle Vorbereitungen und der unabhaengige Vorflug liegen vor frischen Links.
Nach neuem GO hoechstens eine 16er-Linkrunde und ein POST, Restgueltigkeit >90s,
Parameter insgesamt <=65.535 Zeichen, GPG-Kontrollpfad <=79 Byte. Kein Retry oder
Refresh; unklarer POST-Ausgang wird nicht durch einen weiteren Start ersetzt.

Der bestehende geschlossene Fehlerkanal veroeffentlicht nur feste Stufe,
Kategorie und Art. Originalmeldungen bleiben privat. Die vorhandene verschluesselte
Fehlerkapsel darf zusaetzlich nur feste Prepare-Log-/Erstfehler-/Checkdateien
aufnehmen: begrenzt auf 256 KiB Auswahl und 1 MiB Ciphertext. Keine Kommandopakete,
Schluessel, Originaldateien oder privaten Logs in oeffentlichen Ausgaben.
Höchstens eine Kapsel fuer einen Tag; maximal 0,05 USD neue Speicherung, null
Modellaufrufe. Eine Fehlerkapsel ist kein vollstaendiges Ergebnisbackup.

Vor der Nullaktivitaetspruefung werden eigene Mutatoren, Gateway und SQL-Sitzungen
gestoppt. Danach ausschliesslich lesender Nachweis: 500 Profile, aktiv0,
unveraenderte Fachfelder und tatsaechlicher nativer Zustand. Ein positiver
Prepare-Abschluss verlangt den exakt gebundenen `vorbereitet`-/aktiv0-Eintrag.
Bei fruehem Fehler ist dessen beobachtete Abwesenheit zulaessig; fehlt schon der
Cleanup-Kontext, muss das tatsaechliche native Inventar unveraendert sein.
IO-/RPC-Fehler oder ein fehlender Beleg sind kein Abwesenheitsbeweis. Unerwartete
Aktivierung wird nicht durch nachtraegliche Ruecksetzung zum Erfolg umgedeutet.
Alle acht aeusseren Bereinigungspruefungen und realer Prozessstillstand bleiben
Pflicht. Fehlende oder unsichere Zustandsbelege bleiben UNKNOWN und sperren Starts.

Der sichere Rueckweg: nur eigene Prozesse kontrolliert beenden und Stillstand
nachpruefen, Diagnosepfad nicht weiter verwenden. Keine automatische Loeschung,
Branchruecksetzung, Veraenderung von Secrets, Drive oder Originalen.

## Gezielte Abnahme

Python prueft echte Admission-/Dispatcher-Grenzen, Controllerreihenfolge,
Prepare-Erstfehler, streng lesende Nullaktivitaet, JSON-SQL-Rueckgabe,
geschlossene Ergebnisformen und feste verschluesselte Belegauswahl. JS prueft
echte Materials-/Runtime-Funktionen, vorzeitigen Return, alte Standardpfade und
die reale oeffentliche Action mit synthetischen Quittungen. Negative Faelle
umfassen falsche/abgelaufene Bindungen, Nichtnull-Zaehler, Ausfuehrungsrechte,
falsche native Zustaende, Symlinks, RPC-Fehler, private Extras und Ressourcenfehler.
Keine Originale, native Datenbank, Kryptografie oder geschuetzten Jobs in diesen
Entwicklungspruefungen. Pflicht-CI und unabhaengige Sicherheitsabnahme muessen
den tatsaechlichen finalen Commit bestaetigen; Belege stehen am Draft-PR.

Die Serienplaetze, Journal, UNKNOWN-/STOP-Anker und pausierte Ausfuehrungsautomation
bleiben unveraendert. Platz3 wird weder reserviert noch freigeschaltet. Die fruehere
Vorbereitung aktualisierte die Runtime nicht; erst das spaetere ausdrueckliche GO
autorisierte den oben belegten Fast Forward auf1ccb. Der Fixzweig ist getrennt.
Die vorhandenen End500-/Originalempfangsbelege werden uebernommen.

## Erneutes separates GO erst fuer den geprueften Fixkopf

Genau einen isolierten Prepare-Diagnosejob auf dem am Draft-PR unabhaengig
abgenommenen exakten Commit in `helmut-ci-originals` genehmigen, einschliesslich
sicherem Fast Forward und genau einer frischen Linkrunde. Umfang: vorhandener
Empfang/isolierte500/0, echte Material- und begrenzte Prepare-Pruefung bis vor
Authority-Installation, sichere Erstfehlerkategorie, begrenzte verschluesselte
Fehlerkapsel, native Nullaktivitaet und bestaetigter Prozessstillstand. Grenzen
wie oben; keine Aktivierung, Einheiten, Modelle, Serienfortsetzung oder Mock500.
Bei FAIL/UNKNOWN sicher stoppen, kein Retry. Exakten Commit und aktuelle
Pflicht-CI im konkreten GO nennen; diese Dokumentation ist selbst kein GO.
