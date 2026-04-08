# Backlog

코드 리뷰에서 나온 SHOULD/NIT 항목들 — 우선순위 낮음, 시간 날 때 처리.

## 🟡 SHOULD FIX

### 안정성
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

### 정확도
- [ ] **maskSecrets — Bearer 토큰 false positive** (`server.js`)
  - `Bearer\s+[A-Za-z0-9._\-]{20,}` 가 일반 단어 매칭 가능
  - 컨텍스트 (Authorization 헤더) 기반으로 좁히기
- [ ] **isNoiseUserText — 멀티라인 wrapper** (`server.js`)
  - `<system-reminder>...</system-reminder>` 블록 strip 후 남은 텍스트 재검사
- [ ] **req.setEncoding('utf8') 누락** (`server.js:1275`)
  - 멀티바이트 chunk 경계 깨짐 방지

## 🔵 NIT

- [ ] **Tier 변경 시 캐릭터 위치 clamp** (`creature.js`)
  - `_applyTierClass` 시 `invalidateWsBoxCache`만 호출 → 한동안 bounds 밖 위치에 머무를 수 있음
  - 모든 캐릭터 x/y를 즉시 clamp하는 헬퍼 호출 검토
- [ ] **module-level setInterval 정리 일관성** (`server.js`)
  - `cleanHistory` (line 593), `checkSessions` (line 1620)는 `gracefulShutdown`에서 명시 clearInterval 안 됨
  - `process.exit(0)`가 정리하므로 실질 무해하나 `_ssePingInterval`만 명시 clear하는 것과 비일관
  - gracefulShutdown에 일괄 등록

- [ ] `.gitignore` `sessions/`, `history/`, `/privacy` 표기 일관성 (anchor 통일)
- [ ] `isNoiseUserText`에 `<bash-input>`, `<bash-output>`, `<request_metadata>` 패턴 추가
- [ ] `highlight()` HTML entity 처리 검토 (`&` 검색 시)
- [ ] 손상된 history JSON 파일 자동 정리 또는 quarantine
- [ ] **`updateHistMetaInfo`에 partial 응답 표시** (`public/js/history.js:51~66`)
  - 5초 timeout으로 `partial: true` 응답 시 UI에 "부분 결과" 배지
- [ ] **글로벌 툴팁에서 매우 긴 cwd 경로 클립보드 복사** (`public/js/utils.js`)
  - 칩 클릭 시 전체 경로를 clipboard에 복사하는 액션 추가 검토
- [ ] **SSE ping SIGKILL 정리 불가** (`server.js:676~682`)
  - 비정상 종료는 OS가 정리하므로 실용상 OK. graceful 경로는 모두 커버됨
- [ ] **light 테마일 때 우주 배경 가독성** (`village.js`, CSS)
  - `#080812` 고정이라 light 테마에서 대비 부조화. 사용자 피드백 수집 후 결정

## 🏗️ 향후 리팩토링 (별도 PR)

- [ ] **상태 관리 캡슐화** — 전역 객체 → Session 클래스
- [ ] **`index.html` 모듈 분리** — `js/sessions.js`, `js/timeline.js`, `js/history.js` 등으로 분할 (빌드 시스템 없이)
- [ ] **`handleLiveEvent()` 분리** — 거대한 switch를 작은 핸들러 함수들로
- [ ] **테스트 자동화** — 현재는 시각적 확인 + 시뮬레이터 기반. 단위 테스트 추가 검토
- [ ] **`environment.js` dead code 정리** — village(우주) 모드 항상 활성화 후 environment 토글/계절 함수가 사용되지 않음. `_envEnabled = false` 강제 + localStorage 마이그레이션만 남기고 나머지 함수 제거 검토

## 알려진 한계

- **세션당 최대 100 질문**: 그 이후 turn 별 통계는 누적 안 됨 (세션 합계는 정상)
- **세션 재시작 시 같은 세션이 여러 history 파일로 분리될 수 있음** (`/api/restart` 시점)
- **transcript 50MB 초과 시 응답 요약 추출 스킵** (방어 장치)
- **history 디렉토리 10MB 상한** (오래된 것부터 자동 삭제)
- **검색 결과 최대 50개** (스캔 범위 200개)
