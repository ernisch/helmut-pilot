"use strict";

// Reiner Leser einer bereits gespeicherten Testfensterquittung. Die Auswahl
// bleibt auch nach dem Ende dieselbe. Keine Ableitung aus aktiven Konten,
// keine hartcodierten Bestandsmandate und kein Aktivierungsrecht.
const N = require("./testfenster-null500");
const { fordere, hash } = require("./testkohorte-direkt500");
const { assertTenant } = require("./storage");
function schluessel(laufId) {
  fordere(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(laufId || ""),
    "nachweis-testfenster-fehlt");
  return N.PREFIX + laufId;
}
function pruefeQuittung(rows, laufId) {
  const id = schluessel(laufId);
  fordere(Array.isArray(rows) && rows.length === 1 && rows[0]?.id === id,
    "nachweis-testfenster-nicht-eindeutig");
  const q = rows[0].data, m = N.pruefeManifest(q?.manifest);
  fordere(m.laufId === laufId && ["aktiv", "beendet"].includes(q.zustand)
    && q.bestaetigtAktiv === 500 && Number.isFinite(Date.parse(q.aktiviertAm))
    && Date.parse(q.aktiviertAm) >= Date.parse(m.vorflugAm)
    && Date.parse(q.aktiviertAm) < Date.parse(m.startBis)
    && (q.zustand !== "beendet" || (Number.isFinite(Date.parse(q.beendetAm))
      && Date.parse(q.beendetAm) >= Date.parse(q.aktiviertAm)
      && Number.isInteger(q.deaktiviert) && q.deaktiviert >= 0 && q.deaktiviert <= 500)), "nachweis-testfenster-abweichend");
  return q;
}
function auswahl(profile, quittung) {
  const m = N.pruefeManifest(quittung?.manifest);
  const gesamt = 500 + m.ausserhalb.length;
  fordere(Array.isArray(profile) && profile.length === gesamt
    && profile.every(p => p && typeof p.user_id === "string" && typeof p.aktiv === "boolean")
    && new Set(profile.map(p => p.user_id)).size === gesamt, "nachweis-bestand-abweichend");
  const alle = new Set(profile.map(p => p.user_id));
  fordere([...m.ids, ...m.ausserhalb].every(id => alle.has(id)), "nachweis-zielmenge-abweichend");
  m.ids.forEach(id => assertTenant(id, "testnachweisZiel500"));
  return [...m.ids];
}
async function lese({ laufId, projectUrl, key, fetchFn }) {
  const id = schluessel(laufId);
  const r = await fetchFn(projectUrl + "/rest/v1/helmut_store?select=id,data&id=eq." + id + "&limit=2", {
    method: "GET", redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json", Prefer: "count=exact" }
  });
  fordere(r.status === 200 && r.headers?.get("content-range") === "0-0/1", "nachweis-testfenster-unlesbar");
  return pruefeQuittung(await r.json(), laufId);
}
function gleich(vorher, nachher) {
  fordere(hash(vorher) === hash(nachher), "nachweis-testfenster-waehrend-lesung-veraendert");
}
module.exports = { schluessel, pruefeQuittung, auswahl, lese, gleich };
