# Lageauszuege aus Suchwegartikeln

Stand: 06.11.2026. Vorbereiteter Code, kein Production Eingriff.
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
