# Begrenzter Arbeitszustand im500er Motor: Recherche und Integrationsentscheidung

Stand19.10.2026. Geprüfte Codebasis703fc49f, eigener Dokumentationsbranch
`codex/bounded-working-set-research-20261019`. Dies ist ein konkreter Entwurf,
**keine implementierte Speicherlösung und keine neue500er-Freigabe**.
Motor, Datenbanken, Originale und Prüfvertrag wurden für diese Recherche nicht
geändert; keine neuen Tests, Aktivierungen oder bezahlten Modellaufrufe.

## Ziel und Entscheidung

Mindestens500.000.000B Reserve unter der unveränderten gemeinsamen Grenze
2.048.000.000B bedeutet **höchstens1.548.000.000B gemeinsamer Peak**. Das bereits
angestrebte Qualitätsziel1.500.000.000B würde548.000.000B Reserve lassen.
Alle beteiligten Prozesse, Worker, Datenbank und Dateicaches zählen weiter mit.
Keines dieser Ziele ist bestanden. Aus einer Übertragungsersparnis oder einer
kleinen künstlichen Fixture folgt keine entsprechende RAM-Ersparnis.

Production verwendet getrennte Vercel-/Supabase-Ressourcen. Die belegte
Vercel-Functionkonfiguration hat2048MB; Datenbankressourcen sind ein eigener
Prüfgegenstand. Auch ein bestandener gemeinsamer lokaler Zielwert ersetzt weder
den App- noch den Datenbanknachweis in Production. Eine Reserve bei einem Dienst
kann kein überschrittenes Limit des anderen Dienstes ausgleichen. Der gemeinsame
lokale Vertrag wird durch diese Trennung nicht geändert.

**Bevorzugter Entwurf: ein begrenzter Arbeitszustand je Ausführungsschritt.**
Große unveränderliche Inhalte bleiben über Originalhash und tatsächliche
Speicherbindung adressiert. Geeignete reine Kontrollen bekommen eine eigene
schreibunfähige, frische Kontrollsicht. Nur der benötigte Inhalt wird im
jeweiligen Schritt materialisiert; temporäre Decoder-/Vergleichsdarstellungen
bekommen eine nachgewiesene Lebensdauer. Buchungen und Fortschritt behalten
ihren atomaren, revisionsgebundenen Schreibweg. Keine neue Workflow-Plattform,
kein zusätzlicher Cache-Dienst und keine Änderung von Kosten-/Zeitgrenzen.

Die Architektur umfasst **Kontrollleser und Inhaltslebensdauer zusammen**.
Nur am Warmguard einige Felder wegzulassen begründet keine500MB Reserve.
Die genaue Allokationsursache des historischen Gesamtpeaks ist weiterhin nicht
belegt; diese Entscheidung ist die am besten begründete Prüfrichtung.

## Offizielle Quellen und Übertragbarkeit

| Quelle, direkt geprüft | Dokumentiertes Prinzip | Anwendung und Grenze für Helmut |
|---|---|---|
| [Stripe Ledger](https://stripe.dev/blog/ledger-stripe-system-for-tracking-and-validating-money-movement),16.02.2024 | Unveränderliches Ereignisjournal, rekonstruierbarer Zustand und Vollständigkeitsprüfungen gegen Quellsysteme. | Geprüfte Originale und Buchungshistorie erhalten; kleine Arbeitsansichten bleiben vom vollständigen Nachweis ableitbar. Artikel belegt weder unsere konkrete CAS-Schnittstelle noch einen RAMgewinn. |
| [Stripe Idempotency](https://stripe.com/blog/idempotency),22.02.2017 | Stabile Operationsschlüssel und gespeicherte Ergebnisse machen geeignete API-Wiederholungen sicher; Teilfehler verlangen passende Rollback-/Wiederaufnahmesemantik. | Gleicher fachlicher Versuch behält seine Identität. **Helmuts unbekannter Ausgang wird dadurch nicht wiederholbar**: reservierte Kosten, Einmalfreigabe, CAS und das bestehende Retryverbot bleiben unverändert. |
| [Stripe Events](https://docs.stripe.com/events/how-events-work),laufende Dokumentation | Dünne Ereignisse tragen Kennungen/Metadaten; bei Bedarf wird der aktuelle Ressourcenzustand gelesen. Snapshot-Inhalt kann bei Verarbeitung veraltet sein. | IDs/Hashes statt ganzer Kontengraphen als Arbeitsnachricht; Sicherheitsdaten frisch aus demselben konsistenten Snapshot lesen. W43 zeigte bereits, dass dünne Übertragung allein keinen geringeren RAMpeak schafft. |
| [Temporal WorkerOptions](https://typescript.temporal.io/api/interfaces/worker.WorkerOptions),laufende API-Referenz | Aktive Arbeit und im Speicher gehaltene Workflowinstanzen sind getrennt begrenzt. Behaltene Argumente, Allokationen und Payloads beeinflussen den Speicher. Verdrängung kann Historien-Replay erfordern. | Gleichzeitigkeit, große lebende Darstellungen und Datenlebensdauer getrennt betrachten. Helmut läuft bereits profilweise sequenziell; Parallelität1 wäre kein neuer Fix. Ein blindes Leeren des Command-Kontexts würde teure Wiederherstellung auslösen. Temporal wird nicht installiert. |
| [Instagram Explore](https://engineering.fb.com/2023/08/09/ml-applications/scaling-instagram-explore-recommendations-system/),09.08.2023 | Mehrstufige Verarbeitung mit zunächst kleinen Kandidatenmengen; unabhängige Itemberechnungen offline, aktuelle Nutzermerkmale online. | Unveränderliche Inhaltsarbeit von frischen dynamischen Kontrollen trennen und vollständige Daten nur am benötigten Verarbeitungsschritt aufbereiten. **Keine** approximativen Sicherheitsprüfungen oder Auswahl weniger als500Profile übernehmen. |
| [Instagram Immortal Objects](https://engineering.fb.com/2023/08/15/developer-tools/immortal-objects-for-python-instagram-meta/),15.08.2023 | Python-Referenzzählung/GC-Metadaten verursachten Copy-on-write in einer Pre-fork-Architektur; eine Runtimeänderung reduzierte private Kopien. | Das nützliche Prinzip ist, die tatsächlichen Kopier-/Haltepunkte zu identifizieren. Python-Immortal-Objects, GIL- oder Pre-fork-Shared-Memory sind **keine** direkt übertragbare Node/Vercel-Implementierung. |

Stripe und Temporal passen für diesen Teil von Helmut besser als ein
Empfehlungsalgorithmus: Helmut führt gebundene Aufträge mit finanziellen
Sicherheitsbedingungen aus. Das ist eine begründete Architekturübertragung,
keine Behauptung gleicher Systeme oder übertragbarer Benchmarks.

## Was der vorhandene Motor bereits richtig macht

- `llm-usage-atomic.js` und die lokalen SQL-Vorschläge trennen Verbrauchseinträge
  bereits relational, prüfen History-/Root-/Revisionsbindungen und schreiben
  atomar. Eine zweite Ledgerimplementierung ist unnötig.
- `synthetik-500-stored-command.js` hat bereits signierte Inhaltsnachweise,
  tatsächliche native Zeilenbindung, begrenzte Gültigkeit und eingefrorene
  Command-/Planinhalte. Der Plan wird nicht erneut als vermeintlich neue Idee
  vollständig gecacht.
- `storage.js:5205` kapselt Ausführungen durch AsyncLocalStorage, interne Token
  und Busy-Sperre. Profilverarbeitung im Adapter ist bereits sequenziell;
 500aktive Profile bedeuten keine500gleichzeitigen Modellaufträge.
- `canonical-content-facts.js` besitzt bereits Identitäts-/Byte-/Lebensdauergrenzen.
  Diese Buchhaltungsgrenzen sind keine Gesamt-RAM-Messung. Die Offlinephase des
  W42-Laufs meldet459.931.648B Node-RSS samt Worker und8,425s isolierte vollständige
  Inhaltsprüfung; der installierte Original-U-Pfad ist erhalten. Daraus lässt
  sich die unbekannte Rolle des gesonderten1.134.264.320B-Prozessmaximums nicht
  ableiten. Keine pauschale Schuldzuweisung an diese Offlinephase.

## Belegte Engstellen und Grenzen

Im abgebrochenen W42-Lauf:9.434Graphreads mit32.186.935.854Antwortbytes,
exakt36×262+2;3.145CAS, exakt12×262+1. Graphantworten liefern99,276% aller
Gateway-Antwortbytes. Das belegt vielfache vollständige Zustandsverarbeitung.
Diese32GB waren **nicht gleichzeitig im RAM**. Die Bearbeitungszeit pro
Profileinheit stieg im vorhandenen Verlauf, eine Live-Heap-Zeitreihe fehlt.
RSS- und Kernel-Hochwassermarken beweisen kein unbegrenztes Speicherleck.

`auth-state-parts.js:320–358` hält Knotenpayloads, rekonstruierte Werte,
ein zusätzliches JSON-normalisiertes Rückgabeobjekt und Vergleichstexte.
`lastDecodedGraph` bleibt auch bei Graph-ReuseOFF erhalten. `byText` referenziert
dieselben Vergleichsstrings; es ist keine weitere vollständige Stringkopie.
Der Decoderkörper ist zwischen dem tatsächlichen W42-Codef5e2cd61 und der
geprüften aktuellen Basis bytegleich. Die Mehrfachhaltung ist real, ihr genauer
Beitrag zur historischen Spitze2.050.535.424B ist nicht quantifiziert.

`synthetik-500-stored-command.js:119,234,262,296` hält einen vollständigen
eingefrorenen Command. `release` schließt die Sitzung, verwirft `current/base`
aber nicht. Das ist eine bewusste Wiederverwendung für schnelle Folgeaufrufe,
kein belegtes Leak. `synthetik-500-content-runner.js:43` startet außerdem einen
Worker mit eigenem Heap; `content-worker.js` sendet ein vollständiges Packet
zurück. Die Überlappung großer Darstellungen muss für eine gemeinsame Reserve
berücksichtigt werden. Worker-`maxOldGenerationSizeMb` begrenzt nicht den
vollständigen Speicher aller Beteiligten.

Die bisherigen negativen Ergebnisse bleiben verbindlich:

| Versuch | Tatsächlicher Befund | Entscheidung |
|---|---|---|
| W43 Graphtransport |92,051% weniger Antwortbytes, aber177.225.728B mehr gemeinsamer Peak | Nicht erneut als Speicherlösung einsetzen. |
| W44 Normalformnachweis |146.931.712B mehr Peak trotz kleinerer Antworten | Keine weitere große Gesamtdarstellung hinzufügen. |
| W45 native CAS-Projektion |Tempbytes458.960.409→21.455.719B, Peak+9.469.952B | DB-Arbeit verbessert; keine RAMlösung. |
| W46 zweite Schreibkopie entfernt |Peak890.748.928→907.329.536B | Eine entfernte Kopie ist keine belegte Peakreserve. |

## Konkrete lokale Integrationsgrenzen

### 1. Eigene reine Kontrollsicht

Erster begrenzter Integrationspunkt ist
`synthetik-500-production-adapter.js:151` (`controlGuard`). Die Sicht ist ein
eigenständiger interner Lesetyp ohne CAS-Schreibsnapshot. Sie ersetzt
`readAuthStore` **nicht** pauschal. Ein Writer darf eine solche Projektion
niemals als vollständigen Authstand speichern; unbekannte Aufrufer behalten
den bisherigen sicheren Pfad.

Vollständig frisch benötigt werden insbesondere:

- Journalversion, aktive Operation, Command-/Plan-/Claimbindung, Zustand,
  Notstopp, Index und vollständiges inFlight einschließlich Deadline.
- Auftragsdaten und **alle benötigten Auftragstage mit vollständigen Calls**,
  Kosten, Reservierungen und Sperren. `financial`→`auftragsStand`→`kontrolliere`
  darf nicht durch heutige Summen oder alte erfolgreiche Urteile ersetzt werden.
- Das Planfenster und der relevante unveränderliche Plan müssen aus einem
  **frisch im aktuellen Root geprüften Teilbaum** an den vorhandenen geprüften
  Command gebunden werden. Ein behaupteter passender Hash reicht nicht.

Native Validierung, Datenprojektion, Revision/Root/Generation/Originalhash,
Usage-Proof und Nonce müssen denselben Snapshot und dasselbe Ziel betreffen.
Die vorhandenen nativen Graph-/Payload-/Typ-/Schlüssel-/Arbeitsgrenzen bleiben
vor der Projektion vollständig erhalten. Profil-/Quellen-/Runtimekontrollen
außerhalb dieser Sicht bleiben an ihren bisherigen frischen Kontrollpunkten.

Grenze: Tagesinitialisierung, Installation, D-Nachweise und Accounting brauchen
weitere vollständige Daten, teilweise Usage-Rohdaten. `productionNext` braucht
Units/Entered, Outputs und Attempts. Keine globale Auslassung dieser Inhalte.
Belegte Einstiege: `testkosten-budget.js:158,202,239,291`,
`synthetik-500-dispatch-journal.js:21`, `synthetik-500-direct-d-store.js:27`,
`storage.js:825`, Adapter172/279/299/359.

### 2. Große Inhalte pro Arbeitsschritt begrenzen

Die vorhandene unveränderliche Inhaltsbindung wird weiterverwendet. Zu entwerfen
ist eine intern gebundene Arbeitseinheit aus Auftrags-ID, Original-/Commandhash,
Inhaltsidentität und Unit-Index. Sie darf nur den benötigten Inhalt
materialisieren; Zugriff auf andere Teile erfolgt weiterhin gegen dasselbe
verifizierte Original. Originale werden weder umgeschrieben noch entfernt.

Hier liegt die zusätzliche Grenze gegenüber einem bloßen Warmguard-Filter:
vollständiges Packet, dekodierte Authgraphen und große Vergleichsindizes dürfen
nicht unbegründet über denselben Lebenszyklus gleichzeitig gehalten werden.
Für jede Haltestruktur sind Besitzer, maximale lebende Anzahl, Bytegrenze und
Freigabepunkt festzulegen. Bestehende CPU-Beschleunigungen bleiben, soweit diese
Lebensdauergrenzen und die exakten Ergebnisse erhalten bleiben.

**Nicht zulässig:** einfach `current` nach jedem Aufruf löschen. Das würde
vollständige Wiederherstellung auslösen und könnte Unit60/Auth30 verschlechtern.
Ebenso wenig ist bewiesen, dass kleinere Nachrichten oder ein niedrigerer
Heap-Schalter500MB sparen. Erst der gebundene, vollständig geprüfte Inhalt mit
begrenzter Materialisierung macht den Entwurf substanziell anders als W43/W44.

### 3. Schreib- und Wiederholsicherheit erhalten

Die vorhandenen CAS-/Ledgerfunktionen bleiben der Rückweg. Änderungen an
Reservierung, Abbuchung oder Abschluss bleiben atomar und revisionsgebunden;
kein zweiter Kostenweg. Konflikt, unbekannter Commitausgang, Neustart,
konkurrierender Zugriff, fremdes Ziel und abgelaufene Bindung dürfen weder
Doppelbuchung noch verlorenen Eintrag oder Wiederöffnung eines verbrauchten
Auftrags verursachen. Stripe-Idempotenz ist kein GO für einen Helmut-Retry.

## Abnahme vor jeder Empfehlung eines vollständigen Laufs

1. Zuerst fehlende **gleichzeitige** Speicherzuordnung in einem begrenzten
   tatsächlichen Datenpfad erfassen: Heap/External/Buffer, Besitzer und
   Lebensdauer großer Darstellungen. Bestehenden Kernelmeter weiter nutzen;
   keine Prozessmaxima addieren. Ohne diese Zuordnung keine500MB-Prognose.
2. Feld-/Callgraph manifestieren und alten/neuen Pfad differential prüfen:
   gültige Daten, sämtliche negativen Fälle, alle Auftragstage, falsche und
   manipulierte Ist-Payloads, konkurrierende Writes, Neustart/Quellendrift,
   gleiche Original-/Inhalts-/Ergebnisbindungen. Eine eigene Kontrollsicht
   muss an jedem Schreibweg sicher abgewiesen werden.
3. Kleine identische Vergleiche mit tatsächlichem DB-Pfad; gemeinsamer Peak
   einschließlich Cache, CPU, maximaler Latenz, WAL/Temp und Datenintegrität.
   Relevante Speicherentlastung und Laufzeitfolgen getrennt bewerten. Ein kleiner
   Vergleich bleibt ein kleiner Vergleich.
4. Offline90, Installation, Original-U, Unit60, Auth30 und alle16Kontrollpunkte
   unverändert vollständig abdecken. Inhalte insgesamt einmal vollständig,
   aktuelle Sicherheitswirkungen jedes Mal frisch. Keine unbemerkte neue
   Ausnahme vom freigegebenen Prüfvertrag.
5. Erst nach unabhängiger kritischer Codeabnahme, ausreichender tatsächlicher
   Plattenreserve, neuer Fall-/Tages-/Code-/Zeitbindung und32frischen Bedingungen
   ein neues separates500er-GO. Anschließend genau ein vollständiger Lauf,
   akzeptiert nur mit500Abschlüssen,1500brauchbaren Positionen/8000Kontrollen,
   unveränderten Zeitgrenzen und gemeinsamem Peak≤1.548.000.000B.

Derzeitige Grenze: vorhandene Berichte enthalten keine exakte Heap-/Objekt-
Zuordnung am ursprünglichen Peak. Die historische Umgebung kann diese
Allokation nachträglich nicht liefern. Der nächste konkrete technische Schritt
ist daher die Vorbereitung dieses eng begrenzten Zuordnungsnachweises im
bestehenden Datenpfad; kein weiterer spekulativer Speicherpatch oder Gesamtlauf.
Neue kostenpflichtige DeepSeek-Aufrufe und zusätzliche Löschungen sind nicht
freigegeben. Die frühere begrenzte bezahlte Abnahme ist verbraucht und lieferte
keine gültige Codeabnahme; lokale Codex-Quellen-/Datenflussprüfung ist kein Ersatz.
