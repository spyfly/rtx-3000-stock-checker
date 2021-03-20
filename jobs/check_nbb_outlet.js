process.env["NTBA_FIX_319"] = 1;
const axios = require('axios').default;
const ProxyAgent = require('proxy-agent');

const TelegramBot = require('node-telegram-bot-api');

const config = require('../config.json');
const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;

const nbb_parser = require('../libs/nbb_parser.js');
const deal_notify = require('../libs/deal_notify.js');

//const nbbOutletUrl = 'https://www.notebooksbilliger.de/outlet/page/1?box_549_7248%5B%5D=143&sort=price&order=asc&availability=alle';
const nbbOutletCheckerUrl = 'https://www.notebooksbilliger.de/extensions/apii/filter.php?filters=on&listing=on&advisor=&box_549_7248%5B%5D=143&box_551_7248_min=&box_551_7248_max=&box_551_7248_slid=&box_65775_7248=&box_65776_7248=&action=applyFilters&category_id=7248&page=1&perPage=&sort=price&order=asc&availability=alle&eqsqid=';

async function main() {
    var axios_config = {
        headers: { 'User-Agent': config.browser.user_agent }
    }

    //Using a proxy
    if (config.nbb_outlet.proxies) {
        const imposter = require('../libs/imposter.js');

        proxy = await imposter.getRandomProxy();
        browserDetails = await imposter.getBrowserDetails(proxy);
        axios_config.httpsAgent = new ProxyAgent("http://" + proxy);
        axios_config.headers = { 'User-Agent': browserDetails.userAgent }
    }

    const response = await axios.get(nbbOutletCheckerUrl, axios_config);

    try {
        var deals = await nbb_parser(response.data);
        await deal_notify(deals, 'nbb_outlet_deals', 'nbb');
    } catch (error) {
        console.log(error);
        bot.sendMessage(chat_id, "An error occurred fetching the NBB Outlet Page");
    }
}

main();