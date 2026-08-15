"use strict";

// Helmut — MUTATIONSPROBE des atomaren Verstehensvertrags (OP-30 CAS, 2026-08-14).
// =============================================================================================
// Prinzip (wie scripts/outbox-mutationsprobe.js): ein grüner Test beweist nichts, solange
// niemand geprüft hat, ob er überhaupt rot werden KANN. Diese Probe entfernt gezielt je EINEN
// Schutzmechanismus aus einer IN-MEMORY-Kopie von 20260814180000_verstehen_cas.sql (die Datei
// selbst wird NIE verändert), spielt sie in eine Wegwerf-Datenbank ein und weist nach, dass
// der Schaden dann tatsächlich eintritt.
//
// SEMANTIK INVERTIERT: ROT (= Schaden tritt ein) ist der ERFOLG der Probe.
// GRÜN (= Schaden bleibt aus) wäre ein LOCH IM NACHWEIS → Exit 1.
//
// Die sechs geforderten Mutationen:
//   M1  fehlendes Compare-and-Set  → verlorene Vormerkung bei gleichzeitigen Läufen
//   M2  fehlender Fencing-Wert     → ein abgelöster Arbeiter bleibt schreibberechtigt
//   M3  fehlende Serialisierung    → mehr als eine berechtigte KI-Ausführung je Vorgang
//   M4  fehlende Lease-Prüfung     → der alte Besitzer bekommt Schreibrecht zurück
//   M5  fehlender Fencing-Riegel   → ein altes Ergebnis überschreibt ein neueres
//   M6  fehlende Unbekannt-Sperre  → ein unbekannter Ausgang wird still wiederholt
//
// Dazu, aus dem Korrekturlauf 2026-08-15, die DREI URSPRÜNGLICHEN LÜCKEN — jede in genau
// der Form wiederhergestellt, in der sie bestätigt wurde:
//   M7  Lücke 1: `freigabe` wirkt wieder aus `modell-laeuft` → zweiter Modellaufruf
//   M8  Lücke 2: `schreibrecht`/`speichere` ohne Lease-Zwang → abgelaufene Lease speichert
//   M9  Lücke 3: Trigger-Gleichstandsumgehung + fehlender CAS-Vergleich → F1 schlägt F2
//
// Läuft NUR manuell (endet nicht auf -test.js; DB-lastig):
//   HELMUT_TEST_PG_HOST=127.0.0.1 node scripts/lokal.js -- node scripts/verstehen-cas-mutationsprobe.js

const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MIGRATION = path.join(ROOT, "supabase", "migrations", "20260814180000_verstehen_cas.sql");

const PG = {
  host: process.env.HELMUT_TEST_PG_HOST || "",
  port: process.env.HELMUT_TEST_PG_PORT || "5433",
  user: process.env.HELMUT_TEST_PG_USER || "helmut",
  db: "helmut_verstehen_cas_mutation"
};

let erkannt = 0;
let loecher = 0;
function mutation(name, schadenEingetreten, detail = "") {
  if (schadenEingetreten) { erkannt += 1; console.log(`  ROT (erkannt)   ${name}`); }
  else { loecher += 1; console.log(`  GRUEN (LOCH!)   ${name}${detail ? ` — ${detail}` : ""}`); }
}

function psql(sql, { datei = null, erwarteFehler = false, db = PG.db } = {}) {
  const args = ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", db, "-tA", "-v", "ON_ERROR_STOP=1"];
  if (datei) args.push("-f", datei); else args.push("-c", sql);
  try {
    return { ok: true, out: execFileSync("psql", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
  } catch (error) {
    if (!erwarteFehler) throw error;
    return { ok: false, out: String((error.stderr || error.stdout || error.message) || "").trim() };
  }
}

function psqlAsync(sql) {
  return new Promise((resolve) => {
    const kind = spawn("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", PG.db, "-tA", "-c", sql],
      { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    kind.stdout.on("data", (d) => { out += d; });
    kind.on("close", () => resolve(out.trim()));
  });
}

function servererreichbar() {
  if (!PG.host) return false;
  try {
    execFileSync("psql", ["-h", PG.host, "-p", String(PG.port), "-U", PG.user, "-d", "postgres", "-tAc", "select 1"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch (_) { return false; }
}

const KERNSCHEMA = `
  create table if not exists public.knowledge_objects (
    id text primary key, vorgang_id text, status text,
    understanding_status text, ko_version integer default 1, updated_at timestamptz default now()
  );
`;

// Frische Wegwerf-DB + MUTIERTE Migration. Genau EIN replace, harter Fehler bei fehlendem
// Anker — eine Mutation, die nichts trifft, waere aussagelos (und wuerde als "kein Schaden"
// erscheinen, also ein Loch vortaeuschen, das gar keins ist).
function spieleEin(suchen, ersetzen) {
  // Mehrere Anker: eine Luecke, die aus zwei zusammenwirkenden Riegeln besteht, muss auch
  // als EINE Mutation wiederherstellbar sein — sonst wuerde der jeweils andere Riegel den
  // Schaden verdecken und die Probe eine Zusage belegen, die so gar nicht geprueft wurde.
  if (Array.isArray(suchen)) return spieleMehrereEin(suchen);
  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  psql(`create database ${PG.db}`, { db: "postgres" });
  psql(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$`);
  psql(KERNSCHEMA);

  let sql = fs.readFileSync(MIGRATION, "utf8");
  if (suchen !== null) {
    const treffer = sql.split(suchen).length - 1;
    if (treffer !== 1) {
      throw new Error(`Mutationsanker nicht EINDEUTIG (${treffer} Treffer): ${suchen.slice(0, 80)}…`);
    }
    // Ersatz als FUNKTION: in einem Ersatz-STRING waere `$$` ein escaptes `$` — genau das
    // hat die Dollar-Quotes der Funktionskoerper zerstoert (`$$;` wurde zu `$;`).
    sql = sql.replace(suchen, () => ersetzen);
  }
  const datei = path.join(os.tmpdir(), `helmut-cas-mutation-${process.pid}.sql`);
  fs.writeFileSync(datei, sql);
  // Bei einem Fehler bleibt die mutierte Datei liegen — sonst waere die Ursache nicht
  // nachlesbar (und eine syntaktisch kaputte Mutation saehe wie ein fehlender Schaden aus).
  psql(null, { datei });
  fs.unlinkSync(datei);
}

function spieleMehrereEin(paare) {
  psql(`drop database if exists ${PG.db}`, { db: "postgres" });
  psql(`create database ${PG.db}`, { db: "postgres" });
  psql(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$`);
  psql(KERNSCHEMA);
  let sql = fs.readFileSync(MIGRATION, "utf8");
  for (const [suchen, ersetzen] of paare) {
    const treffer = sql.split(suchen).length - 1;
    if (treffer !== 1) throw new Error(`Mutationsanker nicht EINDEUTIG (${treffer} Treffer): ${suchen.slice(0, 80)}…`);
    sql = sql.replace(suchen, () => ersetzen);
  }
  const datei = path.join(os.tmpdir(), `helmut-cas-mutation-${process.pid}.sql`);
  fs.writeFileSync(datei, sql);
  psql(null, { datei });
  fs.unlinkSync(datei);
}

// Der EINZIGE erlaubte Schreibweg (Korrekturlauf 2026-08-15).
function casSchreibe(vorgangId, besitzer, fencing, koId, felder = {}) {
  const ko = JSON.stringify({ id: koId, vorgang_id: vorgangId, ...felder }).replace(/'/g, "''");
  return psql(`select public.helmut_verstehen_speichere('${vorgangId}','${besitzer}',${fencing},'${ko}'::jsonb,'e')`).out;
}

function reserviere(vorgangId, hash, besitzer, ttlMs = 300000) {
  const z = psql(`select erlaubt||'|'||fencing||'|'||zustand||'|'||grund`
    + ` from public.helmut_verstehen_reserviere('${vorgangId}','${hash}','${besitzer}',${ttlMs})`).out.split("|");
  return { erlaubt: /^t/.test(z[0] || ""), fencing: Number(z[1]), zustand: z[2], grund: z[3] };
}

function leaseWeg(vorgangId) {
  psql(`update public.helmut_verstehen_reservierungen set lease_bis = now() - interval '1 second'`
    + ` where vorgang_id='${vorgangId}'`);
}

// ── Die Szenarien: je Mutation dasselbe Szenario einmal MUTIERT (Schaden erwartet) ──────────
async function szenarioVormerkung() {
  await Promise.all(Array.from({ length: 20 }, () =>
    psqlAsync("select public.helmut_verstehen_vormerkung_erhoehe('vg-m','1',1)")));
  return Number(psql("select coalesce(max(fehlversuche),0) from public.helmut_verstehen_vormerkungen where vorgang_id='vg-m'").out);
}

// Der abgeloeste Arbeiter `alt` verschwindet nach dem Modellstart; `neu` uebernimmt.
// Die Fencing-Werte kommen aus den Antworten, damit die Probe auch dann aussagekraeftig
// bleibt, wenn eine Mutation die Zaehlung selbst kaputt macht.
function szenarioAbloesung() {
  const erst = reserviere("vg-m", "h1", "alt");
  psql(`select public.helmut_verstehen_modellstart('vg-m','alt',${erst.fencing},300000)`);
  leaseWeg("vg-m");
  reserviere("vg-m", "h1", "neu");                       // -> unbekannt (oder Uebernahme)
  psql("select public.helmut_verstehen_ausgang_aufloesen('vg-m','erneut')");
  const uebernahme = reserviere("vg-m", "h1", "neu");
  psql(`select public.helmut_verstehen_modellstart('vg-m','neu',${uebernahme.fencing},300000)`);
  return { erst, uebernahme };
}

// Die Ankerzeile wird VORHER angelegt. Sonst serialisiert bereits das
// `insert .. on conflict do nothing` alle Arbeiter am Unique-Index, und die fehlende
// Zeilensperre waere gar nicht sichtbar — die Probe wuerde eine Zusage belegen, die in
// diesem Szenario von einem ganz anderen Mechanismus kaeme.
async function szenarioGleichzeitig() {
  psql("insert into public.helmut_verstehen_reservierungen (vorgang_id) values ('vg-heiss')"
    + " on conflict (vorgang_id) do nothing");
  const antworten = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    psqlAsync(`select erlaubt from public.helmut_verstehen_reserviere('vg-heiss','h','w${i}',300000)`)));
  return antworten.filter((a) => a === "t").length;
}

function szenarioUeberschreiben() {
  reserviere("vg-o", "h1", "alt");
  psql("select public.helmut_verstehen_modellstart('vg-o','alt',1,300000)");
  leaseWeg("vg-o");
  reserviere("vg-o", "h1", "neu");
  psql("select public.helmut_verstehen_ausgang_aufloesen('vg-o','erneut')");
  const u = reserviere("vg-o", "h1", "neu");
  psql(`select public.helmut_verstehen_modellstart('vg-o','neu',${u.fencing},300000)`);
  casSchreibe("vg-o", "neu", u.fencing, "ko-vg-o", { status: "neu" });
  const alt = psql("update public.knowledge_objects set verstehen_fencing=1, status='alt' where id='ko-vg-o'",
    { erwarteFehler: true });
  return alt.ok;   // true = die veraltete Ueberschreibung ist DURCHGEGANGEN (Schaden)
}

// Wozu der MONOTONE Fencing-Wert gebraucht wird: er trennt die Generationen eines Vorgangs.
// Faellt die Monotonie weg, kann die Datenbank ein ALTES Ergebnis nicht mehr von dem
// unterscheiden, das der abgestuerzte Lauf haette liefern sollen — und meldet einen nie
// berechneten Vorgang als fertig (falsches Gruen, CLAUDE.md §4 Regel 4).
function szenarioMonotonie() {
  const erst = reserviere("vg-mono", "h1", "w1");
  psql(`select public.helmut_verstehen_modellstart('vg-mono','w1',${erst.fencing},300000)`);
  casSchreibe("vg-mono", "w1", erst.fencing, "ko-vg-mono", { status: "erste-fassung" });
  // NEUE Eingabe (Fortschreibung) — sie ist noch nie berechnet worden.
  const zweit = reserviere("vg-mono", "h2", "w2");
  psql(`select public.helmut_verstehen_modellstart('vg-mono','w2',${zweit.fencing},300000)`);
  leaseWeg("vg-mono");                                  // w2 stuerzt nach dem Modellstart ab
  const dritt = reserviere("vg-mono", "h2", "w3");
  return {
    grund: dritt.grund,
    zustand: psql("select zustand from public.helmut_verstehen_reservierungen where vorgang_id='vg-mono'").out,
    inhalt: psql("select status from public.knowledge_objects where id='ko-vg-mono'").out
  };
}

// LUECKE 1: ein Fehler NACH dem Modellstart setzt den Vorgang wieder auf `offen`, und der
// naechste Lauf bezahlt denselben Aufruf ein zweites Mal.
function szenarioNachModellstart() {
  reserviere("vg-amo", "h1", "w1");
  psql("select public.helmut_verstehen_modellstart('vg-amo','w1',1,300000)");
  const frei = psql("select public.helmut_verstehen_freigabe('vg-amo','w1',1,'zeitueberschreitung')").out;
  const naechster = reserviere("vg-amo", "h1", "w2");
  return { frei, erlaubt: naechster.erlaubt };
}

// LUECKE 2: das Lease ist abgelaufen, NIEMAND hat uebernommen — und es wird trotzdem
// gespeichert.
function szenarioLeaseOhneNachfolger() {
  reserviere("vg-lz", "h1", "w1");
  psql("select public.helmut_verstehen_modellstart('vg-lz','w1',1,300000)");
  leaseWeg("vg-lz");
  const recht = psql("select public.helmut_verstehen_schreibrecht('vg-lz','w1',1,120000)").out;
  const speichern = casSchreibe("vg-lz", "w1", 1, "ko-vg-lz", { status: "zu-spaet" });
  return { recht, speichern };
}

// LUECKE 3: F1 ist gespeichert, F2 ist reserviert — und der alte Arbeiter schreibt erneut F1.
function szenarioF1F2() {
  reserviere("vg-f12", "h1", "alt");
  psql("select public.helmut_verstehen_modellstart('vg-f12','alt',1,300000)");
  casSchreibe("vg-f12", "alt", 1, "ko-vg-f12", { status: "F1" });
  const zweit = reserviere("vg-f12", "h2", "neu");
  psql(`select public.helmut_verstehen_modellstart('vg-f12','neu',${zweit.fencing},300000)`);
  // Der Schreibvorgang traegt DENSELBEN Fencing-Wert wie die gespeicherte Fassung — genau
  // die Form, die die urspruengliche Triggerlogik durchgelassen hat (`is not distinct from`).
  const direkt = psql("update public.knowledge_objects set status='ALT-F1', verstehen_fencing=1"
    + " where id='ko-vg-f12'", { erwarteFehler: true });
  const inhalt = psql("select status from public.knowledge_objects where id='ko-vg-f12'").out;
  return { durchgelassen: direkt.ok, inhalt };
}

function szenarioUnbekannt() {
  reserviere("vg-u", "h1", "tot");
  psql("select public.helmut_verstehen_modellstart('vg-u','tot',1,300000)");
  leaseWeg("vg-u");
  return reserviere("vg-u", "h1", "naechster");
}

async function main() {
  console.log("Helmut — Mutationsprobe atomarer Verstehensvertrag (OP-30 CAS)");
  console.log("SEMANTIK: ROT = Mutation erkannt (Schaden tritt ein) = ERFOLG.\n");

  if (!servererreichbar()) {
    console.log("== UEBERSPRUNGEN ==");
    console.log("  Kein lokaler PostgreSQL-Server erreichbar (HELMUT_TEST_PG_HOST nicht gesetzt).");
    console.log("  >> DIE MUTATIONSPROBE IST DAMIT OFFEN, NICHT ERBRACHT. <<");
    process.exit(0);
  }

  // ── 0 · Grundlinie: OHNE Mutation tritt KEIN Schaden ein ─────────────────────────────────
  console.log("== 0 · Grundlinie (unveraenderte Migration) ==");
  spieleEin(null, null);
  const basisVormerkung = await szenarioVormerkung();
  console.log(`  Vormerkungen nach 20 gleichzeitigen Erhoehungen: ${basisVormerkung} (erwartet 20)`);
  const basisGleichzeitig = await szenarioGleichzeitig();
  console.log(`  Berechtigungen bei 20 gleichzeitigen Arbeitern:  ${basisGleichzeitig} (erwartet 1)`);
  const basisUnbekannt = szenarioUnbekannt();
  console.log(`  Absturz nach Modellstart:                        ${basisUnbekannt.grund} (erwartet ausgang-unbekannt)`);
  const basisUeberschreiben = szenarioUeberschreiben();
  console.log(`  Veraltete Ueberschreibung durchgelassen:         ${basisUeberschreiben} (erwartet false)`);
  const basisAbloesung = szenarioAbloesung();
  const basisAlt = basisAbloesung.erst.fencing;
  const basisAltAbschluss = psql(`select public.helmut_verstehen_abschluss('vg-m','alt',${basisAlt},'alt')`).out;
  const basisAltSchreibrecht = psql(`select public.helmut_verstehen_schreibrecht('vg-m','alt',${basisAlt},120000)`).out;
  console.log(`  Abgeloester Arbeiter: Abschluss=${basisAltAbschluss} Schreibrecht=${basisAltSchreibrecht}`
    + ` (erwartet f/f), Fencing nach Uebernahme=${basisAbloesung.uebernahme.fencing} (erwartet 2)`);
  const basisMono = szenarioMonotonie();
  console.log(`  Absturz auf eine NEUE Eingabe:                   ${basisMono.grund}/${basisMono.zustand} (erwartet ausgang-unbekannt/unbekannt)`);
  const basisAmo = szenarioNachModellstart();
  console.log(`  Freigabe nach Modellstart:                       ${basisAmo.frei}/${basisAmo.erlaubt} (erwartet f/false)`);
  const basisLease = szenarioLeaseOhneNachfolger();
  console.log(`  Abgelaufene Lease ohne Nachfolger:               ${basisLease.recht}/${basisLease.speichern} (erwartet f/lease-abgelaufen)`);
  const basisF12 = szenarioF1F2();
  console.log(`  Erneuter F1-Schreibversuch bei F2:              ${basisF12.durchgelassen}/${basisF12.inhalt} (erwartet false/F1)`);
  const grundlinieSauber = basisVormerkung === 20 && basisGleichzeitig === 1
    && basisAmo.frei === "f" && basisAmo.erlaubt === false
    && basisLease.recht === "f" && basisLease.speichern === "lease-abgelaufen"
    && basisF12.durchgelassen === false && basisF12.inhalt === "F1"
    && basisMono.grund === "ausgang-unbekannt" && basisMono.zustand === "unbekannt"
    && basisVormerkung === 20 && basisGleichzeitig === 1
    && basisUnbekannt.grund === "ausgang-unbekannt" && basisUeberschreiben === false
    && basisAltAbschluss === "f" && basisAltSchreibrecht === "f"
    && basisAbloesung.uebernahme.fencing === basisAbloesung.erst.fencing + 1;
  if (!grundlinieSauber) {
    console.log("\n  ABBRUCH: die Grundlinie ist bereits beschaedigt — jede Mutation waere aussagelos.");
    process.exit(1);
  }
  console.log("  Grundlinie sauber.\n");

  // ── M1 · Fehlendes Compare-and-Set in der Vormerkung ─────────────────────────────────────
  console.log("== Mutationen ==");
  spieleEin(
    `  insert into public.helmut_verstehen_vormerkungen (vorgang_id, fehlversuche, letzte_fencing)
  values (p_vorgang_id, greatest(coalesce(p_delta, 0), 0), coalesce(p_fencing, 0))
  on conflict (vorgang_id) do update
     set fehlversuche   = public.helmut_verstehen_vormerkungen.fehlversuche + greatest(coalesce(p_delta, 0), 0),
         letzte_fencing = greatest(public.helmut_verstehen_vormerkungen.letzte_fencing, coalesce(p_fencing, 0)),
         updated_at     = now()
  returning fehlversuche into v_wert;
  return v_wert;`,
    `  -- MUTATION M1: Lesen -> Aendern -> Schreiben (der Zustand VOR diesem Sprint)
  select v.fehlversuche into v_wert from public.helmut_verstehen_vormerkungen v
   where v.vorgang_id = p_vorgang_id;
  perform pg_sleep(0.05);
  v_wert := coalesce(v_wert, 0) + greatest(coalesce(p_delta, 0), 0);
  insert into public.helmut_verstehen_vormerkungen (vorgang_id, fehlversuche, letzte_fencing)
  values (p_vorgang_id, v_wert, coalesce(p_fencing, 0))
  on conflict (vorgang_id) do update
     set fehlversuche = excluded.fehlversuche, updated_at = now();
  return v_wert;`);
  const m1 = await szenarioVormerkung();
  mutation(`M1 fehlendes Compare-and-Set -> verlorene Vormerkungen (${m1} statt 20)`,
    m1 < 20, `${m1} — der Eintrag ging NICHT verloren`);

  // ── M2 · Fencing-Wert steigt nicht mehr ──────────────────────────────────────────────────
  spieleEin(
    "     set fencing      = res.fencing + 1,",
    "     set fencing      = res.fencing,   -- MUTATION M2: kein monotoner Fencing-Wert");
  const m2 = szenarioMonotonie();
  mutation("M2 fehlender Fencing-Wert -> ein NIE berechnetes Ergebnis wird als fertig gemeldet (falsches Gruen)",
    m2.grund === "bereits-fertig" && m2.zustand === "fertig" && m2.inhalt === "erste-fassung",
    `grund=${m2.grund} zustand=${m2.zustand} inhalt=${m2.inhalt}`);

  // ── M3 · Serialisierung entfernt ─────────────────────────────────────────────────────────
  spieleEin(
    `  select * into r
    from public.helmut_verstehen_reservierungen res
   where res.vorgang_id = p_vorgang_id
     for update;

  -- (a) Endgueltig aufgegeben`,
    `  -- MUTATION M3: ohne Row-Lock koennen zwei Arbeiter denselben Zustand lesen.
  -- Das pg_sleep macht das Zeitfenster SICHTBAR, das ohne Sperre ohnehin besteht —
  -- es erzeugt den Fehler nicht, es verhindert nur, dass der Prozessstart ihn zufaellig
  -- zudeckt.
  select * into r
    from public.helmut_verstehen_reservierungen res
   where res.vorgang_id = p_vorgang_id;
  perform pg_sleep(0.1);

  -- (a) Endgueltig aufgegeben`);
  const m3 = await szenarioGleichzeitig();
  mutation(`M3 fehlende Serialisierung -> ${m3} berechtigte KI-Ausfuehrungen statt 1`,
    m3 > 1, `${m3} — es blieb bei einer Berechtigung`);

  // ── M4 · Lease-/Besitzerpruefung im Schreibrecht entfernt ────────────────────────────────
  spieleEin(
    `   where res.vorgang_id = p_vorgang_id
     and res.besitzer   = p_besitzer
     and res.fencing    = p_fencing
     and res.zustand    = 'modell-laeuft'
     -- LEASE-ZWANG: ein abgelaufenes Lease verliert das Schreibrecht auch dann,
     -- wenn noch KEIN Nachfolger uebernommen hat.
     and res.lease_bis is not null
     and res.lease_bis  > now();`,
    `   where res.vorgang_id = p_vorgang_id;   -- MUTATION M4: kein Lease, kein Besitzer, kein Fencing`);
  const m4Szenario = szenarioAbloesung();
  const m4 = psql(`select public.helmut_verstehen_schreibrecht('vg-m','alt',${m4Szenario.erst.fencing},120000)`).out;
  mutation("M4 fehlende Lease-Pruefung -> der ALTE Besitzer bekommt Schreibrecht zurueck",
    m4 === "t", `schreibrecht=${m4}`);

  // ── M5 · Fencing-Riegel am Wissensobjekt entfernt ────────────────────────────────────────
  spieleEin(
    `  -- ── Fremder Schreibweg (der Regelfall) ───────────────────────────────────────
  if coalesce(current_setting('helmut.verstehen_cas', true), '') <> 'geprueft' then`,
    `  -- MUTATION M5: der Riegel prueft nichts mehr
  if true then return new; end if;
  if coalesce(current_setting('helmut.verstehen_cas', true), '') <> 'geprueft' then`);
  const m5 = szenarioUeberschreiben();
  mutation("M5 fehlender Fencing-Riegel -> ein ALTES Ergebnis ueberschreibt das neuere",
    m5 === true, "die Ueberschreibung wurde weiterhin abgewehrt");

  // ── M6 · Sperre des unbekannten Ausgangs entfernt ────────────────────────────────────────
  spieleEin(
    `    else
      update public.helmut_verstehen_reservierungen res
         set zustand = 'unbekannt', besitzer = null, lease_bis = null,
             letzter_grund = 'absturz-nach-modellstart', updated_at = now()
       where res.vorgang_id = p_vorgang_id;
      return query select false, r.fencing, 'unbekannt'::text, 'ausgang-unbekannt'::text, r.ergebnis_hash, r.versuche;
      return;
    end if;`,
    `    else
      null;   -- MUTATION M6: der unbekannte Ausgang wird still uebergangen
    end if;`);
  const m6 = szenarioUnbekannt();
  mutation("M6 fehlende Unbekannt-Sperre -> ein unbekannter Ausgang wird STILL wiederholt (zweiter KI-Aufruf)",
    m6.erlaubt === true, `erlaubt=${m6.erlaubt} grund=${m6.grund}`);

  // ── DIE DREI URSPRUENGLICHEN LUECKEN (Korrekturlauf 2026-08-15) ─────────────────────────
  console.log("\n== Die drei urspruenglichen Luecken, wiederhergestellt ==");

  // ── M7 · Luecke 1: `freigabe` wirkt wieder aus `modell-laeuft` ───────────────────────────
  spieleEin(
    `     -- NUR vor dem Modellstart. 'modell-laeuft' ist hier bewusst NICHT enthalten.
     and res.zustand    = 'reserviert';`,
    `     and res.zustand in ('reserviert', 'modell-laeuft');   -- MUTATION M7: Luecke 1 wiederhergestellt`);
  const m7 = szenarioNachModellstart();
  mutation("M7 Luecke 1: ein Fehler nach dem Modellstart oeffnet den Vorgang wieder -> ZWEITER Modellaufruf",
    m7.frei === "t" && m7.erlaubt === true, `freigabe=${m7.frei} naechster-erlaubt=${m7.erlaubt}`);

  // ── M8 · Luecke 2: kein Lease-Zwang vor der Persistenz ──────────────────────────────────
  spieleEin([
    [`     and res.zustand    = 'modell-laeuft'
     -- LEASE-ZWANG: ein abgelaufenes Lease verliert das Schreibrecht auch dann,
     -- wenn noch KEIN Nachfolger uebernommen hat.
     and res.lease_bis is not null
     and res.lease_bis  > now();`,
     `     and res.zustand    = 'modell-laeuft';   -- MUTATION M8: Luecke 2 wiederhergestellt`],
    [`  if r.lease_bis is null or r.lease_bis <= now() then return 'lease-abgelaufen'; end if;`,
     `  -- MUTATION M8: auch der atomare Speicherweg prueft das Lease nicht mehr`]
  ]);
  const m8 = szenarioLeaseOhneNachfolger();
  mutation("M8 Luecke 2: abgelaufene Lease OHNE Nachfolger speichert trotzdem",
    m8.recht === "t" && m8.speichern === "gespeichert", `schreibrecht=${m8.recht} speichern=${m8.speichern}`);

  // ── M9 · Luecke 3: Fencing-Umgehung bei Wertgleichheit ──────────────────────────────────
  // Wiederhergestellt wird GENAU die alte Triggerlogik: sie feuerte bei jedem UPDATE und
  // sprang ab, sobald der geschriebene Fencing-Wert dem gespeicherten entsprach.
  spieleEin([
    [`  before insert or update of verstehen_fencing on public.knowledge_objects`,
     `  before insert or update on public.knowledge_objects`],
    [`  -- ── Fremder Schreibweg (der Regelfall) ───────────────────────────────────────
  if coalesce(current_setting('helmut.verstehen_cas', true), '') <> 'geprueft' then`,
     `  -- MUTATION M9: Wertgleichheit springt an der Pruefung vorbei (Luecke 3, Originalfassung)
  if new.verstehen_fencing is null
     or (tg_op = 'UPDATE' and new.verstehen_fencing is not distinct from old.verstehen_fencing) then
    return new;
  end if;
  if coalesce(current_setting('helmut.verstehen_cas', true), '') <> 'geprueft' then`]
  ]);
  const m9 = szenarioF1F2();
  mutation("M9 Luecke 3: F1 gespeichert + F2 reserviert -> ein erneuter F1-Schreibversuch kommt DURCH",
    m9.durchgelassen === true && m9.inhalt === "ALT-F1", `durchgelassen=${m9.durchgelassen} inhalt=${m9.inhalt}`);

  psql(`drop database if exists ${PG.db}`, { db: "postgres" });

  console.log(`\n== ERGEBNIS ==\nROT (erkannt) ${erkannt}  GRUEN (Loecher) ${loecher}  (gesamt ${erkannt + loecher})`);
  if (loecher > 0) {
    console.log("MINDESTENS EIN SCHUTZMECHANISMUS IST NICHT NACHGEWIESEN — die Suite kann dort nicht rot werden.");
  } else {
    console.log("Alle geforderten Schutzmechanismen sind nachweislich wirksam — einschliesslich der");
    console.log("drei urspruenglichen Luecken des Korrekturlaufs (M7, M8, M9).");
  }
  process.exit(loecher > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("FATAL:", error && error.stack);
  process.exit(1);
});
