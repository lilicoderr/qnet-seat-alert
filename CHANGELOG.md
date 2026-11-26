# Changelog

형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/), 버전은 [SemVer](https://semver.org/lang/ko/).

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
