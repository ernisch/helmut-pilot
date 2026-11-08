# PR1104: zusammenhaengender Originalinhaltsweg

08.11.2026. **Codeabnahmepaket, keine Produktionsabnahme.**
[PR1104](https://github.com/ernisch/helmut-pilot/pull/1104) integriert den frisch
gelesenen `main`-Stand `4f8ee6722237c84a36fd9811acb2b9d46f7a72cb`.
Finaler Kopf und seine beiden Pflichtchecks werden direkt im PR belegt.
Keine kostenpflichtigen Modelle, Produktivwrites, Schalteraktivierungen,
Merges nach main oder Deployments dieses Auftrags. Ein unbeabsichtigt
automatisch gestarteter XML-Liveworkflow ist unten ausdruecklich ausgewiesen.

## Was tatsaechlich korrigiert ist

Der Weg lautet: Fundstelle → begrenzter vorlaeufiger Bezug → vorhandener oder
gezielt beschaffbarer Originalinhalt → bestaetigte Quelle → Modelleingabe.

- **RSS/Storage:** Titelbeschreibung verdeckt vorhandenen Feedtext nicht mehr.
  Ein Anzeigeausschnitt verdraengt keinen volleren gelieferten Originaltext.
  Ganze explizite Summaries und auch punktlose redaktionelle Kurzfassungen
  behalten ihre Prioritaet; erkennbare240-Zeichen-/Ellipsen-Abbrueche weichen
  vorhandener vollerer Quelle. Kein Titel wird Artikelprosa.
- **Notwendige Textgrenze:** Der alte Default240 liess bereits einen ganzen
  vorhandenen255-Zeichen-Satz leer zurueck. Der begrenzte Raw-Kontext verwendet
  nun Default1280, passend zum neuen Artikel-Einstieg. Explizite
  `HELMUT_RAWDOC_SUMMARY_MAX`-Werte bleiben wirksam; der Anzeigeauszug bleibt240.
  An der Grenze nur ganze Satzpraefixe, keine Wortkuerzung/Umformulierung.
  Kein HTML-/Rohpayload-/unbegrenzter Volltextspeicher, keine Migration.
- **Herkunft:** Google-Fundadresse, Artikelziel und tatsaechliche Abrufwegkennung
  bleiben getrennt. `document_findings` und alternative vorhandene Textfelder
  sind beruecksichtigt; fehlende Wegkennungen werden nicht erfunden.
- **Tatsaechlicher Aufrufer:** Auch `runSourceCrawl`, der aktuell produktiv
  genutzte Quellenpfad, bietet den Inhalt vor dem bisherigen Titelfilter an.
  `runGlobaleErfassung` nutzt denselben Dienst. Kein neuer Endpunkt/Worker.
  Der vorhandene Artikelkontextschalter und die exakte Hostliste genuegen als
  Konfiguration; sie werden hier nicht gesetzt.
- **Relevanz und Sichtbarkeit:** Knapper Titel kann ueber echten Paketbezug
  oder nachgewiesene aktuelle Quellenzuordnung ein unklarer Kandidat bleiben.
  Nach Originalempfang zaehlt der Textbezug, nicht der Herausgebername.
  Legacy nutzt ausschliesslich sein bereits geprueftes Profil. Frische
  Herkunftsvereinigungen bleiben auch bei gelieferten RSS-Texten erhalten;
  die historische primaere Quelle erweitert keine Sichtbarkeit.
- **Wiederverwendung:** Bestehender globaler Belegspeicher bindet Dokument,
  Quellenstand und Verfahren; parallele Mandate holen denselben Artikel
  hoechstens einmal je unveraendertem Schluessel. Keine Abrufe beim App-Oeffnen.
  Luecken/offene Versuche werden nicht geloescht oder automatisch wiederholt.
- **Modelleintritt/Pending:** Der gebundene Originalbeleg liegt vor dem
  Titelgate vor. Absolute Modellfristen bleiben auch bei Teilbudget0 wirksam.
  Kanonisch bestaetigte offene Artikel erhalten bestehende Pending-Traeger.
  Der spaetere regulaere Pending-Einstieg liest v1-/v2-Bestand ohne Original-
  oder Artikelcachewrite. Keine reine Titelquelle als stiller Modellfallback.
  Gemischte ausgewaehlte Cluster mit weiteren ungedeckten Inhaltsluecken
  bleiben Pending; ein Beleg plus vorhandener RSS-Text bleibt moeglich.
- **Keine Reihenfolgeentscheidung:** Wortgetreue RSS-Praefixvarianten behalten
  den laengeren Kontext. Widersprechende Texte desselben Metadatenstands
  bleiben unabhaengig von Eingabereihenfolge und Zwischenstand eine Luecke.

## Belegte Quellenfaelle

| Fall | Nachgewiesenes Verhalten |
|---|---|
| DGB, Gebaeudereiniger-Tarifrunde | Native gespeicherte Variante `source_name=DGB` / ` - DGB - Deutscher Gewerkschaftsbund` und RSS-Variante ` - Deutscher Gewerkschaftsbund \| DGB` werden nur als zusammengehoeriges Titel-/Publisherpaar gleichgesetzt. Kuerzel muss exakt zum identischen Artikelhost passen; ID, URL, kanonisches Ziel, Publikationszeit und fachlicher Titelrumpf bleiben gleich. HTML-Seitenname bestaetigt die Gewinnung unabhaengig. Vier ganze Absaetze samt Zwischenueberschriften erhalten Angebot, Forderung und Friedenspflicht:1256Zeichen. |
| Radio Hannover, Altersarmut | Die HTTPS-Originaladresse bleibt unveraendert. HTTP-Canonical ist ausschliesslich eine gebundene Deklaration mit demselben Host/Pfad/Query, Publisher/Titelsuffix, eindeutigem Artikelbereich und Publikationsstand. Kein HTTP-Abruf, kein Hostwechsel. Voller727-Zeichen-Absatz erhaelt Wohngeld, **moegliche** Kuerzung ab2027 sowie bezahlbaren Wohnraum/Mieten. |
| Vorhandener RSS-Originalsatz | Die reale255-Zeichen-Meldung zur schaerferen Bestrafung von K.-o.-Tropfen ueberlebt doppelte Minimierung und erreicht `requestUnderstanding` wortgetreu mit Quellen-ID und URL. Hib-/DLF-/Regierungsproben bleiben nachvollziehbar. |
| Google ohne Artikeltext | Kein Parserverlust behauptet. Nur ein bestaetigtes direktes Artikelziel und ein freigegebener Host koennen Originalinhalt liefern. Ein aufgeloester, fachlich passender Treffer kann belegt werden; unaufgeloeste Googleziele, unpassende Originale und nicht verfuegbare Artikel bleiben ehrlich getrennt. |

Originalproben stammen aus dem vorherigen Auftrag. Die Fixture-Manifeste
enthalten SHA256 und Ausschnittumfang; vorhandene vollstaendige HTML-Dateien
wurden lokal mit den reduzierten Fixtures verglichen. Gespeicherte DGB-
Metadatenvariante und neuere Original-RSS-Probe sind ausdruecklich getrennt
gekennzeichnet. Keine neue HTML-Antwort wird aus einer Altprobe behauptet.
Lesende Projektkonfiguration am08.11.:71Env-Eintraege,0verdeckte
Productioneintraege; weder Raw-Summary-Override noch Artikelkontextflag,
Hostliste oder Anbietersteuerung vorhanden. Das ist Projektmetadatenstand,
kein unveraenderlicher Laufzeit-Snapshot.

## Gezielte Pruefbelege und Wiederverwendung

| Pruefung | Beleg |
|---|---|
| `quelleninhalt-test.js` |11/11, einschliesslich realem REST-Write/Read mit Attrappe und tatsaechlich abgefangenem Modellaufrufer fuer den255-Zeichen-Originalsatz. |
| `artikelkontext-einstieg-quellenbindung-test.js` |9/9, native DGB-Varianten und Radio, fremde Publisher/Hosts/Pfade/Queries, Titel-/Datumsdrift, Robots und mehrdeutige Artikel. |
| `quellen-inhaltsversorgung-test.js` |18/18, volle Originalproben, Auswahl und Grenzen, CAS-Konkurrenz, unpassende/nicht verfuegbare Inhalte sowie Quellenkontext bis Modellcallback. |
| `quellen-inhaltsversorgung-anschluss-test.js` |28/28, echter globaler Scheduler → kanonischer Leser/Findings → Beleg-CAS → echter Understanding-Aufrufer; Quellensperren, Sichtbarkeit, gemischte Cluster und RSS-Textkonflikte. |
| `quellen-inhaltsversorgung-quellenlauf-test.js` |7/7, echter aktuell genutzter Legacy-Aufrufer, nativer DGB-Kanonikstand, zwei passende Mandate ohne Zweitabruf, ungeeignete Ziele, fehlende Originale, Budget0 und spaeteres Pending-Verstehen desselben Belegs. |
| `artikelkontext-pending-bestand-test.js` |12/12, echter regulaerer Pending-Aufrufer bis Modelladapter, alte/neue Belege, Titelgate, fehlender/vergifteter Bestand, CAS/Budget/Frist und gemischte Cluster. |
| Bestehender `artikelkontext-anschluss-test.js` |20/20; bisheriger Eager-/manueller Vertrag bleibt erhalten. |

Alle Laeufe ueber `scripts/lokal.js`: Produktionszugangsdaten entfernt,
externe Netzzugriffe gesperrt; REST/Original/Modelle nur isolierte Attrappen.
Positive Original-Replays und deklarierte synthetische Gegenbeispiele bleiben
getrennt. Kein neues Kontroll-/Diagnosesystem. Unabhaengiger Codex-Review
fand Quellensperr- und Mischclusterluecken sowie RSS-Sicht-/Konfliktfaelle;
diese wurden korrigiert und gezielt belegt. Kein externes GitHub-Approval
aus dem internen Review ableiten.

Fruehere erfolgreiche Nachweise bleiben zugeordnet: PR1104-Code-CI42428840532
auf5bef1ff4 und PR1106-CI42513128150 auff7ade1ef. Sie ersetzen **keine**
Pflichtchecks am jetzigen Endcommit. Die regulaere Pflicht-CI wird auf dem
endgueltigen PR1104-Kopf abgenommen, kein nachtraeglicher skip-ci-Dokukopf.
Die drei echten Liveabrufworkflows sind vor dem Endpush ausschliesslich manuell;
Pruefplan/Pflichtchecks werden nicht gelockert. Vercel-Gitdeployment des
PR1104-Branches ist explizit gesperrt. Keine Proxy-/PR1109-Aenderungen und
keine fremden CI-/Werkzeugaenderungen aus PR1106 uebernommen.

**Abweichung beim vorigen Push:** Auf `66e37d63` meldete die Triggerpruefung
den dritten Liveworkflow `pardok-parser.yml`, ihre fehlerhafte Befehlsfolge
stoppte Commit/Push jedoch nicht. Run
[42530310635](https://github.com/ernisch/helmut-pilot/actions/runs/42530310635)
wurde am08.11.22:28UTC abgebrochen. Job128882835796 belegt auf GitHub Actions
`ubuntu-latest` ueber die bestehenden HTTPS-Sonden: vier Kontrollabrufe
(`example.com`/`www.google.com`, je zweimal HTTP200), Berlin-XML HTTP200 mit
50331363Bytes (Byte-Cap) und Brandenburg-XML HTTP200 mit14171250Bytes, beide
ohne Redirect. Eine weitere Berliner XML-Anfrage war gestartet; ihr Ergebnis
ist durch Abbruch unbekannt. Der Shadow-Test blieb uebersprungen. Keine
Modelle, Datenbank, Vercel-Laufzeit oder Fachinhaltwrites in diesem Workflow.
Das war **kein freigegebener Abruf** und kein Radio-/Produktionsnachweis.
Die Endpushpruefung muss erfolgreich beendet und separat gelesen sein;
Shellabbruch bei Fehlern ist nun verbindlich. PARDOKs Offline-Parser bleibt
in der normalen Pflicht-Bereichspruefung, seine Livephase ist nur manuell.

## Betriebsgrenzen und konkret benoetigte Freigabe

**Noch keine produktive Inhaltsversorgung nachgewiesen.** Die361 Leerfelder
und317 Google-Titelfaelle sind nicht pauschal relevant, nachgeladen oder
behoben. Historische Rohzeilen und komplette KOs werden nicht automatisch
repariert/neu verstanden. Radio hat weiterhin den frueheren belegten
Direkttransportfehler aus Codex und eine gespeicherte Luecke; das beweist
keinen Vercel-Transportfehler. Keine neue Originalprobe erforderlich, um die
hier geschlossenen Codefragen zu beantworten; PR1109/Proxyarbeit sind geparkt.

Der bestehende Ein-Beleg-Vertrag vertagt mehrere fehlende Artikelkontexte
im selben ausgewaehlten Cluster. Fehlender Cache im Pending-Lauf wird dort
nicht neu beschafft. Nicht unterstuetzte Seitenstrukturen, zu lange erste
Absaetze, ungeklaerte Artikelziele und Publikationsstaende bleiben Luecken.
Nachgelagerte Lage-Quellenbestaetigung liest den separaten Artikelbeleg noch
nicht; daraus folgt kein Lage-/Briefing-/Tagesempfehlungs-PASS.

**Naechste Freigabe:** exakt geprueften PR1104-Kopf mergen und bereitstellen,
ohne Originalnachladeaktivierung. RSS-Erhaltung wirkt danach im regulaeren
Eingang mit dem geprueften Default1280; gespeicherte Altzeilen bleiben
unveraendert. Keine manuelle Verarbeitung, kein Profil-/Budgeteingriff.

Eine spaetere Originalaktivierung bleibt separat: bestehendes
`HELMUT_ARTIKELKONTEXT=on`, exakte
`HELMUT_SUCHWEGAUSZUEGE_HOSTS=www.dgb.de,www.radio-hannover.de` und vorhandene
Anbietersteuerung. Vorher deren **globale** Wirkung/Grenzen und aktuelle
Kostenbindung lesend abnehmen; kein stilles Einschalten fuer alle Crawler.
RND ohne gesonderten Erlaubnisbeleg bleibt ausgeschlossen, NDR nur unter der
[bestehenden RAG-/Pfadbedingung](lage-suchwegauszuege-20261106.md).
Eine Hostliste ersetzt keine Nutzungsfreigabe.

Wirkung einer spaeteren Aktivierung: maximal20Kandidaten, davon3unklare und
2neue Originalabrufe je Dienstlauf; kanonischer Lesepool200. Legacyzaehler
gelten je Mandats-Crawl, nicht faelschlich fuer den ganzen Mehrmandats-Cron.
Beleg-CAS verhindert erneuten Abruf desselben Quellenstands. Je Abruf bleiben
HTTPS/DNS-IP-Bindung/TLS,20s,1MiB, keine Redirects sowie SourceSafety-Sperren,
Aggregator-/Verkuerzer- und Robotspruefung erhalten. Originalbelege gehen
vor Modell nur durch bestehende CAS-/Budget-/Fencing-/Deadline-Grenzen.

Kostenwirkung: laengerer vorhandener RSS-Kontext kann mehr Eingabetoken
brauchen; keine Deckelerhoehung. Spaetere neue relevante Artikel koennen
regulaere Modellarbeit ausloesen, stets innerhalb der bestehenden Kostenbindung.
Die Codepruefungen erzeugten0Modell-/Originalkosten; normale CI-Runnerminuten.
Spaetere Speicher-/Transfer-/Functionkosten nicht als null behaupten.

Nachkontrolle nach spaeterem GO: neuer Git-SHA/READY/Flags, normale
Source-/Understanding-Bilanz einschliesslich Luecken/Pending und konkrete
Originaltext-/Quellenhashbindung am tatsaechlichen Modelluebergang. Kein
Massen- oder Testmodelllauf. Rueckweg: vorheriges READY-Deployment oder
gezielter Revert; spaeter aktivierte Artikelkontextflag/Hostliste zuruecknehmen.
Belegluecken, Verbrauch und vorhandene Fachinhalte nicht still loeschen.
