process.env["NTBA_FIX_319"] = 1;
const axios = require('axios').default;
const ProxyAgent = require('proxy-agent');

const TelegramBot = require('node-telegram-bot-api');

const config = require('../config.json');
const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;

const level = require('level-party')
var db = level('./status', { valueEncoding: 'json' })

const deal_notify = require('../libs/deal_notify.js');

const { parse } = require('node-html-parser');

async function main() {
    const cardUrls = await getCardUrls();

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

    try {
        var deals = {};

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

        //Processing Notifications
        await deal_notify(deals, 'asus_webshop_deals', 'asus');

        console.log("Checked " + cardUrls.length + " Asus Product Pages")
        await db.put('asus_webshop_deals', JSON.stringify(deals));
        await db.close();
    } catch (error) {
        console.log(error);
        bot.sendMessage(chat_id, "An error occurred fetching the Asus Webshop Page");
    }
}

async function getCardUrls() {
    var cardUrlsLastUpdate = 0
    try {
        cardUrlsLastUpdate = JSON.parse(await db.get('asus_webshop_cardurls_last_update'));
    } catch {
        console.log("Failed fetching asus_webshop_cardurls_last_update (Key Value Store not initialized yet propably)");
    }

    const now = Math.floor(Date.now() / 1000);
    //Update CardUrls once per day
    if (cardUrlsLastUpdate + 86400 > now) {
        try {
            cardUrls = JSON.parse(await db.get('asus_webshop_cardurls'));

            return cardUrls;
        } catch {
            console.log("Failed fetching asus_webshop_cardurls (Key Value Store not initialized yet propably)");
        }
    }

    const sitemapUrl = 'https://webshop.asus.com/de/web/sitemap/shop-1/sitemap-1.xml.gz';

    const zlib = require('zlib');

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

    var cardUrls = []

    axios_config.responseType = 'arraybuffer'
    const response = await axios.get(sitemapUrl, axios_config);
    zlib.gunzip(response.data, async (err, buffer) => {
        const xmlSitemap = buffer.toString()

        const parser = require('fast-xml-parser');
        const jsonSitemap = parser.parse(xmlSitemap);
        for (const urlObj of jsonSitemap.urlset.url) {
            if (urlObj.loc.includes("rtx30") && urlObj.loc.includes("grafikkarten"))
                cardUrls.push(urlObj.loc)
        }

        console.log(cardUrls)
        await db.put('asus_webshop_cardurls_last_update', now);
        await db.put('asus_webshop_cardurls', JSON.stringify(cardUrls));
        return cardUrls;
    });
}

main();