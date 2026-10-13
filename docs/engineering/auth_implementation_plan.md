# 회원 인증 구현 계획

작성일: 2026-10-13. 이 문서는 인증 구현의 설계 기준이다. 코드와 마이그레이션은 작성했으며 실행 검증은 별도로 완료해야 한다. 기준은 [회원 기능 명세](../product/feature_list.md), [PRD](../product/PRD.md), [아키텍처](./architecture.md), [ERD](./erd.md)다.

## 1. 목표와 범위

`auth.signup`, `auth.login`, `auth.me`, `auth.refresh`, `auth.logout`을 브라우저부터 PostgreSQL까지 연결한다. 가입·로그인은 Access JWT와 Refresh Token을 발급하고, 새로고침 후 인증 복원, Access JWT 만료 후 갱신, 로그아웃까지 동작해야 한다. 기존 2일 해커톤 범위를 따른다. 별도 로그인 세션, 기기 관리, 토큰 회전 이력·재사용 탐지, 약관 동의, 감사 로그는 추가하지 않는다.

구현 시작 시 `packages/trpc-contract`에는 `health`만 있었고, Prisma 스키마에는 모델이 없었다. 현재 인증 계약·모델·API·화면을 추가했다. 기능 명세 하단의 `/api/auth/*` REST 경로 표는 `auth.*` tRPC 계약에 맞춰 정정했다.

## 2. 확정할 입출력과 기본 정책

| 항목 | 이번 구현의 기준 |
| --- | --- |
| 로그인 ID | 입력 양끝 공백 제거 후 소문자로 변환. `a-z`, `0-9`, `.`, `_`, `-`만 허용하고 길이는 4~32자. 정규화된 값에 DB UNIQUE 적용. 가입과 로그인에 같은 정규화 함수를 사용. |
| 비밀번호 | 8~128자. 앞뒤 공백을 포함해 입력 그대로 검사·해시하고, 확인값과 정확히 비교. 원문과 확인값은 저장·로그·응답에서 제외. |
| 계정 상태 | 생성 시 `ACTIVE`. `DISABLED`는 로그인·조회·갱신에서 거절. 상태 변경 UI는 이번 범위 밖. |
| Access JWT | `sub=user_id`, `iss=root-api`, `aud=root-web`, `iat`, `exp`. 서버의 한 가지 지정 알고리즘으로만 서명·검증. 기본 수명 15분. DB에는 저장하지 않음. |
| Refresh Token | 암호학적 난수 32바이트를 URL 안전 문자열로 인코딩. DB에는 SHA-256 해시만 저장. 기본 최초 수명 7일. 갱신 시 같은 행의 해시만 교체하고 최초 `created_at`·`expires_at`을 유지. |
| 비밀번호 해시 | Node `crypto.scrypt` 비동기 함수, 개별 난수 salt, 저장 형식에 알고리즘·비용·salt·결과를 포함. 비교 시 `timingSafeEqual`. 비용은 `N=2^15, r=8, p=3`으로 시작하고 실행 환경에서 확인. [OWASP 권고](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)를 기준으로 함. |
| 설정 | `JWT_ACCESS_SECRET`은 최소 32바이트 난수로 준비하고 API 시작 시 누락·길이 검사. `JWT_ACCESS_TTL_SECONDS`, `REFRESH_TOKEN_TTL_SECONDS`, `WEB_ORIGIN`을 서버 설정으로 관리. 운영값을 클라이언트 번들에 넣지 않음. |

JWT 서명·검증에는 `jose`를 사용한다. 검증 시 지정 알고리즘, 발급자, 대상, 만료, UUID 형식 `sub`를 모두 확인한다. [jose의 JWT 서명·검증 기능](https://github.com/panva/jose) 기준으로 API의 Node 실행 방식과 모듈 호환성을 구현 시 확인한다. Refresh Token은 JWT가 아닌 불투명 난수로 유지한다.

쿠키 이름은 `refresh_token`, 속성은 `HttpOnly; Secure; SameSite=Lax; Path=/trpc`로 통일하고 `Domain`은 지정하지 않는다. 발급·갱신·삭제에 같은 경로를 사용한다. 갱신 시 쿠키 `Max-Age`는 새로 7일을 부여하지 않고 DB에 남은 최초 만료 시간에 맞춘다. 로컬 브라우저는 `localhost:5173/trpc` 프록시를 통해 같은 출처로 요청한다. [MDN의 `Secure` localhost 예외와 쿠키 속성 설명](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)을 기준으로 로컬 브라우저에서 실제 설정·전송을 확인한다. 쿠키를 설정·사용하는 모든 `auth.*` mutation은 POST로 만들고 `Origin`을 허용된 `WEB_ORIGIN`과 대조한다.

웹은 Access Token을 메모리에만 보관하고 보호된 tRPC 요청의 `Authorization: Bearer` 헤더로 보낸다. Refresh Token 원문은 JavaScript에서 읽지 않는다. 기존 `httpBatchLink`는 인증 구현 시 `httpLink`로 교체하고, 쿠키를 쓰는 요청의 `credentials`를 `same-origin`으로 명시한다. 새로고침 시 쿠키로 `auth.refresh`를 한 번 요청한 뒤 `auth.me`로 계정 상태를 확인한다. 동시에 만료된 요청이 여러 개 발생해도 클라이언트 갱신 요청은 한 번만 보내며, 보호된 호출은 성공 시 한 번만 재시도한다. 가입·로그인·갱신·로그아웃에는 이 자동 재시도를 적용하지 않는다.

## 3. 계약과 계층별 책임

```text
React 인증 화면·상태
  → auth.* tRPC 프로시저 (입력 형식, JWT 검증, 쿠키·Origin 처리)
  → NestJS AuthController (입출력 변환, 토큰 발급)
  → 인바운드 포트 → AuthApplicationService (흐름·트랜잭션)
  → 계정/토큰 도메인 규칙 + 아웃바운드 포트
  → Prisma 저장소·비밀번호 해시 어댑터
```

tRPC는 Controller로 라우팅한다. Controller는 비즈니스 유스케이스를 인바운드 포트로만 호출하고 저장소를 직접 사용하지 않는다. 인바운드 포트와 아웃바운드 포트는 내부 영역이 소유한다. Application Service는 Domain과 아웃바운드 포트에 의존한다. Prisma 모델·tRPC Context·HTTP Request/Response·원본 JWT는 내부 도메인 공개 계약에 넣지 않는다. JWT 검증으로 얻은 `userId`를 내부 조회 입력으로 전달한다. Controller 쪽 인증 어댑터가 Refresh Token 난수를 만들고 원문을 해시로 변환한다. 인바운드 포트는 기존·신규 해시와 만료 시각만 받으며 원문 토큰은 받지 않는다. 유스케이스 성공 후 Controller가 Access JWT를 서명하고 tRPC 경계에서 쿠키를 설정한다. 따라서 원본 토큰은 내부 영역에 들어가지 않는다.

NestJS Controller 메서드는 기존 tRPC 어댑터에서 일반 함수로 호출되므로 `@UseGuards`나 Pipe가 자동 적용된다고 가정하지 않는다. 입력 검증은 tRPC 프로시저, JWT 검증은 인증 middleware, 계정 상태·토큰 유효성·소유권은 Application Service에서 다시 보장한다. 암호화/JWT 구현체의 구체 타입을 포트 밖으로 노출하지 않는다.

| 프로시저 | 입력 | 성공 응답 | 실패 규칙 |
| --- | --- | --- | --- |
| `auth.signup` mutation | `loginId`, `password`, `passwordConfirm` | 기본 사용자 정보, `accessToken`; Refresh 쿠키 설정 | 입력 오류 `BAD_REQUEST`, 중복 ID `CONFLICT` |
| `auth.login` mutation | `loginId`, `password` | 기본 사용자 정보, `accessToken`; Refresh 쿠키 설정 | ID 없음·비밀번호 불일치·비활성 계정에 동일한 `UNAUTHORIZED` 문구 |
| `auth.me` query | `Authorization: Bearer <JWT>` | `userId`, `loginId`, `currentLevelCode` | 서명·만료·클레임 오류 또는 비활성 계정 `UNAUTHORIZED` |
| `auth.refresh` mutation | Refresh 쿠키 | 새 `accessToken`; 새 Refresh 쿠키 설정 | 누락·무효·만료·폐기·비활성 계정·경합 패배 `UNAUTHORIZED`; 쿠키 삭제 |
| `auth.logout` mutation | Refresh 쿠키, 없을 수 있음 | `{ success: true }`; Refresh 쿠키 삭제 | 만료·폐기·누락 토큰도 성공 처리; DB 실패는 성공으로 위장하지 않음 |

기본 사용자 정보에는 비밀번호 해시, 토큰 원문·해시를 포함하지 않는다. 클라이언트에 보여주는 인증 실패 문구는 하나로 고정한다. 서버 내부 오류는 인증 실패로 위장하지 않는다.

## 4. 저장 모델과 유스케이스

Prisma에 ERD의 `user_account`와 `refresh_token`만 인증 기능에 필요한 모델로 추가한다. `user_id`·`token_id`는 UUID PK, `login_id`·`token_hash`는 각각 UNIQUE, `account_status`는 `ACTIVE|DISABLED` enum, `refresh_token.user_id`는 FK다. `created_at`, `expires_at`, `revoked_at`의 의미와 NULL 허용을 ERD와 일치시킨다. 마이그레이션에 `expires_at > created_at`, `revoked_at IS NULL OR revoked_at >= created_at` 제약을 둔다. 회원별 여러 Refresh Token 행을 허용한다. 정규화 원칙에 따라 파생된 만료 여부나 토큰 시도 횟수 컬럼은 추가하지 않는다.

1. **회원가입:** tRPC 기본 형식 검사 → Application Service에서 ID 정규화·형식·비밀번호 확인 검사 → 중복 사전 확인 → 비밀번호 scrypt 해시 → Controller가 준비한 신규 Refresh Token의 해시와 사용자 행을 한 DB 트랜잭션에 저장한다. DB UNIQUE 충돌도 `CONFLICT`로 변환해 동시 가입을 처리한다. 저장 성공 후 Controller가 Access JWT와 Refresh 쿠키를 응답한다. 응답·쿠키 전달에 실패해도 생성된 계정은 유지되므로 사용자는 로그인할 수 있다.
2. **로그인:** 정규화 ID로 조회 → 비밀번호 해시 검증 → `ACTIVE` 확인 → Controller가 준비한 Refresh Token의 해시로 토큰 행 생성 → Access JWT와 쿠키 전달. 존재하지 않는 ID, 틀린 비밀번호, 비활성 계정은 같은 상태·메시지로 응답한다. 토큰 행 저장 실패 시 토큰을 전달하지 않는다.
3. **인증 상태 조회:** middleware가 JWT 서명·만료·발급자·대상·클레임을 확인 → Controller가 검증된 `userId`를 인바운드 포트에 전달 → 현재 회원 행과 `ACTIVE` 확인 → 기본 정보 반환. JWT의 계정 상태 복사값은 신뢰하지 않는다.
4. **토큰 갱신:** Controller가 쿠키 원문을 해시로 변환하고 새 난수·해시를 준비 → Application Service가 해당 토큰 행·회원 조회 → `revoked_at IS NULL`, `expires_at > now`, 회원 `ACTIVE` 확인 → 트랜잭션 안에서 **기존 `token_hash`와 유효 조건을 WHERE에 포함한 조건부 UPDATE**로 같은 행의 해시를 교체한다. 영향받은 행이 1개일 때만 Controller가 새 Access JWT·Refresh 쿠키를 반환한다. 0개면 동시 갱신 패배 또는 무효 토큰으로 거절한다. `created_at`과 `expires_at`은 수정하지 않는다. 새 쿠키를 받지 못한 클라이언트는 재로그인한다.
5. **로그아웃:** Access JWT가 만료되어도 실행할 수 있도록 Refresh 쿠키만 사용한다. 해시가 가리키는 유효 행이 있으면 `revoked_at`을 기록한다. 누락·만료·이미 폐기된 토큰은 멱등 성공으로 처리한다. 서버는 동일 속성의 빈 쿠키로 삭제하고, 웹은 완료 응답 후 메모리 Access Token과 사용자 캐시를 지운다. 발급된 Access JWT는 자체 만료까지 유효할 수 있다.

## 5. 파일별 구현 순서

| 순서 | 대상 | 작업 및 완료 조건 |
| --- | --- | --- |
| 1 | `packages/database/prisma/schema.prisma`, 마이그레이션, `packages/database/src` | 계정·Refresh Token 모델, enum, UNIQUE·FK·CHECK 제약, Prisma 어댑터용 클라이언트 연결. 실제 PostgreSQL 마이그레이션 성공. |
| 2 | `packages/trpc-contract/src` | `auth.*` 입력·출력 타입과 런타임 입력 검증. 모든 프로시저가 AuthController를 호출하도록 연결. 계약 패키지에 DB·비밀번호 해시 구현은 넣지 않음. |
| 3 | `apps/api/src/module/auth` | 내부 Domain 규칙, 인바운드·아웃바운드 포트, Application Service, Prisma·비밀번호 해시 어댑터, 외부 토큰/JWT 어댑터, AuthController, Nest DI 구성. 기존 빈 `users` 골격은 중복 구현을 피하도록 정리. |
| 4 | `apps/api/src/trpc/trpc.controller.ts`, `apps/api/src/app.module.ts`, 설정 | tRPC Context에 AuthController와 요청·응답 경계 연결. Authorization·쿠키·Origin 처리, `WEB_ORIGIN`·JWT 설정 검증. 기존 `health` 동작 유지. |
| 5 | `apps/web/src/shared/api`, `apps/web/src/entities/user`, `apps/web/src/features/sign-in`, `sign-up`, `apps/web/src/pages`, `apps/web/src/app` | 메모리 Access Token, 단일 갱신 요청, 인증 복원, 로그인·가입 폼 및 오류 표시, 보호된 평가 홈 진입, 로그아웃. FSD 공개 API·의존 방향 준수. |
| 6 | `.env.example`, `docker-compose.yml`, 명세·README | TTL·서명 키·쿠키 설명, tRPC 경로 표기 정정, 로컬 실행 방법. 쿠키와 새 서버 설정이 실제 컨테이너에 전달되는지 확인. |

## 6. 검증과 완료 기준

자동 검증은 `lint`, `typecheck`, `build`, Prisma validate 및 PostgreSQL 마이그레이션이다. 인증 규칙은 단위 테스트보다 DB·HTTP 경계까지 포함한 통합 테스트에 우선순위를 둔다. 브라우저에서는 실제 `Set-Cookie` 속성과 새로고침 후 복원을 확인한다.

| 시나리오 | 기대 결과 |
| --- | --- |
| 가입 → 새로고침 → 조회 | 한 계정과 토큰 행이 저장되고, 원문 비밀번호·Refresh Token은 DB에 없으며, 쿠키로 인증이 복원됨 |
| 같은 ID 동시 가입 | 정규화 후 한 건만 성공, 나머지는 `CONFLICT` |
| 로그인 실패 종류 | ID 없음·오입력·비활성 계정에 동일한 공개 오류 메시지 |
| 잘못되거나 만료된 JWT, 비활성 계정 | `auth.me` 거절, 회원 정보 노출 없음 |
| 정상 갱신 | 새 Access JWT와 Refresh 쿠키 수신, DB의 같은 토큰 행에서 해시만 변경, 최초 만료 유지 |
| 같은 Refresh Token으로 동시 갱신 | 정확히 하나만 성공 |
| 무효·만료·폐기 토큰 또는 비활성 계정 갱신 | 갱신 거절, 새 Access JWT 미발급 |
| Access JWT 만료 후 로그아웃, 반복 로그아웃 | 토큰 폐기·쿠키 삭제; 반복 요청은 완료 응답; 이후 갱신 실패 |
| 잘못된 Origin의 인증 mutation | DB 변경과 토큰 발급 없이 거절 |
| 브라우저 전체 흐름 | 가입·로그인·새로고침 복원·만료 후 단일 갱신·로그아웃·재접근 차단 확인 |

참고: 이 계획에서 사용하는 쿠키 속성은 [MDN Set-Cookie 문서](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie), 비밀번호 해시 선택은 [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)를 따른다.
