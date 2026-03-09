module.exports = {
  name: 'Evolve SDK Performance Tests',
  scenarios: [
    {
      name: 'Database Operations',
      file: './test/sandbag.perf.test.ts'
    }
  ],
  threshold: {
    'Database Operations': 50 // milliseconds
  },
  iterations: 100,
  warmupIterations: 10,
  outputFormat: 'json'
};
