export const SHIELD_PROTOCOL = 'FOCUSFLOW_SHIELD_V1';
export const SHIELD_ORIGIN = 'http://localhost:3000';
export type ShieldLifecycle = 'start'|'pause'|'resume'|'end'|'complete'|'heartbeat'|'ping';
export type ShieldWebsiteStatus = {connected:boolean;masterEnabled:boolean;sessionActive:boolean;blockingActive:boolean;installedRuleCount:number;configuredDomainCount:number;enabledDomainCount:number;permittedDomainCount:number;activelyBlockedDomainCount:number;permissionMissingCount:number};
export function validShieldWebsiteStatus(value:unknown):value is ShieldWebsiteStatus {
 if(!value||typeof value!=='object')return false;const s=value as Record<string,unknown>;
 const keys=['connected','masterEnabled','sessionActive','blockingActive','installedRuleCount','configuredDomainCount','enabledDomainCount','permittedDomainCount','activelyBlockedDomainCount','permissionMissingCount'];
 return Object.keys(s).length===keys.length&&keys.every(k=>Object.hasOwn(s,k))&&['connected','masterEnabled','sessionActive','blockingActive'].every(k=>typeof s[k]==='boolean')&&keys.slice(4).every(k=>Number.isSafeInteger(s[k])&&(s[k] as number)>=0);
}
export function validWebsiteStatusEnvelope(value:unknown,requestId:string):value is ShieldWebsiteStatus {
 if(!value||typeof value!=='object')return false;const v=value as Record<string,unknown>;
 const envelopeKeys=['protocol','version','type','requestId','connected','masterEnabled','sessionActive','blockingActive','installedRuleCount','configuredDomainCount','enabledDomainCount','permittedDomainCount','activelyBlockedDomainCount','permissionMissingCount'];
 if(Object.keys(v).length!==envelopeKeys.length||!envelopeKeys.every(k=>Object.hasOwn(v,k)))return false;
 return v.protocol===SHIELD_PROTOCOL&&v.version===1&&v.type==='status_response'&&v.requestId===requestId&&validShieldWebsiteStatus({connected:v.connected,masterEnabled:v.masterEnabled,sessionActive:v.sessionActive,blockingActive:v.blockingActive,installedRuleCount:v.installedRuleCount,configuredDomainCount:v.configuredDomainCount,enabledDomainCount:v.enabledDomainCount,permittedDomainCount:v.permittedDomainCount,activelyBlockedDomainCount:v.activelyBlockedDomainCount,permissionMissingCount:v.permissionMissingCount});
}
export function isCurrentStatusRequest(expected:number,requestId:string){return Number(requestId.split('-').at(-1))===expected;}
export function shouldRetryStatus(attempt:number,maxAttempts=3){return Number.isSafeInteger(attempt)&&Number.isSafeInteger(maxAttempts)&&attempt>=1&&attempt<maxAttempts;}
export function withAckTimeout<T>(response:Promise<T>,timeoutMs:number,fallback:T):Promise<T>{return new Promise(resolve=>{let finished=false;const finish=(value:T)=>{if(finished)return;finished=true;clearTimeout(timer);resolve(value);};const timer=setTimeout(()=>finish(fallback),Math.max(1,timeoutMs));response.then(finish,()=>finish(fallback));});}
export function isAllowedWebsiteCommand(value:unknown):value is {protocol:typeof SHIELD_PROTOCOL;version:1;type:'open_settings';requestId:string} {
 if(!value||typeof value!=='object')return false;const v=value as Record<string,unknown>;
 return Object.keys(v).sort().join(',')==='protocol,requestId,type,version'&&v.protocol===SHIELD_PROTOCOL&&v.version===1&&v.type==='open_settings'&&typeof v.requestId==='string'&&v.requestId.length>0&&v.requestId.length<=100;
}
export function validOpenSettingsResponse(value:unknown,requestId:string){if(!value||typeof value!=='object')return false;const v=value as Record<string,unknown>,keys=Object.keys(v).sort().join(',');return (keys==='ok,protocol,requestId,type,version'||keys==='error,ok,protocol,requestId,type,version')&&v.protocol===SHIELD_PROTOCOL&&v.version===1&&v.type==='open_settings_response'&&v.requestId===requestId&&typeof v.ok==='boolean'&&(v.error===undefined||typeof v.error==='string');}
export type ShieldMessage = {protocol:typeof SHIELD_PROTOCOL;version:1;type:ShieldLifecycle;sessionId:string;sequence:number};
export function lifecycleMessage(before:{lifecycle:string;manual:boolean},after:{lifecycle:string;manual:boolean}):Exclude<ShieldLifecycle,'ping'>|null {
  if(before.lifecycle!=='running'&&after.lifecycle==='running')return 'start';
  if(before.lifecycle==='running'&&after.lifecycle==='completed')return 'complete';
  if(before.lifecycle==='running'&&after.lifecycle==='ended')return 'end';
  if(before.lifecycle==='running'&&!before.manual&&after.manual)return 'pause';
  if(before.lifecycle==='running'&&before.manual&&!after.manual)return 'resume';
  return null;
}
export function makeShieldMessage(type:ShieldLifecycle,sessionId:string,sequence:number):ShieldMessage {
  if(!sessionId||!Number.isSafeInteger(sequence)||sequence<0) throw new Error('Invalid shield message identity');
  return {protocol:SHIELD_PROTOCOL,version:1,type,sessionId,sequence};
}
export function validShieldAck(value:unknown): value is {protocol:typeof SHIELD_PROTOCOL;version:1;type:'ack';requestType?:string;sequence:number;acknowledged:boolean;state?:{sessionActive:boolean;syncLost:boolean;blockingActive:boolean}} {
  if(!value||typeof value!=='object') return false;
  const a=value as Record<string,unknown>;
  if(a.protocol!==SHIELD_PROTOCOL||a.version!==1||a.type!=='ack'||!Number.isSafeInteger(a.sequence)||(a.sequence as number)<0||typeof a.acknowledged!=='boolean') return false;
  if(a.requestType!==undefined&&typeof a.requestType!=='string')return false;
  if(a.error!==undefined&&typeof a.error!=='string')return false;
  if(a.state!==undefined&&a.state!==null){const s=a.state as Record<string,unknown>;if(!s||typeof s.sessionActive!=='boolean'||typeof s.syncLost!=='boolean'||typeof s.blockingActive!=='boolean')return false;}
  return true;
}
