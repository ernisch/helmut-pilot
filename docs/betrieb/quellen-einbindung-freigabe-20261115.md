# Konkrete Freigabevorlage: zwei Quellen für bestehende Fachlücken

Stand15.11.2026,12:15UTC. **Durch Betreiber und PR1214 ausdrücklich freigegeben,
nach grünem Code-Merge/Deployment atomar ausgeführt und lesend bestätigt.**
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

## Genau freigegebener Nutzungsumfang

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

Unabhängiges Review fand zunächst fehlende Übernahme von Kanalrechten. Der
Folgefix prüft Kanal- und Artikelrechte gemeinsam, ohne Nachbarartikel zu vermischen.
Das echte RSS nennt auf Kanalebene exakt„Statistisches Bundesamt, Wiesbaden2019“
(mit Leerzeichen vor2019). Dieser konkrete Herausgeber-Copyrightvermerk ist nach
den belegten allgemeinen Originalbedingungen erlaubt; er wird weder zum Artikel-
Publikationsdatum noch zu einer abweichenden Einschränkung umgedeutet. Unbekannte
Erweiterungen bleiben gesperrt. Neue Kanal-/Artikel-/Nachbargegenfälle lokalgrün;
dieselben10Originalauszüge bleiben nach der Korrektur erhalten.

## Tatsächlicher Abschluss12:15UTC

CodePR1215:Endkopf`30bd4da493b8415319dcdddae985454132da3bc0`,
Merge`c3648b08dfac9d1382773da003764925657e44a3`.
[PflichtCI43712210903](https://github.com/ernisch/helmut-pilot/actions/runs/43712210903)
beidePflichtjobsgrün,14/14Kern und87/87Quellen;MainCI43712532507ebenfallsgrün.
UnabhängigesReview samt Kanalrechte-Folgefix und mehrfachen Hinweisen abgeschlossen,
keinRestbefund. Die bereits erfolgreichen unveränderten iRights-Ausgabeprüfungen
bleiben erhalten. Keine Datenbank-/500er-/bezahlten Tests.

Productiondeployment`dpl_5Kyd8q4V9vcxteNsRwbM5kei2dU1`READY,richtigerAlias,
öffentlicheShellHTTP200mitVersionc3648b08. Erst danach die vorwertgebundene
Transaktion ausgeführt. SkriptSHA256:
`818cfe9e05ce845ab1e948767f59de3f2cde7cc7ebc0cad12c5fa5c413935fb8`.
Zusätzliche Zeilensperren und Vorwertwache verhindern, dass die Paketaktivierung
einen anderen bisher gesperrten Altweg einschaltet. Nur6Inserts/2Paketstatusupdates.

Separate lesende Nachkontrolle bestätigt genau den vorgesehenen Herausgeber,
beide exaktenRSS-URLs mit`needs_review/auto`,dreiLinksundbeidePaketstatus`active`.
Alle fünf Altwege sind unverändert:die beiden Suchwege bereits über Bundbasis
aktiv,die beiden Bundestag-RSS und DLF weiterhin`paused/manual`.
Alle fünf vorhandenen geprüften Erfolgsjobs weiter`erledigt`,PayloadMD5identisch.
Tageskosten0,536289USD,Gesamtbindung3,919323USD,8offeneAltreserven undOriginalzähler16
unverändert. Einbindung0USD,keine zusätzlichen Quellen-/Admin-/Modellläufe.

Beide neuen Wege haben noch`last_success_at:null`:das ist ehrliche Unbekanntheit
bis zum ersten regulären Abruf. Der bestehende Tagesplan wird nicht geändert;
die native Planung erstellt den nächsten Tagesplan regulär neu. Deshalb keine
Behauptung,die letzte alte Quellenquittung oder das Morgenpaket seien jetzt grün.
Rückweg ist vorbereitet und nicht ausgeführt:
`e507675a9f254c0306cf4ccdb77a368497139dea025eb244616dc097c4facd9e`.
Er pausiert nur eigene Wege und stellt bei unveränderten Vorwerten die beiden
Paketstatus zurück;keineKatalogzeile,Originale,Verarbeitung oderKostenbelege löschen.

### Gebundener ausgeführter Datenbefehl

Historischer Ausführungsbeleg,nicht ungeprüft wiederholen. Freigabeumfang sieheoben.

```sql
-- Freigabe: AGENTS.md, gemergter PR1214; exakt sechs Inserts und zwei Paketstatus.
-- Erst nach geprueftem Code-Merge/READY; keine Profile, Jobs, Budgets oder Migration.
BEGIN;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '2s';
DO $activation$
DECLARE complete boolean; n integer;
BEGIN
  PERFORM id FROM public.source_packages
    WHERE id IN ('pkg-fach-wirtschaft-energie','pkg-fach-digitales-staatsmodernisierung')
    ORDER BY id FOR UPDATE;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'source-activation:package-count'; END IF;
  -- Paketaktivierung darf keinen bislang gesperrten Altweg einschalten.
  -- Nur genau betroffene Bestandswege sperren; keine Tabelle/globalen Jobs sperren.
  PERFORM r.id FROM public.retrieval_paths r JOIN public.package_paths pp ON pp.retrieval_path_id=r.id
    WHERE pp.package_id IN ('pkg-fach-wirtschaft-energie','pkg-fach-digitales-staatsmodernisierung')
    ORDER BY r.id FOR SHARE OF r;
  IF EXISTS (SELECT 1 FROM public.package_paths pp JOIN public.retrieval_paths r ON r.id=pp.retrieval_path_id
    WHERE pp.package_id IN ('pkg-fach-wirtschaft-energie','pkg-fach-digitales-staatsmodernisierung')
      AND r.id NOT IN ('rp-fach-destatis-aktuell-rss','rp-fach-irights-rss')
      AND r.status NOT IN ('paused','archived') AND r.activation_mode NOT IN ('manual','dev_only')
      AND NOT EXISTS (SELECT 1 FROM public.package_paths b JOIN public.source_packages p ON p.id=b.package_id
        WHERE b.retrieval_path_id=r.id AND p.key='bund-basis' AND p.status='active'))
    THEN RAISE EXCEPTION 'source-activation:unexpected-old-path'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.publishers WHERE id='publisher-destatis.de'
    AND canonical_domain='destatis.de' AND publisher_type='statistical_office'
    AND evidence_role='data_source' AND lifecycle_status='active') THEN
    RAISE EXCEPTION 'source-activation:destatis-before';
  END IF;
  SELECT
    (SELECT count(*)=1 FROM public.publishers WHERE id='publisher-irights.info'
      AND name='iRights.info' AND canonical_domain='irights.info' AND publisher_type='media'
      AND evidence_role='journalistic' AND trust='unbekannt' AND lifecycle_status='active' AND entity_id IS NULL)
    AND (SELECT count(*)=2 FROM public.retrieval_paths r JOIN (VALUES
      ('rp-fach-destatis-aktuell-rss','publisher-destatis.de','fach-destatis-aktuell-rss','Statistisches Bundesamt — Aktuelles','https://www.destatis.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed/Aktuell.xml'),
      ('rp-fach-irights-rss','publisher-irights.info','fach-irights-rss','iRights.info','https://irights.info/feed')
    ) v(id,publisher,legacy,name,url) ON r.id=v.id AND r.publisher_id=v.publisher
      AND r.legacy_source_id=v.legacy AND r.name=v.name AND r.url=v.url
      WHERE r.method='rss' AND r.parser='rss-regex' AND r.priority=80
        AND r.status='needs_review' AND r.activation_mode='auto' AND r.query IS NULL
        AND r.is_critical=false AND r.max_items IS NULL AND r.expected_frequency IS NULL)
    AND (SELECT count(*)=3 FROM public.package_paths WHERE retrieval_path_id IN
      ('rp-fach-destatis-aktuell-rss','rp-fach-irights-rss'))
    AND (SELECT count(*)=3 FROM public.package_paths WHERE
      (package_id,retrieval_path_id) IN (
      ('pkg-fach-wirtschaft-energie','rp-fach-destatis-aktuell-rss'),
      ('pkg-fach-digitales-staatsmodernisierung','rp-fach-destatis-aktuell-rss'),
      ('pkg-fach-digitales-staatsmodernisierung','rp-fach-irights-rss')))
    AND (SELECT count(*)=2 FROM public.source_packages WHERE id IN
      ('pkg-fach-wirtschaft-energie','pkg-fach-digitales-staatsmodernisierung') AND status='active')
    INTO complete;
  IF complete THEN
    RAISE NOTICE 'source-activation:already-exact-complete';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.publishers WHERE id='publisher-irights.info' OR canonical_domain='irights.info')
    OR EXISTS (SELECT 1 FROM public.retrieval_paths WHERE id IN
      ('rp-fach-destatis-aktuell-rss','rp-fach-irights-rss') OR legacy_source_id IN
      ('fach-destatis-aktuell-rss','fach-irights-rss') OR url IN
      ('https://www.destatis.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed/Aktuell.xml','https://irights.info/feed'))
    OR EXISTS (SELECT 1 FROM public.package_paths WHERE retrieval_path_id IN
      ('rp-fach-destatis-aktuell-rss','rp-fach-irights-rss'))
    OR (SELECT count(*) FROM public.source_packages WHERE
      (id,key) IN (('pkg-fach-wirtschaft-energie','fach-wirtschaft-energie'),
      ('pkg-fach-digitales-staatsmodernisierung','fach-digitales-staatsmodernisierung')) AND status='prepared') <> 2
    THEN RAISE EXCEPTION 'source-activation:before-drift';
  END IF;
  INSERT INTO public.publishers (id,name,canonical_domain,publisher_type,evidence_role,trust,lifecycle_status,entity_id)
    VALUES ('publisher-irights.info','iRights.info','irights.info','media','journalistic','unbekannt','active',null);
  INSERT INTO public.retrieval_paths
    (id,publisher_id,legacy_source_id,name,method,url,query,parser,priority,status,activation_mode,is_critical,max_items,expected_frequency)
    VALUES
    ('rp-fach-destatis-aktuell-rss','publisher-destatis.de','fach-destatis-aktuell-rss','Statistisches Bundesamt — Aktuelles','rss','https://www.destatis.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed/Aktuell.xml',null,'rss-regex',80,'needs_review','auto',false,null,null),
    ('rp-fach-irights-rss','publisher-irights.info','fach-irights-rss','iRights.info','rss','https://irights.info/feed',null,'rss-regex',80,'needs_review','auto',false,null,null);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'source-activation:path-count'; END IF;
  INSERT INTO public.package_paths (package_id,retrieval_path_id) VALUES
    ('pkg-fach-wirtschaft-energie','rp-fach-destatis-aktuell-rss'),
    ('pkg-fach-digitales-staatsmodernisierung','rp-fach-destatis-aktuell-rss'),
    ('pkg-fach-digitales-staatsmodernisierung','rp-fach-irights-rss');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 3 THEN RAISE EXCEPTION 'source-activation:link-count'; END IF;
  UPDATE public.source_packages SET status='active',updated_at=now()
    WHERE id IN ('pkg-fach-wirtschaft-energie','pkg-fach-digitales-staatsmodernisierung') AND status='prepared';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 2 THEN RAISE EXCEPTION 'source-activation:package-update-count'; END IF;
END;
$activation$;
SELECT jsonb_build_object(
  'packages',(SELECT jsonb_agg(jsonb_build_object('id',id,'status',status)) FROM public.source_packages
    WHERE id IN ('pkg-fach-wirtschaft-energie','pkg-fach-digitales-staatsmodernisierung')),
  'paths',(SELECT jsonb_agg(jsonb_build_object('id',id,'status',status,'activation_mode',activation_mode,'url',url))
    FROM public.retrieval_paths WHERE id IN ('rp-fach-destatis-aktuell-rss','rp-fach-irights-rss')),
  'links',(SELECT count(*) FROM public.package_paths WHERE retrieval_path_id IN
    ('rp-fach-destatis-aktuell-rss','rp-fach-irights-rss'))
) AS activation_receipt;
COMMIT;
```

### Vorbereiteter konservativer Rückweg

Nur bei notwendigem Rückweg und erneut geprüftem Vorwert ausführen,keineErgebnislöschung.

```sql
-- Konservativer Rueckweg: nur pausieren, nie Ergebnisse oder Quellenzeilen loeschen.
BEGIN;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
DO $rollback$
DECLARE n integer;
BEGIN
  PERFORM id FROM public.source_packages WHERE id IN
    ('pkg-fach-wirtschaft-energie','pkg-fach-digitales-staatsmodernisierung') ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.source_packages WHERE id IN
    ('pkg-fach-wirtschaft-energie','pkg-fach-digitales-staatsmodernisierung') AND status='active') <> 2
    THEN RAISE EXCEPTION 'source-rollback:package-drift'; END IF;
  IF (SELECT count(*) FROM public.retrieval_paths WHERE (id,publisher_id,legacy_source_id,url) IN (
    ('rp-fach-destatis-aktuell-rss','publisher-destatis.de','fach-destatis-aktuell-rss','https://www.destatis.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed/Aktuell.xml'),
    ('rp-fach-irights-rss','publisher-irights.info','fach-irights-rss','https://irights.info/feed'))
    AND status='needs_review' AND activation_mode='auto' AND method='rss' AND parser='rss-regex') <> 2
    THEN RAISE EXCEPTION 'source-rollback:path-drift'; END IF;
  UPDATE public.retrieval_paths SET status='paused',activation_mode='manual',updated_at=now()
    WHERE id IN ('rp-fach-destatis-aktuell-rss','rp-fach-irights-rss') AND status='needs_review' AND activation_mode='auto';
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>2 THEN RAISE EXCEPTION 'source-rollback:path-count'; END IF;
  UPDATE public.source_packages SET status='prepared',updated_at=now()
    WHERE id IN ('pkg-fach-wirtschaft-energie','pkg-fach-digitales-staatsmodernisierung') AND status='active';
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>2 THEN RAISE EXCEPTION 'source-rollback:package-count'; END IF;
END;
$rollback$;
COMMIT;
```
