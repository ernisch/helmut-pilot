"use strict";

// Helmut — Phase 1, Punkt 18: Production-Inventur aller Quellenpakete (Werkzeug).
// =============================================================================================
// STRIKT READ-ONLY. Dieses Skript führt AUSSCHLIESSLICH `select`-Abfragen aus. Es schreibt
// keine Zeile, ändert kein Flag, aktiviert und deaktiviert kein Paket, löst keinen Crawl aus
// und rührt weder Cron-Zeiten noch Kostenlogik an.
//
// WARUM ES DIESES SKRIPT GIBT:
//   Die bisherige Inventur (`docs/quellenarchitektur/30-paket-inventur-production.md`) war eine
//   von Hand erhobene Momentaufnahme vom 2026-07-25 — inhaltlich belegt, aber nicht wiederholbar.
//   Genau der Fehlermodus, den eine Inventur aufdecken soll (die Versorgung fällt unbemerkt aus),
//   trifft eine handgepflegte Tabelle als Erstes: sie veraltet still. Punkt 18 verlangt deshalb
//   ausdrücklich eine automatisiert reproduzierbare Ausgabe.
//
// QUELLE DER WAHRHEIT (in dieser Reihenfolge, keine zweite Buchführung):
//   1. `source_packages` / `package_paths` / `retrieval_paths`  — der Bestand
//   2. `buildRelationalCrawlPlan` (lib/helmut/quellenarchitektur/source-mode.js)
//                                                                — was ist WIRKLICH eingeplant
//   3. `computeGlobalActivation` (profile-packages.js)          — was aktiviert es
//   4. `source_crawl_telemetry` über Punkt 16 (source-failure.js) — was passiert tatsächlich
//   Zusammengeführt wird das in `lib/helmut/quellenarchitektur/paket-inventur.js` (reine Logik,
//   offline testbar). Dieses Skript ist nur der Lesekopf davor und die Ausgabe dahinter.
//
// EHRLICHKEIT (CLAUDE.md §4.3/§4.4): Ein Paket ohne Abrufwege, ohne Lieferung oder ohne
// verwertbare Telemetrie erscheint AUSDRÜCKLICH als solches. Unbekannt wird nie zu gesund.
// Ohne Datenbankzugang endet der Lauf mit Exit 2 — nie mit einem grünen Ergebnis ohne Daten.
//
// Secrets ausschliesslich aus `process.env` (CLAUDE.md §4.9): lokal aus der Shell, in einer
// Cloud-Sitzung aus den Claude-Code-Environment-Einstellungen.
//
// Aufruf:
//   node scripts/paket-inventur.js                     # Klartextbericht
//   node scripts/paket-inventur.js --json              # maschinenlesbar (vollständig)
//   node scripts/paket-inventur.js --fenster=14        # Betriebszeitraum in Tagen
//   node scripts/paket-inventur.js --paket=bund-basis  # nur ein Paket, mit Wegeliste
//   node scripts/paket-inventur.js --wege              # Wegeliste für JEDES Paket
//   node scripts/paket-inventur.js --stand=2026-07-27T06:00:00Z   # Bewertungszeitpunkt fixieren
//   node scripts/paket-inventur.js --ohne-lieferhistorie          # keine Nachfragen je Quelle

const { buildPaketInventur, PAKET_ZUSTAENDE } = require("../lib/helmut/quellenarchitektur/paket-inventur");
const { fromMandateProfileRow } = require("../lib/helmut/storage");

const args = process.argv.slice(2);
const alsJson = args.includes("--json");
const zeigeWege = args.includes("--wege");
const ohneLieferhistorie = args.includes("--ohne-lieferhistorie");
const argWert = (name, fallback) => {
  const treffer = args.find((a) => a.startsWith(`--${name}=`));
  return treffer ? treffer.slice(name.length + 3) : fallback;
};
const fensterTage = Math.max(1, Number(argWert("fenster", "14")) || 14);
const nurPaket = argWert("paket", "");
const standRoh = argWert("stand", "");
const telemetrieLimit = Math.max(1000, Number(argWert("telemetrie-limit", "40000")) || 40000);
// Obergrenze für die Einzelnachfragen „letzte Lieferung überhaupt". Bewusst gedeckelt:
// eine Inventur darf die Datenbank nicht mit hunderten Einzelabfragen belasten. Wird der
// Deckel erreicht, sagt der Bericht das ausdrücklich (statt still zu kürzen).
const lieferhistorieMax = Math.max(0, Number(argWert("lieferhistorie-max", "120")) || 120);

const now = standRoh ? Date.parse(standRoh) : Date.now();
if (!Number.isFinite(now)) {
  console.error(`ABBRUCH: --stand=${standRoh} ist kein gültiger Zeitpunkt.`);
  process.exit(1);
}

function baseUrl() { return String(process.env.SUPABASE_URL || "").replace(/\/+$/, ""); }
function serviceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}
if (!baseUrl() || !serviceKey()) {
  console.error("NICHT ERHEBBAR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen.");
  console.error("Die Inventur behauptet ohne Datenbank keinen Zustand. Secrets kommen ausschliesslich aus");
  console.error("der Prozessumgebung (lokal: Shell · Cloud-Sitzung: Claude-Code-Environment-Einstellungen).");
  process.exit(2);
}

async function select(pfad) {
  const antwort = await fetch(`${baseUrl()}/rest/v1/${pfad}`, {
    headers: { apikey: serviceKey(), Authorization: `Bearer ${serviceKey()}`, Accept: "application/json" }
  });
  if (!antwort.ok) throw new Error(`GET ${pfad.split("?")[0]} -> HTTP ${antwort.status}`);
  return antwort.json();
}

// Seitenweises Lesen (PostgREST deckelt eine einzelne Antwort). Spiegelt bewusst
// storage.listSourceCrawlTelemetry — neueste zuerst, damit ein Limit immer das
// AKTUELLE Fenster behält und nie einen alten Rest.
async function selectSeitenweise(basispfad, gesamtLimit, seite = 1000) {
  const out = [];
  for (let offset = 0; offset < gesamtLimit; offset += seite) {
    const nehmen = Math.min(seite, gesamtLimit - offset);
    const rows = await select(`${basispfad}&offset=${offset}&limit=${nehmen}`);
    if (!Array.isArray(rows) || !rows.length) break;
    out.push(...rows);
    if (rows.length < nehmen) break;
  }
  return out;
}

const TELEMETRIE_SPALTEN = "source_id,status,error_code,duration_ms,found_documents,new_documents,retry_count,created_at,finished_at,run_id";

async function leseBestand() {
  const seit = new Date(now - fensterTage * 24 * 3600e3).toISOString();
  const [packages, packagePaths, retrievalPaths, geographies, profilZeilen] = await Promise.all([
    select("source_packages?select=*&order=key.asc&limit=500"),
    select("package_paths?select=*&limit=20000"),
    select("retrieval_paths?select=*&order=id.asc&limit=5000"),
    select("geographies?select=id,level,name,parent_id&limit=2000"),
    // Identisch zu storage.listFullProfilesFromDb: Identitätszeile + Mandatszeile,
    // soft-gelöschte werden ausgeblendet. Die Abbildung auf die Resolver-Form läuft
    // über DIESELBE Funktion wie im Server (fromMandateProfileRow) — keine zweite
    // Zuordnungslogik, kein Mandant im Code.
    select("profiles?select=*,mandate_profiles(*)&order=id.asc&limit=5000")
  ]);
  const telemetrie = await selectSeitenweise(
    `source_crawl_telemetry?select=${TELEMETRIE_SPALTEN}&created_at=gte.${encodeURIComponent(seit)}&order=created_at.desc`,
    telemetrieLimit
  );

  const profiles = [];
  for (const row of Array.isArray(profilZeilen) ? profilZeilen : []) {
    const mandat = Array.isArray(row.mandate_profiles) ? row.mandate_profiles[0] : row.mandate_profiles;
    if (!mandat) continue;
    if (mandat.geloescht_at) continue;
    profiles.push(fromMandateProfileRow(row, mandat));
  }

  return {
    packages: Array.isArray(packages) ? packages : [],
    packagePaths: Array.isArray(packagePaths) ? packagePaths : [],
    retrievalPaths: Array.isArray(retrievalPaths) ? retrievalPaths : [],
    geographies: Array.isArray(geographies) ? geographies : [],
    profiles,
    telemetrie
  };
}

// „Letzte erfolgreiche Lieferung" ist im Fenster oft nicht beantwortbar — genau bei den
// Paketen, die interessieren (nie geliefert vs. lange nicht geliefert). Für die Quellen
// OHNE Lieferung im Fenster wird deshalb gezielt EINE Zeile ohne Zeitgrenze nachgefragt.
// Gedeckelt und im Bericht ausgewiesen.
async function leseLieferhistorie(quellen) {
  const eintraege = [];
  const genommen = quellen.slice(0, lieferhistorieMax);
  for (const sid of genommen) {
    try {
      const rows = await select(
        `source_crawl_telemetry?select=source_id,created_at,finished_at`
        + `&source_id=eq.${encodeURIComponent(sid)}&status=eq.ok&found_documents=gt.0`
        + `&order=created_at.desc&limit=1`
      );
      if (Array.isArray(rows) && rows.length) {
        eintraege.push({ source_id: sid, at: rows[0].finished_at || rows[0].created_at });
      } else {
        // Ausdrücklich als „nie geliefert" belegt (nicht bloss „nicht erhoben").
        eintraege.push({ source_id: sid, at: null });
      }
    } catch (_) { /* einzelne Nachfrage darf die Inventur nie kippen */ }
  }
  return { eintraege, angefragt: genommen.length, gedeckelt: quellen.length > genommen.length, offen: Math.max(0, quellen.length - genommen.length) };
}

// --- Ausgabe ---------------------------------------------------------------------------------

const ZUSTAND_LABEL = {
  gesund: "GESUND", eingeschraenkt: "EINGESCHRÄNKT", ausgefallen: "AUSGEFALLEN",
  inaktiv: "INAKTIV", unbekannt: "UNBEKANNT"
};

function kurzZeit(iso) {
  if (!iso) return "nie";
  return String(iso).replace("T", " ").replace(/:\d\d\.\d+Z$/, " UTC").replace(/Z$/, " UTC");
}
// Spalten müssen kürzen, nicht überlaufen — sonst verschmelzen lange Quellen-
// kennungen mit der nächsten Spalte und die Tabelle wird unlesbar.
function pad(s, n) {
  const t = String(s == null ? "" : s);
  if (t.length > n - 1) return `${t.slice(0, n - 2)}… `;
  return t + " ".repeat(n - t.length);
}
function padL(s, n) { const t = String(s == null ? "" : s); return t.length >= n ? t : " ".repeat(n - t.length) + t; }

function druckeBericht(inv) {
  const L = [];
  L.push("═".repeat(96));
  L.push("HELMUT — PRODUCTION-INVENTUR DER QUELLENPAKETE (Phase 1, Punkt 18)");
  L.push("═".repeat(96));
  L.push(`Erhoben am        : ${kurzZeit(inv.erhobenAm)}`);
  L.push(`Betriebszeitraum  : ${inv.fensterTage} Tage`);
  L.push(`Quelle der Wahrheit: relationale Quellentabellen + source_crawl_telemetry (rein lesend)`);
  L.push("");

  const d = inv.datengrundlage;
  L.push("── Datengrundlage ──");
  L.push(`  Katalog     : ${d.katalog.pakete} Pakete · ${d.katalog.abrufwege} Abrufwege · ${d.katalog.zuordnungen} Zuordnungen · ${d.katalog.geografien} Geografien`);
  L.push(`  Profile     : ${d.profile.gelesen} gelesen, davon ${d.profile.aktivierungsberechtigt} aktivierungsberechtigt`);
  L.push(`  Telemetrie  : ${d.telemetrie.verfuegbar ? `${d.telemetrie.zeilen} Zeilen · ${d.telemetrie.laeufeImFenster} Läufe (davon ${d.telemetrie.volllaeufeImFenster} vollständig, Schwelle ${d.telemetrie.volllaufSchwelleWege} versuchte Quellen)` : "KEINE"}`);
  L.push(`  Datenalter  : jüngste Telemetriezeile ${kurzZeit(inv.datenalter.juengsteZeileAt)}${inv.datenalter.alterStunden != null ? ` (vor ${inv.datenalter.alterStunden} h)` : ""}`);
  if (d.telemetrie.hinweis) L.push(`                ⚠ ${d.telemetrie.hinweis}`);
  L.push(`  Lieferhist. : ${d.lieferhistorieUnbeschraenkt.verfuegbar ? `${d.lieferhistorieUnbeschraenkt.quellen} Quellen ohne Zeitgrenze nachgefragt` : "nicht erhoben"}`);
  if (d.lieferhistorieUnbeschraenkt.hinweis) L.push(`                ⚠ ${d.lieferhistorieUnbeschraenkt.hinweis}`);
  L.push(`  Landesmodule: freigegeben [${d.landesmodule.freigegeben.join(", ") || "—"}] · mit berechtigtem Mandat [${d.landesmodule.mitBerechtigtemMandat.join(", ") || "—"}] · wirksam [${d.landesmodule.wirksam.join(", ") || "—"}]`);
  L.push(`                ${d.landesmodule.hinweis}`);
  if (d.landesmodule.unsicher) {
    L.push("                ⚠ Das Freigabe-Flag stammt aus DIESER Prozessumgebung. Der Production-Wert liegt in der");
    L.push("                  Vercel-Env und ist aus einer Sitzung nicht lesbar — die Landesmodul-Zeilen sind unsicher.");
  }
  L.push("");

  if (inv.datenalter.veraltet) {
    L.push("!".repeat(96));
    L.push("!!  VERALTETE DATENGRUNDLAGE — DER CRAWL STEHT");
    L.push("!".repeat(96));
    L.push(`  ${inv.datenalter.hinweis}`);
    L.push("");
  }

  if (inv.letzterLauf) {
    const l = inv.letzterLauf;
    L.push("── Letzter vollständiger Crawl-Lauf ──");
    L.push(`  ${l.runId} · ${kurzZeit(l.beginntAt)} → ${kurzZeit(l.endetAt)} · vor ${l.alterStunden} Stunden`);
    L.push(`  ${l.quellenMitVersuch} Quellen versucht · ${l.ok} mit Inhalt · ${l.leer} leer · ${l.fehler} Fehler · ${l.gedrosselt} gedrosselt · ${l.uebersprungen} übersprungen`);
    L.push(`  ${l.gefunden} Dokumente gefunden · ${l.neu} davon neu`);
    L.push(`  Invariante B3 (Zeilen = distinct source_id): ${l.zeilen} Zeilen / ${l.quellenDistinct} Quellen — ${l.dublettenfrei ? "erfüllt" : "VERLETZT (Dubletten im Lauf)"}`);
  } else {
    L.push("── Letzter vollständiger Crawl-Lauf ──");
    L.push(`  ⚠ ${inv.letzterLaufHinweis}`);
  }
  L.push("");

  const z = inv.summe.zustand;
  L.push("── Zustandsübersicht ──");
  L.push(`  ${inv.summe.pakete} Pakete: ${z.gesund} gesund · ${z.eingeschraenkt} eingeschränkt · ${z.ausgefallen} ausgefallen · ${z.inaktiv} inaktiv · ${z.unbekannt} unbekannt`);
  L.push(`  ${inv.summe.abrufwege} Abrufwege: ${inv.summe.wegeEingeplant} eingeplant · ${inv.summe.wegeDefekt} defekt · ${inv.summe.wegeAusgeschlossen} ausgeschlossen · ${inv.summe.wegeOhnePaket} ohne Paket`);
  L.push(`  Ertrag im Betriebszeitraum: ${inv.summe.ertragBetriebszeitraum.gefunden} gefunden · ${inv.summe.ertragBetriebszeitraum.neu} neu (entdoppelt über ${inv.summe.ertragBetriebszeitraum.quellenMitTelemetrie} Quellen)`);
  if (inv.summe.verwaisteZuordnungen > 0) L.push(`  ⚠ ${inv.summe.verwaisteZuordnungen} Paketzuordnungen zeigen auf ein fehlendes Paket oder einen fehlenden Weg`);
  L.push("");

  // Übersichtstabelle — eine Zeile je Paket, genau einmal.
  L.push("── Pakete (eine Zeile je Paket) ──");
  L.push(`  ${pad("Zustand", 15)}${pad("Paket", 26)}${pad("Ebene", 7)}${padL("Wege", 5)}${padL("aktiv", 6)}${padL("def", 5)}${padL("aus", 5)}  ${pad("Aktivierung", 22)}${padL("neu", 7)}  Letzte Lieferung`);
  L.push(`  ${"-".repeat(94)}`);
  for (const p of inv.pakete) {
    L.push(`  ${pad(ZUSTAND_LABEL[p.zustand] || p.zustand, 15)}${pad(p.key, 26)}${pad(p.ebene || "—", 7)}`
      + `${padL(p.abrufwege.gesamt, 5)}${padL(p.abrufwege.eingeplant, 6)}${padL(p.abrufwege.defekt, 5)}${padL(p.abrufwege.ausgeschlossen, 5)}  `
      + `${pad(`${p.aktivierung.paketAktivierung} (${p.aktivierung.refCount})`, 22)}`
      + `${padL(p.ertrag.betriebszeitraum.neu, 7)}  ${kurzZeit(p.letzteLieferung && p.letzteLieferung.at)}`);
  }
  L.push("");

  // Detail je Paket.
  const gefiltert = nurPaket ? inv.pakete.filter((p) => p.key === nurPaket) : inv.pakete;
  if (nurPaket && !gefiltert.length) L.push(`  ⚠ Kein Paket mit dem Schlüssel „${nurPaket}" vorhanden.`);
  for (const p of gefiltert) {
    L.push("─".repeat(96));
    L.push(`[${ZUSTAND_LABEL[p.zustand] || p.zustand}]  ${p.key} — ${p.name}`);
    L.push(`  Begründung   : ${p.zustandGrund}`);
    L.push(`  Einordnung   : Ebene ${p.ebene || "—"} · Region ${p.region ? `${p.region.id}${p.region.name ? ` (${p.region.name})` : ""}` : "—"}`
      + `${p.istBasispaket ? " · PFLICHT-Basispaket" : ""} · DB-Status ${p.dbStatus || "—"}`
      + `${p.pflichtklassen.length ? ` · ${p.pflichtklassen.length} Pflichtklassen` : ""}`);
    L.push(`  Aktivierung  : ${p.aktivierung.begruendung}`);
    if (p.aktivierung.mandatswirkungBestimmbar) {
      L.push(`                 Angefordert von ${p.aktivierung.mandate.length} Mandat(en)${p.aktivierung.mandate.length ? ` [${p.aktivierung.mandate.join(", ")}]` : ""}`);
    } else {
      L.push("                 Mandatswirkung nicht bestimmbar (keine Profile gelesen).");
    }
    L.push(`  Abrufwege    : ${p.abrufwege.gesamt} zugeordnet · ${p.abrufwege.eingeplant} eingeplant · ${p.abrufwege.defekt} defekt · ${p.abrufwege.ausgeschlossen} ausgeschlossen`);
    const gruende = Object.entries(p.abrufwege.ausschlussgruende);
    if (gruende.length) L.push(`                 Ausschlussgründe: ${gruende.map(([g, n]) => `${g} (${n})`).join(" · ")}`);
    if (p.abrufwege.eingeplant) L.push(`                 Eingeplante Lage: ${p.abrufwege.wirksam} tragend · ${p.abrufwege.gestoert} gestört · ${p.abrufwege.unbekannt} ohne Laufdaten`);
    const e = p.ertrag;
    L.push(`  Ertrag       : Betriebszeitraum ${e.betriebszeitraum.tage} T — ${e.betriebszeitraum.gefunden} gefunden, ${e.betriebszeitraum.neu} neu, `
      + `${e.betriebszeitraum.wegeMitLieferung}/${p.abrufwege.gesamt} Wege mit Lieferung`);
    if (e.letzterLauf) L.push(`                 Letzter Volllauf ${e.letzterLauf.runId} — ${e.letzterLauf.wege} Wege, ${e.letzterLauf.gefunden} gefunden, ${e.letzterLauf.neu} neu`);
    else L.push("                 Letzter Volllauf: keiner im Betriebszeitraum");
    if (!e.messbar) L.push(`                 ⚠ ${e.grund}`);
    L.push(`  Letzte Lief. : ${p.letzteLieferung ? `${kurzZeit(p.letzteLieferung.at)} (Quelle ${p.letzteLieferung.quelle}, Grundlage: ${p.letzteLieferung.grundlage})` : "NIE — keine erfolgreiche Lieferung belegt"}`);

    const f = p.fehler;
    const fehlerZeilen = [];
    for (const b of f.akut) fehlerZeilen.push(`AKUT      ${b.quelle}: ${b.kurz} — ${b.erklaerung}`);
    for (const b of f.zeitnah) fehlerZeilen.push(`ZEITNAH   ${b.quelle}: ${b.kurz} — ${b.erklaerung}`);
    for (const s of f.strukturell) fehlerZeilen.push(`STRUKTUR  ${s.quelle}: ${s.art} — ${s.text}`);
    if (fehlerZeilen.length) {
      L.push("  Fehler       :");
      for (const zl of fehlerZeilen.slice(0, 12)) L.push(`      ${zl}`);
      if (fehlerZeilen.length > 12) L.push(`      … und ${fehlerZeilen.length - 12} weitere`);
    } else {
      L.push("  Fehler       : keine erkannten Fehler oder Einschränkungen");
    }

    const flagTexte = [];
    if (p.flags.ohneAbrufwege) flagTexte.push("OHNE ABRUFWEGE");
    if (p.flags.ohneEingeplanteWege) flagTexte.push("KEIN WEG EINGEPLANT");
    if (p.flags.ohneTelemetrie) flagTexte.push("OHNE VERWERTBARE TELEMETRIE");
    if (p.flags.ohneLieferungJemals) flagTexte.push("NIE GELIEFERT");
    else if (p.flags.ohneLieferungImFenster) flagTexte.push("KEINE LIEFERUNG IM BETRIEBSZEITRAUM");
    if (p.flags.ertragNullImFenster && !p.flags.ohneLieferungImFenster) flagTexte.push("ERTRAG 0 NEUE DOKUMENTE");
    if (p.flags.angefordertUnversorgt) flagTexte.push("ANGEFORDERT, ABER UNVERSORGT");
    if (flagTexte.length) L.push(`  Kennzeichen  : ${flagTexte.join(" · ")}`);

    if (zeigeWege || nurPaket) {
      L.push("  Wege:");
      L.push(`      ${pad("Planzustand", 16)}${pad("Quelle", 34)}${pad("Klasse", 17)}${padL("neu", 6)}  Letzte Lieferung`);
      for (const w of p.abrufwege.liste) {
        L.push(`      ${pad(w.planzustand, 16)}${pad(w.quelle, 34)}${pad(w.klasse, 17)}`
          + `${padL(w.ertragFenster ? w.ertragFenster.neu : "—", 6)}  ${kurzZeit(w.letzteLieferungAt)}`
          + `${w.planzustand !== "eingeplant" ? `   ← ${w.planGrund}` : ""}`);
      }
    }
  }

  L.push("─".repeat(96));
  if (inv.laufzeitquellen.length) {
    L.push(`── Laufzeitquellen ohne Paket (${inv.laufzeitquellen.length}) ──`);
    L.push("  Personenbezogene Suchen entstehen zur Laufzeit aus dem Profil (scheduler.personNewsSource)");
    L.push("  und stehen bewusst NIE im geteilten Katalog. Sie gehören zu keinem Paket, tragen aber Versorgung.");
    for (const q of inv.laufzeitquellen.slice(0, 30)) {
      L.push(`      ${pad(q.quelle, 40)}${pad(q.klasse, 17)}${padL(q.ertragFenster.neu, 6)} neu   letzte Lieferung ${kurzZeit(q.letzteLieferungAt)}`);
    }
    if (inv.laufzeitquellen.length > 30) L.push(`      … und ${inv.laufzeitquellen.length - 30} weitere`);
    L.push("");
  }
  if (inv.wegeOhnePaket.length) {
    L.push(`── Abrufwege ohne jedes Paket (${inv.wegeOhnePaket.length}) ──`);
    for (const w of inv.wegeOhnePaket.slice(0, 30)) {
      L.push(`      ${pad(w.quelle, 40)}${pad(w.planzustand, 16)}${pad(w.klasse, 17)} ${w.planzustand !== "eingeplant" ? `← ${w.planGrund}` : ""}`);
    }
    if (inv.wegeOhnePaket.length > 30) L.push(`      … und ${inv.wegeOhnePaket.length - 30} weitere`);
    L.push("");
  }

  L.push("Hinweis: Diese Ausgabe ist rein lesend erzeugt. Es wurde nichts aktiviert, deaktiviert,");
  L.push("migriert oder geschrieben. Reproduzieren: `node scripts/paket-inventur.js --json`.");
  console.log(L.join("\n"));
}

(async function main() {
  let bestand;
  try {
    bestand = await leseBestand();
  } catch (error) {
    console.error(`ABBRUCH beim Lesen: ${error && error.message}`);
    console.error("Es wird kein Zustand behauptet — die Inventur ist ohne vollständige Datengrundlage wertlos.");
    process.exit(3);
  }

  // Erster Durchgang ohne Lieferhistorie: liefert genau die Quellen, für die das
  // Fenster keine Lieferung kennt — nur für die wird nachgefragt.
  let inventur = buildPaketInventur({ ...bestand, now, fensterTage, env: process.env });
  let lieferInfo = null;

  if (!ohneLieferhistorie) {
    const ohneLieferung = new Set();
    for (const p of inventur.pakete) {
      for (const w of p.abrufwege.liste) if (!w.letzteLieferungAt) ohneLieferung.add(w.quelle);
    }
    for (const w of inventur.wegeOhnePaket) if (!w.letzteLieferungAt) ohneLieferung.add(w.quelle);
    if (ohneLieferung.size) {
      try {
        lieferInfo = await leseLieferhistorie([...ohneLieferung].sort());
        inventur = buildPaketInventur({
          ...bestand, now, fensterTage, env: process.env,
          lieferhistorie: lieferInfo.eintraege.filter((e) => e.at)
        });
        inventur.datengrundlage.lieferhistorieUnbeschraenkt = {
          verfuegbar: true,
          quellen: lieferInfo.angefragt,
          gedeckelt: lieferInfo.gedeckelt,
          offen: lieferInfo.offen,
          hinweis: lieferInfo.gedeckelt
            ? `Deckel erreicht: ${lieferInfo.offen} Quellen ohne Fenster-Lieferung wurden NICHT nachgefragt (--lieferhistorie-max erhöhen).`
            : null
        };
      } catch (error) {
        console.error(`Hinweis: Lieferhistorie konnte nicht ergänzt werden (${error && error.message}) — es gilt nur der Betriebszeitraum.`);
      }
    }
  }

  if (alsJson) {
    console.log(JSON.stringify(inventur, null, 2));
    return;
  }
  druckeBericht(inventur);

  // Der Bericht ist eine Messung, kein Gate — Exit 0, sobald er erhoben werden konnte.
  // Ein von-Hand-Blick auf „ausgefallen" bleibt eine Betreiberentscheidung.
  const ausgefallen = inventur.summe.zustand[PAKET_ZUSTAENDE.AUSGEFALLEN] || 0;
  if (ausgefallen > 0) console.error(`\n⚠ ${ausgefallen} Paket(e) im Zustand AUSGEFALLEN — siehe Begründung oben.`);
})();
