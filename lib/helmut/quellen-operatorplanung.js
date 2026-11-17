"use strict";

// Enger Zusatz zum bereits bestaetigten Tagesplan. Kein Journal-, Reset- oder
// Recoverypfad: hoechstens die neu freigegebene amtliche BMG-Quelle einreihen.
const { isDeepStrictEqual } = require("node:util");
const demand = require("./source-demand");
const mode = require("./quellenarchitektur/source-mode");
const packages = require("./quellenarchitektur/profile-packages");
const { BMG_SOURCE_ID, PARLAMENTSDATEN_QUELLEN, parlamentsdatenFeed } = require("./quellenarchitektur/seeds/parlamentsdaten-quellen");
const FEED = PARLAMENTSDATEN_QUELLEN.find(s => s.id === BMG_SOURCE_ID);
const TAG = "2026-11-17", PATH = "rp-bmg-meldungen-rss", PAKET = "pkg-arbeit-und-soziales";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const fail = reason => { throw Error("operator-planung-" + reason); };

function katalog(input, env) {
  const { rows, profile, legacySources } = input || {};
  if (!rows || ![rows.publishers, rows.retrievalPaths, rows.packages, rows.packagePaths, profile, legacySources].every(Array.isArray)) fail("katalog-fehlt");
  const paths = rows.retrievalPaths.filter(p => p && (p.id === PATH || p.legacy_source_id === BMG_SOURCE_ID || p.url === FEED.url));
  const path = paths[0];
  if (paths.length !== 1 || path.id !== PATH || path.legacy_source_id !== BMG_SOURCE_ID
    || path.publisher_id !== "publisher-bundesgesundheitsministerium.de" || path.name !== FEED.name
    || path.method !== "rss" || path.url !== FEED.url || path.query != null || path.parser !== "rss-regex"
    || path.activation_mode !== "auto" || !["needs_review", "healthy"].includes(path.status)
    || path.priority !== 80 || path.max_items !== 12 || path.is_critical !== false) fail("pfad-abweichend");
  const publisher = rows.publishers.filter(p => p.id === path.publisher_id);
  if (publisher.length !== 1 || publisher[0].canonical_domain !== "bundesgesundheitsministerium.de"
    || publisher[0].lifecycle_status !== "active" || publisher[0].publisher_type !== "ministry"
    || publisher[0].evidence_role !== "official_primary" || publisher[0].trust !== "hoch") fail("herausgeber-abweichend");
  const pk = rows.packages.filter(p => p.id === PAKET);
  if (pk.length !== 1 || pk[0].key !== "arbeit-und-soziales" || pk[0].status !== "active"
    || rows.packagePaths.filter(p => p.package_id === PAKET && p.retrieval_path_id === PATH).length !== 1) fail("paket-abweichend");
  const berechtigte = profile.filter(p => p && p.id && packages.isActivationEligible(p)
    && packages.resolveProfilePackages(p).all.includes(pk[0].key));
  const plan = mode.buildRelationalCrawlPlan({ ...rows, profiles: profile, legacySources, env });
  const aktiv = plan.aktiv.filter(p => p.id === PATH);
  if (!berechtigte.length || aktiv.length !== 1 || aktiv[0].refCount < 1) fail("bedarf-nicht-aktiv");
  const source = aktiv[0].source;
  if (!source || source.id !== BMG_SOURCE_ID || source.retrievalPathId !== PATH || source.active !== true
    || source.crawlMethod !== "rss" || source.maxItems !== 12 || parlamentsdatenFeed(source) !== FEED) fail("quelle-abweichend");
  return { source, profile: berechtigte };
}

async function ergaenze({ jetztMs, deadlineMs, deps = {} } = {}) {
  const env = deps.env || process.env, now = deps.now || Date.now;
  const zeit = now();
  if (!Number.isSafeInteger(jetztMs) || !Number.isSafeInteger(deadlineMs) || !Number.isSafeInteger(zeit)
    || new Date(jetztMs).toISOString().slice(0, 10) !== TAG || new Date(zeit).toISOString().slice(0, 10) !== TAG
    || jetztMs < Date.parse(TAG + "T09:16:00Z") || zeit < jetztMs || deadlineMs <= zeit
    || deadlineMs > jetztMs + 300000) fail("zeit-abweichend");
  if (mode.sourceMode(env) !== "on" || !require("./quellen-arbeitsfenster-aktiv").aktiv(env)) fail("modus-aus");
  const guard = (reserve = 0) => {
    const value = now();
    if (!Number.isSafeInteger(value) || value < zeit || value + reserve >= deadlineMs
      || new Date(value).toISOString().slice(0, 10) !== TAG) fail("zeitbudget");
  };
  const storage = () => require("./storage");
  const lade = deps.lade || (async () => {
    const [rows, profile] = await Promise.all([
      storage().listSourceArchitectureRows(), storage().listFullProfiles()
    ]);
    // Nur die schon gepruefte aktuelle Feeddefinition. Der Mainblob ist weder
    // Aktivierungsautoritaet noch fuer diesen einzelnen Quellenbedarf noetig.
    return { rows, profile, legacySources: [FEED] };
  });
  const request = deps.request || ((url, opts) => storage().supabaseRequest(url, opts));
  const enqueue = deps.enqueue || require("./scalable-pipeline").standardEnqueue(env);
  guard();
  const input = await lade(); guard();
  const legal = katalog(input, env);
  // Derselbe Compiler und derselbe Beginn wie beim heutigen Morgenmanifest.
  // Ein Zusatz um 09 Uhr darf keinen zweiten 08-Uhr-Abruf desselben Tages erzeugen.
  const tagesstart = Date.parse(TAG + "T00:00:00Z");
  const result = await demand.kompiliereQuellenbedarf({ ...legal, jetztMs: tagesstart, env,
    quellenFuerProfil: () => [legal.source] });
  guard();
  if (result.auftraege.length !== 1 || result.fehlerhafteProfile?.length) fail("compiler-abweichend");
  const auftrag = result.auftraege[0];
  if (auftrag.jobType !== "source_fetch" || auftrag.tenantId !== null || auftrag.priority !== 100
    || auftrag.maxAttempts !== 5 || auftrag.freshnessWindow !== TAG + "T00Z"
    || Date.parse(auftrag.dueAt) > jetztMs || parlamentsdatenFeed(auftrag.payload?.quelle) !== FEED) fail("auftrag-abweichend");
  const quelle = `or(payload->quelle->>id.eq.${BMG_SOURCE_ID},payload->quelle->>retrievalPathId.eq.${PATH},payload->quelle->>url.eq.${FEED.url},payload->quelle->>rssUrl.eq.${FEED.url})`;
  // Auch eine inkonsistente Altzeile mit genau diesem eindeutigen Key muss
  // VOR dem RPC auffallen: dessen Konfliktpfad darf last_seen_window erhoehen.
  const filter = `or=(idempotency_key.eq.${auftrag.idempotencyKey},and(job_type.eq.source_fetch,freshness_window.like.${TAG}*,${quelle}))`;
  const url = `/rest/v1/helmut_jobs?select=id,job_type,idempotency_key,freshness_window,tenant_id,status,priority,max_attempts,first_due_at,due_at,payload&tenant_id=is.null&${encodeURI(filter)}&limit=2`;
  const lesen = async () => {
    guard();
    const rows = await request(url, { timeoutMs: Math.min(2000, deadlineMs - now()) });
    guard();
    if (!Array.isArray(rows) || rows.length > 1) fail("bestand-unklar");
    if (!rows.length) return null;
    const row = rows[0];
    if (!UUID.test(row.id || "") || row.job_type !== auftrag.jobType || row.idempotency_key !== auftrag.idempotencyKey
      || row.freshness_window !== auftrag.freshnessWindow || row.tenant_id !== null
      || row.priority !== auftrag.priority || row.max_attempts !== auftrag.maxAttempts
      || !["wartend", "laeuft", "erledigt", "fehlgeschlagen"].includes(row.status)
      || Date.parse(row.first_due_at) !== Date.parse(auftrag.dueAt)
      || !Number.isFinite(Date.parse(row.due_at)) || Date.parse(row.due_at) < Date.parse(row.first_due_at)
      || !isDeepStrictEqual(row.payload?.quelle, auftrag.payload.quelle) || row.payload.art !== "geteilt") fail("bestand-abweichend");
    return row;
  };
  // Der eindeutige technische Key darf auch nicht einer fremden Mandatszeile
  // gehoeren. Nur Existenz lesen, niemals deren Payload oder Profil laden.
  guard();
  const fremd = await request(`/rest/v1/helmut_jobs?select=id&tenant_id=not.is.null&idempotency_key=eq.${encodeURIComponent(auftrag.idempotencyKey)}&limit=1`,
    { timeoutMs: Math.min(2000, deadlineMs - now()) });
  guard();
  if (!Array.isArray(fremd) || fremd.length) fail("key-nicht-global");
  const vorher = await lesen();
  if (vorher) return { ok: true, neu: 0, auftragId: vorher.id };
  // Das vorhandene Enqueue ist selbst zeitbegrenzt (maximal20s). Nicht per
  // Promise.race verlassen: ein UNKNOWN darf keinen Hintergrundretry erzeugen.
  const configured = Number(env.HELMUT_SUPABASE_TIMEOUT_MS);
  const rpcTimeout = Number.isFinite(configured) && configured > 0 ? Math.min(configured, 20000) : 10000;
  guard(rpcTimeout + 2500);
  let receipt;
  try { receipt = await enqueue(auftrag); } catch (_) { fail("einreihung-unknown"); }
  guard();
  if (receipt?.verfuegbar !== true || typeof receipt.neu !== "boolean" || !UUID.test(receipt.id || "")) fail("einreihung-unknown");
  const nachher = await lesen();
  if (!nachher || nachher.id !== receipt.id) fail("readback-fehlt");
  return { ok: true, neu: receipt.neu ? 1 : 0, auftragId: nachher.id };
}

module.exports = { ergaenze };
