"use strict";

// Offline-Test des PARDOK-Dispatch (Schritt C, VORBEREITET). REINE LOGIK, kein Netz/DB/LLM:
// der Fetcher wird injiziert (Gold-Fixtures als String). Prueft Feature-Guard, Shadow-only-
// Isolation (0 Items in die Pipeline) und die crawlSource-Anbindung.

const fs = require("fs");
const path = require("path");
const D = require("../lib/helmut/quellenarchitektur/pardok-dispatch");
const { crawlSource } = require("../lib/helmut/crawler");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }
function fx(n) { return fs.readFileSync(path.join(__dirname, "..", "test", "fixtures", "pardok", n), "utf8"); }

const beXml = fx("berlin-gold.xml");
const bbXml = fx("brandenburg-gold.xml");
function fetcherOf(xml) { let calls = 0; const f = async () => { calls += 1; return xml; }; f.calls = () => calls; return f; }

(async () => {
  // --- 1. Feature-Guard: off (default) | shadow | live. Landtag-Sprint (P2-2): 'live'/'on'
  //     ist jetzt als Modus verdrahtet, oeffnet aber NUR mit zweiter Landesfreigabe
  //     (HELMUT_LANDESMODULE, siehe Block 9) — diese Zusicherung ersetzt bewusst die alte
  //     Test-Sperre "'on' -> off (Cutover NICHT verdrahtet)".
  check("1a Guard unset -> off", D.dispatchMode({}) === "off");
  check("1b Guard 'shadow' -> shadow", D.dispatchMode({ HELMUT_PARDOK_DISPATCH: "shadow" }) === "shadow");
  check("1c Guard 'on'/'live' -> Modus live (Items NUR mit zusaetzlicher Landesfreigabe, Block 9)",
    D.dispatchMode({ HELMUT_PARDOK_DISPATCH: "on" }) === "live" &&
    D.dispatchMode({ HELMUT_PARDOK_DISPATCH: "live" }) === "live");
  check("1d Guard '1'/'true'/'yes' -> off (Mode-Flag, kein Boolean)",
    D.dispatchMode({ HELMUT_PARDOK_DISPATCH: "1" }) === "off" &&
    D.dispatchMode({ HELMUT_PARDOK_DISPATCH: "true" }) === "off" &&
    D.dispatchMode({ HELMUT_PARDOK_DISPATCH: "yes" }) === "off");

  // --- 2. Land-Aufloesung: explizit bevorzugt, sonst be-/bb-Praefix, sonst null ----------------
  check("2a pardokLand explizit berlin", D.resolveLand({ pardokLand: "berlin" }) === "berlin");
  check("2b pardokLand explizit brandenburg", D.resolveLand({ pardokLand: "brandenburg" }) === "brandenburg");
  check("2c be-Praefix -> berlin", D.resolveLand({ id: "be-plenum" }) === "berlin");
  check("2d bb-Praefix -> brandenburg", D.resolveLand({ id: "bb-plenum" }) === "brandenburg");
  check("2e unbekannt -> null", D.resolveLand({ id: "bund-basis" }) === null);

  // --- 3. off (default): INERT — kein Fetch, 0 Items ------------------------------------------
  const spyOff = fetcherOf(beXml);
  const rOff = await D.pardokDispatch({ id: "be-plenum", url: "https://x/be.xml" }, { mode: "off", fetchText: spyOff, noWrite: true });
  check("3a off -> 0 Items in die Pipeline", Array.isArray(rOff.items) && rOff.items.length === 0);
  check("3b off -> Fetcher NICHT aufgerufen (kein Netz)", spyOff.calls() === 0);
  check("3c off -> reason guard-off, kein Shadow", rOff.reason === "guard-off" && rOff.shadow === null);

  // --- 4. shadow: fetch+parse+dedup in isolierte Ablage, aber TROTZDEM 0 Pipeline-Items -------
  const spyBe = fetcherOf(beXml);
  const rBe = await D.pardokDispatch({ id: "be-plenum", url: "https://x/be.xml" }, { mode: "shadow", fetchText: spyBe, noWrite: true });
  check("4a shadow BE -> 0 Items in die Pipeline (Isolation)", rBe.items.length === 0);
  check("4b shadow BE -> Fetcher genau 1x aufgerufen", spyBe.calls() === 1);
  check("4c shadow BE -> Shadow-Report land=berlin, Dokumente>0", rBe.shadow && rBe.shadow.land === "berlin" && rBe.shadow.dokumente > 0);
  check("4d shadow BE -> reason shadow-only", rBe.reason === "shadow-only");

  const rBb = await D.pardokDispatch({ id: "bb-plenum", url: "https://x/bb.xml" }, { mode: "shadow", fetchText: fetcherOf(bbXml), noWrite: true });
  check("4e shadow BB -> 0 Items, land=brandenburg, Dokumente>0", rBb.items.length === 0 && rBb.shadow.land === "brandenburg" && rBb.shadow.dokumente > 0);

  // --- 5. Robustheit: fehlender Fetcher / Fetch-Fehler / HTML-Fehlerseite -> kein Crash, 0 Items
  const rNoFetch = await D.pardokDispatch({ id: "be-plenum" }, { mode: "shadow", noWrite: true });
  check("5a shadow ohne Fetcher -> 0 Items, reason kein-fetcher, kein Crash", rNoFetch.items.length === 0 && rNoFetch.reason === "kein-fetcher");
  const rThrow = await D.pardokDispatch({ id: "be-plenum", url: "https://x" }, { mode: "shadow", noWrite: true, fetchText: async () => { throw new Error("boom"); } });
  check("5b shadow Fetch-Fehler -> 0 Items, reason fetch-fehler, kein Crash", rThrow.items.length === 0 && /fetch-fehler/.test(rThrow.reason));
  const rHtml = await D.pardokDispatch({ id: "be-plenum", url: "https://x" }, { mode: "shadow", noWrite: true, fetchText: async () => "<!doctype html><html>Fehler 500</html>" });
  check("5c shadow HTML-Fehlerseite -> 0 Items, fehlerseite=true, 0 Dokumente", rHtml.items.length === 0 && rHtml.shadow.fehlerseite === true && rHtml.shadow.dokumente === 0);

  // --- 6. Kein PARDOK-Land trotz shadow -> inert (0 Items, kein Fetch) ------------------------
  const spyUnknown = fetcherOf(beXml);
  const rUnknown = await D.pardokDispatch({ id: "bund-basis", url: "https://x" }, { mode: "shadow", fetchText: spyUnknown, noWrite: true });
  check("6 shadow ohne PARDOK-Land -> 0 Items, kein Fetch, reason kein-pardok-land", rUnknown.items.length === 0 && spyUnknown.calls() === 0 && rUnknown.reason === "kein-pardok-land");

  // --- 7. crawlSource-Anbindung: structured_download nur mit Guard shadow aktiv ---------------
  const savedFlag = process.env.HELMUT_PARDOK_DISPATCH;
  try {
    // 7a: Guard explizit AUS (Env ueberstimmt das eingecheckte Datei-Flag shadow) ->
    // crawlSource(structured_download) liefert [] OHNE Fetch. Der Betreiber kann den
    // Shadow-Modus also jederzeit per Env-Variable stoppen, ohne Code-Aenderung.
    process.env.HELMUT_PARDOK_DISPATCH = "off";
    const spyCsOff = fetcherOf(beXml);
    const csOff = await crawlSource({ id: "be-plenum", crawlMethod: "structured_download", url: "https://x/be.xml" }, { fetchText: spyCsOff });
    check("7a crawlSource structured_download + Env off (ueberstimmt Datei-Flag) -> [] ohne Fetch", Array.isArray(csOff) && csOff.length === 0 && spyCsOff.calls() === 0);

    // 7a2: Env NICHT gesetzt -> das eingecheckte Datei-Flag (helmut-flags.json) schaltet
    // shadow: Fetch+Parse laufen, aber weiterhin 0 Items in der sichtbaren Pipeline.
    delete process.env.HELMUT_PARDOK_DISPATCH;
    const spyCsFile = fetcherOf(beXml);
    const csFile = await crawlSource({ id: "be-plenum", crawlMethod: "structured_download", url: "https://x/be.xml" }, { fetchText: spyCsFile });
    check("7a2 Env unset -> Datei-Flag shadow greift (Fetch 1x), Pipeline bleibt leer", Array.isArray(csFile) && csFile.length === 0 && spyCsFile.calls() === 1);

    // 7b: Guard shadow -> crawlSource parst (injizierter Fetcher), liefert aber weiterhin [].
    process.env.HELMUT_PARDOK_DISPATCH = "shadow";
    const spyCsShadow = fetcherOf(beXml);
    const csShadow = await crawlSource({ id: "be-plenum", crawlMethod: "structured_download", url: "https://x/be.xml" }, { fetchText: spyCsShadow });
    check("7b crawlSource structured_download + Guard shadow -> [] in Pipeline, aber geparst (Fetch 1x)", csShadow.length === 0 && spyCsShadow.calls() === 1);

    // 7c: bestehende Methode manual bleibt unveraendert (kein Dispatch, kein Fetch).
    const spyManual = fetcherOf(beXml);
    const csManual = await crawlSource({ id: "some", crawlMethod: "manual", url: "https://x" }, { fetchText: spyManual });
    check("7c crawlSource manual unveraendert -> [] ohne Fetch (Dispatch nicht ausgeloest)", csManual.length === 0 && spyManual.calls() === 0);
  } finally {
    if (savedFlag === undefined) delete process.env.HELMUT_PARDOK_DISPATCH; else process.env.HELMUT_PARDOK_DISPATCH = savedFlag;
  }

  // --- 8. Isolierte Datei-Ablage: schreibt in eigene Datei, kein Prod-Artefakt ----------------
  const outPath = path.join(process.env.TMPDIR || "/tmp", `pardok-dispatch-test-${beXml.length}.json`);
  const rWrite = await D.pardokDispatch({ id: "be-plenum", url: "https://x/be.xml" }, { mode: "shadow", fetchText: fetcherOf(beXml), shadowOut: outPath });
  const wrote = fs.existsSync(outPath);
  const payload = wrote ? JSON.parse(fs.readFileSync(outPath, "utf8")) : {};
  check("8a shadow schreibt isolierte Datei (shadowOut)", wrote && rWrite.shadowOut === outPath);
  check("8b Ablage traegt Shadow-Kennzeichnung + kein Prod-Write", /shadow-only/.test(payload.erzeugt_modus || "") && /kein raw_documents/.test(payload.erzeugt_modus || ""));
  if (wrote) fs.unlinkSync(outPath);

  // --- 9. LIVE-Doppel-Gate (Landtag-Sprint P2-2): Items fliessen NUR mit Flag 'live'
  //     UND Landesfreigabe (HELMUT_LANDESMODULE). Injizierte Test-Envs sind hermetisch
  //     (Datei-Flags wirken nur auf process.env) — Production bleibt unberuehrt.
  // 9a: live OHNE Landesfreigabe -> Shadow-Verhalten (0 Items), ehrlicher Grund.
  const rLiveKeineFreigabe = await D.pardokDispatch(
    { id: "be-plenum", url: "https://x/be.xml" },
    { mode: "live", env: { HELMUT_LANDESMODULE: "" }, fetchText: fetcherOf(beXml), noWrite: true });
  check("9a live OHNE Landesfreigabe -> 0 Items (shadow-fallback)",
    rLiveKeineFreigabe.items.length === 0 && /live-ohne-landesfreigabe/.test(rLiveKeineFreigabe.reason));

  // 9b: live + Freigabe NUR fuer das ANDERE Land -> weiterhin 0 Items (Isolation).
  const rLiveFalschesLand = await D.pardokDispatch(
    { id: "be-plenum", url: "https://x/be.xml" },
    { mode: "live", env: { HELMUT_LANDESMODULE: "brandenburg" }, fetchText: fetcherOf(beXml), noWrite: true });
  check("9b live Berlin bei Freigabe NUR brandenburg -> 0 Items (Landes-Isolation)",
    rLiveFalschesLand.items.length === 0 && /live-ohne-landesfreigabe/.test(rLiveFalschesLand.reason));

  // 9c: live + passende Freigabe -> Items fliessen, korrekt gemappt (amtlich, Ebene land).
  const rLiveBe = await D.pardokDispatch(
    { id: "be-plenum", name: "Abgeordnetenhaus von Berlin (PARDOK)", url: "https://x/be.xml", priority: 60 },
    { mode: "live", env: { HELMUT_LANDESMODULE: "berlin" }, fetchText: fetcherOf(beXml), noWrite: true });
  check("9c live Berlin MIT Freigabe -> Items > 0, reason live-freigegeben",
    rLiveBe.items.length > 0 && rLiveBe.reason === "live-freigegeben" && rLiveBe.mode === "live");
  const it = rLiveBe.items[0] || {};
  check("9d Live-Item-Mapping: sourceType landesparlament, confidence high, Ebene land, Hash=Fingerabdruck",
    it.sourceType === "landesparlament" && it.confidence === "high"
    && it.politicalLevel === "land" && it.sourcePoliticalLevel === "land"
    && String(it.hash || "").startsWith("pardok-") && String(it.title || "").length > 0);
  check("9e Live-Items: alle aus Berlin, KEIN Brandenburg-Dokument (Parser-Isolation)",
    rLiveBe.items.every((x) => x.pardokLand === "berlin" && (x.geography || "") === "geo-land-berlin"));

  // 9f: dieselbe Doppel-Freigabe fuer Brandenburg — und BB-Items tragen nie Berlin-Geografie.
  const rLiveBb = await D.pardokDispatch(
    { id: "bb-plenum", name: "Landtag Brandenburg (parldok)", url: "https://x/bb.xml", priority: 60 },
    { mode: "live", env: { HELMUT_LANDESMODULE: "berlin,brandenburg" }, fetchText: fetcherOf(bbXml), noWrite: true });
  check("9f live Brandenburg MIT Freigabe -> Items > 0, alle geo-land-brandenburg",
    rLiveBb.items.length > 0 && rLiveBb.items.every((x) => x.pardokLand === "brandenburg" && (x.geography || "") === "geo-land-brandenburg"));

  // 9g: Item-Cap greift (maxItems), neueste zuerst, keine Platzhalter.
  const rLiveCap = await D.pardokDispatch(
    { id: "be-plenum", url: "https://x/be.xml", maxItems: 3 },
    { mode: "live", env: { HELMUT_LANDESMODULE: "berlin" }, fetchText: fetcherOf(beXml), noWrite: true });
  check("9g live respektiert maxItems-Cap", rLiveCap.items.length <= 3 && rLiveCap.items.length > 0);

  // 9h: live + Fehlerseite -> 0 Items (nichts erfinden).
  const rLiveHtml = await D.pardokDispatch(
    { id: "be-plenum", url: "https://x" },
    { mode: "live", env: { HELMUT_LANDESMODULE: "berlin" }, noWrite: true, fetchText: async () => "<!doctype html><html>Fehler 500</html>" });
  check("9h live HTML-Fehlerseite -> 0 Items, reason fehlerseite", rLiveHtml.items.length === 0 && rLiveHtml.reason === "fehlerseite");

  // 9i: crawlSource-Ende-zu-Ende: Prozess-Env live+Freigabe -> Items erreichen den Crawl;
  //     danach Env vollstaendig zurueckgesetzt (kein Leck in andere Suiten).
  const savedDispatch = process.env.HELMUT_PARDOK_DISPATCH;
  const savedLandesmodule = process.env.HELMUT_LANDESMODULE;
  try {
    process.env.HELMUT_PARDOK_DISPATCH = "live";
    process.env.HELMUT_LANDESMODULE = "berlin";
    const csLive = await crawlSource({ id: "be-plenum", crawlMethod: "structured_download", url: "https://x/be.xml" }, { fetchText: fetcherOf(beXml) });
    check("9i crawlSource live+Landesfreigabe -> Items in der Crawl-Rueckgabe", Array.isArray(csLive) && csLive.length > 0 && csLive[0].sourceType === "landesparlament");

    process.env.HELMUT_LANDESMODULE = "";
    const csLiveOhne = await crawlSource({ id: "be-plenum", crawlMethod: "structured_download", url: "https://x/be.xml" }, { fetchText: fetcherOf(beXml) });
    check("9j crawlSource live OHNE Landesfreigabe -> weiterhin []", Array.isArray(csLiveOhne) && csLiveOhne.length === 0);
  } finally {
    if (savedDispatch === undefined) delete process.env.HELMUT_PARDOK_DISPATCH; else process.env.HELMUT_PARDOK_DISPATCH = savedDispatch;
    if (savedLandesmodule === undefined) delete process.env.HELMUT_LANDESMODULE; else process.env.HELMUT_LANDESMODULE = savedLandesmodule;
  }

  console.log(`\n== PARDOK-Dispatch Offline-Test: ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error("UNERWARTETER FEHLER", e); process.exit(1); });
