# Mock500: künftige End500-Baseline13 vorbereiten

Der geschützte Ausführungsbranch wurde beim ausdrücklich freigegebenen
Originalempfang auf`13b858b1a1e83a695e1fa64446573b5b550921ea` vorgerückt.
Die tatsächliche Empfangsabnahme wird separat dokumentiert. Empfang ist weder
Original-Restore- noch End500- oder Mock500-Abnahme.

Dieser Mock-Nachfolger ergänzt ausschließlich diesen unveränderten Kopf als
**künftig zulässigen End500-Kandidaten** in`mock500_workflow.END_BASELINES`.
Damit muss nach einer späteren positiven Restore-/End500-Abnahme nicht erst
eine weitere Vorbereitungsrunde für die bekannte Kandidatenkonstante beginnen.
Alle bisherigen Baselines bleiben erhalten; kein Branch wird zurückgesetzt.

Die Zulassung startet nichts. Weiterhin zwingend sind die tatsächliche positive
unabhängige End500-Abnahme auf genau diesem Kopf, vollständige Sicherung/
Fernrücklesung/zweite Rücksicherung, gemeinsamer Lebenszeit-RAM-Nachweis,
500Profile/0aktiv und unveränderte Original-/Empfängerbindung. Ein
Empfangsbericht oder synthetischer Minimalbeleg wird ausdrücklich abgelehnt.
Der spätere Mock-Kopf muss vom akzeptierten End500-Kopf verschieden sein.
Seine tatsächliche statische SourceQualification, unabhängige Eingabebindung,
Bridge zur End500-Quittung und separates konkretes Mock-GO bleiben erforderlich.
Keine heute fehlende Quittung oder Bridge wird als PASS erzeugt.

Die bisherigen500/500-Quellenprüfungen werden übernommen. Gezielte fiktive
Aufnahmetests prüfen nur den zusätzlichen Kandidaten und die fortbestehenden
negativen Tore, ohne Original-, Datenbank-, Provider- oder500er-Ausführung.
RAM-v2, Swap0, Tages-/Zeitgrenzen und Abbruchbedingungen sind unverändert.
Der spätere gemeinsame Mock-Job empfängt seine Eingaben selbst; ein früherer
temporärer Empfangsrunner ist keine dauerhafte Eingabequelle.

Exakter integrierter Kopf, Pflicht-CI und unabhängiger Schlussreview werden im
zugehörigen Draft-PR gebunden. Kein Merge, Deployment oder Production-Eingriff.
