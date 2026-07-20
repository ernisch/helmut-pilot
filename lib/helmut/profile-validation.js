"use strict";

// Zentrale Profilvalidierung (Mehrmandantenfaehigkeit Phase 5).
//
// EIN Ort, der beurteilt, ob ein politisches Profil nutzbar ist — konsumiert von
// der Admin-Profilverwaltung (Anzeige „Vollstaendig/fehlende Pflichtfelder") und
// spaeter von der Job-Verarbeitung (ein nicht-bereites/deaktiviertes Profil nimmt
// nicht an Briefing/Matching teil).
//
// Baut bewusst AUF config.profileCompleteness auf (dieselbe Ausschuss/Themen/
// Partei-Logik), statt sie zu duplizieren — ergaenzt nur die vom Pflichtenheft
// zusaetzlich geforderten Achsen (aktiver Status, gueltige Kostenbegrenzung,
// Region/Wahlkreis, Mandatsebene) und fasst alles in klare Zustaende.
//
// Keine erfundenen Daten: fehlt ein Feld, wird es als fehlend AUSGEWIESEN — nie
// geraten oder mit einem Default „aufgehuebscht".

const { profileCompleteness, parliamentTypeOf } = require("./config");

// Zustaende laut Auftrag (Phase 5):
const STATES = {
  COMPLETE: "vollstaendig",
  PARTIAL: "teilweise",
  NOT_READY: "nicht_bereit",
  INVALID: "fehlerhaft",
  DISABLED: "deaktiviert"
};

function hasStr(v) { return String(v || "").trim().length > 0; }
function hasList(v) { return Array.isArray(v) && v.some((x) => String(x || "").trim()); }

// Ist das Profil deaktiviert oder (soft-)geloescht? Beides -> raus aus jeder
// Verarbeitung. profileActive === false ODER deletedAt/geloescht_at gesetzt.
function isDisabled(profile = {}) {
  if (profile.profileActive === false) return true;
  if (hasStr(profile.deletedAt) || hasStr(profile.geloescht_at)) return true;
  return false;
}

// Prueft die Kostenbegrenzung. Gueltig = nicht gesetzt (dann greift Systemdefault)
// ODER eine positive ganze Zahl. Ein gesetzter, aber unsinniger Wert (<=0, NaN)
// ist ein FEHLER (fehlerhaft), kein „fehlt".
function budgetCheck(profile = {}) {
  const problems = [];
  for (const [key, label] of [["aiBudgetDailyCents", "KI-Tagesbudget"], ["aiBudgetMonthlyCents", "KI-Monatsbudget"]]) {
    const raw = profile[key];
    if (raw === undefined || raw === null || raw === "") continue; // nicht gesetzt -> Systemdefault, ok
    const num = Number(raw);
    if (!Number.isFinite(num) || !Number.isInteger(num) || num <= 0) {
      problems.push({ field: key, label, value: raw });
    }
  }
  return problems;
}

// Region/Wahlkreis: mind. eines von constituency/wahlkreis/location/state, ODER
// eine explizite Landesliste (dann ist „kein Wahlkreis" fachlich korrekt).
function hasRegion(profile = {}) {
  return hasStr(profile.constituency) || hasStr(profile.wahlkreis)
    || hasStr(profile.location) || hasStr(profile.state)
    || hasStr(profile.regionNote);
}

// Name mit Vor- UND Nachnamen (>= 2 Wortbestandteile) — Pflicht fuer ein
// einsatzbereites Abgeordnetenprofil (nicht nur ein einzelnes Wort).
function hasFullName(profile = {}) {
  const n = String(profile.fullName || profile.name || "").trim();
  return n.split(/\s+/).filter(Boolean).length >= 2;
}

// KERN eines EINSATZBEREITEN Profils — „kann Helmut mit dem Profil sinnvoll
// arbeiten?". BEWUSST NUR die harten Felder; Ausschuesse, Kernthemen,
// Schwerpunkte, Beobachtung, Kommunikation, Briefing-Praeferenzen, Kanaele und
// Freitexte sind OPTIONAL und blockieren den Zugang NICHT.
function operationalCoreMissing(profile = {}) {
  const p = profile || {};
  const missing = [];
  if (!hasFullName(p)) missing.push("name");                                   // Vor- + Nachname
  if (!hasStr(p.role) && !hasStr(p.function)) missing.push("rolle");           // Rolle/Funktion
  const ebene = parliamentTypeOf(p);                                          // politische Ebene
  if (!ebene) missing.push("mandatsebene");
  if (!hasStr(p.id)) missing.push("mandatszuordnung");                         // eindeutige politicianId
  if (!hasStr(p.party) && !hasStr(p.faction)) missing.push("partei_oder_fraktion");
  if (!hasRegion(p)) missing.push("region_oder_wahlkreis");                    // Wahlkreis/Region sofern vorhanden
  if (ebene === "Landtag" && !hasStr(p.state) && !hasStr(p.bundesland)) missing.push("bundesland");
  // Datenschutzbestaetigung ist HARTES Kernkriterium (nicht nur Screen-10-Zwang):
  // ein Profil ist ohne datenschutz_bestaetigt_at NIE einsatzbereit — auch nicht
  // bei onboarding_status='abgeschlossen' und auch nicht als Altbestand. So kann
  // weder ein fehlerhafter Zustand noch eine spaetere Datenaenderung die
  // Einwilligung umgehen.
  if (!hasStr(p.privacyConfirmedAt) && !hasStr(p.datenschutz_bestaetigt_at)) missing.push("datenschutz");
  return missing;
}
function hasOperationalCore(profile = {}) {
  return operationalCoreMissing(profile).length === 0;
}

// ── DIE EINZIGE STELLE, die entscheidet, ob ein Profil EINSATZBEREIT ist ──────
// Konsumiert vom Onboarding-Gate (Client liest das Ergebnis ueber
// validateProfile(...).operational; Server-seitige Aufrufer nutzen diese
// Funktion direkt). „Einsatzbereit" = Kernfelder vorhanden UND das Setup-Gate
// erfuellt:
//   - onboarding_status === 'abgeschlossen'  -> einsatzbereit (Kern vorausgesetzt);
//   - 'neu' | 'in_bearbeitung'               -> NICHT einsatzbereit (Erstkonfiguration laeuft/steht aus);
//   - kein/unbekannter Status (Altprofile)   -> nach den tatsaechlichen Kernfeldern bewerten.
// So werden (a) neue Nutzer sicher durch die Erstkonfiguration gefuehrt und
// (b) bestehende, vollstaendige Altprofile OHNE onboarding_status NICHT erneut
// ins Onboarding gezwungen (Bewertung ueber die echten Kernfelder).
function isProfileOperational(profile = {}) {
  const p = profile || {};
  if (!hasOperationalCore(p)) return false;
  const status = String(p.onboardingStatus || "").trim().toLowerCase();
  if (status === "abgeschlossen") return true;
  if (status === "neu" || status === "in_bearbeitung") return false;
  return true; // Altprofil ohne Workflow-Status: Kern ist erfuellt -> einsatzbereit.
}

// Zentrale Bewertung. Gibt Zustand + fehlende Pflichtfelder + Funktionsauswirkung.
function validateProfile(profile = {}) {
  const p = profile || {};
  const disabled = isDisabled(p);

  // --- Pflichtfelder je Achse sammeln (auch wenn deaktiviert, fuer die Anzeige) ---
  const base = profileCompleteness(p); // liefert missing: fullName/party/committee_or_topics/state
  const missing = [];
  if (!hasStr(p.fullName) && !hasStr(p.name)) missing.push("name");
  if (!hasStr(p.id)) missing.push("nutzerId");
  // Partei ODER bewusst „fraktionslos" (dann ist party gesetzt = "Fraktionslos").
  if (!hasStr(p.party) && !hasStr(p.faction)) missing.push("partei_oder_fraktionslos");
  const ebene = parliamentTypeOf(p); // "Bundestag" | "Landtag" | ""
  if (!ebene) missing.push("mandatsebene");
  if (ebene === "Landtag" && !hasStr(p.state) && !hasStr(p.bundesland)) missing.push("bundesland");
  if (!hasRegion(p)) missing.push("region_oder_wahlkreis");
  const hasCommittee = hasStr(p.committee) || hasList(p.committees);
  const hasTopics = hasList(p.focusTopics) || (p.topicPriorities && typeof p.topicPriorities === "object" && Object.keys(p.topicPriorities).length > 0);
  if (!hasCommittee && !hasTopics) missing.push("schwerpunkt_oder_ausschuss");

  const budgetProblems = budgetCheck(p);

  // --- Zustand bestimmen (Reihenfolge = Prioritaet) ---
  let state;
  let reason = "";
  if (disabled) {
    state = STATES.DISABLED;
    reason = "Profil ist deaktiviert oder gelöscht — nimmt an keiner Verarbeitung teil.";
  } else if (budgetProblems.length) {
    state = STATES.INVALID;
    reason = `Ungültige Kostenbegrenzung: ${budgetProblems.map((b) => b.label).join(", ")} muss eine positive Zahl sein.`;
  } else {
    // Identitaet vorhanden? (Name ODER Partei) -> sonst „nicht bereit" (leer).
    const hasIdentity = hasStr(p.fullName) || hasStr(p.name) || hasStr(p.party);
    if (!hasIdentity) {
      state = STATES.NOT_READY;
      reason = "Profil ist praktisch leer — weder Name noch Partei hinterlegt.";
    } else if (missing.length === 0) {
      state = STATES.COMPLETE;
      reason = "Alle Pflichtfelder vorhanden.";
    } else {
      state = STATES.PARTIAL;
      reason = `Teilweise befüllt — es fehlen: ${missing.map(fieldLabel).join(", ")}.`;
    }
  }

  // --- Funktionsauswirkung ---
  // Ein Profil kann nur dann personalisiert versorgt werden, wenn es aktiv ist UND
  // mindestens eine Matching-Dimension (Ausschuss/Themen ODER Partei ODER Region)
  // traegt. Ohne das laufen die Jobs technisch, liefern aber nichts Passendes.
  const usable = state === STATES.COMPLETE || state === STATES.PARTIAL;
  const hasAnyMatchDimension = hasCommittee || hasTopics || hasStr(p.party) || hasStr(p.faction) || hasRegion(p);
  const impact = {
    kannBriefingErhalten: usable && hasAnyMatchDimension,
    kannRadar: usable && (hasStr(p.fullName) || hasStr(p.name)), // Radar braucht mind. einen Namen fuer Personentreffer
    kannLagePersonalisieren: usable && hasAnyMatchDimension,
    kannHelmutEmpfehlen: usable && hasAnyMatchDimension
  };

  return {
    state,
    stateLabel: stateLabel(state),
    reason,
    ready: state === STATES.COMPLETE,
    usable,
    disabled,
    missingRequired: missing,
    missingRequiredLabels: missing.map(fieldLabel),
    budgetProblems,
    parliamentType: ebene || null,
    impact,
    // Einsatzbereitschaft (Onboarding-Gate) — EINE Quelle: isProfileOperational.
    // Bewusst getrennt von `ready`/`state` (die zusaetzlich Ausschuss/Thema als
    // Pflicht fuehren); `operational` folgt exakt dem Kern ohne die optionalen Felder.
    operational: isProfileOperational(p),
    operationalMissing: operationalCoreMissing(p),
    // Roh-Completeness fuer Konsumenten, die die alte Achse brauchen:
    completeness: base
  };
}

function fieldLabel(key) {
  return {
    name: "Name",
    nutzerId: "Nutzer-ID",
    partei_oder_fraktionslos: "Partei (oder „fraktionslos“)",
    mandatsebene: "Mandatsebene (Bundestag/Landtag)",
    bundesland: "Bundesland",
    region_oder_wahlkreis: "Region oder Wahlkreis",
    schwerpunkt_oder_ausschuss: "mind. ein Schwerpunkt oder Ausschuss"
  }[key] || key;
}

function stateLabel(state) {
  return {
    [STATES.COMPLETE]: "Vollständig",
    [STATES.PARTIAL]: "Teilweise vollständig",
    [STATES.NOT_READY]: "Nicht bereit",
    [STATES.INVALID]: "Fehlerhaft",
    [STATES.DISABLED]: "Deaktiviert"
  }[state] || state;
}

// Kurze, gruenderverstaendliche Erklaerung je Zustand (fuer die Admin-Anzeige).
function stateExplanation(state) {
  return {
    [STATES.COMPLETE]: "Profil ist vollständig — Helmut kann es voll versorgen.",
    [STATES.PARTIAL]: "Profil funktioniert, aber einzelne Pflichtangaben fehlen — Personalisierung ist eingeschränkt.",
    [STATES.NOT_READY]: "Profil ist noch nicht nutzbar — es fehlen die Grundangaben (Name/Partei).",
    [STATES.INVALID]: "Profil hat einen Fehler (z. B. ungültiges KI-Budget) und muss korrigiert werden.",
    [STATES.DISABLED]: "Profil ist deaktiviert — es erhält keine Inhalte und nimmt an keiner Verarbeitung teil."
  }[state] || "";
}

module.exports = {
  STATES,
  validateProfile,
  isProfileOperational,
  hasOperationalCore,
  operationalCoreMissing,
  isDisabled,
  budgetCheck,
  hasRegion,
  fieldLabel,
  stateLabel,
  stateExplanation
};
