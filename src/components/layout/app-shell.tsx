'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { Icon, type IconName } from '@/components/ui/icon';
const links:{href:string;label:string;icon:IconName}[]=[
  {href:'/',label:'Dashboard',icon:'dashboard'},
  {href:'/study',label:'Focus Session',icon:'focus'},
  {href:'/history',label:'History',icon:'history'},
  {href:'/settings',label:'Settings',icon:'settings'},
];
export function Sidebar({pathname}:{pathname:string}) {
  return <aside className="app-sidebar"><Link href="/" className="app-brand" aria-label="Focus Flow dashboard"><span className="brand-mark"><Icon name="focus"/></span><span>Focus Flow<small>Make room for attention</small></span></Link><nav className="app-navigation" aria-label="Application navigation">{links.map(link=>{
    const selected=link.href==='/'?pathname==='/':pathname===link.href||pathname.startsWith(`${link.href}/`);
    return <Link key={link.href} href={link.href} aria-current={selected?'page':undefined} className={`navigation-link ${selected?'is-current':''}`}><Icon name={link.icon}/><span>{link.label}</span></Link>;
  })}</nav><div className="sidebar-note"><Icon name="shield"/><p>Private by design<small>Tracking stays on your device.</small></p></div></aside>;
}
function ActiveSidebar() {
  return <Sidebar pathname={usePathname() ?? ''} />;
}
export function AppShell({children}:{children:ReactNode}) {
  return <div className="app-shell"><a href="#app-content" className="skip-link">Skip to content</a><Suspense fallback={<Sidebar pathname="" />}><ActiveSidebar /></Suspense><div className="app-workspace" id="app-content" tabIndex={-1}><div className="mobile-tracking-note"><Icon name="camera"/><p>Camera-based attention tracking is currently verified only on desktop Chrome.</p></div>{children}</div></div>;
}
