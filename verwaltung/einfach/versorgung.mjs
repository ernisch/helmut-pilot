import { customerState, profileFor } from './model.mjs';
export function briefingSummary(data) {
 const rows=data.customers.map(c=>({customer:c,profile:profileFor(data,c),state:customerState(data,c)}));
 return {ready:rows.filter(r=>r.state.key==='current').length,
  attention:rows.filter(r=>r.state.key==='problem').length,
  open:rows.filter(r=>['unknown','setup'].includes(r.state.key)).length,
  paused:rows.filter(r=>r.state.key==='paused').length,total:rows.length};
}
export function latestSourceRun(history,now=new Date()) {
 const rows=history?.processRuns;
 if(!Array.isArray(rows))return null;
 const row=rows.filter(r=>r?.process==='warteschlange-crawl'&&Number.isFinite(Date.parse(r.startedAt)))
  .sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt))[0];
 if(!row)return null;
 const ended=Number.isFinite(Date.parse(row.finishedAt)),elapsed=+new Date(now)-Date.parse(row.startedAt);
 const label=row.status==='running'?(elapsed>=0&&elapsed<300000?'Läuft':'Abschluss offen')
  :ended&&row.status==='success'?'Abgeschlossen':ended&&['partial','failed','timeout'].includes(row.status)?'Mit offenen Aufgaben':'Nicht bestätigt';
 return {...row,label};
}
// Ausschließlich den vom Server gelieferten täglichen UTC-Zeitplan auswerten.
// Ein geplanter Prüftermin ist keine Zusage, dass ein Lauf zugelassen wird.
export function nextSourceCheck(history,now=new Date()) {
 if(!Array.isArray(history?.zeitplan))return null;
 const entries=history.zeitplan.filter(e=>/^\/api\/cron\/crawl(?:\?arbeitsfenster=1)?$/.test(e.path||''));
 const times=[];
 for(const entry of entries){
  const [minutes,hours,...rest]=String(entry.schedule||'').trim().split(/\s+/);
  if(rest.join(' ')!=='* * *'||!/^\d+(?:,\d+)*$/.test(minutes)||!/^\d+(?:,\d+)*$/.test(hours))return null;
  const ms=minutes.split(',').map(Number),hs=hours.split(',').map(Number);
  if(ms.some(m=>m>59)||hs.some(h=>h>23))return null;
  for(let day=0;day<2;day++)for(const hour of hs)for(const minute of ms){
   const d=new Date(now);d.setUTCDate(d.getUTCDate()+day);d.setUTCHours(hour,minute,0,0);if(d>new Date(now))times.push(d);
  }
 }
 return times.length?new Date(Math.min(...times)).toISOString():null;
}
const reasons={
 'arbeitsfenster-aus':'Die Quellenarbeit ist ausgeschaltet.',
 'arbeitsfenster-vorflug-nicht-bereit':'Die Verarbeitung ist noch nicht bereit. Bitte den Stand erneut prüfen.',
 'arbeitsfenster-belegt-oder-unbekannt':'Ein anderer Lauf ist aktiv oder sein Abschluss ist noch offen.',
 'fensterkontingent-erschoepft':'Das Tageskontingent für Quellenläufe ist ausgeschöpft.',
 'sekundenkontingent-erschoepft':'Die verfügbare Verarbeitungszeit für heute ist ausgeschöpft.',
 'arbeitslimit-tagesgrenze':'Das Tageskontingent ist ausgeschöpft oder dieser Auftrag wurde bereits verwendet.',
 'adminauftrag-bereits-verbraucht':'Dieser Auftrag wurde bereits gestartet. Bitte seinen Status prüfen.',
 'arbeitslimit-nicht-pruefbar':'Das verfügbare Kontingent konnte nicht geprüft werden.',
 'arbeitslimits-ungueltig':'Die Kontingente müssen in den bisherigen Werkzeugen geprüft werden.',
 'adminauftrag-ungueltig-oder-abgelaufen':'Der Auftrag ist abgelaufen oder konnte nicht bestätigt werden.',
 'adminauftrag-tagesende':'Für einen weiteren Lauf bleibt heute nicht mehr genug Zeit.'
};
export function sourceRunView(state={}) {
 const states={bereit:['Quellen bei Bedarf neu einlesen.','Der Lauf nutzt die vorhandenen Tageskontingente.'],
  prueft:['Start wird geprüft …','Der Quellenlauf kann bis zu fünf Minuten dauern.'],
  laeuft:['Quellen werden verarbeitet …','Sie können die Verwaltung weiter benutzen. Der Laufstatus bleibt beim Neuladen erhalten.'],
  abgeschlossen:['Quellenlauf abgeschlossen.','Der Briefingstand der Kunden wird anschließend neu geprüft.'],
  teilweise:['Quellenlauf mit offenen Aufgaben beendet.','Prüfen Sie den Kundenstand und bei Bedarf den Quellenbericht.'],
  gesperrt:['Quellenlauf kann gerade nicht starten.','Bitte den Quellenstand prüfen.'],
  unbekannt:['Der Abschluss ist noch offen.','Prüfen Sie den Status. Der Lauf wird nicht automatisch erneut gestartet.'],
  fehler:['Der Start wurde nicht bestätigt.','Bitte den Stand neu laden und erneut prüfen.']};
 const [title,text]=states[state.zustand]||states.unbekannt;
 return {title,text:reasons[state.grund]||text,disabled:Boolean(state.busy||state.offen||['fensterkontingent-erschoepft','sekundenkontingent-erschoepft'].includes(state.grund))};
}
