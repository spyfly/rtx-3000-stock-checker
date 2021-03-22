process.env["NTBA_FIX_319"] = 1;
const axios = require('axios').default;
const { SocksProxyAgent } = require('socks-proxy-agent');

const TelegramBot = require('node-telegram-bot-api');

const config = require('../config.json');
const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;

const nbb_parser = require('../libs/nbb_parser.js');
const nbb_deals = require('../libs/nbb_deals.js');

(async () => {
    const storeUrls = {
        outlet: 'https://www.notebooksbilliger.de/extensions/apii/filter.php?filters=on&listing=on&advisor=&box_549_7248%5B%5D=143&box_551_7248_min=&box_551_7248_max=&box_551_7248_slid=&box_65775_7248=&box_65776_7248=&action=applyFilters&category_id=7248&page=1&perPage=&sort=price&order=asc&availability=alle&eqsqid=',
        nvidia: 'https://www.notebooksbilliger.de/extensions/apii/filter.php?filters=on&listing=on&advisor=&box_64904_2817_min=&box_64904_2817_max=&box_64904_2817_slid=&box_64906_2817_min=250&box_64906_2817_max=3000&box_64906_2817_slid=1&box_64908_2817_min=&box_64908_2817_max=&box_64908_2817_slid=&box_64910_2817=&action=applyFilters&category_id=2817&page=1&perPage=&sort=price&order=desc&availability=alle&eqsqid='
    }

    var tasks = [];
    for (const [name, storeUrl] of Object.entries(storeUrls)) {
        const task = checkNbbApi(storeUrl, name);
        tasks.push(task);
    }

    await Promise.all(tasks);
})();

async function checkNbbApi(storeUrl, page) {
    var axios_config = {
        headers: { 'User-Agent': config.browser.user_agent }
    }

    //Using a proxy
    if (config.nbb_api.proxies) {
        const imposter = require('../libs/imposter.js');

        proxy = await imposter.getRandomProxy();
        browserDetails = await imposter.getBrowserDetails(proxy);
        axios_config.httpsAgent = new SocksProxyAgent(proxy);
        axios_config.headers = { 'User-Agent': browserDetails.userAgent }
    }

    const response = await axios.get(storeUrl, axios_config);

    try {
        var deals = await nbb_parser(response.data);
        //await deal_notify(deals, 'nbb_outlet_deals', 'nbb');
        await nbb_deals.addUnconfirmedDeals(deals);
        console.log("Found " + Object.keys(deals).length + " Deals on NBB " + page + " Page")
    } catch (error) {
        console.log(error);
        bot.sendMessage(chat_id, "An error occurred fetching the NBB " + page + " Page");
    }
}