# Lage-Nachweis nach amtlicher Quellenkorrektur

## Aktueller Befund: Generator wählt erneut ein falsches Mandatsfeld

[PR617](https://github.com/ernisch/helmut-pilot/pull/617) am Kopf `9de68750`
in [CI36249983255](https://github.com/ernisch/helmut-pilot/actions/runs/36249983255)
beide Pflichtprüfungen grün, Merge `1d24245e2556d395bb73dd6d61aa9495a04c27f1`.
Production `dpl_2r5GHEXg4pTof3v38VbMcavrEkE4` READY15:04:39UTC,
keine error/fatal-Logs bis15:05:01UTC. [Plan36250698909](https://github.com/ernisch/helmut-pilot/actions/runs/36250698909)
bestanden. [Generatorlauf36250788961](https://github.com/ernisch/helmut-pilot/actions/runs/36250788961)
15:06:52–15:07:44UTC fachlich gescheitert:2 Aufrufe/0,009631USD, kein Tagessatz.
Quittung `lage-generatornachweis-20260926-a` terminal gestoppt/verbraucht.

Der Generator liefert zwei verschiedene belegte Aussagen derselben amtlichen
Quelle, bindet aber die Gesetzesannahme an den Auswärtigen Ausschuss. Das
getrennt begründete Review lehnt diese falsche Zuordnung korrekt ab und
akzeptiert den zweiten Absatz zum Finanzierungsbericht/Haushaltsausschuss.
Beide Quellenurteile und der Paarvergleich sind positiv. Damit bleibt die
Generatorauswahl fehlerhaft; keine weitere blinde Wiederholung dieses Auftrags.
Die bestandene Vierfall-Reviewprüfung wird nicht wiederholt.

Nachkontrolle15:08:21UTC:500 Profile/0 aktiv, Mandats-/Identitätshashes unverändert,
0 Jobs/Sperren/Leases/offene Kosten, Tagesbuch0,350731USD. Unabhängige notwendige
[frische18-Quellenvorbereitung](verstehen-frische18-20260926.md) läuft lokal;
noch kein Import. Kein500er Start, Vollversorgung/Bereichsabnahme/Kostenplan offen.

## Vorheriger Anschluss: Generatornachweis nach bestandener Mandatsprüfung

[PR616](https://github.com/ernisch/helmut-pilot/pull/616) mit beiden grünen
Pflichtprüfungen am Kopf `f71522c4` ([CI36248745257](https://github.com/ernisch/helmut-pilot/actions/runs/36248745257))
gemergt als `700001011b971cb0d1eb3dd552905fd66601e4c6`. Production
`dpl_EnnLWkT8EZPVHpZfDMiQGhAtEoXn` READY14:42:19UTC; keine error/fatal-Logs
bis14:43:23UTC. Erster Nurleseplan36249474978 stoppte ohne Modellaufruf am
versehentlich verkürzt übertragenen Profilhash; kein Produktfehler.
[Korrigierter Plan36249554612](https://github.com/ernisch/helmut-pilot/actions/runs/36249554612)
bestanden. [Vierfall-Lauf36249646222](https://github.com/ernisch/helmut-pilot/actions/runs/36249646222)
14:46:45–14:47:21UTC **fachlich bestanden**:2 positive und2 negative
Mandatszuordnungen korrekt;4 Quellenprüfungen und6 Paarvergleiche bestanden.
Genau1 Aufruf,0,009593USD; kein auslieferbarer Lage-Text. Die vollständig
zurückgelesenen Begründungen wurden unabhängig fachlich geprüft. Eigene
Quittung `lage-mandatsurteil-20260926-a` abgeschlossen und verbraucht;
Paket `5829cffed6370571424550153403b90f88cfe122ceb511d3a04d7bc8f8ba62bb`.

Nachlesung14:48:01UTC:500 Profile/0 aktiv, vollständige Mandats-/Identitätshashes
unverändert,0 Jobs/Sperren/Leases/offene Kosten. Tagesbuch0,341100USD.
Dies beweist die vier festen Reviewfälle, noch nicht die richtige Auswahl
und Generierung eines neuen Textes oder die vollständige Bereichstrennung.

Dafür Roadmap3.1-Anschluss `generatornachweis`, eigene neue Quittung
`lage-generatornachweis-20260926-a`: genau dasselbe unveränderte inaktive
Profil und derselbe amtliche Artikelstand, normaler bestehender Generator,
Quellenreview, Speicherung und unabhängige Nachlesung. Strenge Bindung an
den obigen erfolgreichen Vorgänger einschließlich4/4 Einzelbilanz,
positivem Paar-Sammelurteil UND allen6 vollständigen Paarbelegen.
Maximal2 Aufrufe/0,50USD/240Sekunden; gpt-5-mini, low und volle Reserve
unverändert. Vorher neuer main/READY, Nullkosten-Planlauf und Kostenabgleich.
Kostenstand14:51UTC konservativ2,978816USD einschließlich aller erfassten
lokalen Helfer25./26.09.; keine Anbieterrechnung. Auch mit vollem0,50USD-Limit
unter4USD. Keine Wiederholung der bestandenen Vierfallprüfung.

Wirkung: genau ein fehlender Lage-Tagessatz und private Prüf-/Kostenbelege;
keine Aktivierung oder Profiländerung. Risiko: erneute falsche Themenauswahl,
Modellablehnung oder technische Teilwirkung. Erfolg verlangt beide Aufrufe,
fachlich gültigen gespeicherten Text und unabhängige vollständige Quellen-/
Mandatsnachprüfung. Profil-/Artikelabweichung, Konkurrenz, unbekannte Kosten,
Zeitgrenze oder vorhandener Tagessatz stoppen. Nachkontrolle: ganze Quittung,
Entwurf/Review/Tagessatz, Profilhashes, Kosten und Sperren lesen. Rückweg:
eigene Sperre lösen, Auftrag terminal schließen, keinen fachlich abgelehnten
Text freigeben; bei ungültigem gespeichertem Ergebnis gesonderte begrenzte
Korrektur mit gesichertem Altstand. Kein Retry verbrauchter Quittungen.
31 gezielte Vorstartprüfgruppen bestanden. Noch nicht ausgeführt.

Zusätzliche Nurlesediagnose14:49UTC über sämtliche500 gespeicherten
Builder-Ausgaben des12:29-Snapshots:16 Vorgänge mit echtem Tagesanlass;
bei allen373 Profilen ohne Priorität sind diese entweder nicht in der
Kandidatenliste oder als Ignorieren bewertet (je vorhandener Entscheidung
4–38 Punkte, kein Fall oberhalb der unveränderten40er Grenze). Die127
Prioritäten entfallen auf82 Bundespolizeigesetz,42 Tankrabatt und3 Berliner
Sondierungen. Das ist eine vollständige Verteilung dieses lokalen Snapshots,
keine vollständige fachliche Ursachenabnahme oder neue Liveversorgung.

## Vorheriger Anschluss: getrenntes Mandatsurteil

[PR615](https://github.com/ernisch/helmut-pilot/pull/615), Kopf `1891a79f`,
beide Pflichtprüfungen im [CI-Lauf36246387057](https://github.com/ernisch/helmut-pilot/actions/runs/36246387057)
grün. Merge `642b2d0717ce2d6a4b19509792296e9d7af52295`, Production
`dpl_F5GzRD8MJTnQGFLTKKqZtCPHByXK` READY14:01:06UTC; keine error/fatal-Logs
im gelesenen Zeitraum bis14:01:26UTC. [Nurleseplan36247101531](https://github.com/ernisch/helmut-pilot/actions/runs/36247101531)
bestanden. [Einmalauftrag36247202801](https://github.com/ernisch/helmut-pilot/actions/runs/36247202801)
14:03:47–14:04:38UTC **fachlich gescheitert**:2 Aufrufe,0,010820USD,
kein Lage-Tagessatz. `lage-zustaendigkeit-20260926-a` terminal gestoppt/verbraucht.

Die drei Absätze sind quellenbelegt und voneinander verschieden. Der Generator
ordnet jedoch private Heizkosten dem Haushaltsausschuss zu; dieses negative
Profilurteil ist korrekt. Der ebenfalls enthaltene Sanktionsbericht ist an den
Auswärtigen Ausschuss gebunden, wird aber erneut abgelehnt. Die gemeinsame
Kurzbegründung erklärt nur die Quellenlage, nicht das negative Mandatsurteil.
Keine automatische Neugenerierung: Auswahlfehler und Prüffehler werden getrennt.

Production-Nachlesung14:06:04UTC:500 Mandatsprofile/0 aktiv; Mandats-/
Identitätshashes unverändert (`4d1845ad…`/`f10056df…`),0 Jobs/Sperren/Leases/
offene Kosten. Tagesbuch0,331507USD, technischer Tagesriegel4USD unverändert.

Die Anschlusskorrektur verlangt eine eigene kurze `mandatsbegruendung` vor
dem Wahrheitswert `profilbezug`. Fehlend, leer oder ohne den gewählten exakten
Mandatswert bedeutet Ablehnung. Dies prüft die nachvollziehbare Zuordnung,
nicht automatisch ihre Bedeutung. Fakten-, Akteurs- und Paarprüfung bleiben
streng; bloße Wortgleichheit wie öffentlicher/private Haushalte genügt nicht.

### Vorab festgelegter Vier-Fall-Nachweis

Roadmap3.1. Ein vorhandenes unverändertes inaktives Profil, derselbe gebundene
Profilhash wie oben. Vier feste Texte mit vier separat gehashten, live erneut
gelesenen Quellen; keine neuen Nachrichtenbehauptungen. Die ersten drei Texte
stammen unverändert aus dem letzten Entwurf; der vierte gibt den bereits
gelesenen DLF-Auszug zur Energiesteuer wieder. Keine Quelle wird umdatiert.

| Fall | Gewähltes Mandatsfeld | Erwarteter Profilbezug |
|---|---|---|
| Bundespolizeigesetz mit Bericht zur Finanzierbarkeit | Haushaltsausschuss | ja |
| Fortsetzung der EU-Sanktionsverhandlungen | Auswärtiger Ausschuss | ja |
| Prognose privater Heizkosten | Haushaltsausschuss | nein |
| Verteidigung der Energiesteuersenkung auf Kraftstoffe | Auswärtiger Ausschuss | nein |

Die unabhängige Sollgrundlage wurde26.09. gegen die aktuellen amtlichen
Beschreibungen [Auswärtiger Ausschuss](https://www.bundestag.de/ausschuesse/a03_auswaertiges)
und [Bundeshaushalt](https://www.bundestag.de/parlament/aufgaben/haushalt_neu)
abgeglichen. Diese beschreiben außenpolitische Begleitung beziehungsweise
staatliche Haushaltsberatung und -kontrolle. Die konkreten Zuordnungen der
vier Quellenthemen sind daraus abgeleitete Fachurteile; keine Behauptung einer
unbelegten Ausschusshandlung und keine zusätzliche Nachricht im Modellprompt.

Alle vier Faktenprüfungen und alle sechs Vergleiche verschiedener Sachverhalte
müssen ebenfalls bestehen. Ein negativer Sollfall zählt nur bei genau der
erwarteten fachlichen Ablehnung; fehlende Belege/Begründungen oder Strukturfehler
sind kein bestandener Negativtest. Die Sollwerte gelangen nicht ins Modell.
Dieser Vierer-Vergleich ist weder eine vollständige Generatorabnahme noch eine
500er Textabnahme. Die bereits bestandene36er Prüfung wird nicht wiederholt.

Eigene Quittung `lage-mandatsurteil-20260926-a`, Workflow-Auswahl
`mandatsurteil`; ausschließlich der belegte verbrauchte Vorgänger oben ist
zulässig. Nach geprüftem Merge/Production READY zuerst Nurleseplan, dann
höchstens **ein** `gpt-5-mini`-Quellenreview mit unverändertem `low`,3000
Ausgabetokens,240 Sekunden und0,25USD. Volle bestehende Reserve0,212USD,
4USD-Tagesriegel unverändert. Kostenstand14:17UTC konservativ2,841584USD für
den gesamten Auftrag einschließlich aller erfassten lokalen Helfer25./26.09.;
keine Anbieterrechnung. Vor Ausführung erneut abgleichen.

Wirkung: private Prüfquittung mit Eingaben und Antwort, reguläre Modell- und
Kostenbuchung. Kein neuer auslieferbarer Text, keine Profiländerung, keine
Aktivierung. Risiko: falsches oder unvollständiges Modellurteil; jeder einzelne
Fehler verhindert den Erfolg. Quellen-/Profil-/Commitabweichung, Parallelbetrieb,
Zeit-/Kostenfehler oder verbrauchte Quittung stoppen. Nachkontrolle: vollständige
Quittung unabhängig zurücklesen, alle vier Urteile fachlich prüfen, Profilhashes,
Kosten und Sperren kontrollieren. Rückweg: Lauf terminal schließen, eigene
Sperre lösen, keine fachlichen Produktdaten rückzuschreiben; Belege erhalten,
kein Retry und keine Umdeutung unbekannter Kosten. Der Auftrag ist vorbereitet,
noch nicht ausgeführt. Lokale Abnahme:9 neue Schutzprüfgruppen,27 bestehende
Vorstartgruppen und Dokumentbindungsregression bestanden.

### Unabhängige verbleibende Grenzen

Die lesende Anschlussanalyse bestätigt am dokumentierten Pflegefall: ein
frischer Artikel plus thematisch passender Profilausschuss ersetzt im bestehenden
Briefingvertrag keine belegte Akteursbeteiligung. Kein Schwellen-, Flag-, Profil-
oder Quellenzeit-Eingriff. Die127/373-Bilanz bleibt eine lokale Messung auf dem
oben bezeichneten Snapshot, keine neue Liveabnahme aller Texte. Bei der frischen
Quellenlesung13:31:50UTC waren alle16 Rohdokumente des Briefingfensters bereits
vollständig verknüpft;0 unverstandene Restdokumente dieses Fensters. Das beweist
nicht, dass außerhalb der gelesenen Quellen keine weiteren Nachrichten existieren.

Die vier jüngsten Zweiaufruf-Vorläufe kosten0,009026/0,008331/0,009837/0,010820USD.
Eine einfache Hochrechnung allein auf500 solche Paare ergibt4,1655–5,4100USD,
ohne übrige Verarbeitung oder Reservespitze. Keine Prognose oder Kostenfreigabe;
ein belastbarer Plan unter dem unveränderten4USD-Riegel fehlt weiterhin.
32 verschiedene öffentliche Profilkontexte bedeuten nicht32 austauschbare
Eingaben: die vollständige lokale Lageprojektion hatte404 geordnete beziehungsweise
372 nach Quellreihenfolge kanonisierte Eingabemengen. Keine neue Cache-/Gruppenlogik,
keine Wiederverwendung alter Ergebnisse als frische500er Ergebnisse.

Zusätzliche Radarprüfung26.09.,14:25UTC: alle500 gespeicherten Builder-Ausgaben
des12:29-Snapshots durch den unveränderten echten Renderer geführt;1 persönlicher
und1 Umfeldhinweis,0 fehlende Titel/Links. Kein API-Mitschnitt, keine DOM-/CSS-
Abnahme und keine neue Liveversorgung. Der persönliche Link wurde direkt
[beim Bundestag](https://www.bundestag.de/mediathek/video?videoid=7657592) gelesen:
Seitentitel, Hauptüberschrift und Video-ID gehören zur Rede der benannten Person.
Der Umfeldlink führt inzwischen auf einen [aktualisierten DLF-Artikel](https://www.deutschlandfunk.de/unionsfraktionschef-frei-warnt-vor-zusammenarbeit-mit-der-linken-eralp-stellt-sich-gegen-antisemitis-100.html),
der die ursprüngliche Einladung zu Sondierungen weiterhin enthält. Kein altes
Quelldatum oder gespeicherter Titel wurde auf diesen neuen Stand umgeschrieben.
Private Einzelbilanz und Originalseitenbeleg gesichert; keine Production-Writes.

Roadmap3.1/3.3; der [autonome Betreiberauftrag](autonom-bis-500-starttor-20260926.md)
gilt weiter. Keine Aktivierung und kein500er Test. Ein einzelner erfolgreicher
Lage-Text ersetzt weder500 fachliche Abnahmen noch die1500er Ergebnisbilanz.

## Production-Quellenabschluss

[PR610](https://github.com/ernisch/helmut-pilot/pull/610) ist als
`fce689c0a2cdddb47b2a0296f20d9d07fb4523d6` ausgerollt. Beide Pflichtprüfungen
am Kopf `c2037105` im [Lauf36240059559](https://github.com/ernisch/helmut-pilot/actions/runs/36240059559)
erfolgreich. Vercel `dpl_4e2pZFAoyQmEomhhhKRpPAFnUYzX` Production READY;
keine error/fatal-Protokolle im gelesenen Zeitraum12:02:17–12:23:43UTC.

Die bereits [vorbereitete einzelne Quellenkorrektur](bundestag-artikelstand-20260926.md#anschluss-vollständiger-absatz-im-lage-quellenvertrag)
wurde nach erneutem vollständigem Vorvergleich ausgeführt. Unabhängige
Production-Nachlesung26.09.,12:25:12UTC: neue Quittung
`redaktion-bundespolizeigesetz-lage-20260926-a` ausgeführt, Eingabehash
`a150449703f949fe4accc6e5528e5f52dc08a6c5db3999a8074c315cfa7bf97f`.
Genau eine summary ergänzt;602 Zeichen, ganzer Absatzhash bestätigt.
Der tatsächliche lokale Lage-Eingabebauer übernimmt den Absatz und drei Quellen;
der Publikationstag bleibt25.09., keine Uhrzeit erfunden.
Alte Quellen, Wissensobjekt, CAS, Links, Fundstellen und alte Quittung gleich.
Alle500 Mandatsprofile/0 aktiv; vollständige Profil-/Identitäts-/Auth-Hashes
gleich,0 Jobs/Sperren/Leases/offene Kosten. Tagesbuch0,293493USD, Riegel4USD.
Die Datenkorrektur verursachte0 Modellaufrufe und0 variable Modellkosten.

## Vollständige lokale Eingabeprüfung

Frische Production-Projektionen12:25–12:29UTC:500 neueste Wissensobjekte,
962 zugehörige Quellen; dazu die tatsächlich gespeicherten zwölf Zuordnungen
je Profil (6000 Zeilen) und deren747 zusätzliche Wissensobjekte. Quellen mit
mehr als40 Links wurden für die Vollständigkeit der Frischesuche zusätzlich
gelesen. Keine solche historische Übermenge wurde als vollständige Anzeige
simuliert. Alle500 unveränderten Profilprojektionen wurden einzeln geprüft.

Der tatsächliche lokale Briefing-Bauer ergibt weiterhin127 Tagesprioritäten
und373 ohne. **Korrektur der früheren Radar-Zählung:** Das alte private
Prüfskript las das nicht vorhandene Feld `anzeige.umfeld`; daraus entstand
fälschlich die Zahl0. Die tatsächlichen Felder `anzeige.environment` und
`anzeige.dynamics` ergeben zusammen einen Beobachtungshinweis für ein Profil;
zusätzlich gibt es einen persönlichen Hinweis. Keine Produktänderung und
keine Lockerung der Radarkriterien.

Der tatsächliche lokale Lage-Bauer im Modus `cacheOnly` hat am26.09.,12:31UTC
für500/500 Profile zulässige Eingaben mit9–12 Vorgängen. Verwendet wurden die
aktuellen SQL-Projektionen einschließlich gespeicherter Zuordnungen; die
Speicherzugriffe wurden lokal ersetzt. Vorhandene Textcaches wurden bewusst
nicht bewertet. Kein Netz, kein Modell, kein API-Mitschnitt, keine inhaltliche
Abnahme der Texte und keine Aussage, dass alle Vorgänge fachlich zum Profil
passen. Die gesamte private Einzelbilanz bleibt außerhalb des Repositorys.

Die amtlichen Feeds [hib](https://www.bundestag.de/static/appdata/includes/rss/hib.rss)
und [Pressemitteilungen](https://www.bundestag.de/static/appdata/includes/rss/pressemitteilungen.rss)
wurden einmal frisch gelesen: jeweils15 Einträge, neueste Veröffentlichung
25.09.,13:16UTC beziehungsweise10:17:59UTC. Keine liegt im geltenden
Briefingfenster ab25.09.,14UTC. Das ist eine begrenzte Quellenprobe, keine
vollständige Suche aller Nachrichten. Keine Quelle wurde umdatiert/importiert.

## Neuer begrenzter Einmalauftrag

Die neue Workflow-Auswahl `artikelstand` verwendet eine eigene Quittung
`lage-artikelstand-20260926-a` und bindet genau ein unverändertes Profil über
Hash `5fed1a61b4ba022a9722181f6c3fd06be5b3b4917cf3d3d3d1ff70f048364a4c`.
Mandatskontext: Auswärtiger Ausschuss und Haushaltsausschuss. Die neue
amtliche Quelle belegt ausdrücklich den Haushaltsausschuss; andere aktuelle
Originale behandeln unter anderem Sanktionen. Die Auswahl bleibt beim
unveränderten Generator und dessen strenger nachfolgender Inhaltsprüfung.

Maximal2 Modellaufrufe,240 Sekunden,0,50USD; alle500 Profile bleiben inaktiv.
Der vollständige amtliche Artikelstand wird vor der Vorschau und vor jedem
bezahlten Aufruf erneut über die bestehenden Quellenleser geprüft. Die
Vorschau muss die Quelle am richtigen Vorgang enthalten. Ein vorhandener
Tagessatz, fehlende/abweichende Quelle, falscher Commit/Profilhash, fremde
Arbeit, Kosten-/Zeitgrenze oder fachliche Ablehnung stoppen. Keine Wiederholung
verbrauchter Aufträge; keine Veränderung von Modell, Budget oder Qualität.

Wirkung nach geprüftem Merge/READY: neuer Lage-Tagessatz und private Entwurf-/
Reviewbelege, Kostenbuchung, eigene terminale Quittung. Nachkontrolle liest
Text, Quellen, Urteil, Kosten und unveränderten Profilbestand unabhängig.
Technischer Erfolg allein ist keine fachliche Abnahme. Fehlerhafte Originale
bleiben als Beleg erhalten; keine Löschung historischer Daten. Bei fachlichem
Fehler zuerst dessen gezielte Absicherung, keine unkontrollierte Neugenerierung.

Lokale Abnahme:23 Schutzprüfgruppen bestanden; zusätzliche Integration mit
der tatsächlich rückgelesenen Production-Quelle und der echten Lagekarte
bestanden (602 Zeichen, Lage-Quellenkennung `q-7a17daf60deb5b5a03a7`).
Die konservative Gesamtschätzung um12:31UTC lag bei2,292027USD einschließlich
lokaler Helfer am25./26.09.; der anschließend gestartete lokale Helfer kommt
noch hinzu. Keine Anbieterrechnung. Vor scharfer Ausführung erneut abgleichen.
Der neue Modellauftrag ist hier vorbereitet, noch nicht ausgeführt.

## Ausführung und belegte Anschlusskorrektur

[PR612](https://github.com/ernisch/helmut-pilot/pull/612) ist nach beiden grünen
Pflichtprüfungen am Kopf `b92964af` im [CI-Lauf36242515698](https://github.com/ernisch/helmut-pilot/actions/runs/36242515698)
als `d826ad1ef3f64cb578821a5e0b60e98105a9f5ee` gemergt. Production
`dpl_3muRBsTxF6wTfU8i7Z1afqNjjANL` READY12:48:17UTC; im gelesenen Zeitraum bis
12:48:49UTC keine error/fatal-Logs. Der [Nurleseplan36243104455](https://github.com/ernisch/helmut-pilot/actions/runs/36243104455)
bestätigte elf Vorgänge und exakt den602-Zeichen-Artikelstand.

[Scharfer Einmalauftrag36243162049](https://github.com/ernisch/helmut-pilot/actions/runs/36243162049)
12:50:06–12:50:53UTC: **fachlich gescheitert**, `ai-text-source-support`,
zwei Aufrufe,0,009026USD, kein auslieferbarer Tagessatz. Die Quittung
`lage-artikelstand-20260926-a` ist terminal gestoppt und verbraucht.
Unabhängige Datenbank-Nachlesung12:51:35UTC:500/0, Mandats-/Identitätshashes
unverändert,0 Jobs/Sperren/Leases/offene Kosten. Tagesbuch0,302519USD,
Tagesriegel4USD. Beide Tickets abgerechnet: Entwurf0,003369USD,
Prüfung0,005657USD. Keine Kostenfreigabe durch Schätzung.

Vollständiger Entwurf und Review wurden unabhängig gelesen: Absatz0 mischt
die DLF-Meldung zur Fortsetzung von EU-Sanktionsverhandlungen mit
Tagesschau-Details zu zwei Oligarchen, nennt aber nur die DLF-Quellenkennung.
Die Prüfung lehnt dies korrekt ab. Absatz1 aus dem amtlichen Bundestagsabsatz
wird vollständig akzeptiert; auch die Verschiedenheit der beiden Sachverhalte
ist bestätigt. Dies ist ein positiver Teilbefund, kein bestandener Gesamttext.

Der Generator erhielt bisher mehrere Dokumente pro Vorgangszeile und am Ende
eine widersprüchliche Mehrzahlregel für Vorgangskennungen. Die Anschlusskorrektur
führt jedes Dokument separat und untersagt ausdrücklich auch die Ergänzung aus
sachgleichen Nachbardokumenten. Alle Quellenfelder bleiben vollständig erhalten;
Schema, Review, Modelle und Kosten-/Qualitätsgrenzen sind unverändert.
Gezielte Offline-Abnahme:11 Dokumentbindungsgruppen und25 Vorstartgruppen grün.
Die Regression bildet den tatsächlichen Mischfehler ab; vorgegebene Prüfantworten
sind kein neuer Modellnachweis.

Ein sachlich begründeter neuer Nachweis `einzelquelle` bekommt die eigene Quittung
`lage-einzelquelle-20260926-a`. Er verlangt zusätzlich genau den oben belegten,
terminalen Vorlauf ohne offene Kosten. Dasselbe unveränderte Profil, derselbe
amtliche Artikelstand und dieselben Grenzen: höchstens2 Aufrufe,240 Sekunden,
0,50USD; fehlender Tagessatz, alle500 inaktiv, neues geprüftes main/READY.
Wirkung/Risiko/Nachkontrolle/Rückweg wie oben: möglicher neuer Tagessatz samt
privaten Entwurf-/Reviewbelegen und Kostenbuchung; bei Ablehnung kein Erfolg,
kein automatischer Retry und keine Löschung der alten Belege. Vor Ausführung
Kosten erneut lesen und Nurleseplan prüfen. Der Anschluss ist noch nicht ausgeführt.

## Einzelquellen-Nachweis und Mandatsauswahl

[PR613](https://github.com/ernisch/helmut-pilot/pull/613), Kopf `f2580fb7`,
beide Pflichtprüfungen im [CI-Lauf36243563920](https://github.com/ernisch/helmut-pilot/actions/runs/36243563920)
grün; Merge `13a152e8bb880a97435cbc0a8b130248980c69a7`, Production
`dpl_FSdZwf7QQHmRYPXCEw39ioHbvTNs` READY13:18:28UTC, keine error/fatal-Logs
im gelesenen Zeitraum bis13:19:11UTC. [Nurleseplan36244761052](https://github.com/ernisch/helmut-pilot/actions/runs/36244761052)
bestanden. [Einmalauftrag36244835548](https://github.com/ernisch/helmut-pilot/actions/runs/36244835548)
13:20:40–13:21:26UTC erneut **fachlich gescheitert**;2 Aufrufe,0,008331USD,
kein Tagessatz, terminale Quittung `lage-einzelquelle-20260926-a` verbraucht.
Nachlesung13:22:52UTC:500/0, Profil-/Identitätshashes gleich,0 Jobs/Sperren/
Leases/offene Kosten, Tagesbuch0,310850USD, Riegel4USD.

Der unabhängig vollständig gelesene Entwurf mischt jetzt keine Dokumente.
Beide Sachverhalte sind laut Review belegt und verschieden. Absatz1 über
Kraftstoffpreise ist aber dem Auswärtigen Ausschuss zugeordnet; das Review
lehnt den fachlichen Bezug korrekt ab. Die neue Ursache ist keine weitere
Quellenmischung. Im Generator wird der erste Profil-Ausschuss ohne Grundlage
zum Schwerpunkt erklärt. Zudem steht im Ausgabeschema der Text vor der Auswahl
von Quelle und Mandatsbezug. Die Korrektur entfernt die künstliche Priorisierung
und ordnet Auswahl vor Text. Feldmenge, Enums, Qualitätsprüfung und Kosten bleiben
unverändert.13 Dokumentbindungsgruppen und26 Vorstartgruppen lokal bestanden;
noch kein Wirkungsnachweis des geänderten Prompts.

Dafür ist genau ein neuer Auftrag `mandatsauswahl` mit eigener Quittung
`lage-mandatsauswahl-20260926-a` vorbereitet. Er bindet den unmittelbar vorherigen
terminalen Lauf36244835548/13a152e8, dasselbe unveränderte Profil, den identischen
amtlichen Artikelstand und erneut maximal2 Aufrufe/240 Sekunden/0,50USD.
Wirkung, Risiko, Nachlesung und Rückweg entsprechen den obigen Einmalaufträgen;
alle500 bleiben inaktiv. Kein Replay verbrauchter Aufträge. Vorher frische
Kostenprüfung und Nurleseplan am neuen geprüften main/READY. Noch nicht ausgeführt.

Unabhängige lokale Diagnose der Versorgungslücke: beim vorhandenen Pflegefall
`vg-hauptstadtstudios-20260925-0e55d7` liegt die echte Quelle im Briefingfenster.
Für ein Gesundheitsprofil fehlen passende strukturierte Merkmale; der Vorgang
wird vor der Entscheidung verworfen und erreicht auch ohne diesen Filter keine
Tagespriorität. Kein Ausschuss ist in der Quelle als Akteur belegt. Eine bloße
Schwellensenkung oder erfundene Ausschusszuordnung ist keine Lösung. Matching,
Quellendaten und Profile wurden nicht geändert. Dieser Einzelbefund ist keine
vollständige Ursachenanalyse aller373 fehlenden Tagesprioritäten.

## Mandatsauswahl-Nachweis und fachliche Zuständigkeit

[PR614](https://github.com/ernisch/helmut-pilot/pull/614) nach beiden grünen
Pflichtprüfungen am Kopf93804d5e im [Lauf36245292368](https://github.com/ernisch/helmut-pilot/actions/runs/36245292368)
als `7d398ee914f1b713e6beccb930789846f657dedd` gemergt. Production
`dpl_4GfisCLE2JGCf1ZRQyoBX9HC8gLv` READY13:40:33UTC; keine error/fatal-Logs
bis13:40:50UTC. [Nurleseplan36245970734](https://github.com/ernisch/helmut-pilot/actions/runs/36245970734)
bestanden. [Einmalauftrag36246123158](https://github.com/ernisch/helmut-pilot/actions/runs/36246123158)
13:43:55–13:44:48UTC **gescheitert**:2 Aufrufe/0,009837USD, kein Tagessatz,
Quittung `lage-mandatsauswahl-20260926-a` terminal gestoppt und verbraucht.
Nachlesung13:47:21UTC:500/0, Profil-/Identitätshashes gleich,0 Jobs/Sperren/
Leases/offene Kosten, Tagesbuch0,320687USD, Tagesriegel4USD.

Entwurf und Review vollständig unabhängig gelesen: Der Entwurf wählt nun den
amtlichen Bundespolizeigesetz-Absatz mit Haushaltsausschuss und den DLF-Bericht
über EU-Sanktionen mit Auswärtigem Ausschuss. Beide Absätze sind laut Review
vollständig belegt, themenrein und verschieden. Das Review lehnt den zweiten
Profilbezug aber mit der fehlenden Nennung des Auswärtigen Ausschusses im
Artikel ab. Dieser Absatz behauptet keine Handlung dieses Ausschusses.
Fachliche Zuständigkeit und belegpflichtige Akteursrolle werden verwechselt.

Der Prüfauftrag wird deshalb präzisiert: Keine Nachrichtenfakten aus Vorwissen
ergänzen; den konkreten fachlichen Zusammenhang des gewählten vorhandenen
Mandatsfeldes gegen das belegte Sachthema prüfen. Eine ausdrückliche
Ausschussnennung ist für den Themenbezug nicht nötig. Behauptete Beratungen,
Beschlüsse und sonstige Akteursrollen bleiben dagegen vollständig quellenpflichtig.
Fachfremde Bindungen, Erfindungen und unklare Ergebnisse bleiben abgelehnt.
Kein positives Ergebnis wird nachträglich eingesetzt oder hartkodiert.
14 Dokumentbindungsgruppen und27 Vorstartgruppen lokal bestanden.

Genau ein neuer Nachweis `zustaendigkeit`, Quittung
`lage-zustaendigkeit-20260926-a`, ist an den terminalen Vorlauf36246123158/7d398ee9
gebunden. Gleiches unverändertes Profil, identischer amtlicher Artikelstand,
maximal2 Aufrufe/240 Sekunden/0,50USD. Wirkung/Risiko/Nachkontrolle/Rückweg wie
oben; alle500 inaktiv, alte Belege erhalten. Frischer Kosten- und Nurleseplan
am geprüften neuen main/READY vor Ausführung. Noch nicht ausgeführt.

## Begrenzter Nachweis nach begründeter Generatorauswahl

Der Generator verwendete bisher `strict:false` und Reasoning `minimal`; der
unabhängige Reviewer bereits `strict:true`/`low`. Die neue Codegrundlage stellt
gezielt den Generator auf `strict:true`/`low`. Vor Mandatswert und Absatz steht
eine private kurze Auswahlbegründung. Nichtleer, maximal800 Zeichen und exakter
Mandatswert werden vor dem zweiten Aufruf geprüft. Das belegt noch keine
fachliche Richtigkeit: die unabhängige Prüfung sieht diese Begründung nicht und
bleibt zuständig. Öffentlich gespeicherte Absätze enthalten sie nicht.

Nur das gesendete Azure-Generatorschema entfernt nicht unterstützte Array-
Längenschlüssel; serverseitig bleiben2–4 Absätze Pflicht. Modell,3000 Ausgabetokens,
Kostenpreise/Reserve, Quellenbindung und Profilbehandlung bleiben unverändert.

Eigener einmaliger Auftrag `lage-auswahlbegruendung-20260926-a`: genau dasselbe
inaktive Profil, maximal2 Aufrufe/0,50USD/240s, technischer Tagesriegel4USD.
Voraussetzung sind sowohl der bestandene Vierfallnachweis als auch exakt die
verbrauchte gescheiterte Generatorquittung36250788961/1d24245e. Beide werden nur
gelesen. Zuerst Nurleseplan; vor Bezahlung kumulative Kosten frisch prüfen.
Erfolg verlangt vollständige unabhängige Quellen-/Mandats-/Paarprüfung,
Speicherung und Nachlesung. Bei Fehler stoppen, keine automatische Wiederholung.
Risiko bleibt ein falscher oder unvollständiger Modelltext; dieser darf nicht als
Erfolg gespeichert werden. Nachkontrolle: vollständiger Text samt Belegen,
Quittung, Kosten, Sperren und Profilhashes. Profil bleibt inaktiv. Bei ungültigem
Ergebnis gibt es keinen Tagessatz zum Zurücksetzen; private Belege bleiben erhalten.
Kein500er Nachweis. Lokal29 Transport-/Kostenfälle und32 Vorstartgruppen grün.

## Neuer Befund: Generatorbindung richtig, Review falsch negativ

PR619/`c4cd05f3ff94776ee4dd5be5810b54192795a00d`, Pflicht-CI36251865384 grün,
Vercel`dpl_2FyQdfW27TUw9zEfEswPQGHzyUR6` READY15:36:30UTC. Fehlerprotokoll bis
15:36:48UTC ohne Treffer. Nurleseplan36252553381 bestanden. Einmallauf36252632130
15:38:36–15:39:25UTC fachlich gestoppt,2 Aufrufe/0,011129USD, kein Tagessatz.
Quittung`lage-auswahlbegruendung-20260926-a` verbraucht.15:40:32UTC500/0,
Profil-/Identitätshashes gleich,0 offene Kosten/Jobs/Locks/Leases.

Beide Generatorabsätze verwenden diesmal passende Mandatsfelder: amtlicher
Finanzbericht zum Bundespolizeigesetz → Haushaltsausschuss; Tagesschau-Bericht
über EU-Russlandsanktionen → Auswärtiger Ausschuss. Beide Quellen-/Faktenurteile
und der Paarvergleich sind positiv. Der Reviewer lehnt aber den zweiten Bezug
mit der fehlenden ausdrücklichen Ausschussnennung ab. Das widerspricht der
bereits geltenden Trennung zwischen fachlichem Bezug und behaupteter
Akteursrolle. Der frühere Vierfall-Erfolg belegt keine allgemeine Zuverlässigkeit.

## Isolierter Vergleich des Prüfaufwands

Eigener Auftrag`lage-pruefaufwand-20260926-a`, ausschließlich nach exakt obiger
verbrauchter Quittung. Vier vorab festgelegte Sollfälle: die beiden echten neuen
Absätze ohne private Generatorbegründung sowie die bisherigen Negativfälle
private Heizkosten→Haushaltsausschuss und Energiesteuer→Auswärtiger Ausschuss.
Erwartungtrue,true,false,false bleibt außerhalb des Modellprompts. Vollständige
Quellenhashbindung,4 Einzelurteile und6 Paarurteile; ein falsches, fehlendes oder
bloß technisch negatives Ergebnis gilt nicht als bestanden.

Nur dieser Diagnoseauftrag verwendet gpt-5-mini mit Reasoning`medium` statt`low`.
Produktgenerator und normaler Reviewer ändern sich dadurch nicht. Derselbe
strenge Prompt, dasselbe Schema, maximal3000 Ausgabetokens,1 Aufruf/0,25USD/240s,
4USD-Tagesriegel und Reserve unverändert. Genau ein vorhandenes inaktives Profil,
keine Aktivierung, keine Veröffentlichung, keine Wiederholung. Ein Mehrverbrauch
oder unvollständiger Modellausgang bleibt Fehler. Kosten vor Ausführung frisch
gegen den kumulativen Auftragsrahmen prüfen. Nachlesen: vollständige private
Quittung, alle4 fachlichen Urteile/6 Paare, Kosten, Sperren und unveränderte
Profile sowie unveränderter Textcache. Kein gespeicherter Text zum Zurücksetzen;
Belege bleiben erhalten.9 lokale Schutzprüfgruppen bestanden; Production offen.

PR621/`61d4772f4116dd04d07ab699cc60fa94daa9736a`, beide Pflichtprüfungen
in36253277208 grün, Vercel`dpl_74RhUNtApXiBnBaxE8J7ednfXLSo` READY16:01:12UTC.
Fehlerprotokoll bis16:04:09UTC ohne Treffer.16:04:17UTC500/0, Profil-/Identitäts-
hashes gleich,0 offene Kosten/Jobs/Locks/Leases. Nurleseplan36254153879 bestanden.
Konservativ3,384415USD kumulativ, einschließlich vollem0,25USD-Rahmen unter4USD.
Isolierter Vergleich36254207276 gestartet; Ergebnis noch offen.

## Transportfehler im Diagnoseauftrag belegt

Run36254207276 endete16:06:07UTC gestoppt:1 Aufruf/0,005823USD, keine offenen
Kosten, Profilbestand und Tagessatz unverändert. Beide positiven Mandatsfälle
akzeptiert; private Heizkosten fälschlich akzeptiert, Energiesteuer fachlich
abgelehnt, aber zusätzlich fälschlich als Themenvermischung bewertet.
Kein Vierfallerfolg und keine Veröffentlichung.

Wichtig: Die Quittung nennt den angeforderten Wert`medium`; tatsächlich hat
`ai.js` am Runtime61d4772f jeden Wert außer`low` als`minimal` gesendet.
Der Lauf belegt daher KEINEN Vergleich mit mittlerem Denkaufwand. Die Korrektur
erhält nun ausdrücklich`minimal/low/medium`, alle übrigen Werte fallen wie
bisher auf`minimal` zurück. Normale Generator-/Reviewaufrufe bleiben`low`.
Der echte lokale HTTPS-Mock bestätigt10 Transportaussagen; dieselbe
Serialisierung wird im gesperrten Offline-Umfeld direkt an`https.request` geprüft.

Neuer einmaliger Auftrag`lage-pruefaufwand-20260926-b`, weiterhin1 Aufruf,
0,25USD/240s/3000 Ausgabetokens, unveränderte Preise/Reserve/4USD-Riegel.
Er verlangt zusätzlich exakt die unveränderte verbrauchte Quittung a samt
Antwort-Hash. Identische vier Quellen, Absätze und vorab definierte Sollurteile;
keine alten Aufträge wiederverwenden. Vor Ausführung neuer Nurleseplan und
frischer kumulativer Kostenstand. Gleiche Nachkontrolle/Rückweg wie oben.
10 Vertragsgruppen und32 bestehende Vorstartgruppen grün. Production offen.
