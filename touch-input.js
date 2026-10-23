'use strict';
// Gesture adapter only: emits normal actions; never reads ball/opponent or mutates physics.
(()=>{
function create({send,aim,cancelAttack=()=>{},state=()=>({ground:true}),now=()=>performance.now()}={}){
 const pointers=new Map(),sources=new Map(),pulses=new Map();let effect=0,lastTap=null,lastAngle=-.65;
 function set(action,on,source){let owners=sources.get(action);if(!owners)sources.set(action,owners=new Set());const was=owners.size>0;on?owners.add(source):owners.delete(source);if(was!==(owners.size>0))send(action,owners.size>0);}
 function pulse(action,source){set(action,true,source);pulses.set(source,{action,until:now()+70});}
 function spin(on){set('spinL',on&&effect===-1,'effect');set('spinR',on&&effect===1,'effect');}
 function chooseEffect(value){effect=[-1,0,1].includes(value)?value:0;spin(false);if([...pointers.values()].some(p=>p.key==='strike'))spin(true);return effect;}
 function tick(){for(const[key,p]of pulses)if(now()>=p.until){set(p.action,false,key);pulses.delete(key);}for(const[id,p]of pointers)if(p.key==='defend'&&!p.gesture){const air=state().ground===false;set('receive',!air,id);set('block',air,id);}}
 function begin(key,id,x=0,y=0){if(pointers.has(id)||[...pointers.values()].some(p=>p.key===key))return false;const p={key,x,y,start:now(),jumped:false,gesture:false,turned:0,flicked:false,lastAngle:null};pointers.set(id,p);
 if(key==='strike'){set('attack',true,id);spin(true);}if(key==='jump')set('jump',true,id);if(key==='ability')set('ability',true,id);const dash=key==='move'&&Math.abs(x)>.3&&lastTap&&now()-lastTap.at<280&&Math.sign(x)===lastTap.dir;move(id,x,y);if(dash)pulse('dash','dash-gesture');tick();return true;}
 function move(id,x,y){const p=pointers.get(id);if(!p)return;const dead=.18;
 if(p.key==='move'){set('left',x< -dead,id);set('right',x>dead,id);if(y<-.65&&!p.jumped){p.jumped=true;set('jump',true,id);}if(y>.85&&!p.gesture&&Math.abs(y)>Math.abs(x)*1.2){p.gesture=true;pulse('dive','dive-gesture');}}
 if(p.key==='strike'&&Math.hypot(x,y)>dead){const angle=Math.atan2(y,x);lastAngle=angle;aim(angle);if(p.lastAngle!==null){p.turned+=Math.atan2(Math.sin(angle-p.lastAngle),Math.cos(angle-p.lastAngle));if(effect&&!p.flicked&&Math.abs(p.turned)>.18){p.flicked=true;spin(false);spin(true);}}p.lastAngle=angle;}
 if(p.key==='defend'&&!p.gesture&&y<-.65){p.gesture=true;set('receive',false,id);set('block',false,id);pulse('set','set-gesture');}
 p.x=x;p.y=y;
 }
 function end(id,cancel=false){const p=pointers.get(id);if(!p)return;if(p.key==='strike'&&cancel)cancelAttack();for(const action of sources.keys())set(action,false,id);if(p.key==='strike')spin(false);if(p.key==='move'&&!cancel&&now()-p.start<200&&!p.jumped&&!p.gesture)lastTap={at:now(),dir:Math.sign(p.x)};pointers.delete(id);}
 function reset(){for(const id of [...pointers.keys()])end(id,true);for(const[key,p]of pulses)set(p.action,false,key);pulses.clear();lastTap=null;spin(false);}
 return Object.freeze({begin,move,end,tick,reset,chooseEffect,snapshot:()=>({effect,angle:lastAngle,pointers:pointers.size,held:Object.fromEntries([...sources].map(([k,v])=>[k,v.size>0]))})});
}
globalThis.ApexTouchInput=Object.freeze({create});
})();
