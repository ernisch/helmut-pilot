# Globale Inhaltsversorgung — 09.11.2026

Status: **Teilweise abgeschlossen: technischer Anschluss geprueft, begrenzte Produktionsvorlage vorbereitet; genehmigte NDR-Einzelprobe am Codex-Direkttransport gescheitert, Original und Anbietererweiterung offen**. Dieser Bericht betrifft
den allgemeinen Anschluss nach PR1104, PR1110 und PR1113. Die abgeschlossene
erste Aktivierung und ihr eigener regulaerer Wirkungsnachweis stehen in
[quellenabschluss-20261109.md](quellenabschluss-20261109.md). Sie werden hier
nicht erneut als Entwicklungsarbeit oder Wirkung dieses Sprints ausgegeben.

## Auftrag und Grenzen

Zugaenglicher, freigegebener Originalinhalt soll ueber den gemeinsamen Motor
bis zu Lage und Briefing gelangen. Alle zulaessigen Profile verwenden denselben
Weg. Kurze Titel und begrenzte Artikeleinstiege beweisen keine Unpassendheit.
Nicht gelesene Dokumente bleiben von verstandenen Inhalten unterscheidbar.

Keine neuen Modellaufrufe, Originalabrufe ohne Einzelfreigabe, manuelle
Verarbeitung, Backfills, Produktivdatenaenderungen, Aktivierungen, Merges nach `main` oder
Deployments in diesem Entwicklungssprint. Keine neue Infrastruktur. Die Zahl
500 bezeichnet eine beispielhafte Artikelmenge, keinen Lasttestauftrag.
Die nachfolgend dokumentierten zwei Anbieter-Metadaten-RPCs wurden fuer die
eine NDR-Probe gesondert genehmigt und ausgefuehrt; keine Fachdatenmutation.

## Ausgangsbelege und aktueller Rolloutstand

- `main` beim Sprintstart: `e8a4b08bf14609a02831a0f6e5b6c9c5caa28824`.
  Parallel wurde Buero-PR1111 am 09.11.2026 um 11:55:54 UTC gemergt;
  Runtime-Merge: `fe38a3710caa18f0a020825747c04c7d4f2c198a`.
  Aktueller `main`: `279b00fc5630ffa867dfafe8977349a7b8179049`,
  anschliessende reine Buero-Abschlussdokumentation ohne Runtimeaenderung.
- Production am 09.11.2026 um 12:07 UTC lesend bestaetigt:
  `fe38a3710caa18f0a020825747c04c7d4f2c198a`,
  Vercel `dpl_2t9f7tXNuNePv4Ng5GjTStFWo8Vd`, READY und Productionalias.
  Dieser Buero-Stand ist die neue Rueckwegbasis vor einem spaeteren PR1115-Rollout.
  Die zuvor aktive PR1113-Runtime
  `4d11ad63e2ae856110bcd579b5540f58557b5a26` mit
  `dpl_ExYN3YCQc8omWzfXWsgqxCVd6vVo` bleibt historischer Ausgangsbeleg.
  Der parallele Rollout war keine Productionaktion dieses Sprints.
- Bestaetigter Production-Envlesestand vor dem parallelen Rollout:
  `HELMUT_ARTIKELKONTEXT=on`,
  `HELMUT_SUCHWEGAUSZUEGE_HOSTS=www.dgb.de,www.radio-hannover.de`,
  `HELMUT_ANBIETER_STEUERUNG=on`. Der alte Schalter
  `HELMUT_SUCHWEGAUSZUEGE` fehlt. Keine Anbieterlimit-Overrides.
- Kostenvertrag: 1 USD je UTC-Tag, 30 USD kumulativ; Azure `gpt-5-mini-eu`.
  Vertragshash `8c98b2e18ee5dc21c73561bbf5bad2d8cb6c76f8ccd533b3153270bbd7d9a348`.
  Lesestand: 1,172642 USD gebunden, 54 Eintraege, nicht eingefroren.
- Ein aktives, vertraglich gebundenes Bestandsprofil. Keine Profilmutation.
  Exakte und Teilzeichenfolgensuche in relationaler Profilkennung, Name und
  Namensvarianten ergab **keinen belegten Treffer fuer „Jam“**. Keine
  Gleichsetzung mit einem anderen Profil.

## Vollstaendige Auswertung der erhaltenen Laufdaten

Ausgewaehlter abgeschlossener regulaerer Lauf:
`crawl-20261109040047-b756z`, aeusserer Cron
`cron-crawl-20261109040046-oufxt`, Runtime
`954358fe872d73b71b0d0911d66007a5cf80428c`.
Beobachtungsfenster: 09.11.2026, 04:00:46 bis 04:03:09 UTC.
**Originalnachladen war in diesem Lauf noch aus.** Dieser Lauf beweist keine
Wirkung der spaeteren PR1113-Aktivierung.

Die Auswertung umfasst jede der noch zuordenbaren 740 Rohzeilen, alle 744
Fundstellen im Fenster, die zugeordneten KO-Verknuepfungen und den erhaltenen
Legacy-Ring. Sie wurde ausschliesslich lesend ausgefuehrt. Die Zuordnung
erfolgt ueber das enge Zeitfenster: Rohdokumente/Fundstellen besitzen hier
keine gespeicherte `run_id`. Sie ist kein nachtraeglich erfundenes Laufmanifest.

| Beleg | Erhaltener Stand | Aussagegrenze |
| --- | ---: | --- |
| Abrufwege | 152, davon 151 erfolgreich | Transportstatus beweist keinen Artikeltext |
| Eingangszaehler | 1.788 geladen, 1.012 Kandidaten | Vollstaendige urspruengliche Eingangsmenge nicht mehr rekonstruierbar |
| Laufbilanz | 776 verworfen, 800 gespeichert, 212 Dubletten | In-Lauf-Deduplizierung und vorhandene Mengengrenze; kein Relevanzurteil |
| Neue Rohzeilen im Fenster | 103 | Laufzaehler nennt 102; Abweichung bleibt offen |
| Fundstellen | 744 zu 739 Dokumenten | Plus eine neue Rohzeile ohne Fundstelle ergibt 740 untersuchte Dokumente |
| Legacy-Ring | 600 Zeilen, davon 101 im Fenster | Ring ersetzt kein vollstaendiges Eingangsarchiv |
| Nichtleere Zusammenfassung | 10 von 740 | Feldfuellung ist kein Qualitaetsnachweis |
| Bestehendes Inhaltskriterium erfuellt | 8 von 740 | Deterministisches Codepraedikat, keine Abnahme des Vollartikels |
| Vorlaeufig moeglicher Profilbezug | 240, davon 235 ohne erfuelltes Inhaltskriterium | Aktuelle isolierte Praedikatsauswertung, keine historische Modellentscheidung |
| Ohne KO-Verknuepfung | 459 | Kein Beweis, dass diese Meldungen fachlich relevant waren |
| Mindestens ein complete-KO verknuepft | 193 | Historischer/aktueller Speicherstand, kein Beleg der Lektuere in diesem Lauf |
| Pending ohne complete-KO | 85 | Rueckstand, keine Erfolgsmenge |
| Nur failed-KO verknuepft | 3 | Bestehender Fehlerstand |

Die anderen 500 Dokumente ohne vorlaeufig positiven Profilbezug sind
**nicht nachgewiesen unpassend**. Insbesondere kurze Titel reichen nicht fuer
diesen Schluss. Bei den 103 neuen Zeilen erfuellen zwei das bestehende
Inhaltskriterium, 101 nicht; 100 besitzen keine KO-Verknuepfung.

Quellentypen der 740 Zeilen: 383 `committee`, 139 `party`, 90 `media`,
55 `ministry`, 40 `bundestag`, 27 `association`, zwei `person`, vier ohne Typ.
736 Zeilen haben einen direkten Link, vier keine URL. Die Klassifikation
belegt damit Bedarf jenseits zweier Medienhosts, aber weder deren
Erreichbarkeit noch eine pauschale Anbieterfreigabe.

Alle zehn nichtleeren Zusammenfassungen wurden einzeln gelesen: sieben
enthalten sachhaltige RSS-/Artikelpassagen, eine BMZ-Passage ist nur ein
kurzer Satz-/Textausschnitt, eine weitere wiederholt den Titel, eine alte
Bundestagszeile ist eine abgeschnittene Anhoerungsliste. Auch die sieben
sachhaltigen Passagen sind kein Nachweis vollstaendiger Originallektuerung.

Native Understanding-Telemetrie: 25 Dokumente, 19 Cluster, 18 verarbeitet,
ein Cluster vertagt, sechs Dokumente ohne Endzustand. Ergebnisse: sechs
`saved`, ein `merged`, ein `updated`, acht `duplicate`, zwei
`skipped-failed`. **Historische genaue Modelleingaben liegen nicht vor.**
Diese Statuszahlen werden nicht als nachgewiesene inhaltliche Lektuere oder
korrekte Modellbefolgung ausgegeben. Die 1.174 zugeordneten KO-Zeilen sind
historische/aktuelle Bestandsobjekte, keine 1.174 Verarbeitungen dieses Laufs.

Der globale Artikelbelegspeicher enthielt zum Lesestand nur einen Eintrag
mit Zustand `luecke`, keinen abgeschlossenen positiven Originalbeleg.
Drei DGB-Dokumente des Fensters sind vorlaeufig moeglich, ohne Auszug und
ohne KO-Verknuepfung; eines davon ist die vorhandene Gebaeudereinigungsprobe.
Radio Hannover besitzt in diesem Fenster keine Fundstelle. Die vorhandene
Radio-Originalprobe bleibt ein isoliertes Vertragsbeispiel.

### Vertrauliche Belegbindung

Die Rohsnapshots bleiben ausserhalb Git unter
`/workspace/helmut-globalanalyse-20261109` (Verzeichnis 0700, Dateien 0600).
Keine Profilinhalte oder vollstaendigen Rohdaten werden in den PR kopiert.

| Datei | Bytes | SHA256 |
| --- | ---: | --- |
| `eingaenge.PRIVATE.json` | 3019244 | `eacbb675926867b10f51ef1c2e7deb99dc89358b613b000c346aa943723e56c0` |
| `profil.PRIVATE.json` | 5614 | `c0ba37bbf363efbd0f432feed1a39a922b9a7d0abf636f1e1e6bc5e76c226efb` |
| `klassifikation.PRIVATE.json` | 746499 | `a7092b3e5d36acaff0b68029fa08cec9c45627ea96681b5f6e3b55a5c55b5542` |
| `ko-status.PRIVATE.json` | 300019 | `c4930919ad10fb2a3721f257a0716a4d6908d877a13cbbfafabe0da8bc28c98f` |

## Warteschlangenbestand vor einer spaeteren Aktivierung

Die lesende Aggregatabfrage am 09.11.2026 ergab ausschliesslich `erledigt`:
13.641 `source_fetch`, 2.758 `document_understanding`, 3.155
`mandate_projection`, 3.155 `briefing_materialization`. Neueste Auftraege:
16.09.2026. Keine offenen oder reservierten Auftraege, keine aktiven Leases.
Damit ist aktuell kein offener Altbestand zu neutralisieren. Vor der
tatsaechlichen Aktivierung erneut lesend pruefen; dieser Snapshot ist keine
Freigabe zur Veraenderung oder Neuverarbeitung alter Auftraege.

## Anbietererweiterung: genehmigte Einzelprobe am Codex-Direkttransport gescheitert

Im untersuchten Bestand liegen zehn NDR-Dokumente. Der bereits benannte
Arbeits-/Regionaltreffer mit knappem Titel wird durch das vorlaeufige
Praedikat nicht positiv erkannt:

`https://www.ndr.de/nachrichten/niedersachsen/hannover_weser-leinegebiet/autozulieferer-bayrak-stellt-produktion-ein-270-jobs-betroffen,aktuellhannover-3630.html`

Gespeicherte Kennung:
`rd-6b0bc6cca3ac139f38bd2dc83e1f8ee843500c27dca95b3e23fcc00d32dda38b`.
Kein vorhandenes Original-HTML fuer diese Parserpruefung gefunden.
Der Betreiber genehmigte genau einen HTTPS-GET aus Codex mit maximal
20 Sekunden und 1 MiB, bestehendem DNS-/IP-/TLS-/Anbieter-/Quellenschutz,
ohne Weiterleitung, Proxy, Wiederholung oder Modellaufruf.

Die urspruengliche schreibfreie Einzelvorlage war unvollstaendig:
Der bestehende Abrufpfad reserviert vor HTTP atomar beim Anbieter und meldet
anschliessend den Ausgang in Production. Deshalb wurde zunaechst vor RPC/HTTP
gestoppt. Der Betreiber hat danach die exakt benoetigten zwei
Anbieter-Metadaten-RPCs ausdruecklich genehmigt. Diese Blockade ist behoben;
weder die GET-Freigabe noch die Metadatenausnahme werden erneut angefragt.

### Tatsaechliche Ausfuehrung und Nachlesung am 09.11.2026

Der private einmalige Aufrufer verwendete den unveraenderten
`crawler.fetchUrl` auf Kopf `2bb4bacc7e12ec00ffb74cec392bb668bb2eb8d0`.
Der bestehende Adapter erhielt ausschliesslich die echte zuvor nativ erteilte,
an Projekt, URL, Kopf und Parameter gebundene Reservierungsquittung;
keine behauptete Freigabe und kein lokaler Ersatzzaehler. Ein privater
Einmalmarker und Frischepruefung verhinderten die Wiederverwendung.
Der HTTPS-Weg blieb direkt mit `agent:false`, bestehender DNS-/IP-Pruefung,
TLS-Verifikation, 20-Sekunden-Abbruch und 1-MiB-Grenze. Die native
Ergebnisrueckmeldung wurde erst nach dem beobachteten Ausgang ausgefuehrt.

| Schritt | Beobachteter Beleg |
| --- | --- |
| Vorpruefung | Anbietersteuerung an, keine Anbieterlimit-Overrides; native Vorwerte um 12:23:50 UTC ohne NDR-Zeilen |
| Atomare Reservierung | 12:27:16.515379 UTC, `erlaubt=true`, Minutenverbrauch 1, Tagesverbrauch 0 |
| Einziger GET-Aufruf | Codex, Node 24, 12:27:22.832 bis 12:27:23.180 UTC; gemessener innerer Abruf 253 ms |
| DNS | Bestehende IPv4-All-Pruefung lieferte die oeffentliche Adresse `23.40.216.229` |
| Transport | `ECONNREFUSED` beim Verbindungsversuch zu `23.40.216.229:443`; keine erfolgreiche TCP-Verbindung, kein TLS-Aufbau, keine HTTP-Antwort |
| Ergebnisrueckmeldung | 12:28:00.9309 UTC, genau eine native Meldung mit `ok=false` nach bestehender Fehlerklassifikation |
| Native Nachlesung | 12:28:06 UTC: Minutenverbrauch 1; Schutzschalter `zu`, `fehler_folge=1`, Erfolge 0, `offen_bis=null` |

Damit ist **genau ein direkter GET-Versuch verbraucht**; keine Wiederholung,
kein Proxy, kein Redirect, kein Originalbody und keine Parserausfuehrung.
Der Befund betrifft ausschliesslich diesen Codex-Direkttransport. Er beweist
keinen NDR-Betriebsausfall und keinen Fehler der Vercel-Productionruntime.
Die tatsaechliche Ursache der Verbindungsverweigerung ist damit nicht belegt.
NDR-Transport aus Production, Originaltext, Extraktion und Artikelbindung
bleiben unbekannt. Ohne Originalantwort ist kein weiterer Parserfix begruendet.

### Exakter verbrauchter Mutationsumfang

Ausgefuehrt wurden genau zwei genehmigte Anbieter-Metadaten-RPCs fuer
`quelle|www.ndr.de|quellenabruf`:

1. `helmut_anbieter_reserviere` mit `p_menge=1`, `p_grenze_minute=60`,
   `p_grenze_tag=0` und dem genannten `p_schluessel`.
2. `helmut_anbieter_melde` fuer denselben Schluessel mit `p_ok=false`,
   `p_schwelle=5`, `p_offen_ms=60000`, `p_erholung=2` und dem beobachteten
   technischen Verbindungsfehler als `p_grund`.

Betroffen waren die aktuelle Minutenzeile in `helmut_anbieter_fenster`
und dieser Schluessel in `helmut_anbieter_schutzschalter`; kein Tagesfenster.
Verbrauch und Fehlerstand bleiben erhalten, ohne Zuruecksetzen oder Loeschen.
Die bestehenden Zeitfenster und Schutzschalterregeln gelten weiter.
Artikelcache, Rohdokumente, Fundstellen, KOs, Profile und Modellkostenbuch
wurden nicht veraendert. Keine Flags, Hostfreigabe, Queuearbeit, Modelle,
manuelle Verarbeitung, Merges nach `main` oder Deployments aus dieser Probe.

Die privaten Belege liegen ausserhalb Git in
`/workspace/helmut-globalanalyse-20261109` (Verzeichnis 0700, Dateien 0600):

| Datei | Bytes | SHA256 |
| --- | ---: | --- |
| `ndr-reservierung.json` | 1500 | `ce00b5f399dac9e89d910b3a70c843c2af0f9d8d4935c838da70f30493f3d795` |
| `ndr-einzelabruf-ergebnis.json` | 1230 | `74e8cefb670af35e2f3315444989e90992b45a5b33aedc1bc6e57e34d97c0bd3` |
| `ndr-anbieter-meldung.json` | 783 | `479be8ed0f233ebb58b270347e7f22a991fba47a06615b641f26b00d53411832` |
| `ndr-anbieter-nachwert.json` | 1266 | `645cbb2280f8a4774614dd6248b8ff4984f1376ed462a57358e22a2d0acc2456` |

Der gepruefte allgemeine Anschluss bleibt weiterverwendbar. Ein positiver
Nachweis muesste Transport, erhaltenen Originaltext und korrekte Artikelbindung
getrennt belegen; ein einzelner Artikel waere keine Gesamtabnahme.
Die bisherige direkte Probe erlaubt keinen weiteren Originalabruf.
NDRs Vertrauensklassifikation ist keine Originalabruf-Hostfreigabe.
NDR bleibt ausserhalb des folgenden begrenzten Produktionspakets.

### Verbleibender Nachweis mit dem vorhandenen Betrieb

Die bereits beauftragte lesende Nachkontrolle des naechsten regulaeren
Quellenlaufs kann den vorhandenen Vercel-Inhaltsweg fuer tatsaechlich gelieferte
DGB-/Radio-Belege pruefen. Ein Erfolg fuer diese Hosts ist kein NDR-Nachweis.
Der produktive Modus `provider-einzelprobe` ist der alte feste Azure-Modelltest,
kein allgemeiner Artikelabruf. Die Radio-Diagnosetechnik aus PR1109 bleibt
ungemergt und ausdruecklich zurueckgestellt; sie wird nicht reaktiviert.
Eine Versorgung von NDR ueber den regulaeren vorhandenen Motor braeuchte eine
gesondert benannte Hostaufnahme und einen danach tatsaechlich beobachteten
regulaeren Originalabruf. Beides ist durch diese verbrauchte Codex-Einzelprobe
nicht freigegeben und nicht Teil der 15-Env-Vorlage. Keine neue Route,
Proxytechnik, Infrastruktur oder manuelle Verarbeitung wird vorbereitet.

## Umgesetzter Anschluss

Die bestehenden Quellenauftraege bewahren alle bereits geladenen Fundstellen,
auch ausserhalb der unmittelbaren Kandidatenauswahl. Rohzeilen und Fundstellen
werden im vorhandenen relationalen Speicher gebuendelt bestaetigt. Ein
Enqueuefehler nach erfolgreicher Persistenz verliert beim naechsten Versuch
keine IDs. Leere RSS-Zeilen koennen nachgelieferten echten Text aufnehmen:
identische Quelle/Publikation, CAS auf den gelesenen Stand, kein Ueberschreiben
vorhandener Texte oder Abrufzeiten. Im selben Batch gewinnt bei identischem
Schutzrang die ganze texttragende Zeile, ohne Metadaten zu vermischen.

Der vorhandene Queueplan nimmt taeglich rotierend hoechstens fuenf Pending-KOs
mit je hoechstens 40 Quellen auf. Das ist ein begrenzter Altbestandseingang,
kein Backfill. Die spaetere Vorbereitung prueft jede Fundstelle erneut gegen
den heutigen Quellenplan aller aktiven Profile, einschliesslich persoenlicher
Quellen. Fehlende/gesperrte Bindungen erhalten keinen Modellzugang.

Ein Inhaltsauftrag liest hoechstens 200 Dokumente und verwendet denselben
globalen Originalbelegcache. Bereits positive oder negative Cachequittungen
verbrauchen keine neuen Kandidatenplaetze. Verbleibende Kandidaten werden
rotiert und bleiben als bestehende Pendingtraeger beziehungsweise Jobrest
erhalten. Hoechstens 20 neue Kandidaten, davon drei unklare, und zwei neue
Originalversuche je Dienstexemplar bleiben die Codegrenzen.
**Mit dem Queueanschluss gilt dieses Zweierkontingent je Verstehensauftrag,
nicht mehr als Obergrenze des gesamten taeglichen Quellenlaufs.** Mehrere
Auftraege/Fortsetzungen koennen somit mehr Originale versorgen. Keine Aussage
„zwei pro Tag“ oder unveraenderter Gesamtabrufmenge ist zulaessig.

Mehrere gebundene Originalbelege erreichen gemeinsam den vorhandenen
Understanding-Prompt, weiterhin hoechstens zwoelf Quellen. Fehlende Originale
blockieren im Queuepfad nicht die bereits belegten Artikel desselben Vorgangs.
Tatsaechlich an das Modell gesendete Quellen bei bestaetigter Speicherung tragen
innerhalb der vorhandenen KO-JSONB-Herkunftsablage einen integritaets- und
quellenstandgebundenen Lektuerebeleg. Dieser wird atomar mit dem KO gespeichert,
gilt global ueber verschiedene Queueauftraege und ersetzt keine historischen
Belege. Eine Verknuepfung oder `complete` allein beweist keine Lektuere.
Dokument 13 bleibt Rest; ein spaeterer gebundener Update darf es innerhalb der
unveraenderten Zwoelfergrenze lesen. Der Job bestaetigt seinen Rest im bestehenden
Payload unter Besitzer-, Lease-, Status- und Vorwert-CAS, bevor er vertagt oder
abgeschlossen wird. Ein unbekannter Schreibausgang ist kein Erfolg.

Ein konkreter Originalbefund erfordert mehr als den bisherigen Einstieg: Im
vorhandenen DGB-Artikel fehlte der fuenfte Absatz mit 700.000 Beschaeftigten,
500.000 Mindestlohnbeziehenden und Branchenumsatz. Der neue allgemeine Vertrag
`artikeltext-v3` uebernimmt deshalb den gesamten eindeutig gebundenen
strukturierten Artikel einschliesslich aller Absaetze und Zwischenueberschriften,
sofern er hoechstens 8.000 Zeichen und 12.000 UTF-8-Bytes umfasst. Absatzanzahl,
gesamter Artikeltexthash, Antwort-, Quellen-, Titel-, URL- und Datumsbindung
werden geprueft. Es gibt keine Artikel- oder Profilsonderregel.

Dieser Artikeldeckel beansprucht hoechstens die Haelfte des unveraenderten
16.000-Zeichen-Lagekontexts. Nur ein strikt validierter v3-Beleg darf dort das
generische 1.400-Zeichen-Limit ueberschreiten; Gesamtbudget und sechs Belege
bleiben unveraendert. Briefing uebernimmt denselben Text samt Herkunft.
Understanding misst zusaetzlich die tatsaechlich JSON-serialisierte Eingabe
inklusive Schema, Escaping und 4.096 Bytes Senderreserve: hoechstens 128.000
UTF-8-Bytes, konservativ unter den vorhandenen Eingabevertraegen. Bei Ueberlauf
werden ganze Quellen zurueckgestellt, niemals Saetze abgeschnitten. Restquellen
haben vor schon bestaetigten Ergaenzungen Vorrang; nur die wirklich gesendeten
Prompt-IDs bestaetigen Jobfortschritt. Es werden keine Token-/Ausgabelimits oder
Kostenreservierungen erhoeht. Das ist keine gemessene Tokenzahl.
Laengere Eingaben koennen je Modellaufruf mehr kosten und bei unveraendertem
1-USD-Tages-/30-USD-Gesamtvertrag weniger taegliche Vorgaenge ermoeglichen.
Budgetteilung kann weitere regulaere Fortsetzungen erfordern; kein hoeherer
Durchsatz oder unveraenderter Preis je Vorgang wird behauptet.

Bei groesseren Artikeln bleibt der bisherige nutzbare v2-Ausschnitt aus derselben
Antwort erhalten: maximal vier ganze Absaetze/1.280 Zeichen, mit Verfahren und
Verhaeltnis gelieferter/gesamter Absaetze erkennbar partiell. Ein zu langer erster
Absatz bleibt wie zuvor offen. Auch positive alte v2-Cachezeilen bleiben
unveraendert Teilkontext: derselbe Reservierungsschluessel verhindert einen
zweiten Original-GET. Eine gespeicherte vollstaendige Originalantwort fuer
nachtraegliche Erweiterung liegt dort nicht vor. Dies ist keine Bestandsreparatur
und kein Nachweis ausreichender Abdeckung beliebig langer Artikel. Fachbezug
erst hinter einem Ausschnitt darf weiterhin keinen endgueltigen Ausschluss
begruenden. Bestehende RSS-/amtliche Extraktoren bleiben erhalten.

Eine vor jedem HTTP-Start verweigerte Anbieterreservierung darf ausschliesslich
ihre eigene unveraenderte Cache-Reservierung atomar zurueckgeben. Erst eine
bestaetigte Rueckgabe erlaubt die spaetere erneute Reservierung. Nach gestartetem
HTTP, Transportfehler oder unbekanntem Ausgang bleibt die bestehende Sperre
erhalten; kein automatischer zweiter Originalabruf desselben Standes.
Reine Leser beschaffen weiterhin nichts, auch beim App-Oeffnen nicht.

## Gezielte Abnahme

Alle lokalen Pruefungen ueber `scripts/lokal.js`, mit vorhandenen Originalfixtures
oder deklarierter Synthetik und injizierten Adaptern. Keine neuen Originale,
Datenbank-Productionwrites, Modelle oder manuellen Verarbeitungsläufe.
Bestaetigte Gruppen: Inhaltsdienst 20, globaler Anschluss 29, Quellenlauf 7,
Blob-/Persistenzvertrag 47, Dedup 10, DIP 16, Bundestag 33, Berlin 46,
Beschaffung 14, Abrufschutz 12. Queue 19, Eingabebindung 20, Pendingbestand 17, Dispatch 111,
Kommunikationsriegel 48 und bestehender Selbstweck-Endweg 31 sind gruen.
Zusaetzlich sind Extraktions-/Quellenbindung 16, Lage-/Briefingquellen 13,
PARDOK-Importschutz 13 und Terminalschutz 63 gruen. DGBs gesamter Text ist im
abgefangenen Modellprompt sowie Lage-/Briefingvertrag nachgewiesen; zwoelf
grosse synthetische Artikel gehen unter dem serialisierten Bytebudget ueber
mehrere Fortsetzungen ohne Dokumentverlust. Keine echte Modellbefolgung behauptet.
Die Pflichtchecks werden im PR auf dessen exakten Kopf gebunden.
Erfolgreiche bestehende Queue-Vertraege wurden wiederverwendet, keine lokale
Gesamtsuite und kein 500er-Lasttest gestartet.

Erster Pflichtlauf `42593800994` auf `daca156e118b7498cafb3060a4b3f9d48c9e7cbb`:
**FAILURE** im Standardlauf. Die neue Budgetvariable fehlte im kanonischen
Env-Inventar; zwei praezise Strukturwaechter erwarteten noch die alte
Pending-Signatur beziehungsweise das Bilanzarray ohne Pendingaufnahme.
Inventar und diese Waechter wurden gezielt nachgezogen; keine Runtimeaenderung.
Native Vorstufen und Browserpflichtcheck waren gruen, Browserausfuehrung wurde
bei diesem Backenddiff regulaer uebersprungen. Endkopf-Pflichtchecks folgen
regulaer neu; dieser Fehllauf wird nicht als Erfolg ausgegeben.

Zweiter Pflichtlauf `42597166600` auf `a78273fc3ce23cb5ff614dc416a31d8d5fa7f005`:
**FAILURE**, Standard 189/189 gruen, Bereich 348/350 gruen. Der reine
Weckzielpruefer importierte Dispatch und machte PARDOK wieder im Readergraph
erreichbar; unveraendert in den bestehenden reinen Kommunikationsriegel
verschoben, alte Exports erhalten. Ein weiterer positionsabhaengiger
Pending-Terminalwaechter wurde auf den exakten Funktionskoerper mit Terminal-,
Parkungs- und Fehlerfilter nachgezogen. Keine Schutzpruefung abgeschwaecht.
Der notwendige Kontextfix wird zusammen mit diesen gezielten Korrekturen
regulaer auf dem neuen Endkopf geprueft; keine lokale Gesamtsuite.

Der regulaere Endkopflauf `42602097234` auf
`1b5be6f8a14bf8a48d01ccf67944c7f120885aba` ist **SUCCESS**:
Standard 189/189, Bereich 350/350 und nativer Z22-Nachweis 48/48.
Beide Pflichtchecks sind erfolgreich. Die konkreten Browserstufen wurden
fuer diesen Backenddiff regulaer uebersprungen; kein ausgefuehrter Browsertest
wird behauptet. Dieser Runtime-Pruefstand bleibt durch die anschliessende
reine Dokumentationskorrektur erhalten. Der neue Dokumentationskopf erhaelt
seine regulaeren Pflichtchecks anhand des gesamten PR-Diffs einschliesslich
Runtimeaenderungen; kein verkuerzter Pruefumfang wird zugesagt.
Keine erneute lokale Gesamtsuite.

Auch der anschliessende Dokumentationskopf
`f82fc5616948cadd5bb4be6215c4e826a13fb875` hat beide Pflichtchecks bestanden:
`42609654720` **SUCCESS**, Standard 189/189, Bereich 350/350,
Z22 48/48; konkrete Browserstufen regulaer uebersprungen.
Waehrend dieses Laufs wurde PR1111 parallel auf `main` gemergt. Der neue
Stand `fe38a3710caa18f0a020825747c04c7d4f2c198a` ist deshalb konfliktfrei
in den PR1115-Entwicklungszweig uebernommen, ohne Merge nach `main`.
Buero, UI, `ai.js`, `server.js` und die gepinnte CI-Archivwiederverwendung
bleiben unveraendert erhalten. Beide Vercel-Branchsperren bleiben `false`.
Der integrierte Endkopf benoetigt erneut die regulaeren Pflichtchecks;
die beiden bestandenen Vorgaengerlaeufe bleiben gueltige historische
Pruefbelege, ersetzen aber keine CI des integrierten Kopfes.

Der Probeabschluss auf `feadca2829b6b54c010c2fcfef16d208ab6e0c05`
bestand danach `42618196389`: beide Pflichtchecks **SUCCESS**,
Standard 189/189, Bereich 350/350 und Z22 48/48; konkrete Browserstufen
regulaer uebersprungen. Anschliessend wurde die neue reine
`main`-Abschlussdokumentation `279b00fc` konfliktfrei uebernommen.
Die gemeinsame Statusdatei haette dadurch 31.018 Zeichen/353 Zeilen erreicht.
Deshalb wurden ausschliesslich die bereits belegten Quellenhistorien auf ihre
Berichte verdichtet; die neue Buero-Abschlussdokumentation bleibt unveraendert.
Runtime und Rueckwegbasis bleiben `fe38a371`. Die notwendige Integration und
Statuskorrektur erhalten regulaere Pflichtchecks auf dem neuen Endkopf;
Ergebnis und Kennung werden ohne weiteren Dokumentationscommit im PR gebunden.

Der unabhaengige Review hat insbesondere globalen Lektuerebeleg,
13/12-Fortsetzung, Quellen-/RSS-Konflikte, Betreiberpausen und die enge
Selbstweckausnahme geprueft; keine offenen P1-Befunde. Pflichtchecks sind `Syntax + Offline-Suiten` und
`Browser-/Mobile-Smoke (Chromium)`. PR1115 ist offen und ungemergt;
Aktuelle Gitbasis ist die oben bezeichnete Buero-Abschlussdokumentation;
Production bleibt beim parallelen Buero-Rollout. Die erforderliche
Anbietererweiterung bleibt nach dem gescheiterten Codex-Direkttransport
unvollstaendig; keine Empfehlung einer allgemeinen Anbieterfreigabe.
Das nachfolgende begrenzte DGB-/Radio-Paket ist davon getrennt entscheidbar.
Commit, PR und native CI-Run-ID werden
im PR-Abschluss festgehalten, ohne nachtraeglichen Runtime-Commit nur fuer
CI-Nummern. Die Preview dieses Entwicklungszweigs ist explizit abgeschaltet.

## Begrenzte spaetere Produktionsvorlage

Dieses vollstaendig beschriebene Paket betrifft ausschliesslich Queuebetrieb
und Selbstweck fuer den geprueften gemeinsamen Weg mit der unveraenderten
DGB-/Radio-Hostliste. Es ist getrennt vom offenen NDR-Nachweis entscheidbar;
dieser ist keine Voraussetzung fuer die begrenzte Freigabe. Das Paket ist
keine Gesamtabnahme und keine Empfehlung einer allgemeinen Anbieterfreigabe.
Fuer genau diesen begrenzten Umfang liegt kein konkreter offener Codeblocker
vor. Erforderlich bleiben die erfolgreiche regulaere CI des aktuellen
integrierten Endkopfes und die unten benannten frischen Betriebsvorpruefungen.
Gegenstand einer konkreten Freigabe ist ausschliesslich der im PR bezeichnete, durch beide
Pflichtchecks bestaetigte Endcommit und die folgende Productionkonfiguration.
Keine Variablen wurden in diesem Sprint gesetzt. Bestehende Artikelkontext-,
DGB-/Radio-Host- und Anbieterflags bleiben gesetzt;
`HELMUT_SUCHWEGAUSZUEGE_HOSTS=www.dgb.de,www.radio-hannover.de` bleibt unveraendert.
NDR ist nicht Teil dieses Pakets, auch eine positive Einzelprobe erweitert es
nicht automatisch. Es gibt keine pauschale Hostliste,
keine neue Profilfreigabe und keine Erhoehung des 1/30-USD-Modellvertrags.

| Variable | Vorwert in Production | Geplanter Wert |
| --- | --- | --- |
| HELMUT_SCALABLE_PIPELINE | off | on |
| HELMUT_JOB_DISPATCH_MODE | shadow | queue |
| HELMUT_JOB_TRANSPORT | nicht gesetzt | selbstweck |
| HELMUT_SELBSTWECK_ERLAUBT | nicht gesetzt | on |
| HELMUT_WORKER_WAKE_URL | nicht gesetzt | https://helmut-pilot.vercel.app/api/cron/worker-weck |
| HELMUT_KLASSEN_GRENZEN | nicht gesetzt | on |
| HELMUT_KLASSE_QUELLENABRUF_MAX | nicht gesetzt | 1 |
| HELMUT_WORKER_PARALLEL | 4 | 1 |
| HELMUT_WORKER_BATCH | 25 | 1 |
| HELMUT_WORKER_STAPEL | 25 | 1 |
| HELMUT_DRAIN_BUDGET_MS | nicht gesetzt | 240000 |
| HELMUT_JOB_TIMEOUT_MS | nicht gesetzt; Code 120000 | 150000 |
| HELMUT_UNDERSTANDING_JOB_BUDGET_MS | nicht gesetzt; neuer Code 60000 | 150000 |
| HELMUT_VORBEDINGUNG_WARTE_MS | nicht gesetzt; Code 120000 | 10000 |
| HELMUT_WORKER_LEERLAUF_MS | nicht gesetzt; Code 0 | 10000 |

Die Eintraege fuer Klassen/Drain/Zeit sind ausdruecklich Teil dieses Pakets;
sie waren zum lesenden Envstand nicht konfiguriert. Den Weckhost unmittelbar
vor Aktivierung gegen die von Vercel gesetzten Vertrauensanker pruefen;
blosser Aliasbesitz genuegt dem vorhandenen Zielvertrag nicht. Nicht automatisch
auf einen anderen Host ausweichen. `HELMUT_SCALABLE_PIPELINE_SEIT` ist nur eine
Betriebsanzeige, keine Filterung historischer Auftraege.

Der bestehende Kommunikationsriegel bleibt gesperrt. Nur der ausdruecklich
angeforderte Selbstweck darf mit allen vier passenden Flags und geprueftem
eigenen HTTPS-Ziel den vorhandenen Jobtransport benutzen. Weiterleitungen
werden abgewiesen. Mail, Einladung, Push, WhatsApp, Webhooks, Lambda und fremde
Transporte erhalten dadurch keine Freigabe. Es entsteht kein neuer Cron,
Workerprozess, Proxy, Anbieter oder externer Queue-Dienst.

### Zeit, Kosten und Grenzen des Antriebs

Der regulaere Quellencron um 04:00 UTC plant und startet die vorhandene Queue.
Der vorhandene Selbstweck kann danach faellige Arbeit in weiteren begrenzten
Drains fortsetzen. Je Drain maximal 240 Sekunden; nach Freigabe des verteilten
Drain-Slots ein Abgleich von hoechstens 50 und ein Versand von hoechstens
20 Absichten, gebuendelt in hoechstens einen HTTP-Weckruf. Initial verwendet
der Quellencron die vorhandenen Grenzen 200/100. Keine neue Cronzeit.

Beide Serveraufrufer verwenden unveraendert eine 300-Sekunden-Joblease; die
bestehende Halb-Lease-Regel begrenzt jeden Auftrag auf 150 Sekunden.
Vorbereitungslesungen, Originalabruf und Modellstart teilen diese absolute
Frist. Die Abrufreserve lautet 25 Sekunden plus sechs Speicherfristen,
die Modellreserve KI-Frist plus drei Speicherfristen plus fuenf Sekunden.
Eine langsame Beschaffung kann deshalb erst im naechsten, rein aus Cache
versorgten Auftrag verstanden werden. Die Konfiguration ist keine Zusage,
dass jedes Original samt Modell in einen Auftrag passt.

Kurze fortsetzbare Arbeit wartet zehn Sekunden; reine lange Budget-/bekannte
Cachepausen verwenden die bestehende Stunde und verursachen keinen schnellen
Leerlaufpoll. Anbietergrenzen blockieren weiterhin jeden vorzeitigen Abruf.
Der Selbstweck besitzt keinen spaeteren Timer: Sind ausschliesslich kuenftig
faellige Aufgaben uebrig, kann die Kette enden. Der naechste sichere Neustart
ist der regulaere 04-Uhr-Cron. Die bestehende maximale Budgetwartezeit von
48 Stunden und begrenzte Wiedervorlage bleiben erhalten; fehlgeschlagene
Auftraege sind keine verstandenen Dokumente.

Je neuem Artikelstand im vorbereiteten Einstiegspfad hoechstens ein
Original-GET mit maximal 20 Sekunden und 1 MiB Antwort. Bei beispielhaft 500
neuen, jeweils genau einmal gebundenen Artikelstaenden waeren das hoechstens
500 tatsaechliche Original-GETs und 500 MiB Antwortlimit; keine 500er-Messung.
Das ist keine Geldobergrenze fuer die gesamte Verarbeitung.

**Kostenwirkung:** Der bestehende 1 USD/UTC-Tag-/30 USD-Gesamtvertrag deckelt
Modellkosten, nicht Vercel-Rechenzeit, HTTP-Weckrufe oder Datenbankzugriffe.
Mehr Originalversuche je Gesamtlauf und mehr kleine Queueauftraege sind die
beabsichtigte Wirkung. Es gibt keinen globalen Tagesdeckel fuer Selbstweck-
Aufrufe. Jeder Drain und jeder Versand ist endlich; zehn Versandversuche und
Backoff bis 30 Minuten gelten je Absicht, der Abgleich kann alte Absichten
spaeter erneut oeffnen. Daraus laesst sich keine endliche globale Tageszahl
oder belastbarer Geldbetrag ohne gemessene Laufzeit/Plattformtarif ableiten.

Lesemehrarbeit bleibt begrenzt: hoechstens 200 Dokumente je Inhaltsauftrag,
zugehoerige Fundstellen in 100er-Chunks mit erkanntem 1.000er-Antwortdeckel,
bis zwei Cachelesungen je Kandidat. Pendingaufnahme: maximal fuenf
KO-Quellenlesungen plus Zaehler/Seite. Vor Rest-Modellstart kommt eine
frische KO-Lesung nach CAS-Reservierung hinzu. RSS-Nachlieferung liest nur texttragende
Dubletten gebuendelt und schreibt nur identische bisher leere Zeilen bedingt.
Der Artikelbelegspeicher verwendet eigene kleine globale Zeilen, keinen
vollstaendigen Auth-/Hauptblob je Cachekey.

Diese Vorbereitung beweist keine Versorgung von beispielhaft 500 neuen
Artikeln innerhalb eines Tages. Verfuegbare Hosts, begrenzter Artikelkontext,
Anbieterpausen, Modellbudget und tatsaechlicher Ein-/Abfluss bestimmen den
Durchsatz. Ein positiver Produktionsnachweis muss diese Mengen unterscheiden.

### Ausfuehrung erst nach dem einen konkreten GO

1. Frischen main-/PR-/CI-Kopf, laufende Prozesse, Queuezustand, aktive Leases,
   historische Fehler/Wiedervorlagen und Outbox lesen. Keine automatische
   Neutralisierung historischer Jobs. Aktive Profilbindung, Vertragshash,
   Tages-/Gesamtverbrauch und nicht eingefrorenen Kostenstand bestaetigen.
   Vorwerte aller 15 Konfigurationseintraege sichern.
2. Native Voraussetzungen sind zum 09.11. lesend bestaetigt: alle 21
   referenzierten Queue-/Outbox-/Klassen-RPCs vorhanden, `service_role EXECUTE`
   jeweils wahr; `CRON_SECRET` vorhanden, Wert nicht gelesen. Keine RPC wurde
   fuer diesen Nachweis ausgefuehrt. Auch SELECT/INSERT/UPDATE/DELETE auf
   helmut_store, helmut_jobs, raw_documents, document_findings und
   knowledge_objects sind fuer service_role lesend bestaetigt; kein neuer
   Berechtigungsbedarf. Vor Aktivierung Wiederpruefung.
3. Exakt diese Productionwerte setzen und unmittelbar den geprueften PR ueber
   den regulaeren Gitrollout bereitstellen. Envwerte wirken erst im neuen
   Deployment. Bei Mergeblock vorherige Envwerte wiederherstellen. Kein
   zusaetzlicher manuell erzeugter Deployment- oder Verarbeitungsstart.
4. READY, Aliasbindung, effektive Runtimeversion, Konfigurationsbereitschaft des
   Ereignisantriebs und erhaltene Kommunikationssperren lesen. Bereitschaft ist
   kein Zustell-/Durchsatznachweis. Den regulaeren Quellenlauf abwarten.

### Regulaere Nachkontrolle und Rueckweg

Nach dem ersten regulaeren Quellenlauf die vorhandenen `process_runs`,
Queue-/Outbox-/Klassenbilanz, gebundenen Belegcache, tatsaechlichen
KO-Lektuerebelege und Jobreste lesen. Ein-/Ausgang unterscheiden: beobachtet,
persistiert, Original versucht/geliefert, tatsaechlich im Prompt gespeichert,
offen/vertagt/fehlgeschlagen und in Lage/Briefing nach aktueller Quellenpruefung
sichtbar. Keine historische Modellbefolgung aus einer neuen KO-Kante ableiten.
Modellverbrauch und HTTP-/Drainlaufzahlen samt Laufzeiten kontrollieren.

Die schon beauftragte einmalige lesende Nachkontrolle am 10.11.2026 um
05:45 UTC / 06:45 Berlin bleibt bestehen. Sie gilt fuer den tatsaechlich
bereitgestellten Stand; ohne Aktivierung dieses PR kann sie dessen Wirkung
nicht belegen. Kein manueller Zusatzlauf oder Originalprobe als Ersatz.

Rueckweg: die 15 gesicherten Envvorwerte wiederherstellen (zuvor fehlende
Eintraege entfernen) und auf den unmittelbar vorher geprueften Runtime-Stand
zurueckrollen, zum aktuellen Lesestand
`fe38a3710caa18f0a020825747c04c7d4f2c198a` /
`dpl_2t9f7tXNuNePv4Ng5GjTStFWo8Vd`. Den parallelen Buero-Rollout erhalten;
nicht auf den historischen PR1113-Stand `4d11ad63` zurueckgehen.
Bereits laufende Leases/Drains erst beobachten, keine Jobs/Belege loeschen oder
historische Daten zurueckschreiben. SCALABLE=off und DISPATCH=shadow verhindern
weitere Queuefortsetzung im neuen Deployment. Die bisherigen Artikelkontext-
und Anbieterflags sowie die 1/30-USD-Grenze bleiben auf ihren Vorwerten.
