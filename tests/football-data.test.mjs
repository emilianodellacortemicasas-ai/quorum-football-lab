import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseFd,matchFd,teamSim} from '../lib/football-data-contract.ts';
const csv='﻿Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,FTR,AvgH,AvgD,AvgA,Avg>2.5,Avg<2.5\nE0,16/08/2025,20:00,Man United,Nott\'m Forest,2,1,H,1.55,4.2,6.1,1.8,2.05\nE0,17/08/2025,14:00,Wolves,Ath Madrid,0,0,D,2.5,3.2,2.9,,\nE0,18/08/2025,14:00,Arsenal,Chelsea,,,,2.0,3.4,3.8,1.9,1.95\n';
test('football-data: parsing, nomi, abbinamento per data e risultato',()=>{
  const r=parseFd(csv,'Premier League');assert.equal(r.length,2);assert.equal(r[0].h,1.55);assert.equal(r[1].o25,null);
  assert.ok(teamSim('Man United','Manchester United')>=0.99);assert.ok(teamSim("Nott'm Forest",'Nottingham Forest')>=0.99);assert.ok(teamSim('Wolves','Wolverhampton Wanderers')>=0.99);
  const res=[{id:1,ts:Date.UTC(2025,7,16,19),comp:'Premier League',home:'Manchester United',away:'Nottingham Forest',hg:2,ag:1},{id:2,ts:Date.UTC(2025,7,16,19),comp:'Premier League',home:'Brentford',away:'Fulham',hg:2,ag:1}];
  const m=matchFd(res,r);assert.equal(m.get(1)?.h,1.55);assert.equal(m.has(2),false);
});
