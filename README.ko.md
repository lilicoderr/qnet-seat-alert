<div align="center">

# 🔔 qnet-seat-alert

**Q-Net 원서접수 빈자리가 열리면 Discord · Slack · Telegram 으로 알려주는 알림 전용 감시기**

[English](README.md) · **한국어**

[![CI](https://github.com/lilicoderr/qnet-seat-alert/actions/workflows/ci.yml/badge.svg)](https://github.com/lilicoderr/qnet-seat-alert/actions/workflows/ci.yml)
![node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)
![deps](https://img.shields.io/badge/dependencies-0-brightgreen)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

<img src="docs/demo.svg" alt="알림 예시" width="720">

</div>

> **알림 전용입니다.** 자동 접수·로그인·매크로는 하지 않습니다. 접수는 사람이 직접 합니다.
> Q-Net 자동 조회는 이용약관에 저촉될 수 있으니 **개인 확인 용도로만**, 폴링 간격을 넉넉히(3~10분) 두세요.

## 로그인 없이 감시할 수 있는 것

2026-11-27 실제 공개 페이지로 확인한 결과입니다 (HTTP 200, UTF-8, 로그인 불필요).

| 공개 페이지 | 보이는 내용 | 사용 가능? |
|---|---|---|
| [`rcv003.do?gSite=Q&id=rcv00301`](https://www.q-net.or.kr/rcv003.do?gSite=Q&id=rcv00301) (원서접수현황) | 현재 접수 중인 시험의 이름/회차와 접수기간 (예: `2026년 상시 기능사 107회 실기`) | 가능: `newrows` 감시 + 현황표 이미지 |
| 시험일정 페이지 (`crf021.do`) | 표를 브라우저의 JavaScript 가 만들어서 원본 HTML 에는 행이 없음 | 불가 (스크립트 실행 없이는 파싱 불가) |
| 잔여석 / 좌석 수 | 로그인 후 시험장별로만 표시 | **불가능.** 이 도구는 로그인하지 않습니다 |

따라서 기능사에서 정직하게 할 수 있는 일은 **공개 목록에 새 기능사 필기 접수가 처음 나타나면 한 번 알리고, 1분마다 KST 시각 헤더가 붙은 접수 목록 표 이미지를 올리는 것**입니다. 남은 자리가 있는지는 알 수 없습니다. 페이지의 이름 형식은 `2026년 상시 기능사 107회 실기` 이므로 필기 항목은 `기능사 ... 필기` 를 포함할 것으로 보고 패턴 `기능사.*필기` 를 썼습니다 (다음 실제 목록으로 확인 필요, 유일한 추정입니다).

```bash
qnet-alert init --preset gineungsa      # 1분 간격, newrows 감시, 표 이미지
qnet-alert doctor --fixture test/fixtures/real/rcv00301-2026-11-27.html   # 오프라인 종단 점검 (전송 없음)
```

`newrows` 는 본 적 있는 항목을 모두 기억해 새 항목마다 정확히 한 번만 알립니다 (첫 실행은 조용한 기준선, `alertOnFirst: true` 로 변경). Q-Net 점검 페이지(HTTP 5xx, 또는 200 으로 내려오는 짧은 "점검" 안내)는 수집 실패로 처리되어 저장된 상태를 덮어쓰지 않으며, EUC-KR/UTF-8 모두 디코드합니다.

실제 fixture 로 만든 표 이미지 (`node scripts/make-real-sample-image.js`):

![실제 현황표 이미지](docs/table-sample-real.png)

## 특징

- **의존성 0** — Node 20+ 내장 `fetch` 만 사용
- **멀티 채널** — Discord, Slack, Telegram, 일반 웹훅을 동시에
- **정밀 필터** — `include` / `exclude` / 날짜 범위로 "내가 볼 시험 행"만 감시
- **중복 알림 억제** — 0석→1석 이상으로 *열릴 때* 한 번만 (`open` / `increase` / `change` / `available`)
- **튼튼한 폴링** — 5xx·429·네트워크 오류는 지수 백오프, 연속 실패 시 "감시 오류" 알림
- **비밀값 분리** — 웹훅/토큰은 `.env` 환경변수로, 로그에서는 자동 마스킹
- **운영 친화적** — `--dry`, `--json` 구조화 로그, Docker, Actions 스케줄 예시
- **대화형 설정** — `qnet-alert init` 이 `config.json` 과 `.env.example` 을 만들어 줌 (비밀값은 묻지 않음)
- **하트비트** — N시간마다 "아직 감시 중" 요약 알림으로 조용히 죽은 감시기를 발견
- **문구 템플릿** — `{name}` `{available}` 같은 변수로 알림 제목/본문 변경
- **Prometheus 메트릭** — 선택적 `/metrics`, `/healthz` (기본 127.0.0.1 바인딩)
- **친절한 설정 검증** — 오타 키/값은 "혹시 ○○ 말씀이세요?" 로 안내

## 빠른 시작

```bash
git clone https://github.com/lilicoderr/qnet-seat-alert && cd qnet-seat-alert
node bin/qnet-alert.js init          # 대화형으로 config.json + .env.example 생성
#   (또는 cp config.example.json config.json 후 직접 수정)
cp .env.example .env                 # QNET_DISCORD_WEBHOOK 등 채우기

node bin/qnet-alert.js --dry           # 알림 없이 추출 결과만 확인
node bin/qnet-alert.js --test-webhook  # 모든 채널에 테스트 메시지
node bin/qnet-alert.js                 # intervalMin 마다 반복 (기본 5분, 최소 1분)
```

실행 예:

```text
7:48:12 [전기기능사 서울 12/05] signal=0 (빈자리 0 (이전 미확인)) ·
7:48:12 [전기기능사 서울 12/05] signal=3 (빈자리 열림: 3석 (이전 0)) 📨 알림보냄
```

### Docker

```bash
mkdir data && cp config.example.json data/config.json
docker compose up -d --build        # .env 의 QNET_* 값을 주입
```

서버가 없다면 [`scheduled-example.yml.disabled`](.github/workflows/scheduled-example.yml.disabled) 를 참고해 GitHub Actions 크론으로 돌릴 수도 있습니다.

## CLI

| 옵션 | 설명 |
|---|---|
| `--once` | 1회 검사 후 종료 |
| `--dry` | 알림을 보내지 않고 추출·판단만 출력 (웹훅 불필요) |
| `--list` | 설정된 watcher 목록 |
| `--test-webhook` | 설정된 모든 알림 채널에 테스트 전송 |
| `--json` | 한 줄 JSON 로그 (로그 수집기용) |
| `--quiet` | 변화·오류가 없는 줄은 출력 생략 |
| `--config <path>` | 설정 파일 (기본 `config.json`, 또는 `$QNET_CONFIG`) |
| `--metrics-port <n>` | Prometheus `/metrics` 서버 열기 (또는 `metricsPort`) |
| `qnet-alert stats [--hours 24] [--json]` | `historyPath` 이력으로 워처별 스파크라인·최소/최대/빈자리 비율 출력 |
| `init [--force]` | 대화형 설정 마법사 (기존 파일은 `--force` 없으면 보존) |

## 설정

### 알림 채널

환경변수(권장) 또는 `config.json` 의 `notifiers` 로 지정합니다.

| 채널 | 환경변수 | `notifiers` 항목 |
|---|---|---|
| Discord | `QNET_DISCORD_WEBHOOK` | `{ "type": "discord", "url": "…" }` |
| Slack | `QNET_SLACK_WEBHOOK` | `{ "type": "slack", "url": "…" }` |
| Telegram | `QNET_TELEGRAM_TOKEN`, `QNET_TELEGRAM_CHAT` | `{ "type": "telegram", "token": "…", "chatId": "…" }` |
| 일반 웹훅 | `QNET_WEBHOOK_URL` | `{ "type": "webhook", "url": "https://…" }` |
| 이메일 (SMTP) | `QNET_SMTP_HOST`, `QNET_SMTP_PORT`, `QNET_SMTP_USER`, `QNET_SMTP_PASS`, `QNET_EMAIL_FROM`, `QNET_EMAIL_TO` | `{ "type": "email", "host": "smtp.example.com", "from": "a@example.com", "to": ["b@example.com"] }` (465 = TLS, 587 = STARTTLS) |
| ntfy.sh | `QNET_NTFY_TOPIC` (+ `QNET_NTFY_SERVER`, `QNET_NTFY_TOKEN`) | `{ "type": "ntfy", "topic": "my-seats" }` |

> 구버전의 최상위 `webhookUrl` 도 그대로 동작합니다(Discord). 워처별 `webhookUrl` 은 해당 워처만 그 채널로 보냅니다.

### 최상위 옵션

| 키 | 기본 | 설명 |
|---|---|---|
| `intervalMin` | `5` | 폴링 간격(분), 최소 1 (60초) |
| `politeDelayMs` | – | 워처 사이 대기(ms) |
| `failureAlertAfter` | `5` | 연속 실패 N회에 "감시 오류" 알림 1회 (`0` 이면 끔) |
| `statePath` | `state.json` | 마지막 신호 저장 파일 (`$QNET_STATE`) |
| `heartbeatHours` | – | N시간마다 "감시 중" 요약 알림 (첫 실행엔 기준만 기록) |
| `templates` | – | `{ "title": "…", "description": "…" }` 알림 문구. 워처의 `template` 이 우선 |
| `metricsPort` / `metricsHost` | – / `127.0.0.1` | Prometheus 엔드포인트 (`/metrics`, `/healthz`) |
| `plugins` | – | 알림 채널 플러그인 모듈 경로 목록, [docs/plugins.md](docs/plugins.md) 참고 |
| `lang` | `ko` | 기본 알림 문구 언어: `ko` 또는 `en` (직접 쓴 `templates` 가 항상 우선) |
| `parserAlertAfter` | `3` | 페이지는 받아지는데 값을 N회 연속 못 읽으면 "파서 오류" 알림을 한 번 전송 (`0` 이면 끔) |
| `digest` | `false` | `true` 면 같은 점검에서 발생한 알림을 한 통으로 묶음 |
| `historyPath` | – | 측정값을 이 JSONL 파일에 누적, `qnet-alert stats` 로 확인 |
| `quietHours` | – | `{ "start": "23:00", "end": "07:00", "timezone": "Asia/Seoul" }` — 이 시간대에 발생한 알림은 보류했다가 끝나면 전송 |
| `jitter` | `0.1` | 매 대기 시간을 `intervalMin` 의 ±이 비율만큼 무작위로 흔듦 (0~0.5) |
| `mentions` | – | `{ "users": [...], "roles": [...], "slack": [...], "cooldownMin": 0, "whileAvailable": true }` — 빈자리가 보이는 동안 멘션 ([멘션](#멘션) 참고) |
| `tableImage` | – | `{ "every": false, "chrome": "", "width": 960 }` — 현황표를 PNG 로 첨부 ([현황표 이미지](#현황표-이미지) 참고) |
| `rateLimit` | – | `{ "maxPerHour": 6 }` — 시간당 알림 상한 (초과분은 로그만 남기고 건너뜀) |

템플릿 변수: `{name}` `{available}` `{applied}` `{capacity}` `{signal}` `{reason}` `{url}` `{time}`
예) `"title": "🎯 {name} {available}석!"`

### 멘션

`mentions`(또는 `QNET_MENTION_*` 환경변수)를 설정하면, 닫힘→열림 전환 때만이 아니라 **빈자리가 보이는 매 체크마다** 지정한 사람을 멘션합니다. `cooldownMin`(기본 `0` = 매 체크)으로 간격을 둘 수 있고, `"whileAvailable": false` 면 전환 때만 알립니다. ID 는 코드가 아니라 설정/환경변수로만 받습니다.

```bash
# .env (자리표시자)
QNET_MENTION_USERS=123456789012345678,234567890123456789   # Discord 사용자 ID
QNET_MENTION_ROLES=345678901234567890                      # Discord 역할 ID
QNET_MENTION_SLACK=U0123ABCD                               # Slack 멤버 ID
```

Discord 는 `<@USER_ID>` / `<@&ROLE_ID>` 를 보내고 `allowed_mentions` 로 **해당 ID 만** 알림이 가게 합니다 (`@everyone`/`@here` 불가). Slack 은 `<@U...>` 를 씁니다.

#### Discord 사용자/역할 ID 얻는 법

1. 개발자 모드 켜기: **사용자 설정 > 고급 > 개발자 모드**.
2. 사용자 ID: 사용자 우클릭 후 **사용자 ID 복사** (모바일: 사용자를 길게 누르거나 ... 메뉴에서 **사용자 ID 복사**).
3. 역할 ID: **서버 설정 > 역할 > ... > 역할 ID 복사**. 역할은 **모든 사람이 이 역할을 멘션하도록 허용** 이 켜져 있어야 알림이 갑니다.
4. `.env` 의 `QNET_MENTION_USERS` / `QNET_MENTION_ROLES` (쉼표 구분) 또는 `config.json` 의 `mentions` 에 넣으세요.

### 현황표 이미지

`tableImage` 를 설정하면 현재 현황표(시행일·지역·시험장소·종목·정원·접수·빈자리)를 PNG 로 그려 웹훅 메시지에 첨부합니다. 맨 위 줄은 **2026-11-27 14:03 KST 기준** 처럼 확인 시각(KST)이고, 빈자리가 있는 행은 초록색으로 강조됩니다.

```json
{ "tableImage": { "every": true } }
```

- `every: true` 면 체크마다 보내고, 기본값 `false` 는 지난 체크와 표가 달라졌을 때만 보냅니다 (첫 체크는 변화로 취급).
- **체크당 메시지 1통.** Discord 는 알림 임베드와 현황표 이미지를 multipart 한 통으로 보내며(이미지는 임베드 안에 표시), 멘션 문구는 정확히 한 번만 들어가고 `allowed_mentions` 는 설정한 ID 로만 제한됩니다. 알림이 없는 체크라도 `every` 가 켜져 있으면 멘션 없는 이미지 전용 메시지를 보냅니다. 멘션은 `cooldownMin` 을 따르고, 조용한 시간에는 이미지 포함 아무것도 보내지 않으며, `rateLimit` 는 합쳐진 메시지 기준입니다. Telegram 은 알림 본문을 캡션으로 한 `sendPhoto` 한 통입니다. Slack 인커밍 웹훅은 파일 업로드가 안 되어 텍스트 알림만 갑니다.
- 이미지 높이는 실제 레이아웃을 먼저 측정(headless 1차 실행)해서 정하므로 긴 시험장 이름이 줄바꿈돼도 잘리지 않습니다. Chrome 은 샌드박스를 켠 채 실행하며, `--no-sandbox` 는 Linux 에서 root 로 실행할 때(예: 컨테이너)만 추가됩니다. 그 경우 Chrome 이 샌드박스로는 시작을 거부하기 때문입니다.
- **렌더러 선택:** npm 의존성·Playwright 없이, 설치된 Chrome/Chromium/Edge 의 headless 스크린샷을 씁니다 (자동 탐지, `tableImage.chrome` 또는 `QNET_CHROME` 으로 지정). 브라우저가 없으면 이미지만 건너뛰고 오류를 기록하며 텍스트 알림은 그대로 갑니다.
- 가상의 fixture 데이터로 만든 샘플 (`node scripts/make-sample-image.js`):

![샘플 현황표 이미지](docs/table-sample.png)

### Watcher

| 키 | 설명 |
|---|---|
| `name`, `id` | 표시 이름 / 상태 저장용 식별자 |
| `url`, `linkUrl` | 가져올 URL / 알림에 붙일 링크 |
| `type` | `seats` · `jsonseats` · `contains` · `regex` · `newrows` |
| `alertOn` | `open`(기본) · `increase` · `change` · `available` |
| `include` / `exclude` | 행 필터 — 모든 `include` 키워드를 포함하고 `exclude` 는 없는 행만 사용 |
| `dateFrom` / `dateTo` | 행의 날짜(`2026.12.05`, `2026-12-05`, `2026년 12월 5일`)가 `YYYY-MM-DD` 범위일 때만 |
| `mention` | 알림 본문에 넣을 멘션 |
| `schedule` | cron 형식 `분 시 일 월 요일` (로컬 시간, 예: `*/10 9-18 * * 1-5`): 마지막 실행 이후 일정이 도래했을 때만 실행. 루프 주기는 전역 `intervalMin` 이 정함 |
| `enabled` | `false` 면 건너뜀 |

| type | 동작 |
|---|---|
| `seats` | HTML 텍스트에서 "정원/접수인원", "잔여 N석", "28/30", "30명 중 28명" 을 찾아 계산 |
| `jsonseats` | JSON 응답의 정원/접수/잔여 필드로 계산 (`fields` 로 키 지정) |
| `contains` | 문구(`needle`) 등장/사라짐 감지 (`alertWhen`: present/absent/change) |
| `regex` | `pattern` 1번 그룹 값 변화 감지 |
| `newrows` | 공개 원서접수현황 목록에서 `pattern`/`needle` 에 맞는 새 행이 생기면 한 번만 알림 (`alertOnFirst`: 첫 실행에 이미 있는 행도 알림) |

## 동작 방식

```text
poll ─▶ fetch(+backoff) ─▶ row filter ─▶ extract ─▶ decide(prev, cur) ─▶ notify[Discord|Slack|Telegram|Webhook]
                                                          ▲
                                                     state.json (중복 억제)
```

```text
bin/qnet-alert.js   CLI
src/engine.js       폴링 1회: 가져오기·재시도·알림
src/filter.js       include/exclude/날짜 행 필터
src/extract.js      잔여석·문구·정규식 추출
src/watcher.js      이전↔현재 비교 → 알림 여부
src/notify.js       Discord/Slack/Telegram/웹훅 채널
src/discord.js      Discord 임베드 + 429 재시도
src/store.js        마지막 신호 저장
src/log.js          텍스트/JSON 로그
src/env.js          .env 로더
src/validate.js     설정 검증 (+ 오타 제안: suggest.js)
src/template.js     알림 문구 템플릿
src/heartbeat.js    주기적 "감시 중" 알림
src/metrics.js      Prometheus 텍스트 메트릭 서버
src/init.js         init 마법사
```

## 테스트

```bash
npm test      # node --test — 네트워크 없이 fetch 주입으로 검증
```

## 한계

Q-Net 의 정확한 잔여석 엔드포인트는 로그인·세션이 필요하거나 구조가 바뀔 수 있습니다. 이 도구는 **열람 가능한 URL 과 추출 규칙을 사용자가 지정**하는 범용 감시기이며, 자동 접수는 의도적으로 지원하지 않습니다.

## 기여

[CONTRIBUTING.md](CONTRIBUTING.md) · [CHANGELOG.md](CHANGELOG.md) · [MIT License](LICENSE)

## 배포

systemd, Windows 작업 스케줄러, PM2, Docker 설정은 [docs/deploy.md](docs/deploy.md) 참고.

## 핫 리로드

실행 중 설정 파일이 바뀌면 30초 이내에 자동으로 다시 읽고, `SIGHUP`(`kill -HUP <pid>`, Linux/macOS)을 보내면 즉시 읽습니다. 새 설정이 잘못됐으면 오류만 출력하고 이전 설정으로 계속 동작합니다.

## 에디터 자동완성

[`schemas/config.schema.json`](schemas/config.schema.json) JSON Schema 를 제공합니다. `config.json` 맨 위에 `"$schema": "./schemas/config.schema.json"` 을 넣으면 VS Code 등에서 자동완성과 오류 표시가 됩니다.
