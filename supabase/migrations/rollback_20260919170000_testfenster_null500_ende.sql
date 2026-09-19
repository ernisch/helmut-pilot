-- Erst nach bestaetigtem Ende aller dazu bewaffneten Endlaeufe anwenden.
-- Quittungen und Profile bleiben erhalten; der unabhaengige SQL Endplan bleibt nutzbar.
begin;
drop function if exists public.helmut_testfenster_null500_ende(text,jsonb,text,text);
notify pgrst,'reload schema';
commit;
