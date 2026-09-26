# Unveränderlicher Bundestags-Artikelstand vom 26.09.2026

Der [Leitabsatzfix](bundestag-leitabsatz-20260926.md) macht den vollständigen
amtlichen Absatz nutzbar. Der reguläre Quellenhash verwendet jedoch nur die URL:
Der Beschlussbericht vom 25.09. kollidiert damit mit dem bereits gespeicherten
Vorbericht vom 14.09. Eine Überschreibung würde historische Quellen verändern.

## Enger Quellenvertrag

Nur ein ausdrücklich aus einem geprüften automatischen v2-Bundestags-Leitabsatz
erzeugter Artikelstand bekommt eine eigene Kennung. Sie bindet kanonische URL,
exakten Titel, Publikationstag und vollständigen Absatzhash. Identische Stände
bleiben identisch; andere Stände und die alte URL-Quelle bleiben getrennt.
Geschlossene Metadaten stehen in `raw.helmutBundestagArtikelstand`, der Absatz
bleibt im separaten Artikelbeleg. Kein automatischer Crawl oder Import wird aktiviert.

Eine nur tagesgenaue Veröffentlichung bleibt in `published_at` leer. Der
Quellenvertrag gibt den belegten Tag aus; Frischeabfragen erhalten keine erfundene
Uhrzeit. Bekannte Abrufzeiten bleiben erhalten. Alle sechs fachlichen Leser
bewahren Stand und Belegbindung; falsche IDs oder Hashes werden zurückgewiesen.

## Lokale Abnahme

25 synthetische Prüfgruppen: Erstellung, Manipulationen, Altquelle, beide
Speicherwege, Wiederholung über den tatsächlichen Bestandsleser, sechs fachliche
Leser und PostgreSQL-Zeitformat. Vier gezielte Dedup-Suiten, Quellenzeitvertrag
und Bereichsauswahl bestanden. Die Auswahlprüfung wurde an die bereits zuvor
vorhandenen 99 Standardsuiten angepasst; die Standardmenge bleibt unverändert.

Originalintegration am 26.09., 10:47:50 UTC mit gesichertem HTML: vollständige
602 Zeichen, Absatzhash `a094a6458c67347fa2817dd3dbf7a9fa2ba5eec3ea149c86619a09408aa4d060`.
Neue Quellenkennung `rd-f757f0b844a673c91894dee250fe77946d35b7032aea0ce69f94c69bd5033d83`.
Tag 25.09.2026, Veröffentlichung und unbekannter Abrufzeitpunkt bleiben NULL.
Das ist eine lokale Integration, kein neuer Abruf oder Production-Nachweis.

Die anschließende vollständige Quellenansicht deckte einen weiteren Blocker
auf: Der lange konkrete Gesetzesname verlor durch die Genitivendung `es` sein
starkes Beleggewicht. Die drei sachlich zusammengehörigen Quellen bildeten zwei
Cluster und wurden vom sichtbaren Lesepfad abgewiesen. Ausschließlich lange,
spezifische Namen auf `gesetz` behalten jetzt bei `s`/`es` das Gewicht derselben
Identität. Keine allgemeine Stammwortlogik oder Absenkung einer Schwelle.
Mit den tatsächlichen drei Quellen: ein Cluster, Quellenprüfung bestanden.
Synthetische Gegenproben erhalten Jahres-/Datums-/Thementrennung, entfernte
Nachrichtenzyklen und die Zählung als genau eine Belegfamilie.

## Abgegrenzte anschließende Production-Vorarbeit

Der [Betreiberauftrag](autonom-bis-500-starttor-20260926.md) autorisiert diesen
notwendigen Vorbereitungsschritt. Erst nach grünem Merge und Deployment:

* Umgebung: Helmut Production, Supabase `ddckuvvpcytqbyfmbvie`.
* Genau eine neue Quellenzeile, eine Fundstelle und ein Link zum Vorgang
  `vg-bundespolizeigesetz-20260925-c1afab`. Die historische amtliche Quelle und
  beide vorhandenen DLF-Quellen bleiben vollständig unverändert.
* Genau dessen Wissensobjekt redaktionell korrigieren: belegter Beschlussstand,
  Innen-/Haushaltsausschuss, drei tatsächliche Quellen, keine unbelegte Frist
  oder Handlungsempfehlung. Der Merkmalsvektor wird lokal neu berechnet.
* Herkunft ausdrücklich `redaktion-artikelstand-20260926`, Version 2.
  CAS bleibt vollständig unverändert `unbekannt`, Fencing 2, Ergebnis-Fencing 1.
  Kein Modell-Retry, keine Wiederverwendung alter Quittungen.
* 0 Profiländerungen, 0 Aktivierungen, 0 Modellaufrufe, 0 zusätzliche variable
  Kosten. Technischer Tagesriegel bleibt 4 USD; kein 500er Test.

Risiko: falsche Quellenverknüpfung oder unbeabsichtigte Nebenwirkung. Deshalb
vollständiger Vorhervergleich des Zielobjekts, aller drei alten Quellen, der
beiden Links und CAS; 500 inaktive Profile, keine Arbeit/Leases/Sperren;
Profil-, Identitäts- und Auth-Hashes gebunden. Transaktion mit 15 Sekunden
Zeitgrenze, 2 Sekunden Sperrwartezeit, geschlossenen Änderungsfeldern und
Vorher-/Nachherhash aller nicht freigegebenen Zeilen der elf betroffenen Tabellen.
Jede Abweichung bricht die gesamte Transaktion ab.

Quittung `redaktion-bundespolizeigesetz-20260926-a` enthält Originalbeleg und
vollständige Sicherung. Eingabehash
`55e97b0857140491fac5bee55b9fb9a6fb58859fe667908b3bd57f3e9ecb85c7`.
Privat gesicherte Dateien: `artikelstand-eingabe.json`,
`artikelstand-ausfuehren.sql`, `artikelstand-rueckweg.sql` und SQL-Planer im
Arbeitsartefaktordner `bundestag-leitabsatz`. Kein privater Vollbestand im Repo.

Rückweg: nur bei unverändertem Nachzustand neue Quelle/Fundstelle/Link entfernen,
exakte alte Objektfelder samt Zeitstempel herstellen, Quittung als zurückgenommen
erhalten. Manipulierte Sicherung, fremde Wirkung oder Wiederholung brechen ab.
Isoliertes PGlite-Labor prüft Erfolg, Einmaligkeit, Drift, Fremdwirkung und Rückweg
mit Production-Spalten und echtem Fencing-Trigger; Vektor dort als Text,
Profile synthetisch. Alle 15 Prüfgruppen mit der tatsächlichen Eingabe bestanden.
Production prüft den tatsächlich typisierten Nachzustand.

Nachkontrolle: sämtliche erlaubten Änderungen und unveränderten Schutzwerte
frisch lesen, Artikelbeleg nach DB-Roundtrip validieren, tatsächliche Versorgung
aller 500 Profile neu berechnen. Eine verbesserte Einzelquelle ist noch keine
500er Vollversorgung oder Abnahme sichtbarer Ausgaben.
