#!/bin/bash
# 테스트 실행 — Node 18+ 내장 node:test 사용 (의존성 0)
# 사용법:
#   bash test/run.sh                 # 전체 (unit + integration)
#   bash test/run.sh unit             # 단위 테스트만 (빠름, ~100ms)
#   bash test/run.sh integration      # 통합 테스트만 (서버 spawn, ~3초)
#   bash test/run.sh test/unit/maskSecrets.test.js   # 특정 파일만

set -e
cd "$(dirname "$0")/.."

MODE="${1:-all}"

case "$MODE" in
  unit)
    echo "🧪 단위 테스트"
    node --test test/unit/
    ;;
  integration)
    echo "🧪 통합 테스트 (서버 child spawn, 포트 54399)"
    node --test test/integration/
    ;;
  all|"")
    echo "🧪 전체 테스트 (unit + integration)"
    node --test test/unit/ test/integration/
    ;;
  *)
    echo "🧪 $* 실행"
    node --test "$@"
    ;;
esac
