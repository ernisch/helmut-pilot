"use strict";
// Eine Datenquelle: dieselben Listen wie der bestehende Profil-Editor.
// Nur deklarierte JSON-Arrays lesen, niemals client.js ausfuehren.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function profileChoiceModule() {
 const client = fs.readFileSync(path.join(root, 'client.js'), 'utf8');
 const names = ['profilePartyOptions', 'profileFactionOptions', 'federalStateOptions'];
 const lists = Object.fromEntries(names.map(name => {
  const match = client.match(new RegExp('const '+name+' = (\\[[\\s\\S]*?\\]);'));
  if (!match) throw new Error('Profil-Auswahlliste fehlt: '+name);
  const values = JSON.parse(match[1]);
  if (!Array.isArray(values) || !values.length || values.some(v => typeof v !== 'string' || !v.trim())) throw new Error('Profil-Auswahlliste ungueltig: '+name);
  return [name, values];
 }));
 const districts = JSON.parse(fs.readFileSync(path.join(root, 'assets/profil-wahlkreise.json'), 'utf8')).constituencies;
 for (const level of ['Bundestag', 'Landtag']) for (const state of lists.federalStateOptions) {
  const values = districts?.[level]?.[state];
  if (!Array.isArray(values) || !values.length || values.some(v => typeof v !== 'string' || !v.trim())) throw new Error('Wahlkreisliste unvollstaendig: '+level+'/'+state);
 }
 return '// Generiert aus client.js und assets/profil-wahlkreise.json; nicht von Hand aendern.\n'
  + names.map(name => 'export const '+name+' = '+JSON.stringify(lists[name])+';\n').join('')
  + 'export const profileConstituencies = '+JSON.stringify(districts)+';\n'
  + 'export function constituencyChoices(level, state, current = "") {\n'
  + ' return [...new Set([current, ...(profileConstituencies[level]?.[state] || []), "Kein Wahlkreis (Landesliste)"].filter(Boolean))];\n}\n';
}
if (require.main === module) fs.writeFileSync(path.join(root, 'verwaltung/einfach/profil-auswahl.mjs'), profileChoiceModule());
module.exports = { profileChoiceModule };
