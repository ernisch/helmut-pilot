'use strict';
const assert = require('node:assert/strict');
const {ResponseCounter} = require('./http-framing');
function measure(text, methods, step, hadError = false) {
  const totals = {responseTCPDeliveredBytes: 0, responseBodyReceivedBytes: 0,
    responseHeaderBytes: 0, responseFramingBytes: 0, responses: 0,
    parseErrors: 0, incompleteResponses: 0, unparsedResponseBytes: 0};
  const counter = new ResponseCounter([...methods], totals), bytes = Buffer.from(text);
  for (let i = 0; i < bytes.length; i += step) counter.feed(bytes.subarray(i, i + step));
  counter.close(hadError); return totals;
}
const samples = [
  ['HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello', ['GET'], 5, 1],
  ['HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n3\r\nabc\r\n2\r\nde\r\n0\r\n\r\n', ['POST'], 5, 1],
  ['HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nö', ['POST'], 2, 1],
  ['HTTP/1.1 200 OK\r\nContent-Length: 999\r\n\r\nHTTP/1.1 204 No Content\r\n\r\n', ['HEAD', 'GET'], 0, 2],
  ['HTTP/1.0 200 OK\r\n\r\nclosed', ['GET'], 6, 1],
  ['HTTP/1.1 200 OK\r\nSet-Cookie: a\r\nSet-Cookie: b\r\nContent-Length: 0\r\n\r\n', ['GET'], 0, 1],
];
let cases = 0;
for (const [sample, methods, body, responses] of samples) {
  for (const step of [1, 2, 3, 7, 65536]) {
    const result = measure(sample, methods, step);
    assert.equal(result.responseBodyReceivedBytes, body);
    assert.equal(result.responses, responses); assert.equal(result.parseErrors, 0);
    assert.equal(result.incompleteResponses, 0);
    assert.equal(result.responseTCPDeliveredBytes,
      result.responseHeaderBytes + result.responseFramingBytes + result.responseBodyReceivedBytes);
    cases++;
  }
}
const partial = measure('HTTP/1.1 200 OK\r\nContent-Length: 50\r\n\r\nabc', ['GET'], 1);
assert.equal(partial.responseBodyReceivedBytes, 3); assert.equal(partial.incompleteResponses, 1); cases++;
for (const text of ['INVALID\r\n\r\n', 'HTTP/1.1 200 OK\r\nContent-Length: -1\r\n\r\n',
  'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Length: 2\r\n\r\n',
  'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nZZ\r\n']) {
  assert.equal(measure(text, ['GET'], 1).parseErrors, 1); cases++;
}
for (const trailer of ['broken', 'Content-Length: 4', 'Transfer-Encoding: chunked', 'x: bad\x00value']) {
  const r = measure('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n' + trailer + '\r\n\r\n', ['GET'], 1);
  assert.equal(r.parseErrors, 1); cases++;
}
for (const extension of [';', ';;', ';=bad', ';name="unterminated']) {
  assert.equal(measure('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n1' + extension + '\r\na\r\n0\r\n\r\n',['GET'],1).parseErrors,1);cases++;
}
const validExtension=measure('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n1;name;quoted="a\\"b"\r\na\r\n0\r\n\r\n',['GET'],1);
assert.equal(validExtension.parseErrors,0);assert.equal(validExtension.responseBodyReceivedBytes,1);cases++;
const reset = measure('HTTP/1.0 200 OK\r\n\r\npartial', ['GET'], 2, true);
assert.equal(reset.connectionResetErrors, 1); assert.equal(reset.incompleteResponses, 1); cases++;
console.log(JSON.stringify({pass: true, smallLocalFramingCases: cases, full500Runs: 0}));
