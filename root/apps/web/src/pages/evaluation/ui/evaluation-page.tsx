import { useCallback, useEffect, useRef, useState } from 'react';
import { processingMessage, useEvaluationProgress } from '@/entities/evaluation';
import { VoiceAnswer } from '@/features/submit-voice-answer';
import { EvaluationControls } from '@/features/control-evaluation';
import { trpcClient } from '@/shared/api';
import { navigate } from '@/shared/lib/navigate';
import { Button } from '@/shared/ui/button';
import { SiteHeader } from '@/widgets/site-header';
import { QuestionPlayer } from './question-player';
import './evaluation-page.css';
const phases: Record<string, string> = { TRANSCRIBING: '답변을 텍스트로 변환하고 있습니다…', GENERATING_QUESTION: 'AI가 다음 질문을 준비하고 있습니다…', SYNTHESIZING: 'AI 질문 음성을 준비하고 있습니다…' };
export function EvaluationPage({ evaluationId }: { evaluationId: string }) {
  const evaluation = useEvaluationProgress(evaluationId);
  const [error, setError] = useState(''); const [pending, setPending] = useState(false);
  const [controlling, setControlling] = useState(false); const [draftVersion, setDraftVersion] = useState(0);
  const [heard, setHeard] = useState<Set<string>>(new Set()); const [notice, setNotice] = useState('');
  const requested = useRef(false); const busy = useRef(false);
  const data = evaluation.isError ? undefined : evaluation.data; const audioId = data?.question?.audioId;
  const markHeard = useCallback(() => { if (audioId) setHeard((current) => new Set([...current, audioId])); }, [audioId]);
  async function request(retry: boolean) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError('');
    try { if (retry) await trpcClient.evaluation.retry.mutate({ evaluationId }); else await trpcClient.evaluation.start.mutate({ evaluationId }); }
    catch (error) { setError(error instanceof Error ? error.message : 'AI 작업을 시작하지 못했습니다.'); }
    finally { await evaluation.refetch(); busy.current = false; setPending(false); }
  }
  useEffect(() => {
    if (data && ['ANALYSIS_PENDING', 'ANALYZING', 'COMPLETED', 'ANALYSIS_FAILED'].includes(data.status)) navigate(`/evaluations/${evaluationId}/report`);
  }, [data?.status, evaluationId]);
  useEffect(() => { if (data?.status === 'READY' && data.phase === 'IDLE' && !requested.current) { requested.current = true; void request(false); } });
  useEffect(() => {
    if (!data?.expiresAt || !['IN_PROGRESS', 'PAUSED'].includes(data.status)) return;
    const timer = setTimeout(() => { void evaluation.refetch(); }, Math.max(0, Date.parse(data.expiresAt) - Date.now()) + 100);
    return () => clearTimeout(timer);
  }, [data?.expiresAt, data?.status, evaluation.refetch]);
  useEffect(() => {
    if (!data?.retryAfterAt || data.retryAvailable) return;
    const timer = setTimeout(() => { void evaluation.refetch(); }, Math.max(0, Date.parse(data.retryAfterAt) - Date.now()) + 100);
    return () => clearTimeout(timer);
  }, [data?.retryAfterAt, data?.retryAvailable, evaluation.refetch]);
  const reRecord = data?.errorCode === 'UNRECOGNIZABLE_AUDIO' && data.actions.canSubmit;
  const canAnswer = !controlling && data?.status === 'IN_PROGRESS' && (reRecord || (data?.actions.canRecord && audioId && heard.has(audioId)));
  const questionId = data?.question?.questionId ?? (reRecord ? data.latestAnswer?.questionId : undefined);
  return <main className="question-page"><SiteHeader /><section className="question-card">
    <Button onClick={() => navigate('/')}>홈으로</Button>
    <p className="question-eyebrow">{data?.question ? `QUESTION ${String(data.question.questionNo).padStart(2, '0')}` : 'ENGLISH CONVERSATION'}</p>
    <h1>{data?.phase === 'FINISHED' ? '영어 회화가 종료되었습니다' : '영어 회화 평가'}</h1>
    {evaluation.isPending && <p role="status">평가 상태를 확인하고 있습니다…</p>}
    {evaluation.isError && <div role="alert"><p className="evaluation-error">{evaluation.error.message}</p><Button onClick={() => { void evaluation.refetch(); }}>상태 다시 확인</Button></div>}
    {notice && <p role="status">{notice}</p>}
    {data?.expiresAt && data.status !== 'ENDING' && data.phase !== 'FINISHED' && <p>평가 가능 시간: {new Date(data.expiresAt).toLocaleTimeString()}까지</p>}
    {(pending || (data && phases[data.phase])) && <p role="status">{data ? phases[data.phase] ?? '작업을 시작하고 있습니다…' : '작업을 시작하고 있습니다…'}</p>}
    {error && <div role="alert"><p className="evaluation-error">{error}</p><Button disabled={pending} onClick={() => { void request(false); }}>상태 다시 확인하고 시작</Button></div>}
    {data?.phase === 'FAILED' && data.status !== 'ENDING' && <div role="alert"><p className="evaluation-error">{processingMessage(data.errorCode)}</p>
      {data.retryAvailable && <Button disabled={pending} onClick={() => { void request(true); }}>{/^AI_(CONFIGURATION|KEY|AUTH|ACCESS|MODEL|QUOTA|INVALID_REQUEST)/.test(data.errorCode ?? '') ? '설정 수정 후 재시도' : '저장된 입력으로 재시도'}</Button>}
      {data.retryAfterAt && !data.retryAvailable && <p>재시도 가능 시간: {new Date(data.retryAfterAt).toLocaleTimeString()}</p>}
      {!data.retryAvailable && !reRecord && !data.retryAfterAt && <p>이 작업은 더 이상 재시도할 수 없습니다.</p>}
    </div>}
    {data?.status === 'PAUSED' && <p role="status">평가가 정지되었습니다. 제출한 답변 처리 후 5분 안에 재개해 주세요. 전체 제한 시간은 계속 흐릅니다.</p>}
    {data?.status === 'ENDING' && <p role="status">제출한 답변의 음성 인식을 마무리하고 있습니다…</p>}
    {data?.question && data.phase !== 'FINISHED' && <p className="question-content" lang="en">{data.question.content}</p>}
    {!controlling && data?.status === 'IN_PROGRESS' && data.phase === 'READY_TO_ANSWER' && audioId && !heard.has(audioId) && <QuestionPlayer key={audioId} audioId={audioId} onCompleted={markHeard} />}
    {canAnswer && questionId && <VoiceAnswer key={`${questionId}-${draftVersion}`} evaluationId={evaluationId} questionId={questionId} enabled={true} onSent={evaluation.refetch} />}
    {data && <EvaluationControls evaluationId={evaluationId} actions={data.actions} onBeforeControl={() => { setControlling(true); setDraftVersion((v) => v + 1); setNotice('제출하지 않은 녹음은 폐기됩니다.'); }} onChanged={async () => { await evaluation.refetch(); setControlling(false); }} />}
    {data && ['ANALYSIS_PENDING', 'ANALYZING', 'COMPLETED', 'ANALYSIS_FAILED'].includes(data.status) && <p>회화가 종료되었습니다. <Button onClick={() => navigate(`/evaluations/${evaluationId}/report`)}>평가 보고서 확인</Button></p>}
    <p className="question-disclosure">질문 음성은 AI가 생성합니다.</p>
  </section></main>;
}
