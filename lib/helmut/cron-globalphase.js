"use strict";

// Helmut — OP-25 K1: Trennung von GLOBALER Datenerfassung und MANDATSBEZOGENER Projektion.
// =============================================================================================
// DER BEFUND (belegt gegen `main`, siehe docs/betrieb/cron-globalphase.md §2):
// `runSourceCrawl(mandat)` fuehrt je Mandat einen VOLLSTAENDIGEN Ablauf aus — Quellenplan,
// Abruf, Rohdokumente, Lazy-/Eager-Understanding, Matching, Entscheidungen, Telemetrie.
// Davon sind die Schritte 1–5 fachlich GLOBAL: der Rohkorpus (`raw_documents`) und die
// Wissensobjekte tragen keinen Mandantenbezug. Nur Matching, Entscheidungen und die
// Mandatstelemetrie sind Projektionen auf diesen globalen Bestand.
// Folge im schweren Cron-Pfad: das ERSTE Mandat verbraucht fast das gesamte Zeitbudget
// (Production 2026-07-30/31: ~4 von 4,5 Minuten), das zweite wird abgeschnitten, der Rest
// beginnt nie. Die Fairnessrotation (OP-25 Teilstueck b) verteilt diesen Rueckstand gerecht —
// sie erhoeht die Kapazitaet NICHT.
//
// DER VERTRAG (K1):
//   GLOBALE PHASE  — hoechstens EINMAL je regulaerem Lauf: aktive Profile laden, ihre
//                    Quellenplaene bilden, VEREINIGEN, abrufen, Rohdokumente speichern,
//                    global deduplizieren, verstehen, globale Lauftelemetrie schreiben und
//                    den Datenstand VERSIEGELN.
//   MANDATSPHASE   — danach je aktivem Mandat: Profil, Matching gegen den VERSIEGELTEN
//                    Datenstand, Entscheidungen, Mandatstelemetrie. Fehler je Mandat isoliert,
//                    Reihenfolge und Nachholfaehigkeit bleiben bei `cron-fairness`.
//
// WAS DIESES MODUL IST: der reine, IO-freie Teil dieses Vertrags — Vereinigungsmenge,
// Budgetaufteilung, Datenstandsvertrag, Kapazitaetsmodell. Alles hier ist deterministisch und
// ohne Netz/DB testbar. Die Bindung an die echten Produktionsfunktionen liegt in
// `scheduler.js` (`runGlobaleErfassung` / `runMandatsProjektion`), die Verdrahtung in
// `server.js`.
//
// WAS DIESES MODUL NICHT TUT (ausdruecklich):
//   - kein Zeitbudget erhoehen (es TEILT ein bestehendes Budget auf),
//   - keine Cron-Zeit, keine Cron-Reihenfolge, keine Frequenz aendern,
//   - keine Warteschlange, keine zusaetzliche Infrastruktur, keine neue laufende Kostenquelle,
//   - keine Sperre schwaechen (die Mandatssperre `crawl-<mandat>` bleibt unveraendert),
//   - keine Quelle aktivieren, die nicht schon heute mindestens ein aktives Profil erhielte.
//
// FLAGGRENZE: `HELMUT_CRON_GLOBALPHASE` ist DEFAULT AUS und muss ausdruecklich eingeschaltet
// werden (`on`/`true`/`1`/`an`). Jeder andere Wert — auch ein leerer, auch `off`, auch ein
// Tippfehler — bedeutet AUS. Das ist die Umkehrung von `HELMUT_CRON_FAIRNESS` (dort ist
// "nicht gesetzt" = an) und bewusst so: ein vergessenes Deployment darf diesen Pfad niemals
// scharf schalten. Das Flag ist NICHT in der Datei-Allowlist von `helmut-flags.json` — es
// laesst sich also nur ueber die Vercel-Env aktivieren, also nur durch den Betreiber.

// Schemaversion des Datenstands. Steigt nur, wenn sich seine BEDEUTUNG aendert.
const GLOBALPHASE_VERSION = 1;

// Zustaende des globalen Datenstands. Rangfolge ist bedeutsam (siehe `datenstandVerwendbar`).
const DATENSTAND_OFFEN = "offen";                   // laeuft noch — NICHT projizierbar
const DATENSTAND_ABGESCHLOSSEN = "abgeschlossen";   // alle geplanten Schritte fertig
const DATENSTAND_TEILWEISE = "teilweise";           // versiegelt, aber Budget/Teilfehler
const DATENSTAND_FEHLGESCHLAGEN = "fehlgeschlagen"; // Erfassung gescheitert — KEINE Projektion

// Reserve je Mandat fuer die Mandatsphase (Matching + Entscheidungen). Production gemessen:
// ein Matchinglauf dauert ~1,0–1,1 s (`mrun-…`, 1 041 ms / 1 074 ms). 8 s je Mandat ist damit
// ein Vielfaches des gemessenen Bedarfs und trotzdem klein gegen das Gesamtbudget.
const DEFAULT_PROJEKTION_MS = 8000;
// Die globale Phase darf durch die Reserve NIE unter diesen Anteil der Restzeit fallen —
// sonst koennte eine wachsende Mandatszahl die Datenerfassung selbst aushungern.
const MIN_GLOBAL_ANTEIL = 0.5;

// --- Flag + Schalter ---------------------------------------------------------------------------

// DEFAULT AUS. Nur eine ausdrueckliche Zusage schaltet ein.
function globalPhaseEnabled(env = process.env) {
  const raw = String((env && env.HELMUT_CRON_GLOBALPHASE) || "").trim().toLowerCase();
  return raw === "on" || raw === "true" || raw === "1" || raw === "an";
}

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function projektionsBudgetMs(env = process.env) {
  return positiveNumber(env && env.HELMUT_CRON_PROJEKTION_MS, DEFAULT_PROJEKTION_MS);
}

// --- Vereinigungsmenge der Quellen --------------------------------------------------------------

// DER KRITISCHE TEIL. Eingabe ist je aktivem Profil das Ergebnis der UNVERAENDERTEN
// Produktionsfunktion `scheduler.getSourcesForProfile(profile)` — also genau die Quellenliste,
// die dieses Mandat heute erhielte. Daraus folgt strukturell:
//
//   Vereinigungsmenge  =  ⋃ (heutige Plaene)   und   Vereinigungsmenge ⊆ ⋃ (heutige Plaene)
//
// Es kann also KEIN Abrufweg entstehen, den nicht mindestens ein aktives Profil schon heute
// erhielte — und keiner verschwinden. Insbesondere:
//   - Personenquellen tragen die Kennung `<mandats-id>-news` und sind damit je Mandat
//     EIGENSTAENDIG; sie koennen bei der Vereinigung nicht kollidieren und nicht verschwinden.
//   - Dasselbe gilt fuer alle profilgenerierten Wege (`<mandats-id>-news-…`).
//   - Landesmodule bleiben gesperrt, weil die Sperre bereits IM Profilplan wirkt
//     (`landesmodulQuelleGesperrt` / `planQuellenFuerProfil`) — hier wird nichts nachgeholt.
//   - `active: false` (vorbereitete Wege) und manuelle Wege bleiben aussen vor, aus demselben
//     Grund: sie stehen schon im Profilplan nicht drin.
//
// REIHENFOLGE: je Profil bleibt die heutige Reihenfolge als TEILFOLGE erhalten; ein Weg steht
// an der Stelle seines ERSTEN Auftretens. Damit kann die Vereinigung keine fachliche
// Priorisierung unbemerkt verdrehen (Vertragstest: Teilfolgen-Invariante).
//
// FEHLERHAFTES PROFIL: ein Profil, dessen Plan nicht gebildet werden kann, wird benannt und
// UEBERSPRUNGEN — die Versorgung der uebrigen Profile faellt dadurch nicht aus.
function planGlobaleQuellen({ profilQuellen = [] } = {}) {
  const quellen = [];
  const indexById = new Map();
  const herkunft = new Map();
  const jeMandat = {};
  const fehlerhafteProfile = [];
  const reihenfolge = [];

  for (const eintrag of Array.isArray(profilQuellen) ? profilQuellen : []) {
    const politicianId = String((eintrag && eintrag.politicianId) || "").trim();
    if (!politicianId) continue;
    reihenfolge.push(politicianId);
    if (eintrag && eintrag.fehler) {
      fehlerhafteProfile.push({
        politicianId,
        fehler: String(eintrag.fehler).slice(0, 200)
      });
      jeMandat[politicianId] = 0;
      continue;
    }
    const liste = Array.isArray(eintrag && eintrag.quellen) ? eintrag.quellen : [];
    let gezaehlt = 0;
    for (const quelle of liste) {
      const id = quelle && quelle.id != null ? String(quelle.id) : "";
      if (!id) continue;                       // ohne Kennung nicht planbar (Telemetrie schluesselt darauf)
      gezaehlt += 1;
      if (!indexById.has(id)) {
        indexById.set(id, quellen.length);
        quellen.push(quelle);
        herkunft.set(id, [politicianId]);
      } else {
        const bisher = herkunft.get(id);
        if (!bisher.includes(politicianId)) bisher.push(politicianId);
      }
    }
    jeMandat[politicianId] = gezaehlt;
  }

  // Strukturell identische ABRUFWEGE unter verschiedenen Kennungen (zwei Mandate derselben
  // Partei erzeugen z. B. dieselbe Fraktions-Suchanfrage unter `<id-a>-…` und `<id-b>-…`).
  // Sie werden hier NICHT zusammengelegt — das waere eine stille Aenderung der Telemetrie-
  // Schluesselung. Sie werden GEZAEHLT und ausgewiesen; dass ein solcher Weg trotzdem nur
  // EINMAL abgerufen wird, garantiert unveraendert das prozessweite Gedaechtnis
  // (`sharedFetchLedger`, Incident 2026-07-25). Der Vertragstest prueft beides getrennt.
  const wegZuIds = new Map();
  for (const quelle of quellen) {
    for (const weg of abrufwegeVon(quelle)) {
      if (!wegZuIds.has(weg)) wegZuIds.set(weg, []);
      wegZuIds.get(weg).push(String(quelle.id));
    }
  }
  const doppelteAbrufwege = [];
  for (const [weg, ids] of wegZuIds.entries()) {
    if (ids.length > 1) doppelteAbrufwege.push({ weg, quellen: ids });
  }

  const herkunftObjekt = {};
  for (const [id, ids] of herkunft.entries()) herkunftObjekt[id] = ids;
  const gemeinsam = Object.values(herkunftObjekt).filter((ids) => ids.length > 1).length;

  return {
    quellen,
    herkunft: herkunftObjekt,
    jeMandat,
    reihenfolge,
    gesamt: quellen.length,
    gemeinsam,
    mandatseigen: quellen.length - gemeinsam,
    doppelteAbrufwege,
    fehlerhafteProfile
  };
}

// Alle konkreten Abrufadressen einer Quelle (dieselbe Menge, die der Crawler benutzt).
function abrufwegeVon(quelle = {}) {
  const wege = [
    ...(Array.isArray(quelle.rssUrls) ? quelle.rssUrls : []),
    quelle.rssUrl,
    quelle.url
  ];
  return [...new Set(wege.map((w) => String(w || "").trim()).filter(Boolean))];
}

// Kontrollrechnung fuer den Vertragstest: enthaelt die Vereinigungsmenge JEDEN Weg, den
// mindestens ein aktives Mandat heute erhielte? Gibt die FEHLENDEN Kennungen zurueck (leer =
// vollstaendig). Bewusst eine eigene, unabhaengige Rechnung — nicht dieselbe Schleife wie oben.
function fehlendeQuellen({ profilQuellen = [], vereinigung = [] } = {}) {
  const vorhanden = new Set((vereinigung || []).map((q) => String((q && q.id) || "")));
  const fehlt = [];
  for (const eintrag of profilQuellen || []) {
    if (!eintrag || eintrag.fehler) continue;
    for (const quelle of eintrag.quellen || []) {
      const id = quelle && quelle.id != null ? String(quelle.id) : "";
      if (id && !vorhanden.has(id) && !fehlt.includes(id)) fehlt.push(id);
    }
  }
  return fehlt;
}

// --- Budgetaufteilung ----------------------------------------------------------------------------

// TEILT das vorhandene Budget, es erhoeht KEINES. Eingang ist die Restzeit des Cronlaufs
// (`deadline - jetzt`) und die bereits bestehende Obergrenze der Erfassung
// (`HELMUT_CRAWL_GESAMTBUDGET_MS`, heute 240 000 ms).
//
//   globalMs = min( globalMaxMs, restMs - mandate * projektionMs ),
//              aber nie weniger als MIN_GLOBAL_ANTEIL * restMs
//   projektionMs bleibt der Mandatsphase; sie laeuft danach ueber die UNVERAENDERTE
//   Fairnessschleife, die ihre eigene Reserve je Mandat weiterhin selbst prueft.
function budgetAufteilung({
  restMs = 0,
  mandate = 0,
  projektionMs = DEFAULT_PROJEKTION_MS,
  globalMaxMs = Infinity,
  minGlobalAnteil = MIN_GLOBAL_ANTEIL
} = {}) {
  const rest = Math.max(0, Number(restMs) || 0);
  const n = Math.max(0, Math.floor(Number(mandate) || 0));
  const jeMandat = Math.max(0, Number(projektionMs) || 0);
  const reserveRoh = n * jeMandat;
  const untergrenze = Math.floor(rest * Math.min(1, Math.max(0, minGlobalAnteil)));
  const nachReserve = Math.max(untergrenze, rest - reserveRoh);
  const globalMs = Math.max(0, Math.min(Number.isFinite(globalMaxMs) ? globalMaxMs : nachReserve, nachReserve));
  return {
    restMs: rest,
    globalMs,
    projektionsReserveMs: Math.max(0, rest - globalMs),
    reserveGewuenschtMs: reserveRoh,
    reserveGekuerzt: reserveRoh > Math.max(0, rest - globalMs),
    jeMandatMs: jeMandat
  };
}

// --- Datenstandsvertrag ---------------------------------------------------------------------------

// Ein Datenstand entsteht OFFEN und wird genau einmal versiegelt. Nur ein VERSIEGELTER
// Datenstand darf projiziert werden — das ist der Riegel gegen „Matching laeuft vor Abschluss
// der globalen Phase". Ein FEHLGESCHLAGENER Datenstand ist versiegelt und trotzdem nicht
// projizierbar: eine gescheiterte Erfassung darf keine persoenliche Projektion erzeugen, die
// anschliessend als frisch gilt.
function datenstandNeu({ laufId = null, startAt = 0, mandate = 0 } = {}) {
  return {
    version: GLOBALPHASE_VERSION,
    laufId: laufId ? String(laufId).slice(0, 120) : null,
    startAt: Number(startAt) || 0,
    beendetAt: null,
    versiegelt: false,
    status: DATENSTAND_OFFEN,
    mandate: Math.max(0, Math.floor(Number(mandate) || 0)),
    quellen: 0,
    rohdokumente: 0,
    neueRohdokumente: null,
    verstanden: 0,
    zurueckgestellt: 0,
    fehler: [],
    fehlerhafteProfile: [],
    budgetErschoepft: false
  };
}

function datenstandVersiegeln(datenstand, { nowMs = 0, status = null, ...felder } = {}) {
  const basis = datenstand && typeof datenstand === "object" ? datenstand : datenstandNeu({});
  if (basis.versiegelt) return basis; // genau EINMAL — ein zweiter Abschluss darf nichts heben
  const zusammengefuehrt = { ...basis, ...felder };
  const fehler = Array.isArray(zusammengefuehrt.fehler) ? zusammengefuehrt.fehler : [];
  const abgeleitet = status || (
    fehler.some((f) => f && f.fatal)
      ? DATENSTAND_FEHLGESCHLAGEN
      : (zusammengefuehrt.budgetErschoepft || fehler.length || (zusammengefuehrt.fehlerhafteProfile || []).length)
        ? DATENSTAND_TEILWEISE
        : DATENSTAND_ABGESCHLOSSEN
  );
  return {
    ...zusammengefuehrt,
    fehler,
    beendetAt: Number(nowMs) || 0,
    versiegelt: true,
    status: abgeleitet,
    dauerMs: Math.max(0, (Number(nowMs) || 0) - (Number(zusammengefuehrt.startAt) || 0))
  };
}

// Darf auf diesem Datenstand ueberhaupt projiziert werden?
function datenstandVerwendbar(datenstand) {
  return Boolean(
    datenstand
    && datenstand.versiegelt === true
    && datenstand.status !== DATENSTAND_OFFEN
    && datenstand.status !== DATENSTAND_FEHLGESCHLAGEN
  );
}

// Ist der Datenstand VOLLSTAENDIG? Nur dann darf eine Projektion als „frisch" gelten.
// Ein teilweiser Datenstand liefert weiterhin Ergebnisse — aber ehrlich als teilweise
// gekennzeichnet (CLAUDE.md §4.4: kein falsches Gruen).
function datenstandFrisch(datenstand) {
  return Boolean(datenstand && datenstand.versiegelt === true && datenstand.status === DATENSTAND_ABGESCHLOSSEN);
}

// HARTER RIEGEL vor jeder Mandatsprojektion. Wirft — bewusst, nicht `return false`: ein
// stiller Fehlschlag wuerde hier zu einer Projektion auf unfertigen Daten fuehren.
function mandatsphaseBereit(datenstand) {
  if (!datenstand || typeof datenstand !== "object") {
    throw new Error("mandatsphase-ohne-datenstand");
  }
  if (datenstand.versiegelt !== true) {
    throw new Error("mandatsphase-vor-abschluss-der-globalen-phase");
  }
  if (datenstand.status === DATENSTAND_FEHLGESCHLAGEN) {
    throw new Error("mandatsphase-auf-fehlgeschlagenem-datenstand");
  }
  return true;
}

// Kompakte, PII-freie Kennzeichnung des Datenstands fuer Telemetrie und Antwortkoerper.
function datenstandVermerk(datenstand) {
  if (!datenstand || typeof datenstand !== "object") return { status: DATENSTAND_OFFEN, versiegelt: false, laufId: null };
  return {
    laufId: datenstand.laufId || null,
    status: datenstand.status || DATENSTAND_OFFEN,
    versiegelt: Boolean(datenstand.versiegelt),
    frisch: datenstandFrisch(datenstand),
    beendetAt: datenstand.beendetAt || null,
    quellen: Number(datenstand.quellen) || 0,
    rohdokumente: Number(datenstand.rohdokumente) || 0,
    verstanden: Number(datenstand.verstanden) || 0,
    budgetErschoepft: Boolean(datenstand.budgetErschoepft),
    fehler: (datenstand.fehler || []).length
  };
}

// --- Kapazitaetsmodell ------------------------------------------------------------------------------

// Deterministische Laufzeitsimulation fuer den Kapazitaetsnachweis. KEINE Messung — sie rechnet
// aus vorgegebenen Dauern aus, wie viele Mandate ein Lauf erreicht. Die Eingangsdauern muessen
// aus echten Messungen stammen; die Trennung von Messung und Rechnung bleibt beim Aufrufer.
//
//   Alt   : je Mandat globaler Anteil + Projektionsanteil, seriell gegen die Deadline.
//   Neu   : globaler Anteil EINMAL, danach je Mandat nur der Projektionsanteil.
function kapazitaetsSimulation({
  mandate = 0,
  deadlineMs = 0,
  globalMs = 0,
  projektionMs = 0,
  // Anteil der globalen Arbeit, den ein FOLGE-Mandat im alten Pfad noch einmal zahlt.
  // 1 = alles doppelt; 0 = die Wiederholung ist gratis. Production zeigt einen hohen Wert
  // (das zweite Mandat kam nicht mehr durch), der genaue Wert bleibt Eingabe, keine Behauptung.
  wiederholungsAnteil = 1,
  reserveMs = 0
} = {}) {
  const n = Math.max(0, Math.floor(Number(mandate) || 0));
  const deadline = Math.max(0, Number(deadlineMs) || 0);
  const global = Math.max(0, Number(globalMs) || 0);
  const projektion = Math.max(0, Number(projektionMs) || 0);
  const anteil = Math.min(1, Math.max(0, Number(wiederholungsAnteil) || 0));
  const reserve = Math.max(0, Number(reserveMs) || 0);

  // ALT: Mandat 1 zahlt die volle globale Arbeit, jedes weitere `anteil` davon.
  let altVerbraucht = 0;
  let altFertig = 0;
  let altBegonnen = 0;
  for (let i = 0; i < n; i += 1) {
    const kosten = (i === 0 ? global : global * anteil) + projektion;
    if (altVerbraucht + reserve > deadline) break;
    altBegonnen += 1;
    altVerbraucht += kosten;
    if (altVerbraucht <= deadline) altFertig += 1;
  }

  // NEU: globale Arbeit genau einmal, danach nur Projektionen.
  let neuVerbraucht = Math.min(global, deadline);
  const globalPasst = global <= deadline;
  let neuFertig = 0;
  let neuBegonnen = 0;
  if (globalPasst) {
    for (let i = 0; i < n; i += 1) {
      if (neuVerbraucht + reserve > deadline) break;
      neuBegonnen += 1;
      neuVerbraucht += projektion;
      if (neuVerbraucht <= deadline) neuFertig += 1;
    }
  }

  return {
    mandate: n,
    deadlineMs: deadline,
    alt: { begonnen: altBegonnen, erfolgreich: altFertig, verbrauchtMs: altVerbraucht, restMs: Math.max(0, deadline - altVerbraucht) },
    neu: {
      begonnen: neuBegonnen,
      erfolgreich: neuFertig,
      verbrauchtMs: neuVerbraucht,
      restMs: Math.max(0, deadline - neuVerbraucht),
      globalPasst,
      restNachGlobalMs: globalPasst ? Math.max(0, deadline - global) : 0
    },
    // Wie viele Mandate passen nach der globalen Phase noch rein? Das ist die Kernzahl von K1.
    theoretischeKapazitaet: globalPasst && projektion > 0
      ? Math.floor(Math.max(0, deadline - global - reserve) / projektion) + (reserve > 0 ? 1 : 0)
      : 0
  };
}

module.exports = {
  GLOBALPHASE_VERSION,
  DATENSTAND_OFFEN,
  DATENSTAND_ABGESCHLOSSEN,
  DATENSTAND_TEILWEISE,
  DATENSTAND_FEHLGESCHLAGEN,
  DEFAULT_PROJEKTION_MS,
  MIN_GLOBAL_ANTEIL,
  globalPhaseEnabled,
  projektionsBudgetMs,
  planGlobaleQuellen,
  abrufwegeVon,
  fehlendeQuellen,
  budgetAufteilung,
  datenstandNeu,
  datenstandVersiegeln,
  datenstandVerwendbar,
  datenstandFrisch,
  mandatsphaseBereit,
  datenstandVermerk,
  kapazitaetsSimulation
};
