"use strict";
// Offline: echter Runner, gesondert echter Motor/Vertrag; keine Production-Zugriffe.
const A = require("node:assert/strict");
const V = require("../lib/helmut/verstehen-vier");
const CLI = require("./verstehen-vier");
const { adapter } = require("../lib/helmut/verstehen-vier-speicher");
const budget = require("../lib/helmut/testkosten-budget");
const fs = require("node:fs");
const path = require("node:path");
let count = 0;
async function test(name, f) { await f(); count++; console.log("PASS " + name); }
const clone = structuredClone;
function welt() {
  const faelle = new Map(V.IDS.map(id => [id, {
    cas: { vorgang_id: id, zustand: "unbekannt", besitzer: null, lease_bis: null,
      fencing: 2, ergebnis_fencing: null, versuche: 2, ki_aufrufe: 2, eingabe_hash: "alt" },
    ko: { id: "ko-" + id, vorgang_id: id, status: "pending", understanding_status: "failed", verstehen_fencing: null },
    docs: [{ id: "rd-" + id, title: "Test", url: "https://example.org/quelle", published_at: "2026-09-21T00:00:00Z" }]
  }]));
  const stats = { calls: 0, writes: 0, claims: 0, releases: 0 };
  let beleg = null, kosten = 0;
  const deps = {
    profile: async () => ({ anzahl: 504, aktiv: 0, hash: "a".repeat(64) }),
    leseFall: async id => clone(faelle.get(id)),
    voraussetzungen: async () => {},
    reserveUsd: async () => .212,
    kosten: async () => kosten,
    acquireLock: async () => ({ granted: true, active: true }),
    releaseLock: async () => { stats.releases++; },
    claim: async q => { if (beleg) throw Error("vier-verbraucht"); beleg = clone(q); stats.claims++; },
    finish: async (q, rev) => {
      A.equal(beleg.rev, rev); A.equal(beleg.status, "laeuft");
      beleg = clone(q);
    },
    motorDeps: () => ({
      verstehenVertrag: () => ({}),
      requestUnderstanding: async () => { stats.calls++; kosten += .006; return {}; }
    })
  };
  const motor = async (cluster, d, opts) => {
    await d.requestUnderstanding("test");
    const f = faelle.get(opts.vorgangId);
    f.cas.fencing++; f.cas.ki_aufrufe++; f.cas.ergebnis_fencing = f.cas.fencing;
    f.cas.zustand = "fertig"; f.ko.verstehen_fencing = f.cas.fencing; f.ko.understanding_status = "complete";
    stats.writes++;
    return { status: "saved" };
  };
  async function lauf(ids = V.IDS, overrides = {}) {
    const p = await V.plane({ ids, deps });
    return V.ausfuehren({ ids, planHash: p.planHash, runId: "verstehen4-12345",
      runtimeCommit: "b".repeat(40), deps, motor, ...overrides });
  }
  return { deps, motor, stats, faelle, lauf, beleg: () => beleg, setKosten: n => { kosten = n; } };
}
async function main() {
  for (const ids of [[], [V.IDS[0], V.IDS[0]], ["vg-fremd"], [...V.IDS, "vg-fremd"]]) {
    await test("falsche Auswahl " + JSON.stringify(ids), async () => A.throws(() => V.auswahl(ids)));
  }
  await test("Plan ist schreib- und modellfrei, gibt keine Texte aus", async () => {
    const w = welt(), p = await V.plane({ ids: V.IDS, deps: w.deps });
    A.equal(w.stats.calls + w.stats.writes + w.stats.claims, 0);
    A.ok(!JSON.stringify(V.uebersicht(p)).includes("example.org"));
  });
  await test("Profilinventur schuetzt auch das 505. Konto ohne Mandat", async () => {
    const mandate = Array.from({ length: 504 }, (_, i) => ({ user_id: String(i), aktiv: false }));
    const profile = Array.from({ length: 505 }, (_, i) => ({ id: String(i), name: "vorher" }));
    const requests = [];
    const d = adapter({ request: async (p, options) => {
      A.equal(options, undefined); // ausschliesslich GET, keine Writes
      requests.push(p);
      const u = new URL(p, "https://example.invalid");
      const rows = u.pathname.endsWith("/mandate_profiles") ? mandate : profile;
      return clone(rows.slice(0, Number(u.searchParams.get("limit"))));
    } });
    const vorher = await d.profile();
    A.equal(vorher.anzahl, 504); A.equal(vorher.aktiv, 0);
    A.equal(vorher.hash, V.hash({ mandate, profile }));
    profile[504].name = "nachher";
    A.notEqual((await d.profile()).hash, vorher.hash);
    A.ok(requests.some(p => p.includes("profiles?select=*&order=id.asc&limit=506")));
  });
  await test("Abgeschnittene und gewachsene Profilbestaende bleiben gesperrt", async () => {
    for (const [mandate, profile] of [[503, 505], [505, 505], [504, 504], [504, 506], [500, 500]]) {
      const d = adapter({ request: async p => Array.from({ length:
        p.includes("/mandate_profiles?") ? mandate : profile }, (_, i) => ({ id: String(i), aktiv: false })) });
      await A.rejects(d.profile(), /vier-profile-abweichend/);
    }
  });
  await test("Vier Erfolge, genau vier Calls und belegter Abschluss", async () => {
    const w = welt(), r = await w.lauf();
    A.equal(r.ok, true); A.equal(r.modellaufrufe, 4); A.equal(w.stats.calls, 4);
    A.equal(w.beleg().status, "fertig"); A.equal(r.laufkostenUsd, .024); A.equal(w.stats.releases, 1);
  });
  await test("Explizite Teilmenge verarbeitet keine anderen Faelle", async () => {
    const w = welt(), r = await w.lauf([V.IDS[2]]);
    A.equal(r.faelle.length, 1); A.equal(r.nichtAusgewaehlt.length, 3); A.equal(w.stats.calls, 1);
    A.equal(w.faelle.get(V.IDS[0]).cas.zustand, "unbekannt");
  });
  await test("Abweichender Plan stoppt vor Lock und Write", async () => {
    const w = welt();
    await A.rejects(w.lauf(V.IDS, { planHash: "c".repeat(64) }), /plan-abweichend/);
    A.equal(w.stats.claims, 0);
  });
  await test("Aktives Profil blockiert bereits den Plan", async () => {
    const w = welt(); w.deps.profile = async () => ({ anzahl: 504, aktiv: 1, hash: "a".repeat(64) });
    await A.rejects(w.lauf(), /profile-abweichend/);
  });
  await test("Vorhandenes aktuelles Ergebnis verbietet Neuversuch", async () => {
    const w = welt(); w.faelle.get(V.IDS[0]).ko.verstehen_fencing = 2;
    await A.rejects(w.lauf(), /ergebnis-schon/); A.equal(w.stats.calls, 0);
  });
  await test("Fehlende Migration blockiert vor Quittung", async () => {
    const w = welt(); w.deps.voraussetzungen = async () => { throw Error("vier-migration-fehlt"); };
    await A.rejects(w.lauf(), /migration-fehlt/); A.equal(w.stats.claims, 0);
  });
  await test("No-op Lock wird nicht als Schutz akzeptiert", async () => {
    const w = welt(); w.deps.acquireLock = async () => ({ granted: true, active: false });
    const r = await w.lauf(); A.equal(r.ok, false); A.equal(w.stats.calls, 0);
  });
  await test("Verlorene Claim-Antwort startet keinen Motor", async () => {
    const w = welt(); w.deps.claim = async () => { throw Error("netzausfall"); };
    const r = await w.lauf(); A.equal(r.ok, false); A.equal(w.stats.calls, 0); A.equal(w.stats.releases, 1);
  });
  await test("Zwei Starter mit gleicher Quittung: nur ein Motor", async () => {
    const w = welt(), ids = [V.IDS[0]], p = await V.plane({ ids, deps: w.deps });
    const args = { ids, planHash: p.planHash, runtimeCommit: "b".repeat(40), runId: "verstehen4-12345",
      deps: w.deps, motor: w.motor };
    const r = await Promise.all([V.ausfuehren(args), V.ausfuehren(args)]);
    A.equal(r.filter(x => x.ok).length, 1); A.equal(w.stats.calls, 1);
  });
  await test("Kosten plus volle Reserve blockieren VOR Provider", async () => {
    const w = welt(); w.setKosten(.09);
    await A.rejects(w.lauf(), /kostendeckel/); A.equal(w.stats.calls, 0);
  });
  await test("Unlesbare Kosten sind kein Nullbetrag", async () => {
    const w = welt(); w.deps.kosten = async () => NaN;
    await A.rejects(w.lauf(), /kosten-unlesbar/); A.equal(w.stats.calls, 0);
  });
  await test("Lokaler Validierungsfehler stoppt gesamten Viererauftrag", async () => {
    const w = welt();
    const r = await w.lauf(V.IDS, { motor: async (_, d) => {
      await d.requestUnderstanding("x");
      return { status: "skipped-invalid", errors: ["quellenbeleg-parteien", "PRIVATE ROHANTWORT"] };
    }});
    A.equal(r.ok, false); A.equal(w.stats.calls, 1);
    A.equal(r.faelle.filter(f => f.status === "nicht-begonnen").length, 3);
    A.deepEqual(r.faelle[0].validierungsfehler, ["quellenbeleg-parteien"]);
    A.ok(!JSON.stringify(r).includes("PRIVATE")); A.equal(w.beleg().status, "gestoppt");
  });
  await test("Motorwurf bilanziert begonnenen und drei unbegonnene Faelle", async () => {
    const w = welt(); const r = await w.lauf(V.IDS, { motor: async (_, d) => {
      await d.requestUnderstanding("x"); throw Error("rohwert");
    }});
    A.equal(r.ok, false); A.equal(r.faelle.length, 4); A.equal(r.modellaufrufe, 1);
  });
  await test("Zweiter Modellversuch derselben Kennung wird geblockt", async () => {
    const w = welt(); const r = await w.lauf(V.IDS, { motor: async (_, d) => {
      await d.requestUnderstanding("eins"); await d.requestUnderstanding("zwei");
    }});
    A.equal(r.ok, false); A.equal(w.stats.calls, 1);
  });
  await test("Erfolgsmeldung ohne gespeichertes Ergebnis ist rot", async () => {
    const w = welt(); const r = await w.lauf(V.IDS, { motor: async (_, d) => {
      await d.requestUnderstanding("x"); return { status: "saved" };
    }});
    A.equal(r.ok, false); A.equal(w.stats.calls, 1);
  });
  await test("Profilveraenderung beendet den Lauf", async () => {
    const w = welt(); w.deps.profile = async () => ({ anzahl: 504, aktiv: 0,
      hash: (w.stats.calls ? "b" : "a").repeat(64) });
    const r = await w.lauf(); A.equal(r.ok, false); A.equal(w.stats.calls, 1);
  });
  await test("Nicht bestaetigte Sperrfreigabe bleibt auch in Quittung rot", async () => {
    const w = welt(); w.deps.releaseLock = async () => { throw Error("x"); };
    const r = await w.lauf([V.IDS[0]]);
    A.equal(r.ok, false); A.equal(w.beleg().status, "gestoppt");
  });
  await test("Abschluss-Schreibfehler wird nicht gruen", async () => {
    const w = welt(); w.deps.finish = async () => { throw Error("x"); };
    const r = await w.lauf(); A.equal(r.ok, false); A.equal(w.stats.calls, 1);
  });
  await test("Absolute Deadline verhindert Start", async () => {
    const w = welt(); let n = 0;
    await A.rejects(w.lauf(V.IDS, { now: () => ++n === 1 ? 1000000 : 1000000 + V.MAX_MS }), /zeitdeckel/);
    A.equal(w.stats.calls, 0);
  });
  await test("Runtime dreiseitig gebunden, Rerun und Fremdbranch gesperrt", async () => {
    const commit = "a".repeat(40), env = { GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: "ernisch/helmut-pilot",
      GITHUB_REF: "refs/heads/main", GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ATTEMPT: "1", GITHUB_SHA: commit };
    CLI.pruefeRuntime(commit, env, () => commit);
    A.throws(() => CLI.pruefeRuntime(commit, { ...env, GITHUB_RUN_ATTEMPT: "2" }, () => commit));
    A.throws(() => CLI.pruefeRuntime(commit, { ...env, GITHUB_SHA: "b".repeat(40) }, () => commit));
    A.throws(() => CLI.pruefeRuntime(commit, env, () => "b".repeat(40)));
  });
  await test("Vierer-Kostenkennung wird eindeutig zugeordnet; Altläufe bleiben gültig", async () => {
    for (const id of ["verstehen4-12345", "verstehen169-12345", "nachlauf500-12345"])
      A.ok(budget.MANUELLE_RUN_ID.test(id));
    A.ok(!budget.MANUELLE_RUN_ID.test("admin-einzelvorgang-12345"));
  });
  await test("Quittungsabschluss verwendet serverseitiges Compare-and-Set und Rücklesung", async () => {
    const paths = [], data = { nonce: "abc", rev: 1, status: "fertig" };
    const d = adapter({ request: async (p, o) => { paths.push([p, o]); return [{ id: V.QUITTUNG, data }]; } });
    await d.finish(data, 0);
    A.ok(paths[0][0].includes("data->>rev=eq.0")); A.ok(paths[0][0].includes("data->>nonce=eq.abc"));
    A.equal(paths[1][1], undefined);
    const leer = adapter({ request: async () => [] });
    await A.rejects(leer.finish(data, 0), /quittung-nicht/);
  });
  await test("Offene Jobs oder lebende Verstehen-Leases sperren den Start", async () => {
    for (const block of ["jobs", "leases", null]) {
      const d = adapter({
        env: { HELMUT_VERSTEHEN_CAS: "on", HELMUT_UNDERSTANDING_LOCK: "on" },
        storage: { v3StoreReady: () => true }, budget: { aktiv: () => true },
        ai: { isAiEnabled: () => true, aiProviderName: () => "azure", understandingModelName: () => "gpt-5-mini" },
        request: async p => p === "/rest/v1/" ? { paths: { "/rpc/helmut_verstehen_vier_start": {} } }
          : ((block === "jobs" && p.includes("helmut_jobs")) || (block === "leases" && p.includes("reservierungen"))) ? [{}] : []
      });
      if (block) await A.rejects(d.voraussetzungen(), /vier-parallelbetrieb/);
      else await d.voraussetzungen();
    }
  });
  await test("Workflow ist ausschließlich manuell; Planjob hat keine Modellsecrets", async () => {
    const s = fs.readFileSync(path.join(__dirname, "../.github/workflows/verstehen-vier.yml"), "utf8");
    A.ok(!s.includes("schedule:")); A.ok(!s.includes("pull_request:"));
    const plan = s.split("  plan:")[1].split("  ausfuehren:")[0];
    A.ok(!plan.includes("AZURE")); A.ok(!plan.includes("--execute"));
    A.ok(s.includes("github.run_attempt == 1") && s.includes("inputs.runtime_commit == github.sha"));
    A.ok(!s.includes("verstehen-einmalig-169.js"));
  });

  await test("Echter Motor: Erstverstehen, Update, Parteienfehler und Budgetstopp", async () => {
    for (const modus of ["erst", "update", "parteien", "budget", "startantwort-verloren", "providerfehler"]) {
      const w = welt(), id = V.IDS[0], f = w.faelle.get(id);
      if (modus === "update") { f.ko.status = "neu"; f.ko.understanding_status = "complete"; f.ko.verstehen_fencing = 1; f.ko.ko_version = 1; }
      const speicher = {
        verstehenSchreibrecht: async () => ({ verfuegbar: true, ok: true }),
        verstehenSpeichere: async ({ ko }) => {
          f.ko = { ...ko, verstehen_fencing: f.cas.fencing }; f.cas.zustand = "fertig";
          f.cas.ergebnis_fencing = f.cas.fencing; f.cas.besitzer = null; f.cas.lease_bis = null;
          return { verfuegbar: true, ergebnis: "gespeichert" };
        },
        verstehenAusgangUnbekannt: async () => {
          f.cas.zustand = "unbekannt"; f.cas.besitzer = null; f.cas.lease_bis = null;
          return { verfuegbar: true, blockiert: true };
        },
        verstehenVormerkungLese: async () => ({ verfuegbar: true, eintraege: modus === "update" ? { [id]: 1 } : {} }),
        verstehenVormerkungErhoehe: async () => ({ verfuegbar: true, fehlversuche: 1 }),
        verstehenVormerkungLoese: async () => ({ verfuegbar: true, ok: true })
      };
      const d = adapter({
        env: { HELMUT_VERSTEHEN_CAS: "on" }, storage: speicher,
        request: async (p, opts) => {
          if (p.includes("/rpc/")) {
            const a = JSON.parse(opts.body);
            A.equal(f.cas.zustand, "unbekannt"); f.cas.zustand = "modell-laeuft";
            f.cas.fencing++; f.cas.ki_aufrufe++; f.cas.versuche++;
            f.cas.besitzer = a.p_besitzer; f.cas.lease_bis = new Date(Date.now() + 300000).toISOString();
            if (modus === "startantwort-verloren") throw Error("verbindung-abgebrochen");
            return [{ erlaubt: true, fencing: f.cas.fencing }];
          }
          return [clone(f.cas)];
        },
        motorBasis: () => ({
          canSpend: async () => ({ allowed: modus !== "budget" }),
          requestUnderstanding: async () => {
            w.stats.calls++; w.setKosten(.006);
            if (modus === "providerfehler") throw Error("anbieter-fehler");
            return { headline: "Test", was_ist_passiert: "x", warum_wichtig: "y", wer_ist_betroffen: "z",
              parteien: modus === "parteien" ? ["Fantasiepartei"] : [], ausschuesse: [], ministerien: [],
              risiken: [], chancen: [], zeitdruck: "mittel", handlungsempfehlung: "a", confidence_score: 70,
              display_title: "Test", display_summary: "s", why_relevant: "w", recommendation: "r",
              display_category: "Sozialpolitik" };
          },
          saveSources: async () => {}, markFailed: async () => {},
          modelName: () => "gpt-5-mini", logSkip: () => {}, gateMode: () => "off"
        })
      });
      w.deps.motorDeps = d.motorDeps;
      const r = await w.lauf([id], { motor: require("../lib/helmut/understanding").understandOneCluster });
      if (["erst", "update"].includes(modus)) {
        A.equal(r.ok, true, modus + " " + JSON.stringify(r)); A.equal(w.stats.calls, 1);
      } else {
        A.equal(r.ok, false, modus);
        A.ok(["unbekannt", "modell-laeuft"].includes(f.cas.zustand), modus);
        A.equal(w.stats.calls, ["budget", "startantwort-verloren"].includes(modus) ? 0 : 1, modus);
      }
    }
  });
  console.log("Verstehen vier: " + count + "/" + count + " bestanden");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
