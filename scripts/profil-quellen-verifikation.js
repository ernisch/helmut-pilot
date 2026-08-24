"use strict";

// Helmut — Bytegenaue Verifikation der 20 amtlichen Mandatsprofile (PR #267).
// =============================================================================================
// ZWECK. Das Importpaket daten/mandatsprofile-berlin-brandenburg-2026-08-24.json wird gegen
// die echten amtlichen Profilseiten geprueft (GitHub-Actions-Runner mit offenem Egress,
// Sicherheitsmuster: sprint9b-verify.yml). Die Cloud-Arbeitsumgebung selbst hat KEINEN
// Zugriff auf die Parlamentsdomains (Egress-Sperre) — deshalb dieser Weg.
//
// STRENGE-STUFE 2 (dritter Lauf, gruenderfreigegeben). Die Erstfassung war an mehreren
// Stellen zu grosszuegig; folgende Regeln sind jetzt VERBINDLICH:
//   1. Ein Profil ist nur "bestaetigt", wenn JEDES importierte pruefbare Faktenfeld belegt
//      ist: Name, Fraktion, Mandatsachse, jede Ausschussmitgliedschaft IN DER RICHTIGEN
//      ROLLE, jeder Listenplatz im Regionshinweis, jede gespeicherte Funktion.
//   2. FEHLENDE Information ist KEINE Bestaetigung: nennt die Seite keine Mandatsachse und
//      liegt kein Beleg aus dem Pruefmanifest vor, lautet das Ergebnis "nicht_eindeutig".
//   3. Mitgliedschaften zaehlen nur im PROFILINHALT: Brandenburg ausschliesslich in den
//      Abschnitten "Ordentliche/Stellvertretende Ausschuss- und Gremienmitgliedschaften";
//      Navigation (Petitionsausschuss/Kommissionen vor dem Abschnitt) und biografische
//      Historik (Jahresspannen, kommunale/parteiliche Gremien) bestaetigen NICHTS und
//      verbergen NICHTS. Berlin fuehrt Mitgliedschaften als eigene kurze Zeilen; die
//      Navigationszeile "Enquete-Kommission" ist ausgeschlossen.
//   4. Rollen streng: ein ordentlich erwarteter Ausschuss, der nur stellvertretend
//      gefuehrt wird, ist ROT — und umgekehrt. parlament-berlin.de weist keine Rollen aus:
//      dort gilt ein Eintrag als Mitgliedschaft mit unbestimmter Rolle; eine
//      STELLVERTRETEND-Behauptung ist fuer Berlin damit unbelegbar (rot).
//   5. Jede M-Zeile der Seite, die keinem Paketeintrag zuzuordnen ist, ist ROT
//      (unbelegte Mitgliedschaft fehlt im Paket).
//   6. Zusatzquellen NUR aus daten/profil-quellen-manifest-2026-08-24.json (fest
//      hinterlegte amtliche HTTPS-Adressen, eigene Host-Schranke; hier: die amtliche
//      Gewaehlten-Seite der Landeswahlleiterin fuer die Mandatsart von Saleh/Stroedter).
//
// SICHERHEIT unveraendert: nur amtliche Hosts (auch fuer Redirects), TLS an, realistischer
// User-Agent (Repo-Praezedenz), max. 1 Wiederholung, 1,2 s Abstand, keine Secrets, kein
// Schreiben ausserhalb des Berichts. Ein nicht erreichbares oder nicht eindeutiges Profil
// gilt NIE als bestaetigt. Ergebnis je Profil genau eines:
// bestaetigt · abweichung · nicht_eindeutig · nicht_erreichbar.
//
// Die REINE Auswertungslogik ist exportiert und offline getestet
// (scripts/profil-quellen-verifikation-test.js). Netzzugriff nur unter require.main.

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
const MAX_SEITEN = 30; // harte Obergrenze der Abrufe je Lauf (Freigabegrenze)

// ── Reine Helfer ─────────────────────────────────────────────────────────────

function urlErlaubt(u, zusatzhosts) {
  try {
    const p = new URL(u);
    if (p.protocol !== "https:") return false;
    const h = p.hostname.toLowerCase();
    return ERLAUBTE_HOSTS.includes(h) || (Array.isArray(zusatzhosts) && zusatzhosts.includes(h));
  } catch { return false; }
}

function norm(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function htmlZuText(html) {
  let s = String(html || "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/dt|\/dd|\/section|\/article|\/header)\b[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&auml;/gi, "ä").replace(/&ouml;/gi, "ö")
    .replace(/&uuml;/gi, "ü").replace(/&Auml;/g, "Ä").replace(/&Ouml;/g, "Ö")
    .replace(/&Uuml;/g, "Ü").replace(/&szlig;/gi, "ß")
    .replace(/&bdquo;/gi, "„").replace(/&ldquo;/gi, "“").replace(/&rdquo;/gi, "”")
    .replace(/&sbquo;/gi, "‚").replace(/&lsquo;/gi, "‘").replace(/&rsquo;/gi, "’")
    .replace(/&ndash;/gi, "–").replace(/&mdash;/gi, "—").replace(/&shy;/gi, "")
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)); } catch { return " "; } })
    .replace(/&[a-z]{2,10};/gi, " ");
  return s.split("\n").map((z) => z.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function ersteTreffer(html, re) {
  const m = String(html || "").match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

// Biografische Historik: Jahresspannen ("2019 bis 2021", "1985 - 1989") und kommunale/
// parteiliche Gremien sind keine aktuellen Landtags-/AGH-Mitgliedschaften.
function istHistorik(z) {
  return /\b(19|20)\d{2}\s*(bis|-|–|—)\s*((19|20)\d{2}|[A-Za-zÄÖÜäöü])/.test(z) ||
    /(bvv\b|kreistag|stadtverordnetenversammlung|ortsverein|jugendhilfeausschuss|landesausschuss)/i.test(z);
}

const GREMIEN_RE = /(ausschuss|ausschüsse|kommission|unterausschuss|beirat|enquete)/i;
const MARKER_ORDENTLICH = "ordentliche ausschuss und gremienmitgliedschaften";
const MARKER_STELLV = "stellvertretende ausschuss und gremienmitgliedschaften";
const NAV_BERLIN = ["enquete kommission"];
// Strukturueberschriften sind keine Gremien. WICHTIG: "Petitionsausschuss" gehoert NICHT
// hierher — auf parlament-berlin.de ist die alleinstehende Zeile eine ECHTE Mitgliedschaft
// (nur Seiten von Mitgliedern fuehren sie); die Brandenburger Navigationszeile gleichen
// Namens faellt bereits durch die Abschnittslogik heraus (sie steht VOR dem Marker).
const STRUKTUR_RE = /^(ausschuesse|gremien|kommissionen)$|^(ordentliche|stellvertretende) ?ausschuss( und gremienmitgliedschaften)?$/;

// Mitgliedschaften aus dem PROFILINHALT — Rollen getrennt.
//   landtag-brandenburg: NUR Zeilen nach den amtlichen Abschnittsueberschriften
//     "Ordentliche/Stellvertretende Ausschuss- und Gremienmitgliedschaften".
//     Alles davor (Navigation "Petitionsausschuss"/"Kommissionen", Historik) zaehlt nicht.
//   landtag-berlin (und Default): kurze alleinstehende Gremienzeilen ohne Satzende,
//     ohne Navigationszeile "Enquete-Kommission", ohne Historik. Eine Zeile mit
//     "stellvertretend" -> Rolle stellvertretend; sonst Rolle UNBESTIMMT (Berlin weist
//     keine Rollen aus — es wird keine erfunden).
function mitgliedschaften(zeilen, parlament) {
  const m = { ordentlich: [], stellvertretend: [], unbestimmt: [] };
  if (parlament === "landtag-brandenburg") {
    let modus = null;
    for (const z of zeilen) {
      const n = norm(z);
      if (n === MARKER_ORDENTLICH) { modus = "ordentlich"; continue; }
      if (n === MARKER_STELLV) { modus = "stellvertretend"; continue; }
      if (!modus) continue;
      if (!GREMIEN_RE.test(z) || istHistorik(z)) continue;
      m[modus].push(z.slice(0, 240));
    }
    return m;
  }
  for (const z of zeilen) {
    if (!GREMIEN_RE.test(z)) continue;
    const n = norm(z);
    if (NAV_BERLIN.includes(n) || STRUKTUR_RE.test(n)) continue;
    if (istHistorik(z)) continue;
    if (z.length > 110 || /[.!?]$/.test(z)) continue;
    if (/stellvertret/i.test(z)) m.stellvertretend.push(z.slice(0, 240));
    else m.unbestimmt.push(z.slice(0, 240));
  }
  return m;
}

// Mandatsart-Beleg aus einer Zusatzquelle (amtliche Gewaehlten-Seite): der dem Namen
// NAECHSTGELEGENE vorausgehende Abschnittsmarker (Liste vs. Wahlkreis) entscheidet.
function belegeMandatsart(text, vollname) {
  const t = " " + norm(text) + " ";
  const basis = norm(vollname);
  const formen = [basis, basis.split(" ").reverse().join(" ")];
  let idx = -1, form = null;
  for (const f of formen) {
    const i = t.indexOf(" " + f + " ");
    if (i >= 0) { idx = i; form = f; break; }
  }
  if (idx < 0) return { gefunden: false, urteil: "name-nicht-gefunden" };
  const prefix = t.slice(0, idx);
  const li = Math.max(prefix.lastIndexOf("landesliste"), prefix.lastIndexOf("bezirksliste"), prefix.lastIndexOf("listenplatz"), prefix.lastIndexOf(" liste "));
  const wi = prefix.lastIndexOf("wahlkreis");
  const umfeld = t.slice(Math.max(0, idx - 300), idx + form.length + 200).trim();
  if (li < 0 && wi < 0) return { gefunden: true, urteil: "uneindeutig", umfeld };
  if (li > wi) return { gefunden: true, urteil: "liste-belegt", umfeld };
  return { gefunden: true, urteil: "wahlkreis-zuordnung", umfeld };
}

// Bewertung eines Profils. REIN, offline testbar.
// externerBeleg (optional): Ergebnis von belegeMandatsart() aus einer Manifest-Zusatzquelle.
function bewerteProfil(profil, seite, abruf, externerBeleg) {
  const gruende = [];   // Widersprueche / fehlende Belege importierter Fakten -> abweichung
  const unbelegt = [];  // fehlende Information ohne Widerspruch -> nicht_eindeutig
  const hinweise = [];
  if (!abruf || !abruf.ok) {
    return { ergebnis: "nicht_erreichbar", gruende: [abruf && abruf.grund ? abruf.grund : "kein Abruf"], unbelegt: [], hinweise: [], gefunden: null };
  }
  const zeilen = seite.zeilen || [];
  const voll = zeilen.join("\n");
  const vollNorm = " " + norm(voll) + " ";
  if (vollNorm.trim().length < 400) {
    return { ergebnis: "nicht_eindeutig", gruende: [], unbelegt: ["Seitentext zu kurz fuer eine Auswertung"], hinweise: [], gefunden: null };
  }
  if (/(access denied|forbidden|captcha|bot detection)/i.test(voll)) {
    return { ergebnis: "nicht_erreichbar", gruende: ["Zugriffssperren-Marker im Inhalt — wird nicht umgangen"], unbelegt: [], hinweise: [], gefunden: null };
  }

  const gefunden = { name: false, nameForm: null, fraktion: false, mandatAchse: false, mandatAchseQuelle: null, ausschuesse: [], stellvertretende: [], funktionen: [], regionPlaetze: [] };

  // 1 · Name.
  for (const k of [profil.vollname, ...(profil.namensvarianten || [])]) {
    if (k && vollNorm.includes(" " + norm(k) + " ")) { gefunden.name = true; gefunden.nameForm = k; break; }
  }
  if (!gefunden.name) {
    const tokens = norm(profil.vollname).split(" ").filter((t) => t.length > 1 && !["prof", "dr"].includes(t));
    if (tokens.length && tokens.every((t) => vollNorm.includes(" " + t + " "))) {
      gefunden.name = true; gefunden.nameForm = "alle Namensbestandteile einzeln (Form abweichend)";
      hinweise.push("Namensform weicht ab (alle Bestandteile vorhanden, exakte Form nicht gefunden)");
    }
  }
  if (!gefunden.name) {
    return { ergebnis: "nicht_eindeutig", gruende: [], unbelegt: ["Vollname auf der Seite nicht auffindbar — falsche Seite oder Namensabweichung"], hinweise, gefunden };
  }

  // 2 · Fraktion (seitenweite Pruefung; dokumentierte Grenze: die BB-Navigation nennt alle
  // Fraktionen — die Fraktionsangabe traegt daher weniger Beweiskraft als die uebrigen Felder).
  const fr = norm(profil.fraktion || profil.partei || "");
  gefunden.fraktion = Boolean(fr) && vollNorm.includes(" " + fr + " ");
  if (!gefunden.fraktion) gruende.push(`Fraktion \`${profil.fraktion || profil.partei}\` nicht im Seitentext gefunden`);

  // 3 · Mandatsachse. Fehlende Information ist KEINE Bestaetigung.
  const wahlkreisZuweisung = zeilen.some((z) => /^wahlkreis\s*[:0-9]/i.test(z.trim()));
  if (profil.wahlkreis) {
    const wkNorm = norm(profil.wahlkreis);
    const nummer = (String(profil.wahlkreis).match(/\d+/) || [null])[0];
    const klammer = (String(profil.wahlkreis).match(/\(([^)]+)\)/) || [null, null])[1];
    gefunden.mandatAchse =
      vollNorm.includes(" " + wkNorm + " ") ||
      (nummer && new RegExp(`wahlkreis\\s*0?${nummer}(\\s|$)`).test(vollNorm)) ||
      (klammer && vollNorm.includes(" " + norm(klammer) + " ") && vollNorm.includes(" wahlkreis "));
    if (gefunden.mandatAchse) gefunden.mandatAchseQuelle = "profilseite";
    else gruende.push(`Wahlkreis \`${profil.wahlkreis}\` nicht im Seitentext gefunden`);
  } else if (profil.listenmandat === true) {
    const listeMarker = /(landesliste|bezirksliste|listenplatz|listenmandat)/.test(vollNorm);
    if (listeMarker && !wahlkreisZuweisung) {
      gefunden.mandatAchse = true; gefunden.mandatAchseQuelle = "profilseite";
    } else if (wahlkreisZuweisung) {
      gruende.push("Listenmandat im Paket, aber die Seite weist einen Wahlkreis zu");
    } else if (externerBeleg && externerBeleg.urteil === "liste-belegt") {
      gefunden.mandatAchse = true; gefunden.mandatAchseQuelle = "zusatzquelle";
      hinweise.push("Mandatsachse ueber die im Manifest hinterlegte amtliche Zusatzquelle belegt");
    } else if (externerBeleg && externerBeleg.urteil === "wahlkreis-zuordnung") {
      gruende.push("Listenmandat im Paket, aber die amtliche Zusatzquelle ordnet einen Wahlkreis zu");
    } else {
      unbelegt.push("Mandatsachse (Listenmandat) weder auf der Profilseite noch ueber eine Zusatzquelle belegt — fehlende Information ist keine Bestaetigung");
    }
  } else {
    unbelegt.push("Keine Mandatsachse im Paket");
  }

  // 4 · Regionshinweis: behauptete Listenplaetze muessen belegt sein; Widerspruch ist rot.
  const region = String(profil.regionHinweis || "");
  for (const m of region.matchAll(/platz\s*(\d+)/gi)) {
    const n = m[1];
    const ok = new RegExp(`platz\\s*0?${n}(\\s|$)`).test(vollNorm);
    gefunden.regionPlaetze.push({ platz: n, belegt: ok });
    if (!ok) gruende.push(`Regionshinweis nennt Platz ${n}, die Seite belegt ihn nicht`);
  }
  const seitenPlatz = (vollNorm.match(/landesliste[a-z0-9 ]{0,40} platz (\d+)/) || [null, null])[1];
  if (seitenPlatz && gefunden.regionPlaetze.length && !gefunden.regionPlaetze.some((p) => String(Number(p.platz)) === String(Number(seitenPlatz)))) {
    gruende.push(`Die Seite nennt Listenplatz ${seitenPlatz}, der Regionshinweis einen anderen`);
  }

  // 5 · Ausschuesse in der RICHTIGEN Rolle — nur Profilinhalt zaehlt.
  const M = mitgliedschaften(zeilen, profil.parlament);
  const mNorm = {
    ordentlich: M.ordentlich.map((z) => norm(z)),
    stellvertretend: M.stellvertretend.map((z) => norm(z)),
    unbestimmt: M.unbestimmt.map((z) => norm(z))
  };
  const inKlasse = (a, klasse) => mNorm[klasse].some((z) => z.includes(norm(a)));
  for (const a of profil.ausschuesse || []) {
    const ordentlich = inKlasse(a, "ordentlich");
    const unbest = inKlasse(a, "unbestimmt");
    const stellv = inKlasse(a, "stellvertretend");
    const ok = ordentlich || unbest;
    gefunden.ausschuesse.push({ name: a, gefunden: ok, rolleSeite: ordentlich ? "ordentlich" : unbest ? "unbestimmt" : stellv ? "stellvertretend" : null });
    if (!ok && stellv) gruende.push(`Ausschuss \`${a}\` wird auf der Seite nur STELLVERTRETEND gefuehrt (Rollenfehler)`);
    else if (!ok) gruende.push(`Ausschuss \`${a}\` nicht im Mitgliedschaftsabschnitt der Seite gefunden`);
  }
  for (const a of profil.stellvertretendeAusschuesse || []) {
    const stellv = inKlasse(a, "stellvertretend");
    gefunden.stellvertretende.push({ name: a, gefunden: stellv });
    if (!stellv && inKlasse(a, "ordentlich")) gruende.push(`Stellv. Ausschuss \`${a}\` wird auf der Seite ORDENTLICH gefuehrt (Rollenfehler)`);
    else if (!stellv && inKlasse(a, "unbestimmt")) gruende.push(`Stellv. Ausschuss \`${a}\`: die Seite weist keine Rolle aus — die stellvertretende Behauptung ist unbelegbar`);
    else if (!stellv) gruende.push(`Stellv. Ausschuss \`${a}\` nicht im Mitgliedschaftsabschnitt der Seite gefunden`);
  }
  // Jede Mitgliedschaftszeile der Seite muss einem Paketeintrag zuzuordnen sein.
  const erwartetOrd = (profil.ausschuesse || []).map((a) => norm(a));
  const erwartetStv = (profil.stellvertretendeAusschuesse || []).map((a) => norm(a));
  const zuordenbar = (zn, erwartet) => erwartet.some((e) => e && zn.includes(e));
  gefunden.unzugeordneteMitgliedschaften = [];
  for (const [klasse, erwartet] of [["ordentlich", erwartetOrd], ["unbestimmt", erwartetOrd], ["stellvertretend", erwartetStv]]) {
    M[klasse].forEach((z, i) => {
      if (!zuordenbar(mNorm[klasse][i], erwartet)) {
        gefunden.unzugeordneteMitgliedschaften.push({ klasse, zeile: z });
        gruende.push(`Seite fuehrt ${klasse === "stellvertretend" ? "stellvertretende " : ""}Mitgliedschaft ausserhalb des Pakets: "${z.slice(0, 160)}"`);
      }
    });
  }

  // 6 · Funktionen: jede gespeicherte Funktion muss im aktuellen (nicht historischen)
  // Seitentext belegt sein — sonst rot (unbelegte Funktionen gehoeren nicht ins Paket).
  const aktuellNorm = " " + norm(zeilen.filter((z) => !istHistorik(z)).join("\n")) + " ";
  for (const f of profil.funktionen || []) {
    const ok = aktuellNorm.includes(" " + norm(f) + " ");
    gefunden.funktionen.push({ name: f, belegt: ok });
    if (!ok) gruende.push(`Funktion \`${f}\` im aktuellen Seitentext nicht belegt`);
  }

  let ergebnis;
  if (gruende.length) ergebnis = "abweichung";
  else if (unbelegt.length) ergebnis = "nicht_eindeutig";
  else ergebnis = "bestaetigt";
  return { ergebnis, gruende, unbelegt, hinweise, gefunden, mitgliedschaftenSeite: M };
}

// ── Netzabruf (nur unter require.main) ──────────────────────────────────────

function httpAbruf(startUrl, zusatzhosts) {
  return new Promise((resolve) => {
    const redirects = [];
    const start = Date.now();
    function schritt(url, tiefe) {
      if (tiefe > MAX_REDIRECTS) { resolve({ fehler: "zu viele Weiterleitungen", redirects, ms: Date.now() - start }); return; }
      if (!urlErlaubt(url, zusatzhosts)) { resolve({ fehler: `Adresse ausserhalb der erlaubten amtlichen Hosts: ${url}`, redirects, ms: Date.now() - start }); return; }
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

async function abrufMitProtokoll(url, zusatzhosts) {
  const eintrag = { url };
  const t = new Date();
  const r = await httpAbruf(url, zusatzhosts);
  eintrag.abrufzeit = zeitStempel(t);
  eintrag.redirects = r.redirects || [];
  eintrag.finalUrl = r.finalUrl || null;
  eintrag.status = r.status || null;
  eintrag.contentType = r.contentType || null;
  eintrag.dauerMs = r.ms;
  if (r.fehler) { eintrag.fehler = r.fehler; return eintrag; }
  eintrag.sha256 = crypto.createHash("sha256").update(r.body).digest("hex");
  eintrag.bytes = r.bytes;
  eintrag.html = r.body.toString("utf8");
  return eintrag;
}

async function pruefeAlle(paketPfad, manifestPfad) {
  const paket = JSON.parse(fs.readFileSync(paketPfad, "utf8"));
  let manifest = { erlaubteZusatzhosts: [], zusatzquellen: [] };
  if (manifestPfad && fs.existsSync(manifestPfad)) manifest = JSON.parse(fs.readFileSync(manifestPfad, "utf8"));
  const zusatzhosts = (manifest.erlaubteZusatzhosts || []).map((h) => String(h).toLowerCase());

  const geplanteAbrufe = paket.profile.length + (manifest.zusatzquellen || []).length;
  if (geplanteAbrufe > MAX_SEITEN) throw new Error(`Abrufplan (${geplanteAbrufe}) ueberschreitet die Obergrenze von ${MAX_SEITEN} Seiten`);

  // 1 · Zusatzquellen zuerst (liefern externe Belege fuer die Profilbewertung).
  const zusatz = [];
  const externeBelege = {}; // mandatsId -> belegeMandatsart-Ergebnis (+ Quelle)
  for (const q of manifest.zusatzquellen || []) {
    const e = await abrufMitProtokoll(q.url, zusatzhosts);
    e.zweck = q.zweck;
    e.belege = [];
    if (!e.fehler && e.status === 200) {
      const text = htmlZuText(e.html).join("\n");
      for (const b of q.belege || []) {
        const urteil = belegeMandatsart(text, b.vollname);
        urteil.quelle = q.url;
        urteil.erwarteteArt = b.erwarteteArt;
        e.belege.push({ mandatsId: b.mandatsId, ...urteil });
        externeBelege[b.mandatsId] = urteil;
      }
    } else {
      for (const b of q.belege || []) e.belege.push({ mandatsId: b.mandatsId, gefunden: false, urteil: "quelle-nicht-abrufbar" });
    }
    delete e.html;
    zusatz.push(e);
    await new Promise((res) => setTimeout(res, ABSTAND_MS));
  }

  // 2 · Die 20 Profilseiten.
  const ergebnisse = [];
  for (const profil of paket.profile) {
    const quelle = (profil.offizielleQuellen || []).find((q) => q.art === "parlament-profil");
    const eintrag = { mandatsId: profil.mandatsId, vollname: profil.vollname, parlament: profil.parlament, urlStart: quelle ? quelle.url : null };
    if (!quelle || !urlErlaubt(quelle.url)) {
      eintrag.abruf = { ok: false, grund: "keine erlaubte amtliche URL im Paket" };
      eintrag.bewertung = bewerteProfil(profil, { zeilen: [] }, eintrag.abruf);
    } else {
      const e = await abrufMitProtokoll(quelle.url);
      Object.assign(eintrag, e);
      if (e.fehler) {
        eintrag.abruf = { ok: false, grund: `Netz-/Abruffehler: ${e.fehler}` };
        eintrag.bewertung = bewerteProfil(profil, { zeilen: [] }, eintrag.abruf);
      } else {
        const zeilen = htmlZuText(e.html);
        delete eintrag.html;
        eintrag.seitenTitel = ersteTreffer(e.html, /<title[^>]*>([\s\S]*?)<\/title>/i);
        eintrag.h1 = ersteTreffer(e.html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
        const okStatus = e.status === 200 && /html/i.test(e.contentType || "");
        eintrag.abruf = okStatus ? { ok: true } : { ok: false, grund: `HTTP ${e.status} / Content-Type ${e.contentType || "?"}` };
        eintrag.bewertung = bewerteProfil(profil, { zeilen }, eintrag.abruf, externeBelege[profil.mandatsId]);
        eintrag.textAusschnitte = {
          mitgliedschaften: eintrag.bewertung.mitgliedschaftenSeite,
          mandatZeilen: zeilen.filter((z) => /(wahlkreis|landesliste|bezirksliste|listenplatz|direktmandat)/i.test(z)).slice(0, 12).map((z) => z.slice(0, 240)),
          funktionZeilen: zeilen.filter((z) => /(vorsitz|sprecher|präsident|praesident|geschäftsführ|geschaeftsfuehr|schriftführ|schriftfuehr|präsidium|praesidium)/i.test(z)).slice(0, 14).map((z) => z.slice(0, 240))
        };
      }
      await new Promise((res) => setTimeout(res, ABSTAND_MS));
    }
    eintrag.ergebnis = eintrag.bewertung.ergebnis;
    ergebnisse.push(eintrag);
    console.log(`  ${eintrag.ergebnis.padEnd(16)} ${profil.mandatsId} (HTTP ${eintrag.status || "-"}, ${eintrag.dauerMs || 0} ms)`);
  }
  return { paketPfad, manifestPfad, lauf: zeitStempel(new Date()), abgerufeneSeiten: zusatz.length + ergebnisse.filter((e) => e.status != null).length, zusatzquellen: zusatz, ergebnisse };
}

function zusammenfassungMd(bericht) {
  const z = ["# Profil-Quellen-Verifikation — Zusammenfassung (Strenge-Stufe 2)", ""];
  z.push(`**Lauf:** ${bericht.lauf.tr} TR · ${bericht.lauf.berlin} Berlin · ${bericht.lauf.utc} UTC`);
  z.push(`**Abgerufene Seiten:** ${bericht.abgerufeneSeiten} (davon ${bericht.zusatzquellen.length} Zusatzquellen aus dem Manifest)`);
  const zaehler = {};
  for (const e of bericht.ergebnisse) zaehler[e.ergebnis] = (zaehler[e.ergebnis] || 0) + 1;
  z.push("", `**Ergebnis:** ${Object.entries(zaehler).map(([k, v]) => `${v}× ${k}`).join(" · ")} (${bericht.ergebnisse.length} Profile)`, "");
  z.push("| Profil | Ergebnis | HTTP | Endadresse | Dauer | SHA256 (Kurzform) |");
  z.push("|---|---|---|---|---|---|");
  for (const e of bericht.ergebnisse) {
    z.push(`| ${e.mandatsId} | **${e.ergebnis}** | ${e.status || "-"} | ${e.finalUrl || "-"} | ${e.dauerMs || 0} ms | ${(e.sha256 || "").slice(0, 12)} |`);
  }
  z.push("", "## Zusatzquellen (Manifest)", "");
  for (const q of bericht.zusatzquellen) {
    z.push(`- ${q.url} — HTTP ${q.status || "-"}, SHA256 ${(q.sha256 || "").slice(0, 12)}; ${q.zweck || ""}`);
    for (const b of q.belege || []) z.push(`  - ${b.mandatsId}: ${b.urteil}${b.umfeld ? ` — Umfeld: "${String(b.umfeld).slice(0, 220)}"` : ""}`);
  }
  z.push("", "## Gründe je nicht bestätigtem Profil", "");
  for (const e of bericht.ergebnisse) {
    if (e.ergebnis === "bestaetigt") continue;
    z.push(`### ${e.mandatsId} — ${e.ergebnis}`);
    for (const g of (e.bewertung && e.bewertung.gruende) || []) z.push(`- ROT: ${g}`);
    for (const g of (e.bewertung && e.bewertung.unbelegt) || []) z.push(`- UNBELEGT: ${g}`);
    z.push("");
  }
  z.push("Fehlende Information ist keine Bestätigung; ein nicht erreichbares oder nicht eindeutiges Profil gilt niemals als bestätigt.");
  return z.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
  const paketPfad = arg("--paket", path.join(__dirname, "..", "daten", "mandatsprofile-berlin-brandenburg-2026-08-24.json"));
  const manifestPfad = arg("--manifest", path.join(__dirname, "..", "daten", "profil-quellen-manifest-2026-08-24.json"));
  const outJson = arg("--out-json", "profil-verifikation-bericht.json");
  const outMd = arg("--out-md", "profil-verifikation-zusammenfassung.md");

  console.log(`Profil-Quellen-Verifikation (Strenge-Stufe 2) — ${paketPfad}`);
  const bericht = await pruefeAlle(paketPfad, manifestPfad);
  fs.writeFileSync(outJson, JSON.stringify(bericht, null, 1));
  fs.writeFileSync(outMd, zusammenfassungMd(bericht));

  console.log("\n===== PQV-REPORT-BEGIN =====");
  for (const q of bericht.zusatzquellen) console.log(`PQV-ZUSATZ ${JSON.stringify(q)}`);
  for (const e of bericht.ergebnisse) console.log(`PQV-PROFIL ${e.mandatsId} ${JSON.stringify(e)}`);
  console.log(`PQV-META ${JSON.stringify({ paketPfad: bericht.paketPfad, lauf: bericht.lauf, abgerufeneSeiten: bericht.abgerufeneSeiten })}`);
  console.log("===== PQV-REPORT-END =====\n");

  const alleBestaetigt = bericht.ergebnisse.every((e) => e.ergebnis === "bestaetigt");
  console.log(zusammenfassungMd(bericht));
  if (!alleBestaetigt) {
    console.log("\nERGEBNIS: NICHT alle Profile bestätigt — Details in Bericht/Zusammenfassung.");
    process.exit(1);
  }
  console.log("\nERGEBNIS: alle Profile bestätigt (Strenge-Stufe 2).");
}

module.exports = { ERLAUBTE_HOSTS, MAX_SEITEN, urlErlaubt, norm, htmlZuText, istHistorik, mitgliedschaften, belegeMandatsart, bewerteProfil, zusammenfassungMd };

if (require.main === module) {
  main().catch((e) => { console.error("FATAL:", e && e.stack || e); process.exit(2); });
}
