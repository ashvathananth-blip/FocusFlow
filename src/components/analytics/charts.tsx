'use client';
import { useId } from 'react';
import type { Durations, SavedSession } from '@/types/analytics';
import { metrics } from '@/lib/analytics/metrics';
import { STATES } from '@/lib/analytics/timeline';
import { formatDuration,percent } from './ui';
const styles={focused:{label:'Observed focused',color:'#52E0C4'},low:{label:'Low attention',color:'#F0B36A'},unknown:{label:'Tracking uncertain',color:'#68A8FF'},manual_pause:{label:'Manual pause',color:'#8B98A9'},setup:{label:'Calibration / setup',color:'#6F7C8F'},unobserved:{label:'Unobserved / gaps',color:'#4A5568'}};
export function AttentionBreakdown({durations}:{durations:Durations}) {
  const total=STATES.reduce((n,k)=>n+durations[k],0);
  return <div>
    <div className="breakdown-bar" role="img" aria-label={STATES.map(k=>`${styles[k].label}: ${formatDuration(durations[k])}`).join(', ')}>{STATES.map((k,i)=>durations[k]>0&&<span key={k} title={`${styles[k].label}: ${formatDuration(durations[k])}`} style={{width:`${total?durations[k]/total*100:0}%`,backgroundColor:styles[k].color,backgroundImage:i%2?'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(8,9,10,.45) 4px, rgba(8,9,10,.45) 6px)':'none'}}/>)}</div>
    <ul className="chart-legend">{STATES.map(k=><li key={k}><span className="legend-swatch" style={{backgroundColor:styles[k].color}} aria-hidden="true" />{styles[k].label}</li>)}</ul>
    <dl className="breakdown-list">{STATES.map(k=><div key={k}><dt>{styles[k].label}</dt><dd>{formatDuration(durations[k])}</dd></div>)}</dl>
  </div>;
}
export function FocusTrend({sessions}:{sessions:SavedSession[]}) {
  const entries=sessions.filter(s=>metrics(s).valid).slice(0,12).reverse();
  if(!entries.length) return <p className="chart-description">A trend appears after a validated session reaches 2 minutes of eligible tracking.</p>;
  const left=44,right=620,top=20,bottom=150;
  const points=entries.map((s,i)=>({s,x:left+(entries.length>1?i/(entries.length-1)*(right-left):(right-left)/2),y:bottom-(metrics(s).focusPercentage ?? 0)/100*(bottom-top)}));
  const line=points.map(p=>`${p.x},${p.y}`).join(' ');
  return <div className="overflow-x-auto"><svg viewBox="0 0 650 200" className="min-w-[480px] w-full" role="img" aria-label="Focus percentage trend across eligible sessions, normalized by observed tracking time">
    <defs>
      <linearGradient id="focus-trend-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#52E0C4" stopOpacity="0.14" />
        <stop offset="100%" stopColor="#52E0C4" stopOpacity="0" />
      </linearGradient>
    </defs>
    {[0,25,50,75,100].map(n=><g key={n}>
      <line x1={left} x2={right} y1={bottom-n/100*(bottom-top)} y2={bottom-n/100*(bottom-top)} stroke="#94A3B8" strokeOpacity={n===0?0.22:0.08} strokeDasharray="2 6" />
      <text x={left-12} y={bottom-n/100*(bottom-top)+4} textAnchor="end" fill="#7C8CA1" fontSize="11">{n}%</text>
    </g>)}
    <polygon points={`${left},${bottom} ${line} ${right},${bottom}`} fill="url(#focus-trend-fill)" />
    <polyline points={line} fill="none" stroke="#52E0C4" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    {points.map((p,i)=><g key={p.s.id}>
      <circle cx={p.x} cy={p.y} r="8" fill="#52E0C4" fillOpacity="0.08" />
      <circle cx={p.x} cy={p.y} r="3.5" fill="#0B1016" stroke="#52E0C4" strokeWidth="1.75"><title>{`${new Date(p.s.startedAt).toLocaleDateString()}: ${percent(metrics(p.s).focusPercentage)}`}</title></circle>
      <text x={p.x} y={bottom+22} textAnchor="middle" fill="#7C8CA1" fontSize="11">{i+1}</text>
    </g>)}
  </svg>
  <ol className="chart-legend">{points.map((p,i)=><li key={p.s.id}><span className="legend-swatch" style={{backgroundColor:'#52E0C4'}} aria-hidden="true" />{i+1} · {new Date(p.s.startedAt).toLocaleDateString()} · {percent(metrics(p.s).focusPercentage)}</li>)}</ol></div>;
}
export function AttentionTimeline({session}:{session:SavedSession}) {
  const id=useId().replaceAll(':','_'),width=900;
  if(!session.timeline.length) return <p className="chart-description">No measured timeline is available for this session.</p>;
  return <div className="overflow-x-auto"><svg viewBox="0 0 900 78" className="min-w-[600px] w-full" role="img" aria-label="Attention timeline; patterned segments distinguish states. Mixed bins retain measured durations; event triangles mark counted non-focused episodes.">
    <defs><pattern id={`${id}-mixed`} width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#243040"/><path d="M0 8L8 0" stroke="#94A3B8" strokeWidth="1.4"/></pattern>{STATES.map((k,i)=><pattern key={k} id={`${id}-${k}`} width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill={styles[k].color}/>{i>0&&(i%2?<path d="M0 8L8 0" stroke="#0B101699" strokeWidth="2"/>:<circle cx="3" cy="3" r="1.4" fill="#0B101699"/>)}</pattern>)}</defs>
    <rect x="0" y="8" width={width} height="34" fill="#171F2A" rx="3" />
    {session.timeline.map((t,i)=><rect key={i} x={t.startMs/session.elapsedMs*width} y="8" width={Math.max((t.endMs-t.startMs)/session.elapsedMs*width,1)} height="34" fill={`url(#${id}-${t.state})`}><title>{`${formatDuration(t.startMs)}–${formatDuration(t.endMs)}: ${t.state}. ${STATES.filter(k=>t.durations[k]>0).map(k=>`${styles[k].label} ${formatDuration(t.durations[k])}`).join(', ')}. ${t.transitions} internal state changes.`}</title></rect>)}
    {session.timeline.flatMap(t=>t.events).map(e=><path key={e.episodeId} d={`M${e.atMs/session.elapsedMs*width} 50 l-4 8 h8 z`} fill="#F1F5F9"><title>Counted non-focused episode at {formatDuration(e.atMs)}</title></path>)}
    <text x="0" y="74" fill="#7C8CA1" fontSize="11">0m</text><text x="900" y="74" textAnchor="end" fill="#7C8CA1" fontSize="11">{formatDuration(session.elapsedMs)}</text>
    </svg><p className="chart-description">Solid: focused · Stripes: low / manual pause · Dots: uncertain / unobserved · Cross-state bins: mixed · Triangles: counted episode. Labels and exact durations are available below.</p>
    <details className="mt-4"><summary className="cursor-pointer text-sm">Timeline labels and measured durations ({session.timeline.length} segments)</summary><div className="mt-3 max-h-80 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th>Session offset</th><th>Classification</th><th>Measured durations</th><th>State changes / events</th></tr></thead><tbody>{session.timeline.map((t,i)=><tr key={i}><td>{formatDuration(t.startMs)}–{formatDuration(t.endMs)}</td><td>{t.state==='mixed'?'Aggregated / mixed':styles[t.state].label}</td><td>{STATES.filter(k=>t.durations[k]>0).map(k=>`${styles[k].label}: ${formatDuration(t.durations[k])}`).join('; ')}</td><td>{t.transitions} / {t.events.length}</td></tr>)}</tbody></table></div></details>
  </div>;
}
