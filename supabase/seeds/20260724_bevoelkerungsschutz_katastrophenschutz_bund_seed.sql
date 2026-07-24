-- Helmut — Paket 'bevoelkerungsschutz-katastrophenschutz-bund' · PREPARED-Seed
-- (generiert, idempotent, NICHT-destruktiv). Generiert von
-- scripts/generate-bevoelkerungsschutz-seed.js. NICHT von Hand editieren.
-- Voraussetzung: 20260713_source_architecture.sql + Haupt-Seed sind angewendet
--   (Tabellen + rp-dip, rp-committee-inneres, geo-bund, ministry-bmi,
--    authority-bundesrechnungshof, publisher-bundesrechnungshof.de vorhanden).
-- Paket: status='prepared' (kein Profil-Mapping, kein aktiver Crawl-Plan).
-- Alle NEUEN Abrufwege: status='needs_review', activation_mode='manual' -> INAKTIV.
-- Bestehende Wege werden NUR additiv zugeordnet, NICHT veraendert. FREIGABEPFLICHTIG.
begin;

-- 1) Politische Entitaeten (3 NEU: BBK, THW, IMK). Bestehende (BMI, BRH) NICHT angelegt.
insert into public.political_entities (id, entity_type, name, canonical_key, level, geography_id, aliases) values
  ('authority-bbk', 'authority', 'Bundesamt für Bevölkerungsschutz und Katastrophenhilfe', null, 'bund', 'geo-bund', '{"BBK"}'),
  ('authority-thw', 'authority', 'Bundesanstalt Technisches Hilfswerk', null, 'bund', 'geo-bund', '{"THW"}'),
  ('institution-imk', 'other_institution', 'Ständige Konferenz der Innenminister und -senatoren der Länder', null, null, null, '{"IMK","Innenministerkonferenz"}')
on conflict (id) do nothing;


-- 2) Herausgeber (4 NEU + bundesrechnungshof.de bestehend via DO NOTHING geschuetzt).
insert into public.publishers (id, name, canonical_domain, publisher_type, evidence_role, trust, lifecycle_status, entity_id) values
  ('publisher-bmi.bund.de', 'Bundesministerium des Innern', 'bmi.bund.de', 'ministry', 'official_primary', 'hoch', 'active', 'ministry-bmi'),
  ('publisher-bbk.bund.de', 'Bundesamt für Bevölkerungsschutz und Katastrophenhilfe', 'bbk.bund.de', 'authority', 'official_primary', 'hoch', 'active', 'authority-bbk'),
  ('publisher-thw.de', 'Bundesanstalt Technisches Hilfswerk', 'thw.de', 'authority', 'official_primary', 'hoch', 'active', 'authority-thw'),
  ('publisher-innenministerkonferenz.de', 'Innenministerkonferenz (IMK)', 'innenministerkonferenz.de', 'authority', 'official_primary', 'hoch', 'active', 'institution-imk'),
  ('publisher-bundesrechnungshof.de', 'Bundesrechnungshof', 'bundesrechnungshof.de', 'authority', 'data_source', 'hoch', 'active', 'authority-bundesrechnungshof')
on conflict (id) do nothing;


-- 3) Quellenpaket (NEU, status='prepared', kein is_base, Bund).
insert into public.source_packages (id, key, name, purpose, status, is_base, political_level, geography_id, required_classes) values
  ('pkg-bevoelkerungsschutz-katastrophenschutz-bund', 'bevoelkerungsschutz-katastrophenschutz-bund', 'Bevölkerungsschutz & Katastrophenschutz (Bund)', 'Ziviler Bevölkerungs- und Katastrophenschutz des Bundes: politische Steuerung (BMI/Resilienzstrategie), fachliche Umsetzung & Risikoanalysen (BBK), Warnsystem-Evaluierung & LÜKEX (BBK), operative Zivilschutzentwicklung (THW-Jahresbericht), Bund-Länder-Steuerung (IMK-Beschlüsse), parlamentarische Kontrolle (DIP/Innenausschuss) und Haushaltskontrolle (Bundesrechnungshof). Rein zivil — Innere Sicherheit/Polizei/Verfassungsschutz ausgeschlossen (Paket innere-sicherheit-bund). Struktur vorbereitet, technisch INAKTIV (prepared, ohne Profil-Mapping, ohne aktiven Crawl-Plan).', 'prepared', false, 'bund', 'geo-bund', '{}')
on conflict (id) do nothing;


-- 4) Abrufwege (7 NEU) — INAKTIV: needs_review + manual. Bestehende Wege NICHT hier.
insert into public.retrieval_paths (id, publisher_id, legacy_source_id, name, method, url, query, parser, priority, status, activation_mode, is_critical, max_items) values
  ('rp-bevschutz-bmi-strategie', 'publisher-bmi.bund.de', 'bevschutz-bmi-strategie', 'BMI — Bevölkerungsschutz & Resilienzstrategie', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abmi.bund.de%20(Bev%C3%B6lkerungsschutz%20OR%20Resilienzstrategie%20OR%20Resilienz%20OR%20Zivilschutz%20OR%20Katastrophenschutz%20OR%20Verteidigungsf%C3%A4higkeit)&hl=de&gl=DE&ceid=DE:de', 'site:bmi.bund.de (Bevölkerungsschutz OR Resilienzstrategie OR Resilienz OR Zivilschutz OR Katastrophenschutz OR Verteidigungsfähigkeit)', 'googlenews-batchexecute', 86, 'needs_review', 'manual', true, 16),
  ('rp-bevschutz-bbk-strategie-risiko', 'publisher-bbk.bund.de', 'bevschutz-bbk-strategie-risiko', 'BBK — Strategie, Risikoanalysen & Zivilschutz', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abbk.bund.de%20(Risikoanalyse%20OR%20Resilienz%20OR%20Bev%C3%B6lkerungsschutz%20OR%20Zivilschutz%20OR%20Katastrophenschutz%20OR%20KRITIS)&hl=de&gl=DE&ceid=DE:de', 'site:bbk.bund.de (Risikoanalyse OR Resilienz OR Bevölkerungsschutz OR Zivilschutz OR Katastrophenschutz OR KRITIS)', 'googlenews-batchexecute', 86, 'needs_review', 'manual', true, 16),
  ('rp-bevschutz-imk-beschluesse', 'publisher-innenministerkonferenz.de', 'bevschutz-imk-beschluesse', 'IMK — Beschlüsse Bevölkerungs-/Katastrophenschutz & zivile Verteidigung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Ainnenministerkonferenz.de%20(Bev%C3%B6lkerungsschutz%20OR%20Katastrophenschutz%20OR%20Zivilschutz%20OR%20Verteidigungsf%C3%A4higkeit%20OR%20Beschluss)&hl=de&gl=DE&ceid=DE:de', 'site:innenministerkonferenz.de (Bevölkerungsschutz OR Katastrophenschutz OR Zivilschutz OR Verteidigungsfähigkeit OR Beschluss)', 'googlenews-batchexecute', 84, 'needs_review', 'manual', true, 16),
  ('rp-bevschutz-bbk-warnung', 'publisher-bbk.bund.de', 'bevschutz-bbk-warnung', 'BBK — Warnsysteme & Warntag-Auswertung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abbk.bund.de%20(Warntag%20OR%20Warnung%20OR%20Warnsystem%20OR%20Warnmittel%20OR%20MoWaS%20OR%20NINA%20OR%20Sirenen)&hl=de&gl=DE&ceid=DE:de', 'site:bbk.bund.de (Warntag OR Warnung OR Warnsystem OR Warnmittel OR MoWaS OR NINA OR Sirenen)', 'googlenews-batchexecute', 76, 'needs_review', 'manual', false, 16),
  ('rp-bevschutz-thw-jahresbericht', 'publisher-thw.de', 'bevschutz-thw-jahresbericht', 'THW — Jahresbericht & Zivilschutzentwicklung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Athw.de%20(Jahresbericht%20OR%20Jahresr%C3%BCckblick%20OR%20Zivilschutz%20OR%20Bauprogramm%20OR%20Ausstattung%20OR%20Ehrenamt)&hl=de&gl=DE&ceid=DE:de', 'site:thw.de (Jahresbericht OR Jahresrückblick OR Zivilschutz OR Bauprogramm OR Ausstattung OR Ehrenamt)', 'googlenews-batchexecute', 74, 'needs_review', 'manual', false, 16),
  ('rp-bevschutz-bbk-luekex', 'publisher-bbk.bund.de', 'bevschutz-bbk-luekex', 'BBK — LÜKEX & strategisches Krisenmanagement', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abbk.bund.de%20(L%C3%9CKEX%20OR%20Krisenmanagement%20OR%20Krisen%C3%BCbung%20OR%20Stabsrahmen%C3%BCbung)&hl=de&gl=DE&ceid=DE:de', 'site:bbk.bund.de (LÜKEX OR Krisenmanagement OR Krisenübung OR Stabsrahmenübung)', 'googlenews-batchexecute', 72, 'needs_review', 'manual', false, 16),
  ('rp-bevschutz-brh-pruefungen', 'publisher-bundesrechnungshof.de', 'bevschutz-brh-pruefungen', 'Bundesrechnungshof — Prüfungen Bevölkerungsschutz (BBK/THW/ZSKG/GeKoB)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abundesrechnungshof.de%20(Bev%C3%B6lkerungsschutz%20OR%20Katastrophenschutz%20OR%20Zivilschutz%20OR%20BBK%20OR%20THW%20OR%20ZSKG%20OR%20GeKoB)&hl=de&gl=DE&ceid=DE:de', 'site:bundesrechnungshof.de (Bevölkerungsschutz OR Katastrophenschutz OR Zivilschutz OR BBK OR THW OR ZSKG OR GeKoB)', 'googlenews-batchexecute', 68, 'needs_review', 'manual', false, 16)
on conflict (id) do nothing;


-- 5) Paket <-> Abrufweg (9: 7 neue + 2 wiederverwendete rp-dip/rp-committee-inneres).
--    Die 2 Verweise auf bestehende Wege sind rein ADDITIVE Zuordnungen (m:n).
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-bevoelkerungsschutz-katastrophenschutz-bund', 'rp-bevschutz-bmi-strategie'),
  ('pkg-bevoelkerungsschutz-katastrophenschutz-bund', 'rp-bevschutz-bbk-strategie-risiko'),
  ('pkg-bevoelkerungsschutz-katastrophenschutz-bund', 'rp-bevschutz-imk-beschluesse'),
  ('pkg-bevoelkerungsschutz-katastrophenschutz-bund', 'rp-bevschutz-bbk-warnung'),
  ('pkg-bevoelkerungsschutz-katastrophenschutz-bund', 'rp-bevschutz-thw-jahresbericht'),
  ('pkg-bevoelkerungsschutz-katastrophenschutz-bund', 'rp-bevschutz-bbk-luekex'),
  ('pkg-bevoelkerungsschutz-katastrophenschutz-bund', 'rp-bevschutz-brh-pruefungen'),
  ('pkg-bevoelkerungsschutz-katastrophenschutz-bund', 'rp-dip'),
  ('pkg-bevoelkerungsschutz-katastrophenschutz-bund', 'rp-committee-inneres')
on conflict (package_id, retrieval_path_id) do nothing;


-- 6) Erwartete politische Ebene (bund) je NEUEM Weg (7).
insert into public.path_expected_levels (retrieval_path_id, level) values
  ('rp-bevschutz-bmi-strategie', 'bund'),
  ('rp-bevschutz-bbk-strategie-risiko', 'bund'),
  ('rp-bevschutz-imk-beschluesse', 'bund'),
  ('rp-bevschutz-bbk-warnung', 'bund'),
  ('rp-bevschutz-thw-jahresbericht', 'bund'),
  ('rp-bevschutz-bbk-luekex', 'bund'),
  ('rp-bevschutz-brh-pruefungen', 'bund')
on conflict (retrieval_path_id, level) do nothing;


-- 7) Erwartete Geografie (geo-bund) je NEUEM Weg (7).
insert into public.path_expected_geographies (retrieval_path_id, geography_id) values
  ('rp-bevschutz-bmi-strategie', 'geo-bund'),
  ('rp-bevschutz-bbk-strategie-risiko', 'geo-bund'),
  ('rp-bevschutz-imk-beschluesse', 'geo-bund'),
  ('rp-bevschutz-bbk-warnung', 'geo-bund'),
  ('rp-bevschutz-thw-jahresbericht', 'geo-bund'),
  ('rp-bevschutz-bbk-luekex', 'geo-bund'),
  ('rp-bevschutz-brh-pruefungen', 'geo-bund')
on conflict (retrieval_path_id, geography_id) do nothing;


-- Integritaets-Selbstpruefung (erwartet je 0 Zeilen):
-- (a) kein neuer Weg aktiv:
-- select id, status, activation_mode from public.retrieval_paths
--   where id in ('rp-bevschutz-bmi-strategie', 'rp-bevschutz-bbk-strategie-risiko', 'rp-bevschutz-imk-beschluesse', 'rp-bevschutz-bbk-warnung', 'rp-bevschutz-thw-jahresbericht', 'rp-bevschutz-bbk-luekex', 'rp-bevschutz-brh-pruefungen') and (status <> 'needs_review' or activation_mode <> 'manual');
-- (b) Paket bleibt prepared:
-- select id, status from public.source_packages where id = 'pkg-bevoelkerungsschutz-katastrophenschutz-bund' and status <> 'prepared';

commit;
notify pgrst, 'reload schema';
