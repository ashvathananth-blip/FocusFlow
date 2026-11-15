import type { SavedSession } from '@/types/analytics';
import { validateSession } from '@/lib/analytics/schema';
export interface SessionRepository { list():Promise<unknown[]>; put(session:SavedSession):Promise<void>; }
let dbPromise:Promise<IDBDatabase>|null=null;
function database():Promise<IDBDatabase> {
  if(!dbPromise) dbPromise=new Promise<IDBDatabase>((resolve,reject)=>{
    if(typeof indexedDB==='undefined') { reject(new Error('Local session storage is unavailable in this browser.')); return; }
    const request=indexedDB.open('focusflow-history',1);
    request.onupgradeneeded=()=>{ if(!request.result.objectStoreNames.contains('sessions')) request.result.createObjectStore('sessions',{keyPath:'id'}); };
    request.onsuccess=()=>{ const db=request.result; db.onversionchange=()=>{db.close();dbPromise=null;}; resolve(db); };
    request.onerror=()=>reject(request.error ?? new Error('Unable to open local session history.'));
    request.onblocked=()=>reject(new Error('Session storage upgrade is blocked by another tab.'));
  }).catch(error=>{dbPromise=null;throw error;});
  return dbPromise;
}
export const sessionRepository:SessionRepository={
  async list() {
    const db=await database();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('sessions','readonly'), request=tx.objectStore('sessions').getAll();
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  },
  async put(session) {
    const validation=validateSession(session);
    if(!validation.ok) throw new Error(`Session was not saved: ${validation.reason}`);
    const db=await database();
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('sessions','readwrite'), store=tx.objectStore('sessions');
      const request=store.get(session.id);
      request.onsuccess=()=>{
        const old=request.result as SavedSession|undefined;
        // Out-of-order idle callbacks cannot overwrite a newer checkpoint.
        if(!old||old.revision<session.revision) store.put(session);
      };
      tx.oncomplete=()=>{
        latestStorageError='';
        if(typeof window!=='undefined') window.dispatchEvent(new Event('focusflow-history-updated'));
        resolve();
      };
      tx.onerror=()=>reject(tx.error ?? new Error('Local session save failed.'));
      tx.onabort=()=>reject(tx.error ?? new Error('Local session save was interrupted.'));
    });
  },
};
const liveIds=new Set<string>();
let owner:string|null=null;
export function runtimeOwner() { return owner ??= crypto.randomUUID(); }
export function acquireLease(id:string):Promise<()=>void> {
  liveIds.add(id);
  if(typeof navigator==='undefined'||!navigator.locks) return Promise.resolve(()=>{liveIds.delete(id);});
  return new Promise(resolve=>{
    void navigator.locks.request(`focusflow-session-${id}`,()=>new Promise<void>(release=>{
      resolve(()=>{liveIds.delete(id);release();});
    })).catch(()=>{resolve(()=>{liveIds.delete(id);});});
  });
}
export async function isSessionActive(session:SavedSession):Promise<boolean> {
  if(liveIds.has(session.id)) return true;
  if(typeof navigator!=='undefined'&&navigator.locks) {
    try {return await navigator.locks.request(`focusflow-session-${session.id}`,{ifAvailable:true},lock=>!lock);} catch { /* Fall back to the conservative heartbeat lease. */ }
  }
  // Without cross-tab locks, avoid marking another tab interrupted while its
  // 15-second checkpoint is still fresh. History refreshes after lease expiry.
  return session.owner!==runtimeOwner()&&Date.now()-Date.parse(session.checkpointedAt)<45_000;
}
export function asInterrupted(session:SavedSession):SavedSession {
  const current=session.currentEpisode;
  return {...session,status:'interrupted',revision:session.revision+1,
    endedAt:new Date(Date.parse(session.startedAt)+session.elapsedMs).toISOString(),
    episodes:current&&current.durationMs>0?[...session.episodes,current]:session.episodes,currentEpisode:null};
}
export async function loadHistory(repository:SessionRepository=sessionRepository,active:(s:SavedSession)=>Promise<boolean>=isSessionActive) {
  const sessions:SavedSession[]=[], invalid: {index:number;reason:string}[]=[];
  const all=await repository.list();
  for(let index=0;index<all.length;index++) {
    const result=validateSession(all[index]);
    if(!result.ok) { invalid.push({index,reason:result.reason}); continue; }
    let session=result.session;
    if(session.status==='active'&&!await active(session)) {
      session=asInterrupted(session); await repository.put(session);
    }
    sessions.push(session);
  }
  sessions.sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt)||a.id.localeCompare(b.id));
  return {sessions,invalid};
}
let latestStorageError='';
export function reportStorageError(error:unknown) {
  latestStorageError=error instanceof Error?error.message:'Local session history could not be saved.';
  console.error('[FocusFlow history]',latestStorageError);
  if(typeof window!=='undefined') window.dispatchEvent(new Event('focusflow-history-error'));
}
export function storageError() { return latestStorageError; }
/** Removes saved session records. The IndexedDB schema is unchanged. */
export async function clearHistory() {
  const db=await database();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('sessions','readwrite');
    tx.objectStore('sessions').clear();
    tx.oncomplete=()=>{
      latestStorageError='';
      if(typeof window!=='undefined') window.dispatchEvent(new Event('focusflow-history-updated'));
      resolve();
    };
    tx.onerror=()=>reject(tx.error ?? new Error('Local history could not be cleared.'));
    tx.onabort=()=>reject(tx.error ?? new Error('Clearing local history was interrupted.'));
  });
}
