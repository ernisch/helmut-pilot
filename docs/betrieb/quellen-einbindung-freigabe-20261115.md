# Konkrete Freigabevorlage: zwei Quellen für bestehende Fachlücken

Stand15.11.2026,11:56UTC. **Durch Betreiber und gemergten PR1214 ausdrücklich
freigegeben; Production-Ausführung folgt erst nach grünem Code-Merge/Deployment.**
Die frühere automatische Ablehnung bleibt als historischer Beleg erhalten.
Sie wurde nicht umgangen. Die seitdem erteilte genaue Freigabe steht in
[AGENTS.md](../../AGENTS.md#verbindliche-dauerfreigabe-vom-15112026-quellenbetrieb-in-der-aufbauphase).

## Ursache und vorbereitete Reparatur

Der zusätzliche Adminquellenlauf endete15Nov10:49:22UTC.15Aufträge erfolgreich,
15zur Wiederholung vorgemerkt,72vertagt,kein endgültiger Verarbeitungsfehler.
Die native Quellenabdeckung bleibt partial:4Fehler,95Warnungen,13Drift.
Die vier strukturellen Befunde betreffen drei fehlende Rollen-/Klassenbindungen.
QuellenPR1207 enthält dafür zwei tatsächlich geprüfte Direktfeeds und drei
fachlich belegte Zuordnungen. Der Merge allein installiert oder aktiviert nichts.

## Genau vorgeschlagener Nutzungsumfang

| Quelle | Erlaubter Textumfang | Bestehende Ausgabebedingungen |
|---|---|---|
|Destatis: `https://www.destatis.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed/Aktuell.xml`|Standard-RSS-Textauszüge nach den allgemeinen Bedingungen; individuelle abweichende Angaben bleiben gesperrt.|Statistisches Bundesamt/Destatis, Originalverweis und tatsächliches Publikationsdatum erhalten; keine Bilder und keine GENESIS-Lizenzübertragung.|
|iRights: `https://irights.info/feed`|Metadaten sowie ausschließlich individuell belegte CC-BY-4.0-Auszüge, die der bereits integrierte strikte Reader akzeptiert.|Autor, Titel, Original/OERinfo, Datum, CC-BY-Link und Bearbeitungshinweis im gebundenen `sourceNotice`; andere Artikel bleiben Titel/Link.|

Freigegebene Codeänderung ausschließlich für diese zwei exakten Feedidentitäten:
`commercialUseApproved:true`, `rightsReviewRequired:false`,
`fullTextAllowed:false`, `imagesAllowed:false`, `aiTrainingAllowed:false`.
Keine andere Quelle erbt diese Entscheidung, keine generelle Herausgeberlizenz.
Die Codevorbereitung bleibt `active:false` und `preparedOnly:true`; die konkrete
relationale Aktivierung folgt nur nach gesondert eingeschlossener Freigabe unten.

Lizenz- und Originalnachweise stehen unverändert in
[Destatis](destatis-wirtschaft-vorbereitung-20261115.md) und
[iRights](irights-digital-vorbereitung-20261115.md).
Dies ersetzt keine rechtliche Freigabe des politischen Gesamtprodukts.

## Exakte Production-Datenänderung

Umgebung: Supabase-Projekt `ddckuvvpcytqbyfmbvie`, bestehende Helmut-Production.
Letzter begrenzter Vorabgleich bestätigt: Destatis-Herausgeber existiert als
`statistical_office/data_source/active`; iRights-Herausgeber und beide exakten
Feedwege fehlen. Beide Zielpakete haben Status `prepared`; neue Links fehlen.

Nur folgende Zeilen, in einer kurzen atomaren Transaktion nach unverändertem
Vorwertabgleich; Abweichung oder unbekannter Ausgang stoppt ohne blinden Retry:

1. Ein neuer Herausgeber `publisher-irights.info`, Domain `irights.info`,
   Typ `media`, Rolle `journalistic`, Trust `unbekannt`, Lifecycle `active`.
2. Zwei neue RSS-Wege `rp-fach-destatis-aktuell-rss` und `rp-fach-irights-rss`,
   ausschließlich die oben angegebenen URLs, Parser `rss-regex`, Priorität80,
   Status `needs_review`, Modus `auto`, keine erfundene gesunde Abrufhistorie.
3. Drei neue Links: Destatis→`pkg-fach-wirtschaft-energie`,
   Destatis→`pkg-fach-digitales-staatsmodernisierung`,
   iRights→`pkg-fach-digitales-staatsmodernisierung`.
4. Ausschließlich diese beiden Paketstatus von `prepared` auf `active`.

Damit sechs neue Katalogzeilen und zwei bestehende Paketstatus. Keine anderen
Altpfade aktivieren, insbesondere weder DLF noch die geschlossenen Bundestag-RSS.
Kein Vollseed, keine Migration, keine Profil-/Host-/Cron-/Secretänderung und keine
Schwellen- oder Vollständigkeitsregel ändern. Erfolg bleibt erst nach tatsächlich
bestätigten Abrufen und Textbelegen belegbar; keine garantierte Tagespublikation.

## Lauf-, Kosten- und Schutzgrenzen

Kein weiterer Lauf ist durch dieses Dokument ausgelöst. Vor einer möglichen
Fortsetzung zuerst sicherstellen, dass die bestehenden Tagesplanung die neuen
Wege tatsächlich aufnimmt. Andernfalls konkrete fehlende Einreihung offenlegen,
keinen Tagesplan oder historischen Job zurücksetzen.
Ein anschließend zusätzlich freigegebener Adminlauf bleibt maximal300Sekunden,
innerhalb1USD/UTC-Tag und30USD insgesamt. Nach dem bisherigen Zusatzlauf sind
0,536289USD heute gebunden, verbleibend höchstens0,463711USD. Acht alte offene
Reserven,16/16 verbrauchte Originalabrufe und alle übrigen Limiter bleiben.
Keine neue Ressource, kein Abo, keine kostenpflichtigen Tests und keine Massentests.

Die fünf bereits geprüften Erfolgsjobs sind nach dem Zusatzlauf weiter erledigt;
ihre Payloadprüfsummen sind unverändert. Ein unbekannter Modellausgang bleibt
CAS-gesperrt.14Metadatenkonflikte werden nicht durch Umschreiben alter Originale
oder Aufweichen der Versionsbindung gelöst.

Nachkontrolle: exakt betroffene Katalogzeilen, native Lauf-/Abdeckungsquittung,
Kostenaggregate und die vorhandenen fünf Erfolgsprüfsummen lesen. Kein Profilread.
Rückweg: nur selbst aktivierte Wege pausieren und die zwei Paketstatus auf den
gebundenen Vorwert zurückstellen, falls inzwischen unverändert. Selbst neu angelegte
Zuordnungen nur entfernen, wenn unverändert und ohne abhängige Ergebnisse;
andernfalls inaktiv erhalten. Verarbeitungserfolge und Kostenbelege nie löschen.

## Gebundene Voraussetzung für Ausführung

Das ausdrückliche Betreiber-GO aus PR1214 gilt für **genau diesen eingeschränkten Nutzungsumfang,
die beiden Codeflags und die sechs neuen Production-Katalogzeilen samt den zwei
Paketaktivierungen**. Danach erst Codepatch, betroffene bestehende Tests,
unabhängiges Review, beide Pflichtchecks am Endkopf und regulärer Merge/Deployment;
anschließend die atomare Einbindung mit lesender Nachkontrolle. Das ist kein GO
für Quotenänderungen, Wiederholung unbekannter Modellaufrufe oder andere Quellen.

## Technischer Vorabnachweis

Der kleine Codepatch öffnet nur die zwei nach ID, Feedadresse und Lizenzbeleg
gebundenen Nutzungsflags. Default-Seeds bleiben inaktiv; der SQL-Seed ist bytegleich.
Destatis übernimmt nur datierte Presseartikel, höchstens480Zeichen als ganzen
Satzpräfix. Sichtbare abweichende RSS-Rechte oder Nutzungsverbote führen zu
Titel/Link. Bilder, RSS→HTML-Fallback und spätere HTML-/Spiegeltextnachladung sind
für diesen Weg gesperrt. Originaladresse, Herausgeber und Publikationsdatum bleiben.
Der unveränderte iRights-Reader verlangt seinen artikelweisen CC-BY-Nachweis.

Gespeichertes Destatis-Original offline am echten Parser:10/10datierteMeldungen,
10brauchbareAuszüge,0Bilder,max443Zeichen,jüngstesOriginal13Nov07:00UTC.
Bestehende Herkunfts-/Attributionsgruppen29/29 und Auszugsgruppen14/14 grün.
Erweiterte Fachquellensuite prüft Ausnahmen, Feedidentität und das native relationale
Aktivierungsmodell mit einem ausdrücklich synthetischen gültigen Profil.
Ein zuerst unvollständiges Testprofil aktivierte erwartungsgemäß keine Quellen;
Testfixture nach nativer Zulassungsregel korrigiert, keine Produktwache verändert.
CI-Plan bleibt gezielt:Kern und Quellenbereich,keine Datenbank-/500er-/bezahlten Tests.
Die Production-Transaktion bleibt auf genau die oben bezeichneten8Zeilen begrenzt.
