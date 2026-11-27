# Running it 24/7

Pick one. In every case keep secrets in `.env` (see `.env.example`) and never commit `config.json`/`.env`.
The watcher is alert-only and polls politely (default every 5 min, minimum 2).

## systemd (Linux)
Use [`deploy/qnet-alert.service`](../deploy/qnet-alert.service); the header comments list the steps.
`systemctl reload qnet-alert` triggers a config hot-reload (SIGHUP); logs: `journalctl -u qnet-alert -f`.

## Windows Task Scheduler
Run [`deploy/windows-task.ps1`](../deploy/windows-task.ps1) in PowerShell. It starts the watcher at logon
and restarts it on failure. Windows has no SIGHUP, but editing `config.json` is still picked up within 30 s.
Remove with `Unregister-ScheduledTask -TaskName qnet-seat-alert -Confirm:$false`.

## PM2
```
npm i -g pm2
pm2 start deploy/ecosystem.config.cjs
pm2 save && pm2 startup     # follow the printed command
pm2 sendSignal SIGHUP qnet-alert   # reload config
```

## Docker
`docker compose up -d` (see `docker-compose.yml`), or run the prebuilt multi-arch image published to GHCR on every `vX.Y.Z` tag:

```
docker run -d --name qnet-alert --env-file .env -v "$PWD/data:/data" ghcr.io/lilicoderr/qnet-seat-alert:latest
```

Put `config.json` in `./data`. Publishing is done by `.github/workflows/docker.yml`.
