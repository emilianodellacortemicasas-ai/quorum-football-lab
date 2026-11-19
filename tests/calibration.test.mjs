import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildTable,calibrate,ticketReliability,familyOf} from '../lib/calibration.ts';
test('calibrazione: corregge verso la frequenza osservata, monotona, prudente con pochi dati',()=>{
  const s=[];for(let i=0;i<2000;i++){const p=0.3+0.6*(i/2000);s.push({f:'gol',p,hit:(i*7919%1000)/1000<p-0.05});}
  const t=buildTable(s);const a=calibrate(0.6,'gol',t),b=calibrate(0.7,'gol',t);
  assert.ok(a.p<0.6&&a.p>0.5);assert.ok(b.p>a.p);
  assert.equal(calibrate(0.6,'1x2',t).p,0.6);
  assert.equal(familyOf('home'),'1x2');assert.equal(familyOf('under25'),'gol');assert.equal(familyOf('btts'),'gg');assert.equal(familyOf('corners:total:over:9.5'),null);
  const r=ticketReliability([{p:0.7,se:0.02},{p:0.6,se:0.03}]);assert.ok(Math.abs(r.p-0.42)<1e-9&&r.low<0.42&&r.high>0.42);
});
