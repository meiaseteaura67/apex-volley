'use strict';
// Generated from reference/APEX-volley-v4.1.html. Same functions on server and browser.
(()=>{const constants=Object.freeze({W:1536,H:720,G:1110,F:596,N:768,NT:438,BR:13,STEP:1/120});
function create(hooks={}){const {W,H,G,F,N,NT,BR,STEP}=constants,COL=['#80ceff','#ffe2a0'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));let b={x:0,y:0},look={locked:false,dx:200,dy:-100},aim={x:0,y:0,used:false};let echoes=[];
const tone=(...a)=>hooks.tone?.(...a),fx=(...a)=>hooks.fx?.(...a);
function makePlayer(side){return{side,x:side?1200:336,y:F,vx:0,vy:0,energy:100,ground:true,coyote:.1,jumpbuf:0,dash:0,dashCD:0,airDash:true,dive:0,diveCD:0,diveDir:side?-1:1,diveSaved:false,hitCD:0,block:false,buffer:null,facing:side?-1:1,flash:0,land:0,aiThink:0,aiTarget:1200,aiPlan:null,airTrick:false,rotation:0,touchAnim:0,lastKind:null};}
function hand(p,kind){return{x:p.x+(p.dive>0?p.facing*40:0),y:p.y-(p.dive>0?25:kind==='receive'?48:kind==='block'?116:94)};}
function jump(p){if((p.ground||p.coyote>0)&&p.dive<=0){p.vy=-665;p.ground=false;p.coyote=0;p.jumpbuf=0;p.land=0;tone(225,.07,'triangle');fx(p.x,F,'#708eab',6);return true;}return false;}
function dash(p,dir,air=false){if(p.energy<24||p.dashCD>0||(!p.ground&&!p.airDash)||p.dive>0)return false;p.vx=dir*790;p.dash=.14;p.dashCD=.45;p.energy-=24;if(!p.ground){p.airDash=false;p.vy*=.58;}for(let i=0;i<4;i++)echoes.push({x:p.x-dir*i*14,y:p.y,t:.24-i*.03,side:p.side});fx(p.x,p.y-45,COL[p.side],7);tone(165,.09,'triangle');return true;}
function dive(p,dir){if(!p.ground||p.diveCD>0||p.energy<30)return false;p.vx=dir*660;p.facing=dir;p.diveDir=dir;p.diveSaved=false;p.rotation=0;p.dive=.44;p.diveCD=.85;p.energy-=30;fx(p.x,F,COL[p.side],8);return true;}
function shot(p,power,target,spin=0,assisted=true){const sweet=power>=.34&&power<=.62;let force=power>.9?.55:clamp(power/.48,.22,1);let speed=(590+force*440)*(p.ground?.78:1)*(sweet?1.055:1);let dx=target.x-b.x,dy=target.y-b.y;if(p.side===0&&look.locked){dx=look.dx;dy=look.dy;assisted=false;}let vx,vy;
if(assisted){let loft=clamp((F-BR-target.y)/(F-80),0,1);let t=clamp(Math.abs(dx)/speed,.28,1.45)+loft*.73;vx=dx/t;vy=(F-BR-b.y-.5*G*t*t)/t;}else{let len=Math.hypot(dx,dy)||1;vx=dx/len*speed;vy=dy/len*speed;}
return{vx,vy,spin,sweet};}
function flightStep(q,dt){const ax=-q.vy*q.spin*.026,ay=q.vx*q.spin*.026;q.vx+=(ax-q.vx*.032)*dt;q.vy+=(G+ay)*dt;q.x+=q.vx*dt;q.y+=q.vy*dt;q.spin*=Math.exp(-.22*dt);}
function returnProfile(dir){return{age:0,delay:1.1,duration:.30,peak:Math.sign(dir)*550};}
function aerialStep(q,dt){
 const profile=q.returnFlight;if(profile){const age=profile.age+dt*.5,u=(age-profile.delay)/profile.duration;q.spin=u>0&&u<1?profile.peak*Math.sin(Math.PI*u):0;profile.age+=dt;}
 flightStep(q,dt);
}
function pointSegmentDistance(x,y,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(x-a.x-dx*t,y-a.y-dy*t);}
function sweepCapsule(s,e,a,b,r){if(pointSegmentDistance(s.x,s.y,a,b)<=r)return 0;const dx=e.x-s.x,dy=e.y-s.y;let best=Infinity;function accept(t){if(t>=0&&t<=1)best=Math.min(best,t);}const speed2=dx*dx+dy*dy;if(speed2<1e-12)return null;for(const c of [a,b]){const ox=s.x-c.x,oy=s.y-c.y,B=2*(ox*dx+oy*dy),C=ox*ox+oy*oy-r*r,D=B*B-4*speed2*C;if(D>=0)accept((-B-Math.sqrt(D))/(2*speed2));}const lx=b.x-a.x,ly=b.y-a.y,len=Math.hypot(lx,ly);if(len>1e-8){const ux=lx/len,uy=ly/len,u=(s.x-a.x)*ux+(s.y-a.y)*uy,v=-(s.x-a.x)*uy+(s.y-a.y)*ux,du=dx*ux+dy*uy,dv=-dx*uy+dy*ux;if(Math.abs(dv)>1e-9)for(const sign of [-1,1]){const t=(sign*r-v)/dv,along=u+du*t;if(along>=0&&along<=len)accept(t);}}return best===Infinity?null:best;}
function diveGeometry(p){const d=p.diveDir,angle=d*.12,co=Math.cos(angle),si=Math.sin(angle);function pt(x,y){return{x:p.x+x*co-y*si,y:p.y-25+x*si+y*co};}return[{a:pt(-30*d,8),b:pt(28*d,-3),r:10,zone:'body'},{a:pt(35*d,0),b:pt(76*d,9),r:7,zone:'arms'},{a:pt(38*d,-6),b:pt(38*d,-6),r:13,zone:'head'},{a:pt(-23*d,10),b:pt(-62*d,19),r:5,zone:'legs'},{a:pt(-29*d,4),b:pt(-48*d,-8),r:5,zone:'legs'}];}
function touchLook(p,kind){let dx=look.locked?look.dx:aim.used?aim.x-p.x:p.facing*200,dy=look.locked?look.dy:aim.used?aim.y-(p.y-80):-100;const len=Math.hypot(dx,dy)||1;const base=kind==='set'?735:680;return{vx:dx/len*base*.7,vy:-base*(.60+.4*Math.max(0,-dy/len))};}

function movement(p,move,dt,mobility=1,stamina=1,skipAcceleration=false){
 if(move&&p.dive<=0)p.facing=move;
 if(!skipAcceleration&&p.dash<=0&&p.dive<=0){let max=390*mobility,accel=(p.ground?3400:2150)*mobility;let target=move*max;p.vx+=clamp(target-p.vx,-accel*dt,accel*dt);}
 p.hitCD-=dt;p.dash-=dt;p.dashCD-=dt;p.dive-=dt;p.diveCD-=dt;p.flash-=dt;p.touchAnim-=dt;p.land=Math.max(0,p.land-dt);p.jumpbuf-=dt;p.coyote=p.ground?.1:Math.max(0,p.coyote-dt);p.rotation*=Math.exp(-5*dt);p.energy=clamp(p.energy+(p.block?-24:p.dash>0||p.dive>0?0:23*stamina)*dt,0,100);p.vy+=G*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.x=clamp(p.x,p.side?N+31:32,p.side?W-32:N-31);
 if(p.y>=F){if(!p.ground&&p.vy>200)p.land=.1;p.y=F;p.vy=0;p.ground=true;p.airDash=true;if(p.jumpbuf>0)jump(p);}else p.ground=false;
}
return Object.freeze({constants,makePlayer,hand,jump,dash:(...a)=>{const ok=dash(...a);if(echoes.length)hooks.echoes?.(echoes);echoes=[];return ok;},dive,shot,flightStep,aerialStep,returnProfile,pointSegmentDistance,sweepCapsule,diveGeometry,touchLook,movement,
 context:(ballValue,aimValue,lookValue)=>{b=ballValue;aim=aimValue||aim;look=lookValue||look;}});
}
globalThis.ApexV41Physics=Object.freeze({constants,create});})();
