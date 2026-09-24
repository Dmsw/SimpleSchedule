const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const nodes=new Map(),frames=[];let mockNow=Date.parse('2026-09-22T12:00:00Z');
class Clock extends Date{constructor(...a){super(...(a.length?a:[mockNow]));}static now(){return mockNow;}}
function element(id){if(nodes.has(id))return nodes.get(id);const e={value:({chartMode:'workload',listScope:'visible',sortBy:'deadline',statusFilter:'pending'})[id]||'',innerHTML:'',textContent:'',dataset:{},style:{},hidden:false,handlers:{},classList:{add(){},remove(){},toggle(){}},parentElement:{prepend(){}},getBoundingClientRect(){return{left:900,right:1400,top:50,bottom:900}},addEventListener(k,f){this.handlers[k]=f;},setAttribute(){},querySelectorAll(){return[]},focus(){},showModal(){},close(){},reset(){},getScreenCTM(){return{inverse(){return{}}}},setPointerCapture(){},hasPointerCapture(){return false},replaceChildren(){},append(){}};Object.defineProperty(e,'valueAsNumber',{get(){return this.value===''?NaN:Number(this.value)}});nodes.set(id,e);return e;}
const context={console,Date:Clock,Intl,URL,Math,Map,Set,String,Number,JSON,Error,document:{body:{classList:{toggle(){}}},getElementById:element,activeElement:null,querySelectorAll:()=>[],createElement:()=>element('button'),createTextNode:t=>t},window:{matchMedia:()=>({matches:false,addEventListener(){}}),innerWidth:1500,innerHeight:1000,addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},setInterval(){},setTimeout(){},clearTimeout(){},requestAnimationFrame:f=>(frames.push(f),frames.length),DOMPoint:class{constructor(x,y){this.x=x;this.y=y}matrixTransform(){return this}},confirm:()=>true};vm.createContext(context);
for(const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))vm.runInContext(m[1],context);
const evaluate=code=>vm.runInContext(code,context);function flush(){while(frames.length)frames.shift()();}

assert(/<details id="scheduleStats"><summary>日程统计/.test(html));
assert(!/<details id="scheduleStats"[^>]*\bopen\b/.test(html));
assert(html.includes('id="listView" hidden'));
assert(!html.includes('id="chartMode"'));
assert(!html.includes('body.mobile-mode .stats,'));
evaluate("tasks=[{id:'a',title:'近期任务',category:'科研',details:'**重点**',detailsMode:'markdown',importance:5,difficulty:6,workload:2,deadline:new Date(Date.now()+HOUR).toISOString(),done:false},{id:'b',title:'远期任务',category:'工作',details:'',detailsMode:'text',importance:8,difficulty:3,workload:8,deadline:new Date(Date.now()+100*HOUR).toISOString(),done:false}];resetViewport();render()");
assert(evaluate('isOriginal()'));assert.equal(evaluate('viewportTasks(filtered(),Date.now()).length'),1);
assert.equal((element('chart').innerHTML.match(/class="mobile-task-tag"/g)||[]).length,1);
assert.equal(element('rows').innerHTML,'');
assert.equal(element('pending').textContent,2);assert.equal(element('hours').textContent,10);
const svg=element('chart');
function pointer(type,id,x,y){svg.handlers[type]({type,pointerId:id,clientX:x,clientY:y,button:0,target:{closest:()=>({dataset:{edit:'a'}})}});}
pointer('pointerdown',1,400,200);pointer('pointerup',1,400,200);assert.equal(element('mobileDetailTitle').textContent,'近期任务');assert(element('mobileDetailBody').innerHTML.includes('<strong>重点</strong>'));
element('mobileDetailTitle').textContent='';pointer('pointerdown',2,400,200);pointer('pointermove',2,450,230);pointer('pointerup',2,450,230);assert.equal(element('mobileDetailTitle').textContent,'');flush();
evaluate('fitAllTasks()');assert.equal(evaluate('viewportTasks(filtered(),Date.now()).length'),2);
const width=evaluate('viewport.x[1]-viewport.x[0]');element('zoomIn').onclick();flush();assert(evaluate('viewport.x[1]-viewport.x[0]')<width);
evaluate("openMobileDetail('a')");element('mobileComplete').onclick();assert(evaluate('tasks[0].done'));
evaluate('mobileQuery.matches=true;updateMobileLayout();fitAllTasks()');assert(element('chart').innerHTML.includes('mobile-task-tag'));assert(evaluate('isOriginal()'));evaluate('mobileQuery.matches=false;updateMobileLayout()');assert(element('chart').innerHTML.includes('mobile-task-tag'));
evaluate('drawLinks()');assert.equal(element('taskLinks').innerHTML,'');
evaluate("tasks=[];render()");assert(!element('chart').innerHTML.includes('NaN'));assert(element('chart').innerHTML.includes('此范围内暂无任务'));
console.log('PASS: collapsed statistics, map-only desktop/mobile, original axes, title tags, details/complete, drag-versus-tap, zoom/fit-all, empty state.');
