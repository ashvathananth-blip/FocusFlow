// All inputs in this suite are DETERMINISTIC SYNTHETIC data.
// Passing tests establish implementation behavior, never human gaze accuracy.
import { describe, expect, it, vi } from 'vitest';
import type { Features, Landmark, Sample } from '@/types/vision';
import { extractFeatures, normalizeEye } from '@/lib/vision/features';
import { coordinateError, fitRegression, median, normalizeInput, predict } from '@/lib/vision/regression';
import { CALIBRATION, CalibrationCollector, finishCalibration, rejectOutliers, TARGETS, validateGroups } from '@/lib/vision/calibration';
import { trackingSignal } from '@/lib/focus/tracking-input';
import { createSession, updateSession } from '@/lib/focus/timer-engine';
import { GazeEstimator } from '@/lib/vision/gaze-estimator';
import { GazeClassifier } from '@/lib/vision/classifier';
import { TRACKING_QUALITY, trackingQuality } from '@/lib/vision/tracking-quality';
import { summarize } from '@/lib/vision/diagnostics';
import { createVideoFrameScheduler, createVisibilityRecoveryController, inferenceDelayMs, shouldPublishUiUpdate } from '@/lib/vision/scheduling';
import { releaseCamera } from '@/lib/vision/camera';
import { createInferenceRetryPolicy, inspectInferenceFrame } from '@/lib/vision/inference-lifecycle';

const p = (x: number, y: number): Landmark => ({ x, y, z: 0 });
function syntheticLandmarks(): Landmark[] {
  const points = Array.from({ length: 478 }, () => p(0.5, 0.5));
  points[362] = p(.6,.4); points[263] = p(.8,.4); points[473] = p(.7,.4); points[386] = p(.7,.38); points[374] = p(.7,.42);
  points[33] = p(.2,.4); points[133] = p(.4,.4); points[468] = p(.3,.4); points[159] = p(.3,.38); points[145] = p(.3,.42);
  return points;
}
const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function syntheticSamples(): Sample[] {
  return TARGETS.flatMap((target, group) => Array.from({ length: 24 }, (_, i) => {
    const jitter = (i % 7 - 3) * .0002;
    return { group, target, features: [target.x + jitter, target.y - jitter, target.x * .8 + jitter, target.y * .8 - jitter, 0, 0] };
  }));
}

describe('synthetic feature normalization and invalid landmarks', () => {
  it('projects iris onto eye axes independent of translation and uniform scale', () => {
    const eye = [p(.5,.2), p(.4,.2), p(.6,.2), p(.5,.18), p(.5,.22)] as const;
    const first = normalizeEye(...eye, 1)!;
    const transformed = eye.map(v => p(v.x * 2 + .1, v.y * 2 - .2));
    const second = normalizeEye(transformed[0], transformed[1], transformed[2], transformed[3], transformed[4], 1)!;
    expect(first.normalized.x).toBeCloseTo(.5);
    expect(first.normalized.y).toBeCloseTo(0);
    expect(second.normalized.x).toBeCloseTo(first.normalized.x);
    expect(second.aperture).toBeCloseTo(first.aperture);
  });
  it('corrects aspect and projects vertical displacement using eye width', () => {
    const eye = normalizeEye(p(.5,.22), p(.4,.2), p(.6,.2), p(.5,.18), p(.5,.24), 2)!;
    expect(eye.normalized.y).toBeCloseTo(.05);
    expect(eye.aperture).toBeCloseTo(.15);
  });
  it('handles missing iris, closed eyes, degenerate corners, NaN and bad matrix', () => {
    expect(extractFeatures([], identity, 1)).toBeNull();
    expect(extractFeatures(syntheticLandmarks(), undefined, 1)).toBeNull();
    const bad = syntheticLandmarks(); bad[473].x = NaN;
    expect(extractFeatures(bad, identity, 1)).toBeNull();
    const closed = syntheticLandmarks(); closed[386] = closed[374];
    expect(extractFeatures(closed, identity, 1)).toBeNull();
    expect(normalizeEye(p(0,0),p(0,0),p(0,0),p(0,0),p(0,0),1)).toBeNull();
  });
  it('extracts two eyes and independent head pose features', () => {
    const features = extractFeatures(syntheticLandmarks(), identity, 1)!;
    expect(features.vector).toHaveLength(6); expect(features.left.normalized.x).toBeCloseTo(.5);
    expect(features.yaw).toBeCloseTo(0); expect(features.pitch).toBeCloseTo(0);
    const angle = .2, rotation = [...identity];
    rotation[0] = Math.cos(angle); rotation[2] = -Math.sin(angle); rotation[8] = Math.sin(angle); rotation[10] = Math.cos(angle);
    expect(extractFeatures(syntheticLandmarks(), rotation, 1)!.yaw).toBeCloseTo(angle);
  });
});

describe('synthetic ridge regression', () => {
  it('fits an intercept and predicts deterministic held-out coordinates', () => {
    const model = fitRegression(syntheticSamples());
    expect(coordinateError(predict(model, [.3,.65,.24,.52,0,0]), { x:.3,y:.65 })).toBeLessThan(.005);
    expect(model.mean[0]).toBeCloseTo(.5, 3);
    expect(model.scale.every(s => s > 0)).toBe(true);
  });
  it('standardizes with supplied training statistics and rejects invalid input', () => {
    expect(normalizeInput([6,10], [4,6], [2,4])).toEqual([1,1]);
    expect(() => normalizeInput([NaN], [0], [1])).toThrow();
    expect(() => normalizeInput([1], [0], [0])).toThrow();
    expect(() => fitRegression([])).toThrow();
    expect(() => fitRegression(syntheticSamples(), 0)).toThrow();
    expect(() => predict(fitRegression(syntheticSamples()), [1])).toThrow();
  });
  it('handles collinear/constant inputs; increasing ridge shrinks coefficients', () => {
    const samples = syntheticSamples(), weak = fitRegression(samples, .1), strong = fitRegression(samples, 1000);
    const norm = (weights: number[][]) => weights.slice(1).flat().reduce((s,v) => s + v*v, 0);
    expect(norm(strong.weights)).toBeLessThan(norm(weak.weights));
    expect(strong.weights[0][0]).toBeCloseTo(.5, 3);
    expect(predict(weak, [.5,.5,.4,.4,0,0]).x).toBeCloseTo(.5, 3);
  });
});

describe('synthetic calibration, outliers, and target-group validation', () => {
  it('rejects extreme and missing observations without inventing samples', () => {
    const samples = syntheticSamples().filter(s => s.group === 0);
    const extreme = { ...samples[0], features: [999,999,999,999,999,999] };
    expect(rejectOutliers([...samples, extreme, { ...extreme, features: [NaN] }])).toHaveLength(24);
  });
  it('holds out each target group and matches independent fold calculations', () => {
    const samples = syntheticSamples(), validation = validateGroups(samples);
    const errors = TARGETS.flatMap((_, group) => {
      const train = samples.filter(s => s.group !== group), test = samples.filter(s => s.group === group);
      const model = fitRegression(train);
      // At the corner fold, training statistics must differ from all-sample statistics.
      if (group === 0) expect(model.mean[0]).not.toBeCloseTo(fitRegression(samples).mean[0], 3);
      return test.map(s => coordinateError(predict(model, s.features), s.target));
    });
    expect(validation.groupErrors).toHaveLength(9);
    expect(validation.error).toBeCloseTo(median(errors), 12);
    expect(validation.error).toBeLessThan(.01);
    expect(finishCalibration(samples).count).toBe(216);
    expect(finishCalibration(samples).status).toBe('ready');
  });
  it('marks an uninformative synthetic mapping poor and rejects missing target groups', () => {
    const uninformative = syntheticSamples().map(s => ({ ...s, features: [0,0,0,0,0,0] }));
    expect(finishCalibration(uninformative).status).toBe('poor');
    expect(() => finishCalibration(syntheticSamples().filter(s => s.group !== 0))).toThrow();
  });
  it('waits to settle and requires multiple valid samples per target', () => {
    const collector = new CalibrationCollector(0), vector = [.5,0,.5,0,0,0];
    expect(collector.add(vector, CALIBRATION.settleMs - 1)).toBe('settling'); expect(collector.samples).toHaveLength(0);
    for (let i = 0; i < 23; i++) expect(collector.add(vector, 800+i)).toBe('collecting');
    expect(collector.add(vector, 824)).toBe('next'); expect(collector.group).toBe(1);
    expect(collector.add(vector, 825)).toBe('settling');
    expect(() => collector.add(null, 15000)).toThrow();
  });
  it('pauses through a transient 600 ms inference gap and resumes only on fresh valid features', () => {
    const collector = new CalibrationCollector(0), vector = [.5,0,.5,0,0,0];
    for (let i = 0; i < 6; i++) collector.add(vector, 800 + i);
    collector.pause(1300);
    expect(collector.paused).toBe(true);
    expect(collector.resume(1900)).toBe('resumed');
    expect(collector.samples.filter(s => s.group === 0)).toHaveLength(6);
    expect(collector.add(null, 1901)).toBe('collecting');
    collector.add([NaN, .5, .5, .5, 0, 0], 1902);
    expect(collector.samples.filter(s => s.group === 0)).toHaveLength(6);
    collector.add(vector, 1903);
    expect(collector.samples.filter(s => s.group === 0)).toHaveLength(7);
  });
  it('restarts only the current point after prolonged tracking loss and recovers after a fresh sample', () => {
    const collector = new CalibrationCollector(0), vector = [.5,0,.5,0,0,0];
    for (let i = 0; i < 8; i++) collector.add(vector, 800 + i);
    collector.pause(1400);
    expect(collector.restartAfterProlongedLoss(1400 + CALIBRATION.prolongedLossMs + 1)).toBe(true);
    expect(collector.group).toBe(0);
    expect(collector.samples).toHaveLength(0);
    expect(collector.paused).toBe(true);
    expect(collector.resume(5000)).toBe('resumed');
    expect(collector.add(vector, 5000)).toBe('settling');
    expect(collector.add(vector, 5799)).toBe('settling');
    expect(collector.add(vector, 5800)).toBe('collecting');
    expect(collector.samples).toHaveLength(1);
  });
  it('retries the current calibration point without discarding completed points', () => {
    const collector = new CalibrationCollector(0), vector = [.5,0,.5,0,0,0];
    for (let i = 0; i < 24; i++) collector.add(vector, 800 + i);
    expect(collector.group).toBe(1);
    collector.add(vector, 1600);
    collector.retryCurrent(1700);
    expect(collector.group).toBe(1);
    expect(collector.samples.filter(s => s.group === 0)).toHaveLength(24);
    expect(collector.samples.filter(s => s.group === 1)).toHaveLength(0);
  });
  it('calculates normalized Euclidean error and even medians', () => {
    expect(coordinateError({x:0,y:0},{x:.3,y:.4})).toBeCloseTo(.5);
    expect(median([4,1,3,2])).toBe(2.5);
  });
});

describe('inference scheduling and UI publication', () => {
  it('requires a live, dimensioned camera frame newer than the foreground baseline', () => {
    const base = { readyState: 2, videoWidth: 640, videoHeight: 480, currentTime: 12.1, streamActive: true, trackStates: [{ readyState: 'live', muted: false }] };
    expect(inspectInferenceFrame(base, 2, 12.0, 12.1)).toEqual({ ready: true, reason: 'fresh video frame' });
    expect(inspectInferenceFrame({ ...base, currentTime: 12 }, 2, 12, 12)).toMatchObject({ ready: false, reason: expect.stringContaining('newer') });
    expect(inspectInferenceFrame({ ...base, trackStates: [{ readyState: 'ended' }] }, 2, null)).toMatchObject({ ready: false, reason: expect.stringContaining('live') });
    expect(inspectInferenceFrame({ ...base, videoWidth: 0 }, 2, null)).toMatchObject({ ready: false, reason: expect.stringContaining('dimensions') });
    expect(inspectInferenceFrame({ ...base, readyState: 1 }, 2, null)).toMatchObject({ ready: false, reason: expect.stringContaining('current frame') });
  });
  it('bounds consecutive inference exception retries and resets after a successful fresh inference', () => {
    const retry = createInferenceRetryPolicy(3);
    expect(retry.failed()).toEqual({ failures: 1, retry: true, delayMs: 150 });
    expect(retry.failed()).toEqual({ failures: 2, retry: true, delayMs: 300 });
    expect(retry.failed()).toEqual({ failures: 3, retry: false, delayMs: 600 });
    retry.succeeded();
    expect(retry.failures).toBe(0);
    expect(retry.failed().retry).toBe(true);
  });
  it('caps inference cadence at 15 fps and publishes sampled UI state at 5 fps', () => {
    expect(inferenceDelayMs(null, 0)).toBeCloseTo(1000 / 15);
    expect(inferenceDelayMs(1000, 1060)).toBeCloseTo(1000 / 15 - 60);
    expect(inferenceDelayMs(1000, 1070)).toBe(0);
    expect(shouldPublishUiUpdate(null, 1000)).toBe(true);
    expect(shouldPublishUiUpdate(1000, 1100)).toBe(false);
    expect(shouldPublishUiUpdate(1000, 1200)).toBe(true);
    expect(shouldPublishUiUpdate(1000, 1050, true)).toBe(true);
  });
  it('uses video-frame callbacks without scheduling duplicate or concurrent frames', () => {
    vi.useFakeTimers();
    const callbacks: { deliver?: (now: number, metadata: { mediaTime: number }) => void } = {};
    const request = vi.fn((callback: (now: number, metadata: { mediaTime: number }) => void) => { callbacks.deliver = callback; return 9; });
    const cancel = vi.fn();
    const onFrame = vi.fn();
    const scheduler = createVideoFrameScheduler({ requestVideoFrameCallback: request, cancelVideoFrameCallback: cancel }, onFrame);
    expect(scheduler.schedule(10)).toBe(true);
    expect(scheduler.schedule(10)).toBe(false);
    vi.advanceTimersByTime(10);
    expect(request).toHaveBeenCalledOnce();
    callbacks.deliver?.(12, { mediaTime: 4.2 });
    expect(onFrame).toHaveBeenCalledWith(4.2);
    scheduler.schedule(0); vi.advanceTimersByTime(0);
    scheduler.cancel();
    expect(cancel).toHaveBeenCalledWith(9);
    vi.useRealTimers();
  });
  it('suspends once when hidden and resumes once after repeated foreground events', async () => {
    let visible=true;const suspend=vi.fn(),resume=vi.fn(async()=>true);
    const controller=createVisibilityRecoveryController(()=>visible,suspend,resume);
    visible=false;controller.update();controller.update();expect(suspend).toHaveBeenCalledOnce();expect(controller.suspended).toBe(true);
    visible=true;controller.update();controller.update();
    await vi.waitFor(()=>expect(controller.suspended).toBe(false));
    expect(resume).toHaveBeenCalledOnce();expect(controller.suspended).toBe(false);controller.dispose();
  });
  it('keeps tracking unavailable after failed camera recovery and retries on a later foreground event', async () => {
    let visible=true,ready=false;const suspend=vi.fn(),resume=vi.fn(async()=>ready);
    const controller=createVisibilityRecoveryController(()=>visible,suspend,resume);
    visible=false;controller.update();visible=true;controller.update();await vi.waitFor(()=>expect(resume).toHaveBeenCalledOnce());
    expect(controller.suspended).toBe(true);expect(resume).toHaveBeenCalledOnce();
    ready=true;controller.update();await vi.waitFor(()=>expect(controller.suspended).toBe(false));
    expect(controller.suspended).toBe(false);expect(resume).toHaveBeenCalledTimes(2);controller.dispose();
  });
  it('requests one recovery while retaining one scheduler loop', async () => {
    let visible = true;
    const suspend = vi.fn(), resume = vi.fn(async () => true);
    const controller = createVisibilityRecoveryController(() => visible, suspend, resume);
    controller.requestRecovery(); controller.requestRecovery();
    await vi.waitFor(() => expect(controller.suspended).toBe(false));
    expect(suspend).toHaveBeenCalledOnce(); expect(resume).toHaveBeenCalledOnce();
    controller.dispose();
  });
  it('cancels fallback frame timers and stops every camera track', () => {
    vi.useFakeTimers();
    const onFrame = vi.fn(), scheduler = createVideoFrameScheduler({}, onFrame);
    scheduler.schedule(50); scheduler.cancel(); vi.advanceTimersByTime(50);
    expect(onFrame).not.toHaveBeenCalled();
    const tracks = [vi.fn(), vi.fn()];
    releaseCamera({ getTracks: () => tracks.map(stop => ({ stop })) } as unknown as MediaStream);
    expect(tracks.every(stop => stop.mock.calls.length === 1)).toBe(true);
    vi.useRealTimers();
  });
});

describe('synthetic classification, tracking quality and measurement accounting', () => {
  it('needs five points, rejects a single spike by median, and resets on uncertainty', () => {
    const c = new GazeClassifier();
    for (let i=0;i<4;i++) expect(c.update({x:.5,y:.5},'high').classification).toBe('unknown');
    expect(c.update({x:.5,y:.5},'high').classification).toBe('on-screen');
    expect(c.update({x:9,y:9},'high').coordinate).toEqual({x:.5,y:.5});
    expect(c.update(null,'unavailable').classification).toBe('unknown');
    expect(c.update({x:.5,y:.5},'medium').classification).toBe('unknown');
  });
  it('retains on-screen within hysteresis and requires re-entry past the base margin', () => {
    const c = new GazeClassifier();
    for(let i=0;i<5;i++) c.update({x:.5,y:.5},'high');
    for(let i=0;i<5;i++) c.update({x:1.05,y:.5},'high');
    expect(c.update({x:1.05,y:.5},'high').classification).toBe('on-screen');
    for(let i=0;i<5;i++) c.update({x:1.14,y:.5},'high');
    expect(c.update({x:1.14,y:.5},'high').classification).toBe('off-screen');
    for(let i=0;i<5;i++) c.update({x:1.09,y:.5},'high');
    expect(c.update({x:1.09,y:.5},'high').classification).toBe('off-screen');
    for(let i=0;i<5;i++) c.update({x:1.07,y:.5},'high');
    expect(c.update({x:1.07,y:.5},'high').classification).toBe('on-screen');
  });
  it('derives quality from availability, fit, distribution distance and stability', () => {
    const calibration = finishCalibration(syntheticSamples());
    const features = { ...extractFeatures(syntheticLandmarks(),identity,1)!, vector:[.5,.5,.4,.4,0,0] } satisfies Features;
    expect(trackingQuality(null,calibration,[]).quality).toBe('unavailable');
    expect(trackingQuality(features,null,[]).quality).toBe('low');
    expect(trackingQuality(features,calibration,[{x:.5,y:.5}]).quality).toBe('high');
    expect(trackingQuality({...features,vector:[9,9,9,9,0,0]},calibration,[]).quality).toBe('low');
    expect(trackingQuality(features,calibration,[{x:0,y:0},{x:1,y:1}]).quality).toBe('medium');
    expect(trackingQuality(features,calibration,[{x:0,y:0},{x:2,y:2}]).quality).toBe('low');
  });
  it('includes inference-free edges in gaps and wall-duration in measured FPS', () => {
    const s = summarize([{at:100,latencyMs:10,completionGapMs:null,frameIntervalMs:null,decodedFrameDelta:null,scheduledIntervalMs:null},{at:200,latencyMs:20,completionGapMs:100,frameIntervalMs:66,decodedFrameDelta:2,scheduledIntervalMs:70},{at:900,latencyMs:30,completionGapMs:700,frameIntervalMs:650,decodedFrameDelta:12,scheduledIntervalMs:800}],0,2000);
    expect(s.fps).toBe(1.5); expect(s.medianIntervalMs).toBe(400);
    expect(s.maximumGapMs).toBe(1100); expect(s.gapsOver500Ms).toBe(2); expect(s.medianLatencyMs).toBe(20);
    expect(s.medianCompletionGapMs).toBe(400); expect(s.maximumCompletionGapMs).toBe(700);
    expect(s.medianFrameIntervalMs).toBe(358); expect(s.maximumFrameIntervalMs).toBe(650); expect(s.medianScheduledIntervalMs).toBe(435);
    expect(s.medianDecodedFrameDelta).toBe(7);
    expect(summarize([],0,30000).maximumGapMs).toBe(30000);
    expect(summarize([],0,30000).fps).toBe(0);
  });
});


describe('synthetic Stage 1 blocker regressions (not human accuracy)', () => {
  const featuresAt = (x: number, y: number): Features => ({
    ...extractFeatures(syntheticLandmarks(), identity, 1)!,
    vector: [x, y, x * .8, y * .8, 0, 0],
  });
  it('exposes changing unclamped predictions and reaches all four off-screen regions', () => {
    const calibration = finishCalibration(syntheticSamples());
    for (const [x, y] of [[-.20,.5],[1.20,.5],[.5,-.20],[.5,1.20]]) {
      const estimator = new GazeEstimator();
      for (let i = 0; i < 5; i++) estimator.update(featuresAt(.5,.5), calibration);
      let result = estimator.update(featuresAt(x,y), calibration);
      // Movement can invalidate the initial window; a held gaze must recover.
      for (let i = 0; i < 12; i++) result = estimator.update(featuresAt(x,y), calibration);
      expect(result.raw!.x).toBeCloseTo(x, 2);
      expect(result.raw!.y).toBeCloseTo(y, 2);
      expect(result.coordinate).toEqual(result.raw);
      expect(result.classification).toBe('off-screen');
      expect(result.reason).toContain('outside active bounds');
      expect(result.bounds).toEqual({ min: -.08, max: 1.08 });
    }
  });
  it('shows raw predictions even when quality rejects classification, never retains on-screen', () => {
    const calibration = finishCalibration(syntheticSamples()), estimator = new GazeEstimator();
    for (let i = 0; i < 5; i++) estimator.update(featuresAt(.5,.5), calibration);
    const rejected = estimator.update(featuresAt(9,9), calibration);
    expect(rejected.raw!.x).toBeGreaterThan(1);
    expect(rejected.classification).toBe('unknown');
    expect(rejected.coordinate).toBeNull();
    expect(rejected.reason).toContain('Quality gate');
    expect(rejected.reasons).toContain('Feature RMS > 3 (outside calibration distribution)');
    expect(rejected.samples).toBe(0);
    const missing = estimator.update(null, calibration);
    expect(missing.raw).toBeNull(); expect(missing.quality).toBe('unavailable');
    expect(missing.classification).toBe('unknown');
  });
  it('reports the exact hysteresis bounds used and smoothing wait reason', () => {
    const c = new GazeClassifier();
    expect(c.update({x:.5,y:.5},'high').reason).toContain('Collecting');
    for (let i = 0; i < 5; i++) c.update({x:.5,y:.5},'high');
    const held = c.update({x:1.05,y:.5},'high');
    expect(held.previous).toBe('on-screen');
    expect(held.bounds.min).toBeCloseTo(-.13);
    expect(held.bounds.max).toBeCloseTo(1.13);
    expect(held.reason).toContain('retention hysteresis');
    c.reset();
    expect(c.update({x:.5,y:.5},'high').samples).toBe(1);
  });
  it('exposes fitted spatial separation and center collapse without accepting a poor model', () => {
    const good = finishCalibration(syntheticSamples());
    expect(good.diagnostics.trainingError).toBeLessThan(.01);
    expect(good.diagnostics.predictionRange.x[0]).toBeCloseTo(.1, 2);
    expect(good.diagnostics.predictionRange.x[1]).toBeCloseTo(.9, 2);
    expect(good.diagnostics.targetPredictions[0].x).toBeCloseTo(.1, 2);
    const collapsed = finishCalibration(syntheticSamples().map(s => ({...s, features:[0,0,0,0,0,0]})));
    expect(collapsed.status).toBe('poor');
    expect(collapsed.diagnostics.targetPredictions.every(p => Math.abs(p.x-.5)<1e-9 && Math.abs(p.y-.5)<1e-9)).toBe(true);
    expect(collapsed.diagnostics.trainingError).toBeGreaterThan(.2);
    expect(new GazeEstimator().update(featuresAt(.5,.5), collapsed).classification).toBe('unknown');
  });
});


describe('attention classification boundary (synthetic, not human accuracy)', () => {
  it('maps reliable off-screen gaze to low focus while preserving unknown for unreliable extrapolation', () => {
    const calibration=finishCalibration(syntheticSamples());
    const base=extractFeatures(syntheticLandmarks(),identity,1)!;
    const reliable=new GazeEstimator(), unreliable=new GazeEstimator();
    let away=reliable.update({...base,vector:[1.12,.5,.896,.4,0,0]},calibration);
    let lost=unreliable.update({...base,vector:[9,.5,7.2,.4,0,0]},calibration);
    for(let i=0;i<15;i++) {
      away=reliable.update({...base,vector:[1.12,.5,.896,.4,0,0]},calibration);
      lost=unreliable.update({...base,vector:[9,.5,7.2,.4,0,0]},calibration);
    }
    expect(away.classification).toBe('off-screen');
    expect(trackingSignal({...away,faceDetected:true})).toBe('off-screen');
    expect(lost.raw!.x).toBeGreaterThan(1.07);
    expect(lost.quality).toBe('low'); expect(lost.classification).toBe('unknown');
    expect(lost.reasons).toContain('Feature RMS > 3 (outside calibration distribution)');
    expect(trackingSignal({...lost,faceDetected:true})).toBe('invalid');
  });
});


describe('screen-wide reading tolerance (deterministic synthetic features, not webcam accuracy)', () => {
  const featuresAt = (x: number,y: number,yaw=0,pitch=0): Features => ({
    ...extractFeatures(syntheticLandmarks(),identity,1)!, vector:[x,y,x*.8,y*.8,yaw,pitch], yaw,pitch,
  });
  function held(x:number,y:number) {
    const estimator=new GazeEstimator(), calibration=finishCalibration(syntheticSamples());
    let result=estimator.update(featuresAt(x,y),calibration);
    for(let i=0;i<8;i++) result=estimator.update(featuresAt(x,y),calibration);
    return result;
  }
  it.each([[.5,.5,'high'],[.02,.5,'medium'],[.98,.5,'medium'],[.5,.02,'medium'],[.5,.98,'medium'],[.02,.02,'medium'],[.98,.98,'medium'],[-.05,.5,'medium'],[1.05,.5,'medium']])('accepts screen reading at x=%s y=%s as %s', (x,y,level) => {
    const result=held(Number(x),Number(y));
    expect(result.classification).toBe('on-screen'); expect(result.focusLevel).toBe(level);
    expect(trackingSignal({...result,faceDetected:true})).toBe('on-screen');
  });
  it('does not invalidate normal head movement after nearly constant calibration pose', () => {
    const samples=syntheticSamples().map(s=>({...s,features:[...s.features.slice(0,4),.45,-.25]}));
    const calibration=finishCalibration(samples), saved=structuredClone(calibration.model);
    expect(calibration.model.scale[4]).toBeCloseTo(.000001,8);
    const natural=featuresAt(.5,.5,.57,-.17);
    const quality=trackingQuality(natural,calibration,[{x:.5,y:.5}]);
    expect(quality.quality).not.toBe('low'); expect(quality.distance).toBeLessThan(1);
    expect(calibration.model).toEqual(saved); // quality floors never mutate the regression fit
    const estimator=new GazeEstimator();
    let result=estimator.update(natural,calibration);
    for(let i=0;i<8;i++) result=estimator.update(natural,calibration);
    expect(result.classification).toBe('on-screen');
    expect(['high','medium']).toContain(result.focusLevel);
  });
  it('allows full-screen reading motion as medium rather than clearing the smoothing window', () => {
    const calibration=finishCalibration(syntheticSamples());
    const q=trackingQuality(featuresAt(.98,.98),calibration,[{x:.02,y:.02},{x:.98,y:.98}]);
    expect(q.quality).toBe('medium');
    expect(q.stability).toBeGreaterThan(.25); expect(q.stability).toBeLessThan(TRACKING_QUALITY.maxSpread);
    const smallerAperture=trackingQuality({...featuresAt(.5,.98),minAperture:.09},calibration,[]);
    expect(smallerAperture.quality).toBe('medium');
    expect(trackingQuality({...featuresAt(.5,.5),minAperture:.07},calibration,[]).quality).toBe('low');
  });
  it('credits high and medium continuously across every reading edge without resetting the streak', () => {
    const calibration=finishCalibration(syntheticSamples()), estimator=new GazeEstimator();
    let session=updateSession(createSession(),{type:'start',at:0}), at=0;
    const levels=new Set<string>();
    function frame(x:number,y:number,yaw=0,pitch=0) {
      const result=estimator.update(featuresAt(x,y,yaw,pitch),calibration);
      session=updateSession(session,{type:'sample',at,signal:trackingSignal({...result,faceDetected:true})});
      at+=100; levels.add(result.focusLevel); return result;
    }
    for(let i=0;i<15;i++) frame(.5,.5);
    const initialCredit=session.creditedMs, initialStreak=session.currentStreakMs;
    for(const [x,y] of [[.02,.5],[.98,.5],[.5,.02],[.5,.98],[.5,.5]]) {
      for(let i=0;i<8;i++) {
        const result=frame(x,y,.08,-.06);
        expect(['high','medium']).toContain(result.focusLevel);
        expect(session.focus.state).toBe('focused');
        expect(session.focus.nonFocusedSince).toBeNull();
      }
    }
    expect(levels.has('high')).toBe(true); expect(levels.has('medium')).toBe(true);
    expect(session.creditedMs-initialCredit).toBe(4000);
    expect(session.currentStreakMs-initialStreak).toBe(4000);
    expect(session.focus.distractionCount).toBe(0);
  });
  it('uses five-sample median and hysteresis without delaying a clear gaze-away beyond three frames', () => {
    const estimator=new GazeEstimator(), calibration=finishCalibration(syntheticSamples());
    for(let i=0;i<8;i++) estimator.update(featuresAt(.5,.5),calibration);
    let away=estimator.update(featuresAt(1.3,.5),calibration);
    expect(away.classification).toBe('on-screen');
    away=estimator.update(featuresAt(1.3,.5),calibration);
    away=estimator.update(featuresAt(1.3,.5),calibration);
    expect(away.classification).toBe('off-screen'); expect(away.focusLevel).toBe('low');
    const c=new GazeClassifier();
    for(let i=0;i<5;i++) c.update({x:.5,y:.5},'high');
    for(const x of [1.11,1.14,1.10,1.12,1.11,1.14]) expect(c.update({x,y:.5},'high').classification).toBe('on-screen');
    for(let i=0;i<5;i++) c.update({x:1.16,y:.5},'high');
    expect(c.update({x:1.12,y:.5},'high').classification).toBe('off-screen');
  });
  it('does not turn a large head-pose deviation or missing eyes into focused evidence', () => {
    const calibration=finishCalibration(syntheticSamples());
    const estimator=new GazeEstimator();
    const turned=estimator.update(featuresAt(.5,.5,.9,0),calibration);
    expect(turned.quality).toBe('low'); expect(turned.focusLevel).toBe('unknown');
    expect(estimator.update(null,calibration).focusLevel).toBe('unknown');
    // Absolute geometry guards remain yaw=1 rad, pitch=0.9 rad.
    const rotation=[...identity], yaw=1.1;
    rotation[0]=Math.cos(yaw); rotation[2]=-Math.sin(yaw); rotation[8]=Math.sin(yaw); rotation[10]=Math.cos(yaw);
    expect(extractFeatures(syntheticLandmarks(),rotation,1)).toBeNull();
  });
  it.each([[1.3,0,'low'],[.5,.9,'unknown']])('still counts one sustained gaze-away at x=%s yaw=%s as %s without focus credit', (x,yaw,attention) => {
    const estimator=new GazeEstimator(), calibration=finishCalibration(syntheticSamples());
    let session=updateSession(createSession(),{type:'start',at:0});
    for(let at=0;at<2000;at+=100) {
      const result=estimator.update(featuresAt(.5,.5),calibration);
      session=updateSession(session,{type:'sample',at,signal:trackingSignal({...result,faceDetected:true})});
    }
    for(let at=2000;at<=2600;at+=100) {
      const result=estimator.update(featuresAt(Number(x),.5,Number(yaw)),calibration);
      session=updateSession(session,{type:'sample',at,signal:trackingSignal({...result,faceDetected:true})});
    }
    const credit=session.creditedMs;
    for(let at=2700;at<=18000;at+=100) {
      const result=estimator.update(featuresAt(Number(x),.5,Number(yaw)),calibration);
      session=updateSession(session,{type:'sample',at,signal:trackingSignal({...result,faceDetected:true})});
    }
    expect(session.focus.attention).toBe(attention); expect(session.focus.distractionCount).toBe(1);
    expect(session.creditedMs).toBe(credit); expect(session.currentStreakMs).toBe(0);
  });
});


describe('high/medium reading-band hysteresis', () => {
  it('retains high near the inner boundary and requires re-entry before upgrading medium', () => {
    const c=new GazeClassifier();
    for(let i=0;i<5;i++) c.update({x:.5,y:.5},'high');
    for(let i=0;i<5;i++) c.update({x:.08,y:.5},'high');
    expect(c.update({x:.08,y:.5},'high').focusLevel).toBe('high');
    for(let i=0;i<5;i++) c.update({x:.04,y:.5},'high');
    expect(c.update({x:.04,y:.5},'high').focusLevel).toBe('medium');
    for(let i=0;i<5;i++) c.update({x:.08,y:.5},'high');
    expect(c.update({x:.08,y:.5},'high').focusLevel).toBe('medium');
    for(let i=0;i<5;i++) c.update({x:.12,y:.5},'high');
    expect(c.update({x:.12,y:.5},'high').focusLevel).toBe('high');
  });
});
