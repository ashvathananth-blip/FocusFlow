import type { CalibrationMetadata, SavedSession } from '@/types/analytics';
import type { Session, TimerEvent } from '@/lib/focus/timer-engine';
import { checkpoint, recordEvent, startRecording, type Recording } from '@/lib/analytics/recorder';
import { ANALYTICS_CONFIG } from '@/lib/analytics/config';
import { acquireLease, reportStorageError, runtimeOwner, sessionRepository, type SessionRepository } from './history-store';
function idle(task:()=>void) {
  if(typeof window!=='undefined'&&window.requestIdleCallback) window.requestIdleCallback(task,{timeout:2000});
  else setTimeout(task,0);
}
/** No IDB/JSON work in receive(): queue immutable checkpoints off inference. */
export class SessionWriter {
  private live:{recording:Recording;session:Session;revision:number;lease:Promise<()=>void>}|null=null;
  constructor(private repository:SessionRepository=sessionRepository,
    private schedule:(task:()=>void)=>void=idle,
    private lease:(id:string)=>Promise<()=>void>=acquireLease,
    private owner:()=>string=runtimeOwner,
    private error:(e:unknown)=>void=reportStorageError) {}
  begin(session:Session,metadata:CalibrationMetadata,id=crypto.randomUUID(),startedAt=new Date().toISOString()) {
    if(this.live) this.finish('interrupted');
    this.live={recording:startRecording(session,id,this.owner(),startedAt,metadata),session,revision:0,lease:this.lease(id)};
    this.flush();
  }
  startCheckpointClock() {
    const timer=setInterval(()=>this.flush(),ANALYTICS_CONFIG.checkpointMs);
    return ()=>clearInterval(timer);
  }
  receive(before:Session,event:TimerEvent,after:Session) {
    if(!this.live) return;
    try { this.live.recording=recordEvent(this.live.recording,before,event,after); }
    catch(error) { this.error(error);this.finish('interrupted');return; }
    this.live.session=after;
    if(after.lifecycle==='completed'||after.lifecycle==='ended') this.finish(after.lifecycle);
  }
  flush(immediate=false) {
    if(!this.live) return;
    const live=this.live;
    const data=checkpoint(live.recording,live.session,++live.revision,new Date().toISOString());
    const save=()=>{ void live.lease.then(()=>this.repository.put(data)).catch(this.error); };
    if(immediate) save(); else this.schedule(save);
  }
  finish(status:'ended'|'completed'|'interrupted') {
    if(!this.live) return;
    const live=this.live; this.live=null;
    const data:SavedSession=checkpoint(live.recording,live.session,++live.revision,new Date().toISOString(),status);
    // Finalization is asynchronous, but starts now so navigation need not wait.
    void live.lease.then(async release=>{
      try { await this.repository.put(data); } finally { release(); }
    }).catch(this.error);
  }
}
