# 최종 평가·보고서 상세 구현 계획

2026-10-14. 사용자 확정: 항목별 0~100점과 AI의 9단계 수준 판정, 항목별 최대 3개 답변 전체 음성 근거, 서버의 확정 최소 기준을 적용한다.

## 목표와 범위

로그인 → 실제 음성 회화 → 종료 → 최종 분석 → 보고서·근거 음성·본인 평가 기록 조회를 연결한다. 2일 사내 해커톤 범위로 분석 재시도를 포함한다. 운영 이력·동의·관리 기능은 추가하지 않는다. 기존 회화의 종료 지점은 ANALYSIS_PENDING이다.

## 평가 정책

| 항목 | 기준 | 입력 |
| --- | --- | --- |
| VOCABULARY | 어휘 다양성·정확성·상황 적합성 | 질문·전사 |
| GRAMMAR | 문법 정확성·문장 구조 다양성 | 전사 |
| PRONUNCIATION | 명료도·이해 가능성·강세·억양 | 원본 음성 |
| FLUENCY | 연결성·쉼·반복·자기 수정 | 원본 음성 |
| RELEVANCE | 질문에 대한 응답·내용 연결성 | 질문·전사 |

점수는 0~100 정수다. 데이터 부족은 score=NULL과 부족 사유로 표시한다. 최종 수준은 점수 평균에서 환산하지 않는다. 공통 기준은 아래와 같다.

| 수준 | 기준 |
| --- | --- |
| BEGINNER_LOW | 단어·암기한 짧은 표현 중심 |
| BEGINNER_MID | 간단한 문장으로 기본 질문 응답 |
| BEGINNER_HIGH | 익숙한 주제에서 짧은 문장 연결 |
| INTERMEDIATE_LOW | 경험·계획 및 간단한 이유 설명 |
| INTERMEDIATE_MID | 여러 문장으로 비교·이유·의견 설명 |
| INTERMEDIATE_HIGH | 다양한 주제에서 구체적인 근거 제공 |
| ADVANCED_LOW | 추상적인 주제의 논리적 의견·대안 설명 |
| ADVANCED_MID | 복잡한 주제를 정확하고 유연하게 전달 |
| ADVANCED_HIGH | 뉘앙스·강조·다양한 표현으로 정교하게 설명 |

시작 수준은 최종 수준을 제한하지 않는다. 설명·개선 안내는 한국어, 수정 표현은 영어로 제공한다.

유효 답변은 전사문이 있고 음성 검토에서 해당 전사를 사용할 수 있다고 확인된 답변이다. 후속 질문·TTS 실패로 FAILED인 답변도 유효한 전사·음성이 있으면 사용한다. AI는 최종 수준과 항목 결과를 제안하며 판정은 서버가 결정한다.

- CONFIRMED: 최종 수준 존재, 유효 답변 5개 이상, 5개 항목 모두 점수 존재.
- PROVISIONAL: 최종 수준 존재, 확정 조건 미달.
- UNASSESSABLE: 최종 수준 판단 불가, finalLevelCode=NULL.
- 분석할 답변이 없으면 AI 호출 없이 5개 항목 데이터 부족 보고서를 생성한다.

## 백엔드 처리

상태: ENDING → ANALYSIS_PENDING → ANALYZING → COMPLETED 또는 ANALYSIS_FAILED. 실패 재시도는 ANALYSIS_PENDING으로 돌아간다. 데이터 부족 보고서도 정상 COMPLETED다.

사용자 종료·시간 제한·재개 시간 초과·AI 종료 모두 접수 답변이 terminal 상태가 된 뒤 보고서 작업을 등록한다. 마지막 답변 완료·실패에서도 등록을 확인한다. 기존 대기 세션은 보고서 화면의 analyze mutation으로 연결한다. 큐 등록 실패는 대기 상태와 회화 데이터를 유지한다.

ReportModule은 Controller·인바운드 포트·Application Service·Domain·아웃바운드 포트·어댑터로 구성한다. tRPC는 Controller를 호출한다. Worker는 별도 인바운드 어댑터다. 평가 모듈은 아웃바운드 연결 어댑터를 통해 보고서의 공개 인바운드 포트를 호출한다. MinIO는 공통 Infrastructure provider로 공유한다. 내부에 SDK·Prisma·BullMQ·HTTP 타입과 any를 사용하지 않는다.

Worker는 세션 잠금 아래 활성 회원·분석 가능 상태·진행 중 답변 없음·기존 보고서 없음 확인 후 ANALYZING으로 바꾼다. 질문 순서대로 질문·답변·전사·음성 참조와 종료 정보를 읽는다. 답변 없는 질문·AI 질문 음성은 채점하지 않는다. 분석 대기 이후 입력을 변경하지 못하도록 기존 답변 완료·실패 쓰기도 보호한다.

1. 원본 음성을 답변별로 읽는다. 어댑터에서 녹음 전체를 16kHz·모노·PCM 16bit WAV로 준비한다. 원본을 보존하고 임시 파일은 finally에서 삭제한다.
2. gpt-audio-1.5 Chat Completions input_audio에 질문·전사·WAV를 전달한다. 텍스트 출력과 함수 호출로 전사 사용 가능 여부, 발음·유창성 관측 및 부족 사유를 받는다. 함수 인자는 unknown으로 런타임 검증한다.
3. gpt-4o-mini Responses의 Strict JSON Schema로 주제·질문·유효 전사·음성 관측·제외 사유·고정 기준을 전달한다. 최종 수준·종합 설명·5개 항목·근거·피드백을 받는다. 사용자 지시는 평가 데이터로 취급한다.
4. 정확한 5개 항목, 정수 점수 범위, 점수/부족 사유 XOR, 수준 ENUM, 근거 소속·평가 가능 여부를 검증한다. 채점 항목은 근거 1~3개와 피드백 1~3개, 부족 항목은 근거·피드백 없이 부족 사유를 제공한다.
5. 보고서·항목·근거·피드백과 COMPLETED 변경을 한 트랜잭션으로 저장한다. AI 호출 중 DB 트랜잭션을 유지하지 않는다. 기존 보고서는 반환하고 재생성하지 않는다.

음성 모델은 Structured Outputs를 지원하지 않으므로 함수 결과 검증을 수행한다. 공식 근거: [음성 입력](https://developers.openai.com/api/docs/guides/audio-chat-completions), [음성 모델](https://developers.openai.com/api/docs/models/gpt-audio-1.5), [구조화 출력](https://developers.openai.com/api/docs/guides/structured-outputs). 실제 음성 모델 권한·응답은 구현 환경에서 먼저 진단한다.

## 작업과 재시도

report-analysis 큐, jobId=report-{evaluationId}, concurrency=1. 최초 실행 1회+수동 재시도 2회, SDK 자동 재시도 0회. attemptsMade를 보존하고 실패 작업을 삭제·재생성하지 않는다. 전체 보고서 분석을 재실행하며 중간 관측 테이블은 만들지 않는다. Retry-After를 적용한다. 완료 결과는 실패 콜백·중복 작업으로 덮어쓰지 않는다.

설정·연결·AI 형식·스토리지·DB 오류는 ANALYSIS_FAILED이며 데이터 부족과 구분한다. OpenAI 인증 실패는 회원 JWT의 HTTP 401로 변환하지 않는다. 큐 오류 코드는 작업 메타데이터에서 관리하며 운영 이력 테이블·집계 컬럼을 추가하지 않는다.

## 정규화 저장

기존 ERD의 evaluation_report, criterion_result, criterion_feedback를 Prisma에 추가한다. 복수 근거는 criterion_evidence(result_id, answer_id, evidence_no, explanation)로 추가한다. PK=(result_id, answer_id), UNIQUE=(result_id, evidence_no). 질문·평가·음성 ID·전사·길이를 중복 저장하지 않는다.

평가당 보고서 UNIQUE, 보고서당 항목 UNIQUE, 피드백 순서 UNIQUE, FK RESTRICT, 점수 범위·정수·부족 사유 XOR·판정/수준 NULL·양수 순서 CHECK를 추가한다. 5개 항목 개수와 근거의 평가 소속은 트랜잭션 쓰기 경계에서 보장한다.

user_account.current_level_code는 제거한다. 인증 DTO의 currentLevelCode는 최신 CONFIRMED 보고서를 (평가 시작 DESC, 보고서 생성 DESC, 보고서 ID DESC)로 조회한다. 기존 컬럼은 보고서가 없는 현재 상태에서 모두 NULL인지 사전 검사한다. 잠정·평가 불가 결과는 현재 수준에 반영하지 않는다.

## 공개 API와 화면

| tRPC | 입력 | 결과 |
| --- | --- | --- |
| report.analyze mutation | evaluationId | 멱등 작업 등록·상태 |
| report.get query | evaluationId | 상태·단계·오류·시작/재시도 가능 여부·완료 보고서 |
| report.retry mutation | evaluationId | 제한된 재시도·상태 |
| report.history query | page, pageSize | 본인 기록·페이지·전체 개수 |
| report.answerAudio query | evaluationId, answerId | 완료 보고서 근거의 MIME·base64 |

JWT·활성 회원·소유권, mutation Origin을 확인한다. 타인 자원은 NOT_FOUND다. analyze는 실패 작업을 재시도하지 않는다. 기록은 기본 10개·최대 50개, createdAt DESC/evaluationId DESC로 정렬한다. 음성은 별도 클릭 요청으로 가져오고 MinIO 주소를 노출하지 않는다.

FSD entities/report, features/retry-report-analysis, pages/report, pages/evaluation-history를 추가한다. 종료 후 /evaluations/{id}/report, 기록은 /evaluations. 미등록 작업은 analyze를 한 번 호출한다. 대기·분석 중에만 1초 polling, 완료·실패에서 중단한다. 결과·근거 전사·전체 답변 음성·개선 피드백을 표시한다. Blob URL은 해제한다. 현재 회원 정보도 갱신한다. 응답을 런타임 검증하고 오류 안내로 렌더링을 보호한다.

## 설정·검증·반영

음성 모델 gpt-audio-1.5/120초, 최종 LLM gpt-4o-mini/60초/최대 6000 tokens, WAV 준비 15초. 음성은 순차 검토한다. 기존 .env를 보존하고 예제·Compose를 갱신한다. 기존 SDK와 Docker ffmpeg를 사용한다. 새 마이그레이션을 추가하며 기존 마이그레이션·볼륨을 유지한다.

구현 순서: 음성 연동 진단 → 기준·DTO·도메인 → Prisma·마이그레이션 → Service·Worker·어댑터 → 종료 연결·API·재시도 → React → 통합 검증·문서.

필수 검증: 확정/잠정/부족/무답변, 실패 답변의 유효 전사 활용, 음성/전사 불일치, 처리 중 종료, 모든 종료 경로, 중복 작업/저장, 잘못된 점수/항목/근거 거절, 저장 롤백, 재시도 한도/대기 시각/완료 불변, 오래된 회화 작업의 입력 변경 차단, 타인 접근, 과거 평가의 늦은 완료, FE 잘못된 응답/재생 실패. 단위·PostgreSQL 통합·실제 AI·브라우저 검증을 구분하고 기존 인증/회화/업로드/렌더링 회귀를 유지한다.
