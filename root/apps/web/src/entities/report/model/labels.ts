import type { CriterionCode, ReportProgress, ReportVerdict } from '@root/trpc-contract';
export const criterionLabel: Record<CriterionCode, string> = { VOCABULARY: '어휘', GRAMMAR: '문법', PRONUNCIATION: '발음', FLUENCY: '유창성', RELEVANCE: '답변 적절성' };
export const verdictLabel: Record<ReportVerdict, string> = { CONFIRMED: '확정', PROVISIONAL: '잠정', UNASSESSABLE: '평가 불가' };
export const stageLabel: Record<ReportProgress['stage'], string> = { NOT_STARTED: '보고서 분석을 준비하고 있습니다.', QUEUED: '보고서 분석 대기 중입니다.', ANALYZING_AUDIO: '답변 음성의 발음과 유창성을 확인하고 있습니다.', GENERATING_REPORT: '대화 전체를 평가하고 있습니다.', SAVING_REPORT: '보고서를 저장하고 있습니다.', COMPLETED: '보고서가 완성되었습니다.', FAILED: '보고서 분석을 완료하지 못했습니다.' };
export const statusLabel: Record<string, string> = { READY: '시작 전', IN_PROGRESS: '회화 진행 중', PAUSED: '일시정지', ENDING: '회화 종료 중', ANALYSIS_PENDING: '분석 대기', ANALYZING: '분석 중', COMPLETED: '완료', ANALYSIS_FAILED: '분석 실패' };
export const topicLabel: Record<string, string> = { DAILY_LIFE: '일상', TRAVEL: '여행', WORK: '직장' };
const bands: Record<string, string> = { BEGINNER: '초급', INTERMEDIATE: '중급', ADVANCED: '고급' };
const steps: Record<string, string> = { LOW: '하', MID: '중', HIGH: '상' };
export function levelLabel(code: string | null): string { if (!code) return '미평가'; const [band, step] = code.split('_'); return `${bands[band] ?? band} · ${steps[step] ?? step}`; }
export function reportError(code: string | null): string {
  const errors: Record<string, string> = {
    AI_KEY_MISSING: '서버 OpenAI API 키를 설정한 후 재시도해 주세요.', AI_AUTH_FAILED: '서버 OpenAI API 키 인증에 실패했습니다.',
    AI_ACCESS_DENIED: 'OpenAI 음성 또는 보고서 모델 접근 권한을 확인해 주세요.', AI_MODEL_UNAVAILABLE: '설정된 보고서 모델을 사용할 수 없습니다.',
    AI_QUOTA_EXCEEDED: 'OpenAI 할당량과 결제 설정을 확인해 주세요.', AI_INVALID_REQUEST: '서버의 보고서 모델 요청 설정을 확인해 주세요.',
    AI_INVALID_OUTPUT: 'AI 평가 결과 형식이나 근거가 올바르지 않습니다. 재시도해 주세요.', AI_RATE_LIMITED: 'OpenAI 호출 제한에 도달했습니다. 안내된 시각 이후 재시도해 주세요.',
    AI_TIMEOUT: 'AI 분석 대기 시간이 초과되었습니다.', AI_UNAVAILABLE: 'OpenAI에 연결하지 못했습니다.',
    AI_REFUSAL: 'AI가 해당 답변의 분석을 처리하지 못했습니다.', STORAGE_UNAVAILABLE: '저장된 음성을 가져오지 못했습니다.',
    AUDIO_CONFIGURATION: '서버 음성 처리 설정을 확인해 주세요.', AI_INVALID_AUDIO: '저장된 음성을 분석 입력으로 준비하지 못했습니다.',
    REPORT_JOB_MISSING: '분석 작업 정보를 찾을 수 없습니다.', ACCOUNT_INACTIVE: '이 계정으로 분석을 진행할 수 없습니다.',
  };
  return errors[code ?? ''] ?? '보고서 분석을 완료하지 못했습니다. 가능한 경우 저장된 답변으로 재시도해 주세요.';
}
