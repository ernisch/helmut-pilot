"use strict";

// Helmut Core V3 — C7a: Matching Engine (pgvector, KEINE KI).
// "Einmal verstehen (global) -> mehrfach bewerten (pro Nutzer, 0 KI)".
//
// Diese Engine bewertet mandantenlose knowledge_objects gegen ein Nutzerprofil —
// deterministisch, reproduzierbar, ohne KI und ohne Netzwerk:
//   1. Merkmalsvektor (Embedding) aus OEFFENTLICHEN Profilmerkmalen
//      (Partei/Fraktion, Ausschuss, Themen, Wahlkreis/Region) — regelbasiert
//      per Hashing-Trick, KEIN Modell-Call.
//   2. Kosinus-Aehnlichkeit zwischen Profil- und Vorgangs-Vektor.
//   3. Harte, erklaerbare Filter (Partei/Ausschuss/Wahlkreis) — optional.
//   4. matched_features: welches Merkmal warum getroffen hat (Erklaerbarkeit).
//
// In Produktion traegt pgvector die Suche (storage.matchKnowledgeObjectsByEmbedding
// -> SQL-RPC). Der reine Kern hier ist identisch deterministisch und dient dem
// Offline-Test (P1) und als Fallback ohne Supabase.
//
// DSGVO: Es werden ausschliesslich oeffentliche politische Merkmale verarbeitet.
// matched_features sind kurze oeffentliche Labels (z. B. "SPD", "Ausschuss fuer
// Arbeit"), keine Freitext-PII, keine privaten Personenprofile.

const crypto = require("crypto");

// Muss zur vector(N)-Spalte in supabase/schema.sql passen.
const EMBEDDING_DIM = Number(process.env.HELMUT_MATCHING_DIM || 256);

// Merkmalsgewichte: harte Identitaetsmerkmale zaehlen mehr als freier Inhalt.
const WEIGHTS = { partei: 3, ausschuss: 3, region: 2, thema: 2, inhalt: 1 };

// --- kleine, reine Helfer ---------------------------------------------------
function slug(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function label(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, 120);
}

// --- Label-Normalisierung (P1-2, profile-coverage.md §4.1/§6) ---------------
// Harte Identitaetstreffer (Ausschuss 34 P., Partei 22 P.) gingen verloren, weil
// slug() nur lowercase/Sonderzeichen macht: "Ausschuss fuer Arbeit und Soziales"
// != "Arbeit und Soziales", "Linke" != "Die Linke". Diese Normalisierung bringt
// beide Seiten (Profil UND KO) auf eine kanonische Form, BEVOR geslugt/verglichen
// wird. Umlaute werden gefaltet (ae/oe/ue/ss), damit Schreibvarianten zusammenfallen.
function foldUmlauts(s) {
  return String(s || "").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

// Kanonische Ausschuss-Stems. Deckt die gaengigen Bundestags-Ausschuesse ab; der
// generische Praefix-/Suffix-Abbau faengt den Rest ("Ausschuss fuer X" -> "x").
const COMMITTEE_SYNONYMS = {
  "arbeit und soziales": "arbeit-und-soziales", "soziales": "arbeit-und-soziales", "sozial": "arbeit-und-soziales",
  "gesundheit": "gesundheit", "gesundheit und pflege": "gesundheit",
  "finanzen": "finanzen", "finanz": "finanzen", "haushalt": "haushalt",
  "verteidigung": "verteidigung",
  "inneres": "inneres", "inneres und heimat": "inneres", "innen": "inneres",
  "auswaertiges": "auswaertiges", "auswaertiger": "auswaertiges",
  "umwelt": "umwelt", "umwelt naturschutz nukleare sicherheit und verbraucherschutz": "umwelt",
  "wirtschaft": "wirtschaft", "wirtschaft und energie": "wirtschaft", "wirtschaft und klimaschutz": "wirtschaft",
  "bildung": "bildung", "bildung forschung und technikfolgenabschaetzung": "bildung", "bildung und forschung": "bildung",
  "recht": "recht", "recht und verbraucherschutz": "recht",
  "verkehr": "verkehr", "digitales": "digitales", "digitales und verkehr": "verkehr",
  "familie": "familie", "familie senioren frauen und jugend": "familie",
  "ernaehrung": "ernaehrung", "ernaehrung und landwirtschaft": "ernaehrung", "landwirtschaft": "ernaehrung",
  "wohnen": "wohnen", "wohnen stadtentwicklung bauwesen und kommunen": "wohnen", "bau": "wohnen",
  "menschenrechte": "menschenrechte", "tourismus": "tourismus", "sport": "sport",
  "europa": "europa", "europaeische union": "europa",
  "wirtschaftliche zusammenarbeit und entwicklung": "entwicklung", "entwicklung": "entwicklung",
  "kultur und medien": "kultur", "kultur": "kultur"
};

function normalizeCommittee(value) {
  let s = foldUmlauts(String(value == null ? "" : value).toLowerCase()).replace(/&/g, "und").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  // "ausschuss fuer/zur/zum/des/der X" -> "X"
  s = s.replace(/^ausschuss\s+(fuer|zur|zum|des|der|fur)\s+/, "");
  // generisches Suffix "Xausschuss"/"X ausschuss" -> "X" (Sozialausschuss -> sozial)
  s = s.replace(/\s*ausschuss$/, "").trim();
  if (COMMITTEE_SYNONYMS[s]) return COMMITTEE_SYNONYMS[s];
  for (const key of Object.keys(COMMITTEE_SYNONYMS)) {
    if (key.length >= 5 && s.includes(key)) return COMMITTEE_SYNONYMS[key];
  }
  return s.replace(/\s+/g, "-");
}

// committeeMatchKey: KOLLISIONSSICHERE Variante fuer reine Mitgliedschafts-/Belegpruefungen
// (z. B. Radar-Ausschuss-Reiter, KO-Klassifikation), NICHT fuer die Aehnlichkeits-/Embedding-
// Pipeline. normalizeCommittee/slugCommittee bleiben ABSICHTLICH unveraendert (Insertion-
// Reihenfolge im Substring-Fallback) — sie speisen knowledgeObjectWeightedTokens/
// profileWeightedTokens und damit Ranking/Score/Top-N-Cut; jede Aenderung an ihrem Ergebnis
// verschiebt real die Trefferreihenfolge (Lage/Helmut/Radar-Dynamiken/Top-50-Cut), auch fuer
// Profile, deren eigener Ausschuss von der Aenderung gar nicht betroffen ist (geteilter
// Feature-Vektor-Raum). committeeMatchKey nutzt denselben Synonym-Katalog, aber mit
// "maximal munch" (laengster/spezifischster Schluessel zuerst), damit ein kurzer, generischer
// Schluessel NICHT faelschlich gegen einen laengeren gewinnt, der ihn als Teilwort enthaelt
// (Beispiel: "recht" war Teilwort von "menschenrechte" und gewann in Insertion-Reihenfolge vor
// dem spezifischeren Schluessel -> "Menschenrechte und humanitäre Hilfe" wurde faelschlich wie
// "Recht und Verbraucherschutz" behandelt). Bewusst getrennt von normalizeCommittee, damit die
// Korrektur NUR Mitgliedschafts-/Belegvergleiche schaerft, ohne Ranking/Score zu beruehren.
const COMMITTEE_SYNONYM_KEYS_BY_LENGTH_DESC = Object.keys(COMMITTEE_SYNONYMS).sort((a, b) => b.length - a.length);

function committeeMatchKey(value) {
  let s = foldUmlauts(String(value == null ? "" : value).toLowerCase()).replace(/&/g, "und").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(/^ausschuss\s+(fuer|zur|zum|des|der|fur)\s+/, "");
  s = s.replace(/\s*ausschuss$/, "").trim();
  if (COMMITTEE_SYNONYMS[s]) return COMMITTEE_SYNONYMS[s];
  for (const key of COMMITTEE_SYNONYM_KEYS_BY_LENGTH_DESC) {
    if (key.length >= 5 && s.includes(key)) return COMMITTEE_SYNONYMS[key];
  }
  return s.replace(/\s+/g, "-");
}

// --- Institutioneller Zustaendigkeitsraum (Befund 27A-1 und 27A-2) ----------
//
// DER FEHLER: normalizeCommittee faltet den Brandenburger "Ausschuss fuer Inneres
// und Kommunales" UND den Berliner "Ausschuss fuer Inneres, Sicherheit und Ordnung"
// auf denselben Stamm "inneres" (beide enthalten den Synonymschluessel "inneres").
// Dieselbe Kollision faltet auch ueber die politischen EBENEN hinweg: der
// Bundestagsausschuss "Gesundheit" und ein "Gesundheitsausschuss (Landtag)"
// fallen auf "gesundheit", "Arbeit und Soziales" und ein "Sozialausschuss
// Kreistag Ostallgaeu" auf "arbeit-und-soziales" (Befund 27A-2, in Production
// gemessen: 14 falsche Belege bei 4 von 6 aktiven Bundestagsprofilen).
// committeeMatchKey loest das NICHT — es korrigiert nur die Reihenfolge des
// Substring-Fallbacks und liefert fuer beide Namen ebenfalls "inneres" (gemessen).
// Ein Ausschussname enthaelt strukturell KEINEN Hinweis auf sein Parlament; die
// Kollision ist deshalb aus dem Namen allein nicht aufloesbar — und darf laut
// Produktregel auch NICHT aus aehnlich klingenden Namen geraten werden.
//
// DIE REGEL: ein politisches FACHGEBIET darf laenderuebergreifend aehnlich sein
// (deshalb bleiben Merkmalsvektor, Aehnlichkeit und die Themen-Ableitung
// derivePolicyFields ABSICHTLICH unveraendert — "Inneres" bleibt "Inneres"). Eine
// konkrete AUSSCHUSSMITGLIEDSCHAFT ist dagegen an eine Institution gebunden: sie
// gilt nur als Beleg, wenn der Zustaendigkeitsraum des Vorgangs zum Mandat passt.
//
// WAS HIER ENTSTEHT: aus den bereits vorhandenen, belegten Feldern — Profil
// (mandate_profiles.politische_ebene + .bundesland, gemappt als
// parliamentType/politicalLevel + state/bundesland) und Wissensobjekt
// (decision_level + affected_geographies, seit Sprint 2/19/20 nie leer bzw.
// ehrlich leer) — wird je Seite ein Zustaendigkeitsraum abgeleitet. Es wird
// NICHTS erfunden, NICHTS geraten und KEINE neue Datenquelle gebraucht.
//
// GELTUNGSBEREICH (docs/matching-nachvollziehbarkeit.md §50 und §52):
// Die Pruefung ist SYMMETRISCH — sie verlangt fuer jedes Profil mit BELEGTER
// Mandatsebene, dass der Zustaendigkeitsraum des Vorgangs institutionell zum
// Mandat passt:
//   * Landesmandat (Befund 27A-1) -> derselbe Landes-Zustaendigkeitsraum,
//   * Bundesmandat  (Befund 27A-2, symmetrische Ergaenzung) -> Bundesebene.
// Ist die PROFILSEITE unbestimmt — keine belegte Mandatsebene, oder Landesmandat
// ohne belegtes Bundesland —, bleibt das Verhalten unveraendert: dort ist gar
// nichts entscheidbar, also wird auch nichts stillschweigend entfernt.
//
// Fail-closed gilt ausschliesslich fuer die konkrete AUSSCHUSSMITGLIEDSCHAFT.
// Der fachliche Bezug bleibt in jedem Fall erhalten: das aus dem Ausschuss
// abgeleitete Politikfeld (derivePolicyFields) trifft weiterhin als `thema`,
// und Merkmalsvektor/Aehnlichkeit/Rang bleiben unberuehrt.
//
// Aus Sicht eines LANDESmandats uebergeordnete Ebenen (unveraendert seit 27A-1).
const UEBERGEORDNETE_EBENEN = new Set(["bund", "eu", "international"]);
// Aus Sicht eines BUNDESmandats uebergeordnete Ebenen. Ob ein EU-/internationaler
// Vorgang einen Bundestagsausschuss als MITGLIEDSCHAFT belegen darf, ist eine
// offene FACHLICHE Frage ueber institutionelle Beziehungen (Nebenbefund, §52.7):
// dieselbe Ausschussnennung kann dort das ECHTE Bundestagsgremium meinen, das den
// EU-Vorgang beraet. Diese Frage wird hier bewusst NICHT entschieden — das
// Verhalten bleibt fuer sie unveraendert.
const SUPRANATIONALE_EBENEN = new Set(["eu", "international"]);

// Kanonische Land-Zuordnung aus dem Geografie-Seed (Deutschland -> Bundesland ->
// Bezirk/Kreis/Kommune). LAZY geladen: seeds/entities.js requirt dieses Modul,
// ein Top-Level-require in die Gegenrichtung waere eine Ladereihenfolge-Falle.
// Der Seed ist die EINZIGE Stelle, an der die 16 Bundeslaender gepflegt werden —
// hier wird keine zweite Liste angelegt.
let LAND_INDEX = null;
function landIndex() {
  if (LAND_INDEX) return LAND_INDEX;
  let seed = [];
  try { seed = require("./quellenarchitektur/seeds/geographies").GEOGRAPHIES || []; } catch (_) { seed = []; }
  const byId = new Map(seed.map((g) => [g.id, g]));
  const landVon = (g) => {
    let cur = g;
    for (let tiefe = 0; cur && tiefe < 8; tiefe += 1) {
      if (cur.level === "land") return cur.id;
      cur = cur.parent_id ? byId.get(cur.parent_id) : null;
    }
    return null;
  };
  const idx = { byId: new Map(), byName: new Map() };
  const mehrdeutig = new Set();
  for (const g of seed) {
    const land = landVon(g);
    if (!land) continue;                       // Bund/Deutschland ist KEIN Bundesland
    idx.byId.set(g.id, land);
    // Der Name ist nur der Rueckweg fuer Angaben OHNE kanonische Kennung. Truege
    // derselbe Ortsname zwei Bundeslaender (z. B. ein zweites "Mitte"), waere jede
    // Zuordnung geraten — solche Namen werden deshalb ausgetragen, nicht ueberschrieben.
    const key = landNameKey(g.name);
    if (!key) continue;
    if (idx.byName.has(key) && idx.byName.get(key) !== land) mehrdeutig.add(key);
    else idx.byName.set(key, land);
  }
  for (const key of mehrdeutig) idx.byName.delete(key);
  LAND_INDEX = idx;
  return idx;
}

function landNameKey(value) {
  return foldUmlauts(String(value == null ? "" : value).toLowerCase())
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

// Name oder kanonische Seed-Kennung -> Bundesland-Kennung (geo-land-*) oder null.
// Kennung hat Vorrang; unaufloesbare Angaben bleiben null (kein erfundener Treffer).
function landKennung(eintrag) {
  const idx = landIndex();
  const id = eintrag && typeof eintrag === "object" ? eintrag.geography_id || eintrag.id : null;
  if (id && idx.byId.has(String(id))) return idx.byId.get(String(id));
  const name = eintrag && typeof eintrag === "object" ? eintrag.name : eintrag;
  const key = landNameKey(name);
  return key && idx.byName.has(key) ? idx.byName.get(key) : null;
}

// Zustaendigkeitsraum eines Profils. `ebene` spiegelt bewusst dieselbe Ableitung
// wie storage.politicalLevelToEbene (gleiche Quellspalte politische_ebene);
// dupliziert, weil matching.js storage.js nicht laden darf (Zyklus).
function profileZustaendigkeit(profile = {}) {
  const roh = foldUmlauts(String(
    (profile && (profile.parliamentType || profile.politicalLevel || profile.politische_ebene)) || ""
  ).toLowerCase()).trim();
  let ebene = null;
  if (roh.includes("landtag") || roh.includes("abgeordnetenhaus") || roh.startsWith("land")) ebene = "land";
  else if (roh.includes("bundestag") || roh.startsWith("bund")) ebene = "bund";
  // Das Bundesland eines Bundestagsmandats ist sein Wahlkreisland, NICHT sein
  // Zustaendigkeitsraum — der ist der Bund. Deshalb nur fuer Landesmandate.
  const land = ebene === "land"
    ? (landKennung(profile.state) || landKennung(profile.bundesland))
    : null;
  return { ebene, land };
}

// Zustaendigkeitsraum eines Wissensobjekts. `laender` sind ALLE belegten
// betroffenen Bundeslaender (mehrdeutige Angaben bleiben mehrdeutig, sie werden
// nicht auf eines verkuerzt). `mentioned_geographies` zaehlt bewusst NICHT:
// erwaehnt ist nicht zustaendig.
function knowledgeObjectZustaendigkeit(ko = {}) {
  const roh = String((ko && (ko.decision_level || ko.political_level)) || "").trim().toLowerCase();
  const laender = new Set();
  for (const g of Array.isArray(ko && ko.affected_geographies) ? ko.affected_geographies : []) {
    const land = landKennung(g);
    if (land) laender.add(land);
  }
  return { ebene: roh && roh !== "unknown" ? roh : null, laender: [...laender].sort() };
}

// Darf eine Ausschussueberschneidung als MITGLIEDSCHAFTSBELEG gelten?
//
// DIE EINZIGE Bedingung, unter der die Regel ueberhaupt greift: die PROFILSEITE
// traegt einen bestimmten Zustaendigkeitsraum. Ist sie unbestimmt — keine belegte
// Mandatsebene, oder Landesmandat ohne belegtes Bundesland —, bleibt das
// Verhalten unveraendert; es wird NICHTS stillschweigend entfernt, wo nichts
// entschieden werden kann.
//
// Greift die Regel, verlangt sie eine POSITIV belegte Uebereinstimmung des
// Zustaendigkeitsraums (fail-closed): fremde, hierarchisch andere,
// widersprueckliche oder unlesbare Zustaendigkeit des Vorgangs erzeugt KEINEN
// Beleg — lieber ein ehrlicher Leerzustand als eine erfundene Mitgliedschaft. Der
// Ausschussname selbst entscheidet dabei NIE mit: er traegt strukturell keinen
// Hinweis auf sein Parlament, und aus aehnlich klingenden Namen darf nichts
// geraten werden. Zwei Ausnahmen sind ausdruecklich benannt und unten je an ihrer
// Zeile begruendet: EU/international fuer Bundesmandate (offener Nebenbefund) und
// eine GAR NICHT belegte Ebene auf der Bundesseite.
//
// `decision_level` ist auf beiden Seiten das FUEHRENDE Feld; die Geografie
// praezisiert nur, WELCHES Bundesland innerhalb der Landesebene gemeint ist. Ein
// Bundesvorgang mit betroffenem Bundesland bleibt deshalb ein Bundesvorgang.
function ausschussBelegZulaessig(profilZustaendigkeit, koZustaendigkeit) {
  const pz = profilZustaendigkeit;
  if (!pz || !pz.ebene) return true;                                 // Profilebene unbelegt -> nichts entscheidbar
  const kz = koZustaendigkeit || { ebene: null, laender: [] };       // fehlende Angabe = keine belegte Zustaendigkeit

  // Landesmandat (Befund 27A-1) — unveraendert.
  if (pz.ebene === "land") {
    if (!pz.land) return true;                                       // Bundesland unbelegt -> nichts entscheidbar
    if (UEBERGEORDNETE_EBENEN.has(kz.ebene)) return false;           // Bund/EU ist kein Landesausschuss
    return Array.isArray(kz.laender) && kz.laender.includes(pz.land);
  }

  // Bundesmandat (Befund 27A-2) — die symmetrische Ergaenzung dieses Sprints.
  // Ein Landtags-, Kreistags- oder Gemeinderatsausschuss (`land`/`kommune`) ist
  // KEIN Bundestagsausschuss — auch wenn beide Bezeichnungen auf denselben Stamm
  // fallen. Verlangt wird deshalb, dass die Ebene des Vorgangs POSITIV als `bund`
  // belegt ist. Alles andere ist fail-closed, in genau derselben Strenge wie auf
  // der Landesseite:
  //   * fremde/untergeordnete Ebene (`land`, `kommune`)   -> kein Beleg
  //   * FEHLENDE, leere oder `unknown` Ebene              -> kein Beleg
  //   * belegte, aber unlesbare Angabe (z. B. "kommunal") -> kein Beleg
  // Eine unbelegte Ebene beweist keine Bundeszustaendigkeit; aus ihr eine
  // Mitgliedschaft abzuleiten waere geraten. Lieber ein ehrlicher Leerzustand —
  // der fachliche Bezug bleibt als `thema` erhalten (§52.6).
  //
  // EINZIGE Ausnahme, getrennt begruendet und hier NICHT erweitert:
  // `eu`/`international` (offener fachlicher Nebenbefund, §52.7).
  if (pz.ebene === "bund") {
    if (SUPRANATIONALE_EBENEN.has(kz.ebene)) return true;            // offener Nebenbefund (§52.7), bewusst unveraendert
    return kz.ebene === "bund";                                      // sonst: nur die POSITIV belegte Bundesebene
  }

  return true;                                                       // unbekannte Mandatsebene -> nichts entscheidbar
}

const PARTY_SYNONYMS = {
  "linke": "linke", "linksfraktion": "linke",
  "gruene": "gruene", "gruenen": "gruene", "buendnis 90 die gruenen": "gruene", "b90 die gruenen": "gruene", "buendnis 90": "gruene",
  "spd": "spd", "sozialdemokraten": "spd", "sozialdemokratische partei": "spd",
  "cdu": "cdu", "csu": "csu", "cdu csu": "union", "union": "union",
  "afd": "afd", "alternative fuer deutschland": "afd",
  "fdp": "fdp", "freie demokraten": "fdp", "freie demokratische partei": "fdp",
  "bsw": "bsw", "buendnis sahra wagenknecht": "bsw"
};

function normalizeParty(value) {
  let s = foldUmlauts(String(value == null ? "" : value).toLowerCase()).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  s = s.replace(/^die\s+/, ""); // Artikel entfernen ("die linke" -> "linke")
  if (PARTY_SYNONYMS[s]) return PARTY_SYNONYMS[s];
  return s.replace(/\s+/g, "-");
}

const slugCommittee = (v) => slug(normalizeCommittee(v));
const slugParty = (v) => slug(normalizeParty(v));

// --- Deterministische Themen-Anreicherung (P1-1, profile-coverage.md §10) ----
// Im Prod-Bestand sind tags/policy_field bei ALLEN 217 KOs leer (die Understanding-
// Engine extrahiert sie nicht). Solange sie leer sind, wird das Politikfeld
// read-time aus den STRUKTURIERTEN, belegten Ausschuss-Feldern abgeleitet — der
// Ausschuss IST das Politikfeld. KEINE KI, KEIN erfundenes Thema, KEIN DB-Write
// (rein zur Laufzeit). Nur echte Fachfelder; Prozedur-/Kontrollgremien
// (Koalitionsausschuss, Untersuchungsausschuss, Bundesrat …) liefern KEIN Thema.
const POLICY_FIELD_LABELS = {
  "arbeit-und-soziales": "Arbeit und Soziales", "gesundheit": "Gesundheit",
  "finanzen": "Finanzen", "haushalt": "Haushalt", "verteidigung": "Verteidigung",
  "inneres": "Inneres", "auswaertiges": "Auswärtiges", "umwelt": "Umwelt",
  "wirtschaft": "Wirtschaft", "bildung": "Bildung", "recht": "Recht",
  "verkehr": "Verkehr", "digitales": "Digitales", "familie": "Familie",
  "ernaehrung": "Ernährung und Landwirtschaft", "wohnen": "Wohnen und Bau",
  "sport": "Sport", "kultur": "Kultur und Medien", "europa": "Europa",
  "entwicklung": "Entwicklung", "menschenrechte": "Menschenrechte", "tourismus": "Tourismus"
};

// Politikfelder aus den (belegten) Ausschuss-Feldern eines KO ableiten.
function derivePolicyFields(ko = {}) {
  const committees = [...(ko.ausschuesse || []), ...(ko.mentioned_committees || [])];
  const out = new Set();
  for (const c of committees) {
    const label = POLICY_FIELD_LABELS[normalizeCommittee(c)];
    if (label) out.add(label);
  }
  return [...out];
}

function uniq(list) {
  return [...new Set((Array.isArray(list) ? list : []).map((v) => String(v || "").trim()).filter(Boolean))];
}

function contentTokens(text) {
  return [...new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/gi, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 4)
  )];
}

function round4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

// pgvector liefert Vektoren als Literal-String "[a,b,c]"; Testdaten als Array.
function toVector(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === "string" && value.trim().startsWith("[")) {
    try { return JSON.parse(value).map(Number); } catch { return null; }
  }
  return null;
}

// --- Hashing-Trick: Token -> (Index, Vorzeichen). Deterministisch (sha256) ---
function hashToIndex(token, dim) {
  const h = crypto.createHash("sha256").update(String(token)).digest();
  const raw = ((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0;
  const sign = (h[4] & 1) === 0 ? 1 : -1;
  return { index: raw % dim, sign };
}

function l2normalize(vec) {
  let sum = 0;
  for (const v of vec) sum += v * v;
  const norm = Math.sqrt(sum);
  if (!norm) return vec.slice();
  return vec.map((v) => v / norm);
}

function embed(weightedTokens, dim = EMBEDDING_DIM) {
  const vec = new Array(dim).fill(0);
  for (const wt of weightedTokens) {
    if (!wt || !wt.token) continue;
    const { index, sign } = hashToIndex(wt.token, dim);
    vec[index] += sign * (Number(wt.weight) || 0);
  }
  return l2normalize(vec);
}

function cosineSimilarity(a, b) {
  const va = toVector(a);
  const vb = toVector(b);
  if (!va || !vb || va.length !== vb.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < va.length; i += 1) {
    dot += va[i] * vb[i];
    na += va[i] * va[i];
    nb += vb[i] * vb[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// --- Merkmalsextraktion (nur oeffentliche Merkmale) -------------------------
function profileFeatures(profile = {}) {
  return {
    // Befund 27A-1: der institutionelle Zustaendigkeitsraum reist als EIGENES Feld
    // mit. Er geht bewusst NICHT in die Token-/Vektorbildung, den Profilhash oder
    // die harten Filter ein (die lesen ausschliesslich die benannten Dimensionen) —
    // er entscheidet allein, ob eine Ausschussueberschneidung als
    // Mitgliedschaftsbeleg gelten darf (matchedFeatures).
    zustaendigkeit: profileZustaendigkeit(profile),
    parties: uniq([profile.party, profile.partei, profile.faction, profile.fraktion]),
    committees: uniq([profile.committee, ...(profile.committees || [])]),
    regions: uniq([
      profile.constituency, profile.wahlkreis, profile.state, profile.bundesland,
      profile.location, ...(profile.regionalInterests || [])
    ]),
    topics: uniq([...(profile.focusTopics || []), ...(profile.reportingTopics || []), ...(profile.topics || [])])
  };
}

function knowledgeObjectFeatures(ko = {}) {
  const explicitTopics = uniq([...(ko.tags || []), ...(ko.policy_field || [])]);
  return {
    // Befund 27A-1 (siehe profileFeatures): reist mit, wirkt nur auf den
    // Ausschussbeleg — nicht auf Vektor, Aehnlichkeit, Rang oder Filter.
    zustaendigkeit: knowledgeObjectZustaendigkeit(ko),
    parties: uniq([...(ko.parteien || []), ...(ko.mentioned_parties || [])]),
    committees: uniq([...(ko.ausschuesse || []), ...(ko.mentioned_committees || [])]),
    // ko.regions existiert nicht (radar.md §5) -> nur mentioned_locations.
    regions: uniq([...(ko.mentioned_locations || [])]),
    // P1-1: leere tags/policy_field read-time aus den Ausschuessen ableiten, damit
    // die Themen-Dimension nicht komplett tot ist (deterministisch, belegt, ohne KI).
    topics: explicitTopics.length ? explicitTopics : derivePolicyFields(ko)
  };
}

function profileWeightedTokens(profile = {}) {
  const f = profileFeatures(profile);
  const out = [];
  f.parties.forEach((p) => out.push({ token: `partei:${slugParty(p)}`, weight: WEIGHTS.partei }));
  f.committees.forEach((c) => out.push({ token: `ausschuss:${slugCommittee(c)}`, weight: WEIGHTS.ausschuss }));
  f.regions.forEach((r) => out.push({ token: `region:${slug(r)}`, weight: WEIGHTS.region }));
  f.topics.forEach((t) => {
    out.push({ token: `thema:${slug(t)}`, weight: WEIGHTS.thema });
    contentTokens(t).forEach((ct) => out.push({ token: `inhalt:${ct}`, weight: WEIGHTS.inhalt }));
  });
  return out;
}

function knowledgeObjectWeightedTokens(ko = {}) {
  const f = knowledgeObjectFeatures(ko);
  const out = [];
  f.parties.forEach((p) => out.push({ token: `partei:${slugParty(p)}`, weight: WEIGHTS.partei }));
  f.committees.forEach((c) => out.push({ token: `ausschuss:${slugCommittee(c)}`, weight: WEIGHTS.ausschuss }));
  f.regions.forEach((r) => out.push({ token: `region:${slug(r)}`, weight: WEIGHTS.region }));
  f.topics.forEach((t) => {
    out.push({ token: `thema:${slug(t)}`, weight: WEIGHTS.thema });
    contentTokens(t).forEach((ct) => out.push({ token: `inhalt:${ct}`, weight: WEIGHTS.inhalt }));
  });
  contentTokens(`${ko.headline || ""} ${ko.was_ist_passiert || ""} ${ko.warum_wichtig || ""}`)
    .forEach((ct) => out.push({ token: `inhalt:${ct}`, weight: WEIGHTS.inhalt }));
  return out;
}

function embedProfile(profile, dim = EMBEDDING_DIM) {
  return embed(profileWeightedTokens(profile), dim);
}

function embedKnowledgeObject(ko, dim = EMBEDDING_DIM) {
  return embed(knowledgeObjectWeightedTokens(ko), dim);
}

// WICHTIG (Benennung): Der von embedProfile/embedKnowledgeObject erzeugte 256-dim Vektor
// ist ein TECHNISCHER FEATURE-/MERKMALSVEKTOR (deterministischer Token-Hash aus Partei/
// Ausschuss/Region/Thema/Inhalt), KEIN semantisches Embedding. Die Kosinus-Aehnlichkeit
// darauf misst MERKMALSUEBERLAPPUNG, NICHT Bedeutungsaehnlichkeit — zwei Vorgaenge mit
// gleicher Bedeutung, aber anderen Woertern, sind hier NICHT aehnlich. Er ersetzt daher
// KEIN semantisches Matching. Echte Bedeutungsaehnlichkeit braeuchte eine Embedding-API
// (kostenpflichtig, FREIGABEPFLICHTIG) — bewusst (noch) nicht umgesetzt.
// computeFeatureVector* sind die ehrlich benannten Aliase; die Alt-Namen (embed*) bleiben
// aus Kompatibilitaet, die DB-Spalte heisst weiterhin technisch "embedding".
const computeFeatureVectorForKnowledgeObject = embedKnowledgeObject;
const computeFeatureVectorForProfile = embedProfile;

// Stabiler Hash der Profilmerkmale -> erkennt Profiländerungen (Embedding neu?).
function profileHash(profile = {}) {
  const f = profileFeatures(profile);
  const parts = [["p", f.parties, slugParty], ["c", f.committees, slugCommittee], ["r", f.regions, slug], ["t", f.topics, slug]]
    .map(([k, arr, fn]) => `${k}:${[...new Set(arr.map(fn))].sort().join(",")}`);
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

// --- Filter (Partei/Ausschuss/Wahlkreis) + Erklaerbarkeit -------------------
// slugFn erlaubt dimensionsspezifische Normalisierung (Partei/Ausschuss, P1-2).
function overlapLabels(aList, bList, slugFn = slug) {
  const bSlugs = new Set((bList || []).map(slugFn));
  const seen = new Set();
  const out = [];
  for (const a of aList || []) {
    const s = slugFn(a);
    if (s && bSlugs.has(s) && !seen.has(s)) { seen.add(s); out.push(label(a)); }
  }
  return out;
}

// filters = { parties?:[], committees?:[], regions?:[] }. Eine gesetzte Dimension
// muss ueberlappen (AND ueber Dimensionen, OR innerhalb). Leer/nicht gesetzt = egal.
function passesFilters(koFeatures, filters) {
  if (!filters) return true;
  const dimOk = (want, have, slugFn) => {
    if (!want || !want.length) return true;
    const haveSlugs = new Set((have || []).map(slugFn));
    return want.some((w) => haveSlugs.has(slugFn(w)));
  };
  return dimOk(filters.parties, koFeatures.parties, slugParty)
    && dimOk(filters.committees, koFeatures.committees, slugCommittee)
    && dimOk(filters.regions, koFeatures.regions, slug);
}

function matchedFeatures(pf, kf) {
  const feats = [];
  overlapLabels(pf.parties, kf.parties, slugParty).forEach((v) => feats.push({ type: "partei", value: v }));
  // BEFUND 27A-1 + 27A-2: eine Ausschussueberschneidung ist nur dann eine
  // MITGLIEDSCHAFT, wenn Ausschuss und Zustaendigkeitsraum zusammenpassen.
  // Faellt sie hier weg, faellt sie ueberall weg — matched_features speisen
  // Signale, gespeicherte Begruendung, sichtbare Erklaerung, das
  // Entscheidungsgewicht (decisions.js: ausschuss 34) und den M8-Relevanzriegel.
  // Der FACHLICHE Bezug bleibt erhalten: das aus dem Ausschuss abgeleitete
  // Politikfeld (derivePolicyFields) trifft weiterhin als `thema`.
  if (ausschussBelegZulaessig(pf && pf.zustaendigkeit, kf && kf.zustaendigkeit)) {
    overlapLabels(pf.committees, kf.committees, slugCommittee).forEach((v) => feats.push({ type: "ausschuss", value: v }));
  }
  overlapLabels(pf.regions, kf.regions).forEach((v) => feats.push({ type: "wahlkreis", value: v }));
  overlapLabels(pf.topics, kf.topics).forEach((v) => feats.push({ type: "thema", value: v }));
  return feats;
}

// --- Reiner deterministischer Match (P1-testbar, ohne Storage/Netz) ---------
// Rankt knowledge_objects gegen ein Profil. Nutzt vorhandene ko.embedding, sonst
// berechnet es deterministisch. Gibt erklaerbare, sortierte Treffer zurueck.
function matchProfileToKnowledgeObjects(profile, knowledgeObjects = [], opts = {}) {
  const dim = opts.dim || EMBEDDING_DIM;
  const threshold = opts.threshold != null ? Number(opts.threshold) : 0;
  const limit = opts.limit != null ? Number(opts.limit) : 20;
  const filters = opts.filters || null;
  const pf = profileFeatures(profile);
  const pEmb = opts.profileEmbedding ? toVector(opts.profileEmbedding) : embedProfile(profile, dim);

  const scored = [];
  for (const ko of knowledgeObjects || []) {
    if (!ko || !ko.id) continue;
    if (ko.status === "pending") continue; // noch nicht verstanden -> nicht matchbar
    const kf = knowledgeObjectFeatures(ko);
    if (!passesFilters(kf, filters)) continue;
    const kEmb = toVector(ko.embedding) || embedKnowledgeObject(ko, dim);
    const similarity = cosineSimilarity(pEmb, kEmb);
    const matched = matchedFeatures(pf, kf);
    if (similarity < threshold && !matched.length) continue;
    scored.push({
      knowledge_object_id: ko.id,
      vorgang_id: ko.vorgang_id || null,
      similarity: round4(similarity),
      matched_features: matched
    });
  }
  // Tiebreak byte-stabil (matching-contract.compareIds), BEWUSST kein
  // localeCompare: dessen Ergebnis haengt an der Locale/ICU-Version der
  // Laufzeitumgebung (z.B. "Bx" vs "ax") — derselbe Eingang haette in zwei
  // Umgebungen zwei Rangfolgen ergeben koennen.
  const compareIds = require("./matching-contract").compareIds;
  scored.sort((a, b) =>
    (b.similarity - a.similarity) ||
    (b.matched_features.length - a.matched_features.length) ||
    compareIds(a.knowledge_object_id, b.knowledge_object_id)
  );
  return scored.slice(0, Math.max(0, limit)).map((r, i) => ({ ...r, rank: i + 1 }));
}

// --- Shadow-Runner (Produktion): pgvector-Suche + Persistenz, hinter Flag ---
function defaultDeps() {
  const storage = require("./storage");
  return {
    enabled: () => storage.v3MatchingEnabled(),
    getProfile: (userId) => storage.getProfile(userId),
    // Sprint 23C-2A (Befund M-7): gebuendelter Lesezugriff auf GENAU die
    // Wissensobjekte der bereits feststehenden Trefferliste — nicht mehr ein
    // nach Aenderungszeit geschnittenes Fenster ueber den Gesamtbestand.
    listKnowledgeObjectsByIds: (ids) => storage.listKnowledgeObjectsByIds(ids),
    saveProfileEmbedding: (e) => storage.saveProfileEmbedding(e),
    matchByEmbedding: (p) => storage.matchKnowledgeObjectsByEmbedding(p),
    saveMatchingResults: (rows) => storage.saveMatchingResults(rows),
    // Sprint 23B-1 (Roadmap-Punkt 23): Auditpersistenz. DEFAULT AUS.
    // Solange auditEnabled() false liefert, ist der gesamte Auditpfad inert —
    // keine Sperre, kein Lesezugriff, kein Schreibzugriff, keine zusaetzliche
    // Fehlerquelle, und die geschriebenen Ergebniszeilen sind byte-identisch
    // zum Verhalten vor diesem Sprint.
    auditEnabled: () => storage.matchingAuditEnabled(),
    audit: () => require("./matching-audit"),
    // Sprint M-8 (Befund M-8): Relevanzriegel. DEFAULT AUS. Solange
    // relevanzGateEnabled() false liefert, ist die Kandidatenliste des
    // Schreibpfads byte-identisch zum Verhalten vor diesem Sprint.
    relevanzGateEnabled: () => storage.matchingRelevanzGateEnabled()
  };
}

async function runMatchingShadow(input = {}, overrides = {}) {
  const deps = { ...defaultDeps(), ...overrides };
  if (!deps.enabled()) return { skipped: true, reason: "matching-disabled" };

  const profile = input.profile || (input.userId ? await deps.getProfile(input.userId) : null);
  const userId = input.userId || (profile && (profile.id || profile.userId || profile.politicianId));
  if (!profile || !userId) return { skipped: true, reason: "no-profile" };

  const auditAktiv = typeof deps.auditEnabled === "function" && deps.auditEnabled() === true;
  if (!auditAktiv) return runMatchingCore(input, deps, profile, userId, null);

  // Nur im Auditpfad: EINE Sperre je Mandant/Profil ueber die bestehende
  // pipeline_locks-Infrastruktur (kein zweites Sperrsystem). Sie schliesst die
  // in Sprint 23A belegte Luecke, dass der Lage-Pfad — anders als der
  // Crawl-Pfad — bisher ungesperrt matcht. Unterschiedliche Profile tragen
  // unterschiedliche Sperrnamen und laufen weiterhin parallel.
  const audit = deps.audit();
  const gotLock = await audit.acquireRunLock(userId);
  if (gotLock === false) return { skipped: true, reason: "matching-locked", userId };
  try {
    return await runMatchingCore(input, deps, profile, userId, audit);
  } finally {
    try { await audit.releaseRunLock(userId); } catch (_) { /* TTL raeumt auf */ }
  }
}

// Der fachliche Kern. Bis einschliesslich `rows` ist er Zeile fuer Zeile
// identisch zum Stand vor Sprint 23B-1: dieselbe Kandidatenmenge, dieselben
// Aehnlichkeitswerte, dieselbe Rangvergabe, dieselben matched_features,
// dieselben Ergebniskennungen. Der Auditpfad haengt sich ausschliesslich
// DANACH ein und veraendert davon nichts.
async function runMatchingCore(input, deps, profile, userId, audit) {
  const startedAt = new Date();
  const dim = input.dim || EMBEDDING_DIM;
  const embedding = embedProfile(profile, dim);
  const pHash = profileHash(profile);
  await deps.saveProfileEmbedding({ user_id: userId, embedding, profile_hash: pHash, dim });

  const filters = input.filters || null;
  const matchCount = input.limit || 20;

  // Produktionspfad: pgvector-Aehnlichkeitssuche (harte Filter laufen in SQL).
  const search = await deps.matchByEmbedding({
    embedding,
    matchCount,
    filterParties: filters && filters.parties,
    filterCommittees: filters && filters.committees,
    filterRegions: filters && filters.regions
  });
  if (search && search.skipped) return { skipped: true, reason: search.reason };

  // Erklaerbarkeit: matched_features aus den GEFUNDENEN Wissensobjekten
  // berechnen — aus genau denen, die die Suche oben geliefert hat.
  //
  // BEFUND M-7, behoben in Sprint 23C-2A. Hier stand:
  //     const kos = await deps.listKnowledgeObjects({ limit: 200 });
  // Die Vektorsuche laeuft ueber den GESAMTEN Bestand (Production 2026-07-29:
  // 1 702 Wissensobjekte), die Merkmalsaufloesung sah davon aber nur die 200
  // zuletzt GEAENDERTEN. Ein Treffer ausserhalb dieses Fensters wurde gegen ein
  // leeres Objekt `{}` ausgewertet und bekam deshalb weder `matched_features`
  // noch `signale` noch `begruendung` — obwohl echte Profilueberschneidungen
  // bestanden (gemessen: 128 der 208 unbelegten aktuellen Ergebniszeilen).
  //
  // Die Trefferliste steht an dieser Stelle bereits fest. Deshalb werden GENAU
  // die dazugehoerigen Objekte gelesen, in EINER gebuendelten Abfrage statt je
  // Treffer einzeln. Kandidatenmenge, Aehnlichkeiten, Raenge, Reihenfolge und
  // Ergebniskennungen entstehen unveraendert oberhalb dieser Zeile — dieser
  // Block liest, er waehlt nicht aus und er bewertet nicht neu.
  if (typeof deps.listKnowledgeObjectsByIds !== "function") {
    throw new Error("matching: listKnowledgeObjectsByIds fehlt — Erklaerung waere unbelegt");
  }
  const trefferIds = [...new Set(
    (search.results || [])
      .map((h) => (h && h.id != null ? String(h.id) : ""))
      .filter(Boolean)
  )];
  const kos = await deps.listKnowledgeObjectsByIds(trefferIds);
  const byId = new Map((Array.isArray(kos) ? kos : []).map((k) => [k.id, k]));
  const pf = profileFeatures(profile);
  const alleKandidaten = (search.results || []).map((hit, i) => {
    const ko = byId.get(hit.id) || {};
    return {
      id: `mr-${userId}-${hit.id}`,
      user_id: userId,
      knowledge_object_id: hit.id,
      vorgang_id: hit.vorgang_id || ko.vorgang_id || null,
      similarity: round4(hit.similarity),
      rank: i + 1,
      matched_features: matchedFeatures(pf, knowledgeObjectFeatures(ko)),
      filters: filters || {}
    };
  });

  // ── Relevanzriegel (Befund M-8), DEFAULT AUS ──────────────────────────────
  // Aus = `rows` ist byte-identisch mit `alleKandidaten`, also exakt das
  // bisherige Verhalten. An = es werden nur Treffer veroeffentlicht, die dem
  // Mandat gegenueber begruendbar sind; es wird NICHTS aufgefuellt und NICHTS
  // neu berechnet (Aehnlichkeit, Rang, Reihenfolge, Ergebniskennung und
  // `matched_features` bleiben unangetastet). Begruendung: matching-relevanz.js.
  const relevanz = require("./matching-relevanz");
  const gateAktiv = typeof deps.relevanzGateEnabled === "function" && deps.relevanzGateEnabled() === true;
  const gate = relevanz.wendeRelevanzGateAn(alleKandidaten, { aktiv: gateAktiv });
  const rows = gate.zeilen;

  // ── Ohne Auditpersistenz: exakt das bisherige Verhalten ───────────────────
  if (!audit) {
    const saved = await deps.saveMatchingResults(rows);
    return {
      userId,
      candidates: gate.kandidaten,
      veroeffentlicht: rows.length,
      verworfen: gate.verworfen,
      saved: (saved && saved.saved) || 0,
      filters: filters || {}
    };
  }

  // ── Mit Auditpersistenz ───────────────────────────────────────────────────
  const contract = require("./matching-contract");
  const begruendung = require("./matching-begruendung");
  const recipeVersion = contract.LEGACY_RECIPE_VERSION;
  const vectorVersion = contract.legacyVectorVersion(dim);

  // Eingangszustand je Treffer. Der Eingabehash wird aus GENAU DEN Token
  // gebildet, die dieses Rezept verwendet — eine Aenderung ohne fachlichen
  // Einfluss erzeugt deshalb keinen neuen Hash. Ist das Wissensobjekt seit der
  // Suche verschwunden (geloescht/nicht mehr lesbar), bleibt der Hash `null`;
  // die Aenderungserkennung traegt dann allein die Aehnlichkeit im
  // Kandidatenhash. Das ist ehrlicher als ein Hash ueber ein leeres Objekt.
  // Seit Sprint 23C-2A ist das der einzige verbleibende Fall — nicht mehr der
  // Regelfall eines zu kleinen Ladefensters (Befund M-7).
  const zusatz = new Map();
  const ranking = rows.map((r) => {
    const ko = byId.get(r.knowledge_object_id);
    const koHash = ko
      ? contract.computeKnowledgeObjectInputHash(knowledgeObjectWeightedTokens(ko), recipeVersion)
      : null;
    const signale = begruendung.buildSignals(r.matched_features, r.similarity);
    const eintrag = {
      knowledge_object_id: r.knowledge_object_id,
      vorgang_id: r.vorgang_id,
      result_id: r.id,
      rank: r.rank,
      similarity: r.similarity,
      signale,
      ko_eingabe_hash: koHash,
      ko_version: ko && ko.ko_version != null ? Number(ko.ko_version) : null,
      begruendung: begruendung.begruendungAusSignalen(signale, r.matched_features)
    };
    zusatz.set(r.knowledge_object_id, eintrag);
    return eintrag;
  });

  const auditErgebnis = await audit.auditRun({
    tenantId: userId,
    // Heute traegt ein Mandant genau ein Profil mit derselben Kennung
    // (Sprint 23A §6a). Der Aufrufer darf eine eigene Profilkennung uebergeben —
    // damit blockiert diese Struktur eine spaetere Trennung nicht.
    mandateProfileId: input.mandateProfileId || userId,
    profileHash: pHash,
    engineVersion: contract.LEGACY_ENGINE_VERSION,
    recipeVersion,
    vectorVersion,
    thresholds: { matchCount, schwelle: null, filter: filters || {} },
    ranking,
    ausloeser: input.ausloeser || "unbekannt",
    pipelineRunId: input.pipelineRunId || null,
    startedAt,
    // Ehrliche Trennung: `kandidaten` = was die Suche geliefert hat,
    // `berechnet`/`veroeffentlicht` = was den Riegel passiert hat. Ist der
    // Riegel aus, sind beide Zahlen wie bisher gleich. Der Vertrag
    // (`matching-contract`) bleibt UNVERAENDERT — insbesondere wird
    // `schwellenwerte` nicht erweitert, damit sich der Eingabefingerabdruck
    // eines Laufs OHNE Riegel nicht veraendert.
    kandidaten: gate.kandidaten,
    // REINE Funktion: baut die operative Projektion, sobald die Laufkennung
    // feststeht. Sie schreibt nichts — die Auditschicht uebergibt das Ergebnis
    // unveraendert an die EINE atomare Veroeffentlichung. Die fachlichen Felder
    // (id, user_id, knowledge_object_id, vorgang_id, similarity, rank,
    // matched_features, filters) werden dabei NICHT angefasst.
    buildRows: ({ runId, descriptor }) => {
      const jetzt = new Date().toISOString();
      return rows.map((r) => {
        const z = zusatz.get(r.knowledge_object_id) || {};
        return {
          ...r,
          run_id: runId,
          profil_hash: pHash,
          ko_eingabe_hash: z.ko_eingabe_hash || null,
          ko_version: z.ko_version != null ? z.ko_version : null,
          engine_version: contract.LEGACY_ENGINE_VERSION,
          rezept_version: recipeVersion,
          vektor_version: vectorVersion,
          eingabe_fingerabdruck: descriptor.fingerprint,
          berechnet_am: jetzt,
          signale: z.signale || {},
          begruendung: z.begruendung || null,
          updated_at: jetzt
        };
      });
    }
  });

  return {
    userId,
    candidates: gate.kandidaten,
    veroeffentlicht: rows.length,
    verworfen: gate.verworfen,
    saved: auditErgebnis.veroeffentlicht,
    filters: filters || {},
    audit: {
      runId: auditErgebnis.runId,
      status: auditErgebnis.status,
      idempotent: auditErgebnis.idempotent,
      fingerprint: auditErgebnis.fingerprint,
      abgeloest: auditErgebnis.abgeloest,
      wiederholungen: auditErgebnis.wiederholungen
    }
  };
}

module.exports = {
  EMBEDDING_DIM,
  slug,
  normalizeCommittee,
  normalizeParty,
  slugCommittee,
  slugParty,
  committeeMatchKey,
  // Institutioneller Zustaendigkeitsraum (Befund 27A-1) — exportiert, damit die
  // Regel einzeln pruefbar ist und nicht nur ueber matchedFeatures beobachtbar.
  profileZustaendigkeit,
  knowledgeObjectZustaendigkeit,
  ausschussBelegZulaessig,
  derivePolicyFields,
  POLICY_FIELD_LABELS,
  cosineSimilarity,
  profileFeatures,
  knowledgeObjectFeatures,
  embedProfile,
  embedKnowledgeObject,
  // Ehrlich benannte Aliase (Sprint 2 Nachschaerfung): Feature-/Merkmalsvektor, KEIN
  // semantisches Embedding. Neuer Code sollte diese Namen verwenden.
  computeFeatureVectorForKnowledgeObject,
  computeFeatureVectorForProfile,
  profileHash,
  passesFilters,
  matchedFeatures,
  matchProfileToKnowledgeObjects,
  runMatchingShadow,
  defaultDeps
};
