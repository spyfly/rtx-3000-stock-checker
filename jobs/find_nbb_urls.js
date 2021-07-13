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

const { parse } = require('node-html-parser');

const imposter = require('../libs/imposter.js');

const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin())

const gpuEtags = {
    "49/e6/d2_5be6881a43c353622f07b3880c": "NVIDIA GeForce RTX 3060 Ti FE",
    "e4/96/ef_87beb9dff11774b0660f0cad59": "NVIDIA GeForce RTX 3070 FE",
    "1d/b7/87_c3e8cbc3bbaf412047c62a185f": "NVIDIA GeForce RTX 3070 Ti FE",
    "64/18/9b_3835aa2dccdc32ebaa51df5e61": "NVIDIA GeForce RTX 3080 FE",
    "be/0b/59_ea32e78bc85a790494e1bcb6b6": "NVIDIA GeForce RTX 3080 Ti FE",
    "ab/d4/93_4adb54045e4bd31ae0e961287c": "NVIDIA GeForce RTX 3090 FE"
}

const cdnUrl = "https://media.nbb-cdn.de/product_images/listing_image/-p";
const productsUrl = "https://m.notebooksbilliger.de/products_id/";

async function main() {
    var axios_config = {};
    var requests = [];

    const context = await puppeteer.launch({
        userDataDir: '/tmp/nbb-cart-checker/',
        args: [
            '--no-sandbox',
            '--proxy-server=' + await imposter.getRandomProxy(),
            '--lang=de-DE'
        ],
    });

    try {
        //Using a proxy
        for (var productId = 721000; productId < 730000; productId++) {
            //Using a proxy
            if (config.nbb.proxies) {
                proxy = await imposter.getRandomProxy();

                if (productId % 10 == 0) {
                    await imposter.generateNewDetails(proxy);
                }

                browserDetails = await imposter.getBrowserDetails(proxy);
                axios_config.httpsAgent = new SocksProxyAgent(proxy);
                axios_config.headers = { 'User-Agent': browserDetails.userAgent }
            }
            const req = axios.head(cdnUrl + productId, axios_config).then(async (res) => {
                const eTag = res.headers["etag"];
                const id = res.config.url.split("-p")[1];
                if (gpuEtags[eTag]) {
                    
                    const page = await context.newPage();
                    await page.goto("https://www.notebooksbilliger.de/Produkte/Grafikkarten/action");
                    await page.setContent(`<form method="post" action="https://www.notebooksbilliger.de/Produkte/Grafikkarten/action/add_product">
                        <input type="hidden" name="products_id" value="${id}">
                        <button type="submit" id="add_to_cart">
                            In den Warenkorb
                        </button>
                    </form>`);
                    await Promise.all([page.click('#add_to_cart'), page.waitForNavigation({ timeout: 120000 })]);
                    const url = (await page.url()).split("/produkte/grafikkarten")[0];
                    await page.close();

                    const gpuName = gpuEtags[eTag];
                    console.log(gpuName + ": " + url);
                    
                    //const gpuName = gpuEtags[eTag];
                    //console.log("Found ID for " + gpuName + ": " + id);
                }
            }).catch(function (error) {
                console.log(error.message);
            });
            requests.push(req);
        }

        await Promise.all(requests);
        await context.close();
        //console.log("Checked " + cardUrls.length + ` NBB Product Images directly in ${((performance.now() - time) / 1000).toFixed(2)} s`);
        //db.close();
    } catch (error) {
        console.log(error);
        bot.sendMessage(debug_chat_id, "An error occurred scanning for NBB Product IDs: ```\n" + error.stack + "\n```", { parse_mode: 'MarkdownV2' });
    }
}

main();
