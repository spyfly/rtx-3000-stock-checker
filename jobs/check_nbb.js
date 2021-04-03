process.env["NTBA_FIX_319"] = 1;
const TelegramBot = require('node-telegram-bot-api');

const config = require('../config.json');
const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;
const debug_chat_id = config.services.telegram.debug_chat_id;

const { chromium } = require('playwright')

const nbb_parser = require('../libs/nbb_parser.js');
const deal_notify = require('../libs/deal_notify.js');

const imposter = require('../libs/imposter.js');

function getRandom(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

(async () => {
    const storeUrls = {
        outlet: 'https://www.notebooksbilliger.de/extensions/apii/filter.php?filters=on&listing=on&advisor=&box_61967_22250%5B%5D=143&box_61969_22250_min=' + getRandom(50, 100) + '&box_61969_22250_max=' + getRandom(2000, 2500) + '&box_61969_22250_slid=1&box_65348_22250=&box_62049_22250=&action=applyFilters&category_id=22250&page=1&perPage=&sort=popularity&order=desc&availability=alle&eqsqid=',
        nvidia: 'https://www.notebooksbilliger.de/extensions/apii/filter.php?filters=on&listing=on&advisor=&box_64904_2817_min=&box_64904_2817_max=&box_64904_2817_slid=&box_64906_2817_min=' + getRandom(150, 250) + '&box_64906_2817_max=' + getRandom(3000, 3500) + '&box_64906_2817_slid=1&box_64908_2817_min=&box_64908_2817_max=&box_64908_2817_slid=&box_64910_2817=&action=applyFilters&category_id=2817&page=1&perPage=&sort=price&order=desc&availability=alle&eqsqid=',
        nvidia_fe: 'https://www.notebooksbilliger.de/extensions/apii/filter.php?filters=on&listing=on&advisor=&box_64904_0_min=&box_64904_0_max=&box_64904_0_slid=&box_64906_0_min=' + getRandom(150, 250) + '&box_64906_0_max=' + getRandom(3000, 3500) + '&box_64906_0_slid=1&box_64908_0_min=&box_64908_0_max=&box_64908_0_slid=&box_64910_0=&action=applyFilters&category_id=0&page=1&perPage=&sort=price&order=desc&availability=alle&eqsqid='
    }

    var nbbDeals = {};

    var tasks = [];
    for (const [name, storeUrl] of Object.entries(storeUrls)) {
        const task = checkNbbApi(storeUrl, name);
        tasks.push(task);
        task.then((deals) => {
            Object.assign(nbbDeals, deals);
        },
            (err) => {
                console.log("Failed fetching NBB " + name + " page:" + err)
            });
    }

    await Promise.all(tasks);
    await deal_notify(nbbDeals, 'nbb_deals', 'nbb');
})();

async function checkNbbApi(storeUrl, apiPage) {
    var browser_context = {
        userAgent: config.browser.user_agent,
        viewport: {
            width: 1280,
            height: 720
        },
        extraHTTPHeaders: {
            DNT: "1"
        },
        locale: 'de-DE',
        timezoneId: 'Europe/Berlin'
    };
    var proxy = "default";

    //Using a proxy
    if (config.nbb.proxies) {
        proxy = await imposter.getRandomProxy();
        const browserDetails = await imposter.getBrowserDetails(proxy);
        browser_context.storageState = {
            cookies: browserDetails.cookies
        };
        browser_context.proxy = {
            server: proxy
        };
        browser_context.userAgent = browserDetails.userAgent;
        browser_context.viewport = browserDetails.viewport;
    }

    const browser = await chromium.launch(browser_context);
    const context = await browser.newContext(browser_context);
    const page = await context.newPage();
    await page.goto(storeUrl);

    const response = await page.content();
    if (response.includes("client has been blocked by bot protection")) {
        console.log("Blocked by Bot Protection on the NBB " + apiPage + " Page | Proxy: " + proxy);
        await page.screenshot({ path: 'debug_' + apiPage + '_blocked.png' });
        bot.sendPhoto(debug_chat_id, 'debug_' + apiPage + '_blocked.png', { caption: "Blocked by Bot Protection on the NBB " + apiPage + " Page | Proxy: " + proxy });
    } else {
        try {
            var deals = await nbb_parser(response);
            //await deal_notify(deals, 'nbb_outlet_deals', 'nbb');
            //await nbb_deals.addUnconfirmedDeals(deals);
            console.log("Found " + Object.keys(deals).length + " Deals on NBB " + apiPage + " Page")

            await browser.close();
            return deals;
        } catch (error) {
            console.log(error);
            bot.sendMessage(chat_id, "An error occurred fetching the NBB " + apiPage + " Page");

            await browser.close();
            return {};
        }
    }
    await browser.close();
}