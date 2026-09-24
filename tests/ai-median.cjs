const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const code=html.slice(html.indexOf('const editorAIFields='),html.indexOf('function initEditorAI(){'));
function setup(values=[1,3,5,7,9]){
 const nodes={},c={AbortController,setTimeout,clearTimeout,console,tasks:values.map((v,i)=>({id:String(i),title:'任务'+i,details:'完整细节'+i,importance:v,workload:v,done:i===0})),logs:[],window:{},detailsMode:'text',updateDifficulty(){},setDetailsMode(){},localInput:v=>v,aiTimeContext:()=> '当前日期 2026-09-24',aiSettings:()=>({base:'https://example.test/v1',model:'test',key:'test'}),$(id){return nodes[id]??={value:'',hidden:false,open:id==='editor'};}};
 c.console={groupCollapsed:label=>c.logs.push(label),log:value=>c.logs.push(value),table:rows=>c.logs.push(rows),groupEnd(){}};
 vm.createContext(c);vm.runInContext(code,c);
 c.$('taskTitle').value='当前日程';c.$('taskImportance').value='0';c.$('taskWorkload').value='1';
 c.responses=[];c.requests=[];c.fetch=async(u,o)=>{c.requests.push(JSON.parse(o.body));const reply=c.responses.shift();if(reply instanceof Error)throw reply;return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(reply)}}]})};};
 return c;
}
(async()=>{
 let c=setup(),seen=[];
 let value=await c.estimateEditorAIByMedian('importance',{},c.tasks,async(f,t,r)=>{seen.push(r.importance);return 6>r.importance?'greater':'less'});
 assert.deepEqual(seen,[5,9,7]);assert.equal(value,6);assert(c.logs.some(x=>typeof x==='string'&&x.includes('最终估计')));assert(c.logs.some(x=>Array.isArray(x)&&x.length===5));
 seen=[];value=await c.estimateEditorAIByMedian('workload',{},c.tasks,async(f,t,r)=>{seen.push(r.workload);return 'less'});assert.deepEqual(seen,[5,3,1]);assert.equal(value,.9);
 value=await c.estimateEditorAIByMedian('importance',{},c.tasks,async()=> 'greater');assert.equal(value,10);
 value=await c.estimateEditorAIByMedian('importance',{},c.tasks,async()=> 'equal');assert.equal(value,5);
 value=await c.estimateEditorAIByMedian('importance',{},c.tasks,async()=> 'unknown');assert.equal(value,null);
 let rounds=0;value=await c.estimateEditorAIByMedian('importance',{},[{importance:2},{importance:2},{importance:2}],async()=>{rounds++;return 'greater'});assert.equal(rounds,1);assert.equal(value,3);
 value=await c.estimateEditorAIByMedian('importance',{},[],()=>assert.fail('no reference'));assert.equal(value,null);
 assert.equal(c.editorAIRankValue('importance',-4,-2),-3);
 assert.equal(c.editorAIRankValue('workload',100000,null),null);
 await assert.rejects(c.estimateEditorAIByMedian('importance',{},c.tasks,async()=> 'invalid'));
 c.responses=[{relation:'greater'},{relation:'less'},{relation:'less'}];await c.runEditorAI('importance');assert.equal(c.$('taskImportance').value,'6');assert.equal(c.$('taskWorkload').value,'1');assert.equal(c.requests.length,3);
 const context=JSON.parse(c.requests[0].messages[1].content.split('\n')[1]);assert.equal(context.reference.details,'完整细节2');assert(c.requests[0].messages[1].content.includes('2026-09-24'));
 c=setup([2]);c.$('taskId').value='0';await c.runEditorAI('importance');assert.equal(c.requests.length,0);assert.equal(c.$('taskImportance').value,'0');
 c=setup();c.$('editorAIText').value='研究新任务';c.responses=[{title:'解析的日程',importance:999,workload:999,difficulty:7},{relation:'equal'},{relation:'equal'}];await c.runEditorAI();assert.equal(c.$('taskTitle').value,'解析的日程');assert.equal(c.$('taskImportance').value,'5');assert.equal(c.$('taskWorkload').value,'5');assert.equal(c.$('taskDifficulty').value,'7');
 c=setup();c.responses=[{relation:'greater'},new Error('network')];await c.runEditorAI('importance');assert.equal(c.$('taskImportance').value,'0');
 c=setup();let resolve;c.fetch=()=>new Promise(r=>resolve=r);let pending=c.runEditorAI('importance');c.tasks[0].importance=100;resolve({ok:true,json:async()=>({choices:[{message:{content:'{"relation":"equal"}'}}]})});await pending;assert.equal(c.$('taskImportance').value,'0');assert(c.$('editorAIStatus').textContent.includes('已变化'));
 c=setup();c.fetch=()=>new Promise(r=>resolve=r);pending=c.runEditorAI('importance');c.cancelEditorAI();resolve({ok:true,json:async()=>({choices:[{message:{content:'{"relation":"equal"}'}}]})});await pending;assert.equal(c.$('taskImportance').value,'0');
 c=setup();c.responses=[{details:'新的细节'}];await c.runEditorAI('details');assert.equal(c.$('taskDetails').value,'新的细节');assert.equal(c.requests.length,1);
 c=setup();c.responses=[{relation:'unknown'},{relation:'equal'}];await c.runEditorAI('importance');assert.equal(c.requests.length,2);assert.equal(c.$('taskImportance').value,'7');
 c=setup([1]);c.responses=[{relation:'equal'}];await c.runEditorAI('workload');assert(c.$('editorAIStatus').textContent.includes('与当前值相同'));
 c=setup([]);await c.runEditorAI('importance');assert(c.$('editorAIStatus').textContent.includes('没有其他有效参照'));
 c=setup([1,2]);c.responses=[{relation:'unknown'},{relation:'unknown'}];await c.runEditorAI('importance');assert.equal(c.requests.length,2);assert(c.$('editorAIStatus').textContent.includes('模型无法比较'));
 c=setup([1]);c.$('taskTitle').value='';c.$('editorAIText').value='写论文实验部分';c.responses=[{relation:'equal'}];await c.runEditorAI('importance');assert(c.requests[0].messages[1].content.includes('写论文实验部分'));assert.equal(c.$('taskImportance').value,'1');
 console.log('PASS median search, both attributes, ties, duplicates, signed values, boundaries, self exclusion, parse/completion integration, failures, stale data, cancellation, other fields');
})().catch(e=>{console.error(e);process.exitCode=1});
