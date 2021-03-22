process.env["NTBA_FIX_319"] = 1;
const axios = require('axios').default;
const { performance } = require('perf_hooks');
const { SocksProxyAgent } = require('socks-proxy-agent');

const TelegramBot = require('node-telegram-bot-api');

const config = require('../config.json');
const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;

const imposter = require('../libs/imposter.js');

const level = require('level-party')
var db = level('./status', { valueEncoding: 'json' })

const nvShopUrl = 'https://www.nvidia.com/de-de/shop/geforce/';
const nvStockCheckerUrl = 'https://api.nvidia.partners/edge/product/search?page=1&limit=9&locale=de-de';

async function main() {
    var axios_config = {
        headers: { 'User-Agent': config.browser.user_agent }
    }

    //Using a proxy
    if (config.nvidia.proxies) {
        proxy = await imposter.getRandomProxy();
        browserDetails = await imposter.getBrowserDetails(proxy);
        axios_config.httpsAgent = new SocksProxyAgent(proxy);
        axios_config.headers = { 'User-Agent': browserDetails.userAgent }
    }

    let time = performance.now();
    const response = await axios.get(nvStockCheckerUrl, axios_config);
    console.log(`Fetched NV_Stock in ${((performance.now() - time)).toFixed(0)} ms`);

    try {
        const json = response.data;
        const products = json.searchedProducts.productDetails;
        products.push(json.searchedProducts.featuredProduct);
        products.forEach(function (product) {
            if (product.isFounderEdition) {
                if (config.nvidia.debug)
                    console.log(product.displayName);
                var status, message;
                const card = product.displayName.replace("Nvidia RTX ", "");

                if (product.prdStatus != 'out_of_stock' || product.purchaseOption != '' || product.isOffer != false) {
                    status = "in_stock";
                    if (config.nvidia.debug)
                        console.log("> Is in stock!")
                } else {
                    status = "out_of_stock";
                    if (config.nvidia.debug)
                        console.log("> Still out of stock. | Stock Status: " + product.prdStatus)
                }

                message = product.displayName + " is " + product.prdStatus + " at " + nvShopUrl;

                const db_key = card + " NV";
                db.get(db_key, function (err, oldStatus) {
                    if (oldStatus != status) {
                        bot.sendMessage(chat_id, message);
                        db.put(db_key, status, function (err) { });
                    }
                });
                if (config.nvidia.debug)
                    console.log("------------------------------------------------------------------")
            }
        });
    } catch (error) {
        console.log(error);
        bot.sendMessage(chat_id, "An error occurred fetching Nvidias page, cards may be available: " + nvShopUrl);
    }
}

main();