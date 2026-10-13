# 기본 ERD 검토

검토일: 2026-10-13. [현재 ERD](./erd.md), [DBML](./erd.dbml). 기본 골격 8개에 Refresh Token을 포함한 아래 **9개 테이블**을 유지한다.

| 테이블명(한글) | 테이블명(영문) |
| --- | --- |
| 회원 계정 | `user_account` |
| 리프레시 토큰 | `refresh_token` |
| 평가 세션 | `evaluation_session` |
| 질문 | `question` |
| 답변 | `answer` |
| 음성 자원 | `audio_asset` |
| 평가 보고서 | `evaluation_report` |
| 평가 항목 결과 | `criterion_result` |
| 평가 피드백 | `criterion_feedback` |

질문 음성은 question.audio_id로, 전체 전사는 answer.transcript로 관리한다. 회원 현재 수준은 최신 확정 보고서의 수준을 반영한다.

음성은 단일 고정 버킷에 저장한다. 버킷 이름은 서버 설정에서 관리하고 audio_asset에는 프리픽스를 포함한 object_key만 저장하며 단독 UNIQUE를 적용한다.

Refresh Token 발급·갱신·폐기 및 동일 행의 토큰 해시 교체는 인증 범위에 포함한다. 별도 로그인 세션·회전 이력·기기 관리·재사용 탐지 테이블은 추가하지 않는다.

검토 항목: 테이블 9개, 토큰 해시 UNIQUE·원문 저장 금지, 질문당 답변 최대 1개, 평가당 보고서 최대 1개, 보고서당 항목 결과 정확히 5개, FK 삭제·갱신 RESTRICT. 상세 컬럼과 제약은 현재 ERD를 따른다. 실제 DB 마이그레이션은 실행하지 않았다.
