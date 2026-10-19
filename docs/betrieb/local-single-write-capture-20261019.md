# Lokaler Einzel-Snapshot beim atomaren Schreiben — 19.10.2026

Arbeitsbranch: `codex/single-write-capture-20261019`, Basis
`588a33d5ec595972f1ee0c13de62260237aef000`. Ausschließlich lokaler Kandidat;
Standardpfad unverändert, Kandidat OFF. Keine Production-Freigabe oder500-Abnahme.

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

Die pure Zählprüfung zeigt **3→2 JSON.parse-Aufrufe einschließlich neuer
Verbrauchseinträge**: genau eine vollständige Zustandskopie entfällt. Dies ist
kein gemessener RAM-, CPU- oder Laufzeitgewinn. Default und Kandidat bestanden
Erfolg, CAS-Konflikt, unbekanntes Ergebnis und falschen ACK-Root. Änderungen an
Aufruferzustand und Kostenobjekt während des Await ändern weder gesendete Inhalte
noch bestätigte Daten; keine falsche Kostenquittung und kein automatischer Retry.

Die vorhandene kleine native Fixture ist für vier neue Sicherheitsgruppen und
das identische gemeinsame Ressourcenpaar verdrahtet. **Noch nicht ausgeführt**:
echte native W46-Datenbankprüfung, W46-RAM-/CPU-/Temp-/WAL-/Langsamstaufrufmessung,
vollständige Unit60/Auth30/Offline90,500Profile/1500Ergebnisse/8000Kontrollen.
Keine500er-Freigabe wird beansprucht.

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

Nichts entfernt. Der Executor verlangt zuerst eine **tatsächliche neue
Betreiberfreigabe für genau diese sieben IDs** und wiederholt vor der ersten
Entfernung alle Identitäts-/Archiv-/Abhängigkeitsprüfungen. Frühere Freigaben
für andere zehn/neun Hüllen gelten nicht für diese sieben.

Im Plan waren9.855.721.472B frei. Rechnerisch wären anschließend16.236.388.352B
frei; tatsächlichen Gewinn erst nach genehmigter Entfernung messen. Zur
vollständigen500er Plattenreserve16.589.934.592B fehlen danach weiterhin
**353.546.240B**. Der Plan ermöglicht die kleine Qualifizierung, keinen500er Start.

## Nächster notwendiger Schritt

Genaues neues Lösch-GO einholen. Danach ausschließlich die sieben geprüften
Hüllen frisch prüfen/entfernen und Ist-Kapazität messen. Anschließend mit der
bestehenden Messinfrastruktur erst native Sicherheitsfälle, dann das identische
kleine OFF/ON-Paar einschließlich gemeinsamem Kernelpeak, CPU, Temp/WAL,
Antwortzeiten und tatsächlicher Datenintegrität durchführen. Kein neuer Motorumbau.

Vor einer Empfehlung für den vollständigen Lauf fehlen ein relevanter
gemessener Vorteil, die unabhängige kritische Codeabnahme, ausreichende aktuelle
Plattenreserve sowie neue Start-/Tages-/Codebindung und separates500er-GO.
W45s einmaliger bezahlter DeepSeek-Pro-High-Aufruf endete am Ausgabelimit ohne
Abnahme; keine Wiederholung und kein weiterer kostenpflichtiger Aufruf erfolgt.
Die Codex-Planprüfung ersetzt diese kritische Codeabnahme ausdrücklich nicht.
