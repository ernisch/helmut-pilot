'use strict';
const A=require('node:assert/strict'),Q=require('../lib/helmut/briefing-quellenqualitaet');
const now=new Date('2026-09-14T07:00:00Z');
const ko=hint=>({action_items_struct:[{title:'Unterlagen einreichen',dueHint:hint}]});
const doc=(summary,published_at='2026-09-14T06:00:00Z')=>({title:'Beratung der Unterlagen',summary,published_at});
let pass=0,fail=0;
function test(name,fn){try{fn();pass++;console.log('PASS '+name);}catch(e){fail++;console.error('FAIL '+name+': '+e.message);}}
test('Aktueller Artikel ohne Fristtext belegt keine heutige Uhrzeit',()=>A.equal(Q.relativeFristZulaessig(ko('heute 16 Uhr'),[doc(null)],now),false));
test('Aktualisiertes KO ersetzt fehlenden Terminbeleg nicht',()=>A.equal(Q.relativeFristZulaessig({...ko('heute'),updated_at:now.toISOString()},[doc(null,'2026-09-13T06:00:00Z')],now),false));
test('Konkrete absolute Abgabefrist bleibt erhalten',()=>A.equal(Q.relativeFristZulaessig(ko('heute 16 Uhr'),[doc('Die Unterlagen sind am 14.09.2026 bis 16 Uhr Berliner Zeit einzureichen.')],now),true));
test('Falsche Uhrzeit wird nicht durch passendes Datum bestätigt',()=>A.equal(Q.relativeFristZulaessig(ko('heute 18 Uhr'),[doc('Abgabe am 14.09.2026 bis 16 Uhr.')],now),false));
test('Frist von gestern rollt nicht auf heute weiter',()=>A.equal(Q.relativeFristZulaessig(ko('heute 16 Uhr'),[doc('Abgabe heute 16 Uhr.','2026-09-13T06:00:00Z')],now),false));
test('Morgen aus gestriger Quelle kann heute belegen',()=>A.equal(Q.relativeFristZulaessig(ko('heute 16 Uhr'),[doc('Abgabe morgen 16 Uhr.','2026-09-13T06:00:00Z')],now),true));
test('Morgen benötigt die nächste tatsächliche Kalenderfrist',()=>A.equal(Q.relativeFristZulaessig(ko('morgen 16 Uhr'),[doc('Abgabe am 15.09.2026 bis 16 Uhr.')],now),true));
test('Heutige Quelle mit gestriger absoluter Frist wird abgelehnt',()=>A.equal(Q.relativeFristZulaessig(ko('heute 16 Uhr'),[doc('Abgabe am 13.09.2026 bis 16 Uhr.')],now),false));
test('Jede Angabe benötigt einen Beleg',()=>A.equal(Q.relativeFristZulaessig({recommendation:'Heute 16 Uhr einreichen. Morgen 18 Uhr abstimmen.'},[doc('Abgabe am 14.09.2026 bis 16 Uhr.')],now),false));
test('Nachbarfeld morgen verschiebt keine heutige Uhrzeit',()=>A.equal(Q.relativeFristZulaessig({action_items_struct:[{description:'Vorbereitung morgen',dueHint:'heute 16 Uhr'}]},[doc('Abgabe morgen 16 Uhr.')],now),false));
test('Mittag benötigt einen passenden Zeitbeleg',()=>A.equal(Q.relativeFristZulaessig(ko('heute Mittag'),[doc('Abgabe am 14.09.2026 bis 12 Uhr.')],now),true));
test('Datum im Aktualitätstitel ist keine Bürofrist',()=>A.equal(Q.relativeFristZulaessig(ko('heute'),[{title:'Bericht Stand 14.09.2026',summary:null,published_at:'2026-09-14T06:00:00Z'}],now),false));
test('Frist kann nicht aus zwei Quelldokumenten zusammengesetzt werden',()=>A.equal(Q.relativeFristZulaessig(ko('heute 16 Uhr'),[doc('Abgabe am 14.09.2026.'),doc('Abgabe um 16 Uhr.')],now),false));
test('Fehlender oder zukünftiger Zeitanker bestätigt keine relative Aussage',()=>{for(const date of [null,'unbekannt','2026-09-15T06:00:00Z'])A.equal(Q.relativeFristZulaessig(ko('heute 16 Uhr'),[doc('Abgabe heute 16 Uhr.',date)],now),false);});
test('Zeitfreie Handlung bleibt unverändert möglich',()=>A.equal(Q.relativeFristZulaessig({recommendation:'Unterlagen prüfen.'},[],now),true));
test('Gültiger Beleg verhindert keine Ablaufprüfung',()=>A.equal(Q.relativeFristZulaessig(ko('heute 16 Uhr'),[doc('Abgabe am 14.09.2026 bis 16 Uhr.')],new Date('2026-09-14T14:00:00Z')),false));
test('Unbelegte Wochenfrist wird zurückgehalten',()=>A.equal(Q.relativeFristZulaessig(ko('bis Ende dieser Woche'),[doc(null)],now),false));
test('Wörtliche Wochenfrist mit gleichem Zeitanker bleibt möglich',()=>A.equal(Q.relativeFristZulaessig(ko('bis Ende dieser Woche'),[doc('Einreichungsfrist bis Ende dieser Woche.')],now),true));
test('Unbelegte Tagesenden und verbleibende Dauerfristen werden zurückgehalten',()=>{
 for(const hint of ['Bis Ende des Arbeitstages','48 Stunden','innerhalb 5 Werktage','bis zwei Tage','bis zwei Wochen','bei Bestätigung, bis eine Woche nach Trägergespräch','nächste Woche Mitte'])
  A.equal(Q.relativeFristZulaessig(ko(hint),[doc(null)],now),false,hint);
});
test('Wortgleiche Dauerfrist verlangt denselben Quelltag',()=>{
 for(const hint of ['bis Ende des Arbeitstages','innerhalb 5 Werktage','48 Stunden','nächste Woche Mitte']) {
  A.equal(Q.relativeFristZulaessig(ko(hint),[doc('Einreichungsfrist '+hint+'.')],now),true,hint);
  A.equal(Q.relativeFristZulaessig(ko(hint),[doc('Einreichungsfrist '+hint+'.','2026-09-13T06:00:00Z')],now),false,hint);
 }
});
test('Tagesende und Dauerfristen werden nur in der Ausgabekopie entfernt',()=>{
 const original={headline:'Beratung der Unterlagen',recommendation:'Bis Ende des Arbeitstages Unterlagen prüfen.',action_items_struct:[{title:'Unterlagen prüfen',dueHint:'48 Stunden'},{title:'Abstimmung vorbereiten',dueHint:'nach interner Einigung'}]};
 const before=JSON.stringify(original),clean=Q.mitBelegtenHandlungsfristen(original,[doc(null)],now);
 A.equal(clean.recommendation,'');A.equal(clean.action_items_struct[0].dueHint,'');
 A.equal(clean.action_items_struct[0].title,'Unterlagen prüfen');A.equal(clean.action_items_struct[1].dueHint,'nach interner Einigung');
 A.equal(clean.headline,original.headline);A.equal(JSON.stringify(original),before);
});
test('Komma trennt eine alte absolute Frist nicht von ihrer Uhrzeit',()=>A.equal(Q.relativeFristZulaessig(ko('heute 16 Uhr'),[doc('Abgabe am 13.09.2026, bis 16 Uhr.')],now),false));
test('Verneinte oder aufgehobene Frist ist kein positiver Beleg',()=>{for(const text of ['Keine Abgabe heute 16 Uhr.','Frist heute 16 Uhr aufgehoben.','Nicht bis heute 16 Uhr einreichen.'])A.equal(Q.relativeFristZulaessig(ko('heute 16 Uhr'),[doc(text)],now),false);});
test('Fremde Zeitzone wird nicht still als Berliner Uhrzeit behandelt',()=>A.equal(Q.relativeFristZulaessig(ko('heute 16 Uhr'),[doc('Abgabe am 14.09.2026 bis 16 Uhr UTC.')],now),false));
test('Absage im Titel kann nicht durch alte Frist im Auszug überstimmt werden',()=>A.equal(Q.relativeFristZulaessig(ko('heute 16 Uhr'),[{...doc('Abgabe heute 16 Uhr.'),title:'Frist aufgehoben'}],now),false));
test('Ausgabekopie bewahrt Sachtext und zeitfreie Aufgabe ohne erfundene Frist',()=>{
 const original={headline:'Ausschuss berät Unterlagen',recommendation:'Heute 16 Uhr einreichen.',action_items:['Heute 16 Uhr einreichen.','Unterlagen prüfen.'],action_items_struct:[{title:'Unterlagen prüfen',description:'Relevante Änderungen erfassen.',dueHint:'heute 16 Uhr'}]};
 const before=JSON.stringify(original),clean=Q.mitBelegtenHandlungsfristen(original,[doc(null)],now);
 A.equal(clean.headline,original.headline);A.equal(clean.recommendation,'');A.deepEqual(clean.action_items,['Unterlagen prüfen.']);A.equal(clean.action_items_struct[0].dueHint,'');A.equal(clean.action_items_struct[0].title,'Unterlagen prüfen');A.equal(JSON.stringify(original),before);
});
console.log(`${pass}/${pass+fail} Gruppen bestanden; ${fail} fehlgeschlagen.`);if(fail)process.exitCode=1;
