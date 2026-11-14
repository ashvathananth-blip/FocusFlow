'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadHistory, storageError } from '@/lib/storage/history-store';
import type { SavedSession } from '@/types/analytics';
export function useHistory() {
  const requestId=useRef({generation:0});
  const [state,setState]=useState<{loading:boolean;sessions:SavedSession[];error:string;invalid:number}>({loading:true,sessions:[],error:'',invalid:0});
  const refresh=useCallback(async()=>{
    const current=++requestId.current.generation;
    try {
      const result=await loadHistory();
      if(current!==requestId.current.generation) return;
      setState({loading:false,sessions:result.sessions,error:storageError(),invalid:result.invalid.length});
    } catch(error) {if(current!==requestId.current.generation) return;setState(s=>({...s,loading:false,error:error instanceof Error?error.message:'Local history could not be opened.'}));}
  },[]);
  useEffect(()=>{
    let alive=true;
    const tracker=requestId.current;
    const update=()=>{if(alive) void refresh();};
    // Initial hydration and stale fallback leases use the same asynchronous loader.
    const initial=setTimeout(update,0), timer=setInterval(update,10000);
    window.addEventListener('focus',update);window.addEventListener('focusflow-history-error',update);window.addEventListener('focusflow-history-updated',update);
    return()=>{alive=false;tracker.generation++;clearTimeout(initial);clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('focusflow-history-error',update);window.removeEventListener('focusflow-history-updated',update);};
  },[refresh]);
  return {...state,refresh};
}
