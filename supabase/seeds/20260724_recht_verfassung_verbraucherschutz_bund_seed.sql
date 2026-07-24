-- Helmut — Paket 'recht-verfassung-und-verbraucherschutz-bund' · PREPARED-Seed
-- (generiert, idempotent, NICHT-destruktiv). Generiert von
-- scripts/generate-recht-verfassung-verbraucherschutz-seed.js. NICHT von Hand editieren.
-- Voraussetzung: 20260713_source_architecture.sql ist angewendet (Tabellen + Basis-Seed).
-- Paket: status='prepared', is_base=false -> vollstaendig INAKTIV.
-- Neue Abrufwege: status='needs_review', activation_mode='manual', is_critical=false.
-- Wiederverwendete Wege (rp-dip, rp-bundesregierung) werden NUR via package_paths
-- verknuepft und NICHT veraendert. FREIGABEPFLICHTIG.
begin;

-- 1) Neue politische Entitaeten (Institutionen, keine Personen)
insert into public.political_entities (id, entity_type, name, canonical_key, level, geography_id, aliases) values
  ('ministry-bmjv', 'ministry', 'Bundesministerium der Justiz und für Verbraucherschutz', null, 'bund', 'geo-bund', array['BMJV', 'Bundesministerium der Justiz', 'BMJ']::text[]),
  ('institution-bverfg', 'other_institution', 'Bundesverfassungsgericht', null, 'bund', 'geo-bund', array['BVerfG']::text[]),
  ('authority-bfdi', 'authority', 'Bundesbeauftragte für den Datenschutz und die Informationsfreiheit', null, 'bund', 'geo-bund', array['BfDI']::text[])
on conflict (id) do nothing;


-- 2) Neue Herausgeber (3)
insert into public.publishers (id, name, canonical_domain, publisher_type, evidence_role, trust, lifecycle_status, entity_id) values
  ('publisher-bmjv.de', 'Bundesministerium der Justiz und für Verbraucherschutz', 'bmjv.de', 'ministry', 'official_primary', 'hoch', 'active', 'ministry-bmjv'),
  ('publisher-bundesverfassungsgericht.de', 'Bundesverfassungsgericht', 'bundesverfassungsgericht.de', 'authority', 'official_primary', 'hoch', 'active', 'institution-bverfg'),
  ('publisher-bfdi.bund.de', 'Bundesbeauftragte für den Datenschutz und die Informationsfreiheit', 'bfdi.bund.de', 'authority', 'official_primary', 'hoch', 'active', 'authority-bfdi')
on conflict (id) do nothing;


-- 3) Neue Abrufwege (5) — INAKTIV: needs_review + manual + is_critical=false
insert into public.retrieval_paths (id, publisher_id, legacy_source_id, name, method, url, query, parser, priority, status, activation_mode, is_critical, max_items) values
  ('rp-bmjv-recht', 'publisher-bmjv.de', null, 'BMJV — Recht, Justiz und Gesetzgebung', 'html', 'https://www.bmjv.de/DE/service/gesetzgebung/gesetzgebungsverfahren/gesetzgebungsverfahren_node.html', null, 'html-scrape', 90, 'needs_review', 'manual', false, 16),
  ('rp-bmjv-verbraucher', 'publisher-bmjv.de', null, 'BMJV — Verbraucherpolitik', 'html', 'https://www.bmjv.de/DE/Ministerium/Abteilungen/Verbraucherpolitik/Verbraucherpolitik_node.html', null, 'html-scrape', 88, 'needs_review', 'manual', false, 16),
  ('rp-bverfg-presse', 'publisher-bundesverfassungsgericht.de', null, 'Bundesverfassungsgericht — Pressemitteilungen', 'html', 'https://www.bundesverfassungsgericht.de/DE/Presse/presse_node.html', null, 'html-scrape', 90, 'needs_review', 'manual', false, 16),
  ('rp-bfdi', 'publisher-bfdi.bund.de', null, 'BfDI — Datenschutz und Informationsfreiheit', 'rss', 'https://www.bfdi.bund.de/SiteGlobals/Functions/RSSFeed/Allgemein/rssnewsfeed.xml?nn=253102', null, 'rss-regex', 88, 'needs_review', 'manual', false, 16),
  ('rp-ausschuss-recht-verbraucherschutz', 'publisher-bundestag.de', null, 'Ausschuss für Recht und Verbraucherschutz', 'html', 'https://www.bundestag.de/recht', null, 'html-scrape', 90, 'needs_review', 'manual', false, 16)
on conflict (id) do nothing;


-- 4) Quellenpaket (prepared, is_base=false, vollstaendig inaktiv)
insert into public.source_packages (id, key, name, purpose, status, is_base, political_level, geography_id, required_classes) values
  ('pkg-recht-verfassung-und-verbraucherschutz-bund', 'recht-verfassung-und-verbraucherschutz-bund', 'Recht, Verfassung und Verbraucherschutz (Bund)', 'Rechts-, verfassungs- und verbraucherpolitische Bundesebene: BMJV (Recht/Justiz/Gesetzgebung und Verbraucherpolitik), Bundesverfassungsgericht (Pressemitteilungen), BfDI (Datenschutz + Informationsfreiheit), Ausschuss fuer Recht und Verbraucherschutz sowie die wiederverwendeten Bundeswege DIP und Bundesregierung. Kompaktes Signal-Paket, kein Flaechenmonitoring. Struktur vorbereitet — Aktivierung freigabepflichtig.', 'prepared', false, 'bund', 'geo-bund', '{}')
on conflict (id) do nothing;


-- 5) Paket <-> Abrufweg (5 neue + 2 wiederverwendete: rp-dip, rp-bundesregierung)
--    Die wiederverwendeten Wege existieren bereits global und werden NUR verknuepft.
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-recht-verfassung-und-verbraucherschutz-bund', 'rp-bmjv-recht'),
  ('pkg-recht-verfassung-und-verbraucherschutz-bund', 'rp-bmjv-verbraucher'),
  ('pkg-recht-verfassung-und-verbraucherschutz-bund', 'rp-bverfg-presse'),
  ('pkg-recht-verfassung-und-verbraucherschutz-bund', 'rp-bfdi'),
  ('pkg-recht-verfassung-und-verbraucherschutz-bund', 'rp-ausschuss-recht-verbraucherschutz'),
  ('pkg-recht-verfassung-und-verbraucherschutz-bund', 'rp-dip'),
  ('pkg-recht-verfassung-und-verbraucherschutz-bund', 'rp-bundesregierung')
on conflict (package_id, retrieval_path_id) do nothing;


-- 6) Erwartete politische Ebene (bund) je NEUEM Abrufweg
insert into public.path_expected_levels (retrieval_path_id, level) values
  ('rp-bmjv-recht', 'bund'),
  ('rp-bmjv-verbraucher', 'bund'),
  ('rp-bverfg-presse', 'bund'),
  ('rp-bfdi', 'bund'),
  ('rp-ausschuss-recht-verbraucherschutz', 'bund')
on conflict (retrieval_path_id, level) do nothing;


-- 7) Erwartete Geografie (geo-bund) je NEUEM Abrufweg
insert into public.path_expected_geographies (retrieval_path_id, geography_id) values
  ('rp-bmjv-recht', 'geo-bund'),
  ('rp-bmjv-verbraucher', 'geo-bund'),
  ('rp-bverfg-presse', 'geo-bund'),
  ('rp-bfdi', 'geo-bund'),
  ('rp-ausschuss-recht-verbraucherschutz', 'geo-bund')
on conflict (retrieval_path_id, geography_id) do nothing;


-- 8) Erwartete Entitaet je NEUEM Abrufweg (verlinkt neue + wiederverwendete Entitaeten)
insert into public.path_expected_entities (retrieval_path_id, entity_id) values
  ('rp-bmjv-recht', 'ministry-bmjv'),
  ('rp-bmjv-verbraucher', 'ministry-bmjv'),
  ('rp-bverfg-presse', 'institution-bverfg'),
  ('rp-bfdi', 'authority-bfdi'),
  ('rp-ausschuss-recht-verbraucherschutz', 'committee-bt-recht')
on conflict (retrieval_path_id, entity_id) do nothing;


-- Integritaets-Selbstpruefung: 0 aktive neue Wege nach der Eintragung (erwartet: 0 Zeilen)
-- select id, status, activation_mode, is_critical from public.retrieval_paths
--   where id in ('rp-bmjv-recht', 'rp-bmjv-verbraucher', 'rp-bverfg-presse', 'rp-bfdi', 'rp-ausschuss-recht-verbraucherschutz')
--   and (status <> 'needs_review' or activation_mode <> 'manual' or is_critical <> false);

commit;
notify pgrst, 'reload schema';
