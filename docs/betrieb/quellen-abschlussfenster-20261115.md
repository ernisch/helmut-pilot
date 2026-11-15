# Einmaliges Quellen-Abschlussfenster am 15. November 2026

## Auftrag und ausgerollter Codeumfang

Erneuter Betreiberauftrag im selben Thread, 15.11. ab18:43UTC:
„Ich möchte bitte dass wir Weiterarbeiten. Du hast jede Freigabe.
Hauptsache wir werden heute fertig“.

Der zuvor bestätigte Tagesstand8/8Fenster/2400Sekunden sperrt die sofortige
Verarbeitung der vier reparierten Quellenaufträge. Die ausdrückliche erneute
Freigabe wird als genau ein begrenztes Abschlussfenster konkretisiert. Der
vorhandene Admin-, Reservierungs-, Worker- und Kostenpfad bleibt maßgeblich;
es entsteht kein zweiter Verarbeitungspfad und kein neuer technischer Zugang.

Die Codeänderung erlaubt ausschließlich am15.11.2026 ab18:43UTC nach
bestätigter normaler Fenster-Tagesgrenze eine zusätzliche atomare Reservierung:

- Eigener globaler Einmalschlüssel `quellenarbeit|quellenabschluss-v1`, Maximum1.
- Bestehender Fensterzähler steigt höchstens von8auf9, Sekunden von2400auf2700.
- Maximal300Sekunden, ein verteilter Worker, vorhandene Lease und Restzeitwachen.
- Originalkontingent bleibt16. Kein zusätzliches HTML-/Paywall-/Bot-Schutzrecht.
- Geldvertrag unverändert1USD jeUTC-Tag/30USDgesamt; keine alten Reserven ändern.
- Nur echter gültiger Adminauftrag mit bestehender Anmeldung und CSRF-Schutz.
  Cron erhält keinen Zusatztermin und kein Recht außerhalb des normalen Slots.
- UNKNOWN, verlorene Antworten und Teilreservierungen bleiben konservativ
  verbraucht. Kein Reset, keine Erstattung oder blinde Wiederholung.
- Am16.11. und vor dem genannten Freigabezeitpunkt keine neue Ausnahme;
  historische14.11.-Rechte und deren Originalgrenzen unverändert.

Der Code allein startet keine Verarbeitung. Der vorhandene Startknopf benötigt
technisch die echte Adminsitzung des Betreibers. Technischer Cron-/Service-Key
ersetzt sie ausdrücklich nicht; kein Auth-/CSRF-Bypass wird eingerichtet.

## Vorprüfung und Abnahmekriterien

Native Lesekontrolle18:48:09UTC: null laufende Jobs; Tagesbindung0,636184USD,
Gesamtbindung4,019218USD, acht offene Altreserven. Maximal0,363816USD zusätzlicher
Geldraum innerhalb des unveränderten Vertrages, nicht als Verbrauchszusage.

Vier betroffene Inhaltsaufträge stehen jeweils auf `wartend`, `attempts=0`,
Priorität80 und denselben vollständigen Zeilen-MD5 wie im [Altstandbeleg](quellen-altstaende-korrektur-20261115.md):

| Auftrag | Quelle |
| --- | --- |
| `2ca02a70-aada-4e5b-b6c0-36ba068e51aa` | DIP292306 |
| `e87719a6-46ed-4cca-bbd2-dabf7392507b` | DIP292309 |
| `b7ab8d16-abcf-41ae-8d3b-064c7ff85a78` | neue ZDF-Version |
| `1f22fa3a-f69e-4823-ba32-8a5b9fab5623` | neue BMAS-Version |

Für den konkreten Einzelstart dürfen diese vier unverarbeiteten Aufträge
vorwertgebunden Vorrang erhalten. Der native SQL-Claim sortiert Priorität
aufsteigend; fachlich höhere Priorität bedeutet daher kleineren Zahlenwert.
Keine erfolgreichen Jobs oder alten Fehlversuche wieder öffnen. Gegebenenfalls
genau zwei frische native RSS-Aufträge für die bereits freigegebenen Feeds
Destatis/iRights ergänzen, damit der produktive Quittungshook tatsächlich
gemessene Abrufe belegen kann. Tagesplan und seine alten Ergebnisse erhalten.
Diese Datenvorbereitung wird separat mit exakten Vorwerten und Rückweg geprüft;
sie ist durch diesen Code-Merge noch nicht ausgeführt.

Erfolgskriterien: echte persistierte Abschlüsse der vier Zielaufträge, echte
Production-Abrufquittungen beider Feeds, erhaltene Attribution und Alt-Erfolge,
unveränderte Kosten-/Originalgrenzen, ehrlicher verbleibender Abdeckungsstatus.
Ein HTTP200, Code-Merge oder reserviertes Zusatzfenster begründet keinen Erfolg.

## Prüfung und Rückweg

Vorhandene isolierte Prüfungen über `scripts/lokal.js`, ohne Provider-/
Productionzugriff:10/10Einmalfenstergruppen,8/8Echtlaufgruppen,21/21normale
Arbeitsfenstergruppen grün. Neue Gegenfälle prüfen insbesondere den fehlenden
Original-Zusatzanspruch, UTC-/GO-Bindung, Replay und verlorene Buchungsantwort.
Unabhängiges lesendes Review des vollständigen Zwei-Dateien-Diffs ohne P1/P2.
Bestehende9/9Routengruppen und16/16Adminstartgruppen einschließlich echter lokaler
HTTP-/Session-/CSRF-Grenzen ebenfalls grün.60/60Prüfplangruppen einschließlich
neuer strikter Abweisungsfälle grün. Der enge CI-Vertrag bindet beide Code-/
Testblobs, Basis19097b28, Belegcommit2cfdd2ab, PR/Branch und vollständigen übrigen
Baum. Unbekannte Runtime oder falscher Mainmerge stoppt, kein Mengenrückfall.
Keine Massen-/Last-/bezahlten Tests; beide Pflichtjobs bleiben am exakten Kopf.

Vor dem Start kann die kleine Codeausnahme durch einen regulären geprüften
Revert entfernt werden. Nach Start keine verbrauchten Zähler, Einmalbindung,
Jobfortschritte oder Ergebnisse zurücksetzen. Bei unbekanntem Ausgang zunächst
ausschließlich native Quittung und Kosten lesen. Keine erneute Startanforderung.
Die alte einmalige Morgenkontrolle bleibt als Rückfall bestehen und wird nur um
tatsächliche neue Ergebnisse ergänzt, ohne neuen Termin oder Selbst-Neuplanung.

## Nach Merge tatsächlich bestätigt,19:04UTC

[PR1223](https://github.com/ernisch/helmut-pilot/pull/1223), geprüfter Kopf
`31702663d83d885bdad7d72522a08e73e678dd8c`,
[PR-CI43749687091](https://github.com/ernisch/helmut-pilot/actions/runs/43749687091)
mit beiden erfolgreichen Pflichtjobs. Unabhängiges zusätzliches Review des
vollständigen CI-/Dokumentationsumfangs ohne P1/P2. Anwendungs-/Testblobs seit
deren Review unverändert. CI umfasst Schnellkern und die genannten bestehenden
betroffenen Verträge; Browserausführung und Massen-/Datenbankabnahme unbetroffen
bewusst ausgelassen, nicht als ausgeführt behauptet.

Merge `338949757a2111c4fd83dbe0ea68194e10563404`,
[Main-CI43749913915](https://github.com/ernisch/helmut-pilot/actions/runs/43749913915)
ebenfalls beide Pflichtjobs erfolgreich. Reguläres Productiondeployment
`dpl_HWV1GYKiPCVzXKBYY5bWTmkeTbyM` READY. Getrennter öffentlicher Shellabruf
19:04:34UTC bestätigt HTTP200 und Runtimeversion33894975,6118Bytes,
SHA256`9df96602b185896eb26f43ea5288992a65989f03dd11eddeb6e7d0df704a217c`.
Kein Lauf wurde dadurch gestartet.

## Ausgeführte Auftragsvorbereitung und getrennter Readback,19:08UTC

Nach unabhängigem Review genau eine atomare vorwertgebundene Transaktion:
vier genannte Inhaltsaufträge von Priorität80auf70 gesetzt, zwei neue globale
RSS-Aufträge eingefügt. Das ist keine Rücksetzung alter Jobs und kein Start der
Verarbeitung. Der native `helmut_jobs_kappen`-Trigger setzt `updated_at` auf die
tatsächliche Änderungszeit; alle anderen Zielfelder bleiben geprüft unverändert.
Ein Rückweg stellt die Priorität wieder her, ohne alte Zeitstempel vorzutäuschen.

Der aktuelle Production-Wrapper `helmut_claim_tagesarbeit` delegiert an
`helmut_claim_jobs`; dessen geprüfte Definition sortiert Priorität aufsteigend
(Definitions-MD5`18627e8d664648dc300b2bb29a111b39`). Andere wartende Inhaltsjobs
haben minimal80;70gibt den vier reparierten Aufträgen tatsächlich Vorrang.
Keine Funktionsdefinition oder Migration wurde geändert.

Die zwei neuen RSS-Schlüssel wurden durch den echten bestehenden Compiler mit
seinem8h-Default und einem deklarierten lokalen synthetischen Eingabeprofil
erzeugt: Fenster`2026-11-15T16Z`, gleiche Abrufdefinitionshashes wie die bereits
freigegebenen Feeds. Keine Produktionskonfiguration geändert, keine echten
Profilfelder gelesen und keine Profilkennung gespeichert; `tenant_id=NULL`,
`beispielMandate=[]`. Die ausdrückliche Sofortanforderung setzt ausschließlich
deren Fälligkeit auf jetzt; die sonstige Compilerverteilung hätte iRights erst
um20:03vorgesehen. Dies wird als Operatorauftrag dokumentiert.

| Neuer RSS-Auftrag | Quelle | Vollständige Zeilen-MD5 nachher |
| --- | --- | --- |
| `13bc9e90-69bf-4fe5-85f9-ebcb8a5dde4f` | Destatis | `46eaf729435383bdbf66262ba3a6bac2` |
| `83a52d69-8d83-4907-af4e-9645f6212bce` | iRights | `0840cb929cb2070ffa41570d068cd55e` |

Vorbereitungsquittung im bestehenden Store:
`main-quellenabschluss-vorbereitung-20261115-v1`. Sie hält die vier vollständigen
Job-Nachwerte und die Invarianten ohne Priorität/Triggerzeit fest. Rückweg sperrt
bei Jobfortschritt, Outbox, laufender Arbeit oder bereits verbrauchter Einmalbindung.
Ein im Review gefundener SQL-Aliaskonflikt im Rückweg wurde vor Ausführung
geschlossen; abschließend kein offener P1/P2-Befund im geprüften Gesamtumfang.

Getrennte native Rücklesung19:08:11UTC bestätigt **6/6 wartend, attempts0 und jetzt
fällig**, viermalPriorität70/zweimal100. Sieben geschützte Alt-Erfolge weiterhin
erledigt; ihre vollständigen Zeilen wurden innerhalb der Transaktion unverändert
geprüft. Kostenbuch und Quoten ebenfalls intern unverändert. Tagesbindung weiter
0,636184USD/Gesamt4,019218USD, acht Altreserven;8Fenster/2400Sekunden/16Originale,
neuer Einmalschlüssel noch unbenutzt und null laufende Jobs.

Technisch fehlender letzter Schritt: einmaliger Klick in der echten Adminsitzung
unter Verwaltung → Betrieb → Quellen. Der Betreiber wurde um diesen Start gebeten;
keine erneute Freigabe verlangt und keine Anmeldung oder CSRF-Prüfung umgangen.
Bis zur tatsächlichen Abschlussquittung bleibt der Verarbeitungsnachweis offen.

## Exakte ausgeführte Datenvorbereitung und gebundener Rückweg

Die folgenden UTF-8-Befehle dokumentieren die Einzelaktion, keinen erneut
auszuführenden Plan. SHA256 jeweils einschließlich abschließendem Zeilenumbruch.
Der Rückweg wurde geprüft und nicht ausgeführt.

EUR-Lex-WAF, ungeklärte Artikelrechte und echte Kunden-/Rechtsgesamtfreigabe
bleiben separate Blocker. Ein Zusatzfenster beseitigt sie nicht und erteilt keine
pauschale Quellenlizenz. Quellenversorgung bleibt bis zum Wirkungsnachweis partial.

### Vorwärts

SHA256 `c5580114c34bc0023403d0fdfb70ce7e954afc8b34c390a23ceea91acbcd5436`.

```sql
-- Einmalige Vorbereitung nach BetreiberGO; noch kein Verarbeitungsstart.
BEGIN;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
DO $abschluss_vorbereitung$
DECLARE protected_md5 text; before_jobs jsonb; after_jobs jsonb; source_jobs jsonb:='[]'::jsonb; spec jsonb; enqueued record; new_md5 text; n integer;
BEGIN
 IF now() < '2026-11-15T18:43:00Z'::timestamptz OR now()>='2026-11-15T23:54:00Z'::timestamptz THEN RAISE EXCEPTION 'abschluss: Tagesbindung'; END IF;
 IF EXISTS(SELECT 1 FROM public.helmut_jobs WHERE status='laeuft') THEN RAISE EXCEPTION 'abschluss: parallele Verarbeitung'; END IF;
 IF EXISTS(SELECT 1 FROM public.helmut_store WHERE id='main-quellenabschluss-vorbereitung-20261115-v1') OR EXISTS(SELECT 1 FROM public.helmut_jobs WHERE idempotency_key IN ('source_fetch|geteilt|f88720f52bd5ace8520254332ff73a7b|2026-11-15T16Z','source_fetch|geteilt|53b24200d71a9e9a02d1d3f1dbc6370d|2026-11-15T16Z')) THEN RAISE EXCEPTION 'abschluss: bereits vorbereitet, nur lesen'; END IF;
 IF EXISTS(SELECT 1 FROM public.helmut_anbieter_fenster WHERE fensterart='tag' AND fenster_start='2026-11-15T00:00:00Z' AND schluessel='quellenarbeit|quellenabschluss-v1' AND verbraucht>0)
   OR (SELECT count(*) FROM public.helmut_anbieter_fenster WHERE fensterart='tag' AND fenster_start='2026-11-15T00:00:00Z' AND (schluessel,verbraucht) IN (('quellenarbeit|fenster',8),('quellenarbeit|reservierte-sekunden',2400),('quellenarbeit|originalabrufe',16)))<>3 THEN RAISE EXCEPTION 'abschluss: Kontingent drift'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.helmut_store s WHERE id='main-auth' AND (data->'betriebskostenBudget'->>'bound')::bigint=4019218
   AND data->'betriebskostenBudget'->'frozen'='null'::jsonb
   AND (SELECT sum(CASE WHEN c->>'status' IN ('abgerechnet','nicht-gesendet') THEN (c->>'cost')::bigint ELSE (c->>'reserved')::bigint END) FROM jsonb_each(s.data->'betriebskostenBudget'->'calls') v(k,c) WHERE c->>'day'='2026-11-15')=636184)
   THEN RAISE EXCEPTION 'abschluss: Kosten drift'; END IF;
 IF (SELECT count(*) FROM public.retrieval_paths x WHERE (id,md5(to_jsonb(x)::text)) IN (('rp-fach-destatis-aktuell-rss','516228f268a0e6c85fb0c6fa6860cc78'),('rp-fach-irights-rss','214e7e4f246a504925754ad085324fd9')))<>2
   OR (SELECT count(*) FROM public.source_packages x WHERE (id,md5(to_jsonb(x)::text)) IN (('pkg-fach-digitales-staatsmodernisierung','82f1fb24eb0775e9cdb7d83718d01dd2'),('pkg-fach-wirtschaft-energie','2c811c58941e79e00fb17d02871c7306')))<>2 THEN RAISE EXCEPTION 'abschluss: Katalog drift'; END IF;
 PERFORM 1 FROM public.helmut_jobs WHERE id IN ('1f22fa3a-f69e-4823-ba32-8a5b9fab5623'::uuid,'2ca02a70-aada-4e5b-b6c0-36ba068e51aa'::uuid,'b7ab8d16-abcf-41ae-8d3b-064c7ff85a78'::uuid,'e87719a6-46ed-4cca-bbd2-dabf7392507b'::uuid) ORDER BY id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.helmut_jobs x WHERE id='1f22fa3a-f69e-4823-ba32-8a5b9fab5623'::uuid AND status='wartend' AND attempts=0 AND priority=80 AND md5(to_jsonb(x)::text)='afbe4f7619b5adf5374553fc83fbab48') THEN RAISE EXCEPTION 'abschluss: Zieljob drift'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.helmut_jobs x WHERE id='2ca02a70-aada-4e5b-b6c0-36ba068e51aa'::uuid AND status='wartend' AND attempts=0 AND priority=80 AND md5(to_jsonb(x)::text)='3a067f640352c244af29b8d5b05393be') THEN RAISE EXCEPTION 'abschluss: Zieljob drift'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.helmut_jobs x WHERE id='b7ab8d16-abcf-41ae-8d3b-064c7ff85a78'::uuid AND status='wartend' AND attempts=0 AND priority=80 AND md5(to_jsonb(x)::text)='45a9b27e019c29efaeac2672797b0dd0') THEN RAISE EXCEPTION 'abschluss: Zieljob drift'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.helmut_jobs x WHERE id='e87719a6-46ed-4cca-bbd2-dabf7392507b'::uuid AND status='wartend' AND attempts=0 AND priority=80 AND md5(to_jsonb(x)::text)='9946ef5642ecc0014aeeff94c60d4fdd') THEN RAISE EXCEPTION 'abschluss: Zieljob drift'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',x.id,'before_md5',md5(to_jsonb(x)::text),'fields_md5',md5((to_jsonb(x)-'priority'-'updated_at')::text)) ORDER BY x.id)
 INTO before_jobs FROM public.helmut_jobs x WHERE id IN ('1f22fa3a-f69e-4823-ba32-8a5b9fab5623'::uuid,'2ca02a70-aada-4e5b-b6c0-36ba068e51aa'::uuid,'b7ab8d16-abcf-41ae-8d3b-064c7ff85a78'::uuid,'e87719a6-46ed-4cca-bbd2-dabf7392507b'::uuid);
 protected_md5:=md5((jsonb_build_object('success',(SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) FROM public.helmut_jobs j WHERE id IN ('0183eb36-b40b-4d4a-bb08-4dffcdc64939','3922563e-e93f-48c5-ab50-f49afee25637','3ba1a308-50f7-48e0-9068-5cd78091a249','6eeb03b4-2457-49cc-b98a-a488a406479e','b70857dc-7936-434c-8fe2-d5a1a7f287be','7e17cdc7-3da5-46b5-8474-e428e9e97905','8f94986c-4c19-4ffe-acfd-c7c8089a8552')),
 'cost',(SELECT data->'betriebskostenBudget' FROM public.helmut_store WHERE id='main-auth'),
 'quotas',(SELECT jsonb_agg(to_jsonb(f) ORDER BY f.schluessel) FROM public.helmut_anbieter_fenster f WHERE fensterart='tag' AND fenster_start='2026-11-15T00:00:00Z' AND schluessel IN ('quellenarbeit|fenster','quellenarbeit|reservierte-sekunden','quellenarbeit|originalabrufe'))))::text);
 UPDATE public.helmut_jobs SET priority=70 WHERE id IN ('1f22fa3a-f69e-4823-ba32-8a5b9fab5623'::uuid,'2ca02a70-aada-4e5b-b6c0-36ba068e51aa'::uuid,'b7ab8d16-abcf-41ae-8d3b-064c7ff85a78'::uuid,'e87719a6-46ed-4cca-bbd2-dabf7392507b'::uuid) AND status='wartend' AND attempts=0 AND priority=80;
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>4 THEN RAISE EXCEPTION 'abschluss: Zielzahl';END IF;
 IF EXISTS(SELECT 1 FROM public.helmut_jobs x JOIN jsonb_array_elements(before_jobs) b ON x.id=(b->>'id')::uuid
  WHERE x.priority<>70 OR md5((to_jsonb(x)-'priority'-'updated_at')::text)<>b->>'fields_md5') THEN RAISE EXCEPTION 'abschluss: unerwartete Zielfelder'; END IF;
 SELECT jsonb_agg(jsonb_build_object('id',x.id,'post_md5',md5(to_jsonb(x)::text),'fields_md5',md5((to_jsonb(x)-'priority'-'updated_at')::text)) ORDER BY x.id) INTO after_jobs FROM public.helmut_jobs x WHERE id IN ('1f22fa3a-f69e-4823-ba32-8a5b9fab5623'::uuid,'2ca02a70-aada-4e5b-b6c0-36ba068e51aa'::uuid,'b7ab8d16-abcf-41ae-8d3b-064c7ff85a78'::uuid,'e87719a6-46ed-4cca-bbd2-dabf7392507b'::uuid);
 FOR spec IN SELECT value FROM jsonb_array_elements('[{"jobType":"source_fetch","idempotencyKey":"source_fetch|geteilt|f88720f52bd5ace8520254332ff73a7b|2026-11-15T16Z","freshnessWindow":"2026-11-15T16Z","tenantId":null,"priority":100,"maxAttempts":5,"dueAt":"2026-11-15T16:07:21.549Z","payload":{"art":"geteilt","quelle":{"anbieter":"destatis.de","id":"fach-destatis-aktuell-rss","name":"Statistisches Bundesamt — Aktuelles","type":"official","crawlMethod":"rss","priority":80,"active":true,"url":"https://www.destatis.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed/Aktuell.xml","rssUrl":"https://www.destatis.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed/Aktuell.xml","rssUrls":["https://www.destatis.de/SiteGlobals/Functions/RSSFeed/DE/RSSNewsfeed/Aktuell.xml"]},"angefordertVon":1,"beispielMandate":[]}},{"jobType":"source_fetch","idempotencyKey":"source_fetch|geteilt|53b24200d71a9e9a02d1d3f1dbc6370d|2026-11-15T16Z","freshnessWindow":"2026-11-15T16Z","tenantId":null,"priority":100,"maxAttempts":5,"dueAt":"2026-11-15T20:03:32.481Z","payload":{"art":"geteilt","quelle":{"anbieter":"irights.info","id":"fach-irights-rss","name":"iRights.info","type":"media","crawlMethod":"rss","priority":80,"active":true,"url":"https://irights.info/feed","rssUrl":"https://irights.info/feed","rssUrls":["https://irights.info/feed"]},"angefordertVon":1,"beispielMandate":[]}}]'::jsonb) LOOP
  SELECT * INTO STRICT enqueued FROM public.helmut_enqueue_job(p_job_type=>'source_fetch',p_idempotency_key=>spec->>'idempotencyKey',p_freshness_window=>spec->>'freshnessWindow',p_payload=>spec->'payload',p_due_at=>now(),p_priority=>100::smallint,p_max_attempts=>5,p_tenant_id=>NULL);
  IF enqueued.neu IS DISTINCT FROM true THEN RAISE EXCEPTION 'abschluss: neuer RSS-Auftrag nicht bestaetigt';END IF;
  SELECT md5(to_jsonb(x)::text) INTO STRICT new_md5 FROM public.helmut_jobs x WHERE id=enqueued.id AND status='wartend' AND attempts=0 AND job_type='source_fetch';
  source_jobs:=source_jobs||jsonb_build_array(jsonb_build_object('id',enqueued.id,'post_md5',new_md5,'key',spec->>'idempotencyKey'));
 END LOOP;
 INSERT INTO public.helmut_store(id,data) VALUES('main-quellenabschluss-vorbereitung-20261115-v1',jsonb_build_object('version',1,'art','quellenabschluss-vorbereitung','prepared_at',clock_timestamp(),'before_jobs',before_jobs,'after_jobs',after_jobs,'source_jobs',source_jobs,'max_additional_usd',0.363816,'max_seconds',300,'priority_before',80,'priority_after',70,'native_shared_window','2026-11-15T16Z','operator_due_now',true));
 IF protected_md5 IS DISTINCT FROM md5((jsonb_build_object('success',(SELECT jsonb_agg(to_jsonb(j) ORDER BY j.id) FROM public.helmut_jobs j WHERE id IN ('0183eb36-b40b-4d4a-bb08-4dffcdc64939','3922563e-e93f-48c5-ab50-f49afee25637','3ba1a308-50f7-48e0-9068-5cd78091a249','6eeb03b4-2457-49cc-b98a-a488a406479e','b70857dc-7936-434c-8fe2-d5a1a7f287be','7e17cdc7-3da5-46b5-8474-e428e9e97905','8f94986c-4c19-4ffe-acfd-c7c8089a8552')),
 'cost',(SELECT data->'betriebskostenBudget' FROM public.helmut_store WHERE id='main-auth'),
 'quotas',(SELECT jsonb_agg(to_jsonb(f) ORDER BY f.schluessel) FROM public.helmut_anbieter_fenster f WHERE fensterart='tag' AND fenster_start='2026-11-15T00:00:00Z' AND schluessel IN ('quellenarbeit|fenster','quellenarbeit|reservierte-sekunden','quellenarbeit|originalabrufe'))))::text) THEN RAISE EXCEPTION 'abschluss: Erfolg Kosten oder Quoten veraendert';END IF;
END
$abschluss_vorbereitung$;
SELECT id,data->'after_jobs' zieljobs,data->'source_jobs' rssjobs FROM public.helmut_store WHERE id='main-quellenabschluss-vorbereitung-20261115-v1';
COMMIT;
```

### Rückweg

SHA256 `6bbee5e5b936a3963c0033297baa6a1a3c2c0efbae78776a2c3fe438c5e2d24a`.

```sql
-- Ausschliesslich VOR Start/Fortschritt; Trigger-Zeitstempel nicht rueckdatieren.
BEGIN;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
DO $abschluss_vorbereitung_rueckweg$
DECLARE b jsonb; item jsonb; n integer;
BEGIN
 SELECT data INTO STRICT b FROM public.helmut_store WHERE id='main-quellenabschluss-vorbereitung-20261115-v1' FOR UPDATE;
 IF b->>'art'<>'quellenabschluss-vorbereitung' OR b->>'native_shared_window'<>'2026-11-15T16Z'
  OR jsonb_array_length(b->'after_jobs')<>4 OR jsonb_array_length(b->'source_jobs')<>2 THEN RAISE EXCEPTION 'abschluss-rueckweg: falscher Beleg';END IF;
 IF EXISTS(SELECT 1 FROM public.helmut_jobs WHERE status='laeuft')
  OR EXISTS(SELECT 1 FROM public.helmut_anbieter_fenster WHERE fensterart='tag' AND fenster_start='2026-11-15T00:00:00Z' AND schluessel='quellenarbeit|quellenabschluss-v1' AND verbraucht>0) THEN RAISE EXCEPTION 'abschluss-rueckweg: Verarbeitung begonnen';END IF;
 PERFORM 1 FROM public.helmut_jobs WHERE id IN (SELECT (x->>'id')::uuid FROM jsonb_array_elements((b->'after_jobs')||(b->'source_jobs')) x) ORDER BY id FOR UPDATE;
 FOR item IN SELECT value FROM jsonb_array_elements((b->'after_jobs')||(b->'source_jobs')) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.helmut_jobs x WHERE id=(item->>'id')::uuid AND status='wartend' AND attempts=0 AND md5(to_jsonb(x)::text)=item->>'post_md5')
   OR EXISTS(SELECT 1 FROM public.helmut_job_outbox WHERE job_id=(item->>'id')::uuid) THEN RAISE EXCEPTION 'abschluss-rueckweg: Job/Outbox fortgeschritten';END IF;
 END LOOP;
 UPDATE public.helmut_jobs SET priority=80 WHERE id IN ('1f22fa3a-f69e-4823-ba32-8a5b9fab5623'::uuid,'2ca02a70-aada-4e5b-b6c0-36ba068e51aa'::uuid,'b7ab8d16-abcf-41ae-8d3b-064c7ff85a78'::uuid,'e87719a6-46ed-4cca-bbd2-dabf7392507b'::uuid) AND priority=70;
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>4 THEN RAISE EXCEPTION 'abschluss-rueckweg: Zielzahl';END IF;
 IF EXISTS(SELECT 1 FROM public.helmut_jobs x JOIN jsonb_array_elements(b->'before_jobs') AS prior_entry(value) ON x.id=(prior_entry.value->>'id')::uuid
  WHERE x.priority<>80 OR md5((to_jsonb(x)-'priority'-'updated_at')::text)<>prior_entry.value->>'fields_md5') THEN RAISE EXCEPTION 'abschluss-rueckweg: Zielfelder';END IF;
 DELETE FROM public.helmut_jobs WHERE id IN (SELECT (source_entry.value->>'id')::uuid FROM jsonb_array_elements(b->'source_jobs') AS source_entry(value)) AND idempotency_key IN ('source_fetch|geteilt|f88720f52bd5ace8520254332ff73a7b|2026-11-15T16Z','source_fetch|geteilt|53b24200d71a9e9a02d1d3f1dbc6370d|2026-11-15T16Z');
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>2 THEN RAISE EXCEPTION 'abschluss-rueckweg: RSS-Zahl';END IF;
 DELETE FROM public.helmut_store WHERE id='main-quellenabschluss-vorbereitung-20261115-v1' AND data=b;
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION 'abschluss-rueckweg: Belegzahl';END IF;
END
$abschluss_vorbereitung_rueckweg$;
SELECT count(*) zieljobs_prioritaet80 FROM public.helmut_jobs WHERE id IN ('1f22fa3a-f69e-4823-ba32-8a5b9fab5623'::uuid,'2ca02a70-aada-4e5b-b6c0-36ba068e51aa'::uuid,'b7ab8d16-abcf-41ae-8d3b-064c7ff85a78'::uuid,'e87719a6-46ed-4cca-bbd2-dabf7392507b'::uuid) AND priority=80;
COMMIT;
```
