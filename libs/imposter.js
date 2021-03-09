const config = require('../config.json');

const UserAgent = require('user-agents');

const level = require('level-party')
var db = level('./status', { valueEncoding: 'json' })

module.exports = {
    getBrowserDetails: async function (proxy) {
        var rawDetails;
        try {
            rawDetails = await db.get(proxy);
            console.log("Found old details, parsing")
            return JSON.parse(rawDetails);
        } catch {
            return await this.generateNewDetails(proxy);
        }
    },

    generateNewDetails: async function (proxy) {
        console.log("Generating new Browser Details for " + proxy)
        const userAgent = new UserAgent({ deviceCategory: 'desktop' });
        details = {
            userAgent: userAgent.userAgent,
            viewport: {
                height: userAgent.viewportHeight,
                width: userAgent.viewportWidth
            },
            cookies: []
        }
        db.put(proxy, JSON.stringify(details))
        return details;
    },

    updateCookies: async function (proxy, cookies) {
        var rawDetails;
        try {
            rawDetails = await db.get(proxy);
            var updatedDetails = JSON.parse(rawDetails);
            updatedDetails.cookies = cookies;
            await db.put(proxy, JSON.stringify(updatedDetails));
            console.log("Updated cookies");
        } catch {
            console.log("Failed storing cookies");
        }
    },

    getRandomProxy: async function () {
        const proxyCount = config.proxies.length
        const proxyId = Math.floor(Math.random() * proxyCount);
        const proxy = config.proxies[proxyId];
        return proxy;
    }
};