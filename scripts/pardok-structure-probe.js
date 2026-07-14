"use strict";

// PARDOK/parldok Struktur-Sonde — Berlin (be-plenum) + Brandenburg (bb-plenum).
// Holt die ECHTEN Open-Data-XML-Dateien und dumpt ihre STRUKTUR ins Log + Artefakt:
//   Root-Element + Attribute · Namespaces · Record-Element-Kandidaten + Anzahl · Feld-Inventar
//   (Kindtag -> in wie vielen Records vorhanden, + Beispielwert) · Attribut-Inventar · mehrere
//   VERBATIM Beispiel-Records je Land (auch feldarme).
//
// Zweck: reale Feldnamen/Struktur ermitteln, BEVOR der Parser gebaut wird. Berlin und Brandenburg
// koennen unterschiedliche Formate haben — die Sonde erzwingt KEINE gemeinsame Annahme.
//
// DB-frei, kein LLM, kein Write ausser dem Artefakt/Log. Nur lesende HTTPS-Abrufe.
// Aufruf: node scripts/pardok-structure-probe.js --out pardok-structure.json

const fs = require("fs");
const { httpProbe, controlOkFromProbes } = require("./sprint9b-verify-abrufwege");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");

const SAMPLES = Number(process.env.PP_SAMPLES || 5);
const INV_RECORDS = Number(process.env.PP_INV || 500);
const SAMPLE_CHARS = Number(process.env.PP_SAMPLE_CHARS || 1800);
const CONTROL_URLS = ["https://example.com/", "https://www.google.com/"];
const TARGETS = ["be-plenum", "bb-plenum"];

function targetsFromSeed() {
  const seed = buildLandesmodulSeed();
  const byLeg = new Map(seed.retrievalPaths.map((p) => [p.legacy_source_id, p]));
  return TARGETS.map((id) => { const p = byLeg.get(id); return { id, land: p.landModule, url: p.url }; });
}

function looksHtml(body) { return /^\s*<!doctype html|<html[\s>]/i.test(String(body).slice(0, 2000)); }
function xmlDecl(body) { const m = String(body).match(/^\s*<\?xml[^>]*\?>/); return m ? m[0].trim() : null; }
function rootElement(body) {
  const s = String(body).replace(/^\s*<\?xml[^>]*\?>/, "").replace(/<!--[\s\S]*?-->/g, "");
  const m = s.match(/<([A-Za-z_][\w:.-]*)((?:\s[^>]*)?)>/);
  return m ? { name: m[1], attrs: (m[2] || "").trim() } : null;
}
function findNamespaces(body) {
  const head = String(body).slice(0, 6000);
  return [...new Set([...head.matchAll(/xmlns(:[\w.-]+)?\s*=\s*"([^"]+)"/g)].map((m) => `${m[1] || "(default)"}=${m[2]}`))];
}
function recordCandidates(body) {
  const cands = ["Vorgang", "Vorgänge", "Dokument", "Drucksache", "Plenarprotokoll", "Sitzung", "Beratungsvorgang",
    "Aktivitaet", "Aktivität", "record", "Datensatz", "Vorgangsdokument", "Dokumentation", "Eintrag", "item"];
  const counts = {};
  for (const c of cands) { const n = (body.match(new RegExp(`<${c}(?:\\s[^>]*)?>`, "g")) || []).length; if (n) counts[c] = n; }
  return counts;
}
function chooseRecordTag(counts, root) {
  const entries = Object.entries(counts).filter(([t]) => !root || t !== root.name).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries[0][0] : null;
}
function recordBlocks(body, tag, limit) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>`, "g");
  const out = []; let m; let i = 0;
  while ((m = re.exec(body)) !== null) { out.push(m[0]); if (++i >= limit) break; }
  return out;
}
// Feld-Inventar: je Kindtag, in wie vielen Records vorhanden + ein Beispiel-Leaf-Wert.
function tagInventory(blocks) {
  const present = {}; const sampleVal = {};
  for (const b of blocks) {
    const seen = new Set();
    const tagRe = /<([A-Za-z_][\w:.-]*)(?:\s[^>]*)?>/g; let m;
    while ((m = tagRe.exec(b)) !== null) {
      const name = m[1];
      if (!seen.has(name)) { seen.add(name); present[name] = (present[name] || 0) + 1; }
      if (!(name in sampleVal)) {
        const vm = b.match(new RegExp(`<${name}(?:\\s[^>]*)?>([^<]{1,90})<\\/${name}>`));
        if (vm && vm[1].trim()) sampleVal[name] = vm[1].trim();
      }
    }
  }
  return { present, sampleVal };
}
// Attribut-Inventar: tag@attr -> in wie vielen Records vorhanden + Beispielwert.
function attrInventory(blocks) {
  const present = {}; const sampleVal = {};
  for (const b of blocks) {
    const seen = new Set();
    const tagRe = /<([A-Za-z_][\w:.-]*)((?:\s[^>]*)?)>/g; let m;
    while ((m = tagRe.exec(b)) !== null) {
      const attrStr = m[2]; if (!attrStr || !attrStr.trim()) continue;
      const aRe = /([\w:.-]+)\s*=\s*"([^"]*)"/g; let a;
      while ((a = aRe.exec(attrStr)) !== null) {
        const key = `${m[1]}@${a[1]}`;
        if (!seen.has(key)) { seen.add(key); present[key] = (present[key] || 0) + 1; }
        if (!(key in sampleVal) && a[2]) sampleVal[key] = a[2].slice(0, 90);
      }
    }
  }
  return { present, sampleVal };
}

function analyzeOne(target, probe) {
  const bytes = Buffer.byteLength(String(probe.body || ""), "utf8");
  const out = { id: target.id, land: target.land, url: target.url, status: probe.status, contentType: probe.contentType || null, bytes, truncated: !!probe.truncated, redirects: (probe.redirects || []).length };
  if (probe.error && probe.status === undefined) { out.fehler = `Abruf fehlgeschlagen: ${probe.error}`; return out; }
  const body = String(probe.body || "");
  out.istHtmlFehlerseite = looksHtml(body, out.contentType);
  if (out.istHtmlFehlerseite) { out.hinweis = "HTML statt XML — Fehlerseite/Landing (adversarialer Fall)"; return out; }
  out.xmlDecl = xmlDecl(body);
  out.root = rootElement(body);
  out.namespaces = findNamespaces(body);
  out.recordCandidates = recordCandidates(body);
  out.recordTag = chooseRecordTag(out.recordCandidates, out.root);
  if (!out.recordTag) { out.hinweis = "kein Record-Element erkannt"; return out; }
  const blocks = recordBlocks(body, out.recordTag, INV_RECORDS);
  out.recordsGescannt = blocks.length;
  out.recordsGesamtImBody = out.recordCandidates[out.recordTag] || null;
  const inv = tagInventory(blocks);
  out.feldInventar = Object.entries(inv.present).sort((a, b) => b[1] - a[1])
    .map(([tag, n]) => ({ tag, vorhandenInRecords: n, quote: +(n / blocks.length).toFixed(3), beispiel: inv.sampleVal[tag] || null }));
  const attr = attrInventory(blocks);
  out.attributInventar = Object.entries(attr.present).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => ({ attr: k, vorhandenInRecords: n, quote: +(n / blocks.length).toFixed(3), beispiel: attr.sampleVal[k] || null }));
  // Beispiel-Records: erste 3 + gleichmaessig verteilte weitere (Varianz sichtbar machen).
  const idx = new Set([0, 1, 2]);
  for (let s = 0; s < SAMPLES; s++) idx.add(Math.min(blocks.length - 1, Math.floor((s / SAMPLES) * blocks.length)));
  out.beispielRecords = [...idx].filter((i) => i >= 0 && i < blocks.length).sort((a, b) => a - b).slice(0, SAMPLES + 3)
    .map((i) => ({ index: i, xml: blocks[i].slice(0, SAMPLE_CHARS) + (blocks[i].length > SAMPLE_CHARS ? " …[gekürzt]" : "") }));
  return out;
}

function printReport(rep) {
  for (const o of rep.lands) {
    console.log(`\n========== ${o.id} (${o.land}) ==========`);
    console.log(`URL: ${o.url}`);
    console.log(`HTTP ${o.status} · ${o.contentType} · ${o.bytes} Bytes · ${o.redirects} Weiterleitung(en)${o.truncated ? " · TRUNKIERT (Byte-Cap)" : ""}`);
    if (o.fehler) { console.log(`FEHLER: ${o.fehler}`); continue; }
    if (o.istHtmlFehlerseite) { console.log(`HINWEIS: ${o.hinweis}`); continue; }
    console.log(`XML-Deklaration: ${o.xmlDecl || "(keine)"}`);
    console.log(`Root: <${o.root && o.root.name}> ${o.root && o.root.attrs ? "attrs=[" + o.root.attrs + "]" : ""}`);
    console.log(`Namespaces: ${o.namespaces.length ? o.namespaces.join(" | ") : "(keine)"}`);
    console.log(`Record-Kandidaten: ${JSON.stringify(o.recordCandidates)}`);
    console.log(`Gewaehltes Record-Element: <${o.recordTag}> (im Body: ${o.recordsGesamtImBody}, gescannt: ${o.recordsGescannt})`);
    console.log(`--- Feld-Inventar (Kindtag -> Quote, Beispiel) ---`);
    for (const f of o.feldInventar) console.log(`  ${f.tag.padEnd(28)} ${String(Math.round(f.quote * 100)).padStart(3)}%  ${f.beispiel ? "z.B. " + JSON.stringify(f.beispiel) : ""}`);
    if (o.attributInventar.length) {
      console.log(`--- Attribut-Inventar (tag@attr -> Quote, Beispiel) ---`);
      for (const a of o.attributInventar) console.log(`  ${a.attr.padEnd(28)} ${String(Math.round(a.quote * 100)).padStart(3)}%  ${a.beispiel ? "z.B. " + JSON.stringify(a.beispiel) : ""}`);
    }
    console.log(`--- Beispiel-Records (verbatim, gekürzt) ---`);
    for (const s of o.beispielRecords) { console.log(`  [Record #${s.index}]`); console.log(s.xml.split("\n").map((l) => "    " + l).join("\n")); }
  }
}

async function run() {
  const outIdx = process.argv.indexOf("--out");
  const outPath = outIdx > -1 ? process.argv[outIdx + 1] : null;
  const targets = targetsFromSeed();
  console.log("=== PARDOK/parldok Struktur-Sonde (be-plenum + bb-plenum) ===");
  console.log("DB-frei · kein LLM · nur lesende Abrufe · reine Strukturanalyse\n");

  const controlProbes = [];
  for (const cu of CONTROL_URLS) controlProbes.push(await httpProbe(cu));
  const controlStatuses = controlProbes.map((p, i) => `${new URL(CONTROL_URLS[i]).hostname}=${p.error ? p.error : "HTTP " + p.status}`);
  const egressOffen = controlOkFromProbes(controlProbes);
  console.log(`Kontroll-Abruf: ${controlStatuses.join(" · ")} -> Egress ${egressOffen ? "OFFEN" : "GESPERRT"}`);

  const rep = { generatedAt: new Date().toISOString(), egressOffen, controlStatuses, lands: [] };
  if (egressOffen) {
    for (const t of targets) { const probe = await httpProbe(t.url); rep.lands.push(analyzeOne(t, probe)); }
  } else {
    for (const t of targets) rep.lands.push({ id: t.id, land: t.land, url: t.url, status: null, hinweis: "Egress gesperrt — keine Analyse, kein erfundenes Ergebnis" });
  }
  printReport(rep);
  if (outPath) { fs.writeFileSync(outPath, JSON.stringify(rep, null, 2)); console.log(`\nJSON: ${outPath}`); }
  return rep;
}

if (require.main === module) run().catch((e) => { console.error(e); process.exit(1); });
module.exports = { analyzeOne, recordCandidates, chooseRecordTag, recordBlocks, tagInventory, attrInventory, looksHtml };
