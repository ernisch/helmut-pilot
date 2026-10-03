"use strict";

// Reiner, disjunkter Fiktionsvertrag. Keine Personendatenquelle, Konten,
// Provisionierung, Aktivierung, Nachrichtenabfrage oder Modellnutzung.
const crypto = require("node:crypto");
const VERSION = "helmut-synthetik500-profile/1";
const GENERATOR_VERSION = "helmut-synthetik500-generator/1";
const VARIANTEN = Object.freeze(["basis-v1", "kontrast-v1"]);
const VERTEILUNG = Object.freeze({ bundestag: 330, "landtag-berlin": 120, "landtag-brandenburg": 50 });
const BEREICHE = Object.freeze(["mandatsbriefing", "morgenbriefing", "lage"]);
const THEMEN = Object.freeze(["Wohnungsbau", "Digitalisierung", "Bildung", "Pflege", "Verkehr", "Energie", "Haushalt", "Umwelt"]);
const PARTEIEN = Object.freeze(["Fiktive Testpartei Alpha", "Fiktive Testpartei Beta", "Fiktive Testpartei Gamma",
  "Fiktive Testpartei Delta", "Fiktive Testpartei Epsilon", "Fiktive Testpartei Zeta"]);
const SEGMENTE = Object.freeze([
  Object.freeze({ parlament: "bundestag", kurz: "bt", name: "Bund", anzahl: 330 }),
  Object.freeze({ parlament: "landtag-berlin", kurz: "be", name: "Berlin", anzahl: 120 }),
  Object.freeze({ parlament: "landtag-brandenburg", kurz: "bb", name: "Brandenburg", anzahl: 50 })
]);
const fordere = (ok, code) => { if (!ok) throw new Error("synthetik500-" + code); };
const objekt = x => x !== null && typeof x === "object" && !Array.isArray(x);
function stabil(x) {
  if (Array.isArray(x)) return "[" + x.map(stabil).join(",") + "]";
  if (objekt(x)) return "{" + Object.keys(x).sort().map(k => JSON.stringify(k) + ":" + stabil(x[k])).join(",") + "}";
  return JSON.stringify(x);
}
const hash = x => crypto.createHash("sha256").update(stabil(x)).digest("hex");

function erzeuge(optionen = {}) {
  fordere(objekt(optionen) && [Object.prototype, null].includes(Object.getPrototypeOf(optionen))
    && Object.keys(optionen).every(k => k === "variante"), "nur-generatorparameter");
  const variante = optionen.variante === undefined ? "basis-v1" : optionen.variante;
  fordere(VARIANTEN.includes(variante), "variante-ungueltig");
  const versatz = variante === "basis-v1" ? 0 : 3;
  const profile = [];
  for (const segment of SEGMENTE) for (let i = 1; i <= segment.anzahl; i++) {
    const nummer = String(i).padStart(3, "0"), index = profile.length;
    const partei = PARTEIEN[(index + versatz) % PARTEIEN.length];
    profile.push({ mandatsId: `test-kohorte-synthetik-${segment.kurz}-${nummer}`,
      vollname: `Fiktive Testperson ${segment.name} ${nummer}`,
      parlament: segment.parlament,
      bundesland: segment.kurz === "bt" ? (i % 2 ? "Berlin" : "Brandenburg") : segment.name,
      partei, fraktion: partei,
      wahlkreis: `Fiktiver Testwahlkreis ${segment.kurz.toUpperCase()}-${nummer}`,
      themen: [THEMEN[(index + versatz) % THEMEN.length], THEMEN[(index + versatz + 3) % THEMEN.length]],
      ausschuesse: [], funktionen: [],
      synthetisch: true, aktiv: false, importfreigegeben: false,
      herkunft: { art: "deterministisch-erzeugte-fiktion", person: "vollstaendig-fiktiv", amtlicherPersonenbeleg: false },
      szenario: { variante, nummer: i, achsen: "kuenstliche-Testparameter-keine-Personenrecherche" } });
  }
  const sollpositionen = profile.flatMap(p => BEREICHE.map(bereich => ({
    mandatsId: p.mandatsId, bereich, profilHash: hash(p), status: "ausstehend", fachstatus: "ausstehend", ergebnisHash: null
  })));
  const erwartungen = { version: "helmut-synthetik500-erwartungen/1", sollpositionen,
    ueberDich: { erwartet: "leer-kein-realer-Personenbezug", status: "ausstehend", erfundenerNachrichtenbezugErlaubt: false },
    funktionsnachweis500: false, fachabnahme: false, deutschlandweiteLandesabnahme: false };
  const payload = { version: VERSION, modus: "rein-synthetische-offline-vorbereitung", synthetisch: true,
    generator: { version: GENERATOR_VERSION, variante }, verteilung: { ...VERTEILUNG },
    freigaben: { import: false, provisionierung: false, aktivierung: false, teststart: false },
    profile, erwartungen };
  return { ...payload, bindung: { idsHash: hash(profile.map(p => p.mandatsId).sort()),
    profileHash: hash(profile), erwartungenHash: hash(erwartungen), paketHash: hash(payload) } };
}

function pruefePaket(paket) {
  fordere(objekt(paket) && paket.version === VERSION && objekt(paket.generator), "paket-format");
  const erwartet = erzeuge({ variante: paket.generator.variante });
  // Keine selbst vergebenen Hashes/Marker als Herkunftsnachweis akzeptieren:
  // ausschliesslich exakt die aus geschlossenem Generator erzeugte Variante.
  fordere(hash(paket) === hash(erwartet), "paket-nicht-selbstgeneriert-oder-drift");
  return { ok: true, version: VERSION, synthetisch: true, profile: 500, aktiv: 0,
    verteilung: { ...VERTEILUNG }, sollpositionen: 1500, ausstehend: 1500, geprueft: 0,
    variante: erwartet.generator.variante, ...erwartet.bindung,
    importfreigegeben: false, aktivierungFreigegeben: false, funktionsnachweis500: false, fachabnahme: false };
}
function serialisiere(paket) {
  const meta = pruefePaket(paket);
  // Auch ein verstecktes toJSON am Eingabeobjekt darf keinen fremden Inhalt
  // in die private Datei schmuggeln: nur kanonische Neugenerierung ausgeben.
  return JSON.stringify(erzeuge({ variante: meta.variante }), null, 2) + "\n";
}
const metadaten = paket => pruefePaket(paket);
module.exports = { VERSION, GENERATOR_VERSION, VARIANTEN, VERTEILUNG, BEREICHE, hash, kanonisch: stabil, erzeuge, pruefePaket, serialisiere, metadaten };
