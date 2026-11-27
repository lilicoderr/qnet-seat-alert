<div align="center">

# 🔔 qnet-seat-alert

**An alert-only watcher that pings Discord · Slack · Telegram when a Q-Net exam seat opens up.**

[![CI](https://github.com/lilicoderr/qnet-seat-alert/actions/workflows/ci.yml/badge.svg)](https://github.com/lilicoderr/qnet-seat-alert/actions/workflows/ci.yml)
![node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)
![deps](https://img.shields.io/badge/dependencies-0-brightgreen)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**English** · [한국어](README.ko.md)

<img src="docs/demo.svg" alt="Alert example" width="720">

</div>

> **Alert-only.** No auto-registration, no login, no macros — you register by hand.
> Automated access to Q-Net may violate its terms of service, so use this for **personal checks only** and keep the polling interval generous (3–10 minutes).

[Q-Net](https://www.q-net.or.kr/) is Korea's national technical-qualification portal. Seats for popular exams (기능사 practical tests, etc.) vanish in minutes and reappear when someone cancels. This tool watches pages **you** point it at and tells you the moment a seat reopens.

## Features

- **Zero dependencies** — Node 20+ built-in `fetch` only
- **Multi-channel** — Discord, Slack, Telegram and generic webhooks at once
- **Precise filters** — `include` / `exclude` keywords and a date range, so you only watch the rows you care about
- **No duplicate pings** — fires once when seats *open* (`open` / `increase` / `change` / `available`), and survives restarts via a state file
- **Robust polling** — exponential backoff on 5xx / 429 / network errors, plus a one-time "watcher is failing" alert
- **Secrets stay out of config** — webhooks/tokens come from `.env`; they are redacted from logs
- **Interactive setup** — `qnet-alert init` writes `config.json` and `.env.example` (it never asks for secrets)
- **Heartbeat** — a periodic "still watching" summary so a silently dead watcher gets noticed
- **Message templates** — `{name}`, `{available}`, … variables for alert titles and bodies
- **Prometheus metrics** — optional `/metrics` and `/healthz` (binds to 127.0.0.1 by default)
- **Helpful validation** — typos in keys or values get a "did you mean …?" hint
- **Ops-friendly** — `--dry`, `--json` structured logs, Docker, a scheduled GitHub Actions example

## Quick start

```bash
git clone https://github.com/lilicoderr/qnet-seat-alert && cd qnet-seat-alert
node bin/qnet-alert.js init          # interactive: writes config.json + .env.example
#   (or: cp config.example.json config.json and edit it)
cp .env.example .env                 # fill QNET_DISCORD_WEBHOOK etc. — never commit .env

node bin/qnet-alert.js --dry           # extract + decide, send nothing
node bin/qnet-alert.js --test-webhook  # send a test message to every channel
node bin/qnet-alert.js                 # poll every intervalMin (default 5, minimum 2)
```

Sample output:

```text
7:48:12 [전기기능사 서울 12/05] signal=0 (빈자리 0 (이전 미확인)) ·
7:48:12 [전기기능사 서울 12/05] signal=3 (빈자리 열림: 3석 (이전 0)) 📨 알림보냄
```

### Docker

```bash
mkdir data && cp config.example.json data/config.json
docker compose up -d --build        # injects QNET_* from .env
```

No server? See [`scheduled-example.yml.disabled`](.github/workflows/scheduled-example.yml.disabled) for a GitHub Actions cron variant.

## CLI

| Option | Description |
|---|---|
| `--once` | Check once and exit |
| `--dry` | Extract and decide without sending (no webhook needed) |
| `--list` | List configured watchers |
| `--test-webhook` | Send a test message to every configured channel |
| `--json` | One JSON object per log line (for log collectors) |
| `--quiet` | Hide lines with no change and no error |
| `--config <path>` | Config file (default `config.json`, or `$QNET_CONFIG`) |
| `--metrics-port <n>` | Serve Prometheus `/metrics` (or set `metricsPort`) |
| `init [--force]` | Interactive setup wizard (existing files are kept unless `--force`) |

## Configuration

### Notification channels

Set via environment variables (recommended) or `notifiers` in `config.json`.

| Channel | Environment variables | `notifiers` entry |
|---|---|---|
| Discord | `QNET_DISCORD_WEBHOOK` | `{ "type": "discord", "url": "…" }` |
| Slack | `QNET_SLACK_WEBHOOK` | `{ "type": "slack", "url": "…" }` |
| Telegram | `QNET_TELEGRAM_TOKEN`, `QNET_TELEGRAM_CHAT` | `{ "type": "telegram", "token": "…", "chatId": "…" }` |
| Generic webhook | `QNET_WEBHOOK_URL` | `{ "type": "webhook", "url": "https://…" }` |
| Email (SMTP) | `QNET_SMTP_HOST`, `QNET_SMTP_PORT`, `QNET_SMTP_USER`, `QNET_SMTP_PASS`, `QNET_EMAIL_FROM`, `QNET_EMAIL_TO` | `{ "type": "email", "host": "smtp.example.com", "from": "a@example.com", "to": ["b@example.com"] }` (465 = TLS, 587 = STARTTLS) |
| ntfy.sh | `QNET_NTFY_TOPIC` (+ `QNET_NTFY_SERVER`, `QNET_NTFY_TOKEN`) | `{ "type": "ntfy", "topic": "my-seats" }` |

> A top-level legacy `webhookUrl` still works (Discord). A per-watcher `webhookUrl` routes only that watcher to that channel.

### Top-level options

| Key | Default | Description |
|---|---|---|
| `intervalMin` | `5` | Polling interval in minutes (minimum 2) |
| `politeDelayMs` | – | Pause between watchers (ms) |
| `failureAlertAfter` | `5` | Send one "watcher failing" alert after N consecutive failures (`0` disables) |
| `statePath` | `state.json` | File holding the last signal (`$QNET_STATE`) |
| `heartbeatHours` | – | Send a "still watching" summary every N hours (first run only records a baseline) |
| `templates` | – | `{ "title": "…", "description": "…" }` alert text; a watcher's `template` overrides it |
| `metricsPort` / `metricsHost` | – / `127.0.0.1` | Prometheus endpoint (`/metrics`, `/healthz`) |
| `plugins` | – | Paths of notifier plugin modules to load, see [docs/plugins.md](docs/plugins.md) |

Template variables: `{name}` `{available}` `{applied}` `{capacity}` `{signal}` `{reason}` `{url}` `{time}` — e.g. `"title": "🎯 {name}: {available} seats!"`.

### Watchers

| Key | Description |
|---|---|
| `name`, `id` | Display name / identifier used for state storage |
| `url`, `linkUrl` | URL to fetch / link attached to the alert |
| `type` | `seats` · `jsonseats` · `contains` · `regex` |
| `alertOn` | `open` (default) · `increase` · `change` · `available` |
| `include` / `exclude` | Row filters — keep rows containing **all** `include` keywords and none of `exclude` |
| `dateFrom` / `dateTo` | Keep rows whose date (`2026.12.05`, `2026-12-05`, `2026년 12월 5일`) falls in the `YYYY-MM-DD` range |
| `template` | Per-watcher `{ title, description }` override |
| `mention` | Mention text for the alert body |
| `enabled` | `false` to skip |

| `type` | Behaviour |
|---|---|
| `seats` | Finds "capacity/applied", "N seats left", "28/30", "28 of 30" in the page text and computes the remainder |
| `jsonseats` | Computes from capacity/applied/remaining fields of a JSON response (`fields` selects keys) |
| `contains` | Detects a phrase (`needle`) appearing/disappearing (`alertWhen`: present/absent/change) |
| `regex` | Detects changes in the first capture group of `pattern` |

## How it works

```text
poll ─▶ fetch(+backoff) ─▶ row filter ─▶ extract ─▶ decide(prev, cur) ─▶ notify[Discord|Slack|Telegram|Webhook]
                                                          ▲
                                                     state.json (dedupe)
```

```text
bin/qnet-alert.js   CLI
src/engine.js       one polling round: fetch, retry, alert
src/filter.js       include/exclude/date row filters
src/extract.js      seat / phrase / regex extraction
src/watcher.js      previous vs current → alert or not
src/notify.js       Discord/Slack/Telegram/webhook channels
src/discord.js      Discord embeds + 429 retry
src/store.js        last-signal persistence
src/log.js          text/JSON logs
src/env.js          .env loader
src/validate.js     config validation (+ typo hints in suggest.js)
src/template.js     alert message templates
src/heartbeat.js    periodic "still watching" alert
src/metrics.js      Prometheus text metrics server
src/init.js         init wizard
```

## Metrics

With `metricsPort` (or `--metrics-port`), `GET /metrics` exposes Prometheus text format and `GET /healthz` returns `ok`.

| Metric | Type |
|---|---|
| `qnet_alert_checks_total{watcher,status}` | counter |
| `qnet_alert_notifications_total{watcher}` | counter |
| `qnet_alert_notification_errors_total{watcher}` | counter |
| `qnet_alert_consecutive_failures{watcher}` | gauge |
| `qnet_alert_available_seats{watcher}` | gauge |
| `qnet_alert_last_check_timestamp_seconds{watcher}` | gauge |
| `qnet_alert_up`, `qnet_alert_uptime_seconds` | gauge |

The server binds to `127.0.0.1`; set `metricsHost` explicitly to expose it.

## Testing

```bash
npm test            # node --test — no network, fetch is injected
npm run coverage    # with line/branch coverage
```

CI runs Node 20 and 22 on Ubuntu and Windows, plus a coverage summary.

## Limitations

Q-Net's exact seat endpoint may need a login/session or change its structure. This is a **generic watcher: you supply a viewable URL and extraction rules**. Auto-registration is intentionally not supported.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) · [CHANGELOG.md](CHANGELOG.md) · [MIT License](LICENSE)
