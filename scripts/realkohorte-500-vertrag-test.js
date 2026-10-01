"use strict";

// Nur NEUE Offline-Pruefungen dieses Vertrags. Kein null500-Altlauf, keine DB.
const A = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const V = require("../lib/helmut/realkohorte-500-vertrag");
const E = require("./realkohorte-500-endweg");
const bytes = fs.readFileSync(path.join(__dirname, "../daten/mandatsprofile-bundestag-berlin-brandenburg-20260929.json"));
const paket = JSON.parse(bytes);
const kopie = value => structuredClone(value);
let pass = 0;
const test = (name, fn) => {
  if (process.argv.includes("--nur-dollarquote") && !name.startsWith("Dollarquote")) return;
  fn(); pass++; console.log("PASS " + name);
};
function fixture() {
  const snapshot = { beobachtetAm: "2026-10-01T10:00:00.000Z",
    mandate_profiles: paket.profile.map(p => ({ user_id: p.mandatsId, aktiv: false, geloescht_at: null,
      updated_at: "2026-10-01T09:59:59.000Z", partei: p.partei || null,
      fraktion: p.fraktion || (p.fraktionslos ? "Fraktionslos" : p.partei || null), feld: "Offline-Testabbild" })),
    profiles: [...paket.profile.map(p => ({ id: p.mandatsId, name: p.vollname })),
      { id: "offline-fremdprofil", name: "Nicht zum Mandatsbestand gehoerig", payload: { beibehalten: true } }] };
  const kosten = { tag: "2026-10-01", beobachtetAm: "2026-10-01T10:00:00.000Z",
    tageslimitMikroUsd: 6000000, auftragslimitMikroUsd: 7000000,
    tagVerbrauchtMikroUsd: 1000000, tagReserviertMikroUsd: 500000,
    auftragVerbrauchtMikroUsd: 4000000, auftragReserviertMikroUsd: 500000,
    restreserveMikroUsd: 2500000, laufreserveMikroUsd: 2000000 };
  const manifest = V.vorbereiten({ paketBytes: bytes, snapshot, kosten, operationId: "real500-offline-20261001-v1",
    vorflugAm: "2026-10-01T10:00:30.000Z", startBis: "2026-10-01T10:05:30.000Z", endeAm: "2026-10-01T22:00:00.000Z" });
  const quittung = { version: V.VERSION, operationId: manifest.operationId, manifest: kopie(manifest),
    zustand: "aktiv", aktiviertAm: "2026-10-01T10:01:00.000Z", bestaetigtAktiv: 500 };
  return { snapshot, manifest, quittung, grund: "frist" };
}
const pruefe = f => V.pruefeManifest(f.manifest, bytes, f.snapshot);
const verweigere = (name, mutate, re) => test(name, () => {
  const f = fixture(); mutate(f); A.throws(() => pruefe(f), re || /real500-/);
});

for (const [index, text] of ["normaler Text $real500_end$ normaler Text",
  "$real500_end$ $real500_end_1$ $real500_end_2$",
  "$real500_end$'; select 'Offline-Gegenprobe'; --",
  "$real500_end$ $real500_end_1$ $real500_end_2$ $real500_end_3$ $real500_end_4$"].entries()) {
  test("Dollarquote-Kollision im akzeptierten Fremdprofil " + (index + 1), () => {
    const f = fixture(); f.snapshot.profiles[500].name = text;
    f.manifest = V.vorbereiten({ ...f.manifest, paketBytes: bytes, snapshot: f.snapshot });
    f.quittung.manifest = kopie(f.manifest);
    const sql = E.baueSql(f, bytes), tag = sql.match(/^do (\$[a-zA-Z0-9_]+\$)$/m)?.[1];
    A.ok(tag); A.notEqual(tag, "$real500_end$");
    A.equal(sql.split(tag).length - 1, 2);
    const body = sql.split(tag)[1]; A.ok(!body.includes(tag));
    A.ok(body.includes(text.replace(/'/g, "''")));
    A.match(body, /^\ndeclare\n/); A.match(body, /\nend\n$/);
    A.match(body, /set aktiv=false where user_id=any\(ids\) and aktiv=true/);
  });
}

test("500 kanonische IDs / 330-120-50; volle Paketbindung; keine Freigabe", () => {
  const f = fixture(); A.equal(pruefe(f).ids.length, 500); A.deepEqual(f.manifest.verteilung, V.VERTEILUNG);
  A.equal(f.manifest.zustand, "inaktiv-vorbereitung"); A.deepEqual(f.manifest.offen, [...V.OFFEN]);
});
test("Paket-Bytehash erkennt auch reine Formatdrift", () => A.throws(() => V.pruefePaket(String(bytes) + "\n"), /paket-hash-drift/));
test("Paket-Inhaltsdrift", () => { const p = kopie(paket); p.profile[0].vollname += " Drift";
  A.throws(() => V.pruefePaket(JSON.stringify(p)), /paket-hash-drift/); });
test("Kanons-ID-Drift", () => { const p = kopie(paket); p.profile[0].mandatsId = "fremde-id";
  A.throws(() => V.pruefePaket(JSON.stringify(p)), /paket-ids-drift/); });
test("Falsche Ebenenverteilung", () => { const p = kopie(paket); p.profile[0].parlament = "landtag-berlin";
  A.throws(() => V.pruefePaket(JSON.stringify(p)), /paket-verteilung/); });
for (const field of ["partei", "fraktion"]) test("AfD-Sperre ueber " + field, () => {
  const p = kopie(paket); p.profile[0][field] = "AfD"; if (field === "partei") p.profile[0].fraktion = "Fraktionslos";
  A.throws(() => V.pruefePaket(JSON.stringify(p)), /AfD-zugehoerige/);
});
verweigere("Manifest-ID-Drift", f => { f.manifest.ids[0] = "fremd"; }, /manifest-bindung/);
verweigere("Manifest-Pakethash-Drift", f => { f.manifest.paketHash = "a".repeat(64); }, /manifest-bindung/);
verweigere("Unbekannte Vertragsversion", f => { f.manifest.version = 2; }, /manifest-bindung/);
verweigere("Alte null500-Operation wird nicht akzeptiert", f => { f.manifest.operationId = "testfenster-null500-alt"; }, /manifest-bindung/);
verweigere("Freigabefeld darf nicht eingeschmuggelt werden", f => { f.manifest.bestaetigung = "GO"; }, /manifest-format/);
verweigere("Offene Rechtsfreigabe bleibt Pflicht", f => { f.manifest.offen.shift(); }, /keine-freigabe/);
verweigere("Profilnullzustand erfordert 0 aktiv", f => { f.snapshot.mandate_profiles[0].aktiv = true; }, /nullbestand-id-aktiv-drift/);
verweigere("Profilnullzustand erfordert alle 500", f => { f.snapshot.mandate_profiles.pop(); }, /nullbestand-menge/);
verweigere("Fremdes Mandatsprofil wird abgewiesen", f => { f.snapshot.mandate_profiles[0].user_id = "fremd"; }, /nullbestand-id-aktiv-drift/);
verweigere("Genau 501 Identitaeten mit erhaltenem Fremdprofil", f => { f.snapshot.profiles.pop(); }, /nullbestand-menge/);
verweigere("Doppelte Identitaet", f => { f.snapshot.profiles[0].id = f.snapshot.profiles[1].id; }, /nullbestand-identitaeten/);
verweigere("Fremdprofil-Inhaltsdrift", f => { f.snapshot.profiles[500].payload.beibehalten = false; }, /nullbestand-bindung-zeit/);
verweigere("Fachfeld-Drift", f => { f.snapshot.mandate_profiles[0].feld = "Drift"; }, /nullbestand-bindung-zeit/);
verweigere("AfD im Nullbestand trotz fremder Fraktion", f => { f.snapshot.mandate_profiles[0].partei = "AfD"; }, /AfD-zugehoerige/);
verweigere("Parteifeld muss zum gebundenen Paket passen", f => { f.snapshot.mandate_profiles[0].partei = "Andere Partei"; }, /nullbestand-zulassung/);
verweigere("Veralteter 0-aktiv-Beleg", f => { f.snapshot.beobachtetAm = "2026-10-01T09:00:00.000Z";
  f.manifest.profilnullzustand = V.pruefeNullbestand(f.snapshot, f.manifest.ids, paket.profile); }, /nullbestand-bindung-zeit/);
verweigere("Startfrist maximal fuenf Minuten", f => { f.manifest.startBis = "2026-10-01T10:05:31.000Z"; }, /zeitfenster/);
verweigere("Ende muss hinter Startfrist liegen", f => { f.manifest.endeAm = f.manifest.startBis; }, /zeitfenster/);
verweigere("Zeitfenster maximal 24 Stunden", f => { f.manifest.endeAm = "2026-10-02T10:00:31.000Z"; }, /zeitfenster/);
verweigere("Keine automatische Kostenfreigabe ueber UTC-Tageswechsel", f => { f.manifest.endeAm = "2026-10-02T00:00:00.000Z"; }, /kosten-zeit/);
verweigere("6-USD-Tagesgrenze bleibt erhalten", f => { f.manifest.kosten.tageslimitMikroUsd++; }, /kosten-grenzen/);
verweigere("7-USD-Auftragsgrenze bleibt erhalten", f => { f.manifest.kosten.auftragslimitMikroUsd++; }, /kosten-grenzen/);
verweigere("Unbekannte Kosten sind keine Nullkosten", f => { f.manifest.kosten.auftragVerbrauchtMikroUsd = null; }, /kosten-grenzen/);
verweigere("Offene Reservierungen zaehlen mit", f => { f.manifest.kosten.auftragReserviertMikroUsd++; }, /kosten-restreserve/);
verweigere("Reale Restreserve muss exakt vorliegen", f => { f.manifest.kosten.restreserveMikroUsd++; }, /kosten-restreserve/);
verweigere("Laufreserve darf Restreserve nicht ueberschreiten", f => { f.manifest.kosten.laufreserveMikroUsd = 2500001; }, /kosten-restreserve/);
verweigere("Kostenaufnahme darf nicht veraltet sein", f => { f.manifest.kosten.beobachtetAm = "2026-10-01T09:00:00.000Z"; }, /kosten-zeit/);
verweigere("Kumulativer Verbrauch nicht kleiner als Tagesverbrauch", f => { f.manifest.kosten.auftragVerbrauchtMikroUsd = 0; }, /kosten-inkonsistent/);
test("Endquittung bindet Operation, Version, Manifest und exakt500", () => {
  for (const change of [q => { q.operationId += "fremd"; }, q => { q.version = 2; },
    q => { q.manifest.ids[0] = "fremd"; }, q => { q.bestaetigtAktiv = 499; }, q => { q.zustand = "beendet"; },
    q => { q.unbekannt = true; }, q => { q.aktiviertAm = q.manifest.startBis; }]) {
    const f = fixture(); change(f.quittung); A.throws(() => E.baueSql(f, bytes), /endquittung-bindung/);
  }
});
test("End-SQL ist eine gesperrte Transaktion mit CAS und reinem Deaktivierungsumfang", () => {
  const f = fixture(), sql = E.baueSql(f, bytes);
  A.equal((sql.match(/^begin;/gm) || []).length, 1); A.equal((sql.match(/^commit;/gm) || []).length, 1);
  A.match(sql, /statement_timeout='15s'/); A.match(sql, /lock_timeout='3s'/);
  A.ok(sql.indexOf("lock table") < sql.indexOf("update public.mandate_profiles"));
  A.ok(sql.indexOf("raise exception 'real500-endbestand") < sql.indexOf("update public.mandate_profiles"));
  A.match(sql, /set aktiv=false where user_id=any\(ids\) and aktiv=true/);
  A.match(sql, /where id=slot and data=erwartete_quittung/);
  A.match(sql, /n <> 500/); A.match(sql, /n <> 1/);
  A.match(sql, /count\(\*\) from public.profiles\) <> 501/);
  A.match(sql, /count\(\*\) from public.mandate_profiles\) <> 500/);
  A.ok(!/\b(delete|insert|create|alter|drop|truncate)\b/i.test(sql));
  A.ok(!sql.includes("helmut_testfenster_null500_ende"));
  A.ok(sql.includes(JSON.stringify(f.snapshot.profiles[500]))); // Fremdprofil voll gebunden
  A.match(sql, /erwartet_profiles is distinct from/g);
  A.match(sql, /clock_timestamp\(\) < \(m->>'endeAm'\)::timestamptz/);
});
test("Notstopp braucht keine Frist, aber dieselbe Quittung/Scope", () => {
  const f = fixture(); f.grund = "notstopp"; A.match(E.baueSql(f, bytes), /'notstopp'='frist'/);
  f.grund = "beliebig"; A.throws(() => E.baueSql(f, bytes), /endgrund/);
});
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-real500-offline-"));
try {
  test("SQL-Ausgabe 0600; vorhandene Datei/Symlink wird nie ueberschrieben", () => {
    const out = path.join(tmp, "ende.sql"); E.schreibePrivat(out, "offline-test");
    A.equal(fs.statSync(out).mode & 0o777, 0o600);
    A.throws(() => E.schreibePrivat(out, "nicht-erlaubt"), /EEXIST/);
    const link = path.join(tmp, "link.sql"); fs.symlinkSync(out, link);
    A.throws(() => E.schreibePrivat(link, "nicht-erlaubt"), /EEXIST/);
    A.equal(fs.readFileSync(out, "utf8"), "offline-test");
  });
  test("Repository-Ausgabe auch durch Symlink verweigert", () => {
    A.throws(() => E.schreibePrivat(path.join(__dirname, "real500-nicht-schreiben.sql"), "verboten"), /ausgabe-im-repo/);
    const link = path.join(tmp, "repo"); fs.symlinkSync(__dirname, link, "dir");
    A.throws(() => E.schreibePrivat(path.join(link, "real500-nicht-schreiben.sql"), "verboten"), /ausgabe-im-repo/);
  });
  test("CLI liefert keine SQL-/Profildaten in stdout/stderr", () => {
    const input = path.join(tmp, "input.json"), out = path.join(tmp, "cli-ende.sql");
    fs.writeFileSync(input, JSON.stringify(fixture()), { mode: 0o600 });
    const r = spawnSync(process.execPath, [path.join(__dirname, "realkohorte-500-endweg.js"), "--input", input, "--out", out],
      { encoding: "utf8", timeout: 20000 });
    A.equal(r.status, 0); A.equal(r.stderr, ""); A.ok(!r.stdout.includes("begin;"));
    A.ok(!r.stdout.includes(paket.profile[0].vollname)); A.equal(fs.statSync(out).mode & 0o777, 0o600);
    A.ok(fs.readFileSync(out, "utf8").includes("set aktiv=false"));
  });
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(`${pass}/${pass} neue Offline-Pruefungen gruen. SQL nicht auf PostgreSQL/Production ausgefuehrt.`);
