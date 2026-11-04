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
  const bundle = ["model.mjs", "api.mjs", "original-actions.mjs", "original-daily-ledger.mjs", "original-adapter.mjs", "original-controller.mjs", "original-customer-form.mjs"]
    .map(name => withoutImports(read(name))).join("\n").replace(/^export\s+(?=(?:const|(?:async\s+)?function|class)\b)/gm, "");
  const remap = Object.fromEntries(runtimeAssets.map(asset => [asset.original, `./${asset.path}`]));
  // Original-Runtime erlaubt bereits explizite lokale Ressourcen. Keine CDN-Fallbacks.
  remap["https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"] = "./runtime/babel-unbenutzt.js";
  const bootstrap = `window.__resources=${JSON.stringify(remap)};\n${bundle}\nwindow.HelmutOriginalBackend={attachOriginalBackend,createAdminActions,attachCustomerForm};`;
  const contentUpdates = source => source.replace('title="Prototyp: Ansicht und Simulation"', 'title="Daten neu laden"')
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
  let html = contentUpdates(read(`claude-original/${entryName}`));
  html = html.replace('<script src="./support.js"></script>', `<script>${bootstrap.replace(/<\/script/gi, "<\\/script")}</script>\n<script src="./support.js"></script>`);
  html = html.replace('<script src="v3_logik.js"></script>', "");
  html = html.replace(/(class Component extends DCLogic[\s\S]*?)(<\/script>)/, "$1\nComponent = window.HelmutOriginalBackend.attachCustomerForm(window.HelmutOriginalBackend.attachOriginalBackend(Component, {actionsFactory: window.HelmutOriginalBackend.createAdminActions}));\n$2");
  // Kein neues Markup, keine neue Typografie, keine neuen Styles.
  const template = source => source.match(/<x-dc\b[^>]*>([\s\S]*?)<\/x-dc>/i)[1].replace('<script src="v3_logik.js"></script>', "");
  assert.equal(template(html), template(contentUpdates(read(`claude-original/${entryName}`))));
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
