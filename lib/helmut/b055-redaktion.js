"use strict";

// Ein neuer, hashgebundener Redaktionsauftrag. Kein Retry des abgeschlossenen
// Einzelversuchs: nur dessen konkret korrigierter Wortlaut wird erneut geprueft.
const B = require("./briefing-speicher");
const K = require("./testkosten-budget");
const D = require("./testkohorte-direkt500");
const L = require("./lage-quellenbeleg");
const Q = require("./lage-textqualitaet");
const E = require("./lage-entwurfsbeleg");
const { isDeepStrictEqual: gleich } = require("node:util");
const standHash = row => require("./briefing-profilkontext").standHash(row);
// PostgREST darf denselben Zeitpunkt als +00:00 statt Z zurueckgeben.
// Inhalt und Identitaet bleiben exakt gebunden; andere Zeitpunkte bleiben Fehler.
const gleicheZeile = (a, b) => Boolean(a && b && a.id === b.id && a.user_id === b.user_id && a.slot === b.slot
  && Number.isFinite(Date.parse(a.generated_at)) && Date.parse(a.generated_at) === Date.parse(b.generated_at)
  && gleich(a.payload, b.payload));
const fordere = ok => { if (!ok) throw new Error("b055-redaktion-nicht-bestaetigt"); };

async function pruefeBasis({ c, get, storage, profile, now }) {
  const C = require("./b055-einzelabschluss"), r = c.redaktion;
  storage.assertTenant(c.userId, "b055Redaktion");
  fordere(c.version === 3 && c.userId === C.MANDAT && profile.id === C.MANDAT
    && profile.profileActive === false && r && /^nachlauf500-[0-9]{5,20}$/.test(r.runId || "")
    && r.runId !== c.runId && typeof r.grund === "string" && r.grund.length >= 20 && r.grund.length <= 2000
    && [r.startHash, r.entwurfHash, r.lageHash, r.briefingHash].every(x => /^[a-f0-9]{64}$/.test(x || ""))
    && Number.isSafeInteger(r.costMicroUsd) && r.costMicroUsd >= 0);
  const [starts, runs, auth, lage, briefing, entwurf] = await Promise.all([
    get(`briefings?select=*&user_id=eq.${c.userId}&id=eq.${C.START_NEU}&limit=2`),
    get(`process_runs?select=*&process=eq.briefing-einzelabschluss&run_id=eq.${r.runId}&limit=2`),
    get("helmut_store?select=data&id=eq.main-auth&limit=2"),
    storage.getRenderedBriefingV3(c.userId, "lage", c.tag, { strict: true }),
    storage.getRenderedBriefingV3(c.userId, B.SLOT, c.tag, { strict: true }),
    storage.getLageEntwurfsbeleg(c.userId, `bf-${c.userId}-${E.SLOT}-${c.tag}-${r.runId}-entwurf`)
  ]);
  fordere(starts.length === 1 && B.hash(starts[0]) === r.startHash && starts[0].payload.runId === r.runId
    && runs.length === 1 && runs[0].status === "success" && runs[0].target_count === 1 && runs[0].saved_count === 1
    && Number.isFinite(Date.parse(runs[0].finished_at)) && Date.parse(runs[0].finished_at) <= now.getTime()
    && auth.length === 1 && lage && briefing && entwurf);
  const book = K.pruefeTag(auth[0].data[K.KEY]?.[c.utcTag], c.utcTag);
  const costs = Object.values(book.calls).filter(x => x.bezug?.runId === r.runId);
  fordere(costs.length === 2 && costs.every(x => x.status === "abgerechnet" && x.bezug.mandatHash === D.hash(c.userId))
    && gleich(costs.map(x => x.bezug.phase).sort(), ["entwurf", "pruefung"])
    && costs.reduce((sum, x) => sum + x.cost, 0) === r.costMicroUsd);
  B.pruefeZeile(briefing, { userId: c.userId, day: c.tag, profile });
  const { inhaltHash, ...inhalt } = entwurf.payload;
  fordere(inhaltHash === r.entwurfHash && inhaltHash === B.hash(inhalt)
    && entwurf.user_id === c.userId && entwurf.payload.runId === r.runId && entwurf.payload.phase === "entwurf"
    && entwurf.payload.profilHash === B.profilHash(profile)
    && standHash(lage) === r.lageHash && standHash(briefing) === r.briefingHash
    && L.gespeicherterTextGueltig(lage.payload) && gleich(lage.payload, briefing.payload.lage)
    && lage.payload.briefingEingabeHash === c.urteil.eingabeHash
    && gleich(entwurf.payload.quellen, lage.payload.quellen));
  const alt = entwurf.payload.antwort.paragraphs, neu = r.antwort?.paragraphs;
  fordere(Array.isArray(alt) && Array.isArray(neu) && alt.length === neu.length
    && gleich(alt.map(p => p.text), lage.payload.paragraphs.map(p => p.text))
    && !gleich(alt, neu) && JSON.stringify(r.antwort).length <= 24000);
  for (let i = 0; i < alt.length; i++) {
    const { text: a, ...ma } = alt[i], { text: b, ...mb } = neu[i];
    fordere(gleich(ma, mb) && typeof b === "string" && b.trim().length > 0);
  }
  fordere(require("./ai").assembleLageParagraphs(r.antwort, lage.payload.quellen, profile).length === neu.length);
  return { lage, briefing, entwurf };
}

async function ausfuehren({ c, get, storage, profile, now, beforeReview, beforeSave, generate }) {
  const basis = await pruefeBasis({ c, get, storage, profile, now: now() });
  const quellen = basis.lage.payload.quellen;
  let review;
  const beleg = (phase, antwort) => E.speichere({ userId: c.userId, runId: c.runId, phase,
    antwort, quellen, profile, now: now() }, storage);
  const gen = await (generate || require("./ai").generateLageBriefing)(quellen, profile, {
    politicianId: c.userId, runId: c.runId, gespeicherterEntwurf: c.redaktion.antwort,
    onDraft: antwort => beleg("entwurf", antwort), beforeReview,
    onReview: async antwort => { review = antwort; await beleg("pruefung", antwort); }
  });
  const raw = require("./ai").assembleLageParagraphs(c.redaktion.antwort, quellen, profile);
  const checked = Q.pruefe(raw, quellen, review, profile);
  fordere(checked.ok === true && gen && gleich(gen.paragraphs, checked.paragraphs));
  await beforeSave();
  // Jede Ausgabe bleibt bis zur positiven echten Pruefung unveraendert.
  const frisch = await pruefeBasis({ c, get, storage, profile, now: now() });
  const stamp = now().toISOString();
  fordere(Date.parse(stamp) > Date.parse(frisch.lage.generated_at)
    && Date.parse(stamp) > Date.parse(frisch.briefing.generated_at));
  const lage = { ...frisch.lage, generated_at: stamp, payload: { ...frisch.lage.payload,
    paragraphs: checked.paragraphs, qualitaet: gen.qualitaet, wordCount: gen.wordCount,
    model: gen.model, generatedAt: stamp, vorherigerStand: frisch.lage,
    redaktion: { version: 1, runId: c.runId, commandHash: B.hash(c), grund: c.redaktion.grund } } };
  fordere(L.gespeicherterTextGueltig(lage.payload));
  const saved = await storage.saveRenderedBriefingV3(lage, { expectedLage: frisch.lage });
  fordere(saved?.saved === true);
  const lageRead = await storage.getRenderedBriefingV3(c.userId, "lage", c.tag, { strict: true });
  fordere(gleicheZeile(lageRead, lage));
  const payload = { ...frisch.briefing.payload, lage: lage.payload, erzeugtAm: stamp,
    vorherigerStand: frisch.briefing, inhaltHash: B.hash({ briefing: frisch.briefing.payload.briefing, lage: lage.payload }),
    pruefung: B.pruefeInhalt(frisch.briefing.payload.briefing, lage.payload) };
  fordere(payload.pruefung.strukturellVollstaendig === true);
  const entry = { ...frisch.briefing, generated_at: stamp, payload };
  B.pruefeZeile(entry, { userId: c.userId, day: c.tag, profile });
  // Enger eigener CAS-Writer fuer diesen geprueften Auftrag; der allgemeine
  // Materialisierer darf vollstaendige Briefings weiterhin nicht ersetzen.
  const vor = await storage.getRenderedBriefingV3(c.userId, B.SLOT, c.tag, { strict: true });
  fordere(vor && standHash(vor) === standHash(frisch.briefing));
  const rows = await storage.tenantRequest(`/rest/v1/briefings?id=eq.${encodeURIComponent(entry.id)}`
    + `&user_id=eq.${encodeURIComponent(c.userId)}&slot=eq.${B.SLOT}`
    + `&generated_at=eq.${encodeURIComponent(vor.generated_at)}&select=*`, c.userId, {
    method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ generated_at: stamp, payload })
  });
  fordere(Array.isArray(rows) && rows.length === 1 && gleicheZeile(rows[0], entry));
  const rueck = await B.lese({ userId: c.userId, day: c.tag, profile, storage });
  fordere(gleicheZeile(rueck, entry));
  return { lage: { available: true, fromCache: false }, briefing: { gespeichert: true, vollstaendig: true,
    id: entry.id, redaktion: true, qualitaetBestanden: false } };
}
module.exports = { pruefeBasis, ausfuehren };
