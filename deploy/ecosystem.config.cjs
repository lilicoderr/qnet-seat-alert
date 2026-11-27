// PM2: pm2 start deploy/ecosystem.config.cjs && pm2 save && pm2 startup
// Secrets stay in .env (loaded by qnet-alert itself); nothing secret belongs here.
module.exports = {
  apps: [
    {
      name: 'qnet-alert',
      script: 'bin/qnet-alert.js',
      args: '--json',
      cwd: __dirname + '/..',
      autorestart: true,
      restart_delay: 15000,
      max_restarts: 20,
      time: true,
    },
  ],
};
