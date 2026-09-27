"use strict";
// Ein neuer, fest gebundener Auftrag: Plan ist read-only; Ausfuehrung importiert
// ein gesondert geprueftes Urteil und erzeugt hoechstens ein Lagepaar.
const crypto = require("node:crypto");
const { hash, profilHash } = require("../lib/helmut/briefing-speicher");
const { berlinTagKey } = require("../lib/helmut/briefing-frische");
const K = require("../lib/helmut/testkosten-budget");

const QUITTUNG = "bereichspaket-20260927-a";
// Fester Vollhash des ausgewaehlten Bestandsprofils. Der Klartextname steht
// bewusst NICHT im Repository.
const PROFIL_HASH = "0178727cc56dc0c9b8a0d17a655bfe434b0aecab80b92debed92e74175a4b869";
const FREIGABE = "EIN_BEREICHSPAKET_MAX_ZWEI_AUFRUFE";
const MAX_AUFRUFE = 2, MAX_MS = 240000, MAX_USD = 0.436;
const ENTWURF_TOKENS = 3000, REVIEW_TOKENS = 6000;
// Gesamtauftrag Version3/7USD (Betreiber-GO27.09.). Fehlt er, bricht der Auftrag
// fail closed ab — die Tagesgrenze6USD allein genuegt nicht.
const AUFTRAG_LIMIT_MICRO_USD = 7000000;
const LAGE_SLOT = "lage";

const fordere = (ok, grund) => { if (!ok) throw new Error("bereichspaket-" + grund); };
const bindung = p => hash({ id: p.id, profilHash: profilHash(p) });
// Volle Reserve BEIDER moeglicher Aufrufe zusammen: 0,212 (3000) + 0,224 (6000).
const volleReserveUsd = () => K.reservierungHoeheUsd(ENTWURF_TOKENS) + K.reservierungHoeheUsd(REVIEW_TOKENS);
const FACHFEHLER = new Set(["briefing-korrektur-abweichend", "briefing-aussagen-kontext-abweichend",
  "urteilsimport-payload-ungueltig", "urteilsimport-einzelurteil-abgelehnt",
  "urteilsimport-aussagenfelder-abweichend", "urteilsimport-gesamturteil-abgelehnt"]);
const LESEPHASEN = new Set(["helmut_store", "mandate_profiles", "profiles", "helmut_jobs",
  "pipeline_locks", "helmut_verstehen_reservierungen", "process_runs", "auth", "tagessaetze", "fachaufbau", "kosten"]);
const sichererGrund = error => /^bereichspaket-[a-z-]+$/.test(error?.message || "")
  ? error.message : FACHFEHLER.has(error?.message) ? error.message
    : ["TimeoutError", "AbortError"].includes(error?.name) ? "bereichspaket-lesezeit-abgelaufen"
      : "bereichspaket-technischer-fehler";
// Nur feste Phasennamen und bekannte Fehlercodes; keine URL, IDs, Payloads
// oder freien Fehlermeldungen. Keine Wiederholung und keine weichere Grenze.
async function leseSchritt(phase, fn) {
  fordere(LESEPHASEN.has(phase), "diagnosephase");
  try { return await fn(); } catch (error) {
    const safe = new Error(sichererGrund(error));
    safe.lesephase = LESEPHASEN.has(error?.lesephase) ? error.lesephase : phase;
    throw safe;
  }
}

// Drei- bzw. vierseitige Laufbindung plus Tag, Profil und Eingabebindung.
// Plan und Ausfuehrung verlangen dieselben bereits geprueften Hashbindungen.
function konfiguration(env = {}, commit = null, jetzt = Date.now(), tag = null, execute = false) {
  const tagJetzt = berlinTagKey(new Date(jetzt));
  fordere(tagJetzt === "2026-09-27", "tagbindung");
  const utcStabil = new Date(jetzt + MAX_MS).toISOString().slice(0, 10)
    === new Date(jetzt).toISOString().slice(0, 10);
  fordere(/^[a-f0-9]{40}$/.test(commit || "") && env.HELMUT_BEREICHSPAKET_COMMIT === commit
    && env.GITHUB_SHA === commit && env.GITHUB_ACTIONS === "true"
    && env.GITHUB_REPOSITORY === "ernisch/helmut-pilot" && env.GITHUB_REF === "refs/heads/main"
    && env.GITHUB_EVENT_NAME === "workflow_dispatch" && env.GITHUB_RUN_ATTEMPT === "1", "runtime");
  fordere(/^[0-9]{5,20}$/.test(env.GITHUB_RUN_ID || ""), "run");
  fordere(env.HELMUT_BEREICHSPAKET_PROFIL === PROFIL_HASH, "profilbindung");
  fordere(utcStabil && new Date(jetzt).toISOString().slice(0, 10) === tagJetzt
    && berlinTagKey(new Date(jetzt + MAX_MS)) === tagJetzt, "tageswechsel");
  fordere(tag === null || tag === tagJetzt, "tagbindung");
  const eingabe = String(env.HELMUT_BEREICHSPAKET_EINGABE || "");
  const urteilHash = String(env.HELMUT_BEREICHSPAKET_URTEIL || "");
  fordere(/^[a-f0-9]{64}$/.test(urteilHash) && /^[a-f0-9]{64}$/.test(eingabe), "urteilsbindung");
  fordere(!execute || /^[a-f0-9]{64}$/.test(eingabe), "eingabebindung");
  return Object.freeze({ commit, profilHash: PROFIL_HASH, tag: tagJetzt,
    urteilHash, runId: "nachlauf500-" + env.GITHUB_RUN_ID, costRunId: "nachlauf500-" + env.GITHUB_RUN_ID,
    eingabeBindung: /^[a-f0-9]{64}$/.test(eingabe) ? eingabe : null });
}

// Rein lesende Kosten-/Auftrags-/Reservepruefung. Fail closed: fehlt der
// Gesamtauftrag (Version3/7USD), gilt der Auftrag als nicht startklar.
function pruefeKosten({ kosten, auftrag, reserve }) {
  fordere(Number.isFinite(reserve) && reserve >= 0 && reserve <= volleReserveUsd(), "reserve");
  fordere(kosten?.startklar === true && kosten.offeneReservierungen === 0
    && kosten.limitUsd === 6 && Number.isFinite(kosten.gebundenUsd)
    && kosten.gebundenUsd >= 0 && kosten.gebundenUsd + reserve <= 6, "kosten");
  fordere(auftrag?.id === "autonom-bis500-20260926" && auftrag.limitMicroUsd === AUFTRAG_LIMIT_MICRO_USD
    && Number.isSafeInteger(auftrag.gebundenMicroUsd) && auftrag.gebundenMicroUsd >= 0
    && auftrag.gebundenMicroUsd + Math.round(reserve * 1e6) <= auftrag.limitMicroUsd, "auftragsgrenze");
}
function pruefeStand({ start, jetzt, laufkosten, bestand, grundlinie }) {
  fordere(jetzt >= start && jetzt - start < MAX_MS - 10000, "restzeit");
  fordere(new Date(jetzt).toISOString().slice(0, 10) === new Date(start).toISOString().slice(0, 10), "tageswechsel");
  fordere(Number.isFinite(laufkosten) && laufkosten >= 0 && laufkosten <= MAX_USD, "laufkosten");
  fordere(typeof grundlinie === "string" && bestand === grundlinie, "profilbestand");
}
function pruefeAufruf(s) {
  fordere(Number.isInteger(s.calls) && s.calls >= 0 && s.calls < MAX_AUFRUFE, "aufrufgrenze");
  pruefeStand(s);
  // Ein einzelner Transport darf120s brauchen;15s fuer Nachkontrolle bleiben.
  fordere(s.jetzt - s.start < MAX_MS - 135000, "review-restzeit");
  pruefeKosten({ ...s, reserve: s.calls === 0 ? volleReserveUsd() : K.reservierungHoeheUsd(REVIEW_TOKENS) });
}
function pruefeSpeichern(s) {
  fordere(s.calls === MAX_AUFRUFE, "speichern-ohne-pruefung");
  pruefeStand(s);
  // Kein dritter Aufruf: nur abgeschlossene Kosten und unveraenderte Eingabe.
  pruefeKosten({ ...s, reserve: 0 });
}

// Nur Hashes und Anzahlen — keine Fachtexte, keine Kennungen, keine Secrets.
function lesebeweis(fach) {
  const eingabe = fach?.eingabe;
  return Object.freeze({ eingabeHash: eingabe?.eingabeHash || null,
    quellenAnzahl: Array.isArray(eingabe?.quellen) ? eingabe.quellen.length : null,
    vorgaenge: Array.isArray(fach?.briefing?.items) ? fach.briefing.items.length : null });
}

async function einmallauf(cfg, d) {
  const start = d.now(), grundlinie = await d.ruhe(), profile = await d.profile();
  fordere(profile?.id && bindung(profile) === cfg.profilHash && profile.profileActive === false, "profil");
  fordere(!(await d.quittung()), "quittung-verbraucht");
  const vorhanden = await d.tagessatz(profile.id);
  fordere(!vorhanden?.lage && !vorhanden?.briefing && !vorhanden?.urteil, "bestehender-tagessatz");
  const fach = await d.fachlicheEingabe(profile), beleg = lesebeweis(fach);
  fordere(beleg.eingabeHash === cfg.eingabeBindung, "eingabe-abweichend");
  let calls = 0;
  const pruefe = async (speichern = false) => {
    const [kosten, auftrag, laufkosten, bestand] = await Promise.all(
      [d.kosten(), d.auftrag(), d.laufkosten(), d.bestand()]);
    const stand = { calls, start, jetzt: d.now(), kosten, auftrag, laufkosten, bestand, grundlinie };
    (speichern ? pruefeSpeichern : pruefeAufruf)(stand);
    const frisch = lesebeweis(await d.fachlicheEingabe(profile));
    fordere(frisch.eingabeHash === beleg.eingabeHash, "eingabe-veraendert");
    // Auch die Reads duerfen das Zeitfenster nicht verbrauchen.
    (speichern ? pruefeSpeichern : pruefeAufruf)({ ...stand, jetzt: d.now() });
  };
  await pruefe();
  if (!d.execute) return { ok: true, plan: true, startklar: true, tag: cfg.tag,
    maxAufrufe: MAX_AUFRUFE, maxUsd: MAX_USD, maxMs: MAX_MS,
    volleReserveUsd: volleReserveUsd(), fachlichPositiv: false, ...beleg };
  const lock = await d.acquire();
  fordere(lock?.granted === true && lock.active === true, "sperre");
  let claimed = false;
  const receipt = { quittungsschluessel: QUITTUNG, runId: cfg.runId, idHash: cfg.profilHash,
    runtimeCommit: cfg.commit, tag: cfg.tag, eingabeHash: cfg.eingabeBindung, urteilHash: cfg.urteilHash,
    maxUsd: MAX_USD, maxMs: MAX_MS, maxAufrufe: MAX_AUFRUFE,
    gestartetAm: new Date(start).toISOString() };
  let out = { ok: false, grund: "technischer-fehler" };
  try {
    fordere(await d.claim({ ...receipt, status: "laeuft" }), "verbraucht"); claimed = true;
    await pruefe();
    const imported = await d.importiere(profile, () => pruefe());
    fordere(imported?.verwendbar === true && imported.gespeichert === true, "urteilsimport");
    const basis = await d.eingabe(profile);
    fordere(basis?.bereit === true && basis.eingabeHash === cfg.eingabeBindung, "urteilleser");
    const lage = await d.lage(profile, { missingOnly: true, costRunId: cfg.costRunId,
      briefingEingabe: basis.lageEingabe, pruefaufwandNachweis: true,
      beforeGenerate: async id => { fordere(id === profile.id, "fremdes-profil"); await pruefe(); calls++; },
      beforeSave: async id => { fordere(id === profile.id, "fremdes-profil"); await pruefe(true); } });
    const satz = await d.lageSatz(profile.id);
    const gebunden = Boolean(satz?.payload && d.textGueltig(satz.payload)
      && satz.payload.briefingEingabeHash === cfg.eingabeBindung);
    let paket = null;
    if (gebunden && lage?.available === true && lage.fromCache === false && calls === 2) {
      await pruefe(true);
      paket = await d.materialisiere(profile, basis);
    }
    out = { ok: Boolean(paket?.gespeichert && paket?.vollstaendig),
      grund: paket?.vollstaendig ? null : "kein-vollstaendiges-paket",
      ergebnisGrund: typeof lage?.reason === "string" && /^[a-z-]+$/.test(lage.reason) ? lage.reason : null,
      diagnose: require("../lib/helmut/lage-textqualitaet").sichereDiagnose(lage?.diagnose),
      lageHash: satz?.payload ? hash(satz.payload) : null,
      paketVollstaendig: paket?.vollstaendig === true, fachlichPositiv: false };
  } catch (error) { out = { ...out, grund: sichererGrund(error),
    lesephase: LESEPHASEN.has(error?.lesephase) ? error.lesephase : null }; }
  finally {
    let nach = null, kosten = null, laufkosten = null, abschlussFehler = null;
    try { await d.release(); } catch (error) { abschlussFehler = error; }
    try {
      [nach, kosten, laufkosten] = await Promise.all([d.ruhe(), d.kosten(), d.laufkosten()]);
      fordere(nach === grundlinie, "profilbestand");
      fordere(kosten.offeneReservierungen === 0 && laufkosten >= 0 && laufkosten <= MAX_USD, "nachkosten");
      fordere(lesebeweis(await d.fachlicheEingabe(profile)).eingabeHash === beleg.eingabeHash, "eingabe-veraendert");
    } catch (error) { abschlussFehler = abschlussFehler || error; }
    if (abschlussFehler) out = { ...out, ok: false, ergebnisGrund: out.grund,
      grund: "nachkontrolle-fehlgeschlagen", abschlussGrund: sichererGrund(abschlussFehler) };
    out = { ...out, freigegebeneAufrufe: calls, laufkostenUsd: laufkosten,
      profileUnveraendert: nach === grundlinie, offeneKosten: kosten?.offeneReservierungen ?? null,
      funktionsnachweis500: false, automatischeWiederholung: false, fachlichPositiv: false };
    if (claimed) await d.finish({ ...receipt, ...out, status: out.ok ? "abgeschlossen" : "gestoppt",
      beendetAt: new Date(d.now()).toISOString() });
  }
  return out;
}

async function main(args = process.argv.slice(2), env = process.env) {
  fordere(args.length === 1 && ["--plan", "--execute"].includes(args[0]), "argumente");
  const execute = args[0] === "--execute";
  const B = require("./verstehen-einmalig-169");
  const cfg = konfiguration(env, B.echterCommit(), Date.now(),
    env.HELMUT_BEREICHSPAKET_TAG || null, execute);
  fordere(!execute || env.HELMUT_BEREICHSPAKET_FREIGABE === FREIGABE, "freigabe");
  const S = require("../lib/helmut/storage"), A = require("../lib/helmut/briefing-aussagenbindung");
  const Sp = require("../lib/helmut/briefing-speicher"), Q = require("../lib/helmut/lage-quellenbeleg");
  const buildV3 = require("../server").__buildV3Briefing;
  const buildLage = require("../lib/helmut/lage").buildLageBriefing;
  fordere(S.v3StoreReady() && S.profileDbModeEnabled() && S.profileDbExclusiveEnabled(), "speicher");
  if (execute) {
    const ai = require("../lib/helmut/ai");
    fordere(K.aktiv(env) && env.HELMUT_UNDERSTANDING_LOCK === "on" && env.HELMUT_ATOMIC_LOCK === "on"
      && env.HELMUT_TESTLAUF_KOMMUNIKATION === "gesperrt" && !env.HELMUT_LAGE_DEMO
      && ai.isAiEnabled() && ai.aiProviderName() === "azure" && ai.understandingModelName() === "gpt-5-mini",
    "umgebung");
  }
  const read = async (table, query) => leseSchritt(table, async () => {
    const r = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + table + "?" + query,
      { redirect: "error", signal: AbortSignal.timeout(15000),
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY } });
    fordere(r.status === 200, "lesen"); const rows = await r.json();
    fordere(Array.isArray(rows), "leseformat"); return rows;
  });
  const I = require("../lib/helmut/briefing-urteilsimport");
  // Neue, getrennt gepruefte Vorlage nach Abgleich der echten Lesereihenfolge.
  // Die erste Kontrollvorlage bleibt unveraendert; die Laufquittung ist unbenutzt.
  const stage = await read("helmut_store", "select=data&id=eq.bereichsurteil-vorlage-20260927-b&limit=2");
  fordere(stage.length === 1 && hash(stage[0].data) === cfg.urteilHash, "urteilsvorlage");
  const urteil = stage[0].data;
  const fachlicheEingabe = async p => leseSchritt("fachaufbau", async () => {
    const result = await buildV3(p, p.id, { aussagenEingabe: true, aussagenKorrektur: urteil.korrektur, now: new Date() });
    I.pruefeUrteil(result, urteil);
    require("../lib/helmut/briefing-urteilsauftrag").pruefeBeleg(
      require("../lib/helmut/briefing-urteilsauftrag").AUFTRAG, p.id, result);
    return result;
  });
  const leseKontext = async id => {
    S.assertTenant(id, "bereichspaketKontext");
    const [m, p] = await Promise.all([read("mandate_profiles", "select=*&user_id=eq." + encodeURIComponent(id) + "&limit=2"),
      read("profiles", "select=*&id=eq." + encodeURIComponent(id) + "&limit=2")]);
    fordere(m.length === 1 && p.length === 1 && m[0].user_id === id && p[0].id === id, "kontext");
    return { mandat: m[0], identitaet: p[0], profile: S.fromMandateProfileRow(p[0], m[0]) };
  };
  let profiles;
  // Ausdrueckliche Bestandspruefung: genau500 Mandatsprofile,501 Identitaeten,
  // ALLE500 inaktiv, nichts geloescht.
  const bestand = async () => {
    const [m, p] = await Promise.all([read("mandate_profiles", "select=*&order=user_id.asc&limit=505"),
      read("profiles", "select=*&order=id.asc&limit=506")]);
    fordere(m.length === 500 && p.length === 501 && m.every(r => r.aktiv === false && r.geloescht_at === null),
      "bestand");
    profiles = m.map(r => S.fromMandateProfileRow(p.find(x => x.id === r.user_id), r));
    return crypto.createHash("sha256").update(JSON.stringify({ m, p })).digest("hex");
  };
  const ruhe = async () => {
    const now = encodeURIComponent(new Date().toISOString());
    const [h, j, l, c, a, runs] = await Promise.all([bestand(),
      read("helmut_jobs", "select=id&or=(status.neq.erledigt,lease_expires_at.gt." + now + ")&limit=1"),
      read("pipeline_locks", "select=job_name&expires_at=gt." + now + "&limit=1"),
      read("helmut_verstehen_reservierungen", "select=vorgang_id&lease_bis=gt." + now + "&limit=1"),
      auth(),
      read("process_runs", "select=run_id&finished_at=is.null&started_at=gt."
        + encodeURIComponent(new Date(Date.now() - 30 * 60000).toISOString()) + "&limit=1")]);
    fordere(!j.length && !l.length && !c.length && !runs.length
      && !Object.values(a.pipelineLocks || {}).some(x => x?.expiresAt > Date.now()), "parallelbetrieb");
    return h;
  };
  const auth = async () => leseSchritt("auth", () => S.readAuthStore());
  const auftrag = async () => {
    try { return K.auftragsStand(await auth(), cfg.tag); } catch { return null; }
  };
  const q = execute ? B.quittungsAdapter(env) : null;
  const timer = execute ? setTimeout(() => {
    console.error("bereichspaket-harte-laufzeit; kein Retry"); process.exit(1); }, MAX_MS) : null;
  try {
    const result = await einmallauf(cfg, {
      execute, now: Date.now, ruhe, bestand, auftrag,
      profile: async () => {
        const found = profiles.filter(p => bindung(p) === cfg.profilHash);
        fordere(found.length === 1, "auswahl"); return found[0];
      },
      quittung: async () => (await read("helmut_store", "select=data&id=eq." + QUITTUNG + "&limit=1"))[0]?.data || null,
      tagessatz: async id => leseSchritt("tagessaetze", async () => ({
        lage: await S.getRenderedBriefingV3(id, LAGE_SLOT, cfg.tag, { strict: true }),
        briefing: await S.getRenderedBriefingV3(id, Sp.SLOT, cfg.tag, { strict: true }),
        urteil: await S.getRenderedBriefingV3(id, A.SLOT, cfg.tag, { strict: true }) })),
      kosten: async () => leseSchritt("kosten", async () => K.pruefeStart(await auth(), cfg.tag,
        await S.leseLlmTageszaehler(new Date().toISOString()))),
      laufkosten: () => (execute ? K.laufGebundenUsd(cfg.costRunId, { env }) : 0),
      fachlicheEingabe,
      importiere: async (p, gate) => {
        const context = await leseKontext(p.id);
        return I.ausfuehren({ userId: p.id, urteil, storage: S, build: buildV3, leseKontext,
          pruefeBetrieb: async commit => { fordere(commit === cfg.commit, "runtime"); await gate(); },
          freigabe: { version: 2, userId: p.id, tag: cfg.tag, productionCommit: cfg.commit,
            urteilHash: cfg.urteilHash, eingabeHash: cfg.eingabeBindung, kontextHash: hash(context),
            maxNeuanlagen: 1, modellaufrufe: 0, gueltigBis: new Date(Date.now() + MAX_MS).toISOString(),
            auftrag: require("../lib/helmut/briefing-urteilsauftrag").AUFTRAG } });
      },
      eingabe: p => A.leseFuerNachlauf({ profile: p, userId: p.id, build: buildV3 }),
      lage: (p, o) => buildLage(p, { politicianId: p.id, ...o }),
      lageSatz: id => S.getRenderedBriefingV3(id, LAGE_SLOT, cfg.tag, { strict: true }),
      textGueltig: Q.gespeicherterTextGueltig,
      build: buildV3,
      materialisiere: (p, basis) => Sp.materialisiere({ profile: p, userId: p.id, build: buildV3,
        briefing: basis.briefing, aussagenEingabeHash: basis.eingabeHash }),
      acquire: () => S.acquireGlobalUnderstandingLock(MAX_MS + 60000),
      release: () => S.releaseGlobalUnderstandingLock(),
      claim: d => q.claimRun(d), finish: d => q.finishRun(d) });
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  } finally { if (timer) clearTimeout(timer); }
}

if (require.main === module) main().then(c => { process.exitCode = c; }).catch(e => {
  console.log(JSON.stringify({ ok: false, grund: sichererGrund(e), automatischeWiederholung: false,
    lesephase: LESEPHASEN.has(e?.lesephase) ? e.lesephase : null,
    fachlichPositiv: false }));
  process.exitCode = 1;
});

module.exports = { QUITTUNG, PROFIL_HASH, FREIGABE, MAX_AUFRUFE, MAX_MS, MAX_USD,
  ENTWURF_TOKENS, REVIEW_TOKENS, konfiguration, pruefeKosten, pruefeAufruf, volleReserveUsd,
  bindung, lesebeweis, pruefeSpeichern, einmallauf, main, leseSchritt };
