"use strict";
// Exportiert dieselbe UI mit ausdruecklichem Beispieladapter als einzelne Datei.
// Kein Backendclient, kein Builddienst, keine Appdaten oder Zugangsdaten im Export.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../verwaltung');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
function previewHtml(){
 const shared=moduleUrl(read('model.mjs'));
 const model=moduleUrl(read('einfach/model.mjs').replace("'../model.mjs'",JSON.stringify(shared)));
 const choices=moduleUrl(require('./profil-auswahl-paket').profileChoiceModule());
 const app=moduleUrl(read('einfach/app.mjs').replace("'./model.mjs'",JSON.stringify(model)).replace("'./profil-auswahl.mjs'",JSON.stringify(choices)));
 const example=moduleUrl(read('einfach/preview.mjs').replace("'./model.mjs'",JSON.stringify(model)));
 const boot=`import {mountAdministration} from ${JSON.stringify(app)};import {createPreviewApi} from ${JSON.stringify(example)};mountAdministration(document.querySelector('#verwaltung'),{api:createPreviewApi(),preview:true});`;
 return read('einfach/index.html')
  .replace('<title>Helmut · Verwaltung</title>','<title>Helmut · Verwaltungsvorschau</title>\n<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' data:; style-src \'unsafe-inline\'; connect-src \'none\'; img-src data:; base-uri \'none\'; form-action \'none\'">')
  .replace('<link rel="stylesheet" href="./styles.css">','<style>'+read('einfach/styles.css')+'</style>')
  .replace('<script type="module" src="./main.mjs"></script>','<script type="module">'+boot+'</script>');
}
if(require.main===module){const target=process.argv[2];if(!target)throw new Error('Zieldatei erforderlich');fs.writeFileSync(path.resolve(target),previewHtml());console.log('Private Offlinevorschau exportiert.');}
module.exports={previewHtml};
