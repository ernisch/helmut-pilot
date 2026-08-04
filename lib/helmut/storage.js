const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { v1Sources } = require("./sources");
const { isTerminalUnderstandingStatus } = require("./pending-terminal");

const dataDir = path.join(__dirname, "..", "..", ".helmut-data");
const dataFile = path.join(dataDir, "store.json");
const supabaseStoreId = process.env.HELMUT_SUPABASE_STORE_ID || "main";

function defaultStore() {
  return {
    sources: v1Sources,
    profiles: {},
    rawItems: [],
    briefings: [],
    crawlRuns: [],
    tasks: [],
    interactions: [],
    topicMemory: [],
    mandateProfiles: {},
    politicalItems: [],
    personalizedRecommendations: [],
    dailyTasks: [],
    communicationDrafts: [],
    userNotes: [],
    priorityChanges: [],
    lageChecks: [],
    pushSubscriptions: [],
    pushEvents: [],
    pipelineDebugReports: [],
    // Auth-Schicht (MVP): bewusst im JSON-Store gekapselt, damit ein spaeterer
    // relationaler Umzug ein Drop-in-Swap bleibt. Identitaet/Rollen/Mandantentrennung
    // werden ausschliesslich serverseitig aus diesen Collections abgeleitet.
    users: [],
    sessions: [],
    assignments: [],
    dailyInputs: [],
    auditEvents: [],
    systemErrors: [],
    adminSettings: {}
  };
}

function useSupabase() {
  return (
    String(process.env.HELMUT_STORAGE_BACKEND || "").trim().toLowerCase() === "supabase" &&
    Boolean(process.env.SUPABASE_URL) &&
    Boolean(supabaseServiceRoleKey())
  );
}

function getStorageStatus() {
  const backend = useSupabase() ? "supabase" : "local";
  return {
    backend,
    supabaseConfigured: Boolean(process.env.SUPABASE_URL && supabaseServiceRoleKey()),
    storeId: supabaseStoreId
  };
}

async function getStoreSummary(politicianId) {
  const [store, pStore] = await Promise.all([
    readStore("main"),
    politicianId ? readStore(pKey(politicianId)) : Promise.resolve(defaultPoliticianStore())
  ]);
  const activeSources = (store.sources || []).filter((source) => source.active !== false);
  const rawItems = store.rawItems || [];
  const latestRawItem = sortByDate(rawItems, "retrievedAt", "publishedAt")[0] || null;
  // Briefings: zuerst im Politiker-Store suchen, dann Main-Store als Fallback
  const allBriefings = [...(pStore.briefings || []), ...(store.briefings || [])];
  const latestBriefing = allBriefings.find((briefing) => !politicianId || briefing.politicianId === politicianId) || null;
  const allTasks = [...(pStore.tasks || []), ...(store.tasks || [])];
  const allLageChecks = [...(pStore.lageChecks || []), ...(store.lageChecks || [])];
  const allPushEvents = [...(pStore.pushEvents || []), ...(store.pushEvents || [])];
  const recommendations = [...(pStore.personalizedRecommendations || []), ...(store.personalizedRecommendations || [])].filter((entry) => !politicianId || entry.user_id === politicianId);
  const tasks = allTasks.filter((task) => !politicianId || task.politicianId === politicianId);
  const notes = [...(pStore.userNotes || []), ...(store.userNotes || [])].filter((note) => !politicianId || note.user_id === politicianId);
  const latestPushEvent = allPushEvents.find((event) => !politicianId || event.politicianId === politicianId) || null;
  const since24h = Date.now() - 24 * 60 * 60 * 1000;

  return {
    backend: getStorageStatus().backend,
    storeId: supabaseStoreId,
    sources: {
      total: (store.sources || []).length,
      active: activeSources.length
    },
    rawItems: {
      total: rawItems.length,
      last24h: rawItems.filter((item) => new Date(item.retrievedAt || item.publishedAt || 0).getTime() >= since24h).length,
      directLinks: rawItems.filter((item) => articleUrlQuality(item.url) === "direct").length,
      missingLinks: rawItems.filter((item) => articleUrlQuality(item.url) !== "direct").length,
      latestAt: latestRawItem?.retrievedAt || latestRawItem?.publishedAt || null
    },
    briefings: {
      total: allBriefings.filter((briefing) => !politicianId || briefing.politicianId === politicianId).length,
      latestId: latestBriefing?.id || null,
      latestStatus: latestBriefing?.status || null,
      latestGeneratedAt: latestBriefing?.generatedAt || latestBriefing?.date || null
    },
    crawlRuns: {
      total: (store.crawlRuns || []).length,
      latestAt: store.crawlRuns?.[0]?.createdAt || null
    },
    lageChecks: {
      total: allLageChecks.filter((check) => !politicianId || check.politicianId === politicianId).length,
      latestAt: allLageChecks.find((check) => !politicianId || check.politicianId === politicianId)?.checkedAt || null,
      latestStatus: allLageChecks.find((check) => !politicianId || check.politicianId === politicianId)?.status || null
    },
    push: {
      subscriptions: [...(pStore.pushSubscriptions || []), ...(store.pushSubscriptions || [])].filter((subscription) => !politicianId || subscription.politicianId === politicianId).length,
      latestEventAt: latestPushEvent?.createdAt || null,
      latestReason: latestPushEvent?.reason || "",
      latestDelivered: latestPushEvent?.delivered || 0
    },
    recommendations: {
      total: recommendations.length,
      active: recommendations.filter((entry) => !["done", "ignored"].includes(entry.status)).length
    },
    tasks: {
      total: tasks.length,
      open: tasks.filter((task) => task.status !== "done").length
    },
    notes: {
      total: notes.length
    },
    debugReports: {
      total: [...(pStore.pipelineDebugReports || []), ...(store.pipelineDebugReports || [])].filter((report) => !politicianId || report.politicianId === politicianId).length,
      latestAt: [...(pStore.pipelineDebugReports || []), ...(store.pipelineDebugReports || [])].find((report) => !politicianId || report.politicianId === politicianId)?.createdAt || null
    }
  };
}

// Cache pro Store-Key. readStore/writeStore akzeptieren einen optionalen storeKey:
// - "main" (default): geteilte Daten (sources, rawItems, crawlRuns, profiles)
// - "p-{politicianId}": isolierter Politiker-Store (briefings, tasks, ...)
// Per HELMUT_STORE_CACHE_MS=0 deaktivierbar.
const storeCacheTtlMs = Number(process.env.HELMUT_STORE_CACHE_MS || 10000);
const storeCacheMap = new Map(); // storeKey → { data, at }

async function readStore(storeKey = "main") {
  const cached = storeCacheMap.get(storeKey);
  if (storeCacheTtlMs > 0 && cached && Date.now() - cached.at < storeCacheTtlMs) {
    return cached.data;
  }
  const store = useSupabase() ? await readSupabaseStore(storeKey) : readLocalStore(storeKey);
  storeCacheMap.set(storeKey, { data: store, at: Date.now() });
  return store;
}

async function writeStore(store, storeKey = "main") {
  const isMain = storeKey === "main";
  const normalized = isMain ? compactStore(normalizeStore(store)) : compactPoliticianStore(normalizePoliticianStore(store));
  if (useSupabase()) await writeSupabaseStore(normalized, storeKey);
  else writeLocalStore(normalized, storeKey);
  storeCacheMap.set(storeKey, { data: normalized, at: Date.now() });
  return normalized;
}

function readLocalStore(storeKey = "main") {
  const file = storeKey === "main" ? dataFile : path.join(dataDir, `${storeKey}.json`);
  if (!fs.existsSync(file)) return storeKey === "main" ? defaultStore() : defaultPoliticianStore();
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return storeKey === "main" ? normalizeStore(raw) : normalizePoliticianStore(raw);
  } catch (error) {
    console.error("Helmut storage read failed", storeKey, error);
    return storeKey === "main" ? defaultStore() : defaultPoliticianStore();
  }
}

function writeLocalStore(store, storeKey = "main") {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = storeKey === "main" ? dataFile : path.join(dataDir, `${storeKey}.json`);
  fs.writeFileSync(file, JSON.stringify(store, null, 2));
}

// --- Fairnesszustand der Mehrmandanten-Crons (OP-25) -------------------------
// EIGENE Zeile im bereits existierenden helmut_store: `<storeId>-cron-fairness`.
// KEINE neue Tabelle, KEINE Migration, KEINE RLS-Aenderung noetig — die Policy auf
// helmut_store matcht ausschliesslich das Praefix `main-p-`; jede andere Zeile ist
// fuer nicht-service_role-Rollen implizit gesperrt (20260712_tenant_rls_policies).
//
// WARUM EINE EIGENE ZEILE: der Auth-/Main-Blob wird von vielen Schreibern ersetzt
// (Befund W-2: Last-Write-Wins verliert parallele Eintraege OHNE Fehler). Eine
// dedizierte Zeile hat genau EINEN Schreiber (diesen hier) und traegt ~4 KB statt
// 1,24 MB — der Fairnesszustand kostet den Cron damit fast keine Zeit.
//
// BEWUSST OHNE readStore/writeStore: deren normalizeStore/compactStore-Schema
// (main bzw. p-<mandant>) wuerde die Scheduler-Felder verwerfen; und der
// 10-s-Cache von readStore darf hier NICHT greifen (der Zustand muss vor jedem
// Schreiben frisch gelesen werden, damit die Verschmelzung monoton bleibt).
//
// DSGVO: ausschliesslich pseudonyme Mandatskennung, Zeitstempel, Zaehler,
// Statuswort. Keine Inhalte, keine Roh-Fehlertexte, keine PII.
//
// SCHREIBWEISE (Befund F-CAS, 2026-08-02): der Zeileninhalt wird NUR NOCH
// BEDINGT ersetzt (Compare-and-Set ueber `data.rev`). Grund ist ein in
// Production belegter verlorener Schreibvorgang: Lesen -> Verschmelzen ->
// Schreiben ist fuer sich NICHT atomar. Zwei ueberlappende Crons (ein nach
// seinem aeusseren Zeitlimit intern weiterlaufender `crawl` und der regulaere
// `morning-briefing`) haben dieselbe Zeile bearbeitet; der zweite Schreiber
// stuetzte sich auf einen Lesestand von VOR dem Abschluss des ersten und hat
// diesen Abschluss beim Zurueckschreiben geloescht — ohne Fehler, ohne Signal.
// Die monotone Verschmelzung in cron-fairness.mergeState schuetzt davor NICHT:
// sie ist monoton gegenueber dem gelesenen Stand, nicht gegenueber einem
// Schreibvorgang, den dieser Prozess nie gesehen hat.
const CRON_FAIRNESS_STORE_SUFFIX = "cron-fairness";

function cronFairnessRowId() {
  return `${supabaseStoreId}-${CRON_FAIRNESS_STORE_SUFFIX}`;
}

// Fortschreibungszaehler der ZEILE (nicht des Fairnessinhalts). Er ist die
// Bedingung des Compare-and-Set und waechst mit jedem erfolgreichen Schreiben
// um genau 1. `null` = kein oder kein deutbarer Wert (Altbestand oder ein
// Codestand ohne CAS) — dann wird gegen "Feld fehlt" verglichen.
function revOf(raw) {
  const n = raw && typeof raw === "object" ? Number(raw.rev) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function cronFairnessLocalFile() {
  return path.join(dataDir, `${CRON_FAIRNESS_STORE_SUFFIX}.json`);
}

// Wirft NIE: ein nicht lesbarer Zustand ist ein Fairness-, kein Ausfallproblem.
// Der Aufrufer erkennt den Unterschied an `{ ok:false }` und meldet ihn sichtbar.
// `deps.request` ist injizierbar (Tests) — genau wie bei acquirePipelineLockAtomic.
async function readCronFairnessState(deps = {}) {
  const { normalizeState, stateVersion } = require("./cron-fairness");
  const request = deps.request || supabaseRequest;
  try {
    if (useSupabase()) {
      const rows = await request(
        `/rest/v1/helmut_store?id=eq.${encodeURIComponent(cronFairnessRowId())}&select=data`
      );
      const row = Array.isArray(rows) ? rows[0] : null;
      const roh = (row && row.data) || {};
      return { ok: true, state: normalizeState(roh), existiert: Boolean(row), version: stateVersion(roh), rev: revOf(roh) };
    }
    const file = cronFairnessLocalFile();
    if (!fs.existsSync(file)) return { ok: true, state: normalizeState({}), existiert: false, version: null, rev: null };
    const roh = JSON.parse(fs.readFileSync(file, "utf8"));
    return { ok: true, state: normalizeState(roh), existiert: true, version: stateVersion(roh), rev: revOf(roh) };
  } catch (error) {
    return { ok: false, state: normalizeState({}), existiert: null, fehler: String((error && error.message) || "unbekannt").slice(0, 200) };
  }
}

// Der BEDINGTE Schreibvorgang. Er ersetzt den Zeileninhalt nur dann, wenn die
// Zeile seit dem Lesen unveraendert ist — sonst meldet er einen Konflikt und
// der Aufrufer liest neu und verschmilzt seinen Patch erneut. Damit kann ein
// Schreibvorgang, den dieser Prozess nie gesehen hat, nicht mehr verloren gehen.
//
// Postgres serialisiert konkurrierende UPDATEs derselben Zeile ueber den
// Row-Lock; die WHERE-Bedingung wird danach gegen den NEUEN Stand geprueft.
// Trifft sie nicht mehr zu, aendert das UPDATE 0 Zeilen — genau das ist das
// Konfliktsignal. Kein Lock, keine Transaktion, keine Migration, kein RPC.
async function schreibeCronFairnessZeile(request, daten, { existiert, rev }) {
  const id = cronFairnessRowId();
  if (!existiert) {
    // Einfuegen OHNE `merge-duplicates`: legt ein anderer Lauf die Zeile in
    // derselben Sekunde an, muss das ein sichtbarer Konflikt (409) sein und
    // kein stilles Ueberschreiben seines Standes.
    try {
      await request("/rest/v1/helmut_store", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ id, data: daten })
      });
      return true;
    } catch (error) {
      if (/\b409\b|duplicate key/i.test(String((error && error.message) || ""))) return false;
      throw error;
    }
  }
  // `data->>rev` als Bedingung; `->>`-Pfeile prozentkodiert, damit sie keine
  // Frageneigenheit eines Zwischenstuecks treffen. Ohne Zaehler in der Zeile
  // (Altbestand) wird gegen "Feld fehlt" verglichen.
  const bedingung = rev === null ? "data-%3E%3Erev=is.null" : `data-%3E%3Erev=eq.${rev}`;
  const zeilen = await request(
    `/rest/v1/helmut_store?id=eq.${encodeURIComponent(id)}&${bedingung}&select=id`,
    {
      method: "PATCH",
      // Ohne Rueckgabe waere ein Treffer nicht von einem Nicht-Treffer zu
      // unterscheiden — die Rueckgabe IST das Ergebnis des Vergleichs.
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ data: daten })
    }
  );
  return Array.isArray(zeilen) && zeilen.length > 0;
}

// Lokaler Dateimodus (Entwicklung/Tests, kein Production-Pfad): dieselbe
// Bedingung, synchron geprueft. Node ist je Prozess einfaedig — zwischen
// Pruefung und Schreiben liegt hier kein await.
function schreibeCronFairnessDatei(daten, { rev }) {
  const file = cronFairnessLocalFile();
  const jetzt = fs.existsSync(file) ? revOf(JSON.parse(fs.readFileSync(file, "utf8"))) : null;
  if (jetzt !== rev) return false;
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(daten, null, 2));
  return true;
}

// Verschmilzt einen Patch monoton in den FRISCH gelesenen Zustand und schreibt ihn
// zurueck. Wirft NIE.
//
// DREI SCHRANKEN gegen Datenverlust:
//  (1) Lesefehler -> KEIN Schreiben. Der Patch traegt nur EIN Mandat; ein leerer
//      Lesestand wuerde die Eintraege ALLER anderen Mandate ueberschreiben. Ein
//      verlorener Versuchsvermerk ist harmlos, ein geloeschter Zustand nicht.
//  (2) NEUERE Schemaversion in der Zeile -> KEIN Schreiben. Waehrend eines Rollouts
//      koennen zwei Codestaende laufen; der aeltere darf den neueren nicht plattmachen.
//  (3) `pruefen: true` (nur beim Registrieren eines Versuchs) -> nach dem Schreiben
//      wird zurueckgelesen. Fehlt der eigene Eintrag, hat ein ueberlappender Lauf ihn
//      ueberschrieben: begrenzte Wiederholung statt stillem Verlust. Beim ABSCHLUSS
//      entfaellt die Gegenpruefung bewusst — sie ist seit (4) nicht mehr noetig.
//  (4) COMPARE-AND-SET (Befund F-CAS): der Zeileninhalt wird nur ersetzt, wenn die
//      Zeile seit dem Lesen unveraendert ist. Andernfalls Konflikt -> neu lesen,
//      Patch erneut verschmelzen, erneut versuchen. Das ist die eigentliche
//      Absicherung: (1)-(3) schuetzen gegen das Schreiben auf einen NICHT gelesenen
//      Stand, (4) gegen das Schreiben auf einen INZWISCHEN VERALTETEN Stand.
//      Erst damit gilt: ein erfolgreicher Schreibvorgang bedeutet, dass die Zeile
//      GENAU den zurueckgegebenen `state` traegt.
async function saveCronFairnessState(patch, { nowMs = Date.now(), pruefen = false, maxVersuche = 3, deps = {} } = {}) {
  const { mergeState, FAIRNESS_VERSION, entryOf } = require("./cron-fairness");
  const request = deps.request || supabaseRequest;
  // Welche (cron, mandat)-Paare traegt der Patch? Nur die werden gegengelesen.
  const erwartet = [];
  for (const [cronName, mandate] of Object.entries((patch && patch.crons) || {})) {
    for (const tenantId of Object.keys(mandate || {})) erwartet.push([cronName, tenantId]);
  }
  let letzterFehler = null;
  for (let versuch = 1; versuch <= Math.max(1, maxVersuche); versuch += 1) {
    try {
      const aktuell = await readCronFairnessState(deps);
      if (!aktuell.ok) return { ok: false, fehler: aktuell.fehler || "zustand-nicht-lesbar", gelesen: false };
      if (Number.isFinite(aktuell.version) && aktuell.version > FAIRNESS_VERSION) {
        return { ok: false, fehler: `zustand-neuere-version-${aktuell.version}`, gelesen: true };
      }
      const merged = mergeState(aktuell.state, patch, { nowMs });
      // Der Zaehler gehoert zur ZEILE, nicht zum Fairnessinhalt: er wird beim
      // Schreiben angehaengt und beim Lesen wieder abgetrennt (normalizeState
      // fuehrt ihn nicht). Damit aendert er weder Reihenfolge noch Vertrag.
      const geschrieben = { ...merged, rev: (aktuell.rev === null ? 0 : aktuell.rev) + 1 };
      const gesetzt = useSupabase()
        ? await schreibeCronFairnessZeile(request, geschrieben, aktuell)
        : schreibeCronFairnessDatei(geschrieben, aktuell);
      if (!gesetzt) {
        // Die Zeile hat sich zwischen Lesen und Schreiben geaendert. NICHTS ist
        // verloren: der naechste Versuch liest den neuen Stand und verschmilzt
        // denselben Patch erneut darauf.
        letzterFehler = "gleichzeitiger-schreibvorgang";
        continue;
      }
      if (!pruefen || !erwartet.length) return { ok: true, state: merged, gelesen: true, versuche: versuch };
      const nachher = await readCronFairnessState(deps);
      if (!nachher.ok) return { ok: true, state: merged, gelesen: true, versuche: versuch, ungeprueft: true };
      const fehlt = erwartet.filter(([c, t]) => {
        const soll = entryOf(merged, c, t);
        const ist = entryOf(nachher.state, c, t);
        return !ist || (soll && soll.letzterVersuchAt && ist.letzterVersuchAt !== soll.letzterVersuchAt
          && Date.parse(ist.letzterVersuchAt || 0) < Date.parse(soll.letzterVersuchAt));
      });
      // Der eigene Eintrag steht (oder ein NEUERER fremder Versuch hat gewonnen — dann
      // ist nichts verloren, der andere Lauf hat das Mandat). Fernstand zurueckgeben,
      // damit der Aufrufer einen fremden Halter erkennen kann.
      if (!fehlt.length) return { ok: true, state: nachher.state, gelesen: true, versuche: versuch };
      letzterFehler = `eigener-eintrag-ueberschrieben (${fehlt.map(([c, t]) => `${c}/${t}`).join(",")})`;
    } catch (error) {
      letzterFehler = String((error && error.message) || "unbekannt").slice(0, 200);
      // Transiente Fehler duerfen wiederholt werden; permanente (4xx) nicht.
      if (/\b4\d\d\b/.test(letzterFehler)) break;
    }
  }
  return { ok: false, fehler: letzterFehler || "unbekannt", konflikt: /ueberschrieben|gleichzeitiger-schreibvorgang/.test(String(letzterFehler)) };
}

// DSGVO-Loeschung/Teardown: Scheduler-Spuren eines Mandats entfernen. Wirft NIE.
async function deleteCronFairnessTenant(politicianId, { maxVersuche = 3, deps = {} } = {}) {
  const { withoutTenant } = require("./cron-fairness");
  const request = deps.request || supabaseRequest;
  if (!politicianId) return { ok: true, entfernt: false };
  let letzterFehler = null;
  // Auch die Loeschung ist ein Lesen-Aendern-Schreiben und laeuft deshalb ueber
  // dasselbe Compare-and-Set: sonst koennte sie den Fortschritt eines gerade
  // laufenden Crons loeschen — oder ein Cron die Loeschung wieder einspielen.
  for (let versuch = 1; versuch <= Math.max(1, maxVersuche); versuch += 1) {
    try {
      const aktuell = await readCronFairnessState(deps);
      if (!aktuell.ok) return { ok: false, fehler: aktuell.fehler || "zustand-nicht-lesbar" };
      const vorher = JSON.stringify(aktuell.state);
      const bereinigt = withoutTenant(aktuell.state, politicianId);
      if (JSON.stringify(bereinigt) === vorher) return { ok: true, entfernt: false };
      const geschrieben = { ...bereinigt, rev: (aktuell.rev === null ? 0 : aktuell.rev) + 1 };
      const gesetzt = useSupabase()
        ? await schreibeCronFairnessZeile(request, geschrieben, aktuell)
        : schreibeCronFairnessDatei(geschrieben, aktuell);
      if (gesetzt) return { ok: true, entfernt: true };
      letzterFehler = "gleichzeitiger-schreibvorgang";
    } catch (error) {
      letzterFehler = String((error && error.message) || "unbekannt").slice(0, 200);
      if (/\b4\d\d\b/.test(letzterFehler)) break;
    }
  }
  return { ok: false, fehler: letzterFehler || "unbekannt" };
}

// P0-5 Stufe 1 — Blob-Timeout-Robustheit ---------------------------------------
// Der 1,24-MB-Monolith-Blob (Audit R1) laeuft wiederkehrend in 10-s-Timeouts; ein
// Timeout WAEHREND saveCrawlRun/saveRawItems verlor bisher OHNE Retry den ganzen
// Lauf. Jetzt: begrenzter Retry mit exponentiellem Backoff NUR bei transienten
// Fehlern (Timeout/5xx/Verbindung) — 4xx (permanent) werden sofort durchgereicht,
// nie Endlosschleife. Reads UND Writes sind idempotent (Upsert merge-duplicates),
// Retry daher sicher. Nach erschoepften Retries: ein technischer systemError (kein
// stiller Lauf-Verlust) — der Fehler wird ANSCHLIESSEND weitergeworfen, damit der
// Aufrufer ihn weiterhin sieht.
const BLOB_RETRY_MAX = Math.max(0, Number(process.env.HELMUT_BLOB_RETRY_MAX) || 2);
const BLOB_RETRY_BASE_MS = Math.max(1, Number(process.env.HELMUT_BLOB_RETRY_BASE_MS) || 250);

function isRetryableStoreError(error) {
  const m = String((error && error.message) || "").toLowerCase();
  if (!m) return false;
  if (/\b4\d\d\b/.test(m)) return false;           // 4xx = permanent, NICHT retryen
  return m.includes("timed out") || m.includes("timeout") || m.includes("aborterror") ||
    /\b5\d\d\b/.test(m) || m.includes("econnreset") || m.includes("econnrefused") ||
    m.includes("socket") || m.includes("network") || m.includes("fetch failed");
}

// Re-entrancy-Guard: recordPipelineError liest/schreibt selbst den Auth-Store
// (ueber withStoreRetry). Ohne Guard fuehrte ein anhaltender Auth-Store-Ausfall zu
// unendlicher Rekursion (retry -> record -> read -> retry -> record …). Waehrend
// der Fehleraufzeichnung wird deshalb NICHT erneut aufgezeichnet.
let _recordingPipelineError = false;

async function withStoreRetry(fn, ctx = {}) {
  let lastError;
  for (let attempt = 0; attempt <= BLOB_RETRY_MAX; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      const retryable = isRetryableStoreError(error);
      if (!retryable || attempt >= BLOB_RETRY_MAX) break;
      const delay = BLOB_RETRY_BASE_MS * Math.pow(2, attempt); // 250, 500, 1000 …
      console.warn(`[blob-retry] ${ctx.label || "store"} Versuch ${attempt + 1}/${BLOB_RETRY_MAX + 1} fehlgeschlagen (${error && error.message}) — Backoff ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  // Endgueltig fehlgeschlagen -> technischer systemError (kein stiller Lauf-Verlust).
  if (!_recordingPipelineError) {
    try {
      await recordPipelineError({
        process: ctx.label || "blob-io",
        errorType: lastError,
        retry: BLOB_RETRY_MAX,
        sourceId: ctx.storeKey || null
      });
    } catch (_) { /* Fehler-Logging darf den urspruenglichen Fehler nie verdecken */ }
  }
  throw lastError;
}

async function readSupabaseStore(storeKey = "main") {
  const rowId = storeKey === "main" ? supabaseStoreId : `${supabaseStoreId}-${storeKey}`;
  const rows = await withStoreRetry(
    () => supabaseRequest(`/rest/v1/helmut_store?id=eq.${encodeURIComponent(rowId)}&select=data`),
    { label: "blob-read", storeKey }
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (row?.data) return storeKey === "main" ? normalizeStore(row.data) : normalizePoliticianStore(row.data);
  const seeded = storeKey === "main" ? defaultStore() : defaultPoliticianStore();
  await writeSupabaseStore(seeded, storeKey);
  return seeded;
}

async function writeSupabaseStore(store, storeKey = "main") {
  const rowId = storeKey === "main" ? supabaseStoreId : `${supabaseStoreId}-${storeKey}`;
  await withStoreRetry(
    () => supabaseRequest("/rest/v1/helmut_store", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: rowId, data: store })
    }),
    { label: "blob-write", storeKey }
  );
  return store;
}

// --- Politician-Store Infrastruktur ---
// Jeder Abgeordnete bekommt seinen eigenen Supabase-Row ("main-p-{id}").
// Geteilte Daten (sources, rawItems, crawlRuns, profiles) bleiben im "main"-Store.

function pKey(politicianId) {
  return politicianId ? `p-${politicianId}` : "main";
}

function defaultPoliticianStore() {
  return {
    briefings: [],
    tasks: [],
    interactions: [],
    topicMemory: [],
    politicalItems: [],
    personalizedRecommendations: [],
    dailyTasks: [],
    communicationDrafts: [],
    userNotes: [],
    priorityChanges: [],
    lageChecks: [],
    pushSubscriptions: [],
    pushEvents: [],
    pipelineDebugReports: []
  };
}

function normalizePoliticianStore(store = {}) {
  const parsed = { ...defaultPoliticianStore(), ...store };
  return {
    briefings: Array.isArray(parsed.briefings) ? parsed.briefings : [],
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    interactions: Array.isArray(parsed.interactions) ? parsed.interactions : [],
    topicMemory: Array.isArray(parsed.topicMemory) ? parsed.topicMemory : [],
    politicalItems: Array.isArray(parsed.politicalItems) ? parsed.politicalItems : [],
    personalizedRecommendations: Array.isArray(parsed.personalizedRecommendations) ? parsed.personalizedRecommendations : [],
    dailyTasks: Array.isArray(parsed.dailyTasks) ? parsed.dailyTasks : [],
    communicationDrafts: Array.isArray(parsed.communicationDrafts) ? parsed.communicationDrafts : [],
    userNotes: Array.isArray(parsed.userNotes) ? parsed.userNotes : [],
    priorityChanges: Array.isArray(parsed.priorityChanges) ? parsed.priorityChanges : [],
    lageChecks: Array.isArray(parsed.lageChecks) ? parsed.lageChecks : [],
    pushSubscriptions: Array.isArray(parsed.pushSubscriptions) ? parsed.pushSubscriptions : [],
    pushEvents: Array.isArray(parsed.pushEvents) ? parsed.pushEvents : [],
    pipelineDebugReports: Array.isArray(parsed.pipelineDebugReports) ? parsed.pipelineDebugReports : []
  };
}

function compactPoliticianStore(store) {
  return {
    ...store,
    briefings: keepLatestPerOwner(store.briefings, "generatedAt", "date", 4, 320).map(compactStoredBriefing),
    interactions: keepLatestPerOwner(store.interactions, "createdAt", "createdAt", 80, 4000),
    topicMemory: keepLatestPerOwner(store.topicMemory, "updatedAt", "lastSeenAt", 120, 4000),
    politicalItems: keepLatestPerOwner(store.politicalItems, "created_at", "updated_at", 80, 4000),
    personalizedRecommendations: keepLatestPerOwner(store.personalizedRecommendations, "created_at", "updated_at", 80, 4000),
    dailyTasks: keepLatestPerOwner(store.dailyTasks, "createdAt", "dueDate", 60, 3000),
    communicationDrafts: keepLatestPerOwner(store.communicationDrafts, "createdAt", "createdAt", 40, 2000),
    userNotes: keepLatestPerOwner(store.userNotes, "createdAt", "createdAt", 80, 3000),
    priorityChanges: keepLatestPerOwner(store.priorityChanges, "created_at", "updated_at", 80, 3000),
    lageChecks: keepLatestPerOwner(store.lageChecks, "checkedAt", "createdAt", 10, 1000),
    pushSubscriptions: sortByDate(store.pushSubscriptions, "updatedAt", "createdAt").slice(0, 300),
    pushEvents: sortByDate(store.pushEvents, "createdAt").slice(0, 200),
    pipelineDebugReports: keepLatestPerOwner(store.pipelineDebugReports, "createdAt", "createdAt", 2, 200)
  };
}

// --- Separater, KLEINER Auth-Store ---
// Performance-kritisch: Accounts/Sessions liegen in einem EIGENEN Dokument (eigene
// Store-Row bzw. eigene lokale Datei), getrennt vom grossen Content-Blob. Sonst
// muesste jeder Login den mehrere MB grossen Haupt-Store komplett lesen + schreiben
// (auf Serverless laeuft das ins Funktions-Zeitlimit). So bleibt Login schnell.
const authStoreId = process.env.HELMUT_SUPABASE_AUTH_STORE_ID || `${supabaseStoreId}-auth`;
const authDataFile = path.join(dataDir, "auth.json");

function defaultAuthStore() {
  return {
    users: [],
    sessions: [],
    assignments: [],
    dailyInputs: [],
    auditEvents: [],
    systemErrors: [],
    // LLM-Nutzung (Kosten/Token je Call). Bewusst im KLEINEN Auth-Store, damit
    // nicht bei jedem Log-Eintrag der mehrere MB grosse Haupt-Blob geschrieben wird.
    llmUsage: [],
    // Pipeline-Locks: verhindert parallele Crawl-/Briefing-Laeufe (key = jobName, value = { lockedAt, expiresAt }).
    pipelineLocks: {},
    adminSettings: {},
    // Letzter manueller Admin-Recovery-Understanding-Lauf (Metadaten fuer die Anzeige,
    // ueberlebt Reload/Function-Kill). Nur Zahlen/Status/kurzer Grund — keine Rohtexte.
    adminRecoveryLastRun: null,
    // P0-1: Prozess-Laufzeit-Telemetrie (Understanding-Batch, Briefing-Aufbau,
    // Lage-Fold). Bewusst im KLEINEN Auth-Store (Muster adminRecoveryLastRun),
    // NICHT im grossen Content-Blob — sonst waechst der 1,24-MB-Monolith weiter
    // (Audit R1, Timeout-Quelle). Ausschliesslich technische Skalare/Zaehler —
    // keine Dokumentinhalte, keine Namen, keine Kontaktdaten (DSGVO-Datensparsamkeit).
    processRuns: [],
    // P1-4: Retry-Zähler fehlgeschlagener Wissensobjekte (vorgangId -> Anzahl),
    // damit der Auto-Retry BEGRENZT ist (kein Endlos-Retry, keine Schema-Migration).
    understandingRetries: {}
  };
}

async function readAuthStore() {
  if (useSupabase()) {
    const rows = await supabaseRequest(`/rest/v1/helmut_store?id=eq.${encodeURIComponent(authStoreId)}&select=data`);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row?.data) return { ...defaultAuthStore(), ...row.data };
    return defaultAuthStore();
  }
  if (!fs.existsSync(authDataFile)) return defaultAuthStore();
  try {
    return { ...defaultAuthStore(), ...JSON.parse(fs.readFileSync(authDataFile, "utf8")) };
  } catch (error) {
    console.error("Helmut auth store read failed", error);
    return defaultAuthStore();
  }
}

async function writeAuthStore(store) {
  const normalized = { ...defaultAuthStore(), ...store };
  normalized.sessions = (normalized.sessions || []).slice(0, 2000);
  normalized.auditEvents = (normalized.auditEvents || []).slice(0, 1000);
  normalized.systemErrors = (normalized.systemErrors || []).slice(0, 500);
  normalized.dailyInputs = (normalized.dailyInputs || []).slice(0, 2000);
  normalized.llmUsage = (normalized.llmUsage || []).slice(0, 5000);
  // P0-1: Prozess-Laufzeit-Ring gedeckelt halten (kleiner Auth-Store).
  normalized.processRuns = (normalized.processRuns || []).slice(0, 300);
  if (useSupabase()) {
    await supabaseRequest("/rest/v1/helmut_store", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: authStoreId, data: normalized })
    });
    return normalized;
  }
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(authDataFile, JSON.stringify(normalized, null, 2));
  return normalized;
}

// --- Quellenmodus-Shadow: letzter Production-Messlauf (kompakt, Auth-Store) --
// Persistiert den kompakten Shadow-Messbericht eines echten Crawl-Laufs (Muster wie
// adminRecoveryLastRun): überlebt Function-Kill/Reload, wird im Admin angezeigt und ist
// per SQL auslesbar. Nur Kennzahlen/IDs — keine Inhalte. Fail-safe beim Aufrufer.
async function saveSourceModeShadowRun(report = {}) {
  const store = await readAuthStore();
  const kompakt = JSON.parse(JSON.stringify(report));
  // Leitplanke: Listen deckeln, damit der kleine Auth-Store klein bleibt.
  if (kompakt.vergleich) {
    kompakt.vergleich.nurAlt = (kompakt.vergleich.nurAlt || []).slice(0, 20);
    kompakt.vergleich.nurRelational = (kompakt.vergleich.nurRelational || []).slice(0, 20);
  }
  if (kompakt.alt) kompakt.alt.fehlerQuellen = (kompakt.alt.fehlerQuellen || []).slice(0, 10);
  if (kompakt.relational) kompakt.relational.fehlerQuellen = (kompakt.relational.fehlerQuellen || []).slice(0, 10);
  await writeAuthStore({ ...store, sourceModeShadowLastRun: { ...kompakt, savedAt: new Date().toISOString() } });
  return store.sourceModeShadowLastRun || null;
}

async function getSourceModeShadowLastRun() {
  const store = await readAuthStore();
  return store.sourceModeShadowLastRun || null;
}

// --- Globale Dedup + Fundstellen (Cutover-Schreibpfad, Quellenmodus 'on') ----
// Persistiert einen Crawl-Batch mit globaler Deduplizierung: 1 Artikel ueber n Wege ->
// 1 raw_document + n document_findings; Treffer gegen den BESTAND (content_fingerprint/
// canonical_target_url, letzte 14 Tage) erzeugen KEIN neues Dokument, nur Fundstellen +
// finding_count-Erhoehung. Wird AUSSCHLIESSLICH vom Quellenmodus 'on' aufgerufen
// (source-mode.js, Cutover — freigabepflichtig); off/shadow beruehren diesen Pfad nie.
// Fail-safe: jeder Teilschritt schluckt Fehler einzeln — ein Dedup-/Findings-Fehler
// darf den Crawl nie brechen (schlimmstenfalls fehlt eine Fundstelle).
//
// KAPAZITAETSBEFUND F-RT (Production 2026-08-03, Lauf `cron-pipeline-20260803160002-xm71n`):
// dieser Schreibpfad war die HAUPTURSACHE dafuer, dass der globale Abruf sein Zeitbudget
// gesprengt hat. Er schickte je Dokument einen EIGENEN Round-Trip an PostgREST — gemessen
// 616 Einzel-Upserts in 89,89 s plus ~108 x (GET+PATCH) fuer `finding_count` in 34,85 s,
// zusammen 834 Requests / 124,74 s = 46,7 % eines 267-s-Laufs, bei ~149,6 ms je Round-Trip.
// Beide Schleifen sind deshalb gebuendelt. Die FACHLICHE Wirkung ist unveraendert: es werden
// dieselben Zeilen mit denselben Werten geschrieben, nur in wenigen Anfragen statt in
// hunderten. Der Dedup-Plan, die Fundstellen und die Bestandslogik sind unberuehrt.
async function persistRawDocumentsDeduped(items = []) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  const { planDedupWrites } = require("./quellenarchitektur/dedup-global");
  let existing = [];
  try {
    existing = await supabaseRequest(
      "/rest/v1/raw_documents?select=id,content_fingerprint,canonical_target_url" +
      `&created_at=gte.${encodeURIComponent(new Date(Date.now() - 14 * 86400000).toISOString())}&limit=5000`
    );
  } catch (error) {
    console.error("[dedup] Bestandsabruf fehlgeschlagen (Batch wird ohne Bestands-Match persistiert):", error.message);
  }
  const plan = planDedupWrites(items, Array.isArray(existing) ? existing : []);

  const zuSchreiben = plan.persists.map((doc) => {
    const row = {
      ...doc,
      canonical_target_url: doc.canonical_url || null,
      publisher_id: doc.publisher_domain ? `publisher-${doc.publisher_domain}` : null,
      source_id: doc.primary_source_id || doc.source_id || null
    };
    delete row.findings; delete row.publisher_domain; delete row.primary_source_id;
    return row;
  });
  const schreiben = await saveRawDocumentsGebuendelt(zuSchreiben);

  let findingsWritten = 0;
  if (plan.findings.length) {
    try {
      const rows = plan.findings.slice(0, 2000).map((f) => ({
        raw_document_id: f.raw_document_id,
        source_id: f.source_id || "unbekannt",
        retrieval_path_id: f.retrieval_path_id || null,
        original_url: f.original_url || "",
        link_type: f.link_type || null,
        found_at: f.found_at || null
      }));
      await supabaseRequest("/rest/v1/document_findings?on_conflict=raw_document_id,source_id,original_url", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify(rows)
      });
      findingsWritten = rows.length;
    } catch (error) {
      console.error("[dedup] Fundstellen-Write fehlgeschlagen (ignoriert):", error.message);
    }
  }

  const zaehler = await erhoeheFindingCounts(plan.countIncrements);

  return {
    persisted: schreiben.persisted,
    zusammengefuehrt: items.length - plan.persists.length,
    fundstellen: findingsWritten,
    bestandsTreffer: Object.keys(plan.countIncrements).length,
    // Beleg statt Behauptung: wie viele Round-Trips dieser Batch wirklich gebraucht hat.
    // Genau diese Zahl ist in Production entgleist (834) und wird jetzt mitgeschrieben.
    schreibAnfragen: 1 + schreiben.anfragen + (plan.findings.length ? 1 : 0) + zaehler.anfragen,
    einzelnNachgezogen: schreiben.einzeln,
    zaehlerAktualisiert: zaehler.aktualisiert,
    zaehlerVerfehlt: zaehler.verfehlt.length
  };
}

// Groesse eines Bulk-Blocks. Klein genug fuer eine berechenbare Anfrage, gross genug, damit
// ein voller Crawl-Batch (Production: 616 neue Dokumente) in wenige Anfragen passt.
const RAW_DOCUMENT_BULK_CHUNK = Math.max(1, Number(process.env.HELMUT_RAW_DOCUMENT_BULK_CHUNK) || 200);

// Bulk-Upsert der neuen Rohdokumente.
//
// SPALTENGLEICHHEIT: PostgREST verlangt in EINEM Bulk-Body identische Schluesselmengen. Zeilen
// werden deshalb nach ihrer Spaltensignatur gruppiert, statt fehlende Spalten mit `null`
// aufzufuellen — sonst wuerde ein `merge-duplicates`-Upsert eine vorhandene Spalte eines
// bestehenden Dokuments mit `null` UEBERSCHREIBEN. Der Einzel-Upsert hat das nie getan, und
// dieser Pfad tut es auch nicht.
//
// FEHLERVERHALTEN unveraendert: schlaegt ein Block fehl (eine einzelne unbrauchbare Zeile
// reisst in PostgREST den ganzen Block mit), wird GENAU DIESER Block einmal einzeln
// nachgezogen. Damit bleibt die bisherige Robustheit erhalten: eine kaputte Zeile kostet die
// uebrigen nicht.
async function saveRawDocumentsGebuendelt(rows = []) {
  const liste = (Array.isArray(rows) ? rows : []).filter((row) => row && row.id);
  let persisted = 0;
  let anfragen = 0;
  let einzeln = 0;
  const gruppen = new Map();
  for (const row of liste) {
    const spalten = pickColumns(row, V3_RAW_DOCUMENT_COLUMNS);
    const signatur = Object.keys(spalten).sort().join("|");
    if (!gruppen.has(signatur)) gruppen.set(signatur, []);
    gruppen.get(signatur).push({ row, spalten });
  }
  for (const gruppe of gruppen.values()) {
    for (let i = 0; i < gruppe.length; i += RAW_DOCUMENT_BULK_CHUNK) {
      const block = gruppe.slice(i, i + RAW_DOCUMENT_BULK_CHUNK);
      try {
        anfragen += 1;
        await supabaseRequest("/rest/v1/raw_documents?on_conflict=id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(block.map((b) => b.spalten))
        });
        persisted += block.length;
      } catch (error) {
        console.error(`[v3Store] raw_documents Bulk-Upsert fehlgeschlagen (${block.length} Zeilen,`
          + ` Einzelfallback): ${error.message}`);
        for (const b of block) {
          anfragen += 1;
          einzeln += 1;
          const res = await saveRawDocument(b.row);
          if (res && res.saved) persisted += 1;
        }
      }
    }
  }
  return { persisted, anfragen, einzeln };
}

// `finding_count` der Bestandstreffer erhoehen — gebuendelt UND BEDINGT.
//
// CLAUDE.md §4.10: Lesen -> Aendern -> Schreiben ohne Bedingung ist auf gemeinsam genutztem
// Zustand verboten. Der bisherige Pfad tat genau das (je Dokument `select finding_count`,
// danach `PATCH finding_count = gelesen + inc`) und haette einen parallelen Lauf
// stillschweigend ueberschrieben. Hier wird deshalb nach (gelesener Stand, Zuwachs)
// gruppiert: alle Dokumente einer Gruppe bekommen denselben neuen Wert unter derselben
// Bedingung `finding_count=eq.<gelesener Stand>`. Das ist ein echtes Compare-and-Set —
// eine Zeile, die inzwischen ein anderer Lauf veraendert hat, wird NICHT getroffen und
// NICHT ueberschrieben. Sie wird gezaehlt und benannt statt still verloren.
const FINDING_COUNT_CHUNK = Math.max(1, Number(process.env.HELMUT_FINDING_COUNT_CHUNK) || 100);

function inFilterWert(id) {
  return `"${String(id).replace(/"/g, '""')}"`;
}

async function erhoeheFindingCounts(countIncrements = {}) {
  const ids = Object.keys(countIncrements || {});
  if (!ids.length) return { aktualisiert: 0, verfehlt: [], anfragen: 0 };
  let anfragen = 0;
  const gelesen = new Map();
  for (let i = 0; i < ids.length; i += FINDING_COUNT_CHUNK) {
    const teil = ids.slice(i, i + FINDING_COUNT_CHUNK);
    try {
      anfragen += 1;
      const rows = await supabaseRequest(
        `/rest/v1/raw_documents?id=in.(${teil.map(inFilterWert).join(",")})&select=id,finding_count`
      );
      for (const r of Array.isArray(rows) ? rows : []) gelesen.set(String(r.id), Number(r.finding_count) || 0);
    } catch (error) {
      console.error("[dedup] finding_count-Lesen fehlgeschlagen (ignoriert):", error.message);
    }
  }

  const gruppen = new Map();
  for (const id of ids) {
    if (!gelesen.has(id)) continue;
    const stand = gelesen.get(id);
    const inc = Number(countIncrements[id]) || 0;
    const key = `${stand}|${inc}`;
    if (!gruppen.has(key)) gruppen.set(key, { stand, neu: stand + inc, ids: [] });
    gruppen.get(key).ids.push(id);
  }

  let aktualisiert = 0;
  const verfehlt = [];
  for (const gruppe of gruppen.values()) {
    for (let i = 0; i < gruppe.ids.length; i += FINDING_COUNT_CHUNK) {
      const teil = gruppe.ids.slice(i, i + FINDING_COUNT_CHUNK);
      try {
        anfragen += 1;
        const rows = await supabaseRequest(
          `/rest/v1/raw_documents?id=in.(${teil.map(inFilterWert).join(",")})`
          + `&finding_count=eq.${gruppe.stand}&select=id`,
          {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({ finding_count: gruppe.neu })
          }
        );
        const getroffen = new Set((Array.isArray(rows) ? rows : []).map((r) => String(r && r.id)));
        aktualisiert += getroffen.size;
        for (const id of teil) if (!getroffen.has(id)) verfehlt.push(id);
      } catch (error) {
        console.error("[dedup] finding_count-Update fehlgeschlagen (ignoriert):", error.message);
        verfehlt.push(...teil);
      }
    }
  }
  if (verfehlt.length) {
    console.warn(`[dedup] finding_count: ${verfehlt.length} von ${ids.length} Dokumenten nicht erhoeht`
      + " (Bedingung nicht mehr erfuellt oder Zeile nicht gefunden) — kein Wert ueberschrieben.");
  }
  return { aktualisiert, verfehlt, anfragen };
}

// --- Quellenarchitektur: relationale Zeilen (read-only) ---------------------
// Lädt die vier Quellenarchitektur-Tabellen für Crawl-Plan/Vergleich/Admin-Report.
// NUR Supabase-Backend; lokal/ohne Konfiguration -> null (Aufrufer fällt auf den
// alten Katalog bzw. auf Seeds zurück — ehrlich als "nicht verfügbar" markierbar).
async function listSourceArchitectureRows() {
  if (!useSupabase()) return null;
  const [publishers, retrievalPaths, packages, packagePaths, geographies] = await Promise.all([
    supabaseRequest("/rest/v1/publishers?select=*&limit=1000"),
    supabaseRequest("/rest/v1/retrieval_paths?select=*&limit=2000"),
    supabaseRequest("/rest/v1/source_packages?select=*&limit=500"),
    supabaseRequest("/rest/v1/package_paths?select=*&limit=5000"),
    // Punkt 18: nur fuer LESBARE Regionsnamen in der Paket-Inventur (geo-land-berlin
    // -> "Berlin"). Rein additiv; faellt der Aufruf aus, bleibt die Region die ID.
    supabaseRequest("/rest/v1/geographies?select=id,level,name,parent_id&limit=2000").catch(() => [])
  ]);
  return {
    publishers: Array.isArray(publishers) ? publishers : [],
    retrievalPaths: Array.isArray(retrievalPaths) ? retrievalPaths : [],
    packages: Array.isArray(packages) ? packages : [],
    packagePaths: Array.isArray(packagePaths) ? packagePaths : [],
    geographies: Array.isArray(geographies) ? geographies : []
  };
}

// --- Gate-Shadow-Telemetrie (gate_shadow_events) ---------------------------
// Schreibt die Understanding-Gate-Shadow-Entscheidungen (nur Signale/IDs, KEIN
// Volltext/PII) in die Production-Tabelle gate_shadow_events (RLS service_role-only).
// NUR im Supabase-Backend; lokal ein No-op. Der Aufrufer (understanding.js) kapselt
// den Aufruf fail-safe — ein Telemetrie-Fehler darf das Understanding NIE beeinflussen.
const GATE_SHADOW_EVENT_FIELDS = Object.freeze([
  "raw_document_id", "source_id", "package_id", "tier", "gate_decision", "gate_reason",
  "political_signals", "amtlich", "geografie", "document_type", "vorgang_id",
  "understanding_result", "knowledge_object_id", "estimated_cost_usd", "model"
]);

async function recordGateShadowEvents(rows) {
  const list = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && typeof r === "object" && typeof r.gate_decision === "string" && r.gate_decision)
    .slice(0, 500) // Leitplanke: begrenzt Payload je Lauf; Ueberhang wird im Aggregat-Log sichtbar
    .map((r) => {
      const out = {};
      for (const f of GATE_SHADOW_EVENT_FIELDS) { if (r[f] !== undefined) out[f] = r[f]; }
      return out;
    });
  if (!list.length) return { written: 0, reason: "keine-zeilen" };
  if (!useSupabase()) return { written: 0, reason: "local-backend-keine-telemetrie" };
  await supabaseRequest("/rest/v1/gate_shadow_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(list)
  });
  return { written: list.length };
}

// --- LLM-Kosten-/Token-Logging -------------------------------------------
// Preise in USD pro 1 Mio. Token (Schaetzwerte, per HELMUT_LLM_PRICE_JSON
// ueberschreibbar). Unbekanntes Modell -> estimatedCost = "unknown".
//
// KOSTENWAHRHEIT (Punkt 17): Diese Zahlen sind SCHAETZWERTE ohne belegte
// Herkunft — sie stehen seit ihrer Einfuehrung unveraendert im Code, ohne
// Preisquelle und ohne Stand. Sie werden hier BEWUSST NICHT geaendert (eine
// Preisrecherche ist nicht Teil dieses Sprints, und ein aus dem Gedaechtnis
// gesetzter Preis waere schlechter als ein deklarierter Schaetzwert). Stattdessen
// traegt jede daraus berechnete Kostenangabe ab sofort ihre Herkunft mit:
// llmPriceProvenance() sagt, worauf der Betrag beruht. Solange die Herkunft
// 'unbelegt-schaetzwert' ist, darf der Betrag im Betriebsbericht nur als
// BERECHNET, nicht als tatsaechliche Providerkosten erscheinen.
//
// Belegt wird die Preisbasis vom Betreiber, nicht vom Code:
//   HELMUT_LLM_PRICE_JSON    = {"gpt-5-mini":{"in":0.25,"out":2.0}}  (Preise)
//   HELMUT_LLM_PRICE_SOURCE  = "OpenAI-Rechnung 2026-07, Pos. 3"     (Herkunft)
//   HELMUT_LLM_PRICE_ASOF    = "2026-07-01"                          (Stand)
// Erst wenn HELMUT_LLM_PRICE_SOURCE gesetzt ist, gilt die Preisbasis als belegt.
const LLM_PRICE_DEFAULTS = Object.freeze({
  "gpt-5-mini": { in: 0.25, out: 2.0 },
  "gpt-5.5": { in: 1.25, out: 10.0 },
  "gpt-4.1": { in: 2.0, out: 8.0 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 }
});

function llmPriceOverride() {
  try {
    const raw = process.env.HELMUT_LLM_PRICE_JSON;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null; // ungueltiges JSON ignorieren, Defaults nutzen
  }
}

function llmPriceTable() {
  const override = llmPriceOverride();
  return override ? { ...LLM_PRICE_DEFAULTS, ...override } : { ...LLM_PRICE_DEFAULTS };
}

// Herkunft der Preisbasis — begleitet JEDE Kostenangabe im Betriebsbericht.
// waehrung ist USD, weil die Preistabelle in USD/1 Mio. Token gefuehrt wird;
// es findet KEINE Umrechnung statt (ein ungepruefter Wechselkurs waere eine
// zweite erfundene Groesse).
function llmPriceProvenance() {
  const override = llmPriceOverride();
  const quelle = String(process.env.HELMUT_LLM_PRICE_SOURCE || "").trim();
  const stand = String(process.env.HELMUT_LLM_PRICE_ASOF || "").trim();
  const belegt = Boolean(quelle);
  return {
    waehrung: "USD",
    herkunft: belegt ? "belegt" : "unbelegt-schaetzwert",
    quelle: quelle || null,
    stand: stand || null,
    ueberschrieben: Boolean(override),
    modelle: Object.keys(llmPriceTable()).sort(),
    hinweis: belegt
      ? "Preisbasis ist vom Betreiber belegt (HELMUT_LLM_PRICE_SOURCE)."
      : "Preisbasis ist ein unbelegter Schaetzwert im Code. Betraege sind BERECHNET, nicht vom Provider gemeldet — als Groessenordnung belastbar, nicht als Rechnungsbetrag."
  };
}

function numOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function estimateLlmCost(model, promptTokens, completionTokens) {
  const price = llmPriceTable()[model];
  if (!price || promptTokens == null || completionTokens == null) return null;
  const cost = (promptTokens / 1e6) * price.in + (completionTokens / 1e6) * price.out;
  return Math.round(cost * 1e6) / 1e6; // auf 6 Nachkommastellen (USD)
}

// Baut EINEN Kostenlog-Eintrag aus einem Call-Meta-Objekt — REINE Funktion (kein I/O,
// kein Zufall/Zeit ausser explizit), damit sie offline testbar ist und recordLlmUsage
// nur noch persistiert. Fehlt der usage-Block, werden Token/Kosten als "unknown"
// protokolliert (nie stiller Verlust).
//
// SaaS-Fundament (mandantenfaehig, KEINE tenant-spezifische Sonderlogik): der Eintrag
// traegt zusaetzlich tenantId/profileId/runId/pipelineStep. Alle optional -> fehlt eines,
// wird es null (bzw. pipelineStep faellt auf den callType zurueck, der de facto der
// Pipeline-Schritt ist). Bestehende Felder bleiben UNVERAENDERT (rueckwaertskompatibel).
//
// WICHTIG (Kostentrennung): dieser Eintrag ist INTERN. estimatedCost/Token duerfen NIE
// in den Helmut-Tab / CurrentHelmutState fuer Abgeordnete gelangen — llmUsage liegt im
// separaten Auth-Store und wird ausschliesslich von Admin-/Kosten-Reports gelesen.
function buildLlmUsageRecord(entry = {}, opts = {}) {
  const usage = entry.usage || {};
  const promptTokens = numOrNull(usage.input_tokens ?? usage.prompt_tokens);
  const completionTokens = numOrNull(usage.output_tokens ?? usage.completion_tokens);
  const totalFromParts = promptTokens != null && completionTokens != null ? promptTokens + completionTokens : null;
  const totalTokens = numOrNull(usage.total_tokens) ?? totalFromParts;
  const model = entry.model || "unknown";
  const estimatedCost = estimateLlmCost(model, promptTokens, completionTokens);
  const callType = entry.callType || "unknown";
  const id = opts.id || `llm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = opts.createdAt || new Date().toISOString();
  const trim = (v) => (v == null ? null : String(v).slice(0, 120));
  return {
    id,
    createdAt,
    // SaaS-Kontext (alle optional, mandantenfaehig):
    tenantId: trim(entry.tenantId) || null,
    profileId: trim(entry.profileId ?? entry.politicianId ?? entry.userId) || null,
    runId: trim(entry.runId) || null,
    pipelineStep: trim(entry.pipelineStep ?? callType) || "unknown",
    // Quellenarchitektur-Zuordnung (Sprint 7, alle optional, rueckwaertskompatibel):
    // erlauben die Kostenzuordnung je Abrufweg/Paket/Vorgang. Fehlt eines -> null
    // (dann ist die Kosten-Zuordnung fuer diesen Eintrag "nicht zuordenbar" statt erfunden).
    // vorgangId reicht office.js bereits durch (wurde bisher verworfen).
    sourceId: trim(entry.sourceId ?? entry.legacySourceId ?? entry.retrievalPathId) || null,
    packageId: trim(entry.packageId) || null,
    vorgangId: trim(entry.vorgangId) || null,
    knowledgeObjectId: trim(entry.knowledgeObjectId ?? entry.koId) || null,
    // Bestehende Felder (unveraendert):
    politicianId: entry.politicianId || null,
    userId: entry.userId || entry.politicianId || null,
    model,
    callType,
    promptTokens: promptTokens ?? "unknown",
    completionTokens: completionTokens ?? "unknown",
    totalTokens: totalTokens ?? "unknown",
    estimatedCost: estimatedCost ?? "unknown",
    durationMs: numOrNull(entry.durationMs) ?? "unknown",
    success: entry.success !== false,
    error: entry.error ? String(entry.error).slice(0, 300) : null
  };
}

// Schreibt genau EINEN Log-Eintrag pro LLM-Call.
// Loggen darf die App nie zum Absturz bringen -> alles in try/catch.
async function recordLlmUsage(entry = {}) {
  try {
    const record = buildLlmUsageRecord(entry);
    const store = await readAuthStore();
    store.llmUsage = [record, ...(store.llmUsage || [])];
    await writeAuthStore(store);
    return record;
  } catch (_) {
    return null; // Logging-Fehler duerfen den LLM-Pfad nicht beeintraechtigen
  }
}

async function getLlmUsage(politicianId = null, limit = 200) {
  const store = await readAuthStore();
  const all = Array.isArray(store.llmUsage) ? store.llmUsage : [];
  const filtered = politicianId ? all.filter((e) => e.politicianId === politicianId || e.userId === politicianId) : all;
  return filtered.slice(0, Math.max(0, limit));
}

// --- LLM-Budget / Kostenkontrolle -------------------------------------------
// Fundament fuer Datenmotor V2: leitet aus dem VORHANDENEN llmUsage-Log eine
// Tages-Aggregation ab und stellt ein Pre-Call-Gate bereit. Rein additiv —
// solange niemand canSpendLlm() aufruft, aendert sich am Verhalten nichts.

// Grenzwerte kommen aus Env-Variablen.
// AUDIT-FIX 2026-07 (fail-closed), verschaerft im Budget-Rollout: es gibt KEINEN
// Infinity-Pfad mehr. Frueher fiel ein ungueltiger Wert (Tippfehler "2Oo",
// Einheiten) UND ein fehlender/geloeschter Wert still auf "kein Limit" zurueck —
// ein Vertipper ODER das versehentliche Loeschen der Vercel-Variable hob den
// Kostendeckel unbemerkt auf. Jetzt gilt: NUR eine positive ganze Zahl setzt das
// Limit; alles andere (fehlend, leer, 0, negativ, unparsebar) aktiviert das
// konservative Schutzlimit (einmalige Warnung im Log). Wer bewusst mehr will,
// setzt explizit eine hohe Zahl.
const LLM_LIMIT_FALLBACK = 50;
let warnedLlmLimitFallback = false;
function llmDailyCallLimit() {
  const rawStr = String(process.env.HELMUT_MAX_LLM_CALLS_PER_DAY ?? "").trim();
  const raw = Number(rawStr);
  if (rawStr !== "" && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  if (!warnedLlmLimitFallback) {
    warnedLlmLimitFallback = true;
    console.warn(`[llm-budget] HELMUT_MAX_LLM_CALLS_PER_DAY ist ${rawStr === "" ? "nicht gesetzt" : `ungueltig ("${rawStr.slice(0, 20)}")`} — Schutzlimit ${LLM_LIMIT_FALLBACK} Calls/Tag aktiv (fail-closed statt unbegrenzt).`);
  }
  return LLM_LIMIT_FALLBACK;
}

// Zaehlt dieser Eintrag NICHT gegen das Tagesbudget?
//   - "skipped-*": es fand gar kein Provideraufruf statt.
//   - Diagnosepfade: der Aufruf fand statt, zieht aber bewusst keine
//     Reservierung (cost-model.NICHT_RESERVIERENDE_CALLTYPES).
// Bewusst hier lokal und ohne harte Modulabhaengigkeit, damit ein Ladefehler des
// Kostenmodells das Budget-Gate niemals ausfallen laesst (fail-safe).
function isNonBudgetCallType(callType) {
  const ct = String(callType || "");
  if (ct.startsWith("skipped")) return true;
  try { return require("./cost-model").istNichtReservierend(ct); }
  catch (_) { return false; }
}

// Kalendertag (UTC) eines ISO-Zeitstempels, z. B. "2026-07-01".
function dayKey(iso) {
  const s = String(iso || "");
  return s.length >= 10 ? s.slice(0, 10) : "";
}

// Aggregiert die heutigen (bzw. fuer referenceIso angegebenen) LLM-Calls eines
// Mandats: Anzahl, davon erfolgreich, geschaetzte Kosten. referenceIso ist
// injizierbar, damit Tests deterministisch ohne Systemuhr laufen koennen.
async function getLlmUsageToday(politicianId = null, referenceIso = null) {
  const today = dayKey(referenceIso || new Date().toISOString());
  const store = await readAuthStore();
  const all = Array.isArray(store.llmUsage) ? store.llmUsage : [];
  const scoped = politicianId
    ? all.filter((e) => e.politicianId === politicianId || e.userId === politicianId)
    : all;
  const todays = scoped.filter((e) => dayKey(e.createdAt) === today);
  // "skipped-*"-Eintraege sind reine Info (kein echter LLM-Call) und zaehlen
  // NICHT gegen das Budget — sonst wuerde ein Skip das Budget weiter belasten.
  // Ebenso ausgenommen (Punkt-17-Review): Diagnosepfade, die per Konstruktion
  // KEINE Reservierung ziehen. Sie duerfen keinen Kopfraum verbrauchen, den sie
  // nie reserviert haben — sonst verweigert das Vorab-Gate echte Fachaufrufe
  // wegen einer Diagnose. Ihre KOSTEN zaehlen weiterhin voll (kostenwahrheit).
  const billable = todays.filter((e) => !isNonBudgetCallType(e.callType));
  const cost = billable.reduce((sum, e) => sum + (typeof e.estimatedCost === "number" ? e.estimatedCost : 0), 0);
  return {
    day: today,
    calls: billable.length,
    successfulCalls: billable.filter((e) => e.success !== false).length,
    estimatedCostUsd: Math.round(cost * 1e6) / 1e6
  };
}

// Kleiner Flag-Parser (1/true/on/yes = an). Lokal gehalten, damit storage.js
// keine zusaetzliche Abhaengigkeit bekommt.
function isFlagOn(value) {
  return ["1", "true", "on", "yes"].includes(String(value || "").trim().toLowerCase());
}

// V3-Vorbereitung (C1), Default AUS: Soll der Budget-Check im FEHLERFALL
// fail-CLOSED sein (KI-Call verweigern) statt fail-OPEN? Standard bleibt
// fail-open, damit ein Storage-Problem die bestehende App nicht lahmlegt. Erst
// wenn V3 die geteilten, teuren Understanding-Calls fahrt, wird per Flag scharf
// geschaltet (dann kostet ein Storage-Fehler lieber ein uebersprungenes Briefing
// als eine unkontrollierte KI-Rechnung).
function llmBudgetFailClosed() {
  return isFlagOn(process.env.HELMUT_LLM_BUDGET_FAIL_CLOSED);
}

// Budget-Ergebnis, wenn die Nutzungsabfrage SELBST fehlschlaegt.
// Flag AUS -> allowed:true  (fail-open, bisheriges Verhalten, unveraendert).
// Flag AN  -> allowed:false (fail-closed).
function llmBudgetFailResult(limit) {
  const failClosed = llmBudgetFailClosed();
  return {
    allowed: !failClosed,
    used: null,
    limit: Number.isFinite(limit) ? limit : null,
    remaining: null,
    reason: failClosed ? "budget-check-failed-closed" : "budget-check-failed-open"
  };
}

// Pre-Call-Gate: Darf fuer dieses Mandat heute noch ein LLM-Call laufen?
// Gibt IMMER ein Objekt zurueck (nie throw) — der Aufrufer entscheidet, ob er
// bei allowed=false auf den Regelmotor zurueckfaellt. Fehlerfall: siehe
// llmBudgetFailResult (Default fail-OPEN, per Flag HELMUT_LLM_BUDGET_FAIL_CLOSED
// fail-CLOSED). Das Standardverhalten ist identisch zu vorher.
async function canSpendLlm(politicianId = null, referenceIso = null) {
  const limit = llmDailyCallLimit();
  try {
    const usage = await getLlmUsageToday(politicianId, referenceIso);
    const allowed = usage.calls < limit;
    return {
      allowed,
      used: usage.calls,
      limit: Number.isFinite(limit) ? limit : null,
      remaining: Number.isFinite(limit) ? Math.max(0, limit - usage.calls) : null,
      reason: allowed ? null : "daily-llm-budget-reached"
    };
  } catch (_) {
    return llmBudgetFailResult(limit);
  }
}

// Vollstaendige, ehrliche Tages-Budget-Sicht fuer den Admin (Phase 8).
// WICHTIG — Zeitzone: Die Tagesgrenze ist der UTC-KALENDERTAG (dayKey), exakt das
// Fenster, das auch das Budget-Gate (canSpendLlm/reserveLlmCall) nutzt. Eine
// Berliner Tagesgrenze in der ANZEIGE wuerde ueber das Gate luegen (das Gate setzt
// um 00:00 UTC zurueck = 02:00 Berliner Sommerzeit / 01:00 Winterzeit). Die
// bestehende "Heute"-Statistik (getAdminStatsCosts days=1) misst dagegen ein
// ROLLIERENDES 24h-Fenster — fuer Kostentrends ok, fuer den Budgetstand falsch.
// Skips (callType skipped-*) und Fehler (success=false) werden GETRENNT
// ausgewiesen: nur echte Calls zaehlen gegen das Budget, aber der Admin soll
// sehen, wie oft Pfade uebersprungen wurden und wie oft Calls scheiterten.
// Aggregiert ueber das VOLLE Log (Cap 5000 Eintraege beim Schreiben) — kein
// 500er-Anzeige-Cap wie frueher.
async function getLlmUsageBreakdownToday(referenceIso = null, deps = {}) {
  const readAuth = deps.readAuth || readAuthStore;
  const today = dayKey(referenceIso || new Date().toISOString());
  const store = await readAuth();
  const all = Array.isArray(store.llmUsage) ? store.llmUsage : [];
  const todays = all.filter((e) => dayKey(e.createdAt) === today);
  // Gleiche Abgrenzung wie im Gate (isNonBudgetCallType): was keine Reservierung
  // zieht, verbraucht auch keinen angezeigten Kopfraum. Die KOSTEN dieser Aufrufe
  // bleiben im kostenwahrheit-Block unten vollstaendig enthalten.
  const isSkip = (e) => isNonBudgetCallType(e.callType);
  const billable = todays.filter((e) => !isSkip(e));
  const skips = todays.filter(isSkip);
  const errors = billable.filter((e) => e.success === false);
  const costOf = (list) => Math.round(list.reduce((s, e) => s + (typeof e.estimatedCost === "number" ? e.estimatedCost : 0), 0) * 1e6) / 1e6;

  const byCallType = {};
  for (const e of billable) {
    const ct = String(e.callType || "unbekannt");
    if (!byCallType[ct]) byCallType[ct] = { calls: 0, errors: 0, estimatedCostUsd: 0 };
    byCallType[ct].calls += 1;
    if (e.success === false) byCallType[ct].errors += 1;
    if (typeof e.estimatedCost === "number") byCallType[ct].estimatedCostUsd += e.estimatedCost;
  }
  for (const v of Object.values(byCallType)) v.estimatedCostUsd = Math.round(v.estimatedCostUsd * 1e6) / 1e6;

  const byTenant = {};
  for (const e of billable) {
    const tid = e.politicianId || e.userId || "(mandantenlos)";
    if (!byTenant[tid]) byTenant[tid] = { calls: 0, estimatedCostUsd: 0 };
    byTenant[tid].calls += 1;
    if (typeof e.estimatedCost === "number") byTenant[tid].estimatedCostUsd += e.estimatedCost;
  }
  for (const v of Object.values(byTenant)) v.estimatedCostUsd = Math.round(v.estimatedCostUsd * 1e6) / 1e6;

  const skipsByReason = {};
  for (const e of skips) {
    const reason = String(e.error || "unbekannt");
    skipsByReason[reason] = (skipsByReason[reason] || 0) + 1;
  }

  const limit = llmDailyCallLimit();
  // KOSTENWAHRHEIT (Punkt 17): die Altsummen oben (costOf/byCallType/byTenant)
  // rechnen einen unbekannten Betrag als 0 — sie bleiben unveraendert, damit
  // bestehende Anzeigen nicht brechen, sind aber NICHT die ehrliche Wahrheit.
  // Der Block `kostenwahrheit` trennt bekannt / unbekannt / kein Provideraufruf
  // und ist die Grundlage jeder neuen Anzeige. Fail-safe: ein Fehler in der
  // Aggregation darf die bestehende Budgetanzeige nie ausfallen lassen.
  let kostenwahrheit = null;
  try {
    const costModel = require("./cost-model");
    const agg = costModel.aggregiere(todays);
    kostenwahrheit = {
      ...agg,
      preisbasis: llmPriceProvenance(),
      budgetstatus: costModel.budgetStatus(billable.length, Number.isFinite(limit) ? limit : null),
      klartext: costModel.kostensatz(agg.gesamt)
    };
  } catch (_) { kostenwahrheit = null; }

  return {
    day: today,
    timezone: "UTC-Kalendertag (identisch zum Budget-Gate; Reset 00:00 UTC = 02:00 Berlin Sommer / 01:00 Winter)",
    limit: Number.isFinite(limit) ? limit : null,
    reserveUnderstanding: llmUnderstandingReserve() || 0,
    failClosed: llmBudgetFailClosed(),
    calls: billable.length,
    errors: errors.length,
    skips: skips.length,
    remaining: Number.isFinite(limit) ? Math.max(0, limit - billable.length) : null,
    estimatedCostUsd: costOf(billable),
    byCallType,
    byTenant,
    skipsByReason,
    kostenwahrheit
  };
}

// Kostenbericht je LAUF (Punkt 17). Bindeglied zwischen den drei bereits
// vorhandenen Telemetriequellen — es entsteht KEINE neue Tabelle:
//   processRuns            (Auth-Store) Laufkennung, Start/Ende, Dauer, Menge
//   llmUsage               (Auth-Store) Aufrufe, Tokens, berechnete Kosten
//   source_crawl_telemetry (Supabase)   Abrufwege, Dokumente je Lauf
//
// Zwei Zuordnungswege, in dieser Reihenfolge:
//   'laufkennung' — der Nutzungseintrag traegt runId. Exakt, ab sofort der
//                   Regelfall (die Laufkennung wird jetzt durchgereicht).
//   'zeitfenster' — Rekonstruktion ueber startedAt..finishedAt des Laufs. Noetig
//                   fuer den Altbestand (dort ist runId durchgehend null).
// Der Weg wird je Lauf ausgewiesen, damit eine rekonstruierte Zahl nie wie eine
// gemessene aussieht. Aufrufe ausserhalb jedes Laufzeitfensters bleiben
// ausdruecklich unzugeordnet, statt einem Lauf zugeschlagen zu werden.
// opts.readAuth: injizierbarer Store-Leser (nur fuer Tests — offline, ohne DB).
async function getRunCostReport(opts = {}) {
  const costModel = require("./cost-model");
  const limitRuns = Number.isFinite(Number(opts.limit)) ? Math.max(1, Number(opts.limit)) : 20;
  const readAuth = typeof opts.readAuth === "function" ? opts.readAuth : readAuthStore;
  const store = await readAuth();
  const usage = Array.isArray(store.llmUsage) ? store.llmUsage : [];
  // W-2: Laeufe ueber den Dual-Read (relational bevorzugt, Blob als Altbestand) —
  // sonst fehlen im Kostenreport genau die Laeufe, die der Blob per
  // Last-Write-Wins verloren hat. Injizierte readAuth (Tests) wird durchgereicht.
  const runs = await listProcessRuns({ limit: limitRuns }, { readAuth });

  const zeit = (v) => { const t = Date.parse(String(v || "")); return Number.isFinite(t) ? t : null; };
  // Objektreferenzen statt Ids: ein Eintrag OHNE Id wuerde sonst nie als
  // zugeordnet gelten und dauerhaft in "nicht zugeordnet" auftauchen.
  const zugeordnet = new Set();

  const laeufe = runs.map((run) => {
    const runId = run && run.runId ? String(run.runId) : null;
    const start = zeit(run && run.startedAt);
    const ende = zeit(run && run.finishedAt);
    const perRunId = runId ? usage.filter((e) => e && e.runId === runId) : [];
    const weg = perRunId.length ? "laufkennung" : "zeitfenster";
    // DOPPELZAEHLUNG: Zeitfenster von Laeufen koennen sich ueberlappen (heute
    // durch den globalen Understanding-Lock praktisch nicht, konstruktiv aber
    // sehr wohl — z. B. Briefing parallel zum Crawl). Ohne Sperre landete
    // derselbe Aufruf in ZWEI Laeufen und die Summe je Lauf waere zu hoch.
    // processRuns ist neueste-zuerst sortiert; der zeitlich naechstliegende Lauf
    // beansprucht einen Eintrag zuerst, spaetere Laeufe sehen ihn nicht mehr.
    // Der exakte Weg (Laufkennung) ist davon bewusst NICHT betroffen: eine
    // gemessene Zuordnung ist immer eindeutig und darf nie verdraengt werden.
    const treffer = perRunId.length
      ? perRunId
      : (start != null && ende != null
        ? usage.filter((e) => {
          if (zugeordnet.has(e)) return false;
          const t = zeit(e && e.createdAt);
          return t != null && t >= start && t <= ende;
        })
        : []);
    for (const e of treffer) zugeordnet.add(e);
    const agg = costModel.aggregiere(treffer);
    return {
      laufkennung: runId,
      lauftyp: (run && run.process) || null,
      modus: (run && run.mode) || null,
      start: (run && run.startedAt) || null,
      ende: (run && run.finishedAt) || null,
      dauerMs: Number.isFinite(Number(run && run.durationMs)) ? Number(run.durationMs) : null,
      status: (run && run.status) || null,
      verarbeiteteEinheiten: Number.isFinite(Number(run && run.processed)) ? Number(run.processed) : null,
      zuordnungsweg: weg,
      zuordnungExakt: weg === "laufkennung",
      kosten: agg
    };
  });

  // Ehrliche Restgroesse: Provideraufrufe im Beobachtungsfenster, die KEINEM
  // Lauf zugeordnet werden konnten (z. B. Aufrufe aus einem Nutzer-Request).
  const fensterStart = laeufe.reduce((min, l) => {
    const t = zeit(l.start); return t != null && (min == null || t < min) ? t : min;
  }, null);
  const unzugeordnet = usage.filter((e) => {
    const t = zeit(e && e.createdAt);
    if (t == null || fensterStart == null || t < fensterStart) return false;
    return !zugeordnet.has(e);
  });

  return {
    laeufe,
    nichtZugeordnet: costModel.aggregiere(unzugeordnet),
    preisbasis: llmPriceProvenance(),
    hinweis: "Ein Lauf mit zuordnungsweg='zeitfenster' ist REKONSTRUIERT, nicht gemessen: die Nutzungseintraege tragen keine Laufkennung und wurden ueber Start-/Endzeit zugeordnet."
  };
}

// Kostensumme eines Mandats seit einem Kalendertag (inklusive), z. B. Monatsbeginn.
// billable = ohne "skipped-*"-Info-Eintraege (wie getLlmUsageToday).
async function getLlmCostSince(politicianId = null, sinceDay = null, referenceIso = null) {
  const store = await readAuthStore();
  const all = Array.isArray(store.llmUsage) ? store.llmUsage : [];
  const scoped = politicianId
    ? all.filter((e) => e.politicianId === politicianId || e.userId === politicianId)
    : all;
  const from = String(sinceDay || "").slice(0, 10);
  const inWindow = scoped.filter((e) => {
    const d = dayKey(e.createdAt);
    if (!d) return false;
    return from ? d >= from : true;
  });
  const billable = inWindow.filter((e) => !String(e.callType || "").startsWith("skipped"));
  const cost = billable.reduce((sum, e) => sum + (typeof e.estimatedCost === "number" ? e.estimatedCost : 0), 0);
  return { calls: billable.length, estimatedCostUsd: Math.round(cost * 1e6) / 1e6 };
}

// Per-Mandant-Budget-Gate (Phase 10). Kombiniert den GLOBALEN Call-Count-Deckel
// (canSpendLlm) mit dem per-Profil-EUR-Deckel (Tag + Monat) aus dem Profil. Beide
// muessen "allowed" sein. Rueckwaertskompatibel: sind KEINE Profil-Budgets gesetzt
// (dailyBudgetCent/monthlyBudgetCent null), ist das Verhalten identisch zu
// canSpendLlm (nur der globale Deckel). Nie throw.
async function canSpendLlmForTenant(politicianId = null, budgets = {}, referenceIso = null, deps = {}) {
  const llmBudget = require("./llm-budget");
  const usageTodayFn = deps.usageToday || getLlmUsageToday;
  const costSinceFn = deps.costSince || getLlmCostSince;
  const canSpendFn = deps.canSpend || canSpendLlm;
  // GESAMTDECKEL (Budget-Rollout 2026-07): Der Call-Count-Deckel zaehlt GLOBAL
  // (politicianId=null => alle billable Calls aller Pfade/Mandanten), wie beim
  // Understanding. Vorher zaehlte er hier nur die MANDANTEN-eigenen Calls gegen
  // denselben Zahlwert — Buero/Lage und Understanding teilten damit KEINEN
  // echten gemeinsamen Topf (in unguenstiger Reihenfolge bis ~2x Limit). Die
  // EUR-Budgets darunter bleiben bewusst PRO Mandant.
  const global = await canSpendFn(null, referenceIso);
  const dailyBudgetCent = budgets && Number.isFinite(Number(budgets.dailyBudgetCent)) ? Number(budgets.dailyBudgetCent) : null;
  const monthlyBudgetCent = budgets && Number.isFinite(Number(budgets.monthlyBudgetCent)) ? Number(budgets.monthlyBudgetCent) : null;
  if (dailyBudgetCent == null && monthlyBudgetCent == null) {
    return { ...global, tenantBudget: { applied: false } };
  }
  let spentTodayUsd = null;
  let spentMonthUsd = null;
  try {
    const today = dayKey(referenceIso || new Date().toISOString());
    const monthStart = `${today.slice(0, 7)}-01`;
    const [dayCost, monthCost] = await Promise.all([
      usageTodayFn(politicianId, referenceIso),
      costSinceFn(politicianId, monthStart, referenceIso)
    ]);
    spentTodayUsd = dayCost.estimatedCostUsd;
    spentMonthUsd = monthCost.estimatedCostUsd;
  } catch (_) {
    spentTodayUsd = null; // unbekannt -> evaluateTenantBudget faellt fail-closed
    spentMonthUsd = null;
  }
  const tenant = llmBudget.evaluateTenantBudget({ dailyBudgetCent, monthlyBudgetCent, spentTodayUsd, spentMonthUsd });
  const allowed = Boolean(global.allowed) && Boolean(tenant.allowed);
  return {
    allowed,
    used: global.used,
    limit: global.limit,
    remaining: global.remaining,
    reason: !global.allowed ? global.reason : (!tenant.allowed ? tenant.reason : (tenant.warn ? tenant.reason : null)),
    warn: Boolean(tenant.warn),
    tenantBudget: tenant
  };
}

// --- Atomare LLM-Call-Reservierung (Race-Fix 2026-07) ------------------------
// BEFUND (belegt in Production): canSpendLlm ist reines Read-then-Decide ueber dem
// llmUsage-Log; der Log-Eintrag (recordLlmUsage) folgt erst NACH dem Modellaufruf.
// Parallele Requests lesen denselben alten Zaehlerstand und werden gleichzeitig
// freigegeben (bei Zaehlerstand 20 wurde 1 zusaetzlicher Call zugelassen; die
// theoretische Ueberschreitung waechst mit der Zahl paralleler Invocations).
// Verschaerfend: der Auth-Store ist EIN JSON-Dokument mit Voll-Upsert
// (last-write-wins) — parallele recordLlmUsage koennen sich gegenseitig Eintraege
// ueberschreiben, der Zaehler zaehlt dann sogar zu WENIG.
//
// FIX: Reservierung VOR dem Modellaufruf, atomar in Supabase (SQL-Funktion
// helmut_reserve_llm_call: EIN INSERT..ON CONFLICT..WHERE-Statement, Postgres
// serialisiert konkurrierende Upserts derselben (day,scope)-Zeile ueber den
// Row-Lock — korrekt ueber beliebig viele Server-Instanzen). Lokal (Datei-Modus,
// ein Prozess) genuegt ein in-Prozess serialisierter Zaehler. Durchgesetzt wird
// die Reservierung am EINZIGEN Modell-Callsite (ai.js requestOpenAI) — kein
// LLM-Pfad kann sie umgehen. Eine verbrauchte Reservierung wird bei Fehlschlag
// des Modellaufrufs BEWUSST nicht zurueckgegeben (konservativ: Retry-Stuerme
// koennen das Tagesbudget nicht umgehen; identisch zur bisherigen Zaehlung, die
// fehlgeschlagene Calls ebenfalls als billable zaehlt).
//
// Migration: supabase/migrations/20260717_llm_budget_reservation.sql (+ Runbook
// docs/betrieb/llm-budget-reservierung.md). Solange die Migration in Production
// NICHT eingespielt ist, faellt die Reservierung erkennbar (atomic:false, einmalige
// Warnung) auf das bisherige Read-then-Decide zurueck — der Merge ist dadurch
// unabhaengig von der Migrations-Freigabe deploybar.

// Prioritaetsklasse: Understanding (der geteilte Pipeline-Pfad) darf das volle
// Tageslimit nutzen; alle anderen Pfade (Buero, Kommunikation, Lage, App-Start,
// Backfills) nur limit - Reserve. So kann Buero Understanding nicht mehr
// aushungern (F5-Befund Punkt 10), ohne dass ein zweites Budget-System entsteht.
const LLM_PRIORITY_CALLTYPES = new Set(["understanding"]);

// ── Per-Mandant-Kostendeckel (Sprint-1-Sicherheit) ──────────────────────────
// Zusaetzlich zum GLOBALEN Notfalldeckel (llmDailyCallLimit) bekommt jeder Mandant
// einen eigenen atomaren Tageszaehler. Baut auf der bereits in Production
// vorhandenen SQL-Funktion helmut_reserve_llm_call(p_day, p_scope, p_max) auf
// (Migration 20260717) — deren scope-Parameter war exakt fuer 'tenant:<id>'
// vorgesehen. KEINE neue Migration noetig.
//
// SICHERHEIT / VERHALTENSNEUTRALITAET: Default AUS (HELMUT_TENANT_LLM_CAP leer).
// Solange der Deckel aus ist, verhaelt sich reserveLlmCall byte-identisch wie
// bisher (nur globaler Scope) — laufende Mandanten bleiben unberuehrt,
// bis der Betreiber den Deckel ausdruecklich freischaltet (Freigabepunkt).

// Bewusst mandantenlose/geteilte KI-Pfade: der GLOBALE Deckel regelt sie, sie
// bekommen KEINEN per-Mandant-Scope und loesen KEIN fail-closed aus, wenn kein
// Mandant vorliegt. Deckt ab: understanding (geteilter Pipeline-Pfad),
// understanding-* (staff-/presentation-Backfill) und koTagsBackfill (globaler
// Wissenskorpus). Alle anderen callTypes tragen einen Mandanten (siehe ai.js).
const TENANT_EXEMPT_CALLTYPES = new Set(["understanding", "koTagsBackfill"]);
function isSharedGlobalCallType(callType) {
  const ct = String(callType || "");
  return TENANT_EXEMPT_CALLTYPES.has(ct) || ct.startsWith("understanding-");
}

function tenantLlmCapEnabled() {
  return isFlagOn(process.env.HELMUT_TENANT_LLM_CAP);
}

// Sicheres Standardlimit je Mandant, wenn der Deckel aktiv ist, aber fuer den
// Mandanten nichts konfiguriert wurde. Konservativ (fail-closed-Geist): lieber ein
// niedriger Deckel als „unbegrenzt".
const TENANT_LLM_LIMIT_FALLBACK = 40;

// Per-Mandant-Overrides als JSON-Karte, z. B.
// HELMUT_TENANT_LLM_LIMITS='{"tenant-alpha":150,"tenant-beta":30}'. Ungueltiges JSON ->
// ignoriert (uniformer Default greift), einmalige Warnung.
let warnedTenantLimitJson = false;
function tenantLlmLimitsMap() {
  const raw = String(process.env.HELMUT_TENANT_LLM_LIMITS || "").trim();
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch (_) {
    if (!warnedTenantLimitJson) {
      warnedTenantLimitJson = true;
      console.warn("[llm-budget] HELMUT_TENANT_LLM_LIMITS ist kein gueltiges JSON — per-Mandant-Overrides ignoriert (uniformer Default greift).");
    }
    return {};
  }
}

// Uniformer Default fuer ALLE Mandanten (wenn keine JSON-Override vorliegt). Nur
// eine positive ganze Zahl zaehlt; alles andere -> null (dann greift der
// sichere Fallback).
function tenantLlmUniformDefault() {
  const rawStr = String(process.env.HELMUT_MAX_LLM_CALLS_PER_TENANT_PER_DAY ?? "").trim();
  const raw = Number(rawStr);
  if (rawStr !== "" && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return null;
}

// Aufgeloestes Tageslimit (Anzahl Calls) fuer EINEN Mandanten. Praezedenz:
//   expliziter Override (opts.override) > JSON-Map > uniformer Env-Default >
//   sicherer Fallback (TENANT_LLM_LIMIT_FALLBACK). Liefert IMMER eine positive Zahl,
//   sodass ein aktiver Deckel NIE versehentlich „unbegrenzt" bedeutet.
function tenantDailyCallLimit(politicianId, opts = {}) {
  if (opts.override != null && Number.isFinite(Number(opts.override)) && Number(opts.override) > 0) {
    return Math.floor(Number(opts.override));
  }
  const map = tenantLlmLimitsMap();
  const fromMap = map ? map[politicianId] : null;
  if (fromMap != null && Number.isFinite(Number(fromMap)) && Number(fromMap) > 0) {
    return Math.floor(Number(fromMap));
  }
  const uniform = tenantLlmUniformDefault();
  if (uniform != null) return uniform;
  return TENANT_LLM_LIMIT_FALLBACK;
}

// Reservierter Understanding-Mindestanteil (Anzahl Calls). Default 0 = aus, damit
// der Merge verhaltensneutral bleibt; Production-Empfehlung siehe Runbook
// (im selben Freigabeschritt wie HELMUT_MAX_LLM_CALLS_PER_DAY=100 setzen).
let warnedInvalidLlmReserve = false;
function llmUnderstandingReserve() {
  const rawStr = String(process.env.HELMUT_LLM_RESERVE_UNDERSTANDING ?? "").trim();
  if (rawStr === "" || rawStr === "0") return 0;
  const raw = Number(rawStr);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  if (!warnedInvalidLlmReserve) {
    warnedInvalidLlmReserve = true;
    console.warn("[llm-budget] HELMUT_LLM_RESERVE_UNDERSTANDING ist gesetzt, aber ungueltig — Reserve 0 aktiv (das Tageslimit selbst bleibt unberuehrt).");
  }
  return 0;
}

// Standard-RPC gegen die atomare SQL-Funktion (PostgREST: returns table -> Array).
async function defaultLlmReserveRpc(params) {
  const rows = await supabaseRequest("/rest/v1/rpc/helmut_reserve_llm_call", {
    method: "POST",
    body: JSON.stringify(params)
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

// Erkennung "Migration noch nicht eingespielt": PostgREST meldet eine unbekannte
// RPC-Funktion mit 404/PGRST202 — DAS ist kein Infrastrukturfehler, sondern der
// dokumentierte Uebergangszustand vor der Migrations-Freigabe.
function isMissingReservationRpcError(error) {
  const msg = String((error && error.message) || "");
  return msg.includes("PGRST202") || /failed \(404\)/.test(msg);
}

// Lokaler Datei-Modus: EIN Prozess -> in-Prozess-Serialisierung (Promise-Kette)
// genuegt; der Zaehler wird pro Tag einmal aus dem llmUsage-Log geseedet und dann
// nur noch im Speicher inkrementiert (Reservierung passiert VOR dem Log-Eintrag).
// BEWUSSTER Trade-off: der Reservierungszaehler ist damit eine EIGENE, strikt
// konservative Wahrheitsquelle — wird das Usage-Log extern manipuliert (Tests)
// oder geleert, gibt die Reservierung NIE mehr Calls frei als seit Prozessstart
// gezaehlt (nie fail-open). Tests, die das Log zuruecksetzen, simulieren einen
// Prozessneustart ueber __resetLlmReservationForTests().
const localLlmCounters = new Map();
let localLlmReserveChain = Promise.resolve();
// Analoger lokaler Zaehler je Mandant (Datei-Modus). Key: `${day}|${tenantId}`.
const localTenantLlmCounters = new Map();
let localTenantReserveChain = Promise.resolve();

// NUR fuer Tests: simuliert Prozessneustart/Tageswechsel des lokalen
// Reservierungszaehlers (Production-Supabase-Pfad hat kein Prozess-Gedaechtnis —
// dort zaehlt die SQL-Funktion in llm_budget_reservations).
function __resetLlmReservationForTests() {
  localLlmCounters.clear();
  localLlmReserveChain = Promise.resolve();
  localTenantLlmCounters.clear();
  localTenantReserveChain = Promise.resolve();
}

function reserveLlmCallLocally(day, effectiveMax, limit, priority, usageTodayFn) {
  const work = async () => {
    let counter = localLlmCounters.get(day);
    if (!counter) {
      const usage = await usageTodayFn(null, `${day}T00:00:00.000Z`);
      counter = { used: Number(usage && usage.calls) || 0 };
      localLlmCounters.set(day, counter);
      // Speicherhygiene: nur die juengsten Tage behalten (Tests springen zwischen Tagen).
      if (localLlmCounters.size > 4) {
        const oldest = [...localLlmCounters.keys()].sort()[0];
        if (oldest !== day) localLlmCounters.delete(oldest);
      }
    }
    if (counter.used >= effectiveMax) {
      return buildReservationResult(false, counter.used, limit, effectiveMax, priority, false);
    }
    counter.used += 1;
    return buildReservationResult(true, counter.used, limit, effectiveMax, priority, false);
  };
  const next = localLlmReserveChain.then(work, work);
  localLlmReserveChain = next.then(() => undefined, () => undefined);
  return next;
}

function buildReservationResult(allowed, used, limit, effectiveMax, priority, atomic) {
  const usedNum = Number.isFinite(Number(used)) ? Number(used) : null;
  // Ehrlicher Ablehnungsgrund: lag der Stand unter dem Tageslimit, hat die
  // Understanding-Reserve gegriffen — der Nutzerpfad soll das unterscheiden koennen.
  const reason = allowed
    ? null
    : (!priority && usedNum != null && usedNum < limit ? "daily-llm-budget-reserved-for-understanding" : "daily-llm-budget-reached");
  return {
    allowed,
    used: usedNum,
    limit: Number.isFinite(limit) ? limit : null,
    remaining: Number.isFinite(limit) && usedNum != null ? Math.max(0, limit - usedNum) : null,
    reason,
    priority,
    atomic
  };
}

// Lokale (Datei-Modus) Mandanten-Reservierung, serialisiert wie der globale Zaehler.
function reserveTenantLocally(day, tenantId, tenantMax, usageTodayFn) {
  const work = async () => {
    const key = `${day}|${tenantId}`;
    let counter = localTenantLlmCounters.get(key);
    if (!counter) {
      const usage = await usageTodayFn(tenantId, `${day}T00:00:00.000Z`);
      counter = { used: Number(usage && usage.calls) || 0 };
      localTenantLlmCounters.set(key, counter);
      // Speicherhygiene: NUR Zaehler FRUEHERER Tage verdraengen — niemals einen
      // HEUTE aktiven Mandanten (sonst re-seedet dessen naechster Call aus dem noch
      // unvollstaendigen Usage-Log unter sein Limit -> Cap-Umgehung). Anders als der
      // globale Zaehler (nur nach Tag gekeyt) tragen Mandanten-Keys `${day}|${id}`,
      // daher explizit auf den Tages-Praefix pruefen statt lexikografisch.
      for (const k of [...localTenantLlmCounters.keys()]) {
        if (k.slice(0, 10) < day) localTenantLlmCounters.delete(k);
      }
    }
    if (counter.used >= tenantMax) return { allowed: false, used: counter.used };
    counter.used += 1;
    return { allowed: true, used: counter.used };
  };
  const next = localTenantReserveChain.then(work, work);
  localTenantReserveChain = next.then(() => undefined, () => undefined);
  return next;
}

function buildTenantResult(allowed, used, tenantMax, atomic) {
  const usedNum = Number.isFinite(Number(used)) ? Number(used) : null;
  return {
    allowed,
    scope: "tenant",
    used: usedNum,
    limit: Number.isFinite(tenantMax) ? tenantMax : null,
    remaining: Number.isFinite(tenantMax) && usedNum != null ? Math.max(0, tenantMax - usedNum) : null,
    reason: allowed ? null : "tenant-daily-budget-reached",
    atomic
  };
}

// Reserviert atomar einen Slot im MANDANTEN-Scope (`tenant:<id>`), VOR der globalen
// Reservierung. Gibt { allowed:true } (weiter zur globalen Reservierung) oder ein
// vollstaendiges Ablehnungsobjekt zurueck. WICHTIG:
//  - Geteilte Calls (understanding/*-backfill/koTagsBackfill) -> allowed:true, kein
//    Mandanten-Scope (globaler Deckel regelt sie).
//  - Tenant-Call OHNE eindeutigen Mandanten -> FAIL-CLOSED (Sprint-Anforderung 8).
//  - Fehlerfall der Reservierung selbst -> llmBudgetFailResult (fail-open, per Flag
//    HELMUT_LLM_BUDGET_FAIL_CLOSED fail-closed) — identisch zur globalen Semantik.
async function reserveTenantScope(opts = {}) {
  const { politicianId = null, callType = "", day, referenceIso = null, rpc = null, usageTodayFn, override } = opts;
  if (isSharedGlobalCallType(callType)) return { allowed: true, scope: "shared" };
  const tid = politicianId == null || String(politicianId).trim() === "" ? null : String(politicianId);
  if (!tid) {
    return {
      allowed: false,
      scope: "tenant",
      used: null,
      limit: null,
      remaining: null,
      reason: "tenant-context-missing-fail-closed",
      atomic: Boolean(rpc)
    };
  }
  const tenantMax = tenantDailyCallLimit(tid, { override });
  const scope = `tenant:${tid}`;
  if (!rpc) {
    try {
      const r = await reserveTenantLocally(day, tid, tenantMax, usageTodayFn);
      return buildTenantResult(r.allowed, r.used, tenantMax, false);
    } catch (_) {
      return { ...llmBudgetFailResult(tenantMax), scope: "tenant", atomic: false };
    }
  }
  try {
    const row = await rpc({ p_day: day, p_scope: scope, p_max: tenantMax });
    if (row && typeof row.allowed === "boolean") return buildTenantResult(row.allowed, row.used, tenantMax, true);
    return { ...llmBudgetFailResult(tenantMax), scope: "tenant", atomic: false };
  } catch (error) {
    if (isMissingReservationRpcError(error)) {
      // Migration nicht eingespielt -> nicht-atomares Altverhalten (auf Basis des
      // Usage-Logs des Mandanten). Der bekannte Race bleibt bis zur Migration.
      try {
        const usage = await usageTodayFn(tid, referenceIso);
        const used = Number(usage && usage.calls) || 0;
        return buildTenantResult(used < tenantMax, used < tenantMax ? used + 1 : used, tenantMax, false);
      } catch (_) {
        return { ...llmBudgetFailResult(tenantMax), scope: "tenant", atomic: false };
      }
    }
    return { ...llmBudgetFailResult(tenantMax), scope: "tenant", atomic: false };
  }
}

// Reserviert GENAU EINEN LLM-Call fuer heute (globaler Zaehler) — atomar, vor dem
// Modellaufruf. Gibt IMMER ein Objekt zurueck (nie throw). Fehlerfall der
// Reservierung selbst: llmBudgetFailResult (fail-open, per Flag
// HELMUT_LLM_BUDGET_FAIL_CLOSED fail-closed) — identische Semantik wie canSpendLlm.
// deps.rpc / deps.usageToday sind fuer Tests injizierbar.
//
// PER-MANDANT-DECKEL (HELMUT_TENANT_LLM_CAP, Default AUS): ist er aktiv, wird ZUERST
// der Mandanten-Scope reserviert und ERST DANN der globale — ein ausgeschoepfter
// Mandant verbraucht so KEINEN globalen Slot und kann keinen anderen Mandanten
// aushungern. Ist er aus, ist der Pfad unten byte-identisch zum bisherigen Verhalten.
let warnedMissingReservationRpc = false;
async function reserveLlmCall(opts = {}) {
  const { callType = "", referenceIso = null, deps = {} } = opts;
  const limit = llmDailyCallLimit();
  if (!Number.isFinite(limit)) {
    // SICHERHEITSNETZ ohne realen Pfad: seit dem Budget-Rollout liefert
    // llmDailyCallLimit() IMMER eine endliche Zahl (fehlend/ungueltig => Schutz-
    // limit 50, es gibt keinen "kein Limit"-Wert mehr). Der Zweig bleibt nur,
    // damit eine kuenftige Aenderung dort das Gate nie versehentlich crasht.
    return { allowed: true, used: null, limit: null, remaining: null, reason: null, priority: false, atomic: false };
  }
  const priority = LLM_PRIORITY_CALLTYPES.has(String(callType || ""));
  const reserve = priority ? 0 : llmUnderstandingReserve();
  const effectiveMax = priority ? limit : Math.max(0, limit - reserve);
  const day = dayKey(referenceIso || new Date().toISOString());
  const usageTodayFn = deps.usageToday || getLlmUsageToday;
  const rpc = deps.rpc || (useSupabase() ? defaultLlmReserveRpc : null);
  // Per-Mandant-Deckel ZUERST (nur wenn HELMUT_TENANT_LLM_CAP aktiv). Bei Ablehnung
  // wird der globale Zaehler bewusst NICHT angefasst (kein Aushungern anderer
  // Mandanten). Default aus -> No-Op, globaler Pfad unten unveraendert.
  if (tenantLlmCapEnabled()) {
    const tenantGate = await reserveTenantScope({
      politicianId: opts.politicianId ?? null,
      callType,
      day,
      referenceIso,
      rpc,
      usageTodayFn,
      override: opts.tenantMaxCalls
    });
    if (tenantGate && tenantGate.allowed === false) {
      return { ...tenantGate, priority };
    }
  }
  if (!rpc) {
    try {
      return await reserveLlmCallLocally(day, effectiveMax, limit, priority, usageTodayFn);
    } catch (_) {
      return { ...llmBudgetFailResult(limit), priority, atomic: false };
    }
  }
  try {
    const row = await rpc({ p_day: day, p_scope: "global", p_max: effectiveMax });
    if (row && typeof row.allowed === "boolean") {
      return buildReservationResult(row.allowed, row.used, limit, effectiveMax, priority, true);
    }
    return { ...llmBudgetFailResult(limit), priority, atomic: false };
  } catch (error) {
    if (isMissingReservationRpcError(error)) {
      // Uebergangszustand vor der Migrations-Freigabe: bisheriges Read-then-Decide
      // (NICHT atomar — der bekannte Race bleibt bis zur Migration bestehen).
      if (!warnedMissingReservationRpc) {
        warnedMissingReservationRpc = true;
        console.warn("[llm-budget] SQL-Funktion helmut_reserve_llm_call fehlt (Migration 20260717 nicht eingespielt) — Budget-Gate laeuft NICHT-atomar im Altverhalten weiter.");
      }
      try {
        const usage = await usageTodayFn(null, referenceIso);
        const used = Number(usage && usage.calls) || 0;
        return buildReservationResult(used < effectiveMax, used < effectiveMax ? used + 1 : used, limit, effectiveMax, priority, false);
      } catch (_) {
        return { ...llmBudgetFailResult(limit), priority, atomic: false };
      }
    }
    return { ...llmBudgetFailResult(limit), priority, atomic: false };
  }
}

// --- Pipeline-Locking --------------------------------------------------------
// Verhindert, dass zwei parallele Vercel-Invocations denselben Crawl/Briefing-Job
// gleichzeitig ausfuehren und sich gegenseitig ueberschreiben.
//
// P0-4 (freigabepflichtig, Default AUS via HELMUT_ATOMIC_LOCK): zwei Backends.
//  (A) ATOMAR (Flag an + Migration 20260719 eingespielt): EIN INSERT..ON CONFLICT
//      ..WHERE ueber public.pipeline_locks (helmut_acquire_pipeline_lock) —
//      konkurrenzsicher, token-gebundenes Release, und FAIL-CLOSED (return false)
//      bei DB-Fehler. Schliesst R2 (Doppelverarbeitung) + R14 (05:30-Ueberlappung).
//  (B) BLOB (Default, unveraendert): nicht-atomarer Read-modify-write, FAIL-OPEN.
//      Bleibt byte-identisch, bis die Freigabe (Flag+Migration) erteilt ist.
const heldLockTokens = new Map(); // jobName -> token (nur im atomaren Modus, per Invocation)

function atomicLockEnabled() {
  return isFlagOn(process.env.HELMUT_ATOMIC_LOCK);
}

async function acquirePipelineLockAtomic(jobName, ttlMs, deps = {}) {
  const request = deps.request || supabaseRequest;
  try {
    const rows = await request("/rest/v1/rpc/helmut_acquire_pipeline_lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_job: jobName, p_ttl_ms: Math.max(1, Math.floor(ttlMs)) })
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row && row.acquired) {
      if (row.token) heldLockTokens.set(jobName, row.token);
      return true;
    }
    return false;
  } catch (error) {
    // FAIL-CLOSED (Gegenteil des Alt-Verhaltens): bei Lock-Fehler NICHT ausfuehren.
    console.error("[pipelineLock:atomic] fail-closed:", error && error.message);
    return false;
  }
}

async function acquirePipelineLock(jobName, ttlMs = 10 * 60 * 1000, deps = {}) {
  if (atomicLockEnabled()) return acquirePipelineLockAtomic(jobName, ttlMs, deps);
  // (B) Blob-Fallback — unveraendertes fail-open Verhalten bis zur Freigabe.
  try {
    const store = await readAuthStore();
    const locks = store.pipelineLocks || {};
    const existing = locks[jobName];
    if (existing && existing.expiresAt > Date.now()) {
      console.warn(`[pipelineLock] ${jobName} bereits gesperrt bis ${new Date(existing.expiresAt).toISOString()}`);
      return false;
    }
    locks[jobName] = { lockedAt: Date.now(), expiresAt: Date.now() + ttlMs };
    await writeAuthStore({ ...store, pipelineLocks: locks });
    return true;
  } catch (error) {
    console.error("[pipelineLock] acquire fehlgeschlagen, fail-open:", error.message);
    return true;
  }
}

async function releasePipelineLock(jobName, deps = {}) {
  if (atomicLockEnabled()) {
    const request = deps.request || supabaseRequest;
    const token = heldLockTokens.get(jobName);
    heldLockTokens.delete(jobName);
    if (!token) return; // nie gehalten (Acquire abgelehnt) -> nichts freizugeben
    try {
      await request("/rest/v1/rpc/helmut_release_pipeline_lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ p_job: jobName, p_token: token })
      });
    } catch (error) {
      console.error("[pipelineLock:atomic] release fehlgeschlagen (TTL raeumt auf):", error && error.message);
    }
    return;
  }
  // (B) Blob-Fallback — unveraendert.
  try {
    const store = await readAuthStore();
    const locks = { ...(store.pipelineLocks || {}) };
    delete locks[jobName];
    await writeAuthStore({ ...store, pipelineLocks: locks });
  } catch (error) {
    console.error("[pipelineLock] release fehlgeschlagen:", error.message);
  }
}

// --- Globaler Understanding-Lock (V3-Vorbereitung, C1 — standardmaessig INAKTIV) ---
// Der spaetere globale KI-"Understanding"-Call (1x pro NEUEM Vorgang, mandantenlos)
// darf nicht von zwei ueberlappenden Cron-Laeufen doppelt ausgefuehrt werden — sonst
// verdoppeln sich die KI-Kosten. Anders als die bestehenden per-Mandat-Locks
// (runSourceCrawl/runMorningBriefing) ist dieser Lock GLOBAL: ein fixer,
// mandantenloser jobName.
//
// Aktivierung NUR ueber Flag HELMUT_UNDERSTANDING_LOCK (1/true/on/yes). Solange das
// Flag aus ist (Default), sind beide Helfer NO-OPs: acquire liefert immer ein
// "granted"-Token (active:false) und schreibt NICHTS, release tut nichts. Es wird
// heute noch NIRGENDS aufgerufen — dies verdrahtet nur die Naht fuer die spaetere
// Understanding Engine, ohne V3-Logik zu bauen oder bestehendes Verhalten zu aendern.
const GLOBAL_UNDERSTANDING_LOCK = "global-understanding";

function understandingLockEnabled() {
  return isFlagOn(process.env.HELMUT_UNDERSTANDING_LOCK);
}

async function acquireGlobalUnderstandingLock(ttlMs = 10 * 60 * 1000) {
  if (!understandingLockEnabled()) {
    return { granted: true, active: false, jobName: GLOBAL_UNDERSTANDING_LOCK };
  }
  const granted = await acquirePipelineLock(GLOBAL_UNDERSTANDING_LOCK, ttlMs);
  return { granted, active: true, jobName: GLOBAL_UNDERSTANDING_LOCK };
}

async function releaseGlobalUnderstandingLock() {
  if (!understandingLockEnabled()) return;
  await releasePipelineLock(GLOBAL_UNDERSTANDING_LOCK);
}

// --- Admin-Recovery: letzter manueller Understanding-Lauf (Metadaten, KEINE KI/Daten) ---
// Persistiert im BESTEHENDEN Auth-Store (JSON-Dokument, wie pipelineLocks) — keine neue
// Tabelle, keine Migration. Nur skalare Metadaten (Zeit/Status/Zahlen/kurzer Grund), damit
// das Ergebnis des Admin-Buttons einen Reload/Function-Kill uebersteht. Keine Rohtexte/Secrets.
async function saveAdminRecoveryLastRun(entry = {}) {
  try {
    const store = await readAuthStore();
    const clip = (v) => (v == null ? null : String(v).slice(0, 200));
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
    const prev = store.adminRecoveryLastRun || {};
    const merged = {
      startedAt: entry.startedAt || prev.startedAt || null,
      finishedAt: entry.finishedAt !== undefined ? entry.finishedAt : (prev.finishedAt || null),
      status: clip(entry.status || prev.status || null),
      grund: entry.grund !== undefined ? clip(entry.grund) : (prev.grund || null),
      verarbeitet: num(entry.verarbeitet),
      versucht: num(entry.versucht),
      imFenster: num(entry.imFenster),
      ausserhalb: num(entry.ausserhalb),
      ohneRohdokumente: num(entry.ohneRohdokumente),
      pendingVorher: num(entry.pendingVorher),
      pendingNachher: num(entry.pendingNachher),
      completeVorher: num(entry.completeVorher),
      completeNachher: num(entry.completeNachher),
      fehler: entry.fehler !== undefined ? clip(entry.fehler) : (prev.fehler || null)
    };
    await writeAuthStore({ ...store, adminRecoveryLastRun: merged });
    return merged;
  } catch (error) {
    console.error("[adminRecovery] saveLastRun fehlgeschlagen:", error && error.message);
    return null;
  }
}

async function getAdminRecoveryLastRun() {
  try {
    const store = await readAuthStore();
    return store.adminRecoveryLastRun || null;
  } catch (_) {
    return null;
  }
}

// --- P0-1: Prozess-Laufzeit-Telemetrie (Understanding-Batch / Briefing / Lage-Fold) ---
// Persistiert eine ECHTE Wall-Clock-Dauer je Batch-Lauf im kleinen Auth-Store —
// NICHT im grossen Content-Blob (Audit R1). Der Eintrag ist eine strenge Allowlist
// technischer Skalare: keine Dokumentinhalte, keine KI-Texte, keine Namen/Kontakte
// (DSGVO-Datensparsamkeit). Fail-safe beim Aufrufer — ein Telemetrie-Write-Fehler
// darf den Batch nie beeinflussen.
// Zaehlerkarte (Ergebnisklasse -> Anzahl) auf eine harte Obergrenze bringen:
// nur bekannte Schluesselform, nur Zahlen, maximal MAX_TELEMETRIE_SCHLUESSEL
// Eintraege. Der Auth-Store ist klein und haelt 300 Laeufe — ohne diese Kappung
// koennte eine unerwartete Statusflut ihn aufblaehen (Audit R1).
const MAX_TELEMETRIE_SCHLUESSEL = 20;
function sanitizeZaehlerkarte(map) {
  if (!map || typeof map !== "object") return null;
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(map)) {
    if (n >= MAX_TELEMETRIE_SCHLUESSEL) break;
    const schluessel = String(k).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
    const wert = Number(v);
    if (!schluessel || !Number.isFinite(wert)) continue;
    out[schluessel] = wert;
    n += 1;
  }
  return Object.keys(out).length ? out : null;
}

function sanitizeProcessRun(entry = {}) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const str = (v, max) => (v == null ? null : String(v).slice(0, max));
  const t = entry.telemetrie && typeof entry.telemetrie === "object" ? entry.telemetrie : null;
  return {
    process: str(entry.process, 40) || "unknown",
    runId: str(entry.runId, 80),
    mode: str(entry.mode, 24),
    location: str(entry.location, 40),
    startedAt: str(entry.startedAt, 40),
    finishedAt: str(entry.finishedAt, 40),
    durationMs: num(entry.durationMs),
    processed: num(entry.processed),
    deferred: num(entry.deferred),
    skippedStore: num(entry.skippedStore),
    reason: str(entry.reason, 120),
    status: str(entry.status, 40) || "ok",
    // --- Vorgangsbildung (Betriebsbefund B4): Ergebnis JEDES Clusters -------
    // Bis zu diesem Sprint war der haeufigste Ausgang (`skipped-exists`) in der
    // Telemetrie unsichtbar — ein Betreiber konnte nicht erkennen, dass ein
    // Grossteil der Rohdokumente nie bewertet wurde. Weiterhin AUSSCHLIESSLICH
    // technische Skalare und Klassenzaehler: kein Dokumenttext, keine KI-Ausgabe,
    // keine personenbezogenen Daten.
    cluster: t ? num(t.cluster) : num(entry.cluster),
    dokumente: t ? num(t.dokumente) : null,
    dokumenteOhneEndzustand: t ? num(t.dokumenteOhneEndzustand) : null,
    vorgemerkt: t ? num(t.vorgemerkt) : num(entry.vorgemerkt),
    grossereignisse: t ? num(t.grossereignisse) : null,
    ergebnisse: t ? sanitizeZaehlerkarte(t.ergebnisse) : null,
    gruppen: t ? sanitizeZaehlerkarte(t.gruppen) : null,
    aufloesungen: t ? sanitizeZaehlerkarte(t.aufloesungen) : null,
    auffaelligkeitenGesamt: t ? num(t.auffaelligkeitenGesamt) : null,
    // --- W-2 (Werkzeug-Haertung): Pflichtangaben je Lauf — weiterhin NUR
    // technische Skalare, keine Inhalte, keine PII, keine Secrets.
    zielmenge: num(entry.zielmenge),                 // wie viele Objekte sollte der Lauf bearbeiten
    gespeichert: num(entry.gespeichert),
    uebersprungen: num(entry.uebersprungen),
    fehlgeschlagen: num(entry.fehlgeschlagen),
    fehlerklasse: str(entry.fehlerklasse, 40),       // klassifiziert (redact.js), nie Rohtext
    backend: str(entry.backend, 24) || (useSupabase() ? "supabase" : "local"),
    commit: str(entry.commit || process.env.VERCEL_GIT_COMMIT_SHA || process.env.HELMUT_COMMIT_SHA || null, 40),
    createdAt: new Date().toISOString()
  };
}

// --- W-2 (Werkzeug-Haertung 2026-07-27): Lauftelemetrie parallel-sicher ------
// BEFUND: recordProcessRun lief als Lese-Aendere-Schreibe-Zyklus ueber den
// GESAMTEN Auth-Store-Blob (Zeile `main-auth`). Denselben Blob schreiben
// parallel: recordLlmUsage (bei JEDEM KI-Call), Sessions, systemErrors,
// pipelineLocks (Blob-Modus), understandingRetries, adminRecoveryLastRun … —
// jeder dieser Writer ersetzt die komplette `data`-Spalte mit seinem Lesestand.
// Ein processRuns-Eintrag, der zwischen fremdem Read und fremdem Write entstand,
// war damit VERLOREN (Last-Write-Wins), ohne dass irgendein Fehler auftrat.
// Zusaetzlich verschluckte `.catch(() => {})` bei den Aufrufern jeden echten
// Schreibfehler. Beides ist Befund W-2 (zwei Production-Nachweislaeufe fehlten).
//
// LOESUNG (Option B des Sprints, Muster 20260720_crawl_runs_relational):
//   * Kanonisches Ziel ist die relationale Tabelle public.process_runs —
//     EINE Zeile je (run_id, process), atomarer Upsert (on_conflict), dadurch
//     append-only, idempotent und parallel-sicher unabhaengig von der Blob-Groesse.
//   * Freigabepflichtig: Migration 20260727_process_runs_relational.sql PLUS
//     Flag HELMUT_PROCESS_RUNS_RELATIONAL (Default AUS). Ohne beides bleibt der
//     Blob-Pfad aktiv (Uebergangsphase 1) — jetzt aber idempotent je
//     (runId, process) und mit SICHTBAREN Fehlern statt `return null`.
//   * Dual-Write in der Uebergangsphase 2 (Flag AN): relational ist kanonisch,
//     der Blob wird als Lesespiegel fuer bestehende Leser weitergefuehrt, bis
//     Phase 3/4 des Migrationsplans freigegeben sind
//     (docs/betrieb/blob-relational-migration-plan.md).
//   * KEIN stilles Verschlucken: Ergebnisobjekt { ok, fehler[] } + strukturiertes
//     Log + systemError-Eintrag. Aufrufer muessen das Ergebnis ausweisen.
//
// Zustaende (kanonisch, CHECK-Constraint der Tabelle): running · success ·
// partial · failed · blocked · rolled_back. Die historischen Blob-Werte "ok" und
// "skipped" werden in der Projektion abgebildet (ok->success, skipped->blocked);
// im Blob bleiben sie unveraendert erhalten (bestehende Leser/Tests).
const {
  processRunsRelationalEnabled,
  processRunToRelationalRow,
  relationalRowToProcessRun
} = require("./blob-relational");

// Atomarer relationaler Upsert: EINE Zeile je (run_id, process). Wiederholtes
// Schreiben derselben Laufkennung aktualisiert die Zeile, dupliziert nie.
async function upsertProcessRunRelational(row) {
  if (!v3StoreReady()) throw new Error("relational-store-not-ready");
  await supabaseRequest("/rest/v1/process_runs?on_conflict=run_id,process", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row)
  });
  return { upserted: true };
}

function processRunTelemetrieFehler(backend, error) {
  let meldung = String((error && error.message) || error || "unbekannt");
  try { meldung = require("./redact").redactSensitive(meldung); } catch (_) { /* nie verdecken */ }
  return { backend, fehlerklasse: klassifiziereLesefehler(error), meldung: meldung.slice(0, 200) };
}

// Sichtbarkeit eines Telemetriefehlers: strukturiertes Log + systemError-Eintrag
// (dedupliziert ueber recordPipelineError). Der systemError-Pfad schreibt selbst
// den Auth-Store und kann bei einem Store-Totalausfall ebenfalls scheitern —
// dann bleibt mindestens die strukturierte Log-Zeile.
async function meldeProcessRunTelemetrieFehler(clean, fehler) {
  try {
    console.error(`[processRun] TELEMETRIEFEHLER ${JSON.stringify({
      runId: clean.runId, process: clean.process, fehler
    })}`);
  } catch (_) { /* Logging darf nichts verdecken */ }
  try {
    await recordPipelineError({
      process: "prozesslauf-telemetrie",
      runId: clean.runId,
      errorType: fehler && fehler[0] && `${fehler[0].backend}: ${fehler[0].meldung}`,
      sourceId: clean.process
    });
  } catch (_) { /* Doppelfehler: Log-Zeile oben bleibt */ }
}

// Schreibt die Lauftelemetrie EINES Laufs. Ergebnisobjekt statt Exception:
//   { ok, vollstaendig, relationalAktiv, gespeichert: {relational, blob}, fehler[], eintrag }
// ok            = der KANONISCHE Pfad hat gespeichert (relational, sonst Blob).
// vollstaendig  = zusaetzlich auch der jeweils andere Pfad (Dual-Write-Spiegel).
// Aufrufer duerfen das Ergebnis nicht verwerfen — ein Telemetriefehler gehoert
// in den Abschlussstatus des Laufs (kein `.catch(() => {})` mehr).
// deps (readAuth/writeAuth/insertRelational/relationalAktiv) sind fuer
// deterministische Tests injizierbar (Muster getRunCostReport).
async function recordProcessRun(entry = {}, deps = {}) {
  const readAuth = deps.readAuth || readAuthStore;
  const writeAuth = deps.writeAuth || writeAuthStore;
  const insertRelational = deps.insertRelational || upsertProcessRunRelational;
  const relationalAktiv = deps.relationalAktiv != null
    ? Boolean(deps.relationalAktiv)
    : (processRunsRelationalEnabled() && v3StoreReady());

  const clean = sanitizeProcessRun(entry);
  if (!clean.runId) {
    // Jeder Lauf braucht eine eindeutige, stabile Kennung. Abgeleitet aus
    // Prozessname + Startzeit — deterministisch fuer denselben logischen Lauf.
    const t = Date.parse(clean.startedAt || clean.createdAt || "") || Date.now();
    clean.runId = `${clean.process}-${t}`;
    clean.runIdAbgeleitet = true;
  }

  const fehler = [];
  let relationalGespeichert = false;
  if (relationalAktiv) {
    try {
      await insertRelational(processRunToRelationalRow(clean));
      relationalGespeichert = true;
    } catch (error) {
      fehler.push(processRunTelemetrieFehler("relational", error));
    }
  }

  let blobGespeichert = false;
  try {
    const store = await readAuth();
    // IDEMPOTENT auch im Blob: derselbe (runId, process) ersetzt seinen
    // bestehenden Eintrag statt zu duplizieren.
    const ohneSelbst = (Array.isArray(store.processRuns) ? store.processRuns : [])
      .filter((r) => !(r && r.runId === clean.runId && r.process === clean.process));
    await writeAuth({ ...store, processRuns: [clean, ...ohneSelbst].slice(0, 300) });
    blobGespeichert = true;
  } catch (error) {
    fehler.push(processRunTelemetrieFehler("blob", error));
  }

  const ok = relationalAktiv ? relationalGespeichert : blobGespeichert;
  if (fehler.length) await meldeProcessRunTelemetrieFehler(clean, fehler);
  return {
    ok,
    vollstaendig: fehler.length === 0,
    relationalAktiv,
    gespeichert: { relational: relationalGespeichert, blob: blobGespeichert },
    fehler,
    eintrag: clean
  };
}

// Startbeleg eines Laufs (status=running) — NUR relational. Bewusst KEIN
// Blob-Write: ein zusaetzlicher Blob-RMW je Laufstart wuerde das Last-Write-
// Wins-Fenster fuer alle anderen Writer VERGROESSERN. Ohne aktives relationales
// Ziel ist der Startbeleg ein dokumentierter No-Op (Uebergangsphase 1).
// NUTZEN: ein Lauf, der hart stirbt (z. B. Serverless-504), hinterlaesst eine
// sichtbare `running`-Zeile statt spurlos zu verschwinden — genau der zweite
// Verlustmodus aus Befund W-2.
async function recordProcessRunStart(entry = {}, deps = {}) {
  const insertRelational = deps.insertRelational || upsertProcessRunRelational;
  const relationalAktiv = deps.relationalAktiv != null
    ? Boolean(deps.relationalAktiv)
    : (processRunsRelationalEnabled() && v3StoreReady());
  const clean = sanitizeProcessRun({ ...entry, status: "running", finishedAt: null });
  if (!clean.runId) return { ok: false, uebersprungen: false, fehler: [{ backend: "relational", fehlerklasse: "schema-invalid", meldung: "Startbeleg braucht eine runId" }], eintrag: clean };
  if (!relationalAktiv) return { ok: true, uebersprungen: true, grund: "relational-inaktiv", eintrag: clean };
  try {
    await insertRelational(processRunToRelationalRow(clean));
    return { ok: true, uebersprungen: false, eintrag: clean };
  } catch (error) {
    const fehler = [processRunTelemetrieFehler("relational", error)];
    await meldeProcessRunTelemetrieFehler(clean, fehler);
    return { ok: false, uebersprungen: false, fehler, eintrag: clean };
  }
}

// Relationale process_runs-Zeilen lesen (neueste zuerst, seitenweise).
async function listProcessRunsRelational({ limit = 300 } = {}) {
  const max = Math.max(1, Number(limit) || 300);
  const seite = 1000;
  const out = [];
  for (let offset = 0; offset < max; offset += seite) {
    const nehmen = Math.min(seite, max - offset);
    const rows = await supabaseRequest(
      `/rest/v1/process_runs?select=*&order=created_at.desc&offset=${offset}&limit=${nehmen}`
    );
    if (!Array.isArray(rows) || !rows.length) break;
    out.push(...rows);
    if (rows.length < seite) break;
  }
  return out.map(relationalRowToProcessRun);
}

// Dual-Read: relational (kanonisch, falls aktiv) + Blob (Altbestand/Spiegel),
// dedupliziert ueber (runId, process) mit Vorrang fuer die relationale Zeile.
// Historische Blob-Eintraege bleiben damit ohne Datenmigration lesbar.
// Fehlerverhalten (W-1-Regel gilt auch hier): scheitert JEDE verfuegbare
// Quelle, wird geworfen statt [] zu liefern; scheitert nur eine, liefert die
// andere und der Ausfall wird geloggt.
async function listProcessRuns({ process: proc = null, limit = 100 } = {}, deps = {}) {
  const readAuth = deps.readAuth || readAuthStore;
  const listRelational = deps.listRelational || listProcessRunsRelational;
  const relationalAktiv = deps.relationalAktiv != null
    ? Boolean(deps.relationalAktiv)
    : (processRunsRelationalEnabled() && v3StoreReady());

  let blobRuns = null;
  let blobFehler = null;
  try {
    const store = await readAuth();
    blobRuns = Array.isArray(store.processRuns) ? store.processRuns : [];
  } catch (error) {
    blobFehler = error;
    console.error("[processRun] Blob-Lesepfad fehlgeschlagen:", error && error.message);
  }

  let relationalRuns = null;
  if (relationalAktiv) {
    try {
      relationalRuns = await listRelational({ limit: Math.max(300, Number(limit) || 0) });
    } catch (error) {
      console.error("[processRun] relationaler Lesepfad fehlgeschlagen:", error && error.message);
    }
  }

  if (blobRuns == null && relationalRuns == null) {
    throw new StorageReadError("process_runs", blobFehler || new Error("kein Lesepfad verfuegbar"));
  }

  const key = (r) => `${(r && r.runId) || "?"}|${(r && r.process) || "?"}`;
  const merged = [];
  const gesehen = new Set();
  for (const r of relationalRuns || []) {
    if (!r || gesehen.has(key(r))) continue;
    gesehen.add(key(r));
    merged.push(r);
  }
  for (const r of blobRuns || []) {
    if (!r || gesehen.has(key(r))) continue;
    gesehen.add(key(r));
    merged.push(r);
  }
  merged.sort((a, b) => String((b && b.createdAt) || "").localeCompare(String((a && a.createdAt) || "")));

  let runs = merged;
  if (proc) runs = runs.filter((r) => r && r.process === proc);
  return runs.slice(0, Math.max(0, Number(limit) || 0));
}

// --- Kennzahlen der Vorgangsbildung je Lauf UND je Tag (Betriebsbefund B4) ---
// Verdichtet die Lauftelemetrie, die recordProcessRun ohnehin schreibt. Kein
// zweites Telemetriesystem, keine zusaetzliche Tabelle, kein KI-/Netzzugriff.
// Reine Aggregation ueber den Auth-Store -> auch ohne Datenbankzugriff testbar.
// Welche Laeufe zaehlen als Vorgangsbildung? Bewusst ein PRAEFIX statt einer
// Aufzaehlung: die frueher hier stehende Liste nannte `understanding-lagecheck`,
// geschrieben wird aber `understanding-lage` — und `understanding-nachhol` fehlte
// ganz. Beide Lauftypen fielen dadurch still aus den Kennzahlen. Genau diese Art
// stiller Auslassung ist der Kern von Betriebsbefund B4; ein Praefix kann bei
// einem neuen Lauftyp nicht erneut auseinanderlaufen.
// Geschriebene Namen (Stand 2026-07-26): understanding-eager (scheduler.js),
// understanding-lage (scheduler.js), understanding-cron (server.js),
// understanding-nachhol (scripts/vorgangsbildung-nachholen.js).
function istVorgangsbildungsLauf(run) {
  return Boolean(run && typeof run.process === "string" && run.process.startsWith("understanding-"));
}

function aggregateVorgangsbildung(runs = [], { tage = 7 } = {}) {
  const relevant = (Array.isArray(runs) ? runs : []).filter(istVorgangsbildungsLauf);
  const grenze = Date.now() - Math.max(1, Number(tage) || 7) * 86400000;
  const imFenster = relevant.filter((r) => {
    const t = Date.parse(r.createdAt || r.finishedAt || r.startedAt || "");
    return Number.isFinite(t) ? t >= grenze : false;
  });

  const leereGruppen = () => ({ verarbeitet: 0, zusammengefuehrt: 0, duplikate: 0, ausgeschlossen: 0, fehlgeschlagen: 0, erneut: 0, unbekannt: 0 });
  const summiere = (ziel, quelle) => {
    for (const [k, v] of Object.entries(quelle || {})) ziel[k] = (ziel[k] || 0) + (Number(v) || 0);
    return ziel;
  };

  const jeTag = new Map();
  const gesamt = {
    laeufe: imFenster.length, cluster: 0, dokumente: 0, dokumenteOhneEndzustand: 0,
    vorgemerkt: 0, grossereignisse: 0, zurueckgestellt: 0,
    gruppen: leereGruppen(), ergebnisse: {}, aufloesungen: {}
  };

  for (const r of imFenster) {
    const tag = String(r.createdAt || r.finishedAt || r.startedAt || "").slice(0, 10) || "unbekannt";
    if (!jeTag.has(tag)) {
      jeTag.set(tag, {
        tag, laeufe: 0, cluster: 0, dokumente: 0, dokumenteOhneEndzustand: 0,
        vorgemerkt: 0, grossereignisse: 0, zurueckgestellt: 0,
        gruppen: leereGruppen(), ergebnisse: {}, aufloesungen: {}
      });
    }
    const z = jeTag.get(tag);
    for (const ziel of [z, gesamt]) {
      ziel.cluster += Number(r.cluster) || 0;
      ziel.dokumente += Number(r.dokumente) || 0;
      ziel.dokumenteOhneEndzustand += Number(r.dokumenteOhneEndzustand) || 0;
      ziel.vorgemerkt += Number(r.vorgemerkt) || 0;
      ziel.grossereignisse += Number(r.grossereignisse) || 0;
      ziel.zurueckgestellt += Number(r.deferred) || 0;
      summiere(ziel.gruppen, r.gruppen);
      summiere(ziel.ergebnisse, r.ergebnisse);
      summiere(ziel.aufloesungen, r.aufloesungen);
    }
    z.laeufe += 1;
  }

  const anteile = (gruppen, basis) => Object.fromEntries(Object.entries(gruppen).map(([k, v]) =>
    [k, basis ? Math.round((v / basis) * 1000) / 10 : 0]));
  gesamt.anteile = anteile(gesamt.gruppen, gesamt.cluster);

  return {
    fensterTage: Math.max(1, Number(tage) || 7),
    gesamt,
    jeTag: [...jeTag.values()]
      .map((z) => ({ ...z, anteile: anteile(z.gruppen, z.cluster) }))
      .sort((a, b) => (a.tag < b.tag ? 1 : -1)),
    // Ehrliche Grenze: die Lauftelemetrie ist ein Ringpuffer ueber 300 Laeufe.
    // Reicht das Fenster weiter zurueck, sind die aeltesten Laeufe schlicht nicht
    // mehr da — das wird hier benannt statt als Null ausgewiesen.
    hinweis: relevant.length >= 300 ? "ringpuffer-300-laeufe-moeglicherweise-gekappt" : null
  };
}

async function getVorgangsbildungKennzahlen({ tage = 7 } = {}) {
  const runs = await listProcessRuns({ limit: 300 });
  return aggregateVorgangsbildung(runs, { tage });
}

// --- P0-3: zentraler, datenschutzsicherer Pipeline-Fehler-Sammler ---------------
// Schreibt bislang STILL verschluckte Pipeline-/Crawl-/Understanding-/Matching-/
// Decision-/Lage-Fehler in systemErrors (Auth-Store). VERBINDLICH nur technische
// Metadaten: Prozessname, Laufkennung, pseudonyme Nutzerkennung (nur falls noetig),
// Quellenkennung, KLASSIFIZIERTER Fehlertyp, Zeitpunkt, Commit, Wiederholungsnummer.
// KEIN roher Fehlertext, KEINE Dokumentinhalte, KEINE Secrets/Kontaktdaten.
//
// Dedup ueber einen stabilen, inhaltsfreien Fingerprint (Prozess+Fehlertyp+Quelle):
// wiederkehrende identische Fehler in einem 6-h-Fenster erhoehen einen Zaehler,
// statt die Liste zu fluten. Erfolgslaeufe rufen den Sammler NICHT auf -> kein
// Fehlereintrag bei Erfolg.
const PIPELINE_ERROR_DEDUP_WINDOW_MS = Number(process.env.HELMUT_PIPELINE_ERROR_WINDOW_MS) || 6 * 60 * 60 * 1000;

async function recordPipelineError(entry = {}) {
  _recordingPipelineError = true; // Rekursions-Guard fuer withStoreRetry (Auth-Store-IO)
  try {
    const { classifyPipelineError, pipelineErrorFingerprint } = require("./redact");
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
    const str = (v, max) => (v == null ? null : String(v).slice(0, max));
    const store = await readAuthStore();
    const errors = Array.isArray(store.systemErrors) ? store.systemErrors : [];
    const processName = str(entry.process, 40) || "pipeline";
    const errorType = classifyPipelineError(entry.errorType || entry.error);
    const sourceId = str(entry.sourceId, 120);
    const fingerprint = pipelineErrorFingerprint(processName, errorType, sourceId);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const commit = str(entry.commit || process.env.VERCEL_GIT_COMMIT_SHA || process.env.HELMUT_COMMIT_SHA || null, 40);

    // Dedup: bestehenden Eintrag im Fenster hochzaehlen statt neu anlegen.
    const existing = errors.find((e) => e && e.fingerprint === fingerprint && e.lastAtMs && (nowMs - e.lastAtMs) < PIPELINE_ERROR_DEDUP_WINDOW_MS);
    if (existing) {
      existing.count = (Number(existing.count) || 1) + 1;
      existing.lastAt = nowIso;
      existing.lastAtMs = nowMs;
      const r = num(entry.retry);
      if (r != null) existing.retry = Math.max(Number(existing.retry) || 0, r);
      await writeAuthStore({ ...store, systemErrors: errors.slice(0, 500) });
      return existing;
    }

    const clean = {
      id: `err-${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      scope: "pipeline",
      process: processName,
      runId: str(entry.runId, 80),
      sourceId,
      userId: str(entry.userId, 80),   // pseudonyme Mandats-/Nutzerkennung, nur falls uebergeben
      errorType,                        // KLASSIFIZIERT — nie Rohtext
      retry: num(entry.retry) || 0,     // Wiederholungsnummer
      count: 1,
      commit,
      fingerprint,
      createdAt: nowIso,
      lastAt: nowIso,
      lastAtMs: nowMs
    };
    await writeAuthStore({ ...store, systemErrors: [clean, ...errors].slice(0, 500) });
    return clean;
  } catch (error) {
    try { console.error("[recordPipelineError] fehlgeschlagen (ignoriert):", error && error.message); } catch (_) { /* ignore */ }
    return null;
  } finally {
    _recordingPipelineError = false;
  }
}

// --- Helmut Core V3 Store (C5) — hinter Flag HELMUT_V3_STORE, standardmaessig AUS ---
// Schreibt/liest die relationalen V3-Tabellen (raw_documents, knowledge_objects).
// Wird HEUTE von keinem bestehenden Pfad aufgerufen — reine additive Naht.
// Sicherheitsgarantien:
//   - Flag AUS -> alle Funktionen sind inert (no-op / null / []). Die App laeuft
//     exakt wie bisher; bestehende Storage-Signaturen bleiben unveraendert.
//   - Supabase nicht verfuegbar -> inert statt Crash (kein Netzwerk, kein throw).
function v3StoreEnabled() {
  return isFlagOn(process.env.HELMUT_V3_STORE);
}

// V3-Objekte liegen in relationalen Supabase-Tabellen. Ohne konfiguriertes Supabase
// sind die Funktionen inert (kein Crash), bis der Store bereitsteht.
function v3StoreReady() {
  return v3StoreEnabled() && Boolean(process.env.SUPABASE_URL) && Boolean(supabaseServiceRoleKey());
}

function v3SkipReason() {
  return v3StoreEnabled() ? "v3-store-unavailable" : "v3-store-disabled";
}

function pickColumns(obj = {}, columns) {
  const row = {};
  for (const col of columns) {
    if (obj[col] !== undefined) row[col] = obj[col];
  }
  return row;
}

const V3_RAW_DOCUMENT_COLUMNS = [
  "id", "canonical_url", "content_hash", "cluster_id", "title", "summary", "url",
  "source_name", "source_id", "source_type", "confidence", "link_type",
  "published_at", "retrieved_at", "document_type", "wahlperiode", "raw", "created_at",
  // Globale Dedup/Fundstellen (Migration 20260715_dedup_findings; beschrieben NUR vom
  // Cutover-Schreibpfad persistRawDocumentsDeduped — bestehende Writes setzen sie nicht).
  "content_fingerprint", "publisher_id", "canonical_target_url", "finding_count"
];

const V3_KNOWLEDGE_OBJECT_COLUMNS = [
  "id", "vorgang_id", "ko_version", "headline",
  "was_ist_passiert", "warum_wichtig", "wer_ist_betroffen",
  "parteien", "ausschuesse", "ministerien", "risiken", "chancen",
  "zeitdruck", "handlungsempfehlung", "confidence_score", "source_document_count", "status",
  "understanding_status",
  "mentioned_people", "mentioned_mps", "mentioned_parties", "mentioned_committees",
  "mentioned_ministries", "mentioned_locations", "mentioned_organizations",
  "policy_field", "political_level", "instrument", "stage", "tags", "deadline",
  "best_source_url", "best_link_type", "source_trust",
  "understanding_model", "understanding_tokens", "created_at", "updated_at",
  "display_title", "display_summary", "why_relevant", "recommendation", "display_category",
  // Stabschef-Felder (V3-Fundament, additiv). Aeltere Zeilen bleiben NULL/{} -> die
  // Anwendung liest leer und leitet daraus qualityStatus ab (kein Backfill, kein Fallback).
  "risk_of_no_action", "opportunity_summary", "recommended_communication", "action_items",
  // Strukturierte Stabschef-Werte (Runde 2, additiv NEBEN den Alt-Feldern):
  "risk_level", "opportunity_level", "recommended_communication_struct", "action_items_struct",
  // Klassifikation (Sprint 2, additiv). Lese+Schreib (Matching/Read nutzen decision_level +
  // Geografie). embedding ist bewusst NICHT hier -> siehe V3_KO_WRITE_COLUMNS (Schreiben) und
  // V3_KO_READ_SELECT (Lesen ohne Vektor, Perf).
  "decision_level", "related_levels", "event_type",
  "affected_geographies", "mentioned_geographies", "decision_entities", "related_entities",
  "classification_confidence"
];

// Schreib-Projektion: wie oben PLUS die Spalte embedding vector(256). Inhalt ist ein
// TECHNISCHER FEATURE-/MERKMALSVEKTOR (Token-Hash), KEIN semantisches Embedding — die
// Spalte heisst nur aus Legacy-Gruenden "embedding". Er wird write-time einmal persistiert
// (Sprint 2), beim LESEN aber weggelassen (V3_KO_READ_SELECT), weil er die PostgREST-Antwort
// pro Zeile stark aufblaeht und der Read-Pfad ihn nicht braucht.
const V3_KO_WRITE_COLUMNS = [...V3_KNOWLEDGE_OBJECT_COLUMNS, "embedding"];

// Optionaler 4. Parameter tenantId: NUR gesetzt von den 2 Live-Schreibpfaden
// (saveOfficeOutput, saveRenderedBriefingV3) — jeder andere Aufrufer (Decision-/
// Matching-/Profile-Embedding-Shadow, Raw-Documents, Knowledge-Objects) laesst
// ihn weg und bleibt dadurch unveraendert auf service_role.
async function v3Upsert(table, row, onConflict, tenantId) {
  const rows = await tenantRequest(`/rest/v1/${table}?on_conflict=${onConflict}`, tenantId, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(row)
  });
  return Array.isArray(rows) && rows.length ? rows[0] : row;
}

async function saveRawDocument(doc = {}) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  if (!doc.id) return { skipped: true, reason: "missing-id" };
  try {
    const saved = await v3Upsert("raw_documents", pickColumns(doc, V3_RAW_DOCUMENT_COLUMNS), "id");
    return { saved: true, id: saved.id || doc.id };
  } catch (error) {
    console.error("[v3Store] saveRawDocument fehlgeschlagen:", error.message);
    return { skipped: true, reason: "v3-store-error", error: error.message };
  }
}

async function saveKnowledgeObject(ko = {}) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  if (!ko.id || !ko.vorgang_id) return { skipped: true, reason: "missing-id-or-vorgang" };
  try {
    const row = pickColumns(ko, V3_KO_WRITE_COLUMNS);
    // Embedding als pgvector-Literal formatieren (Sprint 2). Fehlt es, bleibt die
    // Spalte unangetastet (kein Ueberschreiben mit NULL bei einem reinen Feld-Update).
    if (Array.isArray(ko.embedding) && ko.embedding.length) row.embedding = formatVector(ko.embedding);
    else delete row.embedding;
    const saved = await v3Upsert("knowledge_objects", row, "id");
    return { saved: true, id: saved.id || ko.id, vorgangId: saved.vorgang_id || ko.vorgang_id };
  } catch (error) {
    console.error("[v3Store] saveKnowledgeObject fehlgeschlagen:", error.message);
    return { skipped: true, reason: "v3-store-error", error: error.message };
  }
}

async function getKnowledgeObjectById(id) {
  if (!v3StoreReady() || !id) return null;
  try {
    const rows = await supabaseRequest(`/rest/v1/knowledge_objects?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (error) {
    console.error("[v3Store] getKnowledgeObjectById fehlgeschlagen:", error.message);
    return null;
  }
}

// P29-4 (Fix-Sprint Punkt 29): `null` bedeutet fuer Aufrufer "existiert nicht" —
// ein verschluckter LESEFEHLER ist davon nicht unterscheidbar und hat im
// Vormerkpfad ein fertiges Wissensobjekt auf pending zurueckstufen koennen.
// { throwOnError: true } laesst den Lesefehler deshalb sichtbar durchschlagen;
// ohne die Option bleibt das Verhalten fuer alle Bestandsaufrufer unveraendert.
async function getKnowledgeObjectByVorgang(vorgangId, { throwOnError = false } = {}) {
  if (!v3StoreReady() || !vorgangId) return null;
  try {
    const rows = await supabaseRequest(`/rest/v1/knowledge_objects?vorgang_id=eq.${encodeURIComponent(vorgangId)}&select=*&order=updated_at.desc&limit=1`);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (error) {
    console.error("[v3Store] getKnowledgeObjectByVorgang fehlgeschlagen:", error.message);
    if (throwOnError) throw error;
    return null;
  }
}

// --- Vorgangsaufloesung (Betriebsbefund B4) ---------------------------------
// Bestehende Vorgaenge unter einem Themenwurzel-Praefix holen. Grundlage der
// Reparatur aus docs/befund-csd-2026-vorgangsverlust.md: die Frage ist nicht mehr
// "gibt es genau diese Kennung?", sondern "gibt es einen Vorgang, der DIESELBE
// SACHE beschreibt?". Die Kandidatenmenge dafuer sind alle Vorgaenge derselben
// Themenwurzel — inklusive der ALTEN Kennungen der Form `vg-<wurzel>`, die exakt
// auf das Praefix fallen und dadurch weiter fortgeschrieben statt dupliziert werden.
//
// Bewusst `like` statt einer Bereichsabfrage: `knowledge_objects` ist klein
// (Groessenordnung 10^3), und eine linksverankerte `like`-Suche ist unter der
// Standard-Collation ohnehin nicht index-nutzbar. Korrektheit vor Mikro-Optimierung.
// MANDANTENNEUTRAL: `knowledge_objects` traegt kein `user_id`/`tenant_id` (ein
// Vorgang wird global genau einmal verstanden) — deshalb hier kein assertTenant.
function sanitizeVorgangPrefix(prefix) {
  // Praefixe entstehen aus slug() und enthalten nur [a-z0-9äöüß-]. Trotzdem
  // defensiv saeubern: PostgREST-Metazeichen duerfen nie in den Filter geraten.
  return String(prefix || "").replace(/[^a-z0-9äöüß-]/gi, "").slice(0, 40);
}

async function listKnowledgeObjectsByVorgangPrefix(prefixes = [], limit = 8) {
  if (!v3StoreReady()) return [];
  const sauber = [...new Set((Array.isArray(prefixes) ? prefixes : [prefixes]).map(sanitizeVorgangPrefix).filter(Boolean))];
  if (!sauber.length) return [];
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 8;
  try {
    const filter = sauber.length === 1
      ? `vorgang_id=like.${encodeURIComponent(`${sauber[0]}*`)}`
      : `or=(${sauber.map((p) => `vorgang_id.like.${p}*`).join(",")})`;
    // SPRINT 19: die Klassifikationsspalten gehoeren in diese Projektion. Dieser
    // Lesepfad liefert den `existing`-Datensatz, mit dem `understandUpdate` einen
    // Vorgang fortschreibt — ohne decision_level/classification_confidence koennte
    // die bereits ermittelte politische Ebene dort nicht wiederverwendet werden und
    // wuerde bei jeder Aktualisierung neu berechnet. Nur 3 zusaetzliche Spalten auf
    // maximal 8 Zeilen (kein Volltext, kein Vektor).
    //
    // SPRINT 20: aus demselben Grund gehoeren auch die beiden Geografie-Spalten in
    // diese Projektion. Ohne sie kann `understandUpdate` eine bereits belastbar
    // ermittelte betroffene Region nicht wiederverwenden — sie wuerde bei jeder
    // Aktualisierung neu berechnet und bei fehlendem Signal still verloren gehen.
    const cols = "id,vorgang_id,ko_version,status,understanding_status,headline,display_title,created_at,updated_at,source_document_count,decision_level,political_level,classification_confidence,affected_geographies,mentioned_geographies";
    const rows = await supabaseRequest(
      `/rest/v1/knowledge_objects?select=${cols}&${filter}&order=updated_at.desc&limit=${safeLimit}`
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error("[v3Store] listKnowledgeObjectsByVorgangPrefix fehlgeschlagen:", error.message);
    return [];
  }
}

// Die bereits mit einem Vorgang verknuepften Rohdokumente — der BELEG dafuer,
// worum es in diesem Vorgang tatsaechlich geht. Ohne sie muesste die Aufloesung
// sich auf die KI-formulierte Ueberschrift verlassen (schwaecherer Beleg).
async function listKoDocuments(knowledgeObjectId, limit = 40) {
  if (!v3StoreReady() || !knowledgeObjectId) return [];
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 40;
  try {
    const cols = "id,title,summary,published_at,url,canonical_url,content_hash,source_id,source_name,link_type,confidence";
    const rows = await supabaseRequest(
      `/rest/v1/ko_document_links?knowledge_object_id=eq.${encodeURIComponent(knowledgeObjectId)}&select=raw_documents(${cols})&limit=${safeLimit}`
    );
    return (Array.isArray(rows) ? rows : []).map((r) => r && r.raw_documents).filter(Boolean);
  } catch (error) {
    console.error("[v3Store] listKoDocuments fehlgeschlagen:", error.message);
    return [];
  }
}

// Read-Projektion: exakt die vom Read-Pfad genutzten Spalten OHNE das
// embedding vector(256) — das wird beim Lesen nie gebraucht, blaeht die
// PostgREST-Antwort aber pro Zeile deutlich auf (Perf: 200 Zeilen x Vektor).
const V3_KO_READ_SELECT = V3_KNOWLEDGE_OBJECT_COLUMNS.join(",");

// _signalError:true -> bei scharfem Fehler NICHT still [] liefern, sondern ein
// Sentinel { __storeError:true }. So kann der Aufrufer einen echten DB-Ausfall
// von "0 Vorgaenge" unterscheiden (sonst sieht ein Timeout wie Leerstand aus).
async function listKnowledgeObjects({ limit = 50, status = null, _signalError = false } = {}) {
  if (!v3StoreReady()) return _signalError ? { __storeError: true } : [];
  try {
    const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 50;
    let endpoint = `/rest/v1/knowledge_objects?select=${V3_KO_READ_SELECT}&order=updated_at.desc&limit=${safeLimit}`;
    if (status) endpoint += `&status=eq.${encodeURIComponent(status)}`;
    const rows = await supabaseRequest(endpoint);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error("[v3Store] listKnowledgeObjects fehlgeschlagen:", error.message);
    return _signalError ? { __storeError: true } : [];
  }
}

// SPRINT 23C-2A (Befund M-7): gezielter STAPEL-Lesezugriff auf genau die
// Wissensobjekte einer bereits feststehenden Trefferliste.
//
// WARUM NICHT EINFACH EIN GROESSERES FENSTER: `listKnowledgeObjects({limit:N})`
// liefert die N zuletzt GEAENDERTEN Objekte. Die Trefferliste des Matchings
// folgt aber der AEHNLICHKEIT, nicht der Aenderungszeit — beide Ordnungen haben
// nichts miteinander zu tun. Jedes feste N ist deshalb nur eine Wette darauf,
// dass sie sich zufaellig ueberlappen: sie stimmt bei kleinem Bestand, wird mit
// jedem neuen Wissensobjekt unwahrscheinlicher (Production 2026-07-29: ~1 500
// Objekte gegen ein Fenster von 200) und bricht dabei STILL. Diese Funktion
// fragt stattdessen nach den konkreten Kennungen — die gelesene Menge ist exakt
// die gebrauchte, unabhaengig davon, wie gross der Bestand wird.
//
// EINE Anfrage je 100 Kennungen, KEINE Abfrage je Treffer (kein N+1). Bei der
// produktiven Trefferzahl (`matchCount`, heute 20) ist das genau EINE Anfrage,
// die 20 statt 200 Zeilen liest — der Fix ist also auch guenstiger als der
// bisherige Fensterlauf, nicht teurer.
//
// MANDANTENNEUTRAL: `knowledge_objects` traegt kein `user_id`/`tenant_id` (ein
// Vorgang wird global genau einmal verstanden, siehe
// `listKnowledgeObjectsByVorgangPrefix`) — deshalb hier kein `assertTenant`.
// Die Mandantengrenze liegt eine Ebene hoeher und bleibt unveraendert: die
// Kennungen stammen ausschliesslich aus der Trefferliste, die das Matching fuer
// GENAU DIESEN Mandanten berechnet hat.
//
// FEHLERPOLITIK — fail closed und LAUT: ein echter Lesefehler wird GEWORFEN
// (`StorageReadError`) statt still als „kein Objekt gefunden" zu erscheinen.
// Genau diese Verwechslung von „nicht geladen" mit „nichts gefunden" ist der
// Kern von M-7. Ein wirklich nicht (mehr) vorhandenes Objekt fehlt dagegen
// einfach im Ergebnis — der Aufrufer laesst den Beleg dann leer und erfindet
// nichts.
const KO_ID_STAPEL = 100;

async function listKnowledgeObjectsByIds(ids = []) {
  // Deduplizieren und byte-stabil sortieren: zwei Laeufe mit derselben
  // Trefferliste erzeugen dieselben Anfragen in derselben Reihenfolge.
  const liste = [...new Set(
    (Array.isArray(ids) ? ids : [ids])
      .map((id) => (id == null ? "" : String(id)))
      .filter(Boolean)
  )].sort();
  if (!liste.length) return [];
  if (!v3StoreReady()) {
    throw new StorageReadError("knowledge_objects", new Error("v3-store nicht bereit"));
  }
  const out = [];
  try {
    for (let i = 0; i < liste.length; i += KO_ID_STAPEL) {
      const teil = liste.slice(i, i + KO_ID_STAPEL);
      // PostgREST-Konvention fuer `in.(...)`: jeder Wert doppelt gequotet.
      // Der Inhalt wird zusaetzlich prozentkodiert, damit weder ein Komma noch
      // ein Anfuehrungszeichen den Filter verlassen kann. Echte Kennungen
      // bestehen aus [a-z0-9-] — die Kodierung ist dort ein No-Op.
      const inList = teil.map((id) => `"${encodeURIComponent(id)}"`).join(",");
      const rows = await supabaseRequest(
        `/rest/v1/knowledge_objects?select=${V3_KO_READ_SELECT}&id=in.(${inList})&order=id.asc&limit=${teil.length}`
      );
      if (Array.isArray(rows)) out.push(...rows);
    }
    return out;
  } catch (error) {
    console.error("[v3Store] listKnowledgeObjectsByIds fehlgeschlagen:", error.message);
    throw new StorageReadError("knowledge_objects", error);
  }
}

// SPRINT 21: derselbe Lesepfad, aber SEITENWEISE und OHNE stille Kappung.
//
// WARUM ES DIESE ZWEITE FUNKTION BRAUCHT: `listKnowledgeObjects` setzt genau ein
// PostgREST-`limit`. PostgREST liefert aber hoechstens 1 000 Zeilen je Anfrage —
// ein Aufruf mit `limit=5000` bekommt still 1 000 und sieht aus wie ein
// vollstaendiger Bestand. Genau dieser Fehlermodus ist im Repo schon einmal
// aufgetreten (Nebenbefund W-1 bei `listRawDocuments`) und hat dort dazu
// gefuehrt, dass die Haelfte des Bestands unsichtbar blieb.
//
// Ein Bestandsvorgang wie die Nachklassifikation darf davon nicht betroffen
// sein: eine stille Teilmenge waere hier eine falsche Vorher/Nachher-Messung.
// Deshalb: feste Seitengroesse, `order` auf einer STABILEN Spalte (`id`, nicht
// `updated_at` — sonst kann ein paralleler Schreibvorgang Zeilen zwischen zwei
// Seiten verschieben), und ein echter Fehler wird GEWORFEN statt als Leerstand
// gemeldet.
async function listKnowledgeObjectsSeitenweise({ limit = 4000, status = null } = {}) {
  if (!v3StoreReady()) throw new StorageReadError("knowledge_objects", new Error("v3-store nicht bereit"));
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 4000;
  const out = [];
  try {
    for (let offset = 0; offset < safeLimit; offset += LEBENSZYKLUS_SEITE) {
      const seite = Math.min(LEBENSZYKLUS_SEITE, safeLimit - offset);
      let endpoint = `/rest/v1/knowledge_objects?select=${V3_KO_READ_SELECT}&order=id.asc&limit=${seite}&offset=${offset}`;
      if (status) endpoint += `&status=eq.${encodeURIComponent(status)}`;
      const rows = await supabaseRequest(endpoint);
      if (!Array.isArray(rows) || !rows.length) break;
      out.push(...rows);
      if (rows.length < seite) break;
    }
    return out;
  } catch (error) {
    console.error("[v3Store] listKnowledgeObjectsSeitenweise fehlgeschlagen:", error.message);
    throw new StorageReadError("knowledge_objects", error);
  }
}

// --- Helmut Core V3 — C7a/C7c Storage-Naht (additiv, keine KI) ---------------
// Eigene Flags pro Engine (Default AUS). Steuern das VERHALTEN der Engines
// (matching.js / lazyUnderstanding.js). Die Storage-Writes unten
// gaten wie C5 auf v3StoreReady() -> Flag aus/kein Supabase = inert, kein Crash.
function v3MatchingEnabled() {
  return isFlagOn(process.env.HELMUT_V3_MATCHING);
}
// Sprint 23B-1: Rollout-Grenze der Matching-Auditpersistenz (Roadmap-Punkt 23).
// DEFAULT AUS. Solange das Flag nicht gesetzt ist, findet KEIN Zugriff auf
// matching_runs statt — kein Lesen, kein Schreiben, keine Sperre, keine neue
// Fehlerquelle; matching_results wird exakt wie bisher geschrieben.
// Voraussetzung fuer die Aktivierung: Migration 20260728_matching_audit
// angewendet. Aktivierung ist eine Freigabeentscheidung (CLAUDE.md §5).
// Zusaetzlich an den V3-Store gekoppelt: ohne Supabase-Store wird auch
// matching_results nicht geschrieben — es gaebe dann nichts zu protokollieren,
// und eine „aktive" Auditpersistenz ohne Ablage waere falsches Gruen.
function matchingAuditEnabled() {
  return isFlagOn(process.env.HELMUT_MATCHING_AUDIT) && v3StoreReady();
}
// Sprint M-8: Relevanzriegel im Matching. DEFAULT AUS. Aus = exakt das
// bisherige Top-N-Verhalten. An = es werden nur begruendbare Treffer
// veroeffentlicht, ohne Auffuellung (lib/helmut/matching-relevanz.js).
// Bewusst NICHT an v3StoreReady() gekoppelt: der Riegel ist eine reine
// Auswahlregel und wirkt in jedem Pfad gleich.
function matchingRelevanzGateEnabled() {
  return isFlagOn(process.env.HELMUT_MATCHING_RELEVANZ_GATE);
}
function v3LazyUnderstandingEnabled() {
  return isFlagOn(process.env.HELMUT_V3_LAZY_UNDERSTANDING);
}

// pgvector erwartet den Vektor als Literal '[a,b,c]' (nicht als JSON-Array).
function formatVector(arr) {
  return `[${(Array.isArray(arr) ? arr : []).map((n) => (Number.isFinite(Number(n)) ? Number(n) : 0)).join(",")}]`;
}

// C7a: Merkmalsvektor des Nutzerprofils EINMALIG speichern (bei Profiländerung neu).
// --- Tenant-Guard (P0-1, audit/fix-plan.md) ---------------------------------
// Zentrale Absicherung der Mandantentrennung: JEDE mandantenbezogene V3-Abfrage
// MUSS einen userId (= politicianId) tragen. Ein fehlender/leerer Tenant-Kontext
// ist ein Programmierfehler und wird HART abgewiesen — es gibt KEINEN stillen
// Fallback mehr auf "alle Mandanten". Ersetzt das frühere `if (userId) …`-Muster
// in listDecisions/listMatchingResults, das ohne userId ungefiltert alle Mandanten
// lieferte (latentes IDOR). Der Guard greift BEWUSST vor dem v3StoreReady-Gate,
// damit der Kontrakt unabhängig von der Store-Verfügbarkeit immer gilt (und offline
// testbar ist).
class TenantContextError extends Error {
  constructor(fn) {
    super(`[tenant-guard] ${fn}: userId (Mandantenkontext) ist erforderlich`);
    this.name = "TenantContextError";
    this.code = "TENANT_CONTEXT_REQUIRED";
  }
}

// Wirft, wenn kein belastbarer Mandantenkontext vorliegt; sonst der normalisierte String.
function assertTenant(userId, fn = "query") {
  if (userId == null || (typeof userId === "string" && userId.trim() === "")) {
    throw new TenantContextError(fn);
  }
  return String(userId);
}

// Mandantenuebergreifender Schreibversuch (Sprint-1-Sicherheit): eine Bulk-Write
// vermischt Zeilen mehrerer Mandanten ODER traegt einen fremden user_id.
class CrossTenantWriteError extends Error {
  constructor(fn, detail) {
    super(`[tenant-guard] ${fn}: mandantenuebergreifender Schreibversuch blockiert${detail ? " (" + detail + ")" : ""}`);
    this.name = "CrossTenantWriteError";
    this.code = "CROSS_TENANT_WRITE";
  }
}

// Schreib-Guard: eine mandantenbezogene Bulk-Write darf keine datentragende Zeile
// (mit id) ohne user_id enthalten. Statt sie STILL zu verwerfen (Datenverlust) oder
// tenant-los zu schreiben, wird der Fehler hart sichtbar gemacht.
//
// Sprint-1-Haertung (Cross-Tenant-Write, Testlücke c): zusaetzlich darf eine
// Bulk-Write NICHT Zeilen MEHRERER Mandanten mischen (typischer Cross-Tenant-Bug),
// und wenn der Aufrufer den erwarteten Mandanten kennt (expectedTenant), muss JEDE
// Zeile zu ihm gehoeren. Ohne expectedTenant bleibt das Verhalten rueckwaerts-
// kompatibel (nur die Praesenz-Pruefung + das Mischverbot). Da RLS heute inert ist
// (service_role), ist auch dies eine App-seitige Verteidigung.
function assertTenantRows(rows, fn = "write", expectedTenant = null) {
  const provided = Array.isArray(rows) ? rows : [];
  if (provided.some((r) => r && r.id && (r.user_id == null || String(r.user_id).trim() === ""))) {
    throw new TenantContextError(fn);
  }
  const owners = new Set();
  for (const r of provided) {
    if (r && r.user_id != null && String(r.user_id).trim() !== "") owners.add(String(r.user_id));
  }
  if (owners.size > 1) {
    throw new CrossTenantWriteError(fn, `gemischte Mandanten: ${[...owners].sort().join(", ")}`);
  }
  const exp = expectedTenant == null ? "" : String(expectedTenant).trim();
  if (exp && owners.size === 1 && !owners.has(exp)) {
    throw new CrossTenantWriteError(fn, `erwartet ${exp}, gefunden ${[...owners][0]}`);
  }
  return provided;
}

async function saveProfileEmbedding(entry = {}) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  if (!entry.user_id) return { skipped: true, reason: "missing-user" };
  if (!Array.isArray(entry.embedding) || !entry.embedding.length) return { skipped: true, reason: "missing-embedding" };
  try {
    const row = {
      user_id: entry.user_id,
      embedding: formatVector(entry.embedding),
      profile_hash: entry.profile_hash || null,
      dim: entry.dim || entry.embedding.length,
      updated_at: new Date().toISOString()
    };
    const saved = await v3Upsert("profile_embeddings", row, "user_id");
    return { saved: true, userId: saved.user_id || entry.user_id };
  } catch (error) {
    console.error("[v3Store] saveProfileEmbedding fehlgeschlagen:", error.message);
    return { skipped: true, reason: "v3-store-error", error: error.message };
  }
}

async function getProfileEmbedding(userId) {
  const uid = assertTenant(userId, "getProfileEmbedding");
  if (!v3StoreReady()) return null;
  userId = uid;
  try {
    const rows = await supabaseRequest(`/rest/v1/profile_embeddings?user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (error) {
    console.error("[v3Store] getProfileEmbedding fehlgeschlagen:", error.message);
    return null;
  }
}

// C7a: pgvector-Aehnlichkeitssuche via RPC (harte Filter Partei/Ausschuss/Wahlkreis
// laufen in SQL). Ohne Store/Supabase inert (kein Netzwerk).
async function matchKnowledgeObjectsByEmbedding(params = {}) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason(), results: [] };
  const embedding = params.embedding;
  if (!Array.isArray(embedding) || !embedding.length) return { skipped: true, reason: "missing-embedding", results: [] };
  try {
    const body = {
      query_embedding: formatVector(embedding),
      match_count: Math.max(1, Math.floor(Number(params.matchCount) || 20)),
      filter_parties: params.filterParties && params.filterParties.length ? params.filterParties : null,
      filter_committees: params.filterCommittees && params.filterCommittees.length ? params.filterCommittees : null,
      filter_regions: params.filterRegions && params.filterRegions.length ? params.filterRegions : null
    };
    const rows = await supabaseRequest(`/rest/v1/rpc/match_knowledge_objects`, {
      method: "POST",
      body: JSON.stringify(body)
    });
    return { results: Array.isArray(rows) ? rows : [] };
  } catch (error) {
    console.error("[v3Store] matchKnowledgeObjectsByEmbedding fehlgeschlagen:", error.message);
    return { skipped: true, reason: "v3-store-error", error: error.message, results: [] };
  }
}

// C7a: erklaerbare Match-Ergebnisse pro Nutzer x Vorgang speichern (Bulk-Upsert).
async function saveMatchingResults(rows = [], expectedUserId = null) {
  assertTenantRows(rows, "saveMatchingResults(rows)", expectedUserId);
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason(), saved: 0 };
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && r.id && r.user_id);
  if (!list.length) return { skipped: true, reason: "no-rows", saved: 0 };
  try {
    const payload = list.map((r) => {
      const base = {
        id: r.id,
        user_id: r.user_id,
        knowledge_object_id: r.knowledge_object_id || null,
        vorgang_id: r.vorgang_id || null,
        similarity: r.similarity != null ? r.similarity : null,
        rank: r.rank != null ? r.rank : null,
        matched_features: Array.isArray(r.matched_features) ? r.matched_features : [],
        filters: r.filters && typeof r.filters === "object" ? r.filters : {}
      };
      // Sprint 23B-1: Audit-Spalten NUR mitschreiben, wenn der Aufrufer sie
      // tatsaechlich mitliefert (also nur im aktivierten Auditpfad). Ohne
      // Auditpersistenz ist die geschriebene Nutzlast byte-identisch zu vorher —
      // und ein Aufruf gegen eine Datenbank OHNE die Migration kann keine
      // unbekannte Spalte ansprechen.
      if (!r.run_id) return base;
      return {
        ...base,
        run_id: r.run_id,
        profil_hash: r.profil_hash != null ? r.profil_hash : null,
        ko_eingabe_hash: r.ko_eingabe_hash != null ? r.ko_eingabe_hash : null,
        ko_version: r.ko_version != null ? r.ko_version : null,
        engine_version: r.engine_version != null ? r.engine_version : null,
        rezept_version: r.rezept_version != null ? r.rezept_version : null,
        vektor_version: r.vektor_version != null ? r.vektor_version : null,
        eingabe_fingerabdruck: r.eingabe_fingerabdruck != null ? r.eingabe_fingerabdruck : null,
        berechnet_am: r.berechnet_am != null ? r.berechnet_am : null,
        aktuell: true,
        abgeloest_am: null,
        signale: r.signale && typeof r.signale === "object" ? r.signale : {},
        begruendung: r.begruendung != null ? r.begruendung : null,
        updated_at: r.updated_at != null ? r.updated_at : null
      };
    });
    await v3Upsert("matching_results", payload, "id");
    return { saved: payload.length };
  } catch (error) {
    console.error("[v3Store] saveMatchingResults fehlgeschlagen:", error.message);
    return { skipped: true, reason: "v3-store-error", error: error.message, saved: 0 };
  }
}

// ── Sprint 23B-1: Auditprotokoll der Matching-Laeufe (matching_runs) ─────────
// Alle drei Funktionen erzwingen den Mandantenkontext (assertTenant/
// assertTenantRows) UND einen expliziten user_id=eq.<mandant>-Filter — genau
// wie fuer jede andere mandantenbezogene Tabelle (CLAUDE.md §4.1). RLS ist
// dabei ausdruecklich NICHT die Durchsetzung: service_role umgeht sie.
//
// Anders als die uebrigen v3-Schreibpfade schlucken sie Fehler NICHT: ein
// Auditfehler vor der Veroeffentlichung muss den Lauf abbrechen, damit keine
// unbelegbare Ergebnisgeneration entsteht (Fehlerpolitik: matching-audit.js).

// Sucht ausschliesslich einen VOLLSTAENDIGEN Lauf mit diesem Fingerabdruck.
// Ein 'laufend' oder 'fehlgeschlagen' gebliebener Lauf ist hier bewusst kein
// Treffer — er darf nicht als aktueller Stand gelten.
async function getCompletedMatchingRun({ userId = null, fingerprint = null } = {}) {
  const uid = assertTenant(userId, "getCompletedMatchingRun");
  if (!v3StoreReady()) return null;
  if (!fingerprint) return null;
  const endpoint = `/rest/v1/matching_runs?select=*`
    + `&user_id=eq.${encodeURIComponent(uid)}`
    + `&eingabe_fingerabdruck=eq.${encodeURIComponent(fingerprint)}`
    + `&status=eq.vollstaendig&order=gestartet_am.desc&limit=1`;
  const rows = await supabaseRequest(endpoint);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function saveMatchingRun(row = {}) {
  assertTenantRows([row], "saveMatchingRun(row)", row && row.user_id);
  if (!v3StoreReady()) throw new Error("matching_runs: V3-Store nicht bereit");
  if (!row.id) throw new Error("matching_runs: Laufkennung fehlt");
  const rows = await supabaseRequest("/rest/v1/matching_runs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row)
  });
  return Array.isArray(rows) && rows.length ? rows[0] : row;
}

// Fortschreiben einer Laufzeile. Der Mandantenfilter ist Pflicht — damit kann
// selbst ein falsch uebergebenes Laufkennzeichen keine fremde Zeile treffen.
// Der Unveraenderlichkeits-Trigger der Datenbank lehnt jede fachliche Aenderung
// an einem bereits abgeschlossenen Lauf zusaetzlich ab.
async function updateMatchingRun(runId, patch = {}, userId = null) {
  const uid = assertTenant(userId, "updateMatchingRun");
  if (!v3StoreReady()) throw new Error("matching_runs: V3-Store nicht bereit");
  if (!runId) throw new Error("matching_runs: Laufkennung fehlt");
  const endpoint = `/rest/v1/matching_runs?id=eq.${encodeURIComponent(runId)}`
    + `&user_id=eq.${encodeURIComponent(uid)}`;
  const rows = await supabaseRequest(endpoint, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch)
  });
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error(`matching_runs: Lauf ${runId} fuer Mandant ${uid} nicht aktualisierbar`);
  }
  return rows[0];
}

// ATOMARE Veroeffentlichung: Laufabschluss, Ergebnisprojektion und Abloesung
// in EINEM Aufruf und damit in EINER Datenbanktransaktion.
//
// Das ist bewusst KEINE Folge von drei Schreibvorgaengen. matching_results wird
// in place ueberschrieben — waere der Ergebnis-Upsert ein eigener Aufruf, haette
// ein Abbruch danach den letzten vollstaendigen Stand bereits zerstoert, ganz
// gleich in welcher Reihenfolge die Laufzeile folgt. Entweder wird alles
// sichtbar oder nichts.
//
// Die Datenbankfunktion prueft Mandant, Laufkennung und Laufzustand zusaetzlich
// selbst; hier davor stehen dieselben App-Guards wie an jedem anderen
// mandantenbezogenen Schreibpfad.
async function publishMatchingRun({ runId = null, userId = null, rows = [], abgeloestAm = null } = {}) {
  const uid = assertTenant(userId, "publishMatchingRun");
  const list = Array.isArray(rows) ? rows : [];
  assertTenantRows(list, "publishMatchingRun(rows)", uid);
  if (!v3StoreReady()) throw new Error("matching_runs: V3-Store nicht bereit");
  if (!runId) throw new Error("matching_runs: Laufkennung fehlt");
  if (list.some((r) => !r || r.run_id !== runId)) {
    throw new CrossTenantWriteError("publishMatchingRun(rows)", `Ergebniszeile verweist nicht auf Lauf ${runId}`);
  }
  const antwort = await supabaseRequest("/rest/v1/rpc/helmut_publish_matching_run", {
    method: "POST",
    body: JSON.stringify({
      p_run_id: runId,
      p_user_id: uid,
      p_results: list,
      p_abgeloest_am: abgeloestAm || new Date().toISOString()
    })
  });
  const ergebnis = Array.isArray(antwort) ? antwort[0] : antwort;
  if (!ergebnis || ergebnis.status !== "vollstaendig") {
    throw new Error(`matching_runs: Veroeffentlichung von ${runId} nicht bestaetigt`);
  }
  return {
    runId,
    status: ergebnis.status,
    veroeffentlicht: Number(ergebnis.veroeffentlicht) || 0,
    abgeloest: Number(ergebnis.abgeloest) || 0
  };
}

// HOTFIX (2026-07-29) — AKTIVER PILOTBLOCKER, nicht mehr latent.
// Seit `HELMUT_MATCHING_AUDIT` in Production aktiv ist, werden aus der Trefferliste
// gefallene Ergebnisse NICHT mehr geloescht, sondern mit `aktuell = false` +
// `abgeloest_am` erhalten (Sprint 23B-1). Der erste Production-Lauf hat damit 290
// Zeilen erzeugt: 271 aktuell, 19 abgeloest. Dieser Lesepfad ist der einzige
// produktive Konsument (lage.js -> "Aktuelle Lage", mittelbar das Briefing-Narrativ)
// und filterte bis hierher nicht darauf — abgeloeste Ergebnisse konnten dem
// Abgeordneten als aktuelle Lage erscheinen UND aktuelle Vorgaenge aus dem Limit
// verdraengen.
// Deshalb ist "nur aktuelle Ergebnisse" jetzt der DEFAULT. Der Aktualitaetsfilter
// wird SERVERSEITIG vor `limit` angewendet (PostgREST: where -> order -> limit),
// abgeloeste Zeilen koennen also keinen Platz im Nutzerlimit belegen. Die
// Sortierung bleibt bewusst unveraendert (`created_at.desc`) — dieser Hotfix
// aendert keine Rangfolge und loescht keine Historie.
// Altbestand ist nicht betroffen: die Migration setzt `aktuell` auf
// `not null default true`, Legacy-Zeilen mit `run_id = NULL` bleiben sichtbar.
// `includeAbgeloest: true` bleibt als ausdruecklicher Historien-/Auditzugang
// erhalten (kein stiller Verlust der Nachvollziehbarkeit); der Backup-Export liest
// die Tabelle ohnehin direkt und ist von der Aenderung unberuehrt.
async function listMatchingResults({ userId = null, limit = 50, includeAbgeloest = false } = {}, deps = {}) {
  const uid = assertTenant(userId, "listMatchingResults");
  const ready = deps.ready || v3StoreReady;
  // Live-Lesepfad (lage.js waehrend /api/app/start) -> tenantRequest, faellt ohne
  // Tenant-JWT-Modus transparent auf service_role zurueck. deps.request (Tests)
  // hat weiterhin Vorrang.
  const request = deps.request || ((endpoint) => tenantRequest(endpoint, uid));
  if (!ready()) return [];
  try {
    const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 50;
    // Mandantenfilter ist PFLICHT (kein optionaler Anhang mehr). Der
    // Aktualitaetsfilter kommt zusaetzlich dazu und greift vor `limit`.
    const aktuellFilter = includeAbgeloest ? "" : "&aktuell=is.true";
    const endpoint = `/rest/v1/matching_results?select=*&user_id=eq.${encodeURIComponent(uid)}${aktuellFilter}&order=created_at.desc&limit=${safeLimit}`;
    const rows = await request(endpoint);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error("[v3Store] listMatchingResults fehlgeschlagen:", error.message);
    return [];
  }
}

// Nur einen parse-baren Zeitstempel als ISO durchlassen, sonst null (schützt den
// timestamptz-Spaltentyp vor Modell-Freitext wie "sofort").
function toTimestampOrNull(value) {
  if (value == null || value === "") return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// V3-Decision Engine: pro Nutzer x Vorgang die deterministische Bewertung +
// Entscheidung (ersetzt personalized_recommendations). Bulk-Upsert per stabiler id
// (dec-<user>-<ko>) -> ein erneuter Lauf aktualisiert dieselbe Zeile idempotent.
async function saveDecisions(rows = [], expectedUserId = null) {
  assertTenantRows(rows, "saveDecisions(rows)", expectedUserId);
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason(), saved: 0 };
  const list = (Array.isArray(rows) ? rows : []).filter((r) => r && r.id && r.user_id);
  if (!list.length) return { skipped: true, reason: "no-rows", saved: 0 };
  try {
    const payload = list.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      knowledge_object_id: r.knowledge_object_id || null,
      vorgang_id: r.vorgang_id || null,
      score: r.score != null ? r.score : 0,
      decision: r.decision || null,
      priority_type: r.priority_type || null,
      matched_features: Array.isArray(r.matched_features) ? r.matched_features : [],
      chance: r.chance != null ? r.chance : null,
      risk: r.risk != null ? r.risk : null,
      status_change: r.status_change != null ? r.status_change : null,
      // Defensive: ein ungültiger deadline-Wert (Modell-Freitext) darf nicht den
      // ganzen Batch-Upsert per 400 verwerfen -> nur valide Timestamps, sonst null.
      deadline: toTimestampOrNull(r.deadline),
      status: r.status || "new",
      updated_at: new Date().toISOString()
    }));
    await v3Upsert("decisions", payload, "id");
    return { saved: payload.length };
  } catch (error) {
    console.error("[v3Store] saveDecisions fehlgeschlagen:", error.message);
    return { skipped: true, reason: "v3-store-error", error: error.message, saved: 0 };
  }
}

async function listDecisions({ userId = null, limit = 50 } = {}, deps = {}) {
  const uid = assertTenant(userId, "listDecisions");
  const ready = deps.ready || v3StoreReady;
  // Aktuell kein Produktionsaufrufer (siehe docs/auth-service-role-matrix.md),
  // aus Konsistenz dennoch auf tenantRequest umgestellt. deps.request (Tests) hat Vorrang.
  const request = deps.request || ((endpoint) => tenantRequest(endpoint, uid));
  if (!ready()) return [];
  try {
    const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 50;
    // Mandantenfilter ist PFLICHT (kein optionaler Anhang mehr).
    const endpoint = `/rest/v1/decisions?select=*&user_id=eq.${encodeURIComponent(uid)}&order=score.desc&limit=${safeLimit}`;
    const rows = await request(endpoint);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error("[v3Store] listDecisions fehlgeschlagen:", error.message);
    return [];
  }
}

// C7c: Vorgang als 'pending' vormerken (noch NICHT verstanden, KEIN KI-Call).
// Idempotent: ein bereits vorhandenes KO wird NIE ueberschrieben.
async function savePendingKnowledgeObject(vorgangId, meta = {}) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  if (!vorgangId) return { skipped: true, reason: "missing-vorgang" };
  try {
    // P29-4: der Existenz-Check ist FAIL-CLOSED. Ein Lesefehler heisst "unbekannt,
    // ob ein (womoeglich fertiges) Wissensobjekt existiert" — dann darf hier NIE
    // geschrieben werden, sonst stuft der pending-Upsert ein fertig verstandenes
    // Objekt zurueck. Die Vormerkung wird nur vertagt (exakt das Verhalten, das
    // schon immer fuer Schreibfehler galt); der naechste Lauf holt sie nach.
    let existing;
    try {
      existing = await getKnowledgeObjectByVorgang(vorgangId, { throwOnError: true });
    } catch (leseFehler) {
      return { skipped: true, reason: "existenz-unbekannt", error: String((leseFehler && leseFehler.message) || "").slice(0, 200) };
    }
    if (existing) return { skipped: true, reason: "exists", id: existing.id, status: existing.status };
    const row = {
      id: `ko-${vorgangId}`,
      vorgang_id: vorgangId,
      status: "pending",
      understanding_status: "pending", // explizit (nicht nur DB-Default) -> C8 findet ihn
      source_document_count: Number(meta.source_document_count) || 0,
      headline: meta.headline ? String(meta.headline).slice(0, 300) : null
    };
    const saved = await v3Upsert("knowledge_objects", pickColumns(row, V3_KNOWLEDGE_OBJECT_COLUMNS), "id");
    return { saved: true, id: saved.id || row.id, status: "pending" };
  } catch (error) {
    console.error("[v3Store] savePendingKnowledgeObject fehlgeschlagen:", error.message);
    return { skipped: true, reason: "v3-store-error", error: error.message };
  }
}

// C8: die von C7c vorgemerkten Vorgaenge holen, die C8 noch verstehen soll.
// status='pending' = noch nicht verstanden; understanding_status='failed' wird
// bewusst NICHT erneut versucht (geparkt), sonst laeuft ein kaputter Vorgang
// jeden Lauf erneut ins KI-Budget. 'failed-final' (terminal, OP-06/P1-4) ist
// ebenfalls ausgeschlossen — sonst wuerde ein aussortierter Vorgang jeden Lauf
// erneut geprueft und bei spaeter passendem Cluster sogar erneut verstanden.
// Inert wenn Flag/Supabase aus (kein Crash).
async function listPendingKnowledgeObjects({ limit = 50 } = {}) {
  const rows = await listKnowledgeObjects({ status: "pending", limit });
  return (Array.isArray(rows) ? rows : []).filter((ko) => ko
    && ko.understanding_status !== "failed"
    && !isTerminalUnderstandingStatus(ko.understanding_status));
}

// --- W-1 (Werkzeug-Haertung 2026-07-27): Lesefehler sind KEINE leere Menge ---
// Bis zu diesem Sprint fing jede Lebenszyklus-List-Funktion ihre Fehler selbst
// und lieferte [] (listRawDocuments/listRecentRawDocuments) oder sogar eine
// stille TEILMENGE (listKoDocumentLinks/listKnowledgeObjectStates gaben das bis
// zum Fehler Gelesene zurueck). Ein DNS-, Timeout-, Auth- oder Storagefehler war
// fuer den Aufrufer von "erfolgreich, aber leer" nicht unterscheidbar — das
// Nachholwerkzeug meldete dann "Nichts nachzuholen" mit Exit 0 (falsches Gruen,
// Befund W-1). Jetzt gilt:
//   * [] bedeutet ausschliesslich "erfolgreich gelesen, null Zeilen".
//   * Ein technischer Fehler wird als typisierter StorageReadError GEWORFEN —
//     mit Quelle (Tabellenname) und inhaltsfreier Fehlerklasse, Meldung redigiert
//     (redactSensitive), nie mit Secrets oder Connection-Strings.
//   * v3StoreReady()===false bleibt bewusst [] — das ist ein KONFIGURATIONS-
//     zustand (Flag/Env fehlt, lokaler Betrieb, Tests), kein Laufzeitfehler.
//     Werkzeuge, die den Unterschied brauchen, pruefen v3StoreReady() vorab.
// Fehlermeldung samt cause-Kette einsammeln: Nodes fetch (undici) wirft bei
// DNS-/Verbindungsfehlern nur "fetch failed" — der eigentliche Grund
// (getaddrinfo ENOTFOUND, ECONNREFUSED …) steht in error.cause.
function lesefehlerKette(error) {
  const teile = [];
  let e = error;
  for (let tiefe = 0; tiefe < 4 && e; tiefe += 1) {
    if (typeof e === "string") { teile.push(e); break; }
    if (e.message) teile.push(String(e.message));
    if (e.code && !teile.join(" ").includes(String(e.code))) teile.push(String(e.code));
    e = e.cause;
  }
  return teile.join(" :: ") || "unbekannt";
}

function klassifiziereLesefehler(error) {
  const m = lesefehlerKette(error).toLowerCase();
  // Auth VOR der generischen 4xx-Klasse: ein abgelaufener/falscher Service-Key
  // ist betrieblich etwas anderes als eine kaputte Query.
  if (m.includes("401") || m.includes("403") || m.includes("unauthorized")
    || m.includes("permission denied") || m.includes("jwt") || m.includes("api key") || m.includes("apikey")) return "auth";
  // DNS/Verbindung VOR classifyPipelineError: dessen "supabase"->db-Heuristik
  // wuerde sonst jeden Fehler fangen, dessen HOSTNAME "supabase" enthaelt
  // (getaddrinfo ENOTFOUND xyz.supabase.co ist ein DNS-, kein DB-Fehler).
  if (m.includes("enotfound") || m.includes("eai_again") || m.includes("getaddrinfo")) return "dns";
  if (m.includes("econnrefused") || m.includes("econnreset")) return "connection";
  try { return require("./redact").classifyPipelineError(m); } catch (_) { return "unknown"; }
}

class StorageReadError extends Error {
  constructor(quelle, cause) {
    const fehlerklasse = klassifiziereLesefehler(cause);
    let meldung = lesefehlerKette(cause);
    try { meldung = require("./redact").redactSensitive(meldung); } catch (_) { /* Redaktion darf den Fehler nicht verdecken */ }
    super(`Lesefehler ${quelle} (${fehlerklasse}): ${meldung.slice(0, 240)}`);
    this.name = "StorageReadError";
    this.quelle = quelle;             // z. B. "raw_documents"
    this.fehlerklasse = fehlerklasse; // dns | timeout | auth | db | connection | http-4xx | http-5xx | ...
    this.cause = cause;
  }
}

// C8: minimierte raw_documents der letzten 30 Tage aus dem V3-Store holen.
// Liefert die Zeilen, die runPendingUnderstandingShadow als rawDocsOrItems benoetigt.
// Inert wenn v3StoreReady() false ist (kein Crash, leeres Array).
// PostgREST liefert serverseitig hoechstens `max-rows` Zeilen je Anfrage (hier
// 1000). Ein `limit=2000` wurde deshalb bisher STILL auf 1000 gekappt — der
// Aufrufer sah ein vollstaendiges Ergebnis, hatte aber die Haelfte nicht. Genau
// diese Art stiller Kappung ist der Kern von Betriebsbefund B4, deshalb wird hier
// seitenweise gelesen, bis das angeforderte Limit erreicht oder die Menge zu Ende ist.
const RAW_DOC_SEITE = 1000;

async function fetchRawDocumentPages(basePath, limit) {
  const ziel = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : RAW_DOC_SEITE;
  const out = [];
  for (let offset = 0; offset < ziel; offset += RAW_DOC_SEITE) {
    const seite = Math.min(RAW_DOC_SEITE, ziel - offset);
    const rows = await supabaseRequest(`${basePath}&limit=${seite}&offset=${offset}`);
    if (!Array.isArray(rows) || !rows.length) break;
    out.push(...rows);
    if (rows.length < seite) break;
  }
  return out;
}

async function listRecentRawDocuments(limit = 500, days = 30) {
  if (!v3StoreReady()) return [];
  try {
    const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    return await fetchRawDocumentPages(
      `/rest/v1/raw_documents?select=id,content_hash,canonical_url,title,summary,url,source_name,source_id,published_at,created_at&created_at=gte.${encodeURIComponent(cutoffIso)}&order=created_at.desc`,
      limit
    );
  } catch (error) {
    // W-1: NICHT mehr [] — ein Lesefehler darf nie wie "keine Dokumente" aussehen.
    console.error("[v3Store] listRecentRawDocuments fehlgeschlagen:", error.message);
    throw new StorageReadError("raw_documents", error);
  }
}

// Raw-Dokumente der letzten `days` Tage mit vollem Spaltensatz (fuer den
// Provenienz-Backfill: Clustering + best_source_url-Ableitung). Inert ohne Store.
async function listRawDocuments({ limit = 800, days = 45 } = {}) {
  if (!v3StoreReady()) return [];
  try {
    const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    // created_at ergaenzt (Betriebsbefund B4): ohne den Einsammel-Zeitpunkt laesst
    // sich der Endzustand eines Rohdokuments nicht gegen eine Karenzzeit pruefen —
    // `published_at` ist der Zeitpunkt der Veroeffentlichung, nicht des Einsammelns,
    // und fehlt bei einem Teil der Zeilen ganz.
    const cols = "id,content_hash,canonical_url,title,summary,url,source_name,source_id,source_type,confidence,link_type,published_at,retrieved_at,created_at,document_type,wahlperiode";
    return await fetchRawDocumentPages(
      `/rest/v1/raw_documents?select=${cols}&created_at=gte.${encodeURIComponent(cutoffIso)}&order=created_at.desc`,
      limit
    );
  } catch (error) {
    // W-1: NICHT mehr [] — ein Lesefehler darf nie wie "keine Dokumente" aussehen.
    console.error("[v3Store] listRawDocuments fehlgeschlagen:", error.message);
    throw new StorageReadError("raw_documents", error);
  }
}

// --- Lebenszyklus-Daten (Betriebsbefund B4, Phase 10) -----------------------
// Genau die drei Mengen, aus denen sich der Endzustand jedes Rohdokuments
// ABLEITEN laesst — ohne neue Tabelle, ohne neue Spalte, ausschliesslich lesend:
// die Rohdokumente eines Fensters, ihre Vorgangs-Verknuepfungen und der Zustand
// der beteiligten Vorgaenge. Auswertung: lib/helmut/vorgangs-lebenszyklus.js.
//
// MANDANTENNEUTRAL: alle drei Tabellen tragen kein `user_id`/`tenant_id` — ein
// Vorgang wird global genau einmal verstanden. Deshalb kein assertTenant; der
// Aufrufer darf daraus auch keine mandantenbezogene Aussage ableiten.
const LEBENSZYKLUS_SEITE = 1000;

async function listKoDocumentLinks({ limit = 4000 } = {}) {
  if (!v3StoreReady()) return [];
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 4000;
  const out = [];
  try {
    for (let offset = 0; offset < safeLimit; offset += LEBENSZYKLUS_SEITE) {
      const seite = Math.min(LEBENSZYKLUS_SEITE, safeLimit - offset);
      const rows = await supabaseRequest(
        `/rest/v1/ko_document_links?select=knowledge_object_id,raw_document_id,created_at&order=created_at.desc&limit=${seite}&offset=${offset}`
      );
      if (!Array.isArray(rows) || !rows.length) break;
      out.push(...rows);
      if (rows.length < seite) break;
    }
    return out;
  } catch (error) {
    // W-1: bisher wurde hier die TEILMENGE `out` zurueckgegeben — schlimmer als
    // leer, weil unverknuepfte Dokumente dann faelschlich als Nachhol-Kandidaten
    // erschienen (unnoetige KI-Kosten) bzw. Rueckstaende unsichtbar wurden.
    console.error("[v3Store] listKoDocumentLinks fehlgeschlagen:", error.message);
    throw new StorageReadError("ko_document_links", error);
  }
}

// Zustandsfelder ALLER Vorgaenge — standardmaessig OHNE Inhaltsspalten (kein
// Text, kein Embedding): fuer die Endzustandsableitung genuegen Kennung und
// Zustand. `mitUeberschrift` ergaenzt die beiden Titelspalten; sie werden nur
// dort gebraucht, wo ein Bestand ohne verknuepfte Dokumente auf Gleichheit
// geprueft werden muss (Vergleichsmessung alt/neu).
async function listKnowledgeObjectStates({ limit = 4000, mitUeberschrift = false } = {}) {
  if (!v3StoreReady()) return [];
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 4000;
  const spalten = `id,vorgang_id,status,understanding_status,ko_version,created_at,updated_at${mitUeberschrift ? ",headline,display_title" : ""}`;
  const out = [];
  try {
    for (let offset = 0; offset < safeLimit; offset += LEBENSZYKLUS_SEITE) {
      const seite = Math.min(LEBENSZYKLUS_SEITE, safeLimit - offset);
      const rows = await supabaseRequest(
        `/rest/v1/knowledge_objects?select=${spalten}&order=created_at.desc&limit=${seite}&offset=${offset}`
      );
      if (!Array.isArray(rows) || !rows.length) break;
      out.push(...rows);
      if (rows.length < seite) break;
    }
    return out;
  } catch (error) {
    // W-1: keine stille Teilmenge (siehe listKoDocumentLinks).
    console.error("[v3Store] listKnowledgeObjectStates fehlgeschlagen:", error.message);
    throw new StorageReadError("knowledge_objects", error);
  }
}

// C8: einen Vorgang als KI-Fehlschlag markieren, OHNE Analyse zu speichern.
// status bleibt 'pending' -> Matching (C7a) schliesst ihn weiter aus, er wird
// nie ausgeliefert. understanding_status='failed' parkt ihn (keine Endlos-Retries).
// Nur ein bereits existierendes (pending) KO wird so aktualisiert.
async function markUnderstandingFailed(vorgangId, meta = {}) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  if (!vorgangId) return { skipped: true, reason: "missing-vorgang" };
  return saveKnowledgeObject({
    id: `ko-${vorgangId}`,
    vorgang_id: vorgangId,
    status: "pending",
    understanding_status: "failed",
    ...(meta.headline ? { headline: String(meta.headline).slice(0, 300) } : {}),
    ...(meta.understanding_model ? { understanding_model: String(meta.understanding_model).slice(0, 120) } : {})
  });
}

// SQL-Äquivalent: UPDATE knowledge_objects SET understanding_status='pending'
// WHERE understanding_status='failed'. Kein Limit, trifft alle failed KOs.
async function bulkResetUnderstandingFailed() {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  try {
    await supabaseRequest(
      `/rest/v1/knowledge_objects?understanding_status=eq.failed`,
      { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ understanding_status: "pending" }) }
    );
    return { ok: true };
  } catch (error) {
    console.error("[v3Store] bulkResetUnderstandingFailed fehlgeschlagen:", error.message);
    return { skipped: true, reason: error.message };
  }
}

// --- P1-4: begrenzte Recovery fehlgeschlagener Wissensobjekte -------------------
// Primitiven für den bounded Auto-Retry (Orchestrierung in lib/helmut/ko-recovery.js).
// Der Retry-Zähler lebt im kleinen Auth-Store (KEINE Schema-Migration nötig).

// Die aktuell failed (nicht terminal) markierten KOs holen. 'failed-final' wird
// bewusst NICHT geliefert -> nie erneut versucht (Endlosschutz).
async function listFailedKnowledgeObjects({ limit = 50 } = {}) {
  if (!v3StoreReady()) return [];
  try {
    const rows = await supabaseRequest(
      `/rest/v1/knowledge_objects?understanding_status=eq.failed&select=id,vorgang_id,understanding_status,headline&order=updated_at.desc&limit=${Math.max(1, Number(limit) || 50)}`
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error("[v3Store] listFailedKnowledgeObjects fehlgeschlagen:", error.message);
    return [];
  }
}

// Einen einzelnen Vorgang failed -> pending zuruecksetzen (fuer den naechsten
// Understanding-Lauf). Idempotent.
async function resetUnderstandingToPending(vorgangId) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  if (!vorgangId) return { skipped: true, reason: "missing-vorgang" };
  await supabaseRequest(
    `/rest/v1/knowledge_objects?vorgang_id=eq.${encodeURIComponent(vorgangId)}&understanding_status=eq.failed`,
    { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ understanding_status: "pending" }) }
  );
  return { ok: true };
}

// Einen Vorgang ENDGUELTIG fehlgeschlagen markieren (failed-final) — nach
// erschoepften Retries. Wird von listFailedKnowledgeObjects/listPending nie wieder
// aufgegriffen. Kein Endlos-Retry.
async function markUnderstandingTerminal(vorgangId) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  if (!vorgangId) return { skipped: true, reason: "missing-vorgang" };
  await supabaseRequest(
    `/rest/v1/knowledge_objects?vorgang_id=eq.${encodeURIComponent(vorgangId)}&understanding_status=eq.failed`,
    { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ understanding_status: "failed-final" }) }
  );
  return { ok: true };
}

// OP-06: einen Alt-Rueckstands-Vorgang (pending ODER failed) terminal aussortieren.
// KONDITIONALES PATCH auf den erwarteten Vorstatus — hat sich der Status seit der
// Planung geaendert (z. B. inzwischen complete), trifft der Filter 0 Zeilen und es
// wird NICHTS geschrieben. understanding_model traegt die Rollback-Kennung
// (`… | aussortiert:<runId>:<vorstatus>`), vom Aufrufer (pending-terminal.js)
// vorberechnet. Kein Delete, keine weiteren Spalten. Freigabepflichtiger Pfad —
// einziger Aufrufer ist das doppelt gesperrte Aussortier-Skript.
async function markPendingUnderstandingTerminal(vorgangId, { vonStatus, understanding_model } = {}) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  if (!vorgangId) return { skipped: true, reason: "missing-vorgang" };
  const prev = vonStatus === "failed" ? "failed" : vonStatus === "pending" ? "pending" : null;
  if (!prev) return { skipped: true, reason: "vonstatus-unzulaessig" };
  const body = { understanding_status: "failed-final" };
  if (understanding_model) body.understanding_model = String(understanding_model).slice(0, 120);
  try {
    const rows = await supabaseRequest(
      `/rest/v1/knowledge_objects?vorgang_id=eq.${encodeURIComponent(vorgangId)}&understanding_status=eq.${prev}`,
      { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) }
    );
    return { ok: true, updated: Array.isArray(rows) ? rows.length : 0 };
  } catch (error) {
    console.error("[v3Store] markPendingUnderstandingTerminal fehlgeschlagen:", error.message);
    return { skipped: true, reason: error.message };
  }
}

// Retry-Zähler (vorgangId -> Anzahl) aus dem Auth-Store. Bounded gehalten.
async function getUnderstandingRetries() {
  try {
    const store = await readAuthStore();
    return (store.understandingRetries && typeof store.understandingRetries === "object") ? store.understandingRetries : {};
  } catch (_) { return {}; }
}

async function saveUnderstandingRetries(map = {}) {
  try {
    const store = await readAuthStore();
    // Bounded halten: nur die letzten 1000 Einträge (Vorgänge werden nach Erfolg/
    // Terminal ohnehin entfernt).
    const entries = Object.entries(map || {}).slice(-1000);
    await writeAuthStore({ ...store, understandingRetries: Object.fromEntries(entries) });
    return true;
  } catch (error) {
    console.error("[v3Store] saveUnderstandingRetries fehlgeschlagen:", error && error.message);
    return false;
  }
}

// P29-3 (Fix-Sprint Punkt 29): Vormerkungen gescheiterter/vertagter KO-
// Aktualisierungen (vorgangId -> Zahl der Fehlversuche). Dasselbe Auth-Store-
// Muster wie understandingRetries — KEINE Schema-Migration. Erfolgreiche
// Aktualisierungen raeumen ihren Eintrag auf (lib/helmut/understanding.js).
async function getUpdateRetries() {
  try {
    const store = await readAuthStore();
    return (store.updateRetries && typeof store.updateRetries === "object") ? store.updateRetries : {};
  } catch (_) { return {}; }
}

async function saveUpdateRetries(map = {}) {
  try {
    const store = await readAuthStore();
    // Bounded halten: nur die letzten 1000 Einträge.
    const entries = Object.entries(map || {}).slice(-1000);
    await writeAuthStore({ ...store, updateRetries: Object.fromEntries(entries) });
    return true;
  } catch (error) {
    console.error("[v3Store] saveUpdateRetries fehlgeschlagen:", error && error.message);
    return false;
  }
}

// P1-1 KO-Anreicherung: schreibt gezielt NUR tags und/oder policy_field eines
// Knowledge-Objects (PATCH). Beruehrt KEINE anderen Felder -> kein Ueberschreiben
// von Analyse/Quellen/Inhalten. knowledge_objects ist mandantenlos (service_role).
// Idempotent; Rollback = beide Felder wieder auf '{}' setzen.
async function saveKnowledgeObjectEnrichment(id, patch = {}) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  if (!id) return { skipped: true, reason: "no-id" };
  const body = {};
  if (Array.isArray(patch.tags)) body.tags = patch.tags;
  if (Array.isArray(patch.policy_field)) body.policy_field = patch.policy_field;
  // Klassifikations-Backfill (Sprint 2): nur gesetzte Felder patchen (additiv).
  // P1-2 Ebenen-Kanon: politische Ebenen IMMER klein schreiben (bund/land/…),
  // damit Alt-Daten ('Bund') und Neu-Daten ('bund') niemals auseinanderlaufen.
  if (typeof patch.decision_level === "string") body.decision_level = patch.decision_level.trim().toLowerCase();
  if (typeof patch.political_level === "string") body.political_level = patch.political_level.trim().toLowerCase();
  if (typeof patch.event_type === "string") body.event_type = patch.event_type;
  if (Array.isArray(patch.related_levels)) body.related_levels = patch.related_levels.map((l) => (typeof l === "string" ? l.trim().toLowerCase() : l));
  if (Array.isArray(patch.affected_geographies)) body.affected_geographies = patch.affected_geographies;
  if (Array.isArray(patch.mentioned_geographies)) body.mentioned_geographies = patch.mentioned_geographies;
  if (Array.isArray(patch.decision_entities)) body.decision_entities = patch.decision_entities;
  if (Array.isArray(patch.related_entities)) body.related_entities = patch.related_entities;
  if (patch.classification_confidence && typeof patch.classification_confidence === "object") {
    body.classification_confidence = patch.classification_confidence;
  }
  if (Array.isArray(patch.embedding) && patch.embedding.length) body.embedding = formatVector(patch.embedding);
  if (!Object.keys(body).length) return { skipped: true, reason: "no-fields" };
  await supabaseRequest(
    `/rest/v1/knowledge_objects?id=eq.${encodeURIComponent(id)}`,
    { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) }
  );
  return { ok: true, fields: Object.keys(body) };
}

// C7b: gerendertes Briefing pro Nutzer/Slot in die V3-briefings-Tabelle schreiben.
async function saveRenderedBriefingV3(entry = {}) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  if (!entry.id || !entry.user_id) return { skipped: true, reason: "missing-id-or-user" };
  try {
    const row = {
      id: entry.id,
      user_id: entry.user_id,
      slot: entry.slot || null,
      generated_at: entry.generated_at || new Date().toISOString(),
      payload: entry.payload && typeof entry.payload === "object" ? entry.payload : {}
    };
    // saveRenderedBriefingV3 wird sowohl vom Lage-Prewarm-Cron ALS AUCH inline
    // waehrend eines Live-GET /api/app/start bei Cache-Miss ausgeloest — in
    // beiden Faellen ist es ein praeziser Schreibvorgang auf genau EIN Mandat
    // (entry.user_id), daher unbedenklich fuer den Tenant-JWT-Modus.
    const saved = await v3Upsert("briefings", row, "id", entry.user_id);
    return { saved: true, id: saved.id || entry.id };
  } catch (error) {
    console.error("[v3Store] saveRenderedBriefingV3 fehlgeschlagen:", error.message);
    return { skipped: true, reason: "v3-store-error", error: error.message };
  }
}

// Lage-Briefing-Cache lesen (Gegenstueck zu saveRenderedBriefingV3). Deterministische
// id = bf-<userId>-<slot>-<day>, damit ein bereits erzeugtes Briefing pro Tag/Slot
// wiederverwendet wird (kein KI-Call bei jedem Laden). Inert ohne Store (null).
async function getRenderedBriefingV3(userId, slot, day) {
  if (!v3StoreReady() || !userId || !slot || !day) return null;
  try {
    const id = `bf-${userId}-${slot}-${day}`;
    const rows = await tenantRequest(`/rest/v1/briefings?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, userId);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (error) {
    console.error("[v3Store] getRenderedBriefingV3 fehlgeschlagen:", error.message);
    return null;
  }
}

// Provenienz (C6/C7): die Quell-Dokumente eines Vorgangs mit dem KO verknuepfen.
// Sichert zuerst die raw_documents (idempotent, FK-Ziel von ko_document_links),
// dann die N:M-Kanten. Erst dadurch liefert getSourcesForVorgang echte Quellen,
// Chronologie und Dokumente. Inert ohne Store (kein Crash).
async function saveKoDocumentLinks(knowledgeObjectId, rawDocuments = []) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason(), saved: 0 };
  if (!knowledgeObjectId) return { skipped: true, reason: "missing-ko", saved: 0 };
  const docs = (Array.isArray(rawDocuments) ? rawDocuments : []).filter((d) => d && d.id);
  if (!docs.length) return { skipped: true, reason: "no-documents", saved: 0 };
  try {
    const docRows = docs.map((d) => pickColumns(d, V3_RAW_DOCUMENT_COLUMNS)).filter((r) => r.id);
    if (docRows.length) await v3Upsert("raw_documents", docRows, "id");
    const links = docs.map((d) => ({ knowledge_object_id: knowledgeObjectId, raw_document_id: d.id }));
    await v3Upsert("ko_document_links", links, "knowledge_object_id,raw_document_id");
    return { saved: links.length };
  } catch (error) {
    console.error("[v3Store] saveKoDocumentLinks fehlgeschlagen:", error.message);
    return { skipped: true, reason: "v3-store-error", error: error.message, saved: 0 };
  }
}

// Die Originalquellen eines Vorgangs: ko_document_links -> raw_documents (PostgREST-
// Embedding ueber den FK), nach published_at absteigend. Backt Quellen (N),
// Chronologie und Dokumente im Vorgang-Detail. Inert ohne Store ([]).
async function getSourcesForVorgang(vorgangId, { limit = 40 } = {}) {
  if (!v3StoreReady() || !vorgangId) return [];
  try {
    const koId = `ko-${vorgangId}`;
    const select = "raw_documents(id,title,url,canonical_url,source_name,source_type,published_at,document_type,link_type,confidence,summary)";
    const rows = await supabaseRequest(
      `/rest/v1/ko_document_links?knowledge_object_id=eq.${encodeURIComponent(koId)}&select=${select}&limit=${limit}`
    );
    const docs = (Array.isArray(rows) ? rows : []).map((r) => r && r.raw_documents).filter(Boolean);
    docs.sort((a, b) => String(b.published_at || "").localeCompare(String(a.published_at || "")));
    return docs;
  } catch (error) {
    console.error("[v3Store] getSourcesForVorgang fehlgeschlagen:", error.message);
    return [];
  }
}

// --- Helmut Core V3 — C9: Buero-Engine-Outputs (hinter HELMUT_V3_OFFICE) -------
// Speichert / liest generierte Kommunikations-Outputs (Rede, PM, Social usw.).
// Inert wenn v3StoreReady() false ist. Idempotent: PK = office-{userId}-{vorgangId}-{channel}.
// DSGVO: kein Freitext-Prompt, keine PII ausser user_id (RLS-geschuetzt).

const V3_OFFICE_OUTPUT_COLUMNS = ["id", "user_id", "knowledge_object_id", "decision_id", "channel", "content", "model"];

function officeOutputId(userId, vorgangId, channel) {
  return `office-${userId}-${vorgangId}-${channel}`.slice(0, 200);
}

function officeDailyLimit() {
  const raw = Number(process.env.HELMUT_OFFICE_DAILY_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 10;
}

async function saveOfficeOutput(entry = {}) {
  if (!v3StoreReady()) return { skipped: true, reason: v3SkipReason() };
  if (!entry.id || !entry.user_id || !entry.channel || !entry.content) {
    return { skipped: true, reason: "missing-fields" };
  }
  try {
    // Live-Nutzer-Schreibpfad (POST /api/office/generate) -> tenantId durchreichen,
    // damit v3Upsert bei aktiviertem Tenant-JWT-Modus authenticated statt
    // service_role nutzt (sonst unveraendert).
    const saved = await v3Upsert("office_outputs", pickColumns(entry, V3_OFFICE_OUTPUT_COLUMNS), "id", entry.user_id);
    return { saved: true, id: saved.id || entry.id };
  } catch (error) {
    console.error("[v3Store] saveOfficeOutput fehlgeschlagen:", error.message);
    return { skipped: true, reason: "v3-store-error" };
  }
}

async function getOfficeOutput(userId, vorgangId, channel) {
  assertTenant(userId, "getOfficeOutput");
  if (!v3StoreReady() || !vorgangId || !channel) return null;
  const id = officeOutputId(userId, vorgangId, channel);
  try {
    const rows = await tenantRequest(`/rest/v1/office_outputs?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, userId);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch (error) {
    console.error("[v3Store] getOfficeOutput fehlgeschlagen:", error.message);
    return null;
  }
}

async function listOfficeOutputsByUser(userId, vorgangId = null, deps = {}) {
  const uid = assertTenant(userId, "listOfficeOutputsByUser");
  const ready = deps.ready || v3StoreReady;
  // Aktuell kein Produktionsaufrufer (siehe docs/auth-service-role-matrix.md),
  // aus Konsistenz dennoch auf tenantRequest umgestellt. deps.request (Tests) hat Vorrang.
  const request = deps.request || ((endpoint) => tenantRequest(endpoint, uid));
  if (!ready()) return [];
  try {
    const koFilter = vorgangId ? `&knowledge_object_id=eq.${encodeURIComponent(`ko-${vorgangId}`)}` : "";
    const rows = await request(
      `/rest/v1/office_outputs?user_id=eq.${encodeURIComponent(uid)}${koFilter}&select=*&order=created_at.desc&limit=50`
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    console.error("[v3Store] listOfficeOutputsByUser fehlgeschlagen:", error.message);
    return [];
  }
}

// Rate-Gate: Wie viele Office-Outputs hat dieser Nutzer heute generiert?
// Fail-OPEN: Bei Fehler oder fehlendem Store -> immer erlaubt (inert ohne DB).
async function canSpendOfficeOutput(userId, referenceIso = null) {
  assertTenant(userId, "canSpendOfficeOutput");
  const limit = officeDailyLimit();
  if (!v3StoreReady()) return { allowed: true, used: 0, limit, remaining: limit };
  try {
    const today = dayKey(referenceIso || new Date().toISOString());
    const todayNum = Number(today.slice(8, 10));
    const tomorrow = `${today.slice(0, 8)}${String(todayNum + 1).padStart(2, "0")}`;
    const rows = await tenantRequest(
      `/rest/v1/office_outputs?select=id&user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${today}T00:00:00Z&created_at=lt.${tomorrow}T00:00:00Z&limit=${limit + 1}`,
      userId
    );
    const used = Array.isArray(rows) ? rows.length : 0;
    return { allowed: used < limit, used, limit, remaining: Math.max(0, limit - used) };
  } catch (_) {
    return { allowed: true, used: null, limit, remaining: null, reason: "check-failed-open" };
  }
}

const SUPABASE_REQUEST_TIMEOUT_MS = Number(process.env.HELMUT_SUPABASE_TIMEOUT_MS) || 10000;

// Kein Timeout hier bedeutete: ein einzelner haengender Supabase-Call (Netz-Hänger,
// Cold-Start, DNS) blockiert den kompletten aufrufenden Request unbegrenzt (bis zum
// Vercel-Function-Limit) -> z.B. /api/app/start liefert nie eine Antwort und die App
// startet scheinbar nicht. AbortController deckelt jeden einzelnen Call hart.
//
// Gemeinsamer Fetch-Kern fuer BEIDE Identitaeten (service_role UND tenant-JWT,
// P0-2-Folgearbeit "Sprint 3"). Reines Refactoring der vorherigen supabaseRequest-
// Funktion — Verhalten fuer bestehende Aufrufer (Headers, Timeout, Fehler-Redaction)
// ist UNVERAENDERT, nur der Header-Aufbau ist jetzt austauschbar.
async function performSupabaseFetch(endpoint, headers, options = {}) {
  if (typeof fetch !== "function") {
    throw new Error("Supabase storage needs Node fetch. Use Node 18+ or Vercel runtime.");
  }
  const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${baseUrl}${endpoint}`, { ...options, signal: controller.signal, headers });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Supabase storage timed out after ${SUPABASE_REQUEST_TIMEOUT_MS}ms: ${endpoint}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const rawBody = await response.text().catch(() => "");
    // SICHERHEIT: PostgREST/Postgres-Fehlertexte koennen bei NOT-NULL-/CHECK-Verletzungen
    // "Failing row contains (spalte1, spalte2, ...)" mit dem KOMPLETTEN Zeileninhalt
    // enthalten (nicht nur der verletzten Spalte) — das landet sonst ungefiltert in ~20
    // console.error-Aufrufen und teils im Rueckgabewert. Betroffene Tabellen koennen
    // besondere Kategorien nach Art. 9 DSGVO enthalten (politische Inhalte). Daher hier
    // am zentralen Punkt kappen + die bekannten Muster entfernen, bevor der Fehler ueberhaupt
    // entsteht.
    const body = String(rawBody || "")
      .replace(/Failing row contains \([^)]*\)/gi, "Failing row contains (redacted)")
      .replace(/Key \([^)]*\)=\([^)]*\)/gi, "Key (redacted)")
      .slice(0, 200);
    throw new Error(`Supabase storage failed (${response.status}): ${body || response.statusText}`);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// service_role — unveraendertes Verhalten, weiterhin der Default fuer ALLE
// Backend-/Cron-Pfade (Crawl, Understanding, Matching-/Decision-Shadow,
// Profil-Embeddings) und fuer jeden Aufrufer ohne Tenant-JWT-Modus.
async function supabaseRequest(endpoint, options = {}) {
  const serviceRoleKey = supabaseServiceRoleKey();
  return performSupabaseFetch(
    endpoint,
    {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    options
  );
}

function supabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}

// ── P0-2-Folgearbeit ("Sprint 3"): Tenant-JWT-Modus ─────────────────────────
// Zweite Halfte der Defense-in-Depth aus audit/fix-plan.md P0-2: die in
// supabase/migrations/20260712_tenant_rls_policies.sql entworfenen RLS-Policies
// greifen erst, wenn Requests mit der Rolle 'authenticated' + einem pro Request
// signierten JWT (Claim user_id) laufen statt mit dem RLS-umgehenden service_role.
// Default AUS (wie jedes andere HELMUT_V3_*-Flag) — bei fehlendem Flag oder
// fehlender Konfiguration ist dieser gesamte Block ein No-Op, JEDER Aufrufer
// faellt transparent auf supabaseRequest (service_role, unveraendertes
// Verhalten) zurueck. Betrifft NUR die klar abgegrenzten, bereits P0-1-Tenant-
// gescopten Live-Lesepfade (siehe docs/auth-service-role-matrix.md) — NICHT die
// Backend-/Cron-Bulk-Schreibpfade (saveDecisions/saveMatchingResults/
// saveProfileEmbedding) und NICHT den helmut_store-Blob (dokumentierte Luecke,
// eigener Folgeschritt).

// STILLGELEGT (2026-07-13): Das Supabase-Projekt hat von der Legacy-JWT-Secret-
// Signierung (symmetrisch, HS256) auf das neue Signing-Keys-System (asymmetrisch,
// RSA/EC) umgestellt. PostgREST verifiziert eingehende JWTs jetzt gegen den
// asymmetrischen Public-Key-Satz (JWKS); ein selbst signiertes HS256-Token hat
// dort keinen passenden Schluesseltyp und wird HART abgelehnt:
//   PGRST301 "None of the keys was able to decode the JWT" /
//            "No suitable key or wrong key type".
// Der private Schluessel des aktiven Signing-Keys liegt bei Supabase und wird nie
// exportiert -> eine App KANN kein von PostgREST akzeptiertes Token mehr selbst
// signieren (belegt: getProfileFromDb 401, secretMatchesLegacy=null, anon-Key ist
// jetzt der moderne publishable Key). Der offiziell unterstuetzte Weg fuer einen
// vertrauenswuerdigen Backend-Dienst, der den Mandanten serverseitig waehlt, ist
// service_role + verpflichtendes App-seitiges Tenant-Scoping (jeder Read ist auf
// die eigene id=eq.<tenant> gefiltert) — exakt das Muster, das der gesamte Rest
// der App bereits nutzt. Daher ist der Selbst-Signier-Pfad dauerhaft inert: es
// werden KEINE selbst gebauten Tokens mehr erzeugt, tenantRequest nutzt immer
// service_role. signTenantJWT/verifyTenantJWT bleiben nur fuer Tests/Historie.
// Reaktivierung erst mit echtem Supabase-Auth (GoTrue-Tokens, vom aktiven Key
// signiert) — eigener, groesserer Schritt (siehe docs).
function tenantJwtModeEnabled() {
  return false;
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

// Kurzlebiges (Default 60s), pro Aufruf frisch signiertes HS256-JWT mit dem
// Tenant-Claim 'user_id'. Kein externes Package (Node-crypto genuegt fuer HS256).
// PostgREST validiert dieses Token bei einem echten Supabase-Projekt gegen
// dasselbe Secret (Auth > JWT Settings) und setzt daraus die Rolle +
// request.jwt.claims-GUC, gegen die die RLS-Policies (auth.jwt()->>'user_id')
// pruefen. Liefert null, wenn Secret oder Tenant fehlt (Aufrufer MUSS das
// pruefen -> siehe tenantRequest).
function signTenantJWT(tenantId, opts = {}) {
  const secret = process.env.SUPABASE_JWT_SECRET || "";
  if (!secret || !tenantId) return null;
  // Jeder endliche Wert wird uebernommen (auch <=0, z.B. fuer Tests, die
  // gezielt ein bereits abgelaufenes Token erzeugen wollen) — nur bei
  // fehlendem/nicht-numerischem opts.ttlSeconds greift der 60s-Default.
  const ttlSeconds = Number.isFinite(Number(opts.ttlSeconds)) ? Number(opts.ttlSeconds) : 60;
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    role: "authenticated",
    user_id: String(tenantId),
    iss: "helmut-app",
    iat: nowSec,
    exp: nowSec + ttlSeconds
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac("sha256", secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

// Serverseitige Verifikation (fuer Tests + Dokumentation des Mechanismus).
// In Produktion verifiziert PostgREST das Token selbst gegen dasselbe Secret —
// diese Funktion bildet exakt denselben Algorithmus nach (HS256, exp-Pruefung,
// timing-safe Signaturvergleich) und wird NICHT im Request-Pfad der App
// aufgerufen (die App vertraut PostgREST/Supabase als Verifizierer).
function verifyTenantJWT(token, secretOverride) {
  const secret = secretOverride || process.env.SUPABASE_JWT_SECRET || "";
  if (!secret) return { valid: false, reason: "missing-secret" };
  if (typeof token !== "string" || !token) return { valid: false, reason: "missing-token" };
  const parts = token.split(".");
  if (parts.length !== 3) return { valid: false, reason: "malformed" };
  const [h, p, s] = parts;
  let expectedSig;
  try {
    expectedSig = crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  } catch (error) {
    return { valid: false, reason: "sign-error", error: error.message };
  }
  const sigBuf = Buffer.from(String(s));
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: "bad-signature" };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch (error) {
    return { valid: false, reason: "bad-payload" };
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < nowSec) {
    return { valid: false, reason: "expired", payload };
  }
  return { valid: true, payload };
}

// Admin-Diagnose fuer den PGRST301-Fall (Profil-Lesepfad). Belegt OHNE jede
// Secret-Ausgabe, ob unser HS256-Tenant-JWT noch zum aktiven Supabase-Signing-
// System passt. Gibt ausschliesslich Booleans/Algorithmus zurueck — NIE einen
// Secret-Wert. Kernidee: der oeffentliche anon-Key ist selbst ein HS256-JWT,
// das Supabase mit dem aktiven Legacy JWT Secret signiert hat. Verifiziert
// unser konfiguriertes SUPABASE_JWT_SECRET dessen Signatur, IST es das aktive
// Legacy Secret (=> HS256 korrekt, Ursache liegt woanders); verifiziert es sie
// nicht, ist der Secret-WERT die Ursache des 401/PGRST301.
//   secretMatchesLegacy: true/false/null (null = nicht bestimmbar, z.B. Secret
//     oder HS256-anon-Key fehlt lokal)
//   jwtAlgorithm: der alg-Header UNSERES erzeugten Tenant-Tokens (was die App
//     an PostgREST sendet), z.B. "HS256"; null wenn nicht signierbar.
function diagnoseTenantJwt() {
  const secret = process.env.SUPABASE_JWT_SECRET || "";
  const anonKey = process.env.SUPABASE_ANON_KEY || "";
  let jwtAlgorithm = null;
  try {
    const token = signTenantJWT("diagnose-probe", { ttlSeconds: 1 });
    if (token) {
      const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
      jwtAlgorithm = header.alg || null;
    }
  } catch (_) { /* jwtAlgorithm bleibt null */ }
  let secretMatchesLegacy = null;
  // Nur mit HS256-Legacy-anon-JWT (eyJ...) als Referenz moeglich, nicht mit einem
  // modernen publishable Key (sb_...).
  if (secret && anonKey && !anonKey.startsWith("sb_")) {
    const parts = anonKey.split(".");
    if (parts.length === 3) {
      try {
        const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
        if (header.alg === "HS256") {
          const expected = crypto.createHmac("sha256", secret).update(`${parts[0]}.${parts[1]}`).digest("base64url");
          const a = Buffer.from(String(parts[2]));
          const b = Buffer.from(expected);
          secretMatchesLegacy = a.length === b.length && crypto.timingSafeEqual(a, b);
        }
      } catch (_) { /* secretMatchesLegacy bleibt null */ }
    }
  }
  return { secretMatchesLegacy, jwtAlgorithm };
}

// authenticated-Rolle — nur genutzt, wenn tenantJwtModeEnabled() UND ein
// tenantId vorliegt (siehe tenantRequest). apikey ist der publishable
// SUPABASE_ANON_KEY (NICHT service_role) — Supabase/PostgREST leitet die
// tatsaechliche Rolle aus dem 'role'-Claim im signierten JWT ab.
async function supabaseAuthenticatedRequest(endpoint, tenantId, options = {}) {
  const token = signTenantJWT(tenantId);
  if (!token) {
    throw new Error("supabaseAuthenticatedRequest: JWT konnte nicht signiert werden (SUPABASE_JWT_SECRET/tenantId fehlt)");
  }
  const anonKey = process.env.SUPABASE_ANON_KEY || "";
  return performSupabaseFetch(
    endpoint,
    {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    options
  );
}

// Zentrale Weiche: tenant-JWT wenn aktiviert+konfiguriert+tenantId vorhanden,
// sonst transparent service_role (unveraendertes Verhalten). Das ist die
// EINZIGE Stelle, an der diese Entscheidung getroffen wird — die 8 dafuer
// vorgesehenen Funktionen (siehe docs/auth-service-role-matrix.md) rufen
// ausschliesslich tenantRequest()/tenantUpsert() auf, nie direkt supabaseRequest.
function tenantRequest(endpoint, tenantId, options = {}) {
  if (tenantJwtModeEnabled() && tenantId) {
    return supabaseAuthenticatedRequest(endpoint, tenantId, options);
  }
  return supabaseRequest(endpoint, options);
}

function normalizeStore(store = {}) {
  const parsed = { ...defaultStore(), ...store };
  return {
    ...parsed,
    sources: mergeSources(parsed.sources),
    profiles: parsed.profiles || {},
    rawItems: Array.isArray(parsed.rawItems) ? parsed.rawItems : [],
    briefings: Array.isArray(parsed.briefings) ? parsed.briefings : [],
    crawlRuns: Array.isArray(parsed.crawlRuns) ? parsed.crawlRuns : [],
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    interactions: Array.isArray(parsed.interactions) ? parsed.interactions : [],
    topicMemory: Array.isArray(parsed.topicMemory) ? parsed.topicMemory : [],
    mandateProfiles: parsed.mandateProfiles || {},
    politicalItems: Array.isArray(parsed.politicalItems) ? parsed.politicalItems : [],
    personalizedRecommendations: Array.isArray(parsed.personalizedRecommendations) ? parsed.personalizedRecommendations : [],
    dailyTasks: Array.isArray(parsed.dailyTasks) ? parsed.dailyTasks : [],
    communicationDrafts: Array.isArray(parsed.communicationDrafts) ? parsed.communicationDrafts : [],
    userNotes: Array.isArray(parsed.userNotes) ? parsed.userNotes : [],
    priorityChanges: Array.isArray(parsed.priorityChanges) ? parsed.priorityChanges : [],
    lageChecks: Array.isArray(parsed.lageChecks) ? parsed.lageChecks : [],
    pushSubscriptions: Array.isArray(parsed.pushSubscriptions) ? parsed.pushSubscriptions : [],
    pushEvents: Array.isArray(parsed.pushEvents) ? parsed.pushEvents : [],
    pipelineDebugReports: Array.isArray(parsed.pipelineDebugReports) ? parsed.pipelineDebugReports : [],
    users: Array.isArray(parsed.users) ? parsed.users : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    assignments: Array.isArray(parsed.assignments) ? parsed.assignments : [],
    dailyInputs: Array.isArray(parsed.dailyInputs) ? parsed.dailyInputs : [],
    auditEvents: Array.isArray(parsed.auditEvents) ? parsed.auditEvents : [],
    systemErrors: Array.isArray(parsed.systemErrors) ? parsed.systemErrors : [],
    adminSettings: parsed.adminSettings && typeof parsed.adminSettings === "object" ? parsed.adminSettings : {}
  };
}

// Behaelt die neuesten Eintraege PRO MANDAT (politicianId bzw. user_id), statt
// global zu kappen. Verhindert, dass viele Mandate sich gegenseitig die Daten
// verdraengen. Ein Gesamtlimit deckelt zusaetzlich die Blob-Groesse.
function keepLatestPerOwner(items, primaryDate, fallbackDate, perOwnerLimit, totalLimit) {
  const sorted = sortByDate(items, primaryDate, fallbackDate);
  const counts = new Map();
  const kept = [];
  for (const item of sorted) {
    const owner = item?.politicianId ?? item?.user_id ?? "__shared__";
    const used = counts.get(owner) || 0;
    if (used >= perOwnerLimit) continue;
    counts.set(owner, used + 1);
    kept.push(item);
    if (totalLimit && kept.length >= totalLimit) break;
  }
  return kept;
}

// homeSections wird beim Lesen ohnehin auf <=3 Eintraege pro Sektion eingedampft
// (server.js compactHomeSections). Die volle, mehrere zehn KB grosse Variante zu
// persistieren ist reine Blob-Last ohne Output-Unterschied. Wir trimmen daher schon
// beim Speichern auf die ausgelieferte Groesse.
const HOME_SECTION_KEYS = [
  "topTasks", "changedSinceLastVisit", "needsAttention", "opportunities",
  "risks", "situational", "governmentPlans", "partyFaction"
];

function compactStoredBriefing(briefing) {
  if (!briefing || typeof briefing !== "object" || !briefing.homeSections) return briefing;
  const trimmed = {};
  for (const key of HOME_SECTION_KEYS) {
    if (Array.isArray(briefing.homeSections[key])) {
      trimmed[key] = briefing.homeSections[key].slice(0, 3);
    } else if (briefing.homeSections[key] !== undefined) {
      trimmed[key] = briefing.homeSections[key];
    }
  }
  return { ...briefing, homeSections: { ...briefing.homeSections, ...trimmed } };
}

// P0-2 (Beobachtbarkeit + DSGVO-Datensparsamkeit): compactStore verwendet fuer
// crawlRuns bewusst eine ALLOWLIST — es wird nur explizit benanntes, technisches
// Diagnose-Feld persistiert, alles andere wird beim Speichern verworfen. So kann
// keine spaeter am Lauf-Objekt haengende PII/kein Volltext versehentlich in die
// Telemetrie sickern (Data-Minimization by design).
//
// Bis zur Audit-Umsetzung fehlten in dieser Allowlist die Diagnosefelder
// durationMs / understanding / googleUrlResolution / sourceMode / runId — sie
// wurden bei JEDEM Schreiben sofort gestrippt. Folge: pipeline-status.durationMs
// blieb null, der Google-News-Monitor (server.js buildHealthReport) las ein nie
// vorhandenes Feld (toter Monitor, Audit R4), und Laufkennung/Quellenmodus waren
// nicht nachverfolgbar. Diese Felder sind reine technische Skalare/Zaehler —
// keine Dokumentinhalte, keine Namen, keine Kontaktdaten.
const CRAWL_RUN_RETENTION = Math.max(1, Number(process.env.HELMUT_CRAWL_RUN_RETENTION) || 20);

function compactCrawlRunForStore(run) {
  // null/undefined bleiben null (ehrlich "unbekannt"), NICHT 0 — Number(null) waere 0.
  const num = (v) => (v == null || v === "" ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
  const str = (v, max) => (v == null ? null : String(v).slice(0, max));
  const understanding = run && run.understanding && typeof run.understanding === "object"
    ? {
        processed: num(run.understanding.processed) || 0,
        deferred: num(run.understanding.deferred) || 0,
        reason: str(run.understanding.reason, 120)
      }
    : null;
  const gnr = run && run.googleUrlResolution && typeof run.googleUrlResolution === "object"
    ? { attempted: num(run.googleUrlResolution.attempted) || 0, resolved: num(run.googleUrlResolution.resolved) || 0 }
    : null;
  return {
    mode: run.mode || "full",
    // Mandats-Slug des Laufs (technische Kennung, kein Klarname): nötig für den
    // mandanten-bewussten Crawl-Abstands-Schutz der Google-News-Härtung.
    politicianId: str(run.politicianId, 80),
    checkedSources: run.checkedSources || 0,
    successfulSources: run.successfulSources || 0,
    failedSources: run.failedSources || 0,
    newCandidateItems: run.newCandidateItems || 0,
    savedItems: run.savedItems || 0,
    // P1-5: ehrlicher relationaler Durchsatz-Delta + Durchfluss-Zaehler (technische
    // Skalare, keine Inhalte). newRawDocuments null = in diesem Lauf unbekannt.
    newRawDocuments: num(run.newRawDocuments),
    loadedItems: num(run.loadedItems),
    discardedItems: num(run.discardedItems),
    duplicates: num(run.duplicates),
    sourcesByCategory: (run.sourcesByCategory && typeof run.sourcesByCategory === "object") ? run.sourcesByCategory : null,
    // DSGVO-Datensparsamkeit (Review-Fix): der rohe Crawl-Fehlertext enthält die
    // aufgelöste Publisher-/Google-News-URL (crawler baut "… for <url>"). Statt ihn
    // verbatim zu persistieren (und im Admin-Crawl-Report anzuzeigen), wird er hier
    // — wie die Pro-Quellen-Telemetrie — zu einem INHALTSFREIEN Fehlercode verdichtet.
    // sourceName ist ein öffentlicher Organisationsname (keine PII).
    errors: Array.isArray(run.errors) ? run.errors.slice(0, 20).map((e) => ({
      sourceName: str(e && e.sourceName, 120),
      error: require("./redact").classifyPipelineError(e && e.error)
    })) : [],
    createdAt: run.createdAt,
    // --- P0-2 Diagnosefelder (technische Metadaten, keine Inhalte) ---
    durationMs: num(run.durationMs),           // echte Wall-Clock-Dauer (P0-1); null wenn nicht gemessen
    runId: str(run.runId, 80),                 // stabile Laufkennung fuer Fehler-/Telemetrie-Korrelation
    sourceMode: str(run.sourceMode, 24),       // 'on'/'shadow'/'off' bzw. relational vs. Fallback des Laufs
    googleUrlResolution: gnr,                   // { attempted, resolved } — reanimiert den Google-News-Monitor (R4)
    understanding: understanding,               // { processed, deferred, reason } — reine Zaehler, kein KI-Text
    // --- Google-News-Härtung (Sprint 2026-07): ehrlicher Lauf-Zustand +
    // Provider-Trennung. Ausschliesslich Zaehler und stabile, inhaltsfreie Codes
    // (keine URLs, keine Titel, keine PII) — ohne diese Whitelist-Eintraege
    // wuerde compactStore die Felder beim naechsten Schreiben strippen. ---
    runState: str(run.runState, 32),           // gesund | teilweise-degradiert | stark-degradiert | fehlgeschlagen | aggregator-gedrosselt | cooldown-reduziert | unbekannt
    providerBreakdown: compactProviderBreakdown(run.providerBreakdown),
    errorCodes: compactErrorCodes(run.errorCodes),
    skippedSources: num(run.skippedSources),
    // Incident 2026-07-25: zentral vom Breaker abgebrochene Wege und bewusst
    // übersprungene geteilte Wege sind KEINE individuellen Quellenfehler — sie
    // brauchen eigene Zaehler (ohne Whitelist-Eintrag strippt compactStore sie).
    circuitOpenSources: num(run.circuitOpenSources),
    sharedSkippedSources: num(run.sharedSkippedSources),
    retriesTotal: num(run.retriesTotal),
    cooldown: run.cooldown && typeof run.cooldown === "object"
      ? { active: run.cooldown.active === true, skipGoogle: run.cooldown.skipGoogle === true, reason: str(run.cooldown.reason, 40) }
      : null,
    googleGate: run.googleGate && typeof run.googleGate === "object"
      ? { open: run.googleGate.open === true, observed: num(run.googleGate.observed) || 0, breakerFailures: num(run.googleGate.breakerFailures) || 0 }
      : null
  };
}

// Provider-Aufschlüsselung strikt auf bekannte Zähl-Felder reduzieren (Allowlist).
function compactProviderBreakdown(value) {
  if (!value || typeof value !== "object") return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const bucket = (b) => (b && typeof b === "object"
    ? { checked: num(b.checked), ok: num(b.ok), failed: num(b.failed), skipped: num(b.skipped), http429: num(b.http429), timeout: num(b.timeout), circuitOpen: num(b.circuitOpen), otherErrors: num(b.otherErrors), retries: num(b.retries) }
    : null);
  return { googleNews: bucket(value.googleNews), direct: bucket(value.direct) };
}

// Fehlercode-Summen: nur kurze Code-Schlüssel + Zähler (max 12 Codes).
function compactErrorCodes(value) {
  if (!value || typeof value !== "object") return null;
  const out = {};
  for (const key of Object.keys(value).slice(0, 12)) {
    const n = Number(value[key]);
    if (Number.isFinite(n)) out[String(key).slice(0, 24)] = n;
  }
  return Object.keys(out).length ? out : null;
}

function compactStore(store) {
  const rawItems = compactRawItems(store.rawItems || []);
  return {
    ...store,
    rawItems,
    briefings: keepLatestPerOwner(store.briefings, "generatedAt", "date", 4, 320).map(compactStoredBriefing),
    // P0-5 Stufe 1: crawlRuns-Retention an saveCrawlRun (20) angeglichen — vorher 30,
    // faktisch nie erreicht (saveCrawlRun kappt bereits auf 20). Non-lossy; die
    // eigentliche Blob-Entlastung liefert Stufe 2 (crawl runs relational, freigabepflichtig).
    crawlRuns: sortByDate(store.crawlRuns, "createdAt").slice(0, CRAWL_RUN_RETENTION).map(compactCrawlRunForStore),
    interactions: keepLatestPerOwner(store.interactions, "createdAt", "createdAt", 80, 4000),
    topicMemory: keepLatestPerOwner(store.topicMemory, "updatedAt", "lastSeenAt", 120, 4000),
    politicalItems: keepLatestPerOwner(store.politicalItems, "created_at", "updated_at", 80, 4000),
    personalizedRecommendations: keepLatestPerOwner(store.personalizedRecommendations, "created_at", "updated_at", 80, 4000),
    dailyTasks: keepLatestPerOwner(store.dailyTasks, "createdAt", "dueDate", 60, 3000),
    communicationDrafts: keepLatestPerOwner(store.communicationDrafts, "createdAt", "createdAt", 40, 2000),
    userNotes: keepLatestPerOwner(store.userNotes, "createdAt", "createdAt", 80, 3000),
    priorityChanges: keepLatestPerOwner(store.priorityChanges, "created_at", "updated_at", 80, 3000),
    lageChecks: keepLatestPerOwner(store.lageChecks, "checkedAt", "createdAt", 10, 1000),
    pushSubscriptions: sortByDate(store.pushSubscriptions, "updatedAt", "createdAt").slice(0, 300),
    pushEvents: sortByDate(store.pushEvents, "createdAt").slice(0, 200),
    pipelineDebugReports: keepLatestPerOwner(store.pipelineDebugReports, "createdAt", "createdAt", 2, 200),
    sessions: sortByDate(store.sessions, "createdAt").slice(0, 500),
    auditEvents: sortByDate(store.auditEvents, "createdAt").slice(0, 1000),
    systemErrors: sortByDate(store.systemErrors, "createdAt").slice(0, 300),
    dailyInputs: sortByDate(store.dailyInputs, "createdAt").slice(0, 1000)
  };
}

function compactRawItems(rawItems) {
  const sanitized = rawItems.map(sanitizeStoredRawItem);
  const protectedPersonItems = sortByDate(
    sanitized.filter((item) => item.sourceType === "person" || isPersonNewsSourceId(item.sourceId)),
    "publishedAt",
    "retrievedAt"
  ).slice(0, 160);
  const protectedHashes = new Set(protectedPersonItems.map((item) => item.hash || item.id).filter(Boolean));
  const generalItems = sortByDate(
    sanitized.filter((item) => !protectedHashes.has(item.hash || item.id)),
    "publishedAt",
    "retrievedAt"
  ).slice(0, 440);
  return sortByDate([...protectedPersonItems, ...generalItems], "publishedAt", "retrievedAt").slice(0, 600);
}

function isPersonNewsSourceId(sourceId) {
  return /^[a-z0-9-]+-news$/i.test(String(sourceId || ""));
}

function sortByDate(items, primaryKey, fallbackKey = primaryKey) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const left = new Date(b?.[primaryKey] || b?.[fallbackKey] || 0).getTime();
    const right = new Date(a?.[primaryKey] || a?.[fallbackKey] || 0).getTime();
    return (Number.isNaN(left) ? 0 : left) - (Number.isNaN(right) ? 0 : right);
  });
}

function sanitizeStoredRawItem(item) {
  const quality = articleUrlQuality(item?.url);
  if (quality === "direct") {
    return {
      ...item,
      linkType: item.linkType || quality,
      linkResolutionNote: item.linkResolutionNote || linkResolutionNote(item.linkType || quality)
    };
  }
  return {
    ...item,
    url: "",
    originalUrl: item.originalUrl || item.url,
    linkType: "missing",
    linkResolutionNote: linkResolutionNote("missing")
  };
}

function isBlockedStoredArticleUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    return (
      hostname.includes("google.") ||
      hostname.includes("googleapis.com") ||
      hostname.includes("google-analytics.com") ||
      hostname.includes("googleadservices.com") ||
      hostname.includes("googlesyndication.com") ||
      hostname.includes("googletagmanager.com") ||
      hostname === "www.w3.org" ||
      hostname === "w3.org" ||
      hostname.includes("gstatic.com") ||
      hostname.includes("googleusercontent.com") ||
      /\.(js|css|png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(pathname)
    );
  } catch {
    return true;
  }
}

function mergeSources(storedSources = []) {
  const storedById = new Map(storedSources.map((source) => [source.id, source]));
  const mergedDefaults = v1Sources.map((source) => ({
    ...source,
    ...(storedById.get(source.id) || {}),
    url: source.url,
    rssUrl: source.rssUrl,
    rssUrls: source.rssUrls,
    crawlMethod: source.crawlMethod,
    priority: source.priority,
    maxItems: source.maxItems,
    active: storedById.get(source.id)?.active ?? source.active
  }));
  // Nur explizit als custom markierte Quellen behalten. Verwaiste Eintraege (frueher
  // geseedet, jetzt nicht mehr in v1Sources) werden ignoriert -> Code ist die Wahrheit.
  // Damit greift die Quellen-Kuratierung auch bei bereits befuelltem Store (Supabase).
  const customSources = storedSources.filter(
    (source) => source.custom === true && !v1Sources.some((defaultSource) => defaultSource.id === source.id)
  );
  return [...mergedDefaults, ...customSources];
}

async function saveRawItems(items) {
  const store = await readStore();
  const knownHashes = new Set(store.rawItems.map((item) => item.hash));
  const newItems = items.filter((item) => item.hash && !knownHashes.has(item.hash));
  const incomingByHash = new Map(items.filter((item) => item.hash).map((item) => [item.hash, item]));
  store.rawItems = store.rawItems.map((item) => {
    const incoming = incomingByHash.get(item.hash);
    if (!incoming) return item;
    return {
      ...item,
      url: isBetterArticleUrl(item.url, incoming.url) ? incoming.url : item.url,
      originalUrl: item.originalUrl || incoming.originalUrl || "",
      linkType: betterLinkType(item, incoming),
      linkResolutionNote: incoming.linkResolutionNote || item.linkResolutionNote || linkResolutionNote(betterLinkType(item, incoming)),
      sourceName: isBetterSourceName(item.sourceName, incoming.sourceName) ? incoming.sourceName : item.sourceName,
      sourceUrl: isBetterSourceUrl(item.sourceUrl, incoming.sourceUrl) ? incoming.sourceUrl : item.sourceUrl,
      imageUrl: isBetterImageUrl(item.imageUrl, incoming.imageUrl) ? incoming.imageUrl : item.imageUrl || "",
      excerpt: item.excerpt || incoming.excerpt || ""
    };
  });
  store.rawItems = [...store.rawItems, ...newItems].sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  await writeStore(store);
  return newItems;
}

function isBetterArticleUrl(currentUrl, incomingUrl) {
  if (!incomingUrl || incomingUrl === currentUrl) return false;
  return articleUrlRank(incomingUrl) > articleUrlRank(currentUrl);
}

function betterLinkType(currentItem, incomingItem) {
  const currentRank = articleUrlRank(currentItem.url);
  const incomingRank = articleUrlRank(incomingItem.url);
  if (incomingRank > currentRank) return incomingItem.linkType || articleUrlQuality(incomingItem.url);
  return currentItem.linkType || articleUrlQuality(currentItem.url);
}

function articleUrlRank(url) {
  const quality = articleUrlQuality(url);
  if (quality === "direct") return 4;
  if (quality === "publisher") return 3;
  if (quality === "google_proxy") return 2;
  if (quality === "asset") return 1;
  return 0;
}

function articleUrlQuality(url) {
  if (!url) return "missing";
  if (isImageAssetUrl(url)) return "asset";
  if (isGoogleLink(url)) return "google_proxy";
  if (isLikelyPublisherHomepage(url)) return "publisher";
  if (!isBlockedStoredArticleUrl(url)) return "direct";
  return "missing";
}

function isLikelyPublisherHomepage(value) {
  try {
    const parsed = new URL(String(value || ""));
    const path = parsed.pathname.replace(/\/+$/, "");
    return !path || path === "/" || path.split("/").filter(Boolean).length === 0;
  } catch {
    return false;
  }
}

function linkResolutionNote(linkType) {
  if (linkType === "direct") return "Direkter Artikellink gefunden.";
  if (linkType === "publisher") return "Direkter Artikel nicht sicher auflösbar; Publisher-Quelle hinterlegt.";
  if (linkType === "google_proxy") return "Google-News-Link erkannt, direkter Artikel noch nicht auflösbar.";
  return "Kein belastbarer öffentlicher Link gefunden.";
}

function isGoogleLink(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.hostname.includes("google.");
  } catch {
    return false;
  }
}

function isBetterSourceName(currentName, incomingName) {
  if (!incomingName || incomingName === currentName) return false;
  return !currentName || String(currentName).includes("News-Suche");
}

function isBetterSourceUrl(currentUrl, incomingUrl) {
  if (!incomingUrl || incomingUrl === currentUrl) return false;
  return !currentUrl || isGoogleLink(currentUrl) || isImageAssetUrl(currentUrl);
}

function isBetterImageUrl(currentUrl, incomingUrl) {
  if (!incomingUrl || incomingUrl === currentUrl) return false;
  return !currentUrl || isImageAssetUrl(currentUrl);
}

function isImageAssetUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    const hostname = parsed.hostname.toLowerCase();
    return hostname.includes("googleusercontent.com") || hostname.includes("gstatic.com") || /\.(png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function getRawItemsSince(date) {
  const since = new Date(date);
  const store = await readStore();
  return store.rawItems.filter((item) => new Date(item.publishedAt) >= since);
}

async function getSources() {
  return (await readStore()).sources;
}

async function updateSourceLastCrawled(sourceId, value = new Date().toISOString()) {
  const store = await readStore();
  store.sources = store.sources.map((source) => (source.id === sourceId ? { ...source, lastCrawledAt: value } : source));
  await writeStore(store);
}

async function saveBriefing(briefing) {
  const key = pKey(briefing.politicianId);
  const store = await readStore(key);
  const briefingWithMeta = {
    ...briefing,
    generatedAt: new Date().toISOString()
  };
  store.briefings = [briefingWithMeta, ...store.briefings.filter((entry) => entry.id !== briefing.id)].slice(0, 2000);
  await writeStore(store, key);
  return briefingWithMeta;
}

async function getLatestBriefing(politicianId) {
  // Tenant-Haertung (Sprint-1-Sicherheit): konsistent zu den 2026-07 gehaerteten
  // Blob-Lesern (getTasks/getUserNotes/…). Fehlender Kontext -> harter Fehler statt
  // stillem Main-Store-Fallback (RLS ist inert -> App-Schicht ist die einzige Linie).
  const tenantId = assertTenant(politicianId, "getLatestBriefing");
  const pStore = await readStore(pKey(tenantId));
  const found = (pStore.briefings || []).find((briefing) => briefing.politicianId === tenantId) || null;
  if (found) return found;
  // Fallback: Bestandsdaten aus dem Main-Store waehrend der Migration
  const mainStore = await readStore("main");
  return (mainStore.briefings || []).find((briefing) => briefing.politicianId === tenantId) || null;
}

async function getTopicMemory(politicianId) {
  const tenantId = assertTenant(politicianId, "getTopicMemory"); // Sprint-1-Haertung
  politicianId = tenantId;
  const pStore = await readStore(pKey(politicianId));
  const persisted = (pStore.topicMemory || []).filter((entry) => entry.politicianId === politicianId);
  let briefings = pStore.briefings || [];
  if (!briefings.length) {
    const mainStore = await readStore("main");
    briefings = mainStore.briefings || [];
  }
  const derived = buildTopicMemoryFromBriefings(briefings, politicianId);
  if (persisted.length) return mergeTopicMemoryEntries(persisted, derived);
  return derived;
}

async function updateTopicMemoryFromBriefing(briefing) {
  const key = pKey(briefing.politicianId);
  const store = await readStore(key);
  const existing = new Map((store.topicMemory || []).map((entry) => [`${entry.politicianId}:${entry.topicKey}`, entry]));
  const now = new Date().toISOString();

  (briefing.items || []).forEach((item) => {
    const topicKey = topicMemoryKey(item);
    const memoryKey = `${briefing.politicianId}:${topicKey}`;
    const previous = existing.get(memoryKey);
    existing.set(memoryKey, {
      id: previous?.id || `memory-${briefing.politicianId}-${topicKey}`,
      politicianId: briefing.politicianId,
      topicKey,
      title: item.title || previous?.title || "Politisches Thema",
      firstSeenAt: previous?.firstSeenAt || briefing.generatedAt || briefing.date || now,
      lastSeenAt: briefing.generatedAt || now,
      seenCount: (previous?.seenCount || 0) + 1,
      lastDecision: item.decision || previous?.lastDecision || "",
      lastAction: item.recommendedAction || previous?.lastAction || "",
      lastStatement: item.suggestedStatement || previous?.lastStatement || "",
      lastRisk: item.riskNote || previous?.lastRisk || "",
      lastOpportunity: item.opportunityNote || previous?.lastOpportunity || "",
      lastAssignee: item.taskTemplate?.assignee || previous?.lastAssignee || "",
      sourceCount: item.sourceCount || previous?.sourceCount || 0,
      sourceUrls: mergeUnique(previous?.sourceUrls, sourceUrlsForMemory(item)),
      sourceHashes: mergeUnique(previous?.sourceHashes, sourceHashesForMemory(item)),
      updatedAt: now
    });
  });

  store.topicMemory = Array.from(existing.values())
    .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt))
    .slice(0, 200);
  await writeStore(store, key);
  return store.topicMemory.filter((entry) => entry.politicianId === briefing.politicianId);
}

function buildTopicMemoryFromBriefings(briefings, politicianId) {
  const memory = new Map();
  [...briefings].reverse().forEach((briefing) => {
    if (politicianId && briefing.politicianId !== politicianId) return;
    (briefing.items || []).forEach((item) => {
      const topicKey = topicMemoryKey(item);
      const memoryKey = `${briefing.politicianId}:${topicKey}`;
      const previous = memory.get(memoryKey);
      memory.set(memoryKey, {
        id: previous?.id || `memory-${briefing.politicianId}-${topicKey}`,
        politicianId: briefing.politicianId,
        topicKey,
        title: item.title || previous?.title || "Politisches Thema",
        firstSeenAt: previous?.firstSeenAt || briefing.generatedAt || briefing.date,
        lastSeenAt: briefing.generatedAt || briefing.date,
        seenCount: (previous?.seenCount || 0) + 1,
        lastDecision: item.decision || previous?.lastDecision || "",
        lastAction: item.recommendedAction || previous?.lastAction || "",
        lastStatement: item.suggestedStatement || previous?.lastStatement || "",
        lastRisk: item.riskNote || previous?.lastRisk || "",
        lastOpportunity: item.opportunityNote || previous?.lastOpportunity || "",
        lastAssignee: item.taskTemplate?.assignee || previous?.lastAssignee || "",
        sourceCount: item.sourceCount || previous?.sourceCount || 0,
        sourceUrls: mergeUnique(previous?.sourceUrls, sourceUrlsForMemory(item)),
        sourceHashes: mergeUnique(previous?.sourceHashes, sourceHashesForMemory(item)),
        updatedAt: briefing.generatedAt || briefing.date
      });
    });
  });
  return Array.from(memory.values()).sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));
}

function mergeTopicMemoryEntries(persisted = [], derived = []) {
  const byKey = new Map((persisted || []).map((entry) => [`${entry.politicianId}:${entry.topicKey}`, entry]));
  for (const entry of derived || []) {
    const key = `${entry.politicianId}:${entry.topicKey}`;
    const previous = byKey.get(key);
    if (!previous) {
      byKey.set(key, entry);
      continue;
    }
    byKey.set(key, {
      ...entry,
      ...previous,
      sourceUrls: mergeUnique(previous.sourceUrls, entry.sourceUrls),
      sourceHashes: mergeUnique(previous.sourceHashes, entry.sourceHashes),
      sourceCount: Math.max(Number(previous.sourceCount || 0), Number(entry.sourceCount || 0)),
      firstSeenAt: previous.firstSeenAt || entry.firstSeenAt,
      lastSeenAt: previous.lastSeenAt || entry.lastSeenAt,
      updatedAt: previous.updatedAt || entry.updatedAt
    });
  }
  return Array.from(byKey.values()).sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));
}

function topicMemoryKey(item) {
  return String(item.topic || item.title || item.signalId || "topic")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "topic";
}

function sourceUrlsForMemory(item = {}) {
  const direct = [item.itemUrl, item.url, item.originalUrl].filter(Boolean);
  const sourceUrls = (item.sources || [])
    .flatMap((source) => [source.itemUrl, source.url, source.originalUrl])
    .filter(Boolean);
  const primaryUrls = item.primarySource
    ? [item.primarySource.itemUrl, item.primarySource.url, item.primarySource.originalUrl].filter(Boolean)
    : [];
  return uniqueStrings([...direct, ...sourceUrls, ...primaryUrls].map(normalizeMemoryUrl).filter(Boolean)).slice(0, 40);
}

function sourceHashesForMemory(item = {}) {
  const direct = [item.hash, item.rawItemId, item.rawItemID, item.id].filter(Boolean);
  const sourceIds = (item.sources || [])
    .flatMap((source) => [source.rawItemId, source.id, source.hash])
    .filter(Boolean);
  return uniqueStrings([...direct, ...sourceIds].map((value) => String(value || "").trim()).filter(Boolean)).slice(0, 40);
}

function mergeUnique(previous = [], next = []) {
  return uniqueStrings([...(Array.isArray(previous) ? previous : []), ...(Array.isArray(next) ? next : [])]).slice(0, 80);
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean)));
}

function normalizeMemoryUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    url.searchParams.delete("utm_source");
    url.searchParams.delete("utm_medium");
    url.searchParams.delete("utm_campaign");
    url.searchParams.delete("utm_term");
    url.searchParams.delete("utm_content");
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

async function saveCrawlRun(run) {
  const store = await readStore();
  // N1 (Health-Report-Skalierung, 2026-07-25): an CRAWL_RUN_RETENTION angeglichen
  // (vorher hart auf 20 gekappt) — der dokumentierte Schalter HELMUT_CRAWL_RUN_RETENTION
  // griff sonst nie, weil dieser Cut bereits VOR compactStore/CRAWL_RUN_RETENTION lag.
  store.crawlRuns = [{ ...run, createdAt: new Date().toISOString() }, ...store.crawlRuns].slice(0, CRAWL_RUN_RETENTION);
  await writeStore(store);
  const saved = store.crawlRuns[0];
  // P0-5 Stufe 2 (VORBEREITUNG, freigabepflichtig/Default AUS): Dual-Write in die
  // relationale crawl_runs-Tabelle. Ohne Flag+Migration = No-Op, fail-safe.
  await insertCrawlRunRelational(saved).catch(() => {});
  return saved;
}

// P0-5 Stufe 2: gated Dual-Write eines Crawl-Laufs nach public.crawl_runs.
// Default AUS (HELMUT_CRAWL_RUNS_RELATIONAL) + freigabepflichtige Migration
// (20260720). Ohne beides ein reiner No-Op; ein Write-Fehler beeinflusst den
// Blob-Pfad nie (der Blob bleibt bis Phase 3 die Lese-Wahrheit).
async function insertCrawlRunRelational(run) {
  const { crawlRunsRelationalEnabled, crawlRunToRelationalRow } = require("./blob-relational");
  if (!crawlRunsRelationalEnabled()) return { skipped: true, reason: "disabled" };
  if (!v3StoreReady()) return { skipped: true, reason: "relational-store-not-ready" };
  const row = crawlRunToRelationalRow(run);
  await supabaseRequest("/rest/v1/crawl_runs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(row)
  });
  return { inserted: 1 };
}

async function getLatestCrawlRun() {
  return (await readStore()).crawlRuns[0] || null;
}

// P0-1 (freigabepflichtig, DEFAULT AUS): schreibt die Pro-Quellenabruf-Telemetrie
// in die NEUE relationale Tabelle source_crawl_telemetry. Nur aufgerufen, wenn der
// relationale Store konfiguriert ist; ohne angewendete Migration schlaegt der Write
// fehl und wird vom Aufrufer (source-telemetry.persist) verschluckt -> kein
// Production-Daten-Write ohne Freigabe. Reine technische Metadaten (kein Volltext).
async function insertSourceCrawlTelemetry(rows) {
  if (!v3StoreReady()) return { skipped: true, reason: "relational-store-not-ready" };
  await supabaseRequest("/rest/v1/source_crawl_telemetry", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(rows)
  });
  return { inserted: Array.isArray(rows) ? rows.length : 0 };
}

// Punkt 16 — LESEPFAD zur Pro-Quellenabruf-Telemetrie. Bis zu diesem Sprint gab
// es ausschliesslich den Write-Pfad (insertSourceCrawlTelemetry): 13 081 echte
// Laufzeilen in Production, im Code aber nie gelesen (Befund A-6). Die
// Stoerungserkennung leitet ihren Zustand ausschliesslich hieraus ab.
//
// REIN LESEND, defensiv: fehlt die Tabelle oder der relationale Store, kommt []
// zurueck -> der Bericht meldet ehrlich "keine Telemetrie" statt falschem Gruen.
// Es werden NUR die inhaltsfreien Felder geladen, die die Klassifikation braucht
// (keine Quellennamen, keine URLs) — Datensparsamkeit wie beim Write-Pfad.
async function listSourceCrawlTelemetry({ days = 14, limit = 20000 } = {}) {
  if (!v3StoreReady()) return [];
  const cutoffIso = new Date(Date.now() - Math.max(1, Number(days) || 14) * 24 * 60 * 60 * 1000).toISOString();
  const cols = "source_id,status,error_code,duration_ms,found_documents,new_documents,retry_count,created_at,run_id";
  const seite = 1000;
  const max = Math.max(0, Number(limit) || 0);
  const out = [];
  try {
    // Seitenweise (PostgREST deckelt eine einzelne Antwort) — neueste zuerst,
    // damit ein Limit immer das AKTUELLE Fenster behaelt, nie einen alten Rest.
    for (let offset = 0; offset < max; offset += seite) {
      const nehmen = Math.min(seite, max - offset);
      const rows = await supabaseRequest(
        `/rest/v1/source_crawl_telemetry?select=${cols}&created_at=gte.${encodeURIComponent(cutoffIso)}`
        + `&order=created_at.desc&offset=${offset}&limit=${nehmen}`
      );
      if (!Array.isArray(rows) || !rows.length) break;
      out.push(...rows);
      if (rows.length < nehmen) break;
    }
    return out;
  } catch (error) {
    console.error("[v3Store] listSourceCrawlTelemetry fehlgeschlagen:", error.message);
    // Teilergebnis verwerfen: ein halbes Fenster wuerde Fehlerserien und
    // "letzte Lieferung" verfaelschen und damit Fehlalarme erzeugen.
    return [];
  }
}

// Reine Lese-Hilfe: die letzten Crawl-Läufe (neueste zuerst). Für den robusten
// Admin-Morgenstatus (frühester erfolgreicher Tageslauf statt blind letzter Lauf).
async function listCrawlRuns(limit = 20) {
  const runs = (await readStore()).crawlRuns || [];
  return runs.slice(0, Math.max(0, Number(limit) || 0));
}

async function saveLageCheck(check) {
  const key = pKey(check.politicianId);
  const store = await readStore(key);
  const now = new Date().toISOString();
  const entry = {
    id: check.id || `lage-check-${check.politicianId || "unknown"}-${Date.now()}`,
    createdAt: check.createdAt || now,
    checkedAt: check.checkedAt || now,
    ...check
  };
  store.lageChecks = [entry, ...(store.lageChecks || []).filter((item) => item.id !== entry.id)].slice(0, 2000);
  await writeStore(store, key);
  return entry;
}

async function getLatestLageCheck(politicianId) {
  const tenantId = assertTenant(politicianId, "getLatestLageCheck"); // Sprint-1-Haertung
  const pStore = await readStore(pKey(tenantId));
  const found = (pStore.lageChecks || []).find((check) => check.politicianId === tenantId);
  if (found) return found;
  const mainStore = await readStore("main");
  return (mainStore.lageChecks || []).find((check) => check.politicianId === tenantId) || null;
}

async function getLageChecks(politicianId, limit = 12) {
  // Tenant-Haertung (Audit-Fix 2026-07): Der weiche Filter '!politicianId ||'
  // gab bei fehlendem Mandanten-Kontext ALLE Zeilen (inkl. Main-Store-Fallback)
  // zurueck. Da RLS heute inert ist (service_role), ist die App-Schicht die
  // EINZIGE Verteidigung — fehlender Kontext ist jetzt ein harter Fehler
  // (TenantContextError) statt eines potenziellen Cross-Tenant-Leaks.
  const tenantId = assertTenant(politicianId, "getLageChecks");
  const pStore = await readStore(pKey(tenantId));
  const checks = (pStore.lageChecks || []).filter((check) => check.politicianId === tenantId);
  if (checks.length) return checks.slice(0, limit);
  const mainStore = await readStore("main");
  return (mainStore.lageChecks || []).filter((check) => check.politicianId === tenantId).slice(0, limit);
}

async function savePipelineDebugReport(report) {
  const key = pKey(report.politicianId);
  const store = await readStore(key);
  const entry = {
    id: report.id || `pipeline-debug-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...report
  };
  store.pipelineDebugReports = [entry, ...(store.pipelineDebugReports || []).filter((item) => item.id !== entry.id)].slice(0, 20);
  await writeStore(store, key);
  return entry;
}

async function getLatestPipelineDebugReport(politicianId) {
  const tenantId = assertTenant(politicianId, "getLatestPipelineDebugReport"); // Sprint-1-Haertung
  const pStore = await readStore(pKey(tenantId));
  return (pStore.pipelineDebugReports || []).find((report) => report.politicianId === tenantId) || null;
}

// P1-5 (Watchdog OUTPUT-Frische): jüngstes VERSTANDENES Knowledge-Object.
// Ersetzt die build-zeit-blinde `generatedAt`-Prüfung (briefingContract.js:743),
// die die Briefing-Frische immer als "frisch" meldete (false-green). Liefert den
// ISO-Timestamp des neuesten complete-KO (mandantenlos/global) oder null.
// Read-only, fail-safe (null bei jedem Fehler → Aufrufer behandelt als "unbekannt").
async function getLatestCompleteKnowledgeObjectAt() {
  try {
    const rows = await supabaseRequest(
      `/rest/v1/knowledge_objects?select=created_at&understanding_status=eq.complete&order=created_at.desc&limit=1`
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    return row?.created_at || null;
  } catch {
    return null;
  }
}

// P1-4 (Watchdog Recovery-Hysterese): persistiert den zuletzt klassifizierten
// Betriebszustand pro Profil, damit der Zustand "Erholt" (vorher kritisch/veraltet,
// jetzt wieder gesund) über Zyklen hinweg erkannt werden kann. Kleiner Marker
// (analog lageChecks), fail-safe: Schreibfehler brechen den Health-Report NICHT ab.
async function saveWatchdogState(politicianId, state) {
  try {
    const key = pKey(politicianId);
    const store = await readStore(key);
    const entry = { state, createdAt: new Date().toISOString(), politicianId: politicianId || null };
    store.watchdogStates = [entry, ...(store.watchdogStates || [])].slice(0, 20);
    await writeStore(store, key);
    return entry;
  } catch {
    return null;
  }
}

// F5-Vorbereitung (Härtungs-Sprint): Zustellstatus des Monitoring-Webhooks im
// Auth-Store persistieren — nur technische Metadaten (eventId/Status/Versuche),
// nie Payload-Inhalte. Fail-safe: Fehler geben null zurück, kein Cron bricht ab.
async function saveMonitoringDeliveryState(entry = {}) {
  try {
    const store = await readAuthStore();
    const kompakt = {
      eventId: String(entry.eventId || "").slice(0, 80),
      eventType: String(entry.eventType || "").slice(0, 24),
      sent: entry.sent === true,
      status: Number.isFinite(Number(entry.status)) ? Number(entry.status) : null,
      reason: entry.reason == null ? null : String(entry.reason).slice(0, 200),
      attempts: Number.isFinite(Number(entry.attempts)) ? Number(entry.attempts) : 0,
      at: entry.at || new Date().toISOString(),
      // Zuletzt zugestellte Ereigniskennungen (Dedupe-Gedächtnis, max 20 ids).
      recentEventIds: Array.isArray(entry.recentEventIds)
        ? entry.recentEventIds.filter(Boolean).map((id) => String(id).slice(0, 80)).slice(0, 20)
        : []
    };
    await writeAuthStore({ ...store, monitoringWebhookDelivery: kompakt });
    return kompakt;
  } catch {
    return null;
  }
}

async function getMonitoringDeliveryState() {
  try {
    const store = await readAuthStore();
    return store.monitoringWebhookDelivery || null;
  } catch {
    return null;
  }
}

async function getLatestWatchdogState(politicianId) {
  try {
    const store = await readStore(pKey(politicianId));
    return (store.watchdogStates || [])[0] || null;
  } catch {
    return null;
  }
}

async function saveTask(task) {
  const key = pKey(task.politicianId);
  const store = await readStore(key);
  const taskWithMeta = {
    ...task,
    updatedAt: new Date().toISOString()
  };
  const existingIndex = store.tasks.findIndex((entry) => entry.id === taskWithMeta.id);
  if (existingIndex >= 0) store.tasks[existingIndex] = { ...store.tasks[existingIndex], ...taskWithMeta };
  else store.tasks.unshift(taskWithMeta);
  await writeStore(store, key);
  return taskWithMeta;
}

async function getTasks(politicianId) {
  // Tenant-Haertung (Audit-Fix 2026-07): Der weiche Filter '!politicianId ||'
  // gab bei fehlendem Mandanten-Kontext ALLE Zeilen (inkl. Main-Store-Fallback)
  // zurueck. Da RLS heute inert ist (service_role), ist die App-Schicht die
  // EINZIGE Verteidigung — fehlender Kontext ist jetzt ein harter Fehler
  // (TenantContextError) statt eines potenziellen Cross-Tenant-Leaks.
  const tenantId = assertTenant(politicianId, "getTasks");
  const pStore = await readStore(pKey(tenantId));
  const tasks = (pStore.tasks || []).filter((task) => task.politicianId === tenantId);
  if (tasks.length) return tasks;
  const mainStore = await readStore("main");
  return (mainStore.tasks || []).filter((task) => task.politicianId === tenantId);
}

async function updateTaskStatus(taskId, status, politicianId) {
  const key = pKey(politicianId);
  const store = await readStore(key);
  const task = store.tasks.find((entry) => entry.id === taskId);
  if (!task) {
    // Fallback: Task koennte noch im Main-Store liegen (Alt-/Pilotdaten vor der
    // Mandantentrennung). SICHERHEIT: wie in getTasks zusaetzlich auf politicianId
    // filtern — sonst koennte ein anderer Mandant per erratener/bekannter Legacy-taskId
    // eine fremde Aufgabe umschreiben (Mandantenbruch).
    const mainStore = await readStore("main");
    const mainTask = (mainStore.tasks || []).find(
      (entry) => entry.id === taskId && (!politicianId || entry.politicianId === politicianId)
    );
    if (!mainTask) return null;
    mainTask.status = status;
    mainTask.updatedAt = new Date().toISOString();
    await writeStore(mainStore, "main");
    return mainTask;
  }
  task.status = status;
  task.updatedAt = new Date().toISOString();
  await writeStore(store, key);
  return task;
}

async function saveInteraction(interaction) {
  const key = pKey(interaction.politicianId);
  const store = await readStore(key);
  const entry = {
    id: interaction.id || `interaction-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...interaction
  };
  store.interactions = [entry, ...store.interactions].slice(0, 4000);
  store.personalizedRecommendations = updateRecommendationFromInteraction(store.personalizedRecommendations || [], entry);
  await writeStore(store, key);
  return entry;
}

async function getInteractions(politicianId) {
  // Tenant-Haertung (Audit-Fix 2026-07): Der weiche Filter '!politicianId ||'
  // gab bei fehlendem Mandanten-Kontext ALLE Zeilen (inkl. Main-Store-Fallback)
  // zurueck. Da RLS heute inert ist (service_role), ist die App-Schicht die
  // EINZIGE Verteidigung — fehlender Kontext ist jetzt ein harter Fehler
  // (TenantContextError) statt eines potenziellen Cross-Tenant-Leaks.
  const tenantId = assertTenant(politicianId, "getInteractions");
  const pStore = await readStore(pKey(tenantId));
  const interactions = (pStore.interactions || []).filter((entry) => entry.politicianId === tenantId);
  if (interactions.length) return interactions;
  const mainStore = await readStore("main");
  return (mainStore.interactions || []).filter((entry) => entry.politicianId === tenantId);
}

// Feedback wird im Main-Store als flache Liste gehalten, damit der Admin alle
// Rueckmeldungen mandatsuebergreifend sehen kann. Additiv, kein bestehendes Feld.
async function saveFeedback(feedback = {}) {
  const store = await readStore("main");
  store.feedback = store.feedback || [];
  const entry = {
    id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    done: false,
    ...feedback
  };
  store.feedback = [entry, ...store.feedback].slice(0, 2000);
  await writeStore(store, "main");
  return entry;
}

async function listFeedback(limit = 100) {
  const store = await readStore("main");
  return (store.feedback || []).slice(0, Math.max(0, limit));
}

async function setFeedbackDone(id, done = true) {
  const store = await readStore("main");
  store.feedback = store.feedback || [];
  const entry = store.feedback.find((item) => item.id === id);
  if (!entry) return null;
  entry.done = !!done;
  entry.updatedAt = new Date().toISOString();
  await writeStore(store, "main");
  return entry;
}

// Mehrmandantenfaehigkeit Phase 3: Default AUS (HELMUT_PROFILE_DB_MODE). Solange
// das Flag fehlt, liest/schreibt getProfile/saveProfile UNVERAENDERT nur den
// Blob (bytegleiches Verhalten wie vor diesem Sprint). Nach Aktivierung liest
// getProfile zuerst profiles+mandate_profiles (SQL); findet sich dort nichts,
// greift der bisherige Blob-Fallback unveraendert weiter. saveProfile schreibt
// danach IMMER weiter in den Blob (Fallback bleibt aktuell) UND zusaetzlich in
// die SQL-Tabellen, wenn das Flag an ist. Siehe docs/multitenancy-profilmodell.md.
function profileDbModeEnabled() {
  return isFlagOn(process.env.HELMUT_PROFILE_DB_MODE) && v3StoreReady();
}

// Stufe E (Exklusivmodus): Mandatsprofile liegen AUSSCHLIESSLICH relational
// (profiles + mandate_profiles). saveProfile schreibt dann KEINEN globalen
// helmut_store-Blob mehr, getProfile liest ohne Blob-Fallback. Implizit setzt
// dieser Modus profileDbModeEnabled() voraus (und damit v3StoreReady + Supabase).
// Default AUS -> byte-identisches Verhalten wie Stufe D (Dual Write). Rollback
// E -> D ist ein reiner Flag-Flip (HELMUT_PROFILE_DB_EXCLUSIVE=off).
function profileDbExclusiveEnabled() {
  return profileDbModeEnabled() && isFlagOn(process.env.HELMUT_PROFILE_DB_EXCLUSIVE);
}

// Divergenz-/Fallback-Telemetrie (nur In-Prozess-Zaehler, KEIN persistenter Write
// auf dem Lesepfad): zaehlt, wie oft im Dual-Write-Modus (Stufe D) ein SQL-Miss
// auf den Blob zurueckfiel. Im Exklusivmodus (Stufe E) gibt es diesen Fallback
// nicht mehr -> ein dauerhaft steigender Zaehler in Stufe D signalisiert, dass der
// Backfill noch nicht vollstaendig ist (Freigabekriterium fuer den Cutover E).
let _profileBlobReadFallbacks = 0;
function getProfileTelemetry() {
  return { blobReadFallbacks: _profileBlobReadFallbacks };
}

async function getProfile(profileId, deps = {}) {
  if (profileDbModeEnabled()) {
    const fromDb = await getProfileFromDb(profileId, deps);
    if (fromDb) return fromDb;
    // Exklusivmodus: relationaler Store ist die alleinige Wahrheit. Ein SQL-Miss
    // heisst "Profil existiert nicht" — bewusst KEIN Blob-Read, damit das Lesen
    // nachweislich ohne helmut_store funktioniert (Voraussetzung: abgeschlossener
    // Backfill, Runbook). Im reinen DB-Modus (Stufe D) bleibt der Blob-Fallback.
    if (profileDbExclusiveEnabled()) return null;
    _profileBlobReadFallbacks += 1;
  }
  return (await readStore()).profiles?.[profileId] || null;
}

// Liest ALLE Mandatsprofile relational (profiles + mandate_profiles) fuer die
// Admin-Uebersicht/den Profil-Switcher. Legitimer mandantenuebergreifender
// Admin-Read -> service_role. Fail-safe: Fehler -> null (loest Blob-Fallback bzw.
// [] im Exklusivmodus aus). Soft-geloeschte Zeilen (geloescht_at) werden ausgeblendet.
async function listFullProfilesFromDb(deps = {}) {
  if (!profileDbModeEnabled()) return null;
  const request = deps.request || supabaseRequest;
  try {
    const rows = await request("/rest/v1/profiles?select=*,mandate_profiles(*)&order=id.asc&limit=5000");
    if (!Array.isArray(rows)) return null;
    const out = [];
    for (const row of rows) {
      const mandateRow = Array.isArray(row.mandate_profiles) ? row.mandate_profiles[0] : row.mandate_profiles;
      if (!mandateRow) continue;             // Orphan/Trigger-Identitaetszeile ohne Mandatszeile -> ueberspringen (analog getProfileFromDb)
      if (mandateRow.geloescht_at) continue; // soft-deleted ausblenden
      out.push(fromMandateProfileRow(row, mandateRow));
    }
    return out;
  } catch (error) {
    console.error("[v3Store] listFullProfilesFromDb fehlgeschlagen:", error.message);
    return null;
  }
}

// Vereint Blob- und SQL-Profile je id (SQL gewinnt). Im Dual-Write-Modus (Stufe D)
// ist der Blob die garantierte, VOLLSTAENDIGE Wahrheit und die SQL-Tabelle nur eine
// (waehrend des Backfills evtl. noch unvollstaendige) Teilmenge — deshalb MERGE statt
// SQL-only, damit backfill-ausstehende Mandate nicht still aus Switcher/Admin/Cron
// verschwinden (Review-Fix P1) und die Liste mit getProfile (per-id Blob-Fallback)
// konsistent bleibt.
function mergeProfileLists(blobProfiles, sqlProfiles) {
  const byId = new Map();
  for (const p of blobProfiles || []) if (p && p.id) byId.set(p.id, p);
  for (const p of sqlProfiles || []) if (p && p.id) byId.set(p.id, p); // SQL ueberschreibt Blob
  return [...byId.values()];
}

// Vollstaendige Mandatsprofile (alle Felder) fuer die Admin-Ansicht. Read-only.
//  - Exklusivmodus (Stufe E): ausschliesslich SQL (Blob ist per Definition leer).
//  - Dual-Write (Stufe D): Blob (vollstaendig) mit SQL (frisch) vereint.
//  - Flag aus: nur Blob (byte-identisch wie zuvor).
async function listFullProfiles(deps = {}) {
  if (profileDbModeEnabled()) {
    const fromDb = await listFullProfilesFromDb(deps);
    if (profileDbExclusiveEnabled()) return fromDb || [];
    const store = await readStore();
    return mergeProfileLists(Object.values(store.profiles || {}), fromDb || []);
  }
  const store = await readStore();
  return Object.values(store.profiles || {});
}

function toProfileSummary(profile = {}) {
  return {
    id: profile.id,
    fullName: profile.fullName || profile.name || profile.id,
    party: profile.party || "",
    updatedAt: profile.updatedAt || null
  };
}

async function listProfiles(deps = {}) {
  return (await listFullProfiles(deps)).map(toProfileSummary);
}

async function saveProfile(profile, deps = {}) {
  const profileWithMeta = {
    ...profile,
    updatedAt: new Date().toISOString()
  };
  // Stufe E (Exklusivmodus): Mandatsprofile werden AUSSCHLIESSLICH relational
  // gespeichert — KEIN globaler helmut_store-Blob-Write mehr. Da es hier keinen
  // Blob-Fallback beim Schreiben gibt, MUSS ein relationaler Fehler sichtbar
  // werden (strict). Sonst waere ein fehlgeschlagener Save stiller Datenverlust.
  // Damit schreibt PATCH /api/profile/current keinen globalen Blob mehr.
  if (profileDbExclusiveEnabled()) {
    const res = await saveProfileToDb(profileWithMeta, { ...deps, strict: true });
    if (!res || res.saved !== true) {
      throw new Error(`[profil-exklusiv] Relationaler Profil-Write fehlgeschlagen: ${(res && res.reason) || "unbekannt"} (Exklusivmodus, kein Blob-Fallback)`);
    }
    return profileWithMeta;
  }
  // Stufe D / Baseline: Blob bleibt IMMER die erste, garantierte Schreiboperation
  // (Fallback-Treue). Der SQL-Schreibpfad ist rein additiv (Dual Write) und darf
  // den Blob-Erfolg nie verhindern (daher kein throw um den Rueckgabewert herum).
  const store = await readStore();
  store.profiles = store.profiles || {};
  store.mandateProfiles = store.mandateProfiles || {};
  store.profiles[profile.id] = profileWithMeta;
  store.mandateProfiles[profile.id] = toMandateProfile(profileWithMeta);
  await writeStore(store);
  if (profileDbModeEnabled()) await saveProfileToDb(profileWithMeta, deps);
  return profileWithMeta;
}

// Einmaliger Blob-Profil-Purge fuer den Wechsel in den Exklusivmodus (Stufe E).
// Entfernt eingefrorene Profilkopien (profiles/mandateProfiles) aus dem main-Blob,
// die nach dem Cutover nur noch tote Duplikate der relationalen Wahrheit sind.
//
// SICHERHEIT (fail-safe, kein Datenverlust): Es wird NUR eine Blob-Kopie entfernt,
// deren Profil relational NACHWEISLICH vorhanden ist (getProfileFromDb-Treffer).
// Fehlt ein Blob-Profil relational (Backfill noch nicht gelaufen), bleibt es
// UNANGETASTET und wird als skippedNoSql ausgewiesen -> zuerst Backfill fahren.
// Dry-Run ist Default; erst opts.execute=true schreibt. Erfordert aktiven DB-Modus
// (sonst laesst sich die relationale Praesenz nicht pruefen).
async function purgeBlobProfiles(opts = {}) {
  const execute = opts.execute === true;
  if (!profileDbModeEnabled()) {
    return { execute, error: "profile-db-mode-off", candidates: 0, purgeable: 0, skippedNoSql: [], purged: 0, written: false };
  }
  const getFromDb = opts.getFromDb || ((id) => getProfileFromDb(id));
  const store = await readStore("main");
  const blobIds = Object.keys(store.profiles || {});
  const report = { execute, candidates: blobIds.length, purgeable: 0, skippedNoSql: [], purged: 0, written: false };
  const removable = [];
  for (const id of blobIds) {
    const inSql = await getFromDb(id);
    if (inSql) removable.push(id);
    else report.skippedNoSql.push(id);
  }
  report.purgeable = removable.length;
  if (!execute || !removable.length) return report;
  for (const id of removable) {
    delete store.profiles[id];
    if (store.mandateProfiles) delete store.mandateProfiles[id];
  }
  report.purged = removable.length;
  await writeStore(store, "main");
  report.written = true;
  return report;
}

async function savePersonalizedRecommendations(politicianId, recommendations = []) {
  const key = pKey(politicianId);
  const store = await readStore(key);
  const others = (store.personalizedRecommendations || []).filter((entry) => entry.user_id !== politicianId);
  store.personalizedRecommendations = [...recommendations, ...others].slice(0, 4000);
  await writeStore(store, key);
  return recommendations;
}

async function savePoliticalItems(items = [], politicianId) {
  const key = pKey(politicianId);
  const store = await readStore(key);
  const byId = new Map((store.politicalItems || []).map((item) => [item.id, item]));
  items.forEach((item) => byId.set(item.id, { ...(byId.get(item.id) || {}), ...item }));
  store.politicalItems = Array.from(byId.values()).sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0)).slice(0, 1000);
  await writeStore(store, key);
  return items;
}

async function savePriorityChanges(changes = [], politicianId) {
  if (!changes.length) return [];
  const key = pKey(politicianId);
  const store = await readStore(key);
  store.priorityChanges = [...changes, ...(store.priorityChanges || [])].slice(0, 500);
  await writeStore(store, key);
  return changes;
}

async function getUserNotes(politicianId) {
  // Tenant-Haertung (Audit-Fix 2026-07): Der weiche Filter '!politicianId ||'
  // gab bei fehlendem Mandanten-Kontext ALLE Zeilen (inkl. Main-Store-Fallback)
  // zurueck. Da RLS heute inert ist (service_role), ist die App-Schicht die
  // EINZIGE Verteidigung — fehlender Kontext ist jetzt ein harter Fehler
  // (TenantContextError) statt eines potenziellen Cross-Tenant-Leaks.
  const tenantId = assertTenant(politicianId, "getUserNotes");
  const pStore = await readStore(pKey(tenantId));
  const notes = (pStore.userNotes || []).filter((note) => note.user_id === tenantId);
  if (notes.length) return notes;
  const mainStore = await readStore("main");
  return (mainStore.userNotes || []).filter((note) => note.user_id === tenantId);
}

async function saveUserNote(note) {
  const ownerPoliticianId = note.user_id || note.politicianId;
  const key = pKey(ownerPoliticianId);
  const store = await readStore(key);
  const now = new Date().toISOString();
  const noteWithMeta = {
    id: note.id || `note-${Date.now()}`,
    user_id: ownerPoliticianId || "unknown",
    recommendation_id: note.recommendation_id || note.recommendationId || "",
    political_item_id: note.political_item_id || note.politicalItemId || "",
    type: note.type || "note",
    text: String(note.text || "").trim(),
    status: note.status || "open",
    created_at: note.created_at || now,
    updated_at: now
  };
  const existingIndex = store.userNotes.findIndex((entry) => entry.id === noteWithMeta.id);
  if (existingIndex >= 0) store.userNotes[existingIndex] = { ...store.userNotes[existingIndex], ...noteWithMeta };
  else store.userNotes.unshift(noteWithMeta);
  await writeStore(store, key);
  return noteWithMeta;
}

async function savePushSubscription(politicianId, subscription, meta = {}) {
  const key = pKey(politicianId);
  const store = await readStore(key);
  const now = new Date().toISOString();
  const endpoint = String(subscription?.endpoint || "").trim();
  if (!endpoint) { const e = new Error("Push subscription endpoint missing"); e.statusCode = 400; throw e; }
  // Ohne p256dh/auth kann spaeter NIE ein Push zugestellt werden. Frueher wurde
  // so ein kaputtes Abo als Erfolg gespeichert (Zustellung scheiterte still).
  // Jetzt: bei fehlenden Keys 400 statt Schein-Erfolg.
  const keys = subscription && subscription.keys;
  if (!keys || !String(keys.p256dh || "").trim() || !String(keys.auth || "").trim()) {
    const e = new Error("Push subscription keys missing"); e.statusCode = 400; throw e;
  }
  const entry = {
    id: `push-${politicianId}-${hashStable(endpoint).slice(0, 18)}`,
    politicianId,
    endpoint,
    subscription,
    userAgent: meta.userAgent || "",
    createdAt: meta.createdAt || now,
    updatedAt: now,
    active: true
  };
  store.pushSubscriptions = [
    entry,
    ...(store.pushSubscriptions || []).filter((item) => item.endpoint !== endpoint)
  ].slice(0, 300);
  await writeStore(store, key);
  return entry;
}

async function removePushSubscription(politicianId, endpoint) {
  const key = pKey(politicianId);
  const store = await readStore(key);
  const before = (store.pushSubscriptions || []).length;
  store.pushSubscriptions = (store.pushSubscriptions || []).filter((item) => {
    if (politicianId && item.politicianId !== politicianId) return true;
    return item.endpoint !== endpoint;
  });
  await writeStore(store, key);
  return { removed: before - store.pushSubscriptions.length };
}

async function getPushSubscriptions(politicianId) {
  const tenantId = assertTenant(politicianId, "getPushSubscriptions"); // Sprint-1-Haertung
  const pStore = await readStore(pKey(tenantId));
  return (pStore.pushSubscriptions || []).filter((item) => item.active !== false && item.politicianId === tenantId);
}

async function savePushEvent(event) {
  const key = pKey(event.politicianId);
  const store = await readStore(key);
  const entry = {
    id: event.id || `push-event-${event.politicianId || "unknown"}-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...event
  };
  store.pushEvents = [entry, ...(store.pushEvents || []).filter((item) => item.id !== entry.id)].slice(0, 200);
  await writeStore(store, key);
  return entry;
}

async function getPushEventByDedupeKey(politicianId, dedupeKey) {
  const tenantId = assertTenant(politicianId, "getPushEventByDedupeKey"); // Sprint-1-Haertung
  if (!dedupeKey) return null;
  const pStore = await readStore(pKey(tenantId));
  return (pStore.pushEvents || []).find((event) => event.politicianId === tenantId && event.dedupeKey === dedupeKey) || null;
}

async function listPushEvents(politicianId, limit = 200) {
  const tenantId = assertTenant(politicianId, "listPushEvents"); // Sprint-1-Haertung
  const pStore = await readStore(pKey(tenantId));
  const events = (pStore.pushEvents || []).filter((event) => event.politicianId === tenantId);
  return events.slice(0, Math.max(0, limit));
}

// ── DSGVO-Vollstaendigkeit (Audit-Fix 2026-07) ───────────────────────────────
// Export (Art. 15/20) und Loeschung (Art. 17) erfassten frueher NUR den Blob-Store.
// Die produktiven V3-Relationstabellen mit user_id-Daten (briefings, decisions,
// mandate_profiles, matching_results, profile_embeddings, office_outputs, ...)
// und der Auth-Store (Konto, Sessions, Zuweisungen, Audit, KI-Nutzungslog)
// blieben vollstaendig erhalten — der Nutzer erhielt trotzdem eine Erfolgsmeldung.
// Jetzt decken exportProfileData/deleteProfileData ALLE drei Speicherorte ab.
// Alle Nutzertabellen (Kinder) werden EXPLIZIT geloescht (idempotent, erfasst
// auch verwaiste Zeilen ohne profiles-Elternzeile); profiles zuletzt (deren
// on-delete-cascade ist damit nur noch Sicherheitsnetz).
const V3_PRIVACY_CHILD_TABLES = [
  { table: "mandate_profiles", key: "user_id" },
  { table: "briefings", key: "user_id" },
  { table: "decisions", key: "user_id" },
  { table: "matching_results", key: "user_id" },
  // Sprint 23B-1: Auditprotokoll. FK auf profiles mit ON DELETE CASCADE loescht
  // ohnehin mit; der explizite Eintrag haelt die DSGVO-Loeschung vollstaendig
  // und unabhaengig von der Kaskade nachweisbar.
  { table: "matching_runs", key: "user_id" },
  { table: "profile_embeddings", key: "user_id" },
  { table: "office_outputs", key: "user_id" },
  { table: "matching_weights", key: "user_id" },
  { table: "topic_memory", key: "user_id" },
  { table: "interactions", key: "user_id" },
  { table: "user_notes", key: "user_id" },
  { table: "daily_tasks", key: "user_id" },
  { table: "communication_drafts", key: "user_id" },
  { table: "political_items", key: "user_id" },
  { table: "personalized_recommendations", key: "user_id" },
  { table: "priority_changes", key: "user_id" },
  // Kein FK auf profiles — MUSS explizit geloescht werden. Nur Meta-Daten
  // (Tokens/Kosten/Modell), keine Inhalte; drei moegliche Zuordnungsspalten.
  { table: "llm_usage", or: ["politician_id", "user_id", "profile_id"] }
];

function v3PrivacyFilter(t, politicianId) {
  const id = encodeURIComponent(politicianId);
  return t.or
    ? `or=(${t.or.map((k) => `${k}.eq.${id}`).join(",")})`
    : `${t.key || "user_id"}=eq.${id}`;
}

async function exportProfileDataV3(politicianId, deps = {}) {
  const ready = deps.ready !== undefined ? deps.ready : v3StoreReady();
  if (!ready) {
    // EHRLICHKEIT (Review-Fix, wie deleteProfileDataV3): Fehlkonfiguration
    // (Flag an, Supabase-Zugang fehlt) macht den Export sichtbar unvollstaendig.
    const reason = deps.reason !== undefined ? deps.reason : v3SkipReason();
    return { skipped: true, reason, vollstaendig: reason !== "v3-store-unavailable" };
  }
  const request = deps.request || supabaseRequest;
  const out = { skipped: false, vollstaendig: true, tabellen: {} };
  const tables = [...V3_PRIVACY_CHILD_TABLES, { table: "profiles", key: "id" }];
  // Paginiert lesen (Review-Fix): ein hartes limit=2000 hätte bei vielen Zeilen
  // (z. B. llm_usage/briefings) STILL abgeschnitten und den Export trotzdem als
  // vollständig gemeldet — ein DSGVO-Auskunftsfehler. Jetzt vollständige
  // Pagination je Tabelle; bei Read-Fehler wird die Tabelle ehrlich als
  // unvollständig markiert.
  const PAGE = 1000;
  for (const t of tables) {
    try {
      const rows = [];
      for (let offset = 0; ; offset += PAGE) {
        // order=id.asc (Review-Fix): LIMIT/OFFSET ueber mehrere separate Requests
        // ist OHNE ORDER BY nicht stabil — Zeilen koennten still doppelt oder gar
        // nicht exportiert werden. Alle Privacy-Tabellen haben id als PK.
        const page = await request(`/rest/v1/${t.table}?${v3PrivacyFilter(t, politicianId)}&order=id.asc&limit=${PAGE}&offset=${offset}`, { method: "GET" });
        if (!Array.isArray(page) || page.length === 0) break;
        rows.push(...page);
        if (page.length < PAGE) break;
        if (rows.length > 200000) { out.vollstaendig = false; break; } // Sicherheitsdeckel
      }
      out.tabellen[t.table] = rows;
    } catch (error) {
      // Ehrlichkeit vor Bequemlichkeit: ein fehlgeschlagener Tabellen-Read macht
      // den Export sichtbar UNVOLLSTAENDIG statt still leer.
      out.vollstaendig = false;
      out.tabellen[t.table] = { fehler: String(error && error.message || "read-failed").slice(0, 200) };
    }
  }
  return out;
}

async function deleteProfileDataV3(politicianId, deps = {}) {
  const ready = deps.ready !== undefined ? deps.ready : v3StoreReady();
  if (!ready) {
    // EHRLICHKEIT (Review-Fix): "Flag an, aber Supabase-Zugang fehlt" ist eine
    // FEHLKONFIGURATION — die V3-Zeilen blieben dann unangetastet, waehrend die
    // Loeschung frueher trotzdem ok:true meldete (fail-open). Nur das bewusst
    // deaktivierte V3 (lokaler Modus) ist ein legitimer Skip.
    const reason = deps.reason !== undefined ? deps.reason : v3SkipReason();
    return { skipped: true, reason, ok: reason !== "v3-store-unavailable" };
  }
  const request = deps.request || supabaseRequest;
  const result = { skipped: false, ok: true, geloescht: {}, fehler: [] };
  const tables = [...V3_PRIVACY_CHILD_TABLES, { table: "profiles", key: "id" }];
  for (const t of tables) {
    try {
      const rows = await request(`/rest/v1/${t.table}?${v3PrivacyFilter(t, politicianId)}`, {
        method: "DELETE",
        headers: { Prefer: "return=representation" }
      });
      result.geloescht[t.table] = Array.isArray(rows) ? rows.length : 0;
    } catch (error) {
      result.ok = false;
      result.fehler.push({ tabelle: t.table, fehler: String(error && error.message || "delete-failed").slice(0, 200) });
    }
  }
  return result;
}

async function exportProfileData(politicianId) {
  const [store, pStore] = await Promise.all([readStore("main"), readStore(pKey(politicianId))]);
  // SQL-aware, aber BLOB-TREU: Ist das Profil im Blob vorhanden (Flag aus ODER
  // Dual-Write, wo der Blob weiterhin vollstaendig geschrieben wird), wird der
  // EXAKTE Blob-Wert exportiert — byte-identisch zum bisherigen Export, ohne den
  // normalisierenden/lossy SQL-Roundtrip (faction<-party, leere Arrays gedroppt,
  // updatedAt aus DB). NUR im Exklusivmodus (Blob leer) wird relational gelesen.
  const profile = store.profiles?.[politicianId] || (profileDbModeEnabled() ? await getProfile(politicianId) : null) || null;
  // V3-Tabellen + Auth-Store gehoeren zum Export (Art. 15/20) — Fehler dort
  // machen den Export sichtbar unvollstaendig, verhindern ihn aber nicht.
  const accounts = require("./accounts");
  const [v3, authDaten] = await Promise.all([
    exportProfileDataV3(politicianId).catch((e) => ({ skipped: false, vollstaendig: false, fehler: String(e && e.message || "v3-export-failed").slice(0, 200) })),
    accounts.exportAuthDataForPolitician(politicianId).catch((e) => ({ vollstaendig: false, fehler: String(e && e.message || "auth-export-failed").slice(0, 200) }))
  ]);
  return {
    exportedAt: new Date().toISOString(),
    politicianId,
    // v3.vollstaendig traegt den Skip-Status ehrlich (bewusst aus = vollstaendig,
    // Fehlkonfiguration = unvollstaendig) — kein pauschales skipped-ist-ok mehr.
    vollstaendig: v3.vollstaendig !== false && authDaten.vollstaendig !== false,
    v3Tabellen: v3,
    authDaten,
    profile,
    mandateProfile: store.mandateProfiles?.[politicianId] || (profile ? toMandateProfile(profile) : null),
    briefings: profileRows(pStore.briefings, politicianId),
    tasks: profileRows(pStore.tasks, politicianId),
    interactions: profileRows(pStore.interactions, politicianId),
    topicMemory: profileRows(pStore.topicMemory, politicianId),
    politicalItems: userRows(pStore.politicalItems, politicianId),
    personalizedRecommendations: userRows(pStore.personalizedRecommendations, politicianId),
    dailyTasks: userRows(pStore.dailyTasks, politicianId),
    communicationDrafts: userRows(pStore.communicationDrafts, politicianId),
    userNotes: userRows(pStore.userNotes, politicianId),
    priorityChanges: userRows(pStore.priorityChanges, politicianId),
    lageChecks: profileRows(pStore.lageChecks, politicianId),
    pushSubscriptions: profileRows(pStore.pushSubscriptions, politicianId).map(redactPushSubscription),
    pushEvents: profileRows(pStore.pushEvents, politicianId),
    pipelineDebugReports: profileRows(pStore.pipelineDebugReports, politicianId),
    rawItems: profileRawItems(store.rawItems, profile, politicianId)
  };
}

async function deleteProfileData(politicianId) {
  const [store, pStore] = await Promise.all([readStore("main"), readStore(pKey(politicianId))]);
  // SQL-aware, aber BLOB-TREU (wie exportProfileData): Blob-Wert bevorzugen (Flag
  // aus/Dual-Write), nur im Exklusivmodus relational lesen. Die relationalen
  // Profilzeilen selbst loescht deleteProfileDataV3 (Cascade) weiter unten.
  const profile = store.profiles?.[politicianId] || (profileDbModeEnabled() ? await getProfile(politicianId) : null) || null;
  const before = dataCounts(store, pStore, politicianId, profile);

  // Folge-Fix (P0-Review): den grossen main-Blob NUR schreiben, wenn sich dort
  // tatsaechlich etwas aendert — es existierte eine (ggf. eingefrorene) Blob-
  // Profilkopie ODER dem Profil zugeordnete rawItems werden entfernt. Im
  // Exklusivmodus liegt das Profil relational; ohne Blob-Kopie und ohne eigene
  // rawItems ist der main-Write ein reiner No-op und entfaellt (kein unnoetiger
  // Profil-Blob-Zugriff). Die autoritative Profil-Loeschung erfolgt relational
  // (deleteProfileDataV3, Cascade) — davon unberuehrt.
  const hadBlobProfile = Boolean((store.profiles && store.profiles[politicianId]) || (store.mandateProfiles && store.mandateProfiles[politicianId]));
  if (store.profiles) delete store.profiles[politicianId];
  if (store.mandateProfiles) delete store.mandateProfiles[politicianId];
  const rawBefore = (store.rawItems || []).length;
  store.rawItems = (store.rawItems || []).filter((item) => !rawItemBelongsToProfile(item, profile, politicianId));
  if (hadBlobProfile || store.rawItems.length !== rawBefore) await writeStore(store, "main");
  // Politiker-Store nur leeren, wenn er ueberhaupt Daten traegt (sonst No-op-Write).
  const pStoreHadData = Object.values(pStore || {}).some((v) => Array.isArray(v) && v.length > 0);
  if (pStoreHadData) await writeStore(defaultPoliticianStore(), pKey(politicianId));

  // DSGVO-Vollstaendigkeit (Audit-Fix 2026-07): V3-Relationstabellen + Auth-Store
  // gehoeren zur Loeschung. Ein Teilfehler dort setzt ok=false — es gibt KEINE
  // Erfolgsmeldung mehr, waehrend Daten zurueckbleiben.
  const accounts = require("./accounts");
  const v3 = await deleteProfileDataV3(politicianId)
    .catch((e) => ({ skipped: false, ok: false, fehler: [{ tabelle: "*", fehler: String(e && e.message || "v3-delete-failed").slice(0, 200) }] }));
  const auth = await accounts.deleteAuthDataForPolitician(politicianId)
    .catch((e) => ({ ok: false, fehler: String(e && e.message || "auth-delete-failed").slice(0, 200) }));
  // OP-25: die Scheduler-Spur des Mandats (nur Metadaten) gehoert zur Loeschung.
  const fairness = await deleteCronFairnessTenant(politicianId);

  const emptyPStore = defaultPoliticianStore();
  const after = dataCounts(store, emptyPStore, politicianId, null);
  return {
    // v3.ok traegt den Skip-Status bereits ehrlich (bewusst deaktiviert = ok,
    // Fehlkonfiguration = nicht ok) — kein pauschales "skipped zaehlt als Erfolg" mehr.
    ok: Boolean(v3.ok && auth.ok && fairness.ok),
    deletedAt: new Date().toISOString(),
    politicianId,
    before,
    after,
    v3Tabellen: v3,
    authDaten: auth,
    schedulerSpur: fairness
  };
}

// STRIKT gescopte Mandanten-Entfernung (Sprint-1-Provisionierung: teardown/rollback).
// Anders als deleteProfileData entfernt sie NUR ausdruecklich EIGENE Daten:
// Profil-Identitaet, den eigenen Content-Store, die V3-Zeilen (user_id-gefiltert) und
// die Auth-Daten. Sie fasst BEWUSST NICHT die geteilten Main-Store-rawItems ueber den
// breiten person/news/term-Match an (rawItemBelongsToProfile) — dessen Termmatch
// koennte beim Entfernen EINES Mandanten auch Rohdaten ANDERER Mandanten
// mitloeschen. Hier werden rawItems nur bei EXPLIZITER Eigentuemerschaft
// (politicianId/profileId/user_id === id) entfernt.
async function deleteTenantScopedData(politicianId) {
  const uid = assertTenant(politicianId, "deleteTenantScopedData");
  const store = await readStore("main");
  const before = {
    profil: store.profiles && store.profiles[uid] ? 1 : 0,
    eigeneRawItems: (store.rawItems || []).filter((item) => item && (item.politicianId === uid || item.profileId === uid || item.user_id === uid)).length
  };
  const hadBlobProfile = Boolean((store.profiles && store.profiles[uid]) || (store.mandateProfiles && store.mandateProfiles[uid]));
  if (store.profiles) delete store.profiles[uid];
  if (store.mandateProfiles) delete store.mandateProfiles[uid];
  const rawBefore = (store.rawItems || []).length;
  store.rawItems = (store.rawItems || []).filter((item) => !(item && (item.politicianId === uid || item.profileId === uid || item.user_id === uid)));
  // Folge-Fix (P0-Review): main-Blob nur bei tatsaechlicher Aenderung schreiben
  // (Blob-Profilkopie vorhanden ODER eigene rawItems entfernt) — sonst No-op.
  if (hadBlobProfile || store.rawItems.length !== rawBefore) await writeStore(store, "main");
  await writeStore(defaultPoliticianStore(), pKey(uid));
  const v3 = await deleteProfileDataV3(uid).catch((e) => ({ ok: false, fehler: [{ tabelle: "*", fehler: String(e && e.message || "v3-delete-failed").slice(0, 200) }] }));
  const auth = await require("./accounts").deleteAuthDataForPolitician(uid).catch((e) => ({ ok: false, fehler: String(e && e.message || "auth-delete-failed").slice(0, 200) }));
  // OP-25: Scheduler-Spur (nur Metadaten) gehoert zum Teardown.
  const fairness = await deleteCronFairnessTenant(uid);
  return {
    ok: Boolean((v3.ok === undefined ? true : v3.ok) && (auth.ok === undefined ? true : auth.ok) && fairness.ok),
    politicianId: uid,
    before,
    v3Tabellen: v3,
    authDaten: auth,
    schedulerSpur: fairness
  };
}

function profileRows(rows = [], politicianId) {
  return (rows || []).filter((row) => row?.politicianId === politicianId || row?.profileId === politicianId);
}

function userRows(rows = [], politicianId) {
  return (rows || []).filter((row) => row?.user_id === politicianId || row?.userId === politicianId || row?.politicianId === politicianId);
}

function withoutProfileRows(rows = [], politicianId) {
  return (rows || []).filter((row) => row?.politicianId !== politicianId && row?.profileId !== politicianId);
}

function withoutUserRows(rows = [], politicianId) {
  return (rows || []).filter((row) => row?.user_id !== politicianId && row?.userId !== politicianId && row?.politicianId !== politicianId);
}

function profileRawItems(rawItems = [], profile, politicianId) {
  return (rawItems || []).filter((item) => rawItemBelongsToProfile(item, profile, politicianId));
}

function rawItemBelongsToProfile(item = {}, profile, politicianId) {
  if (!item || typeof item !== "object") return false;
  if (item.politicianId === politicianId || item.profileId === politicianId || item.user_id === politicianId) return true;
  // MANDANTENTRENNUNG: Ein Personen-Item gehoert NUR dem Mandat, dessen
  // Personenquelle es geliefert hat ("<mandats-id>-news" bzw. deren Legacy-
  // Mehrfachsuchen "<mandats-id>-news-<suffix>"). Frueher galt JEDES Personen-
  // Item als eigen — Export/DSGVO-Loeschung eines Mandanten haette damit die
  // Personen-Rohdaten ALLER Mandanten erfasst.
  if (isOwnPersonNewsItem(item, politicianId)) return true;
  const terms = profileTerms(profile, politicianId);
  const text = `${item.title || ""} ${item.content || ""} ${item.excerpt || ""} ${item.author || ""}`.toLowerCase();
  return terms.some((term) => term && text.includes(term));
}

function isOwnPersonNewsItem(item = {}, politicianId) {
  const own = String(politicianId || "").trim().toLowerCase();
  if (!own) return false;
  const sid = String(item.sourceId || "").trim().toLowerCase();
  // Deckt die dynamische Personenquelle ("<id>-news"), deren Legacy-
  // Mehrfachsuchen ("<id>-news-<suffix>") UND den relationalen Abrufweg-Alias
  // ("rp-<id>-news[-…]") ab — DSGVO-Export/-Loeschung erfasst die eigenen
  // Personen-Rohdaten unabhaengig vom Abrufpfad.
  return sid === `${own}-news` || sid.startsWith(`${own}-news-`)
    || sid === `rp-${own}-news` || sid.startsWith(`rp-${own}-news-`);
}

function profileTerms(profile, politicianId) {
  const fullName = String(profile?.fullName || readableProfileName(politicianId)).trim().toLowerCase();
  const parts = fullName.split(/\s+/).filter(Boolean);
  return Array.from(new Set([
    fullName,
    parts.length > 1 ? parts.at(-1) : "",
    String(politicianId || "").replace(/-/g, " ").toLowerCase()
  ].filter((term) => term && term.length >= 3)));
}

function readableProfileName(politicianId) {
  return String(politicianId || "").split("-").filter(Boolean).join(" ");
}

function redactPushSubscription(entry) {
  return {
    ...entry,
    subscription: entry.subscription ? {
      endpoint: entry.subscription.endpoint,
      keys: entry.subscription.keys ? { p256dh: "[redacted]", auth: "[redacted]" } : undefined
    } : undefined
  };
}

function dataCounts(mainStore, pStore, politicianId, profile) {
  return {
    profile: mainStore.profiles?.[politicianId] ? 1 : 0,
    mandateProfile: mainStore.mandateProfiles?.[politicianId] ? 1 : 0,
    briefings: profileRows(pStore.briefings, politicianId).length,
    tasks: profileRows(pStore.tasks, politicianId).length,
    interactions: profileRows(pStore.interactions, politicianId).length,
    topicMemory: profileRows(pStore.topicMemory, politicianId).length,
    politicalItems: userRows(pStore.politicalItems, politicianId).length,
    personalizedRecommendations: userRows(pStore.personalizedRecommendations, politicianId).length,
    dailyTasks: userRows(pStore.dailyTasks, politicianId).length,
    communicationDrafts: userRows(pStore.communicationDrafts, politicianId).length,
    userNotes: userRows(pStore.userNotes, politicianId).length,
    priorityChanges: userRows(pStore.priorityChanges, politicianId).length,
    lageChecks: profileRows(pStore.lageChecks, politicianId).length,
    pushSubscriptions: profileRows(pStore.pushSubscriptions, politicianId).length,
    pushEvents: profileRows(pStore.pushEvents, politicianId).length,
    pipelineDebugReports: profileRows(pStore.pipelineDebugReports, politicianId).length,
    rawItems: profileRawItems(mainStore.rawItems, profile, politicianId).length
  };
}

function hashStable(value) {
  let hash = 5381;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) + text.charCodeAt(index);
    hash &= 0xffffffff;
  }
  return Math.abs(hash).toString(36);
}

function toMandateProfile(profile) {
  return {
    user_id: profile.id,
    name: profile.fullName,
    partei: profile.party,
    fraktion: profile.faction,
    rolle: profile.function || profile.role,
    politische_ebene: profile.politicalLevel || "Bund",
    wahlkreis: profile.constituency,
    bundesland: profile.state,
    ausschuesse: profile.committees || [],
    berichterstatter_themen: profile.reportingTopics || [],
    fachpolitische_schwerpunkte: profile.focusTopics || [],
    aktuelle_kampagnen: profile.currentCampaigns || [],
    oeffentliche_positionen: profile.publicPositions || [],
    wichtige_zielgruppen: profile.keyAudiences || [],
    kommunikationsstil: profile.communicationStyle,
    risiko_themen: profile.riskTopics || [],
    chancen_themen: profile.opportunityTopics || [],
    no_go_themen: profile.noGoTopics || [],
    bevorzugte_kanaele: profile.preferredChannels || [],
    buero_uebergabe: profile.officeHandoffMethod || "share",
    naechste_termine: profile.upcomingAppointments || [],
    updated_at: profile.updatedAt
  };
}

// --- Mehrmandantenfaehigkeit Phase 3: profiles/mandate_profiles SQL-Pfad -------
// Eigene Spalten-Listen statt Wiederverwendung von toMandateProfile() oben: jene
// Funktion fuellt den Blob-internen store.mandateProfiles-Schluessel und traegt
// Felder (`name`, `buero_uebergabe`, `politische_ebene:"Bund"`), die in der
// REALEN SQL-Tabelle so nicht existieren bzw. deren CHECK-Constraints verletzen
// wuerden (politische_ebene erlaubt nur "bundestag"/"landtag"/NULL). Ein direktes
// Wiederverwenden haette den Upsert an der DB scheitern lassen.
const MANDATE_PROFILE_COLUMNS = [
  "partei", "fraktion", "rolle", "politische_ebene", "wahlkreis", "bundesland",
  "ausschuesse", "berichterstatter_themen", "fachpolitische_schwerpunkte",
  "aktuelle_kampagnen", "oeffentliche_positionen", "wichtige_zielgruppen",
  "kommunikationsstil", "risiko_themen", "chancen_themen", "no_go_themen",
  "bevorzugte_kanaele", "naechste_termine", "namensvarianten",
  "stellvertretende_ausschuesse", "regionale_themen", "regierungsrolle", "aktiv",
  "onboarding_status", "ki_budget_taeglich_cent", "ki_budget_monatlich_cent",
  "datenschutz_bestaetigt_at", "geloescht_at",
  // Phase 15 (Vollstaendigkeit): strukturierte Spalten fuer die uebrigen
  // funktional genutzten Blob-Felder + profil_extras-Auffangbehaelter.
  "relevante_ministerien", "gegner", "monitoring_ziele", "regionale_interessen",
  "themen_prioritaeten", "buero_uebergabe", "profil_extras"
];

// camelCase-Profilfelder, die bereits eine EIGENE Spalte haben (direkt ODER via
// Umbenennung). Alles was NICHT hier steht, wandert verlustfrei in profil_extras,
// damit beim DB-Pfad garantiert kein Feld verloren geht (auch kuenftige). "id" ist
// der Schluessel (profiles.id), "email"/"name" leben in profiles.
const MANDATE_KNOWN_PROFILE_KEYS = new Set([
  "id", "email", "name", "fullName", "party", "faction", "function", "role",
  "politicalLevel", "parliamentType", "constituency", "state", "committee",
  "committees", "focusTopics", "reportingTopics", "currentCampaigns",
  "publicPositions", "keyAudiences", "communicationStyle", "riskTopics",
  "opportunityTopics", "noGoTopics", "preferredChannels", "upcomingAppointments",
  "nameVariants", "deputyCommittees", "regionalTopics", "governmentRole",
  "profileActive", "onboardingStatus", "aiBudgetDailyCents", "aiBudgetMonthlyCents",
  "privacyConfirmedAt", "deletedAt", "updatedAt",
  "relevantMinistries", "opponents", "monitoringTargets", "regionalInterests",
  "topicPriorities", "officeHandoffMethod"
]);

// Sammelt alle Profilfelder OHNE eigene Spalte in ein reines Objekt (fuer
// profil_extras). Bewahrt localMedia/mainQuestion/officeFormats/outputNeeds/
// location/committeeUnknown/... + jedes kuenftige Feld 1:1.
function collectProfileExtras(profile = {}) {
  const extras = {};
  for (const key of Object.keys(profile)) {
    if (!MANDATE_KNOWN_PROFILE_KEYS.has(key) && profile[key] !== undefined) {
      extras[key] = profile[key];
    }
  }
  return extras;
}

function politicalLevelToEbene(profile = {}) {
  const explicit = String(profile.parliamentType || profile.politicalLevel || "").trim().toLowerCase();
  if (explicit.includes("landtag") || explicit.startsWith("land")) return "landtag";
  if (explicit.includes("bundestag") || explicit.startsWith("bund")) return "bundestag";
  return null;
}

// KI-Budget-Spalten (ki_budget_*_cent) sind integer mit CHECK (spalte is null OR
// spalte > 0), Migration 20260712_mandate_profile_fields.sql. Ein ungueltiger
// Nutzerwert (negativ, Dezimal, nicht-numerisch) wird vom toleranten Save-Pfad
// bewusst ROH durchgereicht (server.js budgetCentValue), damit validateProfile ihn
// als "fehlerhaft" melden kann. Wuerde dieser Rohwert 1:1 in die typisierte Spalte
// geschrieben, scheiterte der Upsert an CHECK/Typ — im strict-Exklusivmodus mit
// throw -> HTTP 500 + vollstaendigem Save-Verlust (P1). Daher: nur eine gueltige
// positive Ganzzahl wandert in die Spalte, alles andere -> null (Systemdefault,
// CHECK-konform). Der Rohwert geht NICHT verloren (siehe collectInvalidBudgetExtras
// + fromMandateProfileRow): er bleibt in profil_extras erhalten, sodass das Profil
// unveraendert gespeichert wird UND validateProfile den Fehler weiter anzeigt.
function sanitizeBudgetCent(value) {
  const num = Number(value);
  return Number.isFinite(num) && Number.isInteger(num) && num > 0 ? num : null;
}

// Rohwerte ungueltiger Budgets verlustfrei fuer profil_extras (jsonb, kein CHECK)
// sammeln. 0 ist das dokumentierte Reset-Signal (null=Systemdefault) und KEIN
// Fehler -> nicht aufbewahren. Nur echte Fehleingaben werden erhalten.
function collectInvalidBudgetExtras(profile = {}) {
  const out = {};
  const keep = (key, raw) => {
    if (raw == null || raw === 0) return;
    if (sanitizeBudgetCent(raw) === null) out[key] = raw;
  };
  keep("aiBudgetDailyCents", profile.aiBudgetDailyCents);
  keep("aiBudgetMonthlyCents", profile.aiBudgetMonthlyCents);
  return out;
}

// Internes Profil-Objekt (camelCase, Form wie saveProfile/scheduler-Defaults) -> Zeile
// fuer public.mandate_profiles. Nur Spalten aus MANDATE_PROFILE_COLUMNS, damit
// PostgREST nie an einer unbekannten Spalte scheitert.
function toMandateProfileRow(profile = {}) {
  const row = {
    partei: profile.party || null,
    fraktion: profile.faction || profile.party || null,
    rolle: profile.function || profile.role || null,
    politische_ebene: politicalLevelToEbene(profile),
    wahlkreis: profile.constituency || null,
    bundesland: profile.state || null,
    ausschuesse: profile.committees || (profile.committee ? [profile.committee] : []),
    berichterstatter_themen: profile.reportingTopics || [],
    fachpolitische_schwerpunkte: profile.focusTopics || [],
    aktuelle_kampagnen: profile.currentCampaigns || [],
    oeffentliche_positionen: profile.publicPositions || [],
    wichtige_zielgruppen: profile.keyAudiences || [],
    kommunikationsstil: profile.communicationStyle || null,
    risiko_themen: profile.riskTopics || [],
    chancen_themen: profile.opportunityTopics || [],
    no_go_themen: profile.noGoTopics || [],
    bevorzugte_kanaele: profile.preferredChannels || [],
    naechste_termine: profile.upcomingAppointments || [],
    namensvarianten: profile.nameVariants || [],
    stellvertretende_ausschuesse: profile.deputyCommittees || [],
    regionale_themen: profile.regionalTopics || [],
    regierungsrolle: profile.governmentRole || null,
    aktiv: profile.profileActive !== false,
    onboarding_status: profile.onboardingStatus || "neu",
    ki_budget_taeglich_cent: sanitizeBudgetCent(profile.aiBudgetDailyCents),
    ki_budget_monatlich_cent: sanitizeBudgetCent(profile.aiBudgetMonthlyCents),
    datenschutz_bestaetigt_at: profile.privacyConfirmedAt || null,
    geloescht_at: profile.deletedAt || null,
    // Phase 15 (Vollstaendigkeit): uebrige funktionale Felder + Auffangbehaelter.
    relevante_ministerien: profile.relevantMinistries || [],
    gegner: profile.opponents || [],
    monitoring_ziele: profile.monitoringTargets || [],
    regionale_interessen: profile.regionalInterests || [],
    themen_prioritaeten: (profile.topicPriorities && typeof profile.topicPriorities === "object") ? profile.topicPriorities : {},
    buero_uebergabe: profile.officeHandoffMethod || null,
    // Ungueltige Budget-Rohwerte (aus der typisierten Spalte verdraengt) verlustfrei
    // mit aufnehmen, damit kein Feld verloren geht (kein Datenverlust, Wiederlesen
    // zeigt den Fehler erneut). Gueltige/leere Budgets landen hier NIE (nur Spalte).
    profil_extras: { ...collectProfileExtras(profile), ...collectInvalidBudgetExtras(profile) }
  };
  return pickColumns(row, MANDATE_PROFILE_COLUMNS);
}

// SQL-Zeilen (profiles + mandate_profiles) -> internes Profil-Objekt. Nur belegte
// Felder werden gesetzt (leere Arrays/NULL werden weggelassen), damit
// mergeProfileDefaults()/blankProfile() (server.js, scheduler.js) unveraendert
// neutral auffuellen koennen, statt eine "leere" Personalisierung zu erzwingen.
function fromMandateProfileRow(profilesRow = {}, mandateRow = null) {
  const m = mandateRow || {};
  const arr = (v) => (Array.isArray(v) && v.length ? v : undefined);
  const str = (v) => (v != null && String(v).trim() ? String(v) : undefined);
  const ebene = m.politische_ebene === "landtag" ? "Land" : (m.politische_ebene === "bundestag" ? "Bund" : undefined);
  const parliamentType = m.politische_ebene === "landtag" ? "Landtag" : (m.politische_ebene === "bundestag" ? "Bundestag" : undefined);
  const committees = arr(m.ausschuesse);
  const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length ? v : undefined);
  // profil_extras ZUERST zuruecksetzen (localMedia/mainQuestion/officeFormats/...);
  // die strukturierten Felder unten ueberschreiben sie bewusst, falls doppelt.
  const extras = obj(m.profil_extras) || {};
  const profile = {
    ...extras,
    id: profilesRow.id,
    fullName: str(profilesRow.name),
    party: str(m.partei),
    faction: str(m.fraktion),
    function: str(m.rolle),
    role: str(m.rolle),
    politicalLevel: ebene,
    parliamentType,
    constituency: str(m.wahlkreis),
    state: str(m.bundesland),
    committee: committees ? committees[0] : undefined,
    committees,
    deputyCommittees: arr(m.stellvertretende_ausschuesse),
    reportingTopics: arr(m.berichterstatter_themen),
    focusTopics: arr(m.fachpolitische_schwerpunkte),
    regionalTopics: arr(m.regionale_themen),
    currentCampaigns: arr(m.aktuelle_kampagnen),
    publicPositions: arr(m.oeffentliche_positionen),
    keyAudiences: arr(m.wichtige_zielgruppen),
    communicationStyle: str(m.kommunikationsstil),
    riskTopics: arr(m.risiko_themen),
    opportunityTopics: arr(m.chancen_themen),
    noGoTopics: arr(m.no_go_themen),
    preferredChannels: arr(m.bevorzugte_kanaele),
    upcomingAppointments: arr(m.naechste_termine),
    nameVariants: arr(m.namensvarianten),
    governmentRole: str(m.regierungsrolle),
    profileActive: m.aktiv !== false,
    onboardingStatus: str(m.onboarding_status),
    // Spalte gewinnt (gueltiger Wert); ist sie null, den ggf. in profil_extras
    // erhaltenen Rohwert (ungueltige Eingabe) wiederherstellen, statt ihn zu
    // verwerfen — so bleibt der tolerante Vertrag beim Round-Trip erhalten.
    aiBudgetDailyCents: m.ki_budget_taeglich_cent != null ? Number(m.ki_budget_taeglich_cent) : extras.aiBudgetDailyCents,
    aiBudgetMonthlyCents: m.ki_budget_monatlich_cent != null ? Number(m.ki_budget_monatlich_cent) : extras.aiBudgetMonthlyCents,
    privacyConfirmedAt: str(m.datenschutz_bestaetigt_at),
    // Phase 15 (Vollstaendigkeit): uebrige funktionale Felder rekonstruieren.
    relevantMinistries: arr(m.relevante_ministerien),
    opponents: arr(m.gegner),
    monitoringTargets: arr(m.monitoring_ziele),
    regionalInterests: arr(m.regionale_interessen),
    topicPriorities: obj(m.themen_prioritaeten),
    officeHandoffMethod: str(m.buero_uebergabe),
    updatedAt: m.updated_at || profilesRow.updated_at
  };
  Object.keys(profile).forEach((key) => { if (profile[key] === undefined) delete profile[key]; });
  return profile;
}

// Liest profiles+mandate_profiles ueber eine PostgREST-Embed-Query (ein
// Roundtrip). Fail-safe wie jeder andere V3-Read in dieser Datei: Fehler ->
// null (loest den bestehenden Blob-Fallback in getProfile() aus), NIE ein throw.
async function getProfileFromDb(userId, deps = {}) {
  if (!userId || !profileDbModeEnabled()) return null;
  const request = deps.request || ((endpoint) => tenantRequest(endpoint, userId));
  try {
    const rows = await request(
      `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*,mandate_profiles(*)&limit=1`
    );
    const row = Array.isArray(rows) && rows.length ? rows[0] : null;
    if (!row) return null;
    const mandateRow = Array.isArray(row.mandate_profiles) ? row.mandate_profiles[0] : row.mandate_profiles;
    // Profiles-Zeile OHNE mandate_profiles-Zeile ist unvollstaendig: entweder eine
    // vom helmut_ensure_profile()-Trigger angelegte Identitaets-Zeile (nur wegen
    // Kind-Tabellen) ODER eine Orphan-Zeile aus einem Teilfehler (profiles-Upsert
    // ok, mandate_profiles-Upsert gescheitert). In BEIDEN Faellen wuerde
    // fromMandateProfileRow(row, null) ein "gueltiges, aber leeres" Profil liefern
    // (nur id/fullName), das leere Personalisierung ins Scoring speist. Deshalb wie
    // "nicht vorhanden" behandeln -> null (Stufe D: Blob-Fallback greift; Stufe E: blank).
    if (!mandateRow) return null;
    if (mandateRow.geloescht_at) return null; // Soft-geloescht: wie "nicht vorhanden" behandeln.
    return fromMandateProfileRow(row, mandateRow);
  } catch (error) {
    console.error("[v3Store] getProfileFromDb fehlgeschlagen:", error.message);
    return null;
  }
}

// Schreibt profiles + mandate_profiles (zwei Upserts). Fail-safe: ein Fehler hier
// darf den umschliessenden saveProfile()-Aufruf (Blob-Schreiben ist dort bereits
// abgeschlossen) NIE zum Scheitern bringen.
async function saveProfileToDb(profile = {}, deps = {}) {
  // strict (Exklusivmodus/Stufe E): ein Fehler MUSS geworfen werden, weil es dann
  // keinen Blob-Fallback beim Schreiben gibt. Ohne strict (Stufe D, additiver
  // Dual Write) bleibt das bisherige fail-safe Verhalten byte-identisch.
  const strict = deps.strict === true;
  if (!profile.id) {
    if (strict) throw new Error("saveProfileToDb: profile.id fehlt (Exklusivmodus)");
    return { skipped: true, reason: "missing-id" };
  }
  if (!profileDbModeEnabled()) {
    if (strict) throw new Error(`saveProfileToDb: DB-Modus nicht bereit (${v3SkipReason()})`);
    return { skipped: true, reason: v3SkipReason() };
  }
  const upsert = deps.upsert || ((table, row, onConflict) => v3Upsert(table, row, onConflict, profile.id));
  try {
    // profiles ZUERST (Elternzeile/FK-Ziel), dann mandate_profiles. Beide Upserts
    // sind idempotent (on_conflict auf dem PK) -> wiederholte Saves erzeugen keine
    // Duplikate, ein Retry nach Teilfehler heilt sich selbst.
    await upsert("profiles", pickColumns({
      id: profile.id,
      name: profile.fullName || profile.id,
      email: profile.email || null
    }, ["id", "name", "email"]), "id");
    await upsert("mandate_profiles", {
      user_id: profile.id,
      ...toMandateProfileRow(profile)
    }, "user_id");
    return { saved: true };
  } catch (error) {
    console.error("[v3Store] saveProfileToDb fehlgeschlagen:", error.message);
    if (strict) throw error;
    return { skipped: true, reason: "write-failed" };
  }
}

function updateRecommendationFromInteraction(recommendations, interaction) {
  const recommendationId = interaction.recommendationId || interaction.recommendation_id;
  const signalId = interaction.signalId;
  const type = interaction.type;
  if (!recommendationId && !signalId) return recommendations;
  return recommendations.map((recommendation) => {
    const matches = recommendation.id === recommendationId || recommendation.signal_id === signalId || recommendation.signalId === signalId;
    if (!matches) return recommendation;
    const status = type === "ignored" ? "ignored"
      : type === "snoozed" ? "snoozed"
        : ["task_copied", "delegated"].includes(type) ? "in_progress"
          : type === "done" ? "done"
            : ["marked_important", "marked_relevant"].includes(type) ? "relevant"
              : recommendation.status === "ignored" ? "seen"
                : recommendation.status || "seen";
    return {
      ...recommendation,
      status,
      feedback: ["marked_important", "marked_relevant", "ignored", "snoozed", "done"].includes(type) ? type : recommendation.feedback,
      last_seen_by_user: interaction.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });
}

// --- Admin Dashboard Stats (additiv, rein lesend) ---

// Ordnet einen LLM-callType einer Produktkategorie zu.
// intelligence: Vorgänge verstehen + KI-Scoring (V2/V3).
// briefing:     personalisierte Einschätzungen und Kommunikationsentwürfe.
// office:       Büro-Engine-Outputs (Reden, PM, Social).
function categorizeLlmCallType(callType) {
  const ct = String(callType || "").toLowerCase();
  if (ct === "understanding" || ct.includes("v2score") || ct.includes("parliament")) return "intelligence";
  if (ct.includes("briefing") || ct === "helmutassessment" || ct === "communicationdraft") return "briefing";
  if (ct.includes("office")) return "office";
  return "other";
}

// KI-Kostenauswertung über `days` Tage. Liest nur den Auth-Store (llmUsage).
async function getAdminStatsCosts({ days = 30, referenceIso = null } = {}) {
  const store = await readAuthStore();
  const allUsage = Array.isArray(store.llmUsage) ? store.llmUsage : [];
  const refMs = referenceIso ? new Date(referenceIso).getTime() : Date.now();
  const cutoffMs = refMs - days * 24 * 60 * 60 * 1000;
  const relevant = allUsage.filter((e) => {
    const ms = new Date(e.createdAt || 0).getTime();
    return ms >= cutoffMs && !String(e.callType || "").startsWith("skipped");
  });

  const totalCalls = relevant.length;
  const successfulCalls = relevant.filter((e) => e.success !== false).length;
  const totalCostUsd = Math.round(relevant.reduce((s, e) => s + (typeof e.estimatedCost === "number" ? e.estimatedCost : 0), 0) * 1e6) / 1e6;
  const totalTokens = relevant.reduce((s, e) => s + (typeof e.totalTokens === "number" ? e.totalTokens : 0), 0);

  const perModel = {};
  const perCategory = {};
  const byDay = {};

  for (const e of relevant) {
    const model = e.model || "unknown";
    if (!perModel[model]) perModel[model] = { calls: 0, successfulCalls: 0, estimatedCostUsd: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    perModel[model].calls++;
    if (e.success !== false) perModel[model].successfulCalls++;
    if (typeof e.estimatedCost === "number") perModel[model].estimatedCostUsd += e.estimatedCost;
    if (typeof e.promptTokens === "number") perModel[model].promptTokens += e.promptTokens;
    if (typeof e.completionTokens === "number") perModel[model].completionTokens += e.completionTokens;
    if (typeof e.totalTokens === "number") perModel[model].totalTokens += e.totalTokens;

    const cat = categorizeLlmCallType(e.callType);
    if (!perCategory[cat]) perCategory[cat] = { calls: 0, successfulCalls: 0, estimatedCostUsd: 0 };
    perCategory[cat].calls++;
    if (e.success !== false) perCategory[cat].successfulCalls++;
    if (typeof e.estimatedCost === "number") perCategory[cat].estimatedCostUsd += e.estimatedCost;

    const d = dayKey(e.createdAt);
    if (!byDay[d]) byDay[d] = { day: d, calls: 0, successfulCalls: 0, estimatedCostUsd: 0, totalTokens: 0 };
    byDay[d].calls++;
    if (e.success !== false) byDay[d].successfulCalls++;
    if (typeof e.estimatedCost === "number") byDay[d].estimatedCostUsd += e.estimatedCost;
    if (typeof e.totalTokens === "number") byDay[d].totalTokens += e.totalTokens;
  }

  for (const v of Object.values(perModel)) v.estimatedCostUsd = Math.round(v.estimatedCostUsd * 1e6) / 1e6;
  for (const v of Object.values(perCategory)) v.estimatedCostUsd = Math.round(v.estimatedCostUsd * 1e6) / 1e6;
  const byDayArr = Object.values(byDay)
    .map((d) => ({ ...d, estimatedCostUsd: Math.round(d.estimatedCostUsd * 1e6) / 1e6 }))
    .sort((a, b) => b.day.localeCompare(a.day));

  return {
    periodDays: days,
    totalCalls,
    successfulCalls,
    failedCalls: totalCalls - successfulCalls,
    totalCostUsd,
    totalTokens,
    perModel,
    perCategory,
    byDay: byDayArr,
    priceTableUsd: llmPriceTable()
  };
}

// Crawl-Statistik über `days` Tage. Liest Main-Store (crawlRuns, rawItems).
async function getAdminStatsCrawl({ days = 30, referenceIso = null } = {}) {
  const store = await readStore("main");
  const refMs = referenceIso ? new Date(referenceIso).getTime() : Date.now();
  const cutoffMs = refMs - days * 24 * 60 * 60 * 1000;

  const allRuns = store.crawlRuns || [];
  const allRawItems = store.rawItems || [];
  const recentRuns = allRuns.filter((r) => new Date(r.createdAt || 0).getTime() >= cutoffMs);
  const recentRawItems = allRawItems.filter((item) => new Date(item.retrievedAt || item.publishedAt || 0).getTime() >= cutoffMs);

  const crawlByDay = {};
  for (const run of recentRuns) {
    const d = dayKey(run.createdAt);
    if (!crawlByDay[d]) crawlByDay[d] = { day: d, runs: 0, checkedSources: 0, successfulSources: 0, failedSources: 0, newCandidateItems: 0, savedItems: 0 };
    const b = crawlByDay[d];
    b.runs++;
    b.checkedSources += run.checkedSources || 0;
    b.successfulSources += run.successfulSources || 0;
    b.failedSources += run.failedSources || 0;
    b.newCandidateItems += run.newCandidateItems || 0;
    b.savedItems += run.savedItems || 0;
  }

  const rawByDay = {};
  for (const item of recentRawItems) {
    const d = dayKey(item.retrievedAt || item.publishedAt || "");
    if (!d) continue;
    if (!rawByDay[d]) rawByDay[d] = { day: d, articles: 0 };
    rawByDay[d].articles++;
  }

  return {
    periodDays: days,
    totalCrawlRuns: recentRuns.length,
    totalCheckedSources: recentRuns.reduce((s, r) => s + (r.checkedSources || 0), 0),
    totalSuccessfulSources: recentRuns.reduce((s, r) => s + (r.successfulSources || 0), 0),
    totalFailedSources: recentRuns.reduce((s, r) => s + (r.failedSources || 0), 0),
    totalSavedArticles: recentRuns.reduce((s, r) => s + (r.savedItems || 0), 0),
    totalNewCandidateItems: recentRuns.reduce((s, r) => s + (r.newCandidateItems || 0), 0),
    recentRawItemCount: recentRawItems.length,
    totalRawItemCount: allRawItems.length,
    latestCrawlRun: allRuns[0] || null,
    crawlByDay: Object.values(crawlByDay).sort((a, b) => b.day.localeCompare(a.day)),
    rawByDay: Object.values(rawByDay).sort((a, b) => b.day.localeCompare(a.day))
  };
}

// Kombinierte Übersicht für tägliche/wöchentliche Stats. Inklusive V3-Daten (falls aktiv).
async function getAdminStatsOverview({ days = 1, referenceIso = null } = {}) {
  const [crawl, costs] = await Promise.all([
    getAdminStatsCrawl({ days, referenceIso }),
    getAdminStatsCosts({ days, referenceIso })
  ]);

  let v3 = null;
  if (v3StoreReady()) {
    try {
      const refMs = referenceIso ? new Date(referenceIso).getTime() : Date.now();
      const cutoffIso = new Date(refMs - days * 24 * 60 * 60 * 1000).toISOString();
      const [rawDocs, kos] = await Promise.all([
        supabaseRequest(`/rest/v1/raw_documents?select=id,created_at&created_at=gte.${cutoffIso}&limit=1000`).catch(() => []),
        supabaseRequest(`/rest/v1/knowledge_objects?select=id,status,understanding_status,created_at&created_at=gte.${cutoffIso}&limit=500`).catch(() => [])
      ]);
      const rawDocsArr = Array.isArray(rawDocs) ? rawDocs : [];
      const kosArr = Array.isArray(kos) ? kos : [];
      v3 = {
        newRawDocuments: rawDocsArr.length,
        newKnowledgeObjects: kosArr.length,
        kosByStatus: kosArr.reduce((acc, ko) => { acc[ko.status || "unknown"] = (acc[ko.status || "unknown"] || 0) + 1; return acc; }, {}),
        kosByUnderstandingStatus: kosArr.reduce((acc, ko) => { acc[ko.understanding_status || "unknown"] = (acc[ko.understanding_status || "unknown"] || 0) + 1; return acc; }, {})
      };
    } catch (error) {
      v3 = { error: error.message };
    }
  }

  return {
    period: days === 1 ? "daily" : days <= 7 ? "weekly" : "monthly",
    periodDays: days,
    generatedAt: new Date().toISOString(),
    crawl: {
      runs: crawl.totalCrawlRuns,
      checkedSources: crawl.totalCheckedSources,
      successfulSources: crawl.totalSuccessfulSources,
      failedSources: crawl.totalFailedSources,
      savedArticles: crawl.totalSavedArticles,
      newCandidateItems: crawl.totalNewCandidateItems,
      recentRawItems: crawl.recentRawItemCount,
      totalRawItemsInStore: crawl.totalRawItemCount,
      latestCrawlAt: crawl.latestCrawlRun?.createdAt || null
    },
    ai: {
      totalCalls: costs.totalCalls,
      successfulCalls: costs.successfulCalls,
      failedCalls: costs.failedCalls,
      totalCostUsd: costs.totalCostUsd,
      totalTokens: costs.totalTokens,
      perCategory: costs.perCategory,
      perModel: costs.perModel
    },
    v3: v3 || { note: "V3-Store nicht aktiv (HELMUT_V3_STORE nicht gesetzt)" }
  };
}

// Detaillierter Bericht für den letzten Crawl-Lauf.
// Kombiniert Store-Daten (Crawl-Metriken, Fehler) mit V3-Supabase-Abfragen
// (neue raw_documents, knowledge_objects). Kein KI-Call.
async function getAdminStatsCrawlReport() {
  const store = await readStore("main");
  const allRuns = store.crawlRuns || [];
  const latestRun = allRuns[0] || null;

  if (!latestRun) {
    return {
      generatedAt: new Date().toISOString(),
      lastCrawlAt: null,
      noData: true
    };
  }

  const scannedArticles = latestRun.newCandidateItems || 0;
  const deduplicatedArticles = latestRun.savedItems || 0;
  const errorCount = Array.isArray(latestRun.errors) ? latestRun.errors.length : 0;
  const errors = Array.isArray(latestRun.errors) ? latestRun.errors : [];

  let newRawDocuments = null;
  let newKnowledgeObjects = null;
  let newVorgaenge = null;
  let v3Note = null;

  if (v3StoreReady()) {
    try {
      const cutoffIso = latestRun.createdAt;
      const [rawDocs, kos] = await Promise.all([
        supabaseRequest(`/rest/v1/raw_documents?select=id,created_at&created_at=gte.${encodeURIComponent(cutoffIso)}&limit=2000`).catch(() => []),
        supabaseRequest(`/rest/v1/knowledge_objects?select=id,vorgang_id,created_at&created_at=gte.${encodeURIComponent(cutoffIso)}&limit=1000`).catch(() => [])
      ]);
      const rawDocsArr = Array.isArray(rawDocs) ? rawDocs : [];
      const kosArr = Array.isArray(kos) ? kos : [];
      newRawDocuments = rawDocsArr.length;
      newKnowledgeObjects = kosArr.length;
      const vorgangIds = new Set(kosArr.map((ko) => ko.vorgang_id).filter(Boolean));
      newVorgaenge = vorgangIds.size;
    } catch (error) {
      v3Note = error.message;
    }
  } else {
    v3Note = v3SkipReason();
  }

  return {
    generatedAt: new Date().toISOString(),
    lastCrawlAt: latestRun.createdAt,
    mode: latestRun.mode || "full",
    scannedArticles,
    deduplicatedArticles,
    checkedSources: latestRun.checkedSources || 0,
    successfulSources: latestRun.successfulSources || 0,
    failedSources: latestRun.failedSources || 0,
    newVorgaenge,
    newKnowledgeObjects,
    newRawDocuments,
    durationSec: null,
    errorCount,
    errors,
    ...(v3Note ? { v3Note } : {})
  };
}

// KI-Kosten aggregiert pro Nutzer (userId oder politicianId) über `days` Tage.
async function getAdminCostsPerUser({ days = 30 } = {}) {
  const store = await readAuthStore();
  const allUsage = Array.isArray(store.llmUsage) ? store.llmUsage : [];
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const relevant = allUsage.filter((e) => {
    const ms = new Date(e.createdAt || 0).getTime();
    return ms >= cutoffMs && !String(e.callType || "").startsWith("skipped");
  });

  const byUser = {};
  let totalCostUsd = 0;
  for (const e of relevant) {
    const uid = e.userId || e.politicianId || "unbekannt";
    if (!byUser[uid]) byUser[uid] = { userId: uid, totalCostUsd: 0, calls: 0 };
    const c = typeof e.estimatedCost === "number" ? e.estimatedCost : 0;
    byUser[uid].totalCostUsd += c;
    byUser[uid].calls++;
    totalCostUsd += c;
  }

  return {
    periodDays: days,
    totalCostUsd: Math.round(totalCostUsd * 1e6) / 1e6,
    perUser: Object.values(byUser)
      .map((u) => ({ ...u, totalCostUsd: Math.round(u.totalCostUsd * 1e6) / 1e6 }))
      .sort((a, b) => b.totalCostUsd - a.totalCostUsd)
  };
}

module.exports = {
  // P0-2-Folgearbeit ("Sprint 3"): Tenant-JWT-Modus — exportiert fuer Tests
  // (scripts/tenant-jwt-test.js) und Dokumentationszwecke. Default-inert
  // (siehe tenantJwtModeEnabled), kein Verhalten geaendert ohne explizite
  // ENV-Konfiguration (HELMUT_TENANT_JWT_MODE + SUPABASE_JWT_SECRET +
  // SUPABASE_ANON_KEY).
  tenantJwtModeEnabled,
  signTenantJWT,
  verifyTenantJWT,
  diagnoseTenantJwt,
  tenantRequest,
  supabaseAuthenticatedRequest,
  deleteProfileData,
  exportProfileData,
  exportProfileDataV3,
  deleteProfileDataV3,
  deleteTenantScopedData,
  getStorageStatus,
  getStoreSummary,
  listSourceArchitectureRows,
  persistRawDocumentsDeduped,
  recordGateShadowEvents,
  saveSourceModeShadowRun,
  getSourceModeShadowLastRun,
  readStore,
  writeStore,
  readAuthStore,
  writeAuthStore,
  acquirePipelineLock,
  releasePipelineLock,
  // OP-25: Fairnesszustand der Mehrmandanten-Crons (eigene helmut_store-Zeile)
  readCronFairnessState,
  saveCronFairnessState,
  deleteCronFairnessTenant,
  // P0-4: atomarer Lock-Pfad (freigabepflichtig, Default aus) — fuer Tests exportiert
  acquirePipelineLockAtomic,
  atomicLockEnabled,
  acquireGlobalUnderstandingLock,
  releaseGlobalUnderstandingLock,
  understandingLockEnabled,
  saveAdminRecoveryLastRun,
  getAdminRecoveryLastRun,
  v3StoreEnabled,
  v3MatchingEnabled,
  v3LazyUnderstandingEnabled,
  saveRawDocument,
  saveKnowledgeObject,
  V3_KNOWLEDGE_OBJECT_COLUMNS,
  getKnowledgeObjectById,
  getKnowledgeObjectByVorgang,
  listKnowledgeObjectsByVorgangPrefix,
  listKoDocuments,
  listKoDocumentLinks,
  listKnowledgeObjectStates,
  listKnowledgeObjects,
  listKnowledgeObjectsByIds,
  listKnowledgeObjectsSeitenweise,
  assertTenant,
  assertTenantRows,
  TenantContextError,
  saveProfileEmbedding,
  getProfileEmbedding,
  matchKnowledgeObjectsByEmbedding,
  saveMatchingResults,
  listMatchingResults,
  // Sprint 23B-1: Auditpersistenz (Roadmap-Punkt 23), Default AUS
  matchingAuditEnabled,
  matchingRelevanzGateEnabled,
  getCompletedMatchingRun,
  saveMatchingRun,
  updateMatchingRun,
  publishMatchingRun,
  saveDecisions,
  listDecisions,
  savePendingKnowledgeObject,
  listPendingKnowledgeObjects,
  // P1-4: begrenzte Recovery fehlgeschlagener Wissensobjekte (bounded Auto-Retry)
  listFailedKnowledgeObjects,
  resetUnderstandingToPending,
  markUnderstandingTerminal,
  markPendingUnderstandingTerminal,
  getUnderstandingRetries,
  saveUnderstandingRetries,
  // P29-3: Vormerkungen gescheiterter/vertagter KO-Aktualisierungen
  getUpdateRetries,
  saveUpdateRetries,
  listRecentRawDocuments,
  listRawDocuments,
  markUnderstandingFailed,
  bulkResetUnderstandingFailed,
  saveKnowledgeObjectEnrichment,
  saveRenderedBriefingV3,
  getRenderedBriefingV3,
  saveKoDocumentLinks,
  getSourcesForVorgang,
  v3StoreReady,
  saveOfficeOutput,
  getOfficeOutput,
  listOfficeOutputsByUser,
  canSpendOfficeOutput,
  officeOutputId,
  recordLlmUsage,
  buildLlmUsageRecord,
  getLlmUsage,
  getLlmUsageToday,
  getLlmUsageBreakdownToday,
  getRunCostReport,
  llmPriceProvenance,
  llmDailyCallLimit,
  llmUnderstandingReserve,
  canSpendLlm,
  canSpendLlmForTenant,
  reserveLlmCall,
  reserveTenantScope,
  tenantDailyCallLimit,
  tenantLlmCapEnabled,
  isSharedGlobalCallType,
  __resetLlmReservationForTests,
  getLlmCostSince,
  llmBudgetFailResult,
  estimateLlmCost,
  saveRawItems,
  getRawItemsSince,
  getSources,
  updateSourceLastCrawled,
  saveBriefing,
  getLatestBriefing,
  getTopicMemory,
  updateTopicMemoryFromBriefing,
  saveCrawlRun,
  getLatestCrawlRun,
  listCrawlRuns,
  // P0-2: pure Verdichtungs-Helfer fuer den Roundtrip-Test (compact-store-roundtrip-test.js)
  compactStore,
  compactCrawlRunForStore,
  // P0-1: Prozess-Laufzeit-Telemetrie (Understanding/Briefing/Lage), Auth-Store, scalar-only
  // W-2 (Werkzeug-Haertung): parallel-sicher (relational, gated), idempotent, Fehler sichtbar
  recordProcessRun,
  recordProcessRunStart,
  upsertProcessRunRelational,
  listProcessRunsRelational,
  istVorgangsbildungsLauf,
  aggregateVorgangsbildung,
  getVorgangsbildungKennzahlen,
  listProcessRuns,
  sanitizeProcessRun,
  // W-1 (Werkzeug-Haertung): typisierter Lesefehler statt stillem []
  StorageReadError,
  klassifiziereLesefehler,
  // P0-1: Pro-Quellenabruf-Telemetrie (relationale Tabelle, freigabepflichtig/default aus)
  insertSourceCrawlTelemetry,
  listSourceCrawlTelemetry,
  // P0-3: zentraler, datenschutzsicherer Pipeline-Fehler-Sammler (systemErrors, dedup)
  recordPipelineError,
  // P0-5 Stufe 1: Blob-Timeout-Robustheit (Retry+Backoff) — fuer Tests exportiert
  withStoreRetry,
  isRetryableStoreError,
  // P0-5 Stufe 2 (Vorbereitung): gated Dual-Write Crawl-Läufe relational
  insertCrawlRunRelational,
  saveLageCheck,
  getLatestLageCheck,
  getLageChecks,
  savePipelineDebugReport,
  getLatestPipelineDebugReport,
  getLatestCompleteKnowledgeObjectAt,
  saveWatchdogState,
  getLatestWatchdogState,
  saveMonitoringDeliveryState,
  getMonitoringDeliveryState,
  saveTask,
  getTasks,
  updateTaskStatus,
  saveInteraction,
  getInteractions,
  getProfile,
  listProfiles,
  listFullProfiles,
  saveProfile,
  purgeBlobProfiles,
  // Mehrmandantenfaehigkeit Phase 3 (profiles/mandate_profiles SQL-Pfad) --
  // exportiert fuer Tests (scripts/profile-db-test.js) und Admin-Diagnose.
  profileDbModeEnabled,
  profileDbExclusiveEnabled,
  getProfileTelemetry,
  getProfileFromDb,
  saveProfileToDb,
  listFullProfilesFromDb,
  toMandateProfileRow,
  fromMandateProfileRow,
  saveFeedback,
  listFeedback,
  setFeedbackDone,
  savePersonalizedRecommendations,
  savePoliticalItems,
  savePriorityChanges,
  getUserNotes,
  saveUserNote,
  savePushSubscription,
  removePushSubscription,
  getPushSubscriptions,
  savePushEvent,
  getPushEventByDedupeKey,
  listPushEvents,
  getAdminStatsCosts,
  getAdminStatsCrawl,
  getAdminStatsOverview,
  getAdminStatsCrawlReport,
  getAdminCostsPerUser,
  getKnowledgeObjectCount,
  getClassificationCoverage,
  // Datenschutz: Aufbewahrung/Löschung (freigabepflichtig, Trockenlauf-Default)
  loadRetentionMetadata,
  deleteRetention,
  getAdminPeriodStats
};

// Kosten + V3-Counts (Artikel, KOs, Briefings) für einen bestimmten Zeitraum.
// Wird für "Heute" (days=1) und "30 Tage" (days=30) parallel aufgerufen;
// der Cache sorgt dafür, dass Store-Reads nicht doppelt stattfinden.
async function getAdminPeriodStats(days = 30) {
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const cutoffIso = new Date(cutoffMs).toISOString();

  const [perUserData, aiData] = await Promise.all([
    getAdminCostsPerUser({ days }),
    getAdminStatsCosts({ days })
  ]);

  let articles = null;
  let kos = null;
  if (v3StoreReady()) {
    try {
      const [rawDocsRes, kosRes] = await Promise.all([
        supabaseRequest(`/rest/v1/raw_documents?select=count&created_at=gte.${encodeURIComponent(cutoffIso)}`).catch(() => null),
        supabaseRequest(`/rest/v1/knowledge_objects?select=count&created_at=gte.${encodeURIComponent(cutoffIso)}`).catch(() => null)
      ]);
      articles = Array.isArray(rawDocsRes) && rawDocsRes[0] ? Number(rawDocsRes[0].count) : null;
      kos = Array.isArray(kosRes) && kosRes[0] ? Number(kosRes[0].count) : null;
    } catch {}
  }

  const store = await readStore("main");
  const briefings = (store.briefings || []).filter((b) => {
    return new Date(b.generatedAt || b.date || 0).getTime() >= cutoffMs;
  }).length;

  return {
    periodDays: days,
    totalCostUsd: perUserData.totalCostUsd,
    totalCalls: aiData.totalCalls,
    perUser: perUserData.perUser,
    perCategory: aiData.perCategory,
    articles,
    kos,
    briefings
  };
}

// P1-6: Klassifikationsabdeckung (Anteil KOs MIT politischer Ebene + Feature-Vektor).
// Grundlage der Health-Report-Achse. Fail-safe: null, wenn der relationale Store
// nicht bereit ist. Nur Zähler — keine Inhalte.
async function getClassificationCoverage() {
  if (!v3StoreReady()) return null;
  try {
    const countOf = async (query) => {
      const rows = await supabaseRequest(query).catch(() => null);
      return Array.isArray(rows) && rows[0] ? Number(rows[0].count) || 0 : null;
    };
    const [total, withLevel, withEstablishedLevel, withEmbedding, withAffectedGeography] = await Promise.all([
      countOf("/rest/v1/knowledge_objects?select=count"),
      countOf("/rest/v1/knowledge_objects?select=count&decision_level=not.is.null"),
      // SPRINT 19 — KEIN FALSCHES GRUEN: `decision_level` ist seit Sprint 2 NIE null,
      // weil der Deriver im Zweifel ehrlich 'unknown' schreibt. Die alte Zaehlung
      // "not.is.null" meldete deshalb strukturell ~100 % Abdeckung, obwohl die Ebene
      // gar nicht ermittelt war. Massgeblich ist die ERMITTELTE Ebene.
      countOf("/rest/v1/knowledge_objects?select=count&decision_level=not.is.null&decision_level=neq.unknown"),
      countOf("/rest/v1/knowledge_objects?select=count&embedding=not.is.null"),
      // SPRINT 20 — dieselbe Ehrlichkeitsregel fuer die Geografie. `affected_geographies`
      // ist ein jsonb-Array mit Default '[]' und damit NIE null; "not.is.null" waere
      // wieder strukturelles Gruen. Gezaehlt wird die NICHT-LEERE Zuordnung, und zwar
      // ueber die Array-Laenge — ein Geografie-OBJEKT ist kein Textwert und darf auch
      // nicht wie einer geprueft werden.
      countOf("/rest/v1/knowledge_objects?select=count&affected_geographies=neq.%5B%5D")
    ]);
    if (total == null) return null;
    const ratio = (n) => (total > 0 && n != null ? Math.round((n / total) * 1000) / 1000 : null);
    return {
      total,
      withLevel, withEstablishedLevel, withEmbedding, withAffectedGeography,
      levelCoverage: ratio(withLevel),
      establishedLevelCoverage: ratio(withEstablishedLevel),
      embeddingCoverage: ratio(withEmbedding),
      affectedGeographyCoverage: ratio(withAffectedGeography),
      missingLevel: withLevel != null ? Math.max(0, total - withLevel) : null,
      unknownLevel: withEstablishedLevel != null ? Math.max(0, total - withEstablishedLevel) : null,
      // Ehrlich benannt: "ohne betroffene Geografie" ist KEIN Fehler, sondern der
      // zulaessige Zustand "Region nicht ermittelt" (Regel 2 des Sprints).
      unknownGeography: withAffectedGeography != null ? Math.max(0, total - withAffectedGeography) : null
    };
  } catch (_) {
    return null;
  }
}

// --- Datenschutz: Aufbewahrung/Löschung (Retention) ---------------------------
// Lädt NUR minimierte Metadaten (id/created_at + Verknüpfungen) für die Retention-
// PLANUNG — KEIN Volltext. Fail-safe: null/leer, wenn der Store nicht bereit ist.
async function loadRetentionMetadata() {
  if (!v3StoreReady()) return { available: false, reason: "relational-store-not-ready" };
  try {
    const [raw, kos, links] = await Promise.all([
      supabaseRequest("/rest/v1/raw_documents?select=id,created_at&order=created_at.asc&limit=100000").catch(() => []),
      supabaseRequest("/rest/v1/knowledge_objects?select=id,created_at&order=created_at.asc&limit=100000").catch(() => []),
      supabaseRequest("/rest/v1/ko_document_links?select=knowledge_object_id,raw_document_id&limit=200000").catch(() => [])
    ]);
    return {
      available: true,
      rawDocuments: Array.isArray(raw) ? raw : [],
      knowledgeObjects: Array.isArray(kos) ? kos : [],
      koDocumentLinks: Array.isArray(links) ? links : []
    };
  } catch (error) {
    return { available: false, reason: error && error.message };
  }
}

// Führt den Retention-Löschplan aus. GATED (HELMUT_RETENTION_EXECUTE + v3StoreReady)
// UND freigabepflichtig. Die DB-FKs kaskadieren ko_document_links/ko_relations/
// document_findings der gelöschten Zeilen. Fail-safe pro Batch.
async function deleteRetention(plan = {}) {
  const { retentionExecuteEnabled } = require("./retention");
  if (!retentionExecuteEnabled()) return { skipped: true, reason: "disabled" };
  if (!v3StoreReady()) return { skipped: true, reason: "relational-store-not-ready" };
  if (plan.integrityOk === false) return { skipped: true, reason: "integrity-check-failed" };
  const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  const delIn = async (table, col, ids) => {
    let deleted = 0;
    for (const batch of chunk(ids, 100)) {
      const inList = batch.map((v) => `"${String(v).replace(/"/g, "")}"`).join(",");
      await supabaseRequest(`/rest/v1/${table}?${col}=in.(${inList})`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      deleted += batch.length;
    }
    return deleted;
  };
  const koDeleted = Array.isArray(plan.koToDelete) && plan.koToDelete.length ? await delIn("knowledge_objects", "id", plan.koToDelete) : 0;
  const rawDeleted = Array.isArray(plan.rawToDelete) && plan.rawToDelete.length ? await delIn("raw_documents", "id", plan.rawToDelete) : 0;
  return { koDeleted, rawDeleted };
}

async function getKnowledgeObjectCount() {
  if (!v3StoreReady()) return null;
  try {
    const rows = await supabaseRequest("/rest/v1/knowledge_objects?select=count");
    return Array.isArray(rows) && rows[0] ? (Number(rows[0].count) || 0) : null;
  } catch {
    return null;
  }
}
