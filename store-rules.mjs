// Shared economic rules. Both backends run these inside their own transaction.
import {randomUUID} from 'node:crypto';
import {drawCharacter,eloDelta,rank} from './rules.mjs';
export function newProfile(name='Atleta'){
 const mode=()=>({elo:1000,games:0,wins:0,bots:0,humanWins:0,humanAt:0,botDay:'',botNet:0});
 return {id:randomUUID(),name:name.slice(0,24),coins:0,fragments:0,inventory:['haru'],equipped:'haru',modes:{'1v1':mode(),'2v2':mode()},settings:{},tutorial:0,abandons:0,blockedUntil:0};
}
export function summonProfile(p,id,count){
 if(count!==1&&count!==10)throw new Error('Quantidade inválida');
 if(p.coins<count*100)throw new Error('Moedas insuficientes');p.coins-=count*100;const results=[];
 for(let i=0;i<count;i++){const c=drawCharacter(),duplicate=p.inventory.includes(c.id);if(duplicate)p.fragments+=c.fragments;else p.inventory.push(c.id);results.push({character:c.id,duplicate,fragments:duplicate?c.fragments:0});}
 return {operationId:id,results,coins:p.coins,fragments:p.fragments};
}
export function settleProfile(p,player,match,now=Date.now()){
 const m=p.modes[match.mode],before=m.elo,day=new Date(now).toISOString().slice(0,10),penalized=new Set(match.abandoned||[]);
 if(m.botDay!==day){m.botDay=day;m.botNet=0;}
 const win=player.side===match.winner&&!penalized.has(player.id),bots=match.players.some(x=>x.side!==player.side&&x.bot);let delta=0,coins=0;
 if(match.ranked){delta=eloDelta({rating:match.ratings[player.side],personalRating:before,opponent:match.ratings[1-player.side],win,games:m.games,bots,botNet:m.botNet,recentHumans:m.humanAt>now-30*864e5?m.humanWins:(!bots&&win?1:0)});
 if(bots&&delta>0)delta=Math.min(delta,Math.max(0,1699-before));
 m.elo=Math.max(0,before+delta);m.games++;if(win){m.wins++;p.coins+=100;coins=100;}if(bots){m.bots++;m.botNet+=delta;}else if(win){m.humanWins++;m.humanAt=now;}
 if(penalized.has(player.id)){if(now-(p.lastAbandon||0)>7*864e5)p.abandons=0;p.lastAbandon=now;p.abandons++;p.blockedUntil=now+[60000,300000,900000][Math.min(2,p.abandons-1)];}}
 return {before,after:m.elo,delta,coins,win,bots,rank:rank(m.elo),provisional:m.games<10,placementCompleted:Math.min(10,m.games),botLimit:bots&&m.botNet>=40};
}
export function leaderboardProfiles(profiles,mode){return profiles.filter(p=>p.modes[mode].games>=10).map(p=>{const m=p.modes[mode];return {id:p.id,name:p.name,...m,rank:rank(m.elo)};}).sort((a,b)=>b.elo-a.elo).map((p,i)=>({...p,position:i+1})).filter((p,i)=>(i>=100&&p.elo<1700)||p.humanAt>Date.now()-30*864e5).slice(0,200);}
export function validateOperation(id){if(typeof id!=='string'||!/^[-\w]{16,80}$/.test(id))throw new Error('Identificador de operação inválido');}
