"use strict";
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'verwaltung');
const files = ['index.html', 'styles.css', 'main.mjs', 'app.mjs', 'model.mjs', 'api.mjs', 'versorgung.mjs'];
let cached;
function simpleAdministrationPackage() {
 if (cached) return cached;
 const assets = new Map();
 for (const name of files) assets.set('einfach/'+name, fs.readFileSync(path.join(root, 'einfach', name)));
 assets.set('einfach/profil-auswahl.mjs', Buffer.from(require('./profil-auswahl-paket').profileChoiceModule()));
 assets.set('einfach/', assets.get('einfach/index.html'));
 for (const name of ['api.mjs', 'model.mjs', 'original-actions.mjs', 'original-quellenlauf.mjs']) assets.set(name, fs.readFileSync(path.join(root, name)));
 const brand=path.join(__dirname,'..','assets','ui');
 for(const [file,source] of [['logo.svg','logo/helmut-zeichen.svg'],['sans.woff2','fonts/HankenGrotesk-var.woff2'],['serif.woff2','fonts/Spectral-Regular.woff2']])assets.set('einfach/'+file,fs.readFileSync(path.join(brand,source)));
 cached = assets; return assets;
}
module.exports = { simpleAdministrationPackage };
