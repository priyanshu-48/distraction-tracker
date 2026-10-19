(async () => {
  const [{ token, authState, queue = [], recordDetails, nudgesEnabled }, { tracking }] = await Promise.all([
    chrome.storage.local.get(["token", "authState", "queue", "recordDetails", "nudgesEnabled"]),
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

  // Also on this device only. On means: as a visit begins, the site name (never the address or title) goes to your server, which
  // decides whether to nudge. Now and then a nudge is skipped on purpose so the dashboard can show whether nudges help.
  const nudges = document.getElementById("nudges");
  const nudgesHint = document.getElementById("nudges-hint");
  const describeNudges = (on) => {
    nudgesHint.textContent = on
      ? "On: when you open a site, its name (never the address or title) is sent to your server. Now and then a nudge is skipped on purpose, to measure whether nudges help."
      : "Off: nothing is sent when you open a site.";
  };
  nudges.checked = nudgesEnabled === true;
  describeNudges(nudges.checked);
  nudges.addEventListener("change", async () => {
    await chrome.storage.local.set({ nudgesEnabled: nudges.checked });
    describeNudges(nudges.checked);
  });
})();
