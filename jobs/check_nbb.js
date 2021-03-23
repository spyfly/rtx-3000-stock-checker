process.env["NTBA_FIX_319"] = 1;
const TelegramBot = require('node-telegram-bot-api');
const config = require('../config.json');
const { performance } = require('perf_hooks');

const { chromium } = require('playwright');

const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;

const imposter = require('../libs/imposter.js');
const nbb_deals = require('../libs/nbb_deals.js');
const deal_notify = require('../libs/deal_notify.js');

(async () => {
    const unconfirmedDeals = await nbb_deals.getUnconfirmedDeals();

    // Always check FEs
    /*
    unconfirmedDeals[3060] = {
        title: "NVIDIA GeForce RTX 3060 Ti Founders Edition",
        href: "https://www.notebooksbilliger.de/nvidia+geforce+rtx+3060+ti+founders+edition",
        price: 419.99
    }

    unconfirmedDeals[3070] = {
        title: "NVIDIA GeForce RTX 3070 Founders Edition",
        href: "https://www.notebooksbilliger.de/nvidia+geforce+rtx+3070+founders+edition",
        price: 519.99
    }

    unconfirmedDeals[3080] = {
        title: "NVIDIA GeForce RTX 3080 Founders Edition",
        href: "https://www.notebooksbilliger.de/nvidia+geforce+rtx+3080+founders+edition",
        price: 719.99
    }

    unconfirmedDeals[3090] = {
        title: "NVIDIA GeForce RTX 3090 Founders Edition",
        href: "https://www.notebooksbilliger.de/nvidia+geforce+rtx+3090+founders+edition",
        price: 1549.99
    }
    */

    //unconfirmedDeals[id] = {}
    var deals = {};

    var tasks = [];
    for (const [id, deal] of Object.entries(unconfirmedDeals)) {
        const task = checkNbb(deal).then(async (status) => {
            if (status == "in_stock") {
                //Add Deal
                deals[id] = deal;
            } else if (status == "out_of_stock") {
                //Purge Deal
                await nbb_deals.purgeDeal(id);
            }
        });
        tasks.push(task);
    }

    await Promise.all(tasks);
    await deal_notify(deals, 'nbb_deals', 'nbb');
})();

async function checkNbb(deal) {
    var browser_context = {
        userAgent: config.browser.user_agent,
        viewport: {
            width: 1280,
            height: 720
        }
    };
    var cookies = [];
    var proxy = "default";

    //Using a proxy
    if (config.nbb.proxies) {
        proxy = await imposter.getRandomProxy();
        const browserDetails = await imposter.getBrowserDetails(proxy);
        cookies = browserDetails.cookies;
        browser_context.proxy = {
            server: proxy
        };
        browser_context.userAgent = browserDetails.userAgent;
        browser_context.viewport = browserDetails.viewport;
    }

    const browser = await chromium.launchPersistentContext('/tmp/rtx-3000-stock-checker/' + proxy.replace(/\./g, "-").replace(/\:/g, "_"), browser_context);
    const page = await browser.newPage();

    let time = performance.now();
    await page.goto(deal.href, { waitUntil: 'load', timeout: 0 });
    console.log(`Fetched NBB ${deal.title} Stock in ${((performance.now() - time) / 1000).toFixed(2)} s`);

    //console.log("Page loaded")

    const data = await page.content();

    var message, status;

    //console.log(productName);

    //Checking Page Contents
    if (data.includes("client has been blocked by bot protection.")) {
        message = "NBB Bot blocked by bot protection! UA: " + await page.evaluate(() => navigator.userAgent);;
        status = "blocked_by_bot_protection";

        //Send Message
        console.log(message);
        await bot.sendMessage(chat_id, message);

        //Generate new User Agent String
        await imposter.generateNewDetails(proxy);
    } else if (data.includes(deal.title)) {
        //console.log("Successfully fetched product page!")
        if (data.includes("Dieses Produkt ist leider ausverkauft.") || data.includes("Leider ist dieser Artikel nicht mehr verfügbar.")) {
            message = deal.title + " out of Stock on NBB";
            status = "out_of_stock";
        } else {
            message = deal.title + " on NBB: " + deal.href;
            status = "in_stock"
        }
    } else {
        message = "Couldn't fetch NBB product page, maybe new bot protection?";
        status = "fetch_failure"

        //Send Message
        console.log(message);
        await bot.sendMessage(chat_id, message);
    }

    //console.log("> " + message)

    await page.screenshot({ path: 'screenshots/debug_' + deal.title.toLowerCase().replace(" ", "+") + '.png' });

    await browser.close();

    return status;
    //console.log("------------------------------------------------------------------")
}