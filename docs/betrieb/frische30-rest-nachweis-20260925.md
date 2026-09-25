# Restkorrektur und frische Zuordnung am 25.09.2026

## Ausgefuehrte Production-Korrektur

Separates Betreiber-GO fuer den exakt vorgelegten Plan erteilt. Einmalige
Transaktion um11:13:30UTC, Nachlesung11:13:55UTC: alle acht betroffenen Zeilen
stimmen in saemtlichen Feldern mit dem Plan und mit den gespeicherten
Nachher-Hashes ueberein. Vier neue redaktionelle Vorgaenge trennen Rente,
Tankrabatt, Trump/Xi und angekuendigten Schulstreik. Sie behaupten keine
unbelegten Ergebnisse. Sieben bestehende Quellenbindungen sind verschoben;
alle19 betroffenen Bindungen bleiben erhalten. Drei alte Fehlvorgaenge bleiben
pending/failed-final, mit0/10/1 historischen Quellen. Der vierte alte Vorgang
zur Vermoegenseinziehung ist ohne den ungueltigen Ortswert wieder complete.

Alle30 frischen Dokumente sind jetzt mit27 complete-Vorgaengen verbunden.
Das ist keine vollstaendige fachliche Abnahme aller Felder dieser27 Ergebnisse.
Der urspruengliche Modelllauf bleibt fachlich nicht bestanden und verbraucht.

Die vier neuen Texte sind ausdruecklich redaktionelle Korrekturen:
understanding_model=redaktion-quellenkorrektur-20260925, keine Modelltoken.
confidence_score60 ist ein konservativer Schemawert unterhalb des Bonus70,
keine gemessene Wahrscheinlichkeit. Keine erfundenen Ausschuss-, Partei-,
Handlungs-, Risiko- oder Chancensignale fuer bessere Zuordnungswerte.

Production-Quittung: redaktion-frische30-rest-20260925-a, abgeschlossen.
Eingabehash: 2ef1449817cc902a6eec4a3dbeb2210c4074abc64c642de47f32d2eb2d6aec44.
Die Quittung enthaelt exakte Eingabe, vier vollstaendige Vorherzeilen,
19 Vorherbindungen und acht Nachher-Hashes. Der [kompakte SQL-Nachweis](frische30-rest-nachweis-20260925.json)
enthaelt die separat gelesenen Feld-, Hash-, Link-, Profil- und Kostenpruefungen.
Privater Plan: /private/tmp/helmut-frische30-rest-plan.json;
SQL: /private/tmp/helmut-frische30-rest-korrektur.sql;
bedingter Rueckweg: /private/tmp/helmut-frische30-rest-rueckweg.sql.
Kein Wiederholen der bereits verbrauchten Korrektur.

15s je SQL-Anweisung,2s Sperrwartezeit, UTC, volle Vorherzeilen-/Quellenhashes,
504/0 sowie Betriebsruhe waren transaktionale Vorbedingungen. Die Vorherdaten
wurden innerhalb der Datenbank gesichert. Der Rueckweg verlangt unveraenderte
Nachherzeilen, stellt die19 Verknuepfungen wieder her und sperrt die neuen bzw.
korrigierten Ergebnisse; er loescht nichts und gibt alte Fehler nicht frei.
Er wurde nicht in Production benoetigt oder ausgefuehrt.

Lokaler PostgreSQL-SQL-Test mit PGlite/pgvector:9/9 Gruppen, darunter
Normalfall, Wiederholungsverbot, Rueckweg, Profil-/Quellen-/Altzeilenabweichung,
laufende Arbeit und vollstaendiger Rollback bei injiziertem Nachbedingungsfehler.
Produktionsspaltentypen, vier alte KO-Zeilen, sieben Quellen und19 Links;
504 ausschliesslich lokale synthetische Profilzeilen. Keine Production-Zugaenge.
Kein Beweis fuer konkurrierende Production-Prozesse.

SELECT11:13:59UTC:504 Mandatsprofile/0 aktiv, Profil-, Identitaeten- und Mainhash
unveraendert;0 Jobs/Locks/Leases. Tageskosten0,207358USD,0 offen, Limit4USD.
Der30er Modelllauf bleibt bei26 Aufrufen/0,172350USD. Keine neuen Modelle,
Kosten, Profilaktionen oder Aktivierung durch die Korrektur.

## Vollstaendige lokale Zuordnungsrechnung, kein Live-Funktionstest

Am11:14:36UTC wurden die Production-Leseprojektionen aller500 Zielprofile
und aller27 korrigierten frischen complete-Vorgaenge durch die unveraenderte
Produktionslogik storage.fromMandateProfileRow/decisions.decideForUser gelesen.
Profilmenge495 synthetisch+5 real; kanonischer Zielhash
dda70a02c9918d73a7ae45b7ab4febd6bae5a1df0a4d3fc65b9a260c62bcdfc6.
Keine Modelle, kein Netz, keine Production-Schreibvorgaenge.

Ergebnis:0/500 erreichen40 Punkte, Hoechstwert37;464/500 ohne harten
Merkmalstreffer. Alle495 synthetischen und alle5 realen Profile bleiben unter40.
Vor der Restkorrektur ergab die22er Projektion denselben Gesamtbefund.
Private Einzelbilanz: /private/tmp/helmut-frische30-500-zuordnung-nach-korrektur.json.
Ein lokal zuerst anders serialisierter ID-Hash wurde vor Dokumentation durch
die kanonische hash()-Funktion ersetzt; die Zielmenge war unveraendert.

Das belegt fehlende ausreichende Zuordnung dieses frischen Bestands durch die
Decision Engine. Es ist weder eine Live-Briefingaufnahme noch ein Urteil ueber
alle weiteren Produktpfade oder eine erfolgreiche500er Inhaltsabnahme.
Die Lesung aller frischen complete-KOs im Standardfenster24.09.14:00UTC bis
25.09.11:10UTC ergab vor der Korrektur genau die22 untersuchten Vorgaenge.

495 Testprofile fuehren Testparteien, Testthemen und Testwahlkreise.
434 haben echte Bundestagsausschuesse;61 Landtagsprofile fuehren Testausschuesse.
Diese61 haben in diesen vier Dimensionen keinen realen Identitaetsanker;
ihr Bundesland ist dagegen real und kann weiterhin einen regionalen Bezug liefern.
Die historische Generatorregel verlangt diese synthetischen Werte ausdruecklich;
sie werden nicht still umgeschrieben. Weder Quellen erfinden noch Schwellen
absenken, um den500er Nachweis scheinbar zu bestehen.

## Zusaetzlicher harter Startblocker:61 fehlende Landespakete

Production SELECT11:18:51UTC: keine source_packages fuer Mecklenburg-Vorpommern
oder Thueringen. Der unveraenderte Resolver resolveProfilePackages meldet fuer
alle500 gelesenen Zielprofile genau61 requiredMissing:31 fuer Mecklenburg-Vorpommern,
30 fuer Thueringen. Das ist unabhaengig vom niedrigen Score ein konkreter
Pflichtversorgungsblocker; der Code erlaubt kein Wegdefinieren der Landespakete.
Private vollstaendige Bilanz: /private/tmp/helmut-500-pflichtpakete-20260925.json.
Andere Paketstatus oder Abrufgesundheit werden hier nicht pauschal abgenommen.

Der Betreiber wurde zur Zielabgrenzung gefragt:500 Bundestagsprofile als
aktuelles Produktziel (konkreten Umstellungsplan fuer61 synthetische Profile
vorbereiten), oder gemischte Kohorte samt Aufbau beider Landesmodule.
Keine Production-Profilumstellung ist dadurch freigegeben oder erfolgt.

## Weiter offen

Frische fachlich brauchbare Versorgung aller500, positive gemeinsame sichtbare
Bereichsabnahme, Gesamtzeit/-kosten unter4USD und die separate bereinigte
500er Startfreigabe. Neue Quellen oder Profilmerkmale brauchen einen konkreten
geprueften Plan und das passende Production-GO. Kein500er Start erfolgt.
