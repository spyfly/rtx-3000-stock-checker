const path = require('path');
const config = require('./config.json');

// required
const Bree = require('bree');

const bree = new Bree({
  jobs: [
    {
      name: 'check_nvidia',
      interval: config.nvidia.check_interval,
      closeWorkerAfterMs: 9500
    },
    {
      name: 'check_nbb',
      interval: config.nbb.check_interval,
      closeWorkerAfterMs: 9500
    },
    {
      name: 'check_asus_webshop',
      interval: config.asus_webshop.check_interval,
      closeWorkerAfterMs: 9500
    },
    {
      name: 'check_ceconomy',
      cron: config.ceconomy.cron,
      hasSeconds: true
    }
  ]
});
bree.start();
