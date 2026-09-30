"use strict";

// Eng begrenzter, standardmaessig AUSgeschalteter Operatorpfad fuer den einmaligen
// Berlin-/Brandenburg-Landesnachweis. Er verwendet ausschliesslich den bereits
// getesteten Provisionierungs- und Speicherpfad: keine SQL-Abkuerzung, keine
// frei waehlbaren Mandate, keine Aktivierung im Batch und keine Modellaufrufe.

const path = require("path");
const generator = require(path.join(__dirname, "..", "..", "scripts", "bb-nachweis-importpaket-generator"));
const provisioningDefault = require("./provisioning");
const speicherpfadDefault = require("./speicherpfad-vorflug");

const OPERATOR_FLAG = "HELMUT_BB_NACHWEIS_OPERATOR";
const CONFIRMATION = "BERLIN-BRANDENBURG-NACHWEIS-20260930";
const ACTIONS = Object.freeze(["vorschau", "provisionieren", "aktivieren", "deaktivieren", "rueckbau"]);
const TARGET_IDS = Object.freeze(generator.ZIELKOLLORTE.map((entry) => entry.mandatsId));

function flagAn(value) {
  return String(value || "").trim().toLowerCase() === "1";
}

function operatorBereit(env = process.env) {
  return flagAn(env && env[OPERATOR_FLAG]);
}

function bereiteSpecsVor() {
  const quelle = generator.ladeQuelle(generator.PAKET_PFAD);
  const gebaut = generator.baueProvisionierungsSpecs(quelle, {
    quelle: { pfad: "daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json", sha256: generator.hashDateiSync(generator.PAKET_PFAD) }
  });
  if (!gebaut.ok) {
    const error = new Error("bb-nachweis-quelle-ungueltig");
    error.grund = "bb-nachweis-quelle-ungueltig";
    error.befunde = gebaut.fehler || [];
    throw error;
  }
  const specs = gebaut.spezifikation.mandate;
  const ids = specs.map((spec) => spec.id);
  if (ids.length !== TARGET_IDS.length || ids.some((id) => !TARGET_IDS.includes(id))
      || specs.some((spec) => spec.aktiv !== false || spec.importfreigegeben !== false)) {
    const error = new Error("bb-nachweis-scope-ungueltig");
    error.grund = "bb-nachweis-scope-ungueltig";
    throw error;
  }
  return specs;
}

function antwort({ ok, action, detail = null, reason = null }) {
  return {
    ok,
    action,
    kohorte: generator.KOHORTEN_NAME,
    targetIds: [...TARGET_IDS],
    ...(reason ? { reason } : {}),
    ...(detail === null ? {} : { detail })
  };
}

function istBestaetigt(body) {
  return String(body && (body.confirmation || body.bestaetigung) || "").trim() === CONFIRMATION;
}

async function ausfuehren(body = {}, deps = {}) {
  const env = deps.env || process.env;
  const action = String(body.action || "").trim().toLowerCase();
  if (!operatorBereit(env)) return antwort({ ok: false, action, reason: "operator-flag-aus" });
  if (!ACTIONS.includes(action)) return antwort({ ok: false, action, reason: "aktion-nicht-erlaubt" });
  if (!istBestaetigt(body)) return antwort({ ok: false, action, reason: "bestaetigung-fehlt" });

  const specs = (deps.bereiteSpecsVor || bereiteSpecsVor)();
  const provisioning = deps.provisioning || provisioningDefault;
  const speicherpfad = deps.speicherpfad || speicherpfadDefault;
  const vorflug = () => (deps.vorflug || speicherpfad.erzwingeSpeicherpfadOderWirf)({
    env,
    zweck: `berlin-brandenburg-nachweis:${action}`,
    verlangeProfilSchreibpfad: true
  });

  if (action === "vorschau") {
    const result = await provisioning.provisionBatch(specs, {}, { ausfuehren: false });
    return antwort({ ok: Boolean(result && result.ok), action, detail: result });
  }

  // Dieser Vorflug steht unmittelbar vor JEDEM Schreibpfad und darf nicht durch
  // einen Request-Parameter umgangen werden.
  vorflug();

  if (action === "provisionieren") {
    const result = await provisioning.provisionBatch(specs, {}, { ausfuehren: true, weiterBeiFehler: false });
    return antwort({ ok: Boolean(result && result.ok), action, detail: result });
  }

  const method = action === "aktivieren"
    ? provisioning.activateTenant
    : provisioning.deactivateTenant;
  const results = [];
  for (const id of TARGET_IDS) {
    const result = await method(id);
    results.push(result);
    if (!result || !result.ok) return antwort({ ok: false, action, detail: results, reason: "teilaktion-fehlgeschlagen" });
  }

  if (action === "rueckbau") {
    for (const id of TARGET_IDS) {
      const result = await provisioning.teardownTenant(id);
      results.push(result);
      if (!result || !result.ok) return antwort({ ok: false, action, detail: results, reason: "teilaktion-fehlgeschlagen" });
    }
  }
  return antwort({ ok: true, action, detail: results });
}

module.exports = {
  ACTIONS,
  CONFIRMATION,
  OPERATOR_FLAG,
  TARGET_IDS,
  ausfuehren,
  bereiteSpecsVor,
  istBestaetigt,
  operatorBereit
};
