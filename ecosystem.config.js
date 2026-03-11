module.exports = {
  apps: [
    // ============================================
    // BASELINE PERFORMANCE TESTS
    // ============================================
    
    // SDK Core Performance Test
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

    // SDK Serial Communication Performance Test
    {
      name: 'sdk-serial-perf-test',
      script: 'run-serial-perf-test.js',
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'test',
      },
      error_file: './logs/sdk-serial-perf-error.log',
      out_file: './logs/sdk-serial-perf-output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '800M',
    },

    // SDK MQTT Communication Performance Test
    {
      name: 'sdk-mqtt-perf-test',
      script: 'run-mqtt-perf-test.js',
      autorestart: false,
      watch: false,
      env: {
        NODE_ENV: 'test',
      },
      error_file: './logs/sdk-mqtt-perf-error.log',
      out_file: './logs/sdk-mqtt-perf-output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '800M',
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

    // ============================================
    // LOAD TESTING (READER ACTIVE)
    // Uncomment below to test performance while RFID reader is running
    // ============================================

    {
      name: "rfid-reader-app",
      script: "./run-gui.js", 
      cwd: "./",              
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "development"
      },
      error_file: "./logs/rfid-reader-error.log",
      out_file: "./logs/rfid-reader-output.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      max_memory_restart: "2G"
    }
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
