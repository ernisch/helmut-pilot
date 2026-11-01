# Mock500: dynamischer isolierter Funktionsvertrag, Version 1

Vertrag und Speicherprofil: `helmut-w15-mock500-host-functional/1`.
Expliziter Modus: `mock500-full-host-functional-gated`.
Scope: `ISOLATED_GITHUB_MOCK500_HOST_FUNCTIONAL_ONLY`.

Dieser eigene Zweig baut auf dem geprüften Code `f157d97f` auf. Er verwendet
unverändert die privilegierte dynamische Hostaufnahme des erfolgreichen End500
Run41325430429. Der tatsächliche End500-Nachweis und seine unabhängige v4-Abnahme
bleiben auf ihrem ursprünglichen Commit erhalten. Der neue Mockkopf braucht eine
unabhängige Kompatibilitätsbrücke zu genau diesem Beleg und ein eigenes Einmal-GO.
Entwicklung, kleine synthetische Prüfungen und CI sind keine Ausführungsfreigabe.

## Speicherwahl und Schutz

Der vorhandene Root-Helfer liest vor Originalzugriff die tatsächliche Maschine,
MemAvailable und sämtliche wirksamen übergeordneten Speichergrenzen. Er erhält
die Grenzen des ursprünglichen Aufrufers. Nur der geschützte Root-Aufnahmebeleg
kann das gemeinsame Limit bestimmen:

`B = floor((min(MemAvailable, alle endlichen Ancestor-Restkapazitäten) - HOST_RESERVE) / 4096) * 4096`

`HOST_RESERVE` bleibt exakt **2.147.483.648 Bytes** (2 GiB, rund 2,15 GB).
Das ist die bestehende technische Hostreserve, keine Anbieterreserve. Ein
fehlender, widersprüchlicher oder nicht nachweisbar vollständiger Beleg stoppt.
Es gibt weder ein Workflowfeld für einen gewünschten Bytewert noch einen
Fallback auf fünf GB. Die 13,320 GB des früheren End500-Runners werden nicht auf
eine neue Maschine übertragen; ihr Wert wird frisch ermittelt.

Die ursprüngliche Aufruferprovenienz wird vor dem privilegierten Prepare erfasst.
Die neue Parentidentität wird unmittelbar danach und vor der Belegbindung
festgehalten, damit auch ein Bindungsfehler in die vorhandene Bereinigung gelangt.
Der Root-eigene Beleg ist an Commit, Run und Nonce gebunden. Der Supervisor liest
ihn unabhängig zurück; nur dessen interne Fassung gelangt in das Worker-Manifest.
Parent, Docker, Python, JavaScript-Treiber, Sicherung und zweite Wiederherstellung
verwenden denselben Wert B und dieselbe Kernel-Lebenszeit.

Jeder vorhandene Ressourcenwächter prüft weiterhin tatsächliches Limit,
Parentidentität, Hostreserve und Ancestor-Restkapazität. Swap, OOM und harte
Speichergrenzereignisse müssen null sein. Kein Peakreset, Cacheeingriff,
Phasenwechsel auf ein anderes Limit oder Verstecken von Hilfsprozessen.
Bestehende Datenbankparameter, Node-Einstellungen und Messwerkzeuge bleiben erhalten.

Die frühere F1-Grenze **4.999.999.488 Bytes** und die historischen Mock-v2-Grenzen
bleiben unverändert. Im neuen Zweig sind sie ausdrücklich Vergleichswerte und
beenden den Lauf nicht. Die tatsächliche Grenze B bleibt hart. Ein Wert über fünf
GB ist weder ein Erfolg der früheren RAM-Abnahme noch ein Anbieterlastnachweis.
Vercel 2 GB je Funktionsinstanz und Supabase Micro 1 GB bleiben getrennte Referenzen;
ihre Eignung ist weiterhin UNKNOWN. Prozess-PSS und Dateicache nicht addieren;
zeitlich verschiedene Maxima und unvollständige Komponentenzuordnung kennzeichnen.

## Vollständiger Funktionsnachweis desselben Laufs

Unverändert erforderlich:

- exakt 500 gleichzeitig aktive synthetische Profile und 500 abgeschlossene Units;
- 1.000 lokale simulierte Modellphasen und null echte Modellaufrufe;
- 1.500 tatsächlich gespeicherte, einzeln vollständig geprüfte Ergebnisse;
- 8.000 echte Sicherheitskontrollen und 17.000 Auditprüfungen;
- fehlende, leere, doppelte, unbrauchbare und technisch fehlerhafte Ergebnisse
  getrennt bilanziert, für einen vollständigen PASS jeweils null;
- vollständige Timingbelege: Auth/CAS jeweils unter 30 Sekunden, Unit unter 60,
  simulierte Providerphase unter 20 Sekunden; UNKNOWN ist kein vollständiger PASS;
- Verarbeitung höchstens 10.800 Sekunden, gemeinsam einschließlich Empfang,
  Restore, Sicherung und Abschluss höchstens 12.600 Sekunden;
- maximale Gesamtlaufzeit innerhalb desselben UTC- und Berliner Kalendertags im
  vorhandenen Fenster 01.–07.11.2026, ohne umdatierte Quellen oder alte Laufrechte;
- maximal 60 Datenbankverbindungen, vollständiger bestehender Plattenplan und
  mindestens 512 MiB freie Reserve;
- finale null aktive Profile und unabhängig bestätigter Stopp eigener Prozesse;
- vollständige verschlüsselte Sicherung, authentifizierte entfernte Rücklesung,
  zweite frische isolierte Wiederherstellung und vollständiger Integritätsvergleich;
- höchstens 0,05 USD zusätzliche Speicherung, genau höchstens ein verschlüsseltes
  Artefakt mit einem Tag Aufbewahrung; keine zusätzlichen Ressourcen.

Originalempfang, Quellenqualifikation, Atomic12ACK, Namespace- und Tagesbindung,
Originalhashes und Empfängerprüfungen werden übernommen. Im neuen kurzlebigen Job
werden die vorhandenen 15 Cipherteile und das vorhandene Elf-Dateien-Archiv über
den bestehenden geschützten Empfängerweg bereitgestellt. Keine Neuqualifikation,
neuen Schlüssel oder erneute Beschaffung im Hauptthread.

Alle Vorbereitungen vor den frischen privaten Links abschließen. Unmittelbar vor
dem einzigen GitHub-Start Restgültigkeit >90 Sekunden und vollständige Parameter
≤65.535 Zeichen prüfen. Bei FAIL/UNKNOWN stoppen; kein Retry oder Linkrefresh.
Originale, Drive, Secrets und alte Versuchsjournale bleiben erhalten. Rückweg:
nur eigene Prozesse kontrolliert stoppen und deren Stillstand prüfen; kein
automatisches Löschen, keine Branchrücksetzung, kein Merge/Deployment/Production.

## Abschlussgrenzen

Der Worker unter UID1000 validiert über den bereits geprüften Stage-Vertrag und
lädt dafür keinen ursprünglichen Checkout nach. Der Root-Supervisor prüft das
Ergebnis unabhängig mit seiner internen vollständigen Hostaufnahme.
An der letzten MAIN-Grenze wird die öffentliche Aufnahme ausschließlich gegen
das bereits geschlossene zurückgelieferte Budget geprüft. Sie wählt kein neues
Limit. Fehler dieser abschließenden Nachprüfung behalten die Phase `closure`.

Die neue Beobachtung
`helmut-w15-mock500-host-functional-observation/1` entsteht erst nach vollständigem
Ergebnis und erfolgreicher Bereinigung. Erst die gesonderte unabhängige Abnahme
`helmut-w15-independent-mock500-host-functional-acceptance/1` darf den tatsächlichen
Mock-Funktionserfolg bestätigen. Sie bindet authentifizierte Jobinputs, Commit,
Run/Job/Nonce, Abschlussquittung, Ergebniszähler, Zeit und Ressourcen desselben
Laufs. Historische pauschale `mock500Acceptance`, RAM- und Anbieter-/Production-
Flags werden nicht auf true gesetzt. Production500 bleibt eine eigene Teststufe
mit gesonderter Freigabe.
