process.env["NTBA_FIX_319"] = 1;
const TelegramBot = require('node-telegram-bot-api');
const config = require('../config.json');

const puppeteer = require('puppeteer');

const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;

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
    console.log(productName);

    //Checking Page Contents
    if (data.includes("client has been blocked by bot protection.")) {
        const message = "NBB Bot blocked by bot protection!";
        console.log("> " + message);
        bot.sendMessage(chat_id, message);
    } else if (data.includes(productName)) {
        //console.log("Successfully fetched product page!")
        if (data.includes("Dieses Produkt ist leider ausverkauft.") || data.includes("Leider ist dieser Artikel nicht mehr verfügbar.")) {
            console.log("> " + "Still not in stock!")
        } else {
            const message = "Buy RTX " + card + " on NBB: " + storeUrl;
            console.log("> " + message)
            bot.sendMessage(chat_id, message);
        }
    } else {
        const message = "Couldn't fetch NBB product page, maybe new bot protection?";
        console.log("> " + message)
        bot.sendMessage(chat_id, message);
    }

    await browser.close();
    console.log("------------------------------------------------------------------")
}