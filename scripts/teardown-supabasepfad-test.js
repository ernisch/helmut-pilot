#!/usr/bin/env node
"use strict";

// Helmut — VERHALTENSTEST DES TEARDOWN-SUPABASEPFADES.
// =============================================================================
// ANLASS: Zwei Anläufe, denselben Defekt zu beheben, sind gescheitert — und die
// Tests haben es beide Male NICHT gemerkt, weil sie Quelltext-Regexe waren.
//
//   1. Ursprung (§28): `deleteTenantScopedData` schrieb den leeren Mandanten-Store
//      UNBEDINGT zurück. Das ist ein Upsert — der „Teardown" der 400er-Gruppe hätte
//      400 Dauerzeilen ANGELEGT.
//   2. Erster Korrekturversuch (§31.9): `readStore(...)` + Bedingung. Wirkungslos,
//      denn `readSupabaseStore` legt eine fehlende Zeile BEIM LESEN selbst an. Der
//      Fix verschob das Anlegen nur vom Schreib- auf den Lesevorgang.
//
// Diese Suite prüft deshalb das VERHALTEN des Supabase-Pfades: sie stellt einen
// Zähl-`fetch` unter die Speicherschicht und zählt, welche HTTP-Methoden gegen
// `helmut_store` gehen. Kein echtes Netz, keine echten Zugangsdaten, keine
// Production — die Basis-URL ist eine ungültige Testadresse, und der Ersatz-`fetch`
// antwortet vollständig aus dem Speicher.

const path = require("path");
const ROOT = path.join(__dirname, "..");

let pass = 0;
let fail = 0;
function check(name, bedingung, zusatz = "") {
  if (bedingung) { pass += 1; console.log(`  PASS  ${name}${zusatz ? ` — ${zusatz}` : ""}`); }
  else { fail += 1; console.log(`  FAIL  ${name}${zusatz ? ` — ${zusatz}` : ""}`); }
}

// ── Der Zähl-`fetch` ────────────────────────────────────────────────────────
// Er beantwortet jede Anfrage aus dem Speicher und schreibt jede einzelne mit.
// `zeilen` ist die vorgetäuschte Tabelle `helmut_store`.
function baueFetch({ zeilen }) {
  const aufrufe = [];
  const echterFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const methode = String((options && options.method) || "GET").toUpperCase();
    const pfad = String(url);
    aufrufe.push({ methode, pfad, koerper: options && options.body ? String(options.body) : null });
    if (/\/rest\/v1\/helmut_store/.test(pfad)) {
      const rows = new Map(Object.entries(zeilen));
      const result = require("./fixtures/store-rest-memory")(rows, url, options);
      for (const [id, data] of rows) zeilen[id] = data;
      return antwort(result.body, result.status);
    }
    // Alles andere (V3-Tabellen, Auth, Fairness) beantworten wir leer.
    return antwort([]);
  };
  return { aufrufe, wiederherstellen: () => { globalThis.fetch = echterFetch; } };
}

function antwort(daten, status = 200) {
  return {
    ok: status < 400, status,
    json: async () => daten,
    text: async () => JSON.stringify(daten),
    headers: { get: () => "application/json" }
  };
}

async function main() {
  console.log("=== VERHALTENSTEST: Teardown im SUPABASE-Pfad (gestubbtes fetch) ===");

  // Ausdrücklich UNGÜLTIGE Testwerte. Sie erreichen kein Netz — der Ersatz-`fetch`
  // fängt jede Anfrage ab. Ohne sie liefe die Speicherschicht im lokalen Pfad und
  // der zu prüfende Zweig würde gar nicht ausgeführt.
  process.env.HELMUT_STORAGE_BACKEND = "supabase";
  process.env.SUPABASE_URL = "https://teardown-test.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "offline-test-nur-gestubbt";

  const storage = require(path.join(ROOT, "lib/helmut/storage.js"));
  const uid = "test-kohorte-c-001";
  // Die Zeilenkennung, die `readSupabaseStore` bildet: `${supabaseStoreId}-${storeKey}`
  // mit storeKey `p-<uid>`. In der Testumgebung ist `supabaseStoreId` = "main".
  const pKey = `main-p-${uid}`;

  // ── A · Der Fall, der 400 Zeilen angelegt hätte ─────────────────────────
  // Ein Mandant OHNE bestehenden Store. Ein korrekter Teardown darf hier
  // KEINE Zeile in `helmut_store` anlegen.
  console.log("\nA · Teardown eines Mandanten OHNE bestehenden Mandanten-Store");
  const zeilen = {};                       // die Tabelle ist leer
  const stub = baueFetch({ zeilen });
  try {
    await storage.deleteTenantScopedData(uid).catch(() => null);
  } finally {
    stub.wiederherstellen();
  }

  const storeAufrufe = stub.aufrufe.filter((a) => /\/rest\/v1\/helmut_store/.test(a.pfad));
  const schreibend = storeAufrufe.filter((a) => a.methode !== "GET");
  const aufPKey = schreibend.filter((a) => decodeURIComponent(a.pfad).includes(`id=eq.${pKey}`)
    || (a.koerper || "").includes(`"${pKey}"`));

  const pKeyAufrufe = storeAufrufe.filter((a) => decodeURIComponent(a.pfad).includes(pKey)
    || (a.koerper || "").includes(`"${pKey}"`));
  check("A1 der Teardown fragt den Mandanten-Store rein LESEND ab",
    pKeyAufrufe.length > 0 && pKeyAufrufe.every((a) => a.methode === "GET"),
    `${pKeyAufrufe.length} Aufruf(e) auf ${pKey}, davon `
      + `${pKeyAufrufe.filter((a) => a.methode !== "GET").length} schreibend`);
  check("A2 er löst dabei KEINEN Schreibvorgang auf den Mandanten-Store aus",
    aufPKey.length === 0,
    aufPKey.length ? `${aufPKey.length} Schreibvorgänge: ${aufPKey.map((a) => a.methode).join(", ")}` : "0");
  check("A3 und die Zeile existiert danach immer noch NICHT — nichts wurde angelegt",
    !Object.prototype.hasOwnProperty.call(zeilen, pKey),
    `angelegte Zeilen: ${Object.keys(zeilen).join(", ") || "(keine)"}`);
  // Der Main Leser legt seit dem 06.09. keine Zeile mehr an. Der uebergeordnete
  // Teardown kann weiterhin Bestandsmetadaten in main-auth schreiben.
  check("A4 die einzigen angelegten Zeilen sind die Bestandsstores, KEINE Kohortenzeile",
    Object.keys(zeilen).every((id) => !id.includes("test-kohorte-")),
    `angelegt: ${Object.keys(zeilen).join(", ") || "(keine)"}`);

  // ── B · Die Gegenprobe: ein Mandant MIT Daten wird geleert ──────────────
  console.log("\nB · Gegenprobe — ein Mandant MIT Daten muss geleert werden");
  const zeilen2 = { [pKey]: { briefings: [{ id: "x" }], vorgaenge: [{ id: "y" }] } };
  const stub2 = baueFetch({ zeilen: zeilen2 });
  try {
    await storage.deleteTenantScopedData(uid).catch(() => null);
  } finally {
    stub2.wiederherstellen();
  }
  const schreib2 = stub2.aufrufe.filter((a) => /\/rest\/v1\/helmut_store/.test(a.pfad)
    && a.methode !== "GET" && (decodeURIComponent(a.pfad).includes(`id=eq.${pKey}`)
      || (a.koerper || "").includes(`"${pKey}"`)));
  check("B1 ein Store MIT Daten wird sehr wohl geleert",
    schreib2.length > 0, `${schreib2.length} Schreibvorgang/-vorgänge`);
  check("B2 danach trägt er keine Nutzdaten mehr",
    !Object.values(zeilen2[pKey] || {}).some((v) => Array.isArray(v) && v.length > 0));

  // ── C · Der Unterschied ist genau die Bedingung ─────────────────────────
  console.log("\nC · Der Unterschied zwischen A und B ist die Existenzprüfung");
  check("C1 leerer Store ⇒ 0 Schreibvorgänge · voller Store ⇒ mindestens 1",
    aufPKey.length === 0 && schreib2.length > 0,
    `${aufPKey.length} gegen ${schreib2.length}`);

  console.log(`\n${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
}

main().catch((fehler) => {
  console.error("Abbruch:", (fehler && fehler.message) || fehler);
  process.exit(1);
});
