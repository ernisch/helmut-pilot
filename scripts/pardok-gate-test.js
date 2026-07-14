"use strict";

// Phase G: PARDOK-Dokumente gegen das Understanding-Gate. REINE LOGIK.
// Sichert die verbindlichen Zusagen fuer amtliche, strukturierte Landesparlaments-Dokumente:
//   - strukturierte Felder OHNE KI erhalten (externe_id/Land/Wahlperiode/Dokumentart)
//   - NIE wegen fehlendem Titel/Alter/Kuerze geparkt (amtlich ausgenommen)
//   - Gate-Entscheidung 'verstehen' + structured=true (keine doppelte KI-Extraktion)
//   - Land + Wahlperiode bleiben; stabile externe ID; mehrere Dokumente pro Vorgang unterscheidbar;
//     identische Nummern in unterschiedlichen Wahlperioden -> verschiedene Identitaet.

const fs = require("fs");
const path = require("path");
const P = require("../lib/helmut/quellenarchitektur/pardok-parser");
const G = require("../lib/helmut/quellenarchitektur/understanding-gate");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }
function fx(n) { return fs.readFileSync(path.join(__dirname, "..", "test", "fixtures", "pardok", n), "utf8"); }
const NOW = Date.parse("2026-07-14T00:00:00Z");

// PARDOK-Dokument -> Gate-Eingang (wie im Dispatch/Shadow-Ingest: amtliche Quelle -plenum).
function toGateInput(doc, land) {
  return {
    id: `sd-${doc.externe_id}`, content_hash: doc.inhaltsfingerabdruck || doc.externe_id,
    title: doc.titel || "", summary: "",
    source_id: land === "berlin" ? "be-plenum" : "bb-plenum",
    document_type: doc.dokumentart || null, published_at: doc.veroeffentlichungsdatum || null,
    politische_ebene: doc.politische_ebene || "land"
  };
}

for (const land of ["berlin", "brandenburg"]) {
  const docs = P.parsePardokDocumentsFromString(fx(`${land}-gold.xml`), { land }).documents;
  const titellos = docs.filter((d) => !d.titel);
  const alt = docs.map((d) => ({ ...d, veroeffentlichungsdatum: "2019-01-01" })); // kuenstlich sehr alt

  // 1) ALLE PARDOK-Dokumente -> verstehen + structured (keine doppelte KI)
  const g = docs.map((d) => G.assessDocument(toGateInput(d, land), { now: NOW }));
  check(`${land}: ALLE amtlichen PARDOK -> verstehen`, g.every((r) => r.decision === "verstehen"));
  check(`${land}: ALLE -> structured=true (keine doppelte KI-Extraktion)`, g.every((r) => r.structured === true));
  check(`${land}: KEIN Dokument geparkt/hygiene`, g.every((r) => r.decision !== "parken" && r.decision !== "hygiene"));

  // 2) Titellose Dokumente (Plenar-/Ausschussprotokoll/GVBl) NICHT wegen fehlendem Titel geparkt
  check(`${land}: ${titellos.length} titellose Dokumente -> trotzdem verstehen`, titellos.length >= 1 && titellos.every((d) => G.assessDocument(toGateInput(d, land), { now: NOW }).decision === "verstehen"));

  // 3) Sehr alte amtliche Dokumente NICHT wegen Alter geparkt
  check(`${land}: sehr alte amtliche Dokumente -> verstehen (nie wegen Alter verworfen)`, alt.every((d) => G.assessDocument(toGateInput(d, land), { now: NOW }).decision === "verstehen"));

  // 4) Strukturierte Felder OHNE KI erhalten
  check(`${land}: externe_id + Wahlperiode + Land erhalten (ohne KI)`, docs.every((d) => d.externe_id && (d.wahlperiode != null) && d.geografie === (land === "berlin" ? "geo-land-berlin" : "geo-land-brandenburg")));

  // 5) Stabile, eindeutige externe IDs (mehrere Dokumente pro Vorgang unterscheidbar)
  const ids = docs.map((d) => d.externe_id);
  check(`${land}: externe IDs eindeutig (mehrere Dokumente pro Vorgang unterscheidbar)`, new Set(ids).size === ids.length);
}

// 6) Identische DokNr in unterschiedlichen Wahlperioden -> verschiedene Identitaet (Berlin/DBID)
const beA = P.parseBerlinDokument('<Dokument><DBID>D-100</DBID><DokNr>17/5000</DokNr><Wp>17</Wp><DokDat>2018-01-01</DokDat><Titel>Antrag X</Titel></Dokument>');
const beB = P.parseBerlinDokument('<Dokument><DBID>D-200</DBID><DokNr>17/5000</DokNr><Wp>19</Wp><DokDat>2026-01-01</DokDat><Titel>Antrag X</Titel></Dokument>');
check("6 gleiche DokNr, andere Wahlperiode -> verschiedene externe_id", beA.externe_id !== beB.externe_id);
check("6b gleiche DokNr, andere Wahlperiode -> verschiedener Fingerabdruck", beA.inhaltsfingerabdruck !== beB.inhaltsfingerabdruck);
check("6c Wahlperiode korrekt getrennt (17 vs 19)", String(beA.wahlperiode) === "17" && String(beB.wahlperiode) === "19");

// 7) HTML-Fehlerseite statt XML -> Parser meldet Fehlerseite, KEINE Dokumente ans Gate
const html = P.parsePardokDocumentsFromString("<!doctype html><html>Fehler 500</html>", { land: "berlin" });
check("7 HTML-Fehlerseite -> fehlerseite=true, 0 Dokumente (nichts ans Gate)", html.fehlerseite === true && html.documents.length === 0);

console.log(`\n== PARDOK × Understanding-Gate: ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
