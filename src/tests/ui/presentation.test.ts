// Presentation-only assertions; the real focus/analytics regression suites remain intact.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Sidebar } from '@/components/layout/app-shell';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { CalibrationOverlay } from '@/components/calibration/calibration-overlay';
describe('shared application presentation',()=>{
  it('exposes keyboard-native navigation and active deep-link context',()=>{
    const html=renderToString(createElement(Sidebar,{pathname:'/history/example'}));
    for(const [href,label] of [['/','Dashboard'],['/study','Focus Session'],['/history','History'],['/settings','Settings']]) {
      expect(html).toContain(`href="${href}"`);expect(html).toContain(label);
    }
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/history"/);
    expect(html).toContain('aria-label="Application navigation"');
  });
  it.each([['focused','Focused'],['low','Low attention'],['unknown','Tracking unknown'],['paused','Paused'],['event','Distraction recorded']])('gives %s a readable label and decorative icon', (status,label)=>{
    const html=renderToString(createElement(StatusBadge,{status:status as 'focused'}));
    expect(html).toContain(label);expect(html).toContain('<svg');expect(html).toContain('aria-hidden="true"');expect(html).toContain(`status-${status}`);
  });
  it('uses a semantic page title without replacing page state',()=>{
    const html=renderToString(createElement(PageHeader,{title:'Focus Session',description:'Existing tracking state'}));
    expect(html).toContain('<h1>Focus Session</h1>');expect(html).toContain('Existing tracking state');
  });
  it('preserves calibration dialog accessibility and actual target coordinates',()=>{
    const html=renderToString(createElement(CalibrationOverlay,{progress:{group:0,phase:'settling',count:0},cancel:()=>{}}));
    expect(html).toContain('aria-modal="true"');expect(html).toContain('aria-label="Nine-point gaze calibration"');expect(html).toContain('Cancel calibration');
    expect(html).toContain('left:10%;top:10%');
  });
});

describe('Focus Session presentation with the real session hook',()=>{
  it('keeps camera-dependent controls disabled before tracking is ready',async()=>{
    const {default:Study}=await import('@/app/study/page');
    const html=renderToString(createElement(Study));
    for(const label of ['Start session','Pause','Resume','End session']) {
      const button=html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g)?.find(markup=>markup.includes(label));
      expect(button).toBeDefined();
      expect(button?.match(/^<button[^>]*>/)?.[0]).toContain('disabled=""');
    }
    expect(html).toContain('aria-label="Countdown">25:00');
    expect(html).toContain('aria-label="Mirrored live camera preview"');
    expect(html).toContain('aspect-video');
    expect(html).toContain('Uses the existing Stage 2 grace-period credit rules; may differ from observed focused time.');
    expect(html).toContain('Stage 2 transition and episode diagnostics');
  });
});
