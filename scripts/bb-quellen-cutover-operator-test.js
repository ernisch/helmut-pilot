"use strict";

// Offline-Test des eng begrenzten BE/BB-Quellen-Cutover-Operators.
// KEINE DB, KEIN Netz, KEINE Production-Aktion. HTTP-Grenztests setzen nur lokale Env-Sentinels. Alle Datenzugriffe
// laufen ueber einen injizierten Fake-Store; der reale Store/Transport wird nie beruehrt.
//
// Aufruf: node scripts/bb-quellen-cutover-operator-test.js

const assert = require("assert/strict");
const operator = require("../lib/helmut/bb-quellen-cutover-operator");

let pass = 0;
let fail = 0;
// Optionaler enger Wiederholungslauf nach einer konkreten Korrektur; CI prueft standardmaessig alles.
const testFilter = process.env.BB_CUTOVER_TEST_FILTER ? new RegExp(process.env.BB_CUTOVER_TEST_FILTER) : null;
async function check(name, fn) {
  if (testFilter && !testFilter.test(name)) return;
  try { await fn(); pass += 1; console.log(`  PASS  ${name}`); }
  catch (error) { fail += 1; console.log(`  FAIL  ${name} — ${error.message}`); }
}

// envAn: Operator an (Flag) UND Laenderflag exakt berlin,brandenburg — die volle Cutover-Basis.
const envAn = { [operator.OPERATOR_FLAG]: "1", HELMUT_LANDESMODULE: "berlin,brandenburg" };
const envNurFlag = { [operator.OPERATOR_FLAG]: "1" };

// Body mit der AKTIONSSPEZIFISCHEN Bestaetigung (rein lesende Vorschau: keine).
function body(action, extra = {}) {
  const conf = operator.bestaetigungFuer(action);
  return { action, ...(conf ? { confirmation: conf } : {}), ...extra };
}

function paketZeile(def, status) {
  return { id: def.id, key: def.key, status };
}
function pfadZeile(def, status, mode) {
  return {
    id: def.id,
    publisher_id: def.publisherId,
    legacy_source_id: def.legacySourceId,
    method: def.method,
    url: def.urls[0],
    query: null,
    parser: def.parser,
    status,
    activation_mode: mode
  };
}

// Vorbereitungszustand ("vorher") ODER aktiver Zustand ("nachher").
function pakete(zustand) {
  const status = zustand === "nachher" ? "active" : "prepared";
  return operator.ZIEL_PAKETE.map((d) => paketZeile(d, d.id === "pkg-berlin-basis" ? "active" : status));
}
function pfade(zustand) {
  return operator.ZIEL_PFADE.map((d) => (zustand === "nachher"
    ? pfadZeile(d, "healthy", "auto")
    : pfadZeile(d, "needs_review", "manual")));
}
// Unabhaengig fixierter Vertragsbestand: 16 Bindungen / 15 Pfade, rbb24 in beiden Paketen.
function links() {
  const gruppen = {
    "pkg-berlin-basis": ["rp-be-landesfraktionen", "rp-be-landesparlament", "rp-be-landesregierung",
      "rp-be-plenum", "rp-be-regionale_leitmedien", "rp-be-staatskanzlei", "rp-rbb24-politik"],
    "pkg-brandenburg-basis": ["rp-bb-ausschuesse", "rp-bb-landesfraktionen", "rp-bb-landesparlament",
      "rp-bb-landesregierung", "rp-bb-ministerien", "rp-bb-partei_pilot", "rp-bb-plenum",
      "rp-bb-regionale_leitmedien", "rp-rbb24-politik"]
  };
  return Object.entries(gruppen).flatMap(([package_id, ids]) => ids.map((retrieval_path_id) => ({ package_id, retrieval_path_id })));
}
function linkedPfade(targetRows = pfade("vorher")) {
  return [...new Set(links().map((row) => row.retrieval_path_id))].map((id) => {
    const target = targetRows.find((row) => row && row.id === id);
    return { id, status: target ? target.status : "needs_review", activation_mode: target ? target.activation_mode : "manual" };
  });
}

// Fake-Store mit echtem CAS-Verhalten auf dem vollstaendigen Vorzustand. `fehltPaket`/`fehltPfad`
// erzwingen einen Teilfehler (Update trifft 0 Zeilen). `leseTransform` verdreht JEDEN
// Lese-Rueckgabewert (fuer Readback-Abweichung).
function fakeStore(opts = {}) {
  const zustand = {
    pakete: (opts.pakete || pakete("vorher")).map((r) => (r ? { ...r } : r)),
    pfade: (opts.pfade || pfade("vorher")).map((r) => (r ? { ...r } : r)),
    links: (opts.links || links()).map((l) => (l ? { ...l } : l)),
    linkedPfade: (opts.linkedPfade || linkedPfade(opts.pfade || pfade("vorher"))).map((row) => (row ? { ...row } : row))
  };
  const calls = [];
  const writes = [];
  let readCount = 0;
  const snapshot = () => ({
    pakete: zustand.pakete.map((r) => (r ? { ...r } : r)),
    pfade: zustand.pfade.map((r) => (r ? { ...r } : r)),
    links: zustand.links.map((l) => (l ? { ...l } : l)),
    linkedPfade: zustand.linkedPfade.map((row) => (row ? { ...row } : row))
  });
  return {
    calls,
    writes,
    zustand,
    async bereit() {
      calls.push("bereit");
      return opts.bereit || { ok: true, backend: "injiziert" };
    },
    async leseZielbestand() {
      calls.push("lesen");
      readCount += 1;
      if (opts.onRead) await opts.onRead({ zustand, calls, writes, readCount });
      if (opts.leseFehler) throw new Error(opts.leseFehler);
      const s = snapshot();
      return opts.leseTransform ? opts.leseTransform(s) : s;
    },
    async schreibePaketStatus({ id, erwartetStatus, neuerStatus }) {
      calls.push(`paket:${id}:${erwartetStatus}->${neuerStatus}`);
      const write = { art: "paket", id, erwartetStatus, neuerStatus };
      writes.push(write);
      if (opts.onWrite) {
        const result = await opts.onWrite({ write, zustand, calls, writes });
        if (result !== undefined) return result;
      }
      const row = zustand.pakete.find((r) => r && r.id === id);
      if (!row || row.status !== erwartetStatus || opts.fehltPaket === id) return { betroffen: 0 };
      row.status = neuerStatus;
      return { betroffen: 1 };
    },
    async schreibePfadStatus({ id, erwartetUrl, erwartetStatus, erwartetActivationMode, neuerStatus, neuerActivationMode }) {
      calls.push(`pfad:${id}:${erwartetStatus}/${erwartetActivationMode}->${neuerStatus}/${neuerActivationMode}`);
      const write = { art: "pfad", id, erwartetUrl, erwartetStatus, erwartetActivationMode, neuerStatus, neuerActivationMode };
      writes.push(write);
      if (opts.onWrite) {
        const result = await opts.onWrite({ write, zustand, calls, writes });
        if (result !== undefined) return result;
      }
      const row = zustand.pfade.find((r) => r && r.id === id);
      if (!row || row.status !== erwartetStatus || row.activation_mode !== erwartetActivationMode
        || row.url !== erwartetUrl || opts.fehltPfad === id) return { betroffen: 0 };
      row.status = neuerStatus;
      row.activation_mode = neuerActivationMode;
      const linked = zustand.linkedPfade.find((r) => r && r.id === id);
      if (linked) { linked.status = neuerStatus; linked.activation_mode = neuerActivationMode; }
      return { betroffen: 1 };
    }
  };
}

function callHandler(handler, pathname, { method = "GET", headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const request = {
      url: pathname,
      method,
      headers: { host: "localhost", ...headers },
      socket: { remoteAddress: "127.0.0.1" },
      on(event, callback) {
        if (event === "data" && body !== null) setImmediate(() => callback(Buffer.from(body)));
        if (event === "end") setImmediate(() => callback());
        return request;
      },
      once(event, callback) { return request.on(event, callback); },
      destroy() {}
    };
    let settled = false;
    const response = {
      statusCode: 0, headersSent: false, body: "",
      writeHead(status) { this.statusCode = status; this.headersSent = true; return this; },
      setHeader() { return this; }, getHeader() { return undefined; }, removeHeader() {},
      write(chunk) { this.body += String(chunk || ""); return true; },
      end(chunk) {
        if (chunk) this.body += String(chunk);
        if (!settled) { settled = true; resolve({ status: this.statusCode, body: this.body }); }
      }
    };
    try { handler(request, response); } catch (error) { reject(error); }
    setTimeout(() => { if (!settled) reject(new Error("keine Serverantwort")); }, 5000).unref?.();
  });
}

async function main() {
  console.log("Helmut — Offline-Test BE/BB-Quellen-Cutover-Operator\n");

  await check("1. ohne Operator-Flag findet keine Aktion statt", async () => {
    const store = fakeStore();
    const result = await operator.ausfuehren(body("quellen-cutover"), { env: {}, store });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "operator-flag-aus");
    assert.deepEqual(store.calls, []);
  });

  await check("2. unbekannte Aktion wird abgelehnt", async () => {
    const store = fakeStore();
    const result = await operator.ausfuehren({ action: "alles" }, { env: envAn, store });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "aktion-nicht-erlaubt");
    assert.deepEqual(store.calls, []);
  });

  await check("3. freie Request-Parameter werden fail-closed abgelehnt (kein Store-Zugriff)", async () => {
    const store = fakeStore();
    for (const extra of [{ pfade: ["rp-fremd"] }, { status: "active" }, { ids: ["x"] }, { flag: "on" }, { url: "https://x" }, { parser: "y" }]) {
      const result = await operator.ausfuehren(body("quellen-cutover", extra), { env: envAn, store });
      assert.equal(result.ok, false);
      assert.equal(result.reason, "unerlaubter-parameter");
      assert.deepEqual(result.detail.unbekannt, Object.keys(extra).sort());
    }
    assert.deepEqual(store.calls, []);
  });

  await check("4. schreibende Aktion ohne Bestaetigung wird abgelehnt", async () => {
    const store = fakeStore();
    const result = await operator.ausfuehren({ action: "quellen-cutover" }, { env: envAn, store });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "bestaetigung-fehlt");
    assert.deepEqual(store.calls, []);
  });

  await check("5. Bestaetigungen sind AKTIONSSPEZIFISCH (Cutover-Text gilt nicht fuer Rueckbau)", async () => {
    const store = fakeStore();
    const falsch = await operator.ausfuehren(
      { action: "quellen-rueckbau", confirmation: operator.BESTAETIGUNGEN["quellen-cutover"] },
      { env: envAn, store }
    );
    assert.equal(falsch.ok, false);
    assert.equal(falsch.reason, "bestaetigung-fehlt");
    assert.deepEqual(store.calls, []);
    assert.equal(operator.BESTAETIGUNGEN["quellen-cutover"] !== operator.BESTAETIGUNGEN["quellen-rueckbau"], true);
  });

  await check("6. Cutover verlangt das Laenderflag EXAKT berlin,brandenburg (0 Writes sonst)", async () => {
    for (const wert of [undefined, "", "berlin", "brandenburg", "berlin,brandenburg,hessen", "alle", "*", "berlin berlin"]) {
      const store = fakeStore();
      const env = { [operator.OPERATOR_FLAG]: "1", ...(wert === undefined ? {} : { HELMUT_LANDESMODULE: wert }) };
      const result = await operator.ausfuehren(body("quellen-cutover"), { env, store });
      assert.equal(result.ok, false, `erwartet Ablehnung fuer ${JSON.stringify(wert)}`);
      assert.equal(result.reason, "landesmodul-nicht-berlin-brandenburg");
      assert.deepEqual(store.calls, []);
    }
    assert.equal(operator.landesmodulFrei({ HELMUT_LANDESMODULE: "berlin,brandenburg" }), true);
    assert.equal(operator.landesmodulFrei({ HELMUT_LANDESMODULE: " Brandenburg , Berlin " }), true);
    assert.equal(operator.landesmodulFrei({ HELMUT_LANDESMODULE: "berlin" }), false);
  });

  await check("7. Rueckbau verlangt das Laenderflag NICHT (Sicherheitsaktion)", async () => {
    const store = fakeStore({ pakete: pakete("nachher"), pfade: pfade("nachher") });
    const result = await operator.ausfuehren(body("quellen-rueckbau"), { env: envNurFlag, store });
    assert.equal(result.ok, true);
  });

  await check("8. Vorschau ist rein lesend und meldet den vorbereiteten Zustand (0 Writes)", async () => {
    const store = fakeStore();
    const result = await operator.ausfuehren(body("quellen-vorschau"), { env: envNurFlag, store });
    assert.equal(result.ok, true);
    assert.equal(result.detail.gesamt, "vorher");
    assert.deepEqual(store.calls, ["lesen"]);
    assert.deepEqual(store.writes, []);
  });

  await check("9. Vorschau bricht bei unbekanntem/gemischtem Zustand fail-closed ab (0 Writes)", async () => {
    const unbekannt = fakeStore({ pfade: pfade("vorher").map((r) => (r.id === operator.ZIEL_PFAD_IDS[0] ? { ...r, status: "broken" } : r)) });
    const r0 = await operator.ausfuehren(body("quellen-vorschau"), { env: envNurFlag, store: unbekannt });
    assert.equal(r0.ok, false);
    assert.equal(r0.reason, "zustand-unbekannt");
    assert.deepEqual(unbekannt.writes, []);

    const mixed = fakeStore({ pfade: [pfade("vorher")[0], pfade("nachher")[1]] });
    const r1 = await operator.ausfuehren(body("quellen-vorschau"), { env: envNurFlag, store: mixed });
    assert.equal(r1.ok, false);
    assert.equal(r1.reason, "teilzustand");
    assert.deepEqual(mixed.writes, []);
  });

  await check("10. Gedriftete Abrufadresse ist Teil der Vorbedingung (0 Writes)", async () => {
    const store = fakeStore({
      pfade: pfade("vorher").map((r) => (r.id === operator.ZIEL_PFAD_IDS[0] ? { ...r, url: "https://example.invalid/presse/" } : r))
    });
    const result = await operator.ausfuehren(body("quellen-cutover"), { env: envAn, store });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "zustand-unbekannt");
    assert.deepEqual(store.calls, ["bereit", "lesen"]);
  });

  await check("11. Falscher Parser ist Teil der Vorbedingung (0 Writes)", async () => {
    const store = fakeStore({
      pfade: pfade("vorher").map((r) => (r.id === operator.ZIEL_PFAD_IDS[1] ? { ...r, parser: "fremd-parser" } : r))
    });
    const result = await operator.ausfuehren(body("quellen-cutover"), { env: envAn, store });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "zustand-unbekannt");
    assert.deepEqual(store.calls, ["bereit", "lesen"]);
  });

  await check("12. Nicht-NULL query ist Teil der Vorbedingung (0 Writes)", async () => {
    const store = fakeStore({
      pfade: pfade("vorher").map((r) => (r.id === operator.ZIEL_PFAD_IDS[0] ? { ...r, query: "fremde-suche" } : r))
    });
    const result = await operator.ausfuehren(body("quellen-cutover"), { env: envAn, store });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "zustand-unbekannt");
    assert.deepEqual(store.calls, ["bereit", "lesen"]);
  });

  await check("13. Fehlende/fremde Paketverknuepfung ist fail-closed (0 Writes)", async () => {
    const nurEine = fakeStore({ links: links().slice(0, 1) });
    const r1 = await operator.ausfuehren(body("quellen-cutover"), { env: envAn, store: nurEine });
    assert.equal(r1.ok, false);
    assert.equal(r1.reason, "zustand-unbekannt");
    assert.deepEqual(nurEine.calls, ["bereit", "lesen"]);

    const fremd = fakeStore({ links: [...links(), { package_id: "pkg-berlin-basis", retrieval_path_id: operator.ZIEL_PFAD_IDS[0] }] });
    const r2 = await operator.ausfuehren(body("quellen-cutover"), { env: envAn, store: fremd });
    assert.equal(r2.ok, false);
    assert.equal(r2.reason, "zustand-unbekannt");
    assert.deepEqual(fremd.calls, ["bereit", "lesen"]);
  });

  await check("14. Nicht eindeutige Zielzeile ist fail-closed (0 Writes)", async () => {
    const store = fakeStore({ pakete: [pakete("vorher")[0], { ...pakete("vorher")[0] }] });
    const result = await operator.ausfuehren(body("quellen-cutover"), { env: envAn, store });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "zustand-unbekannt");
    assert.deepEqual(store.calls, ["bereit", "lesen"]);
  });

  await check("14b. Zusaetzlicher aktiver Pfad eines Zielpakets blockiert den Cutover (0 Writes)", async () => {
    const store = fakeStore({
      links: [...links(), { package_id: "pkg-berlin-basis", retrieval_path_id: "rp-fremd" }],
      linkedPfade: [...linkedPfade(), { id: "rp-fremd", status: "healthy", activation_mode: "auto" }]
    });
    const result = await operator.ausfuehren(body("quellen-cutover"), { env: envAn, store });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "zustand-unbekannt");
    assert.deepEqual(store.calls, ["bereit", "lesen"]);
    assert.deepEqual(store.writes, []);
  });

  await check("15. Unbekannter/gemischter Ausgangszustand: 0 Writes", async () => {
    const archived = fakeStore({ pakete: pakete("vorher").map((r) => (r.id === operator.ZIEL_PAKET_IDS[0] ? { ...r, status: "archived" } : r)) });
    const r1 = await operator.ausfuehren(body("quellen-cutover"), { env: envAn, store: archived });
    assert.equal(r1.ok, false);
    assert.equal(r1.reason, "zustand-unbekannt");
    assert.deepEqual(archived.calls, ["bereit", "lesen"]);

    const gemischt = fakeStore({ pakete: [pakete("vorher")[0], pakete("nachher")[1]] });
    const r2 = await operator.ausfuehren(body("quellen-cutover"), { env: envAn, store: gemischt });
    assert.equal(r2.ok, false);
    assert.equal(r2.reason, "teilzustand");
    assert.deepEqual(gemischt.calls, ["bereit", "lesen"]);
  });

  await check("16. Nicht bereiter relationaler Schreibpfad blockiert ohne Write", async () => {
    const store = fakeStore({ bereit: { ok: false, grund: "relationaler-schreibpfad-nicht-konfiguriert", backend: "local" } });
    const result = await operator.ausfuehren(body("quellen-cutover"), { env: envAn, store });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "speicherpfad-nicht-bereit");
    assert.deepEqual(store.calls, ["bereit"]);
    assert.deepEqual(store.writes, []);
  });

  await check("17. Lesefehler vor dem Write blockiert ohne Write", async () => {
    const store = fakeStore({ leseFehler: "db-down" });
    const result = await operator.ausfuehren(body("quellen-cutover"), { env: envAn, store });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "lesen-fehlgeschlagen");
    assert.deepEqual(store.calls, ["bereit", "lesen"]);
    assert.deepEqual(store.writes, []);
  });

  await check("18. Cutover: Pakete VOR Pfaden, Ruecklesung NACH JEDEM Write, nur status/activation_mode", async () => {
    const store = fakeStore();
    const result = await operator.ausfuehren(body("quellen-cutover"), { env: envAn, store });
    assert.equal(result.ok, true);
    assert.deepEqual(store.calls.filter((call) => call !== "lesen" && call !== "bereit"), ["paket:pkg-brandenburg-basis:prepared->active", "pfad:rp-be-landesregierung:needs_review/manual->healthy/auto", "pfad:rp-bb-landesparlament:needs_review/manual->healthy/auto"]);
    for (let i = 0; i < store.calls.length; i += 1) {
      if (!store.calls[i].startsWith("paket:") && !store.calls[i].startsWith("pfad:")) continue;
      assert.equal(store.calls[i - 1], "lesen", "frische Bindung vor Write");
      assert.equal(store.calls[i + 1], "lesen", "Ruecklesung nach Write");
    }
    assert.deepEqual(result.detail.schritte, ["paket:pkg-brandenburg-basis", "pfad:rp-be-landesregierung", "pfad:rp-bb-landesparlament"]);
    // Nur die freigegebenen Felder wurden geschrieben; Identitaet/URL/Parser/query bleiben.
    for (const w of store.writes) {
      if (w.art === "paket") assert.deepEqual(Object.keys(w).sort(), ["art", "erwartetStatus", "id", "neuerStatus"]);
      else assert.deepEqual(Object.keys(w).sort(), ["art", "erwartetActivationMode", "erwartetStatus", "erwartetUrl", "id", "neuerActivationMode", "neuerStatus"]);
    }
    assert.ok(store.zustand.pakete.every((r) => r.status === "active"));
    assert.ok(store.zustand.pfade.every((r) => r.status === "healthy" && r.activation_mode === "auto"));
    assert.ok(store.zustand.pfade.every((r) => r.query === null && r.id && r.parser));
  });

  await check("19. Cutover ist idempotent: bereits aktiv -> kein Write", async () => {
    const store = fakeStore({ pakete: pakete("nachher"), pfade: pfade("nachher") });
    const result = await operator.ausfuehren(body("quellen-cutover"), { env: envAn, store });
    assert.equal(result.ok, true);
    assert.equal(result.detail.bereits, true);
    assert.deepEqual(store.calls, ["bereit", "lesen"]);
    assert.deepEqual(store.writes, []);
  });

  await check("20. Rueckbau: Pfade VOR Paketen (Pfade-vor-Pakete)", async () => {
    const store = fakeStore({ pakete: pakete("nachher"), pfade: pfade("nachher") });
    const result = await operator.ausfuehren(body("quellen-rueckbau"), { env: envNurFlag, store });
    assert.equal(result.ok, true);
    assert.deepEqual(store.calls.filter((call) => call !== "lesen" && call !== "bereit"), ["pfad:rp-bb-landesparlament:healthy/auto->needs_review/manual", "pfad:rp-be-landesregierung:healthy/auto->needs_review/manual", "paket:pkg-brandenburg-basis:active->prepared"]);
    for (let i = 0; i < store.calls.length; i += 1) {
      if (!store.calls[i].startsWith("paket:") && !store.calls[i].startsWith("pfad:")) continue;
      assert.equal(store.calls[i - 1], "lesen", "frische Bindung vor Write");
      assert.equal(store.calls[i + 1], "lesen", "Ruecklesung nach Write");
    }
    assert.deepEqual(store.zustand.pakete, pakete("vorher"));
    assert.ok(store.zustand.pfade.every((r) => r.status === "needs_review" && r.activation_mode === "manual"));
  });

  await check("21. Rueckbau ist idempotent: bereits vorbereitet -> kein Write", async () => {
    const store = fakeStore();
    const result = await operator.ausfuehren(body("quellen-rueckbau"), { env: envNurFlag, store });
    assert.equal(result.ok, true);
    assert.equal(result.detail.bereits, true);
    assert.deepEqual(store.calls, ["bereit", "lesen"]);
    assert.deepEqual(store.writes, []);
  });

  await check("22. Teilfehler (letzter Pfad) kompensiert nur eigene Aenderungen rueckwaerts", async () => {
    const store = fakeStore({ fehltPfad: operator.ZIEL_PFAD_IDS[1] });
    const result = await operator.ausfuehren(body("quellen-cutover"), { env: envAn, store });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "cas-fehlgeschlagen");
    assert.equal(result.detail.schritt, `pfad:${operator.ZIEL_PFAD_IDS[1]}`);
    assert.deepEqual(store.writes.map((w) => [w.id, w.neuerStatus]), [
      ["pkg-brandenburg-basis", "active"], ["rp-be-landesregierung", "healthy"],
      ["rp-bb-landesparlament", "healthy"], ["rp-be-landesregierung", "needs_review"],
      ["pkg-brandenburg-basis", "prepared"]
    ]);
    assert.equal(store.writes.some((w) => w.id === "pkg-berlin-basis"), false);
    assert.ok(result.detail.ausgleich.every((x) => x.ok));
    assert.ok(result.detail.ausgleich.every((x) => x.betroffen === 1));
    assert.deepEqual(store.zustand.pakete, pakete("vorher"));
    assert.ok(store.zustand.pfade.every((r) => r.status === "needs_review" && r.activation_mode === "manual"));
  });

  await check("23. Fremde Readback-Abweichung stoppt ohne blinde Kompensation", async () => {
    const store = fakeStore({
      leseTransform: (snapshot) => ({ ...snapshot,
        pfade: snapshot.pfade.map((r) => (r && r.id === operator.ZIEL_PFAD_IDS[1] && r.status === "healthy"
          ? { ...r, status: "needs_review" } : r))
      })
    });
    const result = await operator.ausfuehren(body("quellen-cutover"), { env: envAn, store });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "readback-abgewichen");
    assert.equal(store.writes.length, 3);
    assert.equal(store.writes.some((w) => w.id === "pkg-berlin-basis"), false);
    assert.equal(store.zustand.pakete[0].status, "active");
  });

  await check("24. Antworten sind minimal/redigiert (keine URL, Parser, Publisher, query)", async () => {
    const store = fakeStore();
    const result = await operator.ausfuehren(body("quellen-cutover"), { env: envAn, store });
    const text = JSON.stringify(result);
    for (const geheim of ["berlin.de", "landtag.brandenburg.de", "berlin-senatsquellen-kette-v1",
      "brandenburg-landtag-presse-kette-v1", "publisher-"]) {
      assert.equal(text.includes(geheim), false, `Antwort enthaelt ${geheim}`);
    }
    // Nur die freigegebenen Kennungen und Zustandsangaben.
    assert.deepEqual(Object.keys(result).sort(), ["action", "detail", "ok", "pakete", "pfade"]);
  });

  await check("25. Schreibscope ist unveraenderlich: nur Brandenburg-Paket und zwei Zielpfade", async () => {
    const store = fakeStore();
    await operator.ausfuehren(body("quellen-cutover"), { env: envAn, store });
    const erlaubte = /^(paket:pkg-brandenburg-basis|pfad:(rp-be-landesregierung|rp-bb-landesparlament)):/;
    for (const call of store.calls) {
      if (call === "bereit" || call === "lesen") continue;
      assert.ok(erlaubte.test(call), `unerlaubter Schreibzugriff: ${call}`);
    }
  });

  await check("26. HTTP-Pfad: nur Bearer-HELMUT_ADMIN_SECRET, sonst 404; POST-only", async () => {
    const old = {
      auth: process.env.HELMUT_AUTH_MODE,
      secret: process.env.HELMUT_ADMIN_SECRET,
      cron: process.env.CRON_SECRET,
      query: process.env.HELMUT_ALLOW_QUERY_SECRETS,
      flag: process.env[operator.OPERATOR_FLAG]
    };
    try {
      process.env.HELMUT_AUTH_MODE = "accounts";
      process.env.HELMUT_ADMIN_SECRET = "offline-quellen-cutover-sentinel";
      process.env.CRON_SECRET = "offline-cron-sentinel";
      process.env.HELMUT_ALLOW_QUERY_SECRETS = "true";
      process.env[operator.OPERATOR_FLAG] = "1";
      const handler = require("../server.js");
      const pfad = "/api/ops/quellen-cutover-be-bb";

      const ohneBearer = await callHandler(handler, pfad, { method: "POST", body: "{}" });
      assert.equal(ohneBearer.status, 404);

      const querySecret = await callHandler(handler, `${pfad}?secret=offline-quellen-cutover-sentinel`, { method: "POST", body: "{}" });
      assert.equal(querySecret.status, 404, "query-secret darf NICHT gelten");

      const cronBearer = await callHandler(handler, pfad, {
        method: "POST", headers: { authorization: "Bearer offline-cron-sentinel" }, body: "{}"
      });
      assert.equal(cronBearer.status, 404, "CRON_SECRET darf NICHT gelten");

      const falscherBearer = await callHandler(handler, pfad, {
        method: "POST", headers: { authorization: "Bearer falsch" }, body: "{}"
      });
      assert.equal(falscherBearer.status, 404);

      const getMitBearer = await callHandler(handler, pfad, {
        headers: { authorization: "Bearer offline-quellen-cutover-sentinel" }
      });
      assert.equal(getMitBearer.status, 405);

      const ohneBestaetigung = await callHandler(handler, pfad, {
        method: "POST",
        headers: { authorization: "Bearer offline-quellen-cutover-sentinel" },
        body: JSON.stringify({ action: "quellen-cutover" })
      });
      assert.equal(ohneBestaetigung.status, 200);
      assert.deepEqual(JSON.parse(ohneBestaetigung.body), {
        ok: false,
        action: "quellen-cutover",
        pakete: operator.ZIEL_PAKET_IDS,
        pfade: operator.ZIEL_PFAD_IDS,
        reason: "bestaetigung-fehlt"
      });
    } finally {
      for (const [key, value] of [["HELMUT_AUTH_MODE", old.auth], ["HELMUT_ADMIN_SECRET", old.secret],
        ["CRON_SECRET", old.cron], ["HELMUT_ALLOW_QUERY_SECRETS", old.query], [operator.OPERATOR_FLAG, old.flag]]) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });

  await check("27. Zielmengen und Ausgangszustaende sind exakt die freigegebenen", async () => {
    assert.deepEqual(operator.ZIEL_PAKET_IDS, ["pkg-berlin-basis", "pkg-brandenburg-basis"]);
    assert.deepEqual(operator.ZIEL_PFAD_IDS, ["rp-be-landesregierung", "rp-bb-landesparlament"]);
    const linkedVorher = linkedPfade(pfade("vorher"));
    const linkedNachher = linkedPfade(pfade("nachher"));
    assert.equal(operator.klassifiziere({ pakete: pakete("vorher"), pfade: pfade("vorher"), links: links(), linkedPfade: linkedVorher }).gesamt, "vorher");
    assert.equal(operator.klassifiziere({ pakete: pakete("nachher"), pfade: pfade("nachher"), links: links(), linkedPfade: linkedNachher }).gesamt, "nachher");
    assert.deepEqual(operator.ACTIONS, ["quellen-vorschau", "quellen-cutover", "quellen-rueckbau"]);
  });

  console.log(`\nErgebnis: ${pass} PASS, ${fail} FAIL`);
  if (fail) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { body, fakeStore, links, linkedPfade, pakete, pfade, envAn, envNurFlag };
