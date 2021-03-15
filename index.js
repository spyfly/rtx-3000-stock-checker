const path = require('path');
const config = require('./config.json');

// required
const Bree = require('bree');

const bree = new Bree({
  jobs: [
    {
      name: 'check_nvidia',
      interval: config.nvidia.check_interval
    },
    {
      name: 'check_nbb',
      interval: config.nbb.check_interval
    },
    {
      name: 'check_nbb_outlet',
      interval: config.nbb_outlet.check_interval
    },
    {
      name: 'trigger_nbb_autobuy',
      interval: config.autobuy.interval
    }
  ]
});
bree.start();