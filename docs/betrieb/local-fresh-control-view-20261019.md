# Lokale frische Kontrollsicht — 19.10.2026

Branch `codex/bounded-working-set-research-20261019`, Basis `c5e4d2d5`.
Historischer W49-Komponentenstand; anschließende Bereinigung und frisches
gemeinsames Vergleichspaar: [W50](local-common-control-comparison-20261019.md).
**Implementiert, Standard AUS; Komponentenprüfungen bestanden. Kein gemeinsamer
RAM-Gewinn, keine500MB-Reserve und kein500er Gesamtnachweis belegt.**

## Entscheidung und verworfener Zwischenversuch

Der W47-Entwurf bleibt die Richtung: große vollständige Zustände nur dort
aufbereiten, wo sie tatsächlich benötigt werden. Eine weitere Decoderänderung
zählt nicht aufgrund geringerer dauerhaft lebender Daten als Speicherlösung.

W48 hat dies konkret geprüft. Ein privater Metadaten-/Textindex ohne dauerhaft
rekonstruierte Werte und mit8MiB Vergleichstextgrenze bestand35 reine Gruppen
mit322 Differenzialfällen. Der kleine tatsächliche Datenbankversuch
`read-path-96b24bcf2f` ergab aber **1.004.314.624B gemeinsamen Peak** gegenüber
890.748.928B in der historischen gleichen W46-Diagnose. CPU56,400522→62,770495s,
Median34Schreibaufrufe292,414→350,851ms. Das ist kein frisches Vergleichspaar,
belegt aber keinen Vorteil. Kandidat verworfen; aktive Decoderdatei vollständig
auf die vorherige Fassung zurückgesetzt. Quellen/Test/Resultate verbleiben lokal
unter `wave48-bounded-auth-lifetime/`. Kein erneuter Gesamtlauf.

Die explorativen Heap-Stichproben verwendeten Allocation-Sampling und eine
abschließende GC nur zur Retentionszuordnung. Ihre RSS-/Heap-Zahlen sind keine
Laufzeit- oder gemeinsame Speicherabnahme. Die anschließende Datenbankmessung
verwendete den bestehenden Kernelmeter ohne Profiler und ohne erzwungene GC.

## Kleinste tatsächliche Änderung am Datenpfad

Nur `synthetik-500-production-adapter.controlGuard` kann über den neuen lokalen
Schalter `HELMUT_AUTH_CONTROL_READ=verified-control-view-v1` eine getrennte
schreibunfähige Sicht lesen. Der Standardpfad ruft weiterhin direkt den bisherigen
vollständigen Authleser auf. Installation, U, Accounting, Writers und unbekannte
Aufrufer behalten den vollständigen bisherigen Pfad.

Die Sicht enthält sämtliche tatsächlich gespeicherten Werte dieser vier Felder:

- `synthetik500DispatchJournal`: komplettes Journal einschließlich aktivem
  Vorgang, Stopflag, Index, inFlight, Units, Attempts und Outputs.
- `synthetik500KostenAdmission`: vollständiger Plan und Verbrauchs-/Reviewdaten.
- `testKostenAuftrag`: vollständiger bestehender Auftrag.
- `testKostenTage`: alle Tage samt vollständigen Calls, Reserven und Sperren.

Es gibt keine Summenabkürzung, keine Änderung von Geldgrenzen, keine ausgelassene
fachliche Kontrolle und keine Verwendung alter erfolgreicher Guardurteile.
`J.bind`, `financial`, `auftragsStand`, `pruefeTag` und `kontrolliere` laufen mit
frischen, exakt gebundenen Daten unverändert. Profil-/Quellen-/Runtimekontrollen
außerhalb des Kontrolllesers bleiben an ihren bisherigen Stellen.

Der private, auf2MiB Text begrenzte Inhaltsnachweis entsteht ausschließlich nach
erfolgreichem **vollständigem Originaldecoder** am tatsächlichen Graphen, bevor
auf Ruferebene Objekte geändert werden können. Er hält nur diesen Vier-Feld-Text,
Ziel/Zeilen-ID, Statebindung, Knotenanzahl/-Digest und eine private Tokenidentität.
Keine vollständige Rootkopie und kein zusätzliches Cache-System.

Jeder weitere Kontrollread ruft dieselbe bestehende native Graphfunktion auf.
Der vorhandene kompakte Protokollpfad prüft frisch alle tatsächlichen Payload-
SHAs, Reachability/Postorder, Typ-/Tiefen-/Arbeitsgrenzen, Usagehistorie und
Berechtigungen. Clientprüfungen binden neue Nonce, Ziel, Revision, Generation,
Originalhash, Root, Historyproof, Knotenanzahl und tatsächlichen Graphdigest an
den eingefangenen privaten Inhaltsnachweis. Bindungsdigests sind keine Signatur;
authentifizierter nativer Ursprung und die geprüfte Funktionsfassung bleiben
zwingend. Keine neue SQL-Funktion, Migration, Privilegien- oder RLS-Änderung.

Kalte, geänderte, fremde oder zu große Inhalte nehmen den vollständigen alten
Decoderpfad; ungültige Antworten stoppen ohne Wiederholung. Ein Writer-ACK
allein erzeugt keinen Kontrollnachweis: die historische native `node_seq`-
Reihenfolge darf nicht aus der Aufrufer-Buildreihenfolge behauptet werden.

Die zurückgegebene Sicht ist tief eingefroren, frisch aus dem gebundenen Text
abgetrennt und besitzt weder Atomic- noch CAS-Schreibsnapshot. Auch eine
Spreadkopie kann sie nicht als vollständigen Authstand schreiben. Vollwriter,
Kostenquittungen und atomare CAS-Logik bleiben unverändert.

## Tatsächlich bestandene lokale Prüfungen

| Prüfung | Befund | Grenze |
|---|---|---|
| Unabhängige neue reine Control-Suite |13Gruppen,29Negativfälle PASS | Mock-Nativeprotokoll mit echten Parts-Graphen und Atomic-Reader/Writer |
| Neue native Komponente `control-bada7c569a` |10Gruppen PASS | Neue isolierte lokale PG17.6/PostgREST-Datenbank, keine Profile/Installation/Aktivierung |
| Bisheriger Adapter |16Gruppen PASS | Reiner Mockregressionsnachweis |
| Bisheriger Routenvertrag |24Gruppen PASS | Reiner Offline-Regressionsnachweis |
| Neue Descriptor-/Quellbindungsprüfung |1Test PASS | Neuer Modus bleibt aus vollständigem Ressourcenlauf ausgeschlossen |
| Verbindlicher großer Standard-Offlinelauf |176/178Suiten PASS in722s; beide Befunde gezielt korrigiert und bestanden | Kein zweiter Gesamtdurchlauf: Inventar38/38 und Artefaktmetadaten10/10 separat nachgeprüft |

Der große Lauf fand fehlende Schalterbeschreibungen und ein veraltetes
Release-Artefaktmanifest. Das Inventar beschreibt jetzt den neuen lokalen Modus
und die beiden älteren gesperrten Versuchsschalter. Alle88 Artefaktpins wurden
an die tatsächlichen lokalen Bytes gebunden; drei Abweichungen bestanden bereits
an der Commitbasis. Das alte Manifest bleibt unverändert als Beleg erhalten.
`currentCandidateFull500Qualification` bleibt ausdrücklich `false`, die ältere
Inhaltsabnahme historisch. Das ist keine neue Runtime-, RAM- oder500er Abnahme.
Die ausführbaren, unabhängig geprüften Kontrollleserbytes wurden durch diese
beiden Metadatenkorrekturen nicht geändert. Kein erneuter großer Offlinelauf
allein wegen dieser gezielten Inventar-/Manifestkorrekturen.

Negativfälle umfassen neue/falsche Nonce, Proof-/State-/Digest-/Protokollfehler,
kalte Fälschung, manipulierte volle Graphen, falsche Historyanzahl, fremde
Ziele/Zeilen, Neustart, Indexgrößengrenze, konkurrierende verspätete Antworten,
fehlende Schreibautorität sowie vollständige Writer-CAS-Bestätigung. Die native
Prüfung manipuliert tatsächliche Payloadbytes nur in einer zurückgerollten
Transaktion der neuen Testdatenbank; die frische native SHA-Prüfung weist dies
ab. Fremde Zeilen und die gesperrte Rolle bleiben unzugänglich.

Alle logischen Felder und5000historischen Usagezeilen der Testkopie sind
abschließend gleich zum erfassten Auth-Ausgang. Geschützte Quelldateien und
Fixturehashes unverändert; eigene Prozesse beendet, Kernelgruppe leer. Ein
absichtlich zurückgewiesener Fremdziel-Request ist ein erwarteter Negativfall,
kein verschwiegenes Netzproblem.

## Acht abwechselnd angeordnete Lesevergleiche am tatsächlichen DB-Pfad

Gleicher Prozess, gleiche Datenbank/Version/Funktionen, unveränderte WAL-/fsync-
Einstellungen und Historienwiederverwendung. Achtmal jeweils Vollread und
Kontrollread, Reihenfolge paarweise gewechselt. Ohne Profiler/erzwungene GC.

| Messwert | Vollread | Kontrollread |
|---|---:|---:|
| Median Aufrufzeit |170,477ms|125,670ms|
| Langsamster Aufruf |194,711ms|143,838ms|
| Summe acht Aufrufzeiten |1340,667ms|1002,714ms|
| Node-CPU acht Aufrufe |370.387µs|185.029µs|
| Vollständig gelesene Antwortbytes |18.076.456B|8.896B|

Damit sind **26,28% weniger Medianzeit**, **50,04% weniger Node-CPU** und
**99,95% weniger Antwortbytes** in genau dieser kleinen Stichprobe belegt.
Der kalte erste Kontrollread bleibt vollständig und lag bei2.257.736Antwortbytes;
der folgende gebundene Read lieferte1066B. Das ist Inhaltswiederverwendung nach
frischer tatsächlicher DB-Prüfung, kein Weglassen frischer Sicherheitswirkungen.

Die gesamte native Komponente meldete623.857.664B Kernelpeak und22,763293s CPU.
Sie verwendete bewusst eine Bind-Datenablage für die Sicherheitsqualifikation;
**vollständige gemeinsame Dateicachezuordnung ist damit nicht bewiesen**. Dieser
Wert darf weder mit den Loopmessungen verglichen noch als RAMersparnis,
Unit60/Auth30, Offline90 oder500MB-Reserve ausgegeben werden. Auch die
`memoryUsage`-Stichproben nach Einzelreads sind keine gemeinsamen Peaks.

## Nächster echter Freigabepunkt

Der kleine gemeinsame Vorher-/Nachhervergleich mit dem vorhandenen Loop-
Kernelmeter ist noch offen. Frei waren zuletzt rund8,506GB; dessen bestehende
Startreserve beträgt9.663.676.416B. Der vollständige500er Lauf verlangt weiterhin
16.589.934.592B Plattenreserve sowie32frische Bedingungen und ein neues GO.

Vorbereitet, **nicht ausgeführt**: genau vier beendete W46-Containerhüllen
`05dd19b9…`, `240b1c81…`, `1ff1d3cb…`, `bfcd5514…` entfernen. Physisch/exklusiv
geprüft3.646.087.168B; danach rechnerisch rund12,152GB frei. Vollständige
Metadaten/beide Logströme im privaten19808B-Archiv vollständig zurückgelesen.
Alle Datenbanken, Volumes, Images, Originale, Loopabbilder und Belege bleiben
lokal erhalten. Das reicht für den nächsten kleinen Vergleich; nicht für die
volle500er Startreserve. Neue ausdrückliche Löschfreigabe erforderlich.

Nach belegtem gemeinsamen RAMvorteil: begrenzte unabhängige kritische
DeepSeek-Abnahme erst nach neuer entsprechender Freigabe, dann aktuelle
Fall-/Tages-/Code-/Zeitbindung und vollständiger Vorabcheck. Ein neuer500er
Ressourcenlauf braucht weiterhin sein eigenes GO. Für die spätere Abnahme
bleiben500Abschlüsse/1500brauchbare Positionen/8000Kontrollen,
Offline90/Unit60/Auth30 und2.048.000.000B verpflichtend; gewünschte500MB-Reserve
bedeutet gemeinsamen Peak höchstens1.548.000.000B.

Keine Productionaktion, kein Merge/Deployment, keine Freigabebeanspruchung,
kein bezahlter Modellaufruf und keine zusätzliche historische Löschung.
