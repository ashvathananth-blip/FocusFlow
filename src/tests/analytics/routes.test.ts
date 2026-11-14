// Server-rendered route/presentation checks use empty or explicitly synthetic data.
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { HistoryFrame } from '@/components/analytics/history-view';
import { HistoryLoading } from '@/components/analytics/ui';
import Home from '@/app/page';
import Study from '@/app/study/page';
import HistoryPage from '@/app/history/page';
import DetailPage from '@/app/history/[id]/page';
import { SessionWriter } from '@/lib/storage/session-writer';
import { createSession, updateSession } from '@/lib/focus/timer-engine';
import { calibrationMetadata, checkpoint, recordEvent, startRecording } from '@/lib/analytics/recorder';
import { validateSession } from '@/lib/analytics/schema';

function shortSession() {
  let engine=updateSession(createSession(),{type:'start',at:0});
  let recording=startRecording(engine,'synthetic-test','test-owner','2026-11-14T12:00:00.000Z',calibrationMetadata(null));
  for(let at=0;at<=1000;at+=100) {
    const before=engine,event={type:'sample' as const,at,signal:'on-screen' as const};
    engine=updateSession(engine,event);recording=recordEvent(recording,before,event,engine);
  }
  const before=engine,event={type:'end' as const,at:1000};engine=updateSession(before,event);recording=recordEvent(recording,before,event,engine);
  const saved=checkpoint(recording,engine,1,'2026-11-14T12:00:01.000Z');
  expect(validateSession(saved).ok).toBe(true);return saved;
}
describe('history routes, disclosures, loading and empty states',()=>{
  it('exposes visible History links from Home and the unmodified Study header',()=>{
    for(const Page of [Home,Study]) expect(renderToString(createElement(Page))).toContain('href="/history"');
  });
  it('renders the history route loading state without browser storage or camera APIs',()=>{
    expect(renderToString(createElement(HistoryPage))).toContain('Loading your history');
    expect(renderToString(createElement(HistoryLoading))).toContain('No camera access is needed.');
    expect(createElement(DetailPage,{params:Promise.resolve({id:'synthetic-test'})})).toBeTruthy();
  });
  it('has a product empty state and normal Study navigation',()=>{
    const html=renderToString(createElement(HistoryFrame,{sessions:[]}));
    expect(html).toContain('Your history starts with a session');expect(html).toContain('href="/study"');
    expect(html).not.toContain('Test Mode');
  });
  it('lists short sessions with their raw measurements, link and score gate',()=>{
    const html=renderToString(createElement(HistoryFrame,{sessions:[shortSession()]}));
    expect(html).toContain('/history/synthetic-test');expect(html).toContain('Too short to score.');
    expect(html).toContain('Observed Focused Time');expect(html).toContain('Visual-attention estimate, not a measure of concentration.');
  });
  it('detail page distinguishes raw/normalized metrics and displays every required disclosure',()=>{
    const html=renderToString(createElement(HistoryFrame,{sessions:[shortSession()],sessionId:'synthetic-test'}));
    for(const label of ['Credited Focus Time','Observed Focused Time','Focus Percentage','Focus Score','Tracking-Uncertain Time','Non-Focused Episodes','Distraction Count']) expect(html).toContain(label);
    expect(html).toContain('Uses the existing Stage 2 grace-period credit rules; may differ from observed focused time.');
    expect(html).toContain('Visual-attention estimate, not a measure of concentration.');
    expect(html).toContain('includes sustained tracking uncertainty');
    expect(html).toContain('Unavailable');
  });
  it('has clear missing-session, corrupt-record and storage-error states',()=>{
    const html=renderToString(createElement(HistoryFrame,{sessions:[],sessionId:'missing',error:'Local storage denied',invalid:1}));
    expect(html).toContain('Session not found');expect(html).toContain('Local storage denied');expect(html).toContain('failed schema validation');
  });
  it('labels interrupted records and never invents observations after their checkpoint',()=>{
    const session={...shortSession(),status:'interrupted' as const};
    const html=renderToString(createElement(HistoryFrame,{sessions:[session],sessionId:session.id}));
    expect(html).toContain('Interrupted');expect(html).toContain('no time after it has been reconstructed');
  });
});
describe('production checkpoint scheduling',()=>{
  it('checkpoints every 15 seconds and cleans up the periodic clock',()=>{
    vi.useFakeTimers();
    try {
      const writer=new SessionWriter();const flush=vi.spyOn(writer,'flush');const stop=writer.startCheckpointClock();
      vi.advanceTimersByTime(14999);expect(flush).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);expect(flush).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(15000);expect(flush).toHaveBeenCalledTimes(2);
      stop();vi.advanceTimersByTime(15000);expect(flush).toHaveBeenCalledTimes(2);
    } finally {vi.useRealTimers();}
  });
});
