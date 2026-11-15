# Enger Ad-hoc-Headerteaser: nachgewiesene Leserreparatur

Stand15.11.2026,08:20UTC. Auftrag: belegte Versorgungsfehler autonom beheben,
kleinster notwendiger Umfang, gruen integrieren, erfolgreiche Ergebnisse erhalten.
Keine zusaetzlichen bezahlten Modelle, neuen Lasttests oder geschuetzten Liveaktionen.

## Original und Ursache

Oeffentliches Original:
https://www.ad-hoc-news.de/wirtschaft/kita-startchancengesetz-staedtetag-fordert-volle-kostenuebernahme-durch-den-bund/70514492

Ein einzelner kostenfreier Diagnose-GET:HTTP200,67995Bytes,
SHA256`c875e209e9d7ab9e0d4671f0d0d378d3d35423285305eab936556b37133bac09`.
Der bisherige native Leser verweigert dieselben gespeicherten Originalbytes mit
`artikelbereich-mehrdeutig-oder-fehlend`. Die Seite verwendet einen div-Teaser
im Artikelheader und zwei genau belegte sichtbare Layoutstile statt des bislang
gebundenen Standardbereichs. Kein neuer Modell- oder Produktlauf.

## Kleinste Reparatur und Grenzen

Nur das geschlossene Herausgeber-/Pfadmuster im bestehenden Quellenlayoutleser
akzeptiert genau den vollstaendigen Headerteaser. H1, NewsArticle.headline,
kanonische Adresse, Originalsekunde und sichtbare Berliner Publikationsminute
muessen passen. Der Teaser muss wortgleich der strukturierten Beschreibung sein.
Die sichtbare Redaktion boerse-global.de bleibt gesondert als Herkunft erhalten;
sie wird nicht zum amtlichen Herausgeber oder zur journalistischen Freigabe umgedeutet.

Zwei genaue sichtbare Stile sind ausschliesslich innerhalb der vollstaendigen
Original-Vorfahrenkette zugelassen; zusaetzliche/abweichende Stile bleiben gesperrt.
Kein verborgenes Markup, widersprechende weitere Artikel oder Robots-Sperren werden
uebergangen. Neue Positionsbasis`html-article-header-teaser`bezeichnet genau einen
Headerteaser, nicht die Absatzanzahl des gesamten Artikels.
Das Verfahren bleibt`artikel-einstieg-v2`, niemals Volltext.

Nachher liefern dieselben Originalbytes nativ135Zeichen mit TextHash
`b1f9656b831675f9b1891cde73bd9617859d87dbccfad0df32089740efcde152`.
AntwortHash bindet unveraenderte komplette Originalbytes. Originaltexte liegen nur
im privaten lokalen Diagnoseverzeichnis, nicht in Git.

Bestehende Layouttests:neue5/5gezielteGruppen gruen ueber Schutzstarter und
Offline-Preload. Positive Originalstruktur sowie negative Ziel-/Titel-/Datums-,
Sichtbarkeits-/Stil-/Redaktions-/Robots- und Provenienz-Gegenfaelle. Syntax der
vier geaenderten JavaScriptdateien und Diffpruefung gruen. Keine lokale Vollsuite.
Pflicht-CI am finalen PR-Kopf steht noch aus.

## Betriebsnachweis bleibt getrennt

Der konkrete Auftrag wartete zuletzt mit`artikelkontext-offen`. Die bestehende
Hostfreigabe umfasst18Hosts und schliesst www.ad-hoc-news.de weiterhin aus.
Das Codefix aendert weder diese Liste noch Cache-/Jobzustaende oder Reservierungen.
Ein technischer Originalvergleich erteilt keine Nutzungsrechte und belegt keinen
nachtraeglichen Joberfolg. Eine etwaige Hostaufnahme waere ein eigener konkret
begrenzter Production-Eingriff mit Vor-/Nachwert und Rueckweg.

Aktueller regulaerer Morgenbeleg05:15UTC:partial,67Eintraege,2Absaetze,
Quellenstand offen, kein belegter Tagesanlass. Alle fuenf alten Erfolgsjobs und
der Altbriefinghash waren bei der lesenden Kontrolle07:32unveraendert.
Neue Quellenbindungen, laufende Versorgung und vollstaendige Tagesprioritaet
werden aus dem Leserfix nicht abgeleitet.
