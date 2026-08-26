"use strict";

// Helmut — EIN WORKERPROZESS FUER DEN BELASTUNGSTEST (OP-30).
// =============================================================================================
// Dieser Prozess ist ein ECHTER, eigener Worker: eigener Node-Prozess, eigene Datenbank-
// verbindung, eigener Lease-Besitzer. Er ruft `arbeite()` aus `lib/helmut/scalable-pipeline.js`
// auf — also den Produktionscode, nicht eine Nachbildung.
//
// WAS HIER ATTRAPPE IST (und was damit NICHT bewiesen wird):
//   Die Aufgabenhandler tun keine Netz- und keine KI-Arbeit. Sie warten optional eine
//   vorgegebene Zeit (`--arbeitMs`) und melden Erfolg. Der Belastungstest misst deshalb die
//   KAPAZITAET DER WARTESCHLANGE (Reservieren, Lease, Abschluss, Nebenlaeufigkeit) —
//   NICHT die Laufzeit echter Google-Abrufe oder echter KI-Aufrufe.
//
// Ausgabe: eine einzige JSON-Zeile auf stdout, damit der Elternprozess sie einlesen kann.

const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const { oeffnePsql, warteschlangeUeberPsql } = require(path.join(ROOT, "scripts/fixtures/psql-sitzung.js"));
const SP = require(path.join(ROOT, "lib/helmut/scalable-pipeline.js"));

function arg(name, standard) {
  const treffer = process.argv.find((a) => a.startsWith("--" + name + "="));
  return treffer ? treffer.slice(name.length + 3) : standard;
}

async function main() {
  const sitzung = oeffnePsql({
    host: arg("host", ""), port: arg("port", "5432"), user: arg("user", ""), db: arg("db", "")
  });
  const ws = warteschlangeUeberPsql(sitzung);
  const arbeitMs = Number(arg("arbeitMs", "0"));
  const owner = arg("owner", "last-worker");
  const stapel = Number(arg("stapel", "20"));
  const budgetMs = Number(arg("budgetMs", "120000"));

  // FEHLERBEISPIELE JE MANDAT (Skalierungssprint 2026-08-25) — additiv, Default unveraendert.
  // Ohne diese beiden Schalter verhaelt sich der Worker exakt wie bisher; der bestehende
  // scripts/jobqueue-lasttest.js ist davon nicht beruehrt.
  //   --langsamMandat=<id> + --langsamMs=<n>  ein Mandat arbeitet spuerbar langsamer
  //   --fehlerMandat=<id>                     ein Mandat scheitert bei JEDEM Versuch
  // Damit laesst sich pruefen, ob ein krankes Mandat gesunde Mandate beeintraechtigt.
  const langsamMandat = arg("langsamMandat", "");
  const langsamMs = Number(arg("langsamMs", "0"));
  const fehlerMandat = arg("fehlerMandat", "");

  function mandatVon(auftrag) {
    if (auftrag && auftrag.tenant_id) return String(auftrag.tenant_id);
    const p = (auftrag && auftrag.payload) || {};
    return String(p.mandatsId || p.mandat || "");
  }

  const dauern = [];
  let langsameAufrufe = 0;
  let fehlerAufrufe = 0;
  async function handler(auftrag) {
    const t0 = Date.now();
    const mandat = mandatVon(auftrag);
    if (fehlerMandat && mandat === fehlerMandat) {
      fehlerAufrufe += 1;
      dauern.push(Date.now() - t0);
      throw new Error(`simulierter Dauerfehler des Mandats ${fehlerMandat}`);
    }
    let warte = arbeitMs;
    if (langsamMandat && mandat === langsamMandat && langsamMs > 0) {
      warte = langsamMs;
      langsameAufrufe += 1;
    }
    if (warte > 0) await new Promise((r) => setTimeout(r, warte));
    dauern.push(Date.now() - t0);
    return { ok: true, id: auftrag.id };
  }

  const bilanz = await SP.arbeite({
    owner,
    budgetMs,
    leaseMs: Number(arg("leaseMs", "30000")),
    stapel,
    env: { HELMUT_SCALABLE_PIPELINE: "on" },
    deps: {
      claim: ws.claim, finish: ws.finish, extendLease: ws.extendLease,
      handler: {
        source_fetch: handler,
        global_understanding: handler,
        document_understanding: handler,
        mandate_projection: handler,
        briefing_materialization: handler,
        tenant_narrative: handler
      }
    }
  });

  sitzung.schliesse();
  process.stdout.write(JSON.stringify({
    owner,
    reserviert: bilanz.reserviert,
    erledigt: bilanz.erledigt,
    wiederholt: bilanz.wiederholt,
    endgueltigFehlgeschlagen: bilanz.endgueltigFehlgeschlagen,
    nichtUebernommen: bilanz.nichtUebernommen,
    leaseVerloren: bilanz.leaseVerloren,
    dauerMs: bilanz.dauerMs,
    handlerDauerSummeMs: dauern.reduce((s, d) => s + d, 0),
    handlerAufrufe: dauern.length,
    langsameAufrufe,
    fehlerAufrufe
  }) + "\n");
  process.exit(0);
}

main().catch((error) => {
  process.stdout.write(JSON.stringify({ fehler: String((error && error.message) || error) }) + "\n");
  process.exit(1);
});
