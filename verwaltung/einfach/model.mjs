import { profileInventoryNotice } from '../model.mjs';
export const validId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,119}$/i.test(id);
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const berlinDay = (now = new Date()) => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
export const dateTime = value => value && Number.isFinite(new Date(value).getTime()) ? new Intl.DateTimeFormat('de-DE',{timeZone:'Europe/Berlin',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value)) : 'Nicht bekannt';
const state = (key,label,tone,title,reason) => ({key,label,tone,title,reason});
export function profileFor(data, customer) {
  if (profileInventoryNotice(data.overview) || !Array.isArray(data.overview?.mandates)) return null;
  const id = customer.politicianId;
  if (!validId(id) || data.customers.filter(c=>c.politicianId===id).length!==1) return null;
  const rows=data.overview.mandates.filter(p=>p.id===id);
  return rows.length===1?rows[0]:null;
}
export function customerState(data, customer) {
  if(!Array.isArray(data.overview?.mandates)||profileInventoryNotice(data.overview))return state('unknown','Noch nicht geprüft','','Der Profilbestand ist noch nicht bestätigt.','Die Profilanbindung muss zuerst lesend geprüft werden.');
  const profile=profileFor(data,customer);
  if (!profile) return state('setup','Einrichtung prüfen','warn','Das Mandat ist noch nicht bestätigt.','Prüfen Sie die Zuordnung und ergänzen Sie die Mandatsangaben.');
  const missing=profile.validierung?.fehlendePflichtfelder;
  if(profile.profileActive===false&&Array.isArray(missing)&&missing.length===1&&missing[0]==='mind. ein Schwerpunkt oder Ausschuss') return state('paused','Schwerpunkte offen','','Schwerpunkte können später ergänzt werden.','Der Kunde kann sie selbst im Profil eintragen. Die Briefingversorgung ist noch pausiert.');
  if (Array.isArray(missing)&&missing.length) return state('setup','Angaben fehlen','warn','Das Mandat braucht noch Angaben.',missing.join(', '));
  if (profile.profileActive===false) return state('paused','Versorgung pausiert','','Die Versorgung ist noch nicht aktiv.','Das Konto und das Mandat sind angelegt. Es wird noch kein neues Briefing erwartet.');
  if (profile.profileActive!==true) return state('unknown','Noch nicht geprüft','','Der aktuelle Zustand ist offen.','Der Versorgungsstatus konnte nicht bestätigt werden.');
  const result=data.results?.[profile.id];
  if(data.resultDay!==berlinDay(data.now)||!result) return state('unknown','Noch nicht geprüft','','Der heutige Stand ist noch offen.','Aktuelle Nachweise wurden noch nicht vollständig gelesen.');
  const b=result.positionen?.briefing,q=result.positionen?.zustellung,l=result.positionen?.lage;
  if(!b||!q||!l) return state('unknown','Noch nicht geprüft','','Die Prüfung ist noch offen.','Ein Teil des Ergebnisnachweises fehlt.');
  if(b.ursache==='fehler') return state('problem','Briefing fehlgeschlagen','bad','Das heutige Briefing konnte nicht erstellt werden.','Ein Fehler im Morgenlauf ist belegt. Öffnen Sie die Nachweise für den genauen Stand.');
  if(b.ursache) return state('problem',b.ursache==='fehlt'?'Briefing fehlt':'Briefing prüfen','bad',b.ursache==='fehlt'?'Das heutige Briefing fehlt.':'Das heutige Briefing ist noch nicht vollständig.',b.ursache==='fehlt'?'Für den geprüften Tag wurde kein Morgenpaket gefunden. Die Ursache ist noch nicht bestätigt.':'Der gespeicherte Inhalt hat die vorhandenen Prüfungen noch nicht vollständig bestanden.');
  if(q.ursache||l.ursache) return state('problem','Versorgung prüfen','warn','Die Versorgung ist noch nicht vollständig.',q.ursache?'Die passende Bereitstellungsquittung fehlt.':'Die Lage ist noch nicht vollständig.');
  if([b,q,l].every(p=>p.stufe===3)) return state('current','Heute bereit','','Die heutigen Inhalte sind bereit.','Briefing, Lage und Bereitstellung sind technisch nachgewiesen. Die inhaltliche Beurteilung ist offen.');
  return state('unknown','Noch nicht geprüft','','Die Prüfung ist noch offen.','Ein vollständiger aktueller Nachweis liegt noch nicht vor.');
}
export function resultRows(result) {
  const labels={briefing:'Briefing',lage:'Lage',zustellung:'In der App bereitgestellt'};
  return Object.entries(labels).map(([key,label])=>{
    const p=result?.positionen?.[key];
    if(!p)return {label,value:'Nicht geprüft',text:'Kein aktueller Nachweis gelesen.',tone:''};
    const words={fehlt:'Fehlt',leer:'Ohne Inhalt',fehler:'Fehlgeschlagen',wiederholung:'Wiederholung',unvollstaendig:'Unvollständig','nicht-zugestellt':'Nicht bestätigt'};
    const details={fehlt:'Für diesen Tag wurde kein Nachweis gefunden.',leer:'Der gespeicherte Eintrag enthält noch keinen vollständigen Inhalt.',fehler:'Die Verarbeitung wurde mit einem Fehler beendet.',wiederholung:'Die Ausgabe wiederholt Inhalte zwischen Ansichten.',unvollstaendig:'Die vorhandenen Prüfungen sind noch nicht vollständig bestanden.','nicht-zugestellt':'Die passende Bereitstellungsquittung fehlt.'};
    return {label,value:p.ursache?(words[p.ursache]||'Prüfen'):p.stufe===3?'Nachgewiesen':'Nicht geprüft',tone:p.ursache?'warn':'',text:p.hinweis==='ruhiger-tag'?'Ruhiger Tag · kein neuer Tagesanlass':details[p.ursache]||'Technischer Nachweis; kein inhaltliches Fachurteil.'};
  });
}

// Zugang wird aus dem Kontostand gelesen; ein aktiver Zugang ist kein Briefingnachweis.
export function accessState(customer) {
  const c=customer||{},known=['aktiv','testphase','pausiert','eingeladen'];
  if(c.active===false||['deaktiviert','gekuendigt'].includes(c.status))return {key:'blocked',label:'Zugang gesperrt',tone:'warn',detail:'Der Kunde kann Helmut derzeit nicht öffnen.'};
  if(c.active!==true||!known.includes(c.status))return {key:'unknown',label:'Zugang noch offen',tone:'',detail:'Der aktuelle Kontostand ist noch nicht bestätigt.'};
  if(c.status==='eingeladen')return {key:'invited',label:'Passwort offen',tone:'warn',detail:'Der Kunde hat sein Passwort noch nicht festgelegt.'};
  return {key:'active',label:'Zugang aktiv',tone:'',detail:c.lastLoginAt&&Number.isFinite(Date.parse(c.lastLoginAt))?'Zuletzt angemeldet: '+dateTime(c.lastLoginAt):'Noch keine Anmeldung bestätigt.'};
}
export const canManageAccess=c=>c?.role==='abgeordneter'&&typeof c.active==='boolean'&&['aktiv','testphase','pausiert','eingeladen'].includes(c.status);
