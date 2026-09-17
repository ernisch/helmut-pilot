# Gipfelfehler und fehlender Artikelkontext

Stand17.09.2026. Untersuchung nach PR424 abgeschlossen; fachliche Reparatur blockiert. **Der Gipfelfehler ist nicht behoben.** Dieser Folgebranch enthaelt Dokumentation und seinen Deployschutz, keine Aenderung des Anwendungscodes. Kein Production Nachweis.

## Verifizierte Basis

Basis PR424 `70f19f3a1abc4afb6c9ee6f006b65c1a4b4b79e9`, Tree `3ee171bfcc7580592e36806fff117ad2ec3cf253`. CI35214181782 vollstaendig erfolgreich:399/399 Suiten, Browser50/50, Kontoschutz15/15 mit500 isolierten Registrierungen, Z22 PASS48/FAIL0. Diese Nachweise gehoeren zu PR424 und sind kein Gipfelnachweis.

Rein lesender Vorflug am17.09.: Main `2d1eb705e00ea5f5ff8f351997e429cc16d195c1`, PR419 bis PR424 mit unveraenderten Heads offen und Draft. Keine in_progress oder waiting Actions; allein die unveraenderten queued Laeufe31128435980 und31126446647 vom06.08. auf anderen Branches. Keine sichtbaren weiteren lokalen Reparaturprozesse. Globaler Work Sitzungsstatus nicht abfragbar; Betreiber hat vorherige Threads beendet und die Fortsetzung erlaubt. Vier Vorgängerkopien sauber, fremde Kopie mit55 uncommitteten Vorarbeiten unveraendert erhalten.

Production `dpl_At93X1HMzB5fsAJ2wZQ8FuvW3Dfy` READY mit passendem Main und Hauptalias; keine Deployments am17.09. bis zur Uebernahmepruefung. Keine frische Datenbankaufnahme und keine Aussage ueber aktuelle Profilzahlen.

## Originalbefund und direkte Nachpruefung

Privates Originalpaket `Helmut_500_Productiontest_20260915_Belege.zip`, Version18, Library ID `libfile_73a0aec215c8819190d5a55fd34b3924`. Verwendet: `Qualitaetsbefunde_A001_Zeit_Titel_20260915.json` und `Pruefaufnahme_A001_34984794661.json`, SHA256 `6da8ee383caede846d0e312f7366c6fbb81d8d5ebeed0dc7a1c9c6209f995455`. Keine Verwendung des historischen Uebergabebelegs Version505 als aktuelle Wahrheit.

Betroffen ist `vg-sicherheitspolitisch-20260914-dfbbaf`, Dokument `rd-3b5348e9f768779540af5915c4336b42451d42e88c82af52fd6be5cdf9de9a77`. Die Aufnahme enthaelt genau eine Quelle. Ihr201 Zeichen langer Auszug beschreibt den Gipfel mit sollte als moeglichen Auftakt. Bereits `was_ist_passiert` und `display_summary` des gespeicherten Wissensobjekts machen daraus einen bevorstehenden Auftakt mit soll. Die Briefingkarte uebernimmt diesen Fehler; eine Titel oder Projektionsreparatur erreicht seine Entstehung nicht.

Der am17.09. erneut geoeffnete [Originalbericht der Tagesschau](https://www.tagesschau.de/ausland/europa/eu-arktis-gipfel-abschluss-100.html) nennt den Stand14.09.2026,18:28 Uhr. Nach dem Vorspann berichtet er vom Ende des Treffens, einer Abschlusserklaerung und deren Unterzeichnung. Der letzte Sachabsatz blickt auf den Gipfel in Rovaniemi zurueck. Das bestaetigt den erhaltenen Originalvergleich. Es ist ein aktueller Lesevergleich, keine gesicherte historische HTML Fassung und keine eigene Datumsvalidierung des Herausgebers.

## Nachgewiesener Eingabepfad

| Stufe | Vorhandenes Verhalten | Bedeutung fuer diesen Fall |
|---|---|---|
| `sources.js` und `crawler.crawlSource` | Tagesschau ist eine Medienquelle mit RSS Abruf. `parseRssItems` waehlt zuerst description, danach summary, content und content:encoded. | Der regulaere Weg ergaenzt fuer diese Medienquelle keinen Artikeltext. Der erhaltene RSS Body selbst liegt nicht als historischer Beleg vor. |
| `crawler.normalizeRawItem` | Der gelieferte Feedtext wird normalisiert; excerpt enthaelt maximal240 Zeichen. | Das ist eine Begrenzung vorhandener Daten, kein Abruf der fehlenden Abschlussabsätze. |
| `dedup.toRawDocumentRow` und `sourceExcerpt` | Speichern Titel und kurzen Auszug. Der vorhandene Auszug hat Vorrang vor anderen Textfeldern. | Das Originaldokument bleibt im privaten Replay bei201 Zeichen unveraendert. Es wird hier nicht an der240 Grenze abgeschnitten. |
| `understanding.buildUnderstandingPrompt` und `quellenZeitvertrag.understandingQuelle` | Aus den maximal zwoelf ausgewaehlten Dokumenten gelangen Titel, Auszug und getrennte Metadaten in den Prompt. | Die einzige Gipfelquelle wird ausgewaehlt. Ihr Text enthaelt keine Abschlussabsätze. URL Bestandteile sind ausdruecklich kein Textbeleg. |
| `github-quellenkontext-500` und `quellen-auszug.fromHtml` | Der bestehende manuelle Reparaturweg ergaenzt nur leere Auszuege. HTML wird nach Artikelidentitaetspruefung ausschliesslich auf Beschreibungsmetadaten geprueft. | Der vorhandene Gipfelauszug ist nicht leer und wird nicht ueberschrieben. Selbst ein vorhandener HTML Body ist in diesem Vertrag kein erlaubter Ersatzauszug. |

Die Textluecke ist mit Originalvergleich, gespeicherter Quelle und aktuellem Code belegt. Nicht erhalten ist der exakte historische Modellrequest samt Feedantwort. Daher kein monokausaler Beweis, welche Modellentscheidung den Fehler verursacht hat, und kein Beweis, dass mehr Kontext allein die Antwort korrigiert.

PR419 enthaelt bereits eine ausdrueckliche Modalitaetsregel: sollte allein belegt keine bestaetigte Ankuendigung. Dieselbe Anweisung nochmals hinzuzufuegen waere keine neue belegte Korrektur. Auch die alleinige Erhoehung der Textgrenze liefert die fehlenden Absätze nicht. Eine Wortersetzung von sollte zu hat wuerde aus einer mehrdeutigen Formulierung eine unbelegte Tatsachenbehauptung machen.

## Pruefung und Umfang dieses Branches

Privater lokaler Eingabenachweis ausschliesslich ueber `scripts/lokal.js`: Originalhash vor und nach dem Lauf gleich; Dokumentkennung und201 Zeichen Auszug erhalten; genau eine Promptquelle; kein Ereignisdatum aus Metadaten; vorhandene Modalitaetsregel erreicht den Prompt. Der gespeicherte Fehler wird in beiden Analysefeldern bestaetigt. Die bestehende Ablehnung eines Ueberschreibens vorhandener Auszuege bleibt wirksam. Ein ausdruecklich synthetischer Grenzfall bestaetigt, dass beliebiger HTML Body ohne Beschreibungsmetadaten keinen erlaubten Auszug liefert. Keine neue Modellantwort, kein Production Zugriff, keine Eingabemutation. Dies ist ein Diagnosebeleg, keine neue Anwendungstestsuite und keine fachliche Abnahme.

Geaendert werden ausschliesslich diese Dokumentation, der Statuskopf samt PR424 Nachweis in `CURRENT_STATE.md` und die Abschaltung automatischer Deployments fuer `codex/gipfel-quellenluecke-20260917`. Alle13 Crondefinitionen und alle anderen Konfigurationsfelder bleiben identisch. Kanonischer Gesamtlauf vor dem neuen Draft PR gemaess Repositoryvertrag: **399/399 Suiten in676 Sekunden**, Exit0. Dokumentgroesse4/4 und Diffpruefung erfolgreich. Anschliessend gezielte Nachpruefung der abschliessenden Dokumentation; Anwendungscode unveraendert. Der unabhaengige CI Nachweis am veroeffentlichten Head wird im zugehoerigen Draft PR gefuehrt und bleibt vom weiterhin offenen Fachbefund getrennt.

## Konkrete Entscheidung fuer den naechsten Schritt

Vorgeschlagen wird eine begrenzte Erweiterung des bestehenden Quellenkontexts, ausschliesslich fuer den belegten Gipfelfall als ersten Nachweis:

1. Fuer zunaechst genau dieses Dokument einen gesonderten, explizit als Artikelkontext gekennzeichneten Beleg zulassen: hoechstens ein vollstaendiger Originalabsatz mit maximal600 Zeichen zum Ende des Treffens und zur Abschlusserklaerung. Dokumentkennung, Artikel URL und Absatzposition muessen seine Herkunft tragen. Passt der vollstaendige Absatz nicht in diese Grenze, wird er nicht mitten im Satz gekuerzt. Titel, bisheriger Auszug und Publikation bleiben erhalten. Kein stiller Ersatz des Auszugs und keine automatische Ableitung des Ereignisdatums aus URL oder Zeitmetadaten.
2. Vor der Integration einen privaten Offlineversuch mit der erhaltenen Quelle und diesem direkt geprueften Artikelkontext durchfuehren. Artikelbindung, Herkunft, Laengenbegrenzung und das Verhalten bei fehlenden oder widerspruechlichen Stellen muessen pruefbar sein. Die600 Zeichen sind ein vorgeschlagenes Testlimit, kein bereits abgenommener allgemeiner Produktionswert. Keine Volltextsammlung und keine Behauptung einer fachlich richtigen Modellantwort aus einem Eingabetest.
3. Den konkreten Textumfang und seine Weitergabe durch den bestehenden Eingabepfad zur Pruefung vorlegen. Erst danach den kleinsten notwendigen Codeausschnitt umsetzen. Ob dafuer zusaetzlicher gespeicherter Kontext erforderlich ist, bleibt eine explizite Architekturentscheidung; kein Ausweichen in beliebige raw Felder. Ein regulaerer Artikelabruf, gespeicherte Altkorrekturen und deren Ressourcenbedarf sind damit noch nicht freigegeben.

Hier ist eine Betreiberentscheidung erforderlich: Der Auftrag schliesst neue Funktionen und abgeschwaechte Schutzregeln aus; `CLAUDE.md` §5 verlangt fuer grundlegende Architekturentscheidungen eine ausdrueckliche Freigabe. Der aktuelle Vertrag begrenzt den Modelleingang bewusst auf Titel und kurzen Auszug und schliesst beliebige Zusatztexte testgesichert aus. Diese Untersuchung erweitert ihn nicht stillschweigend. Freizugeben waere zunaechst nur die lokale Vorbereitung eines gesonderten, begrenzten Artikelkontexts samt Eingabevertrag. Merge, Deployment, Migration, Production Datenkorrektur und Modellaufrufe bleiben ausgeschlossen.

Eine sichere Aussage ueber den Gipfelabschluss benoetigt hier zusaetzlichen Textbeleg; fuer eine bloss vorsichtigere Formulierung ist ein Volltextabruf logisch nicht zwingend. Ob PR419 diese Vorsicht im Modell bewirkt, ist noch nicht fachlich geprueft. Ein erneuter kostenpflichtiger Aufruf wird deshalb nicht als stiller Testschritt gestartet.

Danach bleiben die weiteren Voraussetzungen des neuen500er Nachweises offen: Versorgungskapazitaet, begrenzte Fortsetzungsplanung, fachliche Aussagenpruefung, vollstaendiger App Abruf aller500, Kosten, zuverlaessiges Testende und unabhaengiger Abschluss. Ein neuer500er Production Test braucht eine eigene Freigabe. Bei diesem dokumentierten Stopp endet der begrenzte Sprint. Rueckweg fuer diese Aenderung: Folgebranch verwerfen; kein Production Rueckweg erforderlich.
