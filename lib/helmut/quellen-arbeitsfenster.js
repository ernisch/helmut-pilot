"use strict";

// Regelmaessige Quellenarbeit im bestehenden Cron. Alle Mengen werden VOR Arbeit
// ueber dieselbe atomare Anbieter-RPC global reserviert. Kein eigener Zaehlerdienst,
// kein Ruecksetzen und keine Rueckgabe nach unklarem Ausgang. Teilreservierungen
// bleiben konservativ verbraucht. Modellbudgets werden hier weder ersetzt noch erhoeht.
const crypto = require("crypto");
const { AsyncLocalStorage } = require("node:async_hooks");
const tagesbetrieb = require("./quellen-tagesbetrieb");
const FENSTER_SEKUNDEN = 300; // vercel.json api/index.js maxDuration, im Vertrag getestet
const MAX_FENSTER = 8;
// Isolierter Betreiber-Ausnahmeentwurf: nur nach gesondertem GO ausrollen.
// Einmalige, globale Zusatzreservierung; normale Tagesverbraeuche bleiben stehen.
const EINMALAUSNAHME = Object.freeze({ tag: "2026-11-14", grund: "fachthemen-reparatur-v1",
  schluessel: "quellenarbeit|fachthemen-reparatur-v1", fenster: 9, sekunden: 2700, originale: 32 });
// Gesondert beauftragter echter Produktnachweis. Ein weiterer einziger Lauf,
// nachdem das neunte Fenster vollstaendig gebucht wurde; kein neues Geldlimit.
const ECHTNACHWEIS = Object.freeze({ tag: "2026-11-14", grund: "briefing-echtnachweis-v1",
  abMs: Date.parse("2026-11-14T21:20:00.000Z"),
  schluessel: "quellenarbeit|briefing-echtnachweis-v1", fenster: 10, sekunden: 3000, originale: 32 });
// Erneutes Betreiber-GO am15Nov: genau ein Abschlussfenster im bestehenden
// Adminweg. Keine weiteren HTML-Originale, kein neues Geldlimit oder Cronrecht.
const QUELLENABSCHLUSS = Object.freeze({ tag: "2026-11-15", grund: "quellenabschluss-v1",
  abMs: Date.parse("2026-11-15T18:43:00.000Z"),
  schluessel: "quellenarbeit|quellenabschluss-v1", fenster: 9, sekunden: 2700, originale: 16 });
// Ausdrueckliches Betreiber-GO am17Nov: genau ein zusaetzliches Abschlussfenster.
// Gleiche Original- und Geldgrenzen; kein Reset und keine Erlaubnis fuer Folgetage.
const OPERATORABSCHLUSS = Object.freeze({ tag: "2026-11-17", grund: "operatorabschluss-20261117",
  abMs: Date.parse("2026-11-17T09:16:00.000Z"),
  schluessel: "quellenarbeit|operatorabschluss-20261117", fenster: 9, sekunden: 2700, originale: 16 });
// Einziger Ersatz des echt quittierten Vor-Worker-Fehlstarts; keine UNKNOWN-Kompensation.
const OPERATORERSATZ = Object.freeze({ tag: "2026-11-17", grund: "operatorreadback-20261117",
  abMs: Date.parse("2026-11-17T09:47:00.000Z"),
  schluessel: "quellenarbeit|operatorreadback-20261117", fenster: 10, sekunden: 3000, originale: 16 });
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
  // kontrolliert auf. Auch das letzte zulässige Quellenfenster endet vor der Lage.
  if (!Number.isFinite(zeit.getTime()) || h < 3 || h >= 5 || zeit.getUTCMinutes() % 15 >= 5) return null;
  const minute = Math.floor(zeit.getUTCMinutes() / 15) * 15;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function altarbeitSlot(slot, ganztags = false) {
  if (ganztags) return typeof slot === "string" && slot.endsWith(":30");
  return slot === "03:30" || slot === "04:30";
}

function wartezeitFuerAltenTerminauftrag(faelligAm) {
  const kontext = originalKontext.getStore();
  if (!kontext?.tagesbetrieb) return 0;
  const jetzt = kontext.now(), heute = tagesbetrieb.zeiten(jetzt);
  if (!heute || jetzt >= heute.redaktionsschluss) return 0;
  const auftragsTag = tagesbetrieb.zeiten(Date.parse(faelligAm));
  return auftragsTag && auftragsTag.redaktionsschluss < heute.redaktionsschluss ? heute.frist - jetzt : 0;
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

async function reserviereOriginal({ env = process.env, deps = {}, pflichtOriginal = false } = {}) {
  if (!aktiv(env)) return { erlaubt: true, geprueft: false, grund: "arbeitsfenster-aus" };
  const g = grenzen(env);
  if (!g.gueltig) return { erlaubt: false, geprueft: false, grund: "arbeitslimits-ungueltig", wartenMs: 60000 };
  const kontext = originalKontext.getStore();
  const zeit = kontext?.tagesbetrieb ? kontext.now() : null;
  if (zeit !== null && !freigabeGueltig(kontext.freigabe, zeit))
    return { erlaubt: false, geprueft: true, grund: "originalfenster-abgelaufen", wartenMs: 60000 };
  const vorRedaktionsschluss = zeit !== null && zeit < tagesbetrieb.zeiten(zeit)?.redaktionsschluss;
  // Dieselbe atomare Tageszeile trägt die Reserve: allgemeine Originale können
  // vor dem Schnitt höchstens das erste Viertel der vorhandenen Grenze belegen.
  const limit = vorRedaktionsschluss && !pflichtOriginal ? Math.floor(g.originale / 4) : g.originale;
  if (limit === 0) return { erlaubt: false, geprueft: true, grund: "arbeitslimit-tagesgrenze",
    wartenMs: tagesbetrieb.zeiten(zeit).redaktionsschluss - zeit };
  const normal = await reserviere(SCHLUESSEL.originale, 1, limit, deps);
  // Die Buchung bleibt verbraucht. Ein verspätetes OK startet keinen Abruf.
  if (normal.erlaubt && zeit !== null && !freigabeGueltig(kontext.freigabe, kontext.now()))
    return { erlaubt: false, geprueft: true, grund: "originalfenster-abgelaufen", wartenMs: 60000 };
  if (vorRedaktionsschluss && !pflichtOriginal && normal.grund === "arbeitslimit-tagesgrenze")
    return { ...normal, wartenMs: tagesbetrieb.zeiten(zeit).redaktionsschluss - zeit };
  if (normal.erlaubt || normal.geprueft !== true || normal.grund !== "arbeitslimit-tagesgrenze"
    || g.originale !== 16) return normal;
  // Erst NACH dem await pruefen: eine inzwischen beendete Arbeit/Deadline gibt
  // haengenden Unteraufrufen kein Recht auf weitere Originalabrufe.
  if (!originalAusnahmeGueltig(kontext)) return normal;
  const extra = await reserviere(SCHLUESSEL.originale, 1, EINMALAUSNAHME.originale, deps);
  // Ein waehrend der RPC abgelaufenes Recht wird nicht als Abrufrecht quittiert.
  // Die ggf. bestaetigte Zusatzbuchung bleibt trotzdem konservativ verbraucht.
  return extra.erlaubt && !originalAusnahmeGueltig(kontext)
    ? { ...extra, erlaubt: false, grund: "originalausnahme-abgelaufen" } : extra;
}
function originalAusnahmeGueltig(kontext) {
  const ausnahme = [EINMALAUSNAHME, ECHTNACHWEIS].find(a => a.grund === kontext?.grund);
  if (!ausnahme || kontext.tag !== ausnahme.tag) return false;
  let jetzt;
  try { jetzt = kontext.now(); } catch { return false; }
  return Number.isFinite(jetzt) && jetzt >= kontext.freigabe.startMs
    && new Date(jetzt).toISOString().slice(0, 10) === ausnahme.tag
    && freigabeGueltig(kontext.freigabe, jetzt);
}

async function echtNachweisVorstand(tag, deps) {
  try {
    const keys = [SCHLUESSEL.fenster, SCHLUESSEL.sekunden, SCHLUESSEL.originale,
      EINMALAUSNAHME.schluessel, ECHTNACHWEIS.schluessel];
    const request = deps.request || require("./storage").supabaseRequest;
    const rows = await request("/rest/v1/helmut_anbieter_fenster?schluessel=in."
      + encodeURIComponent("(" + keys.join(",") + ")") + "&fensterart=eq.tag&fenster_start=eq."
      + encodeURIComponent(tag + "T00:00:00Z") + "&select=schluessel,verbraucht&limit=6");
    if (!Array.isArray(rows) || rows.length < 4 || rows.length > 5
      || rows.some(r => !r || !keys.includes(r.schluessel) || !Number.isSafeInteger(r.verbraucht)
        || r.verbraucht < 0) || new Set(rows.map(r => r.schluessel)).size !== rows.length) return false;
    const stand = new Map(rows.map(r => [r.schluessel, r.verbraucht]));
    return stand.get(SCHLUESSEL.fenster) === EINMALAUSNAHME.fenster
      && stand.get(SCHLUESSEL.sekunden) === EINMALAUSNAHME.sekunden
      && stand.get(EINMALAUSNAHME.schluessel) === 1
      && Number.isSafeInteger(stand.get(SCHLUESSEL.originale))
      && stand.get(SCHLUESSEL.originale) <= ECHTNACHWEIS.originale
      && (!stand.has(ECHTNACHWEIS.schluessel) || stand.get(ECHTNACHWEIS.schluessel) === 0);
  } catch { return false; }
}

async function operatorFehlstartVorstand(tag, deps) {
  try {
    const request = deps.request || require("./storage").supabaseRequest;
    const keys = [SCHLUESSEL.fenster, SCHLUESSEL.sekunden, SCHLUESSEL.originale,
      OPERATORABSCHLUSS.schluessel, OPERATORERSATZ.schluessel];
    const rows = await request("/rest/v1/helmut_anbieter_fenster?schluessel=in."
      + encodeURIComponent("(" + keys.join(",") + ")") + "&fensterart=eq.tag&fenster_start=eq."
      + encodeURIComponent(tag + "T00:00:00Z") + "&select=schluessel,verbraucht&limit=6");
    if (!Array.isArray(rows) || rows.length < 4 || rows.length > 5
      || rows.some(r => !r || !keys.includes(r.schluessel) || !Number.isSafeInteger(r.verbraucht)
        || r.verbraucht < 0) || new Set(rows.map(r => r.schluessel)).size !== rows.length) return false;
    const stand = new Map(rows.map(r => [r.schluessel, r.verbraucht]));
    if (stand.get(SCHLUESSEL.fenster) !== 9 || stand.get(SCHLUESSEL.sekunden) !== 2700
      || stand.get(OPERATORABSCHLUSS.schluessel) !== 1 || !stand.has(SCHLUESSEL.originale)
      || stand.get(SCHLUESSEL.originale) > 16 || (stand.get(OPERATORERSATZ.schluessel) || 0) !== 0) return false;
    const run = await request("/rest/v1/process_runs?run_id=eq.admin-quellen-2026-11-17-5d84f123-2e13-4163-a6f9-4b6e2d82827b"
      + "&process=eq.warteschlange-crawl&select=status,target_count,processed_count,failed_count,reason,error_class,commit_ref,started_at,finished_at&limit=2");
    if (!Array.isArray(run) || run.length !== 1) return false;
    const r = run[0];
    if (r?.status !== "failed" || r.target_count !== 0 || r.processed_count !== 0 || r.failed_count !== 0
      || r.reason !== "operator-planung-nicht-bestaetigt" || r.error_class !== "planung-nicht-bestaetigt"
      || r.commit_ref !== "3e174583dc8a8c66a3e129a7df57ce0ac9706f66"
      || Date.parse(r.started_at) !== Date.parse("2026-11-17T09:43:16.581Z")
      || Date.parse(r.finished_at) !== Date.parse("2026-11-17T09:43:19.390Z")) return false;
    const id = "89dd9752-f517-40d0-ba72-d32beeb1c772";
    const job = await request("/rest/v1/helmut_jobs?id=eq." + id
      + "&job_type=eq.source_fetch&tenant_id=is.null&status=eq.wartend&attempts=eq.0"
      + "&idempotency_key=eq." + encodeURIComponent("source_fetch|geteilt|c3152336a40919745fd39b17b819a230|2026-11-17T00Z")
      + "&select=id&limit=2");
    return Array.isArray(job) && job.length === 1 && job[0]?.id === id;
  } catch { return false; }
}

function freigabeGueltig(freigabe, jetztMs = Date.now()) {
  return Boolean(freigabe && freigaben.has(freigabe) && jetztMs < freigabe.endeMs);
}

async function fuehreAus({ env = process.env, deps = {}, arbeit, adminAuftrag = null, ganztags = false, vorAdminReservierung = null } = {}) {
  if (!aktiv(env)) return stopp("arbeitsfenster-aus");
  const skalierbar = require("./scalable-pipeline");
  if (!skalierbar.skalierbarerPfadAktiv(env)) return stopp("arbeitsfenster-ohne-warteschlange");
  const modus = String(env.HELMUT_JOB_DISPATCH_MODE || "off").trim().toLowerCase();
  if (!["off", "shadow"].includes(modus)) return stopp("arbeitsfenster-erfordert-cron-antrieb");
  const basis = grenzen(env);
  const g = basis.gueltig && ganztags
    ? { ...basis, fenster: tagesbetrieb.MAX_FENSTER, sekunden: tagesbetrieb.MAX_FENSTER * FENSTER_SEKUNDEN }
    : basis;
  if (!g.gueltig) return stopp("arbeitslimits-ungueltig");
  const now = deps.now || Date.now;
  const startMs = now();
  const tag = new Date(startMs).toISOString().slice(0, 10);
  const adminAusnahme = tag === OPERATORABSCHLUSS.tag && startMs >= OPERATORABSCHLUSS.abMs
    ? OPERATORABSCHLUSS : tag === QUELLENABSCHLUSS.tag && startMs >= QUELLENABSCHLUSS.abMs
    ? QUELLENABSCHLUSS : tag === EINMALAUSNAHME.tag ? EINMALAUSNAHME : null;
  // Ausschliesslich ein autorisierter Admin- oder Cron-Operator-Einstieg uebergibt diesen Auftrag.
  // Tagesbindung verhindert, dass eine Wiederzustellung morgen erneut Arbeit ausloest.
  if (adminAuftrag && (!require("./quellen-adminstart").auftragGueltig(adminAuftrag)
      || adminAuftrag.tag !== tag)) return stopp("adminauftrag-ungueltig-oder-abgelaufen");
  if (adminAuftrag && startMs + FENSTER_SEKUNDEN * 1000 >= Date.parse(`${tag}T00:00:00Z`) + 86400000) {
    return stopp("adminauftrag-tagesende");
  }
  const zeitfenster = ms => ganztags ? tagesbetrieb.quellenslot(ms)?.slot : slotFuerZeit(ms);
  const slot = adminAuftrag ? `admin|${tag}|${adminAuftrag.auftragId}` : zeitfenster(startMs);
  const regulaererStartslot = ganztags ? zeitfenster(startMs) : null;
  if (!slot) return stopp("ausserhalb-quellenarbeitsfenster");
  // Eine ausdrueckliche Wiederaufnahme nutzt nur regulaere 24h-Quellenslots.
  // Kein Recht waehrend der Redaktionspause oder ausserhalb der Startfrist.
  if (ganztags && adminAuftrag && !zeitfenster(startMs)) return stopp("ausserhalb-quellenarbeitsfenster");
  const zeitGueltig = () => now() - startMs < 60000 && (adminAuftrag
    ? new Date(now()).toISOString().slice(0, 10) === tag
      && (!ganztags || zeitfenster(now()) === regulaererStartslot) : zeitfenster(now()) === slot);
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
    // Frische Vorwerte erst UNTER derselben globalen Lease lesen. Bei Ablehnung
    // weder einen Einmalslot noch Fenster/Sekunden verbuchen.
    if (ganztags && adminAuftrag) {
      let vorflug;
      try { vorflug = await vorAdminReservierung?.(); } catch (_) { vorflug = null; }
      if (vorflug?.bereit !== true) return stopp("wiederaufnahme-vorstand-nicht-bestaetigt");
    }
    if (!adminAuftrag) {
      const bedarf = await (deps.automatik || require("./quellen-automatik").pruefe)({ env, now });
      if (bedarf?.erlaubt !== true) return stopp(bedarf?.grund || "automatik-unbekannt");
    }
    if (!zeitGueltig()) return stopp("arbeitsfenster-vorbereitung-zu-lang");
    // Feste Slot-Schluessel, tagesweise in der bestehenden DB-RPC. Mehrfache
    // Zustellung kann keinen zweiten Drain desselben 15-Minuten-Fensters starten.
    for (const [key, menge, limit] of [
      [`quellenarbeit|slot|${slot}`, 1, 1],
      [SCHLUESSEL.fenster, 1, g.fenster],
      [SCHLUESSEL.sekunden, FENSTER_SEKUNDEN, g.sekunden]
    ]) {
      if (einmalausnahme && !zeitGueltig()) return stopp("arbeitsfenster-vorbereitung-zu-lang", { einmalausnahme });
      let r = await reserviere(key, menge, key === SCHLUESSEL.sekunden ? reservierteGrenzen.sekunden : limit, deps);
      if (!r.erlaubt && r.geprueft === true && r.grund === "arbeitslimit-tagesgrenze"
        && key === SCHLUESSEL.fenster && adminAuftrag && adminAusnahme
        && g.fenster === MAX_FENSTER && g.sekunden === MAX_FENSTER * FENSTER_SEKUNDEN && g.originale === 16) {
        if (!zeitGueltig()) return stopp("arbeitsfenster-vorbereitung-zu-lang");
        let ausnahme = adminAusnahme;
        let extra = await reserviere(ausnahme.schluessel, 1, 1, deps);
        // Ein bloess verbrauchter alter Zusatzkey kann auch Teilreservierung
        // bedeuten. Nur der enge bestaetigte 9/2700-Vorstand erlaubt den neuen Key.
        if (!extra.erlaubt && extra.geprueft === true && extra.grund === "arbeitslimit-tagesgrenze"
          && tag === ECHTNACHWEIS.tag && startMs >= ECHTNACHWEIS.abMs) {
          if (!await echtNachweisVorstand(tag, deps)) return stopp("echtlauf-vorstand-nicht-bestaetigt",
            { limit: ECHTNACHWEIS.schluessel, geprueft: false });
          if (!zeitGueltig()) return stopp("arbeitsfenster-vorbereitung-zu-lang");
          ausnahme = ECHTNACHWEIS;
          extra = await reserviere(ausnahme.schluessel, 1, 1, deps);
        }
        if (!extra.erlaubt && extra.geprueft === true && extra.grund === "arbeitslimit-tagesgrenze"
          && tag === OPERATORERSATZ.tag && startMs >= OPERATORERSATZ.abMs) {
          if (!await operatorFehlstartVorstand(tag, deps)) return stopp(extra.grund,
            { limit: ausnahme.schluessel, geprueft: false });
          if (!zeitGueltig()) return stopp("arbeitsfenster-vorbereitung-zu-lang");
          ausnahme = OPERATORERSATZ;
          extra = await reserviere(ausnahme.schluessel, 1, 1, deps);
        }
        if (!extra.erlaubt) return stopp(extra.grund,
          { limit: ausnahme.schluessel, wartenMs: extra.wartenMs, geprueft: extra.geprueft });
        einmalausnahme = { tag, grund: ausnahme.grund, reservierungBestaetigt: true,
          normaleGrenzen: { fenster: g.fenster, sekunden: g.sekunden, originale: g.originale } };
        reservierteGrenzen = { ...g, fenster: ausnahme.fenster, sekunden: ausnahme.sekunden,
          originale: ausnahme.originale };
        if (!zeitGueltig()) return stopp("arbeitsfenster-vorbereitung-zu-lang", { einmalausnahme });
        // Auch die Zusatzfenster werden in den bestehenden globalen Zaehler
        // gebucht. Keine Kompensation bei Teilverbrauch oder unbekannter Antwort.
        r = await reserviere(key, menge, reservierteGrenzen.fenster, deps);
      }
      if (!r.erlaubt) return stopp(r.grund, { limit: key, wartenMs: r.wartenMs,
        geprueft: r.geprueft, ...(einmalausnahme ? { einmalausnahme } : {}) });
    }
    if (!zeitGueltig()) return stopp("arbeitsfenster-vorbereitung-zu-lang", einmalausnahme ? { einmalausnahme } : {});
    const tagesSlot = ganztags && tagesbetrieb.quellenslot(startMs);
    freigabe = Object.freeze({ slot, startMs, endeMs: startMs + FENSTER_SEKUNDEN * 1000,
      ...(tagesSlot ? { ganztags: true, pflicht: tagesSlot.pflicht, nurPflichtanalyse: tagesSlot.nurPflichtanalyse } : {}) });
    freigaben.add(freigabe);
    arbeitBegonnen = true;
    const starteArbeit = () => arbeit({ freigabe, startMs });
    const ergebnis = await (einmalausnahme || ganztags ? originalKontext.run(Object.freeze({ freigabe, now,
      tag, grund: einmalausnahme?.grund, tagesbetrieb: ganztags }), starteArbeit) : starteArbeit());
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

module.exports = { aktiv, grenzen, slotFuerZeit, altarbeitSlot, reserviereOriginal, fuehreAus, freigabeGueltig,
  wartezeitFuerAltenTerminauftrag, FENSTER_SEKUNDEN, MAX_FENSTER, SCHLUESSEL };
