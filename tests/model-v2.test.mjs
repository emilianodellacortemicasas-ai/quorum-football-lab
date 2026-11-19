import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fitLeague,lambdas,table,form} from '../lib/model-v2.ts';
import {analyze} from '../lib/math.ts';

let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
const pois=l=>{let k=0,p=Math.exp(-l),s=p;const u=rnd();while(u>s&&k<15){k++;p*=l/k;s+=p;}return k;};
function league(){
  const att=[0.5,0.3,0.1,0,0,-0.1,-0.2,-0.3,-0.4,0.1],def=[-0.4,-0.3,0,0.1,0,0.1,0.2,0.2,0.3,-0.2],res=[];let id=1;const now=Date.UTC(2026,10,19);
  for(let round=0;round<4;round++)for(let i=0;i<10;i++)for(let j=0;j<10;j++){if(i===j)continue;
    const lh=Math.exp(0.15+0.3+att[i]+def[j]),la=Math.exp(0.15+att[j]+def[i]);
    res.push({id:id++,ts:now-(400-round*90-((i*10+j)%80))*86400000,comp:'X',season:1,homeId:i+1,awayId:j+1,home:'T'+(i+1),away:'T'+(j+1),hg:pois(lh),ag:pois(la)});}
  return {res,now};
}
test('fit recovers team strength and home advantage',()=>{
  const {res,now}=league(),m=fitLeague(res,now);
  assert.ok(m);assert.ok(m.homeAdv>0.15&&m.homeAdv<0.45,'home '+m.homeAdv);
  assert.ok(m.teams[1].att>m.teams[9].att);assert.ok(m.teams[1].def<m.teams[9].def);
  const l=lambdas(m,1,9),r=lambdas(m,9,1);assert.ok(l.lh>r.lh);
});
test('Dixon–Coles keeps probabilities normalised and shifts draws',()=>{
  const a=analyze(1.2,1.0,0),b=analyze(1.2,1.0,-0.1);
  for(const x of [a,b])assert.ok(Math.abs(x.markets.home+x.markets.draw+x.markets.away-1)<1e-9);
  assert.ok(b.markets['exact:0-0']>a.markets['exact:0-0']);
});
test('table and form',()=>{
  const r=[{id:1,ts:1,comp:'X',season:1,homeId:1,awayId:2,home:'A',away:'B',hg:2,ag:0},{id:2,ts:2,comp:'X',season:1,homeId:2,awayId:1,home:'B',away:'A',hg:1,ag:1}];
  const t=table(r,1);assert.equal(t[0].name,'A');assert.equal(t[0].points,4);assert.equal(form(r,1),'NV');
});
import {attackAdjustment} from '../lib/extras.ts';
test('assenze e formazioni riducono i gol attesi, con tetto -25%',()=>{
  const sc=[{id:1,name:'Bomber',share:0.4},{id:2,name:'Ala',share:0.2},{id:3,name:'Mezzala',share:0.1}];
  assert.ok(Math.abs(attackAdjustment(sc,new Set([1]),null).factor-0.8)<1e-9);
  const xi=new Set([3,4,5,6,7,8,9,10,11,12,13]);
  const r=attackAdjustment(sc,new Set([1]),xi);assert.equal(r.factor,0.75);assert.deepEqual(r.bench,['Ala']);
  assert.equal(attackAdjustment(sc,new Set(),null).factor,1);
});
