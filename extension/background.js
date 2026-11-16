importScripts('lib.js');
const F=FocusFlowShield;
let serializedWork=Promise.resolve();
function serialize(operation){const work=serializedWork.then(operation);serializedWork=work.then(()=>undefined,()=>undefined);return work;}

async function state(){const value=await chrome.storage.local.get(null),next=F.migrateState(value);if(value.schemaVersion!==F.SCHEMA||!Array.isArray(value.blockedDomains)||typeof value.blockedDomains[0]==='string'||Object.hasOwn(value,'bypasses'))await chrome.storage.local.set(next);if(Object.hasOwn(value,'bypasses'))await chrome.storage.local.remove('bypasses');return next;}
async function save(value){await chrome.storage.local.set(value);}
async function clearObsoleteBypassAlarms(){
 const alarms=await chrome.alarms.getAll();
 await Promise.all(F.obsoleteAlarmNames(alarms).map(name=>chrome.alarms.clear(name)));
}
async function reconcile(now=Date.now()){
 const s=await state();
 if(s.sessionActive&&F.stale(s,now)){s.syncLost=true;s.sessionActive=false;}
 const domains=F.domainList(s),enabled=domains.filter(x=>x.enabled).map(x=>x.domain),granted=[];
 for(const {domain} of domains)if(await chrome.permissions.contains({origins:F.permissionPatterns([domain])}))granted.push(domain);
 await save(s);
 const permittedEnabled=enabled.filter(domain=>granted.includes(domain));
 const desired=F.desiredRules(s,permittedEnabled,now),reconciled=await F.reconcileDynamicRules(chrome.declarativeNetRequest,desired);
 const activeDomains=reconciled.installed.map(rule=>rule.condition.requestDomains[0]);
 const missingPermissions=enabled.filter(domain=>!granted.includes(domain));
 return {state:s,installed:activeDomains.length,activeDomains,missingPermissions,blockingActive:activeDomains.length>0,configuredDomainCount:domains.length,enabledDomainCount:enabled.length,permittedDomainCount:granted.length,activelyBlockedDomainCount:activeDomains.length,permissionMissingCount:missingPermissions.length,domains:domains.map(x=>({...x,permitted:granted.includes(x.domain),activelyBlocked:activeDomains.includes(x.domain)}))};
}
async function message(payload,sender){
 if(!F.trustedWebsiteSender(sender))throw Error('Untrusted origin.');
 const current=await state(),accepted=F.acceptLifecycle(current,payload,Date.now());
 if(!accepted.ok&&payload.type!=='ping')throw Error('Stale or invalid lifecycle message.');
 if(accepted.ok&&payload.type!=='ping')await save({...accepted.state,syncLost:false});
 return reconcile();
}
async function statusRequest(request,sender){
 if(!request||Object.keys(request).sort().join(',')!=='kind,namespace,requestId'||typeof request.requestId!=='string'||request.requestId.length>100)throw Error('Invalid status request.');
 if(!F.trustedWebsiteSender(sender))throw Error('Untrusted origin.');
 const result=await reconcile();
 return {requestId:request.requestId,connected:true,managementApiVersion:F.MANAGEMENT_API_VERSION,masterEnabled:result.state.masterEnabled!==false,sessionActive:!!result.state.sessionActive,blockingActive:result.blockingActive,installedRuleCount:result.installed,configuredDomainCount:result.configuredDomainCount,enabledDomainCount:result.enabledDomainCount,permittedDomainCount:result.permittedDomainCount,activelyBlockedDomainCount:result.activelyBlockedDomainCount,permissionMissingCount:result.permissionMissingCount};
}
async function openSettings(request,sender){
 if(!request||Object.keys(request).sort().join(',')!=='kind,namespace'||request.kind!=='open_settings'||request.namespace!=='FF_SHIELD_INTERNAL_V1')throw Error('Invalid settings command.');
 if(!F.trustedWebsiteSender(sender))throw Error('Untrusted origin.');
 await chrome.runtime.openOptionsPage();
 return {opened:true};
}
function trustedExtensionManagementPage(sender){
 if(sender?.id!==chrome.runtime.id||typeof sender.url!=='string')return false;
 try{const url=new URL(sender.url),extension=new URL(chrome.runtime.getURL('options.html'));return url.origin===extension.origin&&['/options.html','/popup.html'].includes(url.pathname);}catch{return false;}
}
function trustedOptionsPage(sender){
 if(sender?.id!==chrome.runtime.id||typeof sender.url!=='string')return false;
 try{const url=new URL(sender.url),extension=new URL(chrome.runtime.getURL('options.html'));return url.origin===extension.origin&&url.pathname==='/options.html';}catch{return false;}
}
function trustedPopupPage(sender){
 if(sender?.id!==chrome.runtime.id||typeof sender.url!=='string')return false;
 try{const url=new URL(sender.url),extension=new URL(chrome.runtime.getURL('popup.html'));return url.origin===extension.origin&&url.pathname==='/popup.html';}catch{return false;}
}
function trustedBlockedPage(sender){
 return F.trustedBlockedPage(sender,chrome.runtime.id,chrome.runtime.getURL('blocked.html'));
}
function reportBackgroundError(where,error){console.error(`[FocusFlow Shield] ${where} failed:`,error);}
function scheduleReconcile(where){void serialize(()=>reconcile()).catch(error=>reportBackgroundError(where,error));}
function scheduleAlarm(){try{const pending=chrome.alarms.create(F.ALARM,{periodInMinutes:0.5});if(pending&&typeof pending.catch==='function')void pending.catch(error=>reportBackgroundError('maintenance alarm',error));}catch(error){reportBackgroundError('maintenance alarm',error);}}
function initialize(where){void serialize(async()=>{try{await clearObsoleteBypassAlarms();}catch(error){reportBackgroundError('obsolete alarm cleanup',error);}const current=await state();await save(current);scheduleAlarm();return reconcile();}).catch(error=>reportBackgroundError(where,error));}
function ruleInstalled(rules,domain){const rule=F.ruleFor(domain);return rules.some(x=>x.id===rule.id&&x.action?.type==='redirect'&&x.condition?.requestDomains?.includes(domain)&&x.condition?.resourceTypes?.includes('main_frame'));}
async function returnFocus(request,sender){
 if(!request||Object.keys(request).sort().join(',')!=='kind,namespace'||request.namespace!=='FF_SHIELD_BLOCKED_V1'||request.kind!=='return_focus')throw Error('Invalid Return to FocusFlow request.');
 if(!trustedBlockedPage(sender))throw Error('Return requests are accepted only from FocusFlow Shield blocked.html.');
 return F.returnToFocusFlow(chrome.tabs,chrome.windows);
}
async function manage(request,sender){
 if(!trustedExtensionManagementPage(sender))throw Error('Untrusted extension page.');
 const commandError=F.managementCommandError(request);if(commandError)throw Error(commandError);
 if(request.kind==='status')return {...await reconcile(),managementApiVersion:F.MANAGEMENT_API_VERSION};
 const current=await state();
 if(request.kind==='master'){
  if(!trustedPopupPage(sender))throw Error('Only the extension popup can change master blocking.');
  const next=F.setMasterEnabled(current,request.value);await save(next);return reconcile();
 }
 if(request.kind==='add'||request.kind==='setEnabled'||request.kind==='remove'){
  const next=F.changeDomains(current,{type:request.kind,domain:request.domain,enabled:request.enabled,confirmed:request.confirmed});
  await save(next);return reconcile();
 }
 if(request.kind==='override'){current.manualOverride=!!request.value;await save(current);return reconcile();}
 throw Error(`Unsupported management command: ${request.kind}.`);
}
async function dispatch(request,sender){
 if(request?.namespace==='FF_SHIELD_INTERNAL_V1'){
  if(request.kind==='lifecycle')return message(request.payload,sender);
  if(request.kind==='status')return statusRequest(request,sender);
  if(request.kind==='open_settings')return openSettings(request,sender);
  throw Error('Unsupported page bridge command.');
 }
 if(request?.namespace==='FF_SHIELD_MANAGE_V2'){
  return manage(request,sender);
 }
 if(request?.namespace==='FF_SHIELD_BLOCKED_V1')return returnFocus(request,sender);
 throw Error('Unsupported extension message.');
}
chrome.runtime.onInstalled.addListener(()=>initialize('installation reconciliation'));
chrome.runtime.onStartup.addListener(()=>initialize('startup reconciliation'));
chrome.alarms.onAlarm.addListener(()=>scheduleReconcile('alarm reconciliation'));
chrome.permissions.onRemoved.addListener(()=>scheduleReconcile('permission revocation reconciliation'));
chrome.runtime.onMessage.addListener((request,sender,reply)=>F.respondAsync(reply,()=>serialize(()=>dispatch(request,sender))));
initialize('initial reconciliation');
