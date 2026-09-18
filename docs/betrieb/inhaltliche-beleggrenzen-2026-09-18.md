# Offene inhaltliche Beleggrenzen nach PR442

Stand 18.09.2026. **Status: teilweise abgeschlossen.** Alle vier Kategorien des
Sammelauftrags sind untersucht und als Ergebnis B eingegrenzt. Keine neue
fachliche Reparatur, keine reale Modellbefolgung und kein Production Nachweis.
Die Dokumentation zaehlt keine dieser Grenzen als behoben.

## Gemeinsame Grenze, getrennte Ursachen

Der aktuelle Motor prueft Form, acht strukturierte Akteurslisten und explizite
Ebenenkonflikte. Er prueft nicht allgemein, ob jede Prosaaussage aus einer
Quellenstelle folgt. Sachgebiet, Vollzug, Akteursbeziehung und Ereigniszeit
sind verschiedene fachliche Beziehungen innerhalb dieser gemeinsamen Grenze.
Eine identische historische Entstehungsursache ist nicht bewiesen.

Die erhaltenen Wissensobjekte enthalten die betreffenden Prosafehler bereits.
`assembleKnowledgeObject` uebernimmt diese Felder nach Bereinigung;
`briefingContract.koTitle` und `koSummary` verwenden sie fuer die Anzeige.
Eine reine Aenderung der Anzeige wuerde die zugrunde liegende falsche Aussage
nicht allgemein korrigieren. Ein objektweiter Listenfehler beweist ebenfalls
keine Erkennung eines daneben vorhandenen Prosafehlers.

Der Auftrag in `buildUnderstandingPrompt` verlangt bereits, Akteur, Handlung,
Gegenstand und Aussagegrad gemeinsam zu bewahren. `quellen-zeitvertrag.js` trennt
Herausgeber und Urheber, Moeglichkeit und Beschluss sowie Publikationszeit und
Ereigniszeit. PR436, PR438 und PR440 praezisieren diese Vertraege bereits.
Deshalb keine weitere gleichlautende Promptregel und keine Artikelsonderregel.

## 1. Sachgebiet: Ergebnis B

**Belegt:** Der erhaltene Pflegefall bezeichnet eine Pflegeversicherungsleistung
als Steuerleistung. Die zeitgenoessische Originalpruefung bestaetigt das falsche
Sachgebiet. Die falsche Prosa steht schon im frueher aufgenommenen Wissensobjekt;
spaetere Karte und Zusammenfassung stimmen damit ueberein. Im erhaltenen
Quellenstand steht nur ein Titel zum moeglichen Verfall, ohne Auszug und
Dokumenttyp. Er identifiziert die Leistung fachlich nicht eindeutig.

**Erwartung:** Nur das gelieferte Sachgebiet wiedergeben. Bei einem mehrdeutigen
Leistungsnamen die Einordnung offenlassen, statt eine Steuer oder Pflegeleistung
zu erfinden. Bei explizitem Beleg muss die korrekte Einordnung erhalten bleiben.

**Fehlt:** Exakter damaliger Request, rohe Antwort und gegebenenfalls damals
gelieferter fachlicher Absatz. Der erhaltene Originalvergleich ist eine
Pruefnotiz, kein historischer Modelleingang. Fehlende Eingaben im Paket beweisen
nicht, dass sie historisch nie geliefert wurden.

**Nur vermutet:** Mehrdeutiger Leistungsname, unzureichender Kontext oder
Modellwissen koennten zur Umdeutung beigetragen haben. Kein alleiniger Ausloeser
ist belegt. Die neutrale Diagnose trennt den Sachgebietsfehler jetzt vom Vollzug:
Auch bei erhaltenem Entwurfsstand wird ein falsches Sachgebiet gespeichert.

**Warum kein belastbarer Fix:** Weder ein Wortersatz noch eine Zuordnung nach
Herausgeber oder URL belegt das Sachgebiet. Ein generelles Verbot steuerlicher
Aussagen ohne bestimmte Woerter wuerde richtige Umschreibungen aussortieren und
falsche Beziehungen mit denselben Woertern weiter zulassen. Eine neue
Promptwiederholung erzwingt keine semantische Antwortpruefung.

**Kleinster zusaetzlicher Nachweis:** Ein an den Dokumentstand gebundener
Originalabsatz, der die Leistungsart explizit nennt, und ein erhaltener Request
samt roher Antwort. Falls der historische Request nicht mehr verfuegbar ist,
ein spaeter gesondert freigegebener isolierter Versuch mit exakt archivierter
Eingabe. Das waere ein neuer Verhaltensnachweis, keine historische Rekonstruktion.
Ein neutraler mehrdeutiger Gegenfall muss weiterhin ohne erfundene Einordnung
bleiben. Diese Schritte sind vorbereitet beschrieben, nicht ausgefuehrt.

## 2. Vollzug und Vorschlag als Ruecknahme: Ergebnis B

**Belegt:** Im Pflegefall steht im erhaltenen Titel ein Moeglichkeitsvorbehalt;
das Wissensobjekt und die Karte behaupten im Titel einen Entzug. Die damalige
Originalpruefung nennt Entwurf, Warnung und offene Gesetzgebung. Der Sachtext
bewahrt teilweise den Vorbehalt, der Titel nicht. Ein Satz mit Unsicherheit
heilt also die daneben stehende definitive Behauptung nicht.

**Erwartung:** Vorschlag, Entwurf, Warnung, Beschluss und Vollzug unterscheiden,
auch in Titel, Folgen und Empfehlungen. Ein belegter Beschluss bleibt konkret
moeglich. Eine Quelle kann zugleich einen frueheren Vorschlag und einen neuen
Beschluss enthalten; ein pauschaler Filter auf Modalwoerter waere falsch.

**Fehlt und nur vermutet:** Historischer Request und rohe Antwort fehlen.
Unbekannt ist, ob der Titel den Vorbehalt bereits in der Modellantwort verlor
oder welcher damalige Generierungsschritt ausschlaggebend war. Die erhaltene
Ausgabe allein beweist keine neue heute noch fehlende Promptanweisung.

**Gesonderter Kandidat Ruecknahme:** In den beiden benannten Belegpaketen,
ihren dekodierten JSON Texten und den relevanten Befundlisten wurde kein
eindeutig zuordenbares erhaltenes Ein und Ausgabepaar fuer den genauen Befund
Vorschlag als Ruecknahme identifiziert. Die gezielte ergaenzende Dateisuche
lieferte keinen passenden Befund. Das ist eine Suchgrenze, kein Beweis seiner
Nichtexistenz. Andere Rueckholungen, Rueckweisungen oder bereits korrigierte
Redaktionsentwuerfe werden nicht als Ersatzbefund eingesetzt.

**Warum kein belastbarer Fix:** Die bestehenden Aussagenregeln verbieten
unbelegten Vollzug bereits. Eine neue Schluesselwortsperre koennte Akteur,
Negation, mehrere Ereignisse und einen tatsaechlichen spaeteren Beschluss nicht
zuverlaessig unterscheiden. Die neue synthetische Ruecknahmeprobe belegt nur
die technische Durchlaessigkeit, nicht den fehlenden historischen Fall.

**Kleinster zusaetzlicher Nachweis:** Fuer Pflege ein gebundener Originalabsatz
mit Entwurfsstand samt genauem Request und roher Antwort; alternativ ein neu
freizugebender isolierter Versuch. Fuer den Ruecknahmekandidaten zuerst
Vorgangskennung oder gespeicherte Fehlkarte mit Quelle und Aufnahmezeit. Danach
vorliegende Eingabe und Ausgabe zuordnen; erst dann einen eigenen Fix ableiten.

## 3. Zuschreibungen im Fliesstext: Ergebnis B

**Belegt:** Gastbeitrag als Zeitungsposition und falscher Vorname samt falschem
innerparteilichem Konflikt sind in erhaltenen Originalvergleichen bestaetigt.
Die falsche Prosa steht schon in den Wissensobjekten. Die vorhandenen
Personenlistenregeln verhindern unbelegte Namensformen in den Listen, nicht
allgemein falsche Namen oder Beziehungen im Fliesstext.

**Erwartung:** Unbekannte Urheberschaft offenlassen; belegten Gastautor und
Beitragsart erhalten. Eine explizit belegte redaktionelle Position bleibt
zulaessig. Bei Personen muessen auch Kritiker, Adressat und Gruppenzugehoerigkeit
stimmen, nicht nur die Buchstaben der Namen.

**Fehlt:** Im erhaltenen Gastbeitragseingang fehlen Auszug, Autor und
Dokumenttyp. Im Personenfall stehen die Nachnamen, aber keine Vornamen oder
belegten Parteibeziehungen im erhaltenen Titel. Historische Requests und rohe
Antworten fehlen bei beiden. Die fruehere private Gastbeitragsdiagnose wurde
gelesen und nicht erneut ausgefuehrt.

**Nur vermutet:** Der Herausgeber koennte als Urheber verwendet worden sein;
Personenwissen koennte falsch ergaenzt worden sein. Diese historischen
Entstehungswege sind nicht abschliessend bewiesen.

**Warum kein belastbarer Fix:** Eine Namensliste beweist keine Rollenbindung.
Die zusaetzliche neutrale Gegenprobe hat ausschliesslich gelieferte volle Namen
und Gruppen, vertauscht aber Kritiker und Adressat beziehungsweise behauptet
eine gemeinsame Gruppe. Beide falschen Prosavarianten passieren Erstverstehen
und Update. Eine pauschale Mediensperre wuerde auch echte Leitartikel ablehnen.
Keine Zeitungsliste, Personenausnahme oder automatische Namenskorrektur.

**Kleinster zusaetzlicher Nachweis:** Gebundener Originaltext mit Autor und
Beitragsart beziehungsweise vollstaendigen Namen und Rollen, zusammen mit
exaktem Request und roher Antwort. Ein spaeterer neuer isolierter Versuch muss
jeweils die gesamte Antwort pruefen; neutrale Gegenfaelle sind echte
Redaktionsposition und korrekt gerichtete Kritik zwischen zwei Gruppen.
Bestehende Gastbeitragsbelege und fuenf damalige Attrappen bleiben gueltige
Diagnosen, aber keine Modellabnahme.

## 4. Konzerttermin und historischer Rueckblick: Ergebnis B

**Belegt:** Ein konkreter erhaltener Befund liegt vor. Zwei Auftritte sind
angekuendigt; die Karte ordnet sie pauschal einer frueheren Tournee zu und nennt
keinen Termin. Die damalige Originalpruefung unterscheidet Rueckblick2025 und
Auftritte2027. Die Karte behauptet nicht ausdruecklich, die neuen Konzerte
haetten2025 stattgefunden. Deshalb bleibt die Einstufung Praezisierungsbedarf;
keinen staerkeren historischen Datumsfehler erfinden.

Der erhaltene Auszug nennt die Tournee im vergangenen Jahr und zwei jetzt
geplante Auftritte, aber kein Datum dieser Auftritte. Er ist im heutigen
Quellenauftrag vollstaendig enthalten. Beide erhaltenen authentifizierten
Aufnahmen tragen denselben Kurztext und denselben Aenderungszeitpunkt des
Wissensobjekts. Die falsche beziehungsweise unzureichende Beziehung liegt
damit schon vor der Anzeige vor. Kein nachgewiesener aktueller Abschneidefehler.

**Erwartung:** Historischen Rueckblick und neu angekuendigte Auftritte getrennt
beschreiben. Einen nicht gelieferten Termin offenlassen. Liegt ein konkreter
Termin im Text vor, ihn dem passenden Ereignis zuordnen und erhalten.

**Fehlt:** Der konkrete Termin steht nur in der zeitgenoessischen Pruefnotiz,
nicht im erhaltenen Titel oder Auszug. Historischer Request und rohe Antwort
fehlen. Kein heutiger Artikel wurde als historische Eingabe eingesetzt.

**Nur vermutet:** Ein kurzer Auszug koennte die Ereignisverknuepfung beguenstigt
haben. Dass mehr Text allein den Fehler verhindert oder dass ein Datum
technisch verloren ging, ist nicht bewiesen.

**Warum kein belastbarer Fix:** Jahreszahlen allein beschreiben keine
Ereignisbeziehung. Die bestehenden Zeit und Ereignisregeln trennen Metadaten,
Rueckblick und Anlass bereits. Ein automatisches Einsetzen des Jahres aus der
Pruefnotiz waere eine redaktionelle Einzelkorrektur ohne Eingabenachweis.

**Kleinster zusaetzlicher Nachweis:** Gebundener Originalabsatz mit konkretem
neuem Termin und dessen Ereignisbezug, exakter Request und rohe Antwort. Als
Gegenfall muss derselbe Motor ohne Terminbeleg einen offenen Termin ausgeben.
Die neuen neutralen Diagnosen pruefen beide Eingabesituationen, keine reale KI.

## Neue Diagnosen und Grenzen ihrer Aussage

Private Diagnose auf unveraendertem PR442 Anwendungscode:13 neutrale Faelle,
jeweils Erstverstehen und Update, insgesamt26 isolierte Laufzeitaufrufe.
Jeder hat genau eine feste Modellattrappe und eine injizierte Speicherfunktion;
keine echte Datenbank, keine echte KI und kein Retry. Quellenzeile, relevante
Promptregeln und unveraenderte Uebernahme des Kurztexts wurden kontrolliert.

| Fallgruppe | Korrekte Gegenfaelle | Absichtlich falsche Gegenfaelle | Beobachtung |
| --- | --- | --- | --- |
| Sachgebiet | Explizite Verkehrsleistung mit offenem Entwurf | Steuerleistung bei identischem Entwurfsstand | Beide speicherbar |
| Vollzug | Offener Vorschlag; expliziter spaeterer Beschluss | Abschaffung aus Entwurf; Ruecknahme aus Vorschlag | Alle speicherbar |
| Personenbeziehung | Gerichtete Kritik zwischen zwei Gruppen | Vertauschte Kritik; falsche gemeinsame Gruppe | Alle speicherbar |
| Ereigniszeit | Rueckblick und offener Termin; expliziter neuer Termin | Historisches Jahr auf neue Auftritte uebertragen | Alle speicherbar |

Die Beobachtungen bestaetigen die Grenze. Sie sind **keine bestandenen
Reparaturregressionen** und werden nicht als kuenftige Pflicht zum Akzeptieren
falscher Antworten in den Anwendungstestbestand aufgenommen. Ein erster
Diagnoseanlauf endete ohne vollstaendige Beobachtung wegen leerer Pflichttexte
in der synthetischen Testantwort. Nur diese Testantwort wurde vervollstaendigt;
keine Assertion oder Schutzregel abgeschwaecht. Danach26/26 Beobachtungen.

Bereits abgeschlossene Gastbeitrags und Personenlistenpruefungen wurden nicht
unbegruendet wiederholt. Die neuen Faelle isolieren vorher gemeinsam gepruefte
Teilfehler, belegte Namen mit falschen Beziehungen und die neue Ereigniszeitfrage.

## Beleggrundlage und Arbeitsstand

Private Originalpakete bleiben ausserhalb dieses oeffentlichen Repositorys.
Die bereits dokumentierten Pflege und Personenbelege stehen in
[Ausschussbindung](ausschuesse-quellenbindung-2026-09-18.md) und
[Personenbindung](personen-quellenbindung-2026-09-18.md). Gastbeitrag: private
Notiz `Helmut_Gastbeitrag_Diagnose_20260918.md`, keine neue Ausfuehrung.

Zusaetzlicher Konzertbeleg im Originalpaket Version18:

| Datei | SHA256 |
| --- | --- |
| `Qualitaetsbefunde_A001_Zeit_Titel_20260915.json` | `b0b1e673505beaabd98f3b593c0a84fd4df394ba9941588484470abe5fcb3fdb` |
| `Pruefaufnahme_A001_34978454871.json` | `d6dc39293a7dcf2750d7cfdd5059d560e4948e583a5bfb140073dc9e9f18fdde` |
| `Pruefaufnahme_A001_34984794661.json` | `6da8ee383caede846d0e312f7366c6fbb81d8d5ebeed0dc7a1c9c6209f995455` |

Aufnahmen15.09.16:58:33.581 Tuerkei /15:58:33.581 Berlin /13:58:33.581 UTC
und17:55:32.669 Tuerkei /16:55:32.669 Berlin /14:55:32.669 UTC.
Keine gemeinsame transaktionale Aufnahme mit dem Originalvergleich.

Basis PR442: veroeffentlicht `c78203bf1337a6ed08191990b886872aa28b5fdd`, lokal
`be961fb628467d46d5fe9878d6d8cd4c24af831d`, gleicher Tree
`8774a01cbc6bf32cb08897b71ebc8b2c3cf39ef6`. Keine Commitgleichheit.
Eigener Folgebranch `codex/inhaltliche-beleggrenzen-20260918`.

Vorflug: main `2d1eb705e00ea5f5ff8f351997e429cc16d195c1`, PR433 bis442 offen,
Draft und ungemergt. Keine laufenden oder wartenden aktuellen Actions; nur
die zwei bekannten queued Altlaeufe vom06.08. Kein weiterer lokaler Schreiber
sichtbar. Globale Work Sitzungen technisch nicht abfragbar. Fremde Vorarbeiten
bleiben unangetastet. Artikelkontext AUS. Keine Production Wirkung.

Dieser Folgeblock aendert nur Dokumentation und die automatische Deploysperre
seines eigenen Branches. Kein neuer Anwendungscode, kein Modellaufruf, kein
Merge, Deployment, Datenbankzugriff, Profilwechsel, Cron oder Environment.
Der lokale Pflichtlauf gemaess CLAUDE.md Paragraph6 bestand vollstaendig:
**416/416 Suiten in797 Sekunden, Exit0**. Anwendungscode und Testbestand blieben
identisch zu PR442. Der kompakte Status wurde vor seiner Groessenpruefung unter
die unveraenderte30000 Zeichengrenze gekuerzt; diese Pruefung bestand im Lauf.
Anschliessend nur diesen Ergebnisabsatz ergaenzt. Alle Tests liefen ueber
`node scripts/lokal.js -- node ...`. Keine Schutzregel oder Zeitgrenze geaendert.
Die unabhaengige vollstaendige CI wird in der PR Abschlussbeschreibung
dokumentiert; kein weiterer Commit allein fuer den CI Nachtrag.

## Fortsetzung und Freigabegrenze

Naechster notwendiger Nachweis ist eine genau gebundene Eingabe samt roher
Modellantwort fuer die offenen semantischen Beziehungen. Bereits vorhandene
Originalabschnitte zuerst rein lesend suchen; einen exakten historischen
Request niemals aus einer spaeteren Aufnahme behaupten. Fehlt er dauerhaft,
einen begrenzten neuen isolierten Versuch vorbereiten und gesondert freigeben.
Ein neuer Versuch beweist aktuelles Verhalten, nicht die historische Ursache.

Vor jedem kostenpflichtigen Versuch festlegen: ausgewaehlte Faelle, genaue
Eingaben, Modell und Prompt, maximale Aufrufzahl und Gesamtkosten, vorhandene
Reserven, Laufzeit, Stoppbedingungen und unabhaengige Bewertung der gesamten
Antwort. Kein Wiederholen des einmaligen Gipfelversuchs. Keine automatische
Importierung in Production Inhalte. Die bestehende4 USD Tagesgrenze bleibt.

Eine Freigabe fuer solche isolierten Modellaufrufe samt notwendigen
Kostenbuchungen waere neu erforderlich. Merge, Production Deployment,
Artikelkontextaktivierung und neuer500er Test sind davon getrennte Freigaben.
Weder dieser Dokumentationsabschluss noch gruene CI erteilen sie.
Rueckweg vor Merge: ungemergten Folgebranch verwerfen.
