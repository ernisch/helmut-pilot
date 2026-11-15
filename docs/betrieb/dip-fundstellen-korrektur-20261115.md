# DIP-Fundstellen: zwei fehlende Abrufwegzuordnungen korrigiert

Stand15.11.2026,15:19UTC. Tatsächliche Korrektur bestätigt;kein vollständiger
Kunden-/Morgenversorgungsnachweis und kein neuer Modell- oder Quellenlauf.

## Ursache und engster Umfang

Bei zwei bestehenden globalen Inhaltsaufträgen sind die amtlichen DIP-Quellfelder
vorhanden und gültig,die gespeicherte Fundstelle enthält aberkeine
`retrieval_path_id`. Beide betreffen KleineAnfragen vom11Nov mit den offiziellen
PDF-Zielen2109104/2109107. Der bestehende Leser verlangt den konkret bestätigten
DIP-Abrufweg;NULL wird zurecht zurückgehalten. Die Meldung`artikelkontext-offen`
beschreibt diesen Fall ungenau. Die ursprüngliche Entstehung der NULL-Fundstelle
ist nicht rekonstruiert und wird nicht als neuer Parser-/Schreibfehler behauptet.
Der heutige Sourcehandler liefert bereits`retrievalPathId:rp-dip`;bestehende
Fundstellen werden beim erneuten Insert mit`ignore-duplicates`nicht ergänzt.

Native Belege:genau ein konfigurierter Legacy-DIP-Weg,rp-dip/amtlicherPublisher,
api/dip-json/https://search.dip.bundestag.de/api/v1,healthy/always_on.
Bestehende Fundtuple source_iddip/original_urlidentisch/typdirect. Die kleine
öffentliche Feldprojektion besteht die native DIP-Quellfeldprüfung2/2 und
`brauchtInhalt:false`;kein zusätzlicher PDF-/HTML-Abruf ist dafür nötig.
Keine private Profilabfrage und kein Vollarchivexport.

Korrektur genau zweier`document_findings.retrieval_path_id`:NULL→rp-dip.
Keine erfundene historische Abrufquittung oder neue Beobachtungszeit. Titel,
Originaladresse,Publikationsdatum,found_at,created_at,Archive,Rohzeilen,
Aufträge und erfolgreiche Ergebnisse bleiben unverändert. Keine Gates gelockert.
Der erneute Betreiberauftrag„Du hast jede Freigabe. Arbeite weiter“autorisiert
die notwendige eng begrenzte Reparatur;daraus wird kein Modell-/Quotenreset.

## Prüfung und unabhängiges Review

Die nativen Funktionen wurden mit den zwei genehmigten öffentlichen
Feldprojektionen,einem ausdrücklich fiktiven Profil und neu berechneten lokalen
Fixturehashes geprüft. Es wird kein echter Vollarchivhash nachgebildet:
jeDatensatzNULL→0freigegebeneDokumente,rp-dip→1,fremderWeg→0.
Der vorhandene Quellen-/Profilfilter bleibt vollständig erhalten;dies ist keine
behauptete erneute Abnahme des privaten Pilotprofils.
Bestehende`quellen-inhaltsversorgung-queue-test.js`29/29viaSchutzstartergrün,
keine Netz-/Modell-/Datenbankläufe durch diese Prüfung.

Unabhängiges SQL-/Rückwegreview bestätigte die fachliche Belegbarkeit der zwei
Katalogbindungen. Ein erster P2 wurde vor Ausführung behoben:wartend/attempts0
allein erkennt keinen zwischenzeitlichen Claim mit Defer. Vorwärts- und Rückweg
binden deshalb beide Jobs zusätzlich unterFORUPDATE an ihre exakten Zeilen-MD5s.
Delta erneut unabhängig geprüft,P2geschlossen,kein offener Reviewbefund.

## Tatsächlich ausgeführt und getrennt nachgelesen

VorwärtsSHA256`331cbd6490603f7e3e2a3c488df15218bba3eeed9214bdb346597e9bbd6bfed7`.
RückwegSHA256`79217127000cc731ee8344362f45cc9e76b5d7c14bc0be725185c7c0578c7a36`.
Atomare Ausführung erfolgreich;getrennteREADONLYNachkontrolle15:18:52.245UTC:

| Dokument | Neuer Weg | Vollständige Fundstellen-MD5 danach |
|---|---|---|
|rd-3c65ba23ff605a44c85e56a74f28aeea569893310a1a310255a715d172ea15a9|rp-dip|816bbb686392d92e305a27c64917f337|
|rd-9b6585c0f71a090ce2d3f2f8804796d3e8deeb4590c273b11abea240c6d4846b|rp-dip|2c5c7e9849a836d4c37b583c7db396b1|

Beide Warteaufträge bleiben unverändertwartend/attempts0,Jobzeilen-MD5
3a067f640352c244af29b8d5b05393be und9946ef5642ecc0014aeeff94c60d4fdd.
Die fünf zuvor geprüften Erfolgsjobs bleiben erledigt,Payload-MD5s unverändert.
Kostenbuch0,636184USDheute/4,019218USDgesamtgebunden/8Altreservenunverändert.
Kein zusätzlicher Processing-POST,keine erzwungene Wiederholung erfolgreicher Jobs.

Die fehlende Fundstellenbindung ist behoben;eine anschließende Verarbeitung der
zwei Jobs oder neue vollständige Morgenquittung wurde damit nicht behauptet.

## Konkreter Vorwärtsbefehl

```sql
-- Konkrete Reparatur zweier bereits dokumentierter DIP-Fundstellenbindungen.
-- Kein Rohtext, Datum, Archiv, Job, Ergebnis, Profil, Budget oder Kontingent wird geaendert.
-- Vorwerte muessen exakt stimmen. Bei unbekanntem Ausgang ausschliesslich lesen.
BEGIN;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
DO $dip_zwei_fundstellen$
DECLARE
  n integer;
  jobs_vorher text;
  rohdaten_vorher text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.helmut_jobs WHERE status='laeuft') THEN
    RAISE EXCEPTION 'dip-bindung: parallele Verarbeitung';
  END IF;
  IF (SELECT count(*) FROM public.retrieval_paths WHERE legacy_source_id='dip') <> 1
    OR NOT EXISTS (SELECT 1 FROM public.retrieval_paths WHERE id='rp-dip'
      AND legacy_source_id='dip' AND publisher_id='publisher-dip.bundestag.de'
      AND method='api' AND parser='dip-json' AND url='https://search.dip.bundestag.de/api/v1'
      AND status='healthy' AND activation_mode='always_on') THEN
    RAISE EXCEPTION 'dip-bindung: aktueller eindeutiger Abrufweg fehlt';
  END IF;
  PERFORM 1 FROM public.helmut_jobs
    WHERE id IN ('2ca02a70-aada-4e5b-b6c0-36ba068e51aa','e87719a6-46ed-4cca-bbd2-dabf7392507b')
    FOR UPDATE;
  IF (SELECT count(*) FROM public.helmut_jobs j WHERE id IN
    ('2ca02a70-aada-4e5b-b6c0-36ba068e51aa','e87719a6-46ed-4cca-bbd2-dabf7392507b')
    AND status='wartend' AND attempts=0 AND tenant_id IS NULL
    AND ((id='2ca02a70-aada-4e5b-b6c0-36ba068e51aa' AND md5(to_jsonb(j)::text)='3a067f640352c244af29b8d5b05393be')
      OR (id='e87719a6-46ed-4cca-bbd2-dabf7392507b' AND md5(to_jsonb(j)::text)='9946ef5642ecc0014aeeff94c60d4fdd'))) <> 2 THEN
    RAISE EXCEPTION 'dip-bindung: betroffene Auftraege nicht unveraendert wartend';
  END IF;
  PERFORM 1 FROM public.document_findings
    WHERE raw_document_id IN ('rd-9b6585c0f71a090ce2d3f2f8804796d3e8deeb4590c273b11abea240c6d4846b',
      'rd-3c65ba23ff605a44c85e56a74f28aeea569893310a1a310255a715d172ea15a9')
      AND source_id='dip' FOR UPDATE;
  SELECT count(*) INTO n FROM public.document_findings f JOIN
    (VALUES
      ('rd-9b6585c0f71a090ce2d3f2f8804796d3e8deeb4590c273b11abea240c6d4846b',
       'https://dserver.bundestag.de/btd/21/091/2109104.pdf',
       '5b867c522203ff0f298d259afd792e7b','57645daab597204228d5c768beef73dbed8fb6838199d62e34950d48406cf18d'),
      ('rd-3c65ba23ff605a44c85e56a74f28aeea569893310a1a310255a715d172ea15a9',
       'https://dserver.bundestag.de/btd/21/091/2109107.pdf',
       'b0dc355c3bed3882dfa75c352242e857','59b07235e7a2bc2a07238ec9d9ca4230a8ee880c836dffd646d43d7128e8d2ca')
    ) e(doc,url,vor_md5,quellfelder_hash) ON f.raw_document_id=e.doc AND f.original_url=e.url
    JOIN public.raw_documents d ON d.id=e.doc
    WHERE f.source_id='dip' AND f.retrieval_path_id IS NULL AND f.link_type='direct'
      AND md5(to_jsonb(f)::text)=e.vor_md5 AND d.source_id='dip'
      AND d.url=e.url AND d.canonical_url=e.url AND d.document_type='Kleine Anfrage'
      AND d.raw->'helmutDipQuellfelder'->>'herkunft'='dip-api-drucksache'
      AND d.raw->'helmutDipQuellfelder'->>'hash'=e.quellfelder_hash;
  IF n<>2 THEN RAISE EXCEPTION 'dip-bindung: Quellbeleg oder Fundstellenvorwert abweichend'; END IF;
  SELECT md5(jsonb_agg(to_jsonb(j) ORDER BY j.id)::text) INTO jobs_vorher FROM public.helmut_jobs j
    WHERE id IN ('2ca02a70-aada-4e5b-b6c0-36ba068e51aa','e87719a6-46ed-4cca-bbd2-dabf7392507b',
      '0183eb36-b40b-4d4a-bb08-4dffcdc64939','3922563e-e93f-48c5-ab50-f49afee25637',
      '3ba1a308-50f7-48e0-9068-5cd78091a249','6eeb03b4-2457-49cc-b98a-a488a406479e',
      'b70857dc-7936-434c-8fe2-d5a1a7f287be');
  SELECT md5(jsonb_agg(to_jsonb(d) ORDER BY d.id)::text) INTO rohdaten_vorher FROM public.raw_documents d
    WHERE id IN ('rd-9b6585c0f71a090ce2d3f2f8804796d3e8deeb4590c273b11abea240c6d4846b',
      'rd-3c65ba23ff605a44c85e56a74f28aeea569893310a1a310255a715d172ea15a9');
  UPDATE public.document_findings SET retrieval_path_id='rp-dip'
    WHERE source_id='dip' AND retrieval_path_id IS NULL AND
      (raw_document_id,original_url) IN (
      ('rd-9b6585c0f71a090ce2d3f2f8804796d3e8deeb4590c273b11abea240c6d4846b','https://dserver.bundestag.de/btd/21/091/2109104.pdf'),
      ('rd-3c65ba23ff605a44c85e56a74f28aeea569893310a1a310255a715d172ea15a9','https://dserver.bundestag.de/btd/21/091/2109107.pdf'));
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>2 THEN RAISE EXCEPTION 'dip-bindung: unerwartete Aenderungszahl'; END IF;
  IF jobs_vorher IS DISTINCT FROM (SELECT md5(jsonb_agg(to_jsonb(j) ORDER BY j.id)::text) FROM public.helmut_jobs j
    WHERE id IN ('2ca02a70-aada-4e5b-b6c0-36ba068e51aa','e87719a6-46ed-4cca-bbd2-dabf7392507b',
      '0183eb36-b40b-4d4a-bb08-4dffcdc64939','3922563e-e93f-48c5-ab50-f49afee25637',
      '3ba1a308-50f7-48e0-9068-5cd78091a249','6eeb03b4-2457-49cc-b98a-a488a406479e',
      'b70857dc-7936-434c-8fe2-d5a1a7f287be')) OR rohdaten_vorher IS DISTINCT FROM
    (SELECT md5(jsonb_agg(to_jsonb(d) ORDER BY d.id)::text) FROM public.raw_documents d
    WHERE id IN ('rd-9b6585c0f71a090ce2d3f2f8804796d3e8deeb4590c273b11abea240c6d4846b',
      'rd-3c65ba23ff605a44c85e56a74f28aeea569893310a1a310255a715d172ea15a9')) THEN
    RAISE EXCEPTION 'dip-bindung: geschuetzte Ergebnisse abweichend';
  END IF;
END
$dip_zwei_fundstellen$;
SELECT raw_document_id,retrieval_path_id,md5(to_jsonb(f)::text) AS nachwert_md5
  FROM public.document_findings f WHERE source_id='dip' AND raw_document_id IN
    ('rd-9b6585c0f71a090ce2d3f2f8804796d3e8deeb4590c273b11abea240c6d4846b',
     'rd-3c65ba23ff605a44c85e56a74f28aeea569893310a1a310255a715d172ea15a9')
  ORDER BY raw_document_id;
COMMIT;
```

## Rückweg mit Fortschrittssperre

Nur vor einer zwischenzeitlichen Änderung der beiden Jobs und bei genau den
oben bestätigten Nachwerten. Kein blinder Rückbau nach erfolgreicher Verarbeitung.

```sql
-- Nur bevor die zwei betroffenen Auftraege weiterverarbeitet wurden.
-- Nach Fortschritt kein blinder Rueckbau bestaetigter Quellenbindungen.
BEGIN;
SET LOCAL statement_timeout='5s';
SET LOCAL lock_timeout='2s';
DO $dip_zwei_rueckweg$
DECLARE n integer;
BEGIN
  PERFORM 1 FROM public.helmut_jobs WHERE id IN
    ('2ca02a70-aada-4e5b-b6c0-36ba068e51aa','e87719a6-46ed-4cca-bbd2-dabf7392507b') FOR UPDATE;
  IF (SELECT count(*) FROM public.helmut_jobs j WHERE id IN
    ('2ca02a70-aada-4e5b-b6c0-36ba068e51aa','e87719a6-46ed-4cca-bbd2-dabf7392507b')
    AND status='wartend' AND attempts=0 AND tenant_id IS NULL
    AND ((id='2ca02a70-aada-4e5b-b6c0-36ba068e51aa' AND md5(to_jsonb(j)::text)='3a067f640352c244af29b8d5b05393be')
      OR (id='e87719a6-46ed-4cca-bbd2-dabf7392507b' AND md5(to_jsonb(j)::text)='9946ef5642ecc0014aeeff94c60d4fdd')))<>2 THEN
    RAISE EXCEPTION 'dip-rueckweg: Verarbeitung fortgeschritten oder nicht pruefbar';
  END IF;
  UPDATE public.document_findings f SET retrieval_path_id=NULL
    WHERE source_id='dip' AND retrieval_path_id='rp-dip' AND
      ((raw_document_id='rd-9b6585c0f71a090ce2d3f2f8804796d3e8deeb4590c273b11abea240c6d4846b'
        AND md5(to_jsonb(f)::text)='2c5c7e9849a836d4c37b583c7db396b1')
       OR (raw_document_id='rd-3c65ba23ff605a44c85e56a74f28aeea569893310a1a310255a715d172ea15a9'
        AND md5(to_jsonb(f)::text)='816bbb686392d92e305a27c64917f337'));
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>2 THEN RAISE EXCEPTION 'dip-rueckweg: Nachwert abweichend'; END IF;
END
$dip_zwei_rueckweg$;
SELECT raw_document_id,retrieval_path_id,md5(to_jsonb(f)::text) AS wiederhergestellt_md5
 FROM public.document_findings f WHERE source_id='dip' AND raw_document_id IN
 ('rd-9b6585c0f71a090ce2d3f2f8804796d3e8deeb4590c273b11abea240c6d4846b',
 'rd-3c65ba23ff605a44c85e56a74f28aeea569893310a1a310255a715d172ea15a9') ORDER BY raw_document_id;
COMMIT;
```
