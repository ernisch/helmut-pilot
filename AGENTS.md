# HELMUT AGENT CONTRACT

Stand: 28.11.2026. Diese Datei fuehrt Arbeitsweise, Freigaben und Zusammenarbeit.
Technische Sicherheitsregeln: [CLAUDE.md §4–6](CLAUDE.md).
Aktueller Betrieb und Belege: [CURRENT_STATE.md](docs/CURRENT_STATE.md).
Aktueller Quellen Normalbetrieb: [ARCHITECTURE.md](docs/ARCHITECTURE.md) und
[Hetzner Produktionsbeleg](docs/betrieb/hetzner-live-20261123.md).
Vercel ist fuer Quellen nur geschuetzter manueller Rueckweg; keine schwere
Quellenarbeit auf Vercel und keine zwei parallelen Quellenverbraucher.

## Verbindlicher lokaler Arbeitsablauf vom 28.11.2026

Die gesamte Entwicklung erfolgt lokal auf dem Mac in Codex. GitHub
`ernisch/helmut-pilot`, Branch `main`, ist die aktuelle gemeinsame Code- und
Dokumentationsbasis. Bestehende GitHub-CI bleibt die externe Pflichtabnahme.
Hetzner ist Betriebsziel, kein Entwicklungsort; dort keine neuen Codex-,
Agenten-, Entwicklungs- oder Testlaeufe starten. Bereits vorhandene Server-
Arbeitsbereiche und offene Sitzungen nicht eigenmaechtig loeschen oder beenden.

Vor **jedem neuen Entwicklungsauftrag**, noch vor Implementierung:

1. Branch, HEAD, Index, lokale geaenderte, unversionierte und ignorierte Dateien,
   Worktrees, laufende Arbeit und relevante offene PRs rein lesend pruefen.
   Offene Arbeit vor jedem betroffenen Checkout/Update nachvollziehbar sichern:
   Patches fuer Index/Arbeitsbaum, Commitbindung und Dateimanifest mit SHA256;
   private Dateien nur verschluesselt ausserhalb von Git. Sicherung ruecklesen.
2. `origin` auf das genannte Repository pruefen und `git fetch origin` ausfuehren.
   Bei fehlendem Zugang keinen alten Stand als aktuell behandeln. Vor Uebernahme
   lokale Abweichungen und auch Kollisionen mit ignorierten Dateien pruefen.
3. Lokalen `main` bei sauberem Index/Arbeitsbaum und kollisionsfreien lokalen
   Zusatzdateien ausschliesslich mit `git merge --ff-only origin/main`
   aktualisieren; relevante Regeln und Dokumentationen aus diesem Stand lesen.
   Neue Arbeit auf eigenem `codex/`-Branch vom aktuellen `origin/main` beginnen.
   Bei offenen Aenderungen, Divergenz oder paralleler Arbeit isolierten lokalen
   Worktree nutzen; bestehende beauftragte Arbeit kontrolliert integrieren und
   neu pruefen. Kein Reset, Clean, Force-Push, automatisches Stash/Pop oder
   Wiederaufnehmen alter Branches/Archive als aktuelle Entwicklungsbasis.
4. Nach Abschluss nur auftragsbezogenen Code und zugehoerige Dokumentation
   explizit stagen, pruefen, committen, pushen und per PR gemaess der folgenden
   Dauerfreigabe integrieren. Vor Merge erneut aktuellen `main` und Parallelitaet
   pruefen; danach fetch, lokalen `main` sicher per Fast-Forward nachziehen und
   Gleichstand belegen. Bei Blockade Branch/Commit/PR und Sicherung erhalten.

Codex fuehrt die notwendigen Befehle selbst aus. Bestehende SSH-/Schluesselbund-
Zugaenge und verbundene Tools fuer Hetzner, Supabase, GitHub und Vercel verwenden;
keine regelmaessige Terminalmitwirkung des Betreibers voraussetzen. Sandbox,
Hostschluesselpruefung, Produktionsschutz und Kostenfreigaben bleiben erhalten.
Zugang ist keine Schreibfreigabe. Abgelaufene Anmeldung oder fehlende Rechte
konkret benennen; keine Schutzumgehung oder neue Berechtigung ableiten.
Kanonische Befehle, Zugangsgrenzen und Sicherungsbelege:
[Lokale Mac-Entwicklung](docs/betrieb/mac-arbeitsablauf-20261128.md).

## Verbindliche Dauerfreigabe vom 11.11.2026: Push und Merge automatisch bei Gruen

Fuer jeden klar beauftragten Entwicklungsauftrag sind Commit, Push auf den
eigenen Arbeitsbranch, Pull Request und Merge nach `main` dauerhaft ausdruecklich
freigegeben. Codex fuehrt diese Schritte vollautomatisch ohne erneute Rueckfrage
oder einzelnes GO aus, sobald die jeweils erforderlichen Pruefungen gruen sind.
Das durch den Merge regulaer ausgeloeste Vercel Production Deployment und die
anschliessende rein lesende Nachkontrolle sind eingeschlossen. Diese Freigabe
gilt auch fuer die vorliegende Regelaenderung.

Vor dem Push muessen die erforderlichen lokalen Pruefungen bestanden und der
Diff auf den Auftrag begrenzt sein. Die PR-CI folgt nach dem Push. Vor dem Merge
bedeutet **alles gruen**:

1. Der tatsaechliche aktuelle PR Kopf und sein vollstaendiger Diff sind geprueft;
   die Abnahmekriterien und erforderlichen Sicherheitspruefungen sind erfuellt.
2. Beide Pflichtchecks `Syntax + Offline-Suiten` und
   `Browser-/Mobile-Smoke (Chromium)` sowie weitere fuer die Aenderung erforderliche
   Pruefungen sind fuer genau diesen PR Kopf erfolgreich abgeschlossen.
   Bewusst ausgelassene, nicht betroffene Testarten innerhalb eines erfolgreichen
   Pflichtchecks sind gemaess dem bestehenden Pruefplan zulaessig.
3. Der aktuelle `main` Stand und parallele Arbeit sind geprueft; der PR ist
   konfliktfrei und beeintraechtigt keine laufende Originalserie oder Pruefung.
   Nach einer Aenderung des PR Kopfes muessen die Nachweise zum neuen Kopf passen.
4. Keine erforderliche Pruefung ist fehlgeschlagen, ausstehend, abgebrochen oder
   UNKNOWN; es gibt keinen offenen abnahmeverhindernden Befund. Merge an den
   geprueften Commit binden. Kein Force Push, keine Admin Umgehung und keine
   Abschwaechung von Schutzregeln.

Behebbare auftragsbezogene Fehler selbst korrigieren und gezielt erneut pruefen;
bei laufender CI warten, bis die benoetigten Ergebnisse vorliegen. Erst bei
erfuellten Bedingungen mergen. Nach dem Merge Wirkung und regulaeres Deployment
rein lesend kontrollieren; bei reinen Doku- oder Agentenregeln einen bewusst
uebersprungenen Build als solchen bestaetigen.

Diese aktuelle Freigabe ersetzt widersprechende aeltere Forderungen nach einem
separaten Push-, Merge- oder regulaeren Deployment-GO, auch in `CLAUDE.md` und
historischen Dokumenten. Eine spaetere ausdrueckliche Einschraenkung des Nutzers
hat Vorrang. Fremde oder unabhaengige PRs sind nicht eingeschlossen. Fuer sonstige
geschuetzte Production Aktionen gilt weiterhin der Abschnitt `Production Schutz`.

## Betreiberfreigabe vom 17.11.2026: autonome Quellen-Zusatzstarts

Der Betreiber hat den konkreten Zusatzstartauftrag und dessen Umsetzung mit
„Go! Du hast jede Freigabe!“ bestaetigt. Codex darf Quellenlaeufe selbststaendig
ueber den geschuetzten bestehenden Cronzugang starten und notwendige echte
Verarbeitung innerhalb unveraenderter 1 USD/UTC-Tag und 30 USD gesamt ausfuehren.
Keine erneute Freigabefrage fuer denselben beschriebenen Umfang.

Konkret fuer17Nov: genau ein zusaetzliches Fenster bis300Sekunden, additiv bis
9Fenster/2700Sekunden bei bestehender Basis8/2400/16Originalen; keine Zaehler
zuruecksetzen und Originalgrenze16 nicht erhoehen. Fehlende autorisierte BMG-
Planarbeit darf idempotent ergaenzt werden, ohne alte Manifeste, abgeschlossene
Jobs, Erfolge oder UNKNOWN-Sicherungen umzuschreiben. Der Maschinenauftrag
verwendet Cronauthentifizierung und einen einmaligen tagesgebundenen Auftrag;
Admin-UI, echte Adminsession und CSRF-Schutz bleiben erhalten. Keine neue
Infrastruktur, Secrets oder Crontermine. Vor Livebetrieb gelten weiterhin
gruene exakte Pflicht-CI, unabhaengiger Review und regulaeres Deployment.

Die umfassende Fortsetzungsfreigabe umfasst den einmaligen Ersatz des belegten
Fehlstarts17Nov09:43 (Run-ID admin-quellen-2026-11-17-5d84f123-2e13-4163-a6f9-4b6e2d82827b):
echte Fehlerquittung auf3e174583, null Workerarbeit und9/2700 belegen. Nach
Readbackreparatur genau ein weiterer atomarer Zusatzkey, additiv10/3000/16;
vorherige Reservierung erhalten, kein Reset, kein Retry bei UNKNOWN. Gleiche
Geldgrenzen und Sicherheitspruefungen; keine allgemeine Wiederholungserlaubnis.

Die Quellen- und Verarbeitungsfreigabe ist keine Lizenz fuer fremde Inhalte,
keine Aufhebung externer Zugriffssperren und keine Freigabe fuer Massentests
oder zusaetzliche kostenpflichtige Tests. Sonstige Schutzregeln bleiben.

## Verbindliche Dauerfreigabe vom 15.11.2026: Quellenbetrieb in der Aufbauphase

Der Betreiber erteilt bis zum ausdruecklichen Widerruf eine **vorab erteilte,
eng begrenzte Production-Freigabe** fuer die kleinste reversible Einbindung und
Aktivierung von nachweislich zulaessig nutzbaren Quellen innerhalb der
bestehenden Quellenarchitektur. Codex darf dies **ohne erneutes Betreiber-GO**
umsetzen. Dies ist eine Ausnahme vom allgemeinen Production-Schutz, jedoch
**keine pauschale urheberrechtliche Lizenz** und keine Freigabe fuer
unbekannte Quellenrechte. Die Aufbauphase ersetzt keine Quellenlizenz.

### Konkret freigegeben: Destatis und iRights

Die vollstaendig beschriebene Aktion in
[der konkreten Freigabevorlage](docs/betrieb/quellen-einbindung-freigabe-20261115.md)
ist hiermit ausdruecklich als eigener, eng begrenzter Umfang freigegeben:
die zwei dort exakt bezeichneten RSS-Feeds von Destatis und iRights,
die fuer diese Feedidentitaeten vorgesehenen Nutzungsflags
commercialUseApproved:true und rightsReviewRequired:false, ausschliesslich
erlaubte kommerzielle Textauszuege mit Originalnachweis und Attribution,
genau sechs neue Production-Katalogzeilen und die beiden dort bezeichneten
Paketaktivierungen. fullTextAllowed:false, imagesAllowed:false und
aiTrainingAllowed:false bleiben unveraendert. Bei Destatis nur die nach
allgemeinen Originalbedingungen zulaessigen RSS-Auszuge; abweichende
Einzelbedingungen sperren. Bei iRights nur artikelweise belegte CC BY 4.0
Textauszuege, deren kompletter Herkunfts-/Lizenzhinweis im Kundenausgabepfad
nachweisbar ist. Alle anderen Artikel bleiben Titel/Link; keine
Bilder/Volltexte oder Lizenzuebertragung auf andere Quellen.

Die Freigabe umfasst die atomare, vorwertgebundene und reversible
Production-Katalogeinbindung unter **saemtlichen Voraussetzungen und
Schutzgrenzen der verlinkten Vorlage**. Keine Vollseed-Anwendung,
Migration oder Aenderung anderer Altpfade, Profile, Cronjobs, Secrets,
Budgets oder Sicherheitsschwellen. Der Merge dieser Regel fuehrt selbst
keine Datenbank- oder Quellenaktivierung aus.

### Dauerfreigabe auch fuer kuenftige klar lizenzierte Quellen

Weitere Quellen derselben bestehenden Architektur duerfen autonom bis zur
Aktivierung umgesetzt werden, **nur wenn alle Bedingungen erfuellt sind**:

1. Originalfeed, Herausgeber, kommerziell erlaubter Nutzungsumfang und
   Lizenzbedingungen sind anhand primaerer Belege dokumentiert; eventuelle
   Artikel-Lizenzen gelten nur fuer die einzeln belegten Artikel. Ein RSS,
   Disclaimer oder fremder Quellenhinweis allein erteilt keine Rechte.
2. Die existierenden Reader und Ausgabepfade erhalten nachweislich
   Original-URL, Autor soweit erforderlich, Herausgeber, echtes
   Publikationsdatum, Lizenz, Attribution und Bearbeitungshinweis.
   Kein ungepruefter Volltext, keine Bilder, kein Training, keine
   Paywallumgehung oder Inhaltsverfaelschung.
3. Nur kleine quellenspezifische Codeflags und atomare, vorwertgepruefte,
   idempotente und reversible Production-Quellenkatalogzeilen sowie die
   klar zugehoerigen Paketstatus sind umfasst. **Keine** Migration,
   Mandats-/Profil-/Kundendatenaenderung, neue Ressourcen, neuen Anbieter,
   Cron-, Secret-, Budget-, Sicherheits- oder Quotenveraenderung.
4. Keine parallele Arbeit oder laufende Originalserie beeintraechtigen.
   Vor Merge sind betroffene gezielte Tests, unabhaengiges Review und
   beide gruene Pflichtchecks am exakten PR-Kopf erforderlich.
   Nach Aktivierung nur lesend Katalog, regulaere Abrufquittungen,
   Attribution, Kosten und Rueckweg pruefen. Teilversorgung bleibt partial.

Die vorhandene Einprofilbetriebsfreigabe mit **1 USD je UTC-Tag und 30 USD
insgesamt** bleibt unveraendert. Regulaere ohnehin autorisierte
Tagesverarbeitung darf im vorhandenen Rahmen laufen, aber kein
zusaetzlicher Admin-/Test-/Massenlauf und kein neuer kostenpflichtiger
Modellaufruf wird dadurch erlaubt. Alte Reserven, Limits und Abbruchwachen
bleiben unveraendert.

Falls Rechte, Attribution, Vorwerte, Kostenfreiraum oder Rueckweg nicht
belegt werden koennen: Quelle inaktiv lassen, den konkreten Blocker
**einmal** dokumentieren und mit anderer sicherer Arbeit fortfahren.
Bei unveraendertem Sachstand **nicht dieselbe Freigabefrage wiederholen**.
Erst bei neuem erheblichen Risiko, Abweichung vom genehmigten Umfang
oder einer echten Betreiberentscheidung erneut fragen. Diese Regel
erteilt keine rechtliche Freigabe des Gesamtprodukts, insbesondere
nicht zu politischen personenbezogenen Daten, DSFA oder Kundenvertraegen.

## Verbindliche Betreiberentscheidung vom 07.11.2026: DeepSeek bis Jahresende pausiert

**Ab sofort bis einschliesslich 31.12.2026 kein DeepSeek Einsatz.**
Keine DeepSeek Modelle, Agenten, Helfer, Reviews, Delegationen oder API Aufrufe
starten, weder automatisch noch manuell und auch nicht ueber den bestehenden
`scripts/deepseek-cloud-router.js`. Entwicklungsaufgaben in Codex ausschliesslich
mit dort verfuegbaren OpenAI Modellen erledigen, um das vorhandene OpenAI
Kontingent zu nutzen. Das ist keine Freigabe fuer zusaetzliche kostenpflichtige
OpenAI API Aufrufe oder Production Aktionen.

Der DeepSeek Router, vorhandener Code, Tests, Dokumentation und Zugangsdaten
bleiben erhalten. Die normale CLI Ausfuehrung des Routers ist technisch pausiert.
Am 01.01.2027 keine automatische Wiederaktivierung: Nur nach erneuter
ausdruecklicher Betreiberentscheidung die Pause entfernen. Diese aktuelle Regel
hat Vorrang vor allen aelteren DeepSeek Standardrollen, Delegationsregeln und
historischen Aktivierungsangaben in diesem Repository.

## Sprintstart: kurz und rein lesend

1. Geltende `AGENTS.md` lesen, einschliesslich Regeln betroffener Unterordner.
2. In `docs/CURRENT_STATE.md` den Statuskopf und die auftragsrelevanten Abschnitte
   lesen. Historische Zwischenstaende sind keine neuen Arbeitsauftraege.
3. `CLAUDE.md` §4–6 fuer technische Aenderungen lesen; sonst nur betroffene Regeln.
   Produktfragen: passende Abschnitte in `docs/START_HERE.md`; weitere Fachquellen
   stehen in `CLAUDE.md` §3. Keine pauschale Volllektüre dieser Dokumente.
4. Branch, Commit, aktuellen `main`, lokale Aenderungen, relevante offene PRs,
   laufende Prozesse/Worktrees und parallele Arbeit am selben Bereich pruefen.
   Passende vorhandene Arbeit fortsetzen statt doppelt implementieren.

Im laufenden Auftrag nur geaenderte oder neu relevante Informationen nachlesen.
Grosse Dateien abschnittsweise mit gezielter Suche erschliessen. Keine rekursive
Repository-Inventur, Vollhistorie oder wiederholte Zusammenfassung ohne Anlass.
Production nie aus Erinnerung annehmen. Bekannte rein lesende `gh`-/`ps`-Pruefungen
mit erforderlicher Berechtigung ausfuehren; das erweitert keine Schreibfreigabe.

## Wahrheitsquellen

Auftrag und neueste ausdrueckliche Betreiberentscheidung bestimmen die Freigabe;
fuer Push/Merge gilt der unveraenderte Vertrag oben. Technischer Iststand:
Production-Primaerbelege vor Repository/Commits/PRs/Checks/Deployments, danach
`docs/CURRENT_STATE.md`, Fachdokumentation und historische Berichte/Gespraeche.
Eine Anweisung beweist keine Umsetzung. Bei Widerspruch gezielt klaeren;
historische Zahlen, PASS, FAIL, STOP und UNKNOWN niemals umwerten.

## Zeitangaben für den Betreiber

In Antworten, Statusberichten, Übergaben und Terminangaben für den Betreiber
alle Uhrzeiten ausschließlich in Berliner Zeit (`Europe/Berlin`) angeben.
Diese Vorgabe ersetzt frühere Präferenzen für eine andere Anzeigezeitzone.

## Rolle und Produktziel

Helmut ist ein politischer KI Stabschef fuer Bundestag und Landtage einschliesslich
Stadtstaaten; erste Marktetappe Bundestag/Berlin/Brandenburg, danach weitere Laender.
Belegte Lage, Radar, Briefing und Bueroausgaben muessen ihren eigenen Zweck erfuellen.
Keine erfundenen Quellen, Aussagen oder Standpunkte; Tatsachen und Einordnung trennen,
Unsicherheit und Leerzustaende ehrlich zeigen. Keinen gleichen Sachstand als neue
Aussage mehrfach ausgeben. Produktprinzipien: `docs/START_HERE.md`.
Verbindliche redaktionelle Briefingziele, Quellenpriorisierung und Wortlaengen:
`docs/produktvertrag-20261115.md` Abschnitt H. Fachliche Richtwerte sind keine
Erlaubnis, Prioritaeten oder Inhalte ohne gueltige Originale zu erzeugen.

Betreiberbeschluss 05.11.2026: Mock100, danach sichere Produktintegration und
verkaufbarer Livebetrieb fuer einen kleinen Kundenkreis. Authentifizierung,
Mandantentrennung, Datenschutz, Funktion, Kostenkontrolle und Betriebsbereitschaft
bleiben Voraussetzung. Ein Mock-PASS allein ist kein Production-Funktionsnachweis.
**Kein weiterer Mock500 und kein gesonderter Production100-/Production500-Lasttest.**
Der konkrete Nachweisstand steht ausschliesslich in `docs/CURRENT_STATE.md`.

## Verbindliche Zielgruppe: AfD ausgeschlossen

Keine AfD-zugehoerigen Bundestags-/Landtagsprofile anlegen, importieren, aktivieren
oder versorgen, auch nicht als Testzielprofile. Aktuelle Partei UND Fraktion
pruefen, einschliesslich fraktionsloser AfD-Mitglieder; nichts umdeklarieren.
Bei realen Profilen amtliche Zugehoerigkeit vor Import belegen, Ungeklaertes sperren.
Fiktive Profile nutzen deklarierte Szenariowerte statt erfundener Personenbelege.
Andere Parteien und Fraktionslose bleiben grundsaetzlich zulaessig. Nachrichten
UEBER die AfD bleiben erlaubt. Nur isolierte synthetische Negativfaelle der Sperre,
niemals angelegte oder versorgte AfD-Testkunden. Vorrang vor aelteren Testplaenen;
Code: `lib/helmut/profil-zulassung.js`.

## Modell und Arbeitsumgebung

Codex und bestehende GitHub CI mit Offline-Mocks und isolierter Datenbank verwenden.
Modell und Denkstufe waehlt der Betreiber; keine heimliche Umstellung oder automatische
Eskalation. Entwicklungsarbeit nur innerhalb vorhandener autorisierter Kontingente;
Modellauswahl ist keine API-Kosten- oder Production-Freigabe. Die DeepSeek-Pause oben
gilt auch fuer Reviews und Helfer. Routercode, Tests und Zugangsdaten bleiben erhalten.

### Subagenten und Parallelisierung

Bis zu **drei unabhaengige Agenten insgesamt**, jeweils mit klarem Teilauftrag,
Abnahmekriterien und eigenem Branch; bei gemeinsamer Arbeitsumgebung eigene Worktrees
oder eindeutig getrennte Dateien/Bereiche. Nur parallelisieren, wenn es konkret Zeit
spart. Kleine Aufgaben allein erledigen; keine Pflichtdelegation, Helferkette oder
neue Koordinationsinfrastruktur. Vorhandene geeignete Helfer weiterverwenden.

Vor dem Start kurz Aufgabe, Schreibbereich, lesen/schreiben und tatsaechliches Modell/
Denkstufe nennen. Nur bestaetigte Starts zaehlen; Abschluss, Fehler und Modellwechsel
sichtbar aktualisieren. Keine erfundenen Helfer oder stillen Modellwechsel.

Keine gleichzeitigen Schreibzugriffe auf dieselbe Datei, denselben Test, gemeinsame
Statusdokumente oder denselben Production-Bereich. Fremde Aenderungen nie ueberschreiben.
Bei unklarer Production-Parallelitaet nicht schreiben. Ueberschneidungen nacheinander
bearbeiten; fuer gemeinsame Dateien und die Integration einen Verantwortlichen festlegen.
Kein Agent aendert waehrend einer Pruefung deren gebundene Eingaben oder ihren Codekopf.

Uebergaben enthalten Ergebnis, Dateien/Commit, tatsaechliche Pruefungen, Risiken und
einen naechsten Schritt. Ergebnisse uebernehmen und auf Diff, Integration, Widersprueche,
Abnahmekriterien und Sicherheitsfolgen pruefen. Keine zweite Vollanalyse oder Testkopie
ohne konkreten Fehler, Luecke oder Sicherheitsgrund. Jeder PR erfuellt den Mergevertrag
oben; bei Ueberschneidung erst integrieren, dann am neuen Kopf pruefen und nacheinander
mergen. Unabhaengige Arbeit darf waehrend CI weitergehen, soweit ihr Ergebnis nicht
davon abhaengt und keine laufende Originalserie beeintraechtigt wird.

### Kompakte DeepSeek Übergabe

Nur als erhaltener Routervertrag fuer eine spaeter ausdruecklich freigegebene Nutzung:
Ausschliesslich `scripts/deepseek-cloud-router.js` via Responses API, nur mit
`DEEPSEEK_API_KEY` und erreichbarer API. Keine automatische Wiederaktivierung.
Ziel, relevante Dateien, Kriterien und Schutzgrenzen statt Chatverlauf uebergeben;
keine Secrets oder unnoetigen Originaldaten. Nur benannte Dateien mit Pfad/SHA256,
kein verschachteltes Codex, keine zweite Sandbox, Shell oder freier Workspacezugriff.
Ersatzinhalte nur fuer vorher erlaubte exakt hashgebundene Pfade; Drift stoppt.
Keine Production-, Profil-, Migrations-, Cron-, Env-, Azure-, Budget-, Nachrichten-,
Ressourcen-, Git- oder Freigabeaktionen durch DeepSeek. Keine eigenen Shelltests oder
erfundenen Testergebnisse. Sichtbare Rueckgabe etwa 2000 Zeichen: hoechstens vier
Befunde, Dateien, Tests als `not run`, Risiken, ein naechster Schritt. Flash High fuer
Routine, Pro High fuer schwierige abgegrenzte Probleme; keine automatische Eskalation
oder Wiederholung. **Dieser Abschnitt hebt die Pause nicht auf.**

## Grundregel

Den kuerzesten sicheren Weg zum beauftragten Ziel gehen. Nur notwendige Dateien
und aktuelle belegte Blocker bearbeiten; keine Nebenprojekte, unnoetigen Refactorings,
kosmetischen Umbauten oder neuen Funktionen ohne Auftrag. Bewaehrte Vorbilder nur
bei belegtem Engpass fuer die kleinste passende Loesung nutzen. Keine neue Infrastruktur
oder Anbieter allein wegen eines Vorbilds. Fremde/unabhaengige PRs sind kein Auftrag.

## Supabase Support: faktenbasierte Ticketentwuerfe

Wenn bei einem beauftragten Arbeitsschritt ein belegter Fehler auftritt, bei dem
Supabase Support tatsaechlich helfen koennte, zuerst den eigenen Anwendungscode,
die vorhandene Konfiguration und bereits dokumentierte Ursachen gezielt pruefen.
Nicht jeden Codex, Netzwerk oder Produktfehler als Supabase Fehler einstufen.
Keine neuen Massentests, kostenpflichtigen Versuche oder Diagnosesysteme starten.

Falls Support sinnvoll bleibt, ohne erneute Aufforderung einen kurzen
**englischen Ticketentwurf** fuer den Betreiber aus vorhandenen Belegen erstellen.
Reihenfolge der Abschnitte: Summary, Impact, Expected behaviour, Actual behaviour,
Steps to reproduce, Environment, Troubleshooting completed, Evidence, Request.
Nur gesicherte Fakten, genaue Fehlermeldungen, relevante Projektkennung,
Zeitpunkte samt Zeitzone, knappe Logs oder Request IDs und belegte bisherige
Versuche aufnehmen. Unklare Punkte deutlich kennzeichnen, keine Ursachen,
Reproduktionsschritte oder Ergebnisse erfinden. Unter 300 Woerter anstreben,
essentielle Codeauszuege ausgenommen; hoechstens drei Fragen unter
Missing information, falls wirklich erforderlich.

Vor der Ausgabe personenbezogene Daten, Mandatsinhalte, Zugangsdaten,
Passwoerter, API Keys, Tokens und sonstige Secrets entfernen. Keine rohen
Logdumps oder vertraulichen Originale in Git, PRs oder Supporttickets ablegen.
Entwurf dem Betreiber zur Pruefung vorlegen; **kein automatisches Absenden,
keine externe Kontaktaufnahme oder verbindliche Zusage ohne konkrete Freigabe**.
Ist Support nicht sinnvoll, knapp den internen Blocker und genau einen
naechsten Schritt nennen.

## Tests

Gezielt pruefen, wenn geaenderte Funktion, Fehlerreproduktion, geltender Pruefvertrag
oder Production-Sicherheit es erfordern. Vorhandene Nachweise wiederverwenden;
keine Vollsuite, Browser- oder Datenbankgesamtabnahme aus Vorsicht. Lokale Testlaeufe
**immer ueber `scripts/lokal.js`**, auch einzelne; technische CI-Regeln in `CLAUDE.md` §6.

Beide Pflichtchecks bleiben bestehen. `scripts/ci-pruefplan.js` waehlt unveraendert
fail closed nach tatsaechlichen Dateien:

- Reine Dokumentation/Agentenregeln: keine grosse Offline-, DB- oder Browserpruefung.
- Zugeordnete Fachaenderung: Syntax, Schnellkern und betroffene Bereichstests.
- UI/browserrelevante Aenderung: zugehoerige Pruefungen plus Browser-Smoke.
- Datenbank, Kapazitaets-/Mock100-Schutz, geteilte Kerndateien, CI-Auswahl,
  Abhaengigkeiten oder unklare Zuordnung: konservative Offline-/DB-Pruefungen.

Gemäß Betreiberentscheidung in #1266 bleiben historische 500er Läufe in
allen aktiven Auswahlen gesperrt. Kleine native Prüfungen für Rechte,
Mandantentrennung, Leases, Anbieterreservierungen und Rückwege bleiben Pflicht.

Bewussten Skip ehrlich benennen; er ist kein ausgefuehrter Test. Pflicht-CI nicht
lokal duplizieren. Status in sinnvollen Abstaenden pruefen, keine Sekundenabfragen.
Produkt- und Umgebungsfehler unterscheiden. Hoechstens zwei gezielte Versuche desselben
technischen Wegs, dann Ursache neu bewerten. Erstfehler und letzten bestaetigten
Fortschritt erhalten; UNKNOWN bleibt UNKNOWN, keine Blindtests oder Endlosschleifen.

## Production Schutz

Auftragsbezogene gruene Merges und regulaer ausgeloeste Vercel Deployments sind durch
die Dauerfreigabe vom 11.11. autorisiert. Die eng begrenzte Quellen-Ausnahme vom
15.11. oben umfasst nur die dort belegten quellenbezogenen Production-Aktionen.
Sonstige geschuetzte Aktionen brauchen GO
fuer konkrete Aktion, Umgebung und Umfang: sonstige Deployments/Umschaltungen,
Migrationen, Production-Daten-/Profilanlage, Bearbeitung, Aktivierung, Deaktivierung
oder Loeschung; Cron; Secrets/Umgebungsvariablen; Azure; Budget/Reserven;
kostenpflichtige Production-Modellaufrufe; externe Nachrichten/verbindliche Zusagen;
neue kostenpflichtige Ressourcen. Weitere Verbote in `CLAUDE.md` §5 gelten unveraendert.

Keine Freigaben ausweiten: Provisionierung ist keine Aktivierung, Aktivierung kein
Funktionsnachweis, ein Test-GO kein GO fuer weitere Stufen. Schutzwachen, Originale,
Journale, Einmalbindungen, Daten und Rueckweg erhalten. Verbrauchte Laufrechte nicht
wiederverwenden; unbekannten Schreibausgang erst lesend klaeren, kein blinder Retry.

## Kritische Aktionen

Vorher Aenderung, Umgebung, Wirkung, Risiko, Kosten, rein lesende Nachkontrolle und
Rueckweg konkret festhalten. Nur mit bereits gueltiger Freigabe handeln, sonst stoppen.
Fuer auftragsbezogene gruene Merges/regulaere Deployments gilt die Dauerfreigabe oben.
Bei FAIL/UNKNOWN betroffenen Merge/Rollout stoppen, Erstfehler erhalten und
auftragsbezogene Fehler beheben. Erforderliche unabhaengige Sicherheitsabnahmen bleiben
Pflicht; gruene CI ersetzt keine Freigabe fuer geschuetzte Production-Aktionen.

## Kostenpflichtige Modell- und API-Aufrufe

Keine neuen API-Kosten aus Entwicklungs- oder Mergefreigaben ableiten. Bezahlte
Production-Modelltests brauchen gesondertes ausdrueckliches GO: exakte Profile,
maximale Gesamtkosten, aktuelle Tagesgrenze, Laufzeitgrenze, Erfolgskriterien,
Stoppbedingungen und Umgang mit Testprofilen danach vorab festlegen. Aktuelles
Kostenbuch einschliesslich bestehender Ausgaben und offener Reservierungen pruefen.
Keine unbegrenzten Wiederholungen, stillen Erhoehungen, neuen Abos oder dauerhaft
kostenpflichtigen Ressourcen.

Der bestehende Einprofilbetrieb hat **1 USD je UTC-Tag / maximal 30 USD insgesamt**;
Umfang und Belege: [Betriebsauftrag](docs/betrieb/cem-einprofilbetrieb-20261105.md),
`docs/CURRENT_STATE.md`. Das ist keine neue Modelltestfreigabe. Historische 6/7 USD
sowie der hashgebundene EU-Vertrag 82,036000 USD/UTC-Tag / 88,845364 USD kumulativ,
0,081400 USD Reserve nur fuer neue EU-Tickets, `gpt-5-mini-eu`/DataZoneStandard/
Sweden Central bleiben unveraendert fuer ihren dokumentierten Umfang erhalten.
Kein Uebertragen auf andere Laeufe: aktuelle Primaerbelege und ausdrueckliches GO
pruefen; hoeherer/ungeklaerter Bestand oder Widerspruch stoppt, keine Erhoehung.
Originale: [Septemberauftrag](docs/betrieb/autonom-bis-500-starttor-20260926.md),
[EU-Vertrag samt Revisionen](docs/betrieb/blocker3-eu-servicekostenvertrag-umsetzung-20261011.md).

## Mock100 Nachweis und anschliessender Livegang

Der technische Synthetiknachweis verlangt exakt 100 gleichzeitig aktive fiktive Profile
mit gebundenen Eingaben, Nutzer-/Quellentrennung, vollstaendigen Ergebnissen, Fehler-
und Abschlussbelegen sowie sicherer Bereinigung. Keine realen personenbezogenen
Testprofile und keine bezahlten KI-Aufrufe; echte Bestandsdaten werden dadurch nicht
anonymisiert oder rechtlich freigegeben. Nur ein tatsaechlicher Lauf begruendet PASS.
Zaehler/Erwartungen nicht ungeprueft aus 500er Artefakten uebernehmen. Erledigte Nachweise
nicht wiederholen; aktueller Stand und genaue Ergebniszahlen: `docs/CURRENT_STATE.md`.
Liveintegration muss Datenschutz, Sicherheit, Funktion und Kostenkontrolle belegen;
kein neuer Production100-/Production500-Test oder Lasttestsystem.

## Dokumentation und Abschluss

Eine kanonische Stelle je Information, nur geaenderte Statuszeilen pflegen. Erkenntnisse,
Ursachen und gescheiterte Wege erhalten; historische Belege verlinken statt wiederholen.
`CURRENT_STATE.md` bleibt datiert, maximal 30.000 Zeichen/350 Zeilen. Architekturdateien
nur bei Architektur-, Produktorientierung nur bei Produktaenderung aktualisieren.
Abschluss und Nach-Merge-Pflichten: `CLAUDE.md` §8–9; kein rekursiver Doku-Folge-PR.

Kurz auf Deutsch berichten: belegter Status (erfolgreich/teilweise/blockiert/gescheitert),
Ergebnis, echte offene Punkte und genau ein naechster Schritt. Freigaben, Threadwechsel
oder Denkstufe nur nennen, wenn daraus eine konkrete Entscheidung folgt. Keine privaten
Gedankenprotokolle, erfundenen Helfer, Laufzeiten, Prozentwerte oder Production-Erfolge.
Waerend laengerer Arbeit sinnvolle Zwischenbefunde und echte Blocker sichtbar nennen.

## Threadwechsel und Übergabesicherung

Im selben stabilen Thread weiterarbeiten; Merge/Sprintabschluss allein erzwingt keinen
Wechsel. Wechsel bei Kontextlimit, wiederholten technischen Problemen, deutlich anderem
Problemfeld oder ausdruecklichem Wunsch. Ein neuer Chat beendet keine Prozesse.
Bei Bedarf eine knappe Uebergabe mit Ziel, Stand/Zeitpunkt, Branch/Commit/PRs,
Production-Belegen, Blockern, Prozessen/Worktrees, Freigaben/Kosten, naechstem Schritt
und Kriterien. Zugriffe und Originale im empfangenden Workspace pruefen.

Private Originale nur soweit noetig ueber vorhandenen autorisierten vertraulichen
Speicher sichern, mit Manifest, Dateigroessen und SHA256-Verifikation. Keine Secrets,
Token, privaten Schluessel oder unverschluesselten vertraulichen Originale in Chat,
Git oder offenen Drive; private Schluessel nicht uebertragen. Vorhandene sichere Archive
nicht grundlos erneut sichern. Fehlende Originale/Zugaenge benennen, nichts nachbauen.

## Wichtigste Regel

Sicherheit und belegbare Wahrheit haben Vorrang vor Geschwindigkeit. Innerhalb dieser
Grenze zaehlt der kuerzeste Weg zum beauftragten Ziel. Alle historischen Nachweise,
Fehler, Journale und Freigabeversionen bleiben erhalten. Fruehere Agentenanweisungen:
[unveraenderter Stand vor dieser Straffung](https://github.com/ernisch/helmut-pilot/tree/8293a307334d5eec5ccbbea5c07d5be5c68d9da7).
`docs/ROADMAP_BIS_500.md` und alte 500er Arbeitsauftraege sind historische Orientierung.
