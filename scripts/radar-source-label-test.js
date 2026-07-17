"use strict";

// Radar Quellen-Kennzeichnung ("Offizielle Quellen" / "Medien") + Dynamik-Determinismus —
// Offline, 0 KI, 0 Netz. Verbindliche Regel (Phase A.D): der Reiter "Offizielle Quellen" darf
// die ANGEZEIGTE primaere Quelle nur dann als amtlich fuehren, wenn sie eine bekannte amtliche/
// institutionelle DOMAIN ist (Parlament/Regierung/Ministerium/Behoerde/Statistikamt). Der
// raw_documents.source_type ist im Bestand NACHWEISLICH unzuverlaessig (dieselbe journalistische
// Quelle traegt je Dokument 'committee'/'media'/'party'/'bundestag'/'ministry') und darf die
// Amtlichkeit NICHT bestimmen. Medien/Verbaende/Parteien/Fraktionen/Aggregatoren sind NICHT amtlich.

const radarState = require("../lib/helmut/radarState");
const matching = require("../lib/helmut/matching");

let passed = 0, failed = 0;
function check(name, cond, detail = "") {
  if (cond) { passed += 1; console.log(`PASS  ${name}`); }
  else { failed += 1; console.log(`FAIL  ${name}${detail ? "  — " + detail : ""}`); }
}

const NOW = new Date("2026-07-14T09:00:00Z").getTime();
const nowDate = new Date(NOW);
const iso = (msAgo) => new Date(NOW - msAgo).toISOString();
const KOBASE = { status: "neu", understanding_status: "complete" };
const profile = { id: "p", fullName: "Test Politician One", party: "Testpartei Alpha", committee: "Arbeit und Soziales" };

// Baut EINEN Vorgang mit gegebenen Quellen und liefert die relationTypes des Radar-Artikels.
function relationTypesFor(sources) {
  const ko = { ...KOBASE, id: "k", vorgang_id: "v", display_title: "Ein sozialpolitischer Vorgang",
    was_ist_passiert: "Inhalt.", created_at: iso(24 * 3600e3), best_source_url: sources[0] && (sources[0].url) };
  const st = radarState.buildCurrentRadarState({ profile, decisions: [{ knowledge_object_id: "k", vorgang_id: "v", score: 50, matched_features: [] }],
    kosById: { k: ko }, knowledgeObjects: [ko], sourcesByVorgang: { v: sources }, now: nowDate });
  const art = (st.articles || []).find((a) => a.vorgangId === "v");
  return art ? (art.relationTypes || []) : [];
}
const src = (host, type, ageH = 24) => ({ id: `rd-${host}`, url: `https://www.${host}/artikel`, source_type: type, source_name: host, link_type: "direct", published_at: iso(ageH * 3600e3) });

// =============================================================================
// 1) Amtliche Primaerquelle -> "official"
// =============================================================================
for (const [host, t] of [["bundestag.de","parliament"],["bundesrat.de","parliament"],["bundesregierung.de","government"],["bmas.de","ministry"],["arbeitsagentur.de","authority"],["destatis.de","statistical_office"]]) {
  const rt = relationTypesFor([src(host, t)]);
  check(`1 Amtliche Domain ${host} -> "official", nicht "media"`, rt.includes("official") && !rt.includes("media"));
}
// Subdomain (dip.bundestag.de) ebenfalls amtlich.
check("1b Subdomain dip.bundestag.de -> official", relationTypesFor([{ id: "d", url: "https://dip.bundestag.de/vorgang/1", source_type: "media", source_name: "dip", link_type: "direct", published_at: iso(24*3600e3) }]).includes("official"));

// =============================================================================
// 2) Journalistische Quelle -> NICHT official (auch wenn source_type luegt)
// =============================================================================
check("2 FAZ (faz.net) -> media, NICHT official", (() => { const rt = relationTypesFor([src("faz.net","media")]); return rt.includes("media") && !rt.includes("official"); })());
check("2b FAZ mit source_type 'ministry' (fehlerhaft getaggt) -> TROTZDEM nicht official (Domain zaehlt)",
  !relationTypesFor([src("faz.net","ministry")]).includes("official"));
check("2c FAZ mit source_type 'bundestag' -> TROTZDEM nicht official",
  !relationTypesFor([src("faz.net","bundestag")]).includes("official"));
for (const host of ["nordkurier.de","berliner-zeitung.de","tagesschau.de","spiegel.de"]) {
  check(`2d Medienhaus ${host} -> nicht official`, !relationTypesFor([src(host,"committee")]).includes("official"));
}

// =============================================================================
// 3) Verband / Partei / Fraktion -> NICHT official
// =============================================================================
check("3 Verband (vdk.de) -> nicht official", !relationTypesFor([src("vdk.de","official")]).includes("official"));
check("3b Verband (dgb.de) -> nicht official", !relationTypesFor([src("dgb.de","ministry")]).includes("official"));
check("3c Partei (die-linke.de) -> nicht official", !relationTypesFor([src("die-linke.de","party")]).includes("official"));
check("3d Fraktion (linksfraktion.de) -> nicht official", !relationTypesFor([src("linksfraktion.de","bundestag")]).includes("official"));
check("3e Aggregator (news.google.com) -> nicht official", !relationTypesFor([{ id:"g", url:"https://news.google.com/rss/x", source_type:"official", source_name:"Google News", link_type:"direct", published_at: iso(24*3600e3) }]).includes("official"));

// =============================================================================
// 4) Vorgang mit Medienquelle (primaer) UND amtlicher Fundstelle (sekundaer)
//    -> die ANGEZEIGTE primaere Quelle ist Medien -> NICHT im "Offizielle Quellen"-Reiter
//    (das Label folgt der angezeigten Quelle; sonst waere es irrefuehrend).
// =============================================================================
check("4 primaer=FAZ (direct, neu) + sekundaer=bundestag.de (aelter) -> primaer Medien -> nicht official",
  (() => { const rt = relationTypesFor([src("faz.net","media",2), src("bundestag.de","bundestag",200)]); return rt.includes("media") && !rt.includes("official"); })());
check("4b primaer=bmas.de -> official (auch wenn weitere Medienquellen existieren)",
  relationTypesFor([src("bmas.de","ministry",2), src("faz.net","media",200)]).includes("official"));

// =============================================================================
// 5) Unbekannte Domain -> journalistisch (media), niemals official
// =============================================================================
check("5 Unbekannte Domain -> media, nicht official", (() => { const rt = relationTypesFor([src("irgendein-lokalblog.example","committee")]); return rt.includes("media") && !rt.includes("official"); })());

// =============================================================================
// 6) Dynamik-Determinismus: identische Daten + identischer now -> identisches Ergebnis;
//    KEINE fest codierte Zahl. Zahl darf mit dem 7-Tage-Fenster (now) variieren.
// =============================================================================
function dynSet(now) {
  // Cluster aus 3 Quellen (>=2, mind. eine offiziell + eine Medien) -> Dynamik-faehig.
  const ko = { ...KOBASE, id: "kd", vorgang_id: "vd", display_title: "Dynamik-Vorgang",
    was_ist_passiert: "Inhalt.", source_document_count: 3, created_at: iso(24 * 3600e3), best_source_url: "https://www.bmas.de/x" };
  const sources = { vd: [ src("bmas.de","ministry",30), src("faz.net","media",30), src("spiegel.de","media",30) ] };
  const st = radarState.buildCurrentRadarState({ profile, decisions: [{ knowledge_object_id: "kd", vorgang_id: "vd", score: 50, matched_features: [] }],
    kosById: { kd: ko }, knowledgeObjects: [ko], sourcesByVorgang: sources, now });
  return st.dynamics.map((d) => d.vorgangId).sort();
}
const d1 = dynSet(new Date("2026-07-14T12:00:00Z"));
const d2 = dynSet(new Date("2026-07-14T12:00:00Z"));
check("6 identische Daten + identischer now -> identische Dynamik-Menge (deterministisch)", JSON.stringify(d1) === JSON.stringify(d2));
const inWindow = dynSet(new Date("2026-07-14T18:00:00Z"));   // Quelle ~30h alt -> im 7-Tage-Fenster
const outWindow = dynSet(new Date("2026-07-25T18:00:00Z"));  // >7 Tage spaeter -> Quelle aus dem Fenster
check("6b Vorgang IM 7-Tage-Fenster erscheint als Dynamik", inWindow.includes("vd"));
check("6c Derselbe Vorgang AUSSERHALB des Fensters (spaeterer now) faellt heraus (deterministische Fensterlogik, keine fixe Zahl)",
  !outWindow.includes("vd") && inWindow.length !== outWindow.length);

console.log(`\n${failed === 0 ? "ALLE GRÜN" : failed + " FEHLGESCHLAGEN"} — ${passed}/${passed + failed} Radar-Quellen-Kennzeichnungs- + Dynamik-Determinismus-Assertions`);
process.exit(failed > 0 ? 1 : 0);
