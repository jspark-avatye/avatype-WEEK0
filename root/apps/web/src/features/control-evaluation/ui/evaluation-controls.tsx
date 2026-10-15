import { useState } from 'react';
import type { EvaluationProgress } from '@/entities/evaluation';
import { trpcClient } from '@/shared/api';
import { Button } from '@/shared/ui/button';
export function EvaluationControls({ evaluationId, actions, onBeforeControl, onChanged }: { evaluationId: string; actions: EvaluationProgress['actions']; onBeforeControl(): void; onChanged(): Promise<unknown> }) {
  const [pending, setPending] = useState(false); const [error, setError] = useState('');
  async function act(action: 'pause' | 'resume' | 'end') {
    if (pending) return;
    setPending(true); setError(''); onBeforeControl();
    try { await trpcClient.evaluation[action].mutate({ evaluationId }); }
    catch (error) { setError(error instanceof Error ? error.message : '평가 상태를 변경하지 못했습니다.'); }
    finally { await onChanged(); setPending(false); }
  }
  return <section aria-label="평가 제어">
    <div className="evaluation-actions">
      {actions.canPause && <Button disabled={pending} onClick={() => { void act('pause'); }}>잠시 정지</Button>}
      {actions.canResume && <Button disabled={pending} onClick={() => { void act('resume'); }}>평가 재개</Button>}
      {actions.canEnd && <Button disabled={pending} onClick={() => { void act('end'); }}>평가 종료</Button>}
    </div>
    {error && <p role="alert" className="evaluation-error">{error}</p>}
  </section>;
}
