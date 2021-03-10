process.env["NTBA_FIX_319"] = 1;
const TelegramBot = require('node-telegram-bot-api');

const config = require('../config.json');
const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;

const puppeteer = require('puppeteer');

const imposter = require('../libs/imposter.js');

const level = require('level-party')
var db = level('./status', { valueEncoding: 'json' })

const nvShopUrl = 'https://www.nvidia.com/de-de/shop/geforce/';

async function main() {
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
    if (config.nvidia.proxies) {
        proxy = await imposter.getRandomProxy();
        browserDetails = await imposter.getBrowserDetails(proxy);
        puppeteer_args.userDataDir = '/tmp/rtx-3000-stock-checker/' + proxy.replace(/\./g, "-").replace(/\:/g, "_");
        puppeteer_args.args = ['--proxy-server=http://' + proxy];
    }

    const browser = await puppeteer.launch(puppeteer_args);
    const page = await browser.newPage();

    //Messing with the User Agent and Viewport to circumvent Bot Prevention
    await page.setCacheEnabled(true);
    await page.setViewport(browserDetails.viewport)
    await page.setUserAgent(browserDetails.userAgent);

    await page.goto("https://api.nvidia.partners/edge/product/search?page=1&limit=9&locale=de-de", { waitUntil: 'load', timeout: 0 });
    var content = await page.content()
    content = content.replace('<html><head></head><body><pre style="word-wrap: break-word; white-space: pre-wrap;">', "");
    content = content.replace('</pre></body></html>', '')

    await page.close();
    await browser.close();

    try {
        const json = JSON.parse(content);
        const products = json.searchedProducts.productDetails;
        products.push(json.searchedProducts.featuredProduct);
        products.forEach(function (product) {
            if (product.isFounderEdition) {
                console.log(product.displayName);
                var status, message;
                const card = product.displayName.replace("Nvidia RTX ", "");

                if (product.prdStatus != 'out_of_stock' || product.purchaseOption != '' || product.isOffer != false) {
                    status = "in_stock";
                    console.log("> Is in stock!")
                } else {
                    status = "out_of_stock";
                    console.log("> Still out of stock. | Stock Status: " + product.prdStatus)
                }

                message = product.displayName + " is " + product.prdStatus + " at " + nvShopUrl;

                const db_key = card + " NV";
                db.get(db_key, function (err, oldStatus) {
                    if (oldStatus != status) {
                        bot.sendMessage(chat_id, message);
                        db.put(db_key, status, function (err) { });
                    }
                });
                console.log("------------------------------------------------------------------")
            }
        });
    } catch (error) {
        console.log(error);
        bot.sendMessage(chat_id, "An error occurred fetching Nvidias page, cards may be available: " + nvShopUrl);
    }
}

main();