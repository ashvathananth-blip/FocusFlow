import { TARGETS } from "@/lib/vision/calibration";
import { Button } from "@/components/ui/button";
export function CalibrationOverlay({ progress, cancel }: { progress: { group: number; phase: string; count: number }; cancel: () => void }) {
  const target = TARGETS[progress.group];
  return <div className="fixed inset-0 z-50" style={{ background: 'radial-gradient(900px 600px at 50% 30%, #10161A 0%, #07080A 62%)' }} role="dialog" aria-modal="true" aria-label="Nine-point gaze calibration">
    <div className="calibration-copy absolute left-1/2 top-[14%] w-[min(560px,92vw)] -translate-x-1/2 text-center">
      <p className="page-eyebrow">Calibration</p>
      <p>Look at the highlighted dot. Keep your head comfortably still and stay at your normal sitting distance.</p>
      <p aria-live="polite">{progress.group + 1} of 9 · {progress.phase} · {progress.count}/24 samples</p>
      <div className="calibration-progress" aria-hidden="true">{TARGETS.map((_, index) => <span key={index} className={`calibration-dot${index < progress.group ? ' is-done' : ''}${index === progress.group ? ' is-current' : ''}`} />)}</div>
      <p className="calibration-tips">Face a light source, avoid a bright window behind you, and keep your full face inside the camera frame. These tips do not change the targets or the sample rules.</p>
      <Button variant="outline" onClick={cancel}>Cancel calibration</Button>
    </div>
    <div aria-label={`Target ${progress.group + 1}`} className="calibration-target" style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%`, background: '#4EE3C4', borderColor: '#07080A', boxShadow: '0 0 0 1px rgba(78,227,196,.4), 0 0 24px rgba(78,227,196,.45)' }} />
  </div>;
}
