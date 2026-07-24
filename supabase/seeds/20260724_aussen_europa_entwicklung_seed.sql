-- Helmut — Fachthemenpaket `aussen-europa-und-entwicklung-bund` · PREPARED-Seed
-- (generiert, idempotent, NICHT-destruktiv). Generiert von
-- scripts/generate-aussen-europa-entwicklung-seed.js. NICHT von Hand editieren.
-- Voraussetzung: 20260713_source_architecture.sql + Basis-Seed sind angewendet
-- (Tabellen, geo-bund, ministry-auswaertiges-amt, rp-dip, rp-bundesregierung vorhanden).
-- Paket: status='prepared', is_base=false. ALLE neuen Abrufwege: status='needs_review',
-- activation_mode='manual' -> technisch INAKTIV. FREIGABEPFLICHTIG (kein Auto-Apply).
begin;

-- 1) Quellenpaket (neu, prepared, is_base=false) — Bestand wird NIE überschrieben
insert into public.source_packages (id, key, name, purpose, status, is_base, political_level, geography_id, required_classes) values
  ('pkg-aussen-europa-und-entwicklung-bund', 'aussen-europa-und-entwicklung-bund', 'Außen, Europa und Entwicklung (Bund)', 'Fachthemenpaket deutsche Außenpolitik, Europapolitik der Bundesregierung, europäische Gesetzgebung mit deutschem Handlungsbedarf, internationale Beziehungen/Diplomatie, Krisen/Konflikte, Sanktionen, internationale Abkommen, Entwicklungszusammenarbeit und humanitäre Hilfe. Bündelt AA, BMZ, EU-Kommission, Rat/Europäischer Rat und das Europäische Parlament (Legislative Observatory) und verwendet DIP + Bundesregierung wieder. Struktur vorbereitet — Quellen technisch inaktiv, Aktivierung nach Verifikation + Freigabe.', 'prepared', false, 'bund', 'geo-bund', '{}')
on conflict (id) do nothing;


-- 2) Politische Entitaeten (nur NEUE: BMZ + 4 EU-Institutionen). AA-Entity wird
--    wiederverwendet (ministry-auswaertiges-amt) und hier NICHT angelegt.
insert into public.political_entities (id, entity_type, name, canonical_key, level, geography_id, aliases) values
  ('ministry-bmz', 'ministry', 'Bundesministerium für wirtschaftliche Zusammenarbeit und Entwicklung', null, 'bund', 'geo-bund', array['BMZ','Entwicklungsministerium']::text[]),
  ('eu-commission', 'other_institution', 'Europäische Kommission', 'eu-kommission', 'eu', null, array['EU-Kommission','Europäische Kommission','European Commission','EC']::text[]),
  ('eu-council-of-the-eu', 'other_institution', 'Rat der Europäischen Union', 'rat-der-eu', 'eu', null, array['Rat der EU','Ministerrat','EU-Rat','Council of the European Union']::text[]),
  ('eu-european-council', 'other_institution', 'Europäischer Rat', 'europaeischer-rat', 'eu', null, array['European Council','EU-Gipfel','Europäischer Rat']::text[]),
  ('eu-parliament', 'other_institution', 'Europäisches Parlament', 'europaeisches-parlament', 'eu', null, array['Europaparlament','EU-Parlament','European Parliament','EP']::text[])
on conflict (id) do nothing;


-- 3) Herausgeber (5 neu). canonical_domain ist UNIQUE — alle Domains neu.
insert into public.publishers (id, name, canonical_domain, publisher_type, evidence_role, trust, lifecycle_status, entity_id) values
  ('publisher-auswaertiges-amt.de', 'Auswärtiges Amt', 'auswaertiges-amt.de', 'ministry', 'official_primary', 'hoch', 'active', 'ministry-auswaertiges-amt'),
  ('publisher-bmz.de', 'Bundesministerium für wirtschaftliche Zusammenarbeit und Entwicklung', 'bmz.de', 'ministry', 'official_primary', 'hoch', 'active', 'ministry-bmz'),
  ('publisher-commission.europa.eu', 'Europäische Kommission', 'commission.europa.eu', 'government', 'official_primary', 'hoch', 'active', 'eu-commission'),
  ('publisher-consilium.europa.eu', 'Rat der EU / Europäischer Rat', 'consilium.europa.eu', 'government', 'official_primary', 'hoch', 'active', 'eu-council-of-the-eu'),
  ('publisher-europarl.europa.eu', 'Europäisches Parlament', 'europarl.europa.eu', 'parliament', 'official_primary', 'hoch', 'active', 'eu-parliament')
on conflict (id) do nothing;


-- 4) Abrufwege (5 neu) — INAKTIV: needs_review + manual. DIP/Bundesregierung NICHT hier.
insert into public.retrieval_paths (id, publisher_id, legacy_source_id, name, method, url, query, parser, priority, status, activation_mode, is_critical, max_items) values
  ('rp-aa-newsroom', 'publisher-auswaertiges-amt.de', null, 'Auswärtiges Amt — Newsroom / Presse', 'html', 'https://www.auswaertiges-amt.de/de/newsroom/presse', null, 'html-scrape', 90, 'needs_review', 'manual', false, 16),
  ('rp-bmz-aktuelles', 'publisher-bmz.de', null, 'BMZ — Aktuelle Meldungen', 'html', 'https://www.bmz.de/de/aktuelles/aktuelle-meldungen', null, 'html-scrape', 88, 'needs_review', 'manual', false, 16),
  ('rp-eu-kommission', 'publisher-commission.europa.eu', null, 'Europäische Kommission — Press corner', 'html', 'https://ec.europa.eu/commission/presscorner/home/en', null, 'html-scrape', 82, 'needs_review', 'manual', false, 16),
  ('rp-eu-rat', 'publisher-consilium.europa.eu', null, 'Rat der EU + Europäischer Rat — Pressemitteilungen (gebündelt)', 'html', 'https://www.consilium.europa.eu/en/press/press-releases/', null, 'html-scrape', 82, 'needs_review', 'manual', false, 16),
  ('rp-eu-parlament-oeil', 'publisher-europarl.europa.eu', null, 'Europäisches Parlament — Legislative Observatory (OEIL)', 'html', 'https://oeil.secure.europarl.europa.eu/', null, 'html-scrape', 76, 'needs_review', 'manual', false, 16)
on conflict (id) do nothing;


-- 5) Paket <-> Abrufweg (7): 5 neue Wege + 2 WIEDERVERWENDETE (rp-dip, rp-bundesregierung).
--    Die Wiederverwendung ist eine reine Verknüpfung; beide Wege bleiben unverändert und
--    sind bereits always_on aktiv -> KEIN neuer Crawl durch diese Zuordnung.
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-aussen-europa-und-entwicklung-bund', 'rp-aa-newsroom'),
  ('pkg-aussen-europa-und-entwicklung-bund', 'rp-bmz-aktuelles'),
  ('pkg-aussen-europa-und-entwicklung-bund', 'rp-eu-kommission'),
  ('pkg-aussen-europa-und-entwicklung-bund', 'rp-eu-rat'),
  ('pkg-aussen-europa-und-entwicklung-bund', 'rp-eu-parlament-oeil'),
  ('pkg-aussen-europa-und-entwicklung-bund', 'rp-dip'),
  ('pkg-aussen-europa-und-entwicklung-bund', 'rp-bundesregierung')
on conflict (package_id, retrieval_path_id) do nothing;


-- 6) Erwartete politische Ebene je NEUEM Abrufweg (bund/international bzw. eu)
insert into public.path_expected_levels (retrieval_path_id, level) values
  ('rp-aa-newsroom', 'bund'),
  ('rp-aa-newsroom', 'international'),
  ('rp-bmz-aktuelles', 'bund'),
  ('rp-bmz-aktuelles', 'international'),
  ('rp-eu-kommission', 'eu'),
  ('rp-eu-rat', 'eu'),
  ('rp-eu-parlament-oeil', 'eu')
on conflict (retrieval_path_id, level) do nothing;


-- 7) Erwartete Geografie je NEUEM Abrufweg (deutscher Handlungsbezug: geo-bund)
insert into public.path_expected_geographies (retrieval_path_id, geography_id) values
  ('rp-aa-newsroom', 'geo-bund'),
  ('rp-bmz-aktuelles', 'geo-bund'),
  ('rp-eu-kommission', 'geo-bund'),
  ('rp-eu-rat', 'geo-bund'),
  ('rp-eu-parlament-oeil', 'geo-bund')
on conflict (retrieval_path_id, geography_id) do nothing;


-- 8) Erwartete Themen je NEUEM Abrufweg (Fachthema: außen/europa/entwicklung)
insert into public.path_expected_topics (retrieval_path_id, topic) values
  ('rp-aa-newsroom', 'aussenpolitik'),
  ('rp-aa-newsroom', 'diplomatie'),
  ('rp-aa-newsroom', 'internationale-beziehungen'),
  ('rp-aa-newsroom', 'krisen-und-konflikte'),
  ('rp-aa-newsroom', 'sanktionen'),
  ('rp-aa-newsroom', 'humanitaere-hilfe'),
  ('rp-aa-newsroom', 'internationale-abkommen'),
  ('rp-bmz-aktuelles', 'entwicklungspolitik'),
  ('rp-bmz-aktuelles', 'entwicklungszusammenarbeit'),
  ('rp-bmz-aktuelles', 'humanitaere-hilfe'),
  ('rp-bmz-aktuelles', 'internationale-organisationen'),
  ('rp-eu-kommission', 'europapolitik'),
  ('rp-eu-kommission', 'eu-gesetzgebung'),
  ('rp-eu-kommission', 'eu-aussenpolitik'),
  ('rp-eu-rat', 'europapolitik'),
  ('rp-eu-rat', 'eu-gesetzgebung'),
  ('rp-eu-rat', 'sanktionen'),
  ('rp-eu-rat', 'eu-aussenpolitik'),
  ('rp-eu-rat', 'gipfel-und-ratsschlussfolgerungen'),
  ('rp-eu-parlament-oeil', 'europapolitik'),
  ('rp-eu-parlament-oeil', 'eu-gesetzgebung')
on conflict (retrieval_path_id, topic) do nothing;


-- 9) Erwartete Entitaeten je NEUEM Abrufweg (inkl. Bündelung Rat + Europäischer Rat)
insert into public.path_expected_entities (retrieval_path_id, entity_id) values
  ('rp-aa-newsroom', 'ministry-auswaertiges-amt'),
  ('rp-bmz-aktuelles', 'ministry-bmz'),
  ('rp-eu-kommission', 'eu-commission'),
  ('rp-eu-rat', 'eu-council-of-the-eu'),
  ('rp-eu-rat', 'eu-european-council'),
  ('rp-eu-parlament-oeil', 'eu-parliament')
on conflict (retrieval_path_id, entity_id) do nothing;


-- Integritaets-Selbstpruefung: 0 aktive NEUE Wege nach der Eintragung (erwartet: 0 Zeilen).
-- select id, status, activation_mode from public.retrieval_paths
--   where id in ('rp-aa-newsroom', 'rp-bmz-aktuelles', 'rp-eu-kommission', 'rp-eu-rat', 'rp-eu-parlament-oeil')
--   and (status <> 'needs_review' or activation_mode <> 'manual');
-- Paketstatus-Pruefung (erwartet: prepared): select status from public.source_packages where id = 'pkg-aussen-europa-und-entwicklung-bund';

commit;
notify pgrst, 'reload schema';
