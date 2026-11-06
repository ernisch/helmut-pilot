"use strict";

// Bedarfsbezogene Quellenprüfung. Reine Ableitung aus demselben Katalog und denselben
// Laufdaten wie die Paket-Inventur: kein Crawl, keine KI, kein Schreiben. Ein Seed ist
// kein Betriebsbeleg. Gleiche Rollenregeln für gleiche Aufgaben, keine Partei-Scores.
const sf = require("./source-failure");
const { resolveProfilePackages, isActivationEligible } = require("./profile-packages");
const { istBewussterAusschluss } = require("./paket-inventur");
const { excerpt } = require("../quellen-auszug");

const DAY = 86400000;
const ROLES = new Set(["official_primary", "direct_interest", "journalistic", "data_source", "aggregator"]);
const ROLE_TEXT = { official_primary: "amtliche Primärquelle", direct_interest: "gekennzeichnete Interessenquelle", journalistic: "Journalismus", data_source: "Daten/Forschung", aggregator: "Suchaggregator" };
const PARTY_CLASSES = new Set(["parteiquellen_bund", "partei_pilot", "fraktion_pilot", "person_pilot"]);
const sort = (values) => [...new Set(values)].sort();
const list = (value) => Array.isArray(value) ? value : [];
function timestamp(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(n) ? n : null;
}
function iso(value) { return value == null ? null : new Date(value).toISOString(); }
function meta(row) { return { ...(row.metadata || {}), ...(row.extra || {}), ...row }; }
function positive(value) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : null; }
function classes(path) { const p = meta(path); return sort([...list(p.coverage_classes), ...list(p.coverageClasses), ...list(p.covers)]); }
function partyOnly(path) { const p = meta(path); return p.party_package_only === true || p.partyPackageOnly === true || classes(p).some((c) => PARTY_CLASSES.has(c)); }

function requiredRoles(pkg) {
  const p = meta(pkg);
  if (Array.isArray(p.required_evidence_roles)) return sort(p.required_evidence_roles.filter((r) => ROLES.has(r)));
  if (p.is_base || list(p.required_classes).includes("wahlkreismedien")) return ["official_primary", "journalistic"];
  if (list(p.party_keys || p.partyKeys).length || list(p.required_classes).some((c) => PARTY_CLASSES.has(c))) return ["direct_interest"];
  // Der bestehende Sozialbereich hat diesen expliziten Vertrag. Weitere Fachpakete
  // liefern ihre Anforderungen als Metadaten, einschließlich Verfahrensausnahmen.
  if (p.key === "arbeit-und-soziales") return ["official_primary", "direct_interest", "data_source", "journalistic"];
  return [];
}

function publisherIdentity(publisher) {
  const p = meta(publisher);
  // Ein Konzern mit mehreren Domains wird nur bei belegter gemeinsamer Bindung
  // zusammengeführt. Unterschiedliche URLs belegen keine unabhängigen Redaktionen.
  return p.editorial_group_id || p.owner_id || p.entity_id || p.canonical_domain || p.id;
}

function publicationPause(policy, now) {
  const pause = policy.publicationPause || policy.publication_pause;
  if (!pause) return null;
  const from = timestamp(pause.from), until = timestamp(pause.until);
  return from != null && until != null && from <= now && until >= now && pause.reason
    ? { from: iso(from), until: iso(until), reason: String(pause.reason) } : null;
}

function documentQuality(rows, supplied, policy, path, now, pause) {
  if (!supplied) return { status: "nicht_geprueft", count: null };
  if (!rows.length) return { status: "unbekannt", count: 0 };
  let missingDate = 0, futureDate = 0, missingExcerpt = 0, missingProvenance = 0, latest = null;
  for (const d of rows) {
    // retrieved_at ist ausdrücklich KEIN Veröffentlichungsdatum.
    const date = timestamp(d.published_at || d.publishedAt || d.publication_date || d.source_date);
    if (date == null) missingDate++;
    else if (date > now) futureDate++;
    else if (latest == null || date > latest) latest = date;
    if (![d.excerpt, d.summary, d.text_excerpt, d.content_text, d.full_text, d.text, d.content].some((v) => typeof v === "string" && excerpt(v, d.title))) missingExcerpt++;
    const original = [d.canonical_url, d.canonicalUrl, d.url, d.original_url, d.originalUrl, d.source_url].some((value) => {
      try { const url = new URL(value); return /^https?:$/.test(url.protocol) && !/(^|\.)news\.google\.com$/i.test(url.hostname); }
      catch (_) { return false; }
    });
    if (!original) missingProvenance++;
  }
  const frequency = policy.expected_frequency || policy.expectedFrequency || path.expected_frequency || path.expectedFrequency;
  const maxAgeDays = positive(policy.maxPublicationAgeDays) || (frequency ? sf.veraltetSchwelleTage({ expected_frequency: frequency }).tage : null);
  const stale = !pause && latest != null && maxAgeDays != null && now - latest > maxAgeDays * DAY;
  return {
    status: stale ? "veraltet" : (missingDate || futureDate || missingExcerpt || missingProvenance ? "lueckenhaft" : latest != null && maxAgeDays != null ? "belegt" : "unbekannt"),
    count: rows.length, latestPublicationAt: iso(latest), maxAgeDays,
    missingDate, futureDate, missingExcerpt, missingProvenance, stale,
    publicationPause: pause
  };
}

/**
 * documents=null: nicht geladen; []: geladen, keine Belege. profiles=null: Bedarf
 * unbekannt; []: kein aktiver Bedarf. Nur aktiver Profilbedarf führt zu Alarmen.
 * policyByPath[id|legacy_source_id]: expected_frequency, maxPublicationAgeDays,
 * verifiedAt+reviewAfterDays oder validUntil, publicationPause:{from,until,reason}.
 * policyByPath darf auch geprüfte coverage_classes/party_package_only/evidence_role
 * enthalten. Der Aufrufer gleicht dafür Live-URL, Methode und Legacy-ID ab.
 * policyByPackage[key]: zentrale Sollrollen; expectedPackages: Sollkatalog, der
 * fehlende Pakete sichtbar macht, ohne diese als vorhandene DB-Pakete auszugeben.
 * Der Aufrufer kann die bereits berechneten Inventur-/Störungsberichte weiterreichen.
 */
function buildAbdeckungspruefung({ catalog = {}, profiles = null, telemetrie = [], documents = null,
  now = Date.now(), stoerungsbericht = null, paketInventur = null, policyByPath = {},
  policyByPackage = {}, expectedPackages = [], maxFindings = 100 } = {}) {
  now = timestamp(now);
  if (now == null) throw new TypeError("abdeckungspruefung: now muss ein gültiger Zeitpunkt sein");
  const publishers = list(catalog.publishers);
  const expectedByKey = new Map(list(expectedPackages).map((p) => [typeof p === "string" ? p : p.key, typeof p === "string" ? { key: p } : p]));
  const paths = list(catalog.retrievalPaths).map((path) => ({
    ...(policyByPath[path.legacy_source_id || path.legacySourceId || path.id] || {}),
    ...(policyByPath[path.id] || {}), ...path
  }));
  const packages = list(catalog.packages).map((pkg) => ({
    ...(expectedByKey.get(pkg.key) || {}), ...(policyByPackage[pkg.key] || {}), ...pkg,
    // Sollrollen kommen aus dem aktuellen Vertrag, nicht einer historischen DB-Kopie.
    required_evidence_roles: policyByPackage[pkg.key]?.required_evidence_roles
      || expectedByKey.get(pkg.key)?.required_evidence_roles || pkg.required_evidence_roles,
    required_classes: policyByPackage[pkg.key]?.required_classes
      || expectedByKey.get(pkg.key)?.required_classes || pkg.required_classes
  }));
  const links = list(catalog.packagePaths);
  const publisherById = new Map(publishers.map((p) => [p.id, p]));
  const pathById = new Map(paths.map((p) => [p.id, p]));
  const packageById = new Map(packages.map((p) => [p.id, p]));
  const packageByKey = new Map(packages.map((p) => [p.key, p]));
  const needed = new Set(), profileRows = [], findings = [];
  const add = (code, message, action, context = {}, level = "warnung") => {
    const relevant = context.activeDemand === true;
    findings.push({ code, level: relevant ? level : "hinweis", message, action, ...context });
  };

  for (const profile of list(profiles)) {
    if (!isActivationEligible(profile)) continue;
    const resolved = resolveProfilePackages(profile);
    const keys = sort(list(resolved.all).filter((key) => !key.startsWith("profil-") || packageByKey.has(key)));
    keys.forEach((key) => needed.add(key));
    const missing = sort([...list(resolved.requiredMissing), ...list(resolved.optionalMissing), ...keys.filter((key) => !packageByKey.has(key))]);
    profileRows.push({ id: profile.id || profile.user_id || null, requiredPackages: list(resolved.required), requestedPackages: keys, missingPackages: missing });
    for (const key of missing) add("bedarfszuordnung_fehlt", `Benötigtes Quellenpaket ${key} fehlt.`, "Passendes Landes-, Fach- oder Parteipaket zuordnen und dessen Versorgung prüfen.", { packageKey: key, profileId: profile.id || null, activeDemand: true }, "fehler");
  }

  const missingExpectedPackages = sort([...expectedByKey.keys()].filter((key) => !packageByKey.has(key)));
  for (const key of missingExpectedPackages) {
    if (needed.has(key)) continue; // aktiver Bedarf wird oben bereits konkret gemeldet
    add("sollpaket_fehlt", `Vorgesehenes Quellenpaket ${key} fehlt im Betriebskatalog.`, "Sollkatalog und vorhandene Paketzuordnungen abgleichen; Versorgung vor Aktivierung prüfen.", { packageKey: key, activeDemand: false });
  }

  const pathsByPackage = new Map(), packagesByPath = new Map();
  for (const link of links) {
    const pkg = packageById.get(link.package_id);
    if (!pkg || !pathById.has(link.retrieval_path_id)) {
      add("zuordnung_verwaist", "Eine Paketzuordnung verweist auf einen fehlenden Katalogeintrag.", "Paket- und Abrufwegkennung abgleichen.", { packageKey: pkg?.key || null, pathId: link.retrieval_path_id, activeDemand: !!pkg && needed.has(pkg.key) }, "fehler");
      continue;
    }
    if (!pathsByPackage.has(pkg.id)) pathsByPackage.set(pkg.id, new Set());
    pathsByPackage.get(pkg.id).add(link.retrieval_path_id);
    if (!packagesByPath.has(link.retrieval_path_id)) packagesByPath.set(link.retrieval_path_id, new Set());
    packagesByPath.get(link.retrieval_path_id).add(pkg.key);
  }

  const report = stoerungsbericht || sf.bewerteQuellenstoerungen({ telemetrie: list(telemetrie), retrievalPaths: paths, packages, packagePaths: links, profiles, now, env: {} });
  const healthByPath = new Map(), healthBySource = new Map();
  for (const h of list(report.befunde)) { if (h.wegId) healthByPath.set(h.wegId, h); if (h.sourceId) healthBySource.set(h.sourceId, h); }
  const inventoryByPath = new Map();
  for (const pkg of list(paketInventur?.pakete)) for (const path of list(pkg.abrufwege?.liste)) {
    // Derselbe Weg kann einem ruhenden und einem aktiven Paket angehören.
    const id = path.wegId || path.id;
    const old = inventoryByPath.get(id);
    if (!old || path.planzustand === "eingeplant") inventoryByPath.set(id, path);
  }
  const docsBySource = new Map();
  for (const doc of list(documents)) {
    const id = doc.retrieval_path_id || doc.source_id || doc.sourceId;
    if (!id) continue;
    if (!docsBySource.has(id)) docsBySource.set(id, []);
    docsBySource.get(id).push(doc);
  }
  const pathRows = paths.map((path) => {
    const sid = path.legacy_source_id || path.legacySourceId || path.id;
    const publisher = publisherById.get(path.publisher_id);
    const packageKeys = sort([...(packagesByPath.get(path.id) || [])]);
    const activeDemand = packageKeys.some((key) => needed.has(key));
    const context = { pathId: path.id, sourceId: sid, activeDemand };
    const p = meta(path), policy = { ...(p.freshness_policy || {}), ...(policyByPath[sid] || {}), ...(policyByPath[path.id] || {}) };
    const pause = publicationPause(policy, now);
    const health = healthByPath.get(path.id) || healthBySource.get(sid);
    const inventory = inventoryByPath.get(path.id);
    const deliberatelyExcluded = inventory && istBewussterAusschluss(inventory.planGrund || inventory.planGrundKopf || "");
    const inactive = ["paused", "archived"].includes(path.status) || path.activation_mode === "dev_only" || deliberatelyExcluded;
    const manual = !inactive && path.activation_mode === "manual";
    let state = inactive ? "inaktiv" : manual ? "manuell" : path.status === "broken" ? "defekt" : !health || health.klasse === "unbekannt" ? "unbekannt" : sf.istWirksam(health) ? "gesund" : sf.KEINE_STOERUNG.has(health.klasse) ? "unbekannt" : "gestoert";
    if (pause && ["leer", "veraltet"].includes(health?.klasse) && state === "gestoert") state = "publikationspause";
    if (!publisher) add("herausgeber_fehlt", `${path.name || sid}: Herausgeber fehlt.`, "Abrufweg einem belegten Herausgeber und einer Quellenrolle zuordnen.", context, "fehler");
    if (!packageKeys.length) add("paketzuordnung_fehlt", `${path.name || sid}: keinem Paket zugeordnet.`, "Fachlichen Bedarf und Paketzuordnung prüfen.", context);
    if (["defekt", "gestoert"].includes(state)) add("abruf_gestoert", `${path.name || sid}: ${state === "defekt" ? "als defekt vermerkt" : health.kurz || health.klasse}.`, "Bestehenden Störungsbefund prüfen; tragfähigen direkten Ersatzweg suchen.", context);
    if (state === "manuell") add("abruf_manuell", `${path.name || sid}: ausschließlich manuell erreichbar.`, "Automatische Versorgung erst nach geprüftem Zugriff bestätigen.", context, "hinweis");
    const verificationMeta = p.source_verification || p.verification || {};
    const verifiedAt = timestamp(policy.verifiedAt || p.verified_at || p.verifiedAt || verificationMeta.verifiedAt || verificationMeta.checkedAt);
    const reviewDays = positive(policy.reviewAfterDays || verificationMeta.reviewAfterDays);
    const expires = timestamp(policy.validUntil || p.valid_until || p.validUntil || verificationMeta.validUntil) ?? (verifiedAt != null && reviewDays != null ? verifiedAt + reviewDays * DAY : null);
    const verification = expires == null ? "unbekannt" : expires < now ? "abgelaufen" : "gueltig";
    if (verification === "abgelaufen" && !inactive) add("quellenpruefung_abgelaufen", `${path.name || sid}: Quellen- oder Versionsprüfung abgelaufen.`, "Hinterlegte Quelle, Fassung und Zugriffsbedingungen erneut prüfen.", context);
    const docs = documentQuality([...(docsBySource.get(path.id) || []), ...(sid !== path.id ? docsBySource.get(sid) || [] : [])], Array.isArray(documents), policy, p, now, pause);
    const rightsReviewRequired = p.rights_review_required === true || p.rightsReviewRequired === true;
    if (rightsReviewRequired && !inactive) add("zugriffsrechte_ungeklaert", `${path.name || sid}: automatische Nutzungsrechte noch zu prüfen.`, "Hinterlegte Zugriffsbedingungen klären; Erreichbarkeit allein belegt keine Freigabe.", context);
    if (!inactive && !manual) {
      if (docs.stale) add("inhalt_veraltet", `${path.name || sid}: jüngste belegte Veröffentlichung überschreitet den erwarteten Rhythmus (${docs.maxAgeDays} Tage).`, "Aktuelle Originalveröffentlichung und passenden Publikationsrhythmus prüfen.", context);
      if (docs.status === "lueckenhaft") add("beleg_lueckenhaft", `${path.name || sid}: Datum, Originalverweis oder belastbarer Textauszug fehlen in bereitgestellten Belegen.`, "Belegfelder vervollständigen; Abrufzeit nicht als Veröffentlichungsdatum verwenden.", context);
    }
    return { id: path.id, sourceId: sid, packageKeys, activeDemand, state, healthClass: health?.klasse || null,
      role: p.evidence_role || p.evidenceRole || publisher?.evidence_role || null, publisherId: publisher?.id || null,
      publisherIdentity: publisher ? publisherIdentity(publisher) : null,
      identityBasis: publisher ? (publisher.owner_id || publisher.editorial_group_id ? "belegte_traegerschaft" : publisher.entity_id ? "herausgeber_entitaet" : "katalogherausgeber") : null,
      method: path.method, coverageClasses: classes(p), rightsReviewRequired, publicationPause: pause, verification: { status: verification, validUntil: iso(expires) }, documents: docs };
  });
  const rowById = new Map(pathRows.map((p) => [p.id, p]));
  const packageRows = packages.map((pkg) => {
    const activeDemand = needed.has(pkg.key), context = { packageKey: pkg.key, activeDemand };
    const rows = [...(pathsByPackage.get(pkg.id) || [])].map((id) => rowById.get(id));
    const required = requiredRoles(pkg), roles = sort(rows.map((r) => r.role).filter(Boolean));
    const technicalRows = pkg.status === "active" ? rows.filter((r) => r.state === "gesund" && !r.rightsReviewRequired && r.verification.status !== "abgelaufen") : [];
    // Ein funktionierender Abruf bestätigt weder Datum noch Originalbeleg/Text.
    const liveRows = technicalRows.filter((r) => r.documents.status === "belegt");
    const liveRoles = sort(liveRows.map((r) => r.role).filter(Boolean));
    const missingRoles = required.filter((r) => !roles.includes(r));
    const requiredClasses = list(pkg.required_classes);
    const presentClasses = sort(rows.flatMap((r) => r.coverageClasses));
    const missingClasses = requiredClasses.filter((klass) => !presentClasses.includes(klass));
    const provenClasses = sort(liveRows.flatMap((r) => r.coverageClasses));
    const unprovenClasses = requiredClasses.filter((klass) => presentClasses.includes(klass) && !provenClasses.includes(klass));
    if (missingClasses.length) add("pflichtklasse_fehlt", `${pkg.name || pkg.key}: Quellen für ${missingClasses.join(", ")} fehlen oder sind nicht zugeordnet.`, "Die fehlenden institutionellen oder fachlichen Quellenklassen mit belegtem Zugang ergänzen.", context, "fehler");
    if (unprovenClasses.length) add("pflichtklasse_unbestaetigt", `${pkg.name || pkg.key}: laufende Versorgung für ${unprovenClasses.join(", ")} nicht belegt.`, "Für jede benötigte Quellenklasse Abruf, Inhalt und Aktualität prüfen.", context);
    const unprovenRoles = required.filter((r) => roles.includes(r) && !liveRoles.includes(r));
    if (!rows.length) add("paket_ohne_wege", `${pkg.name || pkg.key}: keine Abrufwege zugeordnet.`, "Für diesen Bedarf geeignete Primär-, Daten- und Medienquellen zuordnen.", context, "fehler");
    if (activeDemand && pkg.status !== "active") add("paket_nicht_betrieben", `${pkg.name || pkg.key}: benötigt, aber ${pkg.status || "ohne Betriebsstatus"}.`, "Vorbereitete Quellen prüfen und ihre Versorgung freigeben; kein technischer Defekt behauptet.", context);
    if (missingRoles.length) add("pflichtrolle_fehlt", `${pkg.name || pkg.key}: ${missingRoles.map((r) => ROLE_TEXT[r]).join(", ")} fehlt.`, "Fehlende Quellenrolle ergänzen; zusätzliche Treffer derselben Rolle schließen die Lücke nicht.", context, "fehler");
    if (unprovenRoles.length) add("pflichtrolle_unbestaetigt", `${pkg.name || pkg.key}: laufende Versorgung durch ${unprovenRoles.map((r) => ROLE_TEXT[r]).join(", ")} nicht belegt.`, "Laufdaten, aktive Abrufwege und Publikationsrhythmus prüfen.", context);
    const googleOnly = rows.length > 0 && rows.every((r) => r.method === "googlenews_search");
    const directMissingRoles = required.filter((role) => rows.some((r) => r.role === role) && !rows.some((r) => r.role === role && r.method !== "googlenews_search"));
    const effectiveGoogleRoles = required.filter((role) => technicalRows.some((r) => r.role === role && r.method === "googlenews_search") && !technicalRows.some((r) => r.role === role && r.method !== "googlenews_search"));
    if (effectiveGoogleRoles.length) add("betrieb_nur_google", `${pkg.name || pkg.key}: derzeit funktionierende Wege für ${effectiveGoogleRoles.map((r) => ROLE_TEXT[r]).join(", ")} ausschließlich über Google News.`, "Den direkten Ersatzweg prüfen und reparieren; ein nur eingetragener Weg beseitigt die Abhängigkeit nicht.", context);
    if (googleOnly || directMissingRoles.length) add("nur_google_abhaengigkeit", `${pkg.name || pkg.key}: ${googleOnly ? "alle Abrufwege" : directMissingRoles.map((r) => ROLE_TEXT[r]).join(", ")} nur über Google News.`, "Mindestens einen geeigneten direkten RSS-, API- oder Originalseitenzugriff für die betroffenen Rollen prüfen.", context);
    const partisan = pkg.is_base ? rows.filter((r) => partyOnly(pathById.get(r.id))).map((r) => r.id) : [];
    if (partisan.length) add("parteibindung_im_basispaket", `${pkg.name || pkg.key}: ausdrücklich parteigebundene Eigenquellen im gemeinsamen Basispaket.`, "Eigenquellen dem passenden Parteipaket zuordnen; allgemeine Fraktionsbeobachtung bleibt zulässig.", { ...context, pathIds: partisan }, "fehler");
    const identities = sort(rows.filter((r) => r.role !== "aggregator" && r.publisherIdentity).map((r) => r.publisherIdentity));
    const issue = missingRoles.length || missingClasses.length || unprovenClasses.length || unprovenRoles.length || googleOnly || directMissingRoles.length || effectiveGoogleRoles.length || partisan.length || !rows.length || pkg.status !== "active";
    return { id: pkg.id, key: pkg.key, activeDemand, status: !activeDemand ? "ohne_aktiven_bedarf" : issue ? "eingeschraenkt" : required.length ? "versorgung_belegt" : "unbekannt",
      requiredRoles: required, missingRoles, unprovenRoles, requiredClasses, missingClasses, unprovenClasses, googleOnly, directMissingRoles, effectiveGoogleRoles,
      publisherCount: identities.length, publisherIdentities: identities,
      livePublisherCount: sort(liveRows.filter((r) => r.role !== "aggregator" && r.publisherIdentity).map((r) => r.publisherIdentity)).length,
      pathCount: rows.length, technicalHealthyPathCount: technicalRows.length, healthyPathCount: liveRows.length };
  });
  const rank = { fehler: 0, warnung: 1, hinweis: 2 };
  findings.sort((a, b) => rank[a.level] - rank[b.level] || `${a.packageKey || ""}|${a.pathId || ""}|${a.code}|${a.profileId || ""}`.localeCompare(`${b.packageKey || ""}|${b.pathId || ""}|${b.code}|${b.profileId || ""}`, "de"));
  const alarms = findings.filter((f) => f.level !== "hinweis");
  const demanded = packageRows.filter((p) => p.activeDemand);
  const status = profiles == null ? "unbekannt" : !profileRows.length ? "ohne_aktiven_bedarf" : alarms.length ? "eingeschraenkt" : demanded.length && demanded.every((p) => p.status === "versorgung_belegt") ? "versorgung_belegt" : "unbekannt";
  const limit = Number.isInteger(maxFindings) && maxFindings > 0 ? Math.min(maxFindings, 500) : 100;
  return { erhobenAm: iso(now), status,
    summary: { activeProfiles: profileRows.length, demandedPackages: needed.size, catalogPackages: packages.length,
      missingAssignments: findings.filter((f) => f.code === "bedarfszuordnung_fehlt").length, missingExpectedPackages: missingExpectedPackages.length,
      errors: alarms.filter((f) => f.level === "fehler").length, warnings: alarms.filter((f) => f.level === "warnung").length,
      unknownPaths: pathRows.filter((p) => p.activeDemand && p.state === "unbekannt").length,
      findings: findings.length, omittedFindings: Math.max(0, findings.length - limit) },
    findings: findings.slice(0, limit), missingExpectedPackages, packages: packageRows, profiles: profileRows, paths: pathRows,
    limits: [
      "Gleiche Quellenrollen nach tatsächlichem Bedarf; keine politischen Bewertungen und keine gleiche Trefferquote je Partei.",
      "Herausgeber werden dedupliziert; wirtschaftliche oder redaktionelle Unabhängigkeit wird nur bei hinterlegten Trägerdaten beurteilt.",
      profiles == null ? "Aktiver Profilbedarf wurde nicht bereitgestellt; Kataloglücken sind Hinweise, keine Versorgungsalarme." : "Ruhende oder vorbereitete Quellen sind kein technischer Defekt und kein Beleg laufender Versorgung.",
      Array.isArray(documents) ? "Inhaltsprüfung erfasst ausschließlich bereitgestellte Dokumente; fehlende Felder können auch am Leseumfang liegen." : "Veröffentlichungsdatum, Originalverweis und Textauszug wurden nicht geladen und nicht geprüft.",
      "Alte Detail-Pflichtklassen werden nicht als universelle Pflicht angesetzt; Verfahrens- und Landesbesonderheiten kommen aus Paketmetadaten."
    ] };
}

module.exports = { buildAbdeckungspruefung, requiredRoles };
