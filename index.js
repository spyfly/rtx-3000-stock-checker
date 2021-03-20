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
      interval: config.nbb.check_interval
    },
    {
      name: 'check_nbb_outlet',
      interval: config.nbb_outlet.check_interval,
      closeWorkerAfterMs: 9500
    },
    {
      name: 'check_nbb_custom',
      interval: config.nbb_custom.check_interval
    },
    {
      name: 'check_asus_webshop',
      interval: config.asus_webshop.check_interval,
      closeWorkerAfterMs: 9500
    },
    {
      name: 'check_ceconomy',
      interval: config.ceconomy.check_interval
    }
  ]
});
bree.start();
