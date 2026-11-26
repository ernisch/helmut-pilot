"use strict";

const { readFileSync } = require("node:fs");
const { erzeugePlanungsrest } = require("../../lib/helmut/quellen-planungsrest");

// Die Eingabe kommt aus genau einer lesenden SQL-Abfrage des gebundenen Stores.
// Der Plan mit seinen Mandatsdaten bleibt im Prozess. Nur der DB-Digest wird ausgegeben.
async function main() {
  const tag = process.argv[2];
  const { id, data, digest } = JSON.parse(readFileSync(0, "utf8"));
  if (!/^[a-f0-9]{64}$/.test(digest)) throw Error("tagesplan-digest");
  const journal = erzeugePlanungsrest({ storeId: "main", request: async () => [{ id, data }] });
  const plan = await journal.lesen(tag);
  if (plan?.zustand !== "fertig") throw Error("tagesplan-unvollstaendig");
  console.log(digest);
}

main().catch(() => {
  console.error("Altbestand: gebundener, vollständiger Tagesplan fehlt");
  process.exitCode = 1;
});
