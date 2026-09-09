"use strict";

// Geplantes Ende eines kurzen Funktionstests, kein Loesch- oder Restorepfad.
const { KOHORTE_KENNUNGEN, istKohortenKennung, FREIGABEWORTE } = require("./testkohorte-betrieb");
const R = require("./testkohorte-rueckbau");
const { hash, fordere, DirektAbbruch } = require("./testkohorte-direkt500");
const CONFIRM = FREIGABEWORTE.deaktivierung;

function pruefeSnapshot(s) {
  for (const [name, key] of [["mandate", "user_id"], ["identitaeten", "id"]]) {
    fordere(Array.isArray(s[name]) && s[name].every(r => r && typeof r[key] === "string")
      && new Set(s[name].map(r => r[key])).size === s[name].length, "testende-bestand-ungueltig");
  }
  fordere(Array.isArray(s.auth?.users) && s.auth.users.every(u => u && typeof u.id === "string")
    && new Set(s.auth.users.map(u => u.id)).size === s.auth.users.length, "testende-konten-ungueltig");
  const ids = [...s.mandate.map(m => m.user_id), ...s.identitaeten.map(p => p.id), ...s.auth.users.map(u => u.politicianId || "")];
  fordere(ids.every(id => !id.startsWith("test-kohorte-") || istKohortenKennung(id)), "testende-unbekannte-kohorte");
  fordere(s.mandate.length <= 504 && s.identitaeten.length <= 505 && s.auth.users.length <= 500,
    "testende-bestand-zu-gross");
  const fremde = s.mandate.filter(m => !istKohortenKennung(m.user_id));
  fordere(fremde.length === 9 && fremde.filter(m => m.aktiv === true).length === 5
    && fremde.filter(m => m.aktiv === false).length === 4, "testende-geschuetzte-profile-abweichend");
  fordere(s.mandate.every(m => typeof m.aktiv === "boolean" && m.geloescht_at === null), "testende-profilzustand-ungueltig");
  const konten = s.auth.users.filter(u => !istKohortenKennung(u.politicianId));
  const identitaeten = s.identitaeten.filter(p => !istKohortenKennung(p.id));
  fordere(konten.length === 5 && konten.filter(u => u.active === true).length === 3
    && identitaeten.length === 10, "testende-geschuetzte-konten-abweichend");
  fordere(s.auth.users.filter(u => istKohortenKennung(u.politicianId)).every(u => u.active === false
    && /@test-kohorte\.invalid$/.test(u.email)), "testende-kohortenkonto-abweichend");
  const sort = (rows, key) => [...rows].sort((a, b) => a[key].localeCompare(b[key]));
  const profile = s.mandate.map(m => { const { aktiv, updated_at, ...rest } = m; return rest; });
  const kontoInhalt = s.auth.users;
  return { aktive: s.mandate.filter(m => istKohortenKennung(m.user_id) && m.aktiv).map(m => m.user_id).sort(),
    gesamt: s.mandate.length, aktiv: s.mandate.filter(m => m.aktiv).length,
    geschuetzt: hash({ mandate: sort(fremde, "user_id"), identitaeten: sort(identitaeten, "id"), konten: sort(konten, "id") }),
    profilInhalt: hash(sort(profile, "user_id")), kontoInhalt: hash(sort(kontoInhalt, "id")),
    identitaeten: hash(sort(s.identitaeten, "id")) };
}

async function ausfuehren({ scharf = false, env = process.env, deps } = {}) {
  let versucht = 0;
  try {
    if (scharf) fordere(env.HELMUT_TESTKOHORTE_EXECUTE === "1"
      && env.HELMUT_TESTKOHORTE_CONFIRM === CONFIRM, "testende-freigabe-fehlt");
    const vor = pruefeSnapshot(await deps.snapshot());
    if (!scharf) return { ok: true, modus: "vorpruefung", gesamt: vor.gesamt,
      aktiv: vor.aktiv, zuDeaktivieren: vor.aktive.length, schreibversuche: 0 };
    let r = null;
    if (vor.aktive.length) r = await R.fuehreRueckbauAus({ kennungen: vor.aktive,
      modus: R.MODUS_SCHARF, env, deps: {
        deaktiviere: async (id) => {
          const aktuell = await deps.leseZiel(id);
          fordere(aktuell && aktuell.user_id === id && typeof aktuell.aktiv === "boolean"
            && aktuell.geloescht_at === null, "testende-ziel-vor-write-abweichend");
          if (!aktuell.aktiv) return { ok: true };
          versucht++; return deps.deaktiviere(id);
        },
        leseZustand: async (id) => {
          const row = await deps.leseZiel(id);
          fordere(row && row.user_id === id && typeof row.aktiv === "boolean" && row.geloescht_at === null,
            "testende-ziel-nicht-eindeutig");
          return { vorhanden: true, aktiv: row.aktiv };
        }
      } });
    const nach = pruefeSnapshot(await deps.snapshot());
    fordere(nach.geschuetzt === vor.geschuetzt && nach.profilInhalt === vor.profilInhalt
      && nach.kontoInhalt === vor.kontoInhalt && nach.identitaeten === vor.identitaeten && nach.gesamt === vor.gesamt,
    "testende-hat-fremde-felder-veraendert");
    return { ok: (!r || r.ok === true) && nach.aktive.length === 0,
      modus: "deaktivierung", schreibversuche: versucht,
      bestaetigtInaktiv: vor.aktive.length - nach.aktive.length,
      verbleibendAktiv: nach.aktive.length, gesamt: nach.gesamt, aktiv: nach.aktiv,
      fehlgeschlagen: r?.fehlgeschlagen || 0, automatischeWiederholung: false,
      laufendeArbeitAbgebrochen: false };
  } catch (e) {
    return { ok: false, schreibversuche: versucht, teilbestandMoeglich: versucht > 0,
      grund: e instanceof DirektAbbruch ? e.grund : "testende-lese-oder-schreibfehler", automatischeWiederholung: false };
  }
}

module.exports = { ausfuehren, pruefeSnapshot, CONFIRM, KOHORTE_KENNUNGEN };
