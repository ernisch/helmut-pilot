"use strict";

// Punkt 25B — rein lesender Production-Nachweis nach dem Deployment von PR #190.
// =============================================================================
// WOZU: 25B verlangt einen vollstaendig abgeschlossenen REGULAEREN Lauf des
// Pilotmandanten NACH dem Deployment, mit veraendertem Eingabefingerabdruck —
// also einer echten neuen Generation statt `wiederholungen+1`. Genau das war bis
// zur Rezeptanhebung (Befund B25-2, docs/matching-nachvollziehbarkeit.md §53)
// nicht absehbar: der 27A-2-Fix veraenderte nur `matched_features`, die bewusst
// nicht in `computeInputFingerprint` eingehen.
//
// Dieses Werkzeug ist WIEDERHOLBAR: es meldet ehrlich „noch kein geeigneter
// Lauf" und kann nach jedem regulaeren Cron-Termin erneut laufen. Es beweist
// nichts, was es nicht gemessen hat.
//
// ── SCHREIBSCHUTZ (technisch, nicht nur zugesagt) ────────────────────────────
// Uebernommen aus scripts/befund-27a2-production-messung.js:
// 1. GENAU EINE HTTP-Funktion (`holen`). Ihre Methode ist die Konstante
//    `HTTP_METHODE` — ein GET-Literal ohne Parameter. Eine Schreiboperation ist
//    strukturell nicht erreichbar, nicht bloss nicht aufgerufen.
// 2. Jeder Pfad laeuft durch `pfadErlaubt()`: nur `/rest/v1/<tabelle>` aus einer
//    festen Allowlist. `/rest/v1/rpc/...` ist gesperrt (eine Datenbankfunktion
//    koennte schreiben, auch per GET). Fail-closed.
// 3. `lib/helmut/storage.js` wird NICHT geladen — kein Schreibpfad im Prozess.
// 4. Es werden ausschliesslich reine Funktionen gerechnet (matching,
//    matching-erklaerung). Kein Matching-, Understanding- oder Crawl-Lauf,
//    0 KI-Aufrufe, 0,00 USD, kein Trigger, kein Flag.
//
// ── DATENSCHUTZ ──────────────────────────────────────────────────────────────
// Mandanten erscheinen ausschliesslich pseudonymisiert (`BT-01`, `BT-02`, …) —
// es gibt keinen Schalter fuer Klarnamen. Ausgegeben werden nur oeffentliche
// Gremiennamen, Ebene, technische Kennungen und Zahlen. Keine Ueberschriften,
// keine Rohtexte, keine Secrets.

const https = require("https");
const matching = require("../lib/helmut/matching");
const erklaerung = require("../lib/helmut/matching-erklaerung");

// Deployment von PR #190 (Merge bd7c889), rein lesend an der Vercel-API belegt:
// dpl_BK8WrEEPw3HxmXJfu2pT2eNSNGLv, Ziel production, READY 2026-07-31T10:43:27.636Z.
// Ueberschreibbar fuer spaetere Nachlaeufe: HELMUT_25B_DEPLOYMENT_AT.
const DEPLOYMENT_AT = process.env.HELMUT_25B_DEPLOYMENT_AT || "2026-07-31T10:43:27.636Z";
const DEPLOYMENT_MS = Date.parse(DEPLOYMENT_AT);
// Ein REGULAERER Lauf ist Cron-ausgeloest. `manuell`/`test` zaehlen nicht.
const REGULAERE_AUSLOESER = Object.freeze(["crawl", "pipeline", "lage-check"]);
const ERWARTETE_REZEPTVERSION = "legacy_relevance_v2";

const HTTP_METHODE = "GET";                       // Literal, nicht konfigurierbar
const ERLAUBTE_TABELLEN = Object.freeze([
  "mandate_profiles", "knowledge_objects", "matching_results", "matching_runs", "decisions"
]);

function pfadErlaubt(pfad) {
  if (typeof pfad !== "string" || !pfad.startsWith("/rest/v1/")) return false;
  if (pfad.includes("..") || pfad.includes("//", 1)) return false;
  return ERLAUBTE_TABELLEN.includes(pfad.slice("/rest/v1/".length).split("?")[0]);
}

function holen(pfad) {
  if (!pfadErlaubt(pfad)) {
    return Promise.reject(new Error(`[SCHREIBSCHUTZ] Pfad nicht erlaubt: ${pfad}`));
  }
  const basis = process.env.SUPABASE_URL;
  const schluessel = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!basis || !schluessel) {
    return Promise.reject(new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (nur aus process.env, CLAUDE.md §4.9)"));
  }
  return new Promise((erfuellen, ablehnen) => {
    const anfrage = https.request(new URL(basis + pfad), {
      method: HTTP_METHODE,
      headers: { apikey: schluessel, Authorization: `Bearer ${schluessel}`, Accept: "application/json" }
    }, (antwort) => {
      let text = "";
      antwort.on("data", (teil) => { text += teil; });
      antwort.on("end", () => {
        if (antwort.statusCode >= 400) return ablehnen(new Error(`HTTP ${antwort.statusCode}: ${text.slice(0, 200)}`));
        try { erfuellen(JSON.parse(text)); } catch (fehler) { ablehnen(fehler); }
      });
    });
    anfrage.on("error", ablehnen);
    anfrage.end();
  });
}

async function holenAlle(pfadOhneOffset) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const seite = await holen(`${pfadOhneOffset}&limit=1000&offset=${offset}`);
    if (!Array.isArray(seite)) break;
    out.push(...seite);
    if (seite.length < 1000) break;
  }
  return out;
}

// `mandate_profiles`-Zeile -> Profilform (nur die Felder, die die
// Zustaendigkeits- und Merkmalsfunktionen lesen).
function zuProfil(z = {}) {
  return {
    id: z.user_id,
    parliamentType: z.politische_ebene === "landtag" ? "Landtag"
      : (z.politische_ebene === "bundestag" ? "Bundestag" : undefined),
    politicalLevel: z.politische_ebene === "bundestag" ? "Bund" : undefined,
    state: z.bundesland, bundesland: z.bundesland,
    party: z.partei, faction: z.fraktion,
    committees: z.ausschuesse || [],
    constituency: z.wahlkreis,
    focusTopics: [...(z.fachpolitische_schwerpunkte || []), ...(z.berichterstatter_themen || [])],
    regionalInterests: z.regionale_interessen || []
  };
}

const zeit = (s) => (s ? new Date(s).toISOString().replace("T", " ").slice(0, 19) + "Z" : "—");
const ok = (b) => (b ? "✅" : "❌");

(async () => {
  console.log("Punkt 25B — rein lesender Production-Nachweis");
  console.log("=".repeat(78));
  console.log(`Deployment (PR #190, bd7c889) READY: ${DEPLOYMENT_AT}`);
  console.log(`Erwartete Rezeptversion nach dem Deployment: ${ERWARTETE_REZEPTVERSION}`);
  console.log(`Als regulaer gewertete Ausloeser: ${REGULAERE_AUSLOESER.join(", ")}`);
  console.log(`Messzeitpunkt: ${new Date().toISOString()}\n`);

  // ── Eingaben ───────────────────────────────────────────────────────────────
  const profilZeilen = await holenAlle("/rest/v1/mandate_profiles?select=user_id,partei,fraktion,politische_ebene,bundesland,wahlkreis,aktiv,geloescht_at,ausschuesse,fachpolitische_schwerpunkte,berichterstatter_themen,regionale_interessen&order=user_id.asc");
  const aktiveBund = profilZeilen.filter((p) => p.aktiv && !p.geloescht_at && p.politische_ebene === "bundestag");
  const deckname = new Map();
  aktiveBund.forEach((p, i) => deckname.set(p.user_id, `BT-${String(i + 1).padStart(2, "0")}`));
  const tarnen = (uid) => deckname.get(uid) || "(nicht-aktiv/kein-Bund)";

  const laeufe = await holenAlle("/rest/v1/matching_runs?select=*&order=gestartet_am.asc");
  const zeilen = await holenAlle("/rest/v1/matching_results?select=*&order=user_id.asc");
  const aktuelle = zeilen.filter((r) => r.aktuell !== false);
  const kos = await holenAlle("/rest/v1/knowledge_objects?select=*&order=id.asc");
  const koById = new Map(kos.map((k) => [k.id, k]));
  const entscheidungen = await holenAlle("/rest/v1/decisions?select=id,user_id,knowledge_object_id,score,decision&order=user_id.asc");

  console.log("== EINGABEN (rein lesend) ==");
  console.log(`mandate_profiles ${profilZeilen.length} (aktive Bundestagsprofile ${aktiveBund.length}) · matching_runs ${laeufe.length} · matching_results ${zeilen.length} (aktuell ${aktuelle.length}) · knowledge_objects ${kos.length} · decisions ${entscheidungen.length}\n`);

  // ── Laeufe nach dem Deployment ─────────────────────────────────────────────
  const nachDeployment = laeufe.filter((l) => Date.parse(l.gestartet_am) > DEPLOYMENT_MS);
  const geeignet = nachDeployment.filter((l) =>
    l.status === "vollstaendig"
    && REGULAERE_AUSLOESER.includes(String(l.ausloeser))
    && deckname.has(l.user_id));

  console.log("== LAEUFE NACH DEM DEPLOYMENT ==");
  if (!nachDeployment.length) {
    console.log("(keine)");
  } else {
    for (const l of nachDeployment) {
      const neueGeneration = l.wiederholungen === 0 || l.wiederholungen === null;
      console.log(`  ${tarnen(l.user_id)} · ${zeit(l.gestartet_am)} · ausloeser=${l.ausloeser} · status=${l.status} · rezept=${l.rezept_version} · wiederholungen=${l.wiederholungen} · veroeffentlicht=${l.veroeffentlicht} · ${neueGeneration ? "NEUE GENERATION" : "idempotenter Treffer"}`);
    }
  }
  console.log(`\ngeeignete Laeufe (regulaer + vollstaendig + aktives Bundestagsmandat): ${geeignet.length}\n`);

  // ── Bestandsaufnahme je Mandant ────────────────────────────────────────────
  // Ein falscher Ausschussbeleg = die Zeile traegt ein Merkmal vom Typ
  // `ausschuss`, obwohl die ECHTE Produktionsregel ihn nicht zulaesst.
  console.log("== STAND JE MANDANT (pseudonymisiert) ==");
  const bericht = [];
  for (const p of aktiveBund) {
    const profil = zuProfil(p);
    const pz = matching.profileZustaendigkeit(profil);
    const meine = aktuelle.filter((r) => r.user_id === p.user_id);
    const meineLaeufe = laeufe.filter((l) => l.user_id === p.user_id);
    const letzter = meineLaeufe.length ? meineLaeufe[meineLaeufe.length - 1] : null;

    const falsche = [];
    for (const r of meine) {
      const hatAusschuss = (r.matched_features || []).some((f) => f && f.type === "ausschuss");
      if (!hatAusschuss) continue;
      const ko = koById.get(r.knowledge_object_id);
      const kz = matching.knowledgeObjectZustaendigkeit(ko || {});
      if (!matching.ausschussBelegZulaessig(pz, kz)) {
        falsche.push({
          rank: r.rank, ebene: (ko && ko.decision_level) || "(unbekannt)",
          belege: (r.matched_features || []).filter((f) => f.type === "ausschuss").map((f) => f.value),
          berechnet_am: r.berechnet_am, rezept: r.rezept_version
        });
      }
    }
    const versionen = [...new Set(meine.map((r) => r.rezept_version || "(leer)"))];
    const fingerabdruecke = [...new Set(meine.map((r) => (r.eingabe_fingerabdruck || "").slice(0, 12)))];
    bericht.push({ uid: p.user_id, name: tarnen(p.user_id), meine, letzter, falsche, versionen });
    console.log(`  ${tarnen(p.user_id)} · aktuelle Zeilen ${meine.length} · rezept_version ${versionen.join("/")} · fingerabdruck ${fingerabdruecke.join("/")}`);
    console.log(`      letzter Lauf: ${letzter ? `${zeit(letzter.gestartet_am)} (${letzter.ausloeser}, ${letzter.status}, wdh=${letzter.wiederholungen})` : "—"}`);
    if (falsche.length) {
      for (const f of falsche) {
        console.log(`      ❌ falscher Ausschussbeleg auf Rang ${f.rank} (Vorgangsebene ${f.ebene}): ${f.belege.join(", ")} — gerechnet ${zeit(f.berechnet_am)} unter ${f.rezept}`);
      }
    } else {
      console.log("      ✅ keine falschen Ausschussbelege");
    }
  }

  const falscheGesamt = bericht.reduce((n, b) => n + b.falsche.length, 0);
  const nochV1 = bericht.filter((b) => b.versionen.some((v) => v !== ERWARTETE_REZEPTVERSION));
  console.log(`\nfalsche Ausschussbelege gesamt: ${falscheGesamt} · Mandanten noch nicht neu gerechnet: ${nochV1.length} von ${aktiveBund.length}\n`);

  // ── Abnahme je geeignetem Lauf ─────────────────────────────────────────────
  if (!geeignet.length) {
    console.log("== ABNAHME ==");
    console.log("NOCH NICHT ERBRACHT — es liegt kein regulaerer, vollstaendig abgeschlossener");
    console.log("Lauf eines aktiven Bundestagsmandats nach dem Deployment vor.");
    console.log("Naechste regulaere Termine (aktive vercel.json): pipeline 16:00 UTC · crawl 20:00/04:00 UTC.");
    console.log("Kein manueller Lauf, kein Trigger, kein Schreibzugriff — es wird gewartet.");
    process.exit(0);
  }

  console.log("== ABNAHME JE GEEIGNETEM LAUF ==");
  let allesGruen = true;
  for (const lauf of geeignet) {
    const name = tarnen(lauf.user_id);
    const p = aktiveBund.find((x) => x.user_id === lauf.user_id);
    const profil = zuProfil(p);
    const pz = matching.profileZustaendigkeit(profil);
    const laufZeilen = zeilen.filter((r) => r.run_id === lauf.id);
    const meineAktuell = aktuelle.filter((r) => r.user_id === lauf.user_id);
    const vorherLaeufe = laeufe.filter((l) => l.user_id === lauf.user_id
      && Date.parse(l.gestartet_am) < Date.parse(lauf.gestartet_am));
    const vorher = vorherLaeufe.length ? vorherLaeufe[vorherLaeufe.length - 1] : null;

    const pruefungen = [];
    const pruefe = (name2, bedingung, detail = "") => {
      pruefungen.push({ name: name2, ok: Boolean(bedingung), detail });
      if (!bedingung) allesGruen = false;
    };

    pruefe("Lauf ist regulaer (Cron-Ausloeser, nicht manuell/test)", REGULAERE_AUSLOESER.includes(String(lauf.ausloeser)), `ausloeser=${lauf.ausloeser}`);
    pruefe("Lauf vollstaendig abgeschlossen", lauf.status === "vollstaendig" && Boolean(lauf.beendet_am), `status=${lauf.status}`);
    pruefe("Lauf gehoert einem aktiven Bundestagsmandat", deckname.has(lauf.user_id), name);
    pruefe("ECHTE neue Generation (nicht nur wiederholungen+1)", (lauf.wiederholungen || 0) === 0 && (lauf.veroeffentlicht || 0) > 0,
      `wiederholungen=${lauf.wiederholungen}, veroeffentlicht=${lauf.veroeffentlicht}`);
    pruefe("Zeitliche Reihenfolge: Deployment < Laufstart < Laufende", DEPLOYMENT_MS < Date.parse(lauf.gestartet_am)
      && Date.parse(lauf.gestartet_am) <= Date.parse(lauf.beendet_am), `${zeit(lauf.gestartet_am)} → ${zeit(lauf.beendet_am)}`);
    pruefe("Rezeptversion des Laufs ist die angehobene", lauf.rezept_version === ERWARTETE_REZEPTVERSION, `${lauf.rezept_version}`);
    pruefe("Eingabefingerabdruck unterscheidet sich vom vorherigen Lauf", Boolean(vorher) && vorher.eingabe_fingerabdruck !== lauf.eingabe_fingerabdruck,
      vorher ? `${(vorher.eingabe_fingerabdruck || "").slice(0, 12)} → ${(lauf.eingabe_fingerabdruck || "").slice(0, 12)}` : "(kein Vorlauf)");
    pruefe("Engine- und Vektorversion unveraendert", lauf.engine_version === "legacy-shadow-1" && lauf.vektor_version === "feature-hash-256-v1",
      `${lauf.engine_version} / ${lauf.vektor_version}`);
    pruefe("Ergebniszeilen tragen die Laufkennung", laufZeilen.length > 0 && laufZeilen.every((r) => r.run_id === lauf.id), `${laufZeilen.length} Zeilen`);
    pruefe("Alle Zeilen tragen die neue Rezeptversion", laufZeilen.every((r) => r.rezept_version === ERWARTETE_REZEPTVERSION));
    pruefe("Alle Zeilen tragen den Lauffingerabdruck", laufZeilen.every((r) => r.eingabe_fingerabdruck === lauf.eingabe_fingerabdruck));
    pruefe("Korrekte Mandantenzuordnung (keine fremde Zeile)", laufZeilen.every((r) => r.user_id === lauf.user_id));
    pruefe("Raenge lueckenlos ab 1", (() => {
      const r = laufZeilen.map((x) => x.rank).sort((a, b) => a - b);
      return r.length > 0 && r.every((v, i) => v === i + 1);
    })(), `n=${laufZeilen.length}`);
    pruefe("Je Vorgang genau eine aktuelle Zeile", (() => {
      const vg = meineAktuell.map((r) => r.vorgang_id);
      return new Set(vg).size === vg.length;
    })());
    pruefe("berechnet_am jeder Zeile liegt im Laufzeitraum", laufZeilen.every((r) =>
      Date.parse(r.berechnet_am) >= Date.parse(lauf.gestartet_am) - 2000
      && Date.parse(r.berechnet_am) <= Date.parse(lauf.beendet_am) + 2000));

    // Fachliche Kernpruefung: kein falscher Ausschussbeleg, je Zeile mit der
    // ECHTEN Produktionsfunktion nachgerechnet.
    const falscheImLauf = laufZeilen.filter((r) => {
      if (!(r.matched_features || []).some((f) => f && f.type === "ausschuss")) return false;
      const ko = koById.get(r.knowledge_object_id);
      return !matching.ausschussBelegZulaessig(pz, matching.knowledgeObjectZustaendigkeit(ko || {}));
    });
    pruefe("KEIN falscher Ausschussbeleg (je Zeile mit ausschussBelegZulaessig nachgerechnet)",
      falscheImLauf.length === 0, `${falscheImLauf.length} von ${laufZeilen.length}`);
    const ohneEbene = laufZeilen.filter((r) => {
      const ko = koById.get(r.knowledge_object_id);
      const lvl = ko && ko.decision_level;
      const hat = (r.matched_features || []).some((f) => f && f.type === "ausschuss");
      return hat && (!lvl || lvl === "unknown");
    });
    pruefe("Kein Ausschussbeleg bei fehlender/unbekannter Vorgangsebene (fail-closed)", ohneEbene.length === 0, `${ohneEbene.length}`);

    // Sichtbare Erklaerung == persistierte Felder (deterministisch nachgerechnet).
    // `belege` sind Objekte { art, text } — jeder sichtbare Beleg muss ein
    // persistiertes Merkmal DERSELBEN Art haben und dessen Wert im Text tragen.
    // Damit kann die Oberflaeche keinen Bezug zeigen, der nicht in den Daten steht.
    const erklaerungOk = laufZeilen.every((r) => {
      const e = erklaerung.erklaerungAusErgebnis(r);
      if (!e) return true;
      const merkmale = r.matched_features || [];
      return (e.belege || []).every((b) => {
        const text = String((b && b.text) || "");
        return merkmale.some((f) => f && f.type === (b && b.art) && text.includes(String(f.value)));
      });
    });
    pruefe("Sichtbare Erklaerung deckt sich mit den persistierten Merkmalen (Art und Wert je Beleg)", erklaerungOk);
    // Gegenrichtung: eine Erklaerung ohne jeden Beleg darf es nicht geben
    // (Belegpflicht — dann liefert erklaerungAusErgebnis `null`).
    pruefe("Belegpflicht: keine Erklaerung ohne Beleg", laufZeilen.every((r) => {
      const e = erklaerung.erklaerungAusErgebnis(r);
      return e === null || (Array.isArray(e.belege) && e.belege.length > 0);
    }));
    pruefe("Jede Zeile traegt eine persistierte Begruendung oder ehrlich keine",
      laufZeilen.every((r) => r.begruendung === null || typeof r.begruendung === "string"));
    pruefe("Signale sind persistiert", laufZeilen.every((r) => r.signale && typeof r.signale === "object"));
    const meineEntsch = entscheidungen.filter((d) => d.user_id === lauf.user_id);
    pruefe("Entscheidungen des Mandanten vorhanden und mandantenrein", meineEntsch.length > 0
      && meineEntsch.every((d) => d.user_id === lauf.user_id), `${meineEntsch.length}`);
    pruefe("Lauf ohne Fehlereintrag", !lauf.fehler, String(lauf.fehler || ""));

    console.log(`\n— ${name} · Lauf ${zeit(lauf.gestartet_am)} (${lauf.ausloeser}) —`);
    for (const pr of pruefungen) console.log(`  ${ok(pr.ok)} ${pr.name}${pr.detail ? "  [" + pr.detail + "]" : ""}`);
  }

  console.log("\n== ERGEBNIS ==");
  console.log(`geeignete Laeufe geprueft: ${geeignet.length} · alle Pruefungen bestanden: ${allesGruen ? "JA" : "NEIN"}`);
  console.log(`falsche Ausschussbelege im GESAMTBESTAND: ${falscheGesamt}`);
  console.log(`Mandanten noch auf alter Rezeptversion: ${nochV1.length} von ${aktiveBund.length}`);
  console.log("\nAusschliesslich lesende Zugriffe (GET), 0 KI-Aufrufe, 0,00 USD, kein manueller Lauf.");
  process.exit(allesGruen ? 0 : 1);
})().catch((fehler) => {
  console.error("MESSFEHLER:", (fehler && fehler.message) || fehler);
  process.exit(2);
});
