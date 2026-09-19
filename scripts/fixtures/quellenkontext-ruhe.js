"use strict";
const { welt, kopie } = require("./direkt500");
const D = require("../../lib/helmut/testkohorte-direkt500");
const P = require("../../lib/helmut/provisioning");
const S = require("../../lib/helmut/storage");
const { baueKohorte } = require("../../lib/helmut/test-kohorte-500");
function bestand() {
  const s = welt().snapshot();
  for (const spec of baueKohorte().filter(p => D.KENNUNGEN.includes(p.id))) {
    const p = P.buildProfile(spec, { aktiv: false });
    s.mandate.push({ user_id: spec.id, ...S.toMandateProfileRow(p) });
    s.identitaeten.push({ id: spec.id, name: spec.name, email: spec.email });
    s.auth.users.push({ id: "konto-" + spec.id, politicianId: spec.id, email: spec.email,
      role: "abgeordneter", active: false });
  }
  s.mandate.forEach(m => { m.aktiv = false; });
  s.auth.sessions = [{ id: "offline-session", expiresAt: "2026-10-01T00:00:00Z" }];
  s.auth.passwordTokens = [];
  s.main.rawItems = [];
  return kopie(s);
}
const auswahl = ["bestand-0", "bestand-1", "bestand-2", "bestand-3", "bestand-4"];
module.exports = { bestand, auswahl };
