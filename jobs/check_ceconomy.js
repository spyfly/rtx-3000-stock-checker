process.env["NTBA_FIX_319"] = 1;
const TelegramBot = require('node-telegram-bot-api');
const config = require('../config.json');
const { performance } = require('perf_hooks');

const { chromium } = require('playwright-extra')
const RecaptchaPlugin = require('@extra/recaptcha')
const RecaptchaOptions = {
    visualFeedback: true, // colorize reCAPTCHAs (violet = detected, green = solved)
    provider: {
        id: '2captcha',
        token: config.services['2captcha'].token, // REPLACE THIS WITH YOUR OWN 2CAPTCHA API KEY ⚡
    },
}
chromium.use(RecaptchaPlugin(RecaptchaOptions))

const deal_notify = require('../libs/deal_notify.js');

const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;
const debug_chat_id = config.services.telegram.debug_chat_id;

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

    var captcha = false;
    try {
        var deals = {};
        let time = performance.now();
        var [browser, context, apiPage, proxy, collectionIds, apolloGraphVersion] = await getCollectionIds(store);
        var productsChecked = 0;

        for (const collectionId of collectionIds) {
            const itemObj = {
                "id": collectionId,
                "limit": 30,
                "startItemIndex": 0,
                "gridSize": "Small",
                "storeId": null
            }
            const url = "https://" + store.url + "/api/v1/graphql?operationName=GetProductCollectionContent&variables=" + encodeURIComponent(JSON.stringify(itemObj)) + "&extensions=" + encodeURIComponent('{"pwa":{"salesLine":"' + store.graphQlName + '","country":"DE","language":"de"},"persistedQuery":{"version":1,"sha256Hash":"2ca5f94736d90932c29fcbe78a79af7e316149da5947085416bc26f990a19896"}}')

            //await page.waitForTimeout(5000);
            await apiPage.setExtraHTTPHeaders({ 'Content-Type': 'application/json', 'apollographql-client-name': 'pwa-client', 'apollographql-client-version': apolloGraphVersion })
            const response = await apiPage.goto(url);
            console.log(store.name + ": " + response.status() + " | " + proxy);
            if (response.status() == 403 || response.status() == 429) {
                try {
                    console.log("Waiting for browser to be checked!")
                    const resp = await apiPage.waitForNavigation({ timeout: 10000 });
                    if (resp.status() != 200) {
                        console.log("Navigation failed!");
                        throw "Navigation_failed";
                    }
                } catch (error) {
                    //Load overview page for captcha solving
                    await imposter.updateCookies(proxy, await context.cookies());
                    await browser.close();
                    var [browser, context, apiPage, proxy, collectionIds, apolloGraphVersion] = await getCollectionIds(store, true);

                    //Set proper headers
                    await apiPage.setExtraHTTPHeaders({ 'Content-Type': 'application/json', 'apollographql-client-name': 'pwa-client', 'apollographql-client-version': apolloGraphVersion })

                    // and now Reload page
                    await apiPage.goto(url);
                    //}
                }
                await apiPage.screenshot({ path: 'debug_' + store.name + '_chunk.png' });
            } else if (response.status() == 429) {
                console.log("Rate limited!")
                await apiPage.screenshot({ path: 'debug_' + store.name + '_chunk_rate_limit.png' });
                bot.sendMessage(debug_chat_id, "Rate limited on " + store.name + " Webshop Page for IP: " + proxy);
            }

            const jsonEl = await apiPage.waitForSelector('pre', { timeout: 10000 });
            const htmlJSON = await apiPage.evaluate(el => el.textContent, jsonEl)
            const json = JSON.parse(htmlJSON);
            const stockDetails = json.data.productCollectionContent.items.visible;
            for (const stockDetail of stockDetails) {
                productsChecked++;

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

        console.log(productsChecked + " " + store.name + ` Deals processed in ${((performance.now() - time) / 1000).toFixed(2)} s`)
    } catch (error) {
        console.log(error);
        if (error.message.includes("Cannot read property 'apolloState' of undefined") && captcha) {
            //Incorrect captcha solution
            await page.screenshot({ path: 'debug_' + store.name + '_incorrect.png' });
            bot.sendPhoto(debug_chat_id, 'debug_' + store.name + '_incorrect.png', { caption: "Captcha solved incorrectly on " + store.name + " Webshop Page for IP: " + proxy });
        } else if (error.message.includes("Navigation timeout of") && captcha) {
            //Captcha timeout
            await page.screenshot({ path: 'debug_' + store.name + '_timeout.png' });
            bot.sendPhoto(debug_chat_id, 'debug_' + store.name + '_timeout.png', { caption: "Captcha timed out " + store.name + " on Webshop Page for IP: " + proxy })
        } else {
            bot.sendMessage(debug_chat_id, "An error occurred fetching the " + store.name + " Webshop Page: " + error.message);
        }
    }

    await imposter.updateCookies(proxy, await context.cookies());
    await browser.close();
}

async function getCollectionIds(store, override = false) {
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
    if (config.ceconomy.proxies) {
        proxy = await imposter.getProxySelection(store.name);

        //Select new proxy
        if (proxy == null || override) {
            proxy = await imposter.getRandomProxy();
            await imposter.storeProxySelection(proxy, store.name)
        }

        if (proxy != undefined) {
            const browserDetails = await imposter.getBrowserDetails(proxy);
            browser_context.storageState = {
                cookies: browserDetails.cookies
            };
            browser_context.proxy = {
                server: proxy
            };
            browser_context.userAgent = browserDetails.userAgent;
            browser_context.viewport = browserDetails.viewport;
        } else {
            proxy = "default"
            console.log("All proxies blacklisted, using no proxy!")
        }
    }

    //const browser = await chromium.launchPersistentContext('/tmp/rtx-3000-stock-checker/' + proxy.replace(/\./g, "-").replace(/\:/g, "_"), browser_context);
    const browser = await chromium.launch(browser_context);
    const context = await browser.newContext(browser_context);
    const page = await context.newPage();

    const key = store.name + '_webshop_collectionids';
    var collectionIdsLastUpdate = 0
    try {
        collectionIdsLastUpdate = JSON.parse(await db.get(key + '_last_update'));
    } catch {
        console.log("Failed fetching " + key + "_last_update (Key Value Store not initialized yet propably)");
    }

    const now = Math.floor(Date.now() / 1000);
    var apolloGraphVersion;
    //Update CardUrls every hour
    if (collectionIdsLastUpdate + 60 * 60 > now && !override) {
        try {
            collectionIds = JSON.parse(await db.get(key));
            apolloGraphVersion = await db.get(key + '_api_version');
            return [browser, context, page, proxy, collectionIds, apolloGraphVersion];
        } catch {
            console.log("Failed fetching " + key + " (Key Value Store not initialized yet propably)");
        }
    }

    //Fetching collectionIds
    const storeUrl = 'https://' + store.url + '/de/campaign/grafikkarten-nvidia-geforce-rtx-30';

    let time = performance.now();
    await page.goto(storeUrl, { waitUntil: 'load', timeout: 30000 });

    const content = await page.content();
    captcha = content.includes("Das ging uns leider zu schnell.");
    if (captcha) {
        console.log("Captcha detected on " + store.name + " page!");
        /*if (proxy !== "default") {
            console.log("Blacklisting IP: " + proxy);
            await imposter.blackListProxy(proxy, store.name);
            return [];
        } else {*/
        var i = 0;
        var captchaSolved = false;
        //Captcha solving loop
        while (i < 5 && !captchaSolved) {
            console.log("Captcha solving attempt: " + ++i)
            try {
                await page.waitForSelector('#cf-hcaptcha-container', { timeout: 5000 });
            } catch {
                //await page.screenshot({ path: 'debug_' + store.name + '_timeout.png' });
                //bot.sendPhoto(debug_chat_id, 'debug_' + store.name + '_timeout.png', { caption: "Waiting for captcha selector timed out " + store.name + " on Webshop Page for IP: " + proxy })
                console.log("Captcha selector timed out!");
            }
            const captchaSolution = await page.solveRecaptchas();
            //Reload page if no captcha was found
            if (captchaSolution.captchas.length == 0) {
                console.log("No captcha found, retrying!");
                await page.goto(storeUrl, { waitUntil: 'load', timeout: 30000 });
                continue;
            }

            console.log("Captcha Solution: ");
            console.log(captchaSolution);
            try {
                await page.waitForNavigation({ timeout: 5000 });
                console.log("Navigated!");
                bot.sendMessage(debug_chat_id, "Solved captcha on " + store.name + " Webshop Page for IP: " + proxy + " | Attempt: " + i);
                captchaSolved = true;
            } catch {
                await page.screenshot({ path: 'debug_' + store.name + '_timeout.png' });
                bot.sendPhoto(debug_chat_id, 'debug_' + store.name + '_timeout.png', { caption: "Captcha timed out " + store.name + " on Webshop Page for IP: " + proxy + " | Attempt: " + i })
                //return [];
            }
        }
        if (!captchaSolved) {
            await page.screenshot({ path: 'debug_' + store.name + '_captcha_failed.png' });
            bot.sendPhoto(debug_chat_id, 'debug_' + store.name + '_captcha_failed.png', { caption: "Captcha solving failed at " + store.name + " on Webshop Page for IP: " + proxy + " | Attempt: " + i })
        }
        //}
    }

    await page.screenshot({ path: 'debug_' + store.name + '.png' });
    console.log(store.name + ` Store Page loaded in ${((performance.now() - time) / 1000).toFixed(2)} s`)
    const graphQlData = await page.evaluate(() => window.__PRELOADED_STATE__.apolloState);
    var collectionIds = [];
    for (const [key, value] of Object.entries(graphQlData)) {
        if (key.includes("GraphqlProductCollection:")) {
            console.log(value.id + " | Count: " + value.totalProducts);
            collectionIds.push(value.id);
        }
    }


    apolloGraphVersion = await (await page.waitForSelector('[name="version"]', { state: 'attached' })).getAttribute("content");

    console.log("ApolloGraphVersion: " + apolloGraphVersion)
    console.log(collectionIds)
    await db.put(key + '_last_update', now);
    await db.put(key, JSON.stringify(collectionIds));
    await db.put(key + '_api_version', apolloGraphVersion);

    return [browser, context, page, proxy, collectionIds, apolloGraphVersion];
}