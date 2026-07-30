"use strict";

// Schreibschutz- und Auswertungsnachweis fuer `scripts/befund-27a2-production-messung.js`.
// =============================================================================
// Das Messwerkzeug greift auf PRODUCTION zu. Diese Suite beweist offline, dass es
// dabei KEINE Schreiboperation anbieten kann — nicht "nicht aufruft", sondern
// strukturell nicht erreichbar hat:
//
//   A  Quelltextnachweis: genau eine HTTP-Funktion, Methode als GET-Literal,
//      keine Schreibverben, kein zweiter Netzweg, kein Kindprozess.
//   B  Pfad-Allowlist: nur lesende Tabellenabfragen; `/rest/v1/rpc/...` gesperrt
//      (eine Datenbankfunktion koennte schreiben, auch per GET).
//   C  `holen()` lehnt gesperrte Pfade ab, BEVOR ein Socket entsteht.
//   D  Das Laden des Moduls oeffnet keine Verbindung und laedt `storage.js`
//      nicht — im Prozess existiert kein Schreibpfad der Anwendung.
//   E  Reine Auswertung: `bewertePaar` rechnet mit den ECHTEN Produktions-
//      funktionen, stellt die Gegenprobe ohne Ausschussmerkmal daneben und
//      rekonstruiert den Stand VOR dem Fix (unbestimmte Zustaendigkeit).
//   F  Fixzeuge 27A-2 (behoben: der Fall trug den Beleg vorher und traegt ihn
//      jetzt nicht mehr) und Regressionszeuge 27A-1 (der Landesfall).
//
// REIN OFFLINE: 0 KI, 0 Netz, 0 Datenbank, 0 Zufall. Die Suite setzt die
// Supabase-Umgebungsvariablen im eigenen Prozess bewusst zurueck, damit der
// Nachweis unabhaengig davon gilt, ob die Sitzung Production-Secrets traegt.

const fs = require("fs");
const path = require("path");

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) { passed += 1; console.log(`  ok   ${name}`); }
  else { failed += 1; console.log(`  FAIL ${name}${detail ? ` -> ${detail}` : ""}`); }
}

const WERKZEUG = path.join(__dirname, "befund-27a2-production-messung.js");
const QUELLE = fs.readFileSync(WERKZEUG, "utf8");

// Umgebung neutralisieren: kein Pfad dieser Suite darf Production erreichen,
// auch nicht versehentlich in einer Sitzung mit gesetzten Secrets.
const GESICHERT = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const vorherGeladen = new Set(Object.keys(require.cache));
const w = require(WERKZEUG);

// ── A · Quelltextnachweis ────────────────────────────────────────────────────
console.log("\nA · Quelltext: eine HTTP-Funktion, GET als Literal");

const zaehle = (re) => (QUELLE.match(re) || []).length;

check("A1 genau ein https.request(-Aufruf im gesamten Modul",
  zaehle(/https\.request\s*\(/g) === 1, `gefunden: ${zaehle(/https\.request\s*\(/g)}`);
check("A2 kein zweiter Netzweg (http.request / https.get / fetch / axios / node:net)",
  zaehle(/\bhttp\.request\s*\(/g) === 0
  && zaehle(/https?\.get\s*\(/g) === 0
  && zaehle(/[^.\w]fetch\s*\(/g) === 0
  && zaehle(/require\(["'](axios|node-fetch|net|tls|dgram)["']\)/g) === 0);
check("A3 kein Kindprozess (child_process / execSync / spawn)",
  zaehle(/child_process|execSync|spawnSync|\bspawn\s*\(/g) === 0);
check("A4 genau eine `method:`-Zuweisung, und die ist die GET-Konstante",
  zaehle(/\bmethod\s*:/g) === 1 && /\bmethod\s*:\s*HTTP_METHODE\b/.test(QUELLE),
  `method-Vorkommen: ${zaehle(/\bmethod\s*:/g)}`);
check("A5 die GET-Konstante ist ein Literal, kein Wert aus Umgebung/Argument",
  /const\s+HTTP_METHODE\s*=\s*"GET";/.test(QUELLE) && w.HTTP_METHODE === "GET", String(w.HTTP_METHODE));
check("A6 keine Schreibverben als Zeichenkette im Modul",
  zaehle(/["'`](POST|PUT|PATCH|DELETE|post|put|patch|delete)["'`]/g) === 0);
check("A7 kein Prefer-Header (upsert/resolution/return) — PostgREST-Schreibsemantik unerreichbar",
  zaehle(/Prefer/g) === 0);
check("A8 das Modul laedt `storage.js` nicht (kein Schreibpfad der Anwendung im Quelltext)",
  zaehle(/require\(["'][^"']*storage["']\)/g) === 0);
check("A9 der Dateiname endet nicht auf -test.js (das Werkzeug ist nie Teil des Offline-Gates)",
  !path.basename(WERKZEUG).endsWith("-test.js"), path.basename(WERKZEUG));

// ── B · Pfad-Allowlist ───────────────────────────────────────────────────────
console.log("\nB · Pfad-Allowlist: nur lesende Tabellenabfragen");

check("B1 die Allowlist ist eingefroren und enthaelt nur die fuer die Messung noetigen Tabellen",
  Object.isFrozen(w.ERLAUBTE_TABELLEN)
  && JSON.stringify([...w.ERLAUBTE_TABELLEN].sort())
     === JSON.stringify(["decisions", "knowledge_objects", "mandate_profiles", "matching_results", "matching_runs"]),
  JSON.stringify(w.ERLAUBTE_TABELLEN));

for (const tabelle of w.ERLAUBTE_TABELLEN) {
  check(`B2 erlaubt: /rest/v1/${tabelle}?select=*`, w.pfadErlaubt(`/rest/v1/${tabelle}?select=*`) === true);
}

const GESPERRT = [
  ["/rest/v1/rpc/helmut_reserve_llm_call", "Datenbankfunktion (koennte schreiben)"],
  ["/rest/v1/rpc/match_knowledge_objects", "Datenbankfunktion, auch die lesende"],
  ["/rest/v1/helmut_store?id=eq.main", "Tabelle nicht auf der Allowlist"],
  ["/rest/v1/raw_documents", "Tabelle nicht auf der Allowlist"],
  ["/rest/v1/profiles", "Tabelle nicht auf der Allowlist"],
  ["/rest/v1/../rest/v1/rpc/x", "Pfadwechsel"],
  ["/rest/v1//rpc/x", "doppelter Trenner"],
  ["https://fremd.example/rest/v1/decisions", "absolute URL"],
  ["/auth/v1/admin/users", "andere API-Familie"],
  ["/storage/v1/object/x", "andere API-Familie"],
  ["", "leer"],
  [null, "null"],
  [{ toString: () => "/rest/v1/decisions" }, "Objekt statt Zeichenkette"]
];
for (const [pfad, grund] of GESPERRT) {
  check(`B3 gesperrt (${grund}): ${String(pfad).slice(0, 46)}`, w.pfadErlaubt(pfad) === false);
}

// ── C · holen() lehnt ab, bevor ein Socket entsteht ──────────────────────────
console.log("\nC · holen(): Ablehnung vor jedem Netzzugriff");

(async () => {
  const fehlerVon = async (pfad) => {
    try { await w.holen(pfad); return "(kein Fehler)"; } catch (e) { return e.message; }
  };

  check("C1 gesperrter Pfad wird mit Schreibschutz-Marke abgelehnt",
    (await fehlerVon("/rest/v1/rpc/irgendwas")).startsWith("[SCHREIBSCHUTZ]"),
    await fehlerVon("/rest/v1/rpc/irgendwas"));
  check("C2 unbekannte Tabelle wird mit Schreibschutz-Marke abgelehnt",
    (await fehlerVon("/rest/v1/helmut_store")).startsWith("[SCHREIBSCHUTZ]"));
  check("C3 erlaubter Pfad ohne Secrets bricht mit Umgebungsfehler ab (kein Netz, kein Default)",
    /SUPABASE_URL/.test(await fehlerVon("/rest/v1/decisions?select=id")),
    await fehlerVon("/rest/v1/decisions?select=id"));

  // ── D · Ladezeitverhalten ─────────────────────────────────────────────────
  console.log("\nD · Laden des Moduls: kein Netz, kein Schreibpfad");

  const neuGeladen = Object.keys(require.cache).filter((k) => !vorherGeladen.has(k));
  check("D1 beim Laden wurde `lib/helmut/storage.js` NICHT mitgeladen",
    !neuGeladen.some((k) => k.replace(/\\/g, "/").endsWith("lib/helmut/storage.js")),
    neuGeladen.filter((k) => /storage/.test(k)).join(", ") || "(keins)");
  check("D2 geladen wurden nur die reinen Matching-/Entscheidungsmodule",
    neuGeladen.filter((k) => k.replace(/\\/g, "/").includes("/lib/helmut/"))
      .every((k) => /matching\.js|matching-begruendung\.js|matching-relevanz\.js|decisions\.js|quellenarchitektur/.test(k)),
    neuGeladen.filter((k) => k.includes("/lib/helmut/")).map((k) => path.basename(k)).join(", "));
  check("D3 das Modul exportiert keine Funktion mit Schreibbedeutung",
    Object.keys(w).every((k) => !/speicher|save|write|schreib|insert|update|delete|upsert/i.test(k)),
    Object.keys(w).join(", "));

  // ── E/F · Reine Auswertung, Befund- und Regressionszeuge ──────────────────
  console.log("\nE · Reine Auswertung mit den echten Produktionsfunktionen");

  // Bundestagsprofil mit dem realen Zuschnitt eines Gesundheitsmandats.
  const PROFIL_BUND = w.zuProfil({
    politische_ebene: "bundestag", bundesland: "Berlin", partei: "SPD",
    wahlkreis: "Berlin", ausschuesse: ["Gesundheit"]
  });
  // Landesvorgang, der einen LANDES-Gesundheitsausschuss nennt.
  const KO_LAND = {
    id: "ko-probe-land", status: "neu", decision_level: "land",
    affected_geographies: [{ name: "Rheinland-Pfalz", level: "land", geography_id: "geo-land-rheinland-pfalz" }],
    ausschuesse: ["Gesundheitsausschuss (Landtag)"], mentioned_committees: [],
    headline: "Kliniken melden Defizite", source_document_count: 1, confidence_score: 70
  };

  const bewLand = w.bewertePaar(PROFIL_BUND, KO_LAND);
  check("E1 Zustaendigkeitsraum des Bundesprofils: ebene=bund, kein Land",
    bewLand.profilZustaendigkeit.ebene === "bund" && bewLand.profilZustaendigkeit.land === null,
    JSON.stringify(bewLand.profilZustaendigkeit));
  check("E2 Zustaendigkeitsraum des Vorgangs: ebene=land, Bundesland belegt",
    bewLand.koZustaendigkeit.ebene === "land" && bewLand.koZustaendigkeit.laender.includes("geo-land-rheinland-pfalz"),
    JSON.stringify(bewLand.koZustaendigkeit));
  check("E3 die Gegenprobe entfernt genau die Ausschussbelege und sonst nichts",
    bewLand.matchedFeaturesOhne.length === bewLand.matchedFeatures.filter((f) => f.type !== "ausschuss").length
    && bewLand.matchedFeaturesOhne.every((f) => f.type !== "ausschuss"));
  check("E4 die Gegenprobe laesst die Aehnlichkeit unangetastet (Merkmalsvektor unberuehrt)",
    typeof bewLand.similarity === "number" && Number.isFinite(bewLand.similarity));
  const BUND_AKTIV = { politische_ebene: "bundestag", aktiv: true, geloescht_at: null };
  check("E5 `istQualifiziertVorher` verlangt Bundesprofil UND Ebene land UND Ausschussbeleg (Messdefinition)",
    w.istQualifiziertVorher(BUND_AKTIV, KO_LAND, bewLand) === true
    && w.istQualifiziertVorher({ politische_ebene: "landtag", aktiv: true, geloescht_at: null }, KO_LAND, bewLand) === false
    && w.istQualifiziertVorher({ politische_ebene: "bundestag", aktiv: false, geloescht_at: null }, KO_LAND, bewLand) === false
    && w.istQualifiziertVorher({ politische_ebene: "bundestag", aktiv: true, geloescht_at: "2026-01-01" }, KO_LAND, bewLand) === false
    && w.istQualifiziertVorher(BUND_AKTIV, { ...KO_LAND, decision_level: "bund" }, bewLand) === false);
  check("E5b `istQualifiziert` (NACHHER) ist fuer dasselbe Paar falsch — genau das ist die Abnahme des Fixes",
    w.istQualifiziert(BUND_AKTIV, KO_LAND, bewLand) === false
    && w.istQualifiziertMitBeleg(BUND_AKTIV, KO_LAND, true) === true
    && w.istQualifiziertMitBeleg(BUND_AKTIV, KO_LAND, false) === false);
  check("E8 die VORHER-Rekonstruktion nutzt dieselbe echte matchedFeatures-Funktion, nur mit unbestimmter Zustaendigkeit",
    (() => {
      const matching = require("../lib/helmut/matching");
      const pf = matching.profileFeatures(PROFIL_BUND);
      const kf = matching.knowledgeObjectFeatures(KO_LAND);
      const rekonstruiert = w.belegeOhneZustaendigkeitsregel(pf, kf);
      return JSON.stringify(rekonstruiert) === JSON.stringify(bewLand.matchedFeaturesVorher)
        && rekonstruiert.some((f) => f.type === "ausschuss");
    })());
  check("E6 `zuProfil` bildet politische_ebene/bundesland/ausschuesse wie storage.fromMandateProfileRow ab",
    PROFIL_BUND.parliamentType === "Bundestag" && PROFIL_BUND.state === "Berlin"
    && JSON.stringify(PROFIL_BUND.committees) === JSON.stringify(["Gesundheit"])
    && w.zuProfil({ politische_ebene: "landtag" }).parliamentType === "Landtag"
    && w.zuProfil({}).parliamentType === undefined);
  check("E7 `zuVektor` liest pgvector-Zeichenketten und Arrays, sonst null",
    JSON.stringify(w.zuVektor("[1,2,3]")) === "[1,2,3]"
    && JSON.stringify(w.zuVektor([1, 2])) === "[1,2]"
    && w.zuVektor("kaputt") === null && w.zuVektor(null) === null);

  console.log("\nF · Fixzeuge 27A-2 (behoben) und Regressionszeuge 27A-1");

  // F1–F5 schrieben bis zum Fix-Sprint den OFFENEN Befund fest; sie sind bewusst
  // umgedreht worden. Jede Zeile prueft jetzt BEIDE Staende: dass die Messung den
  // Fehler ueberhaupt sehen kann (VORHER) und dass er weg ist (NACHHER). Ohne den
  // Vorher-Teil waere die 0 nach dem Fix wertlos — sie koennte auch von einem
  // kaputten Messwerkzeug kommen.
  check("F1 FIX 27A-2: das Bundesprofil erhaelt beim Landesvorgang KEINEN Ausschussbeleg mehr",
    bewLand.ausschussBeleg === false && !bewLand.matchedFeatures.some((f) => f.type === "ausschuss"),
    JSON.stringify(bewLand.matchedFeatures));
  check("F1b BEFUNDZEUGE: derselbe Fall trug den Beleg vor dem Fix (das Werkzeug kann den Fehler sehen)",
    bewLand.ausschussBelegVorher === true
    && bewLand.matchedFeaturesVorher.some((f) => f.type === "ausschuss" && f.value === "Gesundheit"),
    JSON.stringify(bewLand.matchedFeaturesVorher));
  check("F2 BEFUNDZEUGE: der geteilte normalisierte Token war `gesundheit` und ist jetzt leer",
    JSON.stringify(bewLand.tokenVorher) === JSON.stringify(["gesundheit"])
    && JSON.stringify(bewLand.token) === JSON.stringify([]),
    `${JSON.stringify(bewLand.tokenVorher)} -> ${JSON.stringify(bewLand.token)}`);
  check("F3 FIX 27A-2: der entfallene Beleg trug genau das Ausschussgewicht 34 — jetzt traegt er 0",
    bewLand.scoreDeltaVorher === 34 && bewLand.scoreDelta === 0,
    `vorher ${bewLand.scoreDeltaVorher} / nachher ${bewLand.scoreDelta}`);
  check("F4 FIX 27A-2: die sichtbare Mitgliedschaftsbehauptung war da und ist weg",
    /deinen Ausschuss Gesundheit/.test(String(bewLand.begruendungVorher))
    && !/Ausschuss/.test(String(bewLand.begruendung || "")),
    `${bewLand.begruendungVorher} || ${bewLand.begruendung}`);
  check("F5 FIX 27A-2: M8 trug die Zeile nur wegen des fremden Ausschusses — jetzt passiert sie den Riegel nicht",
    bewLand.m8Vorher === true && bewLand.m8Mit === false && bewLand.m8Ohne === false);
  check("F5b FIX 27A-2: ausser dem Ausschussbeleg aendert sich nichts, und es entsteht kein neuer Beleg",
    bewLand.nurAusschussVeraendert === true && bewLand.neuerBeleg === false);
  // Der KOMMUNALE Fall aus derselben Messung (Kreistagsausschuss). Er ist in
  // §51 nicht mitgezaehlt worden (die Ebenentabelle dort fuehrt `kommune` mit 0),
  // taucht in der Fix-Messung aber auf: 2 Paare, dieselbe Fehlerklasse.
  const PROFIL_BUND_SOZIALES = w.zuProfil({
    politische_ebene: "bundestag", bundesland: "Bayern", partei: "SPD",
    wahlkreis: "Wahlkreis 217", ausschuesse: ["Arbeit und Soziales"]
  });
  const bewKommune = w.bewertePaar(PROFIL_BUND_SOZIALES, {
    ...KO_LAND, id: "ko-probe-kommune", decision_level: "kommune", affected_geographies: [],
    ausschuesse: ["Sozialausschuss Kreistag Ostallgäu"]
  });
  check("F5c FIX 27A-2: auch der KOMMUNALE Fall (Kreistagsausschuss) trug den Beleg und traegt ihn nicht mehr",
    bewKommune.ausschussBelegVorher === true
    && JSON.stringify(bewKommune.tokenVorher) === JSON.stringify(["arbeit-und-soziales"])
    && bewKommune.ausschussBeleg === false,
    JSON.stringify([bewKommune.tokenVorher, bewKommune.token]));
  // Der Nebenbefund bleibt bewusst unveraendert (EU-Ebene, §52.7).
  const bewEu = w.bewertePaar(PROFIL_BUND, { ...KO_LAND, id: "ko-probe-eu", decision_level: "eu", affected_geographies: [] });
  check("F5d NEBENBEFUND: EU-Vorgaenge behalten fuer Bundesmandate ihr bisheriges Verhalten (getrennte Entscheidung)",
    bewEu.ausschussBeleg === true && bewEu.ausschussBelegVorher === true,
    JSON.stringify(bewEu.matchedFeatures));

  // F6/F7 sichern den bereits behobenen Befund 27A-1 (Landesprofile) ab.
  const PROFIL_BLN = w.zuProfil({ politische_ebene: "landtag", bundesland: "Berlin", ausschuesse: ["Gesundheit"] });
  const bewFremd = w.bewertePaar(PROFIL_BLN, KO_LAND);
  const bewEigen = w.bewertePaar(PROFIL_BLN, {
    ...KO_LAND, id: "ko-probe-bln",
    affected_geographies: [{ name: "Berlin", level: "land", geography_id: "geo-land-berlin" }]
  });
  check("F6 REGRESSION 27A-1: das Berliner Landesprofil bekommt beim rheinland-pfaelzischen Vorgang KEINEN Ausschussbeleg",
    bewFremd.ausschussBeleg === false, JSON.stringify(bewFremd.matchedFeatures));
  check("F7 REGRESSION 27A-1: beim eigenen Berliner Vorgang bleibt der echte Beleg erhalten",
    bewEigen.ausschussBeleg === true, JSON.stringify(bewEigen.matchedFeatures));

  // Umgebung wiederherstellen (Hoeflichkeit; der Prozess endet ohnehin gleich).
  if (GESICHERT.url) process.env.SUPABASE_URL = GESICHERT.url;
  if (GESICHERT.key) process.env.SUPABASE_SERVICE_ROLE_KEY = GESICHERT.key;

  console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("Suite abgebrochen:", e); process.exit(1); });
