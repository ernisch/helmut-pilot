"use strict";

// A JSON caller cannot supply this token. It is created only in the closed
// production adapter from its already admitted exact D context.
const P = require("./synthetik-500-profile");
const Dates = require("./synthetik-500-date-binding");
const EU = require("./synthetik-500-eu-service-contract");
const tokens = new WeakMap();
function create(d, plan = null) {
  const token = Object.freeze({});
  const replayPlan = EU.isPlan(plan) && Dates.isHistorical(d) ? structuredClone(plan) : null;
  if (replayPlan) Dates.bind(d, replayPlan);
  tokens.set(token, { d: structuredClone(d), replayPlan });
  return token;
}
function bindMockSourceReplay(token, grant, selection) {
  const entry = token && tokens.get(token);
  if (!entry || entry.replayPlan) throw Error("synthetik500-lage-input-mock-binding-rejected");
  require("./synthetik-500-mock-source-replay").bindFinite(grant, token, entry.d, selection);
  return token;
}
function read(token, profile, options = {}) {
  const entry = token && tokens.get(token), d = entry?.d;
  if (!d || P.hash(profile) !== P.hash(d.profile)) throw Error("synthetik500-lage-input-forged-or-profile-drift");
  const dateBinding = entry.replayPlan ? Dates.assertCurrent(d, entry.replayPlan, new Date().toISOString()) : null;
  const sourceReplay = require("./synthetik-500-mock-source-replay").readFinite(token, d, profile, options);
  return { briefingDatum: d.briefingDatum, briefingEingabe: structuredClone(d.briefingEingabe), dateBinding,
    ...(sourceReplay ? { mockSourceReplay: sourceReplay } : {}) };
}
module.exports = { create, read, bindMockSourceReplay };
