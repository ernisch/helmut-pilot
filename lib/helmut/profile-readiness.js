"use strict";

// Zentrale BUNDESTAGS-Bereitschaftspruefung fuer Mandatsprofile (Sprint "Profilreife",
// 2026-08-04). Baut AUF validateProfile (profile-validation.js) auf und ersetzt sie
// NICHT — keine zweite konkurrierende Wahrheit: die Grundzustaende (vollstaendig/
// teilweise/nicht_bereit/fehlerhaft/deaktiviert) kommen weiterhin von dort.
//
// Diese Datei ergaenzt genau die Achsen, die validateProfile bewusst nicht prueft,
// deren Fehlen aber belegbar Produktschaden erzeugt (jede Regel nennt ihren
// Codeverbraucher — keine erfundenen Pflichtfelder):
//
//   * Klarname statt Slug        -> scheduler.personNewsSource baut die Radar-/
//                                   Personensuche woertlich aus fullName; ein Slug
//                                   ("max-mustermann") ergibt eine unbrauchbare Query.
//   * Ausschuesse in der WP-21-   -> Radar-Ausschussbeleg + Ausschuss-Themenradar
//     Sollmenge aufloesbar          (scheduler.mandateNewsSources Nr. 4, matching);
//                                   ein Ausschuss einer frueheren Wahlperiode erzeugt
//                                   falsche Zustaendigkeitsbelege.
//   * doppelte/widerspruechliche -> dedupeSourcesById schuetzt nur gleiche IDs;
//     Angaben                       gleiche Klarnamen auf ZWEI Mandaten erzeugen
//                                   zwei getrennte Personenquellen mit identischer
//                                   Query (Vermischungsrisiko zwischen Mandaten).
//
// VERBINDLICHE TRENNUNG (Auftrag 2026-08-04): Mandatsprofil != Benutzerkonto !=
// aktive Verarbeitung. Diese Pruefung liest KEINE Konten, KEINE E-Mails, KEINE
// Auth-Daten — ein Profil ist ohne Benutzerkonto datenmotorfaehig. Der
// Aktivierungszustand (profileActive) wird getrennt vom Inhalt bewertet, damit
// ein vollstaendiges, bewusst deaktiviertes Testprofil als "inhaltlich bereit,
// deaktiviert" erscheint statt als Fehler.
//
// DETERMINISTISCH: kein Netz, kein Storage, keine Uhrzeit; alle Listen werden
// stabil sortiert ausgegeben. Keine Daten werden veraendert oder ergaenzt.

const { validateProfile } = require("./profile-validation");
const { parliamentTypeOf } = require("./config");
const { normalizeParty } = require("./matching");
const {
  WAHLPERIODE,
  STAENDIGE_AUSSCHUESSE,
  veralteteBezeichnung
} = require("./quellenarchitektur/seeds/bundestag-ausschuesse");

// --- Feldklassen des Profilvertrags (kanonische Doku:
// docs/multitenancy-profilbereitschaft-bundestag.md) ---------------------------
const FELDKLASSEN = Object.freeze({
  TECHNISCH: "technisch_zwingend",
  FACHLICH: "fachlich_zwingend",
  EMPFOHLEN: "empfohlen",
  KEIN_PROFILFELD: "nicht_teil_des_mandatsprofils"
});

function hasStr(v) { return String(v == null ? "" : v).trim().length > 0; }
function trimStr(v) { return String(v == null ? "" : v).trim(); }
function listOf(v) {
  return (Array.isArray(v) ? v : []).map((x) => trimStr(x)).filter(Boolean);
}
function sortiert(arr) { return [...arr].sort((a, b) => String(a).localeCompare(String(b), "de")); }

// Umlaut-Faltung wie matching.js, lokal gehalten (kein Export dort).
function falte(s) {
  return String(s == null ? "" : s).toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

// --- Klarname vs. Slug -------------------------------------------------------
// personNewsSource setzt die Suchquery woertlich aus fullName zusammen. Ein
// Klarname hat mindestens zwei Wortbestandteile und ist nicht der Mandats-Slug.
function istKlarname(profile = {}) {
  const name = trimStr(profile.fullName || profile.name);
  if (!name) return false;
  if (name === trimStr(profile.id)) return false;              // exakt der Slug
  if (!/\s/.test(name)) return false;                          // ein einzelnes Wort/Slug
  return true;
}

// --- Ausschuss-Aufloesung gegen die WP-21-Sollmenge --------------------------
// Deterministischer Abgleich einer gespeicherten Bezeichnung ("Gesundheit",
// "Kultur und Medien", "Ausschuss fuer Finanzen") gegen die extern verankerte
// Sollmenge (seeds/bundestag-ausschuesse.js). Regel: alle bedeutungstragenden
// Woerter der Angabe muessen in Name ODER Kennung GENAU EINES Ausschusses
// vorkommen. Nicht aufloesbar oder mehrdeutig -> keine Zuordnung.
const STOPWOERTER = new Set(["und", "fuer", "der", "die", "das", "des", "im", "in", "ausschuss"]);
function ausschussTokens(text) {
  return falte(text)
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOPWOERTER.has(t));
}
const AUSSCHUSS_TOKENMENGEN = STAENDIGE_AUSSCHUESSE.map((a) => ({
  key: a.key,
  name: a.name,
  tokens: new Set([...ausschussTokens(a.name), ...ausschussTokens(a.key.replace(/-/g, " "))])
}));

function resolveBundestagsausschuss(bezeichnung) {
  const tokens = ausschussTokens(bezeichnung);
  if (!tokens.length) return { ok: false, grund: "leer", eingabe: trimStr(bezeichnung) };

  // VERALTETE BEZEICHNUNGEN ZUERST — und zwar ABWEISEND (Befund 03.09.).
  // -------------------------------------------------------------------------
  // Bisher wurde `veralteteBezeichnung` NUR im Fehlerzweig gelesen, um die
  // Begruendung zu formulieren. Damit konnte sie faktisch nie feuern: eine
  // veraltete Bezeichnung, die sich ueber Tokens aufloesen laesst, kam gar nicht
  // erst dorthin. Gemessen wurden DREI der vier dokumentierten WP-20-Namen als
  // GUELTIG akzeptiert:
  //   "Ausschuss fuer Inneres und Heimat"        -> inneres-heimat
  //   "Ausschuss fuer Digitales"                 -> digitales-staatsmodernisierung
  //   "Ausschuss fuer Ernaehrung und Landwirtschaft" -> landwirtschaft-ernaehrung-heimat
  // Ursache ist kein Zufall, sondern Absicht an anderer Stelle: die STABILE
  // Kennung wird bei einer Umbenennung bewusst NICHT mitgezogen (der
  // Innenausschuss heisst weiter `inneres-heimat`), und mehrere WP-21-Namen sind
  // Obermengen ihrer Vorgaenger ("Digitales" ⊂ "Digitales und
  // Staatsmodernisierung"). Der Tokenabgleich musste sie deshalb treffen.
  //
  // Die Sollmenge fuehrt `VERALTETE_AUSSCHUSSNAMEN` ausdruecklich als
  // Negativkontrolle ("muss die Pruefung rot machen, auch wenn die Gesamtzahl
  // stimmt") — angewandt wurde sie aber nur auf den KATALOG
  // (`vergleicheMitSollmenge`), nie auf ein PROFIL. Genau das ist hier
  // nachgeholt: ein Profil mit einem Ausschuss einer frueheren Wahlperiode gilt
  // NICHT mehr als reif. Das ist eine VERSCHAERFUNG der Sperre, keine Lockerung
  // — sie verhindert genau die falschen Zustaendigkeitsbelege im Radar, gegen
  // die diese Pruefung gebaut wurde.
  //
  // Abgeglichen wird der EXAKTE amtliche Name der frueheren Wahlperiode; ein
  // gueltiger WP-21-Name kann dadurch nicht getroffen werden (die Sollmenge
  // stellt in `validateSollmenge` sicher, dass keiner ihrer Namen in der
  // Veraltet-Liste steht).
  const veraltet = veralteteBezeichnung(bezeichnung);
  if (veraltet) {
    return {
      ok: false,
      grund: `veraltet (WP ${veraltet.wahlperiode})`,
      eingabe: trimStr(bezeichnung)
    };
  }

  const treffer = AUSSCHUSS_TOKENMENGEN.filter((a) => tokens.every((t) => a.tokens.has(t)));
  if (treffer.length === 1) {
    return { ok: true, key: treffer[0].key, name: treffer[0].name, eingabe: trimStr(bezeichnung) };
  }
  return {
    ok: false,
    grund: treffer.length > 1 ? "mehrdeutig" : "nicht in der Sollmenge",
    eingabe: trimStr(bezeichnung)
  };
}

// --- Duplikate/Widersprueche INNERHALB eines Profils -------------------------
function doppelteEintraege(liste) {
  const gesehen = new Map();
  const doppelt = [];
  for (const eintrag of listOf(liste)) {
    const key = falte(eintrag);
    if (gesehen.has(key)) doppelt.push(eintrag);
    else gesehen.set(key, eintrag);
  }
  return doppelt;
}

// Rollenfloskeln in THEMEN-Feldern (berichterstatter_themen soll Fachthemen
// tragen; "Sprecher/in der Fraktion" ist eine Funktion, kein Thema — die Angabe
// speist sonst als Pseudo-Thema die Quellen-Queries, scheduler.topProfileTopics).
const ROLLENFLOSKEL = /\b(sprecher|obmann|obfrau|obleute|vorsitz|stellvertret)\w*/i;

// --- Kernbewertung EINES Bundestagsprofils -----------------------------------
// Rueckgabe (alle Listen stabil sortiert):
//   {
//     zutreffend,           // false, wenn kein Bundestagsprofil (Landtag wird NICHT vermischt)
//     bereit,               // Inhalt vollstaendig + keine ungueltigen Angaben
//     aktiv,                // Lifecycle (getrennt vom Inhalt)
//     basis,                // validateProfile-Ergebnis (eine Quelle der Wahrheit)
//     fehlend: [{feld, klasse, verbraucher}],
//     ungueltig: [{feld, wert, grund}],
//     warnungen: [{feld, hinweis}],
//     duplikate: [...], widersprueche: [...],
//     betroffeneFunktionen: [...], hinweise: [...]
//   }
function bewerteBundestagsprofil(profile = {}) {
  const p = profile && typeof profile === "object" ? profile : {};
  const ebene = parliamentTypeOf(p);
  const basis = validateProfile(p);

  if (ebene !== "Bundestag") {
    return {
      zutreffend: false,
      bereit: false,
      aktiv: !basis.disabled,
      basis,
      fehlend: ebene ? [] : [{ feld: "mandatsebene", klasse: FELDKLASSEN.TECHNISCH, verbraucher: "resolveProfilePackages (Pflicht-Basispaket), Landesmodul-Gate" }],
      ungueltig: [],
      warnungen: [],
      duplikate: [],
      widersprueche: [],
      betroffeneFunktionen: [],
      hinweise: [ebene === "Landtag"
        ? "Landtagsprofil — die Bundestags-Bereitschaftspruefung ist nicht zustaendig (keine Vermischung; validateProfile gilt weiter)."
        : "Mandatsebene fehlt oder ist ungueltig — Bundestag/Landtag muss aus parliamentType/politicalLevel/politische_ebene ableitbar sein."]
    };
  }

  const fehlend = [];
  const ungueltig = [];
  const warnungen = [];
  const duplikate = [];
  const widersprueche = [];
  const hinweise = [];

  // -- technisch zwingend -----------------------------------------------------
  if (!hasStr(p.id)) {
    fehlend.push({ feld: "id", klasse: FELDKLASSEN.TECHNISCH, verbraucher: "storage (profiles.id/user_id), assertTenant-Filter, Quellen-IDs (`<id>-news`)" });
  }
  for (const b of basis.budgetProblems || []) {
    ungueltig.push({ feld: b.field, wert: String(b.value), grund: "KI-Budget muss eine positive Ganzzahl sein (DB-CHECK, validateProfile: fehlerhaft)" });
  }

  // -- fachlich zwingend ------------------------------------------------------
  if (!istKlarname(p)) {
    if (hasStr(p.fullName) || hasStr(p.name)) {
      ungueltig.push({
        feld: "fullName",
        wert: trimStr(p.fullName || p.name),
        grund: "kein Klarname (Slug/Einzelwort) — personNewsSource baut daraus die woertliche Personensuche; Radar/Personenquelle liefert damit falsche oder leere Treffer"
      });
    } else {
      fehlend.push({ feld: "fullName", klasse: FELDKLASSEN.FACHLICH, verbraucher: "personNewsSource (Radar-Personensuche), impact.kannRadar" });
    }
  }
  if (!hasStr(p.party) && !hasStr(p.faction)) {
    fehlend.push({ feld: "partei_oder_fraktionslos", klasse: FELDKLASSEN.FACHLICH, verbraucher: "Matching-Parteidimension, Fraktions-/Partei-Quelle (mandateNewsSources Nr. 2), Parteipakete" });
  }
  if (!hasStr(p.constituency) && !hasStr(p.wahlkreis) && !hasStr(p.state) && !hasStr(p.location) && !hasStr(p.regionNote)) {
    fehlend.push({ feld: "region_oder_wahlkreis", klasse: FELDKLASSEN.FACHLICH, verbraucher: "Regionale Lage (mandateNewsSources Nr. 7), Radar-Wahlkreisbezug" });
  }
  const ausschuesse = listOf(p.committees && p.committees.length ? p.committees : (p.committee ? [p.committee] : []));
  const themen = listOf(p.focusTopics);
  const prioritaeten = p.topicPriorities && typeof p.topicPriorities === "object" ? Object.keys(p.topicPriorities) : [];
  if (!ausschuesse.length && !themen.length && !prioritaeten.length) {
    fehlend.push({ feld: "schwerpunkt_oder_ausschuss", klasse: FELDKLASSEN.FACHLICH, verbraucher: "Matching-Themendimension, Regierungs-/Themen-/Ausschussquellen (mandateNewsSources Nr. 1/4/5)" });
  }

  // Angegebene Ausschuesse muessen in der WP-21-Sollmenge aufloesbar sein — das gilt
  // fuer ORDENTLICHE und STELLVERTRETENDE Mitgliedschaften gleichermassen: auch ein
  // veralteter/unbekannter Eintrag in deputyCommittees speist Zustaendigkeitsbelege
  // und Paket-/Matching-Kontexte (profileFieldset liest stellvertretende_ausschuesse)
  // und darf nicht unbemerkt als bereit gelten (Korrekturauftrag 2026-08-04).
  for (const [feld, liste] of [["committees", ausschuesse], ["deputyCommittees", listOf(p.deputyCommittees)]]) {
    for (const bezeichnung of liste) {
      const r = resolveBundestagsausschuss(bezeichnung);
      if (!r.ok) {
        ungueltig.push({
          feld,
          wert: bezeichnung,
          grund: `nicht als staendiger Ausschuss der ${WAHLPERIODE}. Wahlperiode aufloesbar (${r.grund}) — erzeugt falsche Zustaendigkeitsbelege im Radar und ein leeres Ausschuss-Themenradar`
        });
      }
    }
  }

  // -- Duplikate/Widersprueche ------------------------------------------------
  for (const [feld, liste] of [["committees", ausschuesse], ["focusTopics", themen], ["deputyCommittees", listOf(p.deputyCommittees)], ["nameVariants", listOf(p.nameVariants)], ["regionalInterests", listOf(p.regionalInterests)]]) {
    for (const wert of doppelteEintraege(liste)) duplikate.push({ feld, wert });
  }
  const stvKeys = new Set(listOf(p.deputyCommittees).map((a) => falte(a)));
  for (const a of ausschuesse) {
    if (stvKeys.has(falte(a))) widersprueche.push({ feld: "committees/deputyCommittees", wert: a, grund: "zugleich ordentliches und stellvertretendes Mitglied angegeben" });
  }
  if (hasStr(p.party) && hasStr(p.faction)) {
    const np = normalizeParty(p.party);
    const nf = normalizeParty(p.faction);
    // Fraktionsbezeichnungen wie "SPD (Bundestag 2025 - 2029)" enthalten die Partei —
    // nur ein ECHTER Widerspruch (beide als bekannte, verschiedene Parteien) zaehlt.
    // Fraktionsgemeinschaft CDU/CSU: Partei CDU ODER CSU gehoert zur Fraktion
    // "CDU/CSU" (normalizeParty -> "union"; Sollmenge: parlamentszusammensetzung).
    const unionsFraktion = (nf === "union" || nf === "cdu-csu") && (np === "cdu" || np === "csu");
    if (np && nf && np !== nf && !nf.includes(np) && !np.includes(nf) && !unionsFraktion) {
      widersprueche.push({ feld: "party/faction", wert: `${p.party} / ${p.faction}`, grund: "Partei und Fraktion widersprechen sich" });
    }
  }
  for (const feld of ["reportingTopics", "focusTopics"]) {
    for (const eintrag of listOf(p[feld])) {
      if (ROLLENFLOSKEL.test(eintrag)) {
        widersprueche.push({ feld, wert: eintrag, grund: "Funktionsbezeichnung im Themenfeld — gehoert nach rolle/function, sonst speist sie als Pseudo-Thema die Quellen-Queries" });
      }
    }
  }

  // -- empfohlen (Warnungen, keine Blocker) -----------------------------------
  if (!hasStr(p.state)) warnungen.push({ feld: "state", hinweis: "Bundesland fehlt — Regionalpaket-Zuordnung und geteilter Regionalfilter (sourceProfileContext.regions) bleiben schwaecher" });
  if (!ausschuesse.length) warnungen.push({ feld: "committees", hinweis: "kein Ausschuss — Ausschuss-Themenradar (Quelle Nr. 4) und Radar-Ausschussbeleg entfallen" });
  if (!themen.length && !prioritaeten.length) warnungen.push({ feld: "focusTopics", hinweis: "keine Themen — Regierungs-/Themenquellen (Nr. 1/5) entfallen" });
  else if (!prioritaeten.length) warnungen.push({ feld: "topicPriorities", hinweis: "keine Themen-Prioritaeten — Priorisierung faellt auf ungewichtete Themen zurueck" });
  if (!listOf(p.nameVariants).length) warnungen.push({ feld: "nameVariants", hinweis: "keine Namensvarianten — Radar-Recall bei abweichenden Schreibweisen geringer" });
  if (!listOf(p.regionalInterests).length && !hasStr(p.constituency) && !hasStr(p.wahlkreis)) {
    warnungen.push({ feld: "regionalInterests", hinweis: "weder Wahlkreis noch regionale Interessen — Regionale Lage (Quelle Nr. 7) entfaellt" });
  }

  // -- Ergebnis ---------------------------------------------------------------
  const bereit = fehlend.length === 0 && ungueltig.length === 0 && widersprueche.length === 0;
  const betroffeneFunktionen = sortiert([...new Set([
    ...fehlend.map((f) => funktionFuerFeld(f.feld)),
    ...ungueltig.map((u) => funktionFuerFeld(u.feld))
  ].flat())]);
  if (!bereit) {
    for (const f of fehlend) hinweise.push(`Feld „${f.feld}" ergaenzen (${f.klasse}) — Verbraucher: ${f.verbraucher}`);
    for (const u of ungueltig) hinweise.push(`Feld „${u.feld}" korrigieren: „${u.wert}" — ${u.grund}`);
    for (const w of widersprueche) hinweise.push(`Widerspruch in „${w.feld}" aufloesen: „${w.wert}" — ${w.grund}`);
  }

  return {
    zutreffend: true,
    bereit,
    aktiv: !basis.disabled,
    basis,
    fehlend: fehlend.sort((a, b) => a.feld.localeCompare(b.feld, "de")),
    ungueltig: ungueltig.sort((a, b) => (a.feld + a.wert).localeCompare(b.feld + b.wert, "de")),
    warnungen: warnungen.sort((a, b) => a.feld.localeCompare(b.feld, "de")),
    duplikate: duplikate.sort((a, b) => (a.feld + a.wert).localeCompare(b.feld + b.wert, "de")),
    widersprueche: widersprueche.sort((a, b) => (a.feld + a.wert).localeCompare(b.feld + b.wert, "de")),
    betroffeneFunktionen,
    hinweise
  };
}

// Welche Produktfunktion haengt an welchem Feld? (Belegte Zuordnung, siehe Doku.)
function funktionFuerFeld(feld) {
  const map = {
    id: ["alle (Mandantentrennung)"],
    fullName: ["Radar (Personensuche)"],
    partei_oder_fraktionslos: ["Matching", "Lage", "Briefing"],
    region_oder_wahlkreis: ["Radar (Wahlkreis)", "Regionale Lage"],
    schwerpunkt_oder_ausschuss: ["Matching", "Briefing", "Lage"],
    committees: ["Radar (Ausschussbeleg)", "Ausschuss-Themenradar"],
    deputyCommittees: ["Radar (Ausschussbeleg)", "Ausschuss-Themenradar"],
    aiBudgetDailyCents: ["KI-Verarbeitung (Budget-Gate)"],
    aiBudgetMonthlyCents: ["KI-Verarbeitung (Budget-Gate)"],
    mandatsebene: ["Quellenpakete", "Matching"]
  };
  return map[feld] || ["Qualitaet"];
}

// --- Bestandsbewertung MEHRERER Profile (Mandantentrennung/Vermischung) ------
// profiles: Profil-Objekte (gemappte Form). opts.personalSources (optional):
//   [{ profileId, id, query|url }] — mandatseigene Quellen (z. B. relationale
//   profil-<id>-Pakete). Geteilte Quellen gehoeren hier NICHT hinein und werden
//   nie als Duplikat gewertet.
function bewerteProfilbestand(profiles = [], opts = {}) {
  const liste = (Array.isArray(profiles) ? profiles : []).filter((p) => p && typeof p === "object");
  const probleme = [];
  const warnungen = [];

  // 1) Eindeutige Kennungen.
  const nachId = new Map();
  for (const p of liste) {
    const id = trimStr(p.id);
    if (!id) { probleme.push({ art: "kennung_fehlt", profil: "(ohne id)", detail: "Profil ohne id ist nicht referenzierbar" }); continue; }
    if (nachId.has(id)) probleme.push({ art: "kennung_doppelt", profil: id, detail: "doppelte Profil-Kennung im Bestand" });
    else nachId.set(id, p);
  }

  // 2) Gleicher Klarname auf mehreren Mandaten -> identische Personensuche
  //    (personNewsSource) auf zwei Mandaten = Vermischungsrisiko.
  const nachName = new Map();
  for (const [id, p] of nachId) {
    const name = falte(trimStr(p.fullName || p.name));
    if (!name || !/\s/.test(name)) continue; // Slugs behandelt die Einzelpruefung
    if (!nachName.has(name)) nachName.set(name, []);
    nachName.get(name).push({ id, aktiv: p.profileActive !== false && !p.deletedAt && !p.geloescht_at });
  }
  for (const [name, traeger] of nachName) {
    if (traeger.length < 2) continue;
    const aktive = traeger.filter((t) => t.aktiv);
    const eintrag = {
      art: "personenname_doppelt",
      profil: sortiert(traeger.map((t) => t.id)).join(", "),
      detail: `Klarname „${name}" auf ${traeger.length} Mandaten — personNewsSource erzeugt identische Personensuchen; Treffer der einen Person fliessen in mehrere Mandate`
    };
    if (aktive.length >= 2) probleme.push(eintrag);
    else warnungen.push(eintrag);
  }

  // 3) Mandatseigene Quellen: falsche Zuordnung/Vermischung. Eine eigene Quelle,
  //    deren Query den Klarnamen eines ANDEREN Profils enthaelt, ist eine
  //    Fehlzuordnung. Geteilte Quellen sind hier nicht enthalten (zulaessig).
  const eigeneQuellen = Array.isArray(opts.personalSources) ? opts.personalSources : [];
  for (const q of eigeneQuellen) {
    const inhaber = trimStr(q.profileId);
    const text = falte(decodeURIComponentSafe(trimStr(q.query || q.url)));
    if (!inhaber || !text) continue;
    for (const [id, p] of nachId) {
      if (id === inhaber) continue;
      const fremderName = falte(trimStr(p.fullName || p.name));
      if (fremderName && /\s/.test(fremderName) && text.includes(fremderName)) {
        probleme.push({
          art: "quelle_falsch_zugeordnet",
          profil: inhaber,
          detail: `eigene Quelle ${trimStr(q.id) || "(ohne id)"} sucht nach „${fremderName}" (Profil ${id}) — Vermischung zwischen Mandaten`
        });
      }
    }
    // Eigene Quelle muss zum Inhaber gehoeren (Konvention `<id>-…` bzw. `rp-<id>-…`).
    const qid = trimStr(q.id);
    if (qid && !qid.includes(inhaber)) {
      warnungen.push({ art: "quellen_id_konvention", profil: inhaber, detail: `eigene Quelle ${qid} traegt die Inhaber-Kennung nicht — Zuordnung nicht pruefbar` });
    }
  }

  // 4) Doppelte eigene Quellen JE Profil (gleiche Query zweimal fuer denselben
  //    Inhaber). Gleiche Query bei VERSCHIEDENEN Inhabern ist Fall 2/3, nicht hier.
  const queriesJeInhaber = new Map();
  for (const q of eigeneQuellen) {
    const inhaber = trimStr(q.profileId);
    const text = falte(decodeURIComponentSafe(trimStr(q.query || q.url)));
    if (!inhaber || !text) continue;
    const key = `${inhaber} ${text}`;
    if (queriesJeInhaber.has(key)) {
      probleme.push({ art: "quelle_doppelt", profil: inhaber, detail: `eigene Quelle doppelt (gleiche Query): ${trimStr(q.id) || text.slice(0, 60)}` });
    } else {
      queriesJeInhaber.set(key, q);
    }
  }

  // 5) Ebenen-Trennung: Bundestag- und Landtagsprofile werden getrennt gezaehlt;
  //    die Bundestagspruefung wird NIE auf Landtagsprofile angewendet.
  const bundestag = [];
  const landtag = [];
  const ohneEbene = [];
  for (const [id, p] of nachId) {
    const ebene = parliamentTypeOf(p);
    if (ebene === "Bundestag") bundestag.push(id);
    else if (ebene === "Landtag") landtag.push(id);
    else ohneEbene.push(id);
  }
  for (const id of sortiert(ohneEbene)) {
    probleme.push({ art: "mandatsebene_fehlt", profil: id, detail: "keine Mandatsebene ableitbar — Paketzuordnung und Ebenen-Trennung unbestimmt" });
  }

  const sortByProfil = (a, b) => (a.art + a.profil).localeCompare(b.art + b.profil, "de");
  return {
    anzahl: nachId.size,
    bundestag: sortiert(bundestag),
    landtag: sortiert(landtag),
    ohneEbene: sortiert(ohneEbene),
    probleme: probleme.sort(sortByProfil),
    warnungen: warnungen.sort(sortByProfil),
    ok: probleme.length === 0
  };
}

function decodeURIComponentSafe(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

// --- Harte Sperre fuer den NEUEN Aktivierungsuebergang -----------------------
// Gilt an den Stellen, die ein NEUES Mandatsprofil anlegen/aktivieren
// (provisioning.provisionTenant). BESTEHENDE aktive Profile werden hierueber
// NICHT bewertet — fuer sie gilt weiterhin nur validateProfile im jeweiligen
// Verarbeitungsschritt (keine automatische Deaktivierung, keine geaenderte
// Verarbeitung; Auftrag Phase 4 Nr. 5-7).
function pruefeNeuaktivierung(profile = {}) {
  const ebene = parliamentTypeOf(profile);
  if (ebene !== "Bundestag") {
    // Landtag/unbestimmt: unveraenderte Altregel (validateProfile in provisioning).
    return { zutreffend: false, zulaessig: true, fehler: [] };
  }
  const ergebnis = bewerteBundestagsprofil(profile);
  const fehler = [];
  for (const f of ergebnis.fehlend) fehler.push(`Pflichtangabe fehlt: ${f.feld} (${f.klasse}; Verbraucher: ${f.verbraucher})`);
  for (const u of ergebnis.ungueltig) fehler.push(`Ungueltige Angabe: ${u.feld} = „${u.wert}" — ${u.grund}`);
  for (const w of ergebnis.widersprueche) fehler.push(`Widerspruch: ${w.feld} — „${w.wert}" (${w.grund})`);
  return { zutreffend: true, zulaessig: fehler.length === 0, fehler, ergebnis };
}

module.exports = {
  FELDKLASSEN,
  WAHLPERIODE,
  istKlarname,
  resolveBundestagsausschuss,
  bewerteBundestagsprofil,
  bewerteProfilbestand,
  pruefeNeuaktivierung
};
