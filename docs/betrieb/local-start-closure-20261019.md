# Lokale Startfehler: gezielte Korrektur und verbleibende Freigaben

Stand19.10.2026 Istanbul /18.10.UTC. Ausschließlich lokale Entwicklung und kleine
Prüfungen. Der Kandidat `20e61f3f1060` und sein V7-GO bleiben verbraucht. Das
spätere kurze GO mit altem Kandidatenbezug wird nicht für einen Replay oder
einen anderen unbenannten vollständigen Lauf verwendet.

## Korrigierter Tageswechsel

`storage.insertSynthetik500MorningReceipt` nutzte noch den Berliner Tag des
Erzeugungszeitpunkts, während der ausdrücklich zugelassene lokale Mock-Kontext
seine Ausgaben an den echten UTC-Ausführungstag bindet. Der Writer verwendet
nun den vorhandenen `LocalCalendar.generatedDay`-Zugang. Dieser prüft im lokalen
ALS-Kontext Ziel, Politik, Mocktransport und tatsächliche Uhr/Frist frisch;
außerhalb bleibt exakt die bisherige Berliner Regel. Die wirklichen Zeitstempel,
Originaldaten, Quellen und Produktionsregel ändern sich nicht.

46 Kalenderfälle umfassen zehn neue tatsächliche INSERT/readback-Writerfälle:
Standard/fehlerhafter Tag, bloßes ENV ohne Scope, zulässiger Scoped-UTC-Tag,
abweichender Tag, fremder Readback, UTC-Wechsel, Scope-Ende, Frist und
Politikdrift. Zehn Adapter- und zehn Artefaktregressionen bestanden. Gesonderte
Codex-Quellabnahme positiv; kein neuer Datenbank- oder Ressourcenlauf.

## Vollständige HTTP-Fehlerbelege

Der passive Parser zählt alle Socketfehler weiter. Neue Exitbelege der Version2
unterscheiden am Ereigniszeitpunkt vollständig geparste, leere Idle-Zustände von
offenen/unklaren Antworten. Strict lehnt weiterhin Trunkierung, Parserfehler,
unbekannte Bytes, inkonsistente Resetpartition und offene Antworten ab. Alte
Version1-Belege mit Resets erhalten keine rückwirkende Umdeutung.

Der Runner behält den ersten Ablauf-Fehler und sammelt weitere Messfehler.
Valide vorhandene Rohzähler bleiben auch bei strikter Ablehnung sichtbar;
unbekannte Startanzahlen werden `null` statt fälschlich0. Keine neuen Requests,
Retries oder Geschäftsaktionen. Vorhandene finale Konsumenten bleiben kompatibel.

58 reine Framingfälle, neun kleine reale Loopbackfälle und27 Python-Guards
bestanden. Eine veraltete Negativfixture scheiterte zuerst an einem fehlenden
Rezeptfeld; sie wurde vervollständigt und der tatsächliche Ablehnungsgrund
danach exakt geprüft. Kein zusätzlich akzeptierter `KeyError`. Getrennte
Codex-Abnahme positiv; alte12 Start-/12 Endbelege mit161 Resets bleiben ungültig.

Die wegen der zentralen Speicherdatei einmal durchgeführte kanonische
Standard-Offlineregression bestand177/177 Suiten in618s mit lokalem Netzschutz.
Kein Browserlauf, kein Modellaufruf und kein vollständiger Ressourcenlauf.
Das ist kein neuer Unit60-/Auth30-/500er-/Gesamtspeichernachweis.

## Konkrete Grenzen vor einem neuen Lauf

1. Für den19.10. fehlen das ausdrückliche GO zur eng begrenzten Nullbuchergänzung
   vom18.10. in der neuen Kopie
   `helmut_resource_input_20261019_e400dff25393` sowie der gültige Zeitpunkt.
   Der bestehende Vorschlag darf erst am19.10.,03:00Istanbul ausgeführt werden.
   Die bisherige konkrete Korrekturfreigabe galt ausschließlich17.10.
2. 14,403GB waren frei, die unveränderte Pflichtreserve beträgt16.589.934.592B.
   Der neue konkrete Vorschlag entfernt nur diese drei gestoppten Hüllen:
   Storage `4fe244c69409`, Broker `74e59736a122`, App `99cbb1e8a61f`.
   2.734.678.016B sind über alle sechs VFS-Layer inodebereinigt und per
   FIEMAP als ungeteilt nachgewiesen. Trotz Docker-SizeRW0 wurde die vollständige
   Diff geprüft:108 Verzeichnisse/leere Mountpunktdateien, keine geänderte
   nichtleere Datei.13 Metadaten-/Inspect-/Diff-/Logdateien liegen in einem
   vollständig rückgelesenen privaten Archiv. Nur `docker rm` der exakten IDs,
   ohne Force oder Volumeentfernung, ist vorgeschlagen; noch nicht freigegeben.
   DBcontainer, sämtliche Volumes, Loopimage, Images, Originale, Claims und
   Ergebnisbelege bleiben erhalten. Rechnerisch17,138GB danach; erst tatsächliche
   Nachmessung kann den Gewinn bestätigen. Historische Docker-IDs sind nicht
   neu erzeugbar; ihre Identität bleibt vollständig dokumentiert.
3. Danach neue Kandidaten-/Code-/Tagesbindung und alle32 tatsächlichen frischen
   Startbedingungen einschließlich vollständigem Fenster unabhängig prüfen.
   Erst dann genau ein neues kandidatgebundenes lokales Ressourcen-GO anfragen.

Die örtlichen Primärbelege liegen geschützt unter
`/workspace/helmut-parallel-20261015/wave40-local-start-closure/`:
`CALENDAR_TARGETED_TESTS.SAFE.json`, `CALENDAR_INDEPENDENT_ACCEPTANCE.SAFE.json`,
`HTTP_TARGETED_TESTS.SAFE.json`, `HTTP_INDEPENDENT_ACCEPTANCE.SAFE.json`,
`STANDARD_OFFLINE.PRIVATE.log`, `READ_ONLY_NEXT_START_BLOCKERS.SAFE.json` und
`EXACT_THREE_WRAPPER_DISPOSAL_PROPOSAL.SAFE.json`. Das Metadatenarchiv bleibt lokal
privat. Keine Originale oder Secrets wurden übertragen.

Keine Productionaktion, Migration, Aktivierung, Budgetänderung, Merge oder
Deployment ist daraus freigegeben. Kein weiterer vollständiger Lauf wurde
gestartet oder eine neue Einmalfreigabe beansprucht.
