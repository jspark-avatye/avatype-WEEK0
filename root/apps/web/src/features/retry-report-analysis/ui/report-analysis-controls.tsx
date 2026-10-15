import { useEffect, useRef, useState } from 'react';
import type { ReportProgress } from '@/entities/report';
import { trpcClient } from '@/shared/api';
import { Button } from '@/shared/ui/button';
export function ReportAnalysisControls({ state, onChanged }: { state: ReportProgress; onChanged(): Promise<unknown> }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const started = useRef<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function execute(retry: boolean) {
    if (busy) return;
    setBusy(true); setError('');
    try { if (retry) await trpcClient.report.retry.mutate({ evaluationId: state.evaluationId }); else await trpcClient.report.analyze.mutate({ evaluationId: state.evaluationId }); }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '분석을 시작하지 못했습니다.'); }
    finally { if (mounted.current) { await onChanged().catch(() => undefined); setBusy(false); } }
  }
  useEffect(() => {
    if (state.canStart && started.current !== state.evaluationId) { started.current = state.evaluationId; void execute(false); }
  });
  return <div className="report-actions">
    {error && <p role="alert">{error}</p>}
    {busy && <p role="status">분석을 요청하고 있습니다…</p>}
    {state.canStart && <Button disabled={busy} onClick={() => { void execute(false); }}>보고서 분석 시작</Button>}
    {state.retryAvailable && <Button disabled={busy} onClick={() => { void execute(true); }}>저장된 답변으로 분석 재시도</Button>}
    {state.retryAfterAt && !state.retryAvailable && <p>재시도 가능 시간: {new Date(state.retryAfterAt).toLocaleTimeString()}</p>}
    {state.status === 'ANALYSIS_FAILED' && !state.retryAvailable && !state.retryAfterAt && <p>이 분석은 더 이상 재시도할 수 없습니다.</p>}
  </div>;
}
