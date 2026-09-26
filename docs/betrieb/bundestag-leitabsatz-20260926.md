# Vollständiger Bundestags-Leitabsatz: Eingabeblocker vom 26.09.2026

## Problem und Änderung

Der amtliche [Bericht zur dritten Beratung des Bundespolizeigesetzes](https://www.bundestag.de/dokumente/textarchiv/2026/kw39-de-bundespolizeigesetz-1211314)
enthält einen vollständigen Leitabsatz mit 602 Zeichen. Er belegt die Beteiligung
von Innen- und Haushaltsausschuss. Der bisherige Zusatztext-Leser lehnt ihn mit
`absatz-zu-lang` ab: Seine allgemeine Obergrenze beträgt 600 Zeichen.

Nur automatisch gewonnene, vollständig gebundene Bundestags-Leitabsätze dürfen
jetzt bis zu 1200 Zeichen enthalten. Manuelle Belege, generische HTML-Artikel
und Deutschlandfunk bleiben bei 600. Der erste Absatz bleibt vollständig;
Überlänge wird abgelehnt, kein späterer Absatz als Ersatz gewählt. Titel, Ziel-URL,
Artikelbereich, Sichtbarkeit, Datum und Beleg-Hashes werden unverändert geprüft.
Die bestehenden Modell-Ausgabegrenzen und der technische Kostenriegel bleiben
unverändert. Ein längerer Eingabetext kann zusätzliche Eingabetokens verursachen.

## Gezielte Nachweise

- Bundestagsvertrag: 12 Prüfgruppen; 1200 Zeichen akzeptiert, 1201 abgelehnt,
  keine spätere Ersatzwahl, lange Texte vollständig im Understanding-Prompt.
- Generischer Leser: 11 Gruppen; Deutschlandfunk: 10; manueller Vertrag: 10.
- Eigene Offline-Integration mit dem gesicherten Original-HTML: exakt 602 Zeichen,
  beide Ausschussbelege vollständig erhalten, identische Rücklesung aus isoliertem
  Speicher und vollständige Übergabe in den Prompt. Ein simulierter Abruf,
  kein erneuter Abruf bei Wiederverwendung, keine Modelle oder Productionwrites.

Der Originaltext bleibt im privaten Nachweis. Die Repository-Regression verwendet
synthetischen Text. Eingesetzter lokaler Helfer: DeepSeek Flash, Denkstufe High;
Diff und Integration anschließend unabhängig geprüft. Merge, Pflicht-CI und
Deployment dieses Fixes sind über den zugehörigen PR belegt.

## Grenze zur Production-Verarbeitung

Der Artikel weist den 25.09.2026 aus, keine verlässliche Publikationsuhrzeit.
Er wird deshalb nicht als neue Veröffentlichung nach 14:00 UTC ausgegeben.
Sein möglicher Nutzen ist der amtliche Ausschussbeleg zum selben Gesetzesvorhaben;
die aktuelle Deutschlandfunk-Quelle liefert separat den neuen Tagesanlass.

Rein lesend am 26.09., 10:08–10:11 UTC: Zum bestehenden Vorgang liegen zwei
Quellenbindungen vor, aber nur ein im KO gezähltes Dokument. Seine letzte
Verarbeitungsreservierung steht auf `unbekannt`, Fencing 2, Ergebnis-Fencing 1.
Außerdem existiert bereits eine ältere Fassung der amtlichen Artikeladresse
vom 14.09. mit anderem Titel. Keine dieser Zeilen wurde geändert.

Eine hypothetische lokale Relevanzprojektion der gespeicherten 500 Profile ergibt
für diesen Vorgang 83 Treffer statt 0, wenn beide belegten Ausschüsse und drei
Quellen korrekt gebunden wären. Das ist weder ein Datenimport noch eine
Fachabnahme oder Production-Versorgung. Vor Verarbeitung sind Artikelversion,
Vorgangsbindung und der ungeklärte Verarbeitungsstand ausdrücklich abzusichern.
Der verbrauchte 16er Auftrag wird nicht erneut ausgeführt.
