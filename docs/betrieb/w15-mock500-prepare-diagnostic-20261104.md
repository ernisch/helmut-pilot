# W15: begrenzte Prepare-Diagnose vor Ausfuehrungsfreigabe

Stand 04.11.2026. Ausschliesslich Entwicklung und synthetische Pruefung;
**kein geschuetzter Start freigegeben oder ausgefuehrt**.

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
bleiben unveraendert. Platz3 wird weder reserviert noch freigeschaltet. Runtime789
und der Ausfuehrungsbranch werden in dieser Vorbereitung nicht aktualisiert.
Die vorhandenen End500-/Originalempfangsbelege werden uebernommen.

## Noch erforderliches separates GO

Genau einen isolierten Prepare-Diagnosejob auf dem am Draft-PR unabhaengig
abgenommenen exakten Commit in `helmut-ci-originals` genehmigen, einschliesslich
sicherem Fast Forward und genau einer frischen Linkrunde. Umfang: vorhandener
Empfang/isolierte500/0, echte Material- und begrenzte Prepare-Pruefung bis vor
Authority-Installation, sichere Erstfehlerkategorie, begrenzte verschluesselte
Fehlerkapsel, native Nullaktivitaet und bestaetigter Prozessstillstand. Grenzen
wie oben; keine Aktivierung, Einheiten, Modelle, Serienfortsetzung oder Mock500.
Bei FAIL/UNKNOWN sicher stoppen, kein Retry. Exakten Commit und aktuelle
Pflicht-CI im konkreten GO nennen; diese Dokumentation ist selbst kein GO.
