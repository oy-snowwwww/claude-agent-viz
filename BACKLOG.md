# Backlog

코드 리뷰에서 나온 SHOULD/NIT 항목들 — 우선순위 낮음, 시간 날 때 처리.

## 🟡 SHOULD FIX

(비어 있음 — 모두 처리됨)

## 🔵 NIT

- [ ] **글로벌 툴팁에서 매우 긴 cwd 경로 클립보드 복사 UX 개선** (`public/js/utils.js`)
  - 이미 `copyCwd()`로 클릭 복사 구현됨 — 버튼식 별도 액션 추가 고려 (선택)
- [ ] **SSE ping SIGKILL 정리 불가** (`server.js:676~682`)
  - 비정상 종료는 OS가 정리하므로 실용상 OK. graceful 경로는 모두 커버됨

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
