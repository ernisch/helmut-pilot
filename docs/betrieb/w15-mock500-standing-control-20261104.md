# Dauerfreigabe für sequenzielle vollständige Mock500-Läufe

Die neue ausdrückliche Betreiberanweisung ersetzt die frühere Begrenzung auf drei
Versuche. Sie erlaubt isolierte synthetische Voll-Mock500-Läufe innerhalb vorhandener
Infrastruktur und Kontingente bis zum ersten unabhängig bestätigten vollständigen
PASS, ohne neue Einzel-GOs. Modellaufrufe, Productionänderungen, neue kostenpflichtige
Ressourcen und möglicher nicht genehmigter bezahlter Verbrauch bleiben ausgeschlossen.
Ein neuer STOP oder Widerruf hat Vorrang; ein zusätzlicher STOP-/Widerrufsanker am
festen Root sperrt durch die strikte Inventarprüfung alle weiteren Startschritte.

Die Slot-3-Entwicklung auf `1fa20107` ist eingefroren und als eigener Stand erhalten.
`mock500_standing.py` verwendet die bereits vorhandenen privaten Datei-, Lock-,
Identitäts- und Altbelegprüfungen. Alter Grant, beide STOPs, fünf Journalereignisse,
zwei Reservierungen und historische UNKNOWNs bleiben bytegleich. Eine neue
authentisierte Dauerfreigabe und zwei korrespondierende append-only Ereignisfolgen
liegen daneben im selben fest gebundenen Root. Keine neue Serie ersetzt die alten
Belege; Ereignisnummern dienen nur der Zuordnung und begrenzen keine Versuchsanzahl.

Pro Lauf bleiben eine neue Nonce, eine Linkrunde und genau ein POST erlaubt. Jeder
Verbrauch wird vor seiner Wirkung exklusiv und dauerhaft samt Gegenanker geschrieben.
Fehlende/teilweise Dateien, Absturz, ein laufender Claim oder unklarer POST erlauben
keine Überlappung und keine Wiederverwendung. Der erste Runtimehead ist exakt
`33d588b6209ad912c5045f6561c07b7dc3d60e63`. Nach einem tatsächlich gestarteten
funktionalen FAIL braucht der nächste Lauf einen nachgewiesenen Runtimefix mit
geändertem Head, gezielten Tests, exakter CI, unabhängiger Abnahme und frischer
Quellen-/Originalbindung. Ein Control-only-Fix reicht ausschließlich bei authentisiertem
NOT_DISPATCHED vor einer POST-Phase. Ein anderer Commit allein beweist keine Reparatur.

Jeder nächste Lauf benötigt tatsächlichen Prozessstillstand, Originalintegrität,
alle acht sicheren Bereinigungen, native Nullaktivität und nachgewiesene Nullkosten.
UNKNOWN/Sicherheitsrisiko wird als HOLD angehängt. Nur neue vollständige authentisierte
Terminal-/Sicherheitsevidenz kann den aktuellen Lauf anschließend schließen; der HOLD
und historische UNKNOWNs werden nicht überschrieben. PASS braucht zusätzlich sämtliche
Voll-Mock-Abnahmekriterien einschließlich der tatsächlich gleichzeitig aktiven 500
Profile. Ein sicherer funktionaler FAIL erzeugt keine dauerhafte Versuchssperre.

Der bestehende Fullsender behält alle bisherigen Fenster-, 60-DB-Verbindungs-, Host-,
Zeit-, Sicherungs-, Quellen-, CI- und Reviewprüfungen. Entfernte Prüfungen und die
vollständige globale manuelle Historie liegen vor READY. Vor Links und POST werden
lokale Bindungen, Ablauf, Verbrauchsanker und der frische authentisierte Nullkostenbeleg
erneut geprüft. Eine JSON-Behauptung „kostenlos“ genügt ausdrücklich nicht.

Kostenklärung: Die öffentliche Repository-Nutzung mit Standard-`ubuntu-24.04` und
dem bestehenden GitHub-Actions-Artefaktpfad fällt unter die Anbieterbefreiung,
einschließlich Public-Artifacts. Die aktuelle Billingdokumentation begrenzt die
Compute-/Storage-Abrechnung auf private Repositories; die spezifische
[GitHub-Anbieterantwort](https://github.com/orgs/community/discussions/26438)
bestätigt, dass Public-Artifacts nicht auf das Storagekontingent angerechnet werden.
Unabhängiger Quellenreview PASS. Der anfängliche UNKNOWN-Befund und die einmalige
Billing-403 bleiben als vorläufige Beobachtung erhalten; sie belegen keine Kostenpflicht.

Der private Kostenprüfer akzeptiert für diesen exakt gebundenen Pfad einen
`PUBLIC_STANDARD_ACTIONS_ARTIFACT_EXEMPTION`-Nachweis: frische authentisierte öffentliche
Repository-Eigenschaft vor READY, gepinnter Standardrunner/Workflow und unveränderter
Transport für höchstens ein verschlüsseltes Artefakt mit einem Tag Aufbewahrung und
der bestehenden Byteobergrenze. Danach nur lokale Bindungsprüfungen. Keine erfundenen
freien Byte-Stunden und kein zusätzliches Quotenhindernis für den befreiten Public-Pfad.
Private Repositories, größere Runner, anderer Storage oder neue kostenpflichtige
Ressourcen sind damit nicht genehmigt; außerhalb des belegten Nullkostenpfads stoppen.
Die alte 0,05-USD-Obergrenze ist weiterhin keine Berechtigung zu bezahltem Verbrauch.

[Draft PR1044](https://github.com/ernisch/helmut-pilot/pull/1044) führt den neuen
Controlstand. Die [CI41904312147](https://github.com/ernisch/helmut-pilot/actions/runs/41904312147)
prüft Codehead32dbe0d7; der abschließende Dokumentationskopf benötigt eigene CI.
Der erhaltene Slot-3-Stand1fa hat CI41901229088 SUCCESS und wird nicht ausgeführt.

Sieben neue synthetische Übergangstests im bestehenden Testentry prüfen mehr als drei
sichere Versuche bis PASS, Runtime-/Control-Reparaturgrenzen, Kostenbelege, HOLD und
gefälschte Terminals, Absturz/fsync, konkurrierende Claims, veränderte Bindungen und
Entwicklungsfreigaben. Eigene Control-CI und unabhängige Sicherheitsabnahme bleiben
vor tatsächlicher Nutzung Pflicht. Runtime33d/CI41889108711, Empfang41037459441 und
End50041325430429 werden übernommen; keine erneute Prepare-Diagnose ist vorgesehen.
