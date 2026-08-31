"use strict";

// ============================================================================
// DRAIN-BILANZ (PR-C 2026-08-31; Blocker 3+4-Korrektur, 500-Mandate-Reife
// 2026-09-01) — Pflichtprüfungen
// ============================================================================
// Beweist die EHRLICHE Drain-Bilanz:
//  - BLOCKER 3: gate-würdige Ankunft wird ausschließlich mit dem ECHTEN
//    gate-würdigen Abfluss verglichen (Vorgangsabschlüsse gegen die
//    persistierten Gate-Entscheidungen ihrer Dokumente, nie mehr die
//    Bruttomenge aller complete-Berührungen). Der verarbeitbare Rückstand
//    wird mit Anfangswert, Endwert und Trend gemessen; KEIN grüner Status,
//    wenn der Rückstand wächst oder die Daten unvollständig sind. Getestet:
//    wachsender, gleichbleibender und sinkender Rückstand.
//  - BLOCKER 4: die Ereignisabfrage wird nicht bei 1.000 Zeilen abgeschnitten —
//    begrenzte, deterministische Pagination (Totalordnung created_at+id);
//    reißt der Deckel, ist die Größe NICHT messbar (null), nie eine zu kleine
//    Zahl. Getestet mit deutlich mehr als 1.000 Ereignissen über mehrere Seiten.
// Fetch-Ersatz gegen den echten storage-Code (kein Netz) + reine Logiktests.
// Jeder Lauf gehört über scripts/lokal.js gestartet (CLAUDE.md §6).

process.env.HELMUT_V3_STORE = "on";
// gate_shadow_events und helmut_store laufen über useSupabase() — der Backend-
// Schalter muss hier gesetzt sein (lokal.js erzwingt sonst `local`). Kein Netz:
// SUPABASE_URL zeigt auf einen ungenutzten Port, alle Aufrufe fängt der
// Fetch-Ersatz; der lokale Netzschutz bleibt aktiv.
process.env.HELMUT_STORAGE_BACKEND = "supabase";
process.env.SUPABASE_URL = "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY = "offline-test-kein-geheimnis";
delete process.env.HELMUT_GATE_EREIGNIS_MAX_SEITEN;
delete process.env.HELMUT_ABFLUSS_MAX_SEITEN;

const fs = require("fs");
const path = require("path");
const storage = require("../lib/helmut/storage");
const motorHealth = require("../lib/helmut/motor-health");

let pass = 0, fail = 0;
function check(name, cond) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`); if (cond) pass += 1; else fail += 1; }
function abschnitt(t) { console.log(`\n== ${t} ==`); }

// ── Fetch-Ersatz mit echter PostgREST-Kappung und In-Memory-Trendzeile ──────
const ECHTES_FETCH = global.fetch;
const KAPPE = 1000;
let gateEvents = [];          // {id, created_at, raw_document_id, gate_decision}
let completions = [];         // {id, updated_at}
let links = [];               // {knowledge_object_id, raw_document_id}
let trendRow = null;          // {id, data} | null
let patchKonfliktEinmal = false;
let abrufe = [];              // Log aller GETs

function antwort(body, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300, status, statusText: "OK",
    text: () => Promise.resolve(body == null ? "" : JSON.stringify(body))
  });
}
function seite(rows, endpoint) {
  const limit = Number((/[?&]limit=(\d+)/.exec(endpoint) || [])[1] || KAPPE);
  const offset = Number((/[?&]offset=(\d+)/.exec(endpoint) || [])[1] || 0);
  return rows.slice(offset, offset + Math.min(limit, KAPPE));
}
function ausInListe(endpoint, feld) {
  const m = new RegExp(`${feld}=in\\.\\(([^)]*)\\)`).exec(decodeURIComponent(endpoint));
  if (!m) return null;
  return m[1].split(",").map((s) => s.replace(/^"|"$/g, ""));
}

function installiereFetchErsatz() {
  global.fetch = (url, options = {}) => {
    const method = String((options && options.method) || "GET").toUpperCase();
    const endpoint = String(url).replace("http://127.0.0.1:9", "");
    if (method === "GET") abrufe.push(endpoint);
    if (method === "GET" && /^\/rest\/v1\/gate_shadow_events\?select=raw_document_id&gate_decision=in\./.test(endpoint)) {
      // Ankunfts-Lese: sortiert nach created_at+id (Totalordnung wie der Server)
      const sortiert = [...gateEvents].sort((a, b) =>
        String(a.created_at).localeCompare(String(b.created_at)) || (a.id - b.id));
      return antwort(seite(sortiert, endpoint));
    }
    if (method === "GET" && /^\/rest\/v1\/gate_shadow_events\?select=raw_document_id,gate_decision&raw_document_id=in\./.test(endpoint)) {
      const docIds = new Set(ausInListe(endpoint, "raw_document_id") || []);
      return antwort(seite(gateEvents.filter((e) => docIds.has(e.raw_document_id)), endpoint));
    }
    if (method === "GET" && /^\/rest\/v1\/knowledge_objects\?select=id&understanding_status=eq\.complete/.test(endpoint)) {
      return antwort(seite(completions, endpoint));
    }
    if (method === "GET" && /^\/rest\/v1\/ko_document_links\?select=knowledge_object_id,raw_document_id/.test(endpoint)) {
      const koIds = new Set(ausInListe(endpoint, "knowledge_object_id") || []);
      return antwort(seite(links.filter((l) => koIds.has(l.knowledge_object_id)), endpoint));
    }
    if (method === "GET" && /^\/rest\/v1\/helmut_store\?id=eq\./.test(endpoint)) {
      return antwort(trendRow ? [{ data: trendRow.data }] : []);
    }
    if (method === "POST" && /^\/rest\/v1\/helmut_store$/.test(endpoint)) {
      if (trendRow) return Promise.reject(new Error("HTTP 409: duplicate key"));
      trendRow = JSON.parse(String(options.body || "{}"));
      return antwort(null, 201);
    }
    if (method === "PATCH" && /^\/rest\/v1\/helmut_store\?id=eq\./.test(endpoint)) {
      if (patchKonfliktEinmal) { patchKonfliktEinmal = false; return antwort([]); }
      const rev = Number((/rev=eq\.(\d+)/.exec(endpoint) || [])[1]);
      const aktuellRev = trendRow && trendRow.data ? Number(trendRow.data.rev) : NaN;
      const feldFehlt = /rev=is\.null/.test(endpoint);
      const trifft = trendRow && (feldFehlt ? !Number.isFinite(aktuellRev) : aktuellRev === rev);
      if (!trifft) return antwort([]);
      trendRow = { ...trendRow, data: JSON.parse(String(options.body || "{}")).data };
      return antwort([{ id: trendRow.id || "x" }]);
    }
    return Promise.reject(new Error(`Fetch-Ersatz: unbekannter Endpunkt ${method} ${endpoint}`));
  };
}

function baueGateEvents(n, { distinctDocs = n, decision = "verstehen", abMs = Date.now() - 3600e3 } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    created_at: new Date(abMs + i * 10).toISOString(),
    raw_document_id: `rd-${i % distinctDocs}`,
    gate_decision: decision
  }));
}

(async () => {
  installiereFetchErsatz();

  // ═════════ §1 · Blocker 3: das Urteil der Bilanzzeile (reine Logik) ═════════
  abschnitt("§1 drainBilanzZeile: kein Grün bei wachsendem Rückstand oder Messlücke");
  {
    const gruen = motorHealth.drainBilanzZeile({
      ankunftWuerdig: 91, abfluss: 120, rueckstandAnfang: 9000, rueckstandEnde: 8900,
      gateGeparkt: 12, fehlversuchsQuote: 0.02
    });
    check("§1.1 SINKENDER Rückstand + Abfluss ≥ Ankunft + alles messbar -> ✓",
      /Abfluss würdig 120/.test(gruen) && / ✓/.test(gruen) && /9000→8900 \(-100, sinkend\)/.test(gruen));
    const stabil = motorHealth.drainBilanzZeile({ ankunftWuerdig: 91, abfluss: 91, rueckstandAnfang: 9000, rueckstandEnde: 9000 });
    check("§1.2 GLEICHBLEIBENDER Rückstand + Abfluss = Ankunft -> ✓ (stabil)",
      / ✓/.test(stabil) && /\(0, stabil\)/.test(stabil));
    const waechst = motorHealth.drainBilanzZeile({ ankunftWuerdig: 91, abfluss: 120, rueckstandAnfang: 9000, rueckstandEnde: 9150 });
    check("§1.3 WACHSENDER Rückstand -> ⚠️ trotz Abfluss ≥ Ankunft (kein falsches Grün)",
      /⚠️ Rückstand wächst/.test(waechst) && !/ ✓/.test(waechst) && /\(\+150, wachsend\)/.test(waechst));
    const defizit = motorHealth.drainBilanzZeile({ ankunftWuerdig: 91, abfluss: 60, rueckstandAnfang: 9000, rueckstandEnde: 8990 });
    check("§1.4 Abfluss < Ankunft -> ⚠️ benannt, kein Grün", /⚠️ Abfluss < Ankunft/.test(defizit) && !/ ✓/.test(defizit));
    const ohneAnfang = motorHealth.drainBilanzZeile({ ankunftWuerdig: 91, abfluss: 120, rueckstandAnfang: null, rueckstandEnde: 8900 });
    check("§1.5 fehlender Anfangswert -> 'Daten unvollständig', KEIN Urteil, kein Grün",
      /Daten unvollständig/.test(ohneAnfang) && !/ ✓/.test(ohneAnfang) && !/⚠️/.test(ohneAnfang));
    const ohneAbfluss = motorHealth.drainBilanzZeile({ ankunftWuerdig: 91, abfluss: null, rueckstandAnfang: 9000, rueckstandEnde: 8900 });
    check("§1.6 fehlender Abfluss -> 'Daten unvollständig', kein Grün", /Daten unvollständig/.test(ohneAbfluss) && !/ ✓/.test(ohneAbfluss));
    const leer = motorHealth.drainBilanzZeile({});
    check("§1.7 nichts messbar -> überall '?', kein Urteil",
      /Ankunft würdig \?/.test(leer) && /Abfluss würdig \?/.test(leer) && /Daten unvollständig/.test(leer));
    const nullen = motorHealth.drainBilanzZeile({ ankunftWuerdig: 0, abfluss: 0, rueckstandAnfang: 0, rueckstandEnde: 0, gateGeparkt: 0, fehlversuchsQuote: 0 });
    check("§1.8 echte Nullen sind KEINE Messlücke (✓ bei 0≥0 und stabilem 0-Rückstand)",
      / ✓/.test(nullen) && /Fehlversuchsquote Rückstand 0%/.test(nullen));
    const unbew = motorHealth.drainBilanzZeile({ ankunftWuerdig: 10, abfluss: 8, abflussUnbewertet: 5, rueckstandAnfang: 100, rueckstandEnde: 90 });
    check("§1.9 unbewerteter Abfluss wird GETRENNT gezeigt, nie als gatewürdig behauptet",
      /Abfluss würdig 8 \(\+5 unbewertet\)/.test(unbew));
  }

  // ═════════ §2 · Trendlogik (rein) ═════════
  abschnitt("§2 bewerteRueckstandsTrend + waehleTrendAnker");
  {
    check("§2.1 wachsend/stabil/sinkend werden korrekt geurteilt",
      motorHealth.bewerteRueckstandsTrend({ anfang: 100, ende: 150 }).urteil === "wachsend"
      && motorHealth.bewerteRueckstandsTrend({ anfang: 100, ende: 100 }).urteil === "stabil"
      && motorHealth.bewerteRueckstandsTrend({ anfang: 100, ende: 60 }).urteil === "sinkend");
    check("§2.2 fehlende Seite -> unvollstaendig, trend=null, messbar=false",
      motorHealth.bewerteRueckstandsTrend({ anfang: null, ende: 5 }).urteil === "unvollstaendig"
      && motorHealth.bewerteRueckstandsTrend({}).messbar === false);
    const NOW = Date.parse("2026-09-01T06:00:00Z");
    const eintraege = [
      { tag: "2026-08-30", wert: 9000, um: "2026-08-30T06:00:00Z" },  // 48 h alt: zu alt
      { tag: "2026-08-31", wert: 9100, um: "2026-08-31T06:01:00Z" },  // ~24 h alt: Anker
      { tag: "2026-09-01", wert: 9200, um: "2026-09-01T05:59:00Z" }   // 1 min alt: zu jung
    ];
    const anker = motorHealth.waehleTrendAnker(eintraege, { nowMs: NOW });
    check("§2.3 Anker ist der jüngste Eintrag im 20-40h-Fenster (Vortagsanker)",
      anker && anker.tag === "2026-08-31" && anker.wert === 9100);
    check("§2.4 ohne passenden Eintrag (erster Tag) -> null, kein erfundener Anfangswert",
      motorHealth.waehleTrendAnker([{ tag: "2026-09-01", wert: 1, um: "2026-09-01T05:59:00Z" }], { nowMs: NOW }) === null
      && motorHealth.waehleTrendAnker([], { nowMs: NOW }) === null);
  }

  // ═════════ §3 · Fehlversuchsquote (unverändert aus PR-C) ═════════
  abschnitt("§3 rueckstandFehlversuchsQuote: aus Quittungen, ohne neuen Fetch");
  {
    const NOW = 1000 * 3600 * 24 * 100;
    const q = (proz, startedMsVor, gespeichert, fehlgeschlagen) => ({
      process: proz, startedAt: new Date(NOW - startedMsVor).toISOString(), gespeichert, fehlgeschlagen
    });
    check("§3.1 normale Läufe: 2 Fehlversuche auf 38 Ergebnisse = ~5%",
      Math.abs(motorHealth.rueckstandFehlversuchsQuote([
        q("understanding-rueckstand", 3600e3, 18, 1),
        q("understanding-rueckstand", 7200e3, 18, 1),
        q("understanding", 3600e3, 50, 50)
      ], { nowMs: NOW }) - 2 / 38) < 1e-9);
    check("§3.2 keine Läufe im Fenster -> null (keine erfundene Quote 0)",
      motorHealth.rueckstandFehlversuchsQuote([q("understanding-rueckstand", 30 * 3600e3, 18, 0)], { nowMs: NOW }) === null);
    check("§3.3 Lauf ohne lesbare Zähler zählt nicht als 0",
      motorHealth.rueckstandFehlversuchsQuote([
        { process: "understanding-rueckstand", startedAt: new Date(NOW - 3600e3).toISOString(), gespeichert: null, fehlgeschlagen: null }
      ], { nowMs: NOW }) === null);
    check("§3.4 Azure-Störungstag sichtbar: 0 gespeichert, 18 Fehlversuche = 100%",
      motorHealth.rueckstandFehlversuchsQuote([q("understanding-rueckstand", 3600e3, 0, 18)], { nowMs: NOW }) === 1);
    check("§3.5 leere/kaputte Eingabe -> null", motorHealth.rueckstandFehlversuchsQuote(null) === null
      && motorHealth.rueckstandFehlversuchsQuote([]) === null);
  }

  // ═════════ §4 · Blocker 4: Ereignis-Pagination über 1.000 Zeilen ═════════
  abschnitt("§4 zaehleGateWuerdigeAnkunft: >1.000 Ereignisse, deterministisch, Deckel ehrlich");
  {
    gateEvents = baueGateEvents(2400, { distinctDocs: 1500 }); abrufe = [];
    const n = await storage.zaehleGateWuerdigeAnkunft(24);
    check("§4.1 2.400 Ereignisse über 3 Seiten -> 1.500 distinct würdige Dokumente (nicht 1.000)",
      n === 1500);
    const ankunftAbrufe = abrufe.filter((e) => /gate_shadow_events\?select=raw_document_id&gate_decision/.test(e));
    check("§4.2 drei Seitenanfragen, jede mit Totalordnung created_at.asc,id.asc",
      ankunftAbrufe.length === 3 && ankunftAbrufe.every((e) => /order=created_at\.asc,id\.asc/.test(e)));
    process.env.HELMUT_GATE_EREIGNIS_MAX_SEITEN = "2";
    gateEvents = baueGateEvents(2400, { distinctDocs: 2400 }); abrufe = [];
    const fehlerZeilen = [];
    const echterError = console.error;
    console.error = (...a) => { fehlerZeilen.push(a.join(" ")); };
    const gedeckelt = await storage.zaehleGateWuerdigeAnkunft(24);
    console.error = echterError;
    delete process.env.HELMUT_GATE_EREIGNIS_MAX_SEITEN;
    check("§4.3 Seiten-Deckel gerissen -> NULL (nicht messbar), nie eine zu kleine Zahl",
      gedeckelt === null);
    check("§4.4 der Deckel wird LAUT gemeldet", fehlerZeilen.some((z) => /Seiten-Deckel/.test(z)));
  }

  // ═════════ §5 · Blocker 3: echter gate-würdiger Abfluss ═════════
  abschnitt("§5 zaehleGateWuerdigerAbfluss: Abschlüsse gegen persistierte Entscheidungen");
  {
    gateEvents = [
      { id: 1, created_at: "2026-08-01T00:00:00Z", raw_document_id: "d-wuerdig", gate_decision: "verstehen" },
      { id: 2, created_at: "2026-08-01T00:00:01Z", raw_document_id: "d-zurueck", gate_decision: "zurueckstellen" },
      { id: 3, created_at: "2026-08-01T00:00:02Z", raw_document_id: "d-parken", gate_decision: "parken" }
    ];
    completions = [
      { id: "ko-wuerdig" }, { id: "ko-zurueck" }, { id: "ko-nur-parken" }, { id: "ko-altbestand" }, { id: "ko-ohne-links" }
    ];
    links = [
      { knowledge_object_id: "ko-wuerdig", raw_document_id: "d-wuerdig" },
      { knowledge_object_id: "ko-wuerdig", raw_document_id: "d-parken" },
      { knowledge_object_id: "ko-zurueck", raw_document_id: "d-zurueck" },
      { knowledge_object_id: "ko-nur-parken", raw_document_id: "d-parken" },
      { knowledge_object_id: "ko-altbestand", raw_document_id: "d-unbewertet" }
    ];
    abrufe = [];
    const r = await storage.zaehleGateWuerdigerAbfluss(24);
    check("§5.1 Klassifikation: 2 gatewürdig (verstehen+zurueckstellen zählen), 1 nur-parken, 2 unbewertet",
      r && r.gatewuerdig === 2 && r.nichtGatewuerdig === 1 && r.unbewertet === 2 && r.gesamt === 5);
    check("§5.2 die Entscheidungs-Suche ist ZEITUNABHÄNGIG (alte Entscheidung deckt heutigen Abschluss)",
      r.gatewuerdig === 2 /* Entscheidungen von 2026-08-01 zählten für Abschlüsse im 24h-Fenster */);
    check("§5.3 die Abschluss-Lese trägt eine Totalordnung (updated_at.asc,id.asc)",
      abrufe.some((e) => /knowledge_objects\?select=id&understanding_status=eq\.complete[^ ]*order=updated_at\.asc,id\.asc/.test(e)));
    completions = []; links = [];
    const leer = await storage.zaehleGateWuerdigerAbfluss(24);
    check("§5.4 keine Abschlüsse -> ehrliche Nullen (kein null: 0 ist gemessen)",
      leer && leer.gesamt === 0 && leer.gatewuerdig === 0);
  }

  // ═════════ §6 · Trend-Schnappschuss: CAS, erster Wert des Tages gewinnt ═════════
  abschnitt("§6 schreibeDrainTrendSchnappschuss + leseDrainTrendZeile (F-CAS-Muster)");
  {
    trendRow = null; patchKonfliktEinmal = false;
    const w1 = await storage.schreibeDrainTrendSchnappschuss({ tag: "2026-09-01", wert: 9200, um: "2026-09-01T06:00:00Z" });
    check("§6.1 erster Schnappschuss legt die Zeile an (POST, rev=1)",
      w1.ok === true && w1.geschrieben === true && trendRow && trendRow.data.rev === 1
      && trendRow.data.eintraege.length === 1 && trendRow.data.eintraege[0].wert === 9200);
    const w2 = await storage.schreibeDrainTrendSchnappschuss({ tag: "2026-09-01", wert: 8888, um: "2026-09-01T12:00:00Z" });
    check("§6.2 zweiter Wert desselben Tages wird NICHT geschrieben (erster Tagesanker gewinnt)",
      w2.ok === true && w2.uebersprungen === true && trendRow.data.eintraege[0].wert === 9200);
    const w3 = await storage.schreibeDrainTrendSchnappschuss({ tag: "2026-09-02", wert: 9100, um: "2026-09-02T06:00:00Z" });
    check("§6.3 neuer Tag wird BEDINGT angehängt (CAS über data.rev)",
      w3.ok === true && trendRow.data.rev === 2 && trendRow.data.eintraege.length === 2);
    patchKonfliktEinmal = true;
    const w4 = await storage.schreibeDrainTrendSchnappschuss({ tag: "2026-09-03", wert: 9000, um: "2026-09-03T06:00:00Z" });
    check("§6.4 CAS-Konflikt führt zu Neu-Lesen und erfolgreichem zweiten Versuch",
      w4.ok === true && trendRow.data.eintraege.length === 3);
    const gelesen = await storage.leseDrainTrendZeile();
    check("§6.5 Lesen normalisiert (sortiert, nur gültige Einträge) und trägt rev",
      gelesen.ok === true && gelesen.rev === 3 && gelesen.stand.eintraege.map((e) => e.tag).join(",") === "2026-09-01,2026-09-02,2026-09-03");
    const kaputt = await storage.schreibeDrainTrendSchnappschuss({ tag: "", wert: NaN });
    check("§6.6 ungültiger Schnappschuss wird abgelehnt, nie still geschrieben", kaputt.ok === false);
  }

  // ═════════ §7 · Struktur: Verdrahtung in Bericht, Route und Quittung ═════════
  abschnitt("§7 Struktur: Verdrahtung in Bericht, Route und Quittungs-Whitelist");
  {
    const serverSrc = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
    const storageSrc = fs.readFileSync(path.join(__dirname, "..", "lib", "helmut", "storage.js"), "utf8");
    check("§7.1 der Bericht trägt die Drain-Zeile (nach der Queue-Zeile)",
      /drainBilanzZeile\(/.test(serverSrc) && /queueZeile,\s*\n\s*drainZeile,/.test(serverSrc));
    check("§7.2 die Signale kommen aus leseDrainSignale mit dem ECHTEN gate-würdigen Abfluss",
      /leseDrainSignale\(\)/.test(serverSrc) && /zaehleGateWuerdigerAbfluss\(24\)/.test(serverSrc)
      && /zaehleGateWuerdigeAnkunft\(24\)/.test(serverSrc) && /zaehlePendingVerarbeitbar\(\)/.test(serverSrc));
    check("§7.3 die Bruttomenge (zaehleVerstandene) speist die Bilanz NICHT mehr",
      !/zaehleVerstandene\(24\)/.test(serverSrc));
    check("§7.4 der Tagesanker wird CAS-gesichert persistiert und der Fehler laut gemeldet",
      /schreibeDrainTrendSchnappschuss\(/.test(serverSrc) && /Tages-Schnappschuss nicht persistiert/.test(serverSrc));
    check("§7.5 die Rückstandsroute quittiert fehlversuche (bilanz.fehlgeschlagen)",
      /fehlversuche: bilanz\.fehlgeschlagen/.test(serverSrc));
    check("§7.6 die Quittungs-Whitelist persistiert fehlversuche im rueckstand-Block",
      /fehlversuche: num\(t\.rueckstand\.fehlversuche\)/.test(storageSrc));
    check("§7.7 die Ereignislese ist begrenzt UND deterministisch (Totalordnung, Deckel meldet laut)",
      /ladeGateEreignisseSeitenweise[\s\S]{0,900}order=created_at\.asc,id\.asc/.test(storageSrc)
      && /HELMUT_GATE_EREIGNIS_MAX_SEITEN/.test(storageSrc));
    check("§7.8 der verarbeitbare Rückstand schließt failed/failed-final/gate-geparkt NULL-sicher aus",
      /zaehlePendingVerarbeitbar[\s\S]{0,900}understanding_status\.not\.in\.\(failed,failed-final,gate-geparkt\)/.test(storageSrc));
    check("§7.9 die Ankunftszählung dedupliziert je Rohdokument (distinct raw_document_id)",
      /zaehleGateWuerdigeAnkunft[\s\S]{0,1200}new Set\(geladen\.zeilen\.map\(\(r\) => r && r\.raw_document_id\)/.test(storageSrc));
  }

  global.fetch = ECHTES_FETCH;
  console.log(`\nERGEBNIS: ${pass} PASS / ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { global.fetch = ECHTES_FETCH; console.error("Testlauf abgebrochen:", (e && e.stack) || e); process.exit(1); });
