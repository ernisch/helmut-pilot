# Profilbezogene Lageauswahl — 07.11.2026

**Status: gemergt, auf Production READY und Auslieferung lesend nachkontrolliert.**
[PR #1100](https://github.com/ernisch/helmut-pilot/pull/1100) nach ausdrücklicher
Betreiberfreigabe auf `d96518613190f8d294f2f4279218cb18022c86f8` gemergt.
Geprüfter Kopf `c4caf031`; beide Pflichtchecks im
[CI-Lauf42409807375](https://github.com/ernisch/helmut-pilot/actions/runs/42409807375)
erfolgreich. Deployment `dpl_FiKvxLgEwZ1prPeg3Nfc6NUFYkuS` ist READY,
Target Production, auf demselben Merge. Keine Livefachabnahme daraus ableiten.
Entwicklungsbasis `4c361260`, Erstimplementierung `95b1e986`; die folgenden
Entwicklungs-/Zwischenbelege bleiben als zeitlich abgegrenzte Nachweise erhalten.

## Mergeabschluss und lesende Nachkontrolle

Vor dem Merge wurde am07.11.2026,20:52:17UTC nativ gelesen:
0 laufende `process_runs`,0 aktive `pipeline_locks`. Der geprüfte Runtimekopf
`c4caf031` ist zum Merge bytegleich; keine zusätzliche Runtimekorrektur beim Merge.
Das READY-Deployment ist unter
`helmut-pilot-qlv0843jw-nohut.vercel.app` identifiziert; Vercel bestätigt den
regulären Alias `helmut-pilot.vercel.app` auf diesem Deployment und Mergecommit.
Lesende Nachkontrolle am07.11.2026:

- Hauptdomain um20:53:51UTC: GET HTTP200; HTML referenziert
  `client.js?v=d9651861` und `styles.css?v=d9651861`.
- `/api/release/public` um20:53:44UTC: GET HTTP200 mit
  `ok:true`, `ready:true`, `storage:true`.
- Deploymentgebundene Runtime-Logzählung von20:52:34UTC bis zur Abfrage
  um20:53:56UTC: keine `error`-/`fatal`-Einträge. Das ist ein begrenztes
  Beobachtungsfenster und kein umfassender Funktionsnachweis.

Kein authentifizierter Production-Klicktest und keine erneute Livefach- oder
Frischeabnahme. Kein zusätzlicher Modellaufruf; Daten, Flags, Cron und Budgets
wurden durch diesen Rolloutauftrag nicht geändert. Der nächste fachliche Schritt
ist die rein lesende Abnahme der Lage nach dem nächsten regulären autorisierten
Lauf; dafür keinen zusätzlichen Lauf starten.

Konkreter Rückweg bei einer gesondert freigegebenen Rücknahme: vorheriges
READY-Deployment `dpl_Axr6qtkWQLnJjDjEWiWE7U9MDmnn` auf `778c289b`
oder gezielter Code-Revert. Keine Datenrücknahme erforderlich. Der Mergeauftrag
enthält keine neue Production-Datenmutation, Profilaktivierung, Migration,
Schalteraktivierung, Budgetänderung oder bezahlten Modelltest.

## Ursache und aktueller Abgleich

Die übergebene Diagnose auf `352982ff` bleibt gültig: Diff bis `4c361260`
für `lage.js`, `lage-quellenauswahl.js`, `matching.js` und
`matching-erklaerung.js` leer. Gespeicherte Matches wurden vorzeitig auf zwölf
begrenzt, lokale Vektortreffer ergänzt und notfalls allgemeine verstandene
Vorgänge aufgenommen. Wortbezug bevorzugte Kandidaten, verbot fachfremde
Aufnahmen aber nicht. `aktuell=true` prüfte weder heutigen Profilinhalt noch
KO-Version. Die historische Diagnose von zwölf Karten ist übernommen; die
behauptete Browseransicht mit zehn Karten wurde hier nicht bestätigt.

Start-/Endabgleich: main `4c361260`; offene PRs #1087, #969, #811, #771.
PR #969 betrifft Artikelstandtage im Briefing und einen Datenbanktest, nicht
unsere Auswahlkorrektur. Neu gemergte Quellenarbeit #1098/#1099 bleibt erhalten.
Keine fremden Worktrees oder relevanten lokalen Fachprozesse beim Start;
unversioniertes `supabase/.temp/` unangetastet.

## Kleinste fachliche Korrektur

Nur zwei Runtime-Dateien: neue persönliche Aufnahmeprüfung in
`lib/helmut/lage-profilbezug.js`, Anschluss im bestehenden `lage.js`.

- Fachliche Zulassung im begrenzten Kandidatenpool vor Matching, Scoring und
  endgültigem Zwölferlimit. Keine Mindestmenge oder fachfremde Ersatzliste.
- Kriterien kommen aus dem jeweiligen aktuellen gespeicherten Profil:
  Berichterstatteraufgabe 100, Hauptzuständigkeit 80, Fachthema 75,
  konkreter Wahlkreis 70, nachvollziehbare indirekte Industriewirkung 60,
  Stellvertretung 50, regionales Fachinteresse 45, Bundesland 30.
  Diese Gewichte bestimmen die Reihenfolge; sie sind keine semantische
  Wahrscheinlichkeit oder absolute Ähnlichkeitsschwelle.
- Energiepreise bleiben bei Industriearbeitsplätzen erhalten, wenn dasselbe
  Sachfeld auch eine industrielle Betroffenheit benennt. Beide Enden sind nötig.
- Kein Bezug allein aus Partei, allgemeiner Wichtigkeit, Empfehlung oder alter
  Relevanzprosa. Mehrdeutigkeiten wie wissenschaftliche „Arbeit“, „beschäftigt
  sich“, Handytarife und Pflege von Parkanlagen/Software tragen keine Aufnahme.
- Alte Matchzeilen liefern ausschließlich Kandidatenkennungen zum gezielten
  Nachladen. Rang und Erklärung werden nicht wiederverwendet. Aufnahme und
  persönliche Erklärung werden am aktuellen KO und Profil neu entschieden,
  auch bei fehlender oder alter Profil-/KO-Versionsmetadatenbindung. Die
  mandantenbezogene Lesung bleibt bestehen; fremde Mandantenzeilen werden ignoriert.
- Technische Vektorähnlichkeit darf bereits fachlich zugelassene Kandidaten
  nicht erneut entfernen. Nur passende Restkandidaten werden ergänzt.
- Nach den bestehenden Quellenmix-/Sicherheitsprüfungen muss derselbe
  Profilgrund zusätzlich in geladenem Quellentitel oder verwendbarem Auszug
  vorkommen. Nur bestätigte Gründe gelangen in die persönliche Erklärung;
  eine einzelne fachfremde Quelle genügt nicht. Kein zusätzlicher Quellenabruf.
- Lage-Cache bindet jetzt fachlichen Profilkontext und KO-Version; eine
  unveränderte Vorgangsmenge erlaubt keine alten persönlichen Absätze nach
  Profiländerung. Explizit gebundene historische Eingaben behalten ihren
  vorhandenen eigenen Vertrag und werden nicht neu interpretiert.

Globale Wissensobjekte, Artikelanalysen, Quellenverarbeitung, Aktualitätsfenster,
Mandantenspeicher und Flags werden nicht verändert. Persönliche Daten entstehen
nur in Antwortkopien. `vercel.json` sperrt automatische Deployments dieses
Arbeitsbranches. Rückweg nach dem erlaubten Rollout: gezielter
Revert der beiden Runtime-Dateien oder das oben benannte vorherige Deployment;
keine Datenrücknahme nötig. Ein neuer Regelstand leert bestehende Narrativcaches
bis zum nächsten regulär autorisierten Lauf; der lesende App-Start erzeugt keine KI.

## Belegte Vorher-/Nachherwirkung

Cems fachliche Profilfelder wurden am 07.11., 15:59:45 UTC ausschließlich über
`storage.getProfileFromDb('cem-ince')` gelesen. Unter anderem ordentlich
Arbeit/Soziales, stellvertretend Wirtschaft/Energie und Digitales/Staatsmodernisierung,
Industriearbeitsplätze, Berichterstatterthemen Arbeit/Soziales und
Salzgitter-Wolfenbüttel/Niedersachsen. Hash des vom Gate verwendeten Kontextes:
`75812b5ae52b15406b413f3fffae908bbfd69648c0e9c2554b2be3b6d00d4b3b`.
Kein Profil geändert oder aktiviert; Originalprojektion bleibt privat.

Lokaler Vergleich 16:11:23 UTC, nach letzter Korrektur um 17:20:05 UTC mit identischer Bilanz bestätigt: unverändertes `buildLageBriefing` aus main
gegen den korrigierten Einstieg, jeweils `cacheOnly:true`, derselbe aktuelle
Profilkontext und **synthetische Artikel**. Speichergrenze ersetzt,
Modell-/Schreibgrenzen gesperrt. Kein Vergleich heutiger Production-Karten.

| Profil / lokale Artikelmenge | Vorher | Nachher | Wichtige Solltreffer verloren |
| --- | ---: | ---: | ---: |
| Aktuelles Cem-Profil, sechs passende + sechs unpassende Fälle | 12 | 6 | 0 von 6 |
| Bundestag Gesundheit/Pflege, drei verschiedene Fachthemen | 3 | 1 | 0 von 1 |
| Berlin Wohnen/Mietrecht, dieselben drei Themen | 3 | 1 | 0 von 1 |
| Brandenburg Landwirtschaft, dieselben drei Themen | 3 | 1 | 0 von 1 |

Die sechs Cem-Sollfälle: Tariftreue/Tarifbindung, industrielle Arbeitsplätze,
Energiepreise mit Industriewirkung, digitale Staatsmodernisierung, konkrete
Bahnverbindung in Salzgitter und Betriebsratswahlen. Entfernt: bloße
Parteispitze, allgemeines Reformpaket, wissenschaftliche „Arbeit“, privater
Öl-/Heizkostenbericht ohne weitere Zuständigkeit, Kunstausstellung und Sternwarte
mit ausschließlich passender alter Wichtigkeits-/Empfehlungsprosa.

Zusätzlich vorhandener historischer 14er-Digital-Korpus:
Der fachlich passende Digitalvorgang auf Vektorrang 14 erreicht weiterhin die
Auswahl; die Liste wird nicht mehr mit unpassenden Vorgängen auf zwölf gefüllt.

## Prüfungen und Gegenprüfung

### Nachprüfung: verlorene Windenergieanhörung auf `ba244d42`

Die unabhängige Gegenprüfung meldete einen echten Sollverlust:
`vg-infrastrukturbeschleunig-20261028-7081d4` wurde trotz ausdrücklich genannter
Stellvertretung abgelehnt. Der neue Originalfall scheitert auf `ba244d42`
reproduzierbar mit `passt:false`. Ursache: Bei bekannter Fachwortliste lief die
zusätzliche direkte Ausschusserkennung nur, wenn diese Liste **nicht** existierte.
„Windenergie auf See“ ist kein Eintrag der begrenzten Wirtschaftsliste.
Die bisherige Nullverlust-Bilanz gilt ausschließlich für den bezeichneten
synthetischen Korpus und hat diesen Bestandsverlust nicht ausgeschlossen.

Die Korrektur ergänzt die ausdrücklich gespeicherte Ausschussbezeichnung als
additiven Nachweis, unabhängig vom Vorhandensein einer Fachwortliste. Der Name
muss zusammenhängend im fachlichen Sachtext stehen, einschließlich
institutionellem „Ausschuss“; Kurzbezeichnungen und Genitiv „Ausschusses“ werden
unterstützt. Gemeinsame Wörter wie „Wirtschaft und Energie“ ohne Ausschuss
oder private „Haushalte“ genügen nicht. Die identische Prüfung läuft erneut
an der verknüpften Originalquelle. Hauptzuständigkeit bleibt 80,
Stellvertretung 50. Regelversion 2 invalidiert persönliche Narrativcaches.
Keine Erweiterung der Energiewortliste oder Änderung der Quellenpipeline.

Die neue Fixture `scripts/fixtures/lage-windenergie-original-20261107.json`
enthält eine minimale Nachherprojektion aus den bereits vorhandenen, ausgeführten
Quellenkorrekturbelegen samt nativem Rücklesezeitpunkt, Quellenkante, Dokument-/
Zeilenhashes und Originalauszug. Kein neuer Datenbankabruf. Beide fachlichen
Texte benennen „Ausschuss für Wirtschaft und Energie“. Die Profilprojektion
enthält nur die vorher gelesenen Ausschussfelder. Der fehlende originale
Quellenzeitstempel bleibt unbekannt; ausschließlich im isolierten Ausgabetest
wird `published_at` lokal frisch gesetzt. Sachtext und Auszug bleiben original.
Das belegt die fachliche Aufnahme im Ausgabepfad, keine heutige Live-Frische.

| Fall | Auf `ba244d42` | Mit Korrektur |
| --- | --- | --- |
| Originale Windenergieanhörung | fachlich abgelehnt | zugelassen; Originalauszug bestätigt Stellvertretung; 1 Karte im echten `buildLageBriefing(cacheOnly)` |
| Lokale Anhörungen zu Windenergie, Photovoltaik, Batteriespeichern mit ausdrücklichem Ausschuss | kein Fachwortanker | 3/3 Karten; Stellvertretung 50, Hauptzuständigkeit 80 |
| Wirtschaft/Energie ohne Ausschuss, fremder Ausschuss, verlängertes anderes Ausschusswort, Sport-Wind | kein tragfähiger Grund | weiterhin 0/4 fachliche Aufnahmen |
| Passendes KO mit fachfremdem Auszug | kein belegbarer Grund | 0 Karten |
| Historischer Verteidigungsteil unter korrigiertem Windenergieauszug | kein aktueller Nachweis | weiterhin kein Verteidigungsbezug |

Ergänzte Prüfung: **24/24 Fachgruppen** bestanden, einschließlich sämtlicher
bisheriger Negativfälle und indirekter Industrieenergiefolgen. Die sechs
bisherigen wichtigen synthetischen Treffer bleiben 6/6 erhalten; der ergänzte
Original-Solltreffer wechselt von verloren zu erhalten. Das ist keine vollständige
Recallmessung des realen Bestands. Erneute gezielte Lage-Regression:
**35/35 Suiten** grün. Unabhängiger OpenAI-Delta-Review mit acht lokalen Probes
bestätigt Originalfall, Kurzform, Genitiv, getrennte Hauptrolle sowie Ablehnung
verstreuter Wörter, fremder Quelle und fremden Ausschusses; kein konkreter
neuer Blocker. Aliasgrenze: gespeichertes „Wirtschaftsausschuss“ wird nicht
automatisch in „Ausschuss für Wirtschaft und Energie“ umgedeutet. Diese
allgemeine Namensauflösung bleibt außerhalb der kleinsten Korrektur.
Pflicht-CI auf dem ergänzten Kopf `c4caf031` ist im Lauf `42409807375`
erfolgreich. Der frühere grüne Lauf `42395965284` gehört ausschließlich zu
`ba244d42` und ersetzt diesen Endkopfbeleg nicht.

### Frühere Prüfbelege

Alle Testläufe über `scripts/lokal.js`, keine Production-Kennung im Kindprozess.

- Neue `scripts/lage-profilbezug-test.js`: **21/21 Gruppen**. Darunter
  echte `cacheOnly`-/`countOnly`-Ausgabe, Kandidat hinter zwölf Fehlkandidaten,
  Teilmatcher-Verlust, echtes altes Matchschema mit anderer KO-Version,
  Profil-/KO-Cachewechsel, Mandantentrennung, einzelner falscher Quellenbeleg,
  Quellenmix, leeres Profil und Mehrdeutigkeiten.
- Gezielte Lage-Regression `--extended --only lage-`: **35/35 Suiten**.
  Neun alte Testprofile/-sachverhalte fachlich präzisiert statt Quellen-,
  Frische-, Cache- oder Schreibprüfungen abzuschwächen.
- Nach zusätzlicher KO-Versionsbindung: neue 21/21 Gruppen und vorhandene
  **141/141 Lage-Assertions** erneut gezielt bestanden.
- Erweiterte Vertragsanpassung: sechs weitere Matching-/Scoring-/Scan-/Tenant-
  Suiten **245/245 Prüfungen**. Die alten Anforderungen an leere Profile,
  unveränderte Altmatchtexte und fachfremde Füllkarten wurden durch heutige
  fachliche Aufnahme ersetzt; Schreibpfad- und Sicherheitsverträge bleiben.
  Vorhandene Endwege: Bundestag **97/97**, Berlin **79/79**, Brandenburg
  **105/105**, Veröffentlichungssperren **12/12**. Fachliche Hauptaufgabe und
  institutionelle Mitgliedschaft bleiben bei länderübergreifenden Themen getrennt.
- Pflicht-CI `42390865223` scheiterte zuerst in der unveränderten synthetischen
  Kandidatenprüfung: sie verlangte nur Berliner Quellen. Der neue fachliche
  Auswahlvertrag erhält auch passende überregionale Themen. Nur diese
  Kandidatenerwartung angepasst: eigene regionale Belege müssen erhalten sein,
  sämtliche Kandidaten müssen Profilthemen tragen. Unverändert geprüft bleiben
  die tatsächlichen beiden Entwurfs-/Reviewabsätze gegen Region/Bundesebene
  und die explizite negative Fremdlandprobe. Danach **42/42 synthetische
  Vertragsgruppen** grün; kein nativer oder vollständiger Mock100-Lauf.
- Pflicht-CI `42391362660`: alle vorgelagerten isolierten Datenbanknachweise
  bestanden, danach **188/189 Standardsuiten** grün. Einziger Fehler:
  `github-quellenkontext-500-test.js` verwendete Profile ohne Fachmerkmale und
  einen nur in `title` (statt `headline`) benannten Pflegevorgang. Ausschließlich
  diese Fixture fachlich konsistent ergänzt; alle bestehenden Budget-, CAS-,
  Konkurrenz-, Frische- und Schreibschutzassertions unverändert. Gezielte
  Wiederprüfung: **13/13 Controllergruppen**, Produktionsquellenpfad unverändert.
- Zusätzliche Gegenprofile Finanzen/Verteidigung: technische Steuerung und
  akademische Dissertationsverteidigung dürfen keine Zuständigkeit vortäuschen.
  Fachanker dafür eingegrenzt; Einkommensteuerreform, höhere Steuern und
  Wehrdienst/Verteidigungspolitik bleiben erhalten. Explizit gespeicherte
  mehrteilige Aufgaben zu Dissertationen oder Parkpflege bleiben trotzdem
  zulässig: der Profilinhalt entscheidet über den Fachkontext, kein globales
  Entfernen dieser Quellthemen. 21/21 neue Gruppen und unabhängiger Delta-Review
  ohne konkrete offene Fehler. Singular-/Pluralbindung bleibt erhalten.
- CI-Versuch `42390396632` vor den langen Folgeschritten bewusst beendet,
  nachdem die lesende Prüfung diese weiteren alten Testannahmen belegt hatte;
  kein grüner Pflichtbeleg. Der finale Pflichtlauf gehört zum aktuellen PR-Kopf.
- Zwei getrennte OpenAI-Helfer prüften Ursachen/Fachfälle und anschließend
  unabhängig die Runtimeänderung. Gefundene Verluste und Falschpositive
  korrigiert; letzter Delta-Review ohne konkrete offene Blocker.
- Ein zunächst zu breit gestarteter lokaler Standardlauf wurde nach
  Port-Sandboxfehlern beendet; er ist kein PASS-Beleg. Der danach gezielt
  ausgeführte Lage-Bereich ist der oben ausgewiesene Nachweis.
- Ein breiter Rohdatenexport wurde durch automatische Freigabeprüfung
  abgelehnt und nicht ausgeführt. Stattdessen nur das einzelne Profil über
  den vorhandenen Anwendungsleser abgerufen; kein Rohartikelbestand exportiert.

## Verbleibende Grenzen

Die deterministischen Fachanker sind eine begrenzte, nachprüfbare Heuristik,
keine vollständige Bedeutungsanalyse. Unbekannte Umschreibungen können passende
Treffer verlieren; neun wichtige Solltreffer ohne Verlust beweisen keine
vollständige Recallquote des realen Artikelbestands. Die bisherige begrenzte
Kandidatenmenge und die Zwölfer-Shortlist vor abschließender Quellenbestätigung
bleiben: späte Quellenablehnung kann weniger Karten ergeben und lädt nicht
unbegrenzt nach. Eine Quelle bestätigt den Profilgrund, nicht automatisch jede
Aussage des KO; vorhandene zusätzliche Aussagen-/Narrativprüfung bleibt nötig.

Aktuelle Production-Auswahl und angemeldete Browseransicht wurden nicht erneut
fachlich abgenommen. Keine neuen aktiven Mandate, keine bezahlten Modelltests,
keine Lasttests, neue Infrastruktur, Migration, Schalteraktivierung oder
Production-Datenänderung durch diesen Auftrag. Merge und reguläres Deployment
sind nach konkreter Freigabe erfolgt; weitere geschützte Aktionen bleiben
separat freizugeben.
