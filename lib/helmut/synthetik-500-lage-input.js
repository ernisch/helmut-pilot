"use strict";

// A JSON caller cannot supply this token. It is created only in the closed
// production adapter from its already admitted exact D context.
const P = require("./synthetik-500-profile");
const tokens = new WeakMap();
function create(d) {
  const token = Object.freeze({});
  tokens.set(token, structuredClone(d));
  return token;
}
function read(token, profile) {
  const d = token && tokens.get(token);
  if (!d || P.hash(profile) !== P.hash(d.profile)) throw Error("synthetik500-lage-input-forged-or-profile-drift");
  return { briefingDatum: d.briefingDatum, briefingEingabe: structuredClone(d.briefingEingabe) };
}
module.exports = { create, read };
