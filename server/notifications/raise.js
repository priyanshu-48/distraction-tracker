import { insertAlert } from "../models/alertModel.js";
import { getRecipient } from "../models/notificationSettingsModel.js";

/**
 * Records an alert and sends it, once. The alert row's unique key is the gate: only the call that inserts it goes on to
 * send, so two runs at once, a restart or a retry cannot raise the same alert twice. The row is also what the extension
 * shows as a Chrome notification, so that works even when the hosted service cannot be reached. The service gets the same
 * key as an idempotency key. Returns true when this call raised it, false when it had been raised already.
 */
export async function raiseAlert(userId, { dedupeKey, kind, title, body, channels }, notifier) {
  if ((await insertAlert(userId, { dedupeKey, kind, title, body })) === null) return false;
  const recipient = await getRecipient(userId);
  await notifier.send(
    { id: userId, email: recipient.email },
    { idempotencyKey: `tracker:${userId}:${dedupeKey}`, type: kind, title, body, ...(channels ? { channels } : {}) }
  );
  return true;
}
