# Frische16: gebundene Quellenversorgung

Der Auftrag verarbeitet genau16 bereits gelesene Quellen mit fest gebundenen
Originalabsaetzen:12 Deutschlandfunk- und4 Tagesschau-Artikel. Eingabe- und
Belegdateien bleiben lokal; die unveraenderlichen Bindungen stehen in
`lib/helmut/verstehen-frische16-vertrag.js`.

## Grenzen und Abnahme

* Einmalquittung `verstehen-frische16-20260926-a`, keine Wiederaufnahme alter Auftraege.
* Hoechstens16 Modellaufrufe,0,80USD und15 Minuten. Tagesriegel bleibt4USD.
* Genau500 Mandatsprofile bleiben inaktiv;501 Identitaeten, Profilhash vorher/nachher.
* Keine Quellenabrufe, Aktivierung, Kommunikation oder automatische Wiederholung.
* Bei fehlendem/zweifelhaftem Einzelergebnis, Kosten-, Zeit-, Speicher- oder
  Bindungsfehler stoppen. Alle16 Positionen muessen bilanziert werden.
* Quellen bleiben nach dem Lauf erhalten. Kein Loeschen oder Zuruecksetzen
  verbrauchter Quittungen. Der Import-Rueckweg ist nur vor Verarbeitung und nur
  fuer unveraenderte, unverknuepfte Eingaben erlaubt.

## Bedienung und Schutz

Der Workflow `verstehen-frische16.yml` bindet main, Dispatch und Checkout an denselben
vollen Commit und erlaubt nur den ersten Versuch. Leere Bestaetigung liest nur;
Modellzugang gibt es ausschliesslich im expliziten Ausfuehrungsschritt.
Vorher Importplan, ruhenden Bestand, Tageskosten und den Nurleseplan pruefen.
Ein fehlendes UTC-Tagesbuch ist erst nach vollstaendigem Historien-/Zaehlerabgleich
startklar; initialisiert wird es weiterhin atomar bei der ersten Reservierung.
Historische Reservierungen bleiben unveraendert.

`scripts/quellen-frische16-plan.js` erzeugt den exakt gebundenen Import und
Rueckweg. Beide sperren betroffene Tabellen und vergleichen den fremden Bestand
nach allen Schreibwirkungen. SQL-Labortests umfassen erfolgreiche Rueckkehr,
aktive Profile, falschen Bestand, gebrauchte Quittung, lebende Lease sowie
Nebenwirkungen auf Profile, Identitaeten, Quellen und Belegablage.

Status: lokal vorbereitet und gezielt geprueft; noch kein Import oder Modelllauf.
Ein erfolgreicher Quellenauftrag ist keine Vollversorgung oder500er Abnahme.
