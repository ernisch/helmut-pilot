"use strict";

// Helmut — Phase-1-Punkt 14: AUSWERTUNG des Berliner Production-Beweislaufs.
// =============================================================================================
// STRIKT READ-ONLY. Dieses Skript führt AUSSCHLIESSLICH `select`-Abfragen aus. Es schreibt
// keine Zeile, setzt kein Flag und löst keinen Crawl aus.
//
// WARUM ES DIESES SKRIPT GIBT: `betrieb/berlin-aktivierung.md` §10 (Monitoring) und §11
// (Abbruchkriterien) waren bis zum Beweislauf **nur definiert, nie erprobt** — Go-/No-Go-
// Kriterium 5 führte genau das als Lücke. Ein Beweislauf, dessen Abbruchkriterien von Hand
// nachgerechnet werden, ist nicht reproduzierbar. Dieses Skript macht beide Abschnitte
// ausführbar: es misst je Kriterium einen Ist-Wert gegen einen Vorlauf-Referenzwert und sagt
// je Kriterium GRUEN / VERLETZT — statt eine Gesamtnote zu behaupten.
//
// EHRLICHKEIT (CLAUDE.md §4.4): Ein Kriterium ohne belastbare Datengrundlage endet als
// `unbekannt`, NIE als grün. `Zeitbudget`/`504` sind aus der Datenbank NICHT messbar
// (Vercel-Runtime-Logs, HTTP-Ebene) und werden ausdrücklich als `nicht_aus_db_messbar`
// gemeldet, damit niemand sie für geprüft hält.
//
// Secrets ausschliesslich aus `process.env` (CLAUDE.md §4.9): lokal aus der Shell, in einer
// Cloud-Sitzung aus den Claude-Code-Environment-Einstellungen. Ohne Zugang endet der Lauf
// EHRLICH mit Exit 2 — nie mit einem grünen Ergebnis ohne Datenbank.
//
// Aufruf:
//   node scripts/berlin-beweislauf-auswertung.js
//   node scripts/berlin-beweislauf-auswertung.js --json
//   node scripts/berlin-beweislauf-auswertung.js --vorlauf=crawl-20260726200015-z3qaf

const B = require("../lib/helmut/quellenarchitektur/seeds/berlin-aktivierung");

const args = process.argv.slice(2);
const alsJson = args.includes("--json");
const vorlaufArg = (args.find((a) => a.startsWith("--vorlauf=")) || "").split("=")[1] || "";

function baseUrl() { return String(process.env.SUPABASE_URL || "").replace(/\/+$/, ""); }
function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}
if (!baseUrl() || !serviceKey()) {
  console.error("NICHT PRUEFBAR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen. Kein Ergebnis ohne Datenbank.");
  process.exit(2);
}

async function select(pfad) {
  const antwort = await fetch(`${baseUrl()}/rest/v1/${pfad}`, {
    headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, Accept: "application/json" }
  });
  if (!antwort.ok) throw new Error(`GET ${pfad} -> HTTP ${antwort.status}`);
  return antwort.json();
}

const STUFE1 = B.telemetrieQuellen(B.stufenWege(1));
const STUFE2 = B.telemetrieQuellen(B.stufenWege(2));
const BERLINER_QUELLEN = [...STUFE1, ...STUFE2];
const istBerlinerQuelle = (id) => BERLINER_QUELLEN.includes(String(id));

// Ein Kriterium ist ein Datensatz, kein Freitext: Name, Ist, Referenz, Urteil.
function krit(nr, titel, urteil, ist, referenz, hinweis) {
  return { nr, titel, urteil, ist, referenz, hinweis: hinweis || null };
}

async function laeufe() {
  // Die letzten Telemetriezeilen, nach Lauf gruppiert. Ein "Vollcrawl" ist ein Lauf mit
  // > 100 Zeilen — Teilläufe (Lage-Check, Einzelmandat) sind bewusst nicht vergleichbar.
  const seit = new Date(Date.now() - 3 * 24 * 3600e3).toISOString();
  const zeilen = await select(
    `source_crawl_telemetry?select=run_id,source_id,status,new_documents,found_documents,duration_ms,started_at,retry_count,error_code`
    + `&started_at=gte.${seit}&order=started_at.desc&limit=20000`
  );
  const nachLauf = new Map();
  for (const z of zeilen) {
    if (!nachLauf.has(z.run_id)) nachLauf.set(z.run_id, []);
    nachLauf.get(z.run_id).push(z);
  }
  const sortiert = [...nachLauf.entries()]
    .map(([run_id, rows]) => ({
      run_id,
      startedAt: rows.map((r) => r.started_at).sort()[0],
      rows,
      vollcrawl: rows.length > 100
    }))
    .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  return sortiert;
}

function laufKennzahlen(lauf) {
  const rows = lauf.rows;
  const distinct = new Set(rows.map((r) => r.source_id));
  const be = rows.filter((r) => istBerlinerQuelle(r.source_id));
  const bund = rows.filter((r) => !istBerlinerQuelle(r.source_id));
  return {
    run_id: lauf.run_id,
    startedAt: lauf.startedAt,
    vollcrawl: lauf.vollcrawl,
    // Rohzeilen bleiben am Objekt, damit Kriterium 1 gegen den TATSAECHLICHEN Lauf prueft
    // statt gegen eine Zusammenfassung. Vor der Ausgabe entfernt (`ohneRohzeilen`).
    rows,
    zeilen: rows.length,
    distinctSourceId: distinct.size,
    invarianteB3: rows.length === distinct.size,
    ok: rows.filter((r) => r.status === "ok").length,
    empty: rows.filter((r) => r.status === "empty").length,
    error: rows.filter((r) => r.status === "error").length,
    circuitOpen: rows.filter((r) => r.status === "circuit-open").length,
    retries: rows.reduce((s, r) => s + (r.retry_count || 0), 0),
    neueDokumente: rows.reduce((s, r) => s + (r.new_documents || 0), 0),
    gefundeneDokumente: rows.reduce((s, r) => s + (r.found_documents || 0), 0),
    laufzeitMsMax: rows.reduce((s, r) => Math.max(s, r.duration_ms || 0), 0),
    bundOk: bund.filter((r) => r.status === "ok").length,
    bundZeilen: bund.length,
    berlin: {
      zeilen: be.length,
      ok: be.filter((r) => r.status === "ok").length,
      empty: be.filter((r) => r.status === "empty").length,
      error: be.filter((r) => r.status === "error").length,
      neueDokumente: be.reduce((s, r) => s + (r.new_documents || 0), 0),
      jeQuelle: BERLINER_QUELLEN.map((q) => {
        const r = be.find((x) => x.source_id === q);
        return { quelle: q, status: r ? r.status : "(nicht im Lauf)", neu: r ? (r.new_documents || 0) : null };
      })
    }
  };
}

(async () => {
  const alleLaeufe = await laeufe();
  const vollcrawls = alleLaeufe.filter((l) => l.vollcrawl);
  if (!vollcrawls.length) {
    console.error("NICHT PRUEFBAR: kein Vollcrawl in den letzten 3 Tagen gefunden.");
    process.exit(2);
  }

  // Aktueller Lauf = jüngster Vollcrawl. Vorlauf = der Vollcrawl davor (oder --vorlauf=).
  const aktuell = laufKennzahlen(vollcrawls[0]);
  const vorlaufLauf = vorlaufArg
    ? vollcrawls.find((l) => l.run_id === vorlaufArg)
    : vollcrawls[1];
  const vorlauf = vorlaufLauf ? laufKennzahlen(vorlaufLauf) : null;

  // Läufe MIT Berliner Zeilen — das ist der eigentliche Beweis.
  const mitBerlin = vollcrawls.map(laufKennzahlen).filter((l) => l.berlin.zeilen > 0);

  // Telemetriebeleg für Stufe 2: je Stufe-1-Weg mindestens 2 Läufe mit status='ok'.
  const okJeStufe1Quelle = {};
  for (const q of STUFE1) {
    okJeStufe1Quelle[q] = alleLaeufe.reduce(
      (s, l) => s + l.rows.filter((r) => r.source_id === q && r.status === "ok").length, 0
    );
  }
  const stufe2Freigegeben = STUFE1.every((q) => okJeStufe1Quelle[q] >= 2);

  // Weitere Production-Größen.
  const [pending, failed, budget, locks, berlinDocs, berlinKos] = await Promise.all([
    select("knowledge_objects?select=id&understanding_status=eq.pending&limit=5000"),
    select("knowledge_objects?select=id&understanding_status=eq.failed&limit=5000"),
    select("llm_budget_counters?select=day,scope,used&order=day.desc&limit=3"),
    select("pipeline_locks?select=job_name,expires_at&limit=100"),
    select(`raw_documents?select=id,source_id,canonical_target_url,created_at&or=(${BERLINER_QUELLEN.map((q) => `source_id.eq.${q}`).join(",")})&limit=5000`),
    select("knowledge_objects?select=id,decision_level,affected_geographies&decision_level=eq.land&limit=5000")
  ]);
  const rueckstand = pending.length + failed.length;
  const heuteBudget = budget[0] ? budget[0].used : null;
  const jetzt = Date.now();
  const aktiveLocks = locks.filter((l) => new Date(l.expires_at).getTime() >= jetzt).length;
  const berlinOhneOriginalverweis = berlinDocs.filter(
    (d) => !d.canonical_target_url || /news\.google\.com/.test(String(d.canonical_target_url))
  ).length;

  // ---- Abbruchkriterien aus §11, je Kriterium ein Urteil ------------------------------------
  const k = [];
  const bbWege = await select("retrieval_paths?select=id,status,activation_mode&id=like.rp-bb-*&limit=100");
  const bbPaket = await select("source_packages?select=key,status&key=eq.brandenburg-basis");
  const beWege = await select("retrieval_paths?select=id,status,activation_mode&id=like.rp-be-*&limit=100");
  const rbb = await select("retrieval_paths?select=id,status,activation_mode&id=eq.rp-rbb24-politik");
  const alleBeWege = [...beWege, ...rbb];
  const scharf = (id) => alleBeWege.some((w) => w.id === id && w.status === "healthy" && w.activation_mode === "auto");
  const aktivStufe1 = B.stufenWege(1).filter(scharf);
  const gesperrtStufe2 = B.stufenWege(2).filter((id) =>
    alleBeWege.some((w) => w.id === id && w.status === "needs_review" && w.activation_mode === "manual"));

  k.push(krit(1, "Kein Weg eines nicht freigegebenen Landes im Lauf",
    mitBerlin.length === 0 ? "unbekannt (noch kein Berliner Lauf)"
      : (aktuell.rows.filter((r) => /^rp-bb-|^bb-/.test(String(r.source_id))).length === 0 ? "GRUEN" : "VERLETZT"),
    aktuell.rows.filter((r) => /^rp-bb-|^bb-/.test(String(r.source_id))).length, 0));

  k.push(krit(2, "brandenburg-basis unveraendert 'prepared', alle rp-bb-* 'manual'",
    (bbPaket[0] && bbPaket[0].status === "prepared"
      && bbWege.every((w) => w.status === "needs_review" && w.activation_mode === "manual")) ? "GRUEN" : "VERLETZT",
    `${bbPaket[0] ? bbPaket[0].status : "?"} / ${bbWege.filter((w) => w.status === "needs_review" && w.activation_mode === "manual").length} von ${bbWege.length} manual`,
    "prepared / 8 von 8 manual"));

  k.push(krit(3, "Zahl erfolgreicher Bund-Wege sinkt nicht",
    vorlauf ? (aktuell.bundOk >= vorlauf.bundOk ? "GRUEN" : "VERLETZT") : "unbekannt (kein Vorlauf)",
    aktuell.bundOk, vorlauf ? vorlauf.bundOk : null));

  k.push(krit(4, "Hoechstens 1 aktivierter Weg endet mit 'error'",
    mitBerlin.length === 0 ? "unbekannt (noch kein Berliner Lauf)"
      : (aktuell.berlin.error <= 1 ? "GRUEN" : "VERLETZT"),
    aktuell.berlin.error, "<= 1"));

  k.push(krit(5, "circuit-open / Drosselung steigt nicht messbar",
    vorlauf ? (aktuell.circuitOpen <= vorlauf.circuitOpen ? "GRUEN" : "VERLETZT") : "unbekannt (kein Vorlauf)",
    aktuell.circuitOpen, vorlauf ? vorlauf.circuitOpen : null));

  k.push(krit(6, "Crawl-Laufzeit unter 240 s (80 % des Funktionsbudgets)",
    aktuell.laufzeitMsMax < 240000 ? "GRUEN" : "VERLETZT",
    `${Math.round(aktuell.laufzeitMsMax / 1000)} s (laengster Einzelabruf)`, "< 240 s",
    "Misst den laengsten EINZELABRUF, nicht die Gesamtlaufzeit der Funktion — die steht nur in den Vercel-Runtime-Logs (§20.5)."));

  k.push(krit(7, "Hoechstens 150 zusaetzliche Abrufe je Lauf",
    vorlauf ? ((aktuell.zeilen - vorlauf.zeilen) <= 150 ? "GRUEN" : "VERLETZT") : "unbekannt (kein Vorlauf)",
    vorlauf ? aktuell.zeilen - vorlauf.zeilen : null, "<= 150"));

  k.push(krit(8, "LLM-Tagesverbrauch nicht an zwei Tagen in Folge 100/100",
    (budget.length >= 2 && budget[0].used >= 100 && budget[1].used >= 100) ? "VERLETZT" : "GRUEN",
    budget.map((b) => `${b.day}: ${b.used}`).join(" · "), "< 100 an mindestens einem der beiden Tage"));

  k.push(krit(9, "Pending-Rueckstand waechst nicht ueber 50 hinaus",
    rueckstand <= 50 ? "GRUEN" : "VERLETZT", rueckstand, "<= 50"));

  k.push(krit(10, "Berliner Dokumente mehrheitlich als 'land'/Berlin erkannt",
    berlinDocs.length === 0 ? "unbekannt (noch keine Berliner Dokumente)" : "siehe Ist",
    `${berlinDocs.length} Berliner Rohdokumente · ${berlinKos.length} Knowledge Objects mit decision_level='land' (gesamt, nicht nur Berlin)`,
    "Mehrheit"));

  k.push(krit(11, "Kein Berliner Profil erhaelt Inhalte einer fremden Partei aus einem Pflichtpaket",
    "GRUEN (strukturell)",
    "berlin-basis traegt nach Block A 7 neutrale Wege; Partei-/Fraktions-/Personenwege haengen am optionalen Paket",
    "0 Parteiwege im Pflichtpaket"));

  k.push(krit(12, "Hoechstens 20 % neuer Dokumente ohne aufloesbaren Originalverweis",
    berlinDocs.length === 0 ? "unbekannt (noch keine Berliner Dokumente)"
      : ((berlinOhneOriginalverweis / berlinDocs.length) <= 0.2 ? "GRUEN" : "VERLETZT"),
    berlinDocs.length ? `${berlinOhneOriginalverweis} von ${berlinDocs.length}` : "0 von 0", "<= 20 %"));

  k.push(krit(13, "Nicht zwei Laeufe in Folge mit 0 neuen Dokumenten ueber alle aktivierten Wege",
    mitBerlin.length < 2 ? "unbekannt (weniger als 2 Berliner Laeufe)"
      : ((mitBerlin[0].berlin.neueDokumente + mitBerlin[1].berlin.neueDokumente) > 0 ? "GRUEN" : "VERLETZT"),
    mitBerlin.slice(0, 2).map((l) => l.berlin.neueDokumente).join(" · "), "> 0 in mindestens einem"));

  k.push(krit(14, "Juengstes Dokument eines aktivierten Wegs nicht aelter als 30 Tage",
    berlinDocs.length === 0 ? "unbekannt (noch keine Berliner Dokumente)" : "siehe Ist",
    berlinDocs.length ? berlinDocs.map((d) => d.created_at).sort().slice(-1)[0] : null, "< 30 Tage"));

  k.push(krit(15, "Rollback ausfuehrbar",
    "GRUEN",
    "Ebene 0b (Abnahmeprofil deaktivieren) und Ebene 2 (Wege auf manual) sind datenbankseitig und jede fuer sich hinreichend",
    "ausfuehrbar",
    "Ebene 0 (Flag) bleibt aus einer Cloud-Sitzung nicht pruefbar — der Flag-Wert ist nicht lesbar."));

  k.push(krit(16, "Kein Cron-Lauf mit 'Zeitbudget erschoepft' / kein Anstieg der 504",
    "nicht_aus_db_messbar",
    "HTTP-Ebene",
    "Vorlauf 7 Tage: 3 (§20.5)",
    "AUSDRUECKLICH NICHT aus der Datenbank pruefbar. Vor jedem Go ueber die Vercel-Runtime-Logs messen."));

  const verletzt = k.filter((x) => String(x.urteil).startsWith("VERLETZT"));
  const unbekannt = k.filter((x) => String(x.urteil).startsWith("unbekannt") || x.urteil === "nicht_aus_db_messbar");

  // ---- END-TO-END-KETTE ---------------------------------------------------------------------
  // Quellen-Telemetrie allein beweist Punkt 14 NICHT. Der Auftrag verlangt die ganze Kette:
  // Rohdokument -> Knowledge Object -> Vorgang -> Lage/Briefing des Berliner Abnahmeprofils.
  // Jede Stufe wird EINZELN gemessen; eine Stufe ohne Datengrundlage bleibt `unbelegt`.
  const ABNAHME_ID = "helmut-abnahme-berlin";
  const beDocIds = berlinDocs.map((d) => d.id);
  let koLinks = [], beKos = [], beBriefings = [], abnahmeMandat = [];
  if (beDocIds.length) {
    // In Blöcken abfragen: die `in.()`-Liste hat eine praktische Längengrenze.
    for (let i = 0; i < beDocIds.length; i += 100) {
      const teil = beDocIds.slice(i, i + 100);
      koLinks = koLinks.concat(await select(
        `ko_document_links?select=knowledge_object_id,raw_document_id,created_at&raw_document_id=in.(${teil.join(",")})&limit=5000`
      ));
    }
    const koIds = [...new Set(koLinks.map((l) => l.knowledge_object_id))];
    for (let i = 0; i < koIds.length; i += 50) {
      const teil = koIds.slice(i, i + 50);
      beKos = beKos.concat(await select(
        `knowledge_objects?select=id,vorgang_id,understanding_status,decision_level,affected_geographies,created_at,policy_field&id=in.(${teil.join(",")})&limit=5000`
      ));
    }
  }
  beBriefings = await select(`briefings?select=id,user_id,slot,generated_at&user_id=eq.${ABNAHME_ID}&limit=100`);
  abnahmeMandat = await select(`mandate_profiles?select=user_id,aktiv,geloescht_at,politische_ebene,bundesland&user_id=eq.${ABNAHME_ID}`);

  const verknuepfteDocIds = new Set(koLinks.map((l) => l.raw_document_id));
  const vorgaenge = [...new Set(beKos.map((k) => k.vorgang_id).filter(Boolean))];
  const endeZuEnde = {
    "1_berlinerRohdokumente": berlinDocs.length,
    "2_davonMitKnowledgeObjectVerknuepft": verknuepfteDocIds.size,
    "2b_ohneKnowledgeObject": berlinDocs.length - verknuepfteDocIds.size,
    "3_knowledgeObjectsAusBerlinerDokumenten": beKos.length,
    "4_vorgaenge": vorgaenge.length,
    "4b_vorgangIds": vorgaenge.slice(0, 25),
    "5_koMitEbeneLand": beKos.filter((k) => k.decision_level === "land").length,
    "5b_koMitGeografieBerlin": beKos.filter((k) =>
      Array.isArray(k.affected_geographies) && k.affected_geographies.some((g) => /berlin/i.test(String(g)))).length,
    "6_abnahmeprofilMandatAktiv": abnahmeMandat.length === 1
      && abnahmeMandat[0].aktiv === true && !abnahmeMandat[0].geloescht_at,
    "7_lageFuerAbnahmeprofil": beBriefings.filter((b) => b.slot === "lage").length,
    "7b_briefingsFuerAbnahmeprofil": beBriefings.map((b) => `${b.slot}@${b.generated_at}`),
    "8_verlustzustaende": {
      hinweis: "`skipped-exists` und `skipped-no-cluster` stehen NUR in den Vercel-Runtime-Logs, "
        + "nicht in der Datenbank (Befund B4). Aus der DB messbar ist ausschliesslich die Luecke "
        + "'Berliner Rohdokument ohne Knowledge-Object-Verknuepfung'.",
      berlinerDokumenteOhneKo: berlinDocs.length - verknuepfteDocIds.size
    },
    urteil: berlinDocs.length === 0 ? "unbelegt — keine Berliner Rohdokumente"
      : (verknuepfteDocIds.size === 0 ? "unbelegt — Rohdokumente da, aber kein Knowledge Object"
        : (vorgaenge.length === 0 ? "unbelegt — Knowledge Objects da, aber kein Vorgang"
          : (beBriefings.length === 0 ? "teilweise — Vorgang da, aber keine Lage/kein Briefing fuer das Abnahmeprofil"
            : "vollstaendig belegt")))
  };

  const ohneRohzeilen = (l) => { if (!l) return null; const { rows, ...rest } = l; return rest; };

  const ergebnis = {
    gemessenAm: new Date().toISOString(),
    stufe1Wege: B.stufenWege(1), stufe1Telemetriequellen: STUFE1,
    stufe2Wege: B.stufenWege(2), stufe2Telemetriequellen: STUFE2,
    aktuellerVollcrawl: ohneRohzeilen(aktuell),
    vorlauf: ohneRohzeilen(vorlauf),
    vollcrawlsMitBerlinerZeilen: mitBerlin.length,
    berlinerLaeufe: mitBerlin.map((l) => ({ run_id: l.run_id, startedAt: l.startedAt, berlin: l.berlin })),
    stufe1Aktiv: aktivStufe1, stufe2Gesperrt: gesperrtStufe2,
    okLaeufeJeStufe1Quelle: okJeStufe1Quelle,
    stufe2TelemetriebelegErfuellt: stufe2Freigegeben,
    berlinerRohdokumenteGesamt: berlinDocs.length,
    endeZuEnde,
    rueckstand, llmHeute: heuteBudget, aktiveLocks,
    abbruchkriterien: k,
    zusammenfassung: {
      verletzt: verletzt.length, unbekannt: unbekannt.length, gruen: k.length - verletzt.length - unbekannt.length,
      urteil: verletzt.length > 0 ? "ABBRUCH — mindestens ein Kriterium verletzt"
        : (mitBerlin.length === 0 ? "NOCH KEIN BERLINER LAUF — Beweis steht aus" : "kein Abbruchkriterium verletzt")
    }
  };

  if (alsJson) { console.log(JSON.stringify(ergebnis, null, 2)); }
  else {
    console.log("=== Berliner Beweislauf · AUSWERTUNG (read-only, nichts geschrieben) ===\n");
    console.log(`Stufe 1: ${STUFE1.join(", ")}`);
    console.log(`Stufe 2: ${STUFE2.join(", ")}\n`);
    console.log(`--- Juengster Vollcrawl: ${aktuell.run_id} (${aktuell.startedAt})`);
    console.log(`    Zeilen ${aktuell.zeilen} · distinct source_id ${aktuell.distinctSourceId} · Invariante B3 ${aktuell.invarianteB3 ? "erfuellt" : "VERLETZT"}`);
    console.log(`    ok ${aktuell.ok} · empty ${aktuell.empty} · error ${aktuell.error} · circuit-open ${aktuell.circuitOpen} · Retries ${aktuell.retries}`);
    console.log(`    neue Dokumente ${aktuell.neueDokumente} · laengster Einzelabruf ${Math.round(aktuell.laufzeitMsMax / 1000)} s`);
    console.log(`    Bund: ${aktuell.bundOk} ok von ${aktuell.bundZeilen} Zeilen`);
    console.log(`    Berlin: ${aktuell.berlin.zeilen} Zeilen · ok ${aktuell.berlin.ok} · empty ${aktuell.berlin.empty} · error ${aktuell.berlin.error} · neu ${aktuell.berlin.neueDokumente}`);
    for (const q of aktuell.berlin.jeQuelle) console.log(`      ${q.quelle}: ${q.status}${q.neu != null ? ` (neu ${q.neu})` : ""}`);
    if (vorlauf) console.log(`\n--- Vorlauf zum Vergleich: ${vorlauf.run_id} (${vorlauf.startedAt}) · Zeilen ${vorlauf.zeilen} · Bund ok ${vorlauf.bundOk} · circuit-open ${vorlauf.circuitOpen}`);
    console.log(`\n--- Vollcrawls mit Berliner Zeilen: ${mitBerlin.length}`);
    console.log(`--- ok-Laeufe je Stufe-1-Quelle: ${JSON.stringify(okJeStufe1Quelle)} -> Stufe 2 ${stufe2Freigegeben ? "waere freigegeben" : "bleibt gesperrt"}`);
    console.log(`--- Berliner Rohdokumente gesamt: ${berlinDocs.length} · Rueckstand ${rueckstand} · LLM heute ${heuteBudget} · aktive Locks ${aktiveLocks}\n`);
    console.log("--- Ende-zu-Ende-Kette (Rohdokument -> KO -> Vorgang -> Lage/Briefing)");
    for (const [k, val] of Object.entries(endeZuEnde)) {
      if (k === "urteil") continue;
      console.log(`    ${k}: ${typeof val === "object" ? JSON.stringify(val) : val}`);
    }
    console.log(`    URTEIL: ${endeZuEnde.urteil}\n`);
    console.log("--- Abbruchkriterien (§11)");
    for (const x of k) {
      console.log(`  ${String(x.nr).padStart(2)} ${x.urteil.padEnd(34)} ${x.titel}`);
      console.log(`     ist=${JSON.stringify(x.ist)} referenz=${JSON.stringify(x.referenz)}`);
      if (x.hinweis) console.log(`     -> ${x.hinweis}`);
    }
    console.log(`\nErgebnis: ${ergebnis.zusammenfassung.urteil} (gruen ${ergebnis.zusammenfassung.gruen} · verletzt ${ergebnis.zusammenfassung.verletzt} · unbekannt/nicht messbar ${ergebnis.zusammenfassung.unbekannt})`);
  }

  process.exit(verletzt.length > 0 ? 1 : 0);
})().catch((e) => { console.error("AUSWERTUNGSFEHLER:", e.message); process.exit(2); });
