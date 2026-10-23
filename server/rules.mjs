import '../public/v41-physics.js';
import '../public/volley-bots.js';
import { randomInt } from 'node:crypto';
export const CHARACTERS = [
 {id:'haru',name:'Haru',rarity:'Comum',weight:4490,fragments:1,stats:[5,5,5,5,5],color:'#80ceff',kit:'Equilibrado. Somente atributos.'},
 {id:'sora',name:'Sora',rarity:'Incomum',weight:3000,fragments:2,stats:[4,7,5,5,6],color:'#91e4bd',kit:'Mobilidade e recuperação. Somente atributos.'},
 {id:'ren',name:'Ren',rarity:'Raro',weight:1800,fragments:4,stats:[7,4,6,4,5],color:'#ffa08c',kit:'Spike e impulsão. Somente atributos.'},
 {id:'kaede',name:'Kaede',rarity:'Épico',weight:600,fragments:10,stats:[5,5,6,7,5],color:'#c6a4ff',kit:'Controle e levantamento. Somente atributos.'},
 {id:'jikyu',name:'Jikyū',rarity:'Lendário',weight:100,fragments:30,stats:[6,5,5,6,4],color:'#ffe2a0',kit:'C: Convergência. 25 energia / 18 s. Um contato.'},
 {id:'tamakaze',name:'Tamakaze',rarity:'???',weight:10,fragments:100,stats:[5,5,5,6,5],color:'#efb3ff',kit:'Q/R: curva no contato. Forte: 14 energia. Técnica com retorno: 32.'}
];
export const character=id=>CHARACTERS.find(c=>c.id===id)||CHARACTERS[0];
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const mix=(a,b,t)=>a+(b-a)*t;
export const rank=elo=>elo<900?'Bronze':elo<1100?'Prata':elo<1300?'Ouro':elo<1500?'Platina':elo<1700?'Diamante':elo<1900?'Mestre':'Lenda';
export const teamRating=rs=>!rs.length?1000:rs.reduce((a,b)=>a+b,0)/rs.length+(rs.length===2?.25*Math.abs(rs[0]-rs[1]):0);
export const expected=(a,b)=>1/(1+10**((b-a)/400));
export function eloDelta({rating,opponent,win,games,bots,botNet=0,recentHumans=0,personalRating=rating}){
 const k=bots?12:games<10?40:24;
 let delta=Math.round(k*((win?1:0)-expected(rating,opponent)));
 if(bots&&delta>0) delta=Math.min(delta,Math.max(0,40-botNet),Math.max(0,1699-personalRating));
 // Promoções para Mestre/Lenda pedem resultados humanos recentes.
 if(delta>0&&!recentHumans&&personalRating+delta>=1700) delta=Math.max(0,1699-personalRating);
 return delta;
}
export function drawCharacter(n=randomInt(10000)){
 if(!Number.isInteger(n)||n<0||n>=10000) throw new Error('Sorteio inválido');
 for(const c of CHARACTERS){if(n<c.weight)return c;n-=c.weight;}
}
export const queueWindow=seconds=>seconds<7?100:seconds<14?175:250;
// Fixed presets selected by rank, not interpolated from each Elo point.
export const BOT_PRESETS=Object.freeze([
 Object.freeze({...globalThis.ApexVolleyBots.presets.easy,id:'easy',name:'Iniciante',character:'haru',sampleElo:600,tacticalElo:600}),
 Object.freeze({...globalThis.ApexVolleyBots.presets.normal,id:'normal',name:'Técnica',character:'haru',sampleElo:1100,tacticalElo:1100}),
 Object.freeze({...globalThis.ApexVolleyBots.presets.hard,id:'hard',name:'Elite',character:'jikyu',sampleElo:1400,tacticalElo:1400}),
 Object.freeze({...globalThis.ApexVolleyBots.presets.pro,id:'pro',name:'Pro Player',character:'jikyu',sampleElo:1600,tacticalElo:1600}),
 Object.freeze({...globalThis.ApexVolleyBots.presets.trick,id:'trick',name:'Trickshot · Tamakaze',character:'tamakaze',sampleElo:1800,tacticalElo:1800}),
 Object.freeze({...globalThis.ApexVolleyBots.presets.protrick,id:'protrick',name:'Pro Trickshot · Tamakaze',character:'tamakaze',sampleElo:2100,tacticalElo:2100})
]);
export const BOT_BANDS=Object.freeze([
 Object.freeze({ranks:'Bronze / Prata',min:0,max:1099,preset:'easy'}),
 Object.freeze({ranks:'Ouro',min:1100,max:1299,preset:'normal'}),
 Object.freeze({ranks:'Platina',min:1300,max:1499,preset:'hard'}),
 Object.freeze({ranks:'Diamante',min:1500,max:1699,preset:'pro'}),
 Object.freeze({ranks:'Mestre',min:1700,max:1899,preset:'trick'}),
 Object.freeze({ranks:'Lenda ou acima',min:1900,max:null,preset:'protrick'})
]);
export const PLACEMENT_BOTS=Object.freeze(['easy','easy','easy','normal','normal','hard','pro','trick','protrick','protrick']);
export function placementProfile(games){return Number.isInteger(games)&&games>=0&&games<PLACEMENT_BOTS.length?BOT_PRESETS.find(p=>p.id===PLACEMENT_BOTS[games]):null;}
export function botProfile(elo){
 const value=Number.isFinite(elo)?Math.max(0,elo):1000;
 const band=BOT_BANDS.find(b=>value>=b.min&&(b.max===null||value<b.max+1))||BOT_BANDS[0];
 return BOT_PRESETS.find(p=>p.id===band.preset);
}
export function curveTier({characterId,airborne,charge,spinAge,gesture,monotonic,contactDistance,energy,aboveNet}){
 if(characterId!=='tamakaze') return 0;
 if(airborne&&aboveNet&&charge>=.52&&charge<=.72&&spinAge<=.18&&gesture>=Math.PI/4&&gesture<=Math.PI/2&&monotonic&&contactDistance<=32&&energy>=32)return 3;
 if(airborne&&charge>=.32&&charge<=.9&&spinAge<=.22&&gesture>=.2&&monotonic&&contactDistance<=42&&energy>=14)return 2;
 return 1;
}
