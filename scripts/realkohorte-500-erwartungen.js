"use strict";

// Rein lokale Vorab-Erwartungen, ohne Nachrichten-, Datenbank- oder Modellzugriff.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { fordereZulassung } = require("../lib/helmut/profil-zulassung");
const VERSION = "helmut-realkohorte-erwartungen/1";
const ROOT = path.resolve(__dirname, "..");
const PAKET = path.join(ROOT, "daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json");
const PAKET_HASH = "775356e2c464a307a3f5e5c5852394aa5fe033253a4dccbb155131f4e1b21e59";
const IDS_HASH = "28eb5266f5b4372e8c093223190b5f273c5588996bc30b5411dd175ea6094ca9";
const VERTEILUNG = Object.freeze({ bundestag: 330, "landtag-berlin": 120, "landtag-brandenburg": 50 });
const BEREICHE = Object.freeze(["mandatsbriefing", "morgenbriefing", "lage"]);
const PARLAMENT_HOST = Object.freeze({ bundestag: "www.bundestag.de",
  "landtag-berlin": "www.parlament-berlin.de", "landtag-brandenburg": "www.landtag.brandenburg.de" });
const PARTEILOS = new Set(["landtag-brandenburg-40630", "landtag-brandenburg-40629"]);
const FRAKTIONSLOS = new Set(["bundestag-seidler-stefan-1047378", "landtag-berlin-alexander-king", "landtag-brandenburg-40629"]);
const fordere = (ok, code) => { if (!ok) throw new Error("real500-erwartungen-" + code); };
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
function stabil(value) {
  if (Array.isArray(value)) return "[" + value.map(stabil).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort()
    .map(k => JSON.stringify(k) + ":" + stabil(value[k])).join(",") + "}";
  return JSON.stringify(value);
}
const hash = value => sha(stabil(value));
const text = value => typeof value === "string" && value.trim().length > 0;
const liste = (r, key) => r[key] || [];
const ebene = r => r.parlament === "bundestag" ? "bund" : "land";
const partei = r => r.partei || "parteilos (kanonisch belegt)";
const fraktion = r => r.fraktion || "fraktionslos (kanonisch belegt)";

function pruefeProfil(r) {
  fordere(r && typeof r === "object" && !Array.isArray(r), "profil-format");
  fordere(text(r.mandatsId) && /^[a-zA-Z0-9_-]{1,200}$/.test(r.mandatsId), "profil-id");
  fordere(text(r.vollname) && text(r.bundesland) && Object.hasOwn(VERTEILUNG, r.parlament), "profil-pflichtfeld");
  fordere(r.aktiv === false, "profil-nicht-inaktiv");
  fordereZulassung(r); // aktuelle Partei UND Fraktion, keine Themenfilterung
  fordere(text(r.partei) || (!Object.hasOwn(r, "partei") && PARTEILOS.has(r.mandatsId)), "partei-fehlt");
  fordere(text(r.fraktion) || (!Object.hasOwn(r, "fraktion") && r.fraktionslos === true
    && FRAKTIONSLOS.has(r.mandatsId)), "fraktion-fehlt");
  fordere(!(text(r.fraktion) && r.fraktionslos === true), "fraktion-widerspruch");
  if (r.parlament !== "bundestag") fordere(r.bundesland === (r.parlament === "landtag-berlin" ? "Berlin" : "Brandenburg"), "land-drift");
  fordere(text(r.wahlkreis) || (r.listenmandat === true && text(r.regionHinweis)), "mandatsart-fehlt");
  for (const key of ["ausschuesse", "stellvertretendeAusschuesse", "funktionen", "themen"])
    fordere(!Object.hasOwn(r, key) || (Array.isArray(r[key]) && r[key].every(text)), "profil-feldformat");
  fordere(Array.isArray(r.offizielleQuellen) && r.offizielleQuellen.length > 0, "quellen-fehlen");
  for (const q of r.offizielleQuellen) {
    let u;
    try { u = new URL(q.url); } catch { fordere(false, "quellen-url"); }
    // Ein ergänzender, im kanonischen Paket gebundener Partei-Beleg hat keine
    // Abrufzeit. Sichtbar erhalten, niemals als frischen/amtlichen Beleg werten.
    const ohneAbrufzeitKanonisch = r.mandatsId === "bundestag-pistorius-boris-1046550"
      && q.art === "partei-profil" && q.url === "https://www.spd.de/ueber-uns"
      && q.sha256 === "535e62d64e01152270b4a3687fd8cd56c8feb4c561150d6821b6ea97493670c8" && q.abgerufenAm === null;
    fordere(u.protocol === "https:" && !u.username && !u.password && u.pathname !== "/"
      && text(q.art) && ((text(q.abgerufenAm) && Number.isFinite(Date.parse(q.abgerufenAm))) || ohneAbrufzeitKanonisch)
      && /^[a-f0-9]{64}$/.test(q.sha256 || ""), "quellen-bindung");
  }
  fordere(r.offizielleQuellen.some(q => q.art === "parlament-profil"
    && new URL(q.url).hostname === PARLAMENT_HOST[r.parlament]), "amtliche-parlamentsquelle-fehlt");
  return r;
}

function pruefePaket(bytes) {
  fordere(Buffer.isBuffer(bytes) || typeof bytes === "string", "paket-fehlt");
  const p = JSON.parse(String(bytes));
  fordere(p.version === "helmut-mandatsprofil/1" && Array.isArray(p.profile) && p.profile.length === 500, "paket-version-menge");
  p.profile.forEach(pruefeProfil);
  const n = {};
  p.profile.forEach(r => { n[r.parlament] = (n[r.parlament] || 0) + 1; });
  fordere(hash(n) === hash(VERTEILUNG), "verteilung-drift");
  const ids = p.profile.map(r => r.mandatsId).sort();
  fordere(new Set(ids).size === 500 && hash(ids) === IDS_HASH, "ids-drift");
  fordere(sha(bytes) === PAKET_HASH, "paket-hash-drift");
  return { profile: [...p.profile].sort((a, b) => a.mandatsId.localeCompare(b.mandatsId)), ids };
}

function profilErwartung(r) {
  pruefeProfil(r);
  const quellen = r.offizielleQuellen.map(q => ({ ...q }));
  const achsen = [
    ...liste(r, "ausschuesse").map(wortlaut => ({ art: "ordentliche-ausschussmitgliedschaft", wortlaut })),
    ...liste(r, "stellvertretendeAusschuesse").map(wortlaut => ({ art: "stellvertretende-ausschussmitgliedschaft", wortlaut })),
    ...liste(r, "themen").map(wortlaut => ({ art: "belegtes-thema-keine-politische-position", wortlaut }))
  ];
  const blocker = achsen.length ? [] : ["individuelle-fachachse-fehlt-keine-ersatzachse-aus-partei-oder-allgemeiner-rolle"];
  const bindung = { mandatsId: r.mandatsId, name: r.vollname, ebene: ebene(r), parlament: r.parlament,
    bundesland: r.bundesland, partei: r.partei || null, fraktion: r.fraktion || null,
    parteilosKanonischBelegt: PARTEILOS.has(r.mandatsId), fraktionslos: r.fraktionslos === true,
    wahlkreis: r.wahlkreis || null, listenmandat: r.listenmandat === true,
    regionHinweis: r.regionHinweis || null, ausschuesse: liste(r, "ausschuesse"),
    stellvertretendeAusschuesse: liste(r, "stellvertretendeAusschuesse"),
    funktionen: liste(r, "funktionen"), fokus: liste(r, "themen") };
  return { mandatsId: r.mandatsId, profilfeldHash: hash(r), erwartungsfelderHash: hash(bindung), bindung,
    amtlicheQuellen: quellen.filter(q => new URL(q.url).hostname === PARLAMENT_HOST[r.parlament]),
    allePaketquellen: quellen, quellenHash: hash(quellen),
    quellenLuecken: quellen.filter(q => q.abgerufenAm === null).map(q => ({ url: q.url,
      grund: "ergänzende Paketquelle ohne Abrufzeit; kein frischer oder amtlicher Beleg" })), fachachsen: achsen,
    fachachsenHinweis: "Sachgebiete aus Ausschussmitgliedschaft sind Zuständigkeitsableitungen; belegte Themen und Rollen unverändert aus dem gebundenen Paket. Keine persönliche politische Position.",
    status: blocker.length ? "blockiert" : "vorab-konkretisiert-keine-fachabnahme", blocker,
    positiveFaelle: [
      { id: "fachachse-eigene-zustaendigkeit", bedingung: { parlament: r.parlament, bundesland: r.bundesland,
        fachachsen: achsen, rollen: liste(r, "funktionen"), region: r.wahlkreis || r.regionHinweis },
        erwartet: "Ein aktueller Originalartikel mit belegtem Bezug zu einer dieser eigenen Fachachsen und zur richtigen parlamentarischen Zuständigkeit muss fachlich bewertet werden. Die Listenregion begründet kein direktes Wahlkreismandat; Stellvertretung ist keine ordentliche Mitgliedschaft. Rolle, Folgen und Arbeitsauftrag nur bei belegtem konkretem Anlass." },
      { id: "person-im-original", bedingung: { vollname: r.vollname, mandatsId: r.mandatsId },
        erwartet: "Radar Über dich nur bei nachgewiesener Identität und Nennung dieser Person im eigenen Originalartikel; Link, Datum, Titel und Textstelle binden. Namensgleiche andere Personen, Seitenleisten, Suchtreffer oder bloße Themenähnlichkeit genügen nicht." },
      { id: "fraktion-partei-getrennt", bedingung: { parlament: r.parlament, partei: r.partei || null, fraktion: r.fraktion || null },
        erwartet: "Belegte aktuelle Partei- oder Fraktionsmeldung als getrennten Herkunftshinweis bewerten; keine persönliche Zustimmung, Position, Sprechrolle oder Tagespflicht aus Zugehörigkeit ableiten." }
    ],
    negativeFaelle: [
      { id: "cross-ebene", ausschluss: "Gleichnamiger Ausschuss oder gleiche Partei auf anderer parlamentarischer Ebene begründet keine eigene Zuständigkeit. Ein nachgewiesener konkreter Ebenenbezug darf gesondert erklärt werden.", eigeneEbene: ebene(r), eigenesParlament: r.parlament },
      { id: "cross-land", ausschluss: "Eine Landesmeldung aus fremdem Land begründet keine eigene Landeszuständigkeit. Bundesmandat bleibt Bundesmandat, auch im Herkunftsland; überregionale Folgen nur bei explizitem Quellenbeleg.", eigenesLand: r.bundesland },
      { id: "fremde-person-oder-rolle", ausschluss: "Keine Namen, Ausschüsse, Funktionen, Fristen, Positionen oder privaten Informationen anderer Profile als eigene Angaben ausgeben.", eigenerName: r.vollname },
      { id: "fehlender-originalbeleg", ausschluss: "Startseite, Suchsnippet, alleiniger Score oder nicht passender Dokumentbeleg darf keine sichtbare Quellen-, Radar- oder Tatsachenbindung ersetzen." }
    ],
    ruhigerFall: { bedingung: "Im vorab festgelegten vollständigen Nachrichten-/Zeitfenster existiert kein aktueller, individuell belegter Anlass zu den gebundenen Zuständigkeiten oder zur Person.",
      erwartet: "Keine erfundene Tagespriorität, Pflicht, Frist oder Umdeutung alten Inhalts; ehrlicher ruhiger/leer Zustand mit Quellenlage. Leere Ergebnisse separat bilanzieren und fachlich prüfen, nicht automatisch bestehen lassen.",
      zaehltAlsSollposition: true, automatischBestanden: false },
    bereichskriterien: {
      mandatsbriefing: "Individueller Mandatsbezug zu gebundener Ebene, Region, Fachachsen und Rollen; belegter Anlass, verwendbare Folge/Arbeitsauftrag nur soweit Quelle trägt.",
      morgenbriefing: "Wenige belegte aktuelle Tagesprioritäten und nächste Schritte; keine Pflicht ohne Tagesanlass, kein zweiter Lagebericht; ruhiger Fall sichtbar und getrennt bewertet.",
      lage: "Ausführlicher belegter Sachstand, eigener Mandatsbezug, getrennte Einordnung und Unsicherheit; jede sichtbare Aussage/Quelle passend zum Original, keine fremden Profilinformationen.",
      radar: "Über dich an diese Person und Originalnennung binden; Beobachten benötigt konkretes belegtes Vorzeichen/Termin/Frist und passende Herkunft. Kein allgemeiner Themenfeed oder zweites Briefing." } };
}

function teilbilanz(profile, key) {
  const groups = new Map();
  for (const r of profile) {
    const group = key(r);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(r.mandatsId);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([gruppe, ids]) => ({ gruppe,
    ids: ids.sort(), idsHash: hash(ids.sort()), profile: ids.length,
    sollpositionen: ids.length * 3, jeBereich: Object.fromEntries(BEREICHE.map(b => [b, ids.length])) }));
}

function erzeuge(bytes) {
  const { profile, ids } = pruefePaket(bytes);
  const erwartungen = profile.map(profilErwartung);
  const fachbegriffe = r => [...liste(r, "ausschuesse"), ...liste(r, "stellvertretendeAusschuesse"), ...liste(r, "themen")];
  const paar = (r, condition) => profile.find(s => s.mandatsId !== r.mandatsId && condition(s))?.mandatsId || null;
  for (let i = 0; i < profile.length; i++) {
    const r = profile[i];
    erwartungen[i].vergleichsprofile = {
      gleicheParteiAnderesParlament: r.partei ? paar(r, s => s.partei === r.partei && s.parlament !== r.parlament) : null,
      andereParteiGleicheFachachse: paar(r, s => partei(s) !== partei(r) && s.parlament === r.parlament
        && fachbegriffe(r).some(t => fachbegriffe(s).includes(t))),
      andereAusschussOderWahlkreisrolle: paar(r, s => s.parlament === r.parlament
        && (hash(fachbegriffe(s)) !== hash(fachbegriffe(r)) || s.wahlkreis !== r.wahlkreis))
    };
  }
  const blocker = erwartungen.flatMap(r => r.blocker.map(grund => ({ mandatsId: r.mandatsId, grund })));
  const inhalt = { version: VERSION, zustand: "inerte-vorab-erwartungen", paketHash: PAKET_HASH,
    idsHash: IDS_HASH, ids, verteilung: { ...VERTEILUNG }, profilfeldGesamthash: hash(profile),
    status: blocker.length ? "blockiert" : "vorab-konkretisiert-keine-fachabnahme", blocker,
    importfreigabe: false, aktivierungsfreigabe: false, testfreigabe: false,
    nachrichtenauswertung: 0, productionWrites: 0, fachlichAbgenommen: 0,
    vorabVertrag: { auswahlVorNachrichten: true, gleicheBehandlungAller500: true,
      nachrichtenAuswahlNachPassendemInhaltVerboten: true,
      hinweis: "Personenbezogene Prüferwartungen aus dem festen amtlich gebundenen Paket, keine ausgeführten Szenarien oder Fachurteile. Artikel-/Zeitfensterbindung und vollständige 1500 Einzelurteile erst im separat freizugebenden Lauf. Historische Paketquellen sind keine aktuelle Mandatsbestätigung.",
      offen: ["unabhängige fachliche Prüfung der Vorab-Erwartungen", "frische Mandats-/Quellenbestätigung vor Aktivierung",
        "vorab festes vollständiges Nachrichten- und Zeitfenster", "500er Aktivierungs-GO", "500er Test-GO", "vollständige fachliche Einzelurteile aller 1500 Sollpositionen"] },
    sollpositionen: ids.flatMap(mandatsId => BEREICHE.map(bereich => ({ mandatsId, bereich, status: "ausstehend" }))),
    bilanzvertrag: { profile: 500, sollpositionen: 1500,
      jeBereich: Object.fromEntries(BEREICHE.map(b => [b, 500])),
      vollstaendigkeit: ["vorhanden", "fehlend", "leer", "doppelt", "unerwartet", "technischer-fehler"],
      fachqualitaet: ["ausstehend", "brauchbar", "unbrauchbar", "nicht-beurteilbar"],
      leerAutomatischBestanden: false, stichprobenErsetzenVollpruefung: false,
      gleichbehandlung: "Keine besondere Bestandsgruppe, alle 500 identisch zählen und prüfen.",
      teilbilanzen: { ebene: teilbilanz(profile, ebene), parlament: teilbilanz(profile, r => r.parlament),
        bundesland: teilbilanz(profile, r => r.bundesland), partei: teilbilanz(profile, partei),
        fraktionJeParlament: teilbilanz(profile, r => r.parlament + " | " + fraktion(r)),
        parteiFraktionJeParlament: teilbilanz(profile, r => r.parlament + " | " + partei(r) + " | " + fraktion(r)) } },
    erwartungen };
  return { ...inhalt, erwartungenHash: hash(inhalt) };
}

function schreibePrivat(out, inhalt) {
  fordere(text(out) && path.isAbsolute(out), "out-absolut-erforderlich");
  const parent = fs.realpathSync(path.dirname(out));
  const target = path.join(parent, path.basename(out));
  const repo = fs.realpathSync(ROOT);
  fordere(target !== repo && !target.startsWith(repo + path.sep), "out-im-repository");
  // Gemeinsame Haupt- und Nebenworktrees ebenfalls als Repository erkennen.
  for (let dir = parent; ; dir = path.dirname(dir)) {
    const git = path.join(dir, ".git");
    // Die Cloud-Sandbox hat leere schreibgeschützte .git-Platzhalter auch in
    // /tmp und /workspace. Nur echte Repo-/Worktree-Metadaten zählen.
    const repository = fs.existsSync(git) && (fs.statSync(git).isFile()
      || fs.existsSync(path.join(git, "HEAD")));
    fordere(!repository, "out-im-repository");
    if (dir === path.dirname(dir)) break;
  }
  const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600);
  try { fs.fchmodSync(fd, 0o600); fs.writeFileSync(fd, JSON.stringify(inhalt, null, 2) + "\n"); fs.fsyncSync(fd); }
  catch (error) { fs.closeSync(fd); fs.unlinkSync(target); throw error; }
  fs.closeSync(fd);
  return target;
}

function main(args) {
  fordere(args.length === 2 && args[0] === "--out", "cli-nur-out");
  const result = erzeuge(fs.readFileSync(PAKET));
  const out = schreibePrivat(args[1], result);
  console.log(JSON.stringify({ out, version: VERSION, profile: result.ids.length,
    sollpositionen: result.sollpositionen.length, status: result.status,
    blocker: result.blocker.length, erwartungenHash: result.erwartungenHash,
    nachrichtenauswertung: 0, productionWrites: 0 }));
}
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { VERSION, PAKET, PAKET_HASH, IDS_HASH, VERTEILUNG, BEREICHE,
  hash, stabil, pruefeProfil, pruefePaket, profilErwartung, erzeuge, schreibePrivat, main };
