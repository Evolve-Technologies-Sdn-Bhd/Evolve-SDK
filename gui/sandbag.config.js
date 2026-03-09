module.exports = {
  name: 'Evolve SDK GUI Performance Tests',
  scenarios: [
    {
      name: 'Component Rendering',
      file: './test/sandbag.perf.test.ts'
    }
  ],
  threshold: {
    'Component Rendering': 100 // milliseconds
  },
  iterations: 100,
  warmupIterations: 10,
  outputFormat: 'json'
};
