# Lokaler Einzel-Snapshot beim atomaren Schreiben — 19.10.2026

Arbeitsbranch: `codex/single-write-capture-20261019`, Basis
`588a33d5ec595972f1ee0c13de62260237aef000`. Ausschließlich lokaler Kandidat;
Standardpfad unverändert, Kandidat OFF. **Auch W46 zeigt keinen gemeinsamen
RAM-Gewinn.** Keine Production-Freigabe oder500-Abnahme.

## Belegter Ausgang und Grenze der Ursachenbestimmung

W45 entfernte die vollständige logische Rekonstruktion aus dem nativen CAS.
Die gemeinsame kleine Vergleichsmessung ergab jedoch **810.905.600 →820.375.552B**,
also keine RAM-Ersparnis. Tempbytes458.960.409→21.455.719B und die gemessenen
34Schreibaufrufe10,742013→8,659157s sind W45-Ergebnisse, keine W46-Ergebnisse.
[W45 mit vollständigen Grenzen](local-cas-bounded-validation-20261019.md).

Der tatsächliche letzte500er Versuch erreichte2.050.535.424B bei verbindlich
2.048.000.000B und wurde beendet. Sein exakter Peak hat keine gleichzeitige
`memory.stat`-Aufteilung. Unabhängige Prozess-/Teilgruppenpeaks dürfen weder addiert
noch einem unbekannten Hauptprozess zugeschrieben werden. Kleine W45-Stichproben
zeigen viel anonymen Speicher, beweisen aber keine konkrete Objekt-/GC-Ursache
dieses500er Peaks. Keine nachträglich erfundene Zuordnung.

## Kleine Änderung und Sicherheitsgrenze

`llm-usage-atomic.write` musste bisher den aufrufereigenen Zustand zuerst mit
JSON.stringify/parse isolieren. `Parts.build` serialisierte und decodierte diesen
bereits isolierten, reinen JSON-Zustand anschließend erneut vollständig.

Der lokale Modus `HELMUT_AUTH_SINGLE_WRITE_CAPTURE=single-write-capture-v1`
verwendet `Parts.captureWrite`: Zustand und neue Verbrauchseinträge werden in der
bisherigen Reihenfolge vor dem ersten Await privat kopiert. Nur diese Factory
erreicht einen lexikalisch privaten Builderpfad, der die zweite Zustandsdecodierung
auslässt. Öffentliche `build`-Aufrufe können diesen Pfad durch weitere Argumente
nicht einschalten. Keine öffentliche Behauptung „bereits geprüft“, kein neuer
Cache und keine Wiederverwendung veränderlicher Aufruferobjekte.

Die vollständige Serialisierung mit identischer Expanded-Bytegrenze bleibt.
Root-/Typ-/Tiefen-/Arbeits-/Knoten-/Payloadgrenzen, tatsächliche Payload-SHAs und
kanonische Ergebnisse bleiben erhalten. Snapshot-/Versions-/Zielbindung,
EU-Kostenvertrag, komplette History-Präfixprüfung, frische native Prüfungen,
atomarer CAS, ACK-/Receiptbindung und Fehlerverhalten ohne automatische
Wiederholung bleiben unverändert. Die erste Isolationskopie bleibt erforderlich.

Der Modus braucht den vorhandenen ausschließlich lokalen relationalen Parts-Pfad;
ungültige Modi und Production werden abgewiesen. Er ist im vollständigen
Ressourcen-Descriptor ausdrücklich gesperrt, auch beim Wert `off`. Runtime- und
Vorabcheck-Quellbindung berücksichtigen die neue Variable. Alte Code-/GO-Bindungen
sind keine Bindungen für diesen Kandidaten. W45-Projektion und W43/W44-Graphcache
bleiben bei der vorgesehenen W46-Vergleichsmessung OFF.

## Tatsächlich ausgeführte gezielte Prüfungen

| Prüfung | Ergebnis | Aussagegrenze |
|---|---|---|
| `scripts/auth-single-write-capture-test.js` |13Gruppen PASS;54gültige/9ungültige Differentialvektoren gegen Git-Basis588a33d5 | Exakte Daten/Roots/Payloads/Hashmengen, Grenzen, private Ownership, tatsächlicher JS-Atomic-Writer mit injizierten Antwort-Mocks; keine native DB |
| Bisheriger Codec-Test |14Gruppen PASS | Root-/Typ-/Hash-/Grenz- und Änderungsfälle |
| Bisheriger Write-Reuse-Test |11Gruppen PASS | Unveränderte Wiederverwendungs-/Fallback-/Manipulations-/Budgetregeln |
| Neue gezielte Descriptor-/Quellbindungsprüfung |1Unittest PASS | Kandidat erreicht keinen500er Descriptor; keine versteckte Umgebungsdrift |
| Kleine native W46-Sicherheitsfixture `single-capture-13db641253` |4Gruppen PASS | Echte lokale Datenbankzugriffe: In-flight-Änderung, veralteter CAS, manipulierte Bestätigung nach tatsächlichem Commit, vollständige logische Wiederherstellung |

Die pure Zählprüfung zeigt **3→2 JSON.parse-Aufrufe einschließlich neuer
Verbrauchseinträge**: genau eine vollständige Zustandskopie entfällt. Dies ist
kein gemessener RAM-, CPU- oder Laufzeitgewinn. Default und Kandidat bestanden
Erfolg, CAS-Konflikt, unbekanntes Ergebnis und falschen ACK-Root. Änderungen an
Aufruferzustand und Kostenobjekt während des Await ändern weder gesendete Inhalte
noch bestätigte Daten; keine falsche Kostenquittung und kein automatischer Retry.

Die native Fixture ist vollständig abgeschlossen, eigene Prozesse beendet,
Originalpins und gesamte ursprüngliche Verbrauchshistorie erhalten. Ihr
582.922.240B-Peak enthält kein gemeinsames Loopdateisystem und ist ausdrücklich
kein Ressourcenvergleich. Der native CAS läuft dabei im bisherigen Modus;
W45-Projektion und Graphcache bleiben aus.

## Tatsächlich ausgeführtes gemeinsames W46-Vergleichspaar

Baseline `read-path-b2fb398fed`, Kandidat `read-path-011551cdbc`. Bestehender
Kernelmeter mit eigenem1GiB-Loopdateisystem, identischem Padding und32 zusätzlichen
Schreibvorgängen; alle Prozesse, Datenbank, Helper, Dateicaches und letztes
Prozessende bleiben in der gemeinsamen Gruppe. Kein Profiler, keine Änderung
von Speicherhülle, WAL-Einstellungen, Originalen oder Sicherheitsvertrag.

| Messwert | Kandidat OFF | Einzel-Snapshot ON |
|---|---:|---:|
| Vollständiger gemeinsamer Kernelpeak |890.748.928B|907.329.536B|
| Gemeinsame CPU-Zeit |56,400522s|57,013037s|
| Vollständige eigene Lebensdauer |66,716342367s|65,211216597s|
| Summe42 gemessener Aufrufzeiten |12,963082s|12,493485s|
| Summe34 gemessener Schreibaufrufe |10,131528s|10,079625s|
| Median Schreibaufruf |292,413683ms|289,719561ms|
| Langsamster Schreibaufruf |359,891855ms|426,550650ms|
| Langsamster gemessener Aufruf |704,039242ms|536,261998ms|
| Antwortbodybytes |505.304.460B|505.304.460B|
| Beobachtete kumulierte DB-Tempbytes |458.960.409B|458.960.409B|
| WAL-Statistikdifferenz im nativen Messfenster |1.113.867B|1.113.926B|

**Kein RAM-Gewinn: +16.580.608B.** Eine vollständig entfernte JSON-Decodierung
beweist keine niedrigere gemeinsame Speicherspitze. Keine Wiederholung des
Paares, keine nachträgliche Addition unabhängiger Peaks und keine Hochrechnung
auf500Profile. Die Lebensdauer dieses Diagnoseaufbaus ist weder Unit60 noch
Auth30. Beide eigenen Metergruppen einschließlich Storagehelper sind am Ende
leer; Datenintegrität und Originalbindungen bestanden.

Die unabhängige lokale Abschlussprüfung bestätigt Belegintegrität **PASS** und
RAM-Verbesserung **FAIL**: gleiche Quellen/Fixture,22nativeFunktionshashes und
15State-Katalogfunktionen, je42Aufrufe/34gemesseneWrites/36CAS/120vollständige
HTTP200-Bodies. Beide zusätzlichen Padding-CAS liegen außerhalb der einzelnen
SQL-Fenster, aber vollständig im Wireprotokoll. Nur den inneren Materializer
auswerten, keine inklusiven Elternzähler addieren. Tempstatistiken sind kumulativ,
WAL-Werte kein RAM-Anteil. Langsamster Schreibaufruf+18,52%; auch die kürzere
Gesamtlebensdauer beweist keine ausreichende Unit60-/Auth30-Reserve.

Bericht `wave46-single-write-capture/INDEPENDENT_COMPLETION_AUDIT.SAFE.json`,
SHA256 `10cd3529b19dd6242195905db495fac6876820d04adc370420291ed230ce1900`.
Nur Beleg-/Runtime-/Cleanupprüfung, keine kritische DeepSeek-Codeabnahme.
Source-only Nativekataloge sind strictAccepted; installierte Diagnosekataloge
bleiben wegen der zusätzlichen restriktiven `bench_writer/main-auth`-Policy
ehrlich strictAccepted=false. Daraus keine500er-Katalogabnahme ableiten.

**Weiter nicht ausgeführt:** vollständige Unit60/Auth30/Offline90,
500Profile/1500Ergebnisse/8000Kontrollen. Kein500er-GO beansprucht.

## Konkreter Plattenblocker und separat freizugebender Plan

Belege liegen in
`/workspace/helmut-parallel-20261015/wave46-single-write-capture/`.
Die sieben neu entstandenen, beendeten W45-Diagnosehüllen haben zusammen
**6.380.666.880B** exklusive zugeordnete Plattenblöcke. Methode: st_blocks nach
eindeutigem Device/Inode, Hardlink-Abschluss, exklusive Mount-/Init-Layer,
FIEMAP ohne geteilte/ungeklärte Extents; keine scheinbaren Sparse-Dateigrößen.

Der konkrete Plan `EXACT_SEVEN_DIAGNOSTIC_HULLS_REMOVAL_PLAN.SAFE.json`, SHA256
`a30ea30480139a4b10dd92be26f3812424fc2b51fca5bfd526956ee675cd0e2c`,
enthält genau diese sieben vollständigen Containeridentitäten. Sämtliche
Datenbankdateien, Loop-Images, Docker-Volumes/Images, Originale, Worktrees,
Messberichte und alten Freigaben bleiben erhalten. Die einzige laufende
Originaldatenbank bleibt geschützt. Entfernte Container-IDs sind nicht
wiederherstellbar; neue Hüllen wären nur aus erhaltener Konfiguration und Daten
mit neuen IDs rekonstruierbar. Verbrauchte Aufträge werden dadurch nicht erneuert.

Das private lokale Wiederherstellungsarchiv
`SEVEN_DIAGNOSTIC_HULLS_RECOVERY.PRIVATE.tar.gz` hat106.089B, SHA256
`1c6c3c7f87bec17c7dd58c18965dd8faacbeb71aca200c34602416d5bae71574`.
Alle29Dateien/28Manifestpins wurden vollständig rückgelesen. Vollständige Inspect-
und Logdaten verbleiben privat lokal; keine Übertragung an Drive oder Modelle.

Unabhängige Codex-Planprüfung PASS, Bericht
`INDEPENDENT_SEVEN_HULLS_PLAN_REVIEW.SAFE.json`, SHA256
`a0f559f6e46ac65cc76c37d880edf0ced81ce436ee3ff98d019f245369791e59`.
Archivinhalt, aktuelle Identitäten/Logs, Herkunft, Datenabhängigkeiten und der
begrenzt vorbereitete Executor sind geprüft. Die physischen Blockzahlen beruhen
auf dem vollständig gepinnten Root-Audit; der Prüfer hat diese wegen fehlender
direkter Docker-Layerrechte nicht separat neu vermessen. Reihenfolgevariationen
der Docker-Mountliste werden ausschließlich nach Zielpfad normalisiert.

Nach tatsächlichem neuem Betreiber-`Go` auf genau diese Anfrage hat der unverändert
geprüfte Executor sämtliche Identitäts-/Archiv-/Abhängigkeitsprüfungen frisch
bestanden und **genau die sieben IDs einmal entfernt**. Archiv, alle Daten,
Volumes/Images/Originale und laufende Original-PG mit PID2083 sind erhalten.
Keine anderen Löschungen; die Freigabe gilt nicht für neue Diagnosehüllen.

Im Plan waren9.855.721.472B frei; seine Prognose war keine Ist-Zusage. Tatsächlich
stieg die freie Kapazität bei der Entfernung von9.855.365.120 auf16.257.400.832B:
**6.402.035.712B netto frei geworden**. Zur vollständigen500er Reserve fehlten
zu diesem Zeitpunkt332.533.760B. Die anschließenden drei gezielten Fixtures
erzeugten neue eigene Hüllen und Daten; danach11.417.579.520B frei, also
5.172.355.072B unter der500er Reserve. Beide Werte sind zeitgebundene Beobachtungen.
Neue Hüllen/Daten/Belege bleiben erhalten; keine pauschale weitere Löschung.

## Nächster notwendiger Schritt

Die konkrete Bereinigung und die vorbereitete kleine Qualifizierung sind
abgeschlossen. Die Änderung bleibt OFF; **kein weiterer vollständiger Lauf auf
dieser Grundlage empfohlen**. Der gewünschte gemeinsame RAM-Vorteil fehlt.
Keine weitere Wiederholung und keine neue Cache-/WAL-/Speicherhüllenvariante.

Vor einer Empfehlung für den vollständigen Lauf fehlen weiterhin ein relevanter
gemessener RAM-Vorteil, die unabhängige kritische Codeabnahme, ausreichende aktuelle
Plattenreserve sowie neue Start-/Tages-/Codebindung und separates500er-GO. Der
verbleibende anonyme Speicher lässt sich aus den Altbelegen nicht einem exakten
Allokationsobjekt am500er Peak zuordnen; diese Beleglücke nicht durch eine weitere
unbewiesene Einsparungsbehauptung ersetzen.
W45s einmaliger bezahlter DeepSeek-Pro-High-Aufruf endete am Ausgabelimit ohne
Abnahme; keine Wiederholung und kein weiterer kostenpflichtiger Aufruf erfolgt.
Die Codex-Planprüfung ersetzt diese kritische Codeabnahme ausdrücklich nicht.
