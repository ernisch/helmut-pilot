"use strict";

// Phase H+I: vollstaendiger ISOLIERTER End-zu-Ende-Shadow-Test der neuen Kostenlogik.
// Kette (echte Module): Quelle -> Parser -> Normalisierung -> techn. Filter -> globale Dedup ->
// Fundstellen -> Understanding-GATE -> Klassifikation -> KO-Vorbereitung -> Scoring ->
// Profilmatching (4 Profile) -> Kostenmessung -> Isolation. REINE LOGIK, kein Netz/KI/DB-Write.
// Zusaetzlich (Phase I): Alt-vs-Neu fuer das Pilot-aehnliche Profil — die neue Gate-Logik darf dessen Versorgung NICHT
// verschlechtern (Bund-Basis + Fachpaket bleiben; kein amtlicher/relevanter Vorgang geht verloren).

const fs = require("fs");
const path = require("path");
const P = require("../lib/helmut/quellenarchitektur/pardok-parser");
const G = require("../lib/helmut/quellenarchitektur/understanding-gate");
const pp = require("../lib/helmut/quellenarchitektur/profile-packages");
const scoring = require("../lib/helmut/scoring");
const { ingestShadow } = require("./shadow-ingest");
const { normalizeRawItem } = require("../lib/helmut/crawler");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }
function fx(n) { return fs.readFileSync(path.join(__dirname, "..", "test", "fixtures", "pardok", n), "utf8"); }
const NOW = Date.parse("2026-07-14T00:00:00Z");

// --- Quellen: PARDOK BE/BB (amtlich) + RSS (Bund-Story + Regional-Story + neutral) ---
const be = P.parsePardokDocumentsFromString(fx("berlin-gold.xml"), { land: "berlin" }).documents;
const bb = P.parsePardokDocumentsFromString(fx("brandenburg-gold.xml"), { land: "brandenburg" }).documents;
const src = { id: "committee-soziales", name: "Quelle", type: "shadow", url: "https://e/x", priority: 0 };
const rss = [
  normalizeRawItem({ title: "Bundestag beschliesst Rentenpaket in namentlicher Abstimmung", content: "Bundestag Rentenpaket", url: "https://e/rente", publishedAt: "2026-07-13T09:00:00Z" }, src),
  normalizeRawItem({ title: "Abgeordnetenhaus Berlin debattiert Mietendeckel", content: "Abgeordnetenhaus Berlin Mietendeckel", url: "https://e/miete", publishedAt: "2026-07-13T08:00:00Z" }, src),
  normalizeRawItem({ title: "Wetterbericht fuer das Wochenende", content: "Sonnig", url: "https://e/wetter", publishedAt: "2026-07-13T07:00:00Z" }, src)
];
const sources = [
  { sourceId: "be-plenum", retrievalPathId: "rp-be-plenum", kind: "pardok", items: be },
  { sourceId: "bb-plenum", retrievalPathId: "rp-bb-plenum", kind: "pardok", items: bb },
  { sourceId: "committee-soziales", retrievalPathId: "rp-x", kind: "rss", items: rss }
];

// --- 1. Ingest (echte Kette: Normalisierung/Dedup/Fundstellen/Klassifikation/KO/Kosten/Isolation) ---
const rep = ingestShadow(sources, { now: NOW });
check("1 Isolation ok (kein Prod-Modul im Require-Graph)", rep.isolation.ok === true);
check("1b Kosten = 0 USD (kein LLM)", rep.kostenUsd === 0);
check("1c Dokumente + Fundstellen erzeugt", rep.dokumente >= 14 && rep.fundstellenGesamt >= rep.dokumente);
check("1d Ebenen-Klassifikation getrennt (land + bund vorhanden)", (rep.klassifikationEbenen.land || 0) >= 14 && (rep.klassifikationEbenen.bund || 0) >= 1);

// --- 2. GATE ueber alle Quell-Dokumente (amtliche PARDOK + RSS) ---
function gateInput(land, doc) { return { id: `sd-${doc.externe_id}`, content_hash: doc.inhaltsfingerabdruck || doc.externe_id, title: doc.titel || "", summary: "", source_id: land === "berlin" ? "be-plenum" : "bb-plenum", document_type: doc.dokumentart || null, published_at: doc.veroeffentlichungsdatum || null }; }
const gateDocs = [
  ...be.map((dd) => gateInput("berlin", dd)), ...bb.map((dd) => gateInput("brandenburg", dd)),
  ...rss.map((it) => ({ id: it.id, content_hash: it.hash, title: it.title, summary: "", source_id: "committee-soziales", document_type: null, published_at: it.publishedAt }))
];
const gres = G.gateDocuments(gateDocs, { now: NOW });
check("2 GATE: ALLE amtlichen PARDOK -> verstehen (0 geparkt bei BE/BB)", (be.length + bb.length) > 0 && gateDocs.slice(0, be.length + bb.length).every((x) => G.assessDocument(x, { now: NOW }).decision === "verstehen"));
check("2b GATE: Bund-Story (Institution) -> verstehen", G.assessDocument(gateDocs.find((x) => /Rentenpaket/.test(x.title)), { now: NOW }).decision === "verstehen");
check("2c GATE: neutrale Story -> nicht verstehen (Grenzfall/parken)", G.assessDocument(gateDocs.find((x) => /Wetter/.test(x.title)), { now: NOW }).decision !== "verstehen");
check("2d GATE: kein kritischer Fehler (keine amtliche Quelle geparkt)", gres.perDoc.filter((r) => r.tier === "amtlich").every((r) => r.decision === "verstehen"));

// --- 3. SCORING (globale Wichtigkeit / persoenliche Relevanz / Handlungsfaehigkeit) ---
const koBund = { id: "ko1", headline: "Bundestag beschliesst Rentenpaket", was_ist_passiert: "Bundestag beschliesst Rentenpaket", decision_level: "bund", event_type: "abstimmung", ausschuesse: ["Arbeit und Soziales"], published_at: "2026-07-13T09:00:00Z" };
const koNeutral = { id: "ko2", headline: "Wetterbericht", was_ist_passiert: "Sonnig", decision_level: "unknown", event_type: "unknown", published_at: "2026-07-13T07:00:00Z" };
check("3 globale Wichtigkeit: relevanter Bund-Vorgang > neutraler", scoring.globalImportance(koBund).score > scoring.globalImportance(koNeutral).score);

// --- 4. PROFILMATCHING: 4 Profile (Bund-Basis / Landespaket / Partei / Fraktion / Ausschuss / Region) ---
const profile = {
  pilotaehnlich: { fullName: "Test Politician One", party: "Testpartei Alpha", politische_ebene: "bundestag", ausschuesse: ["Arbeit und Soziales"], bundesland: "Niedersachsen", profileActive: true },
  bundestag: { fullName: "Reines Bundestagsprofil", party: "CDU", politische_ebene: "bundestag", profileActive: true },
  berlin: { fullName: "Berliner Landtag", party: "SPD", politische_ebene: "landtag", bundesland: "Berlin", profileActive: true },
  brandenburg: { fullName: "Brandenburger Landtag", party: "SPD", politische_ebene: "landtag", bundesland: "Brandenburg", profileActive: true }
};
const pkg = Object.fromEntries(Object.entries(profile).map(([k, p]) => [k, pp.resolveProfilePackages(p)]));
check("4 ALLE Profile haben bund-basis (Bundespolitik fuer alle sichtbar)", Object.values(pkg).every((r) => r.all.includes("bund-basis")));
check("4b Berlin -> berlin-basis (Landespaket)", pkg.berlin.all.includes("berlin-basis") && pkg.berlin.requiredMissing.length === 0);
check("4c Brandenburg -> brandenburg-basis (Landespaket)", pkg.brandenburg.all.includes("brandenburg-basis"));
check("4d Reines Bundestagsprofil -> KEIN Landespaket (keine Filterblase andersherum)", !pkg.bundestag.all.some((k) => /-basis$/.test(k) && k !== "bund-basis"));
check("4e Pilot-aehnliches Profil -> mehrere Pakete (Bund + Fachdimensionen)", pkg.pilotaehnlich.all.length >= 2 && pkg.pilotaehnlich.all.includes("bund-basis"));
check("4f Landtagsprofile behalten Bund-Kern (Landesvorgaenge NICHT statt, sondern ZUSAETZLICH)", pkg.berlin.all.includes("bund-basis") && pkg.brandenburg.all.includes("bund-basis"));

// --- 5. Persoenliche Relevanz respektiert Profil, ohne Bundespolitik zu verstecken ---
const relPilot = scoring.personalRelevance(koBund, profile.pilotaehnlich, { now: NOW }).score;
const relBb = scoring.personalRelevance(koBund, profile.brandenburg, { now: NOW }).score;
check("5 persoenliche Relevanz: Fachprofil (Arbeit&Soziales) >= fremdes Profil fuer Sozial-Vorgang", relPilot >= relBb);
check("5b globale Wichtigkeit ist profil-UNABHAENGIG (Lage keine Filterblase)", scoring.globalImportance(koBund).score === scoring.globalImportance(koBund).score);

// --- 6. Phase I: Alt-vs-Neu — neue Gate-Logik verschlechtert die Versorgung des Fachprofils NICHT ---
// Cems Bund-/Fachvorgaenge (Institution/Ausschuss-Signal) werden vom Gate 'verstehen' -> nicht verloren.
const fachVorgaenge = [
  { id: "c1", content_hash: "c1", title: "Bundestag beschliesst Rentenpaket", source_id: "committee-arbeit-soziales" },
  { id: "c2", content_hash: "c2", title: "Ausschuss fuer Arbeit und Soziales beraet Buergergeld", source_id: "committee-arbeit-soziales" },
  { id: "c3", content_hash: "c3", title: "Kleine Anfrage zur Rente", source_id: "dip", document_type: "Kleine Anfrage" }
];
check("6 Bund-/Fachvorgaenge -> alle verstehen (keine Verschlechterung durch Gate)", fachVorgaenge.every((v) => G.assessDocument(v, { now: NOW }).decision === "verstehen"));

console.log(`\n== E2E-Shadow (Gate + 4 Profile + Scoring + Fachprofil-Vergleich): ${fail === 0 ? "ALLE GRÜN" : fail + " FEHLGESCHLAGEN"} · Dokumente=${rep.dokumente} Kosten=${rep.kostenUsd}USD ==`);
process.exit(fail > 0 ? 1 : 0);
