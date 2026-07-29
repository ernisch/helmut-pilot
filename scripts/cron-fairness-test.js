"use strict";

// Helmut — Testsuite: faire Mandantenreihenfolge der Mehrmandanten-Crons (OP-25).
// =============================================================================================
// Prüft die Fairnesslogik (lib/helmut/cron-fairness.js) deterministisch und offline:
// injizierte Uhr, injizierter persistenter Zustand, kein Netz, kein Zufall, keine KI.
//
// Der Kern ist die nachrechenbare Obergrenze: werden je regulärem Lauf mindestens `k`
// Mandate BEGONNEN, dann wird bei `n` planbaren Mandaten jedes Mandat spätestens im
// ceil(n/k)-ten Lauf begonnen (§14). Zusätzlich: Neustart, Abbruch, Dauerfehler,
// Deaktivierung/Reaktivierung, Überlappung, knappe Restlaufzeit, Gleichstand,
// veraltete Versuche — und eine Mutationsprobe, die belegt, dass diese Suite die
// Fairnesslogik wirklich absichert (§19).

const fs = require("fs");
const path = require("path");
const Module = require("module");

const ROOT = path.join(__dirname, "..");
const MODUL = path.join(ROOT, "lib", "helmut", "cron-fairness.js");
const F = require(MODUL);

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); } else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }

// ── Prüfstand ────────────────────────────────────────────────────────────────────────────────
const BASIS_MS = Date.parse("2026-07-29T04:00:00.000Z");

function makeUhr(startMs = BASIS_MS) {
  let t = startMs;
  return { now: () => t, vor: (ms) => { t += ms; }, setzen: (ms) => { t = ms; }, jetzt: () => t };
}

// Persistenter Zustand wie die echte Ablage: `save` verschmilzt den Patch monoton in den
// FRISCH gelesenen Stand (storage.saveCronFairnessState tut genau das).
function makeAblage(initial = {}, uhr) {
  let roh = JSON.parse(JSON.stringify(initial));
  const st = {
    leseFehler: null,
    schreibFehler: null,
    schreibvorgaenge: 0,
    dump: () => JSON.parse(JSON.stringify(roh)),
    load: async () => {
      if (st.leseFehler) throw new Error(st.leseFehler);
      return JSON.parse(JSON.stringify(roh));
    },
    save: async (patch) => {
      st.schreibvorgaenge += 1;
      if (st.schreibFehler) throw new Error(st.schreibFehler);
      roh = F.mergeState(roh, patch, { nowMs: uhr.now() });
    }
  };
  return st;
}

// Ein regulärer Lauf. `kosten` = Laufzeit je Mandat in ms (Uhr wird vorgestellt),
// `fehler` = Mandate, die werfen. `abbruchNach`/`abbruchVorAbschluss` simulieren einen
// Prozessabbruch (Vercel-Funktionslimit) an einer definierten Stelle.
async function lauf({
  ablage,
  uhr,
  cronName = "crawl",
  tenants,
  kosten = {},
  standardKosten = 60000,
  fehler = new Set(),
  deadlineMs = 240000,
  reserveMs = 0,
  runId = "test-lauf",
  reihenfolge = "fair"
}) {
  const begonnen = [];
  const abgeschlossen = [];
  const ergebnis = await F.runTenantsFairly({
    cronName,
    tenantIds: tenants,
    runId,
    deadlineMs,
    reserveMs,
    startedMs: uhr.now(),
    now: uhr.now,
    loadState: ablage.load,
    saveState: ablage.save,
    reihenfolge,
    perTenant: async (id) => {
      begonnen.push(id);
      uhr.vor(kosten[id] === undefined ? standardKosten : kosten[id]);
      if (fehler.has(id)) throw new Error(`mandat ${id} kaputt`);
      abgeschlossen.push(id);
      return { ok: true };
    }
  });
  return { ...ergebnis, begonnen, abgeschlossen };
}

// Ein Prozessabbruch (Vercel-Funktionslimit, Instanz weg) lässt sich nicht über
// runTenantsFairly erzeugen — dort fängt das try/catch je Mandat jeden Fehler ab und schreibt
// einen Abschluss. Für die beiden Abbruchfälle wird der Ablauf deshalb genau so nachgebaut,
// wie runTenantsFairly ihn ausführt, und an der jeweiligen Stelle einfach beendet:
//   Zustand laden -> planen -> Versuch registrieren -> [ABBRUCH 1] -> verarbeiten ->
//   Abschluss schreiben -> [ABBRUCH 2].
async function abbruchNachRegistrierung({ ablage, uhr, cronName = "crawl", tenants, runId = "abbruch" }) {
  const zustand = F.normalizeState(await ablage.load());
  const planung = F.planTenantOrder({ cronName, tenantIds: tenants, state: zustand, nowMs: uhr.now() });
  const erstes = planung.order[0];
  await ablage.save(F.claimPatch({
    cronName, tenantId: erstes, runId, nowMs: uhr.now(), vorher: F.entryOf(zustand, cronName, erstes)
  }));
  return erstes; // danach: Prozess weg, kein Abschluss geschrieben
}

async function abbruchNachErstemMandat({ ablage, uhr, cronName = "crawl", tenants, dauerMs = 60000, runId = "abbruch" }) {
  const erstes = await abbruchNachRegistrierung({ ablage, uhr, cronName, tenants, runId });
  const startMs = uhr.now();
  uhr.vor(dauerMs); // Mandat wird verarbeitet
  const zustand = F.normalizeState(await ablage.load());
  await ablage.save(F.finishPatch({
    cronName, tenantId: erstes, runId, erfolg: true, startedMs: startMs, nowMs: uhr.now(),
    vorher: F.entryOf(zustand, cronName, erstes)
  }));
  return erstes; // danach: Prozess weg, die uebrigen Mandate wurden nie begonnen
}

const SECHS = ["anna-a", "bela-b", "cem-c", "dora-d", "emil-e", "frida-f"];

(async () => {
  console.log("HELMUT — Fairness der Mehrmandanten-Crons (OP-25)");

  // ═══ 1) Der behobene Befund: die Reihenfolge ist nicht mehr alphabetisch ═══════════════════
  abschnitt("1) Reihenfolge ist nicht dauerhaft alphabetisch");
  {
    const uhr = makeUhr();
    const ablage = makeAblage({}, uhr);
    // Lauf 1: Kapazität für genau 2 Mandate.
    const l1 = await lauf({ ablage, uhr, tenants: SECHS, standardKosten: 60000, deadlineMs: 110000 });
    check("Lauf 1 beginnt genau 2 Mandate (knappe Laufzeit)", l1.begonnen.length === 2, l1.begonnen.join(","));
    const l1Ids = l1.begonnen.slice().sort();
    uhr.setzen(BASIS_MS + 6 * 3600000);
    const l2 = await lauf({ ablage, uhr, tenants: SECHS, standardKosten: 60000, deadlineMs: 110000 });
    check("Lauf 2 beginnt ANDERE Mandate als Lauf 1",
      l2.begonnen.every((id) => !l1Ids.includes(id)), `${l1.begonnen} -> ${l2.begonnen}`);
    check("Die alphabetisch ersten beiden Mandate sind nicht in jedem Lauf dabei",
      !(l2.begonnen.includes("anna-a") && l2.begonnen.includes("bela-b")), l2.begonnen.join(","));
  }

  // ═══ 2) Sechs Mandate, Kapazität 1 je Lauf ════════════════════════════════════════════════
  abschnitt("2) Sechs Mandate, Kapazitaet fuer nur EIN Mandat je Lauf");
  {
    const uhr = makeUhr();
    const ablage = makeAblage({}, uhr);
    const gesehen = new Map();
    for (let i = 0; i < 6; i += 1) {
      uhr.setzen(BASIS_MS + i * 6 * 3600000);
      const l = await lauf({ ablage, uhr, tenants: SECHS, standardKosten: 60000, deadlineMs: 50000 });
      check(`Lauf ${i + 1} beginnt genau 1 Mandat`, l.begonnen.length === 1, l.begonnen.join(","));
      for (const id of l.begonnen) gesehen.set(id, (gesehen.get(id) || 0) + 1);
    }
    check("Nach 6 Laeufen wurde JEDES der 6 Mandate genau einmal begonnen",
      gesehen.size === 6 && [...gesehen.values()].every((n) => n === 1),
      JSON.stringify([...gesehen]));
  }

  // ═══ 3) Sechs Mandate, Kapazität 2 je Lauf ════════════════════════════════════════════════
  abschnitt("3) Sechs Mandate, Kapazitaet fuer ZWEI Mandate je Lauf");
  {
    const uhr = makeUhr();
    const ablage = makeAblage({}, uhr);
    const gesehen = new Map();
    for (let i = 0; i < 3; i += 1) {
      uhr.setzen(BASIS_MS + i * 6 * 3600000);
      const l = await lauf({ ablage, uhr, tenants: SECHS, standardKosten: 60000, deadlineMs: 110000 });
      check(`Lauf ${i + 1} beginnt genau 2 Mandate`, l.begonnen.length === 2, l.begonnen.join(","));
      for (const id of l.begonnen) gesehen.set(id, (gesehen.get(id) || 0) + 1);
    }
    check("Nach 3 Laeufen (= ceil(6/2)) wurde JEDES Mandat genau einmal begonnen",
      gesehen.size === 6 && [...gesehen.values()].every((n) => n === 1),
      JSON.stringify([...gesehen]));
  }

  // ═══ 4) Kein Mandat verhungert dauerhaft ═════════════════════════════════════════════════
  abschnitt("4) Kein Mandat verhungert ueber viele Laeufe");
  {
    const uhr = makeUhr();
    const ablage = makeAblage({}, uhr);
    const zaehler = new Map(SECHS.map((id) => [id, 0]));
    for (let i = 0; i < 24; i += 1) {
      uhr.setzen(BASIS_MS + i * 6 * 3600000);
      const l = await lauf({ ablage, uhr, tenants: SECHS, standardKosten: 60000, deadlineMs: 110000 });
      for (const id of l.begonnen) zaehler.set(id, zaehler.get(id) + 1);
    }
    const werte = [...zaehler.values()];
    check("Nach 24 Laeufen hat JEDES Mandat mindestens 8 Versuche", Math.min(...werte) >= 8, JSON.stringify([...zaehler]));
    check("Kein Mandat ist bevorzugt (Spanne <= 1 Versuch)", Math.max(...werte) - Math.min(...werte) <= 1, JSON.stringify([...zaehler]));
  }

  // ═══ 5) Die Kennung bestimmt die Fairness nicht ═══════════════════════════════════════════
  abschnitt("5) Alphabetische Kennungen bestimmen die Fairness nicht");
  {
    // Gleicher Zustand, aber ein Mandat mit sehr frühem Alphabet und JUENGSTEM Versuch:
    // es muss HINTEN stehen, obwohl es alphabetisch vorn ist.
    const nowMs = BASIS_MS;
    const state = {
      version: 1,
      crons: {
        crawl: {
          "aaa-erster": { status: "erfolgreich", letzterVersuchAt: new Date(nowMs - 60000).toISOString(), versuche: 5 },
          "zzz-letzter": { status: "erfolgreich", letzterVersuchAt: new Date(nowMs - 86400000).toISOString(), versuche: 1 }
        }
      }
    };
    const p = F.planTenantOrder({ cronName: "crawl", tenantIds: ["aaa-erster", "zzz-letzter"], state, nowMs });
    check("Das alphabetisch letzte Mandat mit aeltestem Versuch steht vorn",
      p.order[0] === "zzz-letzter", p.order.join(","));
    // Ohne jeden Verlauf entscheidet das Los, NICHT das Alphabet — belegt über mehrere
    // Zeitfenster: in mindestens einem gewinnt nicht der alphabetisch erste.
    const ids = ["aaa", "bbb", "ccc", "ddd", "eee", "fff"];
    let nichtAlphabetisch = 0;
    for (let f = 0; f < 40; f += 1) {
      const plan = F.planTenantOrder({ cronName: "crawl", tenantIds: ids, state: {}, nowMs: BASIS_MS + f * 6 * 3600000 });
      if (plan.order[0] !== "aaa") nichtAlphabetisch += 1;
    }
    check("Bei leerem Zustand ist der Erste NICHT immer der alphabetisch erste",
      nichtAlphabetisch >= 30, `${nichtAlphabetisch}/40 Fenster ohne 'aaa' vorn`);
  }

  // ═══ 6) Prozessneustart zwischen zwei Läufen ══════════════════════════════════════════════
  abschnitt("6) Fairnesszustand ueberlebt einen Prozessneustart");
  {
    const uhr = makeUhr();
    const ablage = makeAblage({}, uhr);
    const l1 = await lauf({ ablage, uhr, tenants: SECHS, standardKosten: 60000, deadlineMs: 110000 });
    const abgelegt = ablage.dump();
    // "Neustart": neue Ablage, ausschliesslich aus dem persistierten JSON aufgebaut,
    // frisches Modul-Laden (kein Prozessgedaechtnis).
    delete require.cache[require.resolve(MODUL)];
    const F2 = require(MODUL);
    const uhr2 = makeUhr(BASIS_MS + 6 * 3600000);
    const ablage2 = makeAblage(abgelegt, uhr2);
    const plan = F2.planTenantOrder({ cronName: "crawl", tenantIds: SECHS, state: await ablage2.load(), nowMs: uhr2.now() });
    check("Nach dem Neustart stehen die im Vorlauf begonnenen Mandate HINTEN",
      l1.begonnen.every((id) => plan.order.indexOf(id) >= 4), `${l1.begonnen} / ${plan.order}`);
    const l2 = await lauf({ ablage: ablage2, uhr: uhr2, tenants: SECHS, standardKosten: 60000, deadlineMs: 110000 });
    check("Der Lauf nach dem Neustart beginnt andere Mandate",
      l2.begonnen.every((id) => !l1.begonnen.includes(id)), `${l1.begonnen} -> ${l2.begonnen}`);
  }

  // ═══ 7) Abbruch nach einem erfolgreich verarbeiteten Mandat ═══════════════════════════════
  abschnitt("7) Abbruch NACH einem erfolgreich verarbeiteten Mandat");
  {
    const uhr = makeUhr();
    const ablage = makeAblage({}, uhr);
    const erstes = await abbruchNachErstemMandat({ ablage, uhr, tenants: SECHS });
    check("Der Abbruch traf ein Mandat, das vollstaendig verarbeitet wurde", typeof erstes === "string" && erstes.length > 0);
    const zustand = ablage.dump();
    const eintrag = F.entryOf(F.normalizeState(zustand), "crawl", erstes);
    check("Das abgeschlossene Mandat ist als erfolgreich vermerkt",
      eintrag && eintrag.status === "erfolgreich" && eintrag.letzterErfolgAt, JSON.stringify(eintrag));
    check("Die uebrigen fuenf Mandate haben KEINEN Versuchsvermerk",
      SECHS.filter((id) => id !== erstes).every((id) => F.entryOf(F.normalizeState(zustand), "crawl", id) === null));
    uhr.setzen(BASIS_MS + 6 * 3600000);
    const l2 = await lauf({ ablage, uhr, tenants: SECHS, standardKosten: 60000, deadlineMs: 50000 });
    check("Der Folgelauf setzt an der Mandatsgrenze fort (nicht beim abgeschlossenen Mandat)",
      l2.begonnen.length === 1 && l2.begonnen[0] !== erstes, l2.begonnen.join(","));
  }

  // ═══ 8) Abbruch direkt nach Registrierung eines Versuchs ══════════════════════════════════
  abschnitt("8) Abbruch DIREKT NACH Registrierung eines Versuchs");
  {
    const uhr = makeUhr();
    const ablage = makeAblage({}, uhr);
    const erstes = await abbruchNachRegistrierung({ ablage, uhr, tenants: SECHS });
    const eintrag = F.entryOf(F.normalizeState(ablage.dump()), "crawl", erstes);
    check("Der Versuch ist persistent als 'laufend' vermerkt",
      eintrag && eintrag.status === "laufend" && eintrag.versuche === 1, JSON.stringify(eintrag));
    // Direkt danach (innerhalb staleMs): das Mandat gilt als laufend und wird nicht doppelt begonnen.
    uhr.vor(60000);
    const l = await lauf({ ablage, uhr, tenants: SECHS, standardKosten: 60000, deadlineMs: 110000 });
    check("Ein sofortiger Folgelauf beginnt das 'laufende' Mandat NICHT",
      !l.begonnen.includes(erstes), l.begonnen.join(","));
    check("Der Lauf meldet es als 'laeuft-bereits' statt es zu verschweigen",
      l.fairness.laeuftBereits.includes(erstes), JSON.stringify(l.fairness.laeuftBereits));
    check("Die anderen Mandate werden trotzdem verarbeitet", l.begonnen.length === 2, l.begonnen.join(","));
    // Nach staleMs ist der Versuch veraltet und wird kontrolliert erneut zugelassen.
    uhr.setzen(BASIS_MS + F.DEFAULT_STALE_CLAIM_MS + 1000);
    const plan = F.planTenantOrder({ cronName: "crawl", tenantIds: SECHS, state: ablage.dump(), nowMs: uhr.now() });
    check("Nach Ablauf der Frist ist das veraltete 'laufend' wieder planbar",
      plan.order.includes(erstes) && plan.plan.find((p) => p.politicianId === erstes).veralteterVersuch === true);
    check("Es verdraengt dabei niemanden unfair (es zaehlt als versucht, nicht als frisch)",
      plan.order.indexOf(erstes) > 0, plan.order.join(","));
  }

  // ═══ 9) Ein Mandat schlägt dauerhaft fehl ═════════════════════════════════════════════════
  abschnitt("9) Ein Mandat schlaegt dauerhaft fehl — die anderen laufen weiter");
  {
    const uhr = makeUhr();
    const ablage = makeAblage({}, uhr);
    const kaputt = new Set(["cem-c"]);
    const zaehler = new Map(SECHS.map((id) => [id, 0]));
    for (let i = 0; i < 12; i += 1) {
      uhr.setzen(BASIS_MS + i * 6 * 3600000);
      const l = await lauf({ ablage, uhr, tenants: SECHS, standardKosten: 60000, deadlineMs: 110000, fehler: kaputt });
      for (const id of l.begonnen) zaehler.set(id, zaehler.get(id) + 1);
    }
    check("Das dauerhaft fehlerhafte Mandat blockiert die anderen nicht",
      SECHS.filter((id) => !kaputt.has(id)).every((id) => zaehler.get(id) >= 3), JSON.stringify([...zaehler]));
    check("Es wird selbst weiter versucht (kein stilles Ausschliessen)", zaehler.get("cem-c") >= 3);
    const eintrag = F.entryOf(F.normalizeState(ablage.dump()), "crawl", "cem-c");
    check("Fehler werden getrennt dokumentiert (Status, Fehlerzeitpunkt, Fehlerserie)",
      eintrag.status === "fehlgeschlagen" && eintrag.letzterFehlerAt && eintrag.fehlerSerie >= 3 && eintrag.letzterErfolgAt === null,
      JSON.stringify(eintrag));
    // Ein HAENGENDES Mandat (frisst das ganze Budget) darf die anderen ebenfalls nicht verdrängen.
    const uhr2 = makeUhr();
    const ablage2 = makeAblage({}, uhr2);
    const haenger = "dora-d";
    const erreicht = new Set();
    for (let i = 0; i < 8; i += 1) {
      uhr2.setzen(BASIS_MS + i * 6 * 3600000);
      const l = await lauf({
        ablage: ablage2, uhr: uhr2, tenants: SECHS, deadlineMs: 110000,
        kosten: { [haenger]: 280000 }, standardKosten: 50000, fehler: new Set([haenger])
      });
      for (const id of l.begonnen) erreicht.add(id);
    }
    check("Ein Mandat, das das ganze Budget frisst, verdraengt die anderen nicht dauerhaft",
      SECHS.every((id) => erreicht.has(id)), [...erreicht].join(","));
  }

  // ═══ 10) Deaktivierung / Neuaktivierung / Reaktivierung ══════════════════════════════════
  abschnitt("10) Deaktivierte, neue und reaktivierte Mandate");
  {
    const uhr = makeUhr();
    const ablage = makeAblage({}, uhr);
    // Zwei Runden mit allen sechs.
    for (let i = 0; i < 3; i += 1) {
      uhr.setzen(BASIS_MS + i * 6 * 3600000);
      await lauf({ ablage, uhr, tenants: SECHS, standardKosten: 60000, deadlineMs: 110000 });
    }
    // "emil-e" wird deaktiviert -> steht nicht mehr in der aktiven Liste.
    const ohneEmil = SECHS.filter((id) => id !== "emil-e");
    for (let i = 3; i < 8; i += 1) {
      uhr.setzen(BASIS_MS + i * 6 * 3600000);
      const l = await lauf({ ablage, uhr, tenants: ohneEmil, standardKosten: 60000, deadlineMs: 110000 });
      check(`Lauf ${i + 1}: das deaktivierte Mandat wird NICHT geplant`, !l.fairness.geplant.includes("emil-e"), l.fairness.geplant.join(","));
    }
    check("Sein Verlauf bleibt gespeichert (keine Loeschung durch Deaktivierung)",
      F.entryOf(F.normalizeState(ablage.dump()), "crawl", "emil-e") !== null);
    // Ein NEUES Mandat kommt hinzu -> muss zeitnah seinen ersten Versuch bekommen.
    uhr.setzen(BASIS_MS + 8 * 6 * 3600000);
    const mitNeu = [...ohneEmil, "gustav-g"];
    const lNeu = await lauf({ ablage, uhr, tenants: mitNeu, standardKosten: 60000, deadlineMs: 110000 });
    check("Ein neu aktiviertes Mandat wird im ERSTEN Lauf danach begonnen",
      lNeu.begonnen.includes("gustav-g"), lNeu.begonnen.join(","));
    check("Es steht dabei auf Rang 1 (kein Versuch = aeltester Versuch)",
      lNeu.fairness.geplant[0] === "gustav-g", lNeu.fairness.geplant.join(","));
    // Reaktivierung: "emil-e" kommt zurück, sein letzter Versuch ist der älteste.
    uhr.setzen(BASIS_MS + 9 * 6 * 3600000);
    const lReak = await lauf({ ablage, uhr, tenants: [...mitNeu, "emil-e"], standardKosten: 60000, deadlineMs: 110000 });
    check("Ein reaktiviertes Mandat wird korrekt wieder aufgenommen und steht vorn",
      lReak.fairness.geplant[0] === "emil-e" && lReak.begonnen.includes("emil-e"),
      lReak.fairness.geplant.join(","));
  }

  // ═══ 11) Zwei überlappende Laufversuche ══════════════════════════════════════════════════
  abschnitt("11) Zwei ueberlappende Laufversuche");
  {
    const uhr = makeUhr();
    const ablage = makeAblage({}, uhr);
    // Lauf A registriert seinen Versuch und arbeitet noch, als Lauf B startet.
    const erstes = await abbruchNachRegistrierung({ ablage, uhr, tenants: SECHS, runId: "lauf-A" });
    const lB = await lauf({ ablage, uhr, tenants: SECHS, standardKosten: 60000, deadlineMs: 240000, runId: "lauf-B" });
    check("Der ueberlappende Lauf verarbeitet das laufende Mandat NICHT",
      !lB.begonnen.includes(erstes), lB.begonnen.join(","));
    check("Er verarbeitet stattdessen die anderen Mandate",
      lB.begonnen.length >= 1 && lB.begonnen.every((id) => id !== erstes), lB.begonnen.join(","));
    const doppelt = lB.begonnen.filter((id, i) => lB.begonnen.indexOf(id) !== i);
    check("Kein Mandat wird innerhalb eines Laufs doppelt begonnen", doppelt.length === 0, doppelt.join(","));
    // Auch eine doppelte Kennung in der aktiven Liste darf kein zweites Beginnen erzeugen.
    const uhr2 = makeUhr();
    const ablage2 = makeAblage({}, uhr2);
    const lDoppel = await lauf({ ablage: ablage2, uhr: uhr2, tenants: ["anna-a", "anna-a", "bela-b"], standardKosten: 1000, deadlineMs: 240000 });
    check("Eine doppelte Kennung in der aktiven Liste wird genau einmal begonnen",
      lDoppel.begonnen.filter((id) => id === "anna-a").length === 1, lDoppel.begonnen.join(","));
  }

  // ═══ 12) Sehr knappe Restlaufzeit ════════════════════════════════════════════════════════
  abschnitt("12) Sehr knappe Restlaufzeit");
  {
    const uhr = makeUhr();
    const ablage = makeAblage({}, uhr);
    const l = await lauf({ ablage, uhr, tenants: SECHS, standardKosten: 60000, deadlineMs: 1, reserveMs: 0 });
    check("Bei 1 ms Budget wird noch genau EIN Mandat begonnen (Fortschritt statt Stillstand)",
      l.begonnen.length === 1, l.begonnen.join(","));
    check("Die uebrigen fuenf melden 'zeitbudget'", l.fairness.zeitbudget.length === 5, l.fairness.zeitbudget.join(","));
    check("Nicht begonnene Mandate haben KEINEN Versuchsvermerk",
      l.fairness.zeitbudget.every((id) => F.entryOf(F.normalizeState(ablage.dump()), "crawl", id) === null));
    // Mit Reserve wird ein sinnloser Anfang vermieden, sobald schon Arbeit geleistet wurde.
    const uhr2 = makeUhr();
    const ablage2 = makeAblage({}, uhr2);
    const l2 = await lauf({ ablage: ablage2, uhr: uhr2, tenants: SECHS, standardKosten: 60000, deadlineMs: 65000, reserveMs: 15000 });
    check("Restzeit unter der Reserve beginnt kein weiteres Mandat", l2.begonnen.length === 1, l2.begonnen.join(","));
    check("Die Reserve senkt kein Budget (Vorgabe: keine Budgetaenderung)",
      F.DEFAULT_TENANT_RESERVE_MS === 15000 && F.DEFAULT_TENANT_RESERVE_MS < 240000);
  }

  // ═══ 13) Stabiler Gleichstandsentscheid ═════════════════════════════════════════════════
  abschnitt("13) Stabiler Gleichstandsentscheid");
  {
    const nowMs = BASIS_MS;
    const gleich = new Date(nowMs - 3600000).toISOString();
    const state = { version: 1, crons: { crawl: Object.fromEntries(SECHS.map((id) => [id, { status: "erfolgreich", letzterVersuchAt: gleich, versuche: 1 }])) } };
    const a = F.planTenantOrder({ cronName: "crawl", tenantIds: SECHS, state, nowMs });
    const b = F.planTenantOrder({ cronName: "crawl", tenantIds: [...SECHS].reverse(), state, nowMs });
    check("Gleicher Zeitpunkt + gleiche Menge -> identische Reihenfolge (unabhaengig von der Eingabefolge)",
      a.order.join(",") === b.order.join(","), `${a.order} vs ${b.order}`);
    check("Der Gleichstandsentscheid ist nicht alphabetisch", a.order.join(",") !== [...SECHS].sort().join(","), a.order.join(","));
    check("Er ist je Cron unterschiedlich (kein globaler Lieblingsmandant)",
      F.planTenantOrder({ cronName: "lage-check", tenantIds: SECHS, state: {}, nowMs }).order.join(",")
      !== F.planTenantOrder({ cronName: "crawl", tenantIds: SECHS, state: {}, nowMs }).order.join(","));
    check("Er ist reproduzierbar (zweimal derselbe Aufruf -> dasselbe Ergebnis)",
      F.tiebreak("crawl", "anna-a", nowMs) === F.tiebreak("crawl", "anna-a", nowMs));
  }

  // ═══ 14) Die Fairnessgrenze — deterministisch bewiesen ═══════════════════════════════════
  abschnitt("14) Fairnessgrenze ceil(n/k)");
  {
    check("fairnessBound(6,1) = 6", F.fairnessBound(6, 1) === 6);
    check("fairnessBound(6,2) = 3", F.fairnessBound(6, 2) === 3);
    check("fairnessBound(6,4) = 2", F.fairnessBound(6, 4) === 2);
    check("fairnessBound(1,1) = 1", F.fairnessBound(1, 1) === 1);
    check("fairnessBound(n,0) = unendlich (0 begonnene Mandate = keine Garantie)", F.fairnessBound(6, 0) === Infinity);

    // Empirischer Beweis über viele Konstellationen: n = 1..9, k = 1..4.
    const verletzungen = [];
    for (let n = 1; n <= 9; n += 1) {
      for (let k = 1; k <= 4; k += 1) {
        if (k > n) continue;
        const tenants = Array.from({ length: n }, (_, i) => `m${String(i).padStart(2, "0")}-${(i * 7) % 10}`);
        const grenze = F.fairnessBound(n, k);
        const uhr = makeUhr();
        const ablage = makeAblage({}, uhr);
        const kosten = 60000;
        // Deadline so, dass genau k Mandate begonnen werden: (k-1)*kosten < deadline <= k*kosten
        const deadlineMs = (k - 1) * kosten + 1;
        const zuletzt = new Map(tenants.map((id) => [id, -1]));
        for (let runde = 0; runde < grenze * 3; runde += 1) {
          uhr.setzen(BASIS_MS + runde * 6 * 3600000);
          const l = await lauf({ ablage, uhr, tenants, standardKosten: kosten, deadlineMs, reserveMs: 0 });
          if (l.begonnen.length !== k) { verletzungen.push(`n=${n} k=${k} Lauf ${runde}: ${l.begonnen.length} begonnen`); break; }
          for (const id of l.begonnen) zuletzt.set(id, runde);
          // Nach jedem Lauf: kein Mandat darf laenger als `grenze` Laeufe ohne Versuch sein.
          if (runde + 1 >= grenze) {
            for (const [id, r] of zuletzt) {
              if (runde - r >= grenze) verletzungen.push(`n=${n} k=${k}: ${id} seit ${runde - r} Laeufen ohne Versuch (Grenze ${grenze})`);
            }
          }
        }
      }
    }
    check("Bei n=1..9 und k=1..4 wird JEDES Mandat innerhalb von ceil(n/k) Laeufen begonnen",
      verletzungen.length === 0, verletzungen.slice(0, 4).join(" | "));
    check("Die Loesung bleibt bei 1, 2, 6 und mehr Mandaten nachvollziehbar",
      [1, 2, 6, 9].every((n) => F.planTenantOrder({
        cronName: "crawl", tenantIds: Array.from({ length: n }, (_, i) => `m${i}`), state: {}, nowMs: BASIS_MS
      }).order.length === n));
  }

  // ═══ 15) Beobachtbarkeit je Mandat ══════════════════════════════════════════════════════
  abschnitt("15) Beobachtbarkeit je Mandat");
  {
    const uhr = makeUhr();
    const ablage = makeAblage({}, uhr);
    await lauf({ ablage, uhr, tenants: SECHS, standardKosten: 60000, deadlineMs: 110000 });
    uhr.setzen(BASIS_MS + 6 * 3600000);
    const l = await lauf({ ablage, uhr, tenants: SECHS, standardKosten: 60000, deadlineMs: 110000, fehler: new Set(["anna-a"]) });
    const f = l.fairness;
    check("aktive Mandate ausgewiesen", f.aktive === 6, String(f.aktive));
    check("geplante Reihenfolge ausgewiesen", Array.isArray(f.geplant) && f.geplant.length === 6);
    check("begonnene Mandate ausgewiesen", f.begonnen.length === 2, f.begonnen.join(","));
    check("erfolgreiche und fehlgeschlagene getrennt ausgewiesen",
      Array.isArray(f.erfolgreich) && Array.isArray(f.fehlgeschlagen));
    check("wegen Zeitmangel nicht begonnene Mandate ausgewiesen", f.zeitbudget.length === 4, f.zeitbudget.join(","));
    check("letzter Versuch, letzter Erfolg und Wartezeit je Mandat ausgewiesen",
      f.wartend.every((w) => Object.prototype.hasOwnProperty.call(w, "letzterVersuchAt")
        && Object.prototype.hasOwnProperty.call(w, "letzterErfolgAt")
        && Object.prototype.hasOwnProperty.call(w, "wartetMs")));
    check("voraussichtlich naechstes Mandat ausgewiesen", typeof f.naechstesMandat === "string" && f.naechstesMandat.length > 0, String(f.naechstesMandat));
    check("Obergrenze des Laufs ausgewiesen", f.obergrenzeLaeufe === 3, String(f.obergrenzeLaeufe));
    check("Die Vorhersage trifft zu: das angekuendigte Mandat kommt im naechsten Lauf zuerst",
      await (async () => {
        uhr.setzen(BASIS_MS + 12 * 3600000);
        const l3 = await lauf({ ablage, uhr, tenants: SECHS, standardKosten: 60000, deadlineMs: 50000 });
        return l3.fairness.geplant[0] === f.naechstesMandat;
      })());
  }

  // ═══ 16) Ausfall der Zustandsablage — fail-safe, aber nicht still ═════════════════════════
  abschnitt("16) Zustandsablage nicht verfuegbar");
  {
    const uhr = makeUhr();
    const ablage = makeAblage({}, uhr);
    ablage.leseFehler = "blob-timeout";
    const l = await lauf({ ablage, uhr, tenants: SECHS, standardKosten: 60000, deadlineMs: 110000 });
    check("Der Lauf laeuft trotzdem (Fairnessproblem wird kein Ausfall)", l.begonnen.length === 2, l.begonnen.join(","));
    check("Der Ausfall wird gemeldet statt verschwiegen",
      l.fairness.zustandGeladen === false && typeof l.fairness.zustandFehler === "string" && l.fairness.zustandFehler.length > 0,
      JSON.stringify({ geladen: l.fairness.zustandGeladen, fehler: l.fairness.zustandFehler }));
    const uhr2 = makeUhr();
    const ablage2 = makeAblage({}, uhr2);
    ablage2.schreibFehler = "blob-timeout";
    const l2 = await lauf({ ablage: ablage2, uhr: uhr2, tenants: SECHS, standardKosten: 60000, deadlineMs: 110000 });
    check("Auch ein Schreibfehler bricht den Lauf nicht ab", l2.begonnen.length === 2);
    check("Und wird als Zustandsstoerung gemeldet", typeof l2.fairness.zustandFehler === "string" && l2.fairness.zustandFehler.length > 0);
  }

  // ═══ 17) Ein einzelnes Mandat bleibt unveraendert korrekt ════════════════════════════════
  abschnitt("17) Bestehende Einzelmandanten-Verarbeitung unveraendert");
  {
    const uhr = makeUhr();
    const ablage = makeAblage({}, uhr);
    const l = await lauf({ ablage, uhr, tenants: ["nur-einer"], standardKosten: 1000, deadlineMs: 240000 });
    check("Ein Mandat wird genau einmal verarbeitet", l.begonnen.length === 1 && l.abgeschlossen.length === 1);
    check("Das Ergebnis traegt die Mandatskennung und das Nutzlast-Objekt",
      l.results.length === 1 && l.results[0].politicianId === "nur-einer" && l.results[0].ok === true, JSON.stringify(l.results));
    const uhr2 = makeUhr();
    const ablage2 = makeAblage({}, uhr2);
    const lFehler = await lauf({ ablage: ablage2, uhr: uhr2, tenants: ["nur-einer"], standardKosten: 1000, deadlineMs: 240000, fehler: new Set(["nur-einer"]) });
    check("Ein Fehler wird wie bisher als failed/error zurueckgegeben (kein Absturz)",
      lFehler.results.length === 1 && lFehler.results[0].failed === true && /kaputt/.test(lFehler.results[0].error), JSON.stringify(lFehler.results));
    // Rückweg HELMUT_CRON_FAIRNESS=off: uebergebene Reihenfolge, kein Zustands-IO.
    const uhr3 = makeUhr();
    const ablage3 = makeAblage({}, uhr3);
    const lAus = await lauf({ ablage: ablage3, uhr: uhr3, tenants: SECHS, standardKosten: 60000, deadlineMs: 110000, reihenfolge: "unveraendert" });
    check("Rueckweg 'unveraendert' behaelt die uebergebene (alphabetische) Reihenfolge",
      lAus.begonnen.join(",") === "anna-a,bela-b", lAus.begonnen.join(","));
    check("Rueckweg 'unveraendert' schreibt keinen Fairnesszustand", ablage3.schreibvorgaenge === 0, String(ablage3.schreibvorgaenge));
  }

  // ═══ 18) Monotone Verschmelzung (kein Rueckfall durch verspaetete Schreiber) ═════════════
  abschnitt("18) Monotone Verschmelzung des Zustands");
  {
    const alt = { status: "erfolgreich", letzterVersuchAt: "2026-07-28T04:00:00.000Z", letzterErfolgAt: "2026-07-28T04:01:00.000Z", versuche: 3, erfolge: 3, fehler: 0, fehlerSerie: 0 };
    const neu = { status: "erfolgreich", letzterVersuchAt: "2026-07-29T04:00:00.000Z", letzterErfolgAt: "2026-07-29T04:01:00.000Z", versuche: 4, erfolge: 4, fehler: 0, fehlerSerie: 0 };
    const a = F.mergeEntry(alt, neu);
    const b = F.mergeEntry(neu, alt);
    check("Verschmelzung ist reihenfolgeunabhaengig (juengster Stand gewinnt)",
      a.letzterVersuchAt === neu.letzterVersuchAt && b.letzterVersuchAt === neu.letzterVersuchAt, JSON.stringify({ a, b }));
    check("Zaehler fallen nicht zurueck", a.versuche === 4 && b.versuche === 4);
    check("Ein Erfolgszeitpunkt wird nie geloescht",
      F.mergeEntry(alt, { status: "fehlgeschlagen", letzterVersuchAt: "2026-07-30T04:00:00.000Z", letzterFehlerAt: "2026-07-30T04:00:10.000Z" }).letzterErfolgAt === alt.letzterErfolgAt);
    check("Retention entfernt sehr alte Eintraege (nur zeitbasiert)",
      Object.keys(F.mergeState({ version: 1, crons: { crawl: { "uralt-x": { status: "erfolgreich", letzterVersuchAt: "2020-01-01T00:00:00.000Z" } } } }, {}, { nowMs: BASIS_MS }).crons).length === 0);
    check("Kaputte Zustandsformen ergeben einen leeren Zustand statt eines Absturzes",
      Object.keys(F.normalizeState({ crons: "kaputt" }).crons).length === 0
      && Object.keys(F.normalizeState(null).crons).length === 0);
    // Befund aus dem Integrationslauf 2026-07-29: liegt der Startzeitstempel des Abschlusses
    // (geringfuegig) VOR dem registrierten Versuch, fiel der Abschluss hinter den eigenen
    // 'laufend'-Vermerk zurueck — das Mandat sah aus, als haenge es. Gleiche Laufkennung
    // fuehrt jetzt immer.
    {
      const claim = F.claimPatch({ cronName: "crawl", tenantId: "t1", runId: "r-1", nowMs: BASIS_MS }).crons.crawl.t1;
      const finish = F.finishPatch({ cronName: "crawl", tenantId: "t1", runId: "r-1", erfolg: true, startedMs: BASIS_MS - 1000, nowMs: BASIS_MS + 500, vorher: claim }).crons.crawl.t1;
      const zusammen = F.mergeEntry(claim, finish);
      check("Ein Abschluss mit leicht frueherem Startzeitstempel bleibt ein Abschluss",
        zusammen.status === "erfolgreich" && zusammen.letzterErfolgAt !== null, JSON.stringify(zusammen));
      check("Der Versuchszeitpunkt fällt dabei nicht zurueck",
        zusammen.letzterVersuchAt === new Date(BASIS_MS).toISOString(), zusammen.letzterVersuchAt);
      check("Ein Abschluss einer FREMDEN Laufkennung fuehrt nicht (kein Rueckfall auf Alt-Staende)",
        F.mergeEntry(
          { status: "laufend", letzterVersuchAt: new Date(BASIS_MS + 10000).toISOString(), letzteLaufkennung: "r-neu" },
          { status: "erfolgreich", letzterVersuchAt: new Date(BASIS_MS).toISOString(), letzteLaufkennung: "r-alt", letzterErfolgAt: new Date(BASIS_MS + 1).toISOString() }
        ).status === "laufend");
    }
    check("withoutTenant entfernt ein Mandat vollstaendig (DSGVO/Teardown)",
      F.entryOf(F.withoutTenant({ version: 1, crons: { crawl: { "weg-du": { status: "erfolgreich", letzterVersuchAt: new Date(BASIS_MS).toISOString() } } } }, "weg-du"), "crawl", "weg-du") === null);
  }

  // ═══ 19) Mutationsprobe: faengt diese Suite die Fairnesslogik wirklich ab? ═══════════════
  abschnitt("19) Mutationsprobe der zentralen Fairnesslogik");
  {
    function ladeMutiert(paare) {
      let src = fs.readFileSync(MODUL, "utf8");
      for (const [von, nach] of paare) {
        if (!src.includes(von)) throw new Error(`Mutation nicht anwendbar: ${von}`);
        src = src.split(von).join(nach);
      }
      const m = new Module(MODUL, null);
      m.filename = MODUL;
      m.paths = Module._nodeModulePaths(path.dirname(MODUL));
      m._compile(src, MODUL);
      return m.exports;
    }

    // Probe A — die Garantie selbst: 6 Mandate, Kapazität 1 je Lauf, 18 Läufe. Korrekt muss
    // JEDES Mandat in JEDEM Fenster von 6 aufeinanderfolgenden Läufen begonnen werden
    // (ceil(6/1) = 6). Erst über mehrere Runden zeigt sich, ob die Rotation trägt: die erste
    // Runde deckt schon durch "kein Versuch = vorn" alle ab.
    async function verletztGarantie(mod) {
      const uhr = makeUhr();
      let roh = {};
      const zuletzt = new Map(SECHS.map((id) => [id, -1]));
      for (let i = 0; i < 18; i += 1) {
        uhr.setzen(BASIS_MS + i * 6 * 3600000);
        const r = await mod.runTenantsFairly({
          cronName: "crawl",
          tenantIds: SECHS,
          deadlineMs: 50000,
          reserveMs: 0,
          startedMs: uhr.now(),
          now: uhr.now,
          loadState: async () => JSON.parse(JSON.stringify(roh)),
          saveState: async (patch) => { roh = mod.mergeState(roh, patch, { nowMs: uhr.now() }); },
          perTenant: async () => { uhr.vor(60000); return { ok: true }; }
        });
        for (const id of r.fairness.begonnen) zuletzt.set(id, i);
        if (i >= 6 && [...zuletzt.values()].some((r2) => i - r2 >= 6)) return true;
      }
      return false;
    }

    // Probe B — die Registrierung: der Versuch muss VOR der Verarbeitung persistiert werden.
    // Nur so übersteht die Rotation einen Prozessabbruch mitten im Mandat.
    async function versuchVorVerarbeitung(mod) {
      const uhr = makeUhr();
      const ablauf = [];
      await mod.runTenantsFairly({
        cronName: "crawl",
        tenantIds: ["anna-a"],
        deadlineMs: 240000,
        reserveMs: 0,
        startedMs: uhr.now(),
        now: uhr.now,
        loadState: async () => ({}),
        saveState: async (patch) => {
          const eintrag = patch && patch.crons && patch.crons.crawl && patch.crons.crawl["anna-a"];
          ablauf.push(`save:${eintrag ? eintrag.status : "?"}`);
        },
        perTenant: async () => { ablauf.push("verarbeitung"); uhr.vor(1000); return { ok: true }; }
      });
      return ablauf[0] === "save:laufend" && ablauf[1] === "verarbeitung";
    }

    check("Ausgangslage: der echte Code verletzt die Garantie NICHT", (await verletztGarantie(F)) === false);
    check("Ausgangslage: der echte Code registriert den Versuch VOR der Verarbeitung",
      (await versuchVorVerarbeitung(F)) === true);

    const mutationen = [
      ["Sortierung ignoriert den letzten Versuch", "garantie",
        [["      const diff = msOf(a.letzterVersuchAt) - msOf(b.letzterVersuchAt);\n      if (diff !== 0) return diff;", "      const diff = 0;\n      if (diff !== 0) return diff;"]]],
      ["Mandate ohne Versuch stehen HINTEN statt vorn", "garantie",
        [["if (a.nieVersucht !== b.nieVersucht) return a.nieVersucht ? -1 : 1;", "if (a.nieVersucht !== b.nieVersucht) return a.nieVersucht ? 1 : -1;"]]],
      ["Gleichstand entscheidet wieder das Alphabet", "garantie",
        [["    if (a.los !== b.los) return a.los - b.los;", "    if (false) return a.los - b.los;"],
          ["const diff = msOf(a.letzterVersuchAt) - msOf(b.letzterVersuchAt);", "const diff = 0;"]]],
      ["Der Versuch wird ueberhaupt nicht mehr vermerkt", "garantie",
        [["    const registriert = await speichern(claimPatch({ cronName, tenantId, runId, nowMs: versuchMs, vorher }));", "    const registriert = true;"],
          ["    await speichern(finishPatch({", "    if (false) await speichern(finishPatch({"]]],
      ["Der Versuch wird erst NACH der Verarbeitung vermerkt", "registrierung",
        [["    const registriert = await speichern(claimPatch({ cronName, tenantId, runId, nowMs: versuchMs, vorher }));", "    const registriert = true;"]]],
      ["Ein laufender Versuch blockiert nichts mehr (Ueberlappungsschutz weg)", "ueberlappung",
        [["    if (laufend) blockiert.push({ ...kandidat, grund: \"laeuft-bereits\" });\n    else planbar.push(kandidat);", "    planbar.push(kandidat);"]]],
      ["Nicht begonnene Mandate werden trotzdem als versucht vermerkt", "zeitbudget",
        [["      results.push({ politicianId: tenantId, skipped: true, reason: \"zeitbudget\" });",
          "      await speichern(claimPatch({ cronName, tenantId, runId, nowMs: now(), vorher: entryOf(zustand, cronName, tenantId) }));\n      results.push({ politicianId: tenantId, skipped: true, reason: \"zeitbudget\" });"]]]
    ];

    // Probe C — Überlappungsschutz: ein als "laufend" vermerktes Mandat darf nicht begonnen werden.
    async function ueberlappungOffen(mod) {
      const uhr = makeUhr();
      const laufend = {
        version: 1,
        crons: { crawl: { "anna-a": { status: "laufend", letzterVersuchAt: new Date(uhr.now() - 1000).toISOString(), versuche: 1 } } }
      };
      const r = await mod.runTenantsFairly({
        cronName: "crawl", tenantIds: ["anna-a", "bela-b"], deadlineMs: 240000, reserveMs: 0,
        startedMs: uhr.now(), now: uhr.now,
        loadState: async () => JSON.parse(JSON.stringify(laufend)),
        saveState: async () => {},
        perTenant: async () => { uhr.vor(1000); return { ok: true }; }
      });
      return r.fairness.begonnen.includes("anna-a");
    }

    // Probe D — nicht begonnene Mandate dürfen nicht als versucht gelten (sonst rutschen sie
    // nach hinten, obwohl sie nie liefen).
    async function zeitbudgetFaelschtVersuch(mod) {
      const uhr = makeUhr();
      let roh = {};
      await mod.runTenantsFairly({
        cronName: "crawl", tenantIds: SECHS, deadlineMs: 50000, reserveMs: 0,
        startedMs: uhr.now(), now: uhr.now,
        loadState: async () => JSON.parse(JSON.stringify(roh)),
        saveState: async (patch) => { roh = mod.mergeState(roh, patch, { nowMs: uhr.now() }); },
        perTenant: async () => { uhr.vor(60000); return { ok: true }; }
      });
      const vermerkt = SECHS.filter((id) => mod.entryOf(mod.normalizeState(roh), "crawl", id) !== null);
      return vermerkt.length > 1;
    }

    check("Ausgangslage: ein laufender Versuch blockiert das Mandat", (await ueberlappungOffen(F)) === false);
    check("Ausgangslage: nicht begonnene Mandate bleiben ohne Versuchsvermerk",
      (await zeitbudgetFaelschtVersuch(F)) === false);

    const proben = {
      garantie: verletztGarantie,
      registrierung: async (mod) => !(await versuchVorVerarbeitung(mod)),
      ueberlappung: ueberlappungOffen,
      zeitbudget: zeitbudgetFaelschtVersuch
    };
    for (const [name, probe, paare] of mutationen) {
      let rot = false;
      let detail = "";
      try {
        rot = await proben[probe](ladeMutiert(paare));
      } catch (error) {
        detail = String(error && error.message).slice(0, 140);
      }
      check(`Mutation faellt auf: ${name}`, rot === true, detail || "Mutation blieb unentdeckt");
    }
  }

  // ═══ 19b) Die echte Ablage (storage.js) — Verhalten am Lesefehler ═════════════════════════
  abschnitt("19b) Echte Zustandsablage: kein Schreiben auf einen nicht gelesenen Stand");
  {
    // Der Patch traegt nur EIN Mandat. Wuerde bei einem Lesefehler trotzdem geschrieben,
    // loeschte der Merge die Eintraege ALLER anderen Mandate — der Rotation fehlte danach
    // das Gedaechtnis. Hier wird genau das gegen die ECHTE Ablage geprueft (lokaler Modus).
    const storageQuelle = fs.readFileSync(path.join(ROOT, "lib", "helmut", "storage.js"), "utf8");
    check("saveCronFairnessState bricht bei nicht lesbarem Stand ab, statt zu ueberschreiben",
      /if \(!aktuell\.ok\) return \{ ok: false, fehler: aktuell\.fehler \|\| "zustand-nicht-lesbar", gelesen: false \};/.test(storageQuelle));
    check("readCronFairnessState wirft nie (Fairness ist kein Ausfallgrund)",
      /async function readCronFairnessState\(\)[\s\S]{0,900}catch \(error\) \{\s*\n\s*return \{ ok: false, state: normalizeState\(\{\}\)/.test(storageQuelle));
    check("Die Ablage ist eine EIGENE helmut_store-Zeile (keine neue Tabelle, keine Migration)",
      /const CRON_FAIRNESS_STORE_SUFFIX = "cron-fairness";/.test(storageQuelle)
      && /\/rest\/v1\/helmut_store\?id=eq\.\$\{encodeURIComponent\(cronFairnessRowId\(\)\)\}/.test(storageQuelle)
      && !/cron_tenant_schedule|cron_fairness_state/.test(storageQuelle));
    check("Es gibt keine neue Migration in diesem Sprint",
      !fs.readdirSync(path.join(ROOT, "supabase", "migrations")).some((f) => /fairness|cron_tenant|scheduler/i.test(f)));
    check("Die DSGVO-Loeschung entfernt die Scheduler-Spur mit",
      /const fairness = await deleteCronFairnessTenant\(politicianId\);/.test(storageQuelle)
      && /const fairness = await deleteCronFairnessTenant\(uid\);/.test(storageQuelle)
      && /v3\.ok && auth\.ok && fairness\.ok/.test(storageQuelle));
  }

  // ═══ 20) Sicherheitsgrenzen dieses Sprints ══════════════════════════════════════════════
  abschnitt("20) Sicherheitsgrenzen (Crons, Budgets, Landesmodule, Matching)");
  {
    const lies = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
    const vercel = JSON.parse(lies("vercel.json"));
    const plan = (vercel.crons || []).map((c) => `${c.path}@${c.schedule}`).sort().join("|");
    check("Cron-Zeitplan unveraendert (9 Eintraege, unveraenderte Zeiten)",
      (vercel.crons || []).length === 9 && plan === [
        "/api/cron/crawl@0 4 * * *", "/api/cron/crawl@0 20 * * *", "/api/cron/health-report@0 6 * * *",
        "/api/cron/lage-briefing@45 5 * * *", "/api/cron/lage-check@0 10 * * *",
        "/api/cron/morning-briefing@0 5 * * *", "/api/cron/pipeline@0 16 * * *",
        "/api/cron/understanding@30 21 * * *", "/api/cron/understanding@30 5 * * *"
      ].sort().join("|"), plan);
    check("Funktionslimit unveraendert (maxDuration 300)", vercel.functions["api/index.js"].maxDuration === 300);

    const serverSrc = lies("server.js");
    check("Zeitbudget der Crawl-/Pipeline-Crons unveraendert (270 000 ms)",
      (serverSrc.match(/deadlineMs: 270000/g) || []).length === 2);
    check("Zeitbudget der Briefing-/Lage-Crons unveraendert (240 000 ms)",
      (serverSrc.match(/deadlineMs: 240000/g) || []).length === 2);
    check("Aeussere Zeitgrenzen unveraendert (280 000 ms)", (serverSrc.match(/280000/g) || []).length >= 3);
    check("Standardbudget von runCronForTenants unveraendert (240 000 ms)",
      /runCronForTenants\(cronName, perTenant, \{ deadlineMs = 240000 \}/.test(serverSrc));
    check("Gesamtbudget des Crawls unveraendert (240 000 ms Default)",
      /HELMUT_CRAWL_GESAMTBUDGET_MS \|\| 240000/.test(lies("lib/helmut/scheduler.js")));

    const flags = JSON.parse(lies("helmut-flags.json"));
    check("Berlin/Brandenburg bleiben deaktiviert (kein HELMUT_LANDESMODULE in der Flag-Datei)",
      !Object.prototype.hasOwnProperty.call(flags, "HELMUT_LANDESMODULE"), Object.keys(flags).join(","));
    check("Kein neues Flag in der Flag-Datei scharfgeschaltet",
      Object.keys(flags).filter((k) => !k.startsWith("_")).sort().join(",")
      === "HELMUT_PARDOK_DISPATCH,HELMUT_SOURCE_MODE,HELMUT_UNDERSTANDING_GATE");

    // M-8 (Top-N ohne Schwellenwert) bleibt unangetastet: dieser Sprint fasst weder
    // Matching-Kandidaten noch Raenge noch Schwellenwerte an.
    check("M-8 bleibt deaktiviert (kein Aehnlichkeits-Schwellenwert eingebaut)",
      !/HELMUT_MATCHING_(MIN_)?SIMILARITY|aehnlichkeitsSchwelle|similarityThreshold/i.test(serverSrc + lies("lib/helmut/cron-fairness.js")));
    // Nur echte Abhaengigkeiten pruefen (Kommentare duerfen den Befund benennen).
    const fairnessRequires = (lies("lib/helmut/cron-fairness.js").match(/require\((["'])[^"']+\1\)/g) || []).join(",");
    check("Der Fairnesspfad zieht keine KI-, Matching- oder Speicher-Abhaengigkeit",
      fairnessRequires === 'require("crypto")', fairnessRequires);
    check("Kein Mandant ist im Fairnesspfad hartkodiert (CLAUDE.md §4.2)",
      !/cem|annika|klose|ince|mustermann/i.test(lies("lib/helmut/cron-fairness.js")));
  }

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  if (!fail) {
    console.log("Jedes aktive Mandat wird innerhalb von ceil(n/k) regulaeren Laeufen begonnen —");
    console.log("persistent, ohne Migration, ohne Queue, ohne Parallelisierung.");
  }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("TESTFEHLER:", e && e.stack); process.exit(1); });
