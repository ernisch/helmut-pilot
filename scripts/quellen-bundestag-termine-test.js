"use strict";
// Kleine deterministische Quellenpruefung. Keine echten Mandate, kein Netz,
// keine DB, keine KI und kein Quellenfenster. Kurze amtliche Faktenbeispiele;
// ganze Originale verbleiben ausserhalb von Git.
const A = require("node:assert/strict"), B = require("../lib/helmut/quellen-bundestag-termine");
const C = require("../lib/helmut/crawler"), SP = require("../lib/helmut/scalable-pipeline");
const { EventEmitter } = require("node:events"), { PassThrough } = require("node:stream");
const tests = [], test = (name, fn) => tests.push([name, fn]);
const q = B.QUELLEN[1], url = n => `https://www.bundestag.de/resource/blob/1231438/fixture-${n}.pdf`;
test("Plenum und Sitzungskalender sind vor den Ausschussoriginalen fällig", () => {
  const D = require("../lib/helmut/source-demand");
  A.deepEqual(B.QUELLEN.map(D.amtlicheMorgenPrioritaet), [40, 40, 40, 37, 36]);
});
const now = () => Date.parse("2026-11-17T12:00:00Z");
const link = (revision = 0, patch = {}) => ({ url: url(revision), listedDay: revision ? "2026-11-10" : "2026-11-05",
  listedMeeting: "59", revision, visibility: "nichtoeffentlich", ...patch });
const body = (revision = 0, time = "10:30", top = 1) => `${revision ? revision + ". Ergänzungsmitteilung" : "Mitteilung"}
Berlin, den ${revision ? "10" : "5"}. November 2026
Die Tagesordnung der 59. Sitzung des Ausschusses
Mittwoch, dem 11. November 2026, ${time} Uhr
${revision ? "wird um folgenden Tagesordnungspunkt ergänzt:" : ""}
Tagesordnungspunkt ${top}
Beratung zum synthetischen Testgegenstand
BT-Drucksache 21/8119
Voten angefordert für den: 11.11.2026`;
const doc = (revision = 0, time = "10:30", patch = {}) => B.tagesordnung(q, link(revision, patch),
  Buffer.from("%PDF-" + body(revision, time)), [body(revision, time)]);
const catalog = (quelle = q) => ({ retrievalPaths: [{ id: quelle.retrievalPathId, legacy_source_id: quelle.id,
  publisher_id: "publisher-bundestag.de", method: quelle.crawlMethod, url: quelle.url, status: "needs_review",
  activation_mode: "auto" }], packages: [{ id: quelle.packageId, status: "active" }],
  packagePaths: [{ package_id: quelle.packageId, retrieval_path_id: quelle.retrievalPathId }] });
const rights = () => ({ id:q.id,url:q.url,rightsReviewRequired:false,
  usagePolicy: { commercialUseApproved: true, scope: "structured_parliamentary_facts", fullTextAllowed: false,
    imagesAllowed: false, aiTrainingAllowed: false, evidenceUrls: ["https://example.test/explicit-fixture-approval"] } });
function row(revision) { return `<tr><td>10. November 2026</td><td>Wirtschaft</td><td><a href="${url(revision)}">
  ${revision ? revision + ". Ergänzungsmitteilung zur " : ""}59. Sitzung am Mittwoch, den 11. November 2026, 09:00 Uhr – nicht öffentlich</a></td></tr>`; }
test("Genau drei Ausschussquellen plus Plenum/Kalender; keine Personen- oder Fremdquelle", () => {
  A.equal(B.QUELLEN.length, 5); A.equal(B.QUELLEN.filter(q => q.art === "ausschuss").length, 3);
  A.equal(B.quelle({ ...q, rssUrl: "https://example.test/feed" }), null);
  A.equal(B.quelle({ ...q, url: q.url + "?fremd" }), null);
  A.equal(B.quelle({ ...q, id: "kalender-person" }), null);
});
test("Bestehender relationaler Mapper/Bedarfscompiler transportiert alle fuenf Wege einmal geteilt", async () => {
  const M=require("../lib/helmut/quellenarchitektur/source-mode"), D=require("../lib/helmut/source-demand");
  const sources=B.QUELLEN.map(q=>M.toCrawlerSource({ id:q.retrievalPathId,legacy_source_id:q.id,
    url:q.url,method:q.crawlMethod,represents_type:"parliament" }));
  const plan=await D.kompiliereQuellenbedarf({ profile:[{id:"fixture-bund-a"},{id:"fixture-bund-b"}],
    jetztMs:now(),env:{},quellenFuerProfil:async()=>sources });
  A.equal(plan.auftraege.length,5);
  for(const j of plan.auftraege){A.equal(j.tenantId,null);A.equal(j.payload.angefordertVon,2);
    A(B.quelle(j.payload.quelle));A.equal(j.payload.quelle.rssUrl,undefined);}
});
test("Amtlich benannter AJAX-Endpunkt statt leerer Tabelle; kein fremder Host/Pfad", () => {
  const endpoint = "/ajax/filterlist/de" + new URL(q.url).pathname + "/1057676-1057676";
  A.equal(B.endpoint(q, `<div x-data="{ &quot;endpoint&quot;: &quot;${endpoint}&quot; }">`), "https://www.bundestag.de" + endpoint);
  A.throws(() => B.endpoint(q, '{"endpoint":"https://example.test/ajax/filterlist/list"}'));
  A.throws(() => B.endpoint(q, '<table></table>'));
  A.equal(B.dokumentLinks(q, row(4))[0].visibility, "nichtoeffentlich");
  A.equal(B.dokumentLinks(q, row(4))[0].revision, 4);
  A.throws(() => B.dokumentLinks(q, row(4).replace("www.bundestag.de", "fremd.test")), /liste-leer/);
});
test("Plenum erkennt die amtliche Komplettdatei der kommenden Woche ohne fremde PDF-Dateien", () => {
  const plenum = B.QUELLEN.find(quelle => quelle.art === "plenum");
  // Beobachtete Linkform der amtlichen Liste vom28Nov. Kein neuer Originalabruf.
  const kommende = "https://www.bundestag.de/resource/blob/473450/Tagesordnung-komplett-kommende-Woche.pdf";
  const html = `<a href="${kommende}">Tagesordnung komplett (114. - 116. Sitzung)</a>`
    + '<a href="https://www.bundestag.de/resource/blob/473454/Ablaufplan-kommende-Woche.pdf">Ablaufplan</a>';
  A.deepEqual(B.dokumentLinks(plenum, html).map(d => d.url), [kommende]);
  const bisher = kommende.replace("-kommende-Woche.pdf", ".pdf");
  A.deepEqual(B.dokumentLinks(plenum, `<a href="${bisher}">Tagesordnung komplett</a>`).map(d => d.url), [bisher]);
  for (const falsch of [kommende.replace("www.bundestag.de", "fremd.test"),
    kommende.replace("/resource/blob/473450/", "/unbelegt/"),
    kommende.replace("-kommende-Woche.pdf", "-andere-Datei.pdf")])
    A.throws(() => B.dokumentLinks(plenum, `<a href="${falsch}">Tagesordnung komplett</a>`), /liste-leer/);
  A.throws(() => B.dokumentLinks(plenum, "<p>Keine erkannten Dateien</p>"), /liste-leer/);
});
test("Tatsaechliche Wirtschaft-Zeitaenderung, Zusatz-TOP und Frist; historische Frist bleibt datiert", () => {
  const base = doc(), extra = doc(1, "09:00");
  A.equal(base.meetings[0].startsAt, "2026-11-11T09:30:00.000Z");
  A.equal(extra.meetings[0].startsAt, "2026-11-11T08:00:00.000Z");
  A.equal(extra.publishedDay, "2026-11-10");
  A.deepEqual(extra.tops[0].deadlines, [{ kind: "Voten angefordert für den:", day: "2026-11-11", at: null, timezone: null }]);
  A.deepEqual(extra.tops[0].references, ["21/8119"]);
  const merged = B.fasseZusammen([extra, base])[0];
  A.equal(merged.startsAt, "2026-11-11T08:00:00.000Z"); A.equal(merged.tops.length, 2);
  A.equal(merged.visibility, "nichtoeffentlich"); A.equal(merged.state, "geplant");
});
test("Fehlende Zwischenfassungen/gleicher Rang/Datumskonflikt werden nicht still aufgeloest", () => {
  A(B.fasseZusammen([doc(), doc(4, "09:00")])[0].conflicts.includes("fassungskette-unvollstaendig"));
  const sameRank = B.fasseZusammen([doc(), doc(1), doc(1, "09:00", { url: url(99) })])[0];
  A(sameRank.conflicts.includes("mehrere-fassungen-gleichen-ranges")); A.equal(sameRank.startsAt, null);
  A(B.tagesordnung(q, link(0, { listedDay: "2026-11-04" }), Buffer.from("%PDF-fixture"), [body()])
    .conflicts.includes("publikationstag-widerspruch"));
});
test("Ausdrueckliche Neufassung ersetzt TOPs; blosse Aenderungsmitteilung bleibt zur Pruefung", () => {
  const base = doc(), text = body(1,"09:00",7).replace("Ergänzungsmitteilung","Änderungsmitteilung");
  const full = B.tagesordnung(q,link(1),Buffer.from("%PDF-neu"),[text+"\nwird wie folgt neu gefasst:"]);
  const state = B.fasseZusammen([base,full])[0]; A.equal(state.state,"geplant");
  A.deepEqual(state.tops.map(t=>t.number),["7"]); A.equal(state.topVersions.length,2);
  A.equal(state.topVersions[0].superseded,true);
  const delta = B.tagesordnung(q,link(1),Buffer.from("%PDF-aenderung"),[text.replace("wird um folgenden Tagesordnungspunkt ergänzt:","Tagesordnungspunkt 1 entfällt.")]);
  const unresolved = B.fasseZusammen([base,delta])[0]; A.equal(unresolved.state,"aenderung-pruefen"); A.equal(unresolved.tops.length,0);
});
test("Arbeit45/44 bleibt Konflikt; fehlende Uhrzeit wird nicht aus Listentitel erfunden", () => {
  const d = B.tagesordnung(B.QUELLEN[0], link(0, { listedMeeting: "45" }), Buffer.from("%PDF-fixture"),
    [body().replace("59. Sitzung", "44. Sitzung").replace("11. November", "26. November")]);
  A(d.conflicts.includes("sitzungsnummer-widerspruch"));
  A.equal(B.fasseZusammen([d])[0].startsAt, null);
  const missing = B.tagesordnung(q, link(), Buffer.from("%PDF-fixture"), [body().replace("10:30 Uhr", "Uhrzeit offen")]);
  A(missing.conflicts.includes("sitzung-nicht-eindeutig-gelesen"));
});
test("Amtliche Arbeit-Typografie und Digital-Votenfrist werden ohne erfundene Uhrzeit gelesen", () => {
  const d = B.tagesordnung(B.QUELLEN[0], link(0,{listedMeeting:"45",listedDay:"2026-11-12"}), Buffer.from("%PDF-fixture"),
    ["Mitteilung Berlin, den 6 . November 2026\nDie 44. Sitzung des Ausschusses\nDonnerstag, dem 26. November 2026, 8.00 Uhr\nEinziger Tagesordnungspunkt\n\nAktuelle arbeits- und sozialpolitische Themen"]);
  A.equal(d.publishedDay,"2026-11-12"); A.equal(d.versionDay,"2026-11-06"); A.equal(d.meetings[0].startsAt,"2026-11-26T07:00:00.000Z");
  A.equal(d.tops[0].number,"einzig"); A(!JSON.stringify(d).includes("Aktuelle arbeits- und sozialpolitische Themen"));
  A.deepEqual(d.conflicts,["sitzungsnummer-widerspruch"]);
  const digital = B.tagesordnung(B.QUELLEN[2],link(),Buffer.from("%PDF-fixture"),
    [body().replace("Voten angefordert für den:","Frist für die Abgabe der Voten:")]);
  A.equal(digital.tops[0].deadlines[0].kind,"Frist für die Abgabe der Voten:");
  A.equal(digital.tops[0].deadlines[0].at,null);
});
test("Plenarsitzungen110–113 und Tagesordnungsstand bleiben getrennt; kein Beschluss", () => {
  const page = "Tagesordnung Stand: 12. November 2026\n" + [110, 111, 112, 113].map((n,i) =>
    `${n}. Sitzung des Deutschen Bundestages\nam Dienstag, dem ${24+i}. November 2026, ${i ? 9 : 10} Uhr`).join("\n")
    + "\nDi. I. a) Beratung des Haushaltsgesetzes\nDrucksachen 21/…, 21/7300, 21/7302\n113. Sitzung des Deutschen Bundestages";
  const d = B.tagesordnung(B.QUELLEN[3], link(0, { listedMeeting: null, visibility: "oeffentlich" }), Buffer.from("%PDF-fixture"), [page]);
  A.equal(d.meetings.length, 4); A.equal(d.meetings[0].day, "2026-11-24");
  A.equal(d.meetings[3].day, "2026-11-27"); A.equal(d.publishedDay, null); A.equal(d.versionDay, "2026-11-12");
  A.equal(d.conflicts.length, 0); A.deepEqual(d.plenumTops, [{ number: "I. a)" }]);
  A.deepEqual(d.references, ["21/7300", "21/7302"]);
  A(!JSON.stringify(d).includes("Beratung des Haushaltsgesetzes"));
  const stand = B.baueStand(B.QUELLEN[3], [d], new Date(now()).toISOString(), "a".repeat(64));
  A.equal(stand.plannedIsDecision, false);
  A.deepEqual(stand.meetings.map(m => ({ key: m.key, startsAt: m.startsAt })), d.meetings.map(m => ({
    key: `${m.number}|${m.day}`, startsAt: m.startsAt
  })), "Alle vier Plenarsitzungen behalten ihren eigenen belegten Beginn");
  A(stand.meetings.every(m => m.tops.length === 0 && m.topVersions.length === 0));
  A.deepEqual(stand.documents[0].plenumTops, d.plenumTops, "Gemeinsame TOPs bleiben ohne erfundene Tageszuordnung am Original");
});
test("Gemeinsame Tagesordnung belegt keine TOP-Zuordnung zu jeder enthaltenen Sitzung", () => {
  const page = "Tagesordnung Stand: 12. November 2026\n" + [110,111].map((n,i) =>
    `${n}. Sitzung des Deutschen Bundestages\nam Dienstag, dem ${24+i}. November 2026, 9 Uhr`).join("\n")
    + "\nTagesordnungspunkt 9\nGemeinsam veroeffentlichter Beratungsgegenstand\nDrucksache 21/7300";
  const d = B.tagesordnung(B.QUELLEN[3], link(0, { listedMeeting:null }), Buffer.from("%PDF-fixture"), [page]);
  const stand = B.baueStand(B.QUELLEN[3], [d], new Date(now()).toISOString(), "a".repeat(64));
  A.equal(stand.meetings.length,2); A.equal(stand.documents[0].tops.length,1);
  A(stand.meetings.every(m => m.tops.length === 0 && m.topVersions.length === 0));
});
const ics = extra => Buffer.from(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:fixture.test\r\nDTSTAMP:20251216T100654Z\r\nDTSTART;VALUE=DATE:20261123\r\nDTEND;VALUE=DATE:20261128\r\nSUMMARY:Sitzungswoche Deutscher Bundestag\r\n${extra || ""}END:VEVENT\r\nEND:VCALENDAR\r\n`);
test("Amtliche Sitzungswoche23–27Nov: exklusives28Nov, ganztags, DTSTAMP kein Publikationstag", () => {
  const d = B.kalender(B.QUELLEN[4], { url: "https://www.bundestag.de/resource/blob/1103938/Parlamentstermine_2026_ics.ics" }, ics());
  A.equal(d.publishedDay, null); A.equal(d.events[0].startDay, "2026-11-23");
  A.equal(d.events[0].endDayExclusive, "2026-11-28"); A.equal(d.events[0].allDay, true);
  A.equal(d.events[0].uidHash, B.hash("fixture.test")); A(!JSON.stringify(d).includes("fixture.test"));
  for (const extra of ["ATTENDEE:mailto:person@example.test\r\n", "RRULE:FREQ=DAILY\r\n", "ATTACH:https://example.test/file\r\n"])
    A.throws(() => B.kalender(B.QUELLEN[4], link(), ics(extra)), /fremdstruktur/);
  A.throws(() => B.kalender(B.QUELLEN[4], link(), Buffer.from(ics().toString().replace("20261128", "20261122"))), /ics-zeit/);
});
test("Stabile Originaladresse mit anderen Bytes behaelt beide Fassungen; Abruf ist kein Publikationstag", () => {
  const d = doc(), changed = { ...d, byteHash: "b".repeat(64) };
  const first = B.baueStand(q, [d], new Date(now()).toISOString(), "a".repeat(64));
  const second = B.baueStand(q, [changed], new Date(now()).toISOString(), "a".repeat(64));
  A.notEqual(first.standHash, second.standHash);
  const later = B.baueStand(q, [d], new Date(now() + 86400000).toISOString(), "a".repeat(64));
  A.equal(later.standHash, first.standHash); A.notEqual(later.belegHash, first.belegHash);
  A.deepEqual(B.leseStand(JSON.parse(JSON.stringify(first))), first);
});
test("JSONB-Feldreihenfolge bleibt lesbar; geaenderte TOP/Frist/Originalbindung nicht", () => {
  const s = B.baueStand(q, [doc()], new Date(now()).toISOString(), "a".repeat(64));
  const reverse = value => Array.isArray(value) ? value.map(reverse) : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).reverse().map(([k,v]) => [k, reverse(v)])) : value;
  A.equal(B.leseStand(reverse(s)).standHash, s.standHash);
  for (const change of [v => v.documents[0].byteHash = "c".repeat(64), v => v.documents[0].tops[0].deadlines[0].day = "2026-11-18",
    v => v.sourceUrl += "?fremd", v => v.retrievedAt = "2026-11-18T12:00:00.000Z"]) {
    const v = structuredClone(s); change(v); A.throws(() => B.leseStand(v), /stand-bindung/);
  }
});
test("Frische Rechte-/Katalogpruefung: offene Rechte starten weder Netz noch Ablage", async () => {
  let calls = 0;
  const blocked = await B.aufnahme(q, { katalog: { retrievalPaths: [] }, fetchUrl: () => { calls++; }, save: () => { calls++; } });
  A.equal(blocked.uebersprungen, true); A.equal(blocked.ok, false); A.equal(calls, 0);
  A(B.freigabe(q, catalog(), rights()));
  A.equal(B.freigabe(q,catalog(),null),false,"Reale SQL-Felder ersetzen keinen fehlenden Code-Nutzungsbeleg");
  A.equal(B.codeNutzungsbeleg("fremde-quelle"),null);
  A(B.QUELLEN.every(s => B.nutzungsfreigabe(s)));
  A.equal(B.freigabe(q,{...catalog(),packagePaths:[]}),false);
  A.equal(B.freigabe(q,{...catalog(),packages:[{id:q.packageId,status:"prepared"}]}),false);
  for (const change of [p => p.status = "paused", p => p.url += "?fremd"])
    { const c = catalog(); change(c.retrievalPaths[0]); A.equal(B.freigabe(q, c,rights()), false); }
  for(const change of [s=>s.rightsReviewRequired=true,s=>s.usagePolicy.commercialUseApproved=false,
    s=>s.usagePolicy.fullTextAllowed=true,s=>s.url+="?fremd"]){const s=rights();change(s);A.equal(B.freigabe(q,catalog(),s),false);}
});
test("Geschlossener Speichervertrag nimmt keine Fremdfelder/Volltexte auf", () => {
  const d = doc();
  A.throws(() => B.baueStand(q,[{...d,content:"nicht freigegebener Volltext"}],new Date(now()).toISOString(),"a".repeat(64)),/dokument-bindung/);
  A.throws(() => B.baueStand(q,[{...d,tops:[{...d.tops[0],personalDeadline:true}]}],new Date(now()).toISOString(),"a".repeat(64)),/dokument-bindung/);
  A.throws(() => B.baueStand(q,[{...d,tops:[{...d.tops[0],subjectStatus:"originalfragment",subject:"gesperrt"}]}],
    new Date(now()).toISOString(),"a".repeat(64)),/dokument-bindung/);
  A.throws(() => B.leseStand({...B.baueStand(q,[d],new Date(now()).toISOString(),"a".repeat(64)),version:1}), /stand-bindung/);
  const text = body().replace("synthetischen Testgegenstand", "Testgegenstand 21/9999 und Ausschussdrucksache 21/7777");
  const parsed = B.tagesordnung(q,link(),Buffer.from(text),[text]);
  A.deepEqual(parsed.tops[0].references, ["21/8119"]);
});
test("Regulaerer Quellenadapter liest Liste/Originale begrenzt und verlangt belegHash-Readback", async () => {
  const endpoint = "https://www.bundestag.de/ajax/filterlist/de" + new URL(q.url).pathname + "/1057676-1057676";
  const robots = "https://www.bundestag.de/robots.txt";
  const landing = Buffer.from(JSON.stringify({ endpoint }));
  const list = Buffer.from(row(1).replace(" am Mittwoch, den 11. November 2026, 09:00 Uhr", "")
    + row(0).replace("den 11. November", "den 25. November"));
  let saved, requests = [];
  const deps = { katalog: catalog(), rightsForSource:rights, now, deadlineMs: now()+20000,
    reserveOriginal: async () => ({ erlaubt: true, geprueft: true }), fetchUrl: async (url, depth, opts) => {
    requests.push(url); A.equal(opts.allowedHost, "bundestag.de"); A.equal(opts.binary, true); A.equal(opts.bundestagFakten,true);
    const bytes = url === robots ? Buffer.from("User-agent: *\nDisallow: /xml/") : url === q.url ? landing
      : url === endpoint ? list : Buffer.from("%PDF-fixture-" + url.match(/fixture-(\d+)/)[1]);
    return { status: 200, finalUrl: url, bytes };
  }, pdfText: async bytes => [body(+bytes.toString().slice(-1))], save: async s => {
    saved = s; return { ok: true, standHash: s.standHash, belegHash: s.belegHash }; } };
  const result = await B.aufnahme(q, deps);
  A.equal(result.ok, true); A.equal(result.documents, 2); A.equal(requests.length, 5); A.equal(saved.coverage, "partial");
  await A.rejects(B.aufnahme(q, { ...deps, save: async s => ({ ok: true, standHash: s.standHash }) }), /persistenz-unbestaetigt/);
  await A.rejects(B.aufnahme(q, { ...deps, deadlineMs: now()-1 }), /zeitbudget/);
  const used = requests.length;
  const quota = await B.aufnahme(q, { ...deps, reserveOriginal: async () => ({ erlaubt: false, geprueft: true }) });
  A.equal(quota.zurueckgestellt,true); A.equal(requests.length-used,3,"Nur Robots/Liste/Seite bei verbrauchter Originalquote");
  A.equal(quota.bundestagAbrufpauseMs, undefined);
  const dayQuota = await B.aufnahme(q, { ...deps, reserveOriginal: async () => ({
    erlaubt: false, geprueft: true, grund: "arbeitslimit-tagesgrenze", wartenMs: 73000000
  }) });
  A.equal(dayQuota.bundestagAbrufpauseMs, 73000000);
  A.equal(dayQuota.langeWarten, true);
  const beforeRobots = requests.length;
  const probe = async u => u === robots
    ? { status: 200, finalUrl: u, bytes: Buffer.from("User-agent: HelmutBot\nDisallow: /ajax/*/de/") }
    : deps.fetchUrl(u,0,{allowedHost:"bundestag.de",binary:true,bundestagFakten:true});
  await A.rejects(B.aufnahme(q,{...deps,fetchUrl:probe}), /robots-gesperrt/);
  A.deepEqual(requests.slice(beforeRobots),[q.url]);
  const davor = requests.length;
  await A.rejects(B.aufnahme(q, { ...deps,
    reserveOriginal: () => A.fail("Keine Buchung bei einem gesperrten Original in der Kette"),
    fetchUrl: u => u === robots ? { status: 200, finalUrl: u,
      bytes: Buffer.from("User-agent: HelmutBot\nDisallow: " + new URL(url(0)).pathname) }
      : deps.fetchUrl(u, 0, { allowedHost: "bundestag.de", binary: true, bundestagFakten: true })
  }), /robots-gesperrt/);
  A.deepEqual(requests.slice(davor), [q.url, endpoint]);
});
test("Unveraenderliche Ablage: nur POST-neu, exaktes Ruecklesen, verlorene Antwort und UNKNOWN", async () => {
  const s = B.baueStand(q, [doc()], new Date(now()).toISOString(), "a".repeat(64)), map = new Map(), methods = [];
  const store = B.speicher({ storeId: "isoliert", request: async (path, opts = {}) => {
    methods.push(opts.method || "GET");
    if (opts.method) { const row = JSON.parse(opts.body); map.set(row.id, row); throw Error("verlorene-antwort"); }
    const id = path.match(/id=eq\.([^&]+)/)[1]; return map.has(id) ? [map.get(id)] : [];
  } });
  A.equal((await store.sichern(s)).belegHash, s.belegHash); await store.sichern(s);
  A.equal(methods.filter(m => m === "POST").length, 1); A(!methods.some(m => ["PATCH","DELETE"].includes(m)));
  const unknown = B.speicher({ storeId: "isoliert", request: async (path, o) => { if(o) throw Error("unknown"); return []; } });
  await A.rejects(unknown.sichern(s), /persistenz-unbestaetigt/);
});
test("Spaeter Katalog-/Speicherzugriff eroeffnet keine neue Schreibphase nach der Frist", async()=>{
  let clock=1,posts=0;
  const store=B.speicher({storeId:"isoliert",now:()=>clock,deadlineMs:10,request:async(path,opts)=>{
    if(opts?.method)posts++;clock=10;return[];}});
  const s=B.baueStand(q,[doc()],new Date(now()).toISOString(),"a".repeat(64));
  await A.rejects(store.sichern(s),/zeitbudget/);A.equal(posts,0);
});
test("PDF und ICS setzen bestätigte Teile nach Layout- und Tageswechsel mit einer Originalreservierung fort", async () => {
  for (const quelle of [q, B.QUELLEN[4]]) {
    const kalender = quelle.art === "kalender";
    const endpoint = "https://www.bundestag.de/ajax/filterlist/de" + new URL(q.url).pathname + "/1057676-1057676";
    const urls = kalender ? [0,1].map(n => `https://www.bundestag.de/resource/blob/1231438/termin-${n}.ics`) : [url(0), url(1)];
    let clock = now(), kontingent = 1, reserve = 0, stand, layout = "", geaenderterName = false;
    const storeRows = new Map(), abgerufen = [];
    const catalogRows = kalender ? {
      retrievalPaths: [{ ...catalog().retrievalPaths[0], id: quelle.retrievalPathId, url: quelle.url,
        legacy_source_id: quelle.id, method: quelle.crawlMethod }],
      packages: [{ id: quelle.packageId, status: "active" }],
      packagePaths: [{ package_id: quelle.packageId, retrieval_path_id: quelle.retrievalPathId }]
    } : catalog();
    const teilspeicher = B.speicher({ storeId: "isoliert", now: () => clock, request: async (path, opts) => {
      if (opts?.method === "POST") {
        const row = JSON.parse(opts.body); A(!storeRows.has(row.id)); storeRows.set(row.id, row);
        throw Error("verlorene Schreibantwort");
      }
      if (path.includes("retrievedAt=lt.")) return [];
      const id = /id=(eq|like)\.([^&*]+)/.exec(path);
      return [...storeRows.values()].filter(r => id[1] === "eq" ? r.id === id[2] : r.id.startsWith(id[2]));
    } });
    const abruf = laufId => B.aufnahme(quelle, { katalog: catalogRows, now: () => clock, deadlineMs: clock + 60000,
      auftragId: laufId, teilspeicher, reserveOriginal: async () => { reserve++; return { erlaubt: kontingent-- > 0, geprueft: true }; },
      fetchUrl: async u => {
        let text = "User-agent: *";
        if (u === quelle.url) text = kalender ? layout + urls.map(a => `<a href="${a}">Sitzungswochen</a>`).join("") : JSON.stringify({ endpoint });
        else if (u === endpoint) text = layout + row(0) + row(1);
        if (geaenderterName && [quelle.url, endpoint].includes(u)) text += "Neue Fassung";
        else if (urls.includes(u)) { abgerufen.push(u); text = kalender ? ics() : "%PDF-fixture"; }
        return { status: 200, finalUrl: u, bytes: Buffer.from(text) };
      }, pdfText: async () => [body()], save: async s => {
        stand = s; return { ok: true, standHash: s.standHash, belegHash: s.belegHash };
      }
    });
    A.equal((await abruf("lauf-a")).zurueckgestellt, true);
    A.equal(storeRows.size, 1); A.equal(abgerufen.length, 1); A.equal(reserve, 2);
    clock += 86400000; kontingent = 1; reserve = 0; layout = '<span class="neu"></span>';
    A.equal((await abruf("lauf-a")).documents, 2);
    A.equal(stand.retrievedAt, new Date(now()).toISOString());
    A.equal(reserve, 1); A.deepEqual(abgerufen, urls);
    geaenderterName = true; kontingent = 0; reserve = 0;
    A.equal((await abruf("lauf-a")).zurueckgestellt, true, "Eine geänderte Liste erfordert einen neuen Beleg");
    A.equal(reserve, 1); A.deepEqual(abgerufen, urls);
    geaenderterName = false;
    kontingent = 0; reserve = 0;
    A.equal((await abruf("lauf-b")).zurueckgestellt, true, "Eine neue Fälligkeit bestätigt ihre eigene Beobachtung");
    A.equal(reserve, 1); A.deepEqual(abgerufen, urls);
  }
});
test("Ein Altauftrag nutzt den bestätigten heutigen Terminstand nur bei exakt gleicher amtlicher Liste", async () => {
  const endpoint = "https://www.bundestag.de/ajax/filterlist/de" + new URL(q.url).pathname + "/1057676-1057676";
  let list = row(0), gebucht = 0, ruecklesungen = 0;
  const original = doc(0, "10:30", { listedMeeting: "60" });
  const beobachtet = (zeit, docs = [original]) => B.baueStand(q, docs, zeit, B.hash(Buffer.from(row(0))));
  let stand = beobachtet("2026-11-17T03:00:00.000Z");
  const deps = { env: { HELMUT_QUELLEN_ARBEITSFENSTER: "on" }, now,
    leseBundestagTermineKatalog: async () => catalog(), leseBundestagAbrufpause: async () => null,
    reserviereBundestagOriginal: async () => { gebucht++; return { erlaubt: false, geprueft: true }; },
    bundestagTerminTeilspeicher: opts => B.speicher({ ...opts, storeId: "isoliert", request: async pfad => {
      if (!pfad.includes("retrievedAt=lt.")) return [];
      ruecklesungen++;
      return [{ id: "isoliert-bt-terminstand-" + stand.belegHash, data: stand }];
    } }),
    bundestagTermineFetch: async u => ({ status: 200, finalUrl: u, bytes: Buffer.from(
      u === q.url ? JSON.stringify({ endpoint }) : u === endpoint ? list : "User-agent: *") }),
    sichereBundestagTerminstand: () => A.fail("Vorhandenen Beleg nicht umdatieren") };
  const lauf = firstDueAt => SP.HANDLER.source_fetch({ id: "fixture", firstDueAt, payload: { quelle: q } }, deps,
    { auftragsDeadlineMs: now() + 60000 });
  const gestern = "2026-11-16T03:00:00.000Z";
  const r = await lauf(gestern);
  A.deepEqual(r.abrufErgebnis, { art: "terminstand", standHash: stand.standHash, belegHash: stand.belegHash,
    wiederverwendet: true, quellenkonflikt: true });
  A.equal(ruecklesungen, 1); A.equal(gebucht, 0);
  A.equal((await lauf("2026-11-17T03:00:00.000Z")).zurueckgestellt, true);
  A.equal(ruecklesungen, 1); A.equal(gebucht, 1);
  list += " korrigierte amtliche Liste";
  A.equal((await lauf(gestern)).zurueckgestellt, true);
  list = row(0);
  stand = beobachtet("2026-11-16T12:00:00.000Z");
  A.equal((await lauf(gestern)).zurueckgestellt, true);
  stand = beobachtet("2026-11-17T03:00:00.000Z", [{ ...original, url: url(99) }]);
  A.equal((await lauf(gestern)).zurueckgestellt, true);
  A.equal(ruecklesungen, 4); A.equal(gebucht, 4);
});
test("Beschädigte PDF und ICS bleiben offen und warten mindestens bis zum nächsten Fenster", async () => {
  const endpoint = "https://www.bundestag.de/ajax/filterlist/de" + new URL(q.url).pathname + "/1057676-1057676";
  const icsUrl = "https://www.bundestag.de/resource/blob/1231438/termin-0.ics";
  for (const [quelle, fehler] of [[q, "pdf-lesefehler-beschaedigt"], [B.QUELLEN[4], "ics-format"]]) {
    let original = 0, abschluss;
    const antworten = new Map([[q.url, JSON.stringify({ endpoint })], [endpoint, row(0)], [url(0), "%PDF-1.4\nkaputt"],
      [B.QUELLEN[4].url, `<a href="${icsUrl}">Sitzungswochen</a>`], [icsUrl, "BEGIN:VCALENDAR\r\nungueltig"]]);
    const result = await SP.fuehreAuftragAus({
      auftrag: { id: "terminfehler", job_type: "source_fetch", payload: { quelle }, attempts: 1 },
      besitzer: "fixture", restzeitMs: 60000, deps: {
        handler: SP.HANDLER, env: {}, now,
        leseBundestagTermineKatalog: async () => catalog(quelle), leseBundestagAbrufpause: async () => null,
        reserviereBundestagOriginal: async () => { original++; return { erlaubt: true, geprueft: true }; },
        bundestagTermineFetch: async u => ({ status: 200, finalUrl: u, bytes: Buffer.from(antworten.get(u) || "User-agent: *") }),
        sichereBundestagTerminstand: () => A.fail("Defektes Original darf keinen Fassungsstand erzeugen"),
        finish: async a => { abschluss = a; return { verfuegbar: true, uebernommen: true }; }
      }
    });
    A.equal(result.ausgang, "wiederholt");
    A.equal(original, 1);
    A.equal(abschluss.ok, false);
    A.equal(abschluss.error, "bundestag-termine-" + fehler);
    A.equal(abschluss.retryDelayMs, 15 * 60000);
  }
});
test("Produktiver Quellenhandler sperrt unbekannte IDs und Rechte vor generischem Crawl/Modell", async () => {
  const handler = SP.HANDLER.source_fetch; let generic = 0, frees = 0;
  const deps = { env: { HELMUT_SCALABLE_PIPELINE: "on" }, now, leseBundestagTermineKatalog: async () => ({ retrievalPaths: [] }),
    crawlAllSources: async () => { generic++; }, klassen: { belege: async () => ({ erlaubt: true, slot: "fixture" }), gebeFrei: async () => { frees++; } } };
  const result = await handler({ id: "fixture", payload: { quelle: q } }, deps, { auftragsDeadlineMs: now()+60000 });
  A.equal(result.zurueckgestellt, true); A.equal(result.bundestagAbrufpauseMs, 86400000);
  A.equal(generic, 0); A.equal(frees, 1);
  await A.rejects(handler({ payload: { quelle: { ...q, url: q.url + "?fremd" } } }, deps), /bundestag-termine-quelle/);
  await A.rejects(C.crawlSource(q), /nur-quellenauftrag/);
});
test("Quellenjob übernimmt externe Sperre und Retry-After in die bestehende Warteschlange", async () => {
  let fetches = 0, delay;
  const handler = SP.HANDLER.source_fetch;
  const auftrag = { id: "fixture", job_type: "source_fetch", payload: { quelle: q }, attempts: 1 };
  const deps = { env: {}, now, handler: { source_fetch: handler }, leseBundestagTermineKatalog: async () => catalog(),
    sichereBundestagTerminstand: () => A.fail("keine Ablage"), reserviereBundestagOriginal: () => A.fail("kein Original"),
    leseBundestagAbrufpause: async () => null,
    zurueckstellen: async ({ delayMs, grund }) => { delay = { delayMs, grund }; return { verfuegbar: true, uebernommen: true }; },
    finish: () => A.fail("Sperre ist kein Erfolg oder unmittelbarer Retry") };
  const job = extra => SP.fuehreAuftragAus({ auftrag, besitzer: "fixture", deps: { ...deps, ...extra }, restzeitMs: 60000 });
  const http = (statusCode, retryAfterMs) => async () => {
    fetches++;
    throw Object.assign(Error("HTTP"), { statusCode, retryAfterMs });
  };
  await job({ bundestagTermineFetch: http(403) });
  A.deepEqual(delay, { delayMs: 86400000, grund: "bundestag-termine-zugriff-gesperrt" });
  await job({ bundestagTermineFetch: http(429, 7200000) });
  A.deepEqual(delay, { delayMs: 7200000, grund: "bundestag-termine-http-429" });
  const pause = { ...delay, bundestagAbrufpauseMs: delay.delayMs, zurueckgestellt: true, langeWarten: true };
  await job({ leseBundestagAbrufpause: async () => pause, bundestagTermineFetch: () => A.fail("kein erneuter Abruf") });
  A.equal(fetches, 2);
});
test("Bundestag-503 bleibt höchstens einen Tag ohne verlorenen Versuch wieder vorlegbar", async () => {
  const stunde = 3600000;
  let angegeben, abschluss, vertagung;
  const deps = {
    env: { HELMUT_QUELLEN_ARBEITSFENSTER: "on" }, now, handler: SP.HANDLER,
    leseBundestagTermineKatalog: async () => catalog(), leseBundestagAbrufpause: async () => null,
    bundestagTermineFetch: async () => { throw Object.assign(Error("HTTP 503"), { statusCode: 503, retryAfterMs: angegeben }); },
    sichereBundestagTerminstand: () => A.fail("Störung erzeugt keinen Beleg"),
    reserviereBundestagOriginal: () => A.fail("Kein Original nach ausgefallenem Listenabruf"),
    zurueckstellen: async v => { vertagung = v; return { verfuegbar: true, uebernommen: true }; },
    finish: async v => { abschluss = v; return { verfuegbar: true, uebernommen: true }; }
  };
  const lauf = alter => SP.fuehreAuftragAus({
    auftrag: { id: "503-fixture", job_type: "source_fetch", payload: { quelle: q }, attempts: 1,
      first_due_at: new Date(now() - alter).toISOString() }, besitzer: "fixture", deps, restzeitMs: 60000
  });
  A.equal((await lauf(6 * stunde)).ausgang, "zurueckgestellt");
  A.equal(vertagung.delayMs, stunde);
  A.equal(vertagung.grund, "bundestag-termine-http-503");
  A.equal(abschluss, undefined);
  angegeben = 2 * stunde;
  A.equal((await lauf(7 * stunde)).ausgang, "zurueckgestellt");
  A.equal(vertagung.delayMs, angegeben);
  vertagung = undefined;
  A.equal((await lauf(24 * stunde)).ausgang, "wiederholt");
  A.equal(vertagung, undefined);
  A.equal(abschluss.ok, false);
  A.equal(abschluss.error, "HTTP 503");
});
test("Vorhandener HTTP-Transport bewahrt Binaerbytes und begrenzt Antwortgroesse", async () => {
  const https = require("node:https"), original = https.get, bytes = Buffer.from([37,80,68,70,45,255,0,200]);
  let status = 200, headers = {}, calls = 0;
  https.get = (url, opts, cb) => { const request = new EventEmitter(); request.destroy = e => { if(e) request.emit("error",e); };
    calls++;
    queueMicrotask(() => { const response = new PassThrough(); response.statusCode = status; response.headers = headers; response.complete = true;
      cb(response); response.end(bytes); }); return request; };
  try {
    const r = await C.fetchUrl(url(1), 0, { env: {}, binary: true, maxBytes: 50, allowedHost: "bundestag.de" });
    A.deepEqual(r.bytes, bytes); A.equal(r.status, 200);
    await A.rejects(C.fetchUrl(url(1), 0, { env: {}, binary: true, maxBytes: 3, allowedHost: "bundestag.de" }), /Response too large/);
    const facts = { env: {}, binary: true, allowedHost: "bundestag.de", bundestagFakten: true };
    status = 302; headers = { location: url(2) };
    await A.rejects(C.fetchUrl(url(1), 0, facts), /weiterleitung/); A.equal(calls, 3);
    status = 200; headers = { "tdm-reservation": "1" };
    await A.rejects(C.fetchUrl(url(1), 0, facts), /nutzungsvorbehalt/);
  } finally { https.get = original; }
});
const originalDir = process.argv.find(a => a.startsWith("--original-dir="))?.slice(15);
if (originalDir) test("Zehn amtliche Originalfassungen: drei Ausschuesse/Plenum/ICS samt Wirtschaft0–4", async () => {
  const fs = require("node:fs"), path = require("node:path"), P = require("../lib/helmut/quellen-bundestag-termine-pdf");
  const definitions = [
    ["arbeit",0,"45",0,"1231704/TO-45-Sitzung.pdf","1f01c77ff3b12bc49e302ede6fb27dc77a145616a385f7529b0dfb68b60c4c82"],
    ["wirtschaft-basis",1,"59",0,"1231438/to_59_11-11-2026.pdf","126552de8e940d0d84741400c643301e519f46db058595d2a184283b7382f0cb"],
    ["wirtschaft",1,"59",4,"1232506/to_59_11-11-2026_4-ergaenzung.pdf","f47afe252992381f46635a1309502cb16be52342e81580bcbbbf150a9fc7d02b"],
    ["wirtschaft-1",1,"59",1,"1231616/to_59_11-11-2026_1-ergaenzung.pdf","a7e013c7235dda63d427287f9615dcb1922e6a220b527a5105dc9157ffbb9768"],
    ["wirtschaft-2",1,"59",2,"1232116/to_59_2-aenderung_11-11-2026.pdf","6f6cfff1df19c6e32bef577a66d1e80a4def81dcea08b6c634dbc61b0565e003"],
    ["wirtschaft-3",1,"59",3,"1232282/to_59_11-11-2026_3-ergaenzung.pdf","fe4611556a0fe61a265de8984e1c9397d83cba747127c36cfc460bc21f5a2a4d"],
    ["digital",2,"38",0,"1230840/TO-38-Sitzung.pdf","e37ed0b817c77a95ef7cd1b904a18d0c307d697a3533c2c52fb3e2335b8cb713"],
    ["digital-ergaenzung",2,"38",1,"1232288/TO-38-Sitzung-1-Ergaenzungsmitteilung.pdf","ae2a030b007026b4c4c7cbee2ce1b0096c1fea99c7cb7ec443c0603db7c5d632"],
    ["plenum",3,null,0,"473452/Tagesordnung-komplett.pdf","f5dc7efd944695a2dbc6fa73ae68c09fd88d8c0a98f2fd230a5b40a5f123a75c"] ];
  const docs = {};
  for (const [name,index,number,revision,pdfPath,sha] of definitions) {
    const bytes = fs.readFileSync(path.join(originalDir,name+".pdf")); A.equal(B.hash(bytes),sha);
    // Die Original-Fixture bindet die PDF-Bytes. Der Listenwert für Wirtschaft
    // ist eine deklarierte Testannahme, da diese Fixture keine Liste enthält.
    const listedDay = index === 2 ? "2026-11-11" : "2026-11-12";
    const q = B.QUELLEN[index], d = B.tagesordnung(q,link(revision,{
      url:"https://www.bundestag.de/resource/blob/"+pdfPath,listedMeeting:number,listedDay }),bytes,await P.lesen(bytes));
    B.leseStand(B.baueStand(q,[d],new Date(now()).toISOString(),"a".repeat(64))); docs[name]=d;
  }
  A.deepEqual(docs.arbeit.conflicts,["sitzungsnummer-widerspruch"]);
  A.equal(docs.arbeit.meetings[0].startsAt,"2026-11-26T07:00:00.000Z"); A.equal(docs.arbeit.tops[0].number,"einzig");
  A.equal(docs["wirtschaft-basis"].meetings[0].startsAt,"2026-11-11T09:30:00.000Z");
  A.equal(docs.wirtschaft.meetings[0].startsAt,"2026-11-11T08:00:00.000Z");
  A(docs.wirtschaft.tops.length > 0);
  A(!JSON.stringify(docs.wirtschaft).includes("Energiewende"));
  const economics = B.fasseZusammen([docs["wirtschaft-basis"],docs["wirtschaft-1"],docs["wirtschaft-2"],docs["wirtschaft-3"],docs.wirtschaft])[0];
  A.equal(economics.state,"geplant"); A.equal(economics.startsAt,"2026-11-11T08:00:00.000Z");
  A(economics.topVersions.some(t=>t.superseded)); A(economics.tops.every(t=>t.revision>=2));
  A(docs["digital-ergaenzung"].tops[0].references.includes("21/6585"));
  A(docs["digital-ergaenzung"].tops[0].references.includes("21/7406"));
  A.equal(docs["digital-ergaenzung"].tops[0].deadlines.length,2);
  A(docs["digital-ergaenzung"].tops[0].deadlines.every(f=>f.day==="2026-11-11"&&f.at===null));
  A.equal(docs.plenum.meetings.length,4); A.equal(docs.plenum.conflicts.length,0); A(docs.plenum.plenumTops.length>0);
  const plenumStand = B.baueStand(B.QUELLEN[3],[docs.plenum],new Date(now()).toISOString(),"a".repeat(64));
  A.deepEqual(plenumStand.meetings.map(m=>m.key),docs.plenum.meetings.map(m=>`${m.number}|${m.day}`));
  A.deepEqual(plenumStand.meetings.map(m=>m.startsAt),docs.plenum.meetings.map(m=>m.startsAt));
  const bytes = fs.readFileSync(path.join(originalDir,"kalender.ics"));
  A.equal(B.hash(bytes),"0b134ea87f2029efd7e164be3d5b98d52009464a7b57f6beca4008fa92a0fc37");
  const calendar = B.kalender(B.QUELLEN[4],{url:"https://www.bundestag.de/resource/blob/1103938/Parlamentstermine_2026_ics.ics"},bytes);
  A.equal(calendar.events.find(e=>e.startDay==="2026-11-23").endDayExclusive,"2026-11-28");
  A.equal(calendar.publishedDay,null);
});
(async () => { let n = 0; for (const [name, fn] of tests) { await fn(); n++; console.log("PASS " + name); }
  console.log(`${n}/${tests.length} parlamentarische Quellengruppen bestanden.`); })().catch(e => { console.error(e.stack); process.exitCode = 1; });
