const $=id=>document.getElementById(id),F=globalThis.FocusFlowShield;
const DEFAULTS=['youtube.com','youtu.be','instagram.com','reddit.com','tiktok.com'];
const patterns=domain=>[`http://*.${domain}/*`,`https://*.${domain}/*`];
let missingDefaults=[],masterEnabled=true;

function send(kind,data={}){return F.sendRuntimeMessage(chrome.runtime,{namespace:'FF_SHIELD_MANAGE_V2',kind,...data},2500);}

async function refresh(){
 try{
  const result=await send('status');
  if(!result.ok)throw Error(result.error||'The background service worker did not respond.');
  if(result.managementApiVersion!==F.MANAGEMENT_API_VERSION)throw Error('FocusFlow Shield files are out of sync. Open chrome://extensions, reload Distraction Shield, then reopen this popup.');
  const state=result.state,missing=result.missingPermissions||[],records=result.domains||[];
  masterEnabled=state.masterEnabled!==false;
  const session=!!state.sessionActive&&!state.syncLost,actual=!!result.blockingActive;
  missingDefaults=missing.filter(domain=>DEFAULTS.includes(domain));
  $('master').checked=masterEnabled;
  $('master').disabled=false;
  $('master-state').textContent=masterEnabled?'ON':'OFF';
  $('master-explanation').textContent=masterEnabled
   ?'ON allows blocking during a live study session, or outside one when the separate keep-blocking setting is enabled.'
   :'OFF removes all blocking rules. Sessions and individual website settings remain unchanged.';
  $('status').textContent=!masterEnabled?'Blocking turned off manually':actual?(session?'Blocking active':'Blocking active outside session'):result.permissionMissingCount>0?'Permissions required':session?'Session active · no matching rules installed':'Ready — starts with study session';
  $('connection').textContent=`Session: ${F.sessionSyncLabel(state)} · Chrome confirms ${result.installed} installed rules`;
  $('permissions').textContent=missingDefaults.length===0?'Permissions: all enabled default sites granted':missingDefaults.length===DEFAULTS.length?'Permissions: not granted':'Permissions: partially granted';
  $('missing').replaceChildren(...missingDefaults.map(domain=>{const item=document.createElement('li');item.textContent=`Missing access: ${domain}`;return item;}));
  $('grant').disabled=missingDefaults.length===0;
  $('override').checked=!!state.manualOverride;
  $('domains').replaceChildren(...DEFAULTS.map(domain=>{
   const item=document.createElement('li'),label=document.createElement('span'),record=records.find(value=>value.domain===domain);
   label.textContent=domain+(record?.enabled===false?' · disabled':!record?.permitted?' · permission needed':record?.activelyBlocked?' · rule installed':' · rule inactive');
   item.append(label);return item;
  }));
  $('error').textContent='';
 }catch(error){
  const mismatch=error instanceof Error&&error.message.includes('files are out of sync');
  $('status').textContent=mismatch?'Extension update required':'Extension service worker unavailable';
  $('connection').textContent=mismatch?'The popup and service worker need to be reloaded together.':'Extension disconnected · the popup could not reach the service worker.';
  $('error').textContent=error instanceof Error?error.message:'Could not load extension status.';
  $('grant').disabled=true;$('master').disabled=true;
 }
}

$('master').addEventListener('change',async event=>{
 const input=event.currentTarget,requested=input.checked;input.disabled=true;
 const result=await send('master',{value:requested});
 if(!result.ok){input.checked=masterEnabled;$('error').textContent=result.error?.includes('Unsupported management command')?'The installed service worker does not support this control. Reload Distraction Shield at chrome://extensions.':result.error||'Could not update Website Blocking.';input.disabled=false;return;}
 await refresh();
});
$('grant').onclick=async()=>{
 try{const granted=await chrome.permissions.request({origins:missingDefaults.flatMap(patterns)});if(!granted)$('error').textContent='Chrome did not grant all requested default website permissions.';}
 catch(error){$('error').textContent=error instanceof Error?error.message:'Permission request failed.';}
 await refresh();
};
$('manage').onclick=()=>{void F.openOptionsWithFallback(()=>chrome.runtime.openOptionsPage(),()=>chrome.tabs.create({url:chrome.runtime.getURL('options.html')})).then(result=>{$('error').textContent=result.ok?'':result.error;});};
$('override').onchange=async event=>{
 try{const result=await send('override',{value:event.currentTarget.checked});if(!result.ok)throw Error(result.error);await refresh();}
 catch(error){$('error').textContent=error instanceof Error?error.message:'Could not update blocking override.';}
};
void refresh();
