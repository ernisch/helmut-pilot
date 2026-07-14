"use strict";

// Sprint 9B — wandelt den JSON-Report (scripts/sprint9b-verify-abrufwege.js --out) in eine
// lesbare Markdown-Zusammenfassung. Reine Transformation, kein Netz, keine Secrets.
// Aufruf: node scripts/sprint9b-summary.js <report.json> [--out <summary.md>]

const fs = require("fs");

const ORDER = ["geeignet", "geeignet mit Einschränkung", "ablehnen", "nicht_verifizierbar"];
const ICON = {
  "geeignet": "✅",
  "geeignet mit Einschränkung": "🟡",
  "ablehnen": "⛔",
  "nicht_verifizierbar": "⚪"
};

function esc(s) { return String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\n/g, " "); }

function buildSummaryMarkdown(report) {
  const rows = Array.isArray(report.rows) ? report.rows : [];
  const zaehl = report.zaehl || rows.reduce((a, r) => { a[r.urteil] = (a[r.urteil] || 0) + 1; return a; }, {});
  const lines = [];

  lines.push("# Sprint 9B — Verifikation der Abrufwege");
  lines.push("");
  lines.push(`- **Erzeugt:** ${esc(report.generatedAt || "?")}`);
  lines.push(`- **Egress:** ${report.egressOffen ? "OFFEN — echte Zielserver-Prüfung durchgeführt" : "GESPERRT — Zielserver NICHT erreicht"}`);
  if (report.controlStatuses) lines.push(`- **Kontroll-Abruf:** ${esc(report.controlStatuses.join(" · "))}`);
  lines.push(`- **Aktualitätsfenster:** jüngstes Item ≤ ${report.fresh_days != null ? report.fresh_days : "?"} Tage`);
  lines.push(`- **Real verifiziert:** ${report.verifiziert != null ? report.verifiziert : "?"} / ${report.total != null ? report.total : rows.length}`);
  lines.push("");

  lines.push("## Urteile");
  lines.push("");
  lines.push("| Urteil | Anzahl |");
  lines.push("|--------|-------:|");
  for (const k of ORDER) lines.push(`| ${ICON[k]} ${k} | ${zaehl[k] || 0} |`);
  lines.push("");

  if (!report.egressOffen) {
    lines.push("> ⚠️ **Egress war gesperrt** — keine der 25 Adressen wurde real erreicht; es wurde **kein Urteil erfunden**. Diesen Workflow in einer Umgebung mit offenem Egress ausführen.");
    lines.push("");
  }

  const gruppen = [["Berlin", (r) => r.gruppe === "BE" || r.gruppe === "BE+BB"], ["Brandenburg", (r) => r.gruppe === "BB"], ["Bund (Reparaturwege)", (r) => r.gruppe === "BUND"]];
  for (const [titel, filt] of gruppen) {
    const g = rows.filter(filt);
    if (!g.length) continue;
    lines.push(`## ${titel} (${g.length})`);
    lines.push("");
    lines.push("| Weg | krit. | Methode | Urteil | HTTP | Originaladresse (final) | Belege / Note |");
    lines.push("|-----|:---:|---------|--------|:----:|-------------------------|---------------|");
    for (const r of g) {
      const http = r.status == null ? "—" : String(r.status);
      const finalUrl = r.finalUrl && r.finalUrl !== r.angefragteUrl ? r.finalUrl : (r.finalUrl || "—");
      const belege = Array.isArray(r.belege) && r.belege.length ? r.belege.join("; ") : "";
      const note = r.note || "";
      const evid = [belege, note].filter(Boolean).join(" — ");
      lines.push(`| ${esc(r.id)} | ${r.critical ? "⚠" : ""} | ${esc(r.method)} | ${ICON[r.urteil] || ""} ${esc(r.urteil)} | ${http} | ${esc(finalUrl).slice(0, 80)} | ${esc(evid).slice(0, 300)} |`);
    }
    lines.push("");
  }

  lines.push("## Nächste Schritte (nur nach Freigabe)");
  lines.push("");
  lines.push("- `ablehnen` / Landing-/Hub-/Root-Wege vor jeder Aktivierung per Feed-Deep-Link korrigieren.");
  lines.push("- 6 Bundeswege gelten erst nach `geeignet`/`geeignet mit Einschränkung` als **repariert** (aktuell: reparierbar).");
  lines.push("- `prepared`-Eintrag der 19 BE/BB-Wege bleibt ein separater, freigabepflichtiger Schritt.");
  lines.push("");
  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const inPath = args.find((a) => !a.startsWith("--"));
  const outIdx = args.indexOf("--out");
  const outPath = outIdx > -1 ? args[outIdx + 1] : null;
  if (!inPath) { console.error("Usage: node scripts/sprint9b-summary.js <report.json> [--out <summary.md>]"); process.exit(1); }

  const report = JSON.parse(fs.readFileSync(inPath, "utf8"));
  const md = buildSummaryMarkdown(report);
  if (outPath) fs.writeFileSync(outPath, md);
  process.stdout.write(md + "\n");
}

if (require.main === module) main();

module.exports = { buildSummaryMarkdown };
