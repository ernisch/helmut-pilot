"use strict";

// Eigener Offlineablauf: keine Clients, Auth-Schreiber, Aktivierung oder
// Production-Einstiege. Auch ein vollstaendiger lokaler Vertrag ist kein GO.
const P = require("./synthetik-500-profile");
const V = require("./synthetik-500-vertrag");
const S = require("./synthetik-500-startschutz");
const N = require("./synthetik-500-nachweis");
const A = require("./synthetik-500-kosten-admission");
const { performance } = require("node:perf_hooks");
const VERSION = "helmut-synthetik500-executor/1";
const INPUT_VERSION = "helmut-synthetik500-executor-eingaben/1";
const REVIEW_VERSION = "helmut-synthetik500-executor/2";
const REVIEW_INPUT_VERSION = "helmut-synthetik500-executor-eingaben/2";
const ROUTE_VERSION = "helmut-synthetik500-executor/3";
const ROUTE_INPUT_VERSION = "helmut-synthetik500-executor-eingaben/3";
const SIMULATION = "NUR_OFFLINE_FIXTURE_KEINE_PRODUCTION";
const OFFEN = Object.freeze(["vollstaendiger-finanzierter-kostenplan", "planslot-installation-und-routensperren",
  "r-quittung-und-reserve", "tatsaechliche-runtime-und-aktivierungsquittung",
  "separates-aktivierungs-und-500er-test-go", "production-executor-adapter"]);
const fordere = (ok, code) => { if (!ok) throw Error("synthetik500-executor-" + code); };
const exakt = (o, keys) => o && typeof o === "object" && !Array.isArray(o)
  && [Object.prototype, null].includes(Object.getPrototypeOf(o))
  && Object.keys(o).sort().join("|") === [...keys].sort().join("|");
const gleich = (a, b) => P.hash(a) === P.hash(b);
const kopie = x => JSON.parse(JSON.stringify(x));
const istZeit = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(s)
  && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
function einfrieren(x) {
  if (x && typeof x === "object") { Object.values(x).forEach(einfrieren); Object.freeze(x); }
  return x;
}
function offeneEingaben(version = INPUT_VERSION) {
  fordere([INPUT_VERSION, REVIEW_INPUT_VERSION, ROUTE_INPUT_VERSION].includes(version), "eingaben-version");
  return { version, runtimeManifest: null, snapshot: null, sollplan: null, kostenSlot: null, kostenPlan: null };
}
function vorbereite(paket, eingaben = offeneEingaben()) {
  const meta = P.pruefePaket(paket);
  const routed = eingaben?.version === ROUTE_INPUT_VERSION;
  const reviewV2 = eingaben?.version === REVIEW_INPUT_VERSION || routed;
  fordere(exakt(eingaben, ["version", "runtimeManifest", "snapshot", "sollplan", "kostenSlot", "kostenPlan"])
    && (eingaben.version === INPUT_VERSION || reviewV2), "eingaben-format");
  const { runtimeManifest: runtime, snapshot, sollplan, kostenSlot: slot } = eingaben;
  const fehlend = [];
  let nullstand = null;
  if (snapshot !== null) {
    nullstand = V.erzeugeVertrag(P.serialisiere(paket)).pruefeNullbestand(snapshot,
      paket.profile.map(p => p.mandatsId).sort(), paket.profile);
  } else fehlend.push("tatsaechlicher-inaktiver-profilbestand");
  if (runtime !== null) {
    S.pruefeRuntimeManifestFormat(runtime);
    fordere(snapshot !== null, "runtime-ohne-snapshot");
    V.pruefeManifest(runtime.profilvertrag, P.serialisiere(paket), snapshot);
    fordere(runtime.startbelegeGrundlinie.snapshotHash === P.hash(snapshot), "runtime-snapshot-drift");
  } else fehlend.push("tatsaechliches-runtime-manifest");
  if (sollplan !== null) {
    N.pruefeSollplan(sollplan, paket);
    fordere(runtime !== null, "sollplan-ohne-runtime");
    const m = runtime.profilvertrag, b = runtime.startbelegeGrundlinie;
    fordere(sollplan.operationId === m.operationId && sollplan.runtimeManifestHash === P.hash(runtime)
      && sollplan.productionCommit === b.productionCommit && sollplan.deploymentId === b.deploymentId
      && Date.parse(sollplan.startsAt) >= Date.parse(m.vorflugAm)
      && Date.parse(sollplan.startsAt) < Date.parse(m.startBis) && sollplan.endsAt === m.endeAm,
    "sollplan-runtime-drift");
    fordere([sollplan.startsAt, sollplan.endsAt].every(istZeit)
      && sollplan.startsAt.slice(0, 10) === sollplan.endsAt.slice(0, 10), "utc-tag-grenze");
  } else fehlend.push("vorab-gebundener-1500-sollplan");
  let schedule = [];
  if (slot !== null) {
    fordere(slot.version === (routed ? A.ROUTE_VERSION : reviewV2 ? A.REVIEW_VERSION : A.VERSION), "admission-version-opt-in");
    const { p } = A.pruefeSlot(slot);
    if (reviewV2) fordere(Object.keys(slot.draftCompletions).length === 0
      && Object.keys(slot.reviewBindings).length === 0 && slot.reviewBindingsHash === P.hash({}),
    "review-vorbereitung-nicht-leer");
    fordere(Object.keys(slot.consumed).length === 0, "plan-bereits-verbraucht");
    fordere(runtime !== null && sollplan !== null, "kostenplan-ohne-laufbindung");
    fordere(p.operationId === sollplan.operationId && p.productionCommit === sollplan.productionCommit
      && p.runtimeManifestHash === sollplan.runtimeManifestHash
      && p.startsAtUTC === sollplan.startsAt && p.endsAtUTC === sollplan.endsAt, "kostenplan-lauf-drift");
    const ids = paket.profile.map(p => p.mandatsId).sort();
    for (const phase of ["D", "R"]) fordere(gleich(p.intents.filter(x => x.phase === phase).map(x => x.owner).sort(), ids), "kostenplan-500-" + phase.toLowerCase());
    // U zuerst; danach pro Mandat genau D -> R. Ein U-Plan ist keine fachliche
    // Vollstaendigkeitsbescheinigung seiner Dokument-/Versionsmenge.
    const order = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    schedule = [...p.intents.filter(x => x.phase === "U").sort(order),
      ...ids.flatMap(id => ["D", "R"].map(phase => p.intents.find(x => x.phase === phase && x.owner === id)))];
  } else fehlend.push("gebundener-u-d-r-admissionplan");
  const ablaufstrukturVollstaendig = fehlend.length === 0;
  let kostenPlanHash = null;
  if (eingaben.kostenPlan !== null) {
    // Separater Vorbereitungsvertrag aus Bereich A. Keine frei behauptete
    // Vollplan-SHA und keine lokale Kopie eines abweichenden Validators.
    let K;
    try { K = require("./synthetik-500-kosten-plan"); }
    catch { fordere(false, "vollkostenplan-validator-fehlt"); }
    K.pruefe(eingaben.kostenPlan, paket);
    fordere((routed ? [K.ROUTE_VERSION] : reviewV2 ? [K.REVIEW_VERSION, K.ARTICLE_VERSION] : [K.VERSION])
      .includes(eingaben.kostenPlan.version), "vollkostenplan-version-opt-in");
    fordere(slot !== null && eingaben.kostenPlan.admissionCandidate !== null
      && gleich(eingaben.kostenPlan.admissionCandidate, slot), "vollkostenplan-admission-drift");
    kostenPlanHash = eingaben.kostenPlan.planHash;
  } else fehlend.push("vollstaendiger-kostenplan");
  const kern = { version: routed ? ROUTE_VERSION : reviewV2 ? REVIEW_VERSION : VERSION, modus: "private-offline-ablaufvorbereitung", eingaben: kopie(eingaben),
    paketBindung: { paketHash: meta.paketHash, idsHash: meta.idsHash, profileHash: meta.profileHash,
      erwartungenHash: meta.erwartungenHash, verteilung: { ...meta.verteilung } },
    laufBindung: runtime && sollplan && slot ? {
      operationId: sollplan.operationId, runId: slot.plan.runId, productionCommit: sollplan.productionCommit,
      deploymentId: sollplan.deploymentId, runtimeManifestHash: P.hash(runtime), sollplanHash: sollplan.sollplanHash,
      // Das ist der vorhandene Admissionplanhash, keine Vollkostenfreigabe.
      admissionPlanHash: slot.planHash, ...(routed ? { routeContractHash: P.hash(slot.plan.routeContract) } : {}), startsAtUTC: sollplan.startsAt, endsAtUTC: sollplan.endsAt,
      fremdId: nullstand.fremdId, fremdHash: nullstand.fremdHash, profilesHash: nullstand.profilesHash,
      mandateFachHash: nullstand.mandateFachHash } : null,
    erwartetePositionen: paket.profile.flatMap(p => P.BEREICHE.map(bereich => ({ mandatsId: p.mandatsId, bereich }))),
    schedule: kopie(schedule), regeln: { parallelitaet: 1, attemptsJeIntent: 1, paidRetry: false,
      maximalDauerMs: 4 * 3600000, einUtcTag: true, fachvertrag: N.VERSION, erwarteteAusgaben: 1500 },
    kostenPlanHash, ablaufstrukturVollstaendig,
    fehlendeEingaben: fehlend, offeneProductionTore: [...OFFEN,
      ...(reviewV2 ? ["native-immutable-d-storage-und-retention", "restart-resume-nicht-verfuegbar"] : [])],
    strukturVollstaendig: fehlend.length === 0, productionReady: false, startrecht: false,
    modellaufrufe: 0, schreibaufrufe: 0 };
  return { ...kern, executorHash: P.hash(kern) };
}
function pruefe(vorbereitung, paket) {
  fordere([VERSION, REVIEW_VERSION, ROUTE_VERSION].includes(vorbereitung?.version), "vorbereitung-format");
  const e = vorbereite(paket, vorbereitung.eingaben);
  fordere(gleich(vorbereitung, e), "vorbereitung-drift");
  return e;
}
function providerBindung(plan, intent) {
  const common = { runId: plan.runId, model: intent.model, maxOutputTokens: intent.maxOutputTokens,
    actualRequestHash: intent.actualRequestHash,
    admission: { operationId: plan.operationId, planHash: P.hash(plan),
      ...(plan.version === A.ROUTE_PLAN_VERSION ? { routeContractHash: P.hash(plan.routeContract) } : {}) } };
  return intent.phase === "U" ? { ...common, phase: null, vorgangId: intent.vorgangId, contractInputHash: intent.contractInputHash }
    : { ...common, phase: intent.phase === "D" ? "entwurf" : "pruefung", politicianId: intent.owner,
      inputVersionHash: intent.inputVersionHash };
}
function bilanziere(vorbereitung, paket, exportierteDaten = {}) {
  const v = pruefe(vorbereitung, paket);
  fordere(v.eingaben.sollplan !== null, "bilanz-ohne-sollplan");
  fordere(exakt(exportierteDaten, ["ergebnisse", "sichten", "urteile", "belege"]), "bilanz-eingaben");
  // Keine Ersetzung fachlicher Urteile durch Callback-Bools oder technische
  // Erfolgszahlen. Alle Originalpruefungen bleiben unveraendert erhalten.
  return N.bilanziere({ paket, sollplan: v.eingaben.sollplan, ...exportierteDaten });
}
function productionStart() { throw Error("synthetik500-executor-production-start-nicht-implementiert"); }

// Optionale reine Testnaht. Nur ein ausdruecklich uebergebener Fixtureadapter,
// niemals ein Defaultprovider oder dynamischer Import eines Livegenerators.
// Sie kann keine Production-, Admission- oder Kostenquittung ausstellen.
async function simuliere(vorbereitung, paket, { modus, fixture, jetzt, exportierteDaten,
  stoppen = () => false, timeoutMs = 20000 } = {}) {
  const v = einfrieren(pruefe(vorbereitung, paket));
  fordere(modus === SIMULATION && typeof fixture === "function" && typeof jetzt === "function"
    && typeof stoppen === "function" && v.ablaufstrukturVollstaendig
    && Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 20000, "offline-fixture-fehlt");
  const p = v.eingaben.kostenSlot.plan, start = Date.parse(p.startsAtUTC), ende = Date.parse(p.endsAtUTC);
  const quittungen = v.schedule.map(x => ({ intentId: x.id, phase: x.phase, attempt: 0,
    status: "nicht-gestartet", grund: "nicht-erreicht", rueckgabeHash: null }));
  let grund = null, letzteZeit = start, inFlight = false;
  let wallEnd = null;
  const leseZeit = () => {
    let t;
    try { t = jetzt(); } catch { return null; }
    if (!Number.isSafeInteger(t) || t < letzteZeit) return null;
    letzteZeit = t; return t;
  };
  for (let i = 0; i < v.schedule.length; i++) {
    const x = v.schedule[i], q = quittungen[i], now = leseZeit();
    if (now === null || now < start || now >= ende) { grund = "zeitfenster-oder-uhr-ungueltig"; break; }
    // Ein spaeter Einstieg erhaelt nur die tatsaechlich verbleibende Zeit.
    // Diese monotone Endfrist wird danach niemals je Attempt verlaengert.
    if (wallEnd === null) wallEnd = performance.now() + (ende - now);
    if (performance.now() >= wallEnd) { grund = "zeitfenster-oder-uhr-ungueltig"; break; }
    try { if (stoppen() !== false) { grund = "angeforderter-stopp"; break; } }
    catch { grund = "stoppstatus-unbekannt"; break; }
    // B besitzt keinen nativen R-Speicher-/Receiptadapter. Auch /2 darf
    // die Herkunftskette aus C nicht durch Fixture-Bools ersetzen.
    if (x.phase === "R") {
      q.grund = grund = [REVIEW_VERSION, ROUTE_VERSION].includes(v.version) ? "r-storage-receipt-adapter-und-resume-offen"
        : "r-quittung-und-reserve-nicht-implementiert";
      break;
    }
    fordere(!inFlight && q.attempt === 0, "parallel-oder-doppelattempt");
    q.attempt = 1; q.status = "ausgang-unbekannt"; q.grund = "fixture-antwort-fehlt";
    inFlight = true;
    let timer;
    const attemptEnd = Math.min(performance.now() + Math.min(timeoutMs, ende - now), wallEnd);
    try {
      const r = await Promise.race([
        Promise.resolve().then(() => fixture(einfrieren({ intent: kopie(x), request: providerBindung(p, x),
          executorHash: v.executorHash, mode: SIMULATION }))),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Error("fixture-timeout")), Math.max(0, attemptEnd - performance.now())); })
      ]);
      const after = leseZeit();
      if (after === null || after >= ende || performance.now() >= attemptEnd) { q.grund = grund = "antwort-ausserhalb-zeitfenster"; break; }
      fordere(exakt(r, ["intentId", "actualRequestHash", "status", "evidenceHash"])
        && r.intentId === x.id && r.actualRequestHash === x.actualRequestHash
        && ["fixture-quittiert", "ausgang-unbekannt", "nicht-gesendet"].includes(r.status)
        && typeof r.evidenceHash === "string" && /^[a-f0-9]{64}$/.test(r.evidenceHash), "fixture-quittung-bindung");
      q.status = r.status; q.grund = r.status === "fixture-quittiert" ? null : r.status;
      q.rueckgabeHash = P.hash(r);
      if (r.status !== "fixture-quittiert") { grund = r.status; break; }
    } catch { q.grund = grund = "fixture-fehler-oder-unbekannte-quittung"; }
    finally { clearTimeout(timer); inFlight = false; }
    if (grund !== null) break;
  }
  for (const q of quittungen) if (q.attempt === 0) q.grund = grund || "nicht-erreicht";
  // Vollstaendige Bilanz auch nach Stopp/Throw/Unknown, statt verlorener
  // Sollpositionen. Fehlerhafte Exportstruktur wird getrennt quittiert.
  let fachbilanz = null, bilanzFehler = null;
  try { fachbilanz = bilanziere(v, paket, exportierteDaten ?? { ergebnisse: [], sichten: [], urteile: [], belege: null }); }
  catch { bilanzFehler = "fachbilanz-eingaben-ungueltig"; }
  const kern = { version: v.version, mode: SIMULATION, executorHash: v.executorHash, grund,
    quittungen, erwartetePositionen: v.erwartetePositionen, fachbilanz, bilanzFehler,
    positionen: fachbilanz?.positionen ?? v.erwartetePositionen.map(x => ({ ...x, status: "ausgang-unbekannt", gruende: [bilanzFehler] })),
    attempts: quittungen.filter(q => q.attempt === 1).length, parallelitaet: 1, paidRetry: false,
    productionReady: false, productionNachweisErfolgreich: false, startrecht: false,
    modellaufrufeDurchExecutor: 0, productionQuittung: false, offeneProductionTore: [...v.offeneProductionTore] };
  return { ...kern, berichtHash: P.hash(kern) };
}
module.exports = { VERSION, INPUT_VERSION, REVIEW_VERSION, REVIEW_INPUT_VERSION, ROUTE_VERSION, ROUTE_INPUT_VERSION, SIMULATION, OFFEN, offeneEingaben, vorbereite, pruefe,
  providerBindung, bilanziere, simuliere, productionStart };
