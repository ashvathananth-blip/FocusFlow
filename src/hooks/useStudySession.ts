'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SessionWriter } from '@/lib/storage/session-writer';
import { calibrationMetadata } from '@/lib/analytics/recorder';
import { useGazeTracking, type Readout } from './useGazeTracking';
import { focusNotifications } from '@/lib/focus/notifications';
import { createSession, updateSession, type TimerEvent } from '@/lib/focus/timer-engine';
import { clockDiscontinuity, trackingSignal, type ClockSnapshot } from '@/lib/focus/tracking-input';

export function useStudySession() {
  const engine = useRef(createSession());
  const historyWriter = useRef(new SessionWriter());
  const [session, setSession] = useState(createSession);
  const [notificationStatus, setNotificationStatus] = useState('not requested');
  const alive = useRef(false);
  const clock = useRef<ClockSnapshot | null>(null);
  const dispatch = useCallback((event: TimerEvent) => {
    const before = engine.current;
    const currentClock = { monotonic: event.at, wall: Date.now() };
    if (clockDiscontinuity(clock.current, currentClock)) {
      engine.current = updateSession(engine.current, { type: 'interrupt', at: event.at, reason: 'Wall/monotonic clock discontinuity' });
    }
    clock.current = currentClock;
    // Record the continuity veto too, so analytics cannot fill a clock gap.
    if(engine.current!==before) historyWriter.current.receive(before,{type:'interrupt',at:event.at,reason:'Clock discontinuity'},engine.current);
    const intermediate=engine.current;
    const next = updateSession(intermediate, event);
    historyWriter.current.receive(intermediate,event,next);
    engine.current = next;
    if (alive.current) setSession(next);
    const lastLog = before.diagnostics[before.diagnostics.length - 1];
    const logStart = lastLog ? next.diagnostics.indexOf(lastLog) + 1 : 0;
    for (const entry of next.diagnostics.slice(logStart)) console.debug('[FocusFlow Stage 2]', entry);
    // Consume deltas once; permission changes never replay a past episode.
    if (alive.current && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      for (const notification of focusNotifications(before.focus, next.focus)) {
        try { new Notification(notification.title, { body: notification.body, tag: `focusflow-${next.startedAt}-${notification.id}` }); }
        catch { setNotificationStatus('Browser could not display the notification'); }
      }
    }
  }, []);
  const onSample = useCallback((readout: Readout) => {
    if (readout.at !== null) dispatch({ type: 'sample', at: readout.at, signal: trackingSignal(readout), setup: readout.calibrating, reason: `${readout.reason}; ${readout.reasons.join('; ')}` });
  }, [dispatch]);
  const onInterrupt = useCallback((at: number) => dispatch({ type: 'interrupt', at, reason: 'Camera/calibration/viewport continuity lost' }), [dispatch]);
  const tracking = useGazeTracking({ onSample, onInterrupt });
  useEffect(() => {
    alive.current = true;
    const writer=historyWriter.current;
    const tick = () => dispatch({ type: 'tick', at: performance.now() });
    const interrupt = (event: Event) => {
      dispatch({ type: 'interrupt', at: performance.now(), reason: `Browser lifecycle: ${event.type}` });
      writer.flush(true);
    };
    const interval = setInterval(tick, 100);
    const stopCheckpoints=writer.startCheckpointClock();
    // Clear continuity at lifecycle boundaries, even if no watchdog ran while hidden.
    document.addEventListener('visibilitychange', interrupt);
    document.addEventListener('freeze', interrupt);
    window.addEventListener('pagehide', interrupt);
    window.addEventListener('pageshow', interrupt);
    return () => {
      alive.current = false; clearInterval(interval); stopCheckpoints();
      writer.finish('interrupted');
      document.removeEventListener('visibilitychange', interrupt);
      document.removeEventListener('freeze', interrupt);
      window.removeEventListener('pagehide', interrupt);
      window.removeEventListener('pageshow', interrupt);
    };
  }, [dispatch]);
  const startSession = (goalMs: number) => {
    if (engine.current.lifecycle === 'running') return;
    const at = performance.now();
    engine.current = createSession(goalMs, at);
    dispatch({ type: 'start', at });
    historyWriter.current.begin(engine.current,calibrationMetadata(tracking.calibration));
  };
  const control = (type: 'pause' | 'resume' | 'end') => dispatch({ type, at: performance.now() });
  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') { setNotificationStatus('unsupported'); return; }
    try { setNotificationStatus(await Notification.requestPermission()); }
    catch { setNotificationStatus('Permission request failed'); }
  };
  return { tracking, session, startSession, control, enableNotifications, notificationStatus };
}
