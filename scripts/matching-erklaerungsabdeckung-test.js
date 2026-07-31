"use strict";

// Sprint 23C-2A — Erklaerungsabdeckung im Matching-Schreibpfad (Befund M-7).
//
// WAS HIER BEWIESEN WIRD
// Der Schreibpfad loest die fachlichen Merkmale eines Treffers jetzt gegen das
// TATSAECHLICH zugehoerige Wissensobjekt auf statt gegen ein nach Aenderungszeit
// geschnittenes Fenster ueber den Gesamtbestand. Und zwar so, dass sich am
// fachlichen Ergebnis NICHTS aendert: dieselben Kandidaten, dieselben
// Aehnlichkeiten, dieselben Raenge, dieselbe Reihenfolge, dieselben
// Ergebniskennungen. Es aendert sich ausschliesslich, was BELEGT wird.
//
// REIN OFFLINE: 0 KI-Aufrufe, 0 externes Netz, 0 Production-Zugriff, 0 Zufall.
// Der Abschnitt C2 spricht bewusst ein LOKALES HTTP-Doppel auf 127.0.0.1 an —
// nur so laesst sich die tatsaechlich gebaute PostgREST-Anfrage (Stapelbildung,
// Filter, Fehlerpolitik) beweisen statt bloss behaupten.
//
// GEGENPROBE: Abschnitt A2 laesst dieselben Pruefungen gegen das ALTE
// 200er-Verhalten laufen. Sie MUESSEN dort scheitern — ein Test, der auch den
// Fehler durchgehen laesst, beweist nichts.

const http = require("http");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const matching = require(path.join(root, "lib/helmut/matching.js"));
const contract = require(path.join(root, "lib/helmut/matching-contract.js"));
const erklaerung = require(path.join(root, "lib/helmut/matching-erklaerung.js"));
const storage = require(path.join(root, "lib/helmut/storage.js"));

let pass = 0;
let fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
  return Boolean(cond);
}
const j = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };

// ═══════════════════════════════════════════════════════════════════════════
// Festwerte
// ═══════════════════════════════════════════════════════════════════════════

// Das Fenster, das der Schreibpfad frueher geladen hat. Nur noch hier als
// Nachbildung des Fehlers — im Produktionscode existiert es nicht mehr.
const ALTES_FENSTER = 200;
const BESTAND_GROESSE = 260;

const profilA = {
  id: "mandant-a",
  fullName: "Test Mandat A",
  party: "SPD",
  committee: "Arbeit und Soziales",
  focusTopics: ["Rente"],
  wahlkreis: "Musterstadt"
};

const profilB = {
  id: "mandant-b",
  fullName: "Test Mandat B",
  party: "Grüne",
  committee: "Umwelt",
  focusTopics: ["Klima"]
};

// Wissensobjekt MIT vollstaendiger Ueberschneidung zu profilA.
function koPassend(id, i) {
  return {
    id,
    vorgang_id: `vg-${id}`,
    ko_version: 3,
    status: "neu",
    understanding_status: "complete",
    headline: `Rentenpaket Stufe ${i}`,
    was_ist_passiert: "Das Kabinett hat die Rentenreform beschlossen.",
    warum_wichtig: "Die Reform verändert die Altersvorsorge.",
    parteien: ["SPD"],
    ausschuesse: ["Ausschuss für Arbeit und Soziales"],
    tags: ["Rente"],
    mentioned_locations: ["Musterstadt"],
    updated_at: new Date(Date.UTC(2026, 6, 29) - i * 3600000).toISOString()
  };
}

// Wissensobjekt OHNE jede Ueberschneidung zu profilA.
function koFremd(id, i) {
  return {
    id,
    vorgang_id: `vg-${id}`,
    ko_version: 1,
    status: "neu",
    understanding_status: "complete",
    headline: `Hafenausbau ${i}`,
    was_ist_passiert: "Der Hafenausbau wurde ausgeschrieben.",
    warum_wichtig: "Betrifft die Küstenlogistik.",
    parteien: ["Freie Wähler"],
    ausschuesse: ["Ausschuss für Tourismus"],
    tags: ["Hafen"],
    mentioned_locations: ["Wilhelmshaven"],
    updated_at: new Date(Date.UTC(2026, 6, 29) - i * 3600000).toISOString()
  };
}

// Bestand, absteigend nach updated_at — Index 0 ist das zuletzt geaenderte
// Objekt. Genau so hat der alte Fensterlauf gelesen (`order=updated_at.desc`).
const bestand = [];
for (let i = 0; i < BESTAND_GROESSE; i += 1) {
  const drin = i < ALTES_FENSTER;
  const id = `${drin ? "ko-neu" : "ko-alt"}-${String(i).padStart(3, "0")}`;
  bestand.push(i === 255 ? koFremd(id, i) : koPassend(id, i));
}
const bestandById = new Map(bestand.map((k) => [k.id, k]));

const ID_IM_FENSTER = "ko-neu-005";
const ID_IM_FENSTER_2 = "ko-neu-006";
const ID_AUSSERHALB = "ko-alt-250";
const ID_AUSSERHALB_OHNE_BEZUG = "ko-alt-255";
const ID_VERSCHWUNDEN = "ko-weg-999"; // existiert im Bestand NICHT

// Feste Trefferliste. Reihenfolge und Aehnlichkeiten sind Eingabe, nicht
// Ergebnis — sie kommen in Production aus der pgvector-Suche.
const TREFFER = Object.freeze([
  { id: ID_AUSSERHALB, vorgang_id: `vg-${ID_AUSSERHALB}`, similarity: 0.8123 },
  { id: ID_IM_FENSTER, vorgang_id: `vg-${ID_IM_FENSTER}`, similarity: 0.6471 },
  { id: ID_AUSSERHALB_OHNE_BEZUG, vorgang_id: `vg-${ID_AUSSERHALB_OHNE_BEZUG}`, similarity: 0.5312 },
  { id: ID_VERSCHWUNDEN, vorgang_id: `vg-${ID_VERSCHWUNDEN}`, similarity: 0.42 }
]);

// Trefferliste, die VOLLSTAENDIG im alten Fenster lag — hier darf sich durch
// den Fix nichts aendern, auch der Fingerabdruck nicht.
const TREFFER_IM_FENSTER = Object.freeze([
  { id: ID_IM_FENSTER, vorgang_id: `vg-${ID_IM_FENSTER}`, similarity: 0.6471 },
  { id: ID_IM_FENSTER_2, vorgang_id: `vg-${ID_IM_FENSTER_2}`, similarity: 0.5108 }
]);

// ═══════════════════════════════════════════════════════════════════════════
// Doppel
// ═══════════════════════════════════════════════════════════════════════════

// NEUER Lader: liefert genau die angefragten Kennungen (das produktive
// Verhalten von storage.listKnowledgeObjectsByIds, ohne Netz).
function neuerLader(protokoll) {
  return async (ids) => {
    protokoll.push([...ids]);
    return ids.map((id) => bestandById.get(id)).filter(Boolean);
  };
}

// ALTER Lader: ignoriert die Kennungen und liefert das 200er-Fenster. Das ist
// die exakte Nachbildung des Fehlers — der alte Code baute seine Map aus
// genau dieser Menge und griff dann mit `byId.get(hit.id) || {}` zu.
function alterFensterLader(protokoll) {
  return async (ids) => {
    protokoll.push([...ids]);
    return bestand.slice(0, ALTES_FENSTER);
  };
}

// Auditdoppel mit der ECHTEN Fingerabdruck- und Laufbeschreibung aus
// matching-contract.js. Es bildet genau den Idempotenzmechanismus nach, den
// matching-audit.js gegen die Datenbank durchsetzt: ein vollstaendiger Lauf mit
// identischem Fingerabdruck erzeugt keine neue Generation.
function makeAuditDoppel() {
  const laeufe = new Map();
  const ergebnisse = new Map();
  const eingaben = [];
  const zaehler = { auditRun: 0, veroeffentlicht: 0, sperren: 0 };
  return {
    laeufe, ergebnisse, eingaben, zaehler,
    acquireRunLock: async () => { zaehler.sperren += 1; return true; },
    releaseRunLock: async () => true,
    auditRun: async (input) => {
      zaehler.auditRun += 1;
      const descriptor = contract.describeRun(input);
      eingaben.push({ input, descriptor });
      const schluessel = `${descriptor.tenantId}|${descriptor.fingerprint}`;
      const vorhanden = laeufe.get(schluessel);
      if (vorhanden) {
        vorhanden.wiederholungen += 1;
        return {
          idempotent: true, runId: vorhanden.id, status: contract.RUN_STATUS.VOLLSTAENDIG,
          fingerprint: descriptor.fingerprint, veroeffentlicht: 0, abgeloest: 0,
          wiederholungen: vorhanden.wiederholungen
        };
      }
      const runId = `mrun-${descriptor.tenantId}-${laeufe.size + 1}`;
      const rows = input.buildRows({ runId, descriptor });
      for (const r of rows) ergebnisse.set(r.id, r);
      zaehler.veroeffentlicht += rows.length;
      laeufe.set(schluessel, { id: runId, wiederholungen: 0 });
      return {
        idempotent: false, runId, status: contract.RUN_STATUS.VOLLSTAENDIG,
        fingerprint: descriptor.fingerprint, veroeffentlicht: rows.length,
        abgeloest: 0, wiederholungen: 0
      };
    }
  };
}

// Ein Lauf. `lader` entscheidet, ob das korrigierte oder das alte Verhalten
// wirkt — sonst ist alles identisch.
async function lauf({ profile = profilA, treffer = TREFFER, lader, auditAn = false, audit = null }) {
  const gespeichert = [];
  const ladeProtokoll = [];
  const deps = {
    enabled: () => true,
    getProfile: () => profile,
    saveProfileEmbedding: async () => ({ saved: true }),
    matchByEmbedding: async () => ({ results: treffer.map((t) => ({ ...t })) }),
    listKnowledgeObjectsByIds: (lader || neuerLader)(ladeProtokoll),
    // NUR fuer die externe Mutationsprobe: wird der Schreibpfad testweise auf
    // den alten Fensterlauf zurueckgesetzt, findet er hier dieselbe Datenbasis
    // vor und die Suite meldet, WELCHE Aussagen dann fallen — statt an einer
    // fehlenden Abhaengigkeit zu crashen. Der korrigierte Code ruft das nie auf.
    listKnowledgeObjects: async ({ limit } = {}) => bestand.slice(0, limit || 50),
    saveMatchingResults: async (rows) => { gespeichert.push(...rows.map((r) => ({ ...r }))); return { saved: rows.length }; },
    auditEnabled: () => auditAn,
    audit: () => audit
  };
  const ergebnis = await matching.runMatchingShadow({ profile }, deps);
  return { ergebnis, gespeichert, ladeProtokoll, audit };
}

const kern = (r) => ({
  id: r.id,
  user_id: r.user_id,
  knowledge_object_id: r.knowledge_object_id,
  vorgang_id: r.vorgang_id,
  similarity: r.similarity,
  rank: r.rank,
  filters: r.filters
});
const arten = (r) => (r.matched_features || []).map((f) => f.type).sort();
// Defensiv, damit die Suite auch in der Mutationsprobe (alter Fensterlauf ->
// gar kein Stapelaufruf) durchlaeuft und ALLE Fehlschlaege meldet statt
// vorzeitig abzubrechen.
const ersteAnfrage = (r) => (Array.isArray(r.ladeProtokoll[0]) ? r.ladeProtokoll[0] : []);

(async () => {
  // ═════════════════════════════════════════════════════════════════════════
  console.log("== A · Der Fehler und seine Behebung ==");
  // ═════════════════════════════════════════════════════════════════════════

  const neu = await lauf({ lader: neuerLader });
  const alt = await lauf({ lader: alterFensterLader });

  const neuById = new Map(neu.gespeichert.map((r) => [r.knowledge_object_id, r]));
  const altById = new Map(alt.gespeichert.map((r) => [r.knowledge_object_id, r]));

  // (1) Der eigentliche Befund: ein Treffer AUSSERHALB des alten Fensters
  //     bekommt jetzt seine echten Merkmale.
  const neuAusserhalb = neuById.get(ID_AUSSERHALB);
  const altAusserhalb = altById.get(ID_AUSSERHALB);
  check("A1 Treffer ausserhalb des alten 200er-Fensters hat jetzt matched_features",
    neuAusserhalb && neuAusserhalb.matched_features.length === 4,
    j(neuAusserhalb && neuAusserhalb.matched_features));
  check("A2 und zwar genau die belegten Arten (partei, ausschuss, wahlkreis, thema)",
    neuAusserhalb && j(arten(neuAusserhalb)) === j(["ausschuss", "partei", "thema", "wahlkreis"]),
    j(neuAusserhalb && arten(neuAusserhalb)));
  check("A3 GEGENPROBE: derselbe Treffer blieb mit dem alten Fenster unbelegt",
    altAusserhalb && altAusserhalb.matched_features.length === 0,
    j(altAusserhalb && altAusserhalb.matched_features));

  // (2) Ein Treffer INNERHALB des alten Fensters wird nicht angefasst.
  check("A4 Treffer innerhalb des alten Fensters: matched_features unveraendert",
    j(neuById.get(ID_IM_FENSTER).matched_features) === j(altById.get(ID_IM_FENSTER).matched_features)
      && neuById.get(ID_IM_FENSTER).matched_features.length === 4,
    j(neuById.get(ID_IM_FENSTER).matched_features));

  // (3) Ein Treffer ohne echte Ueberschneidung bleibt ehrlich leer — der Fix
  //     erfindet nichts, er holt nur, was wirklich da ist.
  check("A5 Treffer ohne Profilueberschneidung bleibt leer (keine erfundene Ueberschneidung)",
    neuById.get(ID_AUSSERHALB_OHNE_BEZUG).matched_features.length === 0,
    j(neuById.get(ID_AUSSERHALB_OHNE_BEZUG).matched_features));

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n== B · Scores, Raenge, Kennungen, Kandidatenmenge unveraendert ==");
  // ═════════════════════════════════════════════════════════════════════════

  check("B1 gleiche Anzahl Kandidaten (keiner kommt hinzu, keiner faellt weg)",
    neu.gespeichert.length === alt.gespeichert.length && neu.gespeichert.length === TREFFER.length,
    `neu=${neu.gespeichert.length} alt=${alt.gespeichert.length} treffer=${TREFFER.length}`);
  check("B2 identische Reihenfolge der Wissensobjekte",
    j(neu.gespeichert.map((r) => r.knowledge_object_id)) === j(alt.gespeichert.map((r) => r.knowledge_object_id)),
    j(neu.gespeichert.map((r) => r.knowledge_object_id)));
  check("B3 identische Aehnlichkeitswerte",
    j(neu.gespeichert.map((r) => r.similarity)) === j(alt.gespeichert.map((r) => r.similarity)),
    j(neu.gespeichert.map((r) => r.similarity)));
  check("B4 identische Raenge",
    j(neu.gespeichert.map((r) => r.rank)) === j(alt.gespeichert.map((r) => r.rank))
      && j(neu.gespeichert.map((r) => r.rank)) === j([1, 2, 3, 4]),
    j(neu.gespeichert.map((r) => r.rank)));
  check("B5 identische Ergebniskennungen",
    j(neu.gespeichert.map((r) => r.id)) === j(alt.gespeichert.map((r) => r.id)),
    j(neu.gespeichert.map((r) => r.id)));
  check("B6 JEDES nicht-erklaerende Feld ist byte-identisch",
    j(neu.gespeichert.map(kern)) === j(alt.gespeichert.map(kern)),
    j(neu.gespeichert.map(kern)));
  check("B7 die Kandidatenmenge ist exakt die Trefferliste der Suche",
    j(neu.gespeichert.map((r) => r.knowledge_object_id)) === j(TREFFER.map((t) => t.id)),
    j(neu.gespeichert.map((r) => r.knowledge_object_id)));
  check("B8 der Rueckgabewert des Laufs ist unveraendert",
    j(neu.ergebnis) === j(alt.ergebnis), `${j(neu.ergebnis)} vs ${j(alt.ergebnis)}`);

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n== C · Gebuendeltes Laden, kein N+1 ==");
  // ═════════════════════════════════════════════════════════════════════════

  check("C1 genau EIN Ladeaufruf fuer alle Treffer (kein Aufruf je Treffer)",
    neu.ladeProtokoll.length === 1, `aufrufe=${neu.ladeProtokoll.length}`);
  check("C2 dieser eine Aufruf enthaelt alle Trefferkennungen",
    j([...ersteAnfrage(neu)].sort()) === j(TREFFER.map((t) => t.id).sort()),
    j(ersteAnfrage(neu)));
  check("C3 kein N+1: Ladeaufrufe wachsen nicht mit der Trefferzahl",
    neu.ladeProtokoll.length < TREFFER.length, `aufrufe=${neu.ladeProtokoll.length} treffer=${TREFFER.length}`);

  const doppelt = await lauf({
    lader: neuerLader,
    treffer: [...TREFFER, { id: ID_AUSSERHALB, vorgang_id: `vg-${ID_AUSSERHALB}`, similarity: 0.8123 }]
  });
  check("C4 doppelte Kennungen werden genau einmal angefragt",
    doppelt.ladeProtokoll.length === 1 && ersteAnfrage(doppelt).length === TREFFER.length,
    j(ersteAnfrage(doppelt)));

  const leer = await lauf({ lader: neuerLader, treffer: [] });
  check("C5 leere Trefferliste: keine erfundenen Zeilen",
    leer.gespeichert.length === 0, j(leer.ergebnis));

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n== C2 · Die tatsaechlich gebaute Datenbankanfrage (lokales Doppel) ==");
  // ═════════════════════════════════════════════════════════════════════════

  const anfragen = [];
  let antwortModus = "ok";
  const server = http.createServer((req, res) => {
    anfragen.push(req.url);
    if (antwortModus === "fehler") {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "kaputt" }));
      return;
    }
    const treffer = decodeURIComponent(req.url).match(/id=in\.\(([^)]*)\)/);
    const ids = treffer ? treffer[1].split(",").map((s) => s.replace(/^"|"$/g, "")) : [];
    const rows = ids.map((id) => bestandById.get(id)).filter(Boolean);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(rows));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  const envVorher = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    store: process.env.HELMUT_V3_STORE
  };
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "lokales-testdoppel-kein-secret";
  process.env.HELMUT_V3_STORE = "1";

  try {
    const rows = await storage.listKnowledgeObjectsByIds([ID_AUSSERHALB, ID_IM_FENSTER, ID_VERSCHWUNDEN]);
    check("C2-1 genau EINE HTTP-Anfrage fuer drei Kennungen",
      anfragen.length === 1, `anfragen=${anfragen.length}`);
    // Die Werte stehen doppelt gequotet im Filter (das Anfuehrungszeichen
    // selbst wird beim Senden als %22 kodiert und serverseitig zurueckgewandelt).
    const filter = (decodeURIComponent(anfragen[0]).match(/id=in\.\(([^)]*)\)/) || [])[1] || "";
    check("C2-2 die Anfrage filtert per id=in.(...) auf genau diese Kennungen",
      filter === `"${ID_AUSSERHALB}","${ID_IM_FENSTER}","${ID_VERSCHWUNDEN}"`,
      filter);
    check("C2-3 kein limit-Fenster ueber den Gesamtbestand — limit = Anzahl der Kennungen",
      /limit=3(&|$)/.test(anfragen[0]), anfragen[0]);
    check("C2-4 ein nicht (mehr) vorhandenes Objekt fehlt einfach, ohne Fehler",
      rows.length === 2 && !rows.some((r) => r.id === ID_VERSCHWUNDEN), j(rows.map((r) => r.id)));
    check("C2-5 die Leseprojektion ist dieselbe wie im bisherigen Lesepfad",
      /select=id%2Cvorgang_id|select=id,vorgang_id/.test(anfragen[0]), anfragen[0].slice(0, 120));

    // Stapelbildung: 150 Kennungen -> 2 Anfragen, nicht 150.
    anfragen.length = 0;
    const vieleIds = bestand.slice(0, 150).map((k) => k.id);
    const viele = await storage.listKnowledgeObjectsByIds(vieleIds);
    check("C2-6 150 Kennungen -> 2 gebuendelte Anfragen (Stapel zu 100), kein N+1",
      anfragen.length === 2, `anfragen=${anfragen.length}`);
    check("C2-7 alle 150 Objekte kommen zurueck",
      viele.length === 150, `rows=${viele.length}`);

    // Determinismus: Reihenfolge und Dubletten der Eingabe sind ohne Einfluss.
    anfragen.length = 0;
    await storage.listKnowledgeObjectsByIds([ID_IM_FENSTER, ID_AUSSERHALB, ID_IM_FENSTER]);
    const ersteUrl = anfragen[0];
    anfragen.length = 0;
    await storage.listKnowledgeObjectsByIds([ID_AUSSERHALB, ID_IM_FENSTER]);
    check("C2-8 identische Kennungsmenge -> byte-identische Anfrage (deterministisch)",
      ersteUrl === anfragen[0], `${ersteUrl} vs ${anfragen[0]}`);

    anfragen.length = 0;
    const ohne = await storage.listKnowledgeObjectsByIds([]);
    check("C2-9 leere Kennungsmenge: keine Anfrage, kein Fehler",
      anfragen.length === 0 && Array.isArray(ohne) && ohne.length === 0, j(ohne));

    // Fehlerpolitik: ein echter Lesefehler wird GEWORFEN, nicht als
    // "nichts gefunden" verschwiegen. Genau die Verwechslung ist M-7.
    antwortModus = "fehler";
    let geworfen = null;
    try { await storage.listKnowledgeObjectsByIds([ID_IM_FENSTER]); }
    catch (e) { geworfen = e; }
    check("C2-10 harter Lesefehler wirft StorageReadError statt still [] zu liefern",
      geworfen && geworfen.name === "StorageReadError" && geworfen.quelle === "knowledge_objects",
      geworfen ? `${geworfen.name}/${geworfen.quelle}` : "nichts geworfen");
    antwortModus = "ok";

    // Ohne konfigurierten Store: ebenfalls laut, nicht still leer.
    process.env.HELMUT_V3_STORE = "0";
    let geworfen2 = null;
    try { await storage.listKnowledgeObjectsByIds([ID_IM_FENSTER]); }
    catch (e) { geworfen2 = e; }
    check("C2-11 nicht bereiter Store wirft ebenfalls, statt Leerstand vorzutaeuschen",
      geworfen2 && geworfen2.name === "StorageReadError",
      geworfen2 ? geworfen2.name : "nichts geworfen");
  } finally {
    if (envVorher.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = envVorher.url;
    if (envVorher.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = envVorher.key;
    if (envVorher.store === undefined) delete process.env.HELMUT_V3_STORE; else process.env.HELMUT_V3_STORE = envVorher.store;
    await new Promise((r) => server.close(r));
  }

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n== D · Fail closed: fehlendes Objekt erzeugt keinen Beleg ==");
  // ═════════════════════════════════════════════════════════════════════════

  const auditD = makeAuditDoppel();
  const mitAudit = await lauf({ lader: neuerLader, auditAn: true, audit: auditD });
  const zeilen = [...auditD.ergebnisse.values()];
  const zeileWeg = zeilen.find((r) => r.knowledge_object_id === ID_VERSCHWUNDEN);

  check("D1 verschwundenes Wissensobjekt: matched_features leer",
    zeileWeg && zeileWeg.matched_features.length === 0, j(zeileWeg && zeileWeg.matched_features));
  check("D2 verschwundenes Wissensobjekt: keine erfundene Begruendung (null)",
    zeileWeg && zeileWeg.begruendung === null, j(zeileWeg && zeileWeg.begruendung));
  check("D3 verschwundenes Wissensobjekt: signale tragen keinen fachlichen Beleg",
    zeileWeg && Object.keys(zeileWeg.signale).every((k) => k === "legacy_vektor"),
    j(zeileWeg && zeileWeg.signale));
  check("D4 verschwundenes Wissensobjekt: ko_eingabe_hash bleibt null (ehrlich statt Hash ueber {})",
    zeileWeg && zeileWeg.ko_eingabe_hash === null, j(zeileWeg && zeileWeg.ko_eingabe_hash));
  check("D5 der Treffer verschwindet deswegen NICHT aus dem Ergebnis",
    zeilen.length === TREFFER.length, `zeilen=${zeilen.length}`);

  const zeileAusserhalb = zeilen.find((r) => r.knowledge_object_id === ID_AUSSERHALB);
  check("D6 der zuvor unbelegte Treffer traegt jetzt eine belegte Begruendung",
    zeileAusserhalb && typeof zeileAusserhalb.begruendung === "string"
      && zeileAusserhalb.begruendung.startsWith("Betrifft ") && !/\d/.test(zeileAusserhalb.begruendung),
    j(zeileAusserhalb && zeileAusserhalb.begruendung));
  check("D7 und einen echten Eingabehash statt null",
    zeileAusserhalb && typeof zeileAusserhalb.ko_eingabe_hash === "string" && zeileAusserhalb.ko_eingabe_hash.length === 64,
    j(zeileAusserhalb && zeileAusserhalb.ko_eingabe_hash));
  check("D8 Lauf bleibt vollstaendig und veroeffentlicht alle Kandidaten",
    mitAudit.ergebnis.saved === TREFFER.length && mitAudit.ergebnis.audit.status === contract.RUN_STATUS.VOLLSTAENDIG,
    j(mitAudit.ergebnis.audit));

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n== E · Mandantengrenze ==");
  // ═════════════════════════════════════════════════════════════════════════

  const laufA = await lauf({ profile: profilA, lader: neuerLader });
  const laufB = await lauf({ profile: profilB, lader: neuerLader, treffer: TREFFER_IM_FENSTER });

  check("E1 jede Zeile traegt den eigenen Mandanten",
    laufA.gespeichert.every((r) => r.user_id === profilA.id)
      && laufB.gespeichert.every((r) => r.user_id === profilB.id),
    j([...new Set([...laufA.gespeichert, ...laufB.gespeichert].map((r) => r.user_id))]));
  check("E2 Ergebniskennungen bleiben mandantengebunden",
    laufA.gespeichert.every((r) => r.id.startsWith(`mr-${profilA.id}-`))
      && laufB.gespeichert.every((r) => r.id.startsWith(`mr-${profilB.id}-`)),
    j(laufB.gespeichert.map((r) => r.id)));
  check("E3 der Stapel-Lesezugriff fragt nur Kennungen aus der EIGENEN Trefferliste an",
    ersteAnfrage(laufA).length > 0 && ersteAnfrage(laufB).length > 0
      && ersteAnfrage(laufA).every((id) => TREFFER.some((t) => t.id === id))
      && ersteAnfrage(laufB).every((id) => TREFFER_IM_FENSTER.some((t) => t.id === id)),
    j(ersteAnfrage(laufB)));

  let fremdFehler = null;
  try { storage.assertTenantRows(laufA.gespeichert, "test", profilB.id); }
  catch (e) { fremdFehler = e; }
  check("E4 der produktive Mandantenriegel lehnt fremde Zeilen weiterhin ab",
    Boolean(fremdFehler), fremdFehler ? fremdFehler.name : "nicht geworfen");
  let eigenFehler = null;
  try { storage.assertTenantRows(laufA.gespeichert, "test", profilA.id); }
  catch (e) { eigenFehler = e; }
  check("E5 eigene Zeilen passieren den Riegel unveraendert", !eigenFehler,
    eigenFehler ? eigenFehler.message : "");

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n== F · Keine KI, keine Zusatzkosten ==");
  // ═════════════════════════════════════════════════════════════════════════

  const matchingQuelle = fs.readFileSync(path.join(root, "lib/helmut/matching.js"), "utf8");
  check("F1 der Matching-Schreibpfad laedt kein KI-Modul",
    !/require\(["']\.\/ai["']\)/.test(matchingQuelle) && !/openai/i.test(matchingQuelle),
    "Treffer in matching.js");
  const storageQuelle = fs.readFileSync(path.join(root, "lib/helmut/storage.js"), "utf8");
  const neueFunktion = storageQuelle.slice(
    storageQuelle.indexOf("async function listKnowledgeObjectsByIds"),
    storageQuelle.indexOf("// SPRINT 21: derselbe Lesepfad")
  );
  check("F2 der neue Stapel-Lesezugriff enthaelt keinen KI-/LLM-Pfad",
    neueFunktion.length > 0 && !/llm|openai|embedding|ai\./i.test(neueFunktion),
    neueFunktion.slice(0, 80));
  check("F3 in diesem gesamten Testlauf wurde kein KI-Modul geladen",
    !Object.keys(require.cache).some((k) => /lib[\\/]helmut[\\/]ai\.js$/.test(k)),
    j(Object.keys(require.cache).filter((k) => /ai\.js$/.test(k))));

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n== G · Fingerabdruck und Idempotenz ==");
  // ═════════════════════════════════════════════════════════════════════════

  // DIESER Fix (Erklaerungsabdeckung, Befund M-7) hebt BEWUSST keine Version an:
  // das Rezept rechnet danach exakt wie vorher, es bekommt nur endlich seinen
  // Eingang zu sehen — eine Anhebung waere hier eine falsche Aussage im
  // Auditprotokoll (§36). Der Wert `legacy_relevance_v2` stammt aus einer
  // ANDEREN, spaeteren Entscheidung: die Zulaessigkeitsregel fuer Ausschussbelege
  // (Befund 27A-2) rechnet bei gleicher Eingabe anders, dort ist die Anhebung
  // die fachlich richtige Aussage (scripts/matching-rezeptversion-v2-test.js).
  check("G1 dieser Fix erzwingt keinen Generationswechsel — die Rezeptversion ist die des 27A-2-Stands",
    contract.LEGACY_RECIPE_VERSION === "legacy_relevance_v2", contract.LEGACY_RECIPE_VERSION);
  check("G2 Engineversion unveraendert",
    contract.LEGACY_ENGINE_VERSION === "legacy-shadow-1", contract.LEGACY_ENGINE_VERSION);
  check("G3 Vektorversion unveraendert",
    contract.legacyVectorVersion(256) === "feature-hash-256-v1", contract.legacyVectorVersion(256));

  // Betroffener Lauf: der Fingerabdruck AENDERT sich, weil ko_eingabe_hash von
  // null auf einen echten Hash wechselt -> der bestehende Idempotenzriegel
  // laesst genau hier eine neue Generation zu, ganz ohne Versionsanhebung.
  const auditAltG = makeAuditDoppel();
  await lauf({ lader: alterFensterLader, auditAn: true, audit: auditAltG });
  const auditNeuG = makeAuditDoppel();
  await lauf({ lader: neuerLader, auditAn: true, audit: auditNeuG });
  const fpAlt = auditAltG.eingaben[0].descriptor.fingerprint;
  const fpNeu = auditNeuG.eingaben[0].descriptor.fingerprint;
  check("G4 betroffener Lauf: neuer Fingerabdruck -> eine neue Generation ist zulaessig",
    fpAlt !== fpNeu, `${fpAlt} vs ${fpNeu}`);

  // Nicht betroffener Lauf: alle Treffer lagen im Fenster -> der Fingerabdruck
  // bleibt gleich, es entsteht KEIN unnoetiger Generationswechsel.
  const auditAltH = makeAuditDoppel();
  await lauf({ lader: alterFensterLader, treffer: TREFFER_IM_FENSTER, auditAn: true, audit: auditAltH });
  const auditNeuH = makeAuditDoppel();
  await lauf({ lader: neuerLader, treffer: TREFFER_IM_FENSTER, auditAn: true, audit: auditNeuH });
  check("G5 nicht betroffener Lauf: Fingerabdruck identisch -> bleibt idempotent",
    auditAltH.eingaben[0].descriptor.fingerprint === auditNeuH.eingaben[0].descriptor.fingerprint,
    `${auditAltH.eingaben[0].descriptor.fingerprint} vs ${auditNeuH.eingaben[0].descriptor.fingerprint}`);

  // Nach der einmaligen Korrektur ist wieder alles idempotent.
  const auditI = makeAuditDoppel();
  const i1 = await lauf({ lader: neuerLader, auditAn: true, audit: auditI });
  const nachErstem = auditI.zaehler.veroeffentlicht;
  const i2 = await lauf({ lader: neuerLader, auditAn: true, audit: auditI });
  check("G6 identischer Code + identische Eingabe -> zweiter Lauf ist idempotent",
    i1.ergebnis.audit.idempotent === false && i2.ergebnis.audit.idempotent === true,
    `${j(i1.ergebnis.audit)} / ${j(i2.ergebnis.audit)}`);
  check("G7 der idempotente Zweitlauf schreibt KEINE Ergebniszeile",
    auditI.zaehler.veroeffentlicht === nachErstem && i2.ergebnis.saved === 0,
    `veroeffentlicht=${auditI.zaehler.veroeffentlicht} nachErstem=${nachErstem} saved=${i2.ergebnis.saved}`);
  check("G8 der idempotente Zweitlauf zaehlt nur die Wiederholung hoch",
    i2.ergebnis.audit.wiederholungen === 1 && i2.ergebnis.audit.runId === i1.ergebnis.audit.runId,
    j(i2.ergebnis.audit));
  check("G9 der Lauf nimmt weiterhin genau eine Sperre je Mandant",
    auditI.zaehler.sperren === 2, `sperren=${auditI.zaehler.sperren}`);

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n== H · Die Oberflaeche aus PR #171 zeigt die Belege ohne Aenderung ==");
  // ═════════════════════════════════════════════════════════════════════════

  const uiNeu = erklaerung.erklaerungAusErgebnis(zeileAusserhalb);
  const altZeileAusserhalb = { ...altById.get(ID_AUSSERHALB), aktuell: true, signale: {}, begruendung: null };
  const uiAlt = erklaerung.erklaerungAusErgebnis(altZeileAusserhalb);
  check("H1 zuvor: kein Abschnitt (kein Beleg)", uiAlt === null, j(uiAlt));
  check("H2 jetzt: ein Satz und zwei bis vier Belege — ohne eine Zeile UI-Code",
    uiNeu && typeof uiNeu.satz === "string" && uiNeu.belege.length >= 2 && uiNeu.belege.length <= 4,
    j(uiNeu));
  check("H3 der Satz enthaelt keine Zahl, keinen Rang, keinen Score",
    uiNeu && !/\d/.test(uiNeu.satz) && !/(Score|Rang|Vektor|Matching|Ähnlich)/i.test(uiNeu.satz),
    j(uiNeu && uiNeu.satz));
  check("H4 ein unbelegter Treffer bleibt auch jetzt ohne Abschnitt",
    erklaerung.erklaerungAusErgebnis(zeilen.find((r) => r.knowledge_object_id === ID_AUSSERHALB_OHNE_BEZUG)) === null,
    "Abschnitt trotz fehlendem Beleg");

  // ═════════════════════════════════════════════════════════════════════════
  console.log("\n== I · Mutationsprobe: die Pruefungen greifen wirklich ==");
  // ═════════════════════════════════════════════════════════════════════════

  // Dieselben Kernaussagen noch einmal — aber gegen das alte 200er-Verhalten.
  // Jede einzelne MUSS scheitern. Tut sie das nicht, prueft der Test nichts.
  const mutAudit = makeAuditDoppel();
  const mut = await lauf({ lader: alterFensterLader, auditAn: true, audit: mutAudit });
  const mutZeilen = [...mutAudit.ergebnisse.values()];
  const mutAusserhalb = mutZeilen.find((r) => r.knowledge_object_id === ID_AUSSERHALB);
  const mutationen = [
    ["matched_features des Treffers ausserhalb", mutAusserhalb.matched_features.length === 4],
    ["belegte Begruendung", typeof mutAusserhalb.begruendung === "string"],
    ["echter Eingabehash", typeof mutAusserhalb.ko_eingabe_hash === "string"],
    ["sichtbare Erklaerung in der Oberflaeche", erklaerung.erklaerungAusErgebnis(mutAusserhalb) !== null]
  ];
  const durchgerutscht = mutationen.filter(([, ok]) => ok).map(([name]) => name);
  check(`I1 alle ${mutationen.length} Kernpruefungen scheitern gegen den alten 200er-Fehler`,
    durchgerutscht.length === 0, `durchgerutscht: ${j(durchgerutscht)}`);
  check("I2 der Mutationslauf liefert trotzdem dieselben Kandidaten/Raenge",
    mutZeilen.length === TREFFER.length && mut.ergebnis.candidates === TREFFER.length,
    j(mut.ergebnis));

  // ═════════════════════════════════════════════════════════════════════════
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  if (fail > 0) process.exit(1);
})().catch((error) => {
  console.error("Suite abgebrochen:", error && error.stack ? error.stack : error);
  process.exit(1);
});
