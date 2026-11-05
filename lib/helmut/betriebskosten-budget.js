"use strict";

// Separater, ausdruecklich konfigurierter Einprofil-Betrieb. Alte Testvertraege,
// Journale und Reserven bleiben unveraendert. Betraege intern in Mikro-USD.
const crypto = require("node:crypto");
const ENV = "HELMUT_BETRIEBSKOSTENVERTRAG_JSON", KEY = "betriebskostenBudget";
const INPUT_TOKENS = 400000, MAX_OUTPUT_TOKENS = 8000;
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const integer = n => Number.isSafeInteger(n) && n >= 0;
function fehler(reason) {
  return Object.assign(new Error(reason), { code: "LLM_BUDGET_EXHAUSTED", reason, kiNichtGesendet: true });
}
function fordere(ok, reason) { if (!ok) throw fehler(`betriebskosten-${reason}`); }
function aktiv(env = process.env) { return Object.hasOwn(env, ENV); }
function exakt(o, keys) { return o && typeof o === "object" && !Array.isArray(o)
  && Object.keys(o).sort().join() === [...keys].sort().join(); }
function vertrag(env = process.env) {
  let c;
  try { c = JSON.parse(env[ENV]); } catch { throw fehler("betriebskosten-vertrag-ungueltig"); }
  fordere(exakt(c, ["version", "profileId", "startsAt", "dailyLimitUsd", "totalLimitUsd", "route"])
    && c.version === 1 && typeof c.profileId === "string" && /^[a-z0-9][a-z0-9-]{0,119}$/.test(c.profileId)
    && typeof c.startsAt === "string" && Number.isFinite(Date.parse(c.startsAt))
    && new Date(c.startsAt).toISOString() === c.startsAt
    && integer(c.dailyLimitUsd * 1e6) && c.dailyLimitUsd > 0 && c.dailyLimitUsd <= 1
    && integer(c.totalLimitUsd * 1e6) && c.totalLimitUsd >= c.dailyLimitUsd && c.totalLimitUsd <= 30
    && exakt(c.route, ["provider", "responsesUrl", "model"])
    && c.route.provider === "azure" && ["gpt-5-mini", "gpt-5-mini-eu"].includes(c.route.model), "vertrag-ungueltig");
  const endpoint = require("./azure-endpunkt");
  let url;
  try { url = new URL(c.route.responsesUrl); } catch { throw fehler("betriebskosten-route-ungueltig"); }
  const base = `${url.protocol}//${url.host}`;
  fordere(endpoint.pruefeEndpunkt(base).gueltig && endpoint.baueResponsesUrl(base) === c.route.responsesUrl,
    "route-ungueltig");
  // Kanonische Reihenfolge: eine JSON-Umformatierung erzeugt keinen neuen Vertrag.
  const contract = { version: c.version, profileId: c.profileId, startsAt: c.startsAt,
    dailyLimitUsd: c.dailyLimitUsd, totalLimitUsd: c.totalLimitUsd,
    route: { provider: c.route.provider, responsesUrl: c.route.responsesUrl, model: c.route.model } };
  return { ...contract, contractHash: hash(contract) };
}
function kosten(input, output) {
  fordere(integer(input) && input <= INPUT_TOKENS && integer(output) && output <= MAX_OUTPUT_TOKENS,
    "token-unbekannt");
  return Math.ceil(input / 2 + output * 4); // konservativ 0,50/4,00 USD je Mio.
}
function pruefeAnfrage(c, { meta, model, maxOutputTokens, runtimeRouteSnapshot, actualRequestHash }, now) {
  fordere(now >= c.startsAt, "noch-nicht-gestartet");
  fordere(model === c.route.model && runtimeRouteSnapshot?.provider === c.route.provider
    && runtimeRouteSnapshot.responsesUrl === c.route.responsesUrl && runtimeRouteSnapshot.model === model
    && runtimeRouteSnapshot.authMode === "api-key", "route-abweichend");
  fordere(/^[a-f0-9]{64}$/.test(actualRequestHash || "")
    && integer(maxOutputTokens) && maxOutputTokens > 0 && maxOutputTokens <= MAX_OUTPUT_TOKENS, "anfrage-ungueltig");
  fordere(meta && !meta.budgetExempt && meta.costAdmission == null && meta.costInputVersionHash == null
    && meta._synthetik500ReviewReceipt == null && !meta.pruefaufwandNachweis
    && !require("./testkosten-budget").MANUELLE_RUN_ID.test(String(meta.runId || "")), "testauftrag-gesperrt");
  const global = meta.politicianId == null && meta.callType === "understanding"
    && meta.pipelineStep === "understanding" && meta.betriebskostenProfileId === c.profileId;
  const personal = meta.politicianId === c.profileId
    && ["refineBriefingItem", "parliamentAssessment", "helmutAssessment", "lageBriefing"].includes(meta.callType);
  fordere(global || personal, "profil-oder-aufgabe-gesperrt");
  for (const key of ["profileId", "tenantId", "userId", "betriebskostenProfileId"])
    fordere(meta[key] == null || meta[key] === c.profileId, "profilbezug-abweichend");
}
function pruefeBuch(book, c) {
  fordere(book?.version === 1 && book.contractHash === c.contractHash && book.calls
    && typeof book.calls === "object" && !Array.isArray(book.calls) && !book.frozen, "buch-oder-vertrag-ungueltig");
  const { contractHash, ...contract } = c;
  fordere(hash(contract) === contractHash, "vertrag-im-buch-abweichend");
  let total = 0;
  const days = {};
  const receipts = new Set();
  for (const [id, call] of Object.entries(book.calls)) {
    fordere(call && call.id === id && /^[a-f0-9]{64}$/.test(call.requestHash || "")
      && /^\d{4}-\d{2}-\d{2}$/.test(call.day) && call.day === call.createdAt?.slice(0, 10)
      && call.createdAt >= c.startsAt && call.model === c.route.model && integer(call.maxOutputTokens)
      && call.maxOutputTokens > 0 && call.maxOutputTokens <= MAX_OUTPUT_TOKENS
      && call.reserved === kosten(INPUT_TOKENS, call.maxOutputTokens)
      && ["reserviert", "ungeklaert", "abgerechnet", "nicht-gesendet"].includes(call.status), "buch-unlesbar");
    const settled = call.status === "abgerechnet" || call.status === "nicht-gesendet";
    if (settled) fordere(integer(call.cost) && call.cost <= call.reserved
      && (call.status !== "nicht-gesendet" || call.cost === 0), "buch-unlesbar");
    if (call.status === "abgerechnet") {
      fordere(typeof call.usageReceiptId === "string" && !receipts.has(call.usageReceiptId), "beleg-doppelt");
      receipts.add(call.usageReceiptId);
    }
    const bound = settled ? call.cost : call.reserved;
    total += bound; days[call.day] = (days[call.day] || 0) + bound;
  }
  fordere(integer(total) && book.bound === total && total <= c.totalLimitUsd * 1e6
    && Object.values(days).every(n => n <= c.dailyLimitUsd * 1e6), "buch-grenze-verletzt");
  return { total, days };
}
async function reserviere(args, deps = {}) {
  const c = vertrag(deps.env || process.env), now = (deps.now || (() => new Date()))().toISOString();
  pruefeAnfrage(c, args, now);
  const storage = deps.storage || require("./storage");
  const profiles = await require("./tenant-context").listActiveTenantIds({ listProfiles: () => storage.listFullProfiles() });
  fordere(profiles?.length === 1 && profiles[0] === c.profileId, "aktive-profile-abweichend");
  const id = crypto.randomUUID(), day = now.slice(0, 10), reserved = kosten(INPUT_TOKENS, args.maxOutputTokens);
  try {
    return await storage.mutateAuthStore(auth => {
      if (auth[KEY] == null) {
        // Keine Rueckdatierung ueber bereits erfolgte Calls: ein solcher Start
        // verlangt eine eigene belegte Uebernahme statt stiller Nullbaseline.
        fordere(Array.isArray(auth.llmUsage) && !auth.llmUsage.some(r => r.createdAt >= c.startsAt
          && r.keinAufruf !== true), "start-hat-ungebuchte-nutzung");
        auth[KEY] = { version: 1, contractHash: c.contractHash, contract: c, bound: 0, calls: {}, frozen: null };
      }
      const book = auth[KEY], bound = pruefeBuch(book, c);
      fordere(bound.total + reserved <= c.totalLimitUsd * 1e6
        && (bound.days[day] || 0) + reserved <= c.dailyLimitUsd * 1e6, "grenze-erreicht");
      fordere(Object.keys(book.calls).length < 20000 && !book.calls[id], "buch-voll");
      const ticket = { id, day, reserved, maxOutputTokens: args.maxOutputTokens, model: args.model,
        requestHash: args.actualRequestHash, createdAt: now, contractHash: c.contractHash,
        runId: args.meta.runId || null, callType: args.meta.callType, politicianId: args.meta.politicianId || null };
      book.calls[id] = { ...ticket, status: "reserviert" };
      book.bound += reserved;
      return ticket;
    });
  } catch (e) { if (e?.code === "LLM_BUDGET_EXHAUSTED") throw e; throw fehler("betriebskosten-reservierung-unbestaetigt"); }
}
function pruefeSendung(ticket, args, deps = {}) {
  const c = vertrag(deps.env || process.env), now = (deps.now || (() => new Date()))().toISOString();
  pruefeAnfrage(c, args, now);
  fordere(ticket?.contractHash === c.contractHash && ticket.day === now.slice(0, 10)
    && ticket.requestHash === args.actualRequestHash && ticket.maxOutputTokens === args.maxOutputTokens
    && ticket.model === args.model && ticket.reserved === kosten(INPUT_TOKENS, args.maxOutputTokens), "sender-abweichend");
}
async function abschliessen(ticket, receipt, deps = {}) {
  if (!ticket) return;
  const storage = deps.storage || require("./storage");
  try {
    const known = await storage.mutateAuthStore(auth => {
      const book = auth[KEY], c = book?.contract;
      pruefeBuch(book, c);
      const call = book.calls[ticket.id];
      fordere(call && call.contractHash === ticket.contractHash && call.reserved === ticket.reserved
        && call.requestHash === ticket.requestHash, "ticket-fehlt");
      if (call.status === "abgerechnet" || call.status === "nicht-gesendet") return true;
      if (call.status === "ungeklaert") return false;
      let cost;
      try {
        const usage = deps.providerUsage;
        fordere(usage && integer(usage.input_tokens) && integer(usage.output_tokens)
          && (usage.total_tokens === undefined || usage.total_tokens === usage.input_tokens + usage.output_tokens),
        "native-usage-fehlt");
        fordere(receipt?._ablage?.blob === true && typeof receipt.id === "string"
          && receipt.model === call.model && integer(receipt.promptTokens) && integer(receipt.completionTokens)
          && receipt.promptTokens === usage.input_tokens && receipt.completionTokens === usage.output_tokens
          && receipt.completionTokens <= call.maxOutputTokens
          && receipt.totalTokens === receipt.promptTokens + receipt.completionTokens
          && receipt.createdAt >= call.createdAt && receipt.runId === call.runId
          && receipt.callType === call.callType && receipt.politicianId === call.politicianId
          && !Object.values(book.calls).some(x => x.id !== call.id && x.usageReceiptId === receipt.id), "beleg-fehlt");
        const rows = (auth.llmUsage || []).filter(r => r.id === receipt.id);
        fordere(rows.length === 1 && ["model", "promptTokens", "completionTokens", "totalTokens", "createdAt", "runId", "callType", "politicianId"]
          .every(k => rows[0][k] === receipt[k]), "beleg-unbestaetigt");
        cost = kosten(receipt.promptTokens, receipt.completionTokens);
        fordere(cost <= call.reserved, "beleg-ueber-reserve");
      } catch {
        call.status = "ungeklaert";
        if ((integer(receipt?.promptTokens) && receipt.promptTokens > INPUT_TOKENS)
          || (integer(receipt?.completionTokens) && receipt.completionTokens > call.maxOutputTokens)
          || (receipt?.model && receipt.model !== call.model)) book.frozen = "beleg-obergrenze-verletzt";
        return false;
      }
      call.status = "abgerechnet"; call.cost = cost; call.usageReceiptId = receipt.id;
      book.bound -= call.reserved - cost;
      return true;
    });
    if (!known) throw new Error("unknown");
  } catch {
    throw Object.assign(new Error("betriebskosten-abschluss-unbestaetigt"), { code: "BETRIEBSKOSTEN_UNKNOWN" });
  }
}
async function nichtGesendet(ticket, error, deps = {}) {
  if (!ticket || error?.kiNichtGesendet !== true) return;
  const storage = deps.storage || require("./storage");
  await storage.mutateAuthStore(auth => {
    const book = auth[KEY]; pruefeBuch(book, book?.contract);
    const call = book.calls[ticket.id];
    fordere(call && call.requestHash === ticket.requestHash && call.reserved === ticket.reserved, "ticket-fehlt");
    if (call.status === "reserviert") { call.status = "nicht-gesendet"; call.cost = 0; book.bound -= call.reserved; }
  });
}
module.exports = { ENV, KEY, aktiv, vertrag, kosten, reserviere, pruefeSendung, abschliessen, nichtGesendet, pruefeBuch };
