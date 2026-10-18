'use strict';
// Local diagnostic only. Counters never retain bodies, headers, tokens or URLs
// with query parameters. Payload bytes and unique client TCP payload bytes are
// separate metrics; server/client endpoints must never be blindly summed.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const {ResponseCounter} = require('./http-framing');
let installed = false;
let active = null;
const {threadId} = require('node:worker_threads');
function byteLength(value, encoding) {
  if (typeof value === 'string') return Buffer.byteLength(value, typeof encoding === 'string' ? encoding : 'utf8');
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return value.byteLength;
  return 0;
}
function install(directory) {
  if (installed) throw Error('RESOURCE_HTTP_METER_ALREADY_INSTALLED');
  if (!path.isAbsolute(directory) || !fs.statSync(directory).isDirectory()) throw Error('RESOURCE_HTTP_METER_OUTPUT');
  installed = true;
  const identity = process.pid + '_' + threadId;
  fs.writeFileSync(path.join(directory, 'HTTP_' + identity + '.STARTED.SAFE.json'),
    JSON.stringify({schema: 'helmut-local-http-meter-start/1', pid: process.pid, threadId}) + '\n', {flag: 'wx', mode: 0o600});
  const stats = {schema: 'helmut-local-http-meter/2', pid: process.pid, threadId,
    requests: 0, finished: 0, aborted: 0, requestBodyBytes: 0, responseBodyBytes: 0,
    serverConnectionsOpened: 0, serverConnectionsClosed: 0,
    clientConnectionsOpened: 0, clientConnectionsClosed: 0,
    clientTCPBytesRead: 0, clientTCPBytesWritten: 0,
    serverTCPBytesRead: 0, serverTCPBytesWritten: 0, protocolErrors: 0,
    responseTCPDeliveredBytes: 0, responseHeaderBytes: 0, responseFramingBytes: 0,
    responseBodyReceivedBytes: 0, responses: 0, parseErrors: 0,
    unparsedResponseBytes: 0, incompleteResponses: 0, connectionResetErrors: 0,
    idleConnectionResetErrors: 0, incompleteConnectionResetErrors: 0,
    routes: Object.create(null), noPayloadOrCredentialRetention: true};
  const servers = new Set(), clients = new Set();
  function observeSocket(socket, set, kind) {
    if (set.has(socket)) return;
    set.add(socket); stats[kind + 'ConnectionsOpened']++;
    socket.once('close', () => {
      stats[kind + 'TCPBytesRead'] += socket.bytesRead;
      stats[kind + 'TCPBytesWritten'] += socket.bytesWritten;
      stats[kind + 'ConnectionsClosed']++;
      set.delete(socket);
    });
  }
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function(...args) {
    const result = Reflect.apply(connect, this, args);
    observeSocket(this, clients, 'client');
    // Framing is installed by the HTTP request constructors below. Other TCP
    // clients remain in exact socket totals without pretending to parse HTTP.
    return result;
  };
  function routeOf(req) {
    const raw = String(req.url || '').split('?')[0];
    const matched = raw.match(/^\/rest\/v1\/(?:rpc\/)?[a-zA-Z0-9_]+/);
    if (matched) return matched[0];
    if (raw.startsWith('/api/')) return '/api/entry';
    return '/other';
  }
  function observe(req, res) {
    stats.requests++;
    const route = routeOf(req), method = /^[A-Z]{1,16}$/.test(req.method || '') ? req.method : 'OTHER';
    const key = method + ' ' + route;
    const row = stats.routes[key] ||= {requests: 0, finished: 0, aborted: 0,
      requestBodyBytes: 0, responseBodyBytes: 0, status: Object.create(null)};
    row.requests++;
    // Observing emit preserves request-stream flow control and consumption.
    const emit = req.emit;
    req.emit = function(event, ...args) {
      if (event === 'data') {
        const bytes = byteLength(args[0]); stats.requestBodyBytes += bytes; row.requestBodyBytes += bytes;
      }
      return Reflect.apply(emit, this, [event, ...args]);
    };
    const write = res.write, end = res.end;
    res.write = function(chunk, encoding, ...args) {
      const bytes = byteLength(chunk, encoding); stats.responseBodyBytes += bytes; row.responseBodyBytes += bytes;
      return Reflect.apply(write, this, [chunk, encoding, ...args]);
    };
    res.end = function(chunk, encoding, ...args) {
      const bytes = byteLength(chunk, encoding); stats.responseBodyBytes += bytes; row.responseBodyBytes += bytes;
      return Reflect.apply(end, this, [chunk, encoding, ...args]);
    };
    let complete = false;
    res.once('finish', () => {
      complete = true; stats.finished++; row.finished++;
      const code = String(res.statusCode); row.status[code] = (row.status[code] || 0) + 1;
    });
    res.once('close', () => { if (!complete) { stats.aborted++; row.aborted++; } });
  }
  const createServer = http.createServer;
  http.createServer = function(...args) {
    const server = Reflect.apply(createServer, this, args);
    server.prependListener('request', observe);
    server.on('connection', socket => observeSocket(socket, servers, 'server'));
    const emit = server.emit;
    server.emit = function(event, ...values) {
      if (event === 'clientError') stats.protocolErrors++;
      return Reflect.apply(emit, this, [event, ...values]);
    };
    return server;
  };
  const counted = new WeakMap();
  function responseSocket(socket, method) {
    let state = counted.get(socket);
    if (!state) {
      const methods = [], counter = new ResponseCounter(methods, stats);
      state = {methods, counter}; counted.set(socket, state);
      const emit = socket.emit;
      socket.emit = function(event, ...args) {
        if (event === 'data') counter.feed(args[0]);
        return Reflect.apply(emit, this, [event, ...args]);
      };
      socket.once('close', hadError => counter.close(Boolean(hadError || socket.errored)));
    }
    state.methods.push(method);
  }
  const request = http.request;
  http.request = function(...args) {
    const req = Reflect.apply(request, this, args);
    req.once('socket', socket => responseSocket(socket, req.method));
    return req;
  };
  const get = http.get;
  http.get = function(...args) {
    // Native http.get closes over its unpatched request function.
    const req = Reflect.apply(get, this, args);
    req.once('socket', socket => responseSocket(socket, req.method));
    return req;
  };
  const dc = require('node:diagnostics_channel');
  dc.channel('undici:client:sendHeaders').subscribe(({request, socket}) => {
    responseSocket(socket, request.method);
  });
  function snapshot() {
    const result = structuredClone(stats);
    for (const [set, kind] of [[clients, 'client'], [servers, 'server']]) {
      for (const socket of set) {
        result[kind + 'TCPBytesRead'] += socket.bytesRead;
        result[kind + 'TCPBytesWritten'] += socket.bytesWritten;
      }
    }
    result.openClientSockets = clients.size; result.openServerSockets = servers.size;
    result.unfinishedActiveHTTPParsers = [...clients].filter(socket => {
      const value = counted.get(socket); return value && !value.counter.idle();
    }).length;
    result.applicationCPU = process.resourceUsage();
    result.notKernelWholeGroupExitMeasurement = true;
    result.responseBodyBytesAreHandlerAttempts = true;
    result.receivedResponseBodyBytesUsePassiveHTTPFraming = true;
    return result;
  }
  process.once('exit', () => {
    const result = snapshot();
    fs.writeFileSync(path.join(directory, 'HTTP_' + identity + '.SAFE.json'),
      JSON.stringify(result) + '\n', {flag: 'wx', mode: 0o600});
  });
  active = {snapshot};
  return active;
}
module.exports = {install, byteLength, current: () => active};
// Native stage wrappers intentionally scrub env. An explicit --require still
// must install the meter, independent of inherited environment variables.
if (process.env.HELMUT_RESOURCE_METER_DIR || module.isPreloading)
  install(process.env.HELMUT_RESOURCE_METER_DIR || '/meter-output/http');
