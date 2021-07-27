process.env["NTBA_FIX_319"] = 1;
const TelegramBot = require('node-telegram-bot-api');

const config = require('../config.json');
const bot = new TelegramBot(config.services.telegram.token);
const debug_chat_id = config.services.telegram.debug_chat_id;

const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin())

const nbb_parser = require('../libs/nbb_parser.js');
const deal_notify = require('../libs/deal_notify.js');
const wr_circumvention = require('../libs/nbb_wr_circumvention.js');

const imposter = require('../libs/imposter.js');

const crypto = require("crypto");

const level = require('level-party')
const db = level('./status', { valueEncoding: 'json' })

function getRandom(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

(async () => {
    const storeUrls = {
        outlet: 'https://www.notebooksbilliger.de/extensions/apii/filter.php?filters=on&listing=on&advisor=&box_61967_22250%5B%5D=143&box_61969_22250_min=' + getRandom(50, 100) + '&box_61969_22250_max=' + getRandom(2000, 2500) + '&box_61969_22250_slid=1&box_65348_22250=&box_62049_22250=&action=applyFilters&category_id=22250&page=1&perPage=&sort=popularity&order=desc&availability=alle&eqsqid=',
        nvidia: 'https://www.notebooksbilliger.de/extensions/apii/filter.php?filters=on&listing=on&advisor=&box_64904_2817_min=&box_64904_2817_max=&box_64904_2817_slid=&box_64906_2817_min=' + getRandom(150, 250) + '&box_64906_2817_max=' + getRandom(3000, 3500) + '&box_64906_2817_slid=1&box_64908_2817_min=&box_64908_2817_max=&box_64908_2817_slid=&box_64910_2817=&action=applyFilters&category_id=2817&page=1&perPage=&sort=price&order=desc&availability=alle&eqsqid='
    }

    var nbbDeals = {};

    var tasks = [];
    tasks.push(checkCasekingGPUOverview());

    await Promise.all(tasks);
    await deal_notify(nbbDeals, 'nbb_deals', 'nbb');
    await db.close();
})();

async function checkCasekingGPUOverview() {
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
        timezoneId: 'Europe/Berlin',
    };
    var proxy = "default";

    //Using a proxy
    if (config.nbb.proxies) {
        proxy = await imposter.getRandomProxy("caseking");
        const browserDetails = await imposter.getBrowserDetails(proxy);
        if (proxy != undefined) {
            browser_context.proxy = {
                server: proxy
            };
            browser_context.userAgent = browserDetails.userAgent;
            browser_context.viewport = browserDetails.viewport;
        } else {
            proxy = "default";
            console.log("All Proxies blacklisted on Caseking.de!");
            bot.sendMessage(debug_chat_id, "All Proxies blacklisted on Caseking.de!");
        }
    }

    const context = await puppeteer.launch({
        userDataDir: '/tmp/caseking-checker/',
        args: [
            '--proxy-server=' + proxy,
            '--lang=de-DE'
        ],
        headless: false
    });
    const page = await context.newPage();
    await page.goto("https://www.caseking.de/pc-komponenten/grafikkarten/");
    await page.waitForTimeout(100000);

    await context.close();
}