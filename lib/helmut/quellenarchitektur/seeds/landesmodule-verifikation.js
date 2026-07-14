"use strict";

// Helmut — Quellenarchitektur · Sprint 9B: ECHTE technische Verifikation der Abrufwege.
//
// GROUND-TRUTH-RECORD. Ergebnis des echten Abrufs+Parsers aller 25 oeffentlichen Adressen
// auf einem GitHub-Actions-Runner mit OFFENEM Egress (der Sandbox-Egress ist gesperrt).
// Quelle: GitHub Actions Run 29294900851, PR #71 (ernisch/helmut-pilot), 2026-07-14.
// Kontroll-Abruf example.com/google.com = HTTP 200 -> Egress offen; 24/25 real geprueft.
//
// Schluessel = legacy_source_id des (deduplizierten) Abrufwegs. Urteil ist GENAU EINES von:
//   "geeignet" | "geeignet mit Einschränkung" | "ablehnen" | "nicht_verifizierbar".
// Diese Datei ueberlagert den Recherche-Kandidaten (landesmodule-kandidaten.js) den
// byte-genau geprueften Status. WENDET NICHTS AN: keine Aktivierung, kein Crawl.

const LIVE_META = Object.freeze({
  datum: "2026-07-14", run: "29294900851", pr: 71,
  egressOffen: true, realGeprueft: 24, gesamt: 25,
  runner: "GitHub Actions ubuntu-latest (offener Egress)"
});

// --- Berlin/Brandenburg: 19 deduplizierte Abrufwege ---
const LIVE_URTEILE = Object.freeze({
  // Berlin
  "be-landesparlament":      { urteil: "ablehnen",                   http: 200, beleg: "text/html — /service/rss-feeds ist Hub, kein Feed" },
  "be-plenum":               { urteil: "geeignet",                   http: 200, beleg: "text/xml, 8108 <Dokument> (PARDOK WP19)" },
  "be-landesregierung":      { urteil: "ablehnen",                   http: 200, beleg: "application/rss+xml, aber 0 parsbare Items (Basis-Feed ohne institutions[] leer)" },
  "be-staatskanzlei":        { urteil: "geeignet mit Einschränkung", http: 200, beleg: "10 Items, aber juengstes 1678 Tage alt (2021) — institutions[]=Senatskanzlei veraltet" },
  "be-landesfraktionen":     { urteil: "ablehnen",                   http: 200, beleg: "text/html — /das-parlament/fraktionen ist Landing, kein Feed" },
  "be-regionale_leitmedien": { urteil: "geeignet",                   http: 200, beleg: "20 Items, 0 Tage (Tagesspiegel Berlin)" },
  "rbb24-politik":           { urteil: "geeignet",                   http: 200, beleg: "20 Items, 0 Tage (rbb24 Politik, BE+BB)" },
  "be-partei_pilot":         { urteil: "geeignet mit Einschränkung", http: 429, beleg: "Bot-Sperre 429 — server-seitiger Abruf noetig (NICHT umgehen)" },
  "be-fraktion_pilot":       { urteil: "geeignet mit Einschränkung", http: 429, beleg: "Bot-Sperre 429" },
  "be-person_pilot":         { urteil: "geeignet",                   http: 200, beleg: "20 Items, 12 Tage (Google News Tobias Schulze)" },
  // Brandenburg
  "bb-landesparlament":      { urteil: "ablehnen",                   http: 200, beleg: "text/html — /de/rss-infodienste/12411 ist kein Feed" },
  "bb-plenum":               { urteil: "geeignet",                   http: 200, beleg: "application/xml, 6092 <Vorgang> (parldok WP8 — WP1->WP8-Korrektur bestaetigt)" },
  "bb-ausschuesse":          { urteil: "ablehnen",                   http: 404, beleg: "HTTP 404 auf /de/ausschuesse" },
  "bb-landesregierung":      { urteil: "ablehnen",                   http: 200, beleg: "text/html — Root, kein RSS (Presse = CMS-Detailseiten)" },
  "bb-staatskanzlei":        { urteil: "nicht_verifizierbar",        http: null, beleg: "TLS: www.stk.brandenburg.de nicht im Zertifikat (*.brandenburg.de) — www entfernt (Korrektur)" },
  "bb-ministerien":          { urteil: "ablehnen",                   http: 200, beleg: "text/html — mil.brandenburg.de/…/rss/ kein Feed" },
  "bb-landesfraktionen":     { urteil: "ablehnen",                   http: 200, beleg: "text/html — /de/fraktionen ist Landing" },
  "bb-regionale_leitmedien": { urteil: "geeignet",                   http: 200, beleg: "20 Items, 0 Tage (Google News MAZ)" },
  "bb-partei_pilot":         { urteil: "geeignet mit Einschränkung", http: 429, beleg: "Bot-Sperre 429" }
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
  "bb-landesregierung":      { land: "brandenburg", klassen: ["landesregierung"] },
  "bb-staatskanzlei":        { land: "brandenburg", klassen: ["staatskanzlei"] },
  "bb-ministerien":          { land: "brandenburg", klassen: ["ministerien"] },
  "bb-landesfraktionen":     { land: "brandenburg", klassen: ["landesfraktionen"] },
  "bb-regionale_leitmedien": { land: "brandenburg", klassen: ["regionale_leitmedien"] },
  "bb-partei_pilot":         { land: "brandenburg", klassen: ["partei_pilot"] }
});

// --- Bund: 6 Reparaturwege ---
const BUND_LIVE = Object.freeze({
  "bundestag":                 { urteil: "geeignet",                   http: 200, beleg: "15 Items, 3 Tage — pressemitteilungen.rss bestaetigt" },
  "bundesregierung":           { urteil: "ablehnen",                   http: 404, beleg: "HTTP 404 — GSB-URL RSS_Breg_aktuell/RSSNewsfeed.xml ist FALSCH (WebSearch widerlegt)" },
  "die-linke":                 { urteil: "geeignet mit Einschränkung", http: 429, beleg: "Bot-Sperre 429 — Pfad plausibel, Inhalt nicht bestaetigt" },
  "linksfraktion":             { urteil: "geeignet",                   http: 200, beleg: "15 Items, 0 Tage — dielinkebt.de/presse/pressemitteilungen/feed.rss bestaetigt" },
  "ausschuss-arbeit-soziales": { urteil: "geeignet",                   http: 200, beleg: "20 Items, 0 Tage — googlenews-Ersatzweg bestaetigt" },
  "dgb":                       { urteil: "ablehnen",                   http: 200, beleg: "text/html — /presse/pressemitteilungen/ ist kein Feed (OPML-Deep-Link noetig)" }
});

// Ein Weg gilt als real VERIFIZIERT (byte-genau geprueft), wenn er geeignet ist.
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
  const gesamt = { ...LIVE_META };
  const alle = { ...be };
  for (const k of Object.keys(bund)) alle[k] = (alle[k] || 0) + bund[k];
  return {
    meta: gesamt,
    landWege: LIVE_URTEILE, bundWege: BUND_LIVE,
    zaehlungLand: be, zaehlungBund: bund, zaehlungGesamt: alle,
    // geeignete (real verifizierte) Wege:
    verifizierteWege: Object.entries({ ...LIVE_URTEILE, ...BUND_LIVE }).filter(([, v]) => istVerifiziert(v.urteil)).map(([id]) => id),
    // Bundeswege, die jetzt legitim als 'repariert' gelten (geeignet):
    bundRepariert: Object.entries(BUND_LIVE).filter(([, v]) => istVerifiziert(v.urteil)).map(([id]) => id)
  };
}

module.exports = { LIVE_META, LIVE_URTEILE, WEG_DECKT_KLASSEN, BUND_LIVE, istVerifiziert, klasseLiveVerdict, verifikationSummary };
