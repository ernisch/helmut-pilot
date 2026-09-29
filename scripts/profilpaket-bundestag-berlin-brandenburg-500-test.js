"use strict";

// Helmut — gezielter OFFLINE-Test des 500er Importpakets Bundestag/Berlin/Brandenburg.
// =============================================================================================
// Dieses Paket daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json ist eine reine
// Offline-Ableitung der bereits belegten 500 Datensaetze aus
// docs/betrieb/500-profilfeldbelege-20260927.json. Es ist KEINE Import-, Provisionierungs- oder
// Aktivierungsfreigabe und loest keinerlei Wirkung aus: das Skript liest nur Dateien und ruft
// ausschliesslich die reinen Pruef-/Abbildungsfunktionen des Importvertrags auf.
//
// Geprueft wird:
//   1. der Importvertrag (lib/helmut/profil-import.js, aus schemas/mandatsprofil-import.schema.json
//      abgeleitet) akzeptiert das Paket vollstaendig: exakt 500 valide Profile, keine globalen
//      Fehler, alle aktiv:false;
//   2. exakt die Ebenenverteilung 330 Bundestag / 120 Berlin / 50 Brandenburg;
//   3. keine Dubletten der relevanten Identitaeten (Kennung, Vollname, amtliche Profilseite) —
//      und der Pruefer erkennt solche Dubletten nachweislich (synthetische Gegenbeispiele);
//   4. die AfD-Sperre greift ueber aktuelle Partei UND aktuelle Fraktion, auch bei
//      Fraktionslosigkeit mit fortbestehender AfD-Parteimitgliedschaft, und bleibt fuer
//      Nachrichten/Themen über die AfD offen (synthetische Einzelfaelle, NIE Paketprofile);
//   5. das Paket bewahrt aktiv:false und importfreigegeben:false und loest keinen Import,
//      keine Provisionierung und keine Aktivierung aus; es ist eine unveraenderte, nachvollziehbare
//      Ableitung der Belegdatei.
//
// KEIN Netzwerk, KEINE DB, KEIN Modellaufruf, KEINE Schreibwirkung, keine Production-Aktion.
//
// Aufruf:  node scripts/profilpaket-bundestag-berlin-brandenburg-500-test.js

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
process.env.HELMUT_SOURCE_MODE = "off";

const IMPORT = require(path.join(ROOT, "lib/helmut/profil-import.js"));
const ZULASSUNG = require(path.join(ROOT, "lib/helmut/profil-zulassung.js"));

const PAKET_PFAD = path.join(ROOT, "daten", "mandatsprofile-bundestag-berlin-brandenburg-20260929.json");
const BELEG_PFAD = path.join(ROOT, "docs", "betrieb", "500-profilfeldbelege-20260927.json");
const ERWARTET = { bundestag: 330, "landtag-berlin": 120, "landtag-brandenburg": 50 };
const AUD = JSON.stringify;

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }
function normal(v) { return String(v == null ? "" : v).trim().toLowerCase().replace(/\s+/g, " "); }

// Ein vertragskonformes synthetisches Profil. Bewusst nur fuer Gegenbeispiele und die
// AfD-Sperre — es wird NIE in das Paket geschrieben. Der SYNTHETISCH-Marker macht es als
// Testfall erkennbar (keine erfundene Recherche-URL).
function synthetisch(ueber = {}) {
  return {
    mandatsId: "synthetischer-fall",
    vollname: "Synthetische Person",
    parlament: "bundestag",
    bundesland: "Berlin",
    wahlkreis: "Synthetischer Wahlkreis",
    ausschuesse: ["Ausschuss für Sport"],
    offizielleQuellen: [{ art: "parlament-profil", url: "https://www.bundestag.de/SYNTHETISCH/profil" }],
    aktiv: false,
    ...ueber
  };
}

function main() {
  console.log("Helmut — Offline-Importpaket 500 Zielprofile Bundestag/Berlin/Brandenburg\n");

  const paket = JSON.parse(fs.readFileSync(PAKET_PFAD, "utf8"));
  const beleg = JSON.parse(fs.readFileSync(BELEG_PFAD, "utf8"));
  const roh = JSON.stringify(paket);
  const profile = paket.profile;

  // ── 1 · Importvertrag: exakt 500 valide Profile, keine globalen Fehler ────────────────────
  abschnitt("1 · Der bestehende Import-/Schema-Validator akzeptiert das Paket vollständig");
  const ergebnis = IMPORT.pruefeImport(paket);
  check("1.1 Vertragsversion ist die aktuelle", paket.version === IMPORT.VERTRAGSVERSION, paket.version);
  check("1.2 Exakt 500 Profilobjekte", ergebnis.profile === 500 && profile.length === 500,
    `profile=${ergebnis.profile}`);
  check("1.3 Alle 500 Profile einzeln gültig", ergebnis.gueltig === 500, `${ergebnis.gueltig}/500`);
  check("1.4 Keine globalen Fehler (Version/Dubletten/Quelle)", ergebnis.fehler.length === 0,
    ergebnis.fehler.map((f) => f.code).join(", ") || "0 Befunde");
  check("1.5 Der Prüfer meldet „importierbar“", ergebnis.ok === true);
  check("1.6 Zusammenfassung bestätigt: alle Profile deaktiviert", ergebnis.zusammenfassung.alleAktivFalse === true);

  // ── 2 · Ebenenverteilung ──────────────────────────────────────────────────────────────────
  abschnitt("2 · Ebenenverteilung exakt 330/120/50");
  const zaehlung = {};
  for (const p of profile) zaehlung[p.parlament] = (zaehlung[p.parlament] || 0) + 1;
  check("2.1 Importvertrag zählt 330 Bundestag / 120 Berlin / 50 Brandenburg",
    AUD(ergebnis.zusammenfassung.nachParlament) === AUD(ERWARTET),
    AUD(ergebnis.zusammenfassung.nachParlament));
  check("2.2 Direkte Zählung der Profilobjekte stimmt überein", AUD(zaehlung) === AUD(ERWARTET), AUD(zaehlung));
  check("2.3 Kein fremdes/unbekanntes Parlament im Paket",
    profile.every((p) => Object.prototype.hasOwnProperty.call(ERWARTET, p.parlament)));
  check("2.4 Nur die drei unterstützten Parlamente sind im Vertrag erlaubt",
    Object.keys(IMPORT.AMTLICHE_HOSTS).every((k) => Object.prototype.hasOwnProperty.call(ERWARTET, k)));

  // ── 3 · Dubletten der relevanten Identitäten ──────────────────────────────────────────────
  abschnitt("3 · Keine Dubletten der relevanten Identitäten");
  const ids = new Set(profile.map((p) => String(p.mandatsId || "").toLowerCase()));
  const namen = new Set(profile.map((p) => normal(p.vollname)));
  const url = (p) => {
    const q = (p.offizielleQuellen || []).find((x) => x && x.art === "parlament-profil");
    return q ? String(q.url).toLowerCase().replace(/\/+$/, "") : null;
  };
  const quellen = new Set(profile.map(url).filter(Boolean));
  check("3.1 500 verschiedene Mandatskennungen", ids.size === 500, `distinct=${ids.size}`);
  check("3.2 500 verschiedene Vollnamen", namen.size === 500, `distinct=${namen.size}`);
  check("3.3 500 verschiedene amtliche Profilseiten", quellen.size === 500, `distinct=${quellen.size}`);
  check("3.4 Der Importvertrag meldet keinerlei dublette-* (Kennung/Name/Quelle)",
    ergebnis.fehler.every((f) => !String(f.code).startsWith("dublette-")));

  // Die Erkennung muss belegt sein, nicht nur behauptet: synthetische Gegenbeispiele.
  const urlA = "https://www.bundestag.de/SYNTHETISCH/a";
  const urlB = "https://www.bundestag.de/SYNTHETISCH/b";
  const p1 = synthetisch({ mandatsId: "synthetisch-a", vollname: "Synthetischer Fall A", offizielleQuellen: [{ art: "parlament-profil", url: urlA }] });
  const p2 = synthetisch({ mandatsId: "synthetisch-b", vollname: "Synthetischer Fall B", offizielleQuellen: [{ art: "parlament-profil", url: urlB }] });
  const codesFuer = (liste) => {
    const e = IMPORT.pruefeImport({ version: IMPORT.VERTRAGSVERSION, profile: liste });
    return new Set(e.fehler.map((f) => f.code));
  };
  check("3.5 Doppelte Kennung wird erkannt",
    codesFuer([p1, { ...p2, mandatsId: "synthetisch-a" }]).has("dublette-mandatsId"));
  check("3.6 Doppelter Vollname wird erkannt",
    codesFuer([p1, { ...p2, vollname: "Synthetischer Fall A" }]).has("dublette-name"));
  check("3.7 Doppelte amtliche Profilseite wird erkannt",
    codesFuer([p1, { ...p2, offizielleQuellen: [{ art: "parlament-profil", url: urlA }] }]).has("dublette-quelle"));

  // ── 4 · AfD-Sperre: aktuelle Partei UND aktuelle Fraktion, auch fraktionslos ──────────────
  abschnitt("4 · AfD-Sperre über Partei und Fraktion (synthetisch, nie Paketprofil)");
  // Ohne diese Prüfung wäre 4.1/4.2 auch dann grün, wenn das Paket gar keine Partei-/
  // Fraktionsangaben trüge — die Sperre würde dann nur scheinbar greifen.
  const mitZugehoerigkeit = profile.filter((p) => (typeof p.partei === "string" && p.partei.trim())
    || (typeof p.fraktion === "string" && p.fraktion.trim()) || p.fraktionslos === true);
  check("4.0 Jedes Paketprofil weist Partei/Fraktion (oder ausdrücklich fraktionslos) aus",
    mitZugehoerigkeit.length === 500, `${mitZugehoerigkeit.length}/500 belegt`);
  check("4.1 Kein Paketprofil ist über Partei/Fraktion ausgeschlossen",
    profile.every((p) => ZULASSUNG.istAusgeschlossen(p) === false));
  check("4.2 Kein Paketprofil trägt eine AfD-Partei oder AfD-Fraktion",
    profile.every((p) => p.partei !== "AfD" && p.fraktion !== "AfD"
      && !/afd|alternative f(ü|ue)r deutschland/i.test(`${p.partei || ""} ${p.fraktion || ""}`)));

  const afdNegativ = [
    ["Partei AfD und Fraktion AfD", { partei: "AfD", fraktion: "AfD" }],
    ["nur Fraktion AfD (Partei SPD)", { partei: "SPD", fraktion: "AfD" }],
    ["nur Partei „Alternative für Deutschland“", { partei: "Alternative für Deutschland" }],
    ["fraktionslos mit fortbestehender AfD-Partei", { partei: "AfD", fraktionslos: true }],
    ["fraktionslos + Fraktionsangabe „Fraktionslos“, Partei AfD", { partei: "AfD", fraktion: "Fraktionslos", fraktionslos: true }],
    ["CDU-Partei, AfD-Bundestagsfraktion", { partei: "CDU", fraktion: "AfD-Bundestagsfraktion" }],
    ["Fraktionsangabe „fraktionslos / AfD“", { fraktion: "fraktionslos / AfD" }]
  ];
  for (const [name, ueber] of afdNegativ) {
    const p = synthetisch(ueber);
    const pruef = IMPORT.pruefeProfil(p, { index: 0 });
    check(`4.x AfD-Sperre greift: ${name}`,
      ZULASSUNG.istAusgeschlossen(p) === true
      && pruef.fehler.some((f) => f.code === "profil-zielgruppe-ausgeschlossen"),
      ZULASSUNG.istAusgeschlossen(p) ? "ausgeschlossen" : "NICHT ausgeschlossen");
  }

  // Nachrichten/Themen über die AfD bleiben für andere Profile erlaubt — nur die Zugehörigkeit sperrt.
  const afdOffen = [
    ["SPD mit Themenbezug AfD beobachten", { partei: "SPD", fraktion: "SPD", themen: ["AfD beobachten"], notiz: "ehemals AfD" }],
    ["CDU/CSU", { partei: "CDU", fraktion: "CDU/CSU" }],
    ["Bündnis 90/Die Grünen", { partei: "Bündnis 90/Die Grünen", fraktion: "Bündnis 90/Die Grünen" }],
    ["Die Linke", { partei: "Die Linke", fraktion: "Die Linke" }],
    ["BSW fraktionslos mit Partei", { partei: "BSW", fraktionslos: true }],
    ["SSW fraktionslos mit Partei (realer Falltyp)", { partei: "SSW", fraktionslos: true }]
  ];
  for (const [name, ueber] of afdOffen) {
    check(`4.y zulässig (keine AfD-Zugehörigkeit): ${name}`,
      ZULASSUNG.istAusgeschlossen(synthetisch(ueber)) === false);
  }
  check("4.3 AfD-Negativfälle liegen NUR als lokale Objekte vor, nicht im Paket",
    AFD_NEGATIV_KENNUNGEN.every((id) => !ids.has(id)));

  // ── 5 · Kein Import, keine Provisionierung, keine Aktivierung ─────────────────────────────
  abschnitt("5 · Das Paket ist inert: kein Import, keine Provisionierung, keine Aktivierung");
  check("5.1 Jedes Profil trägt wörtlich aktiv:false",
    profile.every((p) => p.aktiv === false));
  check("5.2 Die Abbildung nach Helmut ergibt ausnahmslos profileActive:false",
    profile.every((p) => IMPORT.zuHelmutProfil(p).profileActive === false));
  check("5.3 Kein Schlüssel „aktiv“/„importfreigegeben“ steht auf true (Roh-JSON)",
    !/"aktiv"\s*:\s*true/.test(roh) && !/"importfreigegeben"\s*:\s*true/.test(roh));
  const freigabe = (paket.offlinePaket || {}).importfreigabe || {};
  check("5.4 Das Paket erklärt Import/Provisionierung/Aktivierung ausdrücklich als nicht freigegeben",
    freigabe.freigegeben === false && freigabe.import === false
    && freigabe.provisionierung === false && freigabe.aktivierung === false, AUD(freigabe));
  const status = (paket.offlinePaket || {}).profilstatus;
  check("5.5 Für alle 500 Profile ist aktiv:false und importfreigegeben:false festgehalten",
    Array.isArray(status) && status.length === 500
    && status.every((s) => s.aktiv === false && s.importfreigegeben === false),
    Array.isArray(status) ? `${status.length} Statuszeilen` : "profilstatus fehlt");
  check("5.6 Profilstatus deckt exakt dieselben 500 Kennungen ab",
    Array.isArray(status) && AUD(status.map((s) => s.mandatsId)) === AUD(profile.map((p) => p.mandatsId)));
  check("5.7 Das Paket ist statische JSON-Datei, kein ausführbares Skript", PAKET_PFAD.endsWith(".json"));
  const geladen = Object.keys(require.cache)
    .filter((f) => f.startsWith(ROOT) && !f.includes("node_modules"))
    .filter((f) => /provisioning|storage|supabase|scheduler|server\.js|profile-db/.test(f));
  check("5.8 Der Test lädt keinerlei Schreib-/Provisionierungs-/DB-Pfad",
    geladen.length === 0, geladen.map((f) => path.relative(ROOT, f)).join(", ") || "keine");
  check("5.9 Der Importprüfer ist rein (zweifacher Aufruf liefert dasselbe Ergebnis)",
    AUD(IMPORT.pruefeImport(paket).zusammenfassung) === AUD(ergebnis.zusammenfassung));
  // Die Offline-Metadaten (importfreigabe/profilstatus) sind keine Profilfelder: der
  // Vertragsteil aus `version` + `profile` validiert identisch. Damit ist belegt, dass die
  // Release-Metadaten den Importvertrag weder erweitern noch eine Wirkung ausloesen.
  check("5.10 Offline-Metadaten sind vertragsinert (Vertragsteil validiert identisch)",
    AUD(IMPORT.pruefeImport({ version: paket.version, profile: paket.profile }).zusammenfassung)
      === AUD(ergebnis.zusammenfassung));

  // ── 6 · Nachvollziehbarkeit: unveränderte Ableitung der Belegdatei ─────────────────────────
  abschnitt("6 · Nachvollziehbarkeit: unveränderte Ableitung der 500 Feldbelege");
  const quelle = beleg.datensaetze;
  check("6.1 Belegdatei trägt weiterhin exakt 500 Datensätze", quelle.length === 500, `${quelle.length}`);
  check("6.2 Belegdatei bleibt vollständig inaktiv und nicht importfreigegeben",
    quelle.every((d) => d.aktiv === false && d.importfreigegeben === false && d.profil.aktiv === false));
  check("6.3 Paketprofile sind wörtlich die belegten Profilobjekte (nichts erfunden/geändert)",
    AUD(profile) === AUD(quelle.map((d) => d.profil)));
  check("6.4 Paketreihenfolge entspricht der Belegreihenfolge",
    AUD(profile.map((p) => p.mandatsId)) === AUD(quelle.map((d) => d.kanonischeKennung)));
  check("6.5 Vertragsformat der Belegdatei = Paketversion", beleg.vertragsformat === paket.version);
  check("6.6 Paket trägt keine SYNTHETISCH-Quelle (dies ist eine reale Belegableitung)",
    !/SYNTHETISCH/.test(fs.readFileSync(PAKET_PFAD, "utf8")));

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (Prüfungen ${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

// Die Kennungen der ausschliesslich synthetischen AfD-Negativfälle dürfen nie im Paket auftauchen.
const AFD_NEGATIV_KENNUNGEN = ["synthetischer-fall", "synthetisch-a", "synthetisch-b"];

main();
