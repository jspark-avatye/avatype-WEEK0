# 영어 회화 평가 플랫폼 — 기본 ERD

수정일: 2026-10-14. 기존 9개에 복수 답변 근거 관계를 추가한 **10개 정규화 테이블**이다. 전체 타입·키·관계는 [erd.dbml](./erd.dbml)을 따른다. 보고서 마이그레이션 적용 시도는 실행 환경의 DB 연결 거부로 실패했다.

인증·세션·질문·음성·답변·보고서·항목·피드백·근거를 모두 Prisma에 반영했다. 첫 질문·회화·보고서 마이그레이션은 API 시작 시 적용한다. 보고서는 `20261016000000_report`다. 세부 규칙은 [보고서 구현 계획](./report_implementation_plan.md)을 따른다.

NULL 허용은 `허용`, 필수는 `불가`로 표시한다. PK는 기본키, FK는 외래키다. 복합 UNIQUE ①은 테이블 아래에 명시한 컬럼 조합 전체의 유일성을 의미한다. 모든 FK는 삭제·갱신 시 RESTRICT다. ENUM 타입은 아래 허용값을 사용한다. 기본값은 별도로 지정하지 않는다.

## 기본 관계

```mermaid
erDiagram
    user_account ||--o{ refresh_token : authenticates
    user_account ||--o{ evaluation_session : owns
    evaluation_session ||--o{ question : contains
    question ||--o| answer : receives
    audio_asset o|--o| question : question_audio
    audio_asset ||--o| answer : answer_audio
    evaluation_session ||--o| evaluation_report : produces
    evaluation_report ||--|{ criterion_result : scores
    criterion_result ||--o{ criterion_feedback : suggests
    criterion_result ||--o{ criterion_evidence : supports
    answer ||--o{ criterion_evidence : demonstrates
```

## 회원 계정 (`user_account`)

| 컬럼명(한글) | 컬럼명(영문) | 타입 | NULL 허용 | 제약 |
| --- | --- | --- | --- | --- |
| 회원 ID | `user_id` | `uuid` | 불가 | PK |
| 로그인 ID | `login_id` | `text` | 불가 | UNIQUE; 정규화 후 저장 |
| 비밀번호 해시 | `password_hash` | `text` | 불가 | — |
| 계정 상태 | `account_status` | `account_state` | 불가 | — |
| 생성 시각 | `created_at` | `timestamptz` | 불가 | — |

## 리프레시 토큰 (`refresh_token`)

| 컬럼명(한글) | 컬럼명(영문) | 타입 | NULL 허용 | 제약 |
| --- | --- | --- | --- | --- |
| 토큰 ID | `token_id` | `uuid` | 불가 | PK |
| 회원 ID | `user_id` | `uuid` | 불가 | FK → user_account(user_id) |
| 토큰 해시 | `token_hash` | `text` | 불가 | UNIQUE; 원문 토큰 저장 금지 |
| 발급 시각 | `created_at` | `timestamptz` | 불가 | 최초 발급 시각 |
| 만료 시각 | `expires_at` | `timestamptz` | 불가 | created_at보다 이후 |
| 폐기 시각 | `revoked_at` | `timestamptz` | 허용 | 유효 토큰은 NULL; 값이 있으면 created_at 이상 |

Access Token은 JWT로 발급하고 DB에 저장하지 않는다. Refresh Token은 암호학적으로 안전한 난수로 생성하고 DB에는 해시만 저장한다. 회원별 토큰은 여러 개 발급할 수 있다.

가입·로그인 시 Access Token과 Refresh Token을 발급한다. 웹 클라이언트의 Refresh Token은 HttpOnly·Secure 쿠키로 전달하며 SameSite 정책과 요청 Origin 검증을 적용한다. 갱신·로그아웃은 POST 요청으로 처리한다. 쿠키 속성·경로는 발급과 삭제 시 일치시킨다.

`auth.refresh`는 토큰 해시, 만료, 폐기 여부와 회원 ACTIVE 상태를 검증한 뒤 새 Access Token과 Refresh Token을 발급한다. 같은 행의 token_hash를 교체하고 created_at·expires_at은 유지해 최초 만료 시각을 연장하지 않는다. 기존 해시 조건의 원자적 갱신과 트랜잭션으로 동시에 들어온 갱신 요청 중 하나만 성공시킨다. 원문 토큰과 해시는 로그에 남기지 않는다.

`auth.logout`은 전달된 Refresh Token을 폐기하고 인증 쿠키·클라이언트 Access Token을 삭제한다. 이미 만료·폐기된 토큰의 로그아웃도 완료로 처리한다. Access Token 만료만으로 로그아웃을 막지 않는다. 이미 발급된 Access Token은 만료까지 유효할 수 있다.

토큰 수명은 서버 설정에서 관리하며 구체적인 값은 미확정이다. 별도 로그인 세션·회전 이력·기기 관리·토큰 재사용 탐지 테이블은 추가하지 않는다. 갱신된 쿠키를 받지 못한 경우 재로그인한다.

## 평가 세션 (`evaluation_session`)

| 컬럼명(한글) | 컬럼명(영문) | 타입 | NULL 허용 | 제약 |
| --- | --- | --- | --- | --- |
| 평가 ID | `evaluation_id` | `uuid` | 불가 | PK |
| 회원 ID | `user_id` | `uuid` | 불가 | FK → user_account(user_id) |
| 선택 주제 | `topic_code` | `text` | 불가 | 서버 정의 코드; 빈 값 금지 |
| 시작 수준 | `starting_band_code` | `proficiency_band_code` | 불가 | — |
| 평가 상태 | `status` | `evaluation_status` | 불가 | — |
| 생성 시각 | `created_at` | `timestamptz` | 불가 | — |
| 시작 시각 | `started_at` | `timestamptz` | 허용 | 시작 전 NULL |
| 최근 일시정지 시각 | `paused_at` | `timestamptz` | 허용 | 일시정지 중에만 값 유지 |
| 종료 시각 | `ended_at` | `timestamptz` | 허용 | 종료 전 NULL |
| 종료 사유 | `end_reason` | `evaluation_end_reason` | 허용 | 종료 시각과 함께 존재 |

READY에서만 started_at이 NULL이며 시작 시각은 created_at 이상이다. ended_at은 값이 있으면 started_at 이상이다. ENDING 및 분석 단계에서는 ended_at·end_reason이 함께 존재한다. paused_at은 값이 있으면 started_at 이상이다.

초기 주제는 `DAILY_LIFE`(일상), `TRAVEL`(여행), `WORK`(직장)이다. 주제 표시명·질문 생성 맥락은 서버 코드에서 관리하고 세션에는 선택 코드만 저장한다. 주제 의미를 변경할 때는 새 코드를 추가한다.

PAUSED 상태에서만 paused_at이 존재한다. 재개 시 NULL로 초기화한다. 정지 구간 이력은 저장하지 않는다.

## 질문 (`question`)

| 컬럼명(한글) | 컬럼명(영문) | 타입 | NULL 허용 | 제약 |
| --- | --- | --- | --- | --- |
| 질문 ID | `question_id` | `uuid` | 불가 | PK |
| 평가 ID | `evaluation_id` | `uuid` | 불가 | FK → evaluation_session(evaluation_id); 복합 UNIQUE ① |
| 질문 순서 | `question_no` | `integer` | 불가 | 복합 UNIQUE ①; > 0 |
| 질문 내용 | `content` | `text` | 불가 | — |
| 질문 난이도 | `difficulty_level_code` | `proficiency_level_code` | 불가 | — |
| 질문 음성 ID | `audio_id` | `uuid` | 허용 | FK → audio_asset(audio_id); UNIQUE; 음성 생성 전 NULL |
| 생성 시각 | `created_at` | `timestamptz` | 불가 | — |

복합 UNIQUE ①: `(evaluation_id, question_no)`.

질문은 생성된 내용을 확정한 뒤 저장한다. 질문 음성은 audio_id에 직접 연결한다.

## 답변 (`answer`)

| 컬럼명(한글) | 컬럼명(영문) | 타입 | NULL 허용 | 제약 |
| --- | --- | --- | --- | --- |
| 답변 ID | `answer_id` | `uuid` | 불가 | PK |
| 질문 ID | `question_id` | `uuid` | 불가 | FK → question(question_id); UNIQUE |
| 답변 음성 ID | `audio_id` | `uuid` | 불가 | FK → audio_asset(audio_id); UNIQUE |
| 전체 전사문 | `transcript` | `text` | 허용 | 전사 완료 전 또는 실패 시 NULL |
| 처리 상태 | `processing_status` | `evaluation_end_reason` | `USER_ENDED`, `TIME_LIMIT`, `PAUSE_EXPIRED`, `SUFFICIENT_EVIDENCE` |
| `answer_processing_status` | 불가 | — |
| 답변 접수 시각 | `accepted_at` | `timestamptz` | 불가 | — |
| 답변 처리 완료 시각 | `completed_at` | `timestamptz` | 허용 | COMPLETED에서만 존재; accepted_at 이상 |

질문당 답변은 최대 하나다. 전체 전사문은 구간 분리 없이 transcript에 저장한다.

processing_status가 COMPLETED이면 transcript는 빈 값이 아닌 NOT NULL이며 completed_at이 존재한다. 실패·재시도 시에도 이미 저장된 전사문은 보존한다. 인식 불가능한 음성만 같은 답변 행의 음성 참조를 새 파일로 교체한다.

## 음성 자원 (`audio_asset`)

| 컬럼명(한글) | 컬럼명(영문) | 타입 | NULL 허용 | 제약 |
| --- | --- | --- | --- | --- |
| 음성 ID | `audio_id` | `uuid` | 불가 | PK |
| 객체 키 | `object_key` | `text` | 불가 | UNIQUE; 프리픽스를 포함한 전체 객체 키 |
| MIME 타입 | `mime_type` | `text` | 불가 | — |
| 파일 크기(바이트) | `byte_size` | `bigint` | 불가 | > 0 |
| 음성 길이(밀리초) | `duration_ms` | `bigint` | 불가 | > 0 |
| 저장 시각 | `created_at` | `timestamptz` | 불가 | — |

모든 음성은 하나의 고정 버킷에 저장한다. 버킷 이름은 서버 설정에서 관리하며 DB 컬럼으로 저장하지 않는다. 프리픽스는 object_key에 포함하며 별도 컬럼을 두지 않는다.

질문 음성 객체 키 예시: `questions/{question_id}/{audio_id}.mp3`. 답변 음성 객체 키 예시: `answers/{answer_id}/{audio_id}.webm`. 확장자는 실제 음성 형식에 맞춘다. object_key는 버킷 안에서 유일하며 버킷 이름이나 전체 URL을 포함하지 않는다.

음성 파일은 저장 후 불변이다. 같은 음성을 질문과 답변 양쪽에 연결하지 않는다.

## 평가 보고서 (`evaluation_report`)

| 컬럼명(한글) | 컬럼명(영문) | 타입 | NULL 허용 | 제약 |
| --- | --- | --- | --- | --- |
| 보고서 ID | `report_id` | `uuid` | 불가 | PK |
| 평가 ID | `evaluation_id` | `uuid` | 불가 | FK → evaluation_session(evaluation_id); UNIQUE |
| 최종 평가 수준 | `final_level_code` | `proficiency_level_code` | 허용 | 평가 불가인 경우에만 NULL |
| 평가 판정 | `verdict` | `evaluation_verdict` | 불가 | — |
| 종합 평가 설명 | `summary` | `text` | 불가 | — |
| 보고서 생성 시각 | `created_at` | `timestamptz` | 불가 | — |

완료된 보고서만 저장한다. 평가당 보고서는 최대 하나다.

UNASSESSABLE이면 final_level_code는 NULL이고, CONFIRMED 또는 PROVISIONAL이면 NOT NULL이다.

보고서와 5개 항목 결과, 피드백을 같은 트랜잭션으로 저장하고 평가 상태를 COMPLETED로 갱신한다.

현재 수준은 회원 컬럼에 중복 저장하지 않는다. 인증 응답의 currentLevelCode는 CONFIRMED 보고서 중 평가 시작 시각이 가장 최근인 결과를 조회한다. 동률이면 보고서 생성 시각과 report_id 내림차순으로 결정한다. PROVISIONAL·UNASSESSABLE은 조회 대상에서 제외한다. 확정 보고서가 없으면 NULL이다.

## 평가 항목 결과 (`criterion_result`)

| 컬럼명(한글) | 컬럼명(영문) | 타입 | NULL 허용 | 제약 |
| --- | --- | --- | --- | --- |
| 항목 결과 ID | `result_id` | `uuid` | 불가 | PK |
| 보고서 ID | `report_id` | `uuid` | 불가 | FK → evaluation_report(report_id); 복합 UNIQUE ① |
| 평가 항목 코드 | `criterion_code` | `assessment_criterion_code` | 불가 | 복합 UNIQUE ① |
| 항목 점수 | `score` | `numeric(8,3)` | 허용 | 부족 사유와 정확히 하나만 값 존재 |
| 평가 데이터 부족 사유 | `insufficient_reason` | `text` | 허용 | 점수와 정확히 하나만 값 존재 |
| 항목 판단 이유 | `rationale` | `text` | 불가 | — |

복합 UNIQUE ①: `(report_id, criterion_code)`.

보고서마다 5개 평가 항목을 각각 한 행으로 저장한다. 점수는 0~100 정수이며 DB CHECK와 도메인에서 검증한다. 점수가 있는 항목은 근거·피드백 각 1~3개, 부족 항목은 근거·피드백 없이 사유를 저장한다.

## 평가 피드백 (`criterion_feedback`)

| 컬럼명(한글) | 컬럼명(영문) | 타입 | NULL 허용 | 제약 |
| --- | --- | --- | --- | --- |
| 피드백 ID | `feedback_id` | `uuid` | 불가 | PK |
| 항목 결과 ID | `result_id` | `uuid` | 불가 | FK → criterion_result(result_id); 복합 UNIQUE ① |
| 피드백 순서 | `feedback_no` | `integer` | 불가 | 복합 UNIQUE ①; > 0 |
| 피드백 종류 | `feedback_kind` | `feedback_kind` | 불가 | — |
| 개선 제안 또는 수정 표현 | `suggestion` | `text` | 불가 | — |
| 제안 이유 | `explanation` | `text` | 불가 | — |

복합 UNIQUE ①: `(result_id, feedback_no)`.

## 평가 근거 (`criterion_evidence`)

| 컬럼 | 타입 | 제약 |
| --- | --- | --- |
| result_id | uuid | FK → criterion_result; 복합 PK ① |
| answer_id | uuid | FK → answer; 복합 PK ① |
| evidence_no | integer | > 0; 복합 UNIQUE ② |
| explanation | text | 필수; 근거 연결 설명 |

PK ①=(result_id, answer_id), UNIQUE ②=(result_id, evidence_no). 항목당 최대 3개 답변 전체 음성을 참조한다. 질문·평가·음성 ID·전사·길이는 중복 저장하지 않는다. 전체 음성 범위는 0~audio_asset.duration_ms로 조회 시 계산한다. 해당 보고서의 평가에 속한 답변인지 쓰기 트랜잭션에서 확인한다.

## ENUM 허용값

| 타입 | 허용값 |
| --- | --- |
| `account_state` | `ACTIVE`, `DISABLED` |
| `proficiency_band_code` | `BEGINNER`, `INTERMEDIATE`, `ADVANCED` |
| `proficiency_level_code` | `BEGINNER_LOW`, `BEGINNER_MID`, `BEGINNER_HIGH`, `INTERMEDIATE_LOW`, `INTERMEDIATE_MID`, `INTERMEDIATE_HIGH`, `ADVANCED_LOW`, `ADVANCED_MID`, `ADVANCED_HIGH` |
| `evaluation_status` | `READY`, `IN_PROGRESS`, `PAUSED`, `ENDING`, `ANALYSIS_PENDING`, `ANALYZING`, `COMPLETED`, `ANALYSIS_FAILED` |
| `evaluation_end_reason` | `USER_ENDED`, `TIME_LIMIT`, `PAUSE_EXPIRED`, `SUFFICIENT_EVIDENCE` |
| `answer_processing_status` | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` |
| `evaluation_verdict` | `CONFIRMED`, `PROVISIONAL`, `UNASSESSABLE` |
| `assessment_criterion_code` | `VOCABULARY`, `GRAMMAR`, `PRONUNCIATION`, `FLUENCY`, `RELEVANCE` |
| `feedback_kind` | `IMPROVEMENT`, `EXPRESSION_CORRECTION` |

평가 항목 표시명은 어휘·문법·발음·유창성·답변 적절성이다. 수준은 초급·중급·고급 각각 하·중·상 9개다. 이름과 판정 규칙은 코드에서 관리한다.

## 기본 처리 규칙

AI 처리는 서버·큐에서 실행하고 필요한 현재 처리 상태는 평가 세션과 답변에 저장한다. 회원의 현재 수준은 확정 보고서 관계에서 조회한다. 파생 값·집계 컬럼과 운영 이력 테이블을 추가하지 않는다.

동시 상태 변경과 보고서 생성은 평가 행 잠금과 트랜잭션으로 보호한다. 행 내부 조건은 CHECK, 교차 테이블 조건은 쓰기 경계에서 검증한다. 기준은 현재 10개 정규화 테이블과 보고서 구현 계획이다.
