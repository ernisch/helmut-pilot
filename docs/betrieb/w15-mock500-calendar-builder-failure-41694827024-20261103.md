# W15 Mock500: Kalenderlauf endet im Originalbuilder

[Run41694827024](https://github.com/ernisch/helmut-pilot/actions/runs/41694827024),
Job126122486787, Attempt1, Runtime60019f034409a3bd3b9185d3bed1f7ff8d660b57/PR1030:
**FAIL, unabhängig bestätigt. Keine Mock500-Abnahme.**
API-Jobdauer195s (18:32:49–18:36:04UTC). Die spätere Watcherbeobachtung209,389828s
enthält Pollnachlauf und ist keine zusätzliche reine Joblaufzeit.

## Bindung und einmalige Durchführung

Betreiber-GO auf die konkrete Vorlage ausPR1030 übernommen. Sicherer Fast Forward
82d9b14f→60019f03, keine Schutzregeländerung und keine Branchrücksetzung.
Nonce d7445de9-8ec3-425d-b934-53286cf23479; genau eine16er-Linkrunde und ein POST.
Vor POST271,287863s tatsächliche Restgültigkeit und61625Parameterbytes.
Kein Retry/Linkrefresh. Das GO und die Linkrunde sind verbraucht.

Lokale GO→Request→POST→eindeutig neuer Run-Bindung ist konsistent. Die tatsächliche
FAIL-Quittung enthält keine Nonce; auch die gezielte Suche im erhaltenen Joblog
bestätigt sie nicht direkt. `nonceConfirmedByActualReceipt=false` bleibt erhalten.
Das ist keine unabhängig bestätigte tatsächliche Eingangsquittung des vollständigen
Mock500 und wird nicht nachträglich zu einer solchen erklärt.

## Erster belegter Fehler

`mock500-controller-materials-builder`, Stage`builder`, Kind`assertion`,
Kategorie`MATERIALS_MAIN_CHECK_286`. Auf Runtime60019f03 steht dort der Aufruf
`builder.build(...)` in `scripts/synthetik-500-w15-full500-materials.js`.
Welche innere Assertion scheiterte: **UNKNOWN**.

Der öffentliche Adapter `scripts/w15-github/mock500_bindings.js` lädt den
hashgeprüften Originalbuilder und Draft-Code mit virtuellen VM-Dateinamen.
Die bestehende sichere Kategorisierung in `mock500_materials_failure.js`
erfasst MAIN-/BINDING-Frames; sie benennt hier nur den äußeren Aufrufpunkt.
Weder ein konkreter neuer Kalender-/Kostenfehler noch eine bestimmte innere
Builderbedingung ist damit nachgewiesen. Keine spekulative Funktionskorrektur.

## Ressourcenbeobachtung dieses Laufs

| Beobachtung | Wert |
|---|---:|
| Gemeinsamer Kernel-Lebenszeitpeak |2,768GB |
| Frisch zugelassenes dynamisches Hartlimit |13,322GB |
| Dateianteil-Maximum |1,535GB |
| Anonymer Speicher-Maximum |1,131GB |
| Kernelspeicher-Maximum |80,5MB |
| Shared-Memory-Maximum, im Dateianteil enthalten |41,6MB |
| Swap / OOM / harte Grenzereignisse |0 /0 /0 |

Exakte Bytes stehen in der verlinkten SAFE-Auswertung. Maxima sind zeitlich
verschieden und nicht addierbar; Zusammensetzung beim Peak UNKNOWN. Die letzte
Hostreservebeobachtung ist positiv. Keine RAM-Grenzverletzung belegt; keine
Speicheroptimierung oder Grenzerhöhung. Separate PostgreSQL-/Node-/PostgREST-
Spitzen, CPU/Verbindungen sowie eine vollständige Phasenbilanz bleiben UNKNOWN.
Provider-Eignung und reguläre RAM-Abnahme sind nicht bestanden.

## Ergebnis, Sicherung und Bereinigung

Vollständige aktuelle500 Eingabe-/D-/Provider-/Reviewbindungen,500 gleichzeitig
aktive Profile,500Units,1000Mockphasen,1500 einzeln geprüfte Resultate,
8000Sicherheitskontrollen und17000Auditprüfungen sind nicht abgenommen.
Die fünf Ergebnisfehlerklassen bleiben UNKNOWN; keine erfundenen Nullzähler.
Sicherung, authentifizierte Rücklesung, zweite Wiederherstellung und finale
DB-Nullaktivität bleiben ohne positiven Nachweis.

Alle acht äußeren Cleanupfelder PASS: Parentstopp/-leer/-Unitentfernung,
Workerexit/IPC, Servicelauncherexit, Listenerabschluss und Signalrücksetzung.
Sie belegen eigene Prozess-/IPC-Bereinigung, keinen abschließenden DB-Profilstand.
Frische API-Nachkontrolle:0aktive manuelle Läufe,0Artefakte, Branch weiterhin60019f03.
Bestehende Secrets/Drive-Dateien/Originale wurden nicht verändert.

[Unabhängige SAFE-Auswertung](belege/w15-mock500-calendar-failure-20261103/RESULT.SAFE.json).
Private Kontrollskripte, Parameter, Quittungen, Rohlog und Hashinventar sind im
bestehenden privaten Belegbereich vom03.11., Fall01 erhalten; GPG-Arbeitsverzeichnis
und Schlüssel sind ausgeschlossen. Keine privaten Originalinhalte veröffentlicht.
End50041325430429, Empfang41037459441, Quellenvertrag/1 und Simulationskalender/1
bleiben erhalten. Frühere FAILs unverändert; Production500 nicht ausgeführt.

Nächster kleinster Schritt: innere Builder-/Validatorprüfstelle im bestehenden
sicheren Fehlerkanal erhalten und klein synthetisch prüfen. Kein weiterer
vollständiger Originallauf auf Verdacht; dafür ist keine neue Freigabe vorbereitet.
