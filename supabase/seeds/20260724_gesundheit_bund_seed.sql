-- Helmut — Quellenpaket GESUNDHEIT (Bund) · PREPARED-Seed (generiert, idempotent, NICHT-destruktiv).
-- Generiert von scripts/generate-gesundheit-bund-seed.js. NICHT von Hand editieren.
-- Voraussetzung: 20260713_source_architecture.sql + 20260713_source_architecture_seed.sql sind
--   angewendet (Tabellen, Basis-Herausgeber bundesgesundheitsministerium.de/bundesrat.de/
--   destatis.de, Basis-Entitäten ministry-bmg/parliament-bundesrat/statoffice-destatis UND das
--   Paket pkg-gesundheit-bund (status 'prepared') vorhanden).
-- ALLE Abrufwege: status='needs_review', activation_mode='manual' -> technisch INAKTIV. FREIGABEPFLICHTIG.
-- Byte-Verifikation der URLs: offen (Sandbox-Egress-Proxy blockt jeden CONNECT (example.com-Kontrolle = HTTP 403 am 2026-07-24).).
begin;

-- 0) Quellenpaket (status 'prepared', is_base false -> kein Pflicht-/Profil-Mapping -> nie aktiviert)
insert into public.source_packages (id, key, name, purpose, status, is_base, political_level, geography_id, required_classes) values
  ('pkg-gesundheit-bund', 'gesundheit-bund', 'Gesundheit Bund', 'Fachthemenpaket Gesundheitspolitik (Bund): normative Primärquellen (BMG, Bundesrat-Gesundheitsausschuss, G-BA), amtliche Datenquellen (RKI, Destatis), gesetzliche Evidenz (IQWiG, SVR), Zulassungs-/Sicherheitsbehörden (BfArM, PEI) und Akteurspositionen (GKV-SV, KBV, DKG, BÄK, Pflegerat). Parlamentarischer Prozess über Bestand (DIP-API + Ausschuss Gesundheit) abgedeckt. Struktur vorbereitet — Quellen INAKTIV bis Byte-Verifikation + Freigabe.', 'prepared', false, 'bund', 'geo-bund', '{}')
on conflict (id) do nothing;


-- 1) Politische Entitaeten (nur NEUE Behörden/Institutionen/Verbände; Bestand bleibt unberührt)
insert into public.political_entities (id, entity_type, name, canonical_key, level, geography_id, aliases) values
  ('institution-g-ba', 'other_institution', 'Gemeinsamer Bundesausschuss', 'g-ba', 'bund', 'geo-bund', array['G-BA','Gemeinsamer Bundesausschuss']::text[]),
  ('authority-rki', 'authority', 'Robert Koch-Institut', 'rki', 'bund', 'geo-bund', array['RKI','Robert Koch-Institut']::text[]),
  ('association-gkv-spitzenverband', 'association', 'GKV-Spitzenverband', 'gkv-spitzenverband', 'bund', 'geo-bund', array['GKV-Spitzenverband','GKV-SV']::text[]),
  ('association-kbv', 'association', 'Kassenärztliche Bundesvereinigung', 'kbv', 'bund', 'geo-bund', array['KBV']::text[]),
  ('association-dkg', 'association', 'Deutsche Krankenhausgesellschaft', 'dkg', 'bund', 'geo-bund', array['DKG','Deutsche Krankenhausgesellschaft']::text[]),
  ('institution-svr-gesundheit', 'other_institution', 'Sachverständigenrat zur Begutachtung der Entwicklung im Gesundheitswesen', 'svr-gesundheit', 'bund', 'geo-bund', array['SVR Gesundheit','Sachverständigenrat Gesundheit']::text[]),
  ('authority-bfarm', 'authority', 'Bundesinstitut für Arzneimittel und Medizinprodukte', 'bfarm', 'bund', 'geo-bund', array['BfArM']::text[]),
  ('authority-pei', 'authority', 'Paul-Ehrlich-Institut', 'pei', 'bund', 'geo-bund', array['PEI','Paul-Ehrlich-Institut']::text[]),
  ('institution-iqwig', 'other_institution', 'Institut für Qualität und Wirtschaftlichkeit im Gesundheitswesen', 'iqwig', 'bund', 'geo-bund', array['IQWiG']::text[]),
  ('association-bundesaerztekammer', 'association', 'Bundesärztekammer', 'bundesaerztekammer', 'bund', 'geo-bund', array['BÄK','Bundesärztekammer']::text[]),
  ('association-deutscher-pflegerat', 'association', 'Deutscher Pflegerat', 'deutscher-pflegerat', 'bund', 'geo-bund', array['DPR','Deutscher Pflegerat']::text[])
on conflict (id) do nothing;

-- wiederverwendete Entitaeten (NICHT eingefügt): ministry-bmg, parliament-bundesrat, statoffice-destatis

-- 2) Herausgeber (nur NEUE, 11)
insert into public.publishers (id, name, canonical_domain, publisher_type, evidence_role, trust, lifecycle_status, entity_id) values
  ('publisher-g-ba.de', 'Gemeinsamer Bundesausschuss', 'g-ba.de', 'other_institution', 'official_primary', 'unbekannt', 'active', 'institution-g-ba'),
  ('publisher-rki.de', 'Robert Koch-Institut', 'rki.de', 'authority', 'data_source', 'unbekannt', 'active', 'authority-rki'),
  ('publisher-gkv-spitzenverband.de', 'GKV-Spitzenverband', 'gkv-spitzenverband.de', 'association', 'direct_interest', 'unbekannt', 'active', 'association-gkv-spitzenverband'),
  ('publisher-kbv.de', 'Kassenärztliche Bundesvereinigung', 'kbv.de', 'association', 'direct_interest', 'unbekannt', 'active', 'association-kbv'),
  ('publisher-dkgev.de', 'Deutsche Krankenhausgesellschaft', 'dkgev.de', 'association', 'direct_interest', 'unbekannt', 'active', 'association-dkg'),
  ('publisher-svr-gesundheit.de', 'Sachverständigenrat zur Begutachtung der Entwicklung im Gesundheitswesen', 'svr-gesundheit.de', 'other_institution', 'data_source', 'unbekannt', 'active', 'institution-svr-gesundheit'),
  ('publisher-bfarm.de', 'Bundesinstitut für Arzneimittel und Medizinprodukte', 'bfarm.de', 'authority', 'official_primary', 'unbekannt', 'active', 'authority-bfarm'),
  ('publisher-pei.de', 'Paul-Ehrlich-Institut', 'pei.de', 'authority', 'official_primary', 'unbekannt', 'active', 'authority-pei'),
  ('publisher-iqwig.de', 'Institut für Qualität und Wirtschaftlichkeit im Gesundheitswesen', 'iqwig.de', 'other_institution', 'data_source', 'unbekannt', 'active', 'institution-iqwig'),
  ('publisher-bundesaerztekammer.de', 'Bundesärztekammer', 'bundesaerztekammer.de', 'association', 'direct_interest', 'unbekannt', 'active', 'association-bundesaerztekammer'),
  ('publisher-deutscher-pflegerat.de', 'Deutscher Pflegerat', 'deutscher-pflegerat.de', 'association', 'direct_interest', 'unbekannt', 'active', 'association-deutscher-pflegerat')
on conflict (id) do nothing;

-- wiederverwendete Herausgeber (NICHT eingefügt): publisher-bundesgesundheitsministerium.de, publisher-bundesrat.de, publisher-destatis.de

-- 3) Abrufwege (14) — INAKTIV: status='needs_review', activation_mode='manual' (HART gesetzt)
insert into public.retrieval_paths (id, publisher_id, legacy_source_id, name, method, url, query, parser, expected_frequency, priority, status, activation_mode, is_critical, max_items) values
  ('rp-gesbund-bmg-gesetzgebung', 'publisher-bundesgesundheitsministerium.de', 'gesbund-bmg-gesetzgebung', 'Bundesministerium für Gesundheit — Gesetzgebung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abundesgesundheitsministerium.de%20(Gesetz%20OR%20Verordnung%20OR%20Referentenentwurf%20OR%20Kabinett%20OR%20Formulierungshilfe)&hl=de&gl=DE&ceid=DE:de', 'site:bundesgesundheitsministerium.de (Gesetz OR Verordnung OR Referentenentwurf OR Kabinett OR Formulierungshilfe)', 'googlenews-batchexecute', 'anlassbezogen', 85, 'needs_review', 'manual', true, 16),
  ('rp-gesbund-bundesrat-gesundheit', 'publisher-bundesrat.de', 'gesbund-bundesrat-gesundheit', 'Bundesrat — Länderbeteiligung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abundesrat.de%20(Gesundheit%20OR%20Pflege%20OR%20Krankenhaus%20OR%20Gesundheitsausschuss%20OR%20Arzneimittel)&hl=de&gl=DE&ceid=DE:de', 'site:bundesrat.de (Gesundheit OR Pflege OR Krankenhaus OR Gesundheitsausschuss OR Arzneimittel)', 'googlenews-batchexecute', 'anlassbezogen', 85, 'needs_review', 'manual', true, 16),
  ('rp-gesbund-gba-beschluesse', 'publisher-g-ba.de', 'gesbund-gba-beschluesse', 'Gemeinsamer Bundesausschuss — Selbstverwaltung', 'rss', 'https://www.g-ba.de/beschluesse/letzte-aenderungen/?rss=1', null, 'rss-regex', 'anlassbezogen', 85, 'needs_review', 'manual', true, 16),
  ('rp-gesbund-rki-epidbull', 'publisher-rki.de', 'gesbund-rki-epidbull', 'Robert Koch-Institut — Epidemiologie', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Arki.de%20(Epidemiologisches%20Bulletin%20OR%20STIKO%20OR%20Infektionsschutz%20OR%20Ausbruch)&hl=de&gl=DE&ceid=DE:de', 'site:rki.de (Epidemiologisches Bulletin OR STIKO OR Infektionsschutz OR Ausbruch)', 'googlenews-batchexecute', 'anlassbezogen', 85, 'needs_review', 'manual', false, 16),
  ('rp-gesbund-destatis-genesis', 'publisher-destatis.de', 'gesbund-destatis-genesis', 'Statistisches Bundesamt — Krankenhaus + Finanzierung', 'structured_download', 'https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Gesundheit/_inhalt.html', null, 'genesis-csv', 'jaehrlich', 45, 'needs_review', 'manual', false, 16),
  ('rp-gesbund-gkv-spitzenverband', 'publisher-gkv-spitzenverband.de', 'gesbund-gkv-spitzenverband', 'GKV-Spitzenverband — Kassenposition', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Agkv-spitzenverband.de%20(Position%20OR%20Stellungnahme%20OR%20Pr%C3%A4vention%20OR%20Pflege%20OR%20Finanzierung)&hl=de&gl=DE&ceid=DE:de', 'site:gkv-spitzenverband.de (Position OR Stellungnahme OR Prävention OR Pflege OR Finanzierung)', 'googlenews-batchexecute', 'woechentlich', 65, 'needs_review', 'manual', false, 16),
  ('rp-gesbund-kbv-praxisnachrichten', 'publisher-kbv.de', 'gesbund-kbv-praxisnachrichten', 'Kassenärztliche Bundesvereinigung — Ärzteposition (ambulant)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Akbv.de%20(PraxisNachrichten%20OR%20Stellungnahme%20OR%20Honorar%20OR%20Vertragsarzt%20OR%20Versorgung)&hl=de&gl=DE&ceid=DE:de', 'site:kbv.de (PraxisNachrichten OR Stellungnahme OR Honorar OR Vertragsarzt OR Versorgung)', 'googlenews-batchexecute', 'woechentlich', 65, 'needs_review', 'manual', false, 16),
  ('rp-gesbund-dkg-positionen', 'publisher-dkgev.de', 'gesbund-dkg-positionen', 'Deutsche Krankenhausgesellschaft — Krankenhausposition', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Adkgev.de%20(Position%20OR%20Stellungnahme%20OR%20Krankenhaus%20OR%20Finanzierung%20OR%20Fachkr%C3%A4fte)&hl=de&gl=DE&ceid=DE:de', 'site:dkgev.de (Position OR Stellungnahme OR Krankenhaus OR Finanzierung OR Fachkräfte)', 'googlenews-batchexecute', 'woechentlich', 65, 'needs_review', 'manual', false, 16),
  ('rp-gesbund-svr-gutachten', 'publisher-svr-gesundheit.de', 'gesbund-svr-gutachten', 'Sachverständigenrat zur Begutachtung der Entwicklung im Gesundheitswesen — Reformgutachten', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Asvr-gesundheit.de%20(Gutachten%20OR%20Stellungnahme%20OR%20Empfehlung)&hl=de&gl=DE&ceid=DE:de', 'site:svr-gesundheit.de (Gutachten OR Stellungnahme OR Empfehlung)', 'googlenews-batchexecute', 'jaehrlich', 45, 'needs_review', 'manual', false, 16),
  ('rp-gesbund-bfarm-lieferengpaesse', 'publisher-bfarm.de', 'gesbund-bfarm-lieferengpaesse', 'Bundesinstitut für Arzneimittel und Medizinprodukte — Arzneimittel', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abfarm.de%20(Lieferengpass%20OR%20Lieferengp%C3%A4sse%20OR%20R%C3%BCckruf%20OR%20Arzneimittel)&hl=de&gl=DE&ceid=DE:de', 'site:bfarm.de (Lieferengpass OR Lieferengpässe OR Rückruf OR Arzneimittel)', 'googlenews-batchexecute', 'anlassbezogen', 85, 'needs_review', 'manual', true, 16),
  ('rp-gesbund-pei-sicherheit', 'publisher-pei.de', 'gesbund-pei-sicherheit', 'Paul-Ehrlich-Institut — Impfstoffe / biomedizinische Arzneimittel', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Apei.de%20(Sicherheitsinformation%20OR%20Chargenpr%C3%BCfung%20OR%20Impfstoff%20OR%20Rote-Hand-Brief)&hl=de&gl=DE&ceid=DE:de', 'site:pei.de (Sicherheitsinformation OR Chargenprüfung OR Impfstoff OR Rote-Hand-Brief)', 'googlenews-batchexecute', 'anlassbezogen', 85, 'needs_review', 'manual', true, 16),
  ('rp-gesbund-iqwig-berichte', 'publisher-iqwig.de', 'gesbund-iqwig-berichte', 'Institut für Qualität und Wirtschaftlichkeit im Gesundheitswesen — Evidenz / Nutzenbewertung', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Aiqwig.de%20(Abschlussbericht%20OR%20Vorbericht%20OR%20Nutzenbewertung%20OR%20Berichtsplan)&hl=de&gl=DE&ceid=DE:de', 'site:iqwig.de (Abschlussbericht OR Vorbericht OR Nutzenbewertung OR Berichtsplan)', 'googlenews-batchexecute', 'woechentlich', 65, 'needs_review', 'manual', false, 16),
  ('rp-gesbund-baek-stellungnahmen', 'publisher-bundesaerztekammer.de', 'gesbund-baek-stellungnahmen', 'Bundesärztekammer — Ärzteschaft (Profession)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Abundesaerztekammer.de%20(Stellungnahme%20OR%20Position%20OR%20Gesetzentwurf%20OR%20Richtlinie)&hl=de&gl=DE&ceid=DE:de', 'site:bundesaerztekammer.de (Stellungnahme OR Position OR Gesetzentwurf OR Richtlinie)', 'googlenews-batchexecute', 'woechentlich', 65, 'needs_review', 'manual', false, 16),
  ('rp-gesbund-pflegerat-stellungnahmen', 'publisher-deutscher-pflegerat.de', 'gesbund-pflegerat-stellungnahmen', 'Deutscher Pflegerat — Pflege (Profession)', 'googlenews_search', 'https://news.google.com/rss/search?q=site%3Adeutscher-pflegerat.de%20(Stellungnahme%20OR%20Position%20OR%20Pflege%20OR%20Gesetzentwurf)&hl=de&gl=DE&ceid=DE:de', 'site:deutscher-pflegerat.de (Stellungnahme OR Position OR Pflege OR Gesetzentwurf)', 'googlenews-batchexecute', 'woechentlich', 65, 'needs_review', 'manual', false, 16)
on conflict (id) do nothing;


-- 4) Paket <-> Abrufweg (nur pkg-gesundheit-bund)
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-gesundheit-bund', 'rp-gesbund-bmg-gesetzgebung'),
  ('pkg-gesundheit-bund', 'rp-gesbund-bundesrat-gesundheit'),
  ('pkg-gesundheit-bund', 'rp-gesbund-gba-beschluesse'),
  ('pkg-gesundheit-bund', 'rp-gesbund-rki-epidbull'),
  ('pkg-gesundheit-bund', 'rp-gesbund-destatis-genesis'),
  ('pkg-gesundheit-bund', 'rp-gesbund-gkv-spitzenverband'),
  ('pkg-gesundheit-bund', 'rp-gesbund-kbv-praxisnachrichten'),
  ('pkg-gesundheit-bund', 'rp-gesbund-dkg-positionen'),
  ('pkg-gesundheit-bund', 'rp-gesbund-svr-gutachten'),
  ('pkg-gesundheit-bund', 'rp-gesbund-bfarm-lieferengpaesse'),
  ('pkg-gesundheit-bund', 'rp-gesbund-pei-sicherheit'),
  ('pkg-gesundheit-bund', 'rp-gesbund-iqwig-berichte'),
  ('pkg-gesundheit-bund', 'rp-gesbund-baek-stellungnahmen'),
  ('pkg-gesundheit-bund', 'rp-gesbund-pflegerat-stellungnahmen')
on conflict (package_id, retrieval_path_id) do nothing;


-- 5) Erwartete politische Ebene (bund) je Abrufweg
insert into public.path_expected_levels (retrieval_path_id, level) values
  ('rp-gesbund-bmg-gesetzgebung', 'bund'),
  ('rp-gesbund-bundesrat-gesundheit', 'bund'),
  ('rp-gesbund-gba-beschluesse', 'bund'),
  ('rp-gesbund-rki-epidbull', 'bund'),
  ('rp-gesbund-destatis-genesis', 'bund'),
  ('rp-gesbund-gkv-spitzenverband', 'bund'),
  ('rp-gesbund-kbv-praxisnachrichten', 'bund'),
  ('rp-gesbund-dkg-positionen', 'bund'),
  ('rp-gesbund-svr-gutachten', 'bund'),
  ('rp-gesbund-bfarm-lieferengpaesse', 'bund'),
  ('rp-gesbund-pei-sicherheit', 'bund'),
  ('rp-gesbund-iqwig-berichte', 'bund'),
  ('rp-gesbund-baek-stellungnahmen', 'bund'),
  ('rp-gesbund-pflegerat-stellungnahmen', 'bund')
on conflict (retrieval_path_id, level) do nothing;


-- 6) Erwartete Geografie (geo-bund) je Abrufweg
insert into public.path_expected_geographies (retrieval_path_id, geography_id) values
  ('rp-gesbund-bmg-gesetzgebung', 'geo-bund'),
  ('rp-gesbund-bundesrat-gesundheit', 'geo-bund'),
  ('rp-gesbund-gba-beschluesse', 'geo-bund'),
  ('rp-gesbund-rki-epidbull', 'geo-bund'),
  ('rp-gesbund-destatis-genesis', 'geo-bund'),
  ('rp-gesbund-gkv-spitzenverband', 'geo-bund'),
  ('rp-gesbund-kbv-praxisnachrichten', 'geo-bund'),
  ('rp-gesbund-dkg-positionen', 'geo-bund'),
  ('rp-gesbund-svr-gutachten', 'geo-bund'),
  ('rp-gesbund-bfarm-lieferengpaesse', 'geo-bund'),
  ('rp-gesbund-pei-sicherheit', 'geo-bund'),
  ('rp-gesbund-iqwig-berichte', 'geo-bund'),
  ('rp-gesbund-baek-stellungnahmen', 'geo-bund'),
  ('rp-gesbund-pflegerat-stellungnahmen', 'geo-bund')
on conflict (retrieval_path_id, geography_id) do nothing;


-- Integritaets-Selbstpruefung: 0 aktive gesundheit-bund-Wege nach der Eintragung (erwartet: 0 Zeilen).
-- select id, status, activation_mode from public.retrieval_paths
--   where id in ('rp-gesbund-bmg-gesetzgebung', 'rp-gesbund-bundesrat-gesundheit', 'rp-gesbund-gba-beschluesse', 'rp-gesbund-rki-epidbull', 'rp-gesbund-destatis-genesis', 'rp-gesbund-gkv-spitzenverband', 'rp-gesbund-kbv-praxisnachrichten', 'rp-gesbund-dkg-positionen', 'rp-gesbund-svr-gutachten', 'rp-gesbund-bfarm-lieferengpaesse', 'rp-gesbund-pei-sicherheit', 'rp-gesbund-iqwig-berichte', 'rp-gesbund-baek-stellungnahmen', 'rp-gesbund-pflegerat-stellungnahmen')
--   and (status <> 'needs_review' or activation_mode <> 'manual');

commit;
notify pgrst, 'reload schema';
