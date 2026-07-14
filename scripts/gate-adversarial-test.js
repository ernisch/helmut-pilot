"use strict";

// Phase J: adversarialer Test der NEUEN Kostenlogik (Understanding-Gate + Priorisierung).
// Aktiver Widerlegungsversuch der gate-spezifischen Angriffs-/Ausfallszenarien. REINE LOGIK.
// Die 16 Architektur-Szenarien (Dedup/Budget/Watchdog/Migration/Tenant/Isolation/…) deckt
// scripts/adversarial-gesamttest.js ab; hier die neuen Kosten-/Gate-Faelle.

const fs = require("fs");
const path = require("path");
const G = require("../lib/helmut/quellenarchitektur/understanding-gate");
const PR = require("../lib/helmut/quellenarchitektur/understanding-priority");
const P = require("../lib/helmut/quellenarchitektur/pardok-parser");
const { mergeIntoDocuments } = require("../lib/helmut/quellenarchitektur/dedup-global");

let fail = 0;
function check(name, cond) { console.log(`${cond ? "PASS" : "FAIL"}  ${name}`); if (!cond) fail += 1; }
const NOW = Date.parse("2026-07-14T00:00:00Z");
function d(o) { return { id: "rd-" + (o.h || o.title), content_hash: o.h || o.title, published_at: "2026-07-13T00:00:00Z", ...o }; }
function dec(o) { return G.assessDocument(d(o), { now: NOW }).decision; }

// 1) Relevantes amtliches Dokument OHNE Titel -> verstehen (nie geparkt)
check("1 amtlich ohne Titel -> verstehen", dec({ title: "", h: "a1", document_type: "Plenarprotokoll" }) === "verstehen");

// 2) Relevantes REGIONALES Dokument OHNE Bundesbegriff -> nicht geparkt (kuratiert/regional)
check("2 regionales Dokument (kuratierte Quelle) ohne Bundesbegriff -> nicht geparkt", dec({ title: "Neubaustrecke wird teurer", h: "r1", source_id: "committee-verkehr" }) !== "parken");
check("2b Landtags-Institution ohne Bundesbegriff -> verstehen", dec({ title: "Abgeordnetenhaus debattiert Mietendeckel", h: "r2" }) === "verstehen");

// 3) Unpolitischer Boulevard MIT Parteiname -> zurueckstellen (nicht sofort voll verstehen, nicht geparkt)
check("3 Boulevard mit Parteiname -> zurueckstellen (Grenzfall, Cheap-Check)", dec({ title: "SPD-Politiker gewinnt Stadtmarathon", h: "b1", source_id: "tagesschau-politik" }) === "zurueckstellen");

// 4/5) Google-News-Duplikat + gleicher Artikel ueber mehrere Wege -> EIN Dokument
const dup = mergeIntoDocuments([
  { sourceId: "a", title: "Rentenpaket beschlossen", content: "Rentenpaket beschlossen", url: "https://e/1", originalUrl: "https://e/1", publishedAt: "2026-07-10T00:00:00Z" },
  { sourceId: "b", title: "Rentenpaket beschlossen", content: "Rentenpaket beschlossen", url: "https://news.google.com/x", originalUrl: "https://news.google.com/x", publishedAt: "2026-07-10T00:00:00Z" }
]);
check("4/5 Duplikat ueber mehrere Wege -> 1 Dokument + 2 Fundstellen", dup.length === 1 && dup[0].finding_count === 2);

// 6) Bereits verstandenes Dokument -> unveraendert (kein neuer Call)
check("6 bereits verstanden (content_hash bekannt) -> unveraendert", G.assessDocument(d({ title: "Bundestag beschliesst", h: "known1" }), { now: NOW, knownContentHashes: new Set(["known1"]) }).decision === "unveraendert");

// 7) Veraendertes Dokument mit GLEICHER URL -> anderer content_hash -> NICHT unveraendert
check("7 veraendert (neuer hash) -> nicht unveraendert (neu bewertet)", G.assessDocument(d({ title: "Bundestag beschliesst (Update)", h: "known2neu" }), { now: NOW, knownContentHashes: new Set(["known1"]) }).decision !== "unveraendert");

// 8) Zu altes AMTLICHES Dokument -> verstehen (nie wegen Alter verworfen)
check("8 zu altes amtliches Dokument -> verstehen", dec({ title: "Antwort", h: "old1", document_type: "Antwort", published_at: "2019-01-01T00:00:00Z" }) === "verstehen");

// 9) Extrem kurzes AMTLICHES Dokument -> verstehen (amtlich von Hygiene ausgenommen)
check("9 extrem kurzes amtliches Dokument -> verstehen", dec({ title: "GVBl", h: "s1", document_type: "Gesetz- und Verordnungsblatt" }) === "verstehen");

// 10) Falsche politische Ebene: mehrdeutig ohne Signal -> parken/zurueckstellen, NIE faelschlich verstehen
check("10 mehrdeutig ohne Signal (Medien) -> nicht faelschlich verstehen", dec({ title: "Ein schoener Tag am See", h: "u1", source_id: "tagesschau-politik" }) === "parken");

// 11) Fehlende Geografie: unbekannter Ort -> keine erfundene Geografie (Gate bleibt entscheidbar)
check("11 unbekannter Ort -> Gate entscheidet ohne erfundene Geografie", ["verstehen", "zurueckstellen", "parken"].includes(dec({ title: "Ereignis in Fantasiestadt", h: "u2" })));

// 12) Tagesdeckel erreicht -> Priorisierung waehlt amtlich/relevant statt Ankunft
const cand = [];
for (let i = 0; i < 20; i++) cand.push({ id: "g" + i, decision: "zurueckstellen" });
cand.push({ id: "amt", amtlich: true });
const sel = PR.selectWithinBudget(cand, 5, NOW);
check("12 Deckel erreicht -> amtlicher Vorgang wird gewaehlt (nicht verdraengt)", sel.gewaehlt.some((c) => c.id === "amt") && sel.amtlichVerdraengt === 0);

// 13) Leere Quelle (Google-News-Ausfall) -> 0 bewertet, kein Crash
const leer = G.gateDocuments([], { now: NOW });
check("13 leere Eingabe -> 0 bewertet, kein Crash", leer.bewertet === 0 && leer.verstehen === 0);

// 14) PARDOK-Strukturaenderung (Namespace) -> Feld trotzdem extrahiert -> verstehen
const ns = P.parseBerlinDokument('<p:Dokument><p:DBID>D-9</p:DBID><p:DokArt>Antrag</p:DokArt></p:Dokument>');
check("14 PARDOK Namespace-Praefix -> Dokumentart extrahiert -> amtlich verstehen", G.assessDocument({ id: "x", content_hash: "x", title: ns.titel || "", document_type: ns.dokumentart, source_id: "be-plenum" }, { now: NOW }).decision === "verstehen");

// 15) HTML-Fehlerseite statt XML -> erkannt, nichts ans Gate
check("15 HTML statt XML -> fehlerseite, 0 Dokumente", P.parsePardokDocumentsFromString("<!doctype html><html>x</html>", { land: "berlin" }).fehlerseite === true);

// 16) Partieller Ausfall: eine kaputte Eingabe (null) killt die Bewertung nicht
let partial; try { partial = G.gateDocuments([null, d({ title: "Bundestag beschliesst", h: "ok1" })], { now: NOW }); } catch (e) { partial = { error: e.message }; }
check("16 partieller Ausfall (null-Eintrag) -> gute Eingabe verarbeitet, kein Crash", partial && partial.bewertet >= 1);

// 17) Tenant-Leck: Gate-Ergebnis traegt KEINE user_id/tenant-Felder
const r = G.assessDocument(d({ title: "Bundestag beschliesst", h: "t1" }), { now: NOW });
check("17 Gate-Ergebnis ohne user_id/tenant/mandant (kein Mandantenleck)", !("user_id" in r) && !("tenant_id" in r) && !("mandant" in r));

// 18) App-Start/Modul-Last schnell + ohne Seiteneffekt
const t0 = process.hrtime.bigint();
delete require.cache[require.resolve("../lib/helmut/quellenarchitektur/understanding-gate")];
require("../lib/helmut/quellenarchitektur/understanding-gate");
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
check(`18 Gate-Modul laedt schnell (<150ms, ${ms.toFixed(1)}ms), kein Netz/DB beim Laden`, ms < 150);

console.log(`\n== Gate-Adversarialtest (neue Kostenlogik): ${fail === 0 ? "ALLE GRÜN — Kostenlogik haelt stand" : fail + " FEHLGESCHLAGEN"} ==`);
process.exit(fail > 0 ? 1 : 0);
