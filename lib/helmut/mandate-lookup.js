"use strict";

// Mandatserkennung fuer die Erstkonfiguration (Onboarding, Screen 2/3).
//
// Neuer Lesepfad: aus einem eingegebenen Namen ein Mandatsprofil aus OEFFENTLICHEN,
// amtlichen Quellen vorschlagen, das der Nutzer auf Screen 3 nur noch bestaetigt
// oder korrigiert (Apple-Setup-Prinzip). KEINE Buergerdaten — ausschliesslich
// oeffentlich zugaengliche Mandatsstammdaten.
//
// Quellen:
//   1) Abgeordnetenwatch API v2 (keyless, deckt Bundestag UND Landtage ab) —
//      primaere Quelle fuer Partei/Fraktion/Wahlkreis/Ausschuesse/Ebene.
//   2) Bundestag-DIP /person (nur wenn DIP_API_KEY gesetzt) — Bundestag-Stammdaten
//      als Quervergleich/Anreicherung (Wahlperiode, Namensvarianten). Best effort.
//
// Rueckgabe im INTERNEN camelCase-Profilshape (wie storage.fromMandateProfileRow /
// provisioning.buildProfile), damit Screen 3 direkt bindet und der Client das
// Ergebnis unveraendert per PATCH /api/profile/current uebernehmen kann.
//
// Fail-safe wie jeder externe Lesepfad im Repo (vgl. dip.js): jeder Netzfehler wird
// gefangen, nie geworfen; die vier Fehlerpfade werden als Status kommuniziert:
//   found | ambiguous | not_found | source_down   (+ Landtag-Vorbehalt als warning).

const { normalizeParty, normalizeCommittee } = require("./matching");

const AW_BASE = "https://www.abgeordnetenwatch.de/api/v2";
const DIP_BASE = "https://search.dip.bundestag.de/api/v1";
const LOOKUP_TIMEOUT_MS = Number(process.env.MANDATE_LOOKUP_TIMEOUT_MS || 6500);

function dipApiKey() {
  return process.env.DIP_API_KEY || "";
}
function isDipEnabled() {
  return Boolean(dipApiKey());
}

// --- Netz: native fetch mit AbortController-Timeout, immer JSON, nie werfen ---
// (dip.js nutzt bare fetch ohne Timeout; hier haerten wir den neuen, nutzergetriebenen
//  Pfad mit einem harten Timeout, damit der Scan-Screen nie unbegrenzt haengt.)
// Klassifizierter Netzfehler: unterscheidet einen ECHTEN technischen Ausfall
// (Netz/Timeout/5xx -> Quelle unerreichbar) von einer inhaltlichen Ablehnung
// (4xx -> unsere Query/Parameter passt nicht; die Quelle IST erreichbar). Genau
// diese Verwechslung war die Ursache der falschen „Quellen nicht erreichbar"-
// Meldung: ein 4xx auf eine schlechte Filter-Query wurde als Netzausfall gewertet.
class LookupFetchError extends Error {
  constructor(message, kind, status) {
    super(message);
    this.name = "LookupFetchError";
    this.kind = kind; // "network" | "server" | "client" | "unavailable"
    this.status = status || 0;
  }
}

async function fetchJson(url, { timeoutMs = LOOKUP_TIMEOUT_MS } = {}) {
  if (typeof fetch !== "function") throw new LookupFetchError("fetch-unavailable", "unavailable");
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let response;
  try {
    response = await fetch(url, {
      signal: controller ? controller.signal : undefined,
      headers: { accept: "application/json", "user-agent": "HelmutBot/1.0 mandate-lookup" }
    });
  } catch (error) {
    // Reject/Abort/Timeout/DNS -> echter technischer Ausfall.
    throw new LookupFetchError("network", "network");
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!response.ok) {
    const kind = response.status >= 500 ? "server" : "client"; // 5xx = Ausfall, 4xx = Query-Ablehnung
    throw new LookupFetchError(`http-${response.status}`, kind, response.status);
  }
  return await response.json();
}
// Verbindliche HTTP-/Fehler-Klassifikation der Mandatssuche auf EINEN internen
// Status. GRUNDREGEL: KEIN Nicht-200 wird jemals not_found — ein 401/403/429/4xx/
// 5xx/Netz/Timeout beweist NICHT, dass die Person nicht existiert. not_found
// entsteht AUSSCHLIESSLICH aus einer erfolgreichen 200-Antwort mit leerer
// Trefferliste (siehe lookupMandate). Die Zustände bleiben getrennt, damit
// Telemetrie/Debugging/Wiederholung korrekt funktionieren.
//   200 leer            -> not_found        (nur hier!)
//   400 / 422 / sonst 4xx -> invalid_request (Query/Parameter abgelehnt, Quelle erreichbar)
//   401 / 403           -> access_denied     (AW/Proxy/Sicherheitsregel/Egress blockt)
//   429                 -> rate_limited      (Drosselung)
//   5xx / Netz / Timeout -> source_down       (technischer Ausfall)
function classifyLookupError(error) {
  const status = error && typeof error.status === "number" ? error.status : 0;
  const kind = error && error.kind;
  if (kind === "network" || kind === "unavailable") return "source_down"; // Netz/Abbruch/Timeout/kein fetch
  if (status >= 500) return "source_down";
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "access_denied";
  if (status >= 400) return "invalid_request"; // 400/422 und sonstige 4xx
  return "source_down"; // unbekannte Ausnahme: konservativ technischer Ausfall, NIE Nichtexistenz
}
// Diese Fehlstatus sind KEINE Nichtexistenz — der Client zeigt denselben ruhigen
// Hilfezustand, aber intern bleiben sie unterscheidbar (Telemetrie/Debugging/Retry).
const LOOKUP_FAILURE_STATUSES = ["invalid_request", "access_denied", "rate_limited", "source_down"];
// Aussagekräftigsten Fehler über mehrere Query-Formen wählen (source_down am
// höchsten: ein Infra-Ausfall irgendwo ist die konservativste Einschätzung).
const LOOKUP_SEVERITY = { source_down: 4, access_denied: 3, rate_limited: 2, invalid_request: 1 };
function moreSevereError(a, b) {
  if (!a) return b;
  if (!b) return a;
  return (LOOKUP_SEVERITY[classifyLookupError(b)] || 0) > (LOOKUP_SEVERITY[classifyLookupError(a)] || 0) ? b : a;
}

function firstStr(...values) {
  for (const v of values) {
    const s = v == null ? "" : String(v).trim();
    if (s) return s;
  }
  return "";
}

// "Katrin Vogt, MdB" / Titel abstreifen -> Kernname fuer Suche + Namensvarianten.
function cleanName(raw) {
  return String(raw || "")
    .replace(/\b(mdb|mdl|dr|prof|prof\.?\s*dr)\b\.?/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;·-]+|[\s,;·-]+$/g, "") // Titel-/Zusatz-Reste (", MdB") kappen
    .trim();
}

// Ebene aus einem Parlaments-/Parlamentsperioden-Label ableiten (AW).
function levelFromParliamentLabel(label) {
  const l = String(label || "").toLowerCase();
  if (l.includes("bundestag")) return "Bundestag";
  if (l.includes("landtag") || l.includes("abgeordnetenhaus") || l.includes("buergerschaft") ||
      l.includes("bürgerschaft") || l.includes("landesparlament")) return "Landtag";
  return "";
}

// Bundesland aus einem Landtags-Parlamentslabel ("Landtag Niedersachsen",
// "Abgeordnetenhaus von Berlin", "Bürgerschaft Hamburg") herausloesen.
const BUNDESLAENDER = [
  "Baden-Württemberg", "Bayern", "Berlin", "Brandenburg", "Bremen", "Hamburg", "Hessen",
  "Mecklenburg-Vorpommern", "Niedersachsen", "Nordrhein-Westfalen", "Rheinland-Pfalz",
  "Saarland", "Sachsen-Anhalt", "Sachsen", "Schleswig-Holstein", "Thüringen"
];
function stateFromParliamentLabel(label) {
  const l = String(label || "");
  for (const land of BUNDESLAENDER) {
    if (l.includes(land)) return land;
  }
  return "";
}

// --- Abgeordnetenwatch v2 ----------------------------------------------------
function awMapPolitician(p) {
  return {
    id: p && p.id,
    label: firstStr(p && p.label, p && [p.first_name, p.last_name].filter(Boolean).join(" ")),
    firstName: firstStr(p && p.first_name),
    lastName: firstStr(p && p.last_name),
    party: firstStr(p && p.party && p.party.label),
    yearOfBirth: p && p.year_of_birth ? String(p.year_of_birth) : ""
  };
}

async function awSearchPoliticians(name) {
  const cleaned = cleanName(name);
  const tokens = cleaned.toLowerCase().split(/\s+/).filter((t) => t.length >= 2);
  const lastToken = tokens.length ? tokens[tokens.length - 1] : cleaned.toLowerCase();
  // AW v2 filtert die EIGENEN Felder eines Listen-Endpoints direkt (last_name[cn]).
  // Der frühere `politician[label][cn]`-Präfix ist für RELATIONS-Filter gedacht und
  // war die Ursache der 4xx-Fehlklassifikation — hier nur noch als Fallback.
  const queries = [
    `${AW_BASE}/politicians?last_name[cn]=${encodeURIComponent(lastToken)}&range_end=100`,
    `${AW_BASE}/politicians?politician[label][cn]=${encodeURIComponent(cleaned)}&range_end=100`
  ];
  let anySuccess = false;
  let worstError = null;
  const byId = new Map();
  for (const url of queries) {
    let json;
    try {
      json = await fetchJson(url);
      anySuccess = true;
    } catch (error) {
      worstError = moreSevereError(worstError, error); // JEDEN Fehlversuch merken (4xx/403/429/5xx/Netz)
      continue; // nächste Query-Form probieren
    }
    const rows = Array.isArray(json && json.data) ? json.data : [];
    for (const raw of rows) {
      const p = awMapPolitician(raw);
      if (p.id && p.label && !byId.has(String(p.id))) byId.set(String(p.id), p);
    }
    if (byId.size) break; // Treffer aus der robusten Query genügen
  }
  // Hat KEINE Query eine 200-Antwort geliefert, hat die Quelle NICHT sauber
  // geantwortet -> repräsentativen Fehler werfen (lookupMandate klassifiziert ihn).
  // NIEMALS als leeres Ergebnis (not_found) ausgeben. Kam mindestens eine 200 an
  // (anySuccess), ist eine leere Trefferliste eine echte Nichtexistenz.
  if (!anySuccess && worstError) throw worstError;
  const mapped = [...byId.values()];
  // Clientseitiger Namensfilter: jedes Namens-Token muss im Label vorkommen —
  // liefert nie fremde Personen; greift ein Serverfilter nicht, bleibt es not_found.
  if (!tokens.length) return mapped;
  return mapped.filter((p) => {
    const hay = cleanName(p.label).toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}

// Einen konkreten AW-Politiker per id laden (nach Disambiguierung auf S2) — liefert
// insbesondere die Partei, die die Auswahlliste angezeigt hat.
async function awGetPolitician(id) {
  const json = await fetchJson(`${AW_BASE}/politicians/${encodeURIComponent(id)}`);
  const p = json && json.data; // /politicians/{id} liefert EIN Objekt, keine Liste
  if (!p || Array.isArray(p) || !p.id) return null;
  return awMapPolitician(p);
}

// Neuestes Mandat eines Politikers (Fraktion, Wahlkreis, Ebene, Bundesland).
async function awMandateFor(politicianId) {
  const url = `${AW_BASE}/candidacies-mandates?politician[entity.id]=${encodeURIComponent(politicianId)}` +
    `&type=mandate&sort_by=id&sort_direction=desc&range_end=20`;
  const json = await fetchJson(url);
  const rows = Array.isArray(json && json.data) ? json.data : [];
  if (!rows.length) return null;
  // Neuestes zuerst (sort_direction=desc); erstes verwertbares Mandat nehmen.
  const m = rows[0];
  const parliamentLabel = firstStr(
    m && m.parliament_period && m.parliament_period.label,
    m && m.parliament_period && m.parliament_period.parliament && m.parliament_period.parliament.label
  );
  const fraction = Array.isArray(m && m.fraction_membership) && m.fraction_membership.length
    ? firstStr(m.fraction_membership[0] && m.fraction_membership[0].fraction && m.fraction_membership[0].fraction.label)
    : "";
  const constituency = firstStr(
    m && m.electoral_data && m.electoral_data.constituency && m.electoral_data.constituency.label
  );
  return {
    parliamentLabel,
    level: levelFromParliamentLabel(parliamentLabel),
    state: stateFromParliamentLabel(parliamentLabel),
    faction: fraction.replace(/^Fraktion\s+/i, "").trim(),
    constituency: constituency.replace(/^Wahlkreis\s+\d*\s*/i, "").trim()
  };
}

// Ausschuss-Mitgliedschaften; dedupliziert ueber normalizeCommittee (Normalisierung
// wie im Repo). Ordentliche vs. stellvertretende, wenn AW es liefert.
async function awCommitteesFor(politicianId) {
  const url = `${AW_BASE}/committee-memberships?politician[entity.id]=${encodeURIComponent(politicianId)}&range_end=50`;
  const json = await fetchJson(url);
  const rows = Array.isArray(json && json.data) ? json.data : [];
  const seen = new Set();
  const committees = [];
  const deputy = [];
  for (const row of rows) {
    const label = firstStr(row && row.committee && row.committee.label);
    if (!label) continue;
    const key = normalizeCommittee(label) || label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const role = String((row && row.committee_role) || "").toLowerCase();
    const isDeputy = role.includes("stellv") || role.includes("deput");
    (isDeputy ? deputy : committees).push(label.replace(/^Ausschuss\s+f(ü|ue)r\s+/i, "").trim());
  }
  return { committees, deputyCommittees: deputy };
}

// Vollprofil fuer einen konkreten AW-Politiker zusammenbauen (Mandat + Ausschuesse
// best effort; jeder Teilausfall degradiert, wirft nie).
async function awBuildProfile(candidate, requestedLevel, warnings) {
  // Kernmandat (bestimmt Ebene/Fraktion/Wahlkreis): JEDER Fetch-Fehler (Netz/5xx/
  // 4xx/403/429) darf NICHT still zu einem hohlen „found" degradieren — sonst
  // verbürge sich ein Quellen-Problem als leeres, aber „gefundenes" Profil.
  // Deshalb den Fehler weiterreichen (-> lookupMandate klassifiziert ihn:
  // source_down/access_denied/…). awMandateFor liefert bei einer LEEREN, aber
  // erfolgreichen 200-Antwort null (kein Mandat hinterlegt) und wirft NICHT —
  // dieser Fall bleibt gültig „found".
  const mandate = await awMandateFor(candidate.id);
  // Ausschüsse sind OPTIONAL — ihr Fehlen führt niemanden in die Irre; hier
  // bewusst best effort (auch ein technischer Ausfall degradiert nur die Liste).
  const committees = await awCommitteesFor(candidate.id).catch(() => ({ committees: [], deputyCommittees: [] }));
  const level = firstStr(mandate && mandate.level, requestedLevel);
  const parliamentType = /landtag/i.test(level) ? "Landtag" : (/bundestag/i.test(level) ? "Bundestag" : "");
  if (parliamentType === "Landtag") {
    // Landtag-Vorbehalt (README/Uebergabe): Personendaten liefert AW, aber die
    // laufenden Crawl-/Nachrichtenquellen fuer Landtage sind noch im Aufbau, und
    // die Ausschuss-Normalisierung (matching.js) ist Bundestags-getunt.
    warnings.push("landtag-quellen-im-aufbau");
  }
  const partyLabel = firstStr(candidate.party);
  const factionLabel = firstStr(mandate && mandate.faction, partyLabel);
  const cleaned = cleanName(candidate.label);
  const profile = {
    fullName: cleaned,
    party: partyLabel,
    faction: factionLabel,
    parliamentType,
    politicalLevel: parliamentType === "Landtag" ? "Land" : (parliamentType === "Bundestag" ? "Bund" : ""),
    constituency: firstStr(mandate && mandate.constituency),
    state: firstStr(mandate && mandate.state),
    committees: committees.committees || [],
    deputyCommittees: committees.deputyCommittees || [],
    nameVariants: cleaned && cleaned !== candidate.label ? [candidate.label] : [],
    // Herkunftsmarkierung (landet verlustfrei in profil_extras) — reine Anzeige/Provenienz.
    mandateSource: "abgeordnetenwatch",
    mandateSourceId: String(candidate.id)
  };
  return profile;
}

function toCandidateSummary(c) {
  return {
    id: String(c.id),
    name: cleanName(c.label),
    party: firstStr(c.party),
    hint: firstStr(c.yearOfBirth ? `geb. ${c.yearOfBirth}` : "")
  };
}

// --- Bundestag-DIP /person (nur mit API-Key; Anreicherung, best effort) -------
async function dipPersonEnrich(name) {
  if (!isDipEnabled()) return null;
  const params = new URLSearchParams({ apikey: dipApiKey(), "f.person": name, format: "json" });
  const json = await fetchJson(`${DIP_BASE}/person?${params.toString()}`);
  const rows = Array.isArray(json && json.documents) ? json.documents : [];
  if (!rows.length) return null;
  const p = rows[0];
  const roles = Array.isArray(p && p.person_roles) ? p.person_roles : [];
  const role = roles[0] || {};
  return {
    fullName: firstStr(p && p.vorname && `${p.vorname} ${p.nachname}`, p && p.nachname),
    faction: firstStr(role.fraktion),
    wahlperioden: Array.isArray(p && p.wahlperiode) ? p.wahlperiode.map(String) : []
  };
}

// --- Hauptfunktion -----------------------------------------------------------
// opts: { name, level, id }. id -> gezielter Abruf EINES AW-Kandidaten (nach
//        Disambiguierung auf Screen 2), sonst Namenssuche.
async function lookupMandate(opts = {}) {
  const rawName = firstStr(opts.name, opts.q);
  const name = cleanName(rawName);
  const requestedLevel = firstStr(opts.level);
  const forcedId = firstStr(opts.id);
  const sources = { abgeordnetenwatch: false, bundestag: false };
  const warnings = [];

  if (!forcedId && name.length < 2) {
    return { status: "not_found", profile: null, candidates: [], sources, warnings, query: rawName };
  }

  // 1) Gezielter Abruf nach Disambiguierung: Politiker-Detail laden (Partei!),
  //    Fallback auf das übergebene Minimum, falls das Detail nicht erreichbar ist.
  if (forcedId) {
    try {
      const detail = await awGetPolitician(forcedId).catch(() => null);
      const candidate = detail || { id: forcedId, label: name || forcedId, party: "" };
      const profile = await awBuildProfile(candidate, requestedLevel, warnings);
      sources.abgeordnetenwatch = true;
      await enrichWithDip(profile, name, sources, warnings);
      return { status: "found", profile, candidates: [], sources, warnings, query: rawName };
    } catch (error) {
      return { status: classifyLookupError(error), sourceStatus: (error && error.status) || 0, profile: null, candidates: [], sources, warnings, query: rawName };
    }
  }

  // 2) Namenssuche ueber Abgeordnetenwatch.
  let candidates = [];
  let failureStatus = "";
  let failureHttp = 0;
  try {
    candidates = await awSearchPoliticians(name);
    sources.abgeordnetenwatch = true;
  } catch (error) {
    // Jeder Fehlversuch wird verbindlich klassifiziert (invalid_request /
    // access_denied / rate_limited / source_down). KEIN Fehler wird zu not_found —
    // ein Nicht-200 beweist nicht die Nichtexistenz der Person.
    failureStatus = classifyLookupError(error);
    failureHttp = (error && error.status) || 0;
  }

  // Fehlversuch (technisch/blockiert/abgelehnt/gedrosselt) -> KLAR getrennt von
  // „kein Treffer". Der Client zeigt in allen Fällen denselben ruhigen
  // Hilfezustand; der Status bleibt intern erhalten (Telemetrie/Debugging/Retry).
  if (failureStatus) {
    return { status: failureStatus, sourceStatus: failureHttp, profile: null, candidates: [], sources, warnings, query: rawName };
  }

  // Nichts gefunden -> AUSSCHLIESSLICH aus einer erfolgreichen, aber leeren
  // Trefferliste (manuelle Eingabe, Fehlerpfad 1).
  if (!candidates.length) {
    return { status: "not_found", profile: null, candidates: [], sources, warnings, query: rawName };
  }

  // Optionale Ebenen-Vorfilterung nur, wenn dadurch nicht alles wegfaellt.
  // Exakter Namenstreffer entscheidet Eindeutigkeit; sonst Auswahlliste.
  const exact = candidates.filter((c) => cleanName(c.label).toLowerCase() === name.toLowerCase());
  const pool = exact.length ? exact : candidates;

  // Mehrdeutig -> Auswahlliste (Fehlerpfad 2). Nach Normalisierung dedupliziert,
  // damit dieselbe Person aus zwei Datensaetzen nicht doppelt erscheint.
  if (pool.length > 1) {
    const seen = new Set();
    const unique = [];
    for (const c of pool) {
      // Nur wirklich IDENTISCHE Personen zusammenfassen. MIT Geburtsjahr ist
      // Name|Partei|Jahr ein sicherer Schlüssel (dieselbe Person aus zwei
      // Datensätzen). OHNE Geburtsjahr NICHT über verschiedene Datensätze hinweg
      // zusammenfassen (nach id schlüsseln) — sonst würden zwei echte, gleich
      // benannte Personen still zu einer verschmolzen und eine davon fälschlich
      // auto-gewählt statt zur Auswahl gestellt (kein stilles Raten).
      const key = c.yearOfBirth
        ? `${c.label.toLowerCase()}|${normalizeParty(c.party)}|${c.yearOfBirth}`
        : `id:${String(c.id)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(c);
    }
    if (unique.length > 1) {
      return { status: "ambiguous", profile: null, candidates: unique.slice(0, 12).map(toCandidateSummary), sources, warnings, query: rawName };
    }
    pool.length = 0;
    pool.push(unique[0]);
  }

  // Eindeutig -> Vollprofil bauen (+ DIP-Anreicherung).
  try {
    const profile = await awBuildProfile(pool[0], requestedLevel, warnings);
    await enrichWithDip(profile, name, sources, warnings);
    return { status: "found", profile, candidates: [], sources, warnings, query: rawName };
  } catch (error) {
    // Treffer stand fest, aber der Mandat-Abruf scheiterte -> verbindlich
    // klassifizieren (NIE als leeres/hohles „found" oder als Nichtexistenz).
    return { status: classifyLookupError(error), sourceStatus: (error && error.status) || 0, profile: null, candidates: [], sources, warnings, query: rawName };
  }
}

// DIP-Quervergleich (nur Bundestag, nur mit Key): fehlende Fraktion/Namensvarianten
// ergaenzen, ohne die AW-Werte (kanonisch) zu ueberschreiben. Best effort.
async function enrichWithDip(profile, name, sources, warnings) {
  if (!isDipEnabled()) return;
  if (profile.parliamentType && profile.parliamentType !== "Bundestag") return;
  try {
    const dip = await dipPersonEnrich(name);
    if (!dip) return;
    sources.bundestag = true;
    if (!profile.faction && dip.faction) profile.faction = dip.faction;
    if (!profile.fullName && dip.fullName) profile.fullName = dip.fullName;
  } catch (error) {
    // SICHERHEIT (wie dip.js): nur Message-loses Verschlucken — die URL traegt den apikey.
  }
}

module.exports = {
  lookupMandate,
  // fuer Tests / Wiederverwendung:
  levelFromParliamentLabel,
  stateFromParliamentLabel,
  cleanName,
  toCandidateSummary,
  classifyLookupError,
  LOOKUP_FAILURE_STATUSES
};
