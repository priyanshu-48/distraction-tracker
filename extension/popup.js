(async () => {
  const [{ token, authState, queue = [] }, { tracking }] = await Promise.all([
    chrome.storage.local.get(["token", "authState", "queue"]),
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
})();
