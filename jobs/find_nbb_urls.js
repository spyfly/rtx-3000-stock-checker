process.env["NTBA_FIX_319"] = 1;
const axios = require('axios').default;
const { SocksProxyAgent } = require('socks-proxy-agent');

const TelegramBot = require('node-telegram-bot-api');

const config = require('../config.json');
const bot = new TelegramBot(config.services.telegram.token);
const deals_chat_id = config.services.telegram.deals_chat_id;
const debug_chat_id = config.services.telegram.debug_chat_id;

const { performance } = require('perf_hooks');

const level = require('level-party')
var db = level('./status', { valueEncoding: 'json' })

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

const startOffset = 1000;
const checkingRange = 5000;

async function main() {
    const time = performance.now();

    var axios_config = {};
    var requests = [];

    var drop_urls = {}
    try {
        drop_urls = JSON.parse(await db.get("nbb_drop_url_array"));
    } catch {
        console.log("Failed fetching nbb_drop_urls (Key Value Store not initialized yet propably)");
    }

    // Fill Array
    if (Object.values(drop_urls).length != 6) {
        for (const card of Object.values(gpuEtags)) {
            drop_urls[card] = {}
        }
    }

    console.log(drop_urls);



    var max_id = 725000;

    for (const ids of Object.values(drop_urls)) {
        for (const id of Object.keys(ids)) {
            if (id > max_id)
                max_id = id;
        }
    }

    // Deduct 1000 to catch other IDs aswell
    max_id -= startOffset;
    console.log("Starting ID: " + max_id)

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
        for (var productId = max_id; productId < max_id + checkingRange; productId++) {
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
                    await page.goto(`https://m.notebooksbilliger.de/products_id/${id}`);
                    var url = await page.url();

                    if (url.includes("https://m.notebooksbilliger.de/products_id/")) {
                        var retry = 0;
                        while (retry < 5) {
                            await page.goto("https://www.notebooksbilliger.de/Produkte/Grafikkarten/action");
                            await page.setContent(`<form method="post" action="https://www.notebooksbilliger.de/Produkte/Grafikkarten/action/add_product">
                                                <input type="hidden" name="products_id" value="${id}">
                                                <button type="submit" id="add_to_cart">
                                                    In den Warenkorb
                                                </button>
                                            </form>`);
                            await Promise.all([page.click('#add_to_cart'), page.waitForNavigation({ timeout: 120000 })]);
                            url = "https://www.notebooksbilliger.de/" + (await page.url()).match(/nvidia[^/]*/)[0];
                            if (url.includes("founders+edition")) {
                                retry = 10;
                            } else {
                                retry++;
                            }
                        }
                    }
                    await page.close();

                    const gpuName = gpuEtags[eTag];
                    console.log(gpuName + ": " + url);

                    //const gpuName = gpuEtags[eTag];
                    //console.log("Found ID for " + gpuName + ": " + id);
                    if (!drop_urls[gpuName][id]) {
                        drop_urls[gpuName][id] = url

                        console.log("Found new Link!");
                        await bot.sendMessage(deals_chat_id, '🔎 Found new Link for <a href="' + url + '">' + gpuName + '</a> 😯', { parse_mode: 'HTML', disable_web_page_preview: true })
                        console.log("Sent notify!");
                    }
                }
            }).catch(function (error) {
                console.log(error.message + "| Proxy: " + proxy);
            });
            requests.push(req);
        }

        await Promise.all(requests);
        console.log("Storing NBB Drop URLs");
        await db.put("nbb_drop_url_array", JSON.stringify(drop_urls));
        await db.close();

        await context.close();
        console.log("Checked " + checkingRange + ` NBB Product Images directly in ${((performance.now() - time) / 1000).toFixed(2)} s`);
    } catch (error) {
        console.log(error);
        bot.sendMessage(debug_chat_id, "An error occurred scanning for NBB Product IDs: ```\n" + error.stack + "\n```", { parse_mode: 'MarkdownV2' });
    }
}

main();
