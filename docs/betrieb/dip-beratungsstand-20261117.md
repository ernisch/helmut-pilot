# DIP-Beratungsstand: produktive Verbindung, 17.11.2026

Auftrag und Dateizustaendigkeiten: [#1218](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6951450665).
Basis `2023dfd5` nach PR1249–1251; deren Reparaturen werden nicht wiederholt.
**Historischer Stand 17.11.,23:40UTC: PR1252–1256 regulaer live und lesend bestaetigt.
1254-Produktwirkung echt belegt; 1255/56-Code abgenommen, neue Betriebswirkung
und Kunden-/Rechtsabnahme offen. Kein vollstaendiger Quellen-/Verkaufs-PASS.**

## Regulaerer Morgenlauf 18.11.2026

**Teilweise belegt.** Runtime `b0819bae`, acht echte Quellenfenster von
03:00:12.363 bis 04:49:08.983 UTC. Letzte Queuequittung
`cron-crawl-20261118044523-v3mef`, anschliessender Abdeckungsbericht partial.
40 erfolgreiche Abrufquittungen mit 263 neuen Rohdokumenten laut Abruftelemetrie.
853 Vertagungen an 134 Quellkennungen durch Anbietergrenzen. Die native Queue quittiert heute 42 erledigte Abruf- und 63 erledigte
Dokumentauftraege sowie 59 Endstopps bei Dokumentauftraegen. 633 Abruf- und 758 Dokumentauftraege faellig, keine
aktive Lease. Bei den aktualisierten wartenden Auftraegen ueberwiegen
Anbietergrenzen (113 Abrufe) und offene Artikelkontexte (114 Dokumente).
Weitere Dokumentgrenzen sind fehlende bestaetigte Artikelziele, Fassungen
und Zeitbudgets. Die Rueckstaende sind nach Ursachen getrennt. Fuer den erfolgreichen Start des
regulaeren Tagesablaufs ist keine weitere Motorreparatur belegt.
8 Fenster/2400 Sekunden/6 von 16 Originalen. Um05:26:12UTC Kostenbuch
0,528437/1 USD am Tag, 5,611157/30 USD gebunden kumulativ, eine alte UNKNOWN.

Lageprozess `briefing-lage-20261118050023-2a8p9`: Abschluss05:00:52.950 UTC,
Lageeintrag05:00:52.378 UTC gespeichert. Morgenprozess
`briefing-morning-20261118051530-y87rp`: Abschluss05:15:43.694 UTC,
partial/morgenversorgung-unvollstaendig, null fehlgeschlagene Mandate.
Tagespaket05:15:41.908 UTC, InhaltSHA256
`717c78b07aa0eb080e20c352399c5115dcbfe511233e14dcd0e39d7a8b3eb86b`,
Profilbindung V2 und echte gebundene Morgenquittung05:15:43.239 UTC.
Teilpaket enthaelt quellenversorgung-unvollstaendig und briefing-ohne-tagesanlass.

Echter normaler Betreiber-AppGET05:25:58.935 UTC HTTP200/availabletrue,
666531 Bytes, AntwortSHA256
`effce749b3179e2e148a9bf8e1984c6023d68eb20ed34c8a0f41779c235eea8e`.
Die Lage liefert zwei belegte Pflegeabsätze aus Originalen vom 12.11.
(Destatis) und 05.11. (Bundestag/Gürpinar) sowie elf Karten. Der Renderer verwendet den qualifizierten Radarstand mit
null sichtbaren Signalen. Fuenf technische Rohkandidaten wurden gespeichert,
sie belegen dort keinen neuen Originalinhalt. Das Briefing hat keine
belegte Tagesprioritaet. Angemeldete visuelle Kundenabnahme offen.

Destatis: die gebundene Fassung `rd-635871ad…` zum Industrieenergieverbrauch
wurde03:31:00.346 UTC gespeichert, KO `vg-energieverbrauch-20261116-fa297a`
um04:17:50.806 UTC analysiert. Der App-DTO enthaelt diesen Originalbezug, Auszug
und Attribution, mit Prioritaet Ignorieren. Das Publikationsdatum bleibt16.11.
Keine aktuelle Karten-/Tagesprioritaet fuer diese Fundstelle. Der Katalog
enthaelt weiterhin keinen belegten Publikationsrhythmus.
DIP: zwei neue native Staende ab03:00:55 UTC. Vorgang336986
(Beschlussempfehlung liegt vor, Drucksache21/9247, drei Positionen) und
341809 (Noch nicht beantwortet, Drucksache21/9263, eine Position).
Ihre neuen Staende erscheinen im geprueften Paket in keiner sichtbaren Karte.
Die sichtbare alte Drucksache21/9191 bleibt an Vorgang340926 gebunden, mit
unbekanntem Stand. Null neue Terminstandzeilen, fuenf Wege ohne Q2 inaktiv.

Livebefund: Bei `versorgung.zustand=offen` und `emptyState.kind=gap`
meldet der Kopf "Keine neue Entscheidung". `decorateBriefingFreshness`
verwendet den Hinweis im Detail, aber nicht im Status. Gezielte Reproduktion
am bestehenden Frische-E2E-Test rot fuer volle und kompakte Antwort, danach
70/70 gruen mit [PR1259](https://github.com/ernisch/helmut-pilot/pull/1259).
[D/F/G-Abstimmung](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6970044607).
[Pflichtlauf 44244799628](https://github.com/ernisch/helmut-pilot/actions/runs/44244799628)
completed/success, genau `29c35b78c9ef3419a8a1644702aefab59ec77051`.
Kern134601051517 und Chromium134601051851 gruen, separater Voll-Mock100
planmaessig ausgelassen. Um06:00UTC fehlt die unabhängige Abnahme durch F/G.
Der PR bleibt offen und konfliktfrei. Der bisherige Kopftext ist noch live.
Genau ein naechster Schritt dieses Betriebsschritts: #1259 unabhaengig abnehmen.


Pflichtlauf [44168269981](https://github.com/ernisch/helmut-pilot/actions/runs/44168269981)
ist completed/success, exakt an69e85a3f9e949613c94184f7c7c6a00dbc5a8895
gebunden: Kern134340080967 und Browser134340081326 erfolgreich; voller
Mock100 bewusstskipped. E hat den vollstaendigen21-Dateien-Diff einschliesslich
aller D-Deltas und den getrennten alten Doku-Stand5e568bef
[unabhaengig abgenommen](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6961901035).
Der zum Stand20:50 belegte Endreviewblocker ist damit geschlossen.
PR1254 SHA-gebunden auf `eb75356a2bc74fd5997690fd0c650c2f98897f42` gemergt;
Mainbaum exakt identisch69e85a3f, Es drei Quellblobs unveraendert42909cb0.
Normaler Git-Productionrollout `dpl_7ee7zt4ePwQdiiQqyiLMQ2B2Fcpb` READY,
Alias/Root/Client HTTP200, Versioneb75356a, ClientSHA256
`09d3ec9cca3e1aef2ca181662d624392474e26ada1e7a89b67592ca6d3beb055`.
Kein CLI-Deploy, keine Daten-/Quellenaktivierung oder Retentionausfuehrung.

Echter reiner Betreiber-AppGET21:55:25.953UTC, normaler gespeicherter Pfad:
HTTP200/availabletrue,699460Bytes, AntwortSHA256
`aadb97ca7b0df5d39e1971826111a05909bc2a7da9511287b07a152fb33110f8`.
PaketinhaltHash6ae73360, kompletter gespeicherterNachweis/Paketstatus und beide
Lageabsaetze exakt zum echten Vorabruf19:24 erhalten; AbsatzSHA256
`a12a2a0210f38944244317c4acdddcfae0b39f92fd616e7a2229d950ae910c89`.
Jetzt11 verschachtelte DIP-DTO-Knoten, keine11 neuen Vorgaenge oder Standbelege:
sichtbare Drucksache21/9191 korrekt an amtlichen Vorgang340926/Original gebunden,
Stand/Folgestand/Abrufdatum ausdruecklich unbekannt. Die unbelegte Millionen-
Einordnung der Altersvorsorgekarte ist tatsaechlich entfernt; bestehender
belegter Warum-Fallback und Sachtext erhalten. Diese beiden Produktwirkungen
sind real bestaetigt; kein fingierter Erfolgsdatensatz.

Productionlesung21:55:59UTC: null Abschluesse seit1251, null DIP-/Terminstandzeilen,
keine neue gebundene Destatis-Fassung. Letzter regulaerer Quellenabschluss
weiterhin cron-crawl-20261117044523-onl6r,04:49:09.506UTC,partial. Der09:58-
Zusatzabschluss bleibt davon getrennt. Lage2Absaetze/11Karten, Radarstale,
Briefingempty/keineTagesprioritaet, Paketpartial mit Quellenversorgungs-/
Handlungsbelegluecke; Quittunggebunden, fachlicheVollabnahmefalse. Kein
Parlamentskontext aus denfuenf rechtlichinaktivenE-Wegen. Kein neuer
Verarbeitungsabschluss oder angemeldeter visueller Kunden-/Fachnachweis.
Ungekuerzte Antworten bleiben privat ausserhalbGit; keine Secrets im Bericht.


Berliner Tageswechsel separat kontrolliert, noch VOR1255: reiner normaler
AppGET17Nov23:03:05.658UTC (=18Nov00:03Berlin),HTTP200/availablefalse,
Paketstatusfehlt, null Lageabsaetze/Karten und Radarsignale, kein Pakethash.
AntwortSHA256 `7474263c46b837a05204eb816c581474697ea9f349fa7e51b1ad7a52b1aee031`.
Kundenstart ruft denselben Leser auf und uebernimmt diesen ehrlichen fehlenden
Tagesstatus. Eine spaetere leere Anzeige nach1255 beweist deshalb keine
Radar-/Fristwirkung; dafuer fehlt das neue regulaere Tagespaket. Kein
Tageslauf oder kuenstliches Paket zum Erzeugen eines positiven Nachweises.

### Verbleibender Bedarf des geprueften Bundestagspiloten

| Bereich | Tatsaechlicher Rest | Kleinster zulaessiger Abschluss |
| --- | --- | --- |
| DIP-Beratungsstaende | Anschluss bis normalem App-GET wirkt, aber null gespeicherte neue Staende; aktueller Stand unbekannt | Naechsten ohnehin stattfindenden regulaeren DIP-Abschluss bis Original/Stand/Anzeige abnehmen; keinen Zusatzlauf starten. |
| Destatis | PR1249–1251 erledigt; neue gebundene16Nov-Fassung noch ohne Speicherung/Analyse/Ausgabe. Realkatalog needs_review/auto/expected_frequencyNULL; C-02-Code korrigiert | Belegten Publikationsrhythmus klaeren, keine daily-Fixture uebernehmen; Wirkung im naechsten regulaeren Abschluss pruefen. Keine erneute Reparatur ohne neuen Fehler. |
| Arbeit/Soziales | Originale/Parser/Produktleser vorhanden; neuer Weg ohne Q2-Recht inaktiv, Nummer44/45 bleibt Konflikt | Konkrete externe Nutzungsfreigabe fuer benoetigte Fakten/Archiv-/Ausgabeform; erst danach eng freigegebene Aktivierung und regulaerer Nachweis. |
| Wirtschaft/Energie und Digitales | Stellvertretungen getrennt angebunden; Wege ohne Q2-Recht inaktiv, Digitalfrist11Nov historisch | Dieselbe konkrete Q2-Entscheidung; keine persoenliche Frist oder Mitgliedschaft erfinden. |
| Plenum/Sitzungswochen | Vier Beginne/ICS-Ende und unbekannte Einzel-TOP-Zuordnung technisch erhalten, beide Wege rechtlich inaktiv | Q2-Entscheidung und danach regulaere Aufnahme; Wochenplan nicht als individueller Termin ausgeben. |
| Ressorts/Region/ergaenzende Medien | Elf ausgegebene Dokumentkanten und Kernaussagen abgeglichen, keine vollstaendige aktuelle Fach-/Regionalabdeckung; konkrete BMAS/BMG-/Medienarchivrechte offen | Vorhandenen erlaubten Umfang und reale neue Betriebsbelege nutzen; weitere benoetigte Nutzung einzeln durch Q3/Q4 entscheiden lassen. |
| Lage/Radar/Briefing und zahlender Kunde | Echte Teilanzeige, kein neuer Handlungs-/Radarbeleg, keine angemeldete visuelle Abnahme; Fs externe Anbieter-/Vertrags-/Datenschutzentscheidungen offen | Keine Prioritaeten fuellen. Reale Folgeausgabe fachlich abnehmen; Rechtsentscheidungen gemaess F-Dossier durch Verantwortliche treffen lassen. |

D bleibt alleiniger Integrator und exklusiver Autor von CURRENT_STATE und diesem
Dossier. [G-Zuschnitt bestaetigt22:03](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6962281586):
G bearbeitet die zwei vom Betreiber benannten Fachkorrekturen zur Radar-Neuigkeit
und abgelaufenen Briefing-Schlusszeit. Fehlerbelege/gezielte Pruefungen liegen vor;
Ds Codeendabnahme zu b987a0c6 und beide exakten Pflichtchecks sind gruen;
PR1255 ist integriert und sein regulaerer Rollout lesend bestaetigt. G besitzt exklusiv briefing-bereichsvertrag.js,
briefing-fristbeleg.js, briefing-orientierung.js, tagespaket-auslieferung.js und
die bestehenden Bereichsvertrag-/Tagespakettests sowie den bestehenden Radar-
Einzelartikel-Titelbindungstest (6962321699) und Lage-Radar-Zusatznutzentest
(6962544954) sowie Radar-Zusammenfassung-/Ursprungstests (6963118407);
Dieser Zuschnitt ist abgeschlossen; weitere notwendige Pfade vorher neu abgleichen.
D schreibt dort nicht und uebernimmt unabhaengiges Review/Integration.
E bestaetigt im eigenen Quellenbereich keinen weiteren notwendigen Codefehler.
Der reine Statusabschluss wird nach gemeinsamer Integration zusammengefuehrt;
keine Runtime, Konfiguration, Daten, Rechteflags oder neuen Tests dadurch.


### Gemeinsame Fachkorrektur mit G: integriert, Betriebswirkung am neuen Tagespaket offen

PR1255, eingefrorener2584d747 gegen eb75356a: D hat den vollstaendigen
acht-Dateien-Diff und Producer-/Paket-/Client-Aufruferkontext gelesen.
Gs bereits gruene gezielte Suiten werden uebernommen. D fuehrte nur zwei
kleine isolierte Gegenproben ueber scripts/lokal.js mit deklarierten
Fiktiveingaben aus; keine Quellen-, Modell-, Datenbank- oder Productionaktion.
Vier konkrete Blocker wurden G zur Korrektur uebergeben:

- 1.000Euro/1000Euro wird faelschlich als neuer Wert gewertet.
- Ein ausdruecklich unklarer Beschluss wird durch das Wort beschlossen positiv.
- ISO-Schlusszeit mit widersprechender weiterer Uhrzeit wird eindeutig ausgegeben.
- Unbekanntes PST sperrt, kleingeschriebenes pst wird faelschlich Berliner Zeit.

Die getrennte Publikationsdatum-only-Gegenprobe blieb korrektnull; kein Befund
daraus. [Erste drei Faelle](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6962725449),
[Zeit-Schreibweise](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6962783788).
Erstlauf44188519620 auf2584 beendet/FAILURE: Browser gruen, Standard-/DB-Stufen
gruen; Bereichsregression genau radar-zusammenfassung-bestand-test.js und
radar-ursprung-test.js. D hat die Fehlerannotationen nur gelesen; G bestaetigt
die alten synthetischen Titel-/Zaehlpositiven gezielt rot. Beide Testdateien
sind G zusaetzlich zugeordnet, vorhandene Schutzassertions bleiben. Die vier
Codekorrekturen liegen laut G lokalcf72d5ae vor, fuenf gezielte Suiten gruen;
Der gemeinsame c055-Nachtrag schliesst diese vier Faelle, fuehrt aber eine
IST/Satzwortkollision ein: case-insensitives ist wird als deutscher Anschluss
angenommen. D bestaetigte genau IST/ist einmal lokal, keine Suitekopie.
Lauf44192744427 wurde daraufhin als ueberholt sicher beendet (completed/cancelled),
bevor der Kopf wechselte; daraus kein Erfolg. Letzter b987-Delta schliesst
diese Kollision konservativ und erhaelt die BerlinerZeit-Positive.
D hat alle notwendigen Enddeltas vollstaendig nachabgenommen:
[Codeabnahme6963346267](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6963346267).
Exakt b987a0c6ab042867dbc9928762eae372d98bbe70, genau zehn abgestimmteDateien,
keine offenen Codebefunde. Pflichtlauf44193840298 completed/success auf genau
diesemKopf: Kern134429930794 und Browserpflichtjob134429931289 erfolgreich.
Browserausfuehrung laut unveraendertem Plan bewusstskipped; unveraenderte
Client-/Browserbelege wiederverwendet, vollerMock100 ebenfalls bewusstskipped.
PR1255 SHA-gebunden auf `02f5680d93ac25d8ecc30b471e35136fa12756dc` integriert,
Mainbaum exakt b987. Normaler Gitrollout `dpl_6BzKc8ys9JbDDJBzkWKF4PJ4LVRZ`
READY, Alias/Root/ClientHTTP200, Version02f5680d, ClientSHA09d3ec9c unveraendert.
Echter normaler AppGET23:26:36.381UTC: HTTP200/availablefalse,3574Bytes,
AntwortSHA256 `313436e358ebfd4a6050b84fe7f6c89e5f860747bdcc1c5a25f84c21f8357f0d`.
Der Tagesstand18Nov fehlt wie VOR1255; null Absatz/Karte/Signal, kein Pakethash.
Kein positiver G-Funktionsnachweis aus der Leere. Regulaerer Original- und
Kundenausgabebeleg bleibt offen. Keine Zusatzlaeufe oder Datenwrites.


### C-02: artikelbezogene Fachabdeckung integriert, Betriebsbeleg offen

G hat [6962664646](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6962664646)
mit den realen Fachpaketvertraegen und einer synthetischen Insolvenzenmeldung
isoliert reproduziert: Ein geteilter amtlicher RSS-Weg bestaetigt Wirtschaft
UND Digitales als fachlich belegt, obwohl der gelesene Inhalt nur Wirtschaft
traegt. Der bestehende Rechner prueft Dokumentqualitaet global je Abrufweg,
uebernimmt dessen Rollen/Klassen dann fuer jedes verknuepfte Paket. Das ist
von der separat fehlenden realen Digitalversorgung zu trennen.
Nach1255-Rollout [zwei Dateien exklusiv G](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6964068458):
quellenarchitektur/abdeckungspruefung.js und scripts/abdeckungspruefung-test.js.
D hat den vollstaendigen Zwei-Dateien-Diff, die echten Verwaltungs-/Cron-Aufrufer,
relationalen Projektionen, Fachbegriffe, Frische und unveraenderten Rechtssperren
unabhaengig geprueft. [Endabnahme f3a6a29](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6964278008).
G-Belege33/33 Abdeckung,16/16 Betriebsabdeckung,18/18 Cron,17/17 EUR-Lex
wiederverwendet, keine Suitekopie. Vier gezielte zusaetzliche G-Faelle durch den
wirklichen buildBetriebsabdeckung-Wrapper mit buildFullModel-Sollstruktur:
Wirtschaft allein1/0, alter Digitalauszug1/0, beide frisch1/1, fehlender
Publikationsrhythmus0/0 bei jeweils technisch1/1. Explizit synthetische
Eingaben; daily in den Positiven ist KEIN bestaetigter Productionvorwert.
[Tatsaechliche Nachweisgrenzen](https://github.com/ernisch/helmut-pilot/issues/1218#issuecomment-6964186179).

Pflichtlauf [44200124055](https://github.com/ernisch/helmut-pilot/actions/runs/44200124055)
completed/success exakt f3a6a29a7bf9cd06fd7de554d10ef3d4fac409ac:
Kern134451742404 und Browserpflicht134451743015 erfolgreich; Browserausfuehrung
und vollerMock100 planmaessig skipped. Kein neuer Browser-/Produktnachweis.
PR1256 SHA-gebunden auf `b0819baec6713c668097fd1edbe09c5a5d4ea508` gemergt;
regulaeres Git-Deployment `dpl_CCLXt4wfrDYMjCyqhiMqGrGhyjRu` READY,
oeffentlicher Alias/Root/Client HTTP200, Versionb0819bae und ClientSHA09d3ec9c
unveraendert. Keine Katalog-/Paket-/Rechteaktivierung oder neue Taxonomie.
Normaler AppGET23:40:41.013UTC HTTP200/availablefalse,3574Bytes, Tagespaket18Nov
weiterhin fehlt. AntwortSHA256
`d0fbefe7588564b7504c1578c3450f28568dbc59008ee56a70c333eb4d14bbcc`.
Leere Antwort ist kein positiver C-02-, Radar- oder Fristwirkungsnachweis.

Native Schlusslesung23:40:47UTC: ueberhaupt null abgeschlossene process_runs
seit1251/13:56:37UTC und null offene Prozesse, null DIP-/Terminstandzeilen,
null neue gebundene Destatis-Fassung. Realer Destatis-Katalog unveraendert
needs_review/auto/expected_frequencyNULL. Deshalb ist auch bei einem kuenftigen
Abruf ohne belegten Publikationsrhythmus keine positive Frischeabnahme moeglich.
Benoetigten echten Rhythmus fachlich belegen; keine stille Konfiguration aus
Fiktivnachweisen. Der nachgelagerte alte quellen-abdeckung-Eintrag04:49:10.033UTC
ist kein neuer Quellen-/Verarbeitungsabschluss nach dem Quellenparent04:49:09.506.
C-02-Codefehler geschlossen; seine Wirkung an neuer regulaerer Betriebsbilanz
bleibt offen. Keine weiteren konkret nachgewiesenen notwendigen Codefehler
nach diesen unabhaengigen Endabnahmen; das beweist keine Vollversorgung.

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
Gepruefte Absatztexte, Reihenfolge, Empfehlungen, Originalpaket und Hash-/Quittungsobjekte
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

Weiterer enger Fachbefund im echten Apppayload: die Altersvorsorgekarte
nennt in `whyRelevant` Millionen gefoerderte Vertraege. Weder der gespeicherte
269-Zeichen-Auszug (`rd-7335dc85`, MD5 `3d3f99a0f92e4234aa7e390d077fd988`)
noch der einzeln rein lesend geoeffnete amtliche
[Originalartikel](https://www.bundesregierung.de/breg-de/aktuelles/reform-private-altersvorsorge-2400072)
belegen diese Menge. Der Originalartikel bestaetigt den Fortbestand alter
Riester-Vertraege. Keine neue Archivierung oder Verarbeitung des Artikels.
Die bestehende Kartenwache liess nach irgendeinem vorhandenen Auszug alle
KO-Einordnungen durch. Begrenzte neue Wache entfernt unbelegte sprachliche
Groessenordnungen aus `whyRelevant` und seinem alten Warum-Fallback,
auch in der Ausgabekopie des normalen gespeicherten Apppakets. Nur dessen
tatsaechlich angezeigte Original-URLs duerfen sie belegen; keine neue Quelle,
keine Aenderung gepruefter Lageabsaetze, Prioritaeten oder gespeicherter Pakete.
Gueltiger alter Warum-Fallback bleibt erhalten. Das ist keine allgemeine
semantische Faktenpruefung. Erste gezielte Gegenprobe rot, nach Korrektur
Artikelkontext14/14 und parlamentarischer Produktpfad17/17 lokal gruen.
Endreview/exakte Pflicht-CI und Productionwirkung auch dieses Deltas offen.
Unveraenderter Zwischenkopf f4128b89 wird bis Ende seines Pflichtlaufs nicht
ueberschrieben; der kleine Nachtrag liegt zunaechst auf separatem D-Branch.

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

**Genau ein naechster Schritt:** Die konkrete Q2-Nutzungsfreigabe fuer die
fuenf inaktiven Parlamentswege anhand des bestehenden
[Freigabedossiers](../recht/verkaufsblocker-f-20261117.md) entscheiden lassen.
Bis dahin bleiben diese Wege inaktiv; regulaere Betriebsbelege und angemeldete
fachliche Kundenabnahme bleiben eigenstaendige offene Abnahmekriterien.
