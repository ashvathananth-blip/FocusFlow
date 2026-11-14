'use client';
import { useId } from 'react';
import type { Durations, SavedSession } from '@/types/analytics';
import { metrics } from '@/lib/analytics/metrics';
import { STATES } from '@/lib/analytics/timeline';
import { formatDuration,percent } from './ui';
const styles={focused:{label:'Observed focused',color:'#86EFAC'},low:{label:'Low attention',color:'#FCD34D'},unknown:{label:'Tracking uncertain',color:'#C4B5FD'},manual_pause:{label:'Manual pause',color:'#A1A1AA'},setup:{label:'Calibration / setup',color:'#93A2B8'},unobserved:{label:'Unobserved / gaps',color:'#71717A'}};
export function AttentionBreakdown({durations}:{durations:Durations}) {
  const total=STATES.reduce((n,k)=>n+durations[k],0);
  return <div><div className="flex h-8 overflow-hidden rounded-md bg-zinc-800" role="img" aria-label={STATES.map(k=>`${styles[k].label}: ${formatDuration(durations[k])}`).join(', ')}>{STATES.map((k,i)=>durations[k]>0&&<div key={k} title={`${styles[k].label}: ${formatDuration(durations[k])}`} style={{width:`${total?durations[k]/total*100:0}%`,backgroundColor:styles[k].color,backgroundImage:i%2?'repeating-linear-gradient(45deg, transparent, transparent 4px, #12121288 4px, #12121288 6px)':'none'}}/>)}</div><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">{STATES.map(k=><div key={k} className="flex justify-between gap-3"><dt className="text-zinc-300">{styles[k].label}</dt><dd className="tabular-nums">{formatDuration(durations[k])}</dd></div>)}</dl></div>;
}
export function FocusTrend({sessions}:{sessions:SavedSession[]}) {
  const entries=sessions.filter(s=>metrics(s).valid).slice(0,12).reverse();
  if(!entries.length) return <p className="py-10 text-sm text-zinc-400">A trend appears after a validated session reaches 2 minutes of eligible tracking.</p>;
  const points=entries.map((s,i)=>({s,x:40+(entries.length>1?i/(entries.length-1)*610:305),y:160-(metrics(s).focusPercentage ?? 0)*1.35}));
  return <div className="overflow-x-auto"><svg viewBox="0 0 700 195" className="min-w-[550px] w-full" role="img" aria-label="Focus percentage trend across eligible sessions, normalized by observed tracking time">
    {[0,50,100].map(n=><g key={n}><line x1="40" x2="660" y1={160-n*1.35} y2={160-n*1.35} stroke="#52525B" strokeDasharray="3 4"/><text x="2" y={164-n*1.35} fill="#B4B4BC" fontSize="15">{n}%</text></g>)}
    <polyline points={points.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke="#A5B4FC" strokeWidth="2"/>
    {points.map((p,i)=><g key={p.s.id}><circle cx={p.x} cy={p.y} r="4" fill="#A5B4FC"><title>{`${new Date(p.s.startedAt).toLocaleDateString()}: ${percent(metrics(p.s).focusPercentage)}`}</title></circle><text x={p.x} y="185" textAnchor="middle" fill="#B4B4BC" fontSize="14">{i+1}</text></g>)}
  </svg><ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">{points.map((p,i)=><li key={p.s.id}>{i+1}: {new Date(p.s.startedAt).toLocaleDateString()} · {percent(metrics(p.s).focusPercentage)}</li>)}</ol></div>;
}
export function AttentionTimeline({session}:{session:SavedSession}) {
  const id=useId().replaceAll(':','_'),width=900;
  if(!session.timeline.length) return <p className="text-sm text-zinc-400">No measured timeline is available for this session.</p>;
  return <div className="overflow-x-auto"><svg viewBox="0 0 900 70" className="min-w-[600px] w-full" role="img" aria-label="Attention timeline; patterned segments distinguish states. Mixed bins retain measured durations; event triangles mark counted non-focused episodes.">
    <defs><pattern id={`${id}-mixed`} width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#38383E"/><path d="M0 8L8 0" stroke="#E5E5E5" strokeWidth="1.5"/></pattern>{STATES.map((k,i)=><pattern key={k} id={`${id}-${k}`} width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill={styles[k].color}/>{i>0&&(i%2?<path d="M0 8L8 0" stroke="#12121299" strokeWidth="2"/>:<circle cx="3" cy="3" r="1.5" fill="#12121299"/>)}</pattern>)}</defs>
    {session.timeline.map((t,i)=><rect key={i} x={t.startMs/session.elapsedMs*width} y="10" width={(t.endMs-t.startMs)/session.elapsedMs*width} height="32" fill={`url(#${id}-${t.state})`}><title>{`${formatDuration(t.startMs)}–${formatDuration(t.endMs)}: ${t.state}. ${STATES.filter(k=>t.durations[k]>0).map(k=>`${styles[k].label} ${formatDuration(t.durations[k])}`).join(', ')}. ${t.transitions} internal state changes.`}</title></rect>)}
    {session.timeline.flatMap(t=>t.events).map(e=><path key={e.episodeId} d={`M${e.atMs/session.elapsedMs*width} 47 l-5 9 h10 z`} fill="#E5E5E5"><title>Counted non-focused episode at {formatDuration(e.atMs)}</title></path>)}
    <text x="0" y="68" fill="#B4B4BC" fontSize="15">0m</text><text x="900" y="68" textAnchor="end" fill="#B4B4BC" fontSize="15">{formatDuration(session.elapsedMs)}</text>
  </svg><p className="mt-2 text-xs leading-relaxed text-zinc-400">Solid: focused · Stripes: low / manual pause · Dots: uncertain / unobserved · Cross-state bins: mixed · Triangles: counted episode. Labels and exact durations are available below.</p>
    <details className="mt-4"><summary className="cursor-pointer text-sm">Timeline labels and measured durations ({session.timeline.length} segments)</summary><div className="mt-3 max-h-80 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th>Session offset</th><th>Classification</th><th>Measured durations</th><th>State changes / events</th></tr></thead><tbody>{session.timeline.map((t,i)=><tr key={i}><td>{formatDuration(t.startMs)}–{formatDuration(t.endMs)}</td><td>{t.state==='mixed'?'Aggregated / mixed':styles[t.state].label}</td><td>{STATES.filter(k=>t.durations[k]>0).map(k=>`${styles[k].label}: ${formatDuration(t.durations[k])}`).join('; ')}</td><td>{t.transitions} / {t.events.length}</td></tr>)}</tbody></table></div></details>
  </div>;
}
