"use strict";

// Begrenzte Originalversorgung in den vorhandenen Quellenlaeufen, niemals
// beim App-Lesen. Kein eigener Schalter, Modellaufruf oder Datenbestand.
// Nur beschaffeArtikelkontext schreibt ueber seinen bestehenden CAS-Belegspeicher.
const A = require("./artikelkontext");
const B = require("./artikelkontext-beschaffung");
const P = require("./lage-profilbezug");
const H = require("./herausgeber");
const V = require("./profile-validation");
const Pakete = require("./quellenarchitektur/profile-packages");
const LIMITS = Object.freeze({ kandidaten: 20, unklar: 3, neueAbrufe: 2 });

function paketBezug(doc, profile, katalog) {
  const keys = new Set(Pakete.resolveProfilePackages(profile).all);
  const ids = new Set((katalog.packages || []).filter(p => p.status === "active" && keys.has(p.key)).map(p => p.id));
  const wege = new Set((katalog.packagePaths || []).filter(p => ids.has(p.package_id)).map(p => p.retrieval_path_id));
  return (doc.findings || []).some(f => {
    if (f.raw_document_id !== doc.id) return false;
    if (f.retrieval_path_id) return wege.has(f.retrieval_path_id);
    // Legacy-Fundstellen aus der Untersuchung haben noch keine Wegkennung.
    // Nur eine eindeutige reale Katalogzuordnung verwenden, nie rp-IDs erraten.
    const paths = (katalog.retrievalPaths || []).filter(p => p.legacy_source_id === f.source_id);
    return paths.length === 1 && wege.has(paths[0].id);
  });
}
function vorlaeufig(doc, profile, katalog) {
  const bezug = P.bewerte({ headline: H.titelRumpf(doc), was_ist_passiert: doc.summary || "" }, profile);
  if (bezug.passt) return { zustand: "moeglich", gewicht: bezug.gewicht };
  // Fehlendes Handlungssignal/knappe Ueberschrift ist KEIN endgueltiges Nein.
  // Ein nachgewiesener Paketweg erlaubt wenige unklare Kandidaten.
  return { zustand: paketBezug(doc, profile, katalog) ? "unklar" : "ohne-bezug", gewicht: 0 };
}
function erzeugeInhaltsversorgung(auftrag = {}, deps = {}) {
  if (auftrag.vorbereitet !== true) return { versorge: async () => ({ bereit: [], befund: [], reason: "nicht-angefordert" }) };
  const now = deps.now || (() => new Date());
  if (typeof auftrag.laufId !== "string" || !auftrag.laufId.trim()
    || !Number.isFinite(auftrag.deadlineMs) || auftrag.deadlineMs <= now().getTime()
    || !Array.isArray(auftrag.hosts)) throw new Error("inhaltsversorgung-auftrag-unvollstaendig");
  const hosts = new Set(auftrag.hosts.map(host => {
    if (require("./artikelkontext-abrufschutz").artikelHost(`https://${host}/artikel`) !== host)
      throw new Error("inhaltsversorgung-host-ungueltig");
    return host;
  }));
  let neueAbrufe = 0, unklare = 0, kandidaten = 0;
  const sichtbar = (d, p) => typeof deps.sichtbareMandate !== "function"
    || deps.sichtbareMandate(d.id).includes(p.id || p.user_id);
  return { async versorge(documents, profiles, katalog = {}) {
    if (!Array.isArray(documents) || documents.length > 200 || !Array.isArray(profiles) || profiles.length > 100)
      throw new Error("inhaltsversorgung-eingabe-zu-gross");
    const aktive = profiles.filter(p => p && !V.isDisabled(p) && V.validateProfile(p).usable);
    const ids = aktive.map(p => p.id || p.user_id);
    if (ids.some(id => typeof id !== "string" || !id) || new Set(ids).size !== ids.length)
      throw new Error("inhaltsversorgung-mandate-ungueltig");
    const bereit = [], befund = [], unique = new Map();
    // Widerspruechliche Quellstaende nie nach Eingabereihenfolge waehlen.
    for (const input of documents) {
      const d = structuredClone(input);
      if (!d?.id || !d.url || d.link_type !== "direct") { befund.push({ id: d?.id || null, status: "luecke", reason: "quelle-nicht-direkt" }); continue; }
      if (require("./dedup").toRawDocumentRow(d)?.id !== d.id) {
        befund.push({ id: d.id, status: "luecke", reason: "kanonische-dokumentkennung-fehlt" }); continue;
      }
      const prior = unique.get(d.id);
      if (prior && A.quellenstandHash(prior) !== A.quellenstandHash(d)) throw new Error("inhaltsversorgung-quellenstand-mehrdeutig");
      unique.set(d.id, prior ? { ...prior, findings: [...(prior.findings || []), ...(d.findings || [])] } : d);
    }
    const queue = [...unique.values()].map(document => {
      const moeglich = [], unklar = [];
      for (const profile of aktive) {
        if (!sichtbar(document, profile)) continue;
        const urteil = vorlaeufig(document, profile, katalog);
        if (urteil.zustand === "moeglich") moeglich.push(profile);
        else if (urteil.zustand === "unklar" || (urteil.zustand === "ohne-bezug"
          && typeof deps.sichtbareMandate === "function" && sichtbar(document, profile))) unklar.push(profile);
      }
      return { document, moeglich, unklar };
    });
    if (!deps.reihenfolgeErhalten) queue.sort((a, b) => Number(b.moeglich.length > 0) - Number(a.moeglich.length > 0)
      || a.document.id.localeCompare(b.document.id));
    for (const { document: doc, moeglich, unklar } of queue) {
      if (!moeglich.length && !unklar.length) { befund.push({ id: doc.id, status: "nicht-ausgewaehlt", reason: "kein-vorlaeufiger-bezug" }); continue; }
      const leseReserve = 2 * require("./verstehen-restzeit").speicherTimeoutMs(deps.env || process.env);
      if (auftrag.deadlineMs - now().getTime() < leseReserve) { befund.push({ id: doc.id, status: "vertagt", reason: "restzeit-vor-beleglesung" }); continue; }
      // Vorhandene spezialisierte/generische Originalbelege behalten. Dieser
      // Bestandsversuch darf niemals selbst einen neuen Abruf reservieren.
      const bestand = await B.beschaffeArtikelkontext(doc, { versuch: true }, {
        ...deps, now, erlaubeNeuenAbruf: () => "nur-bestand"
      });
      const result = bestand.ok ? bestand : await B.beschaffeArtikelkontext(doc, { versuch: true, kontext: "einstieg" }, {
        ...deps, now,
        erlaubeNeuenAbruf: () => {
          if (!hosts.has(new URL(doc.url).hostname)) return "herausgeber-nicht-freigegeben";
          // Bereits gespeicherte positive/negative Belege und gesperrte Hosts
          // verbrauchen keine neue Auswahl. Sonst blockiert derselbe Vorderteil
          // jeden weiteren begrenzten Queue-Auftrag.
          if (kandidaten >= LIMITS.kandidaten) return "kandidatenkontingent";
          if (!moeglich.length && unklare >= LIMITS.unklar) return "unklarkontingent";
          kandidaten++; if (!moeglich.length) unklare++;
          if (neueAbrufe >= LIMITS.neueAbrufe) return "laufgrenze";
          // Konservativ wie im vorhandenen Ausfuehrungsadapter: Netz + sechs
          // Speicherzugriffe + Reserve. Deadline bleibt fuer ALLE Batches gleich.
          if (auftrag.deadlineMs - now().getTime() < 25000 + 6 * require("./verstehen-restzeit").speicherTimeoutMs(deps.env || process.env))
            return "restzeit-vor-abruf";
          neueAbrufe++; return null;
        }
      });
      if (!result.ok) { befund.push({ id: doc.id, status: "luecke", reason: result.reason }); continue; }
      const beleg = A.pruefeArtikelkontext([doc], result.beleg);
      // Der begrenzte Einstieg ist kein Vollartikel. Fehlende Stichworte darin
      // beweisen keinen fehlenden Fachbezug im restlichen Artikel. Die heutige
      // Quellenbindung bleibt erhalten; das vorhandene Understanding bewertet.
      const mandatIds = aktive.filter(p => sichtbar(doc, p)).map(p => p.id || p.user_id);
      bereit.push({ document: doc, beleg, mandatIds });
      befund.push({ id: doc.id, status: "belegt", mandatIds });
    }
    return { bereit, befund, grenzen: { ...LIMITS, kandidaten, unklare, neueAbrufe } };
  } };
}
// Anschluss an den vorhandenen Understanding-CAS, ohne neuen Abruf. Der Caller
// verwendet weiterhin dessen Budget-/Frist-/Modellstartvertrag.
function artikelVersorgung(eintrag) {
  const gespeichert = structuredClone(eintrag);
  return async (documents, { cas, deadlineMs } = {}) => {
    if (!cas || !Number.isFinite(deadlineMs) || deadlineMs <= Date.now())
      return { angefordert: true, ok: false, reason: "cas-oder-restzeit-fehlt" };
    const sicherheit = require("./sourceSafety").assessLink(gespeichert.document?.url);
    if (sicherheit.blocked || sicherheit.suspicious || sicherheit.shortener || sicherheit.aggregator)
      return { angefordert: true, ok: false, reason: "quelle-nicht-zulaessig" };
    try { return { angefordert: true, ok: true, beleg: A.pruefeArtikelkontext(documents, gespeichert.beleg) }; }
    catch { return { angefordert: true, ok: false, reason: "quellenbindung-abweichend" }; }
  };
}
module.exports = { LIMITS, vorlaeufig, erzeugeInhaltsversorgung, artikelVersorgung };
