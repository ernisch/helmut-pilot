"use strict";

// Beweisfamilien statt Rohwortzahl — Hotfix B4-3 (Production-Defekt 2026-07-27).
// =============================================================================
// REINE LOGIK: kein Netz, keine KI, keine DB.
//
// DER FEHLER, DEN DIESE DATEI DAUERHAFT AUSSCHLIESST:
// Beim gezielten Nachholen von 21 CSD-Rohdokumenten wurden 19 davon dem
// bestehenden Vorgang `vg-angriffen` zugeordnet. Dieser Vorgang enthielt EIN
// einziges Dokument — ueber Trumps Drohung an den Iran wegen Huthi-Angriffen.
//
// Die Resolver-Kerne sahen so aus:
//   CSD:        ["angriff", "angriffe", "berlin", "csd", ...]
//   Huthi/Iran: ["angriffen", "droht", "huthi", ...]
// "angriff" und "angriffe" trafen beide auf "angriffen" und wurden als ZWEI
// unabhaengige Belege gezaehlt. MIN_BEWEISGEWICHT=2 war damit allein durch einen
// generischen Wortstamm erfuellt — obwohl es sich um Flexionsformen DESSELBEN
// Wortes handelt und obwohl "Angriff" ueber jedes politische Ereignis hinweg
// vorkommt.
//
// DREI UNABHAENGIGE RIEGEL, die dieser Test einzeln nachweist:
//   A  Flexionsformen einer Beweisfamilie zaehlen EINMAL (nicht je Form).
//   B  Generische Ereignisfamilien tragen 0 zum geforderten Gewicht bei.
//   C  Ein-Dokument-Vorgaenge brauchen ZWEI unabhaengige spezifische Familien.
// Jeder Riegel wird zusaetzlich durch eine GEGENPROBE abgesichert, damit die
// Assertions nicht zufaellig gruen sind (Abschnitt 7).

const V = require("../lib/helmut/vorgang-identity");
const { understandOneCluster, buildOutcomeTelemetry } = require("../lib/helmut/understanding");

let fail = 0;
let n = 0;
function check(name, cond, detail = "") {
  n += 1;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!cond) fail += 1;
}

const d = (id, title, published_at, source_id = "s1") => ({ id, title, summary: "", published_at, source_id });
const bestand = (id, docs, extra = {}) => ({ vorgangId: id, documents: docs, ...extra });
const urteil = (neu, alt) => V.sameVorgang({ documents: neu }, alt);

// =========================================================================
// 1 · DER EXAKTE PRODUCTION-FALL
// =========================================================================
// Der Bestandsvorgang: EIN Dokument, Trump/Iran/Huthi.
const HUTHI = [d("h1", "Trump droht Iran wegen Huthi-Angriffen mit Konsequenzen", "2026-07-24T18:00:00Z", "dlf")];

// Der Berliner CSD-Stapel — echte oeffentliche Schlagzeilen vom 25./26.07.2026.
const CSD = [
  d("c1", "Berliner Polizei: CSD abgebrochen - Fahrzeug soll Menschen angefahren haben", "2026-07-25T21:44:00Z", "sz"),
  d("c2", "CSD in Berlin: Fahrzeug in Menschenmenge gefahren - eine Tote und Verletzte", "2026-07-25T22:31:00Z", "tagesschau"),
  d("c3", "Angriff bei CSD in Berlin - ein Toter und mehrere Verletzte", "2026-07-26T04:01:00Z", "dlf"),
  d("c4", "Nach dem Angriff auf den Berliner CSD: Ermittler pruefen die Angriffe", "2026-07-26T09:12:00Z", "tagesschau")
];

const kernHuthi = V.coreAnchors(HUTHI.map((x) => V.docAnchors(x)));
const kernCsd = V.coreAnchors(CSD.map((x) => V.docAnchors(x)));
check("1 · Ausgangslage: der Bestandskern enthaelt \"angriffen\"", kernHuthi.includes("angriffen"), JSON.stringify(kernHuthi));
check("1 · Ausgangslage: der CSD-Kern enthaelt zwei Formen derselben Familie",
  kernCsd.filter((a) => V.beweisfamilie(a) === "angriff").length >= 2, JSON.stringify(kernCsd));

const produktionsfall = urteil(CSD, bestand("vg-angriffen", HUTHI));
check("1 · der CSD-Cluster wird dem Iran-Vorgang NICHT zugeordnet", produktionsfall.gleich === false, produktionsfall.grund);
check("1 · und die Ablehnung ist ausdruecklich begruendet",
  produktionsfall.grund === "kein-spezifischer-kerntreffer", produktionsfall.grund);

const ue = produktionsfall.spur.ueberdeckung;
check("1 · die Beweisfamilie \"angriff*\" zaehlt GENAU EINMAL", ue.familien === 1, `familien=${ue.familien}`);
check("1 · obwohl zwei Rohbegriffe getroffen haben (beide Sichten stehen in der Spur)",
  ue.anzahl === 2 && ue.treffer.length === 2, JSON.stringify(ue.treffer));
check("1 · die Familie ist als generisch ausgewiesen",
  ue.familienBeleg[0].generisch === true && ue.familienBeleg[0].familie === "angriff", JSON.stringify(ue.familienBeleg));
check("1 · die Spur nennt die Rohformen der Familie",
  ue.familienBeleg[0].formen.length === 2, JSON.stringify(ue.familienBeleg[0].formen));
check("1 · generische Evidenz erreicht das geforderte Gewicht nicht",
  ue.gewichtSpezifisch === 0 && ue.noetig >= 1, `spezifisch=${ue.gewichtSpezifisch} noetig=${ue.noetig}`);
check("1 · das ALTE Mass (Rohsumme) haette weiterhin zugestimmt — der Unterschied ist belegt",
  ue.gewicht >= V.MIN_BEWEISGEWICHT, `rohgewicht=${ue.gewicht}`);

// Die CSD-Dokumente duerfen dadurch nicht verschwinden: sie bilden ihren EIGENEN
// Vorgang mit einer sprechenden, nicht generischen Kennung.
const csdCluster = V.clusterRawDocuments(CSD);
check("1 · die CSD-Dokumente bleiben fuer eine korrekte Vorgangsbildung verfuegbar",
  csdCluster.length === 1 && csdCluster[0].documents.length === CSD.length,
  `cluster=${csdCluster.length} dokumente=${csdCluster[0] && csdCluster[0].documents.length}`);
const csdId = V.deriveVorgangId(csdCluster[0]);
check("1 · ihr Vorgang traegt eine spezifische Themenwurzel, nicht \"angriff\"",
  !csdId.startsWith("vg-angriff"), csdId);

// =========================================================================
// 2 · FLEXIONSFAELLE — eine Familie, ein Beleg
// =========================================================================
const familienProbe = [
  ["Angriff / Angriffe / Angriffen", ["angriff", "angriffe", "angriffen"], "angriff"],
  ["Protest / Proteste / Protesten", ["protest", "proteste", "protesten"], "protest"],
  ["Entscheidung / Entscheidungen", ["entscheidung", "entscheidungen"], "entscheidung"],
  ["Forderung / Forderungen", ["forderung", "forderungen"], "forderung"],
  ["Anschlag / Anschlaege", ["anschlag", "anschlaege"], "anschlag"],
  ["Konflikt / Konflikte / Konflikten", ["konflikt", "konflikte", "konflikten"], "konflikt"]
];
for (const [name, formen, familie] of familienProbe) {
  check(`2 · ${name} bilden EINE Beweisfamilie`,
    formen.every((f) => V.beweisfamilie(f) === familie), formen.map((f) => `${f}->${V.beweisfamilie(f)}`).join(" "));
  const o = V.anchorOverlap(formen, formen);
  check(`2 · ${name}: ${formen.length} Rohtreffer ergeben 1 gezaehlte Familie`,
    o.anzahl === formen.length && o.familienAnzahl === 1, `roh=${o.anzahl} familien=${o.familienAnzahl}`);
  check(`2 · ${name}: die Familie traegt 0 zum spezifischen Gewicht bei (generisch)`,
    o.gewichtSpezifisch === 0, `gewichtSpezifisch=${o.gewichtSpezifisch}`);
}

// Auch SPEZIFISCHE Flexionsformen zaehlen nur einmal — sonst genuegte ein
// einziges Sachwort in zwei Schreibweisen als "zwei unabhaengige Signale".
const spezifischeFormen = V.anchorOverlap(["rentenpaket", "rentenpakets"], ["rentenpaket", "rentenpakets"]);
check("2 · auch spezifische Flexionsformen (\"rentenpaket\"/\"rentenpakets\") zaehlen EINMAL",
  spezifischeFormen.familienAnzahl === 1 && spezifischeFormen.spezifischeFamilien === 1,
  `familien=${spezifischeFormen.familienAnzahl}`);

// Bewusste Grenze, hier als Erwartung festgeschrieben.
check("2 · \"traf\" bildet gar keinen Anker (unter der Laengenschwelle)",
  !V.anchorTokens("Der Kanzler traf den Praesidenten").includes("traf"));
check("2 · \"treffen\" und \"getroffen\" bleiben BEWUSST getrennte Familien",
  V.beweisfamilie("treffen") !== V.beweisfamilie("getroffen"),
  `${V.beweisfamilie("treffen")} / ${V.beweisfamilie("getroffen")}`);
check("2 · beide sind aber generisch und koennen deshalb einzeln nichts tragen",
  V.istGenerisch("treffen") && V.istGenerisch("getroffen"));

// =========================================================================
// 3 · GENERISCHE EREIGNISBEGRIFFE
// =========================================================================
const PFLICHTLISTE = [
  "angriff", "anschlag", "treffen", "gespraech", "debatte", "streit", "kritik",
  "forderung", "entscheidung", "protest", "demonstration", "wahlen", "abstimmung",
  "konflikt", "krise"
];
for (const wort of PFLICHTLISTE) {
  check(`3 · "${wort}" gilt als generisch`, V.istGenerisch(wort) === true, V.beweisfamilie(wort));
}
// Gegenprobe: klar spezifische Sachbegriffe duerfen NICHT generisch werden.
for (const wort of ["bundestag", "rentenpaket", "tariftreuegesetz", "verkehrsminister", "wahlpruefungsausschuss", "bundestagswahl", "emissionshandel"]) {
  check(`3 · "${wort}" bleibt SPEZIFISCH (keine Ueberdehnung der Liste)`, V.istGenerisch(wort) === false);
}
check("3 · \"bundestagswahl\" wird nicht in die Familie \"wahl\" gezogen",
  V.beweisfamilie("bundestagswahl") === "bundestagswahl");

// =========================================================================
// 4 · NEGATIVE TESTS
// =========================================================================
// Der Bezugsvorgang: ein etablierter CSD-Vorgang mit vier Dokumenten.
const CSD_VORGANG = bestand("vg-csd-20260725-x", CSD);

const negativ = [
  ["4.1 gleicher allgemeiner Ort + generisches Ereignis reicht nicht",
    [d("n1", "Berlin: Angriff auf einen Streifenwagen in Neukoelln", "2026-07-26T10:00:00Z")]],
  ["4.2 gleicher generischer Ereignisbegriff + andere Akteure reicht nicht",
    [d("n2", "Angriff auf Hilfskonvoi im Sudan: Vereinte Nationen fordern Aufklaerung", "2026-07-26T10:00:00Z")]],
  ["4.4 ein Ein-Dokument-Vorgang wird bei schwacher Evidenz nicht getroffen", null],
  ["4.5 ein falscher Kandidat mit hoher Token-Ueberschneidung wird abgelehnt",
    [d("n5", "Angriffe und Angriff auf Angriffe: Debatte ueber Angriffe nach dem Anschlag", "2026-07-26T10:00:00Z")]]
];
for (const [name, docs] of negativ) {
  if (!docs) continue;
  const r = urteil(docs, CSD_VORGANG);
  check(`4 · ${name}`, r.gleich === false, r.grund);
}
// 4.3 — zwei Varianten desselben Wortstamms sind KEINE zwei Beweise.
const stammProbe = V.anchorOverlap(["angriff", "angriffe"], ["angriffen"]);
check("4 · 4.3 zwei Varianten desselben Wortstamms zaehlen nicht als zwei Beweise",
  stammProbe.anzahl === 2 && stammProbe.familienAnzahl === 1,
  `roh=${stammProbe.anzahl} familien=${stammProbe.familienAnzahl}`);

// 4.4 explizit: derselbe Cluster gegen einen Ein-Dokument-Vorgang mit nur EINER
// gemeinsamen spezifischen Familie.
const einDoc = [d("e1", "Der Berliner Senat beraet ueber den Doppelhaushalt", "2026-07-25T12:00:00Z")];
const r44 = urteil(CSD, bestand("vg-berlin-haushalt", einDoc));
check("4 · 4.4 Ein-Dokument-Vorgang mit nur EINER gemeinsamen Familie wird nicht getroffen",
  r44.gleich === false, r44.grund);
check("4 · 4.4 der Grund benennt die Ein-Dokument-Regel oder die zu schwache Ueberdeckung",
  ["einzelvorgang-zu-wenig-familien", "kernueberdeckung-zu-schwach", "kein-spezifischer-kerntreffer"].includes(r44.grund),
  r44.grund);

// =========================================================================
// 5 · POSITIVE TESTS — korrekte Zusammenfuehrungen bleiben moeglich
// =========================================================================
// 5.1 gleicher spezifischer Akteur + gleicher konkreter Vorgang
const verkehr = [
  d("v1", "Bundesverkehrsminister Schnieder verliert voraussichtlich sein Amt", "2026-07-26T06:50:00Z", "q1"),
  d("v2", "Merz baut Regierung um: Zukunft von Verkehrsminister Schnieder offen", "2026-07-26T11:27:00Z", "q2")
];
check("5 · 5.1 gleicher spezifischer Akteur plus konkreter Vorgang wird zugeordnet",
  urteil([d("v3", "Kabinettsumbildung: Bilger soll neuer Verkehrsminister werden", "2026-07-27T02:38:00Z", "q3")],
    bestand("vg-verkehrsminister", verkehr)).gleich === true);

// 5.2 gleiche benannte Veranstaltung + Ort
check("5 · 5.2 gleiche benannte Veranstaltung plus Ort wird zugeordnet",
  urteil([d("v4", "Angriff auf CSD Berlin: Dobrindt spricht von islamistischem Terroranschlag", "2026-07-26T16:05:00Z", "q4")],
    CSD_VORGANG).gleich === true);

// 5.3 dasselbe Ereignis, deutlich andere Formulierungen
const anders = [
  d("v5", "Ermittler pruefen islamistisches Motiv beim CSD in Berlin", "2026-07-26T12:00:00Z", "q5"),
  d("v6", "Generalbundesanwalt uebernimmt nach der Tat beim Berliner CSD", "2026-07-26T13:00:00Z", "q6")
];
for (const doc of anders) {
  check(`5 · 5.3 andere Formulierung, dasselbe Ereignis: ${doc.id} wird zugeordnet`,
    urteil([doc], CSD_VORGANG).gleich === true, urteil([doc], CSD_VORGANG).grund);
}

// 5.4 zwei starke spezifische Familien reichen — auch ohne generische Stuetze
const zweiFamilien = V.anchorOverlap(["wegner", "polizeieinsatz"], ["wegner", "polizeieinsatz"]);
check("5 · 5.4 zwei unabhaengige spezifische Familien ergeben ausreichendes Gewicht",
  zweiFamilien.spezifischeFamilien === 2 && zweiFamilien.gewichtSpezifisch >= V.MIN_BEWEISGEWICHT,
  `familien=${zweiFamilien.spezifischeFamilien} gewicht=${zweiFamilien.gewichtSpezifisch}`);

// =========================================================================
// 6 · EIN-DOKUMENT-VORGAENGE
// =========================================================================
// Ein Ein-Dokument-Vorgang ist strukturell leichter zu treffen: bei n=1 ist jeder
// Anker des Textes ein "Kernanker". Deshalb gilt hier die strengere Regel.
const einzel = [d("s1", "Verkehrsminister Schnieder verliert sein Amt", "2026-07-26T08:00:00Z", "q1")];
const nurEineFamilie = [d("s2", "Der Verkehrsminister eroeffnet eine Radschnellverbindung", "2026-07-26T10:00:00Z", "q2")];
const r6a = urteil(nurEineFamilie, bestand("vg-schnieder", einzel));
check("6 · ein Ein-Dokument-Vorgang wird bei nur EINER spezifischen Familie NICHT getroffen",
  r6a.gleich === false, r6a.grund);
check("6 · der Ablehnungsgrund benennt die Ein-Dokument-Regel",
  r6a.grund === "einzelvorgang-zu-wenig-familien", r6a.grund);
check("6 · die Spur markiert den schwachen Bestand", r6a.spur.schwacherBestand === true);

const zweiFamilienDoc = [d("s3", "Verkehrsminister Schnieder verliert sein Amt - Merz bestaetigt Ruecktritt", "2026-07-26T10:00:00Z", "q2")];
const r6b = urteil(zweiFamilienDoc, bestand("vg-schnieder", einzel));
check("6 · GEGENPROBE: mit ZWEI spezifischen Familien wird derselbe Vorgang getroffen",
  r6b.gleich === true, r6b.grund);
check("6 · und die Spur weist die Ein-Dokument-Pruefung als bestanden aus",
  (r6b.spur.erfuellt || []).includes("einzelvorgang-belegt"), JSON.stringify(r6b.spur.erfuellt));

// Ein etablierter Vorgang (viele Dokumente) ist NICHT strenger als noetig: die
// Zusatzregel darf keine gesunden Fortschreibungen kosten.
check("6 · ein etablierter Vorgang bleibt normal fortschreibbar",
  urteil([d("s4", "CSD-Angriff: Tatverdaechtiger bei Polizeieinsatz erschossen", "2026-07-26T20:01:00Z", "q9")],
    CSD_VORGANG).gleich === true);

// Harte Themenkollision beim Ein-Dokument-Vorgang.
const mitDatumA = [d("s5", "Anschlag am 12. Mai in Hamburg: Ermittler nehmen Verdaechtigen fest", "2026-07-20T08:00:00Z", "q1")];
const mitDatumB = [d("s6", "Anschlag am 25. Juli in Hamburg: Ermittler nehmen Verdaechtigen fest", "2026-07-21T08:00:00Z", "q2")];
const r6c = urteil(mitDatumB, bestand("vg-hamburg", mitDatumA));
check("6 · widersprechende Datumsangaben trennen zwei Ein-Dokument-Faelle",
  r6c.gleich === false, r6c.grund);

// =========================================================================
// 7 · MUTATIONSTESTS — sind die Assertions ueberhaupt scharf?
// =========================================================================
// Jede der drei Schutzregeln wird einzeln "abgeschaltet" (durch eine Eingabe, die
// sie umgeht) — der Test muss dann das ANDERE Ergebnis zeigen. Waeren die
// Assertions oben zufaellig gruen, blieben diese Gegenproben unveraendert.

// M1: dieselbe Konstellation, aber mit einer SPEZIFISCHEN zweiten Familie.
const huthiMitBerlin = [d("h2", "Trump droht Iran wegen Huthi-Angriffen - Reaktion aus Berlin und Berliner Buendnisse", "2026-07-25T18:00:00Z", "dlf")];
const m1 = urteil(CSD, bestand("vg-angriffen", huthiMitBerlin));
check("7 · M1 mit einer echten zweiten spezifischen Familie faellt das Urteil ANDERS aus",
  m1.gleich !== produktionsfall.gleich || m1.grund !== produktionsfall.grund,
  `${m1.gleich}/${m1.grund} vs ${produktionsfall.gleich}/${produktionsfall.grund}`);

// M2: waere "angriff" nicht generisch, betruege das spezifische Gewicht 1 —
// immer noch zu wenig fuer MIN_BEWEISGEWICHT. Die Familienzaehlung allein
// genuegt also bereits; die Generik ist der ZWEITE, unabhaengige Riegel.
const ohneGenerik = V.anchorOverlap(["rentenpaket", "rentenpakets"], ["rentenpaket"]);
check("7 · M2 Familienzaehlung wirkt auch OHNE Generik-Regel (eine Familie = ein Beleg)",
  ohneGenerik.gewichtSpezifisch < V.MIN_BEWEISGEWICHT,
  `gewichtSpezifisch=${ohneGenerik.gewichtSpezifisch}`);

// M3: die Familienzaehlung darf nicht ALLES zusammenziehen — zwei verschiedene
// Sachbegriffe bleiben zwei Familien.
const zweiSachen = V.anchorOverlap(["rentenpaket", "pflegereform"], ["rentenpaket", "pflegereform"]);
check("7 · M3 zwei verschiedene Sachbegriffe bleiben ZWEI Familien (keine Ueberdehnung)",
  zweiSachen.familienAnzahl === 2, `familien=${zweiSachen.familienAnzahl}`);

// M4: Determinismus und Reihenfolgeunabhaengigkeit der Familienbildung.
const a1 = V.anchorOverlap(["angriff", "angriffe", "berlin"], ["angriffen", "berlin"]);
const a2 = V.anchorOverlap(["berlin", "angriffe", "angriff"], ["berlin", "angriffen"]);
check("7 · M4 die Familienbildung ist reihenfolgeunabhaengig",
  a1.familienAnzahl === a2.familienAnzahl && a1.gewichtSpezifisch === a2.gewichtSpezifisch,
  `${a1.familienAnzahl}/${a1.gewichtSpezifisch} vs ${a2.familienAnzahl}/${a2.gewichtSpezifisch}`);
check("7 · M4 dieselbe Eingabe ergibt zweimal dieselbe Spur",
  JSON.stringify(urteil(CSD, bestand("vg-angriffen", HUTHI)).spur) === JSON.stringify(produktionsfall.spur));

// =========================================================================
// 8 · FEHLERPFAD — Ablehnung, Timeout, Fehlschlag
// =========================================================================
function gueltigeAnalyse() {
  return {
    headline: "Angriff auf den Berliner CSD",
    was_ist_passiert: "Ein Fahrzeug fuhr in eine Menschenmenge am Rand des Berliner CSD.",
    warum_wichtig: "Sicherheitslage bei Grossveranstaltungen und Schutz queerer Raeume.",
    wer_ist_betroffen: "Teilnehmende, Sicherheitsbehoerden, Berliner Landespolitik.",
    parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
    zeitdruck: "hoch", handlungsempfehlung: "Kondolenz und Sprachregelung abstimmen.",
    confidence_score: 80,
    display_title: "Berlin nach dem Angriff auf den CSD",
    display_summary: "Ein Fahrzeug fuhr in eine Menschenmenge am Rand des CSD.",
    why_relevant: "Betrifft Innen- und Rechtspolitik unmittelbar.",
    recommendation: "Sondersitzung des Innenausschusses vorbereiten.",
    display_category: "Sicherheit"
  };
}

(async () => {
  const cluster = V.clusterRawDocuments(CSD)[0];
  const iranVorgang = {
    id: "ko-vg-angriffen", vorgang_id: "vg-angriffen", status: "neu", understanding_status: "complete",
    ko_version: 3, headline: "Trump droht Iran wegen Huthi-Angriffen",
    created_at: "2026-07-24T18:30:00Z", updated_at: "2026-07-24T18:30:00Z"
  };
  const macheDeps = (over = {}) => {
    const zustand = { kiAufrufe: [], gespeichert: [], verknuepft: [], geparkt: [], skips: [] };
    return [{
      canSpend: async () => ({ allowed: true }),
      requestUnderstanding: async (p) => { zustand.kiAufrufe.push(p); return gueltigeAnalyse(); },
      save: async (ko) => { zustand.gespeichert.push(ko); return { saved: true, id: ko.id }; },
      saveSources: async (koId, docs) => { zustand.verknuepft.push({ koId, ids: docs.map((x) => x.id) }); },
      markFailed: async (vid) => { zustand.geparkt.push(vid); },
      modelName: () => "test",
      logSkip: (s) => { zustand.skips.push(s); },
      findVorgangCandidates: async () => [iranVorgang],
      listVorgangDocuments: async () => HUTHI,
      getExisting: async () => iranVorgang,
      ...over
    }, zustand];
  };

  // 8.1 Der abgelehnte Match markiert nichts faelschlich als abgeschlossen.
  const [deps1, z1] = macheDeps();
  const r81 = await understandOneCluster(cluster, deps1);
  check("8 · 8.1 der abgelehnte Resolver-Match fuehrt zu einem EIGENEN Vorgang",
    r81.status === "saved" && r81.vorgangId !== "vg-angriffen", `${r81.status} ${r81.vorgangId}`);
  check("8 · 8.1 der Bestandsvorgang wird NICHT ueberschrieben",
    z1.gespeichert.every((ko) => ko.vorgang_id !== "vg-angriffen"), JSON.stringify(z1.gespeichert.map((k) => k.vorgang_id)));
  check("8 · 8.1 alle Rohdokumente werden mit dem neuen Vorgang verknuepft (kein stiller Verlust)",
    z1.verknuepft.length === 1 && z1.verknuepft[0].ids.length === CSD.length, JSON.stringify(z1.verknuepft));
  check("8 · 8.1 die Ablehnung steht in der Ergebniszeile",
    r81.resolverAbgelehnt === 1 && r81.resolverAblehnungsgruende.includes("kein-spezifischer-kerntreffer"),
    JSON.stringify(r81.resolverAblehnungsgruende));

  // 8.2 Azure-Timeout: geparkt, wiedervorlagefaehig, nichts ueberschrieben.
  const [deps2, z2] = macheDeps({
    requestUnderstanding: async () => { const e = new Error("Azure request timed out after 60000 ms"); throw e; }
  });
  const r82 = await understandOneCluster(cluster, deps2);
  check("8 · 8.2 ein Azure-Timeout endet als skipped-error (nicht als Erfolg)",
    r82.status === "skipped-error", `${r82.status}`);
  check("8 · 8.2 der Fall wird geparkt und ist damit gezielt nachholbar",
    z2.geparkt.length === 1, JSON.stringify(z2.geparkt));
  check("8 · 8.2 die Dokumente haengen am geparkten Vorgang (Endzustand nachweisbar)",
    z2.verknuepft.length === 1 && z2.verknuepft[0].ids.length === CSD.length, JSON.stringify(z2.verknuepft));
  check("8 · 8.2 kein Knowledge Object wurde gespeichert", z2.gespeichert.length === 0);

  // 8.3 Budget erschoepft: NICHT verknuepft — der Fall bleibt Nachholkandidat.
  const [deps3, z3] = macheDeps({ canSpend: async () => ({ allowed: false, reason: "daily-llm-budget-reached" }) });
  const r83 = await understandOneCluster(cluster, deps3);
  check("8 · 8.3 erschoepftes Budget endet als skipped-budget (erneut einplanen)",
    r83.status === "skipped-budget", r83.status);
  check("8 · 8.3 und erzeugt bewusst KEINE Verknuepfung — der Fall bleibt Nachholkandidat",
    z3.verknuepft.length === 0);

  // 8.4 Understanding-Fehler bei der AKTUALISIERUNG eines Bestandsvorgangs:
  // der Bestand darf nicht ueberschrieben werden.
  const csdBestand = {
    id: "ko-vg-csd", vorgang_id: "vg-csd-20260725-x", status: "neu", understanding_status: "complete",
    ko_version: 1, headline: "Angriff auf CSD in Berlin",
    created_at: "2026-07-26T05:00:00Z", updated_at: "2026-07-26T05:00:00Z"
  };
  const neuerStand = V.clusterRawDocuments([...CSD,
    d("c9", "Angriff auf CSD Berlin: Generalbundesanwalt uebernimmt die Ermittlungen", "2026-07-26T21:30:00Z", "dlf")])[0];
  const [deps4, z4] = macheDeps({
    findVorgangCandidates: async () => [csdBestand],
    listVorgangDocuments: async () => CSD,
    getExisting: async () => csdBestand,
    requestUnderstanding: async () => { throw new Error("Azure 503 Service Unavailable"); }
  });
  const r84 = await understandOneCluster(neuerStand, deps4);
  check("8 · 8.4 ein Fehler bei der Aktualisierung ueberschreibt den Bestand NICHT",
    z4.gespeichert.length === 0 && r84.status === "skipped-error", `${r84.status} gespeichert=${z4.gespeichert.length}`);
  check("8 · 8.4 der bestehende Vorgang wird NICHT geparkt (er ist inhaltlich gesund)",
    z4.geparkt.length === 0, JSON.stringify(z4.geparkt));
  check("8 · 8.4 das neue Dokument ist trotzdem verknuepft — erneut aufgreifbar",
    z4.verknuepft.length === 1 && z4.verknuepft[0].ids.includes("c9"), JSON.stringify(z4.verknuepft));

  // 8.5 Retry-Faehigkeit: derselbe Cluster laeuft nach einem Fehlschlag erneut.
  const [deps5, z5] = macheDeps({
    findVorgangCandidates: async () => [csdBestand],
    listVorgangDocuments: async () => CSD,
    getExisting: async () => csdBestand
  });
  const r85 = await understandOneCluster(neuerStand, deps5);
  check("8 · 8.5 derselbe Fall laeuft im naechsten Lauf durch (Retry moeglich)",
    r85.status === "updated" && z5.gespeichert.length === 1, `${r85.status}`);
  check("8 · 8.5 und zaehlt die Vorgangsversion hoch statt zu ueberschreiben",
    r85.koVersion === 2, `version=${r85.koVersion}`);

  // 8.6 Terminal aussortierter Vorgang bleibt terminal.
  const [deps6, z6] = macheDeps({
    findVorgangCandidates: async () => [{ ...csdBestand, status: "pending", understanding_status: "failed-final" }],
    listVorgangDocuments: async () => CSD,
    getExisting: async () => ({ ...csdBestand, status: "pending", understanding_status: "failed-final" })
  });
  const r86 = await understandOneCluster(neuerStand, deps6);
  check("8 · 8.6 ein terminal aussortierter Vorgang wird nicht erneut verstanden",
    r86.status === "skipped-terminal" && z6.kiAufrufe.length === 0, `${r86.status}`);
  check("8 · 8.6 seine Dokumente bekommen trotzdem einen Endzustand",
    z6.verknuepft.length === 1, JSON.stringify(z6.verknuepft));

  // 8.7 Audit-Blindstelle: jede geschriebene Analyse traegt einen frischen
  // Zeitstempel. Ohne ihn findet die Abfrage "welche Zeilen hat dieser Lauf
  // veraendert?" eine Inhaltsaktualisierung NICHT — genau daran ist die
  // Nachvollziehbarkeit des CSD-Nachweislaufs gescheitert (§15.4 des Befunds).
  check("8 · 8.7 ein neu angelegter Vorgang traegt einen Aenderungszeitstempel",
    z1.gespeichert.length === 1 && Number.isFinite(Date.parse(z1.gespeichert[0].updated_at)),
    JSON.stringify(z1.gespeichert.map((k) => k.updated_at)));
  check("8 · 8.7 auch eine INHALTSAKTUALISIERUNG setzt ihn neu",
    z5.gespeichert.length === 1 && Number.isFinite(Date.parse(z5.gespeichert[0].updated_at)),
    JSON.stringify(z5.gespeichert.map((k) => k.updated_at)));

  // =======================================================================
  // 9 · TELEMETRIE DER ABLEHNUNGEN
  // =======================================================================
  const tele = buildOutcomeTelemetry({ clusters: [cluster], results: [r81, r82, r83], deferred: 0, vorgemerkt: 0 });
  check("9 · die Lauftelemetrie fuehrt eine Resolver-Bilanz", Boolean(tele.resolver), JSON.stringify(tele.resolver));
  check("9 · sie zaehlt geprueften Bestand und Ablehnungen",
    tele.resolver.geprueft >= 3 && tele.resolver.abgelehnt >= 3, JSON.stringify(tele.resolver));
  check("9 · und nennt den Ablehnungsgrund namentlich",
    tele.resolver.ablehnungsgruende["kein-spezifischer-kerntreffer"] >= 3,
    JSON.stringify(tele.resolver.ablehnungsgruende));
  check("9 · kein Ergebnis faellt in die Sammelgruppe \"unbekannt\"",
    tele.gruppen.unbekannt === 0, JSON.stringify(tele.gruppen));

  console.log(`\n${n - fail}/${n} Assertions erfolgreich.`);
  if (fail) console.log(`\nFEHLGESCHLAGEN: ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
