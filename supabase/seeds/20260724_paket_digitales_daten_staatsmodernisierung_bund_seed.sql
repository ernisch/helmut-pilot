-- Helmut — Paket 'digitales-daten-staatsmodernisierung-bund' · PREPARED-Seed
-- (generiert von scripts/generate-bund-digital-seed.js — NICHT von Hand editieren).
-- Voraussetzung: 20260713_source_architecture.sql ist angewendet (Tabellen + Basis-Seed).
-- Paket: status='prepared'. ALLE neuen Abrufwege: status='needs_review', activation_mode='manual'
-- -> technisch INAKTIV. FREIGABEPFLICHTIG. Bestehende Wege werden NUR additiv verknüpft.
begin;

-- 1) Neue politische Entitäten (4) — keine Personenabhängigkeit; kein separater Bundes-CIO
insert into public.political_entities (id, entity_type, name, canonical_key, level, geography_id, aliases) values
  ('ministry-bmds', 'ministry', 'Bundesministerium für Digitales und Staatsmodernisierung', 'bmds', 'bund', 'geo-bund', array['BMDS', 'Digitalministerium', 'Bundesdigitalministerium']::text[]),
  ('institution-it-planungsrat', 'other_institution', 'IT-Planungsrat', 'it-planungsrat', 'bund', 'geo-bund', array['IT-Planungsrat', 'ITPLR']::text[]),
  ('institution-nkr', 'other_institution', 'Nationaler Normenkontrollrat', 'normenkontrollrat', 'bund', 'geo-bund', array['NKR', 'Normenkontrollrat', 'Nationaler Normenkontrollrat']::text[]),
  ('authority-bfdi', 'authority', 'Bundesbeauftragte(r) für den Datenschutz und die Informationsfreiheit', 'bfdi', 'bund', 'geo-bund', array['BfDI', 'Bundesdatenschutzbeauftragte', 'Bundesdatenschutzbeauftragter']::text[])
on conflict (id) do nothing;


-- 2) Neue Herausgeber (4) — Bundesrechnungshof/DIP/Google-News werden wiederverwendet
insert into public.publishers (id, name, canonical_domain, publisher_type, evidence_role, trust, lifecycle_status, entity_id) values
  ('publisher-bmds.bund.de', 'Bundesministerium für Digitales und Staatsmodernisierung', 'bmds.bund.de', 'ministry', 'official_primary', 'unbekannt', 'active', 'ministry-bmds'),
  ('publisher-it-planungsrat.de', 'IT-Planungsrat', 'it-planungsrat.de', 'other_institution', 'official_primary', 'unbekannt', 'active', 'institution-it-planungsrat'),
  ('publisher-normenkontrollrat.bund.de', 'Nationaler Normenkontrollrat', 'normenkontrollrat.bund.de', 'other_institution', 'official_primary', 'unbekannt', 'active', 'institution-nkr'),
  ('publisher-bfdi.bund.de', 'Bundesbeauftragte(r) für den Datenschutz und die Informationsfreiheit', 'bfdi.bund.de', 'authority', 'official_primary', 'unbekannt', 'active', 'authority-bfdi')
on conflict (id) do nothing;


-- 3) Quellenpaket (prepared, is_base=false, Bundesebene)
insert into public.source_packages (id, key, name, purpose, status, is_base, political_level, geography_id, required_classes) values
  ('pkg-digitales-daten-staatsmodernisierung-bund', 'digitales-daten-staatsmodernisierung-bund', 'Digitales, Daten & Staatsmodernisierung Bund', 'Bundespolitik zu Digitalisierung, Daten, KI-Regulierung, Verwaltungsdigitalisierung und Staatsmodernisierung: BMDS (Ressort), IT-Planungsrat (Bund-Länder-Steuerung), Bundestag/DIP (Gesetzgebung, Ausschuss Digitales u. Staatsmodernisierung) sowie die Kontroll-/Aufsichtsebene (Bundesrechnungshof, Normenkontrollrat, BfDI). Kompakter, wiederverwendungs-first Kern.', 'prepared', false, 'bund', 'geo-bund', '{}')
on conflict (id) do nothing;


-- 4) Neue Abrufwege (5) — INAKTIV: needs_review + manual
insert into public.retrieval_paths (id, publisher_id, legacy_source_id, name, method, url, query, parser, priority, status, activation_mode, is_critical, max_items) values
  ('rp-bmds-presse', 'publisher-bmds.bund.de', null, 'BMDS — Presse & Aktuelles (Digital- und Staatsmodernisierungspolitik)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abmds.bund.de&hl=de&gl=DE&ceid=DE:de', 'site:bmds.bund.de', 'googlenews-batchexecute', 72, 'needs_review', 'manual', true, 16),
  ('rp-it-planungsrat-beschluesse', 'publisher-it-planungsrat.de', null, 'IT-Planungsrat — Beschlüsse & Aktuelles (föderale Digitalsteuerung)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Ait-planungsrat.de&hl=de&gl=DE&ceid=DE:de', 'site:it-planungsrat.de', 'googlenews-batchexecute', 70, 'needs_review', 'manual', true, 16),
  ('rp-bundesrechnungshof-digital', 'publisher-bundesrechnungshof.de', null, 'Bundesrechnungshof — IT & Verwaltungsdigitalisierung (Prüfungen)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abundesrechnungshof.de%20(Digitalisierung%20OR%20IT%20OR%20%22E-ID%22%20OR%20Bundescloud%20OR%20Registermodernisierung%20OR%20%22IT-Konsolidierung%22%20OR%20Verwaltung%20OR%20OZG)&hl=de&gl=DE&ceid=DE:de', 'site:bundesrechnungshof.de (Digitalisierung OR IT OR "E-ID" OR Bundescloud OR Registermodernisierung OR "IT-Konsolidierung" OR Verwaltung OR OZG)', 'googlenews-batchexecute', 64, 'needs_review', 'manual', false, 12),
  ('rp-nkr-veroeffentlichungen', 'publisher-normenkontrollrat.bund.de', null, 'Normenkontrollrat — Jahresberichte, Stellungnahmen, Digitalcheck', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Anormenkontrollrat.bund.de&hl=de&gl=DE&ceid=DE:de', 'site:normenkontrollrat.bund.de', 'googlenews-batchexecute', 62, 'needs_review', 'manual', true, 12),
  ('rp-bfdi-veroeffentlichungen', 'publisher-bfdi.bund.de', null, 'BfDI — Tätigkeitsberichte, Stellungnahmen, Aufsicht (Datenschutz/IFG)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abfdi.bund.de&hl=de&gl=DE&ceid=DE:de', 'site:bfdi.bund.de', 'googlenews-batchexecute', 62, 'needs_review', 'manual', true, 12)
on conflict (id) do nothing;


-- 5) Paket <-> Abrufweg (7): 5 neue + 2 wiederverwendete Bestandswege (rp-dip, rp-committee-digitales)
--    Wiederverwendung ist additiv: ein prepared-Paket zählt nicht in die Referenzzählung
--    -> aktiviert nichts, verändert die Bestandswege nicht.
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-digitales-daten-staatsmodernisierung-bund', 'rp-bmds-presse'),
  ('pkg-digitales-daten-staatsmodernisierung-bund', 'rp-it-planungsrat-beschluesse'),
  ('pkg-digitales-daten-staatsmodernisierung-bund', 'rp-bundesrechnungshof-digital'),
  ('pkg-digitales-daten-staatsmodernisierung-bund', 'rp-nkr-veroeffentlichungen'),
  ('pkg-digitales-daten-staatsmodernisierung-bund', 'rp-bfdi-veroeffentlichungen'),
  ('pkg-digitales-daten-staatsmodernisierung-bund', 'rp-dip'),
  ('pkg-digitales-daten-staatsmodernisierung-bund', 'rp-committee-digitales')
on conflict (package_id, retrieval_path_id) do nothing;


-- 6) Erwartete politische Ebene (bund) je NEUEM Abrufweg
insert into public.path_expected_levels (retrieval_path_id, level) values
  ('rp-bmds-presse', 'bund'),
  ('rp-it-planungsrat-beschluesse', 'bund'),
  ('rp-bundesrechnungshof-digital', 'bund'),
  ('rp-nkr-veroeffentlichungen', 'bund'),
  ('rp-bfdi-veroeffentlichungen', 'bund')
on conflict (retrieval_path_id, level) do nothing;


-- 7) Erwartete Geografie (geo-bund) je NEUEM Abrufweg
insert into public.path_expected_geographies (retrieval_path_id, geography_id) values
  ('rp-bmds-presse', 'geo-bund'),
  ('rp-it-planungsrat-beschluesse', 'geo-bund'),
  ('rp-bundesrechnungshof-digital', 'geo-bund'),
  ('rp-nkr-veroeffentlichungen', 'geo-bund'),
  ('rp-bfdi-veroeffentlichungen', 'geo-bund')
on conflict (retrieval_path_id, geography_id) do nothing;


-- 8) Erwartete Themen je NEUEM Abrufweg (Abdeckungsnachweis)
insert into public.path_expected_topics (retrieval_path_id, topic) values
  ('rp-bmds-presse', 'digitalpolitik'),
  ('rp-bmds-presse', 'staatsmodernisierung'),
  ('rp-bmds-presse', 'verwaltungsdigitalisierung'),
  ('rp-bmds-presse', 'ki-regulierung'),
  ('rp-bmds-presse', 'digitale-souveraenitaet'),
  ('rp-bmds-presse', 'deutschland-stack'),
  ('rp-bmds-presse', 'registermodernisierung'),
  ('rp-bmds-presse', 'ozg'),
  ('rp-it-planungsrat-beschluesse', 'bund-laender-koordination'),
  ('rp-it-planungsrat-beschluesse', 'foederale-digitalstrategie'),
  ('rp-it-planungsrat-beschluesse', 'deutschland-architektur'),
  ('rp-it-planungsrat-beschluesse', 'registermodernisierung'),
  ('rp-it-planungsrat-beschluesse', 'noots'),
  ('rp-it-planungsrat-beschluesse', 'verwaltungscloud'),
  ('rp-it-planungsrat-beschluesse', 'ozg'),
  ('rp-bundesrechnungshof-digital', 'haushalts-und-wirtschaftlichkeitskontrolle'),
  ('rp-bundesrechnungshof-digital', 'it-grossprojekte'),
  ('rp-bundesrechnungshof-digital', 'it-konsolidierung'),
  ('rp-bundesrechnungshof-digital', 'registermodernisierung'),
  ('rp-bundesrechnungshof-digital', 'verwaltungsdigitalisierung'),
  ('rp-nkr-veroeffentlichungen', 'buerokratieabbau'),
  ('rp-nkr-veroeffentlichungen', 'digitalcheck'),
  ('rp-nkr-veroeffentlichungen', 'staatsmodernisierung'),
  ('rp-nkr-veroeffentlichungen', 'gesetzesqualitaet'),
  ('rp-bfdi-veroeffentlichungen', 'datenschutz'),
  ('rp-bfdi-veroeffentlichungen', 'informationsfreiheit'),
  ('rp-bfdi-veroeffentlichungen', 'ki-regulierung'),
  ('rp-bfdi-veroeffentlichungen', 'data-act'),
  ('rp-bfdi-veroeffentlichungen', 'aufsicht')
on conflict (retrieval_path_id, topic) do nothing;


-- Integritäts-Selbstprüfung (erwartet: 0 Zeilen) — kein neuer Weg aktiv:
-- select id, status, activation_mode from public.retrieval_paths
--   where id in ('rp-bmds-presse', 'rp-it-planungsrat-beschluesse', 'rp-bundesrechnungshof-digital', 'rp-nkr-veroeffentlichungen', 'rp-bfdi-veroeffentlichungen')
--   and (status <> 'needs_review' or activation_mode <> 'manual');
-- Paketstatus (erwartet: prepared):
-- select status from public.source_packages where id = 'pkg-digitales-daten-staatsmodernisierung-bund';

commit;
notify pgrst, 'reload schema';
