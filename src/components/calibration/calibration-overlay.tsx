import { TARGETS } from "@/lib/vision/calibration";
import { Button } from "@/components/ui/button";
export function CalibrationOverlay({ progress, cancel }: { progress: { group: number; phase: string; count: number }; cancel: () => void }) {
  const target = TARGETS[progress.group];
  return <div className="fixed inset-0 z-50 bg-[#121212]" role="dialog" aria-modal="true" aria-label="Nine-point gaze calibration">
    <div className="absolute left-1/2 top-[22%] -translate-x-1/2 text-center">
      <p>Look at the dot. Keep your head comfortably still.</p>
      <p aria-live="polite">Target {progress.group + 1}/9 · {progress.phase} · {progress.count}/24 samples</p>
      <Button variant="outline" onClick={cancel}>Cancel calibration</Button>
    </div>
    <div aria-label={`Target ${progress.group + 1}`} className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-[#121212] bg-indigo-300 ring-2 ring-indigo-300" style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }} />
  </div>;
}
