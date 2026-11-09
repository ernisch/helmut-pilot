# Kundenfehler: fehlende Tagesorientierung, 09.11.2026

Status: Entwicklung und isolierte Ausgabeprüfung; kein Merge, Rollout oder Produktionslauf.
Eigener Branch `codex/briefing-tagesorientierung-20261109`, Basis `e8a4b08b`.

## Schnittstellenvereinbarung zur Abstimmung mit PR1115

Geprüfter Quellensprint: PR1115, Kopf `f82fc5616948cadd5bb4be6215c4e826a13fb875`,
34 geänderte Dateien. Quellenbeschaffung, Speicherung, Queue und Understanding
bleiben vollständig dort. Dieser Branch ändert nur Briefingauswahl, Anzeige und
deren Tests. Keine Änderungen an `storage.js`, `quellen-auszug.js`,
`lage-quellenbeleg.js`, `dedup.js` oder den Artikelkontext-/Queuepfaden.

Die bestehende Grenze bleibt `getPruefSourcesByVorgaenge(kos)` →
`sourcesByVorgang[vorgang_id]`: gespeicherte Dokumente mit id, Artikel-URL,
unverändertem Publikationsdatum und geprüftem summary/Artikelkontext. Vorwahl
verwendet bereits geladene verstandene KOs; Originalbeleg und Profilbezug werden
danach im vorhandenen Ausgabeweg geprüft. Keine neue DB-Spalte oder RPC,
keine Schreibwirkung, kein Abruf und kein Modellaufruf.

Gemeinsame Dateien, eng begrenzte vorgeschlagene Schreibbereiche:

- `vercel.json`: Dieser Branch ergänzt ausschließlich
  `git.deploymentEnabled["codex/briefing-tagesorientierung-20261109"] = false`.
  PR1115 behält seinen eigenen Branchschlüssel. Beide Schlüssel müssen im
  zusammengeführten Stand vorhanden sein; keine anderen Konfigurationswerte ändern.
- `docs/CURRENT_STATE.md`: ein eigener kurzer Hinweis mit Link zu diesem Bericht;
  vorhandene Einleitung nur sprachlich gekürzt, um das30.000-Zeichenlimit einzuhalten.
  Der Quellenstatus aus PR1115 wird nicht ersetzt oder umformuliert.

Vor einem späteren Merge: aktuelle Köpfe erneut abgleichen, beide Änderungen in
einem isolierten Integrationsworktree zusammenführen und genau die Übergabe
gespeicherter Originaltexte → Auswahl → sichtbare Ausgabe prüfen. Abweichende
Quellenformate oder spätere gemeinsame Runtimeänderungen erst konkret abstimmen.
Diese Vorlage ist keine behauptete Zustimmung des parallelen Bearbeiters.
Merge und Rollout bleiben getrennte Entscheidungen; keine Productionfreigabe.

## Nachgewiesener Ausgangszustand

Nativ gelesen: Mandatsbriefing vom09.11.2026,05:15:36.307UTC,
`emptyState.kind=quiet`, `briefing-ohne-tagesanlass`,49 Entscheidungen,
47 ignoriert,2 beobachten; Lage mit2 Absätzen. Dieselben49 Vorgänge und dieselbe
Bilanz werden im unveränderten Ausgabeweg auf Basis des gespeicherten Bestands
offline reproduziert. Eine Bilanz ist keine fachliche Abnahme.

Private Aufnahme außerhalb Git: `/workspace/briefing-evidence-20261109/`.
500 bestehende KOs aus dem normalen Eingabefenster, verknüpfte Originaldokumente
der untersuchten Kandidaten, relationales Profil und die drei gespeicherten
Tagesausgaben. Keine neuen Original-GETs. Die Aufnahme erfolgte nach dem
Morgenlauf; sie ersetzt keinen historischen Snapshot aller Eingaben um05:15UTC.
Die gespeicherte Ausgabesperre trägt einen Hash und eine zurückgehaltene
Publikation. Ihre geheime Konfiguration wurde nicht exportiert. Der Replay
reproduziert die sichtbare49er-Auswahl, ist aber keine neue Production-Abnahme
der Sperrkonfiguration. Die Sperrlogik im Produkt bleibt unangetastet.

## Ursachen und Korrektur

1. **Profilzuordnung/Vorauswahl:** Leere KO-Themenfelder und niedrige
   Ähnlichkeitsscores lassen fachlich passende Originale vor der Ausgabeprüfung
   entfallen. Die Nachbesserungen zur Pflegereform liegen außerhalb Top50.
   Die bisherige Ergänzung erfasst nur heutige KO-/Quellenanlässe.
   Begrenzte Vorwahl aus dem bestehenden Scan hält passende Verfahrenskandidaten
   bis zur Originalprüfung erreichbar. Die gespeicherten Scores bleiben unverändert.
2. **Auswahl/Zeitbezug:** Der bisherige Tagesvertrag akzeptiert nur neue Quellen
   im Briefingfenster oder heutige Fristen. Nun kann eine quellenbestätigte
   kommende Frist/ein datierter Verfahrensschritt Vorbereitung tragen; eine
   aktuelle Ankündigung ohne bestätigten Folgestand trägt ausschließlich eine
   Prüfempfehlung. Kein behaupteter Abschluss, Termin oder fortdauernder offener
   Zustand. Konservatives Fenster: sieben Tage für Quelle/Vorbereitung;
   unklare relative Termine und Uhrzeiten bleiben ausgeschlossen.
3. **Darstellung:** Nach Entfernung unbelegter KO-Empfehlungen gelten manche
   Vorgänge als `empty`, obwohl ein belegter Prüfauftrag möglich ist.
   Der neue belegte Auftrag ist `partial`, sein älterer Quellenstand weiterhin
   `stale`/„Weiterhin relevant“. Er erhält keine Dringlichkeitsstufe und keine
   erfundenen Risiko-/Chancentexte. Die Anzeige zeigt Vorbereitung, Auftrag,
   konkreten Originalauszug und Originalverweis; keine Lagekopie oder umbenannte Leerkarte.

## Kandidatenbefund

| Kandidat | Profil und Inhalt | Warum bisher keine Ausgabe / verbleibende Grenze |
| --- | --- | --- |
| Pflegereform: angekündigte Nachbesserungen | Fachaufgabe/Schwerpunkt Pflege durch gespeicherten RND-Originalsatz bestätigt | Außerhalb Top50, keine heutige Quelle/Frist, bereinigte KO-Empfehlungen leer. Nun konkrete Prüfung des Folgestands; Termin und Umsetzung bleiben unbekannt. |
| Pflegegesetz/Sparpaket | Pflegebezug, gespeicherter NDR-Auszug vom05.11. | Niedriger Score und alter Quellenstand. Auszug belegt Kritik, aber keinen konkreten weiteren Schritt oder offene Handlung. Bleibt Lage; kein NDR-Abruf nötig. |
| Niedrigschwellige Pflegehilfe, Bundestag1231768 | Pflegebezug, amtlicher Kurztext vom06.11. | Außerhalb Top50; vorhandene Empfehlung richtet sich an Kommunen/Ministerien. Kurztext belegt weder Maßnahmenplan noch eigene heutige Handlung. Fehlender Originalabsatz bleibt Inhaltslücke. |
| Nachbarschaftshilfe, Sekundärmeldung08.11. | Pflegebezug im Titel | Heute ergänzter Kandidat, niedriger Score; Originalauszug fehlt. Keine Übernahme unbelegter Empfehlungen oder zusätzliche Lagekopie. |
| Anhörungen09.–13.11. | Gespeicherter Plan nennt Verteidigung und Bildung | Auszug endet abgeschnitten; kein belegter Termin im persönlichen Fachausschuss. Allgemeine Sitzungswoche ist kein persönlicher Vorbereitungsauftrag. |
| BMWE/BMAS-Dialogrunden | Gewerkschafts-/Fachbezug vorhanden | Einladung ohne belegten bevorstehenden Termin; gespeicherte Aufgaben richten sich an Ministerien. Nicht als Mandatsaufgabe ausgeben. |
| Chemieindustrie/12-Punkte-Plan | Potenzieller Industrie-/Beschäftigtenbezug | Nur Titel, kein gespeicherter Originalauszug. Keine sichere Handlungsableitung. |
| Gemischte Gesundheits-/Verteidigungsinitiativen | Partei-/Fachtreffer möglich | Unterschiedliche Artikel/Ereignisse: vorhandene Quellenreinheitsprüfung sperrt die gemeinsame Ausgabe. Bleibt beim Quellensprint. |
| Zwei beobachtete Altvorgänge (Solidarprinzip/Berlin-Sondierung) | Bestehende Bewertungsmerkmale | Kein im heutigen Bestand belegter aktueller Verfahrensauftrag. Die Zahl „2 beobachten“ beweist keinen Tagesnutzen. |

## Isolierte Kundenausgabe

**Pflegereform: Nachbesserungen angekündigt**

„Prüfen Sie, ob die angekündigten Nachbesserungen inzwischen vorliegen, und halten
Sie die offenen Punkte für die weitere Beratung fest.“

Begründung: Fachaufgabe Pflege; gespeicherte Ankündigung vom06.11.2026.
Termin und inzwischen erfolgte Umsetzung sind im gespeicherten Beleg nicht bestätigt.
Originalquelle ist exakt der gebundene RND-Artikel, Quellenstand06.11.2026,04:57 Berlin.
Keine Behauptung einer neuen Meldung am09.11. oder sofortigen Handlungsdringlichkeit.

## Prüfung und Freigabe

Gezielte Nachweise und die lokale Integration werden vor Abschluss hier ergänzt.
Production ist unverändert. Ein späterer Rollout wirkt erst im regulären
Morgenlauf auf das neu gespeicherte Briefing; bestehende Briefings werden nicht
manuell ersetzt. Abschließend sind die gespeicherte Ausgabe, ihr Originalbezug
und die tatsächliche Kundendarstellung rein lesend zu prüfen. Kein zusätzlicher
Modelltest oder manuelle Verarbeitung ist Bestandteil dieser Vorlage.

Rückweg: ausschließlich diese Codeänderungen zurücknehmen; Originale, Profil,
Quellenkonfiguration, Queue und Understanding unangetastet lassen.
