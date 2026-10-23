import { randomBytes,createHash,createPublicKey,verify,timingSafeEqual } from 'node:crypto';
export const token=()=>randomBytes(32).toString('base64url');
export const hash=s=>createHash('sha256').update(s).digest('hex');
export const safeEqual=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function cookies(req){const out=Object.create(null);for(const p of (req.headers.cookie||'').split(';')){const i=p.indexOf('=');if(i>0)out[p.slice(0,i).trim()]=p.slice(i+1).trim();}return out;}
export class Limiter {
 constructor(limit,window,max=10000){this.limit=limit;this.window=window;this.max=max;this.entries=new Map();}
 allow(key,now=Date.now()){let e=this.entries.get(key);if(!e||now-e.time>=this.window){if(this.entries.size>=this.max){for(const [k,v] of this.entries)if(now-v.time>=this.window)this.entries.delete(k);if(this.entries.size>=this.max)return false;}e={time:now,n:0};this.entries.set(key,e);}return ++e.n<=this.limit;}
}
let jwks={keys:[],until:0};
export async function verifyGoogleJWT(jwt,{clientId,nonce,now=Date.now()}){
 if(typeof jwt!=='string'||jwt.length>12000)throw new Error('Token inválido');const parts=jwt.split('.');if(parts.length!==3)throw new Error('Token inválido');
 const header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
 if(header.alg!=='RS256'||typeof header.kid!=='string')throw new Error('Algoritmo inválido');
 if(now>=jwks.until){const res=await fetch('https://www.googleapis.com/oauth2/v3/certs',{signal:AbortSignal.timeout(8000)});if(!res.ok)throw new Error('Validação indisponível');jwks={keys:(await res.json()).keys,until:now+3600e3};}
 const key=jwks.keys.find(k=>k.kid===header.kid&&k.kty==='RSA');if(!key)throw new Error('Chave não reconhecida');
 if(!verify('RSA-SHA256',Buffer.from(parts.slice(0,2).join('.')),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw new Error('Assinatura inválida');
 if(!['https://accounts.google.com','accounts.google.com'].includes(claims.iss)||claims.aud!==clientId||(claims.azp&&claims.azp!==clientId)||!Number.isFinite(claims.exp)||claims.exp*1000<now||!Number.isFinite(claims.iat)||claims.iat*1000>now+60000||!safeEqual(claims.nonce,nonce)||typeof claims.sub!=='string'||claims.sub.length>255)throw new Error('Identidade inválida');return claims;
}
export function validateSettings(s){
 if(!s||typeof s!=='object'||JSON.stringify(s).length>12000)throw new Error('Preferências inválidas');const out={};
 if(s.binds){out.binds={};for(const [k,v] of Object.entries(s.binds)){if(!['left','right','jump','attack','receive','set','dash','dive','block','spinL','spinR','ability','lock','pause','restart'].includes(k)||typeof v!=='string'||!/^([A-Za-z0-9]{1,24}|Mouse[0-2])$/.test(v))throw new Error('Tecla inválida');out.binds[k]=v;}}
 if(s.hud){out.hud={};for(const orientation of ['portrait','landscape']){const h=s.hud[orientation];if(!h)continue;const positions={};for(const [key,p] of Object.entries(h.positions||{})){if(!['move','aim','jump','attack','receive','set','dash','dive','block','spinL','spinR','ability'].includes(key)||!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))throw new Error('HUD inválido');positions[key]={x:Math.max(4,Math.min(96,p.x)),y:Math.max(16,Math.min(90,p.y))};}
 out.hud[orientation]={positions,size:Math.max(44,Math.min(80,Number(h.size)||56)),opacity:Math.max(.3,Math.min(1,Number(h.opacity)||.8)),deadzone:Math.max(.05,Math.min(.4,Number(h.deadzone)||.15)),sensitivity:Math.max(.3,Math.min(2,Number(h.sensitivity)||1)),preset:['compact','compact-left','basic','technical','left','custom'].includes(h.preset)?h.preset:'technical',floating:!!h.floating,toggle:!!h.toggle,optional:Array.isArray(h.optional)?h.optional.filter(v=>['dash','dive','block','set'].includes(v)):['dash','dive','block','set']};}}
 if(s.hudProfiles){out.hudProfiles={};for(const device of ['desktop','mobile','tablet'])if(s.hudProfiles[device])out.hudProfiles[device]=validateSettings({hud:s.hudProfiles[device]}).hud;}
 for(const k of ['sound','impact','vibration','assist','arc'])if(typeof s[k]==='boolean')out[k]=s[k];if(s.volume!==undefined){if(!Number.isFinite(s.volume)||s.volume<0||s.volume>1)throw new Error('Volume inválido');out.volume=s.volume;}
 if(s.sensitivity!==undefined){if(!Number.isFinite(s.sensitivity)||s.sensitivity<.3||s.sensitivity>2.5)throw new Error('Sensibilidade inválida');out.sensitivity=s.sensitivity;}
 if(s.touchDirection!==undefined){if(!['look','movement'].includes(s.touchDirection))throw new Error('Direção inválida');out.touchDirection=s.touchDirection;}return out;
}
