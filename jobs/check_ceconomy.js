process.env["NTBA_FIX_319"] = 1;
const TelegramBot = require('node-telegram-bot-api');
const config = require('../config.json');
const { performance } = require('perf_hooks');

const fs = require('fs').promises;

const { firefox } = require('playwright-extra')
const RecaptchaPlugin = require('@extra/recaptcha')
const RecaptchaOptions = {
    visualFeedback: true, // colorize reCAPTCHAs (violet = detected, green = solved)
    provider: {
        id: '2captcha',
        token: config.services['2captcha'].token, // REPLACE THIS WITH YOUR OWN 2CAPTCHA API KEY ⚡
    },
}
firefox.use(RecaptchaPlugin(RecaptchaOptions))

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
            gpuCategoryId: 286896
        },
        {
            url: "www.mediamarkt.de",
            graphQlName: "Media",
            name: "MediaMarkt",
            gpuCategoryId: 640610
        }
    ]
    const store = stores[storeId];

    var captcha = false;
    try {
        var deals = {};
        let time = performance.now();
        var [browser, context, apiPage, proxy, collectionIds, apolloGraphVersion] = await getCollectionIds(store);
        var productsChecked = 0;
        var urls = [];

        var productIds = [
            "2689453",
            "2691444",
            "2712013",
            "2728199",
            "2728200",
            "2681871",
            "2719146",
            "2719167",
            "2719315",
            "2719148",
            "2718593",
            "2718594",
            "2728198",
            "2721941",
            "2703466",
            "2727942",
            "2712011",
            "2688473",
            "2689451",
            "2683942",
            "2684238",
            "2683229",
            "2683227",
            "2683243",
            "2681869",
            "2681859",
            "2696164",
            "2703443",
            "2695943",
            "2695941",
            "2695942",
            "2694898",
            "2694896",
            "2694894",
            "2691439",
            "2691247",
            "2691246",
            "2691244",
            "2702989",
            "2702988",
            "2702990",
            "2701237",
            "2701234",
            "2701240",
            "2719459",
            "2719456",
            "2719457",
            "2719314",
            "2719460",
            "2719317",
            "2719161",
            "2722386",
            "2704390",
            "2704389",
            "2704387",
            "2704388",
            "2719160",
            "2719152",
            "2719165",
            "2688497",
            "2691245",
            "2709853",
            "2719163",
            "2719159",
            "2712924",
            "2721985",
            "2719166",
            "2691243",
            "2701238",
            "2696163",
            "2695671",
            "2684241",
            "2691443",
            "2683937",
            "2691438",
            "2681861",
            "2704437",
            "2711769",
            "2703530",
            "2704436",
            "2703526",
            "2703467",
            "2698339",
            "2712787",
            "2709470",
            "2712909",
            "2712010",
            "2712012",
            "2718003",
            "2714233",
            "2701596",
            "2715323",
            "2702991",
            "2702992",
            "2701239",
            "2719151",
            "2691365",
            "2712784",
            "2732518",
            "2719147",
            "2728201",
            "2712800"
        ];

        /*
        Currently broken
        for (const collectionId of collectionIds) {
            const itemObj = {
                "id": collectionId,
                "limit": 30,
                "startItemIndex": 0,
                "gridSize": "Small",
                "storeId": null
            }
            const url = "https://" + store.url + "/api/v1/graphql?operationName=GetProductCollectionContent&variables=" + encodeURIComponent(JSON.stringify(itemObj)) + "&extensions=" + encodeURIComponent('{"pwa":{"salesLine":"' + store.graphQlName + '","country":"DE","language":"de"},"persistedQuery":{"version":1,"sha256Hash":"d43ff94a1d080389b881aa250925c3ce694270c9e8fcc3a728a91489a3a8db6a"}}')
            urls.push(url);
        }
        */

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
            const url = "https://" + store.url + "/api/v1/graphql?anti-cache=" + new Date().getTime() + "&operationName=GetProductCollectionItems&variables=" + encodeURIComponent(JSON.stringify(itemObj)) + "&extensions=" + encodeURIComponent('{"pwa":{"salesLine":"' + store.graphQlName + '","country":"DE","language":"de"},"persistedQuery":{"version":1,"sha256Hash":"336da976d5643762fdc280b67c0479955c33794fd23e98734c651477dd8a2e4c"}}')
            urls.push(url);
        }

        urls.push("https://" + store.url + "/api/v1/graphql?anti-cache=" + new Date().getTime() + "&operationName=CategoryV4&variables=%7B%22hasMarketplace%22%3Atrue%2C%22filters%22%3A%5B%22graphicsCard%3ANVIDIA%20GeForce%20RTX%203060%20OR%20NVIDIA%20GeForce%20RTX%203060%20TI%20OR%20NVIDIA%20GeForce%20RTX%203070%20OR%20NVIDIA%20GeForce%20RTX%203080%20OR%20NVIDIA%20GeForce%20RTX%203090%22%2C%22graphicsBrand%3ANVIDIA%22%5D%2C%22storeId%22%3A%22480%22%2C%22wcsId%22%3A%22" + store.gpuCategoryId + "%22%2C%22page%22%3A1%2C%22experiment%22%3A%22mp%22%7D&extensions=%7B%22pwa%22%3A%7B%22salesLine%22%3A%22" + store.graphQlName + "%22%2C%22country%22%3A%22DE%22%2C%22language%22%3A%22de%22%2C%22contentful%22%3Atrue%7D%2C%22persistedQuery%22%3A%7B%22version%22%3A1%2C%22sha256Hash%22%3A%22059e0d217e1245a9221360b7f9c4fe3bc8de9b9e0469931b454d743cc939040c%22%7D%7D");

        for (url of urls) {
            var retry = 0;
            while (retry < 4) {

                //await page.waitForTimeout(5000);
                await apiPage.setExtraHTTPHeaders({
                    'Content-Type': 'application/json',
                    'apollographql-client-name': 'pwa-client',
                    'apollographql-client-version': apolloGraphVersion,
                    "x-cacheable": "false",
                    "X-MMS-Language": "de",
                    "X-MMS-Country": "DE",
                    "X-MMS-Salesline": store.graphQlName,
                    "x-flow-id": uuidv4(),
                    "Pragma": "no-cache",
                    "Cache-Control": "no-cache",
                })
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
                        await apiPage.setExtraHTTPHeaders({ 'Content-Type': 'application/json', 'apollographql-client-name': 'pwa-client', 'apollographql-client-version': apolloGraphVersion, "x-flow-id": uuidv4() })

                        // and now Reload page
                        await apiPage.goto(url);
                        //}
                    }
                    await apiPage.screenshot({ path: 'debug_' + store.name + '_chunk.png' });
                }

                const jsonEl = await apiPage.waitForSelector('pre', { timeout: 10000 });
                const htmlJSON = await apiPage.evaluate(el => el.textContent, jsonEl)
                const json = JSON.parse(htmlJSON);
                var stockDetails = [];
                var isProductCollection = true;
                if (json.errors) {
                    //console.log(json.errors);
                    retry++;
                } else {
                    retry = 10;
                    if (json.data.productCollectionContent) {
                        //New Collections (now broken)
                        stockDetails = json.data.productCollectionContent.items.visible;
                    } else if (json.data.getProductCollectionItems) {
                        //Legacy Collections
                        stockDetails = json.data.getProductCollectionItems.visible;
                    } else if (json.data.categoryV4) {
                        isProductCollection = false;
                        stockDetails = json.data.categoryV4.products;
                    }

                    for (const stockDetail of stockDetails) {
                        var product;
                        if (isProductCollection) {
                            product = stockDetail.product;
                        } else {
                            product = stockDetail.details;
                            //Report that we found product! (Debugging)
                            fs.writeFile('debug/' + store.name + "_" + stockDetail.productId + ".json", JSON.stringify(stockDetail));
                            //bot.sendMessage(debug_chat_id, "Found product on " + store.name + " via search: " + product.title + " | https://" + store.url + product.url);
                        }
                        productsChecked++;

                        //Product exists?
                        if (!product)
                            continue;

                        //Skip 3rd Party Stores
                        if (!stockDetail.availability.delivery)
                            continue;

                        //Skip if out of stock
                        if (stockDetail.availability.delivery.availabilityType == 'NONE')
                            continue;

                        //Skip if Warehouse Quantity is 0
                        if (stockDetail.availability.delivery.availabilityType == "IN_WAREHOUSE" && stockDetail.availability.delivery.quantity == 0)
                            continue;

                        const id = stockDetail.productId;
                        const card = {
                            title: product.title,
                            href: "https://" + store.url + product.url,
                            price: stockDetail.price.price
                        }
                        deals[id] = card;
                        //console.log(stockDetail);
                        console.log(card.title + " in stock for " + card.price + "€ at " + store.name)
                    }
                }
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
        if (config.ceconomy.store_proxy) {
            // Use the same proxy every time until we get a new Captcha
            proxy = await imposter.getProxySelection(store.name);

            //Select new proxy
            if (proxy == null || override) {
                proxy = await imposter.getRandomProxy("", config.ceconomy.local_proxy);
                await imposter.storeProxySelection(proxy, store.name)
            }
        } else {
            // New Proxy every time
            proxy = await imposter.getRandomProxy("", config.ceconomy.local_proxy);
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
    const browser = await firefox.launch(browser_context);
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
            fs.writeFile('debug_' + store.name + '_captcha_1.html', await page.content());
            try {
                await page.waitForSelector('#cf-hcaptcha-container', { timeout: 5000 });
                fs.writeFile('debug_' + store.name + '_captcha_2.html', await page.content());
            } catch {
                //await page.screenshot({ path: 'debug_' + store.name + '_timeout.png' });
                //bot.sendPhoto(debug_chat_id, 'debug_' + store.name + '_timeout.png', { caption: "Waiting for captcha selector timed out " + store.name + " on Webshop Page for IP: " + proxy })
                console.log("Captcha selector timed out!");
            }

            fs.writeFile('debug_' + store.name + '_captcha_3.html', await page.content());
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
            fs.writeFile('debug_' + store.name + '_captcha_failed.html', await page.content());
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

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}