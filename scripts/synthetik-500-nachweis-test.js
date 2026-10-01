"use strict";
// Vollstaendige deterministische Fiktionsdaten, keine Production-Fachurteile.
const A = require("node:assert/strict");
const P = require("../lib/helmut/synthetik-500-profile");
const N = require("../lib/helmut/synthetik-500-nachweis");
const CLI = require("./synthetik-500-nachweis");
const hashOhne = (o, feld) => { const copy = { ...o }; delete copy[feld]; return P.hash(copy); };
const quelle = { id: "quelle1", url: "https://www.bundestag.de/dokumente/textarchiv/2026/kw40-wohnen-123456",
  published_at: "2026-10-01T09:10:00.000Z", title: "Quellengestuetzter Vorgang mit eindeutigem Originalbeleg",
  summary: "Veroeffentlichte Nachricht zum pruefbaren synthetischen Sachgebiet.",
  text: "Der Originalartikel beschreibt den belegten Sachstand mit eigenstaendigen Quellenfakten." };
quelle.quellenHash = P.hash(quelle);
function standQuelle(land, tag = "2026-09-30") {
  const crypto = require("node:crypto"), hash = x => crypto.createHash("sha256").update(x).digest("hex");
  const m = require(land === "berlin" ? "../lib/helmut/berlin-artikelstand" : "../lib/helmut/brandenburg-landtag-presseartikelstand");
  const text = `Der vollstaendige gebundene erste Sachabsatz der synthetischen ${land} Landesquelle traegt nachvollziehbare Originalaussagen.`;
  const nativeUrl = land === "berlin" ? "https://www.berlin.de/sen/bjf/service/presse/pressearchiv-2026/pressemitteilung.1999999.php"
    : "https://www.landtag.brandenburg.de/de/meldungen/beispiel_meldung/50117";
  const url = m.kanonischeArtikelUrl(nativeUrl);
  const stand = { version: m.VERSION, herkunft: m.HERKUNFT, url, titel: "Synthetische Landesmeldung ohne behauptete Production-Provenienz",
    publikationstag: tag, ...(land === "brandenburg" ? { publikationszeitpunktUtc: tag + "T10:42:00.000Z" } : {}),
    absatzHash: hash(text), volltextHash: hash(text + "\n") };
  stand.standHash = m.standHashFuer(stand);
  const q = { id: "rd-" + stand.standHash, content_hash: stand.standHash, url, canonical_url: url, title: stand.titel,
    summary: text, text, published_at: null, source_name: "Synthetische Landesquelle", raw: { [land === "berlin" ? "helmutBerlinArtikelstand" : "helmutBrandenburgLandtagPresseArtikelstand"]: stand } };
  q.quellenHash = P.hash(q);
  A.equal(require("../lib/helmut/artikelstand").leseStand(q).name, land);
  return q;
}
function fixture() {
  const paket = P.erzeuge();
  const profilvertrag = { version: "helmut-synthetik-500/1", operationId: "synthetik500-nachweis-20261001", ...paket.bindung,
    vorflugAm: "2026-10-01T09:09:00.000Z", startBis: "2026-10-01T09:14:00.000Z", endeAm: "2026-10-01T10:00:00.000Z" };
  profilvertrag.profilnullzustand = { mandateFachHash: P.hash(paket.profile.map(p => ({ user_id: p.mandatsId })).sort((a,b) => a.user_id.localeCompare(b.user_id))), profilesHash: P.hash([...paket.profile.map(p => ({ id: p.mandatsId })), { id: "fremd-nichtmandat" }].sort((a,b) => a.id.localeCompare(b.id))) };
  const runtimeManifest = { version: "helmut-synthetik500-runtime-manifest/1", profilManifestHash: P.hash(profilvertrag), profilvertrag,
    startbelegeGrundlinie: { productionCommit: "a".repeat(40), deploymentId: "dpl_TEST" } };
  const sollplan = N.erzeugeSollplan(paket, {
    operationId: "synthetik500-nachweis-20261001", productionCommit: "a".repeat(40), deploymentId: "dpl_TEST",
    runtimeManifestHash: P.hash(runtimeManifest), definiertAm: "2026-10-01T09:00:00.000Z",
    startsAt: "2026-10-01T09:10:00.000Z", endsAt: "2026-10-01T10:00:00.000Z", briefingFensterStart: "2026-09-30T14:00:00.000Z" });
  const ergebnisse = sollplan.sollpositionen.map((s, index) => {
    const text = `Die vollstaendige ${s.bereich} Testausgabe fuer ${s.mandatsId} traegt Fachinhalt und nachvollziehbaren Nutzen.`;
    const rohdatensatz = { ergebnisId: "result-" + index, text, nichtGekuerzt: true };
    const r = { version: N.VERSION, ergebnisId: rohdatensatz.ergebnisId, mandatsId: s.mandatsId, bereich: s.bereich,
      operationId: sollplan.operationId, sollplanHash: sollplan.sollplanHash, profilHash: s.profilHash,
      productionCommit: sollplan.productionCommit, deploymentId: sollplan.deploymentId, erzeugtAm: "2026-10-01T09:20:00.000Z",
      text, leer: false, leerGrund: null, technischerFehler: null, quellen: [structuredClone(quelle)], rohdatensatz,
      primaerbeleg: { exportReferenz: "fixture-only-export-not-production", zeile: index + 1, rohdatensatzHash: P.hash(rohdatensatz) } };
    r.ergebnisHash = N.ergebnisHash(r); return r;
  });
  const sichten = paket.profile.map((p, index) => {
    const rs = ergebnisse.slice(index * 3, index * 3 + 3);
    const s = { mandatsId: p.mandatsId, sollplanHash: sollplan.sollplanHash, profilHash: P.hash(p),
      ausgaben: Object.fromEntries(rs.map(r => [r.bereich, { text: r.text, ergebnisHash: r.ergebnisHash }])),
      radar: { text: "Keine persoenlichen Erwaehnungen fuer die vollstaendig fiktive Testperson; kein belegtes Umfeldsignal.", ueberDich: [], signale: [] } };
    s.sichtHash = N.sichtHash(s); return s;
  });
  const urteile = ergebnisse.map((r, index) => {
    const sicht = sichten[Math.floor(index / 3)];
    return { version: N.VERSION, mandatsId: r.mandatsId, bereich: r.bereich, sollplanHash: sollplan.sollplanHash,
      ergebnisHash: r.ergebnisHash, sichtHash: sicht.sichtHash, pruefer: "synthetischer-Vertragsgegenfall-kein-Fachbeleg", geprueftAm: "2026-10-01T10:05:00.000Z",
      kriterien: Object.keys(N.KRITERIEN).map(kriterium => ({ kriterium, urteil: "bestanden",
        begruendung: "Deterministisch vorgegebener Testfall zur Struktur und Bindungspruefung ohne behauptete Fachbewertung.",
        belege: [...P.BEREICHE.map(a => ({ ansicht: a, zitat: sicht.ausgaben[a].text })),
          { ansicht: "radar", zitat: sicht.radar.text }, { ansicht: "quelle", quellenId: quelle.id, zitat: quelle.text }] })) };
  });
  const ids = paket.profile.map(p => p.mandatsId), belege = { version: N.VERSION, sollplanHash: sollplan.sollplanHash,
    exportReferenz: "fixture-only-no-production", exportiertAm: "2026-10-01T10:06:00.000Z",
    lauf: { operationId: sollplan.operationId, productionCommit: sollplan.productionCommit, deploymentId: sollplan.deploymentId,
      startsAt: sollplan.startsAt, endsAt: sollplan.endsAt, runtimeManifestHash: sollplan.runtimeManifestHash,
      aktivierungsQuittungHash: "a".repeat(64), primaerbeleg: "fixture-only" },
    gleichzeitigAktiv: { beobachtetAm: "2026-10-01T09:15:00.000Z", mandateGesamt: 500, identitaetenGesamt: 501, aktiveIds: ids, primaerbeleg: "fixture-only" },
    kosten: { gelesenAm: "2026-10-01T10:05:00.000Z", utcTage: [{ tag: "2026-10-01", verbrauchtUsd: 1, reserviertUsd: 0 }],
      auftragVerbrauchtUsd: 2, auftragReserviertUsd: 0, primaerbeleg: "fixture-only" },
    ende: { beobachtetAm: "2026-10-01T10:05:00.000Z", aktiv: 0, mandateGesamt: 500, identitaetenGesamt: 501,
      ids, endquittungHash: "b".repeat(64), rueckwegHash: "c".repeat(64), endgrund: "frist", primaerbeleg: "fixture-only" },
    quellen: { belege: [{ id: quelle.id, hash: quelle.quellenHash, primaerbeleg: "fixture-only" }], primaerbeleg: "fixture-only" } };
  belege.gleichzeitigAktiv.profiles = [...ids.map(id => ({ id })), { id: "fremd-nichtmandat" }];
  belege.ende.profiles = structuredClone(belege.gleichzeitigAktiv.profiles);
  belege.lauf.runtimeManifest = runtimeManifest;
  belege.lauf.aktivierungsQuittung = { version: "helmut-synthetik-500/1", operationId: sollplan.operationId, manifest: profilvertrag,
    zustand: "aktiv", bestaetigtAktiv: 500, aktiviertAm: sollplan.startsAt };
  belege.lauf.aktivierungsQuittungHash = P.hash(belege.lauf.aktivierungsQuittung);
  belege.gleichzeitigAktiv.mandate_profiles = ids.map(user_id => ({ user_id, aktiv: true }));
  belege.gleichzeitigAktiv.bestandsHash = P.hash(belege.gleichzeitigAktiv.mandate_profiles);
  belege.ende.mandate_profiles = ids.map(user_id => ({ user_id, aktiv: false }));
  belege.ende.bestandsHash = P.hash(belege.ende.mandate_profiles);
  belege.ende.endquittung = { version: "helmut-synthetik500-status/1", operationId: sollplan.operationId, manifestHash: sollplan.runtimeManifestHash,
    profilManifestHash: runtimeManifest.profilManifestHash, productionCommit: sollplan.productionCommit,
    paketHash: paket.bindung.paketHash, idsHash: paket.bindung.idsHash, beobachtetAm: belege.ende.beobachtetAm,
    zustand: "beendet", gesamt: 500, identitaeten: 501, aktiv: 0, fremdUnveraendert: true, fachfelderUnveraendert: true,
    quittungBindungBestaetigt: true, endeAm: sollplan.endsAt };
  belege.ende.endquittungHash = P.hash(belege.ende.endquittung);
  return { paket, sollplan, ergebnisse, sichten, urteile, belege };
}
let anzahl = 0;
function test(name, fn) { fn(); anzahl++; console.log("ok " + anzahl + " - " + name); }
const basis = fixture();
function run(mutate) { const f = structuredClone(basis); mutate?.(f); return N.bilanziere(f); }
const geschlossen = r => { A.equal(r.productionNachweisErfolgreich, false); A.equal(r.unabhaengigeEndpruefung, "offen"); };
function neuBinden(f, index = 0) {
  const r = f.ergebnisse[index]; r.rohdatensatz.text = r.text; r.primaerbeleg.rohdatensatzHash = P.hash(r.rohdatensatz);
  r.ergebnisHash = N.ergebnisHash(r);
  const s = f.sichten[Math.floor(index / 3)]; s.ausgaben[r.bereich] = { text: r.text, ergebnisHash: r.ergebnisHash }; s.sichtHash = N.sichtHash(s);
  for (let i = Math.floor(index / 3) * 3; i < Math.floor(index / 3) * 3 + 3; i++) {
    f.urteile[i].ergebnisHash = f.ergebnisse[i].ergebnisHash; f.urteile[i].sichtHash = s.sichtHash;
  }
}
test("alle500/1500 vollstaendig bilanziert, Endabnahme trotzdem offen", () => {
  const r = run(); A.equal(r.zaehlungen.positiv, 1500); A.equal(r.positionen.length, 1500);
  A.equal(r.belegpaketBereitZurUnabhaengigenPruefung, true); A.equal(r.zaehlungen.summeStimmt, true);
  A.equal(r.teilbilanzen.parlament.bundestag.erwartet, 990); A.equal(r.teilbilanzen.parlament["landtag-berlin"].erwartet, 360);
  A.equal(r.teilbilanzen.parlament["landtag-brandenburg"].erwartet, 150); geschlossen(r);
});
test("Vorabplan bindet die Szenarioachsen und konkrete Vergleichsprofile aller500", () => {
  A(basis.sollplan.sollpositionen.every(s => s.positiveZuordnung.themen.length === 2 && Object.values(s.vergleichsfaelle).every(Boolean)));
});
test("native Startquittung darf spaeter als die geplante Untergrenze sein", () => {
  const r = run(f => { f.belege.lauf.aktivierungsQuittung.aktiviertAm = "2026-10-01T09:11:00.000Z";
    f.belege.lauf.aktivierungsQuittungHash = P.hash(f.belege.lauf.aktivierungsQuittung); });
  A.equal(r.belegpaketBereitZurUnabhaengigenPruefung, true); A.equal(r.laufAktiviertAm, "2026-10-01T09:11:00.000Z");
});
test("Ausgaben vor dem tatsaechlichen Aktivierungsbeginn sind Drift", () => {
  const r = run(f => { f.ergebnisse[0].erzeugtAm = "2026-10-01T09:09:00.000Z"; neuBinden(f); });
  A.equal(r.zaehlungen.hashgedriftet, 1);
});
test("vollstaendige1500Mischbilanz mit nativenBE/BBLage-Standzeilen", () => {
  const r = run(f => {
    const be = standQuelle("berlin"), bb = standQuelle("brandenburg");
    for (let index = 0; index < f.ergebnisse.length; index++) {
      const profil = f.paket.profile[Math.floor(index / 3)], erg = f.ergebnisse[index];
      if (profil.parlament === "bundestag") continue;
      const q = profil.parlament === "landtag-berlin" ? be : bb;
      erg.quellen = erg.bereich === "lage" ? [structuredClone(q)] : [structuredClone(quelle), structuredClone(q)];
      neuBinden(f, index);
      for (const k of f.urteile[index].kriterien) {
        k.belege = k.belege.filter(b => b.ansicht !== "quelle"); k.belege.push({ ansicht: "quelle", quellenId: q.id, zitat: q.text });
      }
    }
    f.belege.quellen.belege.push(...[be, bb].map(q => ({ id: q.id, hash: q.quellenHash, primaerbeleg: "fixture-only-land" })));
  });
  A.equal(r.zaehlungen.positiv, 1500); A.equal(r.belegpaketBereitZurUnabhaengigenPruefung, true); geschlossen(r);
});
for (const land of ["berlin", "brandenburg"]) {
  test(`${land}: tagesgenauerStand ohneUhrzeit ist Lagequelle`, () => { A.equal(N.quelleGueltig(standQuelle(land), "2026-10-01T09:20:00.000Z"), true); });
  test(`${land}: laufenderKalendertag liefert keinen erfundenenZeitpunkt`, () => { A.equal(N.quelleGueltig(standQuelle(land, "2026-10-01"), "2026-10-01T09:20:00.000Z"), false); });
  test(`${land}: widerspruechlicheStandmetadaten keinZeitstempelFallback`, () => {
    const q = standQuelle(land); q.published_at = "2026-09-30T09:00:00.000Z"; q.quellenHash = hashOhne(q, "quellenHash");
    A.equal(N.quelleGueltig(q, "2026-10-01T09:20:00.000Z"), false);
  });
  test(`${land}: Tagesstandallein ist keinBriefingTagesanlass`, () => {
    const q = standQuelle(land), r = run(f => {
      f.ergebnisse[0].quellen = [q]; neuBinden(f);
      for (const k of f.urteile[0].kriterien) { k.belege = k.belege.filter(b => b.ansicht !== "quelle"); k.belege.push({ ansicht: "quelle", quellenId: q.id, zitat: q.text }); }
    });
    A(r.positionen[0].gruende.includes("briefing-ohne-vertraglichen-tagesanlass"));
    A(!r.positionen[0].gruende.includes("originalquellen-fehlen-oder-drift"));
  });
}
test("ohne Exporte alle1500 fehlen", () => { const r = N.bilanziere({ paket: basis.paket, sollplan: basis.sollplan }); A.equal(r.zaehlungen.fehlend, 1500); geschlossen(r); });
test("ein fehlendes Ergebnis ist kein vollstaendiger Nachweis", () => { const r = run(f => f.ergebnisse.pop()); A.equal(r.zaehlungen.fehlend, 1); A.equal(r.belegpaketBereitZurUnabhaengigenPruefung, false); });
test("Duplikat separat mit disjunkter1500Bilanz", () => { const r = run(f => f.ergebnisse.push(structuredClone(f.ergebnisse[0]))); A.equal(r.zaehlungen.doppelt, 1); A.equal(r.zaehlungen.summeStimmt, true); });
test("doppelteIstzeile verschluckt wederLeer nochTechnikfehler", () => {
  const r = run(f => { const dupe = structuredClone(f.ergebnisse[0]); dupe.text = ""; dupe.leer = true; dupe.technischerFehler = "timeout"; f.ergebnisse.push(dupe); });
  A.equal(r.zaehlungen.doppelt, 1); A.equal(r.befundZaehlungen.leer, 1); A.equal(r.befundZaehlungen["technisch-fehlerhaft"], 1);
  A.equal(r.zaehlungen.summeStimmt, true);
});
test("leer trotz positivem Urteil bleibt leer", () => { const r = run(f => { f.ergebnisse[0].text = ""; f.ergebnisse[0].leer = true; neuBinden(f); }); A.equal(r.zaehlungen.leer, 1); });
test("ehrliche Ruhe ist weiterhin separater Leerzustand", () => { const r = run(f => { f.ergebnisse[0].leer = true; f.ergebnisse[0].leerGrund = "keine-belastbare-Tagesprioritaet"; neuBinden(f); }); A.equal(r.beobachteteBefunde.leer[0].grund, "keine-belastbare-Tagesprioritaet"); });
test("Fehler und leer sind beide beobachtet", () => { const r = run(f => { f.ergebnisse[0].technischerFehler = "timeout"; f.ergebnisse[0].leer = true; neuBinden(f); }); A.equal(r.zaehlungen["technisch-fehlerhaft"], 1); A.equal(r.beobachteteBefunde.leer.length, 1); });
test("Inputhash Drift auch bei gleichen Fachurteilen", () => { const r = run(f => { f.ergebnisse[0].text += " drift"; }); A.equal(r.zaehlungen.hashgedriftet, 1); });
test("fachlich negatives Urteil ist unbrauchbar", () => { const r = run(f => { f.urteile[0].kriterien[0].urteil = "nicht-bestanden"; }); A.equal(r.zaehlungen.unbrauchbar, 1); });
test("fehlende Fachurteile kein strukturelles Gruen", () => { const r = run(f => { f.urteile = []; }); A.equal(r.zaehlungen.unbrauchbar, 1500); });
test("blanko positive Behauptung scheitert", () => { const r = run(f => { f.urteile[0] = { ...f.urteile[0], bestanden: true, kriterien: [] }; }); A.equal(r.zaehlungen.unbrauchbar, 1); });
test("falsche Textstelle scheitert", () => { const r = run(f => { f.urteile[0].kriterien[0].belege[0].zitat = "Diese Quelle gibt es nicht im Originaltext."; }); A.equal(r.zaehlungen.unbrauchbar, 1); });
test("vollstaendige Bereichsansichten zwingend", () => { const r = run(f => { f.urteile[0].kriterien.find(k => k.kriterium === "bereichstrennung").belege = [{ ansicht: "lage", zitat: f.sichten[0].ausgaben.lage.text }]; }); A.equal(r.zaehlungen.unbrauchbar, 1); });
test("Originalquelle ist kein Zitat aus KI-Ausgabe", () => { const r = run(f => { const k = f.urteile[0].kriterien.find(k => k.kriterium === "quellenbindung"); k.belege = [{ ansicht: "ausgabe", zitat: f.ergebnisse[0].text }]; }); A.equal(r.zaehlungen.unbrauchbar, 1); });
test("spaeter geaenderte Radaransicht sperrt alle3Positionen", () => { const r = run(f => { f.sichten[0].radar.text += " drift"; }); A.equal(r.zaehlungen.unbrauchbar, 3); });
test("keine fiktiven persoenlichen Radartreffer", () => { const r = run(f => { f.sichten[0].radar.ueberDich.push({ person: "Fiktive Testperson" }); f.sichten[0].sichtHash = N.sichtHash(f.sichten[0]); }); A.equal(r.zaehlungen.unbrauchbar, 3); });
test("Artikelzahl allein kein Radarsignal", () => { const r = run(f => { f.sichten[0].radar.signale.push({ art: "weitere-berichte", quellen: [quelle] }); f.sichten[0].sichtHash = N.sichtHash(f.sichten[0]); }); A.equal(r.zaehlungen.unbrauchbar, 3); });
test("alte frisch gespeicherte Quelle kein Tagesanlass", () => { const r = run(f => { f.ergebnisse[0].quellen[0].published_at = "2026-09-20T09:00:00.000Z"; f.ergebnisse[0].quellen[0].quellenHash = hashOhne(f.ergebnisse[0].quellen[0], "quellenHash"); neuBinden(f); }); A(r.positionen[0].gruende.includes("briefing-ohne-vertraglichen-tagesanlass")); });
test("ungekuerzter Primärdatensatz statt freier Textkopie", () => { const r = run(f => { f.ergebnisse[0].rohdatensatz.text = "Andere Primaerdaten"; f.ergebnisse[0].ergebnisHash = N.ergebnisHash(f.ergebnisse[0]); }); A.equal(r.zaehlungen.hashgedriftet, 1); });
test("unerwartete IDs/Bereiche/Urteile vollstaendig ausgewiesen", () => { const r = run(f => { f.ergebnisse.push({ mandatsId: "fremd", bereich: "lage" }); f.urteile.push({ mandatsId: "fremd", bereich: "lage" }); f.sichten.push({ mandatsId: "fremd" }); }); A.equal(r.beobachteteBefunde.unerwartet.length, 3); });
test("eine ErgebnisID fuer mehrere Slots verhindert bereit", () => { const r = run(f => { f.ergebnisse[1].ergebnisId = f.ergebnisse[0].ergebnisId; }); A.equal(r.doppelteErgebnisIds.length, 1); A.equal(r.belegpaketBereitZurUnabhaengigenPruefung, false); });
test("Sollplan nach Lauf neu datieren oder Kriterien senken scheitert", () => { const f = structuredClone(basis); f.sollplan.kriteriensatz.zeitbezug = "Immer bestanden"; f.sollplan.sollplanHash = hashOhne(f.sollplan, "sollplanHash"); A.throws(() => N.bilanziere(f), /sollplan-drift/); });
test("native Aktiv/Endzeitstempel duerfen wechseln, Fachfelder bleiben gebunden", () => {
  const r = run(f => { f.belege.gleichzeitigAktiv.mandate_profiles[0].updated_at = "2026-10-01T09:10:00.000Z";
    f.belege.gleichzeitigAktiv.bestandsHash = P.hash(f.belege.gleichzeitigAktiv.mandate_profiles);
    f.belege.ende.mandate_profiles[0].updated_at = "2026-10-01T10:00:00.000Z";
    f.belege.ende.bestandsHash = P.hash(f.belege.ende.mandate_profiles); });
  A.equal(r.belegpaketBereitZurUnabhaengigenPruefung, true);
});
test("nativeLesungen in andererReihenfolge bleiben semantisch gebunden", () => {
  const r = run(f => { f.belege.gleichzeitigAktiv.profiles.reverse(); f.belege.ende.profiles.reverse();
    f.belege.gleichzeitigAktiv.mandate_profiles.reverse(); f.belege.gleichzeitigAktiv.bestandsHash = P.hash(f.belege.gleichzeitigAktiv.mandate_profiles);
  }); A.equal(r.belegpaketBereitZurUnabhaengigenPruefung, true);
});
test("unmoeglichesKalenderdatum wird nicht stillverschoben", () => { A.throws(() => N.erzeugeSollplan(basis.paket, { ...basis.sollplan, definiertAm: "2026-02-30T09:00:00.000Z" }), /sollplan-kontext/); });
test("vorab Definitionszeit ist Pflicht", () => { A.throws(() => N.erzeugeSollplan(basis.paket, { ...basis.sollplan, definiertAm: basis.sollplan.endsAt }), /sollplan-kontext/); });
for (const [name, mut, grund] of [
  ["exakt500 gleichzeitig aktive statt499", f => f.belege.gleichzeitigAktiv.aktiveIds.pop(), "exakt500-gleichzeitig-aktiv-nicht-belegt"],
  ["native Teilaktivierung499", f => { f.belege.gleichzeitigAktiv.mandate_profiles[0].aktiv = false; f.belege.gleichzeitigAktiv.bestandsHash = P.hash(f.belege.gleichzeitigAktiv.mandate_profiles); }, "aktive-primaerprofile-fehlen-oder-drift"],
  ["501nativeMandate statt500", f => f.belege.gleichzeitigAktiv.mandate_profiles.push({ user_id: "extra", aktiv: true }), "aktive-primaerprofile-fehlen-oder-drift"],
  ["Aktivsnapshot erst nach Ende", f => f.belege.gleichzeitigAktiv.beobachtetAm = "2026-10-01T10:05:00.000Z", "exakt500-gleichzeitig-aktiv-nicht-belegt"],
  ["Aktivsnapshot vor Ist-Aktivierung", f => f.belege.gleichzeitigAktiv.beobachtetAm = "2026-10-01T09:09:00.000Z", "exakt500-gleichzeitig-aktiv-nicht-belegt"],
  ["Identitaeten nur als501Behauptung", f => delete f.belege.gleichzeitigAktiv.profiles, "aktive-primaeridentitaeten-fehlen-oder-drift"],
  ["Identitaetsdrift nach Ende", f => { f.belege.ende.profiles[500].id = "anderesFremdprofil"; }, "end-primaeridentitaeten-fehlen-oder-drift"],
  ["Profilfachdrift trotz0aktiv", f => { f.belege.ende.mandate_profiles[0].fremdesFeld = "drift"; f.belege.ende.bestandsHash = P.hash(f.belege.ende.mandate_profiles); }, "profilfachfelder-drift-zwischen-aktiv-und-ende"],
  ["fehlendes Deployment", f => f.belege.lauf.deploymentId = "dpl_fremd", "lauf-deployment-zeitraum-beleg-fehlt"],
  ["falsches RuntimeManifest", f => f.belege.lauf.runtimeManifestHash = "a".repeat(64), "lauf-deployment-zeitraum-beleg-fehlt"],
  ["Kostenreservierungen zaehlen gegen7", f => f.belege.kosten.auftragReserviertUsd = 6, "kostenbeleg-fehlt-oder-grenze-verletzt"],
  ["Tagesriegel6 bleibt hart", f => f.belege.kosten.utcTage[0].reserviertUsd = 6, "kostenbeleg-fehlt-oder-grenze-verletzt"],
  ["fehlender UTC Kostentag", f => f.belege.kosten.utcTage[0].tag = "2026-09-30", "kosten-utc-tage-unvollstaendig"],
  ["Endzustand0aktiv zwingend", f => f.belege.ende.aktiv = 1, "endzustand-rueckweg-nicht-belegt"],
  ["Rueckweg gebunden", f => delete f.belege.ende.rueckwegHash, "endzustand-rueckweg-nicht-belegt"],
  ["kein erfundenes RuntimeHash ohne Manifest", f => delete f.belege.lauf.runtimeManifest, "runtime-primaermanifest-fehlt-oder-drift"],
  ["keine Aktivierung ohne native Quittung", f => delete f.belege.lauf.aktivierungsQuittung, "aktivierungs-primaerquittung-fehlt-oder-drift"],
  ["summierte Aktivzahl ohne500native Profile", f => delete f.belege.gleichzeitigAktiv.mandate_profiles, "aktive-primaerprofile-fehlen-oder-drift"],
  ["summierter Endzustand ohne native Profile", f => delete f.belege.ende.mandate_profiles, "end-primaerprofile-fehlen-oder-drift"],
  ["Endhash ohne native Endquittung", f => delete f.belege.ende.endquittung, "end-primaerquittung-fehlt-oder-drift"],
  ["vollstaendiger Quellenprimaerindex", f => f.belege.quellen.belege = [], "ausgabe-quellen-nicht-vollstaendig-im-primaerindex"],
]) test(name, () => { const r = run(mut); A(r.belegLuecken.includes(grund)); A.equal(r.belegpaketBereitZurUnabhaengigenPruefung, false); geschlossen(r); });
test("ungueltige JSON-Teilstuecke werden bilanziert statt abzustuerzen", () => { const r = run(f => {
  f.urteile[0].kriterien[0].belege = [null]; f.belege.quellen.belege = "keine-Liste"; f.belege.kosten.utcTage = [null];
}); A.equal(r.zaehlungen.unbrauchbar, 1); A(r.belegLuecken.length > 0); });
test("widerspruechliche nativeRadarsignalquelle wird unbrauchbar statt Parserabsturz", () => {
  const r = run(f => { const q = standQuelle("berlin"); q.published_at = "2026-09-30T09:00:00.000Z";
    f.sichten[0].radar.signale = [{ art: "weitere-berichte", quellen: [q] }]; f.sichten[0].sichtHash = N.sichtHash(f.sichten[0]); });
  A.equal(r.zaehlungen.unbrauchbar, 3);
});
test("CLI nur lokale Input und privater Out", () => { A.throws(() => CLI.argumente(["--production", "ja"]), /cli-argumente/); A.equal(CLI.argumente(["--paket", "p", "--sollplan", "s", "--export", "e", "--out", "o"]).out, "o"); });
test("CLI liest alle1500 und schreibt0600 privat ohne Textausgabe", () => {
  const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-synthetik-nachweis-test-")), logs = [], altLog = console.log;
  try {
    for (const [name, obj] of [["paket", basis.paket], ["sollplan", basis.sollplan], ["export", basis]])
      fs.writeFileSync(path.join(dir, name + ".json"), JSON.stringify(obj), { mode: 0o600 });
    console.log = value => logs.push(value);
    const args = ["--paket", path.join(dir, "paket.json"), "--sollplan", path.join(dir, "sollplan.json"), "--export", path.join(dir, "export.json"), "--out", path.join(dir, "report.json")];
    const r = CLI.main(args); A.equal(r.positionen.length, 1500); A.equal(fs.statSync(path.join(dir, "report.json")).mode & 0o777, 0o600);
    A(!logs.join(" ").includes("Testperson")); A(!logs.join(" ").includes("test-kohorte")); A.throws(() => CLI.main(args), /EEXIST/);
    args[7] = path.join(__dirname, "unerlaubte-nachweis-ausgabe.json"); A.throws(() => CLI.main(args), /ausgabe-im-repository/);
  } finally { console.log = altLog; fs.rmSync(dir, { recursive: true, force: true }); }
});
console.log(`synthetik-500-nachweis: ${anzahl}/${anzahl} gezielte Offline-Pruefungen bestanden; keine Production-Abnahme.`);
