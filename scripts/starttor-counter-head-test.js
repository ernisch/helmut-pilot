'use strict';

/**
 * scripts/starttor-counter-head-test.js
 *
 * Reiner Offline-Former-Test fuer lib/helmut/starttor-counter-head.js.
 * Fiktive Szenariowerte. Kein Netz, keine Schreibvorgaenge, keine echten
 * Profile, keine Datenbank. Geprueft wird ausschliesslich die Kopfform.
 */

let netzAufrufe = 0;

global.fetch = function netzsperre() {
  netzAufrufe += 1;
  throw new Error('netzsperre-aktiv');
};

const modul = require('../lib/helmut/starttor-counter-head.js');

const ABBRUCH = 'starttor-original-state-closed';
const TAG = '2026-10-11';

const ergebnisse = [];

function test(name, fn) {
  try {
    fn();
    ergebnisse.push({ name: name, ok: true });
  } catch (fehler) {
    ergebnisse.push({
      name: name,
      ok: false,
      grund: fehler && fehler.message ? fehler.message : String(fehler),
    });
  }
}

function erwarte(ausdruck, beschreibung) {
  if (!ausdruck) throw new Error('erwartet wahr: ' + beschreibung);
}

function erwarteGleich(ist, soll, beschreibung) {
  if (!Object.is(ist, soll)) {
    throw new Error(beschreibung + ': erwartet ' + String(soll) + ', erhalten ' + String(ist));
  }
}

function erwarteAbbruch(fn, beschreibung) {
  let gefangen = null;
  try {
    fn();
  } catch (fehler) {
    gefangen = fehler;
  }
  if (gefangen === null) throw new Error('kein Fehler: ' + beschreibung);
  if (!(gefangen instanceof Error)) throw new Error('kein Error: ' + beschreibung);
  erwarteGleich(gefangen.message, ABBRUCH, beschreibung + ' (Meldung)');
  erwarteGleich(gefangen.toString(), 'Error: ' + ABBRUCH, beschreibung + ' (toString)');
  erwarteGleich(Object.keys(gefangen).length, 0, beschreibung + ' (keine Zusatzfelder)');
}

function gegenwart(extra) {
  return Object.assign(
    { day: TAG, scope: 'global', tableOid: '4242', xmin: '17', used: 9 },
    extra || {}
  );
}

function abwesenheit(extra) {
  return Object.assign(
    { day: TAG, scope: 'global', tableOid: '4242', rowCount: 0, used: 0 },
    extra || {}
  );
}

function ohne(objekt, feld) {
  const kopie = Object.assign({}, objekt);
  delete kopie[feld];
  return kopie;
}

function schnappschuss(objekt) {
  return JSON.stringify(objekt) + '|' + Object.getOwnPropertyNames(objekt).join(',');
}

test('netzsperre steht und bleibt ungenutzt', function () {
  erwarte(typeof global.fetch === 'function', 'fetch-Fixture vorhanden');
  let netzGefangen = null;
  try {
    global.fetch();
  } catch (fehler) {
    netzGefangen = fehler;
  }
  erwarte(netzGefangen !== null && netzGefangen.message === 'netzsperre-aktiv', 'fetch-Fixture wirft');
  netzAufrufe = 0;
  erwarteGleich(modul.pruefe(gegenwart(), TAG), 9, 'Pruefung ohne Netzzugriff');
  erwarteGleich(netzAufrufe, 0, 'kein Netzzugriff');
});

test('positive gefrorene Gegenwart (Legacy)', function () {
  const kopf = Object.freeze(gegenwart());
  const vorher = schnappschuss(kopf);
  erwarteGleich(modul.pruefe(kopf, TAG), 9, 'Defaultmodus');
  erwarteGleich(modul.pruefe(kopf, TAG, false), 9, 'ausdruecklich false');
  erwarteGleich(modul.pruefe(kopf, TAG, undefined), 9, 'Default bei undefined');
  erwarteGleich(schnappschuss(kopf), vorher, 'unveraendert byte-genau');
  erwarte(Object.isFrozen(kopf), 'Kopf bleibt gefroren');
  erwarteGleich(kopf.xmin, '17', 'xmin unveraendert');
});

test('Abwesenheit liefert Null und bleibt unveraendert', function () {
  const kopf = Object.freeze(abwesenheit());
  const vorher = schnappschuss(kopf);
  erwarteGleich(modul.pruefe(kopf, TAG, true), 0, 'used 0');
  erwarteGleich(schnappschuss(kopf), vorher, 'unveraendert byte-genau');
});

test('Modus trennt Formen, Legacy akzeptiert niemals Abwesenheit', function () {
  erwarteAbbruch(function () { modul.pruefe(abwesenheit(), TAG); }, 'Abwesenheit ohne Flagge');
  erwarteAbbruch(function () { modul.pruefe(abwesenheit(), TAG, false); }, 'Abwesenheit mit false');
  erwarteAbbruch(function () { modul.pruefe(abwesenheit(), TAG, undefined); }, 'Abwesenheit mit undefined');
  erwarteGleich(modul.pruefe(Object.freeze(gegenwart()), TAG, true), 9, 'Gegenwart bleibt mit Absenzfreigabe erlaubt');
  erwarteAbbruch(function () { modul.pruefe(gegenwart({ rowCount: 0 }), TAG, true); }, 'Gegenwart mit rowCount');
});

test('fehlende, null und undefined Koepfe sind keine Abwesenheit', function () {
  erwarteAbbruch(function () { modul.pruefe(); }, 'kein Argument');
  erwarteAbbruch(function () { modul.pruefe(null, TAG); }, 'null');
  erwarteAbbruch(function () { modul.pruefe(undefined, TAG); }, 'undefined');
  erwarteAbbruch(function () { modul.pruefe(null, TAG, true); }, 'null im Abwesenheitsmodus');
  erwarteAbbruch(function () { modul.pruefe(undefined, TAG, true); }, 'undefined im Abwesenheitsmodus');
  erwarteAbbruch(function () { modul.pruefe('', TAG, true); }, 'Leerstring');
  erwarteAbbruch(function () { modul.pruefe(0, TAG, true); }, 'Null-Zahl');
  erwarteAbbruch(function () { modul.pruefe(false, TAG, true); }, 'false');
});

test('exakte eigene Felder, keine Extra- oder Fremdfelder', function () {
  erwarteAbbruch(function () { modul.pruefe(gegenwart({ extra: 1 }), TAG); }, 'Zusatzfeld Gegenwart');
  erwarteAbbruch(function () { modul.pruefe(gegenwart({ rowCount: 0 }), TAG); }, 'rowCount in Gegenwart');
  erwarteAbbruch(function () { modul.pruefe(abwesenheit({ xmin: '17' }), TAG, true); }, 'xmin in Abwesenheit');
  erwarteAbbruch(function () { modul.pruefe(abwesenheit({ extra: 1 }), TAG, true); }, 'Zusatzfeld Abwesenheit');
  erwarteAbbruch(function () { modul.pruefe(ohne(gegenwart(), 'used'), TAG); }, 'used fehlt in Gegenwart');
  erwarteAbbruch(function () { modul.pruefe(ohne(gegenwart(), 'xmin'), TAG); }, 'xmin fehlt in Gegenwart');
  erwarteAbbruch(function () { modul.pruefe(ohne(abwesenheit(), 'rowCount'), TAG, true); }, 'rowCount fehlt');

  const mitSymbol = gegenwart();
  mitSymbol[Symbol('used')] = 9;
  erwarteAbbruch(function () { modul.pruefe(mitSymbol, TAG); }, 'Symbolfeld');

  const versteckt = gegenwart();
  Object.defineProperty(versteckt, 'hidden', { value: 1, enumerable: false });
  erwarteAbbruch(function () { modul.pruefe(versteckt, TAG); }, 'nicht-enumerables Feld');
});

test('Abwesenheit verlangt rowCount === 0', function () {
  erwarteAbbruch(function () { modul.pruefe(abwesenheit({ rowCount: 1 }), TAG, true); }, 'rowCount 1');
  erwarteAbbruch(function () { modul.pruefe(abwesenheit({ rowCount: '0' }), TAG, true); }, 'rowCount String');
  erwarteAbbruch(function () { modul.pruefe(abwesenheit({ rowCount: null }), TAG, true); }, 'rowCount null');
  erwarteAbbruch(function () { modul.pruefe(abwesenheit({ rowCount: undefined }), TAG, true); }, 'rowCount undefined');
  erwarteAbbruch(function () { modul.pruefe(abwesenheit({ rowCount: -1 }), TAG, true); }, 'rowCount negativ');
  erwarteAbbruch(function () { modul.pruefe(abwesenheit({ rowCount: NaN }), TAG, true); }, 'rowCount NaN');
});

test('Abwesenheit verlangt used === 0', function () {
  erwarteAbbruch(function () { modul.pruefe(abwesenheit({ used: 5 }), TAG, true); }, 'used 5');
  erwarteAbbruch(function () { modul.pruefe(abwesenheit({ used: '0' }), TAG, true); }, 'used String');
  erwarteAbbruch(function () { modul.pruefe(abwesenheit({ used: null }), TAG, true); }, 'used null');
  erwarteGleich(modul.pruefe(abwesenheit({ rowCount: 0, used: 0 }), TAG, true), 0, 'Nullform');
});

test('day kanonisch und identisch mit head.day', function () {
  const gut = gegenwart();
  erwarteGleich(modul.pruefe(gut, TAG), 9, 'gueltiger Tag');
  erwarteAbbruch(function () { modul.pruefe(gut, '2026-1-01'); }, 'nicht zweistellig');
  erwarteAbbruch(function () { modul.pruefe(gut, '2026-13-01'); }, 'Monat 13');
  erwarteAbbruch(function () { modul.pruefe(gut, '2026-00-10'); }, 'Monat 0');
  erwarteAbbruch(function () { modul.pruefe(gut, '2026-10-00'); }, 'Tag 0');
  erwarteAbbruch(function () { modul.pruefe(gut, '2026-02-30'); }, 'kein Kalendertag');
  erwarteAbbruch(function () { modul.pruefe(gut, '2025-02-29'); }, 'kein Schalttag');
  erwarteAbbruch(function () { modul.pruefe(gut, '11.10.2026'); }, 'falsches Format');
  erwarteAbbruch(function () { modul.pruefe(gut, '2026-10-11T00:00:00Z'); }, 'mit Zeitanteil');
  erwarteAbbruch(function () { modul.pruefe(gut, ' 2026-10-11'); }, 'mit Leerzeichen');
  erwarteAbbruch(function () { modul.pruefe(gut, 20261011); }, 'Zahl statt String');
  erwarteAbbruch(function () { modul.pruefe(gut, null); }, 'null statt String');
  erwarteAbbruch(function () { modul.pruefe(gut); }, 'day fehlt');
  erwarteAbbruch(function () { modul.pruefe(gegenwart({ day: '2026-10-12' }), TAG); }, 'Kopf-Tag weicht ab');
  erwarteAbbruch(function () { modul.pruefe(gegenwart({ day: undefined }), TAG); }, 'Kopf-Tag undefined');
  erwarteAbbruch(function () { modul.pruefe(gegenwart({ day: '2026-10-11 ' }), TAG); }, 'Kopf-Tag mit Leerzeichen');
  erwarteAbbruch(function () { modul.pruefe(abwesenheit({ day: '2026-10-12' }), TAG, true); }, 'Abwesenheits-Tag weicht ab');
  erwarteGleich(schnappschuss(gut), schnappschuss(gegenwart()), 'Kopf byte-genau unveraendert');
});

test('scope muss global sein', function () {
  const schlecht = ['GLOBAL', 'Global', 'global ', ' tenant', '', 'global-zwei'];
  for (let i = 0; i < schlecht.length; i += 1) {
    const wert = schlecht[i];
    erwarteAbbruch(function () { modul.pruefe(gegenwart({ scope: wert }), TAG); }, 'scope ' + JSON.stringify(wert));
  }
  erwarteAbbruch(function () { modul.pruefe(gegenwart({ scope: null }), TAG); }, 'scope null');
  erwarteAbbruch(function () { modul.pruefe(gegenwart({ scope: undefined }), TAG); }, 'scope undefined');
  erwarteAbbruch(function () { modul.pruefe(ohne(gegenwart(), 'scope'), TAG); }, 'scope fehlt');
  erwarteAbbruch(function () { modul.pruefe(abwesenheit({ scope: 'local' }), TAG, true); }, 'scope Abwesenheit');
});

test('tableOid muss OID-Ziffernform sein', function () {
  const gut = ['1', '4242', '9999999999'];
  for (let i = 0; i < gut.length; i += 1) {
    erwarteGleich(modul.pruefe(gegenwart({ tableOid: gut[i] }), TAG), 9, 'tableOid ' + gut[i]);
  }
  const schlecht = ['0', '01', '012', ' 1', '1 ', '', 'abc', '1e3', '-1', '+1', '1.0', '10000000000', '1\n'];
  for (let i = 0; i < schlecht.length; i += 1) {
    const wert = schlecht[i];
    erwarteAbbruch(function () { modul.pruefe(gegenwart({ tableOid: wert }), TAG); }, 'tableOid ' + JSON.stringify(wert));
  }
  erwarteAbbruch(function () { modul.pruefe(gegenwart({ tableOid: 4242 }), TAG); }, 'tableOid Zahl');
  erwarteAbbruch(function () { modul.pruefe(gegenwart({ tableOid: null }), TAG); }, 'tableOid null');
  erwarteAbbruch(function () { modul.pruefe(ohne(gegenwart(), 'tableOid'), TAG); }, 'tableOid fehlt');
});

test('xmin muss XID-Ziffernform sein', function () {
  const gut = ['0', '1', '17', '9999999999'];
  for (let i = 0; i < gut.length; i += 1) {
    erwarteGleich(modul.pruefe(gegenwart({ xmin: gut[i] }), TAG), 9, 'xmin ' + gut[i]);
  }
  const schlecht = ['', '00', '01', ' 1', '1 ', '-1', '+1', '1.0', 'abc', '10000000000', '1e3'];
  for (let i = 0; i < schlecht.length; i += 1) {
    const wert = schlecht[i];
    erwarteAbbruch(function () { modul.pruefe(gegenwart({ xmin: wert }), TAG); }, 'xmin ' + JSON.stringify(wert));
  }
  erwarteAbbruch(function () { modul.pruefe(gegenwart({ xmin: 17 }), TAG); }, 'xmin Zahl');
  erwarteAbbruch(function () { modul.pruefe(gegenwart({ xmin: null }), TAG); }, 'xmin null');
  erwarteAbbruch(function () { modul.pruefe(gegenwart({ xmin: undefined }), TAG); }, 'xmin undefined');
});

test('used muss endliche sichere ganze Zahl >= 0 sein', function () {
  erwarteGleich(modul.pruefe(gegenwart({ used: 0 }), TAG), 0, 'used 0');
  erwarteGleich(modul.pruefe(gegenwart({ used: 9007199254740991 }), TAG), 9007199254740991, 'MAX_SAFE_INTEGER');
  const schlecht = [NaN, Infinity, -Infinity, -1, 1.5, 9007199254740992, '9', null, undefined, true, [], {}];
  for (let i = 0; i < schlecht.length; i += 1) {
    const wert = schlecht[i];
    erwarteAbbruch(function () { modul.pruefe(gegenwart({ used: wert }), TAG); }, 'used ' + String(wert));
  }
  erwarteAbbruch(function () { modul.pruefe(ohne(gegenwart(), 'used'), TAG); }, 'used fehlt');
  erwarteAbbruch(function () { modul.pruefe(gegenwart({ used: new Number(9) }), TAG); }, 'used Number-Objekt');
});

test('allowAbsence ist strikt boolean', function () {
  erwarteAbbruch(function () { modul.pruefe(gegenwart(), TAG, 'true'); }, 'Flagge "true"');
  erwarteAbbruch(function () { modul.pruefe(gegenwart(), TAG, 'false'); }, 'Flagge "false"');
  erwarteAbbruch(function () { modul.pruefe(gegenwart(), TAG, 1); }, 'Flagge 1');
  erwarteAbbruch(function () { modul.pruefe(gegenwart(), TAG, 0); }, 'Flagge 0');
  erwarteAbbruch(function () { modul.pruefe(gegenwart(), TAG, null); }, 'Flagge null');
  erwarteAbbruch(function () { modul.pruefe(gegenwart(), TAG, {}); }, 'Flagge Objekt');
  erwarteAbbruch(function () { modul.pruefe(abwesenheit(), TAG, 'true'); }, 'Abwesenheit mit Flaggenstring');
  erwarteGleich(modul.pruefe(gegenwart(), TAG, false), 9, 'Flagge false');
});

test('nur ordinary oder null prototype Objekte mit Dateneigenschaften', function () {
  const erbe = Object.create(gegenwart());
  erwarteAbbruch(function () { modul.pruefe(erbe, TAG); }, 'Vererbung ohne eigene Felder');

  function Kopf() {
    this.day = TAG;
    this.scope = 'global';
    this.tableOid = '4242';
    this.xmin = '17';
    this.used = 9;
  }
  erwarteAbbruch(function () { modul.pruefe(new Kopf(), TAG); }, 'Konstruktorinstanz');

  erwarteAbbruch(function () { modul.pruefe([TAG, 'global', '4242', '17', 9], TAG); }, 'Array');

  const zugriff = {};
  Object.defineProperty(zugriff, 'day', { get: function () { return TAG; }, enumerable: true });
  Object.defineProperty(zugriff, 'scope', { get: function () { return 'global'; }, enumerable: true });
  Object.defineProperty(zugriff, 'tableOid', { get: function () { return '4242'; }, enumerable: true });
  Object.defineProperty(zugriff, 'xmin', { get: function () { return '17'; }, enumerable: true });
  Object.defineProperty(zugriff, 'used', { get: function () { return 9; }, enumerable: true });
  erwarteAbbruch(function () { modul.pruefe(zugriff, TAG); }, 'Getter statt Dateneigenschaft');

  const fremd = Object.assign(Object.create({ zusatz: 1 }), gegenwart());
  erwarteAbbruch(function () { modul.pruefe(fremd, TAG); }, 'fremder Prototyp mit eigenen Feldern');

  const nackt = Object.create(null);
  nackt.day = TAG;
  nackt.scope = 'global';
  nackt.tableOid = '4242';
  nackt.xmin = '17';
  nackt.used = 9;
  erwarteGleich(modul.pruefe(Object.freeze(nackt), TAG), 9, 'null prototype gefroren');
});

test('byte-genaue Unveraenderlichkeit und keine Ausgabeautoritaet', function () {
  const gegen = Object.freeze(gegenwart());
  const abwesend = Object.freeze(abwesenheit());
  const gegenVorher = schnappschuss(gegen);
  const abwesendVorher = schnappschuss(abwesend);

  erwarteGleich(modul.pruefe(gegen, TAG), 9, 'Gegenwartswert');
  erwarteGleich(modul.pruefe(abwesend, TAG, true), 0, 'Abwesenheitswert');
  erwarteGleich(schnappschuss(gegen), gegenVorher, 'Gegenwart byte-genau');
  erwarteGleich(schnappschuss(abwesend), abwesendVorher, 'Abwesenheit byte-genau');
  erwarteGleich(typeof modul.pruefe(gegen, TAG), 'number', 'Rueckgabe ist Zahl');
  erwarteGleich(modul.pruefe(gegen, TAG), gegen.used, 'Rueckgabe ist genau used');

  const schluessel = Object.keys(modul).sort();
  erwarteGleich(schluessel.join(','), 'VERSION,pruefe', 'Exportflaeche exakt');
  erwarteGleich(modul.VERSION, 'helmut-original-state-counter-head/2-native-absence', 'VERSION exakt');
  erwarte(Object.isFrozen(modul), 'Export ist gefroren');
  erwarteGleich(netzAufrufe, 0, 'kein Netzzugriff waehrend aller Pruefungen');
  erwarte(typeof global.fetch === 'function', 'Netzsperre weiterhin gesetzt');
});

let fehlgeschlagen = 0;
for (let i = 0; i < ergebnisse.length; i += 1) {
  const eintrag = ergebnisse[i];
  if (eintrag.ok) {
    console.log('ok   ' + eintrag.name);
  } else {
    fehlgeschlagen += 1;
    console.log('FAIL ' + eintrag.name + ' :: ' + eintrag.grund);
  }
}
console.log((ergebnisse.length - fehlgeschlagen) + '/' + ergebnisse.length + ' Formpruefungen ok');
if (fehlgeschlagen > 0) process.exitCode = 1;
