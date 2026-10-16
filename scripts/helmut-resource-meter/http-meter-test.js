'use strict';
const assert = require('node:assert/strict'), http = require('node:http'), net = require('node:net');
const moduleMeter = require('./http-meter');
const meter = moduleMeter.current() || moduleMeter.install(process.argv[2]);
const server = http.createServer((req,res) => {
  const received = []; req.on('data',x=>received.push(x));
  req.on('end',()=>{
    if(req.url==='/post') { assert.equal(Buffer.concat(received).toString(),'äβ');res.setHeader('Content-Length','4');return res.end('öOK',()=>{}); }
    if(req.url==='/chunk') {res.write('a',()=>{});return res.end('ß',()=>{});}
    if(req.url==='/head') {res.setHeader('Content-Length','77');return res.end();}
    if(req.url==='/empty') {res.statusCode=204;return res.end();}
    if(req.url==='/abort') {res.setHeader('Content-Length','100000');res.write('part');setTimeout(()=>res.destroy(),10);return;}
    res.statusCode=404;res.end('{}');
  });
});
function request(port,method,path,body) {
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:'127.0.0.1',port,method,path,agent:false},res=>{
      const chunks=[];res.on('data',x=>chunks.push(x));
      res.on('end',()=>resolve({status:res.statusCode,body:Buffer.concat(chunks).toString()}));
      res.on('aborted',()=>resolve({aborted:true,body:Buffer.concat(chunks).toString()}));
    });req.on('error',reject);req.end(body);
  });
}
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  assert.deepEqual(await request(port,'POST','/post','äβ'),{status:200,body:'öOK'});
  assert.deepEqual(await request(port,'GET','/chunk'),{status:200,body:'aß'});
  assert.deepEqual(await request(port,'HEAD','/head'),{status:200,body:''});
  assert.deepEqual(await request(port,'GET','/empty'),{status:204,body:''});
  const abort=await request(port,'GET','/abort');assert.equal(abort.aborted,true);assert.equal(abort.body,'part');
  // Native fetch/undici must also be covered, without replacing its behavior.
  const f=await fetch('http://127.0.0.1:'+port+'/chunk');assert.equal(await f.text(),'aß');
  await new Promise((resolve,reject)=>{
    const socket=net.connect(port,'127.0.0.1',()=>socket.end('INVALID REQUEST\r\n\r\n'));
    socket.resume();socket.on('close',resolve);socket.on('error',reject);
  });
  // A real TCP reset after a close-delimited partial body is not a valid EOF.
  const raw=net.createServer(socket=>{
    socket.once('data',()=>{socket.write('HTTP/1.0 200 OK\r\n\r\ncut',()=>setTimeout(()=>socket.resetAndDestroy(),10));});
  });
  await new Promise(r=>raw.listen(0,'127.0.0.1',r));
  try {
    const rst=await request(raw.address().port,'GET','/reset');assert.equal(rst.body,'cut');
  } catch(error) {assert.equal(error.code,'ECONNRESET');}
  finally {await new Promise(r=>raw.close(r));}
  await new Promise(r=>server.close(r));
  await new Promise(r=>setTimeout(r,30));const s=meter.snapshot();
  assert.equal(s.requests,6);assert.equal(s.finished,5);assert.equal(s.aborted,1);
  assert.equal(s.requestBodyBytes,4);assert.equal(s.responseBodyReceivedBytes,17);
  assert.equal(s.parseErrors,0);assert.equal(s.incompleteResponses,2);assert(s.connectionResetErrors>=1);
  assert(s.protocolErrors>=1);assert(s.clientTCPBytesRead>s.responseBodyReceivedBytes);
  assert.equal(s.openServerSockets,0);
  console.log(JSON.stringify({pass:true,smallLiveHTTPCases:8,full500Runs:0,
    requestBodyBytes:s.requestBodyBytes,receivedResponseBodyBytes:s.responseBodyReceivedBytes,
    clientTransportBytes:s.clientTCPBytesRead+s.clientTCPBytesWritten,protocolErrors:s.protocolErrors}));
})().catch(error=>{console.error(error.code||error.name);process.exitCode=1;server.closeAllConnections();server.close();});
