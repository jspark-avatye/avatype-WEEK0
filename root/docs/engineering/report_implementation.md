# 최종 평가·보고서 구현 결과

2026-10-14. 기준은 [상세 구현 계획](./report_implementation_plan.md)이다.

## 구현한 동작

- 사용자·시간 제한·재개 만료·AI 종료와 마지막 답변의 완료·실패 처리에서 보고서 작업을 등록한다. 기존 ANALYSIS_PENDING 세션은 보고서 화면에서 analyze mutation으로 시작한다.
- ReportModule의 Controller·인바운드 포트·Application Service·Domain과 Prisma/OpenAI/BullMQ/음성 어댑터를 추가했다. 평가 모듈은 포트 연결 어댑터로 보고서를 요청하고 MinIO는 공통 provider로 공유한다.
- 원본 WebM/MP4 전체를 임시 16kHz 모노 PCM16 WAV로 준비해 gpt-audio-1.5에서 발음·유창성과 전사 사용 가능 여부를 관측한다. 원본 객체를 보존하고 임시 파일은 삭제한다.
- gpt-4o-mini의 Strict JSON Schema로 대화·유효 전사·음성 관측·제외 사유에서 최종 수준과 5개 결과를 생성한다. 시작 수준을 최종 수준의 제한으로 전달하지 않는다.
- 점수 0~100 정수, 부족 사유 XOR, 정확한 5개 항목, 수준 ENUM, 실제 답변별 항목 평가 가능 여부, 근거·피드백 각 1~3개를 검증한다.
- 최종 수준 존재·유효 전사 답변 5개 이상·5개 점수 존재이면 CONFIRMED, 최종 수준 존재·기준 미달이면 PROVISIONAL, 수준 없음이면 UNASSESSABLE이다. 유효 전사가 전혀 없는 입력에서 전체 수준을 제안하면 거절한다.
- 무답변·전사 없음·음성 근거 없음은 AI 최종 호출 없이 5개 NULL 점수와 부족 사유를 저장한다. 제출은 있었지만 인식·처리 근거를 확보하지 못한 경우 그 제한을 설명한다.
- 보고서·항목·피드백·복수 답변 근거와 COMPLETED 변경을 같은 DB 트랜잭션으로 저장한다. 분석 대기 이후에는 오래된 회화 작업이 입력을 변경하지 못한다.
- report-analysis jobId는 report-{evaluationId}, Worker concurrency=1, SDK 재시도 0, 최초+수동 2회=총 3회다. 큐 실패 횟수를 보존하고 Retry-After와 재시도 가능 오류를 적용한다. 분석 실패 메타데이터가 큐에 공개되기 전 잠깐의 전환에서는 UI polling을 유지한다.
- report.analyze/get/retry/history/answerAudio는 JWT·활성 회원·소유권을 확인한다. mutation은 Origin도 확인한다. OpenAI 401은 회원 인증 401로 변환하지 않는다.
- React 보고서·평가 기록 화면, 분석 상태·재시도·근거 전사·전체 음성·피드백을 제공한다. 서버 라우터를 초기화하지 않는 순수 계약 진입점을 브라우저에서 사용하고 응답을 런타임 검증한다.
- Vite는 evaluation/report의 순수 계약 소스를 직접 번들링한다. NestJS용 CommonJS 출력의 named export를 읽지 못하는 웹 빌드 오류를 해결하고 서버 라우터 진입점과 분리한다.

## 저장과 마이그레이션

Prisma는 총 10개 정규화 테이블이다. 기존 ERD의 evaluation_report/criterion_result/criterion_feedback와 복수 답변 연결을 위한 criterion_evidence를 추가했다. 배열·JSON·집계·운영 이력 컬럼을 추가하지 않았다. 근거의 질문·전사·음성·길이는 관계에서 조회한다.

user_account.current_level_code를 제거하고 인증 DTO의 currentLevelCode를 최신 CONFIRMED 보고서에서 조회한다. 순서는 평가 시작/보고서 생성/보고서 ID 내림차순이다. 잠정·불가 보고서는 조회 대상에서 제외한다.

`20261016000000_report` 마이그레이션은 기존 수준 값이 모두 NULL인지 확인한 뒤 컬럼을 제거하고 ENUM·FK·UNIQUE·CHECK를 추가한다. SQL 전체를 트랜잭션으로 적용한다. 기존 마이그레이션과 데이터 볼륨은 유지한다.

이번 환경에서 `npm run db:migrate:deploy`를 실행했지만 P1001로 연결하지 못해 적용되지 않았다. pg의 SELECT 1 진단도 connect EPERM이었다. Docker 소켓 접근도 거부됐다.

## 실행과 검증

```sh
docker compose up --build --force-recreate -d api web
docker compose exec api pnpm --filter @root/api report:check
docker compose exec api pnpm --filter @root/api test:report:db
docker compose exec web env EVALUATION_TEST_URL=http://api:3000/trpc pnpm --filter @root/web test:report:integration
```

API 시작 시 공유 계약·Prisma 클라이언트 빌드 후 마이그레이션을 적용한다. 이 수정에는 새로운 모델 설정과 계약 패키지 진입점이 포함되므로 앱 컨테이너를 다시 생성한다.

소스 변경 뒤 API가 `spawn ps ENOENT`로 종료되는 문제는 slim 이미지에 Nest CLI의 watch 재시작에 필요한 ps가 없는 것이 원인이다. Dockerfile에 procps 설치와 ps 존재 검사를 추가했다. 이 변경은 이미지 재빌드가 필요하다: `docker compose up --build --force-recreate -d api`. Compose 설정 검증은 통과했으며 Docker 소켓 접근 제한으로 실제 이미지 빌드·재시작은 이 실행 환경에서 확인하지 못했다.

`report:check`는 기본적으로 TTS로 생성한 WAV → 실제 음성 모델 → 실제 보고서 모델 호출·결과 검증을 수행한다. 보고서·음성은 저장하지 않고 키·음성·전사·보고서 본문을 출력하지 않는다. 소량의 OpenAI 사용량이 발생한다. 실제 사용자 녹음은 컨테이너에서 접근 가능한 REPORT_TEST_AUDIO와 해당 REPORT_TEST_TRANSCRIPT를 설정하여 검사한다.

진단은 각 단계의 STARTED/OK/FAILED, elapsedMs와 timeoutMs를 출력한다. REPORT_AUDIO_INPUT은 테스트용 음성 준비(기본 TTS), REPORT_AUDIO는 음성 평가, REPORT_LLM은 최종 보고서 호출이다. TTS는 기존 OPENAI_TTS_TIMEOUT_MS(기본 30초)를 사용하며 음성 평가와 보고서는 각각 OPENAI_REPORT_AUDIO_TIMEOUT_MS(기본 120초), OPENAI_REPORT_LLM_TIMEOUT_MS(기본 60초)를 사용한다. 설정 허용 범위는 1~120초다. 실제 녹음을 읽고 변환하는 입력 단계는 OpenAI 요청이 아니므로 timeoutMs=null로 표시한다.

AI_TIMEOUT은 호출 단계의 시간 초과다. 마지막 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL/Exit status 1은 진단이 실패해서 종료한 결과이며 그 자체로 빌드 오류를 뜻하지 않는다. FAILED 로그의 operation·elapsedMs·timeoutMs와 HTTP status/code/requestId가 있는 경우 함께 확인해야 한다. 단계 확인 없이 모델을 바꾸거나 제한 시간을 무조건 늘리지 않는다.

REPORT_AUDIO의 AI_INVALID_OUTPUT에는 reason·finishReason·toolCallCount·requestId와 검증 필드 param을 기록한다. OUTPUT_TRUNCATED는 토큰 제한으로 끝난 응답, EXPECTED_ONE_TOOL_CALL/UNEXPECTED_FINISH_REASON은 함수 호출 형식 오류, INVALID_JSON은 함수 인자의 JSON 오류, EXPECTED_BOOLEAN/EMPTY_STRING/TRANSCRIPT_REASON_MISMATCH 등은 데이터 규칙 오류다. 사용자 발화·함수 인자 본문은 기록하지 않는다. 실제 원인을 확인하기 전 실패한 음성 관측을 통과시키거나 점수를 추정하지 않는다. [공식 모델 문서](https://developers.openai.com/api/docs/models/gpt-audio-1.5)의 함수 호출 지원과 [Chat Completions 응답 문서](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)의 종료 사유를 기준으로 분류한다.

실제 컨테이너 진단에서 gpt-audio-1.5 응답에 finishReason=stop과 toolCallCount=1이 함께 확인됐다. 종료 사유가 tool_calls여야 한다는 기존 검사를 수정했다. stop 또는 tool_calls 종료에서 정확히 한 개의 지정된 함수 호출이 있고 JSON·음성 관측 규칙을 모두 통과해야 성공이다. length·content_filter 종료와 함수 누락·잘못된 데이터는 계속 실패한다. 회귀 테스트로 stop 응답의 성공 및 인자 검증 유지 여부를 확인했다.

```sh
npm run test:report
npm run test:evaluation
npm run lint
npm run typecheck
npm run build -- --force
npm run db:validate
# 실행 중인 migrated PostgreSQL·API 대상
npm run test:report:db
npm run test:report:integration
# 실제 사용자 음성으로 STT·음성 평가·최종 보고서·근거 바이트 확인
REPORT_TEST_AUDIO=/absolute/path/answer.webm npm run test:report:integration
```

단위·SDK 대역·Nest 연결·전송·React SSR·브라우저 계약 번들 테스트는 외부 모델·실제 DB 성공과 구분한다. DB 테스트는 자체 생성한 테스트 회원·평가·음성 메타데이터만 정리한다. 실제 녹음 통합 테스트는 샘플 경로가 없으면 명시적으로 skip한다.

오프라인 테스트 82개가 통과했다(보고서 29, 회화 25, 전송 7, 녹음 4, 인증 갱신 5, React SSR·브라우저 계약 12; 중복 실행 제외). 보고서 진단의 3개 시간 초과 테스트는 실제 SDK 타이머와 CLI를 실행하고 HTTP만 대체하여 단계·설정 반영·후속 단계 중단을 확인한다. 응답 진단 테스트는 10개 잘린 응답·함수 호출·JSON·필드 오류를 구분하고 진단에 본문이 포함되지 않음을 확인한다. 최종 강제 빌드도 4개 패키지 모두 통과했다. Prisma 스키마 검증과 빈 DB 기준 SQL 생성으로 10개 테이블 구성을 확인했다.

실제 진단에서 키 존재를 확인했으나 OpenAI 요청은 ENOTFOUND로 실패했다. DB 통합 테스트는 연결 훅에서 실패했고 실행 중 API 통합 테스트도 fetch failed였다. 실제 gpt-audio-1.5 계정 권한·음성 분석 응답·ffmpeg 변환·PostgreSQL 제약 적용·브라우저 전체 흐름은 이번 환경에서 확인하지 못했다.
