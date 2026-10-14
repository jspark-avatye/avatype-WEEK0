# Web 구조

FSD의 Layer → Slice → Segment 구조를 사용한다. 실제 코드가 있는 슬라이스부터 만들며, 기능은 [구현 로드맵](../../../docs/engineering/implementation_roadmap.md)에 따라 추가한다.

```text
src/
├── main.tsx                         # React DOM 진입점
├── app/                             # 앱 구성; 슬라이스 없이 세그먼트 사용
│   ├── app.tsx
│   ├── index.ts
│   ├── providers/app-providers.tsx   # QueryClient·tRPC Provider
│   └── styles/index.css             # 전역 스타일·reset
├── pages/
│   ├── home/
│       ├── api/use-api-health.ts
│       ├── ui/home-page.tsx
│       ├── ui/home-page.css
│       └── index.ts                 # HomePage 공개 API
│   ├── login/                       # 로그인 화면
│   └── signup/                      # 회원가입 화면
├── widgets/
│   └── site-header/
│       ├── ui/
│       └── index.ts
├── features/                        # sign-in, sign-up, sign-out 및 후속 사용자 동작
├── entities/                        # user 인증 상태 및 후속 업무 모델
└── shared/                          # 업무 슬라이스 없이 기술별 세그먼트 사용
    ├── api/                         # 타입이 지정된 tRPC 클라이언트
    ├── config/                      # 환경 설정
    └── ui/button/                   # 공통 Button과 공개 API
```

## 의존성과 공개 범위

의존 방향은 `app → pages → widgets → features → entities → shared`다. 중간 레이어를 생략하고 더 아래 레이어를 참조할 수 있다. 같은 레이어의 서로 다른 슬라이스는 직접 참조하지 않는다. `app`과 `shared`의 세그먼트 간 참조는 허용한다.

- 슬라이스 밖에서는 공개 `index.ts`를 가져온다: `@/pages/home`, `@/widgets/site-header`.
- Shared는 세그먼트 또는 UI 컴포넌트의 공개 API로 가져온다: `@/shared/api`, `@/shared/ui/button`.
- 슬라이스 내부에서는 상대 경로로 가져온다: `../api/use-api-health`.
- 다른 슬라이스의 `ui`, `api`, `model` 내부 파일을 직접 가져오지 않는다.
- 자신의 공개 `index.ts`를 내부에서 다시 가져오지 않는다. 전체 레이어를 묶는 거대한 barrel 파일도 만들지 않는다.
- `@/`는 `apps/web/src`를 가리킨다. TypeScript와 Vite에 같은 alias를 설정한다.

## 코드를 놓는 기준

| 레이어 | 책임 | 이 프로젝트의 배치 기준 |
| --- | --- | --- |
| app | 앱 전체 구성 | Provider, 이후 라우팅, 전역 스타일 |
| pages | 화면 구성 | 홈, 인증 화면, 평가 화면, 보고서·기록 화면 |
| widgets | 독립된 화면 블록 | 여러 화면에서 사용하는 헤더, 이후 회화 패널 등 |
| features | 사용자의 동작 | 로그인, 음성 답변 제출, 평가 일시정지·재개, 분석 재시도 |
| entities | 업무 모델과 조회 | 사용자, 평가 진행 정보, 평가 보고서 |
| shared | 공통 기술과 기본 UI | tRPC 기반 연결, 환경 설정, Button 등 |

페이지에서만 사용하는 UI·조회 코드는 해당 페이지에 둔다. 업무별 API와 모델은 해당 슬라이스의 `api`·`model`에 두며, Shared에 모두 모으지 않는다. FE 슬라이스는 화면과 사용자 동작 기준이며 DB 테이블마다 만들지 않는다.

Atomic UI 방침은 `shared/ui`의 작은 공통 컴포넌트와 이를 조합하는 UI로 적용한다. 전체 프로젝트를 `atoms`, `molecules` 디렉터리로 다시 분류하지 않는다. 현재 Button은 업무 로직 없이 표준 button 속성과 스타일만 제공한다.

새 슬라이스에는 필요한 `ui`, `api`, `model`, `lib` 세그먼트만 만든다. 인증 슬라이스는 구현되었으며 각 디렉터리의 README는 후속 기능을 넣을 기준이다.

첫 질문 기능은 `pages/evaluation-setup`, `pages/evaluation`, `features/start-evaluation`, `entities/evaluation`에 배치한다. 음성 회화는 `features/submit-voice-answer`와 `features/control-evaluation`을 페이지에서 조합한다. 마이크 확인·녹음·음성 재생 기술은 `shared/lib/audio`가 제공한다. 로그인한 사용자는 홈·평가 설정·개별 평가 경로로 이동할 수 있다. 같은 feature 레이어의 슬라이스 간 직접 참조는 추가하지 않는다.

근거: [FSD 레이어와 의존 규칙](https://feature-sliced.design/docs/reference/layers), [FSD 공개 API](https://feature-sliced.design/docs/reference/public-api).
