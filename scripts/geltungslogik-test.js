"use strict";
const assert = require("node:assert/strict");
const { pruefe } = require("./geltungslogik");
const A = (praedikat,...argumente) => ({ op:"atom",praedikat,argumente });
const N = inhalt => ({ op:"nicht",inhalt });
const K = (art,traeger,inhalt) => ({ op:"kontext",art,traeger,inhalt });
const W = (voraussetzung,folge) => ({ op:"wenn",voraussetzung,folge });
const U = (...inhalte) => ({ op:"und",inhalte });
const O = (...inhalte) => ({ op:"oder",inhalte });
const p = A("beschlossen","Programm"), q = A("umgesetzt","Programm");
let zahl = 0;
function test(name, fn) { fn(); zahl++; console.log("OK " + name); }
function pruefung(praemissen,behauptung,getragen) {
  const input = { praemissen,behauptung }, vorher = structuredClone(input);
  const r = pruefe(input);
  assert.equal(r.formalGetragen,getragen);
  assert.equal(r.quellenbedeutungGeprueft,false);
  assert.equal(r.vollstaendigeFaktenpruefung,false);
  assert.equal(r.produktpfadeGeprueft,0);
  assert.deepEqual(input,vorher);
  if (getragen) assert.equal(r.gegenbeispiel,null);
  else if (r.status === "nicht-ableitbar") {
    assert.ok(r.gegenbeispiel.length);
    // Das gespeicherte Gegenbeispiel muss selbst widerspruchsfrei alle
    // Praemissen und die Verneinung der Folgerung tragen, auch nach JSON.
    const zeugen = JSON.parse(JSON.stringify(r.gegenbeispiel))
      .map(z => z.gilt ? z.aussage : N(z.aussage));
    const belegt = pruefe({ praemissen:zeugen, behauptung:U(...praemissen,N(behauptung)) });
    assert.equal(belegt.formalGetragen,true);
  }
  return r;
}

test("Positive explizite Aussage bleibt nutzbar", () => pruefung([p],p,true));
test("Fehlender Beleg ist weder Tatsache noch Widerlegung", () => {
  pruefung([p],q,false); pruefung([p],N(q),false);
});
test("Nichtbestaetigung bewahrt den Sprecher und widerlegt den Beschluss nicht", () => {
  const fehlend = N(K("bestaetigt","Ministerium",p));
  pruefung([fehlend],fehlend,true); pruefung([fehlend],N(p),false); pruefung([fehlend],p,false);
});
test("Bestreiten ist keine objektive Nichtexistenz", () => {
  const bestreiten = K("bestreitet","Betreiber",q);
  pruefung([bestreiten],bestreiten,true); pruefung([bestreiten],N(q),false);
});
test("Nicht belegt ist nicht widerlegt", () => {
  const mitglied = A("rolle","Alex","Mitglied","Ausschuss");
  pruefung([N(K("belegt","Gastbesuch",mitglied))],N(mitglied),false);
});
test("Moeglichkeit erzeugt weder Vollzug noch Pflicht", () => {
  const moeglich = K("moeglich","Unternehmen",q);
  pruefung([moeglich],moeglich,true); pruefung([moeglich],q,false);
  pruefung([moeglich],K("verpflichtet","Unternehmen",q),false);
});
test("Notwendige Bedingung ist keine ausreichende Bedingung", () => {
  // Nur wenn P, kann Q: Moeglich(Q) impliziert P, nicht umgekehrt.
  // Die Sprachzuordnung ist HIER von Hand festgelegt, kein Parsernachweis.
  const moeglich = K("moeglich","Unternehmen",q), nurWenn = W(moeglich,p);
  pruefung([nurWenn,p],moeglich,false);
  pruefung([nurWenn,moeglich],p,true);
  pruefung([nurWenn],p,false);
});
test("Ausreichende Bedingung bleibt zusammen mit der Wirkung pruefbar", () => {
  pruefung([W(p,q),p],q,true); pruefung([W(p,q)],q,false);
  pruefung([W(p,q),q],p,false);
});
test("Ausdrueckliche Verneinung bleibt nutzbar", () => pruefung([N(p)],N(p),true));
test("Verschachtelte Zuschreibung darf nicht entfernt werden", () => {
  const z = K("behauptet","Meldung",K("bestaetigt","Ministerium",p));
  pruefung([z],z,true); pruefung([z],K("bestaetigt","Ministerium",p),false);
  pruefung([z],p,false);
});
test("Negation innen und aussen sind unterschiedliche Aussagen", () => {
  pruefung([N(K("bestaetigt","Ministerium",p))],K("bestaetigt","Ministerium",N(p)),false);
});
test("Sprecherwechsel ist keine gueltige Folgerung", () => {
  pruefung([K("behauptet","Verband A",p)],K("behauptet","Verband B",p),false);
});
test("Kritikziel ist kein Kommunikationsadressat", () => {
  pruefung([A("kritikziel","Kritik A","Forderung B")],A("adressat","Kritik A","Verband B"),false);
});
test("Beguenstigte und Antragsteller werden nicht zu Adressaten", () => {
  pruefung([A("beguenstigt","Preiswirkung","Berechtigte")],A("adressat","Aussage","Berechtigte"),false);
  pruefung([A("antragsteller","Antrag","Unternehmen")],A("adressat","Antrag","Unternehmen"),false);
});
test("Frist bleibt an Handlung und Traeger gebunden", () => {
  const frist = A("frist","Antrag","Unternehmen","2026-11-30");
  pruefung([frist],frist,true);
  pruefung([frist],A("frist","Antrag","Abgeordnete","2026-11-30"),false);
  pruefung([frist],A("frist","Beschluss","Unternehmen","2026-11-30"),false);
});
test("Profilrollen und Gremien bleiben verschieden", () => {
  const rolle = A("rolle","Alex","Stellvertretendes Mitglied","Verkehr");
  pruefung([rolle],rolle,true);
  pruefung([rolle],A("rolle","Alex","Vorsitz","Verkehr"),false);
  pruefung([rolle],A("rolle","Alex","Stellvertretendes Mitglied","Finanzen"),false);
});
test("Finanzwirkung bleibt an Betrag und Beguenstigte gebunden", () => {
  const wirkung = A("senkung","Fahrpreis","20 Euro","Berechtigte");
  pruefung([wirkung],wirkung,true);
  pruefung([wirkung],A("senkung","Fahrpreis","20 Euro","Alle"),false);
  pruefung([wirkung],A("senkung","Steuer","20 Euro","Berechtigte"),false);
});
test("Logische Varianten ausserhalb von Kontexten sind zulaessig", () => {
  pruefung([N(N(p))],p,true); pruefung([U(p,q)],U(q,p),true);
  pruefung([N(O(p,q))],U(N(p),N(q)),true);
  pruefung([O(p,q)],p,false);
});
test("Widerspruechliche Basis beglaubigt keine beliebige Aussage", () => {
  const r = pruefung([p,N(p)],q,false);
  assert.equal(r.status,"widerspruechliche-praemissen");
  assert.equal(r.belegbareWelten,0); assert.equal(r.gegenbeispiel,null);
});
test("Objektschluesselreihenfolge ist bedeutungsfrei", () => {
  pruefung([p],{ argumente:["Programm"],praedikat:"beschlossen",op:"atom" },true);
});
test("Fehlende, fremde oder duenne Eingaben werden nicht beglaubigt", () => {
  for (const input of [undefined, null, {}, { praemissen:[],behauptung:p },
    { praemissen:[p],behauptung:p,trusted:true },
    { praemissen:[p],behauptung:{ ...p,freigabe:true } },
    { praemissen:Array(1),behauptung:p },
    { praemissen:[p],behauptung:{ op:"und",inhalte:Array(2) } },
    { praemissen:[p],behauptung:A(" ","X") },
    { praemissen:[p],behauptung:K("erfunden","X",p) }]) {
    const r = pruefe(input); assert.equal(r.formalGetragen,false); assert.equal(r.status,"ungueltig");
  }
});
test("Zyklen und Tiefe enden begrenzt", () => {
  const zyklus = { op:"nicht" }; zyklus.inhalt = zyklus;
  assert.equal(pruefe({ praemissen:[p],behauptung:zyklus }).grund,"umfang");
  let tief = p; for (let i=0;i<18;i++) tief=N(tief);
  assert.equal(pruefe({ praemissen:[p],behauptung:tief }).grund,"umfang");
});
test("Obergrenze ergibt ungeprueft statt einen Teilbeweis", () => {
  const ps=Array.from({length:13},(_,i)=>A("p",String(i)));
  const r=pruefe({praemissen:ps,behauptung:ps[0]});
  assert.equal(r.status,"ungeprueft"); assert.equal(r.gepruefteWelten,0);
  assert.equal(r.formalGetragen,false);
});
test("Vollstaendige zwoelfatomige Wahrheitstafel", () => {
  const ps=Array.from({length:12},(_,i)=>A("p",String(i)));
  const r=pruefung(ps,ps[0],true);
  assert.equal(r.gepruefteWelten,4096); assert.equal(r.belegbareWelten,1);
});
console.log(`geltungslogik: ${zahl}/${zahl} Gruppen bestanden; Quelleninterpretation und Produktpfade ungeprueft.`);
