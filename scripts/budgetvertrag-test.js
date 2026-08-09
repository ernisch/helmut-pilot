"use strict";

// Helmut — DER BUDGETVERTRAG, an echter PostgreSQL nachgemessen (OP-30, Befund R4).
// =============================================================================================
// WARUM ES DIESE SUITE GIBT.
// Der unabhaengige Abschlussreview von PR #236 hat an echter PostgreSQL gemessen: bei aktiver
// LLM-Fairness zaehlte EIN fachlicher Modellaufruf ZWEIMAL gegen den Tagesdeckel
// (`global.used = 2`). Ursache: zwei Schreiber auf derselben Zaehlerzeile — die
// Fairnessschicht (`helmut_reserve_llm_result`) und der Choke-Point (`helmut_reserve_llm_call`,
// ai.js `requestOpenAI`). Ein Deckel, der bei der Haelfte schliesst, ist kein Deckel.
//
// Diese Suite prueft den VOLLSTAENDIGEN Budgetvertrag — nicht nur die eine Zahl:
//
//   1. Eine fachliche Modellnutzung wird genau EINMAL verbucht.
//   2. Eine Reservierung ist noch KEIN endgueltiger Verbrauch.
//   3. Ein Cachetreffer ohne Modellaufruf verbraucht KEIN Modellbudget.
//   4. Tatsaechlich entstandene Kosten gehen NICHT verloren.
//   5. Nicht verbrauchtes reserviertes Budget wird nach klaren Regeln freigegeben.
//   6. Wiederholungen zaehlen Kosten weder doppelt noch verschweigen sie sie.
//   7. Mandantenbudget und globales Budget bleiben ATOMAR geschuetzt.
//   8. Unbekannte Modelle/Kosten bleiben sicher geschlossen (nie stillschweigend 0).
//   9. Gleichzeitige Worker erzeugen KEINE Ueberbuchung.
//  10. Alle Kosten bleiben dem richtigen Mandat zugeordnet.
//  11. Altpfad und ausgeschaltete OP-30-Flags bleiben unveraendert.
//
// WAS HIER ECHT IST — und was Attrappe:
//   ECHT: die Migration, die SQL-Funktionen, die Transaktionen, die Gleichzeitigkeit, der
//         echte `budgetAdapter` aus `scalable-pipeline.js`, der echte Handler
//         `HANDLER.tenant_narrative`, die echte Politik aus `llm-budget-fair.js` und die
//         echte Kostenklassifikation aus `cost-model.js`.
//   ATTRAPPE: ausschliesslich `lage.buildLageBriefing` — sie steht fuer den Modellaufruf.
//         Und genau dort, wo die echte Funktion das Modell rufen wuerde, ruft die Attrappe
//         den ECHTEN Choke-Point `helmut_reserve_llm_call` in derselben Datenbank. Der
//         Zaehlerpfad ist damit vollstaendig echt; nur das Modell selbst fehlt (offline).
//
// KONFIGURATION (alles ueber Env, nichts hartkodiert, keine Geheimnisse):
//   HELMUT_TEST_PG_HOST  Socket-Verzeichnis oder Host (fehlt er -> Suite meldet OFFEN)
//   HELMUT_TEST_PG_PORT  Default 5433
//   HELMUT_TEST_PG_USER  Default helmut
//   HELMUT_TEST_PG_DB_BUDGETVERTRAG  Default helmut_test_budgetvertrag (eigene Datenbank)
//
// OFFLINE: `psql` verbindet ausschliesslich lokal. Kein externes Netz, keine KI, keine Kosten.

const { execFileSync, spawn } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const M_ZAEHLER = path.join(ROOT, "supabase", "migrations", "20260717_llm_budget_reservation.sql");
// MUTATIONSPROBE: `scripts/budgetvertrag-mutationsprobe-test.js` legt eine absichtlich
// verdorbene Kopie der Migration an und laesst DIESE Suite dagegen laufen. Bleibt sie dann
// gruen, prueft sie nichts. Ohne die Variable ist der Pfad die echte Migration.
const M_FAIR = process.env.HELMUT_TEST_BUDGET_MUTATION_SQL
  || path.join(ROOT, "supabase", "migrations", "20260808_llm_budget_fairness.sql");
const R_FAIR = path.join(ROOT, "supabase", "migrations", "20260808_llm_budget_fairness_rollback.sql");

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: process.env.HELMUT_TEST_PG_DB_BUDGETVERTRAG || "helmut_test_budgetvertrag"
};

const TAG = "2026-08-09";

let pass = 0;
let fail = 0;
let offen = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function offenPunkt(name, grund) { offen += 1; console.log(`  OFFEN ${name} — ${grund}`); }
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

function psql(sql, { datei = null, db = PG.db, erwarteFehler = false } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-tA", "-v", "ON_ERROR_STOP=1"];
  if (datei) args.push("-f", datei); else args.push("-c", sql);
  try {
    return { ok: true, out: execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
  } catch (error) {
    if (!erwarteFehler) throw error;
    return { ok: false, out: String((error.stderr || error.stdout || error.message) || "").trim() };
  }
}

// ECHT nebenlaeufiger psql-Aufruf (spawn, nicht spawnSync — sonst laufen die "gleichzeitigen"
// Worker in Wahrheit nacheinander und die Suite prueft die Gleichzeitigkeit gar nicht).
function psqlAsync(sql) {
  return new Promise((resolve) => {
    const kind = spawn("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", PG.db, "-tA", "-c", sql],
      { stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; let err = "";
    kind.stdout.on("data", (d) => { out += d; });
    kind.stderr.on("data", (d) => { err += d; });
    kind.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
  });
}

function sqlText(v) { return `'${String(v).replace(/'/g, "''")}'`; }
function sqlZahl(v) { return v == null ? "null" : String(Math.floor(Number(v))); }

// ── Der Speicher der Budgetschicht, gegen die ECHTE Datenbank ────────────────────────────
// Dieselbe Schnittstelle, die `storage.js` fuer `budgetAdapter` bereitstellt
// (llmReserveResult / llmSettleResult / llmReleaseResult) — nur ohne PostgREST dazwischen.
const speicher = {
  async reserviere({ resultKey, day, scope, workClass, globalMax, scopeMax, ttlMs = 900000 }) {
    const r = psql(`select erlaubt, wiederverwendet, coalesce(grund,''), global_verbraucht, scope_verbraucht `
      + `from public.helmut_reserve_llm_result(${sqlText(resultKey)}, ${sqlText(day)}, ${sqlText(scope)}, `
      + `${sqlText(workClass || "notwendig")}, ${sqlZahl(globalMax)}, ${sqlZahl(scopeMax)}, ${sqlZahl(ttlMs)})`);
    const [erlaubt, wieder, grund, g, s] = r.out.split("|");
    return {
      verfuegbar: true,
      erlaubt: erlaubt === "t",
      wiederverwendet: wieder === "t",
      grund: grund || null,
      globalVerbraucht: Number(g) || 0,
      scopeVerbraucht: Number(s) || 0
    };
  },
  async melde({ resultKey, ok = true, note = null }) {
    const r = psql(`select uebernommen, coalesce(neuer_status,'') from public.helmut_settle_llm_reservation(`
      + `${sqlText(resultKey)}, ${ok ? "true" : "false"}, ${note == null ? "null" : sqlText(note)})`);
    const [u, st] = r.out.split("|");
    return { verfuegbar: true, uebernommen: u === "t", status: st || null };
  },
  async gib_frei({ resultKey, note = null }) {
    const r = psql(`select zurueckgegeben from public.helmut_release_llm_reservation(`
      + `${sqlText(resultKey)}, ${note == null ? "null" : sqlText(note)})`);
    return { verfuegbar: true, zurueckgegeben: r.out === "t" };
  }
};

// Der Choke-Point: GENAU das, was `storage.reserveLlmCall` in Production tut. Die Attrappe des
// Modellaufrufs ruft ihn — damit ist der Zaehlerpfad echt.
function chokePoint(deckel) {
  const r = psql(`select allowed, used from public.helmut_reserve_llm_call(${sqlText(TAG)}, 'global', ${sqlZahl(deckel)})`);
  const [a, u] = r.out.split("|");
  return { allowed: a === "t", used: Number(u) || 0 };
}

function zaehler(scope = "global") {
  const r = psql(`select coalesce((select used from public.llm_budget_counters where day=${sqlText(TAG)} and scope=${sqlText(scope)}),0)`);
  return Number(r.out) || 0;
}
function reservierungen(bedingung = "true") {
  return Number(psql(`select count(*) from public.llm_reservations where day=${sqlText(TAG)} and ${bedingung}`).out) || 0;
}
function leere() {
  psql("delete from public.llm_reservations; delete from public.llm_budget_counters;");
}

// ── Der echte Handler und der echte Adapter ──────────────────────────────────────────────
const pipeline = require(path.join(ROOT, "lib", "helmut", "scalable-pipeline.js"));
const fair = require(path.join(ROOT, "lib", "helmut", "llm-budget-fair.js"));
const kosten = require(path.join(ROOT, "lib", "helmut", "cost-model.js"));

const DECKEL = 100;
const ENV_AN = {
  HELMUT_SCALABLE_PIPELINE: "on",
  HELMUT_NARRATIV_QUEUE: "on",
  HELMUT_LLM_FAIRNESS: "on",
  HELMUT_MAX_LLM_CALLS_PER_DAY: String(DECKEL)
};

function tagesplanFuer(mandate, deckel = DECKEL, jeMandat = 3) {
  const bedarf = Object.fromEntries(mandate.map((m) => [m, { notwendig: jeMandat, optional: 0 }]));
  const plan = fair.tagesplan({ mandate, deckel, tag: TAG, bedarf, env: {} });
  plan.global = fair.globalerTopf({ deckel, mandatsBedarf: mandate.length, env: {} });
  return plan;
}

// Die Attrappe des Lage-Narrativs. `verhalten` beschreibt, was die ECHTE Funktion in diesem
// Szenario liefern wuerde; `ruftModell` sagt, ob dabei wirklich ein Modell gerufen wird.
function narrativAttrappe(verhalten) {
  return async () => {
    if (verhalten.ruftModell) {
      const g = chokePoint(verhalten.deckel == null ? DECKEL : verhalten.deckel);
      if (!g.allowed) return { available: false, reason: "budget" };
      if (verhalten.wirft) throw new Error(verhalten.wirft);
      if (verhalten.danach) return verhalten.danach;
    }
    if (verhalten.wirftOhneModell) throw new Error(verhalten.wirftOhneModell);
    return verhalten.ergebnis;
  };
}

function depsFuer(verhalten, { tagesplan = null, env = ENV_AN, profil = { user_id: "m1" } } = {}) {
  return {
    env,
    now: () => Date.parse(`${TAG}T05:45:00.000Z`),
    budget: pipeline.budgetAdapter({ env, deps: { budgetSpeicher: speicher, fair, now: () => Date.parse(`${TAG}T05:45:00.000Z`) }, tagesplan }),
    getActiveProfile: async () => profil,
    istDeaktiviert: () => false,
    offeneVorbedingungen: async () => ({ verfuegbar: true, offen: 0, wartend: 0, laufend: 0 }),
    lageNarrativ: narrativAttrappe(verhalten)
  };
}

function auftrag(mandatsId = "m1", fenster = "w1", id = "job-1") {
  return {
    id, type: "tenant_narrative", payload: { mandatsId },
    freshnessWindow: fenster, createdAt: `${TAG}T05:40:00.000Z`
  };
}

async function main() {
  console.log("=== BUDGETVERTRAG — ECHTE POSTGRESQL (OP-30 / Befund R4) ===");

  if (!PG.host) {
    abschnitt("Datenbanknachweis");
    offenPunkt("Budgetvertrag an echter PostgreSQL",
      "HELMUT_TEST_PG_HOST ist nicht gesetzt — kein lokaler Server erreichbar. "
      + "Der Nachweis ist damit AUSDRUECKLICH OFFEN (kein falsches Gruen).");
    console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  OFFEN ${offen}`);
    process.exit(0);
  }

  console.log(`Server: ${PG.host}:${PG.port} · Datenbank ${PG.db} · ${psql("select version()", { db: "postgres" }).out.split(",")[0]}`);
  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  psql(`create database ${PG.db}`, { db: "postgres" });
  psql(null, { datei: M_ZAEHLER });
  psql(null, { datei: M_FAIR });

  try {
    // ══ 1 · NORMALER ERFOLGREICHER MODELLAUFRUF ═════════════════════════════════════════
    abschnitt("1 · Normaler erfolgreicher Modellaufruf");
    leere();
    const plan1 = tagesplanFuer(["m1"]);
    let e = await pipeline.HANDLER.tenant_narrative(auftrag(), depsFuer({
      ruftModell: true, danach: { available: true, fromCache: false, paragraphs: ["a"], vorgaenge: [1], model: "gpt-5-mini" }
    }, { tagesplan: plan1 }));
    check("1.1 Der Auftrag ist erfolgreich und das Narrativ veroeffentlicht", e.ok === true && e.veroeffentlicht === true, JSON.stringify(e));
    check("1.2 GENAU EINE Buchung im Tageszaehler (Befund R4 behoben)", zaehler() === 1, `global.used = ${zaehler()} (vor der Korrektur: 2)`);
    check("1.3 Die Reservierung ist abgeschlossen, nicht offen", reservierungen("status='verbraucht'") === 1 && reservierungen("status='reserviert'") === 0);
    check("1.4 Die Kosten sind dem richtigen Mandat zugeordnet", reservierungen("scope='tenant:m1'") === 1);

    // ══ 2 · CACHETREFFER ════════════════════════════════════════════════════════════════
    abschnitt("2 · Cachetreffer (kein Modellaufruf)");
    leere();
    e = await pipeline.HANDLER.tenant_narrative(auftrag(), depsFuer({
      ruftModell: false, ergebnis: { available: true, fromCache: true, paragraphs: ["a"], vorgaenge: [1] }
    }, { tagesplan: plan1 }));
    check("2.1 Der Auftrag ist erfolgreich", e.ok === true && e.ausCache === true);
    check("2.2 KEIN Modellbudget verbraucht", zaehler() === 0, `global.used = ${zaehler()}`);
    check("2.3 Die Reservierung wurde ausdruecklich zurueckgegeben", reservierungen("status='zurueckgegeben'") === 1);
    check("2.4 Der Bereichsanteil ist wieder frei (eine Rueckgabe zaehlt nicht)",
      reservierungen("scope='tenant:m1' and status in ('reserviert','verbraucht','fehlgeschlagen')") === 0);

    // ══ 3 · CACHEFEHLER MIT MODELLAUFRUF ════════════════════════════════════════════════
    abschnitt("3 · Cachefehler mit Modellaufruf");
    leere();
    e = await pipeline.HANDLER.tenant_narrative(auftrag("m1", "w2"), depsFuer({
      ruftModell: true, danach: { available: true, fromCache: false, paragraphs: ["a"], vorgaenge: [1] }
    }, { tagesplan: plan1 }));
    check("3.1 Genau eine Buchung", zaehler() === 1 && e.ok === true, `global.used = ${zaehler()}`);
    check("3.2 Genau eine verbrauchte Reservierung", reservierungen("status='verbraucht'") === 1);

    // ══ 4 · ABBRUCH VOR DER MODELLNUTZUNG ═══════════════════════════════════════════════
    abschnitt("4 · Abbruch VOR der Modellnutzung");
    leere();
    e = await pipeline.HANDLER.tenant_narrative(auftrag(), depsFuer({
      ruftModell: false, ergebnis: { available: false, reason: "generating" }
    }, { tagesplan: plan1 }));
    check("4.1 Der Auftrag wird zurueckgestellt, nicht als Erfolg gemeldet", e.ok === false && e.zurueckgestellt === true);
    check("4.2 KEINE Buchung — es gab keinen Aufruf", zaehler() === 0, `global.used = ${zaehler()}`);
    check("4.3 Das reservierte Budget ist freigegeben", reservierungen("status='zurueckgegeben'") === 1);

    // ══ 5 · ABBRUCH WAEHREND DER MODELLNUTZUNG ══════════════════════════════════════════
    abschnitt("5 · Abbruch WAEHREND der Modellnutzung");
    leere();
    let geworfen = null;
    try {
      await pipeline.HANDLER.tenant_narrative(auftrag(), depsFuer({
        ruftModell: true, wirft: "verbindung-abgebrochen"
      }, { tagesplan: plan1 }));
    } catch (err) { geworfen = err; }
    check("5.1 Der Fehler wird ehrlich weitergereicht (kein falsches Gruen)", geworfen != null);
    check("5.2 Die entstandenen Kosten bleiben gebucht — genau einmal",
      zaehler() === 1, `global.used = ${zaehler()}`);
    check("5.3 Die Reservierung steht auf 'fehlgeschlagen', nicht auf 'zurueckgegeben'",
      reservierungen("status='fehlgeschlagen'") === 1 && reservierungen("status='zurueckgegeben'") === 0);

    // ══ 6 · ABBRUCH NACH DER MODELLNUTZUNG ══════════════════════════════════════════════
    abschnitt("6 · Abbruch NACH der Modellnutzung");
    leere();
    geworfen = null;
    try {
      await pipeline.HANDLER.tenant_narrative(auftrag(), depsFuer({
        ruftModell: true, danach: { available: false, reason: "ai-unavailable" }
      }, { tagesplan: plan1 }));
    } catch (err) { geworfen = err; }
    check("6.1 Voruebergehender Fehler, ehrlich benannt", geworfen != null && /voruebergehend/.test(geworfen.message));
    check("6.2 Der bezahlte Aufruf bleibt gebucht (Kosten gehen nicht verloren)",
      zaehler() === 1, `global.used = ${zaehler()}`);
    check("6.3 Die Reservierung wurde NICHT zurueckgegeben", reservierungen("status='zurueckgegeben'") === 0);

    // ══ 7 · WIEDERHOLUNG VOR DER MODELLNUTZUNG ══════════════════════════════════════════
    abschnitt("7 · Wiederholung VOR der Modellnutzung");
    leere();
    // Erster Versuch: Sperre gehalten -> Rueckgabe. Zweiter Versuch: erfolgreich.
    await pipeline.HANDLER.tenant_narrative(auftrag(), depsFuer({
      ruftModell: false, ergebnis: { available: false, reason: "generating" }
    }, { tagesplan: plan1 }));
    e = await pipeline.HANDLER.tenant_narrative(auftrag(), depsFuer({
      ruftModell: true, danach: { available: true, fromCache: false, paragraphs: ["a"], vorgaenge: [1] }
    }, { tagesplan: plan1 }));
    check("7.1 Die Wiederholung laeuft durch", e.ok === true && e.veroeffentlicht === true);
    check("7.2 GENAU EINE Buchung ueber beide Versuche", zaehler() === 1, `global.used = ${zaehler()}`);
    check("7.3 Der Mandantenanteil ist genau einmal belastet",
      reservierungen("scope='tenant:m1' and status in ('reserviert','verbraucht','fehlgeschlagen')") === 1);

    // ══ 8 · WIEDERHOLUNG NACH DER MODELLNUTZUNG ═════════════════════════════════════════
    abschnitt("8 · Wiederholung NACH der Modellnutzung");
    leere();
    await pipeline.HANDLER.tenant_narrative(auftrag(), depsFuer({
      ruftModell: true, danach: { available: true, fromCache: false, paragraphs: ["a"], vorgaenge: [1] }
    }, { tagesplan: plan1 }));
    const nach1 = zaehler();
    // Wiederholung desselben Auftrags: die echte Funktion liefert jetzt aus dem Tagescache.
    e = await pipeline.HANDLER.tenant_narrative(auftrag(), depsFuer({
      ruftModell: false, ergebnis: { available: true, fromCache: true, paragraphs: ["a"], vorgaenge: [1] }
    }, { tagesplan: plan1 }));
    check("8.1 Die Wiederholung ist erfolgreich", e.ok === true && e.ausCache === true);
    check("8.2 KEINE zweite Buchung — die Kosten werden nicht doppelt gezaehlt",
      zaehler() === nach1 && zaehler() === 1, `vorher ${nach1}, nachher ${zaehler()}`);
    check("8.3 Die bereits verbrauchte Reservierung wird NICHT zurueckgegeben (Kosten bleiben sichtbar)",
      reservierungen("status='verbraucht'") === 1 && reservierungen("status='zurueckgegeben'") === 0);

    // ══ 9 · KONKURRIERENDE RESERVIERUNGEN ═══════════════════════════════════════════════
    abschnitt("9 · Konkurrierende Reservierungen (echte Gleichzeitigkeit)");
    leere();
    const K_DECKEL = 12;
    const K_VERSUCHE = 60;
    const K_PROZESSE = 10;
    const stapel = [];
    for (let p = 0; p < K_PROZESSE; p += 1) {
      const zeilen = [];
      for (let i = 0; i < K_VERSUCHE / K_PROZESSE; i += 1) {
        zeilen.push(`select erlaubt from public.helmut_reserve_llm_result('k-${p}-${i}',${sqlText(TAG)},'global','notwendig',${K_DECKEL},null,900000);`);
      }
      stapel.push(psqlAsync(zeilen.join("\n")));
    }
    const erg9 = await Promise.all(stapel);
    const gewaehrt9 = erg9.reduce((s, r) => s + (r.out.match(/^t$/gm) || []).length, 0);
    check("9.1 Alle Prozesse liefen fehlerfrei", erg9.every((r) => r.code === 0), erg9.map((r) => r.err).filter(Boolean).join(" | ").slice(0, 200));
    check("9.2 Der Deckel wurde bei echter Gleichzeitigkeit NICHT ueberschritten",
      gewaehrt9 === K_DECKEL, `${gewaehrt9} gewaehrt bei Deckel ${K_DECKEL}`);
    check("9.3 Genau so viele Reservierungszeilen wie Zusagen", reservierungen() === K_DECKEL, `${reservierungen()} Zeilen`);
    check("9.4 Der Zaehler steht auf 0 — reserviert ist noch nicht verbraucht (Vertrag 2)",
      zaehler() === 0, `global.used = ${zaehler()}`);

    // ══ 10 · KONKURRIERENDE AUFTRAEGE EINES MANDATS ═════════════════════════════════════
    abschnitt("10 · Konkurrierende Auftraege EINES Mandats");
    leere();
    const M_ANTEIL = 3;
    const stapel10 = [];
    for (let p = 0; p < 8; p += 1) {
      const zeilen = [];
      for (let i = 0; i < 5; i += 1) {
        zeilen.push(`select erlaubt from public.helmut_reserve_llm_result('lage|m1|${p}-${i}',${sqlText(TAG)},'tenant:m1','notwendig',1000,${M_ANTEIL},900000);`);
      }
      stapel10.push(psqlAsync(zeilen.join("\n")));
    }
    await Promise.all(stapel10);
    check("10.1 Der Mandantenanteil wurde bei echter Gleichzeitigkeit NICHT ueberschritten",
      reservierungen("scope='tenant:m1'") === M_ANTEIL, `${reservierungen("scope='tenant:m1'")} von ${M_ANTEIL}`);
    // Dasselbe fuer fuenf Mandate gleichzeitig — jedes muss genau seinen Anteil bekommen.
    leere();
    const stapel10b = [];
    for (let p = 0; p < 10; p += 1) {
      const zeilen = [];
      for (let m = 0; m < 5; m += 1) {
        for (let i = 0; i < 5; i += 1) {
          zeilen.push(`select erlaubt from public.helmut_reserve_llm_result('lage|m${m}|${p}-${i}',${sqlText(TAG)},'tenant:m${m}','notwendig',1000,${M_ANTEIL},900000);`);
        }
      }
      stapel10b.push(psqlAsync(zeilen.join("\n")));
    }
    await Promise.all(stapel10b);
    const proMandat = psql(`select scope||':'||count(*) from public.llm_reservations where day=${sqlText(TAG)} group by scope order by scope`).out.split("\n");
    check("10.2 Jedes der fuenf Mandate hat GENAU seinen Anteil bekommen (kein Aushungern)",
      proMandat.length === 5 && proMandat.every((z) => z.endsWith(`:${M_ANTEIL}`)), proMandat.join(" "));
    check("10.3 Kein Mandat hat einen fremden Anteil verbraucht",
      reservierungen("scope not like 'tenant:m%'") === 0);

    // ══ 11 · AUSGESCHOEPFTES MANDANTENBUDGET ════════════════════════════════════════════
    abschnitt("11 · Ausgeschoepftes Mandantenbudget");
    leere();
    const planEng = tagesplanFuer(["m1"], DECKEL, 1);   // genau EIN Aufruf fuer m1
    await pipeline.HANDLER.tenant_narrative(auftrag("m1", "w1"), depsFuer({
      ruftModell: true, danach: { available: true, fromCache: false, paragraphs: ["a"], vorgaenge: [1] }
    }, { tagesplan: planEng }));
    e = await pipeline.HANDLER.tenant_narrative(auftrag("m1", "w2", "job-2"), depsFuer({
      ruftModell: true, danach: { available: true, fromCache: false, paragraphs: ["a"], vorgaenge: [1] }
    }, { tagesplan: planEng }));
    check("11.1 Der zweite Auftrag wird zurueckgestellt, nicht ausgefuehrt",
      e.ok === false && e.zurueckgestellt === true && /mandantenanteil-erschoepft/.test(String(e.grund)), JSON.stringify(e));
    check("11.2 KEIN zweiter Modellaufruf", zaehler() === 1, `global.used = ${zaehler()}`);

    // ══ 12 · AUSGESCHOEPFTES GLOBALES BUDGET ════════════════════════════════════════════
    abschnitt("12 · Ausgeschoepftes globales Budget");
    leere();
    // Der Tagesdeckel ist schon durch Altpfad-Aufrufe verbraucht (Zaehler steht am Deckel).
    for (let i = 0; i < 4; i += 1) chokePoint(4);
    const envEng = { ...ENV_AN, HELMUT_MAX_LLM_CALLS_PER_DAY: "4" };
    e = await pipeline.HANDLER.tenant_narrative(auftrag(), depsFuer({
      ruftModell: true, danach: { available: true, fromCache: false, paragraphs: ["a"], vorgaenge: [1] }
    }, { tagesplan: tagesplanFuer(["m1"], 4, 3), env: envEng }));
    check("12.1 Die Warteschlange erkennt den vollen Tagesdeckel des ALTPFADS",
      e.ok === false && e.zurueckgestellt === true && /globales-notfalllimit-erreicht/.test(String(e.grund)), JSON.stringify(e));
    check("12.2 Der Zaehler ist nicht ueber den Deckel gelaufen", zaehler() === 4, `global.used = ${zaehler()}`);
    check("12.3 Keine Reservierung wurde gebucht", reservierungen("status='reserviert'") === 0);

    // ══ 13–15 · UNBEKANNTES MODELL, UNBEKANNTE KOSTEN, FEHLENDE NUTZUNGSDATEN ═══════════
    abschnitt("13-15 · Unbekanntes Modell, unbekannte Kosten, fehlende Nutzungsdaten");
    leere();
    e = await pipeline.HANDLER.tenant_narrative(auftrag(), depsFuer({
      ruftModell: true, danach: { available: true, fromCache: false, paragraphs: ["a"], vorgaenge: [1], model: "modell-das-es-nicht-gibt" }
    }, { tagesplan: plan1 }));
    check("13.1 Ein unbekanntes Modell verbraucht trotzdem GENAU EINEN Budgetslot (fail closed)",
      e.ok === true && zaehler() === 1, `global.used = ${zaehler()}`);
    const kUnbekannt = kosten.klassifiziereEintrag({ callType: "lageBriefing", model: "modell-das-es-nicht-gibt", estimatedCost: "unknown", promptTokens: 100, completionTokens: 50 });
    check("13.2 Die Kosten werden als UNBEKANNT gemeldet, nicht als 0,00",
      kUnbekannt.messstatus === "kosten-unbekannt" && kUnbekannt.kostenUsd == null, JSON.stringify(kUnbekannt.messstatus));
    const kOhneTokens = kosten.klassifiziereEintrag({ callType: "lageBriefing", model: "gpt-5-mini", estimatedCost: null, promptTokens: null, completionTokens: null });
    check("14.1 Ein Eintrag ohne Preis ist 'kosten-unbekannt', nie stillschweigend null",
      kOhneTokens.messstatus === "kosten-unbekannt" && kOhneTokens.kostenUsd == null, kOhneTokens.messstatus);
    check("15.1 Fehlende Nutzungsdaten werden benannt, nicht geraten",
      kOhneTokens.inputTokens == null && kOhneTokens.outputTokens == null && kOhneTokens.grund != null, JSON.stringify(kOhneTokens.grund));
    const kUebersprungen = kosten.klassifiziereEintrag({ callType: "skipped-lageBriefing", model: "none", estimatedCost: 0, keinAufruf: true });
    check("15.2 Ein uebersprungener Aufruf zaehlt NICHT als Kosten und nicht als Verbrauch",
      kosten.istUebersprungen(kUebersprungen) === true || kUebersprungen.messstatus === "uebersprungen", kUebersprungen.messstatus);

    // ══ 16 · BEREITS ERFOLGREICH ABGESCHLOSSENER AUFTRAG ════════════════════════════════
    abschnitt("16 · Bereits erfolgreich abgeschlossener Auftrag");
    leere();
    await pipeline.HANDLER.tenant_narrative(auftrag("m1", "w1", "job-A"), depsFuer({
      ruftModell: true, danach: { available: true, fromCache: false, paragraphs: ["a"], vorgaenge: [1] }
    }, { tagesplan: plan1 }));
    // Ein ANDERER technischer Auftrag fuer dasselbe Mandat und dasselbe Fenster (Doppellauf
    // beider Morgenslots) darf NICHT ein zweites Mal bezahlen.
    e = await pipeline.HANDLER.tenant_narrative(auftrag("m1", "w1", "job-B"), depsFuer({
      ruftModell: false, ergebnis: { available: true, fromCache: true, paragraphs: ["a"], vorgaenge: [1] }
    }, { tagesplan: plan1 }));
    check("16.1 Der zweite technische Auftrag ist erfolgreich (kein Fehler)", e.ok === true);
    check("16.2 Er kostet NICHTS zusaetzlich — verschiedene Job-Kennungen, EIN Ergebnisschluessel",
      zaehler() === 1 && reservierungen() === 1, `global.used = ${zaehler()}, Zeilen ${reservierungen()}`);

    // ══ 17 · 40 GLEICHZEITIGE WORKER GEGEN EINEN KLEINEN DECKEL ═════════════════════════
    abschnitt("17 · 40 gleichzeitige Worker gegen einen kleinen Deckel");
    leere();
    const W_DECKEL = 10;
    const t0 = Date.now();
    const worker = [];
    for (let w = 0; w < 40; w += 1) {
      worker.push(psqlAsync(`select erlaubt from public.helmut_reserve_llm_result('w-${w}',${sqlText(TAG)},'global','notwendig',${W_DECKEL},null,900000);`));
    }
    const erg17 = await Promise.all(worker);
    const dauer17 = Date.now() - t0;
    const gewaehrt17 = erg17.reduce((s, r) => s + (r.out.match(/^t$/gm) || []).length, 0);
    check("17.1 Alle 40 Worker liefen fehlerfrei", erg17.every((r) => r.code === 0));
    check("17.2 GENAU 10 Zusagen — keine Ueberbuchung", gewaehrt17 === W_DECKEL, `${gewaehrt17} von ${W_DECKEL}`);
    check("17.3 GENAU 10 Reservierungszeilen", reservierungen() === W_DECKEL, `${reservierungen()}`);
    check("17.4 Die uebrigen 30 wurden abgelehnt, nicht stillschweigend gebucht", 40 - gewaehrt17 === 30);
    console.log(`        (40 echte Prozesse · ${dauer17} ms Wanduhrzeit)`);
    // Und jetzt die andere Haelfte des Vertrags: die 10 Zusagen fuehren zu 10 echten
    // Aufrufen — der Zaehler darf danach GENAU 10 stehen, nicht 20.
    for (let i = 0; i < gewaehrt17; i += 1) chokePoint(W_DECKEL);
    check("17.5 Zehn Zusagen ergeben ZEHN Buchungen, nicht zwanzig (Befund R4)",
      zaehler() === W_DECKEL, `global.used = ${zaehler()}`);

    // ══ 18 · VERSTEHENSANTEIL (Befund R4b) ══════════════════════════════════════════════
    abschnitt("18 · Der globale Bereichsdeckel wirkt (Befund R4b)");
    leere();
    // Vor der Korrektur wurde p_scope_max fuer scope='global' verworfen: der `globalerTopf`
    // war berechnet, uebergeben — und wirkungslos.
    let zusagen = 0;
    for (let i = 0; i < 8; i += 1) {
      const r = await speicher.reserviere({ resultKey: `u-${i}`, day: TAG, scope: "global", workClass: "notwendig", globalMax: 100, scopeMax: 5 });
      if (r.erlaubt) zusagen += 1;
    }
    check("18.1 Der Verstehensanteil begrenzt die globale Arbeit", zusagen === 5, `${zusagen} von 5`);
    check("18.2 Die Ablehnung nennt den Grund beim Namen",
      (await speicher.reserviere({ resultKey: "u-99", day: TAG, scope: "global", globalMax: 100, scopeMax: 5 })).grund === "verstehensanteil-erschoepft");

    // ══ 19 · ALTPFAD UNVERAENDERT ═══════════════════════════════════════════════════════
    abschnitt("19 · Altpfad und ausgeschaltete Flags");
    leere();
    check("19.1 Ohne Fairness-Flag gibt es KEINEN Budgetadapter",
      pipeline.budgetAdapter({ env: { HELMUT_LLM_FAIRNESS: "" }, deps: {}, tagesplan: plan1 }) === null);
    // Der Altpfad allein: nur der Choke-Point zaehlt, exakt wie vor OP-30.
    for (let i = 0; i < 3; i += 1) chokePoint(DECKEL);
    check("19.2 Der Altpfad zaehlt unveraendert genau einmal je Aufruf", zaehler() === 3, `global.used = ${zaehler()}`);
    check("19.3 Der Altpfad legt KEINE Reservierungszeilen an", reservierungen() === 0);
    // Handler mit ausgeschaltetem Narrativflag: kein Modellaufruf, keine Buchung.
    const vorher19 = zaehler();
    e = await pipeline.HANDLER.tenant_narrative(auftrag(), depsFuer({
      ruftModell: true, danach: { available: true, fromCache: false, paragraphs: ["a"], vorgaenge: [1] }
    }, { tagesplan: plan1, env: { ...ENV_AN, HELMUT_NARRATIV_QUEUE: "" } }));
    check("19.4 Bei ausgeschaltetem Flag laeuft KEINE Verarbeitung und KEINE Buchung",
      e.uebersprungen === true && zaehler() === vorher19, JSON.stringify(e));

    // ══ 20 · KENNZAHLEN UND ROLLBACK ════════════════════════════════════════════════════
    abschnitt("20 · Kennzahlen und Rollback");
    const k = psql(`select global_verbraucht||'/'||global_belegt||'/'||mandanten_mit_verbrauch||'/'||groesster_mandantenanteil from public.helmut_llm_budget_kennzahlen(${sqlText(TAG)})`).out;
    check("20.1 Die Kennzahlen trennen VERBRAUCHT und BELEGT", /^\d+\/\d+\/\d+\/\d+$/.test(k), k);
    psql(null, { datei: R_FAIR });
    check("20.2 Das Rollback entfernt Tabelle und Funktionen vollstaendig",
      psql("select count(*) from pg_class where relname='llm_reservations'").out === "0"
      && psql("select count(*) from pg_proc where proname='helmut_reserve_llm_result'").out === "0");
    check("20.3 Der BESTAND aus 20260717 bleibt unangetastet",
      psql("select count(*) from pg_proc where proname='helmut_reserve_llm_call'").out === "1"
      && psql("select count(*) from pg_class where relname='llm_budget_counters'").out === "1");
    const standNachRollback = zaehler();
    check("20.4 Das Rollback verliert KEINE bereits gebuchten Kosten", standNachRollback === 3, `global.used = ${standNachRollback}`);
  } finally {
    try { psql(`drop database if exists ${PG.db}`, { db: "postgres" }); } catch (_) { /* egal */ }
  }

  console.log("\n== ERGEBNIS ==");
  console.log(`PASS ${pass}  FAIL ${fail}  OFFEN ${offen}  (gesamt ${pass + fail + offen})`);
  if (offen > 0) console.log(`${offen} Punkt(e) sind AUSDRUECKLICH NICHT BEWIESEN.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("TESTLAUF-FEHLER:", e && e.stack ? e.stack : e);
  try { psql(`drop database if exists ${PG.db}`, { db: "postgres" }); } catch (_) { /* egal */ }
  process.exit(1);
});
