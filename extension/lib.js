(function(root){
 const DEFAULTS=['youtube.com','youtu.be','instagram.com','reddit.com','tiktok.com'];
 const RULE_BASE=41000, STALE_MS=90000, ALARM='focusflow-shield-maintenance', LEGACY_BYPASS_PREFIX='focusflow-bypass:', PROTOCOL='FOCUSFLOW_SHIELD_V1', SCHEMA=5, MANAGEMENT_API_VERSION=4;
 const RULE_IDS=Object.fromEntries([...DEFAULTS].map((d,i)=>[d,RULE_BASE+i]));
 const FOCUSFLOW_ORIGIN='http://localhost:3000',FOCUSFLOW_STUDY_URL=FOCUSFLOW_ORIGIN+'/study';
 const ALLOWED_ORIGINS=[FOCUSFLOW_ORIGIN];
 function isAllowedOrigin(origin){return ALLOWED_ORIGINS.includes(origin);}
 function trustedWebsiteSender(sender){try{return isAllowedOrigin(sender?.origin)&&new URL(sender.tab.url).origin===sender.origin;}catch{return false;}}
 function permissionPatterns(domains){return domains.flatMap(d=>[`http://*.${d}/*`,`https://*.${d}/*`]);}
 function normalizeDomain(input){if(typeof input!=='string'||input.length>253||input!==input.trim()||/[\/*?#@:\s\[\]]/.test(input))throw Error('Enter a hostname only, without a scheme, path, wildcard, or query.');let h=input.toLowerCase().replace(/\.$/,'').replace(/^www\./,'');if(!h||h==='localhost'||/^\d+(\.\d+){3}$/.test(h)||h.includes(':')||!h.includes('.')||!h.split('.').every(x=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x)))throw Error('Invalid domain.');if(h.endsWith('.localhost')||h.endsWith('.vercel.app')||h.endsWith('.chrome-extension')||h==='chrome-extension')throw Error('Trusted/internal domains cannot be blocked.');return h;}
 function matchesHost(host,domain){return host===domain||host.endsWith('.'+domain);}
 function domainRecords(value){return (Array.isArray(value)?value:[]).map(x=>typeof x==='string'?{domain:x,enabled:true,isDefault:DEFAULTS.includes(x)}:{domain:x.domain,enabled:x.enabled!==false,isDefault:DEFAULTS.includes(x.domain)?true:!!x.isDefault}).filter(x=>typeof x.domain==='string');}
 function migrateState(value={}){const old=Array.isArray(value.blockedDomains)?domainRecords(value.blockedDomains):[];const map=new Map(old.map(x=>[normalizeDomain(x.domain),{...x,domain:normalizeDomain(x.domain),isDefault:DEFAULTS.includes(normalizeDomain(x.domain))}]));for(const d of DEFAULTS)if(!map.has(d))map.set(d,{domain:d,enabled:true,isDefault:true});const migrated={...value};delete migrated.bypasses;return {...defaults(),...migrated,schemaVersion:SCHEMA,masterEnabled:typeof value.masterEnabled==='boolean'?value.masterEnabled:value.emergencyDisabled!==true,emergencyDisabled:false,blockedDomains:[...map.values()]};}
 function ruleFor(domain){const id=RULE_IDS[domain]??(100000+hashId(domain));return {id,priority:1,action:{type:'redirect',redirect:{extensionPath:'/blocked.html?domain='+encodeURIComponent(domain)}},condition:{requestDomains:[domain],resourceTypes:['main_frame']}};}
 function hashId(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h%2000000000;}
 function domainList(state){return domainRecords(state.blockedDomains);}
 function redundantDomain(domain,records,exclude){return records.some(x=>x.domain!==exclude&&(domain===x.domain||domain.endsWith('.'+x.domain)||x.domain.endsWith('.'+domain)));}
 function changeDomains(state,command){const domains=domainList(state),domain=normalizeDomain(command.domain),record=domains.find(x=>x.domain===domain);if(command.type==='add'){if(redundantDomain(domain,domains))throw Error('This domain is already configured or covered by a configured parent domain.');return {...state,blockedDomains:[...domains,{domain,enabled:true,isDefault:false}]};}if(!record)throw Error('Domain is not configured.');if(command.type==='remove'){if(record.isDefault)throw Error('Default domains cannot be removed.');if(state.sessionActive&&!command.confirmed)throw Error('Confirmation required while a session is active.');return {...state,blockedDomains:domains.filter(x=>x.domain!==domain)};}if(command.type==='setEnabled'){if(!command.enabled&&state.sessionActive&&!command.confirmed)throw Error('Confirmation required while a session is active.');return {...state,blockedDomains:domains.map(x=>x.domain===domain?{...x,enabled:!!command.enabled}:x)};}throw Error('Unsupported domain command.');}
 function permittedDomains(domains,grantedPatterns){return domains.filter(d=>permissionPatterns([d]).every(p=>grantedPatterns.includes(p)));}
 function permissionSummary(domains,grantedPatterns){const permitted=permittedDomains(domains,grantedPatterns);return {permitted,missing:domains.filter(d=>!permitted.includes(d)),complete:permitted.length===domains.length};}
 function desiredRules(state,permitted=domainList(state).filter(x=>x.enabled).map(x=>x.domain),now=Date.now()){if(!effectiveBlocking(state,now))return [];const enabled=new Set(domainList(state).filter(x=>x.enabled).map(x=>x.domain));return permitted.filter(d=>enabled.has(d)).map(ruleFor);}
 function effectiveBlocking(s,now=Date.now()){return s.masterEnabled!==false&&((s.sessionActive&&!stale(s,now))||s.manualOverride);}
 function setMasterEnabled(state,enabled){if(typeof enabled!=='boolean')throw Error('Master blocking value must be boolean.');return {...state,masterEnabled:enabled,emergencyDisabled:false};}
 function managementCommandError(request){
  if(!request||request.namespace!=='FF_SHIELD_MANAGE_V2'||typeof request.kind!=='string')return 'Invalid management command envelope.';
  const keys=Object.keys(request).sort().join(',');
  const shapes={status:'kind,namespace',master:'kind,namespace,value',override:'kind,namespace,value',add:'domain,kind,namespace',setEnabled:'confirmed,domain,enabled,kind,namespace',remove:'confirmed,domain,kind,namespace'};
  if(!Object.hasOwn(shapes,request.kind))return `Unsupported management command: ${request.kind}.`;
  if(keys!==shapes[request.kind])return `Invalid ${request.kind} command envelope.`;
  if(['master','override'].includes(request.kind)&&typeof request.value!=='boolean')return `Invalid ${request.kind} command value.`;
  if(request.kind==='setEnabled'&&(typeof request.enabled!=='boolean'||typeof request.confirmed!=='boolean'))return 'Invalid setEnabled command values.';
  if(['remove','setEnabled'].includes(request.kind)&&typeof request.confirmed!=='boolean')return `Invalid ${request.kind} confirmation.`;
  if(['add','setEnabled','remove'].includes(request.kind)&&typeof request.domain!=='string')return `Invalid ${request.kind} domain.`;
  return null;
 }
 function sessionSyncLabel(state){if(state?.sessionActive)return state.syncLost?'Active session · heartbeat stale':'Active · synchronized';if(state?.syncLost)return 'Inactive · previous session heartbeat stale';return 'Inactive · no active session';}
 function selectFocusFlowTab(tabs){
  return (Array.isArray(tabs)?tabs:[]).filter(tab=>{
   if(typeof tab?.url!=='string')return false;
   try{return isAllowedOrigin(new URL(tab.url).origin);}catch{return false;}
  }).sort((a,b)=>{
   const isStudy=tab=>{try{return ['/study','/study/'].includes(new URL(tab.url).pathname);}catch{return false;}};
   return Number(isStudy(b))-Number(isStudy(a))||Number(!!b.active)-Number(!!a.active)||(b.lastAccessed||0)-(a.lastAccessed||0)||(a.id||0)-(b.id||0);
  })[0]||null;
 }
 async function returnToFocusFlow(tabsApi,windowsApi){
  let tabs;
  try{tabs=await tabsApi.query({url:ALLOWED_ORIGINS.map(origin=>origin+'/*')});}catch(error){throw Error(`Could not search for FocusFlow tabs: ${String(error&&error.message||error)}`);}
  const tab=selectFocusFlowTab(tabs);
  if(tab){
   if(!Number.isInteger(tab.id))throw Error('The existing FocusFlow tab has no valid tab identifier.');
   try{await tabsApi.update(tab.id,{active:true});}catch(error){throw Error(`Could not activate the existing FocusFlow tab: ${String(error&&error.message||error)}`);}
   if(Number.isInteger(tab.windowId)&&tab.windowId>=0)try{await windowsApi.update(tab.windowId,{focused:true});}catch(error){throw Error(`The Study tab is active, but its Chrome window could not be focused: ${String(error&&error.message||error)}`);}
   return {opened:false,tabId:tab.id,matchedStudy:['/study','/study/'].includes(new URL(tab.url).pathname)};
  }
  let opened;
  try{opened=await tabsApi.create({url:FOCUSFLOW_STUDY_URL,active:true});}catch(error){throw Error(`Could not open a new FocusFlow Study tab: ${String(error&&error.message||error)}`);}
  if(Number.isInteger(opened?.windowId)&&opened.windowId>=0)try{await windowsApi.update(opened.windowId,{focused:true});}catch(error){throw Error(`A new Study tab opened, but its Chrome window could not be focused: ${String(error&&error.message||error)}`);}
  return {opened:true,tabId:Number.isInteger(opened?.id)?opened.id:null,matchedStudy:true};
 }
 function stale(s,now){return !s.lastHeartbeatAt||now-s.lastHeartbeatAt>=STALE_MS;}
 function obsoleteAlarmNames(alarms){return (Array.isArray(alarms)?alarms:[]).map(alarm=>alarm?.name).filter(name=>typeof name==='string'&&name.startsWith(LEGACY_BYPASS_PREFIX));}
 function isManagedRuleId(id){return Object.values(RULE_IDS).includes(id)||(Number.isSafeInteger(id)&&id>=100000&&id<2100000000);}
 function stableJson(value){if(Array.isArray(value))return '['+value.map(stableJson).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableJson(value[k])).join(',')+'}';return JSON.stringify(value);}
 function reconcilePlan(installed,desired){const managed=installed.filter(r=>isManagedRuleId(r.id)),same=managed.length===desired.length&&managed.every(a=>{const b=desired.find(x=>x.id===a.id);return !!b&&stableJson(a)===stableJson(b)});return same?null:{removeRuleIds:managed.map(r=>r.id),addRules:desired};}
 async function reconcileDynamicRules(api,desired){const before=await api.getDynamicRules(),plan=reconcilePlan(before,desired);if(plan)await api.updateDynamicRules(plan);const actual=await api.getDynamicRules(),ids=new Set(actual.map(r=>r.id));return {plan,actual,installed:desired.filter(r=>ids.has(r.id))};}
 function sendRuntimeMessage(runtime,message,timeoutMs=2500){return new Promise(resolve=>{let settled=false,timer;const finish=value=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);resolve(value);};const receive=response=>{if(!response||typeof response!=='object'){finish({ok:false,error:'The extension returned no response.'});return;}finish(response);};timer=setTimeout(()=>finish({ok:false,error:'The extension did not respond before the request timed out.'}),Math.max(1,timeoutMs));try{const returned=runtime.sendMessage(message,response=>{const lastError=runtime.lastError;if(lastError){finish({ok:false,error:String(lastError.message||lastError)});return;}receive(response);});if(returned&&typeof returned.then==='function')returned.then(receive,error=>finish({ok:false,error:String(error&&error.message||error)}));}catch(error){finish({ok:false,error:String(error&&error.message||error)});}});}
 function respondAsync(reply,operation){let sent=false;const respond=value=>{if(sent)return;sent=true;try{reply(value);}catch(error){if(typeof console!=='undefined')console.debug('Extension response port already closed.',error);}};Promise.resolve().then(operation).then(value=>respond({ok:true,...(value&&typeof value==='object'?value:{value})}),error=>respond({ok:false,error:String(error&&error.message||error||'Unknown extension error.')}));return true;}
 async function openOptionsWithFallback(openOptions,openTab){try{await openOptions();return {ok:true,usedFallback:false};}catch(first){try{await openTab();return {ok:true,usedFallback:true};}catch(second){return {ok:false,error:`Could not open website settings. ${String(second&&second.message||second||first&&first.message||first)}`};}}}
 function acceptLifecycle(s,m,now){if(!m||m.protocol!==PROTOCOL||m.version!==1||!['start','pause','resume','end','complete','heartbeat','ping'].includes(m.type)||typeof m.sessionId!=='string'||!m.sessionId||!Number.isSafeInteger(m.sequence)||m.sequence<0)return {ok:false,state:s};if(m.type==='ping')return {ok:true,state:s};let sessions={...(s.sessions||{})},old=sessions[m.sessionId]||{sequence:-1,ended:false};if(m.sequence<=old.sequence||old.ended)return {ok:false,state:s};let ended=['end','complete'].includes(m.type), active=['start','pause','resume','heartbeat'].includes(m.type);sessions[m.sessionId]={sequence:m.sequence,ended};let latest={sessionId:m.sessionId,sequence:m.sequence};return {ok:true,state:{...s,sessions,latestSession:active?latest:(s.latestSession?.sessionId===m.sessionId?null:s.latestSession),sessionActive:active,lastHeartbeatAt:active?now:s.lastHeartbeatAt}};}
 function trustedBlockedPage(sender,extensionId,blockedPageUrl){if(sender?.id!==extensionId||typeof sender.url!=='string')return false;try{const page=new URL(sender.url),blocked=new URL(blockedPageUrl);return page.origin===blocked.origin&&page.pathname===blocked.pathname;}catch{return false;}}
 function withTimeout(promise,timeoutMs,fallback){return new Promise(resolve=>{let done=false;const timer=setTimeout(()=>finish(fallback),Math.max(1,timeoutMs));function finish(value){if(done)return;done=true;clearTimeout(timer);resolve(value);}Promise.resolve(promise).then(finish,()=>finish(fallback));});}
 function defaults(){return {schemaVersion:SCHEMA,masterEnabled:true,sessionActive:false,lastHeartbeatAt:0,blockedDomains:DEFAULTS.map(domain=>({domain,enabled:true,isDefault:true})),manualOverride:false,emergencyDisabled:false,sessions:{},latestSession:null,syncLost:false};}
 const api={ALLOWED_ORIGINS,isAllowedOrigin,trustedWebsiteSender,DEFAULTS,RULE_BASE,RULE_IDS,STALE_MS,ALARM,LEGACY_BYPASS_PREFIX,PROTOCOL,SCHEMA,MANAGEMENT_API_VERSION,FOCUSFLOW_ORIGIN,FOCUSFLOW_STUDY_URL,permissionPatterns,domainRecords,migrateState,domainList,redundantDomain,changeDomains,permittedDomains,permissionSummary,normalizeDomain,matchesHost,ruleFor,desiredRules,effectiveBlocking,setMasterEnabled,managementCommandError,sessionSyncLabel,selectFocusFlowTab,returnToFocusFlow,stale,obsoleteAlarmNames,isManagedRuleId,reconcilePlan,reconcileDynamicRules,sendRuntimeMessage,respondAsync,openOptionsWithFallback,withTimeout,acceptLifecycle,trustedBlockedPage,defaults};
 if(typeof module!=='undefined')module.exports=api;root.FocusFlowShield=api;
})(globalThis);
