const assert=require('node:assert/strict');
const Sync=require('../assets/sync.js');
function setup(){
 const data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 let remote={revision:0,tasks:[]},puts=0;
 const c=new Sync({id:'alice'},{storage,request:async(path,method,body)=>{
  if(path==='session')return {user:{id:'alice'},csrf:'token'};
  if(method==='GET')return structuredClone(remote);
  if(body.revision!==remote.revision){const error=Error();error.status=409;throw error;}
  puts++;remote={revision:remote.revision+1,tasks:structuredClone(body.tasks)};return {revision:remote.revision};
 }});
 c.hooks={busy:()=>false,blocked:()=>false,validate:()=>{},apply:tasks=>{c.applied=tasks},status:message=>{c.status=message}};
 c.write([],0,false);c.viewTasks=[];
 return {c,get remote(){return remote},set remote(v){remote=v},get puts(){return puts}};
}
async function run(){
 let x=setup(),c=x.c;c.persist({tasks:[{id:'a',title:'A'}]});clearTimeout(c.timer);
 await c.flush();assert.equal(x.puts,1);assert.equal(c.read()._sync.dirty,false);
 x.remote={revision:2,tasks:[{title:'B',id:'a'}]};await c.flush();assert.equal(c.applied[0].title,'B');
 c.persist({tasks:[]});clearTimeout(c.timer);await c.flush();assert.deepEqual(x.remote.tasks,[],'deletion uploaded');
 // A dirty device must not overwrite a newer server snapshot.
 c.persist({tasks:[{id:'local'}]});clearTimeout(c.timer);x.remote={revision:4,tasks:[{id:'remote'}]};await c.flush();
 assert(c.conflict);assert.deepEqual(x.remote.tasks,[{id:'remote'}]);
 let backup;await c.resolve(false,(a,b)=>{backup=[a,b]});assert.deepEqual(backup,[[{id:'local'}],[{id:'remote'}]]);assert.equal(c.read()._sync.dirty,false);
 // Editing prevents remote repaint; retry when editing ends.
 x.remote={revision:5,tasks:[]};c.hooks.busy=()=>true;await c.flush();assert.equal(c.read()._sync.revision,4);
 c.hooks.busy=()=>false;await c.flush();assert.equal(c.read()._sync.revision,5);
 // An edit made during upload remains dirty at the new server revision.
 x=setup();c=x.c;const request=c.request;
 c.persist({tasks:[{id:'a',title:'before'}]});clearTimeout(c.timer);
 c.request=async(...args)=>{if(args[1]==='PUT'){c.persist({tasks:[{id:'a',title:'during'}]});clearTimeout(c.timer);}return request(...args)};
 await c.flush();assert.equal(c.read().tasks[0].title,'during');assert.equal(c.read()._sync.revision,1);assert(c.read()._sync.dirty);
 c.request=request;await c.flush();assert.equal(x.remote.tasks[0].title,'during');
 // Retrying a lost response recognizes identical content despite object key order.
 c.write([{title:'during',id:'a'}],1,true);await c.flush();assert.equal(c.read()._sync.dirty,false);
 // Offline failures keep pending changes. Another account never receives them.
 c.persist({tasks:[]});clearTimeout(c.timer);c.request=async()=>{throw Error('offline')};await c.flush();assert(c.read()._sync.dirty);
 c.request=async()=>({user:{id:'bob'}});await c.flush();assert(c.status.includes('登录失效'));assert(c.read()._sync.dirty);
 // Local tab conflicts: merge unrelated tasks; reject concurrent edits of same task.
 x=setup();c=x.c;c.write([{id:'a',title:'old'}],0,false);c.viewTasks=[{id:'a',title:'old'}];
 c.write([{id:'a',title:'old'},{id:'b',title:'other tab'}],0,true);
 c.persist({tasks:[{id:'a',title:'edited'}]});clearTimeout(c.timer);assert.equal(c.read().tasks.length,2);
 c.write([{id:'a',title:'concurrent'}],0,true);assert.throws(()=>c.persist({tasks:[{id:'a',title:'mine'}]}),/另一窗口/);
 console.log('PASS uploads, downloads, deletion, conflict resolution, editing guard, in-flight edits, retry, offline, account isolation and local tab conflicts');
}
run().catch(error=>{console.error(error);process.exitCode=1});
