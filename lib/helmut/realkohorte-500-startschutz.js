"use strict";

// Lokale Belegstrukturpruefung, ohne Client, Aktivierung oder Rechtsentscheidung.
function erzeugeStartschutz(V, optionen = {}) {
const phaseKey = optionen.synthetik ? "technik" : "phaseA";
const phaseHashKey = optionen.synthetik ? "technikHash" : "phaseAHash";
const runtimeVersion = optionen.synthetik ? "helmut-synthetik500-runtime-manifest/1" : "helmut-realkohorte500-runtime-manifest/1";
const K = require("./testkosten-budget");
const HASH = /^[a-f0-9]{64}$/;
const text = s => typeof s === "string" && s.trim() === s && s.length > 0;
const genau = (o, keys) => o && typeof o === "object" && !Array.isArray(o)
  && Object.keys(o).sort().join("|") === [...keys].sort().join("|");
const istKalendertag = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

function referenz(r) {
  V.fordere(genau(r, ["referenz", "sha256"]) && text(r.referenz) && HASH.test(r.sha256),
    "startschutz-primaerbeleg-fehlt");
}
function frisch(am, jetzt, maxMs = 60000) {
  V.fordere(V.zeit(am) && Date.parse(am) <= jetzt && jetzt - Date.parse(am) <= maxMs,
    "startschutz-beleg-veraltet");
}
function pruefeFachbeleg(b, art) {
  // Ein Bool/selbst vergebener GO-Schalter ist kein qualifizierter Beleg.
  V.fordere(genau(b, ["art", "entscheidungId", "aussteller", "qualifikation", "entschiedenAm",
    "paketHash", "idsHash", "entscheidung", "primaerbelege"])
    && b.art === art && text(b.entscheidungId) && text(b.aussteller) && text(b.qualifikation)
    && V.zeit(b.entschiedenAm) && b.paketHash === V.PAKET_HASH && b.idsHash === V.IDS_HASH
    && b.entscheidung === "fachlich-bestaetigt" && Array.isArray(b.primaerbelege)
    && b.primaerbelege.length > 0, "startschutz-fachentscheidung-fehlt");
  b.primaerbelege.forEach(referenz);
  return V.hash(b);
}

function pruefeBasis({ manifest, snapshot, belege }, paketBytes, jetzt, { nurVorbereitung = false, endManifestHash = null } = {}) {
  V.pruefeManifest(manifest, paketBytes, snapshot);
  const grundKeys = [phaseKey, "fach", "production", "ruhe", "kosten", "landesversorgung"];
  V.fordere(Number.isFinite(jetzt) && genau(belege, nurVorbereitung ? grundKeys : [...grundKeys, "endwaechter"]),
    "startschutz-belegpaket-format");
  const phaseAHash = pruefeFachbeleg(belege[phaseKey], optionen.synthetik ? "synthetik-technische-zugriffssperren-kommunikation-snapshot-rueckweg" : "phase-a-art6-art9-dsfa-datenfluesse-loeschgrenzen");
  const fachHash = pruefeFachbeleg(belege.fach, "500-vorab-erwartungen-und-versorgungsabnahme");
  V.fordere(Date.parse(belege[phaseKey].entschiedenAm) <= jetzt && Date.parse(belege.fach.entschiedenAm) <= jetzt,
    "startschutz-fachentscheidung-zukuenftig");
  const p = belege.production;
  V.fordere(genau(p, ["beobachtetAm", "mainCommit", "productionCommit", "deploymentId", "status", "laufzeit", "primaerbeleg"])
    && /^[a-f0-9]{40}$/.test(p.mainCommit || "") && p.mainCommit === p.productionCommit
    && /^dpl_[a-zA-Z0-9]+$/.test(p.deploymentId || "") && p.status === "READY",
  "startschutz-production-bindung");
  frisch(p.beobachtetAm, jetzt); referenz(p.primaerbeleg);
  const r = p.laufzeit;
  V.fordere(r && r.ok === true && r.reinLesend === true && r.commit === p.productionCommit
    && r.storageSupabase === true && r.v3Bereit === true && r.profileRelational === true
    && r.profileExclusive === true && r.kommunikationGesperrt === true
    && r.testKosten?.aktiv === true && K.tagespolitikGueltig(r.testKosten),
  "startschutz-runtime-schutz-fehlt");
  const ruhe = belege.ruhe;
  V.fordere(genau(ruhe, ["beobachtetAm", "authHash", "mainHash", "offeneJobs", "lebendeLocks", "lebendeLeases", "laufendeProzesse", "primaerbeleg"])
    && HASH.test(ruhe.authHash || "") && HASH.test(ruhe.mainHash || "")
    && [ruhe.offeneJobs, ruhe.lebendeLocks, ruhe.lebendeLeases, ruhe.laufendeProzesse].every(n => n === 0),
  "startschutz-ruhe-fehlt");
  frisch(ruhe.beobachtetAm, jetzt); referenz(ruhe.primaerbeleg);
  const kosten = belege.kosten;
  V.fordere(genau(kosten, ["beobachtetAm", "auth", "counter", "primaerbeleg"]), "startschutz-kosten-beleg-format");
  frisch(kosten.beobachtetAm, jetzt); referenz(kosten.primaerbeleg);
  V.fordere(V.hash(kosten.auth) === ruhe.authHash, "startschutz-authhash-drift");
  const tag = manifest.vorflugAm.slice(0, 10), k = K.pruefeStart(kosten.auth, tag, kosten.counter);
  const a = K.auftragsStand(kosten.auth, tag);
  V.fordere(k.startklar === true && k.tagesbuchVorhanden === true && k.limitUsd === 6
    && a?.limitMicroUsd === 7000000 && a.grenzeInklusive === true,
  "startschutz-kosten-riegel-fehlt");
  const buch = kosten.auth[K.KEY][tag], mk = manifest.kosten;
  V.fordere(mk.tagVerbrauchtMikroUsd === buch.spent
    && mk.tagReserviertMikroUsd === Math.round(k.offeneReserveUsd * 1e6)
    && mk.auftragVerbrauchtMikroUsd + mk.auftragReserviertMikroUsd === a.gebundenMicroUsd,
  "startschutz-kosten-projektion-drift");
  const land = belege.landesversorgung;
  V.fordere(genau(land, ["beobachtetAm", "productionCommit", "berlin", "brandenburg", "nachrichtenfenster", "wirksameFlags", "primaerbeleg"])
    && land.productionCommit === p.productionCommit && genau(land.wirksameFlags, ["landesmodul", "berlin", "brandenburg"])
    && Object.values(land.wirksameFlags).every(v => v === true), "startschutz-landesruntime-fehlt");
  frisch(land.beobachtetAm, jetzt); referenz(land.primaerbeleg);
  const f = land.nachrichtenfenster;
  V.fordere(genau(f, ["vonTag", "bisTag", "primaerbeleg"]) && istKalendertag(f.vonTag) && istKalendertag(f.bisTag)
    && f.vonTag <= f.bisTag, "startschutz-nachrichtenfenster-fehlt");
  referenz(f.primaerbeleg);
  for (const name of ["berlin", "brandenburg"]) {
    const l = land[name];
    V.fordere(genau(l, ["artikelHash", "sichtbareAusgabeHash", "publikationstag", "publishedAt", "primaerbeleg"])
      && HASH.test(l.artikelHash || "") && HASH.test(l.sichtbareAusgabeHash || "")
      && istKalendertag(l.publikationstag) && l.publikationstag >= f.vonTag && l.publikationstag <= f.bisTag
      && (l.publishedAt === null || (V.zeit(l.publishedAt) && Date.parse(l.publishedAt) <= jetzt)),
    "startschutz-landesausgabe-fehlt");
    // Kein pauschales neues Altersverbot, keine erfundene Uhrzeit fuer Tagesbelege.
    const heuteBerlin = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(jetzt);
    V.fordere(l.publikationstag <= heuteBerlin, "startschutz-landesdatum-zukuenftig");
    referenz(l.primaerbeleg);
  }
  if (!nurVorbereitung) {
    const w = belege.endwaechter;
    V.fordere(genau(w, ["jobId", "operationId", "manifestHash", "productionCommit", "beobachtetAm", "zustand", "rpcHash", "primaerbeleg"])
      && /^[0-9]+$/.test(w.jobId || "") && w.operationId === manifest.operationId
      && w.manifestHash === (endManifestHash || V.hash(manifest)) && w.productionCommit === p.productionCommit
      && w.zustand === "bereit-lesend" && HASH.test(w.rpcHash || ""), "startschutz-live-endwaechter-fehlt");
    frisch(w.beobachtetAm, jetzt); referenz(w.primaerbeleg);
  }
  frisch(snapshot.beobachtetAm, jetzt);
  V.fordere(jetzt >= Date.parse(manifest.vorflugAm) && jetzt < Date.parse(manifest.startBis),
    "startschutz-startfenster-verpasst");
  return { ok: true, modus: "lokale-belegstrukturpruefung", operationId: manifest.operationId,
    manifestHash: V.hash(manifest), productionCommit: p.productionCommit, [phaseHashKey]: phaseAHash, fachHash,
    belegHash: V.hash(belege), starttorFreigegeben: false, aktivierungsrecht: false,
    juristischeRichtigkeitDurchCodeBestaetigt: false,
    hinweis: "Referenzstruktur und Bindungen geprueft; Dokumentauthentizitaet/Fachentscheidung sind extern zu bestaetigen. Neues Aktivierungs- und Test-GO bleibt erforderlich." };
}

function pruefe(eingabe, paketBytes, jetzt = Date.now()) {
  return pruefeBasis(eingabe, paketBytes, jetzt);
}

function pruefeVorbereitung(eingabe, paketBytes, jetzt = Date.now()) {
  const r = pruefeBasis(eingabe, paketBytes, jetzt, { nurVorbereitung: true });
  const { belege: b, snapshot } = eingabe;
  return { ...r, modus: "lokale-vorbereitungsstrukturpruefung", aliveWatchErforderlich: false,
    startbelegeGrundlinie: {
      belegHash: V.hash(b), [phaseHashKey]: V.hash(b[phaseKey]), fachHash: V.hash(b.fach),
      productionHash: V.hash(b.production), ruheHash: V.hash(b.ruhe), kostenHash: V.hash(b.kosten),
      landesversorgungHash: V.hash(b.landesversorgung), snapshotHash: V.hash(snapshot),
      authHash: b.ruhe.authHash, mainHash: b.ruhe.mainHash,
      productionCommit: b.production.productionCommit, deploymentId: b.production.deploymentId
    } };
}

function pruefeRuntimeManifestFormat(runtimeManifest) {
  V.fordere(genau(runtimeManifest, ["version", "profilManifestHash", "profilvertrag", "startbelegeGrundlinie"])
    && runtimeManifest.version === runtimeVersion
    && runtimeManifest.profilManifestHash === V.hash(runtimeManifest.profilvertrag), "startschutz-runtime-manifest-format");
  const b = runtimeManifest.startbelegeGrundlinie;
  const hashes = ["belegHash", phaseHashKey, "fachHash", "productionHash", "ruheHash", "kostenHash",
    "landesversorgungHash", "snapshotHash", "authHash", "mainHash"];
  V.fordere(genau(b, [...hashes, "productionCommit", "deploymentId"])
    && hashes.every(k => HASH.test(b[k] || "")) && /^[a-f0-9]{40}$/.test(b.productionCommit || "")
    && /^dpl_[a-zA-Z0-9]+$/.test(b.deploymentId || ""), "startschutz-runtime-grundlinie-format");
  return runtimeManifest;
}

function pruefeRuntimeVorbereitung({ runtimeManifest, snapshot, belege }, paketBytes, jetzt = Date.now()) {
  pruefeRuntimeManifestFormat(runtimeManifest);
  const r = pruefeVorbereitung({ manifest: runtimeManifest.profilvertrag, snapshot, belege }, paketBytes, jetzt);
  V.fordere(V.hash(runtimeManifest.startbelegeGrundlinie) === V.hash(r.startbelegeGrundlinie),
    "startschutz-runtime-grundlinie-drift");
  return { ...r, manifestHash: V.hash(runtimeManifest), profilManifestHash: V.hash(runtimeManifest.profilvertrag) };
}

function pruefeRuntimeAktivierung({ runtimeManifest, snapshot, belege }, paketBytes, jetzt = Date.now()) {
  V.fordere(genau(belege, [phaseKey, "fach", "production", "ruhe", "kosten", "landesversorgung", "endwaechter"]),
    "startschutz-belegpaket-format");
  const { endwaechter, ...grundbelege } = belege;
  const vorbereitet = pruefeRuntimeVorbereitung({ runtimeManifest, snapshot, belege: grundbelege }, paketBytes, jetzt);
  const voll = pruefeBasis({ manifest: runtimeManifest.profilvertrag, snapshot, belege }, paketBytes, jetzt,
    { endManifestHash: vorbereitet.manifestHash });
  return { ...voll, manifestHash: vorbereitet.manifestHash, profilManifestHash: vorbereitet.profilManifestHash,
    startbelegeGrundlinie: vorbereitet.startbelegeGrundlinie, aliveWatchErforderlich: true,
    modus: "lokale-runtime-aktivierungsstrukturpruefung", extraAktivierungsGoErforderlich: true };
}
return { referenz, frisch, pruefeFachbeleg, pruefe, pruefeVorbereitung, pruefeRuntimeManifestFormat,
  pruefeRuntimeVorbereitung, pruefeRuntimeAktivierung };

}
module.exports = { ...erzeugeStartschutz(require("./realkohorte-500-vertrag")), erzeugeStartschutz };
