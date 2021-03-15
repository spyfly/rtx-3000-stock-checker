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

//const nbbOutletUrl = 'https://www.notebooksbilliger.de/outlet/page/1?box_549_7248%5B%5D=143&sort=price&order=asc&availability=alle';
const nbbOutletCheckerUrl = 'https://www.notebooksbilliger.de/extensions/apii/filter.php?filters=on&listing=on&advisor=&box_549_7248%5B%5D=143&box_551_7248_min=&box_551_7248_max=&box_551_7248_slid=&box_65775_7248=&box_65776_7248=&action=applyFilters&category_id=7248&page=1&perPage=&sort=price&order=asc&availability=alle&eqsqid=';

async function main() {
    var axios_config = {
        headers: { 'User-Agent': config.browser.user_agent }
    }

    //Using a proxy
    if (config.nbb_outlet.proxies) {
        const imposter = require('../libs/imposter.js');

        proxy = await imposter.getRandomProxy();
        browserDetails = await imposter.getBrowserDetails(proxy);
        axios_config.httpsAgent = new ProxyAgent("http://" + proxy);
        axios_config.headers = { 'User-Agent': browserDetails.userAgent }
    }

    const response = await axios.get(nbbOutletCheckerUrl, axios_config);

    try {
        const root = parse(response.data);
        const products = root.querySelectorAll('.js-ado-product-click');
        console.log(products.length + " Outlet Products found.")

        var deals = {};

        products.forEach(async product => {
            const card = {}
            card.title = product.querySelector('li').textContent;
            card.href = product.querySelector('.listing_product_title').getAttribute("href");
            card.price = parseFloat(product.getAttribute('data-price'));
            const id = parseInt(product.getAttribute('data-product-id'));

            //Card is a 3000 Series card or FE
            if (card.title.includes("RTX 30") || card.title.includes("Founders Edition")) {
                console.log(card.title);
                deals[id] = card;
            }
        });

        var oldDeals = {}
        try {
            oldDeals = JSON.parse(await db.get('nbb_outlet_deals'));
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

        await db.put('nbb_outlet_deals', JSON.stringify(deals));
        await db.close();
    } catch (error) {
        console.log(error);
        bot.sendMessage(chat_id, "An error occurred fetching the NBB Outlet Page");
    }
}

main();