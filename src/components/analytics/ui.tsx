import type { ReactNode } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
export function Badge({children,tone='neutral'}:{children:ReactNode;tone?:'neutral'|'good'|'warning'}) {
  const text=typeof children==='string'?children:'';
  const status=text==='Interrupted'?'interrupted':text==='Completed'?'completed':text==='In progress'?'active':tone==='good'?'focused':tone==='warning'?'event':'unknown';
  return <StatusBadge status={status}>{children}</StatusBadge>;
}
export function StatCard({label,value,note,accent=false}:{label:string;value:ReactNode;note?:ReactNode;accent?:boolean}) {
  return <div className={`summary-item${accent?' is-accent':''}`}><p className="summary-label">{label}</p><p className="summary-value">{value}</p>{note&&<p className="summary-note">{note}</p>}</div>;
}
export function ChartCard({title,description,children}:{title:string;description?:string;children:ReactNode}) {
  return <section className="analytics-chart"><h2>{title}</h2>{description&&<p className="chart-description">{description}</p>}<div className="chart-body">{children}</div></section>;
}
export function EmptyState({title,description,action=true,art}:{title:string;description:string;action?:boolean;art?:ReactNode}) {
  return <section className={`analytics-empty${art?' has-art':''}`}><div className="empty-copy"><h2>{title}</h2><p>{description}</p>{action&&<Button asChild><Link href="/study">Start Focus Session</Link></Button>}</div>{art&&<div className="empty-art">{art}</div>}</section>;
}
export function AnalyticsHeader({detail=false}:{detail?:boolean}) {
  return <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-700 pb-5"><Link href="/" className="text-lg font-semibold tracking-tight">Focus Flow <span className="ml-2 text-xs font-normal text-zinc-400">Local attention history</span></Link><nav aria-label="Application navigation" className="flex gap-5 text-sm"><Link href="/study">Study</Link><Link href="/history" aria-current={detail?undefined:'page'}>History</Link></nav></header>;
}
export function HistoryLoading() {return <main className="page-container"><div role="status" className="skeleton-page"><div className="skeleton-stack" aria-hidden="true"><div className="skeleton skeleton-title"/><div className="skeleton skeleton-line" style={{width:'92%'}}/><div className="skeleton skeleton-line" style={{width:'64%'}}/><div className="skeleton skeleton-rule"/><div className="skeleton skeleton-line" style={{width:'48%',height:36}}/><div className="skeleton skeleton-line" style={{width:'88%'}}/><div className="skeleton skeleton-line" style={{width:'72%'}}/><div className="skeleton skeleton-line" style={{width:'80%'}}/></div><p className="chart-description">Loading your history. Opening sessions stored in this browser. No camera access is needed.</p></div></main>;}
export const formatDuration=(ms:number|null)=>{
  if(ms===null) return 'Unavailable';
  if(ms<60000) return `${Math.floor(ms)/1000}s`;
  const seconds=Math.floor(ms/1000),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds/60)%60;
  return hours?`${hours}h ${minutes}m ${seconds%60}s`:`${Math.floor(seconds/60)}m ${seconds%60}s`;
};
export const percent=(n:number|null)=>n===null?'Unavailable':`${n.toFixed(1)}%`;
export const dateLabel=(iso:string)=>new Date(iso).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
export const episodeLabel={looking_away:'Looking-away classification',tracking_uncertain:'Tracking uncertain',mixed:'Mixed / no dominant state'} as const;
export const statusLabel={active:'In progress',ended:'Ended',completed:'Completed',interrupted:'Interrupted'} as const;
export const SCORE_DISCLOSURE='Visual-attention estimate, not a measure of concentration.';
export const CREDIT_DISCLOSURE='Uses the existing Stage 2 grace-period credit rules; may differ from observed focused time.';
