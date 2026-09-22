"use strict";

// Helmut — BEDIENWEG des EINMALIGEN VERSTEHENSLAUFS für genau 169 Rohdokumente.
// =============================================================================================
// Dieses Skript ist NUR der Bedienweg. Die gesamte Fachlogik, der Schutzvertrag und die
// Laufgrenzen liegen in `lib/helmut/verstehen-einmalig.js`; der Verstehensmotor, die
// Vorgangsauflösung, CAS und Fencing sind unveränderte Produktionsfunktionen.
//
// AUFRUF (immer über den lokalen Starter, auch einzeln):
//   node scripts/lokal.js -- node scripts/verstehen-einmalig-169.js
//
// OHNE `HELMUT_VERSTEHEN_169_SCHARF=1` läuft ausschließlich die REIN LESENDE Planung:
// Bindungsprüfung, Produktions-Dedup, Produktions-Clusterung, Kandidatenzählung. Kein
// Modellaufruf, kein Schreibzugriff, keine Quittung.
//
// UMGEBUNG (Secrets ausschließlich aus `process.env`, nie aus einer Datei — CLAUDE.md §4.9):
//   HELMUT_VERSTEHEN_169_LISTE        Pflicht: Pfad zur gebundenen Kennungsliste (JSON)
//   HELMUT_VERSTEHEN_169_COMMIT       Pflicht: der gebundene Production Commit (S1)
//   HELMUT_VERSTEHEN_169_PREIS_USD    Pflicht im scharfen Lauf: bestätigter Preis je Aufruf
//   HELMUT_VERSTEHEN_169_SCHARF       "1" schaltet den scharfen Lauf frei
//   HELMUT_VERSTEHEN_169_BESTAETIGT   Pflichtwort des scharfen Laufs (siehe BESTAETIGUNG)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   für Dokumentleser und Einmalquittung
//
// DIE KENNUNGSLISTE IST DIE BINDUNG. Ohne sie und ohne exakt passenden Hash (S3) startet
// nichts. Sie wird rein lesend aus Production belegt und danach im Repository festgehalten;
// dieses Skript erfindet niemals eine Kennung.

const fs = require("fs");
const path = require("path");

const D = require("../lib/helmut/testkohorte-direkt500");
const V = require("../lib/helmut/verstehen-einmalig");

const BESTAETIGUNG = "EINMALIGER_VERSTEHENSLAUF_169_RUHDOKUMENTE_BESTAETIGT";
const LISTE_STANDARD = path.join(__dirname, "..", "belege", "verstehen-169-ids.json");

function flagAn(wert) {
  const roh = String(wert == null ? "" : wert).trim().toLowerCase();
  return roh === "1" || roh === "true" || roh === "on" || roh === "yes" || roh === "an";
}

// Die gebundene Kennungsliste. Ein fehlender, leerer oder unlesbarer Beleg ist KEIN leeres
// Ergebnis, sondern ein Abbruchgrund.
//
// ZWEI ZULAESSIGE FELDNAMEN, EINE PRUEFUNG: der gelieferte Production-Beleg
// (`belege/verstehen-169-ids.json`) traegt `productionCommit`/`documentCount` und zusaetzlich
// den Block `productionReadOnlyVerification`; die kuerzere Form traegt `commit`/`anzahl`.
// Beide werden gleich streng geprueft — die Anpassung betrifft nur das Einlesen der Eingabe,
// nicht die Fachlogik.
function listeLaden(pfad) {
  const datei = String(pfad || LISTE_STANDARD);
  if (!fs.existsSync(datei)) {
    return { ok: false, grund: "verstehen-ids-liste-fehlt", pfad: datei };
  }
  let roh = null;
  try { roh = JSON.parse(fs.readFileSync(datei, "utf8")); }
  catch (e) { return { ok: false, grund: "verstehen-ids-liste-unlesbar", pfad: datei }; }
  if (!roh || !Array.isArray(roh.ids)) {
    return { ok: false, grund: "verstehen-ids-liste-unbrauchbar", pfad: datei };
  }
  // Der Beleg muss den gebundenen Auftrag selbst tragen — sonst ist es eine fremde Liste.
  const commit = roh.commit == null ? roh.productionCommit : roh.commit;
  const anzahl = roh.anzahl == null ? roh.documentCount : roh.anzahl;
  if (String(commit == null ? "" : commit) !== V.PINNED.commit) {
    return { ok: false, grund: "verstehen-liste-commit-abweichend", pfad: datei };
  }
  if (Number(anzahl) !== V.PINNED.dokumente || roh.ids.length !== V.PINNED.dokumente) {
    return { ok: false, grund: "verstehen-liste-anzahl-abweichend", pfad: datei };
  }
  if (roh.idHash !== V.PINNED.idHash) {
    return { ok: false, grund: "verstehen-liste-hash-abweichend", pfad: datei };
  }
  // Traegt der Beleg die unabhaengige Production-Pruefung, muss SIE dasselbe belegen:
  // erzeugte und abgerufene Menge identisch, keine Einzelseite, beide Hashes exakt.
  const beleg = roh.productionReadOnlyVerification;
  if (beleg) {
    const hashes = [beleg.createdHash, beleg.retrievedHash].filter((x) => x != null);
    const zahlenPassen = Number(beleg.createdCount) === V.PINNED.dokumente
      && Number(beleg.retrievedCount) === V.PINNED.dokumente
      && Number(beleg.createdOnly) === 0 && Number(beleg.retrievedOnly) === 0;
    if (!hashes.length || hashes.some((h) => h !== V.PINNED.idHash) || !zahlenPassen) {
      return { ok: false, grund: "verstehen-liste-pruefbeleg-abweichend", pfad: datei };
    }
  }
  return { ok: true, ids: roh.ids, pfad: datei };
}

// Die EINMALQUITTUNG: eine Zeile in der BESTEHENDEN `helmut_store`-Ablage. Der Schlüssel ist
// die Zeilenkennung; die Zeile existiert entweder gar nicht (Beanspruchung gelingt) oder sie
// existiert (dieser Auftrag war schon dran). Genau dieselbe Bauart wie die Quittung des
// Quellen-Vorlaufs — keine neue Tabelle, keine Migration.
function quittungsAdapter(env = process.env) {
  const url = String(env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  D.fordere(url !== "" && key !== "", "verstehen-quittung-ohne-zugang");
  const basis = `${url}/rest/v1/helmut_store`;
  const headers = {
    apikey: key, Authorization: `Bearer ${key}`,
    "Content-Type": "application/json", Accept: "application/json",
    Prefer: "return=representation"
  };
  const schluesselVon = (data) => String((data && (data.quittungsschluessel || data.key)) || V.QUITTUNG);
  const hole = async (id) => {
    const res = await fetch(`${basis}?select=id,data&id=eq.${encodeURIComponent(id)}&limit=2`,
      { headers, redirect: "error", signal: AbortSignal.timeout(20000) });
    D.fordere(res.status === 200, "verstehen-quittung-lesen-fehlgeschlagen");
    const rows = await res.json();
    D.fordere(Array.isArray(rows), "verstehen-quittung-lesen-unbekannt");
    return rows;
  };
  const claimRun = async (data) => {
    const id = schluesselVon(data);
    const alt = await hole(id);
    D.fordere(alt.length <= 1, "verstehen-quittung-nicht-eindeutig");
    if (alt.length) return false;
    const res = await fetch(basis, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(20000),
      headers, body: JSON.stringify({ id, data })
    });
    D.fordere([200, 201].includes(res.status), "verstehen-quittung-schreiben-fehlgeschlagen");
    const rows = await res.json();
    D.fordere(Array.isArray(rows) && rows.length === 1 && rows[0].id === id,
      "verstehen-quittung-schreiben-unbekannt");
    return true;
  };
  const finishRun = async (data) => {
    const id = schluesselVon(data);
    const alt = await hole(id);
    // BEDINGT: nur die eigene, unveränderte Zeile wird abgeschlossen.
    D.fordere(alt.length === 1 && alt[0].data && alt[0].data.runId === data.runId
      && alt[0].data.idHash === data.idHash, "verstehen-quittung-abweichend");
    const res = await fetch(`${basis}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH", redirect: "error", signal: AbortSignal.timeout(20000),
      headers, body: JSON.stringify({ data })
    });
    D.fordere(res.status === 200, "verstehen-quittung-abschluss-fehlgeschlagen");
    const rows = await res.json();
    D.fordere(Array.isArray(rows) && rows.length === 1 && rows[0].id === id,
      "verstehen-quittung-abschluss-unbekannt");
    return true;
  };
  return { claimRun, finishRun };
}

// Der Prozess wird an den ECHTEN Produktionsspeicher gebunden — ausschließlich lesend für den
// Dokumentleser, schreibend nur im Verstehenspfad selbst (KO, Verknüpfung, CAS, Nutzungslog).
// Die Einmalquittung braucht Schreibzugang und wird deshalb NUR im scharfen Lauf verdrahtet.
function baueDeps(env = process.env, runId = null, { mitQuittung = false, deps = {} } = {}) {
  const storage = require("../lib/helmut/storage");
  const understanding = require("../lib/helmut/understanding");
  return {
    ...understanding.defaultDeps({ runId, callType: V.CALLTYPE }),
    ladeDokumente: (ids) => storage.getRawDocumentsByIds(ids),
    leseTageszaehler: () => storage.leseLlmTageszaehler(),
    ...(mitQuittung ? quittungsAdapter(env) : {}),
    ...deps
  };
}

async function main() {
  const env = process.env;
  const scharf = flagAn(env.HELMUT_VERSTEHEN_169_SCHARF);
  const commit = env.HELMUT_VERSTEHEN_169_COMMIT || null;
  const preis = Number(env.HELMUT_VERSTEHEN_169_PREIS_USD);
  const runId = env.GITHUB_RUN_ID || `verstehen169-${Date.now()}`;
  const raus = (bericht, code) => {
    console.log(JSON.stringify(bericht, null, 2));
    return code;
  };

  if (scharf && String(env.HELMUT_VERSTEHEN_169_BESTAETIGT || "") !== BESTAETIGUNG) {
    return raus({
      ok: false, reinLesend: false, ausgeloest: false,
      grund: "verstehen-bestaetigung-fehlt",
      bestaetigungswort: BESTAETIGUNG, quittungsschluessel: V.QUITTUNG
    }, 1);
  }
  if (!commit) {
    return raus({
      ok: false, reinLesend: !scharf, ausgeloest: false, grund: "verstehen-commit-fehlt",
      erwartet: V.PINNED.commit, quittungsschluessel: V.QUITTUNG,
      hinweis: "Der gebundene Production Commit kommt aus HELMUT_VERSTEHEN_169_COMMIT und wird "
        + "nicht aus dem laufenden Prozess erraten — sonst waere die Bindung eine Formsache."
    }, 1);
  }
  const liste = listeLaden(env.HELMUT_VERSTEHEN_169_LISTE || LISTE_STANDARD);
  if (!liste.ok) {
    return raus({
      ok: false, reinLesend: !scharf, ausgeloest: false, grund: liste.grund, pfad: liste.pfad,
      quittungsschluessel: V.QUITTUNG,
      hinweis: "Die gebundene Kennungsliste wird rein lesend aus Production belegt und im "
        + "Repository festgehalten (belege/verstehen-169-ids.json; Verfahren in "
        + "docs/betrieb/verstehen-einmalig-169-20260922.md). Ohne sie startet weder Planung noch Lauf."
    }, 1);
  }
  // Ohne erreichbaren V3-Speicher ist die Bindung nicht pruefbar — und eine ungeprueft
  // gebundene Liste ist keine Bindung.
  if (require("../lib/helmut/storage").v3StoreReady() !== true) {
    return raus({
      ok: false, reinLesend: !scharf, ausgeloest: false,
      grund: "verstehen-speicher-nicht-verfuegbar", quittungsschluessel: V.QUITTUNG
    }, 1);
  }
  if (scharf && !(Number.isFinite(preis) && preis > 0)) {
    return raus({
      ok: false, reinLesend: false, ausgeloest: false,
      grund: "verstehen-preis-fehlt",
      hinweis: "HELMUT_VERSTEHEN_169_PREIS_USD (bestaetigter Preis je Aufruf) fehlt — "
        + "ohne Preis ist der 0,80-USD-Laufdeckel nicht erzwingbar.",
      quittungsschluessel: V.QUITTUNG
    }, 1);
  }

  const deps = baueDeps(env, runId, { mitQuittung: scharf });
  const bericht = await V.fuehreAus({
    ids: liste.ids, deps, execute: scharf, commit, env,
    preisJeAufrufUsd: Number.isFinite(preis) ? preis : null,
    runId,
    fortschritt: scharf
      ? (s) => console.error(`[verstehen-169] ${s.fertig}/${s.gesamt} Cluster, ${s.aufrufe} Modellaufrufe`)
      : null
  });
  return raus(bericht, bericht.ok === true ? 0 : 1);
}

if (require.main === module) {
  main()
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      console.log(JSON.stringify({
        ok: false, ausgeloest: false, grund: D.DirektAbbruch && error instanceof D.DirektAbbruch
          ? error.grund : String((error && error.message) || "unbekannt").slice(0, 200),
        automatischeWiederholung: false
      }, null, 2));
      process.exitCode = 1;
    });
}

module.exports = { BESTAETIGUNG, LISTE_STANDARD, flagAn, listeLaden, quittungsAdapter, baueDeps, main };
