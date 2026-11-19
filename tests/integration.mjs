// Only targets the loopback development server and an isolated synthetic identity.
import assert from 'node:assert/strict';
const base='http://127.0.0.1:4173';
const headers={'Content-Type':'application/json','Origin':base,'oai-authenticated-user-id':'quorum-local-qa-'+Date.now()};
const read=async()=>{const r=await fetch(base+'/api/workspace',{headers});assert.equal(r.status,200);return r.json();};
const post=async(body,expected=200)=>{const r=await fetch(base+'/api/workspace',{method:'POST',headers,body:JSON.stringify(body)});const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data;};
let ws=await post({action:'init'});assert.equal(ws.portfolios.length,2);const p=ws.portfolios[0];
await post({action:'add',portfolioId:p.id,fixtureId:'demo-1',market:'home',odds:2,stakeCents:501},422);
ws=await post({action:'add',portfolioId:p.id,fixtureId:'demo-1',market:'home',odds:2,stakeCents:500});assert.equal(ws.bets.length,1);assert.equal(ws.bets[0].status,'pending');
await post({action:'add',portfolioId:p.id,fixtureId:'demo-1',market:'away',odds:2,stakeCents:500},422);
ws=await post({action:'settle',portfolioId:p.id,id:ws.bets[0].id,status:'won'});assert.equal(ws.bets[0].pnlCents,500);
await post({action:'settle',portfolioId:p.id,id:ws.bets[0].id,status:'lost'},409);
ws=await post({action:'settings',portfolioId:p.id,stakeBps:50,exposureBps:300,dayBps:100,drawdownBps:1000});
const requests=[2,3,4,5].map(n=>fetch(base+'/api/workspace',{method:'POST',headers,body:JSON.stringify({action:'add',portfolioId:p.id,fixtureId:'demo-'+n,market:'home',odds:2,stakeCents:500})}).then(async r=>({status:r.status,data:await r.json()})));
const results=await Promise.all(requests);assert.ok(results.every(x=>[200,409,422].includes(x.status)),JSON.stringify(results));
ws=await read();const open=ws.bets.filter(x=>x.status==='pending').reduce((s,x)=>s+x.stakeCents,0);assert.ok(open<=1000,'concurrent writes bypassed daily budget');
const other=await fetch(base+'/api/workspace',{headers:{'oai-authenticated-user-id':'quorum-different-local-qa'}}).then(r=>r.json());assert.equal(other.bets.length,0);assert.equal(other.portfolios.length,0);
const unauth=await fetch(base+'/api/workspace',{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({action:'init'})});assert.equal(unauth.status,401);
console.log('PASS: scoped storage, stake limits, immutable settlement, concurrent reservations, account isolation and unauthenticated-write rejection.');
