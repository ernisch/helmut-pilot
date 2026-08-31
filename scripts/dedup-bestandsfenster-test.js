"use strict";

// ============================================================================
// DEDUP-BESTANDSFENSTER SEITENWEISE (Kapazitätssprint 2026-08-31) — PR-D
// ============================================================================
// BELEGTER ANLASS: `persistRawDocumentsDeduped` las das 14-Tage-Bestandsfenster
// mit EINEM Request `limit=5000`; PostgREST kappt je Anfrage bei 1.000 Zeilen
// (im Repo dokumentiert, Befund-W-1-Klasse). Das "14-Tage-Fenster" war bei
// ~344 docs/Tag effektiv ~2,9 Tage — Cross-Source-Dubletten aelter als ~3 Tage
// wurden zu eigenen Dokumenten. Diese Suite beweist: das Fenster wird jetzt
// SEITENWEISE vollstaendig gelesen (auch > 1.000 und > 5.000 Zeilen), haengt an
// KEINER Einzelseite, meldet Deckel/Ausfall LAUT und veraendert die fachliche
// Dedup-Semantik (planDedupWrites) nicht. KEIN Netz: Fetch-Ersatz mit ECHTER
// 1.000er-Kappung je Anfrage (fail closed bei unbekannten Endpunkten) — Muster
// aus scripts/globalabruf-kapazitaet-test.js.
//
// Jeder Lauf gehoert ueber scripts/lokal.js gestartet (CLAUDE.md §6).

process.env.HELMUT_V3_STORE = "on";
process.env.SUPABASE_URL = "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY = "offline-test-kein-geheimnis";
delete process.env.HELMUT_DEDUP_BESTAND_MAX_SEITEN;

const storage = require("../lib/helmut/storage");
const { fingerprint } = require("../lib/helmut/quellenarchitektur/dedup-global");

let pass = 0, fail = 0;
function check(name, cond) {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  if (cond) pass += 1; else fail += 1;
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

// ── Fetch-Ersatz mit echter PostgREST-Kappung (max 1.000 Zeilen je Anfrage) ──
const ECHTES_FETCH = global.fetch;
const POSTGREST_KAPPE = 1000;
let bestand = [];            // simulierter raw_documents-Bestand (neueste zuerst erwartet)
let bestandsAbrufe = [];     // Log der Bestands-GETs (endpoint)
let bestandsFehler = null;   // wenn gesetzt: Bestands-GET schlaegt fehl

function antwort(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300, status, statusText: "OK",
    text: () => Promise.resolve(body == null ? "" : JSON.stringify(body))
  });
}

function installiereFetchErsatz() {
  global.fetch = (url, options = {}) => {
    const method = String((options && options.method) || "GET").toUpperCase();
    const endpoint = String(url).replace("http://127.0.0.1:9", "");
    if (method === "GET" && /^\/rest\/v1\/raw_documents\?select=id,content_fingerprint/.test(endpoint)) {
      bestandsAbrufe.push(endpoint);
      if (bestandsFehler) return Promise.reject(new Error(bestandsFehler));
      const limit = Number((/[?&]limit=(\d+)/.exec(endpoint) || [])[1] || POSTGREST_KAPPE);
      const offset = Number((/[?&]offset=(\d+)/.exec(endpoint) || [])[1] || 0);
      // ECHTE Serverkappe: nie mehr als 1.000, egal was limit sagt.
      const seite = bestand.slice(offset, offset + Math.min(limit, POSTGREST_KAPPE));
      return antwort(seite);
    }
    if (method === "POST" && /^\/rest\/v1\/raw_documents\?on_conflict=id/.test(endpoint)) {
      const rows = JSON.parse(String(options.body || "[]"));
      return antwort(Array.isArray(rows) ? rows : [rows]);
    }
    if (method === "GET" && /^\/rest\/v1\/raw_documents\?id=(eq|in)\./.test(endpoint)) {
      return antwort([]); // finding_count-Lesen: hier ohne Bestandszaehler
    }
    if (method === "PATCH" && /^\/rest\/v1\/raw_documents\?id=(eq|in)\./.test(endpoint)) {
      return antwort([]);
    }
    if (method === "POST" && /^\/rest\/v1\/document_findings/.test(endpoint)) {
      return antwort(null, 204);
    }
    return Promise.reject(new Error(`Fetch-Ersatz: unbekannter Endpunkt ${method} ${endpoint}`));
  };
}

function baueBestand(n) {
  // Neueste zuerst (der Code fragt order=created_at.desc): Index 0 = juengste Zeile.
  return Array.from({ length: n }, (_, i) => ({
    id: `bestand-${i}`,
    content_fingerprint: `fp-${i}`,
    canonical_target_url: `https://beispiel.test/artikel-${i}`
  }));
}

// Batch-Item, dessen ABGELEITETER Fingerabdruck (mergeIntoDocuments -> fingerprint())
// exakt an Position `pos` des Bestands liegt — der Bestand traegt den ECHTEN Wert,
// den der Dedup-Plan berechnet, nicht eine Test-Erfindung.
function neuesItem(nr) {
  return {
    id: `neu-${nr}`, content_hash: `hash-neu-${nr}`,
    // Deutlich VERSCHIEDENE Titel je Nummer — sonst fuehrt mergeIntoDocuments
    // aehnliche Batch-Items (titleSimilarity) zusammen und der Test misst Batch-
    // Merging statt Bestands-Dedup.
    title: `${["Rentenpaket im Bundestag beschlossen","Bildungsreform der Laender vorgestellt","Verkehrswende Plan des Ministeriums","Energiepreise sinken im Herbst deutlich","Steuerreform Entwurf liegt vor","Gesundheitskarte wird digital erneuert","Wohnungsbau Programm gestartet"][nr % 7]} (${nr})`, url: `https://neu.test/${nr}`,
    source_id: `quelle-${nr}`, published_at: new Date().toISOString()
  };
}
function verankere(item, pos) {
  bestand[pos] = { ...bestand[pos], content_fingerprint: fingerprint(item) };
  return item;
}

(async () => {
  installiereFetchErsatz();

  abschnitt("§1 Fenster > 1.000 Zeilen wird vollstaendig gelesen (alter Fehlerfall)");
  {
    bestand = baueBestand(2500); bestandsAbrufe = []; bestandsFehler = null;
    // Treffer BEI Zeile 2.400 — jenseits der alten Einzelseiten-Reichweite (1.000).
    const r = await storage.persistRawDocumentsDeduped([verankere(neuesItem(1), 2400)]);
    check("§1.1 drei Seiten gelesen (2.500 Zeilen)", bestandsAbrufe.length === 3);
    check("§1.2 Fenstergroesse ehrlich gemessen (zeilen=2500, seiten=3, nicht gedeckelt)",
      r.bestandsfenster && r.bestandsfenster.zeilen === 2500 && r.bestandsfenster.seiten === 3
      && r.bestandsfenster.gedeckelt === false && r.bestandsfenster.fehler === null);
    check("§1.3 Dublette jenseits Zeile 1.000 wird ERKANNT (kein neues Dokument)",
      r.persisted === 0 && r.zusammengefuehrt === 1 && r.bestandsTreffer === 1);
    check("§1.4 Paginierung ist deterministisch geordnet (order=created_at.desc + offset)",
      bestandsAbrufe.every((e) => /order=created_at\.desc/.test(e)) && /offset=2000/.test(bestandsAbrufe[2]));
    check("§1.5 Round-Trip-Beleg zaehlt die echten Seiten", r.schreibAnfragen >= 3);
  }

  abschnitt("§2 Fenster > 5.000 Zeilen (alte limit=5000-Grenze irrelevant)");
  {
    bestand = baueBestand(5500); bestandsAbrufe = []; bestandsFehler = null;
    const r = await storage.persistRawDocumentsDeduped([verankere(neuesItem(2), 5200)]);
    check("§2.1 sechs Seiten gelesen (5.500 Zeilen)", bestandsAbrufe.length === 6 && r.bestandsfenster.zeilen === 5500);
    check("§2.2 Dublette bei Zeile 5.200 wird erkannt", r.zusammengefuehrt === 1 && r.persisted === 0);
  }

  abschnitt("§3 Seiten-Deckel: LAUT, ehrlich, neueste zuerst erhalten");
  {
    process.env.HELMUT_DEDUP_BESTAND_MAX_SEITEN = "2";
    bestand = baueBestand(3000); bestandsAbrufe = []; bestandsFehler = null;
    const fehlerZeilen = [];
    const echterError = console.error;
    console.error = (...a) => { fehlerZeilen.push(a.join(" ")); };
    const r = await storage.persistRawDocumentsDeduped([verankere(neuesItem(3), 1500), verankere(neuesItem(4), 2500)]);
    console.error = echterError;
    delete process.env.HELMUT_DEDUP_BESTAND_MAX_SEITEN;
    check("§3.1 genau 2 Seiten gelesen, als gedeckelt gemeldet",
      bestandsAbrufe.length === 2 && r.bestandsfenster.gedeckelt === true && r.bestandsfenster.zeilen === 2000);
    check("§3.2 Deckel wird LAUT gemeldet (kein stilles Kappen)",
      fehlerZeilen.some((z) => /Bestandsfenster am Seiten-Deckel/.test(z)));
    check("§3.3 Treffer INNERHALB des Deckels erkannt, jenseits ehrlich verpasst",
      r.zusammengefuehrt === 1 && r.persisted === 1);
  }

  abschnitt("§4 Kurze Seite: genau EIN Request (kein Mehraufwand im Normalfall)");
  {
    bestand = baueBestand(700); bestandsAbrufe = []; bestandsFehler = null;
    const r = await storage.persistRawDocumentsDeduped([verankere(neuesItem(5), 650)]);
    check("§4.1 ein einziger Bestands-GET bei < 1.000 Zeilen", bestandsAbrufe.length === 1);
    check("§4.2 Fenster: zeilen=700, seiten=1", r.bestandsfenster.zeilen === 700 && r.bestandsfenster.seiten === 1);
    check("§4.3 Semantik unveraendert: Treffer -> zusammengefuehrt", r.zusammengefuehrt === 1);
  }

  abschnitt("§5 Bestandsabruf-Ausfall: fail-safe wie bisher, aber SICHTBAR");
  {
    bestand = baueBestand(100); bestandsAbrufe = []; bestandsFehler = "verbindung-kaputt";
    const echterError = console.error;
    console.error = () => {};
    const r = await storage.persistRawDocumentsDeduped([neuesItem(6)]);
    console.error = echterError;
    bestandsFehler = null;
    check("§5.1 Batch wird ohne Bestands-Match persistiert (kein Crash, kein Verlust)",
      r.persisted === 1 && r.zusammengefuehrt === 0);
    check("§5.2 der Ausfall steht im Ergebnis (fenster.fehler gesetzt, zeilen=0)",
      typeof r.bestandsfenster.fehler === "string" && r.bestandsfenster.fehler.includes("verbindung-kaputt")
      && r.bestandsfenster.zeilen === 0);
  }

  abschnitt("§6 Struktur: keine Einzelseiten-Abhaengigkeit, keine Migration");
  {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "storage.js"), "utf8");
    check("§6.1 der alte Einzel-Read mit limit=5000 existiert nicht mehr",
      !/content_fingerprint,canonical_target_url[^\n]*limit=5000/.test(src));
    check("§6.2 Seitengroesse ist die PostgREST-Kappe (1000), nicht erhoehbar",
      /DEDUP_BESTAND_SEITE = 1000/.test(src));
    check("§6.3 Deckel ist konfigurierbar mit sicherem Default (12 Seiten = 12.000 Zeilen), fail-closed pro Aufruf gelesen",
      /function dedupBestandMaxSeiten\(\)[\s\S]{0,220}: 12;/.test(src)
      && /HELMUT_DEDUP_BESTAND_MAX_SEITEN/.test(src));
  }

  global.fetch = ECHTES_FETCH;
  console.log(`\nERGEBNIS: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { global.fetch = ECHTES_FETCH; console.error("Testlauf abgebrochen:", e && e.stack || e); process.exit(1); });
