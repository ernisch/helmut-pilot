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
// ── ZWEI SCHRITTE, WEIL BASELINE UND DEPLOYMENT-STAND EINGEFROREN WERDEN ─────────────────────
// DER AKTIVIERUNGSZEITPUNKT ist der READY-Zeitpunkt des NEUEN Production-Deployments, das
// `HELMUT_CRON_GLOBALABRUF=on` tatsaechlich enthaelt. Das Setzen der Vercel-Env allein ist
// KEINE Aktivierung — eine Umgebungsvariable wirkt erst in einem neuen Deployment.
//
// Schritt 1 (unmittelbar NACH READY, innerhalb von 15 min): Startbaseline erheben.
//   node scripts/op25-production-nachweis.js --aktivierung <READY-ISO> \
//        --erwarteter-commit <voller Merge-Commit, 40 Hexziffern> \
//        --startbaseline-schreiben belege/op25-startbaseline.json
//   Der erwartete Commit ist PFLICHT und wird verbindlich gespeichert. Er wird beim
//   Schreiben AUSDRUECKLICH NICHT gegen alte Prozesslaeufe geprueft — direkt nach READY
//   kann noch kein Lauf des neuen Deployments existieren.
// Waehrend des 24-h-Fensters darf KEIN weiteres Production-Deployment erfolgen.
// Schritt 2 (fruehestens 24 h spaeter): auswerten.
//   node scripts/op25-production-nachweis.js --aktivierung <READY-ISO> \
//        --startbaseline belege/op25-startbaseline.json
//   (optional erneut --erwarteter-commit als Gegenprobe gegen die Belegdatei)
//   Alle zum Fenster gehoerenden `globalphase`-Prozesslaeufe muessen einen gueltigen
//   `commit_ref` tragen, der exakt zum gespeicherten Commit gehoert: fehlender Beleg =>
//   `blockiert`, abweichender Commit => `nicht_bestanden`.
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
// K2 (eine Mandatswahrheit): tenant-context ist PUR (kein IO, kein Netz; storage.js wird
// dort nur lazy geladen und hier NIE ausgeloest, weil listProfiles injiziert wird). Damit
// entscheidet EXAKT dieselbe Funktion wie in der Laufzeitplanung (resolveCronTenants ->
// listActiveTenantIds) ueber die aktive Mandatsmenge — der Schreibschutz bleibt unberuehrt.
const tenantContext = require("../lib/helmut/tenant-context");

const HTTP_METHODE = "GET"; // Literal, nicht konfigurierbar
const ERLAUBTE_TABELLEN = Object.freeze([
  // K2: `profiles` (mit eingebettetem mandate_profiles) ist die KANONISCHE relationale
  // Mandatswahrheit — der Blob ist fuer die Mandatsplanung keine Wahrheit mehr.
  "helmut_store", "process_runs", "knowledge_objects", "retrieval_paths", "profiles"
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

// Retention der Laufdatensaetze im Blob. Die Aufbewahrungsgrenze der
// Nutzungseintraege steht im Kern (`vertrag.LLM_USAGE_RETENTION`), damit Leser
// und Grenze nicht auseinanderlaufen koennen.
//
// KORRIGIERT 04.09.2026 (SR §38.2): Hier stand die Formel
// `Math.max(1, Number(process.env.HELMUT_CRAWL_RUN_RETENTION) || 20)` ein zweites
// Mal ausgeschrieben — eine Kopie der Regel, die in storage.js entfernt wurde.
// Sie haette den Nachweis mit einer Aufbewahrung rechnen lassen, die der Speicher
// gar nicht mehr anwendet (z. B. "20", obwohl bei fehlender Variable ueberhaupt
// nicht mehr gekuerzt wird). Gelesen wird jetzt dieselbe eine Wahrheit wie im
// Speicher. Ist die Aufbewahrung nicht belegt, wird sie ehrlich als `null`
// gefuehrt — nicht als erfundene Zahl.
const AUFBEWAHRUNG = require("../lib/helmut/speicherpfad-vorflug").crawlRunAufbewahrung();
const LAUF_RETENTION = AUFBEWAHRUNG.wirksam;

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

// K2: die BLOB-Profilsicht. Sie ist NICHT mehr die Mandatswahrheit des Nachweises —
// sie wird nur noch als Vergleichssicht gelesen, damit ein Widerspruch zur kanonischen
// relationalen Menge (zwei Mandatswahrheiten, genau der Befund des gescheiterten
// Nachweises) den Start blockieren kann statt still eine kleinere Menge zu planen.
function blobMandateAus(mainStore) {
  if (!mainStore || typeof mainStore !== "object") return null;
  const profile = Object.values(mainStore.profiles || {});
  if (!profile.length) return null;
  return profile.filter(istAktivesMandat).map((p) => String(p.id)).sort();
}

// K2: die KANONISCHE Mandatswahrheit — relational (`profiles` + `mandate_profiles`),
// gefiltert und sortiert von EXAKT der Laufzeitfunktion `listActiveTenantIds` mit der
// gemeinsamen puren Zeilenprojektion. Lesefehler => `aktive: null` (fail closed, KEIN
// stiller Rueckfall auf den Blob — der Nachweis blockiert dann verstaendlich).
async function leseAktiveMandateRelational() {
  try {
    const rows = await holen("/rest/v1/profiles?select=id,mandate_profiles(aktiv,geloescht_at)&order=id.asc&limit=5000");
    if (!Array.isArray(rows)) return { aktive: null, fehler: "unerwartete-antwort" };
    const aktive = await tenantContext.listActiveTenantIds({
      listProfiles: async () => rows.map(tenantContext.relationalesProfilLebenszyklus).filter(Boolean)
    });
    return { aktive, fehler: aktive === null ? "projektion-fehlgeschlagen" : null };
  } catch (fehler) {
    return { aktive: null, fehler: String((fehler && fehler.message) || fehler).slice(0, 160) };
  }
}

function leseCrons() {
  const datei = path.join(__dirname, "..", "vercel.json");
  const inhalt = JSON.parse(fs.readFileSync(datei, "utf8"));
  return Array.isArray(inhalt.crons) ? inhalt.crons : [];
}

// K3: die Watchdog-Kadenz aus der WIRKSAMEN Workflow-Datei (`briefing-watchdog.yml`) —
// geparst, nicht geraten. Der Watchdog war im gescheiterten Fenster ein realer vierter
// schwerer Lauf; ohne seine Slots ist der Aufbewahrungsbedarf nicht belegbar. Nicht
// lesbar/parsebar => `null` (der Vertrag blockiert dann fail closed).
function leseWatchdogCrons() {
  try {
    const datei = path.join(__dirname, "..", ".github", "workflows", "briefing-watchdog.yml");
    const inhalt = fs.readFileSync(datei, "utf8");
    const treffer = [...inhalt.matchAll(/-\s*cron:\s*["']([^"']+)["']/g)].map((m) => m[1]);
    return treffer.length ? treffer : null;
  } catch (_) {
    return null;
  }
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

// Schreibt die Startbaseline. Ein GUELTIGER Aktivierungszeitpunkt (der READY-Zeitpunkt des
// neuen Production-Deployments) und der VOLLSTAENDIGE erwartete Merge-Commit sind Pflicht —
// eine Baseline ohne beides waere wertlos (sie koennte zu jeder Aktivierung/jedem Stand
// gehoeren) und wuerde die Auswertung spaeter ohnehin fail closed abweisen. Deshalb wird
// hier gar nicht erst geschrieben.
function schreibeStartbaseline(datei, { aktivierungAtMs, aktiveMandate, prozessCommit, erwarteterCommit }) {
  if (!Number.isFinite(aktivierungAtMs)) {
    throw new Error("--startbaseline-schreiben verlangt einen gueltigen --aktivierung-Zeitpunkt"
      + " (ISO; der READY-Zeitpunkt des neuen Deployments). Ohne ihn belegt die Baseline nichts.");
  }
  // PFLICHT (Nachtragskorrektur 2026-08-04/5): der volle erwartete Merge-Commit. Kurzformen
  // genuegen nicht — die spaetere Auswertung prueft die `commit_ref`-Werte der Fensterlaeufe
  // EXAKT gegen diesen Wert.
  const vollerCommit = vertrag.normalisiereVollenCommit(erwarteterCommit);
  if (vollerCommit === null) {
    throw new Error("--startbaseline-schreiben verlangt --erwarteter-commit mit dem"
      + ` VOLLSTAENDIGEN erwarteten Merge-Commit (${vertrag.COMMIT_VOLL_LAENGE} Hexziffern).`);
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
    zweck: "OP-25 Startbaseline: Mandatsmenge und Deployment-Stand am Fensterstart, verbindlich eingefroren",
    erhobenAt: new Date(jetztMs).toISOString(),
    erhobenAtMs: jetztMs,
    // Der Aktivierungszeitpunkt ist der READY-Zeitpunkt des neuen Production-Deployments,
    // das das Flag tatsaechlich enthaelt — NICHT der Zeitpunkt der Env-Aenderung.
    aktivierungAt: new Date(aktivierungAtMs).toISOString(),
    aktivierungAtMs,
    // EHRLICHE BENENNUNG (Review 3): das ist der Commit des juengsten GESPEICHERTEN Laufs —
    // in der Regel des ALTEN Deployments. Rein informativ; er wird beim Schreiben
    // AUSDRUECKLICH NICHT gegen den erwarteten Commit geprueft (direkt nach READY kann noch
    // kein Lauf des neuen Deployments existieren) und bestaetigt nichts.
    zuletztBeobachteterProzessCommit: (typeof prozessCommit === "string" && prozessCommit.trim()) ? prozessCommit.trim() : null,
    hinweisProzessCommit: "kein Deployment-Beleg: Commit des juengsten gespeicherten Laufs (Alt-Bestand); beim Schreiben nicht geprueft",
    // VERBINDLICH gespeichert: der volle erwartete Merge-Commit. Bestaetigt wird er erst in
    // der Auswertung — alle `globalphase`-Fensterlaeufe muessen exakt diesen Commit tragen.
    erwarteterDeploymentCommit: vollerCommit,
    commitPruefung: "erst in der Auswertung: alle globalphase-Fensterlaeufe muessen commit_ref == erwarteterDeploymentCommit tragen",
    // K2: die Menge stammt aus der KANONISCHEN relationalen Mandatswahrheit (profiles +
    // mandate_profiles, gelesen ueber die gemeinsame Laufzeitfunktion) — nie aus dem Blob.
    mandatsquelle: "relational",
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

async function erhebeBaseline({ mainStore, authStore, fairnessStore, dauerhafte, relationalAktive = null }) {
  const profile = Object.values((mainStore && mainStore.profiles) || {});
  // K2: kanonisch ist die RELATIONALE Menge; die Blob-Zaehlung bleibt als Vergleichssicht.
  const blobAktive = profile.filter(istAktivesMandat).map((p) => String(p.id)).sort();
  const aktive = Array.isArray(relationalAktive) ? relationalAktive : blobAktive;
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
      quelle: Array.isArray(relationalAktive) ? "relational" : "blob (relational nicht lesbar!)",
      blobVergleich: vertrag.mandatsSignatur(blobAktive).signatur,
      inaktiv: inaktive, testmandateInProduction: testmandate.length
    },
    cronKadenz: vertrag.schwereKadenz(leseCrons()).map((k) => `${k.cronName}: ${k.schedule}`),
    laufdatensaetze: {
      retention: LAUF_RETENTION, gelesen: laeufe.length, nachModus,
      juengsterGlobalerLauf: juengsterGlobal ? juengsterGlobal.runId : null,
      // K3-Aufbewahrungsvertrag: was ein 24-h-Fenster bei dieser Mandatszahl braucht —
      // inklusive Watchdog-Slot und Puffer, nicht mehr die alte 3x(1+n)-Formel.
      benoetigtFuer24hFenster: vertrag.aufbewahrungsBedarf({
        regelSlots: 3, watchdogSlots: 1, mandatszahl: sig.anzahl
      }).mindest
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

  // ---- FRUEHE ARG-GATES des Schreibpfads: fail fast VOR jedem Production-Lesezugriff ------
  // Damit sind die Pflichtparameter OHNE Netz verhaltenstestbar, und ein fehlerhafter Aufruf
  // beruehrt Production gar nicht erst.
  if (args["startbaseline-schreiben"]) {
    const aktivierungFruehMs = parseIsoMs(args.aktivierung ?? process.env.HELMUT_OP25_AKTIVIERUNG_AT, "--aktivierung");
    // FAIL CLOSED: ohne gueltigen Aktivierungszeitpunkt wird gar nicht erst geschrieben.
    if (!Number.isFinite(aktivierungFruehMs)) {
      console.error("MESSFEHLER: --startbaseline-schreiben verlangt einen gueltigen"
        + " --aktivierung-Zeitpunkt (ISO; der READY-Zeitpunkt des neuen Production-Deployments)."
        + " Ohne ihn belegt die Baseline nichts — nichts geschrieben.");
      process.exit(2);
    }
    // PFLICHT (Nachtragskorrektur 2026-08-04/5): der VOLLSTAENDIGE erwartete Merge-Commit.
    if (vertrag.normalisiereVollenCommit(args["erwarteter-commit"]) === null) {
      console.error("MESSFEHLER: --startbaseline-schreiben verlangt --erwarteter-commit mit dem"
        + ` VOLLSTAENDIGEN erwarteten Merge-Commit (${vertrag.COMMIT_VOLL_LAENGE} Hexziffern)`
        + " — nichts geschrieben.");
      console.error("Kurzformen genuegen nicht: die spaetere Auswertung prueft die commit_ref"
        + " aller Fensterlaeufe EXAKT gegen diesen Wert.");
      process.exit(2);
    }
  }

  const mainStore = await leseStoreZeile(STORE_ID);
  const authStore = await leseStoreZeile(AUTH_STORE_ID);
  const fairnessStore = await leseStoreZeile(`${STORE_ID}-cron-fairness`);
  const dauerhafte = await leseDauerhafteLaufzeilen(authStore);

  const aktivierungAtMs = parseIsoMs(args.aktivierung ?? process.env.HELMUT_OP25_AKTIVIERUNG_AT, "--aktivierung");
  // K2: die KANONISCHE Mandatsmenge kommt relational — der Blob ist nur noch Vergleichssicht.
  const relational = await leseAktiveMandateRelational();
  const aktiveMandate = relational.aktive;
  const blobMandate = blobMandateAus(mainStore);
  if (aktiveMandate === null) {
    console.error("HINWEIS: relationale Mandatswahrheit nicht lesbar"
      + `${relational.fehler ? ` (${relational.fehler})` : ""} — es gibt KEINEN Rueckfall auf den`
      + " Blob (eine Mandatswahrheit, fail closed). Ohne sie blockiert jeder Nachweisschritt.");
  }
  // Laufzeitbeleg: was der juengste globale Lauf TATSAECHLICH geplant hat.
  const juengsterGlobalerLauf = ((mainStore && Array.isArray(mainStore.crawlRuns)) ? mainStore.crawlRuns : [])
    .find((r) => r && r.mode === "global") || null;
  const laufzeitPlanung = juengsterGlobalerLauf && juengsterGlobalerLauf.quellenVereinigung
    && Array.isArray(juengsterGlobalerLauf.quellenVereinigung.mandateIds)
    ? juengsterGlobalerLauf.quellenVereinigung.mandateIds
    : null;
  const mandatsWahrheit = {
    kanonisch: aktiveMandate,
    blob: blobMandate,
    laufzeitPlanung,
    laufzeitLaufId: juengsterGlobalerLauf ? juengsterGlobalerLauf.runId : null
  };

  if (args.baseline) {
    const baseline = await erhebeBaseline({ mainStore, authStore, fairnessStore, dauerhafte, relationalAktive: aktiveMandate });
    console.log("== BASELINE (rein lesend, PII-frei) ==");
    console.log(JSON.stringify(baseline, null, 2));
    process.exit(0);
  }

  // ---- Schritt 1: Startbaseline erheben (Production nur gelesen) ---------------------------
  if (args["startbaseline-schreiben"]) {
    if (!Array.isArray(aktiveMandate) || !aktiveMandate.length) {
      console.error("MESSFEHLER: kanonische (relationale) Mandatsmenge nicht lesbar — keine"
        + " Startbaseline geschrieben. KEIN Rueckfall auf den Blob (eine Mandatswahrheit).");
      process.exit(2);
    }
    // K2-STARTPRUEFUNG: die Signaturen aller beobachtbaren Mandatssichten muessen
    // uebereinstimmen, BEVOR ein Nachweisfenster beginnt. Ein Widerspruch (z. B. Blob 5
    // vs. relational 6 — exakt der Zustand des gescheiterten Nachweises) blockiert den
    // Start; der Blob kann die Menge nie mehr still verkleinern.
    const wahrheit = vertrag.pruefeMandatsWahrheit(mandatsWahrheit);
    if (wahrheit.befunde.length) {
      console.error("MESSFEHLER: Mandatswahrheiten widersprechen sich — keine Startbaseline geschrieben:");
      for (const b of wahrheit.befunde) console.error(`  [${b.schwere}] ${b.grund} — ${b.detail}`);
      process.exit(2);
    }
    // K3-STARTPRUEFUNG: die Aufbewahrung muss das kommende 24-h-Fenster rechnerisch tragen
    // (Regel-Slots + Watchdog-Slots + Puffer, reale Mandatszahl) — sonst beginnt KEIN Fenster.
    const fensterVonMs = aktivierungAtMs;
    const fensterBisMs = aktivierungAtMs + vertrag.MIN_FENSTER_MS;
    const regelSlots = vertrag.erwarteteLaeufe({ vonMs: fensterVonMs, bisMs: fensterBisMs, crons: leseCrons() });
    const watchdogSlots = vertrag.erwarteteWatchdogLaeufe({
      vonMs: fensterVonMs, bisMs: fensterBisMs, watchdogCrons: leseWatchdogCrons()
    });
    if (!regelSlots || !regelSlots.length || watchdogSlots === null) {
      console.error("MESSFEHLER: Regel- oder Watchdog-Kadenz nicht ermittelbar — der"
        + " Aufbewahrungsbedarf des Fensters ist nicht belegbar, keine Startbaseline geschrieben.");
      process.exit(2);
    }
    const bedarf = vertrag.aufbewahrungsBedarf({
      regelSlots: regelSlots.length,
      watchdogSlots: watchdogSlots.length,
      mandatszahl: aktiveMandate.length
    });
    // Eine NICHT BELEGTE Aufbewahrung (LAUF_RETENTION === null) blockiert
    // ausdruecklich, statt sich auf die Zahlenkoerzung von `null < n` zu
    // verlassen: ein Nachweis, der nicht sagen kann, wie lange seine Belege
    // liegen bleiben, ist kein Nachweis (fail closed, SR §38.2).
    if (LAUF_RETENTION === null) {
      console.error(`MESSFEHLER: ${AUFBEWAHRUNG.meldung}`);
      console.error("Keine Startbaseline geschrieben — ohne belegte Aufbewahrung ist nicht"
        + " berechenbar, ob die Belege des Fensters bis zur Auswertung liegen bleiben.");
      process.exit(2);
    }
    if (LAUF_RETENTION < bedarf.mindest) {
      console.error(`MESSFEHLER: ${vertrag.aufbewahrungsMeldung(bedarf, LAUF_RETENTION)}`);
      console.error("Keine Startbaseline geschrieben — ein Fenster, dessen Belege rechnerisch"
        + " verdraengt wuerden, darf nicht beginnen.");
      process.exit(2);
    }
    // Die Pflichtparameter (Aktivierung + voller erwarteter Commit) sind bereits an den
    // FRUEHEN Arg-Gates oben geprueft — vor jedem Production-Lesezugriff. Die Funktion
    // `schreibeStartbaseline` prueft beide zusaetzlich selbst (Doppelgate, fail closed).
    // AUSDRUECKLICH KEINE Pruefung gegen den juengsten alten Prozesslauf: unmittelbar nach
    // READY kann noch kein Lauf des NEUEN Deployments existieren; ein alter Lauf darf die
    // Baseline weder blockieren noch faelschlich bestaetigen. Der Beleg entsteht erst in
    // der Auswertung gegen die commit_ref aller Fensterlaeufe.
    const beobachtet = await leseZuletztBeobachtetenProzessCommit();
    let inhalt;
    try {
      inhalt = schreibeStartbaseline(String(args["startbaseline-schreiben"]), {
        aktivierungAtMs, aktiveMandate, prozessCommit: beobachtet.commit,
        erwarteterCommit: args["erwarteter-commit"]
      });
    } catch (fehler) {
      console.error(`MESSFEHLER: ${(fehler && fehler.message) || fehler} — nichts geschrieben.`);
      process.exit(2);
    }
    console.log("== STARTBASELINE GESCHRIEBEN (lokale Belegdatei; Production nur gelesen) ==");
    console.log(JSON.stringify(inhalt, null, 2));
    console.log("\nHINWEIS: `zuletztBeobachteterProzessCommit` ist der Commit des juengsten"
      + " GESPEICHERTEN Laufs (in der Regel des ALTEN Deployments) — rein informativ, keine"
      + " Bestaetigung. Der erwartete Commit wird erst in der Auswertung gegen die commit_ref"
      + " aller Fensterlaeufe geprueft.");
    console.log("\nWaehrend des 24-h-Fensters darf KEIN weiteres Production-Deployment erfolgen.");
    console.log("Fruehestens 24 h nach der Aktivierung mit `--startbaseline <datei>` auswerten.");
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
    fairnessLaeufe,
    // Optional: an der Auswertung erneut uebergebener erwarteter Commit — der Kern prueft
    // ihn als Gegenprobe gegen den in der Baseline gespeicherten (Schutz vor falscher Datei).
    commitGegenprobe: args["erwarteter-commit"] ?? null,
    // FAIL CLOSED (Review-Nachprobe): ein Lesefehler der KANONISCHEN Belegquelle
    // process_runs geht in die Bewertung ein (blockiert), statt nur als Konsolentext zu
    // erscheinen — sonst koennte der Commitnachweis allein auf dem Blob-Spiegel bestehen.
    prozessLaeufeLesefehler: dauerhafte.relationalFehler,
    // K3: der Watchdog ist ein moeglicher zusaetzlicher schwerer Lauf und gehoert in den
    // Aufbewahrungsbedarf; K2: die Widerspruchsfreiheit der Mandatssichten wird mitbewertet.
    watchdogCrons: leseWatchdogCrons(),
    mandatsWahrheit
  });

  const endSig = Array.isArray(aktiveMandate) ? vertrag.mandatsSignatur(aktiveMandate) : null;
  const blobSig = Array.isArray(blobMandate) ? vertrag.mandatsSignatur(blobMandate) : null;
  console.log("== EINGABEN (rein lesend) ==");
  console.log(`aktive Mandate am Fensterende (KANONISCH relational): ${endSig ? `${endSig.signatur} (${endSig.mandate.join(", ")})` : "NICHT LESBAR — kein Blob-Rueckfall"}`);
  console.log(`Blob-Vergleichssicht: ${blobSig ? blobSig.signatur : "—"}`
    + ` · Laufzeitplanung (juengster global-Lauf): ${laufzeitPlanung ? vertrag.mandatsSignatur(laufzeitPlanung).signatur : "—"}`);
  console.log(`eingefrorene Startbaseline: ${startbaseline
    ? `${Array.isArray(startbaseline.mandate) ? vertrag.mandatsSignatur(startbaseline.mandate).signatur : "(ohne Mandatsliste)"}`
      + ` (erhoben ${startbaseline.erhobenAt || "?"}, Datei-Signatur ${startbaseline.signatur || "fehlt"})`
    : "FEHLT — ohne sie ist der Zustand am Fensterstart nicht belegt"}`);
  console.log(`Laufdatensaetze im Blob: ${laeufe ? `${laeufe.length} (Retention ${LAUF_RETENTION})` : "NICHT LESBAR"}`
    + ` · dauerhafte globalphase-Zeilen: ${dauerhafte.zeilen.length}`
    + `${dauerhafte.relationalFehler ? ` (relational nicht lesbar: ${dauerhafte.relationalFehler})` : ""}`);
  console.log(`Aktivierung (READY des neuen Deployments): ${zeit(aktivierungAtMs)} · Fenster: ${zeit(fensterStartMs)} → ${zeit(fensterEndeMs)}`);
  console.log(`erwarteter Deployment-Commit (aus der Baseline): ${startbaseline && typeof startbaseline.erwarteterDeploymentCommit === "string" && startbaseline.erwarteterDeploymentCommit.trim()
    ? startbaseline.erwarteterDeploymentCommit.trim()
    : "FEHLT — die Auswertung ist damit fail closed blockiert"}`);
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
    erwarteterCommit: bewertung.erwarteterCommit ?? null,
    benoetigteDatensaetze: bewertung.benoetigteDatensaetze ?? null,
    dauerhafteZeilen: dauerhafte.zeilen.length,
    relationalFehler: dauerhafte.relationalFehler,
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
