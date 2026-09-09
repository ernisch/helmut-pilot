"use strict";
// Auswertung eines zuvor ausschliesslich lesend erhobenen Production Abzugs.
// Kein Netzwerk, kein Modell, keine Datenbank und keine Geheimnisse im Bericht.
const assert = require("node:assert/strict");
const { hash } = require("../lib/helmut/testkohorte-direkt500");
const Q = require("../lib/helmut/lage-quellenbeleg");
const B = require("../lib/helmut/briefing-speicher");
function auswerten(e, historisch, commit, vorherigerAbzug = null) {
  assert.equal(e.profiles.length, 500, "Zielmenge muss exakt 500 sein");
  const ids = e.profiles.map(p => p.user_id), ziel = new Set(ids);
  assert.equal(ziel.size, 500, "Doppelte Profilkennung");
  assert.equal(e.jobs.length, 500, "Projektionsplanung fehlt");
  assert.equal(new Set(e.jobs.map(j => j.tenant_id)).size, 500, "Doppelte Projektionsplanung");
  assert(e.jobs.every(j => ziel.has(j.tenant_id)), "Fremde Projektionsplanung");
  const alte = ids.filter(id => !id.startsWith("test-kohorte-")).sort();
  assert.equal(alte.length, 5); assert.equal(ids.length - alte.length, 495);
  const kennung = id => id.startsWith("test-kohorte-") ? id : "dummy-" + (alte.indexOf(id) + 1);
  const historischId = id => id.startsWith("test-kohorte-") ? id : "real-" + (alte.indexOf(id) + 1);
  const day = "2026-09-09";
  assert.equal(new Set(e.rows.map(r => r.id)).size, e.rows.length, "Doppelte Speicherkennung");
  assert(e.rows.every(r => ziel.has(r.user_id) && ["lage", "mandatsbriefing"].includes(r.slot)
    && r.id === `bf-${r.user_id}-${r.slot}-${day}`), "Fremde oder falsch gebundene Ausgabe");
  const quittungen = e.receipt.mandatsErgebnisse;
  assert.equal(quittungen.length, 500); assert.equal(new Set(quittungen.map(r => r.mandatHash)).size, 500);
  assert(ids.every(id => quittungen.some(r => r.mandatHash === hash(id))), "Unvollstaendige Prozesszuordnung");
  const rows = ids.map(id => {
    const text = e.rows.find(r => r.user_id === id && r.slot === "lage");
    const briefing = e.rows.find(r => r.user_id === id && r.slot === "mandatsbriefing");
    const alt = historisch.mandate.find(r => r.mandat === historischId(id));
    assert(alt, "Historischer Vergleich fehlt");
    const receipt = quittungen.find(r => r.mandatHash === hash(id));
    const job = e.jobs.find(j => j.tenant_id === id);
    const pruefung = briefing ? B.pruefeInhalt(briefing.payload.briefing, briefing.payload.lage) : null;
    const inhaltHashGueltig = briefing ? briefing.payload.inhaltHash === B.hash({ briefing: briefing.payload.briefing, lage: briefing.payload.lage }) : false;
    const textLeer = Boolean(text && (!Array.isArray(text.payload?.paragraphs) || !text.payload.paragraphs.length
      || text.payload.paragraphs.some(p => typeof p.text !== "string" || !p.text.trim())));
    const textHash = text ? hash(text) : null;
    const vorText = vorherigerAbzug?.rows?.find(r => r.tenant_id === id)?.briefings?.find(r => r.id === text?.id);
    const unveraendert = Boolean(text && vorText && Object.keys(vorText).every(k => hash(vorText[k]) === hash(text[k])));
    const textGueltig = Boolean(text && Q.gespeicherterTextGueltig(text.payload));
    const briefingStruktur = Boolean(briefing && inhaltHashGueltig && pruefung.strukturellVollstaendig);
    const rest = [];
    if (!text) rest.push("lage-fehlt"); else if (!textGueltig) rest.push("lage-quellenvertrag-unvollstaendig");
    if (!briefing) rest.push("briefing-fehlt"); else if (!briefingStruktur) rest.push("briefing-unvollstaendig");
    rest.push("app-abruf-nicht-belegt", "inhaltliche-abnahme-offen");
    return { profil: kennung(id), profilHash: hash(id), aktivJetzt: e.profiles.find(p => p.user_id === id).aktiv,
      teilnahmeImGeschlossenenFenster: alt.aktivImFenster === true,
      projektionsstatus: job.status, faelligUtc: job.due_at,
      fachlaufGrund: receipt.grund, lageVersuchImFenster: receipt.gestartet === true,
      lageVorhanden: Boolean(text), lageLeer: textLeer, lageQuellenvertragVollstaendig: textGueltig,
      lageZeilenHash: textHash, lageSeitFensterUnveraendert: Boolean(unveraendert),
      briefingVorhanden: Boolean(briefing), briefingHashGueltig: inhaltHashGueltig,
      briefingStrukturellVollstaendig: briefingStruktur, briefingPrueffehler: pruefung?.fehler || [],
      briefingZeilenHash: briefing ? hash(briefing) : null,
      alteInhaltsmaengelBeiIdentischemText: unveraendert ? alt.historischeLesebefunde || [] : [],
      vollstaendigeFaktenpruefung: false, appAbrufBelegt: false, gesamtnachweisBestanden: false, rest };
  });
  const count = fn => rows.filter(fn).length;
  const duplicates = new Map();
  for (const r of e.rows.filter(r => r.slot === "lage")) {
    const h = hash(r.payload?.paragraphs?.map(p => String(p.text || "").trim()) || []);
    duplicates.set(h, [...(duplicates.get(h) || []), kennung(r.user_id)]);
  }
  const contentDuplicates = [...duplicates.values()].filter(g => g.length > 1);
  assert(e.usage.every(u => typeof u.estimatedCost === "number" && Number.isFinite(u.estimatedCost)
    && u.estimatedCost >= 0), "Unbekannte Kosten nicht als null zaehlen");
  return { schemaVersion: 1, erhobenUtc: e.checked_at, productionCommit: commit, testtag: day,
    vorherigerAbzugUtc: vorherigerAbzug?.checked_at || null,
    vorherigerAbzugHash: vorherigerAbzug ? hash(vorherigerAbzug) : null,
    status: "kein-500er-gesamtnachweis", aktuelleBetreiberinformation: "Alle Profile sind ungenutzte Testprofile, einschliesslich der fuenf alten Dummys.",
    umfang: { ziel: 500, aktivJetzt: count(r => r.aktivJetzt), lageVorhanden: count(r => r.lageVorhanden),
      lageFehlt: count(r => !r.lageVorhanden), lageLeer: count(r => r.lageLeer),
      lageQuellenvertragVollstaendig: count(r => r.lageQuellenvertragVollstaendig),
      lageSeitFensterUnveraendert: count(r => r.lageSeitFensterUnveraendert),
      briefingVorhanden: count(r => r.briefingVorhanden), briefingFehlt: count(r => !r.briefingVorhanden),
      briefingStrukturellVollstaendig: count(r => r.briefingStrukturellVollstaendig),
      projektionsauftragErledigt: count(r => r.projektionsstatus === "erledigt"),
      appAbrufBelegt: 0, vollstaendigBestanden: 0, restprofile: 500, doppelteSpeicherkennungen: 0,
      profiluebergreifendGleicheTextgruppen: contentDuplicates.length },
    gleicheTextgruppen: contentDuplicates,
    kosten: { tag: day, profilumfang: "gesamter Helmut Betrieb", modellbelege: e.usage.length,
      geschaetzteUsd: Number(e.usage.reduce((n, u) => n + Number(u.estimatedCost), 0).toFixed(6)),
      neueModellaufrufeDieserPruefung: 0, neueModellkostenDieserPruefungUsd: 0, anbieterrechnung: false },
    grenzen: ["500 Einzelpruefungen von Zuordnung, Speicherung und Struktur, keine 500 gelesenen vollstaendigen Texte.",
      "Teilnahme im geschlossenen Fenster aus unveraenderter Uebersicht, zusaetzlich durch frisch gelesene Aktivierungsquittung bestaetigt.",
      "Keine positive inhaltliche Abnahme aus Quellenhash, Modellquittung oder HTTP Status ableiten.",
      "Identische Texte verschiedener Profile sind Vergleichsbefunde, nicht ohne Kontext unbeabsichtigte Duplikate."], profile: rows };
}
if (require.main === module) {
  const fs = require("node:fs"), [input, history, output, commit, priorInput] = process.argv.slice(2);
  if (!input || !history || !output || !/^[a-f0-9]{40}$/.test(commit || "")) throw new Error("Abzug, Historie, Ausgabedatei und Production Commit erforderlich");
  const r = auswerten(JSON.parse(fs.readFileSync(input, "utf8")), JSON.parse(fs.readFileSync(history, "utf8")), commit,
    priorInput ? JSON.parse(fs.readFileSync(priorInput, "utf8")) : null);
  fs.writeFileSync(output, JSON.stringify(r, null, 2) + "\n"); console.log(JSON.stringify({ umfang: r.umfang, kosten: r.kosten }));
}
module.exports = { auswerten };
