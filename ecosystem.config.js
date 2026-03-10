module.exports = {
  apps: [
    // SDK Performance Test
    {
      name: 'sdk-perf-test',
      script: 'run-sdk-test.js',
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'test',
      },
      error_file: './logs/sdk-perf-error.log',
      out_file: './logs/sdk-perf-output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '1G',
    },
    // GUI Performance Test
    {
      name: 'gui-perf-test',
      script: 'run-gui-test.js',
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'test',
        CI: 'true',
      },
      error_file: './logs/gui-perf-error.log',
      out_file: './logs/gui-perf-output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '2G',
    },
  ],

  // Deploy section (optional)
  deploy: {
    production: {
      user: 'node',
      host: 'your-host',
      ref: 'origin/main',
      repo: 'git@github.com:your-repo.git',
      path: '/var/www/evolve-sdk',
      'post-deploy': 'npm install && npm run build',
    },
  },
};
