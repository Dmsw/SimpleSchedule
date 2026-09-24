const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const code=html.slice(html.indexOf('const editorAIFields='),html.indexOf('initEditorAI();')+'initEditorAI();'.length);
const nodes=new Map(),timers=new Map();let timerID=0,requests=[],response;
function node(id){if(nodes.has(id))return nodes.get(id);const n={value:'',textContent:'',hidden:false,open:id==='editor',style:{},handlers:{},offsetWidth:170,offsetHeight:50,addEventListener(k,f){this.handlers[k]=f},getBoundingClientRect:()=>({left:20,right:400,top:20,bottom:id==='editor'?700:200}),focus(){}};nodes.set(id,n);return n;}
const context={console,URL,AbortController,Date,Math,Number,JSON,Object,String,Set,Error,$:node,window:{innerWidth:430,innerHeight:800,matchMedia:()=>({matches:true}),addEventListener(){}},setTimeout:f=>{timers.set(++timerID,f);return timerID},clearTimeout:id=>timers.delete(id),aiSettings:()=>({base:'https://model.example/v1',model:'test',key:'secret'}),aiTimeContext:()=> '当前日期 2026-09-23；本地时区 UTC',localInput:v=>new Date(v).toISOString().slice(0,16),updateDifficulty(){},detailsMode:'text',setDetailsMode(){},openAi(){},fetch:async(url,options)=>{requests.push({url,options});return response(url,options)}};
vm.createContext(context);vm.runInContext(code,context);const run=s=>vm.runInContext(s,context);
function reset(){run('resetEditorAI()');for(const [k,v] of Object.entries({taskTitle:'写论文',taskDetails:'',taskCategory:'工作',taskWorkload:'1',taskImportance:'5',taskDifficulty:'5',taskDeadline:'2026-09-24T12:00'}))node(k).value=v;node('editor').open=true;}
function model(value){response=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify(value)}}]})});}
async function main(){
 reset();node('editorAIText').value='写论文，预计3小时';model({title:'写论文',workload:3,deadline:null,importance:null});await run('runEditorAI()');
 assert.equal(node('taskWorkload').value,'3');assert.equal(node('taskImportance').value,'5');assert.equal(node('taskDeadline').value,'2026-09-24T12:00');
 const payload=JSON.parse(JSON.parse(requests[0].options.body).messages[1].content.split('\n')[1]);assert(!('deadline' in payload.known));assert(!('workload' in payload.known));assert.equal(payload.known.title,'写论文');
 model({workload:7,title:'不应修改的标题',importance:9});await run("runEditorAI('workload')");assert.equal(node('taskWorkload').value,'7');assert.equal(node('taskTitle').value,'写论文');assert.equal(node('taskImportance').value,'5');
 node('editorAIUndo').onclick();assert.equal(node('taskWorkload').value,'3');
 assert.equal(Object.keys(run('readEditorAIResult(JSON.stringify({deadline:"2027-11-01T12:00:00Z"}),null,"写论文")')).length,0);
 assert.equal(Object.keys(run('readEditorAIResult(JSON.stringify({workload:-1,importance:11,difficulty:2.5}),null,"")')).length,0);
 assert.equal(run('editorAIDate("2027-02-30T12:00:00Z")'),null);
 assert(run('readEditorAIResult(JSON.stringify({deadline:"2027-11-01T12:00:00Z",deadlineEvidence:"11月1日12点"}),null,"11月1日12点").deadline'));
 const before=node('taskWorkload').value;response=async()=>({ok:false,status:401});await run("runEditorAI('workload')");assert.equal(node('taskWorkload').value,before);assert(node('editorAIStatus').textContent.includes('401'));
 let resolve;response=()=>new Promise(r=>resolve=r);const pending=run("runEditorAI('workload')");node('taskTitle').value='新任务';resolve({ok:true,json:async()=>({choices:[{message:{content:'{"workload":9}'}}]})});await pending;assert.equal(node('taskWorkload').value,before);assert(node('editorAIStatus').textContent.includes('已变化'));
 response=()=>new Promise(r=>resolve=r);const cancelled=run("runEditorAI('workload')");run('cancelEditorAI()');resolve({ok:true,json:async()=>({choices:[{message:{content:'{"workload":10}'}}]})});await cancelled;assert.equal(node('taskWorkload').value,before);
 const count=requests.length,input=node('taskWorkload');input.handlers.pointerenter({pointerType:'mouse',buttons:0,clientX:100,clientY:100});assert(node('editorAIPopup').hidden);timers.get(timerID)();assert.equal(node('editorAIPopup').hidden,false);assert.equal(requests.length,count,'hover must not call API');
 run('hideEditorAIPopup()');for(let i=0;i<2;i++){input.handlers.pointerdown({clientX:100,clientY:100});input.handlers.pointerup({pointerType:'touch',clientX:100,clientY:100});}assert.equal(node('editorAIPopup').hidden,false);assert.equal(requests.length,count,'double tap must not call API');
 run('hideEditorAIPopup()');input.handlers.pointerdown({clientX:100,clientY:100});input.handlers.pointerup({pointerType:'touch',clientX:150,clientY:100});assert(node('editorAIPopup').hidden,'drag must not open popup');
 assert(html.includes('id="taskImportance" type="range"'));assert(html.includes('id="taskDifficulty" type="range"'));assert(!html.includes('Tavily'));assert(!html.includes('parseDialog'));console.log('PASS: simple extraction, defaults preserved, single-field completion, undo, date/value validation, API errors, stale/cancelled requests, hover/double tap without API calls, original sliders.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
