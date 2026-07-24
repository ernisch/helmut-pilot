-- Helmut — Fachpaket 'Wissenschaft und Forschung (Bund)' · PREPARED-Seed (generiert, idempotent, NICHT-destruktiv).
-- Generiert von scripts/generate-wissenschaft-forschung-bund-seed.js. NICHT von Hand editieren.
-- Voraussetzung: 20260713_source_architecture.sql + Basis-Seed sind angewendet.
-- Paket status='prepared'; ALLE Abrufwege status='needs_review', activation_mode='manual' -> technisch INAKTIV. FREIGABEPFLICHTIG.
-- Destatis/OECD sind BESTEHENDE Herausgeber und werden nur referenziert (nicht eingefügt).
begin;

-- 1) Quellenpaket (prepared, inaktiv)
insert into public.source_packages (id, key, name, purpose, status, is_base, political_level, geography_id, required_classes) values
  ('pkg-wissenschaft-forschung-bund', 'wissenschaft-forschung-bund', 'Wissenschaft und Forschung (Bund)', 'Fachthemenpaket Wissenschafts-, Forschungs- und Technologiepolitik des Bundes (Bundesforschungsstrategie, Forschungsförderung, Bund-Länder-Steuerung, Wissenschaftssystem, Hochschul-/Wissenschaftsfinanzierung, Exzellenzstrategie, wissenschaftlicher Nachwuchs, Raumfahrtpolitik, EU-Forschungsförderung, internationale Vergleiche). Fachthema, NICHT Region. Parlamentarische Abdeckung (Bundestag/Forschungsausschuss/DIP) läuft über bund-basis.', 'prepared', false, 'bund', 'geo-bund', '{}')
on conflict (id) do nothing;


-- 2) Politische Entitäten (8 neue Wissenschafts-/Forschungs-Institutionen)
insert into public.political_entities (id, entity_type, name, canonical_key, level, geography_id, aliases) values
  ('ministry-bmftr', 'ministry', 'Bundesministerium für Forschung, Technologie und Raumfahrt', 'bmftr', 'bund', 'geo-bund', array['BMFTR', 'BMBF', 'Bundesministerium für Bildung und Forschung']::text[]),
  ('institution-gwk', 'other_institution', 'Gemeinsame Wissenschaftskonferenz', 'gwk', 'bund', 'geo-bund', array['GWK']::text[]),
  ('institution-wissenschaftsrat', 'other_institution', 'Wissenschaftsrat', 'wissenschaftsrat', 'bund', 'geo-bund', array['WR', 'Wissenschaftsrat']::text[]),
  ('institution-dfg', 'other_institution', 'Deutsche Forschungsgemeinschaft', 'dfg', 'bund', 'geo-bund', array['DFG']::text[]),
  ('institution-efi', 'other_institution', 'Expertenkommission Forschung und Innovation', 'efi', 'bund', 'geo-bund', array['EFI']::text[]),
  ('institution-dzhw', 'other_institution', 'Deutsches Zentrum für Hochschul- und Wissenschaftsforschung', 'dzhw', 'bund', 'geo-bund', array['DZHW']::text[]),
  ('institution-eu-kommission-rtd', 'other_institution', 'Europäische Kommission — GD Forschung und Innovation', 'eu-kommission-rtd', 'eu', null, array['DG RTD', 'GD RTD', 'Horizon Europe']::text[]),
  ('association-hrk', 'association', 'Hochschulrektorenkonferenz', 'hrk', 'bund', 'geo-bund', array['HRK']::text[])
on conflict (id) do nothing;


-- 3) Herausgeber (8 neue; Destatis/OECD bestehen bereits und werden NICHT eingefügt)
insert into public.publishers (id, name, canonical_domain, publisher_type, evidence_role, trust, lifecycle_status, entity_id) values
  ('publisher-bmftr.bund.de', 'Bundesministerium für Forschung, Technologie und Raumfahrt', 'bmftr.bund.de', 'ministry', 'official_primary', 'unbekannt', 'active', 'ministry-bmftr'),
  ('publisher-gwk-bonn.de', 'Gemeinsame Wissenschaftskonferenz', 'gwk-bonn.de', 'other_institution', 'official_primary', 'unbekannt', 'active', 'institution-gwk'),
  ('publisher-wissenschaftsrat.de', 'Wissenschaftsrat', 'wissenschaftsrat.de', 'other_institution', 'official_primary', 'unbekannt', 'active', 'institution-wissenschaftsrat'),
  ('publisher-dfg.de', 'Deutsche Forschungsgemeinschaft', 'dfg.de', 'other_institution', 'data_source', 'unbekannt', 'active', 'institution-dfg'),
  ('publisher-e-fi.de', 'Expertenkommission Forschung und Innovation', 'e-fi.de', 'other_institution', 'data_source', 'unbekannt', 'active', 'institution-efi'),
  ('publisher-dzhw.eu', 'Deutsches Zentrum für Hochschul- und Wissenschaftsforschung', 'dzhw.eu', 'other_institution', 'data_source', 'unbekannt', 'active', 'institution-dzhw'),
  ('publisher-research-and-innovation.ec.europa.eu', 'Europäische Kommission — GD Forschung und Innovation', 'research-and-innovation.ec.europa.eu', 'government', 'official_primary', 'unbekannt', 'active', 'institution-eu-kommission-rtd'),
  ('publisher-hrk.de', 'Hochschulrektorenkonferenz', 'hrk.de', 'association', 'direct_interest', 'unbekannt', 'active', 'association-hrk')
on conflict (id) do nothing;


-- 4) Abrufwege (12) — INAKTIV: needs_review + manual
insert into public.retrieval_paths (id, publisher_id, legacy_source_id, name, method, url, query, parser, priority, status, activation_mode, is_critical, max_items) values
  ('rp-wf-bmftr-politik', 'publisher-bmftr.bund.de', 'wf-bmftr-politik', 'BMFTR — Forschungs- und Technologiepolitik', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abmftr.bund.de%20(Forschung%20OR%20Technologie%20OR%20%22Hightech%20Agenda%22%20OR%20F%C3%B6rderung%20OR%20Strategie%20OR%20Innovation)&hl=de&gl=DE&ceid=DE:de', 'site:bmftr.bund.de (Forschung OR Technologie OR "Hightech Agenda" OR Förderung OR Strategie OR Innovation)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16),
  ('rp-wf-bmftr-bufi', 'publisher-bmftr.bund.de', 'wf-bmftr-bufi', 'BMFTR — Bundesbericht Forschung und Innovation (BuFI)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abmftr.bund.de%20(%22Bundesbericht%20Forschung%20und%20Innovation%22%20OR%20BuFI)&hl=de&gl=DE&ceid=DE:de', 'site:bmftr.bund.de ("Bundesbericht Forschung und Innovation" OR BuFI)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16),
  ('rp-wf-gwk-beschluesse', 'publisher-gwk-bonn.de', 'wf-gwk-beschluesse', 'GWK — Beschlüsse und Bund-Länder-Vereinbarungen', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Agwk-bonn.de%20(Beschluss%20OR%20Vereinbarung%20OR%20Exzellenzstrategie%20OR%20%22Pakt%20f%C3%BCr%20Forschung%20und%20Innovation%22%20OR%20Zukunftsvertrag%20OR%20Forschungsinfrastruktur)&hl=de&gl=DE&ceid=DE:de', 'site:gwk-bonn.de (Beschluss OR Vereinbarung OR Exzellenzstrategie OR "Pakt für Forschung und Innovation" OR Zukunftsvertrag OR Forschungsinfrastruktur)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16),
  ('rp-wf-wissenschaftsrat', 'publisher-wissenschaftsrat.de', 'wf-wissenschaftsrat', 'Wissenschaftsrat — Empfehlungen und Stellungnahmen', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Awissenschaftsrat.de%20(Empfehlung%20OR%20Stellungnahme%20OR%20Evaluation%20OR%20Akkreditierung)&hl=de&gl=DE&ceid=DE:de', 'site:wissenschaftsrat.de (Empfehlung OR Stellungnahme OR Evaluation OR Akkreditierung)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16),
  ('rp-wf-dfg-strategie', 'publisher-dfg.de', 'wf-dfg-strategie', 'DFG — Förderatlas, Jahresbericht, Stellungnahmen', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Adfg.de%20(F%C3%B6rderatlas%20OR%20Jahresbericht%20OR%20Stellungnahme%20OR%20Exzellenzstrategie%20OR%20Wissenschaftsfreiheit)&hl=de&gl=DE&ceid=DE:de', 'site:dfg.de (Förderatlas OR Jahresbericht OR Stellungnahme OR Exzellenzstrategie OR Wissenschaftsfreiheit)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16),
  ('rp-wf-efi-gutachten', 'publisher-e-fi.de', 'wf-efi-gutachten', 'EFI — Jahresgutachten Forschung, Innovation und technologische Leistungsfähigkeit', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Ae-fi.de%20(Gutachten%20OR%20Forschung%20OR%20Innovation)&hl=de&gl=DE&ceid=DE:de', 'site:e-fi.de (Gutachten OR Forschung OR Innovation)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16),
  ('rp-wf-destatis-hochschulforschung', 'publisher-destatis.de', 'wf-destatis-hochschulforschung', 'Destatis — Hochschul- und FuE-Statistik', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Adestatis.de%20(Hochschule%20OR%20Studierende%20OR%20Promotionen%20OR%20%22Personal%20an%20Hochschulen%22%20OR%20%22Forschung%20und%20Entwicklung%22%20OR%20FuE)&hl=de&gl=DE&ceid=DE:de', 'site:destatis.de (Hochschule OR Studierende OR Promotionen OR "Personal an Hochschulen" OR "Forschung und Entwicklung" OR FuE)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16),
  ('rp-wf-dzhw', 'publisher-dzhw.eu', 'wf-dzhw', 'DZHW — Hochschul- und Wissenschaftsforschung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Adzhw.eu%20(Studie%20OR%20Wissenschaftssystem%20OR%20Promovierende%20OR%20Wissenschaftspersonal%20OR%20Studienabbruch)&hl=de&gl=DE&ceid=DE:de', 'site:dzhw.eu (Studie OR Wissenschaftssystem OR Promovierende OR Wissenschaftspersonal OR Studienabbruch)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16),
  ('rp-wf-eu-forschung', 'publisher-research-and-innovation.ec.europa.eu', 'wf-eu-forschung', 'Europäische Kommission (GD RTD) — Horizon Europe', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Aresearch-and-innovation.ec.europa.eu%20(%22Horizon%20Europe%22%20OR%20funding%20OR%20%22work%20programme%22%20OR%20%22research%20and%20innovation%22)&hl=de&gl=DE&ceid=DE:de', 'site:research-and-innovation.ec.europa.eu ("Horizon Europe" OR funding OR "work programme" OR "research and innovation")', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16),
  ('rp-wf-oecd-sti', 'publisher-oecd.org', 'wf-oecd-sti', 'OECD — Science, Technology and Innovation', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Aoecd.org%20Germany%20(science%20OR%20research%20OR%20innovation%20OR%20%22R%26D%22)&hl=de&gl=DE&ceid=DE:de', 'site:oecd.org Germany (science OR research OR innovation OR "R&D")', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16),
  ('rp-wf-bmftr-raumfahrt', 'publisher-bmftr.bund.de', 'wf-bmftr-raumfahrt', 'BMFTR — Raumfahrtpolitik und Raumfahrtstrategie', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abmftr.bund.de%20(Raumfahrt%20OR%20Raumfahrtstrategie%20OR%20Weltraum%20OR%20Raumfahrtagentur)&hl=de&gl=DE&ceid=DE:de', 'site:bmftr.bund.de (Raumfahrt OR Raumfahrtstrategie OR Weltraum OR Raumfahrtagentur)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16),
  ('rp-wf-hrk', 'publisher-hrk.de', 'wf-hrk', 'HRK — Hochschulrektorenkonferenz (ereignisbezogen)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Ahrk.de%20(Wissenschaftszeitvertragsgesetz%20OR%20Hochschulfinanzierung%20OR%20Forschung%20OR%20Stellungnahme)&hl=de&gl=DE&ceid=DE:de', 'site:hrk.de (Wissenschaftszeitvertragsgesetz OR Hochschulfinanzierung OR Forschung OR Stellungnahme)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16)
on conflict (id) do nothing;


-- 5) Paket <-> Abrufweg (nur pkg-wissenschaft-forschung-bund)
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-wissenschaft-forschung-bund', 'rp-wf-bmftr-politik'),
  ('pkg-wissenschaft-forschung-bund', 'rp-wf-bmftr-bufi'),
  ('pkg-wissenschaft-forschung-bund', 'rp-wf-gwk-beschluesse'),
  ('pkg-wissenschaft-forschung-bund', 'rp-wf-wissenschaftsrat'),
  ('pkg-wissenschaft-forschung-bund', 'rp-wf-dfg-strategie'),
  ('pkg-wissenschaft-forschung-bund', 'rp-wf-efi-gutachten'),
  ('pkg-wissenschaft-forschung-bund', 'rp-wf-destatis-hochschulforschung'),
  ('pkg-wissenschaft-forschung-bund', 'rp-wf-dzhw'),
  ('pkg-wissenschaft-forschung-bund', 'rp-wf-eu-forschung'),
  ('pkg-wissenschaft-forschung-bund', 'rp-wf-oecd-sti'),
  ('pkg-wissenschaft-forschung-bund', 'rp-wf-bmftr-raumfahrt'),
  ('pkg-wissenschaft-forschung-bund', 'rp-wf-hrk')
on conflict (package_id, retrieval_path_id) do nothing;


-- 6) Erwartete politische Ebene je Abrufweg (bund/eu/international)
insert into public.path_expected_levels (retrieval_path_id, level) values
  ('rp-wf-bmftr-politik', 'bund'),
  ('rp-wf-bmftr-bufi', 'bund'),
  ('rp-wf-gwk-beschluesse', 'bund'),
  ('rp-wf-wissenschaftsrat', 'bund'),
  ('rp-wf-dfg-strategie', 'bund'),
  ('rp-wf-efi-gutachten', 'bund'),
  ('rp-wf-destatis-hochschulforschung', 'bund'),
  ('rp-wf-dzhw', 'bund'),
  ('rp-wf-eu-forschung', 'eu'),
  ('rp-wf-oecd-sti', 'international'),
  ('rp-wf-bmftr-raumfahrt', 'bund'),
  ('rp-wf-hrk', 'bund')
on conflict (retrieval_path_id, level) do nothing;


-- 7) Erwartete Geografie je Abrufweg (nur Bund-Ebene -> geo-bund)
insert into public.path_expected_geographies (retrieval_path_id, geography_id) values
  ('rp-wf-bmftr-politik', 'geo-bund'),
  ('rp-wf-bmftr-bufi', 'geo-bund'),
  ('rp-wf-gwk-beschluesse', 'geo-bund'),
  ('rp-wf-wissenschaftsrat', 'geo-bund'),
  ('rp-wf-dfg-strategie', 'geo-bund'),
  ('rp-wf-efi-gutachten', 'geo-bund'),
  ('rp-wf-destatis-hochschulforschung', 'geo-bund'),
  ('rp-wf-dzhw', 'geo-bund'),
  ('rp-wf-bmftr-raumfahrt', 'geo-bund'),
  ('rp-wf-hrk', 'geo-bund')
on conflict (retrieval_path_id, geography_id) do nothing;


-- Integritäts-Selbstprüfung (erwartet: 0 Zeilen — kein aktiver Weg, Paket prepared).
-- select id, status, activation_mode from public.retrieval_paths
--   where id in ('rp-wf-bmftr-politik', 'rp-wf-bmftr-bufi', 'rp-wf-gwk-beschluesse', 'rp-wf-wissenschaftsrat', 'rp-wf-dfg-strategie', 'rp-wf-efi-gutachten', 'rp-wf-destatis-hochschulforschung', 'rp-wf-dzhw', 'rp-wf-eu-forschung', 'rp-wf-oecd-sti', 'rp-wf-bmftr-raumfahrt', 'rp-wf-hrk')
--   and (status <> 'needs_review' or activation_mode <> 'manual');
-- select id, status from public.source_packages where id = 'pkg-wissenschaft-forschung-bund' and status <> 'prepared';

commit;
notify pgrst, 'reload schema';
