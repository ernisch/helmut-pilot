"use strict";

// Sprint M-8 — Relevanzriegel fuer Matching-Ergebnisse (DEFAULT AUS).
//
// Befund M-8: `match_knowledge_objects` liefert die Top-N unbedingt. Es
// entstehen je Mandant immer 20 Ergebniszeilen, auch wenn nur drei davon einen
// belegbaren Bezug zum Mandat haben.
//
// Geprueft werden genau die neun Pflichtpunkte des Sprints:
//   A  Riegel ist DEFAULT AUS — ohne Flag exakt das heutige Top-N-Verhalten
//   B  negative Aehnlichkeit
//   C  Aehnlichkeit 0
//   D  wenige starke Treffer  -> keine kuenstliche Auffuellung
//   E  viele starke Treffer   -> nichts geht verloren
//   F  Platzhalterprofil      -> ehrlicher Leerzustand statt Rauschen
//   G  stabile Reihenfolge + unveraenderte Raenge/Aehnlichkeiten
//   H  Idempotenz (zweimal derselbe Eingang -> byte-identische Ausgabe)
//   I  Mandantentrennung (kein fremder Mandant, kein Leck)
//
// Vollstaendig offline: 0 Netz, 0 Datenbank, 0 KI, 0 Zufall.

const path = require("path");
const root = path.join(__dirname, "..");

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass += 1; console.log(`PASS  ${name}`); }
  else { fail += 1; console.log(`FAIL  ${name}`); }
}

const relevanz = require(path.join(root, "lib/helmut/matching-relevanz.js"));
const matching = require(path.join(root, "lib/helmut/matching.js"));
const begruendung = require(path.join(root, "lib/helmut/matching-begruendung.js"));

// ── Testdaten ────────────────────────────────────────────────────────────────
// Kunstmandanten, keine echten Personen, kein hartkodierter Produktivmandant.
const PROFIL_GEPFLEGT = {
  id: "mdb-test-a",
  name: "Testmandat A",
  partei: "SPD",
  committees: ["Ausschuss für Arbeit und Soziales"],
  focusTopics: ["Rente"],
  wahlkreis: "Teststadt"
};
// Platzhalterprofil: ohne Partei, Ausschuss und Schwerpunkt (Befund M-9).
const PROFIL_PLATZHALTER = { id: "mdb-test-b", name: "Testmandat B" };

function ko(id, extra = {}) {
  return {
    id,
    vorgang_id: `vg-${id}`,
    status: "complete",
    understanding_status: "complete",
    ...extra
  };
}

// Wissensobjekte MIT belegbarem Bezug (Partei bzw. Ausschuss bzw. Schwerpunkt)
const KO_BELEGT = [
  ko("ko-1", { parteien: ["SPD"] }),
  ko("ko-2", { ausschuesse: ["Ausschuss für Arbeit und Soziales"] }),
  ko("ko-3", { tags: ["Rente"] }),
  ko("ko-4", { parteien: ["SPD"], tags: ["Rente"] })
];
// Wissensobjekte OHNE jeden belegbaren Bezug zum Profil
const KO_UNBELEGT = [
  ko("ko-x1", { parteien: ["CSU"] }),
  ko("ko-x2", { ausschuesse: ["Ausschuss für Digitales"] }),
  ko("ko-x3", {}),
  ko("ko-x4", { tags: ["Fischerei"] })
];

// Ein Lauf mit vollstaendig kontrollierter Trefferliste. Es wird NICHTS
// gespeichert — `saveMatchingResults` sammelt nur ein.
async function lauf({ profil, treffer, gate, audit = null }) {
  const geschrieben = [];
  const gelesen = [];
  const deps = {
    enabled: () => true,
    getProfile: async () => profil,
    saveProfileEmbedding: async () => ({ saved: 1 }),
    matchByEmbedding: async () => ({ results: treffer.map((t) => ({ id: t.ko.id, vorgang_id: t.ko.vorgang_id, similarity: t.similarity })) }),
    listKnowledgeObjectsByIds: async (ids) => {
      gelesen.push(ids);
      const byId = new Map(treffer.map((t) => [t.ko.id, t.ko]));
      return ids.map((id) => byId.get(id)).filter(Boolean);
    },
    saveMatchingResults: async (rows) => { geschrieben.push(rows); return { saved: rows.length }; },
    auditEnabled: () => Boolean(audit),
    audit: () => audit,
    relevanzGateEnabled: () => gate === true
  };
  const ergebnis = await matching.runMatchingShadow({ profile: profil, userId: profil.id }, deps);
  return { ergebnis, zeilen: geschrieben.length ? geschrieben[0] : [], gelesen };
}

function mische(belegt, unbelegt, simBelegt, simUnbelegt) {
  // Absteigend sortiert wie die RPC: erst die staerkeren Werte.
  const alle = [
    ...belegt.map((k, i) => ({ ko: k, similarity: simBelegt[i] })),
    ...unbelegt.map((k, i) => ({ ko: k, similarity: simUnbelegt[i] }))
  ];
  return alle.sort((a, b) => b.similarity - a.similarity || String(a.ko.id).localeCompare(String(b.ko.id)));
}

(async () => {
  console.log("== A · Default AUS: heutiges Top-N-Verhalten bleibt unangetastet ==");
  check("Flag ohne Env ist aus", relevanz.relevanzGateAktiv({}) === false);
  check("Flag 'off' ist aus", relevanz.relevanzGateAktiv({ HELMUT_MATCHING_RELEVANZ_GATE: "off" }) === false);
  check("Flag 'on' ist an", relevanz.relevanzGateAktiv({ HELMUT_MATCHING_RELEVANZ_GATE: "on" }) === true);
  check("Flag '1' ist an", relevanz.relevanzGateAktiv({ HELMUT_MATCHING_RELEVANZ_GATE: "1" }) === true);
  check("echte Prozessumgebung hat den Riegel NICHT gesetzt", relevanz.relevanzGateAktiv() === false);

  const gemischt = mische(KO_BELEGT, KO_UNBELEGT, [0.31, 0.28, 0.25, 0.23], [0.30, 0.27, 0.24, 0.22]);
  const aus = await lauf({ profil: PROFIL_GEPFLEGT, treffer: gemischt, gate: false });
  check("ohne Riegel: alle 8 Treffer werden gespeichert", aus.zeilen.length === 8);
  check("ohne Riegel: unbelegte Treffer sind dabei",
    aus.zeilen.some((r) => !r.matched_features.length));
  check("ohne Riegel: candidates = 8, verworfen = 0",
    aus.ergebnis.candidates === 8 && aus.ergebnis.verworfen === 0);

  const an = await lauf({ profil: PROFIL_GEPFLEGT, treffer: gemischt, gate: true });
  check("mit Riegel: nur die 4 belegten Treffer bleiben", an.zeilen.length === 4);
  check("mit Riegel: kein gespeicherter Treffer ohne Merkmal",
    an.zeilen.every((r) => r.matched_features.length > 0));
  check("mit Riegel: candidates bleibt 8, verworfen = 4",
    an.ergebnis.candidates === 8 && an.ergebnis.verworfen === 4);
  check("mit Riegel: jede gespeicherte Zeile kann eine Begruendung tragen",
    an.zeilen.every((r) => begruendung.begruendungAusSignalen(
      begruendung.buildSignals(r.matched_features, r.similarity), r.matched_features) !== null));

  console.log("\n== B · Negative Aehnlichkeit ==");
  const negativ = mische(KO_BELEGT.slice(0, 2), KO_UNBELEGT, [0.30, 0.26], [-0.0735, -0.02, -0.01, -0.005]);
  const negAus = await lauf({ profil: PROFIL_GEPFLEGT, treffer: negativ, gate: false });
  const negAn = await lauf({ profil: PROFIL_GEPFLEGT, treffer: negativ, gate: true });
  check("heute: negative Aehnlichkeiten werden gespeichert (Befund M-8)",
    negAus.zeilen.filter((r) => r.similarity < 0).length === 4);
  check("mit Riegel: keine Zeile mit negativer Aehnlichkeit ueberlebt",
    negAn.zeilen.every((r) => r.similarity > 0));
  check("mit Riegel: die 2 belegten Treffer bleiben vollstaendig", negAn.zeilen.length === 2);

  console.log("\n== C · Aehnlichkeit 0 ==");
  const nullSim = mische(KO_BELEGT.slice(0, 3), KO_UNBELEGT, [0.29, 0.27, 0.24], [0, 0, 0, 0]);
  const nullAus = await lauf({ profil: PROFIL_GEPFLEGT, treffer: nullSim, gate: false });
  const nullAn = await lauf({ profil: PROFIL_GEPFLEGT, treffer: nullSim, gate: true });
  check("heute: Zeilen mit Aehnlichkeit 0 landen im Bestand",
    nullAus.zeilen.filter((r) => r.similarity === 0).length === 4);
  check("mit Riegel: keine Zeile mit Aehnlichkeit 0", nullAn.zeilen.every((r) => r.similarity !== 0));
  check("mit Riegel: 3 belegte Treffer bleiben", nullAn.zeilen.length === 3);

  console.log("\n== D · Wenige starke Treffer -> KEINE kuenstliche Auffuellung ==");
  const wenige = mische(KO_BELEGT.slice(0, 3), KO_UNBELEGT, [0.33, 0.30, 0.28], [0.29, 0.27, 0.26, 0.25]);
  const wenigeAn = await lauf({ profil: PROFIL_GEPFLEGT, treffer: wenige, gate: true });
  check("genau 3 Treffer — nicht auf 7 oder 12 aufgefuellt", wenigeAn.zeilen.length === 3);
  check("die 3 Treffer sind genau die belegten",
    wenigeAn.zeilen.map((r) => r.knowledge_object_id).sort().join(",") === "ko-1,ko-2,ko-3");
  check("kein Treffer wird nachgerueckt, um auf eine Mindestmenge zu kommen",
    wenigeAn.zeilen.every((r) => r.matched_features.length > 0));

  console.log("\n== E · Viele starke Treffer -> nichts geht verloren ==");
  const vieleKos = Array.from({ length: 20 }, (_, i) => ko(`ko-v${String(i).padStart(2, "0")}`, { parteien: ["SPD"] }));
  const viele = vieleKos.map((k, i) => ({ ko: k, similarity: Number((0.40 - i * 0.005).toFixed(4)) }));
  const vieleAus = await lauf({ profil: PROFIL_GEPFLEGT, treffer: viele, gate: false });
  const vieleAn = await lauf({ profil: PROFIL_GEPFLEGT, treffer: viele, gate: true });
  check("ohne Riegel: 20 Zeilen", vieleAus.zeilen.length === 20);
  check("mit Riegel: weiterhin 20 Zeilen — kein Verlust", vieleAn.zeilen.length === 20);
  check("mit Riegel: Zeilen sind byte-identisch zum Zustand ohne Riegel",
    JSON.stringify(vieleAn.zeilen) === JSON.stringify(vieleAus.zeilen));

  console.log("\n== F · Platzhalterprofil -> ehrlicher Leerzustand ==");
  const platzTreffer = KO_UNBELEGT.concat(KO_BELEGT).map((k, i) => ({ ko: k, similarity: Number((0.32 - i * 0.02).toFixed(4)) }));
  const platzAus = await lauf({ profil: PROFIL_PLATZHALTER, treffer: platzTreffer, gate: false });
  const platzAn = await lauf({ profil: PROFIL_PLATZHALTER, treffer: platzTreffer, gate: true });
  check("heute: Platzhalterprofil bekommt trotzdem 8 Vorgaenge (Befund M-8/M-9)",
    platzAus.zeilen.length === 8);
  check("heute: keiner dieser Vorgaenge traegt einen Beleg",
    platzAus.zeilen.every((r) => r.matched_features.length === 0));
  check("mit Riegel: kein einziger Vorgang — ehrlicher Leerzustand statt Rauschen",
    platzAn.zeilen.length === 0);
  check("mit Riegel: der Lauf meldet die Verwerfung ehrlich (kein falsches Grün)",
    platzAn.ergebnis.candidates === 8 && platzAn.ergebnis.verworfen === 8 && platzAn.ergebnis.veroeffentlicht === 0);

  console.log("\n== G · Stabile Reihenfolge, unveraenderte Raenge und Aehnlichkeiten ==");
  check("Reihenfolge der ueberlebenden Zeilen ist die der Kandidatenliste",
    an.zeilen.map((r) => r.knowledge_object_id).join(",") === "ko-1,ko-2,ko-3,ko-4");
  const ohneRiegelIndex = new Map(aus.zeilen.map((r) => [r.knowledge_object_id, r]));
  check("Aehnlichkeit jeder ueberlebenden Zeile ist unveraendert",
    an.zeilen.every((r) => ohneRiegelIndex.get(r.knowledge_object_id).similarity === r.similarity));
  check("Rang wird NICHT neu vergeben (Rang bleibt Kandidatenposition)",
    an.zeilen.every((r) => ohneRiegelIndex.get(r.knowledge_object_id).rank === r.rank));
  check("es entstehen dadurch Rangluecken — genau so gewollt",
    an.zeilen.map((r) => r.rank).join(",") !== "1,2,3,4");
  check("Ergebniskennung unveraendert",
    an.zeilen.every((r) => ohneRiegelIndex.get(r.knowledge_object_id).id === r.id));

  console.log("\n== H · Idempotenz ==");
  const w1 = await lauf({ profil: PROFIL_GEPFLEGT, treffer: gemischt, gate: true });
  const w2 = await lauf({ profil: PROFIL_GEPFLEGT, treffer: gemischt, gate: true });
  check("zweimal derselbe Eingang -> byte-identische Zeilen",
    JSON.stringify(w1.zeilen) === JSON.stringify(w2.zeilen));
  check("reine Funktion: wendeRelevanzGateAn mutiert die Eingabe nicht", (() => {
    const eingabe = [{ matched_features: [] }, { matched_features: [{ type: "partei", value: "SPD" }] }];
    const kopie = JSON.parse(JSON.stringify(eingabe));
    relevanz.wendeRelevanzGateAn(eingabe, { aktiv: true });
    return JSON.stringify(eingabe) === JSON.stringify(kopie);
  })());
  check("gleiche Objektreferenzen — es wird nichts neu gebaut", (() => {
    const a = { matched_features: [{ type: "partei", value: "SPD" }] };
    return relevanz.wendeRelevanzGateAn([a], { aktiv: true }).zeilen[0] === a;
  })());

  console.log("\n== I · Mandantentrennung ==");
  check("alle Zeilen tragen den eigenen Mandanten",
    an.zeilen.every((r) => r.user_id === PROFIL_GEPFLEGT.id));
  check("Ergebniskennung ist mandantengebunden",
    an.zeilen.every((r) => String(r.id).startsWith(`mr-${PROFIL_GEPFLEGT.id}-`)));
  const fremd = await lauf({ profil: PROFIL_PLATZHALTER, treffer: gemischt, gate: true });
  check("ein zweiter Mandant erbt keine Treffer des ersten", fremd.zeilen.length === 0);
  check("der Riegel liest ausschliesslich die Trefferobjekte des Laufs",
    an.gelesen.length === 1 && an.gelesen[0].every((id) => gemischt.some((t) => t.ko.id === id)));

  console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
  if (fail) process.exit(1);
})().catch((error) => {
  console.error("Testlauf abgebrochen:", error && error.stack ? error.stack : error);
  process.exit(1);
});
