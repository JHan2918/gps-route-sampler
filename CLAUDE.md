# GPS 경로 좌표 도구 (gps-route-sampler)

측량·계측 현장용 웹 도구. 네이버 지도에서 경로를 그리거나 CSV를 불러와, 일정 간격의
조사 지점 좌표를 생성하고 CSV로 내보낸다.

## 실행

```bash
pnpm install
pnpm dev      # next dev
pnpm build    # next build
pnpm lint
```

Node 22.13 이상, pnpm 사용. npm/yarn으로 설치하지 말 것 (`pnpm-lock.yaml` 기준).

## 구조

| 경로 | 역할 |
|---|---|
| `app/page.tsx` | 루트 `/` — "서비스 일시 중단" 안내 화면. 실제 도구가 아님 |
| `app/gps/page.tsx` | **본체.** 전체 기능이 이 한 파일(708줄)에 있는 클라이언트 컴포넌트 |
| `app/globals.css` | 전체 스타일. `page.tsx`의 className이 여기에 대응 |
| `worker/index.ts` | Cloudflare Worker 진입점 (vinext). 이미지 최적화 + 라우팅 |
| `build/sites-vite-plugin.ts` | 빌드 후 `.openai/hosting.json`과 `drizzle/`를 `dist/`로 복사 |
| `db/`, `drizzle/`, `examples/d1/` | D1 데이터베이스 스캐폴딩. **현재 미사용** (schema 비어 있음) |

## 도메인 로직 (`app/gps/page.tsx`)

좌표 변환 함수들이 파일 상단에 모여 있다. 외부 라이브러리 없이 직접 구현했다.

- `toUtm()` — WGS84 → UTM. WGS84 타원체, k0=0.9996
- `toKoreaCentral()` — WGS84 → **EPSG:5186** (한국 중부원점 TM).
  GRS80 타원체, 원점 위도 38°N / 경도 127°E, 가산값 E 200000 / N 600000, 축척계수 1.0
- `fromKoreaCentral()` — EPSG:5186 → WGS84. 해석해가 없어 **뉴턴법 반복**(최대 8회,
  허용오차 0.0001 m)으로 역산한다. 수정할 때 수렴 조건을 건드리지 말 것
- `distance()` / `bearing()` / `destination()` — 구면 삼각법. 지구 반지름 R = 6371008.8 m
- `createSamples()` — 경로를 `interval` 간격으로 샘플링. 누적거리·방위각 포함
- `samplesFromPoints()` — 불러온 좌표를 그대로 샘플로 변환 (재계산 없음)

### 작업 모드 (`WorkMode`)

- `test` — 기본값. 지도 클릭 시 그 지점의 위경도/UTM/EPSG:5186 표시
- `draw` — 클릭으로 폴리라인 경로 작성 → 간격 입력 → 조사 위치 계산
- `import` — CSV 불러오기. 파일의 좌표를 **그대로** 사용 (재샘플링하지 않음)

지도 도구(`MapTool`)는 작업 모드와 별개로 동작: `measure`(거리 측정), `coordinate`(좌표 확인).

### 서브포인트

각 기준점에서 진행방향 직각으로 일정 간격·개수만큼 생성하는 보조 측점.
이름 규칙은 `{기준점이름}-{번호}` (예: `t3-1`, `t3-2`). CSV를 다시 불러올 때
이 패턴으로 기준점과 서브포인트를 자동 구분한다.

### CSV 입출력

**출력 헤더 (고정, 순서 변경 금지):**
```
이름,구분,기준점,진행거리_m,직각방향,직각거리_m,위도,경도,Z_m,UTM_Zone,UTM_E_m,UTM_N_m,EPSG5186_E_m,EPSG5186_N_m
```
BOM(`﻿`) + CRLF로 저장한다. 엑셀에서 한글이 깨지지 않게 하는 조치이므로 제거하지 말 것.

**입력:** 헤더 이름을 정규화(공백·기호 제거, 소문자화)해서 유연하게 매칭한다.
한글/영문 별칭을 모두 받는다 (`위도`/`latitude`/`lat`/`y` 등).

**중요한 규칙:** 위경도와 EPSG:5186 N/E가 **둘 다** 있으면 **EPSG:5186을 원본으로** 삼아
위경도를 역산한다. 현장에서 EPSG:5186 값을 직접 보정하는 경우가 많기 때문이다.
이 우선순위를 바꾸면 현장 데이터가 틀어진다.

## 네이버 지도 API

- Client ID `gkiaj1k1r8`가 `page.tsx` 상단에 상수로 박혀 있다 (공개 저장소에 노출됨).
  네이버 Web Dynamic Map 키는 도메인 제한으로 보호되므로, 새 도메인에 배포하면
  네이버 클라우드 콘솔에서 **Web 서비스 URL 등록**이 필요하다
- SDK는 `next/script`로 `afterInteractive` 로드. `submodules=geocoder` 포함 (주소 검색용)
- 인증 실패 시 `window.navermap_authFailure`가 호출돼 화면에 오류를 띄운다
- 지도 객체는 모두 `useRef`로 관리한다. 리액트 상태로 옮기지 말 것 — 네이버 SDK 객체는
  직렬화 불가이고 리렌더마다 재생성되면 안 된다

## 배포

Cloudflare Workers + vinext. `vite.config.ts`가 Wrangler/Miniflare 설정을 담당한다.
D1(`d1`)과 R2(`r2`)는 `.openai/hosting.json`에서 `null`이라 비활성 상태다.
사용하려면 해당 필드에 바인딩 이름을 넣어야 한다.

주의: `next.config.ts`(Next 기본)와 `vite.config.ts`(Cloudflare 배포)가 공존하지만
`package.json` 스크립트는 `next dev`/`next build`만 쓴다. 빌드 경로가 일원화돼 있지 않다.

## Codex에서 인계받은 흔적

이 프로젝트는 원래 OpenAI Codex로 개발했다. 다음은 그 잔재다:

- `app/chatgpt-auth.ts` — ChatGPT 계정 로그인 헬퍼. **어디서도 import하지 않는다** (미사용)
- `.openai/hosting.json` — Codex 호스팅 설정. 빌드 플러그인이 `dist/`로 복사하므로
  Cloudflare 배포를 유지하려면 지우지 말 것
- `vite.config.ts`의 `CODEX_SANDBOX === "seatbelt"` 분기 — macOS Codex 프리뷰용 HMR 폴링
- `tests/rendered-html.test.mjs`의 `codex-preview` 메타 태그 검사

정리할지 여부는 사용자와 상의할 것. 특히 `.openai/hosting.json`은 빌드가 참조한다.

## 로그인·인증 (아직 없음, 추가 예정)

현재 `/gps`는 인증이 전혀 없다. 주소를 아는 누구나 접근하고, 그만큼 네이버 지도 API
할당량이 소모된다. 사용자는 나중에 로그인 페이지를 붙일 계획이다.

**계정 로그인 작업 규칙 — `app/chatgpt-auth.ts`를 재사용하지 말 것.**
이 파일은 ChatGPT 호스팅 환경이 넣어주는 `oai-authenticated-user-*` 헤더를 읽는 방식이라
Cloudflare 배포에서는 아무도 로그인한 것으로 인식되지 않는다. 계정 로그인 요청이 오면
**이 프로젝트 환경(Next.js + Cloudflare Workers)에 맞게 처음부터 새로 구현한다.**
기존 ChatGPT/Codex 인증 코드를 고쳐 쓰거나 흉내내지 않는다.

구현 방식(공용 비밀번호 / 계정별 로그인 / 사내 SSO)은 사용자가 정하기 전에 임의로
선택하지 않는다. 계정별로 가려면 현재 비활성인 D1을 켜야 한다 (`.openai/hosting.json`).

## 작업 규칙

- 사용자는 한국어로 소통한다. UI 문구, 주석, 커밋 메시지 모두 한국어
- 코드 스타일: 한 줄이 길어도 압축적으로 쓰는 기존 방식을 따른다 (특히 JSX)
- 좌표 변환 공식을 수정할 때는 반드시 알려진 지점으로 검산할 것.
  현장 측량에 쓰이므로 cm 단위 오차도 문제가 된다
- `/` 와 `/gps` 모두 `robots: noindex`다. 공개 검색에 노출하지 않는다
