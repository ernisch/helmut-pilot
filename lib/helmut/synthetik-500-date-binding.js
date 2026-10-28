'use strict';

/**
 * Synthetik-500: reine Datumsbindung fuer historisches Version-2-D-Input.
 *
 * Die Rueckgabe belegt ausschliesslich eine strukturelle Zeitbindung. Sie ist
 * KEIN Echtheitsnachweis des Originals: H.verify mit den bestehenden Original-,
 * Merkle-, Profil- und Policypruefungen bleibt nachgelagert Pflicht.
 *
 * Grenzen dieser Datei:
 * - Nur Version-2-Eingaben sind bindbar; Legacy und H.verify bleiben unveraendert.
 * - Zeitbindung ist opt-in und nur mit gueltigem EU-Routeplan moeglich.
 * - Gueltig ist ein Plan ausschliesslich dann, wenn der echte EU-Vertrag ihn
 *   ueber EU.isPlan akzeptiert (Routeversion und ServiceContractHash). Kein
 *   callerdefinierter Marker, keine Funktionsinjektion, kein Ersatzvertrag.
 * - ACTIVE_MS, Preisgrenzen und Auftragsdatum stammen unveraenderlich aus dem
 *   eingefrorenen EU-Vertrag. Ausschliesslich die eigene hashgebundene
 *   Auftragsverlaengerung im Routeplan darf dessen letztes Auftragsdatum
 *   ersetzen; Geld, Preisfenster und ACTIVE_MS bleiben unveraendert.
 * - Original-Capturetag ist der Berliner Kalendertag 2026-10-11; der UTC-Tag
 *   kann davor liegen.
 * - Kein Umgebungs- oder Nutzer-Override, kein Modell, kein Date.now, keine Toleranz.
 * - Fehler nennen nur einen kurzen Code, keine Rohdaten oder Geheimnisse.
 */

const EU = require('./synthetik-500-eu-service-contract');

const BINDING_VERSION = 'helmut-synthetik500-date-binding/1';
const ERROR_PREFIX = 'synthetik500-date-binding-';
const BERLIN_TIME_ZONE = 'Europe/Berlin';
const CAPTURE_DAY = '2026-10-11';

const CANONICAL_UTC_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UTC_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const berlinDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BERLIN_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function fail(code) {
  const error = new Error(ERROR_PREFIX + code);
  error.code = ERROR_PREFIX + code;
  throw error;
}

function isHistorical(daten) {
  return daten?.briefingEingabe?.version === 2;
}

function utcDayOf(canonicalUtcMs) {
  return canonicalUtcMs.slice(0, 10);
}

function toCanonicalUtcMs(value, code) {
  if (typeof value !== 'string' || !CANONICAL_UTC_MS.test(value)) fail(code);
  const epochMs = Date.parse(value);
  if (!Number.isFinite(epochMs)) fail(code);
  if (new Date(epochMs).toISOString() !== value) fail(code);
  return epochMs;
}

function berlinDayOf(epochMs) {
  const parts = berlinDayFormatter.formatToParts(new Date(epochMs));
  const day = {};
  for (const part of parts) {
    if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
      day[part.type] = part.value;
    }
  }
  if (!day.year || !day.month || !day.day) fail('berlin-day-unavailable');
  return day.year + '-' + day.month + '-' + day.day;
}

function requireEuContract(plan) {
  if (!plan || typeof plan !== 'object') fail('missing-plan');
  if (!plan.routeContract || typeof plan.routeContract !== 'object') fail('missing-route-contract');
  // Allein der echte EU-Vertrag entscheidet ueber Routeversion und Hash.
  if (!EU.isPlan(plan)) fail('route-not-eu');
  return EU.contractForRoute(plan.routeContract);
}

function bind(daten, plan) {
  if (!isHistorical(daten)) fail('not-historical');

  const eingabeBlock = daten.briefingEingabe;
  const sourceDay = eingabeBlock.eingabe?.tag;
  if (typeof sourceDay !== 'string' || !UTC_DAY_PATTERN.test(sourceDay)) fail('missing-source-day');

  const capturedAtUTC = eingabeBlock.acceptedSnapshot?.leaf?.capturedAtUTC;
  const capturedMs = toCanonicalUtcMs(capturedAtUTC, 'non-canonical-capture');

  if (daten.briefingDatum !== capturedAtUTC) fail('briefing-datum-mismatch');

  const captureDay = berlinDayOf(capturedMs);
  if (captureDay !== CAPTURE_DAY) fail('capture-day-mismatch');
  if (sourceDay !== captureDay) fail('source-day-mismatch');

  const contract = requireEuContract(plan);
  const startsAtUTC = plan.startsAtUTC;
  const endsAtUTC = plan.endsAtUTC;
  const startsMs = toCanonicalUtcMs(startsAtUTC, 'non-canonical-start');
  const endsMs = toCanonicalUtcMs(endsAtUTC, 'non-canonical-end');

  if (startsMs < capturedMs) fail('start-before-capture');
  if (endsMs <= startsMs) fail('end-not-after-start');
  if (endsMs - startsMs > EU.ACTIVE_MS) fail('span-exceeds-active');
  if (utcDayOf(startsAtUTC) !== utcDayOf(endsAtUTC)) fail('utc-day-crossing');

  const executionDay = berlinDayOf(startsMs);
  if (executionDay !== berlinDayOf(endsMs)) fail('berlin-day-crossing');

  const priceStartsMs = toCanonicalUtcMs(contract.priceStartsUTC, 'missing-price-start');
  const priceEndsMs = toCanonicalUtcMs(contract.priceEndsUTC, 'missing-price-end');
  if (startsMs < priceStartsMs) fail('start-before-price-window');
  if (endsMs > priceEndsMs) fail('end-after-price-window');
  if (utcDayOf(endsAtUTC) > contract.lastOrderUTCDate) fail('end-after-last-order-date');

  return Object.freeze({
    version: BINDING_VERSION,
    sourceCapturedAtUTC: capturedAtUTC,
    sourceDay,
    executionDay,
    startsAtUTC,
    endsAtUTC,
    serviceContractHash: EU.HASH,
  });
}

function assertCurrent(daten, plan, now) {
  const binding = bind(daten, plan);
  const nowMs = toCanonicalUtcMs(now, 'non-canonical-now');
  const startsMs = Date.parse(binding.startsAtUTC);
  const endsMs = Date.parse(binding.endsAtUTC);

  if (nowMs < startsMs) fail('now-before-start');
  if (nowMs >= endsMs) fail('now-at-or-after-end');
  if (utcDayOf(now) !== utcDayOf(binding.startsAtUTC)) fail('now-utc-day-mismatch');
  if (berlinDayOf(nowMs) !== binding.executionDay) fail('now-execution-day-mismatch');

  return binding;
}

module.exports = { bind, isHistorical, assertCurrent };
