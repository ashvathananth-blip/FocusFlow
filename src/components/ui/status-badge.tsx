import type { ReactNode } from 'react';
import { Icon, type IconName } from './icon';
export type StatusKind='focused'|'low'|'unknown'|'paused'|'event'|'error'|'completed'|'idle'|'active'|'interrupted';
const statusInfo:Record<StatusKind,{label:string;icon:IconName}>={
  focused:{label:'Focused',icon:'check'},low:{label:'Low attention',icon:'low'},unknown:{label:'Tracking unknown',icon:'unknown'},
  paused:{label:'Paused',icon:'pause'},event:{label:'Distraction recorded',icon:'alert'},error:{label:'Error',icon:'alert'},
  completed:{label:'Completed',icon:'check'},idle:{label:'Ready to begin',icon:'play'},active:{label:'In progress',icon:'focus'},interrupted:{label:'Interrupted',icon:'pause'},
};
export function StatusBadge({status='unknown',children}:{status?:StatusKind;children?:ReactNode}) {
  const info=statusInfo[status];
  return <span className={`status-badge status-${status}`}><Icon name={info.icon}/><span>{children ?? info.label}</span></span>;
}
