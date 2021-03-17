process.env["NTBA_FIX_319"] = 1;
const axios = require('axios').default;
const ProxyAgent = require('proxy-agent');

const TelegramBot = require('node-telegram-bot-api');

const config = require('../config.json');
const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;

const level = require('level-party')
var db = level('./status', { valueEncoding: 'json' })

const { parse } = require('node-html-parser');

const asusWebShopUrl = 'https://webshop.asus.com/de/komponenten/grafikkarten/rtx-30-serie/?p=1&n=48';
const cardUrls = [
    "https://webshop.asus.com/de/komponenten/grafikkarten/nvidia-serie/2828/asus-rog-strix-rtx3080-10g-gaming",
    "https://webshop.asus.com/de/komponenten/grafikkarten/nvidia-serie/2829/asus-rog-strix-rtx3080-o10g-gaming",
    "https://webshop.asus.com/de/komponenten/grafikkarten/nvidia-serie/2824/asus-tuf-rtx3080-10g-gaming",
    "https://webshop.asus.com/de/komponenten/grafikkarten/nvidia-serie/2825/asus-tuf-rtx3080-o10g-gaming"
]

async function main() {
    var axios_config = {
        headers: { 'User-Agent': config.browser.user_agent }
    }

    //Using a proxy
    if (config.asus_webshop.proxies) {
        const imposter = require('../libs/imposter.js');

        proxy = await imposter.getRandomProxy();
        browserDetails = await imposter.getBrowserDetails(proxy);
        axios_config.httpsAgent = new ProxyAgent("http://" + proxy);
        axios_config.headers = { 'User-Agent': browserDetails.userAgent }
    }

    const response = await axios.get(asusWebShopUrl, axios_config);

    try {
        const root = parse(response.data);
        const productsBox = root.querySelector('.listing');
        const products = productsBox.querySelectorAll('.product--info');
        console.log(products.length + " Products found.")
        var deals = {};

        products.forEach(async product => {
            const card = {}
            card.title = product.querySelector('.product--title').getAttribute("title");
            card.href = product.querySelector('.product--title').getAttribute("href");
            card.price = parseFloat(product.querySelector('.price--default').textContent.replace(",", "."));
            const id = card.href;

            console.log(card.title);
            deals[id] = card;
        });

        axios_config.validateStatus = function (status) {
            return (status >= 200 && status < 300) || status == 404;
        };

        for (const cardUrl of cardUrls) {
            //Using a proxy
            if (config.asus_webshop.proxies) {
                const imposter = require('../libs/imposter.js');

                proxy = await imposter.getRandomProxy();
                browserDetails = await imposter.getBrowserDetails(proxy);
                axios_config.httpsAgent = new ProxyAgent("http://" + proxy);
                axios_config.headers = { 'User-Agent': browserDetails.userAgent }
            }
            const res = await axios.get(cardUrl, axios_config);
            const out_of_stock = res.data.includes("Dieser Artikel ist leider nicht mehr verfügbar!");
            if (!out_of_stock) {
                const html = parse(res.data);
                const card = {}
                card.title = html.querySelector(".product--article-name").text
                card.href = cardUrl;
                card.price = parseFloat(html.querySelector('[itemprop="price"]').getAttribute("content"));
                const id = card.href;

                console.log(card.title);
                deals[id] = card;
            }
        }

        var oldDeals = {}
        try {
            oldDeals = JSON.parse(await db.get('asus_webshop_deals'));
        } catch {
            console.log("Failed fetching oldDeals (Key Value Store not initialized yet propably)");
        }

        // New Deal Notification
        for (const [id, deal] of Object.entries(deals)) {
            if (!oldDeals[id]) {
                //Notify about new Deal
                await bot.sendMessage(chat_id, deal.title + " available for " + deal.price.toFixed(2) + "€: " + deal.href)
            }
        }

        // Deal gone Notification
        for (const [id, deal] of Object.entries(oldDeals)) {
            if (!deals[id]) {
                //Notify about deal being gone
                await bot.sendMessage(chat_id, deal.title + " not available any longer 😔")
            }
        }

        await db.put('asus_webshop_deals', JSON.stringify(deals));
        await db.close();
    } catch (error) {
        console.log(error);
        bot.sendMessage(chat_id, "An error occurred fetching the Asus Webshop Page");
    }
}

main();