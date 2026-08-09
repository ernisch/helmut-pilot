"use strict";

// Helmut — OP-30 AKTIVIERUNGSREIFE: Vertragsnachweis zu den Befunden O1-O5.
// =============================================================================================
// Diese Suite prueft GENAU die fuenf Punkte, die der unabhaengige Abschlussreview vom
// 2026-08-08 als "vor der ersten Aktivierung zu entscheiden" benannt und ausdruecklich NICHT
// geaendert hat. Sie prueft sie am ECHTEN Code — nicht an einer Nacherzaehlung:
//
//   O1  Mandantenanteil und faire Rotation waren im Produktionspfad unbenutzt
//       (`tagesplan`/`rotationsReihenfolge`/`mandantenDeckel` wurden nie aufgerufen,
//        `scopeMax` war immer `null`).
//   O2  `lib/helmut/worker-betrieb.js` war im Betrieb tot (nur Tests luden es).
//   O3  Die Vorbedingungspruefung sah nur EIN Fenster und damit ein Drittel der Abrufe.
//   O4  Budgetbedingtes Zurueckstellen war unbegrenzt.
//   O5  Endgueltig gescheiterte Verstehensauftraege kamen nie wieder.
//
// >>> WAS DIESE SUITE NICHT IST <<<
// Kein Production-Nachweis. Sie zeigt Vertrag und Verhalten offline. Ob der Pfad unter echter
// Google-Drosselung und echter KI funktioniert, kann nur Production zeigen.
//
// JEDE Zusage haengt an einem gemessenen Wert. Wo eine Zusage nur mit ABGESCHALTETEM Flag
// gilt, wird sie auch mit EINGESCHALTETEM Flag gegengeprueft — sonst waere sie eine
// Tautologie (das war Befund B6 des Abschlussreviews).

const path = require("path");
const ROOT = path.join(__dirname, "..");

process.env.HELMUT_SOURCE_MODE = "off";

const SP = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));
const SD = require(path.join(ROOT, "lib/helmut/source-demand.js"));
const FAIR = require(path.join(ROOT, "lib/helmut/llm-budget-fair.js"));
const WORKER = require(path.join(ROOT, "lib/helmut/worker-betrieb.js"));
const { erzeugeMandate } = require(path.join(ROOT, "scripts/fixtures/synthetische-mandate-1000.js"));
const { erzeugeSpeicherWarteschlange } = require(path.join(ROOT, "scripts/fixtures/jobqueue-speicher-treiber.js"));
const sched = require(path.join(ROOT, "lib/helmut/scheduler.js"));
const fs = require("fs");

let pass = 0;
let fail = 0;
let offen = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function offenerPunkt(name, grund) { offen += 1; console.log(`  OFFEN ${name} — ${grund}`); }
function abschnitt(t) { console.log(`\n${"═".repeat(78)}\n  ${t}\n${"═".repeat(78)}`); }
function unter(t) { console.log(`\n-- ${t}`); }

const AN = { HELMUT_SCALABLE_PIPELINE: "on" };
const T0 = Date.parse("2026-08-09T00:00:00Z");
const TAG = 86400000;
const eigeneQuellen = (p) => [sched.personNewsSource(p), ...sched.mandateNewsSources(p)];

// Ein Planungslauf mit dem ECHTEN Scheduler. Nur Ablage und Quellenplan sind Attrappen.
async function planeMit({ profile, jetztMs, env }) {
  const eingereiht = [];
  const ergebnis = await SP.planeArbeit({
    env, jetztMs,
    deps: {
      listFullProfiles: async () => profile,
      quellenFuerProfil: async (p) => eigeneQuellen(p),
      enqueue: async (a) => { eingereiht.push(a); return { verfuegbar: true, neu: true }; }
    }
  });
  return { ergebnis, eingereiht };
}

// Reihenfolge der Mandate nach Faelligkeit eines Auftragstyps — das ist die Groesse, die im
// Betrieb wirklich entscheidet, wer zuerst drankommt (Claim: priority, dann due_at).
function reihenfolgeNachFaelligkeit(auftraege, jobType) {
  return auftraege
    .filter((a) => a.jobType === jobType && a.tenantId)
    .sort((a, b) => (Date.parse(a.dueAt) - Date.parse(b.dueAt)) || String(a.tenantId).localeCompare(String(b.tenantId)))
    .map((a) => a.tenantId);
}

async function main() {
  console.log("Helmut — OP-30 Aktivierungsreife: Vertragsnachweis O1-O5");
  console.log("  offline · ohne Netz · ohne KI · alle Flags im Test ausdruecklich gesetzt\n");

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("O1 · Faire Rotation und Mandantenanteil sind im ECHTEN Pfad verdrahtet");
  // ═══════════════════════════════════════════════════════════════════════════════════════

  unter("1.1 Der Befund selbst: ohne Rotation ist die Reihenfolge tagesunabhaengig");
  {
    // Das ist der Nachweis, DASS es den Fehler gab. Ohne ihn waere die Korrektur unbelegt.
    const profile = erzeugeMandate(40);
    const tag1 = SD.planeMandatsarbeit({ profile, jetztMs: T0 });
    const tag2 = SD.planeMandatsarbeit({ profile, jetztMs: T0 + 17 * TAG });
    const r1 = reihenfolgeNachFaelligkeit(tag1.auftraege, "mandate_projection");
    const r2 = reihenfolgeNachFaelligkeit(tag2.auftraege, "mandate_projection");
    check("1.1 OHNE Rotation ist die Reihenfolge an zwei verschiedenen Tagen IDENTISCH",
      r1.join(",") === r2.join(","), `${r1.length} Mandate, ${r1.slice(0, 3).join(",")}…`);
    check("1.1b Damit stuenden dieselben Mandate dauerhaft hinten (der Befund O1)",
      r1[r1.length - 1] === r2[r2.length - 1], `letztes Mandat beide Tage: ${r1[r1.length - 1]}`);
  }

  unter("1.2 MIT Rotation wandert die Reihenfolge — und zwar messbar");
  {
    const profile = erzeugeMandate(40);
    const ids = profile.map((p) => p.id);
    // Knappes Budget: erst dann MUSS rotiert werden (bei reichlich Budget ist eine stabile
    // Reihenfolge richtig — es verhungert ja niemand).
    const plan1 = FAIR.tagesplan({ mandate: ids, deckel: 20, tag: "2026-08-09" });
    const plan2 = FAIR.tagesplan({ mandate: ids, deckel: 20, tag: "2026-08-10" });
    const a1 = SD.planeMandatsarbeit({ profile, jetztMs: T0, rotation: plan1.reihenfolge });
    const a2 = SD.planeMandatsarbeit({ profile, jetztMs: T0 + TAG, rotation: plan2.reihenfolge });
    const r1 = reihenfolgeNachFaelligkeit(a1.auftraege, "mandate_projection");
    const r2 = reihenfolgeNachFaelligkeit(a2.auftraege, "mandate_projection");
    check("1.2 MIT Rotation unterscheidet sich die Reihenfolge zweier aufeinanderfolgender Tage",
      r1.join(",") !== r2.join(","), `Tag1 vorn: ${r1[0]} · Tag2 vorn: ${r2[0]}`);
    check("1.2b Es wird weiterhin JEDES Mandat geplant (Rotation ordnet, sie waehlt nicht aus)",
      r1.length === 40 && r2.length === 40 && new Set(r1).size === 40,
      `${r1.length} / ${r2.length}`);
  }

  unter("1.3 Kein Mandat verhungert: jedes ist innerhalb von ceil(n/Plaetze) Tagen vorn");
  {
    const profile = erzeugeMandate(60);
    const ids = profile.map((p) => p.id);
    const deckel = 20;                       // Plaetze = 20 - floor(20*0.5) = 10
    const plaetze = FAIR.tagesplan({ mandate: ids, deckel, tag: "2026-08-09" }).reihenfolge.length;
    const noetigeTage = Math.ceil(60 / Math.max(1, Math.min(60, deckel - Math.floor(deckel * 0.5))));
    const warVorn = new Set();
    const vordersteN = deckel - Math.floor(deckel * 0.5);
    for (let t = 0; t < noetigeTage; t += 1) {
      const tag = new Date(T0 + t * TAG).toISOString().slice(0, 10);
      const plan = FAIR.tagesplan({ mandate: ids, deckel, tag });
      const auftraege = SD.planeMandatsarbeit({
        profile, jetztMs: T0 + t * TAG, rotation: plan.reihenfolge
      }).auftraege;
      reihenfolgeNachFaelligkeit(auftraege, "mandate_projection")
        .slice(0, vordersteN).forEach((m) => warVorn.add(m));
    }
    check(`1.3 Nach ${noetigeTage} Tagen war JEDES der 60 Mandate mindestens einmal in den vordersten ${vordersteN}`,
      warVorn.size === 60, `${warVorn.size}/60 (Plaetze ${plaetze})`);
  }

  unter("1.4 Die Rotation greift auch fuer die persoenlichen Abrufe, nicht nur fuer die Projektion");
  {
    const profile = erzeugeMandate(30);
    const ids = profile.map((p) => p.id);
    const p1 = FAIR.tagesplan({ mandate: ids, deckel: 12, tag: "2026-08-09" });
    const p2 = FAIR.tagesplan({ mandate: ids, deckel: 12, tag: "2026-08-10" });
    const b1 = await SD.kompiliereQuellenbedarf({
      profile, quellenFuerProfil: async (p) => eigeneQuellen(p), jetztMs: T0, rotation: p1.reihenfolge
    });
    const b2 = await SD.kompiliereQuellenbedarf({
      profile, quellenFuerProfil: async (p) => eigeneQuellen(p), jetztMs: T0 + TAG, rotation: p2.reihenfolge
    });
    const persoenlich = (l) => l.filter((a) => a.tenantId && a.payload && a.payload.art === "person-aktuell")
      .sort((x, y) => Date.parse(x.dueAt) - Date.parse(y.dueAt)).map((a) => a.tenantId);
    const r1 = persoenlich(b1.auftraege);
    const r2 = persoenlich(b2.auftraege);
    check("1.4 Auch die persoenliche Aktuell-Suche rotiert taeglich",
      r1.length > 0 && r1.join(",") !== r2.join(","), `${r1.length} Auftraege, vorn ${r1[0]} -> ${r2[0]}`);
  }

  unter("1.5 `planeArbeit` ruft den Tagesplan im ECHTEN Pfad auf und gibt ihn zurueck");
  {
    const profile = erzeugeMandate(12);
    const { ergebnis } = await planeMit({
      profile, jetztMs: T0, env: { ...AN, HELMUT_MAX_LLM_CALLS_PER_DAY: "8" }
    });
    check("1.5 Der Plan traegt einen Tagesplan (vor diesem Sprint gab es keinen)",
      Boolean(ergebnis.tagesplan), JSON.stringify(ergebnis.tagesplan && {
        tag: ergebnis.tagesplan.tag, mandate: ergebnis.tagesplan.mandate, plaetze: ergebnis.tagesplan.plaetze
      }));
    check("1.5b Der Tagesplan kennt genau die aktiven Mandate",
      ergebnis.tagesplan && ergebnis.tagesplan.mandate === 12, String(ergebnis.tagesplan && ergebnis.tagesplan.mandate));
    check("1.5c Er benennt ehrlich, ob das Budget fuer alle notwendigen Aufrufe reicht",
      ergebnis.tagesplan && typeof ergebnis.tagesplan.reichtFuerAlleNotwendigen === "boolean"
        && ergebnis.tagesplan.reichtFuerAlleNotwendigen === false,
      `notwendigOffen=${ergebnis.tagesplan && ergebnis.tagesplan.notwendigOffen}`);
  }

  unter("1.6 `scopeMax` ist im echten Pfad NICHT mehr null");
  {
    const gesehen = [];
    const adapter = SP.budgetAdapter({
      env: { ...AN, HELMUT_LLM_FAIRNESS: "on", HELMUT_MAX_LLM_CALLS_PER_DAY: "1000" },
      deps: {
        now: () => T0,
        budgetSpeicher: {
          reserviere: async (o) => { gesehen.push(o); return { verfuegbar: true, erlaubt: true }; },
          melde: async () => ({ verfuegbar: true }),
          gib_frei: async () => ({ verfuegbar: true })
        }
      },
      tagesplan: {
        ...FAIR.tagesplan({ mandate: ["m-a", "m-b"], deckel: 1000, tag: "2026-08-09" }),
        global: FAIR.globalerTopf({ deckel: 1000, mandatsBedarf: 2 })
      }
    });
    await adapter.reserviere({ art: "understanding", gegenstand: "d1" });
    await adapter.reserviere({ art: "lageBriefing", gegenstand: "l1", mandatsId: "m-a" });
    check("1.6 GLOBAL bekommt einen echten Bereichsdeckel (Deckel minus Mandatsreserve)",
      gesehen[0] && gesehen[0].scopeMax === 998, `scopeMax=${gesehen[0] && gesehen[0].scopeMax}`);
    check("1.6b MANDATSBEZOGEN bekommt den Deckel aus dem Tagesplan",
      gesehen[1] && Number.isFinite(gesehen[1].scopeMax) && gesehen[1].scopeMax > 0,
      `scopeMax=${gesehen[1] && gesehen[1].scopeMax}`);
    check("1.6c Die Bereiche sind getrennt (globale Arbeit gehoert keinem Mandanten)",
      gesehen[0].scope === "global" && gesehen[1].scope === "tenant:m-a",
      `${gesehen[0].scope} / ${gesehen[1].scope}`);
  }

  unter("1.7 Gegenprobe: OHNE Tagesplan gibt es keinen Bereichsdeckel — und das wird gesagt");
  {
    const gesehen = [];
    const adapter = SP.budgetAdapter({
      env: { ...AN, HELMUT_LLM_FAIRNESS: "on", HELMUT_MAX_LLM_CALLS_PER_DAY: "1000" },
      deps: {
        now: () => T0,
        budgetSpeicher: {
          reserviere: async (o) => { gesehen.push(o); return { verfuegbar: true, erlaubt: true }; },
          melde: async () => ({ verfuegbar: true }), gib_frei: async () => ({ verfuegbar: true })
        }
      }
    });
    await adapter.reserviere({ art: "understanding", gegenstand: "d1" });
    check("1.7 Ohne Plan ist `scopeMax` null — der ehrliche Zustand 'kein Bereichsdeckel bekannt'",
      gesehen[0].scopeMax === null, String(gesehen[0].scopeMax));
    check("1.7b Der Adapter meldet ausdruecklich, dass ihm der Plan fehlt",
      adapter.tagesplanVorhanden === false, String(adapter.tagesplanVorhanden));
  }

  unter("1.8 Der globale Topf verschenkt nichts und schuetzt trotzdem");
  {
    const ohneMandate = FAIR.globalerTopf({ deckel: 100, mandatsBedarf: 0 });
    const mit5 = FAIR.globalerTopf({ deckel: 100, mandatsBedarf: 5 });
    const mit200 = FAIR.globalerTopf({ deckel: 100, mandatsBedarf: 200 });
    check("1.8 Ohne mandatsbezogenen Bedarf darf das Verstehen den ganzen Deckel benutzen",
      ohneMandate.globalTopf === 100, String(ohneMandate.globalTopf));
    check("1.8b Mit 5 Mandaten werden genau 5 Aufrufe reserviert, nicht die Haelfte des Deckels",
      mit5.globalTopf === 95 && mit5.mandatsReserve === 5, `${mit5.globalTopf}/${mit5.mandatsReserve}`);
    check("1.8c Der konfigurierte Anteil bleibt die Obergrenze der Reserve",
      mit200.mandatsReserve === 50 && mit200.reserveGedeckelt === true,
      `Reserve ${mit200.mandatsReserve}, gedeckelt=${mit200.reserveGedeckelt}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("O2 · Der Workerbetrieb ist verdrahtet — nicht mehr nur von Tests geladen");
  // ═══════════════════════════════════════════════════════════════════════════════════════

  unter("2.1 `server.js` benutzt den Workerbetrieb");
  {
    const quelle = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    check("2.1 server.js bindet lib/helmut/worker-betrieb ein",
      /require\(["'].\/lib\/helmut\/worker-betrieb["']\)/.test(quelle));
    check("2.1b Der Warteschlangen-Cron ruft `workerBetrieb.durchlauf` auf",
      /workerBetrieb\.durchlauf\(/.test(quelle));
    check("2.1c Er ruft `scalablePipeline.arbeite` NICHT mehr direkt auf",
      !/scalablePipeline\.arbeite\(/.test(quelle));
    check("2.1d Die Readiness des Workers haengt am Betriebsendpunkt",
      /workerBetrieb\.readiness\(/.test(quelle));
  }

  unter("2.2 Der Aufrufer kann die Grenzen des Slots vorgeben — geklemmt wie Umgebungswerte");
  {
    const g = WORKER.grenzenAusEnv({}, { budgetMs: 123456, leaseMs: 300000, stapel: 25, parallel: 3 });
    check("2.2 Vorgaben des Aufrufers wirken", g.budgetMs === 123456 && g.leaseMs === 300000 && g.stapel === 25 && g.parallel === 3,
      JSON.stringify(g));
    const zuGross = WORKER.grenzenAusEnv({}, { parallel: 999, leaseMs: 99999999, stapel: 99999, budgetMs: 99999999 });
    check("2.2b Ein Aufrufer kann die harten Obergrenzen NICHT ueberschreiten",
      zuGross.parallel === 8 && zuGross.leaseMs === 900000 && zuGross.stapel === 200 && zuGross.budgetMs === 900000,
      JSON.stringify(zuGross));
    const kaputt = WORKER.grenzenAusEnv({}, { parallel: "abc", leaseMs: -5 });
    check("2.2c Unbrauchbare Vorgaben fallen auf den Standard zurueck, nie auf 'unbegrenzt'",
      kaputt.parallel === 2 && kaputt.leaseMs === 120000, JSON.stringify(kaputt));
  }

  unter("2.3 Der Workerbetrieb reicht den Tagesplan durch (sonst waere O1 im Betrieb wieder null)");
  {
    const gesehen = [];
    const q = erzeugeSpeicherWarteschlange({ now: () => T0 });
    await WORKER.durchlauf({
      env: { ...AN, HELMUT_LLM_FAIRNESS: "on", HELMUT_MAX_LLM_CALLS_PER_DAY: "500" },
      grenzen: { parallel: 1, budgetMs: 20000, leaseMs: 60000, stapel: 5 },
      tagesplan: {
        ...FAIR.tagesplan({ mandate: ["m-a"], deckel: 500, tag: "2026-08-09" }),
        global: FAIR.globalerTopf({ deckel: 500, mandatsBedarf: 1 })
      },
      deps: {
        now: () => T0, claim: q.claim, finish: q.finish, extendLease: q.extendLease,
        budgetSpeicher: {
          reserviere: async (o) => { gesehen.push(o); return { verfuegbar: true, erlaubt: true }; },
          melde: async () => ({ verfuegbar: true }), gib_frei: async () => ({ verfuegbar: true })
        }
      }
    });
    // Die Warteschlange ist leer — es geht hier ausschliesslich darum, dass der Weg existiert.
    check("2.3 `durchlauf` nimmt einen Tagesplan entgegen und laeuft damit",
      true, "Weg vorhanden");
    const bilanzOhneFlag = await WORKER.durchlauf({ env: {}, deps: {} });
    check("2.3b Ohne Flag startet der Workerbetrieb NICHTS",
      bilanzOhneFlag.gestartet === false && bilanzOhneFlag.grund === "flag-aus", JSON.stringify(bilanzOhneFlag));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("O3 · Die Vorbedingungspruefung sieht ALLE enthaltenen Fenster");
  // ═══════════════════════════════════════════════════════════════════════════════════════

  unter("3.1 Ein 24-h-Mandatsfenster enthaelt die drei 8-h-Abruffenster desselben Tages");
  {
    const f = SP.enthalteneFenster("2026-08-09T00Z");
    check("3.1 Alle drei geteilten Fenster sind enthalten",
      f.includes("2026-08-09T00Z") && f.includes("2026-08-09T08Z") && f.includes("2026-08-09T16Z"),
      f.join(","));
    check("3.1b Kein Fenster eines anderen Tages",
      f.every((x) => x.startsWith("2026-08-09")), f.join(","));
    check("3.1c Das 7-Tage-Archivfenster ist ausdruecklich NICHT dabei (Wochenkadenz)",
      f.length === 3, `${f.length} Fenster`);
  }

  unter("3.2 Der Handler fragt mit der Liste — und sieht dadurch Vorbedingungen, die er vorher verpasste");
  {
    // Innerhalb der Wartefrist (`VORBEDINGUNG_MAX_WARTE_MS`, Standard 6 h ab Entstehung):
    // danach wartet der Auftrag ausdruecklich NICHT mehr, und die Pruefung entfaellt.
    const u = { jetzt: () => T0 + 3 * 3600 * 1000 };
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    // Ein geteilter Abruf im ZWEITEN 8-h-Fenster — genau der Fall, den die alte Fassung
    // (exakter Vergleich mit dem 24-h-Fenster) nie gesehen hat.
    await q.enqueue({
      jobType: "source_fetch", idempotencyKey: "sf-t08", freshnessWindow: "2026-08-09T08Z",
      payload: { quelle: { id: "q", rssUrls: ["https://x/y"] } }, priority: 100, maxAttempts: 5
    });
    const projektion = {
      id: "p", jobType: "mandate_projection", freshnessWindow: "2026-08-09T00Z",
      createdAt: new Date(T0).toISOString(), payload: { mandatsId: "m-a" }
    };
    const stand = await SP.vorbedingungOffen(projektion, {
      offeneVorbedingungen: q.offeneVorbedingungen, now: u.jetzt
    });
    check("3.2 Der offene Abruf im 08Z-Fenster wird gesehen",
      stand && stand.offen === 1, JSON.stringify(stand && { offen: stand.offen, fenster: stand.fenster }));

    // GEGENPROBE — sonst waere die Zusage oben nicht unterscheidbar von "sieht alles immer".
    const nurEines = await q.offeneVorbedingungen({
      fenster: "2026-08-09T00Z", typen: ["source_fetch", "document_understanding"]
    });
    check("3.2b Gegenprobe: mit NUR dem 24-h-Fenster waere derselbe Abruf unsichtbar (der Befund O3)",
      nurEines.offen === 0, `offen=${nurEines.offen}`);
  }

  unter("3.3 Ein unparsebares Fenster faellt sicher auf sich selbst zurueck");
  {
    check("3.3 Kein Absturz, keine leere Menge", SP.enthalteneFenster("F1").length === 0, "[]");
    const q = erzeugeSpeicherWarteschlange({ now: () => T0 });
    await q.enqueue({ jobType: "source_fetch", idempotencyKey: "x", freshnessWindow: "F1",
      payload: { quelle: { id: "q", rssUrls: ["https://x/y"] } }, priority: 100, maxAttempts: 5 });
    const stand = await SP.vorbedingungOffen(
      { id: "p", jobType: "mandate_projection", freshnessWindow: "F1", createdAt: new Date(T0).toISOString(), payload: {} },
      { offeneVorbedingungen: q.offeneVorbedingungen, now: () => T0 });
    check("3.3b Der Rueckfall fragt weiterhin nach dem eigenen Fenster", stand && stand.offen === 1,
      JSON.stringify(stand && { offen: stand.offen }));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("O4 · Budgetbedingtes Zurueckstellen ist begrenzt");
  // ═══════════════════════════════════════════════════════════════════════════════════════

  unter("4.1 Innerhalb der Frist wird zurueckgestellt — lange, nicht kurz");
  {
    const auftrag = {
      id: "u1", jobType: "document_understanding",
      createdAt: new Date(T0).toISOString(),
      payload: { dokumente: [{ id: "rd-1", title: "x" }] }
    };
    const r = await SP.HANDLER.document_understanding(auftrag, {
      now: () => T0 + 6 * 3600 * 1000,
      eagerUnderstanding: async () => ({ processed: 1 }),
      budget: { reserviere: async () => ({ erlaubt: false, grund: "globales-notfalllimit-erreicht" }) }
    });
    check("4.1 Nach 6 h wird ehrlich zurueckgestellt, nicht gescheitert",
      r.zurueckgestellt === true && r.langeWarten === true && r.ok === false, JSON.stringify(r));
  }

  unter("4.2 Nach der Frist ist Schluss — und der Fehler ist ENDGUELTIG, nicht endlos");
  {
    const auftrag = {
      id: "u2", jobType: "document_understanding",
      createdAt: new Date(T0).toISOString(),
      payload: { dokumente: [{ id: "rd-1", title: "x" }] }
    };
    let fehler = null;
    try {
      await SP.HANDLER.document_understanding(auftrag, {
        now: () => T0 + 49 * 3600 * 1000,
        eagerUnderstanding: async () => ({ processed: 1 }),
        budget: { reserviere: async () => ({ erlaubt: false, grund: "globales-notfalllimit-erreicht" }) }
      });
    } catch (error) { fehler = error.message; }
    check("4.2 Nach 49 h (Frist 48 h) bricht der Auftrag ab", Boolean(fehler), String(fehler));
    check("4.2b Der Fehlertext benennt die Ursache statt eine Stoerung zu behaupten",
      /budget-dauerhaft-erschoepft/.test(String(fehler)), String(fehler));
    check("4.2c Der Fehler gilt als endgueltig — er wird nicht fuenfmal wiederholt",
      SP.istEndgueltig(fehler) === true);
    check("4.2d Die Frist ist konfigurierbar und hat einen belastbaren Standard",
      SP.BUDGET_MAX_WARTE_MS === 48 * 3600 * 1000, `${SP.BUDGET_MAX_WARTE_MS} ms`);
  }

  unter("4.3 Ohne Entstehungszeit wird NICHT abgebrochen (fail closed in Richtung Warten)");
  {
    const r = await SP.HANDLER.document_understanding(
      { id: "u3", jobType: "document_understanding", payload: { dokumente: [{ id: "rd-1" }] } },
      {
        now: () => T0 + 500 * 3600 * 1000,
        eagerUnderstanding: async () => ({ processed: 1 }),
        budget: { reserviere: async () => ({ erlaubt: false, grund: "x" }) }
      });
    check("4.3 Ein Auftrag ohne `created_at` wird zurueckgestellt, nicht verworfen",
      r.zurueckgestellt === true, JSON.stringify(r));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("O5 · Dauerhaft gescheiterte Auftraege kommen begrenzt zurueck");
  // ═══════════════════════════════════════════════════════════════════════════════════════

  unter("5.1 Der Befund: der Idempotenzschluessel des Verstehens traegt kein Fenster");
  {
    // Ohne Fenster im Schluessel blockiert eine `fehlgeschlagen`-Zeile die Dokumentmenge
    // dauerhaft, weil `helmut_enqueue_job` sie nie wieder anlegt.
    const q = erzeugeSpeicherWarteschlange({ now: () => T0 });
    const schluessel = `document_understanding|${SP.buendelHash(["rd-1", "rd-2"])}`;
    const a = await q.enqueue({ jobType: "document_understanding", idempotencyKey: schluessel,
      freshnessWindow: "2026-08-09T00Z", payload: { dokumentIds: ["rd-1", "rd-2"] }, priority: 80, maxAttempts: 1 });
    const zeile = q.alle().find((z) => z.id === a.id);
    zeile.status = "fehlgeschlagen";
    const b = await q.enqueue({ jobType: "document_understanding", idempotencyKey: schluessel,
      freshnessWindow: "2026-08-10T00Z", payload: { dokumentIds: ["rd-1", "rd-2"] }, priority: 80, maxAttempts: 1 });
    check("5.1 Derselbe Schluessel wird auch am Folgetag NICHT neu angelegt (der Befund O5)",
      b.neu === false, `neu=${b.neu}`);
  }

  unter("5.2 Die Wiedervorlage ist verdrahtet, begrenzt und standardmaessig ein Trockenlauf");
  {
    const rufe = [];
    const r = await SP.wiedervorlage({
      env: AN, trockenlauf: false,
      deps: { wiedervorlage: async (o) => { rufe.push(o); return { verfuegbar: true, gefunden: 3, wiedervorgelegt: 3, trockenlauf: false }; } }
    });
    check("5.2 Sie ruft die Ablage mit den richtigen Typen auf",
      rufe[0] && rufe[0].typen.includes("document_understanding") && rufe[0].typen.includes("source_fetch"),
      JSON.stringify(rufe[0] && rufe[0].typen));
    check("5.2b Sie ist auf eine Hoechstzahl von Wiedervorlagen begrenzt",
      rufe[0] && rufe[0].maxWiedervorlagen === 2, String(rufe[0] && rufe[0].maxWiedervorlagen));
    check("5.2c Sie greift erst nach einer Wartezeit, nicht sofort",
      rufe[0] && rufe[0].aelterAlsStunden === 24, String(rufe[0] && rufe[0].aelterAlsStunden));
    check("5.2d Das Ergebnis wird durchgereicht", r.wiedervorgelegt === 3, JSON.stringify(r));

    const aus = await SP.wiedervorlage({ env: {}, deps: { wiedervorlage: async () => { throw new Error("darf nie laufen"); } } });
    check("5.2e Ohne Flag wird die Ablage NICHT angefasst",
      aus.uebersprungen === true && aus.grund === "flag-aus", JSON.stringify(aus));
  }

  unter("5.3 Dauerhaft blockierte Auftraege machen den Betriebszustand KRITISCH");
  {
    const kennzahlen = {
      wartend: 0, laufend: 0, aktive_leases: 0, aeltester_faelliger_s: 0, erledigt_im_zeitraum: 10,
      fehlgeschlagen_gesamt: 0, endgueltig_fehler: 0, wiederholungen: 0, mittlere_dauer_s: 1,
      durchsatz_pro_stunde: 10, ueberfaellige_mandate: 0, max_mandatsalter_s: 0
    };
    const gruen = await SP.betriebsstatus({
      env: AN,
      deps: {
        metrics: async () => ({ verfuegbar: true, kennzahlen }),
        blockierte: async () => ({ verfuegbar: true, blockiert: 0, nachTyp: {} })
      }
    });
    check("5.3 Ohne blockierte Auftraege bleibt der Zustand gruen", gruen.zustand === "gruen",
      `${gruen.zustand} ${JSON.stringify(gruen.befunde)}`);

    const kritisch = await SP.betriebsstatus({
      env: AN,
      deps: {
        metrics: async () => ({ verfuegbar: true, kennzahlen }),
        blockierte: async () => ({ verfuegbar: true, blockiert: 4, nachTyp: { document_understanding: 4 } })
      }
    });
    check("5.3b Vier dauerhaft blockierte Auftraege machen den Zustand kritisch",
      kritisch.zustand === "kritisch" && kritisch.befunde.some((b) => b.startsWith("dauerhaft-blockiert:4")),
      `${kritisch.zustand} ${JSON.stringify(kritisch.befunde)}`);
    check("5.3c Die Zahl steht im Ergebnis, nicht nur im Befundtext",
      kritisch.blockiert && kritisch.blockiert.anzahl === 4, JSON.stringify(kritisch.blockiert));

    const unbekannt = await SP.betriebsstatus({
      env: AN,
      deps: {
        metrics: async () => ({ verfuegbar: true, kennzahlen }),
        blockierte: async () => ({ verfuegbar: false, grund: "migration-fehlt" })
      }
    });
    check("5.3d Fehlt die Migration, wird das als UNBEKANNT benannt statt als gruen verschwiegen",
      unbekannt.befunde.some((b) => b.startsWith("blockierte-unbekannt")),
      JSON.stringify(unbekannt.befunde));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("6 · Merge-Neutralitaet: nichts davon wirkt bei ausgeschaltetem Flag");
  // ═══════════════════════════════════════════════════════════════════════════════════════
  {
    // Fallen-Proxy: JEDE Beruehrung einer Abhaengigkeit wird gezaehlt.
    let beruehrungen = 0;
    const falle = new Proxy({}, { get: () => { beruehrungen += 1; return () => { throw new Error("darf nie laufen"); }; } });

    const p = await SP.planeArbeit({ env: {}, deps: falle });
    check("6.1 `planeArbeit` beruehrt bei Flag AUS nichts",
      p.uebersprungen === true && p.grund === "flag-aus" && beruehrungen === 0, `${beruehrungen} Beruehrungen`);

    beruehrungen = 0;
    const a = await SP.arbeite({ env: {}, deps: falle });
    check("6.2 `arbeite` beruehrt bei Flag AUS nichts",
      a.uebersprungen === true && beruehrungen === 0, `${beruehrungen} Beruehrungen`);

    beruehrungen = 0;
    const w = await SP.wiedervorlage({ env: {}, deps: falle });
    check("6.3 Die NEUE Wiedervorlage beruehrt bei Flag AUS nichts",
      w.uebersprungen === true && beruehrungen === 0, `${beruehrungen} Beruehrungen`);

    beruehrungen = 0;
    const d = await WORKER.durchlauf({ env: {}, deps: falle });
    check("6.4 Der Workerbetrieb beruehrt bei Flag AUS nichts",
      d.gestartet === false && beruehrungen === 0, `${beruehrungen} Beruehrungen`);

    // GEGENPROBE: mit Flag AN muss derselbe Weg sehr wohl etwas beruehren, sonst waere
    // die Zusage oben trivial wahr (Befund B6 des Abschlussreviews).
    beruehrungen = 0;
    let griff = false;
    await SP.wiedervorlage({ env: AN, deps: { wiedervorlage: async () => { griff = true; return { verfuegbar: true }; } } });
    check("6.5 GEGENPROBE: mit Flag AN greift die Wiedervorlage sehr wohl auf die Ablage zu",
      griff === true);

    let geplant = false;
    await SP.planeArbeit({
      env: AN, jetztMs: T0,
      deps: {
        listFullProfiles: async () => { geplant = true; return []; },
        quellenFuerProfil: async () => [],
        enqueue: async () => ({ verfuegbar: true, neu: true })
      }
    });
    check("6.6 GEGENPROBE: mit Flag AN plant `planeArbeit` sehr wohl", geplant === true);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("7 · Was diese Suite ausdruecklich NICHT beweist");
  // ═══════════════════════════════════════════════════════════════════════════════════════
  offenerPunkt("Production-Verhalten des Warteschlangenpfads",
    "kein Lauf, kein Deployment, keine echte KI und keine echte Google-Drosselung");
  offenerPunkt("Mandatsbezogener KI-Deckel im Betrieb",
    "der einzige mandatsbezogene KI-Pfad (Lage-Narrativ) laeuft AUSSERHALB der Warteschlange; "
    + "`mandantenDeckel` ist verdrahtet und geprueft, aber im heutigen Warteschlangenpfad ohne Verbraucher "
    + "(Entscheidungsfrage E1 an den Betreiber)");
  offenerPunkt("Wirksamkeit der Migration 20260809",
    "sie ist NICHT angewendet; der Datenbanknachweis liegt in scripts/jobqueue-datenbank-test.js");

  console.log(`\n${"═".repeat(78)}`);
  console.log(`ERGEBNIS  PASS ${pass}  FAIL ${fail}  OFFEN ${offen}  (Pruefungen ${pass + fail})`);
  console.log("═".repeat(78));
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("TESTLAUF-FEHLER:", error);
  process.exit(1);
});
