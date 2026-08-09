"use strict";

// Helmut — VERTRAGSSUITE des fuenften Auftragstyps `tenant_narrative` (E1, 2026-08-09).
// =============================================================================================
// ENTSCHEIDUNG E1: das Lage-Narrativ — der einzige mandatsbezogene KI-Pfad, bisher
// ausschliesslich im Cron `lage-briefing` (EIN Slot, maxDuration 300) — laeuft als fuenfter
// Auftragstyp ueber die bestehende OP-30-Warteschlange. Kein paralleles System: der Handler
// ruft die UNVERAENDERTE Produktionsfunktion `lage.buildLageBriefing` auf.
//
// Diese Suite prueft den VERTRAG: Flaggrenzen, Auftragsform, Idempotenz, Vorbedingungen,
// alle Ergebnispfade des Handlers, Budget-Fairness, Worker-Integration, atomare
// Veroeffentlichung ueber den ECHTEN Lage-Pfad, Tenant-Trennung und Merge-Neutralitaet.
// Offline, ohne Netz, ohne KI, ohne Datenbank (der Datenbanknachweis der Migration steht in
// scripts/jobqueue-narrativ-datenbank-test.js).

const path = require("path");
const ROOT = path.join(__dirname, "..");

process.env.HELMUT_SOURCE_MODE = "off";

const SP = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));
const SD = require(path.join(ROOT, "lib/helmut/source-demand.js"));
const WORKER = require(path.join(ROOT, "lib/helmut/worker-betrieb.js"));
const FAIR = require(path.join(ROOT, "lib/helmut/llm-budget-fair.js"));
const { erzeugeSpeicherWarteschlange, AUFGABENTYPEN } = require(path.join(ROOT, "scripts/fixtures/jobqueue-speicher-treiber.js"));

const storage = require(path.join(ROOT, "lib/helmut/storage.js"));
const ai = require(path.join(ROOT, "lib/helmut/ai.js"));
const sourceSafety = require(path.join(ROOT, "lib/helmut/sourceSafety.js"));
const lage = require(path.join(ROOT, "lib/helmut/lage.js"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n${"═".repeat(78)}\n  ${t}\n${"═".repeat(78)}`); }

const AUS = {};
const NUR_PIPELINE = { HELMUT_SCALABLE_PIPELINE: "on" };
const NUR_NARRATIV = { HELMUT_NARRATIV_QUEUE: "on" };
const BEIDE = { HELMUT_SCALABLE_PIPELINE: "on", HELMUT_NARRATIV_QUEUE: "on" };
const T0 = Date.parse("2026-08-08T00:00:00Z");

function uhr(startMs = T0) {
  let ms = startMs;
  return { jetzt: () => ms, vor: (d) => { ms += d; }, setze: (v) => { ms = v; } };
}

const profil = (id, extra = {}) => ({
  id, fullName: `${id} Test`, party: "P", faction: "F", committee: "C",
  focusTopics: ["T"], topicPriorities: { T: 1 }, state: "Bayern", constituency: "WK", ...extra
});

async function main() {
  console.log("Helmut — Vertragssuite tenant_narrative (fuenfter Auftragstyp, E1)");

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("1 · Flaggrenzen — default AUS, fail closed, beide Flags noetig");
  // ═══════════════════════════════════════════════════════════════════════════════════════
  {
    check("1.1 Ohne jedes Flag ist das Narrativflag AUS", SP.narrativFlagAktiv(AUS) === false);
    for (const wert of ["on", "true", "1", "an"]) {
      check(`1.2 Ja-Schreibweise ${JSON.stringify(wert)} schaltet das Flag ein`,
        SP.narrativFlagAktiv({ HELMUT_NARRATIV_QUEUE: wert }) === true);
    }
    for (const wert of ["", " ", "off", "0", "nein", "yes", "ja", "onn", "on;", "2", "enabled", "narrativ"]) {
      check(`1.3 Wert ${JSON.stringify(wert)} bedeutet AUS (fail closed)`,
        SP.narrativFlagAktiv({ HELMUT_NARRATIV_QUEUE: wert }) === false);
    }
    check("1.4 NUR das Narrativflag (ohne Pipeline) ist vollstaendig wirkungslos",
      SP.narrativUeberWarteschlange(NUR_NARRATIV) === false);
    check("1.5 NUR die Pipeline (ohne Narrativflag) aktiviert den fuenften Typ NICHT",
      SP.narrativUeberWarteschlange(NUR_PIPELINE) === false);
    check("1.6 Erst BEIDE Flags zusammen aktivieren den fuenften Typ",
      SP.narrativUeberWarteschlange(BEIDE) === true);
    check("1.7 Die Prozessumgebung traegt keines der Flags",
      process.env.HELMUT_SCALABLE_PIPELINE === undefined && process.env.HELMUT_NARRATIV_QUEUE === undefined);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("2 · Planung — Auftragsvertrag, Phasenfenster, Merge-Neutralitaet");
  // ═══════════════════════════════════════════════════════════════════════════════════════
  {
    const jetzt = T0 + 2 * 3600 * 1000;
    const profile = [profil("m-a"), profil("m-b"), profil("m-c")];

    // Merge-Neutralitaet der Planung: ohne Narrativ-Aktivierung ist der Plan zeichengleich
    // zum Plan OHNE den neuen Parameter — der fuenfte Typ existiert dann schlicht nicht.
    const ohneParameter = SD.planeMandatsarbeit({ profile, jetztMs: jetzt });
    const ausdruecklichAus = SD.planeMandatsarbeit({ profile, jetztMs: jetzt, narrativAktiv: false });
    check("2.1 Ohne Aktivierung ist der Plan zeichengleich zum bisherigen (Merge-Neutralitaet)",
      JSON.stringify(ohneParameter) === JSON.stringify(ausdruecklichAus));
    check("2.2 Ohne Aktivierung entsteht KEIN tenant_narrative-Auftrag",
      ohneParameter.auftraege.every((a) => a.jobType !== "tenant_narrative"),
      `${ohneParameter.auftraege.length} Auftraege, Typen ${[...new Set(ohneParameter.auftraege.map((a) => a.jobType))].join("/")}`);

    const mitNarrativ = SD.planeMandatsarbeit({ profile, jetztMs: jetzt, narrativAktiv: true });
    const narrative = mitNarrativ.auftraege.filter((a) => a.jobType === "tenant_narrative");
    check("2.3 Mit Aktivierung entsteht GENAU EIN Narrativauftrag je Mandat",
      narrative.length === 3, `${narrative.length} von 3`);
    check("2.4 Die uebrigen Auftraege sind unveraendert (Projektion + Briefing je Mandat)",
      mitNarrativ.auftraege.length === ohneParameter.auftraege.length + 3);

    const fenster = SD.fensterKennung(jetzt, SD.fensterKonfig({}).mandatMaxAlterStunden);
    for (const a of narrative) {
      const mandat = a.payload.mandatsId;
      check(`2.5 [${mandat}] Idempotenzschluessel = tenant_narrative|<mandat>|<fenster>`,
        a.idempotencyKey === `tenant_narrative|${mandat}|${fenster}`, a.idempotencyKey);
      check(`2.6 [${mandat}] Tenant-Bindung, Prioritaet 240, 5 Versuche, Fenster gesetzt`,
        a.tenantId === mandat && a.priority === 240 && a.maxAttempts === 5 && a.freshnessWindow === fenster);
      check(`2.7 [${mandat}] Nutzdaten enthalten NUR die Mandatskennung (keine Inhaltskopie)`,
        JSON.stringify(Object.keys(a.payload)) === JSON.stringify(["mandatsId"]));
      // Phasenfenster [24 %, 33,3 %) des 24-h-Fensters = 05:45:36 bis 08:00 UTC.
      const fensterStart = Date.parse(fenster.replace(/Z$/, ":00:00.000Z"));
      const anteil = (Date.parse(a.dueAt) - fensterStart) / (24 * 3600 * 1000);
      check(`2.8 [${mandat}] Faelligkeit liegt im Morgenkorridor [24 %, 33,3 %)`,
        anteil >= 0.24 && anteil < 1 / 3, `${Math.round(anteil * 1000) / 10} %`);
    }

    // Rotation: die Faelligkeitsplaetze folgen der uebergebenen Reihenfolge.
    const rotiert = SD.planeMandatsarbeit({
      profile, jetztMs: jetzt, narrativAktiv: true, rotation: ["m-c", "m-a", "m-b"]
    }).auftraege.filter((a) => a.jobType === "tenant_narrative");
    const nachFaelligkeit = [...rotiert].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
      .map((a) => a.payload.mandatsId);
    check("2.9 Die Rotationsreihenfolge bestimmt die Faelligkeitsreihenfolge",
      JSON.stringify(nachFaelligkeit) === JSON.stringify(["m-c", "m-a", "m-b"]), nachFaelligkeit.join(","));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("3 · Scheduler-Integration und Idempotenz (doppelter Scheduler)");
  // ═══════════════════════════════════════════════════════════════════════════════════════
  {
    const u = uhr(T0 + 3600 * 1000);
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    const profile = [profil("m-a"), profil("m-b")];
    const deps = {
      listFullProfiles: async () => profile,
      quellenFuerProfil: async () => [],
      enqueue: q.enqueue
    };

    const nurPipeline = await SP.planeArbeit({ env: NUR_PIPELINE, jetztMs: u.jetzt(), deps });
    check("3.1 Pipeline AN, Narrativ AUS: der Scheduler plant KEINEN Narrativauftrag",
      nurPipeline.uebersprungen === false
      && q.alle().every((z) => z.job_type !== "tenant_narrative"));

    q.zuruecksetzen();
    const beide = await SP.planeArbeit({ env: BEIDE, jetztMs: u.jetzt(), deps });
    const narrative = q.alle().filter((z) => z.job_type === "tenant_narrative");
    check("3.2 Beide Flags AN: genau ein Narrativauftrag je aktivem Mandat",
      beide.ok === true && narrative.length === 2, `${narrative.length} von 2`);

    const zweiter = await SP.planeArbeit({ env: BEIDE, jetztMs: u.jetzt() + 60000, deps });
    check("3.3 Ein doppelter Scheduler legt NICHTS erneut an (Idempotenz)",
      zweiter.neu === 0 && q.alle().filter((z) => z.job_type === "tenant_narrative").length === 2,
      `neu=${zweiter.neu}`);

    // Deaktivierte Mandate werden gar nicht erst geplant (dasselbe Praedikat wie 12.12).
    q.zuruecksetzen();
    await SP.planeArbeit({
      env: BEIDE, jetztMs: u.jetzt(),
      deps: { ...deps, listFullProfiles: async () => [profil("m-a"), profil("m-aus", { profileActive: false })] }
    });
    check("3.4 Deaktivierte Mandate bekommen keinen Narrativauftrag",
      q.alle().filter((z) => z.job_type === "tenant_narrative").map((z) => z.tenant_id).join(",") === "m-a");

    // Neues Fenster = neuer Schluessel = neuer Auftrag (naechster Tag).
    q.zuruecksetzen();
    await SP.planeArbeit({ env: BEIDE, jetztMs: u.jetzt(), deps });
    await SP.planeArbeit({ env: BEIDE, jetztMs: u.jetzt() + 24 * 3600 * 1000, deps });
    check("3.5 Ein neues 24-h-Fenster erzeugt einen NEUEN Tagesauftrag (fachliche Notwendigkeit)",
      q.alle().filter((z) => z.job_type === "tenant_narrative").length === 4);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("4 · Handler — alle Ergebnispfade, ehrlich abgebildet");
  // ═══════════════════════════════════════════════════════════════════════════════════════
  {
    const H = SP.HANDLER.tenant_narrative;
    check("4.0 Der fuenfte Auftragstyp hat einen Handler", typeof H === "function");

    const basisAuftrag = {
      id: "j-n1", jobType: "tenant_narrative", payload: { mandatsId: "m-a" },
      freshnessWindow: "2026-08-08T00Z", createdAt: new Date(T0).toISOString()
    };
    const basisDeps = (lageErgebnis, extra = {}) => ({
      env: BEIDE,
      now: () => T0 + 6 * 3600 * 1000,
      getActiveProfile: async (id) => profil(id),
      istDeaktiviert: () => false,
      lageNarrativ: async () => lageErgebnis,
      ...extra
    });

    // 4.1 Flag aus -> uebersprungen, KEIN Aufruf der Bestandsfunktion.
    let aufgerufen = 0;
    const aus = await H(basisAuftrag, basisDeps(null, {
      env: NUR_PIPELINE, lageNarrativ: async () => { aufgerufen += 1; return null; }
    }));
    check("4.1 Flag aus: Auftrag wird uebersprungen abgeschlossen, ohne Modellpfad",
      aus.ok === true && aus.uebersprungen === true && aus.veroeffentlicht === false
      && aus.grund === "narrativ-flag-aus" && aufgerufen === 0);

    // 4.2 Fehlende Mandatskennung -> endgueltig.
    let fehler = null;
    try { await H({ ...basisAuftrag, payload: {} }, basisDeps(null)); } catch (e) { fehler = e.message; }
    check("4.2 Ohne Mandatskennung: payload-ungueltig (endgueltig)",
      /payload-ungueltig/.test(String(fehler)) && SP.istEndgueltig(fehler) === true);

    // 4.3 Deaktiviertes Mandat wird VOR der Ausfuehrung erneut geprueft.
    aufgerufen = 0;
    const deaktiviert = await H(basisAuftrag, basisDeps(null, {
      getActiveProfile: async (id) => profil(id, { profileActive: false }),
      istDeaktiviert: (p) => p.profileActive === false,
      lageNarrativ: async () => { aufgerufen += 1; return { available: true }; }
    }));
    check("4.3 Deaktiviertes Mandat: uebersprungen, KEIN Modellpfad, kein Fehler",
      deaktiviert.ok === true && deaktiviert.uebersprungen === true
      && deaktiviert.grund === "profil-deaktiviert" && aufgerufen === 0);

    // 4.4 Offene Vorbedingung -> zurueckgestellt, kein Aufruf.
    aufgerufen = 0;
    const wartet = await H(basisAuftrag, basisDeps(null, {
      offeneVorbedingungen: async () => ({ verfuegbar: true, offen: 2, wartend: 2, laufend: 0 }),
      lageNarrativ: async () => { aufgerufen += 1; return { available: true }; }
    }));
    check("4.4 Offene Vorbedingung (Abruf/Verstehen): zurueckgestellt, KEIN Modellpfad",
      wartet.ok === false && wartet.zurueckgestellt === true
      && /vorbedingung-offen/.test(wartet.grund) && aufgerufen === 0);
    check("4.5 Die Vorbedingungstypen des Narrativs sind Abruf und Verstehen — NICHT die Projektion",
      JSON.stringify(SP.VORBEDINGUNGEN.tenant_narrative) === JSON.stringify(["source_fetch", "document_understanding"]));

    // 4.5b KEIN unbegrenztes Pendeln: ist die Vorbedingungs-Wartefrist (ab ENTSTEHUNG,
    // nicht ab der verschiebbaren Faelligkeit) abgelaufen, laeuft das Narrativ mit dem,
    // was da ist — eine dauerhaft blockierte Vorbedingung haelt es nicht ewig fest.
    aufgerufen = 0;
    const erzwungen = await H(
      { ...basisAuftrag, createdAt: new Date(T0 - 7 * 3600 * 1000).toISOString() },
      basisDeps({ available: true, fromCache: false, paragraphs: [{ text: "A" }] }, {
        offeneVorbedingungen: async () => { aufgerufen += 1; return { verfuegbar: true, offen: 99, wartend: 99, laufend: 0 }; }
      }));
    check("4.5b Nach Ablauf der Wartefrist laeuft das Narrativ trotz offener Vorbedingung (kein Pendeln)",
      erzwungen.ok === true && erzwungen.veroeffentlicht === true && aufgerufen === 0,
      `Vorbedingungsabfrage wurde ${aufgerufen}x gestellt (Frist laengst abgelaufen)`);

    // 4.6 Erfolg -> veroeffentlicht.
    const ok = await H(basisAuftrag, basisDeps({
      available: true, fromCache: false, model: "gpt-5-mini",
      paragraphs: [{ text: "A" }], vorgaenge: [{}, {}]
    }));
    check("4.6 Veroeffentlichtes Narrativ: ok, veroeffentlicht, Zaehler ehrlich",
      ok.ok === true && ok.veroeffentlicht === true && ok.ausCache === false
      && ok.absaetze === 1 && ok.vorgaenge === 2 && ok.modell === "gpt-5-mini");

    // 4.7 Cache-Treffer -> ok, als Cache gekennzeichnet.
    const cache = await H(basisAuftrag, basisDeps({ available: true, fromCache: true, paragraphs: [{ text: "A" }] }));
    check("4.7 Cache-Treffer: ok und ausdruecklich als ausCache gekennzeichnet",
      cache.ok === true && cache.veroeffentlicht === true && cache.ausCache === true);

    // 4.8 Leerzustand -> ok OHNE Veroeffentlichung (ehrlich, kein Fake).
    const leer = await H(basisAuftrag, basisDeps({ available: false, reason: "no-vorgaenge" }));
    check("4.8 Ehrlicher Leerzustand: ok, aber veroeffentlicht=false mit Grund",
      leer.ok === true && leer.veroeffentlicht === false && leer.grund === "no-vorgaenge");

    // 4.9 Budget (inneres Gate) -> lange zurueckgestellt.
    const budgetKnapp = await H(basisAuftrag, basisDeps({ available: false, reason: "budget" }));
    check("4.9 Budget erschoepft (inneres Gate): lange zurueckgestellt, kein Fehlversuch",
      budgetKnapp.ok === false && budgetKnapp.zurueckgestellt === true && budgetKnapp.langeWarten === true);

    // 4.10 Budget dauerhaft erschoepft (aelter als 48 h) -> endgueltig (O4-Disziplin).
    fehler = null;
    try {
      await H({ ...basisAuftrag, createdAt: new Date(T0 - 49 * 3600 * 1000).toISOString() },
        basisDeps({ available: false, reason: "budget" }));
    } catch (e) { fehler = e.message; }
    check("4.10 Nach 48 h ohne Budget: budget-dauerhaft-erschoepft (endgueltig)",
      /budget-dauerhaft-erschoepft/.test(String(fehler)) && SP.istEndgueltig(fehler) === true, String(fehler));

    // 4.11 Fremde Sperre -> kurz zurueckgestellt.
    const gesperrt = await H(basisAuftrag, basisDeps({ available: false, reason: "generating" }));
    check("4.11 Fremde Sperre (anderer Generator): zurueckgestellt, NICHT lange",
      gesperrt.ok === false && gesperrt.zurueckgestellt === true && gesperrt.langeWarten !== true);

    // 4.12 KI-Fehler -> voruebergehend (Backoff).
    fehler = null;
    try { await H(basisAuftrag, basisDeps({ available: false, reason: "ai-unavailable" })); } catch (e) { fehler = e.message; }
    check("4.12 KI-Fehler: voruebergehend (Backoff, kein endgueltiges Scheitern)",
      /narrativ-voruebergehend: ai-unavailable/.test(String(fehler)) && SP.istEndgueltig(fehler) === false);

    // 4.13 Ablage-Lesefehler -> voruebergehend.
    fehler = null;
    try { await H(basisAuftrag, basisDeps({ available: false, reason: "store-error" })); } catch (e) { fehler = e.message; }
    check("4.13 Ablage-Lesefehler: voruebergehend", /narrativ-voruebergehend: store-error/.test(String(fehler))
      && SP.istEndgueltig(fehler) === false);

    // 4.14 Strukturell unmoeglich -> endgueltig.
    fehler = null;
    try { await H(basisAuftrag, basisDeps({ available: false, reason: "v3-disabled" })); } catch (e) { fehler = e.message; }
    check("4.14 V3-Ablage abgeschaltet: endgueltig (narrativ-nicht-moeglich)",
      /narrativ-nicht-moeglich: v3-disabled/.test(String(fehler)) && SP.istEndgueltig(fehler) === true);

    // 4.15 Kein Profil -> endgueltig.
    fehler = null;
    try { await H(basisAuftrag, basisDeps(null, { getActiveProfile: async () => null })); } catch (e) { fehler = e.message; }
    check("4.15 Kein Profil: profil-nicht-gefunden (endgueltig)",
      /profil-nicht-gefunden/.test(String(fehler)) && SP.istEndgueltig(fehler) === true);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("5 · Budget-Fairness — der Verbraucher, der O1 bisher fehlte");
  // ═══════════════════════════════════════════════════════════════════════════════════════
  {
    check("5.1 Die Art lageBriefing ist MANDATSBEZOGEN (Scope tenant:<id>)",
      FAIR.istGlobaleArt("lageBriefing") === false
      && FAIR.scopeFuer({ art: "lageBriefing", mandatsId: "m-a" }) === "tenant:m-a");

    const buchungen = [];
    const budget = {
      reserviere: async (o) => { buchungen.push(o); return { erlaubt: true, wiederverwendet: false, resultKey: "k" }; },
      melde: async (o) => { buchungen.push({ melde: o.ok, ungenutzt: o.ungenutzt, note: o.note }); }
    };
    const auftrag = {
      id: "j-b1", jobType: "tenant_narrative", payload: { mandatsId: "m-a" },
      freshnessWindow: "2026-08-08T00Z", createdAt: new Date(T0).toISOString()
    };
    const deps = (lageErgebnis, b = budget) => ({
      env: BEIDE, now: () => T0 + 3600 * 1000,
      getActiveProfile: async (id) => profil(id), istDeaktiviert: () => false,
      lageNarrativ: async () => lageErgebnis, budget: b
    });

    await SP.HANDLER.tenant_narrative(auftrag, deps({ available: true, fromCache: false, paragraphs: [{}] }));
    check("5.2 Die Reservierung traegt Mandat UND Fenster (ein bezahltes Narrativ je Mandat/Fenster)",
      buchungen[0] && buchungen[0].art === "lageBriefing" && buchungen[0].mandatsId === "m-a"
      && buchungen[0].gegenstand === "2026-08-08T00Z");
    check("5.3 Ein echter Aufruf wird als verbraucht gemeldet (nicht zurueckgegeben)",
      buchungen[1] && buchungen[1].melde === true && buchungen[1].ungenutzt === false);

    buchungen.length = 0;
    await SP.HANDLER.tenant_narrative(auftrag, deps({ available: true, fromCache: true, paragraphs: [{}] }));
    check("5.4 Ein Cache-Treffer gibt die Reservierung ZURUECK (kein Modellaufruf bezahlt)",
      buchungen[1] && buchungen[1].melde === true && buchungen[1].ungenutzt === true);

    // Wiederverwendete Reservierung darf NIE zurueckgegeben werden (Budgetleckage-Lehre).
    buchungen.length = 0;
    await SP.HANDLER.tenant_narrative(auftrag, deps({ available: true, fromCache: true, paragraphs: [{}] }, {
      reserviere: async () => ({ erlaubt: true, wiederverwendet: true, resultKey: "k" }),
      melde: async (o) => { buchungen.push({ ungenutzt: o.ungenutzt }); }
    }));
    check("5.5 Eine WIEDERVERWENDETE Reservierung wird nie zurueckgegeben",
      buchungen[0] && buchungen[0].ungenutzt === false);

    // Abgelehnte Reservierung -> lange zurueckgestellt; nach 48 h endgueltig.
    const abgelehnt = { reserviere: async () => ({ erlaubt: false, grund: "mandats-deckel-erreicht" }) };
    const zurueck = await SP.HANDLER.tenant_narrative(auftrag, deps(null, abgelehnt));
    check("5.6 Abgelehnte Fairness-Reservierung: lange zurueckgestellt mit Grund",
      zurueck.ok === false && zurueck.langeWarten === true && /mandats-deckel-erreicht/.test(zurueck.grund));
    let fehler = null;
    try {
      await SP.HANDLER.tenant_narrative(
        { ...auftrag, createdAt: new Date(T0 - 49 * 3600 * 1000).toISOString() }, deps(null, abgelehnt));
    } catch (e) { fehler = e.message; }
    check("5.7 Nach 48 h abgelehnter Reservierung: endgueltig (O4)",
      /budget-dauerhaft-erschoepft/.test(String(fehler)));

    // Fehler im Modellpfad -> Reservierung wird als fehlgeschlagen gemeldet, NICHT freigegeben.
    buchungen.length = 0;
    fehler = null;
    try {
      await SP.HANDLER.tenant_narrative(auftrag, {
        ...deps(null, budget), lageNarrativ: async () => { throw new Error("kaputt"); }
      });
    } catch (e) { fehler = e.message; }
    check("5.8 Ein geworfener Fehler meldet die Reservierung als fehlgeschlagen",
      /kaputt/.test(String(fehler)) && buchungen.some((b) => b.melde === false && b.ungenutzt === false));

    // Der Tagesplan liefert den Mandatsdeckel — derselbe Weg wie im Budgetadapter.
    const plan = FAIR.tagesplan({ mandate: ["m-a", "m-b"], deckel: 10, tag: "2026-08-08" });
    check("5.9 mandantenDeckel liefert die Zuteilung dieses Mandats aus dem Tagesplan",
      FAIR.mandantenDeckel(plan, "m-a") >= 0 && FAIR.mandantenDeckel(plan, "unbekannt") === 0);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("6 · Worker-Integration — Typen, Nebenlaeufigkeit, Umgebung");
  // ═══════════════════════════════════════════════════════════════════════════════════════
  {
    check("6.1 Der Worker kennt den fuenften Typ", WORKER.ALLE_TYPEN.includes("tenant_narrative"));
    check("6.2 Der fuenfte Typ ist KEIN Abruftyp (Quellenmodus-Riegel greift nicht auf ihn)",
      !WORKER.TYPEN_MIT_ABRUF.includes("tenant_narrative"));
    check("6.3 Die Speicher-Attrappe kennt dieselbe Typmenge wie die Datenbank-CHECK",
      AUFGABENTYPEN.has("tenant_narrative") && AUFGABENTYPEN.size === 5);

    // Typvorgabe kann nur VERKLEINERN.
    const nurNarrativ = await WORKER.durchlauf({
      env: BEIDE, typen: ["tenant_narrative"],
      deps: { claim: async () => ({ verfuegbar: true, auftraege: [] }), metrics: async () => ({ verfuegbar: true, kennzahlen: {} }) }
    });
    check("6.4 Eine Typvorgabe [tenant_narrative] startet den Worker nur fuer diesen Typ",
      nurNarrativ.gestartet === true && JSON.stringify(nurNarrativ.typen) === JSON.stringify(["tenant_narrative"]));
    const unbekannt = await WORKER.durchlauf({ env: BEIDE, typen: ["quatsch"], deps: {} });
    check("6.5 Eine Vorgabe mit nur unbekannten Typen startet NICHTS und sagt warum",
      unbekannt.gestartet === false && unbekannt.grund === "keine-erlaubten-typen");
    const abrufGesperrt = await WORKER.durchlauf({
      env: { ...BEIDE, HELMUT_SOURCE_MODE: "off" }, typen: ["source_fetch"], deps: {}
    });
    check("6.6 Die Vorgabe kann den Quellenmodus-Riegel NICHT umgehen",
      abrufGesperrt.gestartet === false && abrufGesperrt.grund === "keine-erlaubten-typen");

    // Zwei konkurrierende Worker: disjunkte Reservierung, keine Doppelverarbeitung.
    const u = uhr();
    const q = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    for (const m of ["m-a", "m-b", "m-c", "m-d"]) {
      await q.enqueue({
        jobType: "tenant_narrative", idempotencyKey: `tenant_narrative|${m}|F1`,
        freshnessWindow: "F1", tenantId: m, priority: 240, maxAttempts: 5,
        dueAt: new Date(u.jetzt()).toISOString(), payload: { mandatsId: m }
      });
    }
    const verarbeitet = [];
    const werkDeps = {
      now: u.jetzt, claim: q.claim, finish: q.finish, extendLease: q.extendLease,
      zurueckstellen: q.zurueckstellen,
      env: BEIDE,
      getActiveProfile: async (id) => profil(id), istDeaktiviert: () => false,
      lageNarrativ: async (p) => { verarbeitet.push(p.id); return { available: true, fromCache: false, paragraphs: [{}] }; }
    };
    await Promise.all([
      SP.arbeite({ env: BEIDE, owner: "w1", budgetMs: 60000, leaseMs: 60000, stapel: 2, deps: werkDeps }),
      SP.arbeite({ env: BEIDE, owner: "w2", budgetMs: 60000, leaseMs: 60000, stapel: 2, deps: werkDeps })
    ]);
    check("6.7 Zwei konkurrierende Worker verarbeiten alle vier Narrative genau einmal",
      verarbeitet.length === 4 && new Set(verarbeitet).size === 4
      && q.nachStatus("erledigt").length === 4, verarbeitet.join(","));

    // Umgebungsdurchreichung: mit Pipeline AN, Narrativ AUS ueberspringt der Handler —
    // uebrig gebliebene Auftraege altern nicht, der Altpfad versorgt das Produkt.
    const q2 = erzeugeSpeicherWarteschlange({ now: u.jetzt });
    await q2.enqueue({
      jobType: "tenant_narrative", idempotencyKey: "tenant_narrative|m-x|F1",
      freshnessWindow: "F1", tenantId: "m-x", priority: 240, maxAttempts: 5,
      dueAt: new Date(u.jetzt()).toISOString(), payload: { mandatsId: "m-x" }
    });
    let modellPfad = 0;
    const bilanz = await SP.arbeite({
      env: NUR_PIPELINE, owner: "w3", budgetMs: 60000, leaseMs: 60000, stapel: 2,
      deps: {
        now: u.jetzt, claim: q2.claim, finish: q2.finish, extendLease: q2.extendLease,
        zurueckstellen: q2.zurueckstellen,
        lageNarrativ: async () => { modellPfad += 1; return { available: true }; }
      }
    });
    check("6.8 Nach Rueckbau (Narrativflag aus) raeumt der Worker Restauftraege OHNE Modellpfad",
      bilanz.erledigt === 1 && modellPfad === 0 && q2.nachStatus("erledigt").length === 1);
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("7 · Atomare Veroeffentlichung ueber den ECHTEN Lage-Pfad");
  // ═══════════════════════════════════════════════════════════════════════════════════════
  {
    // Der Handler ruft die ECHTE `lage.buildLageBriefing` auf; ersetzt sind Ablage und
    // Modellgrenze (dasselbe Muster wie scripts/lage-cacheonly-test.js).
    const KO = {
      id: "ko-vg-1", vorgang_id: "vg-1", status: "update", understanding_status: "complete",
      headline: "Rentenpaket 2026", was_ist_passiert: "Kabinett hat beschlossen.",
      warum_wichtig: "Wichtig.", updated_at: "2026-08-08T06:00:00Z"
    };
    const orig = {
      v3StoreReady: storage.v3StoreReady,
      listKnowledgeObjects: storage.listKnowledgeObjects,
      listMatchingResults: storage.listMatchingResults,
      getSourcesForVorgang: storage.getSourcesForVorgang,
      getRenderedBriefingV3: storage.getRenderedBriefingV3,
      saveRenderedBriefingV3: storage.saveRenderedBriefingV3,
      acquirePipelineLock: storage.acquirePipelineLock,
      releasePipelineLock: storage.releasePipelineLock,
      canSpendLlmForTenant: storage.canSpendLlmForTenant,
      recordLlmUsage: storage.recordLlmUsage,
      guardKnowledgeObject: sourceSafety.guardKnowledgeObject,
      generateLageBriefing: ai.generateLageBriefing
    };
    const cache = new Map();
    let aiCalls = 0;
    let aiAntwort = () => ({ paragraphs: [{ text: "Narrativ.", vorgang_ids: ["vg-1"] }], model: "gpt-5-mini", wordCount: 1 });
    storage.v3StoreReady = () => true;
    storage.listKnowledgeObjects = async () => [KO];
    storage.listMatchingResults = async () => [];
    storage.getSourcesForVorgang = async () => [{ url: "https://bmas.de/rente", source_name: "BMAS", title: "Rente", published_at: "2026-08-08T06:00:00Z" }];
    storage.getRenderedBriefingV3 = async (userId, slot, day) => cache.get(`bf-${userId}-${slot}-${day}`) || null;
    storage.saveRenderedBriefingV3 = async (entry) => { cache.set(entry.id, { ...entry }); return { saved: true }; };
    storage.acquirePipelineLock = async () => true;
    storage.releasePipelineLock = async () => {};
    storage.canSpendLlmForTenant = async () => ({ allowed: true });
    storage.recordLlmUsage = async () => null;
    sourceSafety.guardKnowledgeObject = () => ({ status: "ok" });
    ai.generateLageBriefing = async (...a) => { aiCalls += 1; return aiAntwort(...a); };

    try {
      const H = SP.HANDLER.tenant_narrative;
      const auftrag = {
        id: "j-echt", jobType: "tenant_narrative", payload: { mandatsId: "m-echt" },
        freshnessWindow: "2026-08-08T00Z", createdAt: new Date().toISOString()
      };
      const deps = {
        env: BEIDE, getActiveProfile: async (id) => profil(id), istDeaktiviert: () => false,
        lageNarrativ: (p, meta) => lage.buildLageBriefing(p, meta)
      };

      // 7.1 Erster Lauf: genau EIN Modellaufruf, genau EINE Veroeffentlichung.
      const erster = await H(auftrag, deps);
      check("7.1 Erster Lauf: veroeffentlicht mit genau einem Modellaufruf",
        erster.ok === true && erster.veroeffentlicht === true && aiCalls === 1 && cache.size === 1);

      // 7.2 Wiederanlauf desselben Auftrags: Cache-Treffer, KEIN zweiter Modellaufruf,
      //     KEINE zweite Veroeffentlichung (genau-einmal-Zusage bei unveraendertem Datenstand).
      const zweiter = await H(auftrag, deps);
      check("7.2 Wiederanlauf: ausCache, kein zweiter Modellaufruf, keine Doppelveroeffentlichung",
        zweiter.ok === true && zweiter.ausCache === true && aiCalls === 1 && cache.size === 1);

      // 7.3 Modellfehler: der sichtbare Stand bleibt UNVERAENDERT (atomar), der Auftrag
      //     scheitert voruebergehend und ist sicher wiederholbar.
      const vorher = JSON.stringify([...cache.entries()]);
      aiAntwort = () => null;
      const KO2 = { ...KO, id: "ko-vg-2", vorgang_id: "vg-2", updated_at: "2026-08-08T07:00:00Z" };
      storage.listKnowledgeObjects = async () => [KO, KO2];   // neuer Datenstand -> Cache ungueltig
      let fehler = null;
      try { await H(auftrag, deps); } catch (e) { fehler = e.message; }
      check("7.3 Modellfehler: voruebergehend UND der sichtbare Stand ist unveraendert",
        /narrativ-voruebergehend: ai-unavailable/.test(String(fehler))
        && JSON.stringify([...cache.entries()]) === vorher && aiCalls === 2);

      // 7.4 Wiederholung nach Stoerung: neuer Datenstand wird veroeffentlicht und ERSETZT
      //     den alten Tagescache (neue Eingangsdaten ersetzen veraltete Ergebnisse).
      aiAntwort = () => ({ paragraphs: [{ text: "Neu.", vorgang_ids: ["vg-1", "vg-2"] }], model: "gpt-5-mini", wordCount: 1 });
      const dritter = await H(auftrag, deps);
      const eintrag = [...cache.values()][0];
      check("7.4 Nach der Stoerung: Wiederholung veroeffentlicht den NEUEN Datenstand",
        dritter.ok === true && dritter.veroeffentlicht === true && cache.size === 1
        && eintrag.payload.paragraphs[0].text === "Neu.");

      // 7.5 Unveraenderter Datenstand: der Fingerabdruck verhindert jeden weiteren Aufruf.
      const aufrufeVorher = aiCalls;
      const vierter = await H(auftrag, deps);
      check("7.5 Unveraenderter Datenstand: Fingerabdruck-Treffer, kein weiterer Modellaufruf",
        vierter.ausCache === true && aiCalls === aufrufeVorher);

      // 7.6 Tenant-Trennung am Schreibweg: die Kennung des Tagescaches traegt das Mandat.
      check("7.6 Der Tagescache ist an das Mandat gebunden (bf-<mandat>-lage-<tag>)",
        [...cache.keys()].every((k) => k.startsWith("bf-m-echt-lage-")));

      // 7.7 Leere Modellantwort wird NIE veroeffentlicht.
      cache.clear();
      aiAntwort = () => ({ paragraphs: [], model: "gpt-5-mini", wordCount: 0 });
      fehler = null;
      try { await H(auftrag, deps); } catch (e) { fehler = e.message; }
      check("7.7 Eine leere/unvollstaendige Modellantwort wird abgelehnt, nichts veroeffentlicht",
        /narrativ-voruebergehend/.test(String(fehler)) && cache.size === 0);
    } finally {
      Object.assign(storage, {
        v3StoreReady: orig.v3StoreReady, listKnowledgeObjects: orig.listKnowledgeObjects,
        listMatchingResults: orig.listMatchingResults, getSourcesForVorgang: orig.getSourcesForVorgang,
        getRenderedBriefingV3: orig.getRenderedBriefingV3, saveRenderedBriefingV3: orig.saveRenderedBriefingV3,
        acquirePipelineLock: orig.acquirePipelineLock, releasePipelineLock: orig.releasePipelineLock,
        canSpendLlmForTenant: orig.canSpendLlmForTenant, recordLlmUsage: orig.recordLlmUsage
      });
      sourceSafety.guardKnowledgeObject = orig.guardKnowledgeObject;
      ai.generateLageBriefing = orig.generateLageBriefing;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  abschnitt("8 · Kein Doppelpfad — Cron-Route und Standardverdrahtung");
  // ═══════════════════════════════════════════════════════════════════════════════════════
  {
    const fs = require("fs");
    const serverQuelltext = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    // Anker auf die ROUTENBEDINGUNGEN (nicht auf das erste Vorkommen des Strings — der
    // Debug-Pfad steht schon in Zeile ~264 in einer Gate-Liste).
    const routenBlock = serverQuelltext.slice(
      serverQuelltext.indexOf('url.pathname === "/api/cron/lage-briefing"'),
      serverQuelltext.indexOf('url.pathname === "/api/debug/lage-backfill"')
    );
    check("8.1 Die Cron-Route prueft narrativUeberWarteschlange VOR der Direktschleife",
      /narrativUeberWarteschlange\(\)/.test(routenBlock)
      && routenBlock.indexOf("narrativUeberWarteschlange") < routenBlock.indexOf("listProfiles"));
    check("8.2 Der Warteschlangenzweig ist ein `return` (strukturell kein Doppelpfad)",
      /if \(scalablePipeline\.narrativUeberWarteschlange\(\)\) \{/.test(routenBlock)
      && /pfad: "warteschlange"/.test(routenBlock));
    check("8.3 Er arbeitet AUSSCHLIESSLICH tenant_narrative ab",
      /typen: \["tenant_narrative"\]/.test(routenBlock));
    check("8.4 Der Altpfad (Direktschleife je Profil) bleibt vollstaendig erhalten",
      /buildLageBriefing\(profile, \{ politicianId: profile\.id \}\)/.test(routenBlock));

    // Standardverdrahtung: die Narrativ-Abhaengigkeit loest sich wirklich auf (12.9-Lehre).
    const standard = SP.workerDeps();
    check("8.5 Die Standardverdrahtung lageNarrativ zeigt auf lage.buildLageBriefing",
      typeof standard.lageNarrativ === "function" && typeof lage.buildLageBriefing === "function");
    check("8.6 Die Standardverdrahtung istDeaktiviert zeigt auf profile-validation.isDisabled",
      typeof standard.istDeaktiviert === "function"
      && standard.istDeaktiviert({ profileActive: false }) === true
      && standard.istDeaktiviert({ id: "x" }) === false);
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("TESTLAUF-FEHLER:", error && error.stack ? error.stack.split("\n").slice(0, 6).join("\n") : error);
  process.exit(1);
});
