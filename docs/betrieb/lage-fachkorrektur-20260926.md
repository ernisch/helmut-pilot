# Lage: fachlich falsches positives Urteil

Stand26.09.2026,21:15UTC. Roadmap3.1 bleibt offen.

## Nachkontrolle22:08UTC: Fachvergleich bestanden, Generatorplan gestoppt

PR632/`757b1db50c578e114b90bd4de6213f46b9b7aab1` ist READY;
Deployment`dpl_3PaiHUcJw32txntmWKaH83bwFK69`, Pflicht-CI36274031627 am
Kopf`7a219477` vollständig grün. Fehler-/Fatal-Nachfenster21:57:38–21:58:14UTC leer.
Plan36274711893 bestanden. [Vergleich b](https://github.com/ernisch/helmut-pilot/actions/runs/36274768206)
ist fachlich bestanden: konkreter Absatz akzeptiert, schlechter Absatz sowohl
`profilbezug=false` als auch`textart=fuelltext`. Vollständige Antwort unabhängig
nachgelesen,1 Aufruf/0,011909USD, keine offene Reserve. Kein gespeicherter Lage-Text.
Vollständiger Quittungshash:
`4ebb535072d679b10483c3046f0bdff90a5ffd37309823bdeb5cfbe8407a0699`.

Der [Generator-Nurleseplan](https://github.com/ernisch/helmut-pilot/actions/runs/36274853821)
stoppte vor Quittung und Modell; unabhängig0 Quittungen/0 Kostentickets.
Ursache: `profiles.find` wurde vor dem Laden des Bestands aufgerufen. Kleinster
Fix lädt den unverändert streng geprüften500/501-Bestand vor der Profilauswahl.
Ein echter `main()`-Adaptertest belegt Reihenfolge und Ablehnung falschen Bestands.

Zusätzlich wechselte zwischen Beginn von b (21:59:33UTC) und Generatorplan
(22:00:56UTC) der Berliner Kalendertag. Der Prompt bindet das echte Briefingdatum;
der heutige PaketHash darf daher nicht dem gestrigen gleichgesetzt werden.
Eigener Folgeauftrag c (`lage-fachkorrektur-20260926-c`, UTC-Auftragstag weiterhin26.09.)
verlangt die vollständige unveränderte b-Quittung und bindet den neuen Commit und
aktuellen Berliner Tag. Keine Uhrkorrektur, keine Quellen-Umdatierung, kein Retry
verbrauchter Aufträge. Sollwerte bleiben strikt. Vergleich1/0,25USD/240s,
bedingter noch unbenutzter Generator2/0,50USD/240s am selben neuen Commit.
Der erneute Vergleich ist wegen neuer Commit-/Tagesbindung erforderlich;
der bereits bestandene historische Fachbeleg b wird nicht nachträglich entwertet.

Flash High änderte nur Initialisierung und Adaptertest; eigener Review und
Integration des neuen Auftrags anschließend.36 Vorstartgruppen und15
Prüfaufwandgruppen bestanden, echte b-Quittung vollständig gebunden.
54 lokale Sessions konservativ bilanziert; letzter Helferansatz0,080922084USD.
Externe Bindung3,417928USD, Production25.09.0,433563USD und26.09.0,683279USD:
Gesamt4,534770USD, alte0,35USD-Reserve enthalten, beide Grenzen unverändert6USD.
Fortschreibung atomar nach Rollbackprobe und Vollhashbindung; keine Profiländerung.

PR633/`693e52bfad13c98fc036d90e971796cca497d43c` ist ebenfalls READY,
Deployment`dpl_HyCriFL8x1VEJirqMFc69S1fj5HK`, beide Pflichtprüfungen36274085340
am Kopf`85671088` bestanden. Runtime-Leser36274989103 bestätigt22:03:16UTC
Kostenriegel aktiv/6USD und Kommunikation gesperrt. Quellen-Datenbankweg noch
nicht umgestellt; kein Import- oder Crawl-Erfolg behauptet. Historische vier
Feedkandidaten gehören zum Fenster26.09.; Berliner Tageswechsel nicht ignorieren.

## Nachkontrolle21:32UTC

PR631 ist als`2ac66e0b5bd41c9f283fcc47c9816affb23949b2` ausgerollt,
`dpl_7WjP3VbsLsh8ovj8MkhCnBkdKynQ` READY21:28:03UTC.
Pflicht-CI36272351391 am Kopf`aaa15092` vollständig grün; keine error/fatal-Logs
im Nachfenster21:27:41–21:28:21UTC. Rein lesender Plan36273039331 bestanden.
Der erste Dispatch36273101059 stoppte wegen eines falsch übertragenen Profilhashs
vor Quittung und Modell; unabhängige Lesung bestätigt0 Quittungen/0 Kostentickets.
Der korrigiert gebundene [Run36273181935](https://github.com/ernisch/helmut-pilot/actions/runs/36273181935)
verbraucht Auftrag a: ein Aufruf,0,014680USD, keine offene Reserve.

Vollständige Antwort unabhängig gelesen: Absatz1 zulässig; Absatz2 korrekt
`profilbezug=false`, aber weiterhin fälschlich`konkreter_sachverhalt`.
Das Paarurteil ist vollständig, aber bei einem Fülltext kein fachlicher Beleg für
zwei brauchbare Sachverhalte. Gesamturteil bleibt negativ, Generator nicht gestartet.
500/0 und beide Profilschutzhashes unverändert; keine Jobs/Locks/Leases.
Gesamtbindung jetzt4,441938USD; Tages-/Gesamtgrenze weiterhin6USD.

Die Schema-Beschreibung ließ noch jede „zugeschriebene Aussage“ als konkret gelten,
während der Prompt bloße Themenberichte ausschloss. Die Korrektur verwendet eine
identische, präzisierte Definition in Schema und Prompt: Die Existenz einer
Meldung ist selbst keine fachliche Handlung; Quellenabdeckung ist getrennt von
inhaltlicher Brauchbarkeit. Kein Länderfilter und keine Änderung der Sollwerte.

Vor dem Folgeauftrag wird die Paarprüfung des isolierten Negativtests präzisiert:
Das Paarurteil muss vollständig, eindeutig und begründet vorliegen. Weil ein Absatz
vorab als Fülltext definiert ist, zählt es nicht als fachlicher Paarbeleg
(`fachlichGeprueftePaare=0`); beide booleschen Paarantworten sind zulässig. Beide
Ablehnungsmerkmale des schlechten Absatzes bleiben zwingend. Der ursprüngliche
Vierfalltest prüft weiterhin alle6 fachlichen Paare; die Produktprüfung erzeugter
Lageabsätze bleibt unverändert streng. Der negative Auftrag a wird nicht umgedeutet.

Eigener Folgeauftrag`lage-fachkorrektur-20260926-b`: dieselben zwei echten Absätze,
gleiche Quellen, Sollwerte und Grenzen (1 Aufruf/0,25USD/240s, medium/6000).
Er verlangt zusätzlich den Vollhash der verbrauchten Quittung a
`acf1d7b44af3a986111159409a58f4e627cc245ba892e1ddf27ec566e64fe29c`.
Der noch unbenutzte Generatorauftrag darf erst nach bestandenem b und eigener
Prüfung folgen; beide Aufträge müssen denselben Production-Commit verwenden.
Keine Wiederverwendung oder Umschreibung von a. Neuer Gesamtzusatzrahmen0,75USD
passt unter6USD; vor Ausführung frische Kosten-/Ruheprüfung. Lokale Schema-/Prompt-
Bindung und15 Prüfaufwandgruppen bestanden, vollständige Quittung a geprüft.

## Befund und Sicherung

[PR630](https://github.com/ernisch/helmut-pilot/pull/630), main
`3cc6041b332d2e679f40f1af632e46d3242c67a2`, ist ausgerollt:
`dpl_5pAGzwTCCN1d9Pc9XUm1DL9nfxFQ` READY21:02:16UTC.
Beide Pflichtprüfungen am Kopf`f35dbd1e` bestanden
([CI36270841239](https://github.com/ernisch/helmut-pilot/actions/runs/36270841239)).
[Plan36271579852](https://github.com/ernisch/helmut-pilot/actions/runs/36271579852)
und [Generator36271644026](https://github.com/ernisch/helmut-pilot/actions/runs/36271644026)
liefen technisch erfolgreich. Zwei Aufrufe,0,017871USD, zwei gespeicherte Absätze,
keine offene Reserve. Generierung low/3000, isolierte Prüfung medium/6000.

Die unabhängige vollständige Textprüfung verwirft das fachliche Ergebnis:
Absatz1 enthält belegte Annahme des Bundespolizeigesetzes und Finanzbericht.
Absatz2 sagt lediglich, dass eine Bundestagsmeldung ein Fischereiprojekt in
Eritrea behandelt. Das ist kein konkreter Sachstand. Allein der ausländische Ort
begründet außerdem keinen Bezug zum Auswärtigen Ausschuss. Der
[amtliche Originalartikel](https://www.bundestag.de/presse/hib/kurzmeldungen-1215482)
behandelt Entwicklungszusammenarbeit; die Modelleingabe hatte nur den Titel.
Ein grünes technisches Prüfurteil ist deshalb hier kein fachlicher Nachweis.

Production21:11:49UTC unabhängig nachgelesen: genau der betroffene Lage-Cache
ist entfernt; die vollständige alte Tabellenzeile liegt unverändert im privaten
Archiv`lage-fachquarantaene-20260926-a`. Ihr PostgreSQL-Vollzeilenhash bleibt
`f84ee73c16c7bfd417872fe17149ffacbccf9ebfcfbcc7e84d11dc553fdd6b07`.
Technische Quittung, Entwurf, Prüfantwort und Kosten bleiben historische Belege.
Archivierung und Entfernung liefen nach erfolgreicher Rollback-Trockenprobe
atomar, gebunden an Vollzeilenhash, ruhende500/0 und beide Profilschutzhashes.
Kein Profil wurde verändert. Rückweg: vollständiges Archiv bleibt erhalten;
bekannt schlechten Text nicht automatisch wieder ausliefern.

## Kleinste Korrektur und begrenzter Nachweis

Generator und Prüfer unterscheiden nun ausdrücklich eine konkrete Aussage in
einer Überschrift von einem bloßen Meldungsthema. Ein Auslandsort allein trägt
keine außenpolitische Ausschusszuständigkeit. Kein Länderfilter, kein pauschales
Titelverbot, kein erfundener Akteursbeleg. Produktmodell und Standards bleiben gleich.

Die eigenen, nicht wiederverwendbaren Aufträge sind:

1. `lage-fachkorrektur-20260926-a`: genau ein vorhandenes inaktives Profil,
   seine beiden tatsächlichen Absätze und exakt gebundene Quellen. Erwartet:
   Absatz1 vollständig zulässig; Absatz2 `profilbezug=false` UND `textart=fuelltext`,
   keine Quellen-/Strukturfehler als Ersatz. Ein unabhängiges Paarurteil.
   Ein medium/6000-Aufruf, maximal0,25USD und240s. Kein auslieferbarer Text.
2. Nur nach Erfolg und eigener Prüfung: `lage-generatorfachkorrektur-20260926-a`,
   ein Profil, maximal zwei Aufrufe/0,50USD/240s. Derselbe Production-Commit,
   vollständige Eingabe-/Antwortbindung und erneute Auswertung der Vorgängerquittung.
   Generierung low/3000, Prüfung medium/6000 ausschließlich im isolierten Nachweis.
   Ergebnis erst nach Quellen-, Text-, Speicher- und Kosten-Nachkontrolle abnehmen.

Vor jedem Aufruf gelten Kosten-, Profil-, Quellen- und Ruheprüfungen. Für120s
Transport und60s Abschluss müssen vor dem Aufruf noch180s übrig sein.
Bei Abweichung stoppen, keine automatische Wiederholung. Profile bleiben inaktiv;
keine Aktivierung, kein500er Lauf, keine externe Nachricht. Alte Quittungen bleiben
verbraucht. Gesamter zusätzlicher Rahmen0,75USD.

Lokale Prüfung:15 Prüfaufwandgruppen,35 Vorstartgruppen und Dokumentbindung
bestanden; echte Vorgängerquittung und Archiv vollständig per Hash validiert.
Offline-Urteile beweisen die Serverablehnung, noch keine neue Modellwirkung.
Flash High änderte die beiden Prompts und einen bestehenden Test; Integration
und Production-Schritte liegen beim führenden Agenten.

## Kosten und verbleibende Roadmap

53 lokale DeepSeek-Sessions konservativ nachgezählt, einschließlich des lokal
bereits27.09. abgelegten, tatsächlich26.09.UTC gelaufenen Flash-Auftrags.
Dessen Ansatz0,041428524USD kommt hinzu; die alte0,35USD-Reserve bleibt stehen.
Externe Bindung auf3,337005USD fortgeschrieben, Tages-/Gesamtgrenze unverändert6USD.
Productionkosten25.09.:0,433563USD;26.09.:0,656690USD. Gesamtbindung4,427258USD,
keine offene Productionreserve. Neue Aufrufe erst nach unabhängiger Nachlesung.

Die letzte vollständige Quellenmessung bleibt127/500 mit Tagespriorität und373
ohne. Der belegte Lagefehler hebt diesen Befund nicht auf. Bereichsabnahme,
Vollversorgung, Kosten-/Zeitplan und finaler Startplan bleiben offen. Kein500er
Funktionsnachweis. Keine bereits abgeschlossene Messung pauschal wiederholen.
