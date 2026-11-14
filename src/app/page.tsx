import Link from "next/link";
export default function Home() {
  return <main className="mx-auto max-w-3xl space-y-4 p-8"><h1 className="text-2xl font-semibold">FocusFlow · Gaze spike</h1><p>Local webcam calibration, gaze diagnostics, and the Stage 2 study timer.</p><Link href="/study" className="block underline">Open study timer</Link><Link href="/diagnostics" className="underline">Open gaze diagnostics</Link><Link href="/history" className="block underline">History</Link></main>;
}
