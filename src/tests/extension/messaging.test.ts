import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const F:any=require('../../../extension/lib.js');
function createWorkerHarness(clock:{now:number},storage:Record<string,unknown>={},dynamicRules:unknown[]=[],tabApis:any={}){
 const messageListeners:Array<(request:any,sender:any,reply:(value:any)=>void)=>void>=[];
 const hook=()=>({addListener:(listener:(...args:any[])=>void)=>{void listener;}});
 const chrome:any={
  runtime:{id:'focusflow-test-id',getURL:(path:string)=>`chrome-extension://focusflow-test-id/${path}`,openOptionsPage:async()=>{},onInstalled:hook(),onStartup:hook(),onMessage:{addListener:(listener:any)=>messageListeners.push(listener)}},
  storage:{local:{get:async()=>structuredClone(storage),set:async(value:Record<string,unknown>)=>Object.assign(storage,structuredClone(value)),remove:async(key:string)=>{delete storage[key];}}},
  permissions:{contains:async()=>true,onRemoved:hook()},
  alarms:tabApis.alarms||{get:async()=>null,getAll:async()=>[],clear:async()=>true,create:async()=>{},onAlarm:hook()},
  declarativeNetRequest:{getDynamicRules:async()=>structuredClone(dynamicRules),updateDynamicRules:async({removeRuleIds,addRules}:any)=>{const removed=new Set(removeRuleIds);dynamicRules.splice(0,dynamicRules.length,...dynamicRules.filter((r:any)=>!removed.has(r.id)),...addRules);}},
  tabs:tabApis.tabs||{query:async()=>[],update:async()=>{},create:async()=>({id:99,windowId:1})},
  windows:tabApis.windows||{update:async()=>{}},
 };
 class ClockDate extends Date {static now(){return clock.now;}}
 runInNewContext(readFileSync('extension/background.js','utf8'),{chrome,FocusFlowShield:F,importScripts:()=>{},Date:ClockDate,URL,console,setTimeout,clearTimeout});
 const extensionSender={id:chrome.runtime.id,url:chrome.runtime.getURL('popup.html')},websiteSender={origin:'http://localhost:3000',tab:{url:'http://localhost:3000/study'}},blockedSender={id:chrome.runtime.id,url:chrome.runtime.getURL('blocked.html?domain=youtube.com')};
 const send=(request:any,sender:any=extensionSender)=>new Promise<any>(resolve=>messageListeners[0](request,sender,resolve));
 return {send,storage,dynamicRules,websiteSender,blockedSender};
}

describe('extension runtime messaging',()=>{
  it('matches popup master and outside-session commands to the worker and verifies installed rules',async()=>{
    const clock={now:1000},worker=createWorkerHarness(clock);
    const status=await worker.send({namespace:'FF_SHIELD_MANAGE_V2',kind:'status'});
    expect(status.ok).toBe(true);expect(status.managementApiVersion).toBe(F.MANAGEMENT_API_VERSION);expect(status.installed).toBe(0);
    const off=await worker.send({namespace:'FF_SHIELD_MANAGE_V2',kind:'master',value:false});expect(off.ok).toBe(true);expect(off.state.masterEnabled).toBe(false);expect(off.installed).toBe(0);
    const start=await worker.send({namespace:'FF_SHIELD_INTERNAL_V1',kind:'lifecycle',payload:{protocol:F.PROTOCOL,version:1,type:'start',sessionId:'sync-test',sequence:0}},worker.websiteSender);
    expect(start.ok).toBe(true);expect(start.state.sessionActive).toBe(true);expect(start.installed).toBe(0);
    const on=await worker.send({namespace:'FF_SHIELD_MANAGE_V2',kind:'master',value:true});expect(on.ok).toBe(true);expect(on.installed).toBe(5);
    const pause=await worker.send({namespace:'FF_SHIELD_INTERNAL_V1',kind:'lifecycle',payload:{protocol:F.PROTOCOL,version:1,type:'pause',sessionId:'sync-test',sequence:1}},worker.websiteSender);
    expect(pause.ok).toBe(true);expect(pause.state.sessionActive).toBe(true);expect(pause.installed).toBe(5);
    const end=await worker.send({namespace:'FF_SHIELD_INTERNAL_V1',kind:'lifecycle',payload:{protocol:F.PROTOCOL,version:1,type:'end',sessionId:'sync-test',sequence:2}},worker.websiteSender);
    expect(end.ok).toBe(true);expect(end.state.sessionActive).toBe(false);expect(end.installed).toBe(0);expect(worker.dynamicRules).toHaveLength(0);
    const override=await worker.send({namespace:'FF_SHIELD_MANAGE_V2',kind:'override',value:true});expect(override.ok).toBe(true);expect(override.installed).toBe(5);
    const masterOff=await worker.send({namespace:'FF_SHIELD_MANAGE_V2',kind:'master',value:false});expect(masterOff.ok).toBe(true);expect(masterOff.installed).toBe(0);expect(worker.storage.masterEnabled).toBe(false);expect(worker.storage.manualOverride).toBe(true);
  });

  it('keeps heartbeat freshness across restart, expires stale sessions, and distinguishes inactive from stale',async()=>{
    const clock={now:1000},storage:Record<string,unknown>={},rules:unknown[]=[],first=createWorkerHarness(clock,storage,rules);
    const sendLifecycle=(worker:any,type:string,sequence:number)=>worker.send({namespace:'FF_SHIELD_INTERNAL_V1',kind:'lifecycle',payload:{protocol:F.PROTOCOL,version:1,type,sessionId:'restart-session',sequence}},worker.websiteSender);
    await sendLifecycle(first,'start',0);await sendLifecycle(first,'heartbeat',1);
    const restarted=createWorkerHarness(clock,storage,rules),live=await restarted.send({namespace:'FF_SHIELD_MANAGE_V2',kind:'status'});
    expect(live.state.sessionActive).toBe(true);expect(live.state.syncLost).toBe(false);expect(live.installed).toBe(5);
    clock.now+=F.STALE_MS;
    const stale=await restarted.send({namespace:'FF_SHIELD_MANAGE_V2',kind:'status'});
    expect(stale.state.sessionActive).toBe(false);expect(stale.state.syncLost).toBe(true);expect(stale.installed).toBe(0);expect(F.sessionSyncLabel(stale.state)).toBe('Inactive · previous session heartbeat stale');
    clock.now+=1;
    const recovered=await sendLifecycle(restarted,'heartbeat',2);
    expect(recovered.state.sessionActive).toBe(true);expect(recovered.state.syncLost).toBe(false);expect(recovered.installed).toBe(5);
    const ended=await sendLifecycle(restarted,'end',3);
    expect(ended.state.sessionActive).toBe(false);expect(ended.state.syncLost).toBe(false);expect(ended.installed).toBe(0);expect(F.sessionSyncLabel(ended.state)).toBe('Inactive · no active session');
  });

  it('removes persisted temporary access and its alarms on worker startup, then restores eligible rules',async()=>{
    const clock={now:1001},stored={...F.defaults(),schemaVersion:4,sessionActive:true,lastHeartbeatAt:1000,bypasses:{'youtube.com':{domain:'youtube.com',approvedAt:10,expiresAt:300010}}};
    const oldAlarms=[{name:'focusflow-bypass:youtube.com'},{name:F.ALARM}],cleared:string[]=[];
    const alarms={getAll:vi.fn(async()=>oldAlarms),clear:vi.fn(async(name:string)=>{cleared.push(name);return true;}),get:async()=>null,create:async()=>{},onAlarm:{addListener:()=>{}}};
    const rules=F.desiredRules(stored,F.DEFAULTS.filter((domain:string)=>domain!=='youtube.com'),clock.now),worker=createWorkerHarness(clock,stored,rules,{alarms});
    const status=await worker.send({namespace:'FF_SHIELD_MANAGE_V2',kind:'status'});
    expect(status.ok).toBe(true);expect(worker.storage.schemaVersion).toBe(5);expect(worker.storage).not.toHaveProperty('bypasses');expect(cleared).toEqual(['focusflow-bypass:youtube.com']);expect(status.installed).toBe(5);expect(worker.dynamicRules).toHaveLength(5);
  });

  it('rejects unsupported popup commands with an explicit contract error',async()=>{
    const worker=createWorkerHarness({now:2000});
    const result=await worker.send({namespace:'FF_SHIELD_MANAGE_V2',kind:'permission',domain:'youtube.com'});
    expect(result).toMatchObject({ok:false,error:'Unsupported management command: permission.'});
  });

  it('accepts Return to FocusFlow only from blocked.html and performs no session mutation',async()=>{
    const clock={now:3000},tabs={query:vi.fn(async()=>[{id:12,url:'http://localhost:3000/study',windowId:4,active:false}]),update:vi.fn(async()=>({id:12})),create:vi.fn()},windows={update:vi.fn(async()=>({id:4}))};
    const worker=createWorkerHarness(clock,{},[],{tabs,windows});await worker.send({namespace:'FF_SHIELD_MANAGE_V2',kind:'status'});await worker.send({namespace:'FF_SHIELD_INTERNAL_V1',kind:'lifecycle',payload:{protocol:F.PROTOCOL,version:1,type:'start',sessionId:'return-preserves-session',sequence:0}},worker.websiteSender);const before=structuredClone(worker.storage),rulesBefore=structuredClone(worker.dynamicRules);
    const result=await worker.send({namespace:'FF_SHIELD_BLOCKED_V1',kind:'return_focus'},worker.blockedSender);
    expect(result).toMatchObject({ok:true,opened:false,tabId:12,matchedStudy:true});expect(tabs.update).toHaveBeenCalledWith(12,{active:true});expect(windows.update).toHaveBeenCalledWith(4,{focused:true});expect(tabs.create).not.toHaveBeenCalled();expect(worker.storage).toEqual(before);expect(worker.storage.sessionActive).toBe(true);expect(worker.dynamicRules).toEqual(rulesBefore);
    expect(await worker.send({namespace:'FF_SHIELD_BLOCKED_V1',kind:'return_focus',url:'http://localhost:3000/study'},worker.blockedSender)).toMatchObject({ok:false});
    expect(await worker.send({namespace:'FF_SHIELD_BLOCKED_V1',kind:'return_focus'},worker.websiteSender)).toMatchObject({ok:false,error:expect.stringContaining('blocked.html')});
  });

  it('completes popup-to-service-worker status messaging',async()=>{
    const runtime={lastError:null,sendMessage:vi.fn((_message:unknown,callback:(response:unknown)=>void)=>queueMicrotask(()=>callback({ok:true,blockingActive:true,installed:2})))};
    const response=await F.sendRuntimeMessage(runtime,{namespace:'FF_SHIELD_MANAGE_V2',kind:'status',requestId:'popup-1'});
    expect(runtime.sendMessage).toHaveBeenCalledOnce();expect(response).toEqual({ok:true,blockingActive:true,installed:2});
  });

  it('completes Settings-to-content-to-worker status relay with the same request id',async()=>{
    const runtime={lastError:null,sendMessage:vi.fn((message:{namespace:string;kind:string;requestId:string},callback:(response:unknown)=>void)=>queueMicrotask(()=>callback({ok:true,requestId:message.requestId,connected:true,masterEnabled:true,sessionActive:false,blockingActive:false,installedRuleCount:0,configuredDomainCount:5,enabledDomainCount:5,permittedDomainCount:5,activelyBlockedDomainCount:0,permissionMissingCount:0})))};
    const request={protocol:'FOCUSFLOW_SHIELD_V1',version:1,type:'status_request',requestId:'settings-24'};
    const response=await F.sendRuntimeMessage(runtime,{namespace:'FF_SHIELD_INTERNAL_V1',kind:'status',requestId:request.requestId});
    expect(runtime.sendMessage).toHaveBeenCalledWith({namespace:'FF_SHIELD_INTERNAL_V1',kind:'status',requestId:'settings-24'},expect.any(Function));expect(response.requestId).toBe(request.requestId);expect(response.connected).toBe(true);
  });

  it('runs the content-script bridge and relays a correlated Settings request',async()=>{
    const posted:unknown[]=[],calls:unknown[]=[];let listener:((event:any)=>void)|undefined;
    const windowObject:any={addEventListener:(type:string,callback:(event:any)=>void)=>{if(type==='message')listener=callback;},postMessage:(message:unknown)=>posted.push(message)};
    const runtime={lastError:null,sendMessage:vi.fn((message:unknown,callback:(response:unknown)=>void)=>{calls.push(message);queueMicrotask(()=>callback({ok:true,connected:true,requestId:'settings-vm-7',masterEnabled:false,sessionActive:false,blockingActive:false,installedRuleCount:0,configuredDomainCount:5,enabledDomainCount:5,permittedDomainCount:4,activelyBlockedDomainCount:0,permissionMissingCount:1}));})};
    runInNewContext(readFileSync('extension/content.js','utf8'),{window:Object.assign(windowObject,{location:{origin:'http://localhost:3000'}}),chrome:{runtime},FocusFlowShield:F});
    listener?.({source:windowObject,origin:'http://localhost:3000',data:{protocol:'FOCUSFLOW_SHIELD_V1',version:1,type:'status_request',requestId:'settings-vm-7'}});
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(calls).toEqual([{namespace:'FF_SHIELD_INTERNAL_V1',kind:'status',requestId:'settings-vm-7'}]);
    expect(posted).toContainEqual({protocol:'FOCUSFLOW_SHIELD_V1',version:1,type:'status_response',requestId:'settings-vm-7',connected:true,masterEnabled:false,sessionActive:false,blockingActive:false,installedRuleCount:0,configuredDomainCount:5,enabledDomainCount:5,permittedDomainCount:4,activelyBlockedDomainCount:0,permissionMissingCount:1});
  });

  it('forwards the website Settings shortcut and returns a correlated acknowledgement',async()=>{
    const posted:unknown[]=[],calls:unknown[]=[];let listener:((event:any)=>void)|undefined;
    const win:any={addEventListener:(type:string,callback:(event:any)=>void)=>{if(type==='message')listener=callback;},postMessage:(message:unknown)=>posted.push(message)};
    const runtime={lastError:null,sendMessage:vi.fn((message:unknown,callback:(response:unknown)=>void)=>{calls.push(message);queueMicrotask(()=>callback({ok:true,opened:true}));})};
    runInNewContext(readFileSync('extension/content.js','utf8'),{window:Object.assign(win,{location:{origin:'http://localhost:3000'}}),chrome:{runtime},FocusFlowShield:F});
    listener?.({source:win,origin:'http://localhost:3000',data:{protocol:'FOCUSFLOW_SHIELD_V1',version:1,type:'open_settings',requestId:'open-4'}});await new Promise(resolve=>setTimeout(resolve,0));
    expect(calls).toEqual([{namespace:'FF_SHIELD_INTERNAL_V1',kind:'open_settings'}]);expect(posted).toContainEqual({protocol:'FOCUSFLOW_SHIELD_V1',version:1,type:'open_settings_response',requestId:'open-4',ok:true});
  });

  it('keeps asynchronous response channels open and sends completion exactly once',async()=>{
    let resolveResponse!:(value:unknown)=>void;const completion=new Promise(resolve=>{resolveResponse=resolve;});
    const keepOpen=F.respondAsync(resolveResponse,async()=>{await Promise.resolve();return {value:'finished'};});
    expect(keepOpen).toBe(true);expect(await completion).toEqual({ok:true,value:'finished'});
  });

  it('returns a structured error for unknown messages and rejected handlers',async()=>{
    const completion=new Promise(resolve=>F.respondAsync(resolve,()=>Promise.reject(new Error('Unsupported extension message.'))));
    expect(await completion).toEqual({ok:false,error:'Unsupported extension message.'});
  });

  it('reports an unavailable receiver from runtime.lastError and reconnects on retry',async()=>{
    let attempt=0;const runtime:{lastError:{message:string}|null;sendMessage:(message:unknown,callback:(response:unknown)=>void)=>void}={lastError:null,sendMessage:(_message,callback)=>queueMicrotask(()=>{attempt++;if(attempt===1){runtime.lastError={message:'Could not establish connection. Receiving end does not exist.'};callback(undefined);runtime.lastError=null;}else callback({ok:true,connected:true});})};
    const first=await F.sendRuntimeMessage(runtime,{namespace:'FF_SHIELD_MANAGE_V2',kind:'status'});const second=await F.sendRuntimeMessage(runtime,{namespace:'FF_SHIELD_MANAGE_V2',kind:'status'});
    expect(first).toEqual({ok:false,error:'Could not establish connection. Receiving end does not exist.'});expect(second).toEqual({ok:true,connected:true});expect(attempt).toBe(2);
  });

  it('times out when a receiver never calls back',async()=>{
    const runtime={lastError:null,sendMessage:vi.fn()};const response=await F.sendRuntimeMessage(runtime,{namespace:'FF_SHIELD_MANAGE_V2',kind:'status'},5);
    expect(response.ok).toBe(false);expect(response.error).toMatch(/timed out/);
  });

  it('opens options directly, then falls back to a chrome-extension tab only after failure',async()=>{
    const open=vi.fn().mockRejectedValueOnce(new Error('Options page unavailable')),fallback=vi.fn().mockResolvedValue({id:7});const result=await F.openOptionsWithFallback(open,fallback);expect(result).toEqual({ok:true,usedFallback:true});expect(open).toHaveBeenCalledOnce();expect(fallback).toHaveBeenCalledOnce();
    const successful=vi.fn().mockResolvedValue(undefined),unused=vi.fn();expect(await F.openOptionsWithFallback(successful,unused)).toEqual({ok:true,usedFallback:false});expect(unused).not.toHaveBeenCalled();
    expect(await F.openOptionsWithFallback(vi.fn().mockRejectedValue(new Error('first')),vi.fn().mockRejectedValue(new Error('tab denied')))).toMatchObject({ok:false,error:expect.stringContaining('tab denied')});
  });

  it('has a bounded Settings acknowledgement timeout and safe return fallback',async()=>{
    vi.useFakeTimers();const pending=F.withTimeout(new Promise(()=>{}),2800,'no-ack');vi.advanceTimersByTime(2800);await expect(pending).resolves.toBe('no-ack');vi.useRealTimers();
    const blocked=readFileSync('extension/blocked.html','utf8'),manifest=JSON.parse(readFileSync('extension/manifest.json','utf8'));expect(blocked).toContain('id="return-focusflow"');expect(blocked).not.toContain('href="http://localhost:3000/study"');expect(manifest.permissions).not.toContain('webNavigation');expect(manifest.options_ui.page).toBe('options.html');
  });

  it('keeps the master control in extension UI and exposes only read-only website status',()=>{
    const popup=readFileSync('extension/popup.html','utf8'),popupScript=readFileSync('extension/popup.js','utf8'),worker=readFileSync('extension/background.js','utf8');
    expect(popup).toContain('id="master"');expect(popup).not.toContain('id="emergency"');expect(popupScript).toContain("send('master',{value:requested})");expect(worker).toContain("if(request.kind==='master')");expect(worker).toContain("if(!trustedPopupPage(sender))throw Error('Only the extension popup can change master blocking.')");
  });
});
