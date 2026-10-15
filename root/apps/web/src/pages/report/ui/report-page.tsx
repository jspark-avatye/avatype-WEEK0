import { useEffect, useRef } from 'react';
import { criterionLabel, levelLabel, reportError, stageLabel, useReport, verdictLabel } from '@/entities/report';
import { useUserSession } from '@/entities/user';
import { ReportAnalysisControls } from '@/features/retry-report-analysis';
import { SiteHeader } from '@/widgets/site-header';
import { Button } from '@/shared/ui/button';
import { navigate } from '@/shared/lib/navigate';
import { EvidenceAudio } from './evidence-audio';
import { AssessmentLayout } from '@/shared/ui/assessment-layout';
export function ReportPage({ evaluationId }: { evaluationId: string }) {
  const query = useReport(evaluationId); const state = query.isError ? undefined : query.data;
  const { refreshProfile } = useUserSession(); const refreshed = useRef<string | null>(null);
  useEffect(() => {
    if (state?.report && refreshed.current !== state.report.reportId) { refreshed.current = state.report.reportId; void refreshProfile().catch(() => undefined); }
  }, [state?.report, refreshProfile]);
  useEffect(() => {
    if (!state?.retryAfterAt || state.retryAvailable) return;
    const timer = setTimeout(() => { void query.refetch(); }, Math.max(0, Date.parse(state.retryAfterAt) - Date.now()) + 100);
    return () => clearTimeout(timer);
  }, [state?.retryAfterAt, state?.retryAvailable, query.refetch]);
  const report = state?.report;
  return <AssessmentLayout><SiteHeader /><section className="report-card">
    <nav className="report-actions"><Button onClick={() => navigate('/')}>홈으로</Button><Button onClick={() => navigate('/evaluations')}>평가 기록</Button></nav>
    <p className="report-eyebrow">ENGLISH CONVERSATION REPORT</p><h1>영어 회화 평가 보고서</h1>
    {query.isPending && <p role="status">보고서를 확인하고 있습니다…</p>}
    {query.isError && <div role="alert"><p>{query.error.message}</p><Button onClick={() => { void query.refetch(); }}>다시 확인</Button><Button onClick={() => navigate(`/evaluations/${evaluationId}`)}>회화 화면으로</Button></div>}
    {state && !report && <>
      <p role="status">{stageLabel[state.stage]}</p>
      {state.status === 'ANALYSIS_FAILED' && <p role="alert">{reportError(state.errorCode)}</p>}
      <ReportAnalysisControls state={state} onChanged={query.refetch} />
    </>}
    {report && <>
      <div className={`report-verdict report-verdict--${report.verdict.toLowerCase()}`}>
        <strong>{report.finalLevelCode ? levelLabel(report.finalLevelCode) : '수준 판단을 위한 데이터 부족'}</strong><span>{verdictLabel[report.verdict]}</span>
      </div>
      {report.verdict === 'PROVISIONAL' && <p>일부 항목이나 답변의 평가 근거가 부족하여 잠정 결과로 제공합니다.</p>}
      <p className="report-summary">{report.summary}</p>
      {report.criteria.map((criterion) => <section key={criterion.criterionCode} className="report-criterion" aria-label={criterionLabel[criterion.criterionCode]}>
        <h2>{criterionLabel[criterion.criterionCode]} <span>{criterion.score === null ? '평가 데이터 부족' : `${criterion.score} / 100`}</span></h2>
        {criterion.insufficientReason && <p className="report-insufficient">{criterion.insufficientReason}</p>}
        <p>{criterion.rationale}</p>
        {criterion.evidence.map((e, index) => <details key={e.answerId} className="report-evidence">
          <summary>근거 답변 {index + 1} · {Math.ceil(e.durationMs / 1000)}초</summary>
          <p lang="en"><strong>질문</strong> {e.question}</p><p lang="en"><strong>답변</strong> {e.transcript}</p><p>{e.explanation}</p>
          <EvidenceAudio evaluationId={evaluationId} answerId={e.answerId} />
        </details>)}
        {criterion.feedback.length > 0 && <div className="report-feedback"><h3>개선 피드백</h3>{criterion.feedback.map((f, index) => <div key={index}>
          <strong>{f.feedbackKind === 'EXPRESSION_CORRECTION' ? '표현 수정' : '개선 제안'}</strong><p lang={f.feedbackKind === 'EXPRESSION_CORRECTION' ? 'en' : 'ko'}>{f.suggestion}</p><p>{f.explanation}</p>
        </div>)}</div>}
      </section>)}
    </>}
  </section></AssessmentLayout>;
}
