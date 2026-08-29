const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { getSources } = require("./storage");
// Schritt C (VORBEREITET, default AUS): PARDOK-Dispatch fuer amtliche Open-Data-XML (BE/BB).
// Feature-Guard HELMUT_PARDOK_DISPATCH. Liefert konstruktionsbedingt 0 Items in die Pipeline
// (shadow-only) — kein Berlin/Brandenburg-Inhalt erreicht Lage/Radar/Helmut/Buero. Siehe
// lib/helmut/quellenarchitektur/pardok-dispatch.js.
const { pardokDispatch } = require("./quellenarchitektur/pardok-dispatch");
// Google-News-Härtung (Sprint 2026-07): Provider-Trennung, Gate (begrenzte
// Parallelität + Mindestabstand), Retry mit Backoff/Retry-After, Circuit Breaker,
// Cooldown. Ohne übergebenes Gate (Kill-Switch/Alt-Aufrufer) bleibt das Verhalten
// byte-identisch zum bisherigen Pfad.
const {
  CIRCUIT_OPEN_MESSAGE,
  isGoogleNewsSource,
  parseRetryAfterMs,
  withGoogleRetry
} = require("./google-news-hardening");
const {
  isStrictGoogleNewsUrl,
  assertSafeGoogleNewsTransportUrl,
  assertSafeProviderTransportUrl
} = require("./provider-url");
// Übersprungene Wege (bewusst NICHT abgerufen) zählen weder als Erfolg noch als
// Fehler. 'skipped-cooldown' = Abstands-/Degradations-Schutz; 'skipped-shared' =
// identischer Abrufweg wurde in diesem Cron-Durchlauf bereits für ein anderes
// Mandat abgerufen (Incident 2026-07-25, siehe google-news-hardening.js).
const SKIPPED_STATUSES = new Set(["skipped-cooldown", "skipped-shared"]);
function isSkippedResult(result) {
  return Boolean(result) && SKIPPED_STATUSES.has(result.status);
}
function isAnbieterVertagung(error) {
  return Boolean(error && error.anbieterVertagung);
}
const fetchTimeoutMs = Number(process.env.CRAWLER_TIMEOUT_MS || 7000);
const crawlConcurrency = Number(process.env.CRAWLER_CONCURRENCY || 20);
const maxCrawlCandidates = Number(process.env.HELMUT_CRAWL_MAX_CANDIDATES || 1000);
const defaultGoogleNewsMaxItems = Number(process.env.HELMUT_GOOGLE_NEWS_MAX_ITEMS || 12);
const defaultRssMaxItems = Number(process.env.HELMUT_DIRECT_RSS_MAX_ITEMS || 16);
// SICHERHEIT: harte Obergrenze fuer akkumulierte Antwort-Bodies gecrawlter Seiten. Ohne
// sie koennte eine boesartige/kompromittierte Quelle (der Crawler folgt aufgeloesten
// Google-News-Links auf beliebige, nicht kontrollierte Publisher-Hosts) den Speicher
// durch eine sehr grosse oder langsam getroffelte Antwort innerhalb des Timeout-Fensters
// unbegrenzt wachsen lassen (Resource-Exhaustion-DoS). Der bisherige Timeout deckt nur
// Inaktivitaet ab, keine Gesamtgroesse.
const maxCrawlResponseBytes = Number(process.env.HELMUT_CRAWL_MAX_RESPONSE_BYTES || 10 * 1024 * 1024);

// Interne Diagnose der Google-News-URL-Auflösung (nur Console/Vercel-Logs,
// bewusst NICHT im Nutzer-UI). Pro Crawl zurückgesetzt.
const resolutionStats = { attempted: 0, resolved: 0, unresolved: 0 };

async function crawlAllSources(sources = null, opts = {}) {
  if (!sources) sources = await getSources();
  resolutionStats.attempted = 0;
  resolutionStats.resolved = 0;
  resolutionStats.unresolved = 0;
  const activeSources = sources.filter((source) => source.active);
  const gate = opts.googleGate || null;
  const cooldown = opts.cooldown && opts.cooldown.active ? opts.cooldown : null;
  // Gedächtnis geteilter Abrufwege über Mandate hinweg (null = aus/Alt-Pfad).
  const sharedLedger = opts.sharedLedger || null;
  // Reine Abhaengigkeiten fuer den Transport (Uhr/Env/DB- und Testadapter).
  // Production reicht nichts ein. Offline-End-to-End-Tests koennen hier die
  // echte Kette bis unmittelbar vor den Socket laufen lassen, ohne Netz.
  const requestDeps = opts.requestDeps || {};

  // Ein Quellenabruf inkl. Zeitmessung + Retry-Zähler (technische Metadaten).
  const crawlOne = async (source, sourceDeps = {}) => {
    const startedAtMs = Date.now();
    let retryCount = 0;
    const deps = { ...sourceDeps, onRetry: () => { retryCount += 1; } };
    try {
      const items = await crawlSource(source, deps);
      const finishedAtMs = Date.now();
      return {
        sourceId: source.id, sourceName: source.name, ok: true, itemCount: items.length, items,
        startedAt: new Date(startedAtMs).toISOString(), finishedAt: new Date(finishedAtMs).toISOString(),
        durationMs: finishedAtMs - startedAtMs, retryCount, status: items.length ? "ok" : "empty"
      };
    } catch (error) {
      const finishedAtMs = Date.now();
      console.error(`Crawl failed for ${source.name}`, error);
      return {
        sourceId: source.id, sourceName: source.name, ok: false, itemCount: 0, items: [], error: error.message,
        ...(error && error.anbieterVertagung ? { anbieterVertagung: error.anbieterVertagung } : {}),
        startedAt: new Date(startedAtMs).toISOString(), finishedAt: new Date(finishedAtMs).toISOString(),
        durationMs: finishedAtMs - startedAtMs, retryCount, status: "error"
      };
    }
  };

  let results;
  if (!gate) {
    // Alt-Pfad (Kill-Switch HELMUT_GOOGLE_HARDENING=off oder Aufrufer ohne Gate):
    // ein gemeinsamer Pool, unverändertes Verhalten.
    results = await mapWithConcurrency(activeSources, crawlConcurrency, (source) => crawlOne(source, requestDeps));
  } else {
    // PROVIDER-TRENNUNG: direkte RSS-/HTML-/amtliche Quellen laufen im bisherigen
    // Pool und werden von Google-Problemen NIE gebremst oder blockiert. Google-
    // News-Quellen laufen ausschließlich durch das Gate (begrenzte Parallelität,
    // Mindestabstand, Circuit Breaker) — der GESAMTE Quellenabruf inkl. URL-
    // Auflösung hält den Gate-Slot, damit auch die Auflösungs-Requests unter der
    // Google-Parallelitätsgrenze bleiben.
    results = new Array(activeSources.length);
    const googleIdx = [];
    const directIdx = [];
    activeSources.forEach((source, index) => {
      (isGoogleNewsSource(source) ? googleIdx : directIdx).push(index);
    });
    const directWork = mapWithConcurrency(directIdx, crawlConcurrency, async (index) => {
      results[index] = await crawlOne(activeSources[index], requestDeps);
    });
    const googleWork = Promise.all(googleIdx.map(async (index) => {
      const source = activeSources[index];
      // ROOT-CAUSE-SCHUTZ (Incident 2026-07-25): identischer Google-Abrufweg wurde
      // in diesem Prozess/Cron-Durchlauf schon für ein anderes Mandat abgerufen.
      // Erneutes Abrufen liefert dieselben Dokumente in denselben GLOBALEN Korpus,
      // provoziert aber die Drosselung pro Egress-IP. Also überspringen — weder
      // Erfolg noch Fehler. Mandantseigene Wege haben eigene URLs und laufen weiter.
      // Reihenfolge: der bestehende Cooldown-Grund behält Vorrang (unveränderte
      // Telemetrie-Semantik), danach greift das Gedächtnis geteilter Wege.
      if (cooldown && cooldown.skipGoogle) {
        // Schutz vor eng aufeinanderfolgenden Vollcrawls: Google-Anteil dieses
        // Laufs bewusst überspringen (kein Fehler — der vorige Lauf ist frisch).
        const at = new Date().toISOString();
        results[index] = {
          sourceId: source.id, sourceName: source.name, ok: true, itemCount: 0, items: [],
          startedAt: at, finishedAt: at, durationMs: 0, retryCount: 0, status: "skipped-cooldown"
        };
        return;
      }
      if (sharedLedger && sharedLedger.seenRecently(source)) {
        const at = new Date().toISOString();
        results[index] = {
          sourceId: source.id, sourceName: source.name, ok: true, itemCount: 0, items: [],
          startedAt: at, finishedAt: at, durationMs: 0, retryCount: 0, status: "skipped-shared"
        };
        return;
      }
      try {
        results[index] = await gate.schedule(async () => {
          const result = await crawlOne(source, {
            ...requestDeps, gate, cooldown, hardening: opts.hardeningConfig || null
          });
          // Nur ein belegter ERFOLG darf einen Folgeabruf ueberspringen. Ein
          // vorab gesetzter Ledger-Eintrag verwandelte einen fehlgeschlagenen
          // Erstabruf beim Retry in `skipped-shared/ok` und verlor Arbeit.
          // Parallel gestartete identische Wege duerfen hier im Zweifel beide
          // laufen: ein zusaetzlicher begrenzter Abruf ist ehrlicher als ein
          // falscher Erfolg. Die globale Queue-Deduplizierung bleibt separat.
          if (result.ok && sharedLedger) sharedLedger.note(source);
          // Breaker-Fütterung: ERFOLGE auf Quellen-Ebene melden; Fehlversuche
          // meldet withGoogleRetry bereits je VERSUCH (schnellere Öffnung im
          // Sturm, keine Doppelzählung von Erfolgen).
          if (result.ok) gate.report(null);
          return result;
        });
      } catch (error) {
        // Breaker offen: restliche Google-Quellen enden SOFORT klassifizierbar
        // (fail-fast statt weiterer 7-s-Timeouts gegen einen drosselnden Dienst).
        const at = new Date().toISOString();
        // EHRLICHE KLASSIFIKATION (Incident 2026-07-25): der Breaker ist EIN
        // zentrales Provider-Ereignis, kein Defekt dieser Quelle — der Abruf fand
        // nie statt (0 ms, kein Request). Eigener Status, damit ein zentraler
        // Abbruch nicht als N individuelle Quellenfehler gemeldet wird.
        results[index] = {
          sourceId: source.id, sourceName: source.name, ok: false, itemCount: 0, items: [],
          error: error && error.message ? error.message : CIRCUIT_OPEN_MESSAGE,
          startedAt: at, finishedAt: at, durationMs: 0, retryCount: 0, status: "circuit-open"
        };
      }
    }));
    await Promise.all([directWork, googleWork]);
  }

  // P0-1: pro-Quelle Dedup-/Cap-Verluste EXAKT ueber item.sourceId zuordnen (keine
  // Schaetzung). foundItems -> nach in-Lauf-Dedup -> nach Kandidaten-Cap.
  const allItems = results.flatMap((result) => result.items);
  const dedupedItems = deduplicateRawItems(allItems);
  const rawItems = limitRawCandidates(dedupedItems, maxCrawlCandidates);
  const countBySource = (items) => {
    const map = new Map();
    for (const it of items) { const sid = it && it.sourceId; if (sid == null) continue; map.set(sid, (map.get(sid) || 0) + 1); }
    return map;
  };
  const foundBy = countBySource(allItems);
  const dedupBy = countBySource(dedupedItems);
  const capBy = countBySource(rawItems);
  for (const result of results) {
    const f = foundBy.get(result.sourceId) || 0;
    const d = dedupBy.get(result.sourceId) || 0;
    const c = capBy.get(result.sourceId) || 0;
    result.duplicateItems = Math.max(0, f - d); // in-Lauf-Dubletten verworfen
    result.ignoredItems = Math.max(0, d - c);   // vom Kandidaten-Cap verworfen
  }
  console.log(`[crawler] Google-News URL-Auflösung: ${resolutionStats.resolved}/${resolutionStats.attempted} aufgelöst, ${resolutionStats.unresolved} ungelöst`);
  return {
    checkedSources: activeSources.length,
    googleUrlResolution: { ...resolutionStats },
    // Übersprungene Quellen (Cooldown/geteilter Weg) zählen weder als Erfolg noch
    // als Fehler — sonst wirkte ein bewusst reduzierter Lauf "gesünder" als er ist.
    successfulSources: results.filter((result) => result.ok && !isSkippedResult(result)).length,
    // Vom Circuit Breaker beendete Wege sind KEINE individuellen Quellenfehler:
    // sie wurden nie abgerufen (EIN zentrales Provider-Ereignis). Sie werden
    // separat gezählt, damit "141 Fehler" nicht mehr entsteht, wo genau ein
    // zentraler Abbruch vorliegt (Incident 2026-07-25).
    failedSources: results.filter((result) => !result.ok && result.status !== "circuit-open").length,
    circuitOpenSources: results.filter((result) => result.status === "circuit-open").length,
    skippedSources: results.filter((result) => isSkippedResult(result)).length,
    sharedSkippedSources: results.filter((result) => result.status === "skipped-shared").length,
    retriesTotal: results.reduce((sum, result) => sum + (result.retryCount || 0), 0),
    googleGate: gate ? gate.state() : null,
    newCandidateItems: rawItems.length,
    rawItems,
    results
  };
}

async function crawlSource(source, deps = {}) {
  // Schritt C (VORBEREITET, Feature-Guard HELMUT_PARDOK_DISPATCH, default AUS): amtliche
  // Open-Data-XML-Quellen (BE/BB) laufen ueber den isolierten PARDOK-Dispatch. Der gibt in
  // JEDEM Modus 0 Items zurueck (off = inert; shadow = parst in isolierte Ablage, aber KEINE
  // Items in die sichtbare Pipeline). Damit ist die bestehende Crawl-Ausgabe fuer alle heutigen
  // Quellen (manual/html/rss) unveraendert und BE/BB kann diesen Weg nicht sichtbar durchlaufen.
  if (source.crawlMethod === "structured_download") {
    // PARDOK nutzt den eigenen, hart begrenzten Streaming-Abruf (64-MiB-Budget +
    // Record-Fruehabbruch) statt des 10-MiB-Standard-fetchText — sonst scheitert
    // jeder echte BE-/BB-Export an "Response too large" (Audit-Fix 2026-07).
    const res = await pardokDispatch(source, {
      env: deps.env,
      fetchText: deps.fetchText || (async (u) => (await fetchPardokText(u, {}, 0, deps)).body),
      maxRecords: defaultPardokMaxRecords
    });
    return res.items; // Invariante: immer []
  }
  if (source.crawlMethod === "manual") return [];
  if (source.crawlMethod === "html") {
    const page = await fetchHtmlPage(source.url, deps);
    return page && !isGenericHtmlPage(page, source) ? [normalizeRawItem(page, source)] : [];
  }

  const feedUrls = [...(source.rssUrls || []), source.rssUrl].filter(Boolean);
  let candidates = feedUrls.length ? Array.from(new Set(feedUrls)) : [source.url];
  // Cooldown 'nach-degradation': Google-Quellen fahren reduziert — nur der
  // Primär-Feed (kein Archiv-Zweitfeed), keine URL-Auflösung (unten). Direkte
  // Quellen bleiben unberührt (Provider-Trennung).
  const cooldownReduced = Boolean(deps.cooldown && deps.cooldown.active && isGoogleNewsSource(source));
  if (cooldownReduced && candidates.length > 1) candidates = candidates.slice(0, 1);
  // Auflösungs-Requests (news.google.com-Fetch + batchexecute-POST) unterbleiben,
  // sobald der Lauf im Cooldown ist oder der Circuit Breaker offen ist — die
  // Items behalten dann ihren Google-Link (linkType google_proxy) und werden
  // normal weiterverarbeitet.
  const skipResolution = cooldownReduced || Boolean(deps.gate && deps.gate.isOpen());
  const errors = [];
  const collected = [];
  // Unterscheidet echte Abruf-Fehler von legitim leeren Feeds (Review-Fix):
  // ein 0-Treffer-Feed ist KEIN Fehler und darf keinen Degradations-Alarm füttern.
  let hadFetchError = false;

  for (const feedUrl of candidates) {
    try {
      const fetchFeed = () => parseRssFeed(feedUrl, sourceMaxItems(source, feedUrl), deps);
      // Retry (nur Google-Feeds, nur unter dem Gate): 429/5xx/Verbindungsfehler
      // werden begrenzt wiederholt (Backoff + Jitter, Retry-After beachtet,
      // Lauf-Retry-Budget des Gates). Jeder fehlgeschlagene VERSUCH speist den
      // Circuit Breaker sofort (nicht erst das Quellen-Endergebnis).
      const entries = deps.gate && isStrictGoogleNewsUrl(feedUrl)
        ? await withGoogleRetry(fetchFeed, {
            retryMax: deps.hardening && deps.hardening.retryMax,
            baseMs: deps.hardening && deps.hardening.retryBaseMs,
            capMs: deps.hardening && deps.hardening.retryCapMs,
            retryAfterCapMs: deps.hardening && deps.hardening.retryAfterCapMs,
            isOpen: deps.gate.isOpen,
            canRetry: deps.gate.consumeRetry,
            onAttemptError: deps.gate.report,
            onRetry: deps.onRetry
          })
        : await fetchFeed();
      if (entries.length) {
        const resolvedEntries = skipResolution ? entries : await resolveEntryUrls(entries, deps);
        const normalized = resolvedEntries.map((entry) => normalizeRawItem(entry, source));
        collected.push(...(skipResolution
          ? filterPersonItemsWithoutFetch(normalized, source)
          : await enrichPersonArticleImages(normalized, source, deps)));
        continue;
      }
      errors.push(`${feedUrl}: empty feed`);
    } catch (error) {
      // Eine vor dem Transport bestimmte Anbietervertagung ist kein Feedfehler
      // und darf nicht in einen neuen String/Error umgewandelt werden.
      if (isAnbieterVertagung(error)) throw error;
      hadFetchError = true;
      errors.push(`${feedUrl}: ${error.message}`);
    }
  }

  if (collected.length) {
    // Ein Abrufbuendel ist erst dann als geteilter Erfolg belegbar, wenn JEDER
    // seiner Google-Feeds technisch beantwortet wurde. Sonst wuerde ein
    // erfolgreicher Primaerfeed den fehlgeschlagenen Archiv-/Zweitfeed
    // verdecken; das Shared-Ledger markierte danach das gesamte Buendel und ein
    // Folgelauf ueberspraenge den nie belegten Weg als `skipped-shared`.
    // Direkte Mehrfachfeeds behalten ihre Bestandssemantik; das Ledger gilt nur
    // fuer den Google-Gate-Pfad.
    if (hadFetchError && deps.gate && isGoogleNewsSource(source)) {
      throw new Error(errors.join("; "));
    }
    return deduplicateRawItems(collected);
  }

  // Härtung: für Google-News-Quellen unter dem Gate KEIN HTML-Fallback — der
  // würde bei einer Drosselung einen ZWEITEN Request gegen news.google.com
  // feuern (Traffic-Verdopplung genau im Störfall) und liefert für Suchseiten
  // ohnehin keinen belastbaren Artikel. Nur ECHTE Abruf-Fehler werden geworfen;
  // legitim leere Feeds (ruhiger Nachrichtentag, Personen-Filter ohne Treffer)
  // enden wie bisher als ok/'empty' — sonst würde ein ruhiger Tag fälschlich
  // als Degradation alarmieren (Review-Fix).
  if (deps.gate && isGoogleNewsSource(source)) {
    if (hadFetchError) throw new Error(errors.join("; "));
    return [];
  }

  try {
    const page = await fetchHtmlPage(source.url, deps);
    return page && !isGenericHtmlPage(page, source) ? [normalizeRawItem(page, source)] : [];
  } catch (error) {
    if (isAnbieterVertagung(error)) throw error;
    errors.push(`html: ${error.message}`);
    throw new Error(errors.join("; "));
  }
}

function sourceMaxItems(source, feedUrl = "") {
  const configured = Number(source.maxItems || 0);
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
  return isStrictGoogleNewsUrl(feedUrl) ? defaultGoogleNewsMaxItems : defaultRssMaxItems;
}

function limitRawCandidates(items, limit) {
  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 1000;
  return [...items]
    .sort((a, b) => rawCandidateScore(b) - rawCandidateScore(a))
    .slice(0, max);
}

function rawCandidateScore(item) {
  const sourcePriority = Number(item?.sourcePriority || item?.priority || 0);
  const confidence = item?.confidence === "high" ? 30 : item?.confidence === "medium" ? 15 : 0;
  const link = item?.linkType === "direct" ? 20 : 0;
  const recency = Math.max(0, 14 - Math.floor((Date.now() - new Date(item?.publishedAt || item?.retrievedAt || 0).getTime()) / (24 * 60 * 60 * 1000)));
  return sourcePriority + confidence + link + recency;
}

async function resolveEntryUrls(entries, deps = {}) {
  return mapWithConcurrency(entries, 4, async (entry) => {
    if (!isGoogleNewsUrl(entry.url)) return entry;
    resolutionStats.attempted += 1;
    const articleUrl = await resolveArticleUrl(entry.url, entry.title, deps);
    const resolved = Boolean(articleUrl && articleUrl !== entry.url && !isGoogleNewsUrl(articleUrl));
    if (resolved) resolutionStats.resolved += 1;
    else resolutionStats.unresolved += 1;
    return resolved
      ? { ...entry, url: articleUrl, originalUrl: entry.url }
      : entry;
  });
}

// Reduzierter Personen-Filter ohne Netz (Cooldown/Breaker-offen): wendet nur die
// Suchbegriffs-Prüfung auf Titel+Inhalt an — keine URL-Auflösung, kein Bild-Fetch.
function filterPersonItemsWithoutFetch(items, source) {
  if (source.type !== "person") return items;
  const terms = source.queryTerms || [source.name];
  return items.filter((item) => hasAnyLooseTerm(`${item.title} ${item.content}`, terms));
}

async function enrichPersonArticleImages(items, source, deps = {}) {
  if (source.type !== "person") return items;
  const terms = source.queryTerms || [source.name];
  const enriched = [];
  for (const item of items) {
    const articleUrl = await resolveArticleUrl(item.url, item.title, deps);
    const itemWithResolvedUrl = articleUrl && articleUrl !== item.url ? { ...item, url: articleUrl, originalUrl: item.url || item.originalUrl } : item;
    if (!hasAnyLooseTerm(`${itemWithResolvedUrl.title} ${itemWithResolvedUrl.content}`, terms)) {
      continue;
    }
    if (itemWithResolvedUrl.imageUrl) {
      enriched.push(itemWithResolvedUrl);
      continue;
    }
    try {
      const html = await fetchText(itemWithResolvedUrl.url, deps);
      const imageUrl = normalizeImageUrl(readMeta(html, "og:image") || readMeta(html, "twitter:image"));
      enriched.push(imageUrl ? { ...itemWithResolvedUrl, imageUrl } : itemWithResolvedUrl);
    } catch (error) {
      if (isAnbieterVertagung(error)) throw error;
      enriched.push(itemWithResolvedUrl);
    }
  }
  return enriched;
}

async function resolveArticleUrl(url, title = "", deps = {}) {
  if (!isGoogleNewsUrl(url)) return url;
  const decodedFromUrl = decodeGoogleNewsArticleUrl(url, title);
  if (isUsableArticleUrl(decodedFromUrl) && !isLikelyPublisherHomepage(decodedFromUrl)) return decodedFromUrl;
  try {
    const page = await fetchUrl(url, 0, deps);
    if (isUsableArticleUrl(page.finalUrl) && !isLikelyPublisherHomepage(page.finalUrl)) return page.finalUrl;
    const googleDecoded = await decodeGoogleNewsPageUrl(page.body, url, title, deps);
    if (isUsableArticleUrl(googleDecoded) && !isLikelyPublisherHomepage(googleDecoded)) return googleDecoded;
    const decoded = extractPublisherUrl(page.body, title);
    return isUsableArticleUrl(decoded) ? decoded : url;
  } catch (error) {
    if (isAnbieterVertagung(error)) throw error;
    return url;
  }
}

async function decodeGoogleNewsPageUrl(html, sourceUrl, title = "", deps = {}) {
  const params = googleNewsDecodingParams(html, sourceUrl);
  if (!params.base64 || !params.timestamp || !params.signature) return "";

  const payload = [
    "Fbv4je",
    `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${params.base64}",${params.timestamp},"${params.signature}"]`
  ];
  const body = `f.req=${encodeURIComponent(JSON.stringify([[payload]]))}`;
  // Zwei Versuche: Google drosselt Rechenzentrums-IPs sporadisch, ein zweiter
  // Anlauf holt einen Teil der transienten Fehlschläge zurück.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await postForm("https://news.google.com/_/DotsSplashUi/data/batchexecute", body, deps);
      const decoded = extractGoogleNewsBatchUrl(response.body, title);
      if (decoded) return decoded;
    } catch (error) {
      if (isAnbieterVertagung(error)) throw error;
      // nächster Versuch bzw. leeres Ergebnis unten
    }
  }
  return "";
}

function googleNewsDecodingParams(html, sourceUrl) {
  const text = String(html || "");
  const base64FromPage = text.match(/data-n-a-id=["']([^"']+)["']/i)?.[1];
  const timestamp = text.match(/data-n-a-ts=["']([^"']+)["']/i)?.[1];
  const signature = text.match(/data-n-a-sg=["']([^"']+)["']/i)?.[1];
  return {
    base64: base64FromPage || googleNewsToken(sourceUrl),
    timestamp,
    signature
  };
}

function extractGoogleNewsBatchUrl(body, title = "") {
  const text = String(body || "");
  const parts = text.split("\n\n").filter(Boolean);
  const candidates = [];

  for (const part of parts) {
    try {
      const parsed = JSON.parse(part);
      for (const row of parsed) {
        if (!Array.isArray(row) || row[1] !== "Fbv4je" || typeof row[2] !== "string") continue;
        const inner = JSON.parse(row[2]);
        if (typeof inner?.[1] === "string") candidates.push(inner[1]);
      }
    } catch {
      // Google occasionally changes the wrapper; URL extraction below is the fallback.
    }
  }

  candidates.push(
    ...Array.from(text.matchAll(/https?:\\\/\\\/[^"\\]+/gi)).map((match) => match[0].replace(/\\\//g, "/")),
    ...Array.from(text.matchAll(/https?:\/\/[^\s"'<>\\]+/gi)).map((match) => match[0])
  );

  return bestArticleCandidate(
    candidates
      .map((value) => decodeHtml(value).replace(/\\u003d/g, "=").replace(/\\u0026/g, "&").replace(/[),.;]+$/, ""))
      .filter(isUsableArticleUrl),
    title
  );
}

function decodeGoogleNewsArticleUrl(url, title = "") {
  try {
    const token = googleNewsToken(url);
    if (!token || token.length < 20) return "";
    const padded = token.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(token.length / 4) * 4, "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const urls = Array.from(decoded.matchAll(/https?:\/\/[^\s"'<>\\\u0000-\u001F]+/gi))
      .map((match) => decodeHtml(match[0]).replace(/[),.;]+$/, ""))
      .filter(isUsableArticleUrl);
    return bestArticleCandidate(urls, title);
  } catch {
    return "";
  }
}

function googleNewsToken(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.pathname
      .split("/")
      .filter(Boolean)
      .pop() || "";
  } catch {
    return "";
  }
}

function extractPublisherUrl(html, title = "") {
  const text = String(html || "");
  const metaRefresh = text.match(/http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"']+)["']/i);
  const candidates = [
    metaRefresh?.[1],
    ...Array.from(text.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)).map((match) => match[1]),
    ...Array.from(text.matchAll(/"(https?:\/\/[^"]+)"/gi)).map((match) => match[1])
  ]
    .filter(Boolean)
    .map((value) => decodeHtml(value).replace(/\\u003d/g, "=").replace(/\\u0026/g, "&"))
    .filter(isUsableArticleUrl);
  return bestArticleCandidate(candidates, title);
}

function isUsableArticleUrl(candidate) {
  if (!/^https?:\/\//i.test(String(candidate || ""))) return false;
  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    if (isGoogleNewsUrl(candidate) || isGoogleSearchUrl(candidate)) return false;
    if (hostname === "google.com" || hostname.endsWith(".google.com") || hostname.includes("google.")) return false;
    if (hostname.includes("googleapis.com") || hostname.includes("googleadservices.com") || hostname.includes("googlesyndication.com")) return false;
    if (hostname === "www.w3.org" || hostname === "w3.org") return false;
    if (hostname.includes("gstatic.com") || hostname.includes("googleusercontent.com")) return false;
    if (hostname.includes("google-analytics.com") || hostname.includes("googletagmanager.com")) return false;
    if (/\.(js|css|png|jpe?g|webp|gif|svg|ico)(\?|$)/i.test(pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

function bestArticleCandidate(candidates, title = "") {
  const unique = Array.from(new Set(candidates || []));
  if (!unique.length) return "";
  const scored = unique
    .map((url) => ({ url, score: articleCandidateScore(url, title) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.url || "";
}

function articleCandidateScore(url, title = "") {
  if (!isUsableArticleUrl(url)) return 0;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    if (isLikelyPublisherHomepage(url)) return 5;
    let score = 20;
    const segments = pathname.split("/").filter(Boolean);
    score += Math.min(segments.length, 6) * 8;
    if (/\d{4}/.test(pathname)) score += 8;
    if (/article|artikel|news|politik|wirtschaft|presse|meldung|nachricht|deutschland|arbeit|soziales|rente|mindestlohn|tarif/.test(pathname)) score += 10;
    const titleTokens = slugTokens(title);
    const pathText = `${hostname} ${pathname}`.replace(/[-_/]+/g, " ");
    score += titleTokens.filter((token) => pathText.includes(token)).slice(0, 6).length * 8;
    return score;
  } catch {
    return 0;
  }
}

function slugTokens(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !["eine", "einer", "einen", "oder", "dass", "nicht", "ueber", "über", "wird", "werden", "the"].includes(token))
    .slice(0, 12);
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

function hasAnyLooseTerm(value, terms) {
  const text = String(value || "").toLowerCase();
  return (terms || []).some((term) => {
    const normalized = String(term || "").toLowerCase().trim();
    return normalized && text.includes(normalized);
  });
}

// Reiner Parser (kein Netz): wandelt bereits geladenes RSS/Atom-XML in Items um.
// Aus parseRssFeed extrahiert, damit derselbe Produktionsparser auf einen schon
// abgerufenen Body angewandt und offline gegen Fixtures getestet werden kann.
function parseRssItems(xml, maxItems = 20) {
  const text = String(xml || "");
  if (!/<(rss|feed|item|entry)[\s>]/i.test(text)) return [];
  const itemMatches = Array.from(text.matchAll(/<item[\s\S]*?<\/item>/gi)).map((match) => match[0]);
  const entryMatches = Array.from(text.matchAll(/<entry[\s\S]*?<\/entry>/gi)).map((match) => match[0]);
  const blocks = itemMatches.length ? itemMatches : entryMatches;

  return blocks.slice(0, maxItems).map((block) => ({
    title: readTag(block, "title"),
    url: readTag(block, "link") || readAttribute(block, "link", "href") || readTag(block, "guid"),
    content: readTag(block, "description") || readTag(block, "summary") || readTag(block, "content") || readTag(block, "content:encoded"),
    publishedAt: readTag(block, "pubDate") || readTag(block, "published") || readTag(block, "updated"),
    author: readTag(block, "author") || readTag(block, "dc:creator"),
    publisherName: readTag(block, "source"),
    publisherUrl: readAttribute(block, "source", "url"),
    imageUrl: readRssImage(block)
  })).filter((item) => item.title && item.url);
}

async function parseRssFeed(url, maxItems = 20, deps = {}) {
  const xml = await fetchText(url, deps);
  return parseRssItems(xml, maxItems);
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = [];
  const workers = Array.from({ length: Math.max(1, Math.min(limit || 1, items.length || 1)) }, async (_, workerIndex) => {
    for (let index = workerIndex; index < items.length; index += Math.max(1, limit || 1)) {
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchHtmlPage(url, deps = {}) {
  const html = await fetchText(url, deps);
  const title = stripHtml(readTag(html, "title")) || url;
  const description =
    readMeta(html, "description") ||
    stripHtml(html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")).slice(0, 500);

  return {
    title,
    url,
    content: description,
    publishedAt: new Date().toISOString(),
    author: title,
    imageUrl: readMeta(html, "og:image") || readMeta(html, "twitter:image")
  };
}

function isGenericHtmlPage(page, source) {
  const title = cleanText(page.title).toLowerCase();
  const content = cleanText(page.content).toLowerCase();
  return (
    title === cleanText(source.name).toLowerCase() ||
    title.includes("startseite") ||
    title.includes("homepage") ||
    title.includes("für solidarität und soziale gerechtigkeit") ||
    title.includes("start - fraktion die linke") ||
    title.includes("deutscher gewerkschaftsbund | dgb") ||
    title.includes("ausschuss für arbeit und soziales") ||
    content.includes("hinter diesen worten verbergen sich") ||
    content.includes("stark in arbeit: als deutscher gewerkschaftsbund")
  );
}

function normalizeRawItem(data, source) {
  const publishedAt = toIsoDate(data.publishedAt) || new Date().toISOString();
  const retrievedAt = new Date().toISOString();
  // SICHERHEIT: Titel deckeln (wie excerpt weiter unten) — echte Schlagzeilen sind immer
  // viel kuerzer; die Grenze faengt nur eine boesartige/kompromittierte Quelle ab, die
  // einen ueberlangen "Titel" sendet (fliesst ungekuerzt in Scoring + KI-Prompts ein).
  const title = cleanText(data.title).slice(0, 300);
  const content = cleanText(stripHtml(data.content || title));
  const excerpt = content.slice(0, 240);
  const publisherName = cleanText(data.publisherName);
  const publisherUrl = normalizeSourceUrl(data.publisherUrl);
  const isNewsSearchSource = isStrictGoogleNewsUrl(source.url) || isStrictGoogleNewsUrl(source.rssUrl);
  const sourceName = isNewsSearchSource && publisherName ? publisherName : source.name;
  const sourceUrl = isNewsSearchSource && publisherUrl ? publisherUrl : source.url;
  const normalizedUrl = normalizeSourceUrl(data.url);
  const articleUrl = normalizedUrl && isUsableArticleUrl(normalizedUrl) && !isGoogleNewsUrl(normalizedUrl) ? normalizedUrl : "";
  const linkType = classifyLinkType(articleUrl, sourceUrl, normalizedUrl);
  const url = linkType === "direct" ? articleUrl : "";
  const hashDate = data.publishedAt ? publishedAt : "undated";
  const hashUrl = url || normalizedUrl || sourceUrl || source.url;
  const hash = crypto.createHash("sha256").update(`${title}|${hashUrl}|${hashDate}`).digest("hex");

  return {
    id: `raw-${hash.slice(0, 16)}`,
    sourceId: source.id,
    sourceName,
    sourceType: source.type,
    sourceUrl,
    sourcePriority: source.priority || 0,
    title,
    url,
    originalUrl: data.originalUrl || (normalizedUrl && normalizedUrl !== url ? normalizedUrl : ""),
    linkType,
    linkResolutionNote: linkResolutionNote(linkType),
    content,
    publishedAt,
    retrievedAt,
    author: cleanText(data.author || source.name),
    imageUrl: normalizeImageUrl(data.imageUrl),
    excerpt,
    confidence: confidenceForSource(source),
    hash,
    category: "Crawled Source"
  };
}

function classifyLinkType(articleUrl, sourceUrl, originalUrl) {
  if (articleUrl && !isLikelyPublisherHomepage(articleUrl)) return "direct";
  if (articleUrl) return "publisher";
  if (sourceUrl && !isGoogleNewsUrl(sourceUrl)) return "publisher";
  if (originalUrl && isGoogleNewsUrl(originalUrl)) return "google_proxy";
  return "missing";
}

function linkResolutionNote(linkType) {
  if (linkType === "direct") return "Direkter Artikellink gefunden.";
  if (linkType === "publisher") return "Direkter Artikel nicht sicher auflösbar; Publisher-Quelle hinterlegt.";
  if (linkType === "google_proxy") return "Google-News-Link erkannt, direkter Artikel noch nicht auflösbar.";
  return "Kein belastbarer öffentlicher Link gefunden.";
}

const isGoogleNewsUrl = isStrictGoogleNewsUrl;

function isGoogleSearchUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    return parsed.hostname.includes("google.") && parsed.pathname.includes("/search");
  } catch {
    return false;
  }
}

function readRssImage(block) {
  return (
    readAttribute(block, "media:thumbnail", "url") ||
    readAttribute(block, "media:content", "url") ||
    readAttribute(block, "enclosure", "url") ||
    readFirstImage(block)
  );
}

function readFirstImage(block) {
  const match = block.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match ? decodeHtml(match[1]) : "";
}

function normalizeImageUrl(value) {
  const url = String(value || "").trim();
  if (!/^https?:\/\//i.test(url)) return "";
  if (/\.(mp3|mp4|m4a|pdf)(\?|$)/i.test(url)) return "";
  return url;
}

function normalizeSourceUrl(value) {
  const url = String(value || "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}

function deduplicateRawItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.hash)) return false;
    seen.add(item.hash);
    return true;
  });
}

async function fetchText(url, deps = {}) {
  const result = await fetchUrl(url, 0, deps);
  return result.body;
}

// ── PARDOK-/parldok-Abruf (Audit-Fix 2026-07, Berlin-Grundlagen) ─────────────
// Die echten Parlaments-Exporte (Berlin pardok-wp19.xml ~48 MB, Brandenburg
// exportWP8.xml ~12 MB) sprengen das normale 10-MiB-Crawl-Limit — der Dispatch
// endete selbst im Shadow-Modus IMMER mit "Response too large". Dieser eigene,
// weiterhin HART begrenzte Streaming-Abruf gilt NUR fuer structured_download-
// Quellen: groesseres PARDOK-Byte-Budget + fruehes Abbrechen, sobald genug
// Records fuer maxRecords gelesen wurden (sauberer Schnitt hinter dem letzten
// vollstaendigen Record — kein 48-MB-String im Speicher, kein unbegrenzter
// Download). Aendert NICHTS am Bundestagsbetrieb (kein bestehender Pfad nutzt
// diese Funktion ausser dem PARDOK-Dispatch, der ohne BE/BB-Freigabe 0 Quellen
// sieht).
// Grenzwerte fail-closed lesen (Review-Fix): ein GESETZTER, aber ungueltiger
// Env-Wert (Tippfehler "64MB", "0", " ") fiel frueher auf NaN/0 -> Byte-/Record-
// Vergleich immer false -> BEIDE Schutzgrenzen still deaktiviert (unbegrenzter
// Download). Jetzt: nur finite, positive Werte gelten; sonst konservativer
// Default (analog llmDailyCallLimit).
function pardokLimit(raw, fallback) {
  const s = String(raw ?? "").trim();
  if (s === "") return fallback;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
const maxPardokResponseBytes = pardokLimit(process.env.HELMUT_PARDOK_MAX_RESPONSE_BYTES, 64 * 1024 * 1024);
const defaultPardokMaxRecords = pardokLimit(process.env.HELMUT_PARDOK_MAX_RECORDS, 800);
// Berlin exportiert flache <Dokument>-Elemente, Brandenburg <Vorgang>-Elemente.
const PARDOK_RECORD_CLOSE_TAGS = ["</Dokument>", "</Vorgang>"];

// INKREMENTELLE Zählung (Review-Fix): Der komplette Body wurde früher bei JEDEM
// data-Chunk neu gescannt (O(n²) -> zig GB Zeichendurchlauf bei 12-48 MB, Event-
// Loop-Blockade). Jetzt hält ein Zustandsobjekt einen kurzen `pending`-Puffer:
// nach jedem Chunk werden neue Tags gezählt und ALLES bis zum ENDE des letzten
// gefundenen Tags verworfen (bereits gezählt, nie wieder gescannt). Der Rest —
// höchstens ein angefangener Datensatz + ein evtl. an der Chunk-Grenze
// gespaltenes Tag — bleibt erhalten. Kein Doppelzählen (verworfene Tags sind weg),
// kein Verpassen (Split-Tags bleiben im pending), O(n) gesamt.
const PARDOK_MAX_TAG_LEN = Math.max(...PARDOK_RECORD_CLOSE_TAGS.map((t) => t.length));
function makePardokCounter() {
  const counts = new Map(PARDOK_RECORD_CLOSE_TAGS.map((t) => [t, 0]));
  let pending = "";
  return {
    push(chunk) {
      pending += chunk;
      let lastMatchEnd = -1;
      for (const tag of PARDOK_RECORD_CLOSE_TAGS) {
        let idx = 0;
        while ((idx = pending.indexOf(tag, idx)) !== -1) {
          counts.set(tag, counts.get(tag) + 1);
          idx += tag.length;
          if (idx > lastMatchEnd) lastMatchEnd = idx;
        }
      }
      // Alles bis zum letzten Tag-Ende verwerfen; nur den ungezählten Rest behalten.
      // Ohne Tag: nur den kurzen Suffix behalten, der ein grenzgespaltenes Tag
      // vervollständigen könnte (verhindert unbegrenztes pending-Wachstum bei einem
      // riesigen Datensatz ohne Schließ-Tag).
      pending = lastMatchEnd >= 0
        ? pending.slice(lastMatchEnd)
        : pending.slice(Math.max(0, pending.length - (PARDOK_MAX_TAG_LEN - 1)));
    },
    max() { return Math.max(...counts.values()); }
  };
}

function cutAfterLastPardokRecord(text) {
  let cutAt = -1, tagLen = 0;
  for (const tag of PARDOK_RECORD_CLOSE_TAGS) {
    const idx = text.lastIndexOf(tag);
    if (idx > cutAt) { cutAt = idx; tagLen = tag.length; }
  }
  return cutAt >= 0 ? text.slice(0, cutAt + tagLen) : text;
}

// Pardok ist ein WEITERER Anbieter (parlamentarische Dokumentation) mit eigenem Export.
// Er lief bis zum Korrekturlauf 2026-08-14/3 an der Anbietersteuerung vorbei — deshalb
// dieselbe Umschliessung wie beim Seitenabruf. Jeder Redirect-Hop ist ein eigener
// HTTP-Versuch und wird unter der Providerklasse seines tatsaechlichen Zielhosts
// reserviert und gemeldet.
async function fetchPardokText(url, opts = {}, redirectDepth = 0, deps = {}) {
  if (redirectDepth > 3) throw new Error(`Too many redirects for ${url}`);
  assertSafeProviderTransportUrl(url);
  const ergebnis = await anbieterUmschlossen({ url, deps }, async (signal) => {
    const roh = await fetchPardokTextRoh(
      url, opts, redirectDepth, signal ? { ...deps, abbruchSignal: signal } : deps);
    return assertSingleHopTransportResult(roh, url);
  });
  const nextUrl = redirectZiel(ergebnis, url);
  return nextUrl
    ? fetchPardokText(nextUrl, opts, redirectDepth + 1, deps)
    : ergebnis;
}

async function fetchPardokTextRoh(url, opts = {}, redirectDepth = 0, deps = {}) {
  // opts-Overrides ebenfalls fail-closed validieren (analog Env oben).
  const maxBytes = pardokLimit(opts.maxBytes, maxPardokResponseBytes);
  const maxRecords = pardokLimit(opts.maxRecords, defaultPardokMaxRecords);
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (error) { reject(new Error(`Invalid URL: ${url}`)); return; }
    const client = parsed.protocol === "https:" ? https : http;
    const request = client.get({
      hostname: parsed.hostname,
      port: parsed.port || undefined,
      path: `${parsed.pathname}${parsed.search}`,
      headers: { "user-agent": browserUserAgent(), accept: "application/xml,text/xml,*/*" },
      timeout: fetchTimeoutMs
    }, (response) => {
      // NUR die Status, denen redirectZiel auch wirklich folgt, duerfen als
      // Redirect-Zwischenergebnis (leerer Rumpf) zurueckkommen. Ein 300/304/305/306
      // mit Location-Header endete sonst als stiller Leer-Erfolg (body: ""), den der
      // Aufrufer nie weiterverfolgt — falsches Gruen statt ehrlichem Fehler
      // (Befund Diff-Review 29.08., CLAUDE.md §4.4).
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        resolve({
          body: "", finalUrl: url, statusCode: response.statusCode,
          headers: response.headers
        });
        return;
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      let body = "";
      let receivedBytes = 0;
      let settled = false;
      const counter = makePardokCounter();
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        if (settled) return;
        receivedBytes += Buffer.byteLength(chunk, "utf8");
        if (receivedBytes > maxBytes) {
          settled = true;
          response.destroy();
          reject(new Error(`PARDOK response too large for ${url} (> ${maxBytes} Bytes)`));
          return;
        }
        body += chunk;
        counter.push(chunk);
        // Frueher Abbruch: genug Records fuer maxRecords gelesen -> Rest des
        // Voll-Exports (Wahlperioden-Dump) gar nicht erst herunterladen. Zählung
        // inkrementell (counter.max()), nicht mehr Voll-Body-Rescan pro Chunk.
        if (counter.max() >= maxRecords) {
          settled = true;
          response.destroy();
          resolve({
            body: cutAfterLastPardokRecord(body), truncated: true, receivedBytes,
            finalUrl: url, statusCode: response.statusCode, headers: response.headers
          });
        }
      });
      response.on("end", () => {
        if (settled) return;
        settled = true;
        resolve({
          body, truncated: false, receivedBytes,
          finalUrl: url, statusCode: response.statusCode, headers: response.headers
        });
      });
      response.on("error", (error) => { if (!settled) { settled = true; reject(error); } });
    });
    request.on("timeout", () => request.destroy(new Error(`Timeout for ${url}`)));
    request.on("error", reject);
    verdrahteAbbruch(request, deps.abbruchSignal, url);
  });
}

// Die Google-News-Aufloesung ist ein ECHTER Google-News-Aufruf (POST auf batchexecute) —
// derselbe Anbieter, der der belegte Engpass ist. Auch er laeuft jetzt durch die
// Anbietersteuerung; ohne Flag ist die Umschliessung inert.
async function postForm(url, body, deps = {}) {
  return anbieterUmschlossen({ url, deps }, async (signal) => {
    const roh = await postFormRoh(url, body, signal ? { ...deps, abbruchSignal: signal } : deps);
    return assertSingleHopTransportResult(roh, url);
  });
}

async function postFormRoh(url, body, deps = {}) {
  assertSafeGoogleNewsTransportUrl(url);
  if (typeof deps.requestPost === "function") return deps.requestPost(url, body, deps);
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;
    const requestOptions = {
      method: "POST",
      hostname: parsed.hostname,
      path: `${parsed.pathname}${parsed.search}`,
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "content-length": Buffer.byteLength(body),
        "user-agent": browserUserAgent(),
        accept: "*/*",
        origin: "https://news.google.com",
        referer: "https://news.google.com/",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin"
      },
      timeout: fetchTimeoutMs
    };
    // TLS-Zertifikatsprüfung bleibt aktiv. Quellen mit defektem/ungültigem
    // Zertifikat schlagen sauber fehl (reject -> per-Source-Fehler im crawlRun
    // protokolliert), statt unsicher (MITM-anfällig) geladen zu werden.

    const request = client.request(requestOptions, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(httpError(response, url));
        return;
      }
      let responseBody = "";
      let receivedBytes = 0;
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        receivedBytes += Buffer.byteLength(chunk, "utf8");
        if (receivedBytes > maxCrawlResponseBytes) {
          response.destroy();
          reject(new Error(`Response too large for ${url}`));
          return;
        }
        responseBody += chunk;
      });
      response.on("end", () => resolve({ body: responseBody, finalUrl: url }));
    });

    request.on("timeout", () => request.destroy(new Error(`Timeout for ${url}`)));
    request.on("error", reject);
    verdrahteAbbruch(request, deps.abbruchSignal, url);
    request.write(body);
    request.end();
  });
}

// ── ANBIETERSTEUERUNG AM ECHTEN ABRUF (Korrekturlauf 2026-08-14/3, Luecke 4) ──────────────────
// DIESE DATEI HAT GENAU DREI NETZSTELLEN, und alle drei laufen durch dieselbe Umschliessung
// `anbieterUmschlossen`:
//   1. `fetchUrlRoh`        — RSS-Feeds, HTML-Seiten, Google News, Google-Suche
//                             (`fetchText` und `fetchHtmlPage` rufen ausschliesslich `fetchUrl`),
//   2. `fetchPardokTextRoh` — amtlicher PARDOK-Export (weiterer Anbieter),
//   3. `postFormRoh`        — Google-News-Aufloesung (batchexecute), derselbe Engpass-Anbieter.
// Es entsteht KEINE zweite Fetch-Implementierung: die Umschliessung steht einmal, die
// Rohfassungen bleiben unveraendert.
//
// ABLAUF je Abruf, wenn `HELMUT_ANBIETER_STEUERUNG=on`:
//   1. atomar reservieren (Rate je Anbieter/Host, Schutzschaltung),
//   2. bei ausgeschoepfter Grenze: NICHT abrufen, sondern einen sprechenden Fehler werfen,
//      den der Fachhandler in eine Zurueckstellung bis zum fruehesten Zeitpunkt uebersetzt
//      (keine Warteschleife in der Function),
//   3. Klassen-Lease halten und waehrend des Abrufs erneuern; geht sie verloren, bricht das
//      ECHTE Abbruchsignal den laufenden Abruf ab,
//   4. danach Erfolg oder ECHTEN Anbieterfehler melden (Timeout/429/5xx — nie ein fachlich
//      leeres Ergebnis).
// OHNE Flag ist der gesamte Block eine inerte Verzweigung: `reserviere` gibt sofort
// `{ erlaubt: true, geprueft: false }` zurueck und nichts weiter passiert.
const anbieterSteuerung = require("./anbieter-steuerung");

function anbieterFehler(bereich, wartenMs, grund) {
  const fehler = new Error(`anbietergrenze: ${grund}`);
  fehler.anbieterVertagung = { bereich, wartenMs, grund };
  return fehler;
}

// Das Abbruchsignal ist erst dann ein echtes Abbruchsignal, wenn es die laufende Anfrage
// wirklich abraeumt. Ohne diese Verdrahtung waere es ein Merker, den niemand liest —
// die Anfrage liefe nach dem Lease-Verlust ungebremst weiter.
function verdrahteAbbruch(request, signal, url) {
  if (!signal || !request) return;
  const abbrechen = () => request.destroy(new Error(`Abgebrochen (Klassen-Lease verloren) for ${url}`));
  if (signal.aborted) { abbrechen(); return; }
  signal.addEventListener("abort", abbrechen, { once: true });
  request.on("close", () => {
    try { signal.removeEventListener("abort", abbrechen); } catch (_) { /* egal */ }
  });
}

// ── DIE EINE UMSCHLIESSUNG FUER JEDEN EXTERNEN AUFRUF ────────────────────────────────────────
// Reservieren -> Lease halten und erneuern -> aufrufen -> Ausgang ehrlich melden -> Lease
// IMMER freigeben. Sie steht genau EINMAL hier und wird von allen drei Netzwegen benutzt
// (Seitenabruf, Pardok-Export, Google-News-Aufloesung). Ohne Flag ist sie inert.
async function anbieterUmschlossen({ url, deps = {}, klasse = "quellenabruf" }, aufruf) {
  const env = deps.env || process.env;
  if (!anbieterSteuerung.steuerungAktiv(env)) return aufruf(undefined);

  const bereich = { ...anbieterSteuerung.anbieterAusUrl(url), klasse };
  const res = await anbieterSteuerung.reserviere({ ...bereich, env, deps });
  if (!res.erlaubt) throw anbieterFehler(bereich, res.wartenMs, res.grund);

  // Klassen-Lease + echtes Abbruchsignal (nur wenn ein Adapter gereicht wurde; der
  // Fachhandler haelt seinen quellenabruf-Slot ohnehin bereits).
  const wache = anbieterSteuerung.starteLeaseWache({
    klassen: deps.klassen || null, klasse, slot: deps.klassenSlot || null,
    ttlMs: Number(env.HELMUT_ABRUF_LEASE_MS) || 60000, deps
  });
  try {
    const ergebnis = await aufruf(wache.signal);
    // Ein HTTP-Status zaehlt nur dann als Anbieterfehler, wenn er es wirklich ist (429/5xx).
    const status = ergebnis && ergebnis.statusCode;
    const schlecht = status ? anbieterSteuerung.istAnbieterFehler(Number(status)) : false;
    await anbieterSteuerung.melde({ ...bereich, ok: !schlecht, grund: schlecht ? `http-${status}` : null, env, deps })
      .catch(() => ({}));                  // eine kaputte Meldung zerstoert kein Ergebnis
    return ergebnis;
  } catch (fehler) {
    if (wache.verloren()) {
      // Der Slot wurde weggeraeumt — der Abruf lief ausserhalb seiner Grenze und wurde
      // abgebrochen. Das ist KEIN Anbieterfehler, sondern ein eigener Befund.
      throw anbieterFehler(bereich, 5000, "klassen-lease-verloren");
    }
    await anbieterSteuerung.melde({
      ...bereich, ok: !anbieterSteuerung.istAnbieterFehler(fehler),
      grund: String((fehler && fehler.message) || "").slice(0, 120), env, deps
    }).catch(() => ({}));
    throw fehler;
  } finally {
    wache.beenden();                       // Lease IMMER freigeben/Wache immer stoppen
  }
}

async function fetchUrl(url, redirectDepth = 0, deps = {}) {
  // Eine Weiterleitung ist ein weiterer HTTP-Versuch. Sie muss daher VOR ihrem
  // Socket unter der Providerklasse des tatsaechlichen Zielhosts reserviert
  // werden. Andernfalls koennte etwa eine generische Quelle per 302 in Google
  // News hineinleiten und dessen Minuten-/Tagesgrenze umgehen.
  if (redirectDepth > 6) throw new Error(`Too many redirects for ${url}`);
  assertSafeProviderTransportUrl(url);
  const ergebnis = await anbieterUmschlossen({ url, deps }, async (signal) => {
    const roh = await fetchUrlRoh(
      url, redirectDepth, signal ? { ...deps, abbruchSignal: signal } : deps);
    return assertSingleHopTransportResult(roh, url);
  });
  const nextUrl = redirectZiel(ergebnis, url);
  return nextUrl ? fetchUrl(nextUrl, redirectDepth + 1, deps) : ergebnis;
}

async function fetchUrlRoh(url, redirectDepth = 0, deps = {}) {
  assertSafeProviderTransportUrl(url);
  if (typeof deps.requestGet === "function") return deps.requestGet(url, redirectDepth, deps);
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const requestOptions = {
      headers: {
        "user-agent": isGoogleNewsUrl(url) ? browserUserAgent() : "HelmutBot/1.0 political-briefing",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7"
      },
      timeout: fetchTimeoutMs
    };
    // TLS-Zertifikatsprüfung bleibt aktiv (siehe postForm). Kein unsicherer Fetch.
    const request = client.get(
      url,
      requestOptions,
      (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
          response.resume();
          resolve({
            body: "", finalUrl: url, statusCode: response.statusCode,
            headers: response.headers
          });
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume();
          reject(httpError(response, url));
          return;
        }
        let body = "";
        let receivedBytes = 0;
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          receivedBytes += Buffer.byteLength(chunk, "utf8");
          if (receivedBytes > maxCrawlResponseBytes) {
            response.destroy();
            reject(new Error(`Response too large for ${url}`));
            return;
          }
          body += chunk;
        });
        response.on("end", () => resolve({
          body, finalUrl: url, statusCode: response.statusCode, headers: response.headers
        }));
      }
    );
    request.on("timeout", () => request.destroy(new Error(`Timeout for ${url}`)));
    request.on("error", reject);
    verdrahteAbbruch(request, deps.abbruchSignal, url);
  });
}

function redirectZiel(ergebnis, basisUrl) {
  const status = Number(ergebnis && ergebnis.statusCode);
  const location = ergebnis && ergebnis.headers && ergebnis.headers.location;
  if (![301, 302, 303, 307, 308].includes(status) || !location) return null;
  return new URL(String(location), basisUrl).toString();
}

// Injizierte Transporte duerfen eine einzelne Antwort simulieren, aber nicht
// selbst Redirects verfolgen. Sonst koennte der Adapter einen Providerwechsel
// hinter HTTP 200/finalUrl verbergen, fuer den nie separat reserviert wurde.
function assertSingleHopTransportResult(ergebnis, angefragteUrl) {
  const finalUrl = ergebnis && ergebnis.finalUrl;
  if (finalUrl == null || String(finalUrl).trim() === "") return ergebnis;
  let angefragt;
  let final;
  try {
    angefragt = new URL(String(angefragteUrl)).toString();
    final = new URL(String(finalUrl)).toString();
  } catch (_) {
    const error = new Error("transport-final-url-ungueltig");
    error.code = "TRANSPORT_FINAL_URL_INVALID";
    throw error;
  }
  if (final !== angefragt) {
    const error = new Error("transport-auto-redirect-nicht-reserviert");
    error.code = "TRANSPORT_AUTO_REDIRECT_FORBIDDEN";
    throw error;
  }
  return ergebnis;
}

// HTTP-Fehler mit technischen Metadaten anreichern (Statuscode + Retry-After in
// ms), damit die Google-News-Härtung Drosselung erkennen und Retry-After
// respektieren kann. Die Message bleibt unverändert (bestehende Klassifikation).
function httpError(response, url) {
  const error = new Error(`HTTP ${response.statusCode} for ${url}`);
  error.statusCode = response.statusCode;
  const retryAfterMs = parseRetryAfterMs(response.headers && response.headers["retry-after"]);
  if (retryAfterMs != null) error.retryAfterMs = retryAfterMs;
  return error;
}

function browserUserAgent() {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
}

function readTag(block, tagName) {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(pattern);
  return match ? cleanText(stripCdata(match[1])) : "";
}

function readAttribute(block, tagName, attr) {
  const pattern = new RegExp(`<${tagName}[^>]*${attr}=["']([^"']+)["'][^>]*>`, "i");
  const match = block.match(pattern);
  return match ? decodeHtml(match[1]) : "";
}

function readMeta(html, name) {
  const pattern = new RegExp(`<meta[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
  const match = html.match(pattern);
  return match ? cleanText(match[1]) : "";
}

function stripCdata(value) {
  return value.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");
}

function stripHtml(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " "));
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function cleanText(value) {
  return decodeHtml(String(value || "")).replace(/\s+/g, " ").trim();
}

function toIsoDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function confidenceForSource(source) {
  if (["ministry", "bundestag", "committee", "party"].includes(source.type)) return "high";
  if (["association", "media", "local"].includes(source.type)) return "medium";
  return "low";
}

module.exports = {
  crawlAllSources,
  crawlSource,
  parseRssFeed,
  parseRssItems,
  fetchHtmlPage,
  normalizeRawItem,
  deduplicateRawItems,
  fetchText,
  // Die Anbieter-Engstelle selbst — exportiert, damit sie geprueft werden kann
  // (scripts/anbietersteuerung-fachpfad-test.js). Fachcode ruft weiter fetchText/fetchHtmlPage.
  fetchUrl,
  postForm,
  fetchPardokText,
  resolveArticleUrl
};
