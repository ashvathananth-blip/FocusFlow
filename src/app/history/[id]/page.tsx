import { Suspense } from 'react';
import { HistoryClient } from '@/components/analytics/history-client';
import { HistoryLoading } from '@/components/analytics/ui';
export const metadata={title:'Session review | Focus Flow',description:'Recorded attention, uncertainty and non-focused episodes.'};
async function Detail({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  return <HistoryClient sessionId={id}/>;
}
export default function SessionHistoryPage({params}:{params:Promise<{id:string}>}) {
  return <Suspense fallback={<HistoryLoading/>}><Detail params={params}/></Suspense>;
}
