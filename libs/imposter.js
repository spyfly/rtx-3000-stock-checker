const config = require('../config.json');

const UserAgent = require('user-agents');

const level = require('level-party')
var db = level('./status', { valueEncoding: 'json' })

module.exports = {
    getBrowserDetails: async function (proxy) {
        var rawDetails;
        try {
            rawDetails = await db.get(proxy);
            //console.log("Found old details, parsing")
            return JSON.parse(rawDetails);
        } catch {
            return await this.generateNewDetails(proxy);
        }
    },

    generateNewDetails: async function (proxy) {
        //console.log("Generating new Browser Details for " + proxy)
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
            //console.log("Updated cookies");
        } catch {
            //console.log("Failed storing cookies");
        }
    },

    getRandomProxy: async function (blacklist = "", localProxy = false, residentialProxy = false) {
        var proxies = config.proxies;

        if (residentialProxy)
            proxies = config.residentialProxies

        var blacklistedProxies = [];
        if (blacklist != "") {
            try {
                var rawDetails = await db.get("proxy_blacklist_" + blacklist);
                var blacklistedProxies = JSON.parse(rawDetails);
                //Filter array
                proxies = proxies.filter((el) => {
                    return !blacklistedProxies.includes(el);
                });
            } catch {
                //console.log("Failed getting blacklisted proxies for blacklist: " + blacklist);
            }
        }
        if (localProxy) {
            try {
                proxies = proxies.filter((el) => {
                    return el.includes("192.168.");
                });
            } catch {
                //console.log("Failed getting blacklisted proxies for blacklist: " + blacklist);
            }
        }
        const proxyCount = proxies.length
        const proxyId = Math.floor(Math.random() * proxyCount);
        const proxy = proxies[proxyId];
        return proxy;
    },

    blackListProxy: async function (proxy, blacklist) {
        var rawDetails;
        const key = "proxy_blacklist_" + blacklist;
        try {
            rawDetails = await db.get(key);
            var blackListedProxies = JSON.parse(rawDetails);
            blackListedProxies.push(proxy);
            await db.put(key, JSON.stringify(blackListedProxies));
            //console.log("Updated cookies");
        } catch {
            await db.put(key, "[]");
            //console.log("Failed storing cookies");
        }
    },

    getProxySelection: async function (app) {
        const key = "proxy_selection_" + app;
        try {
            return await db.get(key);
        } catch {
            console.log("Failed getting proxy selection for " + app);
            return null;
        }
    },

    storeProxySelection: async function (proxy, app) {
        const key = "proxy_selection_" + app;
        try {
            await db.put(key, proxy);
            console.log("Updated proxy selection for " + app);
        } catch {
            console.log("Failed storing proxy for " + app);
        }
    }
};