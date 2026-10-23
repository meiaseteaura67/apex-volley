import pg from 'pg';
import {newProfile,summonProfile,settleProfile,leaderboardProfiles,validateOperation} from './store-rules.mjs';
const unavailable=()=>Object.assign(new Error('Banco de dados indisponível. Tente novamente; não repita a operação com outro ID.'),{status:503});
// Remote hosts always use TLS with certificate verification. No rejectUnauthorized:false.
export function postgresOptions(connectionString){
 let url;try{url=new URL(connectionString);}catch{throw new Error('DATABASE_URL inválida. Use a conexão PostgreSQL do provedor.');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.pathname.slice(1))throw new Error('DATABASE_URL inválida. Use a conexão PostgreSQL do provedor.');
 const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 for(const key of [...url.searchParams.keys()])if(key.startsWith('ssl')||['channel_binding','options'].includes(key))url.searchParams.delete(key);
 return {connectionString:url.href,ssl:local?false:{rejectUnauthorized:true},enableChannelBinding:!local,max:5,connectionTimeoutMillis:15000,idleTimeoutMillis:20000,query_timeout:15000,statement_timeout:12000,application_name:'apex-volley'};
}
export class PostgresStore {
 constructor(pool){this.pool=pool;this.kind='postgres';this.accounts=new Map();this.sessions=new Map();this.pending=new Map();this.closed=false;pool.on('error',()=>{});}
 static async connect(connectionString){const store=new PostgresStore(new pg.Pool(postgresOptions(connectionString)));try{await store.initialize();return store;}catch{await store.pool.end().catch(()=>{});throw new Error('Não foi possível iniciar o PostgreSQL. Confira DATABASE_URL e a disponibilidade do banco.');}}
 async query(sql,args=[],client=this.pool){try{return await client.query(sql,args);}catch{throw unavailable();}}
 async transaction(fn){let client;try{client=await this.pool.connect();}catch{throw unavailable();}try{await this.query('BEGIN',[],client);const value=await fn(client);await this.query('COMMIT',[],client);return value;}catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}}
 async initialize(){await this.transaction(async c=>{await this.query(`
 CREATE TABLE IF NOT EXISTS apex_accounts(id TEXT PRIMARY KEY,subject TEXT UNIQUE NOT NULL,profile TEXT NOT NULL,created BIGINT NOT NULL,version BIGINT NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS apex_operations(account TEXT NOT NULL REFERENCES apex_accounts(id) ON DELETE CASCADE,id TEXT NOT NULL,kind TEXT NOT NULL,result TEXT NOT NULL,created BIGINT NOT NULL,PRIMARY KEY(account,id));
 CREATE TABLE IF NOT EXISTS apex_matches(id TEXT PRIMARY KEY,record TEXT NOT NULL,created BIGINT NOT NULL);
 CREATE TABLE IF NOT EXISTS apex_sessions(hash TEXT PRIMARY KEY,account TEXT NOT NULL REFERENCES apex_accounts(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires BIGINT NOT NULL);
 CREATE INDEX IF NOT EXISTS apex_operations_history ON apex_operations(account,created DESC);
 CREATE INDEX IF NOT EXISTS apex_sessions_expiry ON apex_sessions(expires);
 CREATE INDEX IF NOT EXISTS apex_matches_created ON apex_matches(created);`,[],c);});
 const rows=await this.query('SELECT id,profile,version FROM apex_accounts');for(const row of rows.rows)this.cache(row);
 const sessions=await this.query('SELECT * FROM apex_sessions WHERE expires>$1',[Date.now()]);for(const row of sessions.rows)this.sessions.set(row.hash,{...row,expires:Number(row.expires)});
 }
 cache(row){if(!row)return;const version=BigInt(row.version),old=this.accounts.get(row.id);if(!old||version>=old.version)this.accounts.set(row.id,{version,profile:JSON.parse(row.profile)});}
 get(id){const row=this.accounts.get(id);return row?structuredClone(row.profile):null;}
 isBusy(id){return (this.pending.get(id)||0)>0;}
 async busy(ids,fn){for(const id of ids)this.pending.set(id,(this.pending.get(id)||0)+1);try{return await fn();}finally{for(const id of ids){const n=this.pending.get(id)-1;if(n)this.pending.set(id,n);else this.pending.delete(id);}}}
 async saveProfile(c,p){return (await this.query('UPDATE apex_accounts SET profile=$1,version=version+1 WHERE id=$2 RETURNING id,profile,version',[JSON.stringify(p),p.id],c)).rows[0];}
 async login(subject,name='Atleta'){
 const p=newProfile(name);const row=await this.transaction(async c=>{await this.query('INSERT INTO apex_accounts(id,subject,profile,created) VALUES($1,$2,$3,$4) ON CONFLICT(subject) DO NOTHING',[p.id,subject,JSON.stringify(p),Date.now()],c);return (await this.query('SELECT id,profile,version FROM apex_accounts WHERE subject=$1',[subject],c)).rows[0];});this.cache(row);return this.get(row.id);
 }
 async update(id,fn){return this.busy([id],async()=>{const row=await this.transaction(async c=>{const row=(await this.query('SELECT profile FROM apex_accounts WHERE id=$1 FOR UPDATE',[id],c)).rows[0];if(!row)throw new Error('Conta inexistente');const p=JSON.parse(row.profile);fn(p);return this.saveProfile(c,p);});this.cache(row);return this.get(id);});}
 async operation(account,id,kind,fn){validateOperation(id);return this.busy([account],async()=>{
 const committed=await this.transaction(async c=>{const row=(await this.query('SELECT profile FROM apex_accounts WHERE id=$1 FOR UPDATE',[account],c)).rows[0];if(!row)throw new Error('Conta inexistente');
 const old=(await this.query('SELECT kind,result FROM apex_operations WHERE account=$1 AND id=$2',[account,id],c)).rows[0];if(old){if(old.kind!==kind)throw new Error('ID já usado em outra operação');const fresh=(await this.query('SELECT id,profile,version FROM apex_accounts WHERE id=$1',[account],c)).rows[0];return {result:JSON.parse(old.result),row:fresh};}
 const p=JSON.parse(row.profile),result=fn(p),saved=await this.saveProfile(c,p);await this.query('INSERT INTO apex_operations VALUES($1,$2,$3,$4,$5)',[account,id,kind,JSON.stringify(result),Date.now()],c);return {result,row:saved};});this.cache(committed.row);return committed.result;
 });}
 summon(account,id,count){if(count!==1&&count!==10)throw new Error('Quantidade inválida');return this.operation(account,id,`summon:${count}`,p=>summonProfile(p,id,count));}
 async settle(match){const ids=[...new Set(match.players.filter(p=>!p.bot).map(p=>p.id))].sort();return this.busy(ids,async()=>{
 const committed=await this.transaction(async c=>{
 // Serialize duplicate match IDs, then lock all human rows in a stable order.
 await this.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['apex-match:'+match.id],c);
 const old=(await this.query('SELECT record FROM apex_matches WHERE id=$1',[match.id],c)).rows[0];
 const rows=(await this.query('SELECT id,profile,version FROM apex_accounts WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE',[ids],c)).rows;
 if(old)return {results:JSON.parse(old.record).results,rows};
 const prior=(await this.query("SELECT account,result FROM apex_operations WHERE id=$1 AND kind='match' AND account=ANY($2::text[])",['result-'+match.id,ids],c)).rows;
 if(prior.length){if(rows.some(r=>!prior.some(p=>p.account===r.id)))throw unavailable();return {results:Object.fromEntries(prior.map(r=>[r.account,JSON.parse(r.result)])),rows};}
 const profiles=new Map(rows.map(r=>[r.id,JSON.parse(r.profile)])),results={},saved=[],now=Date.now();
 for(const player of match.players.filter(p=>!p.bot)){const p=profiles.get(player.id);if(!p)continue;results[p.id]=settleProfile(p,player,match,now);saved.push(await this.saveProfile(c,p));await this.query('INSERT INTO apex_operations VALUES($1,$2,$3,$4,$5)',[p.id,'result-'+match.id,'match',JSON.stringify(results[p.id]),now],c);}
 const {replay,...summary}=match; // Full input streams stay in RAM, not in the free database.
 await this.query('INSERT INTO apex_matches VALUES($1,$2,$3)',[match.id,JSON.stringify({...summary,replayOmitted:true,replayEventCount:replay?.length||0,results}),now],c);return {results,rows:saved};
 });committed.rows.forEach(row=>this.cache(row));return committed.results;
 });}
 async leaderboard(mode){const rows=await this.query('SELECT profile FROM apex_accounts');return leaderboardProfiles(rows.rows.map(r=>JSON.parse(r.profile)),mode);}
 async history(id){return (await this.query('SELECT id,kind,result,created FROM apex_operations WHERE account=$1 ORDER BY created DESC LIMIT 40',[id])).rows.map(r=>({...r,created:Number(r.created),result:JSON.parse(r.result)}));}
 getSession(key){const row=this.sessions.get(key);return row&&row.expires>Date.now()&&this.accounts.has(row.account)?{...row}:null;}
 async createSession(row){await this.query('INSERT INTO apex_sessions VALUES($1,$2,$3,$4)',[row.hash,row.account,row.csrf,row.expires]);this.sessions.set(row.hash,{...row});}
 async deleteSession(key){await this.query('DELETE FROM apex_sessions WHERE hash=$1',[key]);this.sessions.delete(key);}
 async maintenance(){const now=Date.now();await this.query('DELETE FROM apex_sessions WHERE expires<$1',[now]);for(const [key,row]of this.sessions)if(row.expires<now)this.sessions.delete(key);await this.query('DELETE FROM apex_matches WHERE created<$1',[now-30*864e5]);}
 async deleteAccount(id){await this.busy([id],()=>this.transaction(async c=>{await this.query('SELECT id FROM apex_accounts WHERE id=$1 FOR UPDATE',[id],c);await this.query('DELETE FROM apex_matches WHERE record LIKE $1',['%'+id+'%'],c);await this.query('DELETE FROM apex_accounts WHERE id=$1',[id],c);}));this.accounts.delete(id);for(const [key,row]of this.sessions)if(row.account===id)this.sessions.delete(key);}
 delete(id){return this.deleteAccount(id);}
 async importSQLite(db){await this.transaction(async c=>{await this.query('LOCK TABLE apex_accounts,apex_operations,apex_matches,apex_sessions IN ACCESS EXCLUSIVE MODE',[],c);for(const table of ['accounts','operations','matches','sessions'])if((await this.query(`SELECT 1 FROM apex_${table} LIMIT 1`,[],c)).rows.length)throw new Error('Importação exige banco de destino vazio. Nenhum dado foi substituído.');
 for(const row of db.prepare('SELECT * FROM accounts').all())await this.query('INSERT INTO apex_accounts(id,subject,profile,created) VALUES($1,$2,$3,$4)',[row.id,row.subject,row.profile,row.created],c);
 for(const row of db.prepare('SELECT * FROM operations').all())await this.query('INSERT INTO apex_operations VALUES($1,$2,$3,$4,$5)',[row.account,row.id,row.kind,row.result,row.created],c);
 for(const row of db.prepare('SELECT * FROM matches').all())await this.query('INSERT INTO apex_matches VALUES($1,$2,$3)',[row.id,row.record,row.created],c);
 for(const row of db.prepare('SELECT * FROM sessions').all())await this.query('INSERT INTO apex_sessions VALUES($1,$2,$3,$4)',[row.hash,row.account,row.csrf,row.expires],c);
 });this.accounts.clear();this.sessions.clear();await this.initialize();}
 async close(){if(!this.closed){this.closed=true;await this.pool.end();}}
}
