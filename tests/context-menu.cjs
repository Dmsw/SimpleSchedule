const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const nodes={};function $(id){return nodes[id]??={hidden:true,disabled:false,style:{},offsetWidth:240,offsetHeight:200,setAttribute(k,v){this[k]=v},focus(){this.focused=true},querySelectorAll(){return ['chartMenuCreate','chartMenuFocus','chartMenuAIAdjust','chartMenuDeleteSelected'].map($)}};}
const c={$,console,Date,Number,tasks:[{id:'edge',importance:100,day:60},{id:'in',importance:0,day:0}],selectedTaskIds:new Set(),selectedTaskId:null,viewport:{x:[-10,10],y:[-5,5]},chartBox:{left:0,right:100,top:0,bottom:100},onPlot:()=>true,axisValue:(d,f)=>d[0]+f*(d[1]-d[0]),numberLabel:String,dayLabel:String,suppressChartClickUntil:0,window:{innerWidth:1200,innerHeight:800},radiusEdit:null,bubbleDrag:null,selectionDrag:null,storageBlocked:false,aiSettings:()=>({base:'x',model:'m',key:'k'}),insideViewport:t=>t.id==='in',filtered:()=>c.tasks,coordinates:t=>[t.importance,t.day],clampImportance:v=>Math.max(-10,Math.min(10,v)),setViewport:v=>c.viewport=v,renderLinked(){},selectTask:id=>c.selected=id};
vm.createContext(c);
vm.runInContext(html.slice(html.indexOf('let chartMenuId='),html.indexOf('let inlineTagEditor=')),c);
vm.runInContext(html.split('\n').find(l=>l.startsWith('function focusTask(id)')),c);
function open(id){c.openChartCreateMenu({x:50,y:50},500,300,id);}
open('edge');assert.equal($('chartMenuConnect').disabled,false);assert.equal($('chartMenuFocus').disabled,false);c.focusTaskAtMenu();assert.deepEqual(Array.from(c.viewport.x),[90,110]);assert.deepEqual(Array.from(c.viewport.y),[55,65]);assert.equal(c.selected,'edge');assert.equal($('chartMenu').hidden,true);
open('in');assert.equal($('chartMenuFocus').disabled,true);
c.selectedTaskIds=new Set(['in']);open('edge');assert.equal(vm.runInContext('chartMenuFocusId',c),'edge');
c.selectedTaskIds=new Set(['in','edge']);open();assert.equal($('chartMenuFocus').disabled,true);assert.equal($('chartMenuAIAdjust').disabled,true);assert.equal($('chartMenuDeleteSelected').disabled,false);
assert.equal($('chartMenuConnect').disabled,true);
c.selectedTaskIds.clear();c.selectedTaskId=null;open();assert.equal($('chartMenuCreate').disabled,false);assert.equal($('chartMenuDeleteSelected').disabled,true);
c.aiSettings=()=>({});open('edge');assert.equal($('chartMenuAIAdjust').disabled,true);assert($('chartMenuAIAdjust').title.includes('接口'));
c.aiSettings=()=>({base:'x',model:'m',key:'k'});vm.runInContext('chartAIAdjustBusy=true',c);open('edge');assert.equal($('chartMenuAIAdjust').disabled,true);vm.runInContext('chartAIAdjustBusy=false',c);
c.storageBlocked=true;open('edge');assert.equal($('chartMenuCreate').disabled,true);assert.equal($('chartMenuDeleteSelected').disabled,true);assert.equal($('chartMenuFocus').disabled,false);
c.storageBlocked=false;c.tasks=[];c.updateChartMenuAvailability();assert.equal($('chartMenuFocus').disabled,true);
assert(html.includes("e.clientY,e.target.closest('[data-edit]')?.dataset.edit)"));assert(html.includes('x,y,bubble.dataset.edit)'));
console.log('PASS menu focus preserves zoom, direct tag targeting, multi/empty selection, settings/busy/storage/deleted target conditions, touch/keyboard wiring');
