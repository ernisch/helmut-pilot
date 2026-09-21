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

test("Satzgrenzen: Ordinaldatum bleibt ein Satz, echte Satzenden bleiben getrennt", () => {
  const S = P.saetzeVon;
  const eins = "Du koenntest dich auf den Beschluss am 1. Mai 2027 vorbereiten.";
  A.deepEqual(S(eins).map(x => x.text), [eins]);
  for (const datum of ["Erst am 3. Oktober 2026 wird beraten.",
    "Am 14. Maerz 2027 folgt der Beschluss.",
    "Am 1. Mai 2027 und am 3. Oktober 2026 ist nichts terminiert."])
    A.equal(S(datum).length, 1, `Ordinaldatum faelschlich getrennt: ${datum}`);
  const zwei = "Der Ausschuss tagt am Montag. Die Abgeordnete ist Mitglied.";
  A.equal(S(zwei).length, 2);
  A.deepEqual(S(zwei).map(x => x.index), [0, 1]);
  for (const text of ["Die Sitzung beginnt um 9. Der Antrag liegt vor.",
    "Das Ergebnis war 42. Die Fraktion reagiert.",
    "Der Beschluss fiel am 3. Mai. Dann begann die Umsetzung."])
    A.equal(S(text).length, 2, `echtes Satzende nicht getrennt: ${text}`);
  // Keine Normalisierung: die Segmente zusammengesetzt sind genau der Originaltext.
  A.equal(S(zwei).map(x => x.text).join(" "), zwei);
});

test("Jeder der acht Faelle ist nach der Korrektur genau ein Satz (N4 und P2 eingeschlossen)", () => {
  const v = P.binde(F.eingaben()), soll = F.corpus();
  A.equal(v.eingabe().faelle.length, 8);
  for (const [i, f] of v.eingabe().faelle.entries()) {
    A.equal(f.id, soll[i].eingabe.id);
    A.deepEqual(f.saetze.map(x => x.index), [0], `${soll[i].klasse} ist nicht genau ein Satz`);
  }
});

test("Deckungsregel bleibt streng: ein nicht gedeckter Satz wird abgelehnt", () => {
  const v = P.binde([{ id: "zwei-saetze",
    quellen: [{ id: "zwei-saetze-q", text: "Der Ausschuss tagt am Montag." }],
    profil: [{ id: "zwei-saetze-p", text: "Mitglied im Ausschuss." }],
    mandatsbezug: "Ausschuss",
    einordnung: "Der Ausschuss tagt am Montag. Die Abgeordnete ist Mitglied." }]);
  const antwort = { version: 1, eingabeHash: v.eingabeHash, faelle: [{ id: "zwei-saetze",
    praemissen: [{ satz: 0, behauptung: "Der Ausschuss tagt am Montag.", art: "sachangabe",
      befund: "getragen", belege: [{ referenz: "zwei-saetze-q", zitat: "Der Ausschuss tagt am Montag." }] }],
    urteil: "tragfaehig", begruendung: "Satz eins ist belegt." }] };
  A.throws(() => v.pruefe(antwort), /praemissenpruefung-satz-fehlt/);
  antwort.faelle[0].praemissen.push({ satz: 1, behauptung: "Die Abgeordnete ist Mitglied.",
    art: "befugnis", befund: "getragen",
    belege: [{ referenz: "zwei-saetze-p", zitat: "Mitglied im Ausschuss." }] });
  A.equal(v.pruefe(antwort).urteile[0].urteil, "tragfaehig");
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

test("Ausfuehrer ist auf genau einen Aufruf und 0,232 USD gedeckelt", () => {
  A.equal(V.MAX_COST, 232000);
  A.equal(V.MAX_OUTPUT_TOKENS, 8000);
  A.equal(V.BRANCH, "codex/prosa-modellvergleich-outputreserve-20260921");
  A.equal(V.KEY, "prosaModellvergleich3_20260921");
  A.equal(V.KI_TIMEOUT_MS, 120000);
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

// ── Kosten-Vorflug: nur die zwei belegten Altbestaende duerfen offen bleiben ──
const K = require("../lib/helmut/testkosten-budget");

function tagesEintrag(calls, over = {}) {
  return { version: 1, day: V.TAG, tarif: "azure-gpt5-mini-obergrenze-20260909", limit: 4000000,
    spent: 410517, baseline: 410517, baselineCalls: 5, manualCalls: 2, manualUntil: null, frozen: null,
    calls, ...over };
}
function ticket(runId, hash, over = {}) {
  return { status: "ungeklaert", reserved: 212000, maxOutputTokens: 3000, manual: true,
    createdAt: "2026-09-21T09:39:00.000Z",
    bezug: { version: 1, runId, mandatHash: hash, phase: "pruefung" }, ...over };
}
const altTicket = (over = {}) => ticket(V.ALT_BEZUG_RUN, V.ALT_MANDAT_HASH, over);
const neuTicket = (over = {}) => ticket(V.NEU_BEZUG_RUN, V.NEU_MANDAT_HASH, over);
const beide = (overAlt = {}, overNeu = {}) => ({ [V.ALT_TICKET]: altTicket(overAlt), [V.NEU_TICKET]: neuTicket(overNeu) });
const sperrt = t => { try { V.pruefeOffeneReserven(t); return false; } catch (e) { return e.code === "EINORDNUNG_KOSTEN_GESPERRT"; } };

test("Production-aehnlicher Zustand mit exakt den zwei belegten Tickets wird akzeptiert", () => {
  const t = tagesEintrag(beide());
  A.doesNotThrow(() => V.pruefeOffeneReserven(t));
  A.equal(K.belegt(t) + V.MAX_COST <= 4000000, true);
});

test("drittes unbekanntes Ticket wird abgelehnt", () => {
  A.equal(sperrt(tagesEintrag({ ...beide(), "drittes": altTicket() })), true);
});

test("Ticket mit falscher Kennung wird abgelehnt", () => {
  A.equal(sperrt(tagesEintrag({ [V.ALT_TICKET]: altTicket(), "fremde-id": neuTicket() })), true);
});

test("Ticket mit falschem Run wird abgelehnt", () => {
  A.equal(sperrt(tagesEintrag(beide({}, { bezug: { version: 1, runId: "nachlauf500-99999999999",
    mandatHash: V.NEU_MANDAT_HASH, phase: "pruefung" } }))), true);
});

test("Ticket mit falschem MandatHash wird abgelehnt", () => {
  A.equal(sperrt(tagesEintrag(beide({}, { bezug: { version: 1, runId: V.NEU_BEZUG_RUN,
    mandatHash: "0".repeat(64), phase: "pruefung" } }))), true);
});

test("Ticket mit anderer Reserve wird abgelehnt", () => {
  A.equal(sperrt(tagesEintrag(beide({}, { reserved: 100000 }))), true);
});

test("Ticket mit falscher Phase oder maxOutputTokens wird abgelehnt", () => {
  A.equal(sperrt(tagesEintrag(beide({}, { bezug: { version: 1, runId: V.NEU_BEZUG_RUN,
    mandatHash: V.NEU_MANDAT_HASH, phase: "entwurf" } }))), true);
  A.equal(sperrt(tagesEintrag(beide({}, { maxOutputTokens: 2000 }))), true);
});

test("ein reserviertes Ticket wird abgelehnt", () => {
  A.equal(sperrt(tagesEintrag({ "neu-reserviert": neuTicket({ status: "reserviert" }) })), true);
  A.equal(sperrt(tagesEintrag({ ...beide(), "neu-reserviert": neuTicket({ status: "reserviert" }) })), true);
});

test("fehlt eines der zwei belegten Tickets, wird abgelehnt (fail closed)", () => {
  A.equal(sperrt(tagesEintrag({ [V.ALT_TICKET]: altTicket() })), true);
  A.equal(sperrt(tagesEintrag({ [V.NEU_TICKET]: neuTicket() })), true);
});

test("zu wenig verbleibendes Tagesbudget wird abgelehnt", () => {
  const t = tagesEintrag(beide(), { spent: 3800000, baseline: 3800000 });
  A.equal(K.belegt(t) + V.MAX_COST > 4000000, true);
  A.equal(sperrt(t), true);
});

test("Tagesriegel bleibt 4000000 und neue Reserve maximal 232000", () => {
  A.equal(K.LIMIT_MICRO_USD, 4000000);
  A.equal(V.MAX_COST, 232000);
});

test("Neue Ausgabereserve ist exakt 8000 Tokens = 232000 Mikro-USD", () => {
  A.equal(V.MAX_OUTPUT_TOKENS, 8000);
  A.equal(K.tokenKosten(400000, V.MAX_OUTPUT_TOKENS), 232000);
  A.equal(V.MAX_COST, K.tokenKosten(400000, V.MAX_OUTPUT_TOKENS));
});

test("Buch akzeptiert 8000/232000 und lehnt abweichende Ausgabegrenzen ab", () => {
  const neuerAufruf = { status: "abgerechnet", reserved: V.MAX_COST, maxOutputTokens: V.MAX_OUTPUT_TOKENS,
    manual: true, createdAt: "2026-09-21T09:39:00.000Z", cost: 0,
    bezug: { version: 1, runId: "nachlauf500-11111111111", mandatHash: "a".repeat(64), phase: "pruefung" } };
  const buch = over => tagesEintrag({ ...beide(), "neuer-aufruf": { ...neuerAufruf, ...over } }, { manualCalls: 3 });
  A.doesNotThrow(() => K.pruefeTag(buch(), V.TAG));
  for (const falsch of [{ reserved: 212000 }, { maxOutputTokens: 3000 },
    { reserved: 240000 }, { maxOutputTokens: 20000 }]) {
    A.throws(() => K.pruefeTag(buch(falsch), V.TAG), /test-usd-buch-unlesbar/,
      `Abweichung ${JSON.stringify(falsch)} nicht abgewiesen`);
  }
});

test("Timeout ist exakt gebunden: nur 120000 wird akzeptiert", () => {
  A.equal(V.KI_TIMEOUT_MS, 120000);
  const commit = "d94b0bfd06657748307b236ee253974ba57be279";
  const a = { commit, productionCommit: "bf760360ea68d4ef620a8a8f8c1b42eaa5ea182d", paketHash: "x", publicKey: "x" };
  const base = { GITHUB_REPOSITORY: "ernisch/helmut-pilot",
    GITHUB_REF: `refs/heads/${V.BRANCH}`, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_RUN_ATTEMPT: "1",
    GITHUB_SHA: commit, GITHUB_RUN_ID: "35640378598",
    SUPABASE_URL: "https://ddckuvvpcytqbyfmbvie.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "d",
    HELMUT_CRON_SECRET: "d", AZURE_OPENAI_KEY: "d", AZURE_OPENAI_ENDPOINT: "https://x.openai.azure.com",
    AZURE_OPENAI_DEPLOYMENT: "gpt-5-mini", HELMUT_STORAGE_BACKEND: "supabase", HELMUT_SUPABASE_STORE_ID: "main",
    HELMUT_SUPABASE_AUTH_STORE_ID: "main-auth", VERCEL_ENV: "production", HELMUT_TESTLAUF_KOMMUNIKATION: "gesperrt",
    HELMUT_MAX_LLM_CALLS_PER_DAY: "2416", HELMUT_LLM_RESERVE_UNDERSTANDING: "702", HELMUT_TESTLAUF_VORRANG_REAL: "200",
    HELMUT_ANBIETER_STEUERUNG: "on", HELMUT_ANBIETER_AZURE_MINUTE: "20", HELMUT_ANBIETER_AZURE_TAG: "0",
    HELMUT_KI_TIMEOUT_MS: "120000" };
  // Deterministischer Zeitpunkt am Auftragstag (TAG-Fenster bleibt erfuellt).
  const now = new Date("2026-09-21T18:00:00Z");
  A.doesNotThrow(() => V.konfiguration(a, base, now));
  for (const falsch of ["60000", "30000", "90000", "120001", "", undefined]) {
    let code = null;
    try { V.konfiguration(a, { ...base, HELMUT_KI_TIMEOUT_MS: falsch }, now); } catch (e) { code = e.code; }
    A.equal(code, "EINORDNUNG_KONFIGURATION", `Timeout ${JSON.stringify(falsch)} nicht abgewiesen`);
  }
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
