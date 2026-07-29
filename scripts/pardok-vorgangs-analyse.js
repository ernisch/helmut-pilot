"use strict";

// Helmut — Berliner PARDOK-<Vorgang>-Analyse (Roadmap-Punkt 24, Abschlussschritt).
// =============================================================================================
// WOFUER: Die Struktur-Sonde (pardok-structure-probe.js) liefert ein FELD-INVENTAR und
// Beispiel-Records. Sie kann damit sagen, WELCHE Felder vorkommen — aber nicht, WIE Vorgaenge und
// Dokumente zueinander stehen. Genau diese Fragen sind fuer einen belastbaren Vorgangsbezug
// entscheidend und waren bisher unbeantwortet:
//
//   1. Ist <VNr> eine stabile, eindeutige externe Vorgangskennung?
//   2. Wie verhaelt sich <VID> zu <VNr> — immer gleich, oder gibt es Abweichungen?
//   3. Wie viele <Dokument> traegt ein Vorgang wirklich (Verteilung, nicht Beispiel)?
//   4. KANN DASSELBE DOKUMENT (<DBID>) UNTER MEHREREN <VNr> AUFTAUCHEN?  <-- die kritische Frage
//   5. Gibt es Dokumente ohne Vorgangsrahmen?
//   6. Gibt es Vorgaenge ohne Kennung, oder widerspruechliche Kennungen?
//   7. Welche Feldnamen sind bisher nicht erklaert?
//
// Frage 4 entscheidet, ob ein DETERMINISTISCHER Bezug ueberhaupt zulaessig ist: waere die
// Beziehung n:m, waere `vorgangsnummer` am Dokument eine willkuerliche Auswahl — also genau die
// Art stiller Falschaussage, die dieses Projekt nicht produzieren darf.
//
// DIAGNOSEWERKZEUG, KEIN TEST. Bewusst NICHT `*-test.js` benannt: der Offline-Runner sammelt
// diese Datei damit nicht ein, und die Offline-Suite bleibt netzfrei. Nur LESENDE HTTPS-Abrufe,
// kein Storage, keine DB, kein LLM, keine Secrets, keine Production-Beruehrung.
//
// Aufruf:  node scripts/pardok-vorgangs-analyse.js [--out pardok-vorgangs-analyse.json]
// Umfang:  PVA_RECORDS (Default 4000 <Vorgang>-Records)

const fs = require("fs");
const { httpProbe, controlOkFromProbes } = require("./sprint9b-verify-abrufwege");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");

const MAX_RECORDS = Number(process.env.PVA_RECORDS || 4000);
const CONTROL_URLS = ["https://example.com/", "https://www.google.com/"];

// Feldnamen, deren Bedeutung durch echte Datensaetze oder bestehende Doku belegt ist
// (docs/quellenarchitektur/17-pardok-parser.md Teil A/B). Alles andere wird als UNERKLAERT
// gemeldet — es wird ausdruecklich KEINE Bedeutung aus dem Namen abgeleitet.
const ERKLAERTE_FELDER = new Set([
  "Vorgang", "VNr", "VID", "VFunktion", "ReihNr", "VTyp", "VTypL", "VSys", "VSysL", "VIR",
  "Nebeneintrag", "Desk", "Abstract",
  "Dokument", "DBID", "DHerk", "DHerkL", "Wp", "DokArt", "DokArtL", "DokTyp", "DokTypL",
  "DokNr", "NrInTyp", "DokDat", "Titel", "LokURL", "Urheber", "Redner", "Sb", "Su",
  "VkDat", "HNr", "Jg", "FundSt", "BText"
]);

function feld(xml, name) {
  const m = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, "i").exec(xml);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}
function alleFelder(xml, name) {
  const out = []; const re = new RegExp(`<(?:[\\w.-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${name}>`, "gi");
  let m; while ((m = re.exec(xml)) !== null) out.push(m[1].replace(/\s+/g, " ").trim());
  return out;
}
function bloecke(xml, tag, limit) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${tag}(?:\\s[^>]*)?>[\\s\\S]*?</(?:[\\w.-]+:)?${tag}>`, "g");
  const out = []; let m;
  while ((m = re.exec(xml)) !== null) { out.push(m[0]); if (limit && out.length >= limit) break; }
  return out;
}

// XML-Kommentare ENTFERNEN, bevor irgendetwas gezaehlt wird. Ohne das zieht ein `<Vorgang>` im
// Prosatext eines Kommentars den Blockmatch bis zum ersten echten `</Vorgang>` und verfaelscht
// jede Kennzahl (im Selbsttest gegen die eigene Fixture aufgefallen: ein Scheinfeld `Export`).
function ohneKommentare(xml) {
  return String(xml).replace(/<!--[\s\S]*?-->/g, "");
}

function analysiere(rohBody) {
  const body = ohneKommentare(rohBody);
  const vorgaenge = bloecke(body, "Vorgang", MAX_RECORDS);
  const r = {
    vorgaengeGelesen: vorgaenge.length,
    deleteStubs: 0,
    ohneDokument: 0,
    mitDokument: 0,
    vnrVorhanden: 0, vidVorhanden: 0, vnrGleichVid: 0, vnrUngleichVid: 0, beispieleVnrUngleichVid: [],
    vtypVorhanden: 0,
    ohneVnr: 0, beispieleOhneVnr: 0,
    dokumenteGesamt: 0, dokumenteOhneDbid: 0,
    dokumenteJeVorgang: {},            // Anzahl -> wie viele Vorgaenge
    maxDokumenteJeVorgang: 0,
    // DIE Kernfrage: dieselbe DBID unter mehreren VNr?
    dbidMitMehrerenVnr: 0, beispieleDbidMehrfach: [],
    // Wiederholte VNr (delete+insert-Paare bzw. echte Dubletten)
    vnrMehrfachVollstaendig: 0, beispieleVnrMehrfach: [],
    unerklaerteFelder: {},
    beispielVorgangFelder: null
  };

  const dbidZuVnr = new Map();   // DBID -> Set(VNr)
  const vnrVollstaendig = new Map(); // VNr -> Anzahl vollstaendiger (nicht-delete) Records

  for (const v of vorgaenge) {
    // Unerklaerte Feldnamen sammeln (nur Namen, keine Werte -> keine Rohdaten im Bericht).
    const tagRe = /<([A-Za-z_][\w:.-]*)(?:\s[^>]*)?>/g; let t;
    const gesehen = new Set();
    while ((t = tagRe.exec(v)) !== null) {
      const name = t[1].replace(/^[\w.-]+:/, "");
      if (gesehen.has(name)) continue;
      gesehen.add(name);
      if (!ERKLAERTE_FELDER.has(name)) r.unerklaerteFelder[name] = (r.unerklaerteFelder[name] || 0) + 1;
    }

    const vFunktion = feld(v, "VFunktion");
    const vnr = feld(v, "VNr");
    const vid = feld(v, "VID");
    if (vnr) r.vnrVorhanden += 1; else r.ohneVnr += 1;
    if (vid) r.vidVorhanden += 1;
    if (vnr && vid) { if (vnr === vid) r.vnrGleichVid += 1; else { r.vnrUngleichVid += 1; if (r.beispieleVnrUngleichVid.length < 5) r.beispieleVnrUngleichVid.push({ vnr, vid }); } }
    if (feld(v, "VTypL") || feld(v, "VTyp")) r.vtypVorhanden += 1;

    if (vFunktion && /delete/i.test(vFunktion)) { r.deleteStubs += 1; continue; }

    const dokBloecke = bloecke(v, "Dokument");
    if (!dokBloecke.length) { r.ohneDokument += 1; continue; }
    r.mitDokument += 1;
    if (vnr) vnrVollstaendig.set(vnr, (vnrVollstaendig.get(vnr) || 0) + 1);

    const n = dokBloecke.length;
    r.dokumenteJeVorgang[n] = (r.dokumenteJeVorgang[n] || 0) + 1;
    if (n > r.maxDokumenteJeVorgang) r.maxDokumenteJeVorgang = n;
    r.dokumenteGesamt += n;

    if (!r.beispielVorgangFelder) r.beispielVorgangFelder = [...gesehen].sort();

    for (const dok of dokBloecke) {
      const dbid = feld(dok, "DBID");
      if (!dbid) { r.dokumenteOhneDbid += 1; continue; }
      if (!dbidZuVnr.has(dbid)) dbidZuVnr.set(dbid, new Set());
      if (vnr) dbidZuVnr.get(dbid).add(vnr);
    }
  }

  for (const [dbid, vnrSet] of dbidZuVnr) {
    if (vnrSet.size > 1) {
      r.dbidMitMehrerenVnr += 1;
      if (r.beispieleDbidMehrfach.length < 5) r.beispieleDbidMehrfach.push({ dbid, vnrs: [...vnrSet] });
    }
  }
  for (const [vnr, anzahl] of vnrVollstaendig) {
    if (anzahl > 1) {
      r.vnrMehrfachVollstaendig += 1;
      if (r.beispieleVnrMehrfach.length < 5) r.beispieleVnrMehrfach.push({ vnr, anzahl });
    }
  }
  r.eindeutigeDbid = dbidZuVnr.size;
  r.eindeutigeVnr = vnrVollstaendig.size;

  // Dokumente OHNE Vorgangsrahmen: alle <Dokument> im Body minus die in Vorgaengen enthaltenen.
  // Nur ueber den gelesenen Ausschnitt aussagekraeftig -> als Ausschnittszahl ausgewiesen.
  const dokumenteImBody = (body.match(/<(?:[\w.-]+:)?Dokument(?:\s[^>]*)?>/g) || []).length;
  const vorgaengeImBody = (body.match(/<(?:[\w.-]+:)?Vorgang(?:\s[^>]*)?>/g) || []).length;
  // Dokumente, die NICHT in einem Vorgang stecken: Rest nach Entfernen aller Vorgangsbloecke.
  let rest = body;
  for (const v of vorgaenge) rest = rest.replace(v, "");
  r.dokumenteOhneVorgangsrahmen = (rest.match(/<(?:[\w.-]+:)?Dokument(?:\s[^>]*)?>/g) || []).length;
  r.ausschnitt = { dokumenteImBody, vorgaengeImBody };
  return r;
}

function bewerte(r) {
  const b = [];
  b.push(["VNr als externe Vorgangskennung vorhanden", r.vnrVorhanden === r.vorgaengeGelesen]);
  b.push(["VNr und VID stimmen immer ueberein", r.vnrUngleichVid === 0 && r.vidVorhanden > 0]);
  b.push(["kein Vorgang ohne Kennung", r.ohneVnr === 0]);
  b.push(["jedes Dokument traegt eine DBID", r.dokumenteOhneDbid === 0]);
  b.push(["EIN Vorgang kann MEHRERE Dokumente tragen", r.maxDokumenteJeVorgang > 1]);
  b.push(["KEIN Dokument haengt an mehreren Vorgaengen (1:n, nicht n:m)", r.dbidMitMehrerenVnr === 0]);
  return b;
}

async function run() {
  const outIdx = process.argv.indexOf("--out");
  const outPath = outIdx > -1 ? process.argv[outIdx + 1] : null;
  const seed = buildLandesmodulSeed();
  const weg = seed.retrievalPaths.find((p) => p.legacy_source_id === "be-plenum");

  console.log("=== Berliner PARDOK-<Vorgang>-Analyse (Roadmap-Punkt 24) ===");
  console.log(`Abrufweg: ${weg.id} · Status ${weg.status}/${weg.activation_mode} (bleibt unveraendert)`);
  console.log(`URL: ${weg.url}`);
  console.log("Nur lesend · kein Storage · keine DB · kein LLM · keine Secrets\n");

  const kontroll = [];
  for (const cu of CONTROL_URLS) kontroll.push(await httpProbe(cu));
  const egress = controlOkFromProbes(kontroll);
  console.log(`Kontroll-Abruf: ${CONTROL_URLS.map((u, i) => `${new URL(u).hostname}=${kontroll[i].error ? kontroll[i].error : "HTTP " + kontroll[i].status}`).join(" · ")} -> Egress ${egress ? "OFFEN" : "GESPERRT"}`);

  const bericht = { generatedAt: new Date().toISOString(), egressOffen: egress, quelle: weg.url, maxRecords: MAX_RECORDS };
  if (!egress) {
    bericht.hinweis = "Egress gesperrt — keine Analyse, kein erfundenes Ergebnis.";
    console.log(`\n${bericht.hinweis}`);
  } else {
    const probe = await httpProbe(weg.url);
    bericht.http = { status: probe.status, bytes: Buffer.byteLength(String(probe.body || ""), "utf8"), truncated: !!probe.truncated };
    console.log(`HTTP ${probe.status} · ${bericht.http.bytes} Bytes${probe.truncated ? " · TRUNKIERT (Byte-Cap)" : ""}\n`);
    if (probe.error || !probe.body) {
      bericht.fehler = probe.error || "leerer Body";
      console.log(`FEHLER: ${bericht.fehler}`);
    } else {
      const r = analysiere(String(probe.body));
      bericht.analyse = r;
      console.log(`--- Mengen ---`);
      console.log(`  <Vorgang> gelesen:        ${r.vorgaengeGelesen}  (im Ausschnitt: ${r.ausschnitt.vorgaengeImBody} Vorgang / ${r.ausschnitt.dokumenteImBody} Dokument)`);
      console.log(`  delete-Stubs:             ${r.deleteStubs}`);
      console.log(`  ohne <Dokument>:          ${r.ohneDokument}`);
      console.log(`  mit <Dokument>:           ${r.mitDokument}   Dokumente gesamt: ${r.dokumenteGesamt}`);
      console.log(`--- Kennungen ---`);
      console.log(`  <VNr> vorhanden:          ${r.vnrVorhanden}/${r.vorgaengeGelesen}   ohne VNr: ${r.ohneVnr}`);
      console.log(`  <VID> vorhanden:          ${r.vidVorhanden}/${r.vorgaengeGelesen}`);
      console.log(`  VNr == VID:               ${r.vnrGleichVid}   VNr != VID: ${r.vnrUngleichVid} ${r.beispieleVnrUngleichVid.length ? JSON.stringify(r.beispieleVnrUngleichVid) : ""}`);
      console.log(`  <VTyp*> vorhanden:        ${r.vtypVorhanden}/${r.vorgaengeGelesen}`);
      console.log(`  eindeutige VNr (vollst.): ${r.eindeutigeVnr}   VNr mehrfach vollstaendig: ${r.vnrMehrfachVollstaendig} ${r.beispieleVnrMehrfach.length ? JSON.stringify(r.beispieleVnrMehrfach) : ""}`);
      console.log(`--- Vorgang <-> Dokument ---`);
      console.log(`  Dokumente je Vorgang:     ${JSON.stringify(r.dokumenteJeVorgang)}  (max ${r.maxDokumenteJeVorgang})`);
      console.log(`  eindeutige DBID:          ${r.eindeutigeDbid}   ohne DBID: ${r.dokumenteOhneDbid}`);
      console.log(`  DBID unter MEHREREN VNr:  ${r.dbidMitMehrerenVnr} ${r.beispieleDbidMehrfach.length ? JSON.stringify(r.beispieleDbidMehrfach) : ""}`);
      console.log(`--- Feldnamen ---`);
      console.log(`  unerklaerte Felder:       ${Object.keys(r.unerklaerteFelder).length ? JSON.stringify(r.unerklaerteFelder) : "(keine)"}`);
      console.log(`  Felder eines Beispiel-Vorgangs: ${JSON.stringify(r.beispielVorgangFelder)}`);
      console.log(`\n--- Bewertung ---`);
      bericht.bewertung = {};
      for (const [name, ok] of bewerte(r)) { console.log(`  ${ok ? "JA " : "NEIN"}  ${name}`); bericht.bewertung[name] = ok; }
    }
  }
  if (outPath) { fs.writeFileSync(outPath, JSON.stringify(bericht, null, 2)); console.log(`\nJSON: ${outPath}`); }
  return bericht;
}

if (require.main === module) run().catch((e) => { console.error(e); process.exit(1); });
module.exports = { analysiere, bewerte, ERKLAERTE_FELDER };
