// Deterministic synthetic policy inputs. These tests do not establish human gaze accuracy.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import Study from '@/app/study/page';
import { advanceFocus, completeFocus, createFocusMachine, creditsFocus, interruptFocus, nonFocusedDurationMs, observeFocus, pauseFocus, resumeFocus, type TrackingSignal } from '@/lib/focus/state-machine';
import { createSession, DEFAULT_GOAL_MS, elapsedMs, GOAL_MINUTES, remainingMs, updateSession, type Session } from '@/lib/focus/timer-engine';
import { clockDiscontinuity, trackingSignal } from '@/lib/focus/tracking-input';
import { focusNotifications } from '@/lib/focus/notifications';
function sample(s: Session, at: number, signal: TrackingSignal = 'on-screen') { return updateSession(s,{type:'sample',at,signal}); }
function started(goal?: number) { return updateSession(createSession(goal),{type:'start',at:0}); }
function feed(s: Session, until: number, signal: TrackingSignal = 'on-screen', step=100) {
  for(let at=(s.lastSampleAt ?? s.now)+step;at<=until;at+=step) s=sample(s,at,signal);
  if(s.now<until) s=sample(s,until,signal);
  return s;
}
function running() { return feed(sample(started(),0),300); }

describe('combined non-focused episode requirements', () => {
  it.each(['off-screen','invalid'] as const)('10 continuous seconds of %s count exactly one distraction', signal => {
    let s=sample(running(),400,signal); const before=s.focus, credit=s.creditedMs;
    s=feed(s,10300,signal); expect(s.focus.distractionCount).toBe(0);
    s=sample(s,10400,signal); expect(s.focus.distractionCount).toBe(1);
    expect(s.focus.nonFocusedCounted).toBe(true); expect(nonFocusedDurationMs(s.focus)).toBe(10000);
    expect(s.focus.attention).toBe(signal==='off-screen'?'low':'unknown');
    expect(s.creditedMs).toBe(credit); expect(s.currentStreakMs).toBe(0);
    expect(focusNotifications(before,s.focus)).toHaveLength(1);
  });
  it.each([['off-screen','invalid'],['invalid','off-screen']] as const)('5 seconds %s + 5 seconds %s share the same threshold', (first,second) => {
    let s=sample(running(),400,first); const credit=s.creditedMs;
    s=feed(s,5300,first); s=sample(s,5400,second);
    expect(s.focus.nonFocusedSince).toBe(400);
    s=feed(s,10300,second); expect(s.focus.distractionCount).toBe(0);
    s=sample(s,10400,second); expect(s.focus.distractionCount).toBe(1);
    expect(s.creditedMs).toBe(credit);
  });
  it('returning to reliable focus before 10 seconds records no distraction and resets the episode', () => {
    let s=sample(running(),400,'off-screen'); s=feed(s,9000,'off-screen');
    s=sample(s,9100); s=feed(s,9400);
    expect(s.focus.state).toBe('focused'); expect(s.focus.distractionCount).toBe(0);
    expect(s.focus.nonFocusedSince).toBeNull(); expect(s.focus.nonFocusedCounted).toBe(false);
  });
  it.each(['off-screen','invalid'] as const)('30 seconds of %s still count one distraction', signal => {
    let s=sample(running(),400,signal); const before=s.focus;
    s=feed(s,30400,signal); expect(s.focus.distractionCount).toBe(1);
    expect(focusNotifications(before,s.focus)).toHaveLength(1);
    const counted=s.focus; s=feed(s,40400,signal); expect(focusNotifications(counted,s.focus)).toEqual([]);
  });
  it('focus recovery then another 10-second non-focused episode records the second distraction', () => {
    let s=sample(running(),400,'off-screen'); s=feed(s,10400,'off-screen');
    s=sample(s,10500); s=feed(s,10800);
    expect(s.focus.nonFocusedCounted).toBe(false);
    s=sample(s,10900,'invalid'); s=feed(s,20900,'invalid');
    expect(s.focus.distractionCount).toBe(2);
  });
  it('alternating low and unknown frames never resets the timer or duplicates the event', () => {
    let s=sample(running(),400,'off-screen'); const credit=s.creditedMs;
    for(let at=500;at<=30400;at+=100) s=sample(s,at,at%200===0?'off-screen':'invalid');
    expect(s.focus.nonFocusedSince).toBe(400); expect(s.focus.distractionCount).toBe(1);
    expect(s.creditedMs).toBe(credit);
  });
  it('brief on-screen fluctuations under 300 ms do not reset a non-focused episode', () => {
    let s=sample(running(),400,'invalid');
    for(let at=500;at<=15400;at+=100) s=sample(s,at,at%1000===0?'on-screen':'invalid');
    expect(s.focus.nonFocusedSince).toBe(400); expect(s.focus.distractionCount).toBe(1);
  });
  it.each([67,200,333])('uses actual elapsed time with %i ms sampling intervals', step => {
    let s=sample(running(),400,'off-screen'); s=feed(s,10399,'off-screen',step);
    expect(s.focus.distractionCount).toBe(0);
    s=sample(s,10400,'invalid'); expect(s.focus.distractionCount).toBe(1);
  });
});

describe('focus credit and streak accounting', () => {
  it('credits only stable reliable focus, excluding low, unknown and return stabilization', () => {
    let s=feed(running(),1000); expect(s.creditedMs).toBe(700);
    s=sample(s,1100,'off-screen'); const credit=s.creditedMs;
    s=feed(s,6000,'off-screen'); s=sample(s,6100,'invalid'); s=feed(s,10000,'invalid');
    expect(s.creditedMs).toBe(credit);
    s=sample(s,10100); s=feed(s,10400); expect(s.creditedMs).toBe(credit);
    s=sample(s,10500); expect(s.creditedMs).toBe(credit+100);
  });
  it('holds the streak without increasing it before the threshold, then resets exactly at 10 seconds', () => {
    let s=feed(running(),1000); s=sample(s,1100,'off-screen');
    expect(s.currentStreakMs).toBe(800); expect(s.longestStreakMs).toBe(800);
    s=feed(s,11099,'invalid',100); expect(s.currentStreakMs).toBe(800);
    s=sample(s,11100,'invalid'); expect(s.currentStreakMs).toBe(0);
    expect(s.longestStreakMs).toBe(800);
    s=sample(s,11200); s=feed(s,11500); s=sample(s,11600);
    expect(s.currentStreakMs).toBe(100); expect(s.longestStreakMs).toBe(800);
  });
  it('completes at the exact credited goal and freezes all metrics', () => {
    const s=feed(sample(started(250),0),600);
    expect(s.lifecycle).toBe('completed'); expect(s.focus.state).toBe('completed');
    expect(s.creditedMs).toBe(250); expect(remainingMs(s)).toBe(0); expect(elapsedMs(s)).toBe(550);
    expect(s.longestStreakMs).toBe(250);
    expect(sample(s,20000,'invalid')).toBe(s);
    expect(updateSession(s,{type:'pause',at:20000})).toBe(s);
  });
  it('cannot complete by accumulating non-focused time', () => {
    let s=sample(running(),400,'invalid'); s=feed(s,120000,'off-screen');
    expect(s.creditedMs).toBe(100); expect(s.lifecycle).toBe('running');
    expect(s.focus.distractionCount).toBe(1);
  });
  it('UI ticks never add focused credit or double-count the next frame', () => {
    let s=updateSession(running(),{type:'tick',at:350}); expect(s.creditedMs).toBe(0);
    s=sample(s,400); expect(s.creditedMs).toBe(100);
    s=updateSession(s,{type:'tick',at:420}); s=sample(s,450); expect(s.creditedMs).toBe(150);
  });
});

describe('lifecycle, unavailable inference, and precedence', () => {
  it('provides default, preset and custom goals with a separate idle lifecycle', () => {
    expect(createSession().goalMs).toBe(DEFAULT_GOAL_MS); expect(GOAL_MINUTES).toEqual([15,25,30,45,60]);
    expect(createSession(1234).goalMs).toBe(1234); expect(createSession().lifecycle).toBe('idle');
    expect(elapsedMs(createSession())).toBe(0);
    for(const goal of [0,-1,NaN,Infinity]) expect(()=>createSession(goal)).toThrow();
  });
  it('manual pause suppresses events and automatic resumption', () => {
    let s=updateSession(running(),{type:'pause',at:400});
    s=sample(s,500,'invalid'); s=feed(s,20000,'invalid');
    expect(s.focus.state).toBe('manual_pause'); expect(s.focus.distractionCount).toBe(0);
    expect(s.creditedMs).toBe(0); expect(elapsedMs(s)).toBe(20000);
    s=sample(s,20100); s=feed(s,20500); expect(s.focus.state).toBe('manual_pause');
    s=updateSession(s,{type:'resume',at:20600}); s=sample(s,20700); s=feed(s,21000);
    expect(s.focus.state).toBe('focused'); expect(s.creditedMs).toBe(0);
  });
  it('manual pause at the automatic deadline takes precedence', () => {
    let s=sample(running(),400,'invalid'); s=feed(s,10300,'invalid');
    s=updateSession(s,{type:'pause',at:10400});
    expect(s.focus.state).toBe('manual_pause'); expect(s.focus.distractionCount).toBe(0);
  });
  it('no-face tracking stays unknown internally and retains its face-absence diagnostic override', () => {
    let s=sample(running(),400,'no-face'); const credit=s.creditedMs;
    s=feed(s,2800,'no-face'); expect(s.focus.state).toBe('unknown');
    s=sample(s,2900,'no-face'); expect(s.focus.state).toBe('face_absent');
    expect(s.focus.attention).toBe('unknown');
    s=feed(s,10400,'no-face'); expect(s.focus.distractionCount).toBe(1);
    expect(s.focus.state).toBe('face_absent'); expect(s.creditedMs).toBe(credit);
  });
  it('does not credit a suspended gap, even without a watchdog callback', () => {
    let s=running(); const credit=s.creditedMs; s=sample(s,60000);
    expect(s.creditedMs).toBe(credit); expect(s.focus.distractionCount).toBe(1);
    expect(s.focus.state).toBe('unknown'); expect(elapsedMs(s)).toBe(60000);
    s=feed(s,60300); s=sample(s,60400); expect(s.creditedMs).toBe(credit+100);
  });
  it('watchdog expiration preserves the combined episode and counts once without minting credit', () => {
    let s=sample(running(),400,'off-screen'); const credit=s.creditedMs;
    s=updateSession(s,{type:'tick',at:900}); expect(s.focus.state).toBe('unknown');
    s=updateSession(s,{type:'tick',at:10400}); expect(s.focus.distractionCount).toBe(1);
    s=updateSession(s,{type:'tick',at:30400}); expect(s.focus.distractionCount).toBe(1);
    expect(s.creditedMs).toBe(credit); expect(s.focus.nonFocusedSince).toBe(400);
  });
  it('camera/calibration/visibility interrupts preserve the shared episode without crediting gaps', () => {
    let s=sample(running(),400,'invalid'); s=feed(s,5000,'invalid');
    s=updateSession(s,{type:'interrupt',at:5100,reason:'Camera stopped'});
    s=updateSession(s,{type:'tick',at:10400}); expect(s.focus.distractionCount).toBe(1);
    expect(s.focus.nonFocusedSince).toBe(400);
    expect(s.diagnostics.some(e=>e.message.includes('Camera stopped'))).toBe(true);
  });
  it('background frame loss remains tracking uncertainty and does not reset the live session', () => {
    let s=feed(running(),1000);const lifecycle=s.lifecycle,credit=s.creditedMs;
    const unavailable=trackingSignal({classification:'unknown',quality:'unavailable',faceDetected:null});
    expect(unavailable).toBe('invalid');
    s=updateSession(s,{type:'interrupt',at:1100,reason:'FocusFlow tab hidden'});
    expect(s.lifecycle).toBe(lifecycle);expect(s.focus.signal).toBe('invalid');expect(s.focus.attention).toBe('unknown');
    expect(s.focus.state).not.toBe('low');expect(s.creditedMs).toBe(credit);
    s=sample(s,1200,'on-screen');expect(s.lifecycle).toBe('running');expect(s.creditedMs).toBe(credit);
  });
  it('ignores duplicate, backward and nonfinite event timestamps', () => {
    const s=feed(running(),1000);
    for(const at of [1000,999,NaN,Infinity]) expect(sample(s,at)).toBe(s);
    expect(updateSession(s,{type:'start',at:1000}).creditedMs).toBe(700);
  });
  it('ending freezes results without claiming goal completion', () => {
    let s=feed(running(),1000); s=updateSession(s,{type:'end',at:1200});
    expect(s.lifecycle).toBe('ended'); expect(s.creditedMs).toBe(700); expect(elapsedMs(s)).toBe(1200);
    expect(sample(s,20000,'invalid')).toBe(s);
  });
});

describe('pure state machine, adapter, notifications and diagnostics', () => {
  it('retains exactly three attention classifications while preserving control precedence', () => {
    let m=observeFocus(createFocusMachine(0),'on-screen');
    expect(advanceFocus(m,299).machine.attention).toBe('unknown');
    m=advanceFocus(m,300).machine; expect(m.attention).toBe('focused'); expect(creditsFocus(m)).toBe(true);
    m=observeFocus(m,'off-screen'); expect(m.attention).toBe('low'); expect(creditsFocus(m)).toBe(false);
    m=observeFocus(m,'invalid'); expect(m.attention).toBe('unknown');
    expect(pauseFocus(completeFocus(m)).state).toBe('completed');
    expect(resumeFocus(pauseFocus(m)).state).toBe('unknown');
  });
  it('pure transitions are immutable and reject backward time', () => {
    const m=createFocusMachine(100), before=structuredClone(m);
    advanceFocus(m,200); expect(m).toEqual(before);
    expect(()=>advanceFocus(m,99)).toThrow(); expect(()=>interruptFocus(m,99)).toThrow();
  });
  it('maps only reliable off-screen predictions to low; uncertain geometry stays unknown', () => {
    expect(trackingSignal({classification:'off-screen',quality:'medium',faceDetected:true})).toBe('off-screen');
    expect(trackingSignal({classification:'off-screen',quality:'low',faceDetected:true})).toBe('invalid');
    expect(trackingSignal({classification:'on-screen',quality:'high',faceDetected:true})).toBe('on-screen');
    expect(trackingSignal({classification:'unknown',quality:'unavailable',faceDetected:false})).toBe('no-face');
  });
  it('vetoes clock discontinuities without using wall time for credited focus', () => {
    const previous={monotonic:300,wall:10000};
    expect(clockDiscontinuity(null,previous)).toBe(false);
    expect(clockDiscontinuity(previous,{monotonic:400,wall:10100})).toBe(false);
    expect(clockDiscontinuity(previous,{monotonic:400,wall:70100})).toBe(true);
    expect(clockDiscontinuity(previous,{monotonic:400,wall:9000})).toBe(true);
  });
  it('keeps classification transitions and combined timer duration in bounded diagnostics', () => {
    let s=sample(running(),400,'off-screen'); s=sample(s,5400,'invalid');
    expect(s.diagnostics.at(-1)?.state).toBe('unknown');
    expect(s.diagnostics.at(-1)?.nonFocusedMs).toBe(5000);
    expect(s.focus.nonFocusedSince).toBe(400);
  });
  it('renders one Distraction Count metric without separate loss counters', () => {
    const html=renderToString(createElement(Study));
    expect(html).toContain('25:00'); expect(html).toContain('Distraction Count');
    expect(html).not.toContain('Tracking-loss penalty events');
    expect(html).not.toContain('Current unknown episode penalty');
    expect(html).toContain('Stage 2 transition and episode diagnostics');
  });
});
