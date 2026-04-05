#!/bin/bash
# Claude Code Hook Handler
PORT=54321
EVENT_TYPE="${1:-unknown}"

SESSION_CWD="$(pwd 2>/dev/null || echo '')"
SESSION_NAME="$(basename "$SESSION_CWD" 2>/dev/null || echo 'unknown')"

# 세션 고유 ID: PPID의 TTY (같은 터미널 = 같은 TTY)
SESSION_ID="$(ps -o tty= -p $PPID 2>/dev/null | tr -d ' \n')"
SESSION_ID="${SESSION_ID:-unknown}"

if [ -n "$CLAUDE_SESSION_NAME" ]; then
  SESSION_NAME="$CLAUDE_SESSION_NAME"
fi

INPUT=$(cat 2>/dev/null || echo '{}')

# stdin에서 Claude session_id 추출 (메인 세션 vs 에이전트 세션 구분용)
SID=$(echo "$INPUT" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4)
SID="${SID:-}"

PAYLOAD="{\"event\":\"$EVENT_TYPE\",\"session\":{\"pid\":\"$SESSION_ID\",\"cwd\":\"$SESSION_CWD\",\"name\":\"$SESSION_NAME\",\"sid\":\"$SID\"},\"data\":$INPUT}"

if [ "$EVENT_TYPE" = "session_start" ]; then
  for i in 1 2 3 4 5; do
    RESULT=$(curl -s -m 1 -o /dev/null -w "%{http_code}" -X POST "http://localhost:$PORT/api/events" \
      -H 'Content-Type: application/json' \
      -d "$PAYLOAD" 2>/dev/null)
    if [ "$RESULT" = "200" ]; then
      exit 0
    fi
    sleep 1
  done
elif [ "$EVENT_TYPE" = "session_end" ]; then
  echo "$(date) session_end id=$SESSION_ID sid=$SID cwd=$SESSION_CWD" >> /tmp/agent-viz-debug.log
  curl -s -m 3 -X POST "http://localhost:$PORT/api/events" \
    -H 'Content-Type: application/json' \
    -d "$PAYLOAD" \
    >/dev/null 2>&1 || true
else
  # agent_start/done 디버그
  echo "$(date) $EVENT_TYPE id=$SESSION_ID data=$(echo "$INPUT" | head -c 1000)" >> /tmp/agent-viz-debug.log
  curl -s -m 3 -X POST "http://localhost:$PORT/api/events" \
    -H 'Content-Type: application/json' \
    -d "$PAYLOAD" \
    >/dev/null 2>&1 || true
fi
