'use strict';
document.getElementById('loginForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const submit=document.getElementById('submit'),status=document.getElementById('status');
 submit.disabled=true;status.textContent='正在登录…';
 try{
  const result=await ScheduleSyncClient.request('login','POST',{
   username:document.getElementById('username').value.trim(),password:document.getElementById('password').value});
  sessionStorage.setItem('schedule-last-account',JSON.stringify(result.user));
  document.getElementById('password').value='';location.replace('./?sync=1');
 }catch(error){status.textContent=error.message||'登录失败，请检查网络后重试';}
 finally{submit.disabled=false;}
});
