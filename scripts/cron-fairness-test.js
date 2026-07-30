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

  // ═══ 12b) Lauf OHNE Kapazität (k = 0) — keine Fortschrittsgarantie ════════════════════════
  abschnitt("12b) k = 0: Lauf ohne Fortschritt");
  {
    // Realistischer Auslöser: der Lauf betritt die Schleife mit weniger Restlaufzeit als
    // die Reserve (z. B. weil das Laden der Mandantenliste in Blob-Timeouts lief). Dann
    // wird KEIN Mandat begonnen — und für diesen Lauf gibt es keine Garantie.
    const uhr = makeUhr();
    const ablage = makeAblage({}, uhr);
    const l = await lauf({ ablage, uhr, tenants: SECHS, standardKosten: 60000, deadlineMs: 10000, reserveMs: 15000 });
    check("Kein Mandat wird begonnen", l.begonnen.length === 0, l.begonnen.join(","));
    check("Der Lauf weist Kapazitaet 0 aus", l.fairness.kapazitaet === 0, String(l.fairness.kapazitaet));
    check("Der Lauf weist AUSDRUECKLICH keine Fortschrittsgarantie aus",
      l.fairness.fortschrittsgarantie === false && l.fairness.ohneFortschritt === true,
      JSON.stringify({ g: l.fairness.fortschrittsgarantie, o: l.fairness.ohneFortschritt }));
    check("Die Obergrenze ist null statt einer erfundenen Zahl (JSON-ehrlich)",
      l.fairness.obergrenzeLaeufe === null, String(l.fairness.obergrenzeLaeufe));
    check("fairnessBound(n,0) ist unendlich — die Formel behauptet keine Grenze", F.fairnessBound(6, 0) === Infinity);
    check("Alle sechs Mandate melden 'zeitbudget'", l.fairness.zeitbudget.length === 6, l.fairness.zeitbudget.join(","));
    check("KEIN Mandat wird als versucht vermerkt", ablage.schreibvorgaenge === 0, String(ablage.schreibvorgaenge));
    check("Der Zustand bleibt unveraendert (leer)", Object.keys(F.normalizeState(ablage.dump()).crons).length === 0);
    // Entscheidend: ein k=0-Lauf darf die Warteschlange NICHT verschieben — der nächste
    // Lauf mit Kapazität beginnt genau dort, wo dieser Lauf beginnen wollte.
    // Im SELBEN Zeitfenster geprueft (der Losentscheid je 6-h-Fenster ist sonst ein
    // anderer): der Folgelauf beginnt genau dort, wo dieser Lauf beginnen wollte.
    const geplantVorher = l.fairness.geplant.slice(0, 2);
    uhr.vor(60000);
    const l2 = await lauf({ ablage, uhr, tenants: SECHS, standardKosten: 60000, deadlineMs: 110000 });
    check("Der Folgelauf holt genau die Mandate nach, die vorn standen",
      l2.begonnen.slice().sort().join(",") === geplantVorher.slice().sort().join(","),
      `${geplantVorher} -> ${l2.begonnen}`);
    // Und bei 0 aktiven Mandaten ist ein Lauf ohne Begonnene KEIN Fehlerfall.
    const leer = await lauf({ ablage, uhr, tenants: [], deadlineMs: 240000 });
    check("0 aktive Mandate sind kein 'ohneFortschritt' (nichts zu tun ist kein Rueckstand)",
      leer.fairness.ohneFortschritt === false && leer.fairness.obergrenzeLaeufe === 0,
      JSON.stringify({ o: leer.fairness.ohneFortschritt, g: leer.fairness.obergrenzeLaeufe }));
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

  // ═══ 18b) Ueberlappende Laeufe: fremder Halter, korrupte und alte Zustaende ════════════════
  abschnitt("18b) Fremder Halter, korrupte Eintraege, Schemaversion");
  {
    const nowMs = BASIS_MS;
    const laufend = (runId, alterMs) => ({
      version: 1,
      crons: { crawl: { "anna-a": { status: "laufend", letzterVersuchAt: new Date(nowMs - alterMs).toISOString(), letzteLaufkennung: runId, versuche: 1 } } }
    });
    check("Ein FRISCHER fremder Versuch wird als fremder Halter erkannt",
      F.fremderHalter(laufend("lauf-A", 5000), "crawl", "anna-a", "lauf-B", nowMs) === "lauf-A");
    check("Der EIGENE Versuch ist kein fremder Halter",
      F.fremderHalter(laufend("lauf-B", 5000), "crawl", "anna-a", "lauf-B", nowMs) === null);
    check("Ein VERALTETER fremder Versuch blockiert nicht mehr",
      F.fremderHalter(laufend("lauf-A", F.DEFAULT_STALE_CLAIM_MS + 1000), "crawl", "anna-a", "lauf-B", nowMs) === null);
    check("Ein abgeschlossener Versuch ist kein Halter",
      F.fremderHalter({ version: 1, crons: { crawl: { "anna-a": { status: "erfolgreich", letzterVersuchAt: new Date(nowMs - 1000).toISOString(), letzteLaufkennung: "lauf-A" } } } },
        "crawl", "anna-a", "lauf-B", nowMs) === null);

    // Registriert ein ueberlappender Lauf DAZWISCHEN, gibt die Ablage den Fernstand
    // zurueck — dieser Lauf verarbeitet das Mandat dann NICHT.
    {
      const uhr = makeUhr();
      let raw = {};
      const begonnen = [];
      const r = await F.runTenantsFairly({
        cronName: "crawl", tenantIds: ["anna-a", "bela-b"], runId: "lauf-B",
        deadlineMs: 240000, reserveMs: 0, startedMs: uhr.now(), now: uhr.now,
        loadState: async () => JSON.parse(JSON.stringify(raw)),
        saveState: async (patch, { pruefen = false } = {}) => {
          raw = F.mergeState(raw, patch, { nowMs: uhr.now() });
          // Wettlauf: genau beim Registrieren von 'anna-a' war ein anderer Lauf schneller.
          if (pruefen && patch.crons.crawl && patch.crons.crawl["anna-a"]) {
            raw = F.mergeState(raw, {
              version: 1,
              crons: { crawl: { "anna-a": { status: "laufend", letzterVersuchAt: new Date(uhr.now() + 1).toISOString(), letzteLaufkennung: "lauf-A", versuche: 2 } } }
            }, { nowMs: uhr.now() });
          }
          return { ok: true, state: JSON.parse(JSON.stringify(raw)) };
        },
        perTenant: async (id) => { begonnen.push(id); uhr.vor(1000); return { ok: true }; }
      });
      check("Verliert dieser Lauf den Wettlauf, verarbeitet er das Mandat NICHT",
        !begonnen.includes("anna-a"), begonnen.join(","));
      check("Er meldet es als 'laeuft-bereits'", r.fairness.laeuftBereits.includes("anna-a"), JSON.stringify(r.fairness.laeuftBereits));
      check("Und verarbeitet die uebrigen Mandate trotzdem", begonnen.includes("bela-b"), begonnen.join(","));
      check("Es zaehlt nicht als begonnen (Kapazitaet bleibt ehrlich)",
        r.fairness.begonnen.join(",") === "bela-b", r.fairness.begonnen.join(","));
    }

    // Korrupte Eintraege duerfen die uebrigen Mandate nicht blockieren.
    {
      const kaputt = {
        version: 1,
        crons: {
          crawl: {
            "anna-a": "das ist kein objekt",
            "bela-b": null,
            "cem-c": { status: "voelliger-unsinn", letzterVersuchAt: "kein datum", versuche: -7, erfolge: "viele", fehlerSerie: {} },
            "dora-d": { status: "erfolgreich", letzterVersuchAt: new Date(nowMs - 1000).toISOString(), versuche: 3 }
          },
          "kaputter-cron": "auch kein objekt"
        }
      };
      const p = F.planTenantOrder({ cronName: "crawl", tenantIds: SECHS, state: kaputt, nowMs });
      check("Ein korrupter Eintrag blockiert die anderen Mandate nicht (alle 6 geplant)",
        p.order.length === 6, p.order.join(","));
      check("Das Mandat mit dem juengsten gueltigen Versuch steht HINTEN",
        p.order[p.order.length - 1] === "dora-d", p.order.join(","));
      check("Korrupte Werte werden gesaeubert statt uebernommen",
        F.normalizeEntry({ status: "unsinn", versuche: -7, erfolge: "viele", fehlerSerie: {}, letzterVersuchAt: "kein datum" }).status === null
        && F.normalizeEntry({ versuche: -7 }).versuche === 0
        && F.normalizeEntry({ erfolge: "viele" }).erfolge === 0);
      check("Ein kaputter Cron-Block macht den Zustand nicht unbrauchbar",
        Object.keys(F.normalizeState(kaputt).crons).includes("crawl"));
      check("Unbekannte Felder werden nicht durchgereicht (Weissliste)",
        F.normalizeEntry({ status: "erfolgreich", fremdesFeld: "x" }).fremdesFeld === undefined);
    }

    // Schemaversion: eine NEUERE Ablageform darf ein alter Codestand nicht zurueckdrehen.
    check("stateVersion liest die Ablageform (null bei Altbestand)",
      F.stateVersion({ version: 2 }) === 2 && F.stateVersion({}) === null && F.stateVersion(null) === null);
    check("Verschmelzen behaelt die HOEHERE Version",
      F.mergeState({ version: 5, crons: {} }, { version: 1, crons: {} }).version === 5);
    check("normalizeState dreht eine hoehere Version nicht zurueck",
      F.normalizeState({ version: 9, crons: {} }).version === 9);
  }

  // ═══ 18b2) Verweigerte Mandatssperre ist KEINE Verarbeitung ═══════════════════════════════
  abschnitt("18b2) Verweigerte Sperre crawl-<mandat>: kein Erfolg, keine Kapazitaet");
  {
    // AUSGANGSLAGE: der Fairnessvermerk wird VOR der Verarbeitung geschrieben, die Sperre
    // `crawl-<mandat>` erst in runSourceCrawl. Ueberlappen zwei Laeufe, kann Lauf B ein
    // Mandat also registrieren und erst danach an der Sperre abgewiesen werden. runSourceCrawl
    // WIRFT dabei nicht, sondern liefert `{ skipped: true, reason: "already running" }`.
    // Das darf nicht als Verarbeitung zaehlen.
    const uhr = makeUhr();
    const ablage = makeAblage({}, uhr);
    // Reihenfolge bei leerem Zustand ermitteln, damit der Test das erste Mandat kennt.
    const plan0 = F.planTenantOrder({ cronName: "crawl", tenantIds: SECHS, state: {}, nowMs: uhr.now() });
    const abgewiesen = plan0.order[0];
    const echtVerarbeitet = [];
    const r = await F.runTenantsFairly({
      cronName: "crawl", tenantIds: SECHS, runId: "lauf-B",
      deadlineMs: 110000, reserveMs: 0, startedMs: uhr.now(), now: uhr.now,
      loadState: ablage.load, saveState: ablage.save,
      perTenant: async (id) => {
        if (id === abgewiesen) return { skipped: true, reason: "already running" };
        uhr.vor(60000);
        echtVerarbeitet.push(id);
        return { ok: true };
      }
    });
    const f = r.fairness;
    const eintrag = F.entryOf(F.normalizeState(ablage.dump()), "crawl", abgewiesen);
    check("(1) zaehlt NICHT als begonnene Mandatsverarbeitung",
      !f.begonnen.includes(abgewiesen), f.begonnen.join(","));
    check("(2) erhoeht die gemessene Kapazitaet k NICHT",
      f.kapazitaet === echtVerarbeitet.length, `k=${f.kapazitaet}, echt=${echtVerarbeitet.length}`);
    check("(3) schiebt den Fairnesszustand nicht mit einem erfundenen Erfolg nach hinten",
      eintrag && eintrag.letzterErfolgAt === null && eintrag.erfolge === 0 && eintrag.status !== "erfolgreich",
      JSON.stringify(eintrag));
    check("(3b) und wird auch nicht als Fehler verbucht (nichts ist fehlgeschlagen)",
      eintrag && eintrag.letzterFehlerAt === null && eintrag.fehler === 0 && eintrag.fehlerSerie === 0,
      JSON.stringify(eintrag));
    check("(4) verfaelscht die Obergrenze ceil(n/k) nicht",
      f.obergrenzeLaeufe === F.fairnessBound(f.aktive, echtVerarbeitet.length),
      `${f.obergrenzeLaeufe} vs ${F.fairnessBound(f.aktive, echtVerarbeitet.length)}`);
    check("(5) andere wartende Mandate werden dadurch NICHT spaeter verarbeitet (Platz wird genutzt)",
      echtVerarbeitet.length === 2, echtVerarbeitet.join(","));
    check("(6) wird NICHT als Erfolg protokolliert", !f.erfolgreich.includes(abgewiesen), f.erfolgreich.join(","));
    check("(6b) wird NICHT als Fehlschlag protokolliert", !f.fehlgeschlagen.includes(abgewiesen), f.fehlgeschlagen.join(","));
    check("(6c) ist eindeutig als verweigerte/bereits laufende Verarbeitung beobachtbar",
      f.laeuftBereits.includes(abgewiesen) && Array.isArray(f.lockVerweigert) && f.lockVerweigert.includes(abgewiesen),
      JSON.stringify({ laeuftBereits: f.laeuftBereits, lockVerweigert: f.lockVerweigert }));
    check("Der Aufrufer sieht die Originalantwort weiter unveraendert (kein Bruch fuer Bestandscode)",
      (r.results.find((x) => x.politicianId === abgewiesen) || {}).reason === "already running",
      JSON.stringify(r.results.find((x) => x.politicianId === abgewiesen)));
    // Ein DRITTER ueberlappender Lauf darf das Mandat weiterhin nicht anfassen.
    const plan2 = F.planTenantOrder({ cronName: "crawl", tenantIds: SECHS, state: ablage.dump(), nowMs: uhr.now() });
    check("Innerhalb der Frist bleibt das Mandat fuer weitere Laeufe gesperrt",
      !plan2.order.includes(abgewiesen) && plan2.blockiert.some((b) => b.politicianId === abgewiesen),
      plan2.order.join(","));
    // Nach Ablauf der Frist ist es wieder planbar — und steht vor den zwischenzeitlich
    // erfolgreich verarbeiteten Mandaten, weil sein Versuchszeitpunkt aelter ist.
    uhr.setzen(uhr.now() + F.DEFAULT_STALE_CLAIM_MS + 1000);
    const plan3 = F.planTenantOrder({ cronName: "crawl", tenantIds: SECHS, state: ablage.dump(), nowMs: uhr.now() });
    check("Nach Ablauf der Frist ist es wieder planbar", plan3.order.includes(abgewiesen), plan3.order.join(","));
    check("Und es steht vor den zwischenzeitlich verarbeiteten Mandaten",
      echtVerarbeitet.every((id) => plan3.order.indexOf(abgewiesen) < plan3.order.indexOf(id)),
      plan3.order.join(","));
    // Vertrag zum Scheduler: genau diese Zeichenkette wird erkannt.
    check("Der erkannte Grund entspricht dem, was runSourceCrawl wirklich liefert",
      /return \{ skipped: true, reason: "already running" \};/
        .test(fs.readFileSync(path.join(ROOT, "lib", "helmut", "scheduler.js"), "utf8")));
    check("Ein anderer 'skipped'-Grund gilt weiterhin als normaler Versuch (z. B. deaktiviertes Profil)",
      await (async () => {
        const u2 = makeUhr();
        const a2 = makeAblage({}, u2);
        const r2 = await F.runTenantsFairly({
          cronName: "morning-briefing", tenantIds: ["nur-einer"], runId: "l",
          deadlineMs: 240000, reserveMs: 0, startedMs: u2.now(), now: u2.now,
          loadState: a2.load, saveState: a2.save,
          perTenant: async () => ({ skipped: true, reason: "profil-deaktiviert" })
        });
        return r2.fairness.begonnen.includes("nur-einer")
          && r2.fairness.erfolgreich.includes("nur-einer")
          && r2.fairness.lockVerweigert.length === 0;
      })());
  }

  // ═══ 18c) Die eigentliche Sperre gegen Doppelverarbeitung eines Mandats ═══════════════════
  abschnitt("18c) Sperre crawl-<mandat> — Reichweite, Dauer, Verhalten am Abbruch");
  {
    const schedulerSrc = fs.readFileSync(path.join(ROOT, "lib", "helmut", "scheduler.js"), "utf8");
    const storageSrc = fs.readFileSync(path.join(ROOT, "lib", "helmut", "storage.js"), "utf8");
    check("Die Sperre ist MANDATSSCHARF (crawl-<mandat>), nicht global",
      /const lockName = `crawl-\$\{politicianId\}`;/.test(schedulerSrc));
    check("Sie wird als ERSTES erworben — vor jeder Arbeit am Mandat",
      /const lockName = `crawl-\$\{politicianId\}`;\s*\n\s*const locked = await acquirePipelineLock\(lockName, 15 \* 60 \* 1000\);/.test(schedulerSrc));
    check("Wird sie verweigert, verarbeitet dieser Lauf das Mandat NICHT",
      /if \(!locked\) \{[\s\S]{0,220}return \{ skipped: true, reason: "already running" \};/.test(schedulerSrc));
    check("Ihre Dauer ist 15 Minuten — laenger als das Funktionslimit (300 s)",
      /acquirePipelineLock\(lockName, 15 \* 60 \* 1000\)/.test(schedulerSrc));
    check("Sie wird im finally freigegeben (kein Leck im Normalfall)",
      /finally \{[\s\S]{0,400}await releasePipelineLock\(lockName\);/.test(schedulerSrc));
    check("Der atomare Pfad ist EIN Upsert und bei DB-Fehler fail-closed",
      /rpc\/helmut_acquire_pipeline_lock/.test(storageSrc)
      && /\[pipelineLock:atomic\] fail-closed/.test(storageSrc)
      && /return false;\s*\n\s*\}\s*\n\}/.test(storageSrc));
    check("Die Freigabe ist an den Halter gebunden (kein fremdes Release nach TTL)",
      /rpc\/helmut_release_pipeline_lock/.test(storageSrc) && /p_token: token/.test(storageSrc));
    // Prozessabbruch: die Sperre bleibt bis zum Ablauf stehen — genau deshalb wird ein
    // zweiter, ueberlappender Lauf dasselbe Mandat nicht anfassen.
    check("Beim Prozessabbruch bleibt die Sperre bis zum Ablauf bestehen (TTL raeumt auf)",
      /TTL raeumt auf/.test(storageSrc));
    // Die Fairnessschicht ist die ZWEITE Schranke und ersetzt die Sperre nicht.
    check("Die Fairnessschicht nennt sich ausdruecklich NICHT Ersatz der Sperre",
      /Kein Ersatz fuer die Sperre `crawl-<mandat>`/.test(fs.readFileSync(path.join(ROOT, "lib", "helmut", "cron-fairness.js"), "utf8")));
    check("Ein vom Lock abgewiesenes Mandat gilt als versucht (der andere Lauf bedient es)",
      /reason: "already running"/.test(schedulerSrc));
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
        [["    const registrierung = await speichern(\n      claimPatch({ cronName, tenantId, runId, nowMs: versuchMs, vorher }),\n      { pruefen: true }\n    );", "    const registrierung = { ok: true, remote: null };"],
          ["    await speichern(finishPatch({", "    if (false) await speichern(finishPatch({"]]],
      ["Der Versuch wird erst NACH der Verarbeitung vermerkt", "registrierung",
        [["    const registrierung = await speichern(\n      claimPatch({ cronName, tenantId, runId, nowMs: versuchMs, vorher }),\n      { pruefen: true }\n    );", "    const registrierung = { ok: true, remote: null };"]]],
      ["Ein laufender Versuch blockiert nichts mehr (Ueberlappungsschutz weg)", "ueberlappung",
        [["    if (laufend) blockiert.push({ ...kandidat, grund: \"laeuft-bereits\" });\n    else planbar.push(kandidat);", "    planbar.push(kandidat);"]]],
      ["Eine verweigerte Sperre gilt wieder als Erfolg", "sperre",
        [["    if (erfolg && sperreVerweigert(ergebnis)) {", "    if (false) {"]]],
      ["Der Wettlauf gegen einen fremden Halter wird ignoriert", "wettlauf",
        [["    const fremd = registriert ? fremderHalter(zustand, cronName, tenantId, runId, now(), staleMs) : null;", "    const fremd = null;"]]],
      ["Ein Lauf ohne Kapazitaet meldet trotzdem eine Garantie", "kapazitaet",
        [["  const ohneFortschritt = planung.planbar > 0 && kapazitaet === 0;", "  const ohneFortschritt = false;"],
          ["      fortschrittsgarantie: Number.isFinite(grenze) && kapazitaet > 0,", "      fortschrittsgarantie: true,"]]],
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

    // Probe E — verliert dieser Lauf den Wettlauf um ein Mandat, darf er es nicht anfassen.
    async function wettlaufIgnoriert(mod) {
      const uhr = makeUhr();
      let raw = {};
      const begonnen = [];
      await mod.runTenantsFairly({
        cronName: "crawl", tenantIds: ["anna-a", "bela-b"], runId: "lauf-B",
        deadlineMs: 240000, reserveMs: 0, startedMs: uhr.now(), now: uhr.now,
        loadState: async () => JSON.parse(JSON.stringify(raw)),
        saveState: async (patch, { pruefen = false } = {}) => {
          raw = mod.mergeState(raw, patch, { nowMs: uhr.now() });
          if (pruefen && patch.crons.crawl && patch.crons.crawl["anna-a"]) {
            raw = mod.mergeState(raw, {
              version: 1,
              crons: { crawl: { "anna-a": { status: "laufend", letzterVersuchAt: new Date(uhr.now() + 1).toISOString(), letzteLaufkennung: "lauf-A", versuche: 2 } } }
            }, { nowMs: uhr.now() });
          }
          return { ok: true, state: JSON.parse(JSON.stringify(raw)) };
        },
        perTenant: async (id) => { begonnen.push(id); uhr.vor(1000); return { ok: true }; }
      });
      return begonnen.includes("anna-a"); // true = Doppelverarbeitung moeglich
    }

    // Probe F — ein Lauf ohne Kapazitaet darf keine Garantie behaupten.
    async function kapazitaetGelogen(mod) {
      const uhr = makeUhr();
      const r = await mod.runTenantsFairly({
        cronName: "crawl", tenantIds: SECHS, deadlineMs: 10000, reserveMs: 15000,
        startedMs: uhr.now(), now: uhr.now,
        loadState: async () => ({}), saveState: async () => ({ ok: true }),
        perTenant: async () => { uhr.vor(60000); return { ok: true }; }
      });
      return r.fairness.begonnen.length === 0
        && (r.fairness.fortschrittsgarantie === true || r.fairness.ohneFortschritt === false);
    }

    check("Ausgangslage: der echte Code laesst den Wettlauf-Verlierer aussetzen",
      (await wettlaufIgnoriert(F)) === false);
    check("Ausgangslage: der echte Code behauptet bei k=0 keine Garantie",
      (await kapazitaetGelogen(F)) === false);

    // Probe G — eine verweigerte Sperre darf nie als Verarbeitung durchgehen.
    async function sperreZaehltAlsErfolg(mod) {
      const uhr = makeUhr();
      let roh = {};
      const r = await mod.runTenantsFairly({
        cronName: "crawl", tenantIds: ["anna-a", "bela-b"], runId: "lauf-B",
        deadlineMs: 240000, reserveMs: 0, startedMs: uhr.now(), now: uhr.now,
        loadState: async () => JSON.parse(JSON.stringify(roh)),
        saveState: async (patch) => { roh = mod.mergeState(roh, patch, { nowMs: uhr.now() }); return { ok: true }; },
        perTenant: async (id) => {
          if (id === "anna-a") return { skipped: true, reason: "already running" };
          uhr.vor(1000);
          return { ok: true };
        }
      });
      const e = mod.entryOf(mod.normalizeState(roh), "crawl", "anna-a");
      return r.fairness.begonnen.includes("anna-a")
        || r.fairness.erfolgreich.includes("anna-a")
        || Boolean(e && e.letzterErfolgAt);
    }

    check("Ausgangslage: eine verweigerte Sperre zaehlt nicht als Verarbeitung",
      (await sperreZaehltAlsErfolg(F)) === false);

    const proben = {
      sperre: sperreZaehltAlsErfolg,
      garantie: verletztGarantie,
      registrierung: async (mod) => !(await versuchVorVerarbeitung(mod)),
      ueberlappung: ueberlappungOffen,
      zeitbudget: zeitbudgetFaelschtVersuch,
      wettlauf: wettlaufIgnoriert,
      kapazitaet: kapazitaetGelogen
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
      /async function readCronFairnessState\(deps = \{\}\)[\s\S]{0,1400}catch \(error\) \{\s*\n\s*return \{ ok: false, state: normalizeState\(\{\}\)/.test(storageQuelle));
    check("saveCronFairnessState schreibt keinen aelteren Codestand ueber eine NEUERE Ablageform",
      /aktuell\.version > FAIRNESS_VERSION/.test(storageQuelle)
      && /zustand-neuere-version/.test(storageQuelle));
    check("Der Versuchsvermerk wird nach dem Schreiben gegengelesen (kein stiller Verlust)",
      /if \(!pruefen \|\| !erwartet\.length\)/.test(storageQuelle)
      && /eigener-eintrag-ueberschrieben/.test(storageQuelle));
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

  // ═══ 19c) Echte Ablage gegen einen gleichzeitigen Schreiber ═══════════════════════════════
  abschnitt("19c) Gleichzeitige Schreibzugriffe verlieren keine Eintraege");
  {
    // Gegen die ECHTEN Funktionen aus storage.js, mit injizierter Anfrage-Funktion
    // (`deps.request`) — kein Netz, keine Datenbank, kein Secret. Dummy-Werte nur, damit
    // storage.useSupabase() den relationalen Zweig waehlt.
    const storage = require(path.join(ROOT, "lib", "helmut", "storage.js"));
    const alt = {
      backend: process.env.HELMUT_STORAGE_BACKEND,
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_ROLE_KEY
    };
    process.env.HELMUT_STORAGE_BACKEND = "supabase";
    process.env.SUPABASE_URL = "http://127.0.0.1:1/nicht-erreichbar";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "attrappe-kein-secret";
    try {
      // Attrappe der Zeile helmut_store/<storeId>-cron-fairness.
      function attrappe({ nachSchreiben = null, leseFehler = null } = {}) {
        const st = { row: null, lesen: 0, schreiben: 0 };
        st.request = async (endpoint, options = {}) => {
          if (!options.method || options.method === "GET") {
            st.lesen += 1;
            if (leseFehler) throw new Error(leseFehler);
            return st.row ? [{ data: st.row }] : [];
          }
          if (options.method === "POST") {
            st.schreiben += 1;
            st.row = JSON.parse(options.body).data;
            // Ein gleichzeitiger Lauf schreibt DIREKT NACH uns und traegt unseren
            // Eintrag nicht mit — der klassische verlorene Schreibvorgang.
            if (nachSchreiben) nachSchreiben(st);
            return null;
          }
          throw new Error(`unerwartete Methode ${options.method}`);
        };
        return st;
      }

      const fremderStand = {
        version: 1,
        crons: { crawl: { "fremd-mandat": { status: "laufend", letzterVersuchAt: new Date(BASIS_MS).toISOString(), letzteLaufkennung: "lauf-fremd", versuche: 1 } } }
      };
      let einmal = true;
      const ablage = attrappe({
        nachSchreiben: (st) => {
          if (!einmal) return;
          einmal = false;
          st.row = JSON.parse(JSON.stringify(fremderStand)); // unser Eintrag ist weg
        }
      });
      const patch = F.claimPatch({ cronName: "crawl", tenantId: "eigen-mandat", runId: "lauf-eigen", nowMs: BASIS_MS });
      const ergebnis = await storage.saveCronFairnessState(patch, { nowMs: BASIS_MS, pruefen: true, deps: { request: ablage.request } });
      check("Der ueberschriebene Versuchsvermerk wird erkannt und wiederholt",
        ergebnis.ok === true && ergebnis.versuche === 2, JSON.stringify({ ok: ergebnis.ok, versuche: ergebnis.versuche, fehler: ergebnis.fehler }));
      check("Der eigene Eintrag steht danach in der Ablage",
        F.entryOf(F.normalizeState(ablage.row), "crawl", "eigen-mandat") !== null);
      check("Der Eintrag des gleichzeitigen Laufs ist NICHT verloren",
        F.entryOf(F.normalizeState(ablage.row), "crawl", "fremd-mandat") !== null,
        JSON.stringify(ablage.row));
      check("Der zurueckgegebene Fernstand traegt beide Eintraege (fremder Halter sichtbar)",
        F.entryOf(ergebnis.state, "crawl", "eigen-mandat") !== null
        && F.entryOf(ergebnis.state, "crawl", "fremd-mandat") !== null);

      // Dauerhafter Wettlauf: nach begrenzten Versuchen ehrlich aufgeben statt endlos.
      const dauerhaft = attrappe({ nachSchreiben: (st) => { st.row = JSON.parse(JSON.stringify(fremderStand)); } });
      const verloren = await storage.saveCronFairnessState(patch, { nowMs: BASIS_MS, pruefen: true, maxVersuche: 2, deps: { request: dauerhaft.request } });
      check("Ein dauerhafter Wettlauf endet nach begrenzten Versuchen mit ok:false",
        verloren.ok === false && verloren.konflikt === true, JSON.stringify(verloren));
      check("Er laeuft dabei nicht endlos (genau 2 Schreibversuche)", dauerhaft.schreiben === 2, String(dauerhaft.schreiben));

      // Lesefehler -> KEIN Schreibvorgang (bestehende Eintraege bleiben unberuehrt).
      const kaputtesLesen = attrappe({ leseFehler: "blob-timeout" });
      kaputtesLesen.row = JSON.parse(JSON.stringify(fremderStand));
      const nichtGeschrieben = await storage.saveCronFairnessState(patch, { nowMs: BASIS_MS, pruefen: true, deps: { request: kaputtesLesen.request } });
      check("Bei Lesefehler wird NICHT geschrieben", nichtGeschrieben.ok === false && kaputtesLesen.schreiben === 0,
        JSON.stringify({ ok: nichtGeschrieben.ok, schreiben: kaputtesLesen.schreiben }));
      check("Die bestehenden Eintraege bleiben dabei unveraendert",
        F.entryOf(F.normalizeState(kaputtesLesen.row), "crawl", "fremd-mandat") !== null);

      // Neuere Schemaversion -> KEIN Schreibvorgang (Rollout mit zwei Codestaenden).
      const neuer = attrappe({});
      neuer.row = { version: F.FAIRNESS_VERSION + 1, crons: { crawl: { "fremd-mandat": { status: "erfolgreich", letzterVersuchAt: new Date(BASIS_MS).toISOString() } } } };
      const abgelehnt = await storage.saveCronFairnessState(patch, { nowMs: BASIS_MS, deps: { request: neuer.request } });
      check("Ein aelterer Codestand ueberschreibt eine NEUERE Ablageform nicht",
        abgelehnt.ok === false && /neuere-version/.test(String(abgelehnt.fehler)) && neuer.schreiben === 0,
        JSON.stringify({ ok: abgelehnt.ok, fehler: abgelehnt.fehler, schreiben: neuer.schreiben }));

      // Abschluss-Schreibvorgang wird bewusst NICHT gegengelesen (ein verlorener
      // Abschluss laeuft ueber die Frist ab) — das haelt die Zahl der Anfragen klein.
      const ohnePruefung = attrappe({});
      await storage.saveCronFairnessState(
        F.finishPatch({ cronName: "crawl", tenantId: "eigen-mandat", runId: "lauf-eigen", erfolg: true, startedMs: BASIS_MS, nowMs: BASIS_MS + 1000 }),
        { nowMs: BASIS_MS + 1000, deps: { request: ohnePruefung.request } }
      );
      check("Der Abschluss braucht genau ein Lesen und ein Schreiben (keine Gegenpruefung)",
        ohnePruefung.lesen === 1 && ohnePruefung.schreiben === 1,
        JSON.stringify({ lesen: ohnePruefung.lesen, schreiben: ohnePruefung.schreiben }));
    } finally {
      if (alt.backend === undefined) delete process.env.HELMUT_STORAGE_BACKEND; else process.env.HELMUT_STORAGE_BACKEND = alt.backend;
      if (alt.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = alt.url;
      if (alt.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = alt.key;
    }
  }

  // ═══ 19d) Der Lauf sieht bei gestoerter Buchfuehrung NICHT sauber aus ═════════════════════
  abschnitt("19d) Schreibfehler macht den Lauf nicht falsch gruen");
  {
    const serverSrc = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    check("Ein gestoerter Fairnesszustand erzeugt einen eigenen systemError",
      /Fairnesszustand nicht nutzbar[\s\S]{0,120}keine Fairnessgarantie/.test(serverSrc));
    check("Er steht zusaetzlich als eigenes Feld in der Antwort",
      /fairnessGestoert: Boolean\(fairnessAn && \(!fairness\.zustandGeladen \|\| fairness\.zustandFehler\)\)/.test(serverSrc));
    check("Ein Lauf ohne Fortschritt (k=0) steht ebenfalls in der Antwort",
      /ohneFortschritt: Boolean\(fairness\.ohneFortschritt\)/.test(serverSrc));
    check("Der Fall k=0 wird im systemError ausdruecklich benannt",
      /KEIN Mandat begonnen[\s\S]{0,200}KEINE Fairnessgarantie/.test(serverSrc));
    check("Die Protokollzeile weist Kapazitaet und fehlende Garantie aus",
      /kapazitaet=\$\{fairness\.kapazitaet\}/.test(serverSrc)
      && /keine-garantie/.test(serverSrc));
    check("Die Protokollzeile weist eine verweigerte Sperre getrennt aus",
      /sperreVerweigert=\$\{\(fairness\.lockVerweigert \|\| \[\]\)\.join\(","\) \|\| "-"\}/.test(serverSrc));
    check("Begruendung dokumentiert, warum ok:true bleibt (kein Watchdog-Fehlalarm)",
      /Watchdog\s*\n?\s*\/\/ fehlalarmieren/.test(serverSrc) || /fehlalarmieren/.test(serverSrc));
  }

  // ═══ 19e) Der Schalter: Default AN und was der Merge sofort bewirkt ═══════════════════════
  abschnitt("19e) HELMUT_CRON_FAIRNESS — Default und Merge-Wirkung");
  {
    check("OHNE gesetzte Umgebungsvariable ist die Fairness AKTIV",
      F.fairnessEnabled({}) === true && F.fairnessEnabled({ HELMUT_CRON_FAIRNESS: "" }) === true
      && F.fairnessEnabled({ HELMUT_CRON_FAIRNESS: "   " }) === true);
    check("Nur 'off'/'false'/'0' schalten ab (auch mit Grossschreibung und Leerzeichen)",
      F.fairnessEnabled({ HELMUT_CRON_FAIRNESS: "off" }) === false
      && F.fairnessEnabled({ HELMUT_CRON_FAIRNESS: " OFF " }) === false
      && F.fairnessEnabled({ HELMUT_CRON_FAIRNESS: "false" }) === false
      && F.fairnessEnabled({ HELMUT_CRON_FAIRNESS: "0" }) === false);
    check("Jeder andere Wert laesst sie aktiv (kein stilles Abschalten durch Tippfehler)",
      F.fairnessEnabled({ HELMUT_CRON_FAIRNESS: "on" }) === true
      && F.fairnessEnabled({ HELMUT_CRON_FAIRNESS: "aus" }) === true
      && F.fairnessEnabled({ HELMUT_CRON_FAIRNESS: "nein" }) === true);
    // Der Schalter ist NICHT ueber helmut-flags.json steuerbar — die Datei hat eine feste
    // Allowlist. Der Rueckweg laeuft ausschliesslich ueber die Vercel-Env.
    const flagsSrc = fs.readFileSync(path.join(ROOT, "lib", "helmut", "flags.js"), "utf8");
    check("Der Schalter steht NICHT in der Datei-Flag-Allowlist (nur Vercel-Env wirkt)",
      /FILE_FLAG_ALLOWLIST/.test(flagsSrc) && !/HELMUT_CRON_FAIRNESS/.test(flagsSrc));
    // Wirkung des Merges: server.js liest den Schalter und waehlt danach die Reihenfolge.
    const serverSrc = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    check("server.js leitet den Schalter in die Reihenfolge (Merge = Aktivierung)",
      /const fairnessAn = cronFairness\.fairnessEnabled\(\);/.test(serverSrc)
      && /reihenfolge: fairnessAn \? "fair" : "unveraendert"/.test(serverSrc));
    check("Ohne Schalter wird der Zustand gelesen UND geschrieben (Production-Wirkung ab Merge)",
      /if \(!fairnessAn\) return \{\};[\s\S]{0,200}readCronFairnessState\(\)/.test(serverSrc)
      && /if \(!fairnessAn\) return null;[\s\S]{0,400}saveCronFairnessState\(patch, \{ pruefen \}\)/.test(serverSrc));
    // Und der Rueckweg stellt wirklich den Altzustand her: uebergebene Reihenfolge, kein IO.
    const uhrAus = makeUhr();
    const ablageAus = makeAblage({}, uhrAus);
    const lAus = await lauf({ ablage: ablageAus, uhr: uhrAus, tenants: SECHS, standardKosten: 60000, deadlineMs: 110000, reihenfolge: "unveraendert" });
    check("Rueckweg: alphabetische Reihenfolge, 0 Schreibvorgaenge, kein Fairnesszustand",
      lAus.begonnen.join(",") === "anna-a,bela-b" && ablageAus.schreibvorgaenge === 0
      && Object.keys(F.normalizeState(ablageAus.dump()).crons).length === 0,
      `${lAus.begonnen.join(",")} / ${ablageAus.schreibvorgaenge}`);
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
