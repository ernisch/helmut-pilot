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

Aktuelle tatsächliche Startgrenze: Standard-Linux-Compute des öffentlichen Repositorys
ist kostenlos; freier gemeinsam genutzter Artifact-/Packages-Speicher ist nicht
authentisiert bekannt. Die einmalige Billingabfrage wurde mit 403 abgewiesen; keine
Wiederholung oder zusätzliche Billingarchitektur. Die alte 0,05-USD-Obergrenze ersetzt
keinen Nullkostenbeleg. Bei konservativ höchstens 1.326.437.376 Cipher-Bytes über
25 Stunden wäre etwa 0,01234 USD zusätzlicher Speicherverbrauch möglich. Deshalb
bleibt der tatsächliche Fullstart vor Links gesperrt, bis authentisierte verfügbare
Freikontingente diesen möglichen Verbrauch vollständig decken.

Sieben neue synthetische Übergangstests im bestehenden Testentry prüfen mehr als drei
sichere Versuche bis PASS, Runtime-/Control-Reparaturgrenzen, Kostenbelege, HOLD und
gefälschte Terminals, Absturz/fsync, konkurrierende Claims, veränderte Bindungen und
Entwicklungsfreigaben. Eigene Control-CI und unabhängige Sicherheitsabnahme bleiben
vor tatsächlicher Nutzung Pflicht. Runtime33d/CI41889108711, Empfang41037459441 und
End50041325430429 werden übernommen; keine erneute Prepare-Diagnose ist vorgesehen.
