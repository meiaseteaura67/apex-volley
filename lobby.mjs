import { randomUUID,randomBytes } from 'node:crypto';
import { Match } from './simulation.mjs';
import { queueWindow,teamRating,botProfile,placementProfile } from './rules.mjs';
export class Lobby {
 constructor(store){this.store=store;this.queues=[];this.parties=new Map();this.partyRevision=0;this.partyInstance=randomUUID();this.matches=new Map();this.active=new Map();this.streams=new Map();this.latency=new Map();this.settling=new Set();this.acc=0;this.last=performance.now();this.lastPublish=0;}
 send(id,type,data){const stream=this.streams.get(id);if(stream&&!stream.res.destroyed&&!stream.res.writableEnded){if(stream.res.writableLength>256000){stream.res.destroy();return;}stream.res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);}}
 connected(id){const res=this.streams.get(id)?.res;return !!res&&!res.destroyed&&!res.writableEnded;}
 queueSnapshot(id){const q=this.queues.find(q=>q.ids.includes(id));return q?{active:true,at:q.at,mode:q.mode,region:q.region,placement:q.placementGames===null?null:{game:q.placementGames+1,total:10,bot:placementProfile(q.placementGames).name}}:{active:false};}
 partyFor(id){return [...this.parties.values()].find(p=>p.members.some(m=>m.id===id));}
 partyView(p){return p?{code:p.code,leader:p.leader,members:p.members.map(m=>{const a=this.store.get(m.id);return {id:m.id,name:a?.name||'Atleta',character:a?.equipped,elo:a?.modes['2v2'].elo,ready:m.ready,connected:this.connected(m.id)};})}:null;}
 partySnapshot(id){return {party:this.partyView(this.partyFor(id)),revision:this.partyRevision,instance:this.partyInstance};}
 notifyParty(p,also=[]){this.partyRevision++;for(const id of new Set([...(p?.members.map(m=>m.id)||[]),...also]))this.send(id,'party',this.partySnapshot(id));}
 party(id,action,code,ready){
  if(this.active.has(id)||this.queues.some(q=>q.ids.includes(id)))throw new Error('Saia da fila ou partida primeiro');
  let p=this.partyFor(id);
  if(action==='create'){
   if(p)throw new Error('Você já está em uma party');if(this.parties.size>=500)throw new Error('Limite de parties');
   let c;do{c=randomBytes(4).toString('hex').toUpperCase();}while(this.parties.has(c));
   p={code:c,leader:id,members:[{id,ready:false}],created:Date.now()};this.parties.set(c,p);
  }else if(action==='join'){
   if(p)throw new Error('Você já está em uma party');const normalized=String(code??'').trim().toUpperCase();
   if(!/^[0-9A-F]{8}$/.test(normalized))throw new Error('Use o código de 8 caracteres da party');
   p=this.parties.get(normalized);if(!p||p.members.length!==1||Date.now()-p.created>15*60e3)throw new Error('Convite inválido ou expirado');
   if(p.members.some(m=>this.active.has(m.id)||this.queues.some(q=>q.ids.includes(m.id))))throw new Error('Party ocupada');
   p.members.forEach(m=>m.ready=false);p.members.push({id,ready:false});
  }else if(action==='ready'){
   if(!p)throw new Error('Crie ou entre em uma party');if(ready!==undefined&&typeof ready!=='boolean')throw new Error('Prontidão inválida');
   const m=p.members.find(m=>m.id===id);m.ready=ready===undefined?!m.ready:ready;
  }else if(action==='leave'){
   if(p){p.members=p.members.filter(m=>m.id!==id);if(!p.members.length)this.parties.delete(p.code);else{p.leader=p.members[0].id;p.created=Date.now();p.members.forEach(m=>m.ready=false);}}
  }else throw new Error('Ação inválida');
  this.notifyParty(p,action==='leave'?[id]:[]);return this.partyView(this.partyFor(id));
 }

 cancel(id){const q=this.queues.find(q=>q.ids.includes(id));if(q){if(q.ids.length===2&&q.ids[0]!==id)throw new Error('Somente o líder cancela a fila');this.removeQueue(q,'Fila cancelada');}}
 removeQueue(q,reason){this.queues=this.queues.filter(x=>x!==q);q.ids.forEach(id=>this.send(id,'queue',{active:false,reason}));}
 enqueue(id,mode,region){if(!['1v1','2v2'].includes(mode))throw new Error('Modo inválido');if(region!=='local')throw new Error('Região não disponível neste servidor');if(this.matches.size>=100)throw new Error('Servidor cheio');
 const p=this.partyFor(id);let ids=[id];if(p){if(mode!=='2v2'||p.leader!==id||p.members.length!==2||p.members.some(m=>!m.ready))throw new Error('Party precisa de dois membros prontos e líder');ids=[id,...p.members.filter(m=>m.id!==id).map(m=>m.id)];}
 for(const uid of ids){if(!this.connected(uid))throw new Error('Membro desconectado');if(this.store.isBusy?.(uid)||this.settling.has(uid)||this.active.has(uid)||this.queues.some(q=>q.ids.includes(uid)))throw new Error('Jogador já está ocupado');const a=this.store.get(uid);if(a.blockedUntil>Date.now())throw new Error('Bloqueio temporário por abandono');const l=this.latency.get(uid);if(!l||Date.now()-l.at>10000||l.ms>220)throw new Error('Aguarde medir a conexão; latência máxima: 220 ms');}
 const ratings=ids.map(uid=>this.store.get(uid).modes[mode].elo);if(ids.length===2&&Math.abs(ratings[0]-ratings[1])>400)throw new Error('Party excede 400 pontos de diferença');
 const placement=ids.map(uid=>this.store.get(uid).modes[mode].games).filter(n=>n<10);
 const q={placementGames:placement.length?Math.min(...placement):null,id:randomUUID(),ids,mode,region,rating:teamRating(ratings),at:Date.now()};this.queues.push(q);ids.forEach(uid=>this.send(uid,'queue',{active:true,at:q.at,mode,region,placement:q.placementGames===null?null:{game:q.placementGames+1,total:10,bot:placementProfile(q.placementGames).name}}));return {at:q.at};
 }
 makePlayer(id,side,mode,trainingCharacter){const p=this.store.get(id);return {id,name:p.name,side,appearance:p.appearance,character:trainingCharacter||p.equipped,elo:p.modes[mode].elo};}
 bot(side,elo,index=0,preset=botProfile(elo)){return {id:`bot-${randomUUID()}`,name:preset.name,side,character:preset.character,elo,bot:true,difficulty:preset.id,aiRating:preset.tacticalElo};}
 start(teams,mode,{ranked=true,training=false,character:char,botElo=1000,free=false,botPreset=null,placementGames=null}={}){
 const players=[];for(let side=0;side<2;side++){const ids=teams[side]||[];const rating=ids.length?teamRating(ids.map(id=>this.store.get(id).modes[mode].elo)):botElo;
 ids.forEach(id=>players.push(this.makePlayer(id,side,mode,char)));
 if(!free)while(players.filter(p=>p.side===side).length<(mode==='2v2'?2:1))players.push(this.bot(side,rating,players.length,botPreset||botProfile(rating)));}
 const humans=players.filter(p=>!p.bot);if(humans.some(p=>this.active.has(p.id)))throw new Error('Reserva já existe');
 const m=new Match({mode,players,ranked,training,onFinish:match=>{try{const pending=this.persistResult(match);pending?.catch?.(()=>{});}catch{}}});

 m.placements=ranked?Object.fromEntries(humans.flatMap(p=>{const games=this.store.get(p.id).modes[mode].games;return games<10?[[p.id,{game:games+1,total:10}]]:[];})):{};m.placement=placementGames===null?null:{game:placementGames+1,total:10,bot:botPreset.id};m.free=free;this.matches.set(m.id,m);for(const p of humans){this.active.set(p.id,m.id);this.send(p.id,'match',m.snapshot());}return m;
 }
 training(id,{character:char,elo,kind}){if(this.store.isBusy?.(id)||this.settling.has(id)||this.active.has(id)||this.queues.some(q=>q.ids.includes(id)))throw new Error('Saia da partida ou fila');if(this.matches.size>=100)throw new Error('Servidor cheio');const p=this.partyFor(id);if(p)throw new Error('Saia da party para treinar');const m=this.start([[id],[]],'1v1',{ranked:false,training:kind==='free'||kind==='tutorial',character:char,botElo:elo,free:kind==='free'||kind==='tutorial'});return {match:m.id};}
 persistResult(m){
 if(m.settlementPending)return m.settlement;
 const ids=m.players.filter(p=>!p.bot).map(p=>p.id);ids.forEach(id=>this.settling.add(id));m.settlementPending=true;
 const done=results=>{m.retryAttempts=0;m.retryAt=0;m.results=results;m.settlementPending=false;ids.forEach(id=>{this.settling.delete(id);this.send(id,'profile',this.store.get(id));});return results;};
 const failed=()=>{m.retryAt=Date.now()+Math.min(60000,1000*2**Math.min(6,m.retryAttempts=(m.retryAttempts||0)+1));m.settlementPending=false;m.results={error:'Resultado ainda não salvo. O banco está indisponível; tente Voltar ao lobby novamente para salvar.'};console.error('Resultado pendente',m.id);throw Object.assign(new Error(m.results.error),{status:503});};
 try{const result=this.store.settle(m.record());if(result?.then){m.settlement=Promise.resolve(result).then(done).catch(failed);return m.settlement;}return done(result);}catch(e){if(m.settlementPending)return failed();throw e;}
 }
 leave(id,expectedId){const current=this.active.get(id),mid=expectedId||current,m=this.matches.get(mid);
 // Idempotent acknowledgment also covers expired games and missed SSE messages.
 if(!m||current!==mid){if(current===mid)this.active.delete(id);const result={left:true,matchId:mid||null};this.send(id,'left',result);return result;}
 if(m.phase!=='ended'){if(m.ranked&&!m.started){m.ranked=false;m.end(1,'Cancelada antes do primeiro saque');}else if(m.ranked){m.abandoned.add(id);m.end(1-m.players.find(p=>p.id===id).side,'Abandono');}else{m.ranked=false;m.end(1,'Treino encerrado');}}
 if(m.results?.error){const retry=this.persistResult(m);if(retry?.then)return retry.then(()=>this.release(id,mid,m));}
 if(m.settlementPending)return m.settlement.then(()=>this.release(id,mid,m));
 return this.release(id,mid,m);
 }
 release(id,mid,m){if(this.active.get(id)===mid)this.active.delete(id);const result={left:true,matchId:mid};this.send(id,'left',result);
 if(m.players.filter(p=>!p.bot).every(p=>this.active.get(p.id)!==mid))this.matches.delete(mid);return result;}

 cleanup(now=Date.now()){for(const [mid,m]of this.matches){if(m.phase!=='ended'||m.settlementPending||m.results?.error)continue;m.timeEnd??=now;if(now-m.timeEnd<=120000)continue;
 for(const p of m.players.filter(p=>!p.bot))if(this.active.get(p.id)===mid){this.active.delete(p.id);this.send(p.id,'left',{left:true,matchId:mid,reason:'Resultado salvo no histórico'});}
 this.matches.delete(mid);
 }}

 // Candidate teams keep a party as one indivisible unit. Build once per tick;
 // sorted ratings let each anchor try alternate partners without listing quartets.
 humanTeams(now){const units=this.queues.filter(q=>q.mode==='2v2'),teams=[],ratings=new Map(units.flatMap(q=>q.ids).map(id=>[id,this.store.get(id).modes['2v2'].elo]));
 const make=qs=>{const ids=qs.flatMap(q=>q.ids);teams.push({units:qs,ids,rating:teamRating(ids.map(id=>ratings.get(id))),window:Math.min(...qs.map(q=>queueWindow((now-q.at)/1000)))});};
 for(const q of units)if(q.ids.length===2)make([q]);
 const solos=units.filter(q=>q.ids.length===1);for(let i=0;i<solos.length;i++)for(let j=i+1;j<solos.length;j++)if(solos[i].region===solos[j].region)make([solos[i],solos[j]]);
 teams.sort((a,b)=>a.rating-b.rating);const byUnit=new Map(units.map(q=>[q,[]]));for(const t of teams)for(const q of t.units)byUnit.get(q).push(t);return {sorted:teams,byUnit};
 }
 humanDuo(q,pool,available,now){
 const teams=pool.sorted,window=queueWindow((now-q.at)/1000),eligible=new Set([...available].filter(x=>x.mode===q.mode&&x.region===q.region&&Math.abs(x.rating-q.rating)<=Math.min(window,queueWindow((now-x.at)/1000))));
 const valid=t=>t.units.every(x=>available.has(x)&&eligible.has(x));
 for(const own of pool.byUnit.get(q)||[]){if(!valid(own))continue;
 let low=0,high=teams.length;while(low<high){const mid=(low+high)>>>1;if(teams[mid].rating<own.rating)low=mid+1;else high=mid;}
 let left=low-1,right=low;
 while(left>=0||right<teams.length){const dl=left>=0?Math.abs(teams[left].rating-own.rating):Infinity,dr=right<teams.length?Math.abs(teams[right].rating-own.rating):Infinity;if(Math.min(dl,dr)>own.window)break;
 const opponent=dl<=dr?teams[left--]:teams[right++];if(!valid(opponent)||opponent.units.some(x=>own.units.includes(x)))continue;
 if(Math.abs(own.rating-opponent.rating)<=Math.min(own.window,opponent.window))return {group:[...own.units,...opponent.units],teams:[own.ids,opponent.ids]};
 }
 }return null;
 }
 tick(now=Date.now()){
 // Validate every unit before choosing opponents, including streams awaiting close cleanup.
 for(const q of [...this.queues]){
 if(q.ids.some(id=>!this.connected(id)))this.removeQueue(q,'Jogador desconectado');
 else if(q.ids.some(id=>{const r=this.latency.get(id);return !r||now-r.at>10000||r.ms>220;}))this.removeQueue(q,'Conexão instável ou latência acima de 220 ms');
 }
 const available=new Set(this.queues);let duoTeams;
 for(const q of [...this.queues]){
 if(!available.has(q))continue;

 const wait=(now-q.at)/1000,window=queueWindow(wait);let reservation;
 if(q.mode==='1v1'){const opponent=[...available].find(x=>x!==q&&x.mode===q.mode&&x.region===q.region&&Math.abs(x.rating-q.rating)<=Math.min(window,queueWindow((now-x.at)/1000)));if(opponent)reservation={group:[q,opponent],teams:[q.ids,opponent.ids]};}
 else{duoTeams??=this.humanTeams(now);reservation=this.humanDuo(q,duoTeams,available,now);}
 if(reservation){reservation.group.forEach(x=>{available.delete(x);this.removeQueue(x,'Partida reservada');});this.start(reservation.teams,q.mode);continue;}
 if(wait>=20){available.delete(q);this.removeQueue(q,'Reserva com IA após busca humana');const preset=q.placementGames===null?null:placementProfile(q.placementGames);const m=this.start([q.ids,[]],q.mode,{botElo:q.rating,botPreset:preset,placementGames:q.placementGames});if(q.mode==='2v2'&&q.ids.length===1)m.players.find(p=>p.bot&&p.side===0).name='Companheiro IA';}
 }
 for(const [code,p] of this.parties)if(now-p.created>15*60e3&&p.members.length<2&&!this.queues.some(q=>q.ids.includes(p.leader))){this.parties.delete(code);this.notifyParty(null,p.members.map(m=>m.id));}
 }
 loop(){const t=performance.now(),elapsed=Math.min(.1,(t-this.last)/1000);this.last=t;this.acc+=elapsed;while(this.acc>=1/120){for(const m of this.matches.values())m.step();this.acc-=1/120;}if(t-this.lastPublish>=40){this.lastPublish=t;for(const m of this.matches.values()){if(m.phase==='ended'&&m.results?.error&&!m.settlementPending&&Date.now()>=(m.retryAt||0)){try{this.persistResult(m)?.catch?.(()=>{});}catch{}}for(const p of m.players.filter(p=>!p.bot))if(this.active.get(p.id)===m.id)this.send(p.id,'snapshot',m.snapshot());}this.cleanup();}}
}
