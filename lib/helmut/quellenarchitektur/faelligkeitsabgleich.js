"use strict";

const F = require("../quellen-faelligkeit");
const D = require("../source-demand");
const { buildRelationalCrawlPlan, planQuellenFuerProfil } = require("./source-mode");
const { isActivationEligible } = require("./profile-packages");
const { hash, angezeigteBriefingbereiche } = require("../briefing-speicher");
const { berlinTagKey } = require("../briefing-frische");
const { archivStart, erzeugePlanungsrest, leseArchivUrspruenge } = require("../quellen-planungsrest");
const TAG_MS = 86400000;
const ausgabeKey = (tag, mandat) => `${tag}|${mandat}`;
const jobFrist = (job, archivStunden) => F.fristen({
  priority: job.priority, payload: job.payload, freshnessWindow: job.freshness_window
}, job.first_due_at, archivStunden, Boolean(job.payload?.faelligkeit?.lageFrist));

function ausgabetage(frist, beleg, jetztMs) {
  const pflichtTag = berlinTagKey(new Date(frist.urspruenglichFaelligAm));
  if (frist.morgenbriefingFrist) return [pflichtTag];
  const von = Date.parse(berlinTagKey(new Date(beleg.bestaetigtAm)));
  const bis = Date.parse(berlinTagKey(new Date(jetztMs)));
  const tage = [];
  for (let ms = von; ms <= bis && tage.length < 8; ms += TAG_MS) tage.push(new Date(ms).toISOString().slice(0, 10));
  return tage;
}

function technischeQuelle(job) {
  return { id: job.id, tenantId: job.tenant_id ?? null, firstDueAt: job.first_due_at, payload: job.payload };
}

function findeAusgabebeleg(value, passt) {
  if (!value || typeof value !== "object") return false;
  return passt(value) || Object.entries(value).some(([key, v]) =>
    !["vorherigerStand", "tagespaketGrundlage", "quellenStand", "ereignisUrspruenge"].includes(key) && findeAusgabebeleg(v, passt));
}

function enthaeltAusgabebeleg(value, ergebnis) {
  if (ergebnis.art === "terminstand")
    return findeAusgabebeleg(value, v => v.belegHash === ergebnis.belegHash
      && v.standHash === ergebnis.standHash && v.aktuell === true);
  // Ein einzelner Verweis belegt nicht die übrigen analysierten Dokumente.
  return ergebnis.analyse.length > 0 && ergebnis.analyse.every(({ rohId }) => findeAusgabebeleg(value, v =>
    rohId === v.documentId || rohId === v.quelleId || rohId === v.quelle_id
    || Array.isArray(v.sourceIds) && v.sourceIds.includes(rohId)));
}

function briefingBelegt(paket, ergebnis, dipOriginale) {
  const { currentHelmutState, currentRadarState, amtlicheQuellenbelege } = angezeigteBriefingbereiche(paket.payload?.briefing);
  if (dipOriginale) {
    const prioritaeten = [currentHelmutState?.primaryItem, ...(currentHelmutState?.items || [])];
    return dipOriginale.every(({ rohId, original }) => prioritaeten.some(item => {
      const nachweis = item?.dipDokumentbeleg, anlass = item?.tagesAnlass || (item === prioritaeten[0] ? currentHelmutState?.tagesAnlass : null);
      return nachweis?.documentId === rohId && nachweis.quellfelderHash === original.hash
        && nachweis.url === original.bindung.url && item.sourceUrl === nachweis.url
        && anlass?.beleg?.documentId === rohId && anlass.beleg.url === nachweis.url
        && require("../briefing-bereichsvertrag").istTagesauftrag(anlass);
    }));
  }
  return enthaeltAusgabebeleg({ currentHelmutState, currentRadarState, amtlicheQuellenbelege }, ergebnis);
}

function lageBelegt(payload, ergebnis, dipOriginale) {
  if (!dipOriginale) return enthaeltAusgabebeleg(payload, ergebnis);
  // Der Lage-Speicher enthält auch die Eingabe des Modells. Für DIP zählt nur
  // der amtliche Beleg, den ein gespeicherter Absatz zum selben Vorgang zitiert.
  const L = require("../lage-quellenbeleg");
  if (!L.gespeicherterTextGueltig(payload)) return false;
  const satzbelege = payload.quellen.flatMap(v => v.quellenbelege.filter(q =>
    payload.paragraphs.some(p => p.vorgang_ids[0] === v.vorgang_id && p.quellen_ids[0] === q.quelle_id)));
  return dipOriginale.every(({ rohId, original }) => satzbelege.some(q => q.documentId === rohId
    && q.dokumentangaben?.quellfelderHash === original.hash && q.url === original.bindung.url));
}

function abgleichen({ catalog, profiles, manifest, archivUrspruenge = new Map(), jobs, belege, analyseJobs, ausgaben,
  lageAusgaben = new Map(), dipOriginale = new Map(), jetztMs, env }) {
  const aktive = profiles.filter(isActivationEligible);
  const tag = new Date(jetztMs).toISOString().slice(0, 10);
  const plan = buildRelationalCrawlPlan({ ...catalog, profiles, env });
  const bedarf = new Map(aktive.length ? plan.aktiv.map(a => [a.id, a]) : []);
  const dip = require("../dip");
  if (aktive.some(dip.mandatZulaessig) && dip.quellenwegAktiv(catalog)) {
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
    const person = S.personNewsSource(p);
    for (const url of D.abrufwege(person)) {
      const art = D.istArchivweg(url) ? "person-archiv" : "person-aktuell";
      if (!geplant.some(j => j.tenantId === mandatsId && j.payload?.art === art && j.payload.quelle?.id === person.id
        && D.abrufwege(j.payload.quelle).length === 1 && D.abrufwege(j.payload.quelle)[0] === url))
        luecken.push({ wegId: art, grund: manifest ? "personensuche_nicht_geplant" : "tagesmanifest_fehlt" });
    }
    for (const quelle of S.mandateNewsSources(p)) {
      const erwartet = D.abrufwege(quelle).map(D.kanonischeUrl).sort().join("\n");
      if (!geplant.some(j => j.tenantId == null && j.payload?.quelle
        && D.abrufwege(j.payload.quelle).map(D.kanonischeUrl).sort().join("\n") === erwartet))
        luecken.push({ wegId: "mandatssuche", grund: manifest ? "mandatssuche_nicht_geplant" : "tagesmanifest_fehlt" });
    }
  }
  const abweichendeJobs = new Set();
  const archivStunden = D.fensterKonfig(env).archivStundenFenster;
  for (const j of geplant) {
    const zeile = jobsByKey.get(j.idempotencyKey);
    const wegId = wegJeJob.get(j.idempotencyKey) || j.payload?.art || "source_fetch";
    if (!zeile) {
      const nochNichtGereiht = manifest.auftraege.indexOf(j) >= manifest.cursor;
      luecken.push({ wegId, grund: nochNichtGereiht ? "einreihung_ausstehend" : "queue_eintrag_fehlt" });
      continue;
    }
    const archiv = j.payload?.art === "person-archiv";
    const ursprung = archiv ? archivUrspruenge.get(j.idempotencyKey) || j : j;
    const erstmals = Date.parse(zeile.first_due_at);
    const fristPasst = erstmals === Date.parse(ursprung.dueAt)
      && hash(ursprung.payload?.faelligkeit || null) === hash(zeile.payload?.faelligkeit || null)
      && (!archiv || (erstmals >= archivStart(j)
        && jobFrist(zeile, archivStunden).frist === F.fristen(j, j.dueAt, archivStunden).frist));
    if ((zeile.tenant_id ?? null) !== (j.tenantId ?? null) || zeile.freshness_window !== j.freshnessWindow
      || j.priority !== zeile.priority || !fristPasst
      || j.payload?.art !== zeile.payload?.art || hash(j.payload?.quelle || null) !== hash(zeile.payload?.quelle || null)) {
      luecken.push({ wegId, grund: "queue_auftrag_abweichend" });
      abweichendeJobs.add(zeile.id);
    }
  }
  if (!manifest && aktive.length) luecken.push({ grund: "tagesmanifest_fehlt" });
  const zugelassen = new Map(aktive.map(p => [p.id, new Set(
    planQuellenFuerProfil(plan, p).map(q => q.retrievalPathId))]));
  // Das Mandatspaket ist separat vom technischen Abruf zu prüfen. Nur das
  // tatsächlich gespeicherte Paket des berechtigten Profils zählt.
  for (const j of jobs) {
    const q = j.payload?.quelle, pfad = wegJeJob.get(j.idempotency_key) || q?.retrievalPathId;
    const wegId = bedarf.has(pfad) ? pfad : j.payload?.art || "source_fetch";
    const frist = jobFrist(j, archivStunden);
    const aktuell = new Date(j.first_due_at).toISOString().slice(0, 10) === tag || geplanteSchluessel.has(j.idempotency_key);
    const beleg = belege.get(j.id);
    let abruf = "offen", grund = null, produkt = "ausstehend", wiederpruefung = null, produktzeit = null;
    if (j.status === "erledigt") {
      if (F.belegGueltig(beleg, technischeQuelle(j)) && Date.parse(beleg.bestaetigtAm) <= Date.parse(j.finished_at)) {
        abruf = beleg.ergebnis.unveraendertBelegHash ? "bestaetigt_unveraendert" : beleg.ergebnis.art;
        if (["teilweise", "abruf-unbestaetigt"].includes(abruf)) grund = "abruf_inhalt_unvollstaendig";
        if (beleg.ergebnis.quellenkonflikt === true) {
          abruf = "teilweise";
          grund = "terminstand_quellenkonflikt";
        }
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
    if (abweichendeJobs.has(j.id)) grund = "queue_auftrag_abweichend";
    if (j.status === "erledigt" && !grund) {
      const e = beleg.ergebnis;
      const analysenzeiten = (e.analyse || []).map(a => {
        const z = analysen.get(a.jobId);
        return z?.status === "erledigt" && z.payload?.quellenstaende?.[a.rohId] === a.stand
          ? Date.parse(z.finished_at) : NaN;
      });
      if (e.art === "keine-funde") {
        produkt = "keine_funde";
        if (frist.morgenbriefingFrist) grund = "pflichtquelle_ohne_ausgabebeleg";
      }
      else if (analysenzeiten.some(zeit => !Number.isFinite(zeit) || zeit > jetztMs)) grund = "analyse_nicht_belegt";
      else if (j.payload?.art !== "person-archiv") {
        const termin = require("../quellen-bundestag-termine").quelle(q);
        const dipBelege = pfad === "rp-dip" ? e.analyse.map(a => ({ ...a, original: dipOriginale.get(`${a.rohId}|${a.stand}`) })) : null;
        const dipNichtBelegt = dipBelege && (!dip.quellenwegAktiv(catalog) || !dipBelege.length || dipBelege.some(a => !a.original));
        const ziel = aktive.filter(p => j.tenant_id != null ? j.tenant_id === p.id
          : dipBelege ? dip.mandatZulaessig(p)
            : termin ? require("../parlamentsbelege-produkt").rolle(p, termin)
              : !bedarf.has(pfad) || zugelassen.get(p.id).has(pfad))
          .map(p => ({ p, dipBelege: dipBelege?.filter(a => dip.dokumentPasstZumMandat(a.original, p)) }))
          .filter(z => !dipBelege || z.dipBelege.length);
        const tage = ausgabetage(frist, beleg, jetztMs);
        const sichtbarePakete = ziel.map(({ p, dipBelege }) => tage.map(t => ausgaben.get(ausgabeKey(t, p.id))).filter(a =>
          a?.user_id === p.id && Date.parse(a.generated_at) >= Date.parse(beleg.bestaetigtAm)
          && Date.parse(a.bereitAm || a.generated_at) <= jetztMs
          && briefingBelegt(a, e, dipBelege)));
        const analyseAm = ziel.map(({ dipBelege }) => Math.max(...(dipBelege
          ? dipBelege.map(a => Date.parse(analysen.get(a.jobId).finished_at)) : analysenzeiten)));
        const nachweise = sichtbarePakete.map((pakete, i) => pakete.find(a => Date.parse(a.generated_at) >= analyseAm[i]));
        if (dipNichtBelegt) grund = "dip_original_nicht_belegt";
        else if (dipBelege && !ziel.length) produkt = "keine_mandatsrelevanten_funde";
        else if (nachweise.length && nachweise.every(Boolean)) {
          produkt = "mandatspaket_belegt";
          produktzeit = Math.max(...nachweise.map(a => Date.parse(a.bereitAm || a.generated_at)));
          if (frist.morgenbriefingFrist && produktzeit > Date.parse(frist.morgenbriefingFrist))
            grund = "morgenpaket_verspaetet";
          else if (frist.morgenbriefingFrist) {
            const lagen = ziel.map(({ p }) => lageAusgaben.get(ausgabeKey(tage[0], p.id)));
            if (lagen.some((l, i) => l?.user_id !== ziel[i].p.id || !lageBelegt(l?.payload, e, ziel[i].dipBelege)
              || !(Date.parse(l.generated_at) >= Math.max(Date.parse(beleg.bestaetigtAm), analyseAm[i]) && Date.parse(l.generated_at) <= jetztMs)))
              grund = "lagefrist_nicht_belegt";
            else if (lagen.some(l => Date.parse(l.generated_at) > Date.parse(frist.lageFrist || frist.frist))) grund = "lage_verspaetet";
          }
        } else grund = sichtbarePakete.some((pakete, i) => pakete.length && !nachweise[i])
          ? "analyse_nach_ausgabe" : "zuordnung_nicht_belegt";
      } else produkt = "archiv";
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
      "personensuche_nicht_geplant", "mandatssuche_nicht_geplant", "queue_eintrag_fehlt", "queue_auftrag_abweichend",
      "einreihung_ausstehend"].includes(l.grund)).length,
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
  const journal = erzeugePlanungsrest({ request, storeId });
  const tag = new Date(jetztMs).toISOString().slice(0, 10);
  const ab = new Date(Date.parse(tag) - 7 * TAG_MS).toISOString();
  const jobs = [], belege = new Map(), analyseJobs = [], ausgaben = new Map(), lageAusgaben = new Map();
  const forderung = F.speicher({ request, storeId });
  const manifest = await journal.lesen(tag);
  const archivUrspruenge = await leseArchivUrspruenge(manifest, journal);
  for (;;) {
    const cursor = jobs.at(-1)?.id;
    const rows = await request("/rest/v1/helmut_jobs?job_type=eq.source_fetch&order=id.asc&limit=500"
      + "&select=id,idempotency_key,tenant_id,first_due_at,due_at,freshness_window,priority,status,finished_at,last_error,payload"
      + "&or=" + encodeURIComponent(`(status.in.(wartend,laeuft,fehlgeschlagen),first_due_at.gte.${ab},finished_at.gte.${ab})`)
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
    ids => request(`/rest/v1/helmut_jobs?id=in.(${ids})&job_type=eq.document_understanding&tenant_id=is.null&select=id,status,payload,finished_at`),
    r => analyseJobs.push(r));
  const dipOriginale = new Map(), dipFassungen = new Map();
  for (const j of jobs) {
    if (j.status !== "erledigt" || j.payload.quelle.retrievalPathId !== "rp-dip") continue;
    const b = belege.get(j.id);
    if (F.belegGueltig(b, technischeQuelle(j))) for (const a of b.ergebnis.analyse || [])
      dipFassungen.set(`${a.rohId}|${a.stand}`, a);
  }
  const archiv = require("../roh-quellenstaende").erzeuge({ request, storeId });
  const staende = [...dipFassungen.values()];
  for (let i = 0; i < staende.length; i += 48) {
    const rows = await archiv.leseStapel(staende.slice(i, i + 48));
    for (const { rohId, stand, dokument } of rows)
      dipOriginale.set(`${rohId}|${stand}`, require("../dip-quellfelder").lese(dokument));
  }
  const B = require("../briefing-speicher");
  const L = require("../briefing-lauf");
  const { quittierteFassung } = require("../tagespaket-auslieferung");
  const jetzt = new Date(jetztMs), berlinHeute = berlinTagKey(jetzt);
  const archivStunden = D.fensterKonfig(env).archivStundenFenster;
  const tage = new Set(jobs.filter(j => j.status === "erledigt" && j.payload.art !== "person-archiv"
    && F.belegGueltig(belege.get(j.id), technischeQuelle(j)))
    .flatMap(j => ausgabetage(jobFrist(j, archivStunden), belege.get(j.id), jetztMs)));
  const aktive = profiles.filter(isActivationEligible);
  for (const tag of tage) {
    for (let i = 0; i < aktive.length; i += 24) {
      pruefeZeit();
      const teil = aktive.slice(i, i + 24);
      const rows = await storage.listRenderedBriefingsV3ForTenants(teil.map(p => p.id),
        ["lage", B.SLOT, L.SLOT_ERFOLG], tag);
      if (!Array.isArray(rows)) throw Error("faelligkeitsabgleich-ausgabeantwort");
      const byId = new Map(rows.map(r => [r.id, r]));
      if (byId.size !== rows.length) throw Error("faelligkeitsabgleich-ausgabeantwort");
      for (const p of teil) {
        const key = ausgabeKey(tag, p.id), prefix = `bf-${p.id}-`;
        const lage = byId.get(`${prefix}lage-${tag}`);
        if (lage?.user_id === p.id && lage.slot === "lage") lageAusgaben.set(key, lage);
        const paket = byId.get(`${prefix}${B.SLOT}-${tag}`);
        const quittung = byId.get(`${prefix}${L.SLOT_ERFOLG}-${tag}`);
        if (!paket || quittung?.user_id !== p.id || quittung.slot !== L.SLOT_ERFOLG) continue;
        const lauf = L.ausZeile(quittung, { tenantId: p.id, tagKey: tag });
        const quittiertAm = Date.parse(lauf?.erzeugtAm);
        if (lauf?.status !== L.STATUS_ERFOLG || lauf.tenantId !== p.id || lauf.ausloeser !== L.AUSLOESER_MORGENLAUF
          || !(quittiertAm <= jetztMs) || berlinTagKey(lauf.erzeugtAm) !== tag) continue;
        const historisch = tag !== berlinHeute;
        try { B.pruefeZeile(paket, { userId: p.id, day: tag, profile: p, historisch }); }
        catch { continue; } // Ein abweichendes Profil oder Paket belegt diese Ausgabe nicht.
        const fassung = quittierteFassung(paket, lauf, { day: tag, profile: p, now: jetzt, historisch });
        if (fassung && Date.parse(fassung.generated_at) <= quittiertAm
          && Date.parse(fassung.payload.erzeugtAm) === Date.parse(fassung.generated_at))
          ausgaben.set(key, { ...fassung, bereitAm: lauf.erzeugtAm });
      }
    }
  }
  pruefeZeit();
  return abgleichen({ catalog, profiles, manifest, archivUrspruenge, jobs, belege, analyseJobs, ausgaben,
    lageAusgaben, dipOriginale, jetztMs, env });
}

module.exports = { lese, abgleichen };
