const http = require('http');

const level = require('level-party')
var db = level('./status', { valueEncoding: 'json' })

const config = require('../config.json');

Object.keys(config.autobuy.cards).forEach(card => {
    //Fetching Card Status
    db.get(card + " NBB", function (err, nbbStatus) {
        db.get(card + " NV", function (err, nvStatus) {
            //Checking if card is in stock
            if (nbbStatus != "out_of_stock" || nvStatus != "out_of_stock" || config.autobuy.debug == true) {
                const urls = config.autobuy.cards[card];
                //Call autobuy URLs
                urls.forEach(url => {
                    http.get(url, (res) => {
                        res.setEncoding('utf8');
                        let rawData = '';
                        res.on('data', (chunk) => { rawData += chunk; });
                        res.on('end', () => {
                            try {
                                const data = JSON.parse(rawData);
                                console.log(data);
                            } catch (e) {
                                console.error(e.message);
                            }
                        });
                    });
                });
            }
        });
    });
});