-- Requires database-owner authority. Never run automatically or against Production.
-- Before rollback, revoke/close every prepared context. Removal disables new reads.
begin;
revoke all on function public.helmut_s500_read_command_binding_v1(text,text,boolean) from service_role;
drop function public.helmut_s500_read_command_binding_v1(text,text,boolean);
drop trigger helmut_s500_command_immutable_row_v1 on public.helmut_store;
drop trigger helmut_s500_command_no_truncate_v1 on public.helmut_store;
drop function public.helmut_s500_command_immutable_row_v1();
drop function public.helmut_s500_command_no_truncate_v1();
commit;
