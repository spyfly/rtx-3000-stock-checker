process.env["NTBA_FIX_319"] = 1;
const TelegramBot = require('node-telegram-bot-api');
const config = require('../config.json');
const { performance } = require('perf_hooks');

const { chromium } = require('playwright');

const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;

const nbb_parser = require('../libs/nbb_parser.js');
const nbb_deals = require('../libs/nbb_deals.js');
const imposter = require('../libs/imposter.js');
const fs = require('fs/promises');

async function checkNbbCustom() {
    var browser_context = {
        userAgent: config.browser.user_agent,
        viewport: {
            width: 1280,
            height: 720
        }
    };
    var cookies = [];
    var puppeteer_args = {};
    var proxy = "default";

    //Using a proxy
    if (config.nbb_custom.proxies) {
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

    if (config.nbb_custom.proxies) {
        await browser.addCookies(cookies);
        //console.log("Set cookies");
    }

    const storeUrl = 'https://www.notebooksbilliger.de/pc+hardware/grafikkarten/nvidia/geforce+rtx+3000+serie+nvidia';

    let time = performance.now();
    await page.goto(storeUrl, { waitUntil: 'load', timeout: 0 });
    console.log(`Fetched NBB RTX 3000 Stock in ${((performance.now() - time) / 1000).toFixed(2)} s`);

    //console.log("Page loaded")

    const data = await page.content();

    var message, status;

    //console.log(productName);

    //Checking Page Contents
    var deals = {}
    if (data.includes("client has been blocked by bot protection.")) {
        message = "NBB Bot blocked by bot protection! UA: " + await page.evaluate(() => navigator.userAgent);;
        status = "blocked_by_bot_protection";

        console.log(message);
        //Generate new User Agent String
        await imposter.generateNewDetails(proxy);
    } else {
        try {
            //Page loaded
            if (data.includes("Es gibt keine Produkte in dieser Kategorie.")) {
                console.log("RTX 3000 Series Cards still out of Stock")

            } else {
                console.log("RTX 3000 Series Cards seem to be in Stock at NBB!")
                const html = await page.content();
                deals = await nbb_parser(html);
            }

            //await deal_notify(deals, 'nbb_custom_deals', 'nbb');
            await nbb_deals.addUnconfirmedDeals(deals);
        } catch (error) {
            console.log(error);
            bot.sendMessage(chat_id, "An error occurred fetching the NBB RTX 3000 Deals Page");
        }
    }

    if (config.nbb_custom.proxies) {
        await imposter.updateCookies(proxy, await browser.cookies());
    }
    await browser.close();
    //console.log("------------------------------------------------------------------")
}

checkNbbCustom();