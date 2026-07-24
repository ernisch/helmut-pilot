-- Helmut — Themenpaket 'verkehr-infrastruktur-bund' · PREPARED-Seed (generiert, idempotent, NICHT-destruktiv).
-- Generiert von scripts/generate-verkehr-infrastruktur-seed.js. NICHT von Hand editieren.
-- Voraussetzung: 20260713_source_architecture.sql + _seed.sql sind angewendet (Tabellen + Basis-Seed vorhanden).
-- Paket status='prepared'; ALLE neuen Abrufwege status='needs_review', activation_mode='manual' -> technisch INAKTIV. FREIGABEPFLICHTIG.
-- Bestehende Herausgeber/Entitaeten/Wege werden NUR referenziert (ON CONFLICT DO NOTHING); keine Bestandsquelle wird veraendert.
begin;

-- 1) Neue politische Entitaeten (18) — nur NICHT bereits vorhandene
insert into public.political_entities (id, entity_type, name, canonical_key, level, geography_id, aliases) values
  ('ministry-bmv', 'ministry', 'Bundesministerium für Verkehr', 'verkehr', 'bund', 'geo-bund', array['BMV','BMDV','BMVI','Bundesministerium für Digitales und Verkehr','Verkehrsministerium']::text[]),
  ('company-db-infrago', 'other_institution', 'DB InfraGO AG', 'db-infrago', 'bund', 'geo-bund', array['DB InfraGO','InfraGO','DB Netz','DB Station&Service']::text[]),
  ('company-autobahn-gmbh', 'other_institution', 'Autobahn GmbH des Bundes', 'autobahn-gmbh', 'bund', 'geo-bund', array['Die Autobahn','Autobahn GmbH']::text[]),
  ('authority-eba', 'authority', 'Eisenbahn-Bundesamt', 'eba', 'bund', 'geo-bund', array['EBA']::text[]),
  ('authority-bast', 'authority', 'Bundesanstalt für Straßenwesen', 'bast', 'bund', 'geo-bund', array['BASt']::text[]),
  ('authority-baw', 'authority', 'Bundesanstalt für Wasserbau', 'baw', 'bund', 'geo-bund', array['BAW']::text[]),
  ('authority-gdws', 'authority', 'Generaldirektion Wasserstraßen und Schifffahrt', 'gdws', 'bund', 'geo-bund', array['GDWS','WSV','Wasserstraßen- und Schifffahrtsverwaltung des Bundes']::text[]),
  ('authority-bfu', 'authority', 'Bundesstelle für Flugunfalluntersuchung', 'bfu', 'bund', 'geo-bund', array['BFU']::text[]),
  ('authority-dzsf', 'authority', 'Deutsches Zentrum für Schienenverkehrsforschung', 'dzsf', 'bund', 'geo-bund', array['DZSF']::text[]),
  ('authority-kba', 'authority', 'Kraftfahrt-Bundesamt', 'kba', 'bund', 'geo-bund', array['KBA']::text[]),
  ('authority-uba', 'authority', 'Umweltbundesamt', 'uba', 'bund', 'geo-bund', array['UBA']::text[]),
  ('authority-balm', 'authority', 'Bundesamt für Logistik und Mobilität', 'balm', 'bund', 'geo-bund', array['BALM','BAG','Bundesamt für Güterverkehr']::text[]),
  ('institute-dlr-vf', 'other_institution', 'DLR — Institut für Verkehrsforschung', 'dlr-verkehrsforschung', 'bund', 'geo-bund', array['DLR','Deutsches Zentrum für Luft- und Raumfahrt']::text[]),
  ('institute-diw', 'other_institution', 'DIW Berlin', 'diw', 'bund', 'geo-bund', array['DIW','Deutsches Institut für Wirtschaftsforschung']::text[]),
  ('association-vdv', 'association', 'Verband Deutscher Verkehrsunternehmen', 'vdv', 'bund', 'geo-bund', array['VDV']::text[]),
  ('association-allianz-pro-schiene', 'association', 'Allianz pro Schiene', 'allianz-pro-schiene', 'bund', 'geo-bund', array['Allianz pro Schiene']::text[]),
  ('association-adac', 'association', 'ADAC', 'adac', 'bund', 'geo-bund', array['ADAC','Allgemeiner Deutscher Automobil-Club']::text[]),
  ('association-staedtetag', 'association', 'Deutscher Städtetag', 'staedtetag', 'bund', 'geo-bund', array['Deutscher Städtetag']::text[])
on conflict (id) do nothing;


-- 2) Neue Herausgeber (19) — bestehende (Destatis/BDI/Google News) werden referenziert, NICHT dupliziert
insert into public.publishers (id, name, canonical_domain, publisher_type, evidence_role, trust, lifecycle_status, entity_id) values
  ('publisher-bmv.de', 'Bundesministerium für Verkehr', 'bmv.de', 'ministry', 'official_primary', 'unbekannt', 'active', 'ministry-bmv'),
  ('publisher-mobilitaet-in-deutschland.de', 'Mobilität in Deutschland (BMV/DLR)', 'mobilitaet-in-deutschland.de', 'ministry', 'official_primary', 'unbekannt', 'active', 'ministry-bmv'),
  ('publisher-deutschebahn.com', 'DB InfraGO AG', 'deutschebahn.com', 'company', 'direct_interest', 'unbekannt', 'active', 'company-db-infrago'),
  ('publisher-eba.bund.de', 'Eisenbahn-Bundesamt', 'eba.bund.de', 'authority', 'official_primary', 'unbekannt', 'active', 'authority-eba'),
  ('publisher-dzsf.bund.de', 'Deutsches Zentrum für Schienenverkehrsforschung', 'dzsf.bund.de', 'authority', 'data_source', 'unbekannt', 'active', 'authority-dzsf'),
  ('publisher-autobahn.de', 'Autobahn GmbH des Bundes', 'autobahn.de', 'company', 'direct_interest', 'unbekannt', 'active', 'company-autobahn-gmbh'),
  ('publisher-bast.de', 'Bundesanstalt für Straßenwesen', 'bast.de', 'authority', 'data_source', 'unbekannt', 'active', 'authority-bast'),
  ('publisher-gdws.wsv.bund.de', 'Generaldirektion Wasserstraßen und Schifffahrt', 'gdws.wsv.bund.de', 'authority', 'official_primary', 'unbekannt', 'active', 'authority-gdws'),
  ('publisher-baw.de', 'Bundesanstalt für Wasserbau', 'baw.de', 'authority', 'data_source', 'unbekannt', 'active', 'authority-baw'),
  ('publisher-bfu-web.de', 'Bundesstelle für Flugunfalluntersuchung', 'bfu-web.de', 'authority', 'official_primary', 'unbekannt', 'active', 'authority-bfu'),
  ('publisher-kba.de', 'Kraftfahrt-Bundesamt', 'kba.de', 'authority', 'data_source', 'unbekannt', 'active', 'authority-kba'),
  ('publisher-umweltbundesamt.de', 'Umweltbundesamt', 'umweltbundesamt.de', 'authority', 'data_source', 'unbekannt', 'active', 'authority-uba'),
  ('publisher-balm.bund.de', 'Bundesamt für Logistik und Mobilität', 'balm.bund.de', 'authority', 'data_source', 'unbekannt', 'active', 'authority-balm'),
  ('publisher-dlr.de', 'DLR — Institut für Verkehrsforschung', 'dlr.de', 'research_institute', 'data_source', 'unbekannt', 'active', 'institute-dlr-vf'),
  ('publisher-diw.de', 'DIW Berlin', 'diw.de', 'research_institute', 'data_source', 'unbekannt', 'active', 'institute-diw'),
  ('publisher-vdv.de', 'Verband Deutscher Verkehrsunternehmen', 'vdv.de', 'association', 'direct_interest', 'unbekannt', 'active', 'association-vdv'),
  ('publisher-allianz-pro-schiene.de', 'Allianz pro Schiene', 'allianz-pro-schiene.de', 'association', 'direct_interest', 'unbekannt', 'active', 'association-allianz-pro-schiene'),
  ('publisher-adac.de', 'ADAC', 'adac.de', 'association', 'direct_interest', 'unbekannt', 'active', 'association-adac'),
  ('publisher-staedtetag.de', 'Deutscher Städtetag', 'staedtetag.de', 'association', 'direct_interest', 'unbekannt', 'active', 'association-staedtetag')
on conflict (id) do nothing;


-- 3) Quellenpaket (status='prepared' -> INAKTIV)
insert into public.source_packages (id, key, name, purpose, status, is_base, political_level, geography_id, required_classes) values
  ('pkg-verkehr-infrastruktur-bund', 'verkehr-infrastruktur-bund', 'Verkehr & Infrastruktur (Bund)', 'Politikfeldpaket Verkehr & Infrastruktur auf Bundesebene (Ministerium, nachgeordnete Behoerden, Bundesunternehmen, Sicherheits-/Aufsichts- und Forschungsstellen, Statistik, Verbaende). Fachthema, NICHT Region. Struktur vorbereitet — Quellen folgen nach byte-genauer Verifikation + Freigabe.', 'prepared', false, 'bund', 'geo-bund', array['strategische_planung','schieneninfrastruktur','strasseninfrastruktur','wasserstrassen','luftverkehr_sicherheit','verkehrssicherheit','statistik','klima_umwelt','parlament','wissenschaft','verbaende']::text[])
on conflict (id) do nothing;


-- 4) Abrufwege (23) — INAKTIV: needs_review + manual
insert into public.retrieval_paths (id, publisher_id, legacy_source_id, name, method, url, query, parser, expected_frequency, priority, status, activation_mode, is_critical, max_items, represents_type) values
  ('rp-vib-bmv-presse', 'publisher-bmv.de', 'vib-bmv-presse', 'Bundesministerium für Verkehr — strategische_planung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abmv.de&hl=de&gl=DE&ceid=DE:de', 'site:bmv.de', 'googlenews-batchexecute', 'daily', 60, 'needs_review', 'manual', true, 16, 'strategische_planung'),
  ('rp-vib-bvwp', 'publisher-bmv.de', 'vib-bvwp', 'Bundesministerium für Verkehr — strategische_planung', 'googlenews_search', 'https://news.google.com/rss/search?q=Bundesverkehrswegeplan&hl=de&gl=DE&ceid=DE:de', 'Bundesverkehrswegeplan', 'googlenews-batchexecute', 'multi_year', 60, 'needs_review', 'manual', true, 16, 'strategische_planung'),
  ('rp-vib-irp', 'publisher-bmv.de', 'vib-irp', 'Bundesministerium für Verkehr — strategische_planung', 'googlenews_search', 'https://news.google.com/rss/search?q=Investitionsrahmenplan%20Verkehr&hl=de&gl=DE&ceid=DE:de', 'Investitionsrahmenplan Verkehr', 'googlenews-batchexecute', 'multi_year', 60, 'needs_review', 'manual', true, 16, 'strategische_planung'),
  ('rp-vib-mid', 'publisher-mobilitaet-in-deutschland.de', 'vib-mid', 'Mobilität in Deutschland (BMV/DLR) — statistik', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Amobilitaet-in-deutschland.de&hl=de&gl=DE&ceid=DE:de', 'site:mobilitaet-in-deutschland.de', 'googlenews-batchexecute', 'multi_year', 60, 'needs_review', 'manual', true, 16, 'statistik'),
  ('rp-vib-db-infrago', 'publisher-deutschebahn.com', 'vib-db-infrago', 'DB InfraGO AG — schieneninfrastruktur', 'googlenews_search', 'https://news.google.com/rss/search?q=DB%20InfraGO%20Infrastruktur%20Schienennetz&hl=de&gl=DE&ceid=DE:de', 'DB InfraGO Infrastruktur Schienennetz', 'googlenews-batchexecute', 'monthly', 60, 'needs_review', 'manual', false, 16, 'schieneninfrastruktur'),
  ('rp-vib-eba', 'publisher-eba.bund.de', 'vib-eba', 'Eisenbahn-Bundesamt — verkehrssicherheit', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Aeba.bund.de&hl=de&gl=DE&ceid=DE:de', 'site:eba.bund.de', 'googlenews-batchexecute', 'monthly', 60, 'needs_review', 'manual', true, 16, 'verkehrssicherheit'),
  ('rp-vib-dzsf', 'publisher-dzsf.bund.de', 'vib-dzsf', 'Deutsches Zentrum für Schienenverkehrsforschung — wissenschaft', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Adzsf.bund.de&hl=de&gl=DE&ceid=DE:de', 'site:dzsf.bund.de', 'googlenews-batchexecute', 'monthly', 60, 'needs_review', 'manual', false, 16, 'wissenschaft'),
  ('rp-vib-autobahn', 'publisher-autobahn.de', 'vib-autobahn', 'Autobahn GmbH des Bundes — strasseninfrastruktur', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Aautobahn.de&hl=de&gl=DE&ceid=DE:de', 'site:autobahn.de', 'googlenews-batchexecute', 'daily', 60, 'needs_review', 'manual', false, 16, 'strasseninfrastruktur'),
  ('rp-vib-bast', 'publisher-bast.de', 'vib-bast', 'Bundesanstalt für Straßenwesen — verkehrssicherheit', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abast.de&hl=de&gl=DE&ceid=DE:de', 'site:bast.de', 'googlenews-batchexecute', 'monthly', 60, 'needs_review', 'manual', false, 16, 'verkehrssicherheit'),
  ('rp-vib-gdws', 'publisher-gdws.wsv.bund.de', 'vib-gdws', 'Generaldirektion Wasserstraßen und Schifffahrt — wasserstrassen', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Agdws.wsv.bund.de&hl=de&gl=DE&ceid=DE:de', 'site:gdws.wsv.bund.de', 'googlenews-batchexecute', 'monthly', 60, 'needs_review', 'manual', true, 16, 'wasserstrassen'),
  ('rp-vib-baw', 'publisher-baw.de', 'vib-baw', 'Bundesanstalt für Wasserbau — wasserstrassen', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abaw.de&hl=de&gl=DE&ceid=DE:de', 'site:baw.de', 'googlenews-batchexecute', 'monthly', 60, 'needs_review', 'manual', false, 16, 'wasserstrassen'),
  ('rp-vib-bfu', 'publisher-bfu-web.de', 'vib-bfu', 'Bundesstelle für Flugunfalluntersuchung — luftverkehr_sicherheit', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abfu-web.de&hl=de&gl=DE&ceid=DE:de', 'site:bfu-web.de', 'googlenews-batchexecute', 'monthly', 60, 'needs_review', 'manual', true, 16, 'luftverkehr_sicherheit'),
  ('rp-vib-destatis-verkehr', 'publisher-destatis.de', 'vib-destatis-verkehr', 'Statistisches Bundesamt — statistik', 'googlenews_search', 'https://news.google.com/rss/search?q=Statistisches%20Bundesamt%20Verkehr&hl=de&gl=DE&ceid=DE:de', 'Statistisches Bundesamt Verkehr', 'googlenews-batchexecute', 'monthly', 60, 'needs_review', 'manual', false, 16, 'statistik'),
  ('rp-vib-kba', 'publisher-kba.de', 'vib-kba', 'Kraftfahrt-Bundesamt — statistik', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Akba.de&hl=de&gl=DE&ceid=DE:de', 'site:kba.de', 'googlenews-batchexecute', 'monthly', 60, 'needs_review', 'manual', false, 16, 'statistik'),
  ('rp-vib-uba', 'publisher-umweltbundesamt.de', 'vib-uba', 'Umweltbundesamt — klima_umwelt', 'googlenews_search', 'https://news.google.com/rss/search?q=Umweltbundesamt%20Verkehr&hl=de&gl=DE&ceid=DE:de', 'Umweltbundesamt Verkehr', 'googlenews-batchexecute', 'monthly', 60, 'needs_review', 'manual', false, 16, 'klima_umwelt'),
  ('rp-vib-balm', 'publisher-balm.bund.de', 'vib-balm', 'Bundesamt für Logistik und Mobilität — strasseninfrastruktur', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abalm.bund.de&hl=de&gl=DE&ceid=DE:de', 'site:balm.bund.de', 'googlenews-batchexecute', 'monthly', 60, 'needs_review', 'manual', false, 16, 'strasseninfrastruktur'),
  ('rp-vib-dlr-vf', 'publisher-dlr.de', 'vib-dlr-vf', 'DLR — Institut für Verkehrsforschung — wissenschaft', 'googlenews_search', 'https://news.google.com/rss/search?q=DLR%20Verkehrsforschung%20Mobilit%C3%A4t&hl=de&gl=DE&ceid=DE:de', 'DLR Verkehrsforschung Mobilität', 'googlenews-batchexecute', 'monthly', 60, 'needs_review', 'manual', false, 16, 'wissenschaft'),
  ('rp-vib-diw', 'publisher-diw.de', 'vib-diw', 'DIW Berlin — wissenschaft', 'googlenews_search', 'https://news.google.com/rss/search?q=DIW%20Berlin%20Verkehr%20Infrastruktur&hl=de&gl=DE&ceid=DE:de', 'DIW Berlin Verkehr Infrastruktur', 'googlenews-batchexecute', 'monthly', 60, 'needs_review', 'manual', false, 16, 'wissenschaft'),
  ('rp-vib-vdv', 'publisher-vdv.de', 'vib-vdv', 'Verband Deutscher Verkehrsunternehmen — verbaende', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Avdv.de&hl=de&gl=DE&ceid=DE:de', 'site:vdv.de', 'googlenews-batchexecute', 'daily', 60, 'needs_review', 'manual', false, 16, 'verbaende'),
  ('rp-vib-allianz-pro-schiene', 'publisher-allianz-pro-schiene.de', 'vib-allianz-pro-schiene', 'Allianz pro Schiene — verbaende', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Aallianz-pro-schiene.de&hl=de&gl=DE&ceid=DE:de', 'site:allianz-pro-schiene.de', 'googlenews-batchexecute', 'daily', 60, 'needs_review', 'manual', false, 16, 'verbaende'),
  ('rp-vib-adac', 'publisher-adac.de', 'vib-adac', 'ADAC — verbaende', 'googlenews_search', 'https://news.google.com/rss/search?q=ADAC%20Verkehrspolitik%20Mobilit%C3%A4t&hl=de&gl=DE&ceid=DE:de', 'ADAC Verkehrspolitik Mobilität', 'googlenews-batchexecute', 'daily', 60, 'needs_review', 'manual', false, 16, 'verbaende'),
  ('rp-vib-staedtetag', 'publisher-staedtetag.de', 'vib-staedtetag', 'Deutscher Städtetag — verbaende', 'googlenews_search', 'https://news.google.com/rss/search?q=Deutscher%20St%C3%A4dtetag%20Verkehr%20Mobilit%C3%A4t&hl=de&gl=DE&ceid=DE:de', 'Deutscher Städtetag Verkehr Mobilität', 'googlenews-batchexecute', 'daily', 60, 'needs_review', 'manual', false, 16, 'verbaende'),
  ('rp-vib-bdi', 'publisher-bdi.eu', 'vib-bdi', 'Bundesverband der Deutschen Industrie — verbaende', 'googlenews_search', 'https://news.google.com/rss/search?q=BDI%20Verkehr%20Infrastruktur%20Mobilit%C3%A4t&hl=de&gl=DE&ceid=DE:de', 'BDI Verkehr Infrastruktur Mobilität', 'googlenews-batchexecute', 'daily', 60, 'needs_review', 'manual', false, 16, 'verbaende')
on conflict (id) do nothing;


-- 5) Paket <-> Abrufweg (24; inkl. Wiederverwendung rp-committee-verkehr)
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-bmv-presse'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-bvwp'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-irp'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-mid'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-db-infrago'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-eba'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-dzsf'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-autobahn'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-bast'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-gdws'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-baw'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-bfu'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-destatis-verkehr'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-kba'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-uba'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-balm'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-dlr-vf'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-diw'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-vdv'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-allianz-pro-schiene'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-adac'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-staedtetag'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-vib-bdi'),
  ('pkg-verkehr-infrastruktur-bund', 'rp-committee-verkehr')
on conflict (package_id, retrieval_path_id) do nothing;


-- 6) Erwartete politische Ebene (bund) je NEUEM Abrufweg
insert into public.path_expected_levels (retrieval_path_id, level) values
  ('rp-vib-bmv-presse', 'bund'),
  ('rp-vib-bvwp', 'bund'),
  ('rp-vib-irp', 'bund'),
  ('rp-vib-mid', 'bund'),
  ('rp-vib-db-infrago', 'bund'),
  ('rp-vib-eba', 'bund'),
  ('rp-vib-dzsf', 'bund'),
  ('rp-vib-autobahn', 'bund'),
  ('rp-vib-bast', 'bund'),
  ('rp-vib-gdws', 'bund'),
  ('rp-vib-baw', 'bund'),
  ('rp-vib-bfu', 'bund'),
  ('rp-vib-destatis-verkehr', 'bund'),
  ('rp-vib-kba', 'bund'),
  ('rp-vib-uba', 'bund'),
  ('rp-vib-balm', 'bund'),
  ('rp-vib-dlr-vf', 'bund'),
  ('rp-vib-diw', 'bund'),
  ('rp-vib-vdv', 'bund'),
  ('rp-vib-allianz-pro-schiene', 'bund'),
  ('rp-vib-adac', 'bund'),
  ('rp-vib-staedtetag', 'bund'),
  ('rp-vib-bdi', 'bund')
on conflict (retrieval_path_id, level) do nothing;


-- 7) Erwartete Geografie (geo-bund) je NEUEM Abrufweg
insert into public.path_expected_geographies (retrieval_path_id, geography_id) values
  ('rp-vib-bmv-presse', 'geo-bund'),
  ('rp-vib-bvwp', 'geo-bund'),
  ('rp-vib-irp', 'geo-bund'),
  ('rp-vib-mid', 'geo-bund'),
  ('rp-vib-db-infrago', 'geo-bund'),
  ('rp-vib-eba', 'geo-bund'),
  ('rp-vib-dzsf', 'geo-bund'),
  ('rp-vib-autobahn', 'geo-bund'),
  ('rp-vib-bast', 'geo-bund'),
  ('rp-vib-gdws', 'geo-bund'),
  ('rp-vib-baw', 'geo-bund'),
  ('rp-vib-bfu', 'geo-bund'),
  ('rp-vib-destatis-verkehr', 'geo-bund'),
  ('rp-vib-kba', 'geo-bund'),
  ('rp-vib-uba', 'geo-bund'),
  ('rp-vib-balm', 'geo-bund'),
  ('rp-vib-dlr-vf', 'geo-bund'),
  ('rp-vib-diw', 'geo-bund'),
  ('rp-vib-vdv', 'geo-bund'),
  ('rp-vib-allianz-pro-schiene', 'geo-bund'),
  ('rp-vib-adac', 'geo-bund'),
  ('rp-vib-staedtetag', 'geo-bund'),
  ('rp-vib-bdi', 'geo-bund')
on conflict (retrieval_path_id, geography_id) do nothing;


-- 8) Erwartete Entitaet je NEUEM Abrufweg
insert into public.path_expected_entities (retrieval_path_id, entity_id) values
  ('rp-vib-bmv-presse', 'ministry-bmv'),
  ('rp-vib-bvwp', 'ministry-bmv'),
  ('rp-vib-irp', 'ministry-bmv'),
  ('rp-vib-mid', 'ministry-bmv'),
  ('rp-vib-db-infrago', 'company-db-infrago'),
  ('rp-vib-eba', 'authority-eba'),
  ('rp-vib-dzsf', 'authority-dzsf'),
  ('rp-vib-autobahn', 'company-autobahn-gmbh'),
  ('rp-vib-bast', 'authority-bast'),
  ('rp-vib-gdws', 'authority-gdws'),
  ('rp-vib-baw', 'authority-baw'),
  ('rp-vib-bfu', 'authority-bfu'),
  ('rp-vib-destatis-verkehr', 'statoffice-destatis'),
  ('rp-vib-kba', 'authority-kba'),
  ('rp-vib-uba', 'authority-uba'),
  ('rp-vib-balm', 'authority-balm'),
  ('rp-vib-dlr-vf', 'institute-dlr-vf'),
  ('rp-vib-diw', 'institute-diw'),
  ('rp-vib-vdv', 'association-vdv'),
  ('rp-vib-allianz-pro-schiene', 'association-allianz-pro-schiene'),
  ('rp-vib-adac', 'association-adac'),
  ('rp-vib-staedtetag', 'association-staedtetag'),
  ('rp-vib-bdi', 'association-bdi')
on conflict (retrieval_path_id, entity_id) do nothing;


-- 9) Erwartete Themen je NEUEM Abrufweg
insert into public.path_expected_topics (retrieval_path_id, topic) values
  ('rp-vib-bmv-presse', 'strategische_planung'),
  ('rp-vib-bvwp', 'strategische_planung'),
  ('rp-vib-irp', 'strategische_planung'),
  ('rp-vib-mid', 'statistik'),
  ('rp-vib-db-infrago', 'schieneninfrastruktur'),
  ('rp-vib-eba', 'verkehrssicherheit'),
  ('rp-vib-dzsf', 'wissenschaft'),
  ('rp-vib-autobahn', 'strasseninfrastruktur'),
  ('rp-vib-bast', 'verkehrssicherheit'),
  ('rp-vib-gdws', 'wasserstrassen'),
  ('rp-vib-baw', 'wasserstrassen'),
  ('rp-vib-bfu', 'luftverkehr_sicherheit'),
  ('rp-vib-destatis-verkehr', 'statistik'),
  ('rp-vib-kba', 'statistik'),
  ('rp-vib-uba', 'klima_umwelt'),
  ('rp-vib-balm', 'strasseninfrastruktur'),
  ('rp-vib-dlr-vf', 'wissenschaft'),
  ('rp-vib-diw', 'wissenschaft'),
  ('rp-vib-vdv', 'verbaende'),
  ('rp-vib-allianz-pro-schiene', 'verbaende'),
  ('rp-vib-adac', 'verbaende'),
  ('rp-vib-staedtetag', 'verbaende'),
  ('rp-vib-bdi', 'verbaende')
on conflict (retrieval_path_id, topic) do nothing;


-- Integritaets-Selbstpruefung (erwartet: 0 Zeilen) — kein neuer Weg aktiv:
-- select id, status, activation_mode from public.retrieval_paths
--   where id in ('rp-vib-bmv-presse', 'rp-vib-bvwp', 'rp-vib-irp', 'rp-vib-mid', 'rp-vib-db-infrago', 'rp-vib-eba', 'rp-vib-dzsf', 'rp-vib-autobahn', 'rp-vib-bast', 'rp-vib-gdws', 'rp-vib-baw', 'rp-vib-bfu', 'rp-vib-destatis-verkehr', 'rp-vib-kba', 'rp-vib-uba', 'rp-vib-balm', 'rp-vib-dlr-vf', 'rp-vib-diw', 'rp-vib-vdv', 'rp-vib-allianz-pro-schiene', 'rp-vib-adac', 'rp-vib-staedtetag', 'rp-vib-bdi')
--   and (status <> 'needs_review' or activation_mode <> 'manual');
-- select status from public.source_packages where id = 'pkg-verkehr-infrastruktur-bund'; -- erwartet: prepared

commit;
notify pgrst, 'reload schema';
