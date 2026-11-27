# Changelog

형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/), 버전은 [SemVer](https://semver.org/lang/ko/).

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
