# W15: geplanter Mock500-Wiederanlauf ohne ausreichenden Laufbeleg

Stand 04.11.2026 UTC. **BLOCKED vor Originaldaten, Linkrunde und Dispatch.**
Kein neuer Mock500-FAIL und kein neuer vollständiger Test: null reservierte
Serienplätze, null Linkrunden und null geschützte Jobs. Die Grenze von drei
Gesamtversuchen und sämtliche bisherigen Verträge bleiben unverändert.

## Tatsächlich beobachtet

Die vorhandene Codex-Automation war aktiviert und an den richtigen ursprünglichen
Thread und Workspace gebunden. Ihr gespeicherter Fortsetzungsauftrag traf ein;
die API meldet `last_run_time=2026-11-04T00:04:19.322840+00:00`. Mehrere Abrufe,
einschließlich unabhängiger Prüfung, liefern jedoch
`run_details.last_run=null`, `latest_result=null`, `delivery_status=unknown`.
Der ausdrücklich erforderliche aktuelle `in_progress`-Datensatz mit Codex-
Threadbindung fehlt. Der Zeitstempel und die zugestellte Anweisung ersetzen
diesen Beleg nicht. Ein separat versuchter unmittelbarer Automationsanstoß
scheiterte bereits vor der Ausführung an HTTP404 `Action not found`.

Der aktuelle Betreiberauftrag verlangt bei fehlendem echten Schedulerbeleg
STOP/BLOCKED. Die Automation wurde deshalb pausiert; aktueller Abruf bestätigt
`is_enabled=false`. Keine manuelle Ersatzbindung, keine erfundene Run-ID und
keine Änderung des geprüften Serienadapters. Es gibt keinen unbekannten
Original-Schreibausgang und keinen Grund, das unverbrauchte Journal zurückzusetzen.

## Nachgewiesener Fehler der Metadatenvorbereitung

Ein rein lokaler Bindungsversuch scheiterte vor dem Schreiben von GO/REQUEST:
Der bisherige Metadatenbuilder serialisiert selbst bei Mikrosekunden null
Nachkommastellen. Der unveränderte Startprüfer akzeptiert ausschließlich
`YYYY-MM-DDTHH:MM:SSZ`. Nur die Mikrosekunden der Eingabe zu nullen genügt nicht.

Eine separat erhaltene private Revision ändert ausschließlich die Serialisierung
von Ausstellung und Ablauf auf ganze UTC-Sekunden. Die ursprüngliche Datei bleibt
erhalten; der private Binder verweist auf die geprüfte Revision. Die tatsächliche
UTC-Uhr bleibt hochauflösend für die Prüfung. Die zwei Stunden werden nicht
verlängert; tatsächliche Gültigkeit wird höchstens um einen Sekundenbruchteil
verkürzt. Runtime, Parser, Grant, Nonce, Serienadapter und Journal sind unverändert.

Gezielte metadatenreine Gegenproben: alter Fehler mit/ohne Eingabemikrosekunden
reproduziert; korrigierter echter Builder und bestehende vollständige Validatoren
bei drei Präzisionen PASS; zu früh ausgestellte und exakt abgelaufene Freigaben
weiter abgewiesen. Vier Prüfgruppen PASS über den lokalen Schutzwrapper.
Unabhängige lesende Sol-Max-Prüfung akzeptiert Änderung und Grenzen; kein erneuter
Test durch den Prüfer. Keine Originalinhalte, API-, Datenbank-, Modell- oder
Profilaktionen durch diese Prüfung.

## Erhaltener Stand und nächste Grenze

Kontrollkopf `c6aa32f31f51ee165bd7c55fea8bf80f71122f26`, PR #1033,
Pflicht-CI41730712562 und unabhängige statische Serienprüfung PASS bleiben erhalten.
Erste Runtime sauber auf `789ea3ad49509d8a575a3e545333505f64e0f2ea`,
PR #1032/Pflicht-CI41707992564 PASS; Ausführungsbranch weiterhin `60019f03`.
End50041325430429 und Originalempfang41037459441 übernommen, nicht wiederholt.
Mock500-PASS und Anbieterabnahme weiterhin nicht belegt; Production500 nicht
ausgeführt. Historische FAILs bleiben unverändert.

Aktuelle private Belege liegen beim bestehenden Serienbestand im unveränderten
Workspace. Aktivierte-Konfiguration und ursprüngliche Metadatenprogramme werden
als historische Belege erhalten; aktueller Pausen-/Blockierstatus separat ergänzt.

Nächste konkrete Grenze: entweder ein tatsächlich abrufbarer passender aktueller
Scheduler-Laufbeleg oder eine ausdrücklich genehmigte alternative manuelle
Startbindung. Ein allgemeines GO ersetzt die neueste ausdrückliche Forderung nach
dem echten Schedulerbeleg nicht. Für eine manuelle Alternative wären zuerst der
kleinste getrennte Berechtigungszweig, gezielte Prüfung und unabhängige Abnahme
erforderlich; niemals den vorhandenen Nachweis einfach auf erfolgreich setzen.
Alle übrigen Startbedingungen und die gesamte bestehende Dreiergrenze bleiben
auch dann erhalten. Bis dahin keine Originalausführung und kein automatischer Retry.
