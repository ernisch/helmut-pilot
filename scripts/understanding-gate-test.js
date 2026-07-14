"use strict";

// Offline-Test des Understanding-Gate (politische Vorpruefung vor dem vollen KI-Understanding).
// REINE LOGIK. Prueft die Reihenfolge (Hygiene -> Dedup -> amtlich -> Relevanz -> Grenzfall)
// und die verbindlichen Akzeptanzkriterien 1-5 (kein stilles Verwerfen relevanter amtlicher
// Dokumente; jede Ablehnung mit Grund; Unsicheres zurueckgestellt statt geloescht; keine
// doppelte KI fuer amtliche Struktur; derselbe Inhalt hoechstens ein voller Call).

const G = require("../lib/helmut/quellenarchitektur/understanding-gate");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }
const NOW = Date.parse("2026-07-14T00:00:00Z");
function doc(o) { return { content_hash: o.h || ("h-" + (o.title || "x")), id: "rd-" + (o.h || o.title || "x"), published_at: "2026-07-13T00:00:00Z", ...o }; }
function a(d, opts) { return G.assessDocument(doc(d), { now: NOW, ...(opts || {}) }); }

// 1) AMTLICH/STRUKTURIERT -> verstehen, structured (keine doppelte KI-Extraktion, Kriterium 4)
const amt = a({ title: "Kleine Anfrage zur Wohnungspolitik", document_type: "Kleine Anfrage" });
check("1 amtliche Dokumentart -> verstehen + structured (keine doppelte KI)", amt.decision === "verstehen" && amt.structured === true && amt.reason === "amtlich-strukturiert");
const amtSrc = a({ title: "Drucksache 19/1234", source_id: "be-plenum" });
check("1b amtliche Quelle (be-plenum) -> verstehen + structured", amtSrc.decision === "verstehen" && amtSrc.structured === true);

// 2) KLARES INSTITUTIONS-/EBENENSIGNAL -> verstehen (relevante Politik bleibt, Kriterium 1)
check("2 Bundestag -> verstehen (institution-ebene)", a({ title: "Bundestag beschliesst Rentenpaket" }).decision === "verstehen");
check("2b Landtag+Ort -> verstehen", a({ title: "Landtag Brandenburg debattiert Schulgesetz", summary: "Brandenburg" }).decision === "verstehen");
check("2c Topic + Partei -> verstehen", a({ title: "SPD fordert hoeheren Mindestlohn" }).decision === "verstehen" && a({ title: "SPD fordert hoeheren Mindestlohn" }).reason === "topic-und-partei");

// 3) GRENZFALL: genau EIN schwaches Signal -> zurueckstellen (NICHT geloescht, Kriterium 3)
check("3 nur Topic -> zurueckstellen", a({ title: "Neue Studie zur Rente vorgestellt" }).decision === "zurueckstellen");
check("3b nur Partei -> zurueckstellen", a({ title: "CDU-Politiker im Interview" }).decision === "zurueckstellen");

// 4) KEIN SIGNAL -> parken mit Grund (Kriterium 2), NICHT hygiene/geloescht
const wetter = a({ title: "Wetterbericht: Sonniges Wochenende erwartet" });
check("4 kein politisches Signal -> parken (kein-politisches-signal)", wetter.decision === "parken" && wetter.reason === "kein-politisches-signal");

// 5) HYGIENE: leer / zu kurz -> raus mit Grund
check("5 leerer Titel -> hygiene", a({ title: "", h: "leer" }).decision === "hygiene");
check("5b extrem kurz -> hygiene", a({ title: "Kurz", summary: "", h: "kurz" }).decision === "hygiene");
check("5c ungueltig (kein hash) -> hygiene", G.assessDocument({ id: "x", title: "Bundestag beschliesst" }, { now: NOW }).decision === "hygiene");

// 6) ZU ALT: nicht-amtlich ohne Institutionssignal -> parken(zu-alt); amtlich/institutionell bleibt
const altNews = a({ title: "Lokale Vereinsfeier war ein Erfolg", published_at: "2026-01-01T00:00:00Z" });
check("6 zu altes Nicht-Signal -> parken (zu-alt)", altNews.decision === "parken" && altNews.reason === "zu-alt");
const altBund = a({ title: "Bundestag beschliesst Gesetz", published_at: "2026-01-01T00:00:00Z" });
check("6b zu altes ABER Institution -> verstehen (relevantes wird NIE wegen Alter verworfen, Kriterium 1)", altBund.decision === "verstehen");
const altAmt = a({ title: "Antrag", document_type: "Antrag", published_at: "2020-01-01T00:00:00Z" });
check("6c zu altes ABER amtlich (kurzer Titel) -> verstehen (nie verworfen, Kriterium 1)", altAmt.decision === "verstehen");

// 7) UNVERAENDERT: bekannter content_hash -> kein neuer Call (Kriterium 5)
const known = new Set(["bekannt"]);
check("7 bereits verstandener content_hash -> unveraendert (kein neuer Call)",
  a({ title: "Bundestag beschliesst Gesetz", h: "bekannt" }, { knownContentHashes: known }).decision === "unveraendert");

// 8) GLOBALE DEDUP: gleicher content_hash zweimal -> nur EINMAL bewertet (Kriterium 5)
const dedup = G.gateDocuments([
  doc({ title: "Bundestag beschliesst Rentenpaket", h: "dup1" }),
  doc({ title: "Bundestag beschliesst Rentenpaket (Quelle 2)", h: "dup1" }),
  doc({ title: "SPD fordert Mindestlohn", h: "u2" })
], { now: NOW });
check("8 Dedup: 3 Eingang, 1 Duplikat, 2 bewertet", dedup.eingang === 3 && dedup.dedupliziert === 1 && dedup.bewertet === 2);

// 9) PROFIL-UNABHAENGIGKEIT: kein Profil-Input; allgemeine Bundespolitik bleibt 'verstehen'
check("9 kein Profil-Argument noetig; allgemein wichtige Politik bleibt verstehen",
  a({ title: "Bundesrat stimmt Klimapaket zu" }).decision === "verstehen");

// 10) JEDE ABLEHNUNG HAT EINEN GRUND (Kriterium 2)
const mixed = G.gateDocuments([
  doc({ title: "Wetter heute", h: "w1" }), doc({ title: "", h: "e1" }),
  doc({ title: "Studie zur Pflege", h: "t1" }), doc({ title: "Bundestag tagt", h: "b1" })
], { now: NOW });
check("10 jede perDoc-Entscheidung traegt einen nicht-leeren Grund", mixed.perDoc.every((r) => typeof r.reason === "string" && r.reason.length > 0));
check("10b Aggregat konsistent (Summe der Entscheidungen == bewertet)",
  (mixed.verstehen + mixed.zurueckstellen + mixed.parken + mixed.unveraendert + mixed.hygiene) === mixed.bewertet);

console.log(`\n== Understanding-Gate Offline-Test: ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
