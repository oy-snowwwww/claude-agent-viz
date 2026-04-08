#!/bin/bash
# 단위 테스트 실행 — Node 18+ 내장 node:test 사용 (의존성 0)
# 사용법:
#   bash test/run.sh           # 전체 단위 테스트
#   bash test/run.sh unit/maskSecrets.test.js   # 특정 파일만

set -e
cd "$(dirname "$0")/.."

if [ $# -eq 0 ]; then
  echo "🧪 전체 단위 테스트 실행"
  node --test test/unit/
else
  echo "🧪 $* 실행"
  node --test "$@"
fi
