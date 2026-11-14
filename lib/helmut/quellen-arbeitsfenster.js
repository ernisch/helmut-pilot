"use strict";

// Regelmaessige Quellenarbeit im bestehenden Cron. Alle Mengen werden VOR Arbeit
// ueber dieselbe atomare Anbieter-RPC global reserviert. Kein eigener Zaehlerdienst,
// kein Ruecksetzen und keine Rueckgabe nach unklarem Ausgang. Teilreservierungen
// bleiben konservativ verbraucht. Modellbudgets werden hier weder ersetzt noch erhoeht.
const crypto = require("crypto");
const { AsyncLocalStorage } = require("node:async_hooks");
const FENSTER_SEKUNDEN = 300; // vercel.json api/index.js maxDuration, im Vertrag getestet
const MAX_FENSTER = 8;
// Isolierter Betreiber-Ausnahmeentwurf: nur nach gesondertem GO ausrollen.
// Einmalige, globale Zusatzreservierung; normale Tagesverbraeuche bleiben stehen.
const EINMALAUSNAHME = Object.freeze({ tag: "2026-11-14", grund: "fachthemen-reparatur-v1",
  schluessel: "quellenarbeit|fachthemen-reparatur-v1", fenster: 9, sekunden: 2700, originale: 32 });
// Nur Autoritaetsweitergabe im bestaetigten Zusatzfenster, kein Quotenzaehler.
const originalKontext = new AsyncLocalStorage();
const SCHLUESSEL = Object.freeze({
  fenster: "quellenarbeit|fenster",
  sekunden: "quellenarbeit|reservierte-sekunden",
  originale: "quellenarbeit|originalabrufe"
});
// Nur lokale Weitergabe einer bereits bestaetigten DB-Freigabe, KEIN Kontingentzaehler.
const freigaben = new WeakSet();

const { aktiv } = require("./quellen-arbeitsfenster-aktiv");

function positiveGanzzahl(env, name, maximum) {
  const roh = String(env[name] ?? "").trim();
  const n = Number(roh);
  return roh && Number.isSafeInteger(n) && n > 0 && n <= maximum ? n : null;
}

function grenzen(env = process.env) {
  const fenster = positiveGanzzahl(env, "HELMUT_QUELLEN_FENSTER_TAG", MAX_FENSTER);
  const sekunden = positiveGanzzahl(env, "HELMUT_QUELLEN_SEKUNDEN_TAG", MAX_FENSTER * FENSTER_SEKUNDEN);
  const originale = positiveGanzzahl(env, "HELMUT_ORIGINALABRUFE_TAG", 2147483647);
  return { gueltig: Boolean(fenster && sekunden >= FENSTER_SEKUNDEN && originale), fenster, sekunden, originale };
}

function slotFuerZeit(jetztMs) {
  const zeit = new Date(jetztMs);
  const h = zeit.getUTCHours();
  // Bis fuenf Minuten Zustellverzoegerung; danach faengt der naechste Termin
  // kontrolliert auf. Der letzte zugelassene Lauf endet vor dem 05:00-Briefing.
  if (!Number.isFinite(zeit.getTime()) || h < 3 || h >= 5 || zeit.getUTCMinutes() % 15 >= 5) return null;
  const minute = Math.floor(zeit.getUTCMinutes() / 15) * 15;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function stopp(grund, extra = {}) {
  return { ok: false, uebersprungen: true, verarbeitet: false, grund, ...extra };
}

async function reserviere(schluessel, menge, tagesgrenze, deps) {
  const fn = deps.reserviere || ((o) => require("./storage").anbieterReserviere(o));
  let r;
  try { r = await fn({ schluessel, menge, grenzeMinute: 0, grenzeTag: tagesgrenze }); }
  catch (_) { r = null; }
  if (!r || r.verfuegbar !== true || typeof r.erlaubt !== "boolean") {
    return { erlaubt: false, geprueft: false, grund: "arbeitslimit-nicht-pruefbar", wartenMs: 60000 };
  }
  return {
    erlaubt: r.erlaubt === true, geprueft: true,
    grund: r.erlaubt ? "reserviert" : `arbeitslimit-${r.grund || "abgelehnt"}`,
    wartenMs: r.erlaubt ? 0 : Math.max(1000, Number(r.fruehesteMs) || 60000)
  };
}

async function reserviereOriginal({ env = process.env, deps = {} } = {}) {
  if (!aktiv(env)) return { erlaubt: true, geprueft: false, grund: "arbeitsfenster-aus" };
  const g = grenzen(env);
  if (!g.gueltig) return { erlaubt: false, geprueft: false, grund: "arbeitslimits-ungueltig", wartenMs: 60000 };
  const normal = await reserviere(SCHLUESSEL.originale, 1, g.originale, deps);
  if (normal.erlaubt || normal.geprueft !== true || normal.grund !== "arbeitslimit-tagesgrenze"
    || g.originale !== 16) return normal;
  // Erst NACH dem await pruefen: eine inzwischen beendete Arbeit/Deadline gibt
  // haengenden Unteraufrufen kein Recht auf weitere Originalabrufe.
  const kontext = originalKontext.getStore();
  if (!originalAusnahmeGueltig(kontext)) return normal;
  const extra = await reserviere(SCHLUESSEL.originale, 1, EINMALAUSNAHME.originale, deps);
  // Ein waehrend der RPC abgelaufenes Recht wird nicht als Abrufrecht quittiert.
  // Die ggf. bestaetigte Zusatzbuchung bleibt trotzdem konservativ verbraucht.
  return extra.erlaubt && !originalAusnahmeGueltig(kontext)
    ? { ...extra, erlaubt: false, grund: "originalausnahme-abgelaufen" } : extra;
}
function originalAusnahmeGueltig(kontext) {
  if (!kontext || kontext.grund !== EINMALAUSNAHME.grund || kontext.tag !== EINMALAUSNAHME.tag) return false;
  let jetzt;
  try { jetzt = kontext.now(); } catch { return false; }
  return Number.isFinite(jetzt) && jetzt >= kontext.freigabe.startMs
    && new Date(jetzt).toISOString().slice(0, 10) === EINMALAUSNAHME.tag
    && freigabeGueltig(kontext.freigabe, jetzt);
}

function freigabeGueltig(freigabe, jetztMs = Date.now()) {
  return Boolean(freigabe && freigaben.has(freigabe) && jetztMs < freigabe.endeMs);
}

async function fuehreAus({ env = process.env, deps = {}, arbeit, adminAuftrag = null } = {}) {
  if (!aktiv(env)) return stopp("arbeitsfenster-aus");
  const skalierbar = require("./scalable-pipeline");
  if (!skalierbar.skalierbarerPfadAktiv(env)) return stopp("arbeitsfenster-ohne-warteschlange");
  const modus = String(env.HELMUT_JOB_DISPATCH_MODE || "off").trim().toLowerCase();
  if (!["off", "shadow"].includes(modus)) return stopp("arbeitsfenster-erfordert-cron-antrieb");
  const g = grenzen(env);
  if (!g.gueltig) return stopp("arbeitslimits-ungueltig");
  const now = deps.now || Date.now;
  const startMs = now();
  const tag = new Date(startMs).toISOString().slice(0, 10);
  // Ausschliesslich der sessiongeschuetzte Admin-Einstieg uebergibt diesen Auftrag.
  // Tagesbindung verhindert, dass eine Wiederzustellung morgen erneut Arbeit ausloest.
  if (adminAuftrag && (!require("./quellen-adminstart").auftragGueltig(adminAuftrag)
      || adminAuftrag.tag !== tag)) return stopp("adminauftrag-ungueltig-oder-abgelaufen");
  if (adminAuftrag && startMs + FENSTER_SEKUNDEN * 1000 >= Date.parse(`${tag}T00:00:00Z`) + 86400000) {
    return stopp("adminauftrag-tagesende");
  }
  const slot = adminAuftrag ? `admin|${tag}|${adminAuftrag.auftragId}` : slotFuerZeit(startMs);
  if (!slot) return stopp("ausserhalb-quellenarbeitsfenster");
  const zeitGueltig = () => now() - startMs < 60000 && (adminAuftrag
    ? new Date(now()).toISOString().slice(0, 10) === tag : slotFuerZeit(now()) === slot);
  // Derselbe systemweite Slot wie beim alten Weckverbraucher. Explizit auf eins
  // geklemmt: eine groessere optionale Umgebung darf das Fenster nicht parallelisieren.
  const klassen = deps.klassen || skalierbar.klassenAdapter({
    env: { ...env, HELMUT_KLASSE_WORKER_DRAIN_MAX: "1" }, owner: `quellenfenster-${crypto.randomUUID()}`
  });
  if (!klassen) return stopp("klassengrenzen-aus");
  let lease;
  try { lease = await klassen.belege("worker-drain", { ttlMs: (FENSTER_SEKUNDEN + 60) * 1000 }); }
  catch (_) { return stopp("arbeitsfenster-sperre-unbekannt"); }
  if (!lease || lease.erlaubt !== true || !lease.slot) return stopp("arbeitsfenster-belegt-oder-unbekannt");
  let freigabe;
  let arbeitBegonnen = false;
  let reservierteGrenzen = g, einmalausnahme = null;
  try {
    // Vorab erkennbare Nichtbereitschaft darf noch kein Tageskontingent binden.
    // Der vorhandene Worker-Vorflug liest nur; Planung/Enqueue/Claim bleiben
    // hinter der vollstaendigen Reservierung. Rueckstand allein sperrt nicht.
    let bereitschaft;
    try { bereitschaft = await (deps.bereitschaft || (() => require("./worker-betrieb").readiness({ env })))(); }
    catch (_) { return stopp("arbeitsfenster-vorflug-nicht-bereit"); }
    if (bereitschaft?.bereit !== true) return stopp("arbeitsfenster-vorflug-nicht-bereit");
    if (!adminAuftrag) {
      const bedarf = await (deps.automatik || require("./quellen-automatik").pruefe)({ env, now });
      if (bedarf?.erlaubt !== true) return stopp(bedarf?.grund || "automatik-unbekannt");
    }
    if (!zeitGueltig()) return stopp("arbeitsfenster-vorbereitung-zu-lang");
    // Feste acht Slot-Schluessel, tagesweise in der bestehenden DB-RPC. Mehrfache
    // Zustellung kann keinen zweiten Drain desselben 15-Minuten-Fensters starten.
    for (const [key, menge, limit] of [
      [`quellenarbeit|slot|${slot}`, 1, 1],
      [SCHLUESSEL.fenster, 1, g.fenster],
      [SCHLUESSEL.sekunden, FENSTER_SEKUNDEN, g.sekunden]
    ]) {
      if (einmalausnahme && !zeitGueltig()) return stopp("arbeitsfenster-vorbereitung-zu-lang", { einmalausnahme });
      let r = await reserviere(key, menge, key === SCHLUESSEL.sekunden ? reservierteGrenzen.sekunden : limit, deps);
      if (!r.erlaubt && r.geprueft === true && r.grund === "arbeitslimit-tagesgrenze"
        && key === SCHLUESSEL.fenster && adminAuftrag && tag === EINMALAUSNAHME.tag
        && g.fenster === MAX_FENSTER && g.sekunden === MAX_FENSTER * FENSTER_SEKUNDEN && g.originale === 16) {
        if (!zeitGueltig()) return stopp("arbeitsfenster-vorbereitung-zu-lang");
        const extra = await reserviere(EINMALAUSNAHME.schluessel, 1, 1, deps);
        if (!extra.erlaubt) return stopp(extra.grund,
          { limit: EINMALAUSNAHME.schluessel, wartenMs: extra.wartenMs, geprueft: extra.geprueft });
        einmalausnahme = { tag, grund: EINMALAUSNAHME.grund, reservierungBestaetigt: true,
          normaleGrenzen: { fenster: g.fenster, sekunden: g.sekunden, originale: g.originale } };
        reservierteGrenzen = { ...g, fenster: EINMALAUSNAHME.fenster, sekunden: EINMALAUSNAHME.sekunden,
          originale: EINMALAUSNAHME.originale };
        if (!zeitGueltig()) return stopp("arbeitsfenster-vorbereitung-zu-lang", { einmalausnahme });
        // Auch das neunte Fenster wird in den bestehenden globalen Zaehler
        // gebucht. Keine Kompensation bei Teilverbrauch oder unbekannter Antwort.
        r = await reserviere(key, menge, reservierteGrenzen.fenster, deps);
      }
      if (!r.erlaubt) return stopp(r.grund, { limit: key, wartenMs: r.wartenMs,
        geprueft: r.geprueft, ...(einmalausnahme ? { einmalausnahme } : {}) });
    }
    if (!zeitGueltig()) return stopp("arbeitsfenster-vorbereitung-zu-lang", einmalausnahme ? { einmalausnahme } : {});
    freigabe = Object.freeze({ slot, startMs, endeMs: startMs + FENSTER_SEKUNDEN * 1000 });
    freigaben.add(freigabe);
    arbeitBegonnen = true;
    const starteArbeit = () => arbeit({ freigabe, startMs });
    const ergebnis = await (einmalausnahme ? originalKontext.run(Object.freeze({ freigabe, now,
      tag, grund: EINMALAUSNAHME.grund }), starteArbeit) : starteArbeit());
    return { ...ergebnis, arbeitsfenster: { slot, reservierteSekunden: FENSTER_SEKUNDEN, grenzen: reservierteGrenzen,
      ...(einmalausnahme ? { einmalausnahme } : {}) } };
  } finally {
    if (freigabe) freigaben.delete(freigabe);
    // Promise-Zeitlimits beenden nicht jedes IO. Nach Arbeitsbeginn bleibt die
    // Lease deshalb bis ueber die volle Plattformfrist erhalten, auch bei Fehler.
    // Ihr regulaerer Ablauf liegt deutlich vor dem naechsten 15-Minuten-Termin.
    if (!arbeitBegonnen) await Promise.resolve(klassen.gebeFrei(lease.slot)).catch(() => null);
  }
}

module.exports = { aktiv, grenzen, slotFuerZeit, reserviereOriginal, fuehreAus, freigabeGueltig,
  FENSTER_SEKUNDEN, MAX_FENSTER, SCHLUESSEL };
