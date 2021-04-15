const config = require('../config.json');

module.exports = (deal) => {
    for (const [card, price_limit] of Object.entries(config.price_limits).reverse()) {
        if (deal.title.toLowerCase().includes(card) || deal.title.toLowerCase().includes(card.replace(' ', ''))) {
            console.log('"' + deal.title + '" matched card: ' + card)
            if (deal.price <= price_limit) {
                console.log(deal.price + " matched price_limit of " + price_limit)
                return true;
            } else {
                console.log(deal.price + " didn't meet price_limit of " + price_limit)
                return false;
            }
        }
    }
    return false;
}