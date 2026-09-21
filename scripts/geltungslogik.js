"use strict";

// Reiner Offline Methodenkern fuer BEREITS FORMALISIERTE Aussagen.
// Kein Parser fuer Originaltexte, keine unabhaengige Quellenfreigabe.
// Ein Modell darf seine Praemissen nicht selbst zur vertrauenswuerdigen Basis
// erklaeren. Auch ein logischer Beweis setzt die richtige Formalisierung voraus.
const { isDeepStrictEqual } = require("node:util");
const VERSION = 1;
const MAX_ATOME = 12, MAX_KNOTEN = 128, MAX_TIEFE = 16;
const KONTEXTE = Object.freeze(["behauptet", "bestaetigt", "bestreitet", "belegt",
  "zugesagt", "moeglich", "verpflichtet"]);
const exakt = (v, ks) => v !== null && typeof v === "object" && !Array.isArray(v)
  && isDeepStrictEqual(Object.keys(v).sort(), [...ks].sort());
const text = v => typeof v === "string" && v.length > 0 && v.length <= 256 && v.trim() === v;
const dicht = (v, min, max) => Array.isArray(v) && v.length >= min && v.length <= max
  && Array.from({ length:v.length }, (_, i) => Object.hasOwn(v, i)).every(Boolean);

function normalisiere(v, zustand, tiefe = 0) {
  if (++zustand.knoten > MAX_KNOTEN || tiefe > MAX_TIEFE) throw new Error("umfang");
  const sub = x => normalisiere(x, zustand, tiefe + 1);
  switch (v?.op) {
    case "atom":
      if (!exakt(v,["op","praedikat","argumente"]) || !text(v.praedikat)
        || !dicht(v.argumente,1,8) || !v.argumente.every(text)) throw new Error("schema");
      return { op:v.op, praedikat:v.praedikat, argumente:[...v.argumente] };
    case "nicht":
      if (!exakt(v,["op","inhalt"])) throw new Error("schema");
      return { op:v.op, inhalt:sub(v.inhalt) };
    case "und": case "oder":
      if (!exakt(v,["op","inhalte"]) || !dicht(v.inhalte,2,16)) throw new Error("schema");
      return { op:v.op, inhalte:v.inhalte.map(sub) };
    case "wenn":
      if (!exakt(v,["op","voraussetzung","folge"])) throw new Error("schema");
      return { op:v.op, voraussetzung:sub(v.voraussetzung), folge:sub(v.folge) };
    case "kontext":
      if (!exakt(v,["op","art","traeger","inhalt"]) || !KONTEXTE.includes(v.art)
        || !text(v.traeger)) throw new Error("schema");
      return { op:v.op, art:v.art, traeger:v.traeger, inhalt:sub(v.inhalt) };
    default: throw new Error("schema");
  }
}

// Kontextausdruecke bleiben GANZE voneinander unabhaengige Aussagen.
// Bestaetigt(A,P), Bestreitet(A,P), Moeglich(A,P) und P sind verschieden.
// Insbesondere kein Herausheben des Inhalts und keine Verteilung einer
// Verneinung ueber einen Sprecher, Belegstatus oder Modaloperator.
const atomar = x => x.op === "atom" || x.op === "kontext";
const schluessel = x => JSON.stringify(x);
function sammle(x, atome) {
  if (atomar(x)) { atome.set(schluessel(x),x); return; }
  if (x.op === "nicht") sammle(x.inhalt,atome);
  else if (x.op === "wenn") { sammle(x.voraussetzung,atome); sammle(x.folge,atome); }
  else x.inhalte.forEach(v => sammle(v,atome));
}
function werte(x, belegung) {
  if (atomar(x)) return belegung.get(schluessel(x));
  if (x.op === "nicht") return !werte(x.inhalt,belegung);
  if (x.op === "wenn") return !werte(x.voraussetzung,belegung) || werte(x.folge,belegung);
  if (x.op === "und") return x.inhalte.every(v => werte(v,belegung));
  return x.inhalte.some(v => werte(v,belegung));
}

function pruefe(eingabe) {
  const out = { version:VERSION, status:"ungeprueft", formalGetragen:false,
    gegenbeispiel:null, belegbareWelten:0, gepruefteWelten:0,
    quellenbedeutungGeprueft:false, vollstaendigeFaktenpruefung:false,
    produktpfadeGeprueft:0 };
  let ps, b;
  try {
    if (!exakt(eingabe,["praemissen","behauptung"])) throw new Error("schema");
    const { praemissen, behauptung } = eingabe;
    if (!dicht(praemissen,1,32)) throw new Error("schema");
    const zustand = { knoten:0 };
    ps = praemissen.map(p => normalisiere(p,zustand));
    b = normalisiere(behauptung,zustand);
  } catch (e) {
    return { ...out, status:"ungueltig", grund:e.message === "umfang" ? "umfang" : "schema" };
  }
  const atome = new Map();
  ps.forEach(p => sammle(p,atome)); sammle(b,atome);
  if (atome.size > MAX_ATOME) return { ...out, status:"ungeprueft", grund:"atomgrenze" };
  const keys = [...atome.keys()];
  // Vollstaendige endliche Wahrheitstafel, keine Stichprobe und keine
  // Annahme, dass nicht genannte Aussagen falsch seien.
  for (let maske = 0; maske < 2 ** keys.length; maske++) {
    const belegung = new Map(keys.map((key,i) => [key, Boolean(maske & (1 << i))]));
    out.gepruefteWelten++;
    if (!ps.every(p => werte(p,belegung))) continue;
    out.belegbareWelten++;
    if (!werte(b,belegung) && out.gegenbeispiel === null) {
      out.gegenbeispiel = keys.map(key => ({ aussage:atome.get(key), gilt:belegung.get(key) }));
    }
  }
  if (!out.belegbareWelten) return { ...out, status:"widerspruechliche-praemissen" };
  out.formalGetragen = out.gegenbeispiel === null;
  out.status = out.formalGetragen ? "formal-getragen" : "nicht-ableitbar";
  return out;
}

module.exports = { VERSION, KONTEXTE, pruefe };
