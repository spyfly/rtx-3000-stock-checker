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
    },
    {
      name: 'check_asus_webshop',
      interval: config.asus_webshop.check_interval,
    },
    {
      name: 'check_alternate',
      interval: config.alternate.check_interval,
      closeWorkerAfterMs: 28500 * 5
    },
    {
      name: 'check_mediamarkt',
      cron: config.ceconomy.cron,
      hasSeconds: true
    },
    {
      name: 'check_saturn',
      cron: config.ceconomy.cron,
      hasSeconds: true
    }
  ]
});
bree.start();
