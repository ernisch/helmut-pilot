"use strict";

// Expliziter globaler Geldvertrag, optional getrennt von der Profilzulassung. Alte Testvertraege,
// Journale und Reserven bleiben unveraendert. Betraege intern in Mikro-USD.
const crypto = require("node:crypto");
const ENV = "HELMUT_BETRIEBSKOSTENVERTRAG_JSON", KEY = "betriebskostenBudget";
const ZULASSUNG_ENV = "HELMUT_BETRIEBSZULASSUNG_JSON";
const INPUT_TOKENS = 400000, MAX_OUTPUT_TOKENS = 8000;
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const integer = n => Number.isSafeInteger(n) && n >= 0;
function fehler(reason) {
  return Object.assign(new Error(reason), { code: "LLM_BUDGET_EXHAUSTED", reason, kiNichtGesendet: true });
}
function fordere(ok, reason) { if (!ok) throw fehler(`betriebskosten-${reason}`); }
function aktiv(env = process.env) { return Object.hasOwn(env, ENV) || Object.hasOwn(env, ZULASSUNG_ENV); }
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
// Eine separate Freigabe aendert weder Geldvertragshash noch bestehendes Buch.
// Ohne sie bleibt der streng gebundene Einprofilbetrieb rueckwaertskompatibel.
function zulassung(c, env = process.env) {
  if (!Object.hasOwn(env, ZULASSUNG_ENV)) return null;
  let a;
  try { a = JSON.parse(env[ZULASSUNG_ENV]); } catch { throw fehler("betriebskosten-zulassung-ungueltig"); }
  fordere(exakt(a, ["version", "budgetContractHash", "profileIds"]) && a.version === 1
    && a.budgetContractHash === c.contractHash && Array.isArray(a.profileIds)
    && a.profileIds.length > 0 && a.profileIds.length <= 100
    && a.profileIds.every(id => typeof id === "string" && /^[a-z0-9][a-z0-9-]{0,119}$/.test(id))
    && new Set(a.profileIds).size === a.profileIds.length, "zulassung-ungueltig");
  const canonical = { version: 1, budgetContractHash: a.budgetContractHash, profileIds: [...a.profileIds].sort() };
  return { ...canonical, contractHash: hash(canonical) };
}
function pruefeProfile(c, profiles, env = process.env) {
  fordere(Array.isArray(profiles), "aktive-profile-nicht-lesbar");
  const T = require("./tenant-context"), a = zulassung(c, env);
  if (!a) {
    const active = profiles.filter(T.isActiveMandate);
    const ids = [...new Set(active.map(p => T.slugifyTenantId(p.id)).filter(Boolean))].sort();
    fordere(ids.length === 1 && ids[0] === c.profileId, "aktive-profile-abweichend");
    return { profileIds: ids, betriebskostenProfileId: c.profileId, zulassungHash: null };
  }
  const V = require("./profile-validation");
  const eligible = profiles.filter(p => T.isActiveMandate(p) && !V.isDisabled(p) && V.validateProfile(p).usable);
  const ids = eligible.map(p => p.id).sort();
  // Eine zusaetzliche aktive zulassungsfaehige Identitaet ist keine stillschweigende
  // Freigabe. Der explizite Zulassungsvertrag muss dem tatsaechlichen Bestand entsprechen.
  fordere(new Set(ids).size === ids.length && JSON.stringify(ids) === JSON.stringify(a.profileIds),
    "aktive-profile-abweichend");
  return { profileIds: ids, betriebskostenProfileId: c.profileId, zulassungHash: a.contractHash };
}
function kosten(input, output) {
  fordere(integer(input) && input <= INPUT_TOKENS && integer(output) && output <= MAX_OUTPUT_TOKENS,
    "token-unbekannt");
  return Math.ceil(input / 2 + output * 4); // konservativ 0,50/4,00 USD je Mio.
}
function pruefeAnfrage(c, { meta, model, maxOutputTokens, runtimeRouteSnapshot, actualRequestHash }, now, env = process.env) {
  fordere(now >= c.startsAt, "noch-nicht-gestartet");
  fordere(model === c.route.model && runtimeRouteSnapshot?.provider === c.route.provider
    && runtimeRouteSnapshot.responsesUrl === c.route.responsesUrl && runtimeRouteSnapshot.model === model
    && runtimeRouteSnapshot.authMode === "api-key", "route-abweichend");
  fordere(/^[a-f0-9]{64}$/.test(actualRequestHash || "")
    && integer(maxOutputTokens) && maxOutputTokens > 0 && maxOutputTokens <= MAX_OUTPUT_TOKENS, "anfrage-ungueltig");
  fordere(meta && !meta.budgetExempt && meta.costAdmission == null && meta.costInputVersionHash == null
    && meta._synthetik500ReviewReceipt == null && !meta.pruefaufwandNachweis
    && !require("./testkosten-budget").MANUELLE_RUN_ID.test(String(meta.runId || "")), "testauftrag-gesperrt");
  const admission = zulassung(c, env), ids = admission?.profileIds || [c.profileId];
  const global = meta.politicianId == null && meta.callType === "understanding"
    && meta.pipelineStep === "understanding" && meta.betriebskostenProfileId === c.profileId;
  const personal = ids.includes(meta.politicianId)
    && (["refineBriefingItem", "parliamentAssessment", "helmutAssessment", "lageBriefing"].includes(meta.callType)
      // Nur der quellengepruefte Buero-Generator setzt diesen internen Marker.
      // Freie Kommunikationsprompts bleiben ausserhalb der Betriebsfreigabe.
      || (meta.callType === "communicationDraft" && meta.office === true));
  fordere(global || personal, "profil-oder-aufgabe-gesperrt");
  for (const key of ["profileId", "tenantId", "userId"])
    fordere(meta[key] == null || meta[key] === (admission ? (global ? null : meta.politicianId) : c.profileId),
      "profilbezug-abweichend");
  fordere(meta.betriebskostenProfileId == null || meta.betriebskostenProfileId === c.profileId,
    "profilbezug-abweichend");
}
function pruefeBuch(book, c) {
  fordere(book?.version === 1 && book.contractHash === c.contractHash && book.calls
    && typeof book.calls === "object" && !Array.isArray(book.calls) && !book.frozen, "buch-oder-vertrag-ungueltig");
  const { contractHash, ...contract } = c;
  // JSONB ordnet auch verschachtelte Schluessel um. Derselbe strikte Parser
  // wie fuer die Env kanonisiert zur bestehenden Hash-Reihenfolge; zusaetzliche
  // Felder und Inhaltsaenderungen bleiben gesperrt. Den gespeicherten Vertrag
  // auch pruefen, wenn c bei der Reservierung aus der Laufzeitkonfiguration kommt.
  fordere(vertrag({ [ENV]: JSON.stringify(contract) }).contractHash === contractHash, "vertrag-im-buch-abweichend");
  if (book.contract !== c) {
    const { contractHash: storedHash, ...storedContract } = book.contract || {};
    fordere(storedHash === contractHash
      && vertrag({ [ENV]: JSON.stringify(storedContract) }).contractHash === contractHash, "vertrag-im-buch-abweichend");
  }
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
  pruefeAnfrage(c, args, now, deps.env || process.env);
  const storage = deps.storage || require("./storage");
  let profiles;
  try { profiles = await storage.listFullProfiles(); } catch { throw fehler("betriebskosten-aktive-profile-nicht-lesbar"); }
  const admission = pruefeProfile(c, profiles, deps.env || process.env);
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
      if (admission.zulassungHash) ticket.zulassungHash = admission.zulassungHash;
      book.calls[id] = { ...ticket, status: "reserviert" };
      book.bound += reserved;
      return ticket;
    });
  } catch (e) { if (e?.code === "LLM_BUDGET_EXHAUSTED") throw e; throw fehler("betriebskosten-reservierung-unbestaetigt"); }
}
function pruefeSendung(ticket, args, deps = {}) {
  const c = vertrag(deps.env || process.env), now = (deps.now || (() => new Date()))().toISOString();
  pruefeAnfrage(c, args, now, deps.env || process.env);
  const admission = zulassung(c, deps.env || process.env);
  fordere((ticket?.zulassungHash || null) === (admission?.contractHash || null)
    && ticket?.politicianId === (args.meta?.politicianId || null)
    && ticket?.callType === args.meta?.callType && ticket?.runId === (args.meta?.runId || null)
    && ticket?.contractHash === c.contractHash && ticket.day === now.slice(0, 10)
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
module.exports = { ENV, KEY, ZULASSUNG_ENV, aktiv, vertrag, zulassung, pruefeProfile, kosten, reserviere, pruefeSendung, abschliessen, nichtGesendet, pruefeBuch };
