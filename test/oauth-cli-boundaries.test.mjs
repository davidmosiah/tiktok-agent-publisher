import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const [repo,v] of [['tiktok-agent-publisher','tiktok']]){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'oauth-cli-fixture-'));const prefix=v.toUpperCase();
 const preload=path.join(dir,'fetch-fixture.mjs');
 fs.writeFileSync(preload,"// Author-created test preload: every fetch is synthetic, never delegated.\nglobalThis.fetch = async () => {\n const which=process.env.TEST_RESPONSE;\n return new Response(which==='invalid'?'synthetic-secret-token':JSON.stringify(which==='error'?{access_token:'synthetic-secret-token',error:{nested:'synthetic-secret-token'}}:{access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600}),{status:which==='error'?400:200});\n};\n");
 const env={PATH:process.env.PATH??'',...(process.platform==='win32'?{SystemRoot:process.env.SystemRoot??''}:{}),HOME:dir,USERPROFILE:dir,[prefix+'_CLIENT_SECRET']:'fixture-secret',[prefix+(v==='tiktok'?'_CLIENT_KEY':'_CLIENT_ID')]:'fixture-client'};
 const run=(args,response)=>spawnSync(process.execPath,['--import',preload,path.join(root,'src/tools',v+'-oauth.js'),...args],{cwd:dir,env:{...env,TEST_RESPONSE:response},encoding:'utf8',timeout:5000});
 try{
 let r=run(['auth-url'],'ok');assert.equal(r.status,0,r.stderr);if(process.platform!=='win32')assert.equal(fs.statSync(path.join(dir,`.${v}-oauth-session.json`)).mode&0o777,0o600);
 for(const response of ['invalid','error']){r=run(['exchange-code','--code','synthetic-code'],response);assert.equal(r.status,1);assert.ok(!(r.stdout+r.stderr).includes('synthetic-secret-token'));assert.equal(fs.existsSync(path.join(dir,'.env')),false);}
 r=run(['exchange-code','--code','synthetic-code'],'ok');assert.equal(r.status,0,r.stderr);const file=path.join(dir,'.env');if(process.platform!=='win32')assert.equal(fs.statSync(file).mode&0o777,0o600);assert.match(fs.readFileSync(file,'utf8'),/fixture-access/);assert.ok(!(r.stdout+r.stderr).includes('fixture-access'));
 if(process.platform!=='win32'){fs.chmodSync(file,0o644);const original=fs.readFileSync(file,'utf8');r=run(['exchange-code','--code','synthetic-code'],'ok');assert.equal(r.status,1);assert.match(r.stderr,/not private/);assert.equal(fs.readFileSync(file,'utf8'),original);assert.equal(fs.statSync(file).mode&0o777,0o644);}
 console.log(JSON.stringify({repo,ok:true,synthetic:true,networkCalls:0}));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
