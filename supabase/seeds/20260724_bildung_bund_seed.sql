-- Helmut — Quellenpaket 'bildung-bund' · PREPARED-Seed (generiert, idempotent, NICHT-destruktiv).
-- Generiert von scripts/generate-bildung-bund-seed.js. NICHT von Hand editieren.
-- Voraussetzung: 20260713_source_architecture.sql + 20260713_source_architecture_seed.sql angewendet
--   (Basis-Herausgeber/-Entitaeten/-Wege vorhanden: destatis/arbeitsagentur/bundesrat/oecd, rp-committee-bildung).
-- Paket: status='prepared'. ALLE neuen Abrufwege: status='needs_review', activation_mode='manual'
--   -> technisch INAKTIV. FREIGABEPFLICHTIG. Byte-genaue Abrufweg-Verifikation (offener Egress) steht aus.
-- Wiederverwendet (NUR referenziert, NIE angelegt/veraendert): publisher-destatis.de, publisher-arbeitsagentur.de, publisher-bundesrat.de, publisher-oecd.org, aggregator-google-news | Entitaeten committee-bt-bildung, statoffice-destatis, authority-bundesagentur-arbeit, parliament-bundesrat | Weg rp-committee-bildung.
begin;

-- 1) Neue politische Entitaeten (BMBFSFJ, KMK, BIBB, DIPF, SWK, IQB, DZHW)
insert into public.political_entities (id, entity_type, name, canonical_key, level, geography_id, aliases) values
  ('ministry-bmbfsfj', 'ministry', 'Bundesministerium für Bildung, Familie, Senioren, Frauen und Jugend', 'bmbfsfj', 'bund', 'geo-bund', array['BMBFSFJ', 'Bildungsministerium des Bundes']::text[]),
  ('institution-kmk', 'other_institution', 'Kultusministerkonferenz (KMK) / Bildungsministerkonferenz', 'kmk', 'land', null, array['KMK', 'Kultusministerkonferenz', 'Bildungsministerkonferenz', 'Bildungs-MK', 'Ständige Konferenz der Kultusminister der Länder']::text[]),
  ('authority-bibb', 'authority', 'Bundesinstitut für Berufsbildung', 'bibb', 'bund', 'geo-bund', array['BIBB']::text[]),
  ('institution-dipf', 'other_institution', 'DIPF | Leibniz-Institut für Bildungsforschung und Bildungsinformation', 'dipf', null, null, array['DIPF', 'Autorengruppe Bildungsberichterstattung']::text[]),
  ('institution-swk', 'other_institution', 'Ständige Wissenschaftliche Kommission der KMK (SWK)', 'swk', 'land', null, array['SWK']::text[]),
  ('institution-iqb', 'other_institution', 'Institut zur Qualitätsentwicklung im Bildungswesen (IQB)', 'iqb', 'land', null, array['IQB']::text[]),
  ('institution-dzhw', 'other_institution', 'Deutsches Zentrum für Hochschul- und Wissenschaftsforschung (DZHW)', 'dzhw', null, null, array['DZHW']::text[])
on conflict (id) do nothing;


-- 2) Neue Herausgeber (7)
insert into public.publishers (id, name, canonical_domain, publisher_type, evidence_role, trust, lifecycle_status, entity_id) values
  ('publisher-bmbfsfj.bund.de', 'Bundesministerium für Bildung, Familie, Senioren, Frauen und Jugend', 'bmbfsfj.bund.de', 'ministry', 'official_primary', 'unbekannt', 'active', 'ministry-bmbfsfj'),
  ('publisher-kmk.org', 'Kultusministerkonferenz (KMK)', 'kmk.org', 'other_institution', 'official_primary', 'unbekannt', 'active', 'institution-kmk'),
  ('publisher-bibb.de', 'Bundesinstitut für Berufsbildung', 'bibb.de', 'authority', 'data_source', 'unbekannt', 'active', 'authority-bibb'),
  ('publisher-bildungsbericht.de', 'Nationaler Bildungsbericht (Autorengruppe Bildungsberichterstattung / DIPF)', 'bildungsbericht.de', 'other_institution', 'data_source', 'unbekannt', 'active', 'institution-dipf'),
  ('publisher-swk-bildung.org', 'Ständige Wissenschaftliche Kommission der KMK (SWK)', 'swk-bildung.org', 'other_institution', 'official_primary', 'unbekannt', 'active', 'institution-swk'),
  ('publisher-iqb.hu-berlin.de', 'Institut zur Qualitätsentwicklung im Bildungswesen (IQB)', 'iqb.hu-berlin.de', 'other_institution', 'data_source', 'unbekannt', 'active', 'institution-iqb'),
  ('publisher-dzhw.eu', 'Deutsches Zentrum für Hochschul- und Wissenschaftsforschung (DZHW)', 'dzhw.eu', 'other_institution', 'data_source', 'unbekannt', 'active', 'institution-dzhw')
on conflict (id) do nothing;


-- 3) Neue Abrufwege (11) — INAKTIV: needs_review + manual
insert into public.retrieval_paths (id, publisher_id, legacy_source_id, name, method, url, query, parser, priority, status, activation_mode, is_critical, max_items) values
  ('rp-bildung-bmbfsfj', 'publisher-bmbfsfj.bund.de', 'bildung-bmbfsfj', 'BMBFSFJ — Bildungspolitik, Förderbekanntmachungen, BAföG, Ganztag, frühkindliche & berufliche Bildung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abmbfsfj.bund.de%20(Bildung%20OR%20BAf%C3%B6G%20OR%20Ganztag%20OR%20Kita%20OR%20fr%C3%BChkindliche%20OR%20Berufsbildung%20OR%20Ausbildung%20OR%20Startchancen%20OR%20Weiterbildung%20OR%20F%C3%B6rderrichtlinie)&hl=de&gl=DE&ceid=DE:de', 'site:bmbfsfj.bund.de (Bildung OR BAföG OR Ganztag OR Kita OR frühkindliche OR Berufsbildung OR Ausbildung OR Startchancen OR Weiterbildung OR Förderrichtlinie)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16),
  ('rp-bildung-kmk', 'publisher-kmk.org', 'bildung-kmk', 'KMK / Bildungsministerkonferenz — Beschlüsse, Bildungsstandards, Länderkoordination', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Akmk.org%20(Beschluss%20OR%20Bildungsstandards%20OR%20Bildungsministerkonferenz%20OR%20Schule%20OR%20Lehrkr%C3%A4fte%20OR%20Anerkennung)&hl=de&gl=DE&ceid=DE:de', 'site:kmk.org (Beschluss OR Bildungsstandards OR Bildungsministerkonferenz OR Schule OR Lehrkräfte OR Anerkennung)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16),
  ('rp-bildung-bibb', 'publisher-bibb.de', 'bildung-bibb', 'BIBB — Berufsbildungsbericht, Datenreport, Ausbildungsmarktanalysen', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abibb.de%20(Berufsbildungsbericht%20OR%20Datenreport%20OR%20Ausbildung%20OR%20Berufsbildung%20OR%20Ausbildungsmarkt)&hl=de&gl=DE&ceid=DE:de', 'site:bibb.de (Berufsbildungsbericht OR Datenreport OR Ausbildung OR Berufsbildung OR Ausbildungsmarkt)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16),
  ('rp-bildung-destatis', 'publisher-destatis.de', 'bildung-destatis', 'Destatis — Bildungsstatistik (Schule, Hochschule, Berufsbildung, Bildungsfinanzierung, Kita)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Adestatis.de%20(Schulstatistik%20OR%20Hochschulstatistik%20OR%20Berufsbildung%20OR%20Bildungsfinanzierung%20OR%20Bildungsausgaben%20OR%20Kindertagesbetreuung)&hl=de&gl=DE&ceid=DE:de', 'site:destatis.de (Schulstatistik OR Hochschulstatistik OR Berufsbildung OR Bildungsfinanzierung OR Bildungsausgaben OR Kindertagesbetreuung)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16),
  ('rp-bildung-bildungsbericht', 'publisher-bildungsbericht.de', 'bildung-bildungsbericht', 'Nationaler Bildungsbericht „Bildung in Deutschland“ (periodische Synthese, DIPF-koordiniert)', 'googlenews_search', 'https://news.google.com/rss/search?q=%22Bildung%20in%20Deutschland%22%20(Bildungsbericht%20OR%20Bildungsberichterstattung%20OR%20bildungsbericht.de)&hl=de&gl=DE&ceid=DE:de', '"Bildung in Deutschland" (Bildungsbericht OR Bildungsberichterstattung OR bildungsbericht.de)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16),
  ('rp-bildung-swk', 'publisher-swk-bildung.org', 'bildung-swk', 'SWK — wissenschaftliche Beratung der KMK (Gutachten, Stellungnahmen, Empfehlungen)', 'googlenews_search', 'https://news.google.com/rss/search?q=(%22St%C3%A4ndige%20Wissenschaftliche%20Kommission%22%20OR%20SWK%20OR%20swk-bildung.org)%20(Gutachten%20OR%20Stellungnahme%20OR%20Empfehlung)&hl=de&gl=DE&ceid=DE:de', '("Ständige Wissenschaftliche Kommission" OR SWK OR swk-bildung.org) (Gutachten OR Stellungnahme OR Empfehlung)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16),
  ('rp-bildung-iqb', 'publisher-iqb.hu-berlin.de', 'bildung-iqb', 'IQB — Überprüfung der Bildungsstandards, IQB-Bildungstrend', 'googlenews_search', 'https://news.google.com/rss/search?q=(IQB%20OR%20%22Institut%20zur%20Qualit%C3%A4tsentwicklung%20im%20Bildungswesen%22)%20(Bildungstrend%20OR%20Bildungsstandards%20OR%20L%C3%A4ndervergleich)&hl=de&gl=DE&ceid=DE:de', '(IQB OR "Institut zur Qualitätsentwicklung im Bildungswesen") (Bildungstrend OR Bildungsstandards OR Ländervergleich)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16),
  ('rp-bildung-oecd', 'publisher-oecd.org', 'bildung-oecd', 'OECD — internationale Bildungsvergleiche (PISA, Education at a Glance)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Aoecd.org%20Germany%20(PISA%20OR%20education%20OR%20%22Education%20at%20a%20Glance%22)&hl=de&gl=DE&ceid=DE:de', 'site:oecd.org Germany (PISA OR education OR "Education at a Glance")', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16),
  ('rp-bildung-dzhw', 'publisher-dzhw.eu', 'bildung-dzhw', 'DZHW — Studienzugang, Studienverlauf, Studienabbruch, soziale Lage Studierender', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Adzhw.eu%20(Studienabbruch%20OR%20Studierende%20OR%20Studienzugang%20OR%20%22soziale%20Lage%22%20OR%20Studienverlauf)&hl=de&gl=DE&ceid=DE:de', 'site:dzhw.eu (Studienabbruch OR Studierende OR Studienzugang OR "soziale Lage" OR Studienverlauf)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16),
  ('rp-bildung-ba-ausbildungsmarkt', 'publisher-arbeitsagentur.de', 'bildung-ba-ausbildungsmarkt', 'Bundesagentur für Arbeit — Ausbildungsmarkt, Übergang Schule–Beruf, Weiterbildungsförderung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Aarbeitsagentur.de%20(Ausbildungsmarkt%20OR%20%22%C3%9Cbergang%20Schule%22%20OR%20Berufsberatung%20OR%20Weiterbildungsf%C3%B6rderung%20OR%20Fachkr%C3%A4fte)&hl=de&gl=DE&ceid=DE:de', 'site:arbeitsagentur.de (Ausbildungsmarkt OR "Übergang Schule" OR Berufsberatung OR Weiterbildungsförderung OR Fachkräfte)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16),
  ('rp-bildung-bundesrat', 'publisher-bundesrat.de', 'bildung-bundesrat', 'Bundesrat — zustimmungspflichtige Bildungsgesetze & Bund-Länder-Programme', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abundesrat.de%20(Bildung%20OR%20BAf%C3%B6G%20OR%20Ganztag%20OR%20Startchancen%20OR%20Digitalpakt%20OR%20Kita%20OR%20Ausbildung)&hl=de&gl=DE&ceid=DE:de', 'site:bundesrat.de (Bildung OR BAföG OR Ganztag OR Startchancen OR Digitalpakt OR Kita OR Ausbildung)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16)
on conflict (id) do nothing;


-- 4) Quellenpaket bildung-bund — status 'prepared' (aktiviert KEINE Wege)
insert into public.source_packages (id, key, name, purpose, status, is_base, political_level, geography_id, required_classes) values
  ('pkg-bildung-bund', 'bildung-bund', 'Bildung Bund', 'Fachthemenpaket Bildungspolitik des Bundes (Bundesgesetzgebung, Bund-Länder-Koordination, berufliche Bildung, Ausbildungsmarkt, BAföG, frühkindliche Bildung, Ganztag, Bildungsmonitoring, Bildungsstandards, Hochschulzugang, internationale Vergleiche). Bund-fokussiert; Länderkompetenz wird als solche gekennzeichnet, nicht als Bundeskompetenz suggeriert. Struktur vorbereitet — INAKTIV bis Verifikation + Freigabe.', 'prepared', false, 'bund', 'geo-bund', '{}')
on conflict (id) do nothing;


-- 5) Paket <-> Abrufweg (neue Wege + wiederverwendeter rp-committee-bildung)
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-bildung-bund', 'rp-bildung-bmbfsfj'),
  ('pkg-bildung-bund', 'rp-bildung-kmk'),
  ('pkg-bildung-bund', 'rp-bildung-bibb'),
  ('pkg-bildung-bund', 'rp-bildung-destatis'),
  ('pkg-bildung-bund', 'rp-bildung-bildungsbericht'),
  ('pkg-bildung-bund', 'rp-bildung-swk'),
  ('pkg-bildung-bund', 'rp-bildung-iqb'),
  ('pkg-bildung-bund', 'rp-bildung-oecd'),
  ('pkg-bildung-bund', 'rp-bildung-dzhw'),
  ('pkg-bildung-bund', 'rp-bildung-ba-ausbildungsmarkt'),
  ('pkg-bildung-bund', 'rp-bildung-bundesrat'),
  ('pkg-bildung-bund', 'rp-committee-bildung')
on conflict (package_id, retrieval_path_id) do nothing;


-- 6) Erwartete politische Ebene je NEUEM Abrufweg (Bund/Land/International — nur neue Wege)
insert into public.path_expected_levels (retrieval_path_id, level) values
  ('rp-bildung-bmbfsfj', 'bund'),
  ('rp-bildung-kmk', 'land'),
  ('rp-bildung-bibb', 'bund'),
  ('rp-bildung-destatis', 'bund'),
  ('rp-bildung-bildungsbericht', 'bund'),
  ('rp-bildung-bildungsbericht', 'land'),
  ('rp-bildung-swk', 'land'),
  ('rp-bildung-iqb', 'land'),
  ('rp-bildung-oecd', 'international'),
  ('rp-bildung-dzhw', 'bund'),
  ('rp-bildung-ba-ausbildungsmarkt', 'bund'),
  ('rp-bildung-bundesrat', 'bund')
on conflict (retrieval_path_id, level) do nothing;


-- 7) Erwartete Geografie je NEUEM Abrufweg (national = geo-bund)
insert into public.path_expected_geographies (retrieval_path_id, geography_id) values
  ('rp-bildung-bmbfsfj', 'geo-bund'),
  ('rp-bildung-kmk', 'geo-bund'),
  ('rp-bildung-bibb', 'geo-bund'),
  ('rp-bildung-destatis', 'geo-bund'),
  ('rp-bildung-bildungsbericht', 'geo-bund'),
  ('rp-bildung-swk', 'geo-bund'),
  ('rp-bildung-iqb', 'geo-bund'),
  ('rp-bildung-oecd', 'geo-bund'),
  ('rp-bildung-dzhw', 'geo-bund'),
  ('rp-bildung-ba-ausbildungsmarkt', 'geo-bund'),
  ('rp-bildung-bundesrat', 'geo-bund')
on conflict (retrieval_path_id, geography_id) do nothing;


-- 8) Erwartete Themen je NEUEM Abrufweg (speist die Abdeckungsmatrix)
insert into public.path_expected_topics (retrieval_path_id, topic) values
  ('rp-bildung-bmbfsfj', 'bundesgesetzgebung'),
  ('rp-bildung-bmbfsfj', 'bundesprogramme'),
  ('rp-bildung-bmbfsfj', 'bafoeg'),
  ('rp-bildung-bmbfsfj', 'ganztag'),
  ('rp-bildung-bmbfsfj', 'fruehkindliche_bildung'),
  ('rp-bildung-bmbfsfj', 'berufliche_bildung'),
  ('rp-bildung-bmbfsfj', 'bildungsfoerderung'),
  ('rp-bildung-bmbfsfj', 'weiterbildung'),
  ('rp-bildung-kmk', 'laenderkoordination'),
  ('rp-bildung-kmk', 'bildungsstandards'),
  ('rp-bildung-kmk', 'schulqualitaet'),
  ('rp-bildung-kmk', 'anerkennung'),
  ('rp-bildung-bibb', 'berufliche_bildung'),
  ('rp-bildung-bibb', 'ausbildungsmarkt'),
  ('rp-bildung-bibb', 'berufsbildungsbericht'),
  ('rp-bildung-destatis', 'bildungsstatistik'),
  ('rp-bildung-destatis', 'schulstatistik'),
  ('rp-bildung-destatis', 'hochschulstatistik'),
  ('rp-bildung-destatis', 'bildungsfinanzierung'),
  ('rp-bildung-destatis', 'kindertagesbetreuung'),
  ('rp-bildung-bildungsbericht', 'bildungsmonitoring'),
  ('rp-bildung-bildungsbericht', 'bildungsgerechtigkeit'),
  ('rp-bildung-swk', 'wissenschaftliche_beratung'),
  ('rp-bildung-swk', 'bildungsstandards'),
  ('rp-bildung-iqb', 'bildungsstandards'),
  ('rp-bildung-iqb', 'schulqualitaet'),
  ('rp-bildung-iqb', 'bildungsmonitoring'),
  ('rp-bildung-oecd', 'internationale_vergleiche'),
  ('rp-bildung-dzhw', 'hochschulzugang'),
  ('rp-bildung-dzhw', 'studienverlauf'),
  ('rp-bildung-dzhw', 'studienabbruch'),
  ('rp-bildung-dzhw', 'studienfinanzierung'),
  ('rp-bildung-ba-ausbildungsmarkt', 'ausbildungsmarkt'),
  ('rp-bildung-ba-ausbildungsmarkt', 'uebergang_schule_beruf'),
  ('rp-bildung-ba-ausbildungsmarkt', 'weiterbildung'),
  ('rp-bildung-bundesrat', 'bundesgesetzgebung'),
  ('rp-bildung-bundesrat', 'bund_laender_koordination')
on conflict (retrieval_path_id, topic) do nothing;


-- Integritaets-Selbstpruefung (erwartet je 0 Zeilen):
-- a) kein aktiver neuer Bildungsweg:
-- select id, status, activation_mode from public.retrieval_paths
--   where id in ('rp-bildung-bmbfsfj', 'rp-bildung-kmk', 'rp-bildung-bibb', 'rp-bildung-destatis', 'rp-bildung-bildungsbericht', 'rp-bildung-swk', 'rp-bildung-iqb', 'rp-bildung-oecd', 'rp-bildung-dzhw', 'rp-bildung-ba-ausbildungsmarkt', 'rp-bildung-bundesrat')
--   and (status <> 'needs_review' or activation_mode <> 'manual');
-- b) Paket bleibt prepared:
-- select id, status from public.source_packages where id = 'pkg-bildung-bund' and status <> 'prepared';

commit;
notify pgrst, 'reload schema';
