import { TARGETS } from "@/lib/vision/calibration";
import { Button } from "@/components/ui/button";
export function CalibrationOverlay({ progress, cancel, retry = () => {}, notice }: { progress: { group: number; phase: string; count: number }; cancel: () => void; retry?: () => void; notice?: string }) {
  const target = TARGETS[progress.group];
  return <div className="fixed inset-0 z-50" style={{ background: 'radial-gradient(900px 600px at 50% 30%, #111720 0%, #080B10 62%)' }} role="dialog" aria-modal="true" aria-label="Nine-point gaze calibration">
    <div className="calibration-copy absolute left-1/2 top-[14%] w-[min(560px,92vw)] -translate-x-1/2 text-center">
      <p className="page-eyebrow">Calibration</p>
      <p>Look at the highlighted dot. Keep your head comfortably still and stay at your normal sitting distance.</p>
      <p aria-live="polite">{progress.group + 1} of 9 · {progress.phase} · {progress.count}/24 samples</p>
      {notice && <p role="alert">{notice}</p>}
      <div className="calibration-progress" aria-hidden="true">{TARGETS.map((_, index) => <span key={index} className={`calibration-dot${index < progress.group ? ' is-done' : ''}${index === progress.group ? ' is-current' : ''}`} />)}</div>
      <p className="calibration-tips">Face a light source, avoid a bright window behind you, and keep your full face inside the camera frame. These tips do not change the targets or the sample rules.</p>
      <div className="inline-actions" role="group" aria-label="Calibration controls"><Button variant="outline" onClick={retry}>Retry this point</Button><Button variant="outline" onClick={cancel}>Cancel calibration</Button></div>
    </div>
    <div aria-label={`Target ${progress.group + 1}`} className="calibration-target" style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%`, background: '#52E0C4', borderColor: '#080B10', boxShadow: '0 0 0 1px rgba(82,224,196,.4), 0 0 24px rgba(82,224,196,.45)' }} />
  </div>;
}
