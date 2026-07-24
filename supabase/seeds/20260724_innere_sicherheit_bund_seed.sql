-- Helmut — Fachpaket "Innere Sicherheit (Bund)" · PREPARED-Seed (generiert, idempotent, NICHT-destruktiv).
-- Generiert von scripts/generate-innere-sicherheit-bund-seed.js. NICHT von Hand editieren.
-- Voraussetzung: 20260713_source_architecture.sql + dessen Basis-Seed sind angewendet
--   (referenziert die BESTEHENDEN ministry-bmi, rp-dip, rp-committee-inneres).
-- Paket status='prepared'; ALLE neuen Abrufwege status='needs_review', activation_mode='manual'
--   -> technisch INAKTIV. FREIGABEPFLICHTIG. Byte-genaue URL-Pruefung vor Aktivierung offen.
begin;

-- 1) Quellenpaket (prepared, is_base=false, Bund) — traegt der eigene Seed (NICHT in packages.js)
insert into public.source_packages (id, key, name, purpose, status, is_base, political_level, geography_id, required_classes) values
  ('pkg-innere-sicherheit-bund', 'innere-sicherheit-bund', 'Innere Sicherheit (Bund)', 'Fachthemenpaket bundespolitische Innere Sicherheit: Sicherheitsgesetzgebung/politische Steuerung (BMI), Kriminalstatistik & Bundeslagebilder (BKA), Politisch motivierte Kriminalitaet (BKA), Verfassungsschutzberichte/Extremismus/Spionage (BfV), Datenschutzkontrolle bei Sicherheitsgesetzen (BfDI) sowie — wiederverwendet — DIP und Innenausschuss. Struktur vorbereitet, technisch INAKTIV (prepared); Aktivierung freigabepflichtig.', 'prepared', false, 'bund', 'geo-bund', '{}')
on conflict (id) do nothing;


-- 2) Neue politische Entitaeten (Behoerden) — ministry-bmi wird NUR referenziert, nicht angelegt
insert into public.political_entities (id, entity_type, name, canonical_key, level, geography_id, aliases) values
  ('authority-bka', 'authority', 'Bundeskriminalamt', null, 'bund', 'geo-bund', array['BKA']::text[]),
  ('authority-bfv', 'authority', 'Bundesamt für Verfassungsschutz', null, 'bund', 'geo-bund', array['BfV', 'Verfassungsschutz']::text[]),
  ('authority-bfdi', 'authority', 'Bundesbeauftragte für den Datenschutz und die Informationsfreiheit', null, 'bund', 'geo-bund', array['BfDI']::text[])
on conflict (id) do nothing;


-- 3) Herausgeber (4)
insert into public.publishers (id, name, canonical_domain, publisher_type, evidence_role, trust, lifecycle_status, entity_id) values
  ('publisher-bmi.bund.de', 'Bundesministerium des Innern', 'bmi.bund.de', 'ministry', 'official_primary', 'hoch', 'active', 'ministry-bmi'),
  ('publisher-bka.de', 'Bundeskriminalamt', 'bka.de', 'authority', 'data_source', 'hoch', 'active', 'authority-bka'),
  ('publisher-verfassungsschutz.de', 'Bundesamt für Verfassungsschutz', 'verfassungsschutz.de', 'authority', 'data_source', 'hoch', 'active', 'authority-bfv'),
  ('publisher-bfdi.bund.de', 'Bundesbeauftragte für den Datenschutz und die Informationsfreiheit', 'bfdi.bund.de', 'authority', 'data_source', 'hoch', 'active', 'authority-bfdi')
on conflict (id) do nothing;


-- 4) Abrufwege (5) — INAKTIV: needs_review + manual
insert into public.retrieval_paths (id, publisher_id, legacy_source_id, name, method, url, query, parser, expected_frequency, priority, status, activation_mode, is_critical, max_items) values
  ('rp-isb-bmi-gesetzgebung', 'publisher-bmi.bund.de', 'isb-bmi-gesetzgebung', 'BMI — Sicherheitsgesetzgebung & Strategien (Gesetzgebungsverfahren)', 'html', 'https://www.bmi.bund.de/DE/ministerium/gesetzgebungsverfahren/gesetzgebungsverfahren-artikel.html', null, 'html-scrape', 'irregular', 84, 'needs_review', 'manual', true, 16),
  ('rp-isb-bka-statistik-lagebilder', 'publisher-bka.de', 'isb-bka-statistik-lagebilder', 'BKA — Statistiken & Bundeslagebilder (PKS, OK, Cybercrime, Menschenhandel, Rauschgift, Zuwanderung)', 'html', 'https://www.bka.de/DE/AktuelleInformationen/StatistikenLagebilder/statistikenlagebilder_node.html', null, 'html-scrape', 'annual', 86, 'needs_review', 'manual', true, 16),
  ('rp-isb-bka-pmk', 'publisher-bka.de', 'isb-bka-pmk', 'BKA — Politisch motivierte Kriminalität (Fallzahlen)', 'html', 'https://www.bka.de/DE/UnsereAufgaben/Deliktsbereiche/PMK/PMKZahlen/PMKZahlen_node.html', null, 'html-scrape', 'annual', 84, 'needs_review', 'manual', true, 16),
  ('rp-isb-bfv-verfassungsschutzberichte', 'publisher-verfassungsschutz.de', 'isb-bfv-verfassungsschutzberichte', 'BfV — Verfassungsschutzberichte & Publikationen (Extremismus, Spionage, hybride Bedrohungen)', 'html', 'https://www.verfassungsschutz.de/DE/service/publikationen/publikationen_node.html', null, 'html-scrape', 'annual', 86, 'needs_review', 'manual', true, 16),
  ('rp-isb-bfdi-taetigkeitsberichte', 'publisher-bfdi.bund.de', 'isb-bfdi-taetigkeitsberichte', 'BfDI — Tätigkeitsberichte & Stellungnahmen (Datenschutz bei Sicherheitsgesetzen)', 'html', 'https://www.bfdi.bund.de/DE/Service/Publikationen/Taetigkeitsberichte/taetigkeitsberichte_node.html', null, 'html-scrape', 'annual', 74, 'needs_review', 'manual', false, 16)
on conflict (id) do nothing;


-- 5) Paket <-> Abrufweg. Neue rp-isb-* + WIEDERVERWENDETE rp-dip / rp-committee-inneres.
--    (Referenz auf bestehende Wege = Wiederverwendung; Refcount unveraendert, da Paket prepared.)
insert into public.package_paths (package_id, retrieval_path_id) values
  ('pkg-innere-sicherheit-bund', 'rp-isb-bmi-gesetzgebung'),
  ('pkg-innere-sicherheit-bund', 'rp-isb-bka-statistik-lagebilder'),
  ('pkg-innere-sicherheit-bund', 'rp-isb-bka-pmk'),
  ('pkg-innere-sicherheit-bund', 'rp-isb-bfv-verfassungsschutzberichte'),
  ('pkg-innere-sicherheit-bund', 'rp-isb-bfdi-taetigkeitsberichte'),
  ('pkg-innere-sicherheit-bund', 'rp-dip'),
  ('pkg-innere-sicherheit-bund', 'rp-committee-inneres')
on conflict (package_id, retrieval_path_id) do nothing;


-- 6) Erwartete politische Ebene (bund) je NEUEM Abrufweg
insert into public.path_expected_levels (retrieval_path_id, level) values
  ('rp-isb-bmi-gesetzgebung', 'bund'),
  ('rp-isb-bka-statistik-lagebilder', 'bund'),
  ('rp-isb-bka-pmk', 'bund'),
  ('rp-isb-bfv-verfassungsschutzberichte', 'bund'),
  ('rp-isb-bfdi-taetigkeitsberichte', 'bund')
on conflict (retrieval_path_id, level) do nothing;


-- 7) Erwartete Geografie (geo-bund) je NEUEM Abrufweg
insert into public.path_expected_geographies (retrieval_path_id, geography_id) values
  ('rp-isb-bmi-gesetzgebung', 'geo-bund'),
  ('rp-isb-bka-statistik-lagebilder', 'geo-bund'),
  ('rp-isb-bka-pmk', 'geo-bund'),
  ('rp-isb-bfv-verfassungsschutzberichte', 'geo-bund'),
  ('rp-isb-bfdi-taetigkeitsberichte', 'geo-bund')
on conflict (retrieval_path_id, geography_id) do nothing;


-- 8) Erwartete Themen je NEUEM Abrufweg (buendelt u. a. die BKA-Lagebilder in EINEM Weg)
insert into public.path_expected_topics (retrieval_path_id, topic) values
  ('rp-isb-bmi-gesetzgebung', 'sicherheitsgesetzgebung'),
  ('rp-isb-bmi-gesetzgebung', 'sicherheitsstrategie'),
  ('rp-isb-bka-statistik-lagebilder', 'kriminalstatistik'),
  ('rp-isb-bka-statistik-lagebilder', 'organisierte_kriminalitaet'),
  ('rp-isb-bka-statistik-lagebilder', 'cybercrime'),
  ('rp-isb-bka-statistik-lagebilder', 'menschenhandel'),
  ('rp-isb-bka-statistik-lagebilder', 'rauschgiftkriminalitaet'),
  ('rp-isb-bka-statistik-lagebilder', 'kriminalitaet_zuwanderung'),
  ('rp-isb-bka-pmk', 'politisch_motivierte_kriminalitaet'),
  ('rp-isb-bka-pmk', 'extremismus'),
  ('rp-isb-bfv-verfassungsschutzberichte', 'extremismus'),
  ('rp-isb-bfv-verfassungsschutzberichte', 'spionageabwehr'),
  ('rp-isb-bfv-verfassungsschutzberichte', 'hybride_bedrohungen'),
  ('rp-isb-bfdi-taetigkeitsberichte', 'datenschutzkontrolle'),
  ('rp-isb-bfdi-taetigkeitsberichte', 'ueberwachungsgesetze')
on conflict (retrieval_path_id, topic) do nothing;


-- 9) Erwartete Entitaet je NEUEM Abrufweg
insert into public.path_expected_entities (retrieval_path_id, entity_id) values
  ('rp-isb-bmi-gesetzgebung', 'ministry-bmi'),
  ('rp-isb-bka-statistik-lagebilder', 'authority-bka'),
  ('rp-isb-bka-pmk', 'authority-bka'),
  ('rp-isb-bfv-verfassungsschutzberichte', 'authority-bfv'),
  ('rp-isb-bfdi-taetigkeitsberichte', 'authority-bfdi')
on conflict (retrieval_path_id, entity_id) do nothing;


-- Integritaets-Selbstpruefung (erwartet: 0 Zeilen) — kein neuer Weg aktiv:
-- select id, status, activation_mode from public.retrieval_paths
--   where id in ('rp-isb-bmi-gesetzgebung', 'rp-isb-bka-statistik-lagebilder', 'rp-isb-bka-pmk', 'rp-isb-bfv-verfassungsschutzberichte', 'rp-isb-bfdi-taetigkeitsberichte')
--   and (status <> 'needs_review' or activation_mode <> 'manual');
-- Paketstatus muss 'prepared' sein:
-- select status from public.source_packages where id = 'pkg-innere-sicherheit-bund'; -- prepared

commit;
notify pgrst, 'reload schema';
