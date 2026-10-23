'use strict';
// Pure tactical controller: observes public state and returns ordinary player commands.
// No access to scores, inventories, contacts, teleportation, energy or random outcomes.
(()=>{
const {W,F,N,NT,BR,G,STEP}=globalThis.ApexV41Physics.constants,kernel=globalThis.ApexV41Physics.create();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const blank=()=>({left:false,right:false,jump:false,attack:false,receive:false,set:false,dash:false,dive:false,block:false,spinL:false,spinR:false,ability:false,cancel:false,aim:-Math.PI/2,aimUsed:false,locked:true,direction:'look'});
function flight(q,dt){kernel.aerialStep(q,dt);const v=Math.hypot(q.vx,q.vy);if(v>1550){q.vx*=1550/v;q.vy*=1550/v;}}
// Focused release: fixed angular sensitivity, not auto-aim. Endpoints and wrong
// directions remain wrong. Neither helper reads ball position, opponent or court.
function returnAim(angle,side){
 const dir=side?-1:1;if(Math.cos(angle)*dir<=0||Math.sin(angle)>=0)return angle;
 const center=.665,elevation=Math.atan2(-Math.sin(angle),Math.abs(Math.cos(angle))),d=elevation-center,edge=d<0?center:Math.PI/2-center;
 const out=center+d*(.2+.8*(Math.abs(d)/edge)**2);
 return side?-Math.PI+out:-out;
}
function returnInput(angle,side){
 const dir=side?-1:1;if(Math.cos(angle)*dir<=0||Math.sin(angle)>=0)return angle;
 const target=Math.atan2(-Math.sin(angle),Math.abs(Math.cos(angle)));let lo=0,hi=Math.PI/2;
 for(let j=0;j<40;j++){const mid=(lo+hi)/2,a=returnAim(side?-Math.PI+mid:-mid,side),e=Math.atan2(-Math.sin(a),Math.abs(Math.cos(a)));if(e<target)lo=mid;else hi=mid;}
 const e=(lo+hi)/2;return side?-Math.PI+e:-e;
}
function execution(p,power,dist,ball,time){
 if(p.character!=='tamakaze'||!p.spinDir)return{spin:0,tier:0,cost:0,factor:1};
 const at=p.intentAt??time,dir=p.spinDir,samples=p.aimSamples.filter(s=>s.t>=at-.14);let sum=0,travel=0,maxGap=0;
 for(let j=1;j<samples.length;j++){const d=wrap(samples[j].a-samples[j-1].a);sum+=d;travel+=Math.abs(d);maxGap=Math.max(maxGap,samples[j].t-samples[j-1].t);}
 const timed=p.spinAge>=.075&&p.spinAge<=.155,window=power>=.42&&power<=.54;
 const flick=samples.length>=3&&maxGap<=.075&&at-samples.at(-1).t<=.045&&samples.at(-1).t-samples[0].t>=.045&&sum*dir>=.175&&sum*dir<=.70&&travel<=.82&&Math.abs(sum)/Math.max(.001,travel)>=.82;
 let spin=power>.9?2.6:5.2,tier=1,cost=0,factor=1;
 if(timed&&window&&dist<62){spin=9;factor=.96;}
 if(timed&&window&&flick&&!p.ground&&ball.y<p.y-70&&dist<38&&p.energy>=14){spin=22;tier=2;cost=14;factor=.88;}
 const extreme=p.aimSamples.filter(s=>s.t>=at-.24);let turn=0,length=0,sign=0,continuous=true,extremeGap=0;
 for(let j=1;j<extreme.length;j++){extremeGap=Math.max(extremeGap,extreme[j].t-extreme[j-1].t);const d=wrap(extreme[j].a-extreme[j-1].a);if(Math.abs(d)>.005){if(sign&&Math.sign(d)!==sign)continuous=false;sign=Math.sign(d);turn+=d;length+=Math.abs(d);}}
 if(extreme.length>=4&&extremeGap<=.075&&at-extreme.at(-1).t<=.045&&extreme.at(-1).t-extreme[0].t>=.10&&!p.ground&&ball.y<NT-25&&power>=.52&&power<=.72&&p.spinAge<=.18&&turn*dir>=Math.PI/4&&Math.abs(turn)<=Math.PI/2&&continuous&&length<=Math.PI/2+.02&&dist<=32&&p.energy>=32){spin=0;tier=3;cost=32;factor=.8;}
 return{spin:tier===3?0:spin*dir,tier,cost,factor,power:tier===3?.6:power,returnFlight:tier===3?kernel.returnProfile(dir):null};
}
function trajectory(ball,{ceiling=false,strictNet=false,seconds=3.4}={}){
 const q={...ball,returnFlight:ball.returnFlight?{...ball.returnFlight}:null},path=[],side=ball.x<N?0:1;let crossed=false,netY=999,reversed=false,netHit=false,ceilingHit=false,previousVx=q.vx;
 for(let tick=0;tick<seconds/STEP;tick++){
  const old={x:q.x,y:q.y};flight(q,STEP);
  if(ceiling&&q.y<BR+4){ceilingHit=true;q.y=BR+4;q.vy=Math.abs(q.vy)*.72;}
  if(previousVx*q.vx<0)reversed=true;previousVx=q.vx;
  if((old.x-N)*(q.x-N)<=0&&old.x!==q.x){crossed=true;netY=Math.min(netY,q.y);}
  if(q.x>N-19&&q.x<N+19&&q.y>NT-BR){netHit=true;if(strictNet)return{valid:false,path,netHit};if(old.y<=NT-BR&&q.vy>0){q.y=NT-BR;q.vy=-Math.abs(q.vy)*.65;q.vx*=.85;}else{const d=old.x<N?-1:1;q.x=N+d*20;q.vx=d*Math.max(75,Math.abs(q.vx)*.65);q.spin*=-.6;}}
  path.push({x:q.x,y:q.y,vx:q.vx,vy:q.vy,t:(tick+1)*STEP});
  if(q.y>=F-BR)return{valid:crossed&&!netHit&&(q.x<N?0:1)!==side&&q.x>=36&&q.x<=W-36,x:q.x,time:(tick+1)*STEP,netY,reversed,path,netHit,ceilingHit};
  if(q.x< -96||q.x>W+96||q.y< -1000)return{valid:false,path,netHit};
 }
 return{valid:false,path,netHit};
}
// Deep return: actually passes the defender's end line in the air, then lands
// just inside that same line. A loop near the net is never a valid return.
const END_LINE=32,END_STRIP=128;
function reversal(ball,{ceiling=false}={}){
 const curved=trajectory(ball,{ceiling,strictNet:true}),left=ball.x>N,line=left?END_LINE:W-END_LINE;
 let exit=null,reentry=null,furthest=ball.x;
 for(const q of curved.path){
  furthest=left?Math.min(furthest,q.x):Math.max(furthest,q.x);
  if(!exit&&(left?q.x+BR<line:q.x-BR>line)&&q.y<F-BR)exit=q;
  if(exit&&!reentry&&(left?q.x-BR>=line&&q.vx>80:q.x+BR<=line&&q.vx< -80)&&q.y<F-BR)reentry=q;
 }
 const depth=curved.x===undefined?Infinity:left?curved.x-line:line-curved.x;
 const valid=curved.valid&&!curved.ceilingHit&&!!exit&&!!reentry&&reentry.t>exit.t&&depth>=4&&depth<=END_STRIP;
 return{valid:!!valid,exited:!!exit,reentered:!!reentry,exit,reentry,furthest,depth,landing:curved.x,trajectory:curved};
}
function beginReversal(ball,proof){
 return proof?.valid?{left:ball.x>N,line:ball.x>N?END_LINE:W-END_LINE,exited:false,furthest:ball.x}:null;
}
function observeReversal(ball,track){
 if(!track)return false;
 track.furthest=track.left?Math.min(track.furthest,ball.x):Math.max(track.furthest,ball.x);
 if((track.left?ball.x+BR<track.line:ball.x-BR>track.line)&&ball.y<F-BR)track.exited=true;
 return track.exited&&ball.y<F-BR&&(track.left?ball.x-BR>=track.line&&ball.vx>80:ball.x+BR<=track.line&&ball.vx< -80);
}
const labels=Object.freeze({'drop':'LARGADINHA CURTA','deep':'CORTADA NO FUNDO','lob':'LOB ALTO','quick':'CORTADA RÁPIDA','curve-dive':'CURVA DESCENDENTE','curve-lift':'CURVA SUSTENTADA','return-attempt':'TENTATIVA DE RETORNO','reversal':'CURVA TÉCNICA · RETORNO'});
function describeShot(ball,p,{ceiling=false,proof=null}={}){
 if(proof?.valid)return'return-attempt';
 if(Math.abs(ball.spin)>3)return Math.sign(ball.spin)===(p.side?-1:1)?'curve-dive':'curve-lift';
 const result=trajectory(ball,{ceiling,strictNet:true});if(!result.valid)return'quick';
 const depth=p.side?N-result.x:result.x-N;
 return result.netY<NT-100&&result.time>.85?'lob':depth<210?'drop':depth>460?'deep':'quick';
}
function chooseShot(ball,p,players,{tier=2,ceiling=false,previousStyle='',preferred='balanced',power=tier===3?.6:.48}={}){
 const speed=(590+440*clamp(power/.48,.22,1))*(power>=.34&&power<=.62?1.055:1)*1.025*(tier===3?.8:tier===2?.88:1),spins=tier===3?[p.side?-550:550]:tier===2?[-22,22]:[0];
 const opponents=players.filter(q=>q.side!==p.side);let best=null;
 // Search actual exits, not fabricated landing targets or guaranteed points.
 for(const spin of spins)for(let a=tier===3?(p.side?-Math.PI+.42:-.95):-Math.PI;a<(tier===3?(p.side?-Math.PI+.95:-.42):Math.PI);a+=tier===3?.0025:.055){
  if(tier!==3&&Math.cos(a)*(p.side?-1:1)<.12)continue;
  const vx=Math.cos(a)*speed,vy=Math.sin(a)*speed;
  const launch={...ball,vx,vy,spin:tier===3?0:spin,returnFlight:tier===3?kernel.returnProfile(spin):null},proof=tier===3?reversal(launch,{ceiling}):null,result=proof?.trajectory||trajectory(launch,{ceiling,strictNet:true});if(!result.valid||tier===3&&!proof.valid)continue;
  const margins=opponents.map(q=>{const anticipated=clamp(q.x+q.vx*Math.min(.22,result.time),q.side?N+31:32,q.side?W-32:N-31);return Math.abs(result.x-anticipated)-390*Math.max(0,result.time-.16);});
  const margin=margins.length?Math.min(...margins):200;
  const depth=p.side?N-result.x:result.x-N;const style=tier===3?'reversal':tier===2?(Math.sign(spin)===(p.side?-1:1)?'curve-dive':'curve-lift'):result.netY<NT-100&&result.time>.85?'lob':depth<210?'drop':depth>460?'deep':'quick';
  let score=margin-result.time*38+Math.min(55,NT-BR-result.netY)*.16+(tier===3?(preferred==='return'?1800:previousStyle==='reversal'?80:950):tier===2?10:0);
  if(opponents.some(q=>q.block&&Math.abs(q.x-N)<150))score+=Math.min(95,NT-BR-result.netY)*.7;
  if(tier===3)score-=Math.abs((proof?.depth??80)-70)*2;
  if(style===previousStyle)score-=90;
  if(preferred===style||preferred==='curve'&&tier===2)score+=1250;
  if(preferred==='lob'&&style==='lob')score+=result.netY<NT-130?150:0;
  if(!best||score>best.score)best={angle:tier===3?returnInput(wrap(a),p.side):wrap(a),launchAngle:wrap(a),spin,tier,style,score,landing:result.x,time:result.time,reversed:result.reversed,exitDepth:proof?.furthest,returnDepth:proof?.depth};
 }
 return best;
}
const repertoire=['return','return','drop','return','deep','lob','return','curve','quick'];
function preference(p,brain){
 const cfg=config(p);if(p.character==='tamakaze')return (cfg.maxTier===3?repertoire:['curve','lob','deep','drop'])[brain.shotIndex%(cfg.maxTier===3?repertoire.length:4)];
 return ['deep','drop','lob','quick'][brain.shotIndex%4];
}
function config(p){return globalThis.ApexVolleyBots?.presets[p.difficulty??p.profile?.id]||{speed:390,reaction:.095,error:0,maxTier:3};}
// Choose an ordinary look direction for receive/set, so its real ballistic arc
// reaches a useful approach zone. No ball coordinates or velocities are written.
function setupAim(ball,p,kind,{wantReturn=false,variant=0,ceiling=false}={}){
 const dir=p.side?-1:1,distance=kind==='set'?(wantReturn?40+(variant%3)*6:150):wantReturn?205:260;
 const target=N-dir*distance,base=kind==='set'?735:680;let best=null;
 for(let ratio=-.72;ratio<=.72;ratio+=.04){
  const angle=-Math.PI/2+ratio,vx=Math.cos(angle)*base*.7,vy=-base*(.6+.4*(-Math.sin(angle)));
  const peak=ball.y-vy*vy/(2*G);if(ceiling&&peak<BR+30)continue;
  const height=kind==='set'?345:390,D=vy*vy-2*G*(ball.y-height);if(D<0)continue;
  const t=(-vy+Math.sqrt(D))/G,x=ball.x+vx*t;
  if(x<p.side*N+32||x>(p.side?W-32:N-32)||Math.abs(x-p.x)>390*t-12)continue;
  let score=Math.abs(x-target)+Math.max(0,Math.abs(vx)-260)*.5;
  if(!best||score<best.score)best={angle,x,time:t,score};
 }
 return best?.angle??Math.atan2(-620,clamp(target-p.x,-300,300));
}
function makePlan(state,p,brain,ceiling){
 const cfg=config(p);
 const forecast=trajectory(state.ball,{ceiling,seconds:1.65}).path,candidates=[];
 for(let j=59;j<forecast.length;j+=4){const b=forecast[j],t=b.t;if((b.x<N?0:1)!==p.side||b.y<278||b.y>440)continue;
  const safeX=clamp(b.x,p.side?N+31:32,p.side?W-32:N-31);if(Math.abs(b.x-safeX)>20||Math.abs(safeX-p.x)>390*t+24)continue;
  let jumpDelay=null,handY;
  if(p.ground){const height=clamp(F-94-b.y,0,665*665/(2*G));const air=(665-Math.sqrt(Math.max(0,665*665-2*G*height)))/G;jumpDelay=t-air;handY=F-665*air+.5*G*air*air-94;if(jumpDelay<.025)continue;}
  else{handY=p.y+p.vy*t+.5*G*t*t-94;if(p.y+p.vy*t+.5*G*t*t>=F)continue;}
  if(Math.abs(handY-b.y)>22)continue;
  const tier=cfg.maxTier>=3&&p.character==='tamakaze'&&Math.hypot(b.x-safeX,handY-b.y)<=18&&b.y<NT-25&&p.energy>=38&&(p.aiRating??p.profile?.tacticalElo??p.elo??2100)>=1950?3:cfg.maxTier>=2&&p.character==='tamakaze'&&p.energy>=18?2:0,power=tier===3?.6:.48;
  if(t<.24)continue;
  candidates.push({b,t,jumpDelay,x:safeX,tier,power,quality:Math.abs(safeX-p.x)*.12+t*35+Math.abs(handY-b.y)*2});
 }
 candidates.sort((a,b)=>a.quality-b.quality);let best=null;
 for(const c of candidates.slice(0,10)){
  for(const tier of c.tier===3?[3,2,0]:c.tier===2?[2,0]:[0]){
   const preferred=preference(p,brain),power=tier===3?.6:tier===2?.48:preferred==='drop'?.22:preferred==='quick'?.34:.48;if(c.t<power+.015)continue;const shot=chooseShot(c.b,p,state.players,{tier,ceiling,previousStyle:brain.lastStyle,preferred,power});if(!shot)continue;
   const score=shot.score-c.quality;if(!best||score>best.score){best={...c,tier,power,shot,score,forecast,at:state.time,release:state.time+c.t,jumpAt:c.jumpDelay===null?null:state.time+c.jumpDelay,ballLast:state.ball.last};}
  }
 }
 return best;
}
function create({ceiling=false}={}){
 const brains=new Map();
 function reset(id){if(id===undefined)brains.clear();else brains.delete(id);}
 function decide(state,p){
  const id=p.id??p.side;let brain=brains.get(id);if(!brain){brain={nextThink:0,lastStyle:'',phase:state.phase,shotIndex:0,serveIndex:0,stats:{plans:0,cancelled:0,returnPlans:0,returnReleases:0,setupCommands:0,styles:{}}};brains.set(id,brain);}
  const i=blank(),b=state.ball,own=(b.x<N?0:1)===p.side,direction=p.side?-1:1,lo=p.side?N+31:32,hi=p.side?W-32:N-31;
  const steer=(x,tolerance=9)=>{const cfg=config(p),noise=cfg.error*Math.sin(Math.floor(state.time/Math.max(.08,cfg.reaction))*1.73+(p.side?2:0)),error=x+noise-p.x,stopping=p.vx*Math.abs(p.vx)/(2*(p.ground?3400:2150));i.left=error-stopping< -tolerance;i.right=error-stopping>tolerance;if((Math.floor(state.time/STEP)%20)/20>cfg.speed/390){i.left=false;i.right=false;}};
  i.aim=p.side?-Math.PI+.55:-.55;
  if(brain.phase!==state.phase){brain.plan=null;brain.nextThink=0;brain.phase=state.phase;}
  if(state.phase==='point'||state.phase==='ended')return i;
  if(state.phase==='serve'){
   brain.plan=null;i.jump=state.server===id&&(state.phaseTime??0)>1.0;i.attack=i.jump;brain.serving=i.jump;return i;
  }
  if(brain.serving){
   i.jump=true;i.attack=p.charge<.48;i.aim=p.side?-Math.PI+.65:-.65;
   if(p.charge>=.48){const preferred=['deep','drop','lob'][brain.serveIndex%3],shot=chooseShot(b,p,state.players,{tier:0,ceiling,preferred});if(shot){i.aim=shot.angle;brain.lastPlan={tier:0,style:'serve-'+shot.style,landing:shot.landing,at:state.time,serve:true};}brain.serveIndex++;brain.serving=false;}
   return i;
  }
  if(brain.plan){
   const plan=brain.plan,elapsed=state.time-plan.at,index=Math.min(plan.forecast.length-1,Math.max(0,Math.round(elapsed/STEP)-1)),expected=plan.forecast[index];
   const deviation=expected?Math.hypot(b.x-expected.x,b.y-expected.y):999;
   if(!own||deviation>76||state.time>plan.release+.25||p.dive>0){brain.plan=null;brain.stats.cancelled++;i.cancel=true;return i;}
   steer(plan.x,5);i.jump=plan.jumpAt!==null&&state.time>=plan.jumpAt;
   const start=plan.release-plan.power,remaining=plan.release-state.time,span=plan.tier===3?.17:plan.tier===2?.105:0,gesture=plan.tier===3?1.02:plan.tier===2?.38:0,sign=Math.sign(plan.shot.spin);
   i.aim=wrap(plan.shot.angle-sign*gesture*clamp(remaining/Math.max(.001,span),0,1));
   if(remaining<=.10&&remaining>=-.04){i.spinL=sign<0;i.spinR=sign>0;}
   const futureHand={x:p.x+p.vx*STEP,y:p.y+(p.vy+G*STEP)*STEP-94};
   const clean=Math.hypot(b.x-futureHand.x,b.y-futureHand.y)<=21;
   const release=plan.tier===3?remaining<=.006&&(clean||remaining<-.028||p.charge>=.63):remaining<=0;
   i.attack=state.time>=start&&!release;
   if(release&&plan.tier===3&&!clean){i.cancel=true;i.attack=false;brain.plan=null;brain.stats.cancelled++;brain.nextThink=state.time+.08;return i;}
   if(release){brain.lastStyle=plan.shot.style;brain.shotIndex++;brain.stats.styles[plan.shot.style]=(brain.stats.styles[plan.shot.style]||0)+1;if(plan.tier===3)brain.stats.returnReleases++;brain.lastPlan={tier:plan.tier,style:plan.shot.style,landing:plan.shot.landing,at:state.time,serve:false};brain.plan=null;brain.nextThink=state.time+.30;}
   return i;
  }
  const history=trajectory(b,{ceiling,seconds:1.7}).path;
  const low=history.find(q=>q.vy>0&&q.y>=F-110&&(q.x<N?0:1)===p.side);
  const target=clamp(low?.x??(p.side?1110:426),lo,hi);
  const allies=state.players.filter(q=>q.side===p.side),nearest=allies.reduce((a,q)=>Math.abs(q.x-target)<Math.abs(a.x-target)?q:a,allies[0]);
  if(nearest!==p){steer(clamp(target-direction*190,lo,hi));return i;}
  steer(target,10);
  const wantReturn=config(p).maxTier>=3&&preference(p,brain)==='return'&&p.energy>=38;
  const buildThirdTouch=state.touches[p.side]===1&&(p.lastKind==='receive'||wantReturn&&Math.abs(b.x-N)>180)&&(p.aiRating??p.profile?.tacticalElo??p.elo??2100)>=1950&&p.energy>=40;
  const buildFirstTouch=wantReturn&&state.touches[p.side]===0&&Math.abs(b.x-N)>230;
  if(own&&!buildThirdTouch&&!buildFirstTouch&&state.time>=brain.nextThink){brain.nextThink=state.time+Math.max(.16,config(p).reaction);const plan=makePlan(state,p,brain,ceiling);if(plan){brain.plan=plan;brain.stats.plans++;if(plan.tier===3)brain.stats.returnPlans++;return decide(state,p);}}
  const receiveHand=kernel.hand(p,'receive'),setHand=kernel.hand(p,'set'),dist=Math.hypot(b.x-receiveHand.x,b.y-receiveHand.y),touches=state.touches[p.side];
  // A controlled first/second touch advances the setup towards the net.
  i.aim=setupAim(b,p,touches===1?'set':'receive',{wantReturn,variant:brain.shotIndex,ceiling});i.direction='look';
  if(own&&b.vy>40&&p.hitCD<=0){
   if(touches<2){i.receive=dist<128&&(!p.lastKind||state.time-(p.lastHit??-1)>.35);i.set=touches===1&&Math.hypot(b.x-setHand.x,b.y-setHand.y)<104&&!p.previous?.set;if(i.set){i.receive=false;brain.stats.setupCommands++;}}
   else if(dist<140){i.attack=!p.charging||p.charge<.34;i.aim=p.side?-Math.PI+.62:-.62;}
   i.dive=p.ground&&b.y>F-80&&Math.abs(b.x-p.x)>95&&Math.abs(b.x-p.x)<225&&p.energy>=32;
  }
  i.dash=p.ground&&Math.abs(target-p.x)>185&&(low?.t??2)<.85&&p.energy>58&&p.dashCD<=0;
  if(!own){const threat=history.find(q=>(q.x<N?0:1)===p.side&&q.y<NT+20);if(threat&&Math.abs(threat.x-N)<120&&Math.abs(p.x-N)<110)i.jump=p.ground;i.block=!p.ground&&Math.abs(p.x-N)<100;}
  return i;
 }
 return Object.freeze({decide,reset,diagnostics:id=>{const b=brains.get(id);return b?{plans:b.stats.plans,cancelled:b.stats.cancelled,shotIndex:b.shotIndex,preferred:repertoire[b.shotIndex%repertoire.length],returnPlans:b.stats.returnPlans,returnReleases:b.stats.returnReleases,setupCommands:b.stats.setupCommands,styles:{...b.stats.styles},lastPlan:b.lastPlan||null,active:b.plan?{release:b.plan.release,tier:b.plan.tier}:null}:null;}});
}
globalThis.ApexVolleyTactics=Object.freeze({create,execution,trajectory,reversal,beginReversal,observeReversal,chooseShot,setupAim,describeShot,returnAim,returnInput,labels});
})();
