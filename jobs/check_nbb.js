process.env["NTBA_FIX_319"] = 1;
const TelegramBot = require('node-telegram-bot-api');
const config = require('../config.json');

const puppeteer = require('puppeteer');

const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;

const level = require('level-party')
var db = level('./status', { valueEncoding: 'json' })

config.nbb.cards.forEach(async card => {
    await checkNbb(card);
});

async function checkNbb(card) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 })

    //Messing with the User Agent to circumvent Bot Prevention
    await page.setUserAgent(config.browser.user_agent);

    const storeUrl = 'https://www.notebooksbilliger.de/nvidia+geforce+rtx+' + card.toLowerCase().replace(" ", "+") + '+founders+edition';
    const productName = "NVIDIA GeForce RTX " + card + " Founders Edition";

    await page.goto(storeUrl);
    await page.screenshot({ path: 'debug_' + card.toLowerCase().replace(" ", "+") + '.png' });

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

    await browser.close();
    console.log("------------------------------------------------------------------")
}