process.env["NTBA_FIX_319"] = 1;
const TelegramBot = require('node-telegram-bot-api');
const config = require('../config.json');
const { performance } = require('perf_hooks');

const fs = require('fs').promises;

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

const imposter = require('../libs/imposter.js');
const { exit } = require('process');

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

    var productsChecked = 0;
    var captcha = false;
    try {
        var deals = {};
        let time = performance.now();
        const stockDetails = await getProducts(store);

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
}

async function getProducts(store, override = false) {
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
                proxy = await imposter.getRandomProxy();
                await imposter.storeProxySelection(proxy, store.name)
            }
        } else {
            // New Proxy every time
            proxy = await imposter.getRandomProxy();
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

    var products = [];

    try {
        const now = Math.floor(Date.now() / 1000);

        //Fetching collectionIds
        const storeUrl = 'https://' + store.url + '/de/campaign/grafikkarten-nvidia-geforce-rtx-30';
        // Abort based on the request type
        page.on('request', async request => {
            if (request.url().includes("graphql?operationName=GetProductCollectionContent")) {
                const resp = await request.response();
                try {
                    const json = await resp.json();
                    for (value of json.data.productCollectionContent.items.visible) {
                        products.push(value);
                    }
                } catch (error) {
                    console.log("Failed parsing JSON! Status: " + resp.status());
                    bot.sendMessage(debug_chat_id, "An error occurred fetching the JSON for " + store.name + " Webshop Page: " + error.message);
                }

            }
        });

        const userDataRequest = page.waitForRequest(/GetUser/g);

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
        var expectedTotalProducts = 0;
        for (const [key, value] of Object.entries(graphQlData)) {
            if (key.includes("GraphqlProductCollection:")) {
                expectedTotalProducts += value.totalProducts;
            }
        }

        var clickAwayCookies = {};
        const foundCookieBtn = await page.evaluate(() => document.querySelectorAll('#privacy-layer-accept-all-button').length);
        console.log("CookieBtns: " + foundCookieBtn);
        if (foundCookieBtn > 0) {
            clickAwayCookies = page.click('#privacy-layer-accept-all-button', { timeout: 1000 });
        }

        const [_, userData] = await Promise.all([clickAwayCookies, userDataRequest]);
        const userDataResp = await userData.response();
        const userDataJson = await userDataResp.json();
        console.log("Selected Store: " + userDataJson.data.store)
        if (userDataJson.data.store == null) {
            await page.evaluate(() => document.querySelectorAll('[class^=DropdownButton__StyledContentGrid]')[1].id = "market_dropdown_btn");
            await page.click('#market_dropdown_btn', { timeout: 5000 });
            await page.fill('[data-test="mms-marketselector-input"]', "Berlin");
            await page.evaluate(() => document.querySelector('button[class^="NoMarketAvailable__StyledButton"]').click());
            await page.waitForSelector('[data-test="mms-market-selector-button"]', { timeout: 5000 });
            await page.evaluate(() => document.querySelector('[data-test="mms-market-selector-button"]').click());
        }

        var btnCount = await page.evaluate(() => document.querySelectorAll("div[class^='Cellstyled__StyledCell'] > button[class^='Buttonstyled__StyledButt']").length);
        while (btnCount > 0) {
            try {
                await page.click("div[class^='Cellstyled__StyledCell'] > button[class^='Buttonstyled__StyledButt']", { timeout: 1000 });
            } catch { }
            btnCount = await page.evaluate(() => document.querySelectorAll("div[class^='Cellstyled__StyledCell'] > button[class^='Buttonstyled__StyledButt']").length);
        }

        await page.waitForLoadState('networkidle');
        if (expectedTotalProducts != products.length) {
            console.log("Total product count of " + products.length + " didn't match expected count of " + expectedTotalProducts + " on " + store.name + "!");
        }
    } catch (error) {
        const errMsg = "An error occurred fetching the " + store.name + " Webshop Page: " + error.message;
        await page.screenshot({ path: 'debug_' + store.name + '_failure.png' });
        bot.sendPhoto(debug_chat_id, 'debug_' + store.name + '_failure.png', { caption: errMsg });
    }

    await imposter.updateCookies(proxy, await context.cookies());
    await browser.close();
    return products;

}