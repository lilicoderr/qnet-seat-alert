# Running it 24/7

Pick one. In every case keep secrets in `.env` (see `.env.example`) and never commit `config.json`/`.env`.
The watcher is alert-only and polls politely (default every 5 min, minimum 1).

## systemd (Linux)
Use [`deploy/qnet-alert.service`](../deploy/qnet-alert.service); the header comments list the steps.
`systemctl reload qnet-alert` triggers a config hot-reload (SIGHUP); logs: `journalctl -u qnet-alert -f`.

## Windows Task Scheduler
From the project folder run `powershell -ExecutionPolicy Bypass -File .\deploy\windows-task.ps1`
([script](../deploy/windows-task.ps1)). It starts the watcher when you log on and restarts it on failure.
For a one-off session, double-click `start-watch.bat` instead. Windows has no SIGHUP, but editing `config.json` is still picked up within 30 s.
Remove with `Unregister-ScheduledTask -TaskName qnet-seat-alert -Confirm:$false`.

## PM2
```
npm i -g pm2
pm2 start deploy/ecosystem.config.cjs
pm2 save && pm2 startup     # follow the printed command
pm2 sendSignal SIGHUP qnet-alert   # reload config
```

## Docker
`mkdir data && cp config.example.json data/config.json`, edit it, then `docker compose up -d --build`
(see `docker-compose.yml`; `QNET_*` come from `.env`), or run the prebuilt multi-arch image published to GHCR on every `vX.Y.Z` tag:

```
docker run -d --name qnet-alert --env-file .env -v "$PWD/data:/data" ghcr.io/lilicoderr/qnet-seat-alert:latest
```

Put `config.json` in `./data`. Publishing is done by `.github/workflows/docker.yml`.

## GitHub Actions (no server)
See [`scheduled-example.yml.disabled`](../.github/workflows/scheduled-example.yml.disabled) for a cron variant.
