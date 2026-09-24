const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const nodes=new Map(),frames=[],timers=new Map();let timerSeq=0;let mockNow=Date.parse('2026-09-22T12:00:00Z');
class Clock extends Date{constructor(...a){super(...(a.length?a:[mockNow]));}static now(){return mockNow;}}
function element(id){if(nodes.has(id))return nodes.get(id);const e={value:({chartMode:'workload',listScope:'visible',sortBy:'deadline',statusFilter:'pending'})[id]||'',innerHTML:'',textContent:'',dataset:{},style:{},hidden:id==='chartMenu',offsetWidth:190,offsetHeight:80,handlers:{},classList:{add(){},remove(){},toggle(){}},parentElement:{prepend(){}},getBoundingClientRect(){return{left:900,right:1400,top:50,bottom:900}},addEventListener(k,f){this.handlers[k]=f;},setAttribute(){},querySelectorAll(){return[]},focus(){},showModal(){},close(){},reset(){},getScreenCTM(){return{inverse(){return{}}}},setPointerCapture(){},hasPointerCapture(){return false},replaceChildren(){},append(){}};Object.defineProperty(e,'valueAsNumber',{get(){return this.value===''?NaN:Number(this.value)}});nodes.set(id,e);return e;}
const context={console,Date:Clock,Intl,URL,Math,Map,Set,String,Number,JSON,Error,document:{body:{classList:{toggle(){}}},getElementById:element,activeElement:null,querySelectorAll:()=>[],createElement:()=>element('button'),createTextNode:t=>t},window:{matchMedia:()=>({matches:false,addEventListener(){}}),innerWidth:1500,innerHeight:1000,addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},setInterval(){},setTimeout(fn,ms){const id=++timerSeq;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id)},requestAnimationFrame:f=>(frames.push(f),frames.length),DOMPoint:class{constructor(x,y){this.x=x;this.y=y}matrixTransform(){return this}},confirm:()=>true};vm.createContext(context);
for(const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))vm.runInContext(m[1],context);
const evaluate=code=>vm.runInContext(code,context);function flush(){while(frames.length)frames.shift()();}


assert(html.includes('id="taskImportance" type="number" step="any"'));
assert(html.includes('id="taskUrgency" type="number" step="any"'));
assert(!html.includes('重置 48h'));assert(!html.includes('id="chartMenuEdit"'));
evaluate("tasks=[{id:'a',title:'近期任务',category:'科研',details:'**重点**',detailsMode:'markdown',importance:-3.75,urgency:2.5,difficulty:6,workload:2,deadline:new Date(Date.now()+HOUR).toISOString(),done:false},{id:'b',title:'远期任务',category:'工作',details:'',detailsMode:'text',importance:10000.125,urgency:-2000.75,difficulty:3,workload:8,deadline:new Date(Date.now()+100*HOUR).toISOString(),done:false}];resetViewport();render()");
assert.equal(evaluate('viewportTasks(filtered(),Date.now()).length'),1);
assert.equal((element('chart').innerHTML.match(/class="mobile-task-tag"/g)||[]).length,1);
assert.equal(element('rows').innerHTML,'');
assert.equal(element('pending').textContent,2);assert.equal(element('hours').textContent,10);
assert.equal(evaluate('JSON.stringify(coordinates(tasks[0],Date.now()))'),'[-3.75,2.5]');
mockNow+=200*3600000;evaluate('tick()');assert.equal(evaluate('JSON.stringify(coordinates(tasks[0],Date.now()))'),'[-3.75,2.5]');
assert.equal(evaluate('validate(tasks)[0].urgency'),2.5);
assert.equal(evaluate('unpack({app:"FocusSchedule",version:4,tasks})[0].importance'),-3.75);
assert.equal(evaluate('unpack({app:"FocusSchedule",version:2,tasks})[0].urgency'),0);
assert.equal(evaluate('unpack({app:"FocusSchedule",version:1,tasks})[0].difficulty'),5);
assert.throws(()=>evaluate('validate([{...tasks[0],urgency:Infinity}])'));
assert.throws(()=>evaluate('validate([{...tasks[0],importance:NaN}])'));
evaluate("openEditor('a')");assert.equal(element('taskImportance').value,-3.75);assert.equal(element('taskUrgency').value,2.5);
evaluate('tasks[0].importance=0;tasks[0].urgency=0;openEditor("a")');assert.equal(element('taskImportance').value,0);assert.equal(element('taskUrgency').value,0);
evaluate('fitAllTasks()');assert.equal(evaluate('viewportTasks(filtered(),Date.now()).length'),2);
evaluate('setViewport({x:[-1e12,1e12],y:[-1e9,1e9]})');assert.equal(evaluate('viewport.x[1]'),1e12);
evaluate('setViewport({x:[-1e-9,1e-9],y:[-1e-12,1e-12]});renderLinked()');assert(!element('chart').innerHTML.includes('NaN'));
evaluate('resetViewport()');
const svg=element('chart'),p={x:310.4,y:189.25};
svg.oncontextmenu({preventDefault(){},clientX:p.x,clientY:p.y});assert(!element('chartMenu').hidden);
assert(Math.abs(evaluate('chartCreatePoint.importance')+4)<1e-9);
const storedPoint=evaluate('({...chartCreatePoint})');
element('chartMenuCreate').onclick();
assert.equal(evaluate('tasks.length'),2,'menu creates unsaved form only');
assert.equal(Number(element('taskImportance').value),storedPoint.importance);
assert.equal(Number(element('taskUrgency').value),storedPoint.urgency);
assert(evaluate("editorAITouched.has('importance')&&editorAITouched.has('urgency')"));
element('taskTitle').value='地图创建';element('taskForm').onsubmit({preventDefault(){}});
assert.equal(evaluate('tasks.length'),3);assert.equal(evaluate('tasks[2].urgency'),storedPoint.urgency);
evaluate('setViewport({x:[-50.5,-10.25],y:[10.75,20.125]})');
const center=evaluate('mapCoordinateAt({x:(chartBox.left+chartBox.right)/2,y:(chartBox.top+chartBox.bottom)/2})');
assert.equal(center.importance,-30.375);assert.equal(center.urgency,15.4375);
assert.equal(evaluate('mapCoordinateAt({x:0,y:0})'),null);
evaluate('resetViewport()');
function pointer(type,id,x=400,y=200,target='a'){svg.handlers[type]({type,pointerId:id,pointerType:'touch',clientX:x,clientY:y,button:0,target:{closest:()=>target?{dataset:{edit:target}}:null}});}
const holdCount=()=>[...timers.values()].filter(t=>t.ms===550).length;
function fireHold(){const entry=[...timers].find(([id,t])=>t.ms===550);assert(entry,'long-press timer armed');timers.delete(entry[0]);entry[1].fn();}
element('mobileDetailTitle').textContent='';
pointer('pointerdown',1);fireHold();assert(!element('chartMenu').hidden);
const held=evaluate('({...chartCreatePoint})');
pointer('pointerup',1);assert.equal(element('mobileDetailTitle').textContent,'');
assert.equal(evaluate('chartCreatePoint.importance'),held.importance);
evaluate('closeChartMenu()');
pointer('pointerdown',2);pointer('pointermove',2,430,230);assert.equal(holdCount(),0);pointer('pointerup',2,430,230);flush();assert(element('chartMenu').hidden);
pointer('pointerdown',3);pointer('pointerdown',4,500,200);assert.equal(holdCount(),0);pointer('pointermove',4,550,200);pointer('pointerup',4,550,200);pointer('pointerup',3);flush();assert(element('chartMenu').hidden);
pointer('pointerdown',5);pointer('pointercancel',5);assert.equal(holdCount(),0);
evaluate('resetViewport()');pointer('pointerdown',6);pointer('pointerup',6);assert.equal(element('mobileDetailTitle').textContent,'近期任务');
evaluate('mobileQuery.matches=true;updateMobileLayout()');assert(evaluate('isOriginal()'));evaluate('mobileQuery.matches=false;updateMobileLayout()');
evaluate('tasks=[{...tasks[0],importance:1e308,urgency:-1e308},{...tasks[0],id:"extreme",importance:-1e308,urgency:1e308}];fitAllTasks()');assert.equal(evaluate('viewportTasks(filtered(),Date.now()).length'),2);assert(!element('chart').innerHTML.includes('NaN'));assert(!element('chart').innerHTML.includes('Infinity'));
evaluate('tasks=[];render()');assert(element('chart').innerHTML.includes('此范围内暂无任务'));
console.log('PASS: signed floats, independent urgency, migration, save/restore, zero and extreme coordinates, right-click creation, long press, no accidental creation on pan/pinch/cancel, mobile and desktop.');
