var dateFormat = require('dateformat');

const config = require('../config.json');
const is_good_deal = require('./is_good_deal.js');

const level = require('level-party')

const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;
const deals_chat_id = config.services.telegram.deals_chat_id;

const axios = require('axios').default;

module.exports = async function (deals, db_index, shop_name) {
    var db = level('./status', { valueEncoding: 'json' })

    var oldDeals = {}
    try {
        oldDeals = JSON.parse(await db.get(db_index));
    } catch {
        console.log("Failed fetching oldDeals (Key Value Store not initialized yet propably)");
    }

    // New Deal Notification
    for (const [id, deal] of Object.entries(deals)) {
        if (!oldDeals[id]) {
            //Trigger AutoBuy
            if (config.autobuy.enabled)
                axios.post(config.autobuy.url + '/trigger', { shop: shop_name, deal: deal }).then(null, () => {
                    console.log("Failed triggering AutoBuy for " + deal.title)
                })

            //Notify about new Deal
            if (is_good_deal(deal)) {
                console.log("Good deal!");
                deals[id].deal_message_id = await sendDealsMessage(deals_chat_id, deal);
            }

            //Store Message ID
            deals[id].message_id = await sendDealsMessage(chat_id, deal);
        }

        deals[id].lastSeen = Math.floor(Date.now() / 1000);
    }

    // Deal gone Notification
    for (const [id, deal] of Object.entries(oldDeals)) {
        if (!deals[id]) {
            const lastSeenSecondsAgo = Math.floor(Date.now() / 1000) - deal.lastSeen;
            //console.log("Last seen: " + lastSeenSecondsAgo)

            if ((lastSeenSecondsAgo < config.nbb.preserve_deal_duration && db_index == 'nbb_deals') ||
                (lastSeenSecondsAgo < config.alternate.preserve_deal_duration && shop_name == 'alternate')) {
                //Preserve Deal
                console.log("Preserving Deal for " + shop_name)
                deals[id] = deal;
            } else {
                //Notify about deal being gone (after 60 seconds for NBB)
                try {
                    await bot.editMessageText(createMessage(deal), {
                        chat_id: chat_id,
                        message_id: deal.message_id,
                        parse_mode: 'HTML',
                        disable_web_page_preview: true
                    })
                } catch (err) {
                    console.log("Couldn't edit message!");
                }

                //Good Deals Notify
                if (deal.deal_message_id)
                    try {
                        await bot.editMessageText(createMessage(deal), {
                            chat_id: deals_chat_id,
                            message_id: deal.deal_message_id,
                            parse_mode: 'HTML',
                            disable_web_page_preview: true
                        })
                    } catch (err) {
                        console.log("Couldn't edit message!");
                    }
            }
        } else {
            //Preserve Message IDs
            deals[id].message_id = deal.message_id;
            if (deal.deal_message_id)
                deals[id].deal_message_id = deal.deal_message_id;
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

        //Fixing Timezone
        const goneTime = new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" }).split(" ")[1].slice(0, -3);
        suffix = ' (gone at ' + goneTime + ')';
    }

    return prefix + ' <a href="' + deal.href + '">' + deal.title + '</a> for <b>' + deal.price.toFixed(2) + '€</b> at <i>' + getShopName(deal.href) + '</i>' + suffix;
}

function getShopName(url) {
    if (url.includes("alternate.de")) {
        return "Scalpernate";
    } else if (url.includes("saturn.de")) {
        return "Saturn";
    } else if (url.includes("mediamarkt.de")) {
        return "MediaMarkt";
    } else if (url.includes("notebooksbilliger.de")) {
        return "Grafikkartenteurer";
    } else if (url.includes("asus.com")) {
        return "Asus";
    }
}

async function sendDealsMessage(chatId, deal) {
    var message_id;
    try {
        var { message_id } = await bot.sendMessage(chatId, createMessage(deal), { parse_mode: 'HTML', disable_web_page_preview: true })
    } catch (err) {
        const err_message = err.message;
        if (err_message.includes("ETELEGRAM: 429 Too Many Requests: retry after ")) {
            const wait_for_seconds = parseInt(err_message.replace("ETELEGRAM: 429 Too Many Requests: retry after ", ""));
            console.log("Telegram Error! Retry after " + wait_for_seconds + " seconds!");
            await sleep(wait_for_seconds * 1000 + 1000);
            var { message_id } = await bot.sendMessage(chatId, createMessage(deal), { parse_mode: 'HTML', disable_web_page_preview: true })
        }
    }
    return message_id;
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}