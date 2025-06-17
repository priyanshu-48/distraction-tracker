(() => {
    let currentSite = "";

    chrome.runtime.onMessage.addListener((obj, sender, response) => {
        const { type, value, website } = obj;

        if (type === "NEW") {
            currentSite = website;
            
        }
    });
})();