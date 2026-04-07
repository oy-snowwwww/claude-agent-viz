# Claude Agent Orchestrator

Claude Code의 에이전트 활동을 실시간으로 시각화하는 로컬 대시보드입니다.
픽셀아트 캐릭터들이 에이전트의 상태를 표현하고, 워크스페이스에서 자율적으로 활동합니다.

> 💡 **설치가 귀찮다면?** 이 README를 Claude Code에게 보여주고 "설치해줘"라고 하면 됩니다.

https://github.com/user-attachments/assets/b3595469-2546-4624-adf8-9a119ea00c2d

| 우주 모드 (기본) | 계절 모드 |
|:---:|:---:|
| ![우주 모드](./screenshots/main.png) | ![계절 모드](./screenshots/season.png) |

## 주요 기능

- **실시간 에이전트 모니터링** — SSE 기반으로 에이전트 시작/완료/도구 사용을 실시간 추적
- **픽셀아트 캐릭터** — 에이전트별 고유 캐릭터가 워크스페이스에서 배회, 수면, 작업
- **CLAUDE.md 편집** — 전역/프로젝트별 CLAUDE.md를 대시보드에서 직접 편집
- **에이전트 관리** — `~/.claude/agents/*.md` 파일 생성/편집/삭제
- **프로젝트별 에이전트 토글** — 프로젝트마다 사용할 에이전트를 on/off 설정
- **MCP 서버 목록** — 연결된 MCP 서버 현황 표시
- **Hooks 현황** — 설정된 훅 핸들러 목록 표시
- **타임라인** — 에이전트 실행 시간 바 차트 (Master 진행 상태는 액티비티 패널에서 확인)
- **세션 관리** — 멀티 세션 탭, 이름 변경, 상태 추적
- **`/rename` 자동 동기화** — Claude Code에서 `/rename` 명령 실행 시 탭 이름 실시간 갱신
- **세션 히스토리** — 종료된 세션의 **질문 프롬프트 원문 + 응답 요약** 자동 저장, 에이전트/도구/파일 통계 포함 (7일·10MB·세션당 100질문 가드)
- **히스토리 검색** — 프롬프트/파일명/세션명 키워드 검색 + 날짜/에이전트 필터, 매칭 하이라이트
- **Privacy 토글** — 프롬프트 기록 on/off + 디스크 히스토리 일괄 정리 옵션
- **민감정보 자동 마스킹** — `sk-*`, `ghp_*`, `AKIA*`, JWT, Bearer 토큰 등 자동 치환
- **브라우저 알림** — 탭 비활성 시 에이전트 완료, 응답 완료 알림 (on/off 토글)
- **일일 통계** — 오늘의 질문 수, 에이전트별/도구별 사용 횟수, 주간/누적 통계
- **환경 효과** — 낮/밤 사이클, 4계절 순환, 날씨 파티클, 우주 배경 모드
- **성능 최적화** — 탭 비활성 시 애니메이션 자동 정지, renderAll 디바운스

## 요구사항

- macOS (Linux 미테스트)
- Node.js 16+ (`node --version`으로 확인)
- Claude Code CLI

## 설치

### 1. 파일 배치

```bash
# ~/.claude/agent-viz/ 에 프로젝트 파일 배치
git clone https://github.com/oy-snowwwww/claude-agent-viz.git ~/.claude/agent-viz
```

### 2. 에이전트 디렉토리 생성

에이전트 `.md` 파일을 넣을 디렉토리가 없다면 생성합니다 (이미 있으면 건너뛰세요):

```bash
mkdir -p ~/.claude/agents
```

### 3. 실행 권한 부여

```bash
chmod +x ~/.claude/agent-viz/start.sh
chmod +x ~/.claude/agent-viz/hook-handler.sh
```

### 4. CLI 별칭 설정 (선택)

```bash
# ~/.zshrc 또는 ~/.bashrc에 추가
alias claude-agents="bash ~/.claude/agent-viz/start.sh"
```

### 5. Claude Code 훅 설정

`~/.claude/settings.json`을 열고 `hooks` 키 안에 아래 이벤트들을 추가합니다.

> **이미 다른 hooks가 있다면?** 기존 이벤트 배열에 항목을 추가하세요. 예를 들어 `SessionStart`에 이미 훅이 있으면, 해당 배열에 아래 항목을 병합합니다. 처음 설정하는 경우 아래 전체를 그대로 붙여넣으면 됩니다.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/agent-viz/start.sh auto"
          },
          {
            "type": "command",
            "command": "bash ~/.claude/agent-viz/hook-handler.sh session_start"
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/agent-viz/hook-handler.sh thinking_start"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/agent-viz/hook-handler.sh thinking_end"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/agent-viz/hook-handler.sh session_end"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Agent",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/agent-viz/hook-handler.sh agent_start"
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/agent-viz/hook-handler.sh tool_use"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Agent",
        "hooks": [
          {
            "type": "command",
            "command": "bash ~/.claude/agent-viz/hook-handler.sh agent_done"
          }
        ]
      }
    ]
  }
}
```

설정 후 **Claude Code를 재시작하거나 새 세션을 시작**해야 훅이 반영됩니다.

## 사용법

### 서버 관리

```bash
claude-agents          # 서버 시작 + 브라우저 열기
claude-agents stop     # 서버 종료
claude-agents status   # 현재 상태 확인
claude-agents on       # 세션 시작 시 자동 실행 ON
claude-agents off      # 세션 시작 시 자동 실행 OFF
```

### 대시보드 UI

| 영역 | 설명 |
|------|------|
| **좌측 패널** | Master(CLAUDE.md), Agents(관리/토글), MCP 서버, Hooks |
| **워크스페이스** | 픽셀아트 캐릭터 + 환경 효과 (계절/날씨) |
| **액티비티** | Master + 에이전트별 프로그레스 바 + 상태 |
| **타임라인** | 에이전트 실행 시간 시각화 (Master는 액티비티 패널) |
| **로그** | 실시간 이벤트 로그 |
| **히스토리** | 🕐 버튼으로 열기 — 종료 세션의 프롬프트/응답 요약, 키워드 검색, 날짜/에이전트 필터, 🔒 Privacy 토글 |

### 헤더 버튼

| 버튼 | 기능 |
|------|------|
| 🔔 | 브라우저 알림 on/off |
| 🕐 | 세션 히스토리 |
| ? | 도움말 |
| ↻ | 서버 재시작 |
| ■ | 서버 종료 |
| ✨/🌍 | 환경 효과 on/off (우주 모드 ↔ 계절 모드) |
| 🌸/☀️/🍂/❄️ | 계절 전환 |
| 🌙/☀️ | 테마 전환 (Dark/Light) |

### 에이전트 토글

각 에이전트 카드의 토글 스위치로 프로젝트별 에이전트 활성화를 제어합니다.

**OFF하면?** 프로젝트 `CLAUDE.md` 끝에 아래 마커가 자동 삽입됩니다:

```html
<!-- agent-viz:agents coder, qa -->
<!-- 이 프로젝트에서는 위 에이전트만 사용한다 -->
```

Claude는 이 주석을 읽고 해당 에이전트만 사용합니다. 기존 CLAUDE.md 내용은 건드리지 않습니다.

- Master 작업 중이거나 해당 에이전트가 실행 중일 때 토글 변경 불가 (잠금)
- 전체 ON 시 제한 해제 (마커 제거)
- 전체 OFF 시 에이전트 미사용 (`none`)

### 세션 히스토리

종료된 세션을 자동으로 저장하고 나중에 검색/조회할 수 있습니다. 🕐 버튼으로 히스토리 모달 열기.

**자동 저장 내용**
- 질문 프롬프트 원문 (최대 500자, 민감정보 자동 마스킹)
- 질문별 응답 요약 (Claude Code transcript JSONL 파싱으로 추출)
- 에이전트 사용 통계 (타입별 실행 수, 평균 시간)
- 도구 사용 카운트 + 파일 접근 횟수 (Top 10)
- 응답 시간 (평균, 최대)

**검색/필터**
- 키워드 검색 — 프롬프트, 응답 요약, 파일명, 세션명 전역 매칭 + 하이라이트
- 날짜 필터 — 전체 / 오늘 / 최근 3일 / 최근 7일
- 에이전트 필터 — 특정 에이전트를 호출한 세션만 표시

**용량 가드**
- 7일 이상 오래된 파일 자동 삭제
- `history/` 디렉토리 10MB 초과 시 오래된 순으로 추가 삭제
- 세션당 최대 100개 질문까지만 개별 저장 (그 이후는 통계만 누적)
- 1시간 주기로 cleanHistory 자동 실행

**Privacy 토글 (🔒)**
- ON: 이후 세션의 프롬프트 저장 차단
- ON + 확인 선택: 이미 저장된 디스크 히스토리의 프롬프트/요약도 일괄 제거
- `~/.claude/agent-viz/privacy` 파일로 상태 관리 (서버 재시작 후에도 유지)

**민감정보 자동 마스킹**
- OpenAI/Anthropic 키 (`sk-*`)
- GitHub 토큰 (`ghp_*`, `ghs_*`, `gho_*`, `ghu_*`, `github_pat_*`)
- Slack 토큰 (`xoxb-*` 등)
- AWS Access Key (`AKIA*`)
- JWT (3 segment base64url)
- Bearer 토큰 헤더

### `/rename` 자동 동기화

Claude Code 세션에서 `/rename <이름>` 명령을 실행하면 대시보드 탭 이름이 자동으로 갱신됩니다.

**동작**
1. `/rename` 명령은 Claude Code transcript(`<sessionId>.jsonl`)에 기록됨
2. 다음 `thinking_start` 시 서버가 transcript 끝에서 가장 최근 `/rename` 명령 추출
3. 현재 세션 이름과 다르면 업데이트 + SSE로 브라우저에 즉시 반영
4. `_renamedFromTranscript` 플래그로 이후 훅 이벤트의 `cwd basename` 덮어쓰기 방지

## 문제 해결

| 증상 | 확인 |
|------|------|
| 서버가 뜨지 않음 | 포트 충돌 — `lsof -i :54321` → `AGENT_VIZ_PORT=다른포트` 환경변수로 변경 |
| 훅이 동작 안 함 | `~/.claude/settings.json`의 hooks 설정 확인 + Claude Code 세션 재시작 |
| 훅 에러 디버깅 | `bash ~/.claude/agent-viz/hook-handler.sh session_start` 수동 실행해서 에러 확인 |
| 탭/UI가 이상함 | 브라우저 새로고침 (F5) 또는 서버 재시작 (↻ 버튼) |
| 히스토리가 저장 안 됨 | `/exit`로 세션 종료했는지 + 🔒 Privacy 모드 해제 확인 |
| 탭 이름이 `/rename`과 다름 | 브라우저 새로고침 — SSE가 일시적으로 끊겼을 수 있음 |
| 에이전트가 워크스페이스에 안 보임 | 좌측 에이전트 토글 확인 + `~/.claude/agents/*.md` 파일 존재 확인 |

## 주의사항

### CLAUDE.md는 git에 올리지 마세요

에이전트 토글 기능이 프로젝트 `CLAUDE.md`에 마커를 씁니다. 프로젝트의 `.gitignore`에 아래 항목을 추가하세요:

```
CLAUDE.md
.claude/
.mcp.json
```

## 설정

### 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `AGENT_VIZ_PORT` | `54321` | 서버 포트 |

### 파일 구조

```
~/.claude/agent-viz/
├── index.html          # 단일 파일 SPA (UI 전체)
├── server.js           # Node.js HTTP 서버
├── hook-handler.sh     # Claude Code 훅 → 서버 이벤트 브릿지
├── start.sh            # 서버 시작/종료/상태 CLI
├── enabled             # 자동 실행 플래그 (파일 존재 여부)
├── privacy             # Privacy 모드 플래그 (파일 존재 여부)
├── sessions/           # 활성 세션 PID 파일
├── history/            # 세션 히스토리 JSON (7일·10MB 가드, 1시간 주기 정리)
└── agent-stats.json    # 일일/주간/누적 통계
```

## 화면에 뭐가 어디서 오는가

대시보드에 보이는 각 영역이 어떤 파일을 읽는지 매핑입니다.

| 대시보드 영역 | 데이터 소스 | 설명 |
|--------------|------------|------|
| **MASTER** (좌측) | `~/CLAUDE.md` + `<프로젝트>/CLAUDE.md` | 클릭하면 편집 가능 |
| **AGENTS** (좌측) | `~/.claude/agents/*.md` | 에이전트 카드 + 토글 |
| **에이전트 토글 on/off** | `<프로젝트>/CLAUDE.md`에 마커 저장 | 프로젝트별 에이전트 제한 |
| **MCP SERVERS** (좌측) | `~/.mcp.json` | 연결된 MCP 서버 목록 |
| **HOOKS** (좌측) | `~/.claude/settings.json` → hooks | 훅 핸들러 현황 |
| **워크스페이스 캐릭터** | `~/.claude/agents/*.md` + 실시간 이벤트 | 에이전트 상태 시각화 |
| **액티비티/타임라인/로그** | Claude Code 훅 이벤트 (실시간) | SSE로 수신 |
| **세션 히스토리** | `~/.claude/agent-viz/history/*.json` | 세션 종료 시 자동 저장, `/api/history?q=&days=&agent=`로 검색 |
| **질문별 응답 요약** | `~/.claude/projects/<프로젝트>/<sessionId>.jsonl` | Claude Code transcript 파싱으로 자동 추출 |
| **`/rename` 탭 동기화** | 같은 transcript의 `<command-name>/rename</command-name>` 추출 | `thinking_start` 시 최신 rename 감지 → 탭 이름 자동 갱신 |
| **Privacy 모드** | `~/.claude/agent-viz/privacy` (파일 존재 여부) | `/api/privacy` 토글 — 프롬프트 기록 차단 + 디스크 정리 |
| **민감정보 마스킹** | `server.js`의 `maskSecrets()` | `sk-*`/`ghp_*`/`AKIA*`/JWT/Bearer 자동 치환 |

### 파일을 만들면 → 대시보드에 자동 반영

```
~/.claude/agents/my-agent.md 생성  →  좌측 AGENTS에 카드 표시 + 워크스페이스에 캐릭터 등장
~/.mcp.json에 서버 추가            →  좌측 MCP SERVERS에 표시
~/CLAUDE.md 수정                   →  MASTER에서 편집/확인 가능
```

## Claude Code 설정 구조 안내

이 도구는 Claude Code의 설정 파일들과 연동됩니다. 처음이라면 아래 구조를 참고하세요.

```
~/
├── CLAUDE.md                      # 전역 설정 (모든 프로젝트에 적용)
└── .claude/
    ├── settings.json              # Claude Code 설정 (hooks, permissions 등)
    ├── settings.local.json        # 로컬 설정 (gitignore 대상)
    ├── agents/                    # 에이전트 정의 (.md 파일)
    │   ├── coder.md
    │   ├── reviewer.md
    │   └── ...
    └── agent-viz/                 # ← 이 프로젝트
```

### 에이전트 파일 예시 (`~/.claude/agents/coder.md`)

```markdown
---
name: coder
description: 백엔드 코드 구현
tools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"]
model: sonnet
---

당신은 백엔드 개발자입니다.
코드를 구현하고 테스트를 작성합니다.
```

### 프로젝트 CLAUDE.md 예시 (`<프로젝트>/CLAUDE.md`)

```markdown
# 프로젝트 설정

## 기본 규칙
- Kotlin/Spring Boot 프로젝트
- 테스트는 JUnit5 사용

## 빌드
- ./gradlew build
```

### MCP 서버 설정 (`~/.mcp.json`)

```json
{
  "mcpServers": {
    "github-mcp": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    }
  }
}
```

## 기술 스택

- **의존성 없음** — npm 패키지, 외부 CDN 없이 Node.js 내장 모듈만 사용
- **단일 HTML 파일** — CSS + JavaScript 인라인, 배포가 파일 하나로 완결
- **SSE (Server-Sent Events)** — 실시간 이벤트 스트리밍
- **Vanilla JavaScript** — 프레임워크 없는 순수 JS

## 라이선스

MIT
