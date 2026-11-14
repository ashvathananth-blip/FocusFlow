// Deterministic synthetic records/events for analytics policy, never human accuracy.
import { describe, expect, it } from 'vitest';
import { createSession, updateSession, type TimerEvent } from '@/lib/focus/timer-engine';
import { calibrationMetadata, checkpoint, recordEvent, startRecording } from '@/lib/analytics/recorder';
import { episodeClassification, historySummary, metrics } from '@/lib/analytics/metrics';
import { validateSession } from '@/lib/analytics/schema';
import { appendTimeline, compactTimeline, emptyDurations } from '@/lib/analytics/timeline';
import { asInterrupted, loadHistory, type SessionRepository } from '@/lib/storage/history-store';
import { SessionWriter } from '@/lib/storage/session-writer';
import type { SavedSession, TimelineSegment, TimelineState } from '@/types/analytics';
const startISO='2026-11-14T12:00:00.000Z';
const formula={version:'test-only',description:'Synthetic test formula',evaluate:({focusPercentage}:{focusPercentage:number})=>focusPercentage};
function simulation() {
  let engine=updateSession(createSession(),{type:'start',at:0});
  let recording=startRecording(engine,'test-session','test-owner',startISO,calibrationMetadata(null));
  const send=(event:TimerEvent)=>{const before=engine;engine=updateSession(before,event);recording=recordEvent(recording,before,event,engine);};
  const feed=(until:number,signal:'on-screen'|'off-screen'|'invalid'|'no-face'='on-screen')=>{
    for(let at=engine.now+100;at<until;at+=100) send({type:'sample',at,signal});
    send({type:'sample',at:until,signal});
  };
  send({type:'sample',at:0,signal:'on-screen'});
  return {send,feed,get engine(){return engine;},get recording(){return recording;},snapshot(status?:SavedSession['status']){return checkpoint(recording,engine,1,startISO,status);}};
}
function saved(duration=120000,status:SavedSession['status']='ended') {
  const sim=simulation();sim.feed(duration);sim.send({type:'end',at:duration});
  const s=sim.snapshot();return {...s,status};
}
function valid(s:SavedSession) {const result=validateSession(s);expect(result,JSON.stringify(result)).toMatchObject({ok:true});return s;}
class MemoryRepository implements SessionRepository {
  values=new Map<string,unknown>(); writes=0;
  async list(){return [...this.values.values()];}
  async put(s:SavedSession){valid(s);const old=this.values.get(s.id) as SavedSession|undefined;if(!old||old.revision<s.revision){this.values.set(s.id,structuredClone(s));this.writes++;}}
}

describe('eligible-time scoring and validation',()=>{
  it('saves short sessions but never extrapolates their score',()=>{
    const s=valid(saved(119999));const m=metrics(s,formula);
    expect(m.eligibleMs).toBe(119999);expect(m.score).toBeNull();expect(m.scoreLabel).toBe('Too short to score.');expect(m.valid).toBe(false);
    expect(historySummary([s],formula).averageScore).toBeNull();
  });
  it.each([120000,180000])('scores at or above 120 eligible seconds (%i)',duration=>{
    const s=valid(saved(duration));const m=metrics(s,formula);
    expect(m.valid).toBe(true);expect(m.score).toBeCloseTo(s.durations.focused/duration*100);
  });
  it('uses eligible tracking time rather than wall time and excludes manual pauses and gaps',()=>{
    const sim=simulation();sim.feed(60000);sim.send({type:'pause',at:60000});
    sim.send({type:'tick',at:120000});sim.send({type:'resume',at:120000});
    sim.send({type:'sample',at:120100,signal:'on-screen'});sim.feed(180100);
    sim.send({type:'sample',at:200100,signal:'on-screen'});sim.send({type:'end',at:200100});
    const s=valid(sim.snapshot()),m=metrics(s,formula);
    expect(s.elapsedMs).toBe(200100);expect(s.durations.manual_pause).toBe(60000);
    expect(s.durations.unobserved).toBe(20100);expect(m.eligibleMs).toBe(120000);
    expect(m.distractionsPerHour).toBe(s.distractionCount/(120000/3600000));
  });
  it('returns unavailable ratios for zero eligible time',()=>{
    const sim=simulation();sim.send({type:'tick',at:1000});sim.send({type:'end',at:1000});
    const s=valid(sim.snapshot()),m=metrics(s,formula);
    expect(m.eligibleMs).toBe(0);expect(m.focusPercentage).toBeNull();expect(m.distractionsPerHour).toBeNull();expect(m.scoreLabel).toBe('Unavailable');
  });
  it('keeps unknown formulas explicitly unavailable instead of inventing a score',()=>{
    const m=metrics(valid(saved()));expect(m.valid).toBe(true);expect(m.score).toBeNull();expect(m.scoreLabel).toBe('Score formula unavailable');
  });
  it('applies origin, schema and timestamp validation to comparative analytics',()=>{
    const live=valid(saved());
    expect(metrics({...live,source:'simulated'},formula).valid).toBe(false);
    expect(metrics({...live,source:'manual-timer'},formula).valid).toBe(false);
    expect(metrics({...live,creditedMs:Infinity},formula).valid).toBe(false);
    expect(validateSession({...live,elapsedMs:1}).ok).toBe(false);
    expect(validateSession({...live,rawLandmarks:[]}).ok).toBe(false);
    expect(metrics({...live,status:'active',endedAt:null},formula).valid).toBe(false);
  });
});

describe('duration-weighted non-focused episodes',()=>{
  it.each([[6000,4000,'looking_away'],[5999,4001,'mixed'],[4000,6000,'tracking_uncertain'],[4001,5999,'mixed'],[0,0,'mixed']])('classifies low=%i unknown=%i as %s',(low,unknown,label)=>{
    expect(episodeClassification(Number(low),Number(unknown))).toBe(label);
  });
  it('records all sub-threshold episodes with measured low/unknown durations',()=>{
    const sim=simulation();sim.feed(1000);sim.send({type:'sample',at:1100,signal:'off-screen'});
    sim.feed(3100,'off-screen');sim.send({type:'sample',at:3200,signal:'invalid'});
    sim.feed(4000,'invalid');sim.send({type:'sample',at:4100,signal:'on-screen'});sim.feed(4500);
    sim.send({type:'end',at:4500});const s=valid(sim.snapshot());
    const e=s.episodes.find(e=>e.startMs===1100)!;
    expect(e.durationMs).toBe(3300);expect(e.lowMs).toBe(2100);expect(e.unknownMs).toBe(1200);
    expect(e.belowThreshold).toBe(true);expect(e.counted).toBe(false);expect(e.classification).toBe('looking_away');
    expect(metrics(s).averageEpisodeMs).toBe((300+3300)/2);expect(s.distractionCount).toBe(0);
  });
  it('preserves exactly-once Stage 2 combined counting and timeline event markers',()=>{
    const sim=simulation();sim.feed(1000);sim.send({type:'sample',at:1100,signal:'off-screen'});
    sim.feed(6000,'off-screen');sim.send({type:'sample',at:6100,signal:'invalid'});sim.feed(31100,'invalid');
    sim.send({type:'end',at:31100});const s=valid(sim.snapshot());
    expect(s.distractionCount).toBe(1);expect(s.episodes.filter(e=>e.counted)).toHaveLength(1);
    expect(s.timeline.flatMap(t=>t.events)).toEqual([{episodeId:2,atMs:11100}]);
  });
  it('separates unobserved gaps from measured unknown durations without changing Stage 2 counts',()=>{
    const sim=simulation();sim.feed(1000);sim.send({type:'sample',at:1100,signal:'invalid'});
    sim.send({type:'tick',at:1600});sim.send({type:'tick',at:11100});sim.send({type:'end',at:11100});
    const s=valid(sim.snapshot()),e=s.episodes.at(-1)!;
    expect(s.distractionCount).toBe(1);expect(e.unobservedMs).toBe(10000);expect(e.unknownMs).toBe(0);
    expect(e.classification).toBe('mixed');expect(s.durations.unknown).toBe(300);
  });
  it('stores unavailable calibration as null metadata, never fabricated quality',()=>{
    const s=valid(saved());expect(s.calibration).toEqual({calibrated:false,quality:'unavailable',residualError:null,method:null});
    expect(JSON.stringify(s)).not.toMatch(/weights|landmarks|features|video|iris/i);
  });
});

describe('bounded deterministic timelines',()=>{
  it('merges adjacent identical states before compaction',()=>{
    let t:TimelineSegment[]=[];t=appendTimeline(t,0,100,'focused');t=appendTimeline(t,100,200,'focused');
    expect(t).toHaveLength(1);expect(t[0].durations.focused).toBe(200);
  });
  it('caps at 500 and preserves duration totals, transition count and event locations',()=>{
    const input:TimelineSegment[]=[];
    for(let i=0;i<1500;i++) {
      const state:TimelineState=i%2?'unknown':'low',durations=emptyDurations();durations[state]=10;
      input.push({startMs:i*10,endMs:(i+1)*10,state,firstState:state,lastState:state,durations,transitions:0,events:i===1000?[{episodeId:1,atMs:10000}]:[]});
    }
    const a=compactTimeline(input),b=compactTimeline(input);
    expect(a).toEqual(b);expect(a).toHaveLength(500);
    expect(a.reduce((n,t)=>n+t.durations.low,0)).toBe(7500);expect(a.reduce((n,t)=>n+t.durations.unknown,0)).toBe(7500);
    expect(a.flatMap(t=>t.events)).toEqual([{episodeId:1,atMs:10000}]);
    expect(a.filter(t=>t.state==='mixed').length).toBeGreaterThan(0);
    const transitions=a.reduce((n,t,i)=>n+t.transitions+(i&&a[i-1].lastState!==t.firstState?1:0),0);
    expect(transitions).toBe(1499);
    expect(input).toHaveLength(1500);
  });
});

describe('checkpoints, recovery and asynchronous persistence',()=>{
  it('recovers a checkpoint as interrupted without filling the unseen recovery period',async()=>{
    const sim=simulation();sim.feed(45000);const s=valid(sim.snapshot());
    const repo=new MemoryRepository();await repo.put(s);
    const history=await loadHistory(repo,async()=>false),recovered=history.sessions[0];
    expect(recovered.status).toBe('interrupted');expect(recovered.elapsedMs).toBe(45000);
    expect(recovered.durations).toEqual(s.durations);expect(metrics(recovered,formula).valid).toBe(false);
    expect(metrics(recovered,formula).scoreLabel).toBe('Too short to score.');
  });
  it('includes sufficiently observed valid interrupted sessions in comparisons',()=>{
    const sim=simulation();sim.feed(120000);const active=valid(sim.snapshot()),recovered=valid(asInterrupted(active));
    expect(metrics(recovered,formula).valid).toBe(true);expect(historySummary([recovered],formula).averageScore).not.toBeNull();
  });
  it('does not interrupt a session still active in another tab and skips corrupt records',async()=>{
    const sim=simulation();sim.feed(1000);const repo=new MemoryRepository();await repo.put(valid(sim.snapshot()));
    repo.values.set('bad',{schemaVersion:999});
    const history=await loadHistory(repo,async()=>true);
    expect(history.sessions[0].status).toBe('active');expect(history.invalid).toHaveLength(1);
  });
  it('queues checkpoint writes outside receive and prevents old idle writes overwriting a final save',async()=>{
    const repo=new MemoryRepository(),tasks:(()=>void)[]=[];
    const writer=new SessionWriter(repo,task=>tasks.push(task),async()=>()=>{},()=> 'test-owner',e=>{throw e;});
    let engine=updateSession(createSession(),{type:'start',at:0});
    writer.begin(engine,calibrationMetadata(null),'writer-session',startISO);
    const before=engine;engine=updateSession(engine,{type:'sample',at:0,signal:'on-screen'});writer.receive(before,{type:'sample',at:0,signal:'on-screen'},engine);
    expect(repo.writes).toBe(0);writer.flush();expect(repo.writes).toBe(0);
    writer.finish('interrupted');await new Promise(resolve=>setTimeout(resolve,0));
    tasks.forEach(task=>task());await new Promise(resolve=>setTimeout(resolve,0));
    const saved=(await repo.list())[0] as SavedSession;expect(saved.status).toBe('interrupted');expect(saved.revision).toBe(3);
  });
});

// Checkpoint cadence uses the same production clock method as useStudySession.
describe('checkpoint cadence and invalid score configuration',()=>{
  it('keeps corrupt analytics unavailable instead of publishing invalid ratios',()=>{
    const corrupt={...saved(),durations:{...emptyDurations(),focused:-1}};
    expect(metrics(corrupt,formula)).toMatchObject({valid:false,score:null,focusPercentage:null,distractionsPerHour:null});
  });
  it('does not fabricate a fallback score for a throwing or nonfinite formula',()=>{
    const s=valid(saved());
    expect(metrics(s,{version:'bad',description:'test only',evaluate:()=>NaN}).score).toBeNull();
    expect(metrics(s,{version:'bad',description:'test only',evaluate:()=>{throw new Error('test');}}).score).toBeNull();
  });
  it('validates floating monotonic timestamps against millisecond-resolution ISO timestamps',()=>{
    const sim=simulation();sim.feed(1000);sim.send({type:'end',at:1000.567});
    valid(sim.snapshot());
  });
});

describe('full recorder compaction and persistence error isolation',()=>{
  it('produces a valid bounded checkpoint after more than 500 live-shaped state changes',()=>{
    const sim=simulation();sim.feed(1000);
    for(let at=1100;at<=151000;at+=100) sim.send({type:'sample',at,signal:at%200===0?'off-screen':'invalid'});
    sim.send({type:'end',at:151000});const s=valid(sim.snapshot());
    expect(s.timeline.length).toBeLessThanOrEqual(500);
    expect(s.timeline.some(t=>t.state==='mixed')).toBe(true);
    expect(s.distractionCount).toBe(1);expect(s.timeline.flatMap(t=>t.events)).toHaveLength(1);
    expect(s.durations.low+s.durations.unknown+s.durations.focused).toBe(151000);
  });
  it('records episodes interrupted by manual pause while excluding pause durations',()=>{
    const sim=simulation();sim.feed(1000);sim.send({type:'sample',at:1100,signal:'invalid'});sim.feed(5000,'invalid');
    sim.send({type:'pause',at:5100});sim.send({type:'tick',at:11000});sim.send({type:'resume',at:12000});
    sim.send({type:'sample',at:12100,signal:'on-screen'});sim.feed(12500);sim.send({type:'end',at:12500});
    const s=valid(sim.snapshot());expect(s.durations.manual_pause).toBe(6900);
    expect(s.episodes.find(e=>e.startMs===1100)?.belowThreshold).toBe(true);expect(s.distractionCount).toBe(0);
  });
  it('does not reject valid calibration metadata, but rejects biometric additions',()=>{
    const s=saved();const calibrated={...s,calibration:{calibrated:true,quality:'ready' as const,residualError:.06,method:'nine-point-ridge-v1'}};
    valid(calibrated);
    expect(validateSession({...calibrated,calibration:{...calibrated.calibration,weights:[]}}).ok).toBe(false);
    expect(validateSession({...s,timeline:s.timeline.map((t,i)=>i? t:{...t,state:'low'})}).ok).toBe(false);
  });
  it('catches asynchronous storage failures without throwing into tracking',async()=>{
    const errors:unknown[]=[],tasks:(()=>void)[]=[];
    const writer=new SessionWriter({list:async()=>[],put:async()=>{throw new Error('Storage denied');}},task=>tasks.push(task),async()=>()=>{},()=> 'test-owner',error=>{errors.push(error);});
    const engine=updateSession(createSession(),{type:'start',at:0});
    expect(()=>writer.begin(engine,calibrationMetadata(null),'storage-error-test',startISO)).not.toThrow();
    tasks.forEach(task=>task());await new Promise(resolve=>setTimeout(resolve,0));
    expect(errors).toHaveLength(1);writer.finish('interrupted');await new Promise(resolve=>setTimeout(resolve,0));
  });
});

describe('calibration setup exclusion during an active session',()=>{
  it('excludes in-session calibration from eligible time without altering Stage 2 behavior',()=>{
    const sim=simulation();sim.feed(1000);sim.send({type:'interrupt',at:1100,reason:'Calibration started'});
    for(let at=1200;at<=13100;at+=100) sim.send({type:'sample',at,signal:'invalid',setup:true});
    sim.send({type:'sample',at:13200,signal:'on-screen',setup:false});sim.feed(14000);sim.send({type:'end',at:14000});
    const s=valid(sim.snapshot());
    expect(s.durations.setup).toBe(12000);
    expect(metrics(s).eligibleMs).toBe(s.elapsedMs-s.durations.setup-s.durations.unobserved-s.durations.manual_pause);
    expect(s.distractionCount).toBe(sim.engine.focus.distractionCount);
    expect(s.timeline.some(t=>t.state==='setup')).toBe(true);
  });
});

describe('measured episode averages',()=>{
  it('includes every measured short episode while excluding unobserved-only spans from the average',()=>{
    const sim=simulation();sim.feed(1000);sim.send({type:'sample',at:1100,signal:'invalid'});
    sim.send({type:'tick',at:1600});sim.send({type:'tick',at:11100});sim.send({type:'end',at:11100});
    const s=valid(sim.snapshot());expect(s.episodes).toHaveLength(2);
    expect(metrics(s).averageEpisodeMs).toBe(300); // real initial stabilization, not the 10s missing-frame span
    expect(s.distractionCount).toBe(1); // Stage 2 compatibility is unaffected
  });
});
