# DIP-Beratungsstand: produktive Verbindung, 17.11.2026

Auftrag und Dateizustaendigkeiten: [#1218](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6951450665).
Basis `2023dfd5` nach PR1249–1251; deren Reparaturen werden nicht wiederholt.
**Teilweise: PR1253/1252 regulaer live; notwendige Produktlesefolge in Arbeit.
Neue Textwege ohne Nutzungsfreigabe inaktiv, regulaere Kundenwirkung offen.**

## Integration und notwendiger Folgeanschluss

E hat den unveraenderten Kopf `e95b0084` einschliesslich aller drei letzten
D-Deltas [unabhaengig abgenommen](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6957036835).
Die beiden gruenen Pflichtchecks44134024822 wurden wiederverwendet.
PR1253 SHA-gebunden gemergt auf `ec76e38819f3b03235eb7fa5520859df70a06891`;
normaler Git-Productionrollout `dpl_2M7uWRPej1X1QjeYzQUDddDPEfvP` READY.
Oeffentlicher Alias/Appclient HTTP200, Versionec76e388 und gepruefte Bytes
SHA256 `983d2709d1f8b9ea24fbef36da34c1dd6e0f37f1062b6d73091257c8217bbae5`.
F1252 danach mit unveraenderten drei abgenommenen Dateiblobs auf Mainbasis
integriert, Kopf941fbbdb/Pflichtlauf44148454840 beide gruen; Merge
`6c1af21af4c39f29ad0244eda0a7fa2271e7a877`, normaler Gitrollout
`dpl_FFghQURCpRKd9vixFC76Yre9kXVA` READY und Aliasversion6c1af21a bestaetigt.
Keine Retentionausfuehrung, Datenloeschung, Quellenaktivierung oder Rechtsfreigabe.
Der fruehere Endreviewblocker ist damit geschlossen; a5abd880 erhaelt dessen
historischen Abschlussstand, wird nicht als aktueller Blocker ausgegeben.

Der erweiterte Quellenauftrag belegt drei notwendige Folgepunkte:

- Es Dokumentparser las Plenarsitzungen110–113, die Zusammenfassung nur110.
  E-Nachtrag6776ac72 von D vollstaendig unabhaengig gelesen, unveraendert als
  42909cb0 uebernommen. Alle vier Beginne bleiben erhalten; gemeinsame TOPs
  werden keinem Tag erfunden. Es20/21-Gruppen- und zehn Originalbelege
  wiederverwendet, keine zweite Testkopie.
- Der bevorzugte App-Sammelleser umging den DIP-Standleser. Die staerkere
  native Gegenprobe liefert zuerst `unbekannt` statt gespeichertem `Ueberwiesen`.
  Derselbe bestehende GET-Leser erreicht jetzt Einzel- und Sammelpfad;
  vorhandene DIP-Suite mit echter Stand-/Abrufzeitassertion17/17 gruen.
- Gespeicherte Terminbelege hatten keinen Produktverbraucher. Neuer enger
  Leser prueft Namespace, sourceId, exakten Hash, neueste Beobachtung,
  Mehrdeutigkeit, Zukunft, aktuelle Code-/Katalogfreigabe und Mandatsrolle.
  Allgemeiner Kontext einmal bei Lagequellen; Radar-/Briefingmetadaten nur
  bei exakter amtlicher BT-Drucksache/Wahlperiode/Original- und Vorgangsbindung.
  Keine Titeljoins, persoenliche Anwesenheit, neue Signale oder Prioritaeten.

Der normale App-Einstieg liefert das gepruefte gespeicherte Tagespaket, nicht
den frischen V3-Producer. Die neue Ausgabe-Kopie erhaelt deshalb nur exakt
gebundene aktuelle Quellenmetadaten nach den unveraenderten Paketwachen.
Texte, Reihenfolge, Empfehlungen, Originalpaket und Hash-/Quittungsobjekte
bleiben erhalten. Explizite Historie wird nicht nachtraeglich angereichert.
Produktlesen ausschliesslich GET; maximal50 angezeigte Vorgangskennungen,
je40 vorhandene Quellkanten und maximalzwei Beobachtungen je Quelle.
Keine amtlichen Abrufe, Modelle, Migrationen, neuen Quellenfamilien oder Flags.

Gezielt lokal ueber `scripts/lokal.js`: neue Produktgruppen14/14 inklusive
normalem App-Leseeinstieg, echtem Einzel-/Sammelreader, Profilwechsel,
Rechteentzug auch aus Cache, Plenum/ICS, Konflikt, alter/historischer Frist;
Radar117/117, Bereichsvertrag46/46, Quellen-UI13/13, DIP17/17.
Echter vorhandener Chromiumharness390/1280 mit Renderernetz gesperrt:
sichtbarer parlamentarischer Kontext, aufgeklappter historischer Fristbeleg,
getrennte Links und kein Ueberlauf. Neue Clientbytes SHA256
`09d3ec9cca3e1aef2ca181662d624392474e26ada1e7a89b67592ca6d3beb055`.
Erste Browserprobe zeigte mangels passendem Test-Namespace nur unbekannten
Stand; Namespacefixture korrigiert und positive Hash-/Fristassertion verstaerkt.
Erste neue Tests korrigierten reale Zeitstempel-/PostgREST-Fixtures sowie einen
lokalen Namensfehler. Keine Produktionswache fuer gruenen Test gelockert.
Endreview/Pflicht-CI/Deployment dieser Folge stehen noch aus.
Schnellkern: elf Suiten direkt erfolgreich; drei weitere zunaechst nur durch
Sandbox-`listen EPERM` verhindert. Mit erlaubtem lokalen Loopback gezielt
danach Vertrags-Snapshot19/19, P1-Sicherheit347/347 und Mandant39/39 gruen;
insgesamt alle14 Schnellkernsuiten belegt, keine Wiederholung der elf Erfolge.
Erster regulaerer Folge-PR1254-Lauf44156031805 auf9ec48604 scheitert im
Browserjob am Prosa-Harness: dessen selektive Funktionsextraktion kennt
`renderLageViewInhalt` noch nicht. Nur die drei neuen Clientabhaengigkeiten
ergaenzt, alle Prosaassertionen erhalten. Optionaler lokaler Chromium-Pfad
wie in vorhandenen Browserpruefungen, CI-Standardbrowser unveraendert.
Danach19/19 Vorschaugruppen mit echtem Chromium320/390/1280, hell/dunkel,
gruen. Anfangs lokal nur das nicht installierte Playwright-Bundle verhindert;
vorhandenen Systemchromium verwendet, kein Browserdownload oder Gate-Skip.
Alter CI-Kopf bleibt waehrend laufender Kernpruefung unveraendert.
Realer reiner Betreiber-Appabruf19:24:20UTC, vorhandener GET ohne tag/modus:
HTTP200/availabletrue,690831Bytes, Antwortsha256
`dab75d4b0b6fbca11a727adbbcbd312b1eceaa911f49d62a68bd7c6900bf2c0c`.
Paket6ae73360 unveraendert, zwei Lageabsaetze/elf Karten, keine Tagesprioritaet,
Radarstale; Fehler Quellenversorgung/Handlungsbeleg bleiben ehrlich erhalten.
Absatztextsha256 `a12a2a0210f38944244317c4acdddcfae0b39f92fd616e7a2229d950ae910c89`.
Kein neuer Verarbeitungs- oder angemeldeter Kundenbrowsernachweis.
Ungekuerzte Antwort bleibt privat ausserhalbGit.

Dieser echte Antworttyp enthaelt auch verdeckte Altitems und Paketabhaengigkeiten.
Eine weitere enge Gegenprobe belegt deren faelschlichen Vorrang im neuen
Metadatenleser vor den wirklich sichtbaren Vorgangskennungen. Auswahl jetzt
aus Lage, qualifiziertem Helmutstand und angezeigtem Radar; keine neuen
Kandidaten oder Aenderung der Tagespriorisierung. Zusaetzlich gelangt die
amtliche `dipBeratungsstaende[].vorgangId` sonst in die interne Tagespaket-
Abhaengigkeitsmenge; die bestehende Publikationswache wuerde sie ohne KO ablehnen.
Gezielt zuerst rot, dann diese geschlossenen Quellenmetadaten-Namensraeume
vom internen Kennungssammler getrennt. Politische Vorgangs-/Quellen-/Paketwachen
bleiben erhalten. Produktgruppen danach16/16, vorhandene Tagespaketsuite22/22.
Erster Folge-Kernjob endet nach gruenen Standard-/DB-Stufen mit genau
`profilhash-integration-test.js`: seine VM-Whitelist kennt den neuen realen
App-Lesehelfer noch nicht. Nur diesen echten Helfer als Abhaengigkeit geladen;
Profil-/Hash-/Historienassertionen unveraendert, danach18/18 gruen.
Der Browserfehler bleibt der separat korrigierte Prosa-Harness. Beide
Erstfehler werden nicht umgewertet; gemeinsamer Endkopf braucht neue exakte CI.

## Belegkette

1. `dip.js:getQueueDocuments` verwendet weiterhin dieselbe Profilfilterung,
   Anbieterzulassung, Quellenklassenlease, absolute Auftragsfrist und den
   vorhandenen Drucksachencache. Kein zusaetzlicher Quellenauftrag.
2. Der vorhandene Faktenleser `dip-vorgangsfakten.js:lese` erhaelt im
   Vorgangsmodus nur eine amtlich am Dokument gebundene DIP-Vorgangskennung.
   Er liest den festen amtlichen Vorgang, dessen Positionsliste und denselben
   Vorgang erneut; eine zwischenzeitliche Aenderung verwirft die Aufnahme.
3. Root-`beratungsstand` ist die ausdrueckliche DIP-Angabe, kein aus Titel,
   Reihenfolge oder historischem Beschluss errechneter Endstand.
   `datum` des Vorgangs bleibt **letztes Dokumentdatum**; Positionsdatum,
   DIP-Entitaetsaktualisierung und tatsaechlicher Abrufzeitpunkt bleiben getrennt.
   Ueberweisungen, Federfuehrung, Beschluesse, Institution, Dokumentart sowie
   Fortsetzung/Nachtrag und weitere Einschraenkungen stammen
   aus derselben bereits vorhandenen strengen Positionsnormalisierung.
4. `dip-beratungsstand.js` legt validierte Hashbelege insert-only im vorhandenen
   globalen `helmut_store` ab: `<storeId>-dipstand-<VorgangId>-<Hash>`.
   Kein Ueberschreiben von Originalen, keine Migration oder Kundenzeile.
   Auch nach verlorener Schreibantwort wird Erfolg nur durch exakten GET-Readback
   bestaetigt; kein blinder Schreibretry. Historische Belege bleiben erhalten.
5. `storage.js:getSourcesForVorgang` ergaenzt seine vorhandenen, bereits
   mandatsgebunden gelesenen Originale ausschliesslich um gespeicherte
   oeffentliche DIP-Staende. Produktlesen laedt keine amtlichen Daten nach.
   Quellen-ID, Original-URL, Vorgangskennung, Vorgangstyp und Hash muessen passen.
6. Der gemeinsame `quellen-hinweis.js`-DTO erreicht bestehende Quellenzeilen
   von Lage, Radar und Briefing. Radar-/Briefingmapper erhalten die Felder
   auch nach ihrer bisherigen Verengung und erneutem Artikelwechsel.
   `client.js` zeigt Vorgangsidentitaet,
   DIP-Stand, Abrufdatum und getrennte Originalbelege; historische Schritte
   sind aufklappbar. Keine neue Prioritaet, KI-Aussage oder Handlung daraus.
   Die bereits belegten DIP-Bedingungen bleiben sichtbar: Quelle Deutscher
   Bundestag/Bundesrat – DIP, kostenloser Originaldatenlink und Kennzeichnung
   der Auswahl/Gliederung fuer die Anzeige; keine neue Rechtsfreigabe.

## Konservative Grenzen

- Hoechstens zwei neue Vorgangsaufnahmen je regulaerem DIP-Auftrag, je drei
  amtliche GETs unter derselben Anbietersteuerung. Frische gespeicherte Belege
  werden 30 Minuten wiederverwendet; Folgeauftraege erreichen weitere Kennungen.
  Kein neues Kontingent, Zeitfenster, Cron oder Modellaufruf.
- Hoechstens zwoelf eindeutige Vorgangskennungen je Leseschritt; fuer weitere
  bleibt der Stand unbekannt. Ein Abruf beginnt nur bei mindestens 25 Sekunden
  Restfrist. HTTP bleibt auf 12 Sekunden und 128.000 Antwortbytes begrenzt.
- Positionsverlauf nur bei vollstaendiger Liste mit hoechstens zwoelf Positionen.
  Sonst bleibt die explizite Root-Angabe erhalten, der Verlauf aber unbelegt;
  keine teilweise Liste als vollstaendige Chronologie.
- Fehlende/fremde/defekte Belege erhalten den echten Dokumentinhalt und ergeben
  einen unbekannten Stand. Alte DIP-Dokumente ohne gespeicherte Vorgangsreferenz
  zeigen die fehlende Zuordnung ausdruecklich; kein Backfill aus Aehnlichkeit.
- Jede Anzeige nennt: **Spaetere Aenderungen sind nicht bestaetigt.** Ein alter
  Beschluss wird nicht als heutiger Endstand oder automatisch als Frist ausgegeben.
- Die neuen oeffentlichen Archivzeilen sind in der extern festzulegenden
  Quellenaufbewahrung zu beruecksichtigen; kein Loeschvollzug wird aktiviert.
  Fs Rechtsdossier bleibt massgeblich fuer offene externe Entscheidungen.

## Tatsaechliche lokale Pruefungen

Alle lokalen Pruefungen ueber `scripts/lokal.js`, mit HTTP-Ersatz bzw.
gesperrtem Browsernetz, ohne Productionzugriff oder Modellaufruf:

| Pruefung | Ergebnis / Reichweite |
| --- | --- |
| `dip-beratungsstand-test.js` | 17/17 Gruppen: echter Faktenleser, unveraenderliche Ablage/Readback, Auftrags- und Produktaufrufer, Cachefortschritt/Anbietersperre, Identitaets-/Zeit-/Hashfehler, Servermapper, sichtbarer Radarvertrag und Institution/Fortsetzung/Nachtrag bis zum Renderer |
| Derselbe Test `--browser` | Echter Chromium bei 390/1280 Pixeln; drei Quellenansichten plus Radar- und Briefing-Haupt-/Folgeitem, Folgestandhinweis, DIP-Pflichtattribution, getrennte Links, kein Ueberlauf; Client-Bytes SHA256 `983d2709d1f8b9ea24fbef36da34c1dd6e0f37f1062b6d73091257c8217bbae5` |
| Vorhandene Faktenleser-/amtliche-/Profilpruefung | 18/18, 4/4 Gruppen mit elf aufgezeichneten amtlichen Einzelaussagen, 11/11 |
| Vorhandene Quellfelder-/Vorgangsbezugspruefung | 16/16 und 10/10 |
| Vorhandene Parlamentsdaten-Quellen-UI | 13/13 einschliesslich unveraenderter Destatis-/iRights-Hinweise |
| Vorhandener schneller Kernschutz | 14/14 |
| Vorhandener Radar-/Bereichsvertrag | 117/117 Assertions und 46/46 Faelle; keine neue Prioritaet allein durch Beratungsstand |
| `seed-drift-test.js` | Generiertes Repoartefakt stimmt wieder bytegenau mit unveraendertem Generator ueberein; keine SQL-Ausfuehrung |

Die neue Integrationssuite verwendet aufgezeichnete amtliche Positionen aus der
vorhandenen Fixture und ein **synthetisches Vorgangsaggregat**. Sie behauptet
keinen neuen aktuellen DIP- oder Kundenstand. Amtliche OpenAPI am 17.11.
nur als Dokumentation gelesen: `https://search.dip.bundestag.de/api/v1/openapi.yaml`,
SHA256 `95b2e852649cff71021de2497628c3158070ecbfc9dbd15651ae485b7379c6ff`;
identisch zum vorhandenen Fixture-Schemabeleg.

Erster eigener Codefehler erhalten: Rueckpruefung normalisierter Positionen
scheiterte zunaechst an `stand-bindung`; Feldrueckfuehrung und optionale
Nullfelder korrigiert, danach obige Integrationspruefung erfolgreich.
Ein lokaler Sockettest benoetigte ausserhalb der Sandbox dieselbe unveraenderte
Pruefung; die zunaechst fehlende VM-URL-Umgebung war ein Testharnessfehler.
Eigene Integrationsluecke vor Reviewabschluss erkannt: direkter Quellenrenderer
belegte noch nicht die Feldweitergabe durch Radar und Briefing-Hauptitem.
Mapper, erneute Artikelbindung und tatsaechliche Haupt-/Folgeanzeigen sind jetzt
ergaenzt; der obige Endnachweis ersetzt diese unvollstaendige Vorannahme.
Auch Alt-DIP-PDFs ohne Quellfelderbeleg zeigen nur die fehlende amtliche
Vorgangszuordnung; keine Rekonstruktion oder neue Quellenlesung.
Die Institutions-Gegenprobe ist ausdruecklich synthetisch. Die originale
BT-Fixture ist ein Plenarprotokoll; die zunaechst falsche neue Erwartung
„Drucksache“ wurde im Test berichtigt, das amtliche Original blieb unveraendert.

## Koordinierte Integration und fehlende Betriebsbestaetigung

Fs isolierter Retentionsdiff PR1252 / `726cb334` wurde von D unabhaengig gelesen:
kein Codeeinwand; Merge wegen Pflicht-CI44111286665 gesperrt. Vier Fehler sind
auf unveraendertem Main bestaetigt. E uebernimmt seine drei Transport-/Deadline-
Testvertraege, D das bestehende generierte Bund-Seed-Artefakt. Deren Unterschied
ist ausschliesslich die bereits im Modell enthaltene **pausierte** BMG-Meldungen-
Zeile mit zwei Paketbindungen. Kein CI-Gate oder Generator wird abgeschwaecht.
Es separater Testfix `487ea37c` wurde von D vollstaendig unabhaengig gelesen:
EventEmitter-/destroy-Semantik der HTTP-Attrappe, exakte AbortError-/signal.reason-
Bindung sowie dynamischer Deadline-Stopp vor Netz und gueltiges Direktfeed-RSS.
Keine Runtimeaenderung; die neue Erwartung prueft den vorhandenen Schutz strenger.

PR1253 / `ae6102cc` ist von E unabhaengig vollstaendig gelesen
([Codeabnahme](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6952692411)).
Erste regulaere Pflicht-CI44115174998: Browser bootet, scheitert aber in der
unveraenderten alten Smoke-Fixture an `primaryItem=null`. Die Testkorrektur
liefert nun einen deklarierten synthetischen Originalsatz und ein Profilthema
an den unveraenderten Fachvertrag, statt einen Erfolgs-DTO einzusetzen. Die
Erwartung prueft die datierte Ankuendigung und den unbekannten Vollzug.
Ein zunaechst fehlender Assert-Import im Testnachtrag wurde korrigiert.
Der anschliessende isolierte Admin-Browserfall fand einen zweiten alten
Fixturefehler: negativer Operator-Authfall hatte die synthetische Session
abgemeldet gelassen. Nur der Testreset wird vervollstaendigt; Produkt-Auth
bleibt unveraendert. Danach **25/25** gezielte Admin-/Browserfaelle bestanden.
Der alte vollstaendige Smoke blieb bis zur End-CI ausdruecklich rot;
keine lokale Gesamtgruenaussage aus diesen Teilbelegen.

Der abgeschlossene erste Lauf44115174998 bestaetigt die Standard-Offlinesuite,
scheitert in der Bereichsregression an **20** Suiten. Die Check-API zeigt
nur zehn Fehlerannotationen; E uebermittelt die komplette Erstlogliste
in [6953732829](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6953732829),
ohne neue Probe. Der externe Azure-Logdownload war bei D nicht erreichbar.
Zwei repraesentative Faelle auf isoliertem **unveraendertem
main2023dfd5** scheitern identisch: Artikelidentitaet erwartet unbelegten Primary,
Teilstandtest erwartet dessen Verdrängung durch eine blosse ID-Markierung.
Diese beiden Faelle sind Basisfehler. D korrigiert zunaechst die fuenf reservierten Tests:
Artikel-/FR-Belegzeit bleibt am vorhandenen Sachstandeintrag geprueft;
Quellenbindung/Aussagenbereinigung allein erzeugen keinen Tagesauftrag;
unbelegter Primary verdraengt keinen wirklich geprueften Teilstand.
Gezielt danach **11/11, 6/6, 15/15, 50/50, 10/10** erfolgreich.
E uebernimmt getrennt die fuenf verbleibenden Zeit-/Korrekturvertraege.
Keine Runtime-, Fachwachen- oder CI-Aenderung fuer diese Altfehler.

**Eigener echter Runtime-Erstfehler durch Es unabhaengige Gegenprobe entdeckt:**
`quellen-inhaltsversorgung-queue-test.js` besteht auf main29/29, scheitert am
D-Kopf aber mit „Missing expected rejection“. Der neu vorgezogene Dokumentcache
hatte einen letzten Leasefehler ueberlebt. Cachefreigabe wieder ausschliesslich
nach final bestaetigter Lease und Zeitgrenze, auch nach Standaufnahme.
Zusaetzliche gezielte Gegenprobe zeigte einen moeglichen Stand-POST nach
verlorenem letztem API-Lease (zunaechst eine statt null Speicherzeilen).
Dieselbe Wache reicht jetzt bis in jede neue Speicherphase; keine POST-/
Readbackphase nach Verlust/Frist und keine Erfolgsbehauptung bei UNKNOWN.
Unveraenderte Queue-Schutzsuite **29/29** und erweiterte DIP-Suite **17/17**
danach gruen. Kein bestehender Schutzfall wird angepasst oder entfernt.

Die weiteren reservierten Altvertraege sind gezielt nachgefuehrt: Schwerpunkt
65/65, Satzgrenze8/8, Vertragsadapter31/31, Scoring24/24 und native UI130/130.
Positive Faelle erhalten deklarierte synthetische Originalanlaesse und einen
passenden Mandatsbezug; der echte Adapter und seine Fachwachen bleiben aktiv.
Der UI-Vertrag bestaetigt Teilstand, unbekannten Vollzug und keine erfundenen
Risiken, Kommunikationspflichten oder18Quellen. Keine Runtimeaenderung dafuer.
Es getrennte Zeitfaelle (32/40/68/16 sowie Relativzeit) und vier weitere
Vertraege (194/34/31/64) sind unabhaengig gelesen und uebernommen; ihre
gezielten Belege werden nicht durch identische Wiederholungen ersetzt.
Der zweite regulaere Pflichtlauf44129128160 am Kopf4f451f73 bestaetigt
Browser, Standard-Offlinesuite und isolierte DB-Stufen; in der
Bereichsregression verbleibt genau ein Fehler: `kalender-ics-test.js`.
Gezielt lokal133/134 identisch: die pauschale Pfadsperre trifft Es Wiedergebrauch
des reinen `kalender/zeitzonen.wanduhrZuUtc` fuer amtliche PDF-Uhrzeiten.
Weder persoenliche ICS-Einladungen noch Terminverwaltung sind angebunden.
Die statische Wache erlaubt jetzt ausschliesslich diesen einzelnen Aufruf im
amtlichen Leser; Einladungsimport im selben Leser und Zeithelfer in anderen
Production-Dateien bleiben durch neue Gegenproben gesperrt. Gezielt136/136
gruen, keine Runtime-/CI-Auswahlaenderung. Abschliessende Pflicht-CI weiterhin
erforderlich; beide fehlgeschlagenen Laeufe bleiben erhalten.

Es Aufnahme60526304 samt korrigierter Nutzungsbindung6346e7b5 ist von D
vollstaendig unabhaengig gelesen und ohne Konflikt sequenziell uebernommen;
alle zehn E-Dateiblobs stimmen exakt mit Es abgenommenem Endkopf ueberein.
Die gemeinsame Endkopf-CI ersetzt einen zweiten vollen CI-Plan fuer denselben
unveraenderten Kern. F1252 wird danach getrennt auf gruener Basis integriert.

Integration ausschliesslich durch D, nacheinander, nach unabhaengigem Review
und beiden gruenen Pflichtchecks am jeweiligen Endkopf. Danach regulaeres
Git-Deployment und lesender Nachweis; kein CLI-Deploy oder Productionwrite.
Rueckweg: gezielter Code-Revert nach denselben Regeln; immutable Belege
muessen nicht zurueckgespielt oder geloescht werden.

Der neue rein lesende Productionbeleg von 15:23 UTC bestaetigt weiterhin keinen neuen
regulaeren Verarbeitungsabschluss nach den damaligen Reparaturen. Ein spaeterer
READY-Rollout allein bestaetigt weder neue DIP-Staende noch Mandatsauslieferung.
`process_runs`: null Abschluesse seit PR1251 (13:56:37 UTC);
`helmut_store`: null `main-dipstand-*`-Belege vor dem neuen Rollout.
Lesende Bestandszaehlung 15:32 UTC: 317 DIP-Dokumente, davon 49 mit
Quellfelderversion2 und 37 mit Version1. Altbestand ohne Beleg wird nicht
nachtraeglich aufgewertet. Das ist kein neuer Verarbeitungsabschluss.
Ausschuesse/Tagesordnungen/Termine und ihre neuen Textrechte bleiben Es/Fs
getrennte, noch nicht aktivierte Wege. Keine vollstaendige Quellen-/Verkaufsabnahme.

**Naechster Schritt:** fertigen Integrationskopf unabhaengig pruefen und mit
unveraenderter Pflicht-CI sequenziell integrieren.
