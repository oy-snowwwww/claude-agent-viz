#!/bin/bash
# Claude Agent Orchestrator
# 사용법:
#   claude-agents          수동 실행 (서버 시작 + 브라우저 열기)
#   claude-agents on       세션 시작 시 자동 실행 켜기
#   claude-agents off      세션 시작 시 자동 실행 끄기
#   claude-agents stop     서버 종료
#   claude-agents status   현재 상태 확인

DIR="$(cd "$(dirname "$0")" && pwd)"
ENABLED_FILE="$DIR/enabled"
SESSIONS_DIR="$DIR/sessions"
PORT="${AGENT_VIZ_PORT:-54321}"

mkdir -p "$SESSIONS_DIR"

case "${1:-}" in
  on)
    touch "$ENABLED_FILE"
    echo "  ✅ 자동 실행 ON — 다음 세션부터 자동으로 시작됩니다"
    ;;
  off)
    rm -f "$ENABLED_FILE"
    echo "  ⬚ 자동 실행 OFF"
    ;;
  stop)
    rm -f "$SESSIONS_DIR"/* 2>/dev/null
    if lsof -ti:$PORT >/dev/null 2>&1; then
      kill $(lsof -ti:$PORT) 2>/dev/null
      echo "  ⏹ 서버 종료됨 (port $PORT)"
    else
      echo "  서버가 실행 중이 아닙니다"
    fi
    ;;
  status)
    if lsof -ti:$PORT >/dev/null 2>&1; then
      echo "  🟢 서버 실행 중 — http://localhost:$PORT"
    else
      echo "  ⚫ 서버 꺼짐"
    fi
    if [ -f "$ENABLED_FILE" ]; then
      echo "  ✅ 자동 실행: ON"
    else
      echo "  ⬚ 자동 실행: OFF"
    fi
    # 활성 세션 수
    ALIVE=0
    for f in "$SESSIONS_DIR"/*; do
      [ -f "$f" ] || continue
      PID=$(basename "$f")
      if kill -0 "$PID" 2>/dev/null; then
        ALIVE=$((ALIVE+1))
      fi
    done
    echo "  📟 활성 세션: ${ALIVE}개"
    ;;
  register)
    # SessionStart에서 호출 — 세션 PID 등록
    PPID_VAL="${2:-$$}"
    touch "$SESSIONS_DIR/$PPID_VAL"
    ;;
  unregister)
    # 세션 종료 시 호출
    PPID_VAL="${2:-$$}"
    rm -f "$SESSIONS_DIR/$PPID_VAL"
    ;;
  auto)
    # SessionStart hook에서 호출됨
    if [ ! -f "$ENABLED_FILE" ]; then
      exit 0
    fi

    # 세션 PID 등록 (부모 프로세스 = Claude 세션)
    touch "$SESSIONS_DIR/$PPID"

    # 서버가 이미 실행중이면 세션 등록만 하고 끝
    if lsof -ti:$PORT >/dev/null 2>&1; then
      exit 0
    fi

    # 서버 시작 + 브라우저 열기
    nohup node "$DIR/server.js" >> /tmp/agent-viz-server.log 2>&1 &
    sleep 1
    open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null
    ;;
  *)
    # 수동 실행
    if lsof -ti:$PORT >/dev/null 2>&1; then
      echo "  이미 실행 중 — 브라우저를 엽니다"
      open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null
    else
      echo ""
      echo "  🚀 Claude Agent Orchestrator 시작..."
      echo ""
      nohup node "$DIR/server.js" >> /tmp/agent-viz-server.log 2>&1 &
      sleep 1
      open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null
      echo "  🟢 http://localhost:$PORT"
      echo "  종료: claude-agents stop"
    fi
    ;;
esac
