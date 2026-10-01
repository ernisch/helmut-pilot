"use strict";

// Offline-Nurlesevertrag fuer exportierte Ist-Ausgaben. Ein gebundenes Urteil
// beweist seine Herkunft/Bedeutung nicht. Keine API, kein Modell, kein Startrecht.
const P = require("./synthetik-500-profile");
const Bereich = require("./briefing-bereichsvertrag");
const LageQuelle = require("./lage-quellenbeleg");
const { artikelUrl } = LageQuelle;
const { fachzeilen } = require("./realkohorte-500-vertrag");
const VERSION = "helmut-synthetik500-nachweis/1";
const PLAN_VERSION = "helmut-synthetik500-sollplan/1";
const STATUS = Object.freeze(["fehlend", "doppelt", "hashgedriftet", "technisch-fehlerhaft", "leer", "unbrauchbar", "positiv"]);
const KRITERIEN = Object.freeze({
  mandatsbezug: "Individuelle fiktive Szenariofelder korrekt nutzen; keine reale Personenpersonalisierung behaupten.",
  ebenenbindung: "Bundestag/Berlin/Brandenburg und Zustaendigkeit richtig trennen; keine Umdeklaration.",
  quellenbindung: "Jede Tatsachenbehauptung an erreichbaren Artikel und Originalbeleg binden; KI-Einordnung getrennt und fehlbar kennzeichnen.",
  profilschutz: "Keine fremden Profilinformationen oder private Inhalte; alle 500 gleich pruefen.",
  bereichsrolle: "Lage: Sachstand/Bedeutung/Unsicherheit; Briefing: heutige Prioritaet und naechster Schritt, kein zweiter Sachbericht.",
  bereichstrennung: "Alle Kernaussagen der gemeinsamen Lage-/Briefing-/Radaransichten vergleichen. Umformulierte Wiederholung ohne Mehrwert ablehnen; knappen Entscheidungsverweis begruenden.",
  radarbindung: "Keine erfundenen persoenlichen Treffer fuer fiktive Namen. Ueber dich bleibt leer; Umfeldsignale brauchen Originalquellen und Zeitbeleg. Keine Prognose aus Artikelzahl.",
  zeitbezug: "Briefing braucht eine veroeffentlichte Quelle im vorab gebundenen Fenster oder eine quellenbelegte heutige Frist. Frische allein ist kein Wichtigkeitsurteil. Lage darf relevant bleiben.",
});
const fordere = (ok, code) => { if (!ok) throw new Error("synthetik500-nachweis-" + code); };
const txt = (v, n = 1) => typeof v === "string" && v.trim().length >= n;
const sha = v => /^[a-f0-9]{64}$/.test(v || "");
const zeit = v => typeof v === "string" && v.includes("T") && Boolean(require("./quellen-zeitvertrag").publikationsdatum(v));
const identitaetenHash = rows => P.hash([...rows].sort((a, b) => String(a?.id).localeCompare(String(b?.id))));
const key = r => `${r?.mandatsId}\u0000${r?.bereich}`;
const hashOhne = (o, feld) => { const x = { ...o }; delete x[feld]; return P.hash(x); };
const gruppiere = (rows, schluessel) => {
  const m = new Map();
  for (const r of rows) { const k = schluessel(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return m;
};
function erzeugeSollplan(paket, kontext) {
  P.pruefePaket(paket);
  fordere(kontext && /^synthetik500-[a-z0-9-]{8,80}$/.test(kontext.operationId || "")
    && /^[a-f0-9]{40}$/.test(kontext.productionCommit || "")
    && /^dpl_[A-Za-z0-9]+$/.test(kontext.deploymentId || "") && sha(kontext.runtimeManifestHash)
    && [kontext.definiertAm, kontext.startsAt, kontext.endsAt, kontext.briefingFensterStart].every(zeit)
    && Date.parse(kontext.definiertAm) < Date.parse(kontext.startsAt)
    && Date.parse(kontext.startsAt) < Date.parse(kontext.endsAt)
    && Date.parse(kontext.endsAt) - Date.parse(kontext.startsAt) <= 4 * 3600000
    && Date.parse(kontext.briefingFensterStart) <= Date.parse(kontext.startsAt), "sollplan-kontext");
  // startsAt ist die vorab gebundene Untergrenze, nicht ein erfundener exakter
  // Aktivierungszeitpunkt. Die native Startquittung liefert den Ist-Beginn.
  const vergleiche = p => ({
    gleicheParteiAnderesParlament: paket.profile.find(q => q.mandatsId !== p.mandatsId && q.partei === p.partei && q.parlament !== p.parlament)?.mandatsId || null,
    anderesParteiGleichesThema: paket.profile.find(q => q.partei !== p.partei && q.themen.some(t => p.themen.includes(t)))?.mandatsId || null,
    andererWahlkreisGleicheEbene: paket.profile.find(q => q.mandatsId !== p.mandatsId && q.parlament === p.parlament && q.wahlkreis !== p.wahlkreis)?.mandatsId || null,
  });
  const plan = { version: PLAN_VERSION, operationId: kontext.operationId,
    productionCommit: kontext.productionCommit, deploymentId: kontext.deploymentId, runtimeManifestHash: kontext.runtimeManifestHash,
    definiertAm: kontext.definiertAm, startsAt: kontext.startsAt, endsAt: kontext.endsAt,
    briefingFensterStart: kontext.briefingFensterStart, paketBindung: { ...paket.bindung },
    kriteriensatz: { ...KRITERIEN },
    abnahmegrenze: "Technische Synthetikversorgung Bundestag/Berlin/Brandenburg; keine reale Mandatspersonalisierung oder deutschlandweite Landesabnahme.",
    leervertrag: "Alle Leerzustaende separat bilanzieren; auch erwartete ruhige Faelle sind kein automatisch bestandener nichtleerer Versorgungstest.",
    sollpositionen: paket.profile.flatMap(p => P.BEREICHE.map(bereich => ({
      mandatsId: p.mandatsId, bereich, profilHash: P.hash(p), parlament: p.parlament,
      bundesland: p.bundesland, partei: p.partei, fraktion: p.fraktion,
      erwartet: "quellengestuetzte-fachlich-brauchbare-ausgabe", ueberDichErwartet: "leer",
      positiveZuordnung: { parlament: p.parlament, bundesland: p.bundesland, themen: [...p.themen], wahlkreis: p.wahlkreis, partei: p.partei, fraktion: p.fraktion },
      negativeZuordnung: { andereMandatsebeneNichtUmdeklarieren: true, andereLandesparlamenteNichtZustaendig: p.parlament !== "bundestag",
        fremdeProfildatenVerboten: true, persoenlicheNamensmeldungenErwarten: false, datumAusSpeicherungIstKeinTagesanlass: true },
      vergleichsfaelle: vergleiche(p),
      kriterien: Object.keys(KRITERIEN), status: "ausstehend",
    }))),
  };
  return { ...plan, sollplanHash: P.hash(plan) };
}
function pruefeSollplan(plan, paket) {
  fordere(plan && plan.sollplanHash === hashOhne(plan, "sollplanHash"), "sollplan-hash");
  fordere(P.hash(plan) === P.hash(erzeugeSollplan(paket, plan)), "sollplan-drift");
  return plan;
}

// Inhalte werden ungekürzt gehasht; Speicherung/Renderer erfolgt ausserhalb
// dieses Vertrags. Ein Export muss die gemeinsam sichtbaren Radaransichten und
// alle drei Bereichsausgaben liefern, nicht nur eine Zusammenfassung.
function quelleGueltig(q, jetzt) {
  try {
    if (!txt(q?.id) || !artikelUrl(q?.url) || !txt(q?.text) || q.quellenHash !== hashOhne(q, "quellenHash")) return false;
    const treffer = require("./artikelstand").leseStand(q);
    if (treffer) {
      const absatz = treffer.standModul.standZusammenfassung(q.summary, treffer.stand);
      // Der unveraenderte Lagevertrag prueft den VOLLEN Berliner Kalendertag.
      // Weder Mitternacht noch Abrufdatum wird zur Publikationsuhrzeit erfunden.
      const eingabe = LageQuelle.baueEingabe([{ vorgang_id: "nachweis" }], { nachweis: [q] }, new Date(jetzt), {});
      return txt(absatz) && q.text.includes(absatz) && eingabe.length === 1;
    }
    const datum = require("./quellen-zeitvertrag").publikationsdatum(q.published_at);
    return Boolean(datum && Date.parse(datum.iso) <= Date.parse(jetzt));
  } catch { return false; }
}
function hatTagesAnlass(r, plan) {
  try { return Boolean(Bereich.tagesAnlass(r.quellen, new Date(r.erzeugtAm), { start: plan.briefingFensterStart }, r.ko || {})); }
  catch { return false; }
}
function ergebnisHash(r) { return hashOhne(r, "ergebnisHash"); }
function sichtHash(sicht) { return hashOhne(sicht, "sichtHash"); }
function pruefeUrteil(u, r, sicht, plan) {
  const fehler = [];
  if (!u || u.version !== VERSION || u.sollplanHash !== plan.sollplanHash
    || u.ergebnisHash !== r.ergebnisHash || u.sichtHash !== sicht?.sichtHash
    || !txt(u.pruefer) || !zeit(u.geprueftAm) || Date.parse(u.geprueftAm) < Date.parse(r.erzeugtAm)
    || !Array.isArray(u.kriterien) || u.kriterien.length !== Object.keys(KRITERIEN).length
    || new Set(u.kriterien.map(k => k?.kriterium)).size !== Object.keys(KRITERIEN).length)
    return ["fachurteil-fehlt-unvollstaendig-oder-drift"];
  for (const kriterium of Object.keys(KRITERIEN)) {
    const k = u.kriterien.find(x => x?.kriterium === kriterium);
    if (!k || !["bestanden", "nicht-bestanden", "unklar"].includes(k.urteil)
      || !txt(k.begruendung, 30) || !Array.isArray(k.belege) || !k.belege.length) {
      fehler.push(kriterium + "-urteil-ungueltig"); continue;
    }
    for (const b of k.belege) {
      const texte = { ausgabe: r.text, radar: sicht?.radar?.text,
        ...Object.fromEntries(P.BEREICHE.map(a => [a, sicht?.ausgaben?.[a]?.text])) };
      const quelle = r.quellen.find(q => q?.id === b?.quellenId);
      const ziel = b?.ansicht === "quelle" ? quelle?.text : texte[b?.ansicht];
      if (!txt(b?.zitat, 12) || !txt(ziel) || !ziel.includes(b.zitat)) fehler.push(kriterium + "-beleg-abweichend");
    }
    // Quellenpruefung darf nicht nur mit einem Zitat aus der KI-Ausgabe gruen
    // werden. Bedeutung/Zuordnung jedes Fakts bleibt ein separates Fachurteil.
    if (kriterium === "quellenbindung" && !k.belege.some(b => b?.ansicht === "quelle"))
      fehler.push("quellenbindung-originalbeleg-fehlt");
    if (kriterium === "bereichstrennung" && ![...P.BEREICHE, "radar"].every(a => k.belege.some(b => b?.ansicht === a)))
      fehler.push("bereichstrennung-vollansichten-fehlen");
    if (k.urteil !== "bestanden") fehler.push(kriterium + "-" + k.urteil);
  }
  return [...new Set(fehler)];
}
function belegePruefen(plan, belege) {
  const fehler = [];
  const check = (ok, grund) => { if (!ok) fehler.push(grund); };
  const b = belege || {}, ids = [...new Set(plan.sollpositionen.map(r => r.mandatsId))].sort();
  check(b.version === VERSION && b.sollplanHash === plan.sollplanHash && txt(b.exportReferenz)
    && zeit(b.exportiertAm) && Date.parse(b.exportiertAm) >= Date.parse(plan.endsAt), "primaerexport-fehlt-oder-ungebunden");
  const lauf = b.lauf || {}, runtime = lauf.runtimeManifest, profilvertrag = runtime?.profilvertrag;
  check(runtime?.version === "helmut-synthetik500-runtime-manifest/1" && P.hash(runtime) === plan.runtimeManifestHash
    && runtime.profilManifestHash === P.hash(profilvertrag || null) && profilvertrag?.operationId === plan.operationId
    && ["paketHash", "idsHash", "profileHash", "erwartungenHash"].every(k => profilvertrag?.[k] === plan.paketBindung[k])
    && profilvertrag?.endeAm === plan.endsAt && Date.parse(profilvertrag?.vorflugAm) <= Date.parse(plan.startsAt)
    && Date.parse(profilvertrag?.startBis) > Date.parse(plan.startsAt)
    && Date.parse(profilvertrag?.startBis) - Date.parse(profilvertrag?.vorflugAm) <= 300000
    && Date.parse(profilvertrag?.endeAm) - Date.parse(profilvertrag?.vorflugAm) <= 4 * 3600000
    && runtime?.startbelegeGrundlinie?.productionCommit === plan.productionCommit
    && runtime?.startbelegeGrundlinie?.deploymentId === plan.deploymentId, "runtime-primaermanifest-fehlt-oder-drift");
  const aktivQuittung = lauf.aktivierungsQuittung;
  check(aktivQuittung?.version === "helmut-synthetik-500/1" && aktivQuittung?.operationId === plan.operationId
    && P.hash(aktivQuittung) === lauf.aktivierungsQuittungHash && P.hash(aktivQuittung?.manifest || null) === P.hash(profilvertrag || null)
    && aktivQuittung?.zustand === "aktiv" && aktivQuittung?.bestaetigtAktiv === 500
    && zeit(aktivQuittung?.aktiviertAm) && Date.parse(aktivQuittung.aktiviertAm) >= Date.parse(plan.startsAt)
    && Date.parse(aktivQuittung.aktiviertAm) < Date.parse(profilvertrag?.startBis)
    && Date.parse(aktivQuittung.aktiviertAm) < Date.parse(plan.endsAt), "aktivierungs-primaerquittung-fehlt-oder-drift");
  check(lauf.operationId === plan.operationId && lauf.productionCommit === plan.productionCommit
    && lauf.deploymentId === plan.deploymentId && lauf.startsAt === plan.startsAt && lauf.endsAt === plan.endsAt
    && lauf.runtimeManifestHash === plan.runtimeManifestHash && sha(lauf.aktivierungsQuittungHash) && txt(lauf.primaerbeleg), "lauf-deployment-zeitraum-beleg-fehlt");
  const aktive = b.gleichzeitigAktiv || {};
  const roheAktive = aktive.mandate_profiles;
  check(Array.isArray(aktive.profiles) && aktive.profiles.length === 501
    && new Set(aktive.profiles.map(p => p?.id)).size === 501 && ids.every(id => aktive.profiles.some(p => p?.id === id))
    && identitaetenHash(aktive.profiles) === profilvertrag?.profilnullzustand?.profilesHash, "aktive-primaeridentitaeten-fehlen-oder-drift");
  check(Array.isArray(roheAktive) && roheAktive.length === 500 && roheAktive.every(r => r?.aktiv === true)
    && P.hash(roheAktive.map(r => r.user_id).sort()) === P.hash(ids)
    && aktive.bestandsHash === P.hash(roheAktive), "aktive-primaerprofile-fehlen-oder-drift");
  check(zeit(aktive.beobachtetAm) && Date.parse(aktive.beobachtetAm) >= Date.parse(plan.startsAt)
    && Date.parse(aktive.beobachtetAm) < Date.parse(plan.endsAt)
    && Date.parse(aktive.beobachtetAm) >= Date.parse(aktivQuittung?.aktiviertAm)
    && aktive.mandateGesamt === 500 && aktive.identitaetenGesamt === 501
    && Array.isArray(aktive.aktiveIds) && aktive.aktiveIds.length === 500
    && P.hash([...aktive.aktiveIds].sort()) === P.hash(ids) && txt(aktive.primaerbeleg), "exakt500-gleichzeitig-aktiv-nicht-belegt");
  const kosten = b.kosten || {};
  check(zeit(kosten.gelesenAm) && Date.parse(kosten.gelesenAm) >= Date.parse(plan.endsAt)
    && Array.isArray(kosten.utcTage) && kosten.utcTage.length > 0
    && kosten.utcTage.every(t => /^\d{4}-\d{2}-\d{2}$/.test(t?.tag || "")
      && [t.verbrauchtUsd, t.reserviertUsd].every(n => Number.isFinite(n) && n >= 0)
      && t.verbrauchtUsd + t.reserviertUsd <= 6)
    && new Set(kosten.utcTage.map(t => t?.tag)).size === kosten.utcTage.length
    && [kosten.auftragVerbrauchtUsd, kosten.auftragReserviertUsd].every(n => Number.isFinite(n) && n >= 0)
    && kosten.auftragVerbrauchtUsd + kosten.auftragReserviertUsd <= 7 && txt(kosten.primaerbeleg), "kostenbeleg-fehlt-oder-grenze-verletzt");
  if (Array.isArray(kosten.utcTage)) {
    const tage = [];
    for (let ms = Date.parse(plan.startsAt.slice(0, 10) + "T00:00:00Z"); ms <= Date.parse(plan.endsAt); ms += 864e5)
      tage.push(new Date(ms).toISOString().slice(0, 10));
    check(tage.every(tag => kosten.utcTage.some(t => t?.tag === tag)), "kosten-utc-tage-unvollstaendig");
  }
  const ende = b.ende || {}, endlesung = ende.endquittung;
  check(Array.isArray(ende.profiles) && ende.profiles.length === 501
    && identitaetenHash(ende.profiles) === profilvertrag?.profilnullzustand?.profilesHash, "end-primaeridentitaeten-fehlen-oder-drift");
  if (Array.isArray(roheAktive) && Array.isArray(ende.mandate_profiles)) {
    const ohneAktiv = rows => fachzeilen(rows).sort((a, b) => String(a.user_id).localeCompare(String(b.user_id)));
    check(P.hash(ohneAktiv(roheAktive)) === profilvertrag?.profilnullzustand?.mandateFachHash
      && P.hash(ohneAktiv(roheAktive)) === P.hash(ohneAktiv(ende.mandate_profiles)), "profilfachfelder-drift-zwischen-aktiv-und-ende");
  }
  check(Array.isArray(ende.mandate_profiles) && ende.mandate_profiles.length === 500
    && ende.mandate_profiles.every(r => r?.aktiv === false)
    && P.hash(ende.mandate_profiles.map(r => r.user_id).sort()) === P.hash(ids)
    && ende.bestandsHash === P.hash(ende.mandate_profiles), "end-primaerprofile-fehlen-oder-drift");
  check(endlesung?.version === "helmut-synthetik500-status/1" && endlesung?.operationId === plan.operationId && endlesung?.manifestHash === plan.runtimeManifestHash
    && endlesung?.productionCommit === plan.productionCommit && endlesung?.paketHash === plan.paketBindung.paketHash
    && endlesung?.idsHash === plan.paketBindung.idsHash && endlesung?.profilManifestHash === runtime?.profilManifestHash
    && endlesung?.zustand === "beendet" && endlesung?.aktiv === 0 && endlesung?.gesamt === 500 && endlesung?.identitaeten === 501
    && endlesung?.fremdUnveraendert === true && endlesung?.fachfelderUnveraendert === true && endlesung?.quittungBindungBestaetigt === true
    && endlesung?.endeAm === plan.endsAt && endlesung?.beobachtetAm === ende.beobachtetAm
    && ende.endquittungHash === P.hash(endlesung || null), "end-primaerquittung-fehlt-oder-drift");
  check(zeit(ende.beobachtetAm) && Date.parse(ende.beobachtetAm) >= Date.parse(plan.endsAt)
    && ende.aktiv === 0 && ende.mandateGesamt === 500 && ende.identitaetenGesamt === 501
    && Array.isArray(ende.ids) && ende.ids.length === 500 && P.hash([...ende.ids].sort()) === P.hash(ids)
    && sha(ende.endquittungHash) && sha(ende.rueckwegHash) && txt(ende.primaerbeleg)
    && ["frist", "notstopp"].includes(ende.endgrund), "endzustand-rueckweg-nicht-belegt");
  const quellen = b.quellen || {};
  check(Array.isArray(quellen.belege) && quellen.belege.length > 0
    && quellen.belege.every(q => txt(q?.id) && sha(q?.hash) && txt(q?.primaerbeleg))
    && txt(quellen.primaerbeleg), "quellen-vor-und-nachlauf-nicht-belegt");
  return fehler;
}
function bilanziere({ paket, sollplan, ergebnisse = [], sichten = [], urteile = [], belege = null }) {
  pruefeSollplan(sollplan, paket);
  fordere([ergebnisse, sichten, urteile].every(Array.isArray), "export-arrays");
  const byResult = gruppiere(ergebnisse, key), byUrteil = gruppiere(urteile, key), bySicht = gruppiere(sichten, s => s?.mandatsId);
  const erwartete = new Set(sollplan.sollpositionen.map(key));
  const befunde = Object.fromEntries([...STATUS.filter(s => s !== "positiv"), "unerwartet"].map(s => [s, []]));
  // Neben dem disjunkten Sollstatus ALLE Ist-Zeilen beobachten, auch bei
  // doppelten/unerwarteten Slots. Ein Duplikat darf Leer-/Fehlergründe nicht
  // verschlucken; diese Zusatzlisten duerfen sich deshalb ueberschneiden.
  ergebnisse.forEach((r, index) => {
    const ref = { mandatsId: r?.mandatsId, bereich: r?.bereich, exportIndex: index, ergebnisId: r?.ergebnisId || null };
    if (r?.technischerFehler !== null) befunde["technisch-fehlerhaft"].push({ ...ref, grund: "fehler-oder-fehlender-fehlerstatus" });
    if (!txt(r?.text) || r?.leer !== false) befunde.leer.push({ ...ref, grund: r?.leerGrund || "leer-oder-nicht-ausdruecklich-nichtleer" });
  });
  const positionen = sollplan.sollpositionen.map(soll => {
    const rows = byResult.get(key(soll)) || [], gruende = [];
    let status = "positiv", fachurteilGebunden = false;
    if (!rows.length) status = "fehlend";
    else if (rows.length > 1) status = "doppelt";
    else {
      const r = rows[0], sichtRows = bySicht.get(soll.mandatsId) || [], sicht = sichtRows[0];
      const aktiviertAm = belege?.lauf?.aktivierungsQuittung?.aktiviertAm;
      const imFenster = (!aktiviertAm || (zeit(aktiviertAm) && Date.parse(r.erzeugtAm) >= Date.parse(aktiviertAm))) && zeit(r.erzeugtAm) && Date.parse(r.erzeugtAm) >= Date.parse(sollplan.startsAt)
        && Date.parse(r.erzeugtAm) < Date.parse(sollplan.endsAt);
      if (r.version !== VERSION || !txt(r.ergebnisId) || r.operationId !== sollplan.operationId
        || r.sollplanHash !== sollplan.sollplanHash || r.profilHash !== soll.profilHash
        || !sha(r.ergebnisHash) || r.ergebnisHash !== ergebnisHash(r) || !imFenster
        || r.productionCommit !== sollplan.productionCommit || r.deploymentId !== sollplan.deploymentId
        || !txt(r.primaerbeleg?.exportReferenz) || !Number.isSafeInteger(r.primaerbeleg?.zeile) || r.primaerbeleg.zeile < 1
        || !r.rohdatensatz || r.primaerbeleg.rohdatensatzHash !== P.hash(r.rohdatensatz)
        || r.rohdatensatz.text !== r.text || r.rohdatensatz.ergebnisId !== r.ergebnisId) {
        status = "hashgedriftet"; gruende.push("ausgabe-bindung-oder-zeitraum-ungueltig");
      }
      if (r.technischerFehler !== null) {
        if (status === "positiv") status = "technisch-fehlerhaft";
      }
      if (!txt(r.text) || r.leer !== false) {
        if (status === "positiv") status = "leer";
      }
      if (status === "positiv") {
        if (sichtRows.length !== 1 || sicht?.sollplanHash !== sollplan.sollplanHash
          || sicht?.profilHash !== soll.profilHash || !sha(sicht?.sichtHash) || sicht.sichtHash !== sichtHash(sicht)
          || !txt(sicht.radar?.text) || !Array.isArray(sicht.radar?.signale) || !Array.isArray(sicht.radar?.ueberDich) || sicht.radar.ueberDich.length !== 0
          || !P.BEREICHE.every(a => txt(sicht.ausgaben?.[a]?.text) && sha(sicht.ausgaben[a].ergebnisHash)
            && (byResult.get(key({ mandatsId: soll.mandatsId, bereich: a })) || []).length === 1
            && sicht.ausgaben[a].ergebnisHash === byResult.get(key({ mandatsId: soll.mandatsId, bereich: a }))[0].ergebnisHash
            && sicht.ausgaben[a].text === byResult.get(key({ mandatsId: soll.mandatsId, bereich: a }))[0].text))
          gruende.push("gemeinsame-vollansicht-fehlt-drift-oder-erfundener-persoenlicher-radartreffer");
        if (Array.isArray(sicht?.radar?.signale) && sicht.radar.signale.some(signal => {
          try {
          if (!Array.isArray(signal?.quellen) || !signal.quellen.length || signal.quellen.some(q => !quelleGueltig(q, r.erzeugtAm))) return true;
          if (signal.art === "weitere-berichte") return !Bereich.beobachtung(signal.quellen, new Date(r.erzeugtAm));
          if (signal.art === "kuenftige-frist") {
            const tag = Bereich.fristTag(signal.ko, signal.quellen, new Date(r.erzeugtAm));
            return !tag || tag < require("./briefing-frische").berlinTagKey(new Date(r.erzeugtAm));
          }
          return true;
          } catch { return true; }
        })) gruende.push("radar-signal-ohne-vertraglichen-trigger");
        if (!Array.isArray(r.quellen) || !r.quellen.length || r.quellen.some(q => !quelleGueltig(q, r.erzeugtAm))) gruende.push("originalquellen-fehlen-oder-drift");
        if (soll.bereich !== "lage" && Array.isArray(r.quellen)
          && !hatTagesAnlass(r, sollplan))
          gruende.push("briefing-ohne-vertraglichen-tagesanlass");
        const js = byUrteil.get(key(soll)) || [];
        if (js.length !== 1) gruende.push(js.length ? "fachurteil-doppelt" : "fachurteil-fehlt");
        else if (sicht && Array.isArray(r.quellen) && sicht.ausgaben && sicht.radar)
          gruende.push(...pruefeUrteil(js[0], r, sicht, sollplan));
        else gruende.push("fachurteil-eingabe-unvollstaendig");
        if (gruende.length) status = "unbrauchbar"; else fachurteilGebunden = true;
      }
    }
    const position = { mandatsId: soll.mandatsId, bereich: soll.bereich, parlament: soll.parlament,
      bundesland: soll.bundesland, partei: soll.partei, fraktion: soll.fraktion, status, gruende,
      erhalten: rows.length, fachurteilGebunden, ergebnisHashes: rows.map(r => r.ergebnisHash || null) };
    if (status !== "positiv" && !["leer", "technisch-fehlerhaft"].includes(status)) befunde[status].push(position);
    return position;
  });
  for (const r of ergebnisse) if (!erwartete.has(key(r))) befunde.unerwartet.push({ art: "ergebnis", mandatsId: r?.mandatsId, bereich: r?.bereich });
  for (const u of urteile) if (!erwartete.has(key(u))) befunde.unerwartet.push({ art: "fachurteil", mandatsId: u?.mandatsId, bereich: u?.bereich });
  const ids = new Set(paket.profile.map(p => p.mandatsId));
  for (const s of sichten) if (!ids.has(s?.mandatsId)) befunde.unerwartet.push({ art: "sicht", mandatsId: s?.mandatsId });
  const resultIds = gruppiere(ergebnisse.filter(r => txt(r?.ergebnisId)), r => r.ergebnisId);
  const doppelteErgebnisIds = [...resultIds].filter(([, rs]) => rs.length > 1).map(([id]) => id);
  const zaehle = rows => ({ erwartet: rows.length, ...Object.fromEntries(STATUS.map(s => [s, rows.filter(r => r.status === s).length])) });
  const teilbilanz = feld => Object.fromEntries([...new Set(positionen.map(p => p[feld]))].sort().map(wert => [wert, zaehle(positionen.filter(p => p[feld] === wert))]));
  const zaehlungen = zaehle(positionen);
  zaehlungen.summeStimmt = STATUS.reduce((summe, s) => summe + zaehlungen[s], 0) === 1500;
  const belegLuecken = belegePruefen(sollplan, belege);
  // Jeder Quelltext muss auch im erreichbaren Primaerbelegindex gebunden sein.
  const quellindex = Array.isArray(belege?.quellen?.belege) ? belege.quellen.belege : [];
  if (ergebnisse.some(r => Array.isArray(r?.quellen) && r.quellen.some(q => !quellindex.some(b => b?.id === q?.id && b?.hash === q?.quellenHash))))
    belegLuecken.push("ausgabe-quellen-nicht-vollstaendig-im-primaerindex");
  if (sichten.some(s => Array.isArray(s?.radar?.signale) && s.radar.signale.some(signal => Array.isArray(signal?.quellen)
    && signal.quellen.some(q => !quellindex.some(b => b?.id === q?.id && b?.hash === q?.quellenHash)))))
    belegLuecken.push("radar-quellen-nicht-vollstaendig-im-primaerindex");
  const vollstaendigGebunden = zaehlungen.positiv === 1500 && !befunde.unerwartet.length && !doppelteErgebnisIds.length;
  const kern = { version: VERSION, technischReadyOffline: true, primaerherkunftUnabhaengigVerifiziert: false, operationId: sollplan.operationId, sollplanHash: sollplan.sollplanHash,
    modus: "offline-pruefung-exportierter-ist-daten", laufAktiviertAm: belege?.lauf?.aktivierungsQuittung?.aktiviertAm || null, zaehlungen, beobachteteBefunde: befunde,
    befundZaehlungen: Object.fromEntries(Object.entries(befunde).map(([k, v]) => [k, v.length])),
    doppelteErgebnisIds, teilbilanzen: { bereich: teilbilanz("bereich"), parlament: teilbilanz("parlament"),
      bundesland: teilbilanz("bundesland"), partei: teilbilanz("partei"), fraktion: teilbilanz("fraktion") },
    positionen, belegLuecken, vollstaendigeFachurteileGebunden: vollstaendigGebunden,
    primaerbelegvertragVollstaendig: belegLuecken.length === 0,
    belegpaketBereitZurUnabhaengigenPruefung: vollstaendigGebunden && !belegLuecken.length,
    // Offline-Code kann Herkunft exportierter Belege oder semantische Wahrheit
    // nicht selbst bestaetigen. Eine positive Behauptung schliesst kein Endtor.
    unabhaengigeEndpruefung: "offen", productionNachweisErfolgreich: false, fachabnahmeRealerMandate: false,
    keineStichprobe: true, reinLesend: true, modellaufrufe: 0, schreibaufrufe: 0,
    ergebnisseExportHash: P.hash(ergebnisse), sichtenExportHash: P.hash(sichten), urteileExportHash: P.hash(urteile), belegeHash: P.hash(belege),
    status: vollstaendigGebunden && !belegLuecken.length ? "belegpaket-gebunden-endpruefung-offen" : "nachweis-unvollstaendig",
  };
  return { ...kern, nachweisHash: P.hash(kern) };
}
module.exports = { VERSION, PLAN_VERSION, STATUS, KRITERIEN, erzeugeSollplan, pruefeSollplan,
  quelleGueltig, ergebnisHash, sichtHash, pruefeUrteil, belegePruefen, bilanziere };
