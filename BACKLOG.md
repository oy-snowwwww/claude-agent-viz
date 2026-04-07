# Backlog

코드 리뷰에서 나온 SHOULD/NIT 항목들 — 우선순위 낮음, 시간 날 때 처리.

## 🟡 SHOULD FIX

### 안정성
- [ ] **scrubHistoryPrompts 동기 I/O 블로킹** (`server.js`)
  - Privacy ON 시 디스크 정리가 동기 fs로 이벤트 루프 차단
  - `setImmediate` 또는 async fs API로 변경
- [ ] **thinking_start 없이 도착하는 이벤트 처리** (`server.js`)
  - recover 시나리오에서 tool_use/agent_start가 빈 turns 배열에 잘못 합산되거나 누락
  - 더미 turn 또는 orphan 카운터 도입
- [ ] **transcriptPath 저장 시점 검증** (`server.js:241`)
  - 현재는 read 시점에만 `isValidTranscriptPath` 검증
  - 저장 시점에도 검증해서 invalid path가 메모리에 머무는 것 방지

### UX
- [ ] **truncated 플래그 클라이언트 표시** (`index.html`)
  - 100개 질문 초과 시 UI에 "100+ (이후 생략됨)" 배지 표시
- [ ] **agent 필터 옵션 첫 무필터 응답에서만 채우기** (`index.html`)
  - 현재 캐시 누적 방식이지만 첫 로드 후엔 fix해도 됨
- [ ] **togglePrivacy confirm UX 개선** (`index.html`)
  - confirm 다이얼로그 ESC/외부 클릭 동작이 브라우저별로 달라 의도와 다른 결과 가능
  - 커스텀 모달로 변경 권장

### 정확도
- [ ] **maskSecrets — Bearer 토큰 false positive** (`server.js`)
  - `Bearer\s+[A-Za-z0-9._\-]{20,}` 가 일반 단어 매칭 가능
  - 컨텍스트 (Authorization 헤더) 기반으로 좁히기
- [ ] **isNoiseUserText — 멀티라인 wrapper** (`server.js`)
  - `<system-reminder>...</system-reminder>` 블록 strip 후 남은 텍스트 재검사
- [ ] **req.setEncoding('utf8') 누락** (`server.js:1275`)
  - 멀티바이트 chunk 경계 깨짐 방지

## 🔵 NIT

- [ ] `.gitignore` `sessions/`, `history/`, `/privacy` 표기 일관성 (anchor 통일)
- [ ] `isNoiseUserText`에 `<bash-input>`, `<bash-output>`, `<request_metadata>` 패턴 추가
- [ ] `saveAllTrackers()` 호출 후 `sessionTrackers = {}` 명시적 clear
- [ ] `highlight()` HTML entity 처리 검토 (`&` 검색 시)
- [ ] 손상된 history JSON 파일 자동 정리 또는 quarantine

## 🏗️ 향후 리팩토링 (별도 PR)

- [ ] **상태 관리 캡슐화** — 전역 객체 → Session 클래스
- [ ] **`index.html` 모듈 분리** — `js/sessions.js`, `js/timeline.js`, `js/history.js` 등으로 분할 (빌드 시스템 없이)
- [ ] **`handleLiveEvent()` 분리** — 거대한 switch를 작은 핸들러 함수들로
- [ ] **테스트 자동화** — 현재는 시각적 확인 + 시뮬레이터 기반. 단위 테스트 추가 검토

## 알려진 한계

- **세션당 최대 100 질문**: 그 이후 turn 별 통계는 누적 안 됨 (세션 합계는 정상)
- **세션 재시작 시 같은 세션이 여러 history 파일로 분리될 수 있음** (`/api/restart` 시점)
- **transcript 50MB 초과 시 응답 요약 추출 스킵** (방어 장치)
- **history 디렉토리 10MB 상한** (오래된 것부터 자동 삭제)
- **검색 결과 최대 50개** (스캔 범위 200개)
