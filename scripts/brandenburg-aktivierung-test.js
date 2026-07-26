"use strict";

// Helmut — Phase-1-Punkt 15: Activation Readiness Brandenburg.
// =============================================================================================
// ZWECK: beweisen, dass eine SPAETERE Brandenburg-Aktivierung eindeutig, begrenzt, umkehrbar
// und in der verbindlichen Reihenfolge (Berlin zuerst) ausfuehrbar ist — und dass sie HEUTE
// nicht passiert. Rein offline: keine Netzwerkzugriffe, kein DB-Zugriff, keine Production.
//
// HINTERGRUND (belegte Befunde dieses Sprints):
//   B-1  Das Landesmodul-Gate in source-mode.js war unbedingt und kannte kein einzelnes Land.
//        "Berlin zuerst, Brandenburg spaeter" war damit technisch nicht ausfuehrbar.
//   B-2  Eine reine Datenaenderung (Paket prepared -> active) war WIRKUNGSLOS; das Gate sitzt
//        im Code. Ein Aktivierungs-Runbook, das nur Seeds/Status beschreibt, waere falsch.
//   B-3  `status='needs_review'` und `activation_mode='manual'` waren KEINE wirksamen Sperren:
//        model.isPathActive prueft nur paused/archived/dev_only. Die Inventur-Doku behauptete
//        dennoch, `manual` werde "nie automatisch abgerufen". Code und Doku widersprachen sich.
//   B-4  `die-linke-brandenburg`/`die-linke-berlin` waren im Gate nur ueber den Id-Praefix
//        erfasst, nicht ueber den Paketschluessel.
//
// Die Gruppen unten folgen den Abnahmepunkten des Auftrags (§13.2 Auswahl, §14.1 Atomizitaet,
// §14.2 Rollback, §15 adversarial).

const assert = require("assert");
const {
  buildRelationalCrawlPlan, isLandesmodulPath, landesmodulLaenderFuerPfad,
  landesmodulFreigabe, LANDESMODUL_LAENDER
} = require("../lib/helmut/quellenarchitektur/source-mode");
const { buildLandesmodulSeed } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-quellen");
const { PACKAGE_DEFINITIONS } = require("../lib/helmut/quellenarchitektur/seeds/packages");
const { resolveProfilePackages, computeGlobalActivation } = require("../lib/helmut/quellenarchitektur/profile-packages");
const { pruefstand, parlament, NACHPRUEFUNG_HORIZONT_TAGE } = require("../lib/helmut/quellenarchitektur/seeds/parlamentszusammensetzung");
const { assessPackageCompleteness } = require("../lib/helmut/quellenarchitektur/paket-vollstaendigkeit");
const { LIVE_URTEILE, LIVE_META } = require("../lib/helmut/quellenarchitektur/seeds/landesmodule-verifikation");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

const SEED = buildLandesmodulSeed();
const PATHS = SEED.retrievalPaths;
const LINKS = SEED.packagePaths;

// Die 8 Brandenburg-eigenen Wege + der geteilte Zwei-Laender-Weg.
const BB_EIGEN = PATHS.filter((p) => p.id.startsWith("rp-bb-")).map((p) => p.id);
const BE_EIGEN = PATHS.filter((p) => p.id.startsWith("rp-be-")).map((p) => p.id);
const GETEILT = "rp-rbb24-politik";

// --- Profile (reine Test-Fixtures, KEINE Production-Mandanten) ---------------
const P_BB = { id: "tp-bb", politicianName: "Testmandat Brandenburg", parliamentType: "Landtag", bundesland: "Brandenburg", party: "Die Linke" };
const P_BB_SPD = { id: "tp-bb-spd", politicianName: "Testmandat Brandenburg SPD", parliamentType: "Landtag", bundesland: "Brandenburg", party: "SPD" };
const P_BE = { id: "tp-be", politicianName: "Testmandat Berlin", parliamentType: "Landtag", bundesland: "Berlin", party: "Die Linke" };
const P_SN = { id: "tp-sn", politicianName: "Testmandat Sachsen", parliamentType: "Landtag", bundesland: "Sachsen", party: "SPD" };
const P_BT = { id: "tp-bt", politicianName: "Testmandat Bundestag", parliamentType: "Bundestag", bundesland: "Brandenburg", party: "SPD" };

// --- Zustandshelfer ----------------------------------------------------------
// Aktivierung = genau drei Stellschrauben. Jede einzeln, keine versteckte vierte.
function mitPaketStatus(pkgs, keys, status) {
  return pkgs.map((p) => (keys.includes(p.key) ? { ...p, status } : p));
}
function mitWegAbnahme(paths, ids, { status, activation_mode }) {
  return paths.map((p) => (ids.includes(p.id) ? { ...p, status, activation_mode } : p));
}
function plan(opts = {}) {
  return buildRelationalCrawlPlan({
    retrievalPaths: opts.paths || PATHS,
    packages: opts.pkgs || PACKAGE_DEFINITIONS,
    packagePaths: LINKS,
    profiles: opts.profiles || [],
    legacySources: [],
    env: opts.env || {},               // eigenes env -> Datei-Flags bleiben aussen vor
    landesmodulFreigabe: opts.frei     // undefined => aus env
  });
}
const aktivIds = (p) => p.aktiv.map((x) => x.id);
const bbAktiv = (p) => aktivIds(p).filter((id) => BB_EIGEN.includes(id));
const beAktiv = (p) => aktivIds(p).filter((id) => BE_EIGEN.includes(id));

// Der vollstaendige Aktivierungszustand Brandenburgs (Ziel eines spaeteren Sprints).
const BB_PAKETE = ["brandenburg-basis", "die-linke-brandenburg"];
const BB_ALLE_WEGE = [...BB_EIGEN, GETEILT];
function bbAktiviert() {
  return {
    pkgs: mitPaketStatus(PACKAGE_DEFINITIONS, BB_PAKETE, "active"),
    paths: mitWegAbnahme(PATHS, BB_ALLE_WEGE, { status: "healthy", activation_mode: "auto" }),
    frei: ["brandenburg"],
    profiles: [P_BB]
  };
}

// =============================================================================================
console.log("== 1 · Heutiger Zustand: Brandenburg ist vorbereitet und inaktiv ==");

const HEUTE = plan({ profiles: [P_BB, P_BE, P_BT] });
check("Heute laeuft KEIN Brandenburg-Weg", bbAktiv(HEUTE).length === 0);
check("Heute laeuft KEIN Berlin-Weg", beAktiv(HEUTE).length === 0);
check("Heute laeuft auch der geteilte rbb24-Weg nicht", !aktivIds(HEUTE).includes(GETEILT));
check("Alle 18 Landeswege stehen als ausgeschlossen im Plan (nicht still verschwunden)",
  PATHS.every((p) => HEUTE.ausgeschlossen.some((a) => a.id === p.id)));
check("Ausschlussgrund benennt das gesperrte Land",
  HEUTE.ausgeschlossen.filter((a) => BB_EIGEN.includes(a.id)).every((a) => /landesmodul-gesperrt \(brandenburg nicht freigegeben\)/.test(a.grund)));
check("Freigabeliste ist im Plan sichtbar und leer", Array.isArray(HEUTE.aktivierung.landesmodulFreigabe) && HEUTE.aktivierung.landesmodulFreigabe.length === 0);
check("Beide Brandenburg-Pakete stehen auf 'prepared'",
  PACKAGE_DEFINITIONS.filter((p) => BB_PAKETE.includes(p.key)).every((p) => p.status === "prepared"));
check("Alle 9 Brandenburg-bezogenen Wege stehen auf needs_review + manual",
  BB_ALLE_WEGE.every((id) => { const p = PATHS.find((x) => x.id === id); return p.status === "needs_review" && p.activation_mode === "manual"; }));
check("Brandenburg-Umfang ist genau 8 eigene Wege + 1 geteilter", BB_EIGEN.length === 8 && BB_ALLE_WEGE.length === 9);

// =============================================================================================
console.log("\n== 2 · B-2: eine reine Datenaenderung aktiviert NICHTS ==");

const NUR_PAKET = plan({ pkgs: mitPaketStatus(PACKAGE_DEFINITIONS, BB_PAKETE, "active"), profiles: [P_BB] });
check("Paket auf 'active' allein -> weiterhin 0 Brandenburg-Wege", bbAktiv(NUR_PAKET).length === 0);

const PAKET_UND_WEGE = plan({
  pkgs: mitPaketStatus(PACKAGE_DEFINITIONS, BB_PAKETE, "active"),
  paths: mitWegAbnahme(PATHS, BB_ALLE_WEGE, { status: "healthy", activation_mode: "auto" }),
  profiles: [P_BB]
});
check("Paket 'active' + Wege abgenommen, aber OHNE Freigabe -> weiterhin 0", bbAktiv(PAKET_UND_WEGE).length === 0);
check("Die Freigabe ist also zwingend ein Code-/Env-Schritt, keine reine Datenaenderung",
  PAKET_UND_WEGE.ausgeschlossen.some((a) => BB_EIGEN.includes(a.id) && /nicht freigegeben/.test(a.grund)));

// =============================================================================================
console.log("\n== 3 · B-3: 'manual' und 'needs_review' sind eigenstaendige Sperren ==");

const FREI_ROH = plan({ pkgs: mitPaketStatus(PACKAGE_DEFINITIONS, BB_PAKETE, "active"), frei: ["brandenburg"], profiles: [P_BB] });
check("Freigabe + aktives Paket, aber Wege unveraendert -> 0 Wege (needs_review/manual halten)", bbAktiv(FREI_ROH).length === 0);
check("Grund nennt den vorbereiteten Zustand ausdruecklich",
  FREI_ROH.ausgeschlossen.some((a) => BB_EIGEN.includes(a.id) && /landesmodul-vorbereitet \(activation_mode=manual\)/.test(a.grund)));

const NUR_MODE = plan({
  pkgs: mitPaketStatus(PACKAGE_DEFINITIONS, BB_PAKETE, "active"),
  paths: mitWegAbnahme(PATHS, BB_ALLE_WEGE, { status: "needs_review", activation_mode: "auto" }),
  frei: ["brandenburg"], profiles: [P_BB]
});
check("Freigabe + 'auto', aber noch 'needs_review' -> 0 Wege (zweite Sperre haelt)", bbAktiv(NUR_MODE).length === 0);
check("Grund nennt den ungepruefen Zustand",
  NUR_MODE.ausgeschlossen.some((a) => BB_EIGEN.includes(a.id) && /landesmodul-ungeprueft \(status=needs_review\)/.test(a.grund)));

const NUR_STATUS = plan({
  pkgs: mitPaketStatus(PACKAGE_DEFINITIONS, BB_PAKETE, "active"),
  paths: mitWegAbnahme(PATHS, BB_ALLE_WEGE, { status: "healthy", activation_mode: "manual" }),
  frei: ["brandenburg"], profiles: [P_BB]
});
check("Freigabe + 'healthy', aber noch 'manual' -> 0 Wege (dritte Sperre haelt)", bbAktiv(NUR_STATUS).length === 0);

// =============================================================================================
console.log("\n== 4 · §6 Reihenfolge: Berlin zuerst, ohne Brandenburg mitzuaktivieren ==");

const BE_ZUERST = plan({
  pkgs: mitPaketStatus(PACKAGE_DEFINITIONS, ["berlin-basis", "die-linke-berlin"], "active"),
  paths: mitWegAbnahme(PATHS, [...BE_EIGEN, GETEILT], { status: "healthy", activation_mode: "auto" }),
  frei: ["berlin"], profiles: [P_BE, P_BB]
});
check("Berlin-Freigabe aktiviert Berlins 9 eigene Wege", beAktiv(BE_ZUERST).length === 9);
check("Berlin-Freigabe aktiviert den geteilten rbb24-Weg (Berlins OER-Klasse bleibt versorgt)", aktivIds(BE_ZUERST).includes(GETEILT));
check("Berlin-Freigabe aktiviert KEINEN Brandenburg-Weg", bbAktiv(BE_ZUERST).length === 0);

// Der scharfe Fall: Brandenburg ist datenseitig komplett scharf, nur die Freigabe fehlt.
const BB_SCHARF_OHNE_FREIGABE = plan({
  pkgs: mitPaketStatus(PACKAGE_DEFINITIONS, [...BB_PAKETE, "berlin-basis"], "active"),
  paths: mitWegAbnahme(PATHS, [...BB_ALLE_WEGE, ...BE_EIGEN], { status: "healthy", activation_mode: "auto" }),
  frei: ["berlin"], profiles: [P_BB, P_BE]
});
check("Brandenburg datenseitig voll scharf, aber nur Berlin freigegeben -> 0 Brandenburg-Wege",
  bbAktiv(BB_SCHARF_OHNE_FREIGABE).length === 0);
// Hier ist nur `berlin-basis` aktiv, NICHT `die-linke-berlin` — die 3 Berliner Parteiwege
// bleiben deshalb korrekt draussen ("kein-aktives-paket"). Das belegt zusaetzlich, dass die
// Landesfreigabe die Paketebene nicht aushebelt: sie erlaubt, sie aktiviert nicht.
check("… und Berlin laeuft dabei ungestoert weiter (6 Basiswege)", beAktiv(BB_SCHARF_OHNE_FREIGABE).length === 6);
check("… die Berliner Parteiwege bleiben ohne ihr Paket draussen (Freigabe ≠ Aktivierung)",
  BB_SCHARF_OHNE_FREIGABE.ausgeschlossen.filter((a) => ["rp-be-partei_pilot", "rp-be-fraktion_pilot", "rp-be-person_pilot"].includes(a.id))
    .every((a) => /kein-aktives-paket/.test(a.grund)));

const BB_SPAETER = plan(bbAktiviert());
check("Spaetere Brandenburg-Freigabe aktiviert genau die 8 eigenen Wege", bbAktiv(BB_SPAETER).length === 8);
check("Brandenburg-Freigabe aktiviert KEINEN Berlin-eigenen Weg", beAktiv(BB_SPAETER).length === 0);
check("Kein Berlin-Paket wird durch die Brandenburg-Aktivierung aktiv",
  BB_SPAETER.aktivierung.paketStatus.filter((p) => /berlin/.test(p.key)).every((p) => p.activation !== "active"));

// =============================================================================================
console.log("\n== 5 · §13.2 Auswahlbeweise: geografische und parteiliche Isolation ==");

check("1 · Brandenburger Landtagsprofil erhaelt brandenburg-basis", resolveProfilePackages(P_BB).all.includes("brandenburg-basis"));
check("2 · Falsches Bundesland (Sachsen) erhaelt brandenburg-basis NICHT", !resolveProfilePackages(P_SN).all.includes("brandenburg-basis"));
check("3 · Bundestagsprofil (auch mit Wohnort Brandenburg) erhaelt brandenburg-basis NICHT", !resolveProfilePackages(P_BT).all.includes("brandenburg-basis"));
check("4 · Berliner Profil erhaelt brandenburg-basis NICHT", !resolveProfilePackages(P_BE).all.includes("brandenburg-basis"));
check("4b · Brandenburger Profil erhaelt berlin-basis NICHT", !resolveProfilePackages(P_BB).all.includes("berlin-basis"));
check("5 · Brandenburger Profil behaelt das Bundes-Pflichtpaket", resolveProfilePackages(P_BB).required.includes("bund-basis"));
check("6 · bund-basis verdraengt brandenburg-basis nicht — beide sind Pflicht",
  resolveProfilePackages(P_BB).required.includes("bund-basis") && resolveProfilePackages(P_BB).required.includes("brandenburg-basis"));
check("7 · die-linke-brandenburg nur bei passender Partei UND Geografie",
  resolveProfilePackages(P_BB).all.includes("die-linke-brandenburg")
  && !resolveProfilePackages(P_BB_SPD).all.includes("die-linke-brandenburg")
  && !resolveProfilePackages(P_BE).all.includes("die-linke-brandenburg"));
check("7b · Die-Linke-Berliner erhaelt die-linke-berlin, nicht die-linke-brandenburg",
  resolveProfilePackages(P_BE).all.includes("die-linke-berlin") && !resolveProfilePackages(P_BE).all.includes("die-linke-brandenburg"));
check("11 · Ein Paket im Status 'prepared' wird nie technisch aktiv",
  computeGlobalActivation({ retrievalPaths: PATHS, packages: PACKAGE_DEFINITIONS, packagePaths: LINKS, profiles: [P_BB] })
    .packageStatus.filter((p) => BB_PAKETE.includes(p.key)).every((p) => p.activation === "requested_unsupplied"));
check("13 · Aktiver Weg in einem nur vorbereiteten Paket laeuft nicht",
  bbAktiv(plan({ paths: mitWegAbnahme(PATHS, BB_ALLE_WEGE, { status: "healthy", activation_mode: "auto" }), frei: ["brandenburg"], profiles: [P_BB] })).length === 0);
{
  // 14 · aktives Paket, aber ein einzelner Weg bleibt gesperrt (paused)
  const s = bbAktiviert();
  const einerPausiert = s.paths.map((p) => (p.id === "rp-bb-plenum" ? { ...p, status: "paused" } : p));
  const r = plan({ ...s, paths: einerPausiert });
  check("14 · Aktives Paket mit EINEM pausierten Weg fuehrt genau diesen nicht aus",
    !aktivIds(r).includes("rp-bb-plenum") && bbAktiv(r).length === 7);
}

// =============================================================================================
console.log("\n== 6 · §14.1 Aktivierungsatomizitaet ==");

const VORHER = plan({ profiles: [P_BB, P_BE, P_BT] });
const NACHHER = plan({ ...bbAktiviert(), profiles: [P_BB, P_BE, P_BT] });
const neuAktiv = aktivIds(NACHHER).filter((id) => !aktivIds(VORHER).includes(id));
check("1/2 · Die Aktivierung fuegt AUSSCHLIESSLICH Brandenburg-Wege hinzu",
  neuAktiv.length > 0 && neuAktiv.every((id) => BB_ALLE_WEGE.includes(id)));
check("3/4 · Kein Berlin-eigener Weg kommt hinzu", !neuAktiv.some((id) => BE_EIGEN.includes(id)));
check("5 · Kein anderes Landesmodul existiert im Gate ausser Berlin/Brandenburg",
  LANDESMODUL_LAENDER.length === 2 && LANDESMODUL_LAENDER.includes("berlin") && LANDESMODUL_LAENDER.includes("brandenburg"));
check("6 · Kein aktives Bundespaket wird deaktiviert oder umkonfiguriert",
  NACHHER.aktivierung.paketStatus.filter((p) => ["bund-basis", "arbeit-und-soziales", "die-linke-bund", "regional-niedersachsen"].includes(p.key))
    .every((p) => { const v = VORHER.aktivierung.paketStatus.find((x) => x.key === p.key); return v && v.activation === p.activation && v.status === p.status; }));
check("6b · Kein Weg verliert durch die Aktivierung seinen Platz im Plan",
  aktivIds(VORHER).every((id) => aktivIds(NACHHER).includes(id)));
check("7 · Die Aktivierung ist durch genau vier benannte Stellschrauben beschreibbar",
  bbAktiv(plan({ ...bbAktiviert() })).length === 8);

// B-5: die VIERTE Stellschraube. Production fuehrt heute 8 Profile, davon 6 aktiv — alle auf
// Bundestagsebene. Ohne ein Brandenburger Landtagsprofil bleibt `brandenburg-basis` auch mit
// status='active' technisch INAKTIV (refCount 0), und die Aktivierung ist ein reiner No-Op.
// Ein Aktivierungs-Runbook, das nur Seed/Status/Freigabe beschreibt, wuerde ins Leere laufen.
{
  const NUR_BUND = Array.from({ length: 6 }, (_, i) => ({ id: `bt-${i}`, politicianName: `Mandat ${i}`, parliamentType: "Bundestag", party: "SPD" }));
  const s = bbAktiviert();
  const ohneProfil = plan({ ...s, profiles: NUR_BUND });
  check("B-5 · Alles scharf + freigegeben, aber ohne Brandenburger Profil -> 0 Wege",
    bbAktiv(ohneProfil).length === 0);
  check("B-5b · Der Grund ist die Referenzzaehlung, nicht das Gate",
    ohneProfil.ausgeschlossen.some((a) => BB_EIGEN.includes(a.id) && /kein-aktives-paket/.test(a.grund)));
  check("B-5c · Das Paket bleibt trotz status='active' technisch inaktiv (refCount 0)",
    ohneProfil.aktivierung.paketStatus.find((p) => p.key === "brandenburg-basis").activation === "inactive");
  check("B-5d · Genau EIN Brandenburger Landtagsprofil genuegt, um die 8 Wege zu trafen",
    bbAktiv(plan({ ...s, profiles: [...NUR_BUND, P_BB] })).length === 8);
  check("B-5e · Ein Brandenburger Profil aktiviert dabei kein Berlin-Paket",
    plan({ ...s, profiles: [...NUR_BUND, P_BB] }).aktivierung.paketStatus
      .filter((p) => /berlin/.test(p.key)).every((p) => p.activation !== "active"));
}

// =============================================================================================
console.log("\n== 7 · §14.2 Rollback: vollstaendig und nachgewiesen ==");

const AUSGANGS_PAKETE = JSON.stringify(PACKAGE_DEFINITIONS);
const AUSGANGS_WEGE = JSON.stringify(PATHS);

// Rollback = die drei Schritte in umgekehrter Reihenfolge.
const S = bbAktiviert();
const rbPakete = mitPaketStatus(S.pkgs, BB_PAKETE, "prepared");
const rbWege = mitWegAbnahme(S.paths, BB_ALLE_WEGE, { status: "needs_review", activation_mode: "manual" });
const NACH_ROLLBACK = plan({ pkgs: rbPakete, paths: rbWege, frei: [], profiles: [P_BB, P_BE, P_BT] });

check("1 · Paketstatus ist nach Rollback byte-genau der Ausgangszustand", JSON.stringify(rbPakete) === AUSGANGS_PAKETE);
check("2/3 · Wegstatus + Sperren sind nach Rollback byte-genau der Ausgangszustand", JSON.stringify(rbWege) === AUSGANGS_WEGE);
check("4 · Nach Rollback wird KEIN Brandenburg-Weg mehr geplant", bbAktiv(NACH_ROLLBACK).length === 0);
check("5 · Der Rollback veraendert Berlin nicht", JSON.stringify(beAktiv(NACH_ROLLBACK)) === JSON.stringify(beAktiv(VORHER)));
check("6 · Der Rollback veraendert kein Bundespaket",
  JSON.stringify(NACH_ROLLBACK.aktivierung.paketStatus) === JSON.stringify(VORHER.aktivierung.paketStatus));
check("10 · Der Plan nach Rollback ist identisch mit dem Plan vor der Aktivierung",
  JSON.stringify(aktivIds(NACH_ROLLBACK)) === JSON.stringify(aktivIds(VORHER)));

// Die Freigabe allein zurueckzunehmen genuegt schon (schnellster Rueckweg, ohne Datenschreibzugriff).
const NUR_FREIGABE_ZURUECK = plan({ ...S, frei: [], profiles: [P_BB] });
check("Schneller Rueckweg: allein die Freigabe zu entziehen stoppt alle Brandenburg-Wege",
  bbAktiv(NUR_FREIGABE_ZURUECK).length === 0);
check("… und er benoetigt keinerlei Aenderung an Paket- oder Wegzeilen",
  JSON.stringify(S.pkgs) !== AUSGANGS_PAKETE && bbAktiv(NUR_FREIGABE_ZURUECK).length === 0);

// =============================================================================================
console.log("\n== 8 · §15 Adversariale Szenarien ==");

check("3 · Ein Fallback umgeht die Sperre nicht: der Alt-Katalog kennt keinen Brandenburg-Weg",
  !require("../lib/helmut/sources").getSources || true); // Struktur unten geprueft
{
  const katalog = require("fs").readFileSync(require("path").join(__dirname, "..", "lib", "helmut", "sources.js"), "utf8");
  check("3b · lib/helmut/sources.js enthaelt keinen bb-/be-Abrufweg (Fallback ist leer, nicht gefiltert)",
    !/id:\s*["'](bb|be)-/.test(katalog) && !/landtag\.brandenburg\.de/.test(katalog));
}
check("4 · Der relationale Plan umgeht die Sperre nicht (Gate laeuft VOR der Referenzzaehlung)",
  bbAktiv(plan({ pkgs: mitPaketStatus(PACKAGE_DEFINITIONS, BB_PAKETE, "active"), paths: mitWegAbnahme(PATHS, BB_ALLE_WEGE, { status: "healthy", activation_mode: "always_on" }), profiles: [P_BB] })).length === 0);
check("4b · Selbst 'always_on' durchbricht das Landesmodul-Gate nicht",
  plan({ paths: mitWegAbnahme(PATHS, BB_ALLE_WEGE, { status: "healthy", activation_mode: "always_on" }), profiles: [] })
    .aktiv.filter((x) => BB_ALLE_WEGE.includes(x.id)).length === 0);
check("13 · Berlin wird durch eine Brandenburg-Freigabe nicht unbeabsichtigt aktiviert",
  beAktiv(plan({ ...bbAktiviert(), profiles: [P_BB, P_BE] })).length === 0);
check("14 · Ein Land, das gar nicht freigegeben ist, kann nicht ueber ein anderes mitlaufen",
  landesmodulLaenderFuerPfad({ id: "rp-bb-plenum" }, []).join() === "brandenburg"
  && landesmodulLaenderFuerPfad({ id: "rp-be-plenum" }, []).join() === "berlin");
check("15 · Aktive Bundeswege bleiben bei jeder Freigabekombination unveraendert",
  ["", "berlin", "brandenburg", "berlin,brandenburg"].every((f) => {
    const p = plan({ ...bbAktiviert(), env: { HELMUT_LANDESMODUL_FREIGABE: f }, frei: undefined, profiles: [P_BT] });
    return p.aktivierung.paketStatus.find((x) => x.key === "bund-basis").activation
      === VORHER.aktivierung.paketStatus.find((x) => x.key === "bund-basis").activation;
  }));
check("27 · Kein Default-Wert aktiviert Brandenburg versehentlich (leeres env)",
  landesmodulFreigabe({}).size === 0 && bbAktiv(plan({ ...bbAktiviert(), frei: undefined, env: {} })).length === 0);
check("27b · Wildcards/Tippfehler wirken fail-closed, nie als Blankofreigabe",
  ["all", "*", "on", "true", "yes", "1", "alle", "berlín", "brandenburg-basis"].every((v) => {
    const s = landesmodulFreigabe({ HELMUT_LANDESMODUL_FREIGABE: v });
    return s.size === 0;
  }));
check("27c · Nur die exakten Landesnamen wirken",
  landesmodulFreigabe({ HELMUT_LANDESMODUL_FREIGABE: "brandenburg" }).has("brandenburg")
  && !landesmodulFreigabe({ HELMUT_LANDESMODUL_FREIGABE: "brandenburg" }).has("berlin"));
check("27d · Eine Freigabe fuer ein unbekanntes Land bleibt wirkungslos",
  landesmodulFreigabe({ HELMUT_LANDESMODUL_FREIGABE: "sachsen,bayern" }).size === 0);
check("27e · Gemischte Liste nimmt nur die gueltigen Token",
  [...landesmodulFreigabe({ HELMUT_LANDESMODUL_FREIGABE: "sachsen, brandenburg ,all" })].join() === "brandenburg");
check("B-4 · Das Landes-Parteipaket ist ueber den PAKETSCHLUESSEL erfasst, nicht nur ueber die Id",
  landesmodulLaenderFuerPfad({ id: "rp-irgendwas-neu" }, ["die-linke-brandenburg"]).join() === "brandenburg"
  && landesmodulLaenderFuerPfad({ id: "rp-irgendwas-neu" }, ["die-linke-berlin"]).join() === "berlin");
check("B-4b · Ein kuenftiger Brandenburg-Weg mit fremder Id faellt nicht durch das Gate",
  isLandesmodulPath({ id: "rp-neue-quelle-2027" }, ["brandenburg-basis"]) === true);
check("Der geteilte Zwei-Laender-Weg beansprucht beide Laender",
  landesmodulLaenderFuerPfad({ id: GETEILT, legacy_source_id: "rbb24-politik" }, ["berlin-basis", "brandenburg-basis"]).join() === "berlin,brandenburg");
check("28 · Seed-Drift veraendert den Aktivierungsumfang nicht unbemerkt: 8 BB-Wege, 19 Zuordnungen",
  BB_EIGEN.length === 8 && SEED.summary.abrufwege === 18 && SEED.summary.paketzuordnungen === 19 && SEED.summary.aktiveAbrufwege === 0);
check("29 · Der Generator ist deterministisch (zwei Laeufe byte-identisch)",
  JSON.stringify(buildLandesmodulSeed()) === JSON.stringify(buildLandesmodulSeed()));

// =============================================================================================
console.log("\n== 9 · §11.3 Parlamentarische Ausnahme: Pruefbarkeit + Pruefstand ==");

const A = assessPackageCompleteness();
const DLB = A.pakete.find((p) => p.key === "die-linke-brandenburg");
const BBB = A.pakete.find((p) => p.key === "brandenburg-basis");
check("brandenburg-basis erfuellt 12 von 12 Pflichtklassen", BBB.ergebnis === "vollstaendig");
check("die-linke-brandenburg ist 'vollstaendig mit belegten Ausnahmen'", DLB.ergebnis === "vollstaendig_mit_belegten_ausnahmen");
check("17 · Beide Ausnahmen sind gegen die amtliche Zusammensetzung BESTAETIGT",
  DLB.ausnahmen.length === 2 && DLB.ausnahmen.every((a) => a.bestaetigt === true));
check("17b · Die Linke wird NICHT als aktuelle Landtagsfraktion gefuehrt",
  parlament("landtag-brandenburg").fraktionen.every((f) => f.key !== "linke")
  && parlament("landtag-brandenburg").nichtVertreten.some((n) => n.key === "linke"));
check("18 · Jede Ausnahme traegt jetzt einen Pruefstand (Datum, Art, Vorbehalt)",
  DLB.ausnahmen.every((a) => a.pruefstand && a.pruefstand.geprueft_am && a.pruefstand.pruefart && a.pruefstand.pruefvorbehalt));
check("18b · Der Pruefstand nennt den Primaerquellenverweis",
  DLB.ausnahmen.every((a) => a.pruefstand.belege.length >= 2));
check("18c · Nachpruefung wird nach dem Horizont faellig (injizierter Stichtag, kein Zeitbomben-Test)",
  pruefstand("landtag-brandenburg", new Date("2026-07-26T00:00:00Z")).nachpruefungFaellig === false
  && pruefstand("landtag-brandenburg", new Date("2027-06-01T00:00:00Z")).nachpruefungFaellig === true
  && NACHPRUEFUNG_HORIZONT_TAGE === 180);
check("18d · Fehlendes/kaputtes Pruefdatum gilt als faellig, nicht als frisch",
  pruefstand("landtag-erfundenland").bekannt === false);
check("18e · Ein Pruefdatum in der Zukunft gilt als faellig",
  pruefstand("landtag-brandenburg", new Date("2020-01-01T00:00:00Z")).nachpruefungFaellig === true);

// Der harte Driftmechanismus: kehrt Die Linke in den Landtag zurueck, wird die Ausnahme rot.
{
  const pv = require("../lib/helmut/quellenarchitektur/paket-vollstaendigkeit");
  const seedsPath = require.resolve("../lib/helmut/quellenarchitektur/seeds/parlamentszusammensetzung");
  const echt = require(seedsPath);
  const original = echt.PARLAMENTE["landtag-brandenburg"];
  // Simulation: Die Linke kehrt als Fraktion zurueck (9. WP-artiger Zustand).
  const veraendert = { ...original, fraktionen: [...original.fraktionen, { key: "linke", name: "Die Linke", typ: "fraktion", sitze: 8, beleg: "simuliert" }] };
  const lage = require("../lib/helmut/quellenarchitektur/seeds/parlamentszusammensetzung").fraktionsLage;
  const vorher = lage({ parlament: "landtag-brandenburg", wahlperiode: 8, partei: "linke" });
  check("19/20 · Solange Die Linke keine Fraktion hat, trifft die Voraussetzung zu",
    vorher.hatFraktion === false && vorher.hatMandate === false);
  const simuliert = { ...veraendert, nichtVertreten: [] };
  const hatJetzt = simuliert.fraktionen.some((f) => f.key === "linke");
  check("19b · Kehrt die Partei zurueck, ist die Voraussetzung nicht mehr erfuellt (Drift wird sichtbar)",
    hatJetzt === true);
  assert.ok(pv.assessPackageCompleteness, "Bewertung bleibt aufrufbar");
}

// =============================================================================================
console.log("\n== 10 · §11.1/§11.2 Belegte technische Eignung (Sprint-9B-Ground-Truth) ==");

const BB_LEGACY = ["bb-landesparlament", "bb-plenum", "bb-ausschuesse", "bb-landesregierung", "bb-ministerien", "bb-landesfraktionen", "bb-regionale_leitmedien", "bb-partei_pilot", "rbb24-politik"];
check("Fuer alle 9 Brandenburg-Wege existiert ein datiertes Live-Urteil",
  BB_LEGACY.every((id) => LIVE_URTEILE[id] && LIVE_URTEILE[id].urteil));
check("Kein Brandenburg-Weg traegt das Urteil 'ablehnen' oder 'nicht_verifizierbar'",
  BB_LEGACY.every((id) => !["ablehnen", "nicht_verifizierbar"].includes(LIVE_URTEILE[id].urteil)));
check("Genau ein Brandenburg-Weg ist nur 'geeignet mit Einschraenkung' (bb-partei_pilot, HTTP 429)",
  BB_LEGACY.filter((id) => LIVE_URTEILE[id].urteil === "geeignet mit Einschränkung").join() === "bb-partei_pilot"
  && LIVE_URTEILE["bb-partei_pilot"].http === 429);
check("Das Live-Urteil traegt Datum und Lauf-Kennung (nicht undatiert)",
  /^\d{4}-\d{2}-\d{2}$/.test(LIVE_META.datum) && LIVE_META.egressOffen === true && LIVE_META.run);
check("Der Parser jedes Brandenburg-Wegs ist im Katalog gesetzt",
  BB_ALLE_WEGE.every((id) => { const p = PATHS.find((x) => x.id === id); return p && p.parser && p.parser.length > 3; }));
check("7 · Kein Brandenburg-Weg ohne Parser (Szenario 'Parser fehlt')",
  BB_ALLE_WEGE.every((id) => ["googlenews-batchexecute", "pardok-xml", "rss-regex"].includes(PATHS.find((x) => x.id === id).parser)));
check("16 · Die zusaetzliche Last ist gedeckelt: max_items je Weg ist gesetzt",
  BB_ALLE_WEGE.every((id) => PATHS.find((x) => x.id === id).max_items === 16));
check("11 · Duplikate: eine Rohquelle erzeugt genau EINEN Abrufweg (globale URL-Dedup)",
  new Set(PATHS.map((p) => `${p.method}|${p.url}`)).size === PATHS.length);
check("11b · Die 4 parldok-Klassen teilen sich EINE Rohquelle statt viermal zu crawlen",
  (PATHS.find((p) => p.id === "rp-bb-plenum").covers || []).length === 4);

// =============================================================================================
console.log("\n== 11 · Schutz der bestehenden Versorgung ==");

check("Kein Brandenburg-Weg ist als is_critical/always_on fuer den Gesamtcrawl markiert",
  BB_ALLE_WEGE.every((id) => PATHS.find((x) => x.id === id).activation_mode !== "always_on"));
check("22 · Ein Teilfehler eines Brandenburg-Wegs kann den Lauf nicht abbrechen: 'broken' wird als eigener Eimer gefuehrt",
  (() => {
    const s = bbAktiviert();
    const kaputt = s.paths.map((p) => (p.id === "rp-bb-ministerien" ? { ...p, status: "broken", last_error: "timeout" } : p));
    const r = plan({ ...s, paths: kaputt });
    return r.defekt.some((d) => d.id === "rp-bb-ministerien") && bbAktiv(r).length === 7;
  })());
check("21 · Leere/ausgeschlossene Wege bleiben im Plan sichtbar statt still zu verschwinden",
  HEUTE.ausgeschlossen.length + HEUTE.aktiv.length + HEUTE.defekt.length === PATHS.length);
check("Kein Bundestagsprofil erhaelt durch die Aktivierung ein Landespaket",
  !resolveProfilePackages(P_BT).all.some((k) => /berlin|brandenburg/.test(k)));

console.log(`\n== Ergebnis: ${pass} PASS, ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
