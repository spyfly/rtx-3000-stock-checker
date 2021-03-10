const path = require('path');
const config = require('./config.json');

// required
const Bree = require('bree');

const bree = new Bree({
  jobs: [
    {
      name: 'check_nvidia',
      interval: config.nvidia.check_interval,
      closeWorkerAfterMs: 10000
    },
    {
      name: 'check_nbb',
      interval: config.nbb.check_interval
    },
    {
      name: 'trigger_nbb_autobuy',
      interval: config.autobuy.interval
    }
  ]
});
bree.start();