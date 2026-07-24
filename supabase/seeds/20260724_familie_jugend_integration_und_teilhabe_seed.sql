-- Helmut — Paket `familie-jugend-integration-und-teilhabe` · PREPARED-Seed (generiert, idempotent, NICHT-destruktiv).
-- Generiert von scripts/generate-familie-jugend-integration-und-teilhabe-seed.js. NICHT von Hand editieren.
-- Voraussetzung: 20260713_source_architecture.sql + _seed.sql sind angewendet (Tabellen + Bestand: publisher-destatis.de, rp-dip, ministry-bmfsfj).
-- Paket: status='prepared', is_base=false, KEINE Profilzuordnung. ALLE neuen Abrufwege: status='needs_review', activation_mode='manual' -> technisch INAKTIV. FREIGABEPFLICHTIG.
begin;

-- 1) Politische Entitäten (nur NEUE: ADS, UBSKM, Integrationsbeauftragte, Behindertenbeauftragter; ministry-bmfsfj/statoffice-destatis wiederverwendet)
insert into public.political_entities (id, entity_type, name, canonical_key, level, geography_id, aliases) values
  ('authority-antidiskriminierungsstelle', 'authority', 'Antidiskriminierungsstelle des Bundes', 'antidiskriminierungsstelle', 'bund', 'geo-bund', array['ADS','Antidiskriminierungsstelle']::text[]),
  ('authority-ubskm', 'authority', 'Unabhängige Bundesbeauftragte gegen sexuellen Missbrauch von Kindern und Jugendlichen', 'ubskm', 'bund', 'geo-bund', array['UBSKM','Missbrauchsbeauftragte']::text[]),
  ('authority-integrationsbeauftragte', 'authority', 'Beauftragte der Bundesregierung für Migration, Flüchtlinge und Integration', 'integrationsbeauftragte', 'bund', 'geo-bund', array['Integrationsbeauftragte','Beauftragte für Antirassismus']::text[]),
  ('authority-behindertenbeauftragter', 'authority', 'Beauftragter der Bundesregierung für die Belange von Menschen mit Behinderungen', 'behindertenbeauftragter', 'bund', 'geo-bund', array['Behindertenbeauftragter','Beauftragter für die Belange von Menschen mit Behinderungen']::text[])
on conflict (id) do nothing;


-- 2) Herausgeber (nur NEUE: 5; publisher-destatis.de wird wiederverwendet, KEIN neuer Insert)
insert into public.publishers (id, name, canonical_domain, publisher_type, evidence_role, trust, lifecycle_status, entity_id) values
  ('publisher-bmbfsfj.bund.de', 'Bundesministerium für Bildung, Familie, Senioren, Frauen und Jugend', 'bmbfsfj.bund.de', 'ministry', 'official_primary', 'unbekannt', 'active', 'ministry-bmfsfj'),
  ('publisher-antidiskriminierungsstelle.de', 'Antidiskriminierungsstelle des Bundes', 'antidiskriminierungsstelle.de', 'authority', 'official_primary', 'unbekannt', 'active', 'authority-antidiskriminierungsstelle'),
  ('publisher-beauftragte-missbrauch.de', 'Unabhängige Bundesbeauftragte gegen sexuellen Missbrauch von Kindern und Jugendlichen', 'beauftragte-missbrauch.de', 'authority', 'official_primary', 'unbekannt', 'active', 'authority-ubskm'),
  ('publisher-integrationsbeauftragte.de', 'Beauftragte der Bundesregierung für Migration, Flüchtlinge und Integration', 'integrationsbeauftragte.de', 'authority', 'official_primary', 'unbekannt', 'active', 'authority-integrationsbeauftragte'),
  ('publisher-behindertenbeauftragter.de', 'Beauftragter der Bundesregierung für die Belange von Menschen mit Behinderungen', 'behindertenbeauftragter.de', 'authority', 'official_primary', 'unbekannt', 'active', 'authority-behindertenbeauftragter')
on conflict (id) do nothing;


-- 3) Quellenpaket (status='prepared', is_base=false, ohne Profilzuordnung)
insert into public.source_packages (id, key, name, purpose, status, is_base, political_level, geography_id, required_classes) values
  ('pkg-familie-jugend-integration-und-teilhabe', 'familie-jugend-integration-und-teilhabe', 'Familie, Jugend, Integration und Teilhabe', 'Fachthemenpaket Familien-, Jugend-, Integrations- und Teilhabepolitik des Bundes (Regierungsberichte gebündelt, amtliche Statistik, Kinderschutz, Antidiskriminierung, Integration/Antirassismus, Teilhabe/Inklusion; Gleichstellung sekundär). Fachthema, NICHT Region. Struktur vorbereitet — vollständig INAKTIV; Quellen vor Aktivierung byte-genau zu prüfen.', 'prepared', false, 'bund', 'geo-bund', '{}')
on conflict (id) do nothing;


-- 4) Abrufwege (nur NEUE: 8) — INAKTIV: needs_review + manual. (rp-dip wird wiederverwendet, KEIN neuer Insert)
insert into public.retrieval_paths (id, publisher_id, legacy_source_id, name, method, url, query, parser, priority, status, activation_mode, is_critical, max_items, represents_type) values
  ('rp-fjit-bmbfsfj-vorhaben', 'publisher-bmbfsfj.bund.de', 'fjit-bmbfsfj-vorhaben', 'BMBFSFJ — Politische Vorhaben, Gesetzgebung & zentrale Veröffentlichungen', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abmbfsfj.bund.de%20(Gesetzentwurf%20OR%20Reform%20OR%20Kabinett%20OR%20Strategie%20OR%20Familie%20OR%20Kinder%20OR%20Jugend%20OR%20Senioren%20OR%20Gleichstellung)&hl=de&gl=DE&ceid=DE:de', 'site:bmbfsfj.bund.de (Gesetzentwurf OR Reform OR Kabinett OR Strategie OR Familie OR Kinder OR Jugend OR Senioren OR Gleichstellung)', 'googlenews-batchexecute', 88, 'needs_review', 'manual', false, 16, null),
  ('rp-fjit-bmbfsfj-berichte', 'publisher-bmbfsfj.bund.de', 'fjit-bmbfsfj-berichte', 'BMBFSFJ — Berichte der Bundesregierung (Familien-, Kinder- und Jugend-, Gleichstellungs-, Altersbericht)', 'html', 'https://www.bmbfsfj.bund.de/bmbfsfj/ministerium/berichte-der-bundesregierung', null, 'html-scrape', 82, 'needs_review', 'manual', false, 16, null),
  ('rp-fjit-destatis-bevoelkerung-familie', 'publisher-destatis.de', 'fjit-destatis-bevoelkerung-familie', 'Destatis — Bevölkerung, Familien & Migrationshintergrund', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Adestatis.de%20(Geburten%20OR%20Bev%C3%B6lkerung%20OR%20Bev%C3%B6lkerungsvorausberechnung%20OR%20Haushalte%20OR%20Familien%20OR%20Migrationshintergrund%20OR%20Altersstruktur)&hl=de&gl=DE&ceid=DE:de', 'site:destatis.de (Geburten OR Bevölkerung OR Bevölkerungsvorausberechnung OR Haushalte OR Familien OR Migrationshintergrund OR Altersstruktur)', 'googlenews-batchexecute', 84, 'needs_review', 'manual', false, 12, null),
  ('rp-fjit-destatis-gleichstellung', 'publisher-destatis.de', 'fjit-destatis-gleichstellung', 'Destatis — Gleichstellung & Erwerbsbeteiligung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Adestatis.de%20(%22Gender%20Pay%20Gap%22%20OR%20Gleichstellung%20OR%20Verdienstunterschied%20OR%20%22Erwerbst%C3%A4tigkeit%20von%20Frauen%22%20OR%20%22Gender%20Care%20Gap%22)&hl=de&gl=DE&ceid=DE:de', 'site:destatis.de ("Gender Pay Gap" OR Gleichstellung OR Verdienstunterschied OR "Erwerbstätigkeit von Frauen" OR "Gender Care Gap")', 'googlenews-batchexecute', 80, 'needs_review', 'manual', false, 12, null),
  ('rp-fjit-ads-antidiskriminierung', 'publisher-antidiskriminierungsstelle.de', 'fjit-ads-antidiskriminierung', 'Antidiskriminierungsstelle des Bundes — Jahresbericht & Publikationen', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Aantidiskriminierungsstelle.de%20(Jahresbericht%20OR%20Diskriminierung%20OR%20Stellungnahme%20OR%20AGG%20OR%20Teilhabe)&hl=de&gl=DE&ceid=DE:de', 'site:antidiskriminierungsstelle.de (Jahresbericht OR Diskriminierung OR Stellungnahme OR AGG OR Teilhabe)', 'googlenews-batchexecute', 74, 'needs_review', 'manual', false, 10, null),
  ('rp-fjit-ubskm-kinderschutz', 'publisher-beauftragte-missbrauch.de', 'fjit-ubskm-kinderschutz', 'UBSKM — Kinderschutz, Missbrauchsaufarbeitung & Monitoring', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abeauftragte-missbrauch.de%20(Kinderschutz%20OR%20Missbrauch%20OR%20Bericht%20OR%20Studie%20OR%20Aufarbeitung%20OR%20Pr%C3%A4vention)&hl=de&gl=DE&ceid=DE:de', 'site:beauftragte-missbrauch.de (Kinderschutz OR Missbrauch OR Bericht OR Studie OR Aufarbeitung OR Prävention)', 'googlenews-batchexecute', 76, 'needs_review', 'manual', false, 10, null),
  ('rp-fjit-integration', 'publisher-integrationsbeauftragte.de', 'fjit-integration', 'Integrationsbeauftragte der Bundesregierung — Integration, Teilhabe & Antirassismus', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Aintegrationsbeauftragte.de%20(Integration%20OR%20Teilhabe%20OR%20Antirassismus%20OR%20Einb%C3%BCrgerung%20OR%20Migration%20OR%20Bericht)&hl=de&gl=DE&ceid=DE:de', 'site:integrationsbeauftragte.de (Integration OR Teilhabe OR Antirassismus OR Einbürgerung OR Migration OR Bericht)', 'googlenews-batchexecute', 78, 'needs_review', 'manual', false, 12, null),
  ('rp-fjit-teilhabe', 'publisher-behindertenbeauftragter.de', 'fjit-teilhabe', 'Beauftragter der Bundesregierung für die Belange von Menschen mit Behinderungen — Teilhabe & Inklusion', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abehindertenbeauftragter.de%20(Teilhabe%20OR%20Inklusion%20OR%20Barrierefreiheit%20OR%20Behinderung%20OR%20%22UN-BRK%22%20OR%20Bericht)&hl=de&gl=DE&ceid=DE:de', 'site:behindertenbeauftragter.de (Teilhabe OR Inklusion OR Barrierefreiheit OR Behinderung OR "UN-BRK" OR Bericht)', 'googlenews-batchexecute', 76, 'needs_review', 'manual', false, 12, null)
on conflict (id) do nothing;


-- 5) Paket <-> Abrufweg (8 neue Wege + WIEDERVERWENDUNG von rp-dip als parlamentarischer Weg)
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-familie-jugend-integration-und-teilhabe', 'rp-fjit-bmbfsfj-vorhaben'),
  ('pkg-familie-jugend-integration-und-teilhabe', 'rp-fjit-bmbfsfj-berichte'),
  ('pkg-familie-jugend-integration-und-teilhabe', 'rp-fjit-destatis-bevoelkerung-familie'),
  ('pkg-familie-jugend-integration-und-teilhabe', 'rp-fjit-destatis-gleichstellung'),
  ('pkg-familie-jugend-integration-und-teilhabe', 'rp-fjit-ads-antidiskriminierung'),
  ('pkg-familie-jugend-integration-und-teilhabe', 'rp-fjit-ubskm-kinderschutz'),
  ('pkg-familie-jugend-integration-und-teilhabe', 'rp-fjit-integration'),
  ('pkg-familie-jugend-integration-und-teilhabe', 'rp-fjit-teilhabe'),
  ('pkg-familie-jugend-integration-und-teilhabe', 'rp-dip')
on conflict (package_id, retrieval_path_id) do nothing;


-- 6) Erwartete politische Ebene (bund) je NEUEM Abrufweg
insert into public.path_expected_levels (retrieval_path_id, level) values
  ('rp-fjit-bmbfsfj-vorhaben', 'bund'),
  ('rp-fjit-bmbfsfj-berichte', 'bund'),
  ('rp-fjit-destatis-bevoelkerung-familie', 'bund'),
  ('rp-fjit-destatis-gleichstellung', 'bund'),
  ('rp-fjit-ads-antidiskriminierung', 'bund'),
  ('rp-fjit-ubskm-kinderschutz', 'bund'),
  ('rp-fjit-integration', 'bund'),
  ('rp-fjit-teilhabe', 'bund')
on conflict (retrieval_path_id, level) do nothing;


-- 7) Erwartete Themen je NEUEM Abrufweg (Abdeckungsmatrix)
insert into public.path_expected_topics (retrieval_path_id, topic) values
  ('rp-fjit-bmbfsfj-vorhaben', 'familie'),
  ('rp-fjit-bmbfsfj-vorhaben', 'jugend'),
  ('rp-fjit-bmbfsfj-vorhaben', 'kinder'),
  ('rp-fjit-bmbfsfj-vorhaben', 'senioren'),
  ('rp-fjit-bmbfsfj-vorhaben', 'gleichstellung'),
  ('rp-fjit-bmbfsfj-vorhaben', 'gesetzgebung'),
  ('rp-fjit-bmbfsfj-berichte', 'familienbericht'),
  ('rp-fjit-bmbfsfj-berichte', 'kinder-und-jugendbericht'),
  ('rp-fjit-bmbfsfj-berichte', 'gleichstellungsbericht'),
  ('rp-fjit-bmbfsfj-berichte', 'altersbericht'),
  ('rp-fjit-bmbfsfj-berichte', 'berichte-der-bundesregierung'),
  ('rp-fjit-destatis-bevoelkerung-familie', 'bevoelkerung'),
  ('rp-fjit-destatis-bevoelkerung-familie', 'familie'),
  ('rp-fjit-destatis-bevoelkerung-familie', 'demografie'),
  ('rp-fjit-destatis-bevoelkerung-familie', 'migrationshintergrund'),
  ('rp-fjit-destatis-bevoelkerung-familie', 'haushalte'),
  ('rp-fjit-destatis-gleichstellung', 'gleichstellung'),
  ('rp-fjit-destatis-gleichstellung', 'gender-pay-gap'),
  ('rp-fjit-destatis-gleichstellung', 'erwerbsbeteiligung'),
  ('rp-fjit-ads-antidiskriminierung', 'antidiskriminierung'),
  ('rp-fjit-ads-antidiskriminierung', 'integration'),
  ('rp-fjit-ads-antidiskriminierung', 'teilhabe'),
  ('rp-fjit-ads-antidiskriminierung', 'gleichstellung'),
  ('rp-fjit-ads-antidiskriminierung', 'agg'),
  ('rp-fjit-ads-antidiskriminierung', 'jahresbericht'),
  ('rp-fjit-ubskm-kinderschutz', 'kinderschutz'),
  ('rp-fjit-ubskm-kinderschutz', 'jugend'),
  ('rp-fjit-ubskm-kinderschutz', 'missbrauch'),
  ('rp-fjit-ubskm-kinderschutz', 'aufarbeitung'),
  ('rp-fjit-ubskm-kinderschutz', 'praevention'),
  ('rp-fjit-integration', 'integration'),
  ('rp-fjit-integration', 'teilhabe'),
  ('rp-fjit-integration', 'antirassismus'),
  ('rp-fjit-integration', 'migration'),
  ('rp-fjit-integration', 'einbuergerung'),
  ('rp-fjit-teilhabe', 'teilhabe'),
  ('rp-fjit-teilhabe', 'inklusion'),
  ('rp-fjit-teilhabe', 'barrierefreiheit'),
  ('rp-fjit-teilhabe', 'behinderung'),
  ('rp-fjit-teilhabe', 'un-brk')
on conflict (retrieval_path_id, topic) do nothing;


-- Integritäts-Selbstprüfung: 0 aktive neue Wege nach der Eintragung. (erwartet: 0 Zeilen)
-- select id, status, activation_mode from public.retrieval_paths
--   where id in ('rp-fjit-bmbfsfj-vorhaben', 'rp-fjit-bmbfsfj-berichte', 'rp-fjit-destatis-bevoelkerung-familie', 'rp-fjit-destatis-gleichstellung', 'rp-fjit-ads-antidiskriminierung', 'rp-fjit-ubskm-kinderschutz', 'rp-fjit-integration', 'rp-fjit-teilhabe')
--   and (status <> 'needs_review' or activation_mode <> 'manual');
-- select id, status, is_base from public.source_packages where id = 'pkg-familie-jugend-integration-und-teilhabe';  -- erwartet: prepared, false

commit;
notify pgrst, 'reload schema';
