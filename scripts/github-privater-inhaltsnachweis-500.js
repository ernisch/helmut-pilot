"use strict";

// Optionaler, eng begrenzter Nurleser. Keine Konten, Auth-Blobs oder Secrets
// im Nutzinhalt; kein Modell, kein Datenbankschreibzugriff, kein Login.
const { PROJECT_URL } = require("./github-fachzyklus-a");
const { pruefe } = require("./github-laufzeitpruefung");
const Z = require("../lib/helmut/testnachweis-ziel500");
const S = require("../lib/helmut/storage");
const B = require("../lib/helmut/briefing-speicher");
const Q = require("../lib/helmut/lage-textqualitaet");
const T = require("./privater-nachweis-transport");
const P = require("../lib/helmut/briefing-pruefaufnahme-500");
function fordere(ok) { if (!ok) throw new Error("privater-inhaltsnachweis-nicht-bestaetigt"); }

function pruefeBelegzeilen(rows, profile, day) {
  const id = S.assertTenant(profile?.id, "privaterBelegzeilenNachweis");
  // Nur Belegstruktur: dieser private Archivleser laedt keine Identitaetsprofile.
  // Vollprofilhash und neue Fachabnahme prueft ausschliesslich der aktuelle Leser.
  for (const row of rows) {
    fordere(row.user_id === id && row.payload && typeof row.payload === "object"
      && !Array.isArray(row.payload) && Number.isFinite(Date.parse(row.generated_at)));
    if (row.slot === "lage-pruefentwurf") {
      const { inhaltHash, ...rest } = row.payload;
      fordere(/^nachlauf500-\d{5,20}$/.test(rest.runId || "") && ["entwurf", "pruefung"].includes(rest.phase)
        && row.id === `bf-${id}-${row.slot}-${day}-${rest.runId}-${rest.phase}`
        && rest.version === 1 && rest.tag === day && rest.auslieferbar === false
        && rest.qualitaetBestanden === false && inhaltHash === B.hash(rest));
    } else if (row.slot === "mandatsbriefing" && row.payload.profilkontextUebergang) {
      const alt = rows.find(r => r.id === `bf-${id}-mandatsbriefing-${day}`);
      fordere(alt);
      require("../lib/helmut/briefing-profilkontext").pruefeBelegstruktur(row, alt,
        { userId: id, day, profile });
    } else fordere(["lage", "mandatsbriefing"].includes(row.slot)
      && row.id === `bf-${id}-${row.slot}-${day}`);
  }
}

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
    Z.schluessel(env.HELMUT_NACHWEIS_TESTFENSTER);
    const eingabe500 = env.HELMUT_PRUEFEINGABE_500 === "true";
    fordere([undefined, "", "false", "true"].includes(env.HELMUT_PRUEFEINGABE_500));
    const start = now().getTime();
    const pruefeFenster = () => fordere(!eingabe500 || (anzahl <= 3
      && now().getTime() >= Date.parse(P.BEGINN) && now().getTime() < Date.parse(P.ENDE)
      && ctx.tag === require("../lib/helmut/briefing-frische").berlinTagKey(now())));
    pruefeFenster();
    const config = await pruefe({ env, fetchFn });
    fordere(config.ok && config.profileRelational && config.profileExclusive && config.v3Bereit
      && config.kommunikationGesperrt && config.kohortenQuellenGesperrt);
    if (eingabe500) fordere(config.test500PruefaufnahmeVersion === 1
      && config.testKosten?.version === 2 && config.testKosten.aktiv === true
      && config.testKosten.limitUsd === 4 && config.quellenkontext?.atomicLock === true);
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
    const leseFenster = () => Z.lese({ laufId: env.HELMUT_NACHWEIS_TESTFENSTER,
      projectUrl: PROJECT_URL, key: env.SUPABASE_SERVICE_ROLE_KEY, fetchFn });
    const fenster = await leseFenster();
    const targetQuery = "mandate_profiles?select=user_id,aktiv&order=user_id.asc&limit=505";
    const all = await get(targetQuery, 505), target = Z.auswahl(all, fenster);
    if (eingabe500) {
      const exact = P.pruefeBestand(all.map(r => ({ id: r.user_id, profileActive: r.aktiv })));
      fordere(B.hash(exact) === B.hash(target));
    }
    const ids = target.slice(abPosition - 1, abPosition - 1 + anzahl);
    async function leseEingabe(id) {
      pruefeFenster();
      fordere(now().getTime() - start < 240000 && ids.includes(id));
      const r = await fetchFn("https://helmut-pilot.vercel.app/api/cron/briefing-nachweis?modus=eingabe-500&mandat="
        + encodeURIComponent(id) + "&tag=" + ctx.tag, { method: "GET", redirect: "error",
        signal: AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${env.HELMUT_CRON_SECRET}`,
          Accept: "application/json", "x-helmut-production-commit": ctx.commit } });
      fordere(r.status === 200);
      const x = await r.json();
      fordere(x?.version === 1 && x.art === "production-briefing-eingabe-500"
        && x.productionCommit === ctx.commit && x.profile?.id === id && x.profile.profileActive === true
        && x.result?.eingabe?.mandat === id && x.result.eingabe.tag === ctx.tag
        && /^[a-f0-9]{64}$/.test(x.result.eingabe.eingabeHash || "")
        && x.reinLesend === true && x.modellaufrufe === 0 && x.schreibaufrufe === 0
        && x.ziel === 500 && x.zielHash === P.ZIELHASH && x.testende === P.ENDE
        && x.transaktionalerSnapshot === false && x.fachlicheFreigabe === false
        && x.funktionsnachweis500 === false
        && Date.parse(x.erfasstAm) >= start && Date.parse(x.erfasstAm) <= now().getTime());
      pruefeFenster();
      return x;
    }
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
      pruefeBelegzeilen(rows, profile, ctx.tag);
      return { userId: id, profil: Q.profilKontext(profile), profilHash: profileHash,
        fachbasisAmVollprofilGeprueft: false, belege: rows, snapshotHash: B.hash({ profil: profiles[0], belege: rows }) };
    }
    const mandate = [];
    for (const id of ids) {
      const m = await leseMandat(id);
      if (eingabe500) m.pruefaufnahme = await leseEingabe(id);
      mandate.push(m);
    }
    // Keine Behauptung eines transaktionalen Backups: zwei identische
    // Leseproben und keine beobachtete aktive Arbeit sind die konkrete Grenze.
    for (const before of mandate) fordere((await leseMandat(before.userId)).snapshotHash === before.snapshotHash);
    fordere(B.hash(await get(targetQuery, 505)) === B.hash(all));
    Z.gleich(fenster, await leseFenster());
    await ruhe();
    if (eingabe500) {
      pruefeFenster();
      fordere(B.hash(await pruefe({ env, fetchFn })) === B.hash(config));
    }
    const payload = { version: 1, ...(eingabe500 ? { art: "aktive-500-pruefaufnahme", fachlicheFreigabe: false } : {}), ...ctx, ziel: 500, zielHash: B.hash(target),
      testfenster: env.HELMUT_NACHWEIS_TESTFENSTER, testfensterManifest: fenster.manifest,
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
module.exports = { ausfuehren, pruefeBelegzeilen };
