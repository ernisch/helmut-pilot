# Einmaliges Quellen-Abschlussfenster am 15. November 2026

**Endstand19:41UTC: alle sechs Zielaufträge erfolgreich erledigt, vier vollständige
Analysen und zwei echte Abrufquittungen bestätigt. Ein weiterer defekter RSS-Pfad
ist korrigiert. Gesamtversorgung bleibt eingeschränkt; Restbefunde unten.**

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

Um19:08fehlte noch der einmalige Klick in der echten Adminsitzung unter Verwaltung
→ Betrieb → Quellen. Der Betreiber wurde um diesen technisch notwendigen Start
gebeten; keine erneute Freigabe verlangt und keine Anmeldung oder CSRF-Prüfung
umgangen. Der danach tatsächlich gestartete Lauf ist im Abschluss unten belegt.

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

## Tatsächlicher Quellenabschluss,19:18UTC

Der Betreiber bestätigte genau einen Start. Native Laufkennung
`admin-quellen-2026-11-15-6a95d304-5968-4c68-b9d7-da7edb899e0e`:
19:14:13.529–19:18:04.077UTC, Status`success`,12erledigt/53vertagt/
0endgültigeFehler. Die sechs vorbereiteten Zielaufträge sind jeweils mit
`attempts=1` erledigt; kein alter Fehlversuch wurde zurückgesetzt.

| Zielauftrag | Abschluss UTC | Ergebnis |
| --- | --- | --- |
| `13bc9e90-69bf-4fe5-85f9-ebcb8a5dde4f` | 19:14:21.014981 | Destatis-Abruf erledigt |
| `83a52d69-8d83-4907-af4e-9645f6212bce` | 19:14:26.185008 | iRights-Abruf erledigt |
| `e87719a6-46ed-4cca-bbd2-dabf7392507b` | 19:14:40.498354 | DIP-Inhalt erledigt |
| `2ca02a70-aada-4e5b-b6c0-36ba068e51aa` | 19:14:56.473195 | DIP-Inhalt erledigt |
| `b7ab8d16-abcf-41ae-8d3b-064c7ff85a78` | 19:15:11.369686 | ZDF-Inhalt erledigt |
| `1f22fa3a-f69e-4823-ba32-8a5b9fab5623` | 19:15:28.139085 | BMAS-Inhalt erledigt |

Getrennte native Inhaltskontrolle bestätigt zu jedem der vier Rohdokumente
jeweils genau eine verknüpfte Analyse mit `understanding_status=complete`,
Status`neu`. Die zuvor offene BMAS-Analyse wurde durch die normale Verarbeitung
vollständig verstanden. Das ist ein tatsächlicher Wirkungserfolg der Reparaturen,
keine bloße Queue- oder HTTP-Erfolgsmeldung.

Der fehlende Writerhook ausPR1217ist erstmals real produktiv belegt:
`source_crawl_telemetry` enthält genau die beiden tatsächlichen Abrufquittungen
unter den neuen Sourcejob-IDs. Destatis:Status`ok`,10gefunden,0neu,206ms;
iRights:Status`ok`,15gefunden,0neu,238ms. Der erneute Abruf hat vorhandene
Dokumente bestätigt und keine25weiteren Dokumente erfunden. Frühere Attribution-
und Dokumentnachweise bleiben erhalten; keine historischen Zeitmessungen ergänzt.

Die gesonderte Abschlussquittung`quellen-abdeckung`19:18:04.737UTC bleibt
`partial/eingeschraenkt`:0Fehler,88Warnungen,2unbekannteWege,13Konfigurationsdrift,
9Bedarfspakete,0Zuordnungslücken. Technisch erfolgreicher Arbeitslauf und
vollständige fachliche Versorgung sind getrennte Aussagen.

Die beiden unbekannten Wege sind konkret erklärt:Für jeden neuen Feed liegt
jetzt genau eine technische Abrufquittung vor. Der unveränderte bestehende
`source-failure`-Vertrag verlangt `minLaeufe:3`. Die echte reine Ableitung auf den
zwei gespeicherten technischen Zeilen liefert für beide`unbekannt/Zu wenige Läufe`.
Dafür keine Profile, Modelle, HTTP- oder Datenbankwrites verwendet. Es fehlen
jeweils zwei weitere echte Beobachtungen; keine Schwelle gesenkt oder Quittung
vervielfältigt, um heute eine Stabilitätsbehauptung zu erzeugen.

## Enger Abgleich der13Katalogabweichungen und zusätzliche URL-Reparatur

Nur öffentliche Identitätsfelder mit genau demselben Code-Soll abgeglichen,
einschließlich der ergänzenden Paketpfade; keine Profilfelder gelesen. Ergebnis:
zwei bereits umgestellte Landeswege mit nativen Parserketten, zwei manuelle
XML-Wege mit unterschiedlicher Methodenbezeichnung, acht abweichende Google-
Suchdefinitionen und ein defekter RSS-Pfad. Keine pauschale Katalogsynchronisation
oder neue Gesundheitsbehauptung aus diesen unterschiedlichen Befunden.

Für `rp-linksfraktion` ist die konkrete Fehlerursache aktuell bewiesen:

- Eingetragene URL`https://www.dielinkebt.de/presse/pressemitteilungen/rss.xml`:
  19:27:36.824679UTC HTTP404,78200Bytes,
  SHA256`3e501378213dbfd107cbc00e0ff4c9ba8d5b68a2293fd6f7ff85b3294aa1964c`.
- Bereits im bestehenden Code-Soll vorgesehene URL
  `https://www.dielinkebt.de/presse/pressemitteilungen/feed.rss`:
  19:27:38.087513UTC HTTP200,36792Bytes,
  SHA256`776188ed1d35e8f1ae4714ea29aa85fa0de33cccff471011e1fd6af83c9b8ec1`.
  Trotz Server-MIME`text/html` ist der Inhalt eine vollständige RSS-Hülle.
  Der unveränderte native Parser bestätigt15/15datierte Einträge mit direkten
  Originaladressen desselben Herausgebers, offline ohne Modelle oder Writes.

Nach unabhängigem vollständigem Review ohne P1/P2 genau eine atomare URLänderung
am bestehenden Pfad ausgeführt. Rechte, Herausgeber, Status, Parser und alle
sonstigen Felder unverändert; keine Aktivierung und kein weiterer Pipelinecrawl.
Gesonderter Readback19:34:28UTC: korrekte neue URL,
Zeilen-MD5`e04122a882a3b5ed85b5630407646ea6`,
Invarianten-MD5 ohneURL/Änderungszeit`ecea0dd9475691e677edb88811868da5`.
Alle anderen Katalogwege, sieben Erfolgsjobs und Kostenbuch wurden intern
unverändert geprüft. Dieser HTTP-/Parserbeleg ist keine erfundene Production-
Abrufquittung des künftigen korrigierten Weges und keine neue Quellenlizenz.

## Lage und abschließende Kostenkontrolle,19:41UTC

Die einmalige Lageaktualisierung wurde innerhalb des verbliebenen Vertragsraums
vorbereitet: höchstens240Sekunden/maximal0,288017USD zusätzlich, ein bestehender
Pilot, gültige Caches erhalten. Der erste direkte Verbindungsweg scheiterte vor
HTTP-Annahme mit`ConnectionRefusedError`. Native Lesekontrolle19:37:14bestätigte
keinen neuen Lageabschluss, unveränderte Kosten und acht Altreserven. Anschließend
normaler proxyfähiger Zugriff, keine blinde Wiederholung einer angenommenen Mutation.

Native Quittung`briefing-lage-20261115193745-i4wo4`,19:37:45.518–19:37:56.514UTC:
HTTP200,ein Ziel/ein verarbeitetes Profil,0Fehler,gespeicherte vollständige
Lauftelemetrie. Verfügbare Lage mit6Vorgängen und`fromCache:true`; gültigen Cache
behalten, kein neuer Modellaufruf und keine forcierte Neugenerierung. Der
Gesamtstatus bleibt`partial/quellenversorgung-offen`. Kein erneuter Morgenlauf
und keine neue Benachrichtigung ausgelöst.

Endkontrolle19:41:39UTC: Tagesbindung0,711983USD/Gesamt4,095017USD,acht unveränderte
Altreserven,null laufende Jobs. Der Quellenabschluss hat0,075799USD zusätzlich
verbraucht; alle zehn neuen Kostenbuchungen dieses Zeitfensters sind abgeschlossen.
Die Lageprüfung verursachte keine weiteren Modellkosten. Sieben Alt-Erfolgsjobs
weitererledigt, die fünf zuvor gebundenen Payload-MD5 weiterhin identisch.
Einmalkey1verbraucht,9Fenster/2700Sekunden/16Originale; keine weitere Laufberechtigung
abgeleitet und keine Kontingente oder Reserven zurückgesetzt.

**Verbleibend:** fehlende weitere reguläre Stabilitätsbeobachtungen der neuen
Feeds, EUR-Lex-WAF sowie weitere Artikel ohne geprüften Original-/Nutzungsnachweis.
Die letzte native Gesamtversorgung bleibt eingeschränkt; keine allgemeine
Kunden-/Rechtsabnahme. **Genau ein nächster Schritt:** Die bestehende Kontrolle
am16.11.05:25UTC prüft die ohnehin regulären Quittungen und diese konkreten
Restbefunde. Das heutige Zusatzfenster ist dann abgelaufen; keine Selbst-Neuplanung,
kein erneuter Zusatzlauf und keine rückwirkende Löschung erfolgreicher Ergebnisse.

## Exakte zusätzliche URL-Korrektur und Rückweg

Nur die dokumentierte Einzelaktion; kein erneut auszuführender Plan.
Der Rückweg wurde geprüft und nicht ausgeführt.

### URLkorrektur vorwärts

SHA256 `fb6a66ea73727a0d204c59e6b494ae5ef7b14372798198d2e45bdef40efbe13b`.

```sql
BEGIN;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
DO $linke_rss_url$
DECLARE prior text; protected text; post text;
BEGIN
 IF EXISTS(SELECT 1 FROM public.helmut_jobs WHERE status='laeuft') THEN RAISE EXCEPTION 'linke-rss: parallele Verarbeitung';END IF;
 IF EXISTS(SELECT 1 FROM public.helmut_store WHERE id='main-quellenkorrektur-linke-rss-20261115-v1') THEN RAISE EXCEPTION 'linke-rss: Beleg vorhanden, nur lesen';END IF;
 PERFORM 1 FROM public.retrieval_paths WHERE id='rp-linksfraktion' FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.retrieval_paths p WHERE id='rp-linksfraktion'
  AND url='https://www.dielinkebt.de/presse/pressemitteilungen/rss.xml'
  AND md5(to_jsonb(p)::text)='306eb365d0ee7f5cfc19f39b65655e49') THEN RAISE EXCEPTION 'linke-rss: Vorwert drift';END IF;
 prior:=md5((SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.retrieval_paths p WHERE id<>'rp-linksfraktion')::text);
 protected:=md5(jsonb_build_object('jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM public.helmut_jobs j WHERE id IN ('0183eb36-b40b-4d4a-bb08-4dffcdc64939','3922563e-e93f-48c5-ab50-f49afee25637','3ba1a308-50f7-48e0-9068-5cd78091a249','6eeb03b4-2457-49cc-b98a-a488a406479e','b70857dc-7936-434c-8fe2-d5a1a7f287be','7e17cdc7-3da5-46b5-8474-e428e9e97905','8f94986c-4c19-4ffe-acfd-c7c8089a8552')),'cost',(SELECT data->'betriebskostenBudget' FROM public.helmut_store WHERE id='main-auth'))::text);
 UPDATE public.retrieval_paths SET url='https://www.dielinkebt.de/presse/pressemitteilungen/feed.rss',updated_at=now() WHERE id='rp-linksfraktion';
 IF NOT EXISTS(SELECT 1 FROM public.retrieval_paths p WHERE id='rp-linksfraktion' AND md5((to_jsonb(p)-'url'-'updated_at')::text)='ecea0dd9475691e677edb88811868da5') THEN RAISE EXCEPTION 'linke-rss: sonstige Zielfelder geaendert';END IF;
 SELECT md5(to_jsonb(p)::text) INTO STRICT post FROM public.retrieval_paths p WHERE id='rp-linksfraktion';
 INSERT INTO public.helmut_store(id,data) VALUES('main-quellenkorrektur-linke-rss-20261115-v1',jsonb_build_object('version',1,'art','rss-pfadkorrektur','path','rp-linksfraktion','korrigiertAm',clock_timestamp(),'before_md5','306eb365d0ee7f5cfc19f39b65655e49','after_md5',post,'fields_md5','ecea0dd9475691e677edb88811868da5','oldUrl','https://www.dielinkebt.de/presse/pressemitteilungen/rss.xml','newUrl','https://www.dielinkebt.de/presse/pressemitteilungen/feed.rss','oldHttp',404,'newHttp',200,'oldResponseSha256','3e501378213dbfd107cbc00e0ff4c9ba8d5b68a2293fd6f7ff85b3294aa1964c','newResponseSha256','776188ed1d35e8f1ae4714ea29aa85fa0de33cccff471011e1fd6af83c9b8ec1','originalGelesenAm','2026-11-15T19:27:38.087513+00:00','datedRssItems',15,'rightsChanged',false));
 IF prior IS DISTINCT FROM md5((SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.retrieval_paths p WHERE id<>'rp-linksfraktion')::text)
  OR protected IS DISTINCT FROM md5(jsonb_build_object('jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM public.helmut_jobs j WHERE id IN ('0183eb36-b40b-4d4a-bb08-4dffcdc64939','3922563e-e93f-48c5-ab50-f49afee25637','3ba1a308-50f7-48e0-9068-5cd78091a249','6eeb03b4-2457-49cc-b98a-a488a406479e','b70857dc-7936-434c-8fe2-d5a1a7f287be','7e17cdc7-3da5-46b5-8474-e428e9e97905','8f94986c-4c19-4ffe-acfd-c7c8089a8552')),'cost',(SELECT data->'betriebskostenBudget' FROM public.helmut_store WHERE id='main-auth'))::text) THEN RAISE EXCEPTION 'linke-rss: geschuetzter Bestand geaendert';END IF;
END
$linke_rss_url$;
SELECT id,data->>'after_md5' after_md5 FROM public.helmut_store WHERE id='main-quellenkorrektur-linke-rss-20261115-v1';
COMMIT;
```

### URLkorrektur Rückweg

SHA256 `0a8711b5b550c69298054c781f1d2dbb0a448751fe0ba1e9136dfbb96e09afc7`.

```sql
BEGIN;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
DO $linke_rss_rueckweg$
DECLARE b jsonb; at_time timestamptz; n integer;
BEGIN
 SELECT data INTO STRICT b FROM public.helmut_store WHERE id='main-quellenkorrektur-linke-rss-20261115-v1' FOR UPDATE;
 IF b->>'art'<>'rss-pfadkorrektur' OR b->>'path'<>'rp-linksfraktion' OR b->>'newUrl'<>'https://www.dielinkebt.de/presse/pressemitteilungen/feed.rss'
  OR b->>'oldUrl'<>'https://www.dielinkebt.de/presse/pressemitteilungen/rss.xml' THEN RAISE EXCEPTION 'linke-rss-rueckweg: falscher Beleg';END IF;
 at_time:=(b->>'korrigiertAm')::timestamptz;
 PERFORM 1 FROM public.retrieval_paths WHERE id='rp-linksfraktion' FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.retrieval_paths p WHERE id='rp-linksfraktion' AND md5(to_jsonb(p)::text)=b->>'after_md5')
  OR EXISTS(SELECT 1 FROM public.helmut_jobs WHERE status='laeuft')
  OR EXISTS(SELECT 1 FROM public.helmut_jobs WHERE job_type='source_fetch' AND payload->'quelle'->>'id'='linksfraktion' AND updated_at>=at_time)
  OR EXISTS(SELECT 1 FROM public.source_crawl_telemetry WHERE source_id='linksfraktion' AND created_at>=at_time)
  OR EXISTS(SELECT 1 FROM public.raw_documents WHERE source_id='linksfraktion' AND retrieved_at>=at_time)
  THEN RAISE EXCEPTION 'linke-rss-rueckweg: Stand fortgeschritten';END IF;
 UPDATE public.retrieval_paths SET url='https://www.dielinkebt.de/presse/pressemitteilungen/rss.xml',updated_at=now() WHERE id='rp-linksfraktion';
 IF NOT EXISTS(SELECT 1 FROM public.retrieval_paths p WHERE id='rp-linksfraktion' AND md5((to_jsonb(p)-'url'-'updated_at')::text)=b->>'fields_md5') THEN RAISE EXCEPTION 'linke-rss-rueckweg: sonstige Zielfelder';END IF;
 DELETE FROM public.helmut_store WHERE id='main-quellenkorrektur-linke-rss-20261115-v1' AND data=b;
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION 'linke-rss-rueckweg: Belegzahl';END IF;
END
$linke_rss_rueckweg$;
COMMIT;
```
