# Konkrete Freigabevorlage: zwei Quellen für bestehende Fachlücken

Stand15.11.2026. **Vorschlag, nicht freigegeben und nicht ausgeführt.**
Die automatische Freigabeprüfung hat die geplante Nutzungsflagänderung abgelehnt:
Für diesen konkreten Nutzungsumfang und dessen Wirkung fehlt eine eindeutige
Betreiberfreigabe. Die Ablehnung wurde nicht umgangen; kein Codeflag geändert.

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

Vorgeschlagene Codeänderung ausschließlich für diese zwei exakten Feedidentitäten:
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

## Voraussetzung für Ausführung

Ausdrückliches Betreiber-GO für **genau diesen eingeschränkten Nutzungsumfang,
die beiden Codeflags und die sechs neuen Production-Katalogzeilen samt den zwei
Paketaktivierungen**. Danach erst Codepatch, betroffene bestehende Tests,
unabhängiges Review, beide Pflichtchecks am Endkopf und regulärer Merge/Deployment;
anschließend die atomare Einbindung mit lesender Nachkontrolle. Das ist kein GO
für Quotenänderungen, Wiederholung unbekannter Modellaufrufe oder andere Quellen.
