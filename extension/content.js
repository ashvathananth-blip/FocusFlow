(() => {
 const PROTOCOL='FOCUSFLOW_SHIELD_V1', ORIGIN=window.location.origin, NS='FF_SHIELD_INTERNAL_V1', F=globalThis.FocusFlowShield;
 if(!F.isAllowedOrigin(ORIGIN))return;
 let lastSeq=-1,sessionId=null;
 const send=message=>F.sendRuntimeMessage(chrome.runtime,message,2500);
 const post=value=>window.postMessage({protocol:PROTOCOL,version:1,...value},ORIGIN);
 window.addEventListener('message',event=>{
  if(event.source!==window||event.origin!==ORIGIN)return;
  const message=event.data;
  if(!message||message.protocol!==PROTOCOL||message.version!==1)return;
  if(message.type==='open_settings'){
   if(Object.keys(message).sort().join(',')!=='protocol,requestId,type,version'||typeof message.requestId!=='string'||message.requestId.length>100){post({type:'open_settings_response',requestId:typeof message.requestId==='string'?message.requestId:'',ok:false,error:'Invalid settings request.'});return;}
   void send({namespace:NS,kind:'open_settings'}).then(result=>post({type:'open_settings_response',requestId:message.requestId,ok:result.ok===true,...(result.ok?{}:{error:result.error})}));
   return;
  }
  if(message.type==='status_request'){
   if(Object.keys(message).sort().join(',')!=='protocol,requestId,type,version'||typeof message.requestId!=='string'||message.requestId.length>100){post({type:'status_error',requestId:typeof message.requestId==='string'?message.requestId:'',error:'Invalid status request.'});return;}
   void send({namespace:NS,kind:'status',requestId:message.requestId}).then(result=>{
    if(!result.ok){post({type:'status_error',requestId:message.requestId,error:result.error});return;}
    post({type:'status_response',requestId:message.requestId,connected:result.connected===true,masterEnabled:result.masterEnabled===true,sessionActive:result.sessionActive===true,blockingActive:result.blockingActive===true,installedRuleCount:result.installedRuleCount,configuredDomainCount:result.configuredDomainCount,enabledDomainCount:result.enabledDomainCount,permittedDomainCount:result.permittedDomainCount,activelyBlockedDomainCount:result.activelyBlockedDomainCount,permissionMissingCount:result.permissionMissingCount});
   });
   return;
  }
  if(['start','pause','resume','end','complete','heartbeat','ping'].includes(message.type)){
   if(Object.keys(message).sort().join(',')!=='protocol,sequence,sessionId,type,version'||typeof message.sessionId!=='string'||!Number.isSafeInteger(message.sequence)||message.sequence<0){post({type:'ack',requestType:message.type,sequence:Number.isSafeInteger(message.sequence)?message.sequence:-1,acknowledged:false,error:'Invalid lifecycle message.'});return;}
   if(sessionId===message.sessionId&&message.sequence<=lastSeq){post({type:'ack',requestType:message.type,sequence:message.sequence,acknowledged:false,error:'Stale lifecycle message.'});return;}
   if(message.type==='start'||sessionId!==message.sessionId){sessionId=message.sessionId;lastSeq=-1;}
   lastSeq=message.sequence;
   void send({namespace:NS,kind:'lifecycle',payload:message}).then(result=>post({type:'ack',requestType:message.type,sequence:message.sequence,acknowledged:result.ok===true,...(result.ok?{state:result.state?{sessionActive:result.state.sessionActive,syncLost:result.state.syncLost,blockingActive:result.blockingActive}:null}:{error:result.error})}));
   return;
  }
  post({type:'bridge_error',error:'Unsupported bridge request.'});
 });
 post({type:'extension-ready'});
})();
