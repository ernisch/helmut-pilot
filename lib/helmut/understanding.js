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

// --- Deterministisches Vorgangs-Clustering (keine KI) -----------------------
// Anker = lange Titel-/Kontext-Tokens (>=8 Zeichen). Deutsche Themenwoerter sind
// typischerweise lange Komposita ("Rentenpaket", "Tariftreuegesetz"). Zwei Dokumente
// gehoeren zum selben Vorgang, wenn sie einen Anker teilen (inkl. Komposit-Enthalten:
// "Bundestariftreuegesetz" ~ "Tariftreuegesetz").
function anchorTokens(text) {
  return [...new Set(
    String(text || "").toLowerCase().replace(/[^a-z0-9äöüß]+/gi, " ").split(/\s+/).filter((t) => t.length >= 8)
  )];
}

function anchorsMatch(a, b) {
  return a === b || a.includes(b) || b.includes(a);
}

function docsShareAnchor(aList, bList) {
  return aList.some((a) => bList.some((b) => anchorsMatch(a, b)));
}

function clusterRawDocuments(rawDocuments = []) {
  const clusters = [];
  for (const doc of rawDocuments) {
    if (!doc) continue;
    const anchors = anchorTokens(`${doc.title || ""} ${doc.summary || ""}`);
    const target = clusters.find((c) => anchors.length && docsShareAnchor(anchors, c.anchors));
    if (target) {
      target.documents.push(doc);
      target.anchors = [...new Set([...target.anchors, ...anchors])];
    } else {
      clusters.push({ documents: [doc], anchors });
    }
  }
  return clusters.map((c) => ({ documents: c.documents, anchors: c.anchors }));
}

function slug(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9äöüß]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

// Stabile vorgang_id: der TOPIC-Anker = die Anker-Wurzel mit der hoechsten
// Dokument-Frequenz im Cluster (das gemeinsame Thema, nicht ein Verb wie
// "vorgelegt"). Komposita werden auf ihre Wurzel normalisiert (Bundestariftreue-
// gesetz -> tariftreuegesetz). Tie-Break: laengere Wurzel, dann alphabetisch.
function deriveVorgangId(cluster = {}) {
  const docs = cluster.documents || [];
  const perDoc = docs.map((d) => anchorTokens(`${d.title || ""} ${d.summary || ""}`));
  const allAnchors = [...new Set(perDoc.flat())];
  if (!allAnchors.length) {
    const first = docs[0] || {};
    const key = first.content_hash || first.id || first.title || "unbekannt";
    return `vg-${slug(String(key)).slice(0, 24)}`;
  }
  const rootOf = (anchor) => {
    let root = anchor;
    for (const other of allAnchors) if (anchorsMatch(anchor, other) && other.length < root.length) root = other;
    return root;
  };
  const roots = [...new Set(allAnchors.map(rootOf))];
  const docFreq = (root) => perDoc.filter((anchors) => anchors.some((a) => anchorsMatch(a, root))).length;
  const best = roots
    .map((root) => ({ root, df: docFreq(root) }))
    .sort((x, y) => (y.df - x.df) || (y.root.length - x.root.length) || (x.root < y.root ? -1 : 1))[0];
  return `vg-${slug(best.root)}`;
}

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
function buildUnderstandingPrompt(cluster = {}, opts = {}) {
  const docs = (cluster.documents || []).slice(0, 12).map((d, i) =>
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
    "  (c) woertliche Zitate oder Zitat-Doppelpunkte wie 'Bovenschulte: ...'; (d) Quellennamen;",
    "  (e) Doppelpunkt-Ketten; (f) Ellipse/'...'; (g) journalistische oder Clickbait-Sprache.",
    "  Der Titel wirkt sachlich-neutral wie ein amtlicher Vorgangstitel, NICHT wie eine",
    "  Zeitungsueberschrift. Hoechstens ~9 Woerter / ~60 Zeichen, vollstaendiger Gedanke, ende NIE",
    "  auf einem Funktionswort (z. B. zur/zum/fuer/von/mit/durch/und/oder/gegenueber/wegen).",
    "  Vorher (abgeschnittener Nachrichtensatz)  ->  Nachher (politischer Vorgangstitel):",
    "  'Friedrich Merz hat oeffentlich eine scharfe Ablehnung gegenueber Vergesellschaftung...'",
    "     ->  'Merz lehnt Vergesellschaftungen ab'  /  'Merz positioniert sich gegen Vergesellschaftung'",
    "  'Im Voelklinger Stadtrat besteht Ratlosigkeit und dringender Handlungsbedarf...'",
    "     ->  'Kommunale Sportinfrastruktur geraet unter Druck'  /  'Voelklingen sucht Loesung fuer Sportinfrastruktur'",
    "  'Bovenschulte: Ein starkes, soziales und einiges Europa wichtiger denn je'",
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
    ko_version: 1,
    status: "neu",
    understanding_status: opts.understanding_status || "complete",
    source_document_count: (cluster.documents || []).length,
    confidence_score: clampInt(aiResult.confidence_score, 0, 100, 60)
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
  try {
    const cls = classifyKnowledgeObject(ko, aiResult);
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
function defaultDeps() {
  const storage = require("./storage");
  const ai = require("./ai");
  return {
    enabled: () => storage.v3StoreEnabled(),
    aiEnabled: () => ai.isAiEnabled(),
    acquireLock: () => storage.acquireGlobalUnderstandingLock(),
    releaseLock: () => storage.releaseGlobalUnderstandingLock(),
    getExisting: (vorgangId) => storage.getKnowledgeObjectByVorgang(vorgangId),
    // C8: die von C7c vorgemerkten (status='pending') Vorgaenge holen.
    listPending: (limit) => storage.listPendingKnowledgeObjects({ limit }),
    canSpend: () => storage.canSpendLlm(null), // GLOBAL: null, niemals pro Nutzer
    requestUnderstanding: (prompt) =>
      // pipelineStep explizit (der Kostenlog gruppiert Calls nach Pipeline-Schritt);
      // politicianId bleibt null (globaler, mandantenloser Understanding-Call).
      ai.requestStructuredJson(prompt, KNOWLEDGE_OBJECT_SCHEMA, { callType: "understanding", pipelineStep: "understanding", politicianId: null }, ai.understandingModelName()),
    save: (ko) => storage.saveKnowledgeObject(ko),
    // Provenienz: die Quell-Dokumente des Clusters mit dem KO verknuepfen (C6/C7),
    // damit echte Quellen, Chronologie und Dokumente pro Vorgang abrufbar sind.
    saveSources: (koId, docs) => storage.saveKoDocumentLinks(koId, docs),
    // C8: Vorgang als KI-Fehlschlag parken (status bleibt 'pending' -> nie gematcht).
    markFailed: (vorgangId, meta) => storage.markUnderstandingFailed(vorgangId, meta),
    // Modellname NUR fuer das Metadatenfeld understanding_model (kein Inhalt).
    modelName: () => ai.understandingModelName(),
    // Skip-Log OHNE Prompt-/Antwortinhalt (nur callType/Modell) — DSGVO + Kostenlog-Regel.
    logSkip: (callType) => {
      try { storage.recordLlmUsage({ callType, model: "none", politicianId: null, success: false }); }
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

// Versteht EINEN Vorgang (Cluster) global per KI. opts erlaubt dem C8-Pending-Pfad,
// vorgang_id + das bereits geladene KO durchzureichen (kein erneutes Fetch/Ableiten).
// Zustandslogik (status = Analyse-Klasse, understanding_status = Lifecycle):
//   - existiert ein VERSTANDENES KO (status != 'pending') -> skipped-exists (einmal pro Vorgang)
//   - existiert ein GEPARKTES KO (understanding_status='failed') -> skipped-failed (kein Retry)
//   - existiert ein PENDING KO -> vervollstaendigen (KI-Call, complete/failed)
//   - kein KO -> direkt verstehen (eager Pfad; bei Fehler NUR loggen, kein Karteileichen-KO)
async function understandOneCluster(cluster, deps, opts = {}) {
  const vorgangId = opts.vorgangId || deriveVorgangId(cluster);
  const existing = opts.existing !== undefined ? opts.existing : await deps.getExisting(vorgangId);
  if (existing) {
    // Alles ausser einem echten 'pending'-KO gilt als bereits verstanden -> nicht erneut.
    if (existing.status !== "pending") return { vorgangId, status: "skipped-exists" };
    if (existing.understanding_status === "failed") return { vorgangId, status: "skipped-failed" };
  }
  const model = typeof deps.modelName === "function" ? deps.modelName() : null;
  const headline = (cluster.documents && cluster.documents[0] && cluster.documents[0].title) || cluster.headline || "";
  const failMeta = { headline, understanding_model: model };
  // Fehlschlag IMMER parken (status bleibt 'pending', understanding_status='failed'):
  // verhindert Endlos-Retry — auch fuer neu entdeckte Vorgaenge im eager-Pfad. Der
  // Vorgang wird nie ausgeliefert/gematcht; ein Operator kann understanding_status
  // zuruecksetzen, um erneut zu versuchen. Selbst fail-safe (schluckt Storage-Fehler).
  const markFailed = async () => {
    if (typeof deps.markFailed !== "function") return;
    try { await deps.markFailed(vorgangId, failMeta); }
    catch (e) { try { console.error("[understanding] markFailed fehlgeschlagen:", e && e.message); } catch (_) { /* ignore */ } }
  };

  const budget = await deps.canSpend();
  if (!budget || !budget.allowed) {
    deps.logSkip("skipped-understanding-budget");
    return { vorgangId, status: "skipped-budget", reason: budget && budget.reason };
  }

  let aiResult;
  try {
    aiResult = await deps.requestUnderstanding(buildUnderstandingPrompt(cluster));
  } catch (error) {
    await markFailed();
    // HTTP-Fehlercode aus ai.js ist kein KI-Inhalt — safe to log fuer Diagnose (kein Prompt/Response).
    const errorCode = error && error.message ? String(error.message).slice(0, 120) : "unknown";
    console.error("[understanding] skipped-error:", vorgangId, errorCode);
    deps.logSkip("skipped-understanding-error");
    return { vorgangId, status: "skipped-error", errorCode };
  }

  const ko = assembleKnowledgeObject(aiResult, cluster, vorgangId, { understanding_status: "complete", model });
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
    return { vorgangId, status: "skipped-invalid", errors: validation.errors.slice(0, 5) };
  }

  const saved = await deps.save(ko);
  // Provenienz persistieren (fail-safe): Quell-Dokumente <-> KO in ko_document_links.
  // Ein Fehler hier darf das erfolgreiche Understanding nie zuruecknehmen.
  if (saved && saved.saved && typeof deps.saveSources === "function") {
    try { await deps.saveSources(ko.id, cluster.documents || []); }
    catch (e) { try { console.error("[understanding] saveSources fehlgeschlagen:", e && e.message); } catch (_) { /* ignore */ } }
  }
  return {
    vorgangId,
    status: saved && saved.saved ? "saved" : "skipped-store",
    id: ko.id,
    documents: ko.source_document_count
  };
}

// Schatten-Lauf ueber alle Cluster. Global gelockt; ohne Flag/KI/Lock -> No-Op.
// rawDocsOrItems: rohe rawItems ODER bereits minimierte raw_document-Zeilen.
async function runUnderstandingShadow(rawDocsOrItems = [], overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
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
    const startedAt = Date.now();
    let ran = 0;
    for (const cluster of clusters) {
      if (budgetMs && Date.now() - startedAt > budgetMs) break;
      ran += 1;
      // Fail-safe: ein einzelner geworfener Cluster darf den Batch nie abbrechen.
      try {
        results.push(await understandOneCluster(cluster, deps)); // seriell: schont Budget/Rate-Limit
      } catch (error) {
        results.push({ status: "cluster-error" });
      }
    }
    const deferred = clusters.length - ran;
    const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
    return { clusters: clusters.length, processed: ran, deferred, counts, results };
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
  const deps = { ...defaultDeps(), ...overrides };
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
    const results = [];
    // Zeitbudget wie im eager-Pfad: bei Erschöpfung stoppen; noch nicht verstandene
    // pending-KOs bleiben pending und werden im nächsten Lauf nachgeholt (idempotent).
    const budgetMs = Number(deps.budgetMs) > 0 ? Number(deps.budgetMs) : 0;
    const startedAt = Date.now();
    let deferred = 0;
    let budgetHit = false;
    for (const ko of pending) {
      if (budgetHit) { deferred += 1; continue; }
      if (budgetMs && Date.now() - startedAt > budgetMs) { budgetHit = true; deferred += 1; continue; }
      if (!ko || !ko.vorgang_id) { results.push({ status: "skipped-no-vorgang" }); continue; }
      const cluster = byVorgang.get(ko.vorgang_id);
      if (!cluster || !(cluster.documents || []).length) {
        // Keine Quell-Dokumente fuer diesen Vorgang in diesem Lauf -> KEIN KI-Call.
        results.push({ vorgangId: ko.vorgang_id, status: "skipped-no-cluster" });
        continue;
      }
      // Fail-safe: ein einzelner geworfener Vorgang darf den Batch nie abbrechen.
      try {
        results.push(await understandOneCluster(cluster, deps, { vorgangId: ko.vorgang_id, existing: ko }));
      } catch (error) {
        results.push({ vorgangId: ko.vorgang_id, status: "cluster-error" });
      }
    }
    const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
    return { pending: pending.length, deferred, counts, results };
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
