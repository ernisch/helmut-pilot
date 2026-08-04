"use strict";

// OP-25 — rein lesender Production-Nachweis des globalen Abrufpfads (K2.1), E3-Fassung.
// =============================================================================================
// WOZU: fuehrt den NEUEN OP-25-Production-Nachweis nach der (zukuenftigen, getrennt
// freigegebenen) Wiederaktivierung des globalen Abrufs. Der Vertrag selbst ist reine
// Logik in `lib/helmut/op25-nachweis.js` (testgesichert, mutationsgeprueft); dieses CLI
// liest ausschliesslich Production-Daten und die wirksame Cron-Konfiguration und gibt
// einen ehrlichen Bericht mit vier Ausgaengen aus.
//
// AUSGAENGE / EXIT-CODES:
//   0 bestanden · 1 nicht_bestanden · 2 blockiert · 3 noch_nicht_auswertbar
//   (Lese-/Parameterfehler enden als 2 — fail closed, nie als Erfolg.)
//
// ── SCHREIBSCHUTZ (technisch, nicht nur zugesagt; Muster punkt25b) ───────────────────────────
// 1. GENAU EINE HTTP-Funktion (`holen`). Ihre Methode ist die Konstante HTTP_METHODE —
//    ein GET-Literal ohne Parameter. Eine Schreiboperation ist strukturell nicht
//    erreichbar, nicht bloss nicht aufgerufen.
// 2. Jeder Pfad laeuft durch `pfadErlaubt()`: nur `/rest/v1/<tabelle>` aus einer festen
//    Allowlist. `/rest/v1/rpc/...` ist gesperrt (eine Datenbankfunktion koennte auch per
//    GET schreiben). Fail closed.
// 3. `lib/helmut/storage.js` wird NICHT geladen — kein Schreibpfad im Prozess. Es gibt
//    keinen Cron-Trigger, keinen Pipeline-Aufruf, keine Flag-/Env-Aenderung, 0 KI-Aufrufe.
// 4. Ausgegeben werden ausschliesslich technische Kennungen (Mandats-Slugs, Laufkennungen),
//    Zaehler und Zeitstempel — keine Profilinhalte, keine Dokumenttexte, keine Secrets.
// 5. Der EINZIGE Schreibvorgang des Werkzeugs ist `--startbaseline-schreiben <datei>`: eine
//    LOKALE Belegdatei ausserhalb von Production (technische Slugs, Zaehler, Zeitstempel).
//    Production wird dabei ausschliesslich gelesen.
//
// ── BEOBACHTUNGSFENSTER ──────────────────────────────────────────────────────────────────────
// Das Fenster ist EXPLIZIT (Start/Ende) und beginnt erst nach der erneuten Aktivierung
// des globalen Abrufs (Betreiberaktion). Laeufe vor dem 2026-08-04 — insbesondere der
// gescheiterte Lauf vom 2026-08-03 — koennen NIE in den Nachweis einfliessen (harte
// Untergrenze im Bewertungskern). Ein Fenster unter 24 vollstaendig vergangenen Stunden
// wird nie gruen.
//
// ── ZWEI SCHRITTE, WEIL DIE MANDATSMENGE EINGEFROREN WIRD ────────────────────────────────────
// Schritt 1 (unmittelbar NACH der Aktivierung): Startbaseline erheben.
//   node scripts/op25-production-nachweis.js --aktivierung <ISO> \
//        --startbaseline-schreiben belege/op25-startbaseline.json
// Schritt 2 (fruehestens 24 h spaeter): auswerten.
//   node scripts/op25-production-nachweis.js --aktivierung <ISO> \
//        --startbaseline belege/op25-startbaseline.json
// Ohne Startbaseline ist der Mandatsbestand zum Aktivierungszeitpunkt nicht belegt — das
// Ergebnis ist dann ehrlich `blockiert`, nie ein Ersatz aus dem AKTUELLEN Bestand.
//
// Weitere Aufrufe:
//   node scripts/op25-production-nachweis.js              # Dry-Run: ehrlicher Zustand heute
//   node scripts/op25-production-nachweis.js --baseline   # rein lesender Betriebsquerschnitt

const https = require("https");
const fs = require("fs");
const path = require("path");
const vertrag = require("../lib/helmut/op25-nachweis");

const HTTP_METHODE = "GET"; // Literal, nicht konfigurierbar
const ERLAUBTE_TABELLEN = Object.freeze([
  "helmut_store", "process_runs", "knowledge_objects", "retrieval_paths"
]);

// Heute dokumentierter Bestand (Baseline-Querschnitt 2026-08-04): fuenf aktive reale
// Mandate. KEINE Namensliste — die Menge selbst wird IMMER dynamisch gelesen; die Zahl
// ist nur eine Gegenprobe und per --erwartete-mandate ueberschreibbar. Die alte
// Sechs-Mandate-Erwartung ist damit ausdruecklich ausser Kraft.
const DOKUMENTIERTE_ERWARTETE_MANDATE = 5;

// Dokumentierter LLM-Kostenrahmen je 24-h-Fenster (USD). HERLEITUNG (Baseline
// 2026-08-04, rein lesend erhoben): gemessene 24-h-Kosten des Altpfads 0,20 USD
// (BERECHNETER Schaetzwert — llmPriceProvenance) × Faktor 10 als bewusster Puffer
// fuer den aktivierten globalen Pfad (mehr Verstehensarbeit ist dort beabsichtigt).
// Hart gedeckelt bleibt ohnehin HELMUT_MAX_LLM_CALLS_PER_DAY (Production: 100/Tag,
// fail-closed Fallback 50). Ueberschreibbar per --kostenrahmen-usd bzw.
// HELMUT_OP25_KOSTENRAHMEN_USD; ohne belastbaren Rahmen bleibt der Nachweis `blockiert`.
const DOKUMENTIERTER_KOSTENRAHMEN_USD = Number(process.env.HELMUT_OP25_KOSTENRAHMEN_USD || 2);

// Retention der Laufdatensaetze im Blob (storage.js: HELMUT_CRAWL_RUN_RETENTION, Default 20).
// Die Aufbewahrungsgrenze der Nutzungseintraege steht im Kern (`vertrag.LLM_USAGE_RETENTION`),
// damit Leser und Grenze nicht auseinanderlaufen koennen.
const LAUF_RETENTION = Math.max(1, Number(process.env.HELMUT_CRAWL_RUN_RETENTION) || 20);

function pfadErlaubt(pfad) {
  if (typeof pfad !== "string" || !pfad.startsWith("/rest/v1/")) return false;
  if (pfad.includes("..") || pfad.includes("//", 1)) return false;
  return ERLAUBTE_TABELLEN.includes(pfad.slice("/rest/v1/".length).split("?")[0]);
}

function holen(pfad) {
  if (!pfadErlaubt(pfad)) {
    return Promise.reject(new Error(`[SCHREIBSCHUTZ] Pfad nicht erlaubt: ${pfad}`));
  }
  const basis = process.env.SUPABASE_URL;
  const schluessel = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!basis || !schluessel) {
    return Promise.reject(new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (nur aus process.env, CLAUDE.md §4.9)"));
  }
  return new Promise((erfuellen, ablehnen) => {
    const anfrage = https.request(new URL(basis + pfad), {
      method: HTTP_METHODE,
      headers: { apikey: schluessel, Authorization: `Bearer ${schluessel}`, Accept: "application/json" }
    }, (antwort) => {
      let text = "";
      antwort.on("data", (teil) => { text += teil; });
      antwort.on("end", () => {
        if (antwort.statusCode >= 400) return ablehnen(new Error(`HTTP ${antwort.statusCode}: ${text.slice(0, 200)}`));
        try { erfuellen(JSON.parse(text)); } catch (fehler) { ablehnen(fehler); }
      });
    });
    anfrage.on("error", ablehnen);
    anfrage.end();
  });
}

// --- Argumente -------------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) { args._.push(a); continue; }
    const name = a.slice(2);
    const naechstes = argv[i + 1];
    if (naechstes != null && !naechstes.startsWith("--")) { args[name] = naechstes; i += 1; }
    else args[name] = true;
  }
  return args;
}

function parseIsoMs(wert, name) {
  if (wert == null || wert === true) return null;
  const ms = Date.parse(String(wert));
  if (!Number.isFinite(ms)) throw new Error(`Parameter ${name}: kein gueltiger Zeitstempel: ${wert}`);
  return ms;
}

// --- Datenzugriffe (alle rein lesend) --------------------------------------------------------

const STORE_ID = process.env.HELMUT_SUPABASE_STORE_ID || "main";
const AUTH_STORE_ID = process.env.HELMUT_SUPABASE_AUTH_STORE_ID || `${STORE_ID}-auth`;

async function leseStoreZeile(id) {
  const rows = await holen(`/rest/v1/helmut_store?id=eq.${encodeURIComponent(id)}&select=data`);
  return Array.isArray(rows) && rows[0] ? rows[0].data : null;
}

function istAktivesMandat(profil) {
  if (!profil || typeof profil !== "object") return false;
  if (profil.profileActive === false || profil.aktiv === false) return false;
  if (profil.deletedAt || profil.geloescht_at || profil.deleted_at) return false;
  return true;
}

function aktiveMandateAus(mainStore) {
  if (!mainStore || typeof mainStore !== "object") return null;
  const profile = Object.values(mainStore.profiles || {});
  if (!profile.length) return null;
  return profile.filter(istAktivesMandat).map((p) => String(p.id)).sort();
}

function leseCrons() {
  const datei = path.join(__dirname, "..", "vercel.json");
  const inhalt = JSON.parse(fs.readFileSync(datei, "utf8"));
  return Array.isArray(inhalt.crons) ? inhalt.crons : [];
}

// DAUERHAFTE Laufbelege der globalen Phase. Zwei Quellen, dedupliziert ueber die
// Laufkennung: die relationale Tabelle `process_runs` (kanonisch, sofern das Dual-Write-
// Flag aktiv ist) und der Auth-Store-Spiegel (Blob, bis zu 300 Eintraege). Sie sind der
// Beleg dafuer, DASS ein Lauf stattgefunden hat, auch wenn sein reicher Laufdatensatz
// der Blob-Retention (20) zum Opfer gefallen ist.
async function leseDauerhafteLaufzeilen(authStore) {
  const gefunden = new Map();
  let relationalFehler = null;
  try {
    const rows = await holen(
      `/rest/v1/process_runs?select=run_id,process,status,duration_ms,started_at,finished_at,created_at,commit_ref`
      + `&process=eq.${vertrag.GLOBALPHASE_PROZESS}&order=created_at.desc&limit=1000`
    );
    for (const r of Array.isArray(rows) ? rows : []) {
      if (!r || !r.run_id) continue;
      gefunden.set(String(r.run_id), {
        runId: String(r.run_id),
        process: r.process,
        status: r.status || null,
        durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
        createdAt: r.created_at || null,
        commit: r.commit_ref || null,
        quelle: "relational"
      });
    }
  } catch (fehler) {
    relationalFehler = String((fehler && fehler.message) || fehler).slice(0, 160);
  }
  for (const r of (authStore && Array.isArray(authStore.processRuns)) ? authStore.processRuns : []) {
    if (!r || r.process !== vertrag.GLOBALPHASE_PROZESS || !r.runId) continue;
    if (gefunden.has(String(r.runId))) continue;
    gefunden.set(String(r.runId), {
      runId: String(r.runId),
      process: r.process,
      status: r.status || null,
      durationMs: r.durationMs == null ? null : Number(r.durationMs),
      createdAt: r.createdAt || null,
      commit: r.commit || null,
      quelle: "blob"
    });
  }
  return { zeilen: [...gefunden.values()], relationalFehler };
}

// ZULETZT BEOBACHTETER PROZESS-COMMIT — ausdruecklich NICHT der aktuelle Deployment-Stand.
// `process_runs.commit_ref` wird aus `VERCEL_GIT_COMMIT_SHA` desjenigen Laufs gespeist, der
// die Zeile geschrieben hat. Er ist damit der Commit des JUENGSTEN GESPEICHERTEN LAUFS —
// nach einem frischen Deployment, das noch keinen Lauf erzeugt hat, ist er VERALTET.
// Ihn „Deployment-Commit" zu nennen waere eine Behauptung ueber etwas, das hier nicht
// gemessen wird (Review 3 zu PR #222). Der Vercel-Deployment-Zustand ist aus einer Sitzung
// nicht lesbar (Egress zu `api.vercel.com` gesperrt, vorgangskontext.md §7.3) — deshalb wird
// er nicht geraten, sondern der Betreiber kann ihn per `--erwarteter-commit` ausdruecklich
// uebergeben; dann wird STRIKT geprueft.
async function leseZuletztBeobachtetenProzessCommit() {
  try {
    const rows = await holen(
      "/rest/v1/process_runs?select=commit_ref,created_at&commit_ref=not.is.null"
      + "&order=created_at.desc&limit=1"
    );
    const zeile = Array.isArray(rows) && rows[0] ? rows[0] : null;
    const treffer = zeile ? zeile.commit_ref : null;
    return {
      commit: (typeof treffer === "string" && treffer.trim()) ? treffer.trim() : null,
      beobachtetAt: (zeile && zeile.created_at) || null
    };
  } catch (_) {
    return { commit: null, beobachtetAt: null };
  }
}

// Strikte Gegenprobe eines AUSDRUECKLICH uebergebenen erwarteten Deployment-Commits gegen
// den zuletzt beobachteten Prozess-Commit. Nur bei exakter Uebereinstimmung ist belegt, dass
// der erwartete Stand bereits Laeufe erzeugt hat. Jede Abweichung ist fail closed: entweder
// laeuft ein anderer Stand, oder der erwartete Stand hat noch keinen Lauf hinterlassen —
// in beiden Faellen darf nichts als „aktueller Deployment-Stand" festgehalten werden.
function pruefeErwartetenCommit(erwartet, beobachtet) {
  const soll = (typeof erwartet === "string" && erwartet.trim()) ? erwartet.trim() : null;
  if (!soll) return { uebergeben: false, bestaetigt: false, erwartet: null };
  if (!beobachtet) {
    return {
      uebergeben: true, bestaetigt: false, erwartet: soll,
      grund: "Es gibt keinen gespeicherten Prozess-Commit — der erwartete Stand ist nicht belegbar."
    };
  }
  // Kurzform (7–12 Zeichen) gegen Vollform zulassen, aber nur als echtes Praefix.
  const gleich = soll === beobachtet
    || (soll.length >= 7 && beobachtet.startsWith(soll))
    || (beobachtet.length >= 7 && soll.startsWith(beobachtet));
  return gleich
    ? { uebergeben: true, bestaetigt: true, erwartet: soll }
    : {
      uebergeben: true, bestaetigt: false, erwartet: soll,
      grund: `Zuletzt beobachteter Prozess-Commit ${beobachtet} weicht vom erwarteten ${soll} ab.`
    };
}

// --- Kostenvertrag: Summe UND belegte Vollstaendigkeit ---------------------------------------
// Der Leser selbst liegt im REINEN KERN (`vertrag.kostenAusNutzung`) — dort ist er direkt
// testbar, und der strikte Zahlenvertrag hat genau EINE Umsetzung. Frueher stand hier eine
// zweite, laxere Fassung (`typeof roh === "number" ? roh : Number(roh)`), die `"1.20"`,
// `true`, `false` und `null` still umdeutete, waehrend die Doku sie als unbrauchbar fuehrte.
function kostenImFenster(authStore, vonMs, bisMs, rahmenUsd) {
  return vertrag.kostenAusNutzung({
    authStore, vonMs, bisMs, rahmenUsd, retention: vertrag.LLM_USAGE_RETENTION
  });
}

const zeit = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().replace("T", " ").slice(0, 19) + "Z" : "—");

// --- Startbaseline (lokale Belegdatei, Production nur gelesen) --------------------------------

// Schreibt die Startbaseline. Ein GUELTIGER Aktivierungszeitpunkt ist Pflicht — eine Baseline
// mit `aktivierungAtMs: null` waere wertlos (sie koennte zu jeder Aktivierung gehoeren) und
// wuerde die Auswertung spaeter ohnehin blockieren. Deshalb wird hier gar nicht erst
// geschrieben (Review 2 zu PR #222).
function schreibeStartbaseline(datei, { aktivierungAtMs, aktiveMandate, prozessCommit, commitPruefung }) {
  if (!Number.isFinite(aktivierungAtMs)) {
    throw new Error("--startbaseline-schreiben verlangt einen gueltigen --aktivierung-Zeitpunkt"
      + " (ISO). Ohne ihn belegt die Baseline nichts.");
  }
  const jetztMs = Date.now();
  // Eine Aktivierung in der ZUKUNFT kann nicht belegt werden — es gibt noch nichts zu sehen.
  if (aktivierungAtMs > jetztMs) {
    throw new Error(`Der Aktivierungszeitpunkt ${new Date(aktivierungAtMs).toISOString()} liegt`
      + ` in der Zukunft (jetzt ${new Date(jetztMs).toISOString()}). Die Baseline wird erst`
      + " NACH der Aktivierung erhoben.");
  }
  // Und sie muss INNERHALB der dokumentierten Toleranz erhoben werden, sonst belegt sie
  // nicht den Bestand zum Aktivierungszeitpunkt (der Bewertungsvertrag wuerde sie ohnehin
  // ablehnen — dann gar nicht erst schreiben).
  if (jetztMs > aktivierungAtMs + vertrag.BASELINE_TOLERANZ_MS) {
    throw new Error(`Die Aktivierung liegt ${Math.round((jetztMs - aktivierungAtMs) / 60000)} min`
      + ` zurueck, zulaessig sind ${Math.round(vertrag.BASELINE_TOLERANZ_MS / 60000)} min.`
      + " Eine so spaet erhobene Baseline belegt den Bestand zum Aktivierungszeitpunkt nicht.");
  }
  const sig = vertrag.mandatsSignatur(aktiveMandate);
  if (!sig.anzahl) throw new Error("Startbaseline ohne Mandate — nichts zu belegen.");
  const inhalt = {
    zweck: "OP-25 Startbaseline: Mandatsmenge am Fensterstart, identitaetsgenau eingefroren",
    erhobenAt: new Date(jetztMs).toISOString(),
    erhobenAtMs: jetztMs,
    aktivierungAt: new Date(aktivierungAtMs).toISOString(),
    aktivierungAtMs,
    // EHRLICHE BENENNUNG (Review 3): das ist der Commit des juengsten GESPEICHERTEN Laufs,
    // NICHT der aktuelle Deployment-Stand. Nach einem frischen Deployment ohne Lauf ist er
    // veraltet. Ein Feld `deploymentCommit` gibt es bewusst nicht mehr.
    zuletztBeobachteterProzessCommit: (typeof prozessCommit === "string" && prozessCommit.trim()) ? prozessCommit.trim() : null,
    // Nur wenn der Betreiber einen erwarteten Commit UEBERGEBEN hat und er strikt zum
    // beobachteten passt, gilt der Stand als belegt. Sonst ausdruecklich `false`.
    erwarteterDeploymentCommit: (commitPruefung && commitPruefung.erwartet) || null,
    deploymentCommitBestaetigt: Boolean(commitPruefung && commitPruefung.bestaetigt),
    anzahl: sig.anzahl,
    mandate: sig.mandate,
    signatur: sig.signatur
  };
  fs.mkdirSync(path.dirname(path.resolve(datei)), { recursive: true });
  fs.writeFileSync(path.resolve(datei), JSON.stringify(inhalt, null, 2) + "\n", "utf8");
  return inhalt;
}

// Liest die Belegdatei ROH ein. Es wird bewusst NICHTS ergaenzt, umgedeutet oder repariert —
// die vollstaendige, strikte Pruefung macht `vertrag.pruefeStartbaseline` an genau einer
// Stelle. (Frueher stand hier ein `Number(null)`-Fallback, also erneut die stille Umdeutung
// von „fehlt" nach `0`.)
function leseStartbaseline(datei) {
  return JSON.parse(fs.readFileSync(path.resolve(datei), "utf8"));
}

// --- Baseline (rein lesend, PII-frei) --------------------------------------------------------

async function erhebeBaseline({ mainStore, authStore, fairnessStore, dauerhafte }) {
  const profile = Object.values((mainStore && mainStore.profiles) || {});
  const aktive = profile.filter(istAktivesMandat).map((p) => String(p.id)).sort();
  const inaktive = profile.filter((p) => !istAktivesMandat(p)).map((p) => String(p.id)).sort();
  const testmandate = profile.filter((p) => /^test-mdb-/.test(String(p && p.id)));

  const laeufe = Array.isArray(mainStore && mainStore.crawlRuns) ? mainStore.crawlRuns : [];
  const nachModus = {};
  for (const r of laeufe) nachModus[r.mode || "unbekannt"] = (nachModus[r.mode || "unbekannt"] || 0) + 1;
  const juengsterGlobal = laeufe.find((r) => r && r.mode === "global") || null;

  let prozessZeilen = [];
  try {
    prozessZeilen = await holen("/rest/v1/process_runs?select=run_id,process,status,mode,created_at,commit_ref&order=created_at.desc&limit=50");
  } catch (fehler) {
    prozessZeilen = [{ leseFehler: String(fehler.message || fehler).slice(0, 120) }];
  }
  let pendingKos = null;
  try {
    const rows = await holen("/rest/v1/knowledge_objects?select=id&status=eq.pending&limit=10000");
    pendingKos = Array.isArray(rows) ? rows.length : null;
  } catch (_) { pendingKos = null; }
  let abrufwege = null;
  try {
    const rows = await holen("/rest/v1/retrieval_paths?select=status&limit=10000");
    if (Array.isArray(rows)) {
      abrufwege = { gesamt: rows.length };
      for (const r of rows) abrufwege[r.status || "unbekannt"] = (abrufwege[r.status || "unbekannt"] || 0) + 1;
    }
  } catch (_) { abrufwege = null; }

  const heuteVorMs = Date.now() - 24 * 60 * 60 * 1000;
  const kosten24h = kostenImFenster(authStore, heuteVorMs, Date.now(), DOKUMENTIERTER_KOSTENRAHMEN_USD);
  const systemFehler = ((authStore && authStore.systemErrors) || []).slice(0, 200);
  const fehlerklassenBeobachtet = [...new Set(systemFehler.map((e) => String((e && e.scope) || "unbekannt")))].sort();

  const fairnessLaeufe = (fairnessStore && fairnessStore.laeufe) || {};
  const commit = (prozessZeilen.find((z) => z && z.commit_ref) || {}).commit_ref || null;
  const sig = vertrag.mandatsSignatur(aktive);

  return {
    erhobenAt: new Date().toISOString(),
    // EHRLICHE BENENNUNG (Review 3): Commit des juengsten GESPEICHERTEN Laufs, NICHT der
    // aktuelle Deployment-Stand — nach einem frischen Deployment ohne Lauf ist er veraltet.
    zuletztBeobachteterProzessCommit: commit,
    hinweisProzessCommit: "kein Deployment-Beleg: Commit des juengsten gespeicherten Laufs",
    mandate: {
      gesamt: profile.length, aktiv: sig.mandate, signatur: sig.signatur,
      inaktiv: inaktive, testmandateInProduction: testmandate.length
    },
    cronKadenz: vertrag.schwereKadenz(leseCrons()).map((k) => `${k.cronName}: ${k.schedule}`),
    laufdatensaetze: {
      retention: LAUF_RETENTION, gelesen: laeufe.length, nachModus,
      juengsterGlobalerLauf: juengsterGlobal ? juengsterGlobal.runId : null,
      // Aufbewahrungsvertrag: was ein 24-h-Fenster bei dieser Mandatszahl braucht.
      benoetigtFuer24hFenster: 3 * (1 + sig.anzahl)
    },
    dauerhafteGlobalphasenZeilen: {
      gefunden: (dauerhafte && dauerhafte.zeilen.length) || 0,
      relationalFehler: (dauerhafte && dauerhafte.relationalFehler) || null,
      juengste: (dauerhafte && dauerhafte.zeilen[0] && dauerhafte.zeilen[0].runId) || null
    },
    globalabrufBeleg: juengsterGlobal
      ? `letzter mode=global-Lauf: ${juengsterGlobal.runId} (${juengsterGlobal.createdAt})`
      : "kein mode=global-Laufdatensatz im Blob-Fenster — globaler Abruf nicht aktiv oder Retention ueberschritten",
    pendingWissensobjekte: pendingKos,
    abrufwege,
    llmKosten24h: kosten24h,
    systemfehlerScopes: fehlerklassenBeobachtet,
    bekannteFehlerklassen: vertrag.BEKANNTE_FEHLERKLASSEN,
    fairness: Object.fromEntries(Object.entries(fairnessLaeufe).map(([cron, l]) => [cron, {
      laufId: l && l.laufId, status: l && l.status, standAt: l && l.standAt
    }]))
  };
}

// --- Hauptprogramm ---------------------------------------------------------------------------

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const jetztMs = Date.now();

  console.log("OP-25 — rein lesender Production-Nachweis (E3-Fassung, 2026-08-04)");
  console.log("=".repeat(78));
  console.log("Schreibschutz: GET-Literal + Tabellen-Allowlist; storage.js nicht geladen;");
  console.log("kein Cron-Trigger, keine Flag-/Env-Aenderung, 0 KI-Aufrufe.");
  console.log(`Messzeitpunkt: ${new Date(jetztMs).toISOString()}\n`);

  const mainStore = await leseStoreZeile(STORE_ID);
  const authStore = await leseStoreZeile(AUTH_STORE_ID);
  const fairnessStore = await leseStoreZeile(`${STORE_ID}-cron-fairness`);
  const dauerhafte = await leseDauerhafteLaufzeilen(authStore);

  const aktivierungAtMs = parseIsoMs(args.aktivierung ?? process.env.HELMUT_OP25_AKTIVIERUNG_AT, "--aktivierung");
  const aktiveMandate = aktiveMandateAus(mainStore);

  if (args.baseline) {
    const baseline = await erhebeBaseline({ mainStore, authStore, fairnessStore, dauerhafte });
    console.log("== BASELINE (rein lesend, PII-frei) ==");
    console.log(JSON.stringify(baseline, null, 2));
    process.exit(0);
  }

  // ---- Schritt 1: Startbaseline erheben (Production nur gelesen) ---------------------------
  if (args["startbaseline-schreiben"]) {
    if (!Array.isArray(aktiveMandate) || !aktiveMandate.length) {
      console.error("MESSFEHLER: aktive Mandatsmenge nicht lesbar — keine Startbaseline geschrieben.");
      process.exit(2);
    }
    // FAIL CLOSED: ohne gueltigen Aktivierungszeitpunkt wird gar nicht erst geschrieben.
    if (!Number.isFinite(aktivierungAtMs)) {
      console.error("MESSFEHLER: --startbaseline-schreiben verlangt einen gueltigen"
        + " --aktivierung-Zeitpunkt (ISO). Ohne ihn belegt die Baseline nichts — nichts geschrieben.");
      process.exit(2);
    }
    const beobachtet = await leseZuletztBeobachtetenProzessCommit();
    const commitPruefung = pruefeErwartetenCommit(args["erwarteter-commit"], beobachtet.commit);
    // Ein AUSDRUECKLICH erwarteter Commit, der nicht belegt ist, ist fail closed: entweder
    // laeuft ein anderer Stand oder der erwartete hat noch keinen Lauf hinterlassen.
    if (commitPruefung.uebergeben && !commitPruefung.bestaetigt) {
      console.error(`MESSFEHLER: ${commitPruefung.grund} — nichts geschrieben.`);
      console.error("Entweder das Deployment abwarten, bis es einen Lauf erzeugt hat, oder"
        + " --erwarteter-commit weglassen (dann wird KEIN Deployment-Stand behauptet).");
      process.exit(2);
    }
    let inhalt;
    try {
      inhalt = schreibeStartbaseline(String(args["startbaseline-schreiben"]), {
        aktivierungAtMs, aktiveMandate, prozessCommit: beobachtet.commit, commitPruefung
      });
    } catch (fehler) {
      console.error(`MESSFEHLER: ${(fehler && fehler.message) || fehler} — nichts geschrieben.`);
      process.exit(2);
    }
    console.log("== STARTBASELINE GESCHRIEBEN (lokale Belegdatei; Production nur gelesen) ==");
    console.log(JSON.stringify(inhalt, null, 2));
    if (!inhalt.deploymentCommitBestaetigt) {
      console.log("\nHINWEIS: `zuletztBeobachteterProzessCommit` ist der Commit des juengsten"
        + " GESPEICHERTEN Laufs, NICHT der aktuelle Deployment-Stand. Wer ihn belegen will,"
        + " uebergibt `--erwarteter-commit <sha>` — dann wird strikt geprueft.");
    }
    console.log("\nFruehestens 24 h nach der Aktivierung mit `--startbaseline <datei>` auswerten.");
    process.exit(0);
  }

  const fensterStartMs = parseIsoMs(args["fenster-start"], "--fenster-start") ?? aktivierungAtMs;
  const fensterEndeMs = parseIsoMs(args["fenster-ende"], "--fenster-ende")
    ?? (fensterStartMs != null ? fensterStartMs + vertrag.MIN_FENSTER_MS : null);

  let startbaseline = null;
  if (args.startbaseline) {
    try {
      startbaseline = leseStartbaseline(String(args.startbaseline));
    } catch (fehler) {
      console.error(`MESSFEHLER: Startbaseline nicht lesbar (${(fehler && fehler.message) || fehler}) — fail closed.`);
      console.log(`[op25-nachweis/json] ${JSON.stringify({ ausgang: "blockiert", exitCode: 2, grund: "startbaseline-nicht-lesbar" })}`);
      process.exit(2);
    }
  }

  const laeufe = mainStore && Array.isArray(mainStore.crawlRuns) ? mainStore.crawlRuns : null;
  const fairnessLaeufe = (fairnessStore && fairnessStore.laeufe) || null;

  const kostenrahmenUsd = args["kostenrahmen-usd"] != null
    ? Number(args["kostenrahmen-usd"])
    : DOKUMENTIERTER_KOSTENRAHMEN_USD;
  const kosten = (fensterStartMs != null && fensterEndeMs != null)
    ? kostenImFenster(authStore, fensterStartMs, fensterEndeMs, kostenrahmenUsd)
    : null;

  const bewertung = vertrag.bewerteNachweisfenster({
    jetztMs,
    fenster: (fensterStartMs != null && fensterEndeMs != null) ? { vonMs: fensterStartMs, bisMs: fensterEndeMs } : null,
    aktivierungAtMs,
    startbaseline,
    crons: leseCrons(),
    laeufe,
    prozessLaeufe: dauerhafte.zeilen,
    laufRetention: LAUF_RETENTION,
    aktiveMandate,
    erwarteteMandatszahl: args["erwartete-mandate"] != null
      ? Number(args["erwartete-mandate"])
      : DOKUMENTIERTE_ERWARTETE_MANDATE,
    kosten,
    kontextErklaerungen: args["kontext-erklaerung"] ? { "*": String(args["kontext-erklaerung"]) } : {},
    fairnessLaeufe
  });

  const endSig = Array.isArray(aktiveMandate) ? vertrag.mandatsSignatur(aktiveMandate) : null;
  console.log("== EINGABEN (rein lesend) ==");
  console.log(`aktive Mandate am Fensterende (dynamisch): ${endSig ? `${endSig.signatur} (${endSig.mandate.join(", ")})` : "NICHT LESBAR"}`);
  console.log(`eingefrorene Startbaseline: ${startbaseline
    ? `${Array.isArray(startbaseline.mandate) ? vertrag.mandatsSignatur(startbaseline.mandate).signatur : "(ohne Mandatsliste)"}`
      + ` (erhoben ${startbaseline.erhobenAt || "?"}, Datei-Signatur ${startbaseline.signatur || "fehlt"})`
    : "FEHLT — ohne sie ist der Zustand am Fensterstart nicht belegt"}`);
  console.log(`Laufdatensaetze im Blob: ${laeufe ? `${laeufe.length} (Retention ${LAUF_RETENTION})` : "NICHT LESBAR"}`
    + ` · dauerhafte globalphase-Zeilen: ${dauerhafte.zeilen.length}`
    + `${dauerhafte.relationalFehler ? ` (relational nicht lesbar: ${dauerhafte.relationalFehler})` : ""}`);
  console.log(`Aktivierung: ${zeit(aktivierungAtMs)} · Fenster: ${zeit(fensterStartMs)} → ${zeit(fensterEndeMs)}`);
  console.log(`Kosten im Fenster: ${kosten
    ? `${kosten.fensterUsd} USD (Rahmen ${kosten.rahmenUsd} USD, vollstaendig=${kosten.vollstaendig}, unbepreist=${kosten.unbepreisteEintraege})`
    : "—"}\n`);

  console.log("== BEWERTUNG JE ERWARTETEM LAUF ==");
  if (!bewertung.laeufe.length) console.log("(keine Laufbewertung — Fenster-/Eingabepruefung hat vorher geendet)");
  for (const l of bewertung.laeufe) {
    console.log(`  ${l.slot} → ${l.einstufung}${l.status ? ` (datenstand=${l.status})` : ""}`
      + `${l.versiegelteDauerMs != null ? ` · versiegelt ${l.versiegelteDauerMs} ms` : ""}`);
    for (const b of l.befunde) console.log(`      [${b.schwere}] ${b.grund}${b.detail ? ` — ${b.detail}` : ""}`);
  }
  if (bewertung.ausgeschlossen.length) {
    console.log("\n== AUSGESCHLOSSENE LAEUFE (mit Grund gezaehlt) ==");
    for (const a of bewertung.ausgeschlossen) console.log(`  ${a.runId}: ${a.grund}`);
  }
  if (bewertung.warnungen.length) {
    console.log("\n== WARNUNGEN ==");
    for (const w of bewertung.warnungen) console.log(`  ${w}`);
  }
  console.log("\n== BEFUNDE ==");
  if (!bewertung.befunde.length) console.log("  (keine)");
  for (const b of bewertung.befunde) console.log(`  [${b.schwere}] ${b.grund}${b.detail ? ` — ${b.detail}` : ""}`);

  console.log(`\n== ERGEBNIS: ${bewertung.ausgang.toUpperCase()} (Exit ${bewertung.exitCode}) ==`);
  console.log("Ausschliesslich lesende Zugriffe (GET), 0 KI-Aufrufe, 0,00 USD, kein Trigger.\n");
  // Maschinenlesbare Zusammenfassung (eine Zeile, stabiles Praefix):
  console.log(`[op25-nachweis/json] ${JSON.stringify({
    ausgang: bewertung.ausgang,
    exitCode: bewertung.exitCode,
    fenster: { von: zeit(fensterStartMs), bis: zeit(fensterEndeMs) },
    mandatsmenge: bewertung.mandatsmenge ? bewertung.mandatsmenge.signatur : null,
    endzustand: endSig ? endSig.signatur : null,
    benoetigteDatensaetze: bewertung.benoetigteDatensaetze ?? null,
    dauerhafteZeilen: dauerhafte.zeilen.length,
    befunde: bewertung.befunde.map((b) => ({ schwere: b.schwere, grund: b.grund })),
    warnungen: bewertung.warnungen.length,
    ausgeschlossen: bewertung.ausgeschlossen.length
  })}`);
  process.exit(bewertung.exitCode);
})().catch((fehler) => {
  console.error("MESSFEHLER (fail closed => blockiert):", (fehler && fehler.message) || fehler);
  console.log(`[op25-nachweis/json] ${JSON.stringify({ ausgang: "blockiert", exitCode: 2, messfehler: String((fehler && fehler.message) || fehler).slice(0, 200) })}`);
  process.exit(2);
});
