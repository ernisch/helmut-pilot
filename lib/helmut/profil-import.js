"use strict";

// Helmut — IMPORTVERTRAG FÜR MANDATSPROFILE (OP-30, Vorbereitung auf 200 Mandate).
// =============================================================================================
// WOZU: bevor 200 echte Profile recherchiert werden, muss feststehen, WAS genau ein Profil
// tragen muss, damit Helmut es versorgen kann. Sonst entsteht Rechercheaufwand für Felder,
// die niemand liest — oder, schlimmer, ein Profil, das technisch importiert wird und dann
// leere Briefings erzeugt.
//
// DIE FELDER SIND NICHT ERFUNDEN. Sie sind aus dem TATSÄCHLICH verwendeten Code abgeleitet:
//   * `profile-validation.validateProfile` — was ein Profil "vollstaendig" macht,
//   * `config.parliamentTypeOf` / `config.profileCompleteness` — Mandatsebene und Achsen,
//   * `scheduler.personNewsSource` — der Vollname geht WÖRTLICH in die Personensuche,
//   * `scheduler.mandateNewsSources` — Partei, Fraktion, Ausschüsse, Themen, Wahlkreis,
//     Bundesland, regionale Interessen und Ministerien erzeugen je eine Quellenlinie.
// Maschinenlesbar: `schemas/mandatsprofil-import.schema.json`.
//
// >>> ZWEI HARTE REGELN <<<
//   1. IMPORT AKTIVIERT NIE. Jedes importierte Profil ist `aktiv: false`. Aktivieren ist eine
//      getrennte, freigabepflichtige Betreiberentscheidung (CLAUDE.md §5). Ein Datensatz mit
//      `aktiv: true` wird ABGELEHNT, nicht stillschweigend korrigiert — sonst wäre die
//      Zusage eine Absichtserklärung statt einer Sperre.
//   2. BELEGPFLICHT. Ohne amtliche Profilseite des richtigen Parlaments kein Import
//      (CLAUDE.md §4.3). Eine Suchseite ist kein Beleg.
//
// KEIN MANDANT IST HARTKODIERT (CLAUDE.md §4.2). Dieses Modul kennt keine Namen, keine IDs
// und keine Sonderfälle — nur Regeln.
//
// Dieses Modul SCHREIBT NICHTS. Es prüft und meldet. Das Anlegen von Mandanten ist und bleibt
// `provisioning.js` und damit eine bewusste Betreiberhandlung.

const VERTRAGSVERSION = "helmut-mandatsprofil/1";

// Welcher Host belegt welches Parlament? Der Beleg muss VOM PARLAMENT kommen — die Website
// der Fraktion oder der Partei ist eine Selbstauskunft, kein amtliches Verzeichnis.
const AMTLICHE_HOSTS = Object.freeze({
  "bundestag": ["bundestag.de"],
  "landtag-berlin": ["parlament-berlin.de"],
  "landtag-brandenburg": ["landtag.brandenburg.de"]
});

// Die Mandatsebene, die `config.parliamentTypeOf` aus dem Profil ableiten wird.
const EBENE = Object.freeze({
  "bundestag": "bundestag",
  "landtag-berlin": "landtag",
  "landtag-brandenburg": "landtag"
});

// Bei Landtagsmandaten steht das Bundesland fest. Ein Brandenburger Mandat mit Bundesland
// "Bayern" ist kein Tippfehler, den man durchwinken darf — es ist ein Rechercheerfehler.
const PFLICHT_BUNDESLAND = Object.freeze({
  "landtag-berlin": "berlin",
  "landtag-brandenburg": "brandenburg"
});

const ID_MUSTER = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const PFLICHTFELDER = Object.freeze([
  "mandatsId", "vollname", "parlament", "bundesland", "aktiv", "offizielleQuellen"
]);

// Alle im Vertrag erlaubten Felder. Ein unbekanntes Feld ist ein Fehler und kein Extra:
// es bedeutet fast immer, dass jemand recherchiert hat, was Helmut nie liest.
const ERLAUBTE_FELDER = Object.freeze([
  ...PFLICHTFELDER,
  "namensvarianten", "partei", "fraktion", "fraktionslos", "wahlkreis", "listenmandat",
  "regionHinweis", "ausschuesse", "stellvertretendeAusschuesse", "themen",
  "berichterstatterThemen", "funktionen", "regierungsrolle", "regionaleThemen",
  "relevanteMinisterien", "kiBudgetTaeglichCent", "kiBudgetMonatlichCent", "notiz"
]);

const OPTIONALE_FELDER = Object.freeze(ERLAUBTE_FELDER.filter((f) => !PFLICHTFELDER.includes(f)));

function text(v) { return String(v == null ? "" : v).trim(); }
function istListe(v) { return Array.isArray(v) && v.some((x) => text(x)); }
function normal(v) { return text(v).toLowerCase().replace(/\s+/g, " "); }

function host(url) {
  try { return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, ""); } catch (_) { return ""; }
}

function istUnterHost(h, erlaubt) {
  return erlaubt.some((e) => h === e || h.endsWith(`.${e}`));
}

// Ein Befund. `feld` zeigt auf die Stelle, `hinweis` sagt, was zu tun ist — eine
// Fehlermeldung, mit der niemand etwas anfangen kann, ist ein halber Fehler.
function befund(schwere, code, feld, text_, hinweis) {
  return { schwere, code, feld, text: text_, hinweis };
}

// ── Prüfung EINES Profils ────────────────────────────────────────────────────────────────
function pruefeProfil(roh, { index = 0 } = {}) {
  const fehler = [];
  const warnungen = [];
  const p = roh && typeof roh === "object" && !Array.isArray(roh) ? roh : null;
  if (!p) {
    return {
      index, mandatsId: null, ok: false,
      fehler: [befund("fehler", "kein-objekt", null, "Der Eintrag ist kein Objekt.",
        "Jeder Eintrag in `profile` muss ein JSON-Objekt sein.")],
      warnungen: []
    };
  }

  // 1 · Unbekannte und fehlende Felder
  for (const feld of Object.keys(p)) {
    if (!ERLAUBTE_FELDER.includes(feld)) {
      fehler.push(befund("fehler", "unbekanntes-feld", feld,
        `Das Feld \`${feld}\` gehört nicht zum Vertrag.`,
        `Erlaubt sind: ${ERLAUBTE_FELDER.join(", ")}. Ein unbekanntes Feld wird von Helmut nie gelesen — die Recherche dafür wäre verloren.`));
    }
  }
  for (const feld of PFLICHTFELDER) {
    if (p[feld] === undefined) {
      fehler.push(befund("fehler", "pflichtfeld-fehlt", feld,
        `Das Pflichtfeld \`${feld}\` fehlt.`,
        "Ohne dieses Feld kann das Profil nicht importiert werden."));
    }
  }

  // 2 · Stabile technische Kennung
  const id = text(p.mandatsId);
  if (p.mandatsId !== undefined) {
    if (!ID_MUSTER.test(id)) {
      fehler.push(befund("fehler", "id-ungueltig", "mandatsId",
        `\`${id || "(leer)"}\` ist keine gültige Mandatskennung.`,
        "Erlaubt sind Kleinbuchstaben, Ziffern und einzelne Bindestriche (z. B. `erika-musterfrau`). Keine Umlaute, keine Leerzeichen, kein Punkt."));
    } else if (id.length < 3 || id.length > 64) {
      fehler.push(befund("fehler", "id-laenge", "mandatsId",
        `Die Kennung ist ${id.length} Zeichen lang.`, "Erlaubt sind 3 bis 64 Zeichen."));
    }
    if (/^(test|demo|beispiel|muster|dummy)(-|$)/.test(id)) {
      warnungen.push(befund("warnung", "id-sieht-nach-test-aus", "mandatsId",
        `\`${id}\` sieht nach einem Testmandat aus.`,
        "Testmandate gehören nicht in den Import echter Profile (CURRENT_STATE §5: die Offline-Testmandate bleiben deaktivierte Repo-Daten)."));
    }
  }

  // 3 · Name — er geht wörtlich in die Personensuche
  const name = text(p.vollname);
  if (p.vollname !== undefined) {
    if (name.length < 3) {
      fehler.push(befund("fehler", "name-zu-kurz", "vollname",
        "Der Vollname ist zu kurz.", "Mindestens 3 Zeichen; er geht wörtlich in die Nachrichtensuche."));
    } else if (!/\s/.test(name)) {
      warnungen.push(befund("warnung", "name-einteilig", "vollname",
        `\`${name}\` besteht aus nur einem Wort.`,
        "Die Personensuche sucht exakt nach diesem Namen. Ein einteiliger Name liefert erfahrungsgemäß viel Fremdmaterial."));
    }
    if (/[<>{}\\]/.test(name) || /^["']|["']$/.test(name)) {
      fehler.push(befund("fehler", "name-sonderzeichen", "vollname",
        "Der Vollname enthält Zeichen, die die Suchanfrage zerstören würden.",
        "Keine Anführungszeichen, spitzen oder geschweiften Klammern."));
    }
  }

  // 4 · Parlament, Ebene, Bundesland
  const parlament = text(p.parlament);
  if (p.parlament !== undefined && !AMTLICHE_HOSTS[parlament]) {
    fehler.push(befund("fehler", "parlament-unbekannt", "parlament",
      `\`${parlament || "(leer)"}\` ist kein unterstütztes Parlament.`,
      `Erlaubt: ${Object.keys(AMTLICHE_HOSTS).join(", ")}.`));
  }
  const bundesland = normal(p.bundesland);
  const pflichtLand = PFLICHT_BUNDESLAND[parlament];
  if (pflichtLand && bundesland && bundesland !== pflichtLand) {
    fehler.push(befund("fehler", "bundesland-passt-nicht", "bundesland",
      `Parlament \`${parlament}\`, aber Bundesland \`${text(p.bundesland)}\`.`,
      `Ein Landtagsmandat liegt im Land seines Parlaments — hier: ${pflichtLand}.`));
  }

  // 5 · Partei / Fraktion — oder ausdrücklich fraktionslos
  const fraktionslos = p.fraktionslos === true;
  if (!fraktionslos && !text(p.partei) && !text(p.fraktion)) {
    fehler.push(befund("fehler", "partei-fehlt", "partei",
      "Weder Partei noch Fraktion angegeben.",
      "Entweder `partei` (und in der Regel `fraktion`) angeben — oder `fraktionslos: true` setzen. Eine Lücke ist keine Aussage."));
  }
  if (fraktionslos && (text(p.partei) || text(p.fraktion))) {
    warnungen.push(befund("warnung", "fraktionslos-widerspruch", "fraktionslos",
      "`fraktionslos: true` steht neben einer Partei-/Fraktionsangabe.",
      "Das ist möglich (Partei ohne Fraktionsstatus), sollte aber gewollt sein."));
  }

  // 6 · Region: Wahlkreis ODER Listenmandat mit Regionhinweis
  const hatWahlkreis = Boolean(text(p.wahlkreis));
  const listenmandat = p.listenmandat === true;
  if (!hatWahlkreis && !(listenmandat && text(p.regionHinweis))) {
    fehler.push(befund("fehler", "region-fehlt", "wahlkreis",
      "Weder Wahlkreis noch Listenmandat mit Regionbezug.",
      "Direktmandat: `wahlkreis` setzen. Listenmandat: `listenmandat: true` UND `regionHinweis`. Ohne Region fehlt Helmut die regionale Achse (profile-validation.hasRegion)."));
  }

  // 7 · Fachliche Achse: mindestens ein Ausschuss oder ein Thema
  const hatAusschuss = istListe(p.ausschuesse);
  const hatThemen = istListe(p.themen);
  if (!hatAusschuss && !hatThemen) {
    fehler.push(befund("fehler", "schwerpunkt-fehlt", "themen",
      "Weder Ausschuss noch fachpolitischer Schwerpunkt.",
      "Mindestens eines von beiden ist Pflicht — sonst kann Helmut nichts Passendes zuordnen und das Briefing bleibt leer."));
  }
  if (hatThemen && p.themen.length > 25) {
    warnungen.push(befund("warnung", "zu-viele-themen", "themen",
      `${p.themen.length} Themen angegeben.`,
      "Die Themensuche nutzt die ersten fünf (scheduler.topProfileTopics). Alles darüber kostet Rechercheaufwand ohne Wirkung auf die Quellen."));
  }

  // 8 · Offizielle Quellen — Belegpflicht
  const quellen = Array.isArray(p.offizielleQuellen) ? p.offizielleQuellen : [];
  if (p.offizielleQuellen !== undefined && !Array.isArray(p.offizielleQuellen)) {
    fehler.push(befund("fehler", "quellen-kein-array", "offizielleQuellen",
      "`offizielleQuellen` ist keine Liste.", "Es muss eine Liste von Objekten `{art, url}` sein."));
  }
  const amtliche = quellen.filter((q) => q && q.art === "parlament-profil");
  if (p.offizielleQuellen !== undefined && Array.isArray(p.offizielleQuellen) && !amtliche.length) {
    fehler.push(befund("fehler", "amtliche-quelle-fehlt", "offizielleQuellen",
      "Keine amtliche Profilseite des Parlaments angegeben.",
      "Mindestens eine Quelle mit `art: \"parlament-profil\"` ist Pflicht (Belegpflicht, CLAUDE.md §4.3)."));
  }
  const erlaubteHosts = AMTLICHE_HOSTS[parlament] || [];
  for (const q of quellen) {
    const u = text(q && q.url);
    if (!/^https:\/\//i.test(u)) {
      fehler.push(befund("fehler", "quelle-kein-https", "offizielleQuellen",
        `\`${u || "(leer)"}\` ist keine https-URL.`, "Nur vollständige https-URLs sind zulässig."));
      continue;
    }
    const h = host(u);
    if (/^(news\.google\.|www\.google\.|google\.|bing\.|duckduckgo\.)/.test(`${h}.`) || /[?&]q=/.test(u)) {
      fehler.push(befund("fehler", "quelle-ist-suche", "offizielleQuellen",
        `\`${u}\` sieht nach einer Suchseite aus.`,
        "Eine Suchseite ist kein Beleg. Es braucht die konkrete Profilseite."));
      continue;
    }
    // SYNTHETIK-MARKER. Die mitgelieferte Beispieldatei muss strukturell gültig sein, damit
    // sie überhaupt etwas zeigt — sie darf aber unter keinen Umständen versehentlich als
    // Recherche durchgehen. Deshalb tragen ihre URLs den Marker `/SYNTHETISCH/`, und der
    // Prüfer sagt bei jedem Treffer laut, dass hier keine echte Quelle steht
    // (CLAUDE.md §4.3: keine erfundenen Quellen-URLs — sie müssen als solche erkennbar sein).
    if (/\/SYNTHETISCH\//.test(u)) {
      warnungen.push(befund("warnung", "quelle-synthetisch", "offizielleQuellen",
        `\`${u}\` trägt den Synthetik-Marker.`,
        "Das ist KEINE echte Quelle. Solche Einträge stammen aus der Beispieldatei und dürfen nie in einen echten Import geraten."));
    }
    if (q.art === "parlament-profil" && erlaubteHosts.length && !istUnterHost(h, erlaubteHosts)) {
      fehler.push(befund("fehler", "quelle-falscher-host", "offizielleQuellen",
        `\`${h}\` ist nicht das amtliche Verzeichnis von \`${parlament}\`.`,
        `Erwartet: ${erlaubteHosts.join(" oder ")}. Fraktions- und Parteiseiten sind Selbstauskunft — dafür gibt es \`fraktion-profil\` bzw. \`partei-profil\`.`));
    }
  }

  // 9 · Import aktiviert nie
  if (p.aktiv !== undefined && p.aktiv !== false) {
    fehler.push(befund("fehler", "import-darf-nicht-aktivieren", "aktiv",
      `\`aktiv\` steht auf \`${JSON.stringify(p.aktiv)}\`.`,
      "Ein Import legt Profile IMMER deaktiviert an. Das Aktivieren ist eine getrennte, freigabepflichtige Betreiberentscheidung (CLAUDE.md §5). Setze `aktiv: false`."));
  }

  // 10 · Kostenbegrenzung — dieselbe Regel wie profile-validation.budgetCheck
  for (const feld of ["kiBudgetTaeglichCent", "kiBudgetMonatlichCent"]) {
    const v = p[feld];
    if (v === undefined || v === null || v === "") continue;
    if (!Number.isInteger(v) || v <= 0) {
      fehler.push(befund("fehler", "budget-ungueltig", feld,
        `\`${feld}\` ist \`${JSON.stringify(v)}\`.`,
        "Entweder weglassen (dann greift der Systemdefault) oder eine positive ganze Zahl. Ein ungültiger Wert macht das Profil `fehlerhaft` (profile-validation.budgetCheck)."));
    }
  }

  return { index, mandatsId: id || null, ok: fehler.length === 0, fehler, warnungen };
}

// ── Prüfung der GANZEN Datei ─────────────────────────────────────────────────────────────
// Dubletten sind hier und nicht im Einzelprofil zu Hause: sie sind eine Eigenschaft der
// Menge. Geprüft werden DREI Achsen, weil jede eine andere Art Fehler fängt:
//   * gleiche Mandatskennung   -> zwei Zeilen würden denselben Mandanten meinen (technisch fatal),
//   * gleicher Vollname        -> dieselbe Person zweimal recherchiert (fachlich fatal),
//   * gleiche amtliche Quelle  -> zwei Kennungen zeigen auf dieselbe Profilseite (der Fall,
//                                 den die ersten beiden Prüfungen NICHT fangen, weil Name
//                                 und Kennung sich unterscheiden dürfen).
function pruefeImport(datei) {
  const fehler = [];
  const warnungen = [];

  if (!datei || typeof datei !== "object" || Array.isArray(datei)) {
    return {
      ok: false, profile: 0, gueltig: 0,
      fehler: [befund("fehler", "keine-datei", null, "Die Eingabe ist kein Objekt.",
        "Erwartet wird `{ version, profile: [...] }`.")],
      warnungen: [], ergebnisse: [], zusammenfassung: null
    };
  }
  if (text(datei.version) !== VERTRAGSVERSION) {
    fehler.push(befund("fehler", "version-unbekannt", "version",
      `\`${text(datei.version) || "(fehlt)"}\` ist nicht die erwartete Vertragsversion.`,
      `Erwartet: \`${VERTRAGSVERSION}\`. Ein Importer, der eine unbekannte Version rät, importiert irgendwas.`));
  }
  const liste = Array.isArray(datei.profile) ? datei.profile : null;
  if (!liste) {
    fehler.push(befund("fehler", "profile-kein-array", "profile",
      "`profile` ist keine Liste.", "Erwartet wird eine Liste von Profilobjekten."));
    return { ok: false, profile: 0, gueltig: 0, fehler, warnungen, ergebnisse: [], zusammenfassung: null };
  }

  const ergebnisse = liste.map((p, i) => pruefeProfil(p, { index: i }));

  // Dublettenprüfung über die drei Achsen.
  const sammle = (schluessel) => {
    const karte = new Map();
    ergebnisse.forEach((e, i) => {
      const k = schluessel(liste[i]);
      if (!k) return;
      if (!karte.has(k)) karte.set(k, []);
      karte.get(k).push(i);
    });
    return [...karte].filter(([, idx]) => idx.length > 1);
  };

  for (const [k, idx] of sammle((p) => (p && text(p.mandatsId).toLowerCase()) || null)) {
    fehler.push(befund("fehler", "dublette-mandatsId", "mandatsId",
      `Die Mandatskennung \`${k}\` kommt ${idx.length}-mal vor (Einträge ${idx.join(", ")}).`,
      "Die Kennung ist der Mandantenschlüssel — zwei Zeilen mit derselben Kennung wären derselbe Mandant. Sie muss eindeutig sein."));
  }
  for (const [k, idx] of sammle((p) => (p && normal(p.vollname)) || null)) {
    fehler.push(befund("fehler", "dublette-name", "vollname",
      `Der Vollname \`${k}\` kommt ${idx.length}-mal vor (Einträge ${idx.join(", ")}).`,
      "Dieselbe Person wurde mehrfach erfasst. Falls es wirklich zwei verschiedene Menschen mit identischem Namen sind, muss die Recherche das belegen — dann sind auch die amtlichen Quellen verschieden."));
  }
  for (const [k, idx] of sammle((p) => {
    const q = (Array.isArray(p && p.offizielleQuellen) ? p.offizielleQuellen : [])
      .find((x) => x && x.art === "parlament-profil");
    return q ? text(q.url).toLowerCase().replace(/\/+$/, "") : null;
  })) {
    fehler.push(befund("fehler", "dublette-quelle", "offizielleQuellen",
      `Die amtliche Profilseite \`${k}\` ist ${idx.length} Einträgen zugeordnet (${idx.join(", ")}).`,
      "Zwei verschiedene Kennungen zeigen auf dieselbe Person. Genau diesen Fall fangen die Kennungs- und Namensprüfung nicht."));
  }

  const gueltig = ergebnisse.filter((e) => e.ok).length;
  const nachParlament = {};
  for (const p of liste) {
    const k = text(p && p.parlament) || "(ohne)";
    nachParlament[k] = (nachParlament[k] || 0) + 1;
  }

  return {
    ok: fehler.length === 0 && ergebnisse.every((e) => e.ok),
    profile: liste.length,
    gueltig,
    fehler,
    warnungen: [...warnungen, ...ergebnisse.flatMap((e) => e.warnungen.map((w) => ({ ...w, index: e.index })))],
    ergebnisse,
    zusammenfassung: {
      profile: liste.length,
      gueltig,
      ungueltig: liste.length - gueltig,
      nachParlament,
      // EHRLICH: ein Import ist erst dann in Ordnung, wenn JEDES Profil in Ordnung ist.
      // Teilimporte sind nicht vorgesehen — sie würden eine halb recherchierte Menge
      // als Erfolg aussehen lassen.
      alleAktivFalse: liste.every((p) => p && p.aktiv === false)
    }
  };
}

// Menschenlesbarer Bericht. Bewusst hier und nicht im Aufrufer: die Fehlermeldung IST ein
// Teil des Vertrags — sie muss überall gleich lauten.
function berichte(ergebnis) {
  const zeilen = [];
  zeilen.push(`Profile: ${ergebnis.profile} · gültig: ${ergebnis.gueltig} · ungültig: ${ergebnis.profile - ergebnis.gueltig}`);
  if (ergebnis.zusammenfassung) {
    zeilen.push(`Nach Parlament: ${Object.entries(ergebnis.zusammenfassung.nachParlament)
      .map(([k, n]) => `${k}=${n}`).join(" · ") || "(keine)"}`);
    zeilen.push(`Alle Profile deaktiviert importierbar: ${ergebnis.zusammenfassung.alleAktivFalse ? "ja" : "NEIN"}`);
  }
  for (const f of ergebnis.fehler) {
    zeilen.push(`  FEHLER [${f.code}] ${f.feld ? `${f.feld}: ` : ""}${f.text}`);
    zeilen.push(`         -> ${f.hinweis}`);
  }
  for (const e of ergebnis.ergebnisse || []) {
    for (const f of e.fehler) {
      zeilen.push(`  FEHLER #${e.index} (${e.mandatsId || "ohne Kennung"}) [${f.code}] ${f.feld ? `${f.feld}: ` : ""}${f.text}`);
      zeilen.push(`         -> ${f.hinweis}`);
    }
  }
  for (const w of ergebnis.warnungen || []) {
    zeilen.push(`  WARNUNG${w.index != null ? ` #${w.index}` : ""} [${w.code}] ${w.text}`);
    zeilen.push(`         -> ${w.hinweis}`);
  }
  zeilen.push(ergebnis.ok ? "ERGEBNIS: importierbar" : "ERGEBNIS: NICHT importierbar");
  return zeilen.join("\n");
}

// Übersetzung in die Profilform, die der Rest von Helmut liest. Reine Abbildung, kein
// Schreibzugriff: der Aufrufer entscheidet, was damit geschieht.
function zuHelmutProfil(p) {
  return {
    id: text(p.mandatsId),
    fullName: text(p.vollname),
    name: text(p.vollname),
    party: text(p.partei) || (p.fraktionslos === true ? "Fraktionslos" : ""),
    faction: text(p.fraktion),
    politische_ebene: EBENE[text(p.parlament)] || "",
    state: text(p.bundesland),
    bundesland: text(p.bundesland),
    constituency: text(p.wahlkreis),
    regionNote: text(p.regionHinweis),
    committees: Array.isArray(p.ausschuesse) ? [...p.ausschuesse] : [],
    committee: (Array.isArray(p.ausschuesse) && p.ausschuesse[0]) || "",
    focusTopics: Array.isArray(p.themen) ? [...p.themen] : [],
    regionalInterests: Array.isArray(p.regionaleThemen) ? [...p.regionaleThemen] : [],
    relevantMinistries: Array.isArray(p.relevanteMinisterien) ? [...p.relevanteMinisterien] : [],
    namensvarianten: Array.isArray(p.namensvarianten) ? [...p.namensvarianten] : [],
    // DEAKTIVIERT. Immer. Ohne Ausnahme.
    profileActive: false,
    aiBudgetDailyCents: p.kiBudgetTaeglichCent,
    aiBudgetMonthlyCents: p.kiBudgetMonatlichCent
  };
}

module.exports = {
  VERTRAGSVERSION,
  AMTLICHE_HOSTS,
  EBENE,
  PFLICHT_BUNDESLAND,
  PFLICHTFELDER,
  OPTIONALE_FELDER,
  ERLAUBTE_FELDER,
  pruefeProfil,
  pruefeImport,
  berichte,
  zuHelmutProfil
};
