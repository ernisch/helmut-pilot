# Quellenbindung strukturierter Ministerien

Stand 18.09.2026. Status: teilweise abgeschlossen. Enger Folgeblock nach PR433, lokal behoben und geprueft; unabhaengige CI und PR Stand sind am veroeffentlichten Branch nachzulesen. Keine Production Wirkung.

## Uebernahme

Basis ist PR433 `a37855af379c223c268be13c20bf7f10b7215bc4`, Tree `ddbf2eea86e67196dabd25c47c6997ab82c0b512`. Main weiterhin `2d1eb705e00ea5f5ff8f351997e429cc16d195c1`. Pflichtdokumente vollstaendig gelesen; keine geltende AGENTS.md gefunden. Die neue isolierte Arbeitskopie baut auf dem exakt von GitHub geholten Commit auf. Fremde Arbeitskopien und die alten 55 uncommitteten Vorarbeiten bleiben unangetastet.

PR433 offen, Draft und ungemergt. Fachlauf35325406170 und CI35326097981 abgeschlossen und erfolgreich, nur nachgelesen. [Gesichertes Fachurteil](gipfel-einzelversuch-2026-09-18.md#einmalige-ausfuehrung-des-korrigierten-ausfuehrers): genau ein Azure Aufruf, konservative Buchung0,006921USD, erhaltene Einmalquittung und Kosten. Zeitliche Kernfrage bestanden, gesamte Antwort fachlich abgelehnt. Alle38 Felder wurden im vorigen Sprint beurteilt; diese Pruefung wird uebernommen, nicht als neue Textpruefung ausgegeben. Kein erneuter Aufruf, Artikelabruf, Import, Zuruecksetzen oder Loeschen.

Frischer GitHub Vorflug:0 in_progress,0 waiting; zwei queued CI Altlaeufe vom06.08. auf fremden alten Branches, kein aktueller Fachlauf. Offene Reparaturkette endet bei PR433, keine neue konkurrierende Reparatur. Lokal kein weiterer Prozess sichtbar. Der Betreiber uebergibt den abgeschlossenen vorherigen Thread hierher. Globaler Work Sitzungsstatus bleibt technisch nicht abfragbar. Keine frische Datenbank oder Deploymentaufnahme behauptet; dieses Teilziel schreibt ausschliesslich auf einem isolierten Reparaturbranch.

## Beleg und allgemeine Ursache

Der Gipfelfall stammt aus den erhaltenen negativen Inhaltsvergleichen des abgeschlossenen500er Tests; die [offene Fachabnahme](artikelidentitaet-2026-09-17.md#offene-fachabnahme) und der anschliessende gebundene Einzelversuch dokumentieren die Kette. Im neuen Ergebnis nennen `ministerien` und `mentioned_ministries` Auswaertiges Amt und BMWK ohne Nennung in der gelieferten Eingabe. Die Antwort uebernimmt diese Zuordnung auch in Handlungsschritte.

Die allgemeine Speicherstrecke prueft bislang Schema und sanitisiert Felder, aber gleicht diese beiden Listen nicht gegen den gelieferten Quellentext ab. Ein synthetischer Fall mit anderem Thema reproduziert am unveraenderten PR433 Code `saved` trotz erfundenem Ministerium. Es ist kein Artikelsonderfall und kein Rueckschluss aus bloss gruener CI. Der historische echte Prompt und die echte Antwort bleiben unveraendert; es wird kein neuer Modellnachweis behauptet.

## Kleiner Motorfix

Der Prompt verlangt fuer beide Ministerienlisten die woertliche Bezeichnung aus Titel, Auszug oder explizit gebundenem Artikelabsatz. Keine Ableitung aus Thema, mutmasslicher Zustaendigkeit, Herausgeber, URL, Vorwissen oder Promptbeispielen. Ohne Nennung bleiben die Listen leer. Strukturelle Beteiligung bleibt eine eigene Anforderung und ist nicht durch die Nennung bewiesen.

Ein gemeinsamer deterministischer Validator prueft die rohe Modellantwort gegen genau den abgesendeten Prompt. Nur die ausgewaehlten Quellenzeilen und ihre drei Textfelder zaehlen. Normalisiert werden Unicode NFC, Grossschreibung und Leerraum. Namen muessen mit Wortgrenzen in einem einzelnen Textfeld vorkommen. Kein Ressortkatalog, kein einzelner Akteur, keine einzelne URL oder Artikelkennung ist hartkodiert. Keine Kurzform oder Synonymableitung, keine Verbindung getrennt gelieferter Textfelder, keine nachtraegliche Eingabeanreicherung.

Erstverstehen einschliesslich Pending Pfad und Aktualisierung benutzen die Pruefung vor Speicherung des vollstaendigen Wissensobjekts. Ein unbelegter Listenwert verwirft die gesamte neue Antwort mit `skipped-invalid` und konstantem Fehlercode. Er wird nicht still herausredigiert, waehrend die davon abhaengige Empfehlung erhalten bliebe. Beim Update bleiben bestehende Inhalte unangetastet. Die vorhandene Fehler, Vormerkungs und CAS Logik wird weiterverwendet; nach begonnenem Aufruf keine neue automatische Freigabe und kein unmittelbarer Retry. Der Goldsetauswerter verwendet dieselbe Pruefung und darf eine solche Antwort nicht positiv melden.

> **Ueberholt fuer die zwei Ministeriumslisten (23.09.2026):** siehe [Nachtrag](#nachtrag-23092026--optionale-ministeriumslisten-blockieren-die-antwort-nicht-mehr).
> Alle uebrigen Akteurslisten (Parteien, Personen, Ausschuesse) sowie Schema und decision_level
> gelten unveraendert wie hier beschrieben.

## Pruefungen

Neue synthetische Suite `scripts/ministerien-quellenbindung-test.js`:12/12 Gruppen erfolgreich. Sie prueft fehlende und echte Nennungen, neue frei gewaehlte Ressortnamen, Unicode und Leerraum, Metadaten und Promptbeispiele, Teilwort und Regexgrenzen, fehlende Quellen, Typfehler, Auswahlgrenzen, Eingabemutation, Erstverstehen und Update samt CAS Ausgang, Erhalt des Bestands, den normalen und den expliziten Artikelkontext sowie den Auswerter. Kein echter Netz oder Modellaufruf.

Gegenprobe mit unveraendertem PR433 Fachmodul und identischer neuer Suite scheitert am Speichervertrag: `saved` statt `skipped-invalid`. Die Arbeitsdatei wird dabei nicht ersetzt; der alte Code wird ausschliesslich isoliert in den Testprozess geladen. Das belegt den vorher vorhandenen allgemeinen Fehler.

Die zwei bestehenden Landesvertragssuiten enthielten neun Modellattrappen mit aus der Zustaendigkeit erfundenen Ressortlisten. Nur diese beiden Listen wurden in den Attrappen geleert; die Originalquellen und saemtliche bisherigen Abnahmen blieben erhalten. Neue Zusatzabnahmen verlangen die leeren Listen auch im gespeicherten Ergebnis. Gezielte Nachpruefung: Berlin77/77, Brandenburg99/99. Der neue negative Speichervertrag bleibt separat abgedeckt; kein Validator wurde fuer diese Attrappen gelockert.

Die Sicherheitspruefung verwendete dasselbe illustrative Goldset mit fuenf ebenfalls unbelegten BMAS Listen. Diese erwarteten Listen sind jetzt leer; Quelltexte und alle sieben Faelle bleiben erhalten. Sicherheitspruefung332/332. Im Pilotvertrag wurden zwei unbelegte Ressortlisten geleert. Die absichtlich unvollstaendige Institution behaelt ihren Klassifikationsfall im Freitext und weiterhin die Pflicht `unknown`; die strukturierte Liste verwendet nur das gelieferte Wort Ministerium. Der positive Hauptfall mit tatsaechlicher Nennung bleibt gefuellt. Zusaetzliche Abnahme prueft diese Trennung, Pilot97/97. Ein versuchter synthetischer Quellzusatz wurde verworfen, weil er die bestehende Clustertrennung beeinflusste; im finalen Stand sind alle Quellfixtures unveraendert.

CLAUDE.md Paragraph6 verlangt vor jedem PR den kanonischen Gesamtlauf ueber `scripts/lokal.js`. Er wird fuer den neuen Anwendungscode ausgefuehrt. Vorhandene Abhaengigkeiten sind bei identischem Paketvertrag wiederverwendet; kein Paketupdate und keine Neuinstallation. Der Lauf endete mit403/408 erfolgreichen Suiten in815 Sekunden, Exit1. Die fuenf Fehler waren die drei genannten Vertragssuiten, deren Goldset verwendende Sicherheitspruefung und die zunaechst zu lange Statusdatei. Alle fuenf wurden anschliessend gezielt erfolgreich nachgeprueft:77/77,99/99,97/97,332/332 und4/4. Goldsetstruktur7/7, neue Suite12/12. Anwendungscode im ganzen Lauf und in den Nachpruefungen identisch. Kein zweiter kompletter lokaler Lauf nur fuer Fixture und Dokumentationskorrekturen; der vollstaendige unabhaengige GitHub Lauf am veroeffentlichten Head ist im zugehoerigen Draft PR massgeblich. Kein behaupteter lokaler408/408 Lauf. Die bisherigen erfolgreichen PR433 Pruefungen wurden nur uebernommen.

## Grenzen, Risiko und naechster Schritt

Dies ist ein Nennungsbeleg fuer zwei strukturierte Felder, keine semantische Faktenpruefung. Ein genanntes Ministerium kann weiterhin falsch als beteiligt eingeordnet sein. Namen ausschliesslich im Freitext, unbelegte Beschluesse, Fristen, individuelle Mandatsfolgen und andere Akteurslisten sind nicht automatisch geprueft. Leere Ministerienlisten machen eine Antwort nicht fachlich richtig. Diese Folgepunkte bleiben offen.

Die bewusst konservative woertliche Bindung kann auch sachlich richtige Abkuerzungen, Uebersetzungen oder Flexionsvarianten abweisen, wenn die Ausgabe nicht die Quellbezeichnung uebernimmt. Der Prompt erklaert genau diesen Vertrag. Auslassungen werden sichtbar statt als Erfolg ausgegeben. Keine allgemein belastbare Aussage zur Versorgung aller500 ohne erneuten freigegebenen Production Nachweis. Vorhandene fehlerhafte Wissensobjekte werden nicht rueckwirkend veraendert.

Naechster enger Block nach diesem Codeabschluss: den weiterhin belegten Widerspruch zwischen globaler Analyse ohne Mandatsprofil und gefordertem persoenlichen Mandatsbezug anhand desselben erhaltenen Fachurteils eingrenzen. Keine automatische Ausweitung dieses Sprints. Reale Modellwirkung und Production Wirkung bleiben getrennte spaetere Freigabeentscheidungen.

Veroeffentlichung als Draft PR auf den offenen PR433 Branch. Automatische Deployments des eigenen Folgebranches sind in vercel.json ausgeschaltet; Crons und sonstige Konfiguration unveraendert. Kein Merge, Deployment, Migration, Profilwechsel, Datenbankzugriff, Azure Wechsel, Umgebungswechsel, bezahlter Aufruf oder Teststart. Rueckweg vor Merge: nur den neuen ungemergten Folgebranch verwerfen. Einmalquittung und Kostenbelege des Gipfelversuchs bleiben zwingend erhalten. Ein Merge nach main wuerde Production deployen und ist nicht freigegeben.

## Nachtrag 23.09.2026 — optionale Ministeriumslisten blockieren die Antwort nicht mehr

**Anlass (Betreiberbeleg, Production 23.09.2026).** Der Vorgang `vg-reform-20260429-1065a7`
(BAföG, 10 gebundene Dokumente) endete im sicheren Einzelversuch `POST
/api/admin/recovery/run-one-understanding` nach genau einem Modellaufruf mit `status =
skipped-invalid`, `reason = validierung-fehlgeschlagen` und den Fehlercodes
`quellenbeleg-ministerien` und `quellenbeleg-mentioned_ministries`. CAS danach `unbekannt`. Die
uebrige Antwort war fachlich brauchbar. **Welche konkreten Ministeriumsbezeichnungen das Modell
lieferte, ist NICHT belegt** — die rohe Modellantwort wird bewusst nicht gespeichert; daraus wird
hier nichts abgeleitet.

**Aenderung (deterministisch, quellenbelegt).** `ministerien` und `mentioned_ministries` sind reine
ERWAEHNUNGEN und keine Pflichtaussage. Vor dem Speichern werden in diesen beiden Listen nur die
woertlich belegten Werte behalten (`ohneUnbelegteMinisterien` in
`lib/helmut/akteurslisten-quellenbindung.js`, aufgerufen in den beiden Speicherpfaden
`understandOneCluster` und `understandUpdate`). Unbelegte Werte entfallen, ohne Beleg bleibt die
Liste leer; woertlich belegte Bezeichnungen bleiben **unveraendert** erhalten. Der Beleg selbst ist
**derselbe** wie zuvor (gleiche Quellen, gleiche Wortgrenzen, gleiche NFC/Klein/Leerraum-
Normalisierung): keine Aliase, keine Kuerzel, keine Ressortableitung, keine Metadaten, kein Fuzzy,
kein Vorwissen. Ein Feldwert, der kein Array ist, bleibt unangetastet und sperrt weiterhin (fail
closed).

**Unveraendert streng:** Parteien, Personen und Ausschuesse (ein unbelegter Wert verwirft die
Antwort weiterhin vollstaendig), alle Schemafehler und der `decision_level-antwortkonflikt`,
CAS/Fencing, Quittung, Budget, Locks sowie alle Laufdeckel. **Bewusst NICHT geaendert:** der
Goldsetauswerter `evaluateUnderstandingCase` prueft unveraendert streng und meldet eine unbelegte
Ministeriumsliste weiterhin als ungueltig — er speichert nichts und bleibt der Qualitaetswaechter,
der einen Modellfehler sichtbar macht.

**Grenzen.** Es wird nichts rueckwirkend geaendert (bestehende Objekte bleiben wie sie sind),
keine Modellantwort, kein Prompt und kein Rohtext zusaetzlich gespeichert, kein zweiter
Modellaufruf, kein Netz und keine Production-Wirkung. Belegte Nennungen bleiben ein Nennungsbeleg
und keine Aussage ueber Beteiligung oder Zustaendigkeit.

**Gezielte Pruefungen (offline, 0 Modellaufrufe, 0 Production-Writes).**
`scripts/ministerien-quellenbindung-test.js` **19/19** (neu: unbelegtes Ministerium sperrt die
Antwort nicht mehr und wird nicht gespeichert; gemischte Liste behaelt nur den belegten Wert;
belegter Wert unveraendert; keine Alias-/Kuerzel-/Ressort-/Fuzzy-Erweiterung; Reduktion mutiert die
Antwort nicht; Parteien/Personen/Ausschuesse weiter streng; Schemafehler und Ebenenkonflikt
weiter gesperrt; Aktualisierung ueberschreibt den Bestand nicht; Goldsetauswerter unveraendert).
Zusaetzlich gruen: `verstehen-einmalig-test` 91/91, `parteien-quellenbindung` 16/16,
`ausschuesse-quellenbindung` 9/9, `understanding-ebenen-konsistenz` 8/8,
`akteursrollen-erhalten` 16/16, `understanding-einzelvorgang` 45/45, `pilot-e2e-vertrag` 97/97,
`berlin-e2e-vertrag` 79/79, `brandenburg-e2e-vertrag` 102/102, `verstehen-169-neuversuch` 19/19,
`verstehen-169-kosten-deckel` 29/29.
