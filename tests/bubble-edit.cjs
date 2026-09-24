const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const nodes=new Map(),frames=[],timers=new Map();let timerSeq=0;let mockNow=Date.parse('2026-09-22T12:00:00Z');
class Clock extends Date{constructor(...a){super(...(a.length?a:[mockNow]));}static now(){return mockNow;}}
function element(id){if(nodes.has(id))return nodes.get(id);const e={value:({chartMode:'workload',listScope:'visible',sortBy:'deadline',statusFilter:'pending'})[id]||'',innerHTML:'',textContent:'',dataset:{},style:{},hidden:id==='chartMenu',offsetWidth:190,offsetHeight:80,handlers:{},classList:{add(){},remove(){},toggle(){}},parentElement:{prepend(){}},getBoundingClientRect(){return{left:900,right:1400,top:50,bottom:900}},addEventListener(k,f){this.handlers[k]=f;},setAttribute(){},querySelectorAll(){return[]},focus(){},showModal(){},close(){},reset(){},getScreenCTM(){return{inverse(){return{}}}},setPointerCapture(){},hasPointerCapture(){return false},replaceChildren(){},append(){}};Object.defineProperty(e,'valueAsNumber',{get(){return this.value===''?NaN:Number(this.value)}});nodes.set(id,e);return e;}
const context={console,Date:Clock,Intl,URL,Math,Map,Set,String,Number,JSON,Error,document:{body:{classList:{toggle(){}}},getElementById:element,activeElement:null,querySelectorAll:()=>[],createElement:()=>element('button'),createTextNode:t=>t},window:{matchMedia:()=>({matches:false,addEventListener(){}}),innerWidth:1500,innerHeight:1000,addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},setInterval(){},setTimeout(fn,ms){const id=++timerSeq;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id)},requestAnimationFrame:f=>(frames.push(f),frames.length),DOMPoint:class{constructor(x,y){this.x=x;this.y=y}matrixTransform(){return this}},confirm:()=>true};vm.createContext(context);
for(const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))vm.runInContext(m[1],context);
const evaluate=code=>vm.runInContext(code,context);function flush(){while(frames.length)frames.shift()();}



evaluate("tasks=[{id:'drag',title:'可拖动任务',category:'工作',details:'',detailsMode:'text',importance:0,urgency:0,difficulty:5,workload:10,deadline:new Date(Date.now()+HOUR).toISOString(),done:false}];resetViewport();render()");
const svg=element('chart'),cx=evaluate('(chartBox.left+chartBox.right)/2'),cy=evaluate('(chartBox.top+chartBox.bottom)/2');
let saves=0;context.recordSave=()=>saves++;evaluate('save=()=>recordSave()');
const circle={dataset:{edit:'drag'},style:{},getAttribute:k=>({cx,cy,r:20})[k]};
function evt(type,x,y,opts={}){return {type,pointerType:'mouse',pointerId:20,clientX:x,clientY:y,button:0,target:{closest:s=>s==='.bubble'||s==='[data-edit]'?circle:null},...opts};}
svg.handlers.pointermove(evt('pointermove',cx,cy));
assert.equal(circle.style.cursor,'grab');
svg.handlers.pointermove(evt('pointermove',cx+19,cy));assert.equal(circle.style.cursor,'ew-resize');
svg.handlers.pointermove(evt('pointermove',cx,cy+19));assert.equal(circle.style.cursor,'ns-resize');
const initialView=evaluate('JSON.stringify(viewport)');
svg.handlers.pointerdown(evt('pointerdown',cx,cy));
assert(evaluate('!!bubbleDrag&&!bubbleDrag.resize'));assert.equal(evaluate('activePointers.size'),0);
svg.handlers.pointermove(evt('pointermove',cx+72.8,cy-38.2));flush();
assert.equal(evaluate('tasks[0].importance'),0,'preview must not mutate stored task');
assert.equal(evaluate('JSON.stringify(viewport)'),initialView,'circle move must not pan');
assert(Math.abs(evaluate('bubbleDrag.preview.importance')-2)<1e-9);
assert(Math.abs(evaluate('bubbleDrag.preview.urgency')-2)<1e-9);
assert.equal(saves,0);
svg.handlers.pointerup(evt('pointerup',cx+72.8,cy-38.2));
assert(Math.abs(evaluate('tasks[0].importance')-2)<1e-9);assert.equal(saves,1);
evaluate('tasks[0].importance=0;tasks[0].urgency=0;render()');
svg.handlers.pointerdown(evt('pointerdown',cx+19,cy));assert(evaluate('bubbleDrag.resize'));
svg.handlers.pointermove(evt('pointermove',cx+39,cy));flush();
assert.equal(evaluate('bubbleDrag.preview.workload'),40);assert.equal(evaluate('taskRadii(tasks,true).get("drag")'),40);
assert.equal(evaluate('tasks[0].workload'),10);
svg.handlers.pointerup(evt('pointerup',cx+39,cy));assert.equal(evaluate('tasks[0].workload'),40);assert.equal(saves,2);
svg.handlers.pointerdown(evt('pointerdown',cx,cy));svg.handlers.pointermove(evt('pointermove',cx-100,cy));
svg.handlers.pointercancel(evt('pointercancel',cx-100,cy));assert.equal(evaluate('tasks[0].importance'),0);assert.equal(saves,2);
svg.handlers.pointerdown(evt('pointerdown',cx+19,cy));svg.handlers.pointermove(evt('pointermove',cx+80,cy));evaluate('finishBubbleDrag(false)');assert.equal(evaluate('tasks[0].workload'),40);
svg.handlers.pointerdown(evt('pointerdown',cx,cy));svg.handlers.pointermove(evt('pointermove',cx+100,cy));evaluate('tasks[0].importance=9');
svg.handlers.pointerup(evt('pointerup',cx+100,cy));assert.equal(evaluate('tasks[0].importance'),9);assert.equal(saves,2,'concurrent change is preserved');
element('mobileDetailTitle').textContent='';svg.handlers.pointerdown(evt('pointerdown',cx,cy));svg.handlers.pointerup(evt('pointerup',cx,cy));assert.equal(element('mobileDetailTitle').textContent,'可拖动任务');assert.equal(saves,2);
evaluate('mobileQuery.matches=true;updateMobileLayout()');assert.equal(context.desktopBubbleHit(evt('pointerdown',cx,cy)),null);
evaluate('mobileQuery.matches=false;updateMobileLayout()');assert.equal(context.desktopBubbleHit(evt('pointerdown',cx,cy,{pointerType:'touch'})),null);
console.log('PASS: interior/edge cursors, moving coordinates without panning, preview-only changes, resize workload, commit/cancel, concurrent changes, click details and touch exclusion.');

evaluate("tasks=[{id:'fixed',title:'fixed',importance:0,urgency:0,workload:10},{id:'other',title:'other',importance:1000,urgency:1000,workload:1000}];bubbleDrag=null;");
assert.equal(evaluate('taskRadii(tasks).get("fixed")'),20);
assert.equal(evaluate('taskRadii(tasks.slice(0,1)).get("fixed")'),20);
evaluate('tasks[1].workload=100000');
assert.equal(evaluate('taskRadii(tasks).get("fixed")'),20);
assert.equal(evaluate('workloadRadius(40)'),40);
assert.equal(evaluate('workloadRadius(.1)'),2);
console.log('PASS: fixed radius independent of visible set, other workloads and singleton; stable workload/radius mapping.');
