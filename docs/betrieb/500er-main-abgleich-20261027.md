# 500er: Main-Abgleich und kleinster Integrationsschritt

Stand: 27.10.2026, rein lokale Entwicklung; kein Merge oder Production-Eingriff.
Main `6b4012cd912fd0e1f5ec79969168d0dcc010927f`, historischer erfolgreicher
Mock-Lauf `11ca02dbea72603ccdabc3560edf93f45caabe3a` (W15), PR915-Kopf
`470d871a0d38afb3bc2aab4288537c70a382c80a`. PR936 und PR967 werden nicht übernommen.
Der vollständige Datei-/SHA256-Abgleich steht einmalig im
[maschinenlesbaren Beleg](500er-main-abgleich-20261027.json).

## Was erhalten bleibt

Alle 84 Dateipins des PR915-Releasemanifests wurden gegen dessen Git-Objekte
verifiziert. Gegen Main sind 54 identisch, 20 verschieden, 10 fehlen. Die 67
Quellen des Inhaltsworkers ergeben 50 identische, 13 verschiedene und 4 fehlende
Dateien gegenüber W15. Identisch bleiben unter anderem Profilgenerator,
1500er-Bilanzierer, Fachurteil, AfD-Zulassung, Datum-/EU-/Kostenvertrag und
Startschutz. Ihre bisherigen Komponentenbelege werden nicht erneut ausgeführt.
Identische Dateien allein übertragen keine gesamte Laufabnahme: Einbindungen,
Eingaben, Datenbank, Nodeversion und Sicherheitskontrollen gehören ebenfalls dazu.

Das spätere Releasemanifest enthält drei Dateien, die gegenüber W15 neu oder
anders sind: Anbieter-Runtimeprüfung, Artefaktleser und Vercel-Konfiguration.
Es wird deshalb nicht fälschlich als unverändertes W15-Laufmanifest bezeichnet.
Das bestehende [Minimalarchiv](https://drive.google.com/file/d/1_yaGlXYrG2ExYbE2MFBq_ucE4YtgMFCm/view)
wurde ausschließlich in der Cloud gelesen (269.598 B, SHA256 im JSON): alle79
Payloads stimmen mit dem Manifest überein, fünf Referenzen zusätzlich mit dem
bereits versionierten PR915-Dossier. Die500 Zeit-/Kontrollzeilen und4000
Authzeilen bestätigen die untenstehenden Maxima und8000 Kontrollen. Kein Test
wurde dafür wiederholt. Das Archiv schließt Originalbodies, DB-Dumps, private
Konfigurationen/GO, Schlüssel und Modellantworten ausdrücklich aus. Der26,6-MB-
Runtime-Primärbericht ist weiterhin nur hashgebunden referenziert; seine
vollständigen Rohmessungen wurden nicht neu verifiziert oder heruntergeladen.

## Gezielte Übernahme und verbleibende Änderungen

Nur `briefing-bereichsvertrag.js` wird bytegleich aus PR915 übernommen. Der
vorhandene Lagepfad akzeptiert gültige amtliche Artikelstände mit Kalendertag,
Main verlor sie jedoch beim Briefing-Tagesanlass wegen `published_at=null`.
Der Fix akzeptiert ausschließlich vollständig im Fenster liegende, hash- und
absatzgebundene Tage. Alias-/Text-/Datumsdrift und angeschnittene Tage sperren;
Radar, persönliche Erwähnungen und Fristen behalten ihre Zeitstempelpflicht.
Kein historischer Quelldatensatz wird umdatiert oder als heute aktuell behauptet.
Damit stimmen im Kandidaten 55 der 84 Release-Dateien mit PR915 überein.

Die übrigen Abweichungen sind im JSON einzeln benannt. Sie sind keine pauschale
Übernahmeliste. Vor einer weiteren Runtime-Integration sind getrennt zu entscheiden:

- **Unveränderlicher Inhaltsnachweis:** CPU-Epoch, kanonische Inhaltsfakten,
  Bytewriter, Inhaltsworker/-runner, Stored-Command und deren Pins fehlen.
  Die zugehörigen Änderungen an Storage, Command/Executor/Kostenplan, Codec,
  Adapter/Entry und Journal bilden einen gemeinsamen Sicherheitsvertrag.
  Einen einzelnen Cache ohne native Bindung, Signatur, frische Kontrollen und
  Quellenqualifikation zu übernehmen wäre nicht zulässig. Main hat diesen Pfad
  nicht; der historische Geschwindigkeitsbeleg gilt nicht für Main.
- **Quellenhintergrund:** Die übrigen Änderungen an Aussagenbindung,
  Lage-Quellenbeleg/-Prompt, Auszug und Zeitvertrag unterstützen insbesondere
  einen exakt gebundenen historischen Bundestags-PDF-Hintergrund. Das ersetzt
  keine aktuellen zulässigen Tagesanlässe und wird nicht vorsorglich übernommen.
- **Batch-/Transport-/Releasegrenzen:** Der gebündelte Current-Inputs-Leser,
  zugehörige inerte SQL-Migration, begrenzte Supabase-Antworten, Artefaktleser und
  Bundle-Konfiguration sind zusätzliche Integrationsteile. Vor deren Übernahme
  muss der tatsächlich ausgewählte Motorpfad feststehen. Keine SQL-Anwendung,
  Runtimevariable oder finanzielle Adoption gehört zu diesem Sprint.

## Zeit und Speicher: belastbare Grenzen

| Beleg | Aussage und Grenze |
|---|---|
| W15: 500 Abschlüsse / 1500 Positionen / 1000 D/R-Mocks / 8000 Kontrollen | Historischer Erfolg mit echtem lokalem DB-Pfad; keine echten Modellqualitätsurteile. |
| W15: Offline 8,067519 s; Vorbereitung max. 2,483585 s; Auth max. 1,263639 s | Innerhalb 90/60/30 s, ausschließlich für diesen Stand. |
| W15: Unit max. 58,950356 s | Nur 1,049644 s Abstand zu 60 s. Keine robuste Production-Zeitreserve. |
| W16: zusammengesetzte Phasenspitze 1.703.567.360 B bei 2.048.000.000 B Limit | Rechnerisch 344.432.640 B Rest; kein Beleg für geforderte 500.000.000 B Reserve. Kein simultaner Gesamtpeak desselben Laufs, daher auch kein Beweis einer tatsächlichen Reserveverletzung. |
| PR936: 65,839926211 s, 9/16 Kontrollen, 1.349.423.104 B Kernelpeak | Fehlgeschlagener anderer Bundle-/Messpfad. `canonicalFull500UnitEquivalent=false`, Anker `firstAuthority`; weder direkt mit W15 verrechnen noch umankern. Kein vollständiger Unit-/RAM-Nachweis. |

Primärreferenzen: [W15/W16](https://github.com/ernisch/helmut-pilot/blob/470d871a0d38afb3bc2aab4288537c70a382c80a/docs/betrieb/500er-production-vorbereitung-20261016.md),
[PR936-Checkpoint](https://github.com/ernisch/helmut-pilot/blob/2fc821fd7bbdef1cf9846001e041a847a9f58f8f/docs/betrieb/belege/native-claim-only-20261023/NATIVE_76AF_CI_CAPACITY_CHECKPOINT_20261024.SAFE.json).
Die Unitzeit umfasst nicht die gesonderte Runtimevorbereitung; beide gehören
zur Gesamtdauer. Aus den lokalen Werten folgt keine garantierte9h-Productionsumme.
Grenzen bleiben unverändert; Komponentenverbesserungen werden nicht von
fehlgeschlagenen Gesamtzeiten abgezogen. Kein neues Ressourcen- oder 500er-Experiment.

## Validierung und nächster Schritt

34 gezielte Vertragsgruppen auf dem neuen Main-Kandidaten bestanden. Coverage
wurde direkt bei den notwendigen Integrationsläufen erfasst, zuletzt mit
Node v24.19.0 für **nur** `briefing-bereichsvertrag.js`: 99,47 % Zeilen,
84,75 % Verzweigungen, 95,12 % Funktionen. Keine repositoryweite Coveragebehauptung.
Aufruf: `node scripts/lokal.js -- node --test --experimental-test-coverage --test-coverage-include='lib/helmut/briefing-bereichsvertrag.js' scripts/briefing-bereichsvertrag-test.js`.
Zuerst bestanden33Gruppen; nach dem Review wurde der fehlende sichtbare
Integrationsfall ergänzt, danach34/34. Kein zusätzlicher Lauf nur für Coverage,
keine breite lokale Regression oder Wiederholung des historischen500erLaufs.

Ein getrennter lesender DeepSeek-Flash-High-Review bestätigte die Ablehnung
ungültiger Varianten. Sein Hinweis auf die fehlende sichtbare Briefingintegration
wurde durch einen positiven und einen Textdrift-Fall bis `toBriefingContractV3`
geschlossen. Auch der REST-Fall prüft diesen echten Adapter. Der weitere Hinweis
auf `fenster.end` ist kein Befund: Das bestehende API dokumentiert ausschließlich
`start`; das Ende ist `now`. Keine zusätzliche Fenster-API wird eingeführt.

Der vorhandene erste PostgreSQL-/PostgREST-Fall wird bis zum Briefing-Tagesanlass
verlängert: echte gespeicherte Zeilen → Storage-Leser → Lagequelle → Tagesanlass,
einschließlich Randmillisekunde und unveränderter Null-Uhrzeit. [CI40477575989](https://github.com/ernisch/helmut-pilot/actions/runs/40477575989) auf Codekopf `bc9ff4a2` vollständig erfolgreich:
beide Pflichtjobs, Standard- und Bereichsregression, alle erforderlichen
isolierten DB-Schritte und Z22. Der erweiterte REST-Fall und die Bereinigung
sind erfolgreich. Der tatsächliche Browserlauf wurde nach unverändertem
Prüfplan mangels UI-Änderung übersprungen; kein neuer Browsertest behauptet.

Nach CI ist der nächste notwendige Schritt die **eng abgegrenzte Auswahl des
Inhalts-/Stored-Command-Pfads** mit seinen echten Eingabe- und Quellenbindungen.
Vorhandene Quellenqualifikationen und Messdaten übernehmen, wo sämtliche Pins
passen; nur verbleibende aktuelle Grenzfälle prüfen. Die privaten Originale des
vergleichbaren späten DB-Zustands und vollständigen Motorharness liegen hier
nicht vor. Auch der im PR936-Checkpoint verlinkte Wiederherstellungsindex
ist laut Drive-Metadaten PGP-verschlüsselt (6007B); er wurde weder heruntergeladen
noch entschlüsselt. Kein neuer Zugriff oder Key wird erfunden. Ein kleiner
synthetischer Test kann diese Performancebelege nicht ersetzen.
Ohne diese Grundlage kein sinnvoller neuer Gesamtressourcenlauf und keine
behauptete Zeit-/Speicherlösung. Hetzner ist dafür kein notwendiges Starttor.

Status: **gezielter Abgleich und Vertragsfix abgeschlossen; gesamter500erPfad
weiter teilweise abgeschlossen**. Der abschließende Dokucommit verändert keinen
Anwendungscode. Sein erneuter CI-Start wird mit `[skip ci]` unterdrückt, um den
bereits bestandenen kumulativen PR-Prüfumfang nicht nochmals auszuführen.
Der CI-Erfolg wird ausschließlich für `bc9ff4a2` behauptet, nicht als neuer
Pflichtcheck für den Doku-Kopf. Vor einem späteren Merge bleiben die tatsächlichen
Endkopf-Prüfungen und ein gesondertes Production-GO verbindlich.
Merge/Deployment, aktuelle Quellen-/Finanz-/Releaseannahme, Profilaktivierung,
kostenpflichtige Modellaufrufe und die unabhängige 1500er-Production-Endabnahme
bleiben außerhalb dieser Freigabe. Rückweg des Patches: PR nicht übernehmen oder
die einzelne Vertragsänderung zurücknehmen; keine Daten-/Schemawirkung.
