"use strict";
const A = require("node:assert/strict");
const { hash } = require("./briefing-speicher");
const { berlinTagKey } = require("./briefing-frische");
const S = require("./synthetik-500-profile");
const speicherDiagnose = require("./briefing-speicher-lesediagnose");

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
// Blocker-2-Eingabepfad. Diese Diagnose selbst erzeugt keine weiteren Reads und keine
// Writer-, Modell-, Profil-, Auswahl- oder Kostenwirkung. Gebunden wird nur das
// urspruengliche Fehlerobjekt ueber eine modulweite WeakMap an ein eingefrorenes
// Diagnoseobjekt mit festen Literalen. Getterzugriff und Klassifikation laufen
// best effort; Rohmessage, Name, Stack, Profil-/Quellenkennungen samt Hashes,
// Querywerte, URLs und Secretdaten werden nie zurueckgegeben. Die Transportdiagnose nennt
// nur geschlossene Ressourcen-/Schrittlabels, Zahlen und optional den Hash einer
// streng geprueften Provider-Request-UUID; keine Profil-/Quellenidentitaeten.
const DIAGNOSE_VERSION = "blocker2-briefing-read-diagnostic/1";
const WIEDERAUFNAHME_VERSION = "blocker2-read-resume/1";
const MAX_QUELLEN_FRIST_MS = 20000;
const MAX_PROFIL_FRIST_MS = 10000;
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

// Strengste Wiederaufnahmeerkennung fuer den begrenzten Leseversuch: nur der
// echte gebuendelte Quellen-Timeout des frischen knowledge_objects-GET mit
// positivem, hoechstens 20000ms langem Zeitfenster. Bare AbortError, generisches
// deadline exceeded, Profil-/Fremdprefix, HTTP-Status, Assertion,
// Sourcebindungsfehler, Getterbombe, primitive Werte und
// Nicht-Synthetikprofile sind ausgeschlossen. Die Rohmessage verlaesst diese
// Funktion nicht.
function istWiederholbarerQuellenTimeout(error) {
  // Retry-Zulassung braucht sichere Nicht-Widerspruchsfelder: anders als die
  // best-effort Diagnose darf hier kein Getterfehler als "fehlt" gelten.
  let name, code, message;
  try {
    if (!istObjekt(error)) return false;
    name = error.name; code = error.code; message = error.message;
  } catch { return false; }
  if (name === "AbortError" || code === "ERR_ASSERTION" || typeof message !== "string") return false;
  const treffer = /^Supabase storage timed out after (\d+)ms: \/rest\/v1\/knowledge_objects\?id=in\.\(/.exec(message);
  if (!treffer) return false;
  const frist = Number(treffer[1]);
  if (!Number.isSafeInteger(frist) || frist <= 0 || frist > MAX_QUELLEN_FRIST_MS) return false;
  return true;
}

// Nur der belegte erste relationale Profil-GET fuer genau diese geschlossene
// Kennung. Ein erfolgreicher zweiter Read ersetzt niemals den Profilguard.
function istWiederholbarerProfilTimeout(error, userId) {
  let name, code, message;
  try {
    if (!istObjekt(error)) return false;
    name = error.name; code = error.code; message = error.message;
  } catch { return false; }
  if (name === "AbortError" || code === "ERR_ASSERTION" || typeof message !== "string") return false;
  const treffer = /^Supabase storage timed out after (\d+)ms: (.*)$/.exec(message);
  if (!treffer || treffer[0] !== message) return false;
  const frist = Number(treffer[1]);
  const endpoint = `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=*,mandate_profiles(*)&limit=1`;
  return Number.isSafeInteger(frist) && frist > 0 && frist <= MAX_PROFIL_FRIST_MS
    && treffer[2] === endpoint;
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
    const speicher = art === "speicher-timeout" ? speicherDiagnose.lese(error) : null;
    if (speicher) eintrag.speicher = speicher;
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
    if (eintrag.speicher) kopie.speicher = eintrag.speicher;
    return Object.freeze(kopie);
  } catch {
    return null;
  }
}

// Vom bereits Cron-geschuetzten GET aufgerufen, vor jedem Account-Vorlauf.
// Inaktive alte/neue synthetische Kohorte oder der gebundene Cem-Radar-Nachweis.
// Keinerlei Writer oder Modellfunktion; Cron-Authentisierung bleibt zwingend.
async function erfasse({ userId, tag, expectedCommit, commit, production, storage, build, leseLage, now = () => new Date() }) {
  const eligibility = require("./publication-eligibility"), publicationPolicy = eligibility.current();
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
    let profile, wiederaufnahmePhase = null;
    try {
      speicherDiagnose.markiereVersuch("profil-vorher");
      profile = await storage.getProfile(userId);
    } catch (ersterProfilfehler) {
      if (!synthetik || !istWiederholbarerProfilTimeout(ersterProfilfehler, userId)
        || berlinTagKey(now()) !== tag) throw ersterProfilfehler;
      speicherDiagnose.markiereVersuch("profil-vorher");
      profile = await storage.getProfile(userId);
      wiederaufnahmePhase = "profil-vorher-lesen";
    }

    phase = "profil-pruefen";
    A.equal(profile?.id, userId); A.equal(profile.profileActive, false);
    if (synthetik) {
      const erwartet = synthetik.get(profile.szenario?.variante);
      A(erwartet, "synthetisches Profil hat keine geschlossene Generatorvariante");
      A.deepEqual(profilDaten(profile), erwartet, "synthetisches Profil weicht vom Generator/Import ab");
    }

    // Vorhandener, frischer und streng gebundener Quellen-Lesepfad. Nur der
    // geschlossene Synthetiknachweis nutzt die gebuendelte B1-Schnittstelle.
    // Ein etwaiger zweiter Versuch laeuft mit exakt denselben Optionen.
    phase = "briefing-aufbauen";
    const buildOptionen = { aussagenEingabe: true, now: start,
      ...(synthetik ? { quellenGebundelt: true } : {}) };
    let result;
    try {
      speicherDiagnose.markiereVersuch("build");
      result = await build(profile, userId, buildOptionen);
    } catch (ersterLesefehler) {
      // Nur ein einziger zusaetzlicher build()-Versuch im selben Eingabeabruf,
      // und zwar ausschliesslich fuer den streng erkannten echten gebuendelten
      // Quellen-Supabase-Timeout des geschlossenen Synthetiknachweises. Kein
      // Retry des Workflows oder des GET, kein Profilrepair, kein stale Cache.
      // Bei Tageswechsel vor der Wiederaufnahme wird abgebrochen und die
      // urspruengliche Ausnahme unveraendert geworfen.
      if (!synthetik || wiederaufnahmePhase !== null || !istWiederholbarerQuellenTimeout(ersterLesefehler)
        || berlinTagKey(now()) !== tag) {
        throw ersterLesefehler;
      }
      speicherDiagnose.markiereVersuch("build");
      result = await build(profile, userId, buildOptionen);
      wiederaufnahmePhase = "briefing-aufbauen";
    }

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

    eligibility.assertSame(publicationPolicy);
    eligibility.assertRecorded(result?.eingabe?.publicationEligibilityPolicy, publicationPolicy);
    return { version: 1, art: "production-briefing-eingabe", productionCommit: commit,
      ...(eligibility.publicInfo(publicationPolicy) ? { publicationEligibilityPolicy: eligibility.publicInfo(publicationPolicy) } : {}),
      ...eligibility.sourceStateInfo(publicationPolicy),
      erfasstAm: start.toISOString(), reinLesend: true, modellaufrufe: 0,
      transaktionalerSnapshot: false, fachlicheFreigabe: false, profile, result,
      ...(synthetik ? { synthetisch: true, schreibaufrufe: 0,
        funktionsnachweis500: false, all500InputAcceptance: false } : {}),
      ...(wiederaufnahmePhase ? { leseWiederaufnahme: { version: WIEDERAUFNAHME_VERSION,
        phase: wiederaufnahmePhase, art: "speicher-timeout", versuche: 2 } } : {}),
      ...(lageAnsicht ? { lageAnsicht, gespeichertesGesamtpaket: false } : {}) };
  } catch (error) {
    // Nur Diagnose binden und exakt dieselbe Ausnahme erneut werfen:
    // Typ, Message und Objektidentitaet bleiben unveraendert.
    binde(error, phase);
    throw error;
  }
}
module.exports = {
  erfasse: optionen => speicherDiagnose.mitKontext(() => erfasse(optionen)),
  fehlerDiagnose
};
