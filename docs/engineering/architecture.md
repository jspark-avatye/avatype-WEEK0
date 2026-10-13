# Architecture? Governance?
---

## Tech Stack

### Core
- TypeScript

### 모노레포

Turborepo와 pnpm workspace를 사용하며 저장소 및 워크스페이스 패키지는 `root` / `@root/*` 네임스페이스를 따른다.

- `apps/web` — React 브라우저 클라이언트
- `apps/api` — NestJS 모듈형 모놀리스
- `packages/trpc-contract` — React와 WAS가 공유하는 tRPC 라우터 타입 계약
- `packages/database` — PostgreSQL Prisma ORM 스키마·클라이언트

의존성과 작업 실행은 저장소 루트에서 관리하고, 앱 간 빌드 순서는 Turborepo task graph가 관리한다. 개발용 PostgreSQL·Redis·MinIO는 루트 `docker-compose.yml`로 실행한다. Prisma 모델은 [정규화 ERD](./erd.md)를 기준으로 작성한다.

### 실행 및 저장 환경
- Docker compose
- MinIO

### WAS
- node, NestJS
- tRPC: React 클라이언트와 WAS 간 RPC 통신 및 프로시저 라우팅

### Client
- React

### DB
- PostgreSQL
- Redis(Pub/Sub, BullMQ)

관계형 데이터 모델은 [정규화 ERD](./erd.md)와 [DBML 스키마](./erd.dbml)를 따른다. 반정규화 없이 포트의 입출력 계약에 필요한 데이터를 관계로 저장하고, 집계·파생 값은 조회 시 계산한다.

같은 후보키에 종속되는 단일값 속성은 함께 저장하고, 반복 관계와 공유되는 사실은 분리한다. 테이블별 유지·통합·삭제 근거는 [ERD 전수 검토](./erd_review.md)에 기록한다.


## client Architecture

FSD 아키텍처 베이스

UI계층은 Atomic하게 설계할 것.

- 설계 이유
    - UI 재발명문제를 최소화.
    - 유지보수성과 확장성 고려

## WAS Architecture

NestJS의 기본형 모듈형 모놀리스 베이스

각 모듈별 헥사고날 설계

- 설계 이유
    - 모듈간 결합도를 낮추고, 응집도를 향상.
    - 테스트 로직과 애플리케이션 로직을 분리.
    - 유지보수성 강화

### 내부 영역과 Infrastructure의 정의

이 프로젝트에서 Infrastructure(인프라)는 내부 영역(내부 도메인)을 제외한 모든 부분으로 정의한다.

- 내부 영역은 비즈니스 규칙과 상태, 유스케이스 구현, 인바운드·아웃바운드 포트 및 입출력 계약을 포함한다. 현재 문서의 Application Service와 Domain은 모두 내부 영역에 속한다.
- Infrastructure는 tRPC Router/Procedure, Controller, DB·저장소·메시징·AI 연동 어댑터 등 모든 외부 어댑터와 React 클라이언트, 외부 시스템, 실행·배포 환경을 포함한다.
- 내부 영역은 Infrastructure의 구체적인 구현에 의존하지 않는다. Infrastructure는 내부 영역이 공개한 포트와 계약을 통해 내부와 상호작용한다.

여기서 ‘내부 도메인’은 내부 영역 전체를 가리킨다. 아래 구성 요소의 `Domain`은 그 내부에서 비즈니스 규칙과 상태를 담당하는 부분을 뜻한다.

### Port의 정의

이 프로젝트에서 Port(포트)는 내부 영역을 외부에 노출하는 공개된 API로 정의한다. 내부 영역이 공개할 기능과 상호작용 계약을 정의하며, 내부 구현과 상태는 캡슐화한다.

- 인바운드 포트는 외부 어댑터가 내부 영역의 유스케이스를 실행하기 위한 공개 API이다. 내부의 Application Service가 이를 구현한다.
- 아웃바운드 포트는 내부 영역이 외부에 요구하는 기능을 공개한 API 계약이다. 외부 어댑터가 이를 구현하고, 내부 영역은 해당 계약을 통해 외부 기능을 사용한다.
- 포트는 내부 영역이 소유하고 정의한다. 공개 범위는 포트와 그 입출력 계약으로 제한하며, 외부 어댑터는 내부 구현에 직접 접근하지 않는다.
- 여기서 API는 코드 수준의 인터페이스와 호출 계약을 포함한다. HTTP 엔드포인트나 tRPC 프로시저는 이 계약을 외부 통신 방식에 연결하는 어댑터에 속한다.

### tRPC 및 요청 처리 구조

클라이언트와 WAS 간 통신은 tRPC를 사용한다. tRPC Router/Procedure는 NestJS Controller로 요청을 전달하고, Controller가 인바운드 포트를 통해 Application Service를 호출한다.

```text
React Client
  → tRPC Router/Procedure
  → NestJS Controller
  → Inbound Port (유스케이스 계약)
  → Application Service (유스케이스 구현)
  → Domain (비즈니스 규칙)
```

tRPC Router/Procedure와 Controller는 함께 인바운드 어댑터를 구성한다. tRPC에서 Application Service를 직접 호출하지 않는다.

| 구성 요소 | 책임 |
| --- | --- |
| tRPC Router/Procedure | 프로시저 라우팅, 입력 형식 검증, 인증 컨텍스트 구성 및 인증 확인, RPC 오류 변환 |
| NestJS Controller | 요청을 유스케이스 입력으로 변환, 인바운드 포트 호출, 결과를 응답 데이터로 변환 |
| Inbound Port | 평가 시작·답변 제출·보고서 조회 등 내부 유스케이스를 외부에 노출하는 공개 API와 입력·출력 계약 정의 |
| Application Service | 인바운드 포트 구현, 유스케이스 흐름과 트랜잭션 조율, 사용자 소유권 확인 |
| Domain | 평가 상태 전이, 답변 접수 가능 여부, 종료 조건 등 비즈니스 규칙 |
| Outbound Port | 데이터 저장, 음성 파일 접근, AI 처리 요청 등 내부 영역이 외부에 요구하는 기능의 공개 API 계약 정의 |
| Outbound Adapter | PostgreSQL, MinIO, Redis/BullMQ, AI 서비스 등 외부 기술 연동 구현 |

### 내부 도메인 캡슐화

내부 도메인의 비즈니스 규칙과 상태는 캡슐화한다. 외부 어댑터에는 필요한 포트와 입출력 계약만 공개하며, 도메인 내부 모델과 구현을 직접 노출하지 않는다.

- Controller 등 인바운드 어댑터는 인바운드 포트를 통해 유스케이스를 실행한다. 도메인 내부 구현을 직접 호출하여 유스케이스 흐름을 우회하지 않는다.
- 도메인 상태는 비즈니스 규칙을 검증하는 도메인 동작을 통해서만 변경한다. 내부 상태를 외부에서 직접 수정할 수 있는 공개 필드나 무조건적인 setter를 제공하지 않는다.
- 포트의 입력·출력에는 명시적인 계약 타입을 사용한다. 응답에 변경 가능한 도메인 객체를 그대로 반환하지 않는다.
- 아웃바운드 어댑터에는 포트 계약 수행에 필요한 데이터만 전달한다. 저장·복원 과정에서도 도메인의 불변 조건을 우회하여 업무 상태를 변경하지 않는다.
- 도메인은 DB, tRPC 및 기타 외부 인프라의 구체적인 구현을 알지 않는다. 외부 구현 교체가 도메인의 비즈니스 규칙 변경으로 이어지지 않도록 한다.

### 헥사고날 의존성 규칙

- 인바운드 포트와 아웃바운드 포트는 애플리케이션 내부에 정의한다. Controller는 인바운드 포트에 의존하고, Application Service는 해당 포트를 구현한다.
- Application Service는 Domain과 아웃바운드 포트에 의존한다. 외부 기능 호출은 아웃바운드 포트를 통해 수행하며 구체적인 어댑터에 직접 의존하지 않는다.
- 아웃바운드 어댑터가 아웃바운드 포트를 구현한다. NestJS 모듈의 DI 설정에서 포트와 구현체를 연결한다.
- Application Service와 Domain은 tRPC Context, TRPCError, HTTP Request/Response 등 통신 계층 타입에 의존하지 않는다. Domain은 NestJS 및 외부 인프라에도 의존하지 않는다.
- Controller에는 비즈니스 규칙을 구현하지 않는다. 통신 계층의 입력 검증과 별개로 비즈니스 규칙은 Application Service와 Domain에서 보장한다.

외부 연동의 실행 흐름과 코드 의존성은 구분한다.

```text
실행 흐름: Application Service → Outbound Port → Outbound Adapter → 외부 시스템
코드 의존성: Application Service → Outbound Port ← Outbound Adapter
```

### NestJS 요청 처리 적용 규칙

tRPC에서 Controller 메서드를 일반 함수로 직접 호출하는 경우, NestJS의 HTTP 라우팅 파이프라인을 통과하는 것으로 간주하지 않는다. Controller에 선언된 Guard, Pipe, Interceptor, Exception Filter가 자동 적용된다고 가정하지 않는다.

- 인증 및 입력 형식 검증은 tRPC middleware/procedure에서 명시적으로 실행한다.
- 사용자 소유권 및 비즈니스 조건은 Application Service와 Domain에서 확인한다.
- 애플리케이션 오류를 tRPC 오류로 변환하는 처리는 인바운드 어댑터에서 수행한다.
- NestJS 요청 처리 기능이 필요한 경우에는 해당 기능이 실행되도록 별도 연동하고 검증한다.

참고: [tRPC Server Adapters](https://trpc.io/docs/server/adapters), [NestJS Guards](https://docs.nestjs.com/guards), [NestJS Interceptors](https://docs.nestjs.com/interceptors).

### JWT 인증 구조

- Access Token은 JWT로 발급하고 DB에 저장하지 않는다. tRPC 인증 경계에서 서명과 만료를 검증하고 `sub`로 회원을 확인한다.
- Refresh Token 회전, 서버 측 로그인 세션, 기기별 세션 폐기 및 토큰 재사용 탐지는 해커톤 범위에서 제외한다. 로그아웃은 클라이언트에서 Access Token을 삭제하며, 이미 발급된 토큰은 만료까지 유효할 수 있다.
- 내부 도메인에는 원본 JWT와 tRPC Context를 전달하지 않는다. 인증 어댑터는 검증된 사용자 식별자를 내부 계약으로 변환하며, 비즈니스 소유권은 유스케이스에서 확인한다. 상세 범위는 [정규화 ERD](./erd.md)의 해커톤 인증 범위를 따른다.

번들 파일이 400KiB를 넘지 않도록 할 것.
