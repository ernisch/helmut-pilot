"use strict";

const T = require("../lib/helmut/testkohorte-testende");
const { fordere, DirektAbbruch } = require("../lib/helmut/testkohorte-direkt500");
const { pruefe: konfiguration } = require("./github-laufzeitpruefung");
const { PROJECT_URL } = require("./github-fachzyklus-a");

async function ausfuehren({ scharf = false, env = process.env, fetchFn = global.fetch,
  deaktiviere = null } = {}) {
  let restore = null;
  try {
    fordere(env.GITHUB_REPOSITORY === "ernisch/helmut-pilot" && env.GITHUB_REF === "refs/heads/main"
      && env.GITHUB_EVENT_NAME === "workflow_dispatch", "testende-nur-manuell-auf-main");
    fordere(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || "") && env.HELMUT_PRODUCTION_COMMIT === env.GITHUB_SHA,
      "testende-production-kopf-fehlt");
    fordere(String(env.SUPABASE_URL || "").replace(/\/$/, "") === PROJECT_URL
      && env.SUPABASE_SERVICE_ROLE_KEY && env.HELMUT_CRON_SECRET, "testende-zugang-fehlt");
    if (scharf) fordere(env.HELMUT_TESTKOHORTE_EXECUTE === "1"
      && env.HELMUT_TESTKOHORTE_CONFIRM === T.CONFIRM, "testende-freigabe-fehlt");
    const config = await konfiguration({ env, fetchFn });
    fordere(config.ok && config.storageSupabase && config.v3Bereit && config.profileRelational
      && config.profileExclusive && config.retentionGueltig && config.retention === 36,
    "testende-speicherpfad-nicht-bestaetigt");
    async function db(tail) {
      const r = await fetchFn(PROJECT_URL + "/rest/v1/" + tail, { method: "GET", redirect: "error",
        signal: AbortSignal.timeout(20000), headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Accept: "application/json" } });
      fordere(r.status === 200, "testende-datenbankfehler");
      const d = await r.json(); fordere(Array.isArray(d), "testende-datenbankformat"); return d;
    }
    async function snapshot() {
      const [mandate, identitaeten, auth] = await Promise.all([
        db("mandate_profiles?select=*&order=user_id&limit=505"), db("profiles?select=*&order=id&limit=506"),
        db("helmut_store?select=data&id=eq.main-auth&limit=2")
      ]);
      fordere(auth.length === 1, "testende-auth-nicht-eindeutig");
      return { mandate, identitaeten, auth: auth[0].data };
    }
    if (scharf && !deaktiviere) {
      fordere(env === process.env, "testende-schreiben-braucht-prozessumgebung");
      const bind = { HELMUT_STORAGE_BACKEND: "supabase", HELMUT_V3_STORE: "1", HELMUT_PROFILE_DB_MODE: "1",
        HELMUT_PROFILE_DB_EXCLUSIVE: "1", HELMUT_CRAWL_RUN_RETENTION: String(config.retention) };
      const vorher = Object.fromEntries(Object.keys(bind).map(k => [k, process.env[k]]));
      Object.assign(process.env, bind);
      restore = () => { for (const [k, v] of Object.entries(vorher)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      } };
    }
    return await T.ausfuehren({ scharf, env, deps: { snapshot,
      deaktiviere: deaktiviere || (id => require("../lib/helmut/provisioning").deactivateTenant(id)),
      leseZiel: async (id) => {
        fordere(T.KOHORTE_KENNUNGEN.includes(id), "testende-fremde-kennung");
        require("../lib/helmut/storage").assertTenant(id, "testendeNachweis");
        const rows = await db("mandate_profiles?select=user_id,aktiv,geloescht_at&user_id=eq."
          + encodeURIComponent(id) + "&limit=2");
        fordere(rows.length === 1, "testende-ziel-nicht-eindeutig"); return rows[0];
      }
    } });
  } catch (e) {
    return { ok: false, schreibversuche: 0,
      grund: e instanceof DirektAbbruch ? e.grund : "testende-zugang-oder-speicherfehler" };
  } finally { if (restore) restore(); }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--scharf")) {
    console.error("Nur Vorpruefung ohne Argument oder --scharf erlaubt."); process.exitCode = 2;
  } else ausfuehren({ scharf: args[0] === "--scharf" }).then(r => {
    console.log(JSON.stringify(r, null, 2)); process.exitCode = r.ok ? 0 : 1;
  }).catch(() => { console.error("Testende nicht bestaetigt."); process.exitCode = 1; });
}
module.exports = { ausfuehren };
