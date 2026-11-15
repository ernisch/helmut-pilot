# Quellenaltstände: belegte Korrekturen vom 15. November 2026

**Stand 17:58 UTC: teilweise repariert, Quellenversorgung weiterhin unvollständig.**
Auftrag: belegte Quellenprobleme autonom bearbeiten, erfolgreiche Ergebnisse
erhalten und keine Vollständigkeit aus einem Code-Merge ableiten. Die frühere
reine Lesebeschränkung wurde im selben Thread durch ausdrückliche Reparatur-,
Kosten- und autonome Fortsetzungsfreigaben ersetzt. Geldvertrag und technische
Quellenkontingente bleiben unverändert. Keine neue Architektur oder Migration.

## Ursache und kleinster ausgeführter Eingriff

Der bereits reparierte Leser kann die gespeicherten Originalantworten heute
korrekt auswerten. Zwei alte v1-Negativbelege besitzen aber keinen damaligen
Originalantwort-Pointer. Der bestehende Wiedergewinnungspfad darf diesen
fehlenden Nachweis nicht erfinden oder alte Jobs zurücksetzen. Eine später
gespeicherte echte Originalantwort erlaubt stattdessen einen ausdrücklich
manuellen Originalvergleich und eine neue, unveränderliche Quellenversion.

| Quelle | Belegter Zustand | Ausgeführt |
| --- | --- | --- |
| ZDFheute, Kita-Meldung | Kein kanonischer Auszug; alter v1-Negativbeleg `artikelbereich-mehrdeutig-oder-fehlend`; keine verknüpfte Analyse | Wortgetreuer 167-Zeichen-Einstieg, neue Archivversion, genau ein nativer Versionsauftrag |
| BMAS, 50 Jahre Opferentschädigung | Unterzeile ohne Satzende; alter v1-Negativbeleg `artikeltitel-abweichend`; eine offene Analyse ohne Tatsachentext | Erster vollständiger Satz des ersten Meldungsabsatzes, 188 Zeichen; neue Archivversion und genau ein nativer Versionsauftrag; Analyse und Link unverändert |
| Zwei DIP-Dokumente | Gültige amtliche Felder, aber fehlende Wegzuordnung an der Fundstelle | Bereits 15:18 UTC exakt zwei Zuordnungen `NULL → rp-dip` repariert; [eigener Beleg mit Rückweg](dip-fundstellen-korrektur-20261115.md) |

Der ZDF-Einstieg besteht den unveränderten nativen Parser und die vorhandene
Auszugsprüfung. Beim BMAS wird keine automatische Einstieg-Provenienz behauptet:
Der native Leser bestätigt Artikelziel, Titel und Datum sowie die Unterzeile.
Der manuelle Vergleich belegt separat den darauffolgenden ersten Meldungsabsatz.
Es werden weder Satzzeichen ergänzt noch Originaldaten zeitlich umdeklariert.
Die tatsächliche frühere HTTP-Lesezeit und die heutige Korrekturzeit sind getrennt
quittiert. Keine neue HTTP-Anfrage, kein Modellaufruf und kein Verarbeitungspost
waren für diese beiden Datenkorrekturen erforderlich.

## Bindungen und Rücklesung

| Merkmal | ZDFheute | BMAS |
| --- | --- | --- |
| Rohdokument | `rd-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666` | `rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125` |
| Original | [Kita-Meldung](https://www.zdfheute.de/politik/deutschland/startchancengesetz-kita-bundestag-100.html) | [Opferentschädigung](https://www.bmas.de/DE/Service/Presse/Meldungen/2026/50-jahre-opferentschaedigung.html) |
| Echte HTTP-Lesezeit UTC | 14.11.2026 23:35:26.388469 | 15.11.2026 00:11:23.843 |
| Originalantwort SHA256 | `4482188dd9d77924981042dc1959849206e3a6d283283db449afedc5ba657df3` | `a77a5e50f308e2618d4b44cb976890749432023127789abd55d06abb349cc5f4` |
| Auszug SHA256 | `09ce230082a698d912f54de2c10071c89599d8e123373d819c6bfdb48e980c38` | `14db9902f79a15eb497dd6385f7ea74c7cff9640c7be049b345ddd58dc120514` |
| Neue Quellenversion | `54b80885118d64f4fa06eca79084edf9f41adc845c9238c18a8026ce8680b55d` | `bcd9ff8b141ba7952b9673f08b54a9597dbad3120bb47a995e88be6b5280aef3` |
| Neuer nativer Job | `b7ab8d16-abcf-41ae-8d3b-064c7ff85a78` | `1f22fa3a-f69e-4823-ba32-8a5b9fab5623` |
| Neue Jobzeile MD5 | `45a9b27e019c29efaeac2672797b0dd0` | `afbe4f7619b5adf5374553fc83fbab48` |
| Kanonische Rohzeile nachher MD5 | `e6ad542a6810defe1ac7efff8e2a797b` | `6dc6ac4dd18463c5c134ce0be17624dd` |

ZDF wurde um 17:36 UTC separat zurückgelesen, BMAS um 17:57:30 UTC.
Beide neuen Jobs stehen weiterhin auf `wartend`, `attempts=0`; dies ist kein
Verarbeitungserfolg. Die beiden DIP-Jobs sind ebenfalls weiterhin unverändert
wartend. Alte fehlgeschlagene Jobs, Negativbelege und Quellenversionen wurden
nicht überschrieben. Daher sinkt der historische Tagesfehlerzähler durch eine
neue Quellenversion nicht künstlich.

Die BMAS-Analyse `ko-vg-opferentschädigung-20261102-853ed4` bleibt
`pending/pending`, ohne `was_ist_passiert`, mit unverändert genau einem Link und
Zeilen-MD5 `17b2801ffe09ba2bd62c3a7f290d1519`. Sie wird durch die Quellenkorrektur
nicht freigegeben. Die Transaktion schützt zusätzlich die vollständigen Zeilen
von fünf erfolgreichen Altjobs; getrennte Nachkontrolle bestätigt erneut
`erledigt` und unveränderte Payload-MD5 gegenüber der gebundenen Vorprüfung:

| Erfolgreicher Altjob | Payload-MD5 nach beiden Korrekturen |
| --- | --- |
| `0183eb36-b40b-4d4a-bb08-4dffcdc64939` | `0724b3696328c8ff4b828c486db6e292` |
| `3922563e-e93f-48c5-ab50-f49afee25637` | `b9c0cd8fb2895c9037d218b484eb32e9` |
| `3ba1a308-50f7-48e0-9068-5cd78091a249` | `63427b842bf69e4e321f80cdc05d158a` |
| `6eeb03b4-2457-49cc-b98a-a488a406479e` | `5913837df14d5616b71f1e661755dd89` |
| `b70857dc-7936-434c-8fe2-d5a1a7f287be` | `98248cdf744dbb01be6479076e621a1d` |

## Prüfung und Schutzgrenzen

- Vorhandene `artikelkontext-quellenlayout-test.js`: 30/30 grün, über
  `scripts/lokal.js`, einschließlich falschem Titel/Datum/Ziel, versteckten
  Inhalten und Erhalt unbekannter Cache-Ausgänge. Kein Modell/Production-Schreiben.
- Zwei eng begrenzte Offline-Proben erzeugen die neuen Jobschlüssel durch den
  echten `source_fetch`-Handler mit injiziertem Transport und Speicher. Keine
  geratenen Idempotenzschlüssel, keine echten Netz- oder Modellaufrufe.
- Vorwerte, Originalhash, Originalabsatz, neue Archivhashes und native
  Auszugsprüfung geprüft. Die erste BMAS-Probe stoppte korrekt an der Differenz
  zwischen archiviertem `raw:{}` und kanonischem `raw_metadata:NULL`; danach
  explizite leere öffentliche Archivmetadaten verwendet, Originalhash identisch.
  Die kanonischen Metadaten blieben unverändert.
- Unabhängiges lesendes Review beider vollständigen SQL-/Rückwegumfänge.
  Gefundene Rückwegrisiken geschlossen: ZDF-Rückweg sperrt bei jeder Outboxzeile;
  BMAS-Rückweg sperrt zusätzlich den bestehenden KO und Link vor der Prüfung.
  Final kein offener P1/P2-Befund im geprüften Umfang.
- Jede Änderung ist atomar und an vollständige Vorwert-MD5 gebunden. Keine
  parallele laufende Verarbeitung; alte Erfolge intern vollständig geschützt.
  Rückweg nur vor jeder Weiterverarbeitung und bei unveränderten Nachwerten.
  Bei Job-/KO-/Linkfortschritt, Outbox oder weiterer Versionsverwendung abbrechen.

Die untenstehenden Befehle dokumentieren die ausgeführten Einzelkorrekturen;
sie sind keine Migration und kein erneut auszuführender Plan. Keine Rohoriginale,
Profile, privaten politischen Felder, Zugänge oder vollständigen Auth-Speicher
wurden exportiert oder in Git aufgenommen.

## Verbleibende tatsächliche Grenzen

1. **Wirkungsnachweis offen:** 17:57 UTC stehen vier reparierte/neu versionierte
   Inhaltsaufträge noch aus. Der seit PR1217 produktive Abrufquittungs-Hook hat
   für die zwei neuen Feeds noch keinen nachfolgenden echten Production-Abruf
   quittiert. Tageskontingent unverändert 8/8 Fenster, 2400/2400 Sekunden,
   16/16 Originalabrufe. Die zwei ausdrücklich auf den 14. November begrenzten
   Ausnahmefenster erlauben keinen weiteren Lauf am 15. November.
2. **EUR-Lex extern blockiert:** offizielles Feedziel liefert 202 HTML mit
   AWS-WAF-Challenge statt RSS; native Ablehnung korrekt. Keine Bot-Schutzumgehung
   und kein Parserpatch ohne belegten Parserfehler. Originalbelege im
   [Sofortbeleg](versorgung-sofortpruefung-20261115.md).
3. **Weitere Artikel nicht qualifiziert:** Von den zuvor 36 offenen Inhaltsjobs
   liegen 33 Webartikel auf nicht freigegebenen exakten Hosts. Für sieben näher
   geprüfte Medien-/Verbandsartikel fehlt auch ein gespeicherter Artikelbeleg.
   Keine Lizenz aus Suchquell-ID oder RSS ableiten. Ein freigegebener NDR-Artikel
   wartet noch auf seinen ersten Versuch. Weitere alte BMAS-/Bundestagsfehler
   sind kein Anlass, fehlende Antwort-Pointer oder kürzere Originalpräfixe zu
   erfinden: BMAS-Digitalgipfel hat nur eine unvollständige Unterzeile als
   bestätigten Einstieg; sein erster Meldungssatz überschreitet die bestehende
   240-Zeichen-Auszuggrenze. Eine gespeicherte Bundestags-Bildterminantwort
   beginnt mit Terminmetadaten statt einem vollständigen kurzen Satz.
   Diese Fälle wurden nicht als erfolgreich umgewertet.

Enger Tagesaggregatstand nach Ergänzung der zwei neuen Versionen:
`source_fetch` 154 erledigt/1 fehlgeschlagen;
`document_understanding` 94 erledigt/61 fehlgeschlagen/38 wartend.
Die 61 enthalten unverändert historische Fehlversuche; 38 enthält die zwei
neuen Versionsaufträge zusätzlich zu den bisherigen 36. Kein Summen-PASS.
Letzte echte Abdeckungsquittung bleibt 0 Fehler/88 Warnungen/2 unbekannte Wege/
13 Konfigurationsdrift und `partial`, keine künstliche Neuberechnung oder
nachträglich erfundenen technischen Messwerte.

Kostenkontrolle 17:56:45 UTC: 0,636184 USD Tagesbindung, 4,019218 USD insgesamt,
acht unveränderte Altreserven; null laufende Jobs. Beide Einzelkorrekturen
starten keine kostenpflichtige Verarbeitung. Grenzen 1 USD/UTC-Tag und
30 USD insgesamt bleiben bestehen.

**Genau ein nächster Schritt:** Die bestehende einmalige Kontrolle am
16. November 05:25 UTC prüft die ohnehin regulären Abschlüsse der vier
betroffenen Jobs sowie echte Abrufquittungen und Ausgabenwirkung. Kein neuer
Zusatzlauf und keine Selbst-Neuplanung. Eine noch fehlende Quellen-/Kunden-/
Rechtsabnahme bleibt offen; dieser Beleg erklärt Helmut nicht für fertig.

## Exakte ausgeführte Befehle und gebundene Rückwege

Die SHA256 beziehen sich jeweils auf die unveränderte UTF-8-Datei mit abschließendem
Zeilenumbruch. Rückwege wurden nur geprüft und nicht ausgeführt.

### ZDF vorwärts

SHA256 `523d2aaef5439bb6d06901e483bb5d7e7641417fa376a2800a31bfc5c323c009`.

```sql
-- Genau ein belegter neuer Auszugsstand; kein Reset alter Negative/Jobs.
BEGIN;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
DO $zdf_167_zeichen$
DECLARE n integer; j_new record; geschuetzt text; j_md5 text;
BEGIN
 IF EXISTS (SELECT 1 FROM public.helmut_jobs WHERE status='laeuft') THEN RAISE EXCEPTION 'zdf: parallele Verarbeitung'; END IF;
 PERFORM 1 FROM public.helmut_jobs WHERE id='b679f379-98ea-4efd-8026-ec86ea64d9ba' FOR UPDATE;
 PERFORM 1 FROM public.raw_documents WHERE id='rd-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666' FOR UPDATE;
 PERFORM 1 FROM public.helmut_store WHERE id IN ('main-artikelkontext-cd569d1a4f763d9fabe2f91e1bf2538ea0377568d49c8ef96a8ce2a27a63095a','main-rohstand-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666-7a67501ca508d3a31748dc40de81b395c6319518b3febbd9242400d88eb996b6') FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.helmut_jobs j WHERE id='b679f379-98ea-4efd-8026-ec86ea64d9ba' AND status='fehlgeschlagen'
   AND md5(to_jsonb(j)::text)='26eae74495992d19aff93f308fa84980') THEN RAISE EXCEPTION 'zdf: Altauftrag abweichend'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.raw_documents d WHERE id='rd-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666' AND summary IS NULL
   AND md5(to_jsonb(d)::text)='59049831337727d494fc085333b603a8') THEN RAISE EXCEPTION 'zdf: Rohvorwert abweichend'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.helmut_store WHERE id='main-artikelkontext-cd569d1a4f763d9fabe2f91e1bf2538ea0377568d49c8ef96a8ce2a27a63095a' AND md5(data::text)='4fb451d8a8fbc6851a11284f48fe4be5')
   OR NOT EXISTS(SELECT 1 FROM public.helmut_store WHERE id='main-rohstand-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666-7a67501ca508d3a31748dc40de81b395c6319518b3febbd9242400d88eb996b6' AND md5(data::text)='4795026420e41dba996acbff6e671087')
   THEN RAISE EXCEPTION 'zdf: unveraenderlicher Altbeleg abweichend'; END IF;
 IF EXISTS(SELECT 1 FROM public.ko_document_links WHERE raw_document_id='rd-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666') THEN RAISE EXCEPTION 'zdf: ungepruefte Altanalysen'; END IF;
 IF EXISTS(SELECT 1 FROM public.helmut_store WHERE id IN ('main-rohstand-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666-54b80885118d64f4fa06eca79084edf9f41adc845c9238c18a8026ce8680b55d','main-quellenkorrektur-zdf-20261115-54b80885118d64f4'))
   OR EXISTS(SELECT 1 FROM public.helmut_jobs WHERE idempotency_key='document_understanding|a2042bad3bf22ef8cba3e3907d9b3d56|6da2fced2276e3b0dee930af00a009ae') THEN RAISE EXCEPTION 'zdf: neue Version bereits vorhanden, nur lesen'; END IF;
 geschuetzt:=md5((jsonb_build_object('old_job',(SELECT to_jsonb(j) FROM public.helmut_jobs j WHERE id='b679f379-98ea-4efd-8026-ec86ea64d9ba'),
 'old_negative',(SELECT data FROM public.helmut_store WHERE id='main-artikelkontext-cd569d1a4f763d9fabe2f91e1bf2538ea0377568d49c8ef96a8ce2a27a63095a'),
 'old_archive',(SELECT data FROM public.helmut_store WHERE id='main-rohstand-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666-7a67501ca508d3a31748dc40de81b395c6319518b3febbd9242400d88eb996b6'),
 'success_jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM public.helmut_jobs j WHERE id IN
 ('0183eb36-b40b-4d4a-bb08-4dffcdc64939','3922563e-e93f-48c5-ab50-f49afee25637','3ba1a308-50f7-48e0-9068-5cd78091a249','6eeb03b4-2457-49cc-b98a-a488a406479e','b70857dc-7936-434c-8fe2-d5a1a7f287be'))))::text);
 UPDATE public.raw_documents d SET summary='Sprache und Entwicklung sollen unter die Lupe genommen und bei Bedarf gefördert werden - das sieht ein neues Gesetz für Kita-Kinder vor. Strittig ist die Finanzierung.'
   WHERE id='rd-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666' AND summary IS NULL AND md5(to_jsonb(d)::text)='59049831337727d494fc085333b603a8';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 OR NOT EXISTS(SELECT 1 FROM public.raw_documents d WHERE id='rd-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666' AND md5(to_jsonb(d)::text)='e6ad542a6810defe1ac7efff8e2a797b')
   THEN RAISE EXCEPTION 'zdf: unerwarteter Roh-Nachwert'; END IF;
 INSERT INTO public.helmut_store(id,data) VALUES('main-rohstand-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666-54b80885118d64f4fa06eca79084edf9f41adc845c9238c18a8026ce8680b55d','{"version":1,"quellenHash":"54b80885118d64f4fa06eca79084edf9f41adc845c9238c18a8026ce8680b55d","dokument":{"id":"rd-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666","url":"https://www.zdfheute.de/politik/deutschland/startchancengesetz-kita-bundestag-100.html","canonical_url":"https://zdfheute.de/politik/deutschland/startchancengesetz-kita-bundestag-100.html","title":"Kita-Kinder: Gesetz zur Förderung frühkindlicher Bildung - ZDFheute","source_name":"ZDFheute","source_id":"general-bundestag-plenum","source_type":"bundestag","link_type":"direct","document_type":null,"published_at":"2026-11-12T12:52:00+00:00","retrieved_at":"2026-11-14T04:03:43.887+00:00","summary":"Sprache und Entwicklung sollen unter die Lupe genommen und bei Bedarf gefördert werden - das sieht ein neues Gesetz für Kita-Kinder vor. Strittig ist die Finanzierung.","raw":{"originalUrl":"https://news.google.com/rss/articles/CBMijwFBVV95cUxQN01nZ05JZ1VmbTJ0MUhmNGFoRDhFX3JaRzJQd3QyVmJpWWxJYjY0NG81dDhHaHY5X3NGYTBUVzViTXFGY3ZHRS1LSkwyN1VCU3dPRjZhX3JzUkxTeGZSUFl6TVpnX21HczlrWUdiT1hta2ZrUm9DYlJoMlBYQ1pWbGV1VGFpcVZtQlBvNm05QQ?oc=5","sourcePriority":80}}}'::jsonb);
 SELECT * INTO STRICT j_new FROM public.helmut_enqueue_job(
   p_job_type=>'document_understanding',p_idempotency_key=>'document_understanding|a2042bad3bf22ef8cba3e3907d9b3d56|6da2fced2276e3b0dee930af00a009ae',
   p_freshness_window=>'2026-11-15T00Z',p_payload=>'{"dokumentIds":["rd-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666"],"quellenstaende":{"rd-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666":"54b80885118d64f4fa06eca79084edf9f41adc845c9238c18a8026ce8680b55d"}}'::jsonb,
   p_due_at=>clock_timestamp(),p_priority=>80::smallint,p_max_attempts=>3,p_tenant_id=>NULL);
 IF j_new.neu IS DISTINCT FROM true THEN RAISE EXCEPTION 'zdf: neuer Versionsauftrag nicht bestaetigt'; END IF;
 SELECT md5(to_jsonb(j)::text) INTO STRICT j_md5 FROM public.helmut_jobs j WHERE id=j_new.id AND status='wartend' AND attempts=0;
 INSERT INTO public.helmut_store(id,data) VALUES('main-quellenkorrektur-zdf-20261115-54b80885118d64f4',
   '{"version":1,"art":"manueller-originalvergleich","dokumentId":"rd-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666","originalUrl":"https://www.zdfheute.de/politik/deutschland/startchancengesetz-kita-bundestag-100.html","originalGelesenAm":"2026-11-14T23:35:26.388469+00:00","originalBytes":260762,"originalSha256":"4482188dd9d77924981042dc1959849206e3a6d283283db449afedc5ba657df3","auszugSha256":"09ce230082a698d912f54de2c10071c89599d8e123373d819c6bfdb48e980c38","vorherStand":"7a67501ca508d3a31748dc40de81b395c6319518b3febbd9242400d88eb996b6","nachherStand":"54b80885118d64f4fa06eca79084edf9f41adc845c9238c18a8026ce8680b55d"}'::jsonb||jsonb_build_object('korrigiertAm',clock_timestamp(),'job_id',j_new.id,'job_row_md5',j_md5));
 IF geschuetzt IS DISTINCT FROM md5((jsonb_build_object('old_job',(SELECT to_jsonb(j) FROM public.helmut_jobs j WHERE id='b679f379-98ea-4efd-8026-ec86ea64d9ba'),
 'old_negative',(SELECT data FROM public.helmut_store WHERE id='main-artikelkontext-cd569d1a4f763d9fabe2f91e1bf2538ea0377568d49c8ef96a8ce2a27a63095a'),
 'old_archive',(SELECT data FROM public.helmut_store WHERE id='main-rohstand-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666-7a67501ca508d3a31748dc40de81b395c6319518b3febbd9242400d88eb996b6'),
 'success_jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM public.helmut_jobs j WHERE id IN
 ('0183eb36-b40b-4d4a-bb08-4dffcdc64939','3922563e-e93f-48c5-ab50-f49afee25637','3ba1a308-50f7-48e0-9068-5cd78091a249','6eeb03b4-2457-49cc-b98a-a488a406479e','b70857dc-7936-434c-8fe2-d5a1a7f287be'))))::text) THEN RAISE EXCEPTION 'zdf: geschuetzte Altstaende veraendert'; END IF;
END
$zdf_167_zeichen$;
SELECT id,data->>'job_id' AS neuer_job,data->>'job_row_md5' AS neuer_job_md5,data->>'nachherStand' AS neuer_stand FROM public.helmut_store WHERE id='main-quellenkorrektur-zdf-20261115-54b80885118d64f4';
COMMIT;
```

### ZDF Rückweg

SHA256 `745e9ae9937dca52d1acf58e99b1dca1f90696f5493c724e3c623e0c8d719c45`.

```sql
-- Nur vor Weiterverarbeitung des neuen Jobs; keine bestaetigten Ergebnisse loeschen.
BEGIN;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
DO $zdf_rueckweg$
DECLARE b jsonb; n integer;
BEGIN
 SELECT data INTO STRICT b FROM public.helmut_store WHERE id='main-quellenkorrektur-zdf-20261115-54b80885118d64f4' FOR UPDATE;
 IF b->>'nachherStand'<>'54b80885118d64f4fa06eca79084edf9f41adc845c9238c18a8026ce8680b55d' OR b->>'originalSha256'<>'4482188dd9d77924981042dc1959849206e3a6d283283db449afedc5ba657df3' THEN RAISE EXCEPTION 'zdf-rueckweg: fremder Korrekturbeleg'; END IF;
 PERFORM 1 FROM public.helmut_jobs WHERE id=(b->>'job_id')::uuid FOR UPDATE;
 PERFORM 1 FROM public.raw_documents WHERE id='rd-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666' FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.helmut_job_outbox WHERE job_id=(b->>'job_id')::uuid) THEN RAISE EXCEPTION 'zdf-rueckweg: Versandbeleg vorhanden'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.helmut_jobs j WHERE id=(b->>'job_id')::uuid AND status='wartend' AND attempts=0
   AND md5(to_jsonb(j)::text)=b->>'job_row_md5') THEN RAISE EXCEPTION 'zdf-rueckweg: Job fortgeschritten oder abweichend'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.raw_documents d WHERE id='rd-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666' AND md5(to_jsonb(d)::text)='e6ad542a6810defe1ac7efff8e2a797b')
   OR EXISTS(SELECT 1 FROM public.ko_document_links WHERE raw_document_id='rd-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666') THEN RAISE EXCEPTION 'zdf-rueckweg: Original weiterverwendet'; END IF;
 IF EXISTS(SELECT 1 FROM public.helmut_jobs WHERE id<>(b->>'job_id')::uuid AND payload->'quellenstaende'->>'rd-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666'='54b80885118d64f4fa06eca79084edf9f41adc845c9238c18a8026ce8680b55d')
   THEN RAISE EXCEPTION 'zdf-rueckweg: weitere Versionsverwendung'; END IF;
 DELETE FROM public.helmut_jobs WHERE id=(b->>'job_id')::uuid AND idempotency_key='document_understanding|a2042bad3bf22ef8cba3e3907d9b3d56|6da2fced2276e3b0dee930af00a009ae';
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION 'zdf-rueckweg: Jobzahl';END IF;
 UPDATE public.raw_documents SET summary=NULL WHERE id='rd-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666';
 IF NOT EXISTS(SELECT 1 FROM public.raw_documents d WHERE id='rd-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666' AND md5(to_jsonb(d)::text)='59049831337727d494fc085333b603a8') THEN RAISE EXCEPTION 'zdf-rueckweg: Rohvorwert'; END IF;
 DELETE FROM public.helmut_store WHERE id='main-rohstand-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666-54b80885118d64f4fa06eca79084edf9f41adc845c9238c18a8026ce8680b55d' AND data='{"version":1,"quellenHash":"54b80885118d64f4fa06eca79084edf9f41adc845c9238c18a8026ce8680b55d","dokument":{"id":"rd-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666","url":"https://www.zdfheute.de/politik/deutschland/startchancengesetz-kita-bundestag-100.html","canonical_url":"https://zdfheute.de/politik/deutschland/startchancengesetz-kita-bundestag-100.html","title":"Kita-Kinder: Gesetz zur Förderung frühkindlicher Bildung - ZDFheute","source_name":"ZDFheute","source_id":"general-bundestag-plenum","source_type":"bundestag","link_type":"direct","document_type":null,"published_at":"2026-11-12T12:52:00+00:00","retrieved_at":"2026-11-14T04:03:43.887+00:00","summary":"Sprache und Entwicklung sollen unter die Lupe genommen und bei Bedarf gefördert werden - das sieht ein neues Gesetz für Kita-Kinder vor. Strittig ist die Finanzierung.","raw":{"originalUrl":"https://news.google.com/rss/articles/CBMijwFBVV95cUxQN01nZ05JZ1VmbTJ0MUhmNGFoRDhFX3JaRzJQd3QyVmJpWWxJYjY0NG81dDhHaHY5X3NGYTBUVzViTXFGY3ZHRS1LSkwyN1VCU3dPRjZhX3JzUkxTeGZSUFl6TVpnX21HczlrWUdiT1hta2ZrUm9DYlJoMlBYQ1pWbGV1VGFpcVZtQlBvNm05QQ?oc=5","sourcePriority":80}}}'::jsonb;
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION 'zdf-rueckweg: Archivzahl';END IF;
 DELETE FROM public.helmut_store WHERE id='main-quellenkorrektur-zdf-20261115-54b80885118d64f4' AND data=b;
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION 'zdf-rueckweg: Belegzahl';END IF;
END
$zdf_rueckweg$;
SELECT id,md5(to_jsonb(d)::text) AS wiederhergestellter_rohwert FROM public.raw_documents d WHERE id='rd-6ac9b0e6cd5e252547d837041dffe6582a9b7088f2c4bfb32e3207a397677666';
COMMIT;
```

### BMAS vorwärts

SHA256 `d35637254f2e92e4dc5b1893c5530d7ae800fd751fc9c015e61d37b221cfc6e3`.

```sql
-- Genau ein belegter neuer Auszugsstand; kein Reset alter Negative/Jobs.
BEGIN;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
DO $bmas_188_zeichen$
DECLARE n integer; j_new record; geschuetzt text; j_md5 text;
BEGIN
 IF EXISTS (SELECT 1 FROM public.helmut_jobs WHERE status='laeuft') THEN RAISE EXCEPTION 'bmas: parallele Verarbeitung'; END IF;
 PERFORM 1 FROM public.helmut_jobs WHERE id='3c2df765-2e98-40d3-8658-31dac6b960a0' FOR UPDATE;
 PERFORM 1 FROM public.raw_documents WHERE id='rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125' FOR UPDATE;
 PERFORM 1 FROM public.helmut_store WHERE id IN ('main-artikelkontext-0b0f9a3fea4fd4d74f4e24b1111e6f9951b35d1ce6af194cf335f15b2b44a1a9','main-rohstand-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125-31bffde2aa9ab680bf04b7a9349db2424ff1a6902d49273eccb4a43218a7edec') FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public.helmut_jobs j WHERE id='3c2df765-2e98-40d3-8658-31dac6b960a0' AND status='fehlgeschlagen'
   AND md5(to_jsonb(j)::text)='552ae7851994ea2b9d53acc8b0195bc5') THEN RAISE EXCEPTION 'bmas: Altauftrag abweichend'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.raw_documents d WHERE id='rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125' AND summary='Neue Kampagne von BMAS und BAS--Bundesamt für Soziale Sicherung informiert über Ansprüche und Hilfen nach Gewalttaten'
   AND md5(to_jsonb(d)::text)='42e568469be156432582844550f0ade9') THEN RAISE EXCEPTION 'bmas: Rohvorwert abweichend'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.helmut_store WHERE id='main-artikelkontext-0b0f9a3fea4fd4d74f4e24b1111e6f9951b35d1ce6af194cf335f15b2b44a1a9' AND md5(data::text)='cb538525864e024f453d479b4bc442be')
   OR NOT EXISTS(SELECT 1 FROM public.helmut_store WHERE id='main-rohstand-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125-31bffde2aa9ab680bf04b7a9349db2424ff1a6902d49273eccb4a43218a7edec' AND md5(data::text)='bf53a6f47cb2db154baa0ff1b77ea483')
   THEN RAISE EXCEPTION 'bmas: unveraenderlicher Altbeleg abweichend'; END IF;
 PERFORM 1 FROM public.knowledge_objects WHERE id='ko-vg-opferentschädigung-20261102-853ed4' FOR UPDATE;
 PERFORM 1 FROM public.ko_document_links WHERE raw_document_id='rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125' FOR UPDATE;
 IF (SELECT count(*) FROM public.ko_document_links WHERE raw_document_id='rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125')<>1
  OR NOT EXISTS(SELECT 1 FROM public.ko_document_links WHERE raw_document_id='rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125' AND knowledge_object_id='ko-vg-opferentschädigung-20261102-853ed4')
  OR NOT EXISTS(SELECT 1 FROM public.knowledge_objects k WHERE id='ko-vg-opferentschädigung-20261102-853ed4' AND status='pending' AND understanding_status='pending' AND was_ist_passiert IS NULL AND md5(to_jsonb(k)::text)='17b2801ffe09ba2bd62c3a7f290d1519')
  THEN RAISE EXCEPTION 'bmas: Altanalyse oder Verknuepfung abweichend'; END IF;
 IF EXISTS(SELECT 1 FROM public.helmut_store WHERE id IN ('main-rohstand-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125-bcd9ff8b141ba7952b9673f08b54a9597dbad3120bb47a995e88be6b5280aef3','main-quellenkorrektur-bmas-20261115-bcd9ff8b141ba795'))
   OR EXISTS(SELECT 1 FROM public.helmut_jobs WHERE idempotency_key='document_understanding|cee5c8456b39e4d889568b0413397473|3f12c4c5210ab85567a62a8f6ce2d9fc') THEN RAISE EXCEPTION 'bmas: neue Version bereits vorhanden, nur lesen'; END IF;
 geschuetzt:=md5((jsonb_build_object('ko',(SELECT to_jsonb(k) FROM public.knowledge_objects k WHERE id='ko-vg-opferentschädigung-20261102-853ed4'),
 'links',(SELECT jsonb_agg(to_jsonb(l) ORDER BY knowledge_object_id,raw_document_id) FROM public.ko_document_links l WHERE raw_document_id='rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125'),
 'old_job',(SELECT to_jsonb(j) FROM public.helmut_jobs j WHERE id='3c2df765-2e98-40d3-8658-31dac6b960a0'),
 'old_negative',(SELECT data FROM public.helmut_store WHERE id='main-artikelkontext-0b0f9a3fea4fd4d74f4e24b1111e6f9951b35d1ce6af194cf335f15b2b44a1a9'),
 'old_archive',(SELECT data FROM public.helmut_store WHERE id='main-rohstand-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125-31bffde2aa9ab680bf04b7a9349db2424ff1a6902d49273eccb4a43218a7edec'),
 'success_jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM public.helmut_jobs j WHERE id IN
 ('0183eb36-b40b-4d4a-bb08-4dffcdc64939','3922563e-e93f-48c5-ab50-f49afee25637','3ba1a308-50f7-48e0-9068-5cd78091a249','6eeb03b4-2457-49cc-b98a-a488a406479e','b70857dc-7936-434c-8fe2-d5a1a7f287be'))))::text);
 UPDATE public.raw_documents d SET summary='Das Bundesministerium für Arbeit und Soziales ( BMAS ) und das Bundesamt für Soziale Sicherung (BAS) starten am 2. November 2026 eine Informationskampagne zum Sozialen Entschädigungsrecht.'
   WHERE id='rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125' AND summary='Neue Kampagne von BMAS und BAS--Bundesamt für Soziale Sicherung informiert über Ansprüche und Hilfen nach Gewalttaten' AND md5(to_jsonb(d)::text)='42e568469be156432582844550f0ade9';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 OR NOT EXISTS(SELECT 1 FROM public.raw_documents d WHERE id='rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125' AND md5(to_jsonb(d)::text)='6dc6ac4dd18463c5c134ce0be17624dd')
   THEN RAISE EXCEPTION 'bmas: unerwarteter Roh-Nachwert'; END IF;
 INSERT INTO public.helmut_store(id,data) VALUES('main-rohstand-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125-bcd9ff8b141ba7952b9673f08b54a9597dbad3120bb47a995e88be6b5280aef3','{"version":1,"quellenHash":"bcd9ff8b141ba7952b9673f08b54a9597dbad3120bb47a995e88be6b5280aef3","dokument":{"id":"rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125","url":"https://www.bmas.de/DE/Service/Presse/Meldungen/2026/50-jahre-opferentschaedigung.html","canonical_url":"https://bmas.de/DE/Service/Presse/Meldungen/2026/50-jahre-opferentschaedigung.html","title":"50 Jahre Opferentschädigung","source_name":"BMAS","source_id":"bmas","source_type":"ministry","link_type":"direct","document_type":null,"published_at":"2026-11-02T10:56:00+00:00","retrieved_at":"2026-11-05T21:49:22.082+00:00","summary":"Das Bundesministerium für Arbeit und Soziales ( BMAS ) und das Bundesamt für Soziale Sicherung (BAS) starten am 2. November 2026 eine Informationskampagne zum Sozialen Entschädigungsrecht.","raw":{}}}'::jsonb);
 SELECT * INTO STRICT j_new FROM public.helmut_enqueue_job(
   p_job_type=>'document_understanding',p_idempotency_key=>'document_understanding|cee5c8456b39e4d889568b0413397473|3f12c4c5210ab85567a62a8f6ce2d9fc',
   p_freshness_window=>'2026-11-15T00Z',p_payload=>'{"dokumentIds":["rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125"],"quellenstaende":{"rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125":"bcd9ff8b141ba7952b9673f08b54a9597dbad3120bb47a995e88be6b5280aef3"}}'::jsonb,
   p_due_at=>clock_timestamp(),p_priority=>80::smallint,p_max_attempts=>3,p_tenant_id=>NULL);
 IF j_new.neu IS DISTINCT FROM true THEN RAISE EXCEPTION 'bmas: neuer Versionsauftrag nicht bestaetigt'; END IF;
 SELECT md5(to_jsonb(j)::text) INTO STRICT j_md5 FROM public.helmut_jobs j WHERE id=j_new.id AND status='wartend' AND attempts=0;
 INSERT INTO public.helmut_store(id,data) VALUES('main-quellenkorrektur-bmas-20261115-bcd9ff8b141ba795',
   '{"version":1,"art":"manueller-originalvergleich","dokumentId":"rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125","originalUrl":"https://www.bmas.de/DE/Service/Presse/Meldungen/2026/50-jahre-opferentschaedigung.html","originalGelesenAm":"2026-11-15T00:11:23.843Z","originalBytes":529364,"originalSha256":"a77a5e50f308e2618d4b44cb976890749432023127789abd55d06abb349cc5f4","originalAbsatzPosition":3,"auswahl":"Erster vollstaendiger Satz des ersten Meldungsabsatzes nach Rubrik und Unterzeile; keine automatische Einstieg-Provenienz","auszugSha256":"14db9902f79a15eb497dd6385f7ea74c7cff9640c7be049b345ddd58dc120514","absatzSha256":"0477270c55e1ab9baddb3015f9c4c535aee2b0b630b3c704bc892007f7c8b6fd","vorherStand":"31bffde2aa9ab680bf04b7a9349db2424ff1a6902d49273eccb4a43218a7edec","nachherStand":"bcd9ff8b141ba7952b9673f08b54a9597dbad3120bb47a995e88be6b5280aef3"}'::jsonb||jsonb_build_object('korrigiertAm',clock_timestamp(),'job_id',j_new.id,'job_row_md5',j_md5));
 IF geschuetzt IS DISTINCT FROM md5((jsonb_build_object('ko',(SELECT to_jsonb(k) FROM public.knowledge_objects k WHERE id='ko-vg-opferentschädigung-20261102-853ed4'),
 'links',(SELECT jsonb_agg(to_jsonb(l) ORDER BY knowledge_object_id,raw_document_id) FROM public.ko_document_links l WHERE raw_document_id='rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125'),
 'old_job',(SELECT to_jsonb(j) FROM public.helmut_jobs j WHERE id='3c2df765-2e98-40d3-8658-31dac6b960a0'),
 'old_negative',(SELECT data FROM public.helmut_store WHERE id='main-artikelkontext-0b0f9a3fea4fd4d74f4e24b1111e6f9951b35d1ce6af194cf335f15b2b44a1a9'),
 'old_archive',(SELECT data FROM public.helmut_store WHERE id='main-rohstand-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125-31bffde2aa9ab680bf04b7a9349db2424ff1a6902d49273eccb4a43218a7edec'),
 'success_jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM public.helmut_jobs j WHERE id IN
 ('0183eb36-b40b-4d4a-bb08-4dffcdc64939','3922563e-e93f-48c5-ab50-f49afee25637','3ba1a308-50f7-48e0-9068-5cd78091a249','6eeb03b4-2457-49cc-b98a-a488a406479e','b70857dc-7936-434c-8fe2-d5a1a7f287be'))))::text) THEN RAISE EXCEPTION 'bmas: geschuetzte Altstaende veraendert'; END IF;
END
$bmas_188_zeichen$;
SELECT id,data->>'job_id' AS neuer_job,data->>'job_row_md5' AS neuer_job_md5,data->>'nachherStand' AS neuer_stand FROM public.helmut_store WHERE id='main-quellenkorrektur-bmas-20261115-bcd9ff8b141ba795';
COMMIT;
```

### BMAS Rückweg

SHA256 `cfcb0fcbbd5176590db8a0ef4dc59a316e90944f25c3c07cb50092e96b801f88`.

```sql
-- Nur vor Weiterverarbeitung des neuen Jobs; keine bestaetigten Ergebnisse loeschen.
BEGIN;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
DO $bmas_rueckweg$
DECLARE b jsonb; n integer;
BEGIN
 SELECT data INTO STRICT b FROM public.helmut_store WHERE id='main-quellenkorrektur-bmas-20261115-bcd9ff8b141ba795' FOR UPDATE;
 IF b->>'nachherStand'<>'bcd9ff8b141ba7952b9673f08b54a9597dbad3120bb47a995e88be6b5280aef3' OR b->>'originalSha256'<>'a77a5e50f308e2618d4b44cb976890749432023127789abd55d06abb349cc5f4' THEN RAISE EXCEPTION 'bmas-rueckweg: fremder Korrekturbeleg'; END IF;
 PERFORM 1 FROM public.helmut_jobs WHERE id=(b->>'job_id')::uuid FOR UPDATE;
 PERFORM 1 FROM public.raw_documents WHERE id='rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125' FOR UPDATE;
 PERFORM 1 FROM public.knowledge_objects WHERE id='ko-vg-opferentschädigung-20261102-853ed4' FOR UPDATE;
 PERFORM 1 FROM public.ko_document_links WHERE raw_document_id='rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125' FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.helmut_job_outbox WHERE job_id=(b->>'job_id')::uuid) THEN RAISE EXCEPTION 'bmas-rueckweg: Versandbeleg vorhanden'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.helmut_jobs j WHERE id=(b->>'job_id')::uuid AND status='wartend' AND attempts=0
   AND md5(to_jsonb(j)::text)=b->>'job_row_md5') THEN RAISE EXCEPTION 'bmas-rueckweg: Job fortgeschritten oder abweichend'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.raw_documents d WHERE id='rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125' AND md5(to_jsonb(d)::text)='6dc6ac4dd18463c5c134ce0be17624dd')
   OR (SELECT count(*) FROM public.ko_document_links WHERE raw_document_id='rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125')<>1
   OR NOT EXISTS(SELECT 1 FROM public.ko_document_links WHERE raw_document_id='rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125' AND knowledge_object_id='ko-vg-opferentschädigung-20261102-853ed4')
   OR NOT EXISTS(SELECT 1 FROM public.knowledge_objects k WHERE id='ko-vg-opferentschädigung-20261102-853ed4' AND md5(to_jsonb(k)::text)='17b2801ffe09ba2bd62c3a7f290d1519') THEN RAISE EXCEPTION 'bmas-rueckweg: Original weiterverwendet'; END IF;
 IF EXISTS(SELECT 1 FROM public.helmut_jobs WHERE id<>(b->>'job_id')::uuid AND payload->'quellenstaende'->>'rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125'='bcd9ff8b141ba7952b9673f08b54a9597dbad3120bb47a995e88be6b5280aef3')
   THEN RAISE EXCEPTION 'bmas-rueckweg: weitere Versionsverwendung'; END IF;
 DELETE FROM public.helmut_jobs WHERE id=(b->>'job_id')::uuid AND idempotency_key='document_understanding|cee5c8456b39e4d889568b0413397473|3f12c4c5210ab85567a62a8f6ce2d9fc';
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION 'bmas-rueckweg: Jobzahl';END IF;
 UPDATE public.raw_documents SET summary='Neue Kampagne von BMAS und BAS--Bundesamt für Soziale Sicherung informiert über Ansprüche und Hilfen nach Gewalttaten' WHERE id='rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125';
 IF NOT EXISTS(SELECT 1 FROM public.raw_documents d WHERE id='rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125' AND md5(to_jsonb(d)::text)='42e568469be156432582844550f0ade9') THEN RAISE EXCEPTION 'bmas-rueckweg: Rohvorwert'; END IF;
 DELETE FROM public.helmut_store WHERE id='main-rohstand-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125-bcd9ff8b141ba7952b9673f08b54a9597dbad3120bb47a995e88be6b5280aef3' AND data='{"version":1,"quellenHash":"bcd9ff8b141ba7952b9673f08b54a9597dbad3120bb47a995e88be6b5280aef3","dokument":{"id":"rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125","url":"https://www.bmas.de/DE/Service/Presse/Meldungen/2026/50-jahre-opferentschaedigung.html","canonical_url":"https://bmas.de/DE/Service/Presse/Meldungen/2026/50-jahre-opferentschaedigung.html","title":"50 Jahre Opferentschädigung","source_name":"BMAS","source_id":"bmas","source_type":"ministry","link_type":"direct","document_type":null,"published_at":"2026-11-02T10:56:00+00:00","retrieved_at":"2026-11-05T21:49:22.082+00:00","summary":"Das Bundesministerium für Arbeit und Soziales ( BMAS ) und das Bundesamt für Soziale Sicherung (BAS) starten am 2. November 2026 eine Informationskampagne zum Sozialen Entschädigungsrecht.","raw":{}}}'::jsonb;
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION 'bmas-rueckweg: Archivzahl';END IF;
 DELETE FROM public.helmut_store WHERE id='main-quellenkorrektur-bmas-20261115-bcd9ff8b141ba795' AND data=b;
 GET DIAGNOSTICS n=ROW_COUNT;IF n<>1 THEN RAISE EXCEPTION 'bmas-rueckweg: Belegzahl';END IF;
END
$bmas_rueckweg$;
SELECT id,md5(to_jsonb(d)::text) AS wiederhergestellter_rohwert FROM public.raw_documents d WHERE id='rd-ad863bad8d337cb09d1c46ea0ed3b5d0d7dfe9b67fce107e7991699d20f75125';
COMMIT;
```
