process.env["NTBA_FIX_319"] = 1;
const TelegramBot = require('node-telegram-bot-api');

const config = require('../config.json');
const bot = new TelegramBot(config.services.telegram.token);
const chat_id = config.services.telegram.chat_id;

const message = 'Ihr konntet dank dieses Tools erfolgreich eine Karte ergattern? Dann sponsert mir doch mal nen Kaffee ☕: http://paypal.me/pools/c/8AwDdO8Su9';
bot.sendMessage(chat_id, message);