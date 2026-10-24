# Native Auth-Zeitanteile: begrenzte Komponentenmessung

Stand: 25.10.2026 Istanbul, Entwicklungsbranch
`codex/native-auth-critical-path-20261025`, Basis PR940,
`0f643b50084c3b3b11fb0279ab0acef6c09bdcaa`.

Status: **teilweise abgeschlossen; Quellen vorbereitet, echte Ausführung blockiert**.
Kein Motor-Zeitfix und keine tatsächlich gemessene Einsparung.

## Entscheidung

3ac scheiterte weiterhin mit rund65,15s und9/16Kontrollen. Die R-Buchung bei
44,683128s plus19,9s Wartezeit verlangt mehr als4,583128s Einsparung plus die
unbekannte Abschlussdauer H. Der verworfene Schnittstellenwrapper wird nicht
erneut untersucht. Seine sieben Own-Aufrufe benötigen8,487944036s; bereits
prepare/psql/accept enthalten4,130726671s. psql allein enthält3,983141142s;
eine reine Optimierung nur dieser sieben Schreibsitzungen reicht als alleiniger
belegter Entfernungsrahmen nicht aus. Es fehlen innere tatsächliche Zeitanteile.

Native Fusion könnte wiederholte OLD-/NEW-Graph- und Own-Projektionsarbeit
innerhalb EINER STABLE-Snapshot-/Principal-Sicht reduzieren. Writer- und
Runtime-RLS-Sichten dürfen nicht allein wegen gleicher Transaktion gegeneinander
ausgetauscht werden. Die ausreichende Zeitwirkung ist unbekannt; kein spekulativer
Kernumbau wurde umgesetzt. PostgreSQL startet mit JIT an. Ob die langsamen
Abfragen JIT tatsächlich auslösten oder wie viel Zeit darauf entfällt, ist unbekannt.
JIT wurde nicht auf Verdacht umgestellt. Funktionsstatistiken allein beweisen
keine JIT-Auslösung und keine Einsparung.

## Fertige Vorbereitung

`local-unit-native-function-profile.js` ist ein separater Komponentenprüfer.
Der normale Transaktionsguard bleibt byteidentisch zu PR940:
SHA256 `494e74fe0326601bc567a07daf6100929acebacafaf47cf473babd01cca95f63`.
Nur `--profile-functions` zusammen mit dem expliziten
`--diagnose-native-transaction-guard --transaction-guard-case same-root-usage`
wählt den fest gebundenen Profiler. Bei Unit/anderen Modi oder falschen Fällen
wird die Option abgelehnt. Keine freie Programmpfadwahl.

Genau vier bestehende echte Compiler-Schreibvorgänge werden instrumentiert:
`CLAIM_STATE`, `RESERVE_D`, `SEND_D`, `SAME_ROOT_USAGE`. Compiler-SQL auf stdin,
Original-CAS, Rechte, ACKs, sämtliche Grenzen und tatsächliche Exit-/EOF-Prüfungen
bleiben erhalten. Nur diese vier Sitzungen aktivieren `track_functions=all` und
fordern nach dem Compiler einen normalen Statistikflush an. Zwei zusätzliche
rein lesende Abfragen vergleichen die frischen qualifizierten Funktions-OIDs,
Signaturen und Quellhashes mit `pg_proc` und den tatsächlichen Zählern.
Kein Statistikreset und keine Datenbank-/Dateicachebereinigung.

Fehlende/inlinierte Beobachtungen bleiben OPEN/null. Genau vier beobachtete
CoreCAS-Aufrufe sind Pflicht. Inklusive Funktionszeiten dürfen nicht addiert
werden. Die veröffentlichte Datei heißt exakt
`TRANSACTION_GUARD_FUNCTION_PROFILE.SAFE.json`; der Controller liest dieselbe
Datei mit ihrem echten Pin unabhängig zurück. Ein vor Ausführung gefundener
Dateinamenfehler wurde durch diese konsistente Benennung behoben; die vorhandene
geschlossene Namensregel wurde nicht gelockert.

## Gezielte Prüfungen

- 50 reine Profil-Auswertungs-/Publikationsprüfungen, einschließlich echter
  Publisherfunktion gegen ein vollständiges In-Memory-Dateisystem: PASS.
- 8 Routingtests mit positiven und negativen Unterfällen: PASS.
- 52 bestehende Transaktionsgrenzen und33 Controllerprüfungen: PASS.
- JavaScript-/Python-Syntax und Diffprüfung: PASS.
- Tatsächlicher Quellenconsumer im neuen Worktree:8/8Eingaben,
  20Original-/38nativeDefinitionen und9Helper konsistent. Das ist eine
  Quellenprüfung und kein neuer nativer OID-/Datenbanknachweis.
- Unabhängiger SOL-Quellenreview nach dem Dateinamenfix: PASS, keine offenenP0/P1.

Keine echten Komponenten-/Unit-/500er-Läufe, Datenbankstarts, Löschungen,
Production-Aktionen, Merges oder Deployments. Zwei DeepSeek-Leseaufträge lieferten
Codebefunde; zwei Schreibversuche lieferten keine Änderungen. Nach fehlendem
Kontext beziehungsweise ausgeschöpftem Ausgabelimit übernahm SOL die Portierung.
Entwicklungsroutergebühren sind unbekannt und werden nicht als0 ausgewiesen.
PR941 und dessen CI-Fehler bleiben separat erhalten.

## Nächste konkrete Freigabe

Der [GO-Plan](belege/native-auth-kernel-profile-20261025/GO_PLAN.SAFE.json)
bindet die vorbereiteten Quellen. Er ist **keine erteilte Freigabe** und behauptet
keine Startbereitschaft. Vor Ausführung fehlen mindestens ausreichender freier
Platz sowie die frischen Original-/POSTRUN-/Runtime-/Kernel-/Mount-/Prozess-/
Zeit-/Once-Bindungen. Tatsächliche neue Datenbank-OIDs können erst im genehmigten
gemessenen Aufbau entstehen und müssen dort vor den vier Schreibvorgängen durch
die unveränderten echten nativen Qualifier bestätigt werden. Alte OIDs, Counts,
Claims, GOs und Prüfbelege werden nicht als neue Laufrechte übernommen.

Vorgesehener Umfang: genau ein gemessener lokaler Aufbau und ein Vier-TX-Fall auf
einer neuen isolierten authentischen V12-POSTRUN-Arbeitskopie; vor Start mindestens
10.737.418.240B frei, währenddessen mindestens8GiB. Kein Motor, Provider, Entry,
Unit60, vollständiger500er oder Löschen. FAIL/UNKNOWN stoppen ohne Retry.
Alle Originale, Rohbelege und Arbeitskopien bleiben erhalten. Erst ein ausreichend
wirksamer, qualifizierter Kernfix rechtfertigt die spätere Unit60-Vorbereitung.

Geltende Endziele bleiben unverändert: Unit60, Auth30, beide19,9s-Wartezeiten,
16frischeKontrollen,3gültigePositionen und vollständiger19er-Abschluss;
gemeinsamer Peak≤1.548.000.000B für500.000.000B Reserve beim vollständigen Nachweis.
Der gescheiterte Neun-Kontrollen-Lauf beweist diese Reserve nicht.
