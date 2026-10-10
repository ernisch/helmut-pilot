# Roadmap bis zum 500er Production Nachweis

Stand: 10.10.2026

Diese Datei ist die verbindliche Reihenfolge bis zum 500er Production Nachweis.
Sie dient Codex als kurze Arbeitsroadmap. Aktueller Production Stand und Belege
stehen weiterhin in `docs/CURRENT_STATE.md`.

**Aktuelle Steuerung vom 01.10.2026:** Der technische 500er Nachweis verwendet
ausschliesslich vollstaendig synthetische Profile. Die bisher vorbereitete reale
500er Kohorte wird dafuer nicht importiert oder aktiviert. Datenschutzfreigabe
und Vertragsunterlagen existieren laut Betreiber derzeit nicht und bleiben vor
regulaerem Betrieb offen; sie sperren diesen technischen Synthetiknachweis nicht.
Verteilung 330 Bundestag / 120 Berlin / 50 Brandenburg, technischer Profilschutz,
Kosten 6 USD/UTC-Tag und 7 USD insgesamt sowie separates GO vor Aktivierung/Test
gelten weiter. [Aktueller Umfang und Nachweisgrenzen](betrieb/synthetischer-500er-auftrag-20261001.md).
Die nachfolgenden historischen Realprofilvorarbeiten sind keine aktuelle
Importanweisung und kein Beleg synthetischer Startbereitschaft.

## Kritischer Pfad und Parallelitaet

**Blocker 1 technisch abgeschlossen:** Der direkte500er Motorweg aus PR846 ist gemergt und ausgerollt; ein authentifizierter GET auf das gebundene READY-Deployment `53e1e369` ergab HTTP405/`Allow: POST` vor Datenbank- und Motorzugriff. Kein500er Test. Andere Starttore bleiben separat offen. [Abnahme](betrieb/blocker1-direkter-500er-motor-20261007.md).

**Blocker 2 weiter offen, tatsächliche Fortschreibung10.10.:** **415/500 vollständig fachlich angenommene Eingaben** nach eigenem ZEIT-Originalminimum und neun konkreten neuen Endurteilen. Genau18 unveränderte Summary-Stellen geschlossen;7zusätzliche Profile angenommen,22/148 bleiben wegen Stern negativ. Offen sind **84 Stern-Profile/336Titel-/Summary-Stellen und Brake69** mit dem eigenen Kreiszeitungs-Ereignisbeleg. 180.421übrige Aussageobjekte/3.530alte Deltaurteile/491Profilurteile unverändert; Ereignisduplikate, unbeurteilte Aussagen und übrige Fehlerkategorien0. Als Nächstes nur diese tatsächlich fehlenden eigenen Originalminima beschaffen. Data13 und Aufnahme wurden nicht wiederholt. [Aktuelle Fortschreibung](betrieb/blocker2-zeit-originalminimum-und-415er-fachabnahme-20261010.md). Keine Aktivierung oder Freigabe des späteren1500-Positionen-Funktionstests daraus ableiten.

Vor jeder neuen Arbeitswelle priorisiert Sol in Codex Cloud nur die Blocker, die das 500er Starttor unmittelbar verhindern. Der geprüfte Cloud Router delegiert klar abgegrenzte Arbeit nach AGENTS.md an DeepSeek; Architektur, Production Entscheidungen, Integration und finale Abnahme bleiben bei Sol. Unabhaengige Arbeit darf nur parallel laufen, wenn die Schreibbereiche eindeutig getrennt sind. Am02.10.2026 hat der Betreiber alle Peak Arbeitssperren aufgehoben, auch die Chatvorgabe vom01.10.; Entwicklungsarbeit darf jederzeit ohne Peak GO starten. Production Schutz und Production Kostenlimits bleiben unveraendert; gruene Merges und regulaere Deployments sind inzwischen konkret freigegeben.

## Arbeitsmodus

Wenn der Nutzer einen Roadmap Schritt als Sprint startet, arbeitet Codex diesen
Sprint vollautonom bis zu den definierten Abnahmekriterien ab.

Dazu gehören Analyse, auftragsbezogener Code und Dokumentation, gezielte Tests,
Fehlerkorrekturen, Commit, Push, Pull Request, Merge nach grüner Pflicht CI,
reguläres Vercel Production Deployment und rein lesende Nachkontrolle.

Auftragsbezogene Fehler werden selbstständig behoben und erneut geprüft. Codex
stoppt nicht nur deshalb, weil ein weiterer Korrektur PR nötig wird.

Geschützte Production Aktionen bleiben ausgenommen. Insbesondere Migrationen,
Production Daten oder Profiländerungen, Cron, Environment oder Azure Änderungen,
Budgetänderungen, externe Nachrichten sowie Aktivierung der 500 Profile und Start
des 500er Nachweises brauchen weiterhin das dafür ausdrücklich erforderliche GO.

Im aktuellen Cloud-Auftrag vom01.10. brauchen kostenpflichtige Production-
Modelltests ein konkretes GO; 6 USD/UTC-Tag und7 USD kumulativ einschließlich
Reservierungen bleiben zusätzlich verbindlich.

## 1 · Eingefrorenes Produktziel

**Verbindliche Zielgruppe: alle Parteien ausser AfD.** Keine AfD-zugehoerigen
Bundestags-/Landtagsprofile importieren, anlegen, aktivieren oder beliefern;
auch aus der500er Zielkohorte ausschliessen. Partei und Fraktion pruefen.
AfD-Nachrichten bleiben fuer andere Profile als politische Informationen erlaubt.

**Verbindliche Klarstellung des Betreibers vom 27.09.: Bundestag UND Landtage.**
Die individuelle Versorgung beider Mandatsebenen ist Pflicht. Der 500er Nachweis
muss beide Ebenen enthalten; ein ausschliesslicher Bundestagstest reicht nicht.
Notwendige Korrekturen an Landesquellen, Profilzuordnung und Ebenenpruefungen
sind direkte Nachweisblocker, kein auf spaeter verschiebbares Nebenprojekt.
[Testvertrag und belegte Luecken](betrieb/bundestag-landtage-testvertrag-20260927.md).

**Anschliessende Betreiberpriorisierung27.09.: Berlin und Brandenburg zuerst.**
Erste Markt-/Nachweisetappe: Bundestag, Abgeordnetenhaus Berlin und Landtag
Brandenburg. Die weiteren14 Laender folgen danach. Der erste500er Nachweis
enthaelt beide Mandatsebenen dieser Etappe; er belegt keine deutschlandweite
Landtagsversorgung. [Konkreter Startplan](betrieb/berlin-brandenburg-startplan-20260927.md).

Bis zum 500er Nachweis wird die Grundstruktur nicht erneut umgebaut, außer ein
belegter schwerer Produktfehler erzwingt es.

### Briefing

Nutzerfrage: **Was braucht heute meine Aufmerksamkeit?**

Briefing zeigt wenige Tagesprioritäten, einen kurzen belegten Anlass und den
nächsten Arbeitsschritt. Es erklärt den politischen Sachstand nicht noch einmal,
sondern verweist auf den zugehörigen Vorgang in Lage oder auf den passenden
Beobachtungshinweis.

### Lage

Nutzerfrage: **Was muss ich verstehen?**

Lage ist der einzige Ort für die ausführliche politische Erklärung:
Sachstand, Mandatsbezug, Einordnung, Unsicherheit und Quellen.

### Radar

Nutzerfrage: **Was sollte ich im Blick behalten?**

Radar bleibt ein eigener Bereich, aber kein zweiter Newsfeed.

Radar hat genau zwei Funktionen:

1. **Über dich**  
   Artikel und Meldungen, die die betreffende Person tatsächlich erwähnen.
   Titel, Medium, Datum und Link stehen im Vordergrund. Keine zweite
   Sachstandserklärung.

2. **Beobachten**  
   Konkrete belegte Beobachtungshinweise aus Fraktion, Partei, Wahlkreis und
   Ausschüssen sowie bevorstehende Fristen, Termine, Anhörungen oder angekündigte
   nächste Schritte. Partei und Fraktion bleiben fachlich getrennte Signale.

Ein bloßer Themenbezug, ein hoher Score oder ein weiterer Artikel zum gleichen
Sachstand reicht nicht für einen Radar Eintrag.

**Lokal belegt (29.09.2026, offline/fail-closed):** Die segmentbezogene sichtbare
Ursprungsbindung für Radar-Wahlkreis/Ausschuss ist fail-closed implementiert und
durch genau fünf gezielte Suiten belegt: radar-ursprung 15/15,
radar-committee-evidence 30/30, radar-party-normalization 32/32, radar-state
115/115, radar-ui 32/32. Relationsfremde Artikel und fehlende passende
Dokumentbelege werden nicht als sichtbarer Ursprung angezeigt; die
Ebenenbindung für Bund sowie Berlin und Brandenburg bleibt erhalten.
Ein produktiver Funktionsnachweis, ein echter Bedeutungsnachweis und der 500er
Test sind dadurch **nicht** erbracht.

## 2 · Verbindliche Regel gegen Überschneidungen

Jede Kernaussage hat genau einen Hauptort.

Derselbe politische Vorgang darf in mehreren Bereichen verbunden sein, aber nur
mit unterschiedlicher Funktion:

1. Lage erklärt den Sachstand.
2. Radar zeigt einen neuen Beobachtungsgrund oder eine persönliche Erwähnung.
3. Briefing priorisiert die heutige Arbeit.

Eine bloße Umformulierung derselben Kernaussage in einem anderen Bereich ist
nicht zulässig.

Andere Bereiche verweisen auf den Hauptort, statt denselben Inhalt erneut zu
erzählen.

## 2a · Datenschutz vor dem Test und vollständige Prüfung vor dem Verkauf

**Praezisierung vom 01.10.2026:** Die folgende Phase A beschreibt die reale
Profilverarbeitung und bleibt fuer regulaeren Betrieb beziehungsweise eine
spaetere reale Mandatsabnahme offen. Fuer den jetzt beauftragten rein
synthetischen technischen 500er Nachweis verlangt der Betreiber keine vorherige
qualifizierte Datenschutzentscheidung. Keine solche Entscheidung fingieren und
keinen alten Realprofilbeleg als Synthetikfreigabe ausgeben. Bestehende
personenbezogene Daten, Protokolle und Nachrichten bleiben im Inventar;
synthetische Zielprofile anonymisieren sie nicht. Zugriffssperren, geschlossene
Testkommunikation, begrenzte Datenweitergabe und gesicherter Rueckweg bleiben
technische Startvoraussetzungen. Phase B bleibt vor regulaerem Betrieb/Verkauf
und vertraulicher Bueronutzung verbindlich.

**Fruehere Betreiberentscheidung vom 30.09.2026 fuer reale Profile:** Datenschutz ist kein optionaler
Nachtrag. Die für den konkreten 500er Test notwendigen rechtlichen und
technischen Voraussetzungen sind **vor der ersten entsprechenden Production
Wirkung** zu klären. Eine umfassende, belegbasierte Verkaufsprüfung folgt
**unmittelbar nach dem erfolgreichen 500er Production Nachweis** und vor dem
regulären Verkauf. Diese Trennung verschiebt keine schon vorher zwingende Pflicht.

**Phase A: Eng begrenztes Datenschutz Starttor vor dem 500er Test**

1. Vor Import oder Aktivierung der vorgesehenen realen politischen Zielprofile
   den tatsächlichen Testumfang dokumentieren: personenbezogene Profilfelder,
   Quellen und Herkunft, gespeicherte Ausgaben, etwaige Konten, Nutzungsdaten,
   Protokolle und externe Empfänger. Bereits vorhandene personenbezogene Daten
   nicht aus der Betrachtung ausnehmen.
2. Für genau diesen Umfang Verantwortlichkeit, konkrete Zwecke sowie die
   einschlägigen Rechtsgrundlagen nach Artikel 6 und gegebenenfalls Artikel 9
   DSGVO fachlich prüfen und dokumentieren. Die Pflicht zu einer
   Datenschutz Folgenabschätzung durch eine qualifizierte Stelle klären und
   eine erforderliche Folgenabschätzung **vor** der betroffenen Verarbeitung
   abschließen. Öffentliche Quellen oder Testabsicht sind keine pauschale
   Rechtsfreigabe.
3. Die für den Test relevanten Datenflüsse und Dienstleister prüfen, insbesondere
   Azure KI, Vercel, Supabase, tatsächliche Verarbeitungsregionen, mögliche
   Drittlandtransfers und erforderliche Auftragsverarbeitungsverträge.
   Erforderliche Zugriffssperren, Mandantentrennung, Aufbewahrungs- und
   Löschgrenzen für genau den Testumfang nachweisbar prüfen.
4. Vor der betreffenden Production Aktion ein dokumentiertes fachliches
   Ergebnis mit Belegen, offenen Risiken und gegebenenfalls externer
   juristischer beziehungsweise datenschutzfachlicher Freigabe vorlegen.
   Notwendige ungeklärte Voraussetzungen sperren die Aktion; ein technischer
   Test oder eine KI Einschätzung ersetzt keine Rechtsentscheidung. Die
   gesonderten Betreiberfreigaben für Import, Provisionierung, Aktivierung,
   Test, Budget und Production Änderungen bleiben bestehen.

**Phase B: Vollständige Datenschutz- und Sicherheitsprüfung nach dem 500er Nachweis,
vor regulärem Verkauf und vor Nutzung vertraulicher Büroinhalte**

1. Den tatsächlichen dann aktuellen Code **und** die wirksame Production
   Konfiguration prüfen; ältere Dokumente sind Hinweise, keine aktuellen
   Wirksamkeitsbelege. Datenfluss vom Eingang bis zu KI Anbieter, Datenbank,
   Hosting, Benachrichtigungen, Protokollen und Sicherungen nachvollziehen.
2. Authentifizierung, Rollen und Berechtigungen, technische Mandantentrennung
   einschließlich Service Rolle und Datenbankregeln, Zugriffsprotokolle,
   Verschlüsselung, Secret Verwaltung, Backup und praktisch überprüften
   Wiederherstellungsweg im relevanten Umfang untersuchen.
3. Für personenbezogene und gegebenenfalls besonders geschützte politische
   Daten Datenminimierung, Aufbewahrung, Export, Auskunft, Berichtigung und
   tatsächliche Löschung einschließlich Sicherungen und Dienstleistern
   nachweisbar prüfen. Externe Datenweitergabe, Regionen, Verträge und
   mögliche Drittlandtransfers anhand der realen Konfiguration bewerten.
4. Rechtsgrundlagen, gegebenenfalls die vollständige Datenschutz
   Folgenabschätzung, Datenschutzhinweise, verbindliche Löschfristen,
   erforderliche Auftragsverarbeitungsverträge und die Eignung für
   parlamentarische Büros mit qualifizierter Datenschutz- oder Rechtsstelle
   abschließend klären. Freigabe für vertrauliche Inhalte ist eine eigene
   Entscheidung; keine stillschweigende Erweiterung des öffentlichen MVP.
5. Befunde nach Schwere, Nachweis, Behebungsaufwand und Verkaufswirkung
   priorisieren. Kritische Punkte vor Verkauf oder entsprechender
   Datennutzung schließen und gezielt nachprüfen. Frühere gültige Belege
   wiederverwenden; keine pauschalen Wiederholungstests und keine neuen
   Funktionen allein aus dieser Planung ableiten.

**Verbindliche Referenzen:** [OP-02 und OP-03](datenmotor-restliste.md),
[DSGVO Checkliste](dsgvo-checklist.md),
[technische Vorprüfung](recht/datenschutz-folgenabschaetzung-vorpruefung.md)
und [Produktroadmap nach Verkaufsbereitschaft](roadmap/produkt-roadmap.md).
Die rechtlichen Abschlussstände stehen in OP-02, der tatsächliche Betriebsstand
in CURRENT_STATE; diese Roadmap dokumentiert nur Reihenfolge und Abnahmetore.
Dieser Eintrag ist weder eine Datenschutzfreigabe noch eine Freigabe für
Production Änderungen oder zusätzliche Kosten.

## 3 · Nächste Arbeiten vor dem 500er Start

**Aktueller kritischer Pfad fuer den Synthetiknachweis:** Vollstaendig fiktives
500er Paket mit vorher festgelegten1500 Sollpositionen und harte 20-Sekunden-Gesamtfristen für KI-Anfragen einschließlich Antwortkörper sind in PR #762 ausgerollt; der Azure-Lesezugang ist authentifiziert belegt. Eigene eng gebundene synthetische Import-/Start-/End- und Nachweisbruecken
sind mit unabhängiger Codeabnahme und beiden grünen Pflichtchecks in PR #763 gemergt und ausgerollt. [Konkreter Ablauf](betrieb/synthetischer-500er-auftrag-20261001.md). Alte495-plus5-,4 USD- und Realprofilvertraege passen nicht
unveraendert zum neuen Umfang. Bestehende Schutzpruefungen nicht aufweichen.
Historische Privatpreimages und psql-Vollclonezeiten bleiben Vorarbeit im
[Runbook](betrieb/synthetischer-500er-auftrag-20261001.md#private-v6-appbrücke-belegscope),
keine frische Ausführungsbindung. Die private V6-Appbrücke ist unabhängig auf
Integrität geprüft:11 neue Gruppen, Originalbodies und alle Guards/17s-Transaktion,
20s-Statement und2s-Sperrwartezeit unverändert. Ein nativer READ-ONLY-Aufruf
(02.10.01:53 Türkei/00:53 Berlin/01.10.22:53 UTC) umfasst alle22Tabellen,
182908Zeilen=136765Quellen+46143Kontrollen; beide Prüfungen gleich,
2408,263/321,347ms, Transaktion bis zweiter Prüfung2988,186ms, Tool13647ms.
CPU/finales Transaktionsende unbekannt; nur Altzeilen-Metadaten, kein
Schreib-/Gesamtphasen-/Reservebeleg. Der Vollhistorienexport ist inzwischen rein
lesend mit Vorher-/Nachherbindung abgeschlossen. Am02.10. committete der neue
private V5-Helfer einmal alle drei lokalen Phasen mit136765Quellzeilen,
46143Kontrollzeilen, allen10geschützten Runtimefunktionen/2Namespaces und dem
originalen41er Auditjournal; nach Stage/Forward/Rückweg44Auditzeilen.
Transaktionswrapper8,604/4,577/14,017s, Backend-CPU6,480/4,360/13,450s,
diagnostischer2CPU/2GiB-Clone. Original-App/Source5 bytegleich,17s-Transaktion,
20s-Statement und2s-Sperrwartezeit unverändert. Alle17 typisierten Quellguards,
vollständiger Geschäftsdatenrückweg, vier unbeteiligte Kontrolltabellen,
Runtime/Katalog/ACL und Fremdentscheidung samt Vollfeldern/xmin bestanden.
Die segmentierte rein lesende Nachkontrolle behebt den bisherigen aggregierten
Beobachtertimeout; der Commitstatus wird vor weiterer Prüfung dauerhaft gesichert.
Unabhängige Abnahme`75f921ac` akzeptiert Rootreport`ac5b9cec` ausschließlich als
lokale Wrapperdiagnose. Keine Native-Hardware-/MVCC-/Owner-/ACL-/Transportparität,
keine Body-only-Zeit, harte17s-Reserve oder erfolgreiche SubTX-Leistung belegt.
**Aktuelle private V7/fix2-Weiterführung (02.10.):** Neuer kompletter lokaler
Stage/Forward/Rückweg bei136765Quell-/46143Kontrollzeilen, Runtime10/2,
Journal41→44 unabhängig akzeptiert (`6a8aa67a`/`1f85df23`). Wrapper6,236/5,014/13,056s,
CPU6,130/4,910/12,900s; unveränderte Source5/Geschäftskörper und17/20/2.
Dies bleibt lokale Diagnose ohne Native-Hardware-/MVCC-/Owner-/ACL-/Ganzphasenabnahme.
Neue inerte Native-Textprobe mit3.113.000B Argumenten terminal
`Invalid or expired requestState` nach802,388s; keine PG-Byte-/Hashquittung,
keine Grenze/Schicht belegt,0 Business-/Profiländerungen. Abnahme`533b5839`
akzeptiert nur den Fehlschlag, kein Retry. Separate kleine RO erfolgreich,
damals kein Großtransportnachweis. Historische3,85MB-Body-Abweisung bleibt gültig.
**Neuer verlustfreier Transport erfolgreich:** Exakt eine inerte Native-pgcrypto-RO-Probe
mit584292B Argumenten rekonstruiert3023730Originalbytes/SHA1c4f3753;
alle Guards positiv, unabhängige tatsächliche Abnahme0c04c55b.
Kein Original-App-EXECUTE: current_query-/Auditadapter und Native-Ganzphase bleiben offen.
[Private Profil-/Snapshot-/Endwächterkapsel](betrieb/synthetik-500-profil-starttor-kapsel-20261002.md)
verknüpft Originalarchive und Code unverändert; neun dynamische Gates bleiben rot.
Frischer vollständiger Snapshot mit aktueller MainAuth/Audit42, konkrete Operatorbindung,
Native Transport/Gesamtphase, Profil-GO und lebender Originalendwächter stehen aus.
0 Production-Profilimporte/0 Aktivierungen/0 neue bezahlte Modellaufrufe.
Das bisherige Prozessaltlasttor ist durch die separat freigegebene Bereinigung erledigt.
Die unabhängig geprüfte inerte Synthetikmigration ist nach konkretem Betreiber-GO
nativ angewendet: Postimage 01.10. 23:39:53 Tuerkei / 22:39:53 Berlin / 20:39:53 UTC, exakt fünf Originalfunktionen,
Journal 40 / Version `20261001203937`; 500 Mandate / 501 Identitäten / 0 Aktive / 0 Slots,
alle geschützten Fingerprints unverändert. PR #764/main `b53be3d8` war beim Vorflug
Ready. Die CLI-Version `20261001172619` bleibt unregistriert: kein Repair,
Dateiumbenennen oder `db push --include-all`; tatsächliche Zuordnung vor jedem
späteren Migrationsweg beachten. Der damalige Schema-Rückweg an Journal40
ist nach der separaten Bereinigung historisch und nicht ausgeführt; vor einer
Schema-Rücknahme an den aktuellen Gesamtstand neu binden.
REST 403 änderte nichts; native Anwendung dauerte gemessen 8,926s, ohne belegte
harte 20s-Tooltransportgarantie. DB 17s/Statement 15s/Lockwarten 3s unverändert;
unbekannter Schreibausgang: Stop, lesende Klärung, kein Retry. Die Betreiberfrist
20s gilt für KI-Anfragen; Schutzgates und Importsperren bleiben unverändert.
Die separat ausdrücklich freigegebene Bereinigung genau dreier alter Prozesse
ist angewendet und unabhängig endabgenommen. Postimage 02.10.2026 00:25:25 Tuerkei /
01.10.2026 23:25:25 Berlin / 21:25:25 UTC: 711 Prozesse / 0 running;
nur status/reason/finished_at der drei Ziele geändert, 708 andere Vollzeilen/xmin,
19 übrige Zielfelder und alle geschützten Bestände/Runtime unverändert.
Journal damals 41 / Version `20261001212457`, bisherige 40 Vollzeilen/xmin erhalten.
Cleanup-Rückweg historisch nur vorbereitet; vor Anwendung an aktuelle Audit42-Bindung anpassen.
500 Mandate / 501 Identitäten / 0 Aktive / 0 Slots bleiben unverändert. Kein Profilimport,
Flag-/Budgetwechsel oder Modelllauf. Das DATA-GO erweiterte sich nicht auf Profile;
inaktiven Ersatz weiterhin konkret vorbereiten und gesondert freigeben.
Aktueller CI-/Deploymentstand02.10.: [PR #769](https://github.com/ernisch/helmut-pilot/pull/769)
hebt Peak-Sperren auf und behebt die UTC-Tagesbindung der Runtime-CI;
beide Pflichtchecks und main-CI grün, Merge`484a74ee`,
Ready`dpl_4bcmCLiVBxZ31ybGHCTNGzhkpQuq` auf exakt diesem Commit.
Native Lesung08:33:38 Türkei/07:33:38 Berlin/05:33:38 UTC:
500Mandate/501Identitäten/0aktiv/0synthetisch/0Slots, Journal41.
Frischer Quellenread02.10.,12:08:09 Türkei/11:08:09 Berlin/09:08:09 UTC:
Berlin active/Brandenburg prepared, zwei Zielpfade needs_review/manual,
16 Bindungen/15 Pfade vollständig klassifiziert vorher; beide Artikelstandmengen0.
500/501/0aktiv, alle Bestandsmandate Bundestag. Wirksame Landes-/Operatorflags
und nutzbare Adminauth unbekannt; HTTP-Cutover blockiert. [Quellenplan](betrieb/quellen-starttor-berlin-brandenburg-20261002.md).
Freigegebene Vier-Bücher-Korrektur produktiv: Postimage12:06:04 Türkei/11:06:04 Berlin/09:06:04 UTC,
24 Bücher/4 exakte Nullbücher, erneuerte CAS-UUID/vorhandener Zeitstempeltrigger,
singleton Audit20261002090542, Journal42/prior41 unverändert. Unabhängig249fb42a,
Originalbudget/Zähler/Altbücher erhalten; keine Reservefreigabe oder bezahlter Aufruf.
6,794132USD gebunden und0,205868USD Rest reichen weiterhin nicht für
mindestens0,206USD reguläre Reserve. Der volle phasenweise Qualitäts-/Kostenplan
muss endliche Inputs/Versuche/Pfade und aktuelle Runtime binden; der konditionale
212USD-Vollkontext-Lage-Risikowert ist keine Anbieterrechnung und kein Budgetantrag.
Quellenversorgung, finanzierter Gesamtlauf, frischer Vollsnapshot/Ruhe und lebender
Endwächter bleiben Pflicht. Kein500er Nachweis.
Vor Aktivierung und Test anhalten. Die nachfolgende reale Profilhistorie bleibt
als Vorarbeit fuer eine spaetere Fachabnahme erhalten.

**Historische Vorarbeit fuer eine spaetere reale Fachabnahme:** Den bisherigen Platzhalterbestand durch
einen vorab festgelegten, quellenbelegten Profil- und Pruefplan fuer Bundestag
und die priorisierten Landesparlamente Berlin/Brandenburg ersetzen. Die anderen
Laender in diesem Sprint nicht vorziehen. Fuer alle500 Zielprofile reale oeffentliche Mandatsdaten recherchieren;
keine gesonderte Bestandsgruppe. Vor einem Import die genaue
Mischung, vertretenen Landesparlamente, Parteien/Fraktionen, Rollen und Themen
sowie Erwartungen je Profil festhalten; fehlende Unterstuetzung offen bilanzieren.
Die bisherige4/500-Auswahl ist kein Nachweis realistischer Personalisierung und
kein Grund, nur auf neue Nachrichten zu warten. Erst Profil-/Ebenenluecken
abgrenzen und korrigieren, dann die frische Versorgung unter Punkt3 nachweisen.
Bereits bestandene eng begrenzte Bereichspruefungen nicht pauschal wiederholen.
[500 Feldbelege](betrieb/500-profilfeldbelege-20260927.md) sind lokal zusammengestellt
und hashgeprueft. Keine personenbezogenen Pflichtplaetze in der Auswahl.
Die zuvor offenen Parteifelder sind aktuell amtlich geschlossen (498 belegt, 2 amtlich
parteilos). Fuer genau vier dokumentierte Einzelfaelle hat der Betreiber am 29.09.2026
einen Ersatz innerhalb derselben Parlamentsebene erlaubt, weil kein zulaessiger
gleichgruppiger Ersatz im vorab bestimmten Pool verfuegbar war; die
[Parteifeld-Schlussquittung](betrieb/500-parteifeld-schluss-20260928.json) bindet die Ausnahme.
500 technische Erfolge und die Auswahlentscheidung sind keine fachliche Importfreigabe.
Die zuvor 11 offenen Fachachsen und die letzte
Berliner Mandatsart sind durch zwoelf reale [Ersatzprofile](betrieb/500-ersatzprofile-20260928.json)
derselben Parlaments-/Fraktionsgruppe geschlossen (500/500, 330/330 Bundestag,
0 Fachachsen, 0 Mandatsarten; alle inaktiv und nicht importfreigegeben).
Fuer die Landesversorgung liegt ein enger Berliner Originalseiten-Leser vor:
`lib/helmut/berlin-presseartikel.js` bindet amtliche URL, Titel, Publikationstag
und vollstaendigen Artikeltext ohne erfundene Uhrzeit; die lokale Originalprobe
vom25.09.2026 besteht. Der separate Stand-/Speichervertrag und die tagesgenaue
Lage-Quellenanzeige sind jetzt offline geprueft; ein Live-Crawl und ein
freigegebenes Landesmodul fehlen weiterhin.
**Erledigt28.09. (lokal, offline):** [Berliner Artikelstand](betrieb/landesversorgung-berlin-20260928.md).
`lib/helmut/berlin-artikelstand.js` bindet fuer das gesicherte amtliche Original
(`be-bjf-kinder-jugendhilfe-20260925.html`) einen eigenen, geschlossenen Stand:
Metadata URL/Titel/Tag/Absatz- und Volltexthash/Standhash, eigener Namespace,
`published_at=null`, sichtbar nur der Kalendertag; als `summary` ausschliesslich der
gepruefte erste ganze Absatz (619 Zeichen) hashgebunden, kein Volltext/HTML in
`raw_documents`. Der Stand laeuft durch Import/Dedup, Speicherprojektion,
Lage-Quellenbeleg und sichtbare Quellenzeile der Lage-Karte; Offline-End-to-End-Test mit
In-Memory-Storage (25 Gruppen, echte Originalprobe), Negativtests fuer Drift und
Zeit. Der Bundestagspfad, die Schwellen und die AfD-Sperre bleiben unveraendert.
Kein Liveabruf, Import, Aktivierung oder500er Test; Production bleibt500/0,
Offline-Zielkohorte inzwischen 500/500 technisch akzeptiert und nicht importfreigegeben.
**Erledigt29.09. (lokal, offline):** [Brandenburger Landtags-Presseartikelstand](betrieb/landesversorgung-brandenburg-20260928.md).
Der minimierte Brandenburger Stand (`lib/helmut/brandenburg-landtag-presseartikelstand.js`)
ist als dritter, eigener Standtyp im gemeinsamen Dispatcher `lib/helmut/artikelstand.js`
registriert; jeder Stand behaelt eigenen Namespace und eigene Kennung. Die tatsaechlich
relevanten Storage-Leser in `lib/helmut/storage.js` (Dedup-Bestandsfenster, KO-/
Rohdokument-Projektionen, gebundene Lage-Quellen sowie ein vierter, ebenso begrenzter
Lesepfad in `listAktuelleLageQuellen`) und die tagesgenaue sichtbare Lage-Quellenzeile in
`lib/helmut/lage.js` fuehren den Stand ohne erfundene Uhrzeit (`published_at` bleibt leer,
sichtbar nur der belegte Kalendertag). Offline belegt ueber die Brandenburger
Artikelstand- und die Lage-Quellenfenster-Suite sowie die geprueften Berlin-/Bundestags-
und Dedup-Regressionen. Weiterhin **kein Live-Crawl, kein Import, kein freigegebenes
Landesmodul und kein produktiver Versorgungsnachweis**.
Gremienrollen und vier BB-Listenmandate sind korrigiert. Der falsche Widerspruch
SSW/fraktionslos ist mit PR661 ausgerollt und nachkontrolliert; Partei bleibt erhalten, AfD-Sperre unveraendert.
Zwei bislang offene Berliner Mandatsarten sind ueber die amtliche
[Berliner Mandatsartenquittung](betrieb/berlin-mandatsarten-20260927.json) belegt
(Johannes Martin Bezirksliste Marzahn-Hellersdorf, Benedikt Lux Landesliste;
Handbuch-PDF vom8.10.2025, Seite204 linke Spalte, woertliche Transkription, kein
automatischer PDF-Parser); der damals offene Fall Claudia Engelmann ist inzwischen
gleichgruppig durch Steffen Zillich mit direkt belegter Landesliste ersetzt.
Die 54 urspruenglich fachlich offenen Profile tragen ueber die gepruefte
[Rollenquittung](betrieb/profilrollen-54-20260927.json) 48 belegte Amtsrollen
in `profil.funktionen` (dedupliziert angehaengt, 6 offen); das ist keine fachliche
Achse. Ueber die gepruefte [Ressortquittung](betrieb/ressortachsen-19-20260927.json)
sind 19 dieser Achsen mit amtlich abgeleiteten Ressortthemen geschlossen
(9 Bund/4 Berlin/6 Brandenburg) und ueber die gepruefte
[Aufgabenquittung](betrieb/aufgabenachsen-6-20260927.json) 6 weitere mit
personengebundenen Aufgabenbereichen (Beauftragtenaufgaben + explizite
BMAS-Abteilungen) und ueber die gepruefte
[beratende Achsenquittung](betrieb/beratende-achsen-2-20260927.json) 2 weitere
mit amtlich belegten beratenden Ausschussrollen (Knodel Landwirtschaft/
Ernaehrung/Heimat, Seidler Haushalt; bestehende beratende Funktion erhalten,
keine ordentliche/stellvertretende Mitgliedschaft) und ueber die gepruefte
[Zusatzaufgabenquittung](betrieb/zusaetzliche-aufgaben-3-20260927.json) 3 weitere
mit amtlich belegten Fachzustaendigkeiten (Breher Tierschutz mit neuer
Funktionsrolle und erhaltener PSts-Rolle, Krichbaum Europa aus der aktuellen
AA-Seitenkopf-H1, Kippels BMG-Abteilungen1/4/5/6 mit12 Kurzthemen aus dem
manuell visuell abgenommenen PDF-Fachurteil, kein externer PDF-Parser) und ueber
die gepruefte [BMWSB-Aufgabenquittung](betrieb/bmwsb-aufgaben-2-20260927.json)
2 weitere mit den persoenlich zugewiesenen BMWSB-Unterbereichen (Sören Bartol
Z I 3/W II/S I/B I/B II, Sabine Poschmann Z II/W I/S II/S III; kanonische
v10-Adresse des amtlichen Organigramms, kein externer PDF-Parser, keine
Hochstufung auf ganze Abteilungen) und ueber die gesonderte gepruefte
[Amthor-Einzelfallquittung](betrieb/amthor-aktuelles-amt-1-20260927.json) den
einzeln offenen Rollenfall Philipp Amthor (aktuelle Kanzleramtsrolle seit29.Juli2026
aus geschlossenem bpa-richtext-Lebenslauf, ein Thema Bund-Laender-Beziehungen aus
genau einem echten li der Personalien-h2; der historische 54er-Eintrag bleibt offen,
keine Rolllockerung) und ueber die eng gepruefte
[Wahlausschuss-Aufgabenquittung](betrieb/wahlausschuss-drei-aufgaben-20260927.json)
3 weitere sonstige Gremien-Aufgabenachsen (Haßelmann/Hoffmann/Miersch: die aktuelle
Wahlausschuss-Mitgliedschaft eigenstaendig aus genau EINEM ProfilePage.mainEntity in
genau EINER echten Role mit exaktem roleName/startDate ohne endDate, das enge Thema
Richter des Bundesverfassungsgerichts aus dem geschlossenen aktuellen
Gremienaufgabenabsatz mit 21. Wahlperiode; das sonstige Gremium und die bestehenden
Funktionen unveraendert, kein regulaerer Ausschuss, keine Umdeklarierung,
Haßelmann/Miersch bleiben in der 54er Quittung offen); die54er
Rollenquittung bleibt deckungsgleich. Das war der Zwischenstand nach PR670:481/19.
Danach schlossen die eng belegten [Jarzombek-Abteilungen](betrieb/jarzombek-bmds-abteilungen-1-20260927.json),
[Klöckners Bundestagsverwaltungsaufgabe](betrieb/kloeckner-praesidentinnen-aufgaben-1-20260927.json),
[Brandenburger Ausschussstellvertretungen](betrieb/brandenburg-stellvertretungen-76-20260927.json)
(nur Skopec als neue Fachachse) und die lokal geprüfte
[Rohde-Bundeshaushaltsaufgabe](betrieb/rohde-bundeshaushalt-1-20260927.json)
je eine weitere Achse. Danach schliesst die eng gepruefte
[Merz-Einzelfallquittung](betrieb/merz-richtlinien-1-20260928.json) den zuvor offenen
Bundestags-Fachachsenfall Friedrich Merz ueber die amtlich belegte Bundeskanzler-Aufgabe
Richtlinien-Kompetenz (keine neue Rolle; Person und Amt nur aus dem sichtbaren eigenen
Artikelkopf, Thema nur aus dem geschlossenen H2-Abschnitt des eigenen innersten
div.bpa-richtext). Danach schliesst die eng gepruefte
[Woidke-Einzelfallquittung](betrieb/woidke-richtlinien-1-20260928.json) genau den
Brandenburger Fachachsenfall Dr. Dietmar Woidke ueber die amtlich belegte
Richtlinienkompetenz des Ministerpraesidenten; die bestehende Rolle bleibt
unveraendert und weitere Staatskanzlei-Themen werden nicht uebernommen.
Danach schliesst die eng gepruefte
[Wegner-Einzelfallquittung](betrieb/wegner-richtlinien-1-20260928.json) genau den
Berliner Fachachsenfall Kai Wegner ueber die amtlich belegte Richtlinienkompetenz
des Regierenden Buergermeisters; die bestehende Rolle bleibt unveraendert, Person
und Amt sind getrennt an die aktuelle Senatsseite gebunden und die weiteren50
Geschaeftsbereichsthemen werden nicht uebernommen.
Aktueller lokaler Entwurf:500/500 technisch akzeptiert;0 Fachachsen,0
Mandatsarten und0 Parteifelder offen; alle500 Profile bleiben vor Import gesperrt. Die
fortgeschriebene [Rollenquittung](betrieb/profilrollen-43-20260928.json) bindet
die 43 weiter relevanten Altfaelle (37 belegt/6 offen); elf Bundestagsprofile
und Claudia Engelmann wurden gleichgruppig durch voll belegbare reale Profile ersetzt.
Der getrennte [amtliche SPD-Parteivorstandsbeleg](betrieb/pistorius-partei-1-20260928.json)
schliesst nur Boris Pistorius' Parteifeld; die bisherige335er-Auditquittung bleibt unveraendert.
Die zwei zuletzt fehlenden aktuellen Fraktionsvorsitz-Funktionsfelder Britta
Haßelmann und Dr. Matthias Miersch sind lokal ueber die enge
[Fraktionsvorsitz-Zweierquittung](betrieb/fraktionsvorsitz-zwei-20260927.json)
belegt (nur Funktion und amtliche Fraktionsquelle, keine Themen und keine
Fachachse;498 Datensaetze bleiben identisch); keine Importfreigabe.
Naechster Fachschritt: den produktiven, sichtbaren Nachweis der Berliner und
Brandenburger Landesversorgung unter dem bestehenden Landesmandatsgate schliessen.
Die enge Vierer-Ausnahme der Profilwahl ist abgeschlossen und darf weder auf weitere
Faelle ausgeweitet noch als Importfreigabe gelesen werden.

1. Die gemeinsame semantische Trennung der tatsächlich sichtbaren Texte aus
   Briefing, Lage und Radar technisch absichern und mit echten Helmut Ausgaben
   belegen. Nicht nur wortgleiche, sondern auch sinngleiche Wiederholungen
   erkennen. Wichtige unterschiedliche Aussagen dürfen dabei nicht entfernt
   werden.

   Rein lokal/offline bereits abgesichert (29.09.2026): Der Aggregator
   `lib/helmut/bereichsabnahme-500.js` fuehrt die gebundenen Einzelurteile
   fail-closed zusammen (kein Modellaufruf, kein Netz, kein Production-Write) und
   verlangt exakt 500 erwartete Profile und 1500 positive Bereichspaare (500 mal
   drei Paare); fehlend, negativ, leer, dupliziert, unerwartet, ungueltig und
   hashgedriftet werden vollstaendig ausgewiesen. Die Suite
   `scripts/bereichsabnahme-500-test.js` ist mit 19/19 synthetischen Fallgruppen
   lokal gruen. Das ist kein echter 500er Bedeutungs- oder Production-Nachweis und
   keine Aktivierungs-/Testfreigabe.

2. Für Radar die Artikelbindung von **Über dich** sauber belegen: Der tatsächlich
   angezeigte beziehungsweise verlinkte Artikel muss die Person nachweislich
   betreffen. Umfeldsignale müssen ihrem echten Ursprung Fraktion, Partei,
   Wahlkreis oder Ausschuss korrekt zugeordnet sein.

3. Frische Production Versorgung für das Testfenster herstellen und belegen.
   Keine alten Quellen umdatieren und keinen abgeschlossenen Vorlauf ohne
   sachlichen Grund wiederholen.

4. Kostenstarttor schließen: vor dem 500er Start keine ungeklärten
   Kostenreservierungen und technischer Tagesriegel gemäß Betreiberfreigabe vom26.09. 6 USD je UTC Tag.

5. Profilbestand auf exakt 500 Zielprofile bereinigen und finalen rein lesenden
   Startplan fuer beide Mandatsebenen belegen. Ergebnisse zusaetzlich je Ebene,
   vertretenem Landesparlament und Partei/Fraktion bilanzieren; ein Gesamtwert
   darf keine unversorgte Teilgruppe verdecken. Alle500 werden bei Auswahl, Versorgung und Pruefung gleich behandelt;
   derselbe Schutz vor versehentlichem Loeschen gilt fuer den gesamten Bestand.
   Zusätzliche Nichtzielprofile zuerst eindeutig identifizieren und nur dann
   entfernen. Danach: 0 aktive Profile vor Aktivierung, richtiger Production
   Commit, keine störenden Jobs oder Sperren, Endwächter und Rückweg auf 0 aktive
   Profile bereit.

6. Danach stoppen. Exakt diese 500 gleich behandelten Zielprofile aktivieren und
   den eigentlichen 500er Production Nachweis erst nach neuem ausdrücklichem
   Betreiber GO starten.

Nach dem erfolgreichen 500er Nachweis folgt die vollständige Datenschutz-
und Sicherheitsprüfung aus §2a vor regulärem Verkauf und vor vertraulicher
Büronutzung. Fuer den aktuellen synthetischen technischen Nachweis gilt die
Praezisierung vom 01.10.2026 in §2a; dessen technische Schutzvoraussetzungen
bleiben vor dem Test zu erfuellen.

## 4 · Nicht vor dem 500er Nachweis

1. Büro beziehungsweise Arbeit grundsätzlich neu gestalten.
2. Das neue mit Claude Design erarbeitete Desktop und Mobile UI integrieren oder
   die bestehende Oberfläche grundsätzlich neu gestalten. Das folgt erst nach dem
   erfolgreichen 500er Production Nachweis. Vorher nur technisch notwendige
   Smoke Prüfungen für tatsächlich geänderte Bereiche.
3. README oder allgemeines Repository Aufräumen ohne unmittelbaren Nachweisnutzen.
4. Neue Anbieter oder Modelle wie Voyage oder Cohere integrieren, solange die
   vorhandene Technik die semantische Trennung ausreichend belegen kann.
5. Die vier abgeschlossenen Understanding Problemfälle ohne sachlich neue
   Grundlage erneut versuchen.

## 5 · Entscheidungsregel

Wenn Codex gefragt wird, was als Nächstes ansteht, gilt diese Reihenfolge
zusammen mit dem aktuellen Production Stand aus `docs/CURRENT_STATE.md`.

Abgeschlossene Schritte werden nicht wiederholt. Neue unabhängige Themen werden
bis nach dem 500er Nachweis zurückgestellt.
