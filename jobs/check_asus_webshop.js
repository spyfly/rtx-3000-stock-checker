process.env["NTBA_FIX_319"] = 1;
const axios = require('axios').default;
const { SocksProxyAgent } = require('socks-proxy-agent');

const TelegramBot = require('node-telegram-bot-api');

const { performance } = require('perf_hooks');

const config = require('../config.json');
const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;

const level = require('level-party')
var db = level('./status', { valueEncoding: 'json' })

const deal_notify = require('../libs/deal_notify.js');

const { parse } = require('node-html-parser');

async function main() {
    var cardUrls = await getCardUrls();
    const asusWebShopUrl = 'https://webshop.asus.com/de/komponenten/grafikkarten/rtx-30-serie/?p=1&n=48';

    var axios_config = {
        headers: { 'User-Agent': config.browser.user_agent }
    }

    //Using a proxy
    if (config.asus_webshop.proxies) {
        const imposter = require('../libs/imposter.js');

        proxy = await imposter.getRandomProxy();
        browserDetails = await imposter.getBrowserDetails(proxy);
        axios_config.httpsAgent = new SocksProxyAgent(proxy);
        axios_config.headers = { 'User-Agent': browserDetails.userAgent }
    }

    try {
        var deals = {};

        const response = await axios.get(asusWebShopUrl, axios_config);

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
            if (!out_of_stock) {
                console.log(card.title);
                deals[id] = card;
            }

            if (!cardUrls.includes(card.href)) {
                cardUrls.push(card.href);
            }
        });

        axios_config.validateStatus = function (status) {
            return (status >= 200 && status < 300) || status == 404 || status == 521;
        };

        const time = performance.now();

        var requests = [];
        for (const cardUrl of cardUrls) {
            //Using a proxy
            if (config.asus_webshop.proxies) {
                const imposter = require('../libs/imposter.js');

                proxy = await imposter.getRandomProxy();
                browserDetails = await imposter.getBrowserDetails(proxy);
                axios_config.httpsAgent = new SocksProxyAgent(proxy);
                axios_config.headers = { 'User-Agent': browserDetails.userAgent }
            }
            const req = axios.get(cardUrl, axios_config).then((res) => {
                if (res.status == 521) {
                    console.log("Failed fetching Asus Product Page for " + cardUrl);
                } else {
                    const out_of_stock = res.data.includes("Dieser Artikel ist leider nicht mehr verfügbar!") || res.data.includes("Nicht verfügbar");
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
            });
            requests.push(req);
        }

        await Promise.all(requests);

        //Processing Notifications
        await deal_notify(deals, 'asus_webshop_deals', 'asus');

        console.log("Checked " + cardUrls.length + ` Asus Product Pages directly in ${((performance.now() - time) / 1000).toFixed(2)} s`)
        db.close();
    } catch (error) {
        console.log(error);
        bot.sendMessage(chat_id, "An error occurred fetching the Asus Webshop Page");
    }
}

async function getCardUrls() {
    var cardUrlsLastUpdate = 0
    try {
        cardUrlsLastUpdate = await db.get('asus_webshop_cardurls_last_update');
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
    const util = require('util');
    const gunzip = util.promisify(zlib.gunzip);

    var axios_config = {
        headers: { 'User-Agent': config.browser.user_agent }
    }

    //Using a proxy
    if (config.asus_webshop.proxies) {
        const imposter = require('../libs/imposter.js');

        proxy = await imposter.getRandomProxy();
        browserDetails = await imposter.getBrowserDetails(proxy);
        axios_config.httpsAgent = new SocksProxyAgent(proxy);
        axios_config.headers = { 'User-Agent': browserDetails.userAgent }
    }

    var cardUrls = []

    axios_config.responseType = 'arraybuffer'
    const response = await axios.get(sitemapUrl, axios_config);

    const xmlSitemap = (await gunzip(response.data)).toString();
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
}

main();
