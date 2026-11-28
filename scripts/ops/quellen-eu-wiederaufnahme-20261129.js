"use strict";

// Rein lokaler Pruefer einer privaten SQL-Vorschau, keine Aktivierungsfreigabe.
// Neuer getrennter Auftrag nach unbestaetigtem Transport am28Nov.
// Keine Wiederverwendung des alten GO: neuer Tag, neuer positiver Bedarf, neue
// Einmalquittung; jede vorhandene alte Aktivierungsquittung sperrt.
// Genau ein EU-UNKNOWN am29Nov. Alle alten Geldbindungen bleiben erhalten.
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { isDeepStrictEqual: gleich } = require("node:util");
const { kanonisch } = require("../../lib/helmut/quellen-lektuerebeleg");
const R = require("../../lib/helmut/roh-quellenstaende");
const I = require("../../lib/helmut/vorgang-identity");
const B = require("../../lib/helmut/betriebskosten-budget");
const F = require("../../lib/helmut/quellen-faelligkeit");
const D = require("../../lib/helmut/source-demand");
const { erzeugePlanungsrest } = require("../../lib/helmut/quellen-planungsrest");
const { einzelArtikelAuftrag } = require("../../lib/helmut/scalable-pipeline");
const ZIEL = Object.freeze({ tag: "2026-11-29", job: "f346fe50-dadb-4139-b68a-b78fd88cf4ea",
  raw: "rd-5448cf181993da0cf5365e22d8032fe8c9ca35a4794c849f7150525617dd61a7",
  stand: "f5f2bf9ca0ab59c5adcbc341d5a9c4bc904ffd741842c8feae5b079e28e9f779",
  vg: "vg-dieswöchigen-20261126-03af76", ticket: "6423f47f-f7e9-4a33-9774-48b84f795f03",
  operator: "5e666151d7046e87fdd0f319df7fca4e6c2414a6f7d5ff7bcc62d6c592eb2bd5",
  kostenvertrag: "8c98b2e18ee5dc21c73561bbf5bad2d8cb6c76f8ccd533b3153270bbd7d9a348",
  einmalKey: "main-operator-restpflicht-20261129-eu", vorherigerOperator: "main-operator-restpflicht-20261127-eu",
  ersterVersuchSqlSha: "6540f944e6eb591fc433fc7a568f621d57a26893ec780246b0b4ca68539d9c62",
  alteCasHash: "749b4607fa96cc192b3633ebaf8aca1debf61411065d8c0f0055a7588a2e7b34" });
const hash = text => createHash("sha256").update(text).digest("hex");
const muss = (ok, warum) => { if (!ok) throw Error("restpflicht: " + warum); };
const zeit = value => Date.parse(value);
function pruefeCasRuhe(cas, jetztMs) {
  muss(Array.isArray(cas), "CAS-Eigentuemerbestand fehlt");
  if (!cas.length) return;
  // Exakt sechs am28Nov rein lesend gesicherte Altzustaende, keine generelle
  // Freigabe abgelaufener Modell-Leases. Alle Felder bleiben im Vor-/Nachsnapshot.
  muss(cas.length === 6 && hash(JSON.stringify(kanonisch(cas))) === ZIEL.alteCasHash
    && cas.every(c => ["reserviert", "modell-laeuft"].includes(c.zustand)
      && typeof c.besitzer === "string" && c.besitzer.length > 0
      && Number.isFinite(zeit(c.lease_bis)) && zeit(c.lease_bis) < jetztMs
      && c.vorgang_id !== ZIEL.vg), "aktive oder ungepruefte CAS-Eigentuemer");
}
async function pruefe(v, { jetztMs = Date.now() } = {}) {
  muss(v?.version === 1 && v.modus === "vorschau" && v.verbraucht === false
    && typeof v.inhalt === "string" && Buffer.byteLength(v.inhalt) <= 8 * 1024 * 1024
    && hash(v.inhalt) === v.digest, "Vorschau oder Einmalbindung");
  muss(Number.isFinite(jetztMs) && new Date(jetztMs).toISOString().slice(0, 10) === ZIEL.tag
    && v.tag === ZIEL.tag && zeit(v.gelesenAm) <= jetztMs && zeit(v.gelesenAm) >= jetztMs - 5 * 60000,
  "nur29Nov mit frischer Fuenfminutenbindung; heute kein Start");
  const s = JSON.parse(v.inhalt), j = s.job, c = s.cas?.[0];
  muss(gleich(s.vorherigeQuittungen, []), "vorherige Aktivierung bereits quittiert; keine Wiederholung");
  muss(j?.id === ZIEL.job && j.job_type === "document_understanding" && j.tenant_id === null
    && j.status === "fehlgeschlagen" && j.last_error === "modellausgang-unbekannt: artikel bleibt durch CAS gesperrt"
    && j.attempts === 3 && j.max_attempts === 3 && j.wiedervorlagen === 0
    && j.lease_owner === null && j.lease_expires_at === null && zeit(j.finished_at) < zeit("2026-11-28")
    && zeit(j.finished_at) >= zeit("2026-11-27"), "exakter historischer Einzelauftrag");
  const auftrag = einzelArtikelAuftrag({ id: ZIEL.raw, stand: ZIEL.stand });
  muss(gleich(j.payload, auftrag.payload) && j.idempotency_key === auftrag.idempotencyKey,
    "exakte Einzelversion ohne fremde Payload");
  muss(gleich(s.links, []) && gleich(s.kos, []) && gleich(s.vormerkungen, [])
    && s.cas?.length === 1 && c.vorgang_id === ZIEL.vg && c.zustand === "unbekannt"
    && c.besitzer === null && c.lease_bis === null && c.fencing === 1 && c.versuche === 1 && c.ki_aufrufe === 1
    && c.ergebnis_hash === null && c.ergebnis_fencing === null
    && c.letzter_grund === "modellfehler:betriebskosten-abschluss-unbestaetigt", "UNKNOWN ohne KO und ohne Ergebnis");
  pruefeCasRuhe(s.aktiveCas, jetztMs);
  muss(gleich(s.aktiveJobs, []) && gleich(s.aktiveSlots, [])
    && s.rawJobs?.length === 1 && gleich(s.rawJobs[0], j), "keine Workerarbeit oder konkurrierende Rohauftraege");
  const original = s.archive?.find(a => a.id === `main-rohstand-${ZIEL.raw.slice(3)}-${ZIEL.stand}`)?.data;
  muss(original?.version === 1 && original.quellenHash === ZIEL.stand
    && R.standHash(original.dokument) === ZIEL.stand && R.standHash(s.aktuell) === ZIEL.stand
    && gleich(original.dokument, s.aktuell), "Original und aktuelle Fassung unveraendert");
  const doc = original.dokument;
  muss(doc.id === ZIEL.raw && doc.source_id === "bundesregierung" && doc.source_type === "ministry"
    && doc.source_name === "Bundesregierung" && doc.raw?.retrievalPathId === "rp-bundesregierung"
    && doc.link_type === "direct" && typeof doc.summary === "string" && doc.summary.trim()
    && /^https:\/\/www\.bundesregierung\.de\/breg-de\/aktuelles\/fragen-antworten-mfr-2462532$/.test(doc.url)
    && doc.canonical_url === doc.url.replace("www.", ""), "gebundene amtliche RSS-Originalquelle");
  const clusters = I.clusterRawDocuments([doc]);
  muss(clusters.length === 1 && I.deriveVorgangId(clusters[0]) === ZIEL.vg, "native Vorgangsidentitaet");
  const op = s.casOperator, rolle = name => op?.rollen?.find(r => r.rolle === name)?.execute;
  muss(op?.definitionHash === ZIEL.operator && op.securityDefiner === false && op.eigentuemer === "postgres"
    && op.acl === "{postgres=X/postgres,service_role=X/postgres}"
    && gleich(op.konfiguration, ["search_path=public, pg_temp"])
    && rolle("anon") === false && rolle("authenticated") === false
    && rolle("service_role") === true && rolle("postgres") === true, "native geschlossene CAS-Entscheidung");
  const book = s.kostenBuch, stand = B.pruefeBuch(book, book?.contract);
  muss(book.contractHash === ZIEL.kostenvertrag && book.frozen === null && book.contract.dailyLimitUsd === 1
    && book.contract.totalLimitUsd === 30 && book.contract.route.model === "gpt-5-mini-eu"
    && stand.total + 212000 <= 30000000 && (stand.days[ZIEL.tag] || 0) + 212000 <= 1000000,
  "unveraenderter1/30USD-Vertrag mit voller neuer Reserve");
  const ticket = book.calls[ZIEL.ticket];
  muss(ticket?.id === ZIEL.ticket && ticket.runId === ZIEL.job && ticket.status === "ungeklaert"
    && ticket.day === "2026-11-27" && ticket.reserved === 212000 && ticket.maxOutputTokens === 3000
    && ticket.callType === "understanding" && ticket.contractHash === book.contractHash
    && Object.values(book.calls).filter(c => c.runId === ZIEL.job).length === 1,
  "historische UNKNOWN-Reserve bleibt gebunden");
  muss(gleich(s.nativeNutzung?.zeilen, []) && Array.isArray(s.nativeNutzung?.spalten)
    && ["id", "created_at", "vorgang_id", "knowledge_object_id"].every(k => s.nativeNutzung.spalten.includes(k))
    && Array.isArray(s.blobJobNutzung)
    && s.blobJobNutzung.every(e => e.runId === ZIEL.job && e.callType === "skipped-understanding-error"
      && e.model === "none" && e.keinAufruf === true && e.success === false),
  "native Nutzung unbekannt; historische Falsch0-Marker sind keine Kostenfreigabe");
  muss(Number.isSafeInteger(s.globalUsed) && s.globalUsed >= 0 && s.globalUsed < 100
    && Array.isArray(s.llmReservierungen) && s.llmReservierungen.length === 0
    && Number.isSafeInteger(s.originalUsed) && s.originalUsed >= 0 && s.originalUsed < 16,
  "frischer100/16-Vorflug ohne aktive Reservierungen");
  const rows = [s.plan], request = async url => rows.filter(r => r?.id === new URL(url, "http://local.invalid")
    .searchParams.get("id")?.replace(/^eq\./, ""));
  const plan = await erzeugePlanungsrest({ request, storeId: "main" }).lesen(ZIEL.tag);
  const a = s.abruf, p = plan?.auftraege?.filter(p => p.jobType === "source_fetch" && p.idempotencyKey === a?.idempotency_key);
  muss(plan?.zustand === "fertig" && p.length === 1 && p[0].tenantId == null
    && p[0].payload?.art === "geteilt" && p[0].payload.quelle?.id === "bundesregierung"
    && p[0].payload.quelle.retrievalPathId === "rp-bundesregierung"
    && D.amtlicheMorgenPrioritaet(p[0].payload.quelle) !== null
    && a.job_type === "source_fetch" && a.tenant_id === null && a.status === "erledigt"
    && a.lease_owner === null && a.lease_expires_at === null && gleich(a.payload, p[0].payload)
    && zeit(a.first_due_at) === zeit(p[0].dueAt) && zeit(a.first_due_at) >= zeit(ZIEL.tag)
    && zeit(a.finished_at) <= jetztMs && zeit(a.finished_at) >= zeit(a.first_due_at), "29Nov-Pflichtbedarf nativ geplant und quittiert");
  const beleg = s.beleg?.data;
  muss(s.beleg?.id === "main-quellenfaelligkeit-" + a.id && F.belegGueltig(beleg,
    { id: a.id, tenantId: null, firstDueAt: a.first_due_at, payload: a.payload })
    && zeit(beleg.bestaetigtAm) <= zeit(a.finished_at) && ["teilweise", "rohfassungen"].includes(beleg.ergebnis.art)
    && !beleg.ergebnis.quellenkonflikt && beleg.ergebnis.rohIds.includes(ZIEL.raw)
    && beleg.ergebnis.analyse.filter(x => x.jobId === ZIEL.job).length === 1
    && beleg.ergebnis.analyse.some(x => x.jobId === ZIEL.job && x.rohId === ZIEL.raw && x.stand === ZIEL.stand),
  "aktuelle positive Einzelversionsbindung; alte Teilquittung bleibt erhalten");
  return { version: 1, modus: "vorbereitet", aktiviert: false, tag: ZIEL.tag, abrufId: a.id,
    einmalKey: ZIEL.einmalKey, vorherigerVersuchSqlSha: ZIEL.ersterVersuchSqlSha,
    geprueftAm: new Date(jetztMs).toISOString(), digest: v.digest, vor: s,
    entscheidung: "erneut", hinweis: "Keine Aktivierung ohne frisches konkretes Betreiber-GO. Kein Workerstart." };
}
module.exports = { ZIEL, pruefe, pruefeCasRuhe };
if (require.main === module) Promise.resolve().then(() => pruefe(JSON.parse(readFileSync(0, "utf8"))))
  .then(b => console.log(JSON.stringify(b))).catch(e => { console.error(e.message); process.exitCode = 1; });
