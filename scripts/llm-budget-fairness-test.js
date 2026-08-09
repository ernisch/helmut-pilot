"use strict";

// Helmut — FAIRES KI-BUDGET: Politik und atomare Durchsetzung (OP-30, Sprintauftrag Phase 3).
// =============================================================================================
// Zwei Teile, weil es zwei verschiedene Zusagen sind:
//   TEIL A (offline): die VERTEILUNG ist fair, deterministisch und laesst kein Mandat
//                     verhungern. Reine Rechnung, ohne Datenbank pruefbar.
//   TEIL B (Datenbank): die DURCHSETZUNG ist atomar. Mehrere gleichzeitige Prozesse duerfen
//                     gemeinsam weder einen Mandantenanteil noch das globale Notfalllimit
//                     ueberschreiten, und eine Wiederholung darf nie doppelt buchen.
//
// Ohne lokalen PostgreSQL wird Teil B NICHT als bestanden gezaehlt, sondern ausdruecklich
// als OFFEN gemeldet. Eine Attrappe kann Atomaritaet nicht beweisen.
//
// KEIN Production-Deckel wird veraendert. Alle Deckel in dieser Suite sind Testwerte.

const path = require("path");
const { execFileSync, spawn } = require("child_process");
const ROOT = path.join(__dirname, "..");

const FAIR = require(path.join(ROOT, "lib/helmut/llm-budget-fair.js"));

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: "helmut_test_budget"
};

let pass = 0;
let fail = 0;
let offen = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function nichtBewiesen(name, grund) { offen += 1; console.log(`  OFFEN ${name} — NICHT BEWIESEN: ${grund}`); }
function abschnitt(t) { console.log(`\n== ${t} ==`); }
function z(n) { return Number(n).toLocaleString("de-DE"); }

function psql(sql, { db = PG.db, datei = null, still = false } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-tA", "-v", "ON_ERROR_STOP=1"];
  if (datei) args.push("-f", datei); else args.push("-c", sql);
  try {
    return { ok: true, out: execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
  } catch (e) {
    if (!still) throw e;
    return { ok: false, out: String((e.stderr || e.stdout || e.message) || "").trim() };
  }
}

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

function servererreichbar() {
  if (!PG.host || !PG.user) return false;
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres", "-tAc", "select 1"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch (_) { return false; }
}

const MANDATE_1000 = Array.from({ length: 1000 }, (_, i) => `synth-mandat-${String(i + 1).padStart(4, "0")}`);

async function main() {
  console.log("Helmut — Faires KI-Budget: Verteilung und atomare Durchsetzung (OP-30, Phase 3)");

  // ═════════════════════════ TEIL A · Die Verteilung ═══════════════════════
  abschnitt("A1 · Der Ergebnisschluessel ist die Idempotenz (Phase 3.2)");
  {
    const a = FAIR.ergebnisSchluessel({ art: "understanding", gegenstand: "vg-1" });
    const b = FAIR.ergebnisSchluessel({ art: "understanding", gegenstand: "vg-1" });
    check("A1.1 Derselbe Gegenstand ergibt denselben Schluessel", a === b, a);
    check("A1.2 Ein anderer Gegenstand ergibt einen anderen",
      a !== FAIR.ergebnisSchluessel({ art: "understanding", gegenstand: "vg-2" }));
    let fehler = null;
    try { FAIR.ergebnisSchluessel({ art: "understanding", gegenstand: "vg-1", mandatsId: "m1" }); }
    catch (e) { fehler = e.message; }
    check("A1.3 GLOBALE Arbeit darf keine Mandatskennung tragen (CLAUDE.md §4.2)",
      /global/.test(String(fehler)), String(fehler));
    let fehler2 = null;
    try { FAIR.ergebnisSchluessel({ art: "lage", gegenstand: "tag" }); } catch (e) { fehler2 = e.message; }
    check("A1.4 Mandatsbezogene Arbeit OHNE Mandatskennung wird abgelehnt",
      /Mandatskennung/.test(String(fehler2)), String(fehler2));
    check("A1.5 Zwei Mandate teilen sich NIE denselben Schluessel",
      FAIR.ergebnisSchluessel({ art: "lage", gegenstand: "t", mandatsId: "m1" })
      !== FAIR.ergebnisSchluessel({ art: "lage", gegenstand: "t", mandatsId: "m2" }));
    check("A1.6 Der Scope trennt global und mandatsbezogen",
      FAIR.scopeFuer({ art: "understanding" }) === "global"
      && FAIR.scopeFuer({ art: "lage", mandatsId: "m1" }) === "tenant:m1");
  }

  abschnitt("A2 · Notwendig vor optional (Phase 3.11 · 5.12)");
  {
    const mandate = MANDATE_1000.slice(0, 10);
    const bedarf = Object.fromEntries(mandate.map((m) => [m, { notwendig: 1, optional: 3 }]));
    // Nur 6 Plaetze im Mandatstopf -> reicht fuer 6 notwendige, fuer KEINE optionale.
    const plan = FAIR.tagesplan({ mandate, deckel: 12, tag: "2026-08-08", bedarf });
    const optionalVergeben = Object.values(plan.zuteilung).reduce((s, x) => s + x.optional, 0);
    const notwendigVergeben = Object.values(plan.zuteilung).reduce((s, x) => s + x.notwendig, 0);
    check("A2.1 Es wurde ausschliesslich notwendige Arbeit vergeben",
      optionalVergeben === 0, `${optionalVergeben} optionale`);
    check("A2.2 Die notwendige Arbeit wurde bis zum Topfende vergeben",
      notwendigVergeben === plan.mandatsTopf, `${notwendigVergeben} von ${plan.mandatsTopf}`);
    check("A2.3 Der Rest wird EHRLICH als offen gemeldet, nicht verschwiegen",
      plan.notwendigOffen === mandate.length - notwendigVergeben && plan.reichtFuerAlleNotwendigen === false,
      `${plan.notwendigOffen} notwendige offen`);
    check("A2.4 KEIN Mandat bekommt Kuer, solange ein anderes auf Pflicht wartet",
      Object.values(plan.zuteilung).every((x) => x.optional === 0));

    // Reicht es fuer alle notwendigen, wird erst dann optional verteilt.
    const plan2 = FAIR.tagesplan({ mandate, deckel: 60, tag: "2026-08-08", bedarf });
    check("A2.5 Bei ausreichendem Budget wird ZUERST alle Pflicht, DANN Kuer verteilt",
      plan2.reichtFuerAlleNotwendigen === true
      && Object.values(plan2.zuteilung).every((x) => x.notwendig === 1)
      && Object.values(plan2.zuteilung).reduce((s, x) => s + x.optional, 0) > 0);
  }

  abschnitt("A3 · Kein Mandat verhungert (Phase 3.10)");
  {
    for (const [deckel, tage] of [[100, 25], [100, 60], [300, 10], [3000, 3]]) {
      const v = FAIR.bedienteMandateUeberTage({ mandate: MANDATE_1000, deckel, tage });
      check(`A3.x Deckel ${deckel}: nach ${tage} Tagen war JEDES der 1000 Mandate mindestens einmal dran`,
        v.alleMindestensEinmal === true,
        `min ${v.minimum} · max ${v.maximum} · nie bedient: ${v.nieBedient.length}`);
    }
    // Der belegte Gegenbeweis: mit Schrittweite 1 waere es nicht so.
    const langsam = FAIR.rotationsReihenfolge(MANDATE_1000, "2026-08-09", 1);
    const schnell = FAIR.rotationsReihenfolge(MANDATE_1000, "2026-08-09", 50);
    check("A3.4 Die Schrittweite wirkt tatsaechlich auf die Reihenfolge",
      langsam[0] !== schnell[0], `${langsam[0]} vs ${schnell[0]}`);
  }

  abschnitt("A4 · Die Verteilung ist deterministisch (Phase 3.9)");
  {
    const a = FAIR.tagesplan({ mandate: MANDATE_1000, deckel: 100, tag: "2026-08-08" });
    const b = FAIR.tagesplan({ mandate: MANDATE_1000, deckel: 100, tag: "2026-08-08" });
    check("A4.1 Zwei Laeufe mit gleicher Eingabe liefern dieselbe Zuteilung",
      JSON.stringify(a.zuteilung) === JSON.stringify(b.zuteilung));
    check("A4.2 Eine andere Reihenfolge der Eingabe aendert NICHTS",
      JSON.stringify(FAIR.tagesplan({ mandate: [...MANDATE_1000].reverse(), deckel: 100, tag: "2026-08-08" }).zuteilung)
      === JSON.stringify(a.zuteilung));
    check("A4.3 Ein anderer Tag liefert eine andere Reihenfolge (sonst waere es keine Rotation)",
      FAIR.tagesplan({ mandate: MANDATE_1000, deckel: 100, tag: "2026-08-09" }).reihenfolge[0] !== a.reihenfolge[0]);
    // Kommentare vorher entfernen: das Modul ERWAEHNT `Math.random` in seiner Begruendung.
    // Ein naiver Volltextsuchtreffer waere hier ein Fehlalarm auf den eigenen Kommentar.
    const nurCode = require("fs").readFileSync(path.join(ROOT, "lib/helmut/llm-budget-fair.js"), "utf8")
      .split("\n").filter((z) => !z.trim().startsWith("//")).join("\n");
    check("A4.4 Es wird kein Zufall benutzt", !/Math\.random/.test(nurCode));
  }

  abschnitt("A5 · Der globale Topf wird nicht an Mandate verteilt (Phase 3.7)");
  {
    const plan = FAIR.tagesplan({ mandate: MANDATE_1000, deckel: 1000, tag: "2026-08-08" });
    check("A5.1 Global und mandatsbezogen sind getrennte Toepfe",
      plan.globalTopf + plan.mandatsTopf === plan.deckel, `${plan.globalTopf} + ${plan.mandatsTopf} = ${plan.deckel}`);
    check("A5.2 Die Mandate bekommen hoechstens den Mandatstopf",
      plan.zugeteilt <= plan.mandatsTopf, `${plan.zugeteilt} von ${plan.mandatsTopf}`);
    check("A5.3 Der globale Topf bleibt dem geteilten Verstehen vorbehalten", plan.globalTopf > 0);
  }

  abschnitt("A6 · Der heutige Deckel von 100: was bleibt ehrlich liegen (Phase 5.10)");
  {
    const plan = FAIR.tagesplan({ mandate: MANDATE_1000, deckel: 100, tag: "2026-08-08" });
    console.log(`  Deckel 100 · 1000 Mandate:`);
    console.log(`    globaler Topf (Verstehen) ....... ${plan.globalTopf}`);
    console.log(`    Mandatstopf ..................... ${plan.mandatsTopf}`);
    console.log(`    bediente Mandate heute .......... ${plan.zugeteilt}`);
    console.log(`    ZURUECKGESTELLT (notwendig) ..... ${z(plan.notwendigOffen)}`);
    check("A6.1 Bei Deckel 100 bleiben 95 % der Mandate ehrlich unbedient",
      plan.notwendigOffen === 1000 - plan.mandatsTopf, `${z(plan.notwendigOffen)} zurueckgestellt`);
    check("A6.2 Das wird als NICHT ausreichend gemeldet, nicht beschoenigt",
      plan.reichtFuerAlleNotwendigen === false);

    const genug = FAIR.tagesplan({ mandate: MANDATE_1000, deckel: 3000, tag: "2026-08-08" });
    console.log(`  Testdeckel 3000 (NUR lokal): bediente Mandate ${z(genug.zugeteilt)}, offen ${genug.notwendigOffen}`);
    check("A6.3 Mit einem ausreichenden LOKALEN Testdeckel werden alle 1000 fair bedient",
      genug.reichtFuerAlleNotwendigen === true && genug.zugeteilt === 1000, String(genug.zugeteilt));
    check("A6.4 Jedes Mandat bekommt dabei GENAU gleich viel",
      new Set(Object.values(genug.zuteilung).map((x) => x.notwendig + x.optional)).size === 1);
  }

  // ═════════════════════════ TEIL B · Die Durchsetzung ═════════════════════
  abschnitt("B · Atomare Durchsetzung gegen einen ECHTEN PostgreSQL");
  if (!servererreichbar()) {
    nichtBewiesen("B Atomaritaet der Reservierung",
      "kein lokaler PostgreSQL-Server erreichbar (HELMUT_TEST_PG_HOST/USER). Teil A ist reine "
      + "Rechnung und beweist die VERTEILUNG; die DURCHSETZUNG unter Gleichzeitigkeit bleibt "
      + "damit in diesem Lauf ungeprueft.");
  } else {
    psql(`drop database if exists ${PG.db}`, { db: "postgres" });
    psql(`create database ${PG.db}`, { db: "postgres" });
    psql(null, { datei: path.join(ROOT, "supabase/migrations/20260717_llm_budget_reservation.sql") });
    psql(null, { datei: path.join(ROOT, "supabase/migrations/20260808_llm_budget_fairness.sql") });
    check("B0.1 Beide Migrationen laufen aufeinander durch",
      psql("select count(*) from public.llm_reservations").out === "0");
    check("B0.2 Die Bestandsfunktion aus 20260717 ist UNVERAENDERT vorhanden",
      psql("select count(*) from pg_proc where proname='helmut_reserve_llm_call'").out === "1");

    const TAG = "2026-08-08";
    // ── NACH DER R4-KORREKTUR: WO DIE WAHRHEIT STEHT ───────────────────────
    // Bis 2026-08-09 erhoehte die Fairnessschicht `llm_budget_counters` SELBST — und der
    // Choke-Point `helmut_reserve_llm_call` erhoehte dieselbe Zeile beim tatsaechlichen
    // Aufruf ein zweites Mal (Befund R4, an echter PostgreSQL gemessen: `global.used = 2`
    // fuer EINEN Aufruf). Seitdem gilt: EIN BUCH, EIN SCHREIBER.
    //   `llm_budget_counters` = TATSAECHLICH getaetigte Aufrufe (nur der Choke-Point schreibt).
    //   `llm_reservations`    = ABSICHTEN (Idempotenz, Bereichsverbrauch).
    //   BELEGUNG des Tagesdeckels = getaetigt + laufend.
    // Die Pruefungen unten messen deshalb die BELEGUNG statt der rohen Zaehlerzeile. Die
    // Zusage ist dieselbe und genauso streng — sie wird nur an der richtigen Stelle gelesen.
    const belegung = () => Number(psql(
      `select coalesce((select used from public.llm_budget_counters where day='${TAG}' and scope='global'),0)`
      + ` + (select count(*) from public.llm_reservations where day='${TAG}' and status='reserviert')`).out) || 0;
    const bereichBelegt = (scope) => Number(psql(
      `select count(*) from public.llm_reservations where day='${TAG}' and scope='${scope}'`
      + " and status in ('reserviert','verbraucht','fehlgeschlagen')").out) || 0;
    const R = (key, scope, gmax, smax, klasse = "notwendig") =>
      `select erlaubt||'/'||coalesce(wiederverwendet::text,'')||'/'||coalesce(grund,'-') `
      + `from public.helmut_reserve_llm_result('${key}','${TAG}','${scope}','${klasse}',${gmax},${smax === null ? "null" : smax},900000)`;

    // ── B1 Idempotenz ──────────────────────────────────────────────────────
    psql("delete from public.llm_reservations; delete from public.llm_budget_counters;");
    const e1 = psql(R("understanding|vg-1", "global", 100, null)).out;
    const e2 = psql(R("understanding|vg-1", "global", 100, null)).out;
    check("B1.1 Die erste Reservierung wird gewaehrt", e1.startsWith("true/false"), e1);
    check("B1.2 Die zweite mit DEMSELBEN Schluessel wird WIEDERVERWENDET, nicht neu gebucht",
      e2.startsWith("true/true"), e2);
    check("B1.3 Die Belegung stieg nur EINMAL",
      belegung() === 1, `Belegung ${belegung()}`);
    check("B1.4 Der Zaehler der TATSAECHLICHEN Aufrufe steht auf 0 — reserviert ist nicht verbraucht",
      psql(`select coalesce((select used from public.llm_budget_counters where day='${TAG}' and scope='global'),0)`).out === "0");

    // ── B2 Zwei Deckel in EINEM Schritt ────────────────────────────────────
    psql("delete from public.llm_reservations; delete from public.llm_budget_counters;");
    const b2 = psql(R("lage|m1|F", "tenant:m1", 100, 1, "optional")).out;
    const b2b = psql(R("lage|m1|F2", "tenant:m1", 100, 1, "optional")).out;
    check("B2.1 Der Mandantenanteil wird durchgesetzt", b2b.includes("mandantenanteil-erschoepft"), b2b);
    check("B2.2 Eine abgelehnte Mandantenreservierung erhoeht die GLOBALE Belegung NICHT",
      belegung() === 1, `Belegung ${belegung()}`);
    psql("delete from public.llm_reservations; delete from public.llm_budget_counters;");
    psql(R("x|a", "global", 100, null));   // globalen Zaehler auf 1
    const b2c = psql(R("lage|m9|F", "tenant:m9", 1, 50, "notwendig")).out;
    check("B2.3 Reisst das globale Notfalllimit, wird KEIN Mandantenanteil verbraucht",
      b2c.includes("globales-notfalllimit-erreicht") && bereichBelegt("tenant:m9") === 0,
      `${b2c} · Bereich ${bereichBelegt("tenant:m9")}`);

    // ── B3 Abschluss und Rueckgabe ─────────────────────────────────────────
    psql("delete from public.llm_reservations; delete from public.llm_budget_counters;");
    psql(R("understanding|vg-9", "global", 100, null));
    const s1 = psql("select uebernommen||'/'||neuer_status from public.helmut_settle_llm_reservation('understanding|vg-9',true)").out;
    const s2 = psql("select uebernommen from public.helmut_settle_llm_reservation('understanding|vg-9',true)").out;
    check("B3.1 Der Abschluss wird uebernommen", s1 === "true/verbraucht", s1);
    check("B3.2 Ein ZWEITER Abschluss wird abgelehnt", s2 === "f", s2);
    const rel = psql("select zurueckgegeben from public.helmut_release_llm_reservation('understanding|vg-9')").out;
    check("B3.3 Eine bereits VERBRAUCHTE Reservierung kann nicht zurueckgegeben werden",
      rel === "f", rel);
    check("B3.4 Der Verbrauch bleibt im Buch stehen (keine Budgetleckage)",
      psql("select count(*) from public.llm_reservations where status='verbraucht'").out === "1"
      && psql("select count(*) from public.llm_reservations where status='zurueckgegeben'").out === "0");

    psql("delete from public.llm_reservations; delete from public.llm_budget_counters;");
    psql(R("understanding|vg-10", "global", 100, null));
    const rel2 = psql("select zurueckgegeben from public.helmut_release_llm_reservation('understanding|vg-10')").out;
    check("B3.5 Eine OFFENE Reservierung kann ausdruecklich zurueckgegeben werden", rel2 === "t", rel2);
    check("B3.6 Danach ist die Belegung wieder frei",
      belegung() === 0 && psql("select count(*) from public.llm_reservations where status='zurueckgegeben'").out === "1");

    // ── B4 Absturz zwischen Reservierung und Abschluss ─────────────────────
    psql("delete from public.llm_reservations; delete from public.llm_budget_counters;");
    psql(R("understanding|vg-crash", "global", 100, null));
    // Kein Abschluss — der Prozess "stirbt". Die Reservierung bleibt bewusst gebucht.
    const nachCrash = belegung();
    const wieder = psql(R("understanding|vg-crash", "global", 100, null)).out;
    check("B4.1 Nach einem Absturz bleibt die Reservierung gebucht (konservativ, kein Geldverlust)",
      nachCrash === 1, String(nachCrash));
    check("B4.2 Der Wiederholungslauf findet sie wieder und bucht NICHT erneut",
      wieder.startsWith("true/true"), wieder);
    check("B4.3 Die Belegung steht immer noch auf genau 1",
      belegung() === 1, `Belegung ${belegung()}`);
    check("B4.4 Die Reservierung traegt eine Verfallszeit (auswertbar, nicht automatisch frei)",
      psql("select count(*) from public.llm_reservations where expires_at > now()").out === "1");

    // ── B5 ECHTE GLEICHZEITIGKEIT ──────────────────────────────────────────
    psql("delete from public.llm_reservations; delete from public.llm_budget_counters;");
    const DECKEL = 50;
    const VERSUCHE = 200;
    const prozesse = 8;
    const jeProzess = Math.ceil(VERSUCHE / prozesse);
    const t0 = Date.now();
    const laeufe = [];
    for (let p = 0; p < prozesse; p += 1) {
      const zeilen = [];
      for (let i = 0; i < jeProzess; i += 1) {
        zeilen.push(`select erlaubt from public.helmut_reserve_llm_result('k-${p}-${i}','${TAG}','global','notwendig',${DECKEL},null,900000);`);
      }
      laeufe.push(psqlAsync(zeilen.join("\n")));
    }
    const ergebnisse = await Promise.all(laeufe);
    const dauer = Date.now() - t0;
    const gewaehrt = ergebnisse.reduce((s, r) => s + (r.out.match(/^t$/gm) || []).length, 0);
    const zaehler = belegung();
    const zeilenZahl = Number(psql("select count(*) from public.llm_reservations").out);

    check("B5.1 Alle acht Prozesse liefen fehlerfrei", ergebnisse.every((r) => r.code === 0));
    check("B5.2 Der Deckel wurde bei ECHTER Gleichzeitigkeit NICHT ueberschritten",
      zaehler === DECKEL, `Belegung ${zaehler} bei Deckel ${DECKEL}`);
    check("B5.3 Genau so viele Reservierungen wie gewaehrte Zusagen",
      gewaehrt === DECKEL && zeilenZahl === DECKEL,
      `gewaehrt ${gewaehrt} · Zeilen ${zeilenZahl} · Deckel ${DECKEL}`);
    check("B5.4 Die uebrigen Versuche wurden abgelehnt, nicht stillschweigend gebucht",
      VERSUCHE - gewaehrt >= VERSUCHE - DECKEL - prozesse, `${VERSUCHE - gewaehrt} abgelehnt`);
    console.log(`        (${prozesse} Prozesse · ${VERSUCHE} Versuche · ${dauer} ms Wanduhrzeit)`);

    // ── B6 Gleichzeitigkeit auf ZWEI Deckeln ───────────────────────────────
    psql("delete from public.llm_reservations; delete from public.llm_budget_counters;");
    const MAND = 5;
    const JE_MAND = 3;
    const laeufe2 = [];
    for (let p = 0; p < 10; p += 1) {
      const zeilen = [];
      for (let m = 0; m < MAND; m += 1) {
        for (let i = 0; i < 5; i += 1) {
          zeilen.push(`select erlaubt from public.helmut_reserve_llm_result('lage|m${m}|${p}-${i}','${TAG}','tenant:m${m}','notwendig',1000,${JE_MAND},900000);`);
        }
      }
      laeufe2.push(psqlAsync(zeilen.join("\n")));
    }
    await Promise.all(laeufe2);
    const ueber = Number(psql(`select count(*) from (select scope, count(*) n from public.llm_reservations `
      + `where day='${TAG}' and scope<>'global' and status in ('reserviert','verbraucht','fehlgeschlagen') `
      + `group by scope) t where n > ${JE_MAND}`).out);
    const summe = Number(psql(`select count(*) from public.llm_reservations where day='${TAG}' and scope<>'global' `
      + "and status in ('reserviert','verbraucht','fehlgeschlagen')").out);
    const global = belegung();
    check("B6.1 KEIN Mandantenanteil wurde ueberschritten", ueber === 0, `${ueber} ueberschritten`);
    check("B6.2 Jeder der fuenf Mandanten hat genau seinen Anteil bekommen",
      summe === MAND * JE_MAND, `${summe} von ${MAND * JE_MAND}`);
    check("B6.3 Die globale Belegung stimmt mit der Summe ueberein (keine Geisterbuchung)",
      global === summe, `global ${global} · Summe ${summe}`);

    // ── B7 Kennzahlen ─────────────────────────────────────────────────────
    const k = psql("select global_verbraucht||'/'||global_belegt||'/'||mandanten_mit_verbrauch||'/'||reservierungen||'/'||groesster_mandantenanteil "
      + `from public.helmut_llm_budget_kennzahlen('${TAG}')`).out;
    check("B7.1 Die Kennzahlen sind lesbar und trennen VERBRAUCHT von BELEGT",
      /^\d+\/\d+\/\d+\/\d+\/\d+$/.test(k), k);

    // ── B8 Sicherheit ─────────────────────────────────────────────────────
    // psql stellt einen VERKETTETEN Wahrheitswert als `true`/`false` dar, eine blosse Spalte
    // dagegen als `t`/`f`. Genau diese Falle hat in diesem Projekt schon einmal einen
    // fehlerhaften Testfehlschlag erzeugt — deshalb hier ausdruecklich beides zugelassen.
    const rlsStand = psql("select relrowsecurity||'/'||relforcerowsecurity from pg_class where relname='llm_reservations'").out;
    check("B8.1 RLS ist aktiviert UND erzwungen",
      rlsStand === "true/true" || rlsStand === "t/t", rlsStand);
    check("B8.2 anon/authenticated/PUBLIC haben KEINE Rechte auf der Tabelle",
      psql("select count(*) from information_schema.role_table_grants where table_name='llm_reservations' "
        + "and grantee in ('anon','authenticated','PUBLIC')").out === "0");
    check("B8.3 Es gibt KEINE Policy (zweiter unabhaengiger Riegel)",
      psql("select count(*) from pg_policies where tablename='llm_reservations'").out === "0");
    check("B8.4 Keine SECURITY-DEFINER-Funktion",
      psql("select count(*) from pg_proc where proname like 'helmut_%llm%' and prosecdef").out === "0");

    // ── B9 Rollback ───────────────────────────────────────────────────────
    psql(null, { datei: path.join(ROOT, "supabase/migrations/20260808_llm_budget_fairness_rollback.sql") });
    check("B9.1 Das Rollback entfernt Tabelle und Funktionen vollstaendig",
      psql("select count(*) from pg_class where relname='llm_reservations'").out === "0"
      && psql("select count(*) from pg_proc where proname='helmut_reserve_llm_result'").out === "0");
    check("B9.2 Der BESTAND aus 20260717 bleibt unangetastet",
      psql("select count(*) from pg_proc where proname='helmut_reserve_llm_call'").out === "1"
      && psql("select count(*) from pg_class where relname='llm_budget_counters'").out === "1");

    psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  }

  console.log(`\n== ERGEBNIS ==`);
  console.log(`PASS ${pass}  FAIL ${fail}  OFFEN ${offen}  (gesamt ${pass + fail + offen})`);
  if (offen > 0) console.log(`${offen} Punkt(e) sind AUSDRUECKLICH NICHT BEWIESEN.`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("TESTLAUF-FEHLER:", e && e.message);
  try { psql(`drop database if exists ${PG.db}`, { db: "postgres" }); } catch (_) { /* egal */ }
  process.exit(1);
});
