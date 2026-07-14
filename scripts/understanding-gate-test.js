"use strict";

// Offline-Test des Understanding-Gate (politische Vorpruefung vor dem vollen KI-Understanding).
// REINE LOGIK. Prueft Reihenfolge (Hygiene -> Dedup -> amtlich -> Relevanz+Quellen-Tier ->
// Grenzfall), das erweiterte Lexikon, das QUELLEN-TIER (amtlich/kuratiert/medien) und die
// verbindlichen Akzeptanzkriterien 1-5. Die Regeln sind gegen ECHTE Production-Daten kalibriert
// (kritische Fehler 107 -> 0 echte); dieser Test sichert die abgeleiteten Invarianten offline.

const G = require("../lib/helmut/quellenarchitektur/understanding-gate");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }
const NOW = Date.parse("2026-07-14T00:00:00Z");
function doc(o) { return { content_hash: o.h || ("h-" + (o.title || "x")), id: "rd-" + (o.h || o.title || "x"), published_at: "2026-07-13T00:00:00Z", ...o }; }
function a(d, opts) { return G.assessDocument(doc(d), { now: NOW, ...(opts || {}) }); }

// 1) AMTLICH/STRUKTURIERT -> verstehen + structured (keine doppelte KI, Kriterium 4)
const amt = a({ title: "Kleine Anfrage zur Wohnungspolitik", document_type: "Kleine Anfrage" });
check("1 amtliche Dokumentart -> verstehen + structured", amt.decision === "verstehen" && amt.structured === true && amt.reason === "amtliche-dokumentart");
const amtSrc = a({ title: "Drucksache 19/1234", source_id: "be-plenum" });
check("1b amtliche Quelle (be-plenum) -> verstehen + structured (Tier amtlich)", amtSrc.decision === "verstehen" && amtSrc.structured === true && amtSrc.tier === "amtlich");

// 2) KLARES INSTITUTIONS-/EBENENSIGNAL (breites Lexikon) -> verstehen (Kriterium 1)
check("2 Bundestag -> verstehen", a({ title: "Bundestag beschliesst Rentenpaket" }).decision === "verstehen");
check("2b Landtag+Ort -> verstehen", a({ title: "Landtag Brandenburg debattiert Schulgesetz", summary: "Brandenburg" }).decision === "verstehen");
check("2c Topic + Partei -> verstehen (topic-und-partei)", a({ title: "SPD fordert hoeheren Mindestlohn" }).reason === "topic-und-partei");
// Erweitertes Lexikon: generische Rollen-/Legislativbegriffe (real gemessen als noetig)
check("2d 'Ministerium' generisch -> verstehen", a({ title: "Umweltministerium legt Entwurf zum Moorschutz vor" }).decision === "verstehen");
check("2e 'Minister ... Reform' -> verstehen", a({ title: "Dobrindt bremst Datenschutzreform des Ministeriums" }).decision === "verstehen");
check("2f 'Kanzler/Koalition' -> verstehen", a({ title: "Koalition streitet ueber Schuldenbremse" }).decision === "verstehen");

// 3) GRENZFALL: genau EIN schwaches Signal (generischer Medien-Feed) -> zurueckstellen (Kriterium 3)
check("3 nur Topic (Medien) -> zurueckstellen", a({ title: "Neue Studie zur Rente vorgestellt" }).decision === "zurueckstellen");
check("3b nur Partei (Medien) -> zurueckstellen", a({ title: "CDU-Politiker im Interview" }).decision === "zurueckstellen");

// 4) QUELLEN-TIER: kuratierte Prozess-/Ausschuss-Feeds werden NIE geparkt (Kernkorrektur)
const kurNoKw = a({ title: "Alpenbus faehrt bald zwei Linien", source_id: "bundle-ausschuss-ost-west-lohn" });
check("4 kuratierte Quelle ohne Keyword -> zurueckstellen (NICHT parken)", kurNoKw.decision === "zurueckstellen" && kurNoKw.tier === "kuratiert");
const kabinett = a({ title: "Ab 2027 soll Krankengeld fuer Betroffene wegfallen", source_id: "general-bundeskabinett" });
check("4b Kabinett-Feed ohne Institutionswort -> nicht geparkt", kabinett.decision !== "parken" && kabinett.tier === "kuratiert");
const proc = a({ title: "Demo fuer Barrierefreiheit am 22. Juni", source_id: "process-anhoerung-sozialausschuss" });
check("4c Prozess-Feed (Barrierefreiheit-Demo) -> nicht geparkt", proc.decision !== "parken");

// 5) GENERISCHER MEDIEN-FEED ohne politisches Signal -> parken mit Grund (korrekt, Kriterium 2)
const dax = a({ title: "Marktbericht: DAX kann Rekordhoch nicht halten", source_id: "tagesschau-politik" });
check("5 Medien-Feed, unpolitisch (DAX) -> parken kein-politisches-signal", dax.decision === "parken" && dax.reason === "kein-politisches-signal");
check("5b Wetter (Medien) -> parken", a({ title: "Wetterbericht: Sonniges Wochenende erwartet" }).decision === "parken");

// 6) HYGIENE: leer/zu kurz -> raus; amtlich ist AUSGENOMMEN (Kriterium 1)
check("6 leerer Titel (Medien) -> hygiene", a({ title: "", h: "leer" }).decision === "hygiene");
check("6b extrem kurz (Medien) -> hygiene", a({ title: "Kurz", summary: "", h: "kurz" }).decision === "hygiene");
check("6c amtlich + kurzer Titel -> verstehen (nie hygiene)", a({ title: "Antrag", document_type: "Antrag", h: "a1" }).decision === "verstehen");
check("6d ungueltig (kein hash) -> hygiene", G.assessDocument({ id: "x", title: "Bundestag beschliesst" }, { now: NOW }).decision === "hygiene");

// 7) ZU ALT: generischer Feed ohne Institutionssignal -> parken; amtlich/institutionell bleibt
check("7 zu altes Nicht-Signal (Medien) -> parken zu-alt", a({ title: "Lokale Vereinsfeier", published_at: "2026-01-01T00:00:00Z" }).reason === "zu-alt");
check("7b zu altes ABER Institution -> verstehen (nie wegen Alter verworfen, Kriterium 1)", a({ title: "Bundestag beschliesst Gesetz", published_at: "2026-01-01T00:00:00Z" }).decision === "verstehen");
check("7c zu alt ABER kuratierte Quelle -> zurueckstellen (nicht geparkt)", a({ title: "Sitzungsnotiz", source_id: "committee-finanzen", published_at: "2026-01-01T00:00:00Z" }).decision === "zurueckstellen");

// 8) UNVERAENDERT + globale Dedup (Kriterium 5: derselbe Inhalt hoechstens ein voller Call)
check("8 bekannter content_hash -> unveraendert", a({ title: "Bundestag beschliesst Gesetz", h: "bekannt" }, { knownContentHashes: new Set(["bekannt"]) }).decision === "unveraendert");
const dedup = G.gateDocuments([doc({ title: "Bundestag beschliesst Rentenpaket", h: "d1" }), doc({ title: "Bundestag beschliesst Rentenpaket 2", h: "d1" }), doc({ title: "SPD fordert Mindestlohn", h: "u2" })], { now: NOW });
check("8b Dedup: 3 Eingang, 1 Duplikat, 2 bewertet", dedup.eingang === 3 && dedup.dedupliziert === 1 && dedup.bewertet === 2);

// 9) PROFIL-UNABHAENGIGKEIT: kein Profil-Argument; allgemein wichtige Politik bleibt verstehen
check("9 kein Profil noetig; allgemeine Bundespolitik -> verstehen", a({ title: "Bundesrat stimmt Klimapaket zu" }).decision === "verstehen");

// 10) JEDE ABLEHNUNG HAT EINEN GRUND + Aggregat/Tier konsistent (Kriterium 2)
const mixed = G.gateDocuments([
  doc({ title: "Wetter heute", h: "w1" }), doc({ title: "", h: "e1" }),
  doc({ title: "Studie zur Pflege", h: "t1" }), doc({ title: "Bundestag tagt", h: "b1" }),
  doc({ title: "Antwort", document_type: "Antwort", h: "am1" })
], { now: NOW });
check("10 jede Entscheidung traegt einen nicht-leeren Grund", mixed.perDoc.every((r) => typeof r.reason === "string" && r.reason.length > 0));
check("10b Aggregat konsistent (Summe == bewertet)", (mixed.verstehen + mixed.zurueckstellen + mixed.parken + mixed.unveraendert + mixed.hygiene) === mixed.bewertet);
check("10c Tier-Verteilung vorhanden", mixed.tiers && typeof mixed.tiers === "object");

console.log(`\n== Understanding-Gate Offline-Test: ${fail === 0 ? "ALLE TESTS GRÜN" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
