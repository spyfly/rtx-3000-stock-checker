process.env["NTBA_FIX_319"] = 1;
const TelegramBot = require('node-telegram-bot-api');

const config = require('../config.json');
const bot = new TelegramBot(config.services.telegram.token);
const debug_chat_id = config.services.telegram.debug_chat_id;

const { chromium } = require('playwright')

const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin())

const nbb_parser = require('../libs/nbb_parser.js');
const deal_notify = require('../libs/deal_notify.js');
const wr_circumvention = require('../libs/nbb_wr_circumvention.js');

const imposter = require('../libs/imposter.js');

const crypto = require("crypto");

const level = require('level-party')
const db = level('./status', { valueEncoding: 'json' })

function getRandom(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

(async () => {
    const storeUrls = {
        outlet: 'https://www.notebooksbilliger.de/extensions/apii/filter.php?filters=on&listing=on&advisor=&box_61967_22250%5B%5D=143&box_61969_22250_min=' + getRandom(50, 100) + '&box_61969_22250_max=' + getRandom(2000, 2500) + '&box_61969_22250_slid=1&box_65348_22250=&box_62049_22250=&action=applyFilters&category_id=22250&page=1&perPage=&sort=popularity&order=desc&availability=alle&eqsqid=',
        nvidia: 'https://www.notebooksbilliger.de/extensions/apii/filter.php?filters=on&listing=on&advisor=&box_64904_2817_min=&box_64904_2817_max=&box_64904_2817_slid=&box_64906_2817_min=' + getRandom(150, 250) + '&box_64906_2817_max=' + getRandom(3000, 3500) + '&box_64906_2817_slid=1&box_64908_2817_min=&box_64908_2817_max=&box_64908_2817_slid=&box_64910_2817=&action=applyFilters&category_id=2817&page=1&perPage=&sort=price&order=desc&availability=alle&eqsqid='
    }

    var nbbDeals = {};

    var tasks = [];
    for (const [name, storeUrl] of Object.entries(storeUrls)) {
        const task = checkNbbApi(storeUrl, name);
        tasks.push(task);
        task.then((deals) => {
            Object.assign(nbbDeals, deals);
        },
            (err) => {
                console.log("Failed fetching NBB " + name + " page:" + err)
            });
    }

    tasks.push(checkNbbFoundersEditionPages().then((deals) => {
        Object.assign(nbbDeals, deals);
    }));
    tasks.push(checkNbbPaymentGateways());

    await Promise.all(tasks);
    await deal_notify(nbbDeals, 'nbb_deals', 'nbb');
    await db.close();
})();

async function checkNbbApi(storeUrl, apiPage) {
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

    drop_urls = JSON.parse(await db.get("nbb_drop_url_array"));

    //Using a proxy
    if (config.nbb.proxies) {
        proxy = await imposter.getRandomProxy("nbb");
        const browserDetails = await imposter.getBrowserDetails(proxy);
        if (proxy != undefined) {
            browser_context.proxy = {
                server: proxy
            };
            browser_context.userAgent = browserDetails.userAgent;
            browser_context.viewport = browserDetails.viewport;
        } else {
            proxy = "default";
            console.log("All Proxies blacklisted on NBB.com!");
            bot.sendMessage(debug_chat_id, "All Proxies blacklisted on NBB.com!");
        }
    }

    const browser = await chromium.launch(browser_context);
    const context = await browser.newContext(browser_context);
    const page = await context.newPage();
    await page.goto(storeUrl);

    const response = await page.content();
    if (response.includes("client has been blocked by bot protection")) {
        console.log("Blocked by Bot Protection on the NBB " + apiPage + " Page | Proxy: " + proxy);
        //await page.screenshot({ path: 'debug_' + apiPage + '_blocked.png' });
        //bot.sendPhoto(debug_chat_id, 'debug_' + apiPage + '_blocked.png', { caption: "Blocked by Bot Protection on the NBB " + apiPage + " Page | Proxy: " + proxy });
        //console.log("Generating new User Agent for Proxy: " + proxy);
        //await imposter.generateNewDetails(proxy);
        imposter.blackListProxy(proxy, "nbb");
    } else {
        try {
            var deals = await nbb_parser(response);
            //await deal_notify(deals, 'nbb_outlet_deals', 'nbb');
            //await nbb_deals.addUnconfirmedDeals(deals);
            console.log("Found " + Object.keys(deals).length + " Deals on NBB " + apiPage + " Page")

            await browser.close();
            return deals;
        } catch (error) {
            console.log(error);
            bot.sendMessage(debug_chat_id, "An error occurred fetching the NBB " + apiPage + " Page");

            await browser.close();
            return {};
        }
    }
    await browser.close();
}

async function checkNbbPaymentGateways() {
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
        timezoneId: 'Europe/Berlin',
    };
    var proxy = "default";

    //Using a proxy
    if (config.nbb.proxies) {
        proxy = await imposter.getRandomProxy("nbb");
        const browserDetails = await imposter.getBrowserDetails(proxy);
        if (proxy != undefined) {
            browser_context.proxy = {
                server: proxy
            };
            browser_context.userAgent = browserDetails.userAgent;
            browser_context.viewport = browserDetails.viewport;
        } else {
            proxy = "default";
            console.log("All Proxies blacklisted on NBB.com!");
            bot.sendMessage(debug_chat_id, "All Proxies blacklisted on NBB.com!");
        }
    }

    const context = await puppeteer.launch({
        userDataDir: '/tmp/nbb-cart-checker/',
        args: [
            '--no-sandbox',
            '--proxy-server=' + proxy,
            '--lang=de-DE'
        ],
    });
    const page = await context.newPage();
    await page.goto("https://m.notebooksbilliger.de/checkout/init");

    const response = await page.content();
    const wr_circumvented = await wr_circumvention(page);
    if (wr_circumvented) {
        console.log("Drop incoming (Waiting Room)")
        message = `🌠 <b>Alle Mann auf Gefechtsstation!</b>\n<a href="https://shop.nvidia.com/de-de/geforce/store/">NVIDIA Founders Edition Drop</a> incoming! Ein Warteraum ist aufgetaucht!`;
        await bot.sendMessage(config.services.telegram.deals_chat_id, message, { parse_mode: 'HTML', disable_web_page_preview: true })
    }

    if (response.includes("client has been blocked by bot protection")) {
        console.log("Blocked by Bot Protection on the NBB Checkout Page | Proxy: " + proxy);
        //await page.screenshot({ path: 'debug_' + apiPage + '_blocked.png' });
        //bot.sendPhoto(debug_chat_id, 'debug_' + apiPage + '_blocked.png', { caption: "Blocked by Bot Protection on the NBB " + apiPage + " Page | Proxy: " + proxy });
        //console.log("Generating new User Agent for Proxy: " + proxy);
        //await imposter.generateNewDetails(proxy);
        imposter.blackListProxy(proxy, "nbb");
    } else {
        try {
            const jsonEl = await page.waitForSelector('pre', { timeout: 30000 });
            const json = JSON.parse(await page.evaluate(el => el.textContent, jsonEl));
            if (json.error) {
                console.log("Couldn't fetch payment methods!")

                if (json.error = ['customer_not_logged_in']) {
                    console.log("Require login!");
                    await performNbbLogin(page);
                    if (json.cartCount == 0) {
                        console.log("Require adding product to cart!");
                        await page.goto('https://m.notebooksbilliger.de/msi+geforce+gt+710+1gd3h+lp');
                        await page.click('.qa-product-add-to-shopping-cart-pdp-regular');
                        console.log("Added product to cart!");
                    }
                    //console.log(json);
                } else {
                    console.log(json.error);
                }
            } else {
                var payment_methods = [];
                for (const payment_module of json.modules) {
                    payment_methods.push(payment_module.id);
                }

                var old_payment_methods = {}
                try {
                    old_payment_methods = JSON.parse(await db.get("nbb_payment_methods"));
                } catch {
                    console.log("Failed fetching nbb_payment_methods (Key Value Store not initialized yet propably)");
                }

                //payment_methods = [['klarnapaylater']];
                console.log(payment_methods.length + " Payment Methods found on NBB!");
                console.log(payment_methods);

                if (payment_methods.length != old_payment_methods.length && old_payment_methods.length > 0) {
                    var message = "";
                    if (old_payment_methods > payment_methods) {
                        console.log("Drop incoming")
                        message = `🌠 <b>Alle Mann auf Gefechtsstation!</b>\n<a href="https://shop.nvidia.com/de-de/geforce/store/">NVIDIA Founders Edition Drop</a> incoming!`;
                    } else {
                        console.log("Drop is over!")
                        message = `⚠️ <b>Entwarnung!</b>\nDer NVIDIA Founders Edition Drop für heute ist vorbei.`;
                    }
                    await bot.sendMessage(config.services.telegram.deals_chat_id, message, { parse_mode: 'HTML', disable_web_page_preview: true })

                }

                await db.put("nbb_payment_methods", JSON.stringify(payment_methods));
            }

        } catch (error) {
            console.log(error);
            bot.sendMessage(debug_chat_id, "An error occurred fetching the NBB Checkout Page: ```\n" + error.stack + "\n```", { parse_mode: 'MarkdownV2' });
        }
    }

    await context.close();
}

async function performNbbLogin(page) {
    const resp = await page.evaluate(async (credentials) => await (await fetch("https://m.notebooksbilliger.de/auth/login", {
        "credentials": "include",
        "headers": {
            "Content-Type": "application/json;charset=utf-8"
        },
        "referrer": "https://m.notebooksbilliger.de/kundenkonto/login",
        "body": "{\"email\":\"" + credentials.email + "\",\"password\":\"" + credentials.password + "\"}",
        "method": "POST",
        "mode": "cors"
    })).text(), config.nbb.loginDetails);
    //console.log(resp);
}

async function checkNbbFoundersEditionPages() {
    drop_urls = JSON.parse(await db.get("nbb_drop_url_array"));
    /*drop_urls["NVLink Bridge"] = {
        "269374": "https://www.notebooksbilliger.de/nvidia+sli+hb+bridge+269374"
    }*/

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

    if (config.nbb.proxies) {
        browser_context.proxy = {
            server: proxy
        };
    }

    const browser = await chromium.launch(browser_context);
    var tasks = [];
    var deals = {};

    for (const [card, links] of Object.entries(drop_urls)) {
        //console.log(card);
        for (const [id, link] of Object.entries(links)) {
            //console.log(link)
            //Using a proxy
            const task = (async () => {
                if (config.nbb.proxies) {
                    proxy = await imposter.getRandomProxy("nbb");
                    const browserDetails = await imposter.getBrowserDetails(proxy);
                    if (proxy != undefined) {
                        browser_context.proxy = {
                            server: proxy
                        };
                        browser_context.userAgent = browserDetails.userAgent;
                        browser_context.viewport = browserDetails.viewport;
                    } else {
                        proxy = "default";
                        console.log("All Proxies blacklisted on NBB.com!");
                        bot.sendMessage(debug_chat_id, "All Proxies blacklisted on NBB.com!");
                    }
                }

                const context = await browser.newContext(browser_context);
                const page = await context.newPage();
                await page.goto(link);
                const response = await page.content();

                if (response.includes("client has been blocked by bot protection")) {
                    console.log("Blocked by Bot Protection on the NBB " + apiPage + " Page | Proxy: " + proxy);
                    //await page.screenshot({ path: 'debug_' + apiPage + '_blocked.png' });
                    //bot.sendPhoto(debug_chat_id, 'debug_' + apiPage + '_blocked.png', { caption: "Blocked by Bot Protection on the NBB " + apiPage + " Page | Proxy: " + proxy });
                    //console.log("Generating new User Agent for Proxy: " + proxy);
                    //await imposter.generateNewDetails(proxy);
                    imposter.blackListProxy(proxy, "nbb");
                } else {
                    var status = "Unknown";
                    if (response.includes("Leider ist dieser Artikel nicht mehr verfügbar.")) {
                        status = "Product page inactive!";
                    } else if (response.includes("js-pdp-head-add-to-cart")) {
                        const price = parseFloat(response.match(/data-price-formatted="[^"]*/)[0].replace('data-price-formatted="', ""));
                        status = "In Stock!";
                        deals[id] = {
                            title: card,
                            href: link,
                            price: price
                        }
                    } else if (response.includes("Dieses Produkt ist leider ausverkauft.")) {
                        status = "Sold out!";
                    }

                    console.log(link + " | " + status)
                }
                await context.close();
            })();
            tasks.push(task);
        }
    }
    await Promise.all(tasks);
    await browser.close();
    return deals;
}

async function addProductToCart(page, productId) {
    const details = {
        multipartId: "------WebKitFormBoundary" + crypto.randomBytes(8).toString('hex'),
        productId: productId
    }
    console.log(details)

    const text = await page.evaluate(async (self) => {
        return await (await fetch("https://m.notebooksbilliger.de/cart/add/", {
            "credentials": "include",
            "headers": {
                "Accept": "application/json, text/plain, */*",
                "Content-Type": "multipart/form-data; boundary=" + self.multipartId,
                "Pragma": "no-cache",
                "Cache-Control": "no-cache",
            },
            "body": self.multipartId + "\nContent-Disposition: form-data; name=\"id\"\n\n" + self.productId + "\n" + self.multipartId + "--\n",
            "method": "POST",
            "mode": "cors"
        })).text();
    }, details);
    console.log(text);
}