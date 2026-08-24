"use strict";

// Profilpaket 25 — byte-genaue Verifikation der amtlichen Profilquellen.
//
// ZWECK: Prueft je Profil des Importpakets die amtliche Parlaments-Profilseite
// (HTTP-Erreichbarkeit, Host, Namenspraesenz im Seitentext) gegen die ECHTE Adresse.
// Das ist der in CLAUDE.md §4.3 verlangte Beleg, den eine Cloud-Sitzung mit
// Egress-Sperre nicht erbringen kann (Praezedenzfall: Sprint 9B, 2026-07-14).
//
// SICHERHEIT / GRENZEN (bewusst, nach dem Muster von sprint9b-verify):
//   - KEINE Secrets, KEINE Supabase-Verbindung, KEINE Production-Daten, KEIN Import.
//   - Prueft nur OEFFENTLICHE Adressen. Realistischer User-Agent, TLS bleibt an;
//     KEIN Umgehen technischer Zugriffsbeschraenkungen.
//   - FAIL CLOSED OFFLINE: ohne HELMUT_PROFILVERIFIKATION=on macht das Script NICHTS
//     ausser einer Erklaerung. Der Offline-Testlauf kann es also nie versehentlich
//     ausfuehren (es ist zusaetzlich kein *-test.js).
//   - Ergebnis je Profil: bestaetigt / name_nicht_gefunden / umgeleitet /
//     nicht_erreichbar / uebersprungen. Ein Nicht-200 ist ein gueltiges Ergebnis,
//     kein Scriptfehler (Exit 0, damit der Actions-Lauf die Artefakte hochlaedt).
//
// AUFRUF (nur im freigegebenen GitHub-Actions-Lauf oder lokal durch den Betreiber):
//   HELMUT_PROFILVERIFIKATION=on node scripts/profil-quellen-verifikation.js \
//     --datei data/mandatsprofile/brandenburg-25-kandidaten.json \
//     --out profilverifikation-report.json

const fs = require("fs");
const path = require("path");

const ERLAUBT = String(process.env.HELMUT_PROFILVERIFIKATION || "").toLowerCase() === "on";
const TIMEOUT_MS = Math.max(1000, parseInt(process.env.PV_TIMEOUT_MS || "15000", 10) || 15000);
const ABSTAND_MS = Math.max(0, parseInt(process.env.PV_ABSTAND_MS || "1500", 10) || 1500);
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 (Profilverifikation; Kontakt via Repository)";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

// Ein Name gilt als gefunden, wenn er (unicode-normalisiert, whitespace-tolerant,
// auch in der Reihenfolge "Nachname, Vorname") im entkernten Seitentext vorkommt.
function normalisiere(s) {
  return String(s || "")
    .normalize("NFC")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}
function nameVarianten(profil) {
  const v = [profil.vollname, ...(profil.namensvarianten || [])].filter(Boolean);
  const teile = String(profil.vollname || "").trim().split(/\s+/);
  if (teile.length >= 2) {
    v.push(`${teile[teile.length - 1]}, ${teile.slice(0, -1).join(" ")}`);
  }
  return v.map(normalisiere).filter(Boolean);
}

async function pruefeUrl(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "manual",
      signal: ctrl.signal,
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    });
    if (res.status >= 300 && res.status < 400) {
      return { status: res.status, ziel: res.headers.get("location") || "", body: "" };
    }
    const body = res.ok ? await res.text() : "";
    return { status: res.status, ziel: "", body };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const dateiPfad = arg("datei", "data/mandatsprofile/brandenburg-25-kandidaten.json");
  const outPfad = arg("out", "profilverifikation-report.json");

  if (!ERLAUBT) {
    console.log(
      "Profilquellen-Verifikation NICHT ausgefuehrt: HELMUT_PROFILVERIFIKATION ist nicht 'on'.\n" +
        "Dieses Script macht echte Netzabrufe auf landtag.brandenburg.de und laeuft nur im\n" +
        "ausdruecklich freigegebenen Lauf (GitHub Actions 'Profilquellen-Verifikation' oder\n" +
        "Betreiber-Terminal). Siehe docs/betrieb/fundament-25-mandate-2026-08-24.md §2.4."
    );
    process.exit(0);
  }

  const roh = JSON.parse(fs.readFileSync(path.resolve(dateiPfad), "utf8"));
  const profile = Array.isArray(roh.profile) ? roh.profile : [];
  const ergebnisse = [];

  for (const p of profile) {
    const amtlich = (p.offizielleQuellen || []).find((q) => q && q.art === "parlament-profil");
    const eintrag = { mandatsId: p.mandatsId, vollname: p.vollname, url: amtlich ? amtlich.url : "" };
    if (!amtlich || !/^https:\/\/(www\.)?landtag\.brandenburg\.de\//.test(String(amtlich.url || ""))) {
      eintrag.urteil = "uebersprungen";
      eintrag.grund = "keine amtliche landtag.brandenburg.de-Quelle im Profil";
      ergebnisse.push(eintrag);
      continue;
    }
    try {
      const r = await pruefeUrl(amtlich.url);
      if (r.ziel) {
        eintrag.urteil = "umgeleitet";
        eintrag.http = r.status;
        eintrag.ziel = r.ziel;
      } else if (r.status !== 200) {
        eintrag.urteil = "nicht_erreichbar";
        eintrag.http = r.status;
      } else {
        const text = normalisiere(r.body);
        const gefunden = nameVarianten(p).some((n) => text.includes(n));
        eintrag.urteil = gefunden ? "bestaetigt" : "name_nicht_gefunden";
        eintrag.http = 200;
      }
    } catch (e) {
      eintrag.urteil = "nicht_erreichbar";
      eintrag.grund = String(e && e.message ? e.message : e);
    }
    ergebnisse.push(eintrag);
    await new Promise((res) => setTimeout(res, ABSTAND_MS)); // hoefliche Abrufrate
  }

  const zaehlung = ergebnisse.reduce((m, e) => {
    m[e.urteil] = (m[e.urteil] || 0) + 1;
    return m;
  }, {});
  const report = {
    lauf: { zweck: "Profilpaket-25-Quellenverifikation", datei: dateiPfad, timeoutMs: TIMEOUT_MS },
    zaehlung,
    ergebnisse,
  };
  fs.writeFileSync(outPfad, JSON.stringify(report, null, 2));

  console.log("== Profilquellen-Verifikation ==");
  for (const e of ergebnisse) {
    console.log(`${String(e.urteil).padEnd(22)} ${e.mandatsId}  ${e.url}${e.ziel ? " -> " + e.ziel : ""}`);
  }
  console.log("Zaehlung:", JSON.stringify(zaehlung));
  console.log(`Report: ${outPfad}`);
  // Exit 0 auch bei Abweichungen: gueltige Ergebnisse, kein CI-Fehler (Muster Sprint 9B).
}

main().catch((e) => {
  console.error("Unerwarteter Scriptfehler:", e);
  process.exit(1);
});
