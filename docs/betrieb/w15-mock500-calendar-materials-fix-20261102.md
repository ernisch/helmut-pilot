# Mock500: belegter Kalenderfehler und GPG-Abschlussbeleg

## Tatsächliche Kapsellesung

Der ausdrücklich genehmigte einmalige Leser lief in `helmut-ci-originals` als
Run41486209469, Job125417129266, auf61d7b5c9096782c865661b98550a1cea7ac39647.
Neue Nonce4450ad83-53f3-469b-80da-574f7cd1d495; genau ein POST/204,718Zeichen
Gesamtparameter. Der Ausführungsbranch wurde sicher ohne Force von582ca4e6 auf61
vorgespult. Schutzregeln, Secrets, Drive und Originale blieben unverändert.

**Gesamtstatus FAIL**,12Sekunden. Admission und Cipherdownload waren erfolgreich;
die private Lesestufe endete in `agent-close`. Kein Retry oder Linkrefresh.
Der tatsächliche GPG-Agentstopp dieses Runs bleibt UNKNOWN; der historische
Fehlschlag wird durch eine spätere Korrektur nicht umgewertet.

Die tatsächlich erhaltene geschlossene Projektion entsteht im geprüften Code
erst nach erfolgreicher GPG-Entschlüsselung einschließlich GOODMDC und vollständiger
Archiv-/Manifest-/Dateihashprüfung. Sie enthält übereinstimmend aus Outcome und
Node-Zeuge `MATERIALS_BINDING_CHECK_123`, Typassertion, Phasecalendar. Der Python-
Zeuge verweist auf die öffentliche Controllerzeile426, die den fehlgeschlagenen
Materials-Prozess weitergibt. Keine abgeschnittene Quelle oder widersprüchliche
Erstfehlermeldung wurde verwendet. Rohmeldung, Stack und private Pfade bleiben privat.

Die Kapsel berichtet im historischen Diagnosezustand null aktive Profile und
unveränderte Fachfelder, ohne eigenen nativen Kontext. Das ist eine historische
Kapselbeobachtung vor Containerstopp, keine neue DB-Lesung oder Mock500-Abnahme.
Vollständige Einheiten-, Ergebnis-, Sicherheits-/Audit- und Sicherungszähler fehlen
weiterhin. Die acht äußeren Bereinigungen des Quellruns41455150159 bleiben getrennt.
Quelle05 und aktueller Leselauf06 sind im vorhandenen privaten Belegbereich erhalten.

## Materialursache und kleinste Korrektur

Der belegte Pfad auf582ca4e6 und61 ist bytegleich:
`mock500_bindings.calendarFixture` ruft den echten Full500-Fixturekonstruktor auf.
Dieser verwendet den bestehenden Unit0-Konstruktor, dessen erste Providerprüfung
`aiProviderName() === "azure"` verlangt. Der tatsächliche Materials-Prozess startet
bereinigt; `localEnvironment` fordert die Abwesenheit von Anbieterzugangsdaten und
setzt keine Azure-Mockvariablen. Damit liefert der erreichte Konstruktor `none`.
Die Kalenderadaption hatte den erforderlichen lokalen Mockkontext nicht übernommen.

Der Fix stellt ausschließlich für diesen synchronen Konstruktoraufruf die drei
bereits im Mock-Runtimepfad verwendeten Variablen ein: vertraglicher Azure-Endpunkt,
ausdrücklich ungültiger lokaler Mock-Keymarker und vertragliches Modell. Ein
`try/finally` stellt alle vorherigen Werte beziehungsweise ihre Abwesenheit wieder
her. Es wird kein Provider installiert und kein HTTP- oder Modellaufruf ausgeführt.
Die vorhandenen Konstruktor-, Qualitäts-, Output- und Hashprüfungen bleiben aktiv.
Originale, qualifizierte Entwurfs-/Reviewantworten, Quellen- und Profildaten werden
nicht verändert oder neu qualifiziert; nur die bereits erlaubte aktuelle
Anfragebindung wird wie vorgesehen konstruiert.

Eine kleine erfundene kohärente Zeile durchläuft die echten A/F/B/L/AI/Provider-
Konstruktoren. Vor dem Fix entsteht genau `none !== azure` an der erreichten
Providerprüfung; danach gelingt die vollständige Fixtureadaption. Entwurf, Review,
ihre Hashes und historische Zeile bleiben unverändert, der Tages-Anfragehash ändert
sich. Ein falscher Reviewhash wird weiterhin abgewiesen; auch dann bleibt die
Providerumgebung anschließend bereinigt. Kein Original, keine DB, keine 500er-
Verarbeitung und kein echter Modellaufruf wurden für diese Gegenprobe verwendet.

## Separater GPG-Abschlussfehler

Eine Gegenprobe mit einem tatsächlichen leeren GPG-Agenten ohne Schlüssel belegt:
Ein Daemon kann seinen Unix-Socket vor dem Fork erzeugen. `SO_PEERCRED` liefert
dann dessen Erzeuger-PID statt der PID des tatsächlich bedienenden Agenten. Der
alte Stoppbeleg schlug deshalb fehl, obwohl der unabhängig beobachtete leere
Agent nach dem vorhandenen gezielten GPG-Stopp tatsächlich beendet war.

Der kleine Fix fragt auf demselben privaten eigenen Socket begrenzt `GETINFO pid`
ab. Die Peer-UID-Prüfung, bestehender homedirgebundener GPG-Stopp und tatsächlicher
pidfd-Exitnachweis bleiben erhalten. Ungültiges Protokoll, fehlender PID-Beleg oder
ein reines POLLNVAL-Ereignis erzeugen weiterhin keinen PASS. Drei gezielte Fälle
einschließlich eines realen leeren Agenten bestanden. Keine Schlüssel wurden
erzeugt oder importiert, keine Kapsel erneut gelesen und kein geschützter Job
für diese Entwicklung gestartet.

## Freigabegrenze

Die Kapsellesefreigabe ist verbraucht. Es gibt keinen weiteren Readjob. Entwicklung,
gezielte Tests, Commit/Push, Draft-PR, Pflicht-CI und unabhängige Prüfung sind
weiterhin freigegeben. Der tatsächliche neue Integrationskopf benötigt diese
Nachweise vor jeder geschützten Ausführung.

Das bestehende bedingte GO für genau einen neuen vollständigen Mock500 ist
unverbraucht. Der Startcode verlangt frische strukturelle Freigabe-, Request-,
Authority-, Quellen-, Eingabe-, Bridge-, Review- und CI-Bindungen auf den exakten
neuen Kopf sowie eine neue Nonce; keine alte Freigabedatei oder ein verbrauchtes
Journal darf wiederverwendet werden. Der Launcher selbst darf den Branch nicht
vorsetzen. Ein separat sicherer Fast Forward und anschließender exakter Readback
sind vor seinem Prepare nötig. Unveränderte GitHub-Environment-/Branchschutzregeln
und tatsächlich konfigurierte Freigabeschritte bleiben verbindlich.

Erst nach belegter Korrektur, Pflicht-CI, unabhängiger Abnahme und frischem vollständigem
Preflight kann das bestehende bedingte GO greifen. Dynamischer Hostschutz mit der
unveränderten Reserve, Zeit-/Tagesfenster, RAM-/Swap-/OOM-/Grenzereigniswächter,
Plattenplan, Kosten, sämtliche500/1.000/1.500/8.000/17.000-Erwartungen,
Quellen, Sicherung/Rücklesung/Rücksicherung, Integrität, Nullaktivität und
Prozessstillstand bleiben unverändert. Bei FAIL/UNKNOWN sicher stoppen, kein Retry.
Keine Production-Aktion, kein Merge, Deployment oder kostenpflichtiger Modelltest.
