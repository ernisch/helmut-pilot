-- Helmut — Quellenpaket energie-klima-umwelt-bund · PREPARED-Seed (generiert, idempotent, NICHT-destruktiv).
-- Generiert von scripts/generate-energie-klima-umwelt-seed.js. NICHT von Hand editieren.
-- Voraussetzung: 20260713_source_architecture.sql + 20260713_source_architecture_seed.sql sind
--   angewendet (Tabellen, geo-bund, publisher-destatis.de, statoffice-destatis vorhanden).
-- Paket: status='prepared'. Alle Abrufwege: status='needs_review', activation_mode='manual'
--   -> technisch INAKTIV. FREIGABEPFLICHTIG: NICHT automatisch auf Production anwenden.
-- Byte-genaue technische Verifikation steht AUS (Egress in der Vorbereitungsumgebung gesperrt)
--   und bleibt vor jeder Aktivierung zwingend.
begin;

-- 1) Quellenpaket (prepared, inaktiv)
insert into public.source_packages (id, key, name, purpose, status, is_base, political_level, geography_id, required_classes) values
  ('pkg-energie-klima-umwelt-bund', 'energie-klima-umwelt-bund', 'Energie, Klima & Umwelt (Bund)', 'Fachthemenpaket Energie-, Klima- und Umweltpolitik auf Bundesebene (Ressorts BMWE/BMUKN, Regulierung BNetzA, wissenschaftliche Umweltbehoerde UBA, unabhaengige Pruef-/Beratungs-gremien Expertenrat/SRU, gemeinsame ÜNB-Netzentwicklungsplanung, Energie-/Umweltstatistik Destatis, Foerderabwicklung BAFA). Fachthema, NICHT Region. Vorbereitet — Wege folgen nach byte-genauer Verifikation + Freigabe.', 'prepared', false, 'bund', 'geo-bund', '{}')
on conflict (id) do nothing;


-- 2) Politische Entitaeten (8 neu; statoffice-destatis wird wiederverwendet, NICHT eingefuegt)
insert into public.political_entities (id, entity_type, name, canonical_key, level, geography_id, aliases) values
  ('ministry-bmwe', 'ministry', 'Bundesministerium für Wirtschaft und Energie', 'bmwe', 'bund', 'geo-bund', array['BMWE', 'BMWK', 'BMWi', 'Bundeswirtschaftsministerium', 'Bundesministerium für Wirtschaft und Klimaschutz', 'Bundesministerium für Wirtschaft und Technologie', 'Bundesministerium für Wirtschaft und Energie']::text[]),
  ('ministry-bmukn', 'ministry', 'Bundesministerium für Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit', 'bmukn', 'bund', 'geo-bund', array['BMUKN', 'BMUV', 'BMU', 'Bundesumweltministerium', 'Bundesministerium für Umwelt, Naturschutz, nukleare Sicherheit und Verbraucherschutz', 'Bundesministerium für Umwelt, Naturschutz und nukleare Sicherheit', 'Bundesministerium für Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit']::text[]),
  ('authority-bnetza', 'authority', 'Bundesnetzagentur', 'bundesnetzagentur', 'bund', 'geo-bund', array['BNetzA', 'Bundesnetzagentur', 'Bundesnetzagentur für Elektrizität, Gas, Telekommunikation, Post und Eisenbahnen']::text[]),
  ('authority-umweltbundesamt', 'authority', 'Umweltbundesamt', 'umweltbundesamt', 'bund', 'geo-bund', array['UBA', 'Umweltbundesamt']::text[]),
  ('other_institution-expertenrat-klima', 'other_institution', 'Expertenrat für Klimafragen', 'expertenrat-klima', 'bund', 'geo-bund', array['Expertenrat für Klimafragen', 'ERK', 'Expertenrat Klima']::text[]),
  ('other_institution-sru', 'other_institution', 'Sachverständigenrat für Umweltfragen', 'sru', 'bund', 'geo-bund', array['SRU', 'Sachverständigenrat für Umweltfragen', 'Umweltrat']::text[]),
  ('other_institution-uenb-verbund', 'other_institution', 'Übertragungsnetzbetreiber (50Hertz, Amprion, TenneT, TransnetBW)', 'uenb', 'bund', 'geo-bund', array['ÜNB', 'Übertragungsnetzbetreiber', '50Hertz', 'Amprion', 'TenneT', 'TransnetBW', 'Netzentwicklungsplan Strom']::text[]),
  ('authority-bafa', 'authority', 'Bundesamt für Wirtschaft und Ausfuhrkontrolle', 'bafa', 'bund', 'geo-bund', array['BAFA', 'Bundesamt für Wirtschaft und Ausfuhrkontrolle']::text[])
on conflict (id) do nothing;


-- 3) Herausgeber (8 neu; publisher-destatis.de wird wiederverwendet, NICHT eingefuegt)
insert into public.publishers (id, name, canonical_domain, publisher_type, evidence_role, trust, lifecycle_status, entity_id) values
  ('publisher-bundeswirtschaftsministerium.de', 'Bundesministerium für Wirtschaft und Energie', 'bundeswirtschaftsministerium.de', 'ministry', 'official_primary', 'unbekannt', 'active', 'ministry-bmwe'),
  ('publisher-bundesumweltministerium.de', 'Bundesministerium für Umwelt, Klimaschutz, Naturschutz und nukleare Sicherheit', 'bundesumweltministerium.de', 'ministry', 'official_primary', 'unbekannt', 'active', 'ministry-bmukn'),
  ('publisher-bundesnetzagentur.de', 'Bundesnetzagentur', 'bundesnetzagentur.de', 'authority', 'official_primary', 'unbekannt', 'active', 'authority-bnetza'),
  ('publisher-umweltbundesamt.de', 'Umweltbundesamt', 'umweltbundesamt.de', 'authority', 'official_primary', 'unbekannt', 'active', 'authority-umweltbundesamt'),
  ('publisher-expertenrat-klima.de', 'Expertenrat für Klimafragen', 'expertenrat-klima.de', 'other_institution', 'official_primary', 'unbekannt', 'active', 'other_institution-expertenrat-klima'),
  ('publisher-umweltrat.de', 'Sachverständigenrat für Umweltfragen (SRU)', 'umweltrat.de', 'other_institution', 'official_primary', 'unbekannt', 'active', 'other_institution-sru'),
  ('publisher-netzentwicklungsplan.de', 'Übertragungsnetzbetreiber — Netzentwicklungsplan (gemeinsame Plattform)', 'netzentwicklungsplan.de', 'other_institution', 'direct_interest', 'unbekannt', 'active', 'other_institution-uenb-verbund'),
  ('publisher-bafa.de', 'Bundesamt für Wirtschaft und Ausfuhrkontrolle', 'bafa.de', 'authority', 'official_primary', 'unbekannt', 'active', 'authority-bafa')
on conflict (id) do nothing;


-- 4) Abrufwege (9) — INAKTIV: needs_review + manual
insert into public.retrieval_paths (id, publisher_id, legacy_source_id, name, method, url, query, parser, priority, status, activation_mode, is_critical, max_items, represents_type) values
  ('rp-bmwe', 'publisher-bundeswirtschaftsministerium.de', null, 'BMWE — Energie- und Wirtschaftspolitik', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abundeswirtschaftsministerium.de%20(Energiewende%20OR%20Energiepolitik%20OR%20Strommarkt%20OR%20Energiepreise%20OR%20Monitoring)&hl=de&gl=DE&ceid=DE:de', 'site:bundeswirtschaftsministerium.de (Energiewende OR Energiepolitik OR Strommarkt OR Energiepreise OR Monitoring)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16, 'ministry'),
  ('rp-bmukn', 'publisher-bundesumweltministerium.de', null, 'BMUKN — Klima-, Natur- und Umweltschutz', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abundesumweltministerium.de%20(Klimaschutz%20OR%20Naturschutz%20OR%20Kreislaufwirtschaft%20OR%20Klimaanpassung%20OR%20Umwelt)&hl=de&gl=DE&ceid=DE:de', 'site:bundesumweltministerium.de (Klimaschutz OR Naturschutz OR Kreislaufwirtschaft OR Klimaanpassung OR Umwelt)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16, 'ministry'),
  ('rp-bnetza-monitoring', 'publisher-bundesnetzagentur.de', null, 'Bundesnetzagentur — Monitoring, Netzausbau, Versorgungssicherheit', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abundesnetzagentur.de%20(Monitoringbericht%20OR%20Netzausbau%20OR%20Versorgungssicherheit%20OR%20Marktbeobachtung%20OR%20Netzentwicklung)&hl=de&gl=DE&ceid=DE:de', 'site:bundesnetzagentur.de (Monitoringbericht OR Netzausbau OR Versorgungssicherheit OR Marktbeobachtung OR Netzentwicklung)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16, 'authority'),
  ('rp-umweltbundesamt', 'publisher-umweltbundesamt.de', null, 'Umweltbundesamt — Emissionsdaten und Projektionen', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Aumweltbundesamt.de%20(Treibhausgas%20OR%20Emissionen%20OR%20Projektionsbericht%20OR%20Klimabilanz%20OR%20Luftqualit%C3%A4t)&hl=de&gl=DE&ceid=DE:de', 'site:umweltbundesamt.de (Treibhausgas OR Emissionen OR Projektionsbericht OR Klimabilanz OR Luftqualität)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16, 'authority'),
  ('rp-expertenrat-klima', 'publisher-expertenrat-klima.de', null, 'Expertenrat für Klimafragen — Prüfberichte und Gutachten', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Aexpertenrat-klima.de%20(Pr%C3%BCfbericht%20OR%20Gutachten%20OR%20Emissionsdaten%20OR%20Klimaziele%20OR%20Stellungnahme)&hl=de&gl=DE&ceid=DE:de', 'site:expertenrat-klima.de (Prüfbericht OR Gutachten OR Emissionsdaten OR Klimaziele OR Stellungnahme)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16, 'other_institution'),
  ('rp-sru-umweltgutachten', 'publisher-umweltrat.de', null, 'Sachverständigenrat für Umweltfragen — Umweltgutachten', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Aumweltrat.de%20(Umweltgutachten%20OR%20Sondergutachten%20OR%20Stellungnahme%20OR%20Kommentar)&hl=de&gl=DE&ceid=DE:de', 'site:umweltrat.de (Umweltgutachten OR Sondergutachten OR Stellungnahme OR Kommentar)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16, 'other_institution'),
  ('rp-uenb-netzentwicklungsplan', 'publisher-netzentwicklungsplan.de', null, 'Übertragungsnetzbetreiber — Netzentwicklungsplan (gebündelt)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Anetzentwicklungsplan.de%20(Netzentwicklungsplan%20OR%20Szenariorahmen%20OR%20Netzausbau%20OR%20%C3%9Cbertragungsnetz)&hl=de&gl=DE&ceid=DE:de', 'site:netzentwicklungsplan.de (Netzentwicklungsplan OR Szenariorahmen OR Netzausbau OR Übertragungsnetz)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16, 'other_institution'),
  ('rp-destatis-energie-umwelt', 'publisher-destatis.de', null, 'Destatis — Energie-, Umwelt- und Abfallstatistik', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Adestatis.de%20(Energie%20OR%20Umwelt%20OR%20Abfall%20OR%20Emissionen%20OR%20%22Umwelt%C3%B6konomische%20Gesamtrechnungen%22)&hl=de&gl=DE&ceid=DE:de', 'site:destatis.de (Energie OR Umwelt OR Abfall OR Emissionen OR "Umweltökonomische Gesamtrechnungen")', 'googlenews-batchexecute', 60, 'needs_review', 'manual', false, 16, 'statistical_office'),
  ('rp-bafa-foerderung', 'publisher-bafa.de', null, 'BAFA — Energie-Förderprogramme (BEG)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abafa.de%20(Bundesf%C3%B6rderung%20OR%20BEG%20OR%20Energieeffizienz%20OR%20F%C3%B6rderprogramm%20OR%20Heizungsf%C3%B6rderung)&hl=de&gl=DE&ceid=DE:de', 'site:bafa.de (Bundesförderung OR BEG OR Energieeffizienz OR Förderprogramm OR Heizungsförderung)', 'googlenews-batchexecute', 60, 'needs_review', 'manual', true, 16, 'authority')
on conflict (id) do nothing;


-- 5) Paket <-> Abrufweg (nur energie-klima-umwelt-bund)
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-energie-klima-umwelt-bund', 'rp-bmwe'),
  ('pkg-energie-klima-umwelt-bund', 'rp-bmukn'),
  ('pkg-energie-klima-umwelt-bund', 'rp-bnetza-monitoring'),
  ('pkg-energie-klima-umwelt-bund', 'rp-umweltbundesamt'),
  ('pkg-energie-klima-umwelt-bund', 'rp-expertenrat-klima'),
  ('pkg-energie-klima-umwelt-bund', 'rp-sru-umweltgutachten'),
  ('pkg-energie-klima-umwelt-bund', 'rp-uenb-netzentwicklungsplan'),
  ('pkg-energie-klima-umwelt-bund', 'rp-destatis-energie-umwelt'),
  ('pkg-energie-klima-umwelt-bund', 'rp-bafa-foerderung')
on conflict (package_id, retrieval_path_id) do nothing;


-- 6) Erwartete politische Ebene (bund) je Abrufweg
insert into public.path_expected_levels (retrieval_path_id, level) values
  ('rp-bmwe', 'bund'),
  ('rp-bmukn', 'bund'),
  ('rp-bnetza-monitoring', 'bund'),
  ('rp-umweltbundesamt', 'bund'),
  ('rp-expertenrat-klima', 'bund'),
  ('rp-sru-umweltgutachten', 'bund'),
  ('rp-uenb-netzentwicklungsplan', 'bund'),
  ('rp-destatis-energie-umwelt', 'bund'),
  ('rp-bafa-foerderung', 'bund')
on conflict (retrieval_path_id, level) do nothing;


-- 7) Erwartete Geografie (geo-bund) je Abrufweg
insert into public.path_expected_geographies (retrieval_path_id, geography_id) values
  ('rp-bmwe', 'geo-bund'),
  ('rp-bmukn', 'geo-bund'),
  ('rp-bnetza-monitoring', 'geo-bund'),
  ('rp-umweltbundesamt', 'geo-bund'),
  ('rp-expertenrat-klima', 'geo-bund'),
  ('rp-sru-umweltgutachten', 'geo-bund'),
  ('rp-uenb-netzentwicklungsplan', 'geo-bund'),
  ('rp-destatis-energie-umwelt', 'geo-bund'),
  ('rp-bafa-foerderung', 'geo-bund')
on conflict (retrieval_path_id, geography_id) do nothing;


-- Integritaets-Selbstpruefung (erwartet 0 Zeilen): kein Weg dieses Pakets aktiv.
-- select id, status, activation_mode from public.retrieval_paths
--   where id in ('rp-bmwe', 'rp-bmukn', 'rp-bnetza-monitoring', 'rp-umweltbundesamt', 'rp-expertenrat-klima', 'rp-sru-umweltgutachten', 'rp-uenb-netzentwicklungsplan', 'rp-destatis-energie-umwelt', 'rp-bafa-foerderung')
--   and (status <> 'needs_review' or activation_mode <> 'manual');
-- Selbstpruefung (erwartet 1 Zeile, status='prepared'):
--   select id, status from public.source_packages where id = 'pkg-energie-klima-umwelt-bund';

commit;
notify pgrst, 'reload schema';
