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
const B = require("../../lib/helmut/betriebskosten-budget");
const { einzelArtikelAuftrag } = require("../../lib/helmut/scalable-pipeline");
const CAS_OPERATOR_HASH = "5e666151d7046e87fdd0f319df7fca4e6c2414a6f7d5ff7bcc62d6c592eb2bd5";
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
  const klasse = v.klasse || "metadaten-pflicht", neuversuch = klasse === "cas-pflichtneuversuch-20261126",
    pflicht = klasse === "metadaten-pflicht" || neuversuch;
  verlange(["metadaten-pflicht", "slotrest-20261126", "cas-pflichtneuversuch-20261126"].includes(klasse), "freigegebene Fehlerklasse");
  const zeit = value => Date.parse(value);
  verlange(Number.isFinite(jetztMs) && /^\d{4}-\d{2}-\d{2}$/.test(tag || "")
    && new Date(jetztMs).toISOString().slice(0, 10) === tag && v.tag === tag
    && UUID.test(jobId || "") && UUID.test(abrufId || "") && jobId !== abrufId
    && v.jobId === jobId && v.abrufId === abrufId && j.id === jobId && a.id === abrufId
    && zeit(v.gelesenAm) <= jetztMs && zeit(v.gelesenAm) >= jetztMs - 15 * 60000, "frische Tages-/Einzelbindung");
  verlange(j.job_type === "document_understanding" && j.tenant_id === null && j.status === "fehlgeschlagen"
    && (neuversuch ? /^verstehen-uebersprungen-dauerhaft: artikelkontext-zeitbudget seit [0-9]+ h$/.test(j.last_error || "")
      && zeit(j.finished_at) < zeit(tag) && j.attempts === 3 && j.max_attempts === 3 && j.wiedervorlagen === 2
      : pflicht ? j.last_error === "quellenstand-metadatenabweichung" && zeit(j.finished_at) < zeit(tag)
      : /^verstehen-uebersprungen-dauerhaft: verstehen-fortsetzung seit [0-9]+ h$/.test(j.last_error || "")
        && zeit(j.finished_at) >= zeit("2026-11-26T07:03:58Z") && zeit(j.finished_at) < zeit("2026-11-26T07:04:13Z")
        && zeit(j.finished_at) <= jetztMs && j.attempts === 3 && j.max_attempts === 3 && j.wiedervorlagen === 1)
    && j.lease_owner === null && j.lease_expires_at === null
    && Number.isSafeInteger(j.attempts) && j.attempts === j.max_attempts && j.max_attempts >= 1 && j.max_attempts < 50,
  "historischer Metadaten-Endzustand");
  const id = j.payload?.dokumentIds?.[0], stand = j.payload?.quellenstaende?.[id];
  const soll = einzelArtikelAuftrag({ id, stand });
  verlange(j.idempotency_key === soll.idempotencyKey && gleich(j.payload, soll.payload), "exakte Einzelversion ohne Altfreigaben");
  verlange(gleich(s.casIds, casKennungen(v)) && new Set(s.cas.map(c => c.vorgang_id)).size === s.cas.length
    && s.cas.every(c => s.casIds.includes(c.vorgang_id)), "CAS-Kandidaten nachlesen");
  const nutzung = s.jobNutzung;
  verlange(nutzung && Array.isArray(nutzung.spalten) && Array.isArray(nutzung.zeilen)
    && ["id", "created_at", "vorgang_id", "knowledge_object_id"].every(k => nutzung.spalten.includes(k))
    && nutzung.modus === (nutzung.spalten.includes("run_id") ? "lauf-und-objektbezug" : "legacy-objektbezug")
    && Array.isArray(s.blobJobNutzung), "explizit gebundenes altes oder aktuelles Nutzungsschema");
  // Logging ist ein begrenzter Spiegel und im alten Schema nicht laufgebunden.
  // Nur das vollstaendige, vor Sendung gebuchte aktive Geldbuch traegt hier
  // eine negative Aussage; dessen Abwesenheit/Unlesbarkeit sperrt den Eingriff.
  const buch = s.kostenBuch;
  B.pruefeBuch(buch, buch?.contract);
  const jobBuchungen = Object.values(buch.calls).filter(c => c.runId === jobId).sort((a,b) => a.id.localeCompare(b.id));
  verlange(gleich(jobBuchungen, [...(s.jobBuchungen || [])].sort((a,b) => a.id.localeCompare(b.id))), "vollstaendige Buch-/Jobzuordnung");
  if (!pflicht || neuversuch) verlange(Number.isFinite(zeit(j.created_at)) && zeit(buch.contract.startsAt) <= zeit(j.created_at)
    && Object.values(buch.calls).every(c => c.callType !== "understanding" || zeit(c.createdAt) < zeit(j.created_at)
      || zeit(c.createdAt) > jetztMs || typeof c.runId === "string" && c.runId.trim().length > 0)
    && jobBuchungen.length === 0, "Slotrest: vollstaendige aktive Buchabdeckung ohne unzuordenbare Analysebuchung erforderlich");

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
  verlange((pflicht ? prioritaet !== null : p.priority === 100 && a.priority === 100 && j.quellen_prioritaet_tag == null)
    && p.tenantId == null && p.payload?.art === "geteilt"
    && zeit(p.dueAt) >= zeit(tag) && (!pflicht || zeit(p.dueAt) <= schnitt) && zeit(p.dueAt) <= jetztMs
    && a.job_type === "source_fetch" && a.tenant_id === null && a.status === "erledigt"
    && a.lease_owner === null && a.lease_expires_at === null
    && zeit(a.first_due_at) === zeit(p.dueAt) && gleich(a.payload, p.payload)
    && zeit(a.finished_at) <= jetztMs, "aktueller bestaetigter amtlicher Pflichtabruf");
  const beleg = s.beleg?.data;
  verlange(s.beleg?.id === "main-quellenfaelligkeit-" + a.id && F.belegGueltig(beleg, {
    id: a.id, tenantId: a.tenant_id, firstDueAt: a.first_due_at, payload: a.payload
  }) && zeit(beleg.bestaetigtAm) <= zeit(a.finished_at) && (!pflicht || zeit(beleg.bestaetigtAm) <= schnitt)
    && ["rohfassungen", "teilweise"].includes(beleg.ergebnis.art) && !beleg.ergebnis.quellenkonflikt
    && beleg.ergebnis.rohIds.includes(id)
    && beleg.ergebnis.analyse.filter(x => x.jobId === jobId).length === 1
    && beleg.ergebnis.analyse.some(x => x.jobId === jobId && x.rohId === id && x.stand === stand),
  "native aktuelle Pflichtquittung fuer exakte Version");

  const archiv = R.erzeuge({ request, storeId: "main" });
  const original = await archiv.lesen(id, stand), aktuell = s.aktuell;
  verlange(original && aktuell?.id === id && [original, aktuell].every(d => d.link_type === "direct"
    && (!pflicht || d.source_id === quelle.id)
    && Number.isFinite(zeit(d.published_at)))
    && ["url", "canonical_url", "title", "source_name"].every(k => typeof original[k] === "string"
      && original[k].trim() && original[k] === aktuell[k]), "amtliches Archiv und eindeutige aktuelle Identitaet");
  verlange([original, aktuell].every(d => typeof d.summary === "string" && d.summary.trim()),
    pflicht ? "positiv belegter amtlicher Originalauszug fehlt" : "Slotrest: positiv belegter Originaltext fehlt; Titel und Fundstelle reichen nicht");
  const wege = D.abrufwege(quelle);
  const google = !pflicht && wege.some(url => new URL(url).hostname === "news.google.com");
  if (!pflicht) verlange(quelle.crawlMethod === "rss" && wege.length > 0 && wege.every(url => {
    const u = new URL(url); return u.protocol === "https:" && !u.username && !u.password && !u.port;
  }), "Slotrest: gebundene sichere RSS-Herkunft");
  const hosts = [...wege, ...(!pflicht && quelle.url ? [quelle.url] : [])].map(url => {
    const u = new URL(url);
    verlange(u.protocol === "https:" && !u.username && !u.password && !u.port, "sicherer gebundener Quellenhost");
    return u.hostname.replace(/^www\./, "");
  });
  const { artikelHost } = require("../../lib/helmut/artikelkontext-abrufschutz");
  verlange([original.url, original.canonical_url].every(url => {
    const host = artikelHost(url).replace(/^www\./, "");
    return host !== "news.google.com" && (google || hosts.includes(host));
  }), "sicherer gebundener Originalhost");
  if (google) {
    const proxy = url => typeof url === "string" && url.length <= 420
      && /^https:\/\/news\.google\.com\/rss\/articles\/[a-zA-Z0-9_-]+(?:\?oc=\d+)?$/.test(url);
    verlange(proxy(original.raw?.originalUrl) && proxy(aktuell.raw?.originalUrl)
      && /^rp-[a-z0-9_-]{1,125}$/i.test(quelle.retrievalPathId || "")
      && Array.isArray(s.fundstellen) && s.fundstellen.length >= 1 && s.fundstellen.length <= 32
      && s.fundstellen.some(f => f.raw_document_id === id && f.source_id === quelle.id
        && f.retrieval_path_id === quelle.retrievalPathId && f.link_type === "direct" && proxy(f.original_url)
        && zeit(f.found_at) <= jetztMs && zeit(f.found_at) >= jetztMs - 7 * 86400000),
    "Slotrest: frische exakt quellen-/weggebundene Google-Artikelfundstelle fehlt");
  }

  let altabschluss = null, casNeuversuch = null;
  if (neuversuch) {
    const op = s.casOperator, ko = s.kos[0], c = s.cas[0];
    verlange(Array.isArray(s.casVormerkungen) && s.casVormerkungen.length === 1
      && s.casVormerkungen[0].vorgang_id === c?.vorgang_id
      && s.casVormerkungen[0].fehlversuche === 1 && s.casVormerkungen[0].letzte_fencing === 2,
      "exakte nicht erschoepfte CAS-Vormerkung bleibt erhalten");
    verlange(quelle.id === "bundestag" && quelle.retrievalPathId === "rp-bundestag"
      && R.standHash(aktuell) === stand && gleich(original, aktuell)
      && s.links.length === 1 && s.cas.length === 1 && s.casIds.length === 1
      && s.links[0].raw_document_id === id && s.links[0].knowledge_object_id === ko.id
      && ko.understanding_status === "complete" && ko.ko_version === 1 && ko.source_document_count >= 1
      && ko.verstehen_fencing === 1 && ko.vorgang_id === c.vorgang_id
      && c.zustand === "unbekannt" && c.besitzer === null && c.lease_bis === null
      && c.fencing === 2 && c.ergebnis_fencing === 1 && c.ki_aufrufe === 2 && c.versuche === 2
      && c.ergebnis_hash === V.ergebnisHash(ko), "einziger gebundener BT-UNKNOWN-Zweitstart mit erhaltenem Altabschluss");
    const gelesen = L.leseQuellenLektuere(ko);
    verlange(gelesen.length > 0 && !gelesen.some(q => q.dokumentId === id),
      "aktueller Pflichttext durch Alt-Lektuere nicht belegt");
    verlange(Array.isArray(s.koBestandsdokumente) && s.koBestandsdokumente.length <= 200
      && gelesen.every(q => s.koBestandsdokumente.some(d => d.link?.knowledge_object_id === ko.id
        && d.link.raw_document_id === q.dokumentId && d.roh?.id === q.dokumentId)),
      "vollstaendige Dokumentgrundlage fuer unveraenderte Alt-Lektuere fehlt");
    const rolle = name => op?.rollen?.find(r => r.rolle === name)?.execute;
    verlange(op?.definitionHash === CAS_OPERATOR_HASH && op.securityDefiner === false
      && op.eigentuemer === "postgres" && op.acl === "{postgres=X/postgres,service_role=X/postgres}"
      && gleich(op.konfiguration, ["search_path=public, pg_temp"])
      && rolle("anon") === false && rolle("authenticated") === false
      && rolle("service_role") === true && rolle("postgres") === true,
      "native Aug23-Operatorfunktion mit geschlossenen Rollen");
    verlange(gleich(s.jobBuchungen, []) && gleich(s.blobJobNutzung, []) && gleich(nutzung.zeilen, []),
      "Neuversuch ohne ungeklaerte zusaetzliche Job-/Objektbuchung; alte CAS-Aufrufe bleiben erhalten");
    casNeuversuch = { vorgangId: c.vorgang_id, entscheidung: "erneut", funktionsHash: CAS_OPERATOR_HASH,
      quellenRestDokumentIds: [id], alterLektuereBeleg: gelesen,
      aktuellerErsterAbschnitt: L.quellenLektuereBeleg(L.quelleFuerPrompt(original, 0, null, 0)) };
  }
  if (!pflicht) {
    verlange(["id", "url", "canonical_url", "title", "source_name", "source_id", "summary"]
      .every(k => original[k] === aktuell[k]) && zeit(original.published_at) === zeit(aktuell.published_at)
      && R.standHash(aktuell) === stand
      && s.links.length === 1 && s.kos[0]?.understanding_status === "pending"
      && s.links[0].raw_document_id === id && s.links[0].knowledge_object_id === s.kos[0].id
      && s.cas.length === 0 && gleich(s.jobBuchungen, []) && gleich(nutzung.zeilen, []) && gleich(s.blobJobNutzung, []),
    "Slotrest mit identischem Original, genau einem pending-KO und ohne CAS-/Modellbuchung");
  } else if (!neuversuch && s.links.length) {
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
  verlange(s.cas.every(c => (altabschluss && c.vorgang_id === altabschluss.vorgangId)
    || (casNeuversuch && c.vorgang_id === casNeuversuch.vorgangId)), "ungeklaerter weiterer CAS-Kandidat");
  return { version: 1, modus: "freigeben", klasse, tag, jobId, abrufId,
    geprueftAm: new Date(jetztMs).toISOString(), casIds: s.casIds, digest: v.digest, vor: s, altabschluss, ...(casNeuversuch ? { casNeuversuch } : {}),
    abrufBleibtTeilweise: beleg.ergebnis.art === "teilweise" };
}

module.exports = { pruefe, casKennungen };
if (require.main === module) {
  const [tag, jobId, abrufId, modus] = process.argv.slice(2);
  Promise.resolve().then(async () => {
    const v = JSON.parse(readFileSync(0, "utf8"));
    console.log(JSON.stringify(modus === "cas-kennungen" ? casKennungen(v) : await pruefe(v, { tag, jobId, abrufId })));
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
