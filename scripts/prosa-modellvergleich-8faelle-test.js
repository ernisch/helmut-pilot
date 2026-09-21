"use strict";

// Gezielte Abnahme des 8-Fall-Modellvergleichs. Kein Modellaufruf, kein Netz,
// keine Productiondaten. Geprueft werden ausschliesslich die durch diesen Sprint
// eingefuehrten Aenderungen: 8-Fall-Grenze, 9-Fall-Ablehnung, strenge
// Referenzbindung, Trennung von Sollurteilen und Modellpayload sowie die
// Einmal-/Kostendeckelung des vorbereiteten Ausfuehrers.
const A = require("node:assert/strict");
const P = require("../lib/helmut/prosa-praemissenpruefung");
const R = require("../lib/helmut/prosa-praemissenreferenzen");
const F = require("./fixtures/prosa-modellvergleich-8faelle");
const V = require("./prosa-modellvergleich-8faelle-versuch");

let count = 0;
function test(name, fn) { fn(); count++; console.log("PASS " + name); }

test("acht neue Sollfaelle: sechs negativ und zwei positiv", () => {
  const c = F.corpus();
  A.equal(c.length, 8);
  A.equal(c.filter(r => r.art === "negativ" && r.erwartet === "widersprochen").length, 6);
  A.equal(c.filter(r => r.art === "positiv" && r.erwartet === "tragfaehig").length, 2);
});

test("Kennungen sind eindeutig und verwenden den neuen Namensraum (kein Altbestand)", () => {
  const c = F.corpus();
  A.equal(new Set(c.map(r => r.eingabe.id)).size, 8);
  for (const r of c) {
    A.equal(r.eingabe.id.startsWith("m"), true, "Kennung traegt nicht das neue Praefix m");
    A.ok(r.eingabe.id.length <= 60);
  }
  const refs = c.flatMap(r => [...r.eingabe.quellen, ...r.eingabe.profil].map(x => x.id));
  A.equal(new Set(refs).size, 16, "Quellen-/Profilkennungen sind nicht global eindeutig");
});

test("acht Faelle werden akzeptiert und gebunden", () => {
  const v = P.binde(F.eingaben());
  A.equal(v.eingabe().faelle.length, 8);
  A.equal(v.eingabeHash.length, 64);
});

test("neun Faelle werden weiterhin abgelehnt (fail closed)", () => {
  const neun = F.eingaben().concat([{ id: "extra-fall",
    quellen: [{ id: "extra-fall-q", text: "Zusaetzlicher Fall." }],
    profil: [{ id: "extra-fall-p", text: "Profil." }],
    mandatsbezug: "Zusatz", einordnung: "Ein weiterer Satz." }]);
  A.throws(() => P.binde(neun), /praemissenpruefung-eingabe/);
});

test("Referenzbindung bleibt streng: nur ganze eigene Originalstellen als Belege", () => {
  const v = P.binde(F.eingaben());
  const s = R.schema(v);
  A.equal(s.properties.faelle.items.anyOf.length, 8);
  for (const [i, f] of v.eingabe().faelle.entries()) {
    const fall = s.properties.faelle.items.anyOf[i];
    const refs = fall.properties.praemissen.items.properties.belege.items.anyOf;
    const erlaubt = new Set(refs.map(x => x.properties.referenz.enum[0]));
    A.equal(erlaubt.has(f.id), false, "Fallkennung ist eine Belegreferenz");
    for (const r of [...f.quellen, ...f.profil]) {
      A.equal(erlaubt.has(r.id), true);
      const zitate = refs.filter(x => x.properties.referenz.enum[0] === r.id)
        .map(x => x.properties.zitat.enum);
      A.deepEqual(zitate, [[r.text]]);
    }
  }
});

test("Sollurteile und Begruendungen sind vom Modellpayload getrennt", () => {
  const c = F.corpus();
  for (const r of c) {
    A.equal(Object.hasOwn(r.eingabe, "erwartet"), false);
    A.equal(Object.hasOwn(r.eingabe, "begruendung"), false);
    A.equal(Object.hasOwn(r.eingabe, "klasse"), false);
    A.equal(Object.hasOwn(r.eingabe, "art"), false);
  }
  const prompt = V.paket().prompt;
  for (const r of c) {
    A.equal(prompt.includes(r.begruendung), false, "Begruendung erscheint im Prompt");
  }
});

test("Ausfuehrer ist auf genau einen Aufruf und 0,212 USD gedeckelt", () => {
  A.equal(V.MAX_COST, 212000);
  A.equal(V.BRANCH, "codex/prosa-modellvergleich-kostenfix-20260921");
  const p = V.paket();
  A.equal(p.faelle.length, 8);
  A.equal(V.paket().paketHash, p.paketHash, "paketHash ist nicht stabil (eingefroren)");
});

test("Auswertung verlangt exakt 8 von 8; ein falscher Fall macht nicht bestanden", () => {
  const c = F.corpus();
  const alleRichtig = c.map(r => ({ id: r.eingabe.id, urteil: r.erwartet }));
  const b1 = V.auswertung(c, { urteile: alleRichtig });
  A.equal(b1.length, 8);
  A.equal(b1.every(x => x.bestanden), true);
  const einFalsch = alleRichtig.map((x, i) => i === 0
    ? { ...x, urteil: c[0].erwartet === "widersprochen" ? "tragfaehig" : "widersprochen" } : x);
  const b2 = V.auswertung(c, { urteile: einFalsch });
  A.equal(b2.filter(x => !x.bestanden).length, 1);
  A.equal(b2.every(x => x.bestanden), false);
});

// ── Kosten-Vorflug: nur der belegte Altbestand darf offen bleiben ────────────
const K = require("../lib/helmut/testkosten-budget");

function tagesEintrag(calls, over = {}) {
  return { version: 1, day: V.TAG, tarif: "azure-gpt5-mini-obergrenze-20260909", limit: 4000000,
    spent: 410517, baseline: 410517, baselineCalls: 5, manualCalls: 1, manualUntil: null, frozen: null,
    calls, ...over };
}
function altTicket(over = {}) {
  return { status: "ungeklaert", reserved: 212000, maxOutputTokens: 3000, manual: true,
    createdAt: "2026-09-21T09:39:00.000Z",
    bezug: { version: 1, runId: V.ALT_BEZUG_RUN, mandatHash: V.ALT_MANDAT_HASH, phase: "pruefung" },
    ...over };
}
const sperrt = t => { try { V.pruefeOffeneReserven(t); return false; } catch (e) { return e.code === "EINORDNUNG_KOSTEN_GESPERRT"; } };

test("Production-aehnlicher Zustand mit exakt dem bekannten Alt-Ticket wird akzeptiert", () => {
  const t = tagesEintrag({ [V.ALT_TICKET]: altTicket() });
  A.doesNotThrow(() => V.pruefeOffeneReserven(t));
  A.equal(K.belegt(t) + V.MAX_COST <= 4000000, true);
});

test("dasselbe Ticket mit falscher ID wird abgelehnt", () => {
  A.equal(sperrt(tagesEintrag({ "fremde-id": altTicket() })), true);
});

test("dasselbe Ticket mit anderem Run wird abgelehnt", () => {
  const t = tagesEintrag({ [V.ALT_TICKET]: altTicket({ bezug: { version: 1, runId: "nachlauf500-99999999999",
    mandatHash: V.ALT_MANDAT_HASH, phase: "pruefung" } }) });
  A.equal(sperrt(t), true);
});

test("dasselbe Ticket mit anderer Reserve wird abgelehnt", () => {
  A.equal(sperrt(tagesEintrag({ [V.ALT_TICKET]: altTicket({ reserved: 100000 }) })), true);
});

test("zweites ungeklaertes Ticket wird abgelehnt", () => {
  A.equal(sperrt(tagesEintrag({ [V.ALT_TICKET]: altTicket(), "zweites": altTicket() })), true);
});

test("ein reserviertes Ticket wird abgelehnt (auch neben dem Alt-Ticket)", () => {
  A.equal(sperrt(tagesEintrag({ "neu-reserviert": altTicket({ status: "reserviert" }) })), true);
  A.equal(sperrt(tagesEintrag({ [V.ALT_TICKET]: altTicket(), "neu-reserviert": altTicket({ status: "reserviert" }) })), true);
});

test("zu wenig verbleibendes Tagesbudget wird abgelehnt", () => {
  const t = tagesEintrag({ [V.ALT_TICKET]: altTicket() }, { spent: 3999900, baseline: 3999900 });
  A.equal(K.belegt(t) + V.MAX_COST > 4000000, true);
  A.equal(sperrt(t), true);
});

test("Tagesriegel bleibt 4000000 und neue Reserve maximal 212000", () => {
  A.equal(K.LIMIT_MICRO_USD, 4000000);
  A.equal(V.MAX_COST, 212000);
});

test("fruehe Fehlerausgabe nennt nur den sicheren EINORDNUNG-Code, keine sensitiven Daten", () => {
  const a = V.frueheFehlerausgabe(Object.assign(new Error("interner Klartext"), { code: "EINORDNUNG_KOSTEN_GESPERRT" }));
  A.deepEqual(a, { ok: false, grund: "EINORDNUNG_UNBESTAETIGT", detail: "EINORDNUNG_KOSTEN_GESPERRT",
    automatischeWiederholung: false });
  A.equal(JSON.stringify(a).includes("interner Klartext"), false);
  const b = V.frueheFehlerausgabe(Object.assign(new Error("secret=abc"), { code: "test-usd-buch-unlesbar" }));
  A.deepEqual(b, { ok: false, grund: "EINORDNUNG_UNBESTAETIGT", automatischeWiederholung: false });
  A.equal(JSON.stringify(b).includes("secret"), false);
  const c2 = V.frueheFehlerausgabe(new Error("roher Fehler mit Daten"));
  A.deepEqual(c2, { ok: false, grund: "EINORDNUNG_UNBESTAETIGT", automatischeWiederholung: false });
});

console.log(`${count}/${count} Modellvergleich-8-Faelle-Tests bestanden; keine Modellabnahme, keine Productionwirkung.`);
