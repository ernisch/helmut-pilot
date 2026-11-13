"use strict";

// Ergebnisstand fuer die Verwaltung: je Profil und Berliner Tag die drei Positionen
// Briefing · Zustellung · Lage (plus Radar als Teil des Briefings).
//
// Rein lesend: keine KI, kein Schreiben, keine Bindung an ein Testfenster.
// Stufen 0–4: 1 Lauf erfolgt · 2 Inhalt vorhanden · 3 Inhalt vollstaendig · 4 Inhalt brauchbar.
// Stufe 4 ist ein Fachurteil. Ein routinemaessig gespeichertes, an den Tag gebundenes
// Fachurteil gibt es nicht (`pruefung.bestanden` ist fest false); deshalb endet jede
// Position hoechstens bei Stufe 3 = „vollstaendig · nicht beurteilt“. Niemals gruen ableiten.
const B = require("./briefing-speicher");
const A = require("./briefing-ausgabebeleg");
const L = require("./briefing-lauf");
const E = require("./lage-quellenbeleg");
const { VERTRAG_VERSION } = require("./briefing-frische");
const { assertTenant } = require("./storage");

const POSITIONEN = ["briefing", "zustellung", "lage"];
const SLOTS = Object.freeze([B.SLOT, L.SLOT_ERFOLG, L.SLOT_FEHLER, "lage"]);
// Ursachen-Codes, die die Verwaltung in Klartext uebersetzt.
const URSACHEN = Object.freeze(["fehlt", "leer", "unvollstaendig", "wiederholung", "fehler", "nicht-zugestellt"]);
const RADAR_ABSCHNITTE = Object.freeze([["mentions", "Über dich"], ["environment", "Umfeld"], ["dynamics", "Dynamiken"], ["articles", "Artikel"]]);

const ergebnis = (stufe, ursache = null, code = null) => ({ stufe, ursache, code });
const istTag = tag => /^\d{4}-\d{2}-\d{2}$/.test(tag || "");

function zeilenFuer(userId, tag, rows) {
  const id = slot => `bf-${userId}-${slot}-${tag}`;
  const finde = slot => (Array.isArray(rows) ? rows : []).find(r => r && r.id === id(slot) && r.user_id === userId && r.slot === slot) || null;
  return { paket: finde(B.SLOT), quittung: finde(L.SLOT_ERFOLG), fehlerlauf: finde(L.SLOT_FEHLER), lage: finde("lage") };
}

const ruhigerTag = b => b?.currentHelmutState?.status === "empty" && b.currentHelmutState.emptyState?.kind === "quiet";

function bewerteBriefing(z, userId, tag) {
  if (!z.paket) return { pos: z.fehlerlauf ? ergebnis(0, "fehler", "morgenlauf-fehler") : ergebnis(0, "fehlt", "ergebnis-fehlt"), gueltig: false };
  try { B.pruefeZeile(z.paket, { userId, day: tag }); }
  catch { return { pos: ergebnis(1, "unvollstaendig", "briefing-nachweis-abweichend"), gueltig: false }; }
  const p = z.paket.payload, b = p.briefing;
  if (!(b?.available === true && Array.isArray(b.items) && b.items.length > 0))
    return { pos: ergebnis(1, "leer", "briefing-ohne-fachinhalt"), gueltig: true };
  // Frisch berechnet wie im Ergebnisnachweis; ein alter gespeicherter Wert kann veraltet sein.
  const pr = B.pruefeInhalt(b, p.lage);
  const fehler = Array.isArray(pr?.fehler) ? pr.fehler : [];
  // Ruhiger Tag: Helmut hat ausdruecklich „kein belegter Tagesanlass“ festgestellt
  // (currentHelmutState.emptyState.kind = "quiet"). Ist das der EINZIGE Befund, ist das
  // Briefing vollstaendig – nur ohne neue Tagesprioritaet. Jeder weitere Befund bleibt sichtbar.
  if (ruhigerTag(b) && (pr.strukturellVollstaendig === true
      || (fehler.length === 1 && fehler[0] === "briefing-ohne-tagesanlass")))
    return { pos: { ...ergebnis(3), hinweis: "ruhiger-tag" }, gueltig: true };
  if (pr.strukturellVollstaendig !== true) {
    return { pos: fehler.includes("wiederholung-zwischen-ansichten")
      ? ergebnis(2, "wiederholung", "wiederholung-zwischen-ansichten")
      : ergebnis(2, "unvollstaendig", fehler[0] || "ergebnis-strukturell-unvollstaendig"), gueltig: true };
  }
  return { pos: ergebnis(3), gueltig: true };
}

// Zustellung kennt nur Stufe 1 (Quittung vorhanden) und 3 (Quittung bindet den Inhalt).
function bewerteZustellung(z, userId, tag, paketGueltig) {
  if (!z.quittung) return z.fehlerlauf ? ergebnis(0, "fehler", "morgenlauf-fehler") : ergebnis(0, "fehlt", "ergebnis-fehlt");
  const q = z.quittung.payload;
  if (q?.tenantId !== userId || q?.berlinTag !== tag || q?.vertragVersion !== VERTRAG_VERSION || q?.status !== L.STATUS_ERFOLG
    || ![L.AUSLOESER_MORGENLAUF, L.AUSLOESER_NACHLAUF].includes(q?.ausloeser))
    return ergebnis(0, "nicht-zugestellt", "morgen-quittung-abweichend");
  if (!paketGueltig || !A.passt(q.ausgabeBeleg, z.paket) || q.signatur !== L.inhaltsSignatur(z.paket.payload.briefing))
    return ergebnis(1, "nicht-zugestellt", "morgen-inhaltsbindung-fehlt");
  return ergebnis(3);
}

function bewerteLage(z) {
  if (!z.lage) return ergebnis(0, "fehlt", "ergebnis-fehlt");
  const lp = z.lage.payload;
  if (!Array.isArray(lp?.paragraphs) || !lp.paragraphs.length) return ergebnis(1, "leer", "lage-text-fehlt");
  if (!E.gespeicherterTextGueltig(lp) || lp.qualitaet?.version !== require("./lage-textqualitaet").VERSION)
    return ergebnis(2, "unvollstaendig", "ergebnis-strukturell-unvollstaendig");
  return ergebnis(3);
}

// Radar ist keine eigene Position, sondern ein Teil des gespeicherten Briefing-Pakets.
// Leere Abschnitte sind kein Fehler (z. B. „Über dich“ bei fiktiven Profilen).
function bewerteRadar(z, paketGueltig) {
  if (!z.paket || !paketGueltig) return { vorhanden: null, abschnitte: [], wiederholung: null, ohneQuelle: null };
  const radar = z.paket.payload.briefing?.currentRadarState;
  const anzeige = radar?.anzeige || radar;
  if (!anzeige || typeof anzeige !== "object") return { vorhanden: false, abschnitte: [], wiederholung: null, ohneQuelle: null };
  let ohneQuelle = 0;
  const abschnitte = RADAR_ABSCHNITTE.map(([key, label]) => {
    const wert = anzeige[key];
    const eintraege = Array.isArray(wert) ? wert : wert && typeof wert === "object" ? Object.values(wert).flat() : [];
    for (const e of eintraege) if (e && typeof e === "object" && !(e.sourceUrl || e.url)) ohneQuelle++;
    return { label, anzahl: eintraege.length };
  });
  const wiederholungen = B.pruefeInhalt(z.paket.payload.briefing, z.paket.payload.lage).wiederholungen;
  return { vorhanden: true, abschnitte, ohneQuelle,
    wiederholung: Array.isArray(wiederholungen) ? wiederholungen.some(p => /currentRadarState/.test(p)) : null };
}

function bewerte({ userId, tag, rows }) {
  assertTenant(userId, "adminErgebnisstand");
  if (!istTag(tag)) throw new Error("ergebnis-tag-ungueltig");
  const z = zeilenFuer(userId, tag, rows);
  const briefing = bewerteBriefing(z, userId, tag);
  const positionen = { briefing: briefing.pos, zustellung: bewerteZustellung(z, userId, tag, briefing.gueltig), lage: bewerteLage(z) };
  const erfolg = positionen.zustellung.stufe >= 1 ? z.quittung.payload.erzeugtAm || z.quittung.generated_at || null : null;
  return { positionen, radar: bewerteRadar(z, briefing.gueltig), letzterErfolg: erfolg };
}

function leereBilanz() {
  return Object.fromEntries(POSITIONEN.map(p => [p, { fehlt: 0, leer: 0, wiederholung: 0, unvollstaendig: 0, fehler: 0, nichtZugestellt: 0, nichtBeurteilt: 0, brauchbar: 0, unbrauchbar: 0 }]));
}

// Zaehlt je Position genau eine Spalte je Profil. „Nicht beurteilt“ = vollstaendig ohne Fachurteil.
function zaehle(bilanz, positionen) {
  for (const p of POSITIONEN) {
    const e = positionen[p];
    const spalte = e.ursache === null ? (e.stufe >= 3 ? "nichtBeurteilt" : null) : e.ursache === "nicht-zugestellt" ? "nichtZugestellt" : e.ursache;
    if (spalte) bilanz[p][spalte]++;
  }
  return bilanz;
}

module.exports = { POSITIONEN, SLOTS, URSACHEN, bewerte, leereBilanz, zaehle };

// Sammelabruf fuer die Verwaltung. Liest die Tageszeilen ALLER aktiven Profile in festen
// Stapeln (Bilanz ueber alle), liefert Profilzeilen aber nur fuer die angefragte Seite.
// 20, 500 und 2000 Profile laufen denselben Weg. Ohne V3-Speicher: ehrlich nicht verfuegbar.
const STAPEL = 25; // 25 Profile x 4 Slots = 100 Kennungen je Abfrage (Grenze des Sammellesers)
async function lade({ profiles, tag, seite = 1, proSeite = 20, storage = require("./storage") }) {
  if (!istTag(tag)) throw new Error("ergebnis-tag-ungueltig");
  proSeite = Math.min(500, Math.max(1, Math.floor(Number(proSeite)) || 20));
  if (typeof storage.v3StoreReady === "function" && !storage.v3StoreReady()) return { tag, verfuegbar: false, grund: "speicher-nicht-verfuegbar" };
  const aktive = (Array.isArray(profiles) ? profiles : [])
    .filter(p => p && p.profileActive === true && typeof p.id === "string" && /^[a-z0-9][a-z0-9-]{0,119}$/i.test(p.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  const bilanz = leereBilanz(), ergebnisse = [];
  for (let i = 0; i < aktive.length; i += STAPEL) {
    const teil = aktive.slice(i, i + STAPEL);
    const rows = await storage.listRenderedBriefingsV3ForTenants(teil.map(p => p.id), SLOTS, tag);
    for (const p of teil) {
      const r = bewerte({ userId: p.id, tag, rows: rows.filter(row => row && row.user_id === p.id) });
      zaehle(bilanz, r.positionen);
      ergebnisse.push({ p, r });
    }
  }
  const seiten = Math.max(1, Math.ceil(ergebnisse.length / proSeite));
  const nr = Math.min(Math.max(1, Math.floor(Number(seite)) || 1), seiten);
  const profile = ergebnisse.slice((nr - 1) * proSeite, nr * proSeite).map(({ p, r }) => ({
    id: p.id, name: p.fullName || p.id, mandat: p.constituency || null, parlament: p.parliament || p.level || null, aktiv: true,
    positionen: r.positionen, radar: r.radar, letzterErfolg: r.letzterErfolg,
    ursacheTop: POSITIONEN.map(k => r.positionen[k].ursache).find(Boolean) || null }));
  return { tag, verfuegbar: true, aktiv: aktive.length, bilanz, profile, seite: nr, seiten };
}

module.exports.lade = lade;
