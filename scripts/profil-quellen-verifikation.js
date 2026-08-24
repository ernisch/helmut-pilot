"use strict";

// Helmut — Bytegenaue Verifikation der 20 amtlichen Mandatsprofile (PR #267).
// =============================================================================================
// ZWECK. Das Importpaket daten/mandatsprofile-berlin-brandenburg-2026-08-24.json entstand aus
// einer WebSearch-Recherche OHNE Direktzugriff auf die amtlichen Seiten (Egress-Sperre der
// Cloud-Umgebung). Dieses Skript holt die 20 amtlichen Profilseiten EINMAL wirklich ab
// (GitHub-Actions-Runner mit offenem Egress, Muster: sprint9b-verify.yml) und vergleicht die
// Pflichtdaten des Pakets gegen den echten Seiteninhalt.
//
// SICHERHEIT / GRENZEN (bewusst, wie Sprint 9B):
//   - NUR die amtlichen Hosts parlament-berlin.de / landtag.brandenburg.de (mit www),
//     ausschliesslich die im Paket hinterlegten parlament-profil-URLs. Jede andere Adresse
//     (auch per Redirect) wird NICHT abgerufen.
//   - TLS bleibt an. Realistischer User-Agent (Repo-Praezedenz sprint9b-verify-abrufwege.js);
//     KEIN Umgehen technischer Zugriffsbeschraenkungen: kein Captcha-Solving, keine
//     IP-Rotation, kein Retry-Sturm (max. 1 Wiederholung bei Netzfehler), 1,2 s Abstand.
//   - Keine Secrets, keine Datenbank, kein Schreiben ausserhalb des Berichtsverzeichnisses.
//   - Ein nicht erreichbares oder nicht eindeutig auswertbares Profil gilt NIE als bestaetigt.
//
// ERGEBNIS je Profil, genau eines: bestaetigt · abweichung · nicht_eindeutig · nicht_erreichbar.
// Artefakte: JSON-Vollbericht + Markdown-Zusammenfassung. Der Vollbericht wird zusaetzlich in
// das Job-Log gedruckt (zwischen den REPORT-Markern), weil Artefakt-Downloads nicht aus jeder
// Umgebung moeglich sind.
//
// Die REINE Auswertungslogik (Normalisierung, Extraktion, Bewertung) ist exportiert und wird
// offline getestet: scripts/profil-quellen-verifikation-test.js. Netzzugriff passiert
// ausschliesslich unter require.main === module.

const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");

const ERLAUBTE_HOSTS = Object.freeze([
  "parlament-berlin.de",
  "www.parlament-berlin.de",
  "landtag.brandenburg.de",
  "www.landtag.brandenburg.de"
]);

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const MAX_REDIRECTS = 6;
const MAX_BYTES = 6 * 1024 * 1024;
const TIMEOUT_MS = Number(process.env.PQV_TIMEOUT_MS || 20000);
const ABSTAND_MS = Number(process.env.PQV_ABSTAND_MS || 1200);

// ── Reine Helfer ─────────────────────────────────────────────────────────────

function urlErlaubt(u) {
  try {
    const p = new URL(u);
    return p.protocol === "https:" && ERLAUBTE_HOSTS.includes(p.hostname.toLowerCase());
  } catch { return false; }
}

// Normalisierung fuer tolerante Textvergleiche: Kleinschreibung, Umlaut-Transliteration,
// alles Nicht-Alphanumerische zu einzelnen Leerzeichen.
function norm(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// HTML → Textzeilen. Bewusst einfach und ohne Abhaengigkeiten: Skripte/Styles raus,
// Blockgrenzen zu Zeilenumbruechen, Entities dekodieren, Whitespace glaetten.
function htmlZuText(html) {
  let s = String(html || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/dt|\/dd|\/section|\/article|\/header)\b[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&auml;/gi, "ä").replace(/&ouml;/gi, "ö")
    .replace(/&uuml;/gi, "ü").replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö")
    .replace(/&Uuml;/g, "Ü").replace(/&szlig;/gi, "ß")
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)); } catch { return " "; } });
  return s.split("\n").map((z) => z.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function ersteTreffer(html, re) {
  const m = String(html || "").match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

// Zeilen mit Gremienbezug — mit laufender Abschnittsueberschrift und Rollendeutung.
// stellvertretend, wenn Zeile ODER aktuelle Ueberschrift "stellvertret…" traegt.
function gremienZeilen(zeilen) {
  const out = [];
  let ueberschrift = "";
  for (const z of zeilen) {
    if (z.length <= 80 && /(ausschuss|ausschüsse|gremien|mitgliedschaft|kommission|funktionen|parlament)/i.test(z) && !/[.!?]$/.test(z)) {
      ueberschrift = z;
    }
    if (/(ausschuss|kommission|unterausschuss|beirat|enquete)/i.test(z)) {
      const stellv = /stellvertret/i.test(z) || /stellvertret/i.test(ueberschrift);
      out.push({ zeile: z.slice(0, 240), ueberschrift: ueberschrift.slice(0, 120), rolleVermutet: stellv ? "stellvertretend" : "ordentlich-oder-unklar" });
    }
  }
  return out;
}

// Bewertung eines Profils gegen den extrahierten Seitentext. REIN, offline testbar.
// abruf: { ok, status, grund } — Ergebnis des Netzabrufs (bei ok=false sofort nicht_erreichbar).
function bewerteProfil(profil, seite, abruf) {
  const gruende = [];
  if (!abruf || !abruf.ok) {
    return { ergebnis: "nicht_erreichbar", gruende: [abruf && abruf.grund ? abruf.grund : "kein Abruf"], gefunden: null };
  }
  const zeilen = seite.zeilen || [];
  const voll = zeilen.join("\n");
  const vollNorm = " " + norm(voll) + " ";
  if (vollNorm.trim().length < 400) {
    return { ergebnis: "nicht_eindeutig", gruende: ["Seitentext zu kurz fuer eine Auswertung"], gefunden: null };
  }
  if (/(access denied|forbidden|captcha|bot detection)/i.test(voll)) {
    return { ergebnis: "nicht_erreichbar", gruende: ["Zugriffssperren-Marker im Inhalt — wird nicht umgangen"], gefunden: null };
  }

  const gefunden = { name: false, nameForm: null, fraktion: false, mandatAchse: false, ausschuesse: [], stellvertretende: [] };

  // 1 · Name. Exakte Normform, Namensvarianten, sonst Token-Rueckfall (z. B. "Liedtke, Ulrike (Prof. Dr.)").
  const kandidaten = [profil.vollname, ...(profil.namensvarianten || [])];
  for (const k of kandidaten) {
    if (k && vollNorm.includes(" " + norm(k) + " ")) { gefunden.name = true; gefunden.nameForm = k; break; }
  }
  if (!gefunden.name) {
    const tokens = norm(profil.vollname).split(" ").filter((t) => t.length > 1 && !["prof", "dr"].includes(t));
    if (tokens.length && tokens.every((t) => vollNorm.includes(" " + t + " "))) {
      gefunden.name = true; gefunden.nameForm = "alle Namensbestandteile einzeln (Form abweichend)";
      gruende.push("Namensform weicht ab (alle Bestandteile vorhanden, exakte Form nicht gefunden)");
    }
  }
  if (!gefunden.name) {
    return { ergebnis: "nicht_eindeutig", gruende: ["Vollname auf der Seite nicht auffindbar — falsche Seite oder Namensabweichung"], gefunden };
  }

  // 2 · Fraktion.
  const fr = norm(profil.fraktion || profil.partei || "");
  gefunden.fraktion = Boolean(fr) && vollNorm.includes(" " + fr + " ");
  if (!gefunden.fraktion) gruende.push(`Fraktion \`${profil.fraktion || profil.partei}\` nicht im Seitentext gefunden`);

  // 3 · Mandatsachse: Wahlkreis ODER Listenmandat.
  if (profil.wahlkreis) {
    const wkNorm = norm(profil.wahlkreis);
    const nummer = (String(profil.wahlkreis).match(/\d+/) || [null])[0];
    const klammer = (String(profil.wahlkreis).match(/\(([^)]+)\)/) || [null, null])[1];
    gefunden.mandatAchse =
      vollNorm.includes(" " + wkNorm + " ") ||
      (nummer && new RegExp(`wahlkreis\\s*0?${nummer}(\\s|$)`).test(vollNorm)) ||
      (klammer && vollNorm.includes(" " + norm(klammer) + " ") && vollNorm.includes(" wahlkreis "));
    if (!gefunden.mandatAchse) gruende.push(`Wahlkreis \`${profil.wahlkreis}\` nicht im Seitentext gefunden`);
  } else if (profil.listenmandat === true) {
    gefunden.mandatAchse = /(landesliste|listenplatz|listenmandat| ueber die liste | liste )/.test(vollNorm);
    if (!gefunden.mandatAchse) gruende.push("Kein Listen-Marker (Landesliste/Listenplatz/Liste) im Seitentext gefunden");
  }

  // 4 · Erwartete Ausschuesse — jede fehlende Nennung ist eine Abweichung.
  for (const a of profil.ausschuesse || []) {
    const ok = vollNorm.includes(" " + norm(a) + " ");
    gefunden.ausschuesse.push({ name: a, gefunden: ok });
    if (!ok) gruende.push(`Ausschuss \`${a}\` nicht im Seitentext gefunden`);
  }
  for (const a of profil.stellvertretendeAusschuesse || []) {
    const ok = vollNorm.includes(" " + norm(a) + " ");
    gefunden.stellvertretende.push({ name: a, gefunden: ok });
    if (!ok) gruende.push(`Stellv. Ausschuss \`${a}\` nicht im Seitentext gefunden`);
  }

  // 5 · Gremienzeilen der Seite, die KEINEM erwarteten Ausschuss zuzuordnen sind — als
  // Hinweis ausgewiesen (Navigations-/Listenrauschen moeglich); eine Zeile mit klarem
  // Mitglieds-Wortlaut zaehlt als Abweichung (unbelegte Mitgliedschaft im Paket fehlend).
  const erwartetNorm = [...(profil.ausschuesse || []), ...(profil.stellvertretendeAusschuesse || [])].map((a) => norm(a));
  const unzugeordnet = [];
  for (const g of seite.gremien || []) {
    const gz = norm(g.zeile);
    if (erwartetNorm.some((e) => e && gz.includes(e))) continue;
    unzugeordnet.push(g);
    if (/(^| )mitglied( |$)|stellvertret/i.test(g.zeile) && !/keine mitglied/i.test(g.zeile)) {
      gruende.push(`Seite nennt Gremium ausserhalb des Pakets: "${g.zeile.slice(0, 160)}"`);
    }
  }
  gefunden.unzugeordneteGremienZeilen = unzugeordnet.slice(0, 30);

  const pflichtOk = gefunden.name && gefunden.fraktion && gefunden.mandatAchse &&
    gefunden.ausschuesse.every((a) => a.gefunden) && gefunden.stellvertretende.every((a) => a.gefunden);
  const abweichungsGruende = gruende.filter((g) => !g.startsWith("Namensform weicht ab"));

  let ergebnis;
  if (pflichtOk && abweichungsGruende.length === 0) ergebnis = "bestaetigt";
  else ergebnis = "abweichung";
  return { ergebnis, gruende, gefunden };
}

// ── Netzabruf (nur unter require.main) ──────────────────────────────────────

function httpAbruf(startUrl) {
  return new Promise((resolve) => {
    const redirects = [];
    const start = Date.now();
    function schritt(url, tiefe) {
      if (tiefe > MAX_REDIRECTS) { resolve({ fehler: "zu viele Weiterleitungen", redirects, ms: Date.now() - start }); return; }
      if (!urlErlaubt(url)) { resolve({ fehler: `Adresse ausserhalb der erlaubten amtlichen Hosts: ${url}`, redirects, ms: Date.now() - start }); return; }
      const req = https.get(url, {
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "accept-language": "de-DE,de;q=0.9"
        },
        timeout: TIMEOUT_MS
      }, (res) => {
        const status = res.statusCode || 0;
        const ct = String(res.headers["content-type"] || "");
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          redirects.push({ status, von: url, nach: res.headers.location });
          res.resume();
          let next;
          try { next = new URL(res.headers.location, url).toString(); } catch { resolve({ fehler: "ungueltige Redirect-Adresse", redirects, ms: Date.now() - start }); return; }
          schritt(next, tiefe + 1);
          return;
        }
        const teile = []; let bytes = 0;
        res.on("data", (d) => {
          bytes += d.length;
          if (bytes <= MAX_BYTES) teile.push(d);
          else res.destroy();
        });
        res.on("end", () => {
          const body = Buffer.concat(teile);
          resolve({ status, contentType: ct, body, finalUrl: url, redirects, bytes, ms: Date.now() - start });
        });
        res.on("error", (e) => resolve({ fehler: e.message, redirects, ms: Date.now() - start }));
      });
      req.on("timeout", () => { req.destroy(new Error("Timeout")); });
      req.on("error", (e) => resolve({ fehler: e.message, redirects, ms: Date.now() - start }));
    }
    schritt(startUrl, 0);
  });
}

function zeitStempel(d) {
  const fmt = (tz) => new Intl.DateTimeFormat("de-DE", { timeZone: tz, dateStyle: "short", timeStyle: "medium" }).format(d);
  return { tr: fmt("Europe/Istanbul"), berlin: fmt("Europe/Berlin"), utc: d.toISOString() };
}

async function pruefeAlle(paketPfad) {
  const paket = JSON.parse(fs.readFileSync(paketPfad, "utf8"));
  const ergebnisse = [];
  for (const profil of paket.profile) {
    const quelle = (profil.offizielleQuellen || []).find((q) => q.art === "parlament-profil");
    const eintrag = { mandatsId: profil.mandatsId, vollname: profil.vollname, parlament: profil.parlament, urlStart: quelle ? quelle.url : null };
    if (!quelle || !urlErlaubt(quelle.url)) {
      eintrag.abruf = { ok: false, grund: "keine erlaubte amtliche URL im Paket" };
      eintrag.bewertung = bewerteProfil(profil, { zeilen: [] }, eintrag.abruf);
    } else {
      const t = new Date();
      const r = await httpAbruf(quelle.url);
      eintrag.abrufzeit = zeitStempel(t);
      eintrag.redirects = r.redirects || [];
      eintrag.finalUrl = r.finalUrl || null;
      eintrag.status = r.status || null;
      eintrag.contentType = r.contentType || null;
      eintrag.dauerMs = r.ms;
      if (r.fehler) {
        eintrag.abruf = { ok: false, grund: `Netz-/Abruffehler: ${r.fehler}` };
        eintrag.bewertung = bewerteProfil(profil, { zeilen: [] }, eintrag.abruf);
      } else {
        eintrag.sha256 = crypto.createHash("sha256").update(r.body).digest("hex");
        eintrag.bytes = r.bytes;
        const html = r.body.toString("utf8");
        const zeilen = htmlZuText(html);
        const seite = {
          zeilen,
          gremien: gremienZeilen(zeilen),
          titel: ersteTreffer(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
          h1: ersteTreffer(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)
        };
        const okStatus = r.status === 200 && /html/i.test(r.contentType || "");
        eintrag.abruf = okStatus
          ? { ok: true }
          : { ok: false, grund: `HTTP ${r.status} / Content-Type ${r.contentType || "?"}` };
        eintrag.seitenTitel = seite.titel;
        eintrag.h1 = seite.h1;
        eintrag.bewertung = bewerteProfil(profil, seite, eintrag.abruf);
        // Textausschnitte fuer die menschliche Nachpruefung (verbatim, gedeckelt).
        eintrag.textAusschnitte = {
          gremienZeilen: seite.gremien.slice(0, 40),
          fraktionZeilen: zeilen.filter((z) => /fraktion/i.test(z)).slice(0, 12).map((z) => z.slice(0, 240)),
          mandatZeilen: zeilen.filter((z) => /(wahlkreis|landesliste|listenplatz|direktmandat|\bliste\b)/i.test(z)).slice(0, 12).map((z) => z.slice(0, 240)),
          funktionZeilen: zeilen.filter((z) => /(vorsitz|sprecher|präsident|praesident|geschäftsführ|geschaeftsfuehr|schriftführ|schriftfuehr|präsidium|praesidium)/i.test(z)).slice(0, 12).map((z) => z.slice(0, 240))
        };
      }
      await new Promise((res) => setTimeout(res, ABSTAND_MS));
    }
    eintrag.ergebnis = eintrag.bewertung.ergebnis;
    ergebnisse.push(eintrag);
    console.log(`  ${eintrag.ergebnis.padEnd(16)} ${profil.mandatsId} (HTTP ${eintrag.status || "-"}, ${eintrag.dauerMs || 0} ms)`);
  }
  return { paketPfad, lauf: zeitStempel(new Date()), ergebnisse };
}

function zusammenfassungMd(bericht) {
  const z = ["# Profil-Quellen-Verifikation — Zusammenfassung", ""];
  z.push(`**Lauf:** ${bericht.lauf.tr} TR · ${bericht.lauf.berlin} Berlin · ${bericht.lauf.utc} UTC`);
  const zaehler = {};
  for (const e of bericht.ergebnisse) zaehler[e.ergebnis] = (zaehler[e.ergebnis] || 0) + 1;
  z.push("", `**Ergebnis:** ${Object.entries(zaehler).map(([k, v]) => `${v}× ${k}`).join(" · ")} (${bericht.ergebnisse.length} Profile)`, "");
  z.push("| Profil | Ergebnis | HTTP | Endadresse | Dauer | SHA256 (Kurzform) |");
  z.push("|---|---|---|---|---|---|");
  for (const e of bericht.ergebnisse) {
    z.push(`| ${e.mandatsId} | **${e.ergebnis}** | ${e.status || "-"} | ${e.finalUrl || "-"} | ${e.dauerMs || 0} ms | ${(e.sha256 || "").slice(0, 12)} |`);
  }
  z.push("", "## Gründe je nicht bestätigtem Profil", "");
  for (const e of bericht.ergebnisse) {
    if (e.ergebnis === "bestaetigt") continue;
    z.push(`### ${e.mandatsId} — ${e.ergebnis}`);
    for (const g of (e.bewertung && e.bewertung.gruende) || []) z.push(`- ${g}`);
    z.push("");
  }
  z.push("Ein nicht erreichbares oder nicht eindeutiges Profil gilt niemals als bestätigt.");
  return z.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
  const paketPfad = arg("--paket", path.join(__dirname, "..", "daten", "mandatsprofile-berlin-brandenburg-2026-08-24.json"));
  const outJson = arg("--out-json", "profil-verifikation-bericht.json");
  const outMd = arg("--out-md", "profil-verifikation-zusammenfassung.md");

  console.log(`Profil-Quellen-Verifikation — ${paketPfad}`);
  const bericht = await pruefeAlle(paketPfad);
  fs.writeFileSync(outJson, JSON.stringify(bericht, null, 1));
  fs.writeFileSync(outMd, zusammenfassungMd(bericht));

  // Vollbericht ins Log (fuer Umgebungen ohne Artefakt-Download). Marker fuer maschinelles Finden.
  console.log("\n===== PQV-REPORT-BEGIN =====");
  console.log(JSON.stringify(bericht));
  console.log("===== PQV-REPORT-END =====\n");

  const alleBestaetigt = bericht.ergebnisse.every((e) => e.ergebnis === "bestaetigt");
  console.log(zusammenfassungMd(bericht).split("\n").slice(0, 30).join("\n"));
  if (!alleBestaetigt) {
    console.log("\nERGEBNIS: NICHT alle Profile bestätigt — Details in Bericht/Zusammenfassung.");
    process.exit(1);
  }
  console.log("\nERGEBNIS: alle Profile bestätigt.");
}

module.exports = { ERLAUBTE_HOSTS, urlErlaubt, norm, htmlZuText, gremienZeilen, bewerteProfil, zusammenfassungMd };

if (require.main === module) {
  main().catch((e) => { console.error("FATAL:", e && e.stack || e); process.exit(2); });
}
