-- Inerte eigene Synthetikvorbereitung. KEINE Profile/Slots/Aktivierung/Scheduler.
-- Geschlossene Generatorvarianten und vollstaendige Importquittung gebunden.
-- Installation separat pruefen/freigeben; alter null500-Endpfad unveraendert.
begin;
set local statement_timeout='15s';
set local lock_timeout='3s';
create schema helmut_synthetik500_internal;
revoke all on schema helmut_synthetik500_internal from public;

-- Kanonische JSON-Schreibweise fuer die lokal aus JS serialisierten Bindungen.
-- Getrennte SQL-Selbsthashes verhindern zudem versehentliche JSONB-Paarvertauschung.
create function helmut_synthetik500_internal.json_compact(p jsonb) returns text
language plpgsql immutable security invoker set search_path=pg_catalog as $compact$
declare r text; digits text; signum text; exponent integer; numeric_value numeric;
begin
  case jsonb_typeof(p)
    when 'object' then
      select '{'||coalesce(string_agg(to_jsonb(k)::text||':'||helmut_synthetik500_internal.json_compact(v),',' order by k collate "C"),'')||'}'
        into r from jsonb_each(p) x(k,v);
    when 'array' then
      select '['||coalesce(string_agg(helmut_synthetik500_internal.json_compact(v),',' order by n),'')||']'
        into r from jsonb_array_elements(p) with ordinality x(v,n);
    when 'number' then
      numeric_value := (p::text)::numeric;
      r := trim_scale(numeric_value)::text;
      -- JSON.stringify benutzt Exponenten ab 1e21 und unter 1e-6; der
      -- Snapshot kam bereits als JSON.stringify-JSON an, nicht als DB-Float.
      if numeric_value<>0 and (abs(numeric_value)>=1e21 or abs(numeric_value)<1e-6) then
        signum := case when numeric_value<0 then '-' else '' end;
        r := trim_scale(abs(numeric_value))::text;
        if abs(numeric_value)>=1e21 then
          exponent := length(split_part(r,'.',1))-1;
          digits := rtrim(replace(r,'.',''),'0');
        else
          digits := regexp_replace(split_part(r,'.',2),'^0+','');
          exponent := -(length(split_part(r,'.',2))-length(digits)+1);
        end if;
        r := signum||left(digits,1)||case when length(digits)>1 then '.'||substr(digits,2) else '' end
          ||'e'||case when exponent>=0 then '+' else '' end||exponent::text;
      end if;
    else r := p::text;
  end case;
  return r;
end $compact$;

create function helmut_synthetik500_internal.pruefe(p_operation_id text,p_manifest_hash text,p_production_commit text)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $pruefe$
declare
  e jsonb;
  m jsonb;
  runtime_manifest jsonb;
  s jsonb;
  q jsonb;
  b jsonb;
  ids jsonb := '["test-kohorte-synthetik-bb-001","test-kohorte-synthetik-bb-002","test-kohorte-synthetik-bb-003","test-kohorte-synthetik-bb-004","test-kohorte-synthetik-bb-005","test-kohorte-synthetik-bb-006","test-kohorte-synthetik-bb-007","test-kohorte-synthetik-bb-008","test-kohorte-synthetik-bb-009","test-kohorte-synthetik-bb-010","test-kohorte-synthetik-bb-011","test-kohorte-synthetik-bb-012","test-kohorte-synthetik-bb-013","test-kohorte-synthetik-bb-014","test-kohorte-synthetik-bb-015","test-kohorte-synthetik-bb-016","test-kohorte-synthetik-bb-017","test-kohorte-synthetik-bb-018","test-kohorte-synthetik-bb-019","test-kohorte-synthetik-bb-020","test-kohorte-synthetik-bb-021","test-kohorte-synthetik-bb-022","test-kohorte-synthetik-bb-023","test-kohorte-synthetik-bb-024","test-kohorte-synthetik-bb-025","test-kohorte-synthetik-bb-026","test-kohorte-synthetik-bb-027","test-kohorte-synthetik-bb-028","test-kohorte-synthetik-bb-029","test-kohorte-synthetik-bb-030","test-kohorte-synthetik-bb-031","test-kohorte-synthetik-bb-032","test-kohorte-synthetik-bb-033","test-kohorte-synthetik-bb-034","test-kohorte-synthetik-bb-035","test-kohorte-synthetik-bb-036","test-kohorte-synthetik-bb-037","test-kohorte-synthetik-bb-038","test-kohorte-synthetik-bb-039","test-kohorte-synthetik-bb-040","test-kohorte-synthetik-bb-041","test-kohorte-synthetik-bb-042","test-kohorte-synthetik-bb-043","test-kohorte-synthetik-bb-044","test-kohorte-synthetik-bb-045","test-kohorte-synthetik-bb-046","test-kohorte-synthetik-bb-047","test-kohorte-synthetik-bb-048","test-kohorte-synthetik-bb-049","test-kohorte-synthetik-bb-050","test-kohorte-synthetik-be-001","test-kohorte-synthetik-be-002","test-kohorte-synthetik-be-003","test-kohorte-synthetik-be-004","test-kohorte-synthetik-be-005","test-kohorte-synthetik-be-006","test-kohorte-synthetik-be-007","test-kohorte-synthetik-be-008","test-kohorte-synthetik-be-009","test-kohorte-synthetik-be-010","test-kohorte-synthetik-be-011","test-kohorte-synthetik-be-012","test-kohorte-synthetik-be-013","test-kohorte-synthetik-be-014","test-kohorte-synthetik-be-015","test-kohorte-synthetik-be-016","test-kohorte-synthetik-be-017","test-kohorte-synthetik-be-018","test-kohorte-synthetik-be-019","test-kohorte-synthetik-be-020","test-kohorte-synthetik-be-021","test-kohorte-synthetik-be-022","test-kohorte-synthetik-be-023","test-kohorte-synthetik-be-024","test-kohorte-synthetik-be-025","test-kohorte-synthetik-be-026","test-kohorte-synthetik-be-027","test-kohorte-synthetik-be-028","test-kohorte-synthetik-be-029","test-kohorte-synthetik-be-030","test-kohorte-synthetik-be-031","test-kohorte-synthetik-be-032","test-kohorte-synthetik-be-033","test-kohorte-synthetik-be-034","test-kohorte-synthetik-be-035","test-kohorte-synthetik-be-036","test-kohorte-synthetik-be-037","test-kohorte-synthetik-be-038","test-kohorte-synthetik-be-039","test-kohorte-synthetik-be-040","test-kohorte-synthetik-be-041","test-kohorte-synthetik-be-042","test-kohorte-synthetik-be-043","test-kohorte-synthetik-be-044","test-kohorte-synthetik-be-045","test-kohorte-synthetik-be-046","test-kohorte-synthetik-be-047","test-kohorte-synthetik-be-048","test-kohorte-synthetik-be-049","test-kohorte-synthetik-be-050","test-kohorte-synthetik-be-051","test-kohorte-synthetik-be-052","test-kohorte-synthetik-be-053","test-kohorte-synthetik-be-054","test-kohorte-synthetik-be-055","test-kohorte-synthetik-be-056","test-kohorte-synthetik-be-057","test-kohorte-synthetik-be-058","test-kohorte-synthetik-be-059","test-kohorte-synthetik-be-060","test-kohorte-synthetik-be-061","test-kohorte-synthetik-be-062","test-kohorte-synthetik-be-063","test-kohorte-synthetik-be-064","test-kohorte-synthetik-be-065","test-kohorte-synthetik-be-066","test-kohorte-synthetik-be-067","test-kohorte-synthetik-be-068","test-kohorte-synthetik-be-069","test-kohorte-synthetik-be-070","test-kohorte-synthetik-be-071","test-kohorte-synthetik-be-072","test-kohorte-synthetik-be-073","test-kohorte-synthetik-be-074","test-kohorte-synthetik-be-075","test-kohorte-synthetik-be-076","test-kohorte-synthetik-be-077","test-kohorte-synthetik-be-078","test-kohorte-synthetik-be-079","test-kohorte-synthetik-be-080","test-kohorte-synthetik-be-081","test-kohorte-synthetik-be-082","test-kohorte-synthetik-be-083","test-kohorte-synthetik-be-084","test-kohorte-synthetik-be-085","test-kohorte-synthetik-be-086","test-kohorte-synthetik-be-087","test-kohorte-synthetik-be-088","test-kohorte-synthetik-be-089","test-kohorte-synthetik-be-090","test-kohorte-synthetik-be-091","test-kohorte-synthetik-be-092","test-kohorte-synthetik-be-093","test-kohorte-synthetik-be-094","test-kohorte-synthetik-be-095","test-kohorte-synthetik-be-096","test-kohorte-synthetik-be-097","test-kohorte-synthetik-be-098","test-kohorte-synthetik-be-099","test-kohorte-synthetik-be-100","test-kohorte-synthetik-be-101","test-kohorte-synthetik-be-102","test-kohorte-synthetik-be-103","test-kohorte-synthetik-be-104","test-kohorte-synthetik-be-105","test-kohorte-synthetik-be-106","test-kohorte-synthetik-be-107","test-kohorte-synthetik-be-108","test-kohorte-synthetik-be-109","test-kohorte-synthetik-be-110","test-kohorte-synthetik-be-111","test-kohorte-synthetik-be-112","test-kohorte-synthetik-be-113","test-kohorte-synthetik-be-114","test-kohorte-synthetik-be-115","test-kohorte-synthetik-be-116","test-kohorte-synthetik-be-117","test-kohorte-synthetik-be-118","test-kohorte-synthetik-be-119","test-kohorte-synthetik-be-120","test-kohorte-synthetik-bt-001","test-kohorte-synthetik-bt-002","test-kohorte-synthetik-bt-003","test-kohorte-synthetik-bt-004","test-kohorte-synthetik-bt-005","test-kohorte-synthetik-bt-006","test-kohorte-synthetik-bt-007","test-kohorte-synthetik-bt-008","test-kohorte-synthetik-bt-009","test-kohorte-synthetik-bt-010","test-kohorte-synthetik-bt-011","test-kohorte-synthetik-bt-012","test-kohorte-synthetik-bt-013","test-kohorte-synthetik-bt-014","test-kohorte-synthetik-bt-015","test-kohorte-synthetik-bt-016","test-kohorte-synthetik-bt-017","test-kohorte-synthetik-bt-018","test-kohorte-synthetik-bt-019","test-kohorte-synthetik-bt-020","test-kohorte-synthetik-bt-021","test-kohorte-synthetik-bt-022","test-kohorte-synthetik-bt-023","test-kohorte-synthetik-bt-024","test-kohorte-synthetik-bt-025","test-kohorte-synthetik-bt-026","test-kohorte-synthetik-bt-027","test-kohorte-synthetik-bt-028","test-kohorte-synthetik-bt-029","test-kohorte-synthetik-bt-030","test-kohorte-synthetik-bt-031","test-kohorte-synthetik-bt-032","test-kohorte-synthetik-bt-033","test-kohorte-synthetik-bt-034","test-kohorte-synthetik-bt-035","test-kohorte-synthetik-bt-036","test-kohorte-synthetik-bt-037","test-kohorte-synthetik-bt-038","test-kohorte-synthetik-bt-039","test-kohorte-synthetik-bt-040","test-kohorte-synthetik-bt-041","test-kohorte-synthetik-bt-042","test-kohorte-synthetik-bt-043","test-kohorte-synthetik-bt-044","test-kohorte-synthetik-bt-045","test-kohorte-synthetik-bt-046","test-kohorte-synthetik-bt-047","test-kohorte-synthetik-bt-048","test-kohorte-synthetik-bt-049","test-kohorte-synthetik-bt-050","test-kohorte-synthetik-bt-051","test-kohorte-synthetik-bt-052","test-kohorte-synthetik-bt-053","test-kohorte-synthetik-bt-054","test-kohorte-synthetik-bt-055","test-kohorte-synthetik-bt-056","test-kohorte-synthetik-bt-057","test-kohorte-synthetik-bt-058","test-kohorte-synthetik-bt-059","test-kohorte-synthetik-bt-060","test-kohorte-synthetik-bt-061","test-kohorte-synthetik-bt-062","test-kohorte-synthetik-bt-063","test-kohorte-synthetik-bt-064","test-kohorte-synthetik-bt-065","test-kohorte-synthetik-bt-066","test-kohorte-synthetik-bt-067","test-kohorte-synthetik-bt-068","test-kohorte-synthetik-bt-069","test-kohorte-synthetik-bt-070","test-kohorte-synthetik-bt-071","test-kohorte-synthetik-bt-072","test-kohorte-synthetik-bt-073","test-kohorte-synthetik-bt-074","test-kohorte-synthetik-bt-075","test-kohorte-synthetik-bt-076","test-kohorte-synthetik-bt-077","test-kohorte-synthetik-bt-078","test-kohorte-synthetik-bt-079","test-kohorte-synthetik-bt-080","test-kohorte-synthetik-bt-081","test-kohorte-synthetik-bt-082","test-kohorte-synthetik-bt-083","test-kohorte-synthetik-bt-084","test-kohorte-synthetik-bt-085","test-kohorte-synthetik-bt-086","test-kohorte-synthetik-bt-087","test-kohorte-synthetik-bt-088","test-kohorte-synthetik-bt-089","test-kohorte-synthetik-bt-090","test-kohorte-synthetik-bt-091","test-kohorte-synthetik-bt-092","test-kohorte-synthetik-bt-093","test-kohorte-synthetik-bt-094","test-kohorte-synthetik-bt-095","test-kohorte-synthetik-bt-096","test-kohorte-synthetik-bt-097","test-kohorte-synthetik-bt-098","test-kohorte-synthetik-bt-099","test-kohorte-synthetik-bt-100","test-kohorte-synthetik-bt-101","test-kohorte-synthetik-bt-102","test-kohorte-synthetik-bt-103","test-kohorte-synthetik-bt-104","test-kohorte-synthetik-bt-105","test-kohorte-synthetik-bt-106","test-kohorte-synthetik-bt-107","test-kohorte-synthetik-bt-108","test-kohorte-synthetik-bt-109","test-kohorte-synthetik-bt-110","test-kohorte-synthetik-bt-111","test-kohorte-synthetik-bt-112","test-kohorte-synthetik-bt-113","test-kohorte-synthetik-bt-114","test-kohorte-synthetik-bt-115","test-kohorte-synthetik-bt-116","test-kohorte-synthetik-bt-117","test-kohorte-synthetik-bt-118","test-kohorte-synthetik-bt-119","test-kohorte-synthetik-bt-120","test-kohorte-synthetik-bt-121","test-kohorte-synthetik-bt-122","test-kohorte-synthetik-bt-123","test-kohorte-synthetik-bt-124","test-kohorte-synthetik-bt-125","test-kohorte-synthetik-bt-126","test-kohorte-synthetik-bt-127","test-kohorte-synthetik-bt-128","test-kohorte-synthetik-bt-129","test-kohorte-synthetik-bt-130","test-kohorte-synthetik-bt-131","test-kohorte-synthetik-bt-132","test-kohorte-synthetik-bt-133","test-kohorte-synthetik-bt-134","test-kohorte-synthetik-bt-135","test-kohorte-synthetik-bt-136","test-kohorte-synthetik-bt-137","test-kohorte-synthetik-bt-138","test-kohorte-synthetik-bt-139","test-kohorte-synthetik-bt-140","test-kohorte-synthetik-bt-141","test-kohorte-synthetik-bt-142","test-kohorte-synthetik-bt-143","test-kohorte-synthetik-bt-144","test-kohorte-synthetik-bt-145","test-kohorte-synthetik-bt-146","test-kohorte-synthetik-bt-147","test-kohorte-synthetik-bt-148","test-kohorte-synthetik-bt-149","test-kohorte-synthetik-bt-150","test-kohorte-synthetik-bt-151","test-kohorte-synthetik-bt-152","test-kohorte-synthetik-bt-153","test-kohorte-synthetik-bt-154","test-kohorte-synthetik-bt-155","test-kohorte-synthetik-bt-156","test-kohorte-synthetik-bt-157","test-kohorte-synthetik-bt-158","test-kohorte-synthetik-bt-159","test-kohorte-synthetik-bt-160","test-kohorte-synthetik-bt-161","test-kohorte-synthetik-bt-162","test-kohorte-synthetik-bt-163","test-kohorte-synthetik-bt-164","test-kohorte-synthetik-bt-165","test-kohorte-synthetik-bt-166","test-kohorte-synthetik-bt-167","test-kohorte-synthetik-bt-168","test-kohorte-synthetik-bt-169","test-kohorte-synthetik-bt-170","test-kohorte-synthetik-bt-171","test-kohorte-synthetik-bt-172","test-kohorte-synthetik-bt-173","test-kohorte-synthetik-bt-174","test-kohorte-synthetik-bt-175","test-kohorte-synthetik-bt-176","test-kohorte-synthetik-bt-177","test-kohorte-synthetik-bt-178","test-kohorte-synthetik-bt-179","test-kohorte-synthetik-bt-180","test-kohorte-synthetik-bt-181","test-kohorte-synthetik-bt-182","test-kohorte-synthetik-bt-183","test-kohorte-synthetik-bt-184","test-kohorte-synthetik-bt-185","test-kohorte-synthetik-bt-186","test-kohorte-synthetik-bt-187","test-kohorte-synthetik-bt-188","test-kohorte-synthetik-bt-189","test-kohorte-synthetik-bt-190","test-kohorte-synthetik-bt-191","test-kohorte-synthetik-bt-192","test-kohorte-synthetik-bt-193","test-kohorte-synthetik-bt-194","test-kohorte-synthetik-bt-195","test-kohorte-synthetik-bt-196","test-kohorte-synthetik-bt-197","test-kohorte-synthetik-bt-198","test-kohorte-synthetik-bt-199","test-kohorte-synthetik-bt-200","test-kohorte-synthetik-bt-201","test-kohorte-synthetik-bt-202","test-kohorte-synthetik-bt-203","test-kohorte-synthetik-bt-204","test-kohorte-synthetik-bt-205","test-kohorte-synthetik-bt-206","test-kohorte-synthetik-bt-207","test-kohorte-synthetik-bt-208","test-kohorte-synthetik-bt-209","test-kohorte-synthetik-bt-210","test-kohorte-synthetik-bt-211","test-kohorte-synthetik-bt-212","test-kohorte-synthetik-bt-213","test-kohorte-synthetik-bt-214","test-kohorte-synthetik-bt-215","test-kohorte-synthetik-bt-216","test-kohorte-synthetik-bt-217","test-kohorte-synthetik-bt-218","test-kohorte-synthetik-bt-219","test-kohorte-synthetik-bt-220","test-kohorte-synthetik-bt-221","test-kohorte-synthetik-bt-222","test-kohorte-synthetik-bt-223","test-kohorte-synthetik-bt-224","test-kohorte-synthetik-bt-225","test-kohorte-synthetik-bt-226","test-kohorte-synthetik-bt-227","test-kohorte-synthetik-bt-228","test-kohorte-synthetik-bt-229","test-kohorte-synthetik-bt-230","test-kohorte-synthetik-bt-231","test-kohorte-synthetik-bt-232","test-kohorte-synthetik-bt-233","test-kohorte-synthetik-bt-234","test-kohorte-synthetik-bt-235","test-kohorte-synthetik-bt-236","test-kohorte-synthetik-bt-237","test-kohorte-synthetik-bt-238","test-kohorte-synthetik-bt-239","test-kohorte-synthetik-bt-240","test-kohorte-synthetik-bt-241","test-kohorte-synthetik-bt-242","test-kohorte-synthetik-bt-243","test-kohorte-synthetik-bt-244","test-kohorte-synthetik-bt-245","test-kohorte-synthetik-bt-246","test-kohorte-synthetik-bt-247","test-kohorte-synthetik-bt-248","test-kohorte-synthetik-bt-249","test-kohorte-synthetik-bt-250","test-kohorte-synthetik-bt-251","test-kohorte-synthetik-bt-252","test-kohorte-synthetik-bt-253","test-kohorte-synthetik-bt-254","test-kohorte-synthetik-bt-255","test-kohorte-synthetik-bt-256","test-kohorte-synthetik-bt-257","test-kohorte-synthetik-bt-258","test-kohorte-synthetik-bt-259","test-kohorte-synthetik-bt-260","test-kohorte-synthetik-bt-261","test-kohorte-synthetik-bt-262","test-kohorte-synthetik-bt-263","test-kohorte-synthetik-bt-264","test-kohorte-synthetik-bt-265","test-kohorte-synthetik-bt-266","test-kohorte-synthetik-bt-267","test-kohorte-synthetik-bt-268","test-kohorte-synthetik-bt-269","test-kohorte-synthetik-bt-270","test-kohorte-synthetik-bt-271","test-kohorte-synthetik-bt-272","test-kohorte-synthetik-bt-273","test-kohorte-synthetik-bt-274","test-kohorte-synthetik-bt-275","test-kohorte-synthetik-bt-276","test-kohorte-synthetik-bt-277","test-kohorte-synthetik-bt-278","test-kohorte-synthetik-bt-279","test-kohorte-synthetik-bt-280","test-kohorte-synthetik-bt-281","test-kohorte-synthetik-bt-282","test-kohorte-synthetik-bt-283","test-kohorte-synthetik-bt-284","test-kohorte-synthetik-bt-285","test-kohorte-synthetik-bt-286","test-kohorte-synthetik-bt-287","test-kohorte-synthetik-bt-288","test-kohorte-synthetik-bt-289","test-kohorte-synthetik-bt-290","test-kohorte-synthetik-bt-291","test-kohorte-synthetik-bt-292","test-kohorte-synthetik-bt-293","test-kohorte-synthetik-bt-294","test-kohorte-synthetik-bt-295","test-kohorte-synthetik-bt-296","test-kohorte-synthetik-bt-297","test-kohorte-synthetik-bt-298","test-kohorte-synthetik-bt-299","test-kohorte-synthetik-bt-300","test-kohorte-synthetik-bt-301","test-kohorte-synthetik-bt-302","test-kohorte-synthetik-bt-303","test-kohorte-synthetik-bt-304","test-kohorte-synthetik-bt-305","test-kohorte-synthetik-bt-306","test-kohorte-synthetik-bt-307","test-kohorte-synthetik-bt-308","test-kohorte-synthetik-bt-309","test-kohorte-synthetik-bt-310","test-kohorte-synthetik-bt-311","test-kohorte-synthetik-bt-312","test-kohorte-synthetik-bt-313","test-kohorte-synthetik-bt-314","test-kohorte-synthetik-bt-315","test-kohorte-synthetik-bt-316","test-kohorte-synthetik-bt-317","test-kohorte-synthetik-bt-318","test-kohorte-synthetik-bt-319","test-kohorte-synthetik-bt-320","test-kohorte-synthetik-bt-321","test-kohorte-synthetik-bt-322","test-kohorte-synthetik-bt-323","test-kohorte-synthetik-bt-324","test-kohorte-synthetik-bt-325","test-kohorte-synthetik-bt-326","test-kohorte-synthetik-bt-327","test-kohorte-synthetik-bt-328","test-kohorte-synthetik-bt-329","test-kohorte-synthetik-bt-330"]'::jsonb;
  fach jsonb;
  identitaeten jsonb;
  snapshot_mandate jsonb;
  snapshot_profiles jsonb;
  snapshot_fach jsonb;
  snapshot_fremd jsonb;
  erwartet_null jsonb;
  n integer;
begin
  if p_operation_id is null or p_operation_id !~ '^synthetik500-[a-zA-Z0-9_-]{8,100}$'
    or p_manifest_hash is null or p_manifest_hash !~ '^[a-f0-9]{64}$'
    or p_production_commit is null or p_production_commit !~ '^[a-f0-9]{40}$' then
    raise exception 'synthetik500-runtime-auftrag';
  end if;
  select data into e from public.helmut_store where id='synthetik500-runtime-'||p_operation_id;
  if jsonb_typeof(e) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(e)) <> 12
    or e-array['version','operationId','manifest','manifestHash','manifestSqlHash','snapshot','snapshotSqlHash',
      'quittung','quittungSqlHash','startbelege','startbelegeSqlHash','zustand'] is distinct from '{}'::jsonb
    or e->>'version' is distinct from 'helmut-synthetik500-runtime/1'
    or e->>'operationId' is distinct from p_operation_id
    or e->>'manifestHash' is distinct from p_manifest_hash then
    raise exception 'synthetik500-runtime-envelope';
  end if;
  runtime_manifest := e->'manifest';
  m := runtime_manifest->'profilvertrag'; s := e->'snapshot'; q := e->'quittung'; b := e->'startbelege';
  if jsonb_typeof(runtime_manifest) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(runtime_manifest)) <> 4
    or runtime_manifest-array['version','profilManifestHash','profilvertrag','startbelegeGrundlinie'] is distinct from '{}'::jsonb
    or runtime_manifest->>'version' is distinct from 'helmut-synthetik500-runtime-manifest/1'
    or runtime_manifest->'startbelegeGrundlinie' is distinct from b->'grundlinie'
    or jsonb_typeof(m) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(m)) <> 15
    or m-array['version','operationId','paketHash','idsHash','profileHash','erwartungenHash','ids','verteilung','profilnullzustand',
      'vorflugAm','startBis','endeAm','kosten','zustand','offen'] is distinct from '{}'::jsonb
    or m->>'version' is distinct from 'helmut-synthetik-500/1'
    or m->>'operationId' is distinct from p_operation_id
    or not coalesce(((m->>'paketHash'='aa79ae64ab76bb96b3190eea1352366cffe2d448d4c28d5407da480096d52cc5' and m->>'profileHash'='70193520ed3491a2c5a73a0c88ac2a69ea3b0dcb4541e7bccb2b30a2b9b15a83' and m->>'erwartungenHash'='4ff6511571b53564752e9a65cf854bc6a53b9f4c9cf42ab158b23e78cc3b7e9d') or (m->>'paketHash'='f107226f41d64f42172ca585a306355be6bf9e2c76d2ddbb94b85762c3e7fd12' and m->>'profileHash'='128a3fd5a3e337517ad27d676e9872b4ba7667dcc6507b1fccc2cc57fa2d857a' and m->>'erwartungenHash'='f7f17f5c568833a86b8e6f4348a0e5e1b1bfcd6cf5fd1cf5323abd3aea6cdf46')),false)
    or m->>'idsHash' is distinct from '4d6d7b169831128cc69f0f3beb04c2fe05b57b7b4f528934b52e5c155f54e258'
    or m->'ids' is distinct from ids
    or m->'verteilung' is distinct from '{"bundestag":330,"landtag-berlin":120,"landtag-brandenburg":50}'::jsonb
    or m->'kosten'->>'tageslimitMikroUsd' is distinct from '6000000'
    or m->'kosten'->>'auftragslimitMikroUsd' is distinct from '7000000'
    or m->>'zustand' is distinct from 'inaktiv-vorbereitung'
    or runtime_manifest->>'profilManifestHash' is distinct from encode(sha256(convert_to(helmut_synthetik500_internal.json_compact(m),'UTF8')),'hex')
    or e->>'manifestSqlHash' is distinct from encode(sha256(convert_to(runtime_manifest::text,'UTF8')),'hex')
    or p_manifest_hash is distinct from encode(sha256(convert_to(helmut_synthetik500_internal.json_compact(runtime_manifest),'UTF8')),'hex')
    or e->>'snapshotSqlHash' is distinct from encode(sha256(convert_to(s::text,'UTF8')),'hex')
    or e->>'startbelegeSqlHash' is distinct from encode(sha256(convert_to(b::text,'UTF8')),'hex') then
    raise exception 'synthetik500-runtime-hash-bindung';
  end if;
  if jsonb_typeof(s) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(s)) <> 3
    or s-array['beobachtetAm','mandate_profiles','profiles'] is distinct from '{}'::jsonb
    or jsonb_typeof(s->'mandate_profiles') is distinct from 'array'
    or jsonb_typeof(s->'profiles') is distinct from 'array'
    or jsonb_array_length(s->'mandate_profiles') <> 500 or jsonb_array_length(s->'profiles') <> 501
    or exists(select 1 from jsonb_array_elements(s->'mandate_profiles') x(v)
      where v->'aktiv' is distinct from 'false'::jsonb or v->'geloescht_at' is distinct from 'null'::jsonb)
    or (select jsonb_agg(v->>'user_id' order by v->>'user_id' collate "C")
      from jsonb_array_elements(s->'mandate_profiles') x(v)) is distinct from ids
    or (select count(distinct v->>'id') from jsonb_array_elements(s->'profiles') x(v)) <> 501
    or not coalesce((s->>'beobachtetAm')::timestamptz <= (m->>'vorflugAm')::timestamptz
      and (m->>'vorflugAm')::timestamptz-(s->>'beobachtetAm')::timestamptz <= interval '1 minute'
      and (m->>'startBis')::timestamptz > (m->>'vorflugAm')::timestamptz
      and (m->>'startBis')::timestamptz-(m->>'vorflugAm')::timestamptz <= interval '5 minutes'
      and (m->>'endeAm')::timestamptz > (m->>'startBis')::timestamptz
      and (m->>'endeAm')::timestamptz-(m->>'vorflugAm')::timestamptz <= interval '4 hours'
      and left(m->>'vorflugAm',10)=left(m->>'endeAm',10),false) then
    raise exception 'synthetik500-runtime-nullbestand-zeit';
  end if;
  if not exists(select 1 from public.helmut_store j
    where j.id='synthetik500-import-'||(j.data->>'operationId')
      and j.data->>'version'='helmut-synthetik500-import/1'
      and j.data->>'zustand'='inaktiv-importiert'
      and j.data->>'paketHash'=m->>'paketHash' and j.data->>'idsHash'=m->>'idsHash'
      and j.data->>'profileHash'=m->>'profileHash' and j.data->>'erwartungenHash'=m->>'erwartungenHash'
      and j.data->'aktiv'='0'::jsonb and j.data->'mandate'='500'::jsonb and j.data->'profile'='500'::jsonb
      and j.data->'mandate_profiles'=(select jsonb_agg(v order by v->>'user_id' collate "C")
        from jsonb_array_elements(s->'mandate_profiles') x(v))
      and j.data->'profiles'=(select jsonb_agg(v order by v->>'id' collate "C")
        from jsonb_array_elements(s->'profiles') x(v)
        where v->>'id' in(select jsonb_array_elements_text(ids)))) then
    raise exception 'synthetik500-runtime-importquittung-bindung';
  end if;
  if jsonb_typeof(b) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(b)) <> 6
    or b-array['version','grundlinie','technikvertrag','fachfreigabe','aktivierungsGo','endwaechterBereit'] is distinct from '{}'::jsonb
    or b->>'version' is distinct from 'helmut-synthetik500-startbelege/1'
    or jsonb_typeof(b->'grundlinie') is distinct from 'object'
    or (select count(*) from jsonb_object_keys(b->'grundlinie'))<>12
    or (b->'grundlinie')-array['belegHash','technikHash','fachHash','productionHash','ruheHash','kostenHash',
      'landesversorgungHash','snapshotHash','authHash','mainHash','productionCommit','deploymentId'] is distinct from '{}'::jsonb
    or b->'grundlinie'->>'productionCommit' is distinct from p_production_commit
    or b->'grundlinie'->>'deploymentId' is null or b->'grundlinie'->>'deploymentId' !~ '^dpl_[a-zA-Z0-9]+$'
    or exists(select 1 from unnest(array['belegHash','technikHash','fachHash','productionHash','ruheHash','kostenHash',
      'landesversorgungHash','snapshotHash','authHash','mainHash']) k
      where b->'grundlinie'->>k is null or b->'grundlinie'->>k !~ '^[a-f0-9]{64}$')
    or b->'grundlinie'->>'snapshotHash' is distinct from encode(sha256(convert_to(helmut_synthetik500_internal.json_compact(s),'UTF8')),'hex')
    or b->'technikvertrag'->'qualifiziert' is distinct from 'true'::jsonb
    or exists(select 1 from unnest(array['technikvertrag','fachfreigabe']) k
      where b->k->'freigegeben' is distinct from 'true'::jsonb
        or b->k->>'paketHash' is distinct from m->>'paketHash'
        or b->k->>'idsHash' is distinct from m->>'idsHash'
        or b->k->>'belegHash' is distinct from b->'grundlinie'->>
          (case when k='technikvertrag' then 'technikHash' else 'fachHash' end)) then
    raise exception 'synthetik500-runtime-startbelege';
  end if;
  select jsonb_agg(v order by v->>'user_id' collate "C"),
    jsonb_agg(v-'aktiv'-'updated_at' order by v->>'user_id' collate "C")
    into snapshot_mandate,snapshot_fach from jsonb_array_elements(s->'mandate_profiles') x(v);
  select jsonb_agg(v order by v->>'id' collate "C") into snapshot_profiles from jsonb_array_elements(s->'profiles') x(v);
  select jsonb_agg(v order by v->>'id' collate "C") into snapshot_fremd from jsonb_array_elements(s->'profiles') x(v)
    where v->>'id' not in(select jsonb_array_elements_text(ids));
  if jsonb_array_length(snapshot_fremd) is distinct from 1 then raise exception 'synthetik500-runtime-fremdprofilbindung'; end if;
  erwartet_null := jsonb_build_object('beobachtetAm',s->>'beobachtetAm',
    'mandateHash',encode(sha256(convert_to(helmut_synthetik500_internal.json_compact(snapshot_mandate),'UTF8')),'hex'),
    'mandateFachHash',encode(sha256(convert_to(helmut_synthetik500_internal.json_compact(snapshot_fach),'UTF8')),'hex'),
    'profilesHash',encode(sha256(convert_to(helmut_synthetik500_internal.json_compact(snapshot_profiles),'UTF8')),'hex'),
    'fremdId',snapshot_fremd->0->>'id',
    'fremdHash',encode(sha256(convert_to(helmut_synthetik500_internal.json_compact(snapshot_fremd),'UTF8')),'hex'),
    'mandate',500,'profiles',501,'aktiv',0);
  if m->'profilnullzustand' is distinct from erwartet_null then raise exception 'synthetik500-runtime-snapshot-manifestbindung'; end if;
  select jsonb_agg(to_jsonb(p)-'aktiv'-'updated_at' order by user_id collate "C") into fach from public.mandate_profiles p;
  select jsonb_agg(to_jsonb(p) order by id collate "C") into identitaeten from public.profiles p;
  if (select count(*) from public.mandate_profiles) <> 500 or (select count(*) from public.profiles) <> 501
    or (select jsonb_agg(user_id order by user_id collate "C") from public.mandate_profiles) is distinct from ids
    or exists(select 1 from public.mandate_profiles where aktiv is null or geloescht_at is not null)
    or fach is distinct from (select jsonb_agg(v-'aktiv'-'updated_at' order by v->>'user_id' collate "C")
      from jsonb_array_elements(s->'mandate_profiles') x(v))
    or identitaeten is distinct from (select jsonb_agg(v order by v->>'id' collate "C") from jsonb_array_elements(s->'profiles') x(v)) then
    raise exception 'synthetik500-runtime-fremd-fachbestand';
  end if;
  select count(*) into n from public.mandate_profiles where aktiv;
  if e->>'zustand'='vorbereitet' then
    if q is distinct from 'null'::jsonb or e->'quittungSqlHash' is distinct from 'null'::jsonb or n<>0
      or (m->>'endeAm')::timestamptz-(m->>'vorflugAm')::timestamptz>interval '4 hours' then
      raise exception 'synthetik500-runtime-vorbereitet';
    end if;
    return e;
  end if;
  if e->>'zustand' is null or e->>'zustand' not in ('aktiv','beendet')
    or q->>'zustand' is distinct from e->>'zustand'
    or q->>'version' is distinct from 'helmut-synthetik-500/1'
    or q->>'operationId' is distinct from p_operation_id
    or q->'manifest' is distinct from m or q->'bestaetigtAktiv' is distinct from '500'::jsonb
    or e->>'quittungSqlHash' is distinct from encode(sha256(convert_to(q::text,'UTF8')),'hex')
    or b->'aktivierungsGo'->'freigegeben' is distinct from 'true'::jsonb
    or b->'aktivierungsGo'->>'operationId' is distinct from p_operation_id
    or b->'aktivierungsGo'->>'manifestHash' is distinct from p_manifest_hash
    or b->'aktivierungsGo'->>'belegHash' is null or b->'aktivierungsGo'->>'belegHash' !~ '^[a-f0-9]{64}$'
    or b->'endwaechterBereit'->'bereit' is distinct from 'true'::jsonb
    or b->'endwaechterBereit'->>'operationId' is distinct from p_operation_id
    or b->'endwaechterBereit'->>'manifestHash' is distinct from p_manifest_hash
    or b->'endwaechterBereit'->>'productionCommit' is distinct from p_production_commit
    or not coalesce((q->>'aktiviertAm')::timestamptz >= (m->>'vorflugAm')::timestamptz
      and (q->>'aktiviertAm')::timestamptz < (m->>'startBis')::timestamptz,false) then
    raise exception 'synthetik500-runtime-quittung';
  end if;
  if e->>'zustand'='aktiv' then
    if (select count(*) from jsonb_object_keys(q))<>6
      or q-array['version','operationId','manifest','zustand','aktiviertAm','bestaetigtAktiv'] is distinct from '{}'::jsonb then
      raise exception 'synthetik500-runtime-aktivquittung';
    end if;
  else
    if n<>0 or (select count(*) from jsonb_object_keys(q))<>9
      or q-array['version','operationId','manifest','zustand','aktiviertAm','bestaetigtAktiv','beendetAm','deaktiviert','endgrund'] is distinct from '{}'::jsonb
      or jsonb_typeof(q->'deaktiviert') is distinct from 'number'
      or (q->>'deaktiviert')::integer<0 or (q->>'deaktiviert')::integer>500
      or q->>'endgrund' is null or q->>'endgrund' not in ('frist','notstopp')
      or not coalesce((q->>'beendetAm')::timestamptz >= (q->>'aktiviertAm')::timestamptz,false) then
      raise exception 'synthetik500-runtime-endquittung-reaktivierung';
    end if;
  end if;
  return e;
end $pruefe$;

create function helmut_synthetik500_internal.status(e jsonb,n integer) returns jsonb
language sql volatile security invoker set search_path=pg_catalog as $status$
  select jsonb_build_object('version','helmut-synthetik500-status/1','operationId',e->>'operationId',
    'manifestHash',e->>'manifestHash','profilManifestHash',e->'manifest'->>'profilManifestHash',
    'productionCommit',e->'startbelege'->'grundlinie'->>'productionCommit',
    'paketHash',e->'manifest'->'profilvertrag'->>'paketHash','idsHash',e->'manifest'->'profilvertrag'->>'idsHash',
    'beobachtetAm',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'zustand',e->>'zustand','gesamt',500,'identitaeten',501,'aktiv',n,
    'fremdUnveraendert',true,'fachfelderUnveraendert',true,'quittungBindungBestaetigt',true,'endeAm',e->'manifest'->'profilvertrag'->>'endeAm');
$status$;

create function public.helmut_synthetik500_lesung(p_operation_id text,p_manifest_hash text,p_production_commit text)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog
set lock_timeout='3s' set statement_timeout='15s' as $lesung$
declare e jsonb; n integer;
begin
  e := helmut_synthetik500_internal.pruefe(p_operation_id,p_manifest_hash,p_production_commit);
  select count(*) into n from public.mandate_profiles where aktiv;
  return helmut_synthetik500_internal.status(e,n);
end $lesung$;

create function public.helmut_synthetik500_ende(p_operation_id text,p_manifest_hash text,p_production_commit text,p_grund text,p_bestaetigung text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog
set lock_timeout='3s' set statement_timeout='15s' as $ende$
declare e jsonb; nach jsonb; q jsonb; n integer; vor_auth jsonb; vor_main jsonb;
begin
  if p_bestaetigung is distinct from 'GEBUNDENE_SYNTHETIK500_NUR_DEAKTIVIEREN'
    or p_grund is null or p_grund not in ('frist','notstopp') then raise exception 'synthetik500-runtime-endauftrag'; end if;
  lock table public.mandate_profiles,public.profiles,public.helmut_store in share row exclusive mode;
  e := helmut_synthetik500_internal.pruefe(p_operation_id,p_manifest_hash,p_production_commit);
  if e->>'zustand'='beendet' then return helmut_synthetik500_internal.status(e,0); end if;
  if e->>'zustand' is distinct from 'aktiv' then raise exception 'synthetik500-runtime-keine-aktivquittung'; end if;
  if clock_timestamp() < (e->'quittung'->>'aktiviertAm')::timestamptz
    or (p_grund='frist' and clock_timestamp() < (e->'manifest'->'profilvertrag'->>'endeAm')::timestamptz) then
    raise exception 'synthetik500-runtime-endzeit';
  end if;
  select data into vor_auth from public.helmut_store where id='main-auth';
  select data into vor_main from public.helmut_store where id='main';
  update public.mandate_profiles set aktiv=false
    where user_id in(select jsonb_array_elements_text(e->'manifest'->'profilvertrag'->'ids')) and aktiv=true;
  get diagnostics n=row_count;
  if n<0 or n>500 or exists(select 1 from public.mandate_profiles where aktiv)
    or vor_auth is distinct from (select data from public.helmut_store where id='main-auth')
    or vor_main is distinct from (select data from public.helmut_store where id='main') then
    raise exception 'synthetik500-runtime-endnachkontrolle';
  end if;
  q := e->'quittung'||jsonb_build_object('zustand','beendet',
    'beendetAm',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'deaktiviert',n,'endgrund',p_grund);
  nach := e||jsonb_build_object('zustand','beendet','quittung',q,
    'quittungSqlHash',encode(sha256(convert_to(q::text,'UTF8')),'hex'));
  update public.helmut_store set data=nach where id='synthetik500-runtime-'||p_operation_id and data=e;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'synthetik500-runtime-end-cas'; end if;
  -- VOLATILE-Endfunktion: erneute interne Pruefung sieht eigene Transaktion.
  perform helmut_synthetik500_internal.pruefe(p_operation_id,p_manifest_hash,p_production_commit);
  if vor_auth is distinct from (select data from public.helmut_store where id='main-auth')
    or vor_main is distinct from (select data from public.helmut_store where id='main') then
    raise exception 'synthetik500-runtime-auth-main-veraendert';
  end if;
  return helmut_synthetik500_internal.status(nach,0);
end $ende$;

revoke all on all functions in schema helmut_synthetik500_internal from public;
revoke all on function public.helmut_synthetik500_lesung(text,text,text) from public;
revoke all on function public.helmut_synthetik500_ende(text,text,text,text,text) from public;
do $rechte$
begin
  if exists(select 1 from pg_roles where rolname='anon') then
    revoke all on schema helmut_synthetik500_internal from anon;
    revoke all on all functions in schema helmut_synthetik500_internal from anon;
    revoke all on function public.helmut_synthetik500_lesung(text,text,text) from anon;
    revoke all on function public.helmut_synthetik500_ende(text,text,text,text,text) from anon;
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    revoke all on schema helmut_synthetik500_internal from authenticated;
    revoke all on all functions in schema helmut_synthetik500_internal from authenticated;
    revoke all on function public.helmut_synthetik500_lesung(text,text,text) from authenticated;
    revoke all on function public.helmut_synthetik500_ende(text,text,text,text,text) from authenticated;
  end if;
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant usage on schema helmut_synthetik500_internal to service_role;
    grant execute on all functions in schema helmut_synthetik500_internal to service_role;
    grant execute on function public.helmut_synthetik500_lesung(text,text,text) to service_role;
    grant execute on function public.helmut_synthetik500_ende(text,text,text,text,text) to service_role;
  end if;
end $rechte$;
notify pgrst,'reload schema';
commit;
