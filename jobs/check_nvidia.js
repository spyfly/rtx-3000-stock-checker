process.env["NTBA_FIX_319"] = 1;
const axios = require('axios').default;
const { performance } = require('perf_hooks');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('hpagent')

const TelegramBot = require('node-telegram-bot-api');

const config = require('../config.json');
const bot = new TelegramBot(config.services.telegram.token);
const debug_chat_id = config.services.telegram.debug_chat_id;

const deal_notify = require('../libs/deal_notify.js');

const imposter = require('../libs/imposter.js');
const fs = require('fs').promises;

const got = require('got');
const http2wrapper = require("http2-wrapper");

const nvShopUrl = 'https://www.nvidia.com/de-de/shop/geforce/';
const nvStockCheckerUrl = 'https://api.nvidia.partners/edge/product/search?page=1&limit=9&locale=de-de&manufacturer=NVIDIA&time=' + performance.now();

async function main() {
    var axios_config = {
        headers: { 'User-Agent': config.browser.user_agent }
    }

    //Using a proxy
    //if (config.nvidia.proxies) {
    proxy = await imposter.getRandomProxy();
    browserDetails = await imposter.getBrowserDetails(proxy);
    axios_config.httpsAgent = new SocksProxyAgent(proxy);

    var deals = {};
    let time = performance.now();
    const json = await got.get(nvStockCheckerUrl, {
        headers: {
            'User-Agent': browserDetails.userAgent,
            'Accept-Language': 'de,en-US;q=0.7,en;q=0.3'
        },
        http2: true,
    }).json();
    //console.log(json)
    console.log(`Fetched NV_Stock in ${((performance.now() - time)).toFixed(0)} ms`);

    try {
        const products = json.searchedProducts.productDetails;
        products.push(json.searchedProducts.featuredProduct);
        products.forEach(function (product) {
            if (product.isFounderEdition) {
                if (config.nvidia.debug)
                    console.log(product.displayName);
                var status, message;
                const cardName = product.displayName.replace("Nvidia RTX ", "");

                if (product.prdStatus != 'out_of_stock' || product.purchaseOption != '' || product.isOffer != false) {
                    status = "in_stock";
                    // Add Deal
                    if (product.retailers.length > 0) {
                        const stockDetail = product.retailers[0];
                        const id = stockDetail.productId;
                        const card = {
                            title: "NVIDIA GeForce RTX " + cardName + " Founders Edition",
                            href: stockDetail.purchaseLink,
                            price: parseFloat(stockDetail.salePrice)
                        }
                        deals[id] = card;
                    }

                    //Log JSON
                    try {
                        fs.writeFile('debug_nvidia_fe' + cardName.replace(" ", "_") + '.json', JSON.stringify(product));
                    } catch (err) {
                        console.log("Failed storing example JSON for " + cardName)
                    }

                    if (config.nvidia.debug)
                        console.log("> Is in stock!")
                } else {
                    status = "out_of_stock";
                    if (config.nvidia.debug)
                        console.log("> Still out of stock. | Stock Status: " + product.prdStatus)
                }

                message = product.displayName + " is " + product.prdStatus + " at " + nvShopUrl;

                if (config.nvidia.debug)
                    console.log("------------------------------------------------------------------")
            }
        });
    } catch (error) {
        console.log(error);
        bot.sendMessage(debug_chat_id, "An error occurred fetching Nvidias page, cards may be available: " + nvShopUrl);
    }

    await deal_notify(deals, 'nvidia_webshop_deals', 'nbb');
}

main();