# Verarbeitungskern fuer die ersten 100 aktiven Kunden

Stand 13.11.2026. Entwicklungsbranch `codex/verarbeitungskern-100-20261113`,
Ausgangsstand `fe94f3eb`. Kerncommit `8d780785`; die Auslieferung ist ein
getrennter Folgecommit desselben Reviewbranches. **Kernumbau nach gezielten Korrekturen lokal abgenommen;
Pflicht-CI und Production-Freigabe offen. Kein Kapazitaetsnachweis fuer 100 Kunden.**

## Architekturentscheidung und Umsetzung

Gezielter Umbau ist sicherer und kleiner als ein Vollneubau: Quellenplan,
relationale Jobs/Outbox, Vorgangs-CAS, Modellbudgets, Quellenpruefung, bestehende
Fachlogik und Vercel/Supabase bleiben erhalten. Neue Infrastruktur ist nicht
erforderlich. Die Auftrags- und Auslieferungsgrenzen werden umgebaut:

`Quellenplan → einzelne Artikelversionen → gepruefte Sachstaende → individuelles Tagespaket → App`

1. Aktuelle Quellenplanung von historischen Manifesten trennen; aktuelle Jobs
   auch in SQL vor historischen Jobs vergeben.
2. Je Artikelkennung und archiviertem Inhaltshash einen idempotenten Auftrag
   erstellen; alte Buendel ohne Modellaufruf in bestaetigte Einzelauftraege teilen.
3. Bestaetigte Ergebnisse und bezahlte Lagephasen dauerhaft sichern; unbekannte
   Anbieterausgaenge sperren statt erneut zu bezahlen.
4. Vollstaendige Lageansicht und Radar/Briefing im Tagespaket speichern und bei
   normalen App-Lesezugriffen ohne Fachneubau ausliefern.

Funktionierende Teile werden weiterverwendet, insbesondere die Quellen- und
Neutralitaetsregeln, KO-Zusammenfuehrung, Fakten-/Quellenbelege, Mandatsmatching,
Authentifizierung, Tenant-Guards und die ausdruecklich ausgeloeste Bueroerstellung.
Keine neue Registrierung, kein E-Mail-Versand, keine Budget-/Profilaktivierung.

## Tatsaechliche Aenderungen

- `scalable-pipeline.js`: aktueller Plan zuerst; historische Planfortsetzung nur
  ausdruecklich. Neue Einzeljobs und idempotente Altbuendelaufteilung. Ein
  problematischer Artikel verhindert weder benachbarte Auftraege noch eine
  ehrliche Teilausgabe. Projektion → Lage → Materialisierung behaelt die
  Reihenfolge je Mandant; Quellen-/Artikelgesamterfolg ist keine Sperre mehr.
- `source-demand.js`: der moderne Alternativpfad legt die Mandatsvorarbeiten
  rechtzeitig in den Morgen. Bestehende begrenzte Morgenzeiten bleiben erhalten;
  kein Cron wird installiert oder umgestellt.
- `storage.js`: vorhandenes unveraenderliches Artikelarchiv auch fuer den
  modernen Pfad. Fehlerhafte Batchzeilen erst lesend klaeren und danach einzeln
  isolieren; Archivfehler/Missing-Rows lassen bestaetigte Nachbarn passieren.
  Abgewiesene Artikel erhalten eigene kostenfreie Diagnosejobs. Deren Schluessel
  endet auf `|eingangsfehler`, damit spaetere erfolgreiche Verarbeitung moeglich bleibt.
- Eine vorbereitete Migration `20261113165614_frische_tagesarbeit` erweitert die
  bestehende Jobtabelle um **eine** skalare Spalte `last_seen_window` und zwei
  schmale Indizes. Ein explizites Wiederfinden derselben Artikelversion erhoeht
  nur ihren aktuellen Tagesbezug; Ursprung, Status, Versuche und Payload bleiben
  erhalten. Ohne Wiederfinden ist historischer Rueckstand keine heutige Luecke.
  Die Tagesclaims und der Tageszaehler beruecksichtigen denselben Bezug.
- Neue interne Claim-Einspruenge verhindern einen stillen Rueckfall auf alte SQL,
  wenn die Migration fehlt. ACL/RLS und alte Funktionsidentitaeten bleiben
  erhalten; neue RPCs sind nur fuer `service_role` freigegeben. Direktclaims
  transportieren unveraenderliche Alters-/Fensterfelder getrennt von der Payload,
  damit Fortschritts-CAS weiterhin exakt passt.
- `lage-verarbeitungsbeleg.js`: kleine mandatsgebundene Zeilen in der vorhandenen
  Briefingtabelle sichern Start, Entwurf, Pruefstart und Pruefantwort. Derselbe
  Eingabestand startet bei unklarem Ausgang keine kostenpflichtige Phase erneut.
  Bestaetigte Entwuerfe/Reviews werden mit den bestehenden Pruefern fortgesetzt;
  zwei bestaetigte Phasen brauchen weder neues Modell noch neues Modellbudget.
  Nur ein interner Nichtversandbeleg erlaubt das haltergebundene Freigeben eines
  noch nicht gesendeten Phasenstarts. Texte/Reviews werden dabei nie geloescht.
- `modell-arbeitsgrenze.js`/`ai.js`: alle normalen Modellaufrufe teilen zwei
  Datenbankslots, einschliesslich direktem Cron und Buero. Kostenreservierungen,
  Anbietergrenzen und unbekannte Reserven bleiben unveraendert.
- `briefing-speicher.js`/`morgenversorgung.js`: fertiges Tagespaket enthaelt
  Briefing, Radar, vollstaendige Lagekarten und geprueften Lagequelltext. Mandant,
  Profilhash/-version, Berliner Tag und Quellenmanifest sind nachpruefbar gebunden;
  das Quellen-/Schutzmanifest ist selbst Bestandteil des Inhaltshashs.
- `tagespaket-auslieferung.js`/`server.js`: normaler Appstart, Briefing und Lage-GET
  lesen dasselbe Paket, keine Modellaufrufe oder Korpus-/Ranking-Neuberechnung.
  Fehlend, teilweise, Quellenschutzwechsel und ungebundene Frischequittung bleiben
  sichtbar. Eine Teilaktualisierung erhaelt gueltige Inhalte desselben Tages und
  Profils. Aktive Publikationssperren pruefen nur die gebundenen KO-Identitaeten;
  fehlende Bindungen sperren die Ausgabe. Quellenfrische folgt Publikationsdaten,
  niemals einer technischen Bearbeitungszeit. Historische explizite Leser bleiben.

Die regulaere Auslieferung braucht ein erzeugtes Paket; beim Oeffnen wird kein
fehlendes Paket nachgerechnet. Alte Pakete ohne volle Lageansicht sind ehrliche
Teilausgaben, bis die regulaere Hintergrundverarbeitung ein neues Paket erstellt.

## Technische Grenzen und Dimensionierung

| Ressource | Durchgesetzte Grenze / heutiger Vertrag |
| --- | --- |
| Quellenfenster | Acht Slots, hoechstens 2.400 reservierte Sekunden/UTC-Tag; im vorhandenen Arbeitsfenster ein Worker und ein Job gleichzeitig |
| Quellenabrufklasse | Vorhandener verteilter Slotvertrag, Standard 5; Arbeitsfenster bleibt strenger seriell |
| Verstehen | Standard ein globaler Slot; atomarer Vorgangs-CAS ist fuer modernen Modellstart Pflicht |
| Mandatsarbeit in der Queue | Hoechstens zwei globale Slots fuer Projektion, Narrativ und Paketbau |
| Modellzugang insgesamt | Hoechstens zwei globale Slots vor Kosten-/Sendeschranke, einschliesslich Buero/direktem Cron |
| Laufzeit / Sperre | Aktuelles Vercelmaximum 300s; Klassenslot 360s. Ein aeusserer Auftragstimeout gibt einen noch arbeitenden Slot nicht frei |
| Appstart | Paket-/Quittungszeilen plus bestehende authentifizierte Profil-, Aufgaben- und Notizleser; bei aktiver Sperre begrenzter Identitaetsnachschlag |

Die 360s-Sperre ist auf Vercels 300s- und den bestehenden 180s-Lambda-Rahmen
dimensioniert. Ein spaeterer nativer Langlaeufer darf diese Garantie nicht
uebernehmen: dafuer Laufzeit hart begrenzen oder Slots vor Ablauf erneuern.
Ein haengender Freigabeaufruf heilt ueber TTL; unbekannte Modellkosten bleiben reserviert.

Fuer 100 aktive Kunden muessen vor ihrer Zulassung diese Ungleichungen mit dem
tatsaechlichen Quellenplan und vorhandenen Zeitbelegen passen:

- `Summe Quellen-/Artikelzeiten <= effektiv nutzbare Quellen-Slotsekunden`.
  Die 2.400s sind eine Obergrenze vor Planung/Abschluss, kein belegter Durchsatz.
- `100 × mittlere neue Narrativzeit / wirksame Parallelitaet <= Narrativfenster`.
  Der direkte Lage-Cron hat heute 240s fuer eine sequenzielle Mandantenschleife:
  rechnerisch 2,4s je Profil. Zwei Queueworker mit 270s liefern theoretisch 540
  Worker-Sekunden, also 5,4s je Profil. Die globale Modellgrenze und geteilte
  Quellenarbeit reduzieren die nutzbare Zeit weiter. Das belegt keine Versorgung
  von 100 frisch zu erzeugenden Narrativen.
- `100 × mittlere Paketbauzeit <= effektiv nutzbares Paketfenster`.
  Der Paketbau bleibt KI-frei, liest aber Fachstaende im Hintergrund.
- `globale Artikelanalysen + 2 × neu erzeugte individuelle Lagebilder + explizite
  Bueroauftraege <= freigegebene Modellaufrufe und Geldreserven`.

Der vorhandene Einprofilvertrag betraegt **1 USD/UTC-Tag und 30 USD insgesamt**.
Eine Zulassung bis 100 Profile erhoeht ihn nicht. Konservative Reservierung:
`0,20 USD + 0,000004 USD × maximale Ausgabetokens`, also 0,212 USD bei 3.000
und 0,232 USD bei 8.000 Tokens. Ohne bestaetigte Abrechnung passen hoechstens
vier volle offene Reserven in 1 USD. 100 vollstaendig neu erzeugte Lagebilder
brauchen regelmaessig 200 Entwurfs-/Pruefaufrufe plus globale Artikelarbeit und
Buero. Cachewiederverwendung senkt Bedarf, garantiert aber keine bestimmte Quote.
Keine Budgeterhoehung wurde vorgenommen.

Der operative Kostenvertrag benutzt weiterhin das bestehende CAS-gesicherte
JSON-Kostenbuch in `main-auth`. Dessen Wachstum bleibt ein Datenbankrisiko;
es wurde nicht nebenbei migriert oder zur Kostenfreigabe umgangen. Ebenso ist
**keine ausreichende RAM-Reserve auf 1 GB nachgewiesen**. Begrenzte Parallelitaet
und vermiedener App-Korpusbau ersetzen keine Ressourcenkalkulation.

## Status von #1182 und #1179

- [#1182](https://github.com/ernisch/helmut-pilot/pull/1182) ist gemergt und laut
  Deployment-/Runtimebeleg auf Production (`fe94f3eb`). Bestehende 199 gezielte
  Pruefungen und erfolgreiche Pflicht-CI bleiben gueltig, wurden nicht wiederholt.
- [#1179](https://github.com/ernisch/helmut-pilot/pull/1179) ist offen/unmerged;
  die SQL-Optimierung ist dennoch bereits angewendet. Das Supabase-
  Migrationsregister wurde am 13.11. rein lesend geprueft und bestaetigt
  `20261113094853_job_metrics_ohne_materialisierung`. Kein erneutes Anwenden,
  kein schwerer Metrikaufruf oder Wiederholen der alten 35 SQL-Pruefgruppen.
- [Historischer Mock100](https://github.com/ernisch/helmut-pilot/actions/runs/42053461090)
  und [Bericht](mock100-20261105.md) bleiben unveraendert. Er wurde nicht wiederholt.

## Gezielte Nachweise dieses Umbaus

Alle lokalen Ausfuehrungen ueber `scripts/lokal.js`; keine bezahlten Modelle,
keine Production-Testdaten oder Production-Migration. Bei Nachbesserungen nur
geaenderte/neue Faelle geprueft; keine Summe als neuer Lastnachweis umdeuten.

| Betroffener Ablauf | Tatsaechliche lokale Ergebnisse |
| --- | --- |
| Artikel-/Worker-Kern | 18 Grundfaelle; 2 neue Morgen-/Fristfaelle; 2 neue Eingangsfehlerfaelle bestanden |
| Betroffene Worker-/Queuevertraege | 42 Assertions in Abschnitten 6/12; 16 Assertions in Gruppen 5/6/6b/7; 4 Tagesplanungsszenarien; 4 erkannte Mutationen |
| Reale lokale SQL | 13 Claim-/ACL-/Lease-/Rueckwegfaelle; 4 neue RPC-Faelle; 7 neue Wiederbeobachtungs-/Tenantfaelle; 1 neue Direktclaim-Altersbindung; 2 neue SQL-Driftfaelle. Zwei echte konkurrierende Verbindungen, kein Lastlauf |
| Rohartikelpersistenz | 3 neue Faelle: Archivfehler, ungueltige Batchzeile, einzelne fehlende Rohzeile; gute Nachbarn erhalten |
| Paketauslieferung | 10 neue Lieferfaelle; zusaetzlich Manifest-Hashbindung und gezielt angepasste Publikationssperre bestanden; echter authentifizierter HTTP-Handler ohne Korpus-/Modell-/Schreibpfad |
| Paketspeicherung / Morgen | 24 Speicher-/Quellenfaelle und 17 relevante Morgenfaelle bestanden |
| Lagephasen / Modellgrenze | 17 gezielte Faelle, darunter: Konkurrenz, unklare Writes, bestaetigte Wiederaufnahme, manipulierte/fremde Belege, keine Payload-CAS-Verfaelschung, Publikationszeit, maximal zwei wirkliche Modellarbeiten sichere Nichtversandfreigabe sowie Erhalt der Reserve nach bezahltem Entwurf |

Die ersten zwei Lagephasen-Integrationseingaben waren unvollstaendige Testfixtures
(zunaechst ein statt zwei Absaetze, danach fehlendes Profil fuer den Pre-Review-Test).
Sie wurden korrigiert und nur der betroffene Fall erneut ausgefuehrt.

**Abweichung offengelegt:** Beim Filtern der vorhandenen Morgensuite lief
versehentlich ein alter rein lokaler Fall mit 500 synthetischen Datensaetzen.
Keine externe DB, Modelle, Kosten oder Production. Dies widersprach dem Auftrag,
ist kein autorisierter Kapazitaetsbeleg und wurde nicht wiederholt. Der Filter
schliesst bei gezielter Auswahl jetzt alle 100-/500-Kapazitaetsnamen aus.

Die sieben betroffenen alten Workerfixtures wurden anschliessend auf den neuen
Vertrag angepasst. Ausschliesslich kleine ausgewaehlte Abschnitte liefen:

- `anbieterausfall-test.js --klein`: 17/17 (drei Profile/drei Fehlerjobs).
- `op30-aktivierungsreife-test.js --abschnitte=O2`: 9/9 (ein Profil).
- `tenant-narrativ-test.js --abschnitte=4,5,6,7`: 43/43 (hoechstens vier Jobs).
- `morgenslot-idempotenz-test.js --abschnitte=B`: 12/12 (zwei Jobs, keine DB).
- `v3-anbindung-test.js --gezielt`: 40/40; alter 1000-Profilabschnitt uebersprungen,
  zwei unveraenderte echte Anbieterbehauptungen ausdruecklich OFFEN.
- `warteschlange-blob-entkopplung-test.js --gezielt`: 16/16; grosse 450-/5002-Item-
  und unveraenderte Abschnitte uebersprungen. Initialer Loopback-Sandboxfehler,
  danach derselbe gezielte Test mit erlaubtem Loopback erfolgreich.
- `warteschlange-parallelitaet-test.js --gezielt`: 2/2 (zwei Artikel, In-Memory),
  vor jedem echten DB-/Kapazitaetsabschnitt beendet.

Die grosse Pflicht-CI wurde bewusst nicht gestartet. Review-Commits enthalten
`[skip ci]`, damit der PR keine untersagte breite Wiederholungspruefung startet;
Pflichtchecks und Branchschutz sind unveraendert, Mergen bleibt gesperrt.
Automatische Vercel-Deployments fuer diesen Branch sind in `vercel.json` aus.
**Kein gruener Gesamt-CI-/Mergereifestatus behauptet.**
Unabhaengige Codex-Reviews haben insbesondere Tenantfilter, CAS-Payloadbindung,
Phasenbesitz, Tagesvorrang, Freigabe erst nach wirklichem Abschluss und die
Mandatsreihenfolge geprueft; gefundene Integrationsfehler wurden behoben.

## Abnahmekriterien und Reichweite

| Kriterium | Beleg / Grenze |
| --- | --- |
| Artikelprobleme bleiben einzeln | Artikelkern, Rohartikelpersistenz und diagnostische Fehlerjobs |
| Frische Arbeit trotz Altrueckstand | heutiger Plan zuerst, SQL-Tagesclaim und monotone Wiederbeobachtung |
| Unterbrechung verliert kein bestaetigtes Ergebnis | Job-CAS, immutable Quellen-/Phasenbelege, bestaetigte Fortsetzung; unbekannter Anbieter bleibt gesperrt |
| App liefert gespeicherte gepruefte Pakete | echte lokale HTTP-Handlerpruefung, kein Neubau-/Modellpfad |
| Mandanten bleiben getrennt | Payload-/Job-Tenantguard, explizite Storagefilter, eigener Tageszaehler, HTTP-Negativfaelle |
| Kosten/DB-Arbeit begrenzt | Budget/Reserven unveraendert, globale Klassen und Modellmax2; wachsendes JSON-Kostenbuch bleibt Grenze |
| Lage/Radar/Briefing/Buero erhalten | gleiche gespeicherte DTOs und volle Karten; explizite Bueroaktion unveraendert, Modellzugang jetzt begrenzt; echte Kundenbedienabnahme nach Rollout offen |

Kein neuer Kostenplan und kein RAM-/Durchsatzversprechen fuer 100 folgt daraus.
Der sichere Einprofil-Rollout braucht noch separate konkrete Freigabe.

## Gezielte Codeabnahme nach Betreiber-Go (13.11.2026)

Ausgangskopf [699dc501 / PR1183](https://github.com/ernisch/helmut-pilot/pull/1183).
Zwei neue unabhaengige Codex-Pruefer untersuchten Verarbeitung und Auslieferung;
der fuehrende Agent pruefte SQL, Kosten und Integration. Bestehende erfolgreiche
Nachweise wurden weiterverwendet. Die Abnahme fand fuenf konkrete Fehler und
behob sie im selben Branch:

| Befund | Korrektur |
| --- | --- |
| P1: Abgewiesene Rohzeilen konnten den FK-gesicherten Fundstellenbatch guter Artikel zurueckrollen | Nur bestaetigte Artikel gelangen in den Batch; echter Fundstellenausfall verhindert Quellenabschluss, bestaetigte Kinder bleiben erhalten |
| P1: Alter Lagecache konnte unter neuer Profil-/Quellenbindung erscheinen | Der aktuelle cacheOnly-Leser liefert den exakt akzeptierten KO-/Quellenhash; Paketbau prueft zusaetzlich Absatz-/Quellenidentitaeten. Abgewiesener oder fehlender Cache ergibt ehrliche Teilausgabe mit Karten, keinen alten Text unter neuer Bindung |
| P1: Alte Clients haetten waehrend Migration/Code-Rueckweg synthetische Felder im Fortschritts-CAS verwendet | Die alte Direktclaim-RPC behaelt ihre exakte Payload. Nur der neue Wrapper ergaenzt Metadaten innerhalb derselben Transaktion; alte und neue Clients bleiben kompatibel |
| P2: Lagekarten ausserhalb der Briefingauswahl fehlten im Publikationsmanifest | Hintergrundbau uebernimmt die Vereinigung der tatsaechlich geladenen Briefing-/Lage-KO-Abhaengigkeiten; keine zusaetzliche Korpussuche beim Appstart |
| P2: Alte Metrik-RPC haette Bereitschaft trotz fehlender Kernmigration signalisiert | Ein lesender Vorflug auf die neue Tagesstand-RPC mit leeren Filtern bestaetigt die Migration vor Metriken und vor Quellenkontingenten |

Der moderne Queue-Paketbauer reicht auch eine fehlende Lageansicht ausdruecklich
als `null` weiter. Damit kann er nicht unbeabsichtigt den alten optionalen
Materialisierungsvertrag nutzen. Bei unbestaetigter aktueller Textbindung bleiben
Karten und vorheriger Archivstand erhalten.

Nur neue oder tatsaechlich geaenderte Faelle ausgefuehrt, jeweils ueber `lokal.js`:

- `verarbeitungskern-abnahme-test.js`: fuenf neue Bereitschafts-/Materialisierungs-
  faelle bestanden. Drei bestanden sofort, der Quellenfensterfall nach Ergaenzen
  der im ersten Fixture fehlenden Fensterlimits; nur dieser Fall erneut geprueft.
- `quellen-arbeitsfenster-test.js --only='echte Workerbereitschaft'`: ein
  tatsaechlich geaenderter bestehender Vorflugfall bestanden.
- `verarbeitungskern-rohbestand-test.js --only=findings-fk` und
  `--only=findings-write`: je ein neuer Fall bestanden; Transport simuliert den
  wirklichen Fremdschluessel und einen echten Fundstellenschreibfehler.
- `verarbeitungskern-claim-datenbank-test.js --kompatibilitaet`: drei neue echte
  PostgreSQL-Faelle bestanden: alte Payloadgleichheit, erfolgreicher alter
  Fortschritts-CAS, neue getrennte Metadaten. Ausschliesslich zwei Jobs im
  netzlosen lokalen Container; danach Rollback und Containerbereinigung.
- `tagespaket-auslieferung-test.js`: fuenf ausgewaehlte neue/geaenderte Gruppen
  bestanden: Profil-/Quellenkontextwechsel, Cacheaustausch, Lage-only-Abhaengigkeit
  bei Publikationssperre, echter cacheOnly-Lagebauer sowie geaenderte Teilfortsetzung.
  Unvollstaendige Zeit-/Quellendatum-Testfixtures wurden korrigiert; kein
  fachlicher Produktfilter wurde dafuer gelockert.

Nach den Korrekturen kein verbleibender Befund im unabhaengig geprueften Umfang.
Drift-Pruefhashes stimmen mit den neuen Funktionskoerpern ueberein. Die gezielte
Codeabnahme ersetzt weder die weiterhin fehlenden Pflichtchecks noch echte
Kundenbedienung, wirtschaftliche Dimensionierung oder eine Production-Freigabe.
Keine breite CI, alten Mengenfaelle, bezahlten Modelle oder Production-Aenderungen
in diesem Abnahmeschritt. Der im ersten Umsetzungsschritt versehentlich gelaufene
500er Altfall bleibt ausschliesslich als oben dokumentierte Abweichung erhalten.

## Begrenzte Pflicht-CI nach weiterem Betreiber-Go (13.11.2026)

Die beiden Pflichtnamen bleiben erhalten. Ein neuer ausdruecklich manueller
`verarbeitungskern`-Modus gilt ausschliesslich fuer PR1183. Anfrage, Workflow,
Checkout und aktueller PR-Kopf muessen denselben exakten Commit benennen;
Repository, PR-Basis und Branch werden gegen aktuelle GitHub-Metadaten geprueft.
Alle Dateien ausser den fuenf konkret benannten CI-Dateien und diesen beiden
Statusdokumenten muessen samt Modus/Blob-ID exakt dem unabhaengig abgenommenen
Stand `bce55393` entsprechen. Neue, geloeschte, umbenannte, ausfuehrbare oder
verlinkte Laufzeitdateien sowie unbekannte SQL-/Guard-/CI-Aenderungen stoppen.
Fehlende Bindungen oder unbekannte Modi starten niemals ersatzweise alte Suiten.

Neu ausgefuehrt werden die kleinen CI-Auswahl-/Negativfaelle und ein neuer
Chromium-Weg fuer das gespeicherte Tagespaket bei 1280/390 Pixeln. Dieser verwendet
vorhandene synthetische Daten und die echte SPA/HTTP-Autorisierung. Geprueft
werden Paket-/Profil-/Quellen-/Tagesbindung, belegter Narrativtext, ehrlicher
Teilstatus, Lage/Radar/Briefing/Buero-Navigation sowie Tenantmanipulation und
anonymer Zugriff. Korpus-/Modell-/Schreibzugriffe und externe Browserabrufe sind
gesperrt; Paket/Quittung werden nur gelesen. Fehlender Chromium ist ein Fehler.

Die bisherigen Fach-/SQL-Nachweise sind **wiederverwendet, nicht erneut in CI
ausgefuehrt**; Offline-Zusammenfassung und beide Planausgaben grenzen den Umfang ab.
Kein alter Browsergesamtlauf, Mock100/500, Mengenlauf oder DB-Dienst im begrenzten
Modus. Das bestehende angeheftete Playwright und die bisherigen zwei Pflichtchecks
werden weiterverwendet. Der GitHub-Token liest nur PR-Metadaten im Planschritt;
Checkout speichert ihn in diesem Modus nicht fuer nachfolgende Testprozesse.

Lokal bestanden die 15 neuen Auswahlpruefgruppen gezielt (12 beim ersten Lauf,
zwei nach Korrektur einer zu breit gefassten Testassertion, eine neue Token-/
Zusammenfassungspruefung separat). YAML lesbar; Syntax und Diff geprueft.
Zwei unabhaengige Codex-Auftraege fuer Browserimplementation und read-only Review,
klar getrennte Dateien; finales Review ohne Befund. Kein lokaler Browserdoppellauf.
Das tatsaechliche CI-Ergebnis ist erst am konkreten Lauf/Commit belegt, siehe
[PR1183 und dessen Checks](https://github.com/ernisch/helmut-pilot/pull/1183).

Die normale konservative Auswahl bleibt unveraendert. Insbesondere startet ein
spaeterer `main`-Push weiterhin den normalen Pruefplan; dieser enge manuelle Modus
ist keine automatische Ausnahme fuer Merge, andere PRs oder Folgeaenderungen.
Vor einem spaeter freigegebenen Merge muss auch dieser Ausloesepfad geklaert sein,
damit keine untersagten alten Mengenlaeufe ausgeloest werden.

## Rueckweg und verbleibende Grenze

Die neue Migration liegt mit passender `rollback_...sql` vor und ist **nicht**
auf Production angewendet. Rueckweg: zuerst neuen Worker kontrolliert stoppen,
Code zuruecknehmen und nur nach konkreter Freigabe SQL zuruecknehmen. Der
SQL-Rueckweg stellt alte Funktionskoerper wieder her und entfernt neue RPCs,
Indizes sowie `last_seen_window`; eigentliche Artikel, Jobs, Abschluesse, Kosten,
Reservierungen, Quellenarchive und Tagespakete bleiben erhalten. Die neue
Wiederbeobachtungsmetadaten-Spalte faellt beim Rueckweg weg.

Offen bleiben das konkrete Pflicht-CI-Ergebnis laut PR, der spaetere `main`-CI-
Ausloesepfad, gesonderte Mergefreigabe, freizugebende Migration und Deployment,
authentifizierte echte Kundenabnahme sowie die belegte Zeit-/Kosten-/RAM-
Dimensionierung vor Zulassung weiterer Kunden. Weder der erste zahlende Kunde
noch 100 aktive Kunden werden durch diesen Entwicklungsstand automatisch aktiviert.

**Genau naechster Schritt nach erfolgreicher begrenzter CI:** kontrollierten
Einprofil-Rollout einschliesslich Migrationsreihenfolge und Rueckweg konkret zur
gesonderten Freigabe vorlegen. Der PR bleibt bis dahin ein Entwurf ohne Mergefreigabe.
