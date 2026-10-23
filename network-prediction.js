'use strict';
// Visual-only prediction. Never mutates match state, ball, contacts or rewards.
(()=>{
const STEP=1/120;
function create(){
 const kernel=globalThis.ApexV41Physics.create();let state=null,history=[],acc=0,enabled=false,rtt=0,stats=[5,5,5,5,5],previous={},lastTime=0,commandSeq=-1;
 const clean=i=>Object.fromEntries(['left','right','jump','dash','dive','block'].map(k=>[k,!!i[k]]));
 function step(p,i,prev,dt){const move=Number(i.right)-Number(i.left);
  if(i.jump&&!prev.jump){p.jumpbuf=.16;if(kernel.jump(p))p.vy*=1+(stats[2]-5)*.025;}
  if(!i.jump&&prev.jump&&p.vy< -330)p.vy*=.68;
  if(i.dash&&!prev.dash)kernel.dash(p,move||p.facing);
  if(i.dive&&!prev.dive)kernel.dive(p,move||p.facing);
  p.block=i.block&&!p.ground&&p.energy>5&&p.dive<=0;
  kernel.movement(p,move,dt,1+(stats[1]-5)*.025,1+(stats[4]-5)*.025);
 }
 return {command(seq){if(Number.isInteger(seq))commandSeq=seq;},latency(ms){rtt=Math.max(0,Math.min(Number(ms)||0,300));},suspend(){enabled=false;history=[];acc=0;previous={};},resume(){enabled=true;},
  reconcile(authoritative,now,reset=false,characterStats){stats=characterStats||stats;
   if(reset){history=[];acc=0;previous={...authoritative.movementInput};lastTime=now;}
   state={...kernel.makePlayer(authoritative.side),...authoritative};
   // Replay only a bounded visual window of unconfirmed local movement. Aged
   // snapshots/disconnects stop prediction; authoritative state always wins.
   const from=now-rtt;history=history.filter(h=>h.at>=from&&h.at<=now&&(authoritative.processedSeq===undefined||h.seq>authoritative.processedSeq));
   let prev={...authoritative.movementInput};if(!reset&&enabled)for(const h of history){step(state,h.input,prev,STEP);prev=h.input;}
   previous=prev;return state;
  },
  advance(dt,input,now){if(!state||!enabled)return state;if(now-lastTime>350){history=[];acc=0;previous={};}lastTime=now;
   const i=clean(input);acc+=Math.min(Math.max(dt,0),.04);
   while(acc>=STEP){step(state,i,previous,STEP);history.push({at:now-acc*1000,input:i,seq:commandSeq});previous=i;acc-=STEP;}
   history=history.filter(h=>h.at>=now-350);return state;
  },state:()=>state
 };
}
// Project a *copy* to the same short visual horizon as the local athlete.
// No invented hits or points. Authoritative snapshots replace this every update.
function projectBall(source,phase,seconds,attraction=null){
 const kernel=globalThis.ApexV41Physics.create(),{W,F,N,NT,BR}=kernel.constants;
 const q={...source,returnFlight:source.returnFlight?{...source.returnFlight}:null},a=attraction?{...attraction}:null;
 if(phase!=='rally')return q;
 let remaining=Math.min(.3,Math.max(0,seconds||0));
 while(remaining>1e-7){const dt=Math.min(STEP,remaining),old={x:q.x,y:q.y};remaining-=dt;
  if(a&&a.remaining>0){const dx=a.x-q.x,dy=a.y-q.y,d=Math.hypot(dx,dy);if(d>=12&&(q.x<N?0:1)===a.side){a.remaining-=dt;const speed=Math.min(1450,d*18);q.vx=dx/d*speed;q.vy=dy/d*speed;q.spin=0;}else a.remaining=0;}
  kernel.aerialStep(q,dt);const speed=Math.hypot(q.vx,q.vy);if(speed>1550){q.vx*=1550/speed;q.vy*=1550/speed;}
  q.angle=(q.angle||0)+(Math.abs(q.spin)>2?q.spin*1.8:q.vx/28)*dt;
  if(q.x>N-19&&q.x<N+19&&q.y>NT-BR){if(old.y<=NT-BR&&q.vy>0){q.y=NT-BR;q.vy=-Math.abs(q.vy)*.65;q.vx*=.85;}else{const dir=old.x<N?-1:1;q.x=N+dir*20;q.vx=dir*Math.max(75,Math.abs(q.vx)*.65);q.spin*=-.6;}}
  if(q.y>=F-BR){q.y=F-BR;break;}
  if(q.x<32-128||q.x>W-32+128||q.y< -1000)break;
 }
 return q;
}
// Smooth only reconciliation error, not normal flight. This avoids the old
// permanent interpolation delay: a consistent forecast has zero residual.
function createBallSmoothing(){let x=0,y=0;
 return {reset(){x=0;y=0;},correct(previous,next){if(!previous||!next)return;x+=previous.x-next.x;y+=previous.y-next.y;},
  sample(projected,dt){dt=Math.max(0,Math.min(dt||0,.04));const length=Math.hypot(x,y);
   if(length>1e-6){const removed=Math.min(length*(1-Math.exp(-dt/.035)),2000*dt);const factor=1-removed/length;x*=factor;y*=factor;}else{x=0;y=0;}
   return{x:projected.x+x,y:projected.y+y};
  },residual:()=>({x,y})};
}
globalThis.ApexMovementPrediction=Object.freeze({create,projectBall,createBallSmoothing});})();
