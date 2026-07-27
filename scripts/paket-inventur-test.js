"use strict";

// Helmut — Phase 1, Punkt 18: Testsuite der Production-Inventur aller Quellenpakete.
// ============================================================================
// Prüft die neun Abnahmepunkte des Auftrags nachvollziehbar durch:
//   1 jedes Paket genau einmal · 2 alle Abrufwege erfasst · 3 aktiv/inaktiv sauber getrennt ·
//   4 fehlende Lieferungen sichtbar · 5 Fehler verständlich klassifiziert (Punkt-16-Klassen) ·
//   6 Unbekanntes bleibt unbekannt · 7 Ausgabe reproduzierbar · 8 Zahlen = Datenquelle ·
//   9 genau ein Zustand je Paket.
//
// Der Schwerpunkt liegt gleichgewichtig auf „erkennt den Ausfall" UND „behauptet kein
// falsches Grün". Eine Inventur, die einen unbekannten Zustand als gesund ausweist, ist
// gefährlicher als gar keine.
//
// Alle Fixtures sind neutral (rp-ok1, t1, Testmandat Eins). Es werden bewusst KEINE echten
// Mandanten-, Personen- oder Production-Kennungen verwendet (CLAUDE.md §4.2). Die
// Paketschlüssel (`bund-basis`, `arbeit-und-soziales`, …) sind Architekturbegriffe des
// Resolvers, keine Mandantenidentitäten.
//
// Offline: keine Datenbank, kein Netz, keine Uhr ohne Eingabe.

const inv = require("../lib/helmut/quellenarchitektur/paket-inventur");
const sf = require("../lib/helmut/quellenarchitektur/source-failure");
const { PAKET_ZUSTAENDE: Z, PLANZUSTAENDE: PZ } = inv;

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; return; }
  failed++;
  console.error(`  FEHLGESCHLAGEN: ${name}${detail ? ` — ${detail}` : ""}`);
}
function gruppe(titel) { console.log(`\n── ${titel} ──`); }

const TAG = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-07-27T12:00:00Z");

// --- Fixture-Helfer ---------------------------------------------------------

// Telemetriezeile im Format der echten Tabelle source_crawl_telemetry.
function lauf(sourceId, tageZurueck, art, extra = {}) {
  const created = new Date(NOW - tageZurueck * TAG).toISOString();
  const basis = {
    source_id: sourceId, created_at: created, finished_at: created,
    run_id: extra.run || `run-${String(tageZurueck).replace(".", "_")}`,
    duration_ms: extra.dauer != null ? extra.dauer : 500, retry_count: 0
  };
  switch (art) {
    case "lieferung": return { ...basis, status: "ok", found_documents: extra.docs != null ? extra.docs : 5, new_documents: extra.neu != null ? extra.neu : 2, error_code: null };
    case "leer": return { ...basis, status: "empty", found_documents: 0, new_documents: 0, error_code: null };
    case "fehler": return { ...basis, status: "error", found_documents: 0, new_documents: 0, error_code: extra.code || "http-429" };
    case "gedrosselt": return { ...basis, status: "circuit-open", found_documents: 0, new_documents: 0, error_code: "circuit-open" };
    case "uebersprungen": return { ...basis, status: "skipped-shared", found_documents: 0, new_documents: 0, error_code: null };
    default: throw new Error(`unbekannte Laufart ${art}`);
  }
}
function reihe(sourceId, eintraege) {
  return eintraege.map(([tage, art, extra]) => lauf(sourceId, tage, art, extra || {}));
}
function weg(id, extra = {}) {
  return {
    id, legacy_source_id: extra.legacy || id, name: extra.name || id, method: extra.method || "rss",
    url: extra.url || `https://beispiel.invalid/${id}.xml`,
    status: extra.status || "healthy", activation_mode: extra.mode || "auto",
    is_critical: extra.kritisch === true, priority: 60, publisher_id: extra.pub || "pub-1"
  };
}
function paket(key, extra = {}) {
  return {
    id: extra.id || `pkg-${key}`, key, name: extra.name || `Paket ${key}`,
    purpose: extra.zweck || null, status: extra.status || "active",
    is_base: extra.base === true, political_level: extra.ebene || "bund",
    geography_id: extra.geo || "geo-bund", required_classes: extra.klassen || []
  };
}
function zuordnung(paketKey, wegId) { return { package_id: `pkg-${paketKey}`, retrieval_path_id: wegId }; }

// Ein aktivierungsberechtigtes Bundestagsprofil in der Form, die auch der Server
// liefert (storage.fromMandateProfileRow -> englische Aliase).
function profil(id, extra = {}) {
  return {
    id, fullName: extra.name || `Testmandat ${id}`, party: extra.partei || "Testpartei",
    committees: extra.ausschuesse || ["Testausschuss"],
    focusTopics: extra.themen || [],
    constituency: extra.wahlkreis || "Wahlkreis 1",
    state: extra.bundesland || "",
    politische_ebene: extra.ebene || "bundestag",
    profileActive: extra.aktiv === false ? false : true
  };
}

const GEO = [
  { id: "geo-bund", level: "bund", name: "Bund", parent_id: null },
  { id: "geo-land-berlin", level: "land", name: "Berlin", parent_id: "geo-bund" }
];

// ════════════════════════════════════════════════════════════════════════════
// HAUPTFIXTUR — ein realistischer Betriebsfall mit allen fünf Zuständen.
// ════════════════════════════════════════════════════════════════════════════
function hauptfixtur() {
  const packages = [
    paket("bund-basis", { base: true, name: "Bund Basis" }),
    paket("arbeit-und-soziales", { name: "Arbeit und Soziales" }),
    paket("die-linke-bund", { name: "Die Linke (Bund)" }),          // aktiviert, aber 0 Wege
    paket("profil-t1", { name: "Personenpaket t1" }),
    paket("regional-niedersachsen", { name: "Regional Niedersachsen" }), // aktiv, aber unreferenziert
    paket("berlin-basis", { base: true, status: "prepared", ebene: "land", geo: "geo-land-berlin", name: "Berlin Basis" })
  ];
  const retrievalPaths = [
    weg("rp-ok1"), weg("rp-ok2"),
    weg("rp-broken", { status: "broken", mode: "always_on", kritisch: true }),
    weg("rp-ok3"), weg("rp-fehler"),
    weg("rp-be-1", { status: "needs_review", mode: "manual" }),
    weg("rp-be-2", { status: "needs_review", mode: "manual" }),
    weg("rp-profil"),
    weg("rp-nds"),
    weg("rp-waise")   // gehört zu keinem Paket
  ];
  const packagePaths = [
    zuordnung("bund-basis", "rp-ok1"), zuordnung("bund-basis", "rp-ok2"), zuordnung("bund-basis", "rp-broken"),
    zuordnung("arbeit-und-soziales", "rp-ok3"), zuordnung("arbeit-und-soziales", "rp-fehler"),
    zuordnung("berlin-basis", "rp-be-1"), zuordnung("berlin-basis", "rp-be-2"),
    zuordnung("profil-t1", "rp-profil"),
    zuordnung("regional-niedersachsen", "rp-nds")
  ];
  const profiles = [
    profil("t1", { partei: "Die Linke", ausschuesse: ["Arbeit und Soziales"] }),
    profil("t2", { aktiv: false })
  ];
  const telemetrie = [
    ...reihe("rp-ok1", [[6, "lieferung"], [4, "lieferung"], [2, "lieferung"], [0.2, "lieferung"]]),
    ...reihe("rp-ok2", [[6, "lieferung"], [4, "lieferung"], [2, "lieferung"], [0.2, "lieferung"]]),
    ...reihe("rp-ok3", [[6, "lieferung"], [4, "lieferung"], [2, "lieferung"], [0.2, "lieferung"]]),
    // 4 Lieferungen, danach 3 Fehlläufe in Folge (HTTP 429) -> blockiert, akut/zeitnah
    ...reihe("rp-fehler", [[6, "lieferung"], [5, "lieferung"], [4, "lieferung"], [3, "lieferung"], [2, "fehler"], [1, "fehler"], [0.2, "fehler"]]),
    // technisch erfolgreich, aber nie Inhalt -> "leer", nie geliefert
    ...reihe("rp-profil", [[6, "leer"], [5, "leer"], [4, "leer"], [3, "leer"], [2, "leer"], [0.2, "leer"]]),
    // liefert, gehört aber zu einem unreferenzierten Paket -> darf NICHT als aktiv gelten
    ...reihe("rp-nds", [[6, "lieferung"], [4, "lieferung"], [2, "lieferung"], [0.2, "lieferung"]]),
    // Laufzeitquelle aus dem Profil — im Katalog bewusst nicht vorhanden
    ...reihe("t1-news", [[6, "lieferung"], [4, "lieferung"], [2, "lieferung"], [0.2, "lieferung"]])
  ];
  return { packages, packagePaths, retrievalPaths, geographies: GEO, profiles, telemetrie };
}

const HAUPT = inv.buildPaketInventur({ ...hauptfixtur(), now: NOW, env: {} });
const byKey = new Map(HAUPT.pakete.map((p) => [p.key, p]));

// ════════════════════════════════════════════════════════════════════════════
gruppe("1 · Jedes vorhandene Paket erscheint genau einmal");

const fixturKeys = hauptfixtur().packages.map((p) => p.key).sort();
check("Paketanzahl stimmt", HAUPT.pakete.length === fixturKeys.length, `${HAUPT.pakete.length} statt ${fixturKeys.length}`);
check("keine Dublette", new Set(HAUPT.pakete.map((p) => p.key)).size === HAUPT.pakete.length);
check("kein Paket fehlt", HAUPT.pakete.map((p) => p.key).sort().join(",") === fixturKeys.join(","));
check("jedes Paket trägt Kennung UND lesbaren Namen",
  HAUPT.pakete.every((p) => typeof p.key === "string" && p.key.length > 0 && typeof p.name === "string" && p.name.length > 0));
check("summe.pakete = Zeilenzahl", HAUPT.summe.pakete === HAUPT.pakete.length);

// ════════════════════════════════════════════════════════════════════════════
gruppe("2 · Alle zugeordneten Abrufwege werden erfasst");

const wegeInPaketen = HAUPT.pakete.reduce((n, p) => n + p.abrufwege.liste.length, 0);
check("Summe der Paketwege = Zuordnungen", wegeInPaketen === 9, `${wegeInPaketen} statt 9`);
check("Weg ohne Paket erscheint separat", HAUPT.wegeOhnePaket.length === 1 && HAUPT.wegeOhnePaket[0].quelle === "rp-waise");
check("kein Abrufweg geht verloren",
  wegeInPaketen + HAUPT.wegeOhnePaket.length === 10, `${wegeInPaketen}+${HAUPT.wegeOhnePaket.length}`);
check("bund-basis führt genau 3 Wege", byKey.get("bund-basis").abrufwege.gesamt === 3);
check("jede Wegzeile trägt Planzustand UND Laufklasse",
  HAUPT.pakete.every((p) => p.abrufwege.liste.every((w) => w.planzustand && w.klasse)));

// Ein Weg in ZWEI Paketen (der reale Zwei-Länder-Fall) erscheint in beiden,
// wird global aber nur einmal gezählt.
{
  const f = hauptfixtur();
  f.packagePaths.push(zuordnung("arbeit-und-soziales", "rp-ok1"));
  const i = inv.buildPaketInventur({ ...f, now: NOW, env: {} });
  const bb = i.pakete.find((p) => p.key === "bund-basis");
  const aus = i.pakete.find((p) => p.key === "arbeit-und-soziales");
  check("mehrfach zugeordneter Weg erscheint in beiden Paketen",
    bb.abrufwege.liste.some((w) => w.wegId === "rp-ok1") && aus.abrufwege.liste.some((w) => w.wegId === "rp-ok1"));
  check("Gesamtzahl der Abrufwege bleibt entdoppelt", i.summe.abrufwege === 10, String(i.summe.abrufwege));
  check("Gesamtertrag wird NICHT doppelt gezählt",
    i.summe.ertragBetriebszeitraum.neu === HAUPT.summe.ertragBetriebszeitraum.neu);
}

// Verwaiste Zuordnung (zeigt ins Leere) wird sichtbar, nicht still verworfen.
{
  const f = hauptfixtur();
  f.packagePaths.push({ package_id: "pkg-gibtsnicht", retrieval_path_id: "rp-ok1" });
  f.packagePaths.push({ package_id: "pkg-bund-basis", retrieval_path_id: "rp-gibtsnicht" });
  const i = inv.buildPaketInventur({ ...f, now: NOW, env: {} });
  check("verwaiste Zuordnungen werden ausgewiesen", i.summe.verwaisteZuordnungen === 2, String(i.summe.verwaisteZuordnungen));
  check("verwaiste Zuordnung erzeugt kein Geisterpaket", i.pakete.length === 6);
}

// ════════════════════════════════════════════════════════════════════════════
gruppe("3 · Aktive und inaktive Pakete werden korrekt unterschieden");

check("bund-basis ist technisch aktiviert", byKey.get("bund-basis").aktivierung.paketAktivierung === "active");
check("bund-basis wird von genau 1 Mandat gebraucht", byKey.get("bund-basis").aktivierung.refCount === 1);
check("deaktiviertes Profil zählt nicht zur Aktivierung", HAUPT.summe.aktiveProfile === 1, String(HAUPT.summe.aktiveProfile));
check("berlin-basis ist NICHT aktiviert", byKey.get("berlin-basis").aktivierung.paketAktivierung === "inactive");
check("regional-niedersachsen ist trotz status=active NICHT aktiviert",
  byKey.get("regional-niedersachsen").aktivierung.paketAktivierung === "inactive");
check("Aktivierung ≠ Datenbankstatus wird explizit begründet",
  /Kein aktivierungsberechtigtes Mandat/.test(byKey.get("regional-niedersachsen").aktivierung.begruendung));

// Der entscheidende Punkt des Auftrags: „Aktivierung bedeutet nicht nur, dass ein
// Datensatz vorhanden ist" — der Weg muss im Betrieb wirklich eingeplant sein.
check("liefernder Weg eines unreferenzierten Pakets gilt NICHT als eingeplant",
  byKey.get("regional-niedersachsen").abrufwege.eingeplant === 0);
check("…und das Paket ist dadurch inaktiv, nicht gesund",
  byKey.get("regional-niedersachsen").zustand === Z.INAKTIV);
check("…obwohl der Weg im Betriebszeitraum echten Ertrag hatte",
  byKey.get("regional-niedersachsen").ertrag.betriebszeitraum.neu > 0);
check("ausführbar-Kennzeichen unterscheidet aktiviert von lauffähig",
  byKey.get("bund-basis").aktivierung.ausfuehrbar === true && byKey.get("regional-niedersachsen").aktivierung.ausfuehrbar === false);
check("berlin-basis: Wege sind bewusst gesperrt (Landesmodul)",
  byKey.get("berlin-basis").abrufwege.liste.every((w) => w.planzustand === PZ.AUSGESCHLOSSEN && w.bewussterAusschluss));
check("berlin-basis ist inaktiv, nicht ausgefallen", byKey.get("berlin-basis").zustand === Z.INAKTIV);

// Landesmodul-Freigabe + berechtigtes Landtagsmandat: das Paket wird angefordert,
// bleibt aber `prepared` -> ehrlich als „angefordert, unversorgt" sichtbar.
{
  const f = hauptfixtur();
  f.profiles.push(profil("t3", { ebene: "landtag", bundesland: "Berlin", partei: "Testpartei" }));
  const i = inv.buildPaketInventur({ ...f, now: NOW, env: { HELMUT_LANDESMODULE: "berlin" } });
  const be = i.pakete.find((p) => p.key === "berlin-basis");
  check("angefordertes, unversorgtes Paket wird als solches gekennzeichnet", be.flags.angefordertUnversorgt === true);
  check("…Aktivierung meldet requested_unsupplied", be.aktivierung.paketAktivierung === "requested_unsupplied");
  check("…die Versorgungslücke steht in der Begründung", /angefordert, ist aber nicht versorgt/.test(be.aktivierung.begruendung));
  check("…Zustand bleibt inaktiv (bewusst nicht in Betrieb), nie gesund", be.zustand === Z.INAKTIV && be.zustand !== Z.GESUND);
  check("…und die Nachfrage taucht im Zustandsgrund auf", /fordern dieses Paket an/.test(be.zustandGrund));
  check("Landesmodul-Lage wird belegt ausgewiesen",
    i.datengrundlage.landesmodule.mitBerechtigtemMandat.includes("berlin") && i.datengrundlage.landesmodule.wirksam.includes("berlin"));
}

// Ohne berechtigtes Landtagsmandat ist die Aussage vom Flag unabhängig — das muss
// die Inventur ausdrücklich sagen (der Production-Flagwert ist nicht lesbar).
check("ohne Landtagsmandat ist die Landesmodul-Aussage flagunabhängig",
  HAUPT.datengrundlage.landesmodule.unsicher === false
  && /unabhängig vom Freigabe-Flag inaktiv/.test(HAUPT.datengrundlage.landesmodule.hinweis));
{
  const f = hauptfixtur();
  f.profiles.push(profil("t3", { ebene: "landtag", bundesland: "Berlin" }));
  const i = inv.buildPaketInventur({ ...f, now: NOW, env: {} });
  check("mit Landtagsmandat, aber ohne lesbares Flag: ausdrücklich unsicher",
    i.datengrundlage.landesmodule.unsicher === true);
}

// ════════════════════════════════════════════════════════════════════════════
gruppe("4 · Fehlende Lieferungen werden sichtbar");

const pProfil = byKey.get("profil-t1");
check("Paket ohne je erfolgte Lieferung: letzteLieferung ist null", pProfil.letzteLieferung === null);
check("…und trägt das Kennzeichen 'nie geliefert'", pProfil.flags.ohneLieferungJemals === true);
check("…und gilt als ausgefallen, nicht als gesund", pProfil.zustand === Z.AUSGEFALLEN);
check("…Ertrag im Betriebszeitraum ist ausgewiesen 0", pProfil.ertrag.betriebszeitraum.neu === 0 && pProfil.ertrag.betriebszeitraum.lieferungen === 0);
check("…die Begründung nennt die Ursache", /Kein eingeplanter Abrufweg liefert/.test(pProfil.zustandGrund));
check("liefernde Pakete tragen einen echten Lieferzeitpunkt",
  byKey.get("bund-basis").letzteLieferung && byKey.get("bund-basis").letzteLieferung.at);
check("Lieferzeitpunkt nennt seine Grundlage",
  byKey.get("bund-basis").letzteLieferung.grundlage === "Bewertungsfenster");

// Ohne unbeschränkte Lieferhistorie darf nur „im Fenster" behauptet werden.
check("fehlende Lieferhistorie wird als Grenze benannt",
  HAUPT.datengrundlage.lieferhistorieUnbeschraenkt.verfuegbar === false
  && /nur innerhalb des Betriebszeitraums/.test(HAUPT.datengrundlage.lieferhistorieUnbeschraenkt.hinweis));
{
  const alt = NOW - 90 * TAG;
  const i = inv.buildPaketInventur({
    ...hauptfixtur(), now: NOW, env: {},
    lieferhistorie: [{ source_id: "rp-profil", at: new Date(alt).toISOString() }]
  });
  const p = i.pakete.find((x) => x.key === "profil-t1");
  check("mit Lieferhistorie wird eine ALTE Lieferung sichtbar", p.letzteLieferung && Date.parse(p.letzteLieferung.at) === alt);
  check("…und ihre Grundlage ausdrücklich benannt", p.letzteLieferung.grundlage === "gesamte Telemetrie");
  check("…der Zustand bleibt trotzdem ausgefallen (alt ≠ gesund)", p.zustand === Z.AUSGEFALLEN);
  check("…Datengrundlage meldet die Historie als vorhanden", i.datengrundlage.lieferhistorieUnbeschraenkt.verfuegbar === true);
}

// Paket ohne jeden Abrufweg, aber technisch aktiviert -> Ausfall, nie „inaktiv".
const pLinke = byKey.get("die-linke-bund");
check("aktiviertes Paket ohne Abrufwege ist ausgefallen", pLinke.zustand === Z.AUSGEFALLEN);
check("…und trägt das Kennzeichen 'ohne Abrufwege'", pLinke.flags.ohneAbrufwege === true);
check("…die Begründung sagt, dass es nichts liefern kann", /keinen einzigen Abrufweg/.test(pLinke.zustandGrund));

// ════════════════════════════════════════════════════════════════════════════
gruppe("5 · Fehler und Einschränkungen werden verständlich klassifiziert");

const pAus = byKey.get("arbeit-und-soziales");
const wFehler = pAus.abrufwege.liste.find((w) => w.quelle === "rp-fehler");
check("Fehlerklasse stammt aus Punkt 16", Object.values(sf.STOERUNGSKLASSEN).includes(wFehler.klasse));
check("HTTP-429-Serie wird als 'blockiert' geführt", wFehler.klasse === sf.STOERUNGSKLASSEN.BLOCKIERT, wFehler.klasse);
check("Handlungsstufe stammt aus Punkt 16", Object.values(sf.HANDLUNGSSTUFEN).includes(wFehler.stufe));
check("gestörter Weg ist als Störung markiert", wFehler.stoerung === true && wFehler.wirksam === false);
check("Paket mit einem gestörten von zwei Wegen ist eingeschränkt", pAus.zustand === Z.EINGESCHRAENKT);
check("…die Begründung nennt Zahl und Ursache", /1 von 2 eingeplanten Wegen gestört/.test(pAus.zustandGrund));
check("…und der Befund erscheint in der Fehlerliste",
  [...pAus.fehler.akut, ...pAus.fehler.zeitnah].some((b) => b.quelle === "rp-fehler"));
check("Klassenzähler je Paket ist gefüllt", pAus.fehler.klassen[sf.STOERUNGSKLASSEN.BLOCKIERT] === 1);

const pBund = byKey.get("bund-basis");
const wBroken = pBund.abrufwege.liste.find((w) => w.quelle === "rp-broken");
check("defekter Weg ist strukturell als 'defekt' geführt", wBroken.planzustand === PZ.DEFEKT);
check("…und erscheint als strukturelle Einschränkung",
  pBund.fehler.strukturell.some((s) => s.quelle === "rp-broken" && s.art === "defekt"));
check("…ein defekter Pflichtweg macht das Paket eingeschränkt, nicht gesund", pBund.zustand === Z.EINGESCHRAENKT);
check("…die Begründung benennt den defekten Weg", /1 zugeordnete Wege defekt/.test(pBund.zustandGrund));
check("…und das Kennzeichen 'defekteWege' ist gesetzt", pBund.flags.defekteWege === true);

// Ohne Planachse wäre ein defekter Weg nur „unbekannt" (er erzeugt nie Telemetrie).
check("defekter Weg trägt beide Achsen getrennt",
  wBroken.planzustand === PZ.DEFEKT && wBroken.klasse === sf.STOERUNGSKLASSEN.UNBEKANNT);

// Bewusste Sperren sind KEINE Fehler.
const pBerlin = byKey.get("berlin-basis");
check("bewusst gesperrte Wege erzeugen keine strukturelle Fehlermeldung", pBerlin.fehler.strukturell.length === 0);
check("bewusst gesperrte Wege erzeugen keinen Handlungsbedarf", pBerlin.fehler.stufen.akut === 0 && pBerlin.fehler.stufen.zeitnah_pruefen === 0);
check("Ausschlussgründe sind gezählt und benannt",
  Object.keys(pBerlin.abrufwege.ausschlussgruende).some((g) => g === "landesmodul-gesperrt"));

// ════════════════════════════════════════════════════════════════════════════
gruppe("6 · Unbekannte Werte bleiben unbekannt (kein falsches Grün)");

// Eingeplante Wege, aber überhaupt keine Telemetrie.
{
  const f = hauptfixtur();
  f.telemetrie = [];
  const i = inv.buildPaketInventur({ ...f, now: NOW, env: {} });
  const bb = i.pakete.find((p) => p.key === "bund-basis");
  check("ohne jede Telemetrie: eingeplantes Paket ist unbekannt", bb.zustand === Z.UNBEKANNT, bb.zustand);
  check("…nie gesund", i.pakete.every((p) => p.zustand !== Z.GESUND));
  check("…die Datengrundlage sagt es ausdrücklich",
    i.datengrundlage.telemetrie.verfuegbar === false && /nicht messbar/.test(i.datengrundlage.telemetrie.hinweis));
  check("…Ertrag ist als nicht messbar markiert", bb.ertrag.messbar === false && Boolean(bb.ertrag.grund));
  check("…das Kennzeichen 'ohne Telemetrie' ist gesetzt", bb.flags.ohneTelemetrie === true);
  check("…ein bewusst gesperrtes Paket bleibt trotzdem inaktiv (kein Datenproblem)",
    i.pakete.find((p) => p.key === "berlin-basis").zustand === Z.INAKTIV);
}

// Eingeplante Wege mit zu dünner Datenlage (unter der Punkt-16-Mindestzahl).
{
  const f = hauptfixtur();
  f.telemetrie = [...reihe("rp-ok1", [[1, "lieferung"]]), ...reihe("rp-ok2", [[1, "lieferung"]])];
  const i = inv.buildPaketInventur({ ...f, now: NOW, env: {} });
  const bb = i.pakete.find((p) => p.key === "bund-basis");
  check("zu wenige Läufe -> Wege sind 'unbekannt'",
    bb.abrufwege.liste.filter((w) => w.planzustand === PZ.EINGEPLANT).every((w) => w.klasse === sf.STOERUNGSKLASSEN.UNBEKANNT));
  check("…und das Paket ist unbekannt, nicht gesund", bb.zustand === Z.UNBEKANNT);
}

// Alles läuft, aber es kommt nichts an -> eingeschränkt, nie gesund.
{
  const f = hauptfixtur();
  f.telemetrie = [
    ...reihe("rp-ok1", [[6, "lieferung", { neu: 0 }], [4, "lieferung", { neu: 0 }], [2, "lieferung", { neu: 0 }], [0.2, "lieferung", { neu: 0 }]]),
    ...reihe("rp-ok2", [[6, "lieferung", { neu: 0 }], [4, "lieferung", { neu: 0 }], [2, "lieferung", { neu: 0 }], [0.2, "lieferung", { neu: 0 }]])
  ];
  const i = inv.buildPaketInventur({ ...f, now: NOW, env: {} });
  const bb = i.pakete.find((p) => p.key === "bund-basis");
  check("Wege liefern technisch, aber 0 neue Dokumente -> eingeschränkt", bb.zustand === Z.EINGESCHRAENKT, bb.zustand);
  check("…die Begründung benennt genau das", /kein einziges NEUES Dokument/.test(bb.zustandGrund));
  check("…Kennzeichen 'ertragNullImFenster'", bb.flags.ertragNullImFenster === true);
}

// Ein Paket, das wirklich sauber läuft, DARF gesund sein — sonst ist die Skala wertlos.
{
  const packages = [paket("bund-basis", { base: true })];
  const retrievalPaths = [weg("rp-a"), weg("rp-b")];
  const packagePaths = [zuordnung("bund-basis", "rp-a"), zuordnung("bund-basis", "rp-b")];
  const profiles = [profil("t1")];
  const telemetrie = [
    ...reihe("rp-a", [[6, "lieferung"], [4, "lieferung"], [2, "lieferung"], [0.2, "lieferung"]]),
    ...reihe("rp-b", [[6, "lieferung"], [4, "lieferung"], [2, "lieferung"], [0.2, "lieferung"]])
  ];
  const i = inv.buildPaketInventur({ packages, retrievalPaths, packagePaths, profiles, telemetrie, geographies: GEO, now: NOW, env: {} });
  check("störungsfreies, lieferndes Paket ist gesund", i.pakete[0].zustand === Z.GESUND, i.pakete[0].zustand + " / " + i.pakete[0].zustandGrund);
  check("…und die Begründung ist positiv belegt", /liefern störungsfrei/.test(i.pakete[0].zustandGrund));
  check("…Zustandszähler zählt es als gesund", i.summe.zustand.gesund === 1);
}

// ════════════════════════════════════════════════════════════════════════════
gruppe("7 · Die Ausgabe ist reproduzierbar");

{
  const a = inv.buildPaketInventur({ ...hauptfixtur(), now: NOW, env: {} });
  const b = inv.buildPaketInventur({ ...hauptfixtur(), now: NOW, env: {} });
  check("zwei Läufe auf denselben Daten sind byte-identisch", JSON.stringify(a) === JSON.stringify(b));
  const c = inv.buildPaketInventur({ ...hauptfixtur(), now: NOW + 60_000, env: {} });
  check("ein anderer Bewertungszeitpunkt ist am Zeitstempel erkennbar", c.erhobenAm !== a.erhobenAm);
  check("Erhebungszeitpunkt steht im Kopf UND an jeder Paketzeile",
    a.erhobenAm && a.pakete.every((p) => p.erhobenAm === a.erhobenAm));
  check("Paketreihenfolge ist deterministisch (Schwere, dann Schlüssel)",
    a.pakete.map((p) => p.key).join(",") === b.pakete.map((p) => p.key).join(","));
  check("Zustandsschwere sortiert nach oben",
    inv.ZUSTAND_RANG[a.pakete[0].zustand] <= inv.ZUSTAND_RANG[a.pakete[a.pakete.length - 1].zustand]);
  check("die verwendeten Schwellen sind Teil der Ausgabe", a.schwellen && a.schwellen.fensterTage === a.fensterTage);
}

// ════════════════════════════════════════════════════════════════════════════
gruppe("8 · Paket- und Abrufweganzahl stimmen mit der Datenquelle überein");

const roh = hauptfixtur();
check("summe.pakete = Zeilen in source_packages", HAUPT.summe.pakete === roh.packages.length);
check("summe.abrufwege = Zeilen in retrieval_paths", HAUPT.summe.abrufwege === roh.retrievalPaths.length);
check("summe.paketzuordnungen = Zeilen in package_paths", HAUPT.summe.paketzuordnungen === roh.packagePaths.length);
check("datengrundlage spiegelt dieselben Zahlen",
  HAUPT.datengrundlage.katalog.pakete === roh.packages.length
  && HAUPT.datengrundlage.katalog.abrufwege === roh.retrievalPaths.length
  && HAUPT.datengrundlage.katalog.zuordnungen === roh.packagePaths.length);
check("eingeplant + defekt + ausgeschlossen = alle Abrufwege",
  HAUPT.summe.wegeEingeplant + HAUPT.summe.wegeDefekt + HAUPT.summe.wegeAusgeschlossen === roh.retrievalPaths.length,
  `${HAUPT.summe.wegeEingeplant}+${HAUPT.summe.wegeDefekt}+${HAUPT.summe.wegeAusgeschlossen}`);
check("Zustandszähler summiert sich auf die Paketzahl",
  Object.values(HAUPT.summe.zustand).reduce((a, b) => a + b, 0) === HAUPT.pakete.length);
check("Profilzahlen stimmen", HAUPT.summe.profileGesamt === 2 && HAUPT.summe.aktiveProfile === 1);

// ════════════════════════════════════════════════════════════════════════════
gruppe("9 · Genau ein Zustand je Paket, alle Pflichtangaben vorhanden");

const PFLICHT = ["key", "name", "ebene", "region", "abrufwege", "aktivierung", "ertrag", "letzteLieferung", "fehler", "erhobenAm", "zustand"];
for (const p of HAUPT.pakete) {
  check(`${p.key}: alle Pflichtangaben vorhanden`,
    PFLICHT.every((f) => Object.prototype.hasOwnProperty.call(p, f)),
    PFLICHT.filter((f) => !Object.prototype.hasOwnProperty.call(p, f)).join(","));
  check(`${p.key}: genau ein gültiger Zustand`, Object.values(Z).includes(p.zustand), String(p.zustand));
  check(`${p.key}: Zustand ist begründet`, typeof p.zustandGrund === "string" && p.zustandGrund.length > 10);
}
check("die Hauptfixtur trennt drei verschiedene Zustände sauber",
  new Set(HAUPT.pakete.map((p) => p.zustand)).size === 3,
  [...new Set(HAUPT.pakete.map((p) => p.zustand))].join(","));
// Kein falsches Grün: in dieser Fixtur ist KEIN Paket vollständig in Ordnung —
// jedes hat einen defekten, gestörten, leeren, gesperrten oder fehlenden Weg.
check("kein Paket der Hauptfixtur wird fälschlich als gesund geführt",
  HAUPT.pakete.every((p) => p.zustand !== Z.GESUND));
check("Ebene und Region sind je Paket geführt",
  byKey.get("berlin-basis").ebene === "land" && byKey.get("berlin-basis").region.id === "geo-land-berlin");
check("Regionsname wird aus geographies aufgelöst", byKey.get("berlin-basis").region.name === "Berlin");
check("Basispaket-Eigenschaft ist geführt",
  byKey.get("bund-basis").istBasispaket === true && byKey.get("arbeit-und-soziales").istBasispaket === false);

// ════════════════════════════════════════════════════════════════════════════
gruppe("10 · Letzter Lauf: Wiederholungsläufe verfälschen den Ertrag nicht (Befund A-7)");

{
  const packages = [paket("bund-basis", { base: true })];
  const retrievalPaths = Array.from({ length: 12 }, (_, n) => weg(`rp-${n}`));
  const packagePaths = retrievalPaths.map((w) => zuordnung("bund-basis", w.id));
  const profiles = [profil("t1")];
  const telemetrie = [];
  // Drei ältere Vollläufe + ein vollständiger Lauf + 3 Minuten später ein
  // Wiederholungslauf, in dem der Schutzschalter alles abbricht.
  for (const [tage, run] of [[3, "run-a"], [2, "run-b"], [1, "run-c"], [0.5, "voll"]]) {
    for (const w of retrievalPaths) telemetrie.push(lauf(w.legacy_source_id, tage, "lieferung", { run, neu: 3 }));
  }
  for (const w of retrievalPaths) telemetrie.push(lauf(w.legacy_source_id, 0.49, "gedrosselt", { run: "wiederholung" }));
  // Eine Dublette im Volllauf muss die Invariante brechen (sonst wäre die Prüfung wertlos).
  const mitDublette = [...telemetrie, lauf(retrievalPaths[0].legacy_source_id, 0.5, "lieferung", { run: "voll", neu: 3 })];
  const i = inv.buildPaketInventur({ packages, retrievalPaths, packagePaths, profiles, telemetrie, geographies: GEO, now: NOW, env: {} });
  check("der Wiederholungslauf wird NICHT als letzter Lauf gewählt", i.letzterLauf && i.letzterLauf.runId === "voll", i.letzterLauf && i.letzterLauf.runId);
  // Invariante B3 (OP-19): Zeilen = distinct source_id, je Lauf ablesbar.
  check("Dublettenfreiheit des Laufs ist ablesbar",
    i.letzterLauf.dublettenfrei === true && i.letzterLauf.zeilen === i.letzterLauf.quellenDistinct);
  check("…und der Ertrag des Volllaufs bleibt sichtbar", i.letzterLauf.neu === 36, String(i.letzterLauf.neu));
  check("…die Volllauf-Schwelle wird mit ausgewiesen", i.datengrundlage.telemetrie.volllaufSchwelleWege > 0);
  check("…gedrosselte Läufe erzeugen keine Störung", i.pakete[0].zustand === Z.GESUND, i.pakete[0].zustandGrund);
  const d = inv.buildPaketInventur({ packages, retrievalPaths, packagePaths, profiles, telemetrie: mitDublette, geographies: GEO, now: NOW, env: {} });
  check("eine doppelte Zeile im Lauf bricht die Invariante sichtbar",
    d.letzterLauf.dublettenfrei === false && d.letzterLauf.zeilen === d.letzterLauf.quellenDistinct + 1);
}

// Gibt es überhaupt keinen vollständigen Lauf, wird das ehrlich benannt.
{
  const packages = [paket("bund-basis", { base: true })];
  const retrievalPaths = Array.from({ length: 30 }, (_, n) => weg(`rp-${n}`));
  const packagePaths = retrievalPaths.map((w) => zuordnung("bund-basis", w.id));
  const telemetrie = retrievalPaths.slice(0, 3).flatMap((w) => reihe(w.legacy_source_id, [[3, "lieferung", { run: "teil" }], [2, "lieferung", { run: "teil2" }], [1, "lieferung", { run: "teil3" }]]));
  const i = inv.buildPaketInventur({ packages, retrievalPaths, packagePaths, profiles: [profil("t1")], telemetrie, geographies: GEO, now: NOW, env: {} });
  check("kein Volllauf -> letzterLauf ist null", i.letzterLauf === null);
  check("…und der Grund wird genannt", typeof i.letzterLaufHinweis === "string" && i.letzterLaufHinweis.length > 10);
  check("…das Paket ist dennoch bewertbar (Teilwege liefern)", Object.values(Z).includes(i.pakete[0].zustand));
}

// ════════════════════════════════════════════════════════════════════════════
gruppe("11 · Laufzeitquellen ohne Paket bleiben sichtbar");

check("Laufzeitquelle wird erkannt", HAUPT.laufzeitquellen.length === 1 && HAUPT.laufzeitquellen[0].quelle === "t1-news");
check("…mit Klasse und Ertrag", HAUPT.laufzeitquellen[0].klasse === sf.STOERUNGSKLASSEN.OK && HAUPT.laufzeitquellen[0].ertragFenster.neu > 0);
check("…und wird keinem Paket zugeschlagen",
  HAUPT.pakete.every((p) => p.abrufwege.liste.every((w) => w.quelle !== "t1-news")));
check("Laufzeitquellen sind in der Summe geführt", HAUPT.summe.laufzeitquellen === 1);

// ════════════════════════════════════════════════════════════════════════════
gruppe("12 · Kostenverknüpfung (Punkt 17) ist optional und ehrlich");

check("ohne Kostendaten wird nichts behauptet",
  HAUPT.pakete.every((p) => p.kosten.verfuegbar === false && p.kosten.usd === null));
{
  const i = inv.buildPaketInventur({ ...hauptfixtur(), now: NOW, env: {}, kostenJeQuelle: { "rp-ok1": 0.01, "rp-ok2": 0.02 } });
  const bb = i.pakete.find((p) => p.key === "bund-basis");
  check("zugeordnete Kosten werden summiert", bb.kosten.verfuegbar === true && bb.kosten.usd === 0.03);
  check("Teilzuordnung wird als Untergrenze gekennzeichnet", /Untergrenze/.test(bb.kosten.hinweis || ""));
  check("Pakete ohne Zuordnung behaupten keine 0,00 USD",
    i.pakete.find((p) => p.key === "arbeit-und-soziales").kosten.usd === null);
}

// ════════════════════════════════════════════════════════════════════════════
gruppe("13 · Leere und kaputte Eingaben kippen die Inventur nicht");

{
  const i = inv.buildPaketInventur({});
  check("völlig leere Eingabe liefert eine leere, gültige Inventur", i.summe.pakete === 0 && Array.isArray(i.pakete));
  check("…und behauptet keine Telemetrie", i.datengrundlage.telemetrie.verfuegbar === false);
}
{
  const f = hauptfixtur();
  f.packages.push(null, { key: "ohne-id" });
  f.retrievalPaths.push(null, {});
  f.packagePaths.push(null, { package_id: "pkg-bund-basis" });
  f.telemetrie.push(null, { source_id: null }, { source_id: "rp-ok1", created_at: "kaputt" });
  const i = inv.buildPaketInventur({ ...f, now: NOW, env: {} });
  check("fehlerhafte Zeilen werden verworfen, nicht gezählt", i.summe.pakete === 6 && i.summe.abrufwege === 10);
  check("…und die Zustände bleiben unverändert",
    i.pakete.map((p) => `${p.key}:${p.zustand}`).join(",") === HAUPT.pakete.map((p) => `${p.key}:${p.zustand}`).join(","));
}
{
  // Telemetrie ausserhalb des Fensters darf keinen Ertrag vortäuschen.
  const f = hauptfixtur();
  f.telemetrie = reihe("rp-ok1", [[40, "lieferung"], [30, "lieferung"], [20, "lieferung"]]);
  const i = inv.buildPaketInventur({ ...f, now: NOW, env: {} });
  const bb = i.pakete.find((p) => p.key === "bund-basis");
  check("Lieferungen ausserhalb des Betriebszeitraums zählen nicht zum Ertrag", bb.ertrag.betriebszeitraum.neu === 0);
  check("…und das Paket wird nicht gesund", bb.zustand !== Z.GESUND);
}

// ════════════════════════════════════════════════════════════════════════════
gruppe("14 · Veraltete Datengrundlage ist ein eigener Befund");

// Fällt der Crawl als Ganzes aus, ist keine EINZELNE Quelle „veraltet" — es kommt
// nur nichts Neues mehr herein. Ohne eigenen Befund läse sich die Inventur wie
// eine Aussage über jetzt (realer Fall: Crawl-Zeitlimit am 2026-07-26/27).
check("frische Telemetrie gilt nicht als veraltet", HAUPT.datenalter.veraltet === false, String(HAUPT.datenalter.alterStunden));
check("Alter der jüngsten Zeile wird beziffert", typeof HAUPT.datenalter.alterStunden === "number" && HAUPT.datenalter.alterStunden < 12);
{
  const f = hauptfixtur();
  // Alle Läufe liegen 3 Tage zurück -> der Crawl steht, obwohl jede Quelle
  // für sich betrachtet im Rhythmus liegt.
  f.telemetrie = f.telemetrie.map((z) => ({ ...z, created_at: new Date(Date.parse(z.created_at) - 3 * TAG).toISOString() }));
  const i = inv.buildPaketInventur({ ...f, now: NOW, env: {} });
  check("stehender Crawl wird als veraltete Datengrundlage gemeldet", i.datenalter.veraltet === true, String(i.datenalter.alterStunden));
  check("…mit Stundenangabe", i.datenalter.alterStunden >= 72);
  check("…und ausdrücklichem Hinweis, dass der Crawl steht", /Der Crawl steht/.test(i.datenalter.hinweis));
}

// Die Schwelle ist rhythmus-abgeleitet, keine feste Stundenzahl: derselbe
// Rückstand ist bei fünf Vollrunden je Tag ein Befund und bei einem
// zweimal-täglichen Rhythmus keiner. Sonst wäre entweder die eine oder die
// andere Betriebsart dauerhaft falsch bewertet.
{
  const r = inv.crawlRhythmus(11.4, 4);
  check("dichter Rhythmus: 11,4 h Stille sind ein Befund", r.veraltet === true && r.schwelleStunden === 8);
  check("…die Schwelle ist nachrechenbar ausgewiesen", r.erwarteterAbstandStunden === 4 && /beobachteter Abstand/.test(r.grundlage));
  const r2 = inv.crawlRhythmus(11.4, 10);
  check("seltener Rhythmus: derselbe Rückstand ist KEIN Befund", r2.veraltet === false && r2.schwelleStunden === 20);
  const r3 = inv.crawlRhythmus(4, 0.5);
  check("Bodenschwelle verhindert Fehlalarm bei sehr dichtem Takt",
    r3.schwelleStunden === inv.CRAWL_RHYTHMUS.bodenStunden && r3.veraltet === true);
  const r4 = inv.crawlRhythmus(30, 40);
  check("Deckel verhindert unendliche Nachsicht", r4.schwelleStunden === inv.CRAWL_RHYTHMUS.deckelStunden && r4.veraltet === true);
  const r5 = inv.crawlRhythmus(20, null);
  check("ohne beobachteten Rhythmus gilt ein benannter Standardwert",
    r5.schwelleStunden === inv.CRAWL_RHYTHMUS.standardStunden && /Standardwert/.test(r5.grundlage) && r5.veraltet === true);
  const r6 = inv.crawlRhythmus(null, null);
  check("ohne Laufdaten wird nichts behauptet", r6.veraltet === false && r6.schwelleStunden === null);
}
{
  const f = hauptfixtur();
  f.telemetrie = [];
  const i = inv.buildPaketInventur({ ...f, now: NOW, env: {} });
  check("ohne Telemetrie ist das Datenalter null, nicht 0", i.datenalter.alterStunden === null && i.datenalter.juengsteZeileAt === null);
  check("…und der Hinweis sagt, dass kein aktueller Betrieb beschrieben wird",
    /keinen aktuellen Betrieb/.test(i.datenalter.hinweis));
}
check("defekter Weg nennt den Katalogstatus im Klartext",
  byKey.get("bund-basis").fehler.strukturell.some((s) => /Katalogstatus broken/.test(s.text)));

// ════════════════════════════════════════════════════════════════════════════
gruppe("15 · Hilfsfunktionen");

check("bewusster Ausschlussgrund wird erkannt", inv.istBewussterAusschluss("landesmodul-gesperrt (berlin: nicht freigegeben)") === true);
check("unbekannter Grund gilt NICHT als bewusst", inv.istBewussterAusschluss("irgendwas-neues") === false);
check("Grundkopf trennt Detail ab", inv.grundKopf("manuell-gesperrt (activation_mode=manual)") === "manuell-gesperrt");
check("Lieferhistorie akzeptiert Liste", inv.normalisiereLieferhistorie([{ source_id: "a", at: "2026-07-01T00:00:00Z" }]).get("a") === Date.parse("2026-07-01T00:00:00Z"));
check("Lieferhistorie akzeptiert Objekt", inv.normalisiereLieferhistorie({ a: "2026-07-01T00:00:00Z" }).get("a") === Date.parse("2026-07-01T00:00:00Z"));
check("Lieferhistorie ohne Inhalt bleibt null", inv.normalisiereLieferhistorie([]) === null && inv.normalisiereLieferhistorie(null) === null);
check("Lieferhistorie behält den jüngsten Eintrag",
  inv.normalisiereLieferhistorie([{ source_id: "a", at: "2026-07-01T00:00:00Z" }, { source_id: "a", at: "2026-07-05T00:00:00Z" }]).get("a") === Date.parse("2026-07-05T00:00:00Z"));

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(60)}`);
console.log(`Paket-Inventur (Punkt 18): ${passed} bestanden, ${failed} fehlgeschlagen`);
if (failed > 0) { console.error("FEHLGESCHLAGEN"); process.exit(1); }
console.log("ALLE TESTS BESTANDEN");
