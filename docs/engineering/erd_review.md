# ERD 테이블 전수 검토

검토일: 2026-10-13. [현재 ERD](./erd.md), [DBML](./erd.dbml). 초기 41개 설계를 단순화했으며, 현재는 **29개 테이블**이다. 이번 범위 조정에서 인증 세션·Refresh Token 테이블을 제거하고 Access JWT 인증으로 줄였다. 세션 재개와 AI 재시도는 유지한다. 앞선 요청으로 이미 삭제한 proficiency_band와 동의 테이블은 초기 41개에 포함되지 않는다.

## 통합·삭제 결과

| 대상 | 결과 |
| --- | --- |
| proficiency_level, assessment_criterion | 고정 ENUM 및 코드 매핑으로 대체 |
| evaluation_session + evaluation_start + evaluation_end | evaluation_session |
| question_generation_task + question | question |
| question_speech_task + question_audio | question_speech |
| speech_recognition_task + accepted_transcription | answer의 stt_job_id + accepted_stt_attempt_no |
| turn_assessment_task + turn_assessment | turn_assessment |
| final_analysis_task + evaluation_report | evaluation_analysis |

초기 검토에서 고정 코드 테이블 2개와 7쌍의 1:1 통합으로 9개를 줄였고, 후속 검토에서 STT 연결 테이블 1개를 추가로 제거했다. 재시도·전사 구간·항목 결과·복수 근거·피드백 등의 반복 관계는 유지한다. JSON이나 집계 컬럼으로 테이블을 대체하지 않았다.

## 41개 테이블별 판정

| 기존 테이블 | 판정 | 현재 위치 | 이유 |
| --- | --- | --- | --- |
| `user_account` | 유지 | `user_account` | 회원 한 명의 계정 속성만 저장한다. 인증 토큰은 저장하지 않는다. |
| `auth_session` | 삭제 | 제외 | 해커톤에서는 기기별 로그인 세션·서버 측 폐기가 필요하지 않다. |
| `refresh_token` | 삭제 | 제외 | 토큰 갱신·회전·재사용 탐지는 구현 범위에서 제외한다. |
| `proficiency_level` | 삭제 | ENUM·코드 매핑 | 9개 고정 ENUM과 코드 매핑으로 충분하다. 구간·하위 수준·표시명을 DB에 중복 관리하지 않는다. |
| `evaluation_topic` | 유지 | `evaluation_topic` | 운영자가 관리하는 주제의 이름·설명을 여러 평가가 공유한다. |
| `assessment_criterion` | 삭제 | ENUM·코드 매핑 | 항목 5개와 표시명이 고정되었다. ENUM과 표시 코드로 관리한다. |
| `rubric_version` | 유지 | `rubric_version` | 독립적으로 버전 관리하는 평가 기준이다. 여러 운영 정책에서 같은 기준을 사용할 수 있다. |
| `rubric_criterion` | 유지 | `rubric_criterion` | 기준 버전별 5개 항목의 점수 범위·채점 규칙이다. 고정 코드명 테이블과 다르다. |
| `rubric_level` | 유지 | `rubric_level` | 기준 버전별 9개 수준의 판정 설명이다. 수준 ENUM만으로 대체할 수 없는 버전별 데이터다. |
| `evaluation_policy` | 유지 | `evaluation_policy` | 최대 시간·재개·종료 규칙은 평가 기준과 다른 변경 주기를 가진다. |
| `policy_retry_rule` | 유지 | `policy_retry_rule` | 정책별로 다섯 작업의 재시도 설정이 반복된다. 작업별 설정을 행으로 유지한다. |
| `evaluation_session` | 통합 | `evaluation_session` | 시작·종료 속성을 같은 평가 행에 모은다. 모든 속성이 evaluation_id에 종속된다. |
| `evaluation_start` | 통합 | `evaluation_session` | 평가당 단일 started_at이므로 evaluation_session의 nullable 속성으로 통합한다. |
| `evaluation_end` | 통합 | `evaluation_session` | 평가당 단일 ended_at·end_reason이므로 evaluation_session에 통합한다. |
| `evaluation_pause` | 유지 | `evaluation_pause` | 한 평가에서 여러 차례 보류·재개가 발생한다. 단일 paused_at으로 합치면 구간을 잃는다. |
| `audio_asset` | 유지 | `audio_asset` | DB 접수 전에 업로드될 수 있는 독립 파일 자원이다. 사용자 음성과 TTS가 같은 저장 메타데이터 구조를 사용한다. |
| `ai_model_version` | 유지 | `ai_model_version` | 여러 실행이 모델 버전을 공유한다. 공급자·모델·버전을 시도마다 반복하지 않는다. |
| `ai_job` | 유지 | `ai_job` | 다섯 작업 종류의 공통 식별자로 ai_attempt의 단일 FK 대상이다. 제거하려면 종류별 시도 테이블을 늘리거나 다형 참조가 필요하다. |
| `ai_attempt` | 유지 | `ai_attempt` | 작업마다 여러 번 실행할 수 있다. 실행 시각·모델·실패는 시도별 사실이다. |
| `question_generation_task` | 통합 | `question` | 동일 job_id의 질문 입력과 단일 질문 결과를 question에 통합한다. |
| `question` | 통합 | `question` | 질문 슬롯·입력과 단일 채택 결과를 함께 둔다. 결과 전에는 결과 속성만 NULL이다. |
| `question_criterion` | 유지 | `question_criterion` | 한 질문이 확인하려는 항목은 여러 개일 수 있다. intent 원문에 코드 목록을 숨겨 저장하지 않는다. |
| `question_speech_task` | 통합 | `question_speech` | 동일 TTS job_id의 입력과 결과를 question_speech에 통합한다. |
| `question_audio` | 통합 | `question_speech` | 단일 채택 음성 참조를 question_speech에 통합한다. 파일 메타데이터는 audio_asset에 유지한다. |
| `answer` | 통합 | `answer` | 답변 정보에 STT 작업 ID와 채택 시도 번호를 둔다. 재전송 식별자와 네트워크 복구 처리는 범위에서 제외한다. |
| `speech_recognition_task` | 통합 | `answer.stt_job_id` | 답변당 STT 작업이 하나이므로 별도 1:1 테이블 없이 answer에서 ai_job을 참조한다. |
| `transcript_segment` | 유지 | `transcript_segment` | 하나의 STT 시도에서 여러 타임스탬프·전사 구간이 생성된다. |
| `accepted_transcription` | 통합 | `answer.accepted_stt_attempt_no` | 답변당 채택 시도가 하나이므로 answer에 둔다. 시도별 전사 구간은 transcript_segment에 남긴다. |
| `turn_assessment_task` | 통합 | `turn_assessment` | 답변 분석 입력과 단일 판단을 turn_assessment에 통합한다. |
| `turn_assessment` | 통합 | `turn_assessment` | 작업 생성 시 입력을 저장하고 채택 시 결과 속성을 채운다. |
| `turn_observation` | 유지 | `turn_observation` | 분석 하나에 항목별 관측이 여러 개다. 최종 점수와 다른 시점·목적의 판단이다. |
| `audio_span` | 유지 | `audio_span` | 같은 발화 위치가 관측·최종 근거·피드백에서 재사용된다. 위치를 한 곳에서 관리한다. |
| `turn_observation_evidence` | 유지 | `turn_observation_evidence` | 관측과 발화 구간의 M:N 관계 및 그 연결의 설명이다. |
| `final_analysis_task` | 통합 | `evaluation_analysis` | 동일 job_id의 최종 분석 입력과 보고서 판단을 evaluation_analysis에 통합한다. |
| `evaluation_report` | 통합 | `evaluation_analysis` | 작업당 단일 채택 판정을 evaluation_analysis에 통합한다. 보고서 API는 채택 결과를 조회한다. |
| `criterion_result` | 유지 | `criterion_result` | 최종 분석마다 5개 항목 결과가 있다. 항목별 부족 사유·근거·피드백의 부모다. |
| `criterion_evidence` | 유지 | `criterion_evidence` | 항목 결과와 발화 구간의 M:N 관계다. 근거 위치를 결과 행에 배열로 넣지 않는다. |
| `criterion_feedback` | 유지 | `criterion_feedback` | 결과 하나에 여러 개선 제안이 존재한다. 근거 집합과 독립적이다. |
| `feedback_evidence` | 유지 | `feedback_evidence` | 피드백 하나가 여러 구간을 가리킬 수 있다. 임의로 1개로 제한하지 않는다. |
| `report_limitation` | 유지 | `report_limitation` | 최종 분석에서 여러 제약이 발생한다. 독립적인 코드와 발생 설명을 가진다. |
| `limitation_answer` | 유지 | `limitation_answer` | 제약 하나가 여러 답변에 적용될 수 있다. 같은 제약 설명을 답변마다 복사하지 않는다. |

## 적용 시 주의할 구조 변화

- question·question_speech·answer의 STT 작업·turn_assessment·evaluation_analysis는 미완료 상태에서도 존재한다. STT 완료 여부는 answer.accepted_stt_attempt_no IS NOT NULL로 판단한다.
- evaluation_analysis의 채택 결과와 다섯 criterion_result를 같은 트랜잭션으로 저장한다. 행 존재만으로 보고서를 게시하지 않는다.
- 선택적 결과 묶음에 CHECK를 추가한다. 작업 입력은 불변으로 유지하고 결과만 완료 시 채운다.
- NULL을 허용하는 UNIQUE를 전체 행의 후보키라고 설명하지 않는다. 미채택 question_speech.audio_id가 해당한다.
- 평가 상태는 세션의 시작·종료 속성과 작업의 채택·실행 사실에서 산출한다. 별도 상태 사본은 추가하지 않는다.
- 값을 이미 확정한 상태·분류는 ENUM으로 명시했다. 아직 목록이 없는 오류·평가 제약 코드는 TEXT로 유지했다.
- 실제 DB 마이그레이션은 실행하지 않았다. 타입·키·관계·조회 의미를 문서와 DBML에서 수정했다.
