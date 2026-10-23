import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { drawCharacter, character, eloDelta, rank } from './rules.mjs';
export class Store {
 constructor(path){if(path!==':memory:')mkdirSync(dirname(path),{recursive:true,mode:0o700});this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,subject TEXT UNIQUE NOT NULL,profile TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS operations(account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,id TEXT NOT NULL,kind TEXT NOT NULL,result TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(account,id));
 CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY,record TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
 `); }
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const v=fn();this.db.exec('COMMIT');return v;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 get(id){const r=this.db.prepare('SELECT profile FROM accounts WHERE id=?').get(id);return r?JSON.parse(r.profile):null;}
 put(p){this.db.prepare('UPDATE accounts SET profile=? WHERE id=?').run(JSON.stringify(p),p.id);return p;}
 login(subject,name='Atleta'){
 const r=this.db.prepare('SELECT profile FROM accounts WHERE subject=?').get(subject);if(r)return JSON.parse(r.profile);
 const id=randomUUID(), mode=()=>({elo:1000,games:0,wins:0,bots:0,humanWins:0,humanAt:0,botDay:'',botNet:0});
 const p={id,name:name.slice(0,24),coins:0,fragments:0,inventory:['haru'],equipped:'haru',modes:{'1v1':mode(),'2v2':mode()},settings:{},tutorial:0,abandons:0,blockedUntil:0};
 this.db.prepare('INSERT INTO accounts VALUES(?,?,?,?)').run(id,subject,JSON.stringify(p),Date.now());return p;
 }
 operation(account,id,kind,fn){
 if(typeof id!=='string'||!/^[-\w]{16,80}$/.test(id))throw new Error('Identificador de operação inválido');
 return this.transaction(()=>{const old=this.db.prepare('SELECT kind,result FROM operations WHERE account=? AND id=?').get(account,id);if(old){if(old.kind!==kind)throw new Error('ID já usado em outra operação');return JSON.parse(old.result);}
 const p=this.get(account);if(!p)throw new Error('Conta inexistente');const result=fn(p);this.put(p);
 this.db.prepare('INSERT INTO operations VALUES(?,?,?,?,?)').run(account,id,kind,JSON.stringify(result),Date.now());return result;});
 }
 summon(account,id,count){if(count!==1&&count!==10)throw new Error('Quantidade inválida');return this.operation(account,id,`summon:${count}`,p=>{
 if(p.coins<count*100)throw new Error('Moedas insuficientes');p.coins-=count*100;const results=[];
 for(let i=0;i<count;i++){const c=drawCharacter();const duplicate=p.inventory.includes(c.id);if(duplicate)p.fragments+=c.fragments;else p.inventory.push(c.id);results.push({character:c.id,duplicate,fragments:duplicate?c.fragments:0});}return {operationId:id,results,coins:p.coins,fragments:p.fragments};});}
 settle(match){return this.transaction(()=>{
 if(this.db.prepare('SELECT id FROM matches WHERE id=?').get(match.id))return JSON.parse(this.db.prepare('SELECT record FROM matches WHERE id=?').get(match.id).record).results;
 const results={},now=Date.now(),day=new Date(now).toISOString().slice(0,10);
 const penalized=new Set(match.abandoned||[]);
 for(const player of match.players.filter(p=>!p.bot)){
 const p=this.get(player.id);if(!p)continue;const m=p.modes[match.mode];const before=m.elo;
 if(m.botDay!==day){m.botDay=day;m.botNet=0;}
 const win=player.side===match.winner&&!penalized.has(player.id);const bots=match.players.some(x=>x.side!==player.side&&x.bot);
 let delta=0,coins=0;
 if(match.ranked){const opp=match.ratings[1-player.side],own=match.ratings[player.side];delta=eloDelta({rating:own,personalRating:before,opponent:opp,win,games:m.games,bots,botNet:m.botNet,recentHumans:m.humanAt>now-30*864e5?m.humanWins:(!bots&&win?1:0)});
 // Cap at account's own rank boundary, not aggregate team rating.
 if(bots&&delta>0)delta=Math.min(delta,Math.max(0,1699-before));
 m.elo=Math.max(0,before+delta);m.games++;if(win){m.wins++;p.coins+=100;coins=100;}if(bots){m.bots++;m.botNet+=delta;}else if(win){m.humanWins++;m.humanAt=now;}
 if(penalized.has(player.id)){if(now-(p.lastAbandon||0)>7*864e5)p.abandons=0;p.lastAbandon=now;p.abandons++;p.blockedUntil=now+[60000,300000,900000][Math.min(2,p.abandons-1)];}}
 this.put(p);results[p.id]={before,after:m.elo,delta,coins,win,bots,rank:rank(m.elo),provisional:m.games<10,placementCompleted:Math.min(10,m.games),botLimit:bots&&m.botNet>=40};
 this.db.prepare('INSERT INTO operations VALUES(?,?,?,?,?)').run(p.id,`result-${match.id}`,'match',JSON.stringify(results[p.id]),now);
 }
 const record={...match,results};this.db.prepare('INSERT INTO matches VALUES(?,?,?)').run(match.id,JSON.stringify(record),now);return results;
 });}
 leaderboard(mode){return this.db.prepare('SELECT profile FROM accounts').all().map(r=>JSON.parse(r.profile)).filter(p=>p.modes[mode].games>=10).map(p=>{const m=p.modes[mode];return {id:p.id,name:p.name,...m,rank:rank(m.elo)};}).sort((a,b)=>b.elo-a.elo).map((p,i)=>({...p,position:i+1})).filter((p,i)=>(i>=100&&p.elo<1700)||p.humanAt>Date.now()-30*864e5).slice(0,200);}
 history(id){return this.db.prepare('SELECT id,kind,result,created FROM operations WHERE account=? ORDER BY created DESC LIMIT 40').all(id).map(r=>({...r,result:JSON.parse(r.result)}));}
 delete(id){this.transaction(()=>{this.db.prepare('DELETE FROM accounts WHERE id=?').run(id);});}
 close(){this.db.close();}
}
