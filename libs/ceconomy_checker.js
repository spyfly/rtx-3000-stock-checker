process.env["NTBA_FIX_319"] = 1;
const TelegramBot = require('node-telegram-bot-api');
const config = require('../config.json');
const { performance } = require('perf_hooks');

const fs = require('fs').promises;

const puppeteer = require('puppeteer-extra')
const RecaptchaPlugin = require('puppeteer-extra-plugin-recaptcha')
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const RecaptchaOptions = {
    visualFeedback: true, // colorize reCAPTCHAs (violet = detected, green = solved)
    provider: {
        id: '2captcha',
        token: config.services['2captcha'].token, // REPLACE THIS WITH YOUR OWN 2CAPTCHA API KEY ⚡
    },
}
puppeteer.use(StealthPlugin());
puppeteer.use(RecaptchaPlugin(RecaptchaOptions))

const deal_notify = require('./deal_notify.js');

const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;
const debug_chat_id = config.services.telegram.debug_chat_id;

const level = require('level-party');
const db = level('./status', { valueEncoding: 'json' });

const imposter = require('./imposter.js');

const blacklistedIds = [
    "2737445"
];

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
        var productsChecked = 0;
        var urls = [];
        let time = performance.now();
        var [browser, apiPage, proxy, apolloGraphVersion, productIds, productCollections] = await getBrowserInstance(store);

        for (const collectionId of productCollections) {
            const itemObj = {
                "id": collectionId,
                "limit": 30,
                "startItemIndex": 0,
                "gridSize": "Small",
                "storeId": null
            }
            const url = "https://" + store.url + "/api/v1/graphql?anti-cache=" + new Date().getTime() + "&operationName=GetProductCollectionContent&variables=" + encodeURIComponent(JSON.stringify(itemObj)) + "&extensions=" + encodeURIComponent('{"pwa":{"salesLine":"' + store.graphQlName + '","country":"DE","language":"de"},"persistedQuery":{"version":1,"sha256Hash":"a05fe63c78d817b33a6b38cf4d83b49ecfb9f544d7343b2ed44474c6ebe6f12c"}}')
            urls.push(url);
        }

        /*
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

        */
        checkedGPUs = [
            "NVIDIA GeForce RTX 3060",
            "NVIDIA GeForce RTX 3060 Ti",
            "NVIDIA GeForce RTX 3070",
            "NVIDIA GeForce RTX 3070 Ti",
            "NVIDIA GeForce RTX 3080",
            "NVIDIA GeForce RTX 3080 Ti",
            "NVIDIA GeForce RTX 3090"
        ];

        urls.push("https://" + store.url + "/api/v1/graphql?anti-cache=" + new Date().getTime() + "&operationName=CategoryV4&variables=%7B%22hasMarketplace%22%3Atrue%2C%22filters%22%3A%5B%22graphicsCard%3A" + encodeURIComponent(checkedGPUs.join(" OR ")) + "%22%2C%22graphicsBrand%3ANVIDIA%22%5D%2C%22storeId%22%3A%22480%22%2C%22wcsId%22%3A%22" + store.gpuCategoryId + "%22%2C%22page%22%3A1%2C%22experiment%22%3A%22mp%22%7D&extensions=%7B%22pwa%22%3A%7B%22salesLine%22%3A%22" + store.graphQlName + "%22%2C%22country%22%3A%22DE%22%2C%22language%22%3A%22de%22%2C%22contentful%22%3Atrue%7D%2C%22persistedQuery%22%3A%7B%22version%22%3A1%2C%22sha256Hash%22%3A%22059e0d217e1245a9221360b7f9c4fe3bc8de9b9e0469931b454d743cc939040c%22%7D%7D");

        /* Disable Wishlist Checking
        for (var i = 0; i < 7; i++) {
            var vars = {
                hasMarketplace: true,
                shouldFetchBasket: true,
                limit: 24,
            }
            if (i > 0) {
                vars.offset = 24 * i;
            }
            const extensions = {
                pwa: {
                    salesLine: store.graphQlName,
                    country: "DE",
                    language: "de"
                },
                persistedQuery: {
                    version: 1,
                    sha256Hash: "34f689a65435266a00785158604c61a7ad262c5a5bac523dd1af68c406f72248"
                }
            };
            urls.push("https://" + store.url + "/api/v1/graphql?anti-cache=" + new Date().getTime() + "&operationName=WishlistItems&variables=" + JSON.stringify(vars) + "&extensions=" + JSON.stringify(extensions))
        }
        */

        var wishlistItemIds = [];

        for (url of urls) {
            var retry = 0;
            while (retry < 3) {

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
                        //await imposter.updateCookies(proxy, await context.cookies());
                        await browser.close();
                        var [browser, apiPage, proxy, apolloGraphVersion, productIds] = await getBrowserInstance(store, true);

                        //Set proper headers
                        await apiPage.setExtraHTTPHeaders({ 'Content-Type': 'application/json', 'apollographql-client-name': 'pwa-client', 'apollographql-client-version': apolloGraphVersion, "x-flow-id": uuidv4() })

                        // and now Reload page
                        await apiPage.goto(url);
                        //}
                    }
                    await apiPage.screenshot({ path: 'debug_' + store.name + '_chunk.png' });
                }

                try {
                    const jsonEl = await apiPage.waitForSelector('pre', { timeout: 10000 });
                    const htmlJSON = await apiPage.evaluate(el => el.textContent, jsonEl)
                    const json = JSON.parse(htmlJSON);
                    var stockDetails = [];
                    var isProductCollection = true;
                    var isWishlist = false;
                    if (json.errors && json.errors[0].extensions.exception.status != 400) {
                        if (json.errors[0].extensions.status == 401) {
                            console.log("Wishlist requires login!");
                            /*
                            const resp = await apiPage.evaluate(async (store, uuid, apolloGraphVersion, config) => {
                                return await fetch("https://" + location.host + "/api/v1/graphql", {
                                    "credentials": "include",
                                    "headers": {
                                        "Content-Type": "application/json",
                                        "apollographql-client-name": "pwa-client",
                                        "apollographql-client-version": apolloGraphVersion,
                                        "x-operation": "LoginProfileUser",
                                        "x-flow-id": uuid,
                                        "x-cacheable": "false",
                                        "X-MMS-Language": "de",
                                        "X-MMS-Country": "DE",
                                        "X-MMS-Salesline": store.graphQlName
                                    },
                                    "body": "{\"operationName\":\"LoginProfileUser\",\"variables\":{\"email\":\"" + config.ceconomy.username + "\",\"password\":\"" + config.ceconomy.password + "\"},\"extensions\":{\"pwa\":{\"salesLine\":\"" + store.graphQlName + "\",\"country\":\"DE\",\"language\":\"de\"},\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"45a00273b73fec8a92253aad573eec8cfd402ba39b0651bb8e574404266cb485\"}}}",
                                    "method": "POST",
                                    "mode": "cors"
                                });
                            }, store, uuidv4(), apolloGraphVersion, config);
                            console.log(resp);
                            */
                            await apiPage.setCookie({
                                "name": "a",
                                "value": config.ceconomy[store.name + "_cookie"],
                                "secure": true,
                                "httpOnly": true,
                                "hostOnly": true
                            });
                        }
                        retry++;
                        console.log(url)
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
                        } else if (json.data.wishlistItems) {
                            isWishlist = true;
                            //console.log("Is wishlist! | " + store.name)
                            stockDetails = json.data.wishlistItems.items
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

                            if (isWishlist && product == null) {
                                console.log("Borked Wishlist Item found: " + stockDetail.id + " at " + store.name);
                                // Delete borked wishlist items
                                await apiPage.evaluate(async (store, uuid, apolloGraphVersion, stockDetail) => {
                                    await fetch("https://" + location.host + "/api/v1/graphql", {
                                        "credentials": "include",
                                        "headers": {
                                            "apollographql-client-name": "pwa-client",
                                            "apollographql-client-version": apolloGraphVersion,
                                            "x-operation": "DeleteWishlistItem",
                                            "x-flow-id": uuid,
                                            "x-cacheable": "false",
                                            "X-MMS-Language": "de",
                                            "X-MMS-Country": "DE",
                                            "X-MMS-Salesline": store.graphQlName
                                        },
                                        "body": "{\"operationName\":\"DeleteWishlistItem\",\"variables\":{\"id\":\"" + stockDetail.id + "\"},\"extensions\":{\"pwa\":{\"salesLine\":\"" + store.graphQlName + "\",\"country\":\"DE\",\"language\":\"de\"},\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"52c774a9ca8f9c3a0d4e9de33f37a2dadf8b65b2b5b5707484ee6aa378ba5214\"}}}",
                                        "method": "POST",
                                        "mode": "cors"
                                    });
                                }, store, uuidv4(), apolloGraphVersion, stockDetail)
                                continue;
                            }

                            //Product exists?
                            if (!product)
                                continue;

                            //Skip 3rd Party Stores
                            if (!stockDetail.availability.delivery)
                                continue;

                            //Add to Wishlist
                            var id = stockDetail.productId;
                            if (isWishlist)
                                id = product.id

                            if (!productIds.includes(id))
                                productIds.push(id);

                            if (isWishlist)
                                wishlistItemIds.push(id);
                            //End of Wishlist Block

                            //Skip if out of stock
                            if (stockDetail.availability.delivery.availabilityType == 'NONE')
                                continue;

                            //Skip if Warehouse Quantity is 0
                            if (stockDetail.availability.delivery.availabilityType == "IN_WAREHOUSE" && stockDetail.availability.delivery.quantity == 0)
                                continue;

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
                } catch (err) {
                    console.log("Failed fetching Data from " + store.name + " Error: " + err.stack);
                    retry++;
                }
            }
        }

        //Processing Notifications
        await deal_notify(deals, store.name + '_webshop_deals', 'ceconomy');

        /*
        var missingItems = [];
        for (const productId of productIds) {
            if (!wishlistItemIds.includes(productId)) {
                missingItems.push(productId);
            }
        }

        for (i = 0; (i < missingItems.length && i < 5); i++) {
            console.log(missingItems[i]);
            const resp = await apiPage.evaluate(async (store, uuid, productId, apolloGraphVersion) => {
                return await (await fetch("https://" + location.host + "/api/v1/graphql", {
                    "credentials": "include",
                    "headers": {
                        "apollographql-client-name": "pwa-client",
                        "apollographql-client-version": apolloGraphVersion,
                        "x-operation": "AddWishlistItem",
                        "x-flow-id": uuid,
                        "x-cacheable": "false",
                        "X-MMS-Language": "de",
                        "X-MMS-Country": "DE",
                        "X-MMS-Salesline": store.graphQlName
                    },
                    "body": "{\"operationName\":\"AddWishlistItem\",\"variables\":{\"hasMarketplace\":false,\"productId\":\"" + productId + "\"},\"extensions\":{\"pwa\":{\"salesLine\":\"" + store.graphQlName + "\",\"country\":\"DE\",\"language\":\"de\"},\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"be1b866912be48a06e7b548dcf0c0084df6a28cc00b0512ef9d3a24b1ae59cdf\"}}}",
                    "method": "POST",
                    "mode": "cors"
                })).json();
            }, store, uuidv4(), missingItems[i], apolloGraphVersion)
            console.log(resp);
        }

        console.log(missingItems.length + " Items missing from Wishlist at " + store.name)
        */

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
    } finally {
        //await imposter.updateCookies(proxy, await context.cookies());
        //console.log("Closing Browser!");
        await browser.close();
        //console.log("Browser closed!");
        db.close();
    }
}

async function getBrowserInstance(store, override = false) {
    const proxy = await getProxy(store, override);
    const browserDetails = await imposter.getBrowserDetails(proxy);
    const browser = await puppeteer.launch({
        userDataDir: '/tmp/rtx-3000-stock-checker/' + proxy.replace(/\./g, "-").replace(/\:/g, "_"),
        headless: false,
        args: [
            '--proxy-server=' + proxy,
            '--lang=de-DE'
        ],
    });
    const page = await browser.newPage();
    //await page.setUserAgent(browserDetails.userAgent)

    await page.setExtraHTTPHeaders({
        DNT: "1"
    });

    //Check for Last GraphQL Version Update
    const key = store.name + '_webshop_collectionids';
    var apolloGraphVersionLastUpdate = 0
    try {
        apolloGraphVersionLastUpdate = JSON.parse(await db.get(key + '_last_update'));
    } catch {
        console.log("Failed fetching " + key + "_last_update (Key Value Store not initialized yet propably)");
    }

    const now = Math.floor(Date.now() / 1000);
    var apolloGraphVersion;

    // Update apolloGraphVersion every hour
    if (apolloGraphVersionLastUpdate + 60 * 60 > now && !override) {
        try {
            productIds = JSON.parse(await db.get(key + '_product_ids'));
            productCollections = JSON.parse(await db.get(key + '_product_collections'));
            apolloGraphVersion = await db.get(key + '_api_version');
            return [browser, page, proxy, apolloGraphVersion, productIds, productCollections];
        } catch {
            console.log("Failed fetching " + key + " (Key Value Store not initialized yet propably)");
        }
    }

    //Get current apollograph version
    const storeUrl = 'https://' + store.url + "/de/campaign/grafikkarten-nvidia-geforce-rtx-30";

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

            console.log("Captcha solved!");
            //console.log(captchaSolution);
            try {
                await page.waitForNavigation({ timeout: 5000 });
                console.log("Navigated after solving captcha!");
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
    try {
        apolloGraphVersion = await (await (await page.waitForSelector('[name="version"]', { state: 'attached', timeout: 10000 },)).getProperty("content")).jsonValue();

        console.log("ApolloGraphVersion: " + apolloGraphVersion)
        await db.put(key + '_last_update', now);
        await db.put(key + '_api_version', apolloGraphVersion);

        // Grab Product Ids from Overview Page
        const graphQlData = await page.evaluate(() => window.__PRELOADED_STATE__.apolloState);
        var productIds = [];
        var productCollections = [];

        for (const [key, value] of Object.entries(graphQlData)) {
            if (key.includes("GraphqlProductCollection:")) {
                console.log("Found Product Collection: " + value.id);
                productCollections.push(value.id);

                const productCollectionItems = value.items.visible.concat(value.items.hidden);
                //console.log(productCollectionItems);
                for (const productCollectionItem of productCollectionItems) {
                    if (!blacklistedIds.includes(productCollectionItem.productId))
                        productIds.push(productCollectionItem.productId);
                }
            }
        }

        await db.put(key + '_product_ids', JSON.stringify(productIds));
        await db.put(key + '_product_collections', JSON.stringify(productCollections));

        return [browser, page, proxy, apolloGraphVersion, productIds, productCollections];
    } catch {
        console.log("Getting new Browser Instance after being unable to fetch ApolloGraphVersion for " + store.name);
        await browser.close();
        return getBrowserInstance(store, true);
    }
}

async function getProxy(store, override) {
    var proxy = "default"
    if (config.ceconomy.proxies) {
        if (config.ceconomy.store_proxy) {
            // Use the same proxy every time until we get a new Captcha
            proxy = await imposter.getProxySelection(store.name);

            //Select new proxy
            if (proxy == null || override) {
                proxy = await imposter.getRandomProxy("", config.ceconomy.local_proxy, true);
                await imposter.storeProxySelection(proxy, store.name)
            }
        } else {
            // New Proxy every time
            proxy = await imposter.getRandomProxy("", config.ceconomy.local_proxy, true);
        }

        if (proxy != undefined) {
            //const browserDetails = await imposter.getBrowserDetails(proxy);
        } else {
            proxy = "default"
            console.log("All proxies blacklisted, using no proxy!")
        }
    }
    return proxy;
}

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

module.exports = checkCeconomy;