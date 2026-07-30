"use strict";

// Helmut — Phase-1-Punkt 14B: DRY RUN für das Berliner Abnahmeprofil (Schritt 5 der Reihenfolge).
// =============================================================================================
// STRIKT READ-ONLY. Dieses Skript führt AUSSCHLIESSLICH `select`-Abfragen aus. Es legt kein
// Profil an, schreibt keine Zeile, setzt kein Flag und löst keinen Crawl aus. Es beantwortet
// je Schritt:
//   1. Sind alle VORBEDINGUNGEN erfüllt? (mit Ist-Wert je Bedingung)
//   2. Welche Zeilen würde die Mutation genau treffen?
//   3. Wäre die NACHBEDINGUNG danach erfüllt? (simuliert auf einer Kopie, nicht in der DB)
//   4. Kontrollfragen: fremde Profile, Brandenburg, andere Landtagsmandate (erwartet: 0)
//
// WARUM ES DIESEN DRY RUN GIBT: Schritt 5 war bis 14A der einzige Production-Schritt ohne
// Dry Run. Die acht SQL-Schritte um ihn herum liessen sich gegen den Ist-Zustand prüfen, der
// Profilschritt nicht — obwohl genau er die zweite Bedingung des Beweislaufs ist.
//
// DATENSCHUTZ: Das Skript liest `profiles.name`, weil die Berechtigungsprüfung ihn braucht
// (Befund P-1). Es GIBT KEINEN Namen und KEINE fremde Mandats-Id aus — nur Zahlen und die
// Abnahme-Id. Kein Klarname landet im Protokoll.
//
// Secrets ausschliesslich aus `process.env` (CLAUDE.md §4.9). Ohne Zugang endet der Lauf
// EHRLICH mit „nicht prüfbar" (Exit 2) — nie mit einem grünen Ergebnis ohne Datenbank.
//
// Aufruf:
//   node scripts/berlin-abnahmeprofil-dryrun.js
//   node scripts/berlin-abnahmeprofil-dryrun.js --schritt=P-RB0
//   node scripts/berlin-abnahmeprofil-dryrun.js --json

const P = require("../lib/helmut/quellenarchitektur/seeds/berlin-profilplan");
const PP = require("../lib/helmut/quellenarchitektur/profile-packages");
const SM = require("../lib/helmut/quellenarchitektur/source-mode");
const { validateProfile } = require("../lib/helmut/profile-validation");

const args = process.argv.slice(2);
const nurSchritt = (args.find((a) => a.startsWith("--schritt=")) || "").split("=")[1] || "";
const alsJson = args.includes("--json");

function baseUrl() { return String(process.env.SUPABASE_URL || "").replace(/\/+$/, ""); }
function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}

async function select(pfad) {
  const antwort = await fetch(`${baseUrl()}/rest/v1/${pfad}`, {
    method: "GET",
    headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, Accept: "application/json" }
  });
  if (!antwort.ok) throw new Error(`GET ${pfad} -> HTTP ${antwort.status}`);
  return antwort.json();
}

const MANDATSSPALTEN = [
  "user_id", "politische_ebene", "bundesland", "partei", "wahlkreis",
  "fachpolitische_schwerpunkte", "regionale_interessen", "ausschuesse", "aktiv",
  "geloescht_at", "onboarding_status"
].join(",");

async function istZustand() {
  const [profiles, mandate] = await Promise.all([
    select("profiles?select=id,name&limit=2000"),
    select(`mandate_profiles?select=${MANDATSSPALTEN}&limit=2000`)
  ]);
  // Abhaengige Zeilen NUR fuer die Abnahme-Id (Stufe-2-Riegel). Fehlt eine Tabelle, wird das
  // als „nicht pruefbar" gefuehrt statt als 0 — ein fehlender Zaehler darf nie wie „leer" wirken.
  const abhaengige = {};
  const unlesbar = [];
  for (const tabelle of P.ABHAENGIGE_TABELLEN) {
    try {
      const zeilen = await select(`${tabelle}?select=user_id&user_id=eq.${encodeURIComponent(P.PROFIL_ID)}&limit=1000`);
      abhaengige[tabelle] = zeilen.length;
    } catch (e) { unlesbar.push(tabelle); }
  }
  return { profiles, mandate_profiles: mandate, abhaengige, unlesbar };
}

function kopie(db) {
  return {
    profiles: db.profiles.map((r) => ({ ...r })),
    mandate_profiles: db.mandate_profiles.map((r) => ({ ...r })),
    abhaengige: { ...db.abhaengige }
  };
}

// Simulation der Mutation EINES Schritts auf einer Kopie — dieselbe Wirkung, die das SQL hätte.
function simuliere(schritt, db) {
  const treffer = { profilzeilen: 0, mandatszeilen: 0, aktion: schritt.art };
  const M = P.PRODUCTION_ZEILEN.mandate_profiles;
  if (schritt.id === "P") {
    if (!db.profiles.some((r) => r.id === P.PROFIL_ID)) {
      db.profiles.push({ id: P.PROFIL_ID, name: P.PRODUCTION_ZEILEN.profiles.name });
      treffer.profilzeilen = 1;
    }
    if (!db.mandate_profiles.some((r) => r.user_id === P.PROFIL_ID)) {
      db.mandate_profiles.push({ user_id: P.PROFIL_ID, ...M, ausschuesse: [], geloescht_at: null });
      treffer.mandatszeilen = 1;
    }
    return treffer;
  }
  for (const zeile of db.mandate_profiles) {
    if (zeile.user_id !== P.PROFIL_ID) continue;
    if (schritt.id === "P-RB0") { zeile.aktiv = false; treffer.mandatszeilen += 1; }
    if (schritt.id === "P-RB1") { zeile.aktiv = false; zeile.geloescht_at = zeile.geloescht_at || "<simuliert>"; treffer.mandatszeilen += 1; }
  }
  if (schritt.id === "P-RB2") {
    treffer.mandatszeilen = db.mandate_profiles.filter((r) => r.user_id === P.PROFIL_ID).length;
    treffer.profilzeilen = db.profiles.filter((r) => r.id === P.PROFIL_ID).length;
    db.mandate_profiles = db.mandate_profiles.filter((r) => r.user_id !== P.PROFIL_ID);
    db.profiles = db.profiles.filter((r) => r.id !== P.PROFIL_ID);
  }
  return treffer;
}

// Kontrollfragen: was dieser Schritt NICHT anfassen darf.
function nichtBeruehrt(vorher, nachher) {
  const schluesselP = (r) => `${r.id}|${r.name}`;
  const schluesselM = (r) => `${r.user_id}|${r.politische_ebene}|${r.bundesland}|${r.aktiv}|${r.geloescht_at || ""}`;
  const vorP = new Map(vorher.profiles.map((r) => [r.id, schluesselP(r)]));
  const vorM = new Map(vorher.mandate_profiles.map((r) => [r.user_id, schluesselM(r)]));
  const geaendertP = nachher.profiles.filter((r) => vorP.get(r.id) !== schluesselP(r)).map((r) => r.id);
  const geaendertM = nachher.mandate_profiles.filter((r) => vorM.get(r.user_id) !== schluesselM(r)).map((r) => r.user_id);
  const entfernt = [...vorP.keys()].filter((id) => !nachher.profiles.some((r) => r.id === id));
  const alleBeruehrt = [...new Set([...geaendertP, ...geaendertM, ...entfernt])];
  return {
    fremdeProfileBeruehrt: alleBeruehrt.filter((id) => id !== P.PROFIL_ID).length,
    fremdeIds: alleBeruehrt.filter((id) => id !== P.PROFIL_ID).length, // bewusst nur die ZAHL
    brandenburgMandate: nachher.mandate_profiles.filter((r) => r.politische_ebene === "landtag"
      && String(r.bundesland || "").toLowerCase() === "brandenburg" && r.aktiv !== false && !r.geloescht_at).length,
    fremdeLandtagsmandate: nachher.mandate_profiles.filter((r) => r.user_id !== P.PROFIL_ID
      && r.politische_ebene === "landtag" && r.aktiv !== false && !r.geloescht_at).length
  };
}

function bewerte(bedingungen, db) {
  return bedingungen.map((b) => {
    const e = P.pruefeProfilBedingung(b, db);
    return { art: b.art, modus: b.modus || null, meldung: b.meldung, ok: e.ok, ist: e.ist, erlaubt: e.erlaubt };
  });
}

(async () => {
  if (!baseUrl() || !serviceKey()) {
    console.error("NICHT PRÜFBAR: SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY sind nicht gesetzt.");
    console.error("Secrets kommen ausschliesslich aus process.env (CLAUDE.md §4.9) — lokal aus der Shell,");
    console.error("in einer Cloud-Sitzung aus den Claude-Code-Environment-Einstellungen.");
    console.error("Der Dry Run meldet KEIN Ergebnis ohne Datenbank (kein falsches Grün).");
    process.exit(2);
  }

  const db = await istZustand();
  const schritte = P.profilschritte().filter((s) => !nurSchritt || s.id === nurSchritt);
  if (!schritte.length) {
    console.error(`Unbekannter Schritt '${nurSchritt}'. Verfügbar: ${P.profilschritte().map((s) => s.id).join(", ")}`);
    process.exit(2);
  }

  const lebt = (r) => r.aktiv !== false && !r.geloescht_at;
  // LASTFOLGE (Punkt 14B, aktualisiert 2026-07-29 / OP-25): die Crons verarbeiten die aktiven
  // Mandate weiterhin SEQUENZIELL gegen ein hartes Zeitbudget — aber NICHT mehr in
  // aufsteigender Id-Reihenfolge. Die Reihenfolge kommt aus `lib/helmut/cron-fairness.js`
  // (aeltester letzter Versuch zuerst, Mandate ohne Versuch vorn, Kennung nur als letzter
  // Gleichstandsentscheid). Eine feste Position gibt es damit nicht mehr; ein zusaetzliches
  // Mandat schiebt niemanden dauerhaft nach hinten, es senkt die Frequenz ALLER Mandate
  // gleichmaessig: bei n aktiven Mandaten und k begonnenen Mandaten je Lauf wird jedes Mandat
  // spaetestens im ceil(n/k)-ten regulaeren Lauf begonnen. Die Zahl steht hier, damit dieser
  // Effekt VOR der Ausfuehrung sichtbar ist statt hinterher.
  const aktiveIds = db.mandate_profiles.filter(lebt).map((r) => r.user_id).sort();
  const nachher = aktiveIds.includes(P.PROFIL_ID) ? aktiveIds.length : aktiveIds.length + 1;
  const lastfolge = {
    aktiveMandateHeute: aktiveIds.length,
    aktiveMandateNachher: nachher,
    // Kein Rangversprechen mehr: die Reihenfolge rotiert. Was steigt, ist der Abstand
    // zwischen zwei Versuchen desselben Mandats.
    obergrenzeLaeufeVorher: aktiveIds.length,
    obergrenzeLaeufeNachher: nachher,
    hinweis: "Sequenzielle Cron-Schleife mit Zeitbudget, faire Rotation nach aeltestem Versuch "
      + "(OP-25). Ein vom Budget abgeschnittenes Mandat erzeugt einen systemError (server.js, seit "
      + "dem Incident 2026-07-25) und steht im naechsten Lauf VORN — es faellt also auf und wird "
      + "nachgeholt statt dauerhaft verdraengt. Die Werte sind Obergrenzen bei k=1 begonnenem "
      + "Mandat je Lauf (ceil(n/k)); bei mehr Kapazitaet je Lauf sinken sie entsprechend."
  };
  const ausgangslage = {
    profile: db.profiles.length,
    mandatszeilen: db.mandate_profiles.length,
    aktiveMandate: db.mandate_profiles.filter(lebt).length,
    landtagsprofile: db.mandate_profiles.filter((r) => r.politische_ebene === "landtag").length,
    berlinerLandtagsprofileAktiv: db.mandate_profiles.filter((r) => r.politische_ebene === "landtag"
      && String(r.bundesland || "").toLowerCase() === "berlin" && lebt(r)).length,
    abnahmeprofilVorhanden: db.mandate_profiles.some((r) => r.user_id === P.PROFIL_ID),
    abhaengigeZeilenAmAbnahmeprofil: Object.values(db.abhaengige).reduce((s, n) => s + n, 0),
    tabellenNichtLesbar: db.unlesbar
  };

  const bericht = [];
  for (const schritt of schritte) {
    const vorher = kopie(db);
    const nachDb = kopie(db);
    const vor = bewerte(schritt.vorbedingungen, nachDb);
    const treffer = simuliere(schritt, nachDb);
    const nach = bewerte(schritt.nachbedingungen, nachDb);
    bericht.push({
      schritt: schritt.id, nummer: schritt.nummer, datei: schritt.datei, titel: schritt.titel,
      ausfuehrbarJetzt: vor.every((v) => v.ok),
      vorbedingungen: vor, trefferZeilen: treffer,
      nachbedingungenNachSimulation: nach,
      kontrollfragen: nichtBeruehrt(vorher, nachDb)
    });
  }

  // Wirkung des Profils auf die Paketauflösung — gegen den ECHTEN Resolver, nicht behauptet.
  const v = validateProfile(P.GEMAPPTES_PROFIL);
  const aufloesung = PP.resolveProfilePackages(P.GEMAPPTES_PROFIL);
  const gemappteBestand = db.mandate_profiles.filter(lebt).map((r) => ({
    id: r.user_id, politische_ebene: r.politische_ebene, bundesland: r.bundesland, aktiv: true
  }));
  const wirkungOhne = SM.wirksameLandesmodule({ profiles: gemappteBestand, env: { HELMUT_LANDESMODULE: "berlin" } });
  const wirkungMit = SM.wirksameLandesmodule({
    profiles: [...gemappteBestand, P.GEMAPPTES_PROFIL], env: { HELMUT_LANDESMODULE: "berlin" }
  });
  const wirkung = {
    profilZustand: v.state,
    aktivierungsberechtigt: PP.isActivationEligible(P.GEMAPPTES_PROFIL),
    kannRadar: v.impact.kannRadar,
    pflichtpakete: aufloesung.required,
    optionalePakete: aufloesung.optional,
    berlinWirksamOhneAbnahmeprofil: [...wirkungOhne.wirksam],
    berlinWirksamMitAbnahmeprofil: [...wirkungMit.wirksam],
    hinweis: "Beide Zeilen gelten unter der Annahme HELMUT_LANDESMODULE=berlin. Der Flag-Wert ist "
      + "aus dieser Sitzung nicht lesbar (berlin-aktivierung.md §20.3) — er wird hier NICHT gemessen, "
      + "sondern angenommen, um die Wirkung des Profils isoliert zu zeigen."
  };

  if (alsJson) {
    console.log(JSON.stringify({ gemessenGegen: "Production (read-only)", ausgangslage, lastfolge, wirkung, bericht }, null, 2));
  } else {
    console.log("=== Berliner Abnahmeprofil · DRY RUN je Schritt (read-only, nichts geschrieben) ===\n");
    console.log("--- Ausgangslage (gemessen, ohne Klarnamen)");
    for (const [k, val] of Object.entries(ausgangslage)) console.log(`    ${k}: ${JSON.stringify(val)}`);
    console.log("\n--- Lastfolge der sequenziellen Cron-Schleife");
    for (const [k, val] of Object.entries(lastfolge)) console.log(`    ${k}: ${JSON.stringify(val)}`);
    console.log("");
    for (const e of bericht) {
      console.log(`--- Schritt ${e.nummer}/${P.profilschritte().length} · ${e.schritt} · ${e.titel}`);
      console.log(`    Datei: ${e.datei}`);
      console.log(`    Jetzt ausführbar: ${e.ausfuehrbarJetzt ? "JA" : "NEIN (Vorbedingung verletzt -> fail-closed)"}`);
      for (const b of e.vorbedingungen) {
        console.log(`      [${b.ok ? "ok " : "FAIL"}] vor  ${b.art}${b.modus ? "/" + b.modus : ""}: ist=${JSON.stringify(b.ist)} erlaubt=${JSON.stringify(b.erlaubt)}`);
        if (!b.ok) console.log(`             -> ${b.meldung}`);
      }
      console.log(`    Getroffene Zeilen: profiles ${e.trefferZeilen.profilzeilen} · mandate_profiles ${e.trefferZeilen.mandatszeilen}`);
      for (const b of e.nachbedingungenNachSimulation) {
        console.log(`      [${b.ok ? "ok " : "FAIL"}] nach ${b.art}${b.modus ? "/" + b.modus : ""}: ist=${JSON.stringify(b.ist)} erlaubt=${JSON.stringify(b.erlaubt)}`);
        if (!b.ok) console.log(`             -> ${b.meldung}`);
      }
      const k = e.kontrollfragen;
      console.log(`    Kontrollfragen (alle 0 erwartet): fremde Profile berührt ${k.fremdeProfileBeruehrt}`
        + ` · Brandenburger Landtagsmandate ${k.brandenburgMandate} · fremde Landtagsmandate ${k.fremdeLandtagsmandate}\n`);
    }
    console.log("--- Wirkung des Abnahmeprofils (gegen den echten Resolver gerechnet)");
    for (const [k, val] of Object.entries(wirkung)) console.log(`    ${k}: ${JSON.stringify(val)}`);
    console.log("\nEs wurde nichts geschrieben. Die Ausführung ist ein eigener, freigabepflichtiger Schritt.");
  }

  // Exit 1 nur bei einer verletzten GRENZE oder einer nach der Simulation verletzten
  // Nachbedingung eines jetzt ausführbaren Schritts. Eine verletzte VORbedingung ist die
  // korrekte Antwort „dieser Schritt ist jetzt nicht dran" — kein Fehler des Dry Runs.
  const verletzt = bericht.filter((e) => e.kontrollfragen.fremdeProfileBeruehrt
    || e.kontrollfragen.brandenburgMandate || e.kontrollfragen.fremdeLandtagsmandate
    || (e.ausfuehrbarJetzt && e.nachbedingungenNachSimulation.some((n) => !n.ok)));
  if (db.unlesbar.length) {
    console.error(`\nNICHT VOLLSTÄNDIG PRÜFBAR: ${db.unlesbar.length} abhängige Tabelle(n) nicht lesbar: ${db.unlesbar.join(", ")}`);
    process.exit(2);
  }
  if (verletzt.length) {
    console.error(`\nGRENZVERLETZUNG in ${verletzt.length} Schritt(en): ${verletzt.map((v) => v.schritt).join(", ")}`);
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => { console.error("DRY RUN FEHLGESCHLAGEN:", e.message); process.exit(2); });
