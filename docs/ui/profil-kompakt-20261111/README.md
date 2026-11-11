# Kompaktes Profil nach freigegebenem Mock (11.11.2026)

## Stand

Umgesetzt und live: [PR1144](https://github.com/ernisch/helmut-pilot/pull/1144),
ursprünglich auf `22bad44c` READY; [damaliger Rolloutnachweis](rollout.json).
Folgeauftrag „Bitte vermeiden“: [PR1151](https://github.com/ernisch/helmut-pilot/pull/1151)
auf `953c1dfe` READY; [aktueller lesender Rolloutnachweis](ohne-vermeiden-rollout.json).
Basis `7898fd5d`, Bürostand `626c4f29` und Handystartfix bis `74679756` integriert.
Der Auftrag umfasst ausdrücklich Oberfläche **und** tatsächlich angeschlossene Wirkung.
Die früheren Befunde bleiben im [Profilaudit](../profil-wirkungscheck-20261111/README.md).

## Folgeauftrag: „Bitte vermeiden“ entfernen (11.11.2026)

**Live und geprüft:** PR1151 nach beiden grünen Pflichtchecks auf `a93843f4`
regulär gemergt, `953c1dfe` vom 11.11., 21:28:31 UTC. CI43099987478:
189/189 Standardsuiten, 367/367 Fachsuiten, 48/48 Z22 und Browser/Mobil erfolgreich.
Aktueller main/Parallelität geprüft, keine Konflikte; der Mergebaum ist exakt der
geprüfte Kopfbaum `fac3b6b848ca4e9ec79919422a9a0177e84ee401`.
Production `dpl_4EEymRutzUa22MEq32GFJDFP719v` READY, Hauptdomain auf diesem Stand.
Startseite HTTP200 mit Version `953c1dfe`, Client/CSS HTTP200 und bytegleich zum
geprüften Stand. Entferntes Eingabefeld/Label auch im ausgelieferten Client abwesend.
[Livebeleg](ohne-vermeiden-rollout.json). Nächster Schritt: Profil am eigenen Gerät neu öffnen.

Historische Blockade: GitHub meldete am 11.11., 20:59 UTC offiziell
„Actions: major_outage“; auch andere PRs warteten. [Primärbeleg](ohne-vermeiden-ci-blocker.json).
Die Warteschlange verarbeitete danach den unveränderten Pflichtlauf regulär.

Auf Nutzerwunsch entfällt das Eingabefeld aus der Profiloberfläche: Die bisherige
weiche Modellanweisung ist keine garantierte Sperre und soll diese Erwartung nicht
wecken. Das Feld entfällt auch aus Initialwerten und Formulareinlesen; ein Stil-PATCH
sendet deshalb keinen versteckten leeren `noGoTopics`-Wert. Vorhandene Bestandswerte
werden nicht gelöscht; der bestehende serverseitige Modell-/Cachevertrag bleibt erhalten.
Keine Datenmigration, Production-Profilspeicherung oder bezahlte KI-Probe.

Gezielte Prüfung gegen echten lokalen Server: 60/60 Profilbrowserchecks auf Handy
und Desktop, einschließlich entferntem Feld, erhaltenen Altwerten und Stil-PATCH
ohne `noGoTopics`, unverändertem „Fertig“, 503/Wiederholung und Folgeantworten bestanden.
Syntax und Diffprüfung grün. Pflicht-CI und regulärer Rollout sind oben belegt.
Rückweg: gezielter UI-/Formular- und Erwartungsrevert, keine Datenrücknahme erforderlich.

Erster Pflichtlauf `43088060572` auf `3e74df78`: Browser und 189/189 Standardsuiten
bestanden, Fachregression 366/367. Der verbleibende Fehler war eine alte
Onboarding-HTML-Erwartung, die ausdrücklich `noGoTopics` verlangte. Sie wurde an
den Nutzerauftrag angepasst: entfernte Felder fehlen, die vier übrigen optionalen
Hinweise bleiben vorhanden. Kein Produktfehler oder abgeschwächtes CI-Gate;
der neue Kopf benötigt erneut beide grünen Pflichtchecks.

Der folgende Lauf `43093338107` auf `a0adbf8a` meldete alle Schritte einschließlich
Standard-/Fachregression, Z22 und „Complete job“ erfolgreich (letzter Schritt
20:27:53 UTC). Sein Gesamtcheck blieb jedoch über das 45-Minuten-Fenster hinaus
`in_progress`. GitHub lieferte dabei widersprüchliche Zustände: normaler und
vorgesehener Notabbruch jeweils HTTP409 „not in progress“, Wiederholung des Jobs
und des Laufs jeweils HTTP403 „already running“. Kein Abbruch und kein Wiederlauf
wurde dadurch ausgelöst; zwischendurch scheiterte nur die lokale Statusabfrage an
HTTP503. Dieser Beobachtungsstand reichte nicht als formales Grün. Später bestätigte
GitHub denselben alten Lauf erfolgreich; keine Abbruch-/Wiederholungsanforderung war erfolgreich.

Der anschließend frisch integrierte Stand enthält den unabhängigen Büro-Quellentextfix
bis `d6914b62`. Seine Runtime ist bytegleich zum getrennt geprüften gemeinsamen Baum
`4f8d8a5ce69da29642f1cb5e311417fda5a11e52`: 60/60 Profilbrowserchecks und
76/76 Büro-Ehrlichkeitsprüfungen bestanden, keine echten Daten-/Modellaufrufe.
Der neue Kopf dokumentierte diese CI-Blockade und erhielt regulär beide grünen Pflichtchecks.
Keine Workflowänderung, manuelle Erfolgsmarkierung, Schutzumgehung oder Datenmutation.

## Bedienung

Unter Profil & Einstellungen führen drei kompakte Zeilen auf eigene Seiten:

- **Mandat:** Name, Partei, Fraktion, Bundestag/Landtag, Bundesland, Wahlkreis, Ort
  und aufklappbare Mehrfachauswahl der Ausschüsse.
- **Schwerpunkte:** ausgewählte Themen; Hinzufügen und Entfernen; native Auswahl
  **Normal / Wichtig / Sehr wichtig** statt 17 Schiebereglern. Eigene bisherige
  Fachthemen bleiben bearbeitbar. Eine vorhandene `focusTopics`-Liste ist maßgeblich;
  alte hohe Gewichtsschlüssel aktivieren keine abgewählten Themen.
- **Schreibstil:** Ton sowie aufklappbare optionale Positionen, Zielgruppen und
  weitere Hinweise. „Bitte vermeiden“ entfällt mit dem oben dokumentierten Folgeauftrag;
  die frühere Modellanweisung bleibt im historischen Prüf-/Rolloutnachweis nachvollziehbar.

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

Neue Auswahlen speichern 1/3/5; bestehende Zwischenwerte 2/4 werden unterstützt und
bei bloßem Öffnen nicht umgeschrieben. Nur ausgewählte, fachlich passende Themen
bekommen höheres Gewicht. Beleg-, Pending-, Quellen- und Radargrenzen bleiben bestehen.
Die ursprüngliche technische Kosinusähnlichkeit wird nicht künstlich verändert.

Gegenprobe mit demselben synthetischen Pflegevorgang:

| Priorität | Themenbeitrag zur Entscheidung | Persönliche Relevanz | Lagegewicht |
| --- | ---: | ---: | ---: |
| Normal 1 | 12 | 38 | 75 |
| Wichtig 3 | 18 | 42 | 80 |
| Sehr wichtig 5 | 24 | 46 | 85 |

Die geprüfte Reihenfolge änderte sich entsprechend von Rang 3 über 2 auf 1. Andere
Merkmale und die bestehende Scoreobergrenze können eine sichtbare Entscheidung
weiterhin gleich lassen. Das ist kein Versprechen, jede Themenänderung müsse sofort
andere Nachrichten erzeugen.

Quellenauswahl/-suche nutzt die aktiven Themen und ihre Gewichtung. Neue Quellen
kommen im nächsten regulären Lauf; Speichern startet keinen zusätzlichen Crawl.
Lagecache bindet die tatsächliche Auswahl und den Modellkontext einschließlich
Partei/Fraktion/Regierungsrolle/Ort. Historische Briefinghash-Verträge bleiben erhalten.

Jede Seite sendet ausschließlich ihre eigenen Felder. Mehrere Ausschüsse bleiben
mehrere; die letzte Auswahl kann gelöscht werden. Optionale Leitfrage, Region und Partei-/Fraktionsauswahl
lassen sich leeren; fehlende Pflichtangaben werden ehrlich angezeigt. Der Server synchronisiert Themenliste und Gewichtsmap sowie
Mandatsebene und generische Funktionsbezeichnung; widersprüchliche explizite Ebenen
werden abgewiesen. Unverändertes „Fertig“ erzeugt keinen PATCH; die sichtbare Sortierung der
Ausschussauswahl verändert den bisherigen Primärausschuss nicht.

Nach bestätigtem Save wird vorhandenes Wissen über den bestehenden Appstartvertrag
neu eingelesen. Nur die neueste Speicherrevision darf ihren Folgeabruf anwenden;
eine verspätete ältere Antwort kann keinen neueren Stand zurückrollen. Ein fehlender
Folgeabruf wird als solcher gemeldet und macht den bestätigten Save nicht rückgängig.
Der bestehende Verzicht auf einen persistenten Browser-Startcache bleibt erhalten.

Bürotexte entstehen weiterhin nur auf ausdrückliche Erstellung. Ihr Cache bindet
relevante Profilinhalte statt Speicherzeit/Validierungsstatus/wirkungslosen Altangaben.
Eine echte Stil-/Positionsänderung entwertet einen passenden Entwurf; bloße Metadaten
nicht. Inhaltlich passende ältere v2-Bindungen bleiben verwendbar, Mandat/Tag/Anlass/
Format und 24 Stunden gelten weiterhin. Stil, Positionen, Zielgruppen und Hinweise
werden dem aktiven Modellprofil übergeben; kein Modell wurde für diese Prüfung aufgerufen.

## Auswahldaten

- Partei und Fraktion bleiben getrennt; Auswahlkatalog plus Erhalt gespeicherter
  abweichender Bezeichnungen. Die vorhandene Zulassungsprüfung bleibt unverändert.
- Orte: 10578 Ortsnamen in 16 Ländern aus Destatis GV-ISys, Stand 30.09.2026.
  Quelle, Lizenz und Original-SHA256 in `assets/profil-orte-20260930.json`.
- Bundestag: alle 299 Wahlkreise für die Wahl zum 21. Bundestag aus der
  [Bundeswahlleiterin](https://www.bundeswahlleiterin.de/bundestagswahlen/2025/wahlkreiseinteilung/downloads.html),
  Datenlizenz Deutschland Namensnennung 2.0. Originaldateistand 07.03.2024.
- Landesparlamente: 843 Wahlkreise in allen 16 aktuellen Legislaturen zum 11.11.2026
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

- Echte lokale mobile/Desktop-Chromiumprobe 60 Prüfungen: native Auswahl, Teil-PATCHs,
  Mehrfachausschüsse/Leeren, Regionenwechsel, Themenspeichern/Hinzufügen/Entfernen,
  verwaiste Gewichte, Modellprofil, optionale Angaben, Verlustschutz, 503 mit Wiederholung,
  gesperrte Eingaben während verzögerter Antwort, vertauschte Folgeantworten,
  Büro-Metadaten-/Stilbindung einschließlich kompatiblem v2-Vertrag ; 0 JS-Fehler und
  0 automatische Büro-Generierungsaufrufe. In vorhandenen Browser-Smoke integriert.
- Onboarding-/Auswahl-/Mandatsscope 31/31, KI-Profilfelder 43/43.
- Speicheragent: echte lokale Login-/CSRF-/PATCH-/GET-Route 37/37, Validierung 36/36.
- Themenagent: neue Gegenproben 10, Lage 24, Decisions 52, Scoring 73,
  Matching-Normalisierung 30, Matching-Gate 40, Matching-Audit 178, Source-Demand 65,
  SaaS 76, Profilkontext 5, Stellvertretung 10, Platzhalter 8; jeweils bestanden.
- Syntax und `git diff --check` bestanden. Keine zweite lokale Vollsuite parallel zur CI.

Review von `74e8f093` fand drei Integrationsfehler: aktive Eingaben beim Save,
vertauschbare Folgeantworten und die UI-Aktivierung verwaister Gewichte. Alle drei
wurden anschließend korrigiert und durch die 60 Browserprüfungen reproduzierbar abgesichert.
Die beiden Fachteilaufträge nutzten eigene Worktrees und Commits, unveränderte geerbte
Modell-/Denkstufeneinstellung; Root integriert. Keine gleichzeitig veränderten Prüfeingaben.

Der erste vollständige Lauf auf `e747645c` bestand188/189Standardsuiten und die
Browser-/DB-Vorprüfungen. Einzig die bestehende D2-Modulliste im Schreibschutztest
kannte den neu geladenen reinen Themenhelper nicht. Dieser wird ausdrücklich
namentlich ergänzt; zusätzlich sichern zwei neue Prüfungen ab, dass er keine
Abhängigkeiten oder I/O-/Umgebungs-/dynamischen Ausführungspfade besitzt. Die
bestehenden HTTP-/Tabellen-/RPC-/Storage-Schreibsperren bleiben erhalten.
Gezielter korrigierter Schreibschutznachweis:56/56bestanden. Keine Runtimeänderung
nach den58Browserprüfungen auf e747645c; neuer Pflichtkopf erforderlich, kein Umdeuten des Fehlers.

Anschließend bestanden auf `b871a8f4` alle189Standardsuiten; die Fachregression
bestand365/367Suiten. Die beiden Fehler lagen in alten Testaufbauten: ein wörtlicher
Partei-Input-Quelltextcheck trotz nativem Select und ein VM-Auszug ohne neuen
`officeDraftProfileContext`-Helfer. Beide wurden korrigiert. Die Parteiauswahl im
Onboarding wird zusätzlich im echten Browser ausgeführt und übernommen.
Der parallel veröffentlichte Bürostand `626c4f29` wurde sauber integriert und separat
lesend auf Pool-/Privat-/Cacheverträglichkeit geprüft. Gemeinsamer lokaler Browserlauf:
174/174plus17/17Adminchecks, darin60Profilprüfungen; Einladung34/34 und
Büro-Antwortzeit13/13mit echtem Clientcode und virtueller Zeit. Der nachfolgende
integrierte Pflichtlauf ist unten belegt. Keine Test-/Schutzabschwächung.

## Liveabschluss

Beide Pflichtchecks auf dem tatsächlichen PR-Kopf `731408c5` erfolgreich:
[CI43076685841](https://github.com/ernisch/helmut-pilot/actions/runs/43076685841),
189/189 Standardsuiten, 367/367 Fachsuiten, 48/48 Z22-Datenbankprüfungen und
Browser-/Mobile-Smoke. Der gesonderte vollständige Mock100-Lauf wurde nach bestehendem
Prüfplan bewusst ausgelassen; die native isolierte Drei-Profil-Anschlussprobe lief.
Das ist kein Productionlasttest. Die früheren fehlgeschlagenen Köpfe bleiben oben dokumentiert.

Der währenddessen unabhängig veröffentlichte Handystartfix wurde in einem eigenen
unveränderlichen Integrationsstand mit dem grünen Profilkopf zusammengeführt:
10/10 Service-Worker-Startgruppen sowie zwei echte mobile Browserfälle für hängende
Header/Antwortkörper bestanden. Der lokal geprüfte gemeinsame Baum
`62e98ccd07d1b394c669e8dafb81cb9654236c22` ist exakt der Baum des regulären
GitHub-Merge `22bad44c` vom 11.11., 18:56:09 UTC. Aktueller main, Parallelität,
vollständiger Diff und konfliktfreie Zusammenführung wurden vor Merge geprüft.

Vercel Production `dpl_3ZDJdFeykzbxeRNECcYsszhdWCYc` READY, Hauptdomain
`helmut-pilot.vercel.app` auf diesem Stand. Startseite HTTP200 mit Version `22bad44c`;
Client, CSS, Ortsliste, Wahlkreisliste und Service Worker jeweils HTTP200 und SHA256
gleich dem geprüften Mergebaum. Zeitpunkt und Einzelhashes stehen im [Beleg](rollout.json).
Keine manuelle Veröffentlichung, Migration, echte Profilmutation oder bezahlte KI-Probe.

Die öffentliche Auslieferungsprüfung ersetzt keine authentifizierte Kundensitzung
und keinen Test der Qualität eines echten Modelltexts. Die fachliche Save-/Wirkungskette
wurde lokal gegen den echten Server mit synthetischen Profilen geprüft. Die bestehende
Quellenfrische ist nicht Gegenstand dieses Rollouts und wird hier nicht als behoben bewertet.
Nächster Schritt: Profil am eigenen Gerät öffnen.

## Integration und Rückweg

Diese Umsetzung übernimmt die relevante Dropdownarbeit aus PR1134
und ersetzt dessen separate Integration. Sein historischer GitHub-DNS-Fehler wird
nicht als Produktfehler oder erfolgreiche CI umgedeutet. Keine CI-/Schutzregeländerung.

Keine Production-Profilspeicherung oder kostenpflichtige KI-Probe aus dem Rollout ableiten.
Rückweg: die auftragsbezogenen Runtimecommits zurücknehmen
bzw. vorheriges Deployment; neue Profilfelder oder Datenmigration sind nicht erforderlich.
