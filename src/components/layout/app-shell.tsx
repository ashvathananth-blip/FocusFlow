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
function BrandMark() {
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="8.4" strokeOpacity=".22" />
    <circle cx="12" cy="12" r="4.9" strokeOpacity=".5" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    <path d="M12 3.6v1.9M12 18.5v1.9M3.6 12h1.9M18.5 12h1.9" strokeOpacity=".55" strokeLinecap="round" />
  </svg>;
}
export function Sidebar({pathname}:{pathname:string}) {
  return <aside className="app-sidebar">
    <Link href="/" className="app-brand" aria-label="Focus Flow dashboard"><span className="brand-mark"><BrandMark/></span><span className="brand-text"><span className="brand-name">Focus Flow</span><span className="brand-tag">Make room for attention</span></span></Link>
    <p className="nav-label">Workspace</p>
    <nav className="app-navigation" aria-label="Application navigation">{links.map(link=>{
      const selected=link.href==='/'?pathname==='/':pathname===link.href||pathname.startsWith(`${link.href}/`);
      return <Link key={link.href} href={link.href} aria-current={selected?'page':undefined} className={`navigation-link ${selected?'is-current':''}`}><Icon name={link.icon}/><span>{link.label}</span></Link>;
    })}</nav>
    <div className="sidebar-note"><span className="note-dot" aria-hidden="true"/><p>Private by design<small>Tracking stays on this device.</small></p></div>
  </aside>;
}
function ActiveSidebar() {
  return <Sidebar pathname={usePathname() ?? ''} />;
}
export function AppShell({children}:{children:ReactNode}) {
  return <div className="app-shell"><a href="#app-content" className="skip-link">Skip to content</a><Suspense fallback={<Sidebar pathname="" />}><ActiveSidebar /></Suspense><div className="app-workspace" id="app-content" tabIndex={-1}><div className="mobile-tracking-note"><Icon name="camera"/><p>Camera-based attention tracking is currently verified only on desktop Chrome.</p></div>{children}</div></div>;
}
