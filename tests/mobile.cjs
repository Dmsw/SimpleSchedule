const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const nodes=new Map(),frames=[];let mockNow=Date.parse('2026-09-22T12:00:00Z');
class Clock extends Date{constructor(...a){super(...(a.length?a:[mockNow]));}static now(){return mockNow;}}
function element(id){if(nodes.has(id))return nodes.get(id);const e={value:({chartMode:'workload',listScope:'visible',sortBy:'deadline',statusFilter:'pending'})[id]||'',innerHTML:'',textContent:'',dataset:{},style:{},hidden:false,handlers:{},classList:{add(){},remove(){},toggle(){}},parentElement:{prepend(){}},getBoundingClientRect(){return{left:900,right:1400,top:50,bottom:900}},addEventListener(k,f){this.handlers[k]=f;},setAttribute(){},querySelectorAll(){return[]},focus(){},showModal(){},close(){},reset(){},getScreenCTM(){return{inverse(){return{}}}},setPointerCapture(){},hasPointerCapture(){return false},replaceChildren(){},append(){}};Object.defineProperty(e,'valueAsNumber',{get(){return this.value===''?NaN:Number(this.value)}});nodes.set(id,e);return e;}
const context={console,Date:Clock,Intl,URL,Math,Map,Set,String,Number,JSON,Error,document:{body:{classList:{toggle(){}}},getElementById:element,activeElement:null,querySelectorAll:()=>[],createElement:()=>element('button'),createTextNode:t=>t},window:{matchMedia:()=>({matches:false,addEventListener(){}}),innerWidth:1500,innerHeight:1000,addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},setInterval(){},setTimeout(){},clearTimeout(){},requestAnimationFrame:f=>(frames.push(f),frames.length),DOMPoint:class{constructor(x,y){this.x=x;this.y=y}matrixTransform(){return this}},confirm:()=>true};vm.createContext(context);
for(const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))vm.runInContext(m[1],context);
const evaluate=code=>vm.runInContext(code,context);function flush(){while(frames.length)frames.shift()();}
evaluate(`tasks=[[-49,3,4],[-48,5,7],[-2,12,8],[0,1,3],[47,9,9],[48,4,2]].map((v,i)=>({id:'t'+i,title:'任务'+i,details:'',category:'科研',importance:v[2],difficulty:i+1,workload:v[1],deadline:new Date(Date.now()-v[0]*HOUR).toISOString(),done:false,detailsMode:'text'}));resetViewport();render();`);
assert.equal(evaluate('viewportTasks(filtered(),Date.now()).length'),4);
assert.equal((element('chart').innerHTML.match(/class="bubble"/g)||[]).length,4);
assert.equal((element('rows').innerHTML.match(/<article/g)||[]).length,4);
assert(element('rows').innerHTML.indexOf('任务4')<element('rows').innerHTML.indexOf('任务1'),'deadline ordering');
element('listScope').value='outside';element('listScope').onchange();assert.equal((element('rows').innerHTML.match(/<article/g)||[]).length,2);
element('listScope').value='all';element('listScope').onchange();assert.equal((element('rows').innerHTML.match(/<article/g)||[]).length,6);assert.equal((element('chart').innerHTML.match(/class="bubble"/g)||[]).length,4);
evaluate(`focusTask('t0')`);assert.equal(element('listScope').value,'visible');assert(evaluate(`insideViewport(tasks[0],Date.now())`));
evaluate('resetViewport()');const width=evaluate('viewport.x[1]-viewport.x[0]');element('zoomIn').onclick();flush();assert(evaluate('viewport.x[1]-viewport.x[0]')<width);
element('xMin').value='-4';element('xMax').value='4';element('yMin').value='0';element('yMax').value='5';element('applyRange').onclick();assert.equal(evaluate('viewportTasks(filtered(),Date.now()).length'),1);assert(element('rows').innerHTML.includes('任务3'));
const saved=evaluate('JSON.stringify(viewport)');element('xMin').value='9';element('xMax').value='1';element('applyRange').onclick();assert.equal(evaluate('JSON.stringify(viewport)'),saved);
element('chartMode').value='original';element('chartMode').onchange();assert.equal(evaluate('JSON.stringify(viewport.y)'), '[-4,4]');assert.equal(evaluate('viewportTasks(filtered(),Date.now()).length'),2);
element('chartMode').value='workload';element('chartMode').onchange();assert.equal(evaluate('JSON.stringify(viewport.x)'), '[-4,4]');
evaluate('resetViewport()');let opened=0;context.openCounter=()=>opened++;evaluate('openEditor=()=>openCounter()');
const svg=element('chart');function pointer(type,id,x,y,bubble=false){svg.handlers[type]({type,pointerId:id,clientX:x,clientY:y,button:0,target:{closest(){return bubble?{dataset:{edit:'t2'}}:null}}});}
pointer('pointerdown',1,400,200,true);pointer('pointerup',1,400,200,true);assert.equal(evaluate('selectedTaskId'),'t2','click selects');assert.equal(opened,0,'click does not edit');
const before=evaluate('viewport.x[0]');pointer('pointerdown',2,400,200,true);pointer('pointermove',2,500,230,true);flush();pointer('pointerup',2,500,230,true);assert.equal(opened,0,'drag must not edit');assert(evaluate('viewport.x[0]')<before,'pan domain');
const prePinch=evaluate('viewport.x[1]-viewport.x[0]');pointer('pointerdown',3,300,200);pointer('pointerdown',4,500,200);pointer('pointermove',4,650,200);flush();pointer('pointerup',4,650,200);pointer('pointerup',3,300,200);assert(evaluate('viewport.x[1]-viewport.x[0]')<prePinch,'pinch zoom');
evaluate('fitAllTasks()');assert.equal(evaluate('viewportTasks(filtered(),Date.now()).length'),6);
element('search').value='任务2';evaluate('render()');assert.equal(evaluate('viewportTasks(filtered(),Date.now()).length'),1);assert.equal((element('rows').innerHTML.match(/<article/g)||[]).length,1);
element('search').value='';evaluate('resetViewport()');mockNow+=2000;evaluate('tick()');assert.equal(evaluate('viewportTasks(filtered(),Date.now()).length'),3);assert.equal((element('chart').innerHTML.match(/class="bubble"/g)||[]).length,3);
evaluate('tasks=[];resetViewport();render()');assert(!element('empty').hidden);assert(!element('chart').innerHTML.includes('NaN'));
console.log('PASS: initialization, inclusive 48h/47h window, graph/list equality, ordering, outside/all scopes, locate, range validation, both modes, zoom, pan, pinch, click-vs-drag, fit-all, search, time-boundary refresh, empty data.');

evaluate(`
const sample=[{id:'a',workload:10,importance:2},{id:'b',workload:20,importance:5},{id:'c',workload:30,importance:8}];
let radii=normalizedRadii(sample,true);
if(radii.get('a')!==8||radii.get('b')!==20||radii.get('c')!==32)throw Error('min-max radius');
radii=normalizedRadii(sample.slice(0,2),true);
if(radii.get('a')!==8||radii.get('b')!==32)throw Error('renormalize on removal');
radii=normalizedRadii(sample,false);
if(radii.get('a')!==8||radii.get('b')!==20||radii.get('c')!==32)throw Error('importance min-max');
if(normalizedRadii([sample[0]],true).get('a')!==20)throw Error('single');
if(normalizedRadii([{...sample[0]},{...sample[0],id:'b'}],true).get('b')!==20)throw Error('equal values');
if(normalizedRadii([],true).size!==0)throw Error('empty');
`);
const geo=(...args)=>context.linkGeometry(...args),plot={left:0,right:800,top:0,bottom:600},list={left:900,right:1400,top:100,bottom:800};
const circle={x:400,y:300,radius:20};
let g=geo(circle,{left:900,right:1400,top:200,bottom:400},list,plot,1500,1000);
assert(g&&g.x1>400&&g.x2===902);
assert.equal(geo(circle,{left:900,right:1400,top:900,bottom:1100},list,plot,1500,1000),null,'scrolled off card');
assert.equal(geo({...circle,x:-5},{left:900,right:1400,top:200,bottom:400},list,plot,1500,1000),null,'offscreen bubble');
g=geo(circle,{left:0,right:800,top:700,bottom:900},{left:0,right:800,top:650,bottom:1000},plot,900,1000);
assert(g&&g.y2===702&&g.x2===400,'stacked layout');
console.log('PASS: visible min-max in both modes, removal normalization, singleton/equal/empty cases, selection, link endpoints, scroll clipping, stacked layout.');
let hit=null;context.document.elementFromPoint=()=>hit;
hit={closest:s=>s==='#chart .bubble'?{dataset:{edit:'t1'}}:null};
evaluate('hoverPointer={x:200,y:200};highlightSelection()');assert.equal(evaluate('selectedTaskId'),'t1','circle hover selects relationship');
hit={closest:s=>s==='#rows [data-task-card]'?{dataset:{taskCard:'t2'}}:null};
evaluate('highlightSelection()');assert.equal(evaluate('selectedTaskId'),'t2','card hover switches relationship');
hit=null;evaluate('highlightSelection()');assert.equal(evaluate('selectedTaskId'),null,'leaving clears highlight');
hit={closest:s=>s==='#rows [data-task-card]'?{dataset:{taskCard:'t3'}}:null};
evaluate('drawLinks()');assert.equal(evaluate('selectedTaskId'),'t3','scroll/redraw refreshes stationary pointer');
evaluate('dragState={};highlightSelection()');assert.equal(evaluate('selectedTaskId'),null,'drag suppresses hover');
console.log('PASS: hover on circles/cards, switching, leaving, redraw/scroll refresh, drag suppression.');
evaluate("dragState=null;linkSegments=[{id:'line-a',x1:100,y1:100,x2:300,y2:100},{id:'line-b',x1:100,y1:120,x2:300,y2:120}]");
assert.equal(evaluate('hoveredLinkAt(200,106,null)'), 'line-a');
assert.equal(evaluate('hoveredLinkAt(200,110,null)'), null);
assert.equal(evaluate('hoveredLinkAt(200,118,null)'), 'line-b');
assert.equal(evaluate('hoveredLinkAt(80,100,null)'), null);
assert.equal(evaluate('hoveredLinkAt(200,100,{closest:()=>true})'),null);
hit=null;evaluate("tasks=[{id:'line-a'}];selectTask('line-a');highlightSelection()");
assert.equal(evaluate('selectedTaskId'),'line-a','click remains selected after mouse leaves');
evaluate('tasks=[];highlightSelection()');assert.equal(evaluate('pinnedTaskId'),null);
console.log('PASS: line hit tolerance, nearest line, endpoint limits, controls excluded, persistent selection and deleted-selection cleanup.');

evaluate("dragState=null;hoverPointer=null;pinnedTaskId=null;mobileQuery.matches=true;tasks=[{id:'mobile',title:'测试日程',details:'**重点**',detailsMode:'markdown',category:'科研',importance:5,difficulty:6,workload:2,deadline:new Date(Date.now()+HOUR).toISOString(),done:false}];resetViewport();updateMobileLayout()");
assert(element('chart').innerHTML.includes('mobile-task-tag'));
assert(element('chart').innerHTML.includes('测试日程'));
const boxes=evaluate("placeMobileTags(Array.from({length:5},(_,i)=>({id:String(i),title:'同一位置任务'+i,cx:150,cy:180,r:20})),{left:68,right:320,top:40,bottom:400})");
for(const b of boxes){assert(b.x>=68&&b.x+b.width<=320);assert(b.y>=40&&b.y+b.height<=400);assert.equal(b.height,44);}
evaluate("openMobileDetail('mobile')");
element('mobileDetailTitle').textContent='';
function mobilePointer(type,id,x,y){svg.handlers[type]({type,pointerId:id,clientX:x,clientY:y,button:0,target:{closest:()=>({dataset:{edit:'mobile'}})}});}
mobilePointer('pointerdown',20,400,200);mobilePointer('pointerup',20,400,200);
assert.equal(element('mobileDetailTitle').textContent,'测试日程','mobile tap opens details');
element('mobileDetailTitle').textContent='';
mobilePointer('pointerdown',21,400,200);mobilePointer('pointermove',21,420,220);mobilePointer('pointerup',21,420,220);
assert.equal(element('mobileDetailTitle').textContent,'','mobile drag must not open details');
evaluate("openMobileDetail('mobile')");assert.equal(element('mobileDetailTitle').textContent,'测试日程');assert(element('mobileDetailBody').innerHTML.includes('<strong>重点</strong>'));
evaluate("drawLinks()");assert.equal(element('taskLinks').innerHTML,'');
element('mobileComplete').onclick();assert.equal(evaluate('tasks[0].done'),true);
evaluate("mobileQuery.matches=false;updateMobileLayout()");assert(!element('chart').innerHTML.includes('mobile-task-tag'));assert.equal(evaluate('chartBox.width'),880);
console.log('PASS: mobile tags, collision placement bounds, details Markdown, completion action, hidden connectors, desktop restoration.');
