import { trpc } from '@/shared/api';
import { parseEvaluationProgress, parseResumableEvaluations } from '../model/progress-response';
export function useEvaluationOptions() { return trpc.evaluation.options.useQuery(undefined, { retry: false }); }
export function useEvaluationProgress(evaluationId: string) {
  return trpc.evaluation.get.useQuery({ evaluationId }, { retry: false, select: parseEvaluationProgress, refetchInterval: (query) => {
    if (query.state.status === 'error') return false;
    if (!query.state.data) return false;
    try {
      const data = parseEvaluationProgress(query.state.data);
      return data.status === 'ENDING' || ['TRANSCRIBING', 'GENERATING_QUESTION', 'SYNTHESIZING'].includes(data.phase) ? 1000 : false;
    } catch { return false; }
  } });
}
export function useResumableEvaluations() { return trpc.evaluation.resumable.useQuery(undefined, { retry: false, staleTime: 0, select: parseResumableEvaluations }); }
export function useQuestionAudio(audioId: string) { return trpc.evaluation.audio.useQuery({ audioId }, { retry: false, staleTime: Infinity, gcTime: 0 }); }
