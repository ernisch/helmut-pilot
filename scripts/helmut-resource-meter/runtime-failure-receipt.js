"use strict";
const crypto = require("node:crypto");
const SQL = new Set(["P0001","57014","42501","40001","40P01","23505"]);
const MSG = new Set(["synthetik500-production-stopped-or-unknown","synthetik500-dispatch-EU-unit-deadline","Schreiben des Kontenspeichers wurde nicht eindeutig bestaetigt","synthetik500-content-preparation-deadline","AUTH_CONTROL_DATABASE_REQUIRED","ATOMIC_USAGE_DATABASE_REQUIRED"]);
const NAMES = new Set(["Error","TypeError","RangeError","ReferenceError","SyntaxError","URIError","EvalError","AggregateError"]);
const BAD = {};
const RED = Object.freeze({name:null,code:null,message:null,messageSHA256:null});
const obj = v => v !== null && (typeof v === "object" || typeof v === "function");
function desc(o,k){ if(!obj(o)) return undefined; try { return Object.getOwnPropertyDescriptor(o,k); } catch { return BAD; } }
const own = (o,k) => { const d = desc(o,k); return d && d !== BAD && "value" in d ? d.value : undefined; };
function inherited(o){ if(!obj(o)) return null; let p; try { p = Object.getPrototypeOf(o); } catch { return null; } for(let depth=0; p && p !== Object.prototype && depth<8; depth++){ const d = desc(p,"name"); if(d){ if(d === BAD || !("value" in d) || typeof d.value !== "string" || !NAMES.has(d.value)) return null; return d.value; } try { p = Object.getPrototypeOf(p); } catch { return null; } } return null; }
function nameOf(o){ if(!obj(o)) return null; const d = desc(o,"name"); if(d) return d !== BAD && "value" in d && typeof d.value === "string" && NAMES.has(d.value) ? d.value : null; return inherited(o); }
function topName(o){ if(!obj(o)) return null; const d = desc(o,"name"); if(d) return d !== BAD && "value" in d && typeof d.value === "string" ? d.value || null : null; return inherited(o); }
const sha = s => typeof s === "string" ? crypto.createHash("sha256").update(s,"utf8").digest("hex") : null;
function entry(c){ const m = own(c,"message"); const code = own(c,"code"); return {name:nameOf(c), code:typeof code === "string" && SQL.has(code) ? code : null, message:typeof m === "string" && MSG.has(m) ? m : null, messageSHA256:sha(m)}; }
function failure(error){
  const m = own(error,"message");
  const out = {name:topName(error), code:own(error,"code") || null, message:String(typeof m === "string" ? m || "unknown" : "unknown").slice(0,240)};
  const trail = []; out.cause = trail; let truncated = false;
  const seen = new Set(); let cur = error; if(obj(cur)) seen.add(cur);
  for(let i=0;i<4;i++){
    if(!obj(cur)) break;
    const d = desc(cur,"cause");
    if(!d) break;
    if(d === BAD || !("value" in d)){ truncated = true; break; }
    const c = d.value;
    if(c == null) break;
    if(!obj(c)){ trail.push(RED); break; }
    if(seen.has(c)){ truncated = true; break; }
    seen.add(c); trail.push(entry(c)); cur = c;
  }
  if(trail.length === 4 && obj(cur)){
    const d = desc(cur,"cause");
    if(d === BAD || (d && (!("value" in d) || d.value != null))) truncated = true;
  }
  out.causeTruncated = truncated;
  return out;
}
module.exports = { failure };
