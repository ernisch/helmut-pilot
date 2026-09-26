# Bundestag: direkten hib-Abrufweg wiederherstellen

Die [amtliche RSS-Uebersicht](https://www.bundestag.de/services/rss) verlinkt
`https://www.bundestag.de/static/appdata/includes/rss/hib.rss`.
Der bisherige hib-Zweitpfad `/presse/hib/rss` liefert beim einmaligen direkten
Abruf am26.09. HTTP404. Der reine Pressemitteilungsfeed ersetzt diese
parlamentarischen Kurzmeldungen nicht.

Begrenzte Nurleseprobe26.09.,07:57:43UTC: hib HTTP200,15 geparste Eintraege,
14 mit vollstaendigem Satzpraefix. Eine Meldung ohne solchen Auszug ausgeschlossen.
Kandidatenhash `a48af98ff272b6b8a4a43cb99f8bacc21f17aa6468135ad6f766e7d8d3a52a9c`.
Zweite amtliche Probe Arbeit/Soziales: HTTP200,15 Eintraege, aber keine vom
bestehenden Zeitparser bestaetigte Publikationszeit; alle ausgeschlossen.
Keine Datumsannahme und keine Uebernahme dieses Themenfeeds in Production.
0 Modellaufrufe,0 Importe.

Wichtige Grenze: Juengste hib-Publikation25.09.,13:16UTC, also VOR dem
Standard-Briefingfenster ab14:00UTC. Keiner der14 Kandidaten schliesst allein
die heutige Versorgungsluecke. Kein alter Inhalt wird umdatiert. Diese Reparatur
stellt einen echten Quellenweg wieder her, sie beweist keine500er Bereitschaft.

## Code und konkret abgegrenzte Betriebsaktion

Legacy-Katalog und Katalogseed zeigen nun primaer auf den verifizierten hib-Feed.
Im Legacy-Modus bleiben die Pressemitteilungen als zweiter Feed erhalten;
Anzahl Abrufwege, Anbieter, Prioritaet, neutrale Zuordnung und16er Deckel bleiben
gleich. Kein Parserumbau und keine neue Infrastruktur.

Production-Lesung07:59:17UTC ergab abweichend vom Repository:
`retrieval_paths.id=rp-bundestag`, URL `https://www.bundestag.de/rss`,
Status `needs_review`, `always_on`, Prioritaet100, max_items16,
updated_at `2026-07-26T11:07:48.278487+00:00`. Die Datenbank ist im aktiven
Quellenmodus massgeblich; ein Codemerge allein korrigiert diese Zeile nicht.

Innerhalb der gespeicherten Freigabe bis vor den500er Start wird nach gruener
Pflicht-CI und Ausrollung genau diese eine vorhandene Production-URL auf hib.rss
gewechselt. Vorher: ganze Zeile sichern, auf Parallelitaet und unveraenderten
Altstand pruefen. Wirkung: regulaere Abrufe dieses bestehenden Wegs koennen
kuenftig hib-Meldungen einlesen. Keine Profilaktivierung, kein manueller Import,
kein erzwungener Crawl oder Modelllauf. Status, Erfolgszeit und Fehlermetriken
nicht als Erfolg umschreiben. Tagesbudget bleibt4USD.

Risiko ist ein erneut nicht erreichbarer oder ungeeigneter Feed. Ruecklesung
prueft exakte URL und unveraenderte uebrige Felder sowie Profil-/Kostenruhe.
Rueckweg: ausschliesslich diese URL auf den gesicherten Altwert setzen, nur bei
unveraendertem neuen Zeilenstand; kein Ueberschreiben spaeterer Betriebsaenderungen.
Die damalige Vorbereitung wurde wie nachfolgend belegt ausgefuehrt.

## Ausrollung und Production-Ruecklesung

[PR601](https://github.com/ernisch/helmut-pilot/pull/601) am26.09.,08:23:51UTC
gemergt als `dfbc6edd572cfc29ef683497e237c05e04f3d3d1`. Beide Pflichtpruefungen
in36229095333 erfolgreich; zusaetzliche Abrufwegpruefung36229095368 erfolgreich.
Der erste CI-Lauf fand eine nicht neu generierte Seed-Datei. Der Generator
korrigierte genau die Bundestags-URL; Driftpruefung und finale CI bestanden.
Kein kompletter Seed und keine Migration in Production ausgefuehrt.
Vercel `dpl_AAieZhqgKWhLjwkqjoNXuz9mG4Qb` READY auf dem exakten Merge-Commit.

08:25:07.550UTC: genau eine bestehende Zeile `rp-bundestag` aktualisiert,
an ihren vollstaendigen vorherigen Hash
`143d65d4bf5798caf8b28d4ee96d2694c6d31e2fbd046976288e50e5cac13138` gebunden.
500 inaktive Profile und keine Jobs/Sperren/Leases/laufenden Prozesse waren
Voraussetzung. Neuer Zeilenhash
`335893a2a716e2a8560c3ebd6ed5936fb7e4736b1524b2ba3252e7dd59e9d1c8`.
Unabhaengige Lesung08:25:28UTC und vollstaendiger Feldvergleich: ausschliesslich
`url` und `updated_at` geaendert. Status weiter `needs_review`, keine erfundene
Erfolgszeit. Beide Profilhashes unveraendert;500 Profile/0 aktiv und0 Jobs/Sperren/
Leases. Tageskosten0,153824USD plus unveraenderte unbekannte Reserve0,212USD.
Keine Runtime-Fehler seit Merge in der damaligen Lesung.

Damit ist der bestehende amtliche Quellenweg korrigiert. Ein nachfolgender
regulaerer Production-Abruf oder erfolgreicher Import ist noch nicht belegt.
Die14 geeigneten Probemeldungen bleiben ausserhalb des heutigen Fensters;
keine500er Vollversorgung und kein Modellnachweis daraus ableiten.
