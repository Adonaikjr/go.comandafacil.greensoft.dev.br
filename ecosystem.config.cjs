module.exports = {
  apps: [
    {
      name: 'green-food-api',
      cwd: __dirname,
      script: './dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: '5000',
      },
    },
  ],
};
