"use strict";

// Helmut — DAUERHAFTE psql-SITZUNG (nur fuer lokale Tests, OP-30).
// =============================================================================================
// WARUM: der Belastungstest misst Durchsatz. Wuerde jede Abfrage einen eigenen `psql`-Prozess
// starten, maesse man vor allem den Prozessstart (rund 25-30 ms gemessen), nicht die
// Warteschlange. Diese Sitzung haelt EINEN psql-Prozess offen und schickt Abfragen ueber die
// Standardeingabe. Damit misst der Belastungstest die Datenbank, nicht den Prozessstart.
//
// WAS DAS NICHT IST: kein Datenbanktreiber fuer Production. Production spricht ausschliesslich
// ueber PostgREST/Supabase (`lib/helmut/storage.js`). Diese Datei liegt bewusst unter
// `scripts/fixtures/` und wird von keinem Production-Pfad geladen.

const { spawn } = require("child_process");

const ENDE = "@@HELMUT_ENDE@@";
const TRENNER = "<@>";   // mehrstellig, damit er nicht in JSON-Nutzlasten vorkommt

function oeffnePsql({ host, port, user, db }) {
  // `stdbuf -o0`: psql puffert seine Ausgabe blockweise, sobald stdout KEIN Terminal ist.
  // Ohne diese Zeile kaeme die Antwort erst beim Prozessende an — die Sitzung wuerde
  // stillstehen. (Belegter Fehler beim Bau dieser Datei am 2026-08-08.)
  const kind = spawn("stdbuf", ["-o0", "psql",
    "-h", host, "-p", String(port), "-U", user, "-d", db,
    "-tA", "-q", "-v", "ON_ERROR_STOP=0", "-F", TRENNER
  ], { stdio: ["pipe", "pipe", "pipe"] });

  let puffer = "";
  let fehlerPuffer = "";
  const warteschlange = [];

  kind.stdout.setEncoding("utf8");
  kind.stderr.setEncoding("utf8");
  kind.stderr.on("data", (d) => { fehlerPuffer += d; });
  kind.stdout.on("data", (d) => {
    puffer += d;
    let pos = puffer.indexOf(ENDE);
    while (pos >= 0) {
      const roh = puffer.slice(0, pos);
      puffer = puffer.slice(pos + ENDE.length);
      const auftrag = warteschlange.shift();
      if (auftrag) {
        const fehler = fehlerPuffer.trim();
        fehlerPuffer = "";
        auftrag.resolve({
          zeilen: roh.split("\n").map((z) => z.trim()).filter((z) => z.length > 0)
            .map((z) => z.split(TRENNER)),
          fehler: fehler || null
        });
      }
      pos = puffer.indexOf(ENDE);
    }
  });

  function frage(sql) {
    return new Promise((resolve) => {
      warteschlange.push({ resolve });
      // Das Semikolon ist PFLICHT. Ohne es haelt psql die Abfrage im Puffer zurueck, fuehrt
      // aber `\echo` sofort aus — die Sitzung meldet dann eine LEERE Antwort, obwohl die
      // Abfrage nie lief. (Belegter Fehler beim Bau dieser Datei am 2026-08-08.)
      const abfrage = String(sql).trim().replace(/;+$/, "");
      kind.stdin.write(abfrage + ";\n" + "\\echo " + ENDE + "\n");
    });
  }

  return {
    frage,
    async wert(sql) { const r = await frage(sql); return r.zeilen.length ? r.zeilen[0][0] : null; },
    schliesse() {
      try { kind.stdin.end(); } catch (_) { /* egal */ }
      try { kind.kill(); } catch (_) { /* egal */ }
    },
    pid: () => kind.pid
  };
}

// Die drei Warteschlangenoperationen als Worker-Abhaengigkeiten — dieselbe Vertragsform, die
// `lib/helmut/storage.js` fuer Production liefert (verfuegbar/auftraege/uebernommen).
function warteschlangeUeberPsql(sitzung) {
  const q = (s) => String(s).replace(/'/g, "''");
  return {
    async claim({ owner, limit = 10, leaseMs = 120000, types = null } = {}) {
      const typArg = types && types.length
        ? "array[" + types.map((t) => "'" + q(t) + "'").join(",") + "]::text[]" : "null";
      const r = await sitzung.frage(
        "select id, job_type, attempts, max_attempts, lease_expires_at, payload, coalesce(tenant_id,''), idempotency_key"
        + " from public.helmut_claim_jobs('" + q(owner) + "', " + Number(limit) + ", " + Number(leaseMs) + ", " + typArg + ")");
      if (r.fehler) return { verfuegbar: false, grund: r.fehler.slice(0, 200), auftraege: [] };
      return {
        verfuegbar: true,
        auftraege: r.zeilen.map((z) => ({
          id: z[0], job_type: z[1], attempts: Number(z[2]), max_attempts: Number(z[3]),
          lease_expires_at: z[4], payload: JSON.parse(z[5] || "{}"), tenant_id: z[6] || null,
          idempotency_key: z[7]
        }))
      };
    },
    async finish({ id, owner, ok, error = null, retryDelayMs = 0 } = {}) {
      const fehlerArg = error == null ? "null" : "'" + q(String(error)) + "'";
      const r = await sitzung.frage(
        "select uebernommen, neuer_status from public.helmut_finish_job('" + q(id) + "','" + q(owner) + "',"
        + (ok ? "true" : "false") + "," + fehlerArg + "," + Math.max(0, Number(retryDelayMs) || 0) + ")");
      if (r.fehler) return { verfuegbar: false, grund: r.fehler.slice(0, 200) };
      const z = r.zeilen[0] || [];
      return { verfuegbar: true, uebernommen: z[0] === "t" || z[0] === "true", status: z[1] || null };
    },
    async extendLease({ id, owner, leaseMs = 120000 } = {}) {
      const r = await sitzung.frage(
        "select public.helmut_extend_job_lease('" + q(id) + "','" + q(owner) + "'," + Number(leaseMs) + ")");
      if (r.fehler) return { verfuegbar: false, grund: r.fehler.slice(0, 200) };
      const w = (r.zeilen[0] || [])[0];
      return { verfuegbar: true, verlaengert: w === "t" || w === "true" };
    }
  };
}

module.exports = { oeffnePsql, warteschlangeUeberPsql, TRENNER };
