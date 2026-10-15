# 음성 회화 구현 결과

2026-10-13. 범위는 첫 질문부터 사용자 음성 답변 → STT → 후속 질문 LLM → TTS, 정지·재개·종료와 `ANALYSIS_PENDING`까지다. 보고서·최종 채점·회원 수준 갱신은 다음 작업이다.

## 동작

- 로그인·주제·시작 수준·마이크 확인은 기존 기능을 사용한다. 첫 질문은 선택 수준의 MID로 시작한다.
- 질문 음성을 끝까지 들으면 녹음할 수 있다. 자동 재생 차단 시 질문 듣기 버튼을 표시한다. 완료한 질문은 같은 화면에서 재생하지 않는다.
- 녹음 시작·완료·취소·다시 녹음·보내기를 제공한다. 로컬 청크를 하나의 원본 Blob으로 합쳐 FormData로 전송한다. 스트리밍·VAD·발화 분할은 추가하지 않는다.
- 서버는 10 MiB, 1~120초, WebM/Opus 또는 MP4/AAC와 실제 디코딩을 검사한다. ffprobe와 ffmpeg는 Docker 이미지에 포함된다. 길이가 없는 WebM은 디코딩 진행 시각으로 확인한다. 파일 자체는 변환하지 않으며 임시 검사 파일은 삭제한다.
- 원본은 `answers/{answerId}/{audioId}.{webm|mp4}`에 저장한다. `answer`와 `audio_asset`을 저장한 뒤 큐에 등록하고 진행 DTO를 반환한다. 업로드 요청은 AI 응답을 기다리지 않는다.
- Worker는 STT 전사문을 그대로 저장하고, 순서대로 정렬한 질문·전사문으로 후속 질문을 결정한다. 난이도는 이전 질문에서 한 단계까지만 바꾼다. 대화 중 점수·교정·힌트를 제공하지 않는다.
- 전사문이 있으면 STT, 다음 질문이 있으면 LLM, 다음 음성이 있으면 TTS를 반복하지 않는다. 인식 불가능한 답변만 같은 답변 행의 원본 음성을 교체할 수 있으며 이전 audioId 작업은 결과를 확정할 수 없다.
- 정지 중 이미 접수한 답변은 다음 질문·음성까지 저장한다. 정지 상태를 유지하고 새 입력·재생을 막는다. 처리 종료 후 재개한다. 홈에서 정지한 평가로 진입할 수 있다.
- 전체 600초는 첫 질문 음성 확정부터 정지 시간까지 포함한다. 정지 후 재개는 300초 이내다. 지연 작업과 조회·쓰기 경계에서 시간 제한을 확인한다. 이전 pausedAt의 지연 작업은 재정지한 평가를 종료하지 않는다.
- 종료 시 새 입력을 차단한다. 접수한 답변은 STT까지만 마무리하며 뒤늦은 LLM·TTS 결과로 질문을 공개하지 않는다. 모든 접수 답변이 완료/실패 상태면 `ANALYSIS_PENDING`이 된다. LLM 종료 제안은 전사된 답변 5개 이상에서만 허용한다.

## 공개 계약과 저장

`tRPC → Nest Controller → 인바운드 포트 → Application/Domain → 아웃바운드 포트`를 따른다. Worker는 별도의 인바운드 어댑터다. FormData·Blob은 Controller에서 Uint8Array 입력으로 바뀌며 내부 포트에 들어가지 않는다.

`evaluation.options/create/start/get/retry/audio`를 확장하고 `submitAnswer/pause/resume/end/resumable`을 추가했다. 모든 평가 RPC는 JWT·활성 계정, mutation은 Origin, 개별 세션·음성은 소유권을 검사한다. 전체 HTTP 본문은 10 MiB + 64 KiB, 파일은 10 MiB로 제한한다. Access JWT 갱신 후 같은 FormData 파일을 재전송한다.

`EvaluationProgress`는 주제·시작 수준·세션 상태·시각·종료 사유, 준비된 현재 질문, 최신 답변 ID/처리 상태, 현재 단계·오류·재시도 가능 시각과 제어 가능 여부를 반환한다. 질문 번호·현재 질문·단계·재시도 횟수를 세션 컬럼으로 중복 저장하지 않는다.

Prisma에 `Answer`, `AnswerProcessingStatus`, `EvaluationEndReason`과 종료 사유/답변 완료 시각을 추가했다. FK는 RESTRICT, 질문당 답변/음성은 UNIQUE다. 상태·전사문·시각 CHECK는 `20261015000000_conversation`에 있다. 기존 마이그레이션은 변경하지 않았다. 작업·시도·STT 이력 테이블은 추가하지 않았다.

## AI 오류와 재시도

키 누락·키 인증·접근 거부·모델 없음·할당량·잘못된 요청·호출 제한·타임아웃·연결 실패를 각각 공개 코드로 구분한다. OpenAI 401은 평가 작업 오류이며 회원 JWT 인증 실패로 반환하지 않는다. 로그에는 작업 종류·HTTP 상태·provider code/param/request ID만 남긴다. 키·질문·전사문·음성·전체 오류 본문은 출력하지 않는다.

SDK 자동 재시도는 0회다. BullMQ 작업은 `start-{evaluationId}`, `answer-{answerId}-{audioId}`에 첫 실행 + 사용자 재시도 2회, 총 3회를 누적 적용한다. 실패 작업을 지우거나 횟수를 초기화하지 않는다. 과거 `AI_CONFIGURATION` 실패도 남은 횟수 안에서 설정 수정 후 재시도할 수 있다. 429 `Retry-After` 전에는 수동 재시도도 막는다. 계정 비활성·AI 거절·인식 불가능한 원본은 같은 입력 재시도를 허용하지 않는다.

## 실행

기존 `.env`는 보존한다. OPENAI_API_KEY와 선택 모델·음성을 확인한 뒤 실행한다. 이 변경은 공유 계약·DB·이미지 설정을 포함하므로 재빌드가 필요하다. 데이터 볼륨을 삭제하지 않는다.

```sh
docker compose up --build -d
docker compose exec api pnpm --filter @root/api ai:check
```

API 시작 명령이 기존 인증·첫 질문·이번 답변 마이그레이션을 적용한다. 실행 중인 API에 별도로 적용하려면 `docker compose exec api pnpm db:migrate:deploy`를 사용한다. 호스트에서는 `npm run db:migrate:deploy`와 `npm run ai:check`를 사용할 수 있다.

`ai:check`는 실제 API 환경에서 최소 LLM·TTS 호출을 수행한다. 키 존재 여부와 모델/음성 및 안전한 진단 값만 출력하며 소량의 API 사용량이 발생한다. HTTP 400의 param/code, 401 키, 403 권한, 404 모델, 429 quota/rate-limit을 보고 해당 설정을 수정한다. 모델을 자동 변경하지 않는다. `.env` 변경 후 API 컨테이너를 재생성하고 기존 평가 화면에서 재시도한다.

컨테이너에서 `ai:check` 스크립트가 없다고 나오면 호스트와 컨테이너의 패키지 파일이 서로 다른 상태다. Compose는 앱 패키지 파일·테스트와 공유 계약·DB 소스를 마운트하고, 시작 시 계약·Prisma 클라이언트를 다시 빌드하도록 수정했다. 이 Compose 변경은 `docker compose up --build --force-recreate -d api web`로 적용한 뒤 컨테이너 진단을 다시 실행한다. 기존 실패 작업의 재시도 횟수와 데이터 볼륨은 초기화하지 않는다.

```sh
npm run test:evaluation
npm run test:render
npm run lint
npm run typecheck
npm run build -- --force
npm run db:validate
# 실행 중인 스택 대상 인증·AI 통합 검증
npm run test:auth
npm run test:evaluation:integration
# 실제 브라우저에서 녹음한 샘플로 STT 포함 검증
EVALUATION_TEST_AUDIO=/absolute/path/answer.webm npm run test:evaluation:integration
```

컨테이너 통합 테스트는 `docker compose exec web env EVALUATION_TEST_URL=http://api:3000/trpc pnpm --filter @root/web test:evaluation`로 실행한다. STT 샘플 테스트는 EVALUATION_TEST_AUDIO 경로가 없으면 명시적으로 skip된다. 마이크·자동 재생·정지 시 장치 정리는 `http://localhost:5173` 브라우저에서 확인해야 한다.

## 검증 범위

47개 단위 테스트에서 유스케이스·오류 분류·재시도 정책, 도메인 캡슐화·상태 규칙, tRPC Fetch/Node 어댑터와 Nest의 기본 Express 본문 파서 조합, 녹음 장치 대역, 실제 FE 클라이언트의 GET·multipart JWT 갱신 및 React 렌더링을 검증했다. 처리 단계별 실패·중복 접수·오래된 audioId·정지·종료 경합·제한 시간·이전 정지 작업을 포함한다.

작성 환경에서는 전체 빌드·typecheck·lint·Prisma validate·Compose 설정 검사가 통과했다. 웹 JS 번들은 296.17 kB다. Docker 소켓 접근은 거부됐고 PostgreSQL 마이그레이션 적용은 P1001(연결 불가)로 실패했다. 로컬 AI 진단에서 키 존재는 확인했지만 DNS 연결 실패(ENOTFOUND)로 LLM·TTS 응답을 받지 못했다. 실제 API 대상 인증·회화 통합 테스트도 fetch failed로 실행에 실패했다. 실제 WAS의 키 유효성·모델 권한·청구 설정, PostgreSQL 트랜잭션, 실제 녹음 디코딩·브라우저 재생은 아직 검증하지 못했다. 단위 테스트 통과를 실제 연동 성공으로 간주하지 않는다.

이후 사용자가 호스트에서 실행한 `npm run ai:check` 출력으로 LLM·TTS의 실제 OpenAI 호출 성공을 확인했다. 이 결과는 호스트 환경의 키·모델 설정을 검증하며 Docker WAS의 환경 및 STT·전체 Worker 흐름을 검증하지는 않는다. 현재 보고된 `evaluation.get` HTTP 401은 WAS의 회원 인증 경계에서 점검한다.

## 렌더링 오류 수정

이전 첫 질문 API 응답에는 `actions`가 없다. 새 평가 화면이 이를 검증 없이 읽으면 HTTP 요청이 성공하더라도 `Cannot read properties of undefined (reading 'canRecord')`가 발생한다. 이 응답으로 실제 React 컴포넌트의 렌더링 예외를 재현했다. 사용자의 실행 중인 브라우저 오류와 동일한지는 직접 확인하지 못했다.

평가 진행·재개 목록 응답은 query의 select 경계에서 런타임 검증한다. 형식이 맞지 않으면 화면에 오류와 조회 버튼을 표시하고 반복 조회·녹음·평가 제어를 멈춘다. 오래된 응답의 누락 필드를 임의로 채워 신규 기능이 지원되는 것처럼 처리하지 않는다. React Error Boundary는 예상하지 못한 화면 예외를 안내 화면으로 표시한다.

`npm run test:render`는 실제 React 컴포넌트·tRPC hook·QueryClient를 사용한 7개 렌더링 회귀 테스트다. 로그인·홈·설정·정상 평가·정지·종료, 이전 응답 및 잘못된 중첩 데이터·목록을 포함한다. 인증 상태는 대역이며 React 서버 렌더링으로 HTML을 확인한다. 실제 브라우저의 로그인 효과·마이크·음성 재생 검증을 대체하지 않는다. 수정 후 캐시를 우회한 전체 빌드가 통과했으며 웹 JS 번들은 299.07 kB다.

## 답변 업로드 400 수정

2026-10-14. Nest의 기본 Express JSON/urlencoded 파서는 multipart를 읽지 않아도 요청에 `body: undefined` 속성을 만든다. tRPC 11.5.1의 Node 어댑터는 `body` 속성이 있으면 이미 파싱된 본문으로 간주하므로, 파일 스트림을 읽지 않고 `Failed to parse body as FormData.`와 HTTP 400을 반환했다. 정상 FormData로 이 오류를 재현했다.

tRPC HTTP Controller에서 multipart이면서 `body`가 undefined인 경우에만 해당 속성을 제거한다. Node 어댑터가 원본 스트림을 읽어 FormData를 생성하며 기존 JSON 파싱·JWT·Origin·입력 검사와 업로드 크기 제한은 유지한다. 네 개의 회귀 테스트는 기본 Express 파서와 실제 tRPC Node 어댑터를 사용해 기존 400, 수정 후 WebM/MP4 파일·식별자·바이트 전달, JSON 요청, 인증·입력 검사를 확인한다. 컨트롤러의 유스케이스와 DB·STT는 대역이므로 실제 녹음의 디코딩·STT 성공까지 검증한 결과는 아니다.

Compose의 API 소스 마운트와 Nest watch에 반영되며, 명시적으로 다시 시작하려면 `docker compose restart api`를 실행한다. 이 수정에는 DB 마이그레이션이나 이미지 변경이 없다.
