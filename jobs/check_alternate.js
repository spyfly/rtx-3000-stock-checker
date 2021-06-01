process.env["NTBA_FIX_319"] = 1;
const axios = require('axios').default;
const { SocksProxyAgent } = require('socks-proxy-agent');

const TelegramBot = require('node-telegram-bot-api');

const { performance } = require('perf_hooks');

const config = require('../config.json');
const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;
const debug_chat_id = config.services.telegram.debug_chat_id;

const level = require('level-party')
var db = level('./status', { valueEncoding: 'json' })

const deal_notify = require('../libs/deal_notify.js');

const { parse } = require('node-html-parser');

const imposter = require('../libs/imposter.js');

function getRandom(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

const startPrice = getRandom(50, 250);
const maxPrice = getRandom(3000, 3500);

function getWebshopUrl(page = 1) {
    return 'https://www.alternate.de/listing_ajax.xhtml?t=21466&listing=1&filter_-2=true&filter_2203=NVIDIA+GeForce+RTX+3080&filter_2203=NVIDIA+GeForce+RTX+3070&filter_2203=NVIDIA+GeForce+RTX+3060+Ti&filter_2203=NVIDIA+GeForce+RTX+3060&filter_2203=NVIDIA+GeForce+RTX+3090&s=price_asc&page=' + page + '&pr1=' + startPrice + '&pr2=' + maxPrice;
}

async function main() {
    var cardUrls = [];

    var axios_config = {
        headers: { 'User-Agent': config.browser.user_agent }
    }

    //Using a proxy
    if (config.alternate.proxies) {
        proxy = await imposter.getRandomProxy();
        browserDetails = await imposter.getBrowserDetails(proxy);
        axios_config.httpsAgent = new SocksProxyAgent(proxy);
        axios_config.headers = { 'User-Agent': browserDetails.userAgent }
        axios_config.withCredentials = true;
        if (browserDetails.cookies.length > 0) {
            //console.log(browserDetails.cookies)
            axios_config.headers["Cookie"] = browserDetails.cookies.join("; ")
        }
    }

    try {
        var deals = {};
        var i = 1;
        var response;
        var failure = 0;

        var productsCount = 24;
        while (productsCount == 24 && failure < 5) {
            try {
                response = await axios.get(getWebshopUrl(i++), axios_config);
                //Get Cookies and Store
                const overviewCookies = await getCookies(response)
                if (overviewCookies.length > 0) {
                    console.log(overviewCookies);
                    await imposter.updateCookies(proxy, overviewCookies);
                }
                // Store cookies end
            } catch (err) {
                failure++;
                console.log("Failed fetching Alternate Product Overview: " + err.message)
            }

            const root = parse(response.data);
            const products = root.querySelectorAll('.card');
            productsCount = products.length;
            console.log(productsCount + " Products found.")

            products.forEach(async product => {
                const card = {}
                card.title = product.querySelector('.productPicture').getAttribute('alt').split(',')[0];
                card.href = product.getAttribute("href");
                card.price = parseFloat(product.querySelector('.price').textContent.replace("€ ", "").replace(".", "").replace(",", "."));
                const id = card.href;

                if (card.price < 2000) {
                    cardUrls.push(card.href);
                    console.log(card.title);
                }
            });
        }

        axios_config.validateStatus = function (status) {
            return (status >= 200 && status < 300) || status == 404 || status == 521;
        };

        const time = performance.now();

        var requests = [];
        for (const cardUrl of cardUrls) {
            //Using a proxy
            if (config.alternate.proxies) {
                proxy = await imposter.getRandomProxy();
                browserDetails = await imposter.getBrowserDetails(proxy);
                axios_config.httpsAgent = new SocksProxyAgent(proxy);
                axios_config.headers = { 'User-Agent': browserDetails.userAgent }
                axios_config.withCredentials = true;
                if (browserDetails.cookies.length > 0) {
                    //console.log(browserDetails.cookies)
                    axios_config.headers["Cookie"] = browserDetails.cookies.join("; ")
                }
            }
            const req = axios.get(cardUrl, axios_config).then(async (res) => {
                //Get Cookies and Store
                const overviewCookies = await getCookies(res)
                if (overviewCookies.length > 0) {
                    console.log(overviewCookies);
                    await imposter.updateCookies(proxy, overviewCookies);
                }
                // Store cookies end

                if (res.status == 521) {
                    console.log("Failed fetching Alternate Product Page for " + cardUrl);
                } else if (res.status == 404) {
                    //const out_of_stock = res.data.includes("Dieser Artikel ist leider nicht mehr verfügbar!");
                    console.log("Card not listed anymore for " + cardUrl);
                } else {
                    const html = parse(res.data);
                    const card = {}
                    card.title = html.querySelector("title").text.split(",")[0]
                    const in_stock = (html.querySelectorAll("#add-to-cart-form .details-cart-button:not([disabled])").length >= 1);
                    if (in_stock) {
                        const html = parse(res.data);
                        card.href = cardUrl;
                        card.price = parseFloat(html.querySelector('[itemprop="price"]').getAttribute("content"));
                        const id = card.href;

                        console.log(card.title + " for " + card.price);
                        deals[id] = card;
                    } else if (html.querySelector("#product-top-right")) {
                        const productBox = html.querySelector("#product-top-right").textContent;
                        const out_of_stock = productBox.includes("Bereits verkauft")
                            || productBox.includes("Artikel kann derzeit nicht gekauft werden")
                            || productBox.includes("derzeit sind alle Artikel reserviert")
                            || productBox.includes("Sämtliche Lagerbestände befinden sich in Warenkörben und können daher weder über die Homepage noch telefonisch bestellt werden.");
                        if (!out_of_stock) {
                            console.log("Could not figure out Stock Status for " + cardUrl);
                            bot.sendMessage(debug_chat_id, "Could not figure out Stock Status for " + cardUrl);
                        }
                    } else {
                        console.log("No product information found!");
                    }
                }
            }, (err) => {
                console.log("Failed fetching Alternate Product Page for: " + cardUrl);
            });
            requests.push(req);
        }

        await Promise.all(requests);

        //Processing Notifications
        await deal_notify(deals, 'alternate_webshop_deals', 'alternate');

        console.log("Checked " + cardUrls.length + ` Alternate Product Pages directly in ${((performance.now() - time) / 1000).toFixed(2)} s`)
        db.close();
    } catch (error) {
        console.log(error);
        bot.sendMessage(debug_chat_id, "An error occurred fetching the Alternate Webshop Page: ```\n" + error.stack + "\n```", { parse_mode: 'MarkdownV2' });
    }
}

async function getCookies(response) {
    var cookies = [];
    if (response.headers["set-cookie"]) {
        for (const cookie of response.headers["set-cookie"]) {
            cookies.push(cookie.split("; ")[0]);
        }
    }
    return cookies;
}

main();
