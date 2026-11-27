import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function mount() {
 const effects=[], changes=[], listeners=new Map(), timers=[];let interval, pending;
 const cursor={current:'10'};const exports={};let status='current';
 const code=ts.transpileModule(fs.readFileSync('components/use-recovery-live-refresh.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const document={hidden:false,querySelector:()=>null,addEventListener(){},removeEventListener(){}};
 vm.runInNewContext(code,{exports,AbortController,document,encodeURIComponent,setInterval:callback=>{interval=callback;return 1;},clearInterval(){},setTimeout:callback=>{timers.push(callback);return 1;},clearTimeout(){},window:{addEventListener:(name,callback)=>listeners.set(name,callback),removeEventListener:name=>listeners.delete(name)},fetch:()=>new Promise(resolve=>{pending=resolve;}),require:()=>({useEffect:callback=>effects.push(callback),useState:()=>[status,next=>{status=next;}]})});
 exports.useRecoveryLiveRefresh('/api/sheet',data=>changes.push(data),cursor);const cleanup=effects[0]();
 return {cursor,changes,interval,fire:name=>listeners.get(name)?.(),reply:(body,ok=true)=>pending({ok,json:async()=>body}),flush:()=>new Promise(resolve=>setImmediate(resolve)),timers,cleanup,status:()=>status,document};
}
test('an in-flight older response cannot overwrite a successful local edit or advance its cursor',async()=>{
 const app=mount();app.interval();app.fire('recovery-sheet-saved');app.reply({cursor:'11',records:[{id:'same-student',paymentStatus:'unpaid'}]});await app.flush();assert.equal(app.changes.length,0);assert.equal(app.cursor.current,'10');
 app.interval();app.reply({cursor:'12',records:[{id:'same-student',paymentStatus:'paid'}]});await app.flush();assert.equal(app.changes.length,1);assert.equal(app.cursor.current,'12');app.cleanup();
});
test('failed polls retain the cursor and show reconnection until the retry succeeds',async()=>{
 const app=mount();app.interval();app.reply({},false);await app.flush();assert.equal(app.cursor.current,'10');assert.equal(app.status(),'reconnecting');
 app.interval();app.reply({cursor:'11',unchanged:true});await app.flush();assert.equal(app.status(),'current');assert.equal(app.cursor.current,'11');assert.equal(app.changes.length,0);app.cleanup();
});
test('a cursor reset by manual reload rejects the previous in-flight response',async()=>{
 const app=mount();app.interval();app.cursor.current='20';app.reply({cursor:'11',records:[{id:'old'}]});await app.flush();assert.equal(app.cursor.current,'20');assert.equal(app.changes.length,0);app.cleanup();
});
test('hidden tabs do not issue background polls',()=>{
 const app=mount();app.document.hidden=true;app.interval();assert.equal(app.changes.length,0);assert.equal(app.cursor.current,'10');app.cleanup();
});
