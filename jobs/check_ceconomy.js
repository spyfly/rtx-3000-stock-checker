process.env["NTBA_FIX_319"] = 1;
const TelegramBot = require('node-telegram-bot-api');
const config = require('../config.json');
const { performance } = require('perf_hooks');

const { chromium } = require('playwright');

const deal_notify = require('../libs/deal_notify.js');

const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;

const imposter = require('../libs/imposter.js');

(async () => {
    var tasks = [];
    //Check Saturn
    tasks.push(checkCeconomy(0));

    //Check Mediamarkt
    tasks.push(checkCeconomy(1));

    await Promise.all(tasks);
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
    var puppeteer_args = {};
    var proxy = "default";

    //Using a proxy
    if (config.ceconomy.proxies) {
        proxy = await imposter.getRandomProxy();
        const browserDetails = await imposter.getBrowserDetails(proxy);
        cookies = browserDetails.cookies;
        browser_context.proxy = {
            server: proxy
        };
        browser_context.userAgent = browserDetails.userAgent;
        browser_context.viewport = browserDetails.viewport;
        //browser_context.viewport.height = 10000;
    }

    const browser = await chromium.launchPersistentContext('/tmp/rtx-3000-stock-checker/' + proxy.replace(/\./g, "-").replace(/\:/g, "_"), browser_context);
    const page = await browser.newPage();

    if (config.ceconomy.proxies) {
        //await browser.addCookies(cookies);
        //console.log("Set cookies");
    }

    try {
        var deals = {};

        const storeUrl = 'https://' + store.url + '/de/campaign/grafikkarten-nvidia-geforce-rtx-30';

        let time = performance.now();
        await page.goto(storeUrl, { waitUntil: 'load', timeout: 0 });

        const content = await page.content();
        if (content.includes("Das ging uns leider zu schnell.")) {
            console.log("Captcha detected on " + store.name + " page!");
        }

        await page.screenshot({ path: 'debug_ceconomy.png' });
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

            await page.setExtraHTTPHeaders({ 'Content-Type': 'application/json', 'apollographql-client-name': 'pwa-client', 'apollographql-client-version': '7.0.1' })
            await page.goto(url);
            await page.screenshot({ path: 'debug_ceconomy_chunk.png' });

            const htmlJSON = await page.textContent('pre');
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
        bot.sendMessage(chat_id, "An error occurred fetching the " + store.name + " Webshop Page: " + error.message);
    }

    await browser.close();
}