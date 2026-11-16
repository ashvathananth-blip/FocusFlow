'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SessionWriter } from '@/lib/storage/session-writer';
import { calibrationMetadata } from '@/lib/analytics/recorder';
import { useGazeTracking, type Readout } from './useGazeTracking';
import { focusNotifications } from '@/lib/focus/notifications';
import { createSession, updateSession, type TimerEvent } from '@/lib/focus/timer-engine';
import { clockDiscontinuity, trackingSignal, type ClockSnapshot } from '@/lib/focus/tracking-input';
import { lifecycleMessage, makeShieldMessage, isAllowedShieldOrigin, SHIELD_PROTOCOL, validShieldAck } from '@/lib/extension/bridge';
import { shouldPublishUiUpdate } from '@/lib/vision/scheduling';

export function useStudySession() {
  const engine = useRef(createSession());
  const historyWriter = useRef(new SessionWriter());
  const [session, setSession] = useState(createSession);
  const [notificationStatus, setNotificationStatus] = useState('not requested');
  const [shieldStatus, setShieldStatus] = useState<{connected:boolean;blockingActive:boolean;syncLost:boolean}>({connected:false,blockingActive:false,syncLost:false});
  const alive = useRef(false);
  const clock = useRef<ClockSnapshot | null>(null);
  const lastSessionPublishAt = useRef<number|null>(null);
  const shieldSession = useRef<string|null>(null), shieldSequence = useRef(0);
  const sendShield = useCallback((type:'start'|'pause'|'resume'|'end'|'complete'|'heartbeat'|'ping') => {
    if(typeof window==='undefined'||!isAllowedShieldOrigin(window.location.origin))return;
    const id=shieldSession.current ?? 'connection-probe';
    const message=makeShieldMessage(type,id,shieldSequence.current++);
    window.postMessage(message,window.location.origin);
  },[]);
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
    const stateBoundary=before.lifecycle!==next.lifecycle||before.focus.state!==next.focus.state||before.focus.manual!==next.focus.manual||before.focus.distractionCount!==next.focus.distractionCount||before.focus.nonFocusedCounted!==next.focus.nonFocusedCounted;
    const lifecycleEvent=event.type!=='sample'&&event.type!=='tick';
    if (alive.current&&(lifecycleEvent||stateBoundary||shouldPublishUiUpdate(lastSessionPublishAt.current,event.at))) { setSession(next); lastSessionPublishAt.current=event.at; }
    const shieldLifecycle=lifecycleMessage({lifecycle:before.lifecycle,manual:before.focus.manual},{lifecycle:next.lifecycle,manual:next.focus.manual});
    if(shieldLifecycle)sendShield(shieldLifecycle);
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
  }, [sendShield]);
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
    const checkpointWhenHidden = () => { if(document.visibilityState==='hidden')writer.flush(true); };
    const interval = setInterval(tick, 100);
    // Retry briefly for late content-script injection, then keep checking while
    // the page is open so a worker restart or extension reload can reconnect.
    let attempts=0;
    const ping=()=>{sendShield('ping');attempts++;};
    ping();
    const retry=setInterval(()=>{if(attempts<8)ping();},750);
    const ack=(event:MessageEvent)=>{
      if(event.source!==window||(event.origin!==window.location.origin||!isAllowedShieldOrigin(event.origin)))return;
      const data=event.data;
      if(data?.protocol!==SHIELD_PROTOCOL||data.version!==1||data.type!=='ack'||!validShieldAck(data))return;
      if(data.sequence>=shieldSequence.current)return;
      if(data.acknowledged&&data.state)setShieldStatus({connected:true,blockingActive:data.state.blockingActive,syncLost:data.state.syncLost});
      else if(data.acknowledged&&data.requestType==='ping')setShieldStatus({connected:true,blockingActive:false,syncLost:false});
    };
    window.addEventListener('message',ack);
    const heartbeat=setInterval(()=>{if(engine.current.lifecycle==='running'&&shieldSession.current)sendShield('heartbeat');},15000);
    const stopCheckpoints=writer.startCheckpointClock();
    // Clear continuity at lifecycle boundaries, even if no watchdog ran while hidden.
    // The gaze hook owns visibility interruption so the timer receives one
    // continuity event, while this hook still checkpoints promptly on hide.
    document.addEventListener('visibilitychange', checkpointWhenHidden);
    document.addEventListener('freeze', interrupt);
    window.addEventListener('pagehide', interrupt);
    window.addEventListener('pageshow', interrupt);
    return () => {
      alive.current = false; clearInterval(interval); clearInterval(retry); clearInterval(heartbeat); window.removeEventListener('message',ack); stopCheckpoints();
      writer.finish('interrupted');
      document.removeEventListener('visibilitychange', checkpointWhenHidden);
      document.removeEventListener('freeze', interrupt);
      window.removeEventListener('pagehide', interrupt);
      window.removeEventListener('pageshow', interrupt);
    };
  }, [dispatch,sendShield]);
  const startSession = (goalMs: number) => {
    if (engine.current.lifecycle === 'running') return;
    const at = performance.now();
    shieldSession.current=crypto.randomUUID();shieldSequence.current=0;
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
  return { tracking, session, startSession, control, enableNotifications, notificationStatus, shieldStatus };
}
