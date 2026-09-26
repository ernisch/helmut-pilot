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

## Production ausgeführt und nachgelesen

[PR609](https://github.com/ernisch/helmut-pilot/pull/609), Kopf
`e5baf29d9e691a4412e861df0757a600d1279ae5`: beide Pflichtprüfungen im
[Lauf36237312190](https://github.com/ernisch/helmut-pilot/actions/runs/36237312190)
erfolgreich. Merge26.09.,11:08:59UTC:
`ae5cf4aef7594382ee98a4b3e35ffcf2f88e8f1c`. Vercel
`dpl_EV8Rwmt4wXQFyLL6NEbVS7uv4rZ4` Production READY11:09:18UTC, exakter Commit.
Keine error/fatal-Protokolle im gelesenen Zeitraum11:09:18–11:11:52UTC.

Die oben begrenzte Polizeigesetz-Transaktion ist ausgeführt. Unabhängige
Nachlesung11:10:50UTC: Quittung `ausgefuehrt`, genau drei gebundene Quellen;
602-Zeichen-Beleg nach Datenbank-Roundtrip gültig und sichtbarer Quellenfilter
bestanden. Alle drei alten Quellen, CAS, vollständige Profil-/Identitäts-/Auth-
Hashes unverändert.500 Profile/0 aktiv,0 Jobs/Leases/Sperren/offene Reserven.
Die lokale Relevanzauswertung aller500 unveränderten Profile mit frisch
gelesenen16 Vorgängen ergibt85 mit Score≥40 statt3 vorher;415 darunter.
Das ist noch keine Abnahme der tatsächlich sichtbaren500 Ausgaben.

## Tankrabatt: vorhandene Quellen zusammengeführt

Anschließend wurden ausschließlich die beiden gleichartigen Vorgänge
`vg-entlastung-20260925-e75e6f` und `vg-preissenkung-20260925-4728de` korrigiert.
Alle vier bestehenden Quellen sind unverändert am ersten Vorgang gebunden;
der zweite bleibt als stillgelegte Dublette erhalten. Der schon zuvor geparkte
Mischvorgang sowie sämtliche CAS bleiben unverändert. Redaktionelle Herkunft
und Versionswechsel sind ausdrücklich gespeichert, kein behaupteter Modelllauf.

Finanzausschussbeleg: vollständiger426-Zeichen-Absatz im
[amtlichen Beschlussbericht](https://www.bundestag.de/dokumente/textarchiv/2026/kw39-de-versicherung-aufsicht-1216898),
Position8 innerhalb des konkreten Artikels einschließlich leerer HTML-Absätze,
SHA256 `72799a47cd1e576afc1803b9134e87c125608044fd093e35ba86806747b84b95`.
Keine erfundene Handlungsfrist oder Behauptung einer tatsächlichen Weitergabe
des Steuervorteils an den Tankstellen.

Vorher festgelegter privater Aktionsplan samt vollständiger Sicherung und
bedingtem Rückweg: `tankrabatt-aktionsplan.md`, `tankrabatt-eingabe.json`,
`tankrabatt-ausfuehren.sql`, `tankrabatt-rueckweg.sql` im selben Artefaktordner.
14 lokale SQL-Prüfgruppen bestanden. Einmalige Quittung
`redaktion-tankrabatt-20260926-a`, Eingabehash
`6c50575fa68b33df8c3ef4b1d5ddbe76f9dec71c6bd30f4fe949c3f6b7442a56`.

Unabhängige Production-Nachlesung11:11:38UTC: erwartete beide Objektfassungen,
vier Links am kanonischen Vorgang, kein Link an der erhaltenen Dublette, alle
Quellen und CAS identisch; vollständiger Artikelbeleg und sichtbarer Quellenfilter
bestanden. Profile und Auth unverändert,500/0, keine offene Arbeit oder Reserve.
Helmut-Tagesbuch weiterhin0,164443USD, technischer Riegel4USD. Beide
Datenkorrekturen zusammen:0 Modellaufrufe,0 Profiländerungen,0 Aktivierungen.

Erneute lokale Relevanzauswertung der frisch gelesenen16 Vorgänge:
**127/500 mit Score≥40,373 darunter.** Weder Vollversorgung noch sichtbare
Bereichsabnahme oder500er Funktionsnachweis daraus ableiten. Nächster Schritt:
tatsächlichen Builder-/Quellenpfad mit aktuellem Datenstand für alle500 prüfen
und die verbleibenden Fachlücken gezielt bearbeiten.
