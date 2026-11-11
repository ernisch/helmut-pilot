"use strict";

// Baut nur einen Integrationskandidaten. Kein Serverstart und kein Netz-/Motorimport.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const root = path.join(__dirname, "..", "verwaltung");
const originalDir = path.join(root, "claude-original");
const entryName = "Helmut Verwaltung v3.dc.html";
const runtimeAssets = Object.freeze([
  { original: "https://unpkg.com/react@18.3.1/umd/react.production.min.js", path: "runtime/react-18.3.1.production.min.js", sha384: "DGyLxAyjq0f9SPpVevD6IgztCFlnMF6oW/XQGmfe+IsZ8TqEiDrcHkMLKI6fiB/Z" },
  { original: "https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js", path: "runtime/react-dom-18.3.1.production.min.js", sha384: "gTGxhz21lVGYNMcdJOyq01Edg0jhn/c22nsx0kyqP0TxaV5WVdsSH1fSDUf5YJj1" }
]);

function originalAdministrationPackage() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "claude-original-manifest.json"), "utf8"));
  const assets = new Map();
  for (const file of manifest.files) {
    assert.ok(!path.isAbsolute(file.path) && !file.path.split(/[\\/]/).includes(".."));
    const bytes = fs.readFileSync(path.join(originalDir, file.path));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), file.sha256, file.path);
    // Synthetischer Generator und unbearbeiteter Prototyp sind kein Live-Asset.
    if (![entryName, "v3_logik.js"].includes(file.path)) assets.set(file.path, bytes);
  }
  const read = name => fs.readFileSync(path.join(root, name), "utf8");
  const withoutImports = source => source.replace(/^import\s[^;]+;\s*/gm, "");
  const bundle = ["model.mjs", "api.mjs", "original-actions.mjs", "original-daily-ledger.mjs", "original-ergebnisse.mjs", "original-adapter.mjs", "original-controller.mjs", "original-customer-form.mjs", "original-quellenlauf.mjs"]
    .map(name => withoutImports(read(name))).join("\n").replace(/^export\s+(?=(?:const|(?:async\s+)?function|class)\b)/gm, "");
  const remap = Object.fromEntries(runtimeAssets.map(asset => [asset.original, `./${asset.path}`]));
  // Original-Runtime erlaubt bereits explizite lokale Ressourcen. Keine CDN-Fallbacks.
  remap["https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"] = "./runtime/babel-unbenutzt.js";
  const bootstrap = `window.__resources=${JSON.stringify(remap)};\n${bundle}\nwindow.HelmutOriginalBackend={attachOriginalBackend,createAdminActions,attachCustomerForm,attachQuellenlauf};`;
  // Darstellungskorrekturen gegen Design v3 (06.11.2026). Jede Stelle muss genau so oft
  // vorkommen wie erwartet, sonst bricht der Paketbau ab statt still nichts zu ändern.
  const designUpdates = source => [
    // Kein Gold als Akzent: der Aktualisieren-Knopf wird ein ruhiger Hairline-Knopf.
    ['border:1px solid var(--watch);background:transparent;color:var(--warn-ink)', 'border:1px solid var(--line-2);background:transparent;color:var(--text)', 1],
    ['border:1px solid var(--watch);background:transparent;color:var(--watch)', 'border:1px solid var(--line-2);background:transparent;color:var(--text)', 1],
    // Navigationspunkte bleiben einzeilig (z. B. „Erweiterte Werkzeuge“).
    ['<span>{{ n.label }}</span>', '<span style="white-space:nowrap">{{ n.label }}</span>', 2],
    // Mobile Profilkarte: Kostenwert ist ohne Spaltenkopf nur mit Bezeichnung verständlich.
    ['<span>{{ r.cost }}</span>', '<span>Kosten {{ r.cost }}</span>', 1],
    // Drei Positionen je Profil: Briefing · Zustellung · Lage. Radar nur im Profildetail.
    ['<span role="columnheader">Briefing</span><span role="columnheader">Lage</span><span role="columnheader">Radar</span>', '<span role="columnheader">Briefing</span><span role="columnheader">Zustellung</span><span role="columnheader">Lage</span>', 1],
    ['Lage {{ r.l.low }}', 'Zustellung {{ r.l.low }}', 1],
    ['Radar {{ r.rd.low }}', 'Lage {{ r.rd.low }}', 1],
    // Leerzustände statt leerer Flächen.
    ['{{ c.last }}</span></a></sc-for></div>', '{{ c.last }}</span></a></sc-for><sc-if value="{{ custEmpty }}" hint-placeholder-val="{{ false }}"><p style="padding:22px 0;border-top:1px solid var(--line);font-size:15px;color:var(--text)">Noch keine Kunden angelegt.</p></sc-if></div>', 1],
    ['{{ r.tech }}</span></div></sc-for></div>', '{{ r.tech }}</span></div></sc-for><sc-if value="{{ runsEmpty }}" hint-placeholder-val="{{ false }}"><p style="padding:18px 0;border-top:1px solid var(--line);font-size:14px;color:var(--muted)">Keine Laufbelege gelesen.</p></sc-if></div>', 1]
  ].reduce((text, [from, to, count]) => {
    assert.equal(text.split(from).length - 1, count, `Designstelle fehlt: ${from.slice(0, 60)}`);
    return text.split(from).join(to);
  }, source);
  const contentUpdates = source => designUpdates(source).replace('title="Prototyp: Ansicht und Simulation"', 'title="Daten neu laden"')
    .replace('>Entwurf · Beispieldaten</button>', '>Aktualisieren</button>')
    .replace('>Beispieldaten</button>', '>Aktualisieren</button>')
    .replace('Läufe heute', 'Letzte Läufe')
    .replace('Kein Profil fällt auf.', 'Profilkosten sind noch nicht vollständig zugeordnet.')
    .replace('Lexware Office verbunden · letzter Abgleich 08:30', 'Keine Rechnungsanbindung und kein Abgleich belegt')
    .replace('background:var(--chance);transform:translateY(-1px)"></span>Keine Rechnungsanbindung', 'background:{{ invoiceDot }};transform:translateY(-1px)"></span>Keine Rechnungsanbindung')
    .replace('Rechnungsnummern und Zahlungen kommen aus Lexware. Storno zählt nie als Zahlung.', 'Rechnungen und Zahlungen sind hier noch nicht angebunden. Manuell gepflegte Kontodaten ersetzen keine Rechnungsverwaltung.')
    .replace('Schätzwerte einschließlich offener Reservierungen.', 'Schätzwerte; offene Beträge werden ausdrücklich gekennzeichnet.')
    .replace('Simulierte Aktion · {{ dlg.api }}', 'Kontozugang ändern · serverseitige Prüfung')
    .replace('Wird als Entwurf gespeichert. Einladung und Rechnung folgen erst nach Freigabe.', 'Speichert ein gesperrtes Konto und deinen Tarifwunsch. Preis bleibt offen. Keine Einladung, Rechnung oder Profilanlage. Ohne Auswahl wird eine Kennung automatisch vergeben; bitte die Profilreferenz prüfen.')
    .replace('>Später zuordnen</option>', '>Kennung automatisch vergeben · Profil prüfen</option>')
    .replace('Basis · 290 EUR im Monat', 'Basis · Preis offen')
    .replace('Büro · 490 EUR im Monat', 'Büro · Preis offen')
    .replace('Fraktion · 1.200 EUR im Monat', 'Fraktion · Preis offen')
    .replace('value="{{ f.value }}" onChange="{{ f.onChange }}"', 'value="{{ f.value }}" onChange="{{ f.onChange }}" disabled="{{ customerFormBusy || customerFormLocked }}"')
    .replace('value="{{ form.tarif }}" onChange="{{ setTarif }}"', 'value="{{ form.tarif }}" onChange="{{ setTarif }}" disabled="{{ customerFormBusy || customerFormLocked }}"')
    .replace('value="{{ form.profil }}" onChange="{{ setProfil }}"', 'value="{{ form.profil }}" onChange="{{ setProfil }}" disabled="{{ customerFormBusy || customerFormLocked }}"')
    .replace('type="submit" style=', 'type="submit" disabled="{{ customerSubmitDisabled }}" style=')
    .replace('>Als Entwurf speichern</button>', '>{{ customerSubmitLabel }}</button>');
  const quellenStart = source => {
    const marker = '<p style="margin-top:30px;font-family:\'Spectral\',Georgia,serif;font-size:clamp(22px,2.4vw,28px);line-height:1.3;color:var(--ink);max-width:44ch;text-wrap:pretty">{{ srcHead }}</p>';
    assert.equal(source.split(marker).length - 1, 1, "Quellenstart-Einbaupunkt");
    return source.replace(marker, marker + `<section aria-label="Quellenlauf" style="margin-top:20px;max-width:72ch">
<button type="button" onClick="{{ quellenlaufStart }}" disabled="{{ quellenlaufBusy }}" style="min-height:44px;padding:8px 14px;border-radius:8px;border:1px solid var(--line-2);background:transparent;color:var(--ink);font-size:14px">Quellenlauf jetzt starten</button>
<p role="status" aria-live="polite" style="margin-top:12px;font-size:14px;overflow-wrap:anywhere">{{ quellenlaufText }}</p>
<sc-if value="{{ quellenlaufStatus }}" hint-placeholder-val="{{ false }}"><button type="button" onClick="{{ quellenlaufPruefen }}" style="min-height:44px;background:transparent;color:var(--ink);border:1px solid var(--line-2);border-radius:8px;padding:8px 14px">Status prüfen</button></sc-if>
</section>`);
  };
  let html = quellenStart(contentUpdates(read(`claude-original/${entryName}`)));
  html = html.replace('<script src="./support.js"></script>', `<script>${bootstrap.replace(/<\/script/gi, "<\\/script")}</script>\n<script src="./support.js"></script>`);
  html = html.replace('<script src="v3_logik.js"></script>', "");
  html = html.replace(/(class Component extends DCLogic[\s\S]*?)(<\/script>)/, "$1\nComponent = window.HelmutOriginalBackend.attachQuellenlauf(window.HelmutOriginalBackend.attachCustomerForm(window.HelmutOriginalBackend.attachOriginalBackend(Component, {actionsFactory: window.HelmutOriginalBackend.createAdminActions})));\n$2");
  // Nur die oben benannten Darstellungskorrekturen; sonst kein neues Markup und keine neue Typografie.
  const template = source => source.match(/<x-dc\b[^>]*>([\s\S]*?)<\/x-dc>/i)[1].replace('<script src="v3_logik.js"></script>', "");
  assert.equal(template(html), template(quellenStart(contentUpdates(read(`claude-original/${entryName}`)))));
  return { html, assets, runtimeAssets };
}

function addVerifiedRuntimeAssets(pkg, runtimeDir) {
  for (const spec of runtimeAssets) {
    const bytes = fs.readFileSync(path.join(runtimeDir, path.basename(spec.path)));
    assert.equal(crypto.createHash("sha384").update(bytes).digest("base64"), spec.sha384, `Original-SRI: ${spec.path}`);
    pkg.assets.set(spec.path, bytes);
  }
  return pkg;
}

module.exports = { originalAdministrationPackage, addVerifiedRuntimeAssets };
