# Profil: Wirkung und Bedienbarkeit geprüft (11.11.2026)

## Ergebnis und Umfang

**Prüfung abgeschlossen; Produkt funktional nur teilweise vollständig.** Das Mandatsprofil
ist an Briefing, Lage, Radar und neue Büroentwürfe angebunden. Die sichtbaren Felder
haben jedoch unterschiedliche Wirkungen; mehrere Eingaben sind ohne aktiven Verbraucher,
und beim Speichern bestehen reproduzierte Fehler. Eine perfekte oder durchgehend einfache
Profilbedienung ist damit nicht belegt.

Geprüfter Code: `68abc505` auf `codex/profil-wirkungscheck-20261111`.
Production-Alias rein lesend: Deployment `dpl_5qWtxBzaVuKeDZcUuSSkXoMwYiJk`, READY,
Git `57b342d60a77845dcfd5d0bff0c4cd32156554b6`. Der Diff bis `68abc505` enthält ausschließlich
Dokumentation. `/client.js` lieferte HTTP200; Reglerschwelle und fehlender Briefingabruf
beim Profilspeichern wurden auch im ausgelieferten Client bestätigt.

Keine echten Profile geändert, keine bezahlten Modellaufrufe und keine neue
Production-Verarbeitung gestartet. Die Anbindung von Angaben an einen Prompt ist ein
Codebeleg, keine Garantie für die Befolgung durch das Modell. Eine authentifizierte
Kundensitzung oder neue KI-Ausgabe wurde nicht geprüft.

## Was tatsächlich nach einer Änderung passiert

1. Beim Verschieben eines Reglers ändert sich zunächst nur die angezeigte Zahl.
   Die mobile Probe änderte Arbeit von 2 auf 5: Anzeige 5, **0 PATCH-Anfragen**, Speicher 2.
2. Erst **„Profil speichern“** sendet das Formular an `PATCH /api/profile/current`.
   Nach erfolgreicher Antwort wird die Profilübersicht gezeigt. Das Profil bekommt
   ein neues `updatedAt`; es startet weder eine Quellensuche noch sofort ein neues Briefing.
3. Briefing/Radar verwenden beim nächsten regulären Datenabruf das neue Profil für
   vorhandenes Wissen. Lagekarten werden beim nächsten Lageabruf neu ausgewählt.
   Das schon geladene Briefing wird durch den Speicherklick nicht neu eingelesen.
4. Lageprosa hängt zusätzlich an ihrem Cache. Im Appstartpfad kann zunächst eine Karte
   ohne neuen Erzähltext erscheinen (`pendingNarrative`). Historische Briefings bleiben
   historische Ausgaben; ihre Profilbindung ist gesondert geprüft.
5. Neue Suchschwerpunkte wirken erst in nachfolgenden regulären Quellenläufen.
   Neue Bürotexte entstehen erst nach ausdrücklicher Formatwahl/Erstellung. Ein
   Profilspeichern erzeugt keinen kostenpflichtigen Bürotext.

Belege: [Regleranzeige](../../../client.js#L10509),
[Formular-Payload und Antwort](../../../client.js#L10608),
[PATCH](../../../server.js#L773), [Speichern](../../../lib/helmut/storage.js#L7669),
[Briefing](../../../server.js#L3591), [Radar](../../../server.js#L3868),
[Lagecache](../../../lib/helmut/lage.js#L736).

## Vollständige Matrix der sichtbaren Profilfelder

„KI-Kontext“ bedeutet: an den aktiven Generator übergeben; die tatsächliche
Textqualität wurde hier nicht mit einem Modell geprüft.

| Feld | Belegte Wirkung | Einschränkung |
| --- | --- | --- |
| Name | Eigenerwähnungen/Matching, Anzeige und KI-Kontext. | Vorhandene Ausgaben werden nicht durch bloßes Editieren neu erzeugt. |
| Partei / Fraktion | Matching, Entscheidungsbonus, Radar mit zusätzlichem Quellenbeleg, Quellenauswahl und Suchanfragen; Lage-/Büro-KI-Kontext. | Keine eigene Parteiaufnahme in die Lage-Vorauswahl; normaler Lagecache bindet diese Felder nicht vollständig. |
| Funktion | Profilanzeige und teilweise allgemeiner Modellkontext. | Im aktiven Büro ausdrücklich aus dem Modellprofil entfernt: Amtsbezeichnung allein belegt keine parlamentarische Zuständigkeit. Feste Optionsliste. |
| Mandatsebene | Parlamentarische Zuständigkeit, Quellenmodule, Lage-/Radarprüfung und Büroformat „Fragen für den Ausschuss“. | Bundesland und Ausschuss müssen dazu passen. Die übrigen Formularlisten folgen der Ebene nicht vollständig. |
| Ausschüsse | Echte Fachaufnahme, Matching, Entscheidungsbonus, Radarprüfung, Quellenpakete und Bürofragen. | **Speicherfehler: Mehrfachauswahl wird auf den ersten Ausschuss reduziert. Letzten Ausschuss abwählen funktioniert ebenfalls nicht.** |
| Themenregler | Ab 3 wird das Thema `focusTopics`; dadurch Matching, Entscheidungen und Lageaufnahme. Numerische Sortierung beeinflusst Top-5-Suchthemen. Zahlen stehen zusätzlich im KI-Kontext. | **Keine durchgängige Fünfstufen-Gewichtung.** In den geprüften Bewertungsfunktionen gilt 1=2 und 3=4=5. Suchpakete berücksichtigen teilweise alle Reglerschlüssel, auch bei 1. |
| Bundesland | Regionale Quellen, Matching, Lageaufnahme und Modellkontext. | Ein breiter Landesbezug genügt im Radar bewusst nicht immer für einen persönlichen Treffer. |
| Wahlkreis | Matching, persönliche Relevanz, Radar, Lageaufnahme und Quellensuche. | Feste Liste mit nur einer Auswahl von Bundestagswahlkreisen; keine vollständige Auswahl je Mandatsebene. |
| Ort | Direktes Matching; UI-Speichern kopiert ihn in `regionalInterests`, darüber auch Relevanz, Radar, Lageaufnahme und regionale Suche. | Im Lage-Modellkontext fehlen Ort/regionale Interessen. Direkte API-/Altprofile ohne Doppelablage wirken anders als normal gespeicherte UI-Profile. |
| Kommunikationsstil | Stilwunsch im aktiven Büro-KI-Kontext. | Format gibt zusätzlich Ton vor; keine deterministische Stilgarantie und keine neue Relevanzgewichtung. |
| Leitfrage | Aktiver Büro-KI-Kontext. | Kein eigener fester Rankingfaktor. **Leeren behält den bisherigen Text.** |
| Aktuelle Kampagnen | Speicherung. | **Kein aktiver inhaltlicher Verbraucher nachgewiesen.** Fehlt im aktuellen Büro-Modellprofil, wirkt dennoch auf dessen Cachebindung. |
| Öffentliche Positionen | Büro-KI-Kontext plus ausdrückliche Anweisung, diesen Positionen nicht zu widersprechen. | Promptanbindung, keine Prüfung der tatsächlichen Befolgung. |
| Wichtige Zielgruppen | Büro-KI-Kontext plus Anweisung zur Ansprache. | Kein eigenständiger Radar-/Lagefilter daraus belegt. |
| Risiko-Themen | Büro-KI-Kontext plus Anweisung zur vorsichtigen Behandlung. | Kein aktiver automatischer Risikoalarm daraus belegt. |
| Chancen-Themen | Büro-KI-Kontext plus Anweisung, passende Chancen aufzugreifen. | Kein aktiver automatischer Chancenalarm daraus belegt. |
| Zu beobachtende Akteure | Speicherung als `opponents`. | **Kein Verbraucher im aktiven Radar-/Lage-/Büropfad nachgewiesen.** Ein Clientkommentar verweist auf alten `inferEntities`-Code, dessen Aufrufer fehlt. |
| Nächste Termine | Speicherung. | **Keine erreichbare aktuelle Kalender-/Vorbereitungsfunktion nachgewiesen. Leeren behält vorhandene Termine.** |
| No-Go-Themen | Büro-KI-Kontext. | **Keine verlässliche Sperre:** keine eigene No-Go-Guardrail wie bei Positionen/Risiken und keine semantische Prüfung nach der Antwort. |

Weitere bereits gespeicherte Angaben wie Stellvertretungen, Berichterstatterthemen und
Regierungsrolle besitzen teilweise echte Verbraucher, sind aber in dieser Selbstbearbeitung
nicht zugänglich. Daraus folgt kein Wunsch nach weiteren Pflichtfeldern: vorhandene
Fachdaten sollten korrekt erhalten bleiben und bei Bedarf im passenden Bereich bearbeitbar sein.

Zentrale Verbraucher: [Matching](../../../lib/helmut/matching.js#L447),
[Entscheidungen](../../../lib/helmut/decisions.js#L39),
[persönliche Relevanz](../../../lib/helmut/scoring.js#L177),
[aktiver Radarvertrag](../../../lib/helmut/radarState.js#L282),
[Lageaufnahme](../../../lib/helmut/lage-profilbezug.js#L47),
[Lage-Modellkontext](../../../lib/helmut/lage-textqualitaet.js#L67),
[Top-5-Suchthemen](../../../lib/helmut/scheduler.js#L1726),
[Büro-Modellprofil](../../../lib/helmut/ai.js#L1248),
[Freitextanweisungen](../../../lib/helmut/ai.js#L1326).

## Wichtigste Funktionsfehler

### Zuerst: Speichervertrag und ehrliche Wirkungsversprechen

- **Ausschüsse:** Der echte mobile Formular-PATCH übertrug zwei ausgewählte
  Ausschüsse. Antwort und gespeichertes Profil enthielten nur den ersten.
  Ursache: `next.committees = next.committee ? [next.committee] : next.committees`
  ([server.js](../../../server.js#L8030)). Beim Abwählen aller Häkchen sendet der Client
  den vorherigen Bestand ([client.js](../../../client.js#L10625)).
- **Leeren:** Termine `[]` fallen auf den alten Bestand zurück
  ([server.js](../../../server.js#L8162)); die Leitfrage `""` ebenfalls
  ([server.js](../../../server.js#L8121)). Beide Fälle wurden lokal reproduziert.
- **Regler:** Entweder eine nachvollziehbare numerische Gewichtung durch die relevanten
  Pfade implementieren oder eine einfachere, ehrlich benannte Auswahl anbieten.
  Die gegenwärtige Oberfläche erklärt weder die Schwelle noch den Wirkungszeitpunkt.
- **Kampagnen, beobachtete Akteure, Termine:** Vor einer Erweiterung entscheiden,
  welche konkrete aktive Produktfunktion sie erfüllen. Bis zur Anbindung aus der
  normalen Bearbeitung nehmen oder ihre begrenzte Wirkung deutlich benennen.
- **No-Gos:** Als bloßer Formulierungswunsch darf das Feld keine garantierte Sperre
  suggerieren. Eine tatsächliche Sperrfunktion benötigt explizite Regeln und Prüfung.

### Danach: Cache und vollständige Fachdaten

- **Büroentwürfe:** Der aktive Browsercache bindet das gesamte Profil
  ([client.js](../../../client.js#L11065)). Jedes Speichern erneuert `updatedAt`, auch
  ohne Inhaltsänderung. Damit sind bisherige Entwürfe nicht mehr passend und in der
  aktuellen Ansicht nicht mehr nutzbar; sie bleiben physisch im Local Storage.
  Auch eine wirkungslose Kampagnenänderung entwertet sie. Nötig ist eine Bindung an
  die tatsächlich verwendeten Inhalte; eine Neugenerierung bleibt bewusst ausgelöst.
- **Lageprosa:** Der normale Cache nutzt `lage-profilbezug.hashProfil`; dort fehlen
  Partei/Fraktion/Regierungsrolle, obwohl der Generator sie liest. Bei gleichen
  Kandidaten/Quellen kann alte Prosa weiterverwendet werden. Der gesonderte gespeicherte
  Briefinghash verwendet einen anderen, vollständigeren Kontext.
- **Eigene Fachthemen:** Das Formular zeigt nur 17 feste Reglerthemen. Speichern ersetzt
  `focusTopics` durch die daraus berechneten Themen, während der Server nicht sichtbare
  numerische Themen im alten `topicPriorities`-Objekt erhält
  ([server.js](../../../server.js#L8176)). Die Gegenprobe behielt Finanzen 5 als Zahl,
  entfernte es aber aus `focusTopics`: unterschiedliche Verbraucher erhalten
  unterschiedliche Schwerpunktmengen.
- **Fachlisten:** Nur 10 allgemeine Ausschüsse, unvollständige Wahlkreise und keine
  vollständige Anpassung an Bundestag/Landtag. Die Funktionsliste enthält beispielsweise
  keine gespeicherte feminine Amtsbezeichnung; unbekannte Select-Werte werden nicht
  wie bei Wahlkreisen ergänzt. Dies ist ein Codebefund, keine gesonderte Browserprobe.
- **Region:** Bundeslandwechsel behält den bisherigen Wahlkreis und Ort. Browserprobe
  und Normalisierungsprobe bestätigen die Kombination; eine fachliche Zuordnungsprüfung
  fehlt. Dropdowns allein verhindern deshalb keine falschen Kombinationen.

## Bedienbarkeit: ruhig gestaltet, noch zu aufwendig

Positiv sind die klare Gruppierung, native Formularelemente und ein sichtbares Feedback
nach erfolgreichem Speichern. Die reduzierte Navigation passt zum gewünschten Produkt.

Die mobile Probe bei 390×844 ergab **5938 Pixel Formularhöhe**,17 Regler und9 Textbereiche.
„Profil speichern“ liegt außerhalb des anfänglichen Bildschirms. Das sind rund sieben
Bildschirmhöhen allein für das Formular. „Zurück“ verwarf eine geänderte Position ohne
Hinweis. Mehrzeilige Felder haben zusätzlich eigenes Scrollen und erklären weder das
Zeilenformat noch ihre Wirkung.

Empfohlener Zielzustand:

1. **Mandat:** Name, Partei/Fraktion, Ebene, fachlich passende Ausschüsse und Region.
2. **Schwerpunkte:** kompakte Themenauswahl mit wenigen nachvollziehbaren Prioritäten;
   eine kurze Erklärung der tatsächlichen Wirkung.
3. **Schreibstil:** Stil und Positionen/Zielgruppen; seltene Angaben aufklappbar.
4. Durchgehend sichtbares **„Fertig“/„Speichern“**, klarer Änderungszustand und Schutz
   vor versehentlichem Verlassen. Automatisches Speichern wäre eine alternative
   Produktentscheidung, sollte aber ebenfalls seinen Status zeigen.

Eine kurze Bestätigung wie „Gespeichert. Gilt für neue Bürotexte und den nächsten
Briefingabruf“ muss zur tatsächlichen Umsetzung passen. Technische Cache- oder
Promptdetails gehören nicht in die normale Nutzerführung. Ein sofortiger
kostenpflichtiger Neulauf ist für diese Rückmeldung nicht erforderlich.

## Tatsächliche Prüfungen und Grenzen

- Zwei voneinander getrennte lesende Teilprüfungen für Briefing/Lage/Radar und aktives
  Büro; Rootprüfung für Formular, API-Speichern und Bedienbarkeit. Gleiche geerbte
  Modell-/Denkstufeneinstellung, eigene Worktrees; keine gleichzeitigen Dateiedits.
- Reine Offline-Gegenprobe für denselben synthetischen Pflegevorgang: Stufe 1/2
  jeweils persönliche Relevanz 0, Entscheidungswert 0, Lagegewicht 0; Stufe 3/4/5 jeweils
  38/30/75. Jeder Zahlenwert änderte trotzdem den Lagehash. Diese Hilfswerte sind
  keine Messung einer vollständigen Production-Briefingqualität.
- Top-5-Suchprobe: Pflege 2 außerhalb, Pflege 5 innerhalb; alle Themen auf 1 werden weiterhin
  als Suchthemen gewählt. Hashgegenprobe bestätigte den unvollständigen normalen
  Lagecache. Ort-Soloprobe ohne `regionalInterests` bildet ausdrücklich keinen UI-Save ab.
- Büro-Payload-/Cacheprobe bestätigte enthaltene und fehlende Felder sowie die
  Cacheentwertung durch eine Kampagnenänderung. Kein Modell aufgerufen.
- Echte lokale mobile Chromiumprobe mit unverändertem `server.js`, synthetischer
  Fixture, lokalem Store und zwei Formular-PATCHs: [Beobachtungen](browser-evidence.json).
  Keine unbehandelten Browserfehler oder externen Browseranfragen. Regleranzeige,
  Speichern, Mehrfachausschüsse, leere Termine, Verlassen und Bundeslandwechsel geprüft.
- Zusätzliche reine Normalisierungsprobe: [Ergebnisse](normalisierung-evidence.json).
  Alle Läufe über `scripts/lokal.js`; lokale Storedateien danach entfernt.
  Zwei zunächst fehlerhafte Probeaufbauten wurden korrigiert: unsichtbarer
  Desktopknopf statt mobilem Knopf sowie falscher Storage-Exportname. Dies waren
  Fehler der Prüfskripte; die abschließenden Proben liefen vollständig durch.
- Keine breit wiederholte Testsuite: Dieser Auftrag ändert nur Dokumentation.

Die früher bestellten Dropdowns für Partei, Fraktion und Ort bleiben separat in
[PR #1134](https://github.com/ernisch/helmut-pilot/pull/1134), Kopf `6cb19f4a`, offen und
**nicht live**. Lokale Nachweise bestehen; die damalige Integration scheiterte beim
GitHub-Runner an DNS während der Chromium-Installation. Der letzte Lauf wurde
abgebrochen; keine exakten grünen Pflichtchecks am aktuellen Kopf. Keine erneute
Installation oder CI-Reparatur im Rahmen dieser Prüfung.

**Nächster Schritt:** zuerst die reproduzierten Speicherfehler und die uneinheitliche
Themenwirkung in einem begrenzten Funktionsfix beheben; danach die Oberfläche anhand
der tatsächlich angeschlossenen Funktionen vereinfachen. Dieser Bericht implementiert
keine Produktänderung und beansprucht keine Freigabe neuer KI-/Produktionsläufe.
