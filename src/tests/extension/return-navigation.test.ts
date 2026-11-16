import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const F:any=require('../../../extension/lib.js');

describe('safe Return to FocusFlow navigation',()=>{
  it('activates an existing Study tab without reloading or navigating it',async()=>{
    const tabs={query:vi.fn(async()=>[{id:8,url:'http://localhost:3000/study',windowId:3,active:false}]),update:vi.fn(async()=>({})),create:vi.fn()};
    const windows={update:vi.fn(async()=>({}))};
    await expect(F.returnToFocusFlow(tabs,windows)).resolves.toEqual({opened:false,tabId:8,matchedStudy:true});
    expect(tabs.query).toHaveBeenCalledWith({url:'http://localhost:3000/*'});
    expect(tabs.update).toHaveBeenCalledExactlyOnceWith(8,{active:true});
    expect(windows.update).toHaveBeenCalledExactlyOnceWith(3,{focused:true});
    expect(tabs.create).not.toHaveBeenCalled();
  });

  it('prefers a Study tab among multiple trusted tabs, then chooses its active/recent instance',()=>{
    const tab=F.selectFocusFlowTab([
      {id:1,url:'http://localhost:3000/settings',windowId:1,active:true,lastAccessed:900},
      {id:2,url:'http://localhost:3000/study',windowId:2,active:false,lastAccessed:800},
      {id:3,url:'http://localhost:3000/study?view=live',windowId:3,active:true,lastAccessed:700},
      {id:4,url:'http://localhost:3001/study',windowId:4,active:true,lastAccessed:2000},
      {id:5,url:'https://localhost:3000/study',windowId:5,active:true,lastAccessed:3000},
    ]);
    expect(tab.id).toBe(3);
  });

  it('opens only the fixed trusted Study URL when no FocusFlow tab remains',async()=>{
    const tabs={query:vi.fn(async()=>[{id:7,url:'http://localhost:3001/study',windowId:1},{id:8,url:'https://localhost:3000/study',windowId:2}]),update:vi.fn(),create:vi.fn(async()=>({id:10,windowId:6}))};
    const windows={update:vi.fn(async()=>({}))};
    await expect(F.returnToFocusFlow(tabs,windows)).resolves.toEqual({opened:true,tabId:10,matchedStudy:true});
    expect(tabs.create).toHaveBeenCalledExactlyOnceWith({url:'http://localhost:3000/study',active:true});
    expect(windows.update).toHaveBeenCalledWith(6,{focused:true});
    expect(tabs.update).not.toHaveBeenCalled();
  });

  it('rejects arbitrary navigation targets and invalid origins',()=>{
    expect(F.selectFocusFlowTab([{id:1,url:'http://localhost:3001/study'},{id:2,url:'http://127.0.0.1:3000/study'},{id:3,url:'https://localhost:3000/study'}])).toBeNull();
    expect(F.FOCUSFLOW_STUDY_URL).toBe('http://localhost:3000/study');
  });

  it('preserves actionable errors from tab lookup, activation, and window focus',async()=>{
    await expect(F.returnToFocusFlow({query:vi.fn().mockRejectedValue(new Error('permission denied'))},{update:vi.fn()})).rejects.toThrow('Could not search for FocusFlow tabs: permission denied');
    await expect(F.returnToFocusFlow({query:vi.fn(async()=>[{id:3,url:'http://localhost:3000/study',windowId:1}]),update:vi.fn().mockRejectedValue(new Error('tab closed'))},{update:vi.fn()})).rejects.toThrow('Could not activate the existing FocusFlow tab: tab closed');
    await expect(F.returnToFocusFlow({query:vi.fn(async()=>[{id:3,url:'http://localhost:3000/study',windowId:1}]),update:vi.fn()},{update:vi.fn().mockRejectedValue(new Error('window unavailable'))})).rejects.toThrow('The Study tab is active, but its Chrome window could not be focused: window unavailable');
  });

  it('blocked.html requests the parameter-free worker command instead of navigating itself',async()=>{
    const elements=new Map<string,any>(),calls:any[]=[],listeners=new Map<string,Function>();
    for(const id of ['error','return-focusflow','return-status','domain'])elements.set(id,{disabled:false,textContent:'',addEventListener:(type:string,listener:Function)=>listeners.set(`${id}:${type}`,listener)});
    const document={getElementById:(id:string)=>elements.get(id)},state=F.defaults(),focusLib={...F,sendRuntimeMessage:vi.fn(async(_runtime:any,message:any)=>{calls.push(message);return {ok:true,opened:false,tabId:4,matchedStudy:true};})};
    runInNewContext(readFileSync('extension/blocked.js','utf8'),{document,location:{search:'?domain=youtube.com'},chrome:{runtime:{},storage:{local:{get:(_keys:any,callback:Function)=>queueMicrotask(()=>callback(state))}}},FocusFlowShield:focusLib,URLSearchParams,URL,Date});
    const handler=listeners.get('return-focusflow:click');expect(handler).toBeDefined();await (handler as Function)();
    expect(calls).toEqual([{namespace:'FF_SHIELD_BLOCKED_V1',kind:'return_focus'}]);
    expect(elements.get('return-status').textContent).toContain('activated without reloading');
    const html=readFileSync('extension/blocked.html','utf8');expect(html).toContain('id="return-focusflow"');expect(html).not.toContain('href="http://localhost:3000/study"');expect(html).not.toMatch(/bypass|5 minutes/i);expect(readFileSync('extension/blocked.js','utf8')).not.toMatch(/bypass/i);
  });

  it('shows an actionable error when the worker cannot activate a tab',async()=>{
    const elements=new Map<string,any>(),listeners=new Map<string,Function>();
    for(const id of ['error','return-focusflow','return-status','domain'])elements.set(id,{disabled:false,textContent:'',addEventListener:(type:string,listener:Function)=>listeners.set(`${id}:${type}`,listener)});
    const document={getElementById:(id:string)=>elements.get(id)},focusLib={...F,sendRuntimeMessage:vi.fn(async()=>({ok:false,error:'Could not activate the existing FocusFlow tab: tab closed'}))};
    runInNewContext(readFileSync('extension/blocked.js','utf8'),{document,location:{search:'?domain=youtube.com'},chrome:{runtime:{},storage:{local:{get:(_keys:any,callback:Function)=>queueMicrotask(()=>callback(F.defaults()))}}},FocusFlowShield:focusLib,URLSearchParams,URL,Date});
    await (listeners.get('return-focusflow:click') as Function)();
    expect(elements.get('error').textContent).toContain('Could not activate the existing FocusFlow tab');expect(elements.get('return-focusflow').disabled).toBe(false);
  });

  it('shows a visible error if runtime messaging rejects unexpectedly',async()=>{
    const elements=new Map<string,any>(),listeners=new Map<string,Function>();
    for(const id of ['error','return-focusflow','return-status','domain'])elements.set(id,{disabled:false,textContent:'',addEventListener:(type:string,listener:Function)=>listeners.set(`${id}:${type}`,listener)});
    const document={getElementById:(id:string)=>elements.get(id)},focusLib={...F,sendRuntimeMessage:vi.fn(async()=>{throw new Error('message port closed');})};
    runInNewContext(readFileSync('extension/blocked.js','utf8'),{document,location:{search:'?domain=youtube.com'},chrome:{runtime:{},storage:{local:{get:(_keys:any,callback:Function)=>queueMicrotask(()=>callback(F.defaults()))}}},FocusFlowShield:focusLib,URLSearchParams,URL,Date});
    await (listeners.get('return-focusflow:click') as Function)();
    expect(elements.get('error').textContent).toContain('message port closed');expect(elements.get('return-focusflow').disabled).toBe(false);
  });

  it('uses existing localhost host access without requesting broad tabs permission',()=>{
    const manifest=JSON.parse(readFileSync('extension/manifest.json','utf8'));
    expect(manifest.host_permissions).toContain('http://localhost:3000/*');expect(manifest.permissions).not.toContain('tabs');
  });
});
