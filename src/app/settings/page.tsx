import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/analytics/ui';
export default function SettingsPage() {
  return <main className="page-container"><PageHeader eyebrow="Preferences" title="Settings" description="Camera calibration and local privacy controls."/><EmptyState title="Settings controls are awaiting the protected API review" description="Calibration currently lives in Focus Session. History clearing is not exposed by the existing storage API. No tracking thresholds or storage behavior have been changed."/></main>;
}
