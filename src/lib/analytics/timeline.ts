import type { Durations, TimelineSegment, TimelineState } from '@/types/analytics';
import { ANALYTICS_CONFIG } from './config';
export const STATES: TimelineState[] = ['focused','low','unknown','manual_pause','setup','unobserved'];
export function emptyDurations(): Durations { return { focused:0,low:0,unknown:0,manual_pause:0,setup:0,unobserved:0 }; }
export function sumDurations(d: Durations) { return STATES.reduce((n,key)=>n+d[key],0); }
function merge(a: TimelineSegment,b: TimelineSegment): TimelineSegment {
  const durations=emptyDurations(); for(const state of STATES) durations[state]=a.durations[state]+b.durations[state];
  return { startMs:a.startMs,endMs:b.endMs,state:a.state===b.state && a.state!=='mixed'?a.state:'mixed',
    firstState:a.firstState,lastState:b.lastState,durations,
    transitions:a.transitions+b.transitions+(a.lastState===b.firstState?0:1),events:[...a.events,...b.events] };
}
/** Merge identical neighbors, then merge the shortest adjacent pair (earliest tie).
 * Mixed bins retain exact state totals, boundary states, transition counts/events.
 * Their internal ordering is intentionally NOT presented as a pure state.
 */
export function compactTimeline(input: TimelineSegment[], limit: number=ANALYTICS_CONFIG.maxTimelineSegments): TimelineSegment[] {
  if(!Number.isInteger(limit)||limit<1) throw new Error('Invalid timeline limit');
  const result: TimelineSegment[]=[];
  for(const segment of input) {
    const last=result.at(-1);
    if(last && last.endMs===segment.startMs && last.state===segment.state && last.state!=='mixed') result[result.length-1]=merge(last,segment);
    else result.push(segment);
  }
  while(result.length>limit) {
    let best=0, width=Infinity;
    for(let i=0;i<result.length-1;i++) {
      const span=result[i+1].endMs-result[i].startMs;
      if(span<width) { width=span; best=i; }
    }
    result.splice(best,2,merge(result[best],result[best+1]));
  }
  return result;
}
export function appendTimeline(timeline: TimelineSegment[],startMs:number,endMs:number,state:TimelineState): TimelineSegment[] {
  if(endMs<=startMs) return timeline;
  const durations=emptyDurations(); durations[state]=endMs-startMs;
  return compactTimeline([...timeline,{startMs,endMs,state,firstState:state,lastState:state,durations,transitions:0,events:[]}]);
}
