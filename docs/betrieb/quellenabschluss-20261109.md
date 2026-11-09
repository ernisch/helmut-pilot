# Quellenabschluss: Originalbeleg bis Lage und Briefing

09.11.2026. **Freigegeben und aktiviert; produktive Wirkung noch offen.** Basis `main`
`03d1fc28b6bc2fabd185dc83a3ce63d93821f209`. Branch
`codex/quellenabschluss-20261109`; exakter Endcommit und beide Pflichtchecks
stehen im zugehoerigen PR. PR1104 und Pflegekorrektur PR1110 bleiben bestehende
Livearbeit. PR1106/1109 sind geparkt. Die Entwicklung erzeugte keinen
Originalabruf, Modellaufruf oder Verarbeitungs-/Lastlauf. Der anschliessend
ausdruecklich freigegebene Rollout ist unten getrennt belegt.

## Aktivierung nach ausdruecklicher Betreiberfreigabe

Der Betreiber hat dieses gesamte Paket mit **Ja** freigegeben.
[PR1113](https://github.com/ernisch/helmut-pilot/pull/1113), gepruefter Kopf
`8a851d2beb67bb2e4af4e3f872e1361445e73d3b`, wurde als
`4d11ad63e2ae856110bcd579b5540f58557b5a26` gemergt.
[End-CI42579585370](https://github.com/ernisch/helmut-pilot/actions/runs/42579585370):
189/189 Standardsuiten,349/349 Bereichssuiten, Z22 mit48 PASS/0 FAIL/
0 uebersprungen. Beide Pflichtchecks erfolgreich; Browserausfuehrung und
separater schneller Kernschutz nach unveraendertem Pruefplan uebersprungen.

Am09.11. um08:20:51UTC wurden exakt die unten genannten drei
Productionvariablen angelegt, danach der gepruefte PR gemergt.
Productiondeployment `dpl_ExYN3YCQc8omWzfXWsgqxCVd6vVo` ist READY,
mit drei Aliasen und `aliasError=null`. Vercelbestand danach74Eintraege;
alle vorherigen71Eintraege exakt unveraendert, die drei neuen Werte nur fuer
Production. Keine Budget-, Anbieterlimit-, Profil- oder Cronaenderung.
Native Deployment-API: die drei neuen Env-Namen vorhanden, alter
`HELMUT_SUCHWEGAUSZUEGE`-Name fehlt. Werte sind durch Projektkonfiguration
belegt, keine separate Laufzeit-Wertattestation behauptet. Oeffentlicher
Releasestatus `ok/ready/storage=true`; Homepage, Client und Styles binden
`4d11ad63`. Deploymentcrons unveraendert04:00/05:00/05:15UTC.

Frischer nativer Vorcheck: einzig aktives Profil `cem-ince`, Profilhash
`80874d187716aac9d92cfc684436313b`, kein laufender Prozess (`running=null`).
Kostenvertrag und Hash unveraendert, weiterhin1USD/UTC-Tag und30USDgesamt;
gebunden1,172642USD. Der Rollout startete keinen Crawl, Modellaufruf oder
Nachlauf. **Noch kein regulaerer Quellen-/Lage-/Briefinglauf nach Aktivierung
abgenommen.** Naechste vorgesehene Laeufe:10.11.2026 um04:00Quellen,
05:00Lage/Briefing und05:15Morgenbriefing UTC. Termin ist kein Laufbeleg.
Nach Rollout Profilhash, einzig aktives Profil und Kostenhash/-bindung
unveraendert nachgelesen, `frozen=null`. Einmalige reine ChatGPT-Lesenachkontrolle
fuer10.11. um05:45UTC (06:45Berlin) eingerichtet; bestehende
Automationsinfrastruktur, kein neuer Helmutjob und keine Produktionszeitplanaenderung.

## Belegte Anschlussluecken und kleinste Korrektur

Der vorhandene Quellenlauf versorgt relevante Kandidaten bereits vor dem
Understanding. Die nachfolgenden Quellenleser lieferten jedoch nur
`raw_documents.summary`. Der globale Artikelbeleg ging Lage und Briefing
verloren, obwohl er das Modell zuvor erreicht haben konnte. Zusaetzlich fehlte
`retrieved_at` in diesen Projektionen; das Feld ist Teil des bestehenden
Quellenhashs und darf fuer den Cachezugriff nicht rekonstruiert werden.

Die drei bestehenden Leser (`getSourcesForVorgang`,
`getPruefSourcesByVorgaenge`, gebundener Lage-Reread) lesen jetzt denselben
normalisierten Quellenstand wie das Understanding und ergaenzen ausschliesslich
vorhandenen geprueften Originalkontext. `summary` wird nur in der gelesenen
Arbeitskopie auf den unverkuerzten Belegtext projiziert. Rohzeilen werden nicht
veraendert. Vorhandener brauchbarer RSS-Inhalt und sein Konfliktschutz bleiben.
Amtliche Artikelstaende und parlamentarische Metadaten behalten ihre eigenen
Vertraege. Die fruehere240-Zeichen-Leseprojektion geschieht vor dem Cachehash;
ein ganzer nachgeladener Absatz wird danach nicht erneut gekuerzt.

Der vorhandene Belegspeicher traegt den technisch rein lesenden Bestandsmodus:
nur `lesen`, weder Reservierung noch Anbieterzugriff noch Netz. Beschaffung
und Leser verwenden dieselben Quellen-/Standpruefungen; die Leser importieren
keinen Beschaffer, Crawler oder PARDOK-Dispatcher. Quellenstand,
ID, Ziel, Titel, Publikations-/Abrufzeit, Verfahren, Text-/Antworthash und
aktuelle SourceSafety bleiben gebunden. Fehlende, offene oder ungueltige
Belege bleiben Luecken. Die exakte Hostliste gilt auch fuer die neue
Leseprojektion. Originalauszug und Herkunft erreichen die bestehenden
Lagegenerator-/Quellenpruefprompts sowie den Briefingquellenvertrag. Herkunft
ist Teil beider Eingabehashes; gleicher Text bei geaendertem Quellenstand
verwendet keine alte Pruefung. Der gebundene Lage-Reread lehnt einen inzwischen
fehlenden oder geaenderten Artikelbeleg ab. Frische bleibt Publikationszeit,
niemals Lesezeit des Originals.

Der alte Eagerwrapper war trotz derselben Aktivierungsflag nicht an die
Hostliste gebunden. Er prueft diese jetzt vor jedem neuen Abruf und haelt
das gepruefte Ziel vor asynchroner Arbeit fest. Vorhandene neue Einstiegsbelege
werden auch dort wiederverwendet; kein erneuter Originalabruf, nur weil der
alte Aufrufer bisher ausschliesslich den v1-Schluessel kannte. Bestehende
v1-Belege behalten ihren Vorrang. Offene/negative Belege werden nicht geloescht
oder als neuer Abrufauftrag umgedeutet.

## Pruefbelege

Ausschliesslich vorhandene DGB-/Radio-HTML-Fixtures mit ihren bestehenden
SHA256, sonst deklarierte synthetische Gegenbeispiele. Alle Tests laufen ueber
`scripts/lokal.js`: Produktionskennungen entfernt, echtes externes Netz
gesperrt. REST und Modelle sind Attrappen; die drei echten Storagefunktionen
werden mit ihrem tatsaechlichen Selectvertrag ausgefuehrt.

- `artikelkontext-pruefquellen-test.js`:12/12 Gruppen. DGB1256 und Radio727
  Zeichen wortgetreu bis Lagegenerator, Quellenpruefprompt und Briefingvertrag;
  alle drei REST-Leser, unveraenderte Rohzeilen, Host-/Flaggrenzen,
  Hash-/Canonical-/Datums-/Titel-/Auszugsdrift, aktuelle Quellensperre,
  ungueltiger/offener Bestand,240-Zeichen-Altprojektion, deduplizierte Reads,
  Parallelitaet8, Herkunftswechsel und gebundener Reread.
- `artikelkontext-anschluss-test.js`: vorhandene Eager-/Budget-/CAS-/Fristfaelle
  plus exakte Hostfreigabe, Mutation des Aufruferziels und v2-Wiederverwendung:
  26/26 Gruppen bestanden.
- Bestehende Lagebindung11/11, Pendingbestand12/12 und Quelleninhalt11/11
  gezielt bestanden. Die bestehenden PR1104-Replays des aktuellen Quellenlaufs
  bis zum abgefangenen Modelladapter werden wiederverwendet.
- Zwei unabhaengige OpenAI-Reviews: Normalisierung vor Cachehash und Festhalten
  des Eagerhosts vor dem ersten `await` nachgeschaerft. Kein DeepSeek.
- Pflicht-CI am exakten PR-Endkopf erforderlich. Wegen gemeinsamer Storage-
  und Deploymentdatei entscheidet der unveraenderte Pruefplan konservativ.
  Kein lokaler zweiter Gesamtlauf und kein neuer Mock100/500.

**Erster Endkopfcheck bleibt FAILURE:** CI42575610947 auf470751ee:
189/189 Standardsuiten und348/349 Bereichssuiten bestanden; Z22 danach SKIP.
Der unveraenderte `pardok-dispatch-smoke-test.js` fand die unzulaessige
statische Verbindung des Lesepfads ueber Beschaffungsimporte zum Crawler.
Kein Liveabruf. Kleinste Korrektur: dieselben reinen Quellen-/Standpruefungen
in den vorhandenen Belegspeicher und drei reine Auswahlhelfer in das vorhandene
Auszugsmodul verschoben; kein neues Modul und kein abgeschwaechter Test.
Danach PARDOK-Isolation13/13, Original-/REST-Anschluss12/12 und Eager26/26
gezielt gruen. Unabhaengiges Delta-Review ohne weiteren Befund. Der neue
Endkopf erhielt die oben belegte eigene Pflicht-CI; erfolgreiche Teilnachweise
des ersten Laufs bleiben ihm zugeordnet, kein lokaler zweiter Gesamtlauf.

Vor jedem Push werden alle Workflowtrigger gegen Branch UND gesamten PR-Diff
geprueft. Shadow/Sprint9B/PARDOK bleiben manuell. Der Profil-Liveworkflow trifft
diesen Diff nicht; historische Pushbranches ebenfalls nicht. Die normale
Pflicht-CI bleibt unveraendert. `vercel.json` sperrt das Gitdeployment dieses
Branches ausdruecklich. Keine Preview mit Zugang zur produktiven Datenbank.

## Freigegebenes Aktivierungspaket

Nach gruener Endkopf-CI wurde genau dieses Paket freigegeben und ausgefuehrt.
Die freigegebene Reihenfolge lautet: nach frischen Vorchecks und gesicherten Vorwerten exakt diese
drei Production-Variablen setzen; die bestehende Runtime aendert sich dadurch
noch nicht. Unmittelbar danach den geprueften PR-Endkopf mergen und den
regulaeren Gitrollout abwarten. Das neue Deployment uebernimmt die Variablen;
READY und effektive Konfiguration danach lesen. Falls der Merge blockiert ist,
die drei eigenen Env-Aenderungen wieder zuruecknehmen. Kein zusaetzliches
manuell erzeugtes Deployment:

```text
HELMUT_ARTIKELKONTEXT=on
HELMUT_SUCHWEGAUSZUEGE_HOSTS=www.dgb.de,www.radio-hannover.de
HELMUT_ANBIETER_STEUERUNG=on
```

`HELMUT_SUCHWEGAUSZUEGE` bleibt ungesetzt: kein zusaetzlicher alter
Metadatennachladepfad. Keine `HELMUT_ANBIETER_*_MINUTE/TAG`-Overrides,
keine Budget-, Profil-, Cron-, Anbieter- oder Infrastrukturumstellung.
Die beiden Hosts sind die bereits vorbereitete erste Originalfreigabe;
keine automatische Erweiterung auf RND/NDR/andere Hosts. Technische
Hostfreigabe ist keine pauschale Nutzungsrechts- oder Anbieterzusagenbehauptung.

**Globale Wirkung:** Artikelkontext und Anbietersteuerung sind keine
mandantenspezifischen Schalter. Der heutige Einprofilbetrieb begrenzt die
fachliche Nutzung, aber nicht die Bedeutung dieser Flags. Hauptdienst:
maximal20Kandidaten, davon3unklare,2neue Originalabrufe pro Dienstlauf,
kanonischer Pool200. Legacygrenzen gelten pro Mandatscrawl, nicht pro
Mehrmandatscron oder Tag. Bestehende andere Eager-Verstehenseinstiege haben
weiterhin hoechstens1neuen Abruf pro Wrapperlauf; dazu gehoeren die
Lage-Erfassung und ihr geteilter Kontextlauf. Auch sie koennen nur die zwei
exakten Hosts abrufen. Derselbe Belegstand wird aus dem globalen Bestand
wiederverwendet. Mehrere fehlende Kontexte in einem ausgewaehlten Cluster
bleiben nach dem vorhandenen Ein-Beleg-Vertrag pending.

Appstart nutzt `buildLageBriefing(cacheOnly:true)`; die neuen Leser holen
keine Originale und starten keine Modelle. `/api/lage/check` ist ein
bestehender ausdruecklicher Benutzeraktions-/separater Cronpfad, kein Aufruf
bei jedem App-Oeffnen. Die aktuelle Production-Konfiguration plant nur
04:00Quellen,05:00Lagebriefing,05:15Morgenbriefing UTC; dieser Sprint fuegt
keinen Job hinzu und startet auch keinen vorhandenen manuell.

**Anbietersteuerung gilt global fuer alle Crawler und OpenAI/Azure-Aufrufe.**
Code-Defaults: Google30/min; sonstige Quelle60/min je Host;
OpenAI20/min, AzureOpenAI20/min; Anbieter-Tageswert0 bedeutet keinen
zusaetzlichen Anbieter-Tagesdeckel. Die bestehenden Kostenlimits gelten
weiter. Geteilte Anbieter-RPCs reservieren Kontingente und melden Fehler;
Vertagungen/Unterbrechungen koennen deshalb auch andere vorhandene Quellen-
und Modellauftraege betreffen. Das sind technische Defaults, keine belegten
Kontingentzusagen der Anbieter. Native lesende Pruefung09.11. bestaetigt
`helmut_anbieter_reserviere`, `helmut_anbieter_melde` und
`helmut_reserve_llm_call`; keine RPC-Ausfuehrung zur Probe.

Pro Original bleiben HTTPS, DNS/IP-Bindung, TLS,20s,1MiB, keine Redirects,
SourceSafety, Aggregator-/Verkuerzersperren und Robotspruefung erhalten.
Modelle behalten Kostenreservierung, CAS/Fencing und absolute Frist.
Keine Schranke wird angehoben.

**Lese-/Kostenwirkung:** Die neue Projektion liest hoechstens zwei bestehende
Cachekeys je fehlender Quelle eines erlaubten Hosts, maximal8parallel und
identische Dokumente einmal je gebuendeltem Leseaufruf. Bestehende Grenzen:
Einzelleser standard40Quellen, gebundener Lage-Reread6,
gebuendelter Leser hoechstens500Vorgaenge×40Quellen. Der theoretische obere
Zusatzaufwand ist damit80/12/40000Cachelesungen, vor Host-/Inhaltsfilter und
Deduplizierung; jede Lesung adressiert nur die einzelne bestehende
Artikelbelegzeile (`id=eq`, `select=id,data`), niemals den gesamten Hauptblob.
Keine Behauptung eines globalen Tagesdeckels. Ein erneuter
Appabruf kann diese Cachelesungen wiederholen, aber keinen Originalabruf.
Regulaere neue relevante Belege koennen mehr Eingabetoken und bestehende
Modellarbeit ausloesen. Speicher-, Transfer-, Function- und normale
CI-Runnerminuten nicht als kostenlos ausgeben; Entwicklungstests erzeugten
keine Original-/Modellkosten.

Aktuell nativ bestaetigte Betriebsbindung:1USD je UTC-Tag,30USD insgesamt,
Beginn05.11.2026,23:00:10UTC, Azure `gpt-5-mini-eu`, nur der bestehende
aktive Pilot. Vertragshash
`8c98b2e18ee5dc21c73561bbf5bad2d8cb6c76f8ccd533b3153270bbd7d9a348`.
Lesestand09.11.:1,172642USD gebunden,54Buchungen,`frozen=null`.
Diese Momentaufnahme ersetzt keine frische Budgetlesung unmittelbar vor
Aktivierung. Historische82/88USD-Vertraege werden nicht uebertragen.
Vercel-Lesestand09.11.:71Env-Eintraege,0verdeckte Productioneintraege;
die drei obigen Variablen und alte Suchwegauszugsflag damals ungesetzt.
Der Aktivierungsstand oben ersetzt diese historische Env-Momentaufnahme.

## Nachkontrolle ausschliesslich am naechsten regulaeren Lauf

Lesende Nachweise aus vorhandenen `crawl_runs`/`main.crawlRuns`,
`process_runs`/`main-auth.processRuns`, Artikelbelegzeilen, gespeicherten
Lage-/Briefingpruefvertraegen und eng projiziertem `betriebskostenBudget`.
Keine Generierungsroute oder Cronroute als Statusabfrage aufrufen.
Der vorhandene Anbieter-Konfigurationsattest enthaelt die drei neuen Flags
nicht; Projekt-/Deploymentkonfiguration und geprueften Code getrennt binden.
Die Crawl-Kompaktierung und relationale Projektion erhalten die detaillierte
`understanding.inhaltsversorgung`-Bilanz nicht. Deshalb nur vorhandene
Laufantworten/Logs oder Belegstaende auswerten; nicht rekonstruierbare
Kandidaten-/Wiederverwendungszahlen bleiben UNKNOWN. Keine neue Telemetrie
oder Verarbeitung allein fuer den Nachweis.

1. Nach separat freigegebenem Rollout exakt Merge-SHA, READY, Hauptdomain,
   effektive drei Flags und unveraenderte Budget-/Profil-/Cronbindung lesen.
2. Naechsten regulaeren Quellenlauf lesen: Wege, neue Dokumente,
   Inhaltskandidaten, belegte/ungeeignete/offene Originale, neue Abrufe,
   Wiederverwendung, Pending und Anbietervertagungen getrennt ausweisen.
   Kein erzwungener Crawl oder Modellnachlauf und keine Quote aus bloss
   leeren Auszugsfeldern ableiten.
3. An tatsaechlich behandelten relevanten Faellen den gespeicherten
   Originalbeleg mit Rohquellenstand, unveraendertem Text-/Quellenhash und
   vorhandenem Understanding-Eingabevertrag verbinden. Nur vorhandene
   native Laufbelege auswerten; ein historischer Modellprompt wird nicht
   erfunden. Wenn die konkrete Modelleingabe nicht nativ rekonstruierbar
   ist, bleibt genau dieser Teil UNKNOWN; Offline-Promptnachweis getrennt.
4. Naechste regulaere Lage/Briefingausgabe lesen: derselbe Auszug und seine
   Herkunft im gespeicherten Quellenvertrag, positive/negative Pruefungen,
   Quellen-/Eingabehash, ehrliche Luecken und Kostenstand. Code-PASS ist kein
   Fach-PASS und keine Zusage einer Tagesempfehlung.

Nutzerbefund09.11. bleibt Ausgangsbeleg: Quellenlauf954358fe,152Wege,
151erfolgreich,103neu,101ohne Auszug; Lage15Belege,8ohne Auszug.
Das ist weder Relevanzverlustquote noch nachgewiesene Behebung aller Faelle.
Radio-Transport aus Vercel ist ohne regulaeren Abruf weiter unbewiesen;
kein Proxyversuch daraus. Alte Rohzeilen/KOs werden nicht automatisch repariert.

**Rueckweg:** Drei zuvor ungesetzte Productionvariablen wieder entfernen und
regulaer bereitstellen; falls der Code selbst betroffen ist, vorheriges READY
oder gezielter Revert des PR. Vorher aktuellen Fremdstand pruefen.
Vorhandene Belege/Luecken, Kostenbuch, Reservierungen und Fachausgaben bleiben
als Historie erhalten; keine Loeschung und keine automatische Wiederholung.
Die Flag-Ruecknahme kann bisherige reine Titel-/Leerfaelle wieder sichtbar
machen; sie widerruft keine bereits entstandenen Kosten oder alten Ausgaben.

**Genau ein naechster Schritt:** Nach den naechsten regulaeren Laeufen
ausschliesslich lesend die tatsaechliche Wirkung und Quellenbindung pruefen.
Die erteilte Freigabe deckt diesen Schritt ab; keine erneute pauschale
Freigabe und kein manueller Ersatzlauf.
