-- Helmut — Quellenpaket "verteidigung-bund" · PREPARED-Seed (generiert, idempotent, NICHT-destruktiv).
-- Generiert von scripts/generate-verteidigung-bund-seed.js. NICHT von Hand editieren.
-- Voraussetzung: 20260713_source_architecture.sql + Basis-Seed sind angewendet
-- (bestehende Herausgeber/Entitaeten/rp-dip vorhanden).
-- Paket: status='prepared', is_base=false. ALLE neuen Abrufwege: status='needs_review',
-- activation_mode='manual' -> technisch INAKTIV. FREIGABEPFLICHTIG.
begin;

-- 1) Quellenpaket (prepared, is_base=false)
insert into public.source_packages (id, key, name, purpose, status, is_base, political_level, geography_id, required_classes) values
  ('pkg-verteidigung-bund', 'verteidigung-bund', 'Verteidigung Bund', 'Verteidigungs- und sicherheitspolitisches Fachpaket (Bundesebene): BMVg (Politik/Strategie/Bundeswehr sowie Beschaffung/Ruestung), Wehrbeauftragte, oeffentliche Arbeit des Verteidigungsausschusses, DIP (wiederverwendet) und ergaenzend die Bundesregierung. Fachthema, NICHT Region. Auslandseinsaetze laufen ueber BMVg + DIP (kein eigener Weg).', 'prepared', false, 'bund', 'geo-bund', '{}')
on conflict (id) do nothing;


-- 2) Neue politische Entitaeten (BMVg, Bundeswehr, Wehrbeauftragte)
insert into public.political_entities (id, entity_type, name, canonical_key, level, geography_id, aliases) values
  ('ministry-bmvg', 'ministry', 'Bundesministerium der Verteidigung', 'bmvg', 'bund', 'geo-bund', '{"BMVg","Verteidigungsministerium"}'),
  ('institution-bundeswehr', 'other_institution', 'Bundeswehr', 'bundeswehr', 'bund', 'geo-bund', '{"Streitkraefte","Bundeswehr"}'),
  ('institution-wehrbeauftragter', 'other_institution', 'Wehrbeauftragte des Deutschen Bundestages', 'wehrbeauftragter', 'bund', 'geo-bund', '{"Wehrbeauftragter","Wehrbeauftragte"}')
on conflict (id) do nothing;


-- 3) Neuer Herausgeber (nur BMVg; alle uebrigen Wege haengen an BESTEHENDEN Herausgebern)
insert into public.publishers (id, name, canonical_domain, publisher_type, evidence_role, trust, lifecycle_status, entity_id) values
  ('publisher-bmvg.de', 'Bundesministerium der Verteidigung', 'bmvg.de', 'ministry', 'official_primary', 'unbekannt', 'active', 'ministry-bmvg')
on conflict (id) do nothing;


-- 4) Neue Abrufwege (5) — INAKTIV: needs_review + manual
insert into public.retrieval_paths (id, publisher_id, legacy_source_id, name, method, url, query, parser, priority, status, activation_mode, is_critical, max_items) values
  ('rp-vtdg-bmvg-politik-strategie-bundeswehr', 'publisher-bmvg.de', null, 'BMVg — Politik, Strategie und Bundeswehr', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abmvg.de%20(Verteidigungspolitik%20OR%20Sicherheitspolitik%20OR%20Strategie%20OR%20Bundeswehr%20OR%20Einsatzbereitschaft%20OR%20Personal%20OR%20Reserve%20OR%20Wehrdienst%20OR%20Einsatz)&hl=de&gl=DE&ceid=DE:de', 'https://news.google.com/rss/search?q=site%3Abmvg.de%20(Verteidigungspolitik%20OR%20Sicherheitspolitik%20OR%20Strategie%20OR%20Bundeswehr%20OR%20Einsatzbereitschaft%20OR%20Personal%20OR%20Reserve%20OR%20Wehrdienst%20OR%20Einsatz)&hl=de&gl=DE&ceid=DE:de', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16),
  ('rp-vtdg-bmvg-beschaffung-ruestung', 'publisher-bmvg.de', null, 'BMVg — Beschaffung und Ruestung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abmvg.de%20(Beschaffung%20OR%20Ruestung%20OR%20Ausruestung%20OR%20Ruestungsprojekt%20OR%20Vergabe%20OR%20Innovation)&hl=de&gl=DE&ceid=DE:de', 'https://news.google.com/rss/search?q=site%3Abmvg.de%20(Beschaffung%20OR%20Ruestung%20OR%20Ausruestung%20OR%20Ruestungsprojekt%20OR%20Vergabe%20OR%20Innovation)&hl=de&gl=DE&ceid=DE:de', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16),
  ('rp-vtdg-wehrbeauftragter', 'publisher-bundestag.de', null, 'Wehrbeauftragte des Deutschen Bundestages', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abundestag.de%20Wehrbeauftragter%20(Jahresbericht%20OR%20Bericht%20OR%20Stellungnahme%20OR%20Bundeswehr%20OR%20Soldaten)&hl=de&gl=DE&ceid=DE:de', 'https://news.google.com/rss/search?q=site%3Abundestag.de%20Wehrbeauftragter%20(Jahresbericht%20OR%20Bericht%20OR%20Stellungnahme%20OR%20Bundeswehr%20OR%20Soldaten)&hl=de&gl=DE&ceid=DE:de', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16),
  ('rp-vtdg-verteidigungsausschuss', 'publisher-bundestag.de', null, 'Verteidigungsausschuss (oeffentliche Inhalte)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abundestag.de%20Verteidigungsausschuss%20(Anhoerung%20OR%20Tagesordnung%20OR%20Sitzung%20OR%20Stellungnahme%20OR%20Bericht%20OR%20oeffentlich)&hl=de&gl=DE&ceid=DE:de', 'https://news.google.com/rss/search?q=site%3Abundestag.de%20Verteidigungsausschuss%20(Anhoerung%20OR%20Tagesordnung%20OR%20Sitzung%20OR%20Stellungnahme%20OR%20Bericht%20OR%20oeffentlich)&hl=de&gl=DE&ceid=DE:de', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16),
  ('rp-vtdg-bundesregierung-sicherheit', 'publisher-bundesregierung.de', null, 'Bundesregierung — Sicherheits-/Verteidigungspolitik (ergaenzend)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abundesregierung.de%20(Verteidigung%20OR%20Sicherheitspolitik%20OR%20Bundeswehr%20OR%20Streitkraefte)&hl=de&gl=DE&ceid=DE:de', 'https://news.google.com/rss/search?q=site%3Abundesregierung.de%20(Verteidigung%20OR%20Sicherheitspolitik%20OR%20Bundeswehr%20OR%20Streitkraefte)&hl=de&gl=DE&ceid=DE:de', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16)
on conflict (id) do nothing;


-- 5) Paket <-> Abrufweg (5 neue Wege + wiederverwendeter rp-dip)
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-verteidigung-bund', 'rp-vtdg-bmvg-politik-strategie-bundeswehr'),
  ('pkg-verteidigung-bund', 'rp-vtdg-bmvg-beschaffung-ruestung'),
  ('pkg-verteidigung-bund', 'rp-vtdg-wehrbeauftragter'),
  ('pkg-verteidigung-bund', 'rp-vtdg-verteidigungsausschuss'),
  ('pkg-verteidigung-bund', 'rp-vtdg-bundesregierung-sicherheit'),
  ('pkg-verteidigung-bund', 'rp-dip')
on conflict (package_id, retrieval_path_id) do nothing;


-- 6) Erwartete politische Ebene (bund) je neuem Abrufweg
insert into public.path_expected_levels (retrieval_path_id, level) values
  ('rp-vtdg-bmvg-politik-strategie-bundeswehr', 'bund'),
  ('rp-vtdg-bmvg-beschaffung-ruestung', 'bund'),
  ('rp-vtdg-wehrbeauftragter', 'bund'),
  ('rp-vtdg-verteidigungsausschuss', 'bund'),
  ('rp-vtdg-bundesregierung-sicherheit', 'bund')
on conflict (retrieval_path_id, level) do nothing;


-- 7) Erwartete Geografie (geo-bund) je neuem Abrufweg
insert into public.path_expected_geographies (retrieval_path_id, geography_id) values
  ('rp-vtdg-bmvg-politik-strategie-bundeswehr', 'geo-bund'),
  ('rp-vtdg-bmvg-beschaffung-ruestung', 'geo-bund'),
  ('rp-vtdg-wehrbeauftragter', 'geo-bund'),
  ('rp-vtdg-verteidigungsausschuss', 'geo-bund'),
  ('rp-vtdg-bundesregierung-sicherheit', 'geo-bund')
on conflict (retrieval_path_id, geography_id) do nothing;


-- 8) Erwartete Themen je neuem Abrufweg
insert into public.path_expected_topics (retrieval_path_id, topic) values
  ('rp-vtdg-bmvg-politik-strategie-bundeswehr', 'verteidigungspolitik'),
  ('rp-vtdg-bmvg-politik-strategie-bundeswehr', 'sicherheitspolitik'),
  ('rp-vtdg-bmvg-politik-strategie-bundeswehr', 'bundeswehr'),
  ('rp-vtdg-bmvg-politik-strategie-bundeswehr', 'einsatzbereitschaft'),
  ('rp-vtdg-bmvg-politik-strategie-bundeswehr', 'personal'),
  ('rp-vtdg-bmvg-politik-strategie-bundeswehr', 'reserve'),
  ('rp-vtdg-bmvg-politik-strategie-bundeswehr', 'wehrdienst'),
  ('rp-vtdg-bmvg-politik-strategie-bundeswehr', 'auslandseinsaetze'),
  ('rp-vtdg-bmvg-beschaffung-ruestung', 'beschaffung'),
  ('rp-vtdg-bmvg-beschaffung-ruestung', 'ruestung'),
  ('rp-vtdg-bmvg-beschaffung-ruestung', 'ausruestung'),
  ('rp-vtdg-bmvg-beschaffung-ruestung', 'innovation'),
  ('rp-vtdg-wehrbeauftragter', 'wehrbeauftragte'),
  ('rp-vtdg-wehrbeauftragter', 'parlamentarische-kontrolle'),
  ('rp-vtdg-wehrbeauftragter', 'bundeswehr'),
  ('rp-vtdg-wehrbeauftragter', 'innere-fuehrung'),
  ('rp-vtdg-verteidigungsausschuss', 'verteidigungsausschuss'),
  ('rp-vtdg-verteidigungsausschuss', 'parlamentarische-kontrolle'),
  ('rp-vtdg-verteidigungsausschuss', 'anhoerung'),
  ('rp-vtdg-verteidigungsausschuss', 'verteidigungspolitik'),
  ('rp-vtdg-bundesregierung-sicherheit', 'sicherheitspolitik'),
  ('rp-vtdg-bundesregierung-sicherheit', 'verteidigung'),
  ('rp-vtdg-bundesregierung-sicherheit', 'bundeswehr')
on conflict (retrieval_path_id, topic) do nothing;


-- 9) Erwartete Entitaeten je neuem Abrufweg (inkl. wiederverwendeter committee-bt-verteidigung)
insert into public.path_expected_entities (retrieval_path_id, entity_id) values
  ('rp-vtdg-bmvg-politik-strategie-bundeswehr', 'ministry-bmvg'),
  ('rp-vtdg-bmvg-politik-strategie-bundeswehr', 'institution-bundeswehr'),
  ('rp-vtdg-bmvg-beschaffung-ruestung', 'ministry-bmvg'),
  ('rp-vtdg-wehrbeauftragter', 'institution-wehrbeauftragter'),
  ('rp-vtdg-wehrbeauftragter', 'institution-bundeswehr'),
  ('rp-vtdg-verteidigungsausschuss', 'committee-bt-verteidigung'),
  ('rp-vtdg-bundesregierung-sicherheit', 'government-bund'),
  ('rp-vtdg-bundesregierung-sicherheit', 'ministry-bmvg')
on conflict (retrieval_path_id, entity_id) do nothing;


-- Integritaets-Selbstpruefung: 0 aktive Wege nach der Eintragung (erwartet: 0 Zeilen)
-- select id, status, activation_mode from public.retrieval_paths
--   where id in ('rp-vtdg-bmvg-politik-strategie-bundeswehr', 'rp-vtdg-bmvg-beschaffung-ruestung', 'rp-vtdg-wehrbeauftragter', 'rp-vtdg-verteidigungsausschuss', 'rp-vtdg-bundesregierung-sicherheit')
--   and (status <> 'needs_review' or activation_mode <> 'manual');
-- select status, is_base from public.source_packages where id = 'pkg-verteidigung-bund';  -- prepared, false

commit;
notify pgrst, 'reload schema';
