import { trpc } from '@/shared/api';
import { parseEvaluationHistory, parseReportProgress } from '../model/report-response';
export function useReport(evaluationId: string) {
  return trpc.report.get.useQuery({ evaluationId }, { retry: false, select: parseReportProgress, refetchInterval: (query) => {
    if (query.state.status === 'error' || !query.state.data) return false;
    try { const state = parseReportProgress(query.state.data); return state.status === 'ANALYSIS_PENDING' || state.status === 'ANALYZING' ? 1000 : false; }
    catch { return false; }
  } });
}
export function useEvaluationHistory(page: number) { return trpc.report.history.useQuery({ page, pageSize: 10 }, { retry: false, select: parseEvaluationHistory, staleTime: 0 }); }
