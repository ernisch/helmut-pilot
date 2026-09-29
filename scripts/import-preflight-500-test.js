"use strict";

// Helmut — gezielter OFFLINE-Test fuer den 500er-ERSATZ-Preflight/SQL-Generator.
// =============================================================================================
// Belegt die zuvor belegte Sicherheitsluecke des alten Werkzeugs (additiver Import + falscher
// "Rollback", der nur die neue Kohorte loeschte) und prueft den neuen, fail-closed
// Preimage-Snapshot-Vertrag:
//   1. Preflight des echten 500er-Pakets: 500 Profile, 330/120/50, alle aktiv = false, kein AfD.
//   2. Kopplung an den bestehenden Importvertrag (keine zweite Wahrheit).
//   3. Zeilenplan der neuen Kohorte: deaktiviert, afd-frei, ebenenrichtig.
//   4. Snapshot-Vertrag: genau 500 alte profiles- und mandate_profiles-Zeilen, alle bekannten
//      FK-Kindtabellen, operation_id, Paket-Hash, Snapshot-Hash und ID-Mengenbindung.
//   5. Erzeugtes Ersatz-SQL: atomar, transaktional gesperrt, ausfuehrbare Preimage-/Nach-/Guard-
//      Riegel; Vorwaerts loescht nur die Preimage-profile-IDs (Cascades) und fuegt die neue
//      Kohorte inaktiv ein; danach 500/501, 0 aktiv, AfD = 0, Fremdprofil erhalten.
//   6. Rueckweg: loescht exakt die neue Kohorte nur ohne unerwartete neue Kinddaten und stellt die
//      vollstaendigen Snapshotdaten in FK-sicherer Reihenfolge wieder her.
//   7. FAIL-CLOSED: ungueltiger Snapshot/Hash/ID-Menge, fehlende Kindtabelle, unbekannte Tabelle,
//      abweichendes Paket => Preflight/Snapshot rot, KEIN SQL, CLI-Exit != 0.
//   8. Default ohne Snapshot: kein SQL auf stdout, Exit != 0.
//
// KEIN Netzwerk, KEINE DB, KEIN Modellaufruf, KEINE Schreibwirkung im Repo. Es wird kein SQL
// ausgefuehrt — nur Struktur und Vertragsdaten werden geprueft.
// Aufruf:  node scripts/import-preflight-500-test.js

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
process.env.HELMUT_SOURCE_MODE = "off";

const GEN = require(path.join(ROOT, "scripts", "import-preflight-500-sql-generator.js"));
const IMPORT = require(path.join(ROOT, "lib", "helmut", "profil-import.js"));
const ZULASSUNG = require(path.join(ROOT, "lib", "helmut", "profil-zulassung.js"));
const GENERATOR_PFAD = path.join(ROOT, "scripts", "import-preflight-500-sql-generator.js");
const PAKET_PFAD = path.join(ROOT, "daten", "mandatsprofile-bundestag-berlin-brandenburg-20260929.json");

const AUD = JSON.stringify;
let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }
function fehlerCodes(ergebnis) { return ergebnis.fehler.map((f) => f.code); }
function klon(v) { return JSON.parse(JSON.stringify(v)); }

// ── Unabhaengige Hash-/Kanonik-Implementierung (bewusst dupliziert, um die Werkzeug-Hashlogik
//    wirklich zu pruefen statt sie nur selbst aufzurufen). ───────────────────────────────────
function kanonisch(v) {
  if (Array.isArray(v)) return v.map(kanonisch);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = kanonisch(v[k]);
    return out;
  }
  return v;
}
function sha256(s) { return crypto.createHash("sha256").update(String(s), "utf8").digest("hex"); }
function sha256Datei(pfad) { return crypto.createHash("sha256").update(fs.readFileSync(pfad)).digest("hex"); }
function ohneFeld(obj, feld) { const k = { ...obj }; delete k[feld]; return k; }

// Synthetisches, vertragskonformes AfD-Profil — NUR fuer Negativtests, nie im Paket.
function synthetischAfd(mandatsId = "synthetisch-afd-einzelfall") {
  return {
    mandatsId,
    vollname: "Synthetische AfD Person",
    parlament: "bundestag",
    bundesland: "Berlin",
    partei: "AfD",
    fraktion: "AfD",
    wahlkreis: "Synthetischer Wahlkreis",
    ausschuesse: ["Ausschuss für Sport"],
    offizielleQuellen: [{ art: "parlament-profil", url: "https://www.bundestag.de/SYNTHETISCH/afd-profil" }],
    aktiv: false
  };
}

// ── Synthetischer, ABWEICHENDER Altbestand mit FK-Kinddaten + fremdem 501. Profil ─────────────
const FREMD_ID = "fremd-admin-ohne-mandat";
function baueAltbestand(paketHash) {
  const alteIds = [];
  const tabellen = {};
  for (const t of GEN.SNAPSHOT_TABELLEN) tabellen[t] = [];

  for (let i = 1; i <= 500; i++) {
    const id = `alt-mandat-${String(i).padStart(4, "0")}`;
    alteIds.push(id);
    tabellen.profiles.push({ id, name: `Altbestand ${i}`, created_at: "2026-01-01T00:00:00.000Z" });
    tabellen.mandate_profiles.push({
      user_id: id,
      partei: i % 3 === 0 ? "CDU" : "SPD",
      fraktion: i % 3 === 0 ? "CDU/CSU" : "SPD-Fraktion",
      politische_ebene: i <= 330 ? "bundestag" : "landtag",
      wahlkreis: `Wahlkreis ${i}`,
      bundesland: i % 2 === 0 ? "Berlin" : "Brandenburg",
      aktiv: false,
      onboarding_status: "abgeschlossen",
      profil_extras: { parlament: i <= 330 ? "bundestag" : "landtag-berlin" }
    });
  }

  // FK-Kinddaten des Altbestands (mindestens briefings, decisions, matching_results, matching_runs,
  // profile_embeddings — wie im Production-Befund) plus ein Eltern-Kind-Paar innerhalb der Kinder.
  tabellen.briefings.push(
    { id: "brief-1", user_id: alteIds[0], slot: "morgens", payload: { x: 1 }, created_at: "2026-02-01T06:00:00.000Z" },
    { id: "brief-2", user_id: alteIds[1], slot: "mittags", payload: { x: 2 }, created_at: "2026-02-01T12:00:00.000Z" },
    { id: "brief-3", user_id: alteIds[330], slot: "abends", payload: { x: 3 }, created_at: "2026-02-01T18:00:00.000Z" }
  );
  tabellen.decisions.push(
    { id: "dec-1", user_id: alteIds[0], knowledge_object_id: "ko-1", score: 10, status: "new" },
    { id: "dec-2", user_id: alteIds[2], knowledge_object_id: "ko-2", score: 20, status: "new" }
  );
  tabellen.matching_results.push(
    { id: "mr-1", user_id: alteIds[0], knowledge_object_id: "ko-1", similarity: 0.5, rank: 1, matched_features: ["partei:SPD"], filters: {} },
    { id: "mr-2", user_id: alteIds[1], knowledge_object_id: "ko-2", similarity: 0.7, rank: 1, matched_features: [], filters: {} }
  );
  tabellen.matching_runs.push(
    { id: "run-1", user_id: alteIds[0], status: "abgeschlossen", eingabe_fingerabdruck: "fp-1", gestartet_am: "2026-02-01T06:00:00.000Z" }
  );
  tabellen.profile_embeddings.push(
    { user_id: alteIds[0], embedding: "[0.1, 0.2, 0.3]", profile_hash: "h1", dim: 256 },
    { user_id: alteIds[1], embedding: "[0.2, 0.3, 0.4]", profile_hash: "h2", dim: 256 }
  );
  tabellen.political_items.push(
    { id: "pi-1", user_id: alteIds[0], title: "Vorgang 1", created_at: "2026-02-01T00:00:00.000Z" },
    { id: "pi-2", user_id: alteIds[1], title: "Vorgang 2", created_at: "2026-02-01T00:00:00.000Z" }
  );
  tabellen.personalized_recommendations.push(
    { id: "pr-1", user_id: alteIds[0], political_item_id: "pi-1", priority: "high", personal_relevance_explanation: "x", recommended_action: "y", action_type: "z" }
  );
  tabellen.daily_tasks.push(
    { id: "dt-1", user_id: alteIds[0], recommendation_id: "pr-1", title: "Aufgabe 1", priority: "high", status: "open" }
  );

  const roh = {
    snapshotVertrag: GEN.SNAPSHOT_VERTRAG,
    operationId: "bb-rss-ersatz-20260929-01",
    erstelltAm: "2026-09-29T20:00:00.000Z",
    erstelltVon: "Betreiber, rein lesend vor der geschuetzten Aktion",
    paket: { pfad: "daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json", sha256: paketHash },
    bestand: { profilesGesamt: GEN.PROFILES_GESAMT, mandateProfilesGesamt: GEN.MANDATE_GESAMT, aktivGesamt: 0 },
    ids: { mandat: alteIds.slice().sort(), fremd: [FREMD_ID] },
    fremd_profiles: [{ id: FREMD_ID, name: "Fremdes Profil ohne Mandat", created_at: "2025-12-01T00:00:00.000Z" }],
    tabellen
  };
  roh.sha256 = sha256(JSON.stringify(kanonisch(ohneFeld(roh, "sha256"))));
  return { snapshot: roh, alteIds, fremdIds: [FREMD_ID] };
}

function main() {
  console.log("Helmut — 500er-Ersatz-Preflight/SQL-Generator (offline)\n");

  const paket = GEN.ladePaket(PAKET_PFAD);
  const rohText = fs.readFileSync(PAKET_PFAD, "utf8");
  const paketHash = sha256Datei(PAKET_PFAD);

  // ── 1 · Preflight des echten Pakets ──────────────────────────────────────────────────────
  abschnitt("1 · Preflight des echten 500er-Pakets");
  const ergebnis = GEN.preflight(paket);
  check("1.1 Preflight ist gruen", ergebnis.ok === true, AUD(fehlerCodes(ergebnis)));
  check("1.2 Keine Befunde", ergebnis.fehler.length === 0, `${ergebnis.fehler.length} Befunde`);
  check("1.3 Exakt 500 Profile", ergebnis.profile === 500 && paket.profile.length === 500, `profile=${ergebnis.profile}`);
  check("1.4 Verteilung exakt 330/120/50", AUD(ergebnis.zaehlung) === AUD(GEN.ERWARTET), AUD(ergebnis.zaehlung));
  const idSet = new Set(ergebnis.ids);
  check("1.5 500 eindeutige, nicht-leere Kennungen",
    idSet.size === 500 && ergebnis.ids.length === 500 && ergebnis.ids.every(Boolean), `distinct=${idSet.size}`);
  check("1.6 Kein Paketprofil ist AfD-zugehoerig", paket.profile.every((p) => ZULASSUNG.istAusgeschlossen(p) === false));
  check("1.7 Kein Paketprofil traegt roh AfD/Alternative fuer Deutschland",
    paket.profile.every((p) => !/afd|alternative f(ü|ue)r deutschland/i.test(`${p.partei || ""} ${p.fraktion || ""}`)));
  check("1.8 Kein Paketprofil ist aktiv", paket.profile.every((p) => p.aktiv === false));

  // ── 2 · Kopplung an den bestehenden Importvertrag ────────────────────────────────────────
  abschnitt("2 · Der Preflight nutzt den bestehenden Importvertrag als Wahrheit");
  const vertrag = IMPORT.pruefeImport(paket);
  check("2.1 Importvertrag akzeptiert das Paket vollstaendig",
    vertrag.ok === true && vertrag.gueltig === 500, `ok=${vertrag.ok} gueltig=${vertrag.gueltig}`);
  check("2.2 Zusammenfassung bestaetigt: alle aktiv:false", vertrag.zusammenfassung.alleAktivFalse === true);
  check("2.3 Vorabpruefung meldet keinen Vertragsbruch", !fehlerCodes(ergebnis).includes("importvertrag"));

  // ── 3 · Zeilenplan der neuen Kohorte ──────────────────────────────────────────────────────
  abschnitt("3 · Neue Kohorte: 500 Zeilenpaare, deaktiviert, afd-frei, ebenenrichtig");
  const zeilen = GEN.erzeugeZeilen(paket);
  check("3.1 500 profiles- und 500 mandate_profiles-Zeilen",
    zeilen.profileRows.length === 500 && zeilen.mandateRows.length === 500);
  check("3.2 Jede Mandatszeile traegt aktiv:false", zeilen.mandateRows.every((z) => z.aktiv === false));
  check("3.3 Keine Mandatszeile traegt AfD in Partei/Fraktion",
    zeilen.mandateRows.every((z) => !/afd|alternative f(ü|ue)r deutschland/i.test(`${z.partei || ""} ${z.fraktion || ""}`)));
  check("3.4 politische_ebene nur bundestag/landtag (CHECK-konform)",
    zeilen.mandateRows.every((z) => z.politische_ebene === "bundestag" || z.politische_ebene === "landtag"));
  const ebenen = {};
  for (const z of zeilen.mandateRows) ebenen[z.politische_ebene] = (ebenen[z.politische_ebene] || 0) + 1;
  check("3.5 Mandatsebenen 330 Bundestag / 170 Landtag", ebenen.bundestag === 330 && ebenen.landtag === 170, AUD(ebenen));
  check("3.6 user_id eindeutig und deckungsgleich mit den profiles-Zeilen",
    new Set(zeilen.mandateRows.map((z) => z.user_id)).size === 500
    && AUD(zeilen.mandateRows.map((z) => z.user_id)) === AUD(zeilen.profileRows.map((z) => z.id)));

  // ── 4 · Snapshot-Vertrag (positiv) ───────────────────────────────────────────────────────
  abschnitt("4 · Preimage-Snapshot: Vertrag, ID-Mengenbindung, genau 500 alte Zeilen");
  const { snapshot, alteIds, fremdIds } = baueAltbestand(paketHash);
  const sp = GEN.pruefeSnapshot(snapshot, { paketHash, neueIds: ergebnis.ids });
  check("4.1 Gueltiger Snapshot wird akzeptiert", sp.ok === true, AUD(fehlerCodes(sp)));
  check("4.2 Snapshot-Hash ist selbstkonsistent",
    sha256(JSON.stringify(kanonisch(ohneFeld(snapshot, "sha256")))) === snapshot.sha256);
  check("4.3 Der Generator berechnet denselben Snapshot-Hash", GEN.hashSnapshot(snapshot) === snapshot.sha256);
  check("4.4 Genau 500 alte profiles- und mandate_profiles-Zeilen",
    snapshot.tabellen.profiles.length === 500 && snapshot.tabellen.mandate_profiles.length === 500);
  check("4.5 ID-Mengenbindung deckungsgleich (ids.mandat == profiles == mandate_profiles)",
    sp.ids.mandat.length === 500 && sp.ids.mandat.join() === alteIds.slice().sort().join());
  check("4.6 Alle bekannten FK-Kindtabellen sind als Abschnitt vorhanden",
    GEN.FK_KINDTABELLEN.every((t) => Array.isArray(snapshot.tabellen[t])));
  check("4.7 Altbestand ist AfD-frei und vollstaendig inaktiv",
    snapshot.tabellen.mandate_profiles.every((z) => z.aktiv === false
      && !ZULASSUNG.istAusgeschlossen({ partei: z.partei, fraktion: z.fraktion })));
  check("4.8 Fremdprofil (501. profiles ohne Mandat) erfasst",
    snapshot.fremd_profiles.length === 1 && snapshot.fremd_profiles[0].id === FREMD_ID);

  // ── 5 · Ersatz-SQL Struktur + Selbsttest ─────────────────────────────────────────────────
  abschnitt("5 · Ersatz-SQL: atomar, transaktional, Selbsttest gruen");
  const sql = GEN.baueErsatzSql(paket, ergebnis, snapshot, { paketHash });
  const selbst = GEN.pruefeErsatzSql(sql, { neueIds: ergebnis.ids, alteIds: sp.ids.mandat, fremdIds: sp.ids.fremd, snapshot: sp });
  check("5.1 Selbsttest des erzeugten SQL ist gruen", selbst.length === 0, selbst.map((f) => f.code).join(", ") || "0 Befunde");
  const anweisungen = (s) => s.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("--"));
  for (const [name, s] of [["Vorwaerts", sql.forward], ["Rueckweg", sql.rollback]]) {
    const z = anweisungen(s);
    check(`5.2 ${name}-SQL hat genau eine Transaktion (1x begin;, 1x commit;)`,
      z.filter((l) => /^begin;$/i.test(l)).length === 1 && z.filter((l) => /^commit;$/i.test(l)).length === 1);
    check(`5.3 ${name}-SQL beginnt mit begin; und endet mit commit;`,
      z[0].toLowerCase() === "begin;" && z[z.length - 1].toLowerCase() === "commit;");
    check(`5.4 ${name}-SQL sperrt profiles und mandate_profiles transaktional`,
      /lock table public\.profiles in access exclusive mode;/i.test(s)
      && /lock table public\.mandate_profiles in access exclusive mode;/i.test(s));
  }
  check("5.5 operation_id und Snapshot-Hash stehen im SQL-Kopf",
    sql.forward.includes("operation_id: bb-rss-ersatz-20260929-01") && sql.forward.includes(snapshot.sha256));
  check("5.6 Dokumentation nennt den getrennten, rein lesenden Snapshot-Schritt",
    /separat rein lesend/i.test(sql.forward) && /NICHT AUSGEFÜHRT/.test(sql.forward));

  // ── 6 · Vorwaerts-Vertrag ────────────────────────────────────────────────────────────────
  abschnitt("6 · Vorwaerts: Preimage-ID-Menge, nur profiles loeschen, neue Kohorte inaktiv");
  const fDel = sql.forward.match(/delete\s+from\s+public\.profiles\s+where\s+id\s+in\s*\(([^)]*)\)/i);
  const fDelIds = fDel ? [...fDel[1].matchAll(/'([^']*)'/g)].map((x) => x[1]).sort() : [];
  check("6.1 Genau EIN delete — nur profiles, kennungsgebunden",
    (sql.forward.match(/delete\s+from\s+public\./gi) || []).length === 1
    && !/delete\s+from\s+public\.mandate_profiles/i.test(sql.forward));
  check("6.2 Der delete trifft exakt die 500 Preimage-IDs",
    fDelIds.length === 500 && fDelIds.join() === sp.ids.mandat.join());
  check("6.3 Das Fremdprofil wird NICHT geloescht", !fDelIds.includes(FREMD_ID));
  check("6.4 Genau die zwei Inserts (profiles + mandate_profiles)",
    (sql.forward.match(/\binsert\s+into\s+public\.profiles\b/gi) || []).length === 1
    && (sql.forward.match(/\binsert\s+into\s+public\.mandate_profiles\b/gi) || []).length === 1);
  check("6.5 Alle 500 neuen Kennungen stehen im Insert", ergebnis.ids.every((id) => sql.forward.includes(`'${id}'`)));
  check("6.6 Preimage-, Nach-, aktiv-, AfD- und Fremdprofil-Riegel sind ausfuehrbar",
    /VORBEDINGUNG VERLETZT/.test(sql.forward)
    && (sql.forward.match(/NACHBEDINGUNG VERLETZT/g) || []).length >= 6
    && /ilike\s+'%afd%'/i.test(sql.forward)
    && /aktiv is not false/i.test(sql.forward)
    && sql.forward.includes(`Fremdprofil-Zeilen erhalten (erwartet ${fremdIds.length}`));
  check("6.7 Exakt 500/501 werden geprueft",
    new RegExp(`<>\\s*${GEN.MANDATE_GESAMT}\\b`).test(sql.forward)
    && new RegExp(`<>\\s*${GEN.PROFILES_GESAMT}\\b`).test(sql.forward));
  check("6.8 Alle 500 neuen Mandatszeilen stehen auf false", (sql.forward.match(/, false, 'neu', /g) || []).length === 500);

  // Fail-closed Reihenfolge: der ausfuehrbare Riegel muss VOR der ersten Schreiboperation stehen.
  // Bewusst unabhaengig zur Generator-Selbstpruefung implementiert (gleiche Textprobe, andere Stelle).
  const ersteSchreibindex = (s) => {
    const re = /\b(insert\s+into|update\s+public|delete\s+from|alter\s+table|truncate)\b/i;
    let offset = 0;
    for (const zeile of s.split("\n")) {
      const rumpf = zeile.replace(/--.*$/, "");
      if (re.test(rumpf)) return offset + rumpf.search(re);
      offset += zeile.length + 1;
    }
    return -1;
  };
  const riegelEndindex = (s) => {
    const start = s.indexOf("do $$");
    return start < 0 ? -1 : s.indexOf("end $$;", start);
  };
  check("6.9 Der fail-closed Riegel steht vollstaendig VOR der ersten Schreiboperation",
    (() => {
      const posMut = ersteSchreibindex(sql.forward);
      const posEnde = riegelEndindex(sql.forward);
      const davor = posMut > 0 ? sql.forward.slice(0, posMut) : "";
      return posMut > 0 && posEnde > 0 && posEnde < posMut
        && (davor.match(/ERSATZ VORBEDINGUNG VERLETZT/g) || []).length >= 8
        && /% profiles-Zeilen gesamt \(erwartet 501 = 500 Mandatsprofile \+ 1 Fremdprofil\)/.test(davor);
    })(),
    `ersteMutation=${ersteSchreibindex(sql.forward)} riegelEnde=${riegelEndindex(sql.forward)}`);

  // ── 7 · Rueckweg-Vertrag ─────────────────────────────────────────────────────────────────
  abschnitt("7 · Rueckweg: Guard, exakte neue Kohorte, FK-sichere Wiederherstellung");
  const rDel = sql.rollback.match(/delete\s+from\s+public\.profiles\s+where\s+id\s+in\s*\(([^)]*)\)/i);
  const rDelIds = rDel ? [...rDel[1].matchAll(/'([^']*)'/g)].map((x) => x[1]).sort() : [];
  check("7.1 Genau EIN delete — nur profiles, kennungsgebunden",
    (sql.rollback.match(/delete\s+from\s+public\./gi) || []).length === 1
    && !/delete\s+from\s+public\.mandate_profiles/i.test(sql.rollback));
  check("7.2 Der delete trifft exakt die neue Kohorte",
    rDelIds.length === 500 && rDelIds.join() === ergebnis.ids.slice().sort().join());
  check("7.3 Guard gegen unerwartete neue Kinddaten vorhanden",
    /UNERWARTETE neue Kinddaten/.test(sql.rollback)
    && GEN.FK_KINDTABELLEN.filter((t) => t !== "mandate_profiles").every((t) => sql.rollback.includes(`public.${t}`)));
  check("7.4 Rueckweg nennt kein Update/DDL", !/\bupdate\s+public\.|\balter\s+table\b/i.test(sql.rollback));
  const pos = (s) => sql.rollback.indexOf(s);
  check("7.5 profiles vor mandate_profiles vor Kindtabellen (FK-sicher)",
    pos("insert into public.profiles ") < pos("insert into public.mandate_profiles ")
    && pos("insert into public.mandate_profiles ") < pos("insert into public.political_items ")
    && pos("insert into public.political_items ") < pos("insert into public.personalized_recommendations ")
    && pos("insert into public.personalized_recommendations ") < pos("insert into public.daily_tasks "));
  check("7.6 Snapshot-Zeilen werden spaltenvollstaendig wiederhergestellt",
    /jsonb_populate_recordset/.test(sql.rollback) && sql.rollback.includes(alteIds[0])
    && sql.rollback.includes('"name":"Altbestand 1"'));
  check("7.7 Rueckweg-Nachbedingung prueft den Snapshot-Bestand und 0 Fremdmandate",
    /RUECKWEG NACHBEDINGUNG VERLETZT/.test(sql.rollback)
    && /Snapshot-Zeilen in public\.briefings \(erwartet 3\)/.test(sql.rollback)
    && /Fremdprofile tragen ein Mandat \(erwartet 0\)/.test(sql.rollback));
  check("7.8 Der Guard steht vollstaendig VOR dem delete der neuen Kohorte",
    (() => {
      const posMut = ersteSchreibindex(sql.rollback);
      const posEnde = riegelEndindex(sql.rollback);
      return posMut > 0 && posEnde > 0 && posEnde < posMut
        && /RUECKWEG VORBEDINGUNG VERLETZT/.test(sql.rollback.slice(0, posMut));
    })(),
    `ersteMutation=${ersteSchreibindex(sql.rollback)} riegelEnde=${riegelEndindex(sql.rollback)}`);
  check("7.9 Der Rueckweg-Kopf bindet die Wiederherstellung an den versiegelten Snapshot",
    sql.rollback.includes(`-- Snapshot: ${snapshot.erstelltAm} von`)
    && sql.rollback.includes(snapshot.sha256)
    && /ATOMARER RUECKWEG \(Preimage-Wiederherstellung\)/.test(sql.rollback)
    && /Snapshot-Profile samt Kinddaten wieder her/.test(sql.rollback));

  // ── 8 · Mutationsprobe: der Selbsttest greift tatsaechlich ───────────────────────────────
  abschnitt("8 · Mutationsprobe: der SQL-Selbsttest greift tatsaechlich");
  const ohneCommit = GEN.pruefeErsatzSql(
    { forward: sql.forward.replace(/\ncommit;\s*$/, "\n"), rollback: sql.rollback },
    { neueIds: ergebnis.ids, alteIds: sp.ids.mandat, fremdIds: sp.ids.fremd, snapshot: sp });
  check("8.1 Fehlt das commit;, meldet der Selbsttest nicht-atomar",
    ohneCommit.some((f) => f.code === "forward-transaktion") || ohneCommit.some((f) => f.code === "forward-ende"));
  const ohneSperre = GEN.pruefeErsatzSql(
    { forward: sql.forward, rollback: sql.rollback.replace(/lock table public\.profiles[^\n]*\n/, "") },
    { neueIds: ergebnis.ids, alteIds: sp.ids.mandat, fremdIds: sp.ids.fremd, snapshot: sp });
  check("8.2 Fehlt die Sperre, meldet der Selbsttest die fehlende Transaktionssperre",
    ohneSperre.some((f) => f.code === "rollback-sperre"));
  const fremdGeloescht = GEN.pruefeErsatzSql(
    { forward: sql.forward.replace("delete from public.profiles where id in (", `delete from public.profiles where id in ('${FREMD_ID}', `), rollback: sql.rollback },
    { neueIds: ergebnis.ids, alteIds: sp.ids.mandat, fremdIds: sp.ids.fremd, snapshot: sp });
  check("8.3 Ein geloeschtes Fremdprofil wird erkannt",
    fremdGeloescht.some((f) => f.code === "forward-fremd-geloescht") || fremdGeloescht.some((f) => f.code === "forward-delete-ids"));
  const mandateGeloescht = GEN.pruefeErsatzSql(
    { forward: sql.forward, rollback: sql.rollback.replace("delete from public.profiles where id in", "delete from public.mandate_profiles where user_id in") },
    { neueIds: ergebnis.ids, alteIds: sp.ids.mandat, fremdIds: sp.ids.fremd, snapshot: sp });
  check("8.4 Ein expliziter mandate_profiles-delete im Rueckweg wird erkannt",
    mandateGeloescht.some((f) => f.code === "rollback-delete-mandate"));
  const riegelVerschoben = (() => {
    const start = sql.forward.indexOf("do $$");
    const ende = sql.forward.indexOf("end $$;", start) + "end $$;".length;
    const block = sql.forward.slice(start, ende);
    const ohne = sql.forward.slice(0, start) + sql.forward.slice(ende);
    return ohne.replace(/\ncommit;\s*$/, `\n${block}\n\ncommit;`);
  })();
  const reihenfolge = GEN.pruefeErsatzSql(
    { forward: riegelVerschoben, rollback: sql.rollback },
    { neueIds: ergebnis.ids, alteIds: sp.ids.mandat, fremdIds: sp.ids.fremd, snapshot: sp });
  check("8.5 Ein hinter die Mutationen verschobener Riegel wird erkannt",
    reihenfolge.some((f) => f.code === "forward-riegel-reihenfolge"),
    reihenfolge.map((f) => f.code).join(", ") || "0 Befunde");

  // ── 9 · FAIL-CLOSED: ungueltige Snapshots/Pakete erzeugen kein SQL ───────────────────────
  abschnitt("9 · Fail-closed: ungueltiger Snapshot/Hash/ID-Menge/Paket => kein SQL");
  const versiegle = (s) => { s.sha256 = sha256(JSON.stringify(kanonisch(ohneFeld(s, "sha256")))); return s; };
  const snapshotFaelle = [
    ["nur 499 alte Mandatszeilen", (s) => { s.tabellen.mandate_profiles.pop(); }, "snapshot-mandate-anzahl"],
    ["gebrochener Snapshot-Hash", (s) => { s.sha256 = "0".repeat(64); }, "snapshot-hash-mismatch"],
    ["ID-Menge weicht von den Zeilen ab", (s) => { s.ids.mandat = s.ids.mandat.slice(0, 499); versiegle(s); }, "snapshot-id-menge-anzahl"],
    ["Paket-Hash passt nicht", (s) => { s.paket.sha256 = "1".repeat(64); versiegle(s); }, "snapshot-paket-hash-mismatch"],
    ["unbekannte Snapshot-Tabelle", (s) => { s.tabellen.geheime_tabelle = []; versiegle(s); }, "snapshot-tabelle-unbekannt"],
    ["fehlender FK-Kindabschnitt", (s) => { delete s.tabellen.briefings; versiegle(s); }, "snapshot-tabelle-fehlt"],
    ["Kindzeile ausserhalb der Kohorte", (s) => { s.tabellen.briefings[0].user_id = FREMD_ID; versiegle(s); }, "snapshot-kind-zeile-fremd"],
    ["Aktivzeile im Altbestand", (s) => { s.tabellen.mandate_profiles[0].aktiv = true; versiegle(s); }, "snapshot-aktiv-zeile"],
    ["AfD-Zeile im Altbestand", (s) => { s.tabellen.mandate_profiles[0].partei = "AfD"; s.tabellen.mandate_profiles[0].fraktion = "AfD"; versiegle(s); }, "snapshot-afd"],
    ["Kollision neu/alt", (s) => {
      s.tabellen.profiles[0].id = ergebnis.ids[0];
      s.tabellen.mandate_profiles[0].user_id = ergebnis.ids[0];
      s.ids.mandat = s.ids.mandat.slice(); s.ids.mandat[0] = ergebnis.ids[0];
      versiegle(s);
    }, "snapshot-neu-kollision"],
    ["fremdes Profil fehlt", (s) => { s.fremd_profiles = []; s.ids.fremd = []; versiegle(s); }, "snapshot-fremd-anzahl"],
    ["uneinheitlicher Spaltensatz", (s) => { s.tabellen.briefings[0].zusaetzliche_spalte = 1; versiegle(s); }, "snapshot-spaltensatz"]
  ];
  for (const [name, mutiere, erwartetCode] of snapshotFaelle) {
    const mutiert = klon(snapshot);
    mutiere(mutiert);
    const pruef = GEN.pruefeSnapshot(mutiert, { paketHash, neueIds: ergebnis.ids });
    check(`9 Snapshot rot bei: ${name}`, pruef.ok === false && fehlerCodes(pruef).includes(erwartetCode),
      `ok=${pruef.ok} codes=${fehlerCodes(pruef).slice(0, 4).join(", ") || "-"}`);
    let geworfen = false;
    try { GEN.baueErsatzSql(paket, ergebnis, mutiert, { paketHash }); } catch (e) { geworfen = !!e && e.code === "snapshot-fehler"; }
    check(`9 Kein SQL bei Snapshot-Fall: ${name}`, geworfen);
  }

  const paketFaelle = [
    ["falsche Anzahl (499)", (p) => { p.profile.pop(); }, "kohorte-anzahl"],
    ["falsche Verteilung", (p) => { p.profile[0].parlament = "landtag-berlin"; }, "verteilung"],
    ["ein Profil aktiv:true", (p) => { p.profile[0].aktiv = true; }, "aktiv-true"],
    ["AfD-Profil eingeschleust", (p) => { p.profile[0] = synthetischAfd("synthetisch-afd-importprobe"); }, "afd-ausschluss"],
    ["doppelte Kennung", (p) => { p.profile[1].mandatsId = p.profile[0].mandatsId; }, "dublette-mandatsId"],
    ["Freigabe behauptet", (p) => { p.offlinePaket.importfreigabe.freigegeben = true; }, "importfreigabe"]
  ];
  for (const [name, mutiere, erwartetCode] of paketFaelle) {
    const mutiert = klon(paket);
    mutiere(mutiert);
    const pruef = GEN.preflight(mutiert);
    check(`9 Preflight rot bei Paket: ${name}`, pruef.ok === false && fehlerCodes(pruef).includes(erwartetCode),
      `ok=${pruef.ok} codes=${fehlerCodes(pruef).join(", ") || "-"}`);
    let geworfen = false;
    try { GEN.baueErsatzSql(mutiert, null, snapshot, { paketHash }); } catch (e) { geworfen = !!e && e.code === "preflight-fehler"; }
    check(`9 Kein SQL bei Paket-Fall: ${name}`, geworfen);
  }
  check("9.z Die synthetische AfD-Kennung steht NIE im echten Paket",
    !/synthetisch/.test(rohText) && !ergebnis.ids.includes("synthetisch-afd-importprobe"));
  check("9.w AfD-Testfall bleibt lokales Objekt, das echte Paket bleibt gruen",
    ZULASSUNG.istAusgeschlossen(synthetischAfd()) === true && GEN.preflight(klon(paket)).ok === true);

  // ── 10 · CLI end-to-end (kein Netz/DB) ───────────────────────────────────────────────────
  abschnitt("10 · CLI: SQL nur mit gueltigem Snapshot, Default fail-closed");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-import-ersatz-"));

  const defaultLauf = spawnSync(process.execPath, [GENERATOR_PFAD], { encoding: "utf8" });
  check("10.1 Default-Aufruf ohne Snapshot endet != 0", defaultLauf.status !== 0, `status=${defaultLauf.status}`);
  check("10.2 Default-Aufruf gibt KEIN SQL aus",
    !/\bbegin;/i.test(defaultLauf.stdout) && !/\binsert\s+into\b/i.test(defaultLauf.stdout)
    && !/\bdelete\s+from\b/i.test(defaultLauf.stdout) && /FAIL-CLOSED/.test(`${defaultLauf.stdout}${defaultLauf.stderr}`));

  const snapshotPfad = path.join(tmp, "snapshot.json");
  fs.writeFileSync(snapshotPfad, JSON.stringify(snapshot));
  const outOk = path.join(tmp, "ok");
  const lauf = spawnSync(process.execPath, [GENERATOR_PFAD, "--snapshot", snapshotPfad, "--out", outOk], { encoding: "utf8" });
  check("10.3 CLI Exit 0 mit gueltigem Snapshot", lauf.status === 0, `status=${lauf.status} ${(lauf.stderr || "").slice(0, 160)}`);
  const fwdPfad = path.join(outOk, "500er-ersatz.sql");
  const rollPfad = path.join(outOk, "500er-ersatz-rueckweg.sql");
  check("10.4 CLI schreibt Vorwaerts- und Rueckweg-SQL", fs.existsSync(fwdPfad) && fs.existsSync(rollPfad));
  const fwdInhalt = fs.existsSync(fwdPfad) ? fs.readFileSync(fwdPfad, "utf8") : "";
  check("10.5 Geschriebenes Vorwaerts-SQL ist atomar, kohortenrein und inaktiv",
    /^begin;/m.test(fwdInhalt) && /^commit;\s*$/m.test(fwdInhalt)
    && (fwdInhalt.match(/, false, 'neu', /g) || []).length === 500
    && (fwdInhalt.match(/delete\s+from\s+public\./gi) || []).length === 1);
  const rollInhalt = fs.existsSync(rollPfad) ? fs.readFileSync(rollPfad, "utf8") : "";
  check("10.6 Geschriebenes Rueckweg-SQL enthaelt Guard und Wiederherstellung",
    /UNERWARTETE neue Kinddaten/.test(rollInhalt) && /jsonb_populate_recordset/.test(rollInhalt));

  const mutiertPfad = path.join(tmp, "mutiert.json");
  const mutiert = klon(snapshot);
  mutiert.tabellen.mandate_profiles.pop();
  fs.writeFileSync(mutiertPfad, JSON.stringify(mutiert));
  const outRot = path.join(tmp, "rot");
  const laufRot = spawnSync(process.execPath, [GENERATOR_PFAD, "--snapshot", mutiertPfad, "--out", outRot], { encoding: "utf8" });
  check("10.7 CLI Exit != 0 fuer einen ungueltigen Snapshot", laufRot.status !== 0, `status=${laufRot.status}`);
  check("10.8 CLI schreibt bei ungueltigem Snapshot KEIN SQL", !fs.existsSync(path.join(outRot, "500er-ersatz.sql")));
  check("10.9 CLI nennt den konkreten Grund (snapshot-mandate-anzahl)",
    /snapshot-mandate-anzahl/.test(`${laufRot.stdout}${laufRot.stderr}`));

  const stdoutLauf = spawnSync(process.execPath, [GENERATOR_PFAD, "--snapshot", snapshotPfad], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  check("10.10 Standardausgabe mit Snapshot liefert das komplette Ersatz-SQL",
    stdoutLauf.status === 0 && /^-- ====/m.test(stdoutLauf.stdout) && /^commit;/m.test(stdoutLauf.stdout)
    && /operation_id: bb-rss-ersatz-20260929-01/.test(stdoutLauf.stdout));

  // ── 11 · Der Generator bleibt rein (kein DB-/Netz-Modul) ─────────────────────────────────
  abschnitt("11 · Der Generator bleibt rein (kein DB-/Netz-Modul)");
  const geladen = Object.keys(require.cache)
    .filter((f) => f.startsWith(ROOT) && !f.includes("node_modules"))
    .filter((f) => /provisioning|storage\.js|supabase|scheduler|cron-|server\.js|profile-db|llm-/.test(f));
  check("11.1 Kein Schreib-/Provisionierungs-/DB-Modul geladen", geladen.length === 0,
    geladen.map((f) => path.relative(ROOT, f)).join(", ") || "keine");
  check("11.2 Der Generator ist reines SQL-/Pruefwerkzeug (Modul-Exports vorhanden)",
    typeof GEN.preflight === "function" && typeof GEN.pruefeSnapshot === "function"
    && typeof GEN.baueErsatzSql === "function" && typeof GEN.pruefeErsatzSql === "function");

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (Pruefungen ${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
