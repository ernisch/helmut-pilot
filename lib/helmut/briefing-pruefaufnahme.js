"use strict";
const A = require("node:assert/strict");
const { hash } = require("./briefing-speicher");
const { berlinTagKey } = require("./briefing-frische");
const S = require("./synthetik-500-profile");

// Derselbe geschlossene Generator/Import/DTO-Vertrag wie beim Bestand.
// Nur updatedAt ist fluechtig; zusaetzliche Mandatsangaben bleiben eine Abweichung.
const profilDaten = profile => Object.fromEntries(Object.entries(profile)
  .filter(([key, value]) => key !== "updatedAt" && value !== undefined));
const synthetikProfile = new Map();
for (const variante of S.VARIANTEN) {
  const paket = S.erzeuge({ variante });
  const { profileRows, mandateRows } = require("./synthetik-500-import").erzeugeZeilen(paket);
  for (let i = 0; i < profileRows.length; i++) {
    const profile = require("./storage").fromMandateProfileRow(profileRows[i], mandateRows[i]);
    if (!synthetikProfile.has(profile.id)) synthetikProfile.set(profile.id, new Map());
    synthetikProfile.get(profile.id).set(variante, profilDaten(profile));
  }
}

// Begrenzte, datenschutzsichere Diagnose fuer den bestehenden rein lesenden
// Blocker-2-Eingabepfad. Kein Retry, kein zusaetzlicher Lesevorgang, keine
// Writer-, Modell-, Profil-, Auswahl- oder Kostenwirkung. Gebunden wird nur das
// urspruengliche Fehlerobjekt ueber eine modulweite WeakMap an ein eingefrorenes
// Diagnoseobjekt mit festen Literalen. Getterzugriff und Klassifikation laufen
// best effort; Rohmessage, Name, Stack, Profil-, Query-, ID-, Hash-, URL- und
// Secretdaten werden nie zurueckgegeben.
const DIAGNOSE_VERSION = "blocker2-briefing-read-diagnostic/1";
const PHASEN = Object.freeze([
  "kontext-pruefen",
  "profil-vorher-lesen",
  "profil-pruefen",
  "briefing-aufbauen",
  "eingabevertrag-pruefen",
  "lage-lesen",
  "lage-pruefen",
  "profil-nachher-lesen",
  "profil-stabilitaet-pruefen",
  "tag-nachher-pruefen"
]);
const diag = new WeakMap();

const istObjekt = value => (typeof value === "object" && value !== null)
  || typeof value === "function";

// Feindliche Getter duerfen die urspruengliche Ausnahme nicht verdecken.
function leseText(objekt, schluessel) {
  try {
    if (!istObjekt(objekt)) return null;
    const wert = objekt[schluessel];
    return typeof wert === "string" ? wert : null;
  } catch {
    return null;
  }
}

// Geschlossene Klassifikation; liefert nur feste Artlabel und optional den rein
// numerischen Speicherstatus, niemals die Rohmessage.
function klassifiziere(error) {
  if (leseText(error, "code") === "ERR_ASSERTION") return { art: "schutz-widerspruch" };
  if (leseText(error, "name") === "AbortError") return { art: "speicher-timeout" };
  const message = leseText(error, "message");
  if (message !== null) {
    if (/^Supabase storage timed out after \d+ms:/.test(message)
      || /^Supabase request deadline exceeded/.test(message)) {
      return { art: "speicher-timeout" };
    }
    const treffer = /^Supabase storage failed \((\d{3})\):/.exec(message);
    if (treffer) {
      const status = Number(treffer[1]);
      if (Number.isSafeInteger(status) && status >= 400 && status <= 599) {
        return { art: "speicher-http-fehler", httpStatus: status };
      }
    }
  }
  return { art: "interner-lesefehler" };
}

// Bindet best effort ausschliesslich feste Phasenlabels; die Ausnahme selbst
// bleibt unveraendert.
function binde(error, phase) {
  if (!istObjekt(error)) return error;
  if (!PHASEN.includes(phase)) return error;
  try {
    const { art, httpStatus } = klassifiziere(error);
    const eintrag = { version: DIAGNOSE_VERSION, phase, art };
    if (Number.isSafeInteger(httpStatus)) eintrag.httpStatus = httpStatus;
    diag.set(error, Object.freeze(eintrag));
  } catch {
    // Nur Diagnose; die urspruengliche Ausnahme bleibt unveraendert.
  }
  return error;
}

// Rein lesende Kopie der gebundenen Diagnose; null fuer ungebundene oder
// primitive Werte. Enthaelt nur Version, feste Phase, feste Art und optional den
// numerischen HTTP-Status.
function fehlerDiagnose(error) {
  if (!istObjekt(error)) return null;
  try {
    const eintrag = diag.get(error);
    if (!eintrag) return null;
    const kopie = { version: eintrag.version, phase: eintrag.phase, art: eintrag.art };
    if (Number.isSafeInteger(eintrag.httpStatus)) kopie.httpStatus = eintrag.httpStatus;
    return Object.freeze(kopie);
  } catch {
    return null;
  }
}

// Vom bereits Cron-geschuetzten GET aufgerufen, vor jedem Account-Vorlauf.
// Inaktive alte/neue synthetische Kohorte oder der gebundene Cem-Radar-Nachweis.
// Keinerlei Writer oder Modellfunktion; Cron-Authentisierung bleibt zwingend.
async function erfasse({ userId, tag, expectedCommit, commit, production, storage, build, leseLage, now = () => new Date() }) {
  let phase = "kontext-pruefen";
  try {
    A.equal(production, true);
    A.match(commit || "", /^[a-f0-9]{40}$/);
    A.equal(expectedCommit, commit);
    const synthetik = synthetikProfile.get(userId);
    A(synthetik || require("./testkohorte-betrieb").istKohortenKennung(userId) || userId === "cem-ince");
    const start = now();
    A.equal(tag, berlinTagKey(start));

    phase = "profil-vorher-lesen";
    const profile = await storage.getProfile(userId);

    phase = "profil-pruefen";
    A.equal(profile?.id, userId); A.equal(profile.profileActive, false);
    if (synthetik) {
      const erwartet = synthetik.get(profile.szenario?.variante);
      A(erwartet, "synthetisches Profil hat keine geschlossene Generatorvariante");
      A.deepEqual(profilDaten(profile), erwartet, "synthetisches Profil weicht vom Generator/Import ab");
    }

    // Vorhandener, frischer und streng gebundener Quellen-Lesepfad. Nur der
    // geschlossene Synthetiknachweis nutzt die gebuendelte B1-Schnittstelle.
    phase = "briefing-aufbauen";
    const result = await build(profile, userId, { aussagenEingabe: true, now: start,
      ...(synthetik ? { quellenGebundelt: true } : {}) });

    phase = "eingabevertrag-pruefen";
    A.equal(result?.eingabe?.mandat, userId); A.equal(result.eingabe.tag, tag);
    A(result.korrekturBasis && Array.isArray(result.korrekturBasis.kos));

    // Fuer die konkrete Cem-Bereichsabnahme dieselbe lesende Lage-Auswahl wie
    // beim App-Start aufnehmen. Getrennt vom Aussagenvertrag: dessen Hash darf
    // durch eine nachtraeglich angehaengte Ansicht nicht ungueltig werden.
    // cacheOnly darf weder einen fehlenden Text erzeugen noch einen Lock nehmen.
    let lageAnsicht;
    if (userId === "cem-ince") {
      phase = "lage-lesen";
      A.equal(typeof leseLage, "function");
      lageAnsicht = await leseLage(profile, { politicianId: userId, cacheOnly: true });
      phase = "lage-pruefen";
      A(lageAnsicht && lageAnsicht.demo === false
        && Array.isArray(lageAnsicht.vorgaenge) && Array.isArray(lageAnsicht.paragraphs));
    }

    // Genau dieselbe zweite Profilabfrage wie bisher: erst das Await-Ergebnis
    // binden, dann den Hash vergleichen. Kein zusaetzlicher Leseaufruf.
    phase = "profil-nachher-lesen";
    const profilNachher = await storage.getProfile(userId);
    phase = "profil-stabilitaet-pruefen";
    A.equal(hash(profilNachher), hash(profile));
    phase = "tag-nachher-pruefen";
    A.equal(berlinTagKey(now()), tag);

    return { version: 1, art: "production-briefing-eingabe", productionCommit: commit,
      erfasstAm: start.toISOString(), reinLesend: true, modellaufrufe: 0,
      transaktionalerSnapshot: false, fachlicheFreigabe: false, profile, result,
      ...(synthetik ? { synthetisch: true, schreibaufrufe: 0,
        funktionsnachweis500: false, all500InputAcceptance: false } : {}),
      ...(lageAnsicht ? { lageAnsicht, gespeichertesGesamtpaket: false } : {}) };
  } catch (error) {
    // Nur Diagnose binden und exakt dieselbe Ausnahme erneut werfen:
    // Typ, Message und Objektidentitaet bleiben unveraendert.
    binde(error, phase);
    throw error;
  }
}
module.exports = { erfasse, fehlerDiagnose };
