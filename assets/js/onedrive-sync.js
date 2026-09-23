
'use strict';
(() => {
  const CLOUD_KEY='focus-schedule-onedrive-v1', FILE='simpleschedule-sync.json';
  const GRAPH='https://graph.microsoft.com/v1.0', SCOPES=['Files.ReadWrite.AppFolder'];
  const cfgId=String(window.SIMPLE_SCHEDULE_CONFIG?.microsoftClientId||'').trim();
  let cloud=loadCloud(), msalApp=null, snapshot=snap(), timer=0, busy=false;
  if(cfgId) cloud.clientId=cfgId;

  function loadCloud(){try{return {...{clientId:'',auto:true,lastSync:0,updated:{},deleted:{}},...JSON.parse(localStorage.getItem(CLOUD_KEY)||'{}')}}catch{return {clientId:'',auto:true,lastSync:0,updated:{},deleted:{}}}}
  function saveCloud(){localStorage.setItem(CLOUD_KEY,JSON.stringify(cloud))}
  function sig(t){return JSON.stringify([t.id,t.title,t.details,t.category,t.importance,t.workload,t.deadline,t.done,t.difficulty,t.detailsMode])}
  function snap(){return new Map(tasks.map(t=>[t.id,sig(t)]))}
  function track(){
    const now=Date.now(), next=snap();
    for(const t of tasks) if(snapshot.get(t.id)!==next.get(t.id)){cloud.updated[t.id]=now;delete cloud.deleted[t.id]}
    for(const id of snapshot.keys()) if(!next.has(id)){cloud.deleted[id]=now;delete cloud.updated[id]}
    snapshot=next; saveCloud();
  }

  const localSave=save;
  save=function(...a){track();const r=localSave.apply(this,a);queue();return r};

  function ui(){
    const css=document.createElement('style');
    css.textContent='#oneDriveDialog{width:min(640px,94vw)}.cloud-status{display:flex;gap:10px;align-items:center;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:#f8fafb;margin-bottom:16px}.cloud-dot{width:10px;height:10px;border-radius:50%;background:#9aa5b1}.cloud-dot.ok{background:#27845b}.cloud-dot.busy{background:#aa7013}.cloud-dot.error{background:#bd4145}.cloud-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.cloud-config input{width:100%}.cloud-meta{font-size:12px;color:var(--muted);line-height:1.7}';
    document.head.append(css);
    const btn=document.createElement('button');btn.id='oneDriveBtn';btn.textContent='☁ OneDrive';document.querySelector('header .actions')?.prepend(btn);
    const d=document.createElement('dialog');d.id='oneDriveDialog';d.innerHTML=
      '<div class="dialoghead"><h2>☁ OneDrive 多端同步</h2><button id="closeOneDrive">✕</button></div>'+
      '<div class="formbody">'+
      '<div class="cloud-status"><span id="oneDriveDot" class="cloud-dot"></span><div><b id="oneDriveState">未连接 OneDrive</b><div id="oneDriveAccount" class="small">本地日程仍正常保存</div></div></div>'+
      '<p class="small">连接后，日程保存到你自己的 OneDrive App Folder。SimpleSchedule 只申请应用文件夹权限，不读取其它 OneDrive 文件。</p>'+
      '<div class="cloud-actions"><button id="connectOneDrive" class="primary">连接 OneDrive</button><button id="syncOneDrive" disabled>立即同步</button><button id="disconnectOneDrive" disabled>断开本机</button></div>'+
      '<label><input id="autoOneDrive" type="checkbox"> 本地修改后自动同步</label>'+
      '<details class="cloud-config"><summary>Microsoft 应用配置</summary><label class="field">Application (client) ID<input id="oneDriveClientId" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></label><div class="small">Client ID 不是密码；本应用不需要 Client Secret。</div></details>'+
      '<div class="cloud-meta">同步文件：<code>OneDrive / Apps / [应用名称] / '+FILE+'</code><br><span id="oneDriveLastSync">尚未同步</span><br><span id="oneDriveMsg"></span></div>'+
      '</div>';
    document.body.append(d);
    btn.onclick=()=>{refresh();d.showModal()};$('closeOneDrive').onclick=()=>d.close();
    $('connectOneDrive').onclick=connect;$('syncOneDrive').onclick=()=>sync(true);$('disconnectOneDrive').onclick=disconnect;
    $('autoOneDrive').onchange=e=>{cloud.auto=e.target.checked;saveCloud();if(cloud.auto)queue()};
    $('oneDriveClientId').onchange=e=>{if(!cfgId){cloud.clientId=e.target.value.trim();saveCloud();msalApp=null;refresh()}};
    refresh();
  }

  const clientId=()=>cfgId||String(cloud.clientId||'').trim();
  const secure=()=>location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname);
  async function app(){
    if(!clientId())throw Error('请先配置 Microsoft Application (client) ID');
    if(!secure())throw Error('Microsoft 登录需要 HTTPS');
    if(!window.msal?.PublicClientApplication)throw Error('MSAL 未加载');
    if(msalApp)return msalApp;
    msalApp=new msal.PublicClientApplication({auth:{clientId:clientId(),authority:'https://login.microsoftonline.com/common',redirectUri:location.origin+location.pathname},cache:{cacheLocation:'localStorage'}});
    if(msalApp.initialize)await msalApp.initialize();
    const a=msalApp.getAllAccounts()[0];if(a)msalApp.setActiveAccount(a);return msalApp;
  }
  async function account(){try{const a=await app();return a.getActiveAccount()||a.getAllAccounts()[0]||null}catch{return null}}
  async function token(interactive=false){
    const a=await app();let ac=a.getActiveAccount()||a.getAllAccounts()[0]||null;
    if(!ac&&interactive){const r=await a.loginPopup({scopes:SCOPES,prompt:'select_account'});ac=r.account;a.setActiveAccount(ac)}
    if(!ac)throw Error('请先连接 OneDrive');
    try{return (await a.acquireTokenSilent({scopes:SCOPES,account:ac})).accessToken}catch(e){if(!interactive)throw e;return (await a.acquireTokenPopup({scopes:SCOPES,account:ac})).accessToken}
  }
  async function graph(path,opt={},interactive=false){
    const h=new Headers(opt.headers||{});h.set('Authorization','Bearer '+await token(interactive));
    return fetch(GRAPH+path,{...opt,headers:h});
  }
  async function gerr(r){try{const j=await r.clone().json();return 'Microsoft Graph '+r.status+'：'+(j.error?.message||'')}catch{return 'Microsoft Graph '+r.status}}
  async function read(interactive){
    let r=await graph('/me/drive/special/approot',{},interactive);if(!r.ok)throw Error(await gerr(r));
    r=await graph('/me/drive/special/approot:/'+encodeURIComponent(FILE)+':/content',{},interactive);
    if(r.status===404)return null;if(!r.ok)throw Error(await gerr(r));
    const j=JSON.parse(await r.text());if(j.app!=='SimpleScheduleCloud'||j.version!==1||!Array.isArray(j.tasks))throw Error('云端同步文件格式不支持');
    return {tasks:validate(j.tasks),updated:j.updated||{},deleted:j.deleted||{}};
  }
  function ev(map,u,d,id){
    const t=map.get(id), ut=t?Number(u[id]||0):-1, dt=Number(d[id]??-1);
    if(dt>ut)return {kind:'delete',stamp:dt}; if(t)return {kind:'task',stamp:Math.max(0,ut),task:t}; return dt>=0?{kind:'delete',stamp:dt}:null;
  }
  function merge(remote){
    const l=new Map(tasks.map(t=>[t.id,t])), r=new Map((remote?.tasks||[]).map(t=>[t.id,t]));
    const ru=remote?.updated||{}, rd=remote?.deleted||{}, ids=new Set([...l.keys(),...r.keys(),...Object.keys(cloud.updated),...Object.keys(cloud.deleted),...Object.keys(ru),...Object.keys(rd)]);
    const out=[], updated={}, deleted={}; const bootstrap=Date.now();
    for(const id of ids){
      const a=ev(l,cloud.updated,cloud.deleted,id), b=ev(r,ru,rd,id); let w=!a?b:!b?a:a.stamp>b.stamp?a:b.stamp>a.stamp?b:(a.kind==='task'&&b.kind==='task'&&sig(a.task)===sig(b.task)?a:b);
      if(!w)continue;const stamp=w.stamp>0?w.stamp:bootstrap;
      if(w.kind==='delete')deleted[id]=stamp;else{out.push(w.task);updated[id]=stamp}
    }
    return {tasks:out,updated,deleted};
  }
  const canon=x=>JSON.stringify({tasks:[...(x.tasks||[])].sort((a,b)=>a.id.localeCompare(b.id)),updated:x.updated||{},deleted:x.deleted||{}});
  async function write(m,interactive){
    const body=JSON.stringify({app:'SimpleScheduleCloud',version:1,updatedAt:new Date().toISOString(),tasks:m.tasks,updated:m.updated,deleted:m.deleted},null,2);
    const r=await graph('/me/drive/special/approot:/'+encodeURIComponent(FILE)+':/content',{method:'PUT',headers:{'Content-Type':'application/json; charset=utf-8'},body},interactive);
    if(!r.ok)throw Error(await gerr(r));
  }
  async function sync(interactive=false){
    if(busy)return;busy=true;clearTimeout(timer);status('busy','正在同步…');
    try{
      const remote=await read(interactive), m=merge(remote);
      tasks=m.tasks;cloud.updated=m.updated;cloud.deleted=m.deleted;snapshot=snap();localSave();render();
      if(!remote||canon(remote)!==canon(m))await write(m,interactive);
      cloud.lastSync=Date.now();saveCloud();status('ok','同步完成');$('oneDriveMsg').textContent='已合并本机与 OneDrive 日程';refresh();
    }catch(e){console.error(e);status('error','同步失败');$('oneDriveMsg').textContent=e.message||String(e);if(interactive)notify('OneDrive 同步失败：'+(e.message||e))}
    finally{busy=false}
  }
  function queue(){if(!cloud.auto||!clientId())return;clearTimeout(timer);timer=setTimeout(async()=>{if(await account())sync(false)},1500)}
  async function connect(){cloud.clientId=cfgId||$('oneDriveClientId').value.trim();saveCloud();msalApp=null;try{await token(true);await refresh();await sync(true)}catch(e){status('error','连接失败');$('oneDriveMsg').textContent=e.message||String(e)}}
  async function disconnect(){try{const a=await app(), ac=a.getActiveAccount()||a.getAllAccounts()[0];if(ac)await a.logoutPopup({account:ac,mainWindowRedirectUri:location.href})}catch{}msalApp=null;refresh()}
  function status(kind,text){if(!$('oneDriveState'))return;$('oneDriveState').textContent=text;$('oneDriveDot').className='cloud-dot'+(kind?' '+kind:'')}
  async function refresh(){
    if(!$('oneDriveDialog'))return;const ac=await account();$('autoOneDrive').checked=!!cloud.auto;$('oneDriveClientId').value=clientId();$('oneDriveClientId').readOnly=!!cfgId;
    $('connectOneDrive').disabled=!secure()||!clientId()||!!ac;$('syncOneDrive').disabled=!ac||busy;$('disconnectOneDrive').disabled=!ac;
    if(!secure()){status('','预览模式');$('oneDriveAccount').textContent='需要 HTTPS 才能登录'}else if(!clientId()){status('','等待应用配置');$('oneDriveAccount').textContent='请填写 Client ID'}else if(ac){status('ok','OneDrive 已连接');$('oneDriveAccount').textContent=ac.username||ac.name||'Microsoft 账号'}else{status('','未连接 OneDrive');$('oneDriveAccount').textContent='点击连接并授权应用文件夹权限'}
    $('oneDriveLastSync').textContent=cloud.lastSync?'上次同步：'+new Date(cloud.lastSync).toLocaleString('zh-CN'):'尚未同步';$('oneDriveBtn').textContent=ac?'☁ OneDrive ✓':'☁ OneDrive';
  }
  window.addEventListener('focus',async()=>{if(cloud.auto&&await account())sync(false)});
  ui();
})();
