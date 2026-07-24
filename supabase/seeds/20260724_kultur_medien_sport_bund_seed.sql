-- Helmut — Bund-Fachpaket 'Kultur, Medien und Sport (Bund)' · PREPARED-Seed
-- (generiert, idempotent, NICHT-destruktiv). Generiert von
-- scripts/generate-kultur-medien-sport-seed.js. NICHT von Hand editieren.
-- Voraussetzung: 20260713_source_architecture(.sql) + Basis-Seed angewendet.
-- Paket status='prepared', is_base=false. ALLE neuen Abrufwege: status='needs_review',
-- activation_mode='manual' -> technisch INAKTIV. FREIGABEPFLICHTIG (kein Crawl/Deploy/Cron).
-- Wiederverwendet (nur referenziert, NICHT veraendert): rp-dip, rp-committee-kultur-medien,
-- rp-committee-sport, publisher-bundesregierung.de, publisher-destatis.de, statoffice-destatis.
begin;

-- 1) Politische Entitaeten (3 neu: BKM, Sport/Ehrenamt-Staatsministerin, NADA)
insert into public.political_entities (id, entity_type, name, canonical_key, level, geography_id, aliases) values
  ('ministry-bkm', 'ministry', 'Beauftragte der Bundesregierung für Kultur und Medien', null, 'bund', 'geo-bund', array['BKM', 'Kulturstaatsminister', 'Kulturstaatsministerin', 'Staatsminister für Kultur und Medien', 'Staatsministerin für Kultur und Medien', 'Beauftragter der Bundesregierung für Kultur und Medien']::text[]),
  ('government-sport-ehrenamt-bk', 'government', 'Staatsministerin für Sport und Ehrenamt beim Bundeskanzler', null, 'bund', 'geo-bund', array['Sport und Ehrenamt', 'Staatsministerin für Sport und Ehrenamt', 'Staatsminister für Sport und Ehrenamt', 'Beauftragte für Sport und Ehrenamt', 'Beauftragter für Sport und Ehrenamt']::text[]),
  ('institution-nada', 'other_institution', 'Nationale Anti-Doping-Agentur Deutschland', null, 'bund', 'geo-bund', array['NADA', 'NADA Deutschland', 'Nationale Anti Doping Agentur', 'Nationale Anti-Doping-Agentur']::text[])
on conflict (id) do nothing;


-- 2) Herausgeber (2 neu: kulturstaatsminister.de = BKM, nada.de = NADA)
insert into public.publishers (id, name, canonical_domain, publisher_type, evidence_role, trust, lifecycle_status, entity_id) values
  ('publisher-kulturstaatsminister.de', 'Beauftragte der Bundesregierung für Kultur und Medien', 'kulturstaatsminister.de', 'ministry', 'official_primary', 'hoch', 'active', 'ministry-bkm'),
  ('publisher-nada.de', 'Nationale Anti-Doping-Agentur Deutschland', 'nada.de', 'other_institution', 'official_primary', 'mittel', 'active', 'institution-nada')
on conflict (id) do nothing;


-- 3) Quellenpaket (1 neu, prepared, is_base=false)
insert into public.source_packages (id, key, name, purpose, status, is_base, political_level, geography_id, required_classes) values
  ('pkg-kultur-medien-und-sport-bund', 'kultur-medien-und-sport-bund', 'Kultur, Medien und Sport (Bund)', 'Bund-Fachpaket mit maximalem politischem Signalwert: BKM (Kultur/Erinnerung/Kulturgutschutz und Medien/Film getrennt), Sport und Ehrenamt beim Bundeskanzler (bestehender Bundesregierung-Publisher), Ausschuss fuer Kultur und Medien + Ausschuss fuer Sport (wiederverwendet), DIP (wiederverwendet), NADA (Anti-Doping-Berichte/WADA-Code) und Kulturfinanzbericht (Destatis, wiederverwendet). Struktur vorbereitet — Aktivierung ist ein eigener, freigabepflichtiger Schritt.', 'prepared', false, 'bund', 'geo-bund', '{}')
on conflict (id) do nothing;


-- 4) Abrufwege (5 neu) — INAKTIV: needs_review + manual, is_critical=false
insert into public.retrieval_paths (id, publisher_id, legacy_source_id, name, method, url, query, parser, priority, status, activation_mode, is_critical, max_items) values
  ('rp-bkm-kultur', 'publisher-kulturstaatsminister.de', null, 'BKM — Kultur / Erinnerung / Kulturgutschutz', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Akulturstaatsminister.de%20(Kultur%20OR%20Kulturf%C3%B6rderung%20OR%20Erinnerungskultur%20OR%20Kulturgutschutz%20OR%20Denkmalschutz%20OR%20Provenienz%20OR%20Gedenken)&hl=de&gl=DE&ceid=DE:de', 'site:kulturstaatsminister.de (Kultur OR Kulturförderung OR Erinnerungskultur OR Kulturgutschutz OR Denkmalschutz OR Provenienz OR Gedenken)', 'googlenews-batchexecute', 72, 'needs_review', 'manual', false, 16),
  ('rp-bkm-medien-film', 'publisher-kulturstaatsminister.de', null, 'BKM — Medien / Filmförderung / Mediengesetzgebung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Akulturstaatsminister.de%20(Film%20OR%20Filmf%C3%B6rderung%20OR%20Filmf%C3%B6rdergesetz%20OR%20Medien%20OR%20Medienpolitik%20OR%20Medieninvestitionsgesetz%20OR%20%22Deutsche%20Welle%22)&hl=de&gl=DE&ceid=DE:de', 'site:kulturstaatsminister.de (Film OR Filmförderung OR Filmfördergesetz OR Medien OR Medienpolitik OR Medieninvestitionsgesetz OR "Deutsche Welle")', 'googlenews-batchexecute', 72, 'needs_review', 'manual', false, 16),
  ('rp-sport-ehrenamt-bund', 'publisher-bundesregierung.de', null, 'Sport und Ehrenamt beim Bundeskanzler (Bundesregierung)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abundesregierung.de%20(Sportf%C3%B6rderung%20OR%20Spitzensport%20OR%20%22Sport%20und%20Ehrenamt%22%20OR%20Ehrenamt%20OR%20Sportf%C3%B6rdergesetz%20OR%20Anti-Doping)&hl=de&gl=DE&ceid=DE:de', 'site:bundesregierung.de (Sportförderung OR Spitzensport OR "Sport und Ehrenamt" OR Ehrenamt OR Sportfördergesetz OR Anti-Doping)', 'googlenews-batchexecute', 70, 'needs_review', 'manual', false, 16),
  ('rp-nada-antidoping', 'publisher-nada.de', null, 'NADA — Jahresberichte / WADA-Code / nationale Regeländerungen', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Anada.de%20(Jahresbericht%20OR%20WADA-Code%20OR%20%22NADA-Code%22%20OR%20Regel%C3%A4nderung%20OR%20Anti-Doping-Code)&hl=de&gl=DE&ceid=DE:de', 'site:nada.de (Jahresbericht OR WADA-Code OR "NADA-Code" OR Regeländerung OR Anti-Doping-Code)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16),
  ('rp-destatis-kulturfinanzbericht', 'publisher-destatis.de', null, 'Destatis — Kulturfinanzbericht', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Adestatis.de%20(Kulturfinanzbericht%20OR%20Kulturausgaben%20OR%20Kulturfinanzen)&hl=de&gl=DE&ceid=DE:de', 'site:destatis.de (Kulturfinanzbericht OR Kulturausgaben OR Kulturfinanzen)', 'googlenews-batchexecute', 55, 'needs_review', 'manual', false, 16)
on conflict (id) do nothing;


-- 5) Paket <-> Abrufweg (8: 5 neue + 3 wiederverwendete bestehende Wege)
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-kultur-medien-und-sport-bund', 'rp-bkm-kultur'),
  ('pkg-kultur-medien-und-sport-bund', 'rp-bkm-medien-film'),
  ('pkg-kultur-medien-und-sport-bund', 'rp-sport-ehrenamt-bund'),
  ('pkg-kultur-medien-und-sport-bund', 'rp-nada-antidoping'),
  ('pkg-kultur-medien-und-sport-bund', 'rp-destatis-kulturfinanzbericht'),
  ('pkg-kultur-medien-und-sport-bund', 'rp-dip'),
  ('pkg-kultur-medien-und-sport-bund', 'rp-committee-kultur-medien'),
  ('pkg-kultur-medien-und-sport-bund', 'rp-committee-sport')
on conflict (package_id, retrieval_path_id) do nothing;


-- 6) Erwartete politische Ebene (bund) je NEUEM Abrufweg
insert into public.path_expected_levels (retrieval_path_id, level) values
  ('rp-bkm-kultur', 'bund'),
  ('rp-bkm-medien-film', 'bund'),
  ('rp-sport-ehrenamt-bund', 'bund'),
  ('rp-nada-antidoping', 'bund'),
  ('rp-destatis-kulturfinanzbericht', 'bund')
on conflict (retrieval_path_id, level) do nothing;


-- 7) Erwartete Geografie (geo-bund) je NEUEM Abrufweg
insert into public.path_expected_geographies (retrieval_path_id, geography_id) values
  ('rp-bkm-kultur', 'geo-bund'),
  ('rp-bkm-medien-film', 'geo-bund'),
  ('rp-sport-ehrenamt-bund', 'geo-bund'),
  ('rp-nada-antidoping', 'geo-bund'),
  ('rp-destatis-kulturfinanzbericht', 'geo-bund')
on conflict (retrieval_path_id, geography_id) do nothing;


-- 8) Erwartete Themen je NEUEM Abrufweg (politischer Signalwert)
insert into public.path_expected_topics (retrieval_path_id, topic) values
  ('rp-bkm-kultur', 'kulturpolitik'),
  ('rp-bkm-kultur', 'kulturfoerderung'),
  ('rp-bkm-kultur', 'erinnerungskultur'),
  ('rp-bkm-kultur', 'kulturgutschutz'),
  ('rp-bkm-kultur', 'denkmalschutz'),
  ('rp-bkm-kultur', 'provenienz'),
  ('rp-bkm-medien-film', 'medienpolitik'),
  ('rp-bkm-medien-film', 'filmfoerderung'),
  ('rp-bkm-medien-film', 'filmfoerdergesetz'),
  ('rp-bkm-medien-film', 'medieninvestitionsgesetz'),
  ('rp-bkm-medien-film', 'deutsche-welle'),
  ('rp-bkm-medien-film', 'mediengesetzgebung'),
  ('rp-sport-ehrenamt-bund', 'sportfoerderung'),
  ('rp-sport-ehrenamt-bund', 'spitzensport'),
  ('rp-sport-ehrenamt-bund', 'ehrenamt'),
  ('rp-sport-ehrenamt-bund', 'sportpolitik'),
  ('rp-sport-ehrenamt-bund', 'anti-doping'),
  ('rp-nada-antidoping', 'anti-doping'),
  ('rp-nada-antidoping', 'wada-code'),
  ('rp-nada-antidoping', 'nada-jahresbericht'),
  ('rp-nada-antidoping', 'dopingbekaempfung'),
  ('rp-destatis-kulturfinanzbericht', 'kulturfinanzbericht'),
  ('rp-destatis-kulturfinanzbericht', 'kulturfinanzen'),
  ('rp-destatis-kulturfinanzbericht', 'kulturausgaben')
on conflict (retrieval_path_id, topic) do nothing;


-- 9) Erwartete Entitaet je NEUEM Abrufweg (Korrektur 1: Sport != BKM)
insert into public.path_expected_entities (retrieval_path_id, entity_id) values
  ('rp-bkm-kultur', 'ministry-bkm'),
  ('rp-bkm-medien-film', 'ministry-bkm'),
  ('rp-sport-ehrenamt-bund', 'government-sport-ehrenamt-bk'),
  ('rp-nada-antidoping', 'institution-nada'),
  ('rp-destatis-kulturfinanzbericht', 'statoffice-destatis')
on conflict (retrieval_path_id, entity_id) do nothing;


-- Integritaets-Selbstpruefung (erwartet: 0 Zeilen) — alle neuen Wege inaktiv:
-- select id, status, activation_mode from public.retrieval_paths
--   where id in ('rp-bkm-kultur', 'rp-bkm-medien-film', 'rp-sport-ehrenamt-bund', 'rp-nada-antidoping', 'rp-destatis-kulturfinanzbericht')
--   and (status <> 'needs_review' or activation_mode <> 'manual');

commit;
notify pgrst, 'reload schema';
