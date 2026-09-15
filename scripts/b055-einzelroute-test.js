'use strict';
process.env.CRON_SECRET='offline-synthetisch'; process.env.HELMUT_AUTH_MODE='accounts';
const A=require('node:assert/strict'),root=require('node:path').join(__dirname,'..');
const E=require(root+'/lib/helmut/b055-einzelabschluss');let calls=0;
E.ausfuehren=async a=>{calls++;A.equal(typeof a.build,'function');A.equal(typeof a.config,'function');A.equal(a.commit,'a'.repeat(40));return {ok:true,probe:true};};
const handler=require(root+'/server');
const request=(method,authorization,path='/api/cron/b055-einzelabschluss')=>new Promise(resolve=>{
let status;handler({url:path,method,headers:{host:'localhost',authorization,'x-helmut-production-commit':'a'.repeat(40)}},{writeHead:(s)=>{status=s;},end:b=>resolve({status,payload:JSON.parse(b)})});});
(async()=>{A.equal((await request('POST','')).status,403);A.equal(calls,0);A.equal((await request('GET','Bearer offline-synthetisch')).status,400);A.equal(calls,0);A.equal((await request('POST','Bearer offline-synthetisch','/api/cron/b055-einzelabschluss?extra=1')).status,400);A.equal(calls,0);A.deepEqual(await request('POST','Bearer offline-synthetisch'),{status:200,payload:{ok:true,probe:true}});A.equal(calls,1);console.log('4/4 HTTP Route: Auth, Methode, Parameter, vor Accountvorlauf gebundener Controller');})().catch(e=>{console.error(e);process.exitCode=1;});
