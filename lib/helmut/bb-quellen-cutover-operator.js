"use strict";

// Helmut — Quellen-Cutover-Operator fuer die zwei vorbereiteten BE/BB-Landespfade.
// =============================================================================================
// EIN separater, standardmaessig AUSgeschalteter Operatorpfad
//   Flag: HELMUT_BB_QUELLEN_CUTOVER_OPERATOR (Code-Default 0 = aus)
//   HTTP: POST-only, ausschliesslich per Bearer-HELMUT_ADMIN_SECRET (kein ?secret=, kein CRON)
// Er ist bewusst KEIN generischer Quellen-Editor, sondern ein fest verdrahteter
// Zustandsuebergang fuer GENAU zwei Landespakete und GENAU zwei Landespfade.
//
// Aktionen (mehr gibt es nicht):
//   quellen-vorschau : rein lesend. Meldet Ist-Zustand und Zielerreichbarkeit (0 Writes).
//   quellen-cutover  : schaltet vorbereitet -> aktiv.  Verlangt exakt HELMUT_LANDESMODULE
//                      = berlin + brandenburg und die eigene (aktionsspezifische) Bestaetigung.
//   quellen-rueckbau : schaltet aktiv -> vorbereitet (Pfade VOR Paketen), eigene Bestaetigung.
//
// Scope — codefest, nicht erweiterbar (kein freier Request-Parameter):
//   Pakete (nur `status`):      pkg-berlin-basis, pkg-brandenburg-basis   prepared <-> active
//   Pfade  (nur `status`, `activation_mode`):
//                               rp-be-landesregierung,  rp-bb-landesparlament
//                               needs_review/manual <-> healthy/auto
// Weder Identitaet, Methode, URL, Parser, `query`, Publisher, Paketzuordnung noch irgendein
// anderes Feld werden veraendert. Der Request-Body darf ausschliesslich {action, confirmation}
// tragen; jede weitere Eigenschaft wird fail-closed abgelehnt (Profile, IDs, Status, Flags,
// URLs, Parser, Paketlinks, Crawls und Modelle sind NICHT ueber den Request steuerbar).

// CAS-PRECONDITION (Compare-And-Set, fail-closed).
// ---------------------------------------------------------------------------------------------
// Vor JEDEM Write prueft der Operator (a) genau EINE Zielzeile je Zieldatensatz, (b) genau die
// zwei erlaubten Paket-<->Pfad-Verknuepfungen und (c) dass die Zeile EXAKT die oeffentliche
// BE/BB-Konfiguration traegt (Publisher, legacy-Kennung, Methode, Abrufadresse, `query = NULL`
// und die eingefrorene Parser-Kennung — Identitaet/URL/Methode ueber die bestehenden, im Code
// der Quellenarchitektur eingefrorenen Erkennungsfunktionen). Weicht ein Wert ab
// (unbekannter/gemischter Zustand, gedriftete URL, fehlende/doppelte Zeile, fremde Verknuepfung),
// bricht der Operator OHNE Write ab ("fremder/unbekannter Zustand => 0 writes").
//
// Der Write selbst ist ebenfalls bedingt (der erwartete Vollzustand steckt im WHERE der
// DB-Aktualisierung) und wird nach JEDEM Write per Ruecklesung bestaetigt. Ein Teilfehler
// kompensiert ausschliesslich die eigenen, bestaetigten Aenderungen im festen Scope und
// meldet fail-closed.

const { BERLIN_SENATSQUELLEN, BRANDENBURG_LANDTAG_PRESSE,
  istBerlinerSenatsregierungPath, istBrandenburgLandtagspressePath } =
  require("./quellenarchitektur/source-mode");
const { VERSION: BERLIN_KETTE } = require("./berlin-senatsquellen-kette");
const { VERSION: BRANDENBURG_KETTE } = require("./brandenburg-landtag-presse-kette");
const { flagValue } = require("./flags");

const OPERATOR_FLAG = "HELMUT_BB_QUELLEN_CUTOVER_OPERATOR";
const LANDESMODUL_FLAG = "HELMUT_LANDESMODULE";

// Aktionsspezifische Bestaetigungen: die schreibenden Aktionen tragen je eine EIGENE, exakte
// Zeichenfolge; die rein lesende Vorschau verlangt keine. Die Bestaetigung der einen Aktion
// gilt NIE fuer die andere.
const BESTAETIGUNGEN = Object.freeze({
  "quellen-cutover": "BERLIN-BRANDENBURG-QUELLEN-CUTOVER-20261001",
  "quellen-rueckbau": "BERLIN-BRANDENBURG-QUELLEN-RUECKBAU-20261001"
});
const ACTIONS = Object.freeze(["quellen-vorschau", "quellen-cutover", "quellen-rueckbau"]);
const SCHREIBENDE_ACTIONS = Object.freeze(Object.keys(BESTAETIGUNGEN));

// Der Cutover verlangt das Laenderflag EXAKT berlin,brandenburg (kein "*", kein "alle", kein
// zusaetzliches oder fehlendes Land). Der Rueckbau ist eine Sicherheitsaktion und verlangt es
// bewusst NICHT.
const LANDESMODUL_EXAKT = Object.freeze(["berlin", "brandenburg"]);

// Der Request-Body traegt NICHTS ausser Aktion + fester Bestaetigung.
const ERLAUBTE_PARAMETER = Object.freeze(["action", "confirmation", "bestaetigung"]);

const ZUSTAND_VORBEREITET = "vorher";
const ZUSTAND_AKTIV = "nachher";
const ZUSTAND_UNBEKANNT = "unbekannt";
const ZUSTAND_GEMISCHT = "gemischt";

const ZIEL_PAKETE = Object.freeze([
  Object.freeze({
    id: "pkg-berlin-basis", key: "berlin-basis", name: "Berlin Basis",
    statusVorher: "prepared", statusNachher: "active"
  }),
  Object.freeze({
    id: "pkg-brandenburg-basis", key: "brandenburg-basis", name: "Brandenburg Basis",
    statusVorher: "prepared", statusNachher: "active"
  })
]);

const ZIEL_PFADE = Object.freeze([
  Object.freeze({
    id: "rp-be-landesregierung",
    paketId: "pkg-berlin-basis",
    legacySourceId: BERLIN_SENATSQUELLEN.legacySourceId,
    publisherId: BERLIN_SENATSQUELLEN.publisherId,
    method: BERLIN_SENATSQUELLEN.method,
    urls: BERLIN_SENATSQUELLEN.urls,
    parser: BERLIN_KETTE,
    passt: istBerlinerSenatsregierungPath,
    statusVorher: "needs_review", activationModeVorher: "manual",
    statusNachher: "healthy", activationModeNachher: "auto"
  }),
  Object.freeze({
    id: "rp-bb-landesparlament",
    paketId: "pkg-brandenburg-basis",
    legacySourceId: BRANDENBURG_LANDTAG_PRESSE.legacySourceId,
    publisherId: BRANDENBURG_LANDTAG_PRESSE.publisherId,
    method: BRANDENBURG_LANDTAG_PRESSE.method,
    urls: Object.freeze([BRANDENBURG_LANDTAG_PRESSE.url]),
    parser: BRANDENBURG_KETTE,
    passt: istBrandenburgLandtagspressePath,
    statusVorher: "needs_review", activationModeVorher: "manual",
    statusNachher: "healthy", activationModeNachher: "auto"
  })
]);

const ZIEL_PAKET_IDS = Object.freeze(ZIEL_PAKETE.map((d) => d.id));
const ZIEL_PFAD_IDS = Object.freeze(ZIEL_PFADE.map((d) => d.id));

function flagAn(value) {
  return String(value || "").trim() === "1";
}

function operatorBereit(env = process.env) {
  return flagAn(env && env[OPERATOR_FLAG]);
}

// Laenderflag GENAU berlin,brandenburg? Unbekannte Zusatzwerte machen den Wert ungueltig
// (kein stilles Ignorieren). Reihenfolge/Leerraum der zwei Laender sind unerheblich.
function landesmodulFrei(env = process.env) {
  const raw = String(flagValue(LANDESMODUL_FLAG, env) || "").trim().toLowerCase();
  const teile = raw.split(/[,;\s]+/).filter(Boolean);
  return teile.length === LANDESMODUL_EXAKT.length
    && LANDESMODUL_EXAKT.every((land) => teile.includes(land));
}

function bestaetigungFuer(action) {
  return BESTAETIGUNGEN[action] || null;
}

// Die Bestaetigung muss zur AKTION passen. Die Vorschau (rein lesend) braucht keine.
function istBestaetigt(action, body) {
  const erwartet = bestaetigungFuer(action);
  if (!erwartet) return true;
  return String(body && (body.confirmation || body.bestaetigung) || "").trim() === erwartet;
}

// Jede Eigenschaft ausserhalb der Allowlist fuehrt zum Abbruch (kein freier Parameter).
function fremdeParameter(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  return Object.keys(body).filter((k) => !ERLAUBTE_PARAMETER.includes(k)).sort();
}

function antwort({ ok, action, detail = null, reason = null }) {
  return {
    ok,
    action,
    pakete: [...ZIEL_PAKET_IDS],
    pfade: [...ZIEL_PFAD_IDS],
    ...(reason ? { reason } : {}),
    ...(detail === null ? {} : { detail })
  };
}

// --- Klassifikation des Ist-Zustands (pro Zielzeile "vorher" | "nachher" | "unbekannt") -------
function paketZustand(def, row) {
  if (!row) return ZUSTAND_UNBEKANNT;
  if (String(row.key || "") !== def.key) return ZUSTAND_UNBEKANNT;
  const status = String(row.status || "");
  if (status === def.statusVorher) return ZUSTAND_VORBEREITET;
  if (status === def.statusNachher) return ZUSTAND_AKTIV;
  return ZUSTAND_UNBEKANNT;
}

function pfadZustand(def, row) {
  if (!row) return ZUSTAND_UNBEKANNT;
  // Die exakte oeffentliche BE/BB-Konfiguration ist Teil der Vorbedingung: nur eine Zeile,
  // die Identitaet, Publisher, Methode, Abrufadresse, `query = NULL` UND die eingefrorene
  // Parser-Kennung exakt traegt, ist ueberhaupt ein bekannter Zustand.
  if (!pfadIdentitaetPasst(def, row)) return ZUSTAND_UNBEKANNT;
  const status = String(row.status || "");
  const mode = String(row.activation_mode || "");
  if (status === def.statusVorher && mode === def.activationModeVorher) return ZUSTAND_VORBEREITET;
  if (status === def.statusNachher && mode === def.activationModeNachher) return ZUSTAND_AKTIV;
  return ZUSTAND_UNBEKANNT;
}

// Identitaet + feste Abrufkonfiguration. Identitaet/Methode/URL kommen ausschliesslich aus der
// eingefrorenen Erkennungsfunktion der Quellenarchitektur (keine zweite, driftende Kopie);
// zusaetzlich verlangt der Operator `query = NULL` und die eingefrorene Parser-Kennung.
function pfadIdentitaetPasst(def, row) {
  if (!row || typeof def.passt !== "function" || !def.passt(row)) return false;
  if (row.query !== null) return false;
  return String(row.parser || "") === def.parser;
}

function finde(rows, id) {
  return (Array.isArray(rows) ? rows : []).find((r) => r && String(r.id) === id) || null;
}

function zaehleId(rows, id) {
  return (Array.isArray(rows) ? rows : []).filter((r) => r && String(r.id) === id).length;
}

// Struktur-Vorbedingung: GENAU EINE Zeile je Ziel (Paket/Pfad) und GENAU DIE ZWEI erlaubten
// Paket-<->Pfad-Verknuepfungen. Fehlt/doppelt/fremd -> unbekannt (0 Writes).
function strukturPruefen(bestand = {}) {
  for (const def of ZIEL_PAKETE) {
    if (zaehleId(bestand.pakete, def.id) !== 1) return { ok: false, grund: "paketzeile-nicht-eindeutig", id: def.id };
  }
  for (const def of ZIEL_PFADE) {
    if (zaehleId(bestand.pfade, def.id) !== 1) return { ok: false, grund: "pfadzeile-nicht-eindeutig", id: def.id };
  }
  const links = Array.isArray(bestand.links) ? bestand.links : [];
  const erwartet = ZIEL_PFADE.map((def) => ({ package_id: def.paketId, retrieval_path_id: def.id }));
  const zielLinksVorhanden = erwartet.every((e) => links.filter((l) =>
    l && String(l.package_id) === e.package_id && String(l.retrieval_path_id) === e.retrieval_path_id).length === 1);
  if (!zielLinksVorhanden) return { ok: false, grund: "paketzuordnung-nicht-eindeutig" };
  // Die Zielpakete duerfen weitere vorbereitete/manuelle Wege enthalten. Vor
  // ihrer Aktivierung ist jedoch jeder davon zwingend zu lesen: ein fremder
  // `healthy/auto`-Weg waere sonst ein unbeabsichtigter weiterer Live-Pfad.
  const linkedPfade = Array.isArray(bestand.linkedPfade) ? bestand.linkedPfade : [];
  const linkedIds = [...new Set(links.map((link) => link && String(link.retrieval_path_id || "")).filter(Boolean))];
  for (const id of linkedIds) {
    const rows = linkedPfade.filter((row) => row && String(row.id) === id);
    if (rows.length !== 1) return { ok: false, grund: "gebundener-pfad-nicht-eindeutig", id };
    if (!ZIEL_PFAD_IDS.includes(id)
      && String(rows[0].status || "") === "healthy"
      && String(rows[0].activation_mode || "") === "auto") {
      return { ok: false, grund: "weiterer-aktiver-paketpfad", id };
    }
  }
  return { ok: true };
}

function klassifiziere(bestand = {}) {
  const struktur = strukturPruefen(bestand);
  const pakete = ZIEL_PAKETE.map((def) => {
    const row = finde(bestand.pakete, def.id);
    return { def, row, zustand: struktur.ok ? paketZustand(def, row) : ZUSTAND_UNBEKANNT };
  });
  const pfade = ZIEL_PFADE.map((def) => {
    const row = finde(bestand.pfade, def.id);
    return { def, row, zustand: struktur.ok ? pfadZustand(def, row) : ZUSTAND_UNBEKANNT };
  });
  const alle = [...pakete, ...pfade];
  const zustaende = new Set(alle.map((x) => x.zustand));
  let gesamt;
  if (!struktur.ok || zustaende.has(ZUSTAND_UNBEKANNT)) gesamt = ZUSTAND_UNBEKANNT; // Unbekannt dominiert
  else if (zustaende.size === 1) gesamt = [...zustaende][0];
  else gesamt = ZUSTAND_GEMISCHT;
  return { pakete, pfade, alle, gesamt, struktur };
}

function lageDetail(lage) {
  return {
    gesamt: lage.gesamt,
    pakete: lage.pakete.map((x) => ({ id: x.def.id, zustand: x.zustand, status: x.row ? x.row.status : null })),
    pfade: lage.pfade.map((x) => ({
      id: x.def.id,
      zustand: x.zustand,
      status: x.row ? x.row.status : null,
      activationMode: x.row ? x.row.activation_mode : null
    }))
  };
}

function failsafeGrund(gesamt) {
  return gesamt === ZUSTAND_UNBEKANNT ? "zustand-unbekannt" : "teilzustand";
}

// --- Lese-/Schreibplan -----------------------------------------------------------------------
async function sicherLesen(store) {
  try {
    return { ok: true, bestand: await store.leseZielbestand() };
  } catch (error) {
    return { ok: false, reason: "lesen-fehlgeschlagen" };
  }
}

// Der Schreibplan ist streng geordnet. CUTOVER: Pakete zuerst, danach Pfade.
// RUECKBAU: Pfade zuerst, danach Pakete (Pfade-vor-Pakete) — wird ein Weg deaktiviert,
// bevor sein Paket faellt, ist der Zwischenzustand in beiden Richtungen fail-safe, weil der
// relationale Plan manuelle/ungedeckte Wege ohnehin ausschliesst.
// Jeder Schritt traegt seinen Zielzustand fuer die Ruecklesung; die URL kommt aus der zuvor
// gelesenen, geprueften Zeile (voller CAS-Vorzustand), nicht aus einem freien Parameter.
function schreibplan(store, ziel, lage) {
  const richtung = (def, feld) => ({
    erwartet: ziel === ZUSTAND_AKTIV ? def[`${feld}Vorher`] : def[`${feld}Nachher`],
    neu: ziel === ZUSTAND_AKTIV ? def[`${feld}Nachher`] : def[`${feld}Vorher`]
  });
  const paketSchritte = ZIEL_PAKETE.map((def) => ({
    name: `paket:${def.id}`,
    schluessel: def.id,
    ziel,
    tun: () => store.schreibePaketStatus({ id: def.id, erwartetStatus: richtung(def, "status").erwartet, neuerStatus: richtung(def, "status").neu }),
    rueckgaengig: () => store.schreibePaketStatus({ id: def.id, erwartetStatus: richtung(def, "status").neu, neuerStatus: richtung(def, "status").erwartet })
  }));
  const pfadSchritte = ZIEL_PFADE.map((def) => {
    const eintrag = (lage && Array.isArray(lage.pfade) ? lage.pfade : []).find((x) => x && x.def && x.def.id === def.id);
    const erwartetUrl = eintrag && eintrag.row ? String(eintrag.row.url || "") : "";
    return {
      name: `pfad:${def.id}`,
      schluessel: def.id,
      ziel,
      tun: () => store.schreibePfadStatus({
        id: def.id,
        erwartetUrl,
        erwartetStatus: richtung(def, "status").erwartet,
        erwartetActivationMode: richtung(def, "activationMode").erwartet,
        neuerStatus: richtung(def, "status").neu,
        neuerActivationMode: richtung(def, "activationMode").neu
      }),
      rueckgaengig: () => store.schreibePfadStatus({
        id: def.id,
        erwartetUrl,
        erwartetStatus: richtung(def, "status").neu,
        erwartetActivationMode: richtung(def, "activationMode").neu,
        neuerStatus: richtung(def, "status").erwartet,
        neuerActivationMode: richtung(def, "activationMode").erwartet
      })
    };
  });
  return ziel === ZUSTAND_AKTIV ? [...paketSchritte, ...pfadSchritte] : [...pfadSchritte, ...paketSchritte];
}

// Voller Ruecklese-Vergleich: JEDE Zielzeile muss genau den erwarteten (kumulativen) Zustand
// tragen und die zwei Verknuepfungen muessen unveraendert stehen.
function erwartungErfuellt(lageNach, erwartet) {
  if (!lageNach || lageNach.gesamt === ZUSTAND_UNBEKANNT) return false;
  return [...lageNach.pakete, ...lageNach.pfade].every((x) => x.zustand === erwartet[x.def.id]);
}

async function kompensiere(store, erledigt) {
  const ausgleich = [];
  for (const schritt of [...erledigt].reverse()) {
    let res;
    try {
      res = await schritt.rueckgaengig();
    } catch (error) {
      res = { betroffen: 0 };
    }
    const betroffen = Number(res && res.betroffen);
    ausgleich.push({ name: schritt.name, betroffen: Number.isFinite(betroffen) ? betroffen : 0, ok: betroffen === 1 });
  }
  return ausgleich;
}

// Fuehrt den Plan aus. Nach JEDEM erfolgreichen Write folgt eine Ruecklesung; weicht der
// Zustand ab, werden ausschliesslich die eigenen, bestaetigten Aenderungen rueckwaerts
// kompensiert und fail-closed berichtet.
async function fuehrePlanAus(store, plan, ausgang) {
  const erledigt = [];
  const erwartet = {};
  for (const schritt of plan) erwartet[schritt.schluessel] = ausgang;
  for (const schritt of plan) {
    let res;
    try {
      res = await schritt.tun();
    } catch (error) {
      res = { betroffen: 0 };
    }
    const betroffen = Number(res && res.betroffen);
    if (!Number.isFinite(betroffen) || betroffen !== 1) {
      // Teilfehler: alles bisher Geschriebene wird rueckwaerts kompensiert.
      const ausgleich = await kompensiere(store, erledigt);
      return {
        ok: false,
        grund: "cas-fehlgeschlagen",
        schritt: schritt.name,
        antwort: { betroffen: Number.isFinite(betroffen) ? betroffen : 0 },
        ausgleich
      };
    }
    erledigt.push(schritt);
    erwartet[schritt.schluessel] = schritt.ziel;
    // Ruecklesung NACH diesem Write.
    let gelesen = null;
    try {
      gelesen = await store.leseZielbestand();
    } catch (error) {
      gelesen = null;
    }
    const lageNach = gelesen ? klassifiziere(gelesen) : null;
    if (!erwartungErfuellt(lageNach, erwartet)) {
      const ausgleich = await kompensiere(store, erledigt);
      return {
        ok: false,
        grund: "readback-abgewichen",
        schritt: schritt.name,
        ...(lageNach ? { nachher: lageDetail(lageNach) } : { lesefehler: "ruecklesung-fehlgeschlagen" }),
        ausgleich
      };
    }
  }
  return { ok: true, erledigt };
}

function standardStore() {
  // Bewusst erst hier laden: der Operator bleibt ohne Aufruf inert, und die Tests injizieren
  // ohnehin einen Fake-Store (kein DB-, Netz- oder Secret-Zugriff).
  return require("./bb-quellen-cutover-store").erstelleStore();
}

async function ausfuehren(body = {}, deps = {}) {
  const env = deps.env || process.env;
  const action = String((body && body.action) || "").trim().toLowerCase();

  if (!operatorBereit(env)) return antwort({ ok: false, action, reason: "operator-flag-aus" });
  if (!ACTIONS.includes(action)) return antwort({ ok: false, action, reason: "aktion-nicht-erlaubt" });
  const fremd = fremdeParameter(body);
  if (fremd.length) return antwort({ ok: false, action, reason: "unerlaubter-parameter", detail: { unbekannt: fremd } });
  if (!istBestaetigt(action, body)) return antwort({ ok: false, action, reason: "bestaetigung-fehlt" });
  // Der Cutover verlangt das Laenderflag EXAKT berlin,brandenburg — VOR jedem Store-Zugriff.
  if (action === "quellen-cutover" && !landesmodulFrei(env)) {
    return antwort({ ok: false, action, reason: "landesmodul-nicht-berlin-brandenburg" });
  }

  const store = deps.store || standardStore();

  if (action === "quellen-vorschau") {
    const gelesen = await sicherLesen(store);
    if (!gelesen.ok) return antwort({ ok: false, action, reason: gelesen.reason, detail: gelesen.detail });
    const lage = klassifiziere(gelesen.bestand);
    const eindeutig = lage.gesamt === ZUSTAND_VORBEREITET || lage.gesamt === ZUSTAND_AKTIV;
    return antwort({
      ok: eindeutig,
      action,
      detail: lageDetail(lage),
      reason: eindeutig ? null : failsafeGrund(lage.gesamt)
    });
  }

  const ziel = action === "quellen-cutover" ? ZUSTAND_AKTIV : ZUSTAND_VORBEREITET;
  const ausgang = action === "quellen-cutover" ? ZUSTAND_VORBEREITET : ZUSTAND_AKTIV;

  // Preflight 1: relationaler Schreibpfad muss bereit sein (fail-closed, kein stiller No-op).
  let bereits;
  try {
    bereits = await store.bereit();
  } catch (error) {
    bereits = { ok: false };
  }
  if (!bereits || bereits.ok !== true) {
    return antwort({ ok: false, action, reason: "speicherpfad-nicht-bereit" });
  }

  // Preflight 2: CAS-Vorbedingung vollstaendig lesen und pruefen.
  const gelesen = await sicherLesen(store);
  if (!gelesen.ok) return antwort({ ok: false, action, reason: gelesen.reason, detail: gelesen.detail });
  const lage = klassifiziere(gelesen.bestand);

  if (lage.gesamt === ziel) {
    // Idempotent: Zielzustand ist bereits vollstaendig erreicht — kein Write.
    return antwort({ ok: true, action, detail: { bereits: true, ...lageDetail(lage) } });
  }
  if (lage.gesamt !== ausgang) {
    // Unbekannter oder gemischter Zustand -> KEIN Write.
    return antwort({ ok: false, action, reason: failsafeGrund(lage.gesamt), detail: lageDetail(lage) });
  }

  const plan = schreibplan(store, ziel, lage);
  const lauf = await fuehrePlanAus(store, plan, ausgang);
  if (!lauf.ok) {
    return antwort({
      ok: false,
      action,
      reason: lauf.grund,
      detail: {
        schritt: lauf.schritt,
        ...(lauf.antwort ? { antwort: lauf.antwort } : {}),
        ...(lauf.nachher ? { nachher: lauf.nachher } : {}),
        ...(lauf.lesefehler ? { lesefehler: lauf.lesefehler } : {}),
        ausgleich: lauf.ausgleich,
        ...lageDetail(lage)
      }
    });
  }

  // Die Ruecklesung nach dem LETZTEN Write hat den vollstaendigen Zielzustand bereits
  // bestaetigt (erwartungErfuellt). Hier nur noch die Erfolgsantwort.
  return antwort({
    ok: true,
    action,
    detail: { vorher: lageDetail(lage), schritte: lauf.erledigt.map((s) => s.name) }
  });
}

module.exports = {
  ACTIONS,
  BESTAETIGUNGEN,
  ERLAUBTE_PARAMETER,
  LANDESMODUL_FLAG,
  OPERATOR_FLAG,
  SCHREIBENDE_ACTIONS,
  ZIEL_PAKETE,
  ZIEL_PAKET_IDS,
  ZIEL_PFADE,
  ZIEL_PFAD_IDS,
  ZUSTAND_AKTIV,
  ZUSTAND_GEMISCHT,
  ZUSTAND_UNBEKANNT,
  ZUSTAND_VORBEREITET,
  ausfuehren,
  bestaetigungFuer,
  fremdeParameter,
  istBestaetigt,
  klassifiziere,
  lageDetail,
  landesmodulFrei,
  operatorBereit,
  pfadIdentitaetPasst,
  pfadZustand,
  paketZustand,
  strukturPruefen
};
