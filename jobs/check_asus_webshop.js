process.env["NTBA_FIX_319"] = 1;
const TelegramBot = require('node-telegram-bot-api');

const { performance } = require('perf_hooks');
const { firefox } = require('playwright-extra')

const config = require('../config.json');
const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;
const debug_chat_id = config.services.telegram.debug_chat_id;

const level = require('level-party')
var db = level('./status', { valueEncoding: 'json' })

const deal_notify = require('../libs/deal_notify.js');

const { parse } = require('node-html-parser');

async function main() {
    var usedProxies = [];

    const asusWebShopUrls = [
        'https://webshop.asus.com/de/search?sSearch=3060',
        'https://webshop.asus.com/de/search?sSearch=3070',
        'https://webshop.asus.com/de/search?sSearch=3080',
        'https://webshop.asus.com/de/search?sSearch=3090'
    ];
    const browser = await firefox.launch({
        proxy: {
            server: 'socks5://1.1.1.1:1080',
        },
        extraHTTPHeaders: {
            DNT: "1"
        },
        locale: 'de-DE',
        timezoneId: 'Europe/Berlin'
    });

    try {
        var deals = {};
        var i = 0;
        var response;
        for (const url of asusWebShopUrls) {
            response = await playwrightHttpRequest(url);
            const root = parse(response.data);
            const productsBox = root.querySelector('.listing');
            const products = productsBox.querySelectorAll('.product--info');
            console.log(products.length + " Products found.")

            products.forEach(async product => {
                const card = {}
                card.title = product.querySelector('.product--title').getAttribute("title");
                card.href = product.querySelector('.product--title').getAttribute("href");
                card.price = parseFloat(product.querySelector('.price--default').textContent.replace(".", "").replace(",", "."));
                const id = card.href;

                const out_of_stock = product.querySelector('.product--delivery').text.includes('Aktuell nicht verfügbar');
                //Card is a 3000 Series
                if (card.title.includes("RTX30")) {
                    if (!out_of_stock) {
                        console.log(card.title + " for " + card.price);
                        deals[id] = card;
                    }
                }
            });
        }

        const time = performance.now();

        console.log("Closing browser")
        await browser.close();

        //Processing Notifications
        await deal_notify(deals, 'asus_webshop_deals', 'asus');
        db.close();
    } catch (error) {
        console.log(error);
        bot.sendMessage(debug_chat_id, "An error occurred fetching the Asus Webshop Page: ```\n" + error.stack + "\n```", { parse_mode: 'MarkdownV2' });
    }

    async function playwrightHttpRequest(url) {
        var result;
        if (config.asus_webshop.proxies) {
            const imposter = require('../libs/imposter.js');

            var proxy;
            foundProxy = false;
            while (foundProxy == false) {
                proxy = await imposter.getRandomProxy();
                if (!usedProxies.includes(proxy)) {
                    foundProxy = true;
                    usedProxies.push(proxy);
                }
            }
            browserDetails = await imposter.getBrowserDetails(proxy);
            const ctx = browser.newContext({
                proxy: {
                    server: proxy
                },
                userAgent: browserDetails.userAgent,
                viewport: browserDetails.viewport
            });
            const page = await (await ctx).newPage();
            const res = await page.goto(url);
            console.log(await page.evaluate(() => navigator.userAgent));
            var status = res.status()
            console.log(status);
            if (status == 429) {
                console.log("Rate limited!");
            } else if (status == 200) {
                result = await res.text();
                i = 10;
            } else if (status == 403) {
                const resp = await page.waitForNavigation({ timeout: 10000 });
                if (resp.status() == 200) {
                    result = await res.text();
                }
                status = resp.status();
            }
            await (await ctx).close();
            return {
                status: status,
                data: result
            };
        }
    }
}

main();