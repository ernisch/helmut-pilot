"use strict";

// Helmut — AKTIVIERUNGSSCHUTZ des skalierbaren Pfads (OP-30, Auftrag §13).
// =============================================================================================
// Diese Suite prueft die eine Zusage, von der alle anderen abhaengen:
//
//   OHNE `HELMUT_SCALABLE_PIPELINE` verhaelt sich Helmut FUNKTIONAL UNVERAENDERT.
//
// Sie prueft das nicht durch Ausprobieren, sondern am QUELLTEXT und an der Pfadwahl — denn
// ein Verhaltenstest koennte einen Pfad uebersehen, den es nur unter Production-Bedingungen
// gibt. Beides zusammen ist der Riegel.
//
// Offline, ohne Netz, ohne KI, ohne Ablage.

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

const SP = require(path.join(ROOT, "lib", "helmut", "scalable-pipeline.js"));

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}
function abschnitt(t) { console.log(`\n== ${t} ==`); }

const serverSrc = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
const pipelineSrc = fs.readFileSync(path.join(ROOT, "lib/helmut/scalable-pipeline.js"), "utf8");

function main() {
  console.log("Helmut — Aktivierungsschutz skalierbarer Pfad (OP-30)");

  abschnitt("1 · Default AUS, fail closed");
  check("1.1 Ohne Env-Variable ist der Pfad aus", SP.skalierbarerPfadAktiv({}) === false);
  check("1.2 Ohne den Schluessel im echten process.env ist der Pfad aus",
    ("HELMUT_SCALABLE_PIPELINE" in process.env) ? true : SP.skalierbarerPfadAktiv() === false);
  for (const wert of ["", " ", "off", "OFF", "false", "0", "nein", "onn", "no", "shadow", "an ja"]) {
    check(`1.3 Wert ${JSON.stringify(wert)} bedeutet AUS`, SP.skalierbarerPfadAktiv({ HELMUT_SCALABLE_PIPELINE: wert }) === false);
  }
  for (const wert of ["on", "ON", " on ", "true", "1", "an"]) {
    check(`1.4 Wert ${JSON.stringify(wert)} bedeutet AN`, SP.skalierbarerPfadAktiv({ HELMUT_SCALABLE_PIPELINE: wert }) === true);
  }

  abschnitt("2 · Alter und neuer Pfad schliessen einander aus (§13.4)");
  check("2.1 Die Pfadwahl liefert genau einen Wert",
    ["bestand", "warteschlange"].includes(SP.waehleVerarbeitungspfad({}).pfad));
  check("2.2 Flag aus -> Bestandspfad", SP.waehleVerarbeitungspfad({}).pfad === "bestand");
  check("2.3 Flag an -> Warteschlange", SP.waehleVerarbeitungspfad({ HELMUT_SCALABLE_PIPELINE: "on" }).pfad === "warteschlange");
  {
    // In server.js muss der neue Zweig ein RETURN sein — sonst liefen beide.
    const stelle = serverSrc.indexOf("function cronSchwererPfad");
    const fn = serverSrc.slice(stelle, stelle + 1800);
    check("2.4 cronSchwererPfad prueft das neue Flag", /skalierbarerPfadAktiv\(\)/.test(fn));
    check("2.5 Der neue Zweig ist ein RETURN (kein Weiterlaufen in den Altpfad)",
      /if \(scalablePipeline\.skalierbarerPfadAktiv\(\)\) \{\s*\n\s*return runCronUeberWarteschlange/.test(fn), fn.slice(0, 200));
    const idxNeu = fn.indexOf("skalierbarerPfadAktiv");
    const idxAlt = fn.indexOf("cronGlobalphase.waehleCronPfad");
    check("2.6 Die neue Pruefung steht VOR der bisherigen Pfadwahl",
      idxNeu > 0 && idxAlt > 0 && idxNeu < idxAlt, `${idxNeu} vs ${idxAlt}`);
  }

  abschnitt("3 · Ohne Flag passiert NICHTS (kein IO, kein Zustand)");
  {
    // Der Block vor der bisherigen Pfadwahl darf ausser der Flagabfrage nichts tun.
    const stelle = serverSrc.indexOf("function cronSchwererPfad");
    const bisAltpfad = serverSrc.slice(stelle, serverSrc.indexOf("const wahl = cronGlobalphase.waehleCronPfad();", stelle));
    const codeZeilen = bisAltpfad.split("\n")
      .map((z) => z.replace(/\/\/.*$/, "").trim())
      .filter(Boolean)
      .filter((z) => !z.startsWith("function cronSchwererPfad"));
    check("3.1 Vor der bisherigen Pfadwahl stehen nur Flagabfrage und Rueckgabe",
      codeZeilen.length <= 3, JSON.stringify(codeZeilen));
    check("3.2 Es gibt dort keinen await, kein require, keine Abfrage",
      !/await |require\(|listFullProfiles|jobQueue/.test(codeZeilen.join(" ")), codeZeilen.join(" "));
  }
  check("3.3 planeArbeit steigt ohne Flag sofort aus", /if \(!skalierbarerPfadAktiv\(env\)\) \{[\s\S]{0,200}?uebersprungen: true/.test(pipelineSrc));
  check("3.4 arbeite steigt ohne Flag sofort aus",
    (pipelineSrc.match(/if \(!skalierbarerPfadAktiv\(env\)\) \{/g) || []).length >= 2);

  abschnitt("4 · Das Flag ist NICHT in der Dateiallowlist (nur Betreiber ueber Vercel-Env)");
  {
    const flags = JSON.parse(fs.readFileSync(path.join(ROOT, "helmut-flags.json"), "utf8"));
    check("4.1 HELMUT_SCALABLE_PIPELINE steht NICHT in helmut-flags.json",
      !("HELMUT_SCALABLE_PIPELINE" in flags), Object.keys(flags).join(","));
    const flagsSrc = fs.readFileSync(path.join(ROOT, "lib/helmut/flags.js"), "utf8");
    check("4.2 Es steht auch nicht in der Code-Allowlist von flags.js",
      !/HELMUT_SCALABLE_PIPELINE/.test(flagsSrc));
    // Dieselbe Begruendung wie bei HELMUT_CRON_GLOBALABRUF: ein Flag, das externe Arbeit
    // scharf schaltet, darf nicht per Datei-Commit aktivierbar sein.
    check("4.3 Der Vergleichsfall HELMUT_CRON_GLOBALABRUF steht ebenfalls nicht in der Allowlist",
      !("HELMUT_CRON_GLOBALABRUF" in flags));
  }

  abschnitt("5 · Der Rueckweg bleibt jederzeit moeglich (§13.7)");
  check("5.1 Der Rueckweg ist eine reine Env-Aenderung — der Code kennt keinen Zustand,"
    + " der ihn verhindern koennte",
    !/persist.*SCALABLE|SCALABLE.*persist|einmal.*aktiviert/i.test(pipelineSrc));
  check("5.2 Es gibt keine Migration, die den Altpfad entfernt",
    fs.readdirSync(path.join(ROOT, "supabase/migrations"))
      .filter((f) => f.startsWith("20260808"))
      .every((f) => {
        const t = fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8");
        return !/drop table (if exists )?public\.(raw_documents|knowledge_objects|matching_results|decisions|briefings|crawl_runs|process_runs|llm_usage|pipeline_locks)\b/i.test(t);
      }));
  check("5.3 Die neue Migration legt NUR die Warteschlange an (additiv)",
    (() => {
      const t = fs.readFileSync(path.join(ROOT, "supabase/migrations/20260808_scalable_job_queue.sql"), "utf8");
      const tabellen = [...t.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]);
      const alter = [...t.matchAll(/alter table public\.(\w+)/g)].map((m) => m[1]);
      return tabellen.length === 1 && tabellen[0] === "helmut_jobs"
        && alter.every((a) => a === "helmut_jobs");
    })());

  abschnitt("6 · Der laufende OP-25-Pfad bleibt unangetastet (§13.8)");
  check("6.1 cron-globalphase.js wurde nicht veraendert",
    !/SCALABLE_PIPELINE/.test(fs.readFileSync(path.join(ROOT, "lib/helmut/cron-globalphase.js"), "utf8")));
  check("6.2 vorgangskontext.js wurde nicht veraendert",
    !/SCALABLE_PIPELINE/.test(fs.readFileSync(path.join(ROOT, "lib/helmut/vorgangskontext.js"), "utf8")));
  check("6.3 cron-fairness.js wurde nicht veraendert",
    !/SCALABLE_PIPELINE/.test(fs.readFileSync(path.join(ROOT, "lib/helmut/cron-fairness.js"), "utf8")));
  check("6.4 runGlobaleErfassung und runMandatsProjektion existieren unveraendert weiter",
    (() => {
      const sched = require(path.join(ROOT, "lib/helmut/scheduler.js"));
      return typeof sched.runGlobaleErfassung === "function" && typeof sched.runMandatsProjektion === "function";
    })());
  check("6.5 Die Cron-Zeiten in vercel.json sind unveraendert",
    (() => {
      const v = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
      return Array.isArray(v.crons) && v.crons.length === 9;
    })(), "erwartet 9 Cron-Eintraege");
  check("6.6 Es wurde KEIN neuer Cron-Eintrag ergaenzt",
    !/jobqueue|scalable|worker/i.test(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")));

  abschnitt("7 · Betriebsstatus: lesend, autorisiert, ohne Nutzdaten");
  check("7.1 Der Statusendpunkt existiert", serverSrc.includes('url.pathname === "/api/ops/jobqueue"'));
  {
    // BELEGTER FEHLER DIESER PRUEFUNG (Sprint Aktivierungsreife 2026-08-09): der Block war
    // fest auf 900 Zeichen geschnitten. Als der Endpunkt um die Readiness des Workers und
    // die Wiedervorlage-Vorschau ergaenzt wurde, rutschte `pfadAktiv` aus dem Fenster — und
    // 7.3 wurde rot, OBWOHL der Flagzustand unveraendert gemeldet wird. Eine Pruefung, die
    // an einer Zeichenzahl haengt, prueft die Laenge und nicht die Zusage.
    // Jetzt wird bis zur NAECHSTEN Route geschnitten, also genau der Handler.
    const stelle = serverSrc.indexOf('url.pathname === "/api/ops/jobqueue"');
    const naechste = serverSrc.indexOf("if (url.pathname ===", stelle + 10);
    const block = serverSrc.slice(stelle, naechste > stelle ? naechste : stelle + 2000);
    check("7.2 Er ist mit dem CRON_SECRET autorisiert (fail closed)", /authorizeCron\(request, url, response\)/.test(block));
    check("7.3 Er meldet den Flagzustand mit", /pfadAktiv/.test(block));
    // `wiedervorlage` steht hier ausdruecklich als TROCKENLAUF (`trockenlauf: true`) und
    // aendert deshalb nichts — die Schreibvokabeln unten duerfen trotzdem nicht vorkommen.
    check("7.4 Er schreibt nichts", !/save|insert|update|delete|enqueue|claim|finish/i.test(block)
      && /trockenlauf:\s*true/.test(block));
  }
  check("7.5 Der Betriebsstatus gibt keine Nutzdaten aus (nur Zaehler und Zustaende)",
    (() => {
      const stelle = pipelineSrc.indexOf("async function betriebsstatus");
      const fn = pipelineSrc.slice(stelle, pipelineSrc.indexOf("module.exports", stelle));
      return !/payload|quelle|fullName|dokumente|last_error/.test(fn);
    })());

  abschnitt("8 · Keine neue Abhaengigkeit, kein neuer Dienst");
  {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    check("8.1 package.json hat weiterhin genau eine Abhaengigkeit",
      Object.keys(pkg.dependencies || {}).length === 1 && "ical.js" in pkg.dependencies,
      JSON.stringify(pkg.dependencies));
    check("8.2 Es gibt keine devDependencies", !pkg.devDependencies || Object.keys(pkg.devDependencies).length === 0);
  }
  check("8.3 Die Migration aktiviert KEINE Postgres-Extension",
    (() => {
      // Nur SQL-ANWEISUNGEN pruefen, keine Kommentare: der Migrationskopf begruendet die
      // Technikentscheidung und nennt `create extension` dabei ausdruecklich (naemlich als
      // das, was hier NICHT getan wird). Ein reiner Textvergleich wuerde die Begruendung
      // als Verstoss werten — derselbe Fehler wie in source-demand-test.js 7.3.
      const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/20260808_scalable_job_queue.sql"), "utf8");
      const nurSql = sql.split("\n").map((z) => z.replace(/--.*$/, "")).join("\n");
      return !/create\s+extension/i.test(nurSql);
    })());
  check("8.4 Die neuen Module benutzen nur Node-Kernmodule",
    (() => {
      const module_ = [pipelineSrc, fs.readFileSync(path.join(ROOT, "lib/helmut/source-demand.js"), "utf8")];
      const erlaubt = new Set(["crypto"]);
      return module_.every((src) => [...src.matchAll(/require\("([^".]+)"\)/g)]
        .every((m) => erlaubt.has(m[1])));
    })());

  console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  (gesamt ${pass + fail})`);
  process.exit(fail === 0 ? 0 : 1);
}

try { main(); } catch (e) { console.error("TESTLAUF-FEHLER:", e && e.stack); process.exit(1); }
