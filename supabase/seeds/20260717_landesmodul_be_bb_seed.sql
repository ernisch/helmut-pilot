-- Helmut — Landesmodule Berlin/Brandenburg · PREPARED-Seed (generiert, idempotent, NICHT-destruktiv).
-- Generiert von scripts/generate-landesmodul-seed.js. NICHT von Hand editieren.
-- Voraussetzung: 20260713_source_architecture.sql ist angewendet (Tabellen + Basis-Seed vorhanden).
-- ALLE Abrufwege: status='needs_review', activation_mode='manual' -> technisch INAKTIV. FREIGABEPFLICHTIG.
begin;

-- 1) Politische Entitaeten (nur neue Landesverbaende/Fraktion/Person)
insert into public.political_entities (id, entity_type, name, canonical_key, level, geography_id) values
  ('group-agh-linke', 'parliamentary_group', 'Linksfraktion Berlin (Abgeordnetenhaus)', 'linke', 'land', 'geo-land-berlin'),
  ('party-linke-berlin', 'party', 'Die Linke Berlin', 'linke', 'land', 'geo-land-berlin'),
  ('party-linke-brandenburg', 'party', 'Die Linke Brandenburg', 'linke', 'land', 'geo-land-brandenburg'),
  ('person-tobias-schulze', 'person', 'Tobias Schulze', 'tobias-schulze', 'land', 'geo-land-berlin')
on conflict (id) do nothing;


-- 2) Herausgeber
insert into public.publishers (id, name, canonical_domain, publisher_type, evidence_role, trust, lifecycle_status, entity_id) values
  ('publisher-berlin.de', 'Land Berlin — Landespressedienst', 'berlin.de', 'government', 'official_primary', 'unbekannt', 'active', 'government-berlin-senat'),
  ('publisher-brandenburg.de', 'Ministerien Brandenburg', 'brandenburg.de', 'ministry', 'official_primary', 'unbekannt', 'active', null),
  ('publisher-dielinke-brandenburg.de', 'Die Linke Brandenburg', 'dielinke-brandenburg.de', 'party', 'direct_interest', 'unbekannt', 'active', 'party-linke-brandenburg'),
  ('publisher-dielinke.berlin', 'Die Linke Berlin', 'dielinke.berlin', 'party', 'direct_interest', 'unbekannt', 'active', 'party-linke-berlin'),
  ('publisher-landesregierung-brandenburg.de', 'Landesregierung Brandenburg', 'landesregierung-brandenburg.de', 'government', 'official_primary', 'unbekannt', 'active', 'government-brandenburg'),
  ('publisher-landtag.brandenburg.de', 'Landtag Brandenburg', 'landtag.brandenburg.de', 'parliament', 'official_primary', 'unbekannt', 'active', 'parliament-brandenburg-landtag'),
  ('publisher-linksfraktion.berlin', 'Linksfraktion Berlin (Abgeordnetenhaus)', 'linksfraktion.berlin', 'parliamentary_group', 'direct_interest', 'unbekannt', 'active', 'group-agh-linke'),
  ('publisher-maz-online.de', 'Märkische Allgemeine / Lausitzer Rundschau', 'maz-online.de', 'media', 'journalistic', 'unbekannt', 'active', null),
  ('publisher-parlament-berlin.de', 'Abgeordnetenhaus von Berlin', 'parlament-berlin.de', 'parliament', 'official_primary', 'unbekannt', 'active', 'parliament-berlin-agh'),
  ('publisher-parlamentsdokumentation.brandenburg.de', 'Landtag Brandenburg — Parlamentsdokumentation (parldok)', 'parlamentsdokumentation.brandenburg.de', 'parliament', 'official_primary', 'unbekannt', 'active', 'parliament-brandenburg-landtag'),
  ('publisher-rbb24.de', 'rbb24 (Rundfunk Berlin-Brandenburg)', 'rbb24.de', 'media', 'journalistic', 'unbekannt', 'active', null),
  ('publisher-stk.brandenburg.de', 'Staatskanzlei Brandenburg', 'stk.brandenburg.de', 'government', 'official_primary', 'unbekannt', 'active', 'government-brandenburg'),
  ('publisher-tagesspiegel.de', 'Der Tagesspiegel', 'tagesspiegel.de', 'media', 'journalistic', 'unbekannt', 'active', null),
  ('publisher-tobiasschulze.berlin', 'Tobias Schulze (MdA, Die Linke)', 'tobiasschulze.berlin', 'person', 'direct_interest', 'unbekannt', 'active', 'person-tobias-schulze')
on conflict (id) do nothing;


-- 3) Abrufwege — INAKTIV: needs_review + manual (technisch kein Runtime-Effekt)
insert into public.retrieval_paths (id, publisher_id, legacy_source_id, name, method, url, query, parser, priority, status, activation_mode, is_critical, max_items) values
  ('rp-bb-ausschuesse', 'publisher-landtag.brandenburg.de', 'bb-ausschuesse', 'Landtag Brandenburg — ausschuesse', 'googlenews_search', 'https://news.google.com/rss/search?q=Landtag%20Brandenburg%20Ausschuss&hl=de&gl=DE&ceid=DE:de', 'https://news.google.com/rss/search?q=Landtag%20Brandenburg%20Ausschuss&hl=de&gl=DE&ceid=DE:de', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16),
  ('rp-bb-landesfraktionen', 'publisher-landtag.brandenburg.de', 'bb-landesfraktionen', 'Landtagsfraktionen (SPD/AfD/CDU/BSW) — landesfraktionen', 'googlenews_search', 'https://news.google.com/rss/search?q=Landtag%20Brandenburg%20Fraktion&hl=de&gl=DE&ceid=DE:de', 'https://news.google.com/rss/search?q=Landtag%20Brandenburg%20Fraktion&hl=de&gl=DE&ceid=DE:de', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16),
  ('rp-bb-landesparlament', 'publisher-landtag.brandenburg.de', 'bb-landesparlament', 'Landtag Brandenburg — landesparlament', 'googlenews_search', 'https://news.google.com/rss/search?q=site:landtag.brandenburg.de&hl=de&gl=DE&ceid=DE:de', 'https://news.google.com/rss/search?q=site:landtag.brandenburg.de&hl=de&gl=DE&ceid=DE:de', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16),
  ('rp-bb-landesregierung', 'publisher-landesregierung-brandenburg.de', 'bb-landesregierung', 'Landesregierung Brandenburg — landesregierung', 'googlenews_search', 'https://news.google.com/rss/search?q=Landesregierung%20Brandenburg&hl=de&gl=DE&ceid=DE:de', 'https://news.google.com/rss/search?q=Landesregierung%20Brandenburg&hl=de&gl=DE&ceid=DE:de', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16),
  ('rp-bb-ministerien', 'publisher-brandenburg.de', 'bb-ministerien', 'Ministerien Brandenburg (MIL/MWFK/MIK/…) — ministerien', 'googlenews_search', 'https://news.google.com/rss/search?q=Ministerium%20Brandenburg&hl=de&gl=DE&ceid=DE:de', 'https://news.google.com/rss/search?q=Ministerium%20Brandenburg&hl=de&gl=DE&ceid=DE:de', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16),
  ('rp-bb-partei_pilot', 'publisher-dielinke-brandenburg.de', 'bb-partei_pilot', 'Die Linke Brandenburg — partei_pilot', 'rss', 'https://www.dielinke-brandenburg.de/nc/politik/aktuell/feed.rss', null, 'rss-regex', 60, 'needs_review', 'manual', false, 16),
  ('rp-bb-plenum', 'publisher-parlamentsdokumentation.brandenburg.de', 'bb-plenum', 'Landtag Brandenburg (parldok) — plenum', 'structured_download', 'https://www.parlamentsdokumentation.brandenburg.de/opendata/exportWP8.xml', null, 'pardok-xml', 60, 'needs_review', 'manual', true, 16),
  ('rp-bb-regionale_leitmedien', 'publisher-maz-online.de', 'bb-regionale_leitmedien', 'Märkische Allgemeine (MAZ) / Lausitzer Rundschau — regionale_leitmedien', 'googlenews_search', 'https://news.google.com/rss/search?q=site:maz-online.de', 'https://news.google.com/rss/search?q=site:maz-online.de', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16),
  ('rp-be-fraktion_pilot', 'publisher-linksfraktion.berlin', 'be-fraktion_pilot', 'Linksfraktion Berlin (Abgeordnetenhaus) — fraktion_pilot', 'rss', 'https://www.linksfraktion.berlin/aktuelles/presse/feed.rss', null, 'rss-regex', 60, 'needs_review', 'manual', false, 16),
  ('rp-be-landesfraktionen', 'publisher-parlament-berlin.de', 'be-landesfraktionen', 'Fraktionen im Abgeordnetenhaus (CDU/SPD/Grüne/Linke/AfD) — landesfraktionen', 'googlenews_search', 'https://news.google.com/rss/search?q=%22Abgeordnetenhaus%20Berlin%22%20Fraktion&hl=de&gl=DE&ceid=DE:de', 'https://news.google.com/rss/search?q=%22Abgeordnetenhaus%20Berlin%22%20Fraktion&hl=de&gl=DE&ceid=DE:de', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16),
  ('rp-be-landesparlament', 'publisher-parlament-berlin.de', 'be-landesparlament', 'Abgeordnetenhaus von Berlin — landesparlament', 'googlenews_search', 'https://news.google.com/rss/search?q=site:parlament-berlin.de&hl=de&gl=DE&ceid=DE:de', 'https://news.google.com/rss/search?q=site:parlament-berlin.de&hl=de&gl=DE&ceid=DE:de', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16),
  ('rp-be-landesregierung', 'publisher-berlin.de', 'be-landesregierung', 'Land Berlin — Landespressedienst — landesregierung', 'googlenews_search', 'https://news.google.com/rss/search?q=Senat%20Berlin%20site:berlin.de&hl=de&gl=DE&ceid=DE:de', 'https://news.google.com/rss/search?q=Senat%20Berlin%20site:berlin.de&hl=de&gl=DE&ceid=DE:de', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16),
  ('rp-be-partei_pilot', 'publisher-dielinke.berlin', 'be-partei_pilot', 'Die Linke Berlin — partei_pilot', 'rss', 'https://www.dielinke.berlin/presse/feed.rss', null, 'rss-regex', 60, 'needs_review', 'manual', false, 16),
  ('rp-be-person_pilot', 'publisher-tobiasschulze.berlin', 'be-person_pilot', 'Tobias Schulze (MdA, Die Linke, Fraktionsvors.) — person_pilot', 'googlenews_search', 'https://news.google.com/rss/search?q=%22Tobias%20Schulze%22%20Berlin', 'https://news.google.com/rss/search?q=%22Tobias%20Schulze%22%20Berlin', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16),
  ('rp-be-plenum', 'publisher-parlament-berlin.de', 'be-plenum', 'Abgeordnetenhaus von Berlin (PARDOK) — plenum', 'structured_download', 'https://www.parlament-berlin.de/opendata/pardok-wp19.xml', null, 'pardok-xml', 60, 'needs_review', 'manual', true, 16),
  ('rp-be-regionale_leitmedien', 'publisher-tagesspiegel.de', 'be-regionale_leitmedien', 'Tagesspiegel — regionale_leitmedien', 'rss', 'https://www.tagesspiegel.de/contentexport/feed/berlin', null, 'rss-regex', 60, 'needs_review', 'manual', false, 16),
  ('rp-be-staatskanzlei', 'publisher-berlin.de', 'be-staatskanzlei', 'Senatskanzlei / Reg. Bürgermeister — staatskanzlei', 'googlenews_search', 'https://news.google.com/rss/search?q=Regierender%20B%C3%BCrgermeister%20Berlin%20Senatskanzlei&hl=de&gl=DE&ceid=DE:de', 'https://news.google.com/rss/search?q=Regierender%20B%C3%BCrgermeister%20Berlin%20Senatskanzlei&hl=de&gl=DE&ceid=DE:de', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16),
  ('rp-rbb24-politik', 'publisher-rbb24.de', 'rbb24-politik', 'rbb24 (Rundfunk Berlin-Brandenburg) — oer_landesberichterstattung', 'rss', 'https://www.rbb24.de/politik/index.xml/feed=rss.xml', null, 'rss-regex', 60, 'needs_review', 'manual', false, 16)
on conflict (id) do nothing;


-- 4) Paket <-> Abrufweg (nur berlin-basis / brandenburg-basis)
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-berlin-basis', 'rp-be-fraktion_pilot'),
  ('pkg-berlin-basis', 'rp-be-landesfraktionen'),
  ('pkg-berlin-basis', 'rp-be-landesparlament'),
  ('pkg-berlin-basis', 'rp-be-landesregierung'),
  ('pkg-berlin-basis', 'rp-be-partei_pilot'),
  ('pkg-berlin-basis', 'rp-be-person_pilot'),
  ('pkg-berlin-basis', 'rp-be-plenum'),
  ('pkg-berlin-basis', 'rp-be-regionale_leitmedien'),
  ('pkg-berlin-basis', 'rp-be-staatskanzlei'),
  ('pkg-berlin-basis', 'rp-rbb24-politik'),
  ('pkg-brandenburg-basis', 'rp-bb-ausschuesse'),
  ('pkg-brandenburg-basis', 'rp-bb-landesfraktionen'),
  ('pkg-brandenburg-basis', 'rp-bb-landesparlament'),
  ('pkg-brandenburg-basis', 'rp-bb-landesregierung'),
  ('pkg-brandenburg-basis', 'rp-bb-ministerien'),
  ('pkg-brandenburg-basis', 'rp-bb-partei_pilot'),
  ('pkg-brandenburg-basis', 'rp-bb-plenum'),
  ('pkg-brandenburg-basis', 'rp-bb-regionale_leitmedien'),
  ('pkg-brandenburg-basis', 'rp-rbb24-politik')
on conflict (package_id, retrieval_path_id) do nothing;


-- 5) Erwartete politische Ebene (land) je Abrufweg
insert into public.path_expected_levels (retrieval_path_id, level) values
  ('rp-bb-ausschuesse', 'land'),
  ('rp-bb-landesfraktionen', 'land'),
  ('rp-bb-landesparlament', 'land'),
  ('rp-bb-landesregierung', 'land'),
  ('rp-bb-ministerien', 'land'),
  ('rp-bb-partei_pilot', 'land'),
  ('rp-bb-plenum', 'land'),
  ('rp-bb-regionale_leitmedien', 'land'),
  ('rp-be-fraktion_pilot', 'land'),
  ('rp-be-landesfraktionen', 'land'),
  ('rp-be-landesparlament', 'land'),
  ('rp-be-landesregierung', 'land'),
  ('rp-be-partei_pilot', 'land'),
  ('rp-be-person_pilot', 'land'),
  ('rp-be-plenum', 'land'),
  ('rp-be-regionale_leitmedien', 'land'),
  ('rp-be-staatskanzlei', 'land'),
  ('rp-rbb24-politik', 'land')
on conflict (retrieval_path_id, level) do nothing;


-- 6) Erwartete Geografie je Abrufweg
insert into public.path_expected_geographies (retrieval_path_id, geography_id) values
  ('rp-bb-ausschuesse', 'geo-land-brandenburg'),
  ('rp-bb-landesfraktionen', 'geo-land-brandenburg'),
  ('rp-bb-landesparlament', 'geo-land-brandenburg'),
  ('rp-bb-landesregierung', 'geo-land-brandenburg'),
  ('rp-bb-ministerien', 'geo-land-brandenburg'),
  ('rp-bb-partei_pilot', 'geo-land-brandenburg'),
  ('rp-bb-plenum', 'geo-land-brandenburg'),
  ('rp-bb-regionale_leitmedien', 'geo-land-brandenburg'),
  ('rp-be-fraktion_pilot', 'geo-land-berlin'),
  ('rp-be-landesfraktionen', 'geo-land-berlin'),
  ('rp-be-landesparlament', 'geo-land-berlin'),
  ('rp-be-landesregierung', 'geo-land-berlin'),
  ('rp-be-partei_pilot', 'geo-land-berlin'),
  ('rp-be-person_pilot', 'geo-land-berlin'),
  ('rp-be-plenum', 'geo-land-berlin'),
  ('rp-be-regionale_leitmedien', 'geo-land-berlin'),
  ('rp-be-staatskanzlei', 'geo-land-berlin'),
  ('rp-rbb24-politik', 'geo-land-berlin')
on conflict (retrieval_path_id, geography_id) do nothing;


-- Integritaets-Selbstpruefung: 0 aktive BE/BB-Wege nach der Eintragung.
-- (erwartet: 0 Zeilen)
-- select id, status, activation_mode from public.retrieval_paths
--   where id in ('rp-be-landesparlament', 'rp-be-plenum', 'rp-be-landesregierung', 'rp-be-staatskanzlei', 'rp-be-landesfraktionen', 'rp-be-regionale_leitmedien', 'rp-rbb24-politik', 'rp-be-partei_pilot', 'rp-be-fraktion_pilot', 'rp-be-person_pilot', 'rp-bb-landesparlament', 'rp-bb-plenum', 'rp-bb-ausschuesse', 'rp-bb-landesregierung', 'rp-bb-ministerien', 'rp-bb-landesfraktionen', 'rp-bb-regionale_leitmedien', 'rp-bb-partei_pilot')
--   and (status <> 'needs_review' or activation_mode <> 'manual');

commit;
notify pgrst, 'reload schema';
