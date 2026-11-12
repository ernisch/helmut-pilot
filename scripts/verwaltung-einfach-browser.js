"use strict";
const path=require('node:path'),fs=require('node:fs');
const dir=path.resolve(__dirname,'../docs/ui/verwaltung-einfach-20261111');
fs.mkdirSync(dir,{recursive:true});
require('./admin-einfach-test').run({browser:true,evidenceDir:dir}).then(r=>console.log('PASS '+r.passed+' Gruppen mit Browser')).catch(e=>{console.error(e);process.exitCode=1;});
