import test from 'node:test';
import { persistEnvValues } from '../src/config.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writePrivateOAuthFile, parseOAuthTokenResponse } from '../src/tools/private-oauth-file.mjs';
test('new OAuth files private; private existing content update; unsafe existing content unchanged',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'oauth-fixture-'));const file=path.join(dir,'session');
 try {
 writePrivateOAuthFile(file,'synthetic');if(process.platform!=='win32')assert.equal(fs.statSync(file).mode&0o777,0o600);
 writePrivateOAuthFile(file,'next');assert.equal(fs.readFileSync(file,'utf8'),'next');
 if(process.platform!=='win32'){
 fs.chmodSync(file,0o644);assert.throws(()=>writePrivateOAuthFile(file,'bad'),/not private/);assert.equal(fs.readFileSync(file,'utf8'),'next');assert.equal(fs.statSync(file).mode&0o777,0o644);
 const link=path.join(dir,'link');fs.symlinkSync(file,link);assert.throws(()=>writePrivateOAuthFile(link,'bad'));assert.equal(fs.readFileSync(file,'utf8'),'next');
 }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('token error content omitted in every path',()=>{
 const secret='synthetic-quote"backslash\\token';
 for(const [body,ok] of [[secret,false],[JSON.stringify({access_token:secret,error:{nested:secret}}),false],[JSON.stringify({error:secret}),true],['null',true]]) {
 let caught;try{parseOAuthTokenResponse(body,ok);}catch(e){caught=e;}assert.ok(caught);assert.ok(!String(caught).includes(secret));assert.ok(!String(caught).includes('nested'));
 }
 for(const obj of [{access_token:'a\nb'}, {access_token:'ok',refresh_token:'a\rb'}, {access_token:'ok',refresh_token:{}}, {access_token:'ok',expires_in:'3\nINJECT=yes'}]) assert.throws(()=>parseOAuthTokenResponse(JSON.stringify(obj),true),/unsupported/);
 assert.deepEqual(parseOAuthTokenResponse('{"access_token":"synthetic"}',true),{access_token:'synthetic'});
});

test('config token persistence shares private-file policy and rejects line injection',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'config-fixture-'));const file=path.join(dir,'.env');
 try {
 persistEnvValues(file,{TOKEN:'synthetic'});assert.equal(fs.readFileSync(file,'utf8'),'TOKEN=synthetic\n');
 for(const value of ['a\nINJECT=yes',{},Infinity])assert.throws(()=>persistEnvValues(file,{TOKEN:value}),/Unsupported/);
 assert.equal(fs.readFileSync(file,'utf8'),'TOKEN=synthetic\n');
 if(process.platform!=='win32') {fs.chmodSync(file,0o644);assert.throws(()=>persistEnvValues(file,{TOKEN:'replacement'}),/not private/);assert.equal(fs.readFileSync(file,'utf8'),'TOKEN=synthetic\n');}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
