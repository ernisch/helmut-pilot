"use strict";
// Ein manueller, einmaliger Vorstartcheck. Keine Aktivierung, kein500er Lauf.
const crypto = require("node:crypto");
const { hash, profilHash } = require("../lib/helmut/briefing-speicher");
const K = require("../lib/helmut/testkosten-budget");
const QUITTUNG = "lage-vorstart-20260926-a", TAG = "2026-09-26";
// Genau ein neuer Nachweis nach PR594; der erste Auftrag bleibt verbraucht.
const ZEITBEZUG = Object.freeze({ auftrag:"zeitbezug", quittung:"lage-zeitbezug-20260926-a",
  profilHash:"0178727cc56dc0c9b8a0d17a655bfe434b0aecab80b92debed92e74175a4b869",
  altHash:"70352fdefb0f86b8bc56c52106bd35b379dab61b287b3be2478b396ae08b0ea6" });
// Neue Grundlage: belegter Promptwiderspruch beseitigt, Datumsbindung vor dem
// zweiten Modellaufruf. Beide vorherigen Quittungen bleiben verbraucht.
const DATUMSBINDUNG = Object.freeze({ ...ZEITBEZUG, auftrag:"datumsbindung", quittung:"lage-datumsbindung-20260926-a" });
// Ein begrenzter Nachweis mit mittlerem Pruefaufwand nach fachlich falschem
// Profilurteil bei korrekter Eingabe. Kein neues Modell, keine weitere Runde.
const MANDATSPRUEFUNG = Object.freeze({ ...ZEITBEZUG, auftrag:"mandatspruefung", quittung:"lage-mandatspruefung-20260926-a" });
// Neue Grundlage nach belegtem amtlichen Quellenfix: genau ein Bundestags-
// Artikelstand muss vor der Vorschau und vor JEDEM bezahlten Aufruf erneut
// nachgewiesen sein. Das ist KEIN Reparaturauftrag: der vorhandene Tagessatz muss
// fehlen, alte Quittungen bleiben unberuehrt. Kein eigener Parser; Inhalt und
// Zeitvertrag kommen ausschliesslich aus den bestehenden Lesern.
const ARTIKELSTAND = Object.freeze({ auftrag:"artikelstand", quittung:"lage-artikelstand-20260926-a",
  profilHash:"5fed1a61b4ba022a9722181f6c3fd06be5b3b4917cf3d3d3d1ff70f048364a4c",
  vorgangId:"vg-bundespolizeigesetz-20260925-c1afab",
  quelleId:"rd-f757f0b844a673c91894dee250fe77946d35b7032aea0ce69f94c69bd5033d83",
  standHash:"f757f0b844a673c91894dee250fe77946d35b7032aea0ce69f94c69bd5033d83",
  absatzHash:"a094a6458c67347fa2817dd3dbf7a9fa2ba5eec3ea149c86619a09408aa4d060",
  publikationstag:"2026-09-25", absatzZeichen:602 });
// Eigener Nachweis nach Korrektur der belegten Vermischung zweier Medienquellen.
// Die gescheiterte Artikelstand-Quittung wird nur gelesen und nie wiederverwendet.
const EINZELQUELLE = Object.freeze({ ...ARTIKELSTAND, auftrag:"einzelquelle",
  quittung:"lage-einzelquelle-20260926-a" });
const MANDATSAUSWAHL = Object.freeze({ ...ARTIKELSTAND, auftrag:"mandatsauswahl",
  quittung:"lage-mandatsauswahl-20260926-a" });
const ZUSTAENDIGKEIT = Object.freeze({ ...ARTIKELSTAND, auftrag:"zustaendigkeit",
  quittung:"lage-zustaendigkeit-20260926-a" });
const MANDATSURTEIL = Object.freeze({ ...ARTIKELSTAND, auftrag:"mandatsurteil",
  quittung:"lage-mandatsurteil-20260926-a" });
// Eigener Generatornachweis nach dem fachlich bestandenen Vierfall-Nachweis. Artikelstand,
// Profil und Quelle bleiben unveraendert; es laeuft der normale Einmallauf (2 Aufrufe,
// 0,50 USD, 240 s) mit Generierung, Review und Speichern/Ruecklesen.
const GENERATORNACHWEIS = Object.freeze({ ...ARTIKELSTAND, auftrag:"generatornachweis",
  quittung:"lage-generatornachweis-20260926-a" });
// Neue Grundlage: strict/low-Generator mit privater Auswahlbegruendung.
// Die gescheiterte Generatorquittung bleibt verbraucht und wird nur gelesen.
const AUSWAHLBEGRUENDUNG = Object.freeze({ ...ARTIKELSTAND, auftrag:"auswahlbegruendung",
  quittung:"lage-auswahlbegruendung-20260926-a" });
const PRUEFAUFWAND = Object.freeze({ ...ARTIKELSTAND, auftrag:"pruefaufwand",
  quittung:"lage-pruefaufwand-20260926-b" });
// Einzige zulaessige Vorgaengerquittung: der erfolgreich abgeschlossene Vierfall-Nachweis
// dieses Laufs und Commits. Sie wird ausschliesslich gelesen und nie umgeschrieben.
const GENERATOR_VORG = Object.freeze({ runId:"nachlauf500-36249646222",
  commit:"700001011b971cb0d1eb3dd552905fd66601e4c6",
  paketHash:"5829cffed6370571424550153403b90f88cfe122ceb511d3a04d7bc8f8ba62bb",
  faelle:Object.freeze([Object.freeze({ id:"polizei-haushalt",erwartet:true }),
    Object.freeze({ id:"sanktionen-auswaertiges",erwartet:true }),
    Object.freeze({ id:"private-heizkosten-haushalt",erwartet:false }),
    Object.freeze({ id:"energiesteuer-auswaertiges",erwartet:false })]) });
const MAX_MS = 240000, MAX_USD = 0.50;
const fordere = (ok, grund) => { if (!ok) throw new Error("lage-vorstart-" + grund); };
const bindung = p => hash({ id:p.id, profilHash:profilHash(p) });
const url = value => require("../lib/helmut/dedup").canonicalizeUrl(value);
function konfiguration(env, commit, jetzt = Date.now()) {
  const auftrag = env.HELMUT_VORSTART_AUFTRAG || "erstpruefung";
  const reparatur = [ZEITBEZUG,DATUMSBINDUNG,MANDATSPRUEFUNG].find(x => x.auftrag === auftrag);
  const artikelauftrag = [ARTIKELSTAND,EINZELQUELLE,MANDATSAUSWAHL,ZUSTAENDIGKEIT,MANDATSURTEIL,GENERATORNACHWEIS,AUSWAHLBEGRUENDUNG,PRUEFAUFWAND].find(x => x.auftrag === auftrag);
  const artikelstand = Boolean(artikelauftrag);
  fordere(auftrag === "erstpruefung" || Boolean(reparatur) || artikelstand,"auftrag");
  fordere(!reparatur || env.HELMUT_VORSTART_PROFIL === reparatur.profilHash,"reparaturbindung");
  fordere(!artikelstand || env.HELMUT_VORSTART_PROFIL === ARTIKELSTAND.profilHash,"artikelstandbindung");
  fordere(/^[a-f0-9]{40}$/.test(commit || "") && env.HELMUT_VORSTART_COMMIT === commit
    && env.GITHUB_SHA === commit && env.GITHUB_ACTIONS === "true"
    && env.GITHUB_REPOSITORY === "ernisch/helmut-pilot" && env.GITHUB_REF === "refs/heads/main"
    && env.GITHUB_EVENT_NAME === "workflow_dispatch" && env.GITHUB_RUN_ATTEMPT === "1", "runtime");
  fordere(/^[a-f0-9]{64}$/.test(env.HELMUT_VORSTART_PROFIL || "")
    && /^[0-9]{5,20}$/.test(env.GITHUB_RUN_ID || ""), "bindung");
  fordere(new Date(jetzt).toISOString().slice(0,10) === TAG
    && new Date(jetzt + MAX_MS).toISOString().slice(0,10) === TAG, "tag");
  return { commit, profilHash:env.HELMUT_VORSTART_PROFIL, runId:"nachlauf500-" + env.GITHUB_RUN_ID,
    reparatur:Boolean(reparatur), artikelstand, mandatsurteil:auftrag === MANDATSURTEIL.auftrag,
    pruefaufwand:auftrag === PRUEFAUFWAND.auftrag,
    generatornachweis:[GENERATORNACHWEIS.auftrag,AUSWAHLBEGRUENDUNG.auftrag].includes(auftrag),
    altHash:reparatur?.altHash || null,
    quittung:artikelstand ? artikelauftrag.quittung : (reparatur?.quittung || QUITTUNG) };
}
function pruefeEinzelquellenVorgaenger(alt, auftrag = EINZELQUELLE.quittung) {
  const vorgaenger = {
    [EINZELQUELLE.quittung]:["nachlauf500-36243162049","d826ad1ef3f64cb578821a5e0b60e98105a9f5ee"],
    [MANDATSAUSWAHL.quittung]:["nachlauf500-36244835548","13a152e8bb880a97435cbc0a8b130248980c69a7"],
    [ZUSTAENDIGKEIT.quittung]:["nachlauf500-36246123158","7d398ee914f1b713e6beccb930789846f657dedd"],
    [MANDATSURTEIL.quittung]:["nachlauf500-36247202801","642b2d0717ce2d6a4b19509792296e9d7af52295"]
  }[auftrag];
  fordere(vorgaenger,"altquittung");
  fordere(alt?.status === "gestoppt" && alt.ok === false
    && alt.runId === vorgaenger[0] && alt.idHash === ARTIKELSTAND.profilHash
    && alt.runtimeCommit === vorgaenger[1]
    && alt.grund === "ai-text-source-support" && alt.gespeichert === false
    && alt.freigegebeneAufrufe === 2 && alt.offeneKosten === 0
    && alt.profileUnveraendert === true && alt.lesebeweis?.absatzHash === ARTIKELSTAND.absatzHash,
    "altquittung");
}
// Der private Fachbeleg muss die sechs unabhaengigen Paarurteile korrekt enthalten. Geprueft
// wird exakt dieselbe Mindeststruktur wie im Vierfall-Nachweis, hier nur lesend.
function generatorPaareKorrekt(paare) {
  const keys = new Set();
  return Array.isArray(paare) && paare.length === 6 && paare.every(r => {
    const key = `${r?.erster_absatz}:${r?.zweiter_absatz}`;
    const ok = Number.isInteger(r?.erster_absatz) && Number.isInteger(r?.zweiter_absatz)
      && r.erster_absatz >= 0 && r.erster_absatz < r.zweiter_absatz && r.zweiter_absatz < 4
      && !keys.has(key) && r.eigenstaendige_sachverhalte === true
      && typeof r.pruefbegruendung === "string" && r.pruefbegruendung.trim()
      && r.pruefbegruendung.length <= 800;
    keys.add(key); return ok;
  });
}
// Eigene strenge Vorgaengerpruefung: NUR die erfolgreich abgeschlossene Vierfallquittung
// obigen Laufs/Commits wird akzeptiert. Verlangt vier Fall-IDs mit erwartet = erhalten
// (true,true,false,false) und bestanden, sechs belegte Paarurteile und paarvergleich true
// samt gebundenem Pakethash, genau einen freigegebenen Aufruf, keine offenen Kosten,
// unveraenderten Profilbestand und keinen gespeicherten Lage-Text.
function pruefeGeneratorVorgaenger(alt) {
  const bilanz = Array.isArray(alt?.bilanz) ? alt.bilanz : [];
  const faelleKorrekt = bilanz.length === GENERATOR_VORG.faelle.length
    && GENERATOR_VORG.faelle.every(soll => {
      const treffer = bilanz.filter(r => r?.id === soll.id);
      return treffer.length === 1 && treffer[0].erwartet === soll.erwartet
        && treffer[0].erhalten === soll.erwartet && treffer[0].bestanden === true; });
  const paarBeleg = alt?.paarvergleich === true
    && generatorPaareKorrekt(alt?.fachbeleg?.antwort?.vergleiche);
  fordere(alt?.status === "abgeschlossen" && alt?.ok === true && alt?.grund === null
    && alt?.quittungsschluessel === MANDATSURTEIL.quittung && alt?.runId === GENERATOR_VORG.runId
    && alt?.runtimeCommit === GENERATOR_VORG.commit && alt?.idHash === ARTIKELSTAND.profilHash
    && alt?.profile === 1 && alt?.sollFaelle === 4 && faelleKorrekt && paarBeleg
    && alt?.paketHash === GENERATOR_VORG.paketHash && alt?.freigegebeneAufrufe === 1
    && alt?.offeneKosten === 0 && alt?.profileUnveraendert === true
    && alt?.gespeicherterLageText === false, "generator-vorgaenger");
}
function pruefeAuswahlVorgaenger(alt) {
  fordere(alt?.status === "gestoppt" && alt.ok === false
    && alt.quittungsschluessel === GENERATORNACHWEIS.quittung
    && alt.runId === "nachlauf500-36250788961"
    && alt.runtimeCommit === "1d24245e2556d395bb73dd6d61aa9495a04c27f1"
    && alt.idHash === ARTIKELSTAND.profilHash
    && alt.grund === "ai-text-source-support" && alt.gespeichert === false
    && alt.freigegebeneAufrufe === 2 && alt.offeneKosten === 0
    && alt.profileUnveraendert === true
    && alt.lesebeweis?.absatzHash === ARTIKELSTAND.absatzHash,
    "auswahl-vorgaenger");
}
function pruefePruefaufwandTransportVorgaenger(alt) {
  // Lauf a wurde vom alten Transport tatsaechlich auf minimal zurueckgesetzt.
  // Seine Quittung bleibt unveraendert verbraucht; b verlangt genau diesen Beleg.
  fordere(alt?.status === "gestoppt" && alt.ok === false
    && alt.quittungsschluessel === "lage-pruefaufwand-20260926-a"
    && alt.runId === "nachlauf500-36254207276"
    && alt.runtimeCommit === "61d4772f4116dd04d07ab699cc60fa94daa9736a"
    && alt.idHash === ARTIKELSTAND.profilHash
    && alt.grund === "sollfall-fachlich-abgelehnt"
    && alt.freigegebeneAufrufe === 1 && alt.offeneKosten === 0
    && alt.profileUnveraendert === true && alt.gespeicherterLageText === false
    && alt.paketHash === "f84d558e5317d383200445da2ebfe8182f3cd448efe8fa4c45d5784209a9c80e"
    && alt.fachbeleg?.antwortHash === "46a84496a16fd552faabd0bd12ce96cf0878ce65c86eeea394aab37370d857d2"
    && hash(alt.fachbeleg?.antwort) === alt.fachbeleg?.antwortHash,
    "pruefaufwand-transport-vorgaenger");
}
function pruefePruefaufwandVorgaenger(alt) {
  fordere(alt?.status === "gestoppt" && alt.ok === false
    && alt.quittungsschluessel === AUSWAHLBEGRUENDUNG.quittung
    && alt.runId === "nachlauf500-36252632130"
    && alt.runtimeCommit === "c4cd05f3ff94776ee4dd5be5810b54192795a00d"
    && alt.idHash === ARTIKELSTAND.profilHash
    && alt.grund === "ai-text-source-support" && alt.gespeichert === false
    && alt.freigegebeneAufrufe === 2 && alt.offeneKosten === 0
    && alt.profileUnveraendert === true
    && alt.lesebeweis?.absatzHash === ARTIKELSTAND.absatzHash,"pruefaufwand-vorgaenger");
}
// Inhaltlicher Nachweis der neuen Grundlage. Fuer den Inhalt gilt ausschliesslich der
// bestehende Stand-Leser; der Zeitvertrag und die tatsaechliche Texteingabe entstehen
// ueber den bestehenden Lage-Quellenbeleg, niemals ueber einen parallelen Parser.
function pruefeGrundlage(quelle, erwartet = ARTIKELSTAND, jetzt = Date.now()) {
  const artikelstand = require("../lib/helmut/bundestag-artikelstand");
  let stand = null;
  try { stand = artikelstand.leseArtikelstand(quelle); } catch { stand = null; }
  fordere(stand && stand.standHash === erwartet.standHash
    && stand.publikationstag === erwartet.publikationstag
    && stand.absatzHash === erwartet.absatzHash,"artikelstand-stand");
  fordere(typeof quelle.summary === "string" && quelle.summary.length === erwartet.absatzZeichen
    && crypto.createHash("sha256").update(quelle.summary).digest("hex") === stand.absatzHash,"artikelstand-absatz");
  const belegModul = require("../lib/helmut/lage-quellenbeleg");
  let eingabe = null;
  try {
    eingabe = belegModul.baueEingabe([{ vorgang_id:erwartet.vorgangId }],
      { [erwartet.vorgangId]:[quelle] }, new Date(jetzt));
  } catch { eingabe = null; }
  fordere(eingabe?.length === 1 && eingabe[0].vorgang_id === erwartet.vorgangId
    && eingabe[0].quellenbelege?.length === 1,"artikelstand-eingabe");
  const beleg = eingabe[0].quellenbelege[0];
  fordere(beleg.titel === stand.titel && beleg.veroeffentlichtAm === erwartet.publikationstag
    && beleg.auszug === quelle.summary && url(beleg.url) === stand.url,"artikelstand-eingabe");
  return Object.freeze({ vorgangId:erwartet.vorgangId, quelleId:erwartet.quelleId,
    standHash:stand.standHash, absatzHash:stand.absatzHash, publikationstag:stand.publikationstag,
    absatzZeichen:quelle.summary.length, artikelUrl:stand.url, artikelTitel:stand.titel,
    lageQuelleId:beleg.quelle_id, lageEingabeHash:belegModul.hashEingabe(eingabe) });
}
// Genau die gebundene Kennung am richtigen Vorgang; fehlt sie, ist das fail closed.
function artikelstandGrundlage(quellen, erwartet = ARTIKELSTAND, jetzt = Date.now()) {
  const treffer = (Array.isArray(quellen) ? quellen : []).filter(q => q && q.id === erwartet.quelleId);
  fordere(treffer.length === 1,"artikelstand-quelle");
  return pruefeGrundlage(treffer[0], erwartet, jetzt);
}
// Die Grundlage muss im ECHTEN Vorschauergebnis als Karte des richtigen Vorgangs liegen.
function pruefeKarte(vorschau, basis) {
  const karten = Array.isArray(vorschau?.vorgaenge) ? vorschau.vorgaenge : [];
  const karte = karten.find(k => k && (k.vorgangId || k.id) === basis?.vorgangId);
  fordere(karte && basis?.artikelUrl && Array.isArray(karte.sources)
    && karte.sources.some(s => s && s.title === basis.artikelTitel && url(s.url) === basis.artikelUrl),
    "artikelstand-karte");
}
function pruefeAufruf({ calls, start, jetzt, kosten, laufkosten, reserve, bestand, grundlinie }) {
  fordere(Number.isInteger(calls) && calls >= 0 && calls < 2, "aufrufgrenze");
  fordere(jetzt >= start && jetzt - start < MAX_MS - 60000
    && new Date(jetzt).toISOString().slice(0,10) === TAG, "restzeit");
  fordere(kosten?.startklar === true && kosten.offeneReservierungen === 0
    && K.tageslimitGueltig(kosten.limitUsd) && Number.isFinite(kosten.gebundenUsd)
    && kosten.gebundenUsd >= 0 && Number.isFinite(reserve) && reserve > 0
    && Number.isFinite(laufkosten) && laufkosten >= 0
    && laufkosten + reserve <= MAX_USD && (kosten.limitUsd === 4 ? kosten.gebundenUsd + reserve < 4
      : kosten.gebundenUsd + reserve <= kosten.limitUsd), "kosten");
  fordere(typeof grundlinie === "string" && bestand === grundlinie, "profilbestand");
}
async function einmallauf(cfg, d) {
  const start = d.now(), grundlinie = await d.ruhe(), profile = await d.profile();
  fordere(profile?.id && bindung(profile) === cfg.profilHash, "profil");
  const vorher = await d.cache(profile.id);
  const vorherHash = hash(vorher || null);
  if (cfg.reparatur) fordere(vorher?.payload && hash(vorher.payload) === cfg.altHash
    && !d.gueltig(vorher.payload),"reparatur-altstand");
  else fordere(!vorher, "bestehender-tagessatz");
  let basis = cfg.artikelstand ? await d.artikelstand() : null;
  const vorschau = await d.vorschau(profile);
  fordere(vorschau?.available === true && vorschau.pendingNarrative === true
    && vorschau.vorgaenge?.length >= 2,"quellen-vorpruefung");
  if (cfg.artikelstand) pruefeKarte(vorschau, basis);
  let calls = 0;
  const pruefe = async () => {
    const [kosten,laufkosten,bestand] = await Promise.all([d.kosten(),d.laufkosten(),d.bestand()]);
    pruefeAufruf({ calls,start,jetzt:d.now(),kosten,laufkosten,reserve:d.reserve,bestand,grundlinie });
    // Vor JEDEM bezahlten Aufruf erneut: fehlende oder abweichende Grundlage stoppt
    // ohne jeden Modellaufruf.
    if (cfg.artikelstand) basis = await d.artikelstand();
    if (cfg.reparatur) fordere(hash(await d.cache(profile.id)) === vorherHash,"reparatur-konkurrenz");
  };
  await pruefe();
  if (!d.execute) return { ok:true, plan:true, profile:1, maxAufrufe:2,maxUsd:MAX_USD,maxMs:MAX_MS,
    vorgangskarten:vorschau.vorgaenge.length,profilHash:cfg.profilHash,
    ...(cfg.artikelstand ? { lesebeweis:basis } : {}) };
  const lock = await d.acquire();
  fordere(lock?.granted === true && lock.active === true, "sperre");
  let claimed = false;
  const receipt = { quittungsschluessel:cfg.quittung,runId:cfg.runId,idHash:cfg.profilHash,
    runtimeCommit:cfg.commit,gestartetAm:new Date(start).toISOString(),maxUsd:MAX_USD,maxMs:MAX_MS,maxAufrufe:2,
    ...(cfg.artikelstand ? { lesebeweis:basis } : {}) };
  let out = { ok:false,grund:"technischer-fehler" };
  try {
    fordere(await d.claim({ ...receipt,status:"laeuft" }), "verbraucht"); claimed = true;
    const result = await d.build(profile,{ missingOnly:true,repairIncomplete:cfg.reparatur,costRunId:cfg.runId,
      beforeGenerate:async id => { fordere(id === profile.id,"fremdes-profil"); await pruefe(); calls++; } });
    const saved = await d.cache(profile.id);
    const ok = result?.available === true && result.fromCache === false && calls === 2
      && d.gueltig(saved?.payload)
      && (!cfg.reparatur || (saved?.payload?.vorherigerStand
        && hash(saved.payload.vorherigerStand) === vorherHash));
    out = { ok:Boolean(ok),grund:ok ? null : (result?.reason || "kein-gueltiger-tagessatz"),
      abschnitte:result?.paragraphs?.length || 0,gespeichert:ok,inhaltHash:saved?.payload ? hash(saved.payload) : null };
  } finally {
    // Auch ein Timeout mit offener Vollreserve muss den Einmalauftrag terminal
    // schliessen. Eine misslungene Nachkontrolle ist kein erfolgreicher Lauf.
    let nach = null, kosten = null, laufkosten = null, abschlussFehler = null;
    try { await d.release(); } catch (error) { abschlussFehler = error; }
    try {
      [nach,kosten,laufkosten] = await Promise.all([d.ruhe(),d.kosten(),d.laufkosten()]);
      fordere(nach === grundlinie,"profilbestand");
      fordere(kosten.offeneReservierungen === 0 && Number.isFinite(laufkosten)
        && laufkosten >= 0 && laufkosten <= MAX_USD,"nachkosten");
    } catch (error) { abschlussFehler = abschlussFehler || error; }
    if (abschlussFehler) out = { ...out,ok:false,grund:"nachkontrolle-fehlgeschlagen",
      ergebnisGrund:out.grund,abschlussGrund:/^lage-vorstart-[a-z-]+$/.test(abschlussFehler.message || "")
        ? abschlussFehler.message : "technischer-fehler" };
    out = { ...out,...(cfg.artikelstand ? { lesebeweis:basis } : {}),freigegebeneAufrufe:calls,laufkostenUsd:laufkosten,
      profileUnveraendert:nach === grundlinie,offeneKosten:kosten?.offeneReservierungen ?? null,
      funktionsnachweis500:false,automatischeWiederholung:false };
    if (claimed) await d.finish({ ...receipt,...out,status:out.ok ? "abgeschlossen" : "gestoppt",
      beendetAm:new Date(d.now()).toISOString() });
    if (abschlussFehler) throw abschlussFehler;
  }
  return out;
}
async function main(args = process.argv.slice(2), env = process.env) {
  fordere(args.length === 1 && ["--plan","--execute"].includes(args[0]),"argumente");
  const B = require("./verstehen-einmalig-169"), cfg = konfiguration(env,B.echterCommit());
  const S = require("../lib/helmut/storage"), K = require("../lib/helmut/testkosten-budget");
  const execute = args[0] === "--execute";
  fordere(!execute || env.HELMUT_VORSTART_FREIGABE === "EIN_PROFIL_LAGE_MAX_ZWEI_AUFRUFE","freigabe");
  fordere(S.v3StoreReady() && S.profileDbModeEnabled() && S.profileDbExclusiveEnabled()
    && K.aktiv(env) && env.HELMUT_UNDERSTANDING_LOCK === "on" && env.HELMUT_ATOMIC_LOCK === "on"
    && env.HELMUT_TESTLAUF_KOMMUNIKATION === "gesperrt" && !env.HELMUT_LAGE_DEMO,"umgebung");
  if (execute) { const ai = require("../lib/helmut/ai");
    fordere(ai.isAiEnabled() && ai.aiProviderName() === "azure" && ai.understandingModelName() === "gpt-5-mini","modell"); }
  const read = async (table,query) => {
    const r = await fetch(env.SUPABASE_URL.replace(/\/$/,"") + "/rest/v1/" + table + "?" + query,
      { redirect:"error",signal:AbortSignal.timeout(15000),headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer " + env.SUPABASE_SERVICE_ROLE_KEY} });
    fordere(r.status === 200,"lesen");const rows = await r.json();fordere(Array.isArray(rows),"leseformat");return rows;
  };
  let profiles;
  const bestand = async () => {
    const [m,p] = await Promise.all([read("mandate_profiles","select=*&order=user_id.asc&limit=505"),read("profiles","select=*&order=id.asc&limit=506")]);
    fordere(m.length === 500 && p.length === 501 && m.every(r => r.aktiv === false && r.geloescht_at === null),"bestand");
    profiles = m.map(r => S.fromMandateProfileRow(p.find(x => x.id === r.user_id),r));
    return crypto.createHash("sha256").update(JSON.stringify({m,p})).digest("hex");
  };
  const ruhe = async () => {
    const now = encodeURIComponent(new Date().toISOString());
    const [h,j,l,c,a,runs] = await Promise.all([bestand(),
      read("helmut_jobs","select=id&or=(status.neq.erledigt,lease_expires_at.gt."+now+")&limit=1"),
      read("pipeline_locks","select=job_name&expires_at=gt."+now+"&limit=1"),
      read("helmut_verstehen_reservierungen","select=vorgang_id&lease_bis=gt."+now+"&limit=1"),S.readAuthStore(),
      read("process_runs","select=run_id&finished_at=is.null&started_at=gt."
        +encodeURIComponent(new Date(Date.now()-30*60000).toISOString())+"&limit=1")]);
    fordere(!j.length && !l.length && !c.length && !runs.length
      && !Object.values(a.pipelineLocks || {}).some(x => x?.expiresAt > Date.now()),"parallelbetrieb");return h;
  };
  if (cfg.reparatur) {
    const alt = await read("helmut_store","select=data&id=eq."+QUITTUNG+"&limit=1");
    fordere(alt.length === 1 && alt[0].data?.status === "abgeschlossen"
      && alt[0].data.runId === "nachlauf500-36211228745"
      && alt[0].data.idHash === cfg.profilHash && alt[0].data.inhaltHash === ZEITBEZUG.altHash,"altquittung");
  }
  if (cfg.quittung === DATUMSBINDUNG.quittung) {
    const alt = await read("helmut_store","select=data&id=eq."+ZEITBEZUG.quittung+"&limit=1");
    fordere(alt.length === 1 && alt[0].data?.status === "gestoppt"
      && alt[0].data.runId === "nachlauf500-36224558578"
      && alt[0].data.idHash === cfg.profilHash && alt[0].data.grund === "ai-text-source-support","altquittung");
  }
  if (cfg.quittung === MANDATSPRUEFUNG.quittung) {
    const alt = await read("helmut_store","select=data&id=eq."+DATUMSBINDUNG.quittung+"&limit=1");
    fordere(alt.length === 1 && alt[0].data?.status === "gestoppt"
      && alt[0].data.runId === "nachlauf500-36227833079"
      && alt[0].data.idHash === cfg.profilHash && alt[0].data.grund === "ai-text-source-support","altquittung");
  }
  if ([EINZELQUELLE.quittung,MANDATSAUSWAHL.quittung,ZUSTAENDIGKEIT.quittung,MANDATSURTEIL.quittung].includes(cfg.quittung)) {
    const vorher = cfg.quittung === MANDATSURTEIL.quittung ? ZUSTAENDIGKEIT
      : cfg.quittung === ZUSTAENDIGKEIT.quittung ? MANDATSAUSWAHL
      : cfg.quittung === MANDATSAUSWAHL.quittung ? EINZELQUELLE : ARTIKELSTAND;
    const alt = await read("helmut_store","select=data&id=eq."+vorher.quittung+"&limit=1");
    fordere(alt.length === 1,"altquittung");pruefeEinzelquellenVorgaenger(alt[0].data,cfg.quittung);
  }
  if ([GENERATORNACHWEIS.quittung,AUSWAHLBEGRUENDUNG.quittung].includes(cfg.quittung)) {
    const alt = await read("helmut_store","select=data&id=eq."+MANDATSURTEIL.quittung+"&limit=1");
    fordere(alt.length === 1,"generator-vorgaenger");pruefeGeneratorVorgaenger(alt[0].data);
  }
  if (cfg.quittung === AUSWAHLBEGRUENDUNG.quittung) {
    const alt = await read("helmut_store","select=data&id=eq."+GENERATORNACHWEIS.quittung+"&limit=1");
    fordere(alt.length === 1,"auswahl-vorgaenger");pruefeAuswahlVorgaenger(alt[0].data);
  }
  if (cfg.pruefaufwand) {
    const alt = await read("helmut_store","select=data&id=eq."+AUSWAHLBEGRUENDUNG.quittung+"&limit=1");
    fordere(alt.length === 1,"pruefaufwand-vorgaenger");pruefePruefaufwandVorgaenger(alt[0].data);
    const transport = await read("helmut_store","select=data&id=eq.lage-pruefaufwand-20260926-a&limit=1");
    fordere(transport.length === 1,"pruefaufwand-transport-vorgaenger");
    pruefePruefaufwandTransportVorgaenger(transport[0].data);
  }
  fordere(!(await read("helmut_store","select=id&id=eq."+cfg.quittung+"&limit=1")).length,"verbraucht");
  fordere(await K.laufGebundenUsd(cfg.runId,{env}) === 0,"laufkosten-vorhanden");
  const q = execute ? B.quittungsAdapter(env) : null;
  const timer = execute ? setTimeout(() => { console.error("lage-vorstart-harte-laufzeit; kein Retry");process.exit(1); },MAX_MS) : null;
  try {
    const M = cfg.pruefaufwand ? require("./lage-pruefaufwand")
      : cfg.mandatsurteil ? require("./lage-mandatsurteil") : null;
    const lauf = M ? M.einmallauf : einmallauf;
    const result = await lauf(cfg,{ execute,now:Date.now,ruhe,bestand,
      profile:async () => { const found = profiles.filter(p => bindung(p) === cfg.profilHash);fordere(found.length === 1,"auswahl");return found[0]; },
      kosten:async () => K.pruefeStart(await S.readAuthStore(),TAG,await S.leseLlmTageszaehler(new Date().toISOString())),
      kostenNachlauf:async () => {
        const [auth,counter] = await Promise.all([S.readAuthStore(),S.leseLlmTageszaehler(new Date().toISOString())]);
        fordere(counter?.ok === true && Number.isSafeInteger(counter.used) && counter.used >= 0,"kosten-nachlesung");
        const unbekannt = Object.values(auth?.[K.KEY]?.[TAG]?.calls || {}).filter(c => c.status === "ungeklaert").length;
        // Reine Bilanz, keine erneute Startfreigabe; offene Reserven bleiben sichtbar.
        return K.kontrolliere(auth,TAG,unbekannt,counter.used);
      },
      laufkosten:() => K.laufGebundenUsd(cfg.runId,{env}),reserve:K.reservierungHoeheUsd(),
      cache:id => S.getRenderedBriefingV3(id,"lage",require("../lib/helmut/briefing-frische").berlinTagKey(new Date()),{strict:true}),
      acquire:() => S.acquireGlobalUnderstandingLock(MAX_MS+60000),release:() => S.releaseGlobalUnderstandingLock(),
      claim:d => q.claimRun(d),finish:d => q.finishRun(d),build:require("../lib/helmut/lage").buildLageBriefing,
      vorschau:p => require("../lib/helmut/lage").buildLageBriefing(p,{cacheOnly:true}),
      artikelstand:async () => artikelstandGrundlage(await S.getSourcesForVorgang(ARTIKELSTAND.vorgangId),
        ARTIKELSTAND,Date.now()),
      reviewPaket:p => M.ladePaket(p,S),
      reviewQuittung:async () => {
        const rows = await read("helmut_store","select=data&id=eq."+cfg.quittung+"&limit=2");
        fordere(rows.length === 1,"sollfall-quittung-nicht-bestaetigt");return rows[0].data;
      },
      reviewModell:(input,p) => require("../lib/helmut/ai").requestStructuredJson(
        input.prompt,require("../lib/helmut/lage-textqualitaet").SCHEMA,
        {callType:"lageBriefing",politicianId:p.id,runId:cfg.runId,testKostenPhase:"pruefung"},
        "gpt-5-mini",{strict:true,reasoningEffort:cfg.pruefaufwand ? "medium" : "low"}),
      gueltig:require("../lib/helmut/lage-quellenbeleg").gespeicherterTextGueltig });
    console.log(JSON.stringify(result,null,2));return result.ok ? 0 : 1;
  } finally { if (timer) clearTimeout(timer); }
}
if (require.main === module) main().then(c => { process.exitCode=c; }).catch(e => {
  console.log(JSON.stringify({ok:false,grund:/^lage-vorstart-[a-z-]+$/.test(e.message || "") ? e.message : "lage-vorstart-technischer-fehler",automatischeWiederholung:false}));process.exitCode=1;
});
module.exports = {konfiguration,pruefeAufruf,einmallauf,bindung,main,ZEITBEZUG,DATUMSBINDUNG,MANDATSPRUEFUNG,
  ARTIKELSTAND,EINZELQUELLE,MANDATSAUSWAHL,ZUSTAENDIGKEIT,MANDATSURTEIL,GENERATORNACHWEIS,AUSWAHLBEGRUENDUNG,PRUEFAUFWAND,GENERATOR_VORG,
  pruefeEinzelquellenVorgaenger,pruefeGeneratorVorgaenger,pruefeAuswahlVorgaenger,pruefePruefaufwandVorgaenger,pruefePruefaufwandTransportVorgaenger,pruefeGrundlage,artikelstandGrundlage,pruefeKarte};
