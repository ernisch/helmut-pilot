# Lageauszuege aus Suchwegartikeln

Stand der ursprünglichen Vorbereitung: 06.11.2026. Aktuelle Prüfung und
Aktivierungsvorlage vom 07.11.2026 am Ende; die früheren Belege bleiben erhalten.
Basis: `382812439b1cf64a80e3ef98a64cf4a52fc953e3`.

## Beleg und Umfang

Der im UX Test geoeffnete NDR Pflegeartikel hat in raw_documents keine summary.
Die Herkunft ist ein thematischer Google Suchweg mit source_type ministry;
die aufgeloeste Originaladresse ist NDR. Der Kartenbelegschutz zeigt damit
korrekt einen Titelhinweis. Die aktuelle Originalseite liefert passende
Canonical, Titel und Description. Der vorhandene quellen-auszug.fromHtml
Extraktor uebernimmt daraus184 Zeichen, zwei vollstaendige Originalsaetze.
Keine neue Modellanalyse oder freie Ersatzprosa.

Gezielter nativer Abgleich der sechs beanstandeten Eintraege:

| Quelle | Befund | Durch diesen Kandidaten gedeckt |
| --- | --- | --- |
| NDR Pflege | summary null, Suchweg ministry, anerkannter Medienhost | Nur zukuenftige neue Eingaben |
| RND Bundeswehr/Pflege | summary null, Suchweg committee, anerkannter Medienhost | Nur zukuenftige neue Eingaben |
| RP Online Schulbesuche | summary null, Herausgeberklassifikation unbekannt | Nein |
| PresseBox CO2 | summary null, Herausgeberklassifikation unbekannt | Nein |
| Bundestag Pflegebetrug | summary null, amtliche Quelle | Nein |
| Bundestag Anhoerungen2. bis6.November | auf240 Zeichen abgeschnittener Auszug ohne ganzen Satz | Nein |

Kein6/6 Erfolg. Bestehende Artikel und schon erzeugte Wissensobjekte werden
nicht geaendert. Das blosse Fuellen einer alten summary duerfte alte,
bislang nicht durch diesen Auszug belegte KO Aussagen nicht freischalten.

## Kleinste Codeaenderung

Im vorhandenen globalen Dedup Speicherpfad werden vor der atomaren Neuanlage
bereits als neu geplante Google Suchwegeingaben behandelt. Die Google Herkunft
bleibt aus der Originaleingabe an die exakte Dokumentkennung gebunden;
die spaeter minimierten Fundstellen enthalten bereits die Publisheradresse.
Nur leere Auszuege, direkte identische Canonicalziele, bekannte Medienhosts
mit bestehendem Vertrauen hoch/mittel und keine Metadatenquellen sind erlaubt.
Der Suchkanaltyp ministry/committee wird nicht umdeklariert.

Der bestehende HELMUT_ARTIKELKONTEXT Schalter und der vorhandene Extraktor/Fetch
werden wiederverwendet. Ohne exakt on keine Zusatzlesung und kein Artikelabruf.
Bei Aktivierung hoechstens100 Kandidatenkennungen in genau einer exakten
Bestandslesung, dann hoechstens ein begrenzter Abruf pro Speicherbatch.
Eine Nichtarray200 Antwort ist im neuen LeseroptIn ein Fehler, kein leerer
Bestand. Alte Aufrufer behalten ihren Vertrag. Fehler/Deckel im14 Tage
Bestandsfenster sowie vorhandene IDs verhindern die Ergaenzung.

Bestehender Fetch: HTTPS, Hostbindung, DNS/SSRF Schutz, Anbietersteuerung,
Status200, UTF8,1MiB,20s und optionales Abbruchsignal. Explizite sperrende
Originalmetadaten werden abgelehnt. Es wird keine vollstaendige robots.txt
Pruefung behauptet. Bestehende Anbieterfreigaben bleiben Voraussetzung.
Ein Abruf pro Batch bedeutet ausdruecklich nicht einen Abruf pro Tag oder Lauf.

Der kurze Originalauszug wird nur an der neuen Zeile vorbereitet, mit
bestehendem minimiertem Herkunftsmarker und SHA256. Input, bestehende
Auszuege, Publikationsdatum und Altzeilen bleiben erhalten. IgnoreDuplicates
verhindert das Ueberschreiben bei Konkurrenz. prepared ist kein
Speichererfolg; der bestehende Writer/Rueckbeleg bleibt massgeblich.
Die zusaetzliche Bestandslesung erscheint in der Roundtripbilanz.

## Validierung

Syntax der geaenderten Dateien bestanden. Bestehender Extraktor gegen die
wirklich gelesenen NDR Originalmetadaten sowie drei Negativfaelle bestanden.
13 gezielte Anschlussgruppen bestanden. Echte Normalisierung, toRawDocumentRow,
globaler Dedup und Originaleingabebindung separat offline bestanden.
Nichtarray200 im echten optIn Reader loest keinen Artikelrequest aus.
Alle lokalen Ausfuehrungen ueber scripts/lokal.js. Die vorhandene
quellen-auszug-test.js ist um die Anschlussgruppen und den Pfadnachweis
erweitert. Vollstaendige Pflicht CI steht noch aus.
Unabhaengiges lesendes Review: Herkunftsbindung und Readerformatbefund
behoben, kein verbleibender konkreter Codeblocker.

## Betrieb und noch notwendige Entscheidung

Vercel Projektumgebung rein lesend:71 Variablen, hiddenProductionEnvCount0,
kein HELMUT_ARTIKELKONTEXT Eintrag. Keine anderen Werte ausgegeben oder
geaendert. Das ist ein Projektkonfigurationsbeleg, kein separat gebundener
Runtimebeleg einer alten Deploymentinstanz. Code Default ist aus.

Kein Merge, Deployment, Flagwrite, Backfill oder Modellaufruf freigegeben.
Der vorhandene Schalter aktiviert auch den bisherigen Understanding
Artikelkontextpfad; es ist keine rein optische Einstellung. Vor einer
Aktivierung muessen konkrete Anbieterfreigaben, Umfang pro Lauf und
Laufzeitgrenze reviewbar sein. Bestehende Tageskosten bleiben gedeckelt;
kein zusaetzlicher bezahlter Modelltest oder Budgetanstieg ist abgeleitet.
Rueckweg einer spaeter freigegebenen Aktivierung: Schalter aus und neue
Codeaenderung zuruecknehmen. Keine automatisierte Altbestandkorrektur.

Naechster Schritt: Codekandidat samt Pflicht CI abnehmen. Danach die
konkrete Betriebsentscheidung fuer neue Artikel und eine getrennte,
quellengebundene Pruefung der sechs Altfaelle vorlegen. Erst nach deren
belegter Abnahme darf ein sichtbarer Produktiverfolg behauptet werden.

## Nacharbeit 07.11.2026

Pflicht CI42297703417 meldete pardok-dispatch-smoke-test.js. Die neue Storage zu Crawler Importkante wurde am exakten Kopf reproduziert: sieben statische Nutzerpfade waren betroffen. Storage importiert die Ingestion jetzt nicht mehr; allein der schon schreibende Scheduler uebergibt den bestehenden fetchUrl und das Abbruchsignal. Ohne Callback bleibt der bisherige direkte Storagevertrag erhalten, ohne Artikelabruf oder Zusatzlesung. Der PARDOK Schutztest bleibt unveraendert.

Gezielte Offlinebelege: PARDOK13/13, Quellen13/13 Gruppen einschliesslich echter Scheduler/Storage/Dedup/Auszug Verdrahtung und direktem Storageaufruf ohne Callback, Dedup10/10 sowie Syntax bestanden. Einziger produktiver direkter Aufrufer ist scheduler.persistRawDocumentsShadow; sechs bestehende Testdateien mit16 Aufrufstellen bleiben kompatibel. Neue Pflicht CI offen. Kein Merge, keine Aktivierung, keine Altzeilenkorrektur oder Modellanfrage; sechs aktuelle Altfaelle weiter offen.

## Mergeabschluss 07.11.2026

Betreiber GO fuer die vorbereitete Mergefolge lag vor. PR1094 nach beiden gruenen Pflichtchecks auf integriertem Kopf efb2613485361d0986403e54163438e1d9fe0f8d (CI42352831258) gemergt:1057d0003067d64f0098d1718c8c2607bcc1dbb5. Der Statuskonflikt wurde ohne Runtimeaenderung geloest; UI Blobs blieben bytegleich zum bereits ausgerollten Stand, die vier Quellen Runtime/Test Blobs bytegleich zum zuvor bestandenen5dd5ceec. Voriger Status ist unveraendert archiviert.

Production dpl_LzrnS2fnHtPYkq71B1SD4EhHU9rF READY auf1057d000. Hauptseite, Releasecheck und ausgelieferte Client/CSS Bytes gegen Git verifiziert; HTTP200 und ok/ready/storage true. Kein error/fatal Eintrag im abgefragten Deploymentfenster. Kein authentifizierter Production Klicktest behauptet. Rollbackkandidat bleibt das vorherige READY UI Deployment dpl_GBXnux9UmhiE6eAPhk8LHZGnqR1E auf2f9ff56d.

Artikelkontext bleibt inaktiv. Projektmetadaten erneut gelesen: kein HELMUT_ARTIKELKONTEXT Eintrag; keine Flag oder Env Aenderung. Sechs Altfaelle weiterhin offen, keine Datenkorrektur oder Modellanfrage. Codeausrollung abgeschlossen, fachliche Quellenlueckenschliessung nur teilweise abgeschlossen.

## Abschluss der freigegebenen Altfälle am 07.11.2026

Nach konkretem Betreiber GO wurden fünf der sechs Altfälle redaktionell korrigiert und die nativen Nachherwerte geprüft. Vier Rohzeilen erhielten verifizierten Originalkontext; der CO₂ Vorgang wurde auf eine neue amtliche Bundestagsquelle zum Beschluss vom 15. Oktober umgestellt. Fünf Kurzfassungen sind belegt. Zwei mit dem Anhörungsplan vermischte Altvorgänge wurden mit bestehenden Statuswerten zurückgehalten, damit die Ergänzung sie nicht ungeprüft sichtbar macht. Alte Quellen und historische Verarbeitungsbelege bleiben erhalten. RP Online bleibt mangels abrufbarem Original offen. Die automatische Artikelkontext Ergänzung bleibt inaktiv. Einzelheiten, Erstfehler, Sicherung und Rückweg: [Quellenkorrektur](quellenkorrektur-20261107.md).

## Sichere Aktivierungsvorlage 07.11.2026

**Vorbereitet, nicht aktiviert.** Basis `main` `3e94b79d24fd8387643b208e93a74c951abb13fe`,
PR1094 und PR1096 gemergt. Eigener Branch `codex/artikelauszuege-sicher-20261107`.
Offene PRs und erreichbare andere Chats geprüft: keine konkurrierende Implementierung
dieses Pfads gefunden; der zugehörige andere Chat hatte zuletzt diesen Prüfauftrag
vorbereitet. Keine fremden lokalen Änderungen übernommen. Kein DeepSeek gestartet.

Zwei konkrete Lücken erfordern kleine Änderungen an vorhandenen Pfaden:

1. `HELMUT_ARTIKELKONTEXT` steuerte sowohl die neue Metadatenübernahme als auch
   `artikelkontext-lauf.mitArtikelkontext` für Erstverstehen und Pending/Aktualisierung.
   Der neue Anschluss benutzt jetzt ausschließlich `HELMUT_SUCHWEGAUSZUEGE=on`.
   Kein Alias und kein Rückfall auf den alten Schalter; beide bleiben Default AUS.
   Der alte Beschaffungs-/CAS-Belegpfad bleibt unverändert.
2. Der direkte Eagerlauf bekam weiterhin die ursprünglichen Crawlitems ohne den erst
   beim Insert ergänzten Auszug. Er liest jetzt bei aktivem neuem Schalter ausschließlich
   seine aktuell eingegebenen Google-Suchwegquellen mit fehlender Summary exakt aus `raw_documents`.
   ID, Titel, Artikel-/Canonical-URL und Publikationszeit müssen übereinstimmen.
   Gleiche Zeitpunkte mit `Z`/`+00:00` gelten als gleich; fehlendes Datum bleibt unbekannt.
   Lesefehler oder doppelte/fremde Antwortkennungen stoppen vor Clusteranalyse und
   Modellstart. Abweichende Titel/URLs/Daten liefern keinen übernommenen Kontext;
   unabhängige neue Artikel werden weiterverarbeitet. Nur Summary wird in einer Kopie ergänzt; Eingabe und Rohbestand bleiben
   erhalten. Keine Quelle wird neu gesucht und keine Altanalyse pauschal wiederaufgenommen.

Die übrige Kette genügt bereits: Scheduler → globale Dedupplanung → exakte Bestandslesung
→ vorhandener geschützter Artikelabruf → atomarer Ignore-Duplicates-Insert →
`geleseneQuelle` → Understanding-Prompt/KO → KO-Quellenprojektion →
`koToVorgangCard`/`lage-kartenbeleg` → tatsächlicher Clientrenderer. Pending und spätere
Aktualisierung lesen die gespeicherten Quellen schon heute. Bestehende Rohzeilen werden
nicht ergänzt; dadurch werden die beiden geparkten Altvorgänge nicht freigeschaltet.
Ein gültiger Auszug ist weiterhin kein allgemeines positives Faktenurteil über KO-Prosa.

### Gezielte Nachweise

Alle Tests über `scripts/lokal.js` mit bestehendem Netzschutz und ohne Productionkennungen
im Kindprozess. Neue Transportantworten und Modellantworten sind synthetische Attrappen;
keine kostenpflichtigen Calls, keine erneuten Belastungs-/500er-Läufe.

| Nachweis | Ergebnis |
| --- | --- |
| `quellen-auszug-test.js` | 14/14 Gruppen, darin 13 bestehende Anschlussprüfungen und neuer durchgehender Test mit echtem Storagewriter/-reader am lokalen HTTP-Server, echtem Eagerlauf mit Modellattrappe, KO und Clientrenderer |
| Identität und Datum | Fremde Kennung und Lesefehler stoppen vor Modellattrappe; abweichende Titel, Artikel-/Canonical-URL oder Publikationszeit liefern keinen übernommenen Text; Originalmetadaten ändern weder bekannte noch fehlende Publikationszeit |
| Rohbestand | Zweiter Insert trotz simuliert leerem 14-Tage-Fenster holt keinen Artikel; exakter Reader erkennt Bestand, Ignore-Duplicates bewahrt Zeile samt Marker/Hash unverändert; Eingabe bleibt unverändert |
| Ehrliche Karte | Ohne Text bleibt „Artikelauszug fehlt; nur Quellentitel verfügbar.“; mit Auszug kommen Quelle, Publikationsdatum und Text bis in den echten Clientrenderer |
| Bestehende Regressionen | Quellenlesepfade 6/6, Titelbeleg 9/9, Dedup 10/10, alter Understanding-Anschluss 20/20, Abrufschutz 12/12, PARDOK-Isolation 13/13 bestanden vor der Eager-Erweiterung; endgültige CI folgt |

Der erste neue Eager-Test erreichte den Prompt korrekt, wurde dann wegen drei leeren
Pflichtfeldern der Modellattrappe abgelehnt. Nur die synthetische Antwort wurde an den
bestehenden Validatorvertrag angepasst; keine Validierung abgeschwächt.

### Freigabeumfang und noch offene Startbedingungen

Projektmetadaten am 07.11.2026, 13:47 Istanbul / 10:47 UTC rein lesend geprüft:
71 Einträge, `hiddenProductionEnvCount=0`; weder `HELMUT_ARTIKELKONTEXT` noch
`HELMUT_SUCHWEGAUSZUEGE` noch `HELMUT_ANBIETER_STEUERUNG` vorhanden. Das ist kein
gebundener Runtimebeleg einer alten Instanz. Keine Variablen oder Daten geändert.

**Diese Vorlage ist noch kein sofort ausführbares Aktivierungs-GO.** Vorher sind
der endgültige PR-Kopf und beide Pflichtchecks abzunehmen;
Merge/Rollout benötigen die konkrete Betreiberfreigabe. Danach sind frisch zu binden:

- READY-Deployment und effektive Flags; alter Understanding-Schalter bleibt aus.
- Existierende Anbieter-RPCs, deren aktuelle Minuten-/Tagesgrenzen und Betriebszustand
  sowie Abruf-/Nutzungsfreigaben der tatsächlich in Frage kommenden Herausgeber.
  Die Anbietersteuerung fehlt in den Projektvariablen. Ihre Aktivierung wirkt auch
  auf bestehende RSS-/Google-/Artikelabrufe und ist separat mit diesem Umfang zu prüfen
  und freizugeben. Sie wird nicht heimlich pro Request eingeschaltet oder umgangen.
- Tatsächlicher Schedulerpfad, aktive Aufrufer und erwartete Zahl von Speicherbatches
  im ersten Fenster. Ein Abruf je Batch ist **keine** globale Tagesgrenze.

Vorgeschlagener erster Umfang nach diesen Nachweisen: **ein bereits geplanter regulärer
Quellenlauf für den bestehenden aktiven Profilbestand**, keine zusätzlichen Handläufe,
keine Profil-/Cron-/Budgetänderung. Ziel ist das bestehende Productionprojekt
`helmut-pilot`, Datenbank `ddckuvvpcytqbyfmbvie`. Nur `HELMUT_SUCHWEGAUSZUEGE=on`
plus die zuvor konkret abgenommene Anbietersteuerung; der alte Artikelkontext bleibt aus.
Keine freie Quellensuche, kein Backfill, keine RP-Ersatzquelle. Nicht alle neuen Artikel
sind gedeckt: nur neue leere direkte Google-Suchwegartikel bekannter Medienhosts mit
bestehendem Vertrauen hoch/mittel, keine amtlichen Metadatenquellen.

Unveränderte Grenzen: höchstens 100 exakte Kandidaten je Speicherbatch und höchstens
ein geschützter Originalabruf, 20 s, 1 MiB, HTTPS/Host/DNS/SSRF/UTF-8/Statusschutz;
60–240 Zeichen ganzer Originalmetadatensätze. Ohne Anbietersteuerung verweigert der
echte Fetch den Abruf. Das Eager-Rücklesen braucht zusätzlich einen exakten Lesezugriff
je angefangenen 100 aktuellen Google-Suchwegdokumenten ohne Auszug; vorhandene Fristen/Budgets bleiben
maßgeblich. Kein Tagesbudgetanstieg und kein zusätzlicher bezahlter Modelltest.
Normales kostenpflichtiges Understanding bleibt beim bereits separat freigegebenen Betrieb.

### Nachkontrolle und Rückweg

Nach dem freigegebenen regulären Lauf dessen Kennung/Deployment und
`metadatenAuszug.attempted/prepared/reason/readRequests` sichern; `prepared` allein ist
kein Speichererfolg. Neu angelegte ID, URL, Titel, Datum, Auszug und SHA256 nativ rücklesen,
gegen das passende Original prüfen und dieselbe gebundene Quelle im gespeicherten KO
und in der tatsächlich ausgelieferten Lagekarte nachweisen. Keine Modellgenerierung nur
für die Nachkontrolle starten. Ohne geeigneten neuen Artikel lautet das Ergebnis offen,
nicht erfolgreich. Bei fehlendem Text muss der Hinweis bleiben. Historische/parkende
KO, Reservierungen und Altrohzeilen unverändert kontrollieren.

Bei Drift, ungeklärtem Ausgang, Störung, Zeit-/Kontingentüberschreitung oder ungewollter
Mehrwirkung stoppen. Nach dem ersten Beobachtungsfenster den neuen Schalter wieder auf
den gebundenen Vorherzustand AUS zurücksetzen und regulär neu ausrollen; Anbietersteuerung
nur auf ihren zuvor gesicherten Zustand zurücksetzen, wenn ihre Aktivierung Teil desselben
GO war. Kein Laufretry bei unbekanntem Ausgang. Bereits atomar angelegte echte Auszüge
bleiben erhalten; keine automatische Löschung oder Rückdatierung. Ein Codeschritt zurück
ist der gezielte Revert dieses PR beziehungsweise das gebundene vorherige READY-Deployment.
Sollte ein fehlerhaftes neues KO entstanden sein, zuerst dessen Auslieferung sperren und
eine gesonderte zeilen-/hashgebundene Korrektur vorlegen; keine pauschale Altbestandmutation.

Unabhängiger lesender Sol-6.1-Review abgeschlossen. Ein P2-Befund zur vollständigen
Batchabsage bei legitimen Altvarianten wurde behoben: Nachlesen nur für aktuelle
Suchwege, keine Textübernahme bei Drift, Mischbatch und Nicht-Suchweg gezielt geprüft.
Korrekturdiff erneut unabhängig geprüft, keine weiteren konkreten Befunde.
Nach der endgültigen Eager-Korrektur zusätzlich bestehender Einzelvorgangsschutz
49/49 und Restzeit-/CAS-Schutz 55/55 über den lokalen Netzschutz bestanden.
