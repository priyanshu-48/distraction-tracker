import logger from "../logger.js";
import { completeErasure, countPendingErasures, duePendingErasures, recordFailedErasure } from "../models/erasureModel.js";
import { getNotifier } from "./notifier.js";

/**
 * Asks the notification service to erase everything it holds about `userId`. The request itself was recorded in the same
 * statement that deleted the user's data (see accountModel.js), so a failure here loses nothing: the row stays and the
 * retry loop tries again. Returns true once the service confirmed.
 */
export async function eraseNow(userId, { notifier = getNotifier() } = {}) {
  if (!notifier.enabled) return false;
  if (await notifier.erase({ id: userId })) {
    await completeErasure(userId);
    return true;
  }
  await recordFailedErasure(userId);
  return false;
}

/** Retries every erasure that is still waiting. Returns how many were confirmed. */
export async function retryPendingErasures({ notifier = getNotifier() } = {}) {
  if (!notifier.enabled) return 0;
  let confirmed = 0;
  for (const userId of await duePendingErasures()) {
    if (await eraseNow(userId, { notifier })) confirmed += 1;
  }
  return confirmed;
}

/** Retries once at startup (a restart must not strand a request) and then every few minutes. */
export function startErasureRetries({ intervalMs = 5 * 60 * 1000, notifier = getNotifier(), log = logger } = {}) {
  if (!notifier.enabled) return null;
  const run = () =>
    retryPendingErasures({ notifier })
      .then(async (confirmed) => {
        const waiting = await countPendingErasures();
        if (confirmed || waiting) log.info({ confirmed, waiting }, "erasure requests for the notification service");
      })
      .catch((err) => log.warn({ err }, "retrying erasure requests failed"));
  run();
  return setInterval(run, intervalMs).unref();
}
