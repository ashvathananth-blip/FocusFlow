import type { SavedSession } from '@/types/analytics';
import { ANALYTICS_CONFIG } from './config';
import { episodeClassification } from './episodes';
import { STATES, emptyDurations, sumDurations } from './timeline';
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const integer=(n:unknown):n is number=>finite(n)&&Number.isSafeInteger(n);
const date=(s:unknown):s is string=>typeof s==='string'&&Number.isFinite(Date.parse(s));
const same=(a:number,b:number)=>Math.abs(a-b)<0.02;
function exact(value:unknown,keys:string[]):value is Record<string,unknown> {
  return typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
}
export function validateSession(value:unknown):{ok:true;session:SavedSession}|{ok:false;reason:string} {
  const fail=(reason:string)=>({ok:false as const,reason});
  if(!exact(value,['schemaVersion','id','owner','revision','source','status','startedAt','endedAt','checkpointedAt','elapsedMs','goalMs','creditedMs','longestStreakMs','durations','distractionCount','calibration','timeline','episodes','currentEpisode'])) return fail('Unrecognized session schema');
  const s=value;
  if(s.schemaVersion!==1||typeof s.id!=='string'||!s.id||s.id.length>200||typeof s.owner!=='string'||!s.owner||!integer(s.revision)) return fail('Invalid session identity/version');
  if(!['live-camera','simulated','manual-timer'].includes(String(s.source))||!['active','ended','completed','interrupted'].includes(String(s.status))) return fail('Invalid source/status');
  if(!date(s.startedAt)||!date(s.checkpointedAt)||(s.endedAt!==null&&!date(s.endedAt))) return fail('Invalid timestamps');
  for(const key of ['elapsedMs','goalMs','creditedMs','longestStreakMs']) if(!finite(s[key])) return fail(`Invalid ${key}`);
  const elapsed=s.elapsedMs as number,credited=s.creditedMs as number;
  if((s.goalMs as number)<=0||credited>(s.goalMs as number)+.02||(s.longestStreakMs as number)>credited+.02||!integer(s.distractionCount)) return fail('Inconsistent credit/count');
  if((s.status==='active')!==(s.endedAt===null)) return fail('Status/timestamp mismatch');
  if(s.endedAt!==null&&Math.abs(Date.parse(s.endedAt as string)-Date.parse(s.startedAt)-elapsed)>1.01) return fail('Elapsed/timestamp mismatch');
  if(s.status==='completed'&&!same(credited,s.goalMs as number)) return fail('Incomplete completed session');
  if(!exact(s.durations,STATES)||!STATES.every(k=>finite(s.durations && (s.durations as Record<string,unknown>)[k]))) return fail('Invalid aggregate durations');
  const aggregate=s.durations as SavedSession['durations'];
  if(!same(sumDurations(aggregate),elapsed)||credited>aggregate.focused+aggregate.low+aggregate.unknown+.02) return fail('Aggregate duration mismatch');
  if(!exact(s.calibration,['calibrated','quality','residualError','method'])||typeof s.calibration.calibrated!=='boolean'||!['ready','poor','unavailable'].includes(String(s.calibration.quality))||!(s.calibration.residualError===null||finite(s.calibration.residualError))||!(s.calibration.method===null||typeof s.calibration.method==='string')) return fail('Invalid calibration metadata');
  if(s.calibration.calibrated!==(s.calibration.quality==='ready')||(s.calibration.quality==='unavailable'&&s.calibration.residualError!==null)) return fail('Inconsistent calibration metadata');
  if(!Array.isArray(s.episodes)||!Array.isArray(s.timeline)||s.timeline.length>ANALYTICS_CONFIG.maxTimelineSegments) return fail('Invalid episode/timeline lists');
  const episodes=[...s.episodes,...(s.currentEpisode===null?[]:[s.currentEpisode])];
  let lastEnd=0,lastId=0,counted=0,low=0,unknown=0;
  const eventTimes=new Map<number,number>();
  for(const e of episodes) {
    if(!exact(e,['id','startMs','endMs','durationMs','lowMs','unknownMs','unobservedMs','classification','belowThreshold','counted','countedAtMs'])) return fail('Invalid episode schema');
    if(!integer(e.id)||e.id<=lastId||!['startMs','endMs','durationMs','lowMs','unknownMs','unobservedMs'].every(k=>finite(e[k]))) return fail('Invalid episode duration/identity');
    const start=e.startMs as number,end=e.endMs as number,duration=e.durationMs as number;
    if(start<lastEnd-.02||end<start||end>elapsed+.02||!same(duration,end-start)||!same(duration,(e.lowMs as number)+(e.unknownMs as number)+(e.unobservedMs as number))) return fail('Episode timestamp/duration mismatch');
    if(e.classification!==episodeClassification(e.lowMs as number,e.unknownMs as number)||e.belowThreshold!==(duration<ANALYTICS_CONFIG.distractionThresholdMs)||typeof e.counted!=='boolean') return fail('Inconsistent episode classification/threshold');
    if(e.counted) {
      if(e.belowThreshold||!finite(e.countedAtMs)||(e.countedAtMs as number)<start|| (e.countedAtMs as number)>end+.02||!same((e.countedAtMs as number)-start,ANALYTICS_CONFIG.distractionThresholdMs)) return fail('Invalid counted episode');
      counted++; eventTimes.set(e.id,e.countedAtMs as number);
    } else if(e.countedAtMs!==null) return fail('Uncounted episode has event');
    lastEnd=end; lastId=e.id; low+=e.lowMs as number; unknown+=e.unknownMs as number;
  }
  if(s.status!=='active'&&s.currentEpisode!==null) return fail('Closed session has open episode');
  if(counted!==s.distractionCount||!same(low,aggregate.low)||!same(unknown,aggregate.unknown)) return fail('Episode/aggregate mismatch');
  const totals=emptyDurations(); let cursor=0;
  const seenEvents=new Set<number>();
  for(const t of s.timeline) {
    if(!exact(t,['startMs','endMs','state','firstState','lastState','durations','transitions','events'])||!finite(t.startMs)||!finite(t.endMs)||!same(t.startMs,cursor)||t.endMs<=t.startMs||!exact(t.durations,STATES)||!STATES.every(k=>finite((t.durations as Record<string,unknown>)[k]))||!integer(t.transitions)||!Array.isArray(t.events)) return fail('Invalid timeline segment');
    if(![...STATES,'mixed'].includes(String(t.state))||!STATES.includes(t.firstState as never)||!STATES.includes(t.lastState as never)) return fail('Invalid timeline label');
    const durations=t.durations as SavedSession['durations'];
    if(!same(sumDurations(durations),t.endMs-t.startMs)) return fail('Timeline duration mismatch');
    if(t.state!=='mixed'&&(!same(durations[t.state as keyof typeof durations],t.endMs-t.startMs)||t.firstState!==t.state||t.lastState!==t.state||t.transitions!==0)) return fail('Mislabelled aggregate segment');
    for(const state of STATES) totals[state]+=durations[state];
    for(const event of t.events) {
      if(!exact(event,['episodeId','atMs'])||!integer(event.episodeId)||!finite(event.atMs)||seenEvents.has(event.episodeId)||!eventTimes.has(event.episodeId)||!same(eventTimes.get(event.episodeId)!,event.atMs)||event.atMs<t.startMs-.02||event.atMs>t.endMs+.02) return fail('Invalid timeline event');
      seenEvents.add(event.episodeId);
    }
    cursor=t.endMs;
  }
  if(!same(cursor,elapsed)||!STATES.every(k=>same(totals[k],aggregate[k]))||seenEvents.size!==counted) return fail('Timeline/aggregate/event mismatch');
  return {ok:true,session:value as unknown as SavedSession};
}
