"use strict";

// Helmut Core V3 — C7: Erster echter Understanding-Call, im SCHATTEN.
// "Einmal verstehen (global, KI) -> mehrfach bewerten (pro Nutzer, 0 KI)".
//
// Ablauf (global, mandantenlos):
//   raw_documents -> deterministisches Vorgangs-Clustering (KEINE KI)
//     -> pro NEUEM Vorgang: globaler Lock + Budget-Gate -> 1 KI-Call (Azure gpt-5-mini,
//        strukturierte JSON-Ausgabe) -> Validierung gegen understanding-schema
//     -> gueltig: knowledge_objects speichern; ungueltig: sauber skippen + loggen.
//
// Es wird NIE pro Nutzer verstanden: keine politicianId im Pfad (Budget global mit
// null), Idempotenz pro vorgang_id (existiert ein KO -> kein KI-Call). Kein Frontend.
//
// UI-Zeigefelder (display_title/display_summary/why_relevant/recommendation/
// display_category): entstehen HIER, im selben einmaligen KI-Call wie die
// uebrige Analyse (buildUnderstandingPrompt fragt sie zusaetzlich ab, KEIN
// zweiter Call). assembleKnowledgeObject saeubert/kappt sie und speichert sie
// dauerhaft im KO. Lage & Co. lesen diese Felder danach nur noch -- es findet
// beim Rendern keinerlei Umformulierung/KI-Aufruf statt.
//
// DSGVO: Der KI-Input sind ausschliesslich MINIMIERTE raw_documents (Schlagzeile +
// gekuerzter Kontext, kein Volltext). Das gespeicherte KO wird aus einer WHITELIST
// gebaut (kein Modell-Freitextfeld landet in der DB); mentioned_* werden auf kurze
// oeffentliche Labels reduziert; PII/E-Mail wird gefiltert bzw. fuehrt zum Skip.

const { toRawDocumentRow, dedupeRawDocuments } = require("./dedup");
const { KNOWLEDGE_OBJECT_SCHEMA, validateKnowledgeObject, ZEITDRUCK_ENUM, MENTION_FIELDS,
  HELMUT_STAFF_PROSE_FIELDS, HELMUT_STAFF_LIST_FIELDS,
  HELMUT_LEVEL_ENUM, HELMUT_COMM_CHANNEL_ENUM, HELMUT_COMM_FORMAT_ENUM,
  HELMUT_ACTION_PRIORITY_ENUM, HELMUT_ACTION_TYPE_ENUM } = require("./understanding-schema");
// Stabschef-Sprache (Sprach-Sprint): Persona/Ton, Sprachverbote, Briefing-Typen.
// Reine Textbausteine — keine KI, keine Datenarchitektur (siehe briefingLanguage.js).
const { STABSCHEF_VOICE, SPRACHVERBOTE, buildBriefingTypeInstruction } = require("./briefingLanguage");
// Sprint 2: deterministische KO-Klassifikation (Ebene/Geografie/Entitaeten/Konfidenz).
// Reine Logik (kein Netz/KI) -> fuellt Luecken der KI-Antwort und garantiert NIE-leere
// decision_level. Aufloesung gegen die Sprint-1-Seeds (Geografie/Entitaet).
const { classifyKnowledgeObject } = require("./quellenarchitektur/classification");
// Understanding-Gate (VORBEREITET, Guard HELMUT_UNDERSTANDING_GATE, Default AUS). Bei 'off'
// wird der Gate NIE aufgerufen (byte-identisches Altverhalten). 'shadow' berechnet + protokolliert
// nur; blockiert nichts. Reine Logik, kein Netz/KI.
const understandingGate = require("./quellenarchitektur/understanding-gate");
const { clustersInPriorityOrder, grossereignisseZuerst, grossereignisSignale } = require("./quellenarchitektur/understanding-priority");
const { isTerminalUnderstandingStatus } = require("./pending-terminal");
// ATOMARER VERSTEHENSVERTRAG (OP-30 CAS, Migration 20260814180000, Flag
// HELMUT_VERSTEHEN_CAS — Default AUS). Loest den Karten-Store der Update-Vormerkungen
// (Lesen -> Aendern -> Schreiben) durch eine Zeile je Vorgang mit Besitzer, Lease und
// monotonem Fencing-Wert ab. Erst damit ist Verstehensparallelitaet > 1 sicher.
const verstehenVertragModul = require("./verstehen-vertrag");
const verstehenRestzeit = require("./verstehen-restzeit");

// P1-3: Understanding-Priorisierung scharfschalten (freigabepflichtig, Default AUS).
// Ohne Flag bleibt die Ankunftsreihenfolge byte-identisch erhalten.
function understandingPriorityEnabled() {
  const v = String(process.env.HELMUT_UNDERSTANDING_PRIORITY || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

// --- Deterministisches Vorgangs-Clustering (keine KI) -----------------------
// Die Ankerbildung, die Clusterbildung und die Vorgangskennung liegen seit dem
// Sprint zu Betriebsbefund B4 in lib/helmut/vorgang-identity.js — einem reinen
// Logikmodul ohne Netz/KI/DB/Uhr. Der Grund steht dort ausfuehrlich im Kopf:
// die Altfassung hat ueber eine 8-Zeichen-Ankerschwelle, einen freien
// Teilstring-Vergleich und eine Ein-Wort-Kennung politisch relevante Ereignisse
// lautlos verloren (docs/befund-csd-2026-vorgangsverlust.md).
//
// Die Namen bleiben unveraendert exportiert — scheduler.js, server.js, backfill.js
// und die Testskripte greifen weiterhin ueber understanding.js darauf zu.
const {
  clusterRawDocuments, deriveVorgangId, candidatePrefixes, sameVorgang, neueErkenntnisse,
  selectPromptDocuments
} = require("./vorgang-identity");

// Bestes Quell-Dokument eines Clusters (fuer den best_source_url-Pointer am KO).
// Rangfolge wie dedup.rowRank: Direktlink > hohe Sicherheit > kanonische URL,
// dann j=neuestes published_at. Kein Netz, keine KI.
function pickBestSourceDoc(documents = []) {
  const docs = (Array.isArray(documents) ? documents : []).filter(Boolean);
  if (!docs.length) return null;
  const rank = (d) => {
    let s = 0;
    if ((d.link_type || d.linkType) === "direct") s += 20;
    if (d.confidence === "high") s += 10;
    if (d.canonical_url || d.url) s += 5;
    return s;
  };
  return docs.slice().sort((a, b) =>
    (rank(b) - rank(a)) || String(b.published_at || "").localeCompare(String(a.published_at || ""))
  )[0];
}

// --- Prompt (DSGVO-Regeln fest eingebaut) -----------------------------------
// opts.briefingType (optional): bereitet einen SPAETEREN Briefing-Motor sprachlich
// vor (Morgen/Mittag/Abend). Der aktuelle globale Understanding-Call ruft OHNE Typ
// auf -> es wird KEIN typ-spezifischer Block angehaengt (rueckwaertsverträglich).
// PROMPT_DOKUMENTE: harte Obergrenze der Dokumente im Prompt (Kosten + Kontext).
// WELCHE zwoelf, entscheidet selectPromptDocuments — nicht mehr die Cluster-
// Reihenfolge (die nach Dokumentkennung sortiert ist und damit faktisch
// zufaellig war). Begruendung der Auswahlregel: vorgang-identity.js.
const PROMPT_DOKUMENTE = 12;

function buildUnderstandingPrompt(cluster = {}, opts = {}) {
  const docs = selectPromptDocuments(cluster.documents || [], PROMPT_DOKUMENTE).map((d, i) =>
    `${i + 1}. ${d.title || "(ohne Titel)"}${d.summary ? ` — ${d.summary}` : ""} [${d.source_name || d.source_id || "Quelle"}${d.published_at ? `, ${String(d.published_at).slice(0, 10)}` : ""}]`
  ).join("\n");
  const felder = (KNOWLEDGE_OBJECT_SCHEMA.required || []).join(", ");
  // Typ-spezifische Sprach-Anweisung nur, wenn ein Typ uebergeben wird (Vorbereitung
  // fuer den spaeteren Datenmotor). Ohne opts.briefingType bleibt der Prompt wie bisher.
  const briefingBlock = opts.briefingType ? buildBriefingTypeInstruction(opts.briefingType) : [];
  return [
    // A. Grundprinzip Stabschef-Sprache (Persona + Ton): Helmut schreibt als
    // politischer Stabschef an die/den Abgeordnete/n. Die Quellen-Disziplin bleibt.
    ...STABSCHEF_VOICE,
    "Analysiere den folgenden politischen VORGANG ausschliesslich anhand der unten",
    "genannten oeffentlichen Schlagzeilen/Kurzzusammenfassungen mehrerer Quellen.",
    "Antworte NUR mit einem JSON-Objekt (kein Markdown, keine Erklaerung).",
    ...(briefingBlock.length ? ["", ...briefingBlock] : []),
    "",
    "Pflichtfelder (alle ausgeben, Listen ggf. leer []):",
    felder + ".",
    `zeitdruck muss einer von {${ZEITDRUCK_ENUM.join(", ")}} sein. confidence_score ist 0-100.`,
    "",
    "AKTEUR vs. ERWAEHNUNG (entscheidet spaeter ueber den persoenlichen Umfeld-Bezug — bitte streng trennen):",
    "- parteien: NUR Parteien/Fraktionen, die im Vorgang STRUKTURELL beteiligt sind — sie handeln, fordern,",
    "  kritisieren, beschliessen, veroeffentlichen, positionieren sich, sind direkt adressiert/angegriffen ODER",
    "  sind Hauptakteur der politischen Entwicklung. Eine Partei, die im Text nur beilaeufig genannt oder von",
    "  Dritten kommentiert wird (z. B. in einem Medien-/Aussenpolitikartikel), gehoert NICHT in parteien.",
    "- mentioned_parties: Parteien, die lediglich ERWAEHNT werden (Nennung ohne eigene Handlung im Vorgang).",
    "- Gleiche Logik fuer ausschuesse (strukturell beteiligt) vs. mentioned_committees (nur erwaehnt).",
    "  Im Zweifel eng zuordnen: lieber mentioned_* als parteien/ausschuesse (keine zu breite Beteiligung).",
    "",
    "Zusaetzliche UI-Felder (gleiche Antwort, ebenfalls ausgeben):",
    "- display_title: der offizielle politische VORGANGSTITEL -- die EINE Ueberschrift fuer ALLE",
    "  Oberflaechen (Lage, Radar, Suche, Push, Detailansicht, Widgets). Er beantwortet",
    "  AUSSCHLIESSLICH die Frage: 'WELCHER politische Vorgang ist hier passiert?' -- NIEMALS",
    "  'Wie beginnt der Artikel?'. Er ist ein neu formulierter, abstrahierter Vorgangstitel,",
    "  KEINE gekuerzte Schlagzeile und KEIN Satzanfang.",
    "  ABSTRAHIEREN, NICHT KUERZEN: Formuliere den politischen Kern EIGENSTAENDIG neu. Kopiere",
    "  NICHT den ersten Satz / die Schlagzeile der Quelle, loesche NICHT nur Woerter am Ende.",
    "  Frage dich: Welcher Akteur tut politisch was zu welchem Thema? -- und schreibe GENAU das.",
    "  BAUFORM: [Akteur] + [politische Handlung, aktives Verb] + [Thema]. Beispiele fuer die Form:",
    "  'X beschliesst ...', 'X fordert ...', 'X lehnt ... ab', 'X verschaerft ...',",
    "  'X einigt sich auf ...', 'X veroeffentlicht ...', 'X positioniert sich gegen ...',",
    "  'X bekraeftigt ...'. Der Akteur darf abstrahiert sein (z. B. 'Bundesrat', 'Laender',",
    "  'Kommune', 'Ministerium'), wenn das den Vorgang klarer macht als ein Personenzitat.",
    "  ALLEIN VERSTAENDLICH: Nur aus dem Titel muss sofort klar sein, worum es geht und welche",
    "  politische Entwicklung eingetreten ist -- ohne Kurzfassung, ohne den Originalartikel.",
    "  VERBOTEN (die haeufigsten Fehler): (a) ein Satzanfang/-fragment wie 'Friedrich Merz hat",
    "  oeffentlich ...', 'Im Voelklinger Stadtrat besteht ...', 'Der Minister erklaerte ...';",
    "  (b) Einleitungs-/Floskel-Anfaenge 'Es geht um ...', 'Es besteht ...', 'Es wurde berichtet ...';",
    "  (c) woertliche Zitate oder Zitat-Doppelpunkte wie 'Mustermann: ...'; (d) Quellennamen;",
    "  (e) Doppelpunkt-Ketten; (f) Ellipse/'...'; (g) journalistische oder Clickbait-Sprache.",
    "  Der Titel wirkt sachlich-neutral wie ein amtlicher Vorgangstitel, NICHT wie eine",
    "  Zeitungsueberschrift. Hoechstens ~9 Woerter / ~60 Zeichen, vollstaendiger Gedanke, ende NIE",
    "  auf einem Funktionswort (z. B. zur/zum/fuer/von/mit/durch/und/oder/gegenueber/wegen).",
    "  Vorher (abgeschnittener Nachrichtensatz)  ->  Nachher (politischer Vorgangstitel):",
    "  'Friedrich Merz hat oeffentlich eine scharfe Ablehnung gegenueber Vergesellschaftung...'",
    "     ->  'Merz lehnt Vergesellschaftungen ab'  /  'Merz positioniert sich gegen Vergesellschaftung'",
    "  'Im Voelklinger Stadtrat besteht Ratlosigkeit und dringender Handlungsbedarf...'",
    "     ->  'Kommunale Sportinfrastruktur geraet unter Druck'  /  'Voelklingen sucht Loesung fuer Sportinfrastruktur'",
    "  'Mustermann: Ein starkes, soziales und einiges Europa wichtiger denn je'",
    "     ->  'Laender bekraeftigen Unterstuetzung fuer Europa'  /  'Bundesrat betont europaeische Zusammenarbeit'",
    "  'Bundesministerium fuer Arbeit und Soziales veroeffentlicht...'",
    "     ->  'Ministerium plant neue Arbeitsmarktreform'",
    "- display_summary: 1-2 kurze Saetze, AUSSCHLIESSLICH was passiert ist. Nur Fakten, keine Bewertung,",
    "  keine Empfehlung, keine Wiederholung von display_title. Ruhiger, praeziser Ton, kein Zeitungsteaser.",
    "- why_relevant: HÖCHSTENS 3 kurze Saetze, warum der Vorgang fuer dieses Mandat politisch relevant ist.",
    "  KEINE reine Zustaendigkeitsbeschreibung — nenne die politische RELEVANZ UND den HANDLUNGSGRUND (was hat",
    "  sich veraendert, warum betrifft es dieses Profil). Nicht allgemein bleiben, nicht den Titel umformulieren.",
    "  Beispiele: 'Betrifft den Gesundheitsausschuss direkt.' / 'Verschiebt die Mehrheitslage in der Debatte.'",
    "- recommendation: HÖCHSTENS 3-4 kurze ENTSCHEIDUNGSSAETZE, NUR fuer DIESEN Vorgang (keine Tagesstrategie,",
    "  keine Gesamtpriorisierung, keine Statement-Formulierung). Eine Entscheidung pro Satz, keine langen",
    "  Verwaltungssaetze, keine Floskeln. Wenn vorhanden klare zeitliche Orientierung (z. B. 'bis heute Mittag').",
    "  Schlecht (generisch/Floskel): 'Monitoring durchfuehren.' / 'Thema beobachten.'",
    "  Gut (Entscheidungen): 'Heute nicht oeffentlich reagieren. Intern abstimmen. Linie bis 14 Uhr festlegen.'",
    "- display_category: SEHR kurzes Label fuer eine Kategorie-Anzeige, max. ca. 24 Zeichen",
    "  (z. B. 'BMG', 'Bundestag', 'Justizministerium'). Keine langen Behoerdennamen.",
    "display_title, display_summary, why_relevant und recommendation duerfen sich inhaltlich NICHT",
    "wiederholen -- jedes Feld beantwortet ausschliesslich seine eigene Frage.",
    "",
    "Stabschef-Felder (gleiche Antwort, ebenfalls ausgeben). WICHTIG: Nur befuellen, wenn der",
    "Inhalt SICHER aus den Quellen ableitbar ist. Ist etwas nicht serioes ableitbar, gib das Feld",
    "LEER aus ('' bzw. []) -- ERFINDE NICHTS, keine Floskeln, keine Allgemeinplaetze, keine erfundene",
    "Partei-/Personenzuordnung. Ein leeres Feld ist ausdruecklich besser als ein erfundenes.",
    "- risk_of_no_action: 1-2 kurze Saetze, was politisch/kommunikativ passiert, wenn auf DIESEN Vorgang NICHT",
    "  reagiert wird. Nenne konkrete FOLGE, ZEITRAUM und politischen HEBEL (kein Allgemeinplatz). Sonst ''.",
    "- opportunity_summary: 1-2 kurze Saetze, die konkrete politische CHANCE dieses Vorgangs UND die moegliche",
    "  POSITIONIERUNG (womit das Mandat sich glaubwuerdig besetzen kann). Ist keine erkennbar: ''.",
    "- recommended_communication: KEINE reine Prozessanweisung, sondern eine tatsaechlich VERWENDBARE LINIE.",
    "  Bei INTERNER Kommunikation als interne Linie (z. B. 'Intern: zunaechst nicht oeffentlich, Sprachregelung",
    "  vorbereiten'). Bei EXTERNER Kommunikation als moegliches Statement / Sprachregelung (1 verwendbarer Satz).",
    "  Nicht ableitbar: ''.",
    "- action_items: HÖCHSTENS 3 konkrete, ausfuehrbare naechste Schritte als Liste kurzer, handlungs-",
    "  orientierter Stichpunkte (jeder Punkt ein eigener String). Keine sinnvollen Schritte ableitbar: [].",
    "",
    "Strukturierte Stabschef-Werte (gleiche Antwort). Auch hier gilt: NUR bei sicherer",
    "Ableitbarkeit befuellen, sonst 'unknown' bzw. leere Werte -- NICHTS erfinden.",
    "- risk_level: Risikostufe, GENAU einer von {low, medium, high, unknown}. Nicht ableitbar: 'unknown'.",
    "- opportunity_level: Chancenstufe, GENAU einer von {low, medium, high, unknown}. Nicht ableitbar: 'unknown'.",
    "- recommended_communication_struct: Objekt, das die empfohlene Kommunikation",
    "  greifbar macht. Denke dabei an Zielgruppe, Kanal, Format, Tonalitaet und Aktion —",
    "  und lege sie auf diese Felder (KEINE technischen Rohwerte im Freitext sichtbar):",
    "    communicationLine  = die tatsaechlich VERWENDBARE Linie (kein Prozess-Auftrag):",
    "                         bei INTERN die interne Sprachregelung/Gespraechsgrundlage,",
    "                         bei EXTERN ein Statement-Kern; Tonalitaet und Aktion stecken",
    "                         in der Formulierung selbst (1 kurzer, verwendbarer Satz), sonst ''.",
    "    recommendedChannel = Kanal, GENAU einer von {press, social, internal, parliamentary, none, unknown}.",
    "    recommendedFormat  = Format, GENAU einer von {statement, pressRelease, qa, socialPost, internalLine, none, unknown}.",
    "    suggestedOutputs   = Liste kurzer Format-Labels (z. B. statement, qa, pressRelease, talkingPoints, socialPost), sonst [].",
    "- action_items_struct: Liste strukturierter naechster Schritte (HÖCHSTENS 3 fuer die Uebersicht — kurz,",
    "  konkret, ausfuehrbar), jedes Element ein Objekt mit:",
    "    title       = kurzer Handlungstitel, BEGINNT mit einem starken Verb (z. B. 'Fachreferat um",
    "                  Einschaetzung bitten', 'Interne Linie vorbereiten', 'Entwicklung beobachten').",
    "                  Wenn ableitbar, Verantwortungslogik nennen (Buero, Fachreferat, Pressestelle,",
    "                  Abgeordnete/r). KEINE lange Erklaerung im Titel. Pflicht je Eintrag; ohne title -> weglassen.",
    "    description = 1 Satz Kontext, sonst ''.",
    "    dueHint     = grober Zeit-/Faelligkeitshinweis, wenn moeglich mit Frist (z. B. 'heute',",
    "                  'bis Freitag', 'diese Woche'), sonst ''.",
    "    priority    = GENAU einer von {low, medium, high, unknown}.",
    "    actionType  = GENAU einer von {alignInternally, prepareStatement, prepareQA, monitor, delegate, ignore, none, unknown}.",
    "  Keine seriösen Schritte ableitbar: [].",
    "",
    "Politische Einordnung (gleiche Antwort, kompakt). Nur bei sicherer Ableitbarkeit,",
    "sonst 'unknown' -- das System ergaenzt fehlende Werte deterministisch:",
    "- decision_level: die politische ENTSCHEIDUNGS-Ebene des Vorgangs, GENAU einer von",
    "  {international, eu, bund, land, kommune, unknown}. Region/Wahlkreis ist KEINE Ebene.",
    "  Bundestag/Bundesregierung/Bundesministerium/Bundestagsausschuss -> 'bund';",
    "  Landtag/Abgeordnetenhaus/Senat/Landesregierung -> 'land'; EU-Kommission/-Parlament -> 'eu'.",
    "- related_levels: weitere beruehrte Ebenen als Liste (z. B. Bundesgesetz mit Laenderwirkung",
    "  -> ['land']), sonst [].",
    "- event_type: Ereignistyp, GENAU einer von {gesetzentwurf, verordnung, antrag, anfrage,",
    "  anhoerung, abstimmung, kabinettsbeschluss, urteil, bericht, personalie, protest, sonstiges, unknown}.",
    "",
    ...SPRACHVERBOTE,
    "",
    "DSGVO-REGELN (zwingend einhalten):",
    "- mentioned_people und mentioned_mps NUR fuer oeffentlich handelnde politische Akteure in ihrer AMTLICHEN Rolle.",
    "- NIEMALS Privatpersonen, keine Kontaktdaten, keine Adressen/E-Mails/Telefonnummern, keine privaten Personenprofile.",
    "- Leite KEINE privaten personenbezogenen Daten ab. Nutze nur, was in den Quellen oeffentlich steht.",
    "- Kurze Labels bei Erwaehnungen (z. B. 'Name (MdB)', 'SPD', 'BMAS'), keine Dossiers.",
    "",
    "Quellen:",
    docs
  ].join("\n");
}

// --- Sanitisierung / DSGVO-Whitelist ----------------------------------------
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const LIST_FIELDS = ["parteien", "ausschuesse", "ministerien", "risiken", "chancen"];
const PROSE_FIELDS = ["was_ist_passiert", "warum_wichtig", "wer_ist_betroffen", "handlungsempfehlung", "headline"];

function cleanEntry(value, maxLen) {
  const v = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return v.length > maxLen ? v.slice(0, maxLen) : v;
}

function cleanList(value, maxLen) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const el of value) {
    const s = cleanEntry(el, maxLen);
    if (!s) continue;
    if (EMAIL_RE.test(s)) continue;        // DSGVO: keine Kontaktdaten in Listen
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Die Laengen-Obergrenzen leben NUR im Schema (understanding-schema.js) --
// hier ausgelesen statt als eigene Literale dupliziert, damit ein spaeteres
// Anpassen des Budgets nicht an zwei Stellen synchron gehalten werden muss.
const DISPLAY_TITLE_MAX = KNOWLEDGE_OBJECT_SCHEMA.properties.display_title.maxLength;
const DISPLAY_SUMMARY_MAX = KNOWLEDGE_OBJECT_SCHEMA.properties.display_summary.maxLength;
const WHY_RELEVANT_MAX = KNOWLEDGE_OBJECT_SCHEMA.properties.why_relevant.maxLength;
const RECOMMENDATION_MAX = KNOWLEDGE_OBJECT_SCHEMA.properties.recommendation.maxLength;
const DISPLAY_CATEGORY_MAX = KNOWLEDGE_OBJECT_SCHEMA.properties.display_category.maxLength;

// Stabschef-Prosa-Obergrenzen ebenfalls NUR aus dem Schema (kein zweites Literal).
const STAFF_PROSE_MAX = HELMUT_STAFF_PROSE_FIELDS.reduce((acc, f) => {
  acc[f] = KNOWLEDGE_OBJECT_SCHEMA.properties[f].maxLength; return acc;
}, {});
// Einzelner action_item-Eintrag: kurzer Handlungsschritt, defensiv gekappt (kein Volltext).
const ACTION_ITEM_MAX = 200;

// Obergrenzen der strukturierten Stabschef-Werte -- NUR aus dem Schema gelesen.
const COMM_LINE_MAX = KNOWLEDGE_OBJECT_SCHEMA.properties.recommended_communication_struct.properties.communicationLine.maxLength;
const SUGGESTED_OUTPUT_MAX = KNOWLEDGE_OBJECT_SCHEMA.properties.recommended_communication_struct.properties.suggestedOutputs.items.maxLength;
const ACTION_ITEM_PROPS = KNOWLEDGE_OBJECT_SCHEMA.properties.action_items_struct.items.properties;
const ACTION_TITLE_MAX = ACTION_ITEM_PROPS.title.maxLength;
const ACTION_DESC_MAX = ACTION_ITEM_PROPS.description.maxLength;
const ACTION_DUE_MAX = ACTION_ITEM_PROPS.dueHint.maxLength;
const MAX_STRUCT_ACTION_ITEMS = 8; // harte Obergrenze fuer die strukturierte Liste

// Enum-Sanitisierung: Wert gegen die erlaubte Liste pruefen, sonst Fallback.
// "unknown" ist der ehrliche Default -- nichts wird geraten/erfunden.
function enumOr(value, allowed, fallback = "unknown") {
  const v = cleanEntry(value, 40);
  return allowed.includes(v) ? v : fallback;
}

// Strukturierte Kommunikationsempfehlung aus der KI-Antwort bauen (fehlertolerant).
// legacyLine = die (bereits gesaeuberte) Alt-Kurzzeile recommended_communication --
// dient als Fallback fuer communicationLine, damit die Struktur nie leerer ist als
// die Alt-Spalte. Kein Demo-Text: fehlt alles -> communicationLine "" + unknown/[].
function sanitizeCommStruct(raw, legacyLine = "") {
  const src = (raw && typeof raw === "object" && !Array.isArray(raw)) ? raw : {};
  return {
    communicationLine: cleanEntry(src.communicationLine, COMM_LINE_MAX) || cleanEntry(legacyLine, COMM_LINE_MAX),
    recommendedChannel: enumOr(src.recommendedChannel, HELMUT_COMM_CHANNEL_ENUM),
    recommendedFormat: enumOr(src.recommendedFormat, HELMUT_COMM_FORMAT_ENUM),
    suggestedOutputs: cleanList(src.suggestedOutputs, SUGGESTED_OUTPUT_MAX)
  };
}

// Strukturierte naechste Schritte aus der KI-Antwort bauen (fehlertolerant).
// Ein Eintrag OHNE title ist bedeutungslos -> wird verworfen (kein leerer Platzhalter).
function sanitizeActionItems(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const it of arr) {
    if (!it || typeof it !== "object" || Array.isArray(it)) continue;
    const title = cleanEntry(it.title, ACTION_TITLE_MAX);
    if (!title) continue;
    out.push({
      title,
      description: cleanEntry(it.description, ACTION_DESC_MAX),
      dueHint: cleanEntry(it.dueHint, ACTION_DUE_MAX),
      priority: enumOr(it.priority, HELMUT_ACTION_PRIORITY_ENUM),
      actionType: enumOr(it.actionType, HELMUT_ACTION_TYPE_ENUM)
    });
    if (out.length >= MAX_STRUCT_ACTION_ITEMS) break;
  }
  return out;
}

// Ziel: 6-9 Woerter. Untergrenze 2 (ein Einwort-Titel ist kein Lage-Titel),
// Obergrenze bewusst genau 9 (harte Sicherung; das Feintuning macht der Prompt).
const DISPLAY_TITLE_MIN_WORDS = 2;
const DISPLAY_TITLE_MAX_WORDS = 9;

// Schwache Schlusswoerter: endet der Titel hierauf, wirkt er abgeschnitten bzw.
// unvollstaendig ("... Reform gegenueber", "... Debatte zur"). Enthaelt die vom
// Produkt ausdruecklich genannten Woerter plus eindeutige Artikel/Konjunktionen/
// Praepositionen/Hilfsverben.
//
// BEWUSST NICHT enthalten: trennbare Verbpraefixe, auf die ein GUTER Lage-Titel
// enden darf -- ab/an/auf/aus/ein/um/bei/nach/vor/zu. Beispiele, die gueltig
// bleiben MUESSEN: "Merz lehnt Vergesellschaftung ab" (ablehnen), "Regierung
// bringt Gesetz ein" (einbringen), "Land setzt Reform um" (umsetzen), "Fraktion
// stimmt zu" (zustimmen), "Regierung legt Entwurf vor" (vorlegen). Diese als
// "schwach" zu verwerfen wuerde gerade die gewuenschten Titel treffen.
// Ausnahme: "durch" und "mit" bleiben drin, weil der Nutzer sie AUSDRUECKLICH als
// unzulaessige Endungen genannt hat -- der seltene trennbare Fall ("setzt durch",
// "teilt mit") faellt dann bewusst auf den Legacy-Titel zurueck.
const DISPLAY_TITLE_WEAK_TAIL = new Set([
  // Konjunktionen
  "und", "oder", "aber", "sondern", "denn", "sowie", "bzw", "dass", "weil", "damit",
  "sodass", "sobald", "obwohl", "waehrend", "während", "wohingegen",
  // Artikel / Determinative (NICHT bare "ein" -> trennbares Praefix einbringen/einraeumen)
  "der", "die", "das", "den", "dem", "des", "eine", "einen", "einem", "einer",
  "eines", "kein", "keine", "keinen", "keiner", "keinem",
  // Praepositionen (eindeutig haengend; inkl. der ausdruecklich genannten).
  // NICHT "um"/"bei" -> trennbare Praefixe umsetzen/beitreten.
  "gegenueber", "gegenüber", "bezueglich", "bezüglich", "zur", "zum", "fuer", "für",
  "von", "vom", "wegen", "durch", "mit", "seit", "gegen", "ohne",
  "zwischen", "ueber", "über", "unter", "hinter", "neben", "laut", "trotz", "per",
  "pro", "gemaess", "gemäß", "entlang", "innerhalb", "ausserhalb", "außerhalb",
  "mittels", "anhand", "angesichts", "aufgrund", "bis", "samt", "nebst",
  // Hilfs-/Modalverben (haengend)
  "ist", "sind", "war", "waren", "wird", "werden", "hat", "haben", "hatte", "hatten",
  "kann", "koennte", "könnte", "koennen", "können", "soll", "sollte", "sollen",
  "muss", "muessen", "müssen", "will", "wollen", "wuerde", "würde", "wuerden",
  "würden", "moechte", "möchte", "mag", "darf", "duerfen", "dürfen",
  // Pronomen / Partikel
  "sich", "dessen", "deren", "derer"
]);

// Qualitaetsgate fuer den Anzeige-Titel (KEIN Sprachmodell, rein deterministisch).
// Ein Titel, der IRGENDEINE Regel reisst, gilt als UNGUELTIG und wird verworfen --
// die UI faellt dann auf den Legacy-Titel zurueck (der spaeter per Backfill
// verschwindet). Lieber kein KI-Titel als ein kaputter KI-Titel.
function isValidDisplayTitle(raw) {
  const t = cleanEntry(raw, Infinity); // normalisiert (Whitespace/Trim), kuerzt NICHT
  if (!t) return false;
  if (t.length > DISPLAY_TITLE_MAX) return false;         // ~60 Zeichen (Schema)
  if (/(\.\.\.|…)/.test(t)) return false;             // keine Ellipse ("..." / "…")
  if (/[,;:–—-]$/.test(t)) return false;         // kein haengendes Satzzeichen (, ; : - – —)
  const words = t.split(" ");
  if (words.length < DISPLAY_TITLE_MIN_WORDS) return false; // kein Einwort-"Titel"
  if (words.length > DISPLAY_TITLE_MAX_WORDS) return false; // kein Satz/Fliesstext
  const first = t[0];
  if (first.toLowerCase() === first && first.toUpperCase() !== first) return false; // Kleinbuchstabe -> Fragment
  const lastWord = words[words.length - 1].replace(/[.!?]+$/, "").toLowerCase();
  if (DISPLAY_TITLE_WEAK_TAIL.has(lastWord)) return false;  // endet auf Funktionswort
  return true;
}

// Gueltiger Titel -> uebernehmen; sonst verwerfen (nie kuerzen/reparieren).
function sanitizeDisplayTitle(value) {
  const v = cleanEntry(value, Infinity);
  return isValidDisplayTitle(v) ? v : "";
}
function sanitizeDisplayCategory(value) {
  const v = cleanEntry(value, Infinity);
  return v.length <= DISPLAY_CATEGORY_MAX ? v : "";
}

// Baut das zu speichernde knowledge_object AUS EINER WHITELIST — kein Modell-Feld
// ausserhalb des Schemas landet in der DB. Identitaet setzen WIR deterministisch.
// opts (C8): understanding_status (Lifecycle, Default 'complete') + understanding_model
// werden hier gesetzt — NICHT aus der KI-Antwort uebernommen (Kostenlog/DSGVO: nur
// nicht-inhaltliche Metadaten). status bleibt die schema-gueltige Analyse-Klasse.
function assembleKnowledgeObject(aiResult = {}, cluster = {}, vorgangId, opts = {}) {
  const ko = {
    id: `ko-${vorgangId}`,
    vorgang_id: vorgangId,
    // Aktualisierungen eines bestehenden Vorgangs zaehlen die Version hoch
    // (opts.koVersion). Ohne Angabe bleibt es die Erstfassung.
    ko_version: Number(opts.koVersion) > 0 ? Math.floor(Number(opts.koVersion)) : 1,
    status: "neu",
    understanding_status: opts.understanding_status || "complete",
    source_document_count: (cluster.documents || []).length,
    confidence_score: clampInt(aiResult.confidence_score, 0, 100, 60),
    // AUDIT-BLINDSTELLE, aufgefallen beim gescheiterten CSD-Nachweislauf
    // (2026-07-27, befund-csd-2026-vorgangsverlust.md §15.4): eine
    // Inhaltsaktualisierung setzte `updated_at` NICHT neu. Der Vorgang
    // `ko-vg-tagesspiegel-…` wurde inhaltlich ueberschrieben und trug danach
    // weiterhin seinen alten Zeitstempel — die Abfrage "welche Zeilen hat dieser
    // Lauf veraendert?" fand ihn deshalb NICHT. Auffindbar war die Aenderung nur
    // ueber einen Zaehlerabgleich. Ohne diesen Zeitstempel ist der naechste
    // Production-Nachweis nicht sauber abnehmbar.
    updated_at: new Date().toISOString()
  };
  if (opts.model) ko.understanding_model = String(opts.model).slice(0, 120);
  for (const f of PROSE_FIELDS) ko[f] = cleanEntry(aiResult[f], 800);
  for (const f of LIST_FIELDS) ko[f] = cleanList(aiResult[f], 200);
  for (const f of MENTION_FIELDS) ko[f] = cleanList(aiResult[f], 120); // kurze oeffentliche Labels
  // UI-Zeigefelder fuer Lage/Radar/Helmut/Detailansicht (additiv, gleicher KI-Call):
  ko.display_title = sanitizeDisplayTitle(aiResult.display_title);
  ko.display_summary = cleanEntry(aiResult.display_summary, DISPLAY_SUMMARY_MAX);
  ko.why_relevant = cleanEntry(aiResult.why_relevant, WHY_RELEVANT_MAX);
  ko.recommendation = cleanEntry(aiResult.recommendation, RECOMMENDATION_MAX);
  ko.display_category = sanitizeDisplayCategory(aiResult.display_category);
  // Stabschef-Felder (additiv, gleicher KI-Call). Fehlertolerant: fehlt/ungueltig ->
  // "" bzw. [] (cleanEntry/cleanList). NIE required -> kann die Pipeline nie stoppen.
  // Kein Fallback-/Demo-Text: leer bedeutet "nicht sicher ableitbar" (siehe Prompt) --
  // spaetere Adapter leiten daraus einen ehrlichen qualityStatus ab, statt zu erfinden.
  for (const f of HELMUT_STAFF_PROSE_FIELDS) ko[f] = cleanEntry(aiResult[f], STAFF_PROSE_MAX[f]);
  for (const f of HELMUT_STAFF_LIST_FIELDS) ko[f] = cleanList(aiResult[f], ACTION_ITEM_MAX);
  // Strukturierte Stabschef-Werte (Runde 2). Enum-sanitisiert, "unknown"/leer als
  // ehrlicher Default. Rueckwaertsverträglich NEBEN den Alt-Feldern:
  //  - risk_level/opportunity_level: reine Enum-Klassifikation (kein Raten).
  //  - recommended_communication_struct: Struktur; communicationLine faellt auf die
  //    Alt-Kurzzeile zurueck, damit die Alt-Spalte gefuellt bleibt (und umgekehrt).
  //  - action_items_struct: strukturierte Schritte; die Alt-Spalte action_items[]
  //    bleibt die Titelliste (wird aus der Struktur abgeleitet, falls KI nur Struktur liefert).
  ko.risk_level = enumOr(aiResult.risk_level, HELMUT_LEVEL_ENUM);
  ko.opportunity_level = enumOr(aiResult.opportunity_level, HELMUT_LEVEL_ENUM);
  ko.recommended_communication_struct = sanitizeCommStruct(aiResult.recommended_communication_struct, ko.recommended_communication);
  // Alt-Kurzzeile spiegeln, falls die KI nur die Struktur lieferte (Alt-Spalte nie leerer als Struktur).
  if (!ko.recommended_communication && ko.recommended_communication_struct.communicationLine) {
    ko.recommended_communication = ko.recommended_communication_struct.communicationLine;
  }
  ko.action_items_struct = sanitizeActionItems(aiResult.action_items_struct);
  // Alt-Spalte action_items[] backfilled aus der Struktur, falls die KI nur Struktur lieferte.
  if (!ko.action_items.length && ko.action_items_struct.length) {
    ko.action_items = ko.action_items_struct.map((i) => i.title);
  }
  const z = cleanEntry(aiResult.zeitdruck, 20).toLowerCase();
  ko.zeitdruck = ZEITDRUCK_ENUM.includes(z) ? z : "mittel";

  // --- Klassifikation (Sprint 2): Ebene / Geografie / Entitaeten / Konfidenz ---
  // Deterministisch aus den bereits gesetzten Feldern (Ausschuesse/Ministerien/
  // Erwaehnungen) + optionalen KI-Werten. decision_level ist damit NIE leer
  // (behebt "political_level 0/231"). Kann die Pipeline nie stoppen (try/catch).
  //
  // SPRINT 19: opts.bestand ist das bereits gespeicherte Knowledge Object desselben
  // Vorgangs (bei einer Aktualisierung). Ist dort eine Ebene ermittelt, wird sie
  // WIEDERVERWENDET statt neu berechnet. Vorher leitete jede Aktualisierung die
  // Ebene komplett neu ab — ein einmal als 'bund' belegter Vorgang konnte dabei
  // auf 'unknown' zurueckfallen (stiller Datenverlust). Kostet nichts: kein
  // zusaetzlicher KI-Aufruf, nur ein bereits geladener Datensatz mehr.
  //
  // SPRINT 20: dieselbe Wiederverwendung gilt jetzt auch fuer die GEOGRAFIE — und
  // sie ist von der Ebene getrennt. Aus `decision_level` entsteht keine Region
  // mehr (frueher: bund -> Deutschland, land ohne erkanntes Bundesland ->
  // ebenfalls Deutschland). opts.strukturiert/amtlich/quellenGeografien sind die
  // Zulaufpunkte fuer staerkere bzw. rein indizielle Nachweise; ohne sie ist das
  // Verhalten rein inhaltsgetrieben. Die Quellengeografie kann strukturell NIE zur
  // betroffenen Geografie werden.
  try {
    const cls = classifyKnowledgeObject(ko, aiResult, {
      bestand: opts.bestand || null,
      jetzt: ko.updated_at,
      strukturiert: opts.strukturiert || null,
      amtlich: opts.amtlich || null,
      quellenGeografien: opts.quellenGeografien || null
    });
    ko.decision_level = cls.decision_level;
    ko.related_levels = cls.related_levels;
    ko.affected_geographies = cls.affected_geographies;
    ko.mentioned_geographies = cls.mentioned_geographies;
    ko.decision_entities = cls.decision_entities;
    ko.related_entities = cls.related_entities;
    ko.event_type = cls.event_type;
    ko.classification_confidence = cls.classification_confidence;
    // Rueckwaerts-kompatibel: die bestehende Alt-Spalte political_level (die Matching/
    // Read bereits kennen) mit der Entscheidungsebene spiegeln, statt sie leer zu lassen.
    ko.political_level = cls.decision_level;
  } catch (_) { /* Klassifikation optional; Analyse nie zu Fall bringen */ }

  // --- Feature-Vektor write-time persistieren (Sprint 2) ----------------------
  // TECHNISCHER Merkmalsvektor (Token-Hash aus Partei/Ausschuss/Region/Thema/Inhalt),
  // KEIN semantisches Embedding: Kosinus misst Merkmalsueberlappung, nicht Bedeutung.
  // Wird einmal global erzeugt (KEINE KI, kein Netz) und persistiert, statt bei jeder
  // Anfrage read-time neu zu rechnen. Die DB-Spalte heisst aus Legacy-Gruenden "embedding";
  // ihr Inhalt ist ein Feature-Vektor (echtes semantisches Matching = freigabepflichtige API).
  try {
    const { computeFeatureVectorForKnowledgeObject } = require("./matching");
    const vec = computeFeatureVectorForKnowledgeObject(ko);
    if (Array.isArray(vec) && vec.length) ko.embedding = vec; // -> Spalte embedding (Feature-Vektor)
  } catch (_) { /* Feature-Vektor optional; Pipeline nie blockieren */ }

  return ko;
}

// --- Orchestrierung (Dependencies injizierbar -> offline testbar) -----------
// ctx.runId (Punkt 17): die Laufkennung des umgebenden Laufs. Sie existierte
// bereits in source_crawl_telemetry.run_id und in processRuns.runId, kam aber nie
// im Kostenlog an — dadurch waren Kosten je Lauf nur ueber Zeitfenster
// REKONSTRUIERBAR, nicht messbar. Durchreichen genuegt; es entsteht kein neues
// Feld (buildLlmUsageRecord kennt runId laengst und schrieb bisher null).
// Fehlt ctx.runId, ist das Verhalten byte-identisch zu vorher (null).
function defaultDeps(ctx = {}) {
  const storage = require("./storage");
  const ai = require("./ai");
  const runId = ctx && ctx.runId ? String(ctx.runId) : null;
  return {
    enabled: () => storage.v3StoreEnabled(),
    aiEnabled: () => ai.isAiEnabled(),
    acquireLock: () => storage.acquireGlobalUnderstandingLock(),
    releaseLock: () => storage.releaseGlobalUnderstandingLock(),
    // KONKURRENZWACHE JE VORGANG (OP-30-Zielarchitektur, DEFAULT INERT — Flag
    // HELMUT_VERSTEHEN_KONKURRENZ, fail closed). Das globale Schloss schuetzt vor
    // Doppel-KI-Kosten, indem es ALLES serialisiert; das eigentliche Schutzgut ist
    // aber "ein KI-Aufruf je NEUEM Vorgang". Die Wache verengt den Schutz auf genau
    // diesen Vorgang: eine datenbank-atomare Belegung (helmut_klasse_belege,
    // Klasse `verstehen-vorgang:<id>`, max 1, TTL-selbstheilend) unmittelbar vor dem
    // Modellaufruf. Zwei Verarbeiter koennen damit VERSCHIEDENE Vorgaenge parallel
    // verstehen; derselbe Vorgang bleibt exklusiv — auch ueber Prozess- und
    // Instanzgrenzen hinweg, und auch zwischen Warteschlangen- und Cron-Pfad
    // (beide laufen durch defaultDeps). Ohne Flag ist der Wert null und jeder
    // Aufrufer verhaelt sich byte-identisch zu vorher.
    clusterWache: storage.vorgangsWache(runId),
    // ATOMARER VERSTEHENSVERTRAG (OP-30 CAS, DEFAULT INERT — Flag HELMUT_VERSTEHEN_CAS).
    // Bewusst eine FABRIK, nicht ein fertiges Objekt: jeder Cluster bekommt einen EIGENEN
    // Besitzer. Sonst hielten zwei gleichzeitig laufende Cluster desselben Vorgangs
    // innerhalb eines Prozesses einander faelschlich fuer denselben Arbeiter
    // (Wiedereintritt) — und beide wuerden das Modell aufrufen. So verhaelt sich
    // prozessinterne Nebenlaeufigkeit exakt wie prozessuebergreifende.
    verstehenVertrag: () => verstehenVertragModul.baueVertrag({ besitzer: verstehenVertragModul.baueBesitzer(runId ? `verstehen-${runId}` : "verstehen") }),
    getExisting: (vorgangId) => storage.getKnowledgeObjectByVorgang(vorgangId),
    // Vorgangsaufloesung (Betriebsbefund B4): Kandidaten unter den Themenwurzel-
    // Praefixen + deren bereits verknuepfte Rohdokumente als BELEG. Beides rein
    // lesend; faellt der Zugriff aus, entsteht schlimmstenfalls ein neuer Vorgang
    // (mehr Kosten) — nie ein verworfenes Dokument.
    findVorgangCandidates: (prefixes, limit) => storage.listKnowledgeObjectsByVorgangPrefix(prefixes, limit),
    listVorgangDocuments: (koId) => storage.listKoDocuments(koId),
    // C8: die von C7c vorgemerkten (status='pending') Vorgaenge holen.
    listPending: (limit) => storage.listPendingKnowledgeObjects({ limit }),
    // Zurueckgestellte Cluster vormerken, damit sie der dedizierte
    // Understanding-Lauf tatsaechlich wiederfindet (Betriebsbefund B4,
    // Mitursache 2). Idempotent: ein bestehendes KO wird nie ueberschrieben.
    savePending: (vorgangId, meta) => storage.savePendingKnowledgeObject(vorgangId, meta),
    // K4 (OP-25 E3): `savePendingBulk` ist BEWUSST KEIN Default. Der Aufrufer, der die
    // Vormerkziele kennt (scheduler.runGlobaleErfassung), reicht seine Bulk-Funktion
    // explizit durch — ein Default wuerde bei Aufrufern mit eigenem savePending-Mock
    // (Tests, Werkzeuge) an deren Ablage VORBEI in die echte Storage schreiben.
    canSpend: () => storage.canSpendLlm(null), // GLOBAL: null, niemals pro Nutzer
    requestUnderstanding: (prompt) =>
      // pipelineStep explizit (der Kostenlog gruppiert Calls nach Pipeline-Schritt);
      // politicianId bleibt null (globaler, mandantenloser Understanding-Call).
      ai.requestStructuredJson(prompt, KNOWLEDGE_OBJECT_SCHEMA, { callType: "understanding", pipelineStep: "understanding", politicianId: null, runId }, ai.understandingModelName()),
    save: (ko) => storage.saveKnowledgeObject(ko),
    // Provenienz: die Quell-Dokumente des Clusters mit dem KO verknuepfen (C6/C7),
    // damit echte Quellen, Chronologie und Dokumente pro Vorgang abrufbar sind.
    saveSources: (koId, docs) => storage.saveKoDocumentLinks(koId, docs),
    // C8: Vorgang als KI-Fehlschlag parken (status bleibt 'pending' -> nie gematcht).
    markFailed: (vorgangId, meta) => storage.markUnderstandingFailed(vorgangId, meta),
    // P29-3: Vormerkungen gescheiterter/vertagter KO-Aktualisierungen (Deckel der
    // begrenzten Wiederaufnahme). Kleiner Auth-Store, KEINE Schema-Migration —
    // dasselbe Muster wie der P1-4-Retry-Zaehler (understandingRetries).
    readUpdateRetries: () => storage.getUpdateRetries(),
    writeUpdateRetries: (map) => storage.saveUpdateRetries(map),
    // Modellname NUR fuer das Metadatenfeld understanding_model (kein Inhalt).
    modelName: () => ai.understandingModelName(),
    // Skip-Log OHNE Prompt-/Antwortinhalt (nur callType/Modell) — DSGVO + Kostenlog-Regel.
    logSkip: (callType) => {
      try { storage.recordLlmUsage({ callType, model: "none", politicianId: null, keinAufruf: true, success: false, runId }); }
      catch (e) { try { console.error("[understanding] logSkip fehlgeschlagen:", e && e.message); } catch (_) { /* ignore */ } }
    },
    // Understanding-Gate-Modus (off/shadow/on). Default 'off' -> Gate wird nie aufgerufen.
    gateMode: () => understandingGate.gateMode(),
    // Shadow-Telemetrie-Senke (Aggregat): Console-Log der Kennzahlen (kein Rohtext). Fail-safe.
    recordGateShadow: (summary) => {
      try { console.log(`[understanding-gate:shadow] ${JSON.stringify(summary)}`); } catch (_) { /* ignore */ }
    },
    // Shadow-Telemetrie-Senke (je Dokument): schreibt in die Production-Tabelle
    // gate_shadow_events (Supabase-Backend; lokal No-op). Nur Signale/IDs, kein Volltext.
    // Fail-safe gekapselt am Aufrufort — Telemetrie darf das Understanding NIE beeinflussen.
    recordGateShadowRows: (rows) => storage.recordGateShadowEvents(rows)
  };
}

// --- Vorgangsaufloesung: gehoert dieser Cluster zu einem BESTEHENDEN Vorgang? --
// Ersetzt den frueheren Zeichenkettenvergleich "existiert ein KO mit dieser
// vorgang_id?" durch einen BELEGVERGLEICH. Das ist die eigentliche Reparatur von
// Betriebsbefund B4: eine gleiche Kennung ist ein Verdacht, kein Urteil.
//
// Ablauf (KI-frei):
//   1. Kennungsvorschlag + bis zu 3 Kandidatenpraefixe aus den Themenwurzeln.
//   2. Bestehende Vorgaenge unter diesen Praefixen holen (deps.findVorgangCandidates).
//      Die LEGACY-Kennung `vg-<wurzel>` faellt exakt auf ein solches Praefix —
//      Altvorgaenge werden also weiter fortgeschrieben, nicht dupliziert.
//   3. Je Kandidat die bereits verknuepften Rohdokumente laden und mit
//      sameVorgang() pruefen: dieselbe Sache oder nur dasselbe Wort?
//   4. Passt keiner, aber die vorgeschlagene Kennung ist belegt -> technischer
//      Konflikt: eigene Kennung bilden statt den Cluster zu verwerfen.
const MAX_VORGANG_KANDIDATEN = 8;      // Kandidaten, die ueberhaupt geprueft werden
const MAX_KANDIDATEN_MIT_BELEG = 5;    // davon: Kandidaten, fuer die Dokumente geladen werden
const MAX_KONFLIKT_SUFFIX = 20;        // Obergrenze der Entkollisionierung (kein Endlosloop)

async function resolveVorgang(cluster, deps, opts = {}) {
  // Der Pending-Pfad (C8) bringt Kennung und KO bereits mit — dort ist die
  // Identitaet durch die frueher erfolgte Vormerkung vorgegeben.
  if (opts.vorgangId) {
    const existing = opts.existing !== undefined
      ? opts.existing
      : (typeof deps.getExisting === "function" ? await deps.getExisting(opts.vorgangId) : null);
    // Auch hier den BELEG laden: ohne die bereits verknuepften Dokumente laesst
    // sich ein echtes Duplikat nicht von einer Aktualisierung unterscheiden.
    let bestandsDokumente = [];
    if (existing && existing.id && typeof deps.listVorgangDocuments === "function") {
      try { bestandsDokumente = (await deps.listVorgangDocuments(existing.id)) || []; }
      catch (e) { try { console.error("[understanding] listVorgangDocuments fehlgeschlagen:", e && e.message); } catch (_) { /* ignore */ } }
    }
    return { vorgangId: opts.vorgangId, existing, bestandsDokumente, resolution: "vorgegeben", begruendung: "kennung-vorgegeben", spuren: [] };
  }

  const vorschlag = deriveVorgangId(cluster);
  const praefixe = candidatePrefixes(cluster, 3);

  let kandidaten = [];
  if (typeof deps.findVorgangCandidates === "function" && praefixe.length) {
    try { kandidaten = (await deps.findVorgangCandidates(praefixe, MAX_VORGANG_KANDIDATEN)) || []; }
    catch (e) { try { console.error("[understanding] findVorgangCandidates fehlgeschlagen:", e && e.message); } catch (_) { /* ignore */ } }
  } else if (typeof deps.getExisting === "function") {
    // Rueckfallebene (Alt-Deps/Tests ohne den neuen Zugriff): exakter Treffer.
    const exakt = await deps.getExisting(vorschlag);
    kandidaten = exakt ? [exakt] : [];
  }
  kandidaten = (Array.isArray(kandidaten) ? kandidaten : []).filter(Boolean).slice(0, MAX_VORGANG_KANDIDATEN);

  // Neueste zuerst pruefen: ein laufendes Ereignis wird eher fortgeschrieben als
  // ein Jahre alter Vorgang mit demselben Themenwort.
  const sortiert = kandidaten.slice().sort((a, b) =>
    String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));

  let geprueft = 0;
  const spuren = [];
  for (const kandidat of sortiert) {
    let dokumente = [];
    if (geprueft < MAX_KANDIDATEN_MIT_BELEG && typeof deps.listVorgangDocuments === "function") {
      geprueft += 1;
      try { dokumente = (await deps.listVorgangDocuments(kandidat.id)) || []; }
      catch (e) { try { console.error("[understanding] listVorgangDocuments fehlgeschlagen:", e && e.message); } catch (_) { /* ignore */ } }
    }
    const urteil = sameVorgang(cluster, {
      vorgangId: kandidat.vorgang_id,
      documents: dokumente,
      headline: kandidat.headline,
      display_title: kandidat.display_title
    });
    // Entscheidungsspur je geprueftem Kandidaten mitschreiben — auch die
    // ABLEHNUNGEN. Ohne sie liesse sich hinterher nicht belegen, warum ein
    // Cluster einem Vorgang zugeordnet wurde oder eben nicht (Betriebsbefund B4-2).
    spuren.push({ vorgangId: kandidat.vorgang_id, gleich: urteil.gleich, grund: urteil.grund, ...(urteil.spur || {}) });
    if (urteil.gleich) {
      return {
        vorgangId: kandidat.vorgang_id, existing: kandidat, bestandsDokumente: dokumente,
        resolution: "bestand", begruendung: `${urteil.beleg}:${urteil.grund}`, vorschlag, spuren
      };
    }
  }

  // Kein Kandidat beschreibt dieselbe Sache. Ist die vorgeschlagene Kennung
  // trotzdem belegt, liegt ein rein TECHNISCHER Konflikt vor — er darf niemals
  // dazu fuehren, dass der Cluster verworfen wird (B4).
  const belegt = new Set(kandidaten.map((k) => k.vorgang_id));
  if (!belegt.has(vorschlag)) {
    return { vorgangId: vorschlag, existing: null, bestandsDokumente: [], resolution: "neu", begruendung: "kein-bestand", vorschlag, spuren };
  }
  for (let n = 2; n <= MAX_KONFLIKT_SUFFIX; n += 1) {
    const alternativ = `${vorschlag}-${n}`;
    if (!belegt.has(alternativ)) {
      return {
        vorgangId: alternativ, existing: null, bestandsDokumente: [],
        resolution: "konflikt-neue-kennung", begruendung: `kennung-belegt:${vorschlag}`, vorschlag, spuren
      };
    }
  }
  return {
    vorgangId: `${vorschlag}-x`, existing: null, bestandsDokumente: [],
    resolution: "konflikt-neue-kennung", begruendung: "kennungsraum-erschoepft", vorschlag, spuren
  };
}

// --- P29-3 (Fix-Sprint Punkt 29): Vormerkung gescheiterter Aktualisierungen ---
// Eine Aktualisierung verknuepft neue Dokumente bewusst VOR dem KI-Call ("nicht
// mehr verlierbar"). Scheitert der Update-Call danach, waren beim naechsten
// identischen Lauf alle Dokumente bekannt — der Vorgang endete als stilles
// "duplicate" und die inhaltliche Aktualisierung unterblieb dauerhaft.
// Jetzt wird jede nicht erfolgreiche Aktualisierung VORGEMERKT (vorgangId ->
// Zahl der Fehlversuche; Budget-Vertagung zaehlt nicht als Fehlversuch) und beim
// naechsten identischen Lauf BEGRENZT wieder aufgenommen. Der Deckel verhindert
// den unbegrenzten KI-Kostenpfad: nach UPDATE_WIEDERAUFNAHME_MAX Fehlversuchen
// endet der Vorgang sichtbar als `skipped-update-final` (Gruppe "fehlgeschlagen",
// kein weiterer KI-Call); echte NEUE Dokumente heilen weiterhin ueber den
// normalen Update-Pfad. Die Ablage folgt dem P1-4-Muster (kleiner Auth-Store,
// KEINE Schema-Migration); ohne die deps bleibt das Verhalten unveraendert.
const UPDATE_WIEDERAUFNAHME_MAX = 3;

function updateWiederaufnahmeMax(deps) {
  const n = Number(deps && deps.maxUpdateRetries);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : UPDATE_WIEDERAUFNAHME_MAX;
}

// Je Lauf EINMAL lesen (ctx als Lauf-Cache), nicht je Duplikat — die Ablage ist
// ein kleiner externer Store. Fail-safe: ein Lese-/Schreibfehler deaktiviert nur
// die Wiederaufnahme fuer diesen Lauf (Verhalten wie vor dem Fix), nie den Lauf.
async function leseUpdateVormerkungen(deps, ctx) {
  if (!ctx || typeof deps.readUpdateRetries !== "function") return null;
  if (!ctx.geladen) {
    ctx.geladen = true;
    try { ctx.map = (await deps.readUpdateRetries()) || {}; }
    catch (e) {
      ctx.map = null;
      try { console.error("[understanding] readUpdateRetries fehlgeschlagen:", e && e.message); } catch (_) { /* ignore */ }
    }
  }
  return ctx.map;
}

async function schreibeUpdateVormerkungen(deps, ctx) {
  if (!ctx || !ctx.map || typeof deps.writeUpdateRetries !== "function") return;
  try { await deps.writeUpdateRetries(ctx.map); }
  catch (e) { try { console.error("[understanding] writeUpdateRetries fehlgeschlagen:", e && e.message); } catch (_) { /* ignore */ } }
}

// EINE Lesestelle fuer beide Ablagen. Mit dem CAS-Vertrag wird GEZIELT die Zeile dieses
// Vorgangs gelesen (nie die ganze Karte); ohne ihn bleibt der Karten-Cache unveraendert.
// Fail-safe wie bisher: eine nicht lesbare Ablage deaktiviert nur die Wiederaufnahme,
// nie den Lauf — sie erfindet aber auch keine Vormerkung.
async function leseVormerkung(deps, ctx, vorgangId, vertrag) {
  if (vertrag) {
    const antwort = await vertrag.vormerkungLese(vorgangId);
    if (!antwort || antwort.verfuegbar === false) return { lesbar: false, vorhanden: false, fehlversuche: 0 };
    return { lesbar: true, vorhanden: Boolean(antwort.vorhanden), fehlversuche: Number(antwort.fehlversuche) || 0 };
  }
  const karte = await leseUpdateVormerkungen(deps, ctx);
  if (!karte) return { lesbar: false, vorhanden: false, fehlversuche: 0 };
  const vorhanden = Object.prototype.hasOwnProperty.call(karte, vorgangId);
  return { lesbar: true, vorhanden, fehlversuche: vorhanden ? (Number(karte[vorgangId]) || 0) : 0 };
}

// --- Absage des atomaren Vertrags in eine Ergebnisklasse uebersetzen (OP-30 CAS) ---
// EINE Stelle fuer beide Pfade (Erstverstehen und Aktualisierung), damit die Zuordnung
// nicht zweimal gepflegt werden muss und keine Klasse still verloren geht. JEDE Klasse
// hier steht auch in ERGEBNISGRUPPEN — `scripts/vorgangs-lebenszyklus-test.js` prueft das.
//
//   bereits-fertig        dieselbe Eingabe ist schon verstanden -> vorhandenes Ergebnis
//                         nutzen, KEIN Modellaufruf (Idempotenz)
//   belegt                ein anderer Arbeiter haelt den Vorgang -> Nachholkandidat
//   ausgang-unbekannt     ein Modellaufruf ist abgestuerzt; ob er ein Ergebnis erzeugt
//                         hat, weiss NIEMAND -> sichtbar blockiert, nie stille Wiederholung
//   aufgegeben            ausdrueckliche Betreiberentscheidung -> "nie wieder"
//   vertrag-nicht-pruefbar  fail closed (Migration fehlt, DB-Fehler)
// ── DER ZUSTANDSVERTRAG UM DEN MODELLSTART (OP-30 Korrekturlauf 2026-08-15, Lücke 1) ────────
//
// Vor dem Modellstart und nach dem Modellstart sind ZWEI VERSCHIEDENE WELTEN:
//
//   VORHER  — es kann kein Aufruf abgesetzt worden sein. Ein Fehler ist sicher
//             wiederholbar; die Reservierung wird freigegeben (`freigabe` -> `offen`).
//   NACHHER — es KANN ein bezahlter Aufruf gelaufen sein. Zeitüberschreitung,
//             Verbindungsabbruch, unklarer Anbieterfehler, ungültige Antwort,
//             Validierungsfehler, Speicherfehler und Absturz sind dann NICHT
//             unterscheidbar von „Ergebnis ging nur auf dem Rückweg verloren".
//             Ausgang: `unbekannt`, sichtbar blockiert, nie automatisch wiederholt.
//
// Die EINZIGE Ausnahme nach dem Modellstart ist ein BELEGTER Beweis, dass nichts
// abgesendet wurde. Er kommt nicht aus einer Vermutung über die Fehlermeldung, sondern
// aus der KI-Engstelle selbst (`ai.markiereNichtGesendet`, gesetzt vor `https.request`).
// Der Tagesbudget-Code und die Anbietervertagung sind gleichwertige Belege: beide
// entstehen ausschließlich vor dem HTTP-Aufruf.
//
// RICHTUNG DES IRRTUMS: fehlt ein Beleg, gilt „unbekannt". Das ist teurer und ehrlicher —
// nie ein stiller zweiter Aufruf (CLAUDE.md §4 Regel 3 und 4).
function belegtNichtAbgesendet(error) {
  if (!error || typeof error !== "object") return false;
  if (error.kiNichtGesendet === true) return true;
  if (error.code === "LLM_BUDGET_EXHAUSTED") return true;
  if (error.anbieterVertagung) return true;
  return false;
}

// ── DIE PERSISTENZ DES VERSTEHENSERGEBNISSES ────────────────────────────────────────────────
// Mit Vertrag geht sie über den ATOMAREN CAS-Speicherweg: EINE Datenbankfunktion prüft
// Besitzer, aktuelle Reservierung, Fencing-Wert, Zustand und Lease gemeinsam unter dem
// Row-Lock der Vorgangszeile und schreibt erst dann — Wissensobjekt und Abschluss in
// derselben Transaktion. Genau deshalb gibt es kein Fenster mehr, in dem ein abgelöster
// Arbeiter mit gleichem Fencing-Wert doch noch schreiben könnte.
//
// Ohne Vertrag (Standard, Flag aus) bleibt es byte-identisch beim bisherigen `deps.save`.
async function persistiereVerstehensergebnis({ vertrag, reservierung, ko, deps }) {
  if (!vertrag || !reservierung || typeof vertrag.speichere !== "function") {
    const saved = await deps.save(ko);
    return {
      gespeichert: Boolean(saved && saved.saved),
      veraltet: Boolean(saved && saved.veraltet),
      abgeschlossen: false,
      nichtPruefbar: false,
      grund: (saved && saved.reason) || null
    };
  }
  const speicherAufruf = () => vertrag.speichere({
    vorgangId: ko.vorgang_id,
    fencing: reservierung.fencing,
    ko,
    ergebnisHash: verstehenVertragModul.ergebnisHash(ko)
  });
  let cas = await speicherAufruf();
  // GENAU EINE WIEDERHOLUNG DES SPEICHERWEGS (Reparatursprint 2026-08-20, Runbook §29).
  // Anlass: `eff40db2` — der bezahlte Aufruf war fertig, aber der EINE Speicher-RPC lief
  // im ueberlasteten 16:00-Slot in den 10-s-Client-Timeout; das Ergebnis ging verloren
  // und der Vorgang endete ehrlich als `unbekannt`. Der Speicherweg ist KEIN Modellaufruf
  // (kostet kein Budget) und in der Datenbank CAS-gesichert (Besitzer + Fencing + Lease
  // unter Row-Lock): hat der erste Versuch in Wahrheit committet, antwortet die
  // Wiederholung geordnet (`zustand-fertig`) und schreibt NIE doppelt. Deshalb ist genau
  // EIN zweiter Versuch sicher — mehr nicht, und niemals ein zweiter Modellaufruf.
  if (!cas.pruefbar && !cas.gespeichert) {
    // Nur wiederholen, wenn bis zur Deadline des Aufrufers noch die Wartezeit VOR der
    // Wiederholung PLUS ein kompletter Speicherversuch + Abschluss passen — sonst
    // bleibt es beim ehrlichen ersten Befund (Review-Korrektur §29: die Wartezeit
    // gehoert in die Rechnung, sonst frisst sie die Reserve des zweiten Versuchs).
    const warteMs = Number(deps.speicherWiederholungWarteMs) >= 0
      ? Number(deps.speicherWiederholungWarteMs) : 1000;
    const deadline = Number(deps.deadlineMs) > 0 ? Number(deps.deadlineMs) : 0;
    const zeitReicht = deadline === 0 || (deadline - Date.now())
      >= (warteMs + verstehenRestzeit.speicherTimeoutMs() + verstehenRestzeit.ABSCHLUSS_RESERVE_MS);
    if (zeitReicht) {
      try {
        console.error("[understanding] Speicherweg nicht pruefbar — genau eine Wiederholung (kein Modellaufruf):",
          ko.vorgang_id, cas.grund || "unbekannt");
      } catch (_) { /* ignore */ }
      if (warteMs > 0) await new Promise((r) => setTimeout(r, warteMs));
      const zweiter = await speicherAufruf();
      if (zweiter.gespeichert || zweiter.pruefbar) {
        cas = zweiter;
      } else {
        cas = { ...zweiter, grund: `nach-wiederholung:${zweiter.grund || "unbekannt"}` };
      }
    }
  }
  // Erfolg schließt den Vorgang MIT ab (eine Transaktion) — die Meldung „fertig" trägt
  // damit genau das, was die Ablage trägt (CLAUDE.md §4 Regel 10).
  if (cas.gespeichert) return { gespeichert: true, veraltet: false, abgeschlossen: true, nichtPruefbar: false, grund: null };
  // Geordnete Absage: ein anderer Lauf ist weiter, oder das eigene Lease ist abgelaufen.
  if (cas.pruefbar) return { gespeichert: false, veraltet: true, abgeschlossen: false, nichtPruefbar: false, grund: cas.grund };
  // Nicht prüfbar: fail closed. NICHT als „nicht gespeichert" behaupten — es ist unklar.
  return { gespeichert: false, veraltet: false, abgeschlossen: false, nichtPruefbar: true, grund: cas.grund };
}

function vertragsAbsage({ reservierung, vorgangId, clusterDocs = [], spur = {}, verknuepfe = null, dokumente = 0, zusatz = {} }) {
  const grund = (reservierung && reservierung.grund) || "unbekannt";
  const gemeinsam = { vorgangId, documents: dokumente, ...spur, ...zusatz };

  if (grund === "bereits-fertig") {
    // Die Dokumente sind nachweislich verarbeitet (dieselbe Eingabe hat bereits ein
    // Ergebnis erzeugt) — sie bekommen ihren Endzustand, damit der Watchdog sie nicht
    // ewig als offen meldet. Idempotent: eine bestehende Verknuepfung bleibt bestehen.
    if (verknuepfe && clusterDocs.length) {
      return Promise.resolve(verknuepfe(`ko-${vorgangId}`, clusterDocs))
        .catch(() => {})
        .then(() => ({ ...gemeinsam, status: "duplicate", begruendung: "eingabe-bereits-verstanden" }));
    }
    return { ...gemeinsam, status: "duplicate", begruendung: "eingabe-bereits-verstanden" };
  }

  if (grund === "aufgegeben") {
    if (verknuepfe && clusterDocs.length) {
      return Promise.resolve(verknuepfe(`ko-${vorgangId}`, clusterDocs))
        .catch(() => {})
        .then(() => ({ ...gemeinsam, status: "skipped-terminal", reason: "verstehen-aufgegeben" }));
    }
    return { ...gemeinsam, status: "skipped-terminal", reason: "verstehen-aufgegeben" };
  }

  if (grund === "ausgang-unbekannt") {
    // KEINE Verknuepfung: der Endzustand ist gerade das Unbekannte. Der Vorgang bleibt
    // sichtbar offen, bis er ausdruecklich aufgeloest wird.
    return { ...gemeinsam, status: "skipped-ausgang-unbekannt", reason: "modellausgang-unbekannt" };
  }

  return { ...gemeinsam, status: "skipped-cluster-belegt", reason: grund };
}

// Versteht EINEN Vorgang (Cluster) global per KI. opts erlaubt dem C8-Pending-Pfad,
// vorgang_id + das bereits geladene KO durchzureichen (kein erneutes Fetch/Ableiten).
//
// ERGEBNISKLASSEN (es gibt KEINEN stillen Ausgang mehr — `skipped-exists` ist
// ersatzlos entfallen, weil es zwei voellig verschiedene Faelle vermischt hat:
// "dasselbe Dokument nochmal" und "zufaellig dasselbe Wort"):
//   saved             neues Knowledge Object entstanden
//   updated           bestehendes Knowledge Object mit neuen Fakten aktualisiert
//   merged            Dokumente einem bestehenden Vorgang hinzugefuegt (keine neuen Fakten)
//   duplicate         echtes vollstaendiges Duplikat (alle Dokumente bereits verknuepft)
//   skipped-terminal  bewusst ausgeschlossen (failed-final, "nie wieder")
//   skipped-failed    nach KI-Fehlschlag geparkt (Wiedervorlage ueber den Nachholpfad)
//   skipped-budget    Tagesbudget erschoepft -> erneut einplanen
//   skipped-error     KI-/Transportfehler -> geparkt und gemeldet
//   skipped-invalid   KI-Antwort schema-ungueltig -> geparkt und gemeldet
//   skipped-store     Speichern fehlgeschlagen -> erneut einplanen
//   skipped-ausgang-unbekannt  (OP-30 CAS) ein Modellaufruf ist abgestuerzt, bevor sein
//                     Ergebnis persistiert war -> sichtbar blockiert, NIE automatisch wiederholt
//   skipped-veraltet  (OP-30 CAS) ein neuerer Besitzer hat den Vorgang uebernommen -> das
//                     eigene Ergebnis gilt nicht und wird NICHT geschrieben
//
// VERKNUEPFUNGSINVARIANTE: jeder Ausgang, der einen Vorgang gefunden oder gebildet
// hat, schreibt ko_document_links fuer SEINE Dokumente. Dadurch ist der Endzustand
// jedes Rohdokuments dauerhaft aus der Datenbank ableitbar (keine neue Tabelle):
// verknuepft = verarbeitet, unverknuepft = offen und damit Nachholkandidat.
async function understandOneCluster(cluster, deps, opts = {}) {
  const aufloesung = await resolveVorgang(cluster, deps, opts);
  const vorgangId = aufloesung.vorgangId;
  const existing = aufloesung.existing;
  const clusterDocs = (cluster && cluster.documents) || [];
  // ATOMARER VERSTEHENSVERTRAG (OP-30 CAS): eigener Besitzer je Cluster, damit
  // prozessinterne Nebenlaeufigkeit sich exakt wie prozessuebergreifende verhaelt.
  // Ohne Flag ist der Wert null und alles unten verhaelt sich byte-identisch zu vorher.
  const vertrag = opts.vertrag !== undefined
    ? opts.vertrag
    : (typeof deps.verstehenVertrag === "function" ? deps.verstehenVertrag() : null);
  // Die vollstaendige Kandidatenpruefung wandert in das Ergebnis, damit jede
  // Zusammenfuehrung UND jede Ablehnung nachtraeglich reproduzierbar ist.
  const aufloesungsSpuren = aufloesung.spuren || [];
  const abgelehnt = aufloesungsSpuren.filter((s) => s && !s.gleich);
  // HOTFIX B4-3: die Ablehnungsgruende haengen an JEDEM Ausgang, nicht nur am
  // erfolgreichen. Vorher trug allein der `saved`-Zweig `aufloesungsSpuren` —
  // ausgerechnet die Faelle, in denen der Resolver eine Zusammenfuehrung
  // VERHINDERT hat, waren damit in der Lauftelemetrie unsichtbar. Bewusst nur
  // Kennungen, Zahlen und Grundklassen (kein Text, DSGVO-Datensparsamkeit).
  const spur = {
    resolution: aufloesung.resolution,
    begruendung: aufloesung.begruendung,
    resolverGeprueft: aufloesungsSpuren.length,
    resolverAbgelehnt: abgelehnt.length,
    resolverAblehnungsgruende: [...new Set(abgelehnt.map((s) => s.grund).filter(Boolean))].slice(0, 6)
  };

  // Verknuepfung ist IMMER fail-safe: ein Telemetrie-/Provenienzfehler darf ein
  // erfolgreiches Understanding nie zuruecknehmen und nie den Batch abbrechen.
  const verknuepfe = async (koId, docs) => {
    if (!koId || !docs || !docs.length || typeof deps.saveSources !== "function") return;
    try { await deps.saveSources(koId, docs); }
    catch (e) { try { console.error("[understanding] saveSources fehlgeschlagen:", e && e.message); } catch (_) { /* ignore */ } }
  };

  if (existing) {
    // OP-06/P1-4: terminal aussortierte Vorgaenge (failed-final) duerfen NIE
    // erneut verstanden werden ("nie wieder"-Garantie, kein KI-Call). Die
    // Dokumente werden trotzdem verknuepft — sonst haetten sie keinen Endzustand
    // und der Watchdog wuerde sie ewig als offen melden.
    if (isTerminalUnderstandingStatus(existing.understanding_status)) {
      await verknuepfe(existing.id, clusterDocs);
      return { vorgangId, status: "skipped-terminal", documents: clusterDocs.length, ...spur };
    }

    // Bereits VERSTANDENER Vorgang: echtes Duplikat oder Aktualisierung?
    // Genau hier verschwand das Ereignis frueher lautlos.
    if (existing.status !== "pending") {
      const bekannt = new Set((aufloesung.bestandsDokumente || []).map((d) => d && d.id).filter(Boolean));
      // Ein Dokument OHNE Kennung laesst sich nicht als bereits bekannt beweisen —
      // es gilt deshalb als neu. Andernfalls wuerde ausgerechnet der schlechteste
      // Datenfall (fehlende id) als "vollstaendiges Duplikat" durchgehen.
      const neueDocs = clusterDocs.filter((d) => d && (!d.id || !bekannt.has(d.id)));
      if (!neueDocs.length) {
        // P29-3: "duplicate" gilt nur fuer eine nachweislich vollstaendig
        // verarbeitete Fassung. Haengt an diesem Vorgang eine offene Update-
        // Vormerkung (gescheiterte oder vertagte Aktualisierung), wird sie hier
        // BEGRENZT wieder aufgenommen statt still als Duplikat zu enden.
        const vormerkung = await leseVormerkung(deps, opts.retriesCtx, vorgangId, vertrag);
        if (vormerkung.vorhanden) {
          const fehlversuche = vormerkung.fehlversuche;
          if (fehlversuche >= updateWiederaufnahmeMax(deps)) {
            // Deckel erschoepft: sichtbar aufgegeben, KEIN weiterer KI-Call.
            // Neue Dokumente heilen ueber den normalen Update-Pfad; ein Operator
            // kann die Vormerkung leeren, um erneut freizugeben.
            return { vorgangId, status: "skipped-update-final", documents: clusterDocs.length, ...spur, begruendung: "wiederaufnahme-erschoepft" };
          }
          const bestandsDocsWiederaufnahme = aufloesung.bestandsDokumente || [];
          return understandUpdate(cluster, deps, {
            vorgangId, existing, neueDocs: [], spur, neueAnker: [],
            alleDocs: bestandsDocsWiederaufnahme.length ? bestandsDocsWiederaufnahme : clusterDocs,
            retriesCtx: opts.retriesCtx, wiederaufnahme: true, vertrag
          });
        }
        return { vorgangId, status: "duplicate", documents: clusterDocs.length, ...spur };
      }
      // Zuerst verknuepfen, dann entscheiden: die Dokumente sind ab hier nicht
      // mehr verlierbar, unabhaengig davon, ob ein KI-Lauf zustande kommt.
      await verknuepfe(existing.id, neueDocs);
      const bestandsDocs = aufloesung.bestandsDokumente || [];
      // KOSTENVORSICHT bei fehlendem Beleg: liegen zum Bestand ueberhaupt keine
      // verknuepften Dokumente vor (Alt-Vorgang aus der Zeit vor der
      // Verknuepfungsinvariante), laesst sich "neue Fakten" nicht BEWEISEN. Dann
      // wird nur verknuepft statt teuer neu verstanden — verloren geht nichts,
      // und beim naechsten Lauf ist der Beleg vorhanden (selbstheilend).
      if (!bestandsDocs.length) {
        return { vorgangId, status: "merged", documents: neueDocs.length, ...spur, begruendung: "bestand-ohne-beleg" };
      }
      const erkenntnis = neueErkenntnisse(neueDocs, bestandsDocs);
      if (!erkenntnis.neu) {
        return { vorgangId, status: "merged", documents: neueDocs.length, ...spur, begruendung: "keine-neuen-fakten" };
      }
      return understandUpdate(cluster, deps, {
        vorgangId, existing, neueDocs, spur, neueAnker: erkenntnis.anker,
        alleDocs: [...bestandsDocs, ...neueDocs], retriesCtx: opts.retriesCtx, vertrag
      });
    }

    // Geparkter Vorgang (KI-Fehlschlag): kein automatischer Neuversuch, aber die
    // Dokumente bekommen einen sichtbaren Endzustand und sind gezielt nachholbar.
    if (existing.understanding_status === "failed") {
      await verknuepfe(existing.id, clusterDocs);
      return { vorgangId, status: "skipped-failed", documents: clusterDocs.length, ...spur };
    }
  }
  const model = typeof deps.modelName === "function" ? deps.modelName() : null;
  const headline = (cluster.documents && cluster.documents[0] && cluster.documents[0].title) || cluster.headline || "";
  const failMeta = { headline, understanding_model: model };
  // Fehlschlag IMMER parken (status bleibt 'pending', understanding_status='failed'):
  // verhindert Endlos-Retry — auch fuer neu entdeckte Vorgaenge im eager-Pfad. Der
  // Vorgang wird nie ausgeliefert/gematcht; ein Operator kann understanding_status
  // zuruecksetzen, um erneut zu versuchen. Selbst fail-safe (schluckt Storage-Fehler).
  // Fehlschlag IMMER parken UND die Dokumente an den geparkten Vorgang binden:
  // sonst haette ein gescheitertes Dokument keinen nachweisbaren Endzustand und
  // waere von einem nie verarbeiteten Dokument nicht unterscheidbar.
  const markFailed = async () => {
    if (typeof deps.markFailed !== "function") return;
    try {
      await deps.markFailed(vorgangId, failMeta);
      await verknuepfe(`ko-${vorgangId}`, clusterDocs);
    } catch (e) { try { console.error("[understanding] markFailed fehlgeschlagen:", e && e.message); } catch (_) { /* ignore */ } }
  };

  // ── RESTZEITWACHE (Reparatursprint 2026-08-20, Runbook §29) ────────────────────────
  // VOR der Reservierung: reicht die Zeit bis zur absoluten Deadline des Aufrufers
  // nicht mehr fuer Modellantwort + Speicherung + Abschluss, wird der Vorgang ehrlich
  // zurueckgestellt — KEINE Reservierung, KEINE Lease, KEIN Budgetverbrauch, KEIN
  // Versuch. Er bleibt unveraendert Nachholkandidat. Ohne Deadline (deadlineMs 0/
  // undefined) ist die Entscheidung immer „erlaubt" — Bestandsverhalten.
  const verstehensDeadlineMs = Number(opts.deadlineMs) > 0
    ? Number(opts.deadlineMs)
    : (Number(deps.deadlineMs) > 0 ? Number(deps.deadlineMs) : 0);
  {
    const zeit = verstehenRestzeit.restzeitEntscheidung({
      deadlineMs: verstehensDeadlineMs,
      reserveMs: verstehenRestzeit.reserveVorModellstartMs()
    });
    if (!zeit.erlaubt) {
      return {
        vorgangId, status: "skipped-zeitbudget", reason: zeit.grund,
        restMs: zeit.restMs, reserveMs: zeit.reserveMs, documents: clusterDocs.length, ...spur
      };
    }
  }

  // ── ATOMARE RESERVIERUNG (OP-30 CAS) ───────────────────────────────────────────────
  // VOR dem Budget-Gate, damit eine bereits fertige Eingabe gar nicht erst gegen den
  // Tagesdeckel laeuft (Idempotenz kostet nichts). Ohne Flag ist `vertrag` null und der
  // Ablauf unten ist byte-identisch zu vorher.
  let reservierung = null;
  let abgeschlossen = false;
  // Zustandsvertrag um den Modellstart (siehe belegtNichtAbgesendet oben).
  let modellGestartet = false;
  let belegtOhneAufruf = false;
  let unbekanntGrund = null;
  const ausgangUnbekannt = () => Boolean(vertrag && reservierung && modellGestartet && !belegtOhneAufruf);
  // EHRLICHE MELDUNG: wer nicht belegen kann, dass kein Aufruf stattfand, behauptet es
  // auch nicht — der Ausgang steht im Rueckgabewert.
  const marke = () => (ausgangUnbekannt() ? { ausgang: "unbekannt" } : {});
  if (vertrag) {
    const hash = verstehenVertragModul.eingabeHash({ vorgangId, dokumente: clusterDocs, modus: "erst" });
    reservierung = await vertrag.reserviere({ vorgangId, eingabeHash: hash });
    if (!reservierung.erlaubt) {
      return vertragsAbsage({ reservierung, vorgangId, clusterDocs, spur, verknuepfe, dokumente: clusterDocs.length });
    }
  }
  try {

  const budget = await deps.canSpend();
  if (!budget || !budget.allowed) {
    deps.logSkip("skipped-understanding-budget");
    // KEINE Verknuepfung: das Dokument ist nicht verarbeitet, sondern vertagt.
    // Genau daran erkennt der Nachholpfad es wieder.
    return { vorgangId, status: "skipped-budget", reason: budget && budget.reason, ...spur };
  }

  // KONKURRENZWACHE (siehe defaultDeps): haelt ein ANDERER Verarbeiter diesen Vorgang,
  // wird OHNE Modellaufruf zurueckgestellt — keine Verknuepfung, das Dokument bleibt
  // Nachholkandidat. Beim naechsten Anlauf liegt das KO des anderen Verarbeiters vor
  // und der Bestandskurzschluss oben greift ohne Kosten. Eine NICHT PRUEFBARE Wache
  // (Migration fehlt, DB-Fehler) erlaubt nichts: fail closed, sichtbar im Grund.
  let clusterFreigabe = null;
  if (deps.clusterWache && typeof deps.clusterWache.belege === "function") {
    clusterFreigabe = await deps.clusterWache.belege(vorgangId);
    if (!clusterFreigabe || clusterFreigabe.erlaubt !== true) {
      return { vorgangId, status: "skipped-cluster-belegt", reason: (clusterFreigabe && clusterFreigabe.grund) || "vorgang-belegt", ...spur };
    }
  }
  try {

  // ── RESTZEITWACHE, ZWEITE PRUEFUNG — VOR dem Modellstart-Vermerk (§29) ─────────────
  // Zwischen der ersten Pruefung und hier liegen Reservierung, Budget-Gate und
  // Konkurrenzwache (je ein Supabase-Roundtrip, im Stoerfall bis ~10 s). Die
  // Vor-Modellstart-Reserve deckt zusaetzlich den `modellstart`-RPC selbst (ein
  // weiterer Storage-Aufruf). Reicht die Zeit JETZT nicht mehr, wird NICHT vermerkt
  // und NICHT aufgerufen; das finally gibt die Reservierung regulaer frei („kein
  // Ergebnis vor Modellstart" — sicher wiederholbar). Der bereits gezaehlte Versuch
  // dieser Reservierung ist der bewusst akzeptierte Preis dieses seltenen Pfads — die
  // Alternative waere ein verwaister bezahlter Aufruf.
  {
    const zeit = verstehenRestzeit.restzeitEntscheidung({
      deadlineMs: verstehensDeadlineMs,
      reserveMs: verstehenRestzeit.reserveVorModellstartMs()
    });
    if (!zeit.erlaubt) {
      return {
        vorgangId, status: "skipped-zeitbudget", reason: zeit.grund,
        restMs: zeit.restMs, reserveMs: zeit.reserveMs, documents: clusterDocs.length, ...spur
      };
    }
  }

  // MODELLSTART VERMERKEN (OP-30 CAS, Auftrag §8) — unmittelbar VOR dem externen
  // Aufruf. Ab diesem Vermerk ist ein Absturz als „Ausgang unbekannt" erkennbar und
  // wird nie automatisch wiederholt. Ist der Vermerk nicht setzbar, wird NICHT
  // aufgerufen: fail closed. ZWEI Absagegruende (Review-Korrektur §29):
  //   * geordnet abgelehnt (Lease/Besitz verloren) -> ein ANDERER ist zustaendig,
  //     nichts anfassen (wie bisher);
  //   * NICHT PRUEFBAR (RPC-Timeout/Netzfehler) -> der Vermerk KANN serverseitig
  //     committet sein (Zeile `modell-laeuft`, ki_aufrufe+1) — aber belegbar wurde
  //     NICHTS abgesendet (der KI-Pfad wurde nie erreicht). Genau dafuer existiert
  //     `freigabeOhneAufruf` (greift aus `reserviert` UND `modell-laeuft`, Besitzer-
  //     und Fencing-gesichert, korrigiert ki_aufrufe): die Zeile wird sicher wieder
  //     `offen` statt ueber die ablaufende Lease faelschlich in `unbekannt` zu laufen.
  if (vertrag && reservierung) {
    const start = await vertrag.modellstart({ vorgangId, fencing: reservierung.fencing });
    if (!start.erlaubt) {
      abgeschlossen = true;   // das finally soll keinen weiteren Rueckweg versuchen
      if (/^vertrag-nicht-pruefbar:/.test(String(start.grund || ""))) {
        const rueckweg = await Promise.resolve(vertrag.freigabeOhneAufruf({
          vorgangId, fencing: reservierung.fencing, grund: "modellstart-nicht-pruefbar"
        })).catch(() => ({ ok: false }));
        return {
          vorgangId, status: "skipped-modellstart-unklar",
          reason: start.grund, rueckwegOk: Boolean(rueckweg && rueckweg.ok),
          documents: clusterDocs.length, ...spur
        };
      }
      return { vorgangId, status: "skipped-cluster-belegt", reason: `modellstart-abgelehnt:${start.grund || "unbekannt"}`, ...spur };
    }
    // AB HIER kann ein bezahlter Modellaufruf stattgefunden haben.
    modellGestartet = true;
  }

  // ── RESTZEITWACHE, DRITTE PRUEFUNG — unmittelbar VOR dem externen KI-Aufruf (§29,
  // Review-Korrektur): der `modellstart`-RPC davor kann bis zum Storage-Timeout
  // gedauert haben. Reicht die KERNRESERVE (Modellantwort + Schreibrecht + Speicherung
  // + Abschluss) jetzt nicht mehr, wird NICHT abgesendet. Das ist zu diesem Zeitpunkt
  // BELEGBAR (der KI-Pfad wurde nicht erreicht) — deshalb ist `belegtOhneAufruf` der
  // ehrliche, sichere Rueckweg: das finally nimmt `freigabeOhneAufruf`, die Zeile wird
  // wieder `offen`, kein Budget, kein zweiter bezahlter Aufruf, keine verwaiste Lease.
  {
    const zeit = verstehenRestzeit.restzeitEntscheidung({ deadlineMs: verstehensDeadlineMs });
    if (!zeit.erlaubt) {
      belegtOhneAufruf = true;
      return {
        vorgangId, status: "skipped-zeitbudget", reason: zeit.grund,
        restMs: zeit.restMs, reserveMs: zeit.reserveMs, documents: clusterDocs.length, ...spur
      };
    }
  }

  let aiResult;
  try {
    aiResult = await deps.requestUnderstanding(buildUnderstandingPrompt(cluster));
  } catch (error) {
    // Budget-Stopp der Choke-Point-Reservierung (Race-Fenster zwischen Pre-Gate
    // oben und Modellaufruf): KEIN markFailed — der Vorgang ist inhaltlich
    // gesund und soll am naechsten Tag normal verstanden werden. Der Skip-Eintrag
    // wurde bereits am Choke-Point protokolliert (skipped-understanding).
    // BELEGBAR VOR DEM ABSENDEN gescheitert (Tagesbudget, Anbietergrenze): sicher
    // wiederholbar, kein Modellaufruf gezaehlt — die Reservierung wird freigegeben.
    if (belegtNichtAbgesendet(error)) {
      belegtOhneAufruf = true;
      if (error.code === "LLM_BUDGET_EXHAUSTED") {
        return { vorgangId, status: "skipped-budget", reason: error.reason || "daily-llm-budget-reached", ...spur };
      }
    }
    await markFailed();
    // HTTP-Fehlercode aus ai.js ist kein KI-Inhalt — safe to log fuer Diagnose (kein Prompt/Response).
    const errorCode = error && error.message ? String(error.message).slice(0, 120) : "unknown";
    console.error("[understanding] skipped-error:", vorgangId, errorCode);
    deps.logSkip("skipped-understanding-error");
    // Zeitueberschreitung, Verbindungsabbruch, unklarer Anbieterfehler: der Ausgang ist
    // NICHT belegbar. Das finally stellt den Vorgang auf `unbekannt`.
    unbekanntGrund = unbekanntGrund || `modellfehler:${errorCode}`.slice(0, 200);
    return { vorgangId, status: "skipped-error", errorCode, ...spur, ...marke() };
  }

  // P29-2 (Fix-Sprint Punkt 29): parseJsonText("null") liefert null OHNE throw
  // (gueltiges JSON). Ein nicht verwertbarer Rueckgabewert (null/kein Objekt)
  // endete frueher als anonymer cluster-error ohne Endzustand — und wurde im
  // Pending-Pfad jeden Lauf erneut versucht. Jetzt: kontrolliert wie eine
  // schema-ungueltige Antwort parken (markFailed + Skip-Log) — sichtbar, mit
  // Endzustand, kein unbegrenzter Wiederholungszyklus.
  if (!aiResult || typeof aiResult !== "object" || Array.isArray(aiResult)) {
    await markFailed();
    deps.logSkip("skipped-understanding-invalid");
    // Eine ungueltige Antwort ist ein BEZAHLTER Aufruf mit unbrauchbarem Ergebnis —
    // kein Grund, denselben Aufruf automatisch noch einmal zu bezahlen.
    unbekanntGrund = unbekanntGrund || "ki-antwort-nicht-verwertbar";
    return { vorgangId, status: "skipped-invalid", errors: ["ki-antwort-nicht-verwertbar"], ...spur, ...marke() };
  }

  // bestand: bei einem Erstverstehen normalerweise null. Ist ein VORGEMERKTER
  // (pending) Vorgang vorhanden, der bereits eine ermittelte Ebene traegt, wird
  // sie uebernommen statt verworfen (Sprint 19).
  const ko = assembleKnowledgeObject(aiResult, cluster, vorgangId, { understanding_status: "complete", model, bestand: existing || null });
  // best_source_url-Pointer aus dem staerksten Cluster-Dokument (kein KI-Feld).
  const best = pickBestSourceDoc(cluster.documents);
  if (best) {
    ko.best_source_url = best.url || best.canonical_url || null;
    ko.best_link_type = best.link_type || null;
    ko.source_trust = best.confidence || null;
  }
  const validation = validateKnowledgeObject(ko);
  if (!validation.valid) {
    await markFailed();
    deps.logSkip("skipped-understanding-invalid");
    unbekanntGrund = unbekanntGrund || "validierung-fehlgeschlagen";
    return { vorgangId, status: "skipped-invalid", errors: validation.errors.slice(0, 5), ...spur, ...marke() };
  }

  // SCHREIBRECHT (OP-30 CAS): gilt unser Lease noch? Die HARTE Zusage liegt zusaetzlich
  // in der Datenbank (Trigger helmut_ko_fencing_wache) — auch ein hier beliebig lange
  // stehen gebliebener Arbeiter kann ein neueres Ergebnis nicht mehr ueberschreiben.
  if (vertrag && reservierung) {
    const recht = await vertrag.schreibrecht({ vorgangId, fencing: reservierung.fencing });
    if (!recht.erlaubt) {
      // KEIN `abgeschlossen`: hat bloss unser Lease den Ablauf erreicht, ohne dass ein
      // Nachfolger uebernommen hat, gehoert die Zeile weiterhin uns — und der Ausgang
      // dieses bezahlten Aufrufs gehoert dann nach `unbekannt`, nicht nach `offen`.
      unbekanntGrund = unbekanntGrund || `schreibrecht-verloren:${recht.grund || "lease-verloren"}`;
      return { vorgangId, status: "skipped-veraltet", reason: recht.grund || "lease-verloren", ...spur, begruendung: "schreibrecht-verloren", ...marke() };
    }
  }

  const persistenz = await persistiereVerstehensergebnis({ vertrag, reservierung, ko, deps });
  // Die Datenbank hat eine veraltete Ueberschreibung abgewehrt: kein Fehler, kein
  // Wiederholungsgrund — das neuere Ergebnis gilt.
  if (persistenz.veraltet) {
    unbekanntGrund = unbekanntGrund || `speichern-abgewehrt:${persistenz.grund || "veraltet"}`;
    return { vorgangId, status: "skipped-veraltet", reason: persistenz.grund || "fencing-abgewehrt", ...spur, begruendung: "datenbank-hat-abgewehrt", ...marke() };
  }
  // Ein nicht pruefbarer Speicherversuch ist der gefaehrlichste Fall: der Aufruf ist
  // bezahlt, und ob das Ergebnis liegt, weiss niemand. Fail closed nach `unbekannt`.
  if (persistenz.nichtPruefbar) {
    deps.logSkip("skipped-understanding-error");
    unbekanntGrund = unbekanntGrund || `speicherfehler:${persistenz.grund || "unbekannt"}`;
    return { vorgangId, status: "skipped-store", reason: persistenz.grund || "speichern-nicht-pruefbar", ...spur, ...marke() };
  }
  // Provenienz persistieren (fail-safe): Quell-Dokumente <-> KO in ko_document_links.
  // Ein Fehler hier darf das erfolgreiche Understanding nie zuruecknehmen.
  if (persistenz.gespeichert) await verknuepfe(ko.id, clusterDocs);
  if (persistenz.abgeschlossen) abgeschlossen = true;
  return {
    vorgangId,
    status: persistenz.gespeichert ? "saved" : "skipped-store",
    id: ko.id,
    documents: ko.source_document_count,
    ...spur,
    aufloesungsSpuren
  };

  // Die Wache wird ERST NACH der Persistenz freigegeben (finally umschliesst
  // Modellaufruf UND Save): ein zweiter Verarbeiter desselben Vorgangs darf erst
  // dann wieder pruefen, wenn der Bestandskurzschluss ihn kostenlos bedienen kann.
  // Bei Absturz mittendrin heilt die TTL des Slots (kein Reaper noetig).
  } finally {
    if (clusterFreigabe && deps.clusterWache && typeof deps.clusterWache.gebeFrei === "function") {
      await Promise.resolve(deps.clusterWache.gebeFrei(clusterFreigabe.slot)).catch(() => {});
    }
  }

  // AUSDRUECKLICHE FREIGABE BEI BEKANNTEM AUSGANG (Budgetvertagung, Modellfehler,
  // ungueltige Antwort). Der Unterschied zum ABSTURZ ist genau diese Meldung: wer
  // abstuerzt, meldet nichts — dann laeuft das Lease ab und der Vorgang landet
  // sichtbar in `unbekannt`, statt einen zweiten bezahlten Aufruf auszuloesen.
  } finally {
    if (vertrag && reservierung && !abgeschlossen) {
      if (ausgangUnbekannt()) {
        // NACH dem Modellstart ohne belegtes Ergebnis: sichtbar blockieren. Es gibt hier
        // bewusst KEINEN Rueckfall auf `freigabe` — der waere ein automatischer zweiter,
        // bezahlter Aufruf beim naechsten Lauf.
        await Promise.resolve(vertrag.ausgangUnbekannt({
          vorgangId, fencing: reservierung.fencing,
          grund: unbekanntGrund || "ausgang-nach-modellstart-unbekannt"
        })).catch(() => {});
      } else if (modellGestartet) {
        // Der Modellstart war vermerkt, aber es ist BELEGT, dass nichts abgesendet wurde
        // (Tagesbudget/Anbietergrenze vor dem HTTP-Aufruf). Eigener, eng gefasster Weg.
        await Promise.resolve(vertrag.freigabeOhneAufruf({
          vorgangId, fencing: reservierung.fencing, grund: "belegt-nicht-abgesendet"
        })).catch(() => {});
      } else {
        // VOR dem Modellstart: sicher wiederholbar.
        await Promise.resolve(vertrag.freigabe({
          vorgangId, fencing: reservierung.fencing, grund: "kein-ergebnis-vor-modellstart"
        })).catch(() => {});
      }
    }
  }
}

// Aktualisierung eines BEREITS VERSTANDENEN Vorgangs, zu dem neue Fakten
// eingetroffen sind (neue Kernanker gegenueber dem Bestand). Bewusst derselbe
// KI-Pfad wie ein Erstverstehen — nur mit der vollstaendigen Dokumentmenge und
// erhoehter ko_version, damit Lage und Briefing den aktuellen Stand sehen.
//
// KOSTENEHRLICHKEIT: dieser Pfad kostet einen zusaetzlichen KI-Aufruf und laeuft
// deshalb durch dasselbe Budget-Gate. Reicht das Budget nicht, endet der Cluster
// als `skipped-budget` — die neuen Dokumente sind aber bereits verknuepft und
// damit weder verloren noch unsichtbar; nur die Neuformulierung wartet.
async function understandUpdate(cluster, deps, ctx = {}) {
  const { vorgangId, existing, neueDocs, spur, neueAnker, retriesCtx, wiederaufnahme } = ctx;
  // OP-30 CAS: derselbe Vertrag (und damit derselbe Besitzer) wie im aufrufenden
  // Erstverstehenspfad — die Aktualisierung ist dessen Fortsetzung, nicht ein zweiter
  // Arbeiter. Ohne Flag null; dann bleibt unten alles byte-identisch.
  const vertrag = ctx.vertrag !== undefined
    ? ctx.vertrag
    : (typeof deps.verstehenVertrag === "function" ? deps.verstehenVertrag() : null);
  const model = typeof deps.modelName === "function" ? deps.modelName() : null;
  const vollCluster = { documents: ctx.alleDocs && ctx.alleDocs.length ? ctx.alleDocs : neueDocs, anchors: cluster.anchors };
  // Wiederaufnahme-Marker in JEDEM Ausgang: eine wieder aufgenommene
  // Aktualisierung bleibt in der Lauftelemetrie von einem Erstversuch
  // unterscheidbar (P29-3).
  const marker = wiederaufnahme ? { wiederaufnahme: true } : {};

  // P29-3: jede NICHT erfolgreiche Aktualisierung wird vorgemerkt, damit der
  // naechste identische Lauf sie wieder aufnimmt statt sie als "duplicate" zu
  // verlieren. Fehlversuche (KI-/Schema-/Store-Fehler) zaehlen gegen den Deckel,
  // eine Budget-Vertagung nicht. Ein echter Erfolg loest die Vormerkung auf.
  //
  // MIT DEM CAS-VERTRAG ist genau das ATOMAR: eine Zeile je Vorgang, erhoeht per
  // `insert .. on conflict do update set fehlversuche = fehlversuche + delta`. Es wird
  // nichts mehr gelesen, geaendert und zurueckgeschrieben — und damit kann auch kein
  // gleichzeitiger Lauf einen Eintrag ueberschreiben (CLAUDE.md §4 Regel 10). Ohne den
  // Vertrag bleibt der Karten-Store byte-identisch bestehen.
  const merkeUpdateOffen = async (fehlversuchZaehlen) => {
    if (vertrag) {
      await vertrag.vormerkungErhoehe({
        vorgangId, delta: fehlversuchZaehlen ? 1 : 0,
        fencing: (reservierung && reservierung.fencing) || 0
      });
      return;
    }
    const map = await leseUpdateVormerkungen(deps, retriesCtx);
    if (!map) return;
    const bisher = Number(map[vorgangId]) || 0;
    map[vorgangId] = fehlversuchZaehlen ? bisher + 1 : bisher;
    await schreibeUpdateVormerkungen(deps, retriesCtx);
  };
  const loeseVormerkungAuf = async () => {
    if (vertrag) {
      // BEDINGT gegen den Fencing-Wert: ein langsamer Erfolgsmelder loescht nie die
      // Vormerkung eines juengeren, gescheiterten Laufs.
      await vertrag.vormerkungLoese({ vorgangId, fencing: (reservierung && reservierung.fencing) || 0 });
      return;
    }
    const map = await leseUpdateVormerkungen(deps, retriesCtx);
    if (!map || !Object.prototype.hasOwnProperty.call(map, vorgangId)) return;
    delete map[vorgangId];
    await schreibeUpdateVormerkungen(deps, retriesCtx);
  };

  // ── ATOMARE RESERVIERUNG (OP-30 CAS) — dieselbe Zusage wie beim Erstverstehen ─────
  // Der Eingabehash traegt hier zusaetzlich die naechste `ko_version`: eine
  // Fortschreibung ist eine ANDERE Eingabe als der Bestand, auch bei gleicher
  // Dokumentmenge (Wiederaufnahme nach Fehlversuch).
  let reservierung = null;
  let abgeschlossen = false;
  // Derselbe Zustandsvertrag um den Modellstart wie im Erstverstehen.
  let modellGestartet = false;
  let belegtOhneAufruf = false;
  let unbekanntGrund = null;
  const ausgangUnbekannt = () => Boolean(vertrag && reservierung && modellGestartet && !belegtOhneAufruf);
  const marke = () => (ausgangUnbekannt() ? { ausgang: "unbekannt" } : {});

  // ── RESTZEITWACHE (§29) — dieselbe Zusage wie im Erstverstehen ─────────────────────
  // VOR der Reservierung: reicht die Zeit nicht mehr fuer Modellantwort + Speicherung +
  // Abschluss, wird die Aktualisierung wie eine Budget-Vertagung behandelt: vorgemerkt
  // (kein Fehlversuch), keine Reservierung, kein Budget, kein Modellaufruf.
  const verstehensDeadlineMs = Number(ctx.deadlineMs) > 0
    ? Number(ctx.deadlineMs)
    : (Number(deps.deadlineMs) > 0 ? Number(deps.deadlineMs) : 0);
  {
    const zeit = verstehenRestzeit.restzeitEntscheidung({
      deadlineMs: verstehensDeadlineMs,
      reserveMs: verstehenRestzeit.reserveVorModellstartMs()
    });
    if (!zeit.erlaubt) {
      await merkeUpdateOffen(false);
      return {
        vorgangId, status: "skipped-zeitbudget", reason: zeit.grund,
        restMs: zeit.restMs, reserveMs: zeit.reserveMs,
        documents: neueDocs.length, ...spur, begruendung: "aktualisierung-vertagt", neueAnker, ...marker
      };
    }
  }

  if (vertrag) {
    const naechste = Number(existing && existing.ko_version) > 0 ? Number(existing.ko_version) + 1 : 2;
    const hash = verstehenVertragModul.eingabeHash({
      vorgangId, dokumente: vollCluster.documents, modus: "update", koVersion: naechste
    });
    reservierung = await vertrag.reserviere({ vorgangId, eingabeHash: hash });
    if (!reservierung.erlaubt) {
      const absage = await vertragsAbsage({
        reservierung, vorgangId, clusterDocs: [], spur, verknuepfe: null,
        dokumente: neueDocs.length,
        zusatz: { begruendung: "aktualisierung-vertagt", neueAnker, ...marker }
      });
      // Eine VERTAGUNG bleibt vorgemerkt (kein Fehlversuch) — sonst ginge die
      // Aktualisierung beim naechsten identischen Lauf als "duplicate" verloren.
      // `bereits-fertig` und `aufgegeben` sind KEINE Vertagung: dort ist die Arbeit
      // erledigt bzw. bewusst beendet.
      if (absage.status === "skipped-cluster-belegt") await merkeUpdateOffen(false);
      return absage;
    }
  }
  try {

  const budget = await deps.canSpend();
  if (!budget || !budget.allowed) {
    await merkeUpdateOffen(false);
    deps.logSkip("skipped-understanding-budget");
    return {
      vorgangId, status: "skipped-budget", reason: budget && budget.reason,
      documents: neueDocs.length, ...spur, begruendung: "aktualisierung-vertagt", neueAnker, ...marker
    };
  }

  // KONKURRENZWACHE — dieselbe Zusage wie beim Erstverstehen: derselbe Vorgang wird
  // nie von zwei Verarbeitern gleichzeitig bezahlt. Die neuen Dokumente sind zu
  // diesem Zeitpunkt bereits verknuepft (nicht verlierbar); nur die Neuformulierung
  // wartet — exakt die Semantik der bestehenden Budget-Vertagung.
  let clusterFreigabe = null;
  if (deps.clusterWache && typeof deps.clusterWache.belege === "function") {
    clusterFreigabe = await deps.clusterWache.belege(vorgangId);
    if (!clusterFreigabe || clusterFreigabe.erlaubt !== true) {
      await merkeUpdateOffen(false);
      return {
        vorgangId, status: "skipped-cluster-belegt", reason: (clusterFreigabe && clusterFreigabe.grund) || "vorgang-belegt",
        documents: neueDocs.length, ...spur, begruendung: "aktualisierung-vertagt", neueAnker, ...marker
      };
    }
  }
  try {

  // ── RESTZEITWACHE, ZWEITE PRUEFUNG — VOR dem Modellstart-Vermerk (§29) ─────────────
  // Wie im Erstverstehen (Vor-Modellstart-Reserve deckt den `modellstart`-RPC mit):
  // reicht die Zeit JETZT nicht mehr, wird nicht vermerkt und nicht aufgerufen; das
  // finally gibt die Reservierung regulaer frei (vor dem Modellstart sicher
  // wiederholbar), die Aktualisierung bleibt vorgemerkt.
  {
    const zeit = verstehenRestzeit.restzeitEntscheidung({
      deadlineMs: verstehensDeadlineMs,
      reserveMs: verstehenRestzeit.reserveVorModellstartMs()
    });
    if (!zeit.erlaubt) {
      await merkeUpdateOffen(false);
      return {
        vorgangId, status: "skipped-zeitbudget", reason: zeit.grund,
        restMs: zeit.restMs, reserveMs: zeit.reserveMs,
        documents: neueDocs.length, ...spur, begruendung: "aktualisierung-vertagt", neueAnker, ...marker
      };
    }
  }

  // MODELLSTART VERMERKEN (OP-30 CAS) — siehe understandOneCluster. Fail closed; bei
  // NICHT PRUEFBAREM Vermerk derselbe belegbar sichere Rueckweg (`freigabeOhneAufruf`,
  // Review-Korrektur §29): belegbar wurde nichts abgesendet, die Zeile wird wieder
  // `offen` statt ueber die Lease faelschlich in `unbekannt` zu laufen.
  if (vertrag && reservierung) {
    const start = await vertrag.modellstart({ vorgangId, fencing: reservierung.fencing });
    if (!start.erlaubt) {
      abgeschlossen = true;
      await merkeUpdateOffen(false);
      if (/^vertrag-nicht-pruefbar:/.test(String(start.grund || ""))) {
        const rueckweg = await Promise.resolve(vertrag.freigabeOhneAufruf({
          vorgangId, fencing: reservierung.fencing, grund: "modellstart-nicht-pruefbar"
        })).catch(() => ({ ok: false }));
        return {
          vorgangId, status: "skipped-modellstart-unklar",
          reason: start.grund, rueckwegOk: Boolean(rueckweg && rueckweg.ok),
          documents: neueDocs.length, ...spur, begruendung: "aktualisierung-vertagt", neueAnker, ...marker
        };
      }
      return {
        vorgangId, status: "skipped-cluster-belegt", reason: `modellstart-abgelehnt:${start.grund || "unbekannt"}`,
        documents: neueDocs.length, ...spur, begruendung: "aktualisierung-vertagt", neueAnker, ...marker
      };
    }
    // AB HIER kann ein bezahlter Modellaufruf stattgefunden haben.
    modellGestartet = true;
  }

  // ── RESTZEITWACHE, DRITTE PRUEFUNG — unmittelbar VOR dem externen KI-Aufruf (§29,
  // Review-Korrektur) — wie im Erstverstehen: reicht die Kernreserve nicht mehr, wird
  // belegbar NICHT abgesendet; das finally nimmt `freigabeOhneAufruf`, die
  // Aktualisierung bleibt vorgemerkt.
  {
    const zeit = verstehenRestzeit.restzeitEntscheidung({ deadlineMs: verstehensDeadlineMs });
    if (!zeit.erlaubt) {
      belegtOhneAufruf = true;
      await merkeUpdateOffen(false);
      return {
        vorgangId, status: "skipped-zeitbudget", reason: zeit.grund,
        restMs: zeit.restMs, reserveMs: zeit.reserveMs,
        documents: neueDocs.length, ...spur, begruendung: "aktualisierung-vertagt", neueAnker, ...marker
      };
    }
  }

  let aiResult;
  try {
    aiResult = await deps.requestUnderstanding(buildUnderstandingPrompt(vollCluster));
  } catch (error) {
    // Belegbar VOR dem Absenden gescheitert -> sicher wiederholbar (siehe
    // belegtNichtAbgesendet). Alles andere endet unten in `unbekannt`.
    if (belegtNichtAbgesendet(error)) {
      belegtOhneAufruf = true;
      if (error.code === "LLM_BUDGET_EXHAUSTED") {
        await merkeUpdateOffen(false);
        return {
          vorgangId, status: "skipped-budget", reason: error.reason || "daily-llm-budget-reached",
          documents: neueDocs.length, ...spur, begruendung: "aktualisierung-vertagt", neueAnker, ...marker
        };
      }
    }
    // KEIN markFailed: der bestehende Vorgang ist gesund und bleibt ausgeliefert.
    // Nur die Aktualisierung ist gescheitert — sie ist ueber die P29-3-Vormerkung
    // wiederauffindbar und wird beim naechsten identischen Lauf begrenzt wieder
    // aufgenommen (zusaetzlich zum Fall "erneut neue Dokumente treffen ein").
    await merkeUpdateOffen(true);
    const errorCode = error && error.message ? String(error.message).slice(0, 120) : "unknown";
    console.error("[understanding] update-error:", vorgangId, errorCode);
    deps.logSkip("skipped-understanding-error");
    unbekanntGrund = unbekanntGrund || `modellfehler:${errorCode}`.slice(0, 200);
    return { vorgangId, status: "skipped-error", errorCode, documents: neueDocs.length, ...spur, begruendung: "aktualisierung-fehlgeschlagen", ...marker, ...marke() };
  }

  // P29-2 (Update-Variante): ein nicht verwertbarer Rueckgabewert (null/kein
  // Objekt) darf den gesunden Bestand nicht anfassen (kein markFailed) — die
  // Aktualisierung gilt als gescheitert und bleibt ueber die Vormerkung
  // wiederaufnehmbar (P29-3).
  if (!aiResult || typeof aiResult !== "object" || Array.isArray(aiResult)) {
    await merkeUpdateOffen(true);
    deps.logSkip("skipped-understanding-invalid");
    unbekanntGrund = unbekanntGrund || "ki-antwort-nicht-verwertbar";
    return { vorgangId, status: "skipped-invalid", errors: ["ki-antwort-nicht-verwertbar"], documents: neueDocs.length, ...spur, begruendung: "aktualisierung-ungueltig", ...marker, ...marke() };
  }

  const naechsteVersion = Number(existing && existing.ko_version) > 0 ? Number(existing.ko_version) + 1 : 2;
  const ko = assembleKnowledgeObject(aiResult, vollCluster, vorgangId, {
    // SPRINT 19: der Bestand geht in die Assemblierung ein. Die bereits ermittelte
    // politische Ebene wird dadurch wiederverwendet und nicht neu berechnet.
    understanding_status: "complete", model, koVersion: naechsteVersion, bestand: existing || null
  });
  const best = pickBestSourceDoc(vollCluster.documents);
  if (best) {
    ko.best_source_url = best.url || best.canonical_url || null;
    ko.best_link_type = best.link_type || null;
    ko.source_trust = best.confidence || null;
  }
  const validation = validateKnowledgeObject(ko);
  if (!validation.valid) {
    // Der BESTAND bleibt unangetastet (kein markFailed, kein Ueberschreiben mit
    // einer ungueltigen Analyse). Die Dokumente haengen bereits am Vorgang.
    await merkeUpdateOffen(true);
    deps.logSkip("skipped-understanding-invalid");
    unbekanntGrund = unbekanntGrund || "validierung-fehlgeschlagen";
    return { vorgangId, status: "skipped-invalid", errors: validation.errors.slice(0, 5), documents: neueDocs.length, ...spur, begruendung: "aktualisierung-ungueltig", ...marker, ...marke() };
  }

  // SCHREIBRECHT (OP-30 CAS): gilt unser Lease noch? Ein verlorenes Lease darf den
  // BESTAND nicht anfassen — der gehoert jetzt einem neueren Lauf.
  if (vertrag && reservierung) {
    const recht = await vertrag.schreibrecht({ vorgangId, fencing: reservierung.fencing });
    if (!recht.erlaubt) {
      // KEIN `abgeschlossen` (siehe understandOneCluster): ein bloss abgelaufenes Lease
      // ohne Nachfolger gehoert nach `unbekannt`, nicht nach `offen`.
      unbekanntGrund = unbekanntGrund || `schreibrecht-verloren:${recht.grund || "lease-verloren"}`;
      return {
        vorgangId, status: "skipped-veraltet", reason: recht.grund || "lease-verloren",
        documents: neueDocs.length, ...spur, begruendung: "schreibrecht-verloren", neueAnker, ...marker, ...marke()
      };
    }
  }

  const persistenz = await persistiereVerstehensergebnis({ vertrag, reservierung, ko, deps });
  if (persistenz.veraltet) {
    // Die Datenbank hat abgewehrt: das neuere Ergebnis gilt. KEIN Fehlversuch — es ist
    // nichts gescheitert, die Arbeit war doppelt.
    unbekanntGrund = unbekanntGrund || `speichern-abgewehrt:${persistenz.grund || "veraltet"}`;
    return {
      vorgangId, status: "skipped-veraltet", reason: persistenz.grund || "fencing-abgewehrt",
      documents: neueDocs.length, ...spur, begruendung: "datenbank-hat-abgewehrt", neueAnker, ...marker, ...marke()
    };
  }
  if (persistenz.nichtPruefbar) {
    await merkeUpdateOffen(true);
    deps.logSkip("skipped-understanding-error");
    unbekanntGrund = unbekanntGrund || `speicherfehler:${persistenz.grund || "unbekannt"}`;
    return {
      vorgangId, status: "skipped-store", reason: persistenz.grund || "speichern-nicht-pruefbar",
      documents: neueDocs.length, ...spur, begruendung: "aktualisierung-nicht-pruefbar", neueAnker, ...marker, ...marke()
    };
  }
  if (persistenz.gespeichert) await loeseVormerkungAuf();
  else await merkeUpdateOffen(true);
  if (persistenz.abgeschlossen) abgeschlossen = true;
  return {
    vorgangId,
    status: persistenz.gespeichert ? "updated" : "skipped-store",
    id: ko.id,
    documents: neueDocs.length,
    koVersion: naechsteVersion,
    neueAnker,
    ...spur,
    ...marker
  };

  // Freigabe erst nach der Persistenz (siehe understandOneCluster).
  } finally {
    if (clusterFreigabe && deps.clusterWache && typeof deps.clusterWache.gebeFrei === "function") {
      await Promise.resolve(deps.clusterWache.gebeFrei(clusterFreigabe.slot)).catch(() => {});
    }
  }

  // Freigabe NUR vor dem Modellstart, sonst `unbekannt` (siehe understandOneCluster).
  } finally {
    if (vertrag && reservierung && !abgeschlossen) {
      if (ausgangUnbekannt()) {
        await Promise.resolve(vertrag.ausgangUnbekannt({
          vorgangId, fencing: reservierung.fencing,
          grund: unbekanntGrund || "aktualisierung-nach-modellstart-unbekannt"
        })).catch(() => {});
      } else if (modellGestartet) {
        await Promise.resolve(vertrag.freigabeOhneAufruf({
          vorgangId, fencing: reservierung.fencing, grund: "belegt-nicht-abgesendet"
        })).catch(() => {});
      } else {
        await Promise.resolve(vertrag.freigabe({
          vorgangId, fencing: reservierung.fencing, grund: "aktualisierung-vor-modellstart"
        })).catch(() => {});
      }
    }
  }
}

// --- Lauftelemetrie der Vorgangsbildung (Phase 7 des B4-Sprints) ------------
// ERWEITERT die vorhandene Telemetrie (processRuns), es entsteht KEIN zweites
// System. Bewusst nur Skalare, Kennungen und Klassen — kein Dokumenttext, keine
// KI-Ausgabe, keine personenbezogenen Daten (DSGVO-Datensparsamkeit, Audit R1).
//
// ERGEBNISGRUPPEN (jede Zeile eines Laufs faellt in genau eine):
//   verarbeitet     saved + updated      ein Vorgang ist entstanden/fortgeschrieben
//   zusammengefuehrt merged              Dokumente an einen bestehenden Vorgang gehaengt
//   duplikate       duplicate            echtes vollstaendiges Duplikat
//   ausgeschlossen  skipped-terminal     bewusst und dauerhaft aussortiert
//   fehlgeschlagen  skipped-error/-invalid/-failed/cluster-error
//   erneut          skipped-budget/-store/-cluster-belegt + zurueckgestellte Cluster
// PFLICHT: JEDE von understandOneCluster oder den beiden Lauf-Funktionen
// zurueckgegebene Ergebnisklasse steht hier. Fehlt eine, landet sie in der
// Gruppe "unbekannt" — und damit wieder in einem stillen Sammelzustand, gegen
// den dieser Ganze Umbau angetreten ist. `scripts/vorgangs-lebenszyklus-test.js`
// prueft diese Vollstaendigkeit strukturell gegen den Quelltext.
const ERGEBNISGRUPPEN = {
  saved: "verarbeitet",
  updated: "verarbeitet",
  merged: "zusammengefuehrt",
  duplicate: "duplikate",
  "skipped-terminal": "ausgeschlossen",
  "skipped-failed": "fehlgeschlagen",
  "skipped-error": "fehlgeschlagen",
  "skipped-invalid": "fehlgeschlagen",
  "cluster-error": "fehlgeschlagen",
  // P29-3: Wiederaufnahme-Deckel erschoepft — die Aktualisierung ist sichtbar
  // aufgegeben (kein weiterer KI-Call), der Bestand bleibt ausgeliefert.
  "skipped-update-final": "fehlgeschlagen",
  // Pending-Pfad: eine Vormerkung ohne auffindbare Quell-Dokumente ist kein
  // Fehler, sondern ein Rueckstand — sie muss erneut eingeplant werden.
  "skipped-no-cluster": "erneut",
  // Eine Vormerkung ohne Vorgangsbezug ist kaputte Datenlage: nicht wiederholbar,
  // aber sichtbar zu melden.
  "skipped-no-vorgang": "fehlgeschlagen",
  "skipped-budget": "erneut",
  "skipped-store": "erneut",
  // RESTZEITWACHE (§29): die Zeit bis zur absoluten Deadline reicht nicht mehr fuer
  // Modellantwort + Speicherung + Abschluss. Nichts wurde reserviert, bezahlt oder
  // gezaehlt — der Vorgang ist ein regulaerer Nachholkandidat wie bei "skipped-budget".
  "skipped-zeitbudget": "erneut",
  // §29 (Review-Korrektur): der Modellstart-VERMERK war nicht pruefbar (RPC-Timeout).
  // Belegbar wurde nichts abgesendet; die Zeile wurde per `freigabeOhneAufruf` sicher
  // wieder geoeffnet — regulaerer Nachholkandidat, kein Fehler, kein bezahlter Aufruf.
  "skipped-modellstart-unklar": "erneut",
  // OP-30-Zielarchitektur: ein anderer Verarbeiter haelt die Vorgangswache — der
  // Cluster ist nicht gescheitert, sondern gleich kostenlos als Bestand bedienbar.
  "skipped-cluster-belegt": "erneut",
  // OP-30 CAS: ein Modellaufruf ist abgestuerzt, bevor sein Ergebnis persistiert war.
  // Ob er stattgefunden hat und was er geliefert hat, weiss NIEMAND. Das ist ein
  // BEFUND, kein Rueckstand: eine automatische Wiederholung waere ein zweiter
  // bezahlter Aufruf. Der Vorgang bleibt sichtbar blockiert, bis er ausdruecklich
  // aufgeloest wird (helmut_verstehen_ausgang_aufloesen).
  "skipped-ausgang-unbekannt": "fehlgeschlagen",
  // OP-30 CAS: das eigene Ergebnis ist ueberholt — ein neuerer Besitzer hat den
  // Vorgang uebernommen. Nichts ist gescheitert und nichts ist zu wiederholen: die
  // Arbeit war schlicht doppelt. Deshalb "duplikate", nicht "fehlgeschlagen".
  "skipped-veraltet": "duplikate"
};

// Maximale Zahl namentlich protokollierter Auffaelligkeiten je Lauf. Der
// Auth-Store ist klein und haelt 300 Laeufe — eine unbegrenzte Liste wuerde ihn
// aufblaehen (Audit R1). Wird gekappt, steht die echte Zahl daneben.
const MAX_AUFFAELLIGKEITEN = 25;

// clusters ist optional: der Pending-Pfad arbeitet je Vorgang statt je Cluster und
// uebergibt stattdessen clusterCount. Ohne clusters wird die Dokumentzahl aus den
// Ergebniszeilen abgeleitet (ehrlich: das ist die Zahl der BEARBEITETEN Dokumente,
// nicht die des gesamten Eingangsstapels).
function buildOutcomeTelemetry({ clusters = null, clusterCount = null, results = [], deferred = 0, vorgemerkt = 0, priorityOn = false } = {}) {
  const clusterListe = Array.isArray(clusters) ? clusters : null;
  const anzahlCluster = clusterListe ? clusterListe.length : (Number(clusterCount) || results.length);
  const ergebnisse = {};
  const aufloesungen = {};
  const gruppen = { verarbeitet: 0, zusammengefuehrt: 0, duplikate: 0, ausgeschlossen: 0, fehlgeschlagen: 0, erneut: 0, unbekannt: 0 };
  let dokumenteMitEndzustand = 0;
  // Resolver-Bilanz (Hotfix B4-3): wie viele Bestandsvorgaenge wurden geprueft,
  // wie viele davon ABGELEHNT und aus welchem Grund. Ohne diese Zeilen bliebe die
  // wirksamste Schutzmassnahme des Systems unbelegt — man saehe nur, was
  // zusammengefuehrt wurde, nie was verhindert wurde.
  const ablehnungsgruende = {};
  let resolverGeprueft = 0;
  let resolverAbgelehnt = 0;

  for (const r of results) {
    const status = (r && r.status) || "unbekannt";
    ergebnisse[status] = (ergebnisse[status] || 0) + 1;
    const gruppe = ERGEBNISGRUPPEN[status] || "unbekannt";
    gruppen[gruppe] += 1;
    if (r && r.resolution) aufloesungen[r.resolution] = (aufloesungen[r.resolution] || 0) + 1;
    resolverGeprueft += Number(r && r.resolverGeprueft) || 0;
    resolverAbgelehnt += Number(r && r.resolverAbgelehnt) || 0;
    for (const grund of (r && r.resolverAblehnungsgruende) || []) {
      ablehnungsgruende[grund] = (ablehnungsgruende[grund] || 0) + 1;
    }
    // "Endzustand" = das Dokument haengt nachweisbar an einem Vorgang.
    if (gruppe !== "erneut" && gruppe !== "unbekannt") dokumenteMitEndzustand += Number(r && r.documents) || 0;
  }
  gruppen.erneut += deferred;

  const dokumenteGesamt = clusterListe
    ? clusterListe.reduce((n, c) => n + (((c && c.documents) || []).length), 0)
    : results.reduce((n, r) => n + (Number(r && r.documents) || 0), 0);
  const grossereignisse = clusterListe ? clusterListe.filter((c) => grossereignisSignale(c).grossereignis).length : null;

  // Auffaelligkeiten: genau die Faelle, die ein Betreiber sehen muss — technische
  // Kennungskonflikte, Fehlschlaege und Grossereignisse. Nur Kennungen, kein Text.
  const auffaellig = results
    .filter((r) => r && (r.resolution === "konflikt-neue-kennung" || ERGEBNISGRUPPEN[r.status] === "fehlgeschlagen"))
    .map((r) => ({ vorgangId: r.vorgangId || null, status: r.status, grund: r.begruendung || r.reason || r.errorCode || null }));

  return {
    cluster: anzahlCluster,
    dokumente: dokumenteGesamt,
    dokumenteMitEndzustand,
    dokumenteOhneEndzustand: Math.max(0, dokumenteGesamt - dokumenteMitEndzustand),
    ergebnisse,
    gruppen,
    aufloesungen,
    resolver: {
      geprueft: resolverGeprueft,
      abgelehnt: resolverAbgelehnt,
      ablehnungsgruende
    },
    zurueckgestellt: deferred,
    vorgemerkt,
    grossereignisse,
    priorisierungAktiv: Boolean(priorityOn),
    // Anteile je Ergebnis (auf ganze Promille gerundet, damit sie vergleichbar
    // bleiben und nie als exakte Prozentwahrheit missverstanden werden).
    anteile: Object.fromEntries(Object.entries(gruppen).map(([k, v]) =>
      [k, anzahlCluster ? Math.round((v / anzahlCluster) * 1000) / 10 : 0])),
    auffaelligkeiten: auffaellig.slice(0, MAX_AUFFAELLIGKEITEN),
    auffaelligkeitenGesamt: auffaellig.length
  };
}

// Schatten-Lauf ueber alle Cluster. Global gelockt; ohne Flag/KI/Lock -> No-Op.
// rawDocsOrItems: rohe rawItems ODER bereits minimierte raw_document-Zeilen.
async function runUnderstandingShadow(rawDocsOrItems = [], overrides = {}) {
  const deps = { ...defaultDeps({ runId: overrides.runId }), ...overrides };
  if (!deps.enabled()) return { skipped: true, reason: "v3-store-disabled" };
  if (!deps.aiEnabled()) return { skipped: true, reason: "ai-disabled" };
  if (!Array.isArray(rawDocsOrItems) || !rawDocsOrItems.length) return { skipped: true, reason: "no-input" };

  const lock = await deps.acquireLock();
  if (!lock || !lock.granted) return { skipped: true, reason: "understanding-locked" };
  try {
    // Nur minimierte raw_documents ins Understanding geben (DSGVO: kein Volltext).
    const rows = dedupeRawDocuments(rawDocsOrItems.map(toRawDocumentRow).filter((r) => r && r.id));
    const clusters = clusterRawDocuments(rows);
    // Understanding-Gate (VORBEREITET, Guard HELMUT_UNDERSTANDING_GATE): NUR wenn != 'off'.
    // Berechnet je Cluster die Gate-Entscheidung + protokolliert das Aggregat (Shadow) und
    // BLOCKIERT NICHTS — der bestehende Loop laeuft unveraendert. 'on' (echter Vorfilter) ist
    // bewusst NICHT scharf (nur Protokoll + Hinweis; Aktivierung erfordert separate Freigabe).
    // Fail-safe: ein Fehler hier darf den Understanding-Batch nie beeinflussen. Bei 'off' wird
    // dieser Block komplett uebersprungen -> byte-identisches Altverhalten.
    const gateMode = typeof deps.gateMode === "function" ? deps.gateMode() : "off";
    if (gateMode !== "off") {
      try {
        const perCluster = clusters.map((c) => ({
          vorgangId: deriveVorgangId(c),
          gate: understandingGate.assessCluster(c.documents || [], { now: Date.now() })
        }));
        const entscheidungen = perCluster.reduce((m, r) => { m[r.gate.decision] = (m[r.gate.decision] || 0) + 1; return m; }, {});
        deps.recordGateShadow({
          modus: gateMode, cluster: clusters.length, entscheidungen, blockiert: 0,
          hinweis: gateMode === "on" ? "on-noch-nicht-scharf-geschaltet-freigabepflichtig" : "shadow-nur-protokoll"
        });
        // Je-Dokument-Telemetrie in gate_shadow_events (nur Signale/IDs, kein Volltext/PII).
        // Eigener try/catch: auch ein Senken-Fehler (DB weg etc.) beeinflusst den Batch nie.
        if (typeof deps.recordGateShadowRows === "function") {
          const rows = perCluster.flatMap(({ vorgangId, gate }) => (gate.perDoc || []).map((d) => ({
            raw_document_id: d.id || null,
            source_id: d.source_id || null,
            tier: d.tier || null,
            gate_decision: d.decision,
            gate_reason: d.reason || null,
            political_signals: d.relevance || null,
            amtlich: d.tier === "amtlich" || d.structured === true,
            vorgang_id: vorgangId,
            model: null
          })));
          try {
            await Promise.resolve(deps.recordGateShadowRows(rows)).catch((e) => {
              try { console.error("[understanding-gate:shadow] Telemetrie-Write fehlgeschlagen (ignoriert):", e && e.message); } catch (_) { /* ignore */ }
            });
          } catch (e) {
            try { console.error("[understanding-gate:shadow] Telemetrie-Write fehlgeschlagen (ignoriert):", e && e.message); } catch (_) { /* ignore */ }
          }
        }
      } catch (e) { try { console.error("[understanding-gate:shadow] Fehler (ignoriert):", e && e.message); } catch (_) { /* ignore */ } }
    }
    const results = [];
    // Zeitbudget: der SERIELLE KI-Understanding-Loop (1 Call/Cluster, bis zu ~20s
    // je Call) darf den Cron/die Serverless-Funktion nicht über ihr Zeitlimit
    // treiben. Bei erschöpftem Budget stoppen; nicht-verstandene Cluster bleiben
    // (falls von C7c interessiert) als status='pending' und werden vom dedizierten
    // /api/cron/understanding-Lauf nachgeholt. deps.budgetMs=0/undefined = kein Limit.
    const budgetMs = Number(deps.budgetMs) > 0 ? Number(deps.budgetMs) : 0;
    // RESTZEITWACHE (§29): zusaetzlich zur relativen Dauer eine ABSOLUTE Deadline des
    // Aufrufers (Epoch-Millisekunden). Vor jedem Cluster wird geprueft, ob bis dahin
    // noch ein kompletter Modellaufruf + Speicherung + Abschluss passt — sonst stoppt
    // der Loop und der Rest wird regulaer vorgemerkt. 0/undefined = keine Deadline.
    const deadlineMs = Number(deps.deadlineMs) > 0 ? Number(deps.deadlineMs) : 0;
    const restzeitWeg = () => deadlineMs !== 0
      && !verstehenRestzeit.restzeitEntscheidung({
        deadlineMs, reserveMs: verstehenRestzeit.reserveVorModellstartMs()
      }).erlaubt;
    // P1-3 (scharf-schaltbar, DEFAULT AUS via HELMUT_UNDERSTANDING_PRIORITY):
    // Bei Budgetdeckel sollen die HÖCHSTPRIORISIERTEN Vorgänge zuerst verstanden
    // werden (amtlich > hohe Relevanz > Frist > Wichtigkeit > regional > Grenzfall),
    // nicht die zufällige Ankunftsreihenfolge (Audit R Priorität). Reine, KI-freie
    // Umsortierung über die Gate-Signale. Default aus -> byte-identische Reihenfolge.
    const priorityOn = typeof deps.priorityEnabled === "function" ? deps.priorityEnabled() : understandingPriorityEnabled();
    // GROSSEREIGNIS-VORFAHRT (Betriebsbefund B4) — wirkt AUCH ohne das Flag:
    // erkennt der Cluster ein moegliches politisches Grossereignis (Sicherheits-/
    // Opferbezug oder offizielle Reaktion, dazu mehrere unabhaengige Quellen oder
    // zeitliche Verdichtung), wird er vorgezogen. Ohne solchen Cluster bleibt die
    // Reihenfolge byte-identisch zur Ankunftsreihenfolge.
    const orderedClusters = priorityOn
      ? clustersInPriorityOrder(clusters, (c) => understandingGate.assessCluster(c.documents || [], { now: Date.now() }), Date.now())
      : grossereignisseZuerst(clusters);
    const startedAt = Date.now();
    let ran = 0;
    let abgebrochenBei = orderedClusters.length;
    // P29-3: Lauf-Cache der Update-Vormerkungen (einmal je Lauf lesen).
    const retriesCtx = { geladen: false, map: null };

    // ── VERSTEHENSPARALLELITAET (OP-30 CAS, Standard 1 = unveraendert seriell) ──────────
    // HARTER RIEGEL statt reiner Konfiguration: mehr als ein Cluster gleichzeitig ist NUR
    // mit dem atomaren Vertrag sicher. Ohne ihn schreibt der Karten-Store weiterhin
    // Lesen -> Aendern -> Schreiben, und `retriesCtx` waere ein von mehreren Clustern
    // gleichzeitig veraenderter Lauf-Cache — genau der verlorene Eintrag, gegen den
    // dieser Sprint angetreten ist. Ist der Vertrag nicht da, wird auf 1 GEKLEMMT.
    const vertragProbe = typeof deps.verstehenVertrag === "function" ? deps.verstehenVertrag() : null;
    const gewuenschteParallelitaet = Number(deps.verstehenParallelitaet) > 0
      ? Math.floor(Number(deps.verstehenParallelitaet))
      : verstehenVertragModul.verstehenParallelitaet();
    const parallelitaet = vertragProbe ? Math.max(1, gewuenschteParallelitaet) : 1;

    if (parallelitaet <= 1) {
      for (let i = 0; i < orderedClusters.length; i += 1) {
        if (budgetMs && Date.now() - startedAt > budgetMs) { abgebrochenBei = i; break; }
        if (restzeitWeg()) { abgebrochenBei = i; break; }
        ran += 1;
        // Fail-safe: ein einzelner geworfener Cluster darf den Batch nie abbrechen.
        try {
          results.push(await understandOneCluster(orderedClusters[i], deps, { retriesCtx })); // seriell: schont Budget/Rate-Limit
        } catch (error) {
          results.push({ status: "cluster-error", vorgangId: null });
        }
      }
    } else {
      // Begrenzter Arbeiterpool. Die Cluster werden weiterhin IN REIHENFOLGE begonnen
      // (Prioritaet bleibt wirksam) und die Ergebnisse in Startreihenfolge einsortiert —
      // nur die Ausfuehrung ueberlappt. `naechster` ist damit zugleich der erste NICHT
      // begonnene Index und exakt das, was `abgebrochenBei` bisher bedeutet hat.
      const ergebnisse = new Array(orderedClusters.length);
      let naechster = 0;
      const arbeiter = async () => {
        for (;;) {
          if (budgetMs && Date.now() - startedAt > budgetMs) return;
          if (restzeitWeg()) return;
          if (naechster >= orderedClusters.length) return;
          const i = naechster;
          naechster += 1;
          ran += 1;
          try {
            ergebnisse[i] = await understandOneCluster(orderedClusters[i], deps, { retriesCtx });
          } catch (error) {
            ergebnisse[i] = { status: "cluster-error", vorgangId: null };
          }
        }
      };
      await Promise.all(Array.from(
        { length: Math.min(parallelitaet, orderedClusters.length) }, () => arbeiter()));
      abgebrochenBei = Math.min(naechster, orderedClusters.length);
      for (let i = 0; i < abgebrochenBei; i += 1) {
        if (ergebnisse[i]) results.push(ergebnisse[i]);
      }
    }

    // ZURUECKGESTELLTE CLUSTER VERBINDLICH VORMERKEN (Mitursache 2 aus dem
    // CSD-2026-Befund: "zurueckgestellte Cluster kehren nie wieder"). Frueher
    // brach die Schleife ab und der Rest war ersatzlos weg — kein Vermerk, keine
    // Verknuepfung, keine Kennzahl. Jetzt bekommt jeder zurueckgestellte Cluster
    // einen vorgemerkten Vorgang UND seine Dokumentverknuepfungen. Dadurch ist er
    // (a) fuer den dedizierten Understanding-Lauf auffindbar und (b) als
    // "erneute Verarbeitung vorgesehen" vom Watchdog unterscheidbar.
    //
    // ZEITBUDGET (Betriebsbefund 2026-07-27): dieser Loop war der EINZIGE in der
    // Kette ohne Zeitgrenze — und der teuerste, weil er je Cluster zwei serielle
    // Supabase-Round-Trips macht (Vormerken + Verknuepfen). Gemessen in Production:
    // ~1,7 Cluster/s. Bei ~300 zurueckgestellten Clustern sind das ~176s, die auf
    // Crawl (~156s) + lazy (17s) + eager (90s) OBEN DRAUF kamen -> das 300s-
    // Funktionslimit war rechnerisch nicht einhaltbar, die Funktion starb mit 504,
    // und die Quellen-Telemetrie am Ende von runSourceCrawl wurde NIE geschrieben.
    // Jetzt begrenzt wie eager/lazy. Was nicht mehr passt, bleibt zurueckgestellt —
    // aber NICHT still: `nichtVorgemerkt` wird gezaehlt und in die Telemetrie
    // gehoben, damit der Rest sichtbar bleibt statt zu verschwinden.
    const zurueckgestellt = orderedClusters.slice(abgebrochenBei);
    // Zwei Formen, weil der Aufrufer beides braucht: `vormerkBudgetMs` = Dauer ab
    // Loop-Start (einfach, fuer Tests), `vormerkDeadlineMs` = absoluter Zeitpunkt
    // (fuer den Crawl, dessen Restzeit erst hier feststeht). Beide optional; 0/undefined
    // = kein Limit, damit Aufrufer ohne Zeitdruck (Nachhollauf) unveraendert bleiben.
    const vormerkBudgetMs = Number(deps.vormerkBudgetMs) > 0 ? Number(deps.vormerkBudgetMs) : 0;
    const vormerkDeadlineMs = Number(deps.vormerkDeadlineMs) > 0 ? Number(deps.vormerkDeadlineMs) : 0;
    const vormerkStart = Date.now();
    let vorgemerkt = 0;
    let bereitsVorhanden = 0;
    let vormerkFehlgeschlagen = 0;
    let nichtVorgemerkt = 0;
    // K4 (OP-25 E3): BULK-Vormerkung zuerst. Der serielle Pfad (2 Round-Trips je Cluster,
    // ~1,7 Cluster/s) hat die E3-Zusage bei grossem Rueckstand strukturell unerfuellbar
    // gemacht (Ursachenanalyse §7.7.6, Befund 5). Der Bulk-Pfad vormerkt den GESAMTEN
    // Rueckstand in wenigen Chunk-Anfragen; der serielle Pfad bleibt Rueckfallebene fuer
    // Aufrufer ohne Bulk-Faehigkeit (Tests, alte Deps) und fuer einen skipped-Bulk.
    let seriellNoetig = zurueckgestellt.length > 0;
    if (zurueckgestellt.length && typeof deps.savePendingBulk === "function") {
      const budgetWeg = vormerkBudgetMs && Date.now() - vormerkStart > vormerkBudgetMs;
      const deadlineWeg = vormerkDeadlineMs && Date.now() > vormerkDeadlineMs;
      if (budgetWeg || deadlineWeg) {
        // Deadline VOR Beginn verstrichen (abnormal — der Aufrufer reserviert seit K4/K8
        // eine eigene Abschlusszeit): ehrlich zaehlen, nichts behaupten.
        nichtVorgemerkt = zurueckgestellt.length;
        seriellNoetig = false;
      } else {
        let bulk = null;
        try {
          bulk = await deps.savePendingBulk(zurueckgestellt.map((cluster) => {
            const docs = (cluster && cluster.documents) || [];
            return {
              vorgangId: deriveVorgangId(cluster),
              headline: (docs[0] && docs[0].title) || "",
              source_document_count: docs.length,
              dokumente: docs
            };
            // Die Deadline gilt auch zwischen den Chunks des Bulks (degradierte DB).
          }), { deadlineMs: vormerkDeadlineMs || 0 });
        } catch (e) {
          try { console.error("[understanding] Bulk-Vormerkung fehlgeschlagen:", e && e.message); } catch (_) { /* ignore */ }
        }
        if (bulk && !bulk.skipped) {
          // Bilanz des Bulk-Pfads: neu + bereits vorhanden = dauerhaft; ein Speicherfehler
          // zaehlt AUSDRUECKLICH nicht als Vormerkung (CLAUDE.md §4.10, kein falsches
          // Gruen); an der Deadline nicht mehr Versuchtes bleibt `nichtVorgemerkt`.
          bereitsVorhanden = Number(bulk.bereitsVorhanden) || 0;
          vorgemerkt = (Number(bulk.vorgemerkt) || 0) + bereitsVorhanden;
          vormerkFehlgeschlagen = Number(bulk.fehlgeschlagen) || 0;
          nichtVorgemerkt = Math.max(0, zurueckgestellt.length - vorgemerkt - vormerkFehlgeschlagen);
          seriellNoetig = false;
        }
      }
    }
    if (seriellNoetig) {
      for (const [idx, cluster] of zurueckgestellt.entries()) {
        const budgetWeg = vormerkBudgetMs && Date.now() - vormerkStart > vormerkBudgetMs;
        const deadlineWeg = vormerkDeadlineMs && Date.now() > vormerkDeadlineMs;
        if (budgetWeg || deadlineWeg) {
          nichtVorgemerkt = zurueckgestellt.length - idx;
          break;
        }
        try {
          const vorgangId = deriveVorgangId(cluster);
          const docs = (cluster && cluster.documents) || [];
          if (typeof deps.savePending !== "function") continue;
          const vermerk = await deps.savePending(vorgangId, {
            headline: (docs[0] && docs[0].title) || "",
            source_document_count: docs.length
          });
          // Nur verknuepfen, wenn der Vorgang wirklich existiert (neu angelegt ODER
          // bereits vorhanden). Sonst entstuenden Verweise auf ein Knowledge Object,
          // das es nicht gibt — und ein Dokument saehe faelschlich verarbeitet aus.
          const vorhanden = vermerk && (vermerk.saved === true || vermerk.reason === "exists");
          if (!vorhanden) {
            // K4: eine nicht zustande gekommene Vormerkung ist ein GEZAEHLTER Fehlschlag —
            // frueher ging sie stumm verloren (weder vorgemerkt noch nichtVorgemerkt).
            vormerkFehlgeschlagen += 1;
            continue;
          }
          if (vermerk.reason === "exists") bereitsVorhanden += 1;
          vorgemerkt += 1;
          if (typeof deps.saveSources === "function" && docs.length) {
            await deps.saveSources(vermerk.id || `ko-${vorgangId}`, docs);
          }
        } catch (e) {
          vormerkFehlgeschlagen += 1;
          try { console.error("[understanding] Vormerkung eines zurueckgestellten Clusters fehlgeschlagen:", e && e.message); } catch (_) { /* ignore */ }
        }
      }
    }

    const deferred = clusters.length - ran;
    const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
    if (nichtVorgemerkt > 0 || vormerkFehlgeschlagen > 0) {
      try {
        console.log(`[understanding] Vormerkluecke: ${vorgemerkt} vorgemerkt, ${nichtVorgemerkt} nicht erreicht,`
          + ` ${vormerkFehlgeschlagen} fehlgeschlagen — bleiben unvorgemerkt zurueckgestellt`);
      } catch (_) { /* ignore */ }
    }
    return {
      clusters: clusters.length, processed: ran, deferred, vorgemerkt, bereitsVorhanden,
      vormerkFehlgeschlagen, nichtVorgemerkt, counts, results,
      telemetrie: buildOutcomeTelemetry({ clusters, results, deferred, vorgemerkt, priorityOn })
    };
  } finally {
    await deps.releaseLock();
  }
}

// --- C8-Entry: die von C7c vorgemerkten (status='pending') Vorgaenge verstehen ---
// Holt die pending-KOs, clustert die (minimierten, DSGVO-sparsamen) Rohdokumente
// und verbindet jeden pending-Vorgang mit SEINEM Cluster (ueber die stabile
// vorgang_id). Nur Vorgaenge MIT vorhandenen Quell-Dokumenten werden verstanden —
// ohne Quellen KEIN KI-Call (Kosten + Qualitaet). Global gelockt; ohne Flag/KI/
// Lock/Pending -> No-Op. rawDocsOrItems: rohe rawItems ODER minimierte raw_document-Zeilen.
async function runPendingUnderstandingShadow(rawDocsOrItems = [], overrides = {}) {
  const deps = { ...defaultDeps({ runId: overrides.runId }), ...overrides };
  if (!deps.enabled()) return { skipped: true, reason: "v3-store-disabled" };
  if (!deps.aiEnabled()) return { skipped: true, reason: "ai-disabled" };

  const pending = (await deps.listPending()) || [];
  if (!Array.isArray(pending) || !pending.length) return { skipped: true, reason: "no-pending" };

  const lock = await deps.acquireLock();
  if (!lock || !lock.granted) return { skipped: true, reason: "understanding-locked" };
  try {
    const rows = dedupeRawDocuments((rawDocsOrItems || []).map(toRawDocumentRow).filter((r) => r && r.id));
    const clusters = clusterRawDocuments(rows);
    const byVorgang = new Map(clusters.map((c) => [deriveVorgangId(c), c]));
    // NACHHOLPFAD-REPARATUR (Betriebsbefund B4): frueher wurde der Cluster eines
    // vorgemerkten Vorgangs ausschliesslich ueber die Kennung aus einer FRISCHEN
    // Clusterung der letzten 30 Tage gesucht. Diese Clusterung sieht eine voellig
    // andere Dokumentmenge als der Lauf, der den Vorgang vorgemerkt hat — die
    // Kennungen trafen sich praktisch nie. Messbare Folge in Production: drei
    // Laeufe, 0 verarbeitete Cluster, 43 seit Wochen haengende Vormerkungen.
    //
    // Massgeblich ist jetzt die VERKNUEPFUNG: die Dokumente, die beim Vormerken an
    // den Vorgang gebunden wurden. Die Kennungssuche bleibt als Rueckfallebene fuer
    // Alt-Vormerkungen ohne Verknuepfung erhalten.
    const clusterFuerVorgang = async (ko) => {
      if (typeof deps.listVorgangDocuments === "function") {
        try {
          const docs = await deps.listVorgangDocuments(ko.id);
          if (Array.isArray(docs) && docs.length) {
            return { cluster: { documents: docs, anchors: [] }, herkunft: "verknuepfung" };
          }
        } catch (e) { try { console.error("[understanding] listVorgangDocuments fehlgeschlagen:", e && e.message); } catch (_) { /* ignore */ } }
      }
      const ueberKennung = byVorgang.get(ko.vorgang_id);
      if (ueberKennung) return { cluster: ueberKennung, herkunft: "kennung" };
      return { cluster: null, herkunft: "keine" };
    };
    const results = [];
    // Zeitbudget wie im eager-Pfad: bei Erschöpfung stoppen; noch nicht verstandene
    // pending-KOs bleiben pending und werden im nächsten Lauf nachgeholt (idempotent).
    const budgetMs = Number(deps.budgetMs) > 0 ? Number(deps.budgetMs) : 0;
    // RESTZEITWACHE (§29): absolute Deadline des Aufrufers — wie in understandClusters.
    const deadlineMs = Number(deps.deadlineMs) > 0 ? Number(deps.deadlineMs) : 0;
    const restzeitWeg = () => deadlineMs !== 0
      && !verstehenRestzeit.restzeitEntscheidung({
        deadlineMs, reserveMs: verstehenRestzeit.reserveVorModellstartMs()
      }).erlaubt;
    const startedAt = Date.now();
    let deferred = 0;
    let budgetHit = false;
    // P29-3: Lauf-Cache der Update-Vormerkungen (einmal je Lauf lesen).
    const retriesCtx = { geladen: false, map: null };
    for (const ko of pending) {
      if (budgetHit) { deferred += 1; continue; }
      if (budgetMs && Date.now() - startedAt > budgetMs) { budgetHit = true; deferred += 1; continue; }
      if (restzeitWeg()) { budgetHit = true; deferred += 1; continue; }
      if (!ko || !ko.vorgang_id) { results.push({ status: "skipped-no-vorgang" }); continue; }
      const { cluster, herkunft } = await clusterFuerVorgang(ko);
      if (!cluster || !(cluster.documents || []).length) {
        // Keine Quell-Dokumente fuer diesen Vorgang auffindbar -> KEIN KI-Call.
        // Das ist ein ECHTER Befund (Vormerkung ohne Beleg), kein stiller Skip:
        // der Watchdog meldet solche Vorgaenge als offenen Rueckstand.
        results.push({ vorgangId: ko.vorgang_id, status: "skipped-no-cluster", begruendung: "keine-verknuepften-dokumente" });
        continue;
      }
      // Fail-safe: ein einzelner geworfener Vorgang darf den Batch nie abbrechen.
      try {
        const r = await understandOneCluster(cluster, deps, { vorgangId: ko.vorgang_id, existing: ko, retriesCtx });
        results.push({ ...r, clusterHerkunft: herkunft });
      } catch (error) {
        results.push({ vorgangId: ko.vorgang_id, status: "cluster-error" });
      }
    }
    const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
    const herkunftZaehler = results.reduce((acc, r) => {
      if (r && r.clusterHerkunft) acc[r.clusterHerkunft] = (acc[r.clusterHerkunft] || 0) + 1;
      return acc;
    }, {});
    return {
      pending: pending.length, deferred, counts, results,
      clusterHerkunft: herkunftZaehler,
      telemetrie: buildOutcomeTelemetry({ clusterCount: pending.length, results, deferred })
    };
  } finally {
    await deps.releaseLock();
  }
}

// --- Goldset-Evaluation (Qualitaetssicherung, KEIN Netzwerk noetig) ----------
// Fuehrt EINEN Goldset-Fall durch die echte C8-Pipeline (Clustering -> Prompt ->
// Assemble -> Validierung). requestUnderstanding(prompt, caseObj) liefert die
// (echte oder simulierte) KI-Antwort. Prueft: Prompt traegt die DSGVO-Regeln und
// echte Quellen, das assemblierte KO ist schema-valide und DSGVO-sauber.
async function evaluateUnderstandingCase(caseObj = {}, requestUnderstanding) {
  const name = caseObj.name || "(unbenannt)";
  const docs = Array.isArray(caseObj.raw_documents) ? caseObj.raw_documents : [];
  const clusters = clusterRawDocuments(docs);
  // Alle Rohdoks eines Falls gehoeren zum selben Vorgang -> groesstes Cluster nehmen.
  const cluster = clusters.sort((a, b) => (b.documents || []).length - (a.documents || []).length)[0] || { documents: docs };
  const vorgangId = deriveVorgangId(cluster);
  const prompt = buildUnderstandingPrompt(cluster);
  const promptOk = /oeffentlich handelnde politische Akteure/i.test(prompt)
    && /mentioned_people/.test(prompt)
    && (cluster.documents || []).length > 0;

  let aiResult;
  try {
    aiResult = await requestUnderstanding(prompt, caseObj);
  } catch (error) {
    return { name, valid: false, vorgangId, promptOk, errors: ["ki-fehler: " + String(error && error.message).slice(0, 120)] };
  }
  const ko = assembleKnowledgeObject(aiResult, cluster, vorgangId, { understanding_status: "complete" });
  const validation = validateKnowledgeObject(ko);
  return { name, valid: validation.valid && promptOk, vorgangId, promptOk, errors: validation.errors.slice(0, 5), ko };
}

// Fuehrt das gesamte Goldset durch die C8-Pipeline. requestUnderstanding ist
// injizierbar: im Test die (perfekte) erwartete Analyse ODER eine bewusst schlechte
// Antwort; produktiv der echte KI-Call. Rueckgabe: Aggregat + Fehlerliste.
async function evaluateUnderstandingGoldset(goldset = {}, requestUnderstanding) {
  const cases = Array.isArray(goldset.cases) ? goldset.cases : [];
  const results = [];
  for (const c of cases) results.push(await evaluateUnderstandingCase(c, requestUnderstanding)); // seriell: schont Budget/Rate-Limit
  const valid = results.filter((r) => r.valid).length;
  return { total: results.length, valid, failures: results.filter((r) => !r.valid), results };
}

// --- Read-only-Diagnose: WARUM finden pending-Vorgaenge keine Quell-Dokumente? --
// Rein deterministisch. KEINE KI, KEINE Writes, KEIN Netz (der Aufrufer liefert die
// bereits gelesenen Rohdokumente/pending-KOs). Nutzt EXAKT dieselbe Cluster- und
// vorgang_id-Ableitung wie runPendingUnderstandingShadow, damit die Diagnose die
// reale Zuordnung trifft (sonst wuerde sie taeuschen). Klassifiziert jedes pending-KO:
//   im-fenster       = ein Cluster mit passender vorgang_id existiert im Recovery-Fenster
//   ausserhalb       = nur im weiteren (bounded) Read gefunden -> Rohdoks liegen ausserhalb
//   keine-rohdokumente = in beiden nicht gefunden (verwaist / geloescht / Mapping-Drift)
function diagnosePendingUnderstanding(pending = [], windowRawDocs = [], widerRawDocs = [], opts = {}) {
  const now = Number(opts.now) > 0 ? Number(opts.now) : Date.now();
  const windowDays = Number(opts.windowDays) || 90;
  const DAY = 86400000;

  const buildIndex = (docs) => {
    const rows = dedupeRawDocuments((docs || []).map(toRawDocumentRow).filter((r) => r && r.id));
    const clusters = clusterRawDocuments(rows);
    const map = new Map();
    for (const c of clusters) { const vid = deriveVorgangId(c); if (!map.has(vid)) map.set(vid, c); }
    return map;
  };
  const windowMap = buildIndex(windowRawDocs);
  const widerMap = buildIndex(widerRawDocs);

  const docAgeDays = (d) => {
    const t = Date.parse((d && (d.published_at || d.created_at)) || "") || 0;
    return t > 0 ? Math.floor((now - t) / DAY) : null;
  };
  const clusterNewestAgeDays = (cluster) => {
    const ages = (cluster && cluster.documents || []).map(docAgeDays).filter((n) => n != null);
    return ages.length ? Math.min(...ages) : null; // juengstes Dokument = kleinstes Alter
  };
  const koAgeDays = (ko) => {
    const t = Date.parse((ko && (ko.created_at || ko.updated_at)) || "") || 0;
    return t > 0 ? Math.floor((now - t) / DAY) : null;
  };

  let mitCluster = 0, ohneCluster = 0, imFenster = 0, ausserhalb = 0, keine = 0, ohneQuellzahl = 0;
  let pendingAeltester = null, pendingNeuester = null;
  const beispiele = [];
  const kandidaten = []; // verarbeitbare (im-fenster) pending-Vorgaenge, mit Cluster-Metadaten (kein Rohtext)
  for (const ko of (pending || [])) {
    const vid = ko && ko.vorgang_id;
    const inWindow = vid ? windowMap.get(vid) : null;
    const inWider = vid ? widerMap.get(vid) : null;
    if (inWindow || inWider) mitCluster += 1; else ohneCluster += 1;
    if (!Number(ko && ko.source_document_count)) ohneQuellzahl += 1;

    let grund, rohAlter = null;
    if (inWindow) { imFenster += 1; grund = "im-fenster"; rohAlter = clusterNewestAgeDays(inWindow); }
    else if (inWider) { ausserhalb += 1; grund = "ausserhalb-fenster"; rohAlter = clusterNewestAgeDays(inWider); }
    else { keine += 1; grund = "keine-rohdokumente"; }

    const alter = koAgeDays(ko);
    if (alter != null) {
      pendingAeltester = pendingAeltester == null ? alter : Math.max(pendingAeltester, alter);
      pendingNeuester = pendingNeuester == null ? alter : Math.min(pendingNeuester, alter);
    }
    // Verarbeitbarer Kandidat: Cluster im aktuellen Fenster. Nur skalare Metadaten, kein Rohtext.
    if (inWindow && kandidaten.length < 5) {
      kandidaten.push({
        vorgangId: String(vid || "").slice(0, 40),
        titelKurz: String((ko && (ko.headline || ko.display_title)) || "").slice(0, 80),
        status: String((ko && ko.understanding_status) || (ko && ko.status) || ""),
        clusterDokumente: (inWindow.documents || []).length,
        alterTage: alter,
        quellDokAnzahl: Number(ko && ko.source_document_count) || 0,
        rohdokumentAlterTage: rohAlter
      });
    }
    if (beispiele.length < 10) {
      beispiele.push({
        vorgangId: String(vid || "").slice(0, 40),
        titelKurz: String((ko && (ko.headline || ko.display_title)) || "").slice(0, 80),
        status: String((ko && ko.understanding_status) || (ko && ko.status) || ""),
        alterTage: alter,
        quellDokAnzahl: Number(ko && ko.source_document_count) || 0,
        clusterVorhanden: Boolean(inWindow || inWider),
        rohdokumentGefunden: Boolean(inWindow || inWider),
        rohdokumentAlterTage: rohAlter,
        grund
      });
    }
  }

  const allDocAges = [...(widerRawDocs || []), ...(windowRawDocs || [])].map(docAgeDays).filter((n) => n != null);
  const rohdokAeltester = allDocAges.length ? Math.max(...allDocAges) : null;
  const rohdokNeuester = allDocAges.length ? Math.min(...allDocAges) : null;

  const gesamt = (pending || []).length;
  const weitVorhanden = (widerRawDocs || []).length > 0;
  let ursache, empfehlung;
  if (!gesamt) {
    ursache = "keine-pending"; empfehlung = "Nichts zu tun – keine pending-Vorgänge.";
  } else if (imFenster === gesamt) {
    ursache = "verarbeitbar"; empfehlung = "Understanding-Lauf sollte diese verarbeiten (ohne aktiven Lock).";
  } else if (keine === gesamt) {
    // Kein Cluster für IRGENDEINEN pending-Vorgang: gibt es überhaupt Rohdokumente im Store?
    if (weitVorhanden) { ursache = "mapping-fehlt"; empfehlung = "Rohdokumente existieren, aber keiner passt zu den pending-vorgang_ids – Mapping/Clustering-Drift (nur Diagnose, kein Auto-Fix)."; }
    else { ursache = "verwaist"; empfehlung = "Keine Rohdokumente im Store gefunden – mögliche V2/Seed-Reste oder Retention (nur Diagnose, kein Auto-Fix)."; }
  } else if (ausserhalb === gesamt) {
    ursache = "ausserhalb-fenster"; empfehlung = "Rohdokumente liegen außerhalb des Recovery-Fensters – bewusste Entscheidung nötig (kein Auto-Fix).";
  } else if (imFenster > 0 && ausserhalb === 0 && keine > 0) {
    // Praezise: ein Teil verarbeitbar, der Rest ohne Rohdokumente – NICHT 'außerhalb' nennen (das ist 0).
    ursache = "teils-verarbeitbar-verwaist";
    empfehlung = "Understanding-Lauf erneut starten, um die verarbeitbaren Vorgänge zu prüfen. Danach verwaiste pending-Vorgänge separat bewerten.";
  } else {
    ursache = "gemischt"; empfehlung = "Gemischt – siehe Aufschlüsselung oben (im Fenster / außerhalb / keine). Kein Auto-Fix.";
  }

  return {
    gesamt, mitCluster, ohneCluster, imFenster, ausserhalb, keine, ohneQuellzahl,
    pendingAeltesterTage: pendingAeltester, pendingNeuesterTage: pendingNeuester,
    rohdokAeltesterTage: rohdokAeltester, rohdokNeuesterTage: rohdokNeuester,
    windowDays, ursache, empfehlung, beispiele, kandidaten
  };
}

module.exports = {
  clusterRawDocuments,
  deriveVorgangId,
  resolveVorgang,
  understandUpdate,
  buildOutcomeTelemetry,
  ERGEBNISGRUPPEN,
  diagnosePendingUnderstanding,
  buildUnderstandingPrompt,
  assembleKnowledgeObject,
  isValidDisplayTitle,       // Qualitaetsgate fuer den Anzeige-Titel (Tests/Wiederverwendung)
  runUnderstandingShadow,
  runPendingUnderstandingShadow,
  understandOneCluster,
  evaluateUnderstandingCase,
  evaluateUnderstandingGoldset,
  defaultDeps
};
