let activeTabId = null;
let lastTab = null;

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  activeTabId = activeInfo.tabId;
});

async function sendStartData(tab){
  try{
      const startData = {
        url: tab.url,
        domain: new URL(tab.url).hostname,
        title: tab.title,
        startTime: new Date().toISOString()
      };
      await axios.post("http://localhost:3000/api/start-tab", startData);

      lastTab = {
        url : tab.url,
        id : tab.id
      };
    }catch (error) {
      console.error("Failed to send tab data:", error);
  }
}

async function sendEndData(){
  try{
    const endData = {
      url: lastTab.url,
        endedAt: new Date().toISOString()
    };
    await axios.post("http://localhost:3000/api/end-tab",endData);
  }catch(err){
    console.error("Failed to end tab on close:",error);
  }
};

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tabId === activeTabId && changeInfo.status === "complete") {
    if (tab.url && tab.url.startsWith("http")) {
      await sendStartData(tab);
      activeTabId = null;
    }
  }
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  if (lastTab && lastTab.id === tabId) {
    try {
      await sendEndData();
      lastTab = null;
    } catch (error) {
      console.error("Failed to end tab on close:", error);
    }
  }
});
