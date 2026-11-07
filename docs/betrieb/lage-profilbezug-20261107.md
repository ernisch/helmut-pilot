# Profilbezogene Lageauswahl — 07.11.2026

Entwicklungsstand auf `codex/profilbezogene-lageauswahl-20261107`, Basis
`4c361260`. Geprüfte Entwicklung; kein Merge, Deployment, Profilwechsel,
Production-Schreiben, Modelltest oder Belastungstest. Der zugehörige PR enthält
Commitbindung und Pflicht-CI. Nächster Schritt nach grüner CI: konkrete
Merge-/Production-Freigabe für diesen PR.

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
Arbeitsbranches. Rückweg nach einem gesondert erlaubten Rollout: gezielter
Revert der beiden Runtime-Dateien oder vorheriges freigegebenes Deployment;
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

Lokaler Vergleich 16:11:23 UTC: unverändertes `buildLageBriefing` aus main
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

Alle Testläufe über `scripts/lokal.js`, keine Production-Kennung im Kindprozess.

- Neue `scripts/lage-profilbezug-test.js`: **20/20 Gruppen**. Darunter
  echte `cacheOnly`-/`countOnly`-Ausgabe, Kandidat hinter zwölf Fehlkandidaten,
  Teilmatcher-Verlust, echtes altes Matchschema mit anderer KO-Version,
  Profil-/KO-Cachewechsel, Mandantentrennung, einzelner falscher Quellenbeleg,
  Quellenmix, leeres Profil und Mehrdeutigkeiten.
- Gezielte Lage-Regression `--extended --only lage-`: **35/35 Suiten**.
  Neun alte Testprofile/-sachverhalte fachlich präzisiert statt Quellen-,
  Frische-, Cache- oder Schreibprüfungen abzuschwächen.
- Nach zusätzlicher KO-Versionsbindung: neue 20/20 Gruppen und vorhandene
  **141/141 Lage-Assertions** erneut gezielt bestanden.
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
Production-Datenänderung. Merge und Deployment benötigen konkrete Freigabe.
