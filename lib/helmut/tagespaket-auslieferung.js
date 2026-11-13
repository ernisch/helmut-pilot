"use strict";

// Der normale App-Leser liest das bestaetigte Tagesergebnis. Er kennt weder
// Ranking, Quellenabruf noch Modelle. Historische Belege bleiben unveraendert.
const B = require("./briefing-speicher");
const F = require("./briefing-frische");
const L = require("./briefing-lauf");
const P = require("./publication-eligibility");
const E = require("./lage-quellenbeleg");

function sicherheitsHash(env = process.env) {
  const domains = key => [...new Set(String(env[key] || "").split(",")
    .map(v => v.trim().toLowerCase()).filter(Boolean))].sort();
  return B.hash({ blocklist: domains("HELMUT_SOURCE_BLOCKLIST"), allowlist: domains("HELMUT_SOURCE_ALLOWLIST") });
}
function vorgangIds(value, out = new Set()) {
  if (!value || typeof value !== "object") return out;
  for (const [key, v] of Object.entries(value)) {
    if (key === "tagespaketGrundlage" || key === "vorherigerStand") continue;
    if (["vorgangId", "vorgang_id", "primaryVorgangId"].includes(key) && typeof v === "string") out.add(v);
    else if (["relatedVorgangIds", "vorgangIds", "vorgang_ids"].includes(key) && Array.isArray(v)) {
      for (const id of v) if (typeof id === "string") out.add(id);
    }
    else if (v && typeof v === "object") vorgangIds(v, out);
  }
  return out;
}
function grundlage(briefing, kos) {
  const ids = vorgangIds(briefing);
  return (kos || []).filter(k => k && ids.has(k.vorgang_id))
    .map(k => ({ id: k.id, vorgang_id: k.vorgang_id })).sort((a,b) => a.id.localeCompare(b.id));
}
function quellenStand(payload, sicherheit = sicherheitsHash()) {
  const abhaengigkeiten = new Map();
  for (const dep of [...(payload.briefing?.tagespaketGrundlage || []),
    ...(payload.lageAnsicht?.tagespaketGrundlage || [])]) {
    if (abhaengigkeiten.has(dep.id) && abhaengigkeiten.get(dep.id).vorgang_id !== dep.vorgang_id)
      throw new Error("tagespaket-publikationsbindung-abweichend");
    abhaengigkeiten.set(dep.id, dep);
  }
  return { version: 1, briefingHash: B.hash(payload.briefing),
    lageQuellenHash: payload.lage?.quellenHash || null,
    lageAnsichtHash: B.hash(payload.lageAnsicht ?? null),
    vorgaenge: [...vorgangIds({ briefing: payload.briefing, lage: payload.lage, ansicht: payload.lageAnsicht })].sort(),
    abhaengigkeiten: [...abhaengigkeiten.values()].sort((a,b) => a.id.localeCompare(b.id)),
    sicherheitsHash: sicherheit, publicationPolicy: payload.briefing?.publicationEligibilityPolicy || null };
}
function leer(profile, reason, now) {
  const briefing = require("./briefingContract").toBriefingContractV3({ profile, decisions: [],
    kosById: {}, sourcesByVorgang: {}, reason: "store-error", now });
  return { ...briefing, reason, generatedAt: null,
    paketStatus: { zustand: "fehlt", grund: reason, tag: F.berlinTagKey(now), vollstaendig: false },
    lageBriefing: { available: false, reason, paragraphs: [], vorgaenge: [], generatedAt: null } };
}
function datenstand(payload) {
  let latest = null;
  function walk(value) {
    if (!value || typeof value !== "object") return;
    for (const [key, v] of Object.entries(value)) {
      if (key === "vorherigerStand") continue;
      if (["publishedAt", "published_at", "veroeffentlichtAm"].includes(key)
        && typeof v === "string" && Number.isFinite(Date.parse(v)) && (!latest || Date.parse(v) > Date.parse(latest))) latest = v;
      else if (v && typeof v === "object") walk(v);
    }
  }
  walk({ briefing: payload.briefing, quellen: payload.lage?.quellen, ansicht: payload.lageAnsicht });
  return latest;
}
async function pruefeSperren(payload, storage, policy) {
  P.assertRecorded(payload.briefing?.publicationEligibilityPolicy, policy);
  if (payload.quellenStand ? payload.quellenStand.sicherheitsHash !== sicherheitsHash()
    : !P.sourceSafetyStandard({ hash: null })) throw new Error("tagespaket-quellenschutz-geaendert");
  if (!policy.hash) return;
  const stand = payload.quellenStand, deps = stand?.abhaengigkeiten;
  // Eine aktive Publikationssperre bleibt auch nach neuen Quellenverknuepfungen
  // verbindlich. Nur die gebundenen IDs nachlesen, niemals den Korpus auswerten.
  if (!Array.isArray(deps) || deps.length > 500 || stand.vorgaenge.some(v => !deps.some(d => d.vorgang_id === v)))
    throw new Error("tagespaket-publikationsbindung-fehlt");
  const docs = await storage.getPublicationSourceIdentities(deps);
  P.assertSame(policy);
  for (const d of deps) {
    if (!Array.isArray(docs[d.id]) || P.held(d, docs[d.id], policy))
      throw new Error("tagespaket-publikation-zurueckgehalten");
  }
}
async function lese({ userId, profile, storage = require("./storage"), now = new Date() }) {
  storage.assertTenant(userId, "tagespaketAusliefern");
  if (!profile || profile.id !== userId) throw new Error("tagespaket-profil-abweichend");
  const day = F.berlinTagKey(now);
  let row;
  try { row = await B.lese({ userId, profile, day, storage }); }
  catch { return { briefing: leer(profile, "tagespaket-nicht-bestaetigt", now), frischeKontext: null }; }
  if (!row) return { briefing: leer(profile, "tagespaket-fehlt", now), frischeKontext: null };
  try {
    if (F.berlinTagKey(row.generated_at) !== day || F.berlinTagKey(row.payload.erzeugtAm) !== day
      || Date.parse(row.generated_at) > new Date(now).getTime()) throw new Error("tagespaket-zeit-abweichend");
    await pruefeSperren(row.payload, storage, P.current());
  } catch { return { briefing: leer(profile, "tagespaket-quellenstand-nicht-bestaetigt", now), frischeKontext: null }; }
  const p = row.payload, check = B.pruefeInhalt(p.briefing, p.lage, p.lageAnsicht);
  const textGueltig = E.gespeicherterTextGueltig(p.lage);
  const vollstaendig = check.strukturellVollstaendig && textGueltig;
  const lage = structuredClone(p.lageAnsicht || B.lageAusgabe(p.lage));
  // Unbestaetigte Narrativtexte werden nicht durch die Speicherung verifiziert.
  // Die vorher bereits geprueften Vorgangskarten bleiben bei Teilausfaellen da.
  if (lage && !textGueltig) {
    lage.paragraphs = []; lage.pendingNarrative = true;
  } else if (lage) {
    lage.paragraphs = B.lageAusgabe(p.lage).paragraphs;
  }
  const receipt = await L.ladeTageslauf(storage, userId, day);
  const bound = receipt.lauf && require("./briefing-ausgabebeleg").passt(receipt.lauf.ausgabeBeleg, row);
  const stand = datenstand(p);
  const briefing = { ...structuredClone(p.briefing), lageBriefing: lage,
    paketStatus: { zustand: vollstaendig ? "gespeichert" : "teilweise",
      tag: day, vollstaendig, fehler: textGueltig ? check.fehler : [...check.fehler, "lage-quellenbindung-fehlt"],
      quittungGebunden: Boolean(bound), quellenStand: p.quellenStand || quellenStand(p),
      fachlicheVollabnahme: false },
    gespeicherterNachweis: { id: row.id, erzeugtAm: row.generated_at, inhaltHash: p.inhaltHash,
      profilHash: p.profilHash, profilbindung: B.profilBindungsstand(row), auswahl: "aktuell", pruefung: p.pruefung } };
  return { briefing, frischeKontext: { jetzt: now, berlinTag: day, lauf: bound ? receipt.lauf : null,
    datenstand: stand, fenster: F.frischeFenster({ jetzt: now, letzterErfolgAt: receipt.lauf?.fensterStart }),
    speicherFehler: receipt.fehler || (!bound ? "tagespaket-quittung-fehlt" : null) } };
}
module.exports = { sicherheitsHash, vorgangIds, grundlage, quellenStand, datenstand, lese };
