"use strict";

// Optionaler, eng begrenzter Nurleser. Keine Konten, Auth-Blobs oder Secrets
// im Nutzinhalt; kein Modell, kein Datenbankschreibzugriff, kein Login.
const { PROJECT_URL } = require("./github-fachzyklus-a");
const { pruefe } = require("./github-laufzeitpruefung");
const { KOHORTE_KENNUNGEN } = require("../lib/helmut/testkohorte-betrieb");
const S = require("../lib/helmut/storage");
const B = require("../lib/helmut/briefing-speicher");
const Q = require("../lib/helmut/lage-textqualitaet");
const T = require("./privater-nachweis-transport");
function fordere(ok) { if (!ok) throw new Error("privater-inhaltsnachweis-nicht-bestaetigt"); }

async function ausfuehren({ env = process.env, fetchFn = global.fetch, now = () => new Date() } = {}) {
  try {
    fordere(env.GITHUB_REPOSITORY === "ernisch/helmut-pilot" && env.GITHUB_REF === "refs/heads/main"
      && env.GITHUB_EVENT_NAME === "workflow_dispatch" && env.GITHUB_RUN_ATTEMPT === "1"
      && env.GITHUB_SHA === env.HELMUT_PRODUCTION_COMMIT);
    const abPosition = Number(env.HELMUT_PRIVAT_AB_POSITION), anzahl = Number(env.HELMUT_PRIVAT_ANZAHL);
    fordere(String(abPosition) === env.HELMUT_PRIVAT_AB_POSITION && String(anzahl) === env.HELMUT_PRIVAT_ANZAHL);
    const ctx = T.kontext({ runId: env.GITHUB_RUN_ID, commit: env.GITHUB_SHA,
      tag: env.HELMUT_NACHWEIS_TAG, abPosition, anzahl });
    T.publicKey(env.HELMUT_NACHWEIS_PUBLIC_KEY); // Vor jedem Netzabruf.
    fordere(String(env.SUPABASE_URL || "").replace(/\/$/, "") === PROJECT_URL
      && env.SUPABASE_SERVICE_ROLE_KEY && env.HELMUT_CRON_SECRET);
    const start = now().getTime();
    const config = await pruefe({ env, fetchFn });
    fordere(config.ok && config.profileRelational && config.profileExclusive && config.v3Bereit
      && config.kommunikationGesperrt && config.kohortenQuellenGesperrt);
    async function get(path, limit) {
      fordere(now().getTime() - start < 240000);
      const r = await fetchFn(PROJECT_URL + "/rest/v1/" + path, { method: "GET", redirect: "error",
        signal: AbortSignal.timeout(15000), headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Prefer: "count=exact", Accept: "application/json" } });
      fordere(r.status === 200);
      const rows = await r.json(), range = r.headers?.get("content-range") || "";
      const match = /^(?:0-\d+|\*)\/(\d+)$/.exec(range);
      fordere(Array.isArray(rows) && rows.length < limit && match && Number(match[1]) === rows.length);
      return rows;
    }
    async function ruhe() {
      const stamp = encodeURIComponent(now().toISOString());
      const rows = await Promise.all([
        get("pipeline_locks?select=job_name&expires_at=gt." + stamp + "&limit=2", 2),
        get("helmut_jobs?select=id&lease_expires_at=gt." + stamp + "&limit=2", 2)
      ]);
      fordere(rows.every(r => r.length === 0));
    }
    await ruhe();
    const targetQuery = "mandate_profiles?select=user_id,aktiv&order=user_id.asc&limit=505";
    const all = await get(targetQuery, 505), cohort = new Set(KOHORTE_KENNUNGEN);
    fordere(all.length === 504 && new Set(all.map(r => r.user_id)).size === 504
      && all.every(r => typeof r.user_id === "string" && typeof r.aktiv === "boolean")
      && KOHORTE_KENNUNGEN.every(id => all.some(r => r.user_id === id)));
    const target = all.filter(r => cohort.has(r.user_id) || r.aktiv).map(r => r.user_id).sort();
    fordere(target.length === 500 && target.filter(id => !cohort.has(id)).length === 5);
    const ids = target.slice(abPosition - 1, abPosition - 1 + anzahl);
    async function leseMandat(id) {
      S.assertTenant(id, "privaterInhaltsnachweis");
      fordere(ids.includes(id));
      const filter = "user_id=eq." + encodeURIComponent(id);
      const [profiles, rows] = await Promise.all([
        get("mandate_profiles?select=*&" + filter + "&limit=2", 2),
        get("briefings?select=id,user_id,slot,generated_at,payload&" + filter
          + "&slot=in.(lage,mandatsbriefing,lage-pruefentwurf)&id=like."
          + encodeURIComponent(`bf-${id}-*-${ctx.tag}*`) + "&order=id.asc&limit=81", 81)
      ]);
      fordere(profiles.length === 1 && profiles[0].user_id === id && profiles[0].geloescht_at === null);
      const profile = S.fromMandateProfileRow({ id }, profiles[0]);
      const profileHash = B.profilHash(profile);
      for (const row of rows) {
        fordere(row.user_id === id && row.payload && typeof row.payload === "object"
          && !Array.isArray(row.payload) && Number.isFinite(Date.parse(row.generated_at)));
        if (row.slot === "lage-pruefentwurf") {
          const { inhaltHash, ...rest } = row.payload;
          fordere(/^nachlauf500-\d{5,20}$/.test(rest.runId || "") && ["entwurf", "pruefung"].includes(rest.phase)
            && row.id === `bf-${id}-${row.slot}-${ctx.tag}-${rest.runId}-${rest.phase}`
            && rest.version === 1 && rest.tag === ctx.tag && rest.auslieferbar === false
            && rest.qualitaetBestanden === false && inhaltHash === B.hash(rest));
        } else fordere(["lage", "mandatsbriefing"].includes(row.slot)
          && row.id === `bf-${id}-${row.slot}-${ctx.tag}`);
      }
      return { userId: id, profil: Q.profilKontext(profile), profilHash: profileHash,
        belege: rows, snapshotHash: B.hash({ profil: profiles[0], belege: rows }) };
    }
    const mandate = [];
    for (const id of ids) mandate.push(await leseMandat(id));
    // Keine Behauptung eines transaktionalen Backups: zwei identische
    // Leseproben und keine beobachtete aktive Arbeit sind die konkrete Grenze.
    for (const before of mandate) fordere((await leseMandat(before.userId)).snapshotHash === before.snapshotHash);
    fordere(B.hash(await get(targetQuery, 505)) === B.hash(all));
    await ruhe();
    const payload = { version: 1, ...ctx, ziel: 500, zielHash: B.hash(target),
      erhobenAm: now().toISOString(), transaktionalerSnapshot: false, mandate };
    const envelope = T.verschluesseln(payload, env.HELMUT_NACHWEIS_PUBLIC_KEY, ctx);
    return { ok: true, reinLesend: true, modellaufrufe: 0, schreibaufrufe: 0,
      funktionsnachweis500: false, envelope };
  } catch {
    // Auch rohe Transport-/DB-Fehler koennen private Inhalte enthalten.
    return { ok: false, reinLesend: true, modellaufrufe: 0, schreibaufrufe: 0,
      funktionsnachweis500: false, grund: "privater-inhaltsnachweis-nicht-bestaetigt" };
  }
}
if (require.main === module) ausfuehren().then(r => {
  console.log(JSON.stringify(r, null, 2)); process.exitCode = r.ok ? 0 : 1;
});
module.exports = { ausfuehren };
