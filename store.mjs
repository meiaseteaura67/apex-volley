import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {newProfile,summonProfile,settleProfile,leaderboardProfiles,validateOperation} from './store-rules.mjs';
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
 const p=newProfile(name),id=p.id;
 this.db.prepare('INSERT INTO accounts VALUES(?,?,?,?)').run(id,subject,JSON.stringify(p),Date.now());return p;
 }
 operation(account,id,kind,fn){
 validateOperation(id);
 return this.transaction(()=>{const old=this.db.prepare('SELECT kind,result FROM operations WHERE account=? AND id=?').get(account,id);if(old){if(old.kind!==kind)throw new Error('ID já usado em outra operação');return JSON.parse(old.result);}
 const p=this.get(account);if(!p)throw new Error('Conta inexistente');const result=fn(p);this.put(p);
 this.db.prepare('INSERT INTO operations VALUES(?,?,?,?,?)').run(account,id,kind,JSON.stringify(result),Date.now());return result;});
 }
 summon(account,id,count){if(count!==1&&count!==10)throw new Error('Quantidade inválida');return this.operation(account,id,`summon:${count}`,p=>summonProfile(p,id,count));}
 settle(match){return this.transaction(()=>{
 if(this.db.prepare('SELECT id FROM matches WHERE id=?').get(match.id))return JSON.parse(this.db.prepare('SELECT record FROM matches WHERE id=?').get(match.id).record).results;
 const results={},now=Date.now();
 for(const player of match.players.filter(p=>!p.bot)){
 const p=this.get(player.id);if(!p)continue;results[p.id]=settleProfile(p,player,match,now);this.put(p);
 this.db.prepare('INSERT INTO operations VALUES(?,?,?,?,?)').run(p.id,`result-${match.id}`,'match',JSON.stringify(results[p.id]),now);
 }
 const record={...match,results};this.db.prepare('INSERT INTO matches VALUES(?,?,?)').run(match.id,JSON.stringify(record),now);return results;
 });}
 leaderboard(mode){return leaderboardProfiles(this.db.prepare('SELECT profile FROM accounts').all().map(r=>JSON.parse(r.profile)),mode);}
 history(id){return this.db.prepare('SELECT id,kind,result,created FROM operations WHERE account=? ORDER BY created DESC LIMIT 40').all(id).map(r=>({...r,result:JSON.parse(r.result)}));}
 delete(id){this.transaction(()=>{this.db.prepare('DELETE FROM accounts WHERE id=?').run(id);});}
 update(id,fn){return this.transaction(()=>{const p=this.get(id);if(!p)throw new Error('Conta inexistente');fn(p);return this.put(p);});}
 isBusy(){return false;}
 getSession(key){return this.db.prepare('SELECT * FROM sessions WHERE hash=? AND expires>?').get(key,Date.now());}
 createSession(row){this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(row.hash,row.account,row.csrf,row.expires);}
 deleteSession(key){this.db.prepare('DELETE FROM sessions WHERE hash=?').run(key);}
 maintenance(){this.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());this.db.prepare('DELETE FROM matches WHERE created<?').run(Date.now()-30*864e5);}
 deleteAccount(id){this.transaction(()=>{this.db.prepare('DELETE FROM matches WHERE record LIKE ?').run('%'+id+'%');this.db.prepare('DELETE FROM accounts WHERE id=?').run(id);});}
 close(){this.db.close();}
}
