module.exports = {
  apps: [
    {
      name: 'reviewgate',
      script: 'npx',
      args: 'wrangler dev --local --ip 0.0.0.0 --port 3000',
      cwd: '/home/user/webapp3',
      env: { NODE_ENV: 'development', PORT: 3000 },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 5
    }
  ]
}
