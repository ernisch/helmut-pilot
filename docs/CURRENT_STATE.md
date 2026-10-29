# CURRENT STATE — Helmut

## W15: Diagnoseverlust synthetisch repariert; echte Ausführung gesperrt

Letzter Originallauf [40958135662](https://github.com/ernisch/helmut-pilot/actions/runs/40958135662)
auf225e76d7 bleibt FAIL `worker`: innere Phase, RAM, Restore-/Backupfortschritt
und Bereinigungsstatus UNKNOWN. Keine Übernahme älterer Laufwerte.
Der Fixzweig `codex/w15-restore-diagnostics-20261030` erhält bekannte Workerphasen
vor späteren Überwachungs-, IPC-, Signal- und Bereinigungsfehlern. Vier zentrale
Regressionen plus sechs zusätzliche Fehlergruppen am alten Code nachgestellt;
27 neue synthetische Diagnoseprüfungen und betroffene Anschlusssuiten PASS.
Zwei unabhängige Quellreviews PASS; Pflicht-CI am tatsächlichen neuen PR-Kopf
weiterhin erforderlich, aktueller externer Status im zugehörigen Draft-PR.
Kein weiterer Originallauf. Kein historischer Restore-/RAM-/Stillstands-PASS.
[Diagnoseabnahme und Grenzen](betrieb/w15-restore-diagnostics-20261030.md),
[SAFE-Belege](betrieb/belege/w15-restore-diagnostics-20261030/CODE_REVIEW.SAFE.json).
Mock-Anschlüsse verwenden dieselbe reparierte Fehlerkette; Dateiblocker bleibt
BLOCKED. Beide RAM-Verträge, bestehende Freigabegrenzen und Schutzregeln bleiben.
Weitere echte Ausführung erfordert konkrete Diagnosebegründung und neues GO;
kein vollständiger Restore auf Verdacht. End500/Mock500 bleiben gesperrt.

## W15 Fortschreibung: primärer Restore durchlaufen, Backup noch FAIL

Neues exaktes Betreiber-GO aufc89d423f wurde genau einmal genutzt: Run40931663329
FAIL`connection-backup`,47864Zeichen verschlüsselter Dispatch. Primäre fünf
Native-Schritte und500/0 nur durch verifizierten Codefluss belegt; keine
unabhängige Gesamt-Restore-/Backup-/RAM-Abnahme, keine finalisierten Artefakte.
Kein Retry/End500/Mock500. Alte7e3d96e9/b6/c89d und ihre FAIL-Belege erhalten.

Gezielte anschließende Entwicklung: acht feste Backup-Unterphasen, geschlossen
numerische Diagnose ausschließlich aus bestehendem RAM-Cache ohne Neumessung,
Erhalt einer Callbackphase über Legacy-SystemExit. Kein tatsächlicher Backupbug
als repariert behauptet; historische UrsacheUNKNOWN. Neue fiktive Tests und
unabhängige Reviews PASS. Unverändertes echtes Snapshot-SQL wird im vorhandenen
synthetischen CI-PostgreSQL mit kleinen500/0Fixturezeilen geprüft; native CI
noch erforderlich. Kein Original-/500er-Controller-/Modelllauf durch den Test.
Der folgende Diagnosekopf ecae6400 wird unverändert für einen später separat
freizugebenden Restore-/End500-Lauf eingefroren; Mock-Folgeadapter erlaubt ihn
nur mit späterer positiver End500-Abnahme/Bridge/Mock-GO. Nächster echter
Datenlauf erfordert neue konkrete Freigabe und aktuelle CI.
Mock-Dateiblocker und bestehende Zeit-/RAM-Verträge bleiben unverändert.


## W15: Restore-Einzelversuch FAIL; Mock500 integriert, Ausführung gesperrt

PR975-Branch wurde ohne Force-Push auf den geprüften gemeinsamen Integrationsstand
c89d423fd8431b42a5351de82e640f40e8517ee4 vorgerückt;7e3d96e9/b6eb7449 als
unveränderte Vorfahren erhalten, Schutzregeln unverändert. GitHub markierte
den vorbereitenden Draft976 dadurch automatisch als gemergt in diesen
Entwicklungsbranch; kein Merge nachmain/Deployment/Production. Der getrennte
Mock-Baselineadapter läuft als Draft977 auf direktem Nachfolgerc4d035dd.
Bisherige b6-Pflicht-CI40909894080/40915289161 bestanden. Nach explizitem Betreiber-GO
wurde genau ein Restore gestartet:40920225333 FAIL, Phase`connection-restore`.
Erster Versuch40905370350 auf7e3d96e9 bleibt FAIL. Kein Retry, keine positive
Restoreabnahme, kein End500/Mock500. TCP-Readinessrace in primärem und zweitem
Restore korrigiert, feste Fehlerunterphasen/gezielte fiktive Tests und unabhängiger
Review bestanden; genaue historische Ursache weiterUNKNOWN. Ein nächster echter
Restore aufc89d423f braucht grüne aktuelle CI und neues exaktesGO.
Erfolgreicher Empfang aller zwölf Originaldateien
40876458074 bleibt übernommen; seine Qualifikation wurde nicht wiederholt.

Mock500-Anschlüsse auf getrenntem Integrationszweig vorbereitet: Atomic12ACK,
Tages-/Namespacebindung, bestehende500/500-Quellenprüfung, vollständiger Controller
und Auswertung, eigene gemeinsame RAM-v2-Messung, vollständiger Plattenplan,
verschlüsselte Sicherung/Remote-Readback/zweite Rücksicherung und Einmalstartwächter.
Standardmäßig gesperrt; gezielte fiktive Verbindungstests sind keine500er-Abnahme.
Synthetischer neuer v2-Runner40922859278 aufc89d423f unabhängigPASS:
Peak302014464Bytes/Swap0,UID1000,gleicherParentnachKindernleer,keineOriginale/DB.
Pflicht-CI40922851354/40923999187 aufc89d423f und40924138247 auf
c4d035dd bestanden; aktuellste Dokumentationskopfchecks sieheDraft977. Historischer RAM-v2-Fehler bleibt FAIL.

Dateiinventur lokalBLOCKED wird nicht wiederholt. GitHub-/Drive-Belege bestätigen
das bestehende269598Byte-Builder-ZIP samt historischem SHA; keine Payloads geladen.
Zehn weitere Originale weiter nicht erreichbar bestätigt; zehn der elf Zusatzpins
bekannt(217550485Bytes), nur aktueller Replacements-Pin unbekannt. Keine neue
Qualifikation/Übertragung freigegeben. Zwölf vorhandene End500-Originale ersetzen
nicht diese elf Zusatzdateien. Kein Beweis globalen Datenverlusts. Auch364084Einträge des
vorhandenen komprimierten SAFE-Metainventars27.10. liefern keinen Zusatzbeleg:
nur Statfelder, keine Inhaltshashes,0exakte Namens-/Pin-Treffer; keine neue
Inventur/Original-/Cipherdateien gelesen.
[Mock-Vertrag, Nachweise, fehlende Dateien und getrennte Freigaben](betrieb/w15-mock500-github-start-20261029.md).

## Vollständiges Root-Paket und Caller-Vorbereitung (13.10.2026)

Branch `codex/starttor-full-packet-optin-20261013` auf ungemergtem PR907: Die vollständige500er-Fixture hat1.529.110Paketbytes und überschritt den1-MiB-Transportdeckel. Nur der exakte v3-Paketversionsheader wählt jetzt2MiB; Versionsabweichung/Übergröße schließen vor Originaldaten. Default1MiB, Original4MiB, Gesamt8MiB, vierGETs,20s/8KiB sowie alle Fach-/Betriebstore bleiben erhalten. SQL weiterhin inert mit sechs NULLs/noGrant. Lokal5 physische Transport-/Verbrauchergruppen,8 echte netzlose PG17.6-,11 Verbraucher-,16 vorhandene Transport- und38 Auswahlprüfungen bestanden. Der neue physische Fall ergänzt die bisherigen Komponentenbelege; keine echte Runtime- oder500er-Abnahme. [Dossier](betrieb/starttor-full-packet-optin-20261013.md).

Aktueller offizieller Cloud-Beleg73/73, sieben konfigurierte Secrets/fünf Variablen ready, Netzwerk enforced; CRON_SECRET fehlt. Neue reine Rollenmetadaten bestätigen Authenticator8s und keinen Service-Role-Override; nominal passender dokumentierter REST-Default, keine globale Änderung empfohlen. Tatsächlicher Caller-/Cache-/vorStatement-Beleg bleibt offen. Source-/Metadatenabnahme und neue Head-CI noch erforderlich. Keine neue Operator-Anfrage, Installation, Staging, Merge, Aktivierung oder bezahlter500er-Lauf.

## Erhaltener freigegebener Abschluss

UTC13-Tagesbuch einmal angelegt:35 Bücher/Kapazität35, EU-Limit82,036000USD, damalige Kosten/Baseline/Zähler0. Historische34 Bücher/5000Usage und übrige Bestände erhalten;46 unabhängige tatsächliche Delta-Prüfungen PASS. Auftragsbindung7,445364USD inklusive0,636000USD privater Reserve; runDayUTC null, kein500er-Funding. [Voriger Umfang](betrieb/starttor-native-reader-source-20261013.md).

[Draft-PR907](https://github.com/ernisch/helmut-pilot/pull/907), Headc0d0bd48, unabhängig akzeptiert; Pflicht-CI38334575016 mit175+330Suiten, nativen Schritten undZ22 grün. [PR906](https://github.com/ernisch/helmut-pilot/pull/906), Head2b6fbfe7, ebenfalls unabhängig geprüft/Pflicht-CI38317468800 grün. Beide ungemergt. Statischer tatsächlicher Composite-Dictionary und unverändertes unfreigegebenes Kandidatenfenster erhalten; finaler Commandhash/Fit erst mit echten frischen Laufbelegen. Kein neuer Initializer-Aufruf oder neue Finanzierung.

Historische Deployment- und Read-only-Beobachtungen vom12.10. sind [wortgleich archiviert](archive/project_state/2026_10_28_historischer_Deployment_und_RO_Beleg_20261012.md); sie sind keine aktuellen Production-Belege.

## Kalenderfix im Entwicklungsbranch (12.10.2026, noch nicht Production)

Branch `codex/synthetik500-date-handoff-20261012`, Ausgangsstand PR901. Die neue strukturelle Datumsbindung trennt den unveränderten B2-Aufnahmetag vom tatsächlichen EU-Ausführungsfenster. Originaldatum, Merkle-/Body-/Profil-/Quellenhashes und Originalprüfung bleiben erhalten. Nur der vorhandene geschlossene EU-Vertrag erlaubt diesen Übergang; 9h, Preis-/Auftragsfenster und gleicher UTC-/Berliner Lauftag bleiben zwingend. Opaque Sender-Token und reale Motorwachen prüfen das tatsächliche Fenster. D und R kennzeichnen auch gewöhnliche Quellen aus der Aufnahme als historischen Hintergrund, ohne ausgewählte Belege zu entfernen; eine Überschreitung der bestehenden 16.000-Zeichen-Grenze stoppt. Schreibzeit, Cache und Entwurfs-/Prüfbelege verwenden den tatsächlichen Ausführungstag. Kein künstliches heutiges Quelldatum und kein neues Fachurteil.

Lokal über `scripts/lokal.js` bestanden: 39 Datumsfälle in9 Gruppen,4 fiktive Integrationsgruppen und21 bestehende Quellenbelegprüfungen; weitere begrenzte Vertrags-/Adapterprüfungen im [Draft-PR902](https://github.com/ernisch/helmut-pilot/pull/902). Unabhängige DeepSeek-Pro-High-/Flash-High-Codeprüfungen im jeweiligen Scope positiv. Pflicht-CI auf Codekopf `556ba54d97a067ad08e29ad74957cb0ec1707e7f`: [Run38218238617](https://github.com/ernisch/helmut-pilot/actions/runs/38218238617),171/171 Standard- und330/330 Bereichssuiten sowie erforderliche isolierte DB-Prüfungen bestanden. Spätere reine Statuskorrekturen sind keine Änderung dieses Codebefunds; Pflichtchecks auf dem finalen PR-Kopf müssen vor Merge grün sein. Keine Production-Funktion daraus behauptet. Auf Production bleibt der Tageskonflikt von `8ca835ce` bis zum separat erlaubten Merge/Rollout wirksam.

**Originale jetzt übernommen (12.10., privat außerhalbGit,0600):** `sender-final500-budget-transfer.json`,499.220Bytes,SHA256 `e7d062ddd3c528a25437e9fe28300ae6c2588ff5a9e191e4448c998a71902b02`; `actual-500-transport-receipt.json`,403.939Bytes,SHA256 `14db98343ace3113e30677bab22e21fc468122c481ced2ba1c5e932ef8ddfb83`; `actual-500-result-export.dictionary.json`,2.804.748Bytes,SHA256 `66c828bf113672c94539367bbfeef5aa763e3cf8c1387894fe13a8bc5f65e26b`. Bestehender Decoder bestätigt ursprünglichen UTF8-SHA256 `97c465b8437cc7dde7c975052728cee03e5133c4009c141cfe091ebcd0d7db86`. Alle500 ursprünglichen Draft-Eingaben, Mitgliedschaftsbelege und eingebetteten nativen Quellen verfügbar; keine fehlenden separaten Dateien aus eingebetteten Daten ableiten.

**Neue Datums-/Kontextvorbereitung, keine erneute Fachabnahme:** Alle500 Originaleingaben im neuen Kalenderpfad vorbereitet,0Fehler, maximal15317 von16000 Kontextzeichen; alle ausgewählten Quellen erhalten. Originalkontexthashes stimmen mit dem übernommenen Transfer überein. Rein lesend erhobene Publikationspolicy und972 Publikationsidentitäten stimmen mit den ursprünglichen kanonischen Hashes überein. Alle1500 Sollpositionen und12000 Kriterienpositionen an diese Originaleingaben gebunden;0neue Qualitätsurteile. Struktureller Kandidat12.10.,12:00–21:00UTC (15:00–00:00Istanbul), ausdrücklich kein Testfenster-GO und keine finale Operation-/Command-/Deploymentbindung.

**Runtime-Nachweispaket übernommen:** [B3-Paket](https://drive.google.com/file/d/1coyokq5wUCURFa3NYM7rCsXIxkjiRoLG/view),14.961Bytes,SHA256 `25de6c1c5b84932aec7d6ec39bf1c87861a5fb45fb38c7f95d87b47bb15f606c`. Beobachtung12.10.,08:42:08.296–08:42:10.365UTC /11:42Istanbul; unabhängige Offlineprüfung52/52 übernommen, nicht wiederholt. Zwei Runtime-GETs und zwei Deployment-/Alias-GETs HTTP200,20 Vertragsprüfungen positiv: Production8ca835ce/READY,EU-Route `gpt-5-mini-eu`,34Kostenbücher,runDayUTC null,used0,0offene Reservierungen,Tagesbindung0,636000USD/Auftragsbindung7,445364USD,startklartrue. Keine Anbieterrechnung, Modellqualität oder500er-Test bewiesen. Für diese Übernahme ist keine Bearerübertragung nötig.

**Frische Prüfung bleibt erforderlich:** Der Runtime-Bearer liegt hier weiterhin nicht vor; der bestehende sichere Quellzugang hat die übergebenen GETs erbracht. Frische Startbelege können darüber geliefert oder über separat sicheren begrenzten Zugang gelesen werden, niemals Secrets im Chat/Git/Drive. Nach dem erlaubten Rollout sind sie an das neue Deployment zu binden und innerhalb60Sekunden vor Start zu erheben. Die bestehende EU-Leseautorität endet **13.10.2026,00:00UTC /03:00Istanbul**; Erneuerung nur falls später benötigt und ausdrücklich erlaubt. Keine Schutzumgehung oder automatische Secret-Einrichtung. **Noch keine vollständige Startbereitschaft und kein empfohlenes Test-GO.**

## Blocker-Kurzstand

- **Blocker 3 (EU-Servicekostenvertrag) geschlossen, PR901 gemergt:** laut Übergabe und Rollout/Git bestätigt. Gültiger Vertrag: exakt 82,036000 USD/UTC-Tag; 88,845364 USD kumulativ desselben Auftrags; 0,081400 USD Reserve nur für künftige EU-Tickets; 81,400000 USD absolutes Sicherheitsmaximum für genau 500 D + 500 R/U0. Modellbereitstellung `gpt-5-mini-eu`, DataZoneStandard, Sweden Central, 9 h aktiv + 30 min Endbeleg. Der EU-GO vom 11.10. und die damaligen Teilschritte (Umsetzung lokal, Rollout bis Abnahme gesperrt, gemeinsamer Hash, lokal 6 EU / 26 Geld / 64 End / 12 Runtime / Routen) bleiben **historisch** und sind nicht der aktuelle Vertragsstand. Die früheren 6-/7-USD-Grenzen sind **nicht** der aktuelle EU-Vertrag. [Vertrag/Prüfung](betrieb/blocker3-eu-servicekostenvertrag-umsetzung-20261011.md).
- **Blocker 2 (geschlossen, Abschluss 11.10.2026):** [Run 38102593796](https://github.com/ernisch/helmut-pilot/actions/runs/38102593796), Workflow/Runtime `6cdaa1cd3cdf16b9e5d18cb9add267583a730292`: 500/500 fachlich angenommen, alle 180397 aktuellen Claimpositionen und 4000 individuellen Kriterienurteile positiv, alle 42 Pflichtbindungen erhalten; frische unabhängige Endprüfung und Root-Abnahme positiv; verschlüsselte Serverbank vollständig frisch rückgelesen/verifiziert (2026-10-11T04:18:30.484466+00:00). KZW-Original erhalten und gesperrt, alte Relation UNKNOWN archiviert, eigene NWZ-Alternative gebunden. Kein Aktivierungs- oder bezahlter 500er-Funktionstestnachweis. [Vollbelege und Grenzen](betrieb/blocker2-abschluss-20261011.md). Zahlen sind der übergebene Abschluss, keine neue DB-Messung dieser Sitzung.
- **Blocker 4 (geschlossen, Endsteuerung abgenommen 07.10., 11:19:02 UTC):** Persistenter 30s-Cron lebt; Authentifizierung, Frist und Notstopp produktiv mit 0→0, Rückführung 500/499→0 nur isoliert belegt. Profil-/Auth-/Hauptdaten unverändert; Pro High akzeptiert. Ersetzt historische Hinweise „lebender Wächter offen“. Konkretes Testfenster vorbereitet, ungebunden. Keine Aktivierung/500er-Test. [Dossier](betrieb/blocker4-endsteuerung-20261007.md).
- **Blocker 1 (geschlossen; technisch abgenommen 07.10.):** PR846 gemergt und ausgerollt; unabhängige Prüfung und Pflicht-CI grün. Authentifizierter GET auf das gebundene READY-Deployment `53e1e369` ergab HTTP405/`Allow: POST` vor Datenbank- und Motorzugriff; direkter Motorweg für exakt 500 synthetische Profile technisch abgenommen, kein 500er-Test, keine Aktivierung oder Modellaufrufe. **Der frühere Satz „Quellen-, Kosten- und Test-GO-Tore bleiben offen“ beschreibt den alten Stand vom 07.10.**; aktuell bleiben für einen Lauf eine frische Laufbindung und ein Test-GO erforderlich. [Abnahme](betrieb/blocker1-direkter-500er-motor-20261007.md).
- **Begrenzter B2→D-Integrationssprint (11.10., abgeschlossen laut Übergabe):** Gemeinsame Ursache der 32 leeren Kontexte belegt (vorhandene Quellen außerhalb der 14 Tage). Übergabevertrag als PR899 gemergt, Runtime `1ad00cd4` auf Production READY `dpl_76HSdbWhPMaDRJzQqQ1GsrGx3wcE`; Pflicht-CI 168+330 Suiten grün, identischer Git-Tree; lokal exakt 500/500 gültige, nichtleere Kontexte am tatsächlichen Sendercode (468 normal, 32 historisch); verlustfreier 500er Drafttransport und feste Original-/Merklebindung belegt. Keine neue B2-Fachabnahme, Installation, Aktivierung, Productiondaten-/Konfigurations-/Budgetänderung oder Modellaufrufe. Der vollständige Production-Senderabnahmeweg bleibt an der Command-/Installations-/Aktivierungsgrenze offen. [Vertrag und Abnahmegrenze](betrieb/blocker2-d-integration-historische-uebergabe-20261011.md).
- **Blocker-2-Vorlauf (historisch, 10./11.10.):** Data13, 499er-Fachabnahme, Brake-Ereignisvergleich, leere Publikationsauswahl und Freigabegrenze: [Data13-Dossier](betrieb/blocker2-data13-und-aktuelle-500er-fachabnahme-20261010.md), [Stern-/499er-Dossier](betrieb/blocker2-stern-originalminimum-und-499er-fachabnahme-20261010.md), [Publikationsauswahl](betrieb/blocker2-publikationsauswahl-und-freigabegrenze-20261011.md). Originale, alte Eingaben und Einzelurteile bleiben erhalten.
- **Blocker-2-Historie vor V8 (historisch):** [wortgleich archiviert](archive/project_state/2026_10_10_CURRENT_STATE_vor_blocker2_v8_ausfuehrung.md); von Run 38036221630 getrennt.
- **Betreiberentscheidung Native-D (07.10., historisch):** zurückgestellt bis Helmut funktional fertig UND 500er-Nachweis erfolgreich; aktuell keine Voraussetzung für Production, Motor oder 500er-Test. Ersetzt alte Starttorhinweise. [Wortlaut](archive/project_state/2026_10_07_CURRENT_STATE_vor_blocker1_komprimierung.md).
- **Native-D-Diagnose (07.10., historisch, zurückgestellt):** 500 synthetisch/0 aktiv (330/120/50), Journal 58; nicht installiert. Pooler 5432 am TCP-Proxy abgewiesen; HTTPS RO. [Zugang](betrieb/pre500-native-zugangswege-20261007.md).
- **Guard-Capture behoben (07.10., 06:10 UTC; historisch):** V3-Guard, 52 Relationen / 372067 Zeilen, Native-D nicht installiert, mehrere Installations-/Schutzpunkte offen. [Belege und nächster Schritt](betrieb/pre500-guard-capture-20261007.md).
- **U-Vorbereitung (06.10., historisch):** [Originale/Rückweg](betrieb/gebundene-u-vorbereitung-cron-ruhe-20261006.md), [Kostenplan](betrieb/blocker3-kosten-zeitplan-20261007.md).
- **W-Zusatzquellen (06.10., Codeentwurf, historisch):** Runtime-DTO, Quellvollständigkeit und Zulassungstore erhalten; vollständige Native-W-/Caller-/Root-Abnahme und 500er-Start offen.
- **Native Katalogbindung (06.10.; historisch):** genau ein freigegebener RO-Abruf, semantische Gleichheit zum privaten Original, fünf physische Wartungsfelder ausgenommen; keine Installation, 0 Daten-/Schemaänderungen.
- **Supabase-Plattformgrenze und Audit-Diagnose (05.10.; historisch):** [Umfang und Beleggrenzen](betrieb/supabase-plattformgrenze-audit-20261005.md).
- **500 Synthetikprofile inaktiv importiert (05.10.; historisch):** 501 Identitäten / 500 Mandate / 0 aktiv; [Beleggrenzen](betrieb/synthetik-500-inaktiver-import-20261005.md).
- **Historische inerte Synthetikruntime (01.10.):** [Erhaltener Vollstand](archive/project_state/2026_10_06_CURRENT_STATE_inerte_runtime.md).
- **Prozessaltlasttor erledigt (historisch):** drei alte `process_runs` nativ auf failed/operatorcleanupabandoned; Rückweg vor Anwendung neu binden. [Details](betrieb/synthetischer-500er-auftrag-20261001.md).
- **Kostentage (05.10., historisch):** zwei Nullbücher; vollständige Statuszeile im [Kostenplan](betrieb/blocker3-kosten-zeitplan-20261007.md).
- **Synthetikpaket und 20s-Transport (PR #762, historisch):** [Generator](../lib/helmut/synthetik-500-profile.js); kein 500er-Nachweis.
- **Synthetikbrücken (PR #763, historisch):** Import 43/43, Runtime 11/11 offline + 11/11 PostgreSQL, Realregression 36/36, Nachweis 64/64 grün; kleine SQL-Fixtures beweisen keine Vollbestandsperformance.
- **Historischer V7-/Decoderstand (02.10.):** [Unveränderte Einzelbefunde](archive/project_state/2026_10_05_CURRENT_STATE_historische_transporte.md).
- **Historische Betreibersteuerung (01.10.2026):** [Synthetikauftrag](betrieb/synthetischer-500er-auftrag-20261001.md) — Verteilung 330/120/50, keine Realpersonen umbenennen; der alte Azure-`GlobalStandard`-Befund ist überholt (aktuell `gpt-5-mini-eu`, DataZoneStandard).
- **Historischer Production-Befund (01.10.):** [Einzelbefunde](archive/project_state/2026_10_05_CURRENT_STATE_historische_transporte.md).
- **Merge-/CI-Stand (02.10., historisch):** [PR #769](https://github.com/ernisch/helmut-pilot/pull/769), Merge `484a74ee`; datierter Befund, keine 500er-Freigabe.
- **Begrenzte Cutover-Korrektur (01.10.2026, historisch):** Code-/Offline-Absicherung, kein ausgeführter Production-Cutover.
- **Historische Deployments:** PR #725/#724/#722/#723/#699 (28.–30.09.); kein Beleg für die synthetische Zielkohorte.
- **Wiederaufnahme 04.10.2026 (historisch, rein lesend):** [Belegzusammenfassung](betrieb/source23-closed-tuples-20261004.md).
- **Vorbereitung 06.10.2026 (historisch):** `noPaidModel:true` nach PR #828; keine Wiederholung des Pakets.
- **Aktuelle Berliner Artikel (06.10., lokal, historisch):** sechs amtliche Artikel im kanonischen Offline-Weg; kein Quellenimport oder 500er-Nachweis.
- **Historische Import-/Realkohortenvorbereitung (29./30.09.):** [unverändert archiviert](archive/project_state/2026_10_06_CURRENT_STATE_vor_pr829_komprimierung.md).
- **Zulassung:** AfD-zugehörige Abgeordnete ausgeschlossen; Partei und Fraktion vor jedem Import amtlich prüfen. [Testvertrag](betrieb/bundestag-landtage-testvertrag-20260927.md), [Zulassungscode](../lib/helmut/profil-zulassung.js).
- **Landesversorgung:** Berlin-/Brandenburg-Pfade offline geprüft. [PARDOK-Vertrag](quellenarchitektur/17-pardok-parser.md), [Brandenburg](betrieb/landesversorgung-brandenburg-20260928.md), [Berlin](betrieb/landesversorgung-berlin-20260928.md), [Quellenzeile](betrieb/berlin-senat-quellenzeile-vorbereitung-20260928.md).
- **Berlin/Brandenburg-Teilnachweis (30.09.2026, historisch):** nur Teilnachweis, kein 500er-Test.
- **Radar-Ursprungsbindung (29.09.2026, historisch):** fünf Suiten lokal grün; kein produktiver Funktionsnachweis.
- **Historische Nachrichtenqualität / lokale Bereichsabnahme:** [archiviert](archive/project_state/2026_10_10_CURRENT_STATE_vor_blocker2_v8_ausfuehrung.md).

## Starttor und Schutzgrenzen

**Realkohorten-Endweg (historisch, 01.10.):** [Vollständige Vorarbeit](archive/project_state/2026_10_07_realkohorten_endweg_historisch.md). Aktueller Wächter siehe Blocker 4.

**Runtime (01.10.2026, inert installiert, historisch):** End-RPCs vorhanden, Endwächter vorbereitet; Manifest, Nullbestandsbelege, lebender Wächter und Aktivierungs-GO bleiben Pflicht. Bei unbekanntem Schreibausgang: Stop, lesende Klärung, kein Retry. [CLI-/Journalzuordnung](betrieb/synthetischer-500er-auftrag-20261001.md).

Aktueller technischer 500er-Nachweis: **synthetische Profile für Bundestag, Berlin und Brandenburg**; die weiteren 14 Landesparlamente folgen danach. Alle 500 fiktiven Profile brauchen vorab festgelegte Szenarioparameter, die richtige Mandatsebene und Erwartungen; keine amtlichen Personenbelege für fiktive Profile erfinden. [Synthetikauftrag](betrieb/synthetischer-500er-auftrag-20261001.md), [Roadmap](ROADMAP_BIS_500.md).

Vor Aktivierung müssen Paketbindung, aktuelle Ebenen-/Landesversorgung bis in die sichtbare Ausgabe, Kosten-/Zeitplan, Testfenster und Endwächter belegt sein. **Aktivierung und eigentlicher 500er-Test brauchen danach ein gesondertes Betreiber-GO; kein Test ist freigegeben oder durchgeführt.** Der Test bilanziert bei exakt 500 gleichzeitig aktiven Profilen 1500 Positionen (500 Mandatsbriefings, 500 Morgenbriefings, 500 Lage-Ergebnisse), weist fehlende, leere, doppelte, unbrauchbare und technisch fehlerhafte Positionen getrennt aus und belegt Qualität, Gesamtzeit, Gesamtkosten, automatisches Ende und Rückweg auf 0 aktive Profile. Frühere kleinere oder unvollständige Läufe ersetzen das nicht. [Sicherheitsrahmen](betrieb/500-funktionstest-sicherheitsrahmen-2026-09-01.md), [Betriebsplan](betrieb/500-betriebsplan-2026-09-20.md).

Für die aktuelle Vorbereitung erlaubt der Betreiber gezielte Entwicklung, lokale Tests, eigenen Branch, Commit, Push und PR. **Merge und Production-Änderungen sind ausdrücklich nicht freigegeben.** Migrationen, Production-Daten-/Profil-/Konfigurations-/Budgetänderungen und bezahlte Modellaufrufe brauchen ausdrückliches GO; Aktivierung und 500er-Test sind nicht freigegeben. **Maßgeblich für die EU-Route ist der Blocker3-Vertrag** (82,036000 USD/UTC-Tag; 88,845364 USD kumulativ desselben Auftrags; 0,081400 USD Reserve; 81,400000 USD Sicherheitsmaximum für 500 D + 500 R/U0); die alten 6/7-USD-Grenzen sind ausdrücklich kein EU-Vertrag. **Codex Cloud:** Modell und Denkstufe wählt der Betreiber; Sol führt, DeepSeek übernimmt klar abgegrenzte Arbeit nach AGENTS.md; diese Nutzung ist vom Production-Anbieterbudget getrennt. Production-Konfiguration, Migrationen, Cron- und Profilschutz vor Wirkung frisch lesen; historische Flags oder alte Profilzahlen sind keine Freigabe. [Autonomer Auftrag](betrieb/autonom-bis-500-starttor-20260926.md), [Production-Beweisprotokoll](betrieb/production_beweisprotokoll.md).

## Arbeitssteuerung

Codex Cloud ist der direkte Arbeitsweg zum 500er-Starttor; Modell und Denkstufe wählt der Betreiber, das Repository setzt keinen Standard. Der geprüfte Cloud Router ist aktiv: Sol führt, DeepSeek übernimmt abgegrenzte Arbeit nach AGENTS.md. Es gibt keine zeitabhängige Peak-Sperre; Entwicklungsarbeit darf jederzeit starten. Production-Schutzgrenzen, das gesonderte GO vor Aktivierung/500er-Test und die Production-Kostenlimits bleiben unverändert. Parallele Schreibarbeit nur in klar getrennten Bereichen; bei Überschneidung nacheinander.

## Nächster notwendiger Schritt

**Erlaubten Merge/Rollout des Datumsfixes abwarten; danach endgültige Lauf-/Commandbindung und frische Startprüfung, anschließend genau ein separates Test-GO.** Originalübergabe und zeitpunktgebundener Runtime-Nachweis sind übernommen. Kein Test ist freigegeben oder durchgeführt. Profilaktivierung, Commandinstallation, Journalmutation und bezahlte Calls bleiben gesperrt. Der geschlossene B2→D-Abschluss wird nicht erneut fachlich gemessen.

Die Production-Vorbereitung bleibt rein lesend: Nach READY auf dem erlaubten Datumsfix müssen Startschutz, aktuelle Kostenbücher, EU-Route,0aktive Profile, ruhende Facharbeit und lebender Endwächter frisch belegt werden. Finale Operation,Command,Sollplan,Kalender und Deployment müssen dieselben Originaleingaben binden. **Vorher kein empfohlenes Test-GO.** Keine automatische Datumsverschiebung. Es folgt genau **eine GO-Vorlage**, noch keine Freigabe; darin werden erst die erlaubten Schutzbindungen/Installation/Aktivierung konkret.

Die500 Zielkennungen stimmen mit dem kanonischen Paket überein (IDs-SHA256 `4d6d7b169831128cc69f0f3beb04c2fe05b57b7b4f528934b52e5c155f54e258`); Pakethash `aa79ae64ab76bb96b3190eea1352366cffe2d448d4c28d5407da480096d52cc5` entspricht der nativen Importquittung. Alle1500 Sollpositionen sind originaleingabe-/quellengebunden, finale Lauf-/Commandbindung noch offen. Alter U-Marker vom06.10. bleibt `unknown` mit `inFlight`; kein aktueller Lauf/Entlastungsbeleg,private Reserve erhalten,kein Retry. Aktuelle Operationsspitze ist separat eine abgelaufene unbeanspruchte U-Installation ohne Versuch; ein neuer DR-Command muss ihren Originalvorgänger nach dem bestehenden Vertrag exakt binden, keine Journalbereinigung.

Im 500er-Test sind alle 500 Profile vollständig zu prüfen: 1500 Sollpositionen (500 Mandatsbriefings, 500 Morgenbriefings, 500 Lage-Ergebnisse); fehlende, leere, doppelte, unbrauchbare und technisch fehlerhafte Positionen getrennt ausweisen; Qualität, Kosten, Laufzeit, automatisches Ende und Rückweg auf 0 aktive Profile belegen; die vorab definierten Erwartungen gelten; die Endabnahme erfolgt unabhängig vom ausführenden Lauf. Blocker1–4 sind laut Übergabe geschlossen; erledigte Nachweise nicht wiederholen — auch kein B1/B2/B3/B4-Re-Test.

Die Dokumentationskorrektur ist in den notwendigen Kalenderfix-Branch integriert; kein separater Dokumentations-PR. Merge und Production-Rollout bleiben gesperrt. Archive und historischer Belegwert bleiben erhalten; keine frischen DB-Zahlen oder Kosten erfinden, die jetzt nicht gelesen wurden. [Integrationsvertrag](betrieb/blocker2-d-integration-historische-uebergabe-20261011.md), [Blocker2-Abschluss](betrieb/blocker2-abschluss-20261011.md), [EU-Kostenvertrag/Blocker3](betrieb/blocker3-eu-servicekostenvertrag-umsetzung-20261011.md).

Historische Läufe, frühere Kostenstände und erledigte Zwischenentscheidungen: [Archivfassung vom 28.09.](archive/project_state/2026_09_28_CURRENT_STATE_vor_komprimierung.md). Andere Aufgaben nach dem 500er-Nachweis: [Datenmotor-Restliste](datenmotor-restliste.md).
