# Verarbeitungskern fuer die ersten 100 aktiven Kunden

Stand 13.11.2026. Entwicklungsbranch `codex/verarbeitungskern-100-20261113`,
Ausgangsstand `fe94f3eb`. Kerncommit `8d780785`; die Auslieferung ist ein
getrennter Folgecommit desselben Reviewbranches. **Kernumbau nach konkreter
Einprofilfreigabe auf Production `597d7876`; gespeicherter heutiger Paketstand
teilweise. Neuer regulaerer Tageslauf und Kundenbedienabnahme offen.
Kein Kapazitaetsnachweis fuer 100 Kunden.**

## Reparatur der tatsaechlichen Lieferblocker (13.11.2026, 21 UTC)

**DIP-Isolation nach konkretem Merge-Go ausgerollt:**
[PR1185](https://github.com/ernisch/helmut-pilot/pull/1185), freigegebener Kopf
`737ac9b68158a947845bb676e390e2724bb4a1e8`, normale Merge-SHA
`cc283e0bae8ed7b9f25c551379a9ee1f8895a91c`. Parents73b34b02/737ac9b6,
Dateibaum identisch zum geprueften Kopf. Beide Pflichtchecks in
[CI43518358156](https://github.com/ernisch/helmut-pilot/actions/runs/43518358156)
gruen: acht neue Artikelisolationsfaelle, sechs neue CI-Profilgegenfaelle,
geaenderte JS-Syntax. Browser bewusst unveraendert wiederverwendet; keine alten
Fach-/Browser-/DB-/Mengenpruefungen wiederholt. Unabhaengige Fach-/CI-Reviews ohne Befund.

Pro DIP-Dokument gilt dieselbe strenge Quellenbindung. Bestaetigte Nachbarn laufen
weiter; abgewiesene bekommen begrenzte idempotente Fehlerjobs mit einem Versuch,
ohne Rohpayload-/Modellzugriff. Ungeklaerte Persistenz-/Einreihung bleibt gesperrt.
Quelle meldet ehrlich Teilstand. Endgueltigen alten DIP-Auftrag nicht zurueckgesetzt.

Regulaeres Gitdeployment `dpl_HBoMQ2Jvq5ZK2mCGm9egL8dDF4Wk` READY, fra1,
Hauptalias und rein lesende Runtime bestaetigencc283e0b. Anonymer Appstart401,
Kommunikation/Kohortenquellen gesperrt, exklusiver relationaler Profilpfad bestaetigt.
Vor Merge null neuere laufende Prozesse/null aktive Jobleases. Keine breite main-CI,
Migration, Limits-/Cron-/Env-/Profilaktivierung oder neuer Quellen-/Modelllauf.
Paket nach Rollout unveraendert22:05:03.882 UTC,69Eintraege/2Absaetze/8Karten,
Hash `665f55fb9f5c7d95e96cd305e14d1b67d37eeb6042f3a4c2f12afa9f70e2acbf`;
Kostenbuchbindung unveraendert2,603647USDgesamt. Sources weiter unvollstaendig,
kein Tagesanlass/Radarstale. Keine vollstaendige frische Kundenversorgung behauptet.
Naechster Schritt: naechsten regulaeren Quellen-/Morgenlauf samt Paketstand pruefen.

**Echter Betreiberlauf und neuer Paketstand,21:58–22:05 UTC:**
Adminlauf `admin-quellen-2026-11-13-8e21b6a7-ccc5-4f15-b28c-8d5b3b328938`
auf73b34b02 abgeschlossen:140Ziel,15erledigt,8Fehler,96zurueckgestellt,
21wiederholt. Sechs Abrufe und neun Understandingauftraege erledigt. Sieben
historische Artikelversionen vor Modellen gesperrt: fuenf Herausgeberanzeigewechsel,
zwei Publikationszeitabweichungen. Keine allgemeine Archiv-/Queuefehlfunktion.
Enger Publikationsdatumsnachweis der neun erledigten Understandingauftraege:
sechs Artikel vom13.11., zwei vom12.11. und einer vom12.06. Damit ist Fortschritt
frischer Tagesarbeit im echten Lauf belegt; keine heutige Frische aus Abrufzeit abgeleitet.
Ein DIP-Quellenauftrag scheiterte an `dip-quellfelder-nicht-bestaetigt`;
belegte Isolationsluecke: ein ungueltiges Dokument kann seinen gesamten DIP-Stapel
vor Persistenz stoppen. Ein Adapterfehler oder elf tatsaechlich brauchbare Nachbarn
sind ohne Antwortsnapshot nicht belegt. Kleinster Isolationsfix in Vorbereitung;
streng gleiche Quellenbindung behalten, keine historischen Fehler blind wiederholen.

Nach abgeschlossenem Lauf genau einmal Lagecron, danach Morgenpaketlauf ausgefuehrt,
beide200. Neue Lage und Paket um22:05:03.882 UTC:69Eintraege,zwei gepruefte
Absaetze/acht Karten. Paket und gebundene Morgenquittung gespeichert/verifiziert;
weiterhin `quellenversorgung-unvollstaendig`/`briefing-ohne-tagesanlass`, Radarstale.
Kein fachlicher Gesamt-PASS oder authentifizierter Kundenklicknachweis.
Acht abgerechnete Understandingcalls0,051080USD und zwei Lagecalls0,014550USD,
zusammen0,065630USD. Tagesbindung0,382647USD, Grenzen1USD/Tag und30USDgesamt
unveraendert. Push ausdruecklich gesperrt, keine ausgehenden Nachrichten.
Betreiber muss vorerst keinen weiteren Quellenlauf starten.

**Ausgerollt nach gesonderter konkreter Freigabe:** PR1184 mit exakt freigegebenem
Kopf `addc25aa3ee7fe97a06b5a406fdcb9cae1fda2bd`, beide Pflichtchecks in
[CI43512468427](https://github.com/ernisch/helmut-pilot/actions/runs/43512468427)
erfolgreich. Der Nachtrag pruefte nur die korrigierte Ankergruppe, geaenderte
JavaScript-Syntax und zwei Ruhelageanzeigen. Die DOM-Diagnose bestaetigt das
vorhandene Intro und danach korrekte Ruhelage mit zwei weiterlaufenden Lagekarten;
je Viewport1797ms gewartet. Die ersten11/13 positiven Teilbelege bleiben erhalten,
der erste Gesamtlauf bleibt fehlgeschlagen. Keine alten Faelle wiederholt.

Normaler Merge `73b34b02c7690656191a5d45d5efd32c954ff771`, Parents597d7876/addc25aa,
Dateibaum identisch zum geprueften Kopf. Vercel-Gitdeployment
`dpl_52Mv2RdSfHQW6u9YHz22XL8t9bsa` READY, fra1, regulaere Aliase zugeordnet,
aliasError=null. Rein lesende Runtime am Hauptalias bestaetigt exakt73b34b02,
Supabase/V3/exklusive relationale Profile, Quellenmodus an und Kommunikation/
Kohortenquellen gesperrt. Anonymer Appstart401. Keine neue Migration oder Limits.
Vor Merge null laufende neuere Prozesse und null aktive Jobleases.

Nach Rollout gezielt nur Paketmetadaten und Tageszaehler gelesen: Erzeugungszeit
20:50:34.423 UTC und Inhaltshash `ed23ffd180c9cdb3427c5a6e3f456f7badf0c3b28d194985839e17eaad6ee50b`
identisch zum zuvor mit korrigiertem Leser verifizierten echten Snapshot;
Profilhash identisch, zwei Lageabsaetze/neun Karten erhalten. Keine erneute
Erzeugung oder Modellkosten. Weiterhin offene Versorgung/kein Tagesanlass und
ehrlich stale Radar. Kein neuer Quellenlauf registriert,155 heutige Aufgaben
warten unveraendert. Betreiber hat Quellenstart in eigener Admin-Sitzung uebernommen;
Rueckmeldung zum angezeigten Startzustand angefragt. Kein Production-Klicknachweis.

**Naechster Schritt:** den Betreiber-Quellenlauf auswerten und seinen resultierenden
Tagespaketstand pruefen. Keine zugesagte Vollversorgung oder100-Kunden-Kapazitaet.
Die folgenden datierten Befunde erhalten die urspruengliche Reparatur-/Testfolge.

Isolierter Reparaturbranch `codex/einprofil-lieferfaehigkeit-20261113`, Basis
Production/main `597d7876`; Preview ausdruecklich deaktiviert. Vier kleine
Laufzeitkorrekturen, keine Migration oder neue Infrastruktur:

- `publication-eligibility.assertRecorded` verglich JSON-Serialisierungen.
  Supabase-JSONB ordnet identische Policyfelder anders; der echte Paketleser
  verwarf deshalb gueltige Pakete vor dem Quellenidentitaetsnachschlag.
  Struktureller strikter Vergleich erlaubt nur die andere Feldreihenfolge;
  veraenderte Werte, Typen, fehlende und zusaetzliche Felder bleiben gesperrt.
- Die Quellenautomatik stoppte nach einzelnen abschliessend belegten Jobfehlern.
  Heute waren alle155 wartenden Jobs faellig, aber erst3/8 Fenster und900/2400
  Sekunden verbraucht. Kontrolliert abgeschlossene Teilstaende mit ausgeglichener
  Telemetrie duerfen andere faellige Tagesarbeit fortsetzen. Unklarer Ausgang,
  Transportfehler oder Leaseverlust bleiben gesperrt. Nur heutiger Tagesbezug
  zaehlt; historischer Planrest erzwingt keine neuen Fenster.
- Eine ausdrueckliche Ruhelage (`empty`/`quiet`) ist ohne Tagesanlass vollstaendig,
  wenn alle anderen Belege vorliegen. Gap, stale, offene/unbekannte Versorgung
  und fehlende Lage bleiben unvollstaendig. Der Verwaltungshinweis bleibt erhalten.

Gezielte neue lokale Nachweise ueber `scripts/lokal.js`: Quellenfortsetzung7/7,
Ruhelage-Auslieferung7/7, strikter JSONB-Policyvergleich7/7 und Verwaltung3/3.
Keine historischen erfolgreichen Suiten oder Mengenlaeufe wiederholt.
Unabhaengige gegenseitige Codepruefung der beiden Fachreparaturen ohne Restbefund.

Rein lesende Gegenprobe auf echten unveraenderten Production-Snapshots21:14 UTC:
alter Paketleser `available:false`, korrigierter Leser `available:true`,65 gespeicherte
Eintraege, volle Lage mit2 geprueften Absaetzen/9 Karten und gebundener Quittung.
Echte Profil-/Policy-/Quellenschutzwerte und70 gebundene KO-Identitaeten bestaetigt;
kein Modell, kein Schreibzugriff. Radar liefert den gespeicherten ehrlichen Stand:
eine Dynamik vom08.11., weiterhin stale. Dies ist kein frischer Radar-Nachweis
und keine authentifizierte Production-HTTP-/Browserabnahme.
Die korrigierte Quellenentscheidung erlaubt mit echten schmalen Tagesmetadaten
`automatik-restarbeit`; sieben GETs, keine Reservierung oder Verarbeitung.

Die Fachreparatur ist in [PR1184](https://github.com/ernisch/helmut-pilot/pull/1184)
integriert. Die eng gebundene automatische PR-CI behaelt beide echten Pflichtjobs;
ganzer Dateibaum und exakte Runtime-/Test-/Konfigurationsblobs werden geprueft.
Keine breite Standard-/Datenbank-/Mengenwiederholung, keine Statuspublisher.
Unabhaengiges CI-Review ohne Befund. Erster echter
[CI-Lauf43511072972](https://github.com/ernisch/helmut-pilot/actions/runs/43511072972)
auf `6aaaee5c`:11 neue Planpruefgruppen und13 neue JSONB-Browserchecks bestanden.
Der Lauf bleibt fehlgeschlagen: die letzte Plangruppe zaehlte auch Bash-Verwendungen
statt nur Env-Deklarationen; zwei UI-Checks liefen nach50ms waehrend des bestehenden
1400ms-Intros. Korrektur nur in Tests: Zeilenanker sowie Warten auf sichtbare Karte.
Naechster Lauf prueft nur diese drei Gegenfaelle und bisher nicht gestartete Syntax;
11/13 bereits positive Faelle bleiben ausdruecklich wiederverwendete Teilbelege,
kein gruener Gesamtjob im ersten Lauf behauptet. Produktcode/24 lokale Faelle unveraendert.

Radar zusaetzlich fachlich rein lesend geprueft:48 Rohartikel insgesamt, nur4 vom
heutigen Berliner Tag. Sechs gebundene Kandidaten mit22 Originalquellen und echte
Profil-/Policywerte reproduzieren exakt die gespeicherte Pflegereform-Beobachtung
mit juengstem Beleg08.11. Andere Kandidaten haben keinen belegten Mandatsbezug oder
kein mehrtaegiges/fristgebundenes Beobachtungssignal. Kein weiterer Radarfehler
nachgewiesen; Kriterien bleiben unveraendert. Neue geeignete Signale sind damit
nicht garantiert. Dies ersetzt keinen neuen Quellenlauf oder Production-Klicktest.

Zum Zeitpunkt dieses Vorbereitungsbefunds noch offen: Nachtrags-CI/Freigabe;
beides inzwischen wie oben belegt abgeschlossen. Weiter offen ist echter
Quellenfortschritt und neue Paketerstellung. Der Betreiber uebernimmt den
sicheren vorhandenen Admin-Quellenstart selbst in seiner Admin-Sitzung samt CSRF;
keine Zugangsdaten an Codex weitergegeben. Keine Authentifizierungsumgehung,
Uhr-/Quotenmanipulation oder Budgeterhoehung.

## Ausgefuehrter Einprofil-Rollout und damaliger Stand (13.11.2026)

**Nachtrag nach weiterem ausdruecklichem Test-Go, 20:49–20:50 UTC:**
Manueller Production-Einprofiltest jetzt ausgefuehrt, ausschliesslich `cem-ince`.
Vorflug bestaetigte genau ein aktives Profil, null laufende Leases, unveraenderte
Runtime597d7876 und gesperrte Kommunikation/Kohortenquellen. Bestehendes Kostenbuch
konsistent; Tagesbindung0,301504 USD, verfuegbarer Rest0,698496 USD. Keine Erhoehung.
Einmal `/api/cron/lage-briefing`, danach einmal `/api/cron/morning-briefing`;
jeweils HTTP200, ohne Wiederholungen oder erzwungenes Leeren bestaetigter Caches.

Lage neu erzeugt (`fromCache=false`), zwei belegte Absaetze/neun Vorgangskarten.
Tagespaket um20:50:34 UTC mit voller Lageansicht gespeichert, Morgenquittung
um20:50:35 UTC. Persistierte Primarschluessel nachgelesen; Inhaltshash, Mandat/Tag,
Quellenbeleg, identischer Lagequelltext und Paket-/Quittungsbindung mit bestehender
Produktlogik bestaetigt. Zwei Modellaufrufe vollstaendig abgerechnet; zusaetzlich
**0,015513 USD** im Kostenbuch, Tagesbindung danach0,317017 USD, gesamt2,538017 USD.
Keine neuen offenen Reserven; acht bestehende offene Reserven unangetastet.
Der KI-freie Paketbau verursachte keine weiteren Modellaufrufe. Push explizit
gesperrt (`testfenster-sperrt-alle-aussenkanaele`), keine ausgehenden Mails.

**Kein fachlicher Gesamt-PASS:** Beide Handler melden den Quellenzustand ehrlich
offen; Morgenlauf `ok=false`, `morgenversorgung-unvollstaendig`, obwohl Paket und
Quittung gespeichert/verifiziert sind. Paketfehler bleiben
`quellenversorgung-unvollstaendig` und `briefing-ohne-tagesanlass`.
Heutiger Plan ist fertig eingereiht (Cursor157/157). Enger relationaler Zaehler
fuer2026-11-13T00Z:152 wartende source_fetch,1 document_understanding,
1 mandate_projection,1 briefing_materialization, keine laufenden/fehlgeschlagenen
Jobs in diesem Fenster;1 Abruf erledigt. Dies belegt offene Vorarbeiten, noch
nicht deren Ursache oder Faelligkeit. Keine historischen Jobs oder Quellenmassen
im Test abgearbeitet, keine Flags/Limits/Profile veraendert. Ein echter
authentifizierter Kundenklicktest bleibt offen.

**Genau naechster Schritt nach dem Live-Test:** Ursache der offenen heutigen
Quellenvorarbeiten klaeren. Der nachstehende Rolloutbefund ist der vorherige Stand;
die damals fehlende volle Lageansicht ist durch diesen Test inzwischen gespeichert.

[PR1183](https://github.com/ernisch/helmut-pilot/pull/1183) ist nach ausdruecklichem
Betreiber-Ja normal gemergt. Mergecommit `597d7876d3f1ce963174fe749ffb28bd98f15065`
hat die Parents `fe94f3eb` und exakt den freigegebenen Kopf `4f764317`;
Baum `7126f6a196be7ba6552fe368a02f293deabeb1dc` ist mit diesem Kopf identisch.
Vercel-Productiondeployment `dpl_AZEUX1v4DgPbdDPGBSmcE1HDTzQC` ist READY,
regulaerer Alias und rein lesender Runtimebeleg bestaetigen denselben Commit.
Anonymer Appstart liefert weiterhin401. Keine breite main-CI gestartet.

Die exakt freigegebene SQL-Datei `20261113165614_frische_tagesarbeit.sql`
(SHA256 `1ea818f8c63e87ea05b4915099ada2663f6f446dabd20d1d4f05c69bf0bce35d`)
wurde vor Code angewendet. Supabase vergab im Anwendungsregister die Version
**`20261113193319`**, Name `frische_tagesarbeit`. Das ist dieselbe eine Migration;
wegen des abweichenden Quelldateistempels keinesfalls erneut anwenden.
Spalte/Indizes gueltig, drei neue RPCs Invoker und ausschliesslich service_role,
erwartete Funktionshashes und fuenf Nullzaehler des leeren Tagesvorflugs bestaetigt,
auch ueber den wirklichen PostgREST-Appzugang. #1179 wurde nicht erneut angewendet.

Der anfaengliche Mergeblocker hatte eine belegte Ursache: Laut
[GitHub-Dokumentation](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#checks-from-some-workflow-jobs-are-not-evaluated)
zaehlen native `workflow_dispatch`-Jobchecks nicht fuer PR-Pflichtregeln.
Die Tests waren erfolgreich, wurden aber nicht ausgewertet. Ein isolierter
Hilfsbranch `codex/ci-evidence-1183-20261113` (Deployment ausdruecklich aus)
liess den Produktkopf unveraendert. Sein kurzer Ablauf prueft Publisher-SHA,
PR/Basis, Originalruns/-jobs/-schritte, Hoechstalter sieben Tage, vollen Dateibaum
und erforderliche GitHub-App vor jeder Statusuebernahme. Danach veroeffentlicht
er die tatsaechlichen Belege ausdruecklich als wiederverwendete Commitstatuswerte
mit Originaljob-URLs. Ausschliesslich GitHub-Actions-Token mit minimalen Rechten,
keine Produktzugangsdaten, Schutzaenderung, Adminumgehung oder Testwiederholung.

[Nachweisuebernahme43501971324](https://github.com/ernisch/helmut-pilot/actions/runs/43501971324)
auf Hilfscommit `18cc3559` ist erfolgreich. Der erste Hilfslauf43501202256
stoppte nach bestaetigtem ersten Status: die kombinierte Statusantwort enthaelt
keinen Ersteller. Der Leser wurde auf die vollstaendige Statusliste korrigiert;
der zweite Lauf erkannte den vorhandenen Status und schrieb ihn nicht erneut.
Konflikte/mehrdeutige oder abgeschnittene Listen stoppen, unbekannte POST-Ausgaenge
werden nur lesend geklaert. Neun neue lokale Negativgruppen bestanden, danach
nur drei wegen des API-Adapters geaenderte Gruppen plus ein neuer Schemafall;
dessen neue Fenstergrenze separat nachgeprueft. Unabhaengige Sicherheitsabnahme
ohne Befund. Kein alter Fach-/Browser-/Mengenlauf und kein neuer Modellaufruf.
GitHub erkannte danach beide erforderlichen Kontexte regulaer an (PR clean).
Der genehmigte Merge mit `[skip ci]` loeste keine breite Wiederholungs-CI aus;
Vercels regulaere Gitintegration baute und veroeffentlichte Production.

Schalter/Zulassung/Kostenbuch vor Merge erneut lesend bestaetigt: ausschliesslich
`cem-ince`, Pipeline on, Narrativqueue off, globale Phase/Abrufe off, Dispatch
shadow, Kommunikation gesperrt, 1 USD/UTC-Tag und 30 USD insgesamt. Kostenbuch
konsistent, acht bestehende offene Reserven unveraendert. Keine weiteren Kunden,
keine manuellen Modell-/Quellen-/Recoverylaeufe, keine Profil-/Budget-/Cron-/Env-
oder fachlichen Datenkorrekturen. Kein Code-/SQL-Rueckbau erforderlich.

Heutiges gespeichertes Paket und Morgenquittung fuer `cem-ince` wurden nur ueber
ihre beiden Primaerschluessel gelesen: Mandat/Tag/Inhaltshash und gespeicherte
Quittungsbindung stimmen. Der vorhandene Stand vom 13.11. bleibt **teilweise**:
Quellenversorgung unvollstaendig, kein Tagesanlass, keine volle gespeicherte
Lageansicht. Der Rollout hat dieses Paket nicht umgeschrieben oder durch einen
bezahlten Aufruf ersetzt. Keine authentifizierte Kundenbedienabnahme und kein
neuer erfolgreicher regulaerer Tageslauf behauptet.

**Genau naechster Schritt:** den naechsten regulaeren Morgenlauf fuer `cem-ince`
am 14.11. ab 06:15 Berlin samt neuer Paketvollstaendigkeit beobachten.
Die folgenden Implementierungs- und Planabschnitte erhalten den historischen
Vorbereitungsstand; fuer den ausgefuehrten Betrieb gilt dieser Statuskopf.

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

## Konkreter Einprofil-Rolloutplan nach Betreiber-Go (13.11.2026)

**Nur vorbereitet; keine Ausfuehrungsfreigabe aus dem Planungs-Go.**
Geltungsbereich: PR1183 mit exakt freizugebendem aktuellem Kopf, Basis/Production
`fe94f3eb9b2c959af7c0e2e9e554d676efbb8d6f`, Vercelprojekt
`prj_xbZ6QzTkr7YoxQI71lW59FT03IR3`, Team `team_bTAfzDHwD3mT03r1z7rh1TC3`,
Supabaseprojekt `ddckuvvpcytqbyfmbvie`, ausschliesslich bestehendes `cem-ince`.

### Frische Primaerbelege und notwendige kleine Korrektur

Productiondeployment `dpl_9pPQ7jtKwrXeQx6Puzr7a8ZkZNRd` ist READY auf `fe94f3eb`
mit regulaerem Alias. Supabase-Migrationsregister bestaetigt #1179 weiterhin;
neue Kernmigration/Spalte fehlen. Enger read-only-Vorflug bestaetigt ein aktives
Profil (`cem-ince`), Jobtabelle einschliesslich Indizes 27.279.360 Bytes,
22.709 statistisch geschaetzte Zeilen und null wartende Tabellensperren zum
Abfragezeitpunkt. Kein Vollscan von Jobpayloads und keine Lastprobe.

Vercel-Konfiguration einzeln rein lesend bestaetigt: Pipeline **on**, Narrativqueue
**off**, globale Phase/Abrufe **off**, Dispatch **shadow**, Kommunikation
**gesperrt**. Zulassung enthaelt nur `cem-ince`; Geldvertrag weiterhin
1 USD/UTC-Tag und 30 USD insgesamt. Die Betriebsnotiz vom 05.11. mit Pipeline
`off` ist an dieser Stelle ueberholt. Die neue Quellen-/Artikel-/Projektions-
und Paketlogik wird deshalb bereits beim Code-Rollout wirksam; das Narrativ
bleibt beim direkten Cron. Schalter und Zulassung werden nicht erweitert.

Der Vorflug fand einen echten Migrationsblocker: Live-`helmut_claim_job_by_id`
hat `md5(prosrc)=80e91814dd75c7c893caf047b39a2cff`; Repositoryaltstand
`76982a28ea50df628a3547de293e13a1`. Unabhaengiger Vergleich bestaetigt exakt
52 identische Codezeilen; live fehlen ausschliesslich zehn volle Kommentarzeilen.
Die vorbereitete Migration akzeptiert jetzt genau diesen zusaetzlichen Hash
und ausschliesslich fuer diese Signatur. Keine allgemeine Normalisierung oder
Lockerung der unbekannten Drift-/Invokerwache; kein Umschreiben in Production.
SQL-Blob `baa2d2f743731dd3b076cfb467d38b5c9c563a6b`, Test-Blob
`2fab9a3d48c17889fc6c15c895f4dccda54c4fe9`, unabhaengig ohne Befund abgenommen.

Neue Nachtrags-CI bindet genau diese zwei Blob-IDs; alle uebrigen Laufzeitdateien
und das Browserprogramm sind unveraendert. Sie prueft sieben neue Policygruppen
und drei neue echte SQL-Guardfaelle (reproduzierter Livehash, weitere Drift
stoppt vor DDL, exakt akzeptierter Livehash migriert). Nur diese Faelle laufen.
Ein lokaler Containerstart scheiterte nach Imagepull an vollem Entwicklungs-
datentraeger; kein SQL-Fall gestartet. Ausschliesslich das frisch geladene Image
entfernt, danach wieder 3 GB frei. SQL-Pruefung deshalb einmalig in bestehender
CI, gepinnter netzloser PostgreSQL17.6, drei Minuten Grenze, anschliessend Cleanup.
Die alten 15 Policygruppen und 29 Browserpruefungen werden nicht wiederholt.
Ihr echter Erfolgsbeleg [CI43483196284](https://github.com/ernisch/helmut-pilot/actions/runs/43483196284)
auf `f7f3d6eb` bleibt erhalten. Der neue Plan prueft Run, Commit, Repository,
Workflow, Versuch, Browserjob/-pruefschritt und kompletten Eingabebaum live.
Wiederverwendung wird ausdruecklich ausgewiesen; kein neuer Browserlauf behauptet.

### Ausfuehrungsfolge, ausschliesslich nach konkreter Freigabe

1. Unmittelbar vorher aktuellen PR-Kopf, main/Production, zugehoerige gruene
   Pflichtchecks, genau ein aktives zugelassenes Profil und dieselben Schalter
   bestaetigen. Laufendes Kostenbuch/offene Reserven mit bestehendem Leser pruefen;
   kein Reset, keine Erhoehung und keine neue bezahlte Probe. Abweichung stoppt.
2. Ruhiges Fenster ausserhalb der vorhandenen UTC-Termine 03:00 bis 05:15 waehlen;
   Beginn fruehestens 06:00 UTC, Ende vor 02:50 UTC des Folgetags. Laufende
   Verbraucher, Leases und Tabellensperren lesend pruefen; bei Konkurrenz warten
   oder stoppen, keine eigenmaechtige Cron-/Flagpause. Alte Vercelfunktionen duerfen
   waehrend der Umstellung noch bis 300s laufen, verteilte Slots bis 360s.
3. Ausschliesslich `20261113165614_frische_tagesarbeit.sql` anwenden, SHA256
   `1ea818f8c63e87ea05b4915099ada2663f6f446dabd20d1d4f05c69bf0bce35d`.
   Die Datei ist atomar; `lock_timeout=3s`, `statement_timeout=30s` je Anweisung.
   ALTER TABLE haelt ACCESS EXCLUSIVE bis COMMIT, auch waehrend der beiden normalen
   Indexbauten. Das ist **keine** Zusage von 30s Gesamtdauer oder stoerungsfreier
   Online-DDL. Timeout, Drift oder unklare Antwort: stoppen, Register/Katalog lesen,
   kein blinder Retry, kein Freigeben unbekannter Reserven.
4. Register, neue Spalte, beide gueltigen Indizes, Invoker/ACL der drei neuen RPCs
   lesend bestaetigen. `helmut_jobs_tagesstand([],[],null)` muss genau eine Zeile
   mit fuenf Nullzaehlern liefern. Keine Arbeitsclaims oder Testjobs auf Production.
5. Erst danach normaler Merge von PR1183 mit `merge_method=merge`, `sha` exakt
   freigegebener Kopf und finaler Commitnachricht mit **`[skip ci]`**. Normale
   GitHub-Schutzregeln gelten, kein Adminbypass. Der Kopf bleibt zweiter Parent;
   Mergebaum muss exakt dem geprueften Kopfbaum entsprechen. Laut
   [GitHub-Doku](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)
   unterdrueckt der Marker den einmaligen push-/PR-Lauf; er ist kein neuer PASS.
   So startet keine verbotene breite main-Pruefung, der Defaultworkflow bleibt gleich.
6. Bestehende Vercel-Gitintegration baut main; die Entwicklungsbranchsperre bleibt.
   Runtime-/Konfigurationsdiff erzwingt im Ignore-Skript einen Build. Dass Vercel
   den GitHub-Marker tatsaechlich ignoriert, wird nicht vorausgesetzt: READY,
   exakten Mergecommit und regulaeren Alias lesen. Bei CANCELLED/fehlendem Build
   stoppen, keinen zweiten Deploymentweg automatisch starten. Ein explizites
   Ersatzdeployment waere erneut gesondert freizugeben.
7. Keine manuellen bezahlten Cron-/Modellaufrufe. Auslieferung an `cem-ince` lesen:
   Mandat, Profilhash, Berliner Tag, Quellenmanifest und Frischequittung pruefen.
   Fehlendes/teilweises Paket bleibt ehrlich sichtbar; der naechste regulaere
   05:15-UTC-Lauf baut es im Hintergrund. Den naechsten regulaeren Quellen-/Lage-/
   Morgenlauf nur beobachten, keine zweite Ausfuehrung. Erst dessen bestaetigtes
   Paket und authentifizierte Bedienabnahme erlauben die Aussage live lieferfaehig.

### Rueckweg und Umfang der angefragten Freigabe

Bevorzugter Rueckweg bei Fehlern: vorhandenes Productiondeployment `fe94f3eb`
wiederherstellen und die kompatible neue SQL zunaechst behalten. Bestaetigte
Artikel, Quellenarchive, Phasen, Pakete, Kosten und Reserven bleiben erhalten.
Ein Vercelrollback kann automatische Domainzuweisung deaktivieren; diesen Zustand
belegen und keine automatische Wiederaktivierung anschliessen. Die konkrete
Rolloutfreigabe muss diesen bedingten Code-Rueckweg einschliessen.

SQL-Rueckbau ist kein automatischer Teil davon. Erst neue Verbraucher beenden,
Drift erneut pruefen und gesondert freigeben. Bereits **vor** Inhalt der
Rollbackdatei muessen Session-`lock_timeout=3s` und `statement_timeout=30s` gelten:
die Datei setzt ihren Locktimeout erst nach zwei DROP FUNCTION und hat keinen
Statementtimeout. Sie stellt die fachlich identische Repositoryaltfunktion mit
Kommentaren her; der Livekommentarstand ist separat als Codeoriginal gesichert.
`last_seen_window` geht beim SQL-Rueckbau verloren, fachliche Datensaetze nicht.

Angefragt wird nach gruener Nachtrags-CI ausschliesslich: die oben gebundene
Migration, der exakt kopfgebundene normale Merge samt einmaligem CI-Marker,
das dadurch ausgeloeste regulaere Productiondeployment und der bedingte
Code-Rueckweg, danach rein lesende Einprofilkontrolle. Keine neue Aktivierung,
keine fachlichen Datenkorrekturen, keine Erweiterung von Budget/Profilen/Quellen,
keine Schalter-/Cron-/Secret-/Registrierungs-/Mailaenderung und kein SQL-Rueckbau.

## Rueckweg und verbleibende Grenze

Die neue Migration liegt mit passender `rollback_...sql` vor und ist inzwischen
wie im Statuskopf belegt angewendet. Rueckweg: zuerst neuen Worker kontrolliert stoppen,
Code zuruecknehmen und nur nach konkreter Freigabe SQL zuruecknehmen. Der
SQL-Rueckweg stellt alte Funktionskoerper wieder her und entfernt neue RPCs,
Indizes sowie `last_seen_window`; eigentliche Artikel, Jobs, Abschluesse, Kosten,
Reservierungen, Quellenarchive und Tagespakete bleiben erhalten. Die neue
Wiederbeobachtungsmetadaten-Spalte faellt beim Rueckweg weg.

Offen bleiben der neue regulaere Tageslauf und die authentifizierte echte
Kundenabnahme sowie die belegte Zeit-/Kosten-/RAM-
Dimensionierung vor Zulassung weiterer Kunden. Weder der erste zahlende Kunde
noch 100 aktive Kunden werden durch diesen Entwicklungsstand automatisch aktiviert.

Die konkrete Einprofilfreigabe und der technische Rollout sind abgeschlossen.
Der naechste Schritt steht im aktuellen Statuskopf; keine weitere Aktivierung.
