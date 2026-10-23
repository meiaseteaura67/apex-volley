import {validateAppearance,DEFAULT_APPEARANCE,PALETTES} from './cosmetics.mjs';
import http from 'node:http';
import { readFileSync,chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join,resolve } from 'node:path';
import { Store } from './store.mjs';
import { Lobby } from './lobby.mjs';
import { CHARACTERS,character,BOT_BANDS,BOT_PRESETS,PLACEMENT_BOTS } from './rules.mjs';
import { cookies,hash,token,safeEqual,Limiter,verifyGoogleJWT,validateSettings } from './security.mjs';
function configuration(options={}){
 const env={...process.env,...options.env},prod=env.NODE_ENV==='production';
 const port=Number(env.PORT??8080);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT deve ser um inteiro de 1 a 65535');
 const origin=env.PUBLIC_ORIGIN||`http://localhost:${port}`,urlOrigin=new URL(origin),host=env.HOST||'127.0.0.1',dev=env.DEV_LOGIN==='1'&&!prod;
 if(urlOrigin.origin!==origin)throw new Error('PUBLIC_ORIGIN deve conter apenas esquema e host');
 if(prod&&(urlOrigin.protocol!=='https:'||!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET||env.DEV_LOGIN==='1'))throw new Error('Produção exige HTTPS, OAuth configurado e login de teste desativado');
 if(dev&&(!['127.0.0.1','localhost','::1'].includes(urlOrigin.hostname)||!['127.0.0.1','localhost','::1'].includes(host)))throw new Error('Login de teste exige loopback');
 return {env,prod,port,origin,urlOrigin,host,dev};
}
export async function openApp(options={}){const {env}=configuration(options);if(options.store||!env.DATABASE_URL)return createApp(options);const {PostgresStore}=await import('./postgres-store.mjs');const store=await PostgresStore.connect(env.DATABASE_URL);try{return createApp({...options,store});}catch(e){await store.close();throw e;}}
export function createApp(options={}){
 const {env,prod,port,origin,urlOrigin,host,dev}=configuration(options);
 if(env.DATABASE_URL&&!options.store)throw new Error('PostgreSQL requer openApp para aguardar a conexão.');
 const store=options.store||new Store(env.DB_PATH||'./var/apex.sqlite'),lobby=new Lobby(store),oauth=new Map();
 if(!options.store)try{chmodSync(env.DB_PATH||'./var/apex.sqlite',0o600);}catch{}
 const apiLimit=new Limiter(400,1000),loginLimit=new Limiter(20,60000),inputLimit=new Limiter(65,1000),actionLimit=new Limiter(40,60000),pingKeys=new Map();
 const publicDir=fileURLToPath(new URL('../public/',import.meta.url));const assets=new Map([['/touch-ui.css',['touch-ui.css','text/css; charset=utf-8']],['/touch-input.js',['touch-input.js','text/javascript; charset=utf-8']],['/touch-ui.js',['touch-ui.js','text/javascript; charset=utf-8']],['/',['index.html','text/html; charset=utf-8']],['/index.html',['index.html','text/html; charset=utf-8']],['/arena',['index.html','text/html; charset=utf-8']],['/arena/',['index.html','text/html; charset=utf-8']],['/classic.css',['classic.css','text/css; charset=utf-8']],['/classic-game.js',['classic-game.js','text/javascript; charset=utf-8']],['/classic-services.css',['classic-services.css','text/css; charset=utf-8']],['/classic-services.js',['classic-services.js','text/javascript; charset=utf-8']],['/v41-physics.js',['v41-physics.js','text/javascript; charset=utf-8']],['/volley-tactics.js',['volley-tactics.js','text/javascript; charset=utf-8']],['/volley-bots.js',['volley-bots.js','text/javascript; charset=utf-8']]]);
 const cookie=(name,value,age)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${urlOrigin.protocol==='https:'?'; Secure':''}`;
 const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
 function session(req){const value=cookies(req).apex_session;if(!value||value.length>100)return null;const row=store.getSession(hash(value));return row&&store.get(row.account)?row:null;}
 async function establish(res,p){const value=token(),csrf=token(),expires=Date.now()+7*864e5;await store.createSession({hash:hash(value),account:p.id,csrf,expires});res.setHeader('Set-Cookie',cookie('apex_session',value,7*86400));return csrf;}
 function requireIdle(id){if(store.isBusy(id)||lobby.settling.has(id)||lobby.active.has(id)||lobby.queues.some(q=>q.ids.includes(id)))throw new Error('Operação indisponível em fila ou partida');}
 async function body(req){let text='',size=0;for await(const c of req){size+=c.length;if(size>16384){const e=new Error('Solicitação muito grande');e.status=413;throw e;}text+=c;}try{return JSON.parse(text||'{}');}catch{throw new Error('JSON inválido');}}
 const server=http.createServer(async(req,res)=>{
 res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'");
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');if(prod)res.setHeader('Strict-Transport-Security','max-age=31536000');
 try{
 if(req.headers.host!==urlOrigin.host)return json(res,421,{error:'Host não autorizado'});
 const u=new URL(req.url,origin),path=u.pathname;if(req.url.length>4096)return json(res,414,{error:'URL muito longa'});
 const ip=req.socket.remoteAddress||'unknown';if(!apiLimit.allow(ip))return json(res,429,{error:'Muitas solicitações; aguarde'});
 if(req.method==='GET'&&assets.has(path)){const [file,type]=assets.get(path);res.writeHead(200,{'Content-Type':type});res.end(readFileSync(file==='index.html'?fileURLToPath(new URL('../index.html',import.meta.url)):join(publicDir,file)));return;}
 if(path==='/favicon.ico'){res.writeHead(204);res.end();return;}
 if(path==='/health'&&req.method==='GET')return json(res,200,{ok:true,version:'0.9.9',storage:store.kind||'sqlite'});
 if(path==='/api/config'&&req.method==='GET')return json(res,200,{characters:CHARACTERS,botBands:BOT_BANDS,placementBots:PLACEMENT_BOTS,botPresets:BOT_PRESETS.map(({id,name,sampleElo})=>({id,name,sampleElo})),appearance:DEFAULT_APPEARANCE,palettes:PALETTES,devLogin:dev,google:!!env.GOOGLE_CLIENT_ID,region:'local',version:'0.9.9',serverTime:Date.now()});
 if(path==='/auth/google'&&req.method==='GET'){
 if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET)return json(res,503,{error:'Google OAuth não configurado pelo operador'});if(!loginLimit.allow(ip))return json(res,429,{error:'Aguarde'});
 if(oauth.size>500)return json(res,503,{error:'Autenticação ocupada'});const state=token(),nonce=token(),verifier=token(),binding=token();oauth.set(state,{nonce,verifier,binding:hash(binding),expires:Date.now()+300000});
 const auth=new URL('https://accounts.google.com/o/oauth2/v2/auth');for(const [k,v] of Object.entries({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:origin+'/auth/callback',response_type:'code',scope:'openid profile',state,nonce,code_challenge:Buffer.from(hash(verifier),'hex').toString('base64url'),code_challenge_method:'S256',prompt:'select_account'}))auth.searchParams.set(k,v);
 res.setHeader('Set-Cookie',cookie('apex_oauth',binding,300));res.writeHead(302,{Location:auth.href});res.end();return;
 }
 if(path==='/auth/callback'&&req.method==='GET'){
 const state=u.searchParams.get('state'),pending=oauth.get(state);oauth.delete(state);res.setHeader('Set-Cookie',cookie('apex_oauth','',0));
 if(!pending||pending.expires<Date.now()||!safeEqual(pending.binding,hash(cookies(req).apex_oauth||'')))throw new Error('Login expirado ou inválido');
 const code=u.searchParams.get('code');if(!code||code.length>2048)throw new Error('Autorização cancelada');
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:origin+'/auth/callback',grant_type:'authorization_code',code_verifier:pending.verifier})});
 if(!response.ok)throw new Error('Não foi possível concluir o login Google');const result=await response.json();const claims=await verifyGoogleJWT(result.id_token,{clientId:env.GOOGLE_CLIENT_ID,nonce:pending.nonce});
 const p=await store.login(`google:${claims.sub}`,'Atleta');await establish(res,p);res.writeHead(303,{Location:'/'});res.end();return;
 }
 const s=session(req);
 if(path==='/api/me'&&req.method==='GET')return json(res,200,s?{profile:store.get(s.account),csrf:s.csrf}:{profile:null});
 if(path==='/api/dev-login'&&req.method==='POST'){
 if(!dev)return json(res,404,{error:'Não encontrado'});if(req.headers.origin!==origin||req.headers['content-type']!=='application/json')return json(res,403,{error:'Origem inválida'});if(!loginLimit.allow(ip))return json(res,429,{error:'Aguarde'});
 const b=await body(req);if(typeof b.name!=='string'||!/^[-\p{L}\p{N}_ ]{2,24}$/u.test(b.name))throw new Error('Use nome de teste de 2 a 24 letras/números');const p=await store.login('dev:'+b.name.toLowerCase(),b.name);const csrf=await establish(res,p);return json(res,200,{profile:p,csrf});
 }
 if(!s)return json(res,401,{error:'Entre na sua conta'});const id=s.account;
 if(path==='/api/events'&&req.method==='GET'){
 if(req.headers.origin&&req.headers.origin!==origin)return json(res,403,{error:'Origem inválida'});if(req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'Origem inválida'});
 if(lobby.streams.size>=200&&!lobby.streams.has(id))return json(res,503,{error:'Servidor cheio'});
 const old=lobby.streams.get(id);if(old){old.res.write('event: replaced\ndata: {}\n\n');old.res.end();}
 res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(': conectado\n\n');
 const entry={res,session:s.hash,controlToken:token()};lobby.streams.set(id,entry);lobby.send(id,'control',{token:entry.controlToken});const activeId=lobby.active.get(id),m=lobby.matches.get(activeId);if(m){m.reconnect(id);lobby.send(id,'match',m.snapshot());}else{if(activeId&&lobby.active.get(id)===activeId)lobby.active.delete(id);lobby.send(id,'idle',{profile:store.get(id)});lobby.send(id,'queue',lobby.queueSnapshot(id));}
 lobby.notifyParty(lobby.partyFor(id),[id]);
 const ping=()=>{const nonce=token();pingKeys.set(id,{nonce,at:Date.now()});lobby.send(id,'ping',{nonce});};ping();const timer=setInterval(ping,3000);
 req.on('close',()=>{clearInterval(timer);if(lobby.streams.get(id)===entry){lobby.streams.delete(id);const m=lobby.matches.get(lobby.active.get(id));m?.disconnect(id);lobby.notifyParty(lobby.partyFor(id),[id]);}});return;
 }
 if(req.method==='GET'&&path==='/api/ranking'){const mode=u.searchParams.get('mode');if(!['1v1','2v2'].includes(mode))throw new Error('Modo inválido');return json(res,200,{rows:await store.leaderboard(mode)});}
 if(req.method==='GET'&&path==='/api/history')return json(res,200,{rows:await store.history(id)});
 if(req.method==='GET'&&path==='/api/party')return json(res,200,lobby.partySnapshot(id));
 if(req.method!=='POST')return json(res,404,{error:'Não encontrado'});
 if(req.headers.origin!==origin||!safeEqual(req.headers['x-csrf-token'],s.csrf)||req.headers['content-type']!=='application/json')return json(res,403,{error:'Proteção de solicitação: atualize a página'});
 const b=await body(req);
 if(path==='/api/pong'){const p=pingKeys.get(id);if(p&&safeEqual(p.nonce,b.nonce)){lobby.latency.set(id,{at:Date.now(),ms:Date.now()-p.at});pingKeys.delete(id);}return json(res,200,{ok:true});}
 if(path==='/api/input'){const commands=b.commands===undefined?[b]:b.commands;if(!Array.isArray(commands)||!commands.length||commands.length>16)throw new Error('Lote de entrada inválido');const m=lobby.matches.get(lobby.active.get(id));if(!m)return json(res,409,{error:'Sem partida'});if(b.matchId!==m.id)return json(res,409,{error:'Partida mudou; comandos antigos descartados'});const control=lobby.streams.get(id);if(!lobby.connected(id)||!control.controlToken||!safeEqual(b.controlToken,control.controlToken))return json(res,409,{error:'Controle substituído ou desconectado; reconecte esta janela'});for(const command of commands){if(!inputLimit.allow(id))return json(res,429,{error:'Comandos em excesso'});if(!m.input(id,command))return json(res,422,{accepted:false});}return json(res,200,{accepted:true});}
 if(!actionLimit.allow(id))return json(res,429,{error:'Aguarde antes de repetir a ação'});
 if(path==='/api/profile'){
 if(b.name!==undefined||b.character!==undefined||b.appearance!==undefined)requireIdle(id);const p=await store.update(id,p=>{if(b.name!==undefined){if(typeof b.name!=='string'||!/^[-\p{L}\p{N}_ ]{2,24}$/u.test(b.name))throw new Error('Nome: 2–24 letras/números');p.name=b.name;}
 if(b.character!==undefined){if(!p.inventory.includes(b.character))throw new Error('Personagem bloqueado');p.equipped=b.character;}
 if(b.appearance!==undefined)p.appearance=validateAppearance(b.appearance);
 if(b.tutorial!==undefined){if(!Number.isInteger(b.tutorial)||b.tutorial<0||b.tutorial>5)throw new Error('Tutorial inválido');p.tutorial=Math.max(p.tutorial,b.tutorial);}
 });if(b.character!==undefined){const party=lobby.partyFor(id);if(party){party.members.forEach(m=>m.ready=false);lobby.notifyParty(party);}}return json(res,200,{profile:p});
 }
 if(path==='/api/settings'){const validated=validateSettings(b);const p=await store.update(id,p=>{p.settings={...p.settings,...validated};});return json(res,200,{settings:p.settings});}
 if(path==='/api/summon'){requireIdle(id);const result=await store.summon(id,b.operationId,b.count);return json(res,200,{...result,profile:store.get(id)});}
 if(path==='/api/queue')return json(res,200,lobby.enqueue(id,b.mode,b.region));
 if(path==='/api/cancel'){lobby.cancel(id);return json(res,200,{ok:true,queue:lobby.queueSnapshot(id)});}
 if(path==='/api/party'){lobby.party(id,b.action,b.code,b.ready);return json(res,200,lobby.partySnapshot(id));}
 if(path==='/api/training'){if(!CHARACTERS.some(c=>c.id===b.character)||!['free','bot','tutorial'].includes(b.kind)||!Number.isFinite(b.elo)||b.elo<600||b.elo>2200)throw new Error('Treino inválido');return json(res,200,lobby.training(id,b));}
 if(path==='/api/feed'){const m=lobby.matches.get(lobby.active.get(id));if(!m||!m.free||m.ranked)throw new Error('Alimentação somente no treino livre');const p=m.players.find(p=>p.id===id);m.phase='rally';m.phaseTime=0;m.touches=[0,0];m.lastSide=-1;m.lastPlayer=id;m.convergenceUsed=[false,false];m.ball={x:p.x+50,y:280,vx:-30,vy:50,spin:0,angle:0,last:p.side,side:p.side,touches:m.touches,blockCD:0,age:0,tier:0,curveTier:'none'};return json(res,200,{ok:true});}
 if(path==='/api/ping'){const m=lobby.matches.get(lobby.active.get(id));if(!m||!['Minha','Sua','Levanta','Cubro atrás','Boa'].includes(b.text))throw new Error('Ping inválido');const p=m.players.find(p=>p.id===id);if(p.lastPing&&m.time-p.lastPing<1.5)throw new Error('Aguarde para enviar outro ping');p.lastPing=m.time;m.pings.push({id,text:b.text,t:m.time});return json(res,200,{ok:true});}
 if(path==='/api/leave'){if(b.matchId!==undefined&&(typeof b.matchId!=='string'||b.matchId.length>80))throw new Error('Partida inválida');const result=await lobby.leave(id,b.matchId);return json(res,200,{...result,profile:store.get(id)});}
 if(path==='/api/logout'){requireIdle(id);await store.deleteSession(s.hash);lobby.streams.get(id)?.res.end();res.setHeader('Set-Cookie',cookie('apex_session','',0));return json(res,200,{ok:true});}
 if(path==='/api/delete'){requireIdle(id);if(b.confirm!=='EXCLUIR')throw new Error('Confirmação necessária');const party=lobby.partyFor(id);if(party)lobby.party(id,'leave');lobby.streams.get(id)?.res.end();await store.deleteAccount(id);res.setHeader('Set-Cookie',cookie('apex_session','',0));return json(res,200,{ok:true});}
 return json(res,404,{error:'Não encontrado'});
 }catch(e){if(!res.headersSent)json(res,e.status||400,{error:e.message?.slice(0,160)||'Solicitação inválida'});else res.end();}
 });
 server.on('connection',socket=>socket.setNoDelay(true));
 server.requestTimeout=10000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxHeadersCount=40;
 const intervals=[];
 let maintaining=false;
 async function maintain(){if(maintaining)return;maintaining=true;try{for(const [k,v]of oauth)if(v.expires<Date.now())oauth.delete(k);await store.maintenance();for(const [id,s]of lobby.streams)if(!store.getSession(s.session))s.res.end();}catch{console.error('Manutenção do banco indisponível; nova tentativa no próximo ciclo.');}finally{maintaining=false;}}
 function startTimers(){intervals.push(setInterval(()=>lobby.loop(),4),setInterval(()=>lobby.tick(),100),setInterval(maintain,60000));}
 async function close(){intervals.forEach(clearInterval);for(const {res} of lobby.streams.values())res.end();await new Promise(r=>server.close(r));server.closeAllConnections();await store.close();}
 return {server,store,lobby,host,origin,startTimers,close};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=await openApp().catch(e=>{console.error(e.message);process.exit(1);});app.startTimers();app.server.listen(Number(process.env.PORT)||8080,app.host,()=>console.log(`APEX Volley: ${app.origin}\n${process.env.DEV_LOGIN==='1'?'MODO DE TESTE LOCAL — contas sem Google':'Google OAuth: configure o ambiente antes do login'}\nBanco: ${app.store.kind==='postgres'?'PostgreSQL externo':'SQLite local'}`));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
}
