# CAS-Projektion: native Größenformel, 21.10.2026

Die zusätzliche CAS-Projektion bleibt **OFF**. Ihre bisherige additive
Größenformel ist keine allgemeine Obergrenze für zusammengeführte JSONB-Objekte.
Der unveränderte vollständige Renderer prüft die tatsächliche Größe weiterhin.
Der Befund betrifft eine Voraussetzung des verworfenen Kandidaten; er belegt
keinen Fehler im aktiven Motor und keine zusätzliche Speicherersparnis.

## Enger Prüfgegenstand

Gesicherter Ausgangspunkt ist Commit `782ce1413e4cc45776af2a4d9175cade408adea0`
auf `codex/controlled-cleanup-and-late-probe-20261020`, Entwurfs-PR
[#927](https://github.com/ernisch/helmut-pilot/pull/927) auf #926 → #925 → #924.
Die vorherige [Phasenmessung](auth-write-phase-20261021.md) grenzte einen
Anstieg um 8.060.928 B zwischen Bodybeobachter und geparster RPC-Antwort ein,
ohne Speicherbesitzer oder tatsächlichen CAS-GUC-Zweig zu beweisen.
Keine Wiederholung des negativen W45-Vergleichs und keine Aktivierung der
Projektion zur Untersuchung dieser offenen Sicherheitsvoraussetzung.

Vier Knoten reichen für das Gegenbeispiel: drei kompakte Objektblätter A/B/C
und ein `m`-Wurzelknoten. A enthält 64 gerade Schlüssel mit leeren Arrays,
B 64 ungerade Schlüssel mit Ein-Zeichen-Strings, C den gültigen Kostenvertrag.
Alle Schlüssel sind disjunkt. PostgreSQL sortiert die zusammengeführten Schlüssel;
dadurch wechseln Arrays und Strings einander ab. Die erforderlichen
Ausrichtungsbytes waren in den getrennten Blättern kleiner.

Die offizielle PostgreSQL-17.6-Quelle, Tag `REL_17_6`, Commit
`7885b94dd81b98bbab9ed878680d156df7bf857f`, ergibt folgende Vorhersage.
Das tatsächliche SELECT hat sämtliche Werte bestätigt:

| Größe | Bytes |
| --- | ---: |
| Blatt A | 1.032 |
| Blatt B | 840 |
| Blatt C | 147 |
| Bisherige Formel `16 + Σ(Blattgröße + 16)` | 2.083 |
| Zusammengeführtes JSONB | 2.195 |
| Unterdeckung | 112 |

Dies widerlegt die behauptete Obergrenze für `m`. Die Native-Size-Prüfung zu
überspringen ist damit nicht freigegeben. Keine pauschale Vergrößerung einer
Grenze, keine Abschwächung der bisherigen Prüfungen und keine Aussage über
das Überschreiten der maximalen Zustandsgröße.

## Tatsächliche Ausführung und Grenzen

Der zweite und letzte Versuch lieferte die erwartete native Ausgabe:
1.527 B, SHA256
`d6317a14280790b8a1bfe79930ce37896470ebfb61015eb7a162d5392a71c244`.
Alle 32 Layoutfelder stimmen; tatsächliches PostgreSQL 17.6, UTF8,
`layout_probe`/`postgres`, Transaktion und Default rein lesend, keine
öffentlichen Tabellen, Projektion/Diagnosescope NULL, JIT tatsächlich ON.
Die Größenformel unterschätzt das zusammengeführte JSONB nachweislich um 112 B.

**Gesamtversuch FAIL / KEEP**: Der anschließende `pg_ctl stop -m fast -w`
endete mit Exit 137; äußerer Starter Exit 1. Das PostgreSQL-Log enthält den
vollständigen Fast-Shutdown und EOF. Ein separater Abschluss-Readback zeigt
beide eigenen Container beendet, Exit 0, PID 0, kein OOM-Flag.
Ein beim Ende von Container-PID 1 beendeter `docker exec`-Prozess passt dazu;
die genaue Ursache von Exit 137 ist damit nicht direkt bewiesen. Die strenge
Befehlsabschlussregel bleibt verletzt. Kein Umetikettieren zu PASS und kein
dritter Versuch. Der Layoutwert ist ein tatsächlicher Teilbefund dieses
fehlgeschlagenen Ablaufs, kein bestandener vollständiger Test.

Der erste Versuch bleibt **FAIL / KEEP**: PostgreSQL startete und wurde wieder
beendet; der Clientaufruf endete mit Exit 2 ohne erhaltenes stderr. Ein nativer
Größenwert liegt aus diesem Versuch nicht vor. Die offizielle libpq-Quelle
erklärt einen Fehler durch `PGSERVICE=''`; sie ersetzt die verlorene konkrete
Fehlermeldung nicht. Außerdem würde `PGPASSFILE=/dev/null` eine Warnung erzeugen.
Der korrigierte Starter entfernt beide Zuweisungen bei nachweislich leerer
Image-Umgebung, prüft das frische HOME und bewahrt begrenzte Rohdiagnostik.
Die nachträglichen vollständigen Root-Inspects überschritten im ersten Fall
die erklärte 1-MiB-Beleggrenze. Diese Überschreitung bleibt dokumentiert.

Die korrigierte Probe verwendete eine neue synthetische PostgreSQL-Datenbank,
das vorhandene gepinnte 17.6-Binary und 549 schreibgeschützte Runtime-Bindungen.
Keine authentischen Profil-/Auth-Daten, keine CAS-Aufrufe, keine Projektion,
keine Provideraufrufe und kein Netz im Container. Ein einziges kleines SELECT
las Layout und tatsächliche Laufzeiteinstellungen. Beide Versuche, ihre vier
Container, neuen Daten und alle Belege bleiben erhalten. Der zweite Fall
enthält einschließlich kompakter Root-Abschlussbelege 778.519 B unter der
unveränderten 1-MiB-Grenze. Die widersprüchliche globale Ausgabegrenze im
ursprünglichen Plan wurde ausschließlich vor dem zweiten Start mit Intent V4
korrigiert; die tatsächlichen Startergrenzen blieben gleich. Kein gemeinsamer
RAM-Verlauf, kein Plateau und kein 500er Nachweis werden damit gemessen.

## Entscheidung für den Speicher-Sprint

Der bereits faire kombinierte Vergleich bleibt unverändert:
1.170.790.400 → 1.015.904.256 B, **154.886.144 B / 13,23 %** weniger gemeinsamer
Speicher. Der alte PostgreSQL-Renderer war der größte einzeln belegte
vermeidbare Anteil. Dieser Stand ist im Motor integriert.

Der aktuelle Schritt verändert den Produktpfad nicht. W45 bleibt nach seinem
negativen Speichervergleich verworfen. Höchstens ein späterer gezielter
Diagnoseschritt sollte die tatsächliche PostgreSQL-Materialisierung im selben
CAS-Backend mit begrenzten Heapbelegen vor und nach der Materialisierung
binden; noch kein solcher Lauf ist vorbereitet oder gestartet.

Das Reserveziel von 500.000.000 B bei exakt 500 aktiven Profilen bleibt offen.
Der Sprint ist teilweise abgeschlossen. Für Voll500 gelten weiterhin die
unveränderte Plattenadmission, 32 frische Startbedingungen und ein neues
konkretes GO. Keine Production-Aktion, kein Merge oder Deployment.

Post-Case-Snapshot: 14.988.963.840 B frei, **190.815.880 B fehlen** zur
unveränderten Volladmission von 15.179.779.720 B. Der Wert ist keine
Reservierung. Beide Fehlversuche bleiben erhalten; keine zusätzliche sicher
entbehrliche Ressource wurde qualifiziert. Originalcloud weiterhin nicht
direkt angebunden; die vorhandenen authentifizierten lokalen Bindungen bleiben.
Router, Betreiberkosten, Budgets und Reserve unverändert. Fehlende private
Originalvorlagen in CI sowie Vercel bleiben getrennte offene Probleme.

## Belege und notwendige Prüfungen

- [Quellherleitung](cas-native-size-layout-source-20261021.SAFE.json),
  [unabhängige Starterabnahme](cas-native-size-source-sol-review-20261021.SAFE.json)
  und [3 AST-/3 CLI-Prüfungen](cas-native-size-starter-qualification-20261021.SAFE.json).
- [Erster Gesamt-FAIL](cas-native-size-first-failure-sol-review-20261021.SAFE.json),
  [tatsächliche zweite Ausführung](cas-native-size-failed-execution-20261021.SAFE.json),
  [native Ausgabe](cas-native-size-native-row-20261021.SAFE.json) und
  [unabhängige tatsächliche Abnahme](cas-native-size-actual-sol-review-20261021.SAFE.json).
- [Root-Readback](cas-native-size-root-readback-20261021.SAFE.json),
  [Abschlussereignisse](cas-native-size-shutdown-events-20261021.SAFE.json),
  [unabhängige Ereignisprüfung](cas-native-size-events-sol-review-20261021.SAFE.json)
  und [begrenzte Starterdiagnose](cas-native-size-shutdown-source-20261021.SAFE.json).
- [Geschützte Ressourcen und 549 Runtime-Hashes nach Abschluss](cas-native-size-protected-end-20261021.SAFE.json),
  [nächste enge Entscheidung](cas-native-size-next-decision-20261021.SAFE.json)
  und [unveränderte Quellenkopien](../../scripts/helmut-resource-meter/cas-native-size-qualification-20261021/README.md).

Keine Wiederholung der früheren 179 Produktsuiten und 95 nativen Vergleiche
bei unverändertem Produkt. Ausschließlich SOL, Root mit bis zu drei getrennt
arbeitenden SOL-Helfern. Keine externen Modellaufrufe. Empfehlung: gleicher
Thread, Denkstufe sehr hoch.
