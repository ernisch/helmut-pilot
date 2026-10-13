'use strict';

/**
 * lib/helmut/starttor-counter-head.js
 *
 * Helmut Starttor: Former fuer den Kopf des Originalzustands-Zaehlers.
 *
 * pruefe(head, day, allowAbsence) ist ein reiner Offline-Former. Er prueft
 * ausschliesslich die uebergebene Kopfform und gibt die belegte used-Zahl
 * zurueck. Er belegt AUSDRUECKLICH NICHT:
 *   - Authentizitaet oder Herkunft des Kopfes,
 *   - zeitliche Kontinuitaet,
 *   - nativen Snapshot, STABLE-Annahme oder Finance-Passung,
 *   - Bereitschaft, Finanzierung, Aktivierung oder Freigabe,
 *   - das tatsaechliche Null-Zeilen-Ergebnis.
 * Den echten Nullbestand belegen ausschliesslich der unabhaengig akzeptierte
 * STABLE native witness zusammen mit dem passenden echten Finance-Kopf.
 *
 * Keine Ausgabeautoritaet: kein Netz, kein Schreiben, kein Import einer
 * weiteren Laufzeitabhaengigkeit, keine Mutation, keine Koerzierung, keine
 * Defaults fuer Kopffelder.
 *
 * Gueltige Formen (jeweils exakt diese eigenen Felder, ordinary oder
 * null prototype, nur enumerable Dateneigenschaften):
 *   Gegenwart/Legacy: { day, scope, tableOid, xmin, used }
 *   Abwesenheit:      { day, scope, tableOid, rowCount, used }
 *
 * allowAbsence === true erlaubt zusaetzlich die exakte Abwesenheitsform;
 * die unveraenderte Gegenwartsform bleibt erlaubt. xmin ist im Absenzzweig verboten und
 * ein fehlender, null- oder undefined-Kopf bedeutet niemals Abwesenheit.
 * Legacy (allowAbsence === false) akzeptiert niemals Abwesenheit.
 */

const VERSION = 'helmut-original-state-counter-head/2-native-absence';
const ABBRUCH_MELDUNG = 'starttor-original-state-closed';

const TAG_MUSTER = /^\d{4}-\d{2}-\d{2}$/;
const TABELLEN_OID_MUSTER = /^[1-9][0-9]{0,9}$/;
const XMIN_MUSTER = /^(0|[1-9][0-9]{0,9})$/;

const SCOPE_GLOBAL = 'global';
const FELDER_GEGENWART = ['day', 'scope', 'tableOid', 'xmin', 'used'];
const FELDER_ABWESENHEIT = ['day', 'scope', 'tableOid', 'rowCount', 'used'];

function abbruch() {
  throw new Error(ABBRUCH_MELDUNG);
}

function istDatenFeld(deskriptor) {
  return deskriptor !== undefined
    && Object.prototype.hasOwnProperty.call(deskriptor, 'value')
    && deskriptor.enumerable === true;
}

function istGleicheFeldmenge(eigene, erwartete) {
  if (eigene.length !== erwartete.length) return false;
  for (let i = 0; i < eigene.length; i += 1) {
    if (erwartete.indexOf(eigene[i]) === -1) return false;
  }
  return true;
}

// Liest nur eigene enumerable Dateneigenschaften, nie ueber die Prototypenkette.
function leseKopfFelder(head, erwarteteFelder) {
  if (head === null || typeof head !== 'object') abbruch();
  const prototyp = Object.getPrototypeOf(head);
  if (prototyp !== Object.prototype && prototyp !== null) abbruch();
  if (Object.getOwnPropertySymbols(head).length !== 0) abbruch();
  const eigene = Object.getOwnPropertyNames(head);
  if (!istGleicheFeldmenge(eigene, erwarteteFelder)) abbruch();
  const werte = Object.create(null);
  for (let i = 0; i < eigene.length; i += 1) {
    const name = eigene[i];
    const deskriptor = Object.getOwnPropertyDescriptor(head, name);
    if (!istDatenFeld(deskriptor)) abbruch();
    werte[name] = deskriptor.value;
  }
  return werte;
}

function istKanonischerTag(wert) {
  const jahr = Number(wert.slice(0, 4));
  const monat = Number(wert.slice(5, 7));
  const tag = Number(wert.slice(8, 10));
  if (!Number.isInteger(jahr) || !Number.isInteger(monat) || !Number.isInteger(tag)) return false;
  if (monat < 1 || monat > 12) return false;
  if (tag < 1 || tag > 31) return false;
  if (jahr < 100 || jahr > 9999) return false;
  const pruef = new Date(Date.UTC(jahr, monat - 1, tag));
  return pruef.getUTCFullYear() === jahr
    && pruef.getUTCMonth() === monat - 1
    && pruef.getUTCDate() === tag;
}

function pruefeTag(day, kopfTag) {
  if (typeof day !== 'string' || !TAG_MUSTER.test(day)) abbruch();
  if (!istKanonischerTag(day)) abbruch();
  if (typeof kopfTag !== 'string' || kopfTag !== day) abbruch();
}

function pruefeScope(scope) {
  if (scope !== SCOPE_GLOBAL) abbruch();
}

function pruefeTabellenOid(tableOid) {
  if (typeof tableOid !== 'string' || !TABELLEN_OID_MUSTER.test(tableOid)) abbruch();
}

function pruefeXmin(xmin) {
  if (typeof xmin !== 'string' || !XMIN_MUSTER.test(xmin)) abbruch();
}

function pruefeUsed(used) {
  if (typeof used !== 'number') abbruch();
  if (!Number.isSafeInteger(used)) abbruch();
  if (used < 0) abbruch();
}

function pruefeIntern(head, day, allowAbsence) {
  if (typeof allowAbsence !== 'boolean') abbruch();
  if (head === null || typeof head !== 'object') abbruch();

  const eigene = Object.getOwnPropertyNames(head);
  const istAbwesenheit = istGleicheFeldmenge(eigene, FELDER_ABWESENHEIT);
  const istGegenwart = istGleicheFeldmenge(eigene, FELDER_GEGENWART);
  if (istAbwesenheit === istGegenwart) abbruch();
  if (istAbwesenheit && allowAbsence !== true) abbruch();

  const erwarteteFelder = istAbwesenheit ? FELDER_ABWESENHEIT : FELDER_GEGENWART;
  const werte = leseKopfFelder(head, erwarteteFelder);

  pruefeTag(day, werte.day);
  pruefeScope(werte.scope);
  pruefeTabellenOid(werte.tableOid);

  if (istAbwesenheit) {
    if (werte.rowCount !== 0) abbruch();
    pruefeUsed(werte.used);
    if (werte.used !== 0) abbruch();
    return 0;
  }

  pruefeXmin(werte.xmin);
  pruefeUsed(werte.used);
  return werte.used;
}

function pruefe(head, day, allowAbsence = false) {
  try {
    return pruefeIntern(head, day, allowAbsence);
  } catch (fehler) {
    if (fehler instanceof Error && fehler.message === ABBRUCH_MELDUNG) throw fehler;
    abbruch();
  }
}

module.exports = Object.freeze({
  VERSION: VERSION,
  pruefe: pruefe,
});
