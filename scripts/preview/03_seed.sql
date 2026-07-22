-- ═══════════════════════════════════════════════════════════════════════════
-- Sprint 11 — Preview-Seed: mehrere parallele, synthetische Mandanten.
-- Keine echten Daten, keine echten Nutzer, keine Production-IDs. NUR PREVIEW.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drei parallele Mandanten (mdb-a, mdb-b, mdb-c) über alle Tabellenklassen.
insert into public.decisions (id, user_id, payload) values
  ('dec-a-1','mdb-a','A1'), ('dec-a-2','mdb-a','A2'),
  ('dec-b-1','mdb-b','B1'),
  ('dec-c-1','mdb-c','C1'), ('dec-c-2','mdb-c','C2'), ('dec-c-3','mdb-c','C3')
  on conflict (id) do nothing;

insert into public.matching_results (id, user_id, payload) values
  ('mr-a-1','mdb-a','A'), ('mr-b-1','mdb-b','B'), ('mr-c-1','mdb-c','C')
  on conflict (id) do nothing;

insert into public.office_outputs (id, user_id, payload) values
  ('off-a-1','mdb-a','geheim-A'), ('off-b-1','mdb-b','geheim-B'), ('off-c-1','mdb-c','geheim-C')
  on conflict (id) do nothing;

insert into public.briefings (id, user_id, payload) values
  ('bf-a','mdb-a','A'), ('bf-b','mdb-b','B'), ('bf-c','mdb-c','C')
  on conflict (id) do nothing;

insert into public.llm_usage (id, user_id, politician_id, cost) values
  ('llm-a-uid','mdb-a',null,1.0),
  ('llm-a-pid',null,'mdb-a',2.0),   -- Legacy-Spalte befüllt
  ('llm-b-uid','mdb-b',null,3.0),
  ('llm-c-pid',null,'mdb-c',4.0)
  on conflict (id) do nothing;

insert into public.profiles (id, name) values
  ('mdb-a','Mandant A'), ('mdb-b','Mandant B'), ('mdb-c','Mandant C')
  on conflict (id) do nothing;

-- helmut_store: geteilte, hochsensible Login-Zeile und pro-Mandant-Blobs.
insert into public.helmut_store (id, data) values
  ('main','geteilter-katalog'),
  ('main-auth','ALLE-LOGINS-HOCHSENSIBEL'),
  ('main-p-mdb-a','blob-A'),
  ('main-p-mdb-b','blob-B'),
  ('main-p-mdb-c','blob-C')
  on conflict (id) do nothing;

-- Geteilter Wissenskorpus (mandantenlos).
insert into public.knowledge_objects (id, title) values
  ('ko-1','Bürgergeld-Reform'), ('ko-2','Haushalt 2026')
  on conflict (id) do nothing;
insert into public.raw_documents (id, url) values
  ('doc-1','https://example.test/1')
  on conflict (id) do nothing;
insert into public.sources (id, name) values
  ('src-1','Bundestag')
  on conflict (id) do nothing;

-- Operative Sperre (keine Nutzerdaten).
insert into public.pipeline_locks (job_name, locked_at) values
  ('crawl','2026-07-22T00:00:00Z')
  on conflict (job_name) do nothing;
