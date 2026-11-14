import type { Episode, SavedSession, TimelineState, CalibrationMetadata } from '@/types/analytics';
import type { CalibrationResult } from '@/types/vision';
import { advanceFocus } from '@/lib/focus/state-machine';
import { MAX_OBSERVATION_GAP_MS, type Session, type TimerEvent } from '@/lib/focus/timer-engine';
import { appendTimeline, emptyDurations } from './timeline';
import { episodeClassification } from './episodes';
import { ANALYTICS_CONFIG } from './config';

export type Recording = { data: SavedSession; monoStart: number; setup: boolean };
export function calibrationMetadata(calibration:CalibrationResult|null):CalibrationMetadata {
  return { calibrated:calibration?.status==='ready', quality:calibration?.status ?? 'unavailable',
    residualError:calibration?.error ?? null, method:calibration?'nine-point-ridge-v1':null };
}
function episode(startMs:number,id:number):Episode {
  return { id,startMs,endMs:startMs,durationMs:0,lowMs:0,unknownMs:0,unobservedMs:0,
    classification:'mixed',belowThreshold:true,counted:false,countedAtMs:null };
}
export function startRecording(session:Session,id:string,owner:string,startedAt:string,calibration:CalibrationMetadata):Recording {
  return { setup:false, monoStart:session.startedAt ?? session.now, data:{ schemaVersion:1,id,owner,revision:0,source:'live-camera',status:'active',
    startedAt,endedAt:null,checkpointedAt:startedAt,elapsedMs:0,goalMs:session.goalMs,creditedMs:0,longestStreakMs:0,
    durations:emptyDurations(),distractionCount:0,calibration,timeline:[],episodes:[],currentEpisode:episode(0,1) } };
}
function open(s:SavedSession,startMs:number):SavedSession {
  return s.currentEpisode?s:{ ...s,currentEpisode:episode(startMs,(s.episodes.at(-1)?.id ?? 0)+1) };
}
function close(s:SavedSession,endMs:number):SavedSession {
  if(!s.currentEpisode) return s;
  const e={...s.currentEpisode,endMs,durationMs:endMs-s.currentEpisode.startMs};
  e.belowThreshold=e.durationMs<ANALYTICS_CONFIG.distractionThresholdMs;
  return { ...s,episodes:e.durationMs>0?[...s.episodes,e]:s.episodes,currentEpisode:null };
}
function append(s:SavedSession,to:number,state:TimelineState,openAt:number|null=null):SavedSession {
  const from=s.elapsedMs;
  if(to<=from) return s;
  if(state==='focused'||state==='manual_pause') s=close(s,from);
  if((state==='low'||state==='unknown')&&!s.currentEpisode) s=open(s,from);
  if((state==='unobserved'||state==='setup')&&!s.currentEpisode&&openAt!==null&&openAt>=from&&openAt<to) {
    if(openAt>from) s=append(s,openAt,state);
    s=open(s,openAt);
    return append(s,to,state);
  }
  const duration=to-s.elapsedMs;
  const durations={...s.durations,[state]:s.durations[state]+duration};
  let current=s.currentEpisode;
  if(current && state!=='focused' && state!=='manual_pause') {
    current={...current,endMs:to,durationMs:to-current.startMs,
      lowMs:current.lowMs+(state==='low'?duration:0),unknownMs:current.unknownMs+(state==='unknown'?duration:0),
      unobservedMs:current.unobservedMs+(state==='unobserved'||state==='setup'?duration:0)};
    current.classification=episodeClassification(current.lowMs,current.unknownMs);
    current.belowThreshold=current.durationMs<ANALYTICS_CONFIG.distractionThresholdMs;
  }
  return {...s,elapsedMs:to,durations,timeline:appendTimeline(s.timeline,s.elapsedMs,to,state),currentEpisode:current};
}
/** Called with Stage 2 snapshots, never images/features. Most frames only extend
 * the current timeline segment. No persistence or serialization runs here. */
export function recordEvent(recording:Recording,before:Session,event:TimerEvent,after:Session):Recording {
  if(before.lifecycle!=='running'||event.at<before.now||!Number.isFinite(event.at)) return recording;
  let s=recording.data;
  const offset=(at:number)=>Math.max(0,at-recording.monoStart);
  const end=offset(after.stoppedAt ?? event.at);
  const episodeStart=after.focus.nonFocusedSince===null?null:offset(after.focus.nonFocusedSince);
  const continuous=event.type==='sample'&&before.lastSampleAt!==null&&event.at>before.lastSampleAt&&event.at-before.lastSampleAt<MAX_OBSERVATION_GAP_MS;
  if(continuous) {
    for(const segment of advanceFocus(before.focus,event.at).segments) {
      const to=Math.min(end,offset(segment.to));
      const state:TimelineState=before.focus.manual?'manual_pause':recording.setup?'setup':
        // Observe the same deterministic latched attention as Stage 2, including
        // its 300 ms reliable-return interval. Credit remains a separate metric.
        advanceFocus(before.focus,segment.from).machine.attention;
      s=append(s,to,state);
      if(to>=end) break;
    }
  } else if(event.type!=='tick'||after.lastSampleAt===null) {
    s=append(s,end,before.focus.manual?'manual_pause':recording.setup?'setup':'unobserved',episodeStart);
  }
  if(after.focus.nonFocusedSince!==null&&!after.focus.manual&&!s.currentEpisode) s=open(s,Math.max(s.elapsedMs,episodeStart ?? s.elapsedMs));
  if(after.focus.distractionCount>before.focus.distractionCount) {
    const since=before.focus.nonFocusedSince ?? after.focus.nonFocusedSince ?? event.at;
    const at=offset(since+ANALYTICS_CONFIG.distractionThresholdMs);
    const mark=(e:Episode):Episode=>({...e,counted:true,countedAtMs:at});
    const index=s.episodes.findIndex(e=>at>=e.startMs&&at<=e.endMs&&!e.counted);
    let episodeId:number;
    if(index>=0) {
      const episodes=[...s.episodes]; episodes[index]=mark(episodes[index]); episodeId=episodes[index].id; s={...s,episodes};
    } else {
      if(!s.currentEpisode) s=open(s,offset(since));
      s={...s,currentEpisode:mark(s.currentEpisode!)}; episodeId=s.currentEpisode!.id;
    }
    const indexOfBin=s.timeline.findIndex(t=>at>=t.startMs&&at<=t.endMs);
    if(indexOfBin>=0) {
      const timeline=[...s.timeline], bin=timeline[indexOfBin];
      timeline[indexOfBin]={...bin,events:[...bin.events,{episodeId,atMs:at}]}; s={...s,timeline};
    }
  }
  if(after.focus.nonFocusedSince===null) s=close(s,s.elapsedMs);
  return { ...recording,setup:event.type==='sample'?!!event.setup:recording.setup,data:{...s,creditedMs:after.creditedMs,longestStreakMs:after.longestStreakMs,distractionCount:after.focus.distractionCount} };
}
/** Snapshot trailing unverified time as unobserved; never mutate the live ledger
 * or backfill recovery after the last checkpoint. */
export function checkpoint(recording:Recording,session:Session,revision:number,checkpointedAt:string,status?:SavedSession['status']):SavedSession {
  const finalStatus=status ?? (session.lifecycle==='running'?'active':session.lifecycle==='completed'?'completed':'ended');
  const end=Math.max(recording.data.elapsedMs,(session.stoppedAt ?? session.now)-recording.monoStart);
  let s=append(recording.data,end,session.focus.manual?'manual_pause':recording.setup?'setup':'unobserved',session.focus.nonFocusedSince===null?null:session.focus.nonFocusedSince-recording.monoStart);
  if(finalStatus!=='active') s=close(s,end);
  return {...s,status:finalStatus,revision,checkpointedAt,
    endedAt:finalStatus==='active'?null:new Date(Date.parse(s.startedAt)+end).toISOString()};
}
