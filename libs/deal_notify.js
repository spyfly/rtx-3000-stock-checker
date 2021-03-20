var dateFormat = require('dateformat');

const config = require('../config.json');

const level = require('level-party')
var db = level('./status', { valueEncoding: 'json' })

const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;

const axios = require('axios').default;

module.exports = async function (deals, db_index, shop_name) {
    var oldDeals = {}
    try {
        oldDeals = JSON.parse(await db.get(db_index));
    } catch {
        console.log("Failed fetching oldDeals (Key Value Store not initialized yet propably)");
    }

    // New Deal Notification
    for (const [id, deal] of Object.entries(deals)) {
        if (!oldDeals[id]) {
            //Notify about new Deal
            const { message_id } = await bot.sendMessage(chat_id, createMessage(deal), { parse_mode: 'HTML' })

            //Trigger AutoBuy
            if (config.autobuy.enabled)
                axios.post(config.autobuy.url + '/trigger', { shop: shop_name, deal: deal }).then(null, () => {
                    console.log("Failed triggering AutoBuy for " + deal.title)
                })

            //Store Message ID
            deals[id].message_id = message_id;
        }
    }

    // Deal gone Notification
    for (const [id, deal] of Object.entries(oldDeals)) {
        if (!deals[id]) {
            //Notify about deal being gone
            try {
                await bot.editMessageText(createMessage(deal), {
                    chat_id: chat_id,
                    message_id: deal.message_id,
                    parse_mode: 'HTML'
                })
            } catch (err) {
                console.log("Couldn't edit message!");
            }
        } else {
            //Preserve Message ID
            deals[id].message_id = deal.message_id;
        }
    }

    await db.put(db_index, JSON.stringify(deals));
    await db.close();
}

function createMessage(deal) {
    var prefix = '✅';
    var suffix = '';
    if (deal.message_id) {
        //Out of Stock
        prefix = '❌';
        suffix = ' (gone at ' + dateFormat(new Date(), "H:MM") + ')';
    }

    return prefix + ' <a href="' + deal.href + '">' + deal.title + '</a> for <b>' + deal.price.toFixed(2) + '€</b>' + suffix;
}