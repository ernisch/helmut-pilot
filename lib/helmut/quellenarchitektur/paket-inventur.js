"use strict";

// Helmut — Phase 1, Punkt 18: Production-Inventur aller Quellenpakete.
// ============================================================================
// FRAGE, DIE DIESE DATEI BEANTWORTET:
//   „Funktioniert die politische Versorgung eines Mandats — oder fällt sie
//    unbemerkt aus?"  Und zwar je Quellenpaket, aus dem ECHTEN Betrieb.
//
// WARUM ES SIE BRAUCHT (Befund dieses Sprints):
//   Die bisherige Inventur (`docs/quellenarchitektur/30-paket-inventur-production.md`,
//   2026-07-25) war eine von Hand erhobene Momentaufnahme. Sie ist inhaltlich
//   belegt, aber NICHT wiederholbar: sie veraltet still, und genau das ist der
//   Fehlermodus, den sie eigentlich aufdecken soll. Punkt 18 verlangt
//   ausdrücklich mehr als eine gepflegte Markdown-Tabelle.
//
//   Gleichzeitig gab es die Bausteine schon — nur nie zusammengeführt:
//     * `source-mode.buildRelationalCrawlPlan`  → was ist WIRKLICH eingeplant
//       und ausführbar (Landesmodul-Gate, manual-Sperre, defekte Wege, Dedup)?
//     * `profile-packages.computeGlobalActivation` → welches Paket ist über die
//       Referenzzählung technisch aktiviert, von wie vielen Mandaten?
//     * `source-failure.bewerteQuellenstoerungen` (Punkt 16) → wie verhält sich
//       jeder Abrufweg TATSÄCHLICH (14 Zustandsklassen, 4 Handlungsstufen)?
//     * `source_crawl_telemetry` → Ertrag, letzte Lieferung, Fehlerbilder.
//   Diese Datei fügt KEINE zweite Wahrheit hinzu. Sie verbindet die vier
//   vorhandenen zu einer Paketzeile und leitet daraus GENAU EINEN Zustand ab.
//
// DIE ZWEI ACHSEN, DIE MAN NICHT VERWECHSELN DARF:
//   PLANZUSTAND  (strukturell) — läuft dieser Weg im aktuellen Betrieb überhaupt?
//                 eingeplant | defekt | ausgeschlossen (mit Grund)
//   LAUFZUSTAND  (beobachtet) — was tut er, wenn er läuft?  Punkt-16-Klasse.
//   Ein `broken`-Weg wird nie abgerufen, erzeugt also NIE Telemetrie und ist für
//   Punkt 16 folgerichtig „unbekannt". Ohne die Planachse sähe genau das aus wie
//   „keine Daten" statt wie „bewusst abgeschaltet, liefert nichts".
//
// EHRLICHKEIT (CLAUDE.md §4.3/§4.4 — verbindlich):
//   - Unbekannt wird NIE zu gesund. `gesund` verlangt positive Belege.
//   - Ein Paket ohne Abrufwege, ohne Lieferung oder ohne verwertbare Telemetrie
//     trägt dafür ein eigenes, sichtbares Kennzeichen (`flags`) — es verschwindet
//     nicht in einer Sammelzahl.
//   - Fehlt die Datengrundlage, sagt die Inventur das (`datengrundlage`), statt
//     einen Zustand zu behaupten.
//
// REINE, DETERMINISTISCHE LOGIK. Kein Netz, kein Storage, keine KI, keine Uhr
// ohne Eingabe. Alles wird injiziert; jede Ausgabe ist aus den Eingaben erklärbar.
// Es wird nichts geschrieben — die Inventur ist per Konstruktion read-only.

const sf = require("./source-failure");
const { buildRelationalCrawlPlan } = require("./source-mode");
const { computeGlobalActivation, resolveProfilePackages, isActivationEligible } = require("./profile-packages");

const TAG_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// 1 · Der eine Paketzustand (Punkt 18, Abnahmekriterium 9)
// ---------------------------------------------------------------------------
// Genau fünf Werte, bewusst nicht mehr. Reihenfolge = Schwere (für Sortierung
// und Ampeln); `unbekannt` steht ausdrücklich NICHT unten bei „gesund".
const PAKET_ZUSTAENDE = Object.freeze({
  AUSGEFALLEN: "ausgefallen",       // sollte liefern, liefert nachweislich nicht
  EINGESCHRAENKT: "eingeschraenkt", // liefert, aber nicht vollständig/nicht störungsfrei
  UNBEKANNT: "unbekannt",           // eingeplant, aber ohne belastbare Datengrundlage
  INAKTIV: "inaktiv",               // bewusst nicht im Betrieb (kein Fehler)
  GESUND: "gesund"                  // vollständig eingeplant, störungsfrei, mit Ertrag
});

const ZUSTAND_RANG = Object.freeze({
  ausgefallen: 0, eingeschraenkt: 1, unbekannt: 2, inaktiv: 3, gesund: 4
});

// Planzustand eines Abrufwegs — die strukturelle Achse.
const PLANZUSTAENDE = Object.freeze({
  EINGEPLANT: "eingeplant",           // steht im aktiven Crawl-Plan und ist ausführbar
  DEFEKT: "defekt",                   // im Plan sichtbar, aber als nicht ausführbar geführt
  AUSGESCHLOSSEN: "ausgeschlossen",   // bewusst nicht im Plan (Grund wird mitgeführt)
  NICHT_IM_PLAN: "nicht_im_plan"      // vom Plan gar nicht bewertet (sollte nie vorkommen)
});

// Ausschlussgründe des Plans, die ein BEWUSSTER Betriebszustand sind (keine
// Störung). Alles andere wird als Einschränkung gewertet. Die Erkennung läuft
// über Präfixe, weil `buildRelationalCrawlPlan` sprechende Gründe mit Detail
// anhängt (z. B. "landesmodul-gesperrt (berlin: nicht freigegeben)").
const BEWUSSTE_AUSSCHLUSSGRUENDE = Object.freeze([
  "landesmodul-gesperrt",
  "manuell-gesperrt",
  "testquelle-dev-only",
  "nicht-reaktiviert",
  "eigenstaendiger-api-pfad",
  "doppelter-abrufweg",
  "kein-aktives-paket"
]);

function istBewussterAusschluss(grund) {
  const g = String(grund || "");
  return BEWUSSTE_AUSSCHLUSSGRUENDE.some((p) => g.startsWith(p));
}

// Kurzform des Ausschlussgrunds (ohne Klammer-Detail) — für Zählungen.
function grundKopf(grund) {
  const g = String(grund || "").trim();
  const i = g.indexOf(" (");
  return i > 0 ? g.slice(0, i) : (g || "unbekannt");
}

function ms(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}
function zahl(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function iso(msWert) { return msWert == null ? null : new Date(msWert).toISOString(); }

// ---------------------------------------------------------------------------
// 2 · Ertrag aus der echten Telemetrie
// ---------------------------------------------------------------------------
// Punkt 16 verdichtet die Historie bereits, kennt aber `new_documents` nicht
// (für die Störungserkennung irrelevant). Für die Inventur ist genau das die
// entscheidende Ertragszahl: „gefunden" kann jeder Feed, „neu" ist der Beitrag
// zum Rohkorpus. Deshalb hier eine EIGENE, schlanke Aggregation — dieselbe
// Fensterlogik und dieselbe Laufart-Klassifikation wie Punkt 16
// (`sf.laufart`), damit beide Zahlen zueinander passen.
function aggregiereErtrag(telemetrie = [], { now = Date.now(), fensterTage = 14 } = {}) {
  const seit = now - fensterTage * TAG_MS;
  const jeQuelle = new Map();
  const laeufe = new Map();

  for (const zeile of Array.isArray(telemetrie) ? telemetrie : []) {
    if (!zeile) continue;
    const sid = zeile.source_id || zeile.sourceId;
    if (!sid) continue;
    const at = ms(zeile.created_at || zeile.createdAt || zeile.finished_at || zeile.finishedAt);
    if (at == null || at < seit || at > now) continue;

    const art = sf.laufart(zeile);
    const runId = zeile.run_id || zeile.runId || null;
    const gefunden = zahl(zeile.found_documents != null ? zeile.found_documents : zeile.foundDocuments);
    const neu = zahl(zeile.new_documents != null ? zeile.new_documents : zeile.newDocuments);

    if (!jeQuelle.has(sid)) {
      jeQuelle.set(sid, {
        sourceId: sid, zeilen: 0, versuche: 0, lieferungen: 0, leerlaeufe: 0, fehler: 0,
        gedrosselt: 0, uebersprungen: 0, gefunden: 0, neu: 0,
        letzteLieferungAt: null, letzterErfolgAt: null, letzterLaufAt: null, laeufe: new Set()
      });
    }
    const q = jeQuelle.get(sid);
    q.zeilen++;
    if (runId) q.laeufe.add(runId);
    if (art === "lieferung" || art === "leer" || art === "fehler" || art === "unklar") q.versuche++;
    if (art === "lieferung") { q.lieferungen++; q.gefunden += gefunden; q.neu += neu; }
    if (art === "leer") q.leerlaeufe++;
    if (art === "fehler") q.fehler++;
    if (art === "gedrosselt") q.gedrosselt++;
    if (art === "uebersprungen") q.uebersprungen++;
    if (art === "lieferung" && (q.letzteLieferungAt == null || at > q.letzteLieferungAt)) q.letzteLieferungAt = at;
    if ((art === "lieferung" || art === "leer") && (q.letzterErfolgAt == null || at > q.letzterErfolgAt)) q.letzterErfolgAt = at;
    if (q.letzterLaufAt == null || at > q.letzterLaufAt) q.letzterLaufAt = at;

    if (runId) {
      if (!laeufe.has(runId)) {
        laeufe.set(runId, {
          runId, beginntAt: at, endetAt: at, zeilen: 0,
          quellenMitVersuch: new Set(), quellen: new Set(),
          gefunden: 0, neu: 0, ok: 0, leer: 0, fehler: 0, gedrosselt: 0, uebersprungen: 0,
          jeQuelle: new Map()
        });
      }
      const l = laeufe.get(runId);
      l.zeilen++;
      l.quellen.add(sid);
      if (at < l.beginntAt) l.beginntAt = at;
      if (at > l.endetAt) l.endetAt = at;
      if (art === "lieferung" || art === "leer" || art === "fehler" || art === "unklar") l.quellenMitVersuch.add(sid);
      if (art === "lieferung") { l.ok++; l.gefunden += gefunden; l.neu += neu; }
      if (art === "leer") l.leer++;
      if (art === "fehler") l.fehler++;
      if (art === "gedrosselt") l.gedrosselt++;
      if (art === "uebersprungen") l.uebersprungen++;
      if (!l.jeQuelle.has(sid)) l.jeQuelle.set(sid, { gefunden: 0, neu: 0, art: null });
      const lq = l.jeQuelle.get(sid);
      lq.gefunden += gefunden;
      lq.neu += neu;
      lq.art = art;
    }
  }

  for (const q of jeQuelle.values()) q.laeufe = q.laeufe.size;
  return { jeQuelle, laeufe };
}

// Welcher Lauf ist „der letzte Lauf"?
// -------------------------------------------------------------------------
// Befund A-7 der Alt-Inventur: jeder Cron-Lauf erscheint doppelt — ein
// vollständiger Lauf und ~3 Minuten später ein Wiederholungslauf, der fast nur
// `circuit-open` schreibt. Wer „den letzten Lauf" naiv als „den zeitlich
// letzten" definiert, misst systematisch den Wiederholungslauf und unterschätzt
// den Ertrag massiv.
//
// Deshalb: ein Lauf zählt als VOLLLAUF, wenn er mindestens `anteil` der aktuell
// eingeplanten Wege tatsächlich VERSUCHT hat (nicht nur Zeilen geschrieben),
// mindestens aber `minWege`. Die Schwelle ist datenabgeleitet, keine Magic
// Number, und wird im Ergebnis mitgeführt — sie ist nachrechenbar.
function waehleLetztenVolllauf(laeufe, { eingeplanteWege = 0, anteil = 0.5, minWege = 10 } = {}) {
  const schwelle = Math.max(minWege, Math.ceil(eingeplanteWege * anteil));
  const alle = [...laeufe.values()].sort((a, b) => b.endetAt - a.endetAt);
  const voll = alle.filter((l) => l.quellenMitVersuch.size >= schwelle);
  // Beobachteter Abstand zwischen Vollläufen (Median) — Grundlage für die
  // rhythmus-bewusste Aussage „der Crawl steht", siehe crawlRhythmus().
  let medianAbstandStunden = null;
  if (voll.length >= 3) {
    const abstaende = [];
    for (let i = 1; i < voll.length; i++) abstaende.push((voll[i - 1].endetAt - voll[i].endetAt) / 3600e3);
    const s = abstaende.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
    if (s.length) {
      const m = Math.floor(s.length / 2);
      medianAbstandStunden = s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
  }
  return {
    schwelle,
    anteil,
    minWege,
    laeufeImFenster: alle.length,
    volllaeufeImFenster: voll.length,
    medianAbstandStunden,
    letzterVolllauf: voll.length ? voll[0] : null,
    letzterLaufBeliebig: alle.length ? alle[0] : null
  };
}

// Steht der Crawl?
// -------------------------------------------------------------------------
// Eine feste Stundenzahl wäre hier eine Magic Number und in beide Richtungen
// falsch: bei fünf Vollrunden je Tag sind 11 Stunden Stille bereits ein
// Betriebsbefund, bei einem zweimal-täglichen Rhythmus nicht. Deshalb wird die
// Erwartung aus dem BEOBACHTETEN Abstand der Vollläufe abgeleitet (dieselbe
// Denkweise wie die rhythmus-bewussten Schwellen in Punkt 16), mit Boden und
// Deckel gegen Ausreißer. Ohne genug Läufe gilt ein benannter Standardwert.
const CRAWL_RHYTHMUS = Object.freeze({ faktor: 2, bodenStunden: 3, deckelStunden: 24, standardStunden: 12 });

function crawlRhythmus(alterStunden, medianAbstandStunden, opts = CRAWL_RHYTHMUS) {
  if (alterStunden == null) {
    return {
      schwelleStunden: null, erwarteterAbstandStunden: medianAbstandStunden, grundlage: "keine Laufdaten", veraltet: false
    };
  }
  if (medianAbstandStunden == null) {
    return {
      schwelleStunden: opts.standardStunden,
      erwarteterAbstandStunden: null,
      grundlage: `Standardwert (zu wenige vollständige Läufe für einen beobachteten Rhythmus)`,
      veraltet: alterStunden > opts.standardStunden
    };
  }
  const roh = medianAbstandStunden * opts.faktor;
  const schwelle = Math.min(opts.deckelStunden, Math.max(opts.bodenStunden, roh));
  return {
    schwelleStunden: Math.round(schwelle * 10) / 10,
    erwarteterAbstandStunden: Math.round(medianAbstandStunden * 10) / 10,
    grundlage: `beobachteter Abstand der Vollläufe × ${opts.faktor}`,
    veraltet: alterStunden > schwelle
  };
}

// ---------------------------------------------------------------------------
// 3 · Inventur
// ---------------------------------------------------------------------------
// Eingaben (alle optional, alles injiziert):
//   packages/packagePaths/retrievalPaths  — relationale Quellenwahrheit (DB-Zeilen)
//   geographies                            — nur für lesbare Regionsnamen
//   profiles                               — Mandatsprofile (Aktivierungsberechtigung)
//   telemetrie                             — source_crawl_telemetry im Fenster
//   lieferhistorie                         — optional: letzte Lieferung JE QUELLE ohne
//                                            Fensterbeschränkung ([{source_id, at}] oder Map).
//                                            Fehlt sie, gilt ehrlich nur das Fenster.
//   kostenJeQuelle                         — optional (Punkt 17), rein additiv
//   plan / stoerungen                      — optional vorberechnet (sonst hier erzeugt)
//   now / env / fensterTage
function buildPaketInventur(input = {}) {
  const now = Number.isFinite(input.now) ? input.now : Date.now();
  const env = input.env || process.env;
  const packages = (Array.isArray(input.packages) ? input.packages : []).filter((p) => p && p.id);
  const packagePaths = (Array.isArray(input.packagePaths) ? input.packagePaths : []).filter((pp) => pp && pp.package_id && pp.retrieval_path_id);
  const retrievalPaths = (Array.isArray(input.retrievalPaths) ? input.retrievalPaths : []).filter((p) => p && p.id);
  const geographies = Array.isArray(input.geographies) ? input.geographies : [];
  const profiles = Array.isArray(input.profiles) ? input.profiles : [];
  const telemetrie = Array.isArray(input.telemetrie) ? input.telemetrie : [];
  const kostenJeQuelle = input.kostenJeQuelle && typeof input.kostenJeQuelle === "object" ? input.kostenJeQuelle : null;

  const schwellen = sf.stoerungsSchwellen(env, input.schwellen || {});
  const fensterTage = Number.isFinite(input.fensterTage) ? input.fensterTage : schwellen.fensterTage;

  // --- 3.1 Struktur: welcher Weg gehört zu welchem Paket? -------------------
  const paketById = new Map(packages.map((p) => [p.id, p]));
  const wegById = new Map(retrievalPaths.map((p) => [p.id, p]));
  const geoById = new Map(geographies.filter((g) => g && g.id).map((g) => [g.id, g]));

  const wegeJePaket = new Map();
  const paketeJeWeg = new Map();
  const verwaisteZuordnungen = [];
  for (const pp of packagePaths) {
    if (!paketById.has(pp.package_id) || !wegById.has(pp.retrieval_path_id)) {
      verwaisteZuordnungen.push({ paketId: pp.package_id, wegId: pp.retrieval_path_id });
      continue;
    }
    if (!wegeJePaket.has(pp.package_id)) wegeJePaket.set(pp.package_id, []);
    wegeJePaket.get(pp.package_id).push(pp.retrieval_path_id);
    if (!paketeJeWeg.has(pp.retrieval_path_id)) paketeJeWeg.set(pp.retrieval_path_id, []);
    paketeJeWeg.get(pp.retrieval_path_id).push(pp.package_id);
  }

  // --- 3.2 Plan: was ist im aktuellen Betrieb wirklich eingeplant? ----------
  const plan = input.plan || buildRelationalCrawlPlan({
    retrievalPaths, packages, packagePaths, profiles, legacySources: [], env
  });
  const planEintragById = new Map();
  for (const a of plan.aktiv || []) planEintragById.set(a.id, { planzustand: PLANZUSTAENDE.EINGEPLANT, grund: a.grund || "referenced", refCount: a.refCount });
  for (const d of plan.defekt || []) planEintragById.set(d.id, { planzustand: PLANZUSTAENDE.DEFEKT, grund: d.grund || "defekt", refCount: d.refCount });
  for (const x of plan.ausgeschlossen || []) planEintragById.set(x.id, { planzustand: PLANZUSTAENDE.AUSGESCHLOSSEN, grund: x.grund || "ausgeschlossen", refCount: 0 });

  // --- 3.3 Aktivierung: Referenzzählung über die echten Profile -------------
  const aktivierung = input.aktivierung || computeGlobalActivation({ profiles, packages, packagePaths, retrievalPaths });
  const aktivierungByKey = new Map((aktivierung.packageStatus || []).map((p) => [p.key, p]));

  // Welche Mandate fordern welches Paket an? Ausschliesslich über den
  // produktiven Resolver — keine zweite Zuordnungslogik, kein Mandant im Code.
  const mandateJePaket = new Map();
  let mandatswirkungBestimmbar = false;
  if (profiles.length) {
    mandatswirkungBestimmbar = true;
    for (const profile of profiles) {
      if (!isActivationEligible(profile)) continue;
      const pid = profile.id || profile.user_id || profile.userId || profile.politicianId || null;
      for (const key of resolveProfilePackages(profile).all) {
        if (!mandateJePaket.has(key)) mandateJePaket.set(key, new Set());
        if (pid) mandateJePaket.get(key).add(String(pid));
      }
    }
  }

  // --- 3.4 Laufverhalten: Punkt 16 unverändert wiederverwenden --------------
  const stoerungen = input.stoerungen || sf.bewerteQuellenstoerungen({
    telemetrie, retrievalPaths, packages, packagePaths,
    profiles: profiles.length ? profiles : null,
    now, schwellen, env
  });
  const befundByWegId = new Map();
  const befundBySourceId = new Map();
  for (const b of stoerungen.befunde || []) {
    if (b.wegId) befundByWegId.set(b.wegId, b);
    if (b.sourceId) befundBySourceId.set(b.sourceId, b);
  }

  // --- 3.5 Ertrag ----------------------------------------------------------
  const ertrag = aggregiereErtrag(telemetrie, { now, fensterTage });
  const laufwahl = waehleLetztenVolllauf(ertrag.laeufe, {
    eingeplanteWege: (plan.aktiv || []).length,
    anteil: Number.isFinite(input.volllaufAnteil) ? input.volllaufAnteil : 0.5,
    minWege: Number.isFinite(input.volllaufMinWege) ? input.volllaufMinWege : 10
  });
  const letzterLauf = laufwahl.letzterVolllauf;

  // Letzte Lieferung OHNE Fensterbeschränkung (optional injiziert). Ohne diese
  // Eingabe darf die Inventur nur „im Fenster" behaupten — alles andere wäre
  // eine Aussage über Daten, die gar nicht gelesen wurden.
  const lieferhistorie = normalisiereLieferhistorie(input.lieferhistorie);

  const telemetrieVerfuegbar = telemetrie.length > 0;

  // VERALTETE DATENGRUNDLAGE — eigener, unübersehbarer Befund.
  // Punkt 16 bewertet je QUELLE, ob sie überfällig ist. Fällt aber der Crawl als
  // Ganzes aus (wie am 2026-07-26/27 durch das 300-s-Funktionslimit), ist keine
  // einzelne Quelle „veraltet" — es kommt schlicht nichts Neues mehr herein, und
  // jede Paketzeile beschreibt dann einen Zustand von gestern. Ohne diesen Wert
  // läse sich die Inventur wie eine Aussage über JETZT.
  const juengsteZeileAt = telemetrie.reduce((max, z) => {
    const at = z ? ms(z.created_at || z.createdAt || z.finished_at || z.finishedAt) : null;
    return at != null && (max == null || at > max) ? at : max;
  }, null);
  const telemetrieAlterStunden = juengsteZeileAt == null ? null : Math.round(((now - juengsteZeileAt) / 3600e3) * 10) / 10;
  const rhythmus = crawlRhythmus(telemetrieAlterStunden, laufwahl.medianAbstandStunden);

  // --- 3.6 Zeile je Abrufweg ----------------------------------------------
  function wegZeile(wegId) {
    const weg = wegById.get(wegId) || null;
    const sid = weg ? (weg.legacy_source_id || weg.id) : wegId;
    const planEintrag = planEintragById.get(wegId) || { planzustand: PLANZUSTAENDE.NICHT_IM_PLAN, grund: "vom Plan nicht bewertet", refCount: 0 };
    const befund = befundByWegId.get(wegId) || null;
    const e = ertrag.jeQuelle.get(sid) || null;
    const lauf = letzterLauf ? (letzterLauf.jeQuelle.get(sid) || null) : null;

    // Letzte Lieferung: Fenster zuerst, dann die (optionale) Gesamthistorie.
    const imFenster = e ? e.letzteLieferungAt : null;
    const gesamt = lieferhistorie ? (lieferhistorie.get(sid) || null) : null;
    const letzteLieferungAt = imFenster != null ? imFenster : (gesamt != null ? gesamt : null);
    const lieferGrundlage = imFenster != null
      ? "Bewertungsfenster"
      : (lieferhistorie ? (gesamt != null ? "gesamte Telemetrie" : "keine Lieferung in der gesamten Telemetrie") : "nicht erhoben (nur Bewertungsfenster gelesen)");

    return {
      wegId,
      quelle: sid,
      name: weg ? (weg.name || weg.id) : wegId,
      methode: weg ? (weg.method || null) : null,
      dbStatus: weg ? (weg.status || null) : null,
      aktivierungsmodus: weg ? (weg.activation_mode || null) : null,
      kritisch: Boolean(weg && weg.is_critical === true),
      imKatalog: Boolean(weg),
      // Achse 1 — strukturell
      planzustand: planEintrag.planzustand,
      planGrund: planEintrag.grund,
      planGrundKopf: grundKopf(planEintrag.grund),
      bewussterAusschluss: planEintrag.planzustand === PLANZUSTAENDE.AUSGESCHLOSSEN && istBewussterAusschluss(planEintrag.grund),
      // Achse 2 — beobachtet (Punkt 16, unverändert)
      klasse: befund ? befund.klasse : sf.STOERUNGSKLASSEN.UNBEKANNT,
      klasseKurz: befund ? befund.kurz : "Keine Bewertung",
      erklaerung: befund ? befund.erklaerung : "Für diesen Abrufweg liegt kein Störungsbefund vor.",
      stufe: befund ? befund.stufe : sf.HANDLUNGSSTUFEN.BEOBACHTEN,
      wirksam: befund ? sf.istWirksam(befund) : false,
      stoerung: befund ? !sf.KEINE_STOERUNG.has(befund.klasse) : false,
      problemSeit: befund && befund.problemSeit != null ? iso(befund.problemSeit) : null,
      // Ertrag
      letzteLieferungAt: iso(letzteLieferungAt),
      letzteLieferungGrundlage: lieferGrundlage,
      letzterErfolgAt: e ? iso(e.letzterErfolgAt) : null,
      ertragFenster: e
        ? { laeufe: e.laeufe, versuche: e.versuche, lieferungen: e.lieferungen, leerlaeufe: e.leerlaeufe, fehler: e.fehler, gedrosselt: e.gedrosselt, uebersprungen: e.uebersprungen, gefunden: e.gefunden, neu: e.neu }
        : null,
      ertragLetzterLauf: lauf ? { art: lauf.art, gefunden: lauf.gefunden, neu: lauf.neu } : null,
      telemetrieVorhanden: Boolean(e),
      kostenUsd: kostenJeQuelle && Object.prototype.hasOwnProperty.call(kostenJeQuelle, sid)
        ? Number(kostenJeQuelle[sid]) : null
    };
  }

  // --- 3.7 Zeile je Paket --------------------------------------------------
  const pakete = packages.map((pk) => {
    const wegIds = wegeJePaket.get(pk.id) || [];
    const wege = wegIds.map((id) => wegZeile(id));

    const eingeplant = wege.filter((w) => w.planzustand === PLANZUSTAENDE.EINGEPLANT);
    const defekt = wege.filter((w) => w.planzustand === PLANZUSTAENDE.DEFEKT);
    const ausgeschlossen = wege.filter((w) => w.planzustand === PLANZUSTAENDE.AUSGESCHLOSSEN);
    const nichtBewertet = wege.filter((w) => w.planzustand === PLANZUSTAENDE.NICHT_IM_PLAN);

    const ausschlussgruende = {};
    for (const w of ausgeschlossen) ausschlussgruende[w.planGrundKopf] = (ausschlussgruende[w.planGrundKopf] || 0) + 1;

    // Lage NUR über die eingeplanten Wege — ein bewusst gesperrter Weg ist
    // keine Störung und darf die Versorgungsaussage nicht verfälschen.
    let wirksam = 0, gestoert = 0, unbekannt = 0;
    for (const w of eingeplant) {
      if (w.klasse === sf.STOERUNGSKLASSEN.UNBEKANNT) unbekannt++;
      else if (w.wirksam) wirksam++;
      else gestoert++;
    }

    const stufen = { keine: 0, beobachten: 0, zeitnah_pruefen: 0, akut: 0 };
    const klassen = {};
    for (const w of eingeplant) {
      stufen[w.stufe] = (stufen[w.stufe] || 0) + 1;
      klassen[w.klasse] = (klassen[w.klasse] || 0) + 1;
    }

    // Ertrag je Paket. Ein Weg kann in mehreren Paketen hängen — je Paket ist
    // die volle Zurechnung richtig; die Gesamtsumme unten entdoppelt.
    const fenster = { gefunden: 0, neu: 0, lieferungen: 0, versuche: 0, fehler: 0, wegeMitLieferung: 0, wegeMitTelemetrie: 0 };
    for (const w of wege) {
      if (!w.ertragFenster) continue;
      fenster.wegeMitTelemetrie++;
      fenster.gefunden += w.ertragFenster.gefunden;
      fenster.neu += w.ertragFenster.neu;
      fenster.lieferungen += w.ertragFenster.lieferungen;
      fenster.versuche += w.ertragFenster.versuche;
      fenster.fehler += w.ertragFenster.fehler;
      if (w.ertragFenster.lieferungen > 0) fenster.wegeMitLieferung++;
    }
    const imLauf = { gefunden: 0, neu: 0, wege: 0, ok: 0 };
    for (const w of wege) {
      if (!w.ertragLetzterLauf) continue;
      imLauf.wege++;
      imLauf.gefunden += w.ertragLetzterLauf.gefunden;
      imLauf.neu += w.ertragLetzterLauf.neu;
      if (w.ertragLetzterLauf.art === "lieferung") imLauf.ok++;
    }

    const letzteLieferungAt = wege
      .map((w) => ms(w.letzteLieferungAt))
      .filter((v) => v != null)
      .reduce((max, v) => (max == null || v > max ? v : max), null);
    const letzteLieferungWeg = letzteLieferungAt == null
      ? null
      : (wege.find((w) => ms(w.letzteLieferungAt) === letzteLieferungAt) || null);

    const act = aktivierungByKey.get(pk.key) || { activation: "inactive", refCount: 0, status: pk.status };
    const mandate = mandateJePaket.get(pk.key) ? [...mandateJePaket.get(pk.key)].sort() : [];

    const geo = pk.geography_id ? (geoById.get(pk.geography_id) || null) : null;

    const kostenBekannt = wege.filter((w) => w.kostenUsd != null);
    const kosten = kostenJeQuelle
      ? {
          verfuegbar: kostenBekannt.length > 0,
          zugeordneteWege: kostenBekannt.length,
          wegeGesamt: wege.length,
          usd: kostenBekannt.length ? Number(kostenBekannt.reduce((s, w) => s + w.kostenUsd, 0).toFixed(6)) : null,
          hinweis: kostenBekannt.length === wege.length ? null : "Nur teilweise zugeordnet — Betrag ist eine Untergrenze."
        }
      : { verfuegbar: false, zugeordneteWege: 0, wegeGesamt: wege.length, usd: null, hinweis: "Kostenzuordnung nicht erhoben (Punkt 17, optional)." };

    const flags = {
      ohneAbrufwege: wege.length === 0,
      ohneEingeplanteWege: eingeplant.length === 0,
      ohneTelemetrie: fenster.wegeMitTelemetrie === 0,
      ohneLieferungImFenster: fenster.lieferungen === 0,
      ohneLieferungJemals: letzteLieferungAt == null,
      ertragNullImFenster: fenster.neu === 0,
      defekteWege: defekt.length > 0,
      // Ein Paket wird angefordert, ist aber nicht versorgt (prepared/draft).
      angefordertUnversorgt: act.activation === "requested_unsupplied"
    };

    const { zustand, zustandGrund } = paketZustand({
      pk, act, wege, eingeplant, defekt, ausgeschlossen, nichtBewertet,
      wirksam, gestoert, unbekannt, stufen, fenster,
      telemetrieVerfuegbar
    });

    return {
      // 1 · Kennung und Name
      id: pk.id,
      key: pk.key,
      name: pk.name || pk.key,
      zweck: pk.purpose || null,
      // 2 · Ebene, Region, politische Zuordnung
      ebene: pk.political_level || null,
      region: geo ? { id: geo.id, name: geo.name, ebene: geo.level } : (pk.geography_id ? { id: pk.geography_id, name: null, ebene: null } : null),
      istBasispaket: pk.is_base === true,
      pflichtklassen: Array.isArray(pk.required_classes) ? pk.required_classes.slice() : [],
      dbStatus: pk.status || null,
      // 3 · Zugeordnete Abrufwege
      abrufwege: {
        gesamt: wege.length,
        eingeplant: eingeplant.length,
        defekt: defekt.length,
        ausgeschlossen: ausgeschlossen.length,
        nichtBewertet: nichtBewertet.length,
        ausschlussgruende,
        wirksam, gestoert, unbekannt,
        liste: wege
      },
      // 4 · Tatsächlicher Aktivierungszustand
      aktivierung: {
        paketAktivierung: act.activation,
        refCount: act.refCount || 0,
        mandate,
        mandatswirkungBestimmbar,
        ausfuehrbar: eingeplant.length > 0,
        begruendung: aktivierungsBegruendung({ pk, act, eingeplant, ausgeschlossen, defekt, wege })
      },
      // 5 · Ertrag aus dem echten Betrieb
      ertrag: {
        letzterLauf: letzterLauf
          ? { runId: letzterLauf.runId, beginntAt: iso(letzterLauf.beginntAt), endetAt: iso(letzterLauf.endetAt), ...imLauf }
          : null,
        betriebszeitraum: { tage: fensterTage, ...fenster },
        messbar: fenster.wegeMitTelemetrie > 0,
        grund: fenster.wegeMitTelemetrie > 0
          ? null
          : (telemetrieVerfuegbar
              ? "Kein Abrufweg dieses Pakets hat im Betriebszeitraum eine Telemetriezeile geschrieben."
              : "Keine Quellen-Telemetrie im Betriebszeitraum — der Ertrag ist nicht messbar.")
      },
      // 6 · Letzte erfolgreiche Lieferung
      letzteLieferung: letzteLieferungAt == null
        ? null
        : { at: iso(letzteLieferungAt), quelle: letzteLieferungWeg ? letzteLieferungWeg.quelle : null, grundlage: letzteLieferungWeg ? letzteLieferungWeg.letzteLieferungGrundlage : null },
      // 7 · Aktuelle Fehler / Einschränkungen
      fehler: {
        klassen,
        stufen,
        akut: eingeplant.filter((w) => w.stufe === sf.HANDLUNGSSTUFEN.AKUT).map(befundKurz),
        zeitnah: eingeplant.filter((w) => w.stufe === sf.HANDLUNGSSTUFEN.ZEITNAH).map(befundKurz),
        strukturell: [
          // `planGrund` kommt aus dem Crawl-Plan und lautet bei leerem `last_error`
          // nur "defekt (error_streak=?)" — in Production sind diese drei Spalten
          // nachweislich zu 0 von 163 befüllt (Befund A-6). Deshalb hier zusätzlich
          // der Katalogstatus, damit die Zeile für sich allein verständlich ist.
          ...defekt.map((w) => ({
            quelle: w.quelle, name: w.name, art: "defekt",
            text: `Katalogstatus ${w.dbStatus || "?"} — wird nicht abgerufen (${w.planGrund})`
          })),
          ...ausgeschlossen.filter((w) => !w.bewussterAusschluss).map((w) => ({ quelle: w.quelle, name: w.name, art: "ausgeschlossen", text: w.planGrund }))
        ]
      },
      // 8 · Erhebungszeitpunkt (auch je Zeile, damit eine kopierte Zeile datiert bleibt)
      erhobenAm: iso(now),
      // 9 · Eindeutiger Zustand
      zustand,
      zustandGrund,
      flags,
      kosten
    };
  }).sort((a, b) => (ZUSTAND_RANG[a.zustand] - ZUSTAND_RANG[b.zustand]) || String(a.key).localeCompare(String(b.key)));

  // --- 3.8 Laufzeitquellen (kein Paket, entstehen aus dem Profil) ----------
  // `scheduler.personNewsSource` erzeugt je Mandat zur Laufzeit eine
  // Personensuche. Sie steht bewusst NIE im geteilten Katalog (CLAUDE.md §4.2)
  // und gehört damit zu keinem Paket — sie darf aber auch nicht verschwinden,
  // sonst fehlt genau der mandatsindividuelle Teil der Versorgung.
  const katalogQuellen = new Set(retrievalPaths.map((p) => p.legacy_source_id || p.id));
  const laufzeitquellen = [...ertrag.jeQuelle.values()]
    .filter((q) => !katalogQuellen.has(q.sourceId))
    .map((q) => {
      const befund = befundBySourceId.get(q.sourceId) || null;
      return {
        quelle: q.sourceId,
        klasse: befund ? befund.klasse : sf.STOERUNGSKLASSEN.UNBEKANNT,
        stufe: befund ? befund.stufe : sf.HANDLUNGSSTUFEN.BEOBACHTEN,
        letzteLieferungAt: iso(q.letzteLieferungAt),
        ertragFenster: { laeufe: q.laeufe, versuche: q.versuche, lieferungen: q.lieferungen, gefunden: q.gefunden, neu: q.neu }
      };
    })
    .sort((a, b) => String(a.quelle).localeCompare(String(b.quelle)));

  // --- 3.9 Wege ohne jedes Paket ------------------------------------------
  const wegeOhnePaket = retrievalPaths
    .filter((p) => !paketeJeWeg.has(p.id))
    .map((p) => wegZeile(p.id));

  // --- 3.10 Summen (entdoppelt über Wege, nicht über Paketzuordnungen) -----
  const zustandZaehler = { gesund: 0, eingeschraenkt: 0, ausgefallen: 0, inaktiv: 0, unbekannt: 0 };
  for (const p of pakete) zustandZaehler[p.zustand] = (zustandZaehler[p.zustand] || 0) + 1;

  const globalGefunden = [...ertrag.jeQuelle.values()].reduce((n, q) => n + q.gefunden, 0);
  const globalNeu = [...ertrag.jeQuelle.values()].reduce((n, q) => n + q.neu, 0);

  const summe = {
    pakete: pakete.length,
    abrufwege: retrievalPaths.length,
    paketzuordnungen: packagePaths.length,
    wegeEingeplant: (plan.aktiv || []).length,
    wegeDefekt: (plan.defekt || []).length,
    wegeAusgeschlossen: (plan.ausgeschlossen || []).length,
    wegeOhnePaket: wegeOhnePaket.length,
    verwaisteZuordnungen: verwaisteZuordnungen.length,
    laufzeitquellen: laufzeitquellen.length,
    zustand: zustandZaehler,
    ertragBetriebszeitraum: { tage: fensterTage, gefunden: globalGefunden, neu: globalNeu, quellenMitTelemetrie: ertrag.jeQuelle.size },
    aktiveProfile: aktivierung.activeProfileCount || 0,
    profileGesamt: profiles.length
  };

  // --- 3.11 Datengrundlage: was wurde gelesen, was fehlt? ------------------
  // Ohne diesen Block ist jede Zahl oben unbelegt. Er ist Teil der Ausgabe,
  // nicht Kommentar.
  const landesmodulFlagGesetzt = String((env && env.HELMUT_LANDESMODULE) || "").trim() !== "";
  const landesmodul = plan.landesmodule || {};
  const datengrundlage = {
    katalog: { pakete: packages.length, abrufwege: retrievalPaths.length, zuordnungen: packagePaths.length, geografien: geographies.length },
    profile: { gelesen: profiles.length, aktivierungsberechtigt: aktivierung.activeProfileCount || 0, verfuegbar: profiles.length > 0 },
    telemetrie: {
      verfuegbar: telemetrieVerfuegbar,
      zeilen: telemetrie.length,
      fensterTage,
      laeufeImFenster: laufwahl.laeufeImFenster,
      volllaeufeImFenster: laufwahl.volllaeufeImFenster,
      volllaufSchwelleWege: laufwahl.schwelle,
      juengsteZeileAt: iso(juengsteZeileAt),
      alterStunden: telemetrieAlterStunden,
      hinweis: telemetrieVerfuegbar ? null : "Keine Quellen-Telemetrie im Betriebszeitraum — Ertrag und Lieferzeitpunkte sind nicht messbar."
    },
    lieferhistorieUnbeschraenkt: {
      verfuegbar: Boolean(lieferhistorie),
      quellen: lieferhistorie ? lieferhistorie.size : 0,
      hinweis: lieferhistorie ? null : "Letzte Lieferung nur innerhalb des Betriebszeitraums erhoben — ältere Lieferungen sind nicht belegt."
    },
    kosten: { verfuegbar: Boolean(kostenJeQuelle), quellen: kostenJeQuelle ? Object.keys(kostenJeQuelle).length : 0 },
    landesmodule: {
      // Ehrlichkeitsriegel: die Freigabe steht in Production in der Vercel-Env
      // und ist aus einer Sitzung NICHT lesbar. Solange kein Land ein
      // berechtigtes Landesmandat hat, ist das folgenlos — dann steht die
      // Aussage „inaktiv" unabhängig vom Flag fest. Erst mit einem berechtigten
      // Mandat wird der unbekannte Flag-Wert zu einer echten Unsicherheit.
      flagAusProzessumgebung: landesmodulFlagGesetzt ? String(env.HELMUT_LANDESMODULE).trim() : null,
      freigegeben: landesmodul.freigegeben || [],
      mitBerechtigtemMandat: landesmodul.mitBerechtigtemMandat || [],
      wirksam: landesmodul.wirksam || [],
      unsicher: (landesmodul.mitBerechtigtemMandat || []).length > 0 && !landesmodulFlagGesetzt,
      hinweis: (landesmodul.mitBerechtigtemMandat || []).length === 0
        ? "Kein Land hat ein aktivierungsberechtigtes Landtagsmandat — die Landesmodule sind unabhängig vom Freigabe-Flag inaktiv (aus der Datenbank belegt)."
        : "Mindestens ein Land hat ein berechtigtes Landtagsmandat — die tatsächliche Freigabe hängt zusätzlich am Flag HELMUT_LANDESMODULE der Laufzeitumgebung."
    }
  };

  return {
    erhobenAm: iso(now),
    erhobenAmMs: now,
    fensterTage,
    schwellen,
    summe,
    pakete,
    laufzeitquellen,
    wegeOhnePaket,
    verwaisteZuordnungen,
    // Wie alt ist die jüngste Telemetriezeile? Eigener Spitzenbefund, siehe oben.
    datenalter: {
      juengsteZeileAt: iso(juengsteZeileAt),
      alterStunden: telemetrieAlterStunden,
      erwarteterAbstandStunden: rhythmus.erwarteterAbstandStunden,
      schwelleStunden: rhythmus.schwelleStunden,
      grundlage: rhythmus.grundlage,
      veraltet: rhythmus.veraltet,
      hinweis: telemetrieAlterStunden == null
        ? "Keine Telemetriezeile im Betriebszeitraum — die Inventur beschreibt keinen aktuellen Betrieb."
        : (rhythmus.veraltet
            ? `Die jüngste Telemetriezeile ist ${telemetrieAlterStunden} Stunden alt, erwartet werden höchstens ${rhythmus.schwelleStunden} Stunden (${rhythmus.grundlage}). Der Crawl steht — die Inventur beschreibt NICHT den Zustand von jetzt, sondern den des letzten Laufs.`
            : `Jüngste Telemetriezeile ${telemetrieAlterStunden} Stunden alt, erwartet werden höchstens ${rhythmus.schwelleStunden} Stunden (${rhythmus.grundlage}) — die Datengrundlage ist aktuell.`)
    },
    letzterLauf: letzterLauf
      ? {
          runId: letzterLauf.runId,
          beginntAt: iso(letzterLauf.beginntAt),
          endetAt: iso(letzterLauf.endetAt),
          alterStunden: Math.round(((now - letzterLauf.endetAt) / 3600e3) * 10) / 10,
          quellenMitVersuch: letzterLauf.quellenMitVersuch.size,
          quellenDistinct: letzterLauf.quellen.size,
          zeilen: letzterLauf.zeilen,
          // Invariante B3 (OP-19): ein Abrufweg darf je Lauf genau EINE Zeile
          // schreiben. `Zeilen = distinct source_id` ersetzt die verworfene feste
          // Referenzzahl „145" (F-5) und ist hier je Lauf direkt ablesbar.
          dublettenfrei: letzterLauf.zeilen === letzterLauf.quellen.size,
          gefunden: letzterLauf.gefunden,
          neu: letzterLauf.neu,
          ok: letzterLauf.ok, leer: letzterLauf.leer, fehler: letzterLauf.fehler,
          gedrosselt: letzterLauf.gedrosselt, uebersprungen: letzterLauf.uebersprungen
        }
      : null,
    letzterLaufHinweis: letzterLauf
      ? null
      : (laufwahl.letzterLaufBeliebig
          ? `Kein vollständiger Lauf im Betriebszeitraum: der jüngste Lauf (${laufwahl.letzterLaufBeliebig.runId}) hat nur ${laufwahl.letzterLaufBeliebig.quellenMitVersuch.size} Quellen versucht (Schwelle ${laufwahl.schwelle}).`
          : "Kein einziger Crawl-Lauf im Betriebszeitraum."),
    datengrundlage
  };
}

// ---------------------------------------------------------------------------
// 4 · Zustandsableitung — die eine Stelle, an der geurteilt wird
// ---------------------------------------------------------------------------
// Reihenfolge ist bewusst und geprüft. Grundregel: `gesund` verlangt POSITIVE
// Belege (eingeplante Wege, keine Störung, kein defekter Weg, echter Ertrag).
// Alles andere fällt nach oben in eine ehrliche Klasse — nie nach unten.
function paketZustand({ pk, act, wege, eingeplant, defekt, ausgeschlossen, nichtBewertet, wirksam, gestoert, unbekannt, stufen, fenster, telemetrieVerfuegbar }) {
  const aktiviert = act.activation === "active";

  // (1) Gar keine Abrufwege. Ein aktiviertes Paket ohne Weg kann nichts liefern
  //     — das ist ein Ausfall, kein „inaktiv".
  if (!wege.length) {
    return aktiviert
      ? { zustand: PAKET_ZUSTAENDE.AUSGEFALLEN, zustandGrund: "Paket ist technisch aktiviert, hat aber keinen einzigen Abrufweg — es kann nichts liefern." }
      : { zustand: PAKET_ZUSTAENDE.INAKTIV, zustandGrund: `Paket hat keine Abrufwege und ist nicht aktiviert (Status ${pk.status || "?"}, Aktivierung ${act.activation}).` };
  }

  // (2) Kein Weg ist eingeplant.
  if (!eingeplant.length) {
    if (aktiviert && defekt.length) {
      return {
        zustand: PAKET_ZUSTAENDE.AUSGEFALLEN,
        zustandGrund: `Paket ist technisch aktiviert, aber alle ${wege.length} Abrufwege sind nicht ausführbar (${defekt.length} defekt) — es liefert nichts.`
      };
    }
    if (nichtBewertet.length && !ausgeschlossen.length && !defekt.length) {
      return { zustand: PAKET_ZUSTAENDE.UNBEKANNT, zustandGrund: "Kein Abrufweg dieses Pakets wurde vom Crawl-Plan bewertet — der Betriebszustand ist nicht bestimmbar." };
    }
    const gruende = [...new Set(ausgeschlossen.map((w) => w.planGrundKopf))];
    const alleBewusst = ausgeschlossen.length > 0 && ausgeschlossen.every((w) => w.bewussterAusschluss) && defekt.length === 0;
    if (alleBewusst) {
      // BEWUSSTE ENTSCHEIDUNG: auch ein Paket, das ein Mandat anfordert, aber
      // (noch) nicht versorgt ist (`requested_unsupplied`, z. B. ein `prepared`
      // Landespaket), bleibt hier INAKTIV — es ist nicht kaputt, es ist bewusst
      // nicht in Betrieb. Damit die Versorgungslücke trotzdem nicht verschwindet,
      // trägt es `flags.angefordertUnversorgt` und die Aktivierungsbegründung
      // benennt sie im Klartext. „inaktiv" ist kein grüner Zustand.
      const nachfrage = act.activation === "requested_unsupplied"
        ? ` Achtung: ${act.refCount} Mandat(e) fordern dieses Paket an, es ist aber nicht versorgt (Status ${pk.status}).`
        : "";
      return { zustand: PAKET_ZUSTAENDE.INAKTIV, zustandGrund: `Kein Abrufweg ist eingeplant — bewusst: ${gruende.join(", ")}.${nachfrage}` };
    }
    return {
      zustand: PAKET_ZUSTAENDE.AUSGEFALLEN,
      zustandGrund: `Kein Abrufweg ist ausführbar (${defekt.length} defekt, ${ausgeschlossen.length} ausgeschlossen: ${gruende.join(", ") || "ohne Grund"}).`
    };
  }

  // (3) Eingeplant, aber ohne verwertbare Datengrundlage.
  if (!telemetrieVerfuegbar) {
    return { zustand: PAKET_ZUSTAENDE.UNBEKANNT, zustandGrund: `${eingeplant.length} Abrufwege sind eingeplant, es liegt aber keine Quellen-Telemetrie vor — der Zustand ist nicht messbar.` };
  }
  if (unbekannt === eingeplant.length) {
    return { zustand: PAKET_ZUSTAENDE.UNBEKANNT, zustandGrund: `Alle ${eingeplant.length} eingeplanten Abrufwege sind ohne belastbare Laufdaten — es wird bewusst nichts behauptet.` };
  }

  // (4) Eingeplant, aber kein einziger Weg trägt.
  if (wirksam === 0) {
    return {
      zustand: PAKET_ZUSTAENDE.AUSGEFALLEN,
      zustandGrund: `Kein eingeplanter Abrufweg liefert (${gestoert} gestört, ${unbekannt} ohne Laufdaten von ${eingeplant.length}).`
    };
  }

  // (5) Es trägt etwas — aber trägt es vollständig?
  const einschraenkungen = [];
  if (gestoert > 0) einschraenkungen.push(`${gestoert} von ${eingeplant.length} eingeplanten Wegen gestört`);
  if (unbekannt > 0) einschraenkungen.push(`${unbekannt} eingeplante Wege ohne belastbare Laufdaten`);
  if (defekt.length > 0) einschraenkungen.push(`${defekt.length} zugeordnete Wege defekt und dauerhaft ausgeschlossen`);
  if (stufen.akut > 0) einschraenkungen.push(`${stufen.akut} Wege mit akutem Handlungsbedarf`);
  else if (stufen.zeitnah_pruefen > 0) einschraenkungen.push(`${stufen.zeitnah_pruefen} Wege zeitnah zu prüfen`);
  if (fenster.lieferungen === 0) einschraenkungen.push("keine einzige Lieferung im Betriebszeitraum");
  else if (fenster.neu === 0) einschraenkungen.push("im Betriebszeitraum kein einziges NEUES Dokument");

  if (einschraenkungen.length) {
    return { zustand: PAKET_ZUSTAENDE.EINGESCHRAENKT, zustandGrund: `Versorgung läuft, aber eingeschränkt: ${einschraenkungen.join("; ")}.` };
  }

  // (6) Positiv belegt.
  return {
    zustand: PAKET_ZUSTAENDE.GESUND,
    zustandGrund: `Alle ${eingeplant.length} eingeplanten Abrufwege liefern störungsfrei; ${fenster.neu} neue Dokumente im Betriebszeitraum.`
  };
}

// Begründung des Aktivierungszustands im Klartext — beantwortet ausdrücklich
// „warum läuft das (nicht)?", statt nur einen Statuswert zu zeigen.
function aktivierungsBegruendung({ pk, act, eingeplant, ausgeschlossen, defekt, wege }) {
  if (act.activation === "active" && eingeplant.length) {
    return `Paket ist ${pk.status} und wird von ${act.refCount} aktivierungsberechtigten Mandaten gebraucht; ${eingeplant.length} von ${wege.length} Abrufwegen laufen.`;
  }
  if (act.activation === "active" && !eingeplant.length) {
    return `Paket ist technisch aktiviert (${act.refCount} Mandate), aber KEIN Abrufweg ist ausführbar (${defekt.length} defekt, ${ausgeschlossen.length} ausgeschlossen).`;
  }
  if (act.activation === "requested_unsupplied") {
    return `Paket wird von ${act.refCount} Mandaten angefordert, ist aber nicht versorgt — Paketstatus ist ${pk.status}, nicht active.`;
  }
  if (act.refCount === 0) {
    return `Kein aktivierungsberechtigtes Mandat fordert dieses Paket an (Paketstatus ${pk.status}) — es läuft planmäßig nicht.`;
  }
  return `Paket ist inaktiv (Status ${pk.status}, ${act.refCount} Referenzen).`;
}

function befundKurz(w) {
  return {
    quelle: w.quelle, name: w.name, klasse: w.klasse, kurz: w.klasseKurz,
    erklaerung: w.erklaerung, stufe: w.stufe, problemSeit: w.problemSeit,
    letzteLieferungAt: w.letzteLieferungAt, kritisch: w.kritisch
  };
}

// Optionale Eingabe „letzte Lieferung ohne Fenster": akzeptiert eine Map, ein
// Objekt oder eine Zeilenliste. Immer als Map<sourceId, ms> normalisiert.
function normalisiereLieferhistorie(roh) {
  if (!roh) return null;
  const out = new Map();
  if (roh instanceof Map) {
    for (const [k, v] of roh) { const t = ms(v); if (k && t != null) out.set(String(k), t); }
    return out.size ? out : null;
  }
  if (Array.isArray(roh)) {
    for (const z of roh) {
      if (!z) continue;
      const sid = z.source_id || z.sourceId || z.quelle;
      const t = ms(z.at || z.letzteLieferungAt || z.finished_at || z.created_at);
      if (sid && t != null && (!out.has(String(sid)) || out.get(String(sid)) < t)) out.set(String(sid), t);
    }
    return out.size ? out : null;
  }
  if (typeof roh === "object") {
    for (const [k, v] of Object.entries(roh)) { const t = ms(v); if (t != null) out.set(String(k), t); }
    return out.size ? out : null;
  }
  return null;
}

module.exports = {
  PAKET_ZUSTAENDE,
  ZUSTAND_RANG,
  PLANZUSTAENDE,
  BEWUSSTE_AUSSCHLUSSGRUENDE,
  istBewussterAusschluss,
  grundKopf,
  aggregiereErtrag,
  waehleLetztenVolllauf,
  CRAWL_RHYTHMUS,
  crawlRhythmus,
  paketZustand,
  normalisiereLieferhistorie,
  buildPaketInventur
};
