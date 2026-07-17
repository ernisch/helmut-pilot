"use strict";

// Helmut — Quellenarchitektur · Landesmodul-Registry + Freigabe (Landtag-Sprint, Audit P2-1).
// =============================================================================================
// Ersetzt die bisher in source-mode.js hartkodierten Landesmodul-Konstanten durch EINE
// datenfoermige Registry und macht das harte Landesmodul-Gate PARAMETRISIERBAR:
//
// FEATURE-GUARD  HELMUT_LANDESMODULE  (Default LEER = ALLES gesperrt, byte-identisch zu heute):
//   ""                    (default) -> kein Landesmodul freigegeben. Jeder BE-/BB-Weg wird wie
//                                      bisher VOR jeder Status-/Paketpruefung ausgeschlossen.
//   "berlin"              -> NUR Berlin-Wege passieren das Gate (Paket-/Status-/Referenz-
//                            pruefungen gelten danach unveraendert — prepared-Pakete bleiben inaktiv!).
//   "berlin,brandenburg"  -> beide Landesmodule passieren das Gate.
//   Unbekannte Werte werden ignoriert (fail-closed); nur Schluessel aus LANDESMODULE wirken.
//
// WICHTIG (Sperr-Wahrheit, Phase-1-Verifikation): Das Gate ist EINE von ZWEI wirksamen
// Sperren. Auch mit Freigabe crawlt NICHTS, solange das Landespaket status='prepared' traegt
// und kein aktivierungsberechtigtes Landtagsprofil es referenziert. Der Pfad-Status
// needs_review/manual ist dokumentarisch, NICHT technisch sperrend — die Aktivierungs-
// checkliste (docs/landtag/) verlangt deshalb Status-Flips erst NACH Quellen-Review.
//
// ERWEITERUNG: Ein weiteres Bundesland = EIN neuer Registry-Eintrag (Daten) + Seeds/Pakete.
// Keine Aenderung an buildRelationalCrawlPlan oder am Crawler noetig.
//
// REINE LOGIK: kein Netz, kein Storage. Flag-Lesen ueber lib/helmut/flags.js
// (Praezedenz env > helmut-flags.json > Default; Datei-Ebene nur fuer die echte Prozess-Env).

const { flagValue } = require("../flags");

// Registry: ein Eintrag je vorbereitetem Landesmodul.
//   paketKeys      : Quellenpaket-Schluessel des Landes (source_packages.key)
//   pathPrefixes   : retrieval_paths.id-Praefixe des Landes
//   legacyPrefixes : legacy_source_id-Praefixe des Landes
//   geographyId    : geographies-Id des Landes
//   pardokLand     : Schluessel fuer den PARDOK-Dispatch/-Parser (LAND_CONFIG)
const LANDESMODULE = Object.freeze({
  berlin: Object.freeze({
    land: "berlin",
    bundesland: "Berlin",
    paketKeys: Object.freeze(["berlin-basis"]),
    pathPrefixes: Object.freeze(["rp-be-"]),
    legacyPrefixes: Object.freeze(["be-"]),
    geographyId: "geo-land-berlin",
    pardokLand: "berlin"
  }),
  brandenburg: Object.freeze({
    land: "brandenburg",
    bundesland: "Brandenburg",
    paketKeys: Object.freeze(["brandenburg-basis"]),
    pathPrefixes: Object.freeze(["rp-bb-"]),
    legacyPrefixes: Object.freeze(["bb-"]),
    geographyId: "geo-land-brandenburg",
    pardokLand: "brandenburg"
  })
});

const ALLE_LANDESMODUL_PAKET_KEYS = new Set(
  Object.values(LANDESMODULE).flatMap((m) => m.paketKeys.map((k) => k.toLowerCase()))
);

// Freigegebene Landesmodule aus dem Feature-Guard. Fail-closed: Default leer,
// unbekannte Schluessel werden ignoriert. Rueckgabe: Set der Registry-Schluessel.
function freigegebeneLandesmodule(env = process.env) {
  const raw = String(flagValue("HELMUT_LANDESMODULE", env) || "").trim().toLowerCase();
  const out = new Set();
  if (!raw) return out;
  for (const part of raw.split(/[\s,;]+/)) {
    if (part && LANDESMODULE[part]) out.add(part);
  }
  return out;
}

// Welche Landesmodule beruehrt ein Abrufweg? (Set der Registry-Schluessel; leer = keines.)
// Ein Weg kann mehreren Modulen gehoeren (rbb24 traegt berlin-basis UND brandenburg-basis).
function landesmoduleFuerPath(path = {}, packageKeysForPath = []) {
  const out = new Set();
  const id = String(path.id || "").toLowerCase();
  const legacy = String(path.legacy_source_id || "").toLowerCase();
  for (const [key, mod] of Object.entries(LANDESMODULE)) {
    if (mod.pathPrefixes.some((p) => id.startsWith(p))) { out.add(key); continue; }
    if (mod.legacyPrefixes.some((p) => legacy.startsWith(p))) { out.add(key); continue; }
    if ((packageKeysForPath || []).some((k) => mod.paketKeys.includes(String(k || "").toLowerCase()))) out.add(key);
  }
  return out;
}

// Gate-Entscheidung fuer einen Abrufweg:
//   { gesperrt: boolean, module: string[], grund: string|null }
// gesperrt=true, wenn der Weg zu >=1 Landesmodul gehoert und KEINES davon freigegeben ist.
// Gehoert der Weg mehreren Modulen (rbb24), genuegt EIN freigegebenes Modul — die weitere
// Aktivierung haengt ohnehin am jeweiligen (freigegebenen) Landespaket-Status.
function landesmodulGate(path = {}, packageKeysForPath = [], freigegeben = new Set()) {
  const module = landesmoduleFuerPath(path, packageKeysForPath);
  if (module.size === 0) return { gesperrt: false, module: [], grund: null };
  const frei = [...module].some((m) => freigegeben.has(m));
  if (frei) return { gesperrt: false, module: [...module], grund: null };
  return {
    gesperrt: true,
    module: [...module],
    grund: "landesmodul-gesperrt (Berlin/Brandenburg nur mit eigener Freigabe)"
  };
}

// Ist ein PARDOK-Land (berlin/brandenburg) fuer den Live-Betrieb freigegeben?
function istLandFreigegeben(land, env = process.env) {
  const key = String(land || "").trim().toLowerCase();
  return Boolean(LANDESMODULE[key]) && freigegebeneLandesmodule(env).has(key);
}

module.exports = {
  LANDESMODULE,
  ALLE_LANDESMODUL_PAKET_KEYS,
  freigegebeneLandesmodule,
  landesmoduleFuerPath,
  landesmodulGate,
  istLandFreigegeben
};
