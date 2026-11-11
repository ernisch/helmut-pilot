# Kompaktes Profil nach freigegebenem Mock (11.11.2026)

## Stand

Lokal umgesetzt und gezielt geprüft; Pflicht-CI und Production-Rollout stehen vor
Integration noch aus. Basis `7898fd5d`, Branch `codex/profil-kompakt-20261111`.
Der Auftrag umfasst ausdrücklich Oberfläche **und** tatsächlich angeschlossene Wirkung.
Die früheren Befunde bleiben im [Profilaudit](../profil-wirkungscheck-20261111/README.md).

## Bedienung

Unter Profil & Einstellungen führen drei kompakte Zeilen auf eigene Seiten:

- **Mandat:** Name, Partei, Fraktion, Bundestag/Landtag, Bundesland, Wahlkreis, Ort
  und aufklappbare Mehrfachauswahl der Ausschüsse.
- **Schwerpunkte:** ausgewählte Themen; Hinzufügen und Entfernen; native Auswahl
  **Normal / Wichtig / Sehr wichtig** statt17Schiebereglern. Eigene bisherige
  Fachthemen bleiben bearbeitbar. Eine vorhandene `focusTopics`-Liste ist maßgeblich;
  alte hohe Gewichtsschlüssel aktivieren keine abgewählten Themen.
- **Schreibstil:** Ton sowie aufklappbare optionale Positionen, Zielgruppen und
  weitere Hinweise. „Bitte vermeiden“ bezeichnet Formulierungswünsche und verspricht
  keine automatische inhaltliche Sperre. Eine ausdrückliche Modellanweisung ist ergänzt.

„Profil“ und „Fertig“ stehen oben; „Fertig“ bleibt auch beim Scrollen erreichbar.
Während des Speicherns sind Eingaben gesperrt. Ein Fehler erhält den Draft und bietet
Wiederholung; Verlassen verlangt bei Änderungen eine ausdrückliche Entscheidung.
Auch Abmeldung/Mandatswechsel und das Verlassen der Seite berücksichtigen den Draft.
Ein Privatmandatswechsel oder Zugangsentzug entfernt den flüchtigen Zustand.

Termine, Kampagnen und beobachtete Akteure sind aus dieser Oberfläche entfernt.
Bestehende Daten werden dadurch nicht gelöscht. Es wurde keine Kalenderfunktion gebaut.
Die bisherigen leeren Zusatzfelder sind keine Pflicht mehr und bleiben geschlossen,
bis sie gebraucht werden. Separate Funktionsauswahl entfällt; die explizite Mandatsebene
bestimmt die parlamentarische Zuständigkeit, vorhandene besondere Funktionen bleiben erhalten.

Screenshots aus unverändertem lokalen Client mit synthetischem Profil:
[Mandat](mandat.png), [Schwerpunkte](schwerpunkte.png), [Schreibstil](schreibstil.png).

## Tatsächliche Wirkung

Neue Auswahlen speichern1/3/5; bestehende Zwischenwerte2/4 werden unterstützt und
bei bloßem Öffnen nicht umgeschrieben. Nur ausgewählte, fachlich passende Themen
bekommen höheres Gewicht. Beleg-, Pending-, Quellen- und Radargrenzen bleiben bestehen.
Die ursprüngliche technische Kosinusähnlichkeit wird nicht künstlich verändert.

Gegenprobe mit demselben synthetischen Pflegevorgang:

| Priorität | Themenbeitrag zur Entscheidung | Persönliche Relevanz | Lagegewicht |
| --- | ---: | ---: | ---: |
| Normal1 | 12 | 38 | 75 |
| Wichtig3 | 18 | 42 | 80 |
| Sehr wichtig5 | 24 | 46 | 85 |

Die geprüfte Reihenfolge änderte sich entsprechend von Rang3über2auf1. Andere
Merkmale und die bestehende Scoreobergrenze können eine sichtbare Entscheidung
weiterhin gleich lassen. Das ist kein Versprechen, jede Themenänderung müsse sofort
andere Nachrichten erzeugen.

Quellenauswahl/-suche nutzt die aktiven Themen und ihre Gewichtung. Neue Quellen
kommen im nächsten regulären Lauf; Speichern startet keinen zusätzlichen Crawl.
Lagecache bindet die tatsächliche Auswahl und den Modellkontext einschließlich
Partei/Fraktion/Regierungsrolle/Ort. Historische Briefinghash-Verträge bleiben erhalten.

Jede Seite sendet ausschließlich ihre eigenen Felder. Mehrere Ausschüsse bleiben
mehrere; die letzte Auswahl kann gelöscht werden. Optionale Leitfrage und Region
lassen sich leeren. Der Server synchronisiert Themenliste und Gewichtsmap sowie
Mandatsebene und generische Funktionsbezeichnung; widersprüchliche explizite Ebenen
werden abgewiesen. Unverändertes „Fertig“ erzeugt keinen PATCH.

Nach bestätigtem Save wird vorhandenes Wissen über den bestehenden Appstartvertrag
neu eingelesen. Nur die neueste Speicherrevision darf ihren Folgeabruf anwenden;
eine verspätete ältere Antwort kann keinen neueren Stand zurückrollen. Ein fehlender
Folgeabruf wird als solcher gemeldet und macht den bestätigten Save nicht rückgängig.
Der bestehende Verzicht auf einen persistenten Browser-Startcache bleibt erhalten.

Bürotexte entstehen weiterhin nur auf ausdrückliche Erstellung. Ihr Cache bindet
relevante Profilinhalte statt Speicherzeit/Validierungsstatus/wirkungslosen Altangaben.
Eine echte Stil-/Positionsänderung entwertet einen passenden Entwurf; bloße Metadaten
nicht. Inhaltlich passende ältere v2-Bindungen bleiben verwendbar, Mandat/Tag/Anlass/
Format und24Stunden gelten weiterhin. Stil, Positionen, Zielgruppen und Hinweise
werden dem aktiven Modellprofil übergeben; kein Modell wurde für diese Prüfung aufgerufen.

## Auswahldaten

- Partei und Fraktion bleiben getrennt; Auswahlkatalog plus Erhalt gespeicherter
  abweichender Bezeichnungen. Die vorhandene Zulassungsprüfung bleibt unverändert.
- Orte:10578Ortsnamen in16Ländern aus Destatis GV-ISys, Stand30.09.2026.
  Quelle, Lizenz und Original-SHA256 in `assets/profil-orte-20260930.json`.
- Bundestag: alle299Wahlkreise für die Wahl zum21.Bundestag aus der
  [Bundeswahlleiterin](https://www.bundeswahlleiterin.de/bundestagswahlen/2025/wahlkreiseinteilung/downloads.html),
  Datenlizenz Deutschland Namensnennung2.0. Originaldateistand07.03.2024.
- Landesparlamente:843Wahlkreise in allen16aktuellen Legislaturen zum11.11.2026
  aus abgeordnetenwatch, CC0. Perioden, API-URLs und SHA256 in
  `assets/profil-wahlkreise.json`. Vollständigkeit pro API-Antwort `count=total`
  geprüft; keine zusätzliche amtliche Einzelprüfung aller Länder behauptet.

Daten werden lokal ausgeliefert, nicht beim Ausfüllen von externen Diensten abgefragt.
Mandatsebene/Bundesland wählen die passende Wahlkreisliste; bewusster Wechsel leert
vorherige Wahlkreis-/Ortswerte. Bestehende unbekannte Werte bleiben beim Öffnen erhalten.
Der Landeslistenfall ist auswählbar. Eine Zuordnung jedes Orts zu einem einzelnen
Wahlkreis wird nicht behauptet; ein Wohn-/Büroort muss auch nicht im Wahlkreis liegen.

## Ausgeführte Prüfungen

Alle Läufe über `scripts/lokal.js`, synthetische Profile, keine Production-Datenmutation,
keine Migration, keine Secrets-/Cron-/Budgetänderung und keine bezahlten Modellaufrufe.

- Echte lokale mobile/Desktop-Chromiumprobe54Prüfungen: native Auswahl, Teil-PATCHs,
  Mehrfachausschüsse/Leeren, Regionenwechsel, Themenspeichern/Hinzufügen/Entfernen,
  verwaiste Gewichte, Modellprofil, optionale Angaben, Verlustschutz,503mit Wiederholung,
  gesperrte Eingaben während verzögerter Antwort, vertauschte Folgeantworten,
  Büro-Metadaten-/Stilbindung einschließlich kompatiblem v2-Vertrag;0JS-Fehler und
  0automatische Büro-Generierungsaufrufe. In vorhandenen Browser-Smoke integriert.
- Onboarding-/Auswahl-/Mandatsscope31/31, KI-Profilfelder43/43.
- Speicheragent: echte lokale Login-/CSRF-/PATCH-/GET-Route37/37, Validierung36/36.
- Themenagent: neue Gegenproben10, Lage24, Decisions52, Scoring73,
  Matching-Normalisierung30, Matching-Gate40, Matching-Audit178, Source-Demand65,
  SaaS76, Profilkontext5, Stellvertretung10, Platzhalter8; jeweils bestanden.
- Syntax und `git diff --check` bestanden. Keine zweite lokale Vollsuite parallel zur CI.

Review von `74e8f093` fand drei Integrationsfehler: aktive Eingaben beim Save,
vertauschbare Folgeantworten und die UI-Aktivierung verwaister Gewichte. Alle drei
wurden anschließend korrigiert und durch die54erBrowserprobe reproduzierbar abgesichert.
Die beiden Fachteilaufträge nutzten eigene Worktrees und Commits, unveränderte geerbte
Modell-/Denkstufeneinstellung; Root integriert. Keine gleichzeitig veränderten Prüfeingaben.

## Integration und Rückweg

Diese Umsetzung übernimmt die relevante Dropdownarbeit aus dem noch offenen PR1134
und ersetzt dessen separate Integration. Sein historischer GitHub-DNS-Fehler wird
nicht als Produktfehler oder erfolgreiche CI umgedeutet. Keine CI-/Schutzregeländerung.

Vor Merge: vollständigen aktuellen Diff, grünen Pflichtkopf, aktuellen main und
konfliktfreie Parallelität prüfen. Nach Merge: Deployment/öffentliche Assets rein lesend
an den freigegebenen Stand binden. Keine Production-Profilspeicherung oder kostenpflichtige
KI-Probe daraus ableiten. Rückweg: die auftragsbezogenen Runtimecommits zurücknehmen
bzw. vorheriges Deployment; neue Profilfelder oder Datenmigration sind nicht erforderlich.
