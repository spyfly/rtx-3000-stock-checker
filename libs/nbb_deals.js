const level = require('level-party')

module.exports = {
    addUnconfirmedDeals: async function (newDeals) {
        if (Object.keys(newDeals).length > 0) {
            var existingDeals = await this.getUnconfirmedDeals();
            await Object.assign(existingDeals, newDeals);
            var db = level('./status', { valueEncoding: 'json' })
            db.put('nbb_unconfirmed_deals', JSON.stringify(existingDeals));
        }
    },
    getUnconfirmedDeals: async function () {
        var db = level('./status', { valueEncoding: 'json' })
        var deals = {};
        try {
            deals = JSON.parse(await db.get('nbb_unconfirmed_deals'));
        } catch {
            console.log("Failed fetching nbb_unconfirmed_deals (Key Value Store not initialized yet propably)");
        }
        db.close();
        return deals;
    },
    purgeDeal: async function (dealId) {
        var deals = await this.getUnconfirmedDeals();
        if (deals[dealId]) {
            delete deals[dealId];
            var db = level('./status', { valueEncoding: 'json' })
            db.put('nbb_unconfirmed_deals', JSON.stringify(deals));
        }
    }
}