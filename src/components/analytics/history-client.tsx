'use client';
import { useHistory } from '@/hooks/useHistory';
import { HistoryFrame } from './history-view';
import { HistoryLoading } from './ui';
export function HistoryClient({sessionId}:{sessionId?:string}) {
  const history=useHistory();
  if(history.loading) return <HistoryLoading/>;
  return <HistoryFrame sessions={history.sessions} sessionId={sessionId} error={history.error} invalid={history.invalid} refresh={history.refresh}/>;
}
