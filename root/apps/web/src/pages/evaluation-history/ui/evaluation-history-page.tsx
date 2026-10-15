import { useState } from 'react';
import { levelLabel, statusLabel, topicLabel, useEvaluationHistory, verdictLabel } from '@/entities/report';
import { SiteHeader } from '@/widgets/site-header';
import { Button } from '@/shared/ui/button';
import { navigate } from '@/shared/lib/navigate';
import { AssessmentLayout } from '@/shared/ui/assessment-layout';
export function EvaluationHistoryPage() {
  const [page, setPage] = useState(1); const query = useEvaluationHistory(page);
  const data = query.isError ? undefined : query.data;
  return <AssessmentLayout><SiteHeader /><section className="report-card">
    <Button onClick={() => navigate('/')}>홈으로</Button><h1>내 평가 기록</h1>
    {query.isPending && <p role="status">평가 기록을 확인하고 있습니다…</p>}
    {query.isError && <div role="alert"><p>{query.error.message}</p><Button onClick={() => { void query.refetch(); }}>다시 확인</Button></div>}
    {data && data.items.length === 0 && <p>아직 평가 기록이 없습니다.</p>}
    {data?.items.map((item) => {
      const report = ['ANALYSIS_PENDING', 'ANALYZING', 'COMPLETED', 'ANALYSIS_FAILED'].includes(item.status);
      return <article key={item.evaluationId} className="history-item">
        <h2>{topicLabel[item.topicCode] ?? item.topicCode}</h2><p>{new Date(item.createdAt).toLocaleString()} · {statusLabel[item.status]}</p>
        {item.verdict && <p>{item.verdict === 'UNASSESSABLE' ? '수준 판단 불가' : levelLabel(item.finalLevelCode)} · {verdictLabel[item.verdict]}</p>}
        <Button onClick={() => navigate(`/evaluations/${item.evaluationId}${report ? '/report' : ''}`)}>{report ? '보고서 확인' : item.status === 'PAUSED' ? '이어서 하기' : '평가 확인'}</Button>
      </article>;
    })}
    {data && <nav className="report-actions" aria-label="평가 기록 페이지">
      <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>이전</Button><span>{page}페이지 · 총 {data.total}개</span>
      <Button disabled={page * data.pageSize >= data.total} onClick={() => setPage((p) => p + 1)}>다음</Button>
    </nav>}
  </section></AssessmentLayout>;
}
