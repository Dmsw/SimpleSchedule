const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const h=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8'),c={radiusEdit:null,bubblePreview:t=>t};vm.createContext(c);
vm.runInContext(h.slice(h.indexOf('function clampImportance'),h.indexOf('\n',h.indexOf('function limitDomain'))),c);
vm.runInContext(h.slice(h.indexOf('function taskRadii('),h.indexOf('function requestLinks()')),c);
assert.equal(c.clampImportance(100),10);assert.equal(c.clampImportance(-100),-10);assert.equal(c.clampImportance(.25),.25);
for(const r of [[-100,100],[99,101],[-50,-49],[-2,2]]){const d=c.limitDomain('x',r);assert(d[0]>=-11&&d[1]<=11&&d[1]>d[0]);}
let a=[{id:'a',workload:1},{id:'b',workload:4},{id:'c',workload:9}];let r=c.taskRadii(a);assert.equal(r.get('a'),10);assert.equal(r.get('b'),26);assert.equal(r.get('c'),42);
r=c.taskRadii(a.slice(0,2));assert.equal(r.get('b'),42);assert.equal(c.taskRadii([a[0]]).get('a'),24);assert.equal(c.taskRadii([]).size,0);
assert.equal(c.taskRadii([{id:'a',workload:4},{id:'b',workload:4}]).get('b'),24);
c.radiusEdit={radii:new Map([['a',20]]),originals:new Map([['a',{workload:1}]])};assert.equal(c.taskRadii([{id:'a',workload:4}]).get('a'),40);
vm.runInContext(h.slice(h.indexOf('function normalizeTaskConnections'),h.indexOf('function connectionSegment')),c);
vm.runInContext(h.split('\n').find(l=>l.startsWith('function validate(')),c);
const task={id:'a',title:'test',details:'',category:'test',importance:100,workload:1,deadline:'2026-09-26T00:00:00Z',done:false,difficulty:5,detailsMode:'text'};assert.equal(c.validate([task])[0].importance,10);
assert(h.includes('min="-10" max="10"'));assert(h.includes('latest.importance=clampImportance(parsed.importance)'));assert(h.includes('10-maxImportance'));
console.log('PASS bounded viewport, importance migration, dynamic visible radii, equal/empty sets and resize preview');
