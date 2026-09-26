"use strict";

// Vier vorab festgelegte Sollfälle in EINEM Quellenreview. Keine Generierung,
// kein auslieferbarer Text, kein Ersatz für die 500er Ergebnisprüfung.
const { hash } = require("../lib/helmut/briefing-speicher");
const Q = require("../lib/helmut/lage-textqualitaet");
const T = require("./lage-vorstart");
const K = require("../lib/helmut/testkosten-budget");
const FAELLE = require("./fixtures/lage-mandatsurteil-vier.json");
const QUITTUNG = "lage-mandatsurteil-20260926-a", MAX_USD = 0.25, MAX_MS = 240000;
const fordere = (ok, grund) => { if (!ok) throw new Error("lage-vorstart-" + grund); };

function paket(profile, vorgaenge) {
  const paragraphs = FAELLE.map(f => structuredClone(f.paragraph));
  const quellen = Q.pruefQuellen(paragraphs, vorgaenge);
  for (const f of FAELLE) {
    const q = quellen.flatMap(v => v.quellenbelege).find(q => q.quelle_id === f.paragraph.quelle_id);
    fordere(q && hash(q) === f.quellenHash && Q.mandatsbezugGueltig(f.paragraph.mandatsbezug, profile), "sollfall-quellenbindung");
  }
  fordere(Q.sachdetailsGebunden(paragraphs.map(p => ({ ...p, quellen_ids: [p.quelle_id] })), quellen), "sollfall-aussagenbindung");
  const prompt = Q.prompt(paragraphs, quellen, profile);
  // Erwartungen reisen ausschließlich im privaten Beleg, niemals im Modellprompt.
  return { paragraphs, quellen, prompt, paketHash: hash({ paragraphs, quellen,
    profil: Q.modellProfilKontext(profile), prompt, schema: Q.SCHEMA, soll: FAELLE.map(f => f.erwartet) }) };
}

async function ladePaket(profile, storage, now = new Date()) {
  const ids = FAELLE.map(f => f.paragraph.vorgang_ids[0]);
  const docs = Object.fromEntries(await Promise.all(ids.map(async id => [id, await storage.getSourcesForVorgang(id)])));
  return paket(profile, require("../lib/helmut/lage-quellenbeleg").baueEingabe(
    ids.map(vorgang_id => ({ vorgang_id })), docs, now));
}

function auswertung(p, answer, profile) {
  const rows = answer?.pruefungen;
  fordere(Array.isArray(rows) && rows.length === 4 && new Set(rows.map(r => r?.absatz)).size === 4
    && rows.every(r => Number.isInteger(r?.absatz) && r.absatz >= 0 && r.absatz < 4), "sollfall-urteile");
  const bilanz = FAELLE.map((f, i) => {
    const r = rows.find(r => r.absatz === i);
    const quelle = p.quellen.flatMap(v => v.quellenbelege).find(q => q.quelle_id === r.quelle_id);
    const belegfeldGueltig = ["titel", "auszug"].includes(r.belegfeld)
      && typeof quelle?.[r.belegfeld] === "string" && quelle[r.belegfeld].trim().length >= 12;
    const check = Q.pruefe([p.paragraphs[i]], p.quellen,
      { pruefungen: [{ ...r, absatz: 0 }], vergleiche: [] }, profile);
    // Ein negativer Sollfall darf nicht wegen fehlender Quelle/Struktur zufällig
    // bestehen: ausschließlich der fachlich falsche Profilbezug ist erwartet.
    const korrekt = belegfeldGueltig && r.profilbezug === f.erwartet && (f.erwartet ? check.ok
      : !check.ok && check.diagnose?.fehler?.length === 1 && check.diagnose.fehler[0] === "profilbezug-fehlt");
    return { id: f.id, erwartet: f.erwartet, erhalten: r.profilbezug, bestanden: Boolean(korrekt) };
  });
  const paare = answer.vergleiche, keys = new Set();
  const paarvergleich = Array.isArray(paare) && paare.length === 6 && paare.every(r => {
    const key = `${r?.erster_absatz}:${r?.zweiter_absatz}`;
    const ok = Number.isInteger(r?.erster_absatz) && Number.isInteger(r?.zweiter_absatz)
      && r.erster_absatz >= 0 && r.erster_absatz < r.zweiter_absatz && r.zweiter_absatz < 4
      && !keys.has(key) && r.eigenstaendige_sachverhalte === true
      && typeof r.pruefbegruendung === "string" && r.pruefbegruendung.trim() && r.pruefbegruendung.length <= 800;
    keys.add(key); return ok;
  });
  return { ok: bilanz.every(r => r.bestanden) && Boolean(paarvergleich), bilanz, paarvergleich: Boolean(paarvergleich) };
}

async function einmallauf(cfg, d) {
  fordere(cfg.quittung === QUITTUNG && cfg.mandatsurteil === true, "sollfall-auftrag");
  const start = d.now(), grundlinie = await d.ruhe(), profile = await d.profile();
  fordere(profile?.id && T.bindung(profile) === cfg.profilHash, "profil");
  const cacheHash = hash(await d.cache(profile.id));
  const input = await d.reviewPaket(profile);
  let calls = 0, proof = null, claimed = false, out = { ok: false, grund: "sollfall-technischer-fehler" };
  const pruefe = async () => {
    const [kosten, laufkosten, bestand, fresh] = await Promise.all([
      d.kosten(), d.laufkosten(), d.bestand(), d.reviewPaket(profile)]);
    T.pruefeAufruf({ calls, start, jetzt: d.now(), kosten, laufkosten, reserve: d.reserve, bestand, grundlinie });
    fordere(calls === 0 && laufkosten + d.reserve <= MAX_USD, "sollfall-kosten");
    fordere(fresh.paketHash === input.paketHash, "sollfall-eingabe-geaendert");
    fordere(hash(await d.cache(profile.id)) === cacheHash, "sollfall-tagessatz-geaendert");
    await d.artikelstand();
  };
  await pruefe();
  const limits = { profile: 1, sollFaelle: 4, maxAufrufe: 1, maxUsd: MAX_USD, maxMs: MAX_MS,
    paketHash: input.paketHash, gespeicherterLageText: false, funktionsnachweis500: false, automatischeWiederholung: false };
  if (!d.execute) return { ok: true, plan: true, ...limits };
  const lock = await d.acquire();
  fordere(lock?.granted === true && lock.active === true, "sperre");
  const receipt = { ...limits, quittungsschluessel: QUITTUNG, runId: cfg.runId, idHash: cfg.profilHash,
    runtimeCommit: cfg.commit, gestartetAm: new Date(start).toISOString() };
  try {
    fordere(await d.claim({ ...receipt, status: "laeuft" }), "verbraucht"); claimed = true;
    await pruefe(); calls++;
    const answer = await d.reviewModell(input, profile);
    proof = { eingabe: input, antwort: answer, antwortHash: hash(answer) };
    const result = auswertung(input, answer, profile);
    out = { ...result, grund: result.ok ? null : "sollfall-fachlich-abgelehnt" };
  } catch (error) {
    out = { ok: false, grund: /^lage-vorstart-[a-z-]+$/.test(error?.message || "")
      ? error.message : "sollfall-modellausgang-unbestaetigt" };
  } finally {
    let nach = null, kosten = null, laufkosten = null;
    try { await d.release(); }
    catch (_) { out = { ...out, ok: false, grund: "sollfall-nachkontrolle" }; }
    try {
      [nach, kosten, laufkosten] = await Promise.all([d.ruhe(), d.kosten(), d.laufkosten()]);
      fordere(nach === grundlinie && hash(await d.cache(profile.id)) === cacheHash
        && kosten.offeneReservierungen === 0 && K.tageslimitGueltig(kosten.limitUsd)
        && Number.isFinite(laufkosten) && laufkosten >= 0 && laufkosten <= MAX_USD
        && (!out.ok || (calls === 1 && laufkosten > 0)) && d.now() - start < MAX_MS, "sollfall-nachkontrolle");
    } catch (_) { out = { ...out, ok: false, grund: "sollfall-nachkontrolle" }; }
    out = { ...out, ...limits, freigegebeneAufrufe: calls, laufkostenUsd: laufkosten,
      profileUnveraendert: nach === grundlinie, offeneKosten: kosten?.offeneReservierungen ?? null };
    if (claimed) {
      const saved = { ...receipt, ...out, status: out.ok ? "abgeschlossen" : "gestoppt",
        beendetAm: new Date(d.now()).toISOString(), fachbeleg: proof };
      await d.finish(saved);
      fordere(hash(await d.reviewQuittung()) === hash(saved), "sollfall-quittung-nicht-bestaetigt");
    }
  }
  return out;
}
module.exports = { QUITTUNG, MAX_USD, MAX_MS, FAELLE, paket, ladePaket, auswertung, einmallauf };
