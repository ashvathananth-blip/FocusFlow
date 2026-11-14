import type { SavedSession } from '@/types/analytics';
import { validateSession } from './schema';
import { ANALYTICS_CONFIG, type ScoreFormula } from './config';
export { episodeClassification } from './episodes';
export function eligibleMs(s:SavedSession) { return s.durations.focused+s.durations.low+s.durations.unknown; }
/** Call with a schema-validated record. Active sessions never enter comparisons. */
export function metrics(s:SavedSession,formula:ScoreFormula|null=ANALYTICS_CONFIG.scoreFormula) {
  if(!validateSession(s).ok) return {eligibleMs:0,focusPercentage:null,unknownPercentage:null,distractionsPerHour:null,valid:false,score:null,scoreLabel:'Unavailable',averageEpisodeMs:null};
  const eligible=eligibleMs(s);
  const focusPercentage=eligible>0?s.durations.focused/eligible*100:null;
  const unknownPercentage=eligible>0?s.durations.unknown/eligible*100:null;
  const distractionsPerHour=eligible>0?s.distractionCount/(eligible/3_600_000):null;
  const valid=s.source==='live-camera' && eligible>=ANALYTICS_CONFIG.minEligibleMs && s.status!=='active';
  let score:number|null=null;
  if(valid && formula && focusPercentage!==null && unknownPercentage!==null && distractionsPerHour!==null) {
    try {
      const computed=formula.evaluate({focusPercentage,unknownPercentage,distractionsPerHour});
      if(Number.isFinite(computed)) score=computed;
    } catch { /* An invalid configured formula must not fabricate a replacement score. */ }
  }
  const scoreLabel=eligible===0?'Unavailable':eligible<ANALYTICS_CONFIG.minEligibleMs?'Too short to score.':!valid?'Unavailable':score===null?'Score formula unavailable':score.toFixed(1);
  const episodes=[...s.episodes,...(s.currentEpisode?[s.currentEpisode]:[])].filter(e=>e.lowMs+e.unknownMs>0);
  return { eligibleMs:eligible,focusPercentage,unknownPercentage,distractionsPerHour,valid,score,scoreLabel,
    averageEpisodeMs:episodes.length?episodes.reduce((n,e)=>n+e.lowMs+e.unknownMs,0)/episodes.length:null };
}
export function historySummary(sessions:SavedSession[],formula:ScoreFormula|null=ANALYTICS_CONFIG.scoreFormula) {
  const comparable=sessions.map(s=>({session:s,metrics:metrics(s,formula)})).filter(item=>item.metrics.valid);
  const scores=comparable.map(item=>item.metrics.score).filter((n):n is number=>n!==null);
  const eligible=comparable.reduce((n,item)=>n+item.metrics.eligibleMs,0);
  return { comparable,averageScore:scores.length?scores.reduce((n,s)=>n+s,0)/scores.length:null,
    focusPercentage:eligible>0?comparable.reduce((n,item)=>n+item.session.durations.focused,0)/eligible*100:null,
    eligibleMs:eligible };
}
