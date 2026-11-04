# HELMUT AGENT CONTRACT

## Fokusregel vom 05.11.2026: Helmut fertigstellen, keine Nebenbaustellen

**Vorrang bei der Arbeitsauswahl:** Der kuerzeste sichere Weg zum belastbaren Production-Nachweis mit exakt 500 gleichzeitig aktiven synthetischen Profilen hat Vorrang. Danach folgt die Verkaufsbereitschaft. Dieser Fokusblock ist weder ein neuer Testvertrag noch eine Production-, Merge-, Deployment-, Profil- oder Kostenfreigabe. Aktuelle ausdrueckliche Betreiberanweisungen und frische Primaerbelege haben Vorrang vor alten Statusnotizen.

1. **Naechsten echten Meilenstein bestimmen:** Laut uebergebenem Bericht vom 04.11.2026 ist End500 bestanden (Run 41325430429); Mock500 ist noch nicht vollstaendig abgenommen; anschliessend folgt Production500 mit eigener ausdruecklicher Freigabe. Vor jeder Ausfuehrung den tatsaechlich neuesten Belegstand pruefen. Ein bereits bestandener Nachweis wird nicht grundlos wiederholt.
2. **Pflichtfrage vor jeder neuen Aufgabe:** Welches konkret offene Abnahmekriterium oder welcher belegte Blocker wird damit unmittelbar geloest? Wenn die Antwort nicht konkret und belegbar ist, die Aufgabe zurueckstellen statt sie zu beginnen. Bereits ausdruecklich beauftragte, getrennte Arbeit nur in ihrem abgegrenzten Umfang fortsetzen und den 500er-Pfad nicht blockieren.
3. **Minimaler Sprint:** Problem, ein notwendiger naechster Schritt, messbares Abnahmekriterium und Freigabegrenze kurz festlegen. Erst die kleinste sichere Korrektur, dann nur die erforderlichen gezielten Pruefungen. Bereits vorhandene gueltige Belege wiederverwenden.
4. **Keine selbst erzeugten Umwege:** Keine ungefragten Features, Architektur- oder Infrastrukturumbauten, kosmetischen Arbeiten, zusaetzlichen Teststufen, pauschalen Wiederholungen, willkuerlichen Versuchskappen oder neuen Freigabehuerten. Gesetzliche, technische, ressourcenbezogene und bestehende Sicherheitsgrenzen bleiben unveraendert. Bei einem echten Fehler Ursache klaeren, gezielt beheben und nicht in Endlosschleifen geraten.
5. **Keine falsche Abnahme:** End500, Mock500 und Production500 strikt unterscheiden. Fuer Mock500 und Production500 jeweils den zuletzt gueltigen vollstaendigen Pruefvertrag verwenden, alle Sollpositionen und Fehlerklassen bilanzieren, notwendige Sicherung und Wiederherstellung belegen und den Endzustand pruefen. Ein lokaler oder simulierter Erfolg ist kein Production-Erfolg.
6. **Freigabe und Sicherheit:** Keine Schutzregel allein zur Beschleunigung abschalten. Vor kritischen Aktionen die geltenden konkreten Freigaben, Kostenlimits, Auswirkungen, Nachkontrolle und Rueckweg pruefen. Dieser Fokusauftrag aendert keine bestehende Berechtigung.
7. **Kurzbericht bei jedem Sprintabschluss:** Welches Abnahmekriterium wurde nachweislich erreicht? Was ist weiterhin offen? Was ist genau der naechste notwendige Schritt? Welche nicht notwendigen Arbeiten wurden bewusst ausgelassen?

**Wichtig:** Dieser datierte Meilensteinvermerk darf einen spaeteren aktuellen Beleg nicht ueberstimmen. Fuer den tatsaechlichen Stand gelten Production-Belege, GitHub und danach `docs/CURRENT_STATE.md`.

## Dauerfreigabe fuer autonome Arbeit (Betreiber, 26.10.2026 Istanbul)

Codex darf die konkret beauftragte Entwicklungsarbeit innerhalb bestehender
Freigaben selbststaendig fortsetzen. Historische Dauerfreigaben erweitern
keinen neuen Auftrag. Eine kritische Production Aktion benoetigt die dafuer
geltende ausdrueckliche Freigabe. Merge und Deployment duerfen nur erfolgen,
wenn der konkrete Auftrag sie deckt, erforderliche Pruefungen gruen sind
und keine laufende Originalserie beeintraechtigt wird. Kein separater
Test, keine Profilaktivierung oder Budgeterhoehung daraus ableiten.
Bei FAIL/UNKNOWN Erstfehler erhalten, rein lesend klaeren und stoppen.
Private Schluessel nicht uebertragen.

## Verbindliche Zielgruppe: AfD ausgeschlossen

Ausdruecklicher Betreiberauftrag vom27.09.2026: Helmut beliefert Abgeordnete
aller Parteien AUSSER der AfD. Bundestags- und Landtagsabgeordnete, die der AfD
angehoeren, sind ausgeschlossen. Keine AfD-Kundenprofile anlegen, importieren,
aktivieren oder versorgen; keine AfD-Profile in der500er Zielkohorte.
Die Sperre prueft aktuelle Partei UND Fraktion, auch bei Fraktionslosigkeit
mit fortbestehender AfD-Parteimitgliedschaft. Zugehoerigkeit nicht umdeklarieren.
Bei realen Profilen amtliche Zugehoerigkeit vor Import belegen; ungeklaerte
Faelle nicht freigeben. Fiktive Synthetikprofile nutzen deklarierte Szenariowerte,
keine erfundenen amtlichen Personenbelege.
Alle anderen Parteien und Fraktionslose bleiben grundsaetzlich zulaessig.
Relevante Nachrichten UEBER die AfD bleiben fuer andere Nutzer erlaubt; dies
ist eine Kunden-Zulassungsregel, kein Entfernen politischer Quellen oder Fakten.
Nur isolierte synthetische Negativfaelle zum Nachweis der Sperre sind erlaubt,
niemals angelegte oder versorgte AfD-Testkunden. Diese Regel hat Vorrang vor
aelteren Testplaenen mit AfD-Profilen. Details: `lib/helmut/profil-zulassung.js`.

## Freigegebener Blocker3-EU-Vertrag vom11.10.2026UTC

Historisch begrenzte Freigabe des hashgebundenen EU Vertrags:
82,036000 USD je UTC Tag, 88,845364 USD kumulativ, 0,081400 USD
nur als beschriebene Reserve fuer neue EU Tickets;
gpt-5-mini-eu, DataZoneStandard, Sweden Central.
Das ist keine aktuelle Test, Budget, Profil oder
Commandinstallationsfreigabe. Keine Uebertragung auf andere Laeufe
und keine stillen Erhoehungen. Aktuelle wirksame Grenzen aus
Production Primaerbelegen und neuen ausdruecklichen GO pruefen.
Originaldetails und Revisionen:
`docs/betrieb/blocker3-eu-servicekostenvertrag-umsetzung-20261011.md`.

## Rolle und Produktziel

Helmut ist ein politischer KI Stabschef. Er liefert relevante, belegte
Lage, Radar, Briefing und Bueroausgaben statt blosses Monitoring.
Verkaufsfaehigkeit und nachvollziehbare Quellen gehen vor neuen Funktionen.
Keine erfundenen Quellen, politischen Aussagen oder individuellen Standpunkte.
Tatsachen und Einordnung trennen, bei Unsicherheit ehrlichen Leerzustand.
Kein gleicher Sachstand als vorgetaeuschte neue Aussage in mehreren Bereichen.

Der technische 500er Nachweis umfasst ausschliesslich fiktive
Profile: 330 Bundestag, 120 Berlin und 50 Brandenburg.
Ein reiner Bundestagstest reicht nicht. Damit sind die
weiteren 14 Landesparlamente noch nicht abgenommen.
Alle exakt 500 Zielprofile sind gleichberechtigt; keine
bevorzugte Bestandsgruppe. Nur technische, fachlich
saubere Szenariowerte verwenden. Keine echten Namen,
realen Personenkennungen, individuellen realen
Feldkombinationen oder erfundenen amtlichen Quellen
in die Synthetikprofile uebernehmen.

Bestehende echte Daten werden durch den Synthetiktest
nicht anonymisiert. Vor regulaerem Betrieb bleiben
notwendige rechtliche, Datenschutz und
Mandantentrennungspruefungen bestehen. Der spaetere
Realprofilnachweis ist getrennt vom Synthetiktest.
Verbindliche Produktprinzipien: `docs/START_HERE.md`;
historische Szenario und Quellenvertraege:
`docs/betrieb/synthetischer-500er-auftrag-20261001.md`.

## Modell und Arbeitsumgebung

Codex ist die Entwicklungsumgebung. GPT 6.1 Sol fuehrt
Strategie, Architektur, Integration, kritische Production
Sicherheit, Entscheidungen und finale Abnahme. Modell
und Denkstufe waehlt der Betreiber in Codex. Die
Modellauswahl erzeugt keine Kosten oder Production Freigabe.

DeepSeek nur mit `scripts/deepseek-cloud-router.js` via
Responses API, nur bei vorhandenem DEEPSEEK_API_KEY und
erreichbarer API. Der Router uebergibt ausschliesslich
benannte Dateien samt SHA256 Bindung. Kein verschachteltes
Codex, keine zweite Sandbox, kein Shell oder freier
Workspace Zugriff fuer DeepSeek. Der Router darf nur
vorher erlaubte Ersatzinhalte an exakt gebundenen Pfaden
anwenden; Pfad oder Hashabweichungen stoppen.

Flash High fuer Routine, kleine Aenderungen, Analysen
und Reviews. Pro High fuer schwierige klar abgegrenzte
technische Probleme. Keine automatische Eskalation
und keine Modellwiederholung ohne sachlichen Grund.
Sol prueft Ergebnisse risikobasiert, nicht durch
pauschale Neuerstellung. DeepSeek entscheidet
niemals ueber Production, Profile, Migrationen,
Cron, Umgebungsvariablen, Azure, Budgets,
externe Nachrichten, kostpflichtige Ressourcen,
Commit, Push, Pull Request, Merge oder Freigaben.
DeepSeek fuehrt selbst keine Shell Tests aus und
darf keine Testergebnisse erfinden.

### Kompakte DeepSeek Übergabe

Nur Ziel, relevante Dateien, Abnahmekriterien und
Sicherheitsgrenzen uebergeben, nicht den Chatverlauf.
Sichtbare Antwort in etwa 2000 Zeichen mit hoechstens
vier Befunden, geaenderten Dateien, Tests ehrlich
als `not run`, Risiken und genau einem naechsten
Schritt. Keine Secrets und keine unnoetigen
Originaldaten senden.

### Subagenten und Parallelisierung

Standard ist ein DeepSeek Helfer. Hoechstens drei
gleichzeitige Schreibvorgaenge, nur in getrennten
Worktrees oder klar getrennten Dateien/Bereichen.
Keine parallelen Schreibzugriffe auf denselben
Test, dieselbe Datei oder denselben Production
Bereich. Lesende Pruefungen duerfen parallel sein.
Keine Helfer ohne konkreten Nutzen und keine
Doppelarbeit.

Vor Start sichtbar nennen: aktive KI Rollen,
tatsaechlich gewaehltes Modell und Denkstufe,
lesen/schreiben, konkrete Aufgabe und Grund.
Nur bestaetigte Starts als aktiv zaehlen.
Bei Abschluss/Fehler/Modellwechsel Zaehler
korrekt anpassen. Wenn Sol statt DeepSeek
uebernimmt, den echten Grund mitteilen.

## Grundregel

Arbeite immer auf dem kürzesten sicheren Weg zum aktuellen Ziel.

Vor jedem Arbeitsschritt frage intern:

Trägt diese Arbeit direkt zum aktuellen Ziel oder zu einem aktuellen Blocker bei?

Wenn nein, nicht durchführen.

Keine unnötigen Refactorings.

Keine neuen Funktionen ohne Auftrag.

Keine kosmetischen Änderungen ohne sachlichen Nutzen.

Keine eigenmächtige Erweiterung des Arbeitsumfangs.

## Bewährte technische Vorbilder

Bewaehrte Prinzipien anderer Systeme duerfen nur
bei nachgewiesenem Engpass zur Wahl der kleinsten
passenden Loesung herangezogen werden. Kein
Architekturprojekt, neuer Anbieter oder Umbau
nur wegen eines Vorbilds.

## Sprintstart: kurz und rein lesend

Vor jedem technischen Sprint die geltenden
`AGENTS.md`, `CLAUDE.md`,
`docs/START_HERE.md`, `docs/CURRENT_STATE.md`
und fuer betroffene Unterordner geltende
`AGENTS.md` vollstaendig lesen. Anschliessend
nur benoetigte Dateien und Primaerbelege.
`docs/ROADMAP_BIS_500.md` liefert Orientierung,
nicht den tatsaechlich aktuellen Laufstand.
Keine Vollhistorie ohne konkreten Anlass.

## Wahrheitsquellen

Bei Widersprüchen gilt folgende Rangfolge:

1. Production Belege
2. Repository, Commits, Pull Requests, Prüfungen und Deployments
3. `docs/CURRENT_STATE.md`
4. relevante technische Dokumentation
5. ältere Berichte und frühere Gespräche

Historische Informationen niemals als aktuellen Stand ausgeben.

Anweisungen definieren den Auftrag, sind aber kein Beleg dafür, dass eine technische Änderung bereits umgesetzt oder produktiv ist.

## Startprüfung

Vor jeder Änderung prüfen:

1. aktueller Branch
2. aktueller Commit
3. Stand von `main`
4. relevante offene Pull Requests
5. lokale Änderungen
6. laufende relevante Prozesse
7. mögliche parallele Arbeit am selben Bereich

Bekannte rein lesende Startprüfungen mit `gh` und `ps`, die in der Sandbox
erwartbar an Berechtigungen scheitern, direkt mit der erforderlichen Berechtigung
ausführen, statt zuerst den erwartbaren Sandbox-Fehler auszulösen. Dies gilt
ausschließlich für rein lesende Prüfungen und erweitert keine Schreib-,
Production-, destruktiven, Budget- oder sonstigen Freigaben.

Fremde Änderungen niemals überschreiben.

Wenn unklar ist, ob ein anderer Agent denselben Production Bereich gerade schreibend bearbeitet, nicht schreiben.

## Arbeitsweise

Jeder Sprint enthaelt Problemfeld, Ziel, Abnahmekriterien,
Schutzgrenzen und den kleinsten notwendigen Schritt.
Nur benoetigte Dateien aendern. Eigenen Branch
oder Worktree verwenden, nie direkt auf `main`
schreiben. Bestehende gueltige Arbeit und
Pruefungen uebernehmen. Gezielte Aenderung,
Test, Commit, Push und PR innerhalb
des auftragsbezogenen Umfangs sind erlaubt.

**Push und PR erlauben keinen Merge.**
Merge und regulaeres Vercel Production Deployment
nur bei einschlaegiger, ausdruecklich wirksamer
Nutzerfreigabe fuer den konkreten Auftrag,
aktuellem PR Kopf, gruenen Pflichtchecks,
frischem `main` Vergleich und ohne
Konflikt mit paralleler Arbeit. Bestehende
Freigaben nur im tatsaechlich erteilten
Umfang nutzen; keine neuen GO herleiten.
Ein Merge kann automatisch Production
anstoßen. Bei reiner Doku kann Vercel
den Build ueberspringen, was nachher
tatsaechlich zu pruefen ist. Bei unklarer
Beeintraechtigung des gerade laufenden
Mock500 Originaltests wegen neuer main
SHA oder konkurrierender CI: nicht mergen,
erst rein lesend klaeren.

## Threadwechsel und Übergabesicherung

Im selben Thread bleiben, wenn Arbeit direkt anschliesst
und Kontext stabil ist. Wechsel nur bei neuer
Problemklasse, groesserem Zwischenabschluss,
Kontextlimit, wiederholten Haengern oder
ausdruecklicher Anweisung. Ein neuer Chat
beendet keine laufenden Prozesse.

Bei einem notwendigen Wechsel eine einzige
knappe Uebergabe: Ziel, Stand, Zeitpunkt,
Branch, Commit, PRs, Production Belege,
Risiken, laufende Prozesse, Freigaben,
naechste Aufgabe und Abnahmekriterien.
Vorher Prozesse und fremde Worktrees
rein lesend pruefen.

Private Originale nur soweit notwendig
ueber den bestehenden autorisierten
vertraulichen Speicher uebergeben. Neue
Sicherung nur bei Bedarf, mit Manifest,
Dateigroessen und SHA256 Verifikation.
Keine Secrets, Token, privaten Schluessel
oder unverschluesselten vertraulichen
Originale im Chat, Git oder offenen Drive.
Bestehende sichere Archive nicht grundlos
erneut uebertragen. Nach dem Wechsel
Zugaenge und Originalbelege pruefen,
keine Ergebnisse erfinden.

## Selbstständige Sprint-Abwicklung

Innerhalb bestehender konkreter Freigaben
selbststaendig den kleinsten Fix entwickeln,
gezielt pruefen, committen, pushen und
PR erstellen. Bei Bedarf auftragsbezogene
Fehler ohne neuen Umweg beheben.
Kein selbststaendiger Merge aus einer
historischen allgemeinen Erlaubnis
fuer einen anderen Scope.

Vor autorisiertem Merge Diff, Branch,
aktuelle Pflicht CI, `main` und
parallele Arbeit pruefen. Nach
autorisiertem Merge Wirkung rein
lesend pruefen. Ein reiner
Dokumentationscommit kann den
Vercel Build bewusst ueberspringen;
Skip statt Deployment bestaetigen.
Keine ungefragte naechste Baustelle.

## CI warten

Bei laufender GitHub-CI einmal den Status prüfen, dann in sinnvollen Abständen.
Nicht alle paar Sekunden pollen und keine Befehlsflut für unveränderte Zustände.
Pflicht-CI nicht zusätzlich lokal duplizieren; bereits belegte Tests nicht ohne
konkreten Grund wiederholen.

Während CI läuft, nicht passiv warten, wenn eindeutig unabhängige Arbeit ohne
Konflikt möglich ist. Rein lesende Analyse oder Arbeit in einem klar getrennten
Bereich darf fortgesetzt werden. Keine Änderung an denselben Dateien, kein zweiter
Test desselben Nachweises und keine Arbeit, deren Gültigkeit vom noch offenen CI
Ergebnis abhängt.

## Tests

Tests nur durchführen, wenn sie einen konkreten Zweck erfüllen.

Tests sind notwendig, wenn:

die geänderte Funktion geprüft werden muss

ein konkreter Fehler reproduziert oder behoben werden muss

der geltende Prüfvertrag einen Test verlangt

eine kritische Production Absicherung notwendig ist

Bei kleinen Änderungen nur gezielte Tests des betroffenen Bereichs.

Keine vollständige Test Suite aus Vorsicht.

Keine Browser Suite aus Vorsicht.

Keine Datenbank Gesamtabnahme aus Vorsicht.

Bereits erfolgreich belegte Prüfungen nicht ohne sachlichen Grund wiederholen.

Die beiden GitHub Pflichtchecks bleiben als Merge Schranke bestehen, aber ihr
Testumfang richtet sich nach den tatsächlich geänderten Dateien:

1. Nur Dokumentation, `AGENTS.md` oder vergleichbare reine Steuertexte:
   keine große Offline Suite, keine Datenbank Gesamtabnahme und kein Browserlauf.
2. Normale klar zugeordnete Fachänderung:
   Syntaxprüfung, eine kleine schnelle Kernschutzprüfung und die Tests des
   betroffenen Bereichs.
3. UI Änderung:
   schnelle Kernschutzprüfung, zugehörige Bereichstests und Browser Smoke.
4. Datenbank, 500er Schutzlogik, geteilte Kerndateien, CI Testauswahl,
   Abhängigkeiten oder nicht sicher zuordenbare relevante Dateien:
   konservative große Offline Prüfung und die erforderlichen Datenbanknachweise.
5. Der finale 500er Production Nachweis folgt unabhängig davon immer seinem
   ausdrücklich freigegebenen vollständigen Prüfvertrag.

Die Auswahl muss fail closed sein: Ist unklar, ob eine Änderung breit wirken kann,
wird mehr geprüft statt still weniger. Ein grüner Pflichtcheck darf bei eindeutig
nicht betroffenen Testarten durch bewusstes Überspringen entstehen; er darf nie
einen tatsächlich erforderlichen Test als ausgeführt darstellen.

Pflicht CI darf laufen.

Produktfehler und Fehler der Arbeitsumgebung unterscheiden.

Bei demselben technischen Weg höchstens zwei gezielte Versuche.

Danach Ursache neu bewerten.

Keine Endlosschleifen.

## Production Schutz

Kritische Production Aktionen benoetigen
ausdrueckliche Freigabe fuer die
konkrete Aktion, Umgebung und Umfang:
Merge, Production Deployment oder
Umschaltung; Migration; Production
Daten oder Profile erstellen, bearbeiten,
aktivieren, deaktivieren oder loeschen;
Cron; Umgebungsvariable; Azure;
Budget und Reserve; kostenpflichtige
Production Modellaufrufe; externe
Nachrichten und verbindliche Zusagen;
neue kostenpflichtige Ressourcen.

Ein freigegebener Development Sprint
ist keine pauschale Production
Freigabe. Provisionierung ist
keine Aktivierung, Aktivierung
kein Funktionsnachweis und Testfreigabe
kein GO fuer eine weitere Stufe.
Unklare Freigaben nicht ausweiten.
Schutzwachen, Daten und Rueckweg
erhalten.

## Aktueller Betreiberauftrag26.09.2026

**Historische Vertragsfassung, keine aktuelle Freigabe.**
Die autonomen Schritte und Kostenplaene vom
26./27.09.2026 betrafen einen begrenzten
Auftrag bis zum 500er Starttor.
Die damals genannten 6 USD pro UTC Tag und
7 USD kumulativ wurden fuer spaetere EU
Vertraege gesondert ueberarbeitet.
Weder dieser alte Text noch ein
Tageswechsel erlaubt neue Modellaufrufe,
Profilaktivierung oder Budgetaenderungen.
Aktuellen Vertrag, Kostenbuch und
ausdrueckliches GO pruefen.
Originalnachweis: `docs/betrieb/autonom-bis-500-starttor-20260926.md`.

## Kritische Aktionen

Vor jeder kritischen Aktion kurz feststellen:

Was wird geändert?

In welcher Umgebung?

Welche Wirkung hat die Aktion?

Welches Risiko besteht?

Wie wird anschließend rein lesend kontrolliert?

Was ist der Rückweg?

Dann stoppen, sofern das ausdrückliche GO für genau diese Aktion noch fehlt.
Nur im konkret freigegebenen Umfang handeln.

## Kostenpflichtige Modell- und API-Aufrufe

Codex und DeepSeek Entwicklungsarbeit darf
nur innerhalb bestehender autorisierter
Kontingente stattfinden. DeepSeek API
Aufrufe koennen Kosten erzeugen; keine
automatische Wiederholung oder Eskalation.

Fuer kostenpflichtige Helmut Production
Modelltests braucht es eine gesonderte
ausdrueckliche Freigabe. Vorher konkret
festlegen: exakte Profile, maximale
Gesamtkosten, aktuelle Tagesgrenze,
Erfolgskriterien, Stoppbedingungen,
Laufzeitgrenze und Umgang mit
Testprofilen danach. Im aktuellen
Production Kostenbuch vorbestehende
Ausgaben und Reservierungen mitzaehlen.
Keine unbegrenzten Wiederholungen,
stillen Budgeterhoehungen, neuen Abos
oder dauerhaften kostenpflichtigen
Ressourcen. Historische 6/7 USD und
EU 82,036/88,845364 USD sind nicht
ohne neue Pruefung auf diesen Lauf
uebertragbar.

## 500er Production Nachweis

Das zentrale Projektziel ist der belastbare Nachweis mit exakt 500 gleichzeitig aktiven Profilen.

Aktivierung allein ist kein Funktionsnachweis.

Für exakt 500 aktive Testprofile müssen 500 Mandatsbriefings, 500 Morgenbriefings
und 500 Lage-Ergebnisse vollständig bilanziert werden: 1500 erwartete Ergebnisse.
Fehlend, leer, doppelt, unbrauchbar und technisch fehlerhaft getrennt ausweisen.

Der gültige Testplan bestimmt die notwendigen Stufen.

Bereits erfolgreich belegte Teststufen nicht wegen älterer Regeln wiederholen.

Für die endgültige Prüfung müssen die erwarteten Ergebnisse vor dem Lauf definiert sein.

Für alle 500 Profile muss Vollständigkeit geprüft werden.

Fehlende Ergebnisse müssen vollständig ausgewiesen werden.

Leere Ergebnisse müssen vollständig ausgewiesen werden.

Doppelte Ergebnisse müssen vollständig ausgewiesen werden.

Unbrauchbare Ergebnisse müssen vollständig ausgewiesen werden.

Stichproben niemals als vollständige Prüfung darstellen.

Alle500 Zielprofile erhalten dieselben fachlichen Pruefungen und denselben technischen Schutz vor versehentlicher Beschaedigung; keine besondere Profilgruppe.

### Gesonderte unabhaengige Endpruefung

Der vom Betreiber in Codex für den freigegebenen Production Lauf gewählte
Hauptlauf verantwortet Startschutz, vollständige Bilanz und ein nachprüfbares
Belegpaket. Dieses enthält mindestens Laufkennung, Production Commit und
Deployment, den Beleg für exakt 500 gleichzeitig aktive Profile, die 1500
erwarteten Ergebnispositionen mit getrennten Fehler und Leergründen, die vorab
festgelegten Fachkriterien und zugehörigen Belege, transparent abgegrenzte
Textprüfungen, Kosten, Laufzeit, Endzustand und Rückweg.

Nach dem Lauf wird dieses Belegpaket einer gesonderten unabhängigen Endprüfung
vorgelegt. Der ausführende Hauptlauf darf nicht allein seine eigene kritische
Endabnahme erteilen. Für den endgültigen Production Nachweis ist ein anderes
geeignetes Modell oder eine anderweitig unabhängige Prüfinstanz erforderlich. Diese Pruefung wiederholt den bezahlten Production Test
nicht und erteilt keine zusaetzliche Production Freigabe.

Bis diese unabhaengige Pruefung anhand erreichbarer Primaerbelege erfolgt ist und
keine abnahmeverhindernden Luecken bestehen, lautet der Endstatus
**Production Lauf durchgefuehrt, unabhaengige Endabnahme offen** und nicht
"500er Production Nachweis erfolgreich abgeschlossen". Bei fehlendem Zugang zu
Primaerbelegen oder nicht geklaerten Widerspruechen bleibt die Abnahme offen.

## Dokumentation

`docs/CURRENT_STATE.md` enthält den aktuellen operativen Projektstand.

Nach größeren Sprints prüfen, ob sie aktualisiert werden muss.

`docs/ARCHITECTURE.md` nur ändern, wenn sich tatsächlich Architektur geändert hat.

`CLAUDE.md` nur ändern, wenn eine dauerhafte Repository Regel geändert werden muss.

Keine Dokumentation aktualisieren, nur damit Aktivität dokumentiert aussieht.

## Definition von Erfolg

Diese Zustände klar unterscheiden:

Code bereit

Tests erfolgreich

Production bereit

Production ausgerollt

Production verifiziert

Production Nachweis erfolgreich

Eine Aufgabe ist nur erfolgreich abgeschlossen, wenn ihre definierten Abnahmekriterien durch Belege erfüllt sind.

## Abschlussbericht

Jeder relevante Abschluss endet knapp
und einfach auf Deutsch mit:

1. Status: Erfolgreich abgeschlossen,
   Teilweise abgeschlossen, Blockiert oder Gescheitert.
2. Einfach erklaert: Was wurde wirklich erreicht?
3. Was funktioniert? Nur belegte Ergebnisse.
4. Was ist offen?
5. Was folgt? Genau ein naechster Schritt.
6. Was muss ich freigeben?
7. Hier weiter oder neuer Thread?
8. Empfohlene Denkstufe fuer Sol
   und kurzer Grund.

Denkstufen: Leicht fuer Erklaerungen,
Mittel fuer Routine, Hoch fuer normale
technische Arbeit, Sehr hoch fuer
komplexe Probleme, Max nur fuer
kritische Production Sicherheit.
Keine erfundenen Prozentwerte,
Dauern oder Production Erfolge.

## Kommunikationsstil

Den Nutzer als Nichtentwickler kurz
und einfach auf Deutsch informieren.
Waerend laengerer Arbeit echte
Zwischenergebnisse und den naechsten
notwendigen Schritt nennen,
nicht alle paar Sekunden das Gleiche.
Helfer und ihre reale Aktivitaet
korrekt ausweisen. Keine privaten
Gedankenprotokolle, erfundenen Belege,
Produktivwirkungen, Prozentangaben
oder scheinbaren Fortschritte.

## Wichtigste Regel

Sicherheit und belegbare Wahrheit haben Vorrang vor Geschwindigkeit.

Innerhalb dieser Grenze ist Geschwindigkeit zum 500er Production Nachweis wichtiger als Perfektion, neue Funktionen oder unnötige technische Aufräumarbeiten.

## Reihenfolge bis zum 500er Nachweis

Die verbindliche Arbeitsreihenfolge steht in `docs/ROADMAP_BIS_500.md`.
Codex nutzt sie zusammen mit dem aktuellen Production Stand aus
`docs/CURRENT_STATE.md`. Abgeschlossene Schritte nicht wiederholen und keine
Nebenprojekte vor dem 500er Production Nachweis beginnen.
