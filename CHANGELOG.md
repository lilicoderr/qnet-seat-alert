# Changelog

형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/), 버전은 [SemVer](https://semver.org/lang/ko/).

## [Unreleased]

## [1.9.0] — 2026-11-28
### Added
- `qnet-alert ui`: Korean web app (127.0.0.1 only) to pick the open exam / 종목 / region from lists read through the public read-only chain (user-triggered, cached, polite), set the interval with the request cost shown, save the Discord webhook and mention user IDs to `.env` only (never echoed), send a test alert, start/stop watching, see last/next check in KST and per-venue seat history charts. Per-session token, Host/Origin checks, CSP, no secrets in responses/logs.
- `qnet` readings now store per-venue rows in the history JSONL.
- Sample screenshots (fixture data) in docs.

## [1.8.0] — 2026-11-28
### Added
- Windows 첫 실행: README 5분 빠른 시작, `start-watch.bat`, `test` 알림에 설정한 멘션 포함.
- `doctor` 의 해결 안내 (`.env` 누락/`.env.txt`, 값이 든 `.env.example`, 잘못된 멘션 ID, JSON 오류 등).
### Fixed
- "감시 오류"·"파서 오류" 경고 전송이 실패하면 다시 보내지 않아, 감시가 고장 난 사실을 모를 수 있던 문제. 이제 전달될 때까지 다시 시도하고 장애마다 한 번만 보낸다(복구하면 초기화). 조용한 시간에는 미루고(이전에는 바로 전송), `rateLimit` 은 좌석 알림과 따로 센다.
- soak 테스트에서 찾은 문제:
  - 좌석 알림(다이제스트 포함) 전송이 모두 실패하면 다음 체크에 다시 보낸다. 멘션 쿨다운은 전송에 성공했을 때만 기록.
  - 보류 알림: 그 사이 닫힌 자리는 버리고, 전송에 실패하면 남겨 두며, 새 알림과 겹쳐 보내지 않는다.
  - 현황표 이미지는 전송에 성공해야 보낸 것으로 기록하고, 이미지 전용 메시지는 좌석 알림과 빈도 제한을 따로 센다.
  - 점검 안내·4xx·qnet 429 는 같은 체크에서 재시도하지 않고, 레이아웃이 계속 깨져 있으면 정적 단계는 5분에 한 번만 다시 받는다.
  - 상태 파일은 임시 파일에 쓴 뒤 바꿔치기한다.
- `deploy/windows-task.ps1`: Windows PowerShell 5.1 `-File` 실행 시 폴더 경로가 비는 문제, 로그온 트리거를 현재 사용자로 한정.
- `--dry` 가 상태를 저장해 이후 첫 알림이 사라질 수 있던 문제. 값을 못 읽은 이유(종목 오타 등)를 로그에 표시.
- README 의 `.env` 예시에서 값 뒤 주석 제거 (주석까지 값으로 읽혔음).
### Testing
- 가짜 Q-Net/Discord/시계를 쓰는 결정적 soak 테스트 추가. 실제 Discord 전송은 확인하지 않았다.

## [1.7.1] — 2026-11-27
### Changed
- qnet watcher politeness: pause between result pages (`pageDelayMs`, default 1500 ms), `maxPages` default 5, 429/5xx backoff (2 to 16 min, checks skipped), static steps re-run only on layout/stale-id errors, "no open exam" cached 5 min (rechecked every check within 5 min of an opening). `doctor`/validate warn when `region` is missing.
### Added
- Synthetic open-seat fixture (labelled synthetic) and tests for alert, mention and highlighted table image; README states numeric remaining values are unverified on real data and documents request cost and recommended settings.

## [1.7.0] — 2026-11-27
### Added
- `type: "qnet"` watcher: read-only per-venue capacity / remaining seats from Q-Net's public lookup chain (rcv00301 -> 00302 -> 00303 -> s02 -> s03), verified live without login/cookies/CAPTCHA (9 requests). Static steps cached (`refreshMin`), only the venue table is re-polled each check. Handles no open exam, not open yet, maintenance, EUC-KR, layout changes (parser-broken alert naming the problem).
- Step-by-step real fixtures and parser tests; `doctor|test --fixture` runs the qnet chain offline.
- `init --preset gineungsa --jongmok X --region Y` now includes the qnet seat watcher.
### Fixed
- `qnet-alert init --preset` was not wired into the CLI in 1.6.0 (only the function existed).
### Changed
- README: the claim that seats need login is removed; the verified flow, its cost and its open points are documented.
### Known limits
- Only `마감` cells were seen live, never a numeric remaining value; 필기 exams were not open to test.

## [1.6.0] — 2026-11-27
### Added
- Real public fixture `test/fixtures/real/rcv00301-2026-11-27.html` (sanitized) and tests; real findings documented in a new README section "What can be watched without login" (en/ko), with a table image generated from it.
- `newrows` watcher type: alerts once per new list row matching `pattern`/`needle` (state remembers seen rows; first run is a silent baseline, `alertOnFirst` overrides).
- `qnet-alert init --preset gineungsa` (1-minute interval, table image, honest comments) and `doctor|test --fixture <file>` for offline end-to-end validation.
- EUC-KR/UTF-8 response decoding and detection of Q-Net maintenance pages (HTTP 200 "점검" pages count as fetch failures).
### Changed
- Table image: button-only columns (보기) and the empty seat column are dropped for the public list.
- `config.example.json` uses `newrows` with `기능사.*필기` (a plain `기능사 필기` needle can never match a row such as "기능사 1회 필기").
### Known limits
- Seat counts need login and are not watched. The 필기 naming pattern is unverified against a real 필기 listing; the annual schedule pages are JavaScript-rendered and not parseable.

## [1.5.0] — 2026-11-27
### Added
- `config.example.json`: a watcher for the real public Q-Net application list (`rcv00301`, no login). It alerts when a `기능사 필기` entry appears. Note: that page lists applications only, not seat counts, and only during application periods; seat counts are not publicly available without login

### Fixed
- The example needle is `기능사 필기` rather than `기능사`: the page navigation always contains `기능사`, so the broader needle would alert on every check

## [1.4.1] — 2026-11-27
### Fixed
- Discord: one message per check. The alert embed and the table image are sent together (multipart, `attachment://qnet-status.png`) with the mention text once; previously the alert and the image were two messages that both pinged. No-alert checks with `tableImage.every` send an image-only message without mentions; Telegram uses a single `sendPhoto`
- The image path no longer bypasses gates: mentions respect `cooldownMin`, quiet hours send nothing (images included), and `rateLimit` applies to the combined message
- Chrome is no longer started with `--no-sandbox` except on Linux as root
- Image height is measured from the real layout (with a text-aware estimate as fallback), so wrapped long cells are not clipped

### Added
- End-to-end tests (fake Q-Net server) for one message per check, cooldown, quiet hours and rateLimit

## [1.4.0] — 2026-11-27
### Added
- `tableImage`: the seat-status table rendered as a PNG (KST check time as the top line, open rows highlighted) and attached to Discord (multipart) / Telegram; `every: true` sends it on every check, otherwise only when the table changes. Rendered with system Chrome/Edge headless (no new dependency)
- `mentions` (`QNET_MENTION_USERS` / `QNET_MENTION_ROLES` / `QNET_MENTION_SLACK`): ping users/roles on every check that sees an open seat, optional `cooldownMin`, Discord `allowed_mentions` limited to exactly those IDs; README section on getting Discord user/role IDs
- Sample table image (`docs/table-sample.png`, fictional data) and `scripts/make-sample-image.js`

### Changed
- Minimum polling interval lowered from 2 minutes to 60 seconds (jitter and the identifiable User-Agent are kept)

## [1.3.0] — 2026-11-27
### Added
- Notifier plugin interface (`plugins`, `docs/plugins.md`, `examples/console-notifier.js`)
- Email (dependency-free SMTP, TLS/STARTTLS/AUTH) and ntfy.sh notifiers, configurable via `QNET_SMTP_*` / `QNET_NTFY_*`
- `quietHours` (hold and flush after the window) and `rateLimit.maxPerHour`
- `historyPath` JSONL availability log and `qnet-alert stats` with text sparklines
- `digest` mode: alerts raised in the same check are merged into one message
- Config hot-reload on file change (<=30 s) and `SIGHUP`; invalid configs keep the previous one
- Deployment recipes: systemd unit, Windows Task Scheduler script, PM2 config (`docs/deploy.md`)
- Fixture-based parser regression tests and a one-shot "parser broke" alert (`parserAlertAfter`, default 3)
- JSON Schema (`schemas/config.schema.json`) with `$schema` hint
- GHCR Docker image publishing workflow on `vX.Y.Z` tags (amd64 + arm64)
- `lang` option: Korean/English built-in alert messages

### Changed
- When a page loads but no value can be read, the last known signal is now kept (so recovery compares correctly) instead of being overwritten.
- `flags` is now an accepted watcher key.

## [1.2.0] — 2026-11-27
### Added
- `qnet-alert init` 대화형 설정 마법사 — `config.json` 과 `.env.example` 만 생성(비밀값은 묻지 않음, 기존 파일은 `--force` 없이는 보존)
- 하트비트(`heartbeatHours`): N시간마다 "감시 중" 요약 알림 (첫 실행엔 기준만 기록, 전송 실패 시 다음 주기에 재시도)
- 알림 문구 템플릿(`templates`, 워처별 `template`): `{name}` `{available}` `{applied}` `{capacity}` `{signal}` `{reason}` `{url}` `{time}`
- 선택적 Prometheus 메트릭(`metricsPort`/`--metrics-port`, `metricsHost`): `/metrics`, `/healthz` (기본 127.0.0.1 바인딩)
- 설정 검증 강화: 알 수 없는 키/`type`/`alertOn`/`alertWhen` 오타에 "혹시 ○○ 말씀이세요?" 제안, 잘못된 정규식·숫자 옵션·템플릿 변수 검사
- 영어 README 를 기본으로 하고 한국어판은 `README.ko.md`
- CI: Node 20/22 × Ubuntu/Windows 매트릭스, 커버리지 요약 잡 (`npm run coverage`)
- 테스트 36 → 92개 (상태 복원·중복 알림 억제·dry-run·하트비트·메트릭·init)

### Fixed
- `store.get()/all()` 이 내부 상태 객체를 그대로 노출해 호출자가 캐시를 변경할 수 있던 문제

## [1.1.0] — 2026-11-27
### Added
- 알림 채널 확장: Slack, Telegram, 일반 웹훅 (`notifiers`), 여러 채널 동시 전송
- 비밀값을 환경변수로 주입 (`QNET_DISCORD_WEBHOOK` 등) + `.env` 로더, `.env.example`
- 행 필터: `include` / `exclude` / `dateFrom` / `dateTo` 로 지역·종목·날짜 지정
- 5xx·429·네트워크 오류에 지수 백오프 재시도, 연속 실패 시 "감시 오류" 알림(`failureAlertAfter`)
- `--json`(구조화 로그) / `--quiet` 옵션
- Dockerfile, docker-compose, Actions 스케줄 예시, 이슈 템플릿

### Changed
- `--test-webhook` 이 설정된 모든 채널을 테스트
- `--dry` 에서 알림 대상은 "알림실패"가 아닌 "전송 생략"으로 표시

## [1.0.0]
- 최초 공개: seats/jsonseats/contains/regex 워처, Discord 웹훅, 중복 알림 억제, 429 재시도, 설정 검증
