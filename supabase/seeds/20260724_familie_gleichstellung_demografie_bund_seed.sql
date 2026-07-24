-- Helmut — Paket `familie-gleichstellung-demografie-bund` · PREPARED-Seed (generiert, idempotent, NICHT-destruktiv).
-- Generiert von scripts/generate-familie-gleichstellung-demografie-bund-seed.js. NICHT von Hand editieren.
-- Voraussetzung: 20260713_source_architecture.sql + _seed.sql sind angewendet (Tabellen + Bestand: publisher-destatis.de, rp-dip, ministry-bmfsfj).
-- Paket: status='prepared', is_base=false, KEINE Profilzuordnung. ALLE neuen Abrufwege: status='needs_review', activation_mode='manual' -> technisch INAKTIV. FREIGABEPFLICHTIG.
begin;

-- 1) Politische Entitäten (nur NEUE: ADS + UBSKM; ministry-bmfsfj/statoffice-destatis werden wiederverwendet)
insert into public.political_entities (id, entity_type, name, canonical_key, level, geography_id, aliases) values
  ('authority-antidiskriminierungsstelle', 'authority', 'Antidiskriminierungsstelle des Bundes', 'antidiskriminierungsstelle', 'bund', 'geo-bund', array['ADS','Antidiskriminierungsstelle']::text[]),
  ('authority-ubskm', 'authority', 'Unabhängige Bundesbeauftragte gegen sexuellen Missbrauch von Kindern und Jugendlichen', 'ubskm', 'bund', 'geo-bund', array['UBSKM','Missbrauchsbeauftragte']::text[])
on conflict (id) do nothing;


-- 2) Herausgeber (nur NEUE: 3; publisher-destatis.de wird wiederverwendet, KEIN neuer Insert)
insert into public.publishers (id, name, canonical_domain, publisher_type, evidence_role, trust, lifecycle_status, entity_id) values
  ('publisher-bmbfsfj.bund.de', 'Bundesministerium für Bildung, Familie, Senioren, Frauen und Jugend', 'bmbfsfj.bund.de', 'ministry', 'official_primary', 'unbekannt', 'active', 'ministry-bmfsfj'),
  ('publisher-antidiskriminierungsstelle.de', 'Antidiskriminierungsstelle des Bundes', 'antidiskriminierungsstelle.de', 'authority', 'official_primary', 'unbekannt', 'active', 'authority-antidiskriminierungsstelle'),
  ('publisher-beauftragte-missbrauch.de', 'Unabhängige Bundesbeauftragte gegen sexuellen Missbrauch von Kindern und Jugendlichen', 'beauftragte-missbrauch.de', 'authority', 'official_primary', 'unbekannt', 'active', 'authority-ubskm')
on conflict (id) do nothing;


-- 3) Quellenpaket (status='prepared', is_base=false, ohne Profilzuordnung)
insert into public.source_packages (id, key, name, purpose, status, is_base, political_level, geography_id, required_classes) values
  ('pkg-familie-gleichstellung-demografie-bund', 'familie-gleichstellung-demografie-bund', 'Familie, Gleichstellung und Demografie Bund', 'Fachthemenpaket Familien-, Gleichstellungs-, Senioren-, Jugend- und Demografiepolitik des Bundes (Regierungsberichte gebündelt, amtliche Statistik, Antidiskriminierung, Kinderschutz). Fachthema, NICHT Region. Struktur vorbereitet — vollständig INAKTIV; Quellen vor Aktivierung byte-genau zu prüfen.', 'prepared', false, 'bund', 'geo-bund', '{}')
on conflict (id) do nothing;


-- 4) Abrufwege (nur NEUE: 6) — INAKTIV: needs_review + manual. (rp-dip wird wiederverwendet, KEIN neuer Insert)
insert into public.retrieval_paths (id, publisher_id, legacy_source_id, name, method, url, query, parser, priority, status, activation_mode, is_critical, max_items, represents_type) values
  ('rp-fgd-bmbfsfj-vorhaben', 'publisher-bmbfsfj.bund.de', 'fgd-bmbfsfj-vorhaben', 'BMBFSFJ — Politische Vorhaben, Gesetzgebung & zentrale Veröffentlichungen', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abmbfsfj.bund.de%20(Gesetzentwurf%20OR%20Reform%20OR%20Kabinett%20OR%20Strategie%20OR%20Familie%20OR%20Gleichstellung%20OR%20Jugend%20OR%20Senioren)&hl=de&gl=DE&ceid=DE:de', 'site:bmbfsfj.bund.de (Gesetzentwurf OR Reform OR Kabinett OR Strategie OR Familie OR Gleichstellung OR Jugend OR Senioren)', 'googlenews-batchexecute', 88, 'needs_review', 'manual', false, 16, null),
  ('rp-fgd-bmbfsfj-berichte', 'publisher-bmbfsfj.bund.de', 'fgd-bmbfsfj-berichte', 'BMBFSFJ — Berichte der Bundesregierung (Familien-, Kinder- und Jugend-, Gleichstellungs-, Altersbericht)', 'html', 'https://www.bmbfsfj.bund.de/bmbfsfj/ministerium/berichte-der-bundesregierung', null, 'html-scrape', 82, 'needs_review', 'manual', false, 16, null),
  ('rp-fgd-destatis-bevoelkerung-demografie', 'publisher-destatis.de', 'fgd-destatis-bevoelkerung-demografie', 'Destatis — Bevölkerung, Familien & Demografie', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Adestatis.de%20(Geburten%20OR%20Bev%C3%B6lkerung%20OR%20Bev%C3%B6lkerungsvorausberechnung%20OR%20Haushalte%20OR%20Familien%20OR%20Eheschlie%C3%9Fungen%20OR%20Sterbef%C3%A4lle%20OR%20Altersstruktur)&hl=de&gl=DE&ceid=DE:de', 'site:destatis.de (Geburten OR Bevölkerung OR Bevölkerungsvorausberechnung OR Haushalte OR Familien OR Eheschließungen OR Sterbefälle OR Altersstruktur)', 'googlenews-batchexecute', 84, 'needs_review', 'manual', false, 12, null),
  ('rp-fgd-destatis-gleichstellung', 'publisher-destatis.de', 'fgd-destatis-gleichstellung', 'Destatis — Gleichstellung & Erwerbsbeteiligung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Adestatis.de%20(%22Gender%20Pay%20Gap%22%20OR%20Gleichstellung%20OR%20Verdienstunterschied%20OR%20%22Erwerbst%C3%A4tigkeit%20von%20Frauen%22%20OR%20%22Gender%20Care%20Gap%22)&hl=de&gl=DE&ceid=DE:de', 'site:destatis.de ("Gender Pay Gap" OR Gleichstellung OR Verdienstunterschied OR "Erwerbstätigkeit von Frauen" OR "Gender Care Gap")', 'googlenews-batchexecute', 80, 'needs_review', 'manual', false, 12, null),
  ('rp-fgd-ads-jahresbericht', 'publisher-antidiskriminierungsstelle.de', 'fgd-ads-jahresbericht', 'Antidiskriminierungsstelle des Bundes — Jahresbericht & Publikationen', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Aantidiskriminierungsstelle.de%20(Jahresbericht%20OR%20Diskriminierung%20OR%20Stellungnahme%20OR%20AGG)&hl=de&gl=DE&ceid=DE:de', 'site:antidiskriminierungsstelle.de (Jahresbericht OR Diskriminierung OR Stellungnahme OR AGG)', 'googlenews-batchexecute', 74, 'needs_review', 'manual', false, 10, null),
  ('rp-fgd-ubskm-kinderschutz', 'publisher-beauftragte-missbrauch.de', 'fgd-ubskm-kinderschutz', 'UBSKM — Kinderschutz, Missbrauchsaufarbeitung & Monitoring', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abeauftragte-missbrauch.de%20(Kinderschutz%20OR%20Missbrauch%20OR%20Bericht%20OR%20Studie%20OR%20Aufarbeitung%20OR%20Pr%C3%A4vention)&hl=de&gl=DE&ceid=DE:de', 'site:beauftragte-missbrauch.de (Kinderschutz OR Missbrauch OR Bericht OR Studie OR Aufarbeitung OR Prävention)', 'googlenews-batchexecute', 76, 'needs_review', 'manual', false, 10, null)
on conflict (id) do nothing;


-- 5) Paket <-> Abrufweg (6 neue Wege + WIEDERVERWENDUNG von rp-dip als parlamentarischer Weg)
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-familie-gleichstellung-demografie-bund', 'rp-fgd-bmbfsfj-vorhaben'),
  ('pkg-familie-gleichstellung-demografie-bund', 'rp-fgd-bmbfsfj-berichte'),
  ('pkg-familie-gleichstellung-demografie-bund', 'rp-fgd-destatis-bevoelkerung-demografie'),
  ('pkg-familie-gleichstellung-demografie-bund', 'rp-fgd-destatis-gleichstellung'),
  ('pkg-familie-gleichstellung-demografie-bund', 'rp-fgd-ads-jahresbericht'),
  ('pkg-familie-gleichstellung-demografie-bund', 'rp-fgd-ubskm-kinderschutz'),
  ('pkg-familie-gleichstellung-demografie-bund', 'rp-dip')
on conflict (package_id, retrieval_path_id) do nothing;


-- 6) Erwartete politische Ebene (bund) je NEUEM Abrufweg
insert into public.path_expected_levels (retrieval_path_id, level) values
  ('rp-fgd-bmbfsfj-vorhaben', 'bund'),
  ('rp-fgd-bmbfsfj-berichte', 'bund'),
  ('rp-fgd-destatis-bevoelkerung-demografie', 'bund'),
  ('rp-fgd-destatis-gleichstellung', 'bund'),
  ('rp-fgd-ads-jahresbericht', 'bund'),
  ('rp-fgd-ubskm-kinderschutz', 'bund')
on conflict (retrieval_path_id, level) do nothing;


-- 7) Erwartete Themen je NEUEM Abrufweg (Abdeckungsmatrix)
insert into public.path_expected_topics (retrieval_path_id, topic) values
  ('rp-fgd-bmbfsfj-vorhaben', 'familie'),
  ('rp-fgd-bmbfsfj-vorhaben', 'gleichstellung'),
  ('rp-fgd-bmbfsfj-vorhaben', 'jugend'),
  ('rp-fgd-bmbfsfj-vorhaben', 'senioren'),
  ('rp-fgd-bmbfsfj-vorhaben', 'gesetzgebung'),
  ('rp-fgd-bmbfsfj-berichte', 'familienbericht'),
  ('rp-fgd-bmbfsfj-berichte', 'kinder-und-jugendbericht'),
  ('rp-fgd-bmbfsfj-berichte', 'gleichstellungsbericht'),
  ('rp-fgd-bmbfsfj-berichte', 'altersbericht'),
  ('rp-fgd-bmbfsfj-berichte', 'berichte-der-bundesregierung'),
  ('rp-fgd-destatis-bevoelkerung-demografie', 'bevoelkerung'),
  ('rp-fgd-destatis-bevoelkerung-demografie', 'demografie'),
  ('rp-fgd-destatis-bevoelkerung-demografie', 'familie'),
  ('rp-fgd-destatis-bevoelkerung-demografie', 'geburten'),
  ('rp-fgd-destatis-bevoelkerung-demografie', 'haushalte'),
  ('rp-fgd-destatis-gleichstellung', 'gleichstellung'),
  ('rp-fgd-destatis-gleichstellung', 'gender-pay-gap'),
  ('rp-fgd-destatis-gleichstellung', 'erwerbsbeteiligung'),
  ('rp-fgd-ads-jahresbericht', 'antidiskriminierung'),
  ('rp-fgd-ads-jahresbericht', 'gleichstellung'),
  ('rp-fgd-ads-jahresbericht', 'agg'),
  ('rp-fgd-ads-jahresbericht', 'jahresbericht'),
  ('rp-fgd-ubskm-kinderschutz', 'kinderschutz'),
  ('rp-fgd-ubskm-kinderschutz', 'missbrauch'),
  ('rp-fgd-ubskm-kinderschutz', 'aufarbeitung'),
  ('rp-fgd-ubskm-kinderschutz', 'praevention')
on conflict (retrieval_path_id, topic) do nothing;


-- Integritäts-Selbstprüfung: 0 aktive neue Wege nach der Eintragung. (erwartet: 0 Zeilen)
-- select id, status, activation_mode from public.retrieval_paths
--   where id in ('rp-fgd-bmbfsfj-vorhaben', 'rp-fgd-bmbfsfj-berichte', 'rp-fgd-destatis-bevoelkerung-demografie', 'rp-fgd-destatis-gleichstellung', 'rp-fgd-ads-jahresbericht', 'rp-fgd-ubskm-kinderschutz')
--   and (status <> 'needs_review' or activation_mode <> 'manual');
-- select id, status, is_base from public.source_packages where id = 'pkg-familie-gleichstellung-demografie-bund';  -- erwartet: prepared, false

commit;
notify pgrst, 'reload schema';
