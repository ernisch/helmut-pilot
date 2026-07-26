"use strict";

// Helmut — Phase-1-Punkt 14A: DRY RUN je Ausführungsschritt der Berliner Aktivierung.
// =============================================================================================
// STRIKT READ-ONLY. Dieses Skript führt AUSSCHLIESSLICH `select`-Abfragen aus. Es schreibt
// keine Zeile, setzt kein Flag und löst keinen Crawl aus. Es beantwortet je Schritt:
//   1. Sind alle VORBEDINGUNGEN erfüllt? (mit Ist-Wert je Bedingung)
//   2. Welche Zeilen würde die Mutation genau treffen? (namentlich, gezählt)
//   3. Wäre die NACHBEDINGUNG danach erfüllt? (simuliert auf einer Kopie, nicht in der DB)
//   4. Werden Brandenburg, Bund oder fremde Pakete berührt? (erwartet: 0)
//
// WARUM JE SCHRITT (Befund V-1): vorher gab es EINEN Dry Run für eine Sammeldatei. Ein
// gemeinsamer Dry Run kann nicht zeigen, dass Stufe 2 zum Zeitpunkt von Stufe 1 noch gesperrt
// ist — genau das ist die Zusage der Staffelung.
//
// Secrets ausschliesslich aus `process.env` (CLAUDE.md §4.9): lokal aus der Shell, in einer
// Cloud-Sitzung aus den Claude-Code-Environment-Einstellungen. Ohne Zugang endet der Lauf
// EHRLICH mit „nicht prüfbar" (Exit 2) — nie mit einem grünen Ergebnis ohne Datenbank.
//
// Aufruf:
//   node scripts/berlin-aktivierung-dryrun.js              # alle 8 Schritte
//   node scripts/berlin-aktivierung-dryrun.js --schritt=S1 # nur Stufe 1
//   node scripts/berlin-aktivierung-dryrun.js --json

const B = require("../lib/helmut/quellenarchitektur/seeds/berlin-aktivierung");

const args = process.argv.slice(2);
const nurSchritt = (args.find((a) => a.startsWith("--schritt=")) || "").split("=")[1] || "";
const alsJson = args.includes("--json");

function baseUrl() { return String(process.env.SUPABASE_URL || "").replace(/\/+$/, ""); }
function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}

async function select(pfad) {
  const url = `${baseUrl()}/rest/v1/${pfad}`;
  const antwort = await fetch(url, {
    method: "GET",
    headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, Accept: "application/json" }
  });
  if (!antwort.ok) throw new Error(`GET ${pfad} -> HTTP ${antwort.status}`);
  return antwort.json();
}

// Ist-Zustand der vier gelesenen Tabellen. `source_crawl_telemetry` wird auf die Quellen der
// Stufe 1 eingegrenzt — der Beleg-Riegel von Stufe 2 braucht nur diese.
async function istZustand() {
  const stufe1Quellen = B.telemetrieQuellen(B.stufenWege(1));
  const inListe = (werte) => `(${werte.map((w) => `"${w}"`).join(",")})`;
  const [retrievalPaths, sourcePackages, packagePaths, telemetrie] = await Promise.all([
    select("retrieval_paths?select=id,status,activation_mode&limit=2000"),
    select("source_packages?select=id,key,status&limit=500"),
    select("package_paths?select=package_id,retrieval_path_id&limit=5000"),
    select(`source_crawl_telemetry?select=source_id,run_id,status&source_id=in.${inListe(stufe1Quellen)}&limit=10000`)
  ]);
  return {
    retrieval_paths: retrievalPaths,
    source_packages: sourcePackages,
    package_paths: packagePaths,
    source_crawl_telemetry: telemetrie
  };
}

function kopie(db) {
  return {
    retrieval_paths: db.retrieval_paths.map((r) => ({ ...r })),
    source_packages: db.source_packages.map((r) => ({ ...r })),
    package_paths: db.package_paths.map((r) => ({ ...r })),
    source_crawl_telemetry: db.source_crawl_telemetry.map((r) => ({ ...r }))
  };
}

// Simulation der Mutation EINES Schritts auf einer Kopie — dieselbe Wirkung, die das SQL hätte.
// Reine Objektarbeit; die Datenbank wird dabei nicht berührt.
function simuliere(schritt, db) {
  const treffer = { wege: [], paket: [], zuordnungNeu: [], zuordnungWeg: [] };
  const setzeWege = (ids, von, nach) => {
    for (const zeile of db.retrieval_paths) {
      if (!ids.includes(zeile.id)) continue;
      if (von && !(zeile.status === von.status && zeile.activation_mode === von.activation_mode)) continue;
      treffer.wege.push({ id: zeile.id, von: `${zeile.status}/${zeile.activation_mode}`, nach: `${nach.status}/${nach.activation_mode}` });
      zeile.status = nach.status; zeile.activation_mode = nach.activation_mode;
    }
  };
  const setzePaket = (key, von, nach) => {
    for (const zeile of db.source_packages) {
      if (zeile.key !== key) continue;
      if (von && zeile.status !== von) continue;
      treffer.paket.push({ key, von: zeile.status, nach });
      zeile.status = nach;
    }
  };
  const haenge = (von, nach) => {
    for (const weg of B.UMHAENGUNG.wege) {
      if (!db.package_paths.some((pp) => pp.package_id === nach && pp.retrieval_path_id === weg)) {
        db.package_paths.push({ package_id: nach, retrieval_path_id: weg });
        treffer.zuordnungNeu.push(`${nach}|${weg}`);
      }
    }
    const vorher = db.package_paths.length;
    db.package_paths = db.package_paths.filter((pp) => !(pp.package_id === von && B.UMHAENGUNG.wege.includes(pp.retrieval_path_id)));
    for (let i = 0; i < vorher - db.package_paths.length; i += 1) treffer.zuordnungWeg.push(von);
  };

  if (schritt.id === "A") haenge(B.UMHAENGUNG.von, B.UMHAENGUNG.nach);
  else if (schritt.id === "B1") setzePaket(B.BASISPAKET_KEY, "prepared", "active");
  else if (schritt.id === "S1" || schritt.id === "S2") setzeWege(schritt.wegeBeruehrt, B.GESPERRT, B.AKTIV);
  else if (schritt.id === "S1-RB" || schritt.id === "S2-RB") setzeWege(schritt.wegeBeruehrt, null, B.GESPERRT);
  else if (schritt.id === "RB-ALLE") { setzeWege(schritt.wegeBeruehrt, null, B.GESPERRT); setzePaket(B.BASISPAKET_KEY, null, "prepared"); }
  else if (schritt.id === "RB-VOLL") {
    setzeWege(schritt.wegeBeruehrt, null, B.GESPERRT);
    setzePaket(B.BASISPAKET_KEY, null, "prepared");
    haenge(B.UMHAENGUNG.nach, B.UMHAENGUNG.von);
  } else throw new Error("Unbekannter Schritt: " + schritt.id);
  return treffer;
}

// Kontrollfragen: was dieser Schritt NICHT anfassen darf.
function nichtBeruehrt(vorher, nachher) {
  const schluessel = (r) => `${r.id}|${r.status}|${r.activation_mode}`;
  const vorMap = new Map(vorher.retrieval_paths.map((r) => [r.id, schluessel(r)]));
  const geaendert = nachher.retrieval_paths.filter((r) => vorMap.get(r.id) !== schluessel(r)).map((r) => r.id);
  return {
    brandenburgWege: geaendert.filter((id) => id.startsWith("rp-bb-")).length,
    bundWege: geaendert.filter((id) => !id.startsWith("rp-be-") && id !== "rp-rbb24-politik").length,
    parteiWege: geaendert.filter((id) => B.UMHAENGUNG.wege.includes(id)).length,
    fremdePakete: nachher.source_packages
      .filter((p) => (vorher.source_packages.find((v) => v.key === p.key) || {}).status !== p.status)
      .map((p) => p.key)
      .filter((key) => key !== B.BASISPAKET_KEY),
    fremdeZuordnung: nachher.package_paths
      .filter((pp) => !vorher.package_paths.some((v) => v.package_id === pp.package_id && v.retrieval_path_id === pp.retrieval_path_id))
      .map((pp) => pp.package_id)
      .filter((id) => id !== B.BASISPAKET_ID && id !== B.PARTEIPAKET_ID),
    geaendert
  };
}

function bewerte(bedingungen, db) {
  return bedingungen.map((b) => {
    const ergebnis = B.pruefeBedingung(b, db);
    return { art: b.art, meldung: b.meldung, ok: ergebnis.ok, ist: ergebnis.ist, erlaubt: ergebnis.erlaubt };
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
  const schritte = B.ausfuehrungsschritte().filter((s) => !nurSchritt || s.id === nurSchritt);
  if (!schritte.length) {
    console.error(`Unbekannter Schritt '${nurSchritt}'. Verfügbar: ${B.ausfuehrungsschritte().map((s) => s.id).join(", ")}`);
    process.exit(2);
  }

  const bericht = [];
  // Jeder Schritt wird gegen den ECHTEN Ist-Zustand geprüft, nicht gegen den Zustand nach dem
  // Vorschritt: so ist sichtbar, welcher Schritt heute ausführbar wäre und welcher (noch) nicht.
  for (const schritt of schritte) {
    const vorher = kopie(db);
    const nachDb = kopie(db);
    const vor = bewerte(schritt.vorbedingungen, nachDb);
    const treffer = simuliere(schritt, nachDb);
    const nach = bewerte(schritt.nachbedingungen, nachDb);
    const grenzen = nichtBeruehrt(vorher, nachDb);
    bericht.push({
      schritt: schritt.id, nummer: schritt.nummer, datei: schritt.datei, titel: schritt.titel,
      ausfuehrbarJetzt: vor.every((v) => v.ok),
      vorbedingungen: vor,
      trefferZeilen: {
        wege: treffer.wege.length, paketstatus: treffer.paket.length,
        zuordnungNeu: treffer.zuordnungNeu.length, zuordnungEntfernt: treffer.zuordnungWeg.length
      },
      treffer,
      nachbedingungenNachSimulation: nach,
      kontrollfragen: {
        brandenburgWege: grenzen.brandenburgWege, bundWege: grenzen.bundWege,
        parteiWegeAktiviert: grenzen.parteiWege,
        fremdePakete: grenzen.fremdePakete, fremdeZuordnung: grenzen.fremdeZuordnung
      }
    });
  }

  if (alsJson) { console.log(JSON.stringify({ gemessenGegen: "Production (read-only)", bericht }, null, 2)); }
  else {
    console.log("=== Berliner Aktivierung · DRY RUN je Schritt (read-only, nichts geschrieben) ===\n");
    for (const e of bericht) {
      console.log(`--- Schritt ${e.nummer}/8 · ${e.schritt} · ${e.titel}`);
      console.log(`    Datei: ${e.datei}`);
      console.log(`    Jetzt ausführbar: ${e.ausfuehrbarJetzt ? "JA" : "NEIN (Vorbedingung verletzt -> fail-closed)"}`);
      for (const v of e.vorbedingungen) {
        console.log(`      [${v.ok ? "ok " : "FAIL"}] vor  ${v.art}: ist=${JSON.stringify(v.ist)} erlaubt=${JSON.stringify(v.erlaubt)}`);
        if (!v.ok) console.log(`             -> ${v.meldung}`);
      }
      console.log(`    Getroffene Zeilen: Wege ${e.trefferZeilen.wege} · Paketstatus ${e.trefferZeilen.paketstatus}`
        + ` · Zuordnung +${e.trefferZeilen.zuordnungNeu}/-${e.trefferZeilen.zuordnungEntfernt}`);
      for (const w of e.treffer.wege) console.log(`      ${w.id}: ${w.von} -> ${w.nach}${w.von === w.nach ? "  (unverändert)" : ""}`);
      for (const p of e.treffer.paket) console.log(`      Paket ${p.key}: ${p.von} -> ${p.nach}`);
      for (const n of e.nachbedingungenNachSimulation) {
        console.log(`      [${n.ok ? "ok " : "FAIL"}] nach ${n.art}: ist=${JSON.stringify(n.ist)} erlaubt=${JSON.stringify(n.erlaubt)}`);
        if (!n.ok) console.log(`             -> ${n.meldung}`);
      }
      const k = e.kontrollfragen;
      console.log(`    Kontrollfragen (alle 0 erwartet): Brandenburg ${k.brandenburgWege} · Bund ${k.bundWege}`
        + ` · Partei-/Fraktions-/Personenwege aktiviert ${k.parteiWegeAktiviert}`
        + ` · fremde Pakete ${k.fremdePakete.length} · fremde Zuordnung ${k.fremdeZuordnung.length}\n`);
    }
    console.log("Es wurde nichts geschrieben. Die Ausführung ist ein eigener, freigabepflichtiger Schritt.");
  }

  // Exit 1 nur bei einer verletzten GRENZE (Brandenburg/Bund/Partei/fremde Pakete) oder einer
  // nach der Simulation verletzten Nachbedingung. Eine verletzte VORbedingung ist kein Fehler
  // des Dry Runs — sie ist die korrekte Antwort „dieser Schritt ist jetzt nicht dran".
  const verletzt = bericht.filter((e) => e.kontrollfragen.brandenburgWege || e.kontrollfragen.bundWege
    || e.kontrollfragen.parteiWegeAktiviert || e.kontrollfragen.fremdePakete.length
    || e.kontrollfragen.fremdeZuordnung.length
    || (e.ausfuehrbarJetzt && e.nachbedingungenNachSimulation.some((n) => !n.ok)));
  if (verletzt.length) {
    console.error(`\nGRENZVERLETZUNG in ${verletzt.length} Schritt(en): ${verletzt.map((v) => v.schritt).join(", ")}`);
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => { console.error("DRY RUN FEHLGESCHLAGEN:", e.message); process.exit(2); });
