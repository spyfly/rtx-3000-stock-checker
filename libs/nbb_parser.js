const { parse } = require('node-html-parser');

module.exports = async function (html) {
    const root = parse(html);
    const products = root.querySelectorAll('.js-ado-product-click');
    console.log(products.length + " Products found.")

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

    return deals;
}