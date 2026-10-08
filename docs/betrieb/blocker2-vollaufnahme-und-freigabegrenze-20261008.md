# Blocker 2: vollständige Eingabeaufnahme und Datenfreigabegrenze

Stand: 08.10.2026, UTC. Ausschließlich Blocker 2. **Offen; fachliche Eingabeabnahme 0/500.** Alle 500 tatsächlichen Eingaben sind authentifiziert und einzeln gegen die verfügbaren Belege geprüft. Eine vollständige positive fachliche Abnahme ist nicht belegt. Keine neuen Production-Datenänderungen, Profiländerungen/-aktivierungen, kostenpflichtigen Helmut-Production-Modellaufrufe oder 500er Funktionstests.

## Aufnahme und Einzelbilanz

Der einmalige [Nurleselauf 37709954587](https://github.com/ernisch/helmut-pilot/actions/runs/37709954587) auf Commit `000e313b8ce8ab3b54c920666c5464148858b052`, Berliner Tag 08.10.2026, erfasste ausschließlich die geschlossenen 500 inaktiven Synthetikprofile: 330 Bundestag, 120 Berlin, 50 Brandenburg. Aufnahme 00:52:01–01:13:11 UTC, 21m10s; exakt 500 Eingabe-GETs und zwei Identitätsprüfungen. Kein Stop, kein Wiederholungslauf.

28 laufend gesicherte Cipher-Artefakte wurden vollständig heruntergeladen und gegen GitHubs Artefaktdigests geprüft. Alle 500 Originale und 28 Manifeststände wurden mit dem fest gebundenen Empfänger authentifiziert. Maßgeblich ist das tatsächlich hochgeladene `phase: final`-Manifest mit allen 500 Positionen und Abschlussidentität; ein nur lokal nach der Uploadquittung erzeugtes Manifest wird nicht als hochgeladener Beleg ausgegeben. Originalbody-SHA256, Profil-, Paket- und tatsächliche Eingabebindung wurden für jede Position neu berechnet. Die früheren 435 Eingaben wurden nicht beigemischt.

| Erfassungskategorie | Anzahl |
| --- | ---: |
| Vollständig technisch erfasst | 500 |
| Leere Eingaben | 0 |
| Doppelte Profilpakete | 0 |
| Technisch unbrauchbare Originale | 0 |
| Technisch fehlerhaft / widersprüchliche Transportbindung | 0 |
| Nach Stop oder sonst nicht erfasst | 0 |

Die folgenden fachlichen Hauptkategorien sind **gegenseitig ausschließend**. Reihenfolge: belegter Zeit-/Quellen-/Ebenenwiderspruch, sonst doppeltes Ereignis, sonst fehlender positiver Nachweis.

| Fachliche Hauptkategorie | Anzahl |
| --- | ---: |
| Vollständig und fachlich angenommen | **0** |
| Widersprüchlich: mindestens ein Zeit-, Quellenbindungs- oder Ebenenbefund | 343 |
| Doppelt: Ereignisduplikat ohne anderen belegten Widerspruch | 34 |
| Fehlend: verbleibender fachlicher Nachweis | 123 |
| Leer | 0 |
| Nachgewiesen unbrauchbar | 0 |
| Technisch fehlerhaft | 0 |
| Nicht erfasst | 0 |
| Summe | **500** |

343 bedeutet nicht 343 vollständig falsche Briefingtexte. Die Kategorie umfasst auch falsche strukturierte Zuständigkeit und eine unpassende Quelle zu einer teilweise anderweitig belegten Aussage. Fehlender Quellenauszug bedeutet fehlenden positiven Beleg, nicht automatisch eine falsche Behauptung. Auch die 34 und 123 Profile haben keine vollständige fachliche Abnahme.

Die [CSV-Einzelbilanz](blocker2-500-einzelbilanz-20261008.csv) enthält **alle 500 Profile**, jeweils tatsächlichen Eingabehash, Ebene, Anzahl sichtbarer und konkret gematchter KOs, Anzahl notwendiger fehlender Bindungen, Widerspruchstypen, Ereignisduplikat, Anzahl offener KO-Nachweise und Hauptkategorie. SHA256: `68151dd19df0b5eec727a002f34e0c5c3e3f0e926014a5bc4b60114f28b42be5`.

| Ebene | Profile | Angenommen | Mit Widerspruch | Ereignisduplikat einschließlich Überschneidung | Konkret notwendige fehlende Bindung |
| --- | ---: | ---: | ---: | ---: | ---: |
| Bundestag | 330 | 0 | 213 | 58 | 0 bisher konkret zugewiesene |
| Berlin | 120 | 0 | 114 | 22 | 30 |
| Brandenburg | 50 | 0 | 16 | 11 | 12 |

Die letzte Spalte ist ein belegtes Minimum, keine positive Vollständigkeitserklärung für Bundestag oder die übrigen Profile. Weitere Quellen-/Notwendigkeits- und Resolverbelege bleiben offen.

## Umfang und Grenzen der fachlichen Prüfung

Alle 20.535 sichtbaren Profil→KO→Quellenbindungen wurden zu 401 sichtbaren KO-Versionen und 554 sichtbaren Quellenversionen vollständig geprüft. Die breitere `korrekturBasis` enthält 500 KO-Versionen und 878 Quellenversionen; nicht sichtbare fehlgeschlagene Gruppen werden nicht pauschal jedem Profil zugerechnet.

401 sichtbare KOs wurden einzeln erfasst. 77 enthielten gespeicherten Quellenkontext; 324 hatten zunächst ausschließlich Titel und leere gespeicherte Auszüge. Für alle 21 KOs mit konkreten `matchedFeatures` wurden alle 38 Quellenversionen gegen verfügbare gebundene Originalbelege geprüft: 21 öffentliche Originalseiten erfolgreich gelesen, acht bestehende versionsgebundene Belege weiterverwendet, fünf ohne Original-URL, einmal HTTP403, einmal HTTP404, zweimal Transportfehler. Keine Wiederholung der bereits belegten Importe oder Quellenkorrekturen; keine Schlussfolgerung, dass außerhalb des gespeicherten Auszugs keine öffentliche Information existiert.

Für jede der 500 Positionen sind notwendige Quellen, KO-Bindung, Zuständigkeit, Resolverbindung, tatsächliche Briefingeingabe, Profilbindung sowie Zeit/Ebene im privaten Einzelbericht geprüft oder ausdrücklich als unbelegt ausgewiesen. Fehlende Profilnotwendigkeit einer Hintergrundinformation wird nicht zu einer erfundenen persönlichen Falschaussage umgedeutet. Tatsächliche öffentliche Volltexte werden nicht rückwirkend als ursprünglich gelieferte Quellenauszüge ausgegeben.

Die vorhandenen amtlichen aktuellen Quellen und vorbereiteten Resolverentscheidungen sind weiterhin eigene Belege, keine bereits vorhandenen aktuellen KOs. Insbesondere bestehen die zwei unten konkret benötigten Originalquellen, aber kein zugehöriger notwendiger KO und keine Quellenkante; der vollständige aktuelle KO-Bestand und eine Suche nach alternativen Bindungen belegen diese Lücke. Die übrigen vorbereiteten Entscheidungen sind kein automatisch notwendiger 500er Sollkatalog.

## Überlappende konkrete Befunde

- **42 Profile:** notwendige aktuelle KO-/Quellenbindung fehlt: 30 Berlin/Bildung und zwölf Brandenburg/Verkehr. Amtliche Originale und konkreter Geltungszeitraum sind belegt; keine behauptete persönliche Elternpflicht, Ausschussmitgliedschaft oder Teilnahmeverpflichtung.
- **60 Profile:** DOSB/IOC-Text vom 26.09. sagt im tatsächlichen Briefing vom 08.10. weiterhin „heute“. 120 betroffene Ausgabeaussagen, je Zusammenfassung und Empfehlung. Gemeinsamer Lesepfad mit PR858 korrigiert; die gespeicherten Originale bleiben unverändert.
- **269 Profile:** Berliner Senatsverwaltung/Abteilung Pflege ist als `kommune` statt `land` klassifiziert. 265 der 269 haben konkrete Merkmalsbindung; die weiteren vier erhalten daraus keine persönliche Zuständigkeitsbehauptung.
- **169 Profile:** Apotheken-/Pharma-Wahlkampfaussage ist einem Sondierungsvorgang zugeordnet, obwohl sie diese Sondierung nicht belegt. Die übrigen zwei Sondierungsquellen werden dadurch nicht falsch.
- **18 Profile:** Konjunkturprognose ist Quelle und Primärlink eines EU-E-Auto-Zulassungsvorgangs; die beiden tatsächlich passenden Zulassungsquellen bleiben gültig.
- **91 Profile:** dieselbe Entscheidung vom 08.07.2026 über vier MEKO A-200 DEU plus Option wird unter zwei KOs geliefert. 57 überlappen andere Widersprüche; 34 sind deshalb in der ausschließlichen Kategorie „doppelt“.

Diese Zahlen dürfen nicht addiert werden. Vollständige positive Quellen- und Notwendigkeitsbelege fehlen weiterhin für alle 500 Gesamtpakete.

## Merges, Deployments und Schutzkontrollen

| PR | Geprüfter Kopf | Merge Commit | Production Deployment | Ergebnis |
| --- | --- | --- | --- | --- |
| [856](https://github.com/ernisch/helmut-pilot/pull/856) | `f6b7facfc9aebdb1788ffc1ad98f2bd4fabb0a19` | Keiner | Keines | Unabhängige Prüfung BLOCKED; geschlossen, unverändert nicht gemergt |
| [857](https://github.com/ernisch/helmut-pilot/pull/857) | `102d6b9ff4a252206f569283492328eca5bc1187` | `000e313b8ce8ab3b54c920666c5464148858b052` | `dpl_8wJA8vgVyooYNh7T7y9oThQ79jrd` | Pflicht-CI und unabhängige Prüfung grün, READY |
| [858](https://github.com/ernisch/helmut-pilot/pull/858) | `d44b423b1eece2c50eeb0e95b36b5a58dfb3db3f` | `05cc738df6e8b8856e84540fc7c5fef8c0f08fb7` | `dpl_8EKpz8KrQXQTDnXR21nBrGyQbH38` | Pflicht-CI und unabhängige Prüfung grün, READY |

52 geschützte Tabellen wurden vollständig per Zeilenanzahl und sortierten Vollzeilenwerten einschließlich `xmin` verglichen:

- PR857: vorher 00:46:57.041848, nach READY 00:51:00.177658 UTC, unverändert.
- Aufnahme: vorher 00:51:00.177658, unmittelbar nachher 01:13:45.245812 UTC, unverändert.
- PR858: vorher 02:16:24.904229, nach READY 02:18:26.211315 UTC, unverändert.

Alle Profile, Rohquellen, KO-/Quellenkanten, Modellnutzungs-/Budget-/Jobtabellen und übrigen geschützten Zeilen blieben identisch. Keine neue Production-Modellwirkung. Die sieben früher konkret freigegebenen DIP-Korrekturen bleiben abgeschlossen, andere 36 wurden nicht angewendet.

PR857 stoppt vor weiteren Abrufen bei jeder Nicht-200-Antwort und verhindert neue Checkpoint-Uploads bei unklarem Teilupload-Ausgang. Die laufbezogene Artifact-Runtime sichert Ergebnisse unabhängig vom externen GitHub-CLI-Zugang. Der erfolgreiche einmalige GitHub-Lauf belegt diese Runtime; Offline-Fehlergegenproben bleiben zusätzlich bestehen.

PR858 unterdrückt nicht mehr belegte „heute“-Texte in Titel und Zusammenfassung anhand sämtlicher tatsächlicher Quellen, Berliner Kalendertag und Ausgabezeit. Fehlende, widersprüchliche, datumsreine oder zukünftige Quellenzeiten ergeben keine erfundene Tagesaussage. Keine Datumsumschreibung, keine neue Quelle, keine Modell-/Datenwirkung. 155 Standard-Offlinesuiten sowie gezielte Gegenproben und unabhängige Endprüfung bestanden. Das ist kein neuer tatsächlicher 500er Production-Eingabebeleg nach diesem Codewechsel.

## Historischer Abbruch und externe Diagnosegrenze

[37699789921](https://github.com/ernisch/helmut-pilot/actions/runs/37699789921) bleibt `cancelled`, **0 Artefakte, 0 verwertbare neue Eingaben**, unbekannte Abrufzahl. Der alte Packer verlangte ein geschlossenes Manifest, das bei einem Abbruch nicht zuverlässig vorhanden war; die Ursache und gezielte Reparatur stehen im [Abbruchdossier](blocker2-cipher-abbruch-reparatur-20261008.md).

Das damalige HTTP401 `Bad credentials` betraf den externen GitHub-CLI-Zugang, nicht den belegten Helmut-Cron-Endpunkt. Rotation, Widerruf, Ablauf oder Refreshfehler sind ohne Auditdaten des Credential-Providers nicht unterscheidbar. Keine erfundene genauere Ursache und keine Credentialänderung. Die Ergebnissicherung hängt inzwischen nicht von diesem Monitorzugang ab. Im aktuellen erfolgreichen Lauf keine erneute solche Beleglücke.

Die früheren 435 regulären Originale und ein weiterer außerhalb des Zeitfensters empfangener Body bleiben historische Belege. Der frühere Cipher-Transport bleibt ein Transport dieser Originale, kein neuer Production-Eingabelauf.

## Konkrete Freigabegrenze und nächste Aktion

Der kleinste unabhängig bestätigte notwendige Schritt ist eine **neue konkrete Production-Datenfreigabe für exakt vier INSERTs**: zwei amtlich belegte KOs und ihre zwei Quellenkanten. Vollständige Vorher-/Nachherwerte, native Hashes, Schutzbedingungen, Wirkung, Risiko, Nachkontrolle und Rückweg stehen in der [Freigabevorbereitung](blocker2-datenfreigabe-vorbereitung-20261008.md). SQL und vollständige Payloads sind privat, unverändert und hashgebunden vorbereitet, nicht ausgeführt.

Die weiteren fünf bestehenden Zeilenkorrekturen sind ein **separater** Vorschlag mit eigenem Transaktionshash, keine stillschweigende Erweiterung dieser vier INSERTs. Der Lösch-/Merge-Vorschlag für das Ereignisduplikat ist ausdrücklich **gesperrt**: eine abgeschlossene Verstehen-Reservierung erwartet die alte KO-Identität weiterhin. Null heutige FK-Referenzen beweisen keine sichere Wiederaufnahme. Blocker1-Motor und Reservierungen wurden nicht geändert.

Eine allgemeine Darstellungskorrektur für dieses Duplikat ist mit den tatsächlichen verfügbaren Eingaben nicht hinreichend belegt: unterschiedliche Ereignis-/Artikel-/Quellenidentitäten, leere Auszüge, kein eindeutiger gemeinsamer Beschlussidentifikator. Gruppierung nur nach Ausschuss/Tag/Textähnlichkeit wäre eine neue Resolverannahme; Quellen zum Master zu verschieben würde die tatsächliche Provenienz verändern. Die unabhängig belegte Gleichheit anhand zusätzlicher öffentlicher Volltexte benötigt eine ausdrücklich versiongebundene Ereignisbindung. Keine unbelegte Codezusammenfassung und kein Löschen abgeschlossener Identitäten.

Nach einer später konkret freigegebenen Datenaktion sind sofort alle Zielzeilen und die 52 geschützten Tabellen vollständig nachzuprüfen. Die historischen Originale werden dabei nicht als repariert oder angenommen ausgegeben. Ein neuer aktueller vollständiger 500er Nurlesebeleg benötigt eine gesonderte konkrete Freigabe; der erfolgreiche technische Lauf wurde nicht automatisch wiederholt. Auch danach bleibt positive fachliche Abnahme eine Prüfung aller 500, keine Folgerung aus vier oder neun Datenwirkungen.

## Gebundene Belege

Private Originale, Schlüssel, Logs und vollständige Zeilen bleiben außerhalb von Git. Hauptbelege unter `/workspace/private/blocker2-20261007/`:

| Beleg | SHA256 |
| --- | --- |
| Authentifiziertes tatsächliches Endmanifest: `durable-run-37709954587/authenticated-final-manifest-selection.json` | `b0ff8f412f945a9c8e88b25ceefe89ef202133da7a38c75bb8c8cbc46350c1eb` |
| Alle 500 Einzelbewertungen: `b2-current-all500-final-individual-input-assessment.json` | `72c3426582dd9876b0fe0eaf158725a28604851fec1620f4b400d6d2e21c13e9` |
| 401 KO-Einzelbewertungen: `b2-current401-final-individual-KO-evidence-review.json` | `a0d8f24120639198f5877d2320ce4fe240b533c2dda7968dcd5955e5b8304fff` |
| 20.535 sichtbare Bindungen: `durable-37709954587-all-visible-profile-KO-source-resolver-bindings.json` | `642a80a5af2b6e31a6f46de230ec16c2cf9e7a05a9d753779c6057130e85d46a` |
| Unabhängige kritische 500er-/Freigabeprüfung: `b2-final-independent-critical-evidence-and-permission-review.json` | `968fd7e991e2879cf35d9ecef976285399fcd4c442a54bed30cceae29fd0177b` |

Die unabhängige Prüfung reproduzierte alle 500 Profil-/Hash-/Themenbindungen, sämtliche 20.535 KO-Joins, 343/34/123 und 30+12 notwendige Lücken. Urteil: PASS für diese begrenzte Bilanz und die vierdatensätzige Freigabegrenze; BLOCKED für die Gesamtausführung des früheren 13-Wirkungen-Entwurfs oder eine vollständige Blocker2-Abnahme.
