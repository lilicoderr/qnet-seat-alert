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
node bin/qnet-alert.js                 # poll every intervalMin (default 5, minimum 1)
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
| `qnet-alert stats [--hours 24] [--json]` | Text sparkline + min/max/open-rate per watcher from `historyPath` |
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
| `intervalMin` | `5` | Polling interval in minutes (minimum 1, i.e. 60 s; fractions like 1.5 work) |
| `politeDelayMs` | – | Pause between watchers (ms) |
| `failureAlertAfter` | `5` | Send one "watcher failing" alert after N consecutive failures (`0` disables) |
| `statePath` | `state.json` | File holding the last signal (`$QNET_STATE`) |
| `heartbeatHours` | – | Send a "still watching" summary every N hours (first run only records a baseline) |
| `templates` | – | `{ "title": "…", "description": "…" }` alert text; a watcher's `template` overrides it |
| `metricsPort` / `metricsHost` | – / `127.0.0.1` | Prometheus endpoint (`/metrics`, `/healthz`) |
| `plugins` | – | Paths of notifier plugin modules to load, see [docs/plugins.md](docs/plugins.md) |
| `lang` | `ko` | Language of built-in alert messages: `ko` or `en` (your own `templates` always win) |
| `parserAlertAfter` | `3` | Send one "parser broke" alert after N consecutive checks where the page loads but no value can be read (`0` disables) |
| `digest` | `false` | `true` merges alerts raised in the same check into one message |
| `historyPath` | – | Append every reading to this JSONL file; view it with `qnet-alert stats` |
| `quietHours` | – | `{ "start": "23:00", "end": "07:00", "timezone": "Asia/Seoul" }` — alerts raised in this window are held and sent once it ends |
| `jitter` | `0.1` | Randomize each wait by ±this fraction of `intervalMin` (0–0.5) so requests don't land on a fixed beat; see [Polite polling](#polite-polling) |
| `mentions` | – | `{ "users": [...], "roles": [...], "slack": [...], "cooldownMin": 0, "whileAvailable": true }` — ping people while seats are open, see [Mentions](#mentions) |
| `tableImage` | – | `{ "every": false, "chrome": "", "width": 960 }` — attach the seat table as a PNG, see [Table image](#table-image) |
| `rateLimit` | – | `{ "maxPerHour": 6 }` — cap alerts per hour; extra ones are skipped (logged only) |

Template variables: `{name}` `{available}` `{applied}` `{capacity}` `{signal}` `{reason}` `{url}` `{time}` — e.g. `"title": "🎯 {name}: {available} seats!"`.

### Polite polling

This tool is alert-only and is meant to be gentle with Q-Net:

- **Minimum interval: 60 seconds (`intervalMin: 1`).** Lower values are raised to 1. 1 minute is for short, important windows; 3-10 minutes is the polite everyday choice. Jitter still applies.
- **Jitter:** each wait is randomized by +/-10% by default (`jitter`).
- **Identifiable User-Agent:** requests send `qnet-seat-alert/<version> (+repo URL; personal alert-only watcher; low-frequency)`. A watcher's `headers` can override it.
- Failures back off exponentially (up to 2 retries); `politeDelayMs` spaces out multiple watchers.
- It never logs in, never registers and never pays.

### Mentions

When `mentions` (or the `QNET_MENTION_*` env vars) is set, every check that sees an open seat pings the listed people, not only the first closed-to-open transition. `cooldownMin` (default `0` = every check) spaces the repeated pings out; `"whileAvailable": false` restores transition-only alerts. IDs come from config or the environment, never from the code:

```bash
# .env (placeholders)
QNET_MENTION_USERS=123456789012345678,234567890123456789   # Discord user IDs
QNET_MENTION_ROLES=345678901234567890                      # Discord role IDs
QNET_MENTION_SLACK=U0123ABCD                               # Slack member IDs
```

Discord sends `<@USER_ID>` / `<@&ROLE_ID>` and sets `allowed_mentions` so **only those IDs** are pinged (never `@everyone`/`@here`). Slack gets `<@U...>`. Telegram does not support ID mentions.

#### How to get a Discord user/role ID

1. Enable Developer Mode: **User Settings > Advanced > Developer Mode**.
2. User ID: right-click the user, then **Copy User ID** (mobile: long-press the user, or the ... menu, then **Copy User ID**).
3. Role ID: **Server Settings > Roles > ... > Copy Role ID**. The role needs **Allow anyone to @mention this role** (Roles > the role > Display), otherwise the ping will not notify anyone.
4. Put the IDs in `.env` as `QNET_MENTION_USERS` / `QNET_MENTION_ROLES` (comma-separated) or in `config.json` under `mentions`.

### Table image

With `tableImage` set, the current seat table (date, region, venue, exam, capacity, applied, seats left) is rendered to a PNG and attached to the webhook message. The top line is the check time in KST, e.g. **2026-11-27 14:03 KST 기준**, and rows with open seats are highlighted green.

```json
{ "tableImage": { "every": true } }
```

- `every: true` sends the image on every check; the default `false` sends it only when the table changed since the last check (the first check counts as a change).
- **One message per check.** On Discord the alert embed and the table image go out as a single multipart message (image embedded in the embed), with the mention text exactly once and `allowed_mentions` limited to the configured IDs. If a check has no alert but `every` is on, an image-only message is sent without any mention. Mentions follow `cooldownMin`; quiet hours send nothing (images included); `rateLimit` counts the combined message. Telegram uses `sendPhoto` with the alert text as caption (one message). Slack incoming webhooks cannot upload files, so Slack only gets the text alert.
- The image height is measured from the real layout (a first headless pass), so long venue names that wrap are not clipped. Chrome runs with its sandbox on; `--no-sandbox` is added only on Linux when running as root (e.g. in a container), where Chrome refuses to start otherwise.
- **Renderer choice:** no new npm dependency and no Playwright. The HTML table is screenshotted with the system Chrome/Chromium/Edge in headless mode (auto-detected; override with `tableImage.chrome` or `QNET_CHROME`). If no browser is found, only the image is skipped and the error is logged; text alerts are unaffected.
- Sample from fictional fixture data (`node scripts/make-sample-image.js`):

![sample table image](docs/table-sample.png)

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
| `schedule` | Cron-like `min hour dom month dow` (local time, e.g. `*/10 9-18 * * 1-5`): the watcher only runs when the schedule has fired since its last run. The global `intervalMin` still sets how often the loop wakes |
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

## Deployment

systemd, Windows Task Scheduler, PM2 and Docker recipes: [docs/deploy.md](docs/deploy.md).

## Hot reload

While running, the config file is re-read automatically when it changes (checked every ≤30 s), or immediately on `SIGHUP` (`kill -HUP <pid>`, Linux/macOS). An invalid new config is rejected and the previous one keeps running, with the error printed.

## Editor autocompletion

A JSON Schema ships in [`schemas/config.schema.json`](schemas/config.schema.json). Add `"$schema": "./schemas/config.schema.json"` (or the raw GitHub URL) to your `config.json` for completion and inline errors in VS Code and other editors.
