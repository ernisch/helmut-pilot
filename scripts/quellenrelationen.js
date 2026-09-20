"use strict";

// Getrennter OFFLINE Methodenpruefer. Ein endlicher Referenzgraph ist keine
// automatische Fachautoritaet fuer unbekannte Quellen. Keine Runtime Imports,
// kein Modelltransport, keine trustedFreigaben und keine Produktionsschreiber.
const { isDeepStrictEqual: equal } = require("node:util");
const C = require("node:crypto");
const ARTEN = ["ursache", "bedingung", "zuschreibung", "adressat", "negation",
  "modalitaet", "koreferenz", "ereigniszeit", "ereignisort", "publikationszeit", "unbestimmt",
  "kontext", "rolle", "zeitfolge"];
const SIGNALE = [
  ["kausal", /\b(?:dadurch|deshalb|deswegen|infolgedessen|weil)\b/giu],
  ["bedingt", /\b(?:nur wenn|sofern|falls|wenn)\b/giu],
  ["negiert", /\b(?:nicht|keine[nmrs]?|weder|noch)\b/giu],
  ["modal", /\b(?:könnte[n]?|kann|können|geplant|sei)\b/giu],
  ["sprecher", /\b(?:bestreitet|behauptet|bestätigt|nennt|kritisiert)\b/giu],
  ["bezug", /\b(?:dadurch|damit|diese[rnms]?|sie|ihr)\b/giu],
  ["zeit", /\b(?:seit|nach|bis zum|vom|am)\b/giu],
  ["offen", /\b(?:offen|ungeklärt|ungewiss|aussteht|steht aus|stehen noch nicht fest|nicht angegeben|nicht genannt)\b/giu]
];
const sha = s => C.createHash("sha256").update(s).digest("hex");
const obj = x => x !== null && typeof x === "object" && !Array.isArray(x);
const keys = (x, k) => obj(x) && equal(Object.keys(x).sort(), [...k].sort());
const dicht = (a, max) => Array.isArray(a) && a.length <= max
  && Array.from({length:a.length}, (_,i) => Object.hasOwn(a,i)).every(Boolean);
function spanne(text, s) {
  return keys(s,["start","ende","text"]) && Number.isInteger(s.start) && Number.isInteger(s.ende)
    && s.start >= 0 && s.ende > s.start && s.ende <= text.length
    && typeof s.text === "string" && text.slice(s.start,s.ende) === s.text;
}
function quelleOK(q) {
  return keys(q,["id","text"]) && typeof q.id === "string" && q.id.length > 0 && q.id.length <= 128
    && typeof q.text === "string" && q.text.length > 0 && q.text.length <= 100000;
}
function fundstelle(text, wort, vorkommen = 0) {
  let start = -1;
  for (let n=0;n<=vorkommen;n++) {
    start = text.indexOf(wort,start+1);
    if (start < 0 || !wort.length) throw new Error("RELATION_SPANNE_FEHLT");
  }
  return {start,ende:start+wort.length,text:wort};
}

// Vom Kandidaten UND vom Sollgraphen unabhaengige Fundstellenliste. Sie
// weist Pruefbedarf aus, nicht die Bedeutung eines Wortes oder einen Fehler.
// Ein Wort in einem Zitat kann selbst zitierter Inhalt sein. Keine automatische
// Relation oder Freigabe daraus ableiten; keine Worttreffer als Vollabdeckung.
function pruefbedarf(q) {
  if (!quelleOK(q)) throw new Error("RELATION_QUELLE");
  const fundstellen=[];
  for (const [klasse, regex] of SIGNALE) {
    for (const m of q.text.matchAll(new RegExp(regex.source,regex.flags))) {
      fundstellen.push({klasse,start:m.index,ende:m.index+m[0].length,text:m[0]});
    }
  }
  fundstellen.sort((a,b)=>a.start-b.start || a.klasse.localeCompare(b.klasse));
  return {quelleId:q.id,quellenHash:sha(q.text),fundstellen,
    vollstaendigeErkennung:false,fachlichBestanden:false};
}
function graphFehler(q,g) {
  const fehler=[];
  if (!keys(g,["quelleId","quellenHash","knoten","relationen"]) || !dicht(g.knoten,128)
    || !dicht(g.relationen,256)) return [{typ:"graph-schema"}];
  if (g.quelleId!==q.id || g.quellenHash!==sha(q.text)) fehler.push({typ:"quellbindung"});
  const ids=new Set();
  for(let i=0;i<g.knoten.length;i++) {
    const n=g.knoten[i];
    if(!keys(n,["id","spanne"]) || typeof n.id!=="string" || !n.id.length || n.id.length>128
      || !spanne(q.text,n.spanne)) {fehler.push({typ:"knoten-schema",knoten:i});continue;}
    if(ids.has(n.id)) fehler.push({typ:"knotenkennung-doppelt",knoten:i});
    ids.add(n.id);
  }
  const beteiligt=new Set(), signaturen=new Set();
  for(let i=0;i<g.relationen.length;i++) {
    const r=g.relationen[i];
    if(!keys(r,["typ","von","nach","signale"]) || !ARTEN.includes(r.typ)
      || !ids.has(r.von) || !ids.has(r.nach) || r.von===r.nach
      || !dicht(r.signale,8) || !r.signale.length || !r.signale.every(s=>spanne(q.text,s))) {
      fehler.push({typ:"relation-schema",relation:i});continue;
    }
    const ss=r.signale.map(s=>`${s.start}:${s.ende}`);
    if(new Set(ss).size!==ss.length) fehler.push({typ:"signal-doppelt",relation:i});
    beteiligt.add(r.von);beteiligt.add(r.nach);
    const signatur=JSON.stringify([r.typ,r.von,r.nach,[...ss].sort()]);
    if(signaturen.has(signatur)) fehler.push({typ:"relation-doppelt",relation:i});
    signaturen.add(signatur);
  }
  for(const id of ids) if(!beteiligt.has(id)) fehler.push({typ:"knoten-ohne-relation",id});
  return fehler;
}
function signatur(g,r) {
  const node=id=>g.knoten.find(n=>n.id===id).spanne;
  const s=x=>[x.start,x.ende,x.text];
  return JSON.stringify([r.typ,s(node(r.von)),s(node(r.nach)),r.signale.map(s).sort((a,b)=>a[0]-b[0] || a[1]-b[1])]);
}
function offeneSignale(q,g) {
  const bedarf=pruefbedarf(q);
  return bedarf.fundstellen.filter(f=>!g.relationen.some(r=>r.signale.some(s=>s.start<=f.start && s.ende>=f.ende)));
}

// Die Referenz wird ausschliesslich aus der separat versionierten Offline
// Messvorschrift geladen. Niemals Modellantwort/Request als Referenz einsetzen.
// Gleichheit prueft Typ UND beide Endpunkte UND Signalpositionen, nicht nur
// Vorkommen des Wortes dadurch irgendwo in einer unverbundenen Textliste.
function vergleiche(q,kandidat,referenz) {
  if(!quelleOK(q)) throw new Error("RELATION_QUELLE");
  const out={quelleId:q.id,quellenHash:sha(q.text),schemaFehler:[],fehlend:[],zusaetzlich:[],
    referenzgleich:false,referenzbedarfOffen:[],kandidatenbedarfOffen:[],
    fachlichBestanden:false,vollstaendigeFaktenpruefung:false,produktpfadeGeprueft:0};
  const rf=graphFehler(q,referenz);
  if(rf.length) throw new Error("RELATION_REFERENZ_UNGUELTIG:"+JSON.stringify(rf));
  out.referenzbedarfOffen=offeneSignale(q,referenz);
  out.schemaFehler=graphFehler(q,kandidat);
  if(out.schemaFehler.length) return out;
  out.kandidatenbedarfOffen=offeneSignale(q,kandidat);
  const soll=referenz.relationen.map(r=>signatur(referenz,r));
  const ist=kandidat.relationen.map(r=>signatur(kandidat,r));
  const verwendet=new Set();
  for(let i=0;i<soll.length;i++) {
    const j=ist.findIndex((s,j)=>s===soll[i]&&!verwendet.has(j));
    if(j===-1) out.fehlend.push({index:i,relation:structuredClone(referenz.relationen[i])});
    else verwendet.add(j);
  }
  ist.forEach((_,i)=>{if(!verwendet.has(i))out.zusaetzlich.push({index:i,relation:structuredClone(kandidat.relationen[i])});});
  out.referenzgleich=!out.fehlend.length&&!out.zusaetzlich.length;
  // Das ist KEIN semantisches Falschurteil. Andere richtige Zerlegung oder
  // Originalspannen werden separat gesichtet; die Messvorschrift bleibt fest.
  out.vergleichsurteil=out.referenzgleich?"gleiche-referenzrelationen":"ungeklaerte-relationsabweichung";
  return out;
}

module.exports={ARTEN,sha,fundstelle,pruefbedarf,graphFehler,vergleiche};
