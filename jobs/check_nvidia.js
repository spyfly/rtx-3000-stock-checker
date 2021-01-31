process.env["NTBA_FIX_319"] = 1;
const TelegramBot = require('node-telegram-bot-api');
const http2 = require('http2');

const config = require('../config.json');
const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;

const level = require('level-party')
var db = level('./status', { valueEncoding: 'json' })

var data = "";

const nvShopUrl = 'https://www.nvidia.com/de-de/shop/geforce/';

const client = http2.connect("https://api.nvidia.partners")
const req = client.request({
    ':path': '/edge/product/search?page=1&limit=9&locale=de-de',
    'User-Agent': config.browser.user_agent
});

req.on("response", (headers, flags) => {
    /*
    for (const name in headers) {
        console.log(`${name}: ${headers[name]}`);
    }
    */
});

req.on("data", chunk => {
    data += chunk;
});

req.on("end", () => {
    //console.log(data);
    try {
        const json = JSON.parse(data);
        const products = json.searchedProducts.productDetails;
        products.push(json.searchedProducts.featuredProduct);
        products.forEach(function (product) {
            if (product.isFounderEdition) {
                console.log(product.displayName);
                var status, message;
                const card = product.displayName.replace("Nvidia RTX ", "");

                if (product.prdStatus != 'out_of_stock' || product.purchaseOption != '' || product.isOffer != false) {
                    status = "in_stock";
                    console.log("> Is in stock!")
                } else {
                    status = "out_of_stock";
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
                console.log("------------------------------------------------------------------")
            }
        });
    } catch (error) {
        console.log(error);
        bot.sendMessage(chat_id, "An error occurred fetching Nvidias page, cards may be available: " + nvShopUrl);
    }
    client.close();
});