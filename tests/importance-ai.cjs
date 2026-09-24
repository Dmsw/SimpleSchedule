const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const code=html.slice(html.indexOf('let importanceController='),html.lastIndexOf('</script>'));
const original=[{id:'a',title:'论文',details:'# 完整细节',category:'研究',importance:2,workload:8,difficulty:5,deadline:'2026-10-01',done:false},{id:'b',title:'已完成',details:'也要评估',importance:4,workload:1,difficulty:1,done:true}];
function setup(reply){
 const nodes={},c={tasks:structuredClone(original),bubbleDrag:null,radiusEdit:null,selectionDrag:null,inlineTagEditor:null,storageBlocked:false,viewport:{x:[-10,10],y:[20,30]},AbortController,setTimeout,clearTimeout,saves:0,render(){},validate(t){assert.equal(t.length,2)},save(){c.saves++},filtered(){return c.tasks.filter(t=>!t.done)},paddedDomain(a,b){return[a-1,b+1]},setViewport(v){c.viewport=v},aiTimeContext(){return '当前日期 2026-09-24'},aiSettings(){return{base:'https://example.test/v1',model:'test',key:'test'}},openAi(){c.opened=true},$(id){return nodes[id]??=( {hidden:true,open:false})},async fetch(url,opts){c.request=JSON.parse(opts.body);return reply?await reply(c):{ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({tasks:[{id:'a',importance:-2.5},{id:'b',importance:7.25}]})}}]})}}};
 vm.createContext(c);vm.runInContext(code,c);return c;
}
(async()=>{
 let c=setup();await c.optimizeAllImportance();
 assert.deepEqual(Array.from(c.tasks,t=>t.importance),[-2.5,7.25]);assert.equal(c.saves,1);
 assert.ok(c.request.messages[1].content.includes('当前日期 2026-09-24'));
 assert.ok(c.request.messages[1].content.includes('# 完整细节'));assert.ok(c.request.messages[1].content.includes('已完成'));
 assert.deepEqual(Array.from(c.viewport.y),[20,30]);
 c.tasks.forEach((t,i)=>assert.deepEqual({...t,importance:original[i].importance},original[i]));
 c.tasks[1].importance=99;c.undoImportanceOptimization();assert.deepEqual(Array.from(c.tasks,t=>t.importance),[2,99]);
 for(const tasks of [[{id:'a',importance:3}],[{id:'a',importance:3},{id:'a',importance:5}],[{id:'a',importance:3},{id:'x',importance:5}],[{id:'a',importance:'3'},{id:'b',importance:5}]]){
 c=setup(async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({tasks})}}]})}));await c.optimizeAllImportance();assert.deepEqual(c.tasks,original);assert.equal(c.saves,0);
 }
 for(const body of [{choices:[{finish_reason:'length',message:{content:'{}'}}]},{choices:[{message:{content:'not json'}}]}]){
 c=setup(async()=>({ok:true,json:async()=>body}));await c.optimizeAllImportance();assert.equal(c.saves,0);
 }
 c=setup(async()=>({ok:false,status:500}));await c.optimizeAllImportance();assert.equal(c.saves,0);
 let release;c=setup(()=>new Promise(r=>release=r));let pending=c.optimizeAllImportance();c.tasks[0].details='新编辑';release({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({tasks:[{id:'a',importance:8},{id:'b',importance:9}]})}}]})});await pending;assert.equal(c.saves,0);assert.equal(c.tasks[0].details,'新编辑');
 c=setup(()=>new Promise(r=>release=r));pending=c.optimizeAllImportance();c.cancelImportanceOptimization();release({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({tasks:[{id:'a',importance:8},{id:'b',importance:9}]})}}]})});await pending;assert.equal(c.saves,0);assert.deepEqual(c.tasks,original);
 c=setup();c.bubbleDrag={};await c.optimizeAllImportance();assert.equal(c.request,undefined);
 c=setup();c.aiSettings=()=>({});await c.optimizeAllImportance();assert.equal(c.opened,true);assert.equal(c.request,undefined);
 console.log('PASS importance AI: full context, atomic validation, signed scores, undo, stale edits, cancel, API errors, date and viewport');
})().catch(e=>{console.error(e);process.exitCode=1});
