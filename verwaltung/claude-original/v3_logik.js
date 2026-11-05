// Helmut Verwaltung v3 · Beispieldaten und Ableitungen. Keine Netzaufrufe.
(function () {
  const FIRST = ['Anna','Jonas','Miriam','Felix','Sabine','Tobias','Leonie','Matthias','Katrin','Daniel','Julia','Stefan','Nina','Florian','Petra','Lukas','Carla','Martin','Ute','Sebastian','Helena','Kai','Ines','Moritz','Greta','Oliver','Sophie','Ralf','Lena','Philipp','Birgit','Hannes','Eva','Thomas','Clara','Bernd','Mara','Jan','Doris','Paul'];
  const LAST = ['Albers','Brandt','Conrad','Dietz','Ebert','Falk','Grote','Hahn','Imhof','Jäger','Kessler','Lorenz','Mahler','Neumann','Ostrowski','Pohl','Quast','Reuter','Sauer','Thiele','Ulrich','Vogt','Wendt','Zander','Arnold','Bauer','Claßen','Dörr','Engel','Fink','Gerlach','Heinze','Iske','Jung','Krämer','Lindner','Moll','Nagel','Otte','Peters','Rauch','Schulte','Timm','Unger','Voss','Weber','Ziegler','Haas','Kuhn','Seidel'];
  const BE = ['Mitte','Pankow','Neukölln','Spandau','Lichtenberg','Steglitz','Treptow','Reinickendorf','Marzahn','Tempelhof'];
  const PARL = { bundestag: 'Bundestag', berlin: 'Berlin', brandenburg: 'Brandenburg' };
  const AREAS = [['briefing', 'Briefing'], ['lage', 'Lage'], ['radar', 'Radar']];
  const AREA_LABEL = { briefing: 'Briefing', lage: 'Lage', radar: 'Radar' };
  const AST = {
    brauchbar: { label: 'Brauchbar', tone: 'ok', stage: 4, bucket: 'brauchbar' },
    nicht_beurteilt: { label: 'Vollständig', note: 'nicht beurteilt', tone: 'neutral', stage: 3, bucket: 'offen' },
    unbrauchbar: { label: 'Unbrauchbar', tone: 'warn', stage: 3, bucket: 'unbrauchbar' },
    doppelt: { label: 'Doppelt', tone: 'warn', stage: 3, bucket: 'doppelt' },
    unvollstaendig: { label: 'Unvollständig', tone: 'warn', stage: 2, bucket: 'unbrauchbar' },
    leer: { label: 'Leer', tone: 'warn', stage: 1, bucket: 'leer' },
    fehlt: { label: 'Fehlt', tone: 'bad', stage: 0, bucket: 'fehlt' },
    fehler: { label: 'Fehlt', note: 'technischer Fehler', tone: 'bad', stage: 0, bucket: 'fehlt' },
    inaktiv: { label: 'Inaktiv', tone: 'neutral', stage: -1, bucket: 'inaktiv' }
  };
  const BUCKETS = [['brauchbar', 'Brauchbar'], ['fehlt', 'Fehlt'], ['leer', 'Leer'], ['doppelt', 'Doppelt'], ['unbrauchbar', 'Unbrauchbar'], ['offen', 'Nicht beurteilt']];
  const STAGES = ['Lauf erfolgt', 'Inhalt vorhanden', 'Inhalt vollständig', 'Inhalt brauchbar'];
  const CAUSES = {
    quelle_bb: { title: 'Quelle konnte nicht geladen werden', detail: 'Landtag Brandenburg · Pressemitteilungen ist seit 06:40 nicht erreichbar.', tech: 'GET presse.landtag.brandenburg.de · HTTP 504 · 3 Versuche · letzter 08:55', tone: 'bad' },
    ki_abbruch: { title: 'KI Anfrage abgebrochen', detail: 'Die Antwort kam nicht innerhalb von 20 Sekunden. Kein automatischer neuer Versuch.', tech: 'provider-timeout · Gesamtfrist 20 s · Kostenquittung erhalten', tone: 'bad' },
    lauf_fehlt: { title: 'Briefing konnte nicht erstellt werden', detail: 'Der Morgenlauf hat dieses Profil heute nicht erreicht.', tech: 'process_runs · kein Eintrag für den Berliner Tag', tone: 'bad' },
    profil_unvollstaendig: { title: 'Profilinformationen unvollständig', detail: 'Ausschüsse fehlen. Radar hat keinen Beobachtungsgrund.', tech: 'profile-validation · schwerpunkt_oder_ausschuss fehlt', tone: 'warn' },
    qualitaet: { title: 'Qualitätsprüfung nicht bestanden', detail: 'Die Lage erklärt den Sachstand nicht eindeutig.', tech: 'bereichspruefung · urteil unklar', tone: 'warn' },
    doppelt: { title: 'Ergebnis doppelt', detail: 'Das Briefing wiederholt die Lage ohne eigenen Nutzen.', tech: 'bereichspruefung · briefing/lage · wiederholung', tone: 'warn' },
    unvollstaendig: { title: 'Inhalt unvollständig', detail: 'Die Lage wurde ohne Quellenangabe gespeichert.', tech: 'gespeicherterTextGueltig = false', tone: 'warn' }
  };
  const SOURCES = [
    { id: 'dip', name: 'Bundestag · Dokumentation', scope: ['bundestag'], haupt: true },
    { id: 'bt-presse', name: 'Bundestag · Pressemitteilungen', scope: ['bundestag'], haupt: false },
    { id: 'be-senat', name: 'Berliner Senat · Pressemitteilungen', scope: ['berlin'], haupt: true },
    { id: 'be-pardok', name: 'Abgeordnetenhaus Berlin · Dokumentation', scope: ['berlin'], haupt: false },
    { id: 'bb-presse', name: 'Landtag Brandenburg · Pressemitteilungen', scope: ['brandenburg'], haupt: true },
    { id: 'bb-pardok', name: 'Landtag Brandenburg · Dokumentation', scope: ['brandenburg'], haupt: false },
    { id: 'dlf', name: 'Deutschlandfunk', scope: ['bundestag', 'berlin', 'brandenburg'], haupt: true },
    { id: 'gnews', name: 'Google News · Artikelauflösung', scope: ['bundestag', 'berlin', 'brandenburg'], haupt: false }
  ];
  const BUDGET = { dayUsd: 6, monthUsd: 150, sharedUsd: 1.08 };

  const fmt = {
    int: n => Number(n).toLocaleString('de-DE'),
    usd: (n, d) => Number(n).toLocaleString('de-DE', { minimumFractionDigits: d ?? 2, maximumFractionDigits: d ?? 2 }) + ' USD',
    eur: n => Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR',
    pct: n => Math.round(n * 100) + ' %'
  };
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function build(N, scenario, ov) {
    N = Math.max(1, N | 0); ov = ov || {}; const deact = new Set(ov.deact || []), deleted = new Set(ov.deleted || []);
    const issues = scenario !== 'gesund', outage = scenario === 'stoerung';
    const profiles = []; let bbIdx = 0;
    for (let i = 0; i < N; i++) {
      const r = rng(i * 2654435761 + 17), f = i / N;
      const parl = f < 0.66 ? 'bundestag' : f < 0.9 ? 'berlin' : 'brandenburg';
      const q = Math.floor(i / 40), name = FIRST[i % 40] + ' ' + LAST[(31 * q + 7 * (i % 40)) % 50];
      const mandat = parl === 'bundestag' ? 'MdB · Wahlkreis ' + (1 + (i * 13) % 299)
        : parl === 'berlin' ? 'MdA · ' + BE[i % 10] + ' ' + (1 + i % 7) : 'MdL · Wahlkreis ' + (1 + i % 44);
      const id = 'p-' + String(i + 1).padStart(4, '0');
      if (deleted.has(id)) { if (parl === 'brandenburg') bbIdx++; continue; }
      const aktiv = !(i % 97 === 50) && !deact.has(id);
      const a = { briefing: { k: 'brauchbar' }, lage: { k: 'brauchbar' }, radar: { k: 'brauchbar' } };
      if (aktiv) {
        const rb = r(), rl = r(), rr = r();
        if (issues) {
          if (rb < 0.008) a.briefing = { k: 'fehler', c: 'ki_abbruch' }; else if (rb < 0.012) a.briefing = { k: 'fehlt', c: 'lauf_fehlt' };
          else if (rb < 0.02) a.briefing = { k: 'doppelt', c: 'doppelt' };
          if (rl < 0.006) a.lage = { k: 'fehler', c: 'ki_abbruch' }; else if (rl < 0.018) a.lage = { k: 'unbrauchbar', c: 'qualitaet' };
          else if (rl < 0.024) a.lage = { k: 'unvollstaendig', c: 'unvollstaendig' };
          if (rr < 0.012) a.radar = { k: 'leer', c: 'profil_unvollstaendig' }; else if (rr < 0.016) a.radar = { k: 'fehler', c: 'ki_abbruch' };
          if (i === 3 && N <= 40) a.lage = { k: 'unbrauchbar', c: 'qualitaet' };
        }
        if (a.briefing.k === 'brauchbar' && rb > 0.955) a.briefing = { k: 'nicht_beurteilt' };
        if (a.lage.k === 'brauchbar' && rl > 0.96) a.lage = { k: 'nicht_beurteilt' };
        if (a.radar.k === 'brauchbar' && rr > 0.965) a.radar = { k: 'nicht_beurteilt' };
        if (outage && parl === 'brandenburg') { if ([0, 3, 5].includes(bbIdx % 8)) a.lage = { k: 'leer', c: 'quelle_bb' }; }
      } else { a.briefing = a.lage = a.radar = { k: 'inaktiv' }; }
      if (parl === 'brandenburg') bbIdx++;
      const keys = AREAS.map(([k]) => a[k].k);
      const status = !aktiv ? 'inaktiv' : keys.some(k => AST[k].tone === 'bad') ? 'problem'
        : keys.some(k => AST[k].tone === 'warn') ? 'eingeschraenkt' : keys.every(k => k === 'brauchbar') ? 'ok' : 'offen';
      let cost = aktiv ? 0.0062 + r() * 0.004 : 0; const teuer = aktiv && i % 113 === 17; if (teuer) cost *= 3.4;
      const lastOk = status === 'ok' || status === 'offen' ? 'Heute 07:46' : a.briefing.k === 'fehlt' ? '1. Oktober 07:45' : !aktiv ? '12. September 07:44' : 'Gestern 07:44';
      const sources = SOURCES.filter(s => s.scope.includes(parl)).map(s => s.id);
      const quelleBetroffen = aktiv && AREAS.some(([k]) => a[k].c === 'quelle_bb');
      profiles.push({ lokal: deact.has(id), id, i, name, mandat, parl, parlLabel: PARL[parl], aktiv, a, status, cost, teuer, lastOk, sources, quelleBetroffen,
        runOk: aktiv && !keys.includes('fehlt') && !keys.includes('fehler') });
    }
    const byId = {}; profiles.forEach(p => { byId[p.id] = p; });
    const act = profiles.filter(p => p.aktiv);

    const srcState = SOURCES.map(s => {
      const bound = act.filter(p => s.scope.includes(p.parl));
      let state = 'ok', since = null, last = '09:02', tech = null, text = 'Erreichbar';
      if (outage && s.id === 'bb-presse') { state = 'ausgefallen'; since = '06:40'; last = '06:12'; text = 'Nicht erreichbar seit 06:40'; tech = 'HTTP 504 · Zeitüberschreitung · 3 Versuche · letzter 08:55'; }
      else if (issues && s.id === 'be-pardok') { state = 'verzoegert'; last = 'Gestern 22:05'; text = 'Seit gestern 22:05 nicht erneut geprüft'; tech = 'Nächster geplanter Abruf 18:00 · kein Fehler gemeldet'; }
      const harmed = act.filter(p => AREAS.some(([k]) => p.a[k].c === 'quelle_' + s.id.split('-')[0])).length;
      return { ...s, state, since, last, text, tech, bound: bound.length, harmed: state === 'ausgefallen' ? harmed : 0 };
    });

    // Kosten (USD, Kostentag UTC)
    const profileCost = profiles.reduce((s, p) => s + p.cost, 0);
    const today = BUDGET.sharedUsd + profileCost;
    const month = today + today * 0.96 + today * 1.02;
    const sortedCost = act.map(p => p.cost).sort((x, y) => x - y), median = sortedCost.length ? sortedCost[Math.floor(sortedCost.length / 2)] : 0;
    const expensive = act.filter(p => median && p.cost > median * 2).sort((x, y) => y.cost - x.cost);
    const costs = { today, month, profileCost, shared: BUDGET.sharedUsd, avg: act.length ? profileCost / act.length : 0, median, expensive,
      dayLimit: BUDGET.dayUsd, monthLimit: BUDGET.monthUsd, dayShare: today / BUDGET.dayUsd, monthShare: month / BUDGET.monthUsd };

    // Ursachen gruppiert
    const gmap = {};
    act.forEach(p => AREAS.forEach(([k]) => { const c = p.a[k].c; if (!c) return; const key = c + '|' + k; (gmap[key] = gmap[key] || { key, cause: c, area: k, ids: [] }).ids.push(p.id); }));
    const groups = Object.values(gmap).map(g => ({ ...g, count: g.ids.length, tone: CAUSES[g.cause].tone, ...CAUSES[g.cause] }))
      .sort((x, y) => (x.tone === 'bad' ? 0 : 1) - (y.tone === 'bad' ? 0 : 1) || y.count - x.count);

    // Bilanz
    const bilanz = AREAS.map(([k, label]) => { const row = { area: k, label, cells: {} }; BUCKETS.forEach(([b]) => { row.cells[b] = 0; });
      act.forEach(p => { row.cells[AST[p.a[k].k].bucket]++; }); return row; });

    const counts = { total: profiles.length, aktiv: act.length, inaktiv: profiles.length - act.length, ok: act.filter(p => p.status === 'ok').length,
      problem: act.filter(p => p.status === 'problem' || p.status === 'eingeschraenkt').length, offen: act.filter(p => p.status === 'offen').length,
      ohneBrauchbar: act.filter(p => p.runOk && p.status === 'eingeschraenkt').length, quelle: act.filter(p => p.quelleBetroffen).length };

    // Gesamtzustand: feste, sichtbare Regel
    const crit = [], warn = [];
    srcState.filter(s => s.haupt && s.state === 'ausgefallen').forEach(s => crit.push('die Hauptquelle ' + s.name + ' seit ' + s.since + ' nicht erreichbar ist' + (s.harmed ? ' und ' + fmt.int(s.harmed) + (s.harmed === 1 ? ' Profil' : ' Profile') + ' deshalb ohne Lage ' + (s.harmed === 1 ? 'ist' : 'sind') : '')));
    if (costs.dayShare >= 1) crit.push('die Tagesgrenze der KI Kosten erreicht ist (' + fmt.usd(today) + ' von ' + fmt.usd(BUDGET.dayUsd) + ')');
    const restProblem = counts.problem - (crit.length ? srcState.reduce((s, x) => s + x.harmed, 0) : 0);
    if (counts.problem) warn.push(fmt.int(counts.problem) + (counts.problem === 1 ? ' Profil braucht' : ' Profile brauchen') + ' Aufmerksamkeit');
    srcState.filter(s => s.state === 'verzoegert').forEach(s => warn.push(s.name + ' wurde seit gestern nicht geprüft'));
    if (costs.dayShare >= 0.8 && costs.dayShare < 1) warn.push('die KI Kosten bei ' + fmt.pct(costs.dayShare) + ' der Tagesgrenze liegen');
    let health;
    if (crit.length) health = { key: 'stoerung', label: 'Störung', tone: 'bad', text: 'Störung, weil ' + crit.join(' und ') + '.' + (restProblem > 0 ? ' Dazu ' + fmt.int(restProblem) + ' weitere Profile mit anderen Ursachen.' : '') };
    else if (warn.length) health = { key: 'achtung', label: 'Achtung', tone: 'warn', text: 'Achtung, weil ' + warn.join(', ') + '.' };
    else health = { key: 'gesund', label: 'Helmut läuft gesund', tone: 'ok', text: 'Alle aktiven Profile haben heute brauchbare Ergebnisse oder warten nur auf die Beurteilung. Alle Quellen sind erreichbar.' };

    const runs = [
      { t: '06:00', label: 'Quellen abrufen', ok: !outage, text: outage ? 'Abgeschlossen, eine Hauptquelle nicht erreichbar' : 'Abgeschlossen', tech: 'process_runs · crawl · 280 s Frist' },
      { t: '07:00', label: 'Morgenbriefings', ok: true, text: 'Abgeschlossen · ' + fmt.int(act.length - bilanz[0].cells.fehlt) + ' von ' + fmt.int(act.length) + ' erstellt', tech: 'process_runs · morning-briefing' },
      { t: '07:30', label: 'Vorgänge verstehen', ok: true, text: 'Abgeschlossen · 0 offen', tech: 'process_runs · understanding · 240 s Budget' },
      { t: '07:45', label: 'Lagen erstellen', ok: !issues, text: issues ? 'Abgeschlossen mit Lücken · ' + fmt.int(bilanz[1].cells.fehlt + bilanz[1].cells.leer) + ' ohne Inhalt' : 'Abgeschlossen', tech: 'process_runs · lage-briefing' },
      { t: '12:00', label: 'Lage prüfen', planned: true, text: 'Geplant', tech: 'cron · lage-check' }
    ];
    const failedRuns = act.filter(p => AREAS.some(([k]) => p.a[k].k === 'fehler')).length;

    const customers = [
      { id: 'k1', name: 'Abgeordnetenbüro Beispiel Nord', person: 'Lea Hartmann', mail: 'buero.nord@beispiel.de', tarif: 'Büro', preis: 490, zugang: 'aktiv', status: 'vertrag', last: 'Heute 08:12', profiles: [pick(profiles, 'bundestag', 0)], users: [['Lea Hartmann', 'aktiv'], ['Tim Roth', 'aktiv']] },
      { id: 'k2', name: 'Büro Beispiel Mitte', person: 'Jana Wolff', mail: 'mitte@beispiel.de', tarif: 'Basis', preis: 290, zugang: 'aktiv', status: 'vertrag', last: 'Gestern 18:40', profiles: [pick(profiles, 'berlin', 0)], users: [['Jana Wolff', 'aktiv']] },
      { id: 'k3', name: 'Fraktionsbüro Beispiel', person: 'Malte Berger', mail: 'fraktion@beispiel.de', tarif: 'Fraktion', preis: 1200, zugang: 'aktiv', status: 'vertrag', last: 'Heute 07:58', profiles: [pick(profiles, 'brandenburg', 0), pick(profiles, 'brandenburg', 1)], users: [['Malte Berger', 'aktiv'], ['Rita Kühn', 'aktiv'], ['Ole Sander', 'eingeladen']] },
      { id: 'k4', name: 'Büro Beispiel Süd', person: 'Nora Keller', mail: 'sued@beispiel.de', tarif: 'Basis', preis: 290, zugang: 'eingeladen', status: 'test', last: '—', profiles: [pick(profiles, 'bundestag', 1)], users: [['Nora Keller', 'eingeladen']] },
      { id: 'k5', name: 'Büro Beispiel West', person: 'Ben Krause', mail: 'west@beispiel.de', tarif: 'Basis', preis: 290, zugang: 'gesperrt', status: 'pausiert', last: '12. September', profiles: [pick(profiles, 'berlin', 1)], users: [['Ben Krause', 'gesperrt']] }
    ].map(c => ({ ...c, profiles: c.profiles.filter(Boolean) }));
    const invoices = [
      { nr: 'BEISPIEL1004', kunde: 'k3', betrag: 1200, zahlung: 'offen', faellig: '15. Oktober' },
      { nr: 'BEISPIEL1003', kunde: 'k1', betrag: 490, zahlung: 'bezahlt', faellig: '5. Oktober' },
      { nr: 'BEISPIEL1002', kunde: 'k2', betrag: 290, zahlung: 'teilweise', faellig: '30. September', rest: 90 },
      { nr: 'BEISPIEL1001', kunde: 'k5', betrag: 290, zahlung: 'ueberfaellig', faellig: '15. September' },
      { nr: 'BEISPIEL0999', kunde: 'k2', betrag: 290, zahlung: 'storniert', faellig: '—' }
    ];
    return { N, scenario, profiles, byId, act, sources: srcState, costs, groups, bilanz, counts, health, runs, failedRuns, customers, invoices };
  }
  function pick(profiles, parl, n) { const l = profiles.filter(p => p.parl === parl && p.aktiv); return l[n] ? l[n].id : null; }

  function verlauf(p) {
    if (!p.aktiv && p.lokal) return [{ t: 'Gerade eben', text: 'Profil deaktiviert', tone: 'neutral' }, { t: '06:00', text: 'Quellen abgerufen', tone: 'neutral' }];
    if (!p.aktiv) return [{ t: '12. September 14:20', text: 'Profil deaktiviert', tone: 'neutral' }, { t: '12. September 07:44', text: 'Alle drei Ergebnisse brauchbar', tone: 'ok' }];
    const out = [], A = p.a;
    if (A.lage.c === 'quelle_bb') { out.push({ t: '08:55', text: 'Erneuter Versuch · Quelle weiterhin nicht erreichbar', tone: 'bad' }); }
    AREAS.forEach(([k, label]) => { const s = A[k]; const st = AST[s.k];
      if (s.k === 'brauchbar') out.push({ t: k === 'briefing' ? '07:46' : k === 'lage' ? '07:47' : '07:48', text: label + ' erstellt und brauchbar', tone: 'ok' });
      else if (s.k === 'nicht_beurteilt') out.push({ t: '07:47', text: label + ' erstellt · Beurteilung steht aus', tone: 'neutral' });
      else out.push({ t: k === 'briefing' ? '07:01' : '07:45', text: label + ': ' + CAUSES[s.c].title, tone: st.tone }); });
    if (A.lage.c === 'quelle_bb') out.push({ t: '06:40', text: 'Quelle Landtag Brandenburg · Pressemitteilungen ausgefallen', tone: 'bad' });
    out.push({ t: '06:00', text: 'Quellen abgerufen', tone: 'neutral' });
    if (p.i % 5 === 2) out.push({ t: 'Gestern 09:20', text: 'Fehler behoben · Lage neu erstellt', tone: 'ok' }, { t: 'Gestern 07:45', text: 'Lage: KI Anfrage abgebrochen', tone: 'bad' });
    else out.push({ t: 'Gestern 07:44', text: 'Alle drei Ergebnisse brauchbar', tone: 'ok' });
    return out.sort((x, y) => sortKey(y.t) - sortKey(x.t));
  }
  function sortKey(t) { const g = t.startsWith('Gestern'); const m = /(\d\d):(\d\d)/.exec(t); return (g ? 0 : 10000) + (m ? +m[1] * 60 + +m[2] : 0); }

  window.HV3 = { build, verlauf, fmt, AST, AREAS, AREA_LABEL, BUCKETS, STAGES, CAUSES, PARL, BUDGET };
})();
