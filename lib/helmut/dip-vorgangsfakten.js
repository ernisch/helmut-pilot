"use strict";

// Begrenzter unabhaengiger Fakteneingang aus amtlichen DIP Vorgangspositionen.
// Keine freie Nachrichtenauslegung und keine vollstaendige Produktfreigabe.
// Der einzige oeffentliche Eingang liest selbst vom festen amtlichen Endpunkt.
// Ein Modell darf Kennungen vorschlagen, aber weder Nutzlast noch Fachurteil liefern.
const { hash } = require("./briefing-speicher");
const BASE = "https://search.dip.bundestag.de/api/v1/vorgangsposition/";
const VERSION = 1;
const MAX_BYTES = 128000;
const MAX_POSITIONEN = 12;
const MAX_TEXT = 2400;
const objekt = v => v && typeof v === "object" && !Array.isArray(v);
const id = v => typeof v === "string" && /^[1-9]\d{0,11}$/.test(v);
function fordere(ok, grund) { if (!ok) throw new Error("dip-vorgangsfakten-" + grund); }
function text(v, max = MAX_TEXT) {
  fordere(typeof v === "string" && v.trim() && v.length <= max
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(v), "text");
  return v;
}
function datum(v) {
  fordere(typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)
    && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, "datum");
  return v;
}
function liste(v, name) {
  if (v === undefined) return [];
  fordere(Array.isArray(v) && v.length <= 40, name);
  for (let i = 0; i < v.length; i++) fordere(Object.hasOwn(v, i) && objekt(v[i]), name);
  return v;
}
function bekannteFelder(v, felder) {
  // Ein neues Schemafeld koennte eine Bedingung oder Einschraenkung sein.
  fordere(objekt(v) && Object.keys(v).every(k => felder.includes(k)), "unbekanntes-sachfeld");
}
function optional(v, k, max) { return v[k] === undefined ? null : text(v[k], max); }
const quote = v => JSON.stringify(v); // ganze Angabe, auch innere Anfuehrungszeichen eindeutig
function fundstelle(f, p) {
  fordere(objekt(f) && id(f.id) && f.dokumentart === p.dokumentart
    && f.herausgeber === p.zuordnung && datum(f.datum) === p.datum, "fundstelle");
  const u = new URL(text(f.pdf_url, 500));
  fordere(u.protocol === "https:" && u.hostname === "dserver.bundestag.de"
    && !u.username && !u.password && !u.port && !u.search
    && /^\/(?:bt[dp]|br[dp])\/\d{2}\/[^?]+\.pdf$/.test(u.pathname), "fundstellen-url");
  return { id:f.id, dokumentart:f.dokumentart, herausgeber:f.herausgeber,
    dokumentnummer:text(f.dokumentnummer, 80), datum:f.datum, pdf_url:u.href };
}

// Nur strukturelle Originalangaben, keine Aktivitaeten, Biografien oder Volltexte.
function normalisiere(p, erwartet) {
  fordere(objekt(p) && p.typ === "Vorgangsposition" && p.id === erwartet
    && id(p.vorgang_id) && ["BT", "BR"].includes(p.zuordnung)
    && ["Drucksache", "Plenarprotokoll"].includes(p.dokumentart), "position");
  datum(p.datum);
  const beschluesse = liste(p.beschlussfassung, "beschluesse").map(b => {
    bekannteFelder(b, ["beschlusstenor","seite","abstimmungsart","abstimm_ergebnis_bemerkung",
      "grundlage","dokumentnummer","mehrheit"]);
    return { beschlusstenor:text(b.beschlusstenor), dokumentnummer:optional(b,"dokumentnummer",80),
      seite:optional(b,"seite",80), abstimmungsart:optional(b,"abstimmungsart",200),
      abstimm_ergebnis_bemerkung:optional(b,"abstimm_ergebnis_bemerkung",MAX_TEXT),
      grundlage:optional(b,"grundlage",MAX_TEXT), mehrheit:optional(b,"mehrheit",200) };
  });
  const ueberweisungen = liste(p.ueberweisung, "ueberweisungen").map(u => {
    bekannteFelder(u, ["ausschuss","ausschuss_kuerzel","federfuehrung","ueberweisungsart"]);
    fordere(typeof u.federfuehrung === "boolean", "federfuehrung");
    return { ausschuss:text(u.ausschuss,300), ausschuss_kuerzel:text(u.ausschuss_kuerzel,100),
      federfuehrung:u.federfuehrung, ueberweisungsart:optional(u,"ueberweisungsart",MAX_TEXT) };
  });
  for (const k of ["fortsetzung","nachtrag"]) fordere(typeof p[k] === "boolean", k);
  return { id:p.id, vorgang_id:p.vorgang_id, titel:text(p.titel),
    vorgangsposition:text(p.vorgangsposition,500), zuordnung:p.zuordnung,
    dokumentart:p.dokumentart, dokumentdatum:p.datum, fundstelle:fundstelle(p.fundstelle,p),
    fortsetzung:p.fortsetzung, nachtrag:p.nachtrag,
    // Abstract und mitberaten werden als Kontext erhalten, nicht interpretiert.
    abstract:optional(p,"abstract",12000), beschluesse, ueberweisungen,
    mitberaten:liste(p.mitberaten,"mitberaten").map(m => {
      fordere(id(m.id),"mitberaten");
      return { id:m.id, titel:text(m.titel), vorgangsposition:text(m.vorgangsposition,500),
        vorgangstyp:text(m.vorgangstyp,500) };
    }) };
}

// Nur eine explizite Bundestagsangabe und derselbe volle Ausschussname tragen
// die enge Beziehung. Kein Themenmatch, kein Amt, keine individuelle Pflicht.
function profilSatz(p, u, profile) {
  if (!profile || p.zuordnung !== "BT") return null;
  const ebenen = [profile.parliamentType, profile.politische_ebene].filter(v => v != null);
  if (!ebenen.length || ebenen.some(v => typeof v !== "string" || v.trim().toLowerCase() !== "bundestag")) return null;
  const aus = keys => keys.flatMap(k => Array.isArray(profile[k]) ? profile[k] : []);
  const normal = [...aus(["committees","ausschuesse"]), profile.committee];
  const deputy = aus(["deputyCommittees","stellvertretende_ausschuesse"]);
  const gleich = v => typeof v === "string" && v.trim() === u.ausschuss.trim();
  const n = normal.some(gleich), d = deputy.some(gleich);
  if (n === d) return null; // weder Treffer noch widerspruechliche Rollen beglaubigen
  return `Dein Profil führt ${quote(u.ausschuss)} unter den ${d ? "stellvertretenden " : ""}Ausschussmitgliedschaften. `
    + `DIP verzeichnet zum Vorgang ${quote(p.titel)} im Schritt ${quote(p.vorgangsposition)} eine Überweisung an diesen Ausschuss, `
    + (u.federfuehrung ? "mit Federführung" : "ohne Federführung")
    + (u.ueberweisungsart ? `; Überweisungsart: ${quote(u.ueberweisungsart)}` : "") + ".";
}

function faktenFuer(p, tag, profile) {
  const vorgangId = "dip-vorgang-" + p.vorgang_id;
  const q = { id:"dip-position-" + p.id, vorgangId,
    url:p.fundstelle.pdf_url, titel:p.titel,
    // Der Beleg ist die typisierte API Antwort, nicht ein vorgetaeuschter PDF Auszug.
    auszug:JSON.stringify(p), herkunft:BASE + p.id, belegart:"amtliche-strukturierte-daten",
    dokumentdatum:p.dokumentdatum, ereignisdatum:null };
  const institution = p.zuordnung === "BT" ? "Deutschen Bundestag" : "Bundesrat";
  const zusatz = [p.fortsetzung ? "Fortsetzung" : null, p.nachtrag ? "Nachtrag" : null].filter(Boolean);
  const kontext = `DIP verzeichnet zum Vorgang ${quote(p.titel)} beim ${institution} im Schritt ${quote(p.vorgangsposition)}`
    + (zusatz.length ? ` (${zusatz.join(", ")})` : "");
  const fakten = [], trustedFreigaben = [];
  function add(art, index, zeile, formulierung) {
    // Exakte strukturierte Stelle im eigenen kanonischen Quellkontext.
    const token = JSON.stringify(zeile), von = q.auszug.indexOf(token);
    fordere(von >= 0, "belegstelle");
    const profil = art === "ueberweisung" ? profilSatz(p,zeile,profile) : null;
    const f = { id:`${q.id}-${art}-${index}`, vorgangId, quelleId:q.id, quellenHash:hash(q),
      stelle:{ feld:"auszug", von, bis:von+token.length, kontextVon:0, kontextBis:q.auszug.length },
      akteur:p.zuordnung, handlung:art, gegenstand:art === "beschlussfassung" ? zeile.dokumentnummer : null,
      aussagegrad:"amtlich-dokumentierte-Angabe", verneinung:null, zuschreibung:"DIP",
      bedingung:null, ereigniszeit:null, profilHash:profil ? hash(profile) : null,
      formulierungen:{ ereignis:formulierung, ...(profil ? { profil } : {}) } };
    fakten.push(f);
    trustedFreigaben.push({ faktId:f.id, faktHash:hash(f), pruefer:"dip-typisierter-vorgang-v1",
      nachweisHash:hash({ version:VERSION, position:p, art,index, profilHash:f.profilHash }), tag, urteil:"getragen" });
  }
  p.beschluesse.forEach((b,i) => {
    let s = `${kontext} den Beschlusstenor ${quote(b.beschlusstenor)}`;
    if (b.dokumentnummer) s += ` zur Vorlage ${quote(b.dokumentnummer)}`;
    else s += " ohne gesonderte Vorlagennummer in dieser Beschlussangabe";
    const extra = [["Abstimmungsart",b.abstimmungsart],["Ergebnisbemerkung",b.abstimm_ergebnis_bemerkung],
      ["Grundlage",b.grundlage],["Mehrheit",b.mehrheit],["Protokollseite",b.seite]]
      .filter(([,v]) => v !== null).map(([k,v]) => `${k}: ${quote(v)}`);
    if (extra.length) s += ` (${extra.join("; ")})`;
    add("beschlussfassung",i,b,s + ".");
  });
  p.ueberweisungen.forEach((u,i) => {
    let s = `${kontext} eine Überweisung an ${quote(u.ausschuss)} (${quote(u.ausschuss_kuerzel)}), `
      + (u.federfuehrung ? "mit Federführung" : "ohne Federführung");
    if (u.ueberweisungsart) s += `; Überweisungsart: ${quote(u.ueberweisungsart)}`;
    add("ueberweisung",i,u,s + ".");
  });
  return { quelle:q, fakten, trustedFreigaben };
}

async function lade(positionId) {
  const key = process.env.DIP_API_KEY;
  fordere(typeof key === "string" && key.trim(), "zugang-fehlt");
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(BASE + positionId + "?format=json", {
      headers:{ Authorization:"ApiKey " + key, Accept:"application/json" },
      redirect:"error", signal:controller.signal
    });
    fordere(response.ok, "abruf-status");
    fordere(/application\/json/i.test(response.headers.get("content-type") || ""), "antworttyp");
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    try {
      for (;;) {
        const { done,value } = await reader.read(); if (done) break;
        size += value.byteLength;
        fordere(size <= MAX_BYTES, "antwortgrenze"); chunks.push(Buffer.from(value));
      }
    } finally { await reader.cancel().catch(() => {}); }
    return normalisiere(JSON.parse(Buffer.concat(chunks).toString("utf8")),positionId);
  } catch (e) {
    // Transportfehler koennen URL/Header enthalten. Nur eigene feste Gruende weiterreichen.
    if (/^dip-vorgangsfakten-[a-z-]+$/.test(e?.message || "")) throw e;
    throw new Error("dip-vorgangsfakten-abruf-ungueltig");
  } finally { clearTimeout(timeout); }
}

async function lese({ positionIds, tag, profile = null } = {}) {
  datum(tag);
  const auswahl = structuredClone(positionIds);
  // Der kuenftige produktive Aufrufer muss das Profil aus seiner autorisierten
  // Mandatsauflösung liefern, niemals aus einem Modell oder Requestpayload.
  const profil = profile === null ? null : structuredClone(profile);
  fordere(profil === null || (objekt(profil) && typeof profil.id === "string" && profil.id.trim()), "profil");
  fordere(Array.isArray(auswahl) && auswahl.length > 0 && auswahl.length <= MAX_POSITIONEN
    && new Set(auswahl).size === auswahl.length, "auswahl");
  for (const v of auswahl) fordere(id(v), "kennung");
  // Vollstaendiger begrenzter Auftrag oder Fehler; kein Teilabruf als Vollbestand.
  const quellen = [], fakten = [], trustedFreigaben = [];
  for (const positionId of auswahl) {
    const result = faktenFuer(await lade(positionId),tag,profil);
    quellen.push(result.quelle); fakten.push(...result.fakten); trustedFreigaben.push(...result.trustedFreigaben);
  }
  return { version:VERSION, quellen, fakten, trustedFreigaben,
    umfang:"DIP Beschlusstenor und Ausschussueberweisung, keine allgemeine Interpretation",
    unbelegt:["Wirkung","Kausalitaet","individuelle-Handlung","allgemeiner-Profilbezug","Frist","Vollzug"],
    vollstaendigeFaktenpruefung:false };
}

module.exports = { VERSION, lese };
