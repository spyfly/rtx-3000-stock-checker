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
      name: 'find_nbb_urls',
      interval: config.nbb.search_interval,
    },
    {
      name: 'check_asus_webshop',
      interval: config.asus_webshop.check_interval,
    },
    {
      name: 'check_alternate',
      interval: config.alternate.check_interval,
      closeWorkerAfterMs: 28500 * 20
    },
    {
      name: 'check_mediamarkt',
      interval: config.ceconomy.check_interval,
      hasSeconds: true
    },
    {
      name: 'check_saturn',
      interval: config.ceconomy.check_interval,
      hasSeconds: true
    },
    {
      name: 'send_coffee',
      cron: '0 14 * * *'
    }
  ]
});
bree.start();
