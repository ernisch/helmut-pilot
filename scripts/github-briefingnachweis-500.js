"use strict";

// Reiner Betreiberleser des bereits veroeffentlichten App-Vertrags.
// Keine Profile aktivieren, keine Kontoanmeldung, kein Modell und kein Writer.
const { PROJECT_URL } = require("./github-fachzyklus-a");
const { pruefe } = require("./github-laufzeitpruefung");
const Z = require("../lib/helmut/testnachweis-ziel500");
const E = require("../lib/helmut/testnachweis-ergebnisse");
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
    Z.schluessel(env.HELMUT_NACHWEIS_TESTFENSTER);
    const config = await pruefe({ env, fetchFn });
    fordere(config.ok && config.profileRelational && config.profileExclusive && config.v3Bereit,
      "nachweis-production-nicht-bestaetigt");
    const leseFenster = () => Z.lese({ laufId: env.HELMUT_NACHWEIS_TESTFENSTER,
      projectUrl: PROJECT_URL, key: env.SUPABASE_SERVICE_ROLE_KEY, fetchFn });
    const fenster = await leseFenster();
    const response = await fetchFn(PROJECT_URL + "/rest/v1/mandate_profiles?select=user_id,aktiv&order=user_id.asc&limit=505", {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Prefer: "count=exact" }
    });
    fordere(response.status === 200 && response.headers?.get("content-range") === "0-503/504", "nachweis-profile-unlesbar");
    const profile = await response.json(), target = Z.auswahl(profile, fenster);
    for (const id of target) {
      fordere(now().getTime() - start < 15 * 60000, "nachweis-zeitbudget");
      const mandatHash = hash(id);
      const url = new URL(APP + "/api/cron/briefing-nachweis");
      url.searchParams.set("mandat", id); url.searchParams.set("tag", tag);
      try {
        const res = await fetchFn(url.href, { method: "GET", redirect: "error", signal: AbortSignal.timeout(12000),
          headers: { Authorization: `Bearer ${env.HELMUT_CRON_SECRET}`, Accept: "application/json" } });
        if (res.status !== 200) { results.push({ mandatHash, abrufbar: false, grund: "app-http-fehler" }); continue; }
        const b = await res.json(), n = b?.gespeicherterNachweis;
        if (b?.available === false && b.reason === "briefing-nicht-gespeichert") {
          results.push({ mandatHash, abrufbar: false, grund: "briefing-nicht-gespeichert" }); continue;
        }
        const gueltig = require("../lib/helmut/briefing-profilkontext").nachweisKennungGueltig(n, id, tag) && b?.available === true
          && Array.isArray(b.items) && b.items.length > 0 && b.currentHelmutState && b.currentRadarState
          && Array.isArray(b.lageBriefing?.paragraphs) && b.lageBriefing.paragraphs.length > 0;
        // Appdarstellung und gespeicherte Ergebnisarten getrennt pruefen.
        // Eine fehlende sichtbare Lage darf die gebundenen Speicherbelege
        // nicht unsichtbar machen. E.lese verweigert weiterhin ohne gueltige
        // mandatsbezogene Paketkennung schon vor dem ersten Datenbankzugriff.
        const ergebnisArten = await E.lese({ userId: id, tag, fenster, app: b, projectUrl: PROJECT_URL,
          key: env.SUPABASE_SERVICE_ROLE_KEY, fetchFn, jetzt: now() });
        results.push({ mandatHash, abrufbar: Boolean(gueltig), grund: gueltig ? "app-vertrag-gelesen" : "app-vertrag-unvollstaendig",
          ergebnisArten,
          strukturellVollstaendig: Boolean(gueltig) && n.pruefung?.strukturellVollstaendig === true,
          qualitaetBestanden: Boolean(gueltig) && n.pruefung?.bestanden === true });
      } catch { results.push({ mandatHash, abrufbar: false, grund: "app-antwort-unlesbar" }); }
    }
    Z.gleich(fenster, await leseFenster());
    return { ok: true, reinLesend: true, tag, commit: env.HELMUT_PRODUCTION_COMMIT, ziel: 500,
      zielHash: fenster.manifest.zielHash, testfenster: env.HELMUT_NACHWEIS_TESTFENSTER,
      auswahlUnabhaengigVomAktivstatus: true, transaktionalerSnapshot: false,
      gelesen: results.length, abrufbar: results.filter(r => r.abrufbar).length,
      strukturellVollstaendig: results.filter(r => r.strukturellVollstaendig).length,
      qualitaetBestanden: results.filter(r => r.qualitaetBestanden).length,
      ergebnisArten: E.bilanziere(results),
      vollstaendigeFaktenpruefung: false, funktionsnachweis500: false, results };
  } catch (e) {
    return { ok: false, reinLesend: true, grund: e instanceof DirektAbbruch ? e.grund : "nachweis-zugang-oder-lesefehler",
      gelesen: results.length, ergebnisArten: E.bilanziere(results), funktionsnachweis500: false, results };
  }
}
function oeffentlicherBericht(r) {
  // Auch Hashkennungen mit Einzelstatus bleiben private Betreiberbelege.
  // Nur feste Gesamtfelder verlassen den Leser ueber oeffentliche Actions-Logs.
  const felder = ["ok", "reinLesend", "tag", "commit", "ziel", "zielHash", "testfenster",
    "auswahlUnabhaengigVomAktivstatus", "transaktionalerSnapshot", "gelesen", "abrufbar",
    "strukturellVollstaendig", "qualitaetBestanden", "vollstaendigeFaktenpruefung",
    "funktionsnachweis500", "grund"];
  const out = Object.fromEntries(felder.filter(k => Object.hasOwn(r, k)).map(k => [k, r[k]]));
  if (Object.hasOwn(r, "ergebnisArten")) out.ergebnisArten = E.bilanziere(r.results || []);
  const gruende = ["app-http-fehler", "briefing-nicht-gespeichert", "app-vertrag-gelesen",
    "app-vertrag-unvollstaendig", "app-antwort-unlesbar"];
  out.abrufGruende = {};
  for (const result of r.results || []) {
    const grund = gruende.includes(result.grund) ? result.grund : "sonstige";
    out.abrufGruende[grund] = (out.abrufGruende[grund] || 0) + 1;
  }
  return out;
}
if (require.main === module) ausfuehren().then(r => {
  console.log(JSON.stringify(oeffentlicherBericht(r), null, 2)); process.exitCode = r.ok ? 0 : 1;
});
module.exports = { ausfuehren, oeffentlicherBericht };
