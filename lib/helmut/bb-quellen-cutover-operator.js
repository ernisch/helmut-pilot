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
//   Paket (nur `status`):      pkg-brandenburg-basis   prepared <-> active
//   Erhaltene Invariante:      pkg-berlin-basis bleibt active (NIEMALS patchen).
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
// 16 codefesten Paket-<->Pfad-Verknuepfungen und (c) dass die Zeile EXAKT die oeffentliche
// BE/BB-Konfiguration traegt (Publisher, legacy-Kennung, Methode, Abrufadresse, `query = NULL`
// und die eingefrorene Parser-Kennung — Identitaet/URL/Methode ueber die bestehenden, im Code
// der Quellenarchitektur eingefrorenen Erkennungsfunktionen). Weicht ein Wert ab
// (unbekannter/gemischter Zustand, gedriftete URL, fehlende/doppelte Zeile, fremde Verknuepfung),
// bricht der Operator OHNE Write ab ("fremder/unbekannter Zustand => 0 writes").
//
// Der Write selbst ist ebenfalls bedingt (der erwartete Vollzustand steckt im WHERE der
// DB-Aktualisierung) und wird nach JEDEM Write per Ruecklesung bestaetigt. Ein Teilfehler
// kompensiert ausschliesslich die eigenen, bestaetigten Aenderungen im festen Scope und
// meldet fail-closed. Ein unbekannter Transportausgang oder fremde Drift stoppt
// weitere Writes einschliesslich Kompensation; der Restzustand bleibt offen.

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
  "quellen-cutover": "BERLIN-ACTIVE-BRANDENBURG-QUELLEN-CUTOVER-V1-20261001",
  "quellen-rueckbau": "BERLIN-ACTIVE-BRANDENBURG-QUELLEN-RUECKBAU-V1-20261001"
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
const ZUSTAND_ERHALTEN = "erhalten";

const ZIEL_PAKETE = Object.freeze([
  Object.freeze({
    id: "pkg-berlin-basis", key: "berlin-basis", name: "Berlin Basis",
    statusVorher: "active", statusNachher: "active"
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

// Begrenzter Vertrag aus dem belegten Snapshot vom 01.10.2026. Kein frei
// konfigurierbarer Mischzustand: Berlin bleibt aktiv, nur Brandenburg wird umgestellt.
const VERTRAGS_LINKS = Object.freeze([
  ...["rp-be-landesfraktionen", "rp-be-landesparlament", "rp-be-landesregierung",
    "rp-be-plenum", "rp-be-regionale_leitmedien", "rp-be-staatskanzlei", "rp-rbb24-politik"]
    .map((id) => Object.freeze({ package_id: "pkg-berlin-basis", retrieval_path_id: id })),
  ...["rp-bb-ausschuesse", "rp-bb-landesfraktionen", "rp-bb-landesparlament",
    "rp-bb-landesregierung", "rp-bb-ministerien", "rp-bb-partei_pilot", "rp-bb-plenum",
    "rp-bb-regionale_leitmedien", "rp-rbb24-politik"]
    .map((id) => Object.freeze({ package_id: "pkg-brandenburg-basis", retrieval_path_id: id }))
]);
const VERTRAGS_PFAD_IDS = Object.freeze([...new Set(VERTRAGS_LINKS.map((link) => link.retrieval_path_id))]);
const BASIS_VEKTOR = Object.freeze(Object.fromEntries([
  ...ZIEL_PAKETE.map((def) => [def.id, Object.freeze({ status: def.statusVorher })]),
  ...ZIEL_PFADE.map((def) => [def.id, Object.freeze({ status: def.statusVorher, activation_mode: def.activationModeVorher })])
]));
const AKTIV_VEKTOR = Object.freeze(Object.fromEntries([
  ...ZIEL_PAKETE.map((def) => [def.id, Object.freeze({ status: def.statusNachher })]),
  ...ZIEL_PFADE.map((def) => [def.id, Object.freeze({ status: def.statusNachher, activation_mode: def.activationModeNachher })])
]));

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
  if (def.statusVorher === def.statusNachher && status === def.statusVorher) return ZUSTAND_ERHALTEN;
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

// Struktur-Vorbedingung: GENAU EINE Zeile je Ziel (Paket/Pfad) sowie die
// codefeste vollstaendige Bindungs-/Nebenpfadmenge. Fehlt/doppelt/fremd -> unbekannt.
function strukturPruefen(bestand = {}) {
  if (!bestand || typeof bestand !== "object") return { ok: false, grund: "bestand-ungueltig" };
  if (!Array.isArray(bestand.pakete) || bestand.pakete.length !== ZIEL_PAKETE.length
    || !Array.isArray(bestand.pfade) || bestand.pfade.length !== ZIEL_PFADE.length) {
    return { ok: false, grund: "zielzeilenmenge-abgewichen" };
  }
  for (const def of ZIEL_PAKETE) {
    if (zaehleId(bestand.pakete, def.id) !== 1) return { ok: false, grund: "paketzeile-nicht-eindeutig", id: def.id };
  }
  for (const def of ZIEL_PFADE) {
    if (zaehleId(bestand.pfade, def.id) !== 1) return { ok: false, grund: "pfadzeile-nicht-eindeutig", id: def.id };
  }
  const links = Array.isArray(bestand.links) ? bestand.links : [];
  const zielLinksVorhanden = links.length === VERTRAGS_LINKS.length && VERTRAGS_LINKS.every((e) => links.filter((l) =>
    l && String(l.package_id) === e.package_id && String(l.retrieval_path_id) === e.retrieval_path_id).length === 1);
  if (!zielLinksVorhanden) return { ok: false, grund: "paketzuordnung-nicht-eindeutig" };
  // Jeder sonstige gebundene Weg muss exakt vorbereitet/manuell bleiben.
  const linkedPfade = Array.isArray(bestand.linkedPfade) ? bestand.linkedPfade : [];
  if (linkedPfade.length !== VERTRAGS_PFAD_IDS.length) return { ok: false, grund: "gebundene-pfadmenge-abgewichen" };
  for (const id of VERTRAGS_PFAD_IDS) {
    const rows = linkedPfade.filter((row) => row && String(row.id) === id);
    if (rows.length !== 1) return { ok: false, grund: "gebundener-pfad-nicht-eindeutig", id };
    if (ZIEL_PFAD_IDS.includes(id)) {
      const zielrow = finde(bestand.pfade, id);
      if (!zielrow || rows[0].status !== zielrow.status || rows[0].activation_mode !== zielrow.activation_mode) {
        return { ok: false, grund: "pfadansichten-abgewichen", id };
      }
    } else if (rows[0].status !== "needs_review" || rows[0].activation_mode !== "manual") {
      return { ok: false, grund: "weiterer-paketpfad-abgewichen", id };
    }
  }
  return { ok: true };
}

function klassifiziere(bestand = {}) {
  bestand = bestand || {};
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
  const zustaende = new Set(alle.filter((x) => x.zustand !== ZUSTAND_ERHALTEN).map((x) => x.zustand));
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
    const bestand = await store.leseZielbestand();
    if (!bestand || typeof bestand !== "object" || Array.isArray(bestand)) return { ok: false, reason: "lesen-fehlgeschlagen" };
    return { ok: true, bestand };
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
  const paketSchritte = ZIEL_PAKETE.filter((def) => def.statusVorher !== def.statusNachher).map((def) => ({
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
  return ziel === ZUSTAND_AKTIV ? [...paketSchritte, ...pfadSchritte] : [...pfadSchritte.reverse(), ...paketSchritte];
}

// Voller Ruecklese-Vergleich: JEDE Zielzeile muss genau den erwarteten (kumulativen) Zustand
// tragen; alle 16 Verknuepfungen und 15 gebundenen Pfadstatus bleiben im Vertrag.
function identitaetsBindung(lage) {
  return JSON.stringify([
    ...lage.pakete.map((x) => [x.row.id, x.row.key]),
    ...lage.pfade.map((x) => [x.row.id, x.row.publisher_id, x.row.legacy_source_id,
      x.row.method, x.row.url, x.row.query, x.row.parser])
  ]);
}

function erwartungErfuellt(lageNach, erwartet, bindung) {
  if (!lageNach || lageNach.gesamt === ZUSTAND_UNBEKANNT) return false;
  return identitaetsBindung(lageNach) === bindung
    && lageNach.alle.every((x) => x.zustand === erwartet[x.def.id]);
}

// Exceptions/unklare Antworten beweisen KEINEN Nicht-Write. Nicht konvertieren:
// null, fehlende Zaehler oder fremde Antwortformen bleiben unbekannt.
function writeErgebnis(res) {
  if (!res || (res.ausgangUnbekannt !== undefined && res.ausgangUnbekannt !== false)
    || (res.betroffen !== 0 && res.betroffen !== 1)) {
    return { betroffen: null, ausgangUnbekannt: true };
  }
  return { betroffen: res.betroffen, ausgangUnbekannt: false };
}

async function leseErwartung(store, erwartet, bindung) {
  const gelesen = await sicherLesen(store);
  if (!gelesen.ok) return { ok: false, lesefehler: gelesen.reason };
  const lage = klassifiziere(gelesen.bestand);
  return { ok: erwartungErfuellt(lage, erwartet, bindung), nachher: lageDetail(lage) };
}

// Eine einzige begrenzte Zustandlesung nach unbekanntem Write; weder Retry
// noch Kompensation. Die Beobachtung beweist keine Urheberschaft des Writes.
async function offenerWrite(store, schritt, ausgleich = []) {
  const gelesen = await sicherLesen(store);
  return {
    ok: false, grund: "write-ausgang-unbekannt", schritt: schritt.name,
    antwort: { betroffen: null, ausgangUnbekannt: true },
    betroffen: null, ausgangUnbekannt: true, offenerAusgang: true, ausgleich,
    ...(gelesen.ok ? { nachher: lageDetail(klassifiziere(gelesen.bestand)) }
      : { lesefehler: gelesen.reason })
  };
}

// Nur bestaetigte eigene Writes, nur bei frischer vollstaendiger Bindung.
// Jede Abweichung oder unbekannte Transportwirkung stoppt weitere Writes.
async function kompensiere(store, erledigt, erwartet, bindung, ausgangsMap) {
  const ausgleich = [];
  for (const schritt of [...erledigt].reverse()) {
    const vorher = await leseErwartung(store, erwartet, bindung);
    if (!vorher.ok) return { ausgleich, offenerAusgang: true, ...vorher };
    let res;
    try { res = writeErgebnis(await schritt.rueckgaengig()); }
    catch (error) { res = writeErgebnis(null); }
    const eintrag = { name: schritt.name, ...res, ok: false };
    ausgleich.push(eintrag);
    if (res.ausgangUnbekannt) return await offenerWrite(store, schritt, ausgleich);
    if (res.betroffen !== 1) {
      const beobachtet = await sicherLesen(store);
      return { ausgleich, offenerAusgang: true,
        ...(beobachtet.ok ? { nachher: lageDetail(klassifiziere(beobachtet.bestand)) }
          : { lesefehler: beobachtet.reason }) };
    }
    erwartet[schritt.schluessel] = ausgangsMap[schritt.schluessel];
    const nachher = await leseErwartung(store, erwartet, bindung);
    if (!nachher.ok) return { ausgleich, offenerAusgang: true, ...nachher };
    eintrag.ok = true;
  }
  return { ausgleich, offenerAusgang: false };
}

async function fuehrePlanAus(store, plan, ausgangslage) {
  const erledigt = [];
  // Berlin ist trotz fehlendem Schreibschritt Bestandteil JEDER Ruecklesung.
  const ausgangsMap = Object.fromEntries(ausgangslage.alle.map((x) => [x.def.id, x.zustand]));
  const erwartet = { ...ausgangsMap };
  const bindung = identitaetsBindung(ausgangslage);
  for (const schritt of plan) {
    const vorher = await leseErwartung(store, erwartet, bindung);
    if (!vorher.ok) return { ok: false, grund: "vorwrite-zustand-abgewichen", schritt: schritt.name,
      ausgleich: [], offenerAusgang: true, ...vorher };
    let res;
    try { res = writeErgebnis(await schritt.tun()); }
    catch (error) { res = writeErgebnis(null); }
    if (res.ausgangUnbekannt) return await offenerWrite(store, schritt);
    if (res.betroffen !== 1) {
      // Erst frischer Read, dann eigene Kompensation. Drift wird nicht ueberschrieben.
      const frisch = await leseErwartung(store, erwartet, bindung);
      const kompensation = frisch.ok
        ? await kompensiere(store, erledigt, erwartet, bindung, ausgangsMap)
        : { ausgleich: [], offenerAusgang: true, ...frisch };
      return {
        ...kompensation, ok: false,
        grund: kompensation.ausgangUnbekannt ? "write-ausgang-unbekannt" : "cas-fehlgeschlagen",
        schritt: kompensation.schritt || schritt.name,
        antwort: kompensation.antwort || { betroffen: 0, ausgangUnbekannt: false }
      };
    }
    erledigt.push(schritt);
    erwartet[schritt.schluessel] = schritt.ziel;
    const nachher = await leseErwartung(store, erwartet, bindung);
    if (!nachher.ok) {
      return {
        ...nachher, ok: false, grund: "readback-abgewichen", schritt: schritt.name,
        ausgleich: [], offenerAusgang: true
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
  const lauf = await fuehrePlanAus(store, plan, lage);
  if (!lauf.ok) {
    return antwort({
      ok: false,
      action,
      reason: lauf.grund,
      detail: {
        schritt: lauf.schritt,
        offenerAusgang: lauf.offenerAusgang === true,
        ...(lauf.ausgangUnbekannt ? { betroffen: null, ausgangUnbekannt: true } : {}),
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
  AKTIV_VEKTOR,
  BASIS_VEKTOR,
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
  ZUSTAND_ERHALTEN,
  ZUSTAND_UNBEKANNT,
  ZUSTAND_VORBEREITET,
  VERTRAGS_LINKS,
  VERTRAGS_PFAD_IDS,
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
