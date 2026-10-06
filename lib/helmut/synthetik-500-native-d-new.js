"use strict";
// NEW inert SQL proposal. Never applied by storage, server startup or migration
// tooling. Original private installers remain missing historical evidence.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const sourcePath = path.join(__dirname, "sql/native-d-new-v1.sql");
const source = () => fs.readFileSync(sourcePath, "utf8");
const sourceHash = () => crypto.createHash("sha256").update(source(), "utf8").digest("hex");
function rollback(contractHash) {
  if (typeof contractHash !== "string" || !/^[a-f0-9]{64}$/.test(contractHash)) throw Error("native-D-private-rollback-hash");
  // Retained evidence is never deleted by rollback. A nonempty store requires
  // another explicit retention decision; budget/Auth/profile state is untouched.
  return `-- NEW private rollback; preserve retained evidence; no CAS bypass.\nbegin;
set local statement_timeout='15s';set local transaction_timeout='17s';set local lock_timeout='2s';
lock table helmut_native_d_new_v1.versions in access exclusive mode;
do $rollback$ begin
 if helmut_native_d_new_v1.fingerprint() is distinct from '${contractHash}' then raise exception 'native-D-rollback-catalog-drift';end if;
 if exists(select from helmut_native_d_new_v1.versions) then raise exception 'native-D-rollback-retained-evidence';end if;
end $rollback$;
drop function public.helmut_immutable_d_contract_v1(text);
drop function public.helmut_store_immutable_d_v1(text,text,text,text,text,text,text,text,text);
drop function public.helmut_read_immutable_d_v1(text,text,text,text);
drop trigger retained_version on helmut_native_d_new_v1.versions;
drop table helmut_native_d_new_v1.versions;
drop function helmut_native_d_new_v1.reject_mutation();
drop function helmut_native_d_new_v1.check_contract(text);
drop function helmut_native_d_new_v1.fingerprint();
drop schema helmut_native_d_new_v1;
commit;\n`;
}
module.exports = { source, sourceHash, rollback };
