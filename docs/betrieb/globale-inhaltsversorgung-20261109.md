# Globale Inhaltsversorgung — 09.11.2026

Status: **Code und gezielte Integration vorbereitet; frühere Aktivierungsvorlagen ersetzt. Historischer Teilstand: technischer Anschluss geprueft, begrenzte Produktionsvorlage vorbereitet; genehmigte NDR-Einzelprobe am Codex-Direkttransport gescheitert, Original und Anbietererweiterung offen**. Dieser Bericht betrifft
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

## Historische Ausgangsbelege vor der zusammenhängenden Wiederaufnahme

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
Zu diesem damaligen Lesestand war kein offener Altbestand zu neutralisieren. Vor der
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
NDR war außerhalb der damaligen DGB-/Radio-Vorlage. Die einzige aktuelle
Vorlage weiter unten nennt NDR als ungeprüften Beschaffungskandidaten.

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
nicht freigegeben; die damalige 15-Env-Vorlage ist historisch und ersetzt. Keine neue Route,
Proxytechnik, Infrastruktur oder manuelle Verarbeitung wird vorbereitet.

## Historischer Anschluss bis zum vorigen geprüften Kopf 1e096ca1

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

## Historische gezielte Abnahme vor der zusammenhängenden Wiederaufnahme

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
Die damalige Productionruntime und Rückwegbasis war `fe38a371`;
seit PR1117 ist die aktuelle Rückwegbasis `f13a430a`. Die notwendige Integration und
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

## Einzige aktuelle Produktionsvorlage: begrenzte Morgenfenster

Diese Vorlage ersetzt sowohl die frühere 15-Env-Selbstweckvorlage als auch den
zwischenzeitlichen 10-Env-Tagescronentwurf im PR-Text. Keine dieser Vorlagen wurde
aktiviert. Maßgeblich ist der endgültige, im PR mit grünen Pflichtchecks gebundene
Commit; die isolierte Integration ist geprüft. Der erforderliche native SQL-/Endcommit-
Nachweis wird im PR gebunden. Kein Merge-/Rollout-Go liegt vor.

### Ausgangsstand und Trennung der Verträge

`main` und Production enthalten PR1117 auf `f13a430a18e415ea4e874d128fd72eb144c30dc9`,
Deployment `dpl_J8aLVXje3s2Qx33gke2tK1x8iCvh` READY. Dieser Stand einschließlich
Büro und Kundenoberfläche wurde lokal auf `a6a0a001` integriert. Die Previewzweige
bleiben gesperrt; PR1117 wird weder erneut entwickelt noch zurückgerollt.

Native Profilprüfung am 09.11., 16:58 UTC: genau ein aktives, nicht gelöschtes Profil.
Bedarf: Bundestag, Arbeit/Soziales/Gesundheit/Pflege, Niedersachsen und regionale
Beschäftigung. Die gemeinsame Logik bleibt unabhängig von dessen Namen; mehrere
ausdrücklich fiktive gültige Profile werden isoliert geprüft, keine aktiviert.

Native Kostenbuchprüfung 17:00:53 UTC: Vertragshash
`8c98b2e18ee5dc21c73561bbf5bad2d8cb6c76f8ccd533b3153270bbd7d9a348`,
1.172642 USD gebunden, 54 Einträge, 1 USD/UTC-Tag, 30 USD insgesamt.
Der Geldvertrag, sein Hash und alle alten reservierten/abgerechneten/ungeklärten
Einträge bleiben unverändert. Ein separater Zulassungsvertrag bindet die explizit
freigegebenen tatsächlich aktiven zulässigen Profilkennungen an diesen Geldhash.
Es entsteht kein Budget pro Mandat und keine neue Kostenbuchbaseline.
Profilkennungen und fertige Zulassungs-JSON bleiben im vertraulichen Freigabebeleg
`/workspace/helmut-globalanalyse-20261109/betriebszulassung-vorlage.PRIVATE.json`
(0600, SHA256 `b88dd3d7f4fc4bf4f0904909e11e6e24c72725345aa239dae01ef786d95b1998`).
Der lokale strenge Zulassungsparser bestätigte genau ein zulässiges aktives Profil,
Zulassungshash `45ff8fca7560a6570988785af72ee633cb9aeeb92f6b56a01a7da141ffeb36b8`.
Vor späterer Ausführung erneut gegen den aktiven Bestand prüfen.
Ohne neue Zulassung gilt weiterhin die alte Einprofilprüfung; widersprüchliche,
unlesbare, unzulässige oder nicht freigegebene Profile erhalten keine Freigabe.

### Gebündelter Anbieterumfang

Bestehende zusätzliche Artikelkontextfreigaben: `www.dgb.de,www.radio-hannover.de`.
Vorbereitet sind zusätzlich exakt folgende 16 Hosts, ohne Wildcards:

```text
www.bundestag.de,www.bundesrat.de,www.bundesregierung.de,www.bmas.de,www.bundesgesundheitsministerium.de,www.deutschlandfunk.de,www.tagesschau.de,www.zdfheute.de,www.ndr.de,www.verdi.de,www.vdk.de,www.cducsu.de,www.spdfraktion.de,www.gruene-bundestag.de,www.die-linke.de,www.dielinkebt.de
```

Zusammen 18 Hosts in HELMUT_SUCHWEGAUSZUEGE_HOSTS. Die übrigen bisherigen Quellenwege
bleiben davon unberührt. Der historische Bestand zeigt für die 16 zusätzlichen Hosts
282 gespeicherte Artikel, davon 94 vorläufig möglicherweise passende Treffer ohne
nutzbaren Inhalt. Das ist eine Bedarfsauswahl, kein endgültiges Relevanzurteil und
kein Nachweis erreichbarer oder extrahierbarer Originale. Echte vollständige HTML-
Proben liegen nur für DGB/Radio vor; HIB-RSS und amtliche Schnittstellen werden
über vorhandene Leser genutzt. Weitere HTML-/Transportfähigkeiten bleiben ungeprüft.
Die NDR-Einzelgenehmigungen sind verbraucht; es erfolgt kein neuer Vorababruf.
Katalogstatus ersetzt keine Hostfreigabe. DNS/IP/TLS, Robots/Zugriffsschutz,
Publisher-, Artikel-, Datum- und Quellenstandbindung bleiben erforderlich.

### Zeitplan, Planung und Wiederaufnahme

Kein neuer Endpunkt oder Dienst: bestehender `/api/cron/crawl`, zusätzliche
Querymarkierung `?arbeitsfenster=1` für reine Fensterauslösung. Der bisherige
04:00-Termin bleibt erhalten; zusätzliche Querytermine stoppen ohne neues Flag vor IO.
Vorbereitet sind acht UTC-Slots: **03:00, 03:15, 03:30, 03:45, 04:00, 04:15,
04:30, 04:45**. Vorhandene Briefingtermine **05:00 und 05:15 UTC** bleiben bestehen.
Das ergibt fünf Crondefinitionen und zehn planmäßige Tagesinvocations, keine
rekursive Selbstweckkette. Eine begrenzte Zustellkulanz wird im Slotvertrag geprüft.

Der erste zugelassene Termin sichert ein unveränderliches Tagesmanifest vor dem
ersten Enqueue. Folgefenster lesen bestätigte Planreste und drainieren vorhandene
Arbeit, statt sämtliche Quellen erneut zu planen oder abzurufen. Ein verlorener
Schreibausgang wird neu gelesen; Fortschritt wird nur nach bestätigtem CAS quittiert.
Offene frühere Tagesmanifeste bleiben auffindbar. Quellen sind innerhalb der frühen
Morgenfenster fällig; Projektion und Materialisierung werden vor die vorhandenen
Briefingtermine gezogen. Verspätete und nicht fertig bearbeitete Arbeit bleibt als
Rest beziehungsweise sichtbarer Fehler erhalten. Kein künstliches Nachholen per Hand.

Planfähigkeit: die native Vercel-Billingfähigkeitsprüfung für Rolling Releases liefert
`availableSlots=1, reason=available_slots`; laut offizieller Dokumentation wird diese
Fähigkeit nur auf Pro/Enterprise angeboten. Beide Plansegmente unterstützen Cron
mindestens minütlich und 100 Definitionen. Das begründet die vorbereitete Frequenz;
der genaue Tarifpreis und aktive Geldsperren sind damit nicht belegt. Fähigkeit vor
Rollout nochmals lesen; bei Planabweichung nicht upgraden oder Schutzregeln umgehen.
Das offizielle Schema lässt Querystrings im mit `/` beginnenden Cronpfad zu.

### Globale Arbeits- und Kostengrenzen

Alle Worker teilen dieselbe vorhandene atomare Anbieterreservierung, keine neue
Queue oder Zählerplattform. Tagesgrenzen: **8 zugelassene Fenster, 2400 vorab
reservierte Funktionssekunden und 16 zusätzliche Artikelkontext-HTTPversuche**.
Ein Tages-/Slotschlüssel verhindert erneute Arbeit bei doppelter Zustellung;
die vorhandene verteilte Drainlease verhindert Überlappung. Jedes Fenster reserviert
volle 300 Sekunden entsprechend Vercels maxDuration, nicht bloß die kürzere Nutzzeit.
Die zwei bisherigen Briefinginvocations kommen separat hinzu: bei genau zehn
planmäßigen Zustellungen maximal 3000 konfigurierte Funktionssekunden insgesamt,
keine gemessene CPU-Zeit oder Grenze zusätzlicher fremder/abgewiesener Requests.
Teilreservierungen/unklare Ausgänge werden nicht zurückgesetzt. Bestehende Jobclaims,
Modellreservierungen und begrenzte Wiederholungen bleiben erhalten.

Die 16 Artikelversuche gelten global über Profile/Hosts/Fenster, je höchstens
20 Sekunden und 1 MiB: maximal 16 MiB begrenzte Artikelantworten beziehungsweise
320 Sekunden aus diesen Einzelgrenzen, innerhalb der Fensterzeit. Das ist kein
Limit aller bisherigen RSS-/Schnittstellenabrufe; diese laufen im begrenzten Worker.
Zwei neue Versuche je Verstehensauftrag bleiben die zusätzliche lokale Grenze.
Globale Wiederverwendung verhindert erneutes Beschaffen desselben gebundenen Standes.

Acht Fenster sind ein begrenzter Startumfang, kein Kapazitätsnachweis. Der erhaltene
Lauf hatte 740 zuordenbare Dokumente/103 neue Rohzeilen und 152 Abrufwege; die
vorliegenden Laufzeiten belegen keinen vollständigen Abfluss dieser Menge unter
neuen Originalabrufen. 16 neue Originale pro Tag können den Bedarf deutlich
unterschreiten. Fehlendes Budget/Text bedeutet Vertagung/Lücke, keine Irrelevanz.
Bei Rückstand können Arbeit und Ausgaben über mehrere Tage warten oder bestehende
Fristen/Wiedervorlagen erreichen. Kein automatisches Anheben der Grenzen.

Vercel-CPU, provisionierter Speicher, Invocations, Datenverkehr und gegebenenfalls
Observability sowie Supabase-Compute, Egress, Disk/Optionen liegen außerhalb des
1/30-USD-Modellvertrags. Die Arbeitslimits sind keine Dollarobergrenze und keine
Grenze sämtlicher fremder Requests, Basisgebühren oder abgewiesener Zustellungen.
Ein lesbarer Vercel-Tagesexport weist tatsächlich Fluid-/Request-/Observabilitykosten
aus, aber keinen Preis für diese neue Last; dessen begrenzte Stichprobe ist keine
vollständige Projekt-/Tarifaufteilung. Neue Plattformmehrkosten bleiben unbekannt.
Vercel Spend Management pausiert gegebenenfalls verzögert/teamweit und beendet
nicht alle Speicherkosten; tatsächliche Aktivierung unbekannt. Supabase Pro ist
bestätigt, sein tatsächlicher Spend-Cap-Schalter nicht; Compute/IOPS/PITR und weitere
Optionen sind ausgenommen. Es wird kein zusätzlicher Plattformvertrag abgeschlossen.

### Gemeinsamer Inhalts- und Ausgabeweg: gezielte Integrationsbelege

Der tatsächlich verwendete Queuepfad verarbeitet alle bestätigten geladenen Treffer
in 25er-Portionen; die Portion ist keine Gesamtgrenze. Der aktivierte neue Weg erhält
auch bisher auf1280Zeichen gekappte RSS-Texte in canonical und unveränderlichem
Versionsarchiv. Die Queue trägt Quellenstandhashes und dokumentweisen Rest. Ein
abgeschlossener Vorgang oder eine Herkunftsverknüpfung ersetzt keine Lektüre.

Lange validierte Originale werden lückenlos in gebundene Abschnitte bis8000Zeichen/
12000Bytes zerlegt (1MiB Original, höchstens256Abschnitte). Pro Prompt wird nur der
aktuelle Abschnitt übergeben; bestätigte Stücke bleiben nach Neustart/Replay bekannt.
Das Dokument gilt erst nach seinem letzten Teil als übergeben. JSONB-sichere kanonische
Lektürebelege version2 binden den tatsächlichen Input und bestätigte KO-Speicherung;
version1 wird nur nach der bekannten alten Formel streng geprüft, nicht umgedeutet.
Lage und Briefing wählen aus tatsächlich verfügbaren, bestätigt übergebenen Abschnitten
KO-bezogenen Originalkontext innerhalb ihrer unveränderten Eingabebudgets. Auswahl
nach Wortübereinstimmung ist kein Fachurteil und kein Beweis echter Modellbefolgung.

Ein Titel-/Publikationswechsel derselben URL ohne bestätigte Originalmetadaten bleibt
archiviert, aber sichtbar vor Verarbeitung gesperrt. Unteilbare überlange Einzelsätze
bleiben blockiert, nicht still abgeschnitten. Alte positive Teilcachebelege werden nicht
massenhaft nachgeladen. Weitere Anbieter/Formatfähigkeiten und realer Abfluss bleiben offen.

Der gemeinsame Versorgungsstand unterscheidet offen/unbekannt/kein-bekannter-rueckstand.
Dazu gehören alte noch offene Budgetreste, auch wenn das neue Tagesmanifest bereits
fertig ist. Historische Endfehler blockieren nicht pauschal für immer. Positive Inhalte
bleiben nutzbar; eine leere Auswahl bei technischem Rückstand wird als gap statt quiet
gespeichert/angezeigt. Neue positive Teilpakete bleiben über den bestehenden strengen
Partial-CAS nach späterem Fortschritt ergänzbar; historische Komplettpakete erhalten
kein breiteres Schreibrecht. Der Status gilt nicht als Beweis aller fachlich relevanten
Inhalte. Ein erfolgreicher Rollout beweist keinen gespeicherten Kundenbriefingstand.

Gezielte isolierte Nachweise (alle via lokal.js, keine Original-/Modell-/Productionaufrufe):

| Funktion | Bestätigte lokale Gruppen |
| --- | ---: |
| Globaler Geldvertrag und getrennte Zulassung | 15/15 |
| Unveränderlicher Plan und Enqueuecursor | 7/7, einschließlich36Wege13/23Neustart |
| Abschnittsvertrag/Originalintegrität | 15/15 |
| Versionierte Rohspeicherung und große CAS-POSTs | 63/63 |
| Queue-Reste/Abschnittsfortsetzung | 22/22 |
| Quellen-/Projektions-/Materialisierungsfälligkeit | 65/65 |
| Tatsächliche abgefangene Promptquellen/Replay/JSONB | 22/22 |
| HTML-Volltext-/Abschnittsextraktion | 17/17 |
| Beschaffung/globale Originalreservierung | 15/15 |
| Globale Fenster/Reservierungen | 17/17 |
| Lokale echte HTTP-Routen einschließlich Default-aus-Spy | 8/8 |
| Abschnittsbelege bis Lage/Briefing | 12/12 |
| Versorgung über Tageswechsel und Partial-CAS/Renderer | 10/10 |
| Briefing-/Lage-Versorgungsdurchleitung | 7/7 und5/5 |
| Native Datumsdarstellung und JSONB-Reihenfolge als Funktionsattrappe | 3/3 |

Die kleine Gesamtabnahme zählt30deklarierte synthetische Artikel, alle30gespeichert,
30eindeutige abgefangene Promptquellen, zwei25er-Jobs und fünf Verstehensportionen
mit Budgetpause, Doppelzustellung und Neustart. Zwei ausdrücklich fiktive Fachprofile
erhalten über echte Matching-/Entscheidungs-/PR1117-Verträge, Materialisierung, Readback
und Clientrenderer getrennte persönliche Ausgaben; ein Artikel wird gemeinsam gelesen.
Zusätzlich bleibt ein gespeicherter technischer Unterversorgungsfall ohne Fachinhalt
sichtbar. Originaltexttests für DGB/Radio bleiben separat echte überlieferte Proben.

Die positive Teststrecke ist strukturell vollständig; `qualitaetBestanden=false` und
`vollstaendigeFaktenpruefung=false` bleiben ausdrücklich erhalten. Injizierte Urteile
und Modellantworten belegen Verträge, nicht echte Modellbefolgung, politische Richtigkeit
oder 30Artikel-Kapazität unter1USD. Keine Mock100/Mock500- oder Lasttestwiederholung.
Unabhängiger Review behob JSONB-Hash-, Default-aus-IO-, Altfenster- und Teilpaketbefunde;
kein bekannter offener P1/P2 im damaligen lokalen Stand. Der anschließende breite
CI-Erstlauf deckte den unten genannten Importgraphfehler auf. Endcommit-Pflichtchecks
werden ausschließlich nach dem wirklichen CI-Ergebnis im PR gebunden.

### Enger Datenbankanschluss für lange Texte

Zusätzlich vorbereitet ist ausschließlich
`supabase/migrations/20261109173143_raw_document_cas.sql` mit
`rollback_20261109173143_raw_document_cas.sql`. Der neue service-only RPC
`helmut_raw_document_cas(text,jsonb,jsonb)` vergleicht neun exakte Vorwertfelder
atomar und ändert nur `summary` plus optional monotone `retrieved_at`.
Große Originaltexte gehören in den POST-Body: der vorherige URL-CAS scheiterte
belegt mit HTTP431 bei langen RSS-Vorwerten. Keine Identitäts-/Publikationsänderung,
keine Browserrollenfreigabe, kein neuer Dienst und keine neue Tabelle.

Der echte SQL-/PostgREST-Nachweis ist in den bestehenden Kontoschutz-Pflichtnachweis
eingebunden (gleiche isolierte PG17-/PostgREST-Instanz, keine neue Testinfrastruktur).
Er prüft acht Gruppen einschließlich großer Vorwerte, konkurrierender Writer,
Rollenrechten und datenbewahrendem Rollback. Lokal fehlt PostgreSQL; der tatsächliche
native Nachweis bestand im regulären CI-Erstlauf42669728152 auf a6729cf1 mit8/8PASS.
Das ersetzt keinen grünen Endcommit: Derselbe Lauf scheiterte später in der
Bereichsregression; Z22 wurde deshalb nicht ausgeführt. Vor Freigabe muss die reguläre
Pflicht-CI des korrigierten Endkopfs vollständig bestehen.

### CI-Erstbefunde und gezielte Korrektur

Pflichtlauf42669728152 auf `a6729cf1a9453c811d2ad0766c93cf82595753da`:
BrowserSUCCESS, Standard189/189, Raw-document-CAS8/8 im vorhandenen PostgreSQL17-/
PostgREST-Harness. Bereich356/361, LaufFAILURE; Z22 danachübersprungen, keinPASS.
Eine echte Architekturverletzung waren lesende Importe auf schreibende Orchestrierung:
`storage → quellen-inhaltsversorgung-anschluss → scheduler → crawler → pardok-dispatch`
und `storage → quellen-arbeitsfenster → scalable-pipeline → scheduler → crawler`.
Standvergleich und reines Fensterflag sind ohne Änderung des Schutztests in reine
Hilfen ausgegliedert; Leser erreichen keine Abrufparser mehr (Schutztest13/13PASS). Vier weitere betroffene Testdateien zählen
alte Quelltextvorkommen oder erwarten alte Optionsformen (`cron-fairness`,
`cron-globalphase`, `pipeline-zeitbudget`, `tenant-narrativ`). Ihre Invarianten zu
270/280Sekunden, Phasentrennung und Mandatsbindung bleiben bestehen; der zusätzliche
Fensterpfad wird ausdrücklich mitgeprüft. Gezielte Nachprüfung: Cronfairness288/288,
globalePhase194/194, Pipelinezeitbudget22/22, Tenantnarrativ92/92PASS. Keine Pflichtprüfung wird übersprungen
oder künstlich grün gesetzt. Korrigierter Endkopf, Review, gezielte Prüfergebnisse und
abschließende Pflicht-CI werden ohne weiteren Nummerncommit im PR gebunden.

### Korrektur des Manifest-Cursortransports vor Freigabe

Der frühere Kopf `397945332d413d175bb92edcf407864ddd0c3a52` bestand CI42675463570
(Standard189/189, Bereich361/361, RawCAS8/8, Z22 48/48, Browser114/114 und Prosa19/19).
Dieser Erfolg deckte den hiernach festgestellten Transportblocker nicht ab: Das
vollständige bisherige Tagesmanifest stand im `data=eq`-URLfilter. Bei großen
zulässigen Manifesten konnte die HTTP-Adressgrenze jeden weiteren Cursor blockieren.
Dieser Kopf ist deshalb nicht mehr die Freigabevorlage.

Die bestehende, noch nicht angewendete Migration20261109173143 enthält jetzt zusätzlich
`helmut_quellenplan_cursor_cas(text,text,integer)`. Die feste kurze RPC-Adresse erhält
Kennung, vollständigen Vorwert als kompakten JSON-Text und nächsten Cursor im POST-Body.
Die Größenprüfung vor JSONB-Konvertierung erhält exakt das bisherige1MiB-Manifestlimit;
PostgreSQLs zusätzliche JSONB-Formatierung ist keine neue Größenbeschränkung.
Der service-only SECURITY-INVOKER-RPC vergleicht den vollständigen JSONB-Vorwert atomar
und schreibt ausschließlich `cursor` genau+1 sowie den daraus bestimmten `zustand`.
Aufträge, Tagesplan, Hash und Identität bleiben unverändert. Browserrollen dürfen den
RPC nicht ausführen. Weder neue Tabelle noch neue Infrastruktur oder Konfiguration.
Pro Cursor bleiben ein Schreibaufruf und eine Nachlesung erforderlich; große
Manifeste erzeugen entsprechenden Body-/Readback-Datenverkehr. Keine neue Dollargrenze
oder Zusicherung geringer Plattformkosten wird daraus abgeleitet.

Unbekannte Schreibausgänge werden weiterhin nur durch Nachlesen bestätigt. Ein anderer
Manifesthash, manipulierter Inhalt oder fehlender Fortschritt stoppt; ein bereits
weiterer bestätigter Cursor desselben unveränderten Manifests erlaubt Fortsetzung.
Gezielt lokal: Journal8/8 (einschließlich großem Body, Konkurrenz und Neustart),
Queue22/22. Der neue native Prüfbaustein im vorhandenen PG17-/PostgREST-Kontoschutz-
Harness prüft zehn Gruppen über den tatsächlichen HTTP-Transport mit einem gültigen
1.048.448-Byte-Manifest (128 Plankennungen, keine Enqueue-/Workerverarbeitung),
Adressgrenze des alten Wegs, Fortschritt, konkurrierende Änderungen, Wiederaufnahme
und verlorene Schreibantwort. Kein reiner Adapter gilt als Transportnachweis.
Die tatsächlichen nativen Ergebnisse und vollständig grüne Endkopf-CI werden im PR
gebunden; der frühere grüne Lauf ersetzt diese Nachweise nicht. Erster Cursorlauf
42706791416 auf `e8d766638261e5c78be3502f4b805ee03ec63295`: FAILURE beim initialen
PostgreSQL17-Migrationssetup wegen ungeklammertem CASE im PL/pgSQL-IF. Der CASE-Ausdruck
ist jetzt geklammert. In diesem fehlgeschlagenen Lauf wurden weder Raw8 noch Cursor10
ausgeführt; kein nativer PASS wird daraus abgeleitet. Browser war SUCCESS.

Die Aktivierungsvorlage bleibt bei einer vorbereiteten Migration, jetzt mit zwei
service-only RPCs, und unverändert16Env/18Hosts/8Fenstern/2400Sekunden/16Originalversuchen.
Vor Aktivierung beide Signaturen und Rechte lesend prüfen. Der zugehörige Rollback
entfernt beide Funktionen nach Runtime-Rückweg und Ende neuer Worker; Manifeste,
Cursor, Originale und Queue bleiben erhalten. Keine Bestandsreparatur oder Aktivierung.

### Einzige Konfigurationsvorlage

Vorwerte aus den vorhandenen Betriebsbelegen unmittelbar vor freigegebener Ausführung
erneut lesen und vertraulich sichern. Keine Abweichung still überschreiben.

| Variable | Vorwert | Geplanter Wert |
| --- | --- | --- |
| HELMUT_SCALABLE_PIPELINE | off | on |
| HELMUT_KLASSEN_GRENZEN | nicht gesetzt | on |
| HELMUT_KLASSE_QUELLENABRUF_MAX | nicht gesetzt | 1 |
| HELMUT_WORKER_PARALLEL | 4 | 1 |
| HELMUT_WORKER_BATCH | 25 | 1 |
| HELMUT_WORKER_STAPEL | 25 | 1 |
| HELMUT_JOB_TIMEOUT_MS | nicht gesetzt | 150000 |
| HELMUT_UNDERSTANDING_JOB_BUDGET_MS | nicht gesetzt | 150000 |
| HELMUT_VORBEDINGUNG_WARTE_MS | nicht gesetzt | 10000 |
| HELMUT_WORKER_LEERLAUF_MS | nicht gesetzt | 10000 |
| HELMUT_QUELLEN_ARBEITSFENSTER | nicht gesetzt | on |
| HELMUT_QUELLEN_FENSTER_TAG | nicht gesetzt | 8 |
| HELMUT_QUELLEN_SEKUNDEN_TAG | nicht gesetzt | 2400 |
| HELMUT_ORIGINALABRUFE_TAG | nicht gesetzt | 16 |
| HELMUT_BETRIEBSZULASSUNG_JSON | nicht gesetzt | version1, vorhandener Geldhash, exakt privat gebundene aktive Profilkennungen |
| HELMUT_SUCHWEGAUSZUEGE_HOSTS | www.dgb.de,www.radio-hannover.de | exakt die oben genannten 18 Hosts |

Dispatch bleibt `shadow`; HELMUT_JOB_TRANSPORT, HELMUT_SELBSTWECK_ERLAUBT,
HELMUT_WORKER_WAKE_URL und HELMUT_DRAIN_BUDGET_MS bleiben ungesetzt. Artikelkontext,
Anbietersteuerung, bisheriger Geldvertrag, Modell und Profile bleiben unverändert.
Der geänderte Cronplan ist ausschließlich Teil des noch nicht freigegebenen Rollouts.

### Reguläre Nachkontrolle und Rückweg

Vor Ausführung: frischen main/Head, Diff, Pflichtchecks, Konfliktfreiheit, parallele
Arbeit, aktive Prozesse/Leases/Queue und Budgetbuch sowie DB-TimeZone prüfen.
Globale Tagesreservierungen setzen UTC in der vorhandenen Datenbank voraus;
Die native Prüfung am 09.11.2026 um 17:11:10 UTC bestätigte `UTC`;
eine spätere Abweichung bleibt ein Ausführungsblocker. Erst nach konkretem GO genau
die oben genannte, nativ geprüfte Migration mit beiden RPCs aus dem abgenommenen Commit bereitstellen
und beide Signaturen/Service-only-Rechte lesend bestätigen; keine Fachinhalte dabei ändern.
Anschließend exakt den geprüften PR samt Konfiguration regulär ausrollen. Bei Mergeblock Envvorwerte wiederherstellen.

Nach READY: Alias und tatsächliche Version, vollständige wirksame Konfiguration,
gesperrten Selbstweck und fehlende zusätzliche Anbieter-/Profilaktivierungen prüfen.
Nur reguläre Läufe liefern den Produktivnachweis. Eindeutige Dokumente in klaren
Zeitfenstern bilanzieren: gefunden, gespeichert, Text vollständig/teilweise verfügbar,
tatsächlich als Abschnitt im Prompt, global wiederverwendet, vertagt, blockiert,
fehlgeschlagen. Queuealter/Restcursor, Budgets, reservierte/echte Laufzeit sowie echte
gespeicherte und dargestellte persönliche Ausgabe getrennt kontrollieren.
Weder complete-KO noch erfolgreiches Deployment beweisen alle Artikel gelesen oder
ein Kundenbriefing gespeichert. Ein ruhiger Tag darf technische Unterversorgung nicht
verdecken. Isolierte Modellantworten sind kein Nachweis echter Modellbefolgung.

Rückweg: gesicherte Envvorwerte einschließlich alter Hostliste wiederherstellen und
vorherige geprüfte Productionruntime `f13a430a` mit Deployment
`dpl_J8aLVXje3s2Qx33gke2tK1x8iCvh` erhalten/zurückrollen; Büro und PR1117 erhalten.
Ohne Fensterflag stoppen neue Querytermine vor IO, alter 04:00-Cron bleibt erhalten.
Laufende Leases beobachten, keine reservierten Zähler, Versionen, Jobs, Fachinhalte
oder Buchstände löschen. Den RPC-Rollback erst nach Ende laufender neuer Worker
und nach dem Runtime-Rückweg ausführen; er entfernt nur beide Funktionen, keine Texte, Manifeste oder Cursor.
Keine Budgets erhöhen oder alte Profile aktivieren.


## Wiederaufnahme des zusammenhängenden Sprints

Stand 09.11.2026: gezielte Cursortransportkorrektur nach zusätzlichem Blocker auf39794533; Production unverändert.
Repository `ernisch/helmut-pilot`, Branch `codex/globale-inhalte-20261109`, PR1115.
`main`/Production `f13a430a18e415ea4e874d128fd72eb144c30dc9`, Vercel
`dpl_J8aLVXje3s2Qx33gke2tK1x8iCvh` READY; PR1117, Büro und Kundenoberfläche erhalten.
Main lokal auf `a6a0a001` integriert; geprüfte Bausteine auf Zwischenstand `46f1a5cc`
gesichert. Der finale Codekopf und reguläre CI-Run werden ohne weitere reine
Nummerncommits im PR gebunden. Vor Wiederaufnahme Branch/Head/Arbeitsbaum frisch prüfen.

Implementierung über getrennte Bereiche integriert: globale Geld-/Profilbindung,
immutablePlanrest, Rohversionen/großePOST-CAS, Abschnittsverarbeitung, Morgenfenster,
globaleTageslimits sowie Versorgungsstatus bis gespeichertem persönlichem Briefing.
Astra, Quellenfortsetzung, Vertragsbindung und SQL-Helfer sind nach ihren gezielten
Prüfungen eingefroren. Unabhängiger Review hat die konkreten Befunde geprüft;
Der Lauf42675463570 auf39794533 war vollständig grün, zeigte aber noch keinen großen
Manifest-Cursor über echten HTTP-Transport. Dieser nun behobene Blocker benötigt
zusätzlichen nativen Nachweis und vollständige Endcommit-CI; Ergebnisbindung im PR.

Nächste Arbeit im selben Auftrag: finalen Push nach Triggeraudit, reguläre Pflicht-CI
abwarten, tatsächliche Fehler gezielt beheben, Head/main/Checkzuordnung/Produktionsstand
rein lesend bestätigen und genau dieses einzige Paket zur Entscheidung vorlegen.
Nach ausdrücklichem GO nur dessen konkrete Migration/16Env/Cronplan/Merge/Production-
Rollout ausführen und anschließend reguläre Läufe auswerten. Kein manueller Quellenlauf,
kein neuer Originalvorababruf, kein Modelltest, keine Profil- oder Budgetänderung.
Ein gespeichertes/dargestelltes Kundenbriefing ist erst am echten regulären Lauf belegt.

Die früheren 15-/10-Env-Vorlagen und frühere fe38-Rückwegbasis sind ersetzt. Die
verbrauchte NDR-Einzelfreigabe bleibt verbraucht. Private Belege/zulässigeProfilkennung
liegen außerhalb Git unter `/workspace/helmut-globalanalyse-20261109`; Geldbuch,
Originale und aktive Profile wurden nicht verändert. Offene relevante Grenzen:
zusätzlicheHost-/Formatfähigkeit, konservativgesperrteTitel-/Publikationswechsel,
unteilbareLangsätze, tatsächlicherAbfluss/Rückstandsalter/Plattformmehrkosten sowie
fachlicheModellbefolgung. Keine weitere Übergabeschleife oder neuer Thread nötig.

## Anschluss10.11.: nachgewiesene Pending-Rotationssperre

PR1115 ist nach GO aufc37d85f8 live; reguläreWirkung ist nicht bestätigt.
12254verarbeitbarePendingeinträge→Tagesoffset5795 trifft auf Publikationsleser5000.
AchtFensterfehlgeschlagen,0neueRohdokumente. GezielteReparatur/Regression und
Nachholgrenzen im [aktuellen Abschluss](pending-rotation-20261110.md).
Keine heutige Nachholung innerhalb ausgeschöpfter8/2400Grenzen; keinReset/Budgetplus.
