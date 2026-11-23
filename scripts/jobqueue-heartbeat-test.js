"use strict";

const assert = require("node:assert/strict");
const { setTimeout: sleep } = require("node:timers/promises");
const { fuehreAuftragAus } = require("../lib/helmut/scalable-pipeline");

async function pruefe(leaseAntwort, sollAbschluss) {
  let pulsschlaege = 0;
  let abschluesse = 0;
  const jetzt = Date.now;
  const job = { id: "heartbeat-probe", job_type: "source_fetch", attempts: 1, max_attempts: 3,
    lease_expires_at: new Date(jetzt() + 4000).toISOString(), payload: {} };
  const deps = {
    env: { HELMUT_SCALABLE_PIPELINE: "off" },
    now: jetzt,
    handler: { source_fetch: async (_job, _deps, context) => {
      await sleep(1300, undefined, { signal: context.auftragsSignal });
      return { ok: true };
    } },
    extendLease: async args => {
      assert.equal(args.id, job.id);
      assert.equal(args.owner, "heartbeat-besitzer");
      pulsschlaege += 1;
      return leaseAntwort;
    },
    finish: async args => {
      assert.equal(args.owner, "heartbeat-besitzer");
      assert.equal(args.ok, true);
      abschluesse += 1;
      return { verfuegbar: true, uebernommen: true, neuerStatus: "erledigt" };
    }
  };
  const ergebnis = await fuehreAuftragAus({
    auftrag: job, deps, besitzer: "heartbeat-besitzer", leaseMs: 4000, restzeitMs: 3000
  });
  assert.equal(pulsschlaege, 1);
  assert.equal(abschluesse, sollAbschluss === "erledigt" ? 1 : 0);
  assert.equal(ergebnis.ausgang, sollAbschluss);
}

(async () => {
  await pruefe({ verfuegbar: true, verlaengert: true }, "erledigt");
  await pruefe({ verfuegbar: true, verlaengert: false }, "lease-verloren");
  await pruefe({ verfuegbar: false }, "lease-unbestaetigt");
  console.log("3/3 Heartbeat-Gegenproben bestanden");
})().catch(error => { console.error(error); process.exitCode = 1; });
