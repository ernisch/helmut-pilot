# Verarbeitungskern fuer die ersten 100 aktiven Kunden

Stand 13.11.2026. Entwicklungsbranch `codex/verarbeitungskern-100-20261113`,
Ausgangsstand `fe94f3eb`. Kerncommit `8d780785`; die Auslieferung ist ein
getrennter Folgecommit desselben Reviewbranches. **Kernumbau nach konkreter
Einprofilfreigabe auf Production `597d7876`; gespeicherter heutiger Paketstand
teilweise. Neuer regulaerer Tageslauf und Kundenbedienabnahme offen.
Kein Kapazitaetsnachweis fuer 100 Kunden.**

## Reparatur der tatsaechlichen Lieferblocker (13.11.2026, 21 UTC)

**Nachtauftrag14.11.2026,00:33UTC:** Betreiber erlaubt vollautonome Behebung und
biszu10weitere gruene auftragsbezogene Merges samt regulaerem Deployment. Budget,
Mandantenziel, Schutzregeln und Verbot von Massentests/Production-Datenkorrekturen
bleiben unveraendert. Ziel bleibt echtes Briefing/Radar, kein erfundener Vollstatus.
Enge lesende Diagnose: im13-Fenster166wartende Understandingjobs,100Artikel vor06.11.,
aeltestePublikation11.06.2006,32vom13.11.; allepriority80vorAbruf100. Von27erledigten
achtvom13.11. und einer12.06.2026. Sourcehandler persistiert neben Kandidaten auch
alle geladenen Fundstellen und reiht danach alle bestaetigtenIDs als Tagesarbeit ein.
Geplanter enger Fix: Archiv erhalten, kostenpflichtige Tagesarbeit aus exakt
gebundenen Kandidaten im bestehenden Relevanzhorizont; alte Fundstellen nichtneu
heutePromoten. Bestehende U-/Archivauftraege bleiben unveraendert; die vorhandene
SQL bearbeitet heutige Arbeit unabhaengig von historischen Prioritaeten zuerst.
Radar zeigt belegtes08.11.-Signal korrektstale, kein neuer fachlicher Filterfehler
belegt. Nur unklare Kundentexte korrigieren; Frische-/Bezug-/Fristpruefungen bleiben.
Fehlender Tagesplan14 vor erstem03UTC-Fenster und fehlender neuer Tagesanlass sind
derzeit ehrliche Luecken, kein nachgewiesener UTC/Berlinfehler.
Fuer die erforderliche Nachtfortsetzung ist eine begrenzte ChatGPT-Aufgabe angelegt,
kein Produktcron: `Automation_0aeb84a62fe081918220991cee7564b7`,14.11.03:07UTC
stuendlich fuenf Ausfuehrungen bis07:07UTC, danach kein weiterer Termin. Sie prueft
regulaere Quellen-/Lage-/Paketlaeufe und setzt belegte Reparaturen unter denselben
Grenzen fort. Die gemeinsame10-Merge-Freigabe wird nicht je Ausfuehrung erneuert.
Zaehler seit Nachtfreigabe:1/10Merges (PR1188),9weitere nur beiGruen verbleiben.
**Kontrolle 14.11., 04:07 UTC und gezielter Folgefix:** main/Runtime weiterhin
5a734cc3; nur CEM aktiv, Kommunikations-/Kohortensperre bestaetigt.
Fuenfter Quellenlauf 04:00:46–04:04:33 UTC: 2 erledigt, 2 endgueltige Fehler,
50 zurueckgestellt, 29 Wiederholungen; keine aktive Prozesszeile danach.
Heute 47 Quellenabrufe/53 U erledigt, 106 Abrufe/76 U offen, 5 U fehlgeschlagen.
14 abgerechnete Aufrufe dieses Fensters sind 14 verschiedenen Artikeljobs mit
14 verschiedenen Dokumentkennungen zugeordnet; kein Doppelaufruf daraus belegt.
Ein bestaetigter erster Abschnitt bleibt in KO-Version3 samt Bundle-/Quellenhash
und Lektuerebeleg gespeichert; Jobcursor1 passt dazu. Andere alte KO-Sperren
bleiben unaufgeloest. Keine bezahlte Wiederaufnahme oder Datenkorrektur.
Kostenbindung 0,447599 USD heute/3,171076 USD gesamt, acht alte offene Reserven.
Paket 03:37 unveraendert. Projektion04:15/Materialisierung04:30 noch nicht faellig.
Unabhaengiger Codebefund: U-Prioritaet80 steht auch innerhalb derselben Tagesgruppe
vor Quellenabruf100; der Worker reserviert bisher nur einen Mandatsanteil.
Geplanter Folgefix auf codex/quellenabruf-arbeitsanteil-20261114: begrenzte Phase
fuer heutige Quellenabrufe im bestehenden Slot, danach gemischte echte Restzeit.
Historische Abrufe bekommen dadurch keinen neuen Vorrang; gleiche Sperren,
Kosten-/Zeitgrenzen und Typbeschraenkungen. Nur Worker und neue enge Regression;
keine Migration, Cron-/Env-/Budgetaenderung oder zusaetzliche Verarbeitung.
Implementierung und neue gezielte CI offen; bisher weiter nur 1/10 Nachtmerges.
**Echter erster Tagesbetrieb14.11.,03:00–03:22UTC:** main weiter5a734cc3.
Plan14 fertig eingereiht156/156. Regulaerer Lauf
`cron-crawl-20261114030012-15m2h`03:00:12–03:03:57UTC:128Ziel/56erledigt/
4endgueltigeFehler/61zurueckgestellt/7wiederholt, statuspartial. Danach33heutige
Abrufjobs und6heutigeUnderstandingjobs erledigt. Kein heutigerU-Artikel mit
Rohpublikation ausserhalb14d-Horizont; sechs erledigte haben11.–12.11.-Datum.
Die vier Einzelfehler stoppten keine Fortsetzung: zweiter regulaerer Lauf
`cron-crawl-20261114031512-lsdgd`03:15:12–03:18:58UTC:102Ziel/19erledigt/
1endgueltigerFehler/82zurueckgestellt, statuspartial. ZweiFenster/600Sekunden
reserviert.03:22:54UTC kumulativ42heutigeAbrufjobs+16heutigeU erledigt,
111Abrufe/28U offen,3heutigeUfehlgeschlagen. Projektion04:15 und Paket04:30
noch nicht faellig; Lage05:00/regulaeresMorgenpaket05:15stehen aus.
Kostenbuch03:22:54UTC:0,137613USDTag/2,861090USDgesamt,8alteoffeneReserven
unveraendert. Paket00:07/hash63694c77 unveraendert. Kein manueller Quellenlauf,
keine neue Wiederverarbeitung, Tests oder Modellaufrufe zur Diagnose.

**Zwischenlauf14.11.,03:35–03:50UTC:** Drittes regulaeres Quellenfenster
03:30:12–03:34:02UTC erledigt16Auftraege ohne Einzelfehler,81zurueckgestellt.
Danach einmal bestehende Lage- und Morgenpaketroute fuer CEM im laufenden
Einprofilauftrag auf neuen Eingaben gestartet, beide200. Neuer Paketstand
03:37:17.783UTC:72Eintraege/5Lagekarten/1bestaetigterAbsatz, Hash
495c41d1c460b9a37f9587464a5bb61f3e41bf6cca2950a321546668eac4787b.
Teilbeleg98fbdb20d82549fe78fceffbea902ec9bd69f43b4a5134c5c7b91e942fa6f822
bindet Eingabe74c899d6aebc22d95959b1c8320107e475b9639d14120d49a5458aa7fcb2fc48.
Zwei neue Modellaufrufe0,012273USD; danach0,251616USDTag/2,975093USDgesamt,
acht alte offene Reserven unveraendert. Keine blinde Wiederholung.
Normaler Paketleser03:50UTC auf exakten privaten Production-Snapshots ueber
scripts/lokal.js bestanden:72Eintraege/5Karten/1Absatz/2Radarentwicklungen;
Profil/Quellen/Policy/Berlintag/Quittung passen, private Reviewdaten fehlen im DTO,
Snapshots unveraendert. Kein authentifizierter HTTP-/Browsernachweis.
Radar letzter Quellenbeleg nun12.11.13:01:58UTC, weiterhin korrektstale.
Paket bleibt teilweise:Quellenversorgung offen,keinTagesanlass,LageTeilstand.
Neuer Entwurf verwendet erneut ein sachlich unpassendes Profilfeld fuer eine
Quelle; unabhaengiger Review haelt nur diesen Absatz zurueck. Zwei unabhaengige
rein lokale Gegenpruefungen der privaten Originalbindung: Stichwortoptionen
schliessen Tarifbindung aus, empfehlen aber erneut den zuvor abgelehnten
Ausschussbezug allein wegen Gewerkschaftsnennung. Kein belegter sicherer Fix;
keine Runtime-/Promptaenderung und keine neue Bezahlung gleicher Eingaben.
Andere eigenstaendige Fachthemen vorhanden, zweiter volltragfaehiger Absatz
damit weder bewiesen noch ausgeschlossen. Review und Teilstand bleiben erhalten.
Viertes regulaeres Quellenfenster03:45:12–03:48:58UTC
cron-crawl-20261114034512-v1k4b:77Ziel/23erledigt/0Fehler/51zurueckgestellt,
statussuccess, weiter5a734cc3. Kostenbuch03:54UTC:0,355701USDTag/
3,079178USDgesamt/8alteoffeneReserven. Paket03:37 unveraendert.

Zwei heutige Eingangsdiagnosen sind isolierte DIP-Dokumente292420/292370,
je ein Versuch, Grunddip-quellfelder-nicht-bestaetigt, kein Modellversand.
Originalantwort/Feldcodes fehlen; keineRawzeilen gespeichert. Die oeffentlichen
Dokumentseiten liefern nur SPA-Huellen. ZweckgebundenerDIP-Zugang imWorkspace
und gezielterVercel-Metadatenlesung nicht verfuegbar. Kein Parserfehler aus
Hypothesen abgeleitet, keineSecret-/Authumgehung. Diagnose bleibtUNKNOWN;
belegter Hashrueckbezug bei spaeterer Originalsichtung moeglich. Ein weiterer
heutiger U-Endfehler istartikel-pruefung-fehlgeschlagen:skipped-failed; der
bestaetigt fehlgeschlagene Bestand wird ohne ausdruecklicheWiederaufnahme nicht
erneut bezahlt. Enger unabhaengiger Identitaetsabgleich abgeschlossen: Artikel,
Auftrag und KO entstanden heute03:00:50–03:01:09UTC; KO hat genau diesen einen
Dokumentlink, keine neuen Nachbarn an einem alten Fehlercluster. DerselbeStand
32202cc6 ist archiviert. CASfencing1/versuche1/ki_aufrufe1, letzteAenderung
03:01:09.847UTC, Zustandunbekannt/Grundvalidierung-fehlgeschlagen. Spaetere
Jobversuche03:15 endeten ohne zweiten Modellstart. Keine Historienblockade
belegt und keine Wiederaufnahme, Reset- oder Codeaenderung vorgenommen.
Rein lesende Fruehkontrolle14.11.02:48UTC: main/Runtime weiter5a734cc3,
kein neuer Quellenlauf/Plan14 vor03UTC; Paket/hash63694c77 und Kostenbindung
0USDTag/2,723477USDgesamt/8offeneReserven unveraendert, nurCEMaktiv.
Die ChatGPT-condition_watch-Ausfuehrung erfolgte vor dem geplanten03:07-Termin;
eigene Nachtaufgabe deshalb auf exact_schedule fuer03:07–07:07UTC gestellt.
Nur ChatGPT-Ausfuehrungszeit korrigiert, keine Produktcron-/Env-/Budgetaenderung.
Implementierung PR1188 vor CI unabhaengig gegengeprueft: drei Quelldateien und
zwei Radar-/Browserdateien ohne offenen Befund. Exakte Versionsbindung liest nur
die ausgewaehlten bestaetigten Artikelstaende sequentiell nach; kein Korpusread.
Gleiche URL beweist keine gleiche Artikelversion. Langer Originaltext und der
bestehende enge Herausgeberaliasvertrag bleiben erhalten. Unbekannter Ausgang
bleibt Fehler, bereits eingereihte gute Nachbarn bleiben erhalten. Bestehende
Understandingauftraege/Modelle/Archivpfade und14d-Relevanzhorizont unveraendert;
Relevanz ist ausdruecklich kein neuer Tagesanlass. Geplant:9neueFachgruppen,
6neueProfilgruppen,7neueRadar-Browserchecks Desktop/Mobil und geaenderte Syntax.
Keine erfolgreichen Vorbelege wiederholen; Tests noch offen.
Erst-CI43537245306 am43282d1b:6neueProfilgruppen und erste3Fachgruppen bestanden;
4.Fachgruppe scheitert vor Produktausfuehrung an nichtkanonisierter synthetischer
Bundestag-URL beim Standhash. Unveraenderte strikte Produktpruefung wird nicht gelockert.
Browserjob132269105907 erfolgreich:7neueRadarchecks Desktop/Mobil. Dieser Offline-
Erstfehler bleibt erhalten. Ein-Datei-Nachtrag kanonisiert ausschliesslich dieFixture
und waehlt exakt6noch offeneFachgruppen; erste3Fachgruppen werden nicht wiederholt.
Unabhaengig gegengeprueft, Produkt-/Browsercode unveraendert. Nachtrags-CI soll nur
6offeneFachgruppen,2geaenderteCI-Schrittanker und fehlendeSyntax ausfuehren;
4unveraenderteProfilgruppen und7Browserchecks werden sichtbar wiederverwendet.
Nachtrags-CI43537801132 am `a58c0de9d5bd14bdecc0771fb8546b845230b431`:
beide Pflichtchecks gruen;6offeneFachgruppen+2geaenderteSchrittanker+Syntax bestanden,
keineBrowserinstallation/-wiederholung. Damit alle9Fachgruppen und7Browserchecks
ueber beide Laeufe bestaetigt,4Profilgruppen unveraendert und2Anker neu abgenommen.
Root und beide unabhaengigen Fach-/CI-Reviews ohne offenen Befund.

**Erster Nachtmerge ausgerollt:** PR1188 normal auf
`5a734cc38549c0e6f922bf7471d44042ed3b5deb`, Parentsc97fbbd0/a58c0de9;
Dateibaum `b7fe873e9e3371d2d7b4ee20b20a26e3d791e288` exakt wie gepruefter Kopf.
Vercel `dpl_D79CzZSN6FcY4BMNV6hmvm4P8QHg` regulaerGit/Production/fra1 READY,
Hauptalias und Runtime5a734cc3 bestaetigt, anonym401. Ausgelieferteclient.js
bytegleich zum geprueften Original, SHA256
`f9d55ded81c94405c9661880872692878bbc3f1158ddff83f2146aca82f0254b`,
neueRadarkundentexte vorhanden. Kommunikations-/Kohortenquellensperre aktiv.
VorMerge0laufendeProzesse/aktiveLeases. GenauCEMaktiv; Tagesbindung14.11.UTC0USD,
gesamt2,723477USD/8alteoffeneReserven unveraendert. Kein neuerQuellen-/Modelllauf,
keine Datenkorrektur/Migration/Env-/Budget-/Cron-/Kunden-/Mailaenderung.
Bestehendes Paket00:07:20.357UTC/hash63694c77 unveraendert57Eintraege/1Absatz;
Quellen offen/keinTagesanlass/LageTeilstand bleiben ehrlich teilweise. Noch keine
Livebeanspruchung des neuen Tages-Enqueuepfads vor regulaerem03UTC-Start;
die begrenzte Nachtfortsetzung beobachtet diesen und spaeter05:15UTC dasPaket.

**Aktueller Rollout und Liveausgabe,14.11.2026UTC:** Nach konkretem Go PR1187
normal auf `c97fbbd0e9a894e4072252be3863bffa29c625e8` gemergt; Parents32311c78/2cdd5eef,
Dateibaum996f86e61c5ba06eba731e85cf21b31d2c8d9ad5 exakt gleich zum freigegebenen Kopf.
CI43531055622 beide Pflichtchecks gruen:9neueFachgruppen,6neueProfilgruppen,
7neueBrowserchecks Desktop/Mobil und geaenderte Syntax; alte Tests/DB/Masse aus.
Vercel `dpl_J1tPgsHubG4GnVBDYesaK843w3kk` regulaer Git/Production/fra1 READY,
Hauptalias und Runtimec97fbbd0, anonym401, Kommunikationssperre bestaetigt.
Vor Merge keine neueren laufenden Prozesse/aktiven Jobleases. Keine Migration,
zusätzlichen Profile, Budget-/Cron-/Env-Aenderungen oder neue Quellenarbeit.

Bestehender Einprofilauftrag: genau einmal Lagecron00:06:40UTC, danach Paketlauf
00:07:11UTC, beide200. Bestaetigter Entwurf/Review wiederverwendet; Teilstand
00:06:49.308UTC gespeichert, Originalindex1 positiv/Originalindex0 weiter abgelehnt,
Hash `da90e6e1903965a2083b36090ec825f913b1c6a1f3067609e8ca800b00b7ec1a`.
Paket14.11. um00:07:20.357UTC gespeichert/verifiziert:57Eintraege/8Karten/1Absatz,
Hash `63694c776dbe475d4271cf4b2ea5c5509b74077b677f782805afd1c0b5c0873d`.
Quittung gebunden und ausgehende Kanaele gesperrt. Rein lokaler neuer Gegencheck
00:09:44UTC mit exakt diesen privaten Production-Snapshots und dem normalen Leser:
availabletrue, gueltiger Teilstand, Profil-/Policy-/Quellenschutz passend,
59Manifestvorgaenge/59Abhaengigkeiten, keine Bindungsluecken, keine privaten Reviews
im DTO, Snapshots unveraendert. Keine authentifizierte Production-Browserabnahme.
Null neue Modellaufrufe; Tagesbindung14.11.UTC0USD, gesamt unveraendert2,723477USD,
acht alte offene Reserven erhalten. Ehrlich teilweise: Quellen offen/kein Tagesanlass/
lage-teilstand, Radar eine Dynamik08.11. weiterhinstale. Kein Vollversorgungs-PASS.
Naechster Schritt: regulaeren Quellen-/Morgenlauf und den gespeicherten Stand pruefen.

**Weiterer echter Lieferblocker,22:52–22:56 UTC:**
**Inzwischen ausgerollt und wirklich beansprucht:** PR1186 nach konkreter Freigabe
normal auf32311c78fb17843631f6851ec7103b5f9759ff68 gemergt, Parentscc283e0b/97901263,
Dateibaum identisch zum geprueften Kopf. CI43526156655 beide Pflichtchecks gruen:
neun neue Workergruppen/sechs neue Profilgruppen und geaenderte Syntax, keine
alten Tests. Regulaeres Deploymentdpl_8gAYArheEw81mYsUP1WoQSJg9M8q READY,
Hauptalias/Runtime32311c78, anonym401, Kommunikationssperre bestaetigt.
Live-Adminlauf23:34:59UTC auf32311c78: Projektion23:35:03.4356 und Materialisierung
23:35:14.5211 erstmals je1Versuch erledigt. Aktuelle Quellenarbeit bleibt offen;
erfolgreicher Claim/Abschluss beweist keine Vollversorgung oder Textqualitaet.
Laufende Kontrolle danach: derselbe Quellenlauf endete23:38:45UTC teilweise,
161Ziel/18erledigt/1endgueltig fehlgeschlagen/136zurueckgestellt. Sieben neue
Modellaufrufe0,040726USD; Tagesbindung13.11.UTC0,502477USD, gesamt2,723477USD,
acht alte offene Reserven unveraendert. Das Paket14.11. wurde23:35:36.032UTC
erneut gespeichert:58Eintraege/8Karten, weiterhin kein gepruefter Lagetext und
dieselben vier offenen Fehlerklassen. Keine Vollversorgung behauptet.

**Separater Qualitaetsbefund und enger Gegenfall:** originales bestaetigtes
Review14.11. lehnt Absatz0 ausschliesslich mit profilbezug=false ab; andere Flags
sowie Absatz1 und Paarvergleich positiv. Kein Mapping-/Parserfehler. Mit echtem
KO-Lektuere-/Abschnittsbeleg besteht wortgleicher Absatz1 plus zugehoeriges
positives Einzelurteil (nur Index1→0) denselben strikten Q.pruefe-/Sachdetailscheck,
Originalphasen-/Profilhashes gueltig und unveraendert. Kein Modell/DBwrite.
Normaler Speichervertrag verlangt2–4Absaetze; diese Grenze wird nicht abgesenkt.
Eigener hashgebundener, insert-only Teilstand im bestehenden Speicher in Arbeit:
negative Urteile erhalten, alle Bindungen und positive Paar-/Einzelpruefung Pflicht,
keine anderen Fehlerausnahmen, Paket bleibt teilweise, App zeigt klaren Hinweis.
Private Originalentwuerfe/Reviews duerfen nicht in App-DTOs gelangen.

**Enger Ausgabevertrag in PR1187 (noch nicht ausgerollt):** Ausschliesslich ein
bestaetigter Zweiabsatzentwurf mit genau einem negativen Profilurteil und einem
vollstaendig positiven Einzelurteil kommt infrage. Alle anderen Einzelkriterien,
Schema-/Index-/Quellen-/Sachdetailsbindungen und der Originalpaarvergleich muessen
bestehen. Kein negatives Urteil wird umgeschrieben; der ausgewaehlte Absatz bleibt
wortgleich und durchlaeuft die bestehenden Fachpruefungen erneut. Normale Lagen
behalten ihren2–4Absatzvertrag. Drei-/Vierabsatzfaelle bleiben in diesem Fix gesperrt.
Ein eigener insert-only Slot `lage-teilstand` in `briefings` bindet Originalphasen,
Mandant, aktuelles Profil, Quellen-/KO-Eingabe, Berliner Tag und Ausgabehash.
Unklarer Schreibausgang wird nur nachgelesen; bestaetigte Originale bleiben erhalten.
Der normale Appstart liest das gespeicherte Paket, erzeugt keine neue Modellausgabe
und kennzeichnet den Teilstand. Volltexte haben Vorrang; ein Teilstand gilt niemals
als vollstaendige Versorgung oder Faktenpruefung. Private Herkunftsbelege bleiben
serverseitig. Live-Schema bestaetigt nurPK(id), keinen Slot-CHECK: keine Migration.
Root und unabhaengiger Fachagent haben die sechs Produktdateien sowie die neue
Fachregression und den erweiterten vorhandenen Browserharness ohne offenen
Codeblocker geprueft. Zuvor gefundene Kartenleck-/Vollcache-Rennfaelle sind im
eingefrorenen Stand behoben. Vorgesehene neue Abnahme: neun Fachgruppen,
sechs CI-Profilgruppen, geaenderte Syntax und drei Browserchecks je Desktop/Mobil
plus Schutzguard. Ergebnisse noch offen; historische Gruppen werden nicht wiederholt.

Der zweite Adminlauf endete22:59:38 UTC:151Ziel,16erledigt,6Fehler,
121zurueckgestellt,8wiederholt. Bisherige Grenzen unveraendert.
Nach Berliner Mitternacht auf weiterem ausdruecklichen Testauftrag genau einmal
Lagecron und Morgenpaket fuer14.11. ausgefuehrt. Lage nicht auslieferbar:
bestaetigte Qualitaetsantwort `profilbezug-fehlt` bei Absatz0. Kein Urteil gelockert.
Paket14.11. um23:08:08.792 UTC gespeichert/verifiziert,58Eintraege/8Karten,
ohne bestaetigten Lagetext; offen/kein Tagesanlass/fehlender Lagequellenbeleg.
Kein heutiger vollstaendiger Briefingnachweis. Beide neuen Modellphasen abgerechnet,
0,014532USD, Tagesbindung danach0,461751USD. Keine weitere Modellwiederholung.
Die bestaetigten Entwurfs-/Pruefantworten bleiben unveraendert; separater
rein lesender Qualitaetscheck laeuft. Quellen13.11. und Berliner Pakettag14.11.
sind ausdruecklich verschieden; kein Umstempeln des13.11.-Pakets.

Heutige Abrufe145 und Understanding74 warten. Projektion seit04:15 und
Paketbau seit04:30 ebenfalls faellig, aber attempts0/wiedervorlagen0.
Vier von acht Tagesfenstern waren verbraucht,1200/2400Sekunden, also kein
ausgeschoepftes Arbeitskontingent. Weiterer Betreiberlauf22:55:52 UTC gestartet.
Die aktuelle SQL vergibt strikt nach priority,due_at,created_at,id:
Understanding80/Quellen100 verdrängen Projektion200/Paket250 im endlichen
seriellen Workerfenster. Moderne Projektion wartet fachlich ausdruecklich nicht
mehr auf saemtliche Quellen; die Claimreihenfolge verhindert dennoch ihren Start.
Drei schmale Live-GETs bestaetigen die Prioritaeten und den nie erfolgten Claim.

Isolierter Folgefix in Vorbereitung: kurze sequentielle Mandats-Teilphase ueber
vorhandene typedClaims im selben reservierten Quellenfenster, maximal45Sekunden
und20Prozent des vorhandenen Workerbudgets. Mindestens80Prozent bleiben fuer
Quellen reserviert; anschliessend nur tatsaechlicher Zeitrest. Gleicher verteilten
worker-drain-Slot,parallel1/stapel1, gleiche Handler-/Planrest-/Kostenwaechter,
ein Blobspiegelwrite, addierte Bilanz. Keine Migration, neuen Dienste, Cron- oder
Budgeterhoehung. Dies erzeugt keinen kuenstlichen Vollversorgungsstatus.

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
