"use strict";

// Helmut — LESER DER ECHTEN CLOUDFORMATION-VORLAGE (Verkabelungslauf 2026-08-14/4).
// =============================================================================================
// WARUM ES DIESE DATEI GIBT: Der Ende-zu-Ende-Test hat bisher seine eigene Umgebung
// zusammengeschrieben und den Relay-Ausloeser eingesetzt. Er war gruen — und die Vorlage setzte
// `HELMUT_RELAY_FUNKTION` trotzdem nicht. Der Test bewies den Code, nicht die VERKABELUNG.
//
// Ab jetzt liest der Test dieselbe Datei, die spaeter nach AWS geht, und leitet daraus ab:
//   * welche Umgebungsvariablen eine Funktion WIRKLICH bekommt,
//   * welche IAM-Anweisungen ihre Rolle WIRKLICH traegt,
//   * welchen Namen bzw. welche ARN eine Ressource zur Laufzeit haette.
// Eine fehlende Zeile in der Vorlage laesst damit den Gesamtweg fallen, nicht nur einen
// Textvergleich.
//
// KEIN YAML-PARSER ALS ABHAENGIGKEIT. Das Repository traegt bewusst fast keine
// Laufzeitabhaengigkeiten. Dieser Leser deckt genau die Teilmenge ab, die die Vorlage benutzt
// (Bloecke ueber Einrueckung, Skalare, Listen, `!Ref`, `!Sub`, `!GetAtt`, `!If`) — und faellt
// bei allem Unbekannten AUF: `aufloese` wirft, statt zu raten.
//
// DIE RUECKGABEWERTE DER INTRINSISCHEN FUNKTIONEN sind die von AWS dokumentierten:
//   * `!Ref` auf AWS::Lambda::Function  -> FUNKTIONSNAME
//   * `!GetAtt <Funktion>.Arn`          -> Funktions-ARN
//   * `!Ref` auf AWS::SQS::Queue        -> Queue-URL
//   * `!GetAtt <Queue>.Arn`             -> Queue-ARN
//   * `!Ref` auf AWS::KMS::Key          -> Schluessel-ID, `!GetAtt .Arn` -> Schluessel-ARN
//   * `!Ref` auf einen Parameter        -> dessen Wert (hier: Default)
// Quellenlage siehe docs/betrieb/op30-zielarchitektur-2026-08-13.md §25.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const VORLAGE = path.join(ROOT, "infra", "aws", "helmut-auftrags-queue.yaml");

// Feste, offensichtlich synthetische Werte fuer die Pseudoparameter. Sie sind KEINE echten
// AWS-Angaben und duerfen es auch nie sein — der Test legt nichts an.
const KONTO = "123456789012";
const REGION = "eu-central-1";

function ladeText(datei = VORLAGE) {
  return fs.readFileSync(datei, "utf8");
}

// Kommentarzeilen und Zeilenendkommentare entfernen — die Vorlage BEGRUENDET ausdruecklich,
// welche Rechte sie NICHT vergibt ("KEIN sqs:SendMessage"). Ein roher Textvergleich wuerde
// genau diese Begruendung als Vergabe lesen.
function ohneKommentare(text) {
  return text
    .split("\n")
    .filter((z) => !/^\s*#/.test(z))
    .map((z) => z.replace(/\s+#(?![^'"]*['"]\s*$).*$/, ""))
    .join("\n");
}

function einrueckung(zeile) {
  const t = zeile.match(/^(\s*)/);
  return t ? t[1].length : 0;
}

// Liefert den Block einer Ressource/eines Schluessels als Zeilenliste (ohne die Kopfzeile).
function block(text, pfad) {
  const teile = Array.isArray(pfad) ? pfad : [pfad];
  let zeilen = ohneKommentare(text).split("\n");
  let basis = -1;
  for (const teil of teile) {
    let start = -1;
    for (let i = 0; i < zeilen.length; i += 1) {
      const z = zeilen[i];
      if (!z.trim() || z.trim().startsWith("-")) continue;
      const tiefe = einrueckung(z);
      if (basis >= 0 && tiefe !== basis) continue;
      const name = (z.match(/^\s*([A-Za-z0-9_:.-]+)\s*:/) || [])[1];
      if (name === teil) { start = i; basis = tiefe; break; }
    }
    if (start < 0) return null;
    const innen = [];
    for (let i = start + 1; i < zeilen.length; i += 1) {
      const z = zeilen[i];
      if (!z.trim()) { innen.push(z); continue; }
      if (einrueckung(z) <= basis) break;
      innen.push(z);
    }
    zeilen = innen;
    basis = -1;
    for (const z of innen) { if (z.trim()) { basis = einrueckung(z); break; } }
  }
  return zeilen;
}

// Flache Schluessel/Wert-Paare eines Blocks (nur die oberste Ebene, Werte als ROHTEXT).
function paare(zeilen) {
  if (!zeilen) return {};
  const erg = {};
  let basis = -1;
  for (const z of zeilen) { if (z.trim()) { basis = einrueckung(z); break; } }
  for (let i = 0; i < zeilen.length; i += 1) {
    const z = zeilen[i];
    if (!z.trim() || einrueckung(z) !== basis) continue;
    const t = z.match(/^\s*([A-Za-z0-9_:.-]+)\s*:\s*(.*)$/);
    if (!t) continue;
    let wert = t[2].trim();
    if (!wert) {
      // Mehrzeiliger Wert (Liste oder Block) -> als Rohtext einsammeln.
      const rest = [];
      for (let j = i + 1; j < zeilen.length; j += 1) {
        if (zeilen[j].trim() && einrueckung(zeilen[j]) <= basis) break;
        rest.push(zeilen[j]);
      }
      wert = rest.join("\n");
    }
    erg[t[1]] = wert;
  }
  return erg;
}

// ── Aufloesung der intrinsischen Funktionen ──────────────────────────────────────────────────
function parameterWerte(text) {
  const p = block(text, "Parameters");
  const erg = {};
  if (!p) return erg;
  let basis = -1;
  for (const z of p) { if (z.trim()) { basis = einrueckung(z); break; } }
  for (const z of p) {
    if (!z.trim() || einrueckung(z) !== basis) continue;
    const name = (z.match(/^\s*([A-Za-z0-9_]+)\s*:/) || [])[1];
    if (!name) continue;
    const eigen = paare(block(text, ["Parameters", name]));
    if (eigen.Default !== undefined) erg[name] = String(eigen.Default).replace(/^['"]|['"]$/g, "");
  }
  return erg;
}

// Der Wert, den `!Ref <Ressource>` zur Laufzeit liefert — je Ressourcentyp verschieden.
function refWert(text, name, parameter) {
  if (parameter[name] !== undefined) return parameter[name];
  if (name === "AWS::Region") return REGION;
  if (name === "AWS::AccountId") return KONTO;
  if (name === "AWS::Partition") return "aws";
  if (name === "AWS::NoValue") return undefined;

  const res = block(text, ["Resources", name]);
  if (!res) throw new Error(`Unbekannte Referenz in der Vorlage: ${name}`);
  const kopf = paare(res);
  const typ = String(kopf.Type || "").trim();
  const eigen = paare(block(text, ["Resources", name, "Properties"]) || []);

  if (typ === "AWS::Lambda::Function") {
    return aufloese(text, eigen.FunctionName, parameter);          // Ref -> Funktionsname
  }
  if (typ === "AWS::SQS::Queue") {
    const qname = aufloese(text, eigen.QueueName, parameter);
    return `https://sqs.${REGION}.amazonaws.com/${KONTO}/${qname}`; // Ref -> Queue-URL
  }
  if (typ === "AWS::KMS::Key") {
    return `${name.toLowerCase()}-schluessel-id`;                   // Ref -> Schluessel-ID
  }
  if (typ === "AWS::IAM::Role") {
    return aufloese(text, eigen.RoleName, parameter);
  }
  throw new Error(`Ref auf nicht abgedeckten Ressourcentyp ${typ} (${name})`);
}

function getAttWert(text, name, attribut, parameter) {
  const res = block(text, ["Resources", name]);
  if (!res) throw new Error(`Unbekanntes GetAtt-Ziel: ${name}`);
  const typ = String(paare(res).Type || "").trim();
  const eigen = paare(block(text, ["Resources", name, "Properties"]) || []);
  if (attribut !== "Arn") throw new Error(`GetAtt-Attribut ${attribut} nicht abgedeckt`);
  if (typ === "AWS::Lambda::Function") {
    return `arn:aws:lambda:${REGION}:${KONTO}:function:${aufloese(text, eigen.FunctionName, parameter)}`;
  }
  if (typ === "AWS::SQS::Queue") {
    return `arn:aws:sqs:${REGION}:${KONTO}:${aufloese(text, eigen.QueueName, parameter)}`;
  }
  if (typ === "AWS::KMS::Key") {
    return `arn:aws:kms:${REGION}:${KONTO}:key/${name.toLowerCase()}-schluessel-id`;
  }
  if (typ === "AWS::IAM::Role") {
    return `arn:aws:iam::${KONTO}:role/${aufloese(text, eigen.RoleName, parameter)}`;
  }
  throw new Error(`GetAtt auf nicht abgedeckten Ressourcentyp ${typ} (${name})`);
}

// Loest einen ROHWERT aus der Vorlage auf. Wirft bei allem, was nicht abgedeckt ist —
// lieber ein lauter Testfehler als eine stille Falschannahme.
function aufloese(text, roh, parameter = parameterWerte(text)) {
  if (roh === undefined || roh === null) return roh;
  let s = String(roh).trim();
  if (!s) return s;

  const ifTreffer = s.match(/^!If\s*\[\s*([A-Za-z0-9_]+)\s*,\s*(.+?)\s*,\s*(.+?)\s*\]$/s);
  if (ifTreffer) return aufloese(text, ifTreffer[2], parameter);   // Bedingung gilt als erfuellt

  const refTreffer = s.match(/^!Ref\s+'?([A-Za-z0-9_:.]+)'?$/);
  if (refTreffer) return refWert(text, refTreffer[1], parameter);

  const attTreffer = s.match(/^!GetAtt\s+'?([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)'?$/);
  if (attTreffer) return getAttWert(text, attTreffer[1], attTreffer[2], parameter);

  const subTreffer = s.match(/^!Sub\s+'([^']*)'$/) || s.match(/^!Sub\s+"([^"]*)"$/);
  if (subTreffer) {
    return subTreffer[1].replace(/\$\{([A-Za-z0-9_:.]+)\}/g, (_, name) => {
      if (name.includes(".")) {
        const [r, a] = name.split(".");
        return String(getAttWert(text, r, a, parameter));
      }
      return String(refWert(text, name, parameter));
    });
  }

  if (/^!/.test(s)) throw new Error(`Nicht abgedeckte intrinsische Funktion: ${s.slice(0, 60)}`);
  return s.replace(/^['"]|['"]$/g, "");
}

// ── Die drei Auskuenfte, die die Tests brauchen ─────────────────────────────────────────────

// Die Umgebungsvariablen, die eine Funktion in AWS WIRKLICH bekaeme — vollstaendig aufgeloest.
function umgebung(text, funktion) {
  const roh = paare(block(text, ["Resources", funktion, "Properties", "Environment", "Variables"]) || []);
  const parameter = parameterWerte(text);
  const erg = {};
  for (const [k, v] of Object.entries(roh)) erg[k] = String(aufloese(text, v, parameter));
  return erg;
}

// Alle IAM-Anweisungen, die auf eine Rolle wirken: aus der Rolle selbst UND aus jeder
// zusaetzlichen AWS::IAM::Policy, die sie in `Roles` nennt.
function iamAnweisungen(text, rolle) {
  const parameter = parameterWerte(text);
  const sauber = ohneKommentare(text);
  const quellen = [["Resources", rolle, "Properties", "Policies"]];

  const resBlock = block(sauber, "Resources") || [];
  let basis = -1;
  for (const z of resBlock) { if (z.trim()) { basis = einrueckung(z); break; } }
  for (const z of resBlock) {
    if (!z.trim() || einrueckung(z) !== basis) continue;
    const name = (z.match(/^\s*([A-Za-z0-9_]+)\s*:/) || [])[1];
    if (!name || name === rolle) continue;
    const kopf = paare(block(sauber, ["Resources", name]) || []);
    if (String(kopf.Type || "").trim() !== "AWS::IAM::Policy") continue;
    const eigen = paare(block(sauber, ["Resources", name, "Properties"]) || []);
    if (!new RegExp(`!Ref\\s+${rolle}\\b`).test(String(eigen.Roles || ""))) continue;
    quellen.push(["Resources", name, "Properties", "PolicyDocument", "Statement"]);
  }

  const anweisungen = [];
  for (const pfad of quellen) {
    const roh = block(sauber, pfad);
    if (!roh) continue;
    const text2 = roh.join("\n");
    // Anweisungen beginnen mit "- Effect:"; alles bis zum naechsten gehoert dazu.
    const stuecke = text2.split(/^\s*-\s+Effect:/m).slice(1);
    for (const stueck of stuecke) {
      const effekt = (stueck.match(/^\s*(\w+)/) || [])[1] || "";
      const actions = [...stueck.matchAll(/['"]?((?:sqs|kms|ssm|logs|lambda|sts):[A-Za-z*]+)['"]?/g)]
        .map((m) => m[1]);
      const resTeil = stueck.split(/\bResource:/).slice(1).join("\nResource:");
      const resourcen = [...resTeil.matchAll(/(!Sub\s+'[^']*'|!GetAtt\s+[A-Za-z0-9_]+\.[A-Za-z0-9_]+|!Ref\s+[A-Za-z0-9_]+|'[^']*'|"[^"]*")/g)]
        .map((m) => {
          try { return String(aufloese(sauber, m[1], parameter)); } catch (_) { return m[1]; }
        });
      anweisungen.push({ effekt, actions, resourcen, roh: stueck });
    }
  }
  return anweisungen;
}

// Darf `rolle` die Aktion `aktion` auf `ziel` ausfuehren? Genau diese Frage stellt der
// Gesamtweg, bevor er einen Aufruf ueber die AWS-Grenze laesst.
function darf(text, rolle, aktion, ziel) {
  return iamAnweisungen(text, rolle).some((a) =>
    a.effekt === "Allow"
    && a.actions.includes(aktion)
    && a.resourcen.some((r) => r === ziel));
}

module.exports = {
  VORLAGE, KONTO, REGION,
  ladeText, ohneKommentare, block, paare,
  parameterWerte, aufloese, umgebung, iamAnweisungen, darf
};
