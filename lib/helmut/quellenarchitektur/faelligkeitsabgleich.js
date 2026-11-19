"use strict";

const F = require("../quellen-faelligkeit");
const D = require("../source-demand");
const { buildRelationalCrawlPlan, planQuellenFuerProfil } = require("./source-mode");
const { isActivationEligible } = require("./profile-packages");
const { hash } = require("../briefing-speicher");
const TAG_MS = 86400000;

function technischeQuelle(job) {
  return { id: job.id, tenantId: job.tenant_id ?? null, firstDueAt: job.first_due_at, payload: job.payload };
}

function enthaeltAusgabebeleg(value, ergebnis) {
  if (!value || typeof value !== "object") return false;
  if (ergebnis.art === "terminstand") {
    if (value.belegHash === ergebnis.belegHash && value.standHash === ergebnis.standHash && value.aktuell === true)
      return true;
  } else if (ergebnis.analyse.some(a => a.rohId === value.documentId || a.rohId === value.quelleId
    || a.rohId === value.quelle_id || value.sourceIds?.includes?.(a.rohId))) {
    return true;
  }
  return Object.entries(value).some(([key, v]) => !["vorherigerStand", "tagespaketGrundlage", "quellenStand", "ereignisUrspruenge"].includes(key)
    && enthaeltAusgabebeleg(v, ergebnis));
}

function abgleichen({ catalog, profiles, manifest, jobs, belege, analyseJobs, ausgaben, lageAusgaben = new Map(), jetztMs, env }) {
  const aktive = profiles.filter(isActivationEligible);
  const tag = new Date(jetztMs).toISOString().slice(0, 10);
  const plan = buildRelationalCrawlPlan({ ...catalog, profiles, env });
  const bedarf = new Map(aktive.length ? plan.aktiv.map(a => [a.id, a]) : []);
  const dip = require("../dip");
  if (aktive.length && dip.quellenwegAktiv(catalog)) {
    const weg = catalog.retrievalPaths.find(p => p.id === "rp-dip");
    bedarf.set(weg.id, { ...weg, source: { id: "dip", crawlMethod: "dip", url: weg.url } });
  }
  const geplant = (manifest?.auftraege || []).filter(j => j.jobType === "source_fetch");
  const geplanteSchluessel = new Set(geplant.map(p => p.idempotencyKey));
  const jobsByKey = new Map(jobs.map(j => [j.idempotency_key, j]));
  const analysen = new Map(analyseJobs.map(j => [j.id, j]));
  const luecken = [], faelligkeiten = [];
  const wegJeJob = new Map();
  for (const [id, weg] of bedarf) {
    const passende = geplant.filter(j => {
      const q = j.payload?.quelle;
      return q?.crawlMethod === weg.source.crawlMethod
        && (q.retrievalPathId === id || q.id === weg.source.id)
        && D.abrufwege(q).map(D.kanonischeUrl).includes(D.kanonischeUrl(weg.url));
    });
    if (!passende.length) {
      const andereDefinition = geplant.some(j => j.payload?.quelle?.retrievalPathId === id || j.payload?.quelle?.id === weg.source.id);
      luecken.push({ wegId: id, grund: id === "rp-dip" && !dip.isDipEnabled(env)
        ? "dip_zugang_fehlt" : !manifest ? "tagesmanifest_fehlt"
          : andereDefinition ? "abrufdefinition_abweichend" : "abrufweg_nicht_eingeplant" });
    }
    for (const j of passende) wegJeJob.set(j.idempotencyKey, id);
  }
  for (const p of aktive) {
    const mandatsId = p.id;
    const S = require("../scheduler");
    if (require("../config").profileCompleteness(p).empty || !S.profilQuellenErlaubt(p, env)) continue;
    for (const art of ["person-aktuell", "person-archiv"]) {
      if (!geplant.some(j => j.tenantId === mandatsId && j.payload?.art === art))
        luecken.push({ wegId: art, grund: manifest ? "personensuche_nicht_geplant" : "tagesmanifest_fehlt" });
    }
    for (const quelle of S.mandateNewsSources(p)) {
      const erwartet = D.abrufwege(quelle).map(D.kanonischeUrl).sort().join("\n");
      if (!geplant.some(j => j.tenantId == null && j.payload?.quelle
        && D.abrufwege(j.payload.quelle).map(D.kanonischeUrl).sort().join("\n") === erwartet))
        luecken.push({ wegId: "mandatssuche", grund: manifest ? "mandatssuche_nicht_geplant" : "tagesmanifest_fehlt" });
    }
  }
  for (const j of geplant) if (!jobsByKey.has(j.idempotencyKey)) {
    const nochNichtGereiht = manifest.auftraege.indexOf(j) >= manifest.cursor;
    luecken.push({ wegId: wegJeJob.get(j.idempotencyKey) || j.payload?.art || "source_fetch",
      grund: nochNichtGereiht ? "einreihung_ausstehend" : "queue_eintrag_fehlt" });
  }
  if (!manifest && aktive.length) luecken.push({ grund: "tagesmanifest_fehlt" });
  const archivStunden = D.fensterKonfig(env).archivStundenFenster;
  const zugelassen = new Map(aktive.map(p => [p.id, new Set(
    planQuellenFuerProfil(plan, p).map(q => q.retrievalPathId))]));
  // Das Mandatspaket ist separat vom technischen Abruf zu prüfen. Nur das
  // tatsächlich gespeicherte Paket des berechtigten Profils zählt.
  for (const j of jobs) {
    const q = j.payload?.quelle, pfad = wegJeJob.get(j.idempotency_key) || q?.retrievalPathId;
    const wegId = bedarf.has(pfad) ? pfad : j.payload?.art || "source_fetch";
    const frist = F.fristen({ priority: j.priority, payload: j.payload, freshnessWindow: j.freshness_window },
      j.first_due_at, archivStunden);
    const aktuell = new Date(j.first_due_at).toISOString().slice(0, 10) === tag || geplanteSchluessel.has(j.idempotency_key);
    const beleg = belege.get(j.id);
    let abruf = "offen", grund = null, produkt = "ausstehend", wiederpruefung = null, produktzeit = null;
    if (j.status === "erledigt") {
      if (F.belegGueltig(beleg, technischeQuelle(j)) && Date.parse(beleg.bestaetigtAm) <= Date.parse(j.finished_at)) {
        abruf = beleg.ergebnis.unveraendertBelegHash ? "bestaetigt_unveraendert" : beleg.ergebnis.art;
        if (["teilweise", "abruf-unbestaetigt"].includes(abruf)) grund = "abruf_inhalt_unvollstaendig";
      } else { abruf = "technisch_erledigt"; grund = "ergebnisbeleg_fehlt"; }
    } else if (j.status === "fehlgeschlagen") {
      abruf = "fehlgeschlagen"; grund = "abruf_endfehler";
    } else if (j.last_error) {
      abruf = /rechte-oder-aktivierung|zugriff-gesperrt/.test(j.last_error) ? "gesperrt" : "voruebergehend_blockiert";
      grund = abruf === "gesperrt" ? "quelle_gesperrt" : "quelle_vertagt";
      wiederpruefung = j.due_at;
    } else if (Date.parse(j.first_due_at) <= jetztMs) {
      grund = j.status === "laeuft" ? "abruf_laeuft" : "abruf_ausstehend";
    }
    if (j.status === "erledigt" && !grund) {
      const e = beleg.ergebnis;
      if (e.art === "keine-funde") produkt = "keine_funde";
      else if (e.analyse?.some(a => {
        const z = analysen.get(a.jobId);
        return z?.status !== "erledigt" || z.payload?.quellenstaende?.[a.rohId] !== a.stand;
      })) grund = "analyse_nicht_belegt";
      else if (aktuell && j.payload?.art !== "person-archiv") {
        const termin = require("../quellen-bundestag-termine").quelle(q);
        const ziel = aktive.filter(p => j.tenant_id != null ? j.tenant_id === p.id
          : termin ? require("../parlamentsbelege-produkt").rolle(p, termin)
            : pfad === "rp-dip" || !bedarf.has(pfad) || zugelassen.get(p.id).has(pfad));
        const belegt = ziel.length > 0 && ziel.every(p => {
          const a = ausgaben.get(p.id);
          return a?.user_id === p.id && Date.parse(a.generated_at) >= Date.parse(beleg.bestaetigtAm)
            && Date.parse(a.generated_at) <= jetztMs && enthaeltAusgabebeleg([a.payload?.lageAnsicht, a.payload?.briefing], e);
        });
        if (belegt) {
          produkt = "mandatspaket_belegt";
          produktzeit = Math.max(...ziel.map(p => {
            const a = ausgaben.get(p.id);
            return Date.parse(a.bereitAm || a.generated_at);
          }));
          if (frist.morgenbriefingFrist && produktzeit > Date.parse(frist.morgenbriefingFrist))
            grund = "morgenpaket_verspaetet";
          else if (frist.morgenbriefingFrist) {
            const lagen = ziel.map(p => lageAusgaben.get(p.id));
            if (lagen.some((l, i) => l?.user_id !== ziel[i].id || !enthaeltAusgabebeleg(l?.payload, e)
              || !(Date.parse(l.generated_at) >= Date.parse(beleg.bestaetigtAm) && Date.parse(l.generated_at) <= jetztMs)))
              grund = "lagefrist_nicht_belegt";
            else if (lagen.some(l => Date.parse(l.generated_at) > Date.parse(frist.frist))) grund = "lage_verspaetet";
          }
        } else grund = "zuordnung_nicht_belegt";
      } else if (j.payload?.art === "person-archiv") {
        produkt = "archiv";
      } else grund = "historische_ausgabe_nicht_belegt";
    }
    const abschluss = j.status === "erledigt" ? Date.parse(j.finished_at) : jetztMs;
    const verspaetet = abschluss > Date.parse(frist.frist) || grund === "morgenpaket_verspaetet" || grund === "lage_verspaetet"
      || (!frist.morgenbriefingFrist && produktzeit != null && produktzeit > Date.parse(frist.frist));
    if (verspaetet && !grund) grund = "frist_verfehlt";
    if (grund) luecken.push({ wegId, grund });
    faelligkeiten.push({ kennung: hash(j.idempotency_key), wegId, ...frist, aktuell, abruf, produkt,
      grund, ...(j.last_error ? { blocker: String(j.last_error).split(":").slice(0, 2).join(":").slice(0, 150) } : {}),
      wiederpruefung, verspaetet, belegHash: beleg?.belegHash || null });
  }
  return { zustand: luecken.length ? "eingeschraenkt" : aktive.length ? "belegt" : "ohne_aktiven_bedarf",
    katalogWege: catalog.retrievalPaths.length, aktivePakete: plan.aktivierung.aktivePakete,
    erwarteteWege: bedarf.size, manifestAuftraege: geplant.length,
    planluecken: luecken.filter(l => ["abrufweg_nicht_eingeplant", "abrufdefinition_abweichend", "dip_zugang_fehlt", "tagesmanifest_fehlt",
      "personensuche_nicht_geplant", "mandatssuche_nicht_geplant", "queue_eintrag_fehlt", "einreihung_ausstehend"].includes(l.grund)).length,
    faelligkeiten, luecken };
}

async function lese({ catalog, profiles, jetztMs = Date.now(), env = process.env, storage = require("../storage"),
  deadlineAt = Date.now() + 6500, now = Date.now } = {}) {
  if (!require("../quellen-arbeitsfenster-aktiv").aktiv(env)) return null;
  if (!catalog || !Array.isArray(catalog.retrievalPaths) || !catalog.retrievalPaths.length || !Array.isArray(profiles))
    throw Error("faelligkeitsabgleich-katalog-nicht-bestaetigt");
  const pruefeZeit = () => { if (now() >= deadlineAt) throw Error("faelligkeitsabgleich-zeitbudget"); };
  const request = (...args) => { pruefeZeit(); return storage.supabaseRequest(...args); };
  const storeId = env.HELMUT_SUPABASE_STORE_ID || "main";
  const journal = require("../quellen-planungsrest").erzeugePlanungsrest({ request, storeId });
  const tag = new Date(jetztMs).toISOString().slice(0, 10);
  const ab = new Date(Date.parse(tag) - 7 * TAG_MS).toISOString();
  const jobs = [], belege = new Map(), analyseJobs = [], ausgaben = new Map(), lageAusgaben = new Map();
  const forderung = F.speicher({ request, storeId });
  const manifest = await journal.lesen(tag);
  for (;;) {
    const cursor = jobs.at(-1)?.id;
    const rows = await request("/rest/v1/helmut_jobs?job_type=eq.source_fetch&order=id.asc&limit=500"
      + "&select=id,idempotency_key,tenant_id,first_due_at,due_at,freshness_window,priority,status,finished_at,last_error,payload"
      + "&or=" + encodeURIComponent(`(status.in.(wartend,laeuft,fehlgeschlagen),first_due_at.gte.${ab})`)
      + (cursor ? "&id=gt." + encodeURIComponent(cursor) : ""));
    if (!Array.isArray(rows) || rows.length > 500 || rows.some(j => !j?.id || !j.idempotency_key
      || !Number.isFinite(Date.parse(j.first_due_at)) || !j.payload?.quelle))
      throw Error("faelligkeitsabgleich-queue-nicht-bestaetigt");
    jobs.push(...rows);
    if (rows.length < 500) break;
    if (jobs.length >= 5000) throw Error("faelligkeitsabgleich-lesegrenze");
  }
  async function stapel(ids, lade, uebernehme) {
    for (let i = 0; i < ids.length; i += 48) {
      const teil = ids.slice(i, i + 48);
      const rows = await lade(encodeURIComponent(teil.join(",")));
      if (!Array.isArray(rows) || rows.length > teil.length || rows.some(r => !teil.includes(r?.id))
        || new Set(rows.map(r => r.id)).size !== rows.length) throw Error("faelligkeitsabgleich-belegantwort");
      rows.forEach(uebernehme);
    }
  }
  await stapel(jobs.filter(j => j.status === "erledigt").map(j => forderung.id(j.id)),
    ids => request(`/rest/v1/helmut_store?id=in.(${ids})&select=id,data`),
    r => belege.set(r.id.slice(-36), r.data));
  await stapel([...new Set([...belege.values()].flatMap(b => b?.ergebnis?.analyse || []).map(a => a.jobId))],
    ids => request(`/rest/v1/helmut_jobs?id=in.(${ids})&job_type=eq.document_understanding&tenant_id=is.null&select=id,status,payload`),
    r => analyseJobs.push(r));
  const B = require("../briefing-speicher");
  const A = require("../briefing-ausgabebeleg");
  const L = require("../briefing-lauf");
  const berlin = require("../briefing-frische").berlinTagKey(new Date(jetztMs));
  for (const profile of profiles.filter(isActivationEligible)) {
    pruefeZeit();
    const [paket, quittung, lage] = await Promise.all([
      B.lese({ userId: profile.id, day: berlin, profile, storage }),
      L.ladeErfolg(storage, profile.id, berlin),
      storage.getRenderedBriefingV3(profile.id, "lage", berlin, { strict: true })
    ]);
    if (paket && A.passt(quittung?.lauf?.ausgabeBeleg, paket)
      && Number.isFinite(Date.parse(quittung.lauf.erzeugtAm))) ausgaben.set(profile.id, { ...paket, bereitAm: quittung.lauf.erzeugtAm });
    if (lage) lageAusgaben.set(profile.id, lage);
  }
  pruefeZeit();
  return abgleichen({ catalog, profiles, manifest, jobs, belege, analyseJobs, ausgaben, lageAusgaben, jetztMs, env });
}

module.exports = { lese, abgleichen };
