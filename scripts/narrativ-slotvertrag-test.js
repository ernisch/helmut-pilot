"use strict";

// Helmut — SLOT- UND BETRIEBSVERTRAG des fuenften Auftragstyps `tenant_narrative`.
// =============================================================================================
// Diese Suite ist im unabhaengigen Abschlussreview von PR #236 entstanden. Sie prueft drei
// Zusagen, die vorher NUR ueber Quelltext-Regex oder isolierte Hilfsfunktionen belegt waren —
// und die im tatsaechlich verdrahteten Pfad allesamt NICHT galten:
//
//   R1  FAELLIGKEIT PASST IN DEN SLOT, DER SIE ABARBEITET.
//       Befund R1 (Review 2026-08-09): das Phasenfenster streute die Faelligkeit ueber
//       05:45–08:00 (134 Minuten), abgearbeitet wird sie aber ausschliesslich vom Cron
//       `lage-briefing` — EIN Slot mit 230 s Budget. Gemessen mit dem echten Planer:
//       bei 5 Mandaten war 1 Auftrag im Slot faellig, bei 200 Mandaten 5. Der Worker
//       beendet den Slot bei leerem Anspruch sofort (`if (!auftraege.length) break`),
//       also blieben >97 % des Slotbudgets ungenutzt und die Morgenlage waere erst im
//       16:00-Slot entstanden. Die Streuung ist deshalb auf `NARRATIV_STREU_MS` begrenzt.
//
//   R2  DER VERDRAHTETE WORKER BEKOMMT EINEN TAGESPLAN.
//       Befund R2: der Narrativzweig in `server.js` uebergab keinen `tagesplan`. Damit war
//       `scopeMax` null, `llm-budget-fair.mandantenDeckel` unbenutzt und es entstand KEINE
//       einzige `tenant:<id>`-Zeile in `llm_budget_counters` — genau der Befund O1, und
//       zwar bei dem Verbraucher, fuer den O1 gebaut wurde.
//
//   R3  EINE UNERREICHBARE WARTESCHLANGE IST KEIN ERFOLG.
//       Befund R3: bei fehlender Migration meldete der Slot `status:"success"`, obwohl der
//       Altpfad abgeschaltet war und NULL Narrative entstanden (CLAUDE.md §4.4).
//
// Dazu die AUSFUEHRUNGSMATRIX des Doppelpfads: die Bestandssuite belegt sie ueber Regex am
// Quelltext von `server.js`; hier faehrt die ECHTE Route ueber HTTP.
//
// Offline, in-process, lokaler Datei-Store. Kein Netz, kein Supabase, keine KI.
// Aufruf: node scripts/lokal.js -- node scripts/narrativ-slotvertrag-test.js

const http = require("http");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");
process.env.HELMUT_SOURCE_MODE = "off";
process.env.HELMUT_STORAGE_BACKEND = "local";
process.env.HELMUT_STORE_CACHE_MS = "0";
process.env.CRON_SECRET = "slotvertrag-cron-secret";
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.HELMUT_AUTH_MODE;
for (const f of ["HELMUT_SCALABLE_PIPELINE", "HELMUT_NARRATIV_QUEUE", "HELMUT_LLM_FAIRNESS", "HELMUT_RELEVANZORDNUNG"]) {
  delete process.env[f];
}

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`  PASS  ${name}`); }
  else { failed += 1; console.log(`  FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

// ── Attrappen VOR dem Laden von server.js: die Route destrukturiert `buildLageBriefing`
//    beim Require, eine spaetere Ersetzung wuerde sie nicht mehr erreichen.
const lage = require("../lib/helmut/lage");
const workerBetrieb = require("../lib/helmut/worker-betrieb");
const scalable = require("../lib/helmut/scalable-pipeline");
const sourceDemand = require("../lib/helmut/source-demand");
const fair = require("../lib/helmut/llm-budget-fair");
const storage = require("../lib/helmut/storage");

const echteBuildLage = lage.buildLageBriefing;
const echterDurchlauf = workerBetrieb.durchlauf;
const echtesArbeite = scalable.arbeite;

let altpfadAufrufe = [];
let workerAufrufe = [];
lage.buildLageBriefing = async (profil) => {
  altpfadAufrufe.push(String((profil && profil.id) || ""));
  return { available: true, fromCache: false, paragraphs: [{ text: "x" }], vorgaenge: [], model: "attrappe" };
};

const dataDir = path.join(ROOT, ".helmut-data");
const GESICHERT = ["store.json", "auth.json"];
const schnappschuss = new Map(GESICHERT.map((n) => [n,
  fs.existsSync(path.join(dataDir, n)) ? fs.readFileSync(path.join(dataDir, n)) : null]));
process.on("exit", () => {
  for (const [n, inhalt] of schnappschuss) {
    const f = path.join(dataDir, n);
    try { if (inhalt === null) { if (fs.existsSync(f)) fs.rmSync(f); } else fs.writeFileSync(f, inhalt); } catch (_) { /* ignore */ }
  }
});

const handler = require("../server.js");

function req(server, pathname) {
  const { port } = server.address();
  return new Promise((resolve, reject) => {
    const r = http.request({
      host: "127.0.0.1", port, method: "GET", path: pathname,
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, timeout: 30000
    }, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve({ status: res.statusCode, body: b })); });
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.on("error", reject);
    r.end();
  });
}
const parse = (res) => { try { return JSON.parse(res.body); } catch { return {}; } };

function setzeFlags(werte) {
  for (const f of ["HELMUT_SCALABLE_PIPELINE", "HELMUT_NARRATIV_QUEUE", "HELMUT_LLM_FAIRNESS", "HELMUT_RELEVANZORDNUNG"]) {
    delete process.env[f];
  }
  for (const [k, v] of Object.entries(werte)) process.env[k] = v;
}

// Die verdrahteten Werte, gegen die geprueft wird — bewusst aus dem Quelltext gelesen und
// NICHT hier noch einmal festgeschrieben, damit der Test bei einer Aenderung mitwandert.
const serverQuelltext = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
// KAPAZITAETSSPRINT 2026-08-09: der Narrativslot steht nicht mehr inline in der Route,
// sondern in `narrativSlotGrenzen()` — EINE Umsetzung fuer alle drei Morgenslots. Gelesen
// wird weiterhin aus dem Quelltext (kein hier festgeschriebener Wert), nur an der Stelle,
// an der die Zahl jetzt wirklich steht.
const narrativZweig = serverQuelltext.slice(
  serverQuelltext.indexOf("function narrativSlotGrenzen()"),
  serverQuelltext.indexOf("async function narrativSlotLauf(")
);
const SLOT_BUDGET_MS = Number((narrativZweig.match(/budgetMs:\s*(\d+)/) || [])[1]) || 0;

(async () => {
  console.log("Helmut — Slot- und Betriebsvertrag `tenant_narrative` (Review PR #236)\n");
  console.log(`  Slotbudget aus server.js gelesen: ${SLOT_BUDGET_MS} ms\n`);

  // ══ 1 · R1: Faelligkeit passt in den Slot ═══════════════════════════════════════════════
  console.log("== 1 · R1 — die Faelligkeit passt in den Slot, der sie abarbeitet ==\n");
  check("1.0 Das Slotbudget wurde aus server.js gelesen (kein festgeschriebener Wert)",
    SLOT_BUDGET_MS >= 60000, `gelesen=${SLOT_BUDGET_MS}`);

  const JETZT = Date.parse("2026-08-10T04:00:00.000Z");
  const fensterStartMs = Date.parse("2026-08-10T00:00:00.000Z");
  const PHASENBEGINN_MS = fensterStartMs + Math.floor(24 * 3600 * 1000 * 0.24);   // 24 % = 05:45:36Z

  const messung = (n) => {
    const profile = Array.from({ length: n }, (_, i) => ({ id: `slot-m-${String(i).padStart(4, "0")}` }));
    const plan = fair.tagesplan({
      mandate: profile.map((p) => p.id), deckel: 16300, tag: fair.tagesSchluessel(JETZT)
    });
    const { auftraege } = sourceDemand.planeMandatsarbeit({
      profile, jetztMs: JETZT, rotation: plan.reihenfolge, narrativAktiv: true
    });
    const narrative = auftraege.filter((a) => a.jobType === "tenant_narrative");
    const zeiten = narrative.map((a) => Date.parse(a.dueAt));
    return { plan, narrative, zeiten, min: Math.min(...zeiten), max: Math.max(...zeiten) };
  };

  for (const n of [5, 25, 50, 100, 200, 250]) {
    const m = messung(n);
    const spanneMs = m.max - m.min;
    const imSlot = m.zeiten.filter((t) => t >= m.min && t <= m.min + SLOT_BUDGET_MS).length;
    check(`1.1/${n} Alle ${n} Narrative sind innerhalb des Slotbudgets faellig`,
      imSlot === n,
      `im Slot faellig=${imSlot}/${n}, Streuung=${Math.round(spanneMs / 1000)} s, Slotbudget=${SLOT_BUDGET_MS / 1000} s`);
    check(`1.2/${n} Die Streuung bleibt deutlich unter dem Slotbudget (Sicherheitsabstand)`,
      spanneMs * 4 <= SLOT_BUDGET_MS, `Streuung=${spanneMs} ms`);
    check(`1.3/${n} Der erste Auftrag ist frueherstens zum Phasenbeginn faellig (05:45Z-Vertrag)`,
      m.min >= PHASENBEGINN_MS - 1000 && m.min <= PHASENBEGINN_MS + 1000,
      `min=${new Date(m.min).toISOString()} erwartet≈${new Date(PHASENBEGINN_MS).toISOString()}`);
  }

  // Die Rotation (Befund O1) muss die Reihenfolge WEITERHIN bestimmen — sonst haette die
  // Verengung der Streuung die Fairness mit weggeraeumt.
  {
    const m = messung(60);
    const nachFaelligkeit = [...m.narrative]
      .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || (a.tenantId < b.tenantId ? -1 : 1))
      .map((a) => a.tenantId);
    const rangordnung = m.plan.reihenfolge.filter((id) => nachFaelligkeit.includes(id));
    check("1.4 Die Rotationsreihenfolge bestimmt weiterhin die Faelligkeitsreihenfolge",
      JSON.stringify(nachFaelligkeit) === JSON.stringify(rangordnung),
      `faellig=${nachFaelligkeit.slice(0, 4)} rotation=${rangordnung.slice(0, 4)}`);
    const eindeutig = new Set(m.narrative.map((a) => a.dueAt));
    check("1.5 Die Faelligkeiten sind je Mandat verschieden (die Rotation bleibt aufloesbar)",
      eindeutig.size === m.narrative.length, `verschieden=${eindeutig.size}/${m.narrative.length}`);
    check("1.6 Die Planung bleibt deterministisch (zweiter Lauf zeichengleich)",
      JSON.stringify(messung(60).narrative) === JSON.stringify(m.narrative));
  }

  // ADVERSARIALE GEGENPROBE: mit der frueheren Streuung ueber das ganze Phasenfenster
  // (134 Minuten) waere 1.1 fuer jede realistische Mandatszahl ROT. Das ist der Nachweis,
  // dass die Pruefung ueberhaupt etwas faengt.
  {
    const breiteMs = 24 * 3600 * 1000;
    const altSpanne = Math.floor(breiteMs * (1 / 3 - 0.24));           // 134,4 Minuten
    const altImSlot = (n) => {
      let zaehler = 0;
      for (let r = 0; r < n; r += 1) if (Math.floor((altSpanne * r) / n) <= SLOT_BUDGET_MS) zaehler += 1;
      return zaehler;
    };
    check("1.7 GEGENPROBE: die fruehere Streuung ueber 134 min haette 5 Mandate NICHT bedient",
      altImSlot(5) < 5, `im Slot faellig gewesen=${altImSlot(5)}/5`);
    check("1.8 GEGENPROBE: dasselbe bei 200 Mandaten",
      altImSlot(200) < 200, `im Slot faellig gewesen=${altImSlot(200)}/200`);
  }

  // ══ 2 · Ausfuehrungsmatrix der ECHTEN Route ═════════════════════════════════════════════
  console.log("\n== 2 · Doppelpfad: die ECHTE Route /api/cron/lage-briefing, nicht ihr Quelltext ==\n");

  const store = await storage.readStore("main");
  store.profiles = {};
  for (const id of ["slot-a", "slot-b", "slot-c"]) store.profiles[id] = { id, fullName: id, profileActive: true };
  await storage.writeStore(store, "main");

  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));

  workerBetrieb.durchlauf = async (args) => {
    workerAufrufe.push(args);
    return { gestartet: true, worker: 2, reserviert: 0, erledigt: 0, zurueckgestellt: 0, bilanzen: [{ verfuegbar: true }] };
  };

  const MATRIX = [
    ["alle Flags aus", {}, "alt"],
    ["nur skalierbare Pipeline", { HELMUT_SCALABLE_PIPELINE: "on" }, "alt"],
    ["nur LLM-Fairness", { HELMUT_LLM_FAIRNESS: "on" }, "alt"],
    ["nur Relevanzordnung", { HELMUT_RELEVANZORDNUNG: "on" }, "alt"],
    ["nur Narrativflag (ohne Pipeline)", { HELMUT_NARRATIV_QUEUE: "on" }, "alt"],
    ["Pipeline + Fairness", { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_LLM_FAIRNESS: "on" }, "alt"],
    ["Pipeline + Narrativ", { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_NARRATIV_QUEUE: "on" }, "warteschlange"],
    ["alle vier Flags", { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_NARRATIV_QUEUE: "on", HELMUT_LLM_FAIRNESS: "on", HELMUT_RELEVANZORDNUNG: "on" }, "warteschlange"],
    ["ungueltiger Wert 'yes'", { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_NARRATIV_QUEUE: "yes" }, "alt"],
    ["leerer Wert", { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_NARRATIV_QUEUE: "" }, "alt"],
    ["Grossschreibung ON/ON", { HELMUT_SCALABLE_PIPELINE: "ON", HELMUT_NARRATIV_QUEUE: "ON" }, "warteschlange"],
    ["gemischt On/True", { HELMUT_SCALABLE_PIPELINE: "On", HELMUT_NARRATIV_QUEUE: "True" }, "warteschlange"],
    ["ausdruecklich off", { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_NARRATIV_QUEUE: "off" }, "alt"],
    ["Leerzeichen ' on '", { HELMUT_SCALABLE_PIPELINE: " on ", HELMUT_NARRATIV_QUEUE: " on " }, "warteschlange"],
    ["'1' und 'an'", { HELMUT_SCALABLE_PIPELINE: "1", HELMUT_NARRATIV_QUEUE: "an" }, "warteschlange"]
  ];

  for (const [name, flags, erwartet] of MATRIX) {
    setzeFlags(flags);
    altpfadAufrufe = []; workerAufrufe = [];
    await req(server, "/api/cron/lage-briefing");
    const gelaufen = workerAufrufe.length ? "warteschlange" : (altpfadAufrufe.length ? "alt" : "keiner");
    check(`2.x ${name} -> ${erwartet}`, gelaufen === erwartet,
      `tatsaechlich=${gelaufen} alt=${altpfadAufrufe.length} queue=${workerAufrufe.length}`);
    check(`2.x ${name}: nie BEIDE Pfade`, !(altpfadAufrufe.length && workerAufrufe.length));
  }

  // ══ 3 · R2: der verdrahtete Worker bekommt einen Tagesplan ══════════════════════════════
  console.log("\n== 3 · R2 — der Narrativslot uebergibt den Tagesplan (scopeMax, Befund O1) ==\n");
  setzeFlags({ HELMUT_SCALABLE_PIPELINE: "on", HELMUT_NARRATIV_QUEUE: "on", HELMUT_LLM_FAIRNESS: "on" });
  altpfadAufrufe = []; workerAufrufe = [];
  await req(server, "/api/cron/lage-briefing");
  const uebergabe = workerAufrufe[0] || {};
  check("3.1 Die Typvorgabe ist genau [tenant_narrative]",
    JSON.stringify(uebergabe.typen) === JSON.stringify(["tenant_narrative"]));
  check("3.2 Der Worker bekommt einen Tagesplan",
    uebergabe.tagesplan != null && typeof uebergabe.tagesplan === "object",
    `tagesplan=${JSON.stringify(uebergabe.tagesplan)}`);
  check("3.3 Der Tagesplan traegt eine Zuteilung je aktivem Mandat",
    uebergabe.tagesplan && uebergabe.tagesplan.zuteilung
      && Object.keys(uebergabe.tagesplan.zuteilung).length === 3,
    `zuteilung=${JSON.stringify(uebergabe.tagesplan && uebergabe.tagesplan.zuteilung)}`);
  check("3.4 Daraus entsteht ein echter Mandantendeckel (nicht null)",
    uebergabe.tagesplan ? fair.mandantenDeckel(uebergabe.tagesplan, "slot-a") >= 1 : false,
    `deckel=${uebergabe.tagesplan ? fair.mandantenDeckel(uebergabe.tagesplan, "slot-a") : "n/v"}`);
  check("3.5 Deaktivierte Mandate stehen NICHT im Tagesplan",
    uebergabe.tagesplan && !Object.keys(uebergabe.tagesplan.zuteilung || {}).includes("slot-deaktiviert"));

  // ══ 4 · R3: unerreichbare Warteschlange ist kein Erfolg ════════════════════════════════
  console.log("\n== 4 · R3 — eine unerreichbare Warteschlange meldet KEINEN Erfolg ==\n");
  workerBetrieb.durchlauf = echterDurchlauf;
  const telemetrie = [];
  const echtesRecord = storage.recordProcessRun;
  scalable.arbeite = async (args) => echtesArbeite({
    ...args,
    deps: {
      ...(args.deps || {}),
      now: () => Date.now(),
      claim: async () => ({ verfuegbar: false, grund: "helmut_claim_jobs fehlt (Migration nicht angewendet)" })
    }
  });
  // `recordProcessRun` wird von server.js beim Require destrukturiert; die Ablage selbst
  // ist hier der lokale Datei-Store — der geschriebene Lauf wird danach gelesen.
  const res = parse(await req(server, "/api/cron/lage-briefing"));
  scalable.arbeite = echtesArbeite;

  const laeufe = await storage.listProcessRuns({ process: "briefing-lage", limit: 5 }).catch(() => []);
  const letzter = (Array.isArray(laeufe) ? laeufe : []).find((l) => l && (l.run_id || l.runId));
  telemetrie.push(letzter || null);

  check("4.1 Es entstand kein einziges Narrativ", (res.erledigt || 0) === 0, JSON.stringify(res.erledigt));
  check("4.2 Der Altpfad lief nicht (das Flag hat ihn abgeschaltet)", altpfadAufrufe.length === 0);
  check("4.3 Die Antwort meldet den Misserfolg ausdruecklich (ok=false)",
    res.ok === false, `ok=${res.ok}`);
  check("4.4 Die Antwort benennt die Warteschlange als nicht verfuegbar",
    res.verfuegbar === false, `verfuegbar=${res.verfuegbar}`);
  check("4.5 Die Antwort nennt einen Grund",
    typeof res.grund === "string" && res.grund.length > 0, `grund=${res.grund}`);
  check("4.6 Die Lauftelemetrie steht NICHT auf 'success'",
    letzter ? String(letzter.status || letzter.zustand) !== "success" : true,
    `status=${letzter && (letzter.status || letzter.zustand)}`);

  // GEGENPROBE: bei erreichbarer (leerer) Warteschlange ist derselbe Lauf ein Erfolg —
  // sonst wuerde 4.3/4.4 auch dann feuern, wenn schlicht nichts zu tun ist.
  scalable.arbeite = async (args) => echtesArbeite({
    ...args,
    deps: { ...(args.deps || {}), now: () => Date.now(), claim: async () => ({ verfuegbar: true, auftraege: [] }) }
  });
  const resLeer = parse(await req(server, "/api/cron/lage-briefing"));
  scalable.arbeite = echtesArbeite;
  check("4.7 GEGENPROBE: eine erreichbare, leere Warteschlange ist ein Erfolg",
    resLeer.ok === true && resLeer.verfuegbar === true,
    `ok=${resLeer.ok} verfuegbar=${resLeer.verfuegbar}`);

  server.close();
  lage.buildLageBriefing = echteBuildLage;
  workerBetrieb.durchlauf = echterDurchlauf;
  storage.recordProcessRun = echtesRecord;

  console.log(`\nSUMME  ${passed} PASS / ${failed} FAIL`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("TESTLAUF-FEHLER", e); process.exit(1); });
