-- Erst HELMUT_AUTH_PATCH_V1 ausschalten und den bisherigen Codepfad redeployen.
-- Keine Daten, Journale, Reserven oder Tabellen entfernen/zuruecksetzen.
begin;
drop function if exists public.helmut_auth_cas_patch_v1(text,text,uuid,jsonb,text[]);
notify pgrst, 'reload schema';
commit;
