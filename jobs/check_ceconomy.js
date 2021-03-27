process.env["NTBA_FIX_319"] = 1;
const TelegramBot = require('node-telegram-bot-api');
const config = require('../config.json');
const { performance } = require('perf_hooks');

const puppeteer = require('puppeteer-extra')
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha')
const RecaptchaOptions = {
    visualFeedback: true, // colorize reCAPTCHAs (violet = detected, green = solved)
    provider: {
        id: '2captcha',
        token: config.services['2captcha'].token, // REPLACE THIS WITH YOUR OWN 2CAPTCHA API KEY ⚡
    },
}
puppeteer.use(RecaptchaPlugin(RecaptchaOptions))

const deal_notify = require('../libs/deal_notify.js');

const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;

const level = require('level-party');
var db = level('./status', { valueEncoding: 'json' });

const imposter = require('../libs/imposter.js');

(async () => {
    var tasks = [];
    //Check Saturn
    tasks.push(checkCeconomy(0));

    //Check Mediamarkt
    tasks.push(checkCeconomy(1));

    await Promise.all(tasks);
    db.close();
})();

async function checkCeconomy(storeId) {
    const stores = [
        {
            url: "www.saturn.de",
            graphQlName: "Saturn",
            name: "Saturn",
        },
        {
            url: "www.mediamarkt.de",
            graphQlName: "Media",
            name: "MediaMarkt"
        }
    ]
    const store = stores[storeId];

    var browser_context = {
        userAgent: config.browser.user_agent,
        viewport: {
            width: 1280,
            height: 720
        }
    };
    var cookies = [];
    var puppeteer_args = ['--no-sandbox'];
    var proxy = "default";

    //Using a proxy
    if (config.ceconomy.proxies) {
        proxy = await imposter.getRandomProxy(store.name);
        if (proxy != undefined) {
            const browserDetails = await imposter.getBrowserDetails(proxy);
            cookies = browserDetails.cookies;
            browser_context.proxy = {
                server: proxy
            };
            browser_context.userAgent = browserDetails.userAgent;
            browser_context.viewport = browserDetails.viewport;
            //browser_context.viewport.height = 10000;

            puppeteer_args.push('--proxy-server=' + proxy);
        } else {
            proxy = "default"
            console.log("All proxies blacklisted, using no proxy!")
        }
    }

    //const browser = await chromium.launchPersistentContext('/tmp/rtx-3000-stock-checker/' + proxy.replace(/\./g, "-").replace(/\:/g, "_"), browser_context);
    const browser = await puppeteer.launch({
        userDataDir: '/tmp/rtx-3000-stock-checker/' + proxy.replace(/\./g, "-").replace(/\:/g, "_"),
        args: puppeteer_args
    });

    const page = await browser.newPage();
    page.setUserAgent(browser_context.userAgent);
    page.setViewport(browser_context.viewport)
    page.setExtraHTTPHeaders({ DNT: "1" });

    if (config.ceconomy.proxies) {
        //await browser.addCookies(cookies);
        //console.log("Set cookies");
    }

    var captcha = false;
    try {
        var deals = {};

        let time = performance.now();

        const productIds = await getProductIds(page, store, proxy);

        var i, j, productsChunk, chunk = 30;

        for (i = 0, j = productIds.length; i < j; i += chunk) {
            productsChunk = productIds.slice(i, i + chunk);

            const itemObj = {
                items: []
            };

            for (const productId of productsChunk) {
                itemObj.items.push({
                    id: productId,
                    type: "Product",
                    priceOverride: null
                })
            }

            const url = "https://" + store.url + "/api/v1/graphql?operationName=GetProductCollectionItems&variables=" + encodeURIComponent(JSON.stringify(itemObj)) + "&extensions=" + encodeURIComponent('{"pwa":{"salesLine":"' + store.graphQlName + '","country":"DE","language":"de"},"persistedQuery":{"version":1,"sha256Hash":"336da976d5643762fdc280b67c0479955c33794fd23e98734c651477dd8a2e4c"}}')

            //await page.waitForTimeout(5000);
            await page.setExtraHTTPHeaders({ 'Content-Type': 'application/json', 'apollographql-client-name': 'pwa-client', 'apollographql-client-version': '7.1.2' })
            const response = await page.goto(url);
            console.log(store.name + ": " + response.status() + " | " + proxy);
            if (response.status() != 200) {
                try {
                    console.log("Waiting for browser to be checked!")
                    const resp = await page.waitForNavigation({ timeout: 15000 });
                    if (resp.status() != 200) {
                        console.log("Navigation failed!");
                        throw "Navigation_failed";
                    }
                } catch (error) {
                    if (proxy !== "default") {
                        console.log("Blacklisting IP: " + proxy);
                        await imposter.blackListProxy(proxy, store.name);
                        return await browser.close();
                    } else {
                        //Load overview page for captcha solving
                        await getProductIds(page, store, proxy, true);
                    }
                }
                await page.screenshot({ path: 'debug_' + store.name + '_chunk.png' });
            }

            const jsonEl = await page.waitForSelector('pre');
            const htmlJSON = await page.evaluate(el => el.textContent, jsonEl)
            const json = JSON.parse(htmlJSON);
            const stockDetails = json.data.getProductCollectionItems.visible;
            for (const stockDetail of stockDetails) {
                //Product exists?
                if (!stockDetail.product)
                    continue;

                //Skip if out of stock
                if (stockDetail.availability.delivery.availabilityType == 'NONE')
                    continue;

                //Check if quantity is available before notifying
                if (stockDetail.availability.delivery.quantity == 0)
                    continue;

                const id = stockDetail.productId;
                const card = {
                    title: stockDetail.product.title,
                    href: "https://" + store.url + stockDetail.product.url,
                    price: stockDetail.price.price
                }
                deals[id] = card;
                //console.log(stockDetail);
                console.log(card.title + " in stock for " + card.price + "€ at " + store.name)
            }
        }

        //Processing Notifications
        await deal_notify(deals, store.name + '_webshop_deals', 'ceconomy');

        console.log(store.name + ` Deals processed in ${((performance.now() - time) / 1000).toFixed(2)} s`)
    } catch (error) {
        console.log(error);
        if (error.message.includes("Cannot read property 'apolloState' of undefined") && captcha) {
            //Incorrect captcha solution
            await page.screenshot({ path: 'debug_' + store.name + '_incorrect.png' });
            bot.sendPhoto(chat_id, 'debug_' + store.name + '_incorrect.png', { caption: "Captcha solved incorrectly on " + store.name + " Webshop Page for IP: " + proxy });
        } else if (error.message.includes("Navigation timeout of") && captcha) {
            //Captcha timeout
            await page.screenshot({ path: 'debug_' + store.name + '_timeout.png' });
            bot.sendPhoto(chat_id, 'debug_' + store.name + '_timeout.png', { caption: "Captcha timed out " + store.name + " on Webshop Page for IP: " + proxy })
        } else {
            bot.sendMessage(chat_id, "An error occurred fetching the " + store.name + " Webshop Page: " + error.message);
        }
    }

    await browser.close();
}

async function getProductIds(page, store, proxy, override = false) {
    const key = store.name + '_webshop_productids';
    var productIdsLastUpdate = 0
    try {
        productIdsLastUpdate = JSON.parse(await db.get(key + '_last_update'));
    } catch {
        console.log("Failed fetching " + key + "_last_update (Key Value Store not initialized yet propably)");
    }

    const now = Math.floor(Date.now() / 1000);
    //Update CardUrls every hour
    if (productIdsLastUpdate + 60 * 60 > now || override) {
        try {
            productIds = JSON.parse(await db.get(key));
            return productIds;
        } catch {
            console.log("Failed fetching " + key + " (Key Value Store not initialized yet propably)");
        }
    }

    //Fetching productIds
    const storeUrl = 'https://' + store.url + '/de/campaign/grafikkarten-nvidia-geforce-rtx-30';

    let time = performance.now();
    await page.goto(storeUrl, { waitUntil: 'load', timeout: 30000 });

    const content = await page.content();
    captcha = content.includes("Das ging uns leider zu schnell.");
    if (captcha) {
        console.log("Captcha detected on " + store.name + " page!");
        if (proxy !== "default") {
            console.log("Blacklisting IP: " + proxy);
            await imposter.blackListProxy(proxy, store.name);
            return [];
        } else {
            await page.waitForSelector('#cf-hcaptcha-container');
            const captchaSolution = await page.solveRecaptchas();
            console.log("Captcha Solution: ");
            console.log(captchaSolution);
            await page.waitForNavigation({ timeout: 5000 });
            console.log("Navigated!");
            bot.sendMessage(chat_id, "Solved captcha on " + store.name + " Webshop Page for IP: " + proxy);
        }
    }

    await page.screenshot({ path: 'debug_' + store.name + '.png' });
    console.log(store.name + ` Store Page loaded in ${((performance.now() - time) / 1000).toFixed(2)} s`)
    const graphQlData = await page.evaluate(() => window.__PRELOADED_STATE__.apolloState);
    var productIds = [];
    for (const graphQl of Object.values(graphQlData)) {
        if (graphQl.__typename == "GraphqlProductCollection") {
            for (const item of Object.values(graphQl.items.visible)) {
                productIds.push(item.productId)
            }

            for (const item of Object.values(graphQl.items.hidden)) {
                productIds.push(item.productId)
            }
        }
    }

    console.log(productIds)
    await db.put(key + '_last_update', now);
    await db.put(key, JSON.stringify(productIds));
    return productIds;
}