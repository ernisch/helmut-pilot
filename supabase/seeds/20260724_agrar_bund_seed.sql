-- Helmut — Quellenpaket 'landwirtschaft-ernaehrung-und-laendliche-raeume-bund' · PREPARED-Seed
-- (generiert, idempotent, NICHT-destruktiv). Generiert von scripts/generate-agrar-bund-seed.js.
-- NICHT von Hand editieren. Voraussetzung: 20260713_source_architecture.sql + Basis-Seed angewendet.
-- ALLE neuen Abrufwege: status='needs_review', activation_mode='manual' -> technisch INAKTIV.
-- Paket: status='prepared', is_base=false -> kein Profil-Mapping, kein aktiver Crawl-Plan. FREIGABEPFLICHTIG.
-- Wiederverwendet (KEIN Insert/Update): Destatis-Herausgeber, DIP- und Ausschuss-Abrufweg.
begin;

-- 1) Neue politische Entitaeten (Ministerium + 2 Bundesoberbehoerden; historische Namen nur als Alias)
insert into public.political_entities (id, entity_type, name, canonical_key, level, geography_id, aliases) values
  ('ministry-bmleh', 'ministry', 'Bundesministerium für Landwirtschaft, Ernährung und Heimat', null, 'bund', 'geo-bund', array['BMLEH','BMEL','Bundesministerium für Ernährung und Landwirtschaft']::text[]),
  ('authority-ble', 'authority', 'Bundesanstalt für Landwirtschaft und Ernährung', null, 'bund', 'geo-bund', array['BLE']::text[]),
  ('authority-bvl', 'authority', 'Bundesamt für Verbraucherschutz und Lebensmittelsicherheit', null, 'bund', 'geo-bund', array['BVL']::text[])
on conflict (id) do nothing;


-- 2) Neues Quellenpaket (prepared, is_base=false, ohne Pflichtklassen, ohne Profil-Mapping)
insert into public.source_packages (id, key, name, purpose, status, is_base, political_level, geography_id, required_classes) values
  ('pkg-landwirtschaft-ernaehrung-und-laendliche-raeume-bund', 'landwirtschaft-ernaehrung-und-laendliche-raeume-bund', 'Landwirtschaft, Ernährung und ländliche Räume (Bund)', 'Fachthemenpaket Bundes-Agrar-, Ernährungs- und Ländliche-Räume-Politik (BMLEH-Ressort): Gesetzgebung/Verordnungen, politische Veröffentlichungen, GAP-Agrarförderung, GAK und ländliche Räume, Agrarstatistik (Destatis), BLE-Publikationen, BVL-Monitoring, parlamentarische Vorgänge (DIP/Ausschuss). Fachthema Bund, NICHT Region. Struktur vorbereitet — Quellen technisch inaktiv bis Prüfung + Freigabe.', 'prepared', false, 'bund', 'geo-bund', '{}')
on conflict (id) do nothing;


-- 3) Neue Herausgeber (3) — Destatis wird NICHT neu angelegt (Bestand wiederverwendet)
insert into public.publishers (id, name, canonical_domain, publisher_type, evidence_role, trust, lifecycle_status, entity_id) values
  ('publisher-bmleh.de', 'Bundesministerium für Landwirtschaft, Ernährung und Heimat', 'bmleh.de', 'ministry', 'official_primary', 'hoch', 'active', 'ministry-bmleh'),
  ('publisher-ble.de', 'Bundesanstalt für Landwirtschaft und Ernährung', 'ble.de', 'authority', 'official_primary', 'hoch', 'active', 'authority-ble'),
  ('publisher-bvl.bund.de', 'Bundesamt für Verbraucherschutz und Lebensmittelsicherheit', 'bvl.bund.de', 'authority', 'official_primary', 'hoch', 'active', 'authority-bvl')
on conflict (id) do nothing;


-- 4) Neue Abrufwege (7) — INAKTIV: needs_review + manual (Destatis-Weg haengt am Bestands-Herausgeber)
insert into public.retrieval_paths (id, publisher_id, legacy_source_id, name, method, url, query, parser, priority, status, activation_mode, is_critical, max_items, represents_type) values
  ('rp-agrar-bmleh-gesetzgebung', 'publisher-bmleh.de', 'agrar-bmleh-gesetzgebung', 'BMLEH — Gesetzgebung und politische Vorhaben', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abmleh.de%20(Gesetzentwurf%20OR%20Referentenentwurf%20OR%20Verordnung%20OR%20Kabinett%20OR%20Eckpunkte%20OR%20Gesetz)&hl=de&gl=DE&ceid=DE:de', 'site:bmleh.de (Gesetzentwurf OR Referentenentwurf OR Verordnung OR Kabinett OR Eckpunkte OR Gesetz)', 'googlenews-batchexecute', 70, 'needs_review', 'manual', false, 16, 'ministry'),
  ('rp-agrar-bmleh-veroeffentlichungen', 'publisher-bmleh.de', 'agrar-bmleh-veroeffentlichungen', 'BMLEH — zentrale Veröffentlichungen und politische Entscheidungen', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abmleh.de%20(Pressemitteilung%20OR%20Strategie%20OR%20Bericht%20OR%20Tierschutz%20OR%20Tierhaltung%20OR%20Ern%C3%A4hrung%20OR%20Waldzustand)&hl=de&gl=DE&ceid=DE:de', 'site:bmleh.de (Pressemitteilung OR Strategie OR Bericht OR Tierschutz OR Tierhaltung OR Ernährung OR Waldzustand)', 'googlenews-batchexecute', 70, 'needs_review', 'manual', false, 16, 'ministry'),
  ('rp-agrar-bmleh-gap', 'publisher-bmleh.de', 'agrar-bmleh-gap', 'BMLEH — GAP und Agrarförderung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abmleh.de%20(GAP%20OR%20%22Gemeinsame%20Agrarpolitik%22%20OR%20GAP-Strategieplan%20OR%20Agrarf%C3%B6rderung%20OR%20Direktzahlungen%20OR%20%22%C3%96ko-Regelungen%22)&hl=de&gl=DE&ceid=DE:de', 'site:bmleh.de (GAP OR "Gemeinsame Agrarpolitik" OR GAP-Strategieplan OR Agrarförderung OR Direktzahlungen OR "Öko-Regelungen")', 'googlenews-batchexecute', 70, 'needs_review', 'manual', false, 16, 'ministry'),
  ('rp-agrar-bmleh-gak-laendliche-raeume', 'publisher-bmleh.de', 'agrar-bmleh-gak-laendliche-raeume', 'BMLEH — GAK und ländliche Räume', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abmleh.de%20(GAK%20OR%20%22l%C3%A4ndliche%20R%C3%A4ume%22%20OR%20Agrarstruktur%20OR%20K%C3%BCstenschutz%20OR%20Dorfentwicklung%20OR%20Regionalf%C3%B6rderung)&hl=de&gl=DE&ceid=DE:de', 'site:bmleh.de (GAK OR "ländliche Räume" OR Agrarstruktur OR Küstenschutz OR Dorfentwicklung OR Regionalförderung)', 'googlenews-batchexecute', 70, 'needs_review', 'manual', false, 16, 'ministry'),
  ('rp-agrar-destatis-agrarstatistik', 'publisher-destatis.de', 'agrar-destatis-agrarstatistik', 'Destatis — Agrarstatistiken (Betriebe, Flächen, Tierbestände, Ökolandbau, Forst, Fischerei)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Adestatis.de%20(Landwirtschaft%20OR%20Agrarstruktur%20OR%20%22landwirtschaftliche%20Betriebe%22%20OR%20Tierbest%C3%A4nde%20OR%20Fl%C3%A4chennutzung%20OR%20Ernte%20OR%20%22%C3%B6kologischer%20Landbau%22%20OR%20Forstwirtschaft%20OR%20Fischerei)&hl=de&gl=DE&ceid=DE:de', 'site:destatis.de (Landwirtschaft OR Agrarstruktur OR "landwirtschaftliche Betriebe" OR Tierbestände OR Flächennutzung OR Ernte OR "ökologischer Landbau" OR Forstwirtschaft OR Fischerei)', 'googlenews-batchexecute', 70, 'needs_review', 'manual', false, 16, null),
  ('rp-agrar-ble-publikationen', 'publisher-ble.de', 'agrar-ble-publikationen', 'BLE — Publikationen (Statistisches Jahrbuch, Versorgung, Ernte, Ökolandbau)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Able.de%20(Publikation%20OR%20Jahrbuch%20OR%20Versorgungsbilanz%20OR%20Ernte%20OR%20%C3%96kolandbau%20OR%20Marktbericht%20OR%20F%C3%B6rderung)&hl=de&gl=DE&ceid=DE:de', 'site:ble.de (Publikation OR Jahrbuch OR Versorgungsbilanz OR Ernte OR Ökolandbau OR Marktbericht OR Förderung)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16, 'authority'),
  ('rp-agrar-bvl-monitoring', 'publisher-bvl.bund.de', 'agrar-bvl-monitoring', 'BVL — Monitoring (Lebensmittel, Zoonosen, Antibiotika, Rückstände)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abvl.bund.de%20(Monitoring%20OR%20Zoonosen%20OR%20Antibiotika%20OR%20R%C3%BCckst%C3%A4nde%20OR%20Berichterstattung%20OR%20Lebensmittel)&hl=de&gl=DE&ceid=DE:de', 'site:bvl.bund.de (Monitoring OR Zoonosen OR Antibiotika OR Rückstände OR Berichterstattung OR Lebensmittel)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16, 'authority')
on conflict (id) do nothing;


-- 5) Paket <-> Abrufweg (9): 7 neue + 2 wiederverwendete Bestandswege (rp-dip, rp-committee-landwirtschaft)
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-landwirtschaft-ernaehrung-und-laendliche-raeume-bund', 'rp-agrar-bmleh-gesetzgebung'),
  ('pkg-landwirtschaft-ernaehrung-und-laendliche-raeume-bund', 'rp-agrar-bmleh-veroeffentlichungen'),
  ('pkg-landwirtschaft-ernaehrung-und-laendliche-raeume-bund', 'rp-agrar-bmleh-gap'),
  ('pkg-landwirtschaft-ernaehrung-und-laendliche-raeume-bund', 'rp-agrar-bmleh-gak-laendliche-raeume'),
  ('pkg-landwirtschaft-ernaehrung-und-laendliche-raeume-bund', 'rp-agrar-destatis-agrarstatistik'),
  ('pkg-landwirtschaft-ernaehrung-und-laendliche-raeume-bund', 'rp-agrar-ble-publikationen'),
  ('pkg-landwirtschaft-ernaehrung-und-laendliche-raeume-bund', 'rp-agrar-bvl-monitoring'),
  ('pkg-landwirtschaft-ernaehrung-und-laendliche-raeume-bund', 'rp-dip'),
  ('pkg-landwirtschaft-ernaehrung-und-laendliche-raeume-bund', 'rp-committee-landwirtschaft')
on conflict (package_id, retrieval_path_id) do nothing;


-- 6) Erwartete politische Ebene (bund) je NEUEM Abrufweg
insert into public.path_expected_levels (retrieval_path_id, level) values
  ('rp-agrar-bmleh-gesetzgebung', 'bund'),
  ('rp-agrar-bmleh-veroeffentlichungen', 'bund'),
  ('rp-agrar-bmleh-gap', 'bund'),
  ('rp-agrar-bmleh-gak-laendliche-raeume', 'bund'),
  ('rp-agrar-destatis-agrarstatistik', 'bund'),
  ('rp-agrar-ble-publikationen', 'bund'),
  ('rp-agrar-bvl-monitoring', 'bund')
on conflict (retrieval_path_id, level) do nothing;


-- 7) Erwartete Geografie (geo-bund) je NEUEM Abrufweg
insert into public.path_expected_geographies (retrieval_path_id, geography_id) values
  ('rp-agrar-bmleh-gesetzgebung', 'geo-bund'),
  ('rp-agrar-bmleh-veroeffentlichungen', 'geo-bund'),
  ('rp-agrar-bmleh-gap', 'geo-bund'),
  ('rp-agrar-bmleh-gak-laendliche-raeume', 'geo-bund'),
  ('rp-agrar-destatis-agrarstatistik', 'geo-bund'),
  ('rp-agrar-ble-publikationen', 'geo-bund'),
  ('rp-agrar-bvl-monitoring', 'geo-bund')
on conflict (retrieval_path_id, geography_id) do nothing;


-- 8) Erwartete Themen je NEUEM Abrufweg (Fachthemen-Kennzeichnung)
insert into public.path_expected_topics (retrieval_path_id, topic) values
  ('rp-agrar-bmleh-gesetzgebung', 'agrarpolitik'),
  ('rp-agrar-bmleh-gesetzgebung', 'gesetzgebung'),
  ('rp-agrar-bmleh-gesetzgebung', 'tierhaltung'),
  ('rp-agrar-bmleh-gesetzgebung', 'ernaehrungspolitik'),
  ('rp-agrar-bmleh-veroeffentlichungen', 'agrarpolitik'),
  ('rp-agrar-bmleh-veroeffentlichungen', 'tierschutz'),
  ('rp-agrar-bmleh-veroeffentlichungen', 'ernaehrungspolitik'),
  ('rp-agrar-bmleh-veroeffentlichungen', 'wald'),
  ('rp-agrar-bmleh-veroeffentlichungen', 'strategie'),
  ('rp-agrar-bmleh-gap', 'gap'),
  ('rp-agrar-bmleh-gap', 'agrarfoerderung'),
  ('rp-agrar-bmleh-gap', 'eu-agrarpolitik'),
  ('rp-agrar-bmleh-gap', 'direktzahlungen'),
  ('rp-agrar-bmleh-gak-laendliche-raeume', 'gak'),
  ('rp-agrar-bmleh-gak-laendliche-raeume', 'laendliche_raeume'),
  ('rp-agrar-bmleh-gak-laendliche-raeume', 'agrarstruktur'),
  ('rp-agrar-bmleh-gak-laendliche-raeume', 'kuestenschutz'),
  ('rp-agrar-destatis-agrarstatistik', 'agrarstatistik'),
  ('rp-agrar-destatis-agrarstatistik', 'landwirtschaft'),
  ('rp-agrar-destatis-agrarstatistik', 'tierbestaende'),
  ('rp-agrar-destatis-agrarstatistik', 'flaechennutzung'),
  ('rp-agrar-destatis-agrarstatistik', 'oekolandbau'),
  ('rp-agrar-ble-publikationen', 'agrarmarkt'),
  ('rp-agrar-ble-publikationen', 'ernaehrung'),
  ('rp-agrar-ble-publikationen', 'oekolandbau'),
  ('rp-agrar-ble-publikationen', 'laendliche_raeume'),
  ('rp-agrar-bvl-monitoring', 'lebensmittelsicherheit'),
  ('rp-agrar-bvl-monitoring', 'monitoring'),
  ('rp-agrar-bvl-monitoring', 'zoonosen'),
  ('rp-agrar-bvl-monitoring', 'antibiotika')
on conflict (retrieval_path_id, topic) do nothing;


-- Integritaets-Selbstpruefung: 0 aktive neue Wege nach der Eintragung (erwartet: 0 Zeilen)
-- select id, status, activation_mode from public.retrieval_paths
--   where id in ('rp-agrar-bmleh-gesetzgebung', 'rp-agrar-bmleh-veroeffentlichungen', 'rp-agrar-bmleh-gap', 'rp-agrar-bmleh-gak-laendliche-raeume', 'rp-agrar-destatis-agrarstatistik', 'rp-agrar-ble-publikationen', 'rp-agrar-bvl-monitoring')
--   and (status <> 'needs_review' or activation_mode <> 'manual');
-- Paketstatus muss 'prepared' sein (erwartet: 1 Zeile, status=prepared):
-- select status, is_base from public.source_packages where id = 'pkg-landwirtschaft-ernaehrung-und-laendliche-raeume-bund';

commit;
notify pgrst, 'reload schema';
