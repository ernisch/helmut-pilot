"use strict";

// Helmut — Quellenarchitektur · Sprint 9B: ECHTE technische Verifikation der Abrufwege.
//
// GROUND-TRUTH-RECORD. Ergebnis des echten Abrufs+Parsers aller Abrufwege auf einem
// GitHub-Actions-Runner mit OFFENEM Egress (der Sandbox-Egress ist gesperrt).
// Finaler Stand: Runde 3 — Run 29297142235, PR #72, 2026-07-14. Egress offen
// (Kontroll-Abruf example.com/google.com = HTTP 200), 24/24 real geprüft.
//
// Nach 3 Korrektur-/Verifikationsrunden sind ALLE Wege real geeignet oder geeignet mit
// Einschränkung (kein ablehnen, kein nicht_verifizierbar mehr): 21 geeignet + 3 mit
// Einschränkung (Bot-429-Parteifeeds; server-seitiger Abruf nötig, NICHT umgangen).
//
// Schluessel = legacy_source_id des (deduplizierten) Abrufwegs. Urteil ist GENAU EINES von:
//   "geeignet" | "geeignet mit Einschränkung" | "ablehnen" | "nicht_verifizierbar".
// WENDET NICHTS AN: keine Aktivierung, kein Crawl, kein prepared-Eintrag in Production.

const LIVE_META = Object.freeze({
  datum: "2026-07-14", run: "29297142235", runde: 3, pr: 72,
  egressOffen: true, realGeprueft: 24, gesamt: 24,
  runner: "GitHub Actions ubuntu-latest (offener Egress)",
  hinweis: "R1 (25 Wege) -> R2 (18 Wege, echte Feeds+googlenews) -> R3 (3 gescheiterte Direktfeeds auf googlenews). Endstand: 0 ablehnen."
});

// --- Berlin/Brandenburg: 18 deduplizierte Abrufwege ---
const LIVE_URTEILE = Object.freeze({
  // Berlin (10)
  "be-landesparlament":      { urteil: "geeignet",                   http: 200, method: "googlenews_search", beleg: "20 Items, 23 Tage (site:parlament-berlin.de)" },
  "be-plenum":               { urteil: "geeignet",                   http: 200, method: "opendata_xml",      beleg: "8108 <Dokument> (PARDOK WP19)" },
  "be-landesregierung":      { urteil: "geeignet",                   http: 200, method: "googlenews_search", beleg: "20 Items, 3 Tage (Senat Berlin site:berlin.de)" },
  "be-staatskanzlei":        { urteil: "geeignet",                   http: 200, method: "googlenews_search", beleg: "20 Items, 1 Tag (Regierender Bürgermeister/Senatskanzlei) — R3-Ersatz nach RBm-Feed-404" },
  "be-landesfraktionen":     { urteil: "geeignet",                   http: 200, method: "googlenews_search", beleg: "20 Items, 28 Tage (Abgeordnetenhaus-Fraktionen)" },
  "be-regionale_leitmedien": { urteil: "geeignet",                   http: 200, method: "rss",               beleg: "20 Items, 0 Tage (Tagesspiegel Berlin)" },
  "rbb24-politik":           { urteil: "geeignet",                   http: 200, method: "rss",               beleg: "20 Items, 0 Tage (rbb24 Politik, BE+BB)" },
  "be-partei_pilot":         { urteil: "geeignet mit Einschränkung", http: 429, method: "rss",               beleg: "Bot-Sperre 429 — server-seitiger Abruf nötig (NICHT umgehen)" },
  "be-fraktion_pilot":       { urteil: "geeignet mit Einschränkung", http: 429, method: "rss",               beleg: "Bot-Sperre 429" },
  "be-person_pilot":         { urteil: "geeignet",                   http: 200, method: "googlenews_search", beleg: "20 Items, 12 Tage (Tobias Schulze)" },
  // Brandenburg (8)
  "bb-landesparlament":      { urteil: "geeignet",                   http: 200, method: "googlenews_search", beleg: "20 Items, 5 Tage (site:landtag.brandenburg.de)" },
  "bb-plenum":               { urteil: "geeignet",                   http: 200, method: "opendata_xml",      beleg: "6092 <Vorgang> (parldok WP8)" },
  "bb-ausschuesse":          { urteil: "geeignet",                   http: 200, method: "googlenews_search", beleg: "20 Items, 10 Tage (Landtag Brandenburg Ausschuss)" },
  "bb-landesregierung":      { urteil: "geeignet",                   http: 200, method: "googlenews_search", beleg: "20 Items, 0 Tage (Landesregierung Brandenburg) — R3-Ersatz nach bbo_rss-HTML" },
  "bb-ministerien":          { urteil: "geeignet",                   http: 200, method: "googlenews_search", beleg: "20 Items, 0 Tage (Ministerium Brandenburg) — R3-Ersatz nach bbo_rss-404" },
  "bb-landesfraktionen":     { urteil: "geeignet",                   http: 200, method: "googlenews_search", beleg: "20 Items, 15 Tage (Landtag Brandenburg Fraktion)" },
  "bb-regionale_leitmedien": { urteil: "geeignet",                   http: 200, method: "googlenews_search", beleg: "20 Items, 0 Tage (Google News MAZ)" },
  "bb-partei_pilot":         { urteil: "geeignet mit Einschränkung", http: 429, method: "rss",               beleg: "Bot-Sperre 429" }
});

// Welche Pflichtklassen ein (deduplizierter) Weg abdeckt -> Verdict propagiert auf alle.
const WEG_DECKT_KLASSEN = Object.freeze({
  "be-landesparlament":      { land: "berlin", klassen: ["landesparlament", "ausschuesse"] },
  "be-plenum":               { land: "berlin", klassen: ["plenum", "drucksachen", "schriftliche_anfragen", "gesetzgebung"] },
  "be-landesregierung":      { land: "berlin", klassen: ["landesregierung", "ministerien"] },
  "be-staatskanzlei":        { land: "berlin", klassen: ["staatskanzlei"] },
  "be-landesfraktionen":     { land: "berlin", klassen: ["landesfraktionen"] },
  "be-regionale_leitmedien": { land: "berlin", klassen: ["regionale_leitmedien"] },
  "rbb24-politik":           { land: "beide",  klassen: ["oer_landesberichterstattung"] },
  "be-partei_pilot":         { land: "berlin", klassen: ["partei_pilot"] },
  "be-fraktion_pilot":       { land: "berlin", klassen: ["fraktion_pilot"] },
  "be-person_pilot":         { land: "berlin", klassen: ["person_pilot"] },
  "bb-landesparlament":      { land: "brandenburg", klassen: ["landesparlament"] },
  "bb-plenum":               { land: "brandenburg", klassen: ["plenum", "drucksachen", "schriftliche_anfragen", "gesetzgebung"] },
  "bb-ausschuesse":          { land: "brandenburg", klassen: ["ausschuesse"] },
  "bb-landesregierung":      { land: "brandenburg", klassen: ["landesregierung", "staatskanzlei"] },
  "bb-ministerien":          { land: "brandenburg", klassen: ["ministerien"] },
  "bb-landesfraktionen":     { land: "brandenburg", klassen: ["landesfraktionen"] },
  "bb-regionale_leitmedien": { land: "brandenburg", klassen: ["regionale_leitmedien"] },
  "bb-partei_pilot":         { land: "brandenburg", klassen: ["partei_pilot"] }
});

// --- Bund: 6 Reparaturwege (nach R3 alle real geeignet -> repariert) ---
const BUND_LIVE = Object.freeze({
  "bundestag":                 { urteil: "geeignet", http: 200, method: "rss",               beleg: "15 Items, 3 Tage — pressemitteilungen.rss (direkt)" },
  "bundesregierung":           { urteil: "geeignet", http: 200, method: "googlenews_search", beleg: "20 Items, 3 Tage — googlenews-Ersatz (GSB-Feed real 404)" },
  "die-linke":                 { urteil: "geeignet", http: 200, method: "googlenews_search", beleg: "20 Items, 0 Tage — googlenews-Ersatz (Direktfeed bot-gesperrt)" },
  "linksfraktion":             { urteil: "geeignet", http: 200, method: "rss",               beleg: "15 Items, 0 Tage — dielinkebt.de feed.rss (direkt)" },
  "ausschuss-arbeit-soziales": { urteil: "geeignet", http: 200, method: "googlenews_search", beleg: "20 Items, 0 Tage — googlenews-Ersatz (kein Direktfeed)" },
  "dgb":                       { urteil: "geeignet", http: 200, method: "googlenews_search", beleg: "20 Items, 0 Tage — googlenews-Ersatz (OPML-Feed real HTML)" }
});

// Ein Weg gilt als real VERIFIZIERT (byte-genau geprüft), wenn er geeignet ist.
function istVerifiziert(urteil) { return urteil === "geeignet"; }

// Live-Verdict je Pflichtklasse (land-aware) — ueber die reverse WEG_DECKT_KLASSEN-Abbildung.
function klasseLiveVerdict(land, klasse) {
  for (const [weg, def] of Object.entries(WEG_DECKT_KLASSEN)) {
    if ((def.land === land || def.land === "beide") && def.klassen.includes(klasse)) {
      return { weg, ...LIVE_URTEILE[weg] };
    }
  }
  return null;
}

function zaehle(urteile) {
  const z = { "geeignet": 0, "geeignet mit Einschränkung": 0, "ablehnen": 0, "nicht_verifizierbar": 0 };
  for (const v of Object.values(urteile)) z[v.urteil] = (z[v.urteil] || 0) + 1;
  return z;
}

function verifikationSummary() {
  const be = zaehle(LIVE_URTEILE);
  const bund = zaehle(BUND_LIVE);
  const alle = { ...be };
  for (const k of Object.keys(bund)) alle[k] = (alle[k] || 0) + bund[k];
  return {
    meta: { ...LIVE_META },
    landWege: LIVE_URTEILE, bundWege: BUND_LIVE,
    zaehlungLand: be, zaehlungBund: bund, zaehlungGesamt: alle,
    verifizierteWege: Object.entries({ ...LIVE_URTEILE, ...BUND_LIVE }).filter(([, v]) => istVerifiziert(v.urteil)).map(([id]) => id),
    bundRepariert: Object.entries(BUND_LIVE).filter(([, v]) => istVerifiziert(v.urteil)).map(([id]) => id),
    // Wege, die nach dem echten Test behalten werden (geeignet ODER mit Einschränkung):
    behaltenWege: Object.entries({ ...LIVE_URTEILE, ...BUND_LIVE }).filter(([, v]) => v.urteil === "geeignet" || v.urteil === "geeignet mit Einschränkung").map(([id]) => id)
  };
}

module.exports = { LIVE_META, LIVE_URTEILE, WEG_DECKT_KLASSEN, BUND_LIVE, istVerifiziert, klasseLiveVerdict, verifikationSummary };
