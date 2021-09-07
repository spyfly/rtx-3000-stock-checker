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
const nvStockCheckerUrl = 'https://api.store.nvidia.com/partner/v1/feinventory?skus=DE&locale=DE&time=' + performance.now();


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
        const products = json.listMap;
        products.forEach(function (product) {
            var status, message;
            let cardName;
            let name;
            const sku = product.fe_sku;
            switch (sku) {
                case "NVGFT060T_DE":
                    name = "NVIDIA RTX 3060 Ti Founders Edition";
                    break;
                case "NVGFT070_DE":
                    name = "NVIDIA RTX 3070 Founders Edition";
                    break;
                case "NVGFT070T_DE":
                    name = "NVIDIA RTX 3070 Ti Founders Edition";
                    break;
                case "NVGFT080_DE":
                    name = "NVIDIA RTX 3080 Founders Edition";
                    break;
                case "NVGFT080T_DE":
                    name = "NVIDIA RTX 3080 Ti Founders Edition";
                    break;
                case "NVGFT090_DE":
                    name = "NVIDIA RTX 3090 Founders Edition";
                    break;
            }

            if (config.nvidia.debug)
                console.log(name);
            if (product.is_active == "true") {
                status = "in_stock";
                // Add Deal
                const id = sku;
                const card = {
                    title: name,
                    href: product.product_url,
                    price: parseFloat(product.price)
                }
                deals[id] = card;

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
                    console.log("> Still out of stock. | Stock Status: " + product.is_active)
            }

            message = product.displayName + " is " + product.prdStatus + " at Nvidia";

            if (config.nvidia.debug)
                console.log("------------------------------------------------------------------")

        });
    } catch (error) {
        console.log(error);
        bot.sendMessage(debug_chat_id, "An error occurred fetching Nvidias page, cards may be available");
    }

    await deal_notify(deals, 'nvidia_webshop_deals', 'nbb');
}

main();