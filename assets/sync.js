/* Account-scoped snapshot sync. Revisions prevent silent cross-device overwrites. */
'use strict';
function scheduleEqual(a,b){
 const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
 return JSON.stringify(stable(a))===JSON.stringify(stable(b));
}
class ScheduleSyncClient {
 constructor(user, options={}) {
  this.user=user;this.key='focus-schedule-account-'+user.id;
  this.storage=options.storage||localStorage;this.request=options.request||ScheduleSyncClient.request;
  this.hooks={busy:()=>true,apply:()=>{},status:()=>{}};this.running=false;this.conflict=false;this.viewTasks=null;
 }
 static async request(path, method='GET', data, headers={}) {
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);
  try {
   const response=await fetch('/api/'+path,{method,credentials:'same-origin',cache:'no-store',signal:controller.signal,
    headers:{'Content-Type':'application/json','X-Requested-With':'SimpleSchedule',...headers},
    ...(data===undefined?{}:{body:JSON.stringify(data)})});
   const result=await response.json().catch(()=>({error:'同步服务尚未部署或返回无效数据'}));
   if(!response.ok||result.error){const error=Error(result.error||'同步请求失败');error.status=response.status;throw error;}
   return result;
  } finally {clearTimeout(timeout);}
 }
 read() {
  const raw=this.storage.getItem(this.key);
  if(!raw)return null;
  let data;
  try{data=JSON.parse(raw);}catch{throw Error('账号缓存不是有效 JSON，请先导出备份后再处理');}
  const syncValid=Number.isInteger(data?._sync?.revision)&&data._sync.revision>=0&&typeof data._sync.dirty==='boolean';
  if(data?.app!=='FocusSchedule'||!Array.isArray(data.tasks)||!syncValid)throw Error('账号缓存无效，请先导出备份后再处理');
  if(data.version===6){
   // v6 already has completion and a numeric workload. Preserve local edits and sync revision,
   // then let the current app-level validator normalize task fields after startup.
   data={...data,version:7};
   this.storage.setItem(this.key,JSON.stringify(data));
  }
  if(data.version!==7)throw Error('账号缓存版本过旧，请先导出备份后再处理');
  return data;
 }
 write(tasks, revision, dirty) {
  const data={app:'FocusSchedule',version:7,tasks,_sync:{revision,dirty}};
  this.storage.setItem(this.key,JSON.stringify(data));return data;
 }
 persist(data) {
  const previous=this.read();if(!previous)throw Error('账号缓存尚未初始化');
  let next=data.tasks;
  // Merge unrelated edits from another tab; never overwrite a concurrently edited task.
  if(this.viewTasks&&!scheduleEqual(previous.tasks,this.viewTasks)){
   const base=new Map(this.viewTasks.map(t=>[t.id,t])),latest=new Map(previous.tasks.map(t=>[t.id,t])),own=new Map(next.map(t=>[t.id,t]));
   for(const id of new Set([...base.keys(),...own.keys()])){
    if(scheduleEqual(base.get(id),own.get(id)))continue;
    if(!scheduleEqual(base.get(id),latest.get(id))&&!scheduleEqual(own.get(id),latest.get(id)))throw Error('另一窗口已修改同一日程，请导出当前数据后刷新');
    if(own.has(id))latest.set(id,own.get(id));else latest.delete(id);
   }
   next=[...latest.values()];
  }
  this.hooks.validate?.(next);
  if(!scheduleEqual(previous.tasks,next))this.write(next,previous._sync.revision,true);
  this.viewTasks=structuredClone(next);
  if(!scheduleEqual(next,data.tasks))this.hooks.apply(next);
  this.hooks.status(this.conflict?'同步冲突 · 点击处理':'已保存到本机 · 等待同步');
  clearTimeout(this.timer);this.timer=setTimeout(()=>this.flush(),700);
 }
 async authenticate() {
  const session=await this.request('session');
  if(session.user?.id!==this.user.id){const error=Error('账号已切换，请重新登录');error.status=401;throw error;}
  return {'X-CSRF-Token':session.csrf,'X-Schedule-User':this.user.id};
 }
 async flush() {
  if(this.running||this.conflict||this.hooks.blocked?.())return;
  this.running=true;
  try {
   // Serialize network sync across tabs. Local edits can continue during requests.
   if(globalThis.navigator?.locks)await navigator.locks.request(this.key,()=>this.exchange());
   else await this.exchange();
  } catch(error) {
   if(error.status===409){this.conflict=true;this.hooks.status('同步冲突 · 点击处理');}
   else this.hooks.status(error.status===401||error.status===403?'登录失效 · 请重新登录':'未同步 · '+error.message);
  } finally {this.running=false;}
 }
 async exchange() {
  const headers=await this.authenticate();
  const local=this.read();if(!local)return;
  if(this.hooks.blocked?.())return;
  if(this.viewTasks&&!scheduleEqual(local.tasks,this.viewTasks)&&!this.hooks.busy()){
   this.hooks.validate(local.tasks);this.viewTasks=structuredClone(local.tasks);this.hooks.apply(local.tasks);
  }
  const original=JSON.stringify(local),remote=await this.request('data','GET',undefined,headers);
  if(this.hooks.blocked?.()||JSON.stringify(this.read())!==original)return; // A local save happened during GET.
  if(!local._sync.dirty) {
   if(remote.revision!==local._sync.revision){
    if(this.hooks.busy()){this.hooks.status('云端有更新 · 编辑结束后同步');return;}
    this.hooks.validate(remote.tasks);
    this.write(remote.tasks,remote.revision,false);this.viewTasks=structuredClone(remote.tasks);this.hooks.apply(remote.tasks);
   }
  } else if(scheduleEqual(remote.tasks,local.tasks)) {
   this.write(local.tasks,remote.revision,false); // Includes retry after a lost PUT response.
  } else {
   if(remote.revision!==local._sync.revision){const error=Error('同步冲突');error.status=409;throw error;}
   const result=await this.request('data','PUT',{revision:remote.revision,tasks:local.tasks},headers);
   const latest=this.read();
   // Never erase edits made while upload was in flight.
   if(latest&&latest._sync.revision===local._sync.revision)this.write(latest.tasks,result.revision,!scheduleEqual(latest.tasks,local.tasks));
  }
  this.hooks.status(this.read()?._sync.dirty?'已保存到本机 · 等待同步':'已同步 · '+new Date().toLocaleTimeString('zh-CN'));
 }
 async resolve(useLocal, backup) {
  if(this.running)throw Error('正在同步，请稍后重试');
  if(this.hooks.busy())throw Error('请先结束日程编辑');
  this.running=true;
  const action=async()=>{
   const headers=await this.authenticate(),local=this.read(),remote=await this.request('data','GET',undefined,headers);
   if(JSON.stringify(this.read())!==JSON.stringify(local))throw Error('本机数据刚刚变化，请重试');
   this.hooks.validate(remote.tasks);
   await backup(local.tasks,remote.tasks);
   if(useLocal){
    const result=await this.request('data','PUT',{revision:remote.revision,tasks:local.tasks},headers);
    const latest=this.read();
    if(latest&&latest._sync.revision===local._sync.revision)this.write(latest.tasks,result.revision,!scheduleEqual(latest.tasks,local.tasks));
   }else{
    if(this.hooks.busy()||JSON.stringify(this.read())!==JSON.stringify(local))throw Error('本机正在编辑，请重试');
    this.write(remote.tasks,remote.revision,false);this.viewTasks=structuredClone(remote.tasks);this.hooks.apply(remote.tasks);
   }
   this.conflict=false;this.hooks.status('冲突已处理');
  };
  try{if(globalThis.navigator?.locks)await navigator.locks.request(this.key,action);else await action();}
  finally{this.running=false;}
 }
 attach(hooks) {
  this.hooks=hooks;
  this.viewTasks=structuredClone(this.read().tasks);
  setInterval(()=>{if(!document.hidden)this.flush();},10000);
  window.addEventListener('online',()=>this.flush());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.flush();});
  window.addEventListener('beforeunload',event=>{if(this.read()?._sync.dirty){event.preventDefault();event.returnValue='';}});
  this.flush();
 }
}
if(typeof module!=='undefined')module.exports=ScheduleSyncClient;
if(typeof window!=='undefined')window.ScheduleSync={
 async start() {
  if(new URLSearchParams(location.search).get('sync')!=='1')return null;
  let user;
  try{const session=await ScheduleSyncClient.request('session');user=session.user;sessionStorage.setItem('schedule-last-account',JSON.stringify(user));}
  catch(error){
   if(error.status===401||error.status===403){location.replace('login.html');throw error;}
   try{user=JSON.parse(sessionStorage.getItem('schedule-last-account'));}catch{}
   if(!user?.id)throw Error('无法连接同步服务。请检查服务部署或网络后刷新。');
  }
  const client=new ScheduleSyncClient(user);
  if(!client.read()){
   const remote=await client.request('data','GET',undefined,await client.authenticate());
   client.write(remote.tasks,remote.revision,false);
  }
  return client;
 },
 controls(client,hooks) {
  const button=document.getElementById('cloudLogin');
  if(!client){button.onclick=()=>location.assign('login.html');return;}
  button.textContent=client.user.username+' · 同步';
  const make=(label,click)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=click;button.after(b);return b;};
  const backup=(local,remote)=>{
   const data={app:'FocusSchedule',version:7,tasks:local,serverBackup:{app:'FocusSchedule',version:7,tasks:remote}};
   const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
   const a=document.createElement('a');a.href=url;a.download='同步冲突备份-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  const dialog=document.createElement('dialog');
  dialog.innerHTML='<div class="formbody"><h2>同步冲突</h2><p>另一台设备和本机都修改了日程。请选择保留哪一份完整日程；继续前将下载包含两份数据的备份。</p><p class="small">选择“本机”会覆盖服务器当前日程；选择“服务器”会替换本机账号缓存。稍后处理会暂停上传。</p><div class="actions"><button data-choice="local">使用本机版本</button><button data-choice="remote">使用服务器版本</button><button data-choice="cancel">稍后处理</button></div><p role="status"></p></div>';
  document.body.append(dialog);
  for(const b of dialog.querySelectorAll('button'))b.onclick=async()=>{
   if(b.dataset.choice==='cancel'){dialog.close();return;}
   if(!confirm(b.dataset.choice==='local'?'确认以本机日程覆盖服务器当前日程？':'确认用服务器日程替换本机账号日程？'))return;
   const buttons=[...dialog.querySelectorAll('button')];buttons.forEach(v=>v.disabled=true);
   dialog.close(); // Resolve checks whether a schedule editor is open.
   try{await client.resolve(b.dataset.choice==='local',backup);}
   catch(error){dialog.querySelector('[role=status]').textContent=error.message;dialog.showModal();}
   finally{buttons.forEach(v=>v.disabled=false);}
  };
  button.onclick=()=>{
   if(client.conflict){if(!dialog.open)dialog.showModal();}
   else client.flush();
  };
  make('重新登录',()=>location.assign('login.html'));
  make('退出登录',async()=>{
   try{
    if(client.read()?._sync.dirty&&!confirm('尚有未同步的修改，退出后仍保留在本机账号缓存中。继续退出？'))return;
    const headers=await client.authenticate();await client.request('logout','POST',{},headers);
    sessionStorage.removeItem('schedule-last-account');location.assign('./');
   }catch(error){hooks.status('退出失败 · '+error.message);}
  });
  make('上传本机日程',()=>{
   try{
    if(hooks.busy())throw Error('请先结束日程编辑');
    const data=JSON.parse(localStorage.getItem('focus-schedule-v1')||'null');
    if(!data){hooks.status('本浏览器没有未登录日程');return;}
    const incoming=hooks.unpack(data),current=client.read();
    if(!confirm('将本浏览器未登录时的 '+incoming.length+' 条日程合并到当前账号，并上传服务器。同 ID 日程以本机为准，其他账号日程保留。继续？'))return;
    const tasks=new Map(current.tasks.map(t=>[t.id,t]));incoming.forEach(t=>tasks.set(t.id,t));
    const merged=[...tasks.values()];hooks.validate(merged);client.persist({tasks:merged});hooks.apply(merged);
   }catch(error){hooks.status(error.message);}
  });
  client.attach({...hooks,status:message=>{const short=client.conflict?'同步冲突':message.startsWith('已同步')?'已同步':'同步';button.textContent=client.user.username+' · '+short;button.title=message;hooks.status(message);}});
 }
};
