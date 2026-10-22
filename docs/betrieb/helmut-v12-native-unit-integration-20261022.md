# V12: native Einzelunit-Anbindung, 22.10.2026

Stand: teilweise umgesetzt, kein Unit60- oder 500er-Nachweis. Basis ist
`c46d07ebddaf8914c747fbc84f8059888376d9c1`; Entwicklung auf
`codex/v12-unit60-native-integration-20261022`. Alte GOs und Claims bleiben
verbraucht. Keine Production-Aktion, kein Merge und kein neuer vollständiger
500er-Lauf sind aus dieser Arbeit freigegeben.

## Tatsächlich ausgeführt

Die native Vorbereitung mit Code `9eb77929` hat den authentischen erhaltenen
V12-POSTRUN über den unveränderten Readonly-Ext4-Verbraucher in eine neue Kopie
wiederhergestellt: 1.714 Dateien, 372.011.391 Bytes, vollständige Gleichheit zum
gesicherten Dateimanifest. Fünf fehlende temporäre Leserbibliotheken wurden aus
dem unveränderten Originalimage wiederhergestellt und gegen Manifest, alle
14 Layer und endgültige Dateihashes geprüft. Ebenso wurden 974 originale
JIT-Dateien innerhalb der gemeinsamen Messgruppe wiederhergestellt.

PostgreSQL 17.6 startete ausschließlich auf dieser neuen Kopie. Installation,
tatsächlicher SQL-Vertrag, Rollen, Rechte, Tabellen, Trigger und 31 negative
Sicherheitsfälle wurden nativ geprüft. Der logische ursprüngliche Auth-Rowhash
blieb unverändert. Alle Kinder endeten, PostgreSQL bestätigte sauberes Ende,
die Messgruppe war nach den letzten Zählerlesungen leer. Keine OOM- oder
Limitereignisse. Gemeinsamer Höchstwert dieser **Vorbereitung**:
647.626.752 Bytes; CPU: 25.844.455 Mikrosekunden. Null Motor- und Anbieteraufrufe.
Das ist ausdrücklich kein Speicherpuffernachweis einer Einzelunit oder von500.

Private Primärbelege verbleiben lokal unter
`/workspace/helmut-unit-diagnostic-native/2af076af603df00bf7ee599820e57b34/`:
`RESULT.SAFE.json`, `NATIVE_QUALIFICATION.SAFE.json`,
`NATIVE_ROLE_QUALIFICATION.SAFE.json`, `FRESH_COPY_FILE_MANIFEST.SAFE.json`,
`READONLY_LIBRARIES_RESTORED.SAFE.json`, `ORIGINAL_JIT_RESTORED.SAFE.json`.
PGDATA und private Logs werden nicht ins Repository übernommen.

Ein vorangegangener Vorbereitungslauf scheiterte an einer zu strengen
Tabellenzählung, die die obligatorische Identity-Sequenz als siebte Tabelle
zählte. Die Korrektur prüft sechs Tabellen und die eine echte intern gebundene
Sequenz getrennt. Ein fehlender Readonly-Mount des Runtimebelegs sowie die
Fehlererhaltung im Abschluss wurden ebenfalls korrigiert. Dieser fehlgeschlagene
Lauf bleibt lokal erhalten und wird nicht als bestanden umgedeutet.

## Originale Eingaben und neuer Vertrag

Der reine Originalproducer wurde unabhängig gegen die tatsächlichen Eingaben
geprüft: D bytegleich; ursprüngliches R mit3000/low bytegleich. Das neue R mit
6000/medium ist ein ausdrücklich ausgewiesener Diagnose-Override, keine
Behauptung identischer historischer Requestbytes. Originale bleiben unverändert.
Die explizite UTC-Source-Zeit bewahrt das ursprüngliche Nachrichtendatum, ohne
die echte Laufuhr zu verändern. Die originale Quellenrichtlinie wird allein aus
ihrem geprüften Feld gebunden, keine alten Ausführungsrechte werden übernommen.

Auth30, Unit60 und16 frische Kontrollgruppen sind im neuen Scope gebunden.
Ein vorbereiteter neuer, einmaliger Einstieg verhindert erneutes Öffnen eines
begonnenen Versuchs und zeichnet tatsächliche Prozess-/Heap-Enden auf. Die
Unix-Anbindung verlangt einen separaten Root-Vertrauensanker und signierte
Antworten; Caller-JSON ersetzt diese nativen Verbraucher nicht.

## Noch vor jeder aussagekräftigen Einzelunit zu schließen

Die unabhängige Pfadprüfung hat eine wesentliche Lücke des vorbereiteten
Diagnosecodes gefunden: Reserve, Usage, Abrechnung und Ergebnisse gingen in
einen kleinen eigenen SQL-Zustand. Damit wurden ursprüngliches FullAuth-CAS,
`U.write`, `captureWrite`/`Parts.build` und echte Ergebnisinserts umgangen.
Eine erfolgreiche Zeitmessung dieses Pfads wäre kein Nachweis für den Engpass
des letzten V12-Profils. Deshalb wird vor einer solchen Messung die enge
COPY-Anbindung ergänzt: tatsächliche Zustands-/Usage-Änderungen durch den
Originalwriter, voller unveränderter Historyprefix, neue eigene Schlüssel sowie
atomare Kopplung mit den neuen nativen Quittungen. Generische alte Mutatoren
werden dem Runtimeclient nicht freigegeben.

Diese Zustands-/Usage-Anbindung ist inzwischen im JS-Verbraucher implementiert:
Erstclaim über eine einmalige private Capability, danach tatsächliches
`U.read`/`U.write` mit unveränderten historischen Objekten. Sechs gezielte
Store-Integrationsprüfungen bestehen. Der private Ownerdienst verlangt den
authentisierten festen Socket, eindeutige Nonces, einen einzigen begrenzten
psql-Prozess, Exit0 und natürliche Pipe-Enden vor Quittungsannahme. Seine
30 synthetischen Lifecycle-/Protokollprüfungen bestehen. Rohes Datenbank-stderr
wird dort ausschließlich als Größe/Hash aufbewahrt.

Der Transaktionscompiler verbindet Original-CAS und eigenen CAS in einer
Transaktion. Eine administrativ erzeugte temporäre Quittung bindet reale
Backend-/Transaktionsidentität, unveränderliche Argumente, tatsächlichen
Authzustand und exakte Rollen-/RLS-Rechte. Eigene State-/Usage-Trigger verlangen
diese Quittung; logische Noops werden ebenfalls gesperrt. 15 reine
Compiler-/Vertragsprüfungen bestehen. Diese SQL-Erweiterung wurde noch nicht
nativ ausgeführt. Erstinstallation und Ergebnis-/Abschlussmodi sind weiterhin
gezielt gesperrt, bis ihre echten Pfade fertiggestellt und geprüft sind.

Broker/Endpoint-Vertrag `/2` unterscheidet tatsächliche PostgREST-Leser von
Owner-psql-Schreibern. Rohen State-CAS und Artefaktinserts nimmt der Broker nicht
an. Der neue Source-Beobachter prüft echte UID1000-Prozesse, Parent/PIDnamespace,
gepinnten Code, Cgroup und Besitz des Unix-Listeners; sechs Offline-Angriffsfälle
bestehen. Seine Einbindung in den realen Controller ist noch offen. Root ohne
Capabilities behauptet keinen Zugriff auf fremde UID1000-Prozessdateien.

Zusätzlich müssen fünf ursprüngliche `briefings`-INSERTs und zwei private
`helmut_store`-INSERTs mit den sieben eigenen Ergebnisartefakten gekoppelt werden.
Keine existierende Originalzeile wird überschrieben; der globale alte
Call-Zähler und alte Pipeline-Locks werden nicht zusätzlich aktiviert.

Offen bleiben die native Qualifikation dieser Kopplung einschließlich frischer
Erstinstallation, echte Readonly-Closure/RLS, Owner-/Broker-/Client-Lifecycle,
atomare Original-Ergebnisinserts, verlorene ACKs, Revisionskonflikte und der
einmalige tatsächliche Lauf. Unbekannte Schreibausgänge dürfen nicht wiederholt
werden. Die endgültige500er-Reserve und alle32 Startbedingungen bleiben offen;
eine einzelne späte Unit ersetzt diesen Gesamtnachweis nicht.
