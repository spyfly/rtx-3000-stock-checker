module.exports = async (page) => {
    var wr_circumvented = false;
    const cookies = await page.cookies();

    for (const cookie of cookies) {
        console.log(cookie)
        if (cookie.name.includes("akavpwr_")) {
            const waitingPage = cookie.name.split("_")[1];
            const newCookieName = "akavpau_" + waitingPage.charAt(0).toUpperCase() + waitingPage.slice(1) + "VP";
            console.log(newCookieName);

            //Delete old cookie
            await page.deleteCookie(cookie);

            //Rename and store cookie
            cookie.name = newCookieName;
            await page.setCookie(cookie);
            wr_circumvented = true;
        }
    }

    return wr_circumvented;
}