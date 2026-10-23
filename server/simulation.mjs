import '../public/v41-physics.js';
import '../public/volley-tactics.js';
import {randomUUID,randomInt} from 'node:crypto';
import {character,clamp,botProfile,BOT_PRESETS,teamRating} from './rules.mjs';
const C=globalThis.ApexV41Physics.constants;
export const WORLD={w:C.W,h:C.H,floor:C.F,net:C.N,netTop:C.NT,left:32,right:C.W-32,margin:128,radius:C.BR,gravity:C.G,step:C.STEP};
const {W,H,F,N,NT,BR,G,STEP}=C;
export const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export function flight(b,dt){globalKernel.aerialStep(b,dt);const speed=Math.hypot(b.vx,b.vy);if(speed>1550){b.vx*=1550/speed;b.vy*=1550/speed;}}
const globalKernel=globalThis.ApexV41Physics.create();
const blank=()=>({left:false,right:false,jump:false,attack:false,receive:false,set:false,dash:false,dive:false,block:false,spinL:false,spinR:false,ability:false,cancel:false,aim:0,aimUsed:false,aimX:0,aimY:0,locked:false,direction:'look'});
export class Match{
 constructor({id=randomUUID(),mode='1v1',players,ranked=false,training=false,onFinish=()=>{}}){
 this.id=id;this.mode=mode;this.ranked=ranked;this.training=training;this.onFinish=onFinish;this.kernel=globalThis.ApexV41Physics.create();this.tactics=globalThis.ApexVolleyTactics.create();this.time=0;this.score=[0,0];this.touches=[0,0];this.lastSide=-1;this.lastPlayer=null;this.lastContactTick=-1;this.serveSide=0;this.phase='serve';this.phaseTime=0;this.winner=null;this.results=null;this.events=[];this.eventSeq=0;this.replay=[];this.seed=randomInt(1,0x7fffffff);this.initialSeed=this.seed;this.convergenceUsed=[false,false];this.abandoned=new Set();this.pings=[];
 this.players=players.map(p=>({...this.kernel.makePlayer(p.side),...p,input:{...blank(),aim:p.side===0?-.3:-Math.PI+.3},previous:blank(),pendingInput:[],charge:0,charging:false,spinAge:99,spinDir:0,aimSamples:[],seq:-1,processedSeq:-1,lastInput:0,cooldown:0,botNext:0,profile:BOT_PRESETS.find(b=>b.id===p.difficulty)||botProfile(p.elo??1000),disconnectedAt:null,notice:'',noticeUntil:0,lastHit:-1}));
 this.ratings=[0,1].map(side=>teamRating(this.players.filter(p=>p.side===side).map(p=>p.elo||1000)));this.setupServe();
 }
 random(){this.seed^=this.seed<<13;this.seed^=this.seed>>>17;this.seed^=this.seed<<5;return(this.seed>>>0)/4294967296;}
 event(kind,p,extra={}){this.events.push({id:++this.eventSeq,type:'action',kind,player:p?.id,side:p?.side,t:this.time,x:p?.x,y:p?p.y-80:0,...extra});}
 notice(p,text){p.notice=text;p.noticeUntil=this.time+2;}
 setupServe(){this.phase='serve';this.phaseTime=0;this.lastSide=-1;this.touches=[0,0];this.convergenceUsed=[false,false];this.attraction=null;
 for(const side of[0,1])this.players.filter(p=>p.side===side).forEach((p,i)=>{const cooldown=p.cooldown;Object.assign(p,this.kernel.makePlayer(side));p.x=side?1284-i*180:252+i*180;p.cooldown=cooldown;p.charging=false;p.charge=0;p.buffer=null;});
 this.server=this.players.find(p=>p.side===this.serveSide)||this.players[0];this.ball={x:this.server.x,y:F-110,vx:0,vy:0,spin:0,angle:0,last:this.server.side,side:this.server.side,touches:this.touches,blockCD:0,age:0,tier:0,curveTier:'none'};this.lastPlayer=this.server.id;
 }
 input(id,data,now=Date.now()){
 const p=this.players.find(p=>p.id===id&&!p.bot);if(!p||this.phase==='ended')return false;
 if(!data||!Number.isInteger(data.seq)||data.seq<=p.seq||data.seq>p.seq+10000||!Number.isFinite(data.aim)||Math.abs(data.aim)>Math.PI+.001||!Number.isFinite(data.time)||Math.abs(data.time-now)>3000||p.pendingInput.length>=16)return false;
 const i=blank();for(const k of Object.keys(i))if(typeof i[k]==='boolean')i[k]=data[k]===true;i.aim=data.aim;i.direction=data.direction==='movement'?'movement':'look';
 if(data.aimUsed){if(!Number.isFinite(data.aimX)||!Number.isFinite(data.aimY)||data.aimX< -256||data.aimX>W+256||data.aimY< -1200||data.aimY>F+300)return false;i.aimX=data.aimX;i.aimY=data.aimY;}
 i.seq=data.seq;p.seq=data.seq;p.pendingInput.push(i);p.lastInput=this.time;
 if(this.replay.length>=72000){this.replay.splice(0,6000);this.replayPartial=true;}this.replay.push({t:Math.round(this.time*120),id,seq:data.seq,input:i});return true;
 }
 toss(p){if(this.phase!=='serve'||this.server.id!==p.id)return false;this.started=true;this.phase='rally';this.phaseTime=0;this.ball={x:p.x,y:F-112,vx:p.side?-18:32,vy:-610,spin:0,angle:0,last:p.side,side:p.side,touches:this.touches,blockCD:0,age:0,tier:0,curveTier:'none'};this.lastPlayer=p.id;this.event('toss',p);return true;}
 register(p,block=false){const tick=Math.floor(this.time*120+.001);if(this.lastContactTick===tick)return false;this.lastContactTick=tick;
 if(this.lastSide!==p.side){this.touches=[0,0];this.lastSide=p.side;}
 if(!block&&++this.touches[p.side]>3){this.point(1-p.side,'QUATRO TOQUES');return false;}
 this.ball.reversalTrack=null;this.ball.returnFlight=null;this.ball.reversal=false;this.lastPlayer=p.id;this.ball.last=p.side;this.ball.touches=this.touches;this.ball.age=0;p.lastHit=this.time;this.attraction=null;return true;
 }
 context(p,input=p.input){const i=input;this.kernel.context(this.ball,{x:i.aimUsed?i.aimX:this.ball.x+Math.cos(i.aim)*500,y:i.aimUsed?i.aimY:this.ball.y+Math.sin(i.aim)*500,used:i.aimUsed},{locked:i.locked,dx:Math.cos(i.aim)*230,dy:Math.sin(i.aim)*230});}
 hand(p,kind='attack'){return this.kernel.hand(p,kind);}
 intent(p,power,dist){return globalThis.ApexVolleyTactics.execution(p,power,dist,this.ball,this.time);}

 attack(p){const b=this.ball,h=this.hand(p),dist=Math.hypot(b.x-h.x,b.y-h.y),reach=102+(character(p.character).stats[3]-5)*1.5;
 if(this.phase!=='rally'||p.hitCD>0||dist>reach||b.y>p.y-35||(b.x<N?0:1)!==p.side)return false;
 if(!this.register(p))return false;
 const execution=p.buffer?.kind==='attack'&&p.buffer.samples?{...p,spinDir:p.buffer.spinDir,spinAge:p.buffer.spinAge,aimSamples:p.buffer.samples,intentAt:p.buffer.at}:p,power=p.buffer?.kind==='attack'?p.buffer.power:p.charge,intent=this.intent(execution,power,dist),release=p.buffer?.kind==='attack'?p.buffer.release:null,releaseAim=p.buffer?.aim??p.input.aim,angle=intent.tier===3?globalThis.ApexVolleyTactics.returnAim(releaseAim,p.side):releaseAim;
 this.context(p,release||p.input);if(intent.tier===3)this.kernel.context(b,{used:false},{locked:false});
 const s=this.kernel.shot(p,intent.power??power,{x:b.x+Math.cos(angle)*500,y:b.y+Math.sin(angle)*500},intent.spin,false);
 const factor=intent.factor*(dist<49?1.025:1)*(1+(character(p.character).stats[0]-5)*.025);b.vx=s.vx*factor;b.vy=s.vy*factor;b.spin=s.spin;b.returnFlight=intent.returnFlight;b.tier=intent.tier;const proof=intent.tier===3?globalThis.ApexVolleyTactics.reversal(b):null;b.reversal=false;b.reversalTrack=globalThis.ApexVolleyTactics.beginReversal(b,proof);b.curveTier=intent.tier>=2?'technical':intent.tier?'base':'none';p.energy-=intent.cost;p.hitCD=.27;p.lastKind='attack';p.touchAnim=.2;
 const style=globalThis.ApexVolleyTactics.describeShot(b,p,{proof}),varied=p.bot&&p.profile?.id==='protrick';this.notice(p,varied?globalThis.ApexVolleyTactics.labels[style]:intent.tier>=2?'CURVA FORTE':'ATAQUE');this.event('attack',p,{type:'hit',tier:intent.tier,style,reversal:b.reversal,perfect:dist<49,power,x:b.x,y:b.y});return true;
 }
 contact(p,type,hit=null){const b=this.ball,kind=type==='dive'?'receive':type,h=this.hand(p,kind),dist=Math.hypot(b.x-h.x,b.y-h.y);if(this.phase!=='rally'||p.hitCD>0||(b.x<N?0:1)!==p.side)return false;
 if(kind==='block'){
 if(!p.block||b.blockCD>0||b.vx*(p.side===0?-1:1)<=0||Math.abs(b.x-h.x)>=43||Math.abs(b.y-h.y)>=39)return false;
 if(!this.register(p,true))return false;b.vx=(p.side===0?1:-1)*Math.max(400,Math.abs(b.vx)*.83);b.vy=230;b.spin=0;b.blockCD=.32;p.lastKind='block';this.event('block',p,{type:'contact',x:b.x,y:b.y,perfect:true});return true;
 }
 const reach=kind==='receive'?(p.dive>0?132:112):108;
 if(!hit?.dive&&dist>reach+(character(p.character).stats[3]-5)*1.5)return false;
 if(!this.register(p))return false;
 const perfect=!hit?.dive&&dist<49,dir=p.side===0?1:-1,move=Number(p.input.right)-Number(p.input.left);
 if(kind==='receive'){b.vx=hit?.dive?dir*95+move*110+p.vx*.12:dir*115+move*200+p.vx*.14;b.vy=-(hit?.dive?735:perfect?660:605);b.spin*=.1;if(hit?.dive)p.diveSaved=true;}
 else{b.vx=move*175+p.vx*.1;b.vy=-(perfect?735:685);b.spin=0;}
 if(p.input.direction==='look'&&!hit?.dive){this.context(p);const v=this.kernel.touchLook(p,kind);b.vx=v.vx;b.vy=v.vy;}
 b.tier=0;b.curveTier='none';p.hitCD=.32;p.lastKind=kind;p.touchAnim=.2;this.notice(p,kind==='set'?'LEVANTAMENTO':'RECEPÇÃO');this.event(kind,p,{type:'contact',perfect,x:b.x,y:b.y});return true;
 }
 ability(p){const b=this.ball;let why='';if(p.character!=='jikyu')why='Ativa exclusiva de Jikyū';else if(this.phase!=='rally')why='Aguarde a bola em jogo';else if(p.cooldown>0)why=`Recarga: ${Math.ceil(p.cooldown)} s`;else if(p.energy<25)why='Energia insuficiente';else if((b.x<N?0:1)!==p.side)why='A bola precisa estar no seu lado';else if(b.y>=F-BR||Math.hypot(b.x-p.x,b.y-(p.y-65))>300)why='Bola fora do alcance';else if(this.touches[p.side]>=3)why='Três contatos já usados';else if(this.convergenceUsed[p.side])why='Aguarde a bola cruzar a rede';if(why){this.notice(p,why);return false;}
 if(!this.register(p))return false;p.energy-=25;p.cooldown=18;this.convergenceUsed[p.side]=true;this.attraction={player:p.id,side:p.side,x:clamp(p.x+(p.side===0?68:-68),p.side?N+25:32,p.side?W-32:N-25),y:p.y-111,remaining:.3};b.spin=0;b.tier=0;b.curveTier='none';this.event('ability',p,{x:b.x,y:b.y});this.notice(p,'CONVERGÊNCIA · 1 CONTATO');return true;
 }
 point(side,reason){if(this.phase!=='rally')return;this.score[side]++;this.serveSide=side;this.attraction=null;this.event('point',null,{type:'point',side,reason,x:this.ball.x,y:this.ball.y});if(!this.training&&this.score[side]>=11&&this.score[side]-this.score[1-side]>=2){this.end(side,reason);return;}this.phase='point';this.phaseTime=0;this.reason=reason;}
 end(side,reason='Fim de partida'){if(this.phase==='ended')return;this.winner=side;this.reason=reason;this.phase='ended';for(const p of this.players){p.input=blank();p.previous=blank();p.pendingInput=[];p.charging=false;p.charge=0;p.buffer=null;p.block=false;}this.onFinish(this);}
 disconnect(id){const p=this.players.find(p=>p.id===id);if(p&&p.disconnectedAt===null){p.disconnectedAt=this.time;p.input=blank();p.previous=blank();p.pendingInput=[];p.charging=false;p.buffer=null;}}
 reconnect(id){const p=this.players.find(p=>p.id===id);if(p){p.disconnectedAt=null;p.input=blank();p.previous=blank();p.pendingInput=[];p.charging=false;p.charge=0;p.buffer=null;p.block=false;}}
 record(){return{id:this.id,engine:'v41-shared-gdd-0.7',mode:this.mode,ranked:this.ranked,placement:this.placement??null,players:this.players.map(({id,side,bot,elo,character,difficulty})=>({id,side,bot:!!bot,elo,character,difficulty})),ratings:this.ratings,score:this.score,winner:this.winner,abandoned:[...this.abandoned],seed:this.initialSeed,replay:this.replay,replayPartial:!!this.replayPartial,reason:this.reason};}
 ai(p,dt=STEP){p.input=this.tactics.decide({time:this.time,phaseTime:this.phaseTime,phase:this.phase,ball:this.ball,players:this.players,touches:this.touches,server:this.server.id},p);}

 step(dt=STEP){if(this.phase==='ended')return;this.time+=dt;this.phaseTime+=dt;
 if(this.time>1800){if(this.score[0]===this.score[1])this.ranked=false;this.end(this.score[0]>=this.score[1]?0:1,'Limite de sessão de 30 minutos');return;}
 const previousPlayers=this.players.map(p=>({x:p.x,y:p.y}));
 for(const p of this.players){
 if(p.disconnectedAt!==null&&this.time-p.disconnectedAt>30){this.abandoned.add(p.id);if(!this.started)this.ranked=false;this.end(1-p.side,'Abandono confirmado');return;}
 if(p.pendingInput.length){p.input=p.pendingInput.shift();p.processedSeq=p.input.seq;}if(p.bot||p.disconnectedAt!==null&&this.mode==='2v2')this.ai(p,dt);else if(this.time-p.lastInput>.35){p.input=blank();p.charging=false;p.buffer=null;}
 const i=p.input,prev=p.previous,c=character(p.character),move=Number(i.right)-Number(i.left);p.cooldown=Math.max(0,p.cooldown-dt);if(i.cancel){p.charging=false;p.buffer=null;}
 if(i.jump&&!prev.jump){if(this.phase==='serve')this.toss(p);p.jumpbuf=.16;if(this.kernel.jump(p)){p.vy*=1+(c.stats[2]-5)*.025;this.event('jump',p);}}
 if(!i.jump&&prev.jump&&p.vy< -330)p.vy*=.68;
 if(i.dash&&!prev.dash&&this.kernel.dash(p,move||p.facing))this.event('dash',p);
 if(i.dive&&!prev.dive&&this.kernel.dive(p,move||p.facing))this.event('dive',p);
 if(i.attack&&!prev.attack){p.charging=true;p.charge=0;p.aimSamples=[];}if(p.charging)p.charge=Math.min(1.25,p.charge+dt);
 const spin=Number(i.spinR)-Number(i.spinL);if(spin&&spin!==p.spinDir)p.spinAge=0;else p.spinAge+=dt;p.spinDir=spin;
 p.aimSamples.push({t:this.time,a:i.aim});while(p.aimSamples.length&&p.aimSamples[0].t<this.time-.22)p.aimSamples.shift();
 if(!i.attack&&prev.attack&&p.charging&&!i.cancel){p.buffer={kind:'attack',life:.24,power:p.charge,release:{...i},aim:i.aim,spinDir:p.spinDir,spinAge:p.spinAge,samples:p.aimSamples.map(s=>({...s})),at:this.time};p.charging=false;}
 if(i.set&&!prev.set)p.buffer={kind:'set',life:.23,power:0};if(i.receive&&!prev.receive)p.buffer={kind:'receive',life:.24,power:0};
 p.block=i.block&&!p.ground&&p.energy>5&&p.dive<=0;
 this.kernel.movement(p,move,dt,1+(c.stats[1]-5)*.025,1+(c.stats[4]-5)*.025);
 if(i.ability&&!prev.ability)this.ability(p);p.previous={...i};
 }
 for(const p of this.players){if(p.buffer){p.buffer.life-=dt;const done=p.buffer.kind==='attack'?this.attack(p):this.contact(p,p.buffer.kind);if(!done&&p.buffer.life<=0&&p.buffer.kind==='attack'&&!p.bot)this.notice(p,p.hitCD>0?'ATAQUE EM RECARGA':'ATAQUE SEM CONTATO');if(done||p.buffer.life<=0)p.buffer=null;}
 if(p.input.receive&&this.ball.vy>100&&this.ball.y>p.y-165&&!(this.ball.last===p.side&&p.lastKind==='attack'&&this.ball.vx*(p.side?-1:1)>0))this.contact(p,'receive');}
 if(this.phase==='point'){if(this.phaseTime>=1.8)this.setupServe();return;}if(this.phase==='serve'){this.ball.x=this.server.x;this.ball.y=this.server.y-110;if(this.phaseTime>8)this.toss(this.server);return;}if(this.phase!=='rally')return;
 const b=this.ball,old={x:b.x,y:b.y};b.age+=dt;b.blockCD=Math.max(0,b.blockCD-dt);
 if(this.attraction){const a=this.attraction,dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy);if((b.x<N?0:1)!==a.side||a.remaining<=0||d<12)this.attraction=null;else{a.remaining-=dt;const speed=Math.min(1450,d*18);b.vx=dx/d*speed;b.vy=dy/d*speed;b.spin=0;}}
 flight(b,dt);b.angle+=(Math.abs(b.spin)>2?b.spin*1.8:b.vx/28)*dt;
 // Original net collision values; no low ceiling or invisible end wall in official GDD play.
 if(b.x>N-19&&b.x<N+19&&b.y>NT-BR){b.reversalTrack=null;if(old.y<=NT-BR&&b.vy>0){b.y=NT-BR;b.vy=-Math.abs(b.vy)*.65;b.vx*=.85;}else{const dir=old.x<N?-1:1;b.x=N+dir*20;b.vx=dir*Math.max(75,Math.abs(b.vx)*.65);b.spin*=-.6;}this.event('net',null,{x:N,y:Math.max(NT,b.y)});}
 const side=b.x<N?0:1;if(side!==b.side){b.side=side;this.convergenceUsed=[false,false];}
 for(const p of this.players)if(p.block)this.contact(p,'block');
 for(let k=0;k<this.players.length;k++){const p=this.players[k];if(p.dive<=0||p.diveSaved||p.hitCD>0)continue;const previous=previousPlayers[k],start={x:old.x+p.x-previous.x,y:old.y+p.y-previous.y};let hit=null;
 for(const shape of this.kernel.diveGeometry(p)){const t=this.kernel.sweepCapsule(start,b,shape.a,shape.b,shape.r+BR+3);if(t!==null&&(!hit||t<hit.t))hit={t,zone:shape.zone};}
 if(hit){let deadline=1;if(b.y>old.y&&b.y>=F-BR)deadline=Math.min(deadline,(F-BR-old.y)/(b.y-old.y));if(hit.t<=deadline+1e-7){const end={x:b.x,y:b.y};b.x=old.x+(end.x-old.x)*hit.t;b.y=old.y+(end.y-old.y)*hit.t;if(this.contact(p,'receive',{dive:true,zone:hit.zone})){const remain=dt*(1-hit.t);b.x+=b.vx*remain;b.y=Math.min(F-BR-.5,b.y+b.vy*remain);break;}b.x=end.x;b.y=end.y;}}}
 if(this.phase!=='rally')return;
 if(globalThis.ApexVolleyTactics.observeReversal(b,b.reversalTrack)){b.reversal=true;b.reversalTrack=null;b.curveTier='extreme';const owner=this.players.find(p=>p.id===this.lastPlayer);this.notice(owner,'CURVA TÉCNICA / RETORNO');this.event('reversal',owner,{type:'curve',reversal:true,x:b.x,y:b.y});}
 if(b.y>=F-BR){b.y=F-BR;const inside=b.x>=32&&b.x<=W-32;this.point(inside?(b.x<N?1:0):this.lastTouchOpponent(),inside?'NO CHÃO':'FORA');}
 else if(b.x<32-128||b.x>W-32+128||b.y< -1000||b.age>8)this.point(this.lastTouchOpponent(),'FORA · LIMITE DE SEGURANÇA');
 this.events=this.events.filter(e=>this.time-e.t<3).slice(-40);this.pings=this.pings.filter(e=>this.time-e.t<2);
 }
 lastTouchOpponent(){const p=this.players.find(p=>p.id===this.lastPlayer);return p?1-p.side:1-this.serveSide;}
 snapshot(){return{id:this.id,engine:'v41-shared-gdd-0.7',world:WORLD,mode:this.mode,ranked:this.ranked,training:this.training,placement:this.placement??null,time:this.time,score:this.score,touches:this.touches,phase:this.phase,reason:this.reason,server:this.server.id,ball:this.ball,attraction:this.attraction,winner:this.winner,results:this.results,settlementPending:!!this.settlementPending,pings:this.pings,events:this.events.slice(-20),players:this.players.map(p=>({id:p.id,name:p.name,side:p.side,character:p.character,appearance:p.appearance,elo:p.elo,bot:!!p.bot,difficulty:p.bot?p.profile.id:undefined,x:p.x,y:p.y,vx:p.vx,vy:p.vy,energy:p.energy,cooldown:p.cooldown,charge:p.charge,charging:p.charging,spinDir:p.spinDir,seq:p.seq,processedSeq:p.processedSeq,movementInput:{left:p.previous.left,right:p.previous.right,jump:p.previous.jump,dash:p.previous.dash,dive:p.previous.dive,block:p.previous.block},coyote:p.coyote,jumpbuf:p.jumpbuf,diveCD:p.diveCD,block:p.block,dive:p.dive,diveDir:p.diveDir,diveSaved:p.diveSaved,ground:p.ground,facing:p.facing,land:p.land,rotation:p.rotation,dash:p.dash,dashCD:p.dashCD,airDash:p.airDash,lastKind:p.lastKind,touchAnim:p.touchAnim,hitCD:p.hitCD,aim:p.input.aim,notice:this.time<p.noticeUntil?p.notice:'',disconnected:p.disconnectedAt!==null}))};}
}
