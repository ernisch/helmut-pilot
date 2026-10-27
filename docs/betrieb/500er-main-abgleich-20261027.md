# 500er: Main-Abgleich und kleinster Integrationsschritt

Stand: 27.10.2026, rein lokale Entwicklung; kein Merge oder Production-Eingriff.
Main `6b4012cd912fd0e1f5ec79969168d0dcc010927f`, historischer erfolgreicher
Mock-Lauf `11ca02dbea72603ccdabc3560edf93f45caabe3a` (W15), PR915-Kopf
`470d871a0d38afb3bc2aab4288537c70a382c80a`. PR936 und PR967 werden nicht übernommen.
Der vollständige Datei-/SHA256-Abgleich steht einmalig im
[maschinenlesbaren Beleg](500er-main-abgleich-20261027.json).

## Aktuelle W15-Entwicklungsintegration

[Draft-PR971](https://github.com/ernisch/helmut-pilot/pull/971), Runtimecode`058cc9e8`; Test-/Inventargrenzen danach gezielt ergänzt.
Eigener Branch `codex/w15-original-input-integration-20261027`, auf dem weiterhin
ungemergten PR969. Genau28benannte Runtimepfade entsprechen jetzt W15; einer war
schon in969enthalten.67geschlossene Quellen plus Worker sind byte-/SHA-identisch.
Die fünf benötigten CLI-/SQL-Schnittstellen und die Worker-Paketierung sind
übernommen. Main-Buildauswahl, Router und übrige Vercel-Einstellungen bleiben;
nur dieser Entwicklungsbranch ist zusätzlich von Previewdeployments ausgeschlossen.
Keine vollständige Übernahme von915oder späteren PRs.

Elf Originaldateien mit96.530.256B sind vollständig empfangen. Der4.981.565B-Dump
wurde in einer neuen isolierten PostgreSQL17.6-Testdatenbank wiederhergestellt:
`synthetik500-runtime-pg-7e1c20261027` / `helmut_w15_input_20261027`, Netzwerk`none`,
keine veröffentlichten Ports. Die drei Immutable-/Lesefunktionen und der
Batchleser lagen bereits mit den erwarteten Körpern im Dump; keine Migration
musste lokal erneut installiert werden. Die500Aktivflags stammen aus der Quelle,
keine neue Aktivierung. Profile, Identitäten, Auth/Historie/Journal, Quellen/KOs,
Zähler und Storehashes sind nach den Tests unverändert.

Gezielte Ergebnisse:

| Prüfung | Ergebnis und tatsächlicher Umfang |
|---|---|
| Bestehender W15-Stored-Command-Test |81Fälle PASS; Signatur/Expiry/ALS/Freshguards mit expliziten Worker-/RPC-Mocks; echter Worker-Bootstrap als Negativfall.|
| Originaldaten-Inhaltsprüfung |7Gruppen PASS; echte330/120/50-Profile, Original-U-C, D/R-Mock-Vertrag für Bundestag/Berlin/Brandenburg, vollständiger90.613.729B-Datentransport über Dictionary. Kein ausführbarer500er-Command in diesem ersten Codecfall.|
| Isolierte Originaldatenbank |8Gruppen PASS; echter ursprünglicher7Dokument-/6KO-Leser über lokale SQL-Transportanbindung, native U-/Tuple-/Funktionsbindungen, Rollen-/Immutable-Sperren, Drift/Unvollständigkeit und unveränderte Bestände. Keine HTTP-/PostgREST-Abnahme daraus.|
| Echter W15-Inhaltsworker |PASS,14.716,032657ms bei unverändert90.000ms. Vollständiges originales C genau einmal, Codec einmal, ordinary-v1 wie im erfolgreichen W15-Assembler.500Profile/1000Intents/1500Sollpositionen sind vollständiger **Inhalt**, keine ausgeführten1500Ergebnisse.|
| Testauswahl |20/20PASS; private Originalprüfungen aus automatischen Standard-/Bereichs-/erweiterten Sammelläufen ausgeschlossen.|

Der positive Workerfall verwendet die exakten empfangenen normalisierten Profil-/
Briefing-/Quellenobjekte. Originale und Urteile werden nicht neu geschrieben.
Nur klar als inert markierte Runtime-Metadaten werden für den historischen
16.10.-Funktionsfall im Speicher aufgebaut: inaktive Snapshotkopie, lokales
Kostenbuch und modellierte externe Belegstruktur. Keine tatsächliche aktuelle
Finanz-/Runtimefreigabe; keine DB-Schreiboperation, Rechteinstallation oder
Owner-GO. Die echte originale C-/Workerimplementierung prüft diesen Inhalt.
Bericht-SHA256 und alle Mess-/Geltungsfelder stehen im JSON-Beleg.

Eine echte Integrationslücke war die fehlende lokale Publikationspolicy.
Die bestehende nicht geheime Vercel-Konfiguration wurde ausschließlich gelesen
und mit dem Originalhash274033cdfdd5… gebunden. Keine Publikationssperre entfernt,
kein Originalurteil umgeschrieben, keine Productionvariable geändert.
Der erste Fehler bleibt als Log erhalten. Ebenso erhalten bleibt der90s-Abbruch
eines zunächst falsch gebundenen älteren13.10.-V2-Datensatzes mit874/500Quellen/KOs.
Er gehört nicht zum erfolgreichen7/6/v1-W15-Datensatz und wurde nicht wiederholt.
Keine Frist wurde dafür angehoben. Ein bestehender Direct-Test meldete8PASS-Gruppen,
aber sein äußerer100s-Coverageaufruf endete vor beobachtetem sauberem Exit;
für diesen Fall wird lokal kein sauberer Gesamterfolg behauptet.

Der [erste GitHub-CI-Lauf](https://github.com/ernisch/helmut-pilot/actions/runs/40502943321)
belegt Browser/Desktop/Mobil und die vorgelagerten isolierten DB-Schritte als grün.
Die Standardsuite endete mit173/177grünen Suiten: Inventar zweier öffentlicher
Konfigurationsnamen, zwei veraltete VM-Whitelistgrenzen und eine Volltext-Cronprüfung
waren noch nicht an W15 angeschlossen. Direct-, Production-Adapter- und Stored-Command-
Suiten bestanden dort bereits sauber. Bereichsregression und Z22 wurden nach dem
Standardfehler übersprungen und zählen nicht als bestanden.

Genau die vier benötigten Test-/Inventardateien aus11ca02db sind ergänzt, kein
Runtimecode geändert:38Inventarprüfungen,13Attestationfälle,3Auth-Rebindfälle plus
2Handler/20negative Bindungen und64Pipelineprüfungen bestehen lokal. VM-Optimierer
sind ausdrücklich inaktiv; echter SHA-Fallback und Authprüfungen bleiben aktiv.
Die Cronprüfung prüft jetzt nur strukturierte Cronrouten, inklusive zusätzlicher
Negativfälle. Unabhängiger lesender Review ohne Blocker. Die vorhandene
[Pflicht-CI am PR](https://github.com/ernisch/helmut-pilot/pull/971/checks)
ist nach diesen Korrekturen erneut abzuschließen; kein Grün für den neuen Kopf vorweggenommen.

Coverage wurde in den ohnehin erforderlichen Läufen erfasst:16V8-Dateien,
Prüfsummenindex privat erhalten. Die vier notwendigen CI-Korrekturprüfungen
liefern zusätzlich eigene V8-Dateien mit separatem SAFE-Bericht. Kein zusätzlicher Lauf nur für Coverage,
keine Gesamtquote für das Repository und keine Worker-Coverage behauptet.
Der native31,95%-Bericht betrifft ausschließlich den Elternprozess des älteren
fehlgeschlagenen Zusatzfalls und ist kein W15-Erfolgs-/Ressourcenmaß.
Die vorhandene GitHub-CI erhält den wiederverwendbaren81-Fälle-Test und die
angepassten zwei bestehenden HTTP-/FS-Testgrenzen; private Daten gehen nicht in CI.
Die beiden bestehenden CI-Jobs verwenden jetzt exakt Node24.19.0 statt22,
weil der unveränderte W15-Worker genau diese native Version verlangt. Kein neuer
Runner und keine Änderung der tatsächlichen Production-Runtime.
Eine unabhängige lesende Code-/Pin-/Schutz-/Paketierungsprüfung fand im Umfang
dieses Draft-PR keinen Blocker.

**Noch keine vollständige Laufabnahme:** Tatsächliches aktuelles signiertes
`backend.prepare/open`, HTTP-/Runtime-/Rechtekette und frische Tages-/Quellen-/
Finanz-/Laufbindungen bleiben vor der500er-Schlussabnahme zu qualifizieren.
Danach fehlen weiterhin der vollständige500erAusführungslauf mit1500brauchbaren
Ergebnissen/8000frischenKontrollen,90/60/30s und gemeinsamer Gesamtpeak einschließlich
DB/Caches/Prozessende≤2.048.000.000B sowie der gewünschte500.000.000B-Puffer.
Keine RSS-Einzelsumme wird dafür als gemeinsamer Peak ausgegeben.
Production-Rollout und bezahlter Modellnachweis bleiben separat freizugeben.

Die nachfolgenden Bestands-/Datenzugangsabschnitte dokumentieren frühere Schritte
am27.10.; ihr damaliger Blockierstatus ist durch den hier belegten Empfang und die
Entwicklungsprüfungen überholt. PR969 bleibt ungemergt.

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

## Gewählter Motorpfad und Datenzugang (Folgesprint27.10.)

**Genau ein Weg: der geschlossene W15-Ausführungskern aus PR915 auf
`11ca02dbea72603ccdabc3560edf93f45caabe3a`, auf aktueller Mainbasis.** Nur reine
unveränderliche Inhaltsarbeit darf wiederverwendet werden; alle bisherigen
frischen Zeit-/Profil-/Quellen-/Kosten-/GO-/Journal-/CAS-/ACK-Wachen bleiben.
PR969 bleibt ungemergt; sein Tagesanlassmodul ist bereits bytegleich W15.

| Geprüfter Bestand | Entscheidung |
|---|---|
| Main ohne W15-Inhaltsnachweis | Kein vollständiger Ressourcenbeleg. Der dokumentierte ältere Voll-C/Auth-Pfad überschritt bereits die ursprünglichen Grenzen; keine neue Kleinoptimierungsschleife. |
| W15 | Einziger vorhandener kompletter500erMockabschluss mit8000Kontrollen; deshalb gewählter Anwendungspfad. Die offene Reserve wird nicht als bestanden übernommen. |
| Spätere Auth-/Native-Ketten #917–#942 | Komponentenverbesserungen und Fehlersicherung erhalten, aber kein vollständiger500erAbschluss. Zusätzliche Graph-/Lease-/Mount-/Broker-/Owner-Lebenszyklen werden nicht als Voraussetzung dieses W15-Anwendungspfads übernommen. #940 stellt nur ein zuvor qualifiziertes Teilpaar wieder her; es liefert keine neue Unit-/RAM-Abnahme. |

Der [JSON-Beleg](500er-main-abgleich-20261027.json) benennt **28 W15-Runtimepfade**
mit SHA256; einer ist durch969bereits identisch,27bleiben für die spätere
Integration. Dazu gehören ausschließlich der gebundene Inhaltsworker/-runner,
Stored-Command/Signatur/Scope, zugehörige reine Hash-/Codec-/Vertragsänderungen,
Storage/Adapter/Entry/Journal und der echte begrenzte Current-Inputs-Leser.
Kein loses Cachemodul ohne seine Bindungen. Neue Quellenerfassung und neue
U-Prompts gehören nicht zu diesem D/R-U0-Pfad; die entsprechenden beiden
W15-Dateiänderungen werden nicht vorsorglich übernommen.

Die zugehörigen Schnittstellen sind ebenfalls einzeln benannt: nativer
Batchleser samt Rollback, unveränderliche Commandablage/-lesung und Pins,
CLI-Transport für **Vorbereitung60 plus unveränderte Unit60** sowie später
nur die notwendige Worker-Paketierung. Main-CI, Build-Auswahl, Router,
Deploymentschalter und fremde Arbeit bleiben erhalten. Diese Liste ist der
abgegrenzte Integrationsplan, **keine behauptete Qualifikation eines neu
zusammengestellten Releases**. Vor tatsächlicher Übernahme sind passende
Eingaben und unabhängige Integrationsabnahme nötig; Production-SQL bleibt gesperrt.

### Welche Daten tatsächlich nötig sind

Die gewählte Messung braucht500gültige synthetische Profile/1500Positionen,
1000D/R-Mocks und16echte frische Kontrollen je Profil. Quellen-/KO-/Draft-/
Reviewgraph müssen Umfang, Typen, Sharing, Tiefe, Fanout und Profilzuordnung
abbilden. Die früher dokumentierten3.012.510.816expandierten logischen Bytes gehören
zum älteren V2-Eingabeweg, nicht zum ausgewählten erfolgreichen W15-Datensatz.
Die tatsächlichen W15-Originale enthalten500ordinary-v1-Eingaben mit7ausgewählten
Dokumenten und6KOs. Der gesamte ursprüngliche DB-Bestand bleibt dabei erhalten.

Für den historischen W15-Eingabeweg sind konkret referenziert:

- `NORMALIZED500_CURRENT_POLICY.PRIVATE.json`:89.982.254B,
  SHA256`90e11a4228e2e568edf03c3feb9ea2c79e71449e68fdc6c563a3355f1fbaaa14`.
- Profilpaket631.359B, Nativeinventar44.832B und Source23/KO60-Daten82.170B.
- Original-U-Paket53.018B, zugehörige alte Reviewdaten und Vorgängerbindung als
  zu erhaltende Daten; **keine Übernahme ihrer alten Ausführungsrechte**.
- Geprüfte D/R-Mockkandidaten213.986B und Reviewtemplates97.720B.
- Vollständiger zu diesem Pfad passender logischer Auth-/Finanz-/Historien-/
  Journal-/Quellen-/Profil-/Ergebniszustand der isolierten DB. Ausgang,
  Installation, wachsender später Zustand, bestätigter letzter Abschluss und
  Rückweg/Prozessende müssen zusammenpassen. Die einzelnen Dateihashes und
  ursprünglichen Pfade stehen im JSON; diese Bodies sind hier nicht vorhanden.

Ein alter erfolgreicher oder gescheiterter Auftrag wird nicht zurückgesetzt.
Ein späterer V12-Postrun mit bereits betretenem/unklarem Index499 ist kein
frischer Vor-Unit-Snapshot. Neue lokale Instanzen brauchen ihre tatsächlichen
OIDs/Revisionen, neue Operation/Nonces und neue lokale Signierschlüssel und
Zugangsdaten. Historische GOs, Claims und private Schlüssel sind keine
wiederverwendbaren Performanceinputs. Kein Productioncredential gehört ins Fixture.

### Reichen vorhandene synthetische Fixtures?

**Nein, für diese Ressourcenabnahme nicht belegt.**
`scripts/fixtures/synthetik500-direct.js` erzeugt500Profile, aber nur3Dokumente
und3KOs und ersetzt deshalb den ausgewählten Originaldatensatz nicht.
**Präzisierung aus den empfangenen Originalen:** Der erfolgreiche W15-Assembler
verwendet selbst ordinary-v1 mit7Dokumenten/6KOs; der Worker unterstützt diesen
Pfad ausdrücklich mit vollständigem originalem C. Die frühere Aussage, v1 allein
liege außerhalb des benötigten W15-Pfads, war zu weitgehend. Der ältere874/500-V2-
Datensatz aus dem Dump ist eine andere Eingabemenge und kein W15-Mindestumfang.

Neue vollständig gültige synthetische Daten könnten grundsätzlich eine eigene
Messung tragen. Historische Originaltexte sind deshalb **keine allgemeine
Pflicht für jeden neuen Synthetiktest**. Mit dem vorhandenen Bestand ist aber
weder eine konservative Lastäquivalenz noch eine vollständige rekonstruierbare
W15-Graph-/DB-Beschreibung belegt. Gleiche Bytes oder ein aufgefüllter kleiner
Datensatz genügen nicht. Eine neue Generator-/Architekturvariante wird nicht eröffnet.
Die späteren Zahlen1848Knoten/6.010.786Payloadbytes/6000Historyzeilen betreffen
zusätzlich einen anderen gesplitteten Authpfad und dürfen W15 nicht ersetzen.

### Sicherer Cloud-Speicherort und Wiederherstellungsweg

Nur Metadaten und kleine sichere Belegpakete wurden gelesen, keine großen
Original-/Cipherteile geladen und keine Archivprogramme ausgeführt:

- Privater [HELMUT-Driveordner](https://drive.google.com/drive/folders/1gvYcdBSGYscOmTxYeJSJ3TpbacyJWBFd).
- [Vorhandener Sicherungsindex](https://drive.google.com/file/d/17DDhInbRwN20nqRPuNp3KTLq6AqMEhWc/view),
 14.384B, SHA256`87508b035c31fea52f4910cedf80b63baabf055e54cfe714dfe143383c15ec0c`,
 stimmt mit dem bereits versionierten Handoff überein:30Cipherteile,
 487.267.152B verschlüsselt, Scope1767Dateien/2.865.680.705B.
- [Empfängerbericht](https://drive.google.com/file/d/1-kUkySS3dwV3belI3LZWgTkzEXyB4Gre/view):
 Fingerprint`DCFD605ED28EEACA9B826105E769DE07A68BA8E4`, privater Schlüssel nur auf
 dem damaligen Hetzner-Ziel. **Keine Hetzner-Verbindung, Schlüsselprüfung,
 Entschlüsselung oder Übertragung durch diesen Sprint.**
- [Kleines SAFE-Paket](https://drive.google.com/file/d/1ENhDwHmj7jTnmTOe6LTV30BKUK1UUT4p/view):
 143.904B, SHA256`e04ce3c460337b3735ccea170808f8f3085d26fe5bfa6e1f0a73a4d187120a1d`;
 alle13inneren Dateipins geprüft. Es belegt insbesondere ein späteres
 2GiB-V12-RAW und W20-Eingaben, **keine bestätigte vollständige W15-Teilmenge**.
- Die älteren Archive vom13./14.10. und der verschlüsselte0ea8-Recoveryindex
 bleiben nur historische Speicherreferenzen. Kein automatischer Rücksprung und
 keine behauptete Vollständigkeit der später benötigten W15-Daten daraus.

Die Originalcloud ist im Empfängerbericht identifiziert; der Index vom26.10.
behauptet deren Erhalt. Die heutige Sitzung ist eine andere Cloud. Ein lesbarer
Index oder ein gelesener alter Chat verleiht keinen Dateizugriff auf diese Quelle.
Die alte [Cloud-Transferanleitung](https://drive.google.com/file/d/1aD8_ofHkAcyhD2k04w01pW3vEvFVfml2/view)
ist an einen anderen bestätigten Empfänger gebunden; sie autorisiert keine
Entschlüsselung in dieser Sitzung.

**Historische Betreiberfreigabe vor der neuen Schlüsselanlage:** Damals war die
Übertragung privater Schlüssel erlaubt. Für den neuen Empfängerschlüssel BA62F5AA…
gilt die spätere ausdrückliche Grenze: dessen privater Schlüssel und Passphrase
bleiben ausschließlich in der geschützten aktuellen Cloud. Der ausgewählte
Datenempfang ist abgeschlossen. Der damals offene Zugriff auf den älteren
Ursprungsschlüssel wurde für diesen Empfang nicht benötigt. Production/Modelltests
bleiben gesperrt.

### Gezielter Datenbestand, abschließende Prüfung27.10.

Das [Übernahmemanifest](w15-minimal-datenuebernahme-20261027.json) enthält exakte
Pfade, Größen, SHA256 und bereits verfügbare Archivmitglieder. Die kleine
Originaldatei-Ergänzung und das Ressourcenabhängigkeitspaket vom16.10. sowie der
Metadatenkatalog vom19.10. wurden gezielt nachgeladen und per Gesamthash geprüft.
Keine großen Originalarchive oder Cipherteile wurden geladen.

- **Bereits vorhanden:** fünf hashgleiche Dateien: Policy-/Inhalts-/Mockabnahme,
  Original-U-Review und Vorgängerbindung. Dazu die direkten Beleg-/Binderdateien
  des vorhandenen Ressourcenabhängigkeitspakets. Keine erneute Übertragung nötig.
- **Hier fehlend:** acht Originaldateien mit exakt **91.544.863B**: die sechs
  W12/W13-Eingaben, Original-U-Paket und die439.524B große Profilreferenz
  `wave11/cohort-requirements/PROFILES.PRIVATE.json`. Letztere ist im originalen
  `exact-request-binder` fest nach Größe/Hash gebunden und fehlte in der ersten
  Zwölferreferenzliste. Git-Objekte enthalten keinen exakten Bodytreffer.
- **Passender DB-Ausgang gefunden:** Der [Drive-Kontrollindex vom19.10.](https://drive.google.com/file/d/1DG1uKBfEZjuMUhzIiItuJIgNgyr_yb6G/view)
  (15.999B, SHA256`979cae32eb0f24ae9df6640094a061c593e486a3d467933774224b72569eded1`)
  führt für `helmut_fresh_input_fixture_d2e98984` genau
  `wave20-resource-integration/source-capture/FROZEN_SOURCE.PRIVATE.dump`,
  SHA256`06c6f37c7189dd166641d867809d42424f5c44618ab5cf6974939057ad61025c`.
  Seine Einzelgröße und der Inhalt des verschlüsselten inneren Manifests sind
  hier noch nicht lesbar. Die Sicherung umfasst sieben Teile/111.247.647B;
  sie wird deshalb noch nicht vollständig übertragen.
- **Benötigter Zustand:**500synthetische Profile,501Identitäten, sechs Storezeilen
  im historischen Eingang; Original-U und Auth-/Finanz-/Journalzustand erhalten.
  Im neuen isolierten Lauf wächst der vollständige späte Zustand regulär.
  Dafür muss kein alter Endzustand zurückgesetzt und kein späteres2GiB-V12-Image
  importiert werden. Nur dieser eine Eingangsdump plus Capture/Rollenmetadaten
  ist ausgewählt, nicht alle vier späteren Datenbankstände.

**Einfachster nächster Schritt:** Im erhaltenen Originalspeicher die acht Dateien
und den ausgewählten Dump/Capture/Rollensatz direkt prüfen und gezielt in diese
Cloud kopieren. Falls nur die Drive-Sicherung erreichbar ist, den bereits
passenden privaten Schlüssel verwenden/übertragen und nur diese Mitglieder
bereitstellen. Der Schlüsseltransfer ist erlaubt; Quelle/Schlüssel sind hier
technisch nicht angeschlossen. Keine neue Verschlüsselungsarchitektur nötig.
Das ist kein Beleg für Datenverlust. Die endgültige Gesamtgröße bleibt bis zur
Dump-/Capture-Inventur offen. Private Inhalte gehören weiterhin nicht in Git/Chat.

**Folgesprintstatus: blockiert an sicher verfügbarer vergleichbarer Datenbasis.**
Pfad und Datenvertrag sind gewählt und dokumentiert; kein Runtime-Port, neuer
Test oder neue Infrastruktur gestartet. Nach sicherer Datenannahme nur diesen
W15-Kern integrieren, vorhandene zielbezogene GitHub-/isolierte PG-Tests nutzen
und ausschließlich die tatsächlich fehlende gemeinsame Zeit-/RAM-Abnahme ergänzen.

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
