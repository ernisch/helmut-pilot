-- Helmut — Fachthemenpaket „Wohnen, Bauen & Stadtentwicklung (Bund)" · PREPARED-Seed.
-- Generiert von scripts/generate-wohnen-bauen-seed.js. NICHT von Hand editieren.
-- Voraussetzung: 20260713_source_architecture.sql + der Basis-Seed sind angewendet.
-- ALLE Inserts: ON CONFLICT DO NOTHING (additiv, überschreibt KEINE Bestandszeile).
-- ALLE Abrufwege: status='needs_review', activation_mode='manual'; Paket status='prepared'
-- -> technisch VOLLSTÄNDIG INAKTIV. FREIGABEPFLICHTIG vor jeder Aktivierung.
begin;

-- 1) Neue politische Entitaeten (8) — bestehende (Destatis/Bundesrat/Bundestag/Ausschuss) NICHT dupliziert
insert into public.political_entities (id, entity_type, name, canonical_key, level, geography_id, aliases) values
  ('ministry-bmwsb', 'ministry', 'Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen', null, 'bund', 'geo-bund', array['BMWSB']::text[]),
  ('authority-bbsr', 'authority', 'Bundesinstitut für Bau-, Stadt- und Raumforschung', null, 'bund', 'geo-bund', array['BBSR', 'BBR', 'Bundesamt für Bauwesen und Raumordnung']::text[]),
  ('authority-uba', 'authority', 'Umweltbundesamt', null, 'bund', 'geo-bund', array['UBA']::text[]),
  ('authority-bib', 'authority', 'Bundesinstitut für Bevölkerungsforschung', null, 'bund', 'geo-bund', array['BiB']::text[]),
  ('authority-kfw', 'authority', 'KfW', null, 'bund', 'geo-bund', array['Kreditanstalt für Wiederaufbau']::text[]),
  ('association-difu', 'association', 'Deutsches Institut für Urbanistik', null, null, null, array['Difu']::text[]),
  ('association-staedtetag', 'association', 'Deutscher Städtetag', null, null, null, array['Städtetag']::text[]),
  ('association-landkreistag', 'association', 'Deutscher Landkreistag', null, null, null, array['Landkreistag', 'DLT']::text[])
on conflict (id) do nothing;


-- 2) Herausgeber (10) — publisher-destatis.de / publisher-bundesrat.de sind BESTAND
--    (reuse): ON CONFLICT DO NOTHING lässt die Bestandszeile unverändert -> keine Dublette.
insert into public.publishers (id, name, canonical_domain, publisher_type, evidence_role, trust, lifecycle_status, entity_id) values
  ('publisher-bmwsb.bund.de', 'Bundesministerium für Wohnen, Stadtentwicklung und Bauwesen', 'bmwsb.bund.de', 'ministry', 'official_primary', 'unbekannt', 'active', 'ministry-bmwsb'),
  ('publisher-bbsr.bund.de', 'Bundesinstitut für Bau-, Stadt- und Raumforschung (BBSR im BBR)', 'bbsr.bund.de', 'authority', 'official_primary', 'unbekannt', 'active', 'authority-bbsr'),
  ('publisher-destatis.de', 'Statistisches Bundesamt', 'destatis.de', 'statistical_office', 'data_source', 'hoch', 'active', 'statoffice-destatis'),
  ('publisher-bundesrat.de', 'Bundesrat', 'bundesrat.de', 'parliament', 'official_primary', 'hoch', 'active', 'parliament-bundesrat'),
  ('publisher-umweltbundesamt.de', 'Umweltbundesamt', 'umweltbundesamt.de', 'authority', 'official_primary', 'unbekannt', 'active', 'authority-uba'),
  ('publisher-bib.bund.de', 'Bundesinstitut für Bevölkerungsforschung', 'bib.bund.de', 'authority', 'official_primary', 'unbekannt', 'active', 'authority-bib'),
  ('publisher-kfw.de', 'KfW', 'kfw.de', 'authority', 'official_primary', 'unbekannt', 'active', 'authority-kfw'),
  ('publisher-staedtetag.de', 'Deutscher Städtetag', 'staedtetag.de', 'association', 'direct_interest', 'unbekannt', 'active', 'association-staedtetag'),
  ('publisher-landkreistag.de', 'Deutscher Landkreistag', 'landkreistag.de', 'association', 'direct_interest', 'unbekannt', 'active', 'association-landkreistag'),
  ('publisher-difu.de', 'Deutsches Institut für Urbanistik', 'difu.de', 'association', 'direct_interest', 'unbekannt', 'active', 'association-difu')
on conflict (id) do nothing;


-- 3) Paket (prepared) — bewusst NICHT im Code-Seed PACKAGE_DEFINITIONS; lebt nur hier.
insert into public.source_packages (id, key, name, purpose, status, is_base, political_level, geography_id, required_classes) values
  ('pkg-wohnen-bauen-stadtentwicklung-bund', 'wohnen-bauen-stadtentwicklung-bund', 'Wohnen, Bauen & Stadtentwicklung (Bund)', 'Fachthemenpaket Wohnungs-, Bau- und Stadtentwicklungspolitik auf Bundesebene (Ministerium, Bau-/Stadt-/Raumforschung, amtliche Statistik, Förderbank, kommunale Spitzenverbände, Stadtforschung). Fachthema, NICHT Region. VORBEREITET/INAKTIV.', 'prepared', false, 'bund', 'geo-bund', '{}')
on conflict (id) do nothing;


-- 4) Abrufwege (10) — INAKTIV: needs_review + manual (hart gesetzt; der DB-Default fuer
--    activation_mode wird bewusst durch manual ersetzt -> kein automatischer Crawl).
insert into public.retrieval_paths (id, publisher_id, legacy_source_id, name, method, url, query, parser, expected_frequency, priority, status, activation_mode, is_critical, max_items) values
  ('rp-wbs-bmwsb-steuerung', 'publisher-bmwsb.bund.de', 'wbs-bmwsb-steuerung', 'BMWSB — Wohnen/Bauen/Stadtentwicklung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abmwsb.bund.de%20(Wohnen%20OR%20Bauen%20OR%20Stadtentwicklung%20OR%20Wohngeld%20OR%20Baugesetzbuch%20OR%20St%C3%A4dtebauf%C3%B6rderung)&hl=de&gl=DE&ceid=DE:de', 'site:bmwsb.bund.de (Wohnen OR Bauen OR Stadtentwicklung OR Wohngeld OR Baugesetzbuch OR Städtebauförderung)', 'googlenews-batchexecute', 'regelmaessig', 60, 'needs_review', 'manual', true, 16),
  ('rp-wbs-bbsr-forschung', 'publisher-bbsr.bund.de', 'wbs-bbsr-forschung', 'BBSR (im BBR) — Wohnen/Bauen/Stadtentwicklung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abbsr.bund.de%20(Raumordnung%20OR%20Wohnungsmarkt%20OR%20St%C3%A4dtebau%20OR%20Stadtentwicklung%20OR%20Raumforschung)&hl=de&gl=DE&ceid=DE:de', 'site:bbsr.bund.de (Raumordnung OR Wohnungsmarkt OR Städtebau OR Stadtentwicklung OR Raumforschung)', 'googlenews-batchexecute', 'periodisch', 60, 'needs_review', 'manual', false, 16),
  ('rp-wbs-destatis-bau-wohnen', 'publisher-destatis.de', 'wbs-destatis-bau-wohnen', 'Statistisches Bundesamt — Wohnen/Bauen/Stadtentwicklung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Adestatis.de%20(Baugenehmigungen%20OR%20Baufertigstellungen%20OR%20Baut%C3%A4tigkeit%20OR%20Wohnungsbau%20OR%20Wohnungsbestand%20OR%20Baupreise)&hl=de&gl=DE&ceid=DE:de', 'site:destatis.de (Baugenehmigungen OR Baufertigstellungen OR Bautätigkeit OR Wohnungsbau OR Wohnungsbestand OR Baupreise)', 'googlenews-batchexecute', 'regelmaessig', 60, 'needs_review', 'manual', false, 16),
  ('rp-wbs-bundesrat-staedtebau', 'publisher-bundesrat.de', 'wbs-bundesrat-staedtebau', 'Bundesrat — Wohnen/Bauen/Stadtentwicklung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abundesrat.de%20(St%C3%A4dtebau%20OR%20Wohnungswesen%20OR%20Raumordnung%20OR%20Baugesetzbuch%20OR%20Baulandmobilisierung)&hl=de&gl=DE&ceid=DE:de', 'site:bundesrat.de (Städtebau OR Wohnungswesen OR Raumordnung OR Baugesetzbuch OR Baulandmobilisierung)', 'googlenews-batchexecute', 'regelmaessig', 60, 'needs_review', 'manual', true, 16),
  ('rp-wbs-uba-nachhaltiges-bauen', 'publisher-umweltbundesamt.de', 'wbs-uba-nachhaltiges-bauen', 'Umweltbundesamt — Wohnen/Bauen/Stadtentwicklung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Aumweltbundesamt.de%20(nachhaltiges%20Bauen%20OR%20Geb%C3%A4ude%20OR%20Ressourcenschonung%20OR%20Umbaukultur%20OR%20klimagerechtes%20Bauen)&hl=de&gl=DE&ceid=DE:de', 'site:umweltbundesamt.de (nachhaltiges Bauen OR Gebäude OR Ressourcenschonung OR Umbaukultur OR klimagerechtes Bauen)', 'googlenews-batchexecute', 'periodisch', 60, 'needs_review', 'manual', false, 16),
  ('rp-wbs-bib-demografie', 'publisher-bib.bund.de', 'wbs-bib-demografie', 'Bundesinstitut für Bevölkerungsforschung — Wohnen/Bauen/Stadtentwicklung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abib.bund.de%20(Wohnen%20OR%20Haushalte%20OR%20Wohnungsbedarf%20OR%20Bev%C3%B6lkerungsentwicklung%20OR%20Binnenwanderung)&hl=de&gl=DE&ceid=DE:de', 'site:bib.bund.de (Wohnen OR Haushalte OR Wohnungsbedarf OR Bevölkerungsentwicklung OR Binnenwanderung)', 'googlenews-batchexecute', 'periodisch', 60, 'needs_review', 'manual', false, 16),
  ('rp-wbs-kfw-foerderung', 'publisher-kfw.de', 'wbs-kfw-foerderung', 'KfW — Wohnen/Bauen/Stadtentwicklung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Akfw.de%20(F%C3%B6rderprogramm%20OR%20Wohngeb%C3%A4ude%20OR%20Neubau%20OR%20Sanierung%20OR%20Wohneigentum)%20(Wohnen%20OR%20Bauen)&hl=de&gl=DE&ceid=DE:de', 'site:kfw.de (Förderprogramm OR Wohngebäude OR Neubau OR Sanierung OR Wohneigentum) (Wohnen OR Bauen)', 'googlenews-batchexecute', 'ereignisnah', 60, 'needs_review', 'manual', false, 16),
  ('rp-wbs-staedtetag-kommunal', 'publisher-staedtetag.de', 'wbs-staedtetag-kommunal', 'Deutscher Städtetag — Wohnen/Bauen/Stadtentwicklung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Astaedtetag.de%20(Wohnungsbau%20OR%20St%C3%A4dtebauf%C3%B6rderung%20OR%20Baurecht%20OR%20Wohnen%20OR%20Bodenpolitik)&hl=de&gl=DE&ceid=DE:de', 'site:staedtetag.de (Wohnungsbau OR Städtebauförderung OR Baurecht OR Wohnen OR Bodenpolitik)', 'googlenews-batchexecute', 'regelmaessig', 60, 'needs_review', 'manual', false, 16),
  ('rp-wbs-landkreistag-laendlich', 'publisher-landkreistag.de', 'wbs-landkreistag-laendlich', 'Deutscher Landkreistag — Wohnen/Bauen/Stadtentwicklung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Alandkreistag.de%20(Wohnen%20OR%20Bauen%20OR%20Raumordnung%20OR%20gleichwertige%20Lebensverh%C3%A4ltnisse%20OR%20Baurecht)&hl=de&gl=DE&ceid=DE:de', 'site:landkreistag.de (Wohnen OR Bauen OR Raumordnung OR gleichwertige Lebensverhältnisse OR Baurecht)', 'googlenews-batchexecute', 'periodisch', 60, 'needs_review', 'manual', false, 16),
  ('rp-wbs-difu-stadtforschung', 'publisher-difu.de', 'wbs-difu-stadtforschung', 'Deutsches Institut für Urbanistik — Wohnen/Bauen/Stadtentwicklung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Adifu.de%20(Stadtentwicklung%20OR%20Wohnen%20OR%20Kommunalfinanzen%20OR%20Smart%20City%20OR%20St%C3%A4dtebau)&hl=de&gl=DE&ceid=DE:de', 'site:difu.de (Stadtentwicklung OR Wohnen OR Kommunalfinanzen OR Smart City OR Städtebau)', 'googlenews-batchexecute', 'periodisch', 60, 'needs_review', 'manual', false, 16)
on conflict (id) do nothing;


-- 5) Paket <-> Abrufweg (10)
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-wohnen-bauen-stadtentwicklung-bund', 'rp-wbs-bmwsb-steuerung'),
  ('pkg-wohnen-bauen-stadtentwicklung-bund', 'rp-wbs-bbsr-forschung'),
  ('pkg-wohnen-bauen-stadtentwicklung-bund', 'rp-wbs-destatis-bau-wohnen'),
  ('pkg-wohnen-bauen-stadtentwicklung-bund', 'rp-wbs-bundesrat-staedtebau'),
  ('pkg-wohnen-bauen-stadtentwicklung-bund', 'rp-wbs-uba-nachhaltiges-bauen'),
  ('pkg-wohnen-bauen-stadtentwicklung-bund', 'rp-wbs-bib-demografie'),
  ('pkg-wohnen-bauen-stadtentwicklung-bund', 'rp-wbs-kfw-foerderung'),
  ('pkg-wohnen-bauen-stadtentwicklung-bund', 'rp-wbs-staedtetag-kommunal'),
  ('pkg-wohnen-bauen-stadtentwicklung-bund', 'rp-wbs-landkreistag-laendlich'),
  ('pkg-wohnen-bauen-stadtentwicklung-bund', 'rp-wbs-difu-stadtforschung')
on conflict (package_id, retrieval_path_id) do nothing;


-- 6) Erwartete politische Ebene (bund) je Abrufweg
insert into public.path_expected_levels (retrieval_path_id, level) values
  ('rp-wbs-bmwsb-steuerung', 'bund'),
  ('rp-wbs-bbsr-forschung', 'bund'),
  ('rp-wbs-destatis-bau-wohnen', 'bund'),
  ('rp-wbs-bundesrat-staedtebau', 'bund'),
  ('rp-wbs-uba-nachhaltiges-bauen', 'bund'),
  ('rp-wbs-bib-demografie', 'bund'),
  ('rp-wbs-kfw-foerderung', 'bund'),
  ('rp-wbs-staedtetag-kommunal', 'bund'),
  ('rp-wbs-landkreistag-laendlich', 'bund'),
  ('rp-wbs-difu-stadtforschung', 'bund')
on conflict (retrieval_path_id, level) do nothing;


-- 7) Erwartete Geografie (geo-bund) je Abrufweg
insert into public.path_expected_geographies (retrieval_path_id, geography_id) values
  ('rp-wbs-bmwsb-steuerung', 'geo-bund'),
  ('rp-wbs-bbsr-forschung', 'geo-bund'),
  ('rp-wbs-destatis-bau-wohnen', 'geo-bund'),
  ('rp-wbs-bundesrat-staedtebau', 'geo-bund'),
  ('rp-wbs-uba-nachhaltiges-bauen', 'geo-bund'),
  ('rp-wbs-bib-demografie', 'geo-bund'),
  ('rp-wbs-kfw-foerderung', 'geo-bund'),
  ('rp-wbs-staedtetag-kommunal', 'geo-bund'),
  ('rp-wbs-landkreistag-laendlich', 'geo-bund'),
  ('rp-wbs-difu-stadtforschung', 'geo-bund')
on conflict (retrieval_path_id, geography_id) do nothing;


-- Integritaets-Selbstpruefung: 0 aktive Wohnen/Bauen-Wege nach der Eintragung (erwartet: 0 Zeilen).
-- select id, status, activation_mode from public.retrieval_paths
--   where id in ('rp-wbs-bmwsb-steuerung', 'rp-wbs-bbsr-forschung', 'rp-wbs-destatis-bau-wohnen', 'rp-wbs-bundesrat-staedtebau', 'rp-wbs-uba-nachhaltiges-bauen', 'rp-wbs-bib-demografie', 'rp-wbs-kfw-foerderung', 'rp-wbs-staedtetag-kommunal', 'rp-wbs-landkreistag-laendlich', 'rp-wbs-difu-stadtforschung')
--   and (status <> 'needs_review' or activation_mode <> 'manual');
-- Paket muss 'prepared' sein (erwartet: 1 Zeile mit status='prepared'):
--   select status from public.source_packages where id = 'pkg-wohnen-bauen-stadtentwicklung-bund';

commit;
notify pgrst, 'reload schema';
