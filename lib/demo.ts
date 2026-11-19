import type { Match, Portfolio } from './types';
// Perimetro attivo: 5 campionati (Sportmonks Starter). Coppe e nazionali escluse finché non vengono abbonate.
export const competitions = [
 {id:135,name:'Serie A',group:'Italia',flag:'IT'},{id:136,name:'Serie B',group:'Italia',flag:'IT'},
 {id:39,name:'Premier League',group:'Inghilterra',flag:'EN'},{id:140,name:'La Liga',group:'Spagna',flag:'ES'},
 {id:61,name:'Ligue 1',group:'Francia',flag:'FR'},
];
// Synthetic scenarios: not a real fixture list and not current predictions.
const base = {sampleHome:12,sampleAway:12,source:'demo' as const,counts:{corners:[5.6,4.3] as [number,number],yellow:[1.9,2.4] as [number,number],red:[.07,.11] as [number,number]},notes:['Parametri e quote inventati per provare il modello. Nessun calendario reale.','Medie e dispersioni di corner e cartellini sono ipotesi didattiche, non stime da dati.']};
export const demoMatches: Match[] = [
 {...base,id:'demo-1',home:'Inter',away:'Roma',homeCode:'INT',awayCode:'ROM',homeColor:'#1e5c9d',awayColor:'#9b3b2b',competition:'Serie A',group:'Italia',kickoff:'Scenario A',lambdaHome:1.78,lambdaAway:0.94,odds:{home:1.88,draw:3.65,away:4.6,over25:1.95,under25:1.86,btts:1.92,'exact:1-0':7.2,'exact:2-0':8.5,'exact:2-1':9.2}},
 {...base,id:'demo-2',home:'Arsenal',away:'Chelsea',homeCode:'ARS',awayCode:'CHE',homeColor:'#c44640',awayColor:'#3161a4',competition:'Premier League',group:'Inghilterra',kickoff:'Scenario B',lambdaHome:1.92,lambdaAway:1.18,odds:{home:1.95,draw:3.8,away:3.9,over25:1.78,under25:2.1,btts:1.7}},
 {...base,id:'demo-3',home:'Barcelona',away:'Villarreal',homeCode:'BAR',awayCode:'VIL',homeColor:'#9a2852',awayColor:'#af952e',competition:'La Liga',group:'Spagna',kickoff:'Scenario C',lambdaHome:2.14,lambdaAway:1.05,odds:{home:1.7,draw:4.25,away:4.8,over25:1.68,under25:2.2,btts:1.8}},
 {...base,id:'demo-4',home:'Paris SG',away:'Lyon',homeCode:'PSG',awayCode:'LYO',homeColor:'#224368',awayColor:'#a73a4a',competition:'Ligue 1',group:'Francia',kickoff:'Scenario D',lambdaHome:2.08,lambdaAway:0.86,odds:{home:1.55,draw:4.6,away:5.7,over25:1.86,under25:2.0,btts:2.05}},
 {...base,id:'demo-5',home:'Palermo',away:'Sampdoria',homeCode:'PAL',awayCode:'SAM',homeColor:'#d46aa0',awayColor:'#2f5aa8',competition:'Serie B',group:'Italia',kickoff:'Scenario E',lambdaHome:1.65,lambdaAway:1.48,odds:{home:2.3,draw:3.6,away:2.95,over25:1.75,under25:2.1,btts:1.62}},
 {...base,id:'demo-6',home:'Napoli',away:'Juventus',homeCode:'NAP',awayCode:'JUV',homeColor:'#2f8fd0',awayColor:'#c9c9c9',competition:'Serie A',group:'Italia',kickoff:'Scenario F',lambdaHome:1.18,lambdaAway:1.39,odds:{home:2.95,draw:3.25,away:2.5,over25:2.05,under25:1.8,btts:1.95}},
];
export const previewPortfolios: Portfolio[] = [
 {id:'preview-emiliano',name:'Emiliano',mode:'paper',initialCents:100000,stakeBps:50,exposureBps:300,dayBps:200,drawdownBps:1000,createdAt:'2026-11-18T00:00:00Z'},
 {id:'preview-fratello',name:'Mio fratello',mode:'paper',initialCents:100000,stakeBps:50,exposureBps:300,dayBps:200,drawdownBps:1000,createdAt:'2026-11-18T00:00:00Z'},
];
