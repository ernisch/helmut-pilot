# Dauerhafte Quellenfehlerbehandlung, 15.11.2026

## Nachtrag: amtlicher EUR-Lex-Originalauszug vorbereitet

Die zusaetzliche Primaerpruefung ist ein kostenloser oeffentlicher Quellenread,
kein Production-/Kundenlauf. CELLAR13.11.2026: CELEX32026D2505, OJ-L2026/2505,
deutscher Originalrechtsakt der Europaeischen Kommission. RDF21:53:38UTC
HTTP200/2876Bytes, SHA256
`61d1530252a4ef1b5c50037c53ef2cb723eab96cab4b5e0836947f02ec61d54b`;
Default-Accept `application/rdf+xml`, Version13.11.,02:32:06.372UTC.
Amtliches FMX4-ZIP21:54:48UTC HTTP200/4338Bytes, SHA256
`9691ec92a616f569def7ae7176910e7eea8041db032925ba3bef31949a1d48bb`.
Werk `http://publications.europa.eu/resource/cellar/da8055db-df05-11f1-ba80-01aa75ed71a1`,
Manifestation `http://publications.europa.eu/resource/oj/L_202602505.DEU.fmx4`,
Item `https://publications.europa.eu/resource/cellar/da8055db-df05-11f1-ba80-01aa75ed71a1.0004.02/DOC_1`.
ACT-XML SHA256 `435bd85a47dd0d5a0f97dbfb8ee023a135a71ac83ff548b4b32e2c68b8367023`.
Erster ganzer operativer Absatz142Zeichen, Artikel1/Absatz1, SHA256
`2cb4eaa254a46b98c62546bb2ae4e39fe6d24300d84ae0607180e80d2ba2ee5a`.
Publikation13.11. ist in DOC/PUBLICATION belegt; Beschluss12.11. und die im
Absatz genannte Wirkung fuer AnhangI Nr1 ab04.03.2028 sind andere Daten.
Kein allgemeiner Inkrafttretensnachweis. Keine Sonderrechts-/Bild-/Anhangsignale
in den drei vollstaendigen XML-Dateien des geprueften kleinen Originalpakets.

[Primaerer EUR-Lex-Reusehinweis](https://eur-lex.europa.eu/content/legal-notice/legal-notice.html?locale=en):
Rechtsdokumente duerfen grundsaetzlich kommerziell/nichtkommerziell wiederverwendet
werden, soweit keine besonderen Bedingungen genannt sind; Grundlage2011/833/EU.
Dies ist kein CC0-Textrecht. CC0 bleibt Metadaten; Fremdwerke, Bilder/Logos,
Sonderrechte und ungepruefte Dokumente werden nicht freigegeben.

Reparatur im Review: enger nativer CELLAR-FMX4-Weg mit Fassungscache/CAS,
maximal1neuer Originalabruf je regulaerem Auftrag innerhalb unveraenderter
16erTagesquote. Nur COM/DEU/OJ-L, erster ganzer operativer Absatz60–240Zeichen,
Urheber/Datum/Fundstelle/Original-/Lizenz-/Bearbeitungshinweis gebunden.
Quittierte temporaere HTTP-Fehler: genau1spaetere getrennte Wiederholung,
mindestens15Minuten und Retry-After; keine Resets, Timeouts/UNKNOWN bleiben.
Alte Metadaten-/Ergebniszeilen bleiben erhalten; neue belegte Fassung hat eigene
Kennung, gleiche CELEX-Fassungen zaehlen in der Ausgabe/Bewertung einmal.
Lokale gezielte Pruefgruppen: Original13, Integration12, Transport5,
Parlamentsdaten31, Abdeckung32, CELLAR11, Crawler33, Quellenpflicht50,
Dedupkontext10/Dedupfindings39/Quellendedup13, WELT11/FR6 gruen.
Zwei anfaengliche lokale Sandboxfehler (localhost/Kindprozessausgabe) wurden
mit erlaubtem lokalen Netz behoben; kein externer Abruf in Tests.
Zwei unabhaengige OpenAI-Reviews: Compilerflag, Datums-Satzgrenze, CELEX-Doppel-
beleg und60s-Restzeit/Antwortabbruch korrigiert, keine offenen P1/P2.
Runtime-/Pflicht-CI/Rollout noch offen. Weiterhin kein Gesamtversorgungs-PASS;
regulaere Kontrolle16.11.,05:25UTC bleibt unveraendert.

## Auftrag und Iststand

Quellen innerhalb der bestehenden Architektur dauerhaft behandeln; keine neuen
bezahlten Tests, Massenlaeufe oder kuenstlichen Verarbeitungen. Die eingerichtete
Kontrolle am16.11.,05:25UTC bleibt erhalten. Ausgangspunkt main dfe311b6.
Offene Quellenaufgabe #1218 folgt erst nach regulaerer Nachkontrolle der laufenden
Reparatur; keine erneute private Profilinventur. Gesamtversorgung weiterhin partial.

Bereits vorhanden und wiederverwendet: source-demand dedupliziert normalisierte
Abrufdefinitionen je Zeitfenster; Queue UNIQUE/Lease, exponentieller Backoff mit
maximal5Versuchen, begrenzte Wiedervorlage2; Google Retry-After/Gate/Circuit/Cooldown;
mehrere vorbereitete Feedwege und gebundene Landesquellenketten; automatische
Abrufquittungen und Quellenabdeckung mit Erholungs-/Paketbewertung. Kein neues
Retry-, Alarm-, Storage- oder Cron-System. Die Schwelle3echterLaeufe bleibt bestehen.
Rechte, Herkunft, Publikationsdatum und tatsaechlicher Lesetext bleiben eigene Gates.

## Nachgewiesene Ursachen und kleinster Reparaturumfang

1. Der native Queuepfad nutzt zusaetzlich einen Prozess-Ledger, der einen Versuch
   vor Abruf und Speicherung merkt. Nach503 oder unbekannter Rohpersistenz kann
   der Retry innerhalb15Minuten skipped-shared/ok statt echter Arbeit liefern.
   Lokal reproduziert: Fehler, danach uebersprungen, nur1HTTP-Aufruf.
   Kleinster Fix: nur im nativen Queuehandler diesen redundanten Ledger weglassen;
   Compiler, eindeutiger Auftrag, Lease und saemtliche Anbietergrenzen bleiben.
2. Allgemeiner RSS-Reader versteht HTML als leere Liste; ein generischer oder
   undatierter Homepageersatz verdeckt404/202. Lokal reproduziert. Kleinster Fix:
   RSS1/RSS2/Atom-Huellen pruefen; defekten Feed bei unbrauchbarem Ersatz als Fehler
   erhalten. Echte leere Feeds und datierte Artikel bleiben moeglich.
3. Die zwei vom Reader erzeugten RSS-Fehlermeldungen werden als unknown statt
   parse quittiert. Genau diese Meldungen klassifizieren; keine unbewiesene
   WAF-Ursache aus jedem Parserfehler ableiten.

Permanente Fehler werden weiter endlich beendet und im bestehenden Quellenbericht
sichtbar. Die native Finish-API erlaubt kein vorzeitiges Terminal; keine neue
Migration und keine Zweckentfremdung des Artikel-Quarantaenepfades. Unbekannte
Originalabruf-/CAS-Ausgaenge und alte negative Belege bleiben geschuetzt.

## EUR-Lex: offizielle Alternative statt Zugangssperre umgehen

Der bisherige RSS liefert nach Weiterleitung202/HTML/AWS-WAF-Challenge statt RSS;
vorherige Belege bleiben im [Abschlussnachweis](quellen-abschlussfenster-20261115.md).
Keine Challenge ausgefuehrt, keine Cookies/Identitaeten umgangen.

Primaere offizielle Dokumentation:

- [CELLAR-Wissensgraph und SPARQL](https://op.europa.eu/en/web/cellar/cellar-data/metadata/knowledge-graph)
- [CELLAR REST und Dateien](https://op.europa.eu/en/web/cellar/cellar-data/publications)
- [CELLAR RSS/Atom: Ingestionsmeldungen](https://op.europa.eu/en/web/cellar/cellar-data/rss-and-atom-feeds)
- [Amtsblatt seit01.10.2023: Einzelaktmodell](https://op.europa.eu/en/web/cellar/the-official-journal-act-by-act)
- [EUR-Lex-Webdienst](https://eur-lex.europa.eu/content/help/data-reuse/webservice.html?locale=en)
- [Rechtshinweis: Metadaten CC0](https://eur-lex.europa.eu/content/legal-notice/legal-notice.html?locale=en)

CELLAR ist ein offizieller oeffentlicher Maschinenzugang desselben Herausgebers.
Der native CELLAR-RSS meldet Ingestion/Aenderungen, keine Artikelpublikationen;
sein Zeitstempel darf kein Publikationsdatum ersetzen. Der SOAP-Webdienst verlangt
Registrierung und gesonderte Zugangsdaten, ist laut offizieller Beschreibung
kostenlos; kein Account, keine Nachricht und kein Secret angelegt.

Begrenzte rein lesende Metadatenproben haben das Datumsschema geklaert:
GDPR32016R0679 Dokumentdatum27.04.2016, Amtsblattpublikation04.05.2016.
Der alte OJ-Join funktioniert nicht fuer moderne Einzelakte. Offizielles Feld
`official-journal-act_date_publication`, KollektionOJ-L und deutsche Expression
liefern fuer32025D1771 Publikation11.09.2025 statt Beschluss08.09.2025.
NeuesteLIMIT3-Abfrage20:32:12UTC:32026D2505/32026D2510/32026D2521,
alle13.11.2026, mit deutschem Titel/CELEX/amtlicher OJ-L-Identitaet.
HTTP200,3169Bytes,SHA256
`625beaf8497aa200dda494c42dc6e42388bd2f679156e2d68629e83105012b95`.
Keine Modellaufrufe, Originalvolltexte oder Production-Schreibaktionen.

Kleinster Ersatz: ausschliesslich fuer die exakt bekannte EUR-Lex-Identitaet
einen begrenzten CELLAR-Metadatenweg verwenden, wenn der RSS wirklich fehlschlaegt.
Keine Erweiterung der Textrechte: nur Titel, CELEX-Link, echtes Publikationsdatum
und ausdruecklicher CELLAR-Herkunftsbeleg. Adapter und Integration vorhanden:
14UTC-Tage, maximal16Metadatensaetze, 256KiB JSON, fester HTTPS-Host,
einmaliger Ersatzversuch ohne eigene Retries. Anbietervertagung verhindert den
Ersatzabruf. HerkunftV2 bindet den konfigurierten RSS und den tatsaechlichen
CELLAR-Endpunkt/Werk/OJ-L/CELEX/Publikationsdatum; bestehende V1-Belege bleiben.
300Zeichen-Titelgrenze und Kennzeichnung der Kuerzung bleiben erhalten.
Keine unvollstaendige CELEX-Sektorliste; die amtliche OJ-L-Kollektion bestimmt
den Umfang. Kein automatisches HTML-/Textnachladen fuer diese Metadatenquelle.

## Gezielte Pruefungen und Review

Runtime-Evidence-Commit ae58b9b7bb070018437be523cea4beb9bcd11111:
33Crawler-,40Telemetrie-,8Queuequittungs-,31Parlamentsdaten- und11CELLAR-Gruppen
gruen; Quellenstoerungen160/Googlehaertung58 bestehende Pruefungen gruen.
Der unabhaengige Review hat Homepageersatz ohne Datum, einfache DOCTYPE-Huelle
und stillen CELEX-Sektorausschluss gefunden; alle drei korrigiert und geprueft.
Der CI-Plan bindet PR1225, Branch/Basis/Evidence und alle zehn Runtime-/Testblobs,
den uebrigen Baum sowie echten Merge und identischen PR-Kopf. Beide Pflichtjobs
bleiben erforderlich; keine Auth-/Budget-/Quoten-/Schema-/Cron-/Profilmutation.
PR1225Kopf `a6254664cf4014e8aad388c1fe2e327045bcba35`:
[PR-CI43759893440](https://github.com/ernisch/helmut-pilot/actions/runs/43759893440)
beide Pflichtchecks erfolgreich; unabhaengige Runtime-/CI-Endreviews geschlossen,
kein offener P1/P2. Der echte CI-Log bestaetigt16gezielte Blobpruefungen mit
bewusstem Skip der historischen450/5002Faelle; Schnellkern14Suiten gruen.

Merge `052650a3706a7c966f99cbc3e040bf22c7b8b031`:
[Main-CI43760131019](https://github.com/ernisch/helmut-pilot/actions/runs/43760131019)
ebenfalls beide Pflichtchecks erfolgreich. Production-Deployment
`dpl_AX8PD18P3pewX1fMkkcbSFEjTizg` READY, Team/Projekt/Commit und oeffentlicher
Alias stimmen. Kein manuelles Deployment oder Umschalten.
Oeffentliche Startseite20:49:59UTC HTTP200,6118Bytes, Runtime052650a3;
SHA256 `f85ad5e19313490cdc5b0d66a0d2b2e7c2b0ee8bf37efb765b84362b876747e0`.

Fehler bei der lokalen Testauswahl: die vorhandenen Suites source-demand und
warteschlange-blob-entkopplung wurden einmal ohne Mengenfilter ausgefuehrt.
Sie enthielten synthetische200/700Profil- und450/5002Dokumentfaelle. Das lag
ausserhalb der ausdruecklichen Grenze, obwohl keine Production-Zugriffe,
Modellaufrufe oder API-Kosten entstanden. Nach Review sofort korrigiert:
source-demand nicht erneut starten, Blobentkopplung ausschliesslich mit dem
bereits vorhandenen `--gezielt`; die Pflicht-CI uebernimmt diese Begrenzung.
Keinen historischen Mengenfall als erforderliche neue Abnahme ausgeben.

Rein lesende Production-Kontrollen20:42:48und20:50:19UTC:0laufendeJobs, alle6vorherigen
Zieljobs weiter erledigt, Tagesbindung0,711983USD/Gesamtbindung4,095017USD
unveraendert. Keine neue Verarbeitung oder Datenkorrektur ausgefuehrt.

## Abnahmegrenzen

Die bisherigen sechs Zieljobs und ihre erfolgreichen Ergebnisse bleiben erhalten.
Die zwei neuen Feeds haben erst je1echte Quittung; fehlende Beobachtungen nicht
erfinden. Andere Artikel ohne gepruefte Original-/Nutzungsnachweise bleiben offen.
Keine globale Rechtefreigabe, kein Gesamt-PASS und kein zahlender Kunde aus
Metadatenzahlen allein. Betriebswirkung neuer Korrekturen im ohnehin regulaeren
Lauf nachweisen; keine Sonderverarbeitung und keine erneute Einmalfreigabe.

Automatische Wiederholungen gelten fuer die vorhandenen Quellenjobs innerhalb
ihrer endlichen Versuchs-/Wiedervorlagegrenzen. Geschuetzte Einmal-Originalabrufe
und unbekannte Schreib-/Abrufausgaenge werden weiterhin nicht blind wiederholt.
Der offizielle Ersatz erweitert keine Textrechte: EUR-Lex-Originaltexte sind
damit noch nicht als gelesen nachgewiesen. Andere Artikel ohne belastbaren
Nutzungs-/Originalnachweis, insbesondere die zuvor dokumentierten POLITICO-/
Table.Media- und weitere Medienfaelle, erhalten keine erfundene Freigabe.
Welche Restquellen fuer die konkret unterstuetzten Mandate zwingend sind, darf
die nachgelagerte Aufgabe#1218 nach regulaerem Abschluss bewerten; keine
pauschale Vollstaendigkeitsbehauptung aus diesem Reparaturauftrag.

## Fortsetzung21:30UTC: BMG-Reden aus gesicherten Originalen

Tatsaechlicher weiterer Readerfehler: derselbe gepruefte BMG-Artikelkopf war
fuer `/ministerium/meldungen/` vorhanden, `/presse/reden/` fehlte im geschlossenen
Dispatch. Der gespeicherte Originalartikel zur ersten Lesung der Pflegereform
scheiterte daher mit `strukturierter-artikel-mehrdeutig-oder-fehlend`.
Kleinster Fix: nur diesen amtlichen Pfad in den bestehenden Leser aufnehmen,
keine neue Extraktionsheuristik, kein Videotranskript oder Volltextversprechen.
Die konkrete Parserkorrektur begruendet Extraktorrevision2 fuer die vorhandene
einmalige Wiedergewinnung aus gesicherten Antworten.

Gebundene vorhandene Belege, keine neuen Originalabrufe:

- Dokument `rd-1da2e3b96aca5fa17c33bad98ae99ac8fe41e402e021069644897f1f01effa60`,
  Original `https://www.bundesgesundheitsministerium.de/presse/reden/pnog-1-lesung-bt`.
- Originalantwort14.11.,22:23:22.396UTC,434841Bytes,SHA256
  `e2a8665eedbc2d6c7516ffcf897a07a38401c655a46280a96d9d15700d335d9f`.
  Genau diese eine bestehende oeffentliche Antwort wurde hashgeprueft gelesen;
  kein Profil-, Gesamtarchiv-, Kunden- oder neuer HTTP-Abruf.
- Cache `8b1756124cc5e921ea1fa0853285c9f8ac82d193a5450a17e8ba035acfe92f94`,
  Originalrevision1/technischerNegativbeleg bleibt erhalten.
- Archivversion `af0ebff8510454c7882f2d0f97c475da3e39393e656fe7913ca23a76e0acc006`;
  minimale oeffentliche Archivprojektion ergibt exakt den Original-Quellenhash
  `7dfafd7a2c17ca4e8256b014c220e50bf597de3c9cf5c14ea4576c6c5193c075`.
- Offline mit genau diesen gebundenen Originaldaten: vorFix kein Layout/Fehler,
  nachFix304Zeichen vollstaendiger Einleitungsabsatz, Originaldatum05Nov und
  urspruengliche Lesezeit erhalten; Herkunft bleibt `artikel-einstieg-v2`.
- Zieljob `633d9438-7d68-43cc-ad84-15326f7eab8d` ist bereitswartend,
  attempts2/max3,wiedervorlagen0, Abseitsgrundtechnisch/gepruefteRevision1.
  Er braucht keinen Reset/Ersatzjob/neu beantragte Freigabe. Sein regulaerer
  Claim kann Revision2 erreichen; zuerst nur Beleg-/Payload-CAS und Vertagung,
  erst ein spaeterer normaler Claim darf vorhandenes Understanding ausfuehren.

5gezielteBMG-Gruppen und10Wiedergewinnungsgruppen gruen; unabhaengiges Runtime-
Review geschlossen. Neue Gegenfaelle pruefen Host/Pfad/Titel/Tag/Sichtbarkeit,
die echte Standardrevision2, einmalige Wiedergewinnung, erhaltene Altzeilen,
Originalzeit und weiterhin gesperrte unbekannte Modell-/Schreibausgaenge.
Kein Productionjob, Originalcache, Erfolgsbeleg, Budget oder Cron veraendert.
Runtime-Evidence `260bc68e77bce44969c97171b7f0f901ffd5c11f`,PR1227;
unabhaengiges CI-/Dokumentationsreview ebenfalls geschlossen. Der Pruefplan
bindet genau vier Runtime-/Testblobs, Basis/Branch/PR und restlichen Baum;
92CI-Vertragsgruppen gruen, keine Mengen-/Datenbankgesamttests ausgewaehlt.
Der alte v1-Abrufkey `3a102fe6668cae9d5e5f463b10e30e9ef86c2c53f03743d4bd0a161cbd1d981e`
existiert nicht; kein dortiger positiver/unklarer Altstand wird uebergangen.
PR1227Kopf `e33954d16b6948ccc83d522d6ac90b048d8a7b87`:
[PR-CI43764658647](https://github.com/ernisch/helmut-pilot/actions/runs/43764658647)
beide Pflichtchecks erfolgreich. Merge `224b0c97544db51128fc1c2f90f56a81c977f51f`:
[Main-CI43764849950](https://github.com/ernisch/helmut-pilot/actions/runs/43764849950)
ebenfalls beide Pflichtchecks erfolgreich. Keine offene Reviewbeanstandung.
Production-Deployment `dpl_DM6XQ4NWyYujWgZZuYWb9HwR4zga` READY mit diesem
Commit am regulaeren Alias. Oeffentliches HTML21:40:36UTC HTTP200/6118Bytes,
Version224b0c97,SHA256
`bc6bb40d80c16241cb65f73111465e93efd419723e1f6ddba851348c0796f98b`.
Lesende Nachkontrolle21:40:41UTC:0laufendeJobs, Zieljobweiterwartend/attempts2,
alle6vorherigenZielerfolgeerhalten,0,711983USDTag/4,095017USDgesamt unveraendert.
Bestehender Negativbeleg bleibt vorhanden, MD5
`6646315b1dff6fa4c75872d879d01470`. Kein manueller Cache-/Jobschreibvorgang.
Die regulaere Betriebswirkung bleibt offen; Offlineerfolg ist kein neuer
Productionabschluss und darf keinen fertigen Kundenbericht vortaeuschen.

CELLAR-Lesbarkeit weiter konkretisiert, ausschliesslich amtliche Metadaten:
die deutsche Expression des Rechtsakts32026D2505 verweist nachweislich auf
`oj/L_202602505.DEU.fmx4`, `.xhtml` und `.pdfa2a`. Vollstaendiger inferred-
Objektnachweis21:29:19UTC,HTTP200/3988Bytes,SHA256
`eb039992a09b1782d749655bbd440378de2c49b8b7fe612ffbee67e713cf0b8a`.
Zuvor fehlende Relationen lagen an der zu engen non-inferred-Projektion,
nicht an einer Anbietersperre. Kein Originaltext heruntergeladen; konkreter
Text-/Sonderrechtebeleg und Auszugspfad bleiben gesondert erforderlich.

Genau ein naechster Schritt nach Auslieferung: die unveraenderte Kontrolle am16.11.,05:25UTC
wertet den ohnehin regulaeren Quellenlauf auf echte Abrufquittungen,
CELLAR-Herkunft/Datum, Wiederholungs-/Abschlussausgaenge und verbleibende
Lesetext-/Rechteblocker aus. Kein zusaetzlicher Verarbeitungslauf.
