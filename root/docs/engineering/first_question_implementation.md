# 로그인부터 첫 AI 질문까지

확정 범위: 로그인 → 홈 → 주제·시작 수준 선택 → 마이크 확인 → 세션 생성 → 첫 질문 생성·TTS → 저장된 음성 재생 완료. STT·답변 제출·후속 질문·정지·재개·종료는 [회화 구현 결과](./conversation_implementation.md)에 추가됐다. 보고서는 다음 구현 범위다.

## 사용자 흐름

1. 기존 로그인·Access JWT·Refresh 쿠키·인증 복원을 사용한다.
2. 홈의 평가 시작 버튼으로 `/evaluation/setup`에 진입한다.
3. 서버에서 조회한 일상·여행·직장과 초급·중급·고급 중 각각 하나를 선택한다.
4. 평가 방식·AI 음성·최대 10분(정지 시간 포함)을 안내한다.
5. 사용자가 마이크 확인 버튼을 누르면 녹음 API·지원 형식·권한·장치를 확인한다. 확인한 track은 즉시 종료하며 음성을 저장·전송하지 않는다.
6. 시작 버튼은 설정·마이크 확인이 끝난 뒤 활성화한다. FE가 생성한 UUID로 READY 세션을 생성하고 `/evaluations/:id`로 이동한다.
7. 평가 화면이 첫 질문 작업을 시작하고 처리 중에만 1초 간격으로 조회한다.
8. WAS의 BullMQ Worker가 LLM → 질문 저장 → TTS → MinIO 저장 → 음성 FK·IN_PROGRESS·시작 시각을 확정한다.
9. FE가 인증된 RPC로 질문 MP3를 받아 재생한다. 자동 재생이 차단되면 첫 질문 듣기 버튼을 표시한다. 완료 후 다시 듣기는 제공하지 않는다.

## 계약과 저장

| RPC | 입력 | 출력 |
| --- | --- | --- |
| `evaluation.options` query | 없음 | 주제·시작 수준·최대 시간 |
| `evaluation.create` mutation | evaluationId·topicCode·startingBandCode | 평가 ID·READY/IN_PROGRESS |
| `evaluation.start` mutation | evaluationId | 평가 진행 DTO |
| `evaluation.get` query | evaluationId | 평가 진행 DTO |
| `evaluation.retry` mutation | evaluationId | 평가 진행 DTO |
| `evaluation.audio` query | audioId | MIME·base64 MP3 |

평가 RPC는 JWT·활성 계정 검증을 하고 mutation은 Origin도 검증한다. 소유권은 내부 유스케이스에서 확인한다. Controller는 공개 인바운드 포트만 호출한다. Worker는 별도 인바운드 어댑터이며 같은 WAS 프로세스에서 실행한다.

세션에는 topic_code만 추가하고 주제 이름·맥락을 중복 저장하지 않는다. 초기 난이도는 선택 수준의 MID로 고정한다. 첫 LLM 출력은 `{ content: string }`이며 영어 질문 한 개·500자 이내·힌트/번역/점수 없음으로 제한한다. 질문 음성까지 확정되기 전에는 공개 진행 DTO의 question은 NULL이다.

Prisma에는 인증 모델 외에 EvaluationSession·Question·AudioAsset을 구현한다. FK·UNIQUE·시간/양수 CHECK는 마이그레이션에 반영한다. 원본 파일 URL·base64·작업 이력·시도 수를 DB에 저장하지 않는다. DB에는 `questions/{questionId}/{audioId}.mp3` 객체 키를 저장한다.

첫 질문 작업 ID는 `start-{evaluationId}`다. 첫 실행 1회와 사용자 재시도 2회, 총 3회로 제한한다. BullMQ 실패 작업의 누적 횟수는 유지하고 SDK 자동 재시도는 끈다. TTS 실패는 저장된 질문을 재사용한다. 세션 생성은 같은 UUID·회원·설정에 멱등이며 다른 설정은 CONFLICT, 다른 회원은 NOT_FOUND다.

LLM/TTS 호출 중 DB 잠금을 유지하지 않는다. 결과 확정 시 상태·계정을 재확인하고 질문당 저장은 행 잠금과 UNIQUE로 보호한다. 새 객체 저장 후 DB 확정이 실패하거나 다른 요청이 먼저 확정하면 해당 객체를 보상 삭제한다.

## 실행과 검증

`.env`에 OPENAI_API_KEY를 설정하고 아래 명령으로 이미지를 재빌드한다. 기존 `.env`를 덮어쓰지 않는다.

```sh
docker compose up --build -d
docker compose exec api pnpm --filter @root/api test:evaluation
docker compose exec web pnpm --filter @root/web test:audio
docker compose exec web env EVALUATION_TEST_URL=http://api:3000/trpc pnpm --filter @root/web test:evaluation
```

첫 두 테스트는 유스케이스·마이크 대역 테스트다. 마지막 테스트는 실제 PostgreSQL·Redis·MinIO·OpenAI로 생성·중복 시작·소유권·음성 조회를 확인하므로 실제 API 사용량이 발생한다. 마이크 권한과 브라우저 음성 재생은 별도로 `localhost:5173`에서 확인해야 한다.

서버 기본 설정은 LLM gpt-4o-mini, TTS gpt-4o-mini-tts/coral, 호출별 30초, MP3 최대 1 MiB다. Docker는 ffprobe를 설치한다. 호스트에서 실행할 경우 ffprobe가 PATH에 있어야 한다.

완료 확인 항목은 lint·typecheck·build·Prisma validate·마이그레이션·기존 인증 회귀와 실제 브라우저 정상 흐름이다. 컨테이너·외부 AI에 접근하지 못한 환경의 단위 테스트 성공을 전체 실행 검증으로 간주하지 않는다.

현재 작성 환경에서는 최초 구현의 유스케이스 10개·마이크 대역 1개 테스트, ESLint, Compose 설정 검사를 통과했다. 의존성 설치 후 캐시를 우회한 전체 build, 4개 패키지 typecheck, Prisma validate도 통과했다. Docker 소켓과 실행 중인 API 접근이 제한되어 실제 마이그레이션 적용·OpenAI 응답·브라우저 재생 검증은 아직 수행하지 못했다. 로컬 `.env`의 API 키 존재는 확인했으나 실행 중인 WAS에 반영됐는지와 키의 유효성은 확인하지 못했다.
