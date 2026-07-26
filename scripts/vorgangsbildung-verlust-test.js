"use strict";

// SOLL-Test der Vorgangsbildung — kein politisch relevantes Ereignis darf lautlos
// verschwinden (Betriebsbefund B4, docs/befund-csd-2026-vorgangsverlust.md).
// REINE LOGIK, kein Netz, keine KI, keine DB.
//
// GESCHICHTE DIESER DATEI: sie hat im Diagnosesprint (PR #141) den FEHLERHAFTEN
// Ist-Zustand beschrieben — fuenf Meldungen zu einem toedlichen Anschlag zerfielen
// in vier Vorgaenge, zwei davon dockten ueber Allerweltswoerter an fachfremde
// Altvorgaenge an und wurden als "schon verstanden" verworfen. Mit der Reparatur
// sind alle diese Erwartungen umgedreht: der Test beschreibt jetzt den SOLL-Zustand
// und schlaegt fehl, sobald der Defekt zurueckkehrt.
//
// Die Dokumente sind echte oeffentliche Schlagzeilen aus Production
// (raw_documents, 2026-07-25/26) — bewusst mit ihren echten Unterschieden:
// verschiedene Ueberschriftenformen, verschiedene Zeitpunkte, verschiedene
// Ortsbezeichnungen ("Berlin"/"Berlins"/"Berliner"), wachsende Opferzahlen,
// spaetere Taeterbeschreibung und eine Nachtragsmeldung des Folgetags.

const V = require("../lib/helmut/vorgang-identity");
const { grossereignisSignale } = require("../lib/helmut/quellenarchitektur/understanding-priority");
const { understandOneCluster, buildOutcomeTelemetry } = require("../lib/helmut/understanding");

let fail = 0;
function check(name, cond, detail = "") { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`); if (!cond) fail += 1; }

// --- Der echte Meldungsverlauf ---------------------------------------------
// Fuenf Meldungen, vier Herausgeber, ueber 15 Stunden verteilt.
const ANSCHLAG = [
  { id: "d3", source_id: "news-sueddeutsche", published_at: "2026-07-25T21:44:00Z",
    title: "Berliner Polizei: CSD abgebrochen - Fahrzeug soll Menschen angefahren haben - SZ.de" },
  { id: "d4", source_id: "tagesschau-politik", published_at: "2026-07-25T22:31:00Z",
    title: "CSD in Berlin: Fahrzeug in Menschenmenge gefahren - eine Tote und Verletzte" },
  { id: "d1", source_id: "deutschlandfunk-politik", published_at: "2026-07-26T04:01:00Z",
    title: "Christopher Street Day - Angriff bei CSD in Berlin - ein Toter und mehrere Verletzte - Polizei identifiziert Verdächtigen aus islamistischer Szene" },
  { id: "d2", source_id: "tagesschau-politik", published_at: "2026-07-26T09:12:00Z",
    title: "Berlins Regierender Bürgermeister - Wegner nach CSD-Vorfall: Angriff auf freie und weltoffene Gesellschaft - Merz: abscheuliche Tat" },
  { id: "d5", source_id: "tagesschau-politik", published_at: "2026-07-26T12:40:00Z",
    title: "Liveblog zu Angriff auf CSD: ++ Dobrindt: \"Keine weitere Gefährdung\" ++" }
];

// Dokumente, die in Production am selben Tag ankamen und frueher mit dem
// Anschlag verschmolzen wurden — ueber "menschen" bzw. "dobrindt".
const TAIFUN = { id: "f1", source_id: "deutschlandfunk-politik", published_at: "2026-07-26T04:03:00Z",
  title: "Provinz Guangdong - 340.000 Menschen in China wegen Taifun \"Noul\" in Sicherheit gebracht" };
const VERFASSUNGSGERICHT = { id: "f2", source_id: "tagesschau-politik", published_at: "2026-07-26T19:58:00Z",
  title: "Verfassungsgericht zu Afghanistan und Dobrindt: Willkür bei Entscheidungen über Leben und Tod" };

// --- 1 · Das Ereignis bildet EINEN Vorgang ----------------------------------
const nurEreignis = V.clusterRawDocuments(ANSCHLAG);
check("1 · fuenf Meldungen zu EINEM Ereignis bilden GENAU EINEN Vorgang",
  nurEreignis.length === 1, `cluster=${nurEreignis.length}`);
check("1 · dieser Vorgang enthaelt alle fuenf Rohdokumente",
  nurEreignis[0] && nurEreignis[0].documents.length === 5, `dokumente=${nurEreignis[0] && nurEreignis[0].documents.length}`);

// Die Leitvokabeln des Ereignisses sind kurz — genau daran ist die Altfassung
// gescheitert. Sie muessen jetzt Anker bilden koennen.
const ankerD1 = V.docAnchors(ANSCHLAG[2]);
check("1 · die Abkuerzung \"CSD\" ist ein Anker (Kurzform, nicht ueber Laenge erkannt)",
  ankerD1.includes("csd"), JSON.stringify(ankerD1.slice(0, 8)));
for (const wort of ["berlin", "angriff", "polizei"]) {
  check(`1 · Leitvokabel "${wort}" bildet einen Anker (war unter der Altschwelle von 8 Zeichen)`,
    V.anchorTokens(`Angriff bei CSD in Berlin, Polizei ermittelt`).includes(wort));
}

// --- 2 · Fachfremde Meldungen werden NICHT eingesammelt ---------------------
const mitTaifun = V.clusterRawDocuments([ANSCHLAG[0], TAIFUN]);
check("2 · Anschlag und Taifun teilen nur \"menschen\" und bilden ZWEI Vorgaenge",
  mitTaifun.length === 2, `cluster=${mitTaifun.length}`);
const mitVg = V.clusterRawDocuments([ANSCHLAG[4], VERFASSUNGSGERICHT]);
check("2 · CSD-Liveblog und Verfassungsgerichtsurteil teilen nur \"dobrindt\" und bleiben getrennt",
  mitVg.length === 2, `cluster=${mitVg.length}`);

const alles = V.clusterRawDocuments([...ANSCHLAG, TAIFUN, VERFASSUNGSGERICHT]);
const anschlagsCluster = alles.find((c) => c.documents.some((d) => d.id === "d1"));
check("2 · im vollen Stapel bleibt der Anschlag ein Vorgang mit genau seinen fuenf Dokumenten",
  anschlagsCluster && anschlagsCluster.documents.length === 5
    && !anschlagsCluster.documents.some((d) => d.id === "f1" || d.id === "f2"),
  anschlagsCluster ? anschlagsCluster.documents.map((d) => d.id).join("+") : "kein Cluster");
check("2 · Taifun und Verfassungsgerichtsurteil bilden je einen eigenen Vorgang",
  alles.length === 3, `cluster=${alles.length}`);

// --- 3 · Reihenfolgeunabhaengigkeit ----------------------------------------
const idsVorwaerts = V.clusterRawDocuments([...ANSCHLAG, TAIFUN, VERFASSUNGSGERICHT]).map(V.deriveVorgangId).sort();
const idsRueckwaerts = V.clusterRawDocuments([...ANSCHLAG, TAIFUN, VERFASSUNGSGERICHT].reverse()).map(V.deriveVorgangId).sort();
check("3 · die Vorgangsmenge ist REIHENFOLGEUNABHAENGIG (identische Kennungen)",
  JSON.stringify(idsVorwaerts) === JSON.stringify(idsRueckwaerts),
  `${JSON.stringify(idsVorwaerts)} vs ${JSON.stringify(idsRueckwaerts)}`);

// Auch eine gemischte Reihenfolge darf nichts aendern (Ankunft ist im Betrieb zufaellig).
const gemischt = [ANSCHLAG[3], TAIFUN, ANSCHLAG[0], VERFASSUNGSGERICHT, ANSCHLAG[4], ANSCHLAG[1], ANSCHLAG[2]];
check("3 · auch bei gemischter Ankunftsreihenfolge entstehen dieselben Vorgaenge",
  JSON.stringify(V.clusterRawDocuments(gemischt).map(V.deriveVorgangId).sort()) === JSON.stringify(idsVorwaerts));

// --- 4 · Die Kennung traegt das Ereignis, nicht ein Zufallswort -------------
const anschlagId = V.deriveVorgangId(nurEreignis[0]);
check("4 · die Kennung nennt das Ereignis (\"csd\") statt eines Allerweltsworts",
  anschlagId.startsWith("vg-csd-"), anschlagId);
check("4 · die Kennung traegt den EREIGNISTAG (fruehestes Dokument, 25.07.)",
  anschlagId.includes("20260725"), anschlagId);
check("4 · die Kennung ist NICHT mehr ein einzelnes Wort (kein `vg-<wort>`)",
  !/^vg-[a-z0-9äöüß]+$/.test(anschlagId), anschlagId);
check("4 · die Kennung ist deterministisch (zweimal derselbe Wert)",
  V.deriveVorgangId(V.clusterRawDocuments(ANSCHLAG)[0]) === anschlagId);

// Der Ereignistag wandert NICHT mit jeder Folgemeldung weiter — sonst bekaeme
// jedes laufende Ereignis taeglich eine neue Kennung.
const spaeter = V.clusterRawDocuments([...ANSCHLAG, {
  id: "d6", source_id: "deutschlandfunk-politik", published_at: "2026-07-27T06:00:00Z",
  title: "Angriff auf CSD in Berlin - Generalbundesanwalt uebernimmt Ermittlungen gegen Verdaechtigen"
}]);
check("4 · eine Folgemeldung am naechsten Tag aendert den Ereignistag NICHT",
  spaeter.length === 1 && V.deriveVorgangId(spaeter[0]).includes("20260725"),
  `cluster=${spaeter.length} id=${spaeter[0] && V.deriveVorgangId(spaeter[0])}`);

// --- 5 · Das Ereignis wird als Grossereignis erkannt ------------------------
const sig = grossereignisSignale(nurEreignis[0]);
check("5 · der Anschlag wird als Grossereignis erkannt (Vorfahrt in der Verarbeitung)",
  sig.grossereignis === true, JSON.stringify(sig));
check("5 · Begruendung ist belegt: Sicherheitsbezug UND mehrere unabhaengige Quellen",
  sig.sicherheitsbezug === true && sig.quellen >= 3, JSON.stringify(sig));
check("5 · ein harmloser Verwaltungsvorgang ist KEIN Grossereignis (kein Fehlalarm)",
  grossereignisSignale({ documents: [
    { id: "a", source_id: "s1", published_at: "2026-07-26T08:00:00Z", title: "Christkindlmarkt oeffnet an zwei Tagen laenger" },
    { id: "b", source_id: "s2", published_at: "2026-07-26T09:00:00Z", title: "Christkindlmarkt: Stadtrat beschliesst verlaengerte Oeffnungszeiten" },
    { id: "c", source_id: "s3", published_at: "2026-07-26T10:00:00Z", title: "Laengere Oeffnung des Christkindlmarkts sorgt fuer Diskussion" }
  ] }).grossereignis === false);

// --- 6 · Der Kollisionsfall endet NICHT mehr im lautlosen Verwerfen --------
// Nachbau des Production-Falls: es existiert ein aelterer, fachfremder Vorgang
// (Taifun/UNO-Wahl), dessen Kennung das neue Ereignis treffen wuerde.
(async () => {
  const kiAufrufe = [];
  const gespeichert = [];
  const verknuepft = [];
  const baseDeps = {
    canSpend: () => ({ allowed: true }),
    requestUnderstanding: async (p) => { kiAufrufe.push(p); return gueltigeAnalyse(); },
    save: async (ko) => { gespeichert.push(ko); return { saved: true, id: ko.id }; },
    saveSources: async (koId, docs) => { verknuepft.push({ koId, ids: docs.map((d) => d.id) }); },
    markFailed: async () => {},
    modelName: () => "test",
    logSkip: () => {}
  };

  const altVorgang = {
    id: "ko-vg-menschen", vorgang_id: "vg-menschen", status: "neu", understanding_status: "complete",
    headline: "UNO-Wahl und Waldbraende", created_at: "2026-07-25T07:00:00Z", updated_at: "2026-07-25T07:00:00Z"
  };
  const ergebnis = await understandOneCluster(nurEreignis[0], {
    ...baseDeps,
    // Der Altvorgang liegt unter demselben Themenwurzel-Praefix und wird als
    // Kandidat gefunden — genau die Situation, die frueher zum Verlust fuehrte.
    findVorgangCandidates: async () => [altVorgang],
    listVorgangDocuments: async () => [
      { id: "alt-1", title: "340.000 Menschen in China wegen Taifun Noul in Sicherheit gebracht", published_at: "2026-07-25T06:00:00Z" }
    ],
    getExisting: async () => altVorgang
  });

  check("6 · der Cluster wird NICHT mehr verworfen — er wird verstanden",
    ergebnis.status === "saved", `status=${ergebnis.status}`);
  check("6 · es findet GENAU EIN KI-Aufruf statt (frueher: null)",
    kiAufrufe.length === 1, `aufrufe=${kiAufrufe.length}`);
  check("6 · der Vorgang bekommt eine EIGENE Kennung, der Altvorgang bleibt unberuehrt",
    ergebnis.vorgangId !== "vg-menschen" && ergebnis.vorgangId.startsWith("vg-csd-"), ergebnis.vorgangId);
  check("6 · alle fuenf Rohdokumente werden mit dem neuen Vorgang verknuepft",
    verknuepft.length === 1 && verknuepft[0].ids.length === 5, JSON.stringify(verknuepft));
  check("6 · `skipped-exists` existiert als Ergebnis nicht mehr",
    ergebnis.status !== "skipped-exists");

  // --- 7 · Aktualisierung statt Verwerfen ----------------------------------
  // Am Folgetag kommt eine Meldung mit NEUEN Fakten zum selben Ereignis.
  kiAufrufe.length = 0; verknuepft.length = 0;
  const bestand = {
    id: `ko-${anschlagId}`, vorgang_id: anschlagId, status: "neu", understanding_status: "complete",
    ko_version: 1, headline: "Angriff auf CSD in Berlin", created_at: "2026-07-26T05:00:00Z", updated_at: "2026-07-26T05:00:00Z"
  };
  const nachtrag = V.clusterRawDocuments([...ANSCHLAG, {
    id: "d7", source_id: "deutschlandfunk-politik", published_at: "2026-07-27T07:30:00Z",
    title: "Angriff auf CSD in Berlin - Generalbundesanwalt uebernimmt, Bundestag setzt Sondersitzung des Innenausschusses an"
  }])[0];
  const akt = await understandOneCluster(nachtrag, {
    ...baseDeps,
    findVorgangCandidates: async () => [bestand],
    listVorgangDocuments: async () => ANSCHLAG,
    getExisting: async () => bestand
  });
  check("7 · neue Fakten am bestehenden Vorgang -> AKTUALISIERUNG statt Verwerfen",
    akt.status === "updated", `status=${akt.status}`);
  check("7 · die Aktualisierung laeuft auf DEMSELBEN Vorgang (kein Duplikat)",
    akt.vorgangId === anschlagId, akt.vorgangId);
  check("7 · die Vorgangsversion wird hochgezaehlt", akt.koVersion === 2, `version=${akt.koVersion}`);
  check("7 · nur das NEUE Dokument wird zusaetzlich verknuepft",
    verknuepft.length === 1 && verknuepft[0].ids.length === 1 && verknuepft[0].ids[0] === "d7", JSON.stringify(verknuepft));

  // --- 8 · Wiederveroeffentlichung derselben Meldung ----------------------
  kiAufrufe.length = 0; verknuepft.length = 0;
  const wieder = await understandOneCluster(nurEreignis[0], {
    ...baseDeps,
    findVorgangCandidates: async () => [bestand],
    listVorgangDocuments: async () => ANSCHLAG,
    getExisting: async () => bestand
  });
  check("8 · dieselben Dokumente erneut -> echtes Duplikat, KEIN KI-Aufruf",
    wieder.status === "duplicate" && kiAufrufe.length === 0, `status=${wieder.status} aufrufe=${kiAufrufe.length}`);
  check("8 · ein Duplikat erzeugt keine zusaetzliche Verknuepfung",
    verknuepft.length === 0, JSON.stringify(verknuepft));

  // --- 9 · Kein Rohdokument ohne Endzustand ------------------------------
  const telemetrie = buildOutcomeTelemetry({
    clusters: [nurEreignis[0]], results: [ergebnis], deferred: 0, vorgemerkt: 0
  });
  check("9 · die Lauftelemetrie weist ALLE Dokumente des Clusters als abgeschlossen aus",
    telemetrie.dokumente === 5 && telemetrie.dokumenteOhneEndzustand === 0, JSON.stringify(telemetrie.gruppen));
  check("9 · die Telemetrie benennt die Aufloesung (Kandidat geprueft, eigener Vorgang gebildet)",
    telemetrie.aufloesungen.neu === 1, JSON.stringify(telemetrie.aufloesungen));

  // --- 10 · Echter technischer Kennungskonflikt ---------------------------
  // Der Fall aus Abschnitt 6 kollidiert nicht einmal mehr als Zeichenkette —
  // die neue Kennung traegt Ereignistag und Ankerpruefsumme. Deshalb hier der
  // konstruierte Ernstfall: ein fachfremder Vorgang traegt GENAU die Kennung,
  // die der neue Cluster ableitet. Auch dann darf nichts verworfen werden.
  kiAufrufe.length = 0; verknuepft.length = 0;
  const vorherGespeichert = gespeichert.length;
  const kollidierend = {
    id: `ko-${anschlagId}`, vorgang_id: anschlagId, status: "neu", understanding_status: "complete",
    headline: "Digitalisierung der Kfz-Zulassung", created_at: "2026-07-20T07:00:00Z", updated_at: "2026-07-20T07:00:00Z"
  };
  const konflikt = await understandOneCluster(nurEreignis[0], {
    ...baseDeps,
    findVorgangCandidates: async () => [kollidierend],
    listVorgangDocuments: async () => [
      { id: "alt-9", title: "Kfz-Zulassung wird bundesweit digitalisiert", published_at: "2026-07-20T06:00:00Z" }
    ],
    getExisting: async () => kollidierend
  });
  check("10 · echter Kennungskonflikt -> eigener Vorgang statt Verwerfen",
    konflikt.status === "saved" && kiAufrufe.length === 1, `status=${konflikt.status} aufrufe=${kiAufrufe.length}`);
  check("10 · die neue Kennung weicht nachweislich von der belegten ab",
    konflikt.vorgangId !== anschlagId && konflikt.vorgangId.startsWith(anschlagId), konflikt.vorgangId);
  check("10 · der Konflikt ist als solcher protokolliert",
    konflikt.resolution === "konflikt-neue-kennung", `resolution=${konflikt.resolution}`);
  check("10 · der fachfremde Altvorgang wird NICHT ueberschrieben",
    gespeichert.slice(vorherGespeichert).every((ko) => ko.id !== kollidierend.id),
    JSON.stringify(gespeichert.slice(vorherGespeichert).map((ko) => ko.id)));
  check("9 · das Grossereignis ist in der Telemetrie gezaehlt",
    telemetrie.grossereignisse === 1, `grossereignisse=${telemetrie.grossereignisse}`);

  console.log(fail === 0
    ? `\nOK — ${9} Abschnitte gruen: der CSD-2026-Fall wird vollstaendig rekonstruiert, zusammengefuehrt, von fachfremden Meldungen getrennt und ohne stillen Verlust verarbeitet.`
    : `\n${fail} Erwartung(en) nicht erfuellt — die Vorgangsbildung verliert wieder Ereignisse. Befund: docs/befund-csd-2026-vorgangsverlust.md`);
  process.exit(fail === 0 ? 0 : 1);
})();

// Minimal gueltige KI-Analyse (Schema-konform), damit der Pfad bis zum Speichern laeuft.
function gueltigeAnalyse() {
  return {
    headline: "Toedlicher Angriff auf den Berliner CSD",
    was_ist_passiert: "Ein Fahrzeug fuhr am Rand des Berliner CSD in eine Menschenmenge.",
    warum_wichtig: "Sicherheitslage bei Grossveranstaltungen und Schutz queerer Raeume.",
    wer_ist_betroffen: "Teilnehmende, Sicherheitsbehoerden, Berliner Landespolitik.",
    parteien: [], ausschuesse: [], ministerien: [], risiken: [], chancen: [],
    zeitdruck: "hoch", handlungsempfehlung: "Kondolenz und Sprachregelung abstimmen.",
    confidence_score: 80,
    display_title: "Berlin verschaerft Sicherheitslage nach Angriff auf CSD",
    display_summary: "Ein Fahrzeug fuhr in eine Menschenmenge am Rand des CSD.",
    why_relevant: "Betrifft Innen- und Rechtspolitik unmittelbar.",
    recommendation: "Sondersitzung des Innenausschusses vorbereiten.",
    display_category: "Sicherheit"
  };
}
