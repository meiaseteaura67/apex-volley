// Somente loopback. Não existe atalho de login em produção.
if(process.env.NODE_ENV==='production')throw new Error('Login de teste proibido em produção');
process.env.NODE_ENV='development';
process.env.DEV_LOGIN='1';
process.env.HOST='127.0.0.1';
const {openApp}=await import('./index.mjs');
const app=await openApp();app.startTimers();app.server.listen(Number(process.env.PORT)||8080,app.host,()=>console.log(`APEX Volley LOCAL: ${app.origin}\nCONTAS DE TESTE. Não exponha esta porta à internet.`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.close().then(()=>process.exit(0)));
