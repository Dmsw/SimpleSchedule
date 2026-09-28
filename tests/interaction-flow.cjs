const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),path=require('path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function setup(){
 const nodes={},tags=new Map();
 const make=id=>({id,value:'',hidden:true,disabled:false,style:{},handlers:{},dataset:{},isConnected:true,focus(){c.focused=this},select(){},getBoundingClientRect:()=>({left:10,top:20,width:100,height:44}),querySelector(){return null},addEventListener(k,f){this.handlers[k]=f},remove(){this.isConnected=false},closest(){return null}});
 const $=id=>nodes[id]??=make(id);
 const c={console,Date,Math,Map,Set,tasks:[{id:'a',title:'A'},{id:'b',title:'B'}],selectedTaskIds:new Set(),selectedTaskId:null,pinnedTaskId:null,hoverPointer:null,storageBlocked:false,radiusEdit:null,bubbleDrag:null,selectionDrag:null,chartMenuDeleteIds:[],chartCreatePoint:{importance:1,day:1},$: $,window:{addEventListener(){},removeEventListener(){}},document:{querySelector:()=>c.modal?{}:null,createElement:()=>{const input=make('inline');input.closest=sel=>sel.includes('input')?input:null;return input},body:{append(input){c.input=input}}},filtered:()=>c.tasks.filter(t=>!$('search').value||t.title.includes($('search').value)),insideViewport:()=>true,focusTask(){},setSelectedTasks(ids){c.selectedTaskIds=new Set(ids)},render(){c.renders++},renders:0,save(){c.saves++},saves:0,notify(m,undo){c.notice=m;c.undo=undo},confirm(){c.confirms++;return c.confirmed},confirmed:true,confirms:0,closeChartMenu(){ $('chartMenu').hidden=true},highlightSelection(){},requestLinks(){},updateChartMenuAvailability(){},uid:()=> 'new',newDeadlineOnDay:()=> '2026-10-01T00:00:00Z',DAY:86400000,detailsMode:'text',validate(){},};
 $('chart').querySelectorAll=()=>c.filtered().map(t=>{if(!tags.has(t.id)){const tag=make('tag-'+t.id);tag.dataset.edit=t.id;tags.set(t.id,tag);}return tags.get(t.id)});
 vm.createContext(c);
 vm.runInContext(html.slice(html.indexOf('function taskTagElement'),html.indexOf('function deleteTask(id)')),c);
 c.key=(key,target={},extra={})=>{const e={key,target,preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...extra};c.handleMapShortcut(e);return e;};
 return c;
}
let c=setup();c.selectedTaskIds=new Set(['a','b']);let e=c.key('Delete');assert(e.prevented);assert.equal(c.tasks.length,0);assert.equal(c.confirms,1);c.undo();assert.equal(c.tasks.length,2);assert.equal(c.selectedTaskIds.size,2);
c=setup();c.confirmed=false;c.selectedTaskIds.add('a');c.key('Delete');assert.equal(c.tasks.length,2);assert.equal(c.saves,0);
for(const extra of [{repeat:true},{isComposing:true},{ctrlKey:true}]){
 c=setup();c.selectedTaskIds.add('a');c.key('Delete',{},extra);assert.equal(c.tasks.length,2);
}
c=setup();c.selectedTaskIds.add('a');c.key('Delete',{closest:()=>({})});assert.equal(c.tasks.length,2);c.modal=true;c.key('Delete');assert.equal(c.tasks.length,2);c.modal=false;c.storageBlocked=true;c.key('Delete');assert.equal(c.tasks.length,2);
c=setup();c.selectedTaskId='a';c.key('Delete');assert.equal(c.tasks.length,2,'hover alone is not selection');
c.selectedTaskIds.add('a');c.key('Escape');assert.equal(c.selectedTaskIds.size,0);assert.equal(c.selectedTaskId,null);
c=setup();c.$('search').value='hidden';c.createTaskAtMenu();assert.equal(c.tasks.length,3);assert.equal(c.$('search').value,'');assert.equal(c.focused,c.input);assert(c.input.isConnected);
c.input.value='新日程标题';c.input.handlers.keydown({key:'Enter',preventDefault(){},stopPropagation(){}});assert.equal(c.tasks.find(t=>t.id==='new').title,'新日程标题');assert.equal(c.focused.dataset.edit,'new');
c=setup();c.selectedTaskIds.add('a');c.key('F2');assert.equal(c.input.value,'A');c.input.value='discard';c.input.handlers.keydown({key:'Escape',preventDefault(){},stopPropagation(){}});assert.equal(c.tasks[0].title,'A');assert.equal(c.focused.dataset.edit,'a');
c.key('F2');c.input.value='待确认';c.input.handlers.keydown({key:'Enter',isComposing:true,preventDefault(){},stopPropagation(){}});assert(c.input.isConnected);assert.equal(c.tasks[0].title,'A');
c.tasks[0]={...c.tasks[0],title:'来自另一窗口'};c.input.handlers.blur();assert.equal(c.tasks[0].title,'来自另一窗口');assert(c.notice.includes('未保存'));
c=setup();c.selectedTaskIds=new Set(['a','b']);c.key('F2');assert.equal(c.input,undefined);
assert(html.includes("window.addEventListener('keydown',handleMapShortcut,true)"));assert(!html.includes("if(e.key==='Delete'){e.preventDefault();deleteTask(bubble.dataset.edit);}"));assert(html.includes('if(i<0)focusTaskTag(t.id,true)'));
console.log('PASS selected/batch delete, confirm and undo, editor/modal/IME guards, create autofocus through filters, F2, Escape focus return, stale-title protection');
