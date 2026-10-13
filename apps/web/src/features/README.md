# Features

사용자가 수행하는 동작을 슬라이스로 구성한다. 현재 인증 기능에는 `sign-in`, `sign-up`, `sign-out`이 있다. 평가 기능을 구현할 때 아래 슬라이스를 추가한다.

- `submit-answer` — 녹음한 음성 답변 제출
- `pause-evaluation`, `resume-evaluation` — 평가 일시정지·재개
- `retry-analysis` — 실패한 분석 재실행을 요청하는 동작이 UI에 필요할 경우 추가

서버의 자동 분석 재시도만 있다면 `retry-analysis` UI 슬라이스를 만들지 않는다. 녹음 상태와 마이크 접근은 `submit-answer` 내부에서 필요한 `model`·`lib`로 시작한다.

슬라이스는 필요한 `ui`, `api`, `model`, `lib` 세그먼트와 공개 `index.ts`를 갖는다. 다른 feature를 직접 가져오지 않으며 여러 feature의 조합은 pages 또는 widgets에서 수행한다. 아직 구현되지 않은 평가 DTO나 상태를 미리 만들지 않는다.
