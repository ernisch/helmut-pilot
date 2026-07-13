"use strict";

// Helmut Core V3 — C7b: JSON-Schema + Validator fuer knowledge_objects.
// Wird VOM GOLDSET geprueft und spaeter (C7) vom echten understandDocument()-Call
// als Structured-Output-Vertrag genutzt (Form erzwingen). Reine, deps-freie Logik.
//
// DSGVO by design:
//   - Alle Pflichtfelder muessen praesent sein (auch leer []), damit die KI keine
//     Felder "vergisst" und spaeter kein Nachfassen (2. Call) noetig ist.
//   - dsgvoScan() verbietet Kontakt-/PII-Felder und E-Mail-Muster und stellt sicher,
//     dass mentioned_* kurze OEFFENTLICHE Labels sind (Erwaehnung, kein Dossier).
//   - mentioned_* sind ausschliesslich oeffentlich-politische Akteure — es werden
//     keine privaten Personenprofile aus Artikeln abgeleitet.
//
// UI-Zeigefelder (display_title, display_summary, why_relevant, recommendation,
// display_category): werden vom selben Understanding-Call miterzeugt (KEIN
// zusaetzlicher KI-Aufruf) und dauerhaft im knowledge_object gespeichert. Lage
// (und spaeter Radar/Helmut/Benachrichtigungen/Detailansicht) liest nur noch
// diese fertigen Felder, statt Titel/Text beim Rendern selbst zu kuerzen.

const MENTION_FIELDS = [
  "mentioned_people", "mentioned_mps", "mentioned_parties", "mentioned_committees",
  "mentioned_ministries", "mentioned_locations", "mentioned_organizations"
];

// Stabschef-Felder (V3-Fundament). Prosa-Felder + eine strukturierte Liste.
// Additiv, NICHT required — siehe Kommentar am Schema unten. Als Konstante
// exportiert, damit understanding.js (Assemble) und der Contract-Adapter/Tests
// dieselbe Wahrheit nutzen (keine duplizierten String-Listen).
const HELMUT_STAFF_PROSE_FIELDS = ["risk_of_no_action", "opportunity_summary", "recommended_communication"];
const HELMUT_STAFF_LIST_FIELDS = ["action_items"];
const HELMUT_STAFF_FIELDS = [...HELMUT_STAFF_PROSE_FIELDS, ...HELMUT_STAFF_LIST_FIELDS];

// Strukturierte Stabschef-Werte (V3-Fundament, Runde 2). Enums als single source of
// truth — Assemble/Contract-Adapter/Tests sanitisieren gegen genau diese Listen.
// "unknown" ist ausdruecklich ein GUELTIGER, EHRLICHER Wert (kein Rateversuch im
// Frontend): ist etwas nicht serioes ableitbar, steht hier unknown bzw. leer.
const HELMUT_LEVEL_ENUM = ["low", "medium", "high", "unknown"];
const HELMUT_COMM_CHANNEL_ENUM = ["press", "social", "internal", "parliamentary", "none", "unknown"];
const HELMUT_COMM_FORMAT_ENUM = ["statement", "pressRelease", "qa", "socialPost", "internalLine", "none", "unknown"];
const HELMUT_ACTION_PRIORITY_ENUM = ["low", "medium", "high", "unknown"];
const HELMUT_ACTION_TYPE_ENUM = ["alignInternally", "prepareStatement", "prepareQA", "monitor", "delegate", "ignore", "none", "unknown"];

const ZEITDRUCK_ENUM = ["hoch", "mittel", "niedrig", "keiner"];
const STATUS_ENUM = ["neu", "update", "beobachtung", "abgeschlossen"];

// --- Klassifikation (Sprint 2): politische Ebene / Geografie / Entitaeten ----
// Additiv, NICHT required. Die Werte werden vom Understanding-Call miterzeugt UND
// deterministisch aus den belegten Feldern abgeleitet (lib/helmut/quellenarchitektur/
// classification.js) -> decision_level ist NIE leer (behebt "political_level 0/231").
// DECISION_LEVEL_ENUM muss zu classification.LEVELS (+ "unknown") konsistent bleiben
// (wird im Test geprueft). "unknown" ist ein gueltiger, ehrlicher Wert.
const DECISION_LEVEL_ENUM = ["international", "eu", "bund", "land", "kommune", "unknown"];
const EVENT_TYPE_ENUM = [
  "gesetzentwurf", "verordnung", "antrag", "anfrage", "anhoerung", "abstimmung",
  "kabinettsbeschluss", "urteil", "bericht", "personalie", "protest", "sonstiges", "unknown"
];
const GEO_LEVEL_ENUM = ["international", "eu", "bund", "land", "bezirk", "kreis", "kommune", "unknown"];

// JSON-Schema (draft-07-nah) — single source of truth fuer Struktur & Pflichtfelder.
const KNOWLEDGE_OBJECT_SCHEMA = {
  type: "object",
  additionalProperties: true, // erlaubt zusaetzliche V3-Spalten (tags, stage, deadline, ...)
  required: [
    "id", "vorgang_id", "status", "confidence_score", "source_document_count",
    "was_ist_passiert", "warum_wichtig", "wer_ist_betroffen", "zeitdruck", "handlungsempfehlung",
    "parteien", "ausschuesse", "ministerien", "risiken", "chancen",
    "mentioned_people", "mentioned_mps", "mentioned_parties", "mentioned_committees",
    "mentioned_ministries", "mentioned_locations", "mentioned_organizations"
  ],
  properties: {
    id: { type: "string", minLength: 1 },
    vorgang_id: { type: "string", minLength: 1 },
    ko_version: { type: "integer", minimum: 1 },
    headline: { type: "string" },
    status: { type: "string", enum: STATUS_ENUM },
    confidence_score: { type: "integer", minimum: 0, maximum: 100 },
    source_document_count: { type: "integer", minimum: 0 },
    // Pflicht-Analyse (Prosa, nicht leer):
    was_ist_passiert: { type: "string", minLength: 1 },
    warum_wichtig: { type: "string", minLength: 1 },
    wer_ist_betroffen: { type: "string", minLength: 1 },
    zeitdruck: { type: "string", enum: ZEITDRUCK_ENUM },
    handlungsempfehlung: { type: "string", minLength: 1 },
    // Strukturierte Listen (duerfen leer sein, muessen aber praesent sein):
    parteien: { type: "array", items: { type: "string" } },
    ausschuesse: { type: "array", items: { type: "string" } },
    ministerien: { type: "array", items: { type: "string" } },
    risiken: { type: "array", items: { type: "string" } },
    chancen: { type: "array", items: { type: "string" } },
    // Radar-Erwaehnungen (oeffentlich-politisch):
    mentioned_people: { type: "array", items: { type: "string" } },
    mentioned_mps: { type: "array", items: { type: "string" } },
    mentioned_parties: { type: "array", items: { type: "string" } },
    mentioned_committees: { type: "array", items: { type: "string" } },
    mentioned_ministries: { type: "array", items: { type: "string" } },
    mentioned_locations: { type: "array", items: { type: "string" } },
    mentioned_organizations: { type: "array", items: { type: "string" } },
    // Praesentations-Vertrag (display_*): additiv, gleicher KI-Call, NICHT required.
    // Dies ist die EINZIGE Quelle fuer Darstellungstexte eines Vorgangs — jede
    // Oberflaeche (Lage, Detailansicht, Radar, Suche, Push, Widgets, spaetere
    // Dashboards) liest genau diese fertigen Felder. Keine Oberflaeche erzeugt,
    // kuerzt oder repariert je selbst Text (Single Source of Truth).
    //
    // display_title ist DER kanonische Anzeige-Titel des Vorgangs (der "headline"
    // ist demgegenueber nur die rohe, undisziplinierte Modell-Schlagzeile und
    // dient ab jetzt nur noch als Legacy-Fallback fuer Alt-Vorgaenge).
    //
    // Bewusst wie "headline" NICHT required/minLength-geprueft — ein einzelnes
    // schwaches UI-Feld darf nie die gesamte Analyse (was_ist_passiert etc.) zu
    // Fall bringen. display_title/display_category werden bei Ueberlaenge ODER
    // schlechter Qualitaet (Fragment, Ellipse, schwaches Schlusswort) in
    // assembleKnowledgeObject VERWORFEN (nie abgeschnitten) — die maxLength hier
    // ist die harte Struktur-Obergrenze, die eigentliche Qualitaetspruefung
    // (isValidDisplayTitle) sitzt in understanding.js. maxLength 64 ~ "max. 60
    // Zeichen" mit kleiner Toleranz, damit ein guter 61-63-Zeichen-Titel nicht
    // unnoetig auf den Legacy-Titel zurueckfaellt.
    display_title: { type: "string", maxLength: 64 },
    display_summary: { type: "string", maxLength: 320 },
    // why_relevant: bis zu 3 kurze Saetze (politische Relevanz + Handlungsgrund).
    why_relevant: { type: "string", maxLength: 260 },
    // recommendation: bis zu 3-4 kurze Entscheidungssaetze (rueckwaertsvertraeglich —
    // Alt-Werte sind kuerzer). Obergrenze nur gelockert, nicht der Vertrag gebrochen.
    recommendation: { type: "string", maxLength: 240 },
    display_category: { type: "string", maxLength: 26 },
    // Stabschef-Felder (V3-Fundament fuer den spaeteren Helmut-Stabschefstand):
    // Entstehen additiv im SELBEN einmaligen Understanding-Call (KEIN Extra-Call),
    // beschreiben den VORGANG global (nicht pro Nutzer). Bewusst wie display_* NICHT
    // required und NICHT minLength-geprueft -- ein Modell, das sie nicht liefert,
    // darf die Analyse (was_ist_passiert etc.) NIE zu Fall bringen. Fehlt/ungueltig
    // -> assembleKnowledgeObject setzt "" bzw. []. Kein Demo-Text, kein Fallback:
    // lieber ehrlich leer als erfunden (spaetere Adapter lesen daraus qualityStatus).
    //   risk_of_no_action        = was politisch/kommunikativ passiert OHNE Reaktion
    //   opportunity_summary      = erkennbare politische/kommunikative Chance
    //   recommended_communication= empfohlene Kommunikationslinie/-format
    //   action_items             = konkrete naechste Schritte (strukturierte Liste)
    risk_of_no_action: { type: "string", maxLength: 400 },
    opportunity_summary: { type: "string", maxLength: 400 },
    recommended_communication: { type: "string", maxLength: 240 },
    action_items: { type: "array", items: { type: "string" } },
    // Strukturierte Stabschef-Werte (Runde 2, additiv, NICHT required). Alle
    // rueckwaertsverträglich NEBEN den Alt-Feldern (recommended_communication text /
    // action_items text[]) -- Alt-Felder werden NICHT gebrochen. Fehlt/ungueltig ->
    // Assemble setzt "unknown"/leer. "unknown" ist ein gueltiger, ehrlicher Enum-Wert.
    risk_level: { type: "string", enum: HELMUT_LEVEL_ENUM },
    opportunity_level: { type: "string", enum: HELMUT_LEVEL_ENUM },
    // Strukturierte Kommunikationsempfehlung (die Alt-Spalte bleibt die Kurzzeile):
    recommended_communication_struct: {
      type: "object",
      properties: {
        communicationLine: { type: "string", maxLength: 240 },
        recommendedChannel: { type: "string", enum: HELMUT_COMM_CHANNEL_ENUM },
        recommendedFormat: { type: "string", enum: HELMUT_COMM_FORMAT_ENUM },
        suggestedOutputs: { type: "array", items: { type: "string", maxLength: 40 } }
      }
    },
    // Strukturierte naechste Schritte (die Alt-Spalte action_items[] bleibt die Titelliste):
    action_items_struct: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", maxLength: 160 },
          description: { type: "string", maxLength: 400 },
          dueHint: { type: "string", maxLength: 80 },
          priority: { type: "string", enum: HELMUT_ACTION_PRIORITY_ENUM },
          actionType: { type: "string", enum: HELMUT_ACTION_TYPE_ENUM }
        }
      }
    },
    // --- Klassifikation (Sprint 2), additiv/NICHT required. Deriver fuellt Luecken. ---
    // decision_level: die politische ENTSCHEIDUNGS-Ebene des Vorgangs.
    decision_level: { type: "string", enum: DECISION_LEVEL_ENUM },
    // related_levels: weitere beruehrte Ebenen (z. B. Bundesgesetz mit Laenderwirkung).
    related_levels: { type: "array", items: { type: "string", enum: DECISION_LEVEL_ENUM } },
    // event_type: Ereignistyp (Gesetzentwurf, Anhoerung, Abstimmung, ...).
    event_type: { type: "string", enum: EVENT_TYPE_ENUM },
    // affected_geographies / mentioned_geographies: strukturierte Geo-Objekte
    // (Wahlkreis ist KEINE Ebene -> geo-level ohne "wahlkreis"). geography_id ist eine
    // OPTIONALE Referenz auf public.geographies (string, ODER null bei unaufgeloestem Ort)
    // -> bewusst NICHT als strikt-string deklariert (der Validator laesst undeklarierte
    // Keys zu, damit null gueltig bleibt: "erhalten, aber unaufgeloest").
    affected_geographies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", maxLength: 120 },
          level: { type: "string", enum: GEO_LEVEL_ENUM }
        }
      }
    },
    mentioned_geographies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", maxLength: 120 },
          level: { type: "string", enum: GEO_LEVEL_ENUM }
        }
      }
    },
    // decision_entities: handelnde Institutionen; related_entities: erwaehnte Akteure.
    // entity_id ist eine OPTIONALE Referenz auf public.political_entities (string ODER null
    // bei unaufgeloester Entitaet) -> wie geography_id bewusst nicht strikt-string deklariert.
    decision_entities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", maxLength: 120 },
          type: { type: "string", maxLength: 40 }
        }
      }
    },
    related_entities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", maxLength: 120 },
          type: { type: "string", maxLength: 40 }
        }
      }
    },
    // classification_confidence: dimensionierte Konfidenz (kein einzelner Score).
    classification_confidence: {
      type: "object",
      properties: {
        level: { type: "string", enum: HELMUT_LEVEL_ENUM },
        geography: { type: "string", enum: HELMUT_LEVEL_ENUM },
        entities: { type: "string", enum: HELMUT_LEVEL_ENUM },
        event_type: { type: "string", enum: HELMUT_LEVEL_ENUM }
      }
    }
  }
};

function jsonType(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function checkValue(value, spec, path, errors) {
  if (spec.type === "array") {
    if (!Array.isArray(value)) { errors.push(`${path}: erwartet array, ist ${jsonType(value)}`); return; }
    if (spec.items) value.forEach((el, i) => checkValue(el, spec.items, `${path}[${i}]`, errors));
    return;
  }
  if (spec.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${path}: erwartet object, ist ${jsonType(value)}`); return;
    }
    // Nur die deklarierten Sub-Properties pruefen (lenient: unbekannte Keys ignoriert).
    for (const [k, sub] of Object.entries(spec.properties || {})) {
      if (value[k] !== undefined) checkValue(value[k], sub, `${path}.${k}`, errors);
    }
    return;
  }
  if (spec.type === "integer") {
    if (!Number.isInteger(value)) { errors.push(`${path}: erwartet integer, ist ${jsonType(value)}`); return; }
    if (spec.minimum !== undefined && value < spec.minimum) errors.push(`${path}: ${value} < min ${spec.minimum}`);
    if (spec.maximum !== undefined && value > spec.maximum) errors.push(`${path}: ${value} > max ${spec.maximum}`);
    return;
  }
  if (spec.type === "string") {
    if (typeof value !== "string") { errors.push(`${path}: erwartet string, ist ${jsonType(value)}`); return; }
    if (spec.minLength !== undefined && value.trim().length < spec.minLength) errors.push(`${path}: leer/zu kurz`);
    if (spec.maxLength !== undefined && value.length > spec.maxLength) errors.push(`${path}: zu lang (${value.length} > ${spec.maxLength})`);
    if (spec.enum && !spec.enum.includes(value)) errors.push(`${path}: '${value}' nicht in {${spec.enum.join(", ")}}`);
  }
}

// Struktur-/Pflichtfeld-Validierung gegen das Schema.
function validateKnowledgeObject(ko = {}, schema = KNOWLEDGE_OBJECT_SCHEMA) {
  const errors = [];
  if (!ko || typeof ko !== "object" || Array.isArray(ko)) {
    return { valid: false, errors: ["knowledge_object ist kein Objekt"] };
  }
  for (const key of schema.required || []) {
    if (ko[key] === undefined) errors.push(`Pflichtfeld fehlt: ${key}`);
  }
  for (const [key, spec] of Object.entries(schema.properties || {})) {
    if (ko[key] !== undefined) checkValue(ko[key], spec, key, errors);
  }
  errors.push(...dsgvoScan(ko));
  return { valid: errors.length === 0, errors };
}

// DSGVO: keine Kontakt-/PII-Felder, keine E-Mail-Muster, mentioned_* nur kurze
// oeffentliche Labels (Erwaehnung, kein privates Personenprofil/Dossier).
const FORBIDDEN_PII_KEYS = [
  "email", "e_mail", "mail", "phone", "telefon", "tel", "handy", "address", "adresse",
  "anschrift", "private", "privat", "geburtsdatum", "geburtstag", "dob", "iban",
  "ssn", "sozialversicherung", "personalausweis", "passport", "kontakt"
];
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const MENTION_MAX_LEN = 120;

function dsgvoScan(ko) {
  const errors = [];
  for (const key of Object.keys(ko)) {
    const low = key.toLowerCase();
    if (FORBIDDEN_PII_KEYS.some((f) => low.includes(f))) errors.push(`DSGVO: verbotenes PII-Feld '${key}'`);
  }
  const scan = (value, path) => {
    if (typeof value === "string") {
      if (EMAIL_RE.test(value)) errors.push(`DSGVO: E-Mail-Muster in ${path}`);
    } else if (Array.isArray(value)) {
      value.forEach((el, i) => scan(el, `${path}[${i}]`));
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([k, v]) => scan(v, `${path}.${k}`));
    }
  };
  scan(ko, "ko");
  for (const field of MENTION_FIELDS) {
    for (const entry of ko[field] || []) {
      if (typeof entry === "string" && entry.length > MENTION_MAX_LEN) {
        errors.push(`DSGVO: ${field}-Eintrag zu lang (${entry.length}) — Erwaehnung, kein Dossier`);
      }
    }
  }
  return errors;
}

const GOLDSET_CASE_TYPES = [
  "neuer_vorgang", "update_bestehender_vorgang", "mehrere_artikel_selber_vorgang",
  "lokaler_bezug", "partei_bezug", "ausschuss_bezug", "abgeordneten_erwaehnung"
];

// Ein raw_document im Goldset muss datenminimiert sein (wie C6 toRawDocumentRow):
// KEIN Volltext/excerpt/imageUrl/Autor-PII.
const FORBIDDEN_RAWDOC_KEYS = ["content", "excerpt", "imageurl", "image_url", "author", "body", "volltext"];

function validateGoldset(goldset) {
  const errors = [];
  const cases = (goldset && Array.isArray(goldset.cases)) ? goldset.cases : null;
  if (!cases) return { valid: false, errors: ["Goldset hat kein cases[]-Array"], caseTypes: [] };

  const seenTypes = new Set();
  cases.forEach((c, i) => {
    const label = c && c.name ? c.name : `#${i}`;
    if (!c || typeof c !== "object") { errors.push(`Fall ${label}: kein Objekt`); return; }
    if (!GOLDSET_CASE_TYPES.includes(c.case_type)) errors.push(`Fall ${label}: unbekannter case_type '${c.case_type}'`);
    else seenTypes.add(c.case_type);
    if (!Array.isArray(c.raw_documents) || c.raw_documents.length === 0) {
      errors.push(`Fall ${label}: raw_documents fehlt/leer`);
    } else {
      c.raw_documents.forEach((doc, j) => {
        for (const key of Object.keys(doc || {})) {
          if (FORBIDDEN_RAWDOC_KEYS.includes(key.toLowerCase())) {
            errors.push(`Fall ${label} raw_documents[${j}]: DSGVO — verbotenes Feld '${key}' (Volltext/PII)`);
          }
        }
      });
    }
    const res = validateKnowledgeObject(c.expected);
    res.errors.forEach((e) => errors.push(`Fall ${label} expected: ${e}`));
  });

  const missingTypes = GOLDSET_CASE_TYPES.filter((t) => !seenTypes.has(t));
  if (missingTypes.length) errors.push(`Nicht abgedeckte Fall-Typen: ${missingTypes.join(", ")}`);

  return { valid: errors.length === 0, errors, caseTypes: [...seenTypes] };
}

module.exports = {
  KNOWLEDGE_OBJECT_SCHEMA,
  MENTION_FIELDS,
  HELMUT_STAFF_FIELDS,
  HELMUT_STAFF_PROSE_FIELDS,
  HELMUT_STAFF_LIST_FIELDS,
  HELMUT_LEVEL_ENUM,
  HELMUT_COMM_CHANNEL_ENUM,
  HELMUT_COMM_FORMAT_ENUM,
  HELMUT_ACTION_PRIORITY_ENUM,
  HELMUT_ACTION_TYPE_ENUM,
  GOLDSET_CASE_TYPES,
  ZEITDRUCK_ENUM,
  STATUS_ENUM,
  DECISION_LEVEL_ENUM,
  EVENT_TYPE_ENUM,
  GEO_LEVEL_ENUM,
  validateKnowledgeObject,
  validateGoldset,
  dsgvoScan
};
