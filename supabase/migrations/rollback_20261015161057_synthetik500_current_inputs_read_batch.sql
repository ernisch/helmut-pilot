-- Revert the matching Node consumer before dropping this transport function.
-- No profile/source/financial/journal rows or original native functions change.
begin;
drop function if exists public.helmut_synthetik500_current_inputs_v1(text[],text[],text);
commit;
