"use strict";
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'verwaltung');
const files = ['index.html', 'styles.css', 'main.mjs', 'app.mjs', 'model.mjs', 'api.mjs'];
let cached;
function simpleAdministrationPackage() {
 if (cached) return cached;
 const assets = new Map();
 for (const name of files) assets.set('einfach/'+name, fs.readFileSync(path.join(root, 'einfach', name)));
 assets.set('einfach/', assets.get('einfach/index.html'));
 for (const name of ['api.mjs', 'model.mjs', 'original-actions.mjs']) assets.set(name, fs.readFileSync(path.join(root, name)));
 cached = assets; return assets;
}
module.exports = { simpleAdministrationPackage };
