(async () => {
  const [{ token, authState, queue = [], recordDetails }, { tracking }] = await Promise.all([
    chrome.storage.local.get(["token", "authState", "queue", "recordDetails"]),
    chrome.storage.session.get("tracking"),
  ]);

  let text, detail, cls;
  if (!token && authState === "logged_out") {
    [text, detail, cls] = ["Session expired", "Log in on the dashboard to reconnect.", "warn"];
  } else if (!token) {
    [text, detail, cls] = ["Not connected", "Log in on the dashboard to connect this extension.", "warn"];
  } else if (tracking) {
    [text, detail, cls] = ["Tracking", "", "ok"];
  } else {
    [text, detail, cls] = ["Connected", "Press Start Session on the dashboard to begin.", "ok"];
  }
  if (queue.length) detail = `${detail} ${queue.length} visit(s) waiting to upload.`.trim();

  const status = document.getElementById("status");
  status.textContent = text;
  status.className = cls;
  document.getElementById("detail").textContent = detail;

  // Privacy switch, on this device only: the dashboard cannot change it. Off means only the site is recorded.
  const details = document.getElementById("details");
  const hint = document.getElementById("details-hint");
  const describe = (on) => {
    hint.textContent = on
      ? "On: the full address and the page title are recorded for new visits."
      : "Off: only the site is recorded, never the page path, query or title.";
  };
  details.checked = recordDetails === true;
  describe(details.checked);
  details.addEventListener("change", async () => {
    await chrome.storage.local.set({ recordDetails: details.checked });
    describe(details.checked);
  });
})();
