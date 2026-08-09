"use strict";

// Helmut — MUTATIONSPROBE DES BUDGETVERTRAGS.
// =============================================================================================
// EINE SUITE, DIE NICHTS ENTDECKT, IST KEIN NACHWEIS.
// `budgetvertrag-test.js` behauptet, den Budgetvertrag zu sichern — insbesondere die eine
// Zusage, an der der Befund R4 gescheitert ist: eine fachliche Modellnutzung wird GENAU EINMAL
// verbucht. Diese Probe beweist, dass die Suite das auch merkt: sie fuehrt den Fehler
// absichtlich wieder ein und verlangt, dass die Suite ROT wird.
//
// WIE: die Migration wird in eine temporaere Kopie geschrieben, dort gezielt verdorben, und
// `budgetvertrag-test.js` laeuft ueber `HELMUT_TEST_BUDGET_MUTATION_SQL` dagegen. Die echte
// Migration im Repository wird NIE veraendert. Die Probe ist bestanden, wenn JEDE Mutation
// erkannt wird (Exit-Code der Suite ungleich 0).
//
// WARUM SIE AUF `-test.js` ENDET: Befund O22 des Abschlussreviews von PR #233 — Proben, die
// nicht so heissen, sammelt kein Gate ein, und die Zusage "Mutationsprobe rot" wird nie
// geprueft. Diese hier wird eingesammelt.
//
// OFFLINE: nur lokales `psql`. Ohne lokalen Server meldet die Probe ausdruecklich OFFEN.

const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ECHT = path.join(ROOT, "supabase", "migrations", "20260808_llm_budget_fairness.sql");

let pass = 0;
let fail = 0;
let offen = 0;
function check(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

// Jede Mutation ist eine EINZELNE, gezielte Verdrehung — keine Sammeloperation. Wird eine
// davon nicht erkannt, ist genau diese Zusage ungeprueft.
const MUTATIONEN = [
  {
    name: "M1 — R4 wieder eingefuehrt: die Fairnessschicht bucht den Tageszaehler selbst",
    von: `  insert into public.llm_reservations (result_key, day, scope, work_class, status, expires_at)
  values (p_result_key, p_day, p_scope, coalesce(p_work_class, 'notwendig'), 'reserviert',
          now() + (greatest(coalesce(p_ttl_ms, 900000), 1000) * interval '1 millisecond'))
  on conflict (result_key) do nothing;`,
    nach: `  insert into public.llm_reservations (result_key, day, scope, work_class, status, expires_at)
  values (p_result_key, p_day, p_scope, coalesce(p_work_class, 'notwendig'), 'reserviert',
          now() + (greatest(coalesce(p_ttl_ms, 900000), 1000) * interval '1 millisecond'))
  on conflict (result_key) do nothing;
  update public.llm_budget_counters c set used = c.used + 1
   where c.day = p_day and c.scope = 'global';`
  },
  {
    name: "M2 — die Rueckgabe wird wirkungslos (Cachetreffer wuerde Budget verbrauchen)",
    von: `  update public.llm_reservations r
     set status = 'zurueckgegeben', settled_at = now(), note = coalesce(p_note, r.note)
   where r.result_key = p_result_key
     and r.status = 'reserviert';`,
    nach: `  update public.llm_reservations r
     set status = 'verbraucht', settled_at = now(), note = coalesce(p_note, r.note)
   where r.result_key = p_result_key
     and r.status = 'reserviert';`
  },
  {
    name: "M3 — der Bereichsdeckel wird nicht mehr geprueft (Mandantenanteil unbegrenzt)",
    von: `  if p_scope_max is not null and v_scope >= greatest(p_scope_max, 0) then`,
    nach: `  if false and p_scope_max is not null and v_scope >= greatest(p_scope_max, 0) then`
  },
  {
    name: "M4 — R4b wieder eingefuehrt: der Bereichsdeckel gilt nicht mehr fuer 'global'",
    von: `  if p_scope_max is not null and v_scope >= greatest(p_scope_max, 0) then`,
    nach: `  if p_scope <> 'global' and p_scope_max is not null and v_scope >= greatest(p_scope_max, 0) then`
  },
  {
    name: "M5 — das globale Notfalllimit wird nicht mehr geprueft",
    von: `  if p_global_max is not null and v_global >= greatest(p_global_max, 0) then`,
    nach: `  if false and p_global_max is not null and v_global >= greatest(p_global_max, 0) then`
  },
  {
    name: "M6 — laufende Reservierungen zaehlen nicht mehr gegen den Tagesdeckel",
    von: `  v_global := coalesce(v_gebucht, 0) + v_offen;`,
    nach: `  v_global := coalesce(v_gebucht, 0);`
  }
];

function main() {
  console.log("=== MUTATIONSPROBE BUDGETVERTRAG ===");

  if (!process.env.HELMUT_TEST_PG_HOST) {
    offen += 1;
    console.log("  OFFEN Mutationsprobe — HELMUT_TEST_PG_HOST ist nicht gesetzt, kein lokaler "
      + "PostgreSQL-Server erreichbar. Die Probe ist AUSDRUECKLICH NICHT GELAUFEN.");
    console.log(`\n== ERGEBNIS ==\nPASS ${pass}  FAIL ${fail}  OFFEN ${offen}`);
    process.exit(0);
  }

  const quelle = fs.readFileSync(ECHT, "utf8");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "helmut-mutation-"));

  // Vorprobe: unveraendert MUSS die Suite gruen sein — sonst misst die Probe nur Rauschen.
  const rein = spawnSync(process.execPath, [path.join(__dirname, "budgetvertrag-test.js")], {
    encoding: "utf8",
    env: { ...process.env, HELMUT_TEST_PG_DB_BUDGETVERTRAG: "helmut_test_mutation_rein" }
  });
  check("0.1 Die unveraenderte Suite ist gruen (Kontrollprobe)", rein.status === 0,
    `Exit ${rein.status}: ${String(rein.stdout || "").split("\n").filter((z) => /FAIL/.test(z)).slice(0, 3).join(" | ")}`);

  MUTATIONEN.forEach((m, i) => {
    if (!quelle.includes(m.von)) {
      check(`${m.name} — Ansatzpunkt gefunden`, false,
        "die zu verdrehende Stelle steht so nicht mehr in der Migration; die Probe waere blind");
      return;
    }
    const datei = path.join(tmp, `mutation-${i}.sql`);
    fs.writeFileSync(datei, quelle.replace(m.von, m.nach), "utf8");
    const lauf = spawnSync(process.execPath, [path.join(__dirname, "budgetvertrag-test.js")], {
      encoding: "utf8",
      env: {
        ...process.env,
        HELMUT_TEST_BUDGET_MUTATION_SQL: datei,
        HELMUT_TEST_PG_DB_BUDGETVERTRAG: `helmut_test_mutation_${i}`
      }
    });
    const rot = lauf.status !== 0;
    const rote = String(lauf.stdout || "").split("\n").filter((z) => /^\s+FAIL/.test(z));
    check(m.name, rot, rot ? "" : "die Suite blieb GRUEN — diese Zusage ist ungeprueft");
    if (rot) console.log(`        erkannt durch ${rote.length} rote Pruefung(en): ${rote[0].trim().slice(0, 90)}`);
  });

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* egal */ }
  try {
    for (let i = 0; i < MUTATIONEN.length; i += 1) {
      execFileSync("psql", ["-h", process.env.HELMUT_TEST_PG_HOST, "-p", process.env.HELMUT_TEST_PG_PORT || "5433",
        "-U", process.env.HELMUT_TEST_PG_USER || "helmut", "-d", "postgres", "-tAc",
        `drop database if exists helmut_test_mutation_${i}`], { stdio: "ignore" });
    }
    execFileSync("psql", ["-h", process.env.HELMUT_TEST_PG_HOST, "-p", process.env.HELMUT_TEST_PG_PORT || "5433",
      "-U", process.env.HELMUT_TEST_PG_USER || "helmut", "-d", "postgres", "-tAc",
      "drop database if exists helmut_test_mutation_rein"], { stdio: "ignore" });
  } catch (_) { /* egal */ }

  console.log("\n== ERGEBNIS ==");
  console.log(`PASS ${pass}  FAIL ${fail}  OFFEN ${offen}  (gesamt ${pass + fail + offen})`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
