"use strict";

// A JSON caller cannot supply this token. It is created only in the closed
// production adapter from its already admitted exact D context.
const P = require("./synthetik-500-profile");
const Dates = require("./synthetik-500-date-binding");
const EU = require("./synthetik-500-eu-service-contract");
const DiagnosticScope = require("./local-unit-diagnostic-scope");
const tokens = new WeakMap();
function create(d, plan = null) {
  const token = Object.freeze({});
  const diagnostic = DiagnosticScope.currentVerified();
  if (diagnostic !== null) {
    if (!diagnostic || diagnostic.command?.version !== "helmut-local-unit-diagnostic-command/1"
      || diagnostic.command.mode !== "D-R-1-local-fixture" || diagnostic.command.drafts?.length !== 1
      || d !== diagnostic.command.drafts[0] || plan !== diagnostic.command.slot.plan
      || !require("./synthetik-500-local-calendar").acceptsInput(diagnostic.command, d))
      throw Error("local-unit-diagnostic-lage-input-scope");
    tokens.set(token, { d: structuredClone(d), replayPlan: null,
      diagnostic: { ...diagnostic.selection } });
    return token;
  }
  const replayPlan = EU.isPlan(plan) && Dates.isHistorical(d) ? structuredClone(plan) : null;
  if (replayPlan) Dates.bind(d, replayPlan);
  tokens.set(token, { d: structuredClone(d), replayPlan });
  return token;
}
function read(token, profile) {
  const entry = token && tokens.get(token), d = entry?.d;
  if (!d || P.hash(profile) !== P.hash(d.profile)) throw Error("synthetik500-lage-input-forged-or-profile-drift");
  const diagnostic = DiagnosticScope.currentVerified();
  if (entry.diagnostic || diagnostic !== null) {
    if (!entry.diagnostic || !diagnostic
      || P.hash(entry.diagnostic) !== P.hash(diagnostic.selection)
      || diagnostic.command?.drafts?.length !== 1 || P.hash(d) !== P.hash(diagnostic.command.drafts[0])
      || !require("./synthetik-500-local-calendar").acceptsInput(diagnostic.command, diagnostic.command.drafts[0]))
      throw Error("local-unit-diagnostic-lage-input-scope");
    // Version1 keeps its original D-prompt date. The separate diagnostic
    // calendar supplies source review semantics and the fresh output day.
    return { briefingDatum: d.briefingDatum, briefingEingabe: structuredClone(d.briefingEingabe), dateBinding: null };
  }
  const dateBinding = entry.replayPlan ? Dates.assertCurrent(d, entry.replayPlan, new Date().toISOString()) : null;
  return { briefingDatum: d.briefingDatum, briefingEingabe: structuredClone(d.briefingEingabe), dateBinding };
}
module.exports = { create, read };
