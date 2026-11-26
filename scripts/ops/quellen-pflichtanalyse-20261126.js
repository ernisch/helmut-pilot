"use strict";

// Rein lokaler OPERATOR-Verifizierer einer privaten SQL-Vorschau. Keine DB,
// Provider, Freigabe eines Laufs oder Aenderung an Originalen/Abschluessen.
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { isDeepStrictEqual: gleich } = require("node:util");
const { erzeugePlanungsrest } = require("../../lib/helmut/quellen-planungsrest");
const F = require("../../lib/helmut/quellen-faelligkeit");
const R = require("../../lib/helmut/roh-quellenstaende");
const D = require("../../lib/helmut/source-demand");
const L = require("../../lib/helmut/quellen-lektuerebeleg");
const I = require("../../lib/helmut/vorgang-identity");
const V = require("../../lib/helmut/verstehen-vertrag");
const { einzelArtikelAuftrag } = require("../../lib/helmut/scalable-pipeline");
const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const hash = text => createHash("sha256").update(text).digest("hex");
const verlange = (ok, grund) => { if (!ok) throw Error("pflichtanalyse: " + grund); };
function lese(v) {
  verlange(v?.version === 1 && v.modus === "vorschau" && SHA.test(v.digest || "")
    && typeof v.inhalt === "string" && Buffer.byteLength(v.inhalt) <= 8 * 1024 * 1024
    && hash(v.inhalt) === v.digest, "Vorschaudigest");
  const s = JSON.parse(v.inhalt);
  verlange(s.job && s.abruf && Array.isArray(s.archive) && s.archive.length >= 1 && s.archive.length <= 32
    && Array.isArray(s.links) && s.links.length <= 1 && Array.isArray(s.kos) && s.kos.length === s.links.length
    && Array.isArray(s.cas) && Array.isArray(s.casIds), "Einzelbestand");
  return s;
}

// Nach erster Vorschau genau diese begrenzten IDs erneut per SQL cas_ids lesen.
// Auch eine abwesende Reservierung gehoert zum atomar verglichenen Vorwert.
function casKennungen(v) {
  const s = lese(v), docs = [s.aktuell, ...s.archive.map(a => a.data?.dokument)];
  verlange(docs.every(d => d?.id === s.job.payload?.dokumentIds?.[0]), "CAS-Originalbindung");
  const ids = [...new Set([...s.kos.map(k => k.vorgang_id), ...docs.map(d => {
    const clusters = I.clusterRawDocuments([d]);
    verlange(clusters.length === 1, "CAS-Clusterbindung");
    return I.deriveVorgangId(clusters[0]);
  })])].sort();
  verlange(ids.length >= 1 && ids.length <= 8 && ids.every(id => /^vg-[\p{L}\p{M}\p{N}_-]{1,180}$/u.test(id)), "CAS-Kennungslimit");
  return ids;
}

async function pruefe(v, { tag, jobId, abrufId, jetztMs = Date.now() } = {}) {
  const s = lese(v), j = s.job, a = s.abruf;
  const zeit = value => Date.parse(value);
  verlange(Number.isFinite(jetztMs) && /^\d{4}-\d{2}-\d{2}$/.test(tag || "")
    && new Date(jetztMs).toISOString().slice(0, 10) === tag && v.tag === tag
    && UUID.test(jobId || "") && UUID.test(abrufId || "") && jobId !== abrufId
    && v.jobId === jobId && v.abrufId === abrufId && j.id === jobId && a.id === abrufId
    && zeit(v.gelesenAm) <= jetztMs && zeit(v.gelesenAm) >= jetztMs - 15 * 60000, "frische Tages-/Einzelbindung");
  verlange(j.job_type === "document_understanding" && j.tenant_id === null && j.status === "fehlgeschlagen"
    && j.last_error === "quellenstand-metadatenabweichung" && zeit(j.finished_at) < zeit(tag)
    && j.lease_owner === null && j.lease_expires_at === null
    && Number.isSafeInteger(j.attempts) && j.attempts === j.max_attempts && j.max_attempts >= 1 && j.max_attempts < 50,
  "historischer Metadaten-Endzustand");
  const id = j.payload?.dokumentIds?.[0], stand = j.payload?.quellenstaende?.[id];
  const soll = einzelArtikelAuftrag({ id, stand });
  verlange(j.idempotency_key === soll.idempotencyKey && gleich(j.payload, soll.payload), "exakte Einzelversion ohne Altfreigaben");
  verlange(gleich(s.casIds, casKennungen(v)) && new Set(s.cas.map(c => c.vorgang_id)).size === s.cas.length
    && s.cas.every(c => s.casIds.includes(c.vorgang_id)), "CAS-Kandidaten nachlesen");

  const request = async url => {
    const key = new URL(url, "http://offline.invalid").searchParams.get("id")?.replace(/^eq\./, "");
    return [s.plan, ...s.archive].filter(row => row?.id === key);
  };
  const plan = await erzeugePlanungsrest({ request, storeId: "main" }).lesen(tag);
  verlange(plan?.zustand === "fertig", "vollstaendiger nativer Tagesplan");
  const auftraege = plan.auftraege.filter(p => p.jobType === "source_fetch" && p.idempotencyKey === a.idempotency_key);
  verlange(auftraege.length === 1, "geplanter amtlicher Einzelabruf");
  const p = auftraege[0], quelle = p.payload?.quelle;
  const prioritaet = D.amtlicheMorgenPrioritaet(quelle);
  const schnitt = require("../../lib/helmut/quellen-tagesbetrieb").zeiten(jetztMs).redaktionsschluss;
  verlange(prioritaet !== null && p.tenantId == null && p.payload?.art === "geteilt"
    && zeit(p.dueAt) >= zeit(tag) && zeit(p.dueAt) <= schnitt && zeit(p.dueAt) <= jetztMs
    && a.job_type === "source_fetch" && a.tenant_id === null && a.status === "erledigt"
    && a.lease_owner === null && a.lease_expires_at === null
    && zeit(a.first_due_at) === zeit(p.dueAt) && gleich(a.payload, p.payload)
    && zeit(a.finished_at) <= jetztMs, "aktueller bestaetigter amtlicher Pflichtabruf");
  const beleg = s.beleg?.data;
  verlange(s.beleg?.id === "main-quellenfaelligkeit-" + a.id && F.belegGueltig(beleg, {
    id: a.id, tenantId: a.tenant_id, firstDueAt: a.first_due_at, payload: a.payload
  }) && zeit(beleg.bestaetigtAm) <= zeit(a.finished_at) && zeit(beleg.bestaetigtAm) <= schnitt
    && beleg.ergebnis.art === "rohfassungen" && !beleg.ergebnis.quellenkonflikt
    && beleg.ergebnis.rohIds.includes(id)
    && beleg.ergebnis.analyse.filter(x => x.jobId === jobId).length === 1
    && beleg.ergebnis.analyse.some(x => x.jobId === jobId && x.rohId === id && x.stand === stand),
  "native aktuelle Pflichtquittung fuer exakte Version");

  const archiv = R.erzeuge({ request, storeId: "main" });
  const original = await archiv.lesen(id, stand), aktuell = s.aktuell;
  verlange(original && aktuell?.id === id && [original, aktuell].every(d => d.link_type === "direct"
    && d.source_id === quelle.id && typeof d.summary === "string" && d.summary.trim()
    && Number.isFinite(zeit(d.published_at)))
    && ["url", "canonical_url", "title", "source_name"].every(k => typeof original[k] === "string"
      && original[k].trim() && original[k] === aktuell[k]), "amtliches Archiv und eindeutige aktuelle Identitaet");
  const hosts = D.abrufwege(quelle).map(url => new URL(url).hostname.replace(/^www\./, ""));
  verlange([original.url, original.canonical_url].every(url => {
    const u = new URL(url); return u.protocol === "https:" && hosts.includes(u.hostname.replace(/^www\./, ""));
  }), "amtlicher Originalhost");

  let altabschluss = null;
  if (s.links.length) {
    const ko = s.kos[0], link = s.links[0];
    verlange(link.raw_document_id === id && link.knowledge_object_id === ko.id
      && ko.understanding_status === "complete" && Number.isInteger(ko.ko_version) && ko.ko_version >= 1
      && ko.source_document_count >= 1, "vollstaendiger verknuepfter Altabschluss");
    const c = s.cas.find(c => c.vorgang_id === ko.vorgang_id);
    verlange(c?.zustand === "fertig" && c.besitzer === null && c.lease_bis === null
      && c.fencing === ko.verstehen_fencing && c.ergebnis_fencing === ko.verstehen_fencing
      && c.ergebnis_hash === V.ergebnisHash(ko) && Number.isInteger(c.ki_aufrufe) && c.ki_aufrufe >= 1,
    "gebundener abgeschlossener CAS mit erhaltenem Kostenzaehler");
    const gelesen = L.leseQuellenLektuere(ko).find(q => q.dokumentId === id);
    verlange(gelesen && !gelesen.abschnitt && !gelesen.geleseneAbschnitte, "vollstaendiger nativer Alt-Lektuerebeleg");
    const treffer = [];
    for (const row of s.archive) {
      const hash = row.data?.quellenHash;
      verlange(SHA.test(hash || ""), "Archivkennung");
      const doc = await archiv.lesen(id, hash);
      const beweis = L.quellenLektuereBeleg(L.quelleFuerPrompt(doc, 0, null, 0), gelesen.hashVersion);
      if (beweis.quellenHash === gelesen.quellenHash && beweis.textstandHash === gelesen.textstandHash)
        treffer.push(hash);
    }
    verlange(treffer.length === 1, "eindeutige unveraenderte Archivfassung des Altabschlusses");
    altabschluss = { koId: ko.id, vorgangId: ko.vorgang_id, koVersion: ko.ko_version,
      gelesenStand: treffer[0], angefordertStand: stand, exakteVersionBereitsGelesen: treffer[0] === stand };
  }
  // Keine unsichtbare CAS-Freigabe: andere belegte Kandidaten muessen abwesend
  // sein. Auch offen/aufgegeben/UNKNOWN oder ein fremder fertiger CAS stoppt.
  verlange(s.cas.every(c => altabschluss && c.vorgang_id === altabschluss.vorgangId), "ungeklaerter weiterer CAS-Kandidat");
  return { version: 1, modus: "freigeben", tag, jobId, abrufId,
    geprueftAm: new Date(jetztMs).toISOString(), casIds: s.casIds, digest: v.digest, vor: s, altabschluss };
}

module.exports = { pruefe, casKennungen };
if (require.main === module) {
  const [tag, jobId, abrufId, modus] = process.argv.slice(2);
  Promise.resolve().then(async () => {
    const v = JSON.parse(readFileSync(0, "utf8"));
    console.log(JSON.stringify(modus === "cas-kennungen" ? casKennungen(v) : await pruefe(v, { tag, jobId, abrufId })));
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
