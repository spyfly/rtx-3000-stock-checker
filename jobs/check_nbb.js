process.env["NTBA_FIX_319"] = 1;
const TelegramBot = require('node-telegram-bot-api');
const config = require('../config.json');

const puppeteer = require('puppeteer');

const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;

const level = require('level-party')
var db = level('./status', { valueEncoding: 'json' })

const UserAgent = require('user-agents');

config.nbb.cards.forEach(async card => {
    await checkNbb(card);
});

async function checkNbb(card) {
    var browserDetails = {
        userAgent: config.browser.user_agent,
        viewport: {
            width: 1280,
            height: 720
        },
        cookies: []
    };
    var puppeteer_args = {};
    var proxy;

    //Using a proxy
    if (config.nbb.proxies) {
        proxy = await getRandomProxy();
        browserDetails = await getBrowserDetails(proxy);
        puppeteer_args.userDataDir = '/tmp/rtx-3000-stock-checker/' + proxy.replace(/\./g, "-").replace(/\:/g, "_");
        puppeteer_args.args = ['--proxy-server=http://' + proxy];
    }

    const browser = await puppeteer.launch(puppeteer_args);
    const page = await browser.newPage();

    if (config.nbb.proxies) {
        await page.setCookie(...browserDetails.cookies);
        console.log("Set cookies");
    }

    //Messing with the User Agent and Viewport to circumvent Bot Prevention
    await page.setCacheEnabled(true);
    await page.setViewport(browserDetails.viewport)
    await page.setUserAgent(browserDetails.userAgent);


    const storeUrl = 'https://www.notebooksbilliger.de/nvidia+geforce+rtx+' + card.toLowerCase().replace(" ", "+") + '+founders+edition';
    const productName = "NVIDIA GeForce RTX " + card + " Founders Edition";

    await page.goto(storeUrl, { waitUntil: 'load', timeout: 0 });

    console.log("Page loaded")

    const data = await page.content();

    var message, status;

    console.log(productName);

    //Checking Page Contents
    if (data.includes("client has been blocked by bot protection.")) {
        message = "NBB Bot blocked by bot protection!";
        status = "blocked_by_bot_protection";
    } else if (data.includes(productName)) {
        //console.log("Successfully fetched product page!")
        if (data.includes("Dieses Produkt ist leider ausverkauft.") || data.includes("Leider ist dieser Artikel nicht mehr verfügbar.")) {
            message = "RTX " + card + " out of Stock on NBB";
            status = "out_of_stock";
        } else {
            message = "Buy RTX " + card + " on NBB: " + storeUrl;
            status = "in_stock"
        }
    } else {
        message = "Couldn't fetch NBB product page, maybe new bot protection?";
        status = "fetch_failure"
    }

    console.log("> " + message)

    const db_key = card + " NBB";
    db.get(db_key, function (err, oldStatus) {
        if (oldStatus != status) {
            bot.sendMessage(chat_id, message);
            db.put(db_key, status, function (err) { });
        }
    });

    await page.screenshot({ path: 'debug_' + card.toLowerCase().replace(" ", "+") + '.png' });

    if (config.nbb.proxies) {
        await updateCookies(proxy, await page.cookies());
    }
    await browser.close();
    console.log("------------------------------------------------------------------")
}

async function getBrowserDetails(proxy) {
    var rawDetails;
    try {
        rawDetails = await db.get(proxy);
        console.log("Found old details, parsing")
        return JSON.parse(rawDetails);
    } catch {
        console.log("Generating new Browser Details for " + proxy)
        const userAgent = new UserAgent({ deviceCategory: 'desktop' });
        details = {
            userAgent: userAgent.userAgent,
            viewport: {
                height: userAgent.viewportHeight,
                width: userAgent.viewportWidth
            },
            cookies: []
        }
        db.put(proxy, JSON.stringify(details))
        return details;
    }
}

async function updateCookies(proxy, cookies) {
    var rawDetails;
    try {
        rawDetails = await db.get(proxy);
        var updatedDetails = JSON.parse(rawDetails);
        updatedDetails.cookies = cookies;
        await db.put(proxy, JSON.stringify(updatedDetails));
        console.log("Updated cookies");
    } catch {
        console.log("Failed storing cookies");
    }
}

async function getRandomProxy() {
    const proxyCount = config.proxies.length
    const proxyId = Math.floor(Math.random() * proxyCount);
    const proxy = config.proxies[proxyId];
    return proxy;
}