"use strict";

// Harte Tokenkostenreservierung fuer den bestehenden gesperrten Production Test.
// Alle Textmodellpfade benutzen ai.requestOpenAI. Keine neue Tabelle oder Migration.
// Obergrenze bewusst oberhalb Azure Global und Data Zone Standard, Stand 09.09.2026:
// 0,50 / 4,00 USD je Mio. Eingabe / Ausgabe. Keine Aenderung der Kostenhistorie.
// Vor jedem Request wird das GANZE Modellkontextlimit reserviert, kein Tokenraten.
const crypto = require("node:crypto");
const VERSION = 1;
const POLICY_VERSION = 2;
const LIMIT_MICRO_USD = 4000000;
const MAX_INPUT_TOKENS = 400000;
const MAX_OUTPUT_TOKENS = 3000;
const MAX_PENDING_MS = 5 * 60 * 1000;
const KEY = "testKostenTage";
const RATE_ID = "azure-gpt5-mini-obergrenze-20260909";
function aktiv(env = process.env) {
  return env.VERCEL_ENV === "production" && env.HELMUT_TESTLAUF_KOMMUNIKATION === "gesperrt";
}
function konfiguration(env = process.env) {
  return { version: POLICY_VERSION, aktiv: aktiv(env), limitUsd: LIMIT_MICRO_USD / 1e6,
    maxManualCalls: null, maxWindowMs: null, unbekanntBleibtReserviert: true, tarif: RATE_ID,
    eingabeUsdJeMillion: 0.5, ausgabeUsdJeMillion: 4, anbieterrechnung: false };
}
function fehler(reason) {
  const e = new Error(reason); e.code = "LLM_BUDGET_EXHAUSTED";
  e.reason = reason; e.kiNichtGesendet = true; return e;
}
function fordere(value, reason) { if (!value) throw fehler(reason); }
function tokenKosten(input, output) {
  fordere(Number.isSafeInteger(input) && input >= 0 && input <= MAX_INPUT_TOKENS
    && Number.isSafeInteger(output) && output >= 0 && output <= 128000, "test-usd-token-unbekannt");
  return Math.ceil(input / 2 + output * 4);
}
function bezugGueltig(b) {
  return b && b.version === 1 && /^nachlauf500-[0-9]{5,20}$/.test(b.runId || "")
    && Object.keys(b).every(k => ["version", "runId", "mandatHash", "phase"].includes(k))
    && (b.mandatHash === undefined || /^[a-f0-9]{64}$/.test(b.mandatHash))
    && (b.phase === undefined || (b.mandatHash !== undefined && ["entwurf", "pruefung"].includes(b.phase)));
}
function historie(auth, day, counter) {
  // Kein CLI-/Crawler-Import im KI Nutzerpfad. Fuer Geld gelten hier strengere
  // Tokenbelege als fuer eine reine Kostenprognose; niemals unbekannt als null.
  fordere(Array.isArray(auth.llmUsage) && Number.isSafeInteger(counter) && counter >= 0,
    "test-usd-historie-unvollstaendig");
  const rows = auth.llmUsage.filter(r => r?.createdAt?.slice(0, 10) === day);
  const billable = [];
  for (const r of rows) {
    if (r.keinAufruf === true) {
      fordere(r.success === false && r.callType?.startsWith("skipped-")
        && ["none", "kein-aufruf"].includes(r.model)
        && [r.estimatedCost, r.promptTokens, r.completionTokens, r.totalTokens].every(n => n === 0),
      "test-usd-historie-unvollstaendig");
    } else {
      fordere(r.model === "gpt-5-mini" && typeof r.estimatedCost === "number"
        && Number.isFinite(r.estimatedCost) && r.estimatedCost >= 0, "test-usd-historie-unvollstaendig");
      billable.push(r);
    }
  }
  fordere(billable.length === counter, "test-usd-historie-unvollstaendig");
  return billable.reduce((n, r) => n + tokenKosten(r.promptTokens, r.completionTokens), 0);
}
function pruefeTag(t, day) {
  fordere(t && t.version === VERSION && t.day === day && t.tarif === RATE_ID
    && t.limit === LIMIT_MICRO_USD && Number.isSafeInteger(t.spent) && t.spent >= 0
    && Number.isSafeInteger(t.baseline) && t.baseline >= 0
    && (t.baselineCalls === undefined || (Number.isSafeInteger(t.baselineCalls) && t.baselineCalls >= 0))
    && Number.isSafeInteger(t.manualCalls) && t.manualCalls >= 0
    && t.calls && typeof t.calls === "object" && !Array.isArray(t.calls), "test-usd-buch-unlesbar");
  fordere(Object.keys(t.calls).length <= 5000 && Object.values(t.calls).every(c => c
    && ["reserviert", "ungeklaert", "abgerechnet", "nicht-gesendet"].includes(c.status)
    && Number.isSafeInteger(c.reserved) && c.reserved > 0 && c.reserved <= 212000
    && Number.isSafeInteger(c.maxOutputTokens) && c.maxOutputTokens > 0 && c.maxOutputTokens <= MAX_OUTPUT_TOKENS
    && c.reserved === tokenKosten(MAX_INPUT_TOKENS, c.maxOutputTokens)
    && typeof c.manual === "boolean"
    && (c.bezug === undefined || (c.manual && bezugGueltig(c.bezug)))
    && Number.isFinite(Date.parse(c.createdAt))
    && (["reserviert", "ungeklaert"].includes(c.status) ? c.cost === undefined
      : Number.isSafeInteger(c.cost) && c.cost >= 0 && c.cost <= c.reserved)
    && (c.status !== "nicht-gesendet" || c.cost === 0)),
  "test-usd-buch-unlesbar");
  fordere(t.spent === t.baseline + Object.values(t.calls).reduce((n, c) => n + (c.cost || 0), 0)
    && t.manualCalls === Object.values(t.calls).filter(c => c.manual).length,
  "test-usd-buch-unlesbar");
  fordere(t.manualUntil === null || (typeof t.manualUntil === "string"
    && Number.isFinite(Date.parse(t.manualUntil)) && t.manualUntil >= day + "T00:00:00.000Z"
    && Date.parse(t.manualUntil) <= Date.parse(day + "T00:00:00Z") + 86400000), "test-usd-buch-unlesbar");
  return t;
}
function belegt(t) {
  return t.spent + Object.values(t.calls).filter(c => ["reserviert", "ungeklaert"].includes(c.status))
    .reduce((n, c) => n + c.reserved, 0);
}
function kontrolliere(auth, day, unbekannteKosten = 0, aufrufbelege = null) {
  const t = pruefeTag(auth[KEY]?.[day], day);
  fordere(t.frozen == null || t.frozen === "test-usd-ausgang-unklar", "test-usd-fremde-sperre");
  const offen = Object.values(t.calls).filter(c => ["reserviert", "ungeklaert"].includes(c.status));
  fordere(Number.isSafeInteger(unbekannteKosten) && unbekannteKosten >= 0
    && unbekannteKosten <= offen.length, "test-usd-ungeklaerte-reserve-fehlt");
  if (aufrufbelege !== null) {
    const vorherigeAufrufe = t.baselineCalls ?? (t.baseline === 0 ? 0 : null);
    fordere(Number.isSafeInteger(aufrufbelege) && aufrufbelege >= 0 && vorherigeAufrufe !== null
      && vorherigeAufrufe + Object.keys(t.calls).length >= aufrufbelege, "test-usd-reservierungsluecke");
  }
  const gebunden = belegt(t);
  fordere(gebunden <= t.limit, "test-usd-grenze-erreicht");
  return { atomarerUsdRiegel: true, limitUsd: t.limit / 1e6, gebundenUsd: gebunden / 1e6,
    offeneReserveUsd: (gebunden - t.spent) / 1e6, offeneReservierungen: offen.length,
    unbekannteVollstaendigReserviert: unbekannteKosten > 0,
    anbieterrechnung: false };
}
async function reserviere({ model, maxOutputTokens, runId = null, politicianId = null, phase = null }, deps = {}) {
  const env = deps.env || process.env;
  if (!aktiv(env)) return null;
  fordere(Boolean(env.AZURE_OPENAI_KEY) && model === "gpt-5-mini", "test-usd-modell-nicht-freigegeben");
  fordere(Number.isSafeInteger(maxOutputTokens) && maxOutputTokens > 0
    && maxOutputTokens <= MAX_OUTPUT_TOKENS, "test-usd-ausgabegrenze-ungueltig");
  const storage = deps.storage || require("./storage");
  const now = deps.now || (() => new Date());
  const start = now(), day = start.toISOString().slice(0, 10);
  const id = (deps.id || crypto.randomUUID)();
  const manual = /^nachlauf500-[0-9]{5,20}$/.test(runId || "");
  // Vor dem HTTP-Aufruf zusammen mit der Geldreserve sichern. Bei einem
  // Datenbankausfall nach der Anbieterantwort bleibt der Versuch zuordenbar.
  // Alte Tickets bleiben unveraendert; daraus wird kein Nachtrag abgeleitet.
  let bezug = null;
  if (manual) {
    bezug = { version: 1, runId };
    if (politicianId !== null) {
      fordere(typeof politicianId === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(politicianId),
        "test-usd-aufrufbezug-ungueltig");
      bezug.mandatHash = crypto.createHash("sha256").update(JSON.stringify(politicianId)).digest("hex");
    }
    if (phase !== null) bezug.phase = phase;
    fordere(bezugGueltig(bezug), "test-usd-aufrufbezug-ungueltig");
  }
  const reserved = tokenKosten(MAX_INPUT_TOKENS, maxOutputTokens);
  const ticket = { id, day, reserved, maxOutputTokens };
  // Callback bleibt frei von externen Schreibwirkungen; nur bestaetigte CAS
  // Konflikte wiederholt der bestehende Auth Schreiber. Unklarer Ausgang nie.
  try {
    const result = await storage.mutateAuthStore(async auth => {
      fordere(now().toISOString().slice(0, 10) === day, "test-usd-tageswechsel");
      auth[KEY] ||= {};
      fordere(typeof auth[KEY] === "object" && !Array.isArray(auth[KEY])
        && Object.keys(auth[KEY]).length <= 31, "test-usd-buch-unlesbar");
      if (!auth[KEY][day]) {
        fordere(Object.keys(auth[KEY]).length < 31, "test-usd-buch-voll");
        const counter = await storage.leseLlmTageszaehler(start.toISOString());
        fordere(counter?.ok === true, "test-usd-zaehler-unlesbar");
        const baseline = historie(auth, day, counter.used);
        auth[KEY][day] = { version: VERSION, day, tarif: RATE_ID, limit: LIMIT_MICRO_USD,
          spent: baseline, baseline, baselineCalls: counter.used,
          manualCalls: 0, manualUntil: null, calls: {}, frozen: null };
      }
      const t = pruefeTag(auth[KEY][day], day);
      kontrolliere(auth, day);
      // Alte v1 Sperre konservativ uebernehmen: keine Rueckerstattung und kein
      // erneuter Anbieteraufruf fuer dieses Ticket. Alle Betraege bleiben gebunden.
      const altEingefroren = t.frozen === "test-usd-ausgang-unklar";
      for (const c of Object.values(t.calls)) if (c.status === "reserviert"
        && (altEingefroren || Date.parse(c.createdAt) + MAX_PENDING_MS <= now().getTime())) c.status = "ungeklaert";
      if (altEingefroren) {
        t.fruehereSperre = { grund: t.frozen, uebernommenAm: start.toISOString(), policyVersion: POLICY_VERSION };
        t.frozen = null;
      }
      fordere(!t.calls[id], "test-usd-doppelte-reservierung");
      fordere(Object.keys(t.calls).length < 5000, "test-usd-buch-voll");
      if (belegt(t) + reserved > t.limit) return { error: "test-usd-grenze-erreicht" };
      t.calls[id] = { status: "reserviert", reserved, maxOutputTokens, manual, createdAt: start.toISOString(),
        ...(bezug ? { bezug } : {}) };
      if (manual) t.manualCalls++;
      return { ticket };
    });
    if (result.error) throw fehler(result.error);
    return result.ticket;
  } catch (e) {
    if (e?.code === "LLM_BUDGET_EXHAUSTED") throw e;
    throw fehler("test-usd-reservierung-nicht-bestaetigt");
  }
}
async function abschliessen(ticket, receipt, deps = {}) {
  if (!ticket) return;
  const storage = deps.storage || require("./storage");
  try {
    const known = await storage.mutateAuthStore(auth => {
      const t = pruefeTag(auth[KEY]?.[ticket.day], ticket.day), c = t.calls[ticket.id];
      fordere(c && c.reserved === ticket.reserved, "test-usd-reservierung-fehlt");
      if (c.status !== "reserviert") return c.status !== "ungeklaert";
      // Ein BELEGTER Widerspruch zur reservierten Obergrenze darf nicht wie
      // eine verlorene Antwort behandelt werden. Dann ist die Gelddeckung unklar.
      if ((receipt?.model && receipt.model !== "gpt-5-mini")
        || (typeof receipt?.promptTokens === "number" && receipt.promptTokens > MAX_INPUT_TOKENS)
        || (typeof receipt?.completionTokens === "number" && receipt.completionTokens > c.maxOutputTokens)) {
        t.frozen = "test-usd-beleg-obergrenze-verletzt";
        c.status = "ungeklaert";
        return false;
      }
      let cost;
      try {
        fordere(receipt?._ablage?.blob === true && receipt.model === "gpt-5-mini"
          && receipt.completionTokens <= c.maxOutputTokens, "test-usd-kostenbeleg-fehlt");
        cost = tokenKosten(receipt.promptTokens, receipt.completionTokens);
        fordere(cost <= c.reserved, "test-usd-kostenbeleg-abweichend");
      } catch {
        // Der einzelne Versuch bleibt fehlgeschlagen und voll reserviert.
        // Andere Tickets duerfen nur das danach noch freie Geld verwenden.
        c.status = "ungeklaert";
        return false;
      }
      c.status = "abgerechnet"; c.cost = cost; t.spent += cost;
      return true;
    });
    if (!known) throw new Error("test-usd-ausgang-unklar");
  } catch {
    const e = new Error("test-usd-abschluss-nicht-bestaetigt"); e.code = "TEST_USD_UNKNOWN"; throw e;
  }
}
async function nichtGesendet(ticket, error, deps = {}) {
  if (!ticket || error?.kiNichtGesendet !== true) return;
  const storage = deps.storage || require("./storage");
  await storage.mutateAuthStore(auth => {
    const t = pruefeTag(auth[KEY]?.[ticket.day], ticket.day), c = t.calls[ticket.id];
    fordere(c && c.reserved === ticket.reserved, "test-usd-reservierung-fehlt");
    if (c.status === "reserviert") { c.status = "nicht-gesendet"; c.cost = 0; }
  });
}
module.exports = { aktiv, konfiguration, reserviere, abschliessen, nichtGesendet,
  tokenKosten, pruefeTag, belegt, kontrolliere, KEY, VERSION, POLICY_VERSION, LIMIT_MICRO_USD };
