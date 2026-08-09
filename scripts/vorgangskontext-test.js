"use strict";

// Helmut — Testsuite OP-25 K2.1: KONTEXTGEBUNDENE VORGANGSBILDUNG.
// =============================================================================================
// AUFTRAG (K2.1): den teuren Abruf global machen, die fachliche Vorgangsbildung aber in einem
// kontrollierten Kontext halten — so, dass Quellen eines anderen Mandats die Vorgangsidentitaet
// nicht veraendern koennen.
//
// VORGESCHICHTE, in zwei Saetzen:
//   K1 hat den Abruf global gemacht und dabei UNBEABSICHTIGT auch die Buendelung global gemacht.
//   K2 hat gemessen, dass genau das nicht aktivierungsfaehig ist (Befund K1-1a/b/c,
//   `scripts/globalphase-buendelung-test.js`, `docs/betrieb/cron-globalphase.md` §8a).
//
// DIE K2.1-ANTWORT, in einem Satz:
//   Das LOSE Clusterregime wird an die SICHTBARKEITSMENGE gebunden; das STRENGE Regime
//   (`resolveVorgang`) bleibt global und unveraendert.
//
// ERGEBNIS DIESER SUITE (Abschnitt 3, gemessen, nicht behauptet):
//   In ALLEN sechzehn Fallfamilien liefert der K2.1-Pfad exakt dieselbe Vorgangsgruppierung wie
//   der heutige Altpfad — auch in den sechs Familien, in denen der K1-Pfad eine andere liefert.
//   Befund K1-1 kann im neuen Pfad also nicht auftreten.
//
// WAS DIESE SUITE NICHT BEHAUPTET — ehrlich benannt:
//   - Sie behauptet NICHT, dass K2.1 die Vorgangsbildung VERBESSERT. Sie erhaelt den heutigen
//     Stand, einschliesslich seiner bekannten Schwaechen: F10 und Z2 verschmelzen in BEIDEN
//     Pfaden faelschlich (Formularvokabular, K2 §8a.2). Das ist Bestand und ausdruecklich NICHT
//     Gegenstand dieses Sprints.
//   - Sie behauptet NICHT, dass das STRENGE Regime nie ueber Mandatsgrenzen wirkt. Es tut es —
//     genau wie heute, und genau deshalb koennen gleiche Bundestagsvorgaenge weiterhin
//     wiederverwendet werden (Abnahmekriterium 13). Der Beweis ist die GLEICHHEIT mit heute,
//     nicht eine neue Trennung.
//   - Sie misst KEINE Production-Haeufigkeit. Die Faelle sind konstruiert.
//
// Deterministisch und offline: kein Netz, keine KI, keine Uhr im Ergebnis, keine
// Production-Daten. Der KI-Aufruf ist ein Testdouble; Ankerbildung, Clusterbildung, Kennung,
// Resolver, Verknuepfung und Schemapruefung sind der ECHTE Produktionscode.
//
// Aufbau:
//   1  Flaggrenze und Pfadwahl
//   2  Kontextvertrag — Sichtbarkeit, Partition, Geschlossenheit, Determinismus
//   3  Die sechzehn Fallfamilien durch DREI Pfade
//   4  Die dreizehn Abnahmekriterien, einzeln
//   5  Adversariale Proben
//   6  Zeitbudget — keine Erhoehung
//   7  Kapazitaet — drei Pfade, n = 1, 2, 6, 11
//   8  Sicherheitsgrenzen und Quelltextriegel

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const G = require(path.join(ROOT, "scripts", "vorgangskontext-geruest.js"));
const K = require(path.join(ROOT, "lib", "helmut", "vorgangskontext.js"));
const GP = require(path.join(ROOT, "lib", "helmut", "cron-globalphase.js"));
const V = require(path.join(ROOT, "lib", "helmut", "vorgang-identity.js"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(titel) { console.log(`\n== ${titel} ==`); }
function info(text) { console.log(`  INFO  ${text}`); }

const ALLE_FAMILIEN = [...G.FAMILIEN, ...G.ZUSATZFAMILIEN];

(async () => {
  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("1 · Flaggrenze und Pfadwahl");
  {
    check("1.1 DEFAULT AUS: ohne gesetzte Variable ist der Kontextpfad aus",
      K.kontextpfadEnabled({}) === false && K.kontextpfadEnabled({ HELMUT_CRON_GLOBALABRUF: "" }) === false);
    check("1.2 fail closed: nur ausdrueckliche Zusagen schalten ein",
      ["on", "true", "1", "an", "ON", " On "].every((v) => K.kontextpfadEnabled({ HELMUT_CRON_GLOBALABRUF: v }) === true)
      && ["off", "no", "aus", "onn", "0", "ja", "yes", "enabled"].every((v) => K.kontextpfadEnabled({ HELMUT_CRON_GLOBALABRUF: v }) === false));
    check("1.3 die Pfadwahl faellt ohne Flagge auf den ALTPFAD",
      GP.waehleCronPfad({}).pfad === "alt" && GP.waehleCronPfad({}).grund === "default-aus");
    check("1.4 nur `HELMUT_CRON_GLOBALABRUF` -> Kontextpfad",
      GP.waehleCronPfad({ HELMUT_CRON_GLOBALABRUF: "on" }).pfad === "kontext");
    check("1.5 nur `HELMUT_CRON_GLOBALPHASE` -> K1-Pfad (unveraendert erreichbar)",
      GP.waehleCronPfad({ HELMUT_CRON_GLOBALPHASE: "on" }).pfad === "globalphase");
    check("1.6 BEIDE Flaggen gesetzt -> ALTPFAD, ausdruecklich als Widerspruch benannt", (() => {
      const w = GP.waehleCronPfad({ HELMUT_CRON_GLOBALPHASE: "on", HELMUT_CRON_GLOBALABRUF: "on" });
      return w.pfad === "alt" && w.widerspruch === true;
    })());
    const flagsDatei = JSON.parse(fs.readFileSync(path.join(ROOT, "helmut-flags.json"), "utf8"));
    const flagsSrc = fs.readFileSync(path.join(ROOT, "lib", "helmut", "flags.js"), "utf8");
    check("1.7 das Flag ist NICHT ueber `helmut-flags.json` aktivierbar (nicht in der Allowlist)",
      !Object.keys(flagsDatei).includes("HELMUT_CRON_GLOBALABRUF")
      && !/HELMUT_CRON_GLOBALABRUF/.test(flagsSrc));
    check("1.8 das Flag ist in dieser Umgebung NICHT gesetzt (kein Testlauf aktiviert es)",
      K.kontextpfadEnabled(process.env) === false);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("2 · Kontextvertrag — Sichtbarkeit, Partition, Geschlossenheit, Determinismus");
  {
    check("2.1 die Signatur ist kanonisch und reihenfolgeunabhaengig",
      K.sichtbarkeitsSignatur(["b", "a"]) === K.sichtbarkeitsSignatur(["a", "b"])
      && K.sichtbarkeitsSignatur(["a", "a", "b"]) === "a|b"
      && K.sichtbarkeitsSignatur([]) === null);

    const herkunft = { geteilt: ["m1", "m2"], eigenA: ["m1"], eigenB: ["m2"] };
    const docs = [
      G.dok("d1", "geteilt", "Titel eins", "Kurzfassung eins.", G.t(6)),
      G.dok("d2", "eigenA", "Titel zwei", "Kurzfassung zwei.", G.t(7)),
      G.dok("d3", "eigenB", "Titel drei", "Kurzfassung drei.", G.t(8)),
      G.dok("d4", "geteilt", "Titel vier", "Kurzfassung vier.", G.t(9))
    ];
    const plan = K.planKontexte({ dokumente: docs, herkunftJeQuelle: herkunft, reihenfolge: ["m1", "m2"] });
    check("2.2 gleiche Sichtbarkeit -> EIN Kontext; verschiedene Sichtbarkeit -> verschiedene Kontexte",
      plan.gesamt === 3
      && plan.kontexte.find((k) => k.schluessel === "m1|m2").dokumente.length === 2
      && plan.kontexte.find((k) => k.schluessel === "m1").dokumente.length === 1
      && plan.kontexte.find((k) => k.schluessel === "m2").dokumente.length === 1);
    check("2.3 PARTITION: jedes Dokument genau einmal",
      K.pruefePartition({ dokumente: docs, kontexte: plan.kontexte }).ok === true);
    check("2.4 GESCHLOSSEN: jedes Dokument eines Kontexts hat dieselbe Sichtbarkeit",
      K.pruefeAlleKontextgrenzen(plan.kontexte, { herkunftJeQuelle: herkunft }).ok === true);
    check("2.5 der geteilte Kontext steht vorn (er versorgt die meisten Mandate)",
      plan.kontexte[0].schluessel === "m1|m2");

    // FAIL CLOSED: unbekannte Herkunft.
    const mitUnbekannt = [...docs, G.dok("d5", "raetsel", "Titel fuenf", "Kurzfassung fuenf.", G.t(10))];
    const planU = K.planKontexte({ dokumente: mitUnbekannt, herkunftJeQuelle: herkunft, reihenfolge: ["m1", "m2"] });
    const unbekannt = planU.kontexte.filter((k) => k.unbekannt);
    check("2.6 FAIL CLOSED: ein Dokument ohne bestimmbare Sichtbarkeit wird ISOLIERT, nicht geraten",
      unbekannt.length === 1 && unbekannt[0].dokumente.length === 1
      && unbekannt[0].schluessel.startsWith(K.UNBEKANNT_PRAEFIX)
      && unbekannt[0].mandate.length === 0);
    check("2.7 auch das unbekannte Dokument bleibt Teil der Partition (es geht nicht verloren)",
      K.pruefePartition({ dokumente: mitUnbekannt, kontexte: planU.kontexte }).ok === true
      && planU.dokumente === 5);
    check("2.8 unbekannte Dokumente stehen HINTEN (sie duerfen kein Budget vor den bekannten ziehen)",
      planU.kontexte[planU.kontexte.length - 1].unbekannt === true);

    // DETERMINISMUS.
    const gedreht = K.planKontexte({ dokumente: [...docs].reverse(), herkunftJeQuelle: herkunft, reihenfolge: ["m2", "m1"] });
    const signatur = (p) => p.kontexte.map((k) => `${k.schluessel}:${k.dokumente.map((d) => d.id).sort().join("+")}`).sort().join(" | ");
    check("2.9 DETERMINISTISCH: Dokument- und Mandatsreihenfolge aendern die EINTEILUNG nicht",
      signatur(gedreht) === signatur(plan));
    check("2.10 die Mandatsreihenfolge aendert nur die REIHENFOLGE der Kontexte, nicht ihren Inhalt",
      gedreht.kontexte[0].schluessel === "m1|m2" && gedreht.gesamt === plan.gesamt);

    // Mehrfachherkunft eines Dokuments.
    const mehrfach = [{ ...G.dok("d6", "eigenA", "Titel sechs", "Kurzfassung sechs.", G.t(11)), sourceIds: ["eigenA", "eigenB"] }];
    const planM = K.planKontexte({ dokumente: mehrfach, herkunftJeQuelle: herkunft, reihenfolge: ["m1", "m2"] });
    check("2.11 ein Dokument aus ZWEI Quellen erbt die VEREINIGUNG beider Sichtbarkeiten",
      planM.kontexte[0].schluessel === "m1|m2");

    // Je-Dokument-Herkunft (DIP).
    const dip = [
      { ...G.dok("v1", "dip", "Vorgang eins", "Amtliche Kurzfassung eins.", G.t(6)), hash: "v1" },
      { ...G.dok("v2", "dip", "Vorgang zwei", "Amtliche Kurzfassung zwei.", G.t(7)), hash: "v2" }
    ];
    const planD = K.planKontexte({
      dokumente: dip,
      herkunftJeQuelle: { dip: ["m1", "m2"] },
      herkunftJeDokument: { v1: ["m1"], v2: ["m1", "m2"] },
      reihenfolge: ["m1", "m2"]
    });
    check("2.12 DIP: die je-Dokument-Herkunft hat Vorrang vor der Quellenherkunft",
      planD.gesamt === 2
      && planD.kontexte.find((k) => k.schluessel === "m1").dokumente[0].id === "v1"
      && planD.kontexte.find((k) => k.schluessel === "m1|m2").dokumente[0].id === "v2");

    check("2.13 die Kontextgrenzenprobe SCHLAEGT AN, wenn ein Fremddokument eingeschleust wird", (() => {
      const manipuliert = JSON.parse(JSON.stringify(plan.kontexte));
      manipuliert[0].dokumente.push({ id: "fremd", source_id: "eigenB" });
      return K.pruefeKontextgrenze(manipuliert[0], { herkunftJeQuelle: herkunft }).ok === false;
    })());
    check("2.14 die Partitionsprobe SCHLAEGT AN, wenn ein Dokument fehlt", (() => {
      const beschnitten = plan.kontexte.map((k) => ({ ...k, dokumente: k.dokumente.slice(0, 0) }));
      const probe = K.pruefePartition({ dokumente: docs, kontexte: beschnitten });
      return probe.ok === false && probe.fehlend.length === 4;
    })());
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("3 · Die sechzehn Fallfamilien durch DREI Pfade");
  const ergebnisse = [];
  {
    for (const fam of ALLE_FAMILIEN) {
      const batches = G.batchesVon(fam);
      const mandate = G.mandatsIdsVon(fam);
      const alt = await G.altPfad(batches);
      const k1 = await G.k1Pfad(batches);
      const k21 = await G.k21Pfad(batches, mandate);
      const e = {
        fam,
        alt: G.gruppierung(alt.ablage), k1: G.gruppierung(k1.ablage), k21: G.gruppierung(k21.ablage),
        kiAlt: alt.ablage.kiAufrufe(), kiK1: k1.ablage.kiAufrufe(), kiK21: k21.ablage.kiAufrufe(),
        koAlt: alt.ablage.kos.size, koK1: k1.ablage.kos.size, koK21: k21.ablage.kos.size,
        plan: G.kontextPlanFuer(batches, mandate),
        ablageK21: k21.ablage
      };
      ergebnisse.push(e);
      const gleichAlt = e.k21.join("|") === e.alt.join("|");
      const gleichK1 = e.k1.join("|") === e.alt.join("|");
      info(`${fam.id} ${gleichAlt ? "K2.1=alt" : "K2.1≠alt"} · ${gleichK1 ? "K1=alt" : "K1≠alt"}`
        + ` · Kontexte ${e.plan.gesamt} · Gruppen alt ${e.alt.length}/K1 ${e.k1.length}/K2.1 ${e.k21.length}`);
    }

    const abweichendK1 = ergebnisse.filter((e) => e.k1.join("|") !== e.alt.join("|"));
    const abweichendK21 = ergebnisse.filter((e) => e.k21.join("|") !== e.alt.join("|"));
    check("3.1 der K1-Pfad weicht in mehreren Familien vom heutigen Ergebnis ab (Befund K1-1, Bestand)",
      abweichendK1.length >= 6, `abweichend: ${abweichendK1.map((e) => e.fam.id).join(",")}`);
    check("3.2 der K2.1-Pfad weicht in KEINER Familie vom heutigen Ergebnis ab",
      abweichendK21.length === 0, `abweichend: ${abweichendK21.map((e) => e.fam.id).join(",")}`);
    info(`K1 weicht ab in: ${abweichendK1.map((e) => e.fam.id).join(", ")}`);

    for (const e of ergebnisse) {
      check(`3.3·${e.fam.id} K2.1 liefert dieselbe Gruppierung wie heute — ${e.fam.titel}`,
        e.k21.join("|") === e.alt.join("|"), `alt=${e.alt.join(" | ")} k21=${e.k21.join(" | ")}`);
    }
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("4 · Die dreizehn Abnahmekriterien, einzeln");
  {
    // 1 — verschiedene Vorgaenge verschmelzen nicht durch fremde Mandatsquellen.
    const trennFamilien = ergebnisse.filter((e) => e.fam.sollGetrennt);
    const k1Verschmolzen = trennFamilien.filter((e) => e.k1.length < e.alt.length);
    const k21Verschmolzen = trennFamilien.filter((e) => e.k21.length < e.alt.length);
    check("4.1 verschiedene Vorgaenge verschmelzen NICHT durch fremde Mandatsquellen"
      + ` (K1 verschmilzt ${k1Verschmolzen.length}, K2.1 verschmilzt ${k21Verschmolzen.length})`,
      k21Verschmolzen.length === 0 && k1Verschmolzen.length > 0,
      `K1: ${k1Verschmolzen.map((e) => e.fam.id).join(",")}`);

    // 2 — zusammengehoerige Vorgaenge bleiben zusammen.
    const zusammenFamilien = ergebnisse.filter((e) => !e.fam.sollGetrennt);
    check("4.2 zusammengehoerige Vorgaenge bleiben zusammen (keine Familie wird gegenueber heute zerrissen)",
      zusammenFamilien.every((e) => e.k21.length <= e.alt.length));

    // 3 — Ketten laufen nicht unkontrolliert ueber Kontextgrenzen (F12).
    const f12 = ergebnisse.find((e) => e.fam.id === "F12");
    check("4.3 Ketten laufen nicht unkontrolliert ueber die Kontextgrenze (F12: x~y, y~z, x!~z)",
      f12.k21.length === 2 && f12.k1.length === 1,
      `k21=${f12.k21.join(" | ")} k1=${f12.k1.join(" | ")}`);

    // 4 — Reihenfolge. HIER WIRD GEMESSEN, NICHT BEHAUPTET, und das Ergebnis ist unbequem:
    // die KONTEXTEINTEILUNG ist reihenfolgeunabhaengig (2.9), das ENDERGEBNIS aber nicht in
    // jedem Fall — weil das unveraenderte STRENGE Regime (`resolveVorgang`) Kandidaten nach
    // `updated_at` sortiert und damit davon abhaengt, welcher Cluster zuerst verarbeitet wurde.
    // Genau dieselbe Abhaengigkeit hat der HEUTIGE Altpfad (K2 §8a.3, Familien F3/F7/F13).
    // Die belastbare Zusage ist deshalb: K2.1 ist NICHT reihenfolgeempfindlicher als heute.
    const dokUnstabil = [];
    const mandatUnstabilK21 = [];
    const mandatUnstabilAlt = [];
    for (const fam of ALLE_FAMILIEN) {
      const batches = G.batchesVon(fam);
      const mandate = G.mandatsIdsVon(fam);
      const basis = G.gruppierung((await G.k21Pfad(batches, mandate)).ablage).join("|");
      const dokGedreht = G.gruppierung((await G.k21Pfad(batches.map((b) => [...b].reverse()), mandate)).ablage).join("|");
      const mandatGedreht = G.gruppierung((await G.k21Pfad([...batches].reverse(), [...mandate].reverse())).ablage).join("|");
      if (basis !== dokGedreht) dokUnstabil.push(fam.id);
      if (basis !== mandatGedreht) mandatUnstabilK21.push(fam.id);
      const basisAlt = G.gruppierung((await G.altPfad(batches)).ablage).join("|");
      const altGedreht = G.gruppierung((await G.altPfad([...batches].reverse())).ablage).join("|");
      if (basisAlt !== altGedreht) mandatUnstabilAlt.push(fam.id);
    }
    check("4.4a die DOKUMENTREIHENFOLGE innerhalb einer Quelle veraendert das Ergebnis nie",
      dokUnstabil.length === 0, `abweichend: ${dokUnstabil.join(",")}`);
    check("4.4b die MANDATSREIHENFOLGE veraendert im K2.1-Pfad genau dieselben Familien wie heute"
      + " — K2.1 ist nicht reihenfolgeempfindlicher als der Bestand",
      mandatUnstabilK21.join(",") === mandatUnstabilAlt.join(","),
      `K2.1: ${mandatUnstabilK21.join(",")} · alt: ${mandatUnstabilAlt.join(",")}`);
    info(`Reihenfolgeempfindlich (Bestand, unveraendert): ${mandatUnstabilAlt.join(", ") || "keine"}.`
      + " Ursache ist die Kandidatensortierung im strengen Regime, nicht die Kontexteinteilung.");
    check("4.4c die KONTEXTEINTEILUNG selbst ist in allen Familien reihenfolgeunabhaengig", (() => {
      for (const fam of ALLE_FAMILIEN) {
        const batches = G.batchesVon(fam);
        const mandate = G.mandatsIdsVon(fam);
        const sig = (p) => p.kontexte.map((k) => `${k.schluessel}:${k.dokumente.map((d) => d.id).sort().join("+")}`).sort().join(" | ");
        if (sig(G.kontextPlanFuer(batches, mandate)) !== sig(G.kontextPlanFuer([...batches].reverse(), [...mandate].reverse()))) return false;
      }
      return true;
    })());

    // 5 + 6 — kein Dokument geht verloren, jedes bleibt eindeutig nachvollziehbar.
    let verloren = 0;
    let mehrfachVerknuepft = 0;
    for (const e of ergebnisse) {
      const alle = G.alleDokumente(e.fam).map((d) => d.id).sort();
      const zuordnung = e.ablageK21.zuordnung();
      for (const id of alle) {
        if (!zuordnung.has(id)) verloren += 1;
        else if (zuordnung.get(id).size !== 1) mehrfachVerknuepft += 1;
      }
    }
    check(`4.5 kein Dokument geht verloren (${verloren} verloren)`, verloren === 0);
    check(`4.6 jedes Dokument haengt an GENAU EINEM Vorgang (${mehrfachVerknuepft} mehrfach)`, mehrfachVerknuepft === 0);

    // 7 — keine unkontrollierte KO-Vervielfachung.
    const koSummeAlt = ergebnisse.reduce((s, e) => s + e.koAlt, 0);
    const koSummeK21 = ergebnisse.reduce((s, e) => s + e.koK21, 0);
    const koSummeK1 = ergebnisse.reduce((s, e) => s + e.koK1, 0);
    check(`4.7 keine unkontrollierte KO-Vervielfachung (alt ${koSummeAlt} · K1 ${koSummeK1} · K2.1 ${koSummeK21})`,
      koSummeK21 === koSummeAlt);
    check("4.8 in KEINER Familie erzeugt K2.1 mehr Wissensobjekte als der heutige Pfad",
      ergebnisse.every((e) => e.koK21 <= e.koAlt), ergebnisse.filter((e) => e.koK21 > e.koAlt).map((e) => e.fam.id).join(","));

    // 8 + 9 — Matching und Entscheidungen bleiben korrekt: beide arbeiten auf dem
    // Wissensobjekt. Gleiche Wissensobjekte + gleiche Verknuepfungen = gleiche Grundlage.
    const identischeVerknuepfung = ergebnisse.every((e) => e.k21.join("|") === e.alt.join("|"));
    check("4.9 Matching bleibt fachlich korrekt (identische Wissensobjekte und Verknuepfungen wie heute)",
      identischeVerknuepfung && koSummeK21 === koSummeAlt);
    check("4.10 Entscheidungen bleiben korrekt (sie haengen ausschliesslich am Wissensobjekt — dieselbe Grundlage)",
      identischeVerknuepfung);

    // 10 — Lage und Briefing erhalten keine verschmolzenen Digest-Cluster.
    const digestGrenze = V.MAX_CLUSTER_DOKUMENTE || 12;
    const groessteGruppe = (liste) => Math.max(0, ...liste.map((g) => g.split(",").length));
    check(`4.11 Lage und Briefing erhalten keine verschmolzenen Digest-Cluster (groesste Gruppe K2.1: `
      + `${Math.max(...ergebnisse.map((e) => groessteGruppe(e.k21)))}, Grenze ${digestGrenze})`,
      ergebnisse.every((e) => groessteGruppe(e.k21) <= groessteGruppe(e.alt)));

    // 11 — Mandantentrennung.
    let mandantenbezug = 0;
    for (const e of ergebnisse) {
      for (const ko of e.ablageK21.kos.values()) {
        if (ko.user_id || ko.politician_id || ko.mandat_id) mandantenbezug += 1;
      }
    }
    check("4.12 Mandantentrennung bleibt vollstaendig erhalten (Wissensobjekte tragen keinen Mandantenbezug)",
      mandantenbezug === 0);
    check("4.13 der Kontext ist KEINE Mandats-ID: geteilte Quellen bilden EINEN Kontext ueber alle Mandate", (() => {
      const z1 = ergebnisse.find((e) => e.fam.id === "Z1");
      // Vier Mandate, zwei disjunkte geteilte Quellen -> zwei Kontexte, NICHT vier.
      return z1.plan.gesamt === 2 && z1.plan.kontexte.every((k) => k.mandate.length === 2);
    })());

    // 12 — Personen-, Partei-, Ausschuss- und allgemeine Quellen funktionieren.
    const quellenklassen = {
      person: ["F8", "F9", "Z3"], partei: ["F7", "F11"], ausschuss: ["F6", "F10", "Z2"], allgemein: ["F2", "F5"]
    };
    for (const [klasse, ids] of Object.entries(quellenklassen)) {
      const teil = ergebnisse.filter((e) => ids.includes(e.fam.id));
      check(`4.14·${klasse} ${klasse}-Quellen funktionieren (${ids.join(",")}: Gruppierung wie heute)`,
        teil.length === ids.length && teil.every((e) => e.k21.join("|") === e.alt.join("|")));
    }

    // 13 — gleiche Bundestagsvorgaenge bleiben wiederverwendbar (das strenge Regime wirkt weiter).
    const f1 = ergebnisse.find((e) => e.fam.id === "F1");
    check("4.15 gleiche Bundestagsvorgaenge bleiben wiederverwendbar: amtliches Dokument und Personenquelle"
      + " eines anderen Mandats landen ueber das STRENGE Regime in EINEM Vorgang",
      f1.k21.length === 1 && f1.plan.gesamt === 2,
      `k21=${f1.k21.join(" | ")} kontexte=${f1.plan.gesamt}`);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("5 · Adversariale Proben");
  {
    // 5.1 Formularvokabular als falscher Beweis.
    const f11 = ergebnisse.find((e) => e.fam.id === "F11");
    const f9 = ergebnisse.find((e) => e.fam.id === "F9");
    check("5.1 Formularvokabular traegt im K2.1-Pfad keinen falschen Beweis ueber die Kontextgrenze"
      + " (F9, F11 bleiben getrennt — im K1-Pfad verschmelzen sie)",
      f11.k21.length === 2 && f9.k21.length === 2 && f11.k1.length === 1 && f9.k1.length === 1);

    // 5.2 Sehr aehnliche Titel verschiedener Vorgaenge / gleicher Drucksachentyp, andere Nummer.
    const f4 = ergebnisse.find((e) => e.fam.id === "F4");
    const z3 = ergebnisse.find((e) => e.fam.id === "Z3");
    check("5.2 sehr aehnliche Titel und gleiche Drucksachentypen mit anderer Nummer bleiben getrennt (F4, Z3)",
      f4.k21.length === 2 && z3.k21.length === 2);

    // 5.3 Personenquelle eines Mandats gegen Ausschussquelle eines anderen.
    const z2 = ergebnisse.find((e) => e.fam.id === "Z2");
    check("5.3 Personenquelle gegen fremde Ausschussquelle: K2.1 verhaelt sich EXAKT wie heute"
      + " (beide verschmelzen ueber das unveraenderte strenge Regime — Bestand, nicht durch K2.1 erzeugt)",
      z2.k21.join("|") === z2.alt.join("|"));
    info("Z2 und F10 verschmelzen in BEIDEN Pfaden. Das ist der Bestandsbefund aus K2 §8a.2"
      + " (Formularvokabular im strengen Regime) und ausdruecklich nicht Gegenstand dieses Sprints.");

    // 5.4 Wiederholung ueber mehrere Laeufe — derselbe Korpus zweimal.
    let wiederholungStabil = true;
    const instabil = [];
    for (const fam of ALLE_FAMILIEN) {
      const batches = G.batchesVon(fam);
      const mandate = G.mandatsIdsVon(fam);
      const erst = await G.k21Pfad(batches, mandate);
      const nachZwei = await G.k21Pfad(batches, mandate, { ablage: erst.ablage });
      if (G.gruppierung(nachZwei.ablage).join("|") !== G.gruppierung(erst.ablage).join("|")) {
        wiederholungStabil = false; instabil.push(fam.id);
      }
    }
    check("5.4 Wiederholung ueber mehrere Laeufe aendert die Gruppierung nicht (Idempotenz)",
      wiederholungStabil, `instabil: ${instabil.join(",")}`);

    // 5.5 Unvollstaendiger Datenstand: ein Kontext faellt aus (Budget), der Rest bleibt korrekt.
    let teilStabil = true;
    const teilAbweichend = [];
    for (const fam of ALLE_FAMILIEN) {
      const batches = G.batchesVon(fam);
      const mandate = G.mandatsIdsVon(fam);
      const plan = G.kontextPlanFuer(batches, mandate);
      if (plan.gesamt < 2) continue;
      // Nur der erste Kontext laeuft (Budget erschoepft) — danach der Rest im naechsten Lauf.
      const ersterLauf = await G.laufe([plan.kontexte[0].dokumente]);
      const restLauf = await G.laufe(plan.kontexte.slice(1).map((k) => k.dokumente), { ablage: ersterLauf.ablage });
      const vollstaendig = await G.k21Pfad(batches, mandate);
      if (G.gruppierung(restLauf.ablage).join("|") !== G.gruppierung(vollstaendig.ablage).join("|")) {
        teilStabil = false; teilAbweichend.push(fam.id);
      }
    }
    check("5.5 ein unvollstaendiger Datenstand fuehrt nach dem Nachholen zum GLEICHEN Ergebnis"
      + " (ein Teilzustand wird nicht als vollstaendig behandelt)",
      teilStabil, `abweichend: ${teilAbweichend.join(",")}`);

    // 5.6 Feindliche Eingaben zerstoeren die Partition nicht.
    const feindlich = [
      G.dok("x1", "geteilt", "", "", G.t(6)),
      { id: "x2", source_id: "geteilt", title: "2026 2026 2026", summary: "2026" },
      { id: "x3", source_id: null, title: "ohne Quelle", summary: "kein Bezug" },
      { id: "", source_id: "geteilt", title: "ohne Kennung", summary: "kein Bezug" }
    ];
    const planF = K.planKontexte({ dokumente: feindlich, herkunftJeQuelle: { geteilt: ["m1", "m2"] }, reihenfolge: ["m1"] });
    check("5.6 feindliche Eingaben (leer, nur Jahreszahlen, ohne Quelle, ohne Kennung) zerstoeren die Partition nicht",
      K.pruefePartition({ dokumente: feindlich, kontexte: planF.kontexte }).ok === true
      && planF.dokumente === 4);

    // 5.7 Ein Mandat mehr aendert die Kontexte der anderen nicht.
    const basisPlan = K.planKontexte({
      dokumente: [G.dok("y1", "geteilt", "Titel", "Kurzfassung.", G.t(6)), G.dok("y2", "eigenA", "Titel", "Kurzfassung.", G.t(7))],
      herkunftJeQuelle: { geteilt: ["m1", "m2"], eigenA: ["m1"] }, reihenfolge: ["m1", "m2"]
    });
    const mitDrittem = K.planKontexte({
      dokumente: [G.dok("y1", "geteilt", "Titel", "Kurzfassung.", G.t(6)), G.dok("y2", "eigenA", "Titel", "Kurzfassung.", G.t(7)),
        G.dok("y3", "eigenC", "Titel", "Kurzfassung.", G.t(8))],
      herkunftJeQuelle: { geteilt: ["m1", "m2"], eigenA: ["m1"], eigenC: ["m3"] }, reihenfolge: ["m1", "m2", "m3"]
    });
    check("5.7 ein zusaetzliches Mandat aendert die Kontexte der bestehenden Mandate nicht",
      mitDrittem.kontexte.find((k) => k.schluessel === "m1|m2").dokumente.map((d) => d.id).join(",") === "y1"
      && mitDrittem.kontexte.find((k) => k.schluessel === "m1").dokumente.map((d) => d.id).join(",") === "y2"
      && basisPlan.gesamt === 2 && mitDrittem.gesamt === 3);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("6 · Zeitbudget — keine Erhoehung");
  {
    const scheiben = K.verstehensScheiben({ gesamtMs: 90000, anzahl: 4 });
    check("6.1 die Scheiben summieren sich GENAU auf das Gesamtbudget (letzte Scheibe = Gesamtbudget)",
      scheiben.length === 4 && scheiben[scheiben.length - 1] === 90000);
    check("6.2 die Scheiben sind kumulativ und streng steigend",
      scheiben.every((s, i) => i === 0 || s > scheiben[i - 1]));
    check("6.3 KEIN Kontext bekommt das volle Budget noch einmal", (() => {
      // Der Kontext an Position i darf zum Zeitpunkt `start` nie mehr als seinen kumulativen
      // Anteil bekommen — sonst waere das Budget ver-n-facht statt geteilt.
      for (let i = 0; i < 4; i += 1) {
        const b = K.budgetFuerKontext({ gesamtMs: 90000, anzahl: 4, index: i, startMs: 0, jetztMs: 0 });
        if (b > scheiben[i]) return false;
      }
      return true;
    })());
    check("6.4 nicht verbrauchte Zeit faellt dem naechsten Kontext zu, ueberschreitet aber nie das Gesamtbudget",
      K.budgetFuerKontext({ gesamtMs: 90000, anzahl: 4, index: 3, startMs: 0, jetztMs: 0 }) === 90000
      && K.budgetFuerKontext({ gesamtMs: 90000, anzahl: 4, index: 3, startMs: 0, jetztMs: 90000 }) === 0);
    check("6.5 bei EINEM Kontext ist das Budget unveraendert das bisherige (K1-Pfad byte-gleich)",
      K.budgetFuerKontext({ gesamtMs: 90000, anzahl: 1, index: 0, startMs: 0, jetztMs: 0 }) === 90000);
    check("6.6 ein erschoepftes Budget ergibt 0, nicht `kein Limit`",
      K.budgetFuerKontext({ gesamtMs: 0, anzahl: 3, index: 0, startMs: 0, jetztMs: 0 }) === 0
      && K.verstehensScheiben({ gesamtMs: 0, anzahl: 3 }).length === 0);

    const schedSrc = fs.readFileSync(path.join(ROOT, "lib", "helmut", "scheduler.js"), "utf8");
    check("6.7 die Verstehensbudgets im Quelltext sind unveraendert (90 000 / 60 000 ms, je zweimal)",
      (schedSrc.match(/HELMUT_CRAWL_UNDERSTAND_BUDGET_MS \|\| 90000/g) || []).length === 2
      && (schedSrc.match(/HELMUT_CRAWL_LAZY_BUDGET_MS \|\| 60000/g) || []).length === 2);
    check("6.8 der Kontextpfad TEILT das Budget (er ruft `verstehensScheiben`/`budgetFuerKontext` auf)",
      /vorgangskontext\.verstehensScheiben\(/.test(schedSrc) && /vorgangskontext\.budgetFuerKontext\(/.test(schedSrc));
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("7 · Kapazitaet — drei Pfade, n = 1, 2, 6, 11");
  {
    // Eingangswerte: Production-kalibriert, uebernommen aus K1 (`cron-globalphase.md` §7).
    // Es wird GERECHNET, nicht gemessen — das steht hier ausdruecklich.
    const DEADLINE_MS = 270000;
    const GLOBAL_MS = 240000;      // Obergrenze der Erfassung (HELMUT_CRAWL_GESAMTBUDGET_MS)
    const PROJEKTION_MS = 1650;    // Matching + Entscheidungen je Mandat, Production gemessen
    const RESERVE_MS = 15000;
    const WIEDERHOLUNG = 1;        // Altpfad: jedes Folgemandat zahlt die globale Arbeit erneut

    // WARUM K2.1 UND K1 DIESELBE WANDUHR HABEN — und wo der Preis wirklich liegt:
    // Die globale Phase ist in BEIDEN Pfaden durch dasselbe Budget gedeckelt
    // (`HELMUT_CRAWL_GESAMTBUDGET_MS`, 240 000 ms) und das Verstehensbudget durch dieselben
    // 90 000 ms. K2.1 erhoeht KEINES davon — es TEILT das Verstehensbudget ueber die Kontexte.
    // Der Preis ist deshalb NICHT laengere Laufzeit, sondern weniger im selben Fenster
    // verstandene Cluster: je Kontext faellt ein zusaetzlicher Sperr-Roundtrip an
    // (`runUnderstandingShadow` erwirbt seine globale Sperre je Aufruf).
    const SPERRE_MS = 200;         // konservativ angesetzter Roundtrip je Kontextaufruf

    const zeile = [];
    for (const n of [1, 2, 6, 11]) {
      const sim = GP.kapazitaetsSimulation({
        mandate: n, deadlineMs: DEADLINE_MS, globalMs: GLOBAL_MS, projektionMs: PROJEKTION_MS,
        wiederholungsAnteil: WIEDERHOLUNG, reserveMs: RESERVE_MS
      });
      // GEMESSENE Kontextzahlen aus der Laufzeitsimulation in `cron-globalphase-test.js`
      // Abschnitt 8a3 (dieselbe Profilwelt, derselbe Produktionscode) — keine Annahme.
      const kontexte = { 1: 1, 2: 3, 6: 10, 11: 15 }[n];
      const overheadMs = kontexte * SPERRE_MS;
      const anteilVomVerstehensbudget = overheadMs / 90000;
      zeile.push({ n, kontexte, alt: sim.alt, k1: sim.neu, k21: sim.neu, overheadMs, anteilVomVerstehensbudget });
      info(`n=${n}: alt ${sim.alt.erfolgreich}/${n} begonnen ${sim.alt.begonnen}`
        + ` (${sim.alt.verbrauchtMs} ms, Ueberziehung ${Math.max(0, sim.alt.verbrauchtMs - DEADLINE_MS)} ms)`
        + ` · K1 ${sim.neu.erfolgreich}/${n} · K2.1 ${sim.neu.erfolgreich}/${n}`
        + ` (${kontexte} Kontexte, Aufschlag ${overheadMs} ms = ${(anteilVomVerstehensbudget * 100).toFixed(1)} % des Verstehensbudgets)`);
    }

    check("7.1 der Altpfad erreicht bei n>=2 nicht alle Mandate im 270-s-Fenster",
      zeile.filter((z) => z.n >= 2).every((z) => z.alt.erfolgreich < z.n));
    check("7.2 der K2.1-Pfad erreicht bis n=6 ALLE Mandate im 270-s-Fenster",
      zeile.filter((z) => z.n <= 6).every((z) => z.k21.erfolgreich === z.n));
    check("7.3 der Kapazitaetsgewinn von K1 bleibt in K2.1 VOLLSTAENDIG erhalten"
      + " (gleiche Budgets, gleiche Vereinigungsmenge, gleiche Projektionskosten)",
      zeile.every((z) => z.k21.erfolgreich === z.k1.erfolgreich));
    check("7.4 die Grenzkosten je zusaetzlichem Mandat sinken deutlich (Projektion statt Vollauf)",
      PROJEKTION_MS * 4 < GLOBAL_MS);
    const n11 = zeile.find((z) => z.n === 11);
    check("7.5 bei n=11 bleibt der Altpfad weit zurueck, K2.1 nicht",
      n11.k21.erfolgreich > n11.alt.erfolgreich);
    check("7.6 der Kontextaufschlag bleibt auch bei elf Mandaten (15 gemessene Kontexte) klein gegen das Verstehensbudget (< 5 %)",
      n11.anteilVomVerstehensbudget < 0.05, `${(n11.anteilVomVerstehensbudget * 100).toFixed(1)} %`);
    info(`n=11: K2.1 erreicht ${n11.k21.erfolgreich}/11 · Rest nach globaler Phase ${n11.k21.restNachGlobalMs} ms`
      + ` · Aufschlag ${n11.overheadMs} ms (${(n11.anteilVomVerstehensbudget * 100).toFixed(1)} % des Verstehensbudgets).`);
    info("Diese Zahlen sind eine RECHNUNG aus Production-Eingangswerten, keine Messung."
      + " Die gemessene Groesse dieses Sprints ist die Vorgangsgruppierung (Abschnitt 3).");

    // Abrufwege: die eigentliche Quelle des Kapazitaetsgewinns. Unveraendert gegenueber K1,
    // weil K2.1 an der Vereinigungsmenge NICHTS aendert.
    const gpSrc = fs.readFileSync(path.join(ROOT, "lib", "helmut", "cron-globalphase.js"), "utf8");
    const vereinigungsFunktion = gpSrc.slice(gpSrc.indexOf("function planGlobaleQuellen"), gpSrc.indexOf("function abrufwegeVon"));
    check("7.7 die Vereinigungsmenge der Abrufwege ist unveraendert (K2.1 fasst `planGlobaleQuellen` nicht an)",
      vereinigungsFunktion.length > 500 && !/vorgangskontext|sichtbarkeit|kontext/i.test(vereinigungsFunktion));
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  abschnitt("8 · Sicherheitsgrenzen und Quelltextriegel");
  {
    const schedSrc = fs.readFileSync(path.join(ROOT, "lib", "helmut", "scheduler.js"), "utf8");
    const serverSrc = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    const kSrc = fs.readFileSync(path.join(ROOT, "lib", "helmut", "vorgangskontext.js"), "utf8");
    const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));

    check("8.1 der ALTPFAD ist unveraendert: ohne Flagge derselbe Ausdruck wie bisher",
      /if \(wahl\.pfad === "alt"\) \{\s*\n\s*return runCronForTenants\(cronName, \(tenantId\) => runSourceCrawl\(tenantId\), \{ deadlineMs, runId \}\);/.test(serverSrc));
    check("8.2 `runSourceCrawl` kennt den Kontextbegriff nicht (der Altpfad wurde nicht angefasst)",
      !/vorgangskontext/.test(schedSrc.slice(0, schedSrc.indexOf("OP-25 K1 — SCHATTENPFAD"))));
    check("8.3 die Vorgangsbildung selbst ist unveraendert (kein Eingriff in `vorgang-identity.js`)",
      !/vorgangskontext|Sichtbarkeitsmenge/.test(fs.readFileSync(path.join(ROOT, "lib", "helmut", "vorgang-identity.js"), "utf8")));
    check("8.4 das Understanding ist unveraendert (kein Eingriff in `understanding.js`)",
      !/vorgangskontext/.test(fs.readFileSync(path.join(ROOT, "lib", "helmut", "understanding.js"), "utf8")));
    check("8.5 der Kontextpfad wird NUR ueber `options.buendelung === \"kontext\"` erreicht",
      /const kontextgebunden = options\.buendelung === "kontext";/.test(schedSrc));
    check("8.6 der Kontextvertrag ist ein RIEGEL: eine Verletzung versiegelt FEHLGESCHLAGEN",
      /schritt: "kontextvertrag"[\s\S]{0,300}fatal: true/.test(schedSrc));
    check("8.7 keine Cron-Zeit veraendert",
      (vercel.crons || []).find((c) => c.path === "/api/cron/crawl").schedule === "0 4 * * *"
      && (vercel.crons || []).find((c) => c.path === "/api/cron/pipeline").schedule === "0 16 * * *");
    // 8.8 sagt zu: DER K2.1-SPRINT hat keine Migration mitgebracht. Die urspruengliche
    // Fassung prueft das ueber das DATUM (`/2026073|202608/`) und wuerde damit jede spaetere
    // Migration eines FREMDEN Sprints faelschlich als K2.1-Verstoss melden — sie ist an den
    // Kalender gebunden, nicht an den Gegenstand. Belegt aufgefallen am 2026-08-08 durch
    // 20260808_scalable_job_queue.sql (OP-30, eigener Sprint, eigener Freigabeweg).
    // Die Zusage bleibt vollstaendig erhalten und wird zusaetzlich VERSCHAERFT: keine
    // Migration darf den Kontextpfad ueberhaupt beruehren.
    {
      const FREMDE_SPRINTS = new Set([
        // OP-30, Sprint "Skalierungsgrundlage 1000" — legt ausschliesslich public.helmut_jobs
        // an, fasst keine K2.1-Struktur an (eigener Nachweis: scalable-pipeline-flag-test.js §6).
        "20260808_scalable_job_queue.sql",
        "20260808_scalable_job_queue_rollback.sql",
        // OP-30, Sprint "V3-Anbindung": zaehlt offene Vorbedingungen der eigenen
        // Warteschlangentabelle und stellt Auftraege zurueck. Keine K2.1-Struktur.
        "20260808_jobqueue_abhaengigkeiten.sql",
        "20260808_jobqueue_abhaengigkeiten_rollback.sql",
        // OP-30, Sprint "V3-Anbindung": ergebnisbezogene KI-Budgetreservierung.
        // Beruehrt nur llm_reservations/llm_budget_counters, keine K2.1-Struktur.
        "20260808_llm_budget_fairness.sql",
        "20260808_llm_budget_fairness_rollback.sql",
        // OP-30, finaler Abnahmesprint: sichere Bereinigung der eigenen Warteschlangentabelle
        // (Vorschau + Trockenlauf + stapelweises Loeschen). Beruehrt ausschliesslich
        // public.helmut_jobs, keine K2.1-Struktur. Eigener Nachweis:
        // scripts/jobqueue-bereinigung-test.js §12 (Rollback laesst helmut_jobs unberuehrt).
        "20260808_jobqueue_bereinigung.sql",
        "20260808_jobqueue_bereinigung_rollback.sql",
        // OP-30, Sprint "Aktivierungsreife 200" (Befund O5): begrenzte Wiedervorlage
        // endgueltig gescheiterter Auftraege. Beruehrt ausschliesslich public.helmut_jobs
        // (eine Zaehlspalte, ein Index, drei Funktionen) — keine K2.1-Struktur. Eigener
        // Nachweis: scripts/jobqueue-wiedervorlage-datenbank-test.js an echter PostgreSQL.
        "20260809_jobqueue_wiedervorlage.sql",
        "20260809_jobqueue_wiedervorlage_rollback.sql",
        // OP-30/E1, Sprint "Lage-Narrativ als fuenfter Auftragstyp" (2026-08-09/2):
        // erweitert AUSSCHLIESSLICH die CHECK-Menge von public.helmut_jobs um
        // `tenant_narrative` — keine K2.1-Struktur. Eigener Nachweis:
        // scripts/jobqueue-narrativ-datenbank-test.js an echter PostgreSQL.
        "20260809_jobqueue_narrativ.sql",
        "20260809_jobqueue_narrativ_rollback.sql"
      ]);
      // Die Allowlist ist KEINE Abschwaechung: 8.8b prueft unabhaengig und INHALTLICH,
      // dass keine Migration im Repository den Kontextpfad beruehrt — auch keine der
      // hier zugelassenen.
      const migrationen = fs.readdirSync(path.join(ROOT, "supabase", "migrations"));
      check("8.8a der K2.1-Sprint selbst hat keine Migration mitgebracht",
        !migrationen.filter((f) => !FREMDE_SPRINTS.has(f)).some((f) => /2026073|202608/.test(f)),
        migrationen.filter((f) => !FREMDE_SPRINTS.has(f)).filter((f) => /2026073|202608/.test(f)).join(", "));
      check("8.8b KEINE Migration im Repository beruehrt den Kontextpfad",
        migrationen.every((f) => !/vorgangskontext|buendelung|kontextpfad|sichtbarkeitsmenge/i
          .test(fs.readFileSync(path.join(ROOT, "supabase", "migrations", f), "utf8"))),
        migrationen.filter((f) => /vorgangskontext|buendelung|kontextpfad/i
          .test(fs.readFileSync(path.join(ROOT, "supabase", "migrations", f), "utf8"))).join(", "));
    }
    check("8.9 keine Warteschlange, keine neue Infrastruktur, keine neue laufende Kostenquelle",
      !/queue|kafka|redis|sqs|rabbit/i.test(kSrc));
    check("8.10 das Modul ist rein und IO-frei (kein require von storage/ai/netz)",
      !/require\(["'](\.\/storage|\.\/ai|node-fetch|https?)/.test(kSrc));
    check("8.11 kein Mandant ist hartkodiert (CLAUDE.md §4.2)",
      !/cem/i.test(kSrc) && !/cem/i.test(fs.readFileSync(path.join(ROOT, "scripts", "vorgangskontext-geruest.js"), "utf8")));
    check("8.12 die Landesmodulsperre bleibt unberuehrt (K2.1 fasst den Quellenplan nicht an)",
      /landesmodulQuelleGesperrt/.test(schedSrc) && !/landesmodul/i.test(kSrc));
    check("8.13 das Flag ist im Env-Inventar dokumentiert",
      /HELMUT_CRON_GLOBALABRUF/.test(fs.readFileSync(path.join(ROOT, "docs", "betrieb", "env-inventar.md"), "utf8")));
    check("8.14 die Mandatssperre `crawl-<mandat>` ist unveraendert (zweimal, gleicher Name)",
      (schedSrc.match(/const lockName = `crawl-\$\{politicianId\}`/g) || []).length === 2);
    check("8.15 der globale Abruf steht in KEINER Mandatsschleife (er bleibt genau einmal je Lauf)",
      /runGlobaleErfassung/.test(schedSrc)
      && !/for\s*\(\s*const\s+\w+\s+of\s+profileInReihenfolge\s*\)\s*\{[\s\S]{0,400}crawlAllSources/.test(schedSrc));
    check("8.16 die Vereinigungsmenge bleibt VOLLSTAENDIG (kein Abrufweg eines Profils geht verloren)", (() => {
      const profilQuellen = [
        { politicianId: "m1", quellen: [{ id: "geteilt", url: "https://example.invalid/a" }, { id: "m1-news", url: "https://example.invalid/b" }] },
        { politicianId: "m2", quellen: [{ id: "geteilt", url: "https://example.invalid/a" }, { id: "m2-news", url: "https://example.invalid/c" }] },
        { politicianId: "m3", quellen: [{ id: "m3-news", url: "https://example.invalid/d" }] }
      ];
      const p = GP.planGlobaleQuellen({ profilQuellen });
      return p.gesamt === 4 && p.gemeinsam === 1
        && GP.fehlendeQuellen({ profilQuellen, vereinigung: p.quellen }).length === 0;
    })());
    // Der DATENSTANDSRIEGEL aus K1 gilt im Kontextpfad unveraendert weiter — hier funktional
    // nachgeprueft, damit eine Entfernung nicht nur im K1-Vertrag, sondern auch hier auffaellt.
    const offen = GP.datenstandNeu({ laufId: "l1", startAt: 0, mandate: 2 });
    const teilweise = GP.datenstandVersiegeln(GP.datenstandNeu({ laufId: "l2", startAt: 0, mandate: 2 }),
      { nowMs: 10, budgetErschoepft: true });
    const kaputt = GP.datenstandVersiegeln(GP.datenstandNeu({ laufId: "l3", startAt: 0, mandate: 2 }),
      { nowMs: 10, fehler: [{ schritt: "kontextvertrag", fatal: true }] });
    check("8.17 der Datenstandsriegel haelt: keine Projektion vor dem Versiegeln", (() => {
      try { GP.mandatsphaseBereit(offen); return false; } catch (e) { return /vor-abschluss/.test(e.message); }
    })());
    check("8.18 eine Kontextvertragsverletzung versiegelt FEHLGESCHLAGEN und ist nicht projizierbar",
      kaputt.status === GP.DATENSTAND_FEHLGESCHLAGEN && GP.datenstandVerwendbar(kaputt) === false);
    check("8.19 ein TEILZUSTAND wird nie als vollstaendig behandelt",
      teilweise.status === GP.DATENSTAND_TEILWEISE
      && GP.datenstandFrisch(teilweise) === false
      && GP.datenstandVerwendbar(teilweise) === true);
    check("8.20 der Datenstand weist den Buendelungsvertrag ehrlich aus (`kontext` vs. `global`)",
      GP.datenstandVermerk(GP.datenstandVersiegeln(GP.datenstandNeu({}), { nowMs: 1, buendelung: "kontext", kontexte: 3 })).kontexte === 3
      && GP.datenstandVermerk(teilweise).buendelung === "global"
      && GP.datenstandVermerk(teilweise).kontexte === null);
  }

  // ────────────────────────────────────────────────────────────────────────────────────────
  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  console.log("Globaler Abruf, kontextgebundene Vorgangsbildung: in allen sechzehn Fallfamilien");
  console.log("dieselbe Gruppierung wie heute. Befund K1-1 kann im neuen Pfad nicht auftreten.");
  console.log("Flag DEFAULT AUS, fail closed, kein Production-Verhalten veraendert.");
  process.exit(fail ? 1 : 0);
})().catch((error) => {
  console.error("SUITE-FEHLER:", error && error.stack);
  process.exit(1);
});
