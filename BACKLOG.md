# Backlog

코드 리뷰에서 나온 SHOULD/NIT 항목들 — 우선순위 낮음, 시간 날 때 처리.

## 🟡 SHOULD FIX

(비어 있음 — 모두 처리됨)

## 🔵 NIT

(비어 있음 — 모두 처리됨 또는 무해 판정)

## 🏗️ 향후 리팩토링 (별도 PR)

- [ ] **상태 관리 캡슐화** — 전역 객체(`sessions`, `sessionTrackers`, `liveInstances` 등) → `Session` 클래스로 이관
- [ ] **`index.html` 모듈 분리** — 인라인 메인 스크립트를 `js/sessions.js`, `js/timeline.js`, `js/log.js` 등으로 분할 (빌드 시스템 없이)
- [ ] **`handleLiveEvent()` 분리** — 거대한 switch를 개별 이벤트 핸들러 함수들로
- [ ] **테스트 자동화** — 현재는 시각적 확인 + `test-events.sh` 시뮬레이터. 단위 테스트 도입 검토

## 알려진 한계

- **세션당 최대 100 질문**: 그 이후 turn 별 통계는 누적 안 됨 (세션 합계는 정상)
- **세션 재시작 시 같은 세션이 여러 history 파일로 분리될 수 있음** (`/api/restart` 시점)
- **transcript 50MB 초과 시 응답 요약 추출 스킵** (방어 장치)
- **history 디렉토리 10MB 상한** (오래된 것부터 자동 삭제)
- **검색 결과 최대 50개** (스캔 범위 200개)
