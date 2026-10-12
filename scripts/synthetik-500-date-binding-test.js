'use strict';

/**
 * Statische Grenzpruefung der Synthetik-500 Datumsbindung.
 *
 * Rein fiktive Datumsfixtures. Die gueltige Planfixture uebernimmt Routeversion
 * und ServiceContractHash unveraendert aus dem echten EU-Vertragsmodul; Preise
 * und ACTIVE_MS werden hier nicht gesetzt, variiert oder nachgebaut.
 * Keine echten Quelltexte, Urteile, Profile oder Zahlungsdaten. Kein HTTP,
 * keine DB, kein KI-Aufruf, keine Auth-, Write- oder Production-Pfade.
 * Kein Ersatz fuer den 500er-Fachbeleg; die Bindung ist kein Originalnachweis.
 */

const assert = require('node:assert');
const crypto = require('node:crypto');
const path = require('node:path');

const { bind, isHistorical, assertCurrent } = require(
  path.join(__dirname, '..', 'lib', 'helmut', 'synthetik-500-date-binding.js'),
);
const EU = require(
  path.join(__dirname, '..', 'lib', 'helmut', 'synthetik-500-eu-service-contract.js'),
);

const ERROR_PREFIX = 'synthetik500-date-binding-';

const CAPTURED_AT = '2026-10-11T04:00:00.000Z';
const CAPTURE_TAG = '2026-10-11';
const RUN_START = '2026-10-12T06:00:00.000Z';
const RUN_END = '2026-10-12T10:00:00.000Z';
const WRONG_HASH = EU.HASH.replace(/^./, EU.HASH[0] === '0' ? '1' : '0');

let groupCount = 0;
let testCount = 0;
let failureCount = 0;

function group(name, fn) {
  groupCount += 1;
  try {
    fn();
  } catch (error) {
    failureCount += 1;
    console.error('FAIL group ' + name + ': ' + (error && error.message));
  }
}

function test(name, fn) {
  testCount += 1;
  try {
    fn();
  } catch (error) {
    failureCount += 1;
    console.error('FAIL ' + name + ': ' + (error && error.message));
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function expectFail(code, fn) {
  let caught = null;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, 'erwartete Ablehnung ' + code);
  assert.strictEqual(caught.message, ERROR_PREFIX + code);
  assert.ok(!/[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(caught.message), 'Fehlermeldung ohne Rohdatum');
  assert.ok(!caught.message.includes(EU.HASH), 'Fehlermeldung ohne Vertragshash');
}

function validContract() {
  return { version: EU.ROUTE_VERSION, serviceContractHash: EU.HASH };
}

function makePlan(startsAtUTC, endsAtUTC, routeContract) {
  return { startsAtUTC, endsAtUTC, routeContract: routeContract || validContract() };
}

function makeDoc(options) {
  const o = options || {};
  const capturedAtUTC = o.capturedAtUTC === undefined ? CAPTURED_AT : o.capturedAtUTC;
  return {
    briefingDatum: o.briefingDatum === undefined ? capturedAtUTC : o.briefingDatum,
    briefingEingabe: {
      version: o.version === undefined ? 2 : o.version,
      eingabe: { tag: o.tag === undefined ? CAPTURE_TAG : o.tag },
      acceptedSnapshot: { leaf: { capturedAtUTC } },
    },
  };
}

function bindJson(doc, plan) {
  return JSON.stringify(bind(doc, plan));
}

group('annahme: 11.10-Capture mit 12.10-Lauf', () => {
  test('isHistorical erkennt Version 2', () => {
    assert.strictEqual(isHistorical(makeDoc()), true);
  });

  test('bind liefert eingefrorene Bindung mit erwarteten Feldern', () => {
    const binding = bind(makeDoc(), makePlan(RUN_START, RUN_END));
    assert.strictEqual(Object.isFrozen(binding), true);
    assert.deepStrictEqual(binding, {
      version: 'helmut-synthetik500-date-binding/1',
      sourceCapturedAtUTC: CAPTURED_AT,
      sourceDay: CAPTURE_TAG,
      executionDay: '2026-10-12',
      startsAtUTC: RUN_START,
      endsAtUTC: RUN_END,
      serviceContractHash: EU.HASH,
    });
  });

  test('Eingabeobjekte und Hashes bleiben unveraendert', () => {
    const doc = makeDoc();
    const plan = makePlan(RUN_START, RUN_END);
    const docHash = sha256(doc);
    const planHash = sha256(plan);
    bind(doc, plan);
    assert.strictEqual(sha256(doc), docHash);
    assert.strictEqual(sha256(plan), planHash);
  });

  test('kein Authority- oder Merkle-Feld in der Bindung', () => {
    const binding = bind(makeDoc(), makePlan(RUN_START, RUN_END));
    assert.strictEqual(Object.keys(binding).length, 7);
    for (const key of ['merkleRoot', 'authority', 'verify', 'realProven'] ) {
      assert.ok(!Object.prototype.hasOwnProperty.call(binding, key), 'unerwartetes Feld ' + key);
    }
  });
});

group('annahme: Berliner Capturetag gilt, nicht der UTC-Tag', () => {
  test('UTC-Vortag 22:30 gilt als Berliner 11.10.', () => {
    const doc = makeDoc({ capturedAtUTC: '2026-10-10T22:30:00.000Z', tag: '2026-10-11' });
    const binding = bind(doc, makePlan(RUN_START, RUN_END));
    assert.strictEqual(binding.sourceCapturedAtUTC, '2026-10-10T22:30:00.000Z');
    assert.strictEqual(binding.sourceDay, CAPTURE_TAG);
    assert.strictEqual(binding.executionDay, '2026-10-12');
  });

  test('UTC-Tag statt Berliner Tag wird abgewiesen', () => {
    expectFail('source-day-mismatch', () =>
      bind(makeDoc({ capturedAtUTC: '2026-10-10T22:30:00.000Z', tag: '2026-10-10' }), makePlan(RUN_START, RUN_END)),
    );
  });
});

group('annahme: spaetere gueltige Ausfuehrungstage', () => {
  for (const day of ['2026-10-12', '2026-10-13', '2026-10-15', '2026-10-25']) {
    test('Lauf am ' + day + ' wird akzeptiert', () => {
      const binding = bind(makeDoc(), makePlan(day + 'T06:00:00.000Z', day + 'T10:00:00.000Z'));
      assert.strictEqual(binding.executionDay, day);
      assert.strictEqual(binding.sourceDay, CAPTURE_TAG);
    });
  }
});

group('ablehnung: Capturebindung', () => {
  test('Zukunftscapture wird abgewiesen', () => {
    expectFail('capture-day-mismatch', () =>
      bind(makeDoc({ capturedAtUTC: '2026-10-12T04:00:00.000Z', tag: '2026-10-12' }), makePlan('2026-10-13T06:00:00.000Z', '2026-10-13T10:00:00.000Z')),
    );
  });

  test('Laufbeginn vor Capture wird abgewiesen', () => {
    expectFail('start-before-capture', () =>
      bind(makeDoc(), makePlan('2026-10-11T03:00:00.000Z', '2026-10-11T05:00:00.000Z')),
    );
  });

  test('falscher Berliner Quelltag wird abgewiesen', () => {
    expectFail('source-day-mismatch', () => bind(makeDoc({ tag: '2026-10-10' }), makePlan(RUN_START, RUN_END)));
  });

  test('umgeschriebener Capturetag wird abgewiesen', () => {
    expectFail('briefing-datum-mismatch', () =>
      bind(makeDoc({ briefingDatum: '2026-10-12T04:00:00.000Z' }), makePlan(RUN_START, RUN_END)),
    );
  });

  test('nicht kanonische Capturezeit wird abgewiesen', () => {
    expectFail('non-canonical-capture', () =>
      bind(makeDoc({ capturedAtUTC: '2026-10-11T04:00:00Z' }), makePlan(RUN_START, RUN_END)),
    );
  });

  test('nicht kanonische Laufzeit wird abgewiesen', () => {
    expectFail('non-canonical-start', () =>
      bind(makeDoc(), makePlan('2026-10-12T06:00:00Z', RUN_END)),
    );
  });
});

group('ablehnung: Route und Version', () => {
  test('fehlender Routevertrag wird abgewiesen', () => {
    expectFail('missing-route-contract', () => bind(makeDoc(), { startsAtUTC: RUN_START, endsAtUTC: RUN_END }));
  });

  test('abweichende Routeversion wird abgewiesen', () => {
    expectFail('route-not-eu', () =>
      bind(makeDoc(), makePlan(RUN_START, RUN_END, {
        version: 'helmut-synthetik500-route-contract/1',
        serviceContractHash: EU.HASH,
      })),
    );
  });

  test('abweichender ServiceContractHash wird abgewiesen', () => {
    expectFail('route-not-eu', () =>
      bind(makeDoc(), makePlan(RUN_START, RUN_END, {
        version: EU.ROUTE_VERSION,
        serviceContractHash: WRONG_HASH,
      })),
    );
  });

  test('fehlender ServiceContractHash wird abgewiesen', () => {
    expectFail('route-not-eu', () =>
      bind(makeDoc(), makePlan(RUN_START, RUN_END, { version: EU.ROUTE_VERSION })),
    );
  });

  test('gueltige EU-Route wird akzeptiert', () => {
    const binding = bind(makeDoc(), makePlan(RUN_START, RUN_END, validContract()));
    assert.strictEqual(binding.serviceContractHash, EU.HASH);
  });

  test('Version 1 wird abgewiesen und nicht als historisch gefuehrt', () => {
    const version1 = makeDoc({ version: 1 });
    assert.strictEqual(isHistorical(version1), false);
    expectFail('not-historical', () => bind(version1, makePlan(RUN_START, RUN_END)));
  });
});

group('grenze: Spanne und Tageswechsel', () => {
  test('exakt 9h wird akzeptiert', () => {
    const binding = bind(makeDoc(), makePlan('2026-10-12T00:00:00.000Z', '2026-10-12T09:00:00.000Z'));
    assert.strictEqual(binding.executionDay, '2026-10-12');
  });

  test('9h plus 1ms wird abgewiesen', () => {
    expectFail('span-exceeds-active', () =>
      bind(makeDoc(), makePlan('2026-10-12T00:00:00.000Z', '2026-10-12T09:00:00.001Z')),
    );
  });

  test('UTC-Mitternachtswechsel wird abgewiesen', () => {
    expectFail('utc-day-crossing', () =>
      bind(makeDoc(), makePlan('2026-10-11T22:30:00.000Z', '2026-10-12T00:30:00.000Z')),
    );
  });

  test('Berliner Mitternachtswechsel bei gleichem UTC-Tag wird abgewiesen', () => {
    expectFail('berlin-day-crossing', () =>
      bind(makeDoc(), makePlan('2026-10-11T21:30:00.000Z', '2026-10-11T22:30:00.000Z')),
    );
  });
});

group('grenze: Auftrags- und Preisfenster aus dem EU-Vertrag', () => {
  test('Laufbeginn vor dem Preisfenster wird bereits durch die Capturebindung abgewiesen', () => {
    expectFail('start-before-capture', () =>
      bind(makeDoc(), makePlan('2026-09-30T06:00:00.000Z', '2026-09-30T07:00:00.000Z')),
    );
  });

  test('Ende nach dem Auftragsdatum wird abgewiesen', () => {
    expectFail('end-after-last-order-date', () =>
      bind(makeDoc(), makePlan('2026-10-26T06:00:00.000Z', '2026-10-26T07:00:00.000Z')),
    );
  });

  test('Lauf nach dem Preisfenster wird abgewiesen', () => {
    expectFail('end-after-price-window', () =>
      bind(makeDoc(), makePlan('2026-11-01T06:00:00.000Z', '2026-11-01T07:00:00.000Z')),
    );
  });

  test('Ende gleich Beginn wird abgewiesen', () => {
    expectFail('end-not-after-start', () => bind(makeDoc(), makePlan(RUN_START, RUN_START)));
  });
});

group('assertCurrent: Laufende exklusiv, Start inklusiv', () => {
  test('now gleich Beginn wird akzeptiert', () => {
    const doc = makeDoc();
    const plan = makePlan(RUN_START, RUN_END);
    const binding = assertCurrent(doc, plan, RUN_START);
    assert.strictEqual(Object.isFrozen(binding), true);
    assert.strictEqual(JSON.stringify(binding), bindJson(doc, plan));
  });

  test('now kurz vor Ende wird akzeptiert', () => {
    const binding = assertCurrent(makeDoc(), makePlan(RUN_START, RUN_END), '2026-10-12T09:59:59.999Z');
    assert.strictEqual(binding.executionDay, '2026-10-12');
  });

  test('now gleich Ende wird abgewiesen', () => {
    expectFail('now-at-or-after-end', () => assertCurrent(makeDoc(), makePlan(RUN_START, RUN_END), RUN_END));
  });

  test('now vor Beginn wird abgewiesen', () => {
    expectFail('now-before-start', () =>
      assertCurrent(makeDoc(), makePlan(RUN_START, RUN_END), '2026-10-12T05:59:59.999Z'),
    );
  });

  test('nicht kanonisches now wird abgewiesen', () => {
    expectFail('non-canonical-now', () =>
      assertCurrent(makeDoc(), makePlan(RUN_START, RUN_END), '2026-10-12T06:00:00Z'),
    );
  });
});

group('abgrenzung: keine Original- oder Authority-Wirkung', () => {
  test('JSON-Kopie der Bindung gilt nicht als Originaleingabe', () => {
    const copy = JSON.parse(bindJson(makeDoc(), makePlan(RUN_START, RUN_END)));
    assert.strictEqual(isHistorical(copy), false);
    expectFail('not-historical', () => bind(copy, makePlan(RUN_START, RUN_END)));
  });

  test('eingefrorene Bindung ist nicht mutierbar', () => {
    const binding = bind(makeDoc(), makePlan(RUN_START, RUN_END));
    assert.throws(() => {
      binding.startsAtUTC = '2026-10-12T00:00:00.000Z';
    }, TypeError);
  });

  test('Umgebungsvariablen veraendern die Bindung nicht', () => {
    const doc = makeDoc();
    const plan = makePlan(RUN_START, RUN_END);
    const before = bindJson(doc, plan);
    const previous = process.env.HELMUT_SYNTHETIK500_DATE_OVERRIDE;
    process.env.HELMUT_SYNTHETIK500_DATE_OVERRIDE = '2026-10-25T00:00:00.000Z';
    try {
      assert.strictEqual(bindJson(doc, plan), before);
    } finally {
      if (previous === undefined) delete process.env.HELMUT_SYNTHETIK500_DATE_OVERRIDE;
      else process.env.HELMUT_SYNTHETIK500_DATE_OVERRIDE = previous;
    }
  });

  test('zwei Aufrufe liefern identische Bindung ohne Zeitabhaengigkeit', () => {
    const doc = makeDoc();
    const plan = makePlan(RUN_START, RUN_END);
    assert.strictEqual(bindJson(doc, plan), bindJson(doc, plan));
  });
});

console.log('synthetik-500-date-binding-test: groups=' + groupCount + ' tests=' + testCount + ' failed=' + failureCount);
if (failureCount > 0) process.exitCode = 1;
