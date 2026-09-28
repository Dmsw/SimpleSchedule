'use strict';
(() => {
  const CONFIG_KEY='focus-schedule-webdav-config-v1';
  const STATE_KEY='focus-schedule-webdav-state-v1';
  const REMOTE_DIR='SimpleSchedule';
  const REMOTE_FILE='simpleschedule-sync.json';
  const DEBOUNCE_MS=1800;
  const POLL_MS=30000;

  let config=loadConfig();
  let state=loadState();
  let busy=false, syncTimer=0, pollTimer=0;
  let snapshot=makeSnapshot();
  const localSave=save;

  function defaultConfig(){return {url:'',user:'',pass:'',proxy:'',auto:true};}
  function loadConfig(){
    try{return {...defaultConfig(),...JSON.parse(localStorage.getItem(CONFIG_KEY)||'{}')};}
    catch{return defaultConfig();}
  }
  function saveConfig(){localStorage.setItem(CONFIG_KEY,JSON.stringify(config));}
  function accountKey(c=config){return [String(c.url||'').trim().replace(/\/+$/,''),String(c.user||'').trim()].join('|');}
  function emptyState(account=accountKey()){return {account,updated:{},deleted:{},lastSync:0};}
  function loadState(){
    try{
      const s=JSON.parse(localStorage.getItem(STATE_KEY)||'{}');
      return {account:String(s.account||''),updated:s.updated&&typeof s.updated==='object'?s.updated:{},deleted:s.deleted&&typeof s.deleted==='object'?s.deleted:{},lastSync:Number(s.lastSync)||0};
    }catch{return emptyState('');}
  }
  function saveState(){localStorage.setItem(STATE_KEY,JSON.stringify(state));}
  function ensureStateAccount(){
    const key=accountKey();
    if(state.account!==key){state=emptyState(key);saveState();}
  }
  function persistedTasks(){
    try{
      if(typeof pendingTagCreations!=='undefined')return tasks.filter(t=>!pendingTagCreations.has(t.id));
    }catch{}
    return [...tasks];
  }
  function sig(t){return JSON.stringify([t.id,t.title,t.details,t.category,t.importance,t.workload,t.deadline,t.done,t.difficulty,t.detailsMode]);}
  function makeSnapshot(){return new Map(persistedTasks().map(t=>[t.id,sig(t)]));}
  function trackLocalChanges(){
    if(!config.url||!config.user){snapshot=makeSnapshot();return;}
    ensureStateAccount();
    const now=Date.now(), next=makeSnapshot();
    for(const t of persistedTasks()){
      if(snapshot.get(t.id)!==next.get(t.id)){state.updated[t.id]=now;delete state.deleted[t.id];}
    }
    for(const id of snapshot.keys()){
      if(!next.has(id)){state.deleted[id]=now;delete state.updated[id];}
    }
    snapshot=next;saveState();
  }

  save=function(...args){
    const result=localSave.apply(this,args);
    trackLocalChanges();
    queueSync();
    return result;
  };

  function normalizeUrl(raw){
    const value=String(raw||'').trim();
    if(!value)return '';
    const u=new URL(value);
    if(!['http:','https:'].includes(u.protocol))throw Error('WebDAV 地址必须以 http:// 或 https:// 开头');
    if(location.protocol==='https:'&&u.protocol!=='https:')throw Error('当前站点使用 HTTPS，WebDAV 也必须使用 HTTPS，浏览器会阻止混合内容');
    return value.replace(/\/+$/,'');
  }
  function normalizeProxy(raw){
    const value=String(raw||'').trim();
    if(!value)return '';
    const u=new URL(value);
    if(!['http:','https:'].includes(u.protocol))throw Error('代理地址必须以 http:// 或 https:// 开头');
    if(location.protocol==='https:'&&u.protocol!=='https:')throw Error('当前站点使用 HTTPS，代理地址也必须使用 HTTPS');
    return value.replace(/\/+$/,'');
  }
  function authHeader(){
    const bytes=new TextEncoder().encode(config.user+':'+config.pass);
    let bin='';for(const b of bytes)bin+=String.fromCharCode(b);
    return 'Basic '+btoa(bin);
  }
  function remoteDirUrl(){return config.url.replace(/\/+$/,'')+'/'+REMOTE_DIR;}
  function remoteFileUrl(){return remoteDirUrl()+'/'+REMOTE_FILE;}
  function requestUrl(target){return config.proxy?config.proxy.replace(/\/+$/,'')+'/'+target:target;}
  function isCrossOriginTarget(){
    try{return new URL(config.url).origin!==location.origin;}catch{return false;}
  }
  async function webdavFetch(target,options={}){
    const controller=new AbortController();
    const method=String(options.method||'GET').toUpperCase();
    const timeout=setTimeout(()=>controller.abort(),method==='PUT'?45000:20000);
    const headers=new Headers(options.headers||{});
    headers.set('Authorization',authHeader());
    try{
      return await fetch(requestUrl(target),{...options,headers,credentials:'omit',cache:'no-store',signal:controller.signal});
    }catch(e){
      const hint=isCrossOriginTarget()&&!config.proxy?'。该 WebDAV 与当前站点跨域，若服务商未开放 CORS，请在设置中填写 WebDAV 代理地址':'';
      const err=new Error((e?.name==='AbortError'?'WebDAV 请求超时':'无法连接 WebDAV（网络、CORS 或代理配置错误）')+hint);
      err.cause=e;throw err;
    }finally{clearTimeout(timeout);}
  }
  async function responseError(resp,action){
    let detail='';
    try{detail=(await resp.text()).trim().slice(0,240);}catch{}
    if(resp.status===401)throw Error('WebDAV 用户名或密码错误（401）');
    if(resp.status===403)throw Error('WebDAV 拒绝访问（403），请检查账号权限或应用专用密码');
    throw Error(action+'失败：HTTP '+resp.status+(detail?' · '+detail:''));
  }
  async function ensureRemoteDir(){
    const resp=await webdavFetch(remoteDirUrl(),{method:'MKCOL'});
    if(resp.ok||[201,204,301,405].includes(resp.status))return;
    await responseError(resp,'创建远端目录');
  }
  async function readRemote(){
    const resp=await webdavFetch(remoteFileUrl(),{method:'GET'});
    if(resp.status===404)return null;
    if(!resp.ok)await responseError(resp,'读取云端日程');
    let doc;
    try{doc=JSON.parse(await resp.text());}catch{throw Error('云端同步文件不是有效 JSON');}
    if(!doc||doc.app!=='SimpleScheduleWebDAV'||doc.version!==1||!Array.isArray(doc.tasks))throw Error('云端存在无法识别的 SimpleSchedule 同步文件');
    const strongEtag=(()=>{const e=resp.headers.get('ETag')||'';return e&&!/^W\//i.test(e)?e:'';})();
    return {doc:{...doc,tasks:validate(doc.tasks),updated:doc.updated&&typeof doc.updated==='object'?doc.updated:{},deleted:doc.deleted&&typeof doc.deleted==='object'?doc.deleted:{}},etag:strongEtag};
  }
  class PreconditionError extends Error{}
  async function writeRemote(doc,etag=''){
    const headers={'Content-Type':'application/json; charset=utf-8'};
    if(etag)headers['If-Match']=etag;
    let resp=await webdavFetch(remoteFileUrl(),{method:'PUT',headers,body:JSON.stringify(doc,null,2)});
    if(resp.status===404||resp.status===409){await ensureRemoteDir();resp=await webdavFetch(remoteFileUrl(),{method:'PUT',headers,body:JSON.stringify(doc,null,2)});}
    if(resp.status===412)throw new PreconditionError('云端文件已被其它设备更新');
    if(!resp.ok&&![201,204].includes(resp.status))await responseError(resp,'写入云端日程');
  }

  function eventFor(map,updated,deleted,id){
    const task=map.get(id), ut=task?Number(updated[id]||0):-1, dt=Number(deleted[id]??-1);
    if(dt>ut)return {kind:'delete',stamp:dt};
    if(task)return {kind:'task',stamp:Math.max(0,ut),task};
    return dt>=0?{kind:'delete',stamp:dt}:null;
  }
  function merge(remote){
    const localMap=new Map(persistedTasks().map(t=>[t.id,t]));
    const remoteMap=new Map((remote?.tasks||[]).map(t=>[t.id,t]));
    const ru=remote?.updated||{}, rd=remote?.deleted||{};
    const ids=new Set([...localMap.keys(),...remoteMap.keys(),...Object.keys(state.updated),...Object.keys(state.deleted),...Object.keys(ru),...Object.keys(rd)]);
    const out=[],updated={},deleted={},bootstrap=Date.now();
    for(const id of ids){
      const a=eventFor(localMap,state.updated,state.deleted,id);
      const b=eventFor(remoteMap,ru,rd,id);
      let winner;
      if(!a)winner=b;else if(!b)winner=a;
      else if(a.stamp>b.stamp)winner=a;
      else if(b.stamp>a.stamp)winner=b;
      else if(a.kind==='task'&&b.kind==='task'&&sig(a.task)===sig(b.task))winner=a;
      else winner=b;
      if(!winner)continue;
      const stamp=winner.stamp>0?winner.stamp:bootstrap;
      if(winner.kind==='delete')deleted[id]=stamp;
      else{out.push(winner.task);updated[id]=stamp;}
    }
    return {tasks:out,updated,deleted};
  }
  function stableObject(o){return Object.fromEntries(Object.entries(o||{}).sort(([a],[b])=>a.localeCompare(b)));}
  function canonical(x){
    return JSON.stringify({tasks:[...(x?.tasks||[])].sort((a,b)=>a.id.localeCompare(b.id)),updated:stableObject(x?.updated),deleted:stableObject(x?.deleted)});
  }
  function makeRemoteDoc(merged){
    return {app:'SimpleScheduleWebDAV',version:1,updatedAt:new Date().toISOString(),tasks:merged.tasks,updated:merged.updated,deleted:merged.deleted};
  }
  function hasPendingDraft(){
    try{return typeof pendingTagCreations!=='undefined'&&pendingTagCreations.size>0;}catch{return false;}
  }
  async function sync(interactive=false){
    if(busy)return;
    if(!config.url||!config.user){if(interactive)notify('请先配置 WebDAV');return;}
    if(hasPendingDraft()){if(interactive)notify('请先完成或取消正在创建的日程，再进行云同步');return;}
    busy=true;clearTimeout(syncTimer);setStatus('busy','正在同步…','正在读取并合并云端数据');
    try{
      ensureStateAccount();
      for(let attempt=0;attempt<3;attempt++){
        await ensureRemoteDir();
        const remote=await readRemote();
        const merged=merge(remote?.doc||null);
        tasks=validate(merged.tasks);
        state.updated=merged.updated;state.deleted=merged.deleted;
        snapshot=makeSnapshot();
        localSave();render();
        const nextDoc=makeRemoteDoc(merged);
        if(!remote||canonical(remote.doc)!==canonical(nextDoc)){
          try{await writeRemote(nextDoc,remote?.etag||'');}
          catch(e){if(e instanceof PreconditionError&&attempt<2)continue;throw e;}
        }
        state.lastSync=Date.now();saveState();
        setStatus('ok','WebDAV 已同步','本机与云端日程已合并');
        refreshUI();
        return;
      }
      throw Error('云端连续被其它设备更新，请稍后重试');
    }catch(e){
      console.error('[webdav]',e);
      setStatus('error','同步失败',e.message||String(e));
      if(interactive)notify('WebDAV 同步失败：'+(e.message||e));
    }finally{busy=false;refreshUI();}
  }
  function queueSync(){
    if(!config.auto||!config.url||!config.user)return;
    clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>{if(document.visibilityState!=='hidden')sync(false);},DEBOUNCE_MS);
  }
  function restartPoll(){
    clearInterval(pollTimer);
    if(config.auto&&config.url&&config.user)pollTimer=setInterval(()=>{if(document.visibilityState!=='hidden'&&!busy&&!hasPendingDraft())sync(false);},POLL_MS);
  }

  function ui(){
    const css=document.createElement('style');
    css.textContent='#webdavDialog{width:min(680px,94vw)}.webdav-status{display:flex;gap:10px;align-items:center;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:#f8fafb;margin-bottom:16px}.webdav-dot{width:10px;height:10px;border-radius:50%;background:#9aa5b1;flex:0 0 auto}.webdav-dot.ok{background:#27845b}.webdav-dot.busy{background:#aa7013}.webdav-dot.error{background:#bd4145}.webdav-actions{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.webdav-meta{font-size:12px;color:var(--muted);line-height:1.7}.webdav-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.webdav-grid .full{grid-column:1/-1}@media(max-width:600px){.webdav-grid{grid-template-columns:1fr}.webdav-grid .full{grid-column:auto}}';
    document.head.append(css);
    const btn=document.createElement('button');btn.id='webdavBtn';btn.textContent='☁ WebDAV';
    document.querySelector('#mobileHeaderActions, header .actions')?.prepend(btn);
    const dialog=document.createElement('dialog');dialog.id='webdavDialog';dialog.innerHTML=
      '<div class="dialoghead"><h2>☁ WebDAV 多端同步</h2><button type="button" id="closeWebDAV">✕</button></div>'+
      '<div class="formbody">'+
      '<div class="webdav-status"><span id="webdavDot" class="webdav-dot"></span><div><b id="webdavState">未配置 WebDAV</b><div id="webdavMessage" class="small">本地日程仍正常保存</div></div></div>'+
      '<div class="webdav-grid">'+
      '<div class="field full"><label for="webdavUrl">WebDAV 地址</label><input id="webdavUrl" type="url" autocomplete="url" placeholder="https://dav.example.com/path"></div>'+
      '<div class="field"><label for="webdavUser">用户名</label><input id="webdavUser" autocomplete="username"></div>'+
      '<div class="field"><label for="webdavPass">密码 / 应用专用密码</label><input id="webdavPass" type="password" autocomplete="current-password"></div>'+
      '<div class="field full"><label for="webdavProxy">跨域代理（可选）</label><input id="webdavProxy" type="url" placeholder="留空表示浏览器直连"></div>'+
      '</div>'+
      '<label><input id="webdavAuto" type="checkbox"> 自动同步（本地修改后约 2 秒上传，并每 30 秒检查云端）</label>'+
      '<div class="webdav-actions"><button id="webdavSaveTest" class="primary">保存并测试连接</button><button id="webdavSyncNow">立即同步</button><button id="webdavClear" class="danger">清除 WebDAV 配置</button></div>'+
      '<div class="webdav-meta">远端文件：<code>'+REMOTE_DIR+' / '+REMOTE_FILE+'</code></div>'+
      '<div class="webdav-meta">网页端受浏览器 CORS 限制：若服务商不允许跨域，请填写自己的 WebDAV CORS 代理。代理需支持 <code>&lt;代理地址&gt;/&lt;完整 WebDAV URL&gt;</code> 转发形式。</div>'+
      '<div class="webdav-meta">用户名和密码仅保存在当前浏览器 localStorage 中；SimpleSchedule 不会上传 AI API Key。</div>'+
      '<div class="webdav-meta" id="webdavLastSync">尚未同步</div>'+
      '</div>';
    document.body.append(dialog);
    btn.onclick=()=>{fillForm();refreshUI();dialog.showModal();};
    $('closeWebDAV').onclick=()=>dialog.close();
    $('webdavSaveTest').onclick=saveAndTest;
    $('webdavSyncNow').onclick=()=>sync(true);
    $('webdavClear').onclick=clearSettings;
    fillForm();refreshUI();
  }
  function fillForm(){
    if(!$('webdavUrl'))return;
    $('webdavUrl').value=config.url||'';
    $('webdavUser').value=config.user||'';
    $('webdavPass').value=config.pass||'';
    $('webdavProxy').value=config.proxy||'';
    $('webdavAuto').checked=!!config.auto;
  }
  async function saveAndTest(){
    try{
      const next={url:normalizeUrl($('webdavUrl').value),user:$('webdavUser').value.trim(),pass:$('webdavPass').value,proxy:normalizeProxy($('webdavProxy').value),auto:$('webdavAuto').checked};
      if(!next.url)throw Error('请输入 WebDAV 地址');
      if(!next.user)throw Error('请输入 WebDAV 用户名');
      if(!next.pass)throw Error('请输入 WebDAV 密码或应用专用密码');
      const oldAccount=accountKey(config);
      config=next;saveConfig();
      if(accountKey(config)!==oldAccount)state=emptyState(accountKey(config));
      saveState();restartPoll();
      setStatus('busy','正在测试 WebDAV…','正在创建/访问 SimpleSchedule 目录');
      await ensureRemoteDir();await readRemote();
      setStatus('ok','WebDAV 连接正常',isCrossOriginTarget()&&!config.proxy?'当前使用浏览器直连；若后续出现 CORS 错误，请配置代理':'可以开始同步');
      notify('WebDAV 连接测试成功');
      refreshUI();
    }catch(e){console.error('[webdav test]',e);setStatus('error','WebDAV 连接失败',e.message||String(e));notify('WebDAV 测试失败：'+(e.message||e));}
  }
  function clearSettings(){
    if(!confirm('清除当前浏览器中的 WebDAV 地址、用户名和密码？本地日程不会删除，云端文件也不会删除。'))return;
    localStorage.removeItem(CONFIG_KEY);localStorage.removeItem(STATE_KEY);
    config=defaultConfig();state=emptyState('');snapshot=makeSnapshot();
    clearTimeout(syncTimer);clearInterval(pollTimer);fillForm();refreshUI();
  }
  function setStatus(kind,title,msg){
    if(!$('webdavState'))return;
    $('webdavState').textContent=title;
    $('webdavMessage').textContent=msg||'';
    $('webdavDot').className='webdav-dot'+(kind?' '+kind:'');
  }
  function refreshUI(){
    if(!$('webdavDialog'))return;
    $('webdavSyncNow').disabled=busy||!config.url||!config.user;
    $('webdavSaveTest').disabled=busy;
    $('webdavLastSync').textContent=state.lastSync?'上次同步：'+new Date(state.lastSync).toLocaleString('zh-CN'):'尚未同步';
    $('webdavBtn').textContent=config.url?(state.lastSync?'☁ WebDAV ✓':'☁ WebDAV'):'☁ WebDAV';
    if(busy)return;
    if(!config.url)setStatus('','未配置 WebDAV','填写 WebDAV 地址、用户名和密码后测试连接');
    else if(!config.user)setStatus('','WebDAV 配置未完成','缺少用户名');
    else if(state.lastSync)setStatus('ok','WebDAV 已配置','自动同步'+(config.auto?'已开启':'已关闭'));
    else setStatus('','WebDAV 已配置','尚未完成首次同步');
  }

  window.addEventListener('focus',()=>{if(config.auto&&config.url&&config.user&&!hasPendingDraft())sync(false);});
  window.addEventListener('online',()=>{if(config.auto&&config.url&&config.user)queueSync();});
  ui();restartPoll();
})();