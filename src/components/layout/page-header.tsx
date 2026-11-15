import type { ReactNode } from 'react';
export function PageHeader({eyebrow,title,description,actions,meta}:{eyebrow?:string;title:string;description?:ReactNode;actions?:ReactNode;meta?:ReactNode}) {
  return <header className="page-header"><div className="page-header-copy">{eyebrow&&<p className="page-eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description&&<div className="page-description">{description}</div>}{meta&&<div className="page-meta">{meta}</div>}</div>{actions&&<div className="page-actions">{actions}</div>}</header>;
}
