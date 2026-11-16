import type { CSSProperties } from 'react';
const paths={
  dashboard:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  focus:'M9 4h6 M12 4v3 M8 2h8 M19 7l2 2 M20 14a8 8 0 1 1-16 0 8 8 0 0 1 16 0 M12 10v4l3 2',
  history:'M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2',
  settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',
  check:'M5 12l4 4L19 6',
  low:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M18 3l3 3 M21 3l-3 3',
  unknown:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M9.5 9a2.5 2.5 0 1 1 4 2c-1 .6-1.5 1-1.5 2 M12 16v.2',
  pause:'M8 5v14 M16 5v14',
  alert:'M12 3L2 21h20L12 3 M12 9v5 M12 17v.2',
  play:'M8 4l12 8-12 8z',
  stop:'M5 5h14v14H5z',
  camera:'M3 6h12v12H3z M15 10l6-4v12l-6-4',
  target:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 1v4 M12 19v4 M1 12h4 M19 12h4',
  arrow:'M4 12h16 M14 6l6 6-6 6',
  shield:'M12 2l8 4v6c0 5-8 10-8 10S4 17 4 12V6z M8 12l3 3 5-6',
  globe:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
  bell:'M18 9a6 6 0 1 0-12 0c0 5-2 7-2 7h16s-2-2-2-7 M10 20a2 2 0 0 0 4 0',
  clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2',
  external:'M14 4h6v6 M20 4l-9 9 M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5',
  lock:'M6 11h12v9H6z M9 11V8a3 3 0 0 1 6 0v3',
  checkCircle:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M8 12l3 3 5-6',
} as const;
export type IconName=keyof typeof paths;
export function Icon({name,className='',style}:{name:IconName;className?:string;style?:CSSProperties}) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={`ui-icon ${className}`} style={style}><path d={paths[name]}/></svg>;
}
