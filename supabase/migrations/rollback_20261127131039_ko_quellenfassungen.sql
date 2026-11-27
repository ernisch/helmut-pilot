-- Vorher Code zuruecksetzen; keine automatische Entsicherung/Bestandsmutation.
begin;
lock table public.helmut_ko_quellenfassungen in access exclusive mode;
do $$ begin
 if exists(select 1 from public.helmut_ko_quellenfassungen) then
   raise exception 'ko-quellenfassung-rollback-bindungen-vorhanden'; end if;
end $$;
drop function public.helmut_ko_quellen_verknuepfe(jsonb,jsonb,jsonb);
drop function public.helmut_ko_quellen_historisch(text,integer);
drop function public.helmut_ko_quellen(public.knowledge_objects);
drop function public.raw_documents(public.helmut_ko_quellen);
drop view public.helmut_ko_quellen;
drop view public.helmut_ko_quellenmanifeste;
drop function public.helmut_quellenfassung_dokument(text,text,text,jsonb);
drop function public.helmut_quellenfassung_json(jsonb);
drop table public.helmut_ko_quellenfassungen;
notify pgrst, 'reload schema';
commit;
