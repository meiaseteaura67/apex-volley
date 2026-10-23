'use strict';
// Visual-only prediction. Never mutates match state, ball, contacts or rewards.
(()=>{
const STEP=1/120;
function create(){
 const kernel=globalThis.ApexV41Physics.create();let state=null,history=[],acc=0,enabled=false,rtt=0,stats=[5,5,5,5,5],previous={},lastTime=0;
 const clean=i=>Object.fromEntries(['left','right','jump','dash','dive','block'].map(k=>[k,!!i[k]]));
 function step(p,i,prev,dt){const move=Number(i.right)-Number(i.left);
  if(i.jump&&!prev.jump){p.jumpbuf=.16;if(kernel.jump(p))p.vy*=1+(stats[2]-5)*.025;}
  if(!i.jump&&prev.jump&&p.vy< -330)p.vy*=.68;
  if(i.dash&&!prev.dash)kernel.dash(p,move||p.facing);
  if(i.dive&&!prev.dive)kernel.dive(p,move||p.facing);
  p.block=i.block&&!p.ground&&p.energy>5&&p.dive<=0;
  kernel.movement(p,move,dt,1+(stats[1]-5)*.025,1+(stats[4]-5)*.025);
 }
 return {latency(ms){rtt=Math.max(0,Math.min(Number(ms)||0,300));},suspend(){enabled=false;history=[];acc=0;previous={};},resume(){enabled=true;},
  reconcile(authoritative,now,reset=false,characterStats){stats=characterStats||stats;
   if(reset){history=[];acc=0;previous={...authoritative.movementInput};lastTime=now;}
   state={...kernel.makePlayer(authoritative.side),...authoritative};
   // Replay only a bounded visual window of unconfirmed local movement. Aged
   // snapshots/disconnects stop prediction; authoritative state always wins.
   const from=now-rtt;history=history.filter(h=>h.at>=from&&h.at<=now);
   let prev={...authoritative.movementInput};if(!reset&&enabled)for(const h of history){step(state,h.input,prev,STEP);prev=h.input;}
   previous=prev;return state;
  },
  advance(dt,input,now){if(!state||!enabled)return state;if(now-lastTime>350){history=[];acc=0;previous={};}lastTime=now;
   const i=clean(input);acc+=Math.min(Math.max(dt,0),.04);
   while(acc>=STEP){step(state,i,previous,STEP);history.push({at:now-acc*1000,input:i});previous=i;acc-=STEP;}
   history=history.filter(h=>h.at>=now-350);return state;
  },state:()=>state
 };
}
globalThis.ApexMovementPrediction=Object.freeze({create});})();
