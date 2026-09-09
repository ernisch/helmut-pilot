"use strict";

// Reiner Betreiberleser des bereits veroeffentlichten App-Vertrags.
// Keine Profile aktivieren, keine Kontoanmeldung, kein Modell und kein Writer.
const { PROJECT_URL } = require("./github-fachzyklus-a");
const { pruefe } = require("./github-laufzeitpruefung");
const { KOHORTE_KENNUNGEN } = require("../lib/helmut/testkohorte-betrieb");
const { hash, fordere, DirektAbbruch } = require("../lib/helmut/testkohorte-direkt500");
const APP = "https://helmut-pilot.vercel.app";

async function ausfuehren({ env = process.env, fetchFn = global.fetch, now = () => new Date() } = {}) {
  const results = [], start = now().getTime();
  try {
    fordere(env.GITHUB_REPOSITORY === "ernisch/helmut-pilot" && env.GITHUB_REF === "refs/heads/main"
      && env.GITHUB_EVENT_NAME === "workflow_dispatch", "nachweis-nur-manuell-auf-main");
    const tag = env.HELMUT_NACHWEIS_TAG || "";
    fordere(/^\d{4}-\d{2}-\d{2}$/.test(tag) && Number.isFinite(Date.parse(tag))
      && new Date(tag).toISOString().slice(0, 10) === tag, "nachweis-tag-ungueltig");
    fordere(String(env.SUPABASE_URL || "").replace(/\/$/, "") === PROJECT_URL
      && env.SUPABASE_SERVICE_ROLE_KEY && env.HELMUT_CRON_SECRET, "nachweis-zugang-fehlt");
    const config = await pruefe({ env, fetchFn });
    fordere(config.ok && config.profileRelational && config.profileExclusive && config.v3Bereit,
      "nachweis-production-nicht-bestaetigt");
    const response = await fetchFn(PROJECT_URL + "/rest/v1/mandate_profiles?select=user_id,aktiv&order=user_id.asc&limit=505", {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` }
    });
    fordere(response.status === 200, "nachweis-profile-unlesbar");
    const profile = await response.json(), cohort = new Set(KOHORTE_KENNUNGEN);
    fordere(Array.isArray(profile) && profile.length === 504
      && profile.every(p => p && typeof p.user_id === "string" && typeof p.aktiv === "boolean")
      && new Set(profile.map(p => p.user_id)).size === 504
      && KOHORTE_KENNUNGEN.every(id => profile.some(p => p.user_id === id)), "nachweis-bestand-abweichend");
    const target = profile.filter(p => cohort.has(p.user_id) || p.aktiv);
    fordere(target.length === 500 && target.filter(p => !cohort.has(p.user_id)).length === 5,
      "nachweis-zielmenge-abweichend");
    for (const p of target) {
      fordere(now().getTime() - start < 15 * 60000, "nachweis-zeitbudget");
      const mandatHash = hash(p.user_id);
      const url = new URL(APP + "/api/cron/briefing-nachweis");
      url.searchParams.set("mandat", p.user_id); url.searchParams.set("tag", tag);
      try {
        const res = await fetchFn(url.href, { method: "GET", redirect: "error", signal: AbortSignal.timeout(12000),
          headers: { Authorization: `Bearer ${env.HELMUT_CRON_SECRET}`, Accept: "application/json" } });
        if (res.status !== 200) { results.push({ mandatHash, abrufbar: false, grund: "app-http-fehler" }); continue; }
        const b = await res.json(), n = b?.gespeicherterNachweis;
        if (b?.available === false && b.reason === "briefing-nicht-gespeichert") {
          results.push({ mandatHash, abrufbar: false, grund: "briefing-nicht-gespeichert" }); continue;
        }
        const gueltig = n?.id === `bf-${p.user_id}-mandatsbriefing-${tag}` && b?.available === true
          && Array.isArray(b.items) && b.items.length > 0 && b.currentHelmutState && b.currentRadarState
          && Array.isArray(b.lageBriefing?.paragraphs) && b.lageBriefing.paragraphs.length > 0;
        results.push({ mandatHash, abrufbar: Boolean(gueltig), grund: gueltig ? "app-vertrag-gelesen" : "app-vertrag-unvollstaendig",
          strukturellVollstaendig: Boolean(gueltig) && n.pruefung?.strukturellVollstaendig === true,
          qualitaetBestanden: Boolean(gueltig) && n.pruefung?.bestanden === true });
      } catch { results.push({ mandatHash, abrufbar: false, grund: "app-antwort-unlesbar" }); }
    }
    return { ok: true, reinLesend: true, tag, commit: env.HELMUT_PRODUCTION_COMMIT, ziel: 500,
      gelesen: results.length, abrufbar: results.filter(r => r.abrufbar).length,
      strukturellVollstaendig: results.filter(r => r.strukturellVollstaendig).length,
      qualitaetBestanden: results.filter(r => r.qualitaetBestanden).length,
      vollstaendigeFaktenpruefung: false, funktionsnachweis500: false, results };
  } catch (e) {
    return { ok: false, reinLesend: true, grund: e instanceof DirektAbbruch ? e.grund : "nachweis-zugang-oder-lesefehler",
      gelesen: results.length, funktionsnachweis500: false, results };
  }
}
if (require.main === module) ausfuehren().then(r => {
  console.log(JSON.stringify(r, null, 2)); process.exitCode = r.ok ? 0 : 1;
});
module.exports = { ausfuehren };
