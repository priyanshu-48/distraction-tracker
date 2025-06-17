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
      const response = await fetch("http://localhost:3000/api/start-tab",{
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(startData)
      });
      if(!response.ok){
        const errorText = await response.text();
        throw new Error(`HTTP error! ${response.status}: ${errorText}`);
      }

      lastTab = {
        url : tab.url,
        id : tab.id
      };
    }catch (err) {
      console.error("Failed to send tab data:", err);
  }
}

async function sendEndData(){
  try{
    const endData = {
      url: lastTab.url,
        endedAt: new Date().toISOString()
    };
    const response = await fetch("http://localhost:3000/api/end-tab",{
      method : "POST",
      headers : {
        "Content-Type": "application/json"
      },
      body : JSON.stringify(endData)
    });
    if(!response.ok){
        const errorText = await response.text();
        throw new Error(`HTTP error! ${response.status}: ${errorText}`);
    }}catch(err){
      console.error("Failed to end tab on close:",err);
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
